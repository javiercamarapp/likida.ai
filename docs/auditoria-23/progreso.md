# Progreso — auditoría 23 (31-ago-2026)

Una línea por acción, escrita **mientras** avanza. Si la ronda muere a la mitad,
esto es lo único que dice desde dónde reanudar.

| Hora | Acción | Resultado |
|---|---|---|
| — | `git status` al arrancar | **limpio** → autofix HABILITADO |
| — | Decisión de tamaño de ronda | `list_pull_requests(open)` = 6 PRs, **ninguno de auditoría** (5 dependabot/fix + 1 feat) · 5 commits en `src/`/`supabase/`/`normas/` desde `86813f4` → **RONDA COMPLETA** |
| — | Rama | `claude/auditoria-23` creada desde `master` = `c7c3d1c` |
| — | Anclaje previo | **SÍ disponible esta vez**: el PR #285 de la 22 se mergeó, `docs/auditoria-22/` vive en el clon. Las 12 notas previas son legibles → **esta ronda SÍ tiene delta** |
| — | `npm ci` | OK — 620 paquetes, 34 s |
| — | `npm test` (`npx vitest run`) | **VERDE** — 708 archivos, **9,995 pruebas**, 1 saltada, 106.95 s |
| — | `npx tsc --noEmit -p .` | **VERDE** — 0 errores |
| — | `npm run lint` (`npx eslint src/`) | **VERDE** — 0 errores, 165 advertencias |
| — | `npm run lint:ratchet` | **VERDE** — 165/166 heredadas, 0 nuevas, 0 errores (**añadido a la compuerta esta ronda**: su ausencia fue lo que hizo que la 22 declarara verde algo que CI vio rojo) |
| — | `docs/auditoria-23/MAPA.md` | escrito, con las 12 notas previas, los 13 commits de la 22 y los pendientes heredados |
| — | 12 auditores lanzados en paralelo, un mensaje | frontend · backend · agéntico · tool-calling · seguridad · fiscal · legal · arquitectura · pruebas · operabilidad · rendimiento · datos |
| — | Reportes recibidos (11/12) | frontend 7 · backend 7 · seguridad 6 · rendimiento 6 · arquitectura 5 · tool-calling 5 · datos 5 · legal 5 · agéntico 4 · operabilidad 4 · fiscal 4. **Falta pruebas** (corre mutación, es el más lento) |
| — | VERIF `SEG-1`/`LEG-C1`/`DATOS-C1` `0273:41` vs `0264:59` | **CONFIRMADO** — `set search_path = public, pg_catalog` sin `extensions`, y `digest()` sin calificar en `:70` y `:124`. **Tres auditores lo encontraron por caminos independientes** |
| — | VERIF `BE-1` `processor.ts:3478-3481` | **CONFIRMADO** — el registro sintético lleva `pdf_url`, que no lee nadie; `agentTools = parcial!` y el `find` de `:3737` exige `!t.error`, así que `guardado` queda `undefined` por construcción en ese camino |
| — | VERIF `BE-2` `processor.ts:919-931` | **CONFIRMADO** — `bandejasAbiertas()` devuelve el Map de módulo entero y `cerrarRafagasPorCorte` cierra las libretas de todos los choferes del proceso |
| — | VERIF `BE-3` `facturacion_escritura.ts:646-657` | **CONFIRMADO** — cuenta pagos y cancela en dos viajes sin nada que los serialice; `.in('estatus',…)` no ataja un abono parcial |
| — | VERIF `DATOS-C2` `0273:76` vs `conv.ts:373` | **CONFIRMADO** — `wa_conversacion.operador_id` no lo escribe NINGÚN escritor: `conv.ts:373` inserta sin él, y `asignar_wa.ts:190` y `despacho_wa.ts:133` lo excluyen del payload a propósito |
| — | VERIF `FIS-1` `engine.ts:594-595` vs `:148-152` | **CONFIRMADO** — la rama de FIS-C3 juzga `g.formaPago` crudo; su hermana `medioNoAdmitidoCombustible:156` sí excluye `'99'`. Y `medio_pago_lisr27.test.ts:49` afirmaba el bug |
| — | VERIF `REN-1` `oficina_wa.ts:93-99` vs `pg.ts:131-135` | **CONFIRMADO** — `traerTodo` sin `.order()`, contra un contrato escrito en mayúsculas |
| — | VERIF `OP-C1` el despliegue | **CONFIRMADO con `git log`** — último asunto con `[deploy]` = `86813f4`, hace 5 commits. El PR #285 de la 22 nunca se publicó |
| — | **Notificación al dueño** | enviada: producción corre `86813f4`, los 34 arreglos de la 22 sin desplegar; arreglo = Redeploy en Vercel |
| `8e8b17f` | SEG-1/LEG-C1/DATOS-C1 · mig. 0275 `alter function … set search_path` | prueba estática nueva (`arco_search_path.test.ts`) anclada a «la última definición», no a la 0273. Rojo→verde comprobado |
| — | Compuerta tras `8e8b17f` | 9,997 pruebas / 709 archivos · tsc 0 · lint 0 · **ratchet ROJO** (1 warning nuevo de `detect-non-literal-fs-filename`) → corregido con el `eslint-disable` razonado que el repo ya usa en 10 sitios. **Es el fallo exacto que tumbó el CI de la 22; esta vez se atrapó antes del commit** |
| `c4787f7` | FIS-1 · `'99'` no es un medio de pago | `formaPagoJuzgable` en `engine.ts`; 4 casos nuevos; se corrige la aserción de la 22 que afirmaba el bug. 10,000 pruebas verdes |
| `fd80af1` | REN-1 · `.order('id')` en la paginación del informe del jefe | arnés que emula el heap movido entre páginas; medido $112,475,000.00 impreso vs $112,575,000.00 reales. 10,002 pruebas verdes |
| — | **Tope de 3 vueltas alcanzado** | los CRÍTICOS restantes quedan PENDIENTES con su razón escrita en `00-SINTESIS.md` |
| — | `pruebas.md` **entregó tarde** | después de cerrar la ronda y abrir el PR #296 — el mismo rubro le hizo lo mismo a la 22, porque es el único que corre mutación de verdad. 27 mutaciones: 14 muertas, 13 vivas. Nota 7, sin moverse |
| — | VERIF `PRU-1` `correr-verificaciones.mjs:388-408` | **CONFIRMADO con el encuadre corregido.** No es descuido: el 23-ago `sin_calificar` pasó a ser falla, con trinquete nominal de 19 bloques y razón escrita en cada uno; uno nuevo sí falla. Lo grave es **cuáles**: `FINANZAS_RLS` (el aislamiento por rol sobre el dinero) está exento por el FORMATO de su mensaje. Corre, ataca, imprime la fuga, y el runner sale con 0 |
| — | PRU-1 **no se arregla** | exige Postgres para confirmar que el bloque califica y pasa, y el tope de 3 vueltas ya estaba agotado. Empujar a ciegas sobre una compuerta de seguridad es lo que esta rutina no hace |
| `db156c8` | Síntesis, tablero y RESULTADO actualizados con el rubro 12 | tablero recapturado y mirado: 12 rubros, PRU-1 en la tabla de críticos |
| — | **CI del PR #296** | **VERDE a la primera** — los 8 checks en `success` sobre `92f28fa`, `mergeable_state: clean`, 0 hilos de revisión. Incluido el job de migraciones contra Postgres real, que es el que tumbó a la 22 |
