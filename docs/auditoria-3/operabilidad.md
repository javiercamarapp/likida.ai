# Operabilidad y DX — auditoría 3

**Nota: 6/10** (antes 5). Razón del movimiento: **se atacó y subió** — OP-C1 está
vivo y verificado en `escalar/route.ts:99`, OP-A2 subió de `info` a `error`, y
esta ronda leí de punta a punta cosas que el pase anterior no acreditó (el
`huellaId` reversible-contra-la-base del `logger`, los 12 sondeos de esquema del
arranque, `runbook.test.ts` como guardián de `.env.example`, un CI que corre
build + cobertura en TODAS las ramas, un runbook que declara lo que NO cubre).
La nota no pasa de 6 porque encontré **la misma forma de OP-C1 en otro sitio**:
un motor del camino del dinero cuyo 100% de fallos se registra en nivel `info` y
contesta 200.

**El riesgo mayor, hoy:** el Agente de Cobranza puede dejar de contactar a TODOS
los choferes de TODAS las flotas —cada hora, indefinidamente— y el cron seguirá
saliendo verde en Vercel con una sola línea `info`; nadie se entera hasta que un
contralor pregunte por qué no le llegaron comprobantes.

---

## Hallazgos

### [CRÍTICO] Cobranza y escalación: 100% de fallos → HTTP 200 y nivel `info` (REINCIDENTE de forma, OP-C1)

`src/app/api/cron/escalar/route.ts:85-93,99` · `src/lib/likida/agentes/cobranza.ts:251-257` · `src/lib/likida/escalar_viaje.ts:203-205,285`

**Escenario.** La 0089 (`cobranza_contacto`) no está aplicada en producción, o un
constraint/RLS de esa tabla cambia — exactamente la clase de cosa que ya pasó
esta semana con la FK compuesta de la 0075 (`2e59040`/`566a962`). Entra: la
corrida horaria con 3 flotas y 40 viajes vencidos. Sale:

```
const { error: errClaim } = await admin.from('cobranza_contacto').insert({...});
if (errClaim) {
  if (errClaim.code !== '23505') r.fallos.push(`reclamar ${v.folio}: ${errClaim.message}`);
  continue;                       // ← ni un logger.warn, ni un logger.error
}
```

`ejecutarCobranzaGlobal` acumula los 40 en `total.fallos` y **devuelve normal**.
El cron entra por la rama feliz:

```
const r = await ejecutarCobranzaGlobal();
logger.info('cron.cobranza.ok', { ...r });      // ← INFO. logger.ts:148 solo
resultado.comprobacion = r;                      //    manda warn/error a Sentry
...
return NextResponse.json(resultado, { status: huboFallo ? 500 : 200 });
```

`huboFallo` solo se pone a `true` en el `catch`. Ningún `catch` se dispara: el
motor no lanzó, simplemente falló 40 de 40. Lo que queda a la mañana siguiente es
`{"level":"info","msg":"cron.cobranza.ok","meta":{"tenants":3,"contactados":0,
"fallos":[...]}}` en el runtime log de Vercel (retención corta, sin drain — lo
dice `DEPLOY.md`), el cron en **verde**, y cero eventos en Sentry.

Idéntico en escalación: `escalar_viaje.ts:203` empuja el fallo de claim a
`r.fallos` sin log, y `viaje.escalacion` (l.285) emite en `info` solo el
**conteo**, no el detalle.

**Consecuencia.** El agente que existe para que vuelvan los comprobantes deja de
funcionar y el panel de crons dice que corrió bien. Es literalmente el mecanismo
que OP-C1 documenta en el comentario de `escalar/route.ts:66-71` («~216 corridas
"verdes"»), sobreviviendo en la ruta que la arregló.

**Causa raíz probable.** El arreglo de OP-C1 ató la señal de salud a *"¿lanzó el
motor?"* en vez de a *"¿el motor logró algo?"*: `contactados: 0` con `fallos: 40`
es indistinguible de `contactados: 0` con `revisados: 0`.

---

### [ALTO] El catch de la cima del camino del dinero no dice qué mensaje se perdió

`src/app/api/webhook/whatsapp/route.ts:169-171`

```
processInbound(m).catch((e) => logger.error('processInbound', { err: ... }))
```

**Escenario.** Se rota `SUPABASE_SERVICE_ROLE_KEY` en Vercel y se escribe mal.
`processInbound` llama a `claimMessage` en su **línea 330**, antes de abrir el
`try` de la l.365; `claimMessage` → `supabaseAdmin()` → `admin.ts:13` **lanza**
`Error('Supabase service-role no configurado')`. El rico `catch` de
`processor.ts:2258-2274` (que sí lleva `id`, `de`, `tenant`, `viaje`,
`cerroSinEntregar`) nunca se alcanza. Lo que queda en el log de cada mensaje de
cada operador es:

```
{"t":"...","level":"error","msg":"processInbound","meta":{"err":"Supabase service-role no configurado"}}
```

Sin `waMessageId`, sin `from`, sin tipo. Y el webhook **ya contestó 200**
(l.250), así que Meta no reintenta y `wa_mensaje_procesado` no tiene fila: no
existe la lista de qué se perdió.

**Consecuencia.** Se sabe que el sistema está roto (el error sí llega a Sentry),
pero es imposible reconstruir qué comprobantes entraron y se tiraron: ni por log,
ni por base, ni por Meta.

**Causa raíz probable.** El `catch` se escribió como red de última instancia
asumiendo que `processInbound` ya trae su propio contexto — y lo trae, salvo en
las ~35 líneas que corren fuera de su `try` (claim, presupuesto) y en el
`finally` (`releaseViajeLock`). `m.waMessageId` y `m.from` están a mano en el
mismo scope.

---

### [ALTO] El panel del cliente puede reventar en el navegador sin dejar rastro en ningún servidor

`src/app/dashboard/error.tsx:39-49` · `src/app/global-error.tsx:31-38` · `src/lib/logger.ts:148`

Las dos fronteras de error son `'use client'` y reportan así:

```
useEffect(() => {
  void import('@/lib/logger').then(({ logger }) =>
    logger.error('panel.boundary', { digest: error.digest ?? 'sin-digest', err: error.message }));
}, [error]);
```

`useEffect` corre **solo en el navegador**. Ahí, `logger.emit` hace
`console.error` (queda en la consola del contralor) y la rama de Sentry está
muerta: `process.env.SENTRY_DSN` no es `NEXT_PUBLIC_*`, así que en el bundle de
cliente vale `undefined`. No hay `instrumentation-client.ts` ni
`withSentryConfig`: **no existe Sentry de navegador**.

**Escenario.** 3 a.m., un contralor abre `/dashboard/agentes/cobranza`. Un
componente de cliente —una gráfica con un dato nulo, el streaming NDJSON del
chat, el lector universal de archivos— lanza en render. `onRequestError`
(`instrumentation.ts:56`) **no se dispara**: no hubo error de servidor. El
boundary pinta "No se pudo cargar el panel", `error.digest` es `undefined` (Next
solo lo emite para errores de servidor), así que **ni siquiera hay código de
incidente en pantalla**. A la mañana siguiente: nada. Cero líneas en Vercel, cero
eventos en Sentry, y el propio comentario de `error.tsx:43-47` afirma «en el
servidor, la línea del log» — que para esta ruta no ocurre nunca.

**Consecuencia.** La superficie que el cliente paga (~31 páginas, la más
recientemente reescrita — rediseño v3 del 12-13 ago) es la única sin telemetría.

**Causa raíz probable.** El cableado de Sentry se hizo entero por el runtime
Node (`instrumentation.ts` + import dinámico); el runtime de navegador quedó
fuera del diseño y el comentario del boundary lo da por cubierto.

---

### [ALTO] `wa.sendText` / `wa.sendButtons`: nivel arreglado, identificador no (REINCIDENTE, OP-A2)

`src/lib/meta/client.ts:96` y `:195`

```
if (!res.ok) { logger.error('wa.sendText', { status: res.status, body: await res.text()... }); return null; }
```

El nivel ya es `error` (OP-A2 pedía eso). Lo que sigue faltando es a **quién**:
no hay `tenant`, ni `viaje`, ni `to`. Y el `fingerprint: [msg, nivel]` de
`sentry.ts:160` mete todos los rechazos de todos los tenants en un solo issue.

**Escenario.** El teléfono capturado de un chofer tiene un dígito de más. La
cobranza intenta el tier 2 del viaje `LK-0442`: Meta responde 400 (#131030).
`cobranza.ts:263` recibe `null`, escribe `detalle:'WhatsApp rechazó el envío'` en
`cobranza_contacto` (ahí sí queda el viaje) y empuja a `r.fallos`, que muere en
`info` (ver el CRÍTICO). El único evento que llega a Sentry es
`{"msg":"wa.sendText","status":400,"body":"..."}` — indistinguible del rechazo de
cualquier otra flota, y sin nada que permita saber que el afectado fue `LK-0442`.

**Consecuencia.** La alerta existe pero no es accionable: se sabe que "algún
envío rebotó", no cuál liquidación se quedó sin su recordatorio. Es el ancla de
8+ («identificador suficiente para reconstruirlo») incumplida en el envío más
usado del producto.

**Causa raíz probable.** `sendText` es una primitiva sin contexto de negocio y
ninguna firma lo transporta; los llamadores que sí lo tienen (`cobranza.ts`,
`escalar_viaje.ts`, `processor.ts`) no lo registran al recibir `null`.

---

### [ALTO] El presupuesto de 90 s de la cobranza global se mide desde su propio arranque, no desde el de la invocación

`src/lib/likida/agentes/cobranza.ts:308-315` · `src/app/api/cron/escalar/route.ts:74,85` · `maxDuration = 120` (l.11)

El comentario dice: *«El reloj de la corrida GLOBAL: 90s de los 120 del
maxDuration del cron — el resto es margen para la escalación que corre antes»*.
El código hace otra cosa:

```
const venceEn = Date.now() + PLAZO_COBRANZA_GLOBAL_MS;   // l.315 — relativo a AQUÍ
```

y `ejecutarCobranzaGlobal()` se invoca en `route.ts:85` **después** de
`escalarViajesSinAceptar()` (l.74), que no tiene reloj ninguno: manda hasta dos
WhatsApps por viaje en serie, cada uno con `SEND_TIMEOUT_MS = 10_000`.

**Escenario.** 8 viajes sin aceptar y Meta lento: escalación consume 55 s. La
cobranza arranca en t=55 s y se otorga hasta t=145 s. Vercel mata la invocación
en t=120 s. Queda: claims de `cobranza_contacto` insertados con
`enviado=false, detalle=null` para los viajes en vuelo, **sin** la línea
`cron.cobranza.ok`, sin `cortadosPorReloj`, y sin el 500 que marcaría el cron
como fallido con detalle. El rescate de `cobranza.ts:207-215` los borra una hora
después — incluidos aquellos cuyo `sendText` SÍ salió pero cuyo `update` no
alcanzó a correr, así que ese chofer recibe el mismo tier dos veces.

**Consecuencia.** El único guardia de reloj del cron no acota lo que dice acotar,
y su modo de falla (invocación matada) es el que menos rastro deja.

**Causa raíz probable.** El presupuesto se ancló al arranque de la función que lo
usa en vez de pasarse desde la ruta, que es la única que conoce `maxDuration`.
`facturar/route.ts:275` sí lo hace bien (`inicioLote` en el GET, pasado como
argumento); `escalar` no lo copió.

---

### [MEDIO] `startup.migraciones` colapsa cinco fallos distintos en un solo issue de Sentry (REINCIDENTE, OP-A1)

`src/lib/observability/sentry.ts:160` · `src/lib/likida/startup.ts:45,151,177,213,219`

El fingerprint pasó de `[msg]` a `[msg, nivel]` — eso separó el aviso de su
desmentido (`ok:true` vs fallo), que era la mitad de OP-A1. La otra mitad sigue:
`startup.migraciones` es **el mismo `msg` para cinco causas distintas**, con el
texto real metido en `meta.msg`, que Sentry no usa para agrupar.

**Escenario.** Una base a la que le falta la 0019 **y** el trigger
`trg_gasto_no_tras_liquidar`. `startup.ts:151` emite un `error` por índice
faltante en un `for`, y `:177` otro por trigger. Los dos —«el mismo CFDI se
liquida dos veces, con su IVA acreditado por duplicado» y «un gasto puede
insertarse después de emitida la liquidación»— llegan a Sentry como **un solo
issue titulado `startup.migraciones`**. Con la regla por defecto de Sentry
("nuevo issue"), el segundo no dispara ninguna notificación.

**Consecuencia.** Se arregla lo que dice el título del issue y se cierra; el
segundo defecto del esquema —de la misma familia de gravedad— queda tapado bajo
un issue ya visto.

**Causa raíz probable.** El propio docstring de `sentry.ts:146-152` señala
`startup.migraciones` como el caso motivador y resolvió el eje `nivel`, no el eje
`causa`. Es el único `msg` del repo reutilizado para causas ortogonales.

---

### [MEDIO] `flushObservabilidad` solo se llama en 2 de los ~15 caminos que emiten errores

`src/lib/observability/sentry.ts:129-135` · llamada únicamente en `webhook/whatsapp/route.ts:194` e `instrumentation.ts:82`

`reportar()` (l.157-164) es fire-and-forget: mete la promesa en `enVuelo` y
devuelve. Su propio comentario dice que en serverless «el proceso puede
congelarse antes de que ese temporizador dispare» y que «quien pueda esperar de
verdad, que llame a `flushObservabilidad`».

**Escenario.** El cron de escalación truena. `route.ts:79` emite
`cron.escalar.falló`, `reportar` dispara el `captureMessage`, y **dos líneas
después** la ruta hace `return NextResponse.json(...)`. La invocación termina;
Vercel puede congelar el sandbox antes de que el POST a Sentry asiente. Igual en
`chat/route.ts:141` (`chat.analista.fallo`, respondiendo **200** con un evento de
error dentro del stream, así que Sentry es la única señal que existe),
`ingesta/route.ts:69`, `purgar/route.ts:76` y `stripe/webhook/route.ts:71`.

**Consecuencia.** El evento que más importa —el último antes de que la invocación
muera— es el que menos probabilidad tiene de salir, que es exactamente el
problema que esta función se escribió para resolver y que solo resolvió en el
webhook.

**Causa raíz probable.** La corrección de la auditoría 6 se aplicó al `after()`
del webhook (el único caso identificado entonces) y no se convirtió en regla de
salida de ruta.

---

### [MEDIO] Sin `withSentryConfig` ni source maps: el único camino que produce stack lo produce minificado

`package.json:19` (`@sentry/nextjs ^10`) · `next.config.ts` (sin `withSentryConfig`, sin `productionBrowserSourceMaps`) · `src/lib/observability/sentry.ts:189-208`

El SDK se usa "a mano": import dinámico + `init()`. Nunca se envuelve la config
de Next, así que no hay subida de source maps ni `SENTRY_AUTH_TOKEN` en el
inventario de `.env.example` (verificado: solo aparece `SENTRY_DSN`).

**Escenario.** Un Server Component del panel lanza en producción.
`onRequestError` llama a `reportarExcepcion`, cuyo docstring lo vende como «el
único que produce stack traces». Lo que llega a Sentry es el stack del bundle
minificado de Next: `.next/server/chunks/8412.js:1:48213`. El `digest` sí sirve
para atar pantalla↔log, pero para localizar la línea de fuente hay que
reconstruirla a mano.

**Consecuencia.** La única fuente de stacks del sistema entrega stacks que no se
pueden leer, y el `redactarTexto` que se les aplica encima (l.178) no cambia eso.

**Causa raíz probable.** Se eligió el cableado manual para poder pasar todo por
`redactarTexto` (decisión buena y bien argumentada); el coste colateral —perder
el pipeline de artefactos de build de Sentry— no se anotó en ninguna parte.

---

### [MEDIO] Nada detecta la AUSENCIA de una corrida: el `ignoreCommand` y la verificación de despliegue son 100% manuales

`vercel.json:3` · `docs/conocimiento/DEPLOY.md:170-183`

`"ignoreCommand": "git log -1 --pretty=%s | grep -qi '\\[deploy\\]' && exit 1 || exit 0"`.
La red que lo compensa es una instrucción humana en el runbook (`git log -1` vs
`vercel inspect`). No hay heartbeat, ni un `select max(created_at)` sobre
`cobranza_contacto`, ni un chequeo de que `escalar` corrió en la última hora.

**Escenario.** Se añade un cron a `vercel.json` (o se cambia su `schedule`) en un
commit sin `[deploy]`. El push se ve normal en GitHub, CI pasa entero (typecheck,
lint, cobertura, build), y **la configuración de crons de producción sigue siendo
la del deployment anterior**. Nada en el repo ni en el runtime contradice la
suposición de que el cron nuevo está corriendo. Sale: cero corridas, cero logs,
cero alertas — la ausencia de señal es indistinguible de "no había trabajo".

**Consecuencia.** El modo de falla que CLAUDE.md ya declara silencioso no tiene
ninguna detección automática; depende de que alguien se acuerde antes de un demo.

**Causa raíz probable.** El `ignoreCommand` optimiza costo de build y se aceptó
su silencio, pero no se pagó la contrapartida: una señal de "lo desplegado ≠ lo
comiteado" o de "el cron dejó de latir".

---

### [BAJO] `CRON_SECRET` no está en el inventario de arranque

`src/lib/env.ts:29-38` · `src/app/api/cron/{escalar,facturar,purgar}/route.ts`

`GROUPS` cubre `llm`, `whatsapp` y `supabase`. `CRON_SECRET` —la variable sin la
cual **los tres crons fallan cerrado**— no está. `avisarConfiguracionSilenciosa`
tampoco la lista. Entra: un entorno nuevo desplegado con `deploy-vercel.sh` desde
un `.env.local` sin esa línea (`push_env` salta las vacías). Sale: arranque
limpio (`startup.entorno_grupos {ok:true}`) y el descubrimiento llega **hasta la
hora en punto**, por `cron.escalar.sin_secreto`. Consecuencia: hasta 60 minutos
de escalación y cobranza sin correr en un entorno recién levantado, con el
arranque afirmando que la configuración está completa. Causa raíz probable:
`GROUPS` se agrupó por *servicio externo* y `CRON_SECRET` no pertenece a ninguno.

### [BAJO] El runbook nombra un mensaje de arranque que el código no emite

`docs/conocimiento/DEPLOY.md:47` («`startup.entorno` — falta configuración crítica») vs `src/lib/observability/arranque.ts:59,61,87,90`

El código emite `startup.config_silenciosa` y `startup.entorno_grupos`. Un
`grep startup.entorno` todavía encuentra el segundo por prefijo, pero
`startup.config_silenciosa` —la línea que delata `DEMO_TENANT_ID` ausente, el
caso de manual del propio runbook— **no aparece en DEPLOY.md**. `runbook.test.ts`
verifica que el texto contenga la cadena `DEMO_TENANT_ID`, no el `msg` con el que
buscarlo. Consecuencia: a las 3 a.m. se busca por el nombre equivocado.

### [BAJO] `despacho_wa.pendiente_ilegible` no dice de qué flota ni de qué teléfono

`src/lib/likida/despacho_wa.ts:60-65`

`logger.warn('despacho_wa.pendiente_ilegible', { err: error.message })` — sin
`tenantId` ni `telefono` (que estarían huellados/redactados, no en claro). Entra:
la lectura de `wa_conversacion` rebota para el jefe de una flota; sale: el jefe
escribe "sí" y el sistema le re-pregunta el viaje entero, con una línea de log
que no permite saber a quién le pasó ni cuántas veces.

---

## Las 3 de la mañana

**1. El PDF de una liquidación cerrada no llega al chofer.**
Queda: `pdf.no_entregado` (`processor.ts:2179-2181`) con `viaje`, `tenant`,
`codigo` y `error` de Meta — huellados (`id:xxxxxxxxxxxx`), cruzables contra la
base con `huellaId()`, como documenta `DEPLOY.md:26-38`. Además el chofer recibe
un mensaje que le dice a quién pedírselo, y si Meta acepta pero luego falla la
entrega, el acuse entra por `wa.no_entregado` (`webhook/route.ts:215`) con el
wamid. **Identificador: suficiente.** **¿Alguien se entera?** Solo si
`SENTRY_DSN` está puesto en Vercel *y* hay una regla de alerta con destinatario —
y el propio runbook lo declara pendiente: «Quién recibe qué cuando algo falla.
Hoy no hay nadie asignado ni ningún canal» (`DEPLOY.md:145-148`). El
procedimiento de reenvío tampoco está escrito (l.149-150). **Este es el mejor
caso del sistema y aun así se queda en "está registrado, no está alertado".**

**2. La cobranza deja de contactar a todos los choferes.**
Queda: una línea `info` (`cron.cobranza.ok`) con el arreglo `fallos` completo, en
el runtime log de Vercel, con retención corta y sin log drain. **Identificador:
sí, dentro de esa línea (folios).** **¿Alguien se entera? NO** — `info` no llega
a Sentry (`logger.ts:148`), el cron sale 200 y verde. Si el fallo es de envío en
vez de de claim, llega *un* evento `wa.sendText` sin tenant ni viaje, colapsado
con los de todas las demás flotas. Ver el CRÍTICO y el ALTO de OP-A2.

**3. El panel se cae para el contralor.**
Si el fallo es de **servidor**: `request.fail` con `digest`, `ruta`, `metodo` y
`err` (`instrumentation.ts:67-73`), más `reportarExcepcion` con stack — el digest
está en pantalla, seleccionable, y el puente pantalla↔log funciona
(`CLAVES_NO_PII` lo protege de la redacción). El stack, eso sí, viene minificado.
**Alerta: sí, si hay DSN.** Si el fallo es **de navegador**: nada. Ni línea de
servidor, ni evento, ni digest en pantalla. Ver el ALTO correspondiente.

---

## Lo que revisé y está bien

- **OP-C1 verificado vivo.** `escalar/route.ts:65-99`: `huboFallo` y
  `status: huboFallo ? 500 : 200`, con el porqué escrito encima. El arreglo del
  `444492a` está en el árbol.
- **Los otros dos crons fallan cerrado y lo dicen.** `facturar` responde 503 con
  los tres caminos probados para Chromium y **no marca los tickets como
  intentados** (l.541-563); `purgar` comprueba `error` de supabase-js
  explícitamente (l.75) e informa `llmCostoPurgado:false` para que una corrida
  verde no se lea como "ya se limpió todo".
- **El webhook de Stripe.** El único camino de dinero entrante y está bien
  cerrado: 503 sin secreto, HMAC sobre el cuerpo crudo, marca-antes-de-aplicar,
  500 a propósito para que Stripe reintente, y `stripe.webhook.marca_huerfana`
  para el caso que deja un pago cobrado sin plan (l.36-89).
- **El callback de QStash.** Verifica la firma con las signing keys reales antes
  de tocar nada, revalida contra la base que los gastos siguen sin CFDI, y
  devuelve 5xx para que QStash reintente (`facturar/cola/route.ts:21-75`).
- **`logger.ts` completo.** La huella FNV-1a estable en vez de `[UUID]` es el
  arreglo más valioso del rubro: permite agrupar por flota y cruzar contra
  Postgres sin filtrar nada. Una sola pasada de regex (no encadenada), `digest`
  exento de redacción, y `t` en ISO-8601 para poder ordenar dos líneas idénticas.
- **`instrumentation.ts`.** Orden correcto (observabilidad → precarga →
  migraciones → aviso de privacidad), `onRequestError` con `digest`, y
  `flushObservabilidad` esperado ahí, que es donde se puede.
- **`startup.ts`.** Doce sondeos del esquema del camino del dinero, sin `return`
  temprano, distinguiendo «no está» de «no pude preguntar» (`sinRespuesta`),
  y mirando el catálogo real para índices y triggers en vez de columnas que
  responden igual con o sin ellos.
- **`runbook.test.ts`.** `.env.example` verificado contra el árbol de fuentes en
  las dos direcciones (falta / sobra), sin duplicados, y sin prometer palancas
  que ningún archivo lee. Es la mejor pieza de DX del repo.
- **CI.** Corre en `'**'` (no solo master), con `npm ci`, typecheck, lint,
  cobertura como puerta, las dos pruebas de tiempo que `--coverage` se salta, y
  **build** con placeholders. Sin secretos, ~2 min.
- **`arranque.ts` / `env.ts`.** La categoría "variables cuya ausencia no rompe
  nada" está bien elegida y `faltantes()` tiene consumidor real (la nota de por
  qué `requireEnv` se eliminó es correcta).
- **`DEPLOY.md`.** Ordenado por lo que se necesita a las 3 a.m., con la tabla de
  las cuatro líneas de `costos.ts`, la rotación del token de Meta, y —lo más
  raro— una sección **«Lo que este runbook NO cubre»** que es exacta.
- **`seed.sh`.** Detecta esquema ya aplicado en vez de reventar, y marca en rojo
  los valores inventados.

## Lo que NO alcancé a revisar

- **Si `SENTRY_DSN` está de verdad puesto en Vercel producción, y si existe
  alguna regla de alerta con destinatario.** Es la pregunta que decide la mitad
  de esta nota y no se puede contestar desde el repo (`vercel env ls production`
  / el panel de Sentry). El runbook sugiere que sigue pendiente.
- **Si `CRON_SECRET` está puesto**, y por tanto si los tres crons están corriendo
  hoy o llevan tiempo devolviendo 500.
- **Retención real de los runtime logs** en el plan Pro y si el volumen justifica
  un drain (`DEPLOY.md` lo lista como no cubierto).
- **`api/dashboard/{archivo,conversaciones}` y `api/export/pdf/[id]`** — solo los
  hojeé; no verifiqué sus caminos de error.
- **`lib/llm/openrouter.ts`**: cómo se registran los fallos y reintentos del
  gateway, y si un `PartialExecutionError` deja identificador de tenant fuera del
  chat.
- **Los agentes de facturas/proveedores/peajes** (`0091`,
  `api/export/facturas-proveedor`): no revisé su instrumentación.
- **No corrí nada** — ni `npm test`, ni `npm run build`, ni las
  `pruebas-manuales/*.prueba.ts`, según la instrucción del MAPA. Todo lo anterior
  es lectura y `grep`.
