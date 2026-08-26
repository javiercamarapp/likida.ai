# Operabilidad y DX — auditoría 19 c2

**Nota: 6/10** (antes 6). Razón del movimiento: **se atacó y subió** y **deuda que
cobró factura**, del mismo tamaño.

- **Subió, y es medible.** El `estado` del latido —mi ALTO de la ronda pasada— ya lo
  lee alguien: `health/route.ts:62-63` filtra `noSanos` (fresco pero `fallo`/`parcial`/
  `saltado`), degrada el health y llama `alertarOperador('cron.estado_no_ok')`. El
  workflow ya no se conforma con `grep '"ok":true'`: `salud-produccion.yml:40-42`
  parsea `status` y **falla en `degraded`**. `lint:ratchet` cierra mi MEDIO del techo
  de avisos — lo corrí: *156/157 heredados, 0 nuevos, 0 errores*. `scripts/test-
  resiliencia.sh` corre y pasa, y ataca de verdad los guardas del restore (SHA
  alterado, `..` en el bucket, symlink padre del origen y del destino, symlink en el
  archivo final). Las Actions quedaron fijadas por SHA. Cinco `error.tsx` en `/admin`
  ponen el `digest` en pantalla y una línea en el log.
- **Cobró factura, y está escrito en el propio delta.** El cuerpo de `69aa71b` cuenta
  dos incidentes de este ciclo: `/dashboard/despacho` **nueve días roto en producción**
  con **204 eventos en Sentry desde el 15-ago** que nadie miró, y un cambio de esquema
  de OCR que tumbó la lectura de tickets a las 17:16 y obligó a un **rollback manual en
  Vercel** porque la compuerta legal impedía construir el arreglo. Ninguno de los tres
  semáforos de este repo vio ninguno de los dos: los dos ocurren en páginas y en el
  camino del LLM, y **el único monitor programado le pega a `/api/health` y a nada más**.

**El riesgo mayor del rubro, hoy:** ningún monitor carga **una sola página** de
producción, y `/api/health` es una route handler que **no renderiza el layout raíz** —
así que la clase de fallo que ya pasó dos veces este mes (una página que revienta, un
proveedor que rechaza) sale verde en los tres tableros por construcción.

---

## Estado del despliegue

**Último commit con la bandera en el asunto = HEAD de `master`.** Verificado con:

```bash
git rev-parse origin/master                                   # 69aa71b644f4…
git log origin/master --format='%h|%s' | grep -i -m1 '\[deploy\]'
# 69aa71b|[deploy] Compuerta legal, esquema del OCR y el despacho (#63)
```

`0156cf3` («Enterprise: runtime, WhatsApp, budgets and resilience») **NO lleva la
bandera**, pero **no quedó sin desplegar**: `1d327f7` y `69aa71b` vienen después y sí
la llevan, así que su contenido viaja en esos builds. El desfase concreto de la ronda
19 (`df6b1be` contra `8b43121`) **cerró**.

**Lo que no puedo afirmar, y nadie en este repo puede:** que producción corra
exactamente `69aa71b`. Desde aquí `app.likida.ai` no es alcanzable (el proxy contesta
`CONNECT tunnel failed, response 403`), así que la única evidencia disponible es la
del propio CI — y dice esto:

- Las corridas programadas de hoy (#128–#139, la última 2026-08-25T10:59Z) salen
  `success` con `estado=ok`. Como el campo `status` **solo existe** en la ruta
  reescrita por `0156cf3`, eso prueba que producción corre **al menos** `0156cf3`.
- El `head_sha` que muestran esas corridas es `69aa71b` porque es el sha del **repo**,
  no el de producción. No es una comprobación de versión: es el commit del workflow.

---

## Hallazgos

### [CRÍTICO · REINCIDENTE, y ahora con prueba dura] La comprobación de sha **nunca se ha ejecutado**: 139 corridas, 0 ejecuciones — el `schedule` la salta y los tres `push` mueren en el paso anterior

`.github/workflows/salud-produccion.yml:44-45` y `:34-42`

Dos compuertas cierran el mismo paso y por eso no queda ninguna:

1. `:45` — `if: github.event_name == 'push'`. La rama `schedule`, la que corre cada 30
   minutos, **nunca** llega al paso. Confirmado en el job de hoy (run #139, job
   97777184527, 10:59:47Z): paso 3 «El sha desplegado es el que se pusheó» →
   `"conclusion":"skipped"`.
2. El paso de sha va **después** del paso de health, en el mismo job y **sin
   `if: always()`**. Si el health falla, GitHub ya no corre el paso siguiente.

Esa segunda compuerta es la que se disparó de verdad. De las 139 corridas del workflow,
solo **tres** fueron `push`, y las tres terminaron en `failure` **en el paso 2**:

| run | sha | asunto | paso 2 | paso 3 |
|---|---|---|---|---|
| #110 | `0156cf3` | sin bandera | failure | **skipped** |
| #112 | `1d327f7` | **[deploy]** | failure | **skipped** |
| #115 | `69aa71b` | **[deploy]** | failure | **skipped** |

El log del #115 (job 97540217879, 24-ago 18:13:53Z) dice literalmente:

```
http=200 estado=
##[error]/api/health no está healthy (http=200 estado=); un cron stale se reporta como degraded.
```

`estado=` vacío porque producción todavía servía el cuerpo **viejo**, sin campo
`status` — es decir, el paso de health falló *precisamente porque el deploy aún no
había llegado*, que es exactamente la condición que el paso 3 existía para detectar. El
detector de deriva se apagó solo, en el único momento en que tenía algo que decir.

**Escenario con valores:** Javier empuja `abc1234` con `[deploy]` en el asunto a las
09:00. Vercel no construye (cuota, un `ignoreCommand` mal evaluado, un build roto). A
las 09:00:05 el workflow de push corre: producción sigue en el build anterior, `gps`
lleva 26 minutos sin latir por el redeploy, `/api/health` contesta `503`/`degraded`,
**paso 2 falla**, **paso 3 skipped**. A las 09:30 y cada media hora después, el cron ya
está fresco otra vez y el `schedule` sale verde sin mirar `version`. Resultado: un
correo de GitHub a las 09:00 que dice «health no está healthy» —que se lee como un
parpadeo— y 48 palomitas verdes al día sobre una producción congelada.

**Consecuencia:** la pregunta «¿está desplegado lo último?» sigue sin tener un
respondedor automático, después de dos rondas marcándolo. `/api/health:100` publica
`version` y ningún consumidor programado lo lee.

**Causa raíz probable:** el cotejo de deriva se colgó del disparador `push` (donde
`[deploy]` tiene sentido) en lugar del `schedule` (donde la pregunta correcta es
«¿producción corresponde al HEAD?», que no depende de la bandera), y quedó encadenado
detrás de un paso que falla justo cuando hay deriva.

---

### [CRÍTICO] Ningún monitor carga **una sola página** de producción, y `/api/health` no puede ver un layout raíz roto

`.github/workflows/salud-produccion.yml:37`, `:58` · `src/app/layout.tsx:55` ·
`src/lib/legal/config.ts:92-99` · `src/app/api/health/route.ts:42`

Medido: `grep -rn "curl" .github/workflows/*.yml` devuelve **dos** llamadas a producción
y las dos son a `https://app.likida.ai/api/health`. La tercera (`ci.yml:146`) es a
`http://127.0.0.1:3000` en el runner, no a producción. El smoke de Playwright existe
(`scripts/ci/playwright-smoke.mjs`) pero solo corre contra el servidor local del CI y
contra una Preview del workflow manual — **nunca** contra `app.likida.ai`.

`/api/health` es una **route handler**: no renderiza `src/app/layout.tsx`. Y ahí, en
`:55`, vive `exigirLegalEnProduccion()`, que en producción **lanza** si falta cualquiera
de las cuatro variables de entidad (`config.ts:97-99`,
`throw new Error('LEGAL_PRODUCTION_BLOCKED: faltan …')`).

**Escenario con valores:** alguien limpia `LEGAL_ENTITY_ADDRESS` en el panel de Vercel
(o la pega con un salto de línea y `datoLegal` la descarta). La siguiente invocación de
**cualquier página** —la landing, `/login`, `/dashboard`, `/aviso/{tenant}`— entra al
layout raíz, lanza, y el visitante recibe `global-error.tsx`: «La aplicación no pudo
continuar». El sitio entero está caído. Mientras tanto `/api/health` no toca el layout:
`db=ok`, los siete latidos frescos, **`status:"ok"`, HTTP 200**. `salud-produccion.yml`
sale **verde a los 30 minutos y a los 60 y a los 90**. Cero correos.

No es hipotético como clase: el commit `69aa71b` documenta que este mismo gate ya
convirtió «un error de diez minutos en uno de horas» al bloquear el build de la
reparación, y que `/dashboard/despacho` estuvo **nueve días** devolviendo un rechazo no
manejado en cada render mientras los tres semáforos seguían verdes.

**Consecuencia:** el rubro pregunta qué hay a la mañana siguiente. Para una caída de
página en producción, hoy hay **Sentry y nada más** — y el precedente medido de este
mes es que Sentry acumuló 204 eventos durante nueve días sin que nadie los abriera.

**Causa raíz probable:** el health se diseñó como pulso de infraestructura (base +
latidos) y se adoptó como si fuera el pulso del producto; el smoke que sí carga páginas
nació apuntando a `PLAYWRIGHT_BASE_URL` del runner y nunca se apuntó a producción.

---

### [CRÍTICO · REINCIDENTE, byte por byte] El estado `dead` del outbox sigue sin un solo consumidor y el cron sigue sin llamar `alertarOperador`

`src/app/api/cron/wa-outbox/route.ts:75`, `:79-80` · `src/lib/likida/wa_outbox.ts:38`
· `supabase/migrations/0180_reservas_agente_y_outbox_wa.sql:112` ·
contraste: `src/app/api/cron/wa-pendientes/drenado.ts` (sí alerta)

Verificado hoy, no heredado:

- `grep -rn "'dead'\|\"dead\"" src/ supabase/` → **dos** coincidencias, las dos en
  `0180` (el CHECK del dominio y el `update … estado='dead'`). Ninguna en `src/`.
- `grep -rln alertarOperador src/app/api/cron/` → `escalar`, `runner`, `gps`,
  `wa-pendientes`, `facturar`, `purgar`. **`wa-outbox` sigue siendo el único que falta.**
- `grep -rn wa_outbox src/` fuera de su propio módulo → el cron y `meta/client.ts`. Ni
  una pantalla, ni una consulta, ni un cron mira la tabla.
- `wa_outbox.ts:38` sigue igual: `logger.error` **solo** si el RPC de finalizar falla;
  el fallo de **envío** viaja como `p_error` a una columna y no pasa por el logger.

Lo que sí cambió, y hay que decirlo: la mitad del daño la tapa ahora `health/route.ts:
62-63`, porque un latido fresco en `parcial` degrada y alerta. **Pero la ventana no
cierra.** El cron corre cada minuto (`vercel.json:10-12`) y el monitor cada 30
(`salud-produccion.yml:21`).

**Escenario con valores.** 03:12. Se cierra la liquidación del viaje V-8842. Meta
devuelve HTTP 500 y `client.ts` encola la carga en `wa_outbox`. El cron reintenta cada
minuto y registra `registrarLatido('wa-outbox','parcial')` (`route.ts:75`). A la 8ª
vuelta —**03:20**— `0180:112` pone `estado='dead'`; `reclamar_wa_outbox` deja de
tomarla, `fallidas` vuelve a 0 y el minuto siguiente el latido vuelve a **`'ok'`**. La
corrida programada de las **03:30** encuentra `status:"ok"` y sale verde. El PDF de la
liquidación no salió nunca, el panel la muestra entregada, y a la mañana siguiente lo
único que existe es una fila con `estado='dead'` que hay que **saber que existe** para
ir a buscarla. Ocho minutos de señal contra un muestreo de treinta: la detección es una
moneda al aire, y aunque caiga bien el correo dice «wa-outbox (parcial)» sin el id del
mensaje ni el tenant.

**Consecuencia:** el camino por el que sale el papel que el contralor cruza contra su
contabilidad puede perder mensajes; y `docs/conocimiento/DEPLOY.md:227` sigue
prometiendo por escrito que los crons que alertan son «escalar, facturar, purgar,
wa-pendientes, runner» —cinco de siete— y que «ALERTA_EMAIL recibe un correo por cada
cron que falla». Para `wa-outbox` y `gps` esa lista es falsa.

**Causa raíz probable:** el cron nació como drenador mecánico del lease y nunca pasó por
la campaña de `codigo`/`alertarOperador` que sí recorrió a los otros seis; el estado
terminal se escribió sin escribir su lector.

---

### [ALTO] `backup-storage.yml` falló su **primera y única** corrida y va a fallar cada día, en el mismo buzón del que cuelga la única alerta de producción

`.github/workflows/backup-storage.yml:4-5`, `:24-35` ·
`docs/operacion/RESILIENCIA-DEPLOY.md:69-81` · contraste:
`.github/workflows/NOTAS-SEGURIDAD.md:3-5`

Consultado por la API de GitHub: el workflow tiene `total_count: 1`. Esa única corrida
(id 32807253039, `schedule`, 2026-08-25T03:59:52Z) terminó en **`failure`**, en el paso
3 «Fail closed si faltan secretos o destino remoto»; los pasos 4 y 5 quedaron
`skipped`. Es decir: el environment `production-backup` y/o `RESPALDO_S3_DESTINO` no
existen todavía —lo que el propio runbook admite en «Primera configuración externa
pendiente» (`:69-81`)— y el cron `17 3 * * *` va a repetir ese fallo **cada
madrugada**.

**Escenario con valores:** día 1 llega un correo de GitHub Actions «Backup Supabase
Storage: failure». Día 4 ya no se abre. Día 9, a las 03:41, `salud-produccion.yml` cae
en rojo porque producción devuelve 503 — y ese correo llega al **mismo buzón**, con el
mismo remitente, entre los ocho de backup fallido. El propio workflow de salud declara
que ese correo *es* su canal de alerta (`salud-produccion.yml:15-16`: «GitHub manda
correo al dueño del repo cuando un workflow programado falla, así que esto es una
alerta sin infraestructura nueva»).

**Consecuencia:** se encendió un generador diario de ruido sobre el único canal de
alerta que el repo tiene sin infraestructura de pago — exactamente lo que
`NOTAS-SEGURIDAD.md:3-5` argumenta que no se haga: «Un check rojo permanente es peor
que no tenerlo: enseña al equipo a ignorar la pestaña entera». Ese documento se escribió
hace dos días y este workflow lo contradice.

**Causa raíz probable:** el `schedule` se activó en el mismo commit que el script, antes
de que existiera la infraestructura externa que el propio runbook enumera como
pendiente; un `workflow_dispatch` hasta la primera corrida verde habría bastado.

---

### [ALTO] `sin_latido` deja `/api/health` en 503 **para siempre**, sin nombrar un solo cron, sin `logger.error` y sin una alerta

`src/app/api/health/route.ts:57`, `:61`, `:83-85`, `:91` ·
`src/app/api/health/route.test.ts:26-34`

La cadena de `if` de `:64-85` no cubre un caso:

- `vencidos > 0` → `degraded` + `logger.error` + `alertarOperador`.
- `noSanos > 0` → `degraded` + `logger.error` + `alertarOperador`.
- `sinLatido.length === 0` → `ok`.
- **Ningún `else`.** Si hay al menos un cron en `sin_latido` y ninguno vencido ni
  insano, `cronCheck` se queda en su valor inicial `'unknown'` (`:57`) → `status`
  `'degraded'` (`:91`) → **HTTP 503**, y lo único que se emite es
  `logger.info('metric.health', { cron: 'unknown' })` (`:94`). Ni `error`, ni alerta, ni
  el nombre del cron.

La prueba lo fija tal cual: `route.test.ts:26` — «sin latidos todavía: degraded» —
afirma `c.checks.crons === 'unknown'` y **no** afirma ninguna alerta.

**Escenario con valores, y es el que este delta arma.** Se despliega `69aa71b` con las
migraciones **0185–0188 sin aplicar** (ver el ALTO del sondeo). `cron_latido` conserva
el CHECK viejo, el upsert de `registrarLatido` rebota, `salud.ts:82` emite un `warn` y
**nunca lanza** — así que el cron nuevo queda permanentemente sin fila.
`estadoLatidos` lo devuelve `sin_latido`, `/api/health` devuelve **503 cada vez**, y
`salud-produccion.yml:42` falla **48 veces al día** con el mensaje genérico «no está
healthy (http=503 estado=degraded)». A las 3 a.m. el operador tiene: un 503, la palabra
`degraded`, y **cero** indicación de cuál de los siete crons es. El cuerpo público ya no
publica el mapa `crons` (lo quitó este delta a propósito), y —ver el ALTO siguiente— la
página `/admin/salud-sistema` tampoco lo sabe.

**Consecuencia:** el estado que más probablemente se produce justo después de un
despliegue es el único que no deja diagnóstico ni dispara el canal push, y encima
sostiene el workflow en rojo hasta que alguien adivine.

**Causa raíz probable:** el `else if` final se escribió para el caso positivo
(`sinLatido === 0 → ok`) y el caso negativo se dejó caer al valor inicial en vez de
ramificarse.

---

### [ALTO] El correo de alerta manda a `/admin/salud-sistema`, y esa página **no lee un solo latido** — la única lectora es la ruta que ya no publica los nombres

`src/lib/admin/salud.ts:17` (comentario) · `src/app/admin/salud-sistema/page.tsx` ·
`src/lib/observability/alerta.ts:152` · `src/app/api/health/route.ts:98`

Medido: `grep -rn "estadoLatidos\|leerLatido" src/ --include=*.ts --include=*.tsx`
(excluyendo pruebas) devuelve **exactamente cuatro** sitios: la definición en
`salud.ts`, la lectura de `/api/health:59`, y `leerLatido('escalar')` dentro del propio
cron de escalación (`escalar/route.ts:189`). **`/admin/salud-sistema` no aparece**, y
`/admin/observabilidad` tampoco (`grep -n latido` sobre su `page.tsx` → 0).

El comentario de `salud.ts:17` afirma lo contrario, palabra por palabra: «`estadoLatidos`:
lo que /api/health **y /admin/salud-sistema** leen». Es falso hoy.

Y cierra el círculo mal: `alerta.ts:152` pone en cada correo el botón
`{ texto: 'Ver salud del sistema', href: '${APP}/admin/salud-sistema' }`.

**Escenario con valores:** 03:07, llega el correo «[Likida] Falló cron.estado_no_ok —
Cron con resultado no sano: gps (parcial)». Javier toca el botón, entra con su sesión de
superadmin, y la página le enseña qué variables de entorno están puestas: `CRON_SECRET`
presente, QStash configurado, «Alertas de cron a j***@…». De los latidos, **nada**. Peor:
`page.tsx:146-154` sigue diciendo «Crons — CRON_SECRET … Escalar, facturar y purgar lo
exigen» — **tres** crons, cuando hay siete desde hace dos semanas. Para saber cuál cron
falló hay que leer el cuerpo del correo, y para saber *qué* falló hay que abrir Sentry.

**Consecuencia:** el aparato de latidos —que es bueno— tiene exactamente **un** lector,
y ese lector es un endpoint público que este delta despojó del detalle a propósito
(`route.ts:98` publica `checks: { db, crons }` agregados). La superficie humana de
operación quedó ciega justo cuando la máquina empezó a alertar bien.

**Causa raíz probable:** al endurecer `/api/health` contra fuga de infraestructura se
quitó el detalle sin darle casa en la página de superadmin, que era la que podía
mostrarlo sin exponerlo.

---

### [ALTO] El sondeo de arranque sigue congelado en la 0171 — hoy son **15** migraciones sin sonda, y el camino de despliegue que sí se usa no aplica ninguna

`src/lib/likida/startup.ts:287-294` · `src/lib/likida/startup_diagnostico.test.ts:361`
· `.github/workflows/deploy-preview-promote.yml:187-215` · `vercel.json:3`
· (REINCIDENTE, y numéricamente peor)

`COLUMNAS_RECIENTES` sigue con seis entradas y la última sigue siendo **`0171`**.
Recuento de hoy (`ls supabase/migrations | tail`): existen `0172`…`0188`, sin `0179`,
o sea **16 migraciones** posteriores. Solo `0172` tiene sonda propia
(`startup.ts:227-250`). Quedan **15 sin sonda**, entre ellas
`0185_qa_panel_tablas`, `0186_runtime_idempotencia_y_presupuesto`,
`0187_wa_evento_pendiente_leases_fencing` (381 líneas, RPCs que `wa_pendientes.ts`
llama) y `0188_runtime_idempotencia_clock`.

La prueba que debería empujar la lista sigue sin poder: `startup_diagnostico.test.ts:361`
es un `expect.arrayContaining(['0119','0132','0149','0168','0169','0171'])` sobre un
literal fijo — pasa para siempre sin que se añada una entrada más.

**Lo nuevo, y es lo que sube la apuesta:** este delta escribió un flujo que **sí** aplica
migraciones (`deploy-preview-promote.yml:187-215`, `supabase db push` tras dry-run en
staging y confirmación literal), pero es `workflow_dispatch` con `promote=true`, y
**cuatro de los seis commits del delta se publicaron por el otro camino**: la bandera
`[deploy]` del `ignoreCommand` (`vercel.json:3`), que construye y despliega **sin tocar
la base**. `DEPLOY.md` no menciona `db push` ni una vez (`grep` → 0); el único doc que
lo describe es `RESILIENCIA-DEPLOY.md`, que describe el flujo que no se usó.

**Escenario con valores:** `69aa71b` sale por `[deploy]` y nadie corre `supabase db
push`. `reclamar_wa_outbox` y las RPC de `0187` no existen; el cron cae al `catch`
(`wa-outbox/route.ts:77-81`), devuelve **500 cada minuto**; `registrarLatido('wa-outbox',
'fallo')` rebota contra el CHECK viejo y solo deja un `warn`; `/api/health` reporta
`sin_latido` → 503 permanente **sin nombrar el cron** (ALTO anterior). El único rastro
por mensaje son `logger.error` en el runtime log de Vercel, cuya retención
`DEPLOY.md:277-279` sigue declarando **desconocida**.

**Consecuencia:** el sondeo existe justamente para que un despliegue adelantado a su base
grite; hoy cubre hasta una migración de hace dos semanas, y el commit que trajo cuatro
migraciones nuevas no tocó la lista que las vigila.

**Causa raíz probable:** lista literal mantenida a mano cuya prueba se escribió con
`arrayContaining` (contiene *al menos*), que por construcción no puede exigir
crecimiento; y dos caminos de despliegue documentados en dos archivos que no se citan.

---

### [ALTO] El panel de QA parcha el `logger` **global del proceso**: dos corridas solapadas lo dejan parchado para siempre

`src/lib/admin/qa-motor.ts:102-119`, `:384`, `:578-580` · `src/lib/logger.ts:162-167`
· `src/app/api/admin/qa/lanzar/route.ts:69-84`

`logger` es un objeto literal exportado (`logger.ts:162`), o sea mutable y compartido
por todo el proceso. `capturarBitacora()` reasigna `logger.info/warn/error`
(`qa-motor.ts:105-110`) al arrancar la corrida (`:384`) y los restaura en el `finally`
(`:578-580`). Mientras dura —hasta `TECHO_CORRIDA_MS = 110 s` (`:52`)— **todo** lo que
cualquier petición concurrente de esa misma instancia loguee se empuja al array
`eventos`, y el oráculo #8 (`bitacora_registro`) juzga la corrida con esos eventos
ajenos.

Y no hay candado: `/api/admin/qa/lanzar` valida tope diario y banco de fotos, pero
`:69-84` no toma ningún lock — crea la corrida y la lanza en `after()`.

**Escenario con valores:** Javier abre `/admin/qa`, lanza el escenario A, la pestaña
tarda y le da lanzar otra vez (o abre una segunda pestaña) a los 20 s. Instancia caliente,
mismo proceso:

1. A parcha: guarda como `originales` las funciones reales.
2. B parcha: guarda como `originales` **los wrappers de A**.
3. A termina primero y restaura las **reales**.
4. B termina y restaura **los wrappers de A**.

A partir de ahí el `logger` del proceso queda envuelto de forma **permanente**,
empujando cada línea de log de cada webhook de WhatsApp, cada cron y cada render al
array `eventos` de una corrida ya terminada, que nadie libera. Es una fuga de memoria en
la instancia de producción y una contaminación silenciosa del veredicto de QA: el
oráculo #8 puede pasar porque *otra* petición emitió `agent.run`.

**Consecuencia:** una superficie de QA puede corromper el aparato de observabilidad del
que dependen todos los demás hallazgos de este rubro, en la misma instancia de
producción donde `supabaseAdmin()` siembra tenants reales (`qa-motor.ts:129`).

**Causa raíz probable:** se capturó la bitácora parchando el módulo compartido en vez de
pasar un colector por el contexto de la corrida —teniendo ya `AsyncLocalStorage` en el
repo (`lib/llm/runtime-signal.ts:4`) para exactamente esto.

---

### [ALTO · REINCIDENTE] La entrevista de onboarding escribe el receptor CFDI y, si la escritura falla, no queda **una sola línea** en el servidor

`src/lib/likida/perfil/entrevista-aplicar.ts:145-146`, `:177-178`, `:186-187` ·
`src/app/api/dashboard/onboarding-chat/route.ts:78`

Sin cambios desde la ronda 19, verificado hoy con `grep -n "catch|logger|notas.push"`:
`:145-146` (`guardarDatosFiscales` — RFC, razón social, régimen SAT, CP) y `:177-178`,
`:186-187` (`crearOperador`, `crearUnidad`) siguen haciendo `notas.push(e.message)` **sin
`logger`**. Solo `:167-169` (`guardarPolitica`) emite un `warn`, y sin `tenantId`. Y
`onboarding-chat/route.ts:78` sigue siendo `logger.error('onboarding_chat.turno', { err })`
**sin `tenantId` ni `userId`**, teniendo los dos en alcance — una regresión respecto de
`dashboard/chat/route.ts`, que sí los nombra. El escenario está desarrollado en
`operabilidad.md:153-197`; no lo repito.

---

### [ALTO · REINCIDENTE] Los seis bloques de dinero de la batería siguen indultados, sin fecha ni tope

`scripts/ci/correr-verificaciones.mjs:389-409`, `:411-427`

`SIN_CALIFICAR_CONOCIDOS` sigue con **19** entradas, idénticas, incluidos `RPCS_0159`
(el sobrepago), `AGREGADOS_0150`, `FISCAL_AGREGADO_0151`, `REGISTRO_0154`,
`PURGAS_0155` y `STRIPE_0163`. Lo bueno se mantiene: un bloque **nuevo** que el parser
no sepa leer rompe el CI (`:411-426`), y los dos bloques que este delta añadió
(`RUNTIME_CLOCK_0188`, 11 claves contra 11 esperados; `QA_PANEL_0185`, 8 contra 8) sí
alinean, así que la puerta funcionó. Lo que no se movió: la lista se hizo permanente sin
presupuesto de bajada. Escenario en `operabilidad.md:284-314`.

*(Salvedad honesta, la misma: aquí no hay Postgres. Esto es lectura del parser y de la
lista, no una corrida.)*

---

### [MEDIO] El kill switch apagado deja `wa-outbox` **sin registrar latido**, y a los 21 minutos el sistema reporta un cron muerto que en realidad está apagado a propósito

`src/app/api/cron/wa-outbox/route.ts:37-40` · `src/lib/admin/salud.ts:51`, `:113` ·
contraste: `gps/route.ts:51` y `facturar/route.ts:348`

Los otros dos crons que consultan la palanca registran `registrarLatido(…, 'saltado')`
al salir por apagado. `wa-outbox:37-40` hace `logger.warn` y **`return`** sin registrar
nada.

**Escenario con valores:** el operador apaga el interruptor `global` desde
`/admin/observabilidad` para hacer mantenimiento a las 02:00. `wa-pendientes` deja de
encolar, `wa-outbox` deja de latir. `CADENCIA_MS['wa-outbox'] = 60_000` más
`TOLERANCIA_LATIDO_MS = 20 min` (`salud.ts:35,51`): a las **02:21** `juzgarLatido`
(`:113`) lo declara **`vencido`**, `/api/health:64-70` emite
`logger.error('health.cron_vencido')` y manda un correo que dice «Sin latido: wa-outbox
(hace 21 min)» — el diagnóstico de un cron **muerto**, no de uno apagado. Con `gps`, que
sí registra `'saltado'`, pasa lo simétrico pero mejor: cae en la rama `noSanos` y el
correo al menos dice `gps (saltado)`.

**Consecuencia:** una acción deliberada y documentada del operador produce, 21 minutos
después, una alerta que apunta a la causa equivocada — y arde el piso de una hora del
evento `cron.sin_latido`, que es global en Redis (`alerta.ts:66-87`): un fallo **real**
de otro cron dentro de esa hora se queda callado.

---

### [MEDIO] El smoke que autoriza promover a producción son **tres páginas públicas**

`scripts/ci/playwright-smoke.mjs:10` · `.github/workflows/deploy-preview-promote.yml:168-185`,
`:217-235` · `docs/operacion/RESILIENCIA-DEPLOY.md:125`

`const routes = ['/', '/terminos', '/privacidad']`. El job `promote` depende de `smoke`
(`:219`) y el runbook lo presenta como la validación previa a producción. Es honesto en
que no toca secretos, pero conviene nombrar el techo: los **dos** incidentes reales de
este delta —`/dashboard/despacho` roto nueve días (server action tras sesión) y el
esquema de OCR que hizo que OpenRouter devolviera 400 en cada foto— son **invisibles**
para estas tres rutas, y la segunda ni siquiera es una página. Un gate llamado «smoke»
que aprueba una promoción hace creer que se probó algo del producto.

---

### [MEDIO · REINCIDENTE] `/api/health` sigue pública y sin límite de tasa, y ahora hace más trabajo por GET anónimo

`src/app/api/health/route.ts:1-6`, `:42`, `:46-47`, `:59`, `:67`

Sigue sin importar `rateLimit` (compárese con `export/poliza/route.ts`, que lo llama dos
veces). Cada GET anónimo dispara: un `count` sobre `tenant` (`:47`), un `select` completo
de `cron_latido` (`salud.ts:121-123`) y, si el estado está degradado, un `SET NX PX`
contra Upstash por petición (`alerta.ts:71-76`). El correo sí está acotado por el piso de
una hora; **las dos consultas a la base no están acotadas por nada**. Un bucle desde una
IP cualquiera multiplica lectura de Postgres en el proyecto de producción sin autenticarse.

---

### [MEDIO · REINCIDENTE] `DEPLOY.md` sigue sin nombrar las variables que hoy deciden si el sitio arranca, y la guardia no puede cazarlas

`docs/conocimiento/DEPLOY.md:218-226` · `src/lib/observability/arranque.ts:44-77` ·
`src/lib/legal/config.ts:8-18`

Medido con `grep -c` sobre `DEPLOY.md`: **0** para `FACTURACION_PILOTO`,
`FACTURACION_MODO`, las cuatro `CALCOM_*`, el nuevo `SENTRY_TRACES_SAMPLE_RATE`
(sí está en `.env.example`), y **0** para las **ocho** `LEGAL_*` que este delta
introdujo — de las cuales cuatro (`LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_ADDRESS`,
`LEGAL_JURISDICTION`, `LEGAL_CONTACT_EMAIL`) **tumban toda página en producción** si
faltan (`layout.tsx:55`). `RESPALDO_REQUIRE_REMOTE` no está en ninguno de los dos.

`SILENCIOSAS` (`arranque.ts:45-77`) sigue con **siete** entradas y ninguna es una de
esas, así que la guardia de `runbook.test.ts` solo puede exigir que el runbook nombre lo
que alguien ya se acordó de meter en la lista. La tabla de `DEPLOY.md` tiene ocho
variables y da la impresión de ser exhaustiva.

---

### [MEDIO · REINCIDENTE] `scripts/demo-5k.sql` sigue muriendo en su primer `insert`

`scripts/demo-5k.sql:48`

Sin tocar: `{"concepto":"caseta","topeMonto":5000},   -- una línea del estado del TAG por
viaje` vive **dentro** del literal `'{"empresa":…}'::jsonb` que abre en `:44`. Dentro de
comillas simples `--` no es comentario. Escenario en `operabilidad.md:318-347`.

---

### [MEDIO · REINCIDENTE] `.latido-salud` lleva **15 días** muerto y nada lo nota

`.latido-salud:1`

`fecha: 2026-08-10`, cuerpo «3157 passed … 252 archivos» contra las ~6,506 pruebas que
el propio `69aa71b` reporta. `grep -rn latido-salud` fuera de `docs/auditoria-*` sigue
devolviendo **una sola** coincidencia: el prompt que lo escribe.

---

### [BAJO] El comentario de `ci.yml` dice que la auditoría «omitía devDependencies» cuando el cambio hizo justo lo contrario

`.github/workflows/ci.yml:63-64`, `:67-82` · `package.json:16`

El diff cambió `npm audit --audit-level=high` por `npm audit --omit=dev
--audit-level=high` y añadió un reporte de dev **`continue-on-error: true`** a nivel
`moderate`. `npm audit` **incluye** devDependencies por defecto: la versión anterior sí
las bloqueaba a nivel `high`; la nueva no bloquea ninguna. El comentario que justifica el
cambio afirma lo inverso.

Lo corrí sobre el HEAD de hoy: `npm audit --audit-level=high` → **0 vulnerabilities**, y
`--omit=dev` igual. **No hay daño vivo**, y la política runtime-only ya estaba escrita en
`NOTAS-SEGURIDAD.md:13-14`. Lo que queda es que un CVE alto en la cadena de build
(Vite/esbuild/Vitest) hoy pasa el CI en verde, y el comentario del archivo enseña lo
contrario a quien lo lea.

---

### [BAJO · REINCIDENTE] El README anuncia un panel borrado y `npm run setup` falla en una máquina limpia

`README.md:81` · `package.json:15` · `scripts/seed.sh:11-15`

`README.md:81` sigue listando **`/chofer`**; `ls src/app` no lo tiene desde el 7-ago.
`"setup": "npm install && npm run seed"` sigue terminando en `❌ Falta DATABASE_URL` con
`exit 1` después de instalar.

---

### [BAJO · REINCIDENTE] El piloto de visión sigue con cuatro salidas de fallo y cero `alertarOperador`

`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:125`, `:157`, `:210`, `:259`

`0156cf3` tocó el archivo y no cambió esto: `warn`, dos `info` y un `error`, todos con
`comercio.clave` y **sin `tenantId` ni el id del gasto**, y ni una llamada a
`alertarOperador`. Baja a BAJO respecto de rondas anteriores porque el piloto está detrás
de `FACTURACION_PILOTO` y hoy no hay clientes; la ficha completa está en
`operabilidad-c4.md:117-139`.

---

## Lo que revisé y está bien

- **El latido dejó de medir solo presencia.** `health/route.ts:62-63` es el arreglo
  exacto que pedí: `noSanos` = fresco **y** `ultimoEstado !== 'ok'` → `degraded` +
  `logger.error('health.cron_estado_no_ok', { crons, estados })` + `alertarOperador`. Y
  `salud-produccion.yml:40-42` lo consume de verdad: parsea `status` con node y falla si
  no es `ok`, en vez del `grep '"ok":true'` de antes. Corrí
  `npx vitest run src/app/api/health/route.test.ts src/lib/observability/sentry.test.ts
  src/lib/admin/salud.test.ts src/lib/observability/runbook.test.ts
  src/lib/admin/qa-panel.test.ts` → **41 passed**, y `route.test.ts:73` fija la regla
  («un latido fresco en fallo también degrada: frescura no oculta el resultado»).
- **`lint:ratchet` es el arreglo correcto de mi MEDIO del techo, y funciona.** Lo
  ejecuté: `Lint ratchet OK: 156/157 warnings heredados; 0 nuevos; 0 errores`. El
  cliqueo por `archivo::regla` (`lint-ratchet.mjs:58-60`) impide mover deuda de un
  archivo a otro, `errors → exit 1` (`:62`), y el baseline (`ci/eslint-warnings-baseline.json`,
  81 claves) está versionado. `ci.yml:73` ya usa `lint:ratchet` y no `lint`.
- **`scripts/test-resiliencia.sh` prueba de verdad, y pasa.** Lo corrí: `OK: pruebas
  offline de resiliencia`. No es un `bash -n`: altera un byte del backup y exige que el
  SHA lo rechace (`:26-30`), mete `..` en el **bucket** (`:46-51`), pone un symlink como
  padre del origen (`:57-62`) y del destino (`:68-73`), y uno en el archivo final incluso
  con `--overwrite` (`:78-83`), comprobando después que el archivo de fuera no se tocó.
  Es el mejor archivo nuevo del rubro.
- **`global-error.tsx` es ejemplar y sigue en pie.** Reemplaza el `<html>` entero, con
  hex literales y la cascada de fuentes por nombre porque `globals.css` puede no haber
  llegado; el `digest` **en pantalla y `select-all`**; una línea `app.global_error` con
  ese mismo digest; y un `<a href>` en vez de `<Link>` con su porqué escrito. Los cinco
  `error.tsx` nuevos de `/admin` reexportan uno solo (`admin/error.tsx`) que hace lo
  mismo: `logger.error('admin.boundary', { digest, err })` y el código en pantalla.
- **El endurecimiento de Sentry es correcto y está probado.** `sentry.ts` añade
  `beforeSend: sanitizarEventoSentry` que borra `user`, `extra`, `request.headers`,
  `request.cookies`, `request.data` y **el query string** de `request.url`, y limpia
  `data` de cada breadcrumb; `tasaTrazas()` acota a `[0,1]` con default 0.05 y tolera
  basura. `sendDefaultPii:false` sigue.
- **Supply chain: las Actions quedaron fijadas por SHA de 40 caracteres con comentario de
  versión** (`checkout@3d3c42e5…`, `setup-node@82076278…`, `codeql-action@db488dde…`,
  `upload-artifact@ea165f8d…`), el Postgres de CI al digest, y `dependabot.yml:58` con
  `rebase-strategy: auto` para mantenerlos. `codeql.yml:52-70` ya no puede salir verde a
  ciegas: consulta `security_and_analysis.advanced_security.status` y falla si el repo es
  privado sin GHAS — y sigue siendo `workflow_dispatch`, así que no genera rojo
  permanente.
- **`RESILIENCIA-DEPLOY.md` es honesto donde importa.** «Un objetivo no es un SLA. Hasta
  ejecutar la primera corrida programada y un restore drill con cronómetro, el estado
  contractual es **no demostrado**» (`:16-17`), y una lista numerada de seis pasos de
  configuración externa pendiente (`:69-81`). `deploy-preview-promote.yml` fija el ref a
  un SHA inmutable de 40 caracteres (`:47-53`) y lo reusa en los seis jobs, exige la
  confirmación literal antes de tocar producción (`:61-64`, `:209`), y `promote` verifica
  que `production_migrations.result == 'success'` (`:235`). `rollback-production.yml` no
  adivina «el anterior»: exige la URL HTTPS exacta y `ROLLBACK_PRODUCTION`.
- **`ci-postgres` está verde en `master` en los seis commits del delta.** Runs #381
  (`8b43121`), #404 (`99e3544`), #412 (`6340aac`), #415 (`0156cf3`), #426 (`1d327f7`) y
  #429 (`69aa71b`), todos `success`. Ninguna migración entró a master con el RLS roto.
- **`supabaseAdmin()` hereda la señal de la tool sin perder el backstop.**
  `admin.ts:32-38`: si hay señal de tool, combina (init + tool + `AbortSignal.timeout`);
  si no la hay, respeta la del llamador como antes. `currentToolSignal()` se resuelve por
  `AsyncLocalStorage` en cada `fetch`, no al construir el cliente cacheado, así que el
  singleton no fija una señal vieja.
- **Los dos bloques nuevos de `verificaciones.sql` sí califican.** `RUNTIME_CLOCK_0188`
  (11 claves / 11 esperados) y `QA_PANEL_0185` (8 / 8) alinean, así que la puerta de
  `:411-426` los habría roto si no.
- **`npx tsc --noEmit -p .` → limpio.** `npm run lint:ratchet` → 0 errores. Las dos
  puertas de lectura pasan sobre el HEAD de hoy.
- **El panel de QA falla cerrado antes de gastar.** `qa/lanzar/route.ts:51-57`: si no se
  puede **leer** el gasto del día devuelve 502 («no se lanza a ciegas»), y si tocó
  `TOPE_DIA_USD` devuelve 429. Las fotos se validan contra el banco antes de arrancar
  (`:61-67`), no a media corrida. Y un aborto **conserva** el tenant como evidencia
  (`qa-motor.ts:376-378`) en vez de borrar la escena del crimen.

---

## Lo que NO alcancé a revisar

- **Qué sha corre de verdad en producción.** El proxy de este entorno bloquea
  `app.likida.ai` (`curl … 403 CONNECT tunnel failed`), y —por el CRÍTICO 1— **el repo
  tampoco lo sabe**: el paso que lo compara nunca se ha ejecutado. Lo máximo demostrable
  es `≥ 0156cf3`, deducido de que el campo `status` existe en el cuerpo. Se cierra en
  segundos con un `curl -s https://app.likida.ai/api/health` desde una máquina con
  salida, o disparando `salud-produccion.yml` por `workflow_dispatch` (donde el paso de
  sha también queda `skipped`, así que hoy ni eso lo contesta).
- **Si `ALERTA_EMAIL` está puesta en Vercel.** Quinta ronda pidiéndolo, y ahora es
  **más difícil**: este delta quitó `sentry` y `ratelimit` del cuerpo de `/api/health`
  (estaban en `8b43121:route.ts:88-90`), que era la única lectura externa sin
  credenciales. Hoy solo lo dice `/admin/salud-sistema:109-116` detrás de sesión de
  superadmin. Del correo cuelgan las alertas de los siete crons.
- **La batería contra un Postgres real.** No hay `psql` ni base aquí. El ALTO del runner
  es lectura del parser y de `SIN_CALIFICAR_CONOCIDOS`, no una corrida.
- **La retención real de los runtime logs de Vercel y si hay log drain.**
  `DEPLOY.md:277-279` lo declara pendiente desde hace rondas. De ello dependen el
  CRÍTICO del outbox (que solo deja logs) y el ALTO del sondeo de arranque.
- **`scripts/respaldo-storage.sh`** (+317/−155 en este delta). Leí el workflow que lo
  llama y el runbook, no el script. Su gemelo de restore sí quedó cubierto por
  `test-resiliencia.sh`; el de respaldo no tiene prueba equivalente.
- **`scripts/qa/importar-ledger.ts` (139 líneas, nuevo)** y el resto de `qa-storage.ts`
  / `qa-motor.ts` más allá de la corrida y el parche del logger.
- **Si dos corridas de QA caen de verdad en la misma instancia de Vercel.** El defecto de
  anidamiento es de lectura del código (`qa-motor.ts:104-110`); la probabilidad concreta
  depende del modelo de concurrencia del plan, que no puedo consultar desde aquí. La
  contaminación **dentro** de una sola corrida no depende de eso y ocurre siempre.
