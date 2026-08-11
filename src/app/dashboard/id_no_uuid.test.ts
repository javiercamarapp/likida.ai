import { describe, it, expect } from 'vitest';
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
