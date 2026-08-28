import { describe, test, expect } from 'vitest';
import {
  validarLanzar, estadoFinalDe, resumenVeredicto, ESCENARIOS_VALIDOS,
  MAX_FOTOS_CARRIL_RAPIDO, TOPE_DIA_USD,
  validarVerdadTerreno, validarLoteOcr, MAX_FOTOS_OCR,
  CLAVES_VERDAD, NOMBRE_CLAVE_VERDAD,
  type FilaVeredicto,
} from './qa-tipos';
import { COMERCIOS } from '@/lib/likida/facturacion/comercios';

const FOTO = 'aaaaaaaa-0000-4000-8000-000000000001';
const BASE = {
  escenario: 'demo_guion',
  fotoIds: [FOTO],
  anticipo: 10_600,
  rfcEmpresa: 'GMX0902279I1',
  ruta: { origen: 'Silao', destino: 'Nuevo Laredo' },
  politica: [{ concepto: 'diesel', topeMonto: 4000 }],
  retencion: 'borrar_al_terminar',
};

describe('validarLanzar — el cliente no es frontera de confianza', () => {
  test('acepta el body bueno y normaliza', () => {
    const r = validarLanzar(BASE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos.escenario).toBe('demo_guion');
    expect(r.datos.params.anticipo).toBe(10_600);
    expect(r.datos.params.rfcEmpresa).toBe('GMX0902279I1');
    expect(r.datos.params.retencion).toBe('borrar_al_terminar');
  });

  test('rechaza un escenario que no está en el selector, y DICE cuántos faltan del catálogo', () => {
    const r = validarLanzar({ ...BASE, escenario: 'sobregiro' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/escenario desconocido/);
    expect(r.error).toMatch(/restantes del catálogo/);
  });

  test('los escenarios del selector SÍ pasan — la lista y el tipo no pueden divergir', () => {
    for (const id of ESCENARIOS_VALIDOS) {
      expect(validarLanzar({ ...BASE, escenario: id }).ok, id).toBe(true);
    }
  });

  test(`más de ${MAX_FOTOS_CARRIL_RAPIDO} fotos manda al carril completo — no entra al rápido`, () => {
    const muchas = Array.from({ length: MAX_FOTOS_CARRIL_RAPIDO + 1 }, (_, i) =>
      `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`);
    const r = validarLanzar({ ...BASE, fotoIds: muchas });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/carril completo/);
  });

  test('cero fotos, anticipo inválido y política vacía se rechazan', () => {
    expect(validarLanzar({ ...BASE, fotoIds: [] }).ok).toBe(false);
    expect(validarLanzar({ ...BASE, anticipo: 0 }).ok).toBe(false);
    expect(validarLanzar({ ...BASE, anticipo: NaN }).ok).toBe(false);
    expect(validarLanzar({ ...BASE, anticipo: -5 }).ok).toBe(false);
    expect(validarLanzar({ ...BASE, politica: [] }).ok).toBe(false);
    expect(validarLanzar({ ...BASE, politica: [{ concepto: '' }] }).ok).toBe(false);
  });

  test('un RFC con basura se normaliza; uno imposible se rechaza', () => {
    const r = validarLanzar({ ...BASE, rfcEmpresa: ' gmx-090227 9i1 ' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.datos.params.rfcEmpresa).toBe('GMX0902279I1');
    expect(validarLanzar({ ...BASE, rfcEmpresa: 'XX' }).ok).toBe(false);
  });

  test('retencion solo admite el dominio; cualquier otra cosa cae al default seguro (borrar)', () => {
    const r = validarLanzar({ ...BASE, retencion: 'para_siempre' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.datos.params.retencion).toBe('borrar_al_terminar');
  });

  test('fotoIds que no son uuid se rechazan (nada de rutas arbitrarias hacia Storage)', () => {
    expect(validarLanzar({ ...BASE, fotoIds: ['../../secreto'] }).ok).toBe(false);
  });
});

describe('estadoFinalDe — fallar cerrado', () => {
  const fila = (estado: FilaVeredicto['estado']): FilaVeredicto =>
    ({ invariante: '#1', oraculo: 'x', estado, severidad: 'CRÍTICO', esperado: 1, real: 1 });

  test('un fallo manda sobre todo lo demás', () => {
    expect(estadoFinalDe([fila('ok'), fila('no_verificado'), fila('fallo')])).toBe('fallo');
  });
  test('lo no verificado NO cuenta como pasó — es parcial', () => {
    expect(estadoFinalDe([fila('ok'), fila('no_verificado')])).toBe('parcial');
  });
  test('solo ok limpio es ok', () => {
    expect(estadoFinalDe([fila('ok'), fila('ok')])).toBe('ok');
  });
});

describe('resumenVeredicto', () => {
  test('cuenta por estado y respeta el null (sin veredicto ≠ 0/0/0)', () => {
    expect(resumenVeredicto(null)).toBeNull();
    const filas: FilaVeredicto[] = [
      { invariante: 'a', oraculo: 'a', estado: 'ok', severidad: '-', esperado: 0, real: 0 },
      { invariante: 'b', oraculo: 'b', estado: 'fallo', severidad: '-', esperado: 0, real: 0 },
      { invariante: 'c', oraculo: 'c', estado: 'no_verificado', severidad: '-', esperado: 0, real: 0 },
    ];
    expect(resumenVeredicto(filas)).toEqual({ ok: 1, noVerificado: 1, fallo: 1 });
  });
});

test('el tope diario es el del diseño (§6, default $5) — no un número inventado', () => {
  expect(TOPE_DIA_USD).toBe(5);
});

// ═══════════════════════════════════════════════════════════════════════════
// LA VERDAD-DE-TERRENO — lo que se fija aquí es el invariante del que depende
// que la medición del OCR signifique algo:
//
//   para cada ClaveVerdad, valor null ⟺ está en `ilegibles` XOR en `noAplica`.
//
// Los tres modos de romperlo se prueban uno por uno, porque los tres producen
// un JSON perfectamente válido y una medición equivocada:
//   · null sin clasificar        → "no se sabe por qué falta"
//   · en las DOS listas          → dos afirmaciones que se contradicen
//   · valor no-null pero listado → dice a la vez que se leyó y que no
// ═══════════════════════════════════════════════════════════════════════════

/** Una etiqueta COMPLETA y bien formada: todo leído, nada clasificado. */
const VERDAD_OK = {
  comercioClave: COMERCIOS[0].clave,
  emisor: 'Caminos y Puentes Federales',
  rfcEmisor: 'CPF890101AAA',
  folio: '000123',
  monto: 1234.5,
  fecha: '2026-07-31',
  sucursal: 'Caseta Palmillas',
  dominioFacturacion: 'facturacioncapufe.com.mx',
  ilegibles: [] as string[],
  noAplica: [] as string[],
  clase: 'ticket',
  notas: null,
};

describe('validarVerdadTerreno — la vara con la que se mide el OCR', () => {
  test('acepta la etiqueta completa y normaliza el RFC y el monto', () => {
    const r = validarVerdadTerreno({ ...VERDAD_OK, rfcEmisor: 'cpf-890101-aaa', monto: 1234.499 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos.rfcEmisor).toBe('CPF890101AAA');
    expect(r.datos.monto).toBe(1234.5);
    expect(r.datos.clase).toBe('ticket');
  });

  test('MODO 1 — un null SIN clasificar se rechaza, y dice cuál y qué hacer', () => {
    const r = validarVerdadTerreno({ ...VERDAD_OK, folio: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/folio/);
    expect(r.error).toMatch(/ilegibles/);
    expect(r.error).toMatch(/noAplica/);
  });

  test('MODO 2 — la misma clave en las DOS listas se rechaza: son afirmaciones opuestas', () => {
    const r = validarVerdadTerreno({
      ...VERDAD_OK, folio: null, ilegibles: ['folio'], noAplica: ['folio'],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/ilegibles/);
    expect(r.error).toMatch(/noAplica/);
    expect(r.error).toMatch(/las dos cosas no/);
  });

  test('MODO 3 — un valor no-null listado como ilegible se rechaza (o se leyó, o no)', () => {
    const r = validarVerdadTerreno({ ...VERDAD_OK, ilegibles: ['folio'] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/folio/);
    expect(r.error).toMatch(/tiene valor/);
  });

  test('un null BIEN clasificado pasa — y las dos clasificaciones son distintas entre sí', () => {
    const ilegible = validarVerdadTerreno({ ...VERDAD_OK, folio: null, ilegibles: ['folio'] });
    expect(ilegible.ok).toBe(true);
    const noAplica = validarVerdadTerreno({ ...VERDAD_OK, rfcEmisor: null, noAplica: ['rfcEmisor'] });
    expect(noAplica.ok).toBe(true);
    if (!ilegible.ok || !noAplica.ok) return;
    expect(ilegible.datos.ilegibles).toEqual(['folio']);
    expect(noAplica.datos.noAplica).toEqual(['rfcEmisor']);
  });

  test('comercioClave null es un HALLAZGO válido; una clave inventada NO', () => {
    const fuera = validarVerdadTerreno({ ...VERDAD_OK, comercioClave: null });
    expect(fuera.ok).toBe(true);
    if (fuera.ok) expect(fuera.datos.comercioClave).toBeNull();

    const inventada = validarVerdadTerreno({ ...VERDAD_OK, comercioClave: 'no-existe-en-el-catalogo' });
    expect(inventada.ok).toBe(false);
    if (!inventada.ok) expect(inventada.error).toMatch(/COMERCIOS/);
  });

  test('una cadena vacía NO es un null: se rechaza en vez de colarse como dato', () => {
    const r = validarVerdadTerreno({ ...VERDAD_OK, emisor: '   ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/vacía/);
  });

  test('monto 0 se rechaza — un comprobante no ampara cero y sería indistinguible del null', () => {
    expect(validarVerdadTerreno({ ...VERDAD_OK, monto: 0 }).ok).toBe(false);
    expect(validarVerdadTerreno({ ...VERDAD_OK, monto: -5 }).ok).toBe(false);
  });

  test('una fecha que no existe se rechaza (el 31 de abril no rueda al 1 de mayo)', () => {
    const r = validarVerdadTerreno({ ...VERDAD_OK, fecha: '2026-04-31' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/fecha/);
    // Y el formato del ticket (dd/mm/yyyy) tampoco: la etiqueta se teclea en ISO.
    expect(validarVerdadTerreno({ ...VERDAD_OK, fecha: '31/07/2026' }).ok).toBe(false);
  });

  test('una clase desconocida y una clave desconocida se rechazan diciendo el catálogo', () => {
    const clase = validarVerdadTerreno({ ...VERDAD_OK, clase: 'servilleta' });
    expect(clase.ok).toBe(false);
    if (!clase.ok) expect(clase.error).toMatch(/voucher_bancario/);

    const clave = validarVerdadTerreno({ ...VERDAD_OK, ilegibles: ['iva'] });
    expect(clave.ok).toBe(false);
    if (!clave.ok) expect(clave.error).toMatch(/no es un campo medible/);
  });

  test('una clave repetida en la misma lista se rechaza — delata una edición a medias', () => {
    const r = validarVerdadTerreno({ ...VERDAD_OK, folio: null, ilegibles: ['folio', 'folio'] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/dos veces/);
  });

  test('las listas AUSENTES se rechazan: ausente no es lo mismo que vacía', () => {
    const sinListas = { ...VERDAD_OK } as Record<string, unknown>;
    delete sinListas.ilegibles;
    const r = validarVerdadTerreno(sinListas);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ilegibles/);
  });

  test('un no-objeto se rechaza sin reventar', () => {
    expect(validarVerdadTerreno(null).ok).toBe(false);
    expect(validarVerdadTerreno('ticket').ok).toBe(false);
    expect(validarVerdadTerreno([VERDAD_OK]).ok).toBe(false);
  });

  test('CLAVES_VERDAD y NOMBRE_CLAVE_VERDAD cubren exactamente lo mismo', () => {
    expect(CLAVES_VERDAD).toHaveLength(7);
    expect(Object.keys(NOMBRE_CLAVE_VERDAD).sort()).toEqual([...CLAVES_VERDAD].sort());
  });
});

describe('validarLoteOcr — el botón de correr el OCR', () => {
  const otra = 'aaaaaaaa-0000-4000-8000-000000000002';

  test('acepta uuids y DEDUPLICA (la misma foto dos veces se cobraría dos veces)', () => {
    const r = validarLoteOcr({ fotoIds: [FOTO, otra, FOTO] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fotoIds).toEqual([FOTO, otra]);
  });

  test('lista vacía, no-uuid y body inválido se rechazan con motivo', () => {
    expect(validarLoteOcr({ fotoIds: [] }).ok).toBe(false);
    expect(validarLoteOcr({ fotoIds: ['no-soy-uuid'] }).ok).toBe(false);
    expect(validarLoteOcr(null).ok).toBe(false);
  });

  test('pasarse del tope lo DICE con el número, no falla en silencio', () => {
    const muchas = Array.from({ length: MAX_FOTOS_OCR + 1 }, (_, i) =>
      `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`);
    const r = validarLoteOcr({ fotoIds: muchas });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(String(MAX_FOTOS_OCR));
      expect(r.error).toMatch(String(MAX_FOTOS_OCR + 1));
    }
  });
});
