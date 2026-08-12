import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { esIdDeLiquidacion } from './[id]/id';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 4), ALTO — `/dashboard/[id]` se traga las 18 rutas que
// `2be4b1c` y `003c88a` borraron, y las contesta con la pantalla de error.
//
// `/dashboard/viajes`, `/dashboard/cuadre`, `/dashboard/contador`… ya no
// existen como carpeta, así que Next las hace empatar con el segmento dinámico
// `[id]`. El segmento llegaba crudo a `.eq('id', 'viajes')` contra una columna
// `uuid`: Postgres devuelve `22P02 invalid input syntax for type uuid`, y
// `exigir()` —que falla CERRADO a propósito— lo convierte en excepción. El
// usuario no ve un 404: ve el error boundary.
//
// Por qué duele hoy y no antes: hasta ayer esas 18 rutas resolvían a su propia
// página. Cada marcador, cada URL pegada en un WhatsApp y cada link viejo del
// demo apunta ahí. Es un modo de falla que el borrado ESTRENÓ.
//
// SE PRUEBA LA REGLA **Y** EL CABLEADO. Un `esIdDeLiquidacion('viajes') ===
// false` no prueba nada por sí solo: el bug no era la regla, era que nadie la
// llamaba. Así que el último caso lee el CÓDIGO FUENTE de la página y exige que
// la guarda esté ANTES de la consulta — mismo patrón que
// `dashboard/tablero-operacion.test.tsx`. Sin eso esto sería el "arnés que
// aparenta" que esta misma auditoría lleva tres pases señalando.
// ═══════════════════════════════════════════════════════════════════════════

/** Las 18 carpetas que dejaron de existir y que ahora caen en `[id]`. */
const BORRADAS = [
  'viajes', 'unidades', 'operadores', 'mapa', 'pod', 'incidencias',
  'documentos', 'facturacion', 'rentabilidad', 'valor-ahorro', 'cotizador',
  'cuadre', 'despacho', 'clientes', 'cobranza', 'analitica', 'chat',
  'contador',
];

const UUID_REAL = '3f8a1c2e-0b4d-4e7a-9c11-2d5e6f7a8b90';

describe('el segmento de /dashboard/[id] se descarta antes de tocar la base', () => {
  it.each(BORRADAS)('/dashboard/%s no tiene forma de id', (seg) => {
    expect(esIdDeLiquidacion(seg)).toBe(false);
  });

  it('un uuid real sí pasa — la guarda no apaga la página', () => {
    expect(esIdDeLiquidacion(UUID_REAL)).toBe(true);
    expect(esIdDeLiquidacion(UUID_REAL.toUpperCase())).toBe(true);
  });

  it('un uuid truncado o con basura pegada no pasa', () => {
    expect(esIdDeLiquidacion(UUID_REAL.slice(0, 20))).toBe(false);
    expect(esIdDeLiquidacion(`${UUID_REAL}/../otro`)).toBe(false);
    expect(esIdDeLiquidacion('')).toBe(false);
  });

  it('la página llama la guarda ANTES de consultar la liquidación', () => {
    // El bug no era la regla, era que nadie la llamaba. Si alguien mueve esta
    // línea debajo de la consulta, el `22P02` vuelve y esta prueba se pone roja.
    const src = readFileSync('src/app/dashboard/[id]/page.tsx', 'utf8');
    const guarda = src.indexOf('esIdDeLiquidacion(id)');
    const consulta = src.indexOf('getLiquidacionDetalle(id');
    expect(guarda, 'la página no llama esIdDeLiquidacion').toBeGreaterThan(-1);
    expect(consulta, 'la página no llama getLiquidacionDetalle').toBeGreaterThan(-1);
    expect(guarda, 'la guarda quedó DESPUÉS de la consulta: el 22P02 vuelve').toBeLessThan(consulta);
    expect(src.slice(guarda, consulta)).toContain('notFound()');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 5), ALTO — lo de arriba fija DÓNDE se llama la guarda, no
// EN QUÉ SENTIDO decide.
//
// El auditor de backend lo midió: cambiando `page.tsx:62` de
// `if (!esIdDeLiquidacion(id)) notFound()` a `if (esIdDeLiquidacion(id))
// notFound()`, los 21 casos de arriba SIGUEN VERDES —la guarda se sigue
// llamando antes de la consulta y `notFound()` sigue estando entre las dos—
// mientras TODA liquidación real contesta 404. Es la pantalla que el demo
// abre para enseñar el renglón por renglón y el botón de PDF.
//
// Una prueba que sobrevive a la inversión total de la condición que protege es
// decoración. Estos dos casos no leen el código: EJECUTAN la página y miran si
// la consulta ocurrió. Con la guarda invertida, el segundo se pone rojo.
// ═══════════════════════════════════════════════════════════════════════════

import { vi } from 'vitest';

const NOT_FOUND = new Error('NEXT_NOT_FOUND');

const getLiquidacionDetalle = vi.fn(async () => null);

vi.mock('next/navigation', () => ({
  notFound: () => { throw NOT_FOUND; },
  redirect: (a: string) => { throw new Error(`NEXT_REDIRECT:${a}`); },
}));
vi.mock('@/lib/auth/guard', () => ({
  requireSessionTenant: async () => ({ tenantId: 'tenant-demo', rol: 'flota_admin' }),
}));
vi.mock('@/lib/auth/visibilidad', () => ({
  rolEfectivo: (real: string) => real,
  puedeVerArea: () => true,
  inicioDe: () => '/dashboard',
}));
vi.mock('@/lib/likida/analytics', () => ({ getLiquidacionDetalle }));

const { default: Detalle } = await import('./[id]/page');

const abrir = (id: string) => Detalle({
  params: Promise.resolve({ id }),
  searchParams: Promise.resolve({}),
});

describe('la guarda decide en el sentido correcto — se ejecuta la página', () => {
  beforeEach(() => getLiquidacionDetalle.mockClear());

  it('un segmento borrado da 404 SIN haber tocado la base', async () => {
    await expect(abrir('viajes')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(
      getLiquidacionDetalle,
      'la página consultó la base con un segmento que no es uuid: vuelve el 22P02',
    ).not.toHaveBeenCalled();
  });

  it('un uuid real SÍ llega a la consulta — la guarda no está invertida', async () => {
    // Este es el caso que la versión anterior de esta prueba no cubría.
    // `getLiquidacionDetalle` devuelve null, así que la página termina en 404
    // igual; lo que se afirma NO es el resultado, es que la consulta OCURRIÓ.
    await expect(abrir(UUID_REAL)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(
      getLiquidacionDetalle,
      'la guarda mandó a 404 un uuid válido: con la condición invertida, TODA '
      + 'liquidación real da 404 y el demo no puede abrir ni una',
    ).toHaveBeenCalledWith(UUID_REAL, 'tenant-demo');
  });
});
