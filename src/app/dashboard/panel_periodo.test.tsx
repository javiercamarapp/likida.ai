import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PanelPeriodo } from './panel-periodo';
import { ETIQUETA_MODO } from './periodo';
import type { SeriesKpiCards, GastoSemanalSeries, LiquidadoSemanalSeries, TopRutasSeries } from '@/lib/likida/analytics';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 5), DOS MEDIOS DEL MISMO ARCHIVO.
//
// (1) UN PILL GOBIERNA CINCO VENTANAS DE TIEMPO Y NINGUNA SECCIÓN LA ROTULA.
// El contralor deja el pill en "Histórico", baja a "Liquidado", ve
// $2,840,500.00 y lo cita como el mes: el pill quedó cinco secciones arriba,
// fuera del scroll. Que hay una forma correcta lo prueban las tarjetas de al
// lado, que sí imprimen la ventana bajo cada cifra.
//
// (2) "AÚN NO HAY GASTOS CAPTURADOS" CON LA CONSULTA CAÍDA.
// `gastoModo && …some(v > 0)` colapsaba `null` (la consulta murió) y `[]` (de
// verdad no hay) en el mismo texto. Sus DOS hermanas del mismo archivo —
// "Liquidado" y "Top rutas"— ya los distinguían.
//
// El componente es cliente pero no toca el DOM en el primer render, así que
// `renderToStaticMarkup` da exactamente el HTML servido, con el modo inicial
// ('semanal'). Lo que se mide es el texto que sale.
// ═══════════════════════════════════════════════════════════════════════════

const SERIES_KPI: SeriesKpiCards = {
  semanal: [{ desde: '2026-08-06', hasta: '2026-08-12', gastoTotal: 1, totalViajes: 2, costoPorViaje: 0.5, liquidado: 1, viajesLiquidados: 1 }],
  mensual: [{ desde: '2026-07-14', hasta: '2026-08-12', gastoTotal: 1, totalViajes: 2, costoPorViaje: 0.5, liquidado: 1, viajesLiquidados: 1 }],
  historico: [{ desde: '2020-01-01', hasta: '2026-08-12', gastoTotal: 1, totalViajes: 2, costoPorViaje: 0.5, liquidado: 1, viajesLiquidados: 1 }],
};
const UNA_SERIE = { categorias: ['2026-S32'], series: [{ nombre: 'diesel', valores: [1000] }] };
const GASTO: GastoSemanalSeries = { semanal: UNA_SERIE, mensual: UNA_SERIE, historico: UNA_SERIE };
const LIQ: LiquidadoSemanalSeries = {
  semanal: [{ dia: '2026-S32', valor: 2_840_500 }],
  mensual: [{ dia: '2026-08', valor: 2_840_500 }],
  historico: [{ dia: '2026', valor: 2_840_500 }],
};
const RUTAS: TopRutasSeries = { semanal: [], mensual: [], historico: [] };

function pintar(extra: Partial<Parameters<typeof PanelPeriodo>[0]> = {}) {
  return renderToStaticMarkup(
    <PanelPeriodo
      viajes={[]} porMes={[]} seriesKpis={SERIES_KPI}
      gastoSemanalSeries={GASTO} liquidadoSemanalSeries={LIQ} topRutasSeries={RUTAS}
      {...extra}
    />,
  );
}

describe('cada sección dice de qué ventana de tiempo habla', () => {
  it('EL BUG: los cinco títulos llevan la ventana, no solo el pill de arriba', () => {
    const html = pintar();
    const ventana = ETIQUETA_MODO.semanal; // el modo inicial
    for (const titulo of ['Viajes', 'Actividad', 'Gasto por categoría', 'Liquidado', 'Top rutas por gasto']) {
      expect(html, `"${titulo}" no dice de qué periodo habla`).toContain(`${titulo} — ${ventana}`);
    }
  });

  it('la cifra grande de "Liquidado" —la que se copia al correo— también la lleva', () => {
    const html = pintar();
    const i = html.indexOf('2,840,500');
    expect(i, 'no se pintó la cifra de Liquidado').toBeGreaterThan(-1);
    // La ventana va inmediatamente después de la cifra, no cinco secciones arriba.
    expect(html.slice(i, i + 300)).toContain(ETIQUETA_MODO.semanal);
  });
});

describe('"Aún no hay gastos capturados" solo cuando de verdad no hay', () => {
  it('EL BUG: con la consulta caída se dice que falló, no que no haya gastos', () => {
    const html = pintar({ gastoSemanalSeries: null });
    expect(html).not.toContain('Aún no hay gastos capturados');
    expect(html).toMatch(/No se pudo cargar esta gráfica/);
  });

  it('CONTROL: un periodo REALMENTE sin gastos sí lo dice', () => {
    const vacia = { categorias: ['2026-S32'], series: [{ nombre: 'diesel', valores: [0] }] };
    const html = pintar({ gastoSemanalSeries: { semanal: vacia, mensual: vacia, historico: vacia } });
    expect(html).toContain('Aún no hay gastos capturados');
  });

  it('CONTROL: con datos reales se pinta la gráfica', () => {
    expect(pintar()).toContain('2026-S32');
  });
});
