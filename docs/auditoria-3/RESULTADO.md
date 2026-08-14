PARCIAL: los 12 rubros auditados y calificados, tablero mirado, pero 10 de los 11 críticos quedan PENDIENTES con su escenario escrito (se cerró 1, FE-C1, con prueba que ancla). Los altos y medios quedan propuestos.

Global 5.7 → 5.3 (−0.4). Compuerta verde sobre el árbol final: npm test 3,182 verdes / tsc limpio / eslint 0 errores. `npm run build` no aplica en la nube.

Qué faltó y por qué: con 11 críticos sobre la mesa se prefirió cerrar uno de verdad —prueba que reproduce, arreglo, prueba verde, suite completa, commit atómico— antes que dejar cinco a medias. El pase 1 de esta misma ronda dio 6 críticos por cerrados sin ancla real, y este pase encontró cuatro de esas rutas todavía abiertas: repetir ese patrón habría costado más de lo que valía.

CI de GitHub rojo por umbrales de cobertura (lines 59.80% vs 67%): PREEXISTENTE en master (59.37%), medido en las dos puntas. Esta rama sube 3 de las 4 métricas. No se arregla aquí — son ~7 puntos de cobertura sobre media docena de subsistemas.
