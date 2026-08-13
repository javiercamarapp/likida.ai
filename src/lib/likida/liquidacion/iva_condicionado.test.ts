// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 5), MEDIO M8 — "IVA ACREDITABLE (LIVA ART. 5)" ERA EL
// ÚNICO RENGLÓN DEL PDF EN VERDE Y SIN UN SOLO PIE, SOBRE UNA FICHA CUYA
// TRANSCRIPCIÓN **TERMINA EN LA FRACCIÓN II** Y QUE DECLARA ESE HUECO COMO
// RIESGO.
//
// `acreditable.ts:20-21` define los tonos: `bueno` = «cifra que el motor
// sostiene entera»; `condicionado` = «depende de algo que el motor NO verifica,
// y el pie dice de qué».
//
// `normas/liva-5.yaml` transcribe la fr. I (`:12-24`) y la fr. II (`:26-28`) y
// se corta ahí. Y lo dice ella misma, en `riesgo_actual:47-50`:
//
//   «El motor acredita el IVA leído del XML de todo gasto que no cayó en
//    SIN_ACREDITAMIENTO. **Si el artículo exige alguna condición adicional que
//    hoy no se valida, la cifra impresa está de más.** Es una cifra que el
//    contralor usa.»
//
// y en `verificado_por:51`: «NINGÚN contador público ha revisado esta ficha: la
// transcripción es de fuente primaria, la INTERPRETACIÓN no está dictaminada».
//
// Con $41,300 de IVA en una liquidación de agosto, el PDF imprimía
// "IVA acreditable (LIVA art. 5): $41,300.00" con el MISMO tono con el que
// imprime "Deducible para ISR", y el contralor lo pasaba a su declaración del
// mes. La regla que el archivo se puso en su propio encabezado —«si el motor no
// puede sostenerla entera, el renglón tiene que decir qué parte no sostiene»—
// se cumplía en dos de los tres renglones y se rompía justo en el que trae más
// pesos.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { filasAcreditables, NOTA_IVA_ACREDITABLE } from './acreditable';

const fila = (ivaAcreditable: number) => filasAcreditables({
  ivaAcreditable, peajeAcreditable: 0, litrosDieselAcreditables: 0,
})!.filas.find((f) => f.label.includes('IVA'))!;

describe('M8 · el renglón del IVA declara lo que el motor no verifica', () => {
  it('NO se pinta como cifra sostenida entera', () => {
    expect(
      fila(41300).tono,
      'el tono es parte de la afirmación: verde dice "el motor sostiene esta cifra entera", '
      + 'y la ficha de LIVA 5 declara por escrito que no sabe si el artículo pide más',
    ).toBe('condicionado');
  });

  it('lleva su pie PEGADO al renglón, no un descargo genérico al final', () => {
    const f = fila(41300);
    expect(f.pies.length, 'un renglón condicionado sin pie no dice de qué depende').toBeGreaterThan(0);
    expect(f.pies).toContain(NOTA_IVA_ACREDITABLE);
    expect(f.valor).toBe('$41,300.00');
  });

  it('el pie dice QUÉ comprueba Likida y que el artículo exige más', () => {
    // Los dos requisitos que el motor sí verifica son exactamente los dos que la
    // ficha transcribe: la fr. I (deducible para ISR, y en su proporción) y la
    // fr. II (trasladado y desglosado en el CFDI).
    expect(NOTA_IVA_ACREDITABLE).toMatch(/fr\. I\b/);
    expect(NOTA_IVA_ACREDITABLE).toMatch(/fr\. II\b/);
    expect(NOTA_IVA_ACREDITABLE).toMatch(/deducible/i);
    expect(NOTA_IVA_ACREDITABLE).toMatch(/desglosad/i);
    // Y lo que NO: el hueco que la ficha declara.
    expect(NOTA_IVA_ACREDITABLE).toMatch(/no.{0,20}verifica|no.{0,20}comprueba/i);
    // Sin inventar cuáles son: la ficha se corta en la fr. II y este papel no
    // puede citar una fracción que nadie transcribió.
    expect(NOTA_IVA_ACREDITABLE).not.toMatch(/fr\. III|fracción III/);
  });

  it('el PDF pinta en VERDE solo lo que viene con tono bueno — y ya nada del IVA lo lleva', () => {
    // El color lo decide `pdf.ts` a partir del tono, no del label. Si alguien
    // volviera a pintar el IVA de verde tendría que pasar por `tono`.
    const src = readFileSync(new URL('./pdf.ts', import.meta.url), 'utf8');
    expect(src).toContain("f.tono === 'bueno' ? GREEN : INK");
    expect(filasAcreditables({ ivaAcreditable: 41300, peajeAcreditable: 500, litrosDieselAcreditables: 200 })!
      .filas.filter((f) => f.tono === 'bueno')).toEqual([]);
  });
});
