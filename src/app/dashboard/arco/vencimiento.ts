// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 5), MEDIO — "VENCEN PRONTO (≤ 5 DÍAS)" CONTABA SOLO LO
// QUE YA VENCIÓ. 5ª ronda.
//
// La línea era:
//
//     solicitudes.filter((s) => … && venceEn(s.venceEn) <= hoy)
//
// Comparación de strings `YYYY-MM-DD`, que para fechas ISO ordena bien — el
// problema no es la comparación, es el umbral: `<= hoy` no es "faltan 5 días
// o menos", es "el plazo YA se pasó". Con una solicitud que vence el 15-ago y
// hoy 12-ago (faltan 3 días, tiene que contar), `'2026-08-15' <= '2026-08-12'`
// es false y el KPI dice 0 bajo el rótulo "Vencen pronto (≤ 5 días)". Solo
// entra cuando ya se pasó el plazo, y en ese momento el rótulo es falso en la
// otra dirección.
//
// Consecuencia: el plazo de 20 días hábiles del art. 32 LFPDPPP se pasa sin
// que el tablero lo haya anunciado ni una vez. La flota es la responsable
// obligada y ésta es su única alarma.
//
// Vive aparte de `page.tsx` para poder fijarlo con una prueba: esa página es
// un Server Component asíncrono con sesión y server action adentro.
// ═══════════════════════════════════════════════════════════════════════════

/** Cuántos días de calendario faltan de `hoy` a `venceEn`. Negativo = ya
 *  venció. Las dos entradas son fechas `YYYY-MM-DD` (o un timestamp ISO, del
 *  que solo se toma la fecha): la aritmética va en UTC a propósito, para que
 *  no dependa de la zona del proceso — lo único que se mide son días de
 *  calendario, no instantes. */
export function diasParaVencer(venceEn: string, hoy: string): number {
  const dia = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  return Math.round((dia(venceEn) - dia(hoy)) / 86_400_000);
}

/** El umbral del rótulo. Si cambia el número, cambia en un solo sitio y el
 *  rótulo se arma con él (`page.tsx`), para que no puedan separarse. */
export const DIAS_AVISO = 5;

/**
 * Las solicitudes cuyo plazo se agota en `DIAS_AVISO` días o menos, LAS YA
 * VENCIDAS INCLUIDAS: una vencida no deja de ser urgente por haberse pasado,
 * y esconderla del contador la borraría de la única pantalla que la vigila.
 * El rótulo lo dice, y `page.tsx` publica aparte cuántas de ésas ya se pasaron.
 */
export function porVencer<T extends { venceEn: string }>(
  pendientes: T[], hoy: string, dias: number = DIAS_AVISO,
): T[] {
  return pendientes.filter((s) => diasParaVencer(s.venceEn, hoy) <= dias);
}

/** De las que ya se pasaron del plazo. Se cuenta aparte para poder decirlo en
 *  la nota del tile en vez de mezclarlo en la cifra sin avisar. */
export function vencidas<T extends { venceEn: string }>(pendientes: T[], hoy: string): T[] {
  return pendientes.filter((s) => diasParaVencer(s.venceEn, hoy) < 0);
}
