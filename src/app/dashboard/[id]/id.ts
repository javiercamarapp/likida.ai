/**
 * ¿Este segmento de ruta puede ser el id de una liquidación?
 *
 * AUDITORÍA 17 (pase 4), ALTO. `2be4b1c` y `003c88a` borraron 18 carpetas de
 * `/dashboard` (`viajes`, `cuadre`, `contador`, `operadores`…) para rehacerlas.
 * Next hace que esas URLs empaten ahora con el segmento dinámico `[id]`, así
 * que el segmento llega crudo a `.eq('id', 'viajes')` sobre una columna `uuid`
 * y Postgres contesta `22P02 invalid input syntax for type uuid`. Como
 * `exigir()` falla CERRADO —y tiene que seguir haciéndolo—, el usuario que
 * abre un marcador viejo no ve un 404: ve la pantalla de error.
 *
 * POR QUÉ AQUÍ Y NO EN `analytics.ts`. Se intentó allá primero y fue la capa
 * equivocada por dos razones. Una de diseño: qué forma tiene un segmento de URL
 * es una pregunta de ruteo, y el acceso a datos no debería contestarla. Y una
 * que la suite señaló sola: con la guarda en `getLiquidacionDetalle`, el caso
 * "la base se cayó y esto DEBE lanzar" se volvía inalcanzable para cualquier id
 * que no fuera uuid, y quince pruebas de `analytics.test.ts` —incluida la del
 * fail-closed— dejaban de probar lo que dicen.
 *
 * No se afloja `exigir()` tampoco: `22P02` es "lo que pediste no tiene forma de
 * id" y `08006` es "la base se cayó". Taparlas con el mismo `catch` es
 * exactamente el bug que `exigir()` existe para impedir.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esIdDeLiquidacion(segmento: string): boolean {
  return UUID.test(segmento);
}
