# Progreso — auditoría 22 (30-ago-2026)

Una línea por acción, escrita **mientras** avanza. Si la ronda muere a la mitad,
esto es lo único que dice desde dónde reanudar.

| Hora | Acción | Resultado |
|---|---|---|
| — | `git status` al arrancar | **limpio** → autofix HABILITADO |
| — | Decisión de tamaño de ronda | `list_pull_requests(open)` = `[]` (sin PR de auditoría abierto) + 43 commits en `src/`/`supabase/`/`normas/` desde `2296057` → **RONDA COMPLETA** |
| — | Rama | `claude/auditoria-22` creada desde `master` = `86813f4` |
| — | `npm ci` | OK |
| — | `npm test` | **VERDE** — 697 archivos, 9,918 pruebas, 1 saltada, 86.7 s |
| — | `npx tsc --noEmit -p .` | **VERDE** — 0 errores |
| — | `npm run lint` | **VERDE** — 0 errores, 166 advertencias |
| — | `docs/auditoria-22/MAPA.md` | escrito |
| — | Anclaje previo | **NO disponible**: `.gitignore` ignora `docs/auditoria-*/`; la síntesis de la 21 vive fuera del clon. Notas previas = `s/d`, línea base nueva |
| — | 12 auditores lanzados en paralelo | frontend · backend · agéntico · tool-calling · seguridad · fiscal · legal · arquitectura · pruebas · operabilidad · rendimiento · datos |
| — | Reportes recibidos (7/12) | frontend 7 · backend 7 · tool-calling 6 · agéntico 5 · seguridad — · fiscal 4 · legal 5 · operabilidad 5 |
| — | VERIF `FE-1` `facturacion/page.tsx:85` | **CONFIRMADO** — `if (!error && data)` descarta el error, `clientes=[]`, la UI acusa «no tienes clientes» |
| — | VERIF `TC-1` `cuadre/guardia.ts:87-102` | **CONFIRMADO** — con solo `estado_viaje`, `cuadro=false` y `consultoPolitica=false`: el bloque nunca corre y el texto se sustituye siempre |
| — | VERIF `OP-1` watchdog de producción | **CONFIRMADO con API de GitHub** — 20/20 corridas más recientes de `salud-produccion.yml` en `failure`, incl. la programada 2026-08-30T08:25Z |
| — | VERIF `LEG-2` `privacidad.ts:644` vs `0198:46` | **CONFIRMADO** — el aviso niega datos de salud; `incidencia.hay_lesionados` + texto crudo los persisten |
| — | VERIF `FIS-1` `poliza.ts:66-115` | **CONFIRMADO** — `LiquidacionParaPoliza` no tiene campo de deducibilidad; `export/poliza/route.ts:195` tampoco lo pasa |
| — | Notificación al dueño | enviada: watchdog de producción rojo (CRÍTICO de operabilidad) |
| — | **PETICIÓN DEL DUEÑO** | «corrige todos los altos críticos altos todos» → se levanta el tope de 3 vueltas de la skill |
| `61b45b3` | FIS-C3 tope LISR 27-III contra la lista cerrada | tipo `medio_pago_no_admitido`, 15 pruebas |
| `8c585ad` | FIS-C2 la RFA 2.9 niega el IEPS, no el IVA | lista partida en SIN_IVA_ACREDITABLE / SIN_ESTIMULO |
| `75a5ac0` | FIS-C1 la póliza sabe qué es deducible | mig. 0272 + `cubetaDe` en la ruta |
| `89a6b60` | FIS-A1 descuento y retención | retenciones cableadas de punta a punta (columnas de la 0063, huérfanas desde entonces) |
| `02d7837` | LEG-C2 + A1 + A2 + A3 | el aviso declara los cuatro tratamientos |
| `df7725b` | LEG-A4 ARCO alcanza el texto libre | mig. 0273 + bloque 221 |
| `5b64259` | LEG-C1 no se trata antes de avisar | compuerta en `derivar.ts`, `sinAvisoPrevio` al latido |
| `75afd55` | OP-C1 + A1 + A2 + A3 | tercer estado `config_ausente`, `if: always()`, folio fiscal entero, dedup por incidente |
| `936fad2` | REN-C2 + A1 + A2 | `traerTodo` en jornada, orden descendente, tope y costo en WhatsApp |
| `e7fb20e` | AGEN-C1 + A1 + A2 | la base es la autoridad, margen crítico, cierre de ráfaga por corte |
| `28b34da` | BE-1 + BE-2 + BE-3 | controles C1, rutas de PDF reiniciadas, export que no miente |
| `ccb683c` | DATOS-1 + ARQ-2 + TC-A2 | mig. 0274 + bloque 222, costo no medido pegajoso, veto ampliado |
| `d3ce510` | PRU-C1 + A1 + A2 + A3 | el export de póliza ejecutado, dos tautológicas cerradas, cola y estadías probadas |
| — | Compuerta final | **9,995 pruebas en 708 archivos, verdes** · tsc 0 · lint 0 errores |
| — | Recalificación | **NO se hizo, a propósito**: puntuar mis propios arreglos sin auditoría fresca sería la nota inventada que esta rutina existe para evitar. Insumo de la ronda 23 |
