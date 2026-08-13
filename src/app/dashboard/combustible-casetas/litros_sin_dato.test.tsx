import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { Fuel } from 'lucide-react';
import { KpiTile } from '../../admin/ui/kit';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 5), ALTO — "LITROS ELEGIBLES PARA EL ESTÍMULO: 0.00 L"
// CON LA CITA DE LA LIF AL LADO, CUANDO LA CONSULTA SE CAYÓ. 5ª ronda.
//
//     valor={acred?.litrosDiesel ?? 0}   nota="LIF 2026, Art. 20-A"
//
// `acred` sale de `safe(() => getAcreditables(...))`, que convierte CUALQUIER
// fallo en `null`. El `?? 0` aplana ese null y la flota que comprobó 4,200 L
// de diésel ese mes lee "0.00 L" bajo un artículo de ley. La consulta vecina
// (`porConcepto`) sí tiene su rama de error; `acred` es otra y no la comparte,
// así que la sección se pinta "sana" con un cero inventado adentro.
//
// El arreglo copia el que ya cerró el mismo bug en el KPI de Ahorro del Resumen
// (`ahorro_sin_dato.test.ts`, pase 3): `KpiDegradado` aceptó `number | null` y
// pinta '—'. `KpiTile` —el tile del resto del panel— seguía exigiendo `number`,
// así que el llamador no tenía forma de decir "no se pudo leer" sin inventar
// un cero. Aquí se cierran las dos mitades: la pieza (el tile sabe pintar el
// dato ausente) y el llamador (deja de aplanarlo).
//
// POR QUÉ LA SEGUNDA MITAD MIRA LA FUENTE: `combustible-casetas/page.tsx` es un
// Server Component asíncrono con seis consultas a Supabase en el cuerpo;
// montarlo en vitest exigiría un doble de media base. Mismo instrumento y misma
// justificación que `ahorro_sin_dato.test.ts:29-34`.
// ═══════════════════════════════════════════════════════════════════════════

const ICONO = <Fuel width={15} height={15} strokeWidth={1.75} />;

describe('KpiTile sabe pintar el dato ausente, no un cero', () => {
  it('EL BUG (la pieza): con `valor={null}` el tile pinta —, nunca "0 L"', () => {
    const html = renderToStaticMarkup(
      <KpiTile icono={ICONO} etiqueta="Litros elegibles para el estímulo" valor={null} formato="litros" />,
    );
    expect(html).toContain('—');
    expect(html).not.toContain('>0 L<');
  });

  it('CONTROL: un cero MEDIDO se sigue pintando como cero', () => {
    // El arreglo no puede ser "nunca mostrar 0": una flota que de verdad no
    // cargó un litro tiene que poder decirlo. Mismo criterio que
    // `kit.test.tsx` fijó para el bug del count-up.
    const html = renderToStaticMarkup(
      <KpiTile icono={ICONO} etiqueta="Litros elegibles para el estímulo" valor={0} formato="litros" />,
    );
    expect(html).toContain('>0 L<');
  });
});

describe('el tile de litros de Combustible & Casetas no aplana la consulta caída', () => {
  const fuente = readFileSync('src/app/dashboard/combustible-casetas/page.tsx', 'utf8');

  /** El bloque del `<KpiTile>` de litros, sin comentarios (la prosa que
   *  explica el arreglo cita la forma prohibida). Mismo recorte que
   *  `ahorro_sin_dato.test.ts`. */
  function bloqueDeLitros(): string {
    const lineas = fuente.split('\n');
    const i = lineas.findIndex((l) => /etiqueta="Litros elegibles para el estímulo"/.test(l));
    expect(i, 'el tile de litros ya no está en la página — actualiza esta prueba').toBeGreaterThan(-1);
    // Hacia arriba hasta el `<KpiTile`, hacia abajo hasta el cierre.
    const ini = lineas.slice(0, i + 1).map((l, n) => ({ l, n })).reverse().find((x) => x.l.includes('<KpiTile'))!.n;
    const fin = lineas.findIndex((l, n) => n >= i && l.includes('/>'));
    return lineas.slice(ini, fin + 1).join('\n').replace(/\/\/.*$/gm, '');
  }

  it('EL BUG: el valor del tile no se aplana con `?? 0`', () => {
    expect(bloqueDeLitros()).not.toMatch(/\?\?\s*0\b/);
  });

  it('y dice en pantalla que no se pudo leer, no que sean cero litros', () => {
    // El tile vecino (`pctSinCfdi`) ya usa `vacio=` para exactamente esto.
    expect(bloqueDeLitros()).toMatch(/vacio=\{acred === null/);
  });
});
