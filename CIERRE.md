# CIERRE — constructor `agentes` (auditoría 24)

Progreso incremental. Se actualiza cada 2-3 hallazgos.

| ID | Estado | Archivos | Pruebas nuevas | Commits |
|---|---|---|---|---|
| AGB-1 | CERRADO | `enviador.ts`, `enviador.test.ts` | `ventanaRevisionMin` (default 24h, piso 1h), `autoaprobarActivo` (default no), candado de profundidad sobre `pendiente`, `anotarSiCambioElMaestro` (bitácora) | `fbd61472` |
| AGB-2 | CERRADO | `cola.ts`, `redactor.ts`, `sdr.ts` + tests | `TRACCION_PUBLICABLE` vacía, `verificarFormatoCampana` rechaza nombres cazados | `7285599a` |
