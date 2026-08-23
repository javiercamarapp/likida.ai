# Operabilidad y DX — auditoría 18

**Nota: 7/10** (antes 6). Razón del movimiento: **se atacó y subió**, pero no
hasta el ancla de 8. Desde la ronda 2 se construyó y se cableó de verdad la
maquinaria: `onRequestError` cubre todas las superficies web con el `digest` que
el contralor lee en pantalla; el `logger` dejó de destruir los identificadores
(`huellaId` es lo que hace reconstruible una línea a las 3 a.m.); el
`fingerprint` de Sentry aprendió a discriminar por tenant y causa; el `flush` se
llama en el único `after()` del repo; existe un canal de correo al operador
(`alerta.ts`) y una pantalla que **mide** en vez de decorar
(`/admin/salud-sistema`). Lo que impide el 8 no es limpieza de código: es que el
**camino del dinero no tiene una sola alerta empujada** — `alertarOperador`
aparece exclusivamente en `src/app/api/cron/*` —, que el modo de falla más
plausible del sistema deja los cinco crons en **verde**, y que el documento al
que se acude a las 3 a.m. afirma que ese canal de alerta no existe.

**El riesgo mayor de hoy:** un hipo de lectura sobre la tabla `interruptor`
apaga los cinco crons y el intake de WhatsApp, los deja devolviendo **HTTP 200**
en el panel de Vercel, sin correo y sin fila en `agente_corrida` — la forma
exacta del incidente de nueve días que esta maquinaria se construyó para no
repetir.

## Hallazgos

### [ALTO] El sondeo de arranque borra el mutex de un viaje real del camino del dinero

`src/lib/likida/startup.ts:63-70` · `supabase/migrations/0005_concurrencia.sql:45-51`

`verificarMigracionesCriticas()` sondea la migración 0005 así:

```ts
const { data: viajeReal } = await admin.from('viaje').select('id').limit(1);
if (viajeReal?.[0]?.id) {
  const { error } = await admin.rpc('try_lock_viaje', { p_viaje: viajeReal[0].id, p_ttl_ms: 1 });
  ...
  await admin.rpc('unlock_viaje', { p_viaje: viajeReal[0].id }); // liberar el lock de prueba
}
```

El `unlock_viaje` de la 0005 es `delete from viaje_lock where viaje_id = p_viaje`
— **sin comprobar propiedad**. Y la llamada de :70 corre incondicionalmente: no
mira si `try_lock_viaje` devolvió `true`. El comentario («liberar el lock de
prueba») asume una propiedad que el código nunca verificó.

**Escenario, 3 a.m.** El chofer manda "listo" del viaje `9d1f…`. `conv.ts:426`
toma el lease con `ttlMs = 60_000` y arranca los 13 pasos del cierre. A los 8
segundos entra otro mensaje por WhatsApp en una **instancia fría**: Next corre
`register()`, que llama a `verificarMigracionesCriticas()`; `select id from viaje
limit 1` (sin `order by`) devuelve `9d1f…`; `try_lock_viaje(9d1f…, 1)` devuelve
`false` —no hay `error`, así que **no se emite ni una línea**— y acto seguido
`unlock_viaje(9d1f…)` **borra el lease que la liquidación en vuelo está
usando**. La segunda invocación adquiere el mutex y el "listo" puede cuadrar
sobre gastos parciales: exactamente lo que la 0005 existe para impedir
(«un "listo" puede cerrar el viaje ANTES de que el OCR de la última foto guarde
su gasto», 0005:17-20). En el log no queda **nada**: el probe silencioso no
escribe, y la liquidación corta se emite como una liquidación normal.

**Consecuencia para quien opere esto:** el contralor recibe un PDF que no cuadra
con sus comprobantes, y no hay una sola línea que relacione ese cierre con un
arranque en frío. El único backstop que sobrevive es
`liquidacion_viaje_uidx`, que impide la liquidación DOBLE, no la CORTA.

**Causa raíz probable:** un diagnóstico de solo-lectura se escribió con una RPC
que **muta**, sobre una fila de producción elegida arbitrariamente, y sin usar
el valor de retorno del `try_lock` que le habría dicho que ese lock no era suyo.

---

### [ALTO] El fail-closed del kill switch deja los cinco crons en verde y sin correo

`src/lib/likida/interruptores.ts:72-78` · `src/app/api/cron/escalar/route.ts:79-82` ·
`facturar/route.ts:277-283` · `purgar/route.ts:77-80` · `wa-pendientes/route.ts:65-68` ·
`runner` (vía `correrRunner`)

`estaApagado()` falla cerrado a propósito y **lo grita** (`logger.error
('interruptores.lectura_fallo')`). El problema es lo que hacen los llamadores
con ese `true`: los cinco crons responden `NextResponse.json({ corrio: false,
saltado: 'interruptor global' })` — **status 200**.

**Escenario, 3 a.m.** Supabase tiene un bache de conexiones de 40 minutos (o
alguien toca las policies de `interruptor`). A las 03:00 `escalar` pregunta, no
puede leer, se salta. A las 03:30 `facturar` igual. A las 03:05, 03:10, 03:15…
`wa-pendientes` igual — y ése además usa `logger.info`
(`wa-pendientes/route.ts:66`), nivel que **ni siquiera llega a Sentry**
(`logger.ts:157`). A la mañana siguiente:

- panel de Crons de Vercel: **cinco verdes**, 200 en todas las corridas;
- `ALERTA_EMAIL`: **cero correos** — `alertarOperador` no se llama en la rama
  del `saltado`;
- `/admin/observabilidad` y la campana: `corridasFallo = 0`, porque una corrida
  que se salta **no escribe fila en `agente_corrida`**;
- Sentry: **un** issue, `interruptores.lectura_fallo`, con meta
  `{ interruptor: 'global', err: 'fetch failed' }` — sin `codigo` ni `tenant`,
  así que `discriminadores()` (sentry.ts:161-169) devuelve `[]` y el
  fingerprint es `['interruptores.lectura_fallo','error']`: si ese issue ya
  nació alguna vez, **no vuelve a notificar**.

Y mientras tanto la bandeja durable de WhatsApp no se drena: los mensajes que el
webhook persistió esperan a un cron que se está saltando en silencio.

**Consecuencia para quien opere esto:** es el incidente documentado en
`api/health/route.ts:12-14` («el cron del camino del dinero tronó cada hora
durante nueve días») reproducido con la maquinaria nueva puesta, porque el
`saltado` no cuenta como fallo en ninguno de los cuatro tableros.

**Causa raíz probable:** «apagado a propósito no es un fallo» se aplicó también
al caso en que **no se pudo saber** si estaba apagado. Los dos comparten código
de salida y no comparten severidad.

---

### [ALTO] El runbook de las 3 a.m. dice que el canal de alerta no existe, y su prueba de deriva no puede notarlo

`docs/conocimiento/DEPLOY.md:97-114` y `:145-149` · `src/lib/observability/arranque.ts:52` ·
`src/lib/observability/runbook.test.ts:104-109`

`arranque.ts:52` declara `ALERTA_EMAIL` como variable silenciosa («los fallos de
cron no le llegan a nadie por correo») y `alerta.ts` la usa como el único canal
push del sistema. **`ALERTA_EMAIL` no aparece en un solo archivo `.md` del
repo** (verificado con `grep -rn ALERTA_EMAIL --include=*.md`). Peor: DEPLOY.md
:145-149 afirma, bajo "Lo que este runbook NO cubre":

> **Quién recibe qué cuando algo falla.** Hoy no hay nadie asignado ni ningún
> canal.

La tabla de "variables que deben estar en Vercel" (:103-106) lista dos
—`SENTRY_DSN`, `DEMO_TENANT_ID`— de las **cuatro** que hoy tiene `SILENCIOSAS`.
Y la guardia que debería impedir esta deriva la cierra en falso:
`runbook.test.ts:106` itera sobre un literal `['SENTRY_DSN', 'DEMO_TENANT_ID']`
en vez de sobre `SILENCIOSAS`, así que las dos que se agregaron después
(`NEXT_PUBLIC_APP_URL`, `ALERTA_EMAIL`) entraron al código sin que la prueba
—cuya cabecera promete que «`.env.example` y `DEPLOY.md` son parte del sistema,
no prosa suelta»— dijera nada. Los 53 tests de `src/lib/observability` pasan.

**Escenario, 3 a.m.** El cron `facturar` falla contra Facturapi. `alertarOperador
('cron.facturar', {error, codigo})` corre, lee `process.env.ALERTA_EMAIL`, no
está (nadie la puso: no está en la tabla del runbook), emite
`logger.info('alerta.sin_configurar')` **una vez por instancia** —nivel `info`,
que no llega a Sentry— y devuelve. A la mañana siguiente Javier abre DEPLOY.md,
lee que no hay canal de alerta, y concluye que el silencio es lo esperado.

**Consecuencia:** el único canal push del producto está construido, probado (10
tests en `alerta.test.ts`) y desconectado, y el documento operativo instruye
activamente a no buscarlo. Es la forma exacta del hallazgo de la auditoría 5
—`SENTRY_DSN` cableado y ausente del entorno— repetida sobre la variable nueva.

**Bonus verificado del mismo archivo:** DEPLOY.md:47 manda buscar
`startup.entorno`, un `msg` que **no existe** — el código emite
`startup.entorno_grupos` (arranque.ts:98,101) —, y no menciona
`startup.config_silenciosa`, que es la línea que dice qué falta. Un `grep` a las
3 a.m. contra el nombre del runbook devuelve cero resultados sobre un sistema que
sí está gritando.

---

### [MEDIO] El `codigo` estable de la causa nunca llegó al camino del dinero

`src/lib/observability/sentry.ts:238-276` · `src/lib/likida/processor.ts:2494` y `:2531` ·
`src/app/api/webhook/whatsapp/route.ts:258` y `:263`

`codigoDeError()` se escribió con esta justificación literal: «Los catch de los
cron emitían solo `{error}`, y el mensaje NO entra al fingerprint: dos causas
distintas caían en el mismo issue viejo de Sentry, que ya no notifica». Se
aplicó en **los cinco archivos de `api/cron/`** y en ninguno más
(`grep -rn codigoDeError src/` → 10 usos, todos en `api/cron/*`).

**Escenario, 3 a.m.** Flota A, viaje cerrado. `sendDocument` es rechazado por
Meta con `codigo: 131047` y `processor.ts:2494` sí emite `codigo` — bien. Un mes
antes, la misma flota tuvo un fallo del **otro** `pdf.no_entregado`, el de
:2531, que emite `{tenant, viaje, pdfGenerado, err}` **sin `codigo`**. Los dos
producen fingerprint `['pdf.no_entregado','error','id:9f2c1a4b77de']` salvo por
ese campo: cualquier segunda causa distinta que caiga en el `catch` de :2531
—`storage no devolvió URL firmada` hoy, un `TypeError` de `pdf-lib` mañana— cae
en el issue viejo y **no genera notificación**. Lo mismo en el webhook:
`logger.error('processInbound', { id: f.id, err })` (route.ts:258) no lleva
`tenant`, `viaje` ni `codigo` → fingerprint `['processInbound','error']`: **un
solo issue para todos los fallos de procesamiento de todas las flotas, para
siempre**.

**Consecuencia:** el mecanismo que convierte "la flota B también falla" y "ahora
falla por otra causa" en una notificación existe y está apagado justo en las
tres líneas que reportan que una liquidación real no llegó.

---

### [MEDIO] `cron/runner` es el único cron sin correo y sin código de causa

`src/app/api/cron/runner/route.ts:37-43`

Corre cada 4 h (`vercel.json`), gasta dinero de modelo y fabrica piezas hacia la
bandeja de aprobaciones. Su `catch` emite
`logger.error('cron.runner.fallo', { err })` — sin `codigoDeError`, sin
`alertarOperador`. Los otros cuatro crons tienen las dos cosas.

**Escenario, 3 a.m.** El runner falla a las 00:00, 04:00, 08:00… Vercel pinta la
corrida roja (el 500 sí está bien puesto) y Sentry crea **un** issue
`['cron.runner.fallo','error']` que notifica la primera vez. Seis fallos al día
durante una semana = 42 eventos, una notificación, cero correos. Nadie mira el
panel de Crons de Vercel a diario.

**Consecuencia:** el orquestador de agentes autónomos puede estar muerto días sin
que el único canal push del sistema diga una palabra.

---

### [MEDIO] `npm install` depende de un host fuera del registry: no se puede instalar ni desplegar un hotfix

`package.json:45` · `package-lock.json:11305-11308`

```json
"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
```

Verificado en esta corrida: `curl -I https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
→ `CONNECT tunnel failed, response 403`. El lockfile fija ese mismo `resolved`,
así que **`npm ci` no tiene camino alterno**: no hay `.npmrc` con mirror ni
registry alternativo en el repo.

**Escenario, 3 a.m.** Hay que publicar un arreglo. `ci.yml:47` (`npm ci`) y el
`npm install` que Vercel corre antes de `next build` pegan los dos a
`cdn.sheetjs.com`. Si ese host está caído, bloqueado por la política de red del
runner, o simplemente retira la versión 0.20.3 (no hay retención garantizada
fuera del registry), **CI se pone rojo y el deploy falla** por una dependencia
que solo usan tres archivos
(`src/app/dashboard/viajes/page.tsx:2`, `intake/desglose_peaje.ts:35`,
`intake/archivo.test.ts:2`), ninguno del camino del dinero. El mensaje de fallo
es un 403 de red, no algo que se pueda arreglar con código.

**Consecuencia:** un tercero ajeno al registry de npm tiene voto sobre si Likida
puede desplegar. Y, del lado DX, `npm run setup` (=
`npm install && npm run seed`) **no deja el proyecto corriendo en una máquina
limpia**: si el `install` sobrevive, `seed.sh:11-15` sale con código 1 sin
`DATABASE_URL`, y no hay paso que genere `.env.local`. (El script `setup` está
en `package.json:15`.)

---

### [MEDIO] El diagnóstico de configuración está apagado justo donde vive el desarrollador

`src/lib/observability/arranque.ts:65-66` · `src/lib/observability/sentry.ts:70-71` ·
`src/lib/env.ts:49-56`

`avisarConfiguracionSilenciosa()` y `avisarObservabilidad()` arrancan con
`if (!desplegado) return;`. `desplegado` es `VERCEL_ENV || NODE_ENV==='production'`,
así que en `npm run dev` **nada de esto se emite**, incluido
`avisarGruposDeConfiguracion()` — la única impresión de `faltantes()`, o sea el
inventario de las variables cuya ausencia **sí rompe**.

**Escenario, día 1 de alguien nuevo.** Sigue README.md:82-85 (`npm install`,
`cp .env.example .env.local`, `npm run dev`). El `.env.example` copiado tiene
todas las llaves **vacías**. El servidor levanta sin decir una palabra; al abrir
`/dashboard` recibe el error del SDK de Supabase (`supabaseAdmin()` lanza) o un
`createServerClient` reventando dentro de `proxy.ts`. La lista exacta de lo que
falta —`{"supabase":["NEXT_PUBLIC_SUPABASE_URL",…]}`— existe, está probada
(`arranque.test.ts:112`) y se calla precisamente en el entorno donde nadie tiene
un panel de logs que consultar.

**Consecuencia:** el arranque en local no ayuda a arrancar en local. La razón
escrita («en local estas ausencias son normales y el aviso diario acabaría siendo
ruido») aplica al bloque `SILENCIOSAS`, no al de grupos duros, que se arrastró
detrás del mismo `return`.

---

### [MEDIO] `/api/health` no tiene consumidor, y el campo que detecta la deriva de despliegue no se compara contra nada

`src/app/api/health/route.ts:10-32` · `vercel.json` · `.github/workflows/` · `docs/conocimiento/DEPLOY.md`

La ruta se creó (auditoría 4) declarando su propósito: «Un UptimeRobot (o el cron
de un tercero) pegándole a esto cada minuto convierte ese modo de falla en una
alerta de minutos». Dos rondas después: `grep -rn "api/health"` sobre todo el
repo devuelve **solo la ruta y su propia prueba**. No aparece en `vercel.json`,
ni en ningún workflow, ni una sola vez en DEPLOY.md — el documento de las 3 a.m.
no sabe que existe.

Devuelve `version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,7)` con una
justificación explícita: «es lo que confirma que el último push con `[deploy]`
de verdad llegó, contra el modo de falla silencioso del `ignoreCommand`». Nadie
lo compara. El único procedimiento contra la deriva es humano y voluntario
(DEPLOY.md:177-180: `git log -1` a ojo contra `vercel inspect`).

**Escenario, víspera del demo.** Se corrigen tres cosas, se pushean sin la
bandera `[deploy]` en el **asunto**. GitHub verde, CI verde, `/api/health`
devolvería `version: "553bee7"` cuando `master` va en otro sha — pero nadie
pregunta. El demo corre sobre el build de hace cuatro días y el síntoma es
"pero si eso ya lo arreglé".

**Consecuencia:** el detector de la única deriva silenciosa que el propio repo
documenta como su modo de falla más caro existe, funciona y no está conectado a
nada.

---

### [BAJO] El arranque bloquea la primera petición con hasta 10 s de red externa

`src/instrumentation.ts:33` · `src/lib/likida/privacidad.ts:140-157`

`register()` termina con `await verificarAvisoDePrivacidad()`, que hace
`getDatosResponsable(tenantId)` (consulta a Supabase) y luego
`sondearAvisoIntegral()`: un `fetch` HEAD con `AbortSignal.timeout(5000)` y, si
contesta 405/501, un GET con otros 5 s. La documentación de Next en este repo
(`node_modules/next/dist/docs/01-app/02-guides/instrumentation.md`) es explícita:
`register()` «must complete before the server is ready to handle requests».
Antes corre `verificarMigracionesCriticas()`, que son ~8 viajes redondos
secuenciales a la base.

**Escenario, 3 a.m.** El host donde está publicado el aviso de privacidad del
tenant se cae. Cada instancia fría de la función del webhook paga 5-10 s **antes
de contestar el primer mensaje** de un chofer. Meta no espera indefinidamente el
200 del webhook, y el diseño entero de `route.ts` («responde 200 rápido y procesa
en `after()`») está construido para no gastar ese presupuesto.

**Consecuencia:** un fallo en un tercero irrelevante para la liquidación puede
convertirse en mensajes de WhatsApp reintentados o perdidos. El propio comentario
de :30-33 reconoce el riesgo («hace una petición de red: no puede retrasar el
diagnóstico de lo demás») y lo resuelve con el orden, no con el bloqueo.

## Las 3 de la mañana

| Fallo del camino del dinero | ¿Genera alerta? | ¿El log trae identificador suficiente? | ¿Se puede reconstruir? |
|---|---|---|---|
| PDF rechazado por Meta (`pdf.no_entregado`, processor.ts:2494) | Sentry si hay DSN; **sin correo**. Notifica solo si el issue nace | Sí: `tenant` (huella), `viaje`, `codigo` de Meta, `error` | **Sí** — `huellaId(fila.id)` cruza contra la base |
| PDF no generado (`pdf.no_entregado`, processor.ts:2531) | Igual, y **sin `codigo`**: la 2ª causa distinta cae en el issue viejo y no notifica | `tenant`, `viaje`, `pdfGenerado`, `err` (texto libre) | Sí, si la línea sobrevivió a la retención de Vercel |
| Fallo procesando un mensaje (`processInbound`, webhook:258) | Sentry, fingerprint **sin tenant ni causa**: un issue para todo el producto | Solo `id` (huella de la fila del inbox) + `err`. Ni tenant ni viaje | Parcial: hay que huellar `wa_pendiente.id` fila por fila |
| Cierre cuadrado sobre gastos parciales por el `unlock_viaje` del arranque | **No.** El probe no escribe línea alguna | Ninguno | **No** |
| Cron falla (escalar/cobranza/facturar/purgar/wa-pendientes) | **Sí**: `alertarOperador` + 500 rojo en Vercel — **si `ALERTA_EMAIL` está puesta**, y el runbook no la nombra | `error` + `codigo` estable, y `tenant` donde aplica | Sí |
| Cron falla (`runner`) | 500 rojo en Vercel. **Sin correo, sin `codigo`** | `err` en texto libre | Parcial |
| `interruptor` ilegible → los 5 crons se saltan | **No.** HTTP 200, verde en Vercel, cero correos, cero filas en `agente_corrida` | `interruptores.lectura_fallo` con `err`; en `wa-pendientes` es `info`, ni llega a Sentry | Solo si alguien busca ese `msg` a propósito |
| Página del panel revienta para el contralor | Sentry vía `onRequestError` | **Sí**: `digest` (preservado por `CLAVES_NO_PII`), `ruta`, `metodo` | **Sí** — pedirle el Digest al contralor es el puente |
| El deploy no salió (falta `[deploy]` en el asunto) | **No.** Ni CI, ni Sentry, ni `/api/health` (que trae el sha y nadie lo lee) | n/a | Solo a mano con `vercel inspect` |
| App entera caída / DNS / build roto | **No.** Nada pollea `/api/health` | n/a | No |

## Lo que revisé y está bien

- **`src/lib/logger.ts` — la huella en vez del borrado.** Es la pieza que hace
  posible responder la pregunta del rubro: `id:9f2c1a4b77de` en el log +
  `huellaId(fila.id)` contra la base reconstruye de qué flota y qué viaje era el
  fallo, sin exponer el UUID. Y la regla está bien razonada (se huella lo que no
  se puede adivinar, se borra lo que sí: RFC, teléfono, CLABE, tarjeta), con una
  sola pasada de regex para que una regla no se coma la salida de otra.
- **`src/instrumentation.ts:56-86` — `onRequestError`.** Cubre las ~31 páginas
  del panel sin tocar `src/app/`, conserva el `digest` de Next y llama a
  `flushObservabilidad()` en el punto correcto (la respuesta ya se decidió).
- **`sentry.ts` completo, salvo el hueco del `codigo` en el camino del dinero.**
  El `fingerprint` con nivel resuelve un problema real (`startup.migraciones`
  usa el mismo `msg` para el aviso y su desmentido); `discriminadores()` acota
  la cardinalidad a propósito y explica por qué NO mete `viajeId`; el
  `flushObservabilidad` en el `after()` del webhook está por fin llamado.
- **`observability/alerta.ts`.** Nunca lanza, piso de una hora por evento, marca
  el rate-limit **antes** del envío, redacta el detalle por el mismo camino que
  los logs, y reconoce por escrito que el mapa en memoria es best-effort en
  serverless. El diseño está bien; lo que falta es que la variable llegue al
  entorno (ver el ALTO del runbook).
- **`/admin/salud-sistema`.** Cada renglón mide o dice "no medido"; el semáforo
  puede ponerse en rojo; `ofuscado()` confirma **a dónde** alertan los crons sin
  dejar el correo en una captura; el renglón de QStash distingue el estado
  parcial (token sin llaves), que es el peligroso.
- **`.github/workflows/ci.yml`.** Corre en `branches: ['**']`, con
  `concurrency`+cancel; puerta de `npm audit --omit=dev --audit-level=high`
  (runtime rojo, tooling no bloquea); cobertura con umbral; y el paso extra
  `npx vitest run fundamento duplicados` que recupera las dos pruebas de tiempo
  que `--coverage` se salta. Más `ci-postgres.yml` corriendo las verificaciones
  de RLS contra Postgres real, `codeql` y `dependency-review`.
- **`.env.example` + `runbook.test.ts:59-98`.** El inventario es completo por
  construcción (la prueba falla si el código lee una variable no declarada, y
  también si declara una que nadie lee), y prohíbe explícitamente prometer
  palancas inexistentes (`ANTHROPIC_API_KEY`, `QSTASH_TOKEN`). La parte de
  `.env.example` de esa prueba es sólida; la de DEPLOY.md es la que falla.
- **`src/lib/env.ts`.** Bien resuelto que `requireEnv` muriera: un validador que
  nadie llamaba y que, si hubiera lanzado, habría convertido un problema de
  configuración en una tormenta de 500 sin explicación.
- **`likida/startup.ts:14-45`, `sinRespuesta()`.** Distinguir "eso no existe" de
  "no pude preguntar" está bien argumentado con un incidente real
  (28-jul: gritó «FALTA la 0005» y el error era `fetch failed`), y evita el
  diagnóstico falso que enseña a ignorar el aviso. Ninguno de los ocho sondeos
  hace `return` temprano, para decir de una vez todo lo que falta.
- **El 500 deliberado sin `CRON_SECRET`** en las cinco rutas: un 200 dejaría el
  cron verde sin haber hecho nada. Correcto y consistente.
- **Los 53 tests de `src/lib/observability` + `instrumentation.test.ts`** pasan
  (`npx vitest run src/lib/observability src/instrumentation.test.ts`, 2.66 s).

## Lo que NO alcancé a revisar

- **Si `SENTRY_DSN` y `ALERTA_EMAIL` están de verdad en el entorno de Vercel.**
  Sin `vercel env ls` desde aquí, todo este rubro se sostiene sobre "si el DSN
  está puesto". El hallazgo del runbook sugiere que `ALERTA_EMAIL` no lo está,
  pero es inferencia, no medición. **Es la primera cosa que comprobaría.**
- **La retención real de los runtime logs del plan Pro** y si hay o no log drain
  (DEPLOY.md:152-153 lo declara como pendiente desde hace rondas).
- **El comportamiento real de `flushObservabilidad` bajo el `after()` congelado
  de Vercel.** Está probado con mocks; no con una invocación real.
- **`src/app/api/cron/facturar/route.ts` completo** (765 líneas): revisé sus
  `catch` y sus salidas HTTP, no la ruta QStash/callback ni el manejo de
  `sin_navegador` (503) de punta a punta.
- **`scripts/deploy-vercel.sh`** y si empuja `ALERTA_EMAIL` desde `.env.local`.
- **`.latido-salud`** está fechado el **10-ago** (10 días de retraso) y cita
  3,157 pruebas contra las ~2,880-3,150 de hoy: la rutina semanal de salud del
  repo parece haber dejado de correr. No lo perseguí — no es código.
- **La cadena de `agente_corrida`** como fuente de "última corrida exitosa por
  agente": existe la tabla y la campana cuenta fallos, pero no verifiqué si
  alguien puede preguntar "¿cuándo corrió bien por última vez?".
