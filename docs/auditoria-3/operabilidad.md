# Operabilidad y DX — auditoría 3

**Nota: 5/10** (antes 6). Baja porque el rubro tuvo su prueba de fuego real y la falló: el cron del camino del dinero estuvo tronando cada hora durante ~9 días (0075 entró el 5-ago; el arreglo es de hoy, commit `566a962`, cuyo propio mensaje dice "llevaban rotos en silencio") **con la capa de alertas ya instalada** — `SENTRY_DSN` está en Production desde ~1-ago, verificado con `vercel env ls`. El log existió, el error-level existió, Sentry recibió, y nadie se enteró hasta que una PÁGINA se cayó a la vista. Eso es exactamente el ancla de "hay logs pero nadie los mira". No baja a 4 porque la infraestructura alrededor es real y buena: identificadores cruzables (`huellaId`), redacción por un solo camino, `facturar` y `purgar` fallan cerrado y ruidoso, arranque que grita configuración ausente, y el guardián de `.env.example` corre en cada suite.

**Riesgo mayor hoy:** el motor de cobranza (`ejecutarCobranzaGlobal`) corre bajo el MISMO techo que acaba de fallar 9 días en silencio: si mañana revienta entero, el cron devuelve 200, Vercel lo pinta verde, Sentry lo agrupa en un issue que ya nadie abre, y la señal de fallo por tenant ni siquiera llega a nivel `error`. La misma película, con el agente estrenado ayer como protagonista.

---

## Hallazgos

### H1 — CRÍTICO · El cron de escalación devuelve 200 cuando un motor entero revienta — el único cron con ese modo de falla, y es el que ya se rompió 9 días

**Evidencia:** `src/app/api/cron/escalar/route.ts:67-91`. Cada motor corre en su try/catch; si `escalarViajesSinAceptar()` lanza (líneas 71-75) o `ejecutarCobranzaGlobal()` lanza (81-85), el error se guarda en `resultado` y la línea 91 responde `NextResponse.json(resultado)` — **HTTP 200**. Contraste en el mismo directorio: `purgar/route.ts:77,85` responde 500 en fallo; `facturar/route.ts:342` responde 500 y `:563` responde 503 sin navegador.

**Escenario con valores (el real):** la FK compuesta de la 0075 (aplicada ~5-ago) dejó dos relaciones viaje↔operador; PostgREST rechazó el embed de `viajesSinAceptar` con "more than one relationship" en cada corrida horaria. Del 5 al 14 de agosto: ~216 invocaciones consecutivas donde el motor hizo CERO trabajo — y las ~216 respondieron 200. El panel de crons de Vercel, la única superficie que alguien mira, estuvo verde todo ese tiempo. Se descubrió hoy solo porque el MISMO bug tumbó la página de Cobranza frente a un humano (commits `2e59040`, `566a962`).

**La ironía documentada en el propio archivo:** el encabezado (líneas 38-42) justifica el 500-sin-CRON_SECRET con estas palabras: "un 200 le diría a Vercel que la corrida salió bien, el cron se vería verde en el panel para siempre, y nadie se enteraría de que la escalación lleva meses sin correr". Ese modo de falla, prohibido por la puerta del secreto, entró 216 veces por la puerta del catch.

**¿El cron distingue "corrí y 0 pendientes" de "corrí y todo tronó"?** En el log sí (`cron.escalar.ok` vs `cron.escalar.falló`); en el cuerpo de la respuesta sí; en el ÚNICO canal que una persona ve sin ir a buscar — el status code del panel — no: ambos son 200 verde.

**Refutación considerada:** el comentario de la línea 87 ("los fallos van en la RESPUESTA") es defendible para fallos POR FILA — la corrida sí corrió, 200 es honesto. El hallazgo está acotado al caso donde un motor entero lanza y no hizo trabajo alguno: ahí el 200 afirma algo falso. También consideré que Vercel no manda correo por un 500 de cron — cierto, pero marca la corrida como fallida en el panel, que es el estándar que `purgar` y `facturar` ya compraron; la inconsistencia entre los tres crons es en sí la trampa.

**Consecuencia:** la próxima regresión en escalación o cobranza (motores que se tocaron esta misma semana) repite los 9 días de ceguera. Sigue abierto hoy.

---

### H2 — ALTO · La cadena de alertas no convierte "lleva N corridas fallando" en señal: 216 fallos = 1 issue de Sentry = 1 notificación, la primera madrugada

**Evidencia:** `src/lib/logger.ts:148-150` replica `warn`/`error` a Sentry vía `reportar()`. `src/lib/observability/sentry.ts:154-165`: `reportar()` usa `captureMessage` con `fingerprint: [msg, nivel]` — TODO fallo con el mismo `msg` y nivel cae al mismo issue, por diseño (el comentario lo explica para las parejas estado/contra-estado, y es razonable para eso). `SENTRY_DSN` está presente en Production desde hace 13 días (`vercel env ls`, 14-ago), es decir ANTES de que la 0075 rompiera el embed.

**Escenario con valores:** `cron.escalar.falló` × ~216 eventos entre el 5 y el 14 de agosto → un solo issue de Sentry. La notificación por default de Sentry es "issue nuevo": un correo la primera madrugada (~5-6 ago), y después silencio absoluto — cada evento siguiente engorda un contador que solo se ve entrando al dashboard. En el repo no existe (ni está documentada en `docs/`) ninguna regla de alerta por recurrencia, frecuencia o regresión; el runbook (`.env.example`, sección Observabilidad) promete "SIN ESTO NO HAY ALERTAS" — o sea, CON esto ya las hay — y el incidente demuestra que tenerlo puesto no alcanzó.

**Refutación considerada:** no puedo ver la configuración del proyecto en Sentry (vive fuera del repo); quizá haya reglas que no conozco. Pero el hecho empírico manda: con DSN activo durante los 9 días completos, ninguna señal llegó a un humano. Sea porque la regla no existe, porque el correo se perdió, o porque el DSN guardado es inválido (valor Hidden, no verificable desde aquí) — el resultado operativo es el mismo y es el rubro.

**Consecuencia:** Sentry hoy funciona como archivo de fallos, no como alarma. Un fallo persistente y un fallo único producen exactamente la misma cantidad de molestia a un humano: una notificación, una vez.

---

### H3 — ALTO · Los fallos de ENVÍO del camino del dinero nunca pasan de `info`, y el único `error` que sí se emite no dice de quién era el mensaje

**Evidencia (leída):**
- `src/lib/likida/escalar_viaje.ts:235, 266, 269` — el reaviso al chofer que lanza, la plantilla al jefe que Meta rechaza, la excepción al enviar: todos van a `r.fallos.push(...)`, sin `logger.warn/error`.
- `src/lib/likida/agentes/cobranza.ts:211, 226` — el claim que falla y el WhatsApp de cobranza rechazado: `r.fallos.push`, sin logger.
- `src/lib/likida/agentes/cobranza.ts:271-273` — **el crash COMPLETO de un tenant** (`ejecutarCobranza` lanza: base caída a media corrida, config ilegible a nivel query) se atrapa en `total.fallos.push` — ni una línea de log propia.
- `src/app/api/cron/escalar/route.ts:69,79` — esos `fallos` solo se emiten dentro de `cron.escalar.ok` / `cron.recordatorio_comprobacion.ok`, nivel **info**. A Sentry solo llegan `warn`/`error` (`logger.ts:148`): nada de esto alerta.
- `src/lib/meta/client.ts:96` — `logger.error('wa.sendText', { status, body })`: el ÚNICO error-level del envío no lleva tenant, viaje, folio ni propósito; el teléfono que pudiera venir en el body sale redactado a `[TEL]` (correcto), así que la línea queda sin NINGÚN identificador de negocio.

**Escenario con valores:** el `WHATSAPP_ACCESS_TOKEN` caduca (el propio `.env.example` lo advierte: "CADUCA, ver DEPLOY.md"). Todos los envíos de la corrida fallan. Resultado observable: cron 200 verde (H1), `cron.escalar.ok` en info con `fallos: [...]` que nadie hojea, y en Sentry un issue `wa.sendText` con `{status: 401, body: "..."}` — sin poder decir qué flotas se quedaron sin cobranza ni qué jefes sin escalación. A la mañana siguiente tienes la mitad de cada dato: el quién sin el qué (info) y el qué sin el quién (error).

**Detalle de atribución:** los strings de fallo de cobranza son `` `${v.folio ?? v.viajeId}: ...` `` (`cobranza.ts:226`) — sin tenant. En la corrida GLOBAL, dos flotas con folio "F-001" son indistinguibles; el folio no es único entre tenants.

**Refutación considerada:** marcar `escalado_en` aunque el aviso falle es decisión correcta y documentada (no reintentar un número roto para siempre) — no la cuestiono. Y `escalacion.sin_telefono_de_jefe` (`escalar_viaje.ts:274`) sí es error-level con tenant+viaje: el patrón correcto existe en el mismo archivo, a diez líneas de los que no lo siguen.

**Consecuencia:** la clase de fallo más probable del camino del dinero (Meta rechaza) es estructuralmente incapaz de generar una alerta identificable.

---

### H4 — MEDIO · El log del cron nombra a un módulo que se borró esta semana: `cron.recordatorio_comprobacion.ok` envuelve a la cobranza

**Evidencia:** `src/app/api/cron/escalar/route.ts:79,83` — `ejecutarCobranzaGlobal()` (el agente 0089, estrenado 14-ago) se loguea como `cron.recordatorio_comprobacion.ok/.falló`. `recordatorio_comprobacion.ts` se borró esta semana (MAPA: "muertos esta semana"). El motor sí tiene su propia línea interna (`agente_cobranza.corrida`, `cobranza.ts:246`, nivel info, por tenant), pero el crash del ciclo global solo existe bajo el nombre del muerto.

**Escenario:** el ingeniero de guardia (o el propio Javier en 3 meses) busca "cobranza" en los logs de Vercel o en Sentry para diagnosticar por qué una flota no recibió recordatorios. El fallo del cron no aparece: vive bajo `recordatorio_comprobacion`, un archivo que ya no existe en el árbol — grep del nombre en `src/` devuelve solo el route del cron. En Sentry, el issue del motor nuevo nace etiquetado con el nombre del módulo viejo, y la regla del repo es explícita: "un rótulo tiene que ser verdad".

**Consecuencia:** tiempo de diagnóstico regalado y un issue de Sentry que apunta a código inexistente.

---

### H5 — MEDIO · Logs de fallo sin identificador en el código nuevo: chat, despacho por WhatsApp y resolución de oficina

**Evidencia (todos con el identificador EN SCOPE y no emitido):**
- `src/app/api/dashboard/chat/route.ts:78` — `chat.tope_dia.error { err }`: `tenantId` está en la línea 53. Fallar cerrado aquí APAGA el análisis de IA de esa flota; el log no dice de cuál.
- `src/app/api/dashboard/chat/route.ts:127` — `chat.guardar.fallo { err }`: sin tenant ni conversación; si `guardarIntercambio` falla sistemáticamente para UNA flota (constraint, RLS), se sabe que "algo no guarda historial", no de quién.
- `src/app/api/dashboard/chat/route.ts:131` — `chat.analista.fallo { err }`: sin tenant (contraste: `analista.ts:355,389` sí lo llevan).
- `src/lib/likida/despacho_wa.ts:63,87` — `pendiente_ilegible` / `pendiente_sin_guardar` solo con `err`; `tenantId` y `telefono` son argumentos de la función. El 87 es el caso caro: el jefe dicta un viaje, el pendiente no se guarda, su "sí" no encuentra nada y se le re-pregunta — sin tenant en el log no se puede saber si le pasa siempre a la misma flota.
- `src/lib/likida/processor.ts:402` — `oficina.no_resuelta { err }`: ni siquiera un hash del teléfono; una oficina que lleva días sin poder despachar es invisible como patrón.

**Refutación considerada:** el resto del código nuevo hace esto BIEN — `hitos_viaje.ts:107`, `consolidado.ts:177,269,291,400,404`, `proveedores.ts:103,157`, `importar_viajes.ts:222`, `export/facturas-proveedor:41,53` llevan tenant+fila. Son excepciones, no el patrón; por eso MEDIO y no ALTO.

**Consecuencia:** en los cinco puntos citados, la pregunta de las 3 a.m. ("¿a quién le está pasando?") no tiene respuesta con lo que queda en disco.

---

### H6 — MEDIO · La trampa CUADRA_*→LIKIDA_* se parchó a mano hace 2 días, solo en Production, y no existe ninguna red que detecte el próximo renombre

**Evidencia (verificada contra el entorno real, `vercel env ls production`, 14-ago):**
- Siguen vivas en Production: `CUADRA_MODEL_OCR`, `CUADRA_WHATSAPP_MSG_USD`, `CUADRA_INTAKE_ESPERA_MS`, `CUADRA_DEDUP_FOTOS`, `CUADRA_RECUPERAR_CIERRE_PARCIAL`, `CUADRA_INTAKE_GRACE_MS` — el código no lee `CUADRA_` en ningún archivo (`grep -rn "CUADRA_" src/` = vacío).
- Los duplicados `LIKIDA_*` se crearon hace 2 días **solo en Production**. En **Preview**, las únicas que existen son las `CUADRA_*` muertas: los deployments de preview corren HOY con dedup de fotos, recuperación de cierre parcial y gracia de intake en sus defaults, creyéndose idénticos a producción.
- La red existente no cubre esta clase: `runbook.test.ts` compara código↔`.env.example` (no código↔Vercel); `env.ts:29-38` agrupa solo llm/whatsapp/supabase; `arranque.ts:34-42` vigila 3 variables. Ninguno de los flags de comportamiento (`LIKIDA_DEDUP_FOTOS`, `LIKIDA_RECUPERAR_CIERRE_PARCIAL`, `LIKIDA_INTAKE_*`) tiene vigilancia de arranque: ausentes, caen a su default sin una línea de log.

**Escenario con valores:** entre el renombre en código y el parche de hace 2 días, producción corrió con `LIKIDA_DEDUP_FOTOS` sin definir → dedup APAGADO (`processor.ts:761` exige `=== '1'`), sin señal alguna. Ya pasó; lo auditable es que nada impide la repetición: el siguiente `LIKIDA_X` → `LIKIDA_Y` produce el mismo agujero de días.

**Refutación considerada:** los valores son Hidden — no puedo confirmar que las `LIKIDA_*` nuevas repliquen los valores de las `CUADRA_*`; tampoco puedo probar cuántos días exactos duró el agujero. El residuo `CUADRA_*` y la asimetría Preview/Production sí están probados.

**Consecuencia:** deriva silenciosa entre entornos hoy (Preview ≠ Production en flags de comportamiento) y cero detección para la próxima migración de nombres.

---

### H7 — MEDIO · No hay latido: si el cron deja de SER INVOCADO, ninguna señal lo distingue de "todo bien"

**Evidencia:** `vercel.json` define los 3 crons; toda la detección de fallo del repo (los 500 de `purgar`/`facturar`, el `cron.escalar.falló`, Sentry) se dispara cuando una corrida MALA sucede. No existe nada — ni en código, ni en docs, ni una routine — que detecte la AUSENCIA de corridas.

**Escenario con valores:** un commit toca `vercel.json` (o lo rompe) y se pushea sin la bandera `[deploy]` — el modo de falla silencioso ya documentado del despliegue. O el proyecto queda pausado. Los crons dejan de invocarse: cero logs, cero errores, cero issues — indistinguible de "corrió limpio y no había pendientes". La escalación de 5 horas y la cobranza por tiers simplemente dejan de existir hasta que un cliente pregunte por qué nadie le avisó.

**Refutación considerada:** Vercel Cron es confiable en operación normal; la ventana realista es el acople con el despliegue por bandera (los crons solo se actualizan al desplegar). Es exactamente el tipo de acople que este repo documenta como su modo de falla favorito. Por la baja frecuencia esperada: MEDIO, no ALTO.

**Consecuencia:** la clase de fallo "no corrió" — la única peor que "corrió y tronó" — no tiene ni la señal que H1 al menos deja en el log.

---

### H8 — BAJO · El callback de QStash pierde su fallo de re-validación sin log, y el DLQ no lo mira nadie

**Evidencia:** `src/app/api/cron/facturar/cola/route.ts:67` — si la re-validación contra `gasto` falla, responde 500 con el mensaje **sin ninguna línea de logger** (único return de error del archivo sin log; contraste: líneas 26, 41, 45 sí gritan). QStash reintenta 2 veces (`route.ts:321`, `retries: 2`) y después manda el mensaje a su DLQ — una superficie que ningún doc del repo menciona y nadie tiene el hábito de abrir.

**Por qué BAJO:** el sistema se auto-repara — los tickets quedan sin marcar y el cron de la siguiente hora los recoge enteros (diseño explícito de `facturar`). Lo que se pierde es solo la traza de que ESA entrega murió, no el trabajo.

---

## Lo que revisé y está bien

- **`logger.ts` entero** — la huella FNV de UUIDs es cruzable contra la base (`huellaId` exportada), la redacción va en una sola pasada, el `digest` de Next sobrevive (`CLAVES_NO_PII`), timestamp ISO en cada línea, y Sentry se alimenta del MISMO camino redactado. La respuesta a "¿cada error dice cuál fila/tenant?" es sí en el mecanismo; los huecos son de los llamadores (H3, H5).
- **`instrumentation.ts` / `onRequestError`** — cualquier error no atrapado del panel o de una ruta API deja línea con ruta, método, digest y excepción con stack a Sentry (`reportarExcepcion`, el único camino con stack). El escenario "el contralor ve 'no se pudo cargar' y no hay nada que buscar" está cerrado.
- **El arranque grita lo silencioso** — `avisarObservabilidad()` emite ERROR si falta `SENTRY_DSN` en un deploy real; `avisarConfiguracionSilenciosa()` cubre `DEMO_TENANT_ID`, `LIKIDA_WHATSAPP_MSG_USD`, `NEXT_PUBLIC_APP_URL` con la consecuencia escrita; `startup.migraciones` verifica migraciones críticas con mensajes por caso. `SENTRY_DSN` verificado PRESENTE en Production.
- **`env.ts`** — `faltantes()` tiene consumidor real (el arranque); la decisión de reportar-no-lanzar está razonada y es consistente con el resto. Una env de grupo que falta NO arranca "igual, mal": arranca con un ERROR nombrado en el log del deploy.
- **`runbook.test.ts`** — el guardián código↔`.env.example` es real: escanea `process.env.*` de todo el árbol en cada corrida de la suite. (Su límite — no mira Vercel — es H6.)
- **`api/cron/facturar` + `cola`** — el estándar del repo en su mejor forma: 503 sin navegador con los tres intentos explicados, tickets sin marcar para reintento íntegro, corte por reloj anunciado (`sinTiempo`), firma de QStash verificada ANTES de tocar nada, 500 en el catch. Si escalar copiara este archivo, H1 no existiría.
- **`api/cron/purgar`** — 500 en fallo, 500 sin secreto, 401 sin cuerpo. Correcto.
- **Los motores nuevos loguean con identificador** — `consolidado.ts` (tenant+gasto+línea en sus 5 errores), `proveedores.ts` (tenant+factura), `hitos_viaje.ts` (viaje+hito), `importar_viajes.ts` (tenant+offset del lote), `export/facturas-proveedor` (tenant). El patrón existe y es mayoritario.
- **`cobranza.ts` operativamente honesto por dentro** — claim antes de enviar, bitácora incluso para los sin-teléfono (con motivo), config corrupta cae a defaults Y grita con tenant (`cobranza.config_corrupta`), la cola de la página declara a quién NO puede contactar.
- **`escalar_viaje.ts` por dentro** — sello-como-claim contra corridas solapadas, `escalacion.sin_telefono_de_jefe` como error-level con tenant+viaje, y el comentario del embed (líneas 86-89) documenta la lección del incidente en el punto exacto del código.

## Lo que NO alcancé a revisar

- **Valores de las env de producción** — todo `Hidden`: no puedo probar que el `SENTRY_DSN` guardado sea un DSN válido, ni que las `LIKIDA_*` nuevas repliquen los valores de las `CUADRA_*`.
- **El proyecto en Sentry** (issues acumulados, reglas de alerta, a qué correo notifica) — vive fuera del repo. H2 queda inferido del comportamiento por defecto de Sentry + el hecho empírico de los 9 días.
- **Los runtime logs reales de Vercel** de las corridas fallidas del cron (retención corta; y no disparé los crons — mandan WhatsApp reales).
- **`processor.ts` completo** (~2,300 líneas) — solo las ramas nuevas (oficina ~402-470, hitos ~1530-1580); el webhook y el resto del procesador quedaron con la revisión de rondas previas.
- **La densidad de logging del panel `/admin` y de las páginas nuevas del dashboard** (server components) — cubiertas indirectamente por `onRequestError`, no revisadas una a una.
- **La reproducibilidad local del incidente como clase**: la suite (3,161 verdes) no ejercita embeds de PostgREST contra el esquema real — los mocks pasaron los 9 días que producción falló. Lo anoto como contexto del incidente; el rubro de pruebas es el dueño.
