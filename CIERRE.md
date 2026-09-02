# CIERRE — constructor `agentes` (auditoría 24)

Progreso incremental. Se actualiza cada 2-3 hallazgos.

| ID | Estado | Archivos | Pruebas nuevas | Commits |
|---|---|---|---|---|
| AGB-1 | CERRADO | `enviador.ts`, `enviador.test.ts` | `ventanaRevisionMin` (default 24h, piso 1h), `autoaprobarActivo` (default no), candado de profundidad sobre `pendiente`, `anotarSiCambioElMaestro` (bitácora) | `fbd61472` |
| AGB-2 | CERRADO | `cola.ts`, `redactor.ts`, `sdr.ts` + tests | `TRACCION_PUBLICABLE` vacía, `verificarFormatoCampana` rechaza nombres cazados | `7285599a` |
| AGB-3 | CERRADO | `investigador.ts` (cursor keyset), `enviador.ts`, `runner.ts` + tests | cursor que avanza en `candidatosSinDossier`; filtro `correo not null` en enviador/loteRedactor | `82ea7cc7` |
| AGB-6 | CERRADO | `redactor.ts` + tests | `pasaCompuertaIcp` (SCIAN 48-49 / fuente vetada / similitud≥60), fail closed antes del modelo | `82ea7cc7` |
| AGB-4 | CERRADO | `cola.ts`, `forma-pieza.tsx` + tests | `TIPOS_ENVIABLES`, `aprobadasSinEnviar` filtra, `enviarPiezaPorCorreo` rechaza, botón oculto en UI | `037a021a` |
| AGB-5 | CERRADO | `runner.ts` + tests | Candado 5: `motivoBandejaGlobalSinAtender` (tope 40 o pieza > 7 días = vencimiento), memoizado por vuelta, exime a los 4 de dirección/enviador/enriquecedor | `b6179243` |
| AGB-9 | PARCIAL | `sdr.ts` + tests | `fabricarSeguimiento` propaga `noMedido`; `costoUsd` pegajoso (null). **Diferido**: `investigador.ts:455` (enriquecedor) bloqueado — `generateStructured` (`src/lib/llm/openrouter.ts`, fuera de mis archivos) no expone `noMedido` como sí lo hace `generateResponse`. Diff propuesto en el commit `6d3a47d2`. | `6d3a47d2` |
| AGB-10 | CERRADO | `exito.ts`, `finanzas.ts` + tests | `leerFlotas`/`leerSuscripcionesActivas` excluyen `nombre ilike 'ZZZ QA %'` | `c7775083` |
| AGB-11 | CERRADO | `runner.ts` + tests | `loteRedactor` corta a los 3 fallos del modelo SEGUIDOS (no guardas), `alertarOperador`, motivo explícito | `eddc4a0f` |
| AGB-8 | CERRADO | `exito.ts` + tests | `leerValorDelMes` sobre `traerTodo` (sin tope de 2,000, LANZA si no demuestra completitud); 4+2 lecturas por flota en `Promise.all` en vez de serie | `b8f5aeb1` |
| Agentes teatro | CERRADO | migración `0301`, `verificaciones.sql` bloque 248, `runner.ts` + tests | Columna `agente_definicion.experimental`; los 9 (cazador, seo_distribucion, guiones, noticias_mercado, promos_diarias, visuales, video_demo, video_marketing, pruebas) quedan `true`; Candado 2 del runner los salta con motivo explícito | (pendiente de commit) |
| AGB-7 | DIFERIDO | — | Mi lado (`correrRunner` acepta `venceEn`) ya estaba correcto antes de esta auditoría. El fix real es en `src/lib/agents/copiloto-acciones.ts` (línea ~166, `await correrRunner(soloAgente)` sin `venceEn` ni `conRelojDuro`) y `src/app/api/admin/copiloto/route.ts` — ninguno de los dos está en mis archivos. Diff propuesto (5 líneas): en `copiloto-acciones.ts`, cambiar `await correrRunner(soloAgente)` por `await correrRunner(soloAgente, tenantId, { venceEn: Date.now() + 45_000 })` envuelto en `conRelojDuro(...)` (ya exportado por `runner.ts`); agregar un candado de vuelta-en-curso (SET NX, TTL 300s) dentro de `correrRunner` mismo si se quiere cerrar también la carrera con el cron — eso sí lo puedo hacer yo, pero requeriría infra (Redis/`ratelimit.ts`, no mío) o una migración nueva (sin cupo). Sin tocar. |
