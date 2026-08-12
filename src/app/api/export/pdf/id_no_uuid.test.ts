import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { esIdDeLiquidacion } from '@/app/dashboard/[id]/id';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 5), ALTO — la MISMA forma que `58c44f9` arregló en la
// página seguía abierta en la ruta que entrega el PDF.
//
// `/api/export/pdf/[id]` recibe el segmento crudo y lo manda a
// `.eq('id', id)` sobre una columna `uuid`. Con cualquier cosa que no tenga
// forma de uuid —`/api/export/pdf/viajes`, un marcador viejo, un dedazo—
// Postgres contesta `22P02 invalid input syntax for type uuid`, la ruta entra
// por su rama de `error` y devuelve **500** con "No se pudo leer la
// liquidación. Intenta de nuevo en un momento."
//
// Dos daños, y el segundo es el que molesta:
//   1. El mensaje MIENTE. Invita a reintentar algo que nunca va a funcionar,
//      porque no es un fallo transitorio: es una URL que no existe.
//   2. Ensucia el canal de errores. `logger.error('export.pdf.lectura')` marca
//      como incidente de base de datos lo que es un 404 — y ese es justo el
//      log que alguien mira a las 3 de la mañana cuando algo SÍ se rompió.
//
// El pase 4 arregló esta forma en `/dashboard/[id]` y la ruta se quedó fuera.
// Se reusa `esIdDeLiquidacion` a propósito, en vez de copiar el regex: dos
// definiciones de "qué es un id" es exactamente la divergencia que el rubro de
// arquitectura lleva rondas señalando.
//
// SE PRUEBA LA REGLA **Y** EL CABLEADO, y en el sentido correcto — la lección
// del otro arreglo de este mismo pase: una guarda invertida dejaría la suite
// verde y ningún PDF se podría bajar.
// ═══════════════════════════════════════════════════════════════════════════

const RUTA = 'src/app/api/export/pdf/[id]/route.ts';
const UUID_REAL = '3f8a1c2e-0b4d-4e7a-9c11-2d5e6f7a8b90';

describe('la ruta del PDF descarta un id sin forma antes de tocar la base', () => {
  it('la ruta llama la guarda ANTES de consultar `liquidacion`', () => {
    const src = readFileSync(RUTA, 'utf8');
    const guarda = src.indexOf('esIdDeLiquidacion(id)');
    const consulta = src.indexOf(".from('liquidacion')");
    expect(guarda, 'la ruta no llama esIdDeLiquidacion').toBeGreaterThan(-1);
    expect(consulta, 'la ruta ya no consulta `liquidacion`').toBeGreaterThan(-1);
    expect(guarda, 'la guarda quedó DESPUÉS de la consulta: el 22P02 vuelve').toBeLessThan(consulta);
  });

  it('la guarda decide en el sentido correcto y contesta 404, no 500', () => {
    const src = readFileSync(RUTA, 'utf8');
    const guarda = src.indexOf('esIdDeLiquidacion(id)');
    const consulta = src.indexOf(".from('liquidacion')");
    const bloque = src.slice(guarda - 40, consulta);
    // Invertida (`if (esIdDeLiquidacion(id)) return 404`) ningún PDF se bajaría
    // y la suite seguiría verde si solo mirásemos que la guarda "está".
    expect(bloque, 'la guarda no está negada: así rechaza los uuid buenos')
      .toMatch(/!\s*esIdDeLiquidacion\(id\)/);
    expect(bloque, 'el id sin forma no sale con 404').toContain('404');
  });

  it('no vuelve a definir qué es un id: reusa la guarda de la página', () => {
    const src = readFileSync(RUTA, 'utf8');
    expect(src, 'la ruta no importa esIdDeLiquidacion').toMatch(/import\s*\{[^}]*esIdDeLiquidacion/);
    expect(src, 'la ruta se copió el regex de uuid en vez de reusar la guarda')
      .not.toMatch(/\[0-9a-f\]\{8\}/i);
  });

  it('la regla sigue siendo la misma que la de la página', () => {
    expect(esIdDeLiquidacion('viajes')).toBe(false);
    expect(esIdDeLiquidacion('')).toBe(false);
    expect(esIdDeLiquidacion(`${UUID_REAL}/../otro`)).toBe(false);
    expect(esIdDeLiquidacion(UUID_REAL)).toBe(true);
  });
});
