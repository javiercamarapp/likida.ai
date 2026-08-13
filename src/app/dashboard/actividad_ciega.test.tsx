import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { Actividad } from './actividad';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 5), ALTO — "AÚN NO HAY VIAJES REGISTRADOS" CON LA
// CONSULTA CAÍDA.
//
//     page.tsx:  porMes={viajesPorMes ?? []}
//     actividad: const sinDatos = porMes.every((d) => d.valor === 0)
//
// `getViajesPorMes` sale de `safe()`, que convierte cualquier fallo en `null`.
// El `?? []` lo aplana a arreglo vacío, `sinDatos` sale `true`, y la sección
// "Actividad" en modo Histórico afirma "Aún no hay viajes registrados." sobre
// una flota con 340 viajes. Y no hay aviso de degradación: `estadoPanel` solo
// vigila cuatro consultas (`estado.ts`), y ésta no es una de ellas — la rama
// 'parcial' no se dispara y la pantalla se ve íntegra.
//
// Es la afirmación más fuerte que el panel puede hacer sobre el negocio del
// cliente, emitida estando ciego. La misma clase de fallo que `estado.ts:10-12`
// documenta querer impedir.
//
// El componente SÍ se puede renderizar (no es async, no toca Supabase), así
// que esto mide el texto que sale, no la forma del código.
// ═══════════════════════════════════════════════════════════════════════════

describe('Actividad no puede afirmar "no hay viajes" cuando no pudo leer', () => {
  it('EL BUG (histórico): con `porMes={null}` dice que no se pudo leer, no que no haya viajes', () => {
    const html = renderToStaticMarkup(<Actividad viajes={[]} porMes={null} modo="historico" />);
    expect(html).not.toContain('Aún no hay viajes registrados');
    expect(html).toMatch(/No se pudo/i);
  });

  it('EL BUG (semanal/mensual): con `viajes={null}` tampoco afirma el vacío', () => {
    for (const modo of ['semanal', 'mensual'] as const) {
      const html = renderToStaticMarkup(<Actividad viajes={null} porMes={[]} modo={modo} />);
      expect(html, modo).not.toContain('Sin viajes iniciados');
      expect(html, modo).toMatch(/No se pudo/i);
    }
  });

  it('CONTROL: un histórico que de verdad viene vacío SÍ dice que no hay viajes', () => {
    // El arreglo no puede ser "nunca decir vacío": una flota nueva tiene que
    // poder leerlo. Lo que cambia es que ahora se distinguen.
    const html = renderToStaticMarkup(
      <Actividad viajes={[]} porMes={[{ dia: '2026-07', valor: 0 }]} modo="historico" />,
    );
    expect(html).toContain('Aún no hay viajes registrados');
  });

  it('CONTROL: con datos reales sigue pintando la gráfica', () => {
    const html = renderToStaticMarkup(
      <Actividad viajes={[]} porMes={[{ dia: '2026-06', valor: 3 }, { dia: '2026-07', valor: 5 }]} modo="historico" />,
    );
    expect(html).toContain('<svg');
    expect(html).not.toContain('Aún no hay viajes registrados');
  });
});

describe('el llamador deja de aplanar la consulta caída', () => {
  const fuente = readFileSync('src/app/dashboard/page.tsx', 'utf8').replace(/\/\/.*$/gm, '');

  it('EL BUG: `page.tsx` no le pasa `?? []` a PanelPeriodo', () => {
    // Con el `??` puesto, el componente de arriba nunca llega a ver el null y
    // el arreglo de `Actividad` sería inalcanzable.
    expect(fuente).not.toMatch(/porMes=\{viajesPorMes\s*\?\?\s*\[\]\}/);
    expect(fuente).not.toMatch(/viajes=\{viajes\s*\?\?\s*\[\]\}/);
  });
});
