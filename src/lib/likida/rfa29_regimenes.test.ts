import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { REGIMENES_ELEGIBLES_RFA_2_9 } from './administracion';

// ═══════════════════════════════════════════════════════════════════════════
// LA ELEGIBILIDAD DEL 15% SE DERIVABA DE LA CLAVE SAT EQUIVOCADA. 15-AGO-2026.
//
// FI-C1, reincidente por tercera ronda. `crearFlota` decidía la elegibilidad de
// la facilidad de la RFA 2026 regla 2.9 con la lista `['601','612']`, y el alta
// de /admin etiquetaba el 601 como «General de Ley PM (coordinados)».
//
// La ficha `normas/rfa-2026-2.9.yaml` está `verificado_fuente_primaria` y su
// texto exige tributar «conforme al Título II, Capítulo VII o Título IV,
// Capítulo II, Sección I de la Ley del ISR». En el catálogo `c_RegimenFiscal`:
//
//   Título II, Capítulo VII            → 624, Coordinados
//   Título IV, Capítulo II, Sección I  → 612, PF con act. empresariales
//
// El 601 es «General de Ley Personas Morales»: una PM del Título II en
// general, NO un coordinado del Capítulo VII. El error corría en las dos
// direcciones y las dos cuestan dinero real:
//
//   - Una PM 601 cualquiera declaraba "exclusivamente carga" y el producto le
//     escribía `regimenElegible: true`. El motor le deduce diésel pagado en
//     efectivo hasta el 15% del ejercicio y el PDF lo imprime citando la regla.
//     El contador lo ve en la primera revisión: la facilidad no le aplicaba.
//   - Un coordinado de verdad (624) NO podía capturarse — la clave ni existía
//     en el `<select>` del alta —, así que el único régimen al que la regla le
//     habla de frente quedaba fuera con `regimenElegible: false`.
//
// Esta prueba ata la lista contra el TEXTO de la ficha, no contra mi memoria:
// si alguien vuelve a meter el 601, o si la ficha cambia de régimen en una
// reforma, esto se pone rojo con la línea de la norma en el mensaje.
// ═══════════════════════════════════════════════════════════════════════════

const FICHA = new URL('../../../normas/rfa-2026-2.9.yaml', import.meta.url);

describe('RFA 2026 regla 2.9 — los regímenes elegibles contra la ficha', () => {
  const yaml = readFileSync(FICHA, 'utf8');

  it('la ficha sigue siendo la fuente verificada que esta regla cita', () => {
    // Si se degrada el estado de verificación, la afirmación del producto deja
    // de tener respaldo y el número no se puede seguir imprimiendo igual.
    expect(yaml).toContain('estado_verificacion: verificado_fuente_primaria');
    expect(yaml).toMatch(/Título II,?\s*\n?\s*Capítulo VII/);
  });

  it('624 (Coordinados) es elegible: es el Título II Capítulo VII de la ficha', () => {
    expect(
      REGIMENES_ELEGIBLES_RFA_2_9,
      'la ficha exige "Título II, Capítulo VII" y ese es el régimen 624, ' +
        'Coordinados. Sin él, el único régimen al que la regla le habla de ' +
        'frente queda fuera de la facilidad.',
    ).toContain('624');
  });

  it('612 (PF con actividades empresariales) es elegible', () => {
    expect(
      REGIMENES_ELEGIBLES_RFA_2_9,
      'la ficha admite "Título IV, Capítulo II, Sección I" = 612.',
    ).toContain('612');
  });

  it('601 (General de Ley PM) NO es elegible: no es un coordinado', () => {
    expect(
      REGIMENES_ELEGIBLES_RFA_2_9,
      'el 601 es "General de Ley Personas Morales" — Título II en general, no ' +
        'el Capítulo VII que la regla acota. Con el 601 aquí, una PM que no es ' +
        'coordinado recibe regimenElegible:true y el motor le deduce diésel en ' +
        'efectivo citando una regla que no le aplica.',
    ).not.toContain('601');
  });

  it('no se cuela ningún régimen que la ficha no nombre', () => {
    expect([...REGIMENES_ELEGIBLES_RFA_2_9].sort()).toEqual(['612', '624']);
  });
});
