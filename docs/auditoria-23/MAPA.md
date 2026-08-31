# MAPA — auditoría 23 (31-ago-2026)

Ronda **COMPLETA**, desatendida, **en la nube** (routine de Claude Code). Rama
`claude/auditoria-23` sobre `master` = `c7c3d1c`. Árbol **limpio** al arrancar →
autofix HABILITADO.

## Anclaje: esta vez SÍ hay síntesis previa

Cambio importante respecto de la ronda 22: **el PR #285 de la auditoría 22 se
mergeó a `master`**, así que `docs/auditoria-22/` vive en este clon y sus doce
notas son legibles. La ronda 22 tuvo que calificar en frío («línea base nueva»,
sin delta). **La 23 sí tiene delta.**

Y hay una razón extra por la que el delta de hoy importa: la 22 cerró **34
hallazgos CRÍTICOS y ALTOS en 13 commits** y **NO se recalificó a sí misma, a
propósito** — dejó escrito que puntuar sus propios arreglos sin auditoría fresca
sería la nota inventada que esta rutina existe para evitar. **Esos 34 arreglos
son el insumo principal de esta ronda.** El código que la 22 tocó es el más
sospechoso de hoy, y verificar si sus arreglos aguantan una mirada fresca es el
trabajo de más valor de la 23.

## Notas previas (auditoría 22, 30-ago-2026) — global **6.1**

| Rubro | Nota 22 | Una línea de por qué |
|---|---|---|
| Modelo de datos | 8 | Sin numeración duplicada, sin `SECURITY DEFINER` sin `search_path`, sin RLS faltante. Queda higiene (51 `add constraint` sin guardia). |
| Backend y API | 7 | Caminos de dinero con prueba propia; los ALTO eran de borde (saneador de PDF, reimpresión, export >100k filas). |
| Frontend | 7 | Los cuatro estados pintados a propósito; no fue 8 porque tres pantallas de dinero afirmaban lo que no midieron. |
| Seguridad | 7 | **Cero críticos y cero altos.** Ningún camino sin autenticar a datos de un tenant. |
| Pruebas | 7 | Único rubro **medido y no leído**: 16 mutaciones dirigidas, 10 muertas, 6 sobrevivientes, las 6 en caminos de dinero. |
| Arquitectura | 6 | `procesarTurno` = 2,874 líneas (74% de `processor.ts`); admin y dashboard se dependen en las dos direcciones. |
| Tool calling | 6 | La frontera está definida; `estado_viaje` era invisible a la guardia de cifras. |
| Rendimiento y costo | 6 | Dos CRÍTICOS con la misma causa raíz: recorte silencioso de PostgREST presentado como cifra completa. |
| Agéntico | 5 | El camino feliz es sólido; los puntos de muerte no. |
| Cumplimiento legal | 5 | Dos CRÍTICOS: el aviso de privacidad describía un sistema distinto del que corre. |
| Operabilidad y DX | 5 | El watchdog llevaba ≥30 corridas en rojo: una muerte real de cron era indistinguible del ruido. |
| Cumplimiento fiscal | 4 | **La más baja.** Tres CRÍTICOS de dinero contra texto normativo. |

## Lo que la 22 arregló (verificar que aguante, no repetirlo)

13 commits atómicos, cada uno con prueba que reproduce:

| Sha | Qué cerró |
|---|---|
| `61b45b3` | FIS-C3 — tope LISR 27-III contra la **lista cerrada**; nuevo tipo `medio_pago_no_admitido`, 15 pruebas |
| `8c585ad` | FIS-C2 — la RFA 2.9 niega el IEPS, no el IVA; lista partida en `SIN_IVA_ACREDITABLE` / `SIN_ESTIMULO` |
| `75a5ac0` | FIS-C1 — la póliza sabe qué es deducible; mig. **0272** + `cubetaDe` en la ruta de export |
| `89a6b60` | FIS-A1 — descuento y retención cableados de punta a punta (columnas de la 0063, huérfanas desde entonces) |
| `02d7837` | LEG-C2/A1/A2/A3 — el aviso declara los cuatro tratamientos |
| `df7725b` | LEG-A4 — ARCO alcanza el texto libre; mig. **0273** + bloque 221 |
| `5b64259` | LEG-C1 — no se trata antes de avisar; compuerta en `derivar.ts`, `sinAvisoPrevio` al latido |
| `75afd55` | OP-C1/A1/A2/A3 — tercer estado `config_ausente`, `if: always()`, folio fiscal entero, dedup por incidente |
| `936fad2` | REN-C2/A1/A2 — `traerTodo` en jornada, orden descendente, tope y costo en WhatsApp |
| `e7fb20e` | AGEN-C1/A1/A2 — la base es la autoridad, margen crítico, cierre de ráfaga por corte |
| `28b34da` | BE-1/2/3 — controles C1, rutas de PDF reiniciadas, export que no miente |
| `ccb683c` | DATOS-1/ARQ-2/TC-A2 — mig. **0274** + bloque 222, costo no medido pegajoso, veto ampliado |
| `d3ce510` | PRU-C1/A1/A2/A3 — el export de póliza ejecutado, dos tautológicas cerradas, cola y estadías probadas |
| `7e67d94` | fix(ci) — import muerto `MARGEN_CIERRE_MS` + tres fixtures de `verificaciones.sql` |

**Advertencia que la 22 dejó por escrito y aplica hoy:** al arreglar LEG-A4 la
migración 0273 **reescribió a mano** `ejecutar_arco_cancelacion` y perdió guardas
enteras de la 0262; se reconstruyó verbatim. Un arreglo que reescribe una función
existente en vez de partir de su cuerpo es el patrón de falla del día.

## Lo que sigue PENDIENTE de la 22 (no reportar como nuevo; reportar como REINCIDENTE si sigue)

Estos quedaron propuestos con razón escrita, no arreglados:

- **OP-1** — el watchdog rojo: la causa que falta es **configurar
  `LIKIDA_SAT_PROVEEDOR`**, y eso no está en el código. La 22 sí metió el tercer
  estado `config_ausente` (`75afd55`); verificar si eso lo cambió.
- **LEG-1 / LEG-2 texto legal** — la corrección es de redacción jurídica, no de
  código. Una rutina desatendida no redacta texto legal.
- **AGEN-1** — `tool-executor.ts:223`: `guardar_liquidacion` abortada commitea y
  se registra fallida. La 22 no pudo reproducirlo (`e7fb20e` atacó lo demás).
- **El barrido de `traerTodo()`** — `pg.ts:183` está bien escrito, falla cerrado
  y lanza `LecturaIncompleta`, y **casi nadie lo usa**. La 22 lo llamó «el
  trabajo de más valor por hora que tiene este repo hoy» y quedó propuesto.
- **`procesarTurno` 2,874 líneas** — deuda de arquitectura declarada.
- **TC-1** (MEDIO) — `cuadre/guardia.ts:87-102`: con solo `estado_viaje` en el
  turno, el bloque de `cifrasSinRespaldo` nunca corre. No imprime cifra falsa,
  pero la narración que `prompts.ts:79-81` promete es inalcanzable.

## Qué cambió desde la ronda anterior

Ventana `86813f4..c7c3d1c`: **61 archivos, +2,929 / −106** en `src/`,
`supabase/`, `normas/`. Todo salvo `normas/` es el cierre de la auditoría 22.

- **Motor y fiscal**: `cuadre/engine.ts` (+88), `fiscal.ts` (+61),
  `contabilidad/poliza.ts` (+128), `catalogo.ts`, `intake/cfdi_xml.ts`.
- **Legal**: `privacidad.ts` (+37), `jornada/derivar.ts` (+92), `jornada/repo.ts`.
- **Operabilidad**: `observability/alerta.ts` (+61), `sentry.ts`,
  `api/health/route.ts`.
- **Backend**: `api/export/poliza/route.ts` (+54), `export/liquidaciones`,
  `repo.ts` (+51), `oficina_wa.ts` (+70), `processor.ts` (+87).
- **Agéntico**: `agentes/runner.ts`, `exito.ts`, `faq.ts`, `conv.ts`,
  `intake/rafaga.ts`, `presupuesto.ts`.
- **Migraciones**: `0272` (deducibilidad en la póliza), `0273` (ARCO texto
  libre), `0274` (conversación por teléfono normalizado) + 170 líneas nuevas de
  `verificaciones.sql`.
- **`normas/` — lo único que NO viene de la 22**: cuatro fichas nuevas
  (`lisr-72-73.yaml` +201, `rfa-2026-2.1.yaml`, `rfa-2026-2.3.yaml`,
  `rfa-2026-2.5.yaml`) sobre **coordinados y retenciones**. **Fiscal tiene que
  abrirlas: son norma nueva que el código puede no estar implementando.**

Consecuencia para el auditor: **el código recién tocado es el más sospechoso.**
Un arreglo de ayer que introdujo un modo de falla nuevo es el hallazgo más
valioso de hoy. La 22 lo comprobó: tres de sus hallazgos nacieron de arreglos de
la 21.

## Compuerta base (corrida real, 31-ago-2026, sobre `c7c3d1c`)

La compuerta de esta ronda **incluye `npm run lint:ratchet`**, porque su ausencia
fue exactamente lo que hizo que la 22 declarara verde algo que CI vio rojo. La
salida real se pega en `00-SINTESIS.md`.

| Comando | Corre aquí |
|---|---|
| `npm test` (vitest run) | sí |
| `npx tsc --noEmit -p .` | sí |
| `npm run lint` (eslint src/) | sí |
| `npm run lint:ratchet` | sí — **añadido esta ronda** |
| `npm run build` | **no**: pide Supabase, OpenRouter, Facturapi y Upstash, que en la nube no existen; su fallo no diría nada del código |
| `pruebas-manuales/*.prueba.ts` | **no**: hacen llamadas reales de pago |

## Tamaño y forma del repo

- `src/`: **1,479** archivos `.ts`/`.tsx`.
- `supabase/migrations/`: última **`0274`**.
- `normas/`: **37** fichas `.yaml` (eran 34) + `normas/datos/`.
- Suite al cerrar la 22: **708** archivos de prueba, **9,995** pruebas.

## Dónde está todo

| Área | Rutas |
|---|---|
| Panel del cliente | `src/app/dashboard/` (~31 páginas, todas filtradas al tenant) |
| Consola de Javier | `src/app/admin/` (cruza tenants a propósito; el único permiso así es `lib/admin/negocio.ts`) |
| API | `src/app/api/` (~69 rutas), `middleware.ts` |
| Motor | `src/lib/likida/` — `processor.ts`, `repo.ts`, `conv.ts`, `cuadre/`, `contabilidad/`, `intake/`, `conectores/` |
| Agentes / LLM | `src/lib/agents/`, `src/lib/llm/`, `src/lib/likida/tools.ts` |
| Formato de cifras | `src/lib/formato.ts` — **única** fuente; hay prueba que falla si aparece `toLocaleString('es-MX')` en otro archivo |
| Normas fiscales/legales | `normas/*.yaml` (texto normativo con vigencia) |
| Esquema | `supabase/migrations/`, `supabase/verificaciones.sql` |

## Reglas del producto que un hallazgo puede violar

Están en `CLAUDE.md` y son el criterio de severidad, no decoración:

1. **Nunca inventar una cifra.** Si no hay dato real se dice qué falta
   (`dashboard/pendiente.tsx`, `EstadoVacio`). Una estimación se declara con su
   supuesto a la vista.
2. **Un rótulo tiene que ser verdad.** «del periodo» ⇒ la consulta filtra por
   fecha. Un filtro en pantalla mueve TODO lo que hay debajo.
3. **El formato de cifras vive solo en `lib/formato.ts`.**
4. **Fallar cerrado y decirlo.** supabase-js reporta errores POR VALOR: sin
   comprobar `error`, una base caída se lee como «no hay nada». Ver `exigir()` y
   `traerTodo()` (PostgREST recorta a 1,000 filas en silencio).

## Trampas ya pisadas — no volver a reportarlas como hallazgo nuevo

- `gasto.ocr_raw` está MUERTA; la prueba de OCR es `ocr_confianza`.
- La tabla `politica_gasto` está muerta; la política viva es
  `tenant.config.politica` vía `getConfig()`.
- `wa_mensaje_procesado` NO tiene `tenant_id`.
- `viaje.estatus` ∈ {`abierto`,`en_cuadre`,`liquidado`}; `app_user.rol` ∈
  {superadmin, flota_admin, contador, operador, encargado}.
- **SÍ tienen escritor** (no reportar «falta el escritor»): `cliente`, `unidad`,
  `tarifa`, `factura_emitida`, `pago_recibido`, `posicion`, `cotizacion`,
  `mantenimiento`, `ticket_mensaje`.
- **Siguen sin escritor**: `geocerca`, `terminal`, `portal_credencial`,
  `invitacion`; muertas de facto `campania`/`envio_mensaje`.
- La base está en cero porque **no hay clientes todavía**, no por falta de
  código. Tabla vacía ≠ bug.
- `requireSessionTenant(destino)` pierde el query string; por eso existe
  `dashboard/sufijo.ts`.
- `ticket_monedero` ausente de `SIN_ACREDITAMIENTO` está **descartado como bug**
  por la 22: `engine.ts:1284` (`if (!g.xmlVerificado) continue`) lo ataja
  estructuralmente.
- Las tools declaran `properties: {}` **a propósito**: el modelo decide *cuándo*,
  nunca *con qué datos*. Proponer «validar mejor los argumentos» quema la
  credibilidad del reporte entero.

## Reglas de esta ronda

- **Ningún auditor toca código.** Cada uno escribe **un solo** archivo:
  `docs/auditoria-23/<rubro>.md`.
- Un hallazgo sin `archivo:línea` abierto y leído, y sin escenario con valores
  concretos, se descarta en la verificación.
- El orquestador abre cada hallazgo contra el código antes de anotarlo. Los
  falsos entran al reporte como falsos, con la razón.
