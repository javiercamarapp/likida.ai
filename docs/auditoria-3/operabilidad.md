# Operabilidad y DX — auditoría 3 (pase 3)

**Nota: 7/10** (antes 6). Razón del movimiento: **se atacó y subió** — `f7d6981`
construyó de verdad lo que su asunto promete para el camino que **lanza**: un
canal de correo al operador (`alerta.ts`), un `codigo` estable que separa causas
en el fingerprint de Sentry (`sentry.ts:259`), un `/api/health` que contesta 503
cuando la base no responde, y una `/admin/salud-sistema` donde cada semáforo está
MEDIDO o dice que no lo está. Eso es maquinaria real, no prosa.

No pasa de 7 por tres cosas verificadas hoy: **OP-C1 sigue vivo palabra por
palabra**; encontré **la misma forma en cobranza, agravada** —ahí el 100 % de
fallos no solo calla, sino que **CIERRA su propio incidente con un éxito falso**
(el bug que `escalar_viaje.ts:392` arregló el 14-ago y que su hermano no
heredó)—; y el canal nuevo **sigue sin haberle llegado nunca a un humano**: no
hay botón de prueba para `ALERTA_EMAIL`, `DEPLOY.md` ni siquiera la nombra en su
tabla de variables, y su sección «Lo que este runbook NO cubre» todavía afirma
que **no existe ningún canal**.

**El riesgo mayor, hoy:** el Agente de Cobranza puede fallar 40 de 40 contactos,
en las 3 flotas, cada hora e indefinidamente, y el sistema entero lo lee como una
corrida sana: HTTP 200, `logger.info('cron.cobranza.ok')`, cron verde en Vercel,
cero eventos en Sentry, cero correos a Javier — y además `corridas.set(t, null)`
le dice al motor de avisos que el problema se resolvió, re-armando el filo que
existe justo para contarlo.

---

## Hallazgos

### [CRÍTICO] 100 % de fallos sin excepción → HTTP 200 y nivel `info` (REINCIDENTE, OP-C1)

`src/app/api/cron/escalar/route.ts:90,94,121,139` · `src/lib/likida/agentes/cobranza.ts:328` · `src/lib/likida/escalar_viaje.ts:235,367`

**Escenario, con valores.** `WHATSAPP_ACCESS_TOKEN` caduca — el propio
`.env.example:19` lo marca «CADUCA» y `DEPLOY.md:80` lo llama sospechoso número
uno. A las 03:00 corre `/api/cron/escalar` con 3 flotas y 40 viajes vencidos.
Cada `sendText` devuelve `null` y cada `sendTemplate` devuelve `{ok:false}`, así
que `escalarViajesSinAceptar` empuja 12 renglones a `r.fallos`
(`escalar_viaje.ts:344`) y `ejecutarCobranza` empuja 40 a `r.fallos`
(`cobranza.ts:308`). **Ninguno lanza.** La ruta entra por la rama feliz:

```ts
const r = await escalarViajesSinAceptar();
logger.info('cron.escalar.ok', { ...r });        // ← :94, INFO
...
const r = await ejecutarCobranzaGlobal();
logger.info('cron.cobranza.ok', { ...r });       // ← :121, INFO
...
return NextResponse.json(resultado, { status: huboFallo ? 500 : 200 });  // ← :139
```

`huboFallo` (`:90`) solo se pone a `true` dentro de los dos `catch`, y ningún
`catch` se dispara. Sale: **200**, dos líneas `info`. `logger.ts:148` solo
replica `warn`/`error` a Sentry, así que Sentry no ve nada. `alertarOperador`
no se llama: solo vive en los `catch`. El cron queda **verde** en el panel de
Vercel.

**Consecuencia.** El agente que existe para que vuelvan los comprobantes queda
mudo para 750 choferes, y el contralor lo descubre cuando pregunta por qué no le
llegó nada. A la mañana siguiente lo único que hay es
`{"level":"info","msg":"cron.cobranza.ok","meta":{"tenants":3,"contactados":0,"fallos":[...]}}`
en el runtime log de Vercel — retención corta y **sin log drain**, lo dice
`DEPLOY.md:24-27`.

**Causa raíz probable.** El motor reporta los fallos POR VALOR (`fallos: string[]`)
y el cron solo mira excepciones; nada lee `r.fallos.length` para decidir el
status ni el nivel del log — es `exigir()` de `analytics.ts` sin aplicar al cron.

*(REINCIDENTE del pase 2, sin un solo cambio: los mismos cuatro puntos, con las
líneas corridas por el kill switch de la 0110.)*

---

### [CRÍTICO] Cobranza cierra su propio incidente con un éxito falso — el bug que su hermano ya arregló

`src/lib/likida/agentes/cobranza.ts:387,399` · contra `src/lib/likida/escalar_viaje.ts:392` · `src/lib/likida/agentes/notificaciones.ts:458-461`

**Escenario, con valores.** Misma corrida de arriba: la flota `A` tiene 40 viajes
vencidos y los 40 contactos fallan (ventana de 24 h cerrada + plantilla
rechazada). `ejecutarCobranza` **devuelve normalmente** con
`{contactados: 0, fallos: [40 renglones]}`. Entonces:

```ts
const r = await ejecutarCobranza(t, ahora, { venceEn });
...
corridas.set(t, null);          // ← :387  null == "esta corrida SÍ terminó"
...
await avisarCorridasPorFlota('cobranza', corridas, ahora);   // ← :399
```

`avisarCorridaFallida` interpreta `null` como `hayProblema: false`
(`notificaciones.ts:1046` → `:458-461`), que **no manda nada Y re-arma el filo**:
`MARCAS_DE_INSISTENCIA` vuelve a cero. Así que la única vía que quedaba —el
correo al cliente— tampoco sale, y la racha se borra en cada corrida horaria: el
contador nunca llega a la marca 1, ni a las 24 corridas del día, ni a las 216 de
nueve días.

El hermano ya lo arregla: `escalar_viaje.ts:392` hace
`cierre.set(tenantId, c.fallidos === c.intentos ? c.ultimo : null)`, y su propio
comentario (`:373-377`) dice literalmente *«Un éxito falso es peor que no avisar:
borra la racha de la flota justo cuando su problema sigue vivo, así que el aviso
nunca llega a salir»*. Cobranza no recibió esa corrección.

**Consecuencia.** Es lo que convierte el hallazgo anterior de «silencioso» en
«activamente suprimido». Ni Javier (no hay `alertarOperador` fuera de los
`catch`) ni el contralor (el aviso se cancela y la racha se resetea) se enteran
jamás. Lo único que sobrevive es la ficha del agente, que sí anota `parcial`
(`cobranza.ts:404`) — un dato que hay que ir a mirar a propósito.

**Causa raíz probable.** El mapa de cierre se llena desde el `try/catch` del
bucle de flotas (solo la excepción cuenta como fallo) en vez de desde el
resultado medido de la corrida (`r.fallos` vs `r.contactados`).

---

### [ALTO] El camino del dinero por WhatsApp no tiene canal de alerta: `alertarOperador` solo lo llaman los 3 crons

`src/lib/observability/alerta.ts:59` (3 llamadores: `cron/escalar/route.ts:105,129`, `cron/facturar/route.ts:374,684`, `cron/purgar/route.ts:98,109`) · `src/lib/likida/processor.ts:2182,2341,2368`

**Escenario, con valores.** 03:10. La flota `A` cierra su viaje `F-1042`; la tool
de PDF revienta contra storage. `processor.ts:2341` emite
`logger.error('pdf.contralor_no_generado', { tenant, viaje, liqId })` — con
identificadores suficientes, eso está bien. Va a Sentry con
`fingerprint: ['pdf.contralor_no_generado', 'error', 'id:9f2c1a4b77de']`
(`sentry.ts:198` + `discriminadores`). Nace el issue, Javier recibe UNA
notificación. A las 03:40 fallan los otros **39 cierres de la misma flota**:
caen todos en el issue ya existente y, por el modelo que el propio repo declara
en `alerta.ts:6-8` (*«Sentry solo notifica cuando NACE un issue — un fallo que
cae en un issue viejo solo engorda un contador»*), **cero notificaciones nuevas**.
Ningún correo: `alertarOperador` no se llama desde `processor.ts` en ninguna de
sus 2 500 líneas.

**Consecuencia.** El producto ES el cierre de liquidación por WhatsApp. Los tres
crons —que son la red de seguridad— tienen canal directo con piso de una hora; el
camino principal no tiene ninguno. El chofer lee «se me trabó el sistema
tantito» (`processor.ts:2183`), el contralor no recibe su PDF, y el guardia se
entera cuando alguien llame.

**Causa raíz probable.** `D1` cableó el canal donde el hallazgo ardía (los crons,
9 días tronando) y no donde vive el dinero; falta un criterio de qué `msg` merece
correo además de Sentry.

---

### [ALTO] Un interruptor ilegible para los tres crons y responde 200 diciendo que alguien lo apagó

`src/lib/likida/interruptores.ts:76-77,81-85` × `src/app/api/cron/escalar/route.ts:79-82` · `facturar/route.ts:277-283` · `purgar/route.ts:77-80`

**Escenario, con valores.** Supabase tiene un incidente de red parcial: el
`SELECT apagado FROM interruptor WHERE id='global'` devuelve error por valor.
`estaApagado` falla cerrado (decisión deliberada y bien argumentada) y devuelve
`true`. Los tres crons hacen entonces:

```ts
if (await estaApagado('global')) {
  logger.warn('cron.escalar.saltado', { interruptor: 'global' });   // ← :80
  return NextResponse.json({ corrio: false, saltado: 'interruptor global' });  // 200
}
```

Sale: **200**, cron verde, y una línea que afirma *«saltado: interruptor global»*
— que es **falso**: nadie tocó ninguna palanca. La línea que sí dice la verdad,
`interruptores.lectura_fallo` (`:76`), lleva meta `{interruptor, err}` **sin
`tenant` ni `codigo`/`status`**, así que `discriminadores` (`sentry.ts:161-169`)
devuelve `[]` y el fingerprint es `['interruptores.lectura_fallo','error']`: un
solo issue para siempre, una sola notificación, exactamente la lección de OP-A1
que `D2` fue a arreglar en los otros seis `logger.error` y en éste no. Y no hay
`alertarOperador`: escalación, cobranza, facturación y purga quedan paradas de
madrugada con tres semáforos verdes.

**Consecuencia.** Un hipo de base de 40 minutos se lee, en el panel y en el log,
igual que «Javier apagó todo a propósito». Rompe la regla del repo de que un
rótulo tiene que ser verdad, en la línea que un guardia leería primero.

**Causa raíz probable.** `estaApagado` devuelve un `boolean` que colapsa dos
estados distintos («apagado a propósito» y «no pude leer»), y el llamador no
puede distinguirlos para elegir status ni texto.

---

### [ALTO] El catch del webhook borra el único identificador del mensaje perdido

`src/app/api/webhook/whatsapp/route.ts:170`

**Escenario, con valores.** Meta entrega un POST con 5 fotos del chofer
`5219993700779`. `processInbound` lanza en la tercera (p. ej. `claimMessage`
choca con la base). Sale, literalmente:

```json
{"t":"2026-08-15T09:03:11.482Z","level":"error","msg":"processInbound",
 "meta":{"err":"TypeError: Cannot read properties of null"}}
```

Sin `waMessageId`, sin `from`, sin tenant, sin viaje. El `m` está en el closure
—`(m) => processInbound(m).catch(...)`— y no se usa. Peor: el webhook **ya
contestó 200** (`DEPLOY.md:138-141`), así que **Meta no reintenta** y ese
comprobante se perdió para siempre. Y en Sentry el fingerprint es
`['processInbound','error']` sin discriminadores: TODOS los fallos del corazón
del producto, de todas las flotas y todas las causas, colapsan en **un issue** —
una notificación, la primera vez, nunca más.

**Consecuencia.** El caso de manual del rubro: a las 3 a.m. el log dice que algo
falló procesando un mensaje y no dice cuál, de quién, ni de qué viaje. Contrasta
con el cuidado del mismo archivo doce líneas más arriba
(`wa.ratelimit_diferido`, `:149`) y más abajo (`wa.no_entregado`, `:215-220`),
que sí conservan el `id`.

**Causa raíz probable.** El `.catch` se escribió como red de última hora sobre el
pool y no se le pasó el contexto que tenía a mano.

---

### [ALTO] DX: `npm ci` no corre en una máquina limpia, y deja `node_modules` VACÍO

`package.json:38` (`"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`) · `.github/workflows/ci.yml:44` · `README.md:83`

**Escenario, con valores.** Alguien clona el repo detrás de una política de red
que solo permite `registry.npmjs.org` (el contenedor de esta misma auditoría, y
cualquier proxy corporativo). `npm ci` recibe **403 en el CONNECT** a
`cdn.sheetjs.com`, **revierte la instalación entera** y deja `node_modules/`
vacío: no falta un paquete, faltan los 452. No corre `tsc`, ni `vitest`, ni
`next dev`. El mismo `npm ci` es el paso 1 del CI (`ci.yml:44`), así que el día
que SheetJS retire ese tarball —lo hacen: publican solo las últimas versiones en
su CDN— **todas las ramas se ponen rojas a la vez y nadie puede instalar**.

Y no hay una sola línea en el repo que explique por qué la dependencia viene de
un CDN: `package.json` sí documenta con todo detalle el override de `sharp`
(`"//overrides"`), pero de `xlsx` no dice nada, y `README.md`/`DEPLOY.md`
tampoco. El arreglo «obvio» para quien se topa con esto es apuntarla al
registry (`xlsx@0.18.5`) — lo que hizo el arnés de esta corrida — que es una
versión con prototype pollution conocida, alcanzable desde `intake/archivo.ts`
y desde el `.xlsx` que sube el usuario en `dashboard/viajes/page.tsx`.

**Consecuencia.** «Arranca en una máquina limpia» es hoy condicional a la red del
que clona, y el modo de falla es total y sin diagnóstico. Un contratista o un
agente en la nube pierde la primera hora antes de entender que no es su código.

**Causa raíz probable.** Se pinneó el tarball del CDN (probablemente para huir de
los CVE de `xlsx` en npm) sin dejar la nota que convierte una decisión en
conocimiento, y sin ninguna verificación de que la instalación sea reproducible.

---

### [MEDIO] `DEPLOY.md` quedó atrás del código justo en las dos secciones que se leen a las 3 a.m.

`docs/conocimiento/DEPLOY.md:101-107,147-149` × `src/lib/observability/arranque.ts:34-47` · guardián insuficiente en `src/lib/observability/runbook.test.ts:104-109`

**Escenario, con valores.** Javier provisiona Vercel siguiendo el runbook. La
tabla «Variables que deben estar en Vercel — las **dos** que hay que revisar a
mano porque si faltan el sistema arranca igual» lista `SENTRY_DSN` y
`DEMO_TENANT_ID`. Pero `SILENCIOSAS` (`arranque.ts:34-47`) ya son **cuatro**:
faltan `NEXT_PUBLIC_APP_URL` (login manda los magic links a otro dominio y nadie
entra, sin un solo error) y `ALERTA_EMAIL` (los fallos de cron no le llegan a
nadie). Y `CRON_SECRET`, que `salud-sistema` marca en **rojo** porque sin él los
tres crons devuelven 500, no aparece en la tabla en absoluto.

Peor, cuarenta líneas abajo, «Lo que este runbook NO cubre» sigue diciendo:
*«**Quién recibe qué cuando algo falla.** Hoy no hay nadie asignado ni ningún
canal»* (`:147-149`). Eso dejó de ser cierto con `f7d6981`: el canal existe y se
llama `ALERTA_EMAIL`. El documento al que se acude en un incidente le dice al
guardia que no busque un canal que sí tiene.

**Consecuencia.** La ausencia más cara de la lista (`ALERTA_EMAIL`) es
exactamente la que el runbook no pide, así que el canal nuevo se queda apagado en
producción por el mismo camino por el que se quedó apagado `SENTRY_DSN` en la
auditoría 5. `runbook.test.ts:104-109` existe para impedir esto y solo comprueba
las dos variables viejas, hardcodeadas — no lee `SILENCIOSAS`.

**Causa raíz probable.** El guardián prueba una lista literal en vez de la lista
del código.

---

### [MEDIO] El canal de alerta al operador nunca se ha probado que llegue a un humano

`src/app/admin/salud-sistema/page.tsx:96-117` · `src/app/dashboard/agentes/prueba-correo.ts:1-11` · `src/lib/observability/alerta.ts:35-37`

**Escenario, con valores.** Javier abre `/admin/salud-sistema`. El renglón «Canal
de alerta al operador» dice **verde**: `Alertas de cron a j***@gmail.com`. Lo que
esa afirmación mide es `!!process.env.ALERTA_EMAIL && correoConfigurado()`
(`alerta.ts:36`) — presencia de tres variables de entorno. No prueba que Resend
acepte el dominio remitente, ni que el correo no caiga en spam de Gmail, ni que
la dirección exista. La primera vez que se sabrá si funciona es la madrugada en
que algo truene.

El repo YA tiene el mecanismo correcto y no lo aplicó aquí: `585b099` construyó
«Mándate una prueba» con su rate limit y sus tres acuses honestos
(`prueba-correo.ts:82-106`) — pero **solo para los avisos del TENANT**, en
`/dashboard/agentes`. El canal del operador del sistema, que es el único que
cubre los fallos de plataforma, no tiene botón.

**Consecuencia.** Es literalmente la razón que el pase 2 dio para no subir la
nota: «no hay aún verificación de que las alertas lleguen a un humano». Sigue
siendo cierta, con la diferencia de que ahora el semáforo verde afirma más de lo
que midió.

**Causa raíz probable.** `B5` y `D1` se construyeron en commits distintos y nadie
cruzó el botón de uno con el canal del otro.

---

### [MEDIO] Los diagnósticos de arranque no pueden usar el canal de correo, que es el único que sobrevive a su propio fallo

`src/instrumentation.ts:16-27` · `src/lib/observability/arranque.ts:66-70` · `src/lib/observability/sentry.ts:69-75`

**Escenario, con valores.** Un despliegue del viernes pierde `SENTRY_DSN` (pasó,
auditoría 5). `avisarObservabilidad()` hace exactamente lo que debe:
`logger.error('startup.observabilidad', { sentry:false, err:'SENTRY_DSN
ausente…' })`. Pero `logger.ts:148` solo replica a Sentry `if
(process.env.SENTRY_DSN)` — y no hay DSN. El grito **muere en el runtime log de
Vercel**, que es justo el sitio que el mensaje declara insuficiente. Lo mismo con
`startup.config_silenciosa` (`arranque.ts:66`) y `startup.entorno_grupos`
(`:95`). `ALERTA_EMAIL` está puesta, es independiente de Sentry, y nadie la usa
aquí: `alertarOperador` no se importa en ningún archivo de arranque.

**Consecuencia.** El diagnóstico que existe para detectar «arrancamos ciegos» solo
puede salir por el canal que acaba de declararse ausente. Hasta el lunes nadie lo
sabe, y `DEPLOY.md:24-27` avisa que para entonces la línea puede haber caducado.

**Causa raíz probable.** El arranque se cableó antes de que existiera un segundo
canal, y no se revisó al añadirlo.

---

### [MEDIO] `/api/health` existe, contesta 503 correctamente, y ningún documento del repo lo nombra

`src/app/api/health/route.ts:34-56` · ausente en `docs/conocimiento/DEPLOY.md` y `README.md`

**Escenario, con valores.** El endpoint está bien hecho: consulta real HEAD+count
sobre `tenant` bajo `acotada`, devuelve `{ok, db, sentry, version, hora}` y
**503** si la base no responde; sin auth a propósito para que un monitor gratuito
pueda usarlo. Su propio comentario (`:14-17`) dice que un UptimeRobot cada minuto
convertiría el incidente de 9 días en una alerta de minutos. Pero `grep api/health
docs/conocimiento/*.md README.md` no devuelve **nada**: el runbook no lo
menciona, no dice a qué monitor apuntarlo, no hay ninguna variable ni ningún
registro de que exista un monitor externo. El pulso está construido y sin
enchufar.

Y `version` es la pieza que faltaba contra el modo de falla silencioso del
`ignoreCommand` (`vercel.json:3` + `CLAUDE.md`): un `GET /api/health` compara el
sha publicado contra `git log -1` en un segundo. `DEPLOY.md:177-180` sigue
mandando a `vercel inspect`.

**Consecuencia.** El único mecanismo capaz de detectar que la app entera está
caída sigue dependiendo de que alguien lo descubra a mano — que es el modo de
falla original del rubro.

**Causa raíz probable.** `D4` cerró la parte que se escribe en código y no la
parte que se configura fuera del repo, y no dejó la instrucción de hacerlo.

---

### [BAJO] El `README` describe un arranque que no deja el proyecto corriendo, y cita cifras de otra época

`README.md:17,65-66,82-89`

`## Correr el demo` dice `npm install` → `cp .env.example .env.local` → `npm run
dev`. Con eso la app levanta y **no hay base**: no menciona `npm run seed` (que
existe en `package.json:14` y exige `DATABASE_URL` + `psql`), ni que hay que
crear el proyecto de Supabase, ni el bucket `liquidaciones`. `npm run setup`
(`package.json:15`) tampoco aparece. Y afirma «**3,149 pruebas verdes**» (`:17`)
y «`~3,150 pruebas`» (`:66`) contra las ~4,502 de la línea base de hoy — CLAUDE.md
avisa explícitamente de no citar esa cifra de memoria. Consecuencia: el primer
documento que abre alguien nuevo no lo lleva a un proyecto que corra, y las
cifras erosionan la confianza en el resto de la página.

---

### [BAJO] El piso de una hora de la alerta es un no-op en serverless, y la pantalla lo afirma sin condición

`src/lib/observability/alerta.ts:41-44,70-76` × `src/app/admin/salud-sistema/page.tsx:102`

`ultimaAlerta` es un `Map` en memoria del proceso. En Vercel cada disparo de cron
es, típicamente, una invocación fría con el mapa vacío, así que el piso casi
nunca aplica. El archivo lo declara con honestidad en su cabecera («por
instancia… mejor esfuerzo»), pero `salud-sistema:102` se lo enseña a Javier como
un hecho: *«máximo uno por evento por hora»*. Con un cron horario coincide por
casualidad; con el de facturar reintentado 2 veces por QStash sobre 5xx
(`facturar/route.ts:698`), tres correos idénticos del mismo evento en el mismo
minuto. Consecuencia: la garantía que se muestra en pantalla no es la que da el
código — el mismo tipo de rótulo que `D3` fue a limpiar de esa misma página.

---

### [BAJO] Nada detecta que un cron dejó de dispararse

`src/app/api/health/route.ts:20-23`

`/api/health` declara explícitamente que **no** mide la ausencia de corridas
(«con la base en cero flotas, "no hubo corridas con trabajo" es lo normal»), lo
cual es correcto hoy y deja el hueco abierto: si el `ignoreCommand` se come un
deploy, si el plan de Vercel cambia, o si `vercel.json` pierde una entrada de
`crons`, el cron simplemente no corre. Ni 200 ni 500: nada. `agente_corrida`
(0102) ya guarda `inicio`/`fin` por flota y es el sustrato natural del
«¿cuándo fue la última corrida?», sin consumidor todavía. Con el primer cliente
esto pasa de deuda a incidente.

---

## Lo que revisé y está bien

- **`src/instrumentation.ts:9-33`** — el orden del arranque está pensado: primero
  se dice si hay observabilidad, luego se enciende, luego se sondea el esquema, y
  la comprobación de red (aviso de privacidad) al final para no retrasar el
  diagnóstico. `onRequestError` (`:56-88`) es el único puente real entre el
  `Digest:` que ve el contralor en pantalla y la línea del servidor, y llama
  `flushObservabilidad()` antes de que la invocación se congele.
- **`src/lib/logger.ts:82-99`** — la huella FNV de UUID en vez del borrado. Es la
  decisión que hace que un log a las 3 a.m. sirva para algo: `huellaId(fila.id)`
  cruza el log contra Postgres, y RFC/teléfono siguen borrándose enteros porque su
  espacio es enumerable. `CLAVES_NO_PII` (`:122`) rescata el `digest` de Next, que
  tiene exactamente la forma de un celular.
- **`src/lib/observability/sentry.ts:161-169,192-203`** — `discriminadores`
  (tenant + causa) metidos al fingerprint, con el argumento de cardinalidad
  explícito y la decisión de NO meter `viajeId`. Y `:259-276` `codigoDeError`,
  estable ante UUIDs y timestamps en el mensaje.
- **`src/app/api/cron/purgar/route.ts:90-111`** — el modelo de cómo debería
  verse el resto: `error` comprobado por valor, `codigo`, `alertarOperador` y
  **500**, en los dos caminos (por valor y por excepción).
- **`src/app/api/cron/facturar/route.ts:612-635,686-763`** — el 503 con los TRES
  caminos probados para el binario de Chromium, y el `finally` que rescata el
  cierre de corrida del camino de fallo duro (con el porqué escrito). `B8`
  (`FalloDePlataforma`, `notificaciones.ts:961`) hace que el correo no acuse al
  cliente de un problema nuestro.
- **`src/app/admin/salud-sistema/page.tsx:74-172`** — cada semáforo medido o
  declarado no-medido; Vercel en neutral honesto; el estado PARCIAL de QStash
  (token sin llaves) identificado como el peligroso.
- **`src/lib/observability/runbook.test.ts:59-98`** — `.env.example` como
  inventario verificado contra `process.env.*` del árbol, en las dos direcciones,
  sin duplicados y sin prometer palancas muertas.
- **`.github/workflows/ci.yml:22-24,58-66`** — corre en TODAS las ramas (no solo
  master), con `concurrency` que cancela lo viejo, y recupera con un paso aparte
  las dos pruebas de tiempo que `--coverage` se salta. Termina en `build`.
- **`src/app/api/correo/entrante/route.ts:147-179,261-290`** — registrar-antes-
  de-procesar con la liberación del dedup cuando la descarga cae, para que Resend
  reintente en vez de consumir el CFDI. Los 503 están donde deben.
- **`src/app/api/webhook/whatsapp/route.ts:212-224`** — `wa.no_entregado` con
  `id`, `codigo` y `detalle`: cierra el circuito del incidente del 28-jul.
- **`src/lib/likida/interruptores.ts:1-22`** — la decisión de fallar cerrado está
  argumentada de verdad (aunque su consecuencia operativa esté en los hallazgos).

## Lo que NO alcancé a revisar

- **La configuración fuera del repo**: si `SENTRY_DSN`, `ALERTA_EMAIL` y
  `CRON_SECRET` están de verdad en Vercel production, si hay reglas de alerta en
  Sentry más allá del «issue nuevo», y si algún monitor externo apunta a
  `/api/health`. Sin `vercel env ls` ni acceso a Sentry, esto solo se puede
  afirmar desde el código — y desde el código todo es «configurado», nunca
  «conectado». Es el mismo hueco que el pase 2 llamó «la prueba de fuego».
- **La prueba de fuego en vivo**: no disparé ningún cron, ningún correo de alerta
  ni ningún evento de Sentry (no corro `npm run build` ni las pruebas de pago).
  Todo lo de arriba es lectura de código verificada línea por línea.
- **`scripts/respaldo.sh`, `scripts/cosecha`, `scripts/deploy-vercel.sh`** — los
  abrí solo de nombre; el runbook de restauración de un respaldo no lo audité.
- **La retención real de los runtime logs** en el plan Pro y si hay log drain: el
  propio `DEPLOY.md:152-153` lo declara sin resolver, y no es verificable desde
  aquí.
- **El costo/ruido del volumen de logs** con tráfico real (la base está en cero
  viajes): cuántas líneas por liquidación y si eso es sostenible.
