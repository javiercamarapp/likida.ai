# CIERRE — constructor `agentes` (auditoría 24)

Progreso incremental. Se actualiza cada 2-3 hallazgos.

| ID | Estado | Archivos | Pruebas nuevas | Commits |
|---|---|---|---|---|
| AGB-1 | CERRADO | `enviador.ts`, `enviador.test.ts` | `ventanaRevisionMin` (default 24h, piso 1h), `autoaprobarActivo` (default no), candado de profundidad sobre `pendiente`, `anotarSiCambioElMaestro` (bitácora) | `fbd61472` |
| AGB-2 | CERRADO | `cola.ts`, `redactor.ts`, `sdr.ts` + tests | `TRACCION_PUBLICABLE` vacía, `verificarFormatoCampana` rechaza nombres cazados | `7285599a` |
| AGB-3 | CERRADO | `investigador.ts` (cursor keyset), `enviador.ts`, `runner.ts` + tests | cursor que avanza en `candidatosSinDossier`; filtro `correo not null` en enviador/loteRedactor | `82ea7cc7` |
| AGB-6 | CERRADO | `redactor.ts` + tests | `pasaCompuertaIcp` (SCIAN 48-49 / fuente vetada / similitud≥60), fail closed antes del modelo | `82ea7cc7` |
| AGB-4 | CERRADO | `cola.ts`, `forma-pieza.tsx` + tests | `TIPOS_ENVIABLES`, `aprobadasSinEnviar` filtra, `enviarPiezaPorCorreo` rechaza, botón oculto en UI | `037a021a` |
