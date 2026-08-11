import { describe, it, expect, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// LOS DATOS FISCALES SE VALIDAN ANTES DE COBRAR, NO DESPUÉS.
//
// En México el cobro NO cierra la operación: la cierra el CFDI 4.0 timbrado, y
// eso lo emite un PAC, no Stripe. El CFDI exige del receptor cinco datos, y
// todos se validan aquí porque el momento de descubrir que están mal es el
// único barato.
//
// EL MODO DE FALLA ES DE ORDEN, no de excepción: si se cobra primero y se
// valida después, ya tienes el dinero de una flota a la que no le puedes
// facturar, y su contador no tiene con qué deducir la mensualidad. Eso no se
// arregla con un reintento; se arregla devolviendo dinero.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync } from 'node:fs';

/**
 * Las claves que el CHECK de la columna acepta HOY, leídas de la última
 * migración que redefine ese dominio. Las migraciones corren en orden de
 * número, así que la última que lo toca es la vigente.
 */
function dominioVigente(columna: 'regimen_fiscal' | 'uso_cfdi'): string[] {
  const dir = 'supabase/migrations';
  // Los comentarios `--` del bloque traen paréntesis ("(Titulo II general)"),
  // así que se quitan ANTES de recortar: si no, el recorte termina dentro de
  // un comentario y el dominio sale de una sola clave.
  const re = new RegExp(
    `add constraint tenant_${columna}_dominio\\s+check \\(\\s*${columna} is null or ${columna} in \\(([\\s\\S]*?)\\)\\s*\\)\\s*;`,
    'i',
  );
  let ultimo: string[] | null = null;
  for (const f of readdirSync(dir).sort()) {
    const sql = readFileSync(`${dir}/${f}`, 'utf8').replace(/--[^\n]*/g, '');
    const m = sql.match(re);
    if (m) ultimo = [...m[1].matchAll(/'([A-Z0-9]+)'/g)].map((x) => x[1]);
  }
  if (!ultimo) throw new Error(`ninguna migración define tenant_${columna}_dominio`);
  return ultimo;
}

const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({ from: () => ({ update }) }),
}));

const { guardarDatosFiscales, estanCompletos, REGIMENES, USOS_CFDI } = await import('./fiscal');

// RFC con dígito verificador VÁLIDO, el mismo que ya usan las pruebas de CFDI
// del repo. No inventado: uno inventado casi nunca pasa el verificador.
const RFC_OK = 'GMX0902279I1';

const BASE = {
  rfc: RFC_OK,
  razonSocial: 'FLOTA DEMO SA DE CV',
  regimenFiscal: '601',
  codigoPostal: '97000',
  usoCfdi: 'G03',
};

describe('estanCompletos — se puede facturar o no, no hay a medias', () => {
  it('los cinco datos', () => {
    expect(estanCompletos({
      rfc: RFC_OK, razonSocial: 'X SA', regimenFiscal: '601', codigoPostal: '97000', usoCfdi: 'G03',
    })).toBe(true);
  });

  it('falta uno y NO se puede facturar', () => {
    expect(estanCompletos({
      rfc: RFC_OK, razonSocial: 'X SA', regimenFiscal: '601', codigoPostal: null, usoCfdi: 'G03',
    })).toBe(false);
    expect(estanCompletos(null)).toBe(false);
  });
});

describe('guardarDatosFiscales', () => {
  beforeEach(() => update.mockClear());

  it('guarda los cinco, con el RFC normalizado a mayúsculas', async () => {
    await guardarDatosFiscales('t-1', { ...BASE, rfc: ' gmx0902279i1 ' });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      rfc: RFC_OK,
      regimen_fiscal: '601',
      codigo_postal_fiscal: '97000',
      uso_cfdi: 'G03',
    }));
  });

  it('RECHAZA un RFC con dígito verificador malo', async () => {
    // El costo aquí es peor que en el alta: el PAC rechaza el timbrado cuando
    // ya hay pagos cobrados.
    await expect(guardarDatosFiscales('t-1', { ...BASE, rfc: 'GMX0902279I9' }))
      .rejects.toThrow(/dígito verificador/);
    expect(update).not.toHaveBeenCalled();
  });

  it('NO recorta ni "arregla" la razón social más allá de espacios', async () => {
    // El SAT la compara contra lo registrado para ese RFC. Nosotros no sabemos
    // mejor que su Constancia de Situación Fiscal.
    await guardarDatosFiscales('t-1', { ...BASE, razonSocial: '  Flota Demo S.A. de C.V.  ' });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      razon_social: 'Flota Demo S.A. de C.V.',
    }));
  });

  it('rechaza un código postal que no sean 5 dígitos', async () => {
    await expect(guardarDatosFiscales('t-1', { ...BASE, codigoPostal: '9700' })).rejects.toThrow(/5 dígitos/);
    await expect(guardarDatosFiscales('t-1', { ...BASE, codigoPostal: 'CP970' })).rejects.toThrow(/5 dígitos/);
  });

  it('rechaza claves fuera del catálogo del SAT', async () => {
    // Una clave inventada la rechaza el PAC, o peor: la acepta y emite un
    // comprobante que el contador del cliente no puede usar.
    await expect(guardarDatosFiscales('t-1', { ...BASE, regimenFiscal: '999' })).rejects.toThrow(/régimen fiscal/);
    await expect(guardarDatosFiscales('t-1', { ...BASE, usoCfdi: 'ZZZ' })).rejects.toThrow(/uso de CFDI/);
  });

  it('los catálogos que ofrece la pantalla son los que la base acepta', () => {
    // Si divergen, el formulario ofrece una opción que el insert rechaza — o,
    // al revés, la base acepta una clave que la pantalla no deja capturar.
    //
    // SE LEE EL CHECK VIVO, NO UNA COPIA. Hasta la auditoría 17 (pase 4) esta
    // prueba comparaba contra la lista de la 0056 escrita a mano aquí, y por
    // eso NO se enteró de que la `0088` (arreglo del CRÍTICO fiscal C3) agregó
    // `624` al dominio: la base llevaba días aceptando un régimen que la
    // pantalla no ofrecía, con el CHECK y el catálogo divergidos y la prueba
    // que los vigila en verde. Congelar una lista es congelar la fecha en que
    // dejó de ser cierta.
    //
    // ES SUBCONJUNTO, NO IGUALDAD, y esa es la dirección que importa: lo que
    // rompe es ofrecer una opción que el insert rechaza. Al revés no —
    // `uso_cfdi` acepta `S01` ("sin efectos fiscales, público en general") y la
    // pantalla NO lo ofrece a propósito: una flota que deduce su suscripción
    // nunca lo quiere, y ofrecerlo sería invitarla a un CFDI que su contador no
    // puede usar. Exigir igualdad obligaría a ofrecerlo.
    const regimenesDeLaBase = new Set(dominioVigente('regimen_fiscal'));
    const usosDeLaBase = new Set(dominioVigente('uso_cfdi'));
    expect(
      REGIMENES.map((r) => r.clave as string).filter((c) => !regimenesDeLaBase.has(c)),
      'la pantalla ofrece regímenes que el CHECK de la base rechaza',
    ).toEqual([]);
    expect(
      USOS_CFDI.map((u) => u.clave as string).filter((c) => !usosDeLaBase.has(c)),
      'la pantalla ofrece usos de CFDI que el CHECK de la base rechaza',
    ).toEqual([]);
  });
});
