import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 3), ALTO AGRAVADO — "AHORRO GENERADO" INVENTABA UN CERO.
//
// El pase 2 arregló el cero-que-parece-medición en la MISMA fila del grid
// (`e47b124`: `KpiDegradado` pasó a aceptar `number | null` y a pintar '—'), y
// dejó sin tocar el llamador que está dos celdas a la derecha:
//
//     valor={resumenPerdidas?.montoRecuperable ?? 0}
//
// `resumenPerdidas` es `null` exactamente cuando `cfgFiscal` o `gastosFiscales`
// vinieron nulos (`page.tsx:128-130`), y esos dos salen de `safe(...)`, que se
// come el fallo de la consulta. O sea: el `?? 0` NO cubre "la flota no ha
// ahorrado nada" — cubre "no se pudo leer". Con el motor fiscal caído, el panel
// del dueño pinta
//
//     Ahorro generado — Ejercicio 2026     $0.00
//
// en el KPI que ES el diferenciador del producto, sin una banda de aviso al
// lado. El contralor lee que Likida no le ahorró un peso en todo el ejercicio y
// no tiene forma de saber que lo que falló fue una consulta.
//
// Es la primera regla del CLAUDE.md ("nunca inventar una cifra… ni ceros que
// parezcan medición"), y el arreglo del pase 2 ya dejó puesta la única pieza
// que hacía falta: `KpiDegradado` sabe pintar '—' desde `resumen-visual.tsx:126`.
//
// POR QUÉ ESTA PRUEBA MIRA LA FUENTE Y NO EL RENDER: `page.tsx` es un Server
// Component que resuelve nueve consultas contra Supabase en el módulo; montarlo
// en vitest exigiría un doble de media base. La prohibición sobre el código es
// el mismo instrumento que este repo ya usa para la regla de formato
// (`formato.test.ts:223` falla si aparece `toLocaleString('es-MX')` fuera de
// `formato.ts`), y ancla exactamente lo que se rompió.
//
// ALCANCE DELIBERADO: esta prueba cubre el KPI de Ahorro del Resumen del dueño,
// que es el hallazgo. Hay otros doce `valor={… ?? 0}` en el panel; están
// anotados como hallazgo propio del pase 3 y NO se tocan aquí — un arreglo que
// se sale de su alcance es la causa documentada de PRs rechazados.
// ═══════════════════════════════════════════════════════════════════════════

const fuente = readFileSync('src/app/dashboard/page.tsx', 'utf8');

/**
 * La línea del KPI de Ahorro, con las dos que la siguen (el JSX va partido).
 *
 * Se ancla en la PROP `etiqueta={`, no en el texto suelto: "Ahorro generado"
 * aparece antes en un comentario de la misma página, y buscar la primera
 * ocurrencia hacía que la prueba leyera prosa y pasara sin mirar el código.
 */
function bloqueDelAhorro(): string {
  const lineas = fuente.split('\n');
  const i = lineas.findIndex((l) => /etiqueta=\{`Ahorro generado/.test(l));
  expect(i, 'el KPI "Ahorro generado" ya no está en page.tsx — actualiza esta prueba').toBeGreaterThan(-1);
  // Hasta el cierre del elemento, no un número fijo de líneas: el JSX va
  // partido y un comentario en medio corría la ventana fuera del `valor=`.
  const fin = lineas.findIndex((l, n) => n >= i && l.includes('/>'));
  expect(fin, 'no se encontró el cierre del <KpiDegradado> de Ahorro').toBeGreaterThan(-1);
  // Sin comentarios: la prosa que EXPLICA el arreglo cita la forma prohibida,
  // y una prueba que lee comentarios se dispara con su propia documentación.
  // Mismo recorte que `sinComentarios` en `formato.test.ts`.
  return lineas.slice(i, fin + 1).join('\n').replace(/\/\/.*$/gm, '');
}

describe('"Ahorro generado" distingue el cero medido del dato ausente', () => {
  it('EL BUG: el valor del KPI no se aplana con `?? 0`', () => {
    // Sin el arreglo esto es rojo: el bloque contiene `?? 0`.
    expect(bloqueDelAhorro()).not.toMatch(/\?\?\s*0/);
  });

  it('el valor se pasa tal cual, dejando que `KpiDegradado` decida qué pintar', () => {
    // `resumenPerdidas?.montoRecuperable` ya es `number | undefined`; lo único
    // que hace falta es NO taparlo. Se acepta `?? null` explícito o el
    // encadenamiento opcional pelado.
    const bloque = bloqueDelAhorro();
    expect(bloque).toMatch(/valor=\{resumenPerdidas\?\.montoRecuperable(\s*\?\?\s*null)?\s*\}/);
  });

  it('CONTROL: `KpiDegradado` sí sabe pintar el dato ausente', () => {
    // Si esto se rompiera, pasar null dejaría de ser el arreglo y habría que
    // repensarlo. Ancla la pieza de la que depende el cambio de arriba.
    const visual = readFileSync('src/app/dashboard/resumen-visual.tsx', 'utf8');
    expect(visual).toMatch(/valor:\s*number\s*\|\s*null/);
    expect(visual).toContain("valor === null ? '—'");
  });
});
