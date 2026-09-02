# Operabilidad y DX — auditoría 24

**Nota: 5/10** (antes 4). Razón del movimiento: **se atacó y subió** — la 24
construyó de verdad lo que faltaba (la compuerta de migraciones con su prueba,
el tercer estado del health que cierra OP-C2, el issue-por-episodio, el canal de
WhatsApp para eventos de dinero). Pero nada de eso está vivo: la CI está roja,
el pipeline sancionado de despliegue tiene el mismo agujero que la tumbó, y
`master` sigue 15 commits por encima del último `[deploy]` con las auditorías 22
y 23 completas sin publicar. Un rubro cuyo trabajo entero está en una rama que
no puede mergear no llega a 6.

**Riesgo mayor hoy:** no hay ningún camino verde a producción. El que existía
(`npm run typecheck` en CI) revienta por heap, el manual
(`deploy-preview-promote.yml`) revienta por lo mismo en tres pasos, y el
automático (`[deploy]` + `ignoreCommand`) lleva cuatro días sin usarse. Si algo
se rompe esta noche con un cliente adentro, el arreglo no tiene por dónde salir.

---

## Hallazgos

### [CRÍTICO] El paso Typecheck de CI corre `tsc` sin techo de heap y muere en OOM — el mismo archivo, 45 líneas más abajo, ya documenta el arreglo y no se lo aplicó
`.github/workflows/ci.yml:94-95` (el paso sin techo) vs `.github/workflows/ci.yml:139-144` (el techo, solo en Build)

Escenario: se pushea `aud24/integracion` (49ecf93, 359,942 líneas TS/TSX, 810
archivos de prueba). El job `verificar` llega a `- name: Typecheck / run: npm run
typecheck` (= `tsc --noEmit`, `package.json` → `"typecheck": "tsc --noEmit"`),
sin `env:` y por tanto sin `NODE_OPTIONS`. Sale
`FATAL ERROR: Ineffective mark-compacts near heap limit — JavaScript heap out of
memory`, exit 134, en las dos corridas del PR #303. Reproducido: con
`--max-old-space-size=2048` revienta, con `6144` pasa con 0 errores. El paso
`Build` de este mismo archivo (línea 129) sí lleva
`NODE_OPTIONS: --max-old-space-size=6144`, y su comentario (líneas 139-143) dice
literalmente «31-ago-2026: el paso de TypeScript de `next build` empezó a tronar
con "JavaScript heap out of memory" en el runner estándar tras crecer el repo».
El mismo diagnóstico, el mismo compilador, el mismo runner — y el `env` se puso
en un solo paso.

Consecuencia: el PR #303 (188 commits, 484 archivos, +34,919) **no puede
mergear**: `auto-merge-rutina.yml:65-79` exige `gh pr checks` en 0 y ninguna
rama `mejora/*` con este árbol pasará tampoco. Todo el trabajo de la auditoría
24 —incluidos los arreglos de fiscal, seguridad y agéntico— queda detrás de un
rojo que no habla de código. Y el cuerpo del PR afirma «`tsc --noEmit`: limpio»,
que es cierto en la máquina de quien lo escribió: el que lea el PR concluye que
la CI está descompuesta, no que le falta memoria.

Causa raíz probable: el techo de heap se trató como propiedad del comando
`next build` y no del proceso Node que compila TypeScript; se puso en el `env`
de un paso en vez de en el `env` del job o en el script de npm.

---

### [CRÍTICO] El único camino sancionado a producción tiene el mismo agujero, tres veces, y su Build ni siquiera declara el techo que CI ya probó necesario
`.github/workflows/deploy-preview-promote.yml:82` (typecheck), `:85` (test:coverage), `:87-91` (build sin `NODE_OPTIONS`)

Escenario: producción está caída a las 3 a.m. y hay que publicar un arreglo por
el camino auditado en vez de por el `[deploy]` (que exige tocar `master`). Se
lanza `workflow_dispatch` con `ref: <sha>` y `promote: true`. El job `quality`
corre `- run: npm run typecheck` en la línea 82 — sin `env:` en el paso, sin
`env:` en el job, y `grep -n NODE_OPTIONS .github/workflows/deploy-preview-promote.yml`
no devuelve **nada** en todo el archivo. Muere igual que ci.yml. Y aunque se
saltara, `Build reproducible` (línea 87) declara `OPENROUTER_API_KEY`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y
`SUPABASE_SERVICE_ROLE_KEY` — los cuatro placeholders que `ci.yml:135-138`
copia — pero **no** el `NODE_OPTIONS: --max-old-space-size=6144` que `ci.yml:144`
puso al lado por esta misma causa el 31-ago.

Consecuencia: `quality` es `needs:` de `supabase-dry-run` y de todo lo que va
después (`vercel deploy`, `db push`, `promote`). El pipeline entero —el que
aplica migraciones a producción bajo confirmación
`APPLY_MIGRATIONS_AND_PROMOTE`— no llega nunca al primer paso útil. Queda solo
`rollback-production.yml` (deshacer) y el botón Redeploy del panel (rehacer lo
viejo): no hay forma de publicar código nuevo por un camino con puertas.

Causa raíz probable: `ci.yml` y `deploy-preview-promote.yml` repiten la misma
secuencia de calidad a mano; el arreglo del 31-ago se aplicó a una copia y la
otra nunca se sincronizó.

---

### [CRÍTICO] Producción sigue atrás: `master` lleva 15 commits sobre el último `[deploy]`, y los dos que faltan son las auditorías 22 y 23 enteras (REINCIDENTE, OP-C1)
`vercel.json:3` (`ignoreCommand`), verificado con `git log`

Escenario, con valores, sobre este clon:

```
$ git log --format='%h %cd %s' --date=short 615496d | grep -m1 '\[deploy\]'
86813f4 2026-08-29 [deploy] cierre: los 9 altos + 14 medios + 2 bajos de la auditoría 21 (#284)
$ git log --oneline 86813f4..615496d | wc -l
15
```

`master` = `615496d` (31-ago). El último asunto con la bandera es `86813f4`, del
**29-ago**. Los 15 que van encima incluyen:

- `7b1f109` — «Auditoría 22 — los 12 rubros auditados y los **34 hallazgos
  críticos y altos arreglados**»,
- `8327ea9` — «Auditoría 23 — 3 críticos arreglados, **y producción lleva 5
  commits atrás**» (la auditoría que documentó la deriva entró sin la bandera y
  la triplicó),
- `0698e90` — el arreglo del lector de QR de CFDI (`zxing-wasm` 3.1.3),
- `615496d` — `next 16.3.3` + `sentry 10.71→10.73`,
- y **5 migraciones nuevas**: `0272_poliza_deducibilidad`,
  `0273_arco_cancelacion_texto_libre`, `0274_wa_conversacion_telefono_normalizado`,
  `0275_arco_search_path_extensions`, `0276_prospecto_empleados`.

`0272_poliza_deducibilidad` es exactamente la migración que
`scripts/ci/compuerta-deploy.mjs:5-7` cita como el incidente que motivó la
compuerta («producción corría con la base en 0271 mientras `master` pedía la
forma 0272»). Sobre la rama auditada la cuenta es 203 commits, 573 archivos,
+50,481 líneas y 27 migraciones.

Consecuencia: 34 arreglos críticos y altos que el repo da por cerrados no
protegen a nadie. Y el ARCO por texto libre (0273) y el `search_path` (0275) son
compromisos legales que el repo cree cumplidos.

Causa raíz probable: no es código — el `ignoreCommand` funciona como se diseñó;
lo que falta es que alguien ponga `[deploy]` o haga Redeploy. Lo que sí es
código es que el detector automático de esta deriva no exista todavía en
producción (vive solo en esta rama) y esté además roto — ver el hallazgo
siguiente.

*(No pude confirmarlo contra `https://app.likida.ai/api/health`: el proxy de
salida devuelve 403 para ese host. La afirmación sale de `git log` + del
`ignoreCommand` de `vercel.json`. Un `vercel --prod` a mano o un deploy desde el
panel sobre un commit posterior invalidaría la cuenta; el botón Redeploy sobre el
último deployment, no.)*

---

### [ALTO] El vigilante nuevo de deriva busca `[deploy]` en el MENSAJE COMPLETO, no en el asunto — se ancla en un commit que Vercel nunca construyó y se queda rojo para siempre
`.github/workflows/salud-produccion.yml:134`

Escenario, ejecutado sobre este árbol:

```
$ git log -i --grep='\[deploy' -1 --pretty='%h %s'      # lo que corre la línea 134
4dc0470 fix(ops): OP-P1/OP-P3 compuerta de despliegue — con la base atrás del código, no se construye
$ # el último con la bandera EN EL ASUNTO, que es lo que Vercel mira:
86813f4 [deploy] cierre: los 9 altos + 14 medios + 2 bajos de la auditoría 21 (#284)
```

`--grep` de git casa contra subject **y** cuerpo. El asunto de `4dc0470` no lleva
`[deploy]`; la bandera está en su cuerpo, porque el commit *habla* de la
compuerta. Vercel, que lee solo la primera línea
(`compuerta-deploy.mjs:57` → `String(asunto).split('\n')[0]`), jamás lo
construyó. El paso de la línea 129 entonces exige que `/api/health` devuelva
`version` = `4dc0470` o un descendiente suyo, falla con
`::error::Producción corre X y el último commit con [deploy] en master es
4dc0470`, y el paso de la línea 150 abre el issue `salud-produccion`, que no se
cerrará nunca porque el pulso no puede volver a verde.

Hay **dos** commits así en la rama (`4dc0470` y `8327ea9`), y por construcción
seguirá habiéndolos: cualquier commit que *explique* la regla la dispara.

Consecuencia: el único detector automático de OP-C1 nace en rojo permanente y
arrastra con él el pulso de `/api/health` (mismo job, `if: always()`), que es la
señal de "¿está viva la app?". Se reinventa exactamente la alarma que el
encabezado del archivo dice estar arreglando: «40 corridas rojas seguidas sin que
nadie las atendiera demostraron que un correo por corrida se aprende a ignorar».
Y `docs/conocimiento/DEPLOY.md:424-426` cierra con la advertencia contra este
mismísimo error: «Lee solo el asunto a propósito: con el mensaje completo,
cualquier commit que *mencionara* la palabra en el cuerpo disparaba un build.
Pasó el mismo día que se puso la regla.»

Causa raíz probable: se reusó `git log --grep` sin `--pretty=%s` + filtro, en vez
de reproducir la regla de "primera línea" que `decidir()` sí implementa 40 líneas
más allá en el mismo PR.

---

### [ALTO] La compuerta de migraciones se vuelve permisiva cuando `/api/health` contesta 429 — y contesta 429 cada vez que Upstash parpadea
`scripts/ci/compuerta-deploy.mjs:69-75` + `src/app/api/health/route.ts:58-63` + `src/lib/ratelimit.ts:286-296`

Escenario, con valores:

1. Upstash no contesta (o rota su token). `rateLimit()` entra por
   `redisConfigurado()` → `intentarRedis` devuelve `null` →
   `fallaCerradoPorDefault()` es `true` (`ratelimit.ts:272`:
   `RATELIMIT_REDIS_FALLA_CERRADO !== 'false'`) → **devuelve `false`**.
2. `/api/health` entra por `route.ts:58` y responde
   **HTTP 429** con cuerpo `{"ok":false,"status":"fail","error":"demasiadas peticiones"}`.
   Ese cuerpo **no tiene campo `migracion`** — es la única rama de la ruta que
   sale antes de calcularlo.
3. Vercel corre el `ignoreCommand` sobre un commit con `[deploy]`.
   `leerHealth()` hace `await r.json()` sin mirar `r.status` (el comentario de la
   línea 102 solo contempla el 503), así que devuelve ese objeto.
   `decidir()` evalúa `const m = health.migracion` → `undefined` → línea 70-75:
   `{ construir: true, nivel: 'aviso', motivo: 'el health desplegado no publica
   migracion (versión anterior a la auditoría 24)' }`.
4. **Se construye y se publica**, con la base 27 migraciones atrás del código, y
   el log del build dice que es porque producción corre una versión vieja.

Consecuencia: la pieza descrita como BLOQUEANTE
(`compuerta-deploy.mjs:3`) se convierte en no-op justo en el escenario que vino a
impedir, y con un mensaje que desvía al que lo lea. Efecto colateral del mismo
punto: un parpadeo de Redis pone a `/api/health` en 429 aunque la base y la app
estén perfectas, y el watchdog de `salud-produccion.yml:78` (`[ "$status" = "200" ]`)
grita "producción caída" por una caída de un tercero opcional.

Causa raíz probable: la única puerta de escape del `decidir()` («el health todavía
no publica `migracion`») se escribió pensando en un solo caso —la versión previa
de la app— y ninguna respuesta distingue "esta versión no lo publica" de "esta
respuesta no llegó a calcularlo". `leerHealth` tira `r.status` a la basura.

---

### [ALTO] Un fallo solo-de-cliente en el panel no deja rastro en ninguna parte, y la pantalla ni siquiera enseña un código
`src/app/global-error.tsx:22` y `:31-38` y `:109`; `src/app/dashboard/error.tsx:43-49`; `src/lib/logger.ts:151-159`; `src/proxy.ts:47-51`

Escenario: el contralor abre `/dashboard/facturacion` en la sala. Un componente
cliente truena **después** de hidratar (un `null` en la animación de count-up, un
`.map` sobre un arreglo que llegó vacío). Next monta `error.tsx` / `global-error.tsx`.
El `useEffect` llama `logger.error('app.global_error', { digest, err })`; en
`logger.ts:151-153` eso es `console.error(JSON.stringify(line))` — que en un
componente cliente sale por la consola **del navegador del contralor**. La
réplica a Sentry (`logger.ts:157`) está guardada tras
`process.env.SENTRY_DSN`, que en el bundle de cliente es `undefined`: no es
`NEXT_PUBLIC_*` ni está en el `env:` de `next.config.ts:27` (que solo declara
`LIKIDA_MIGRACION_CODIGO`). Y aunque lo estuviera, `proxy.ts:47-51` documenta
`connect-src 'self'` y «Sentry vive SOLO en `SENTRY_DSN` (server, sin
`NEXT_PUBLIC_SENTRY_DSN` ni `instrumentation-client.ts`) — el navegador nunca le
habla». `onRequestError` (`src/instrumentation.ts:69`) no se entera: no hubo
petición al servidor. Y como un error puramente de cliente no trae `digest`,
`global-error.tsx:109` (`{error.digest && …}`) **no pinta el bloque «Código del
incidente»**: la pantalla dice "La aplicación no pudo continuar" y nada más.

Consecuencia: el escenario del 6 de agosto que estos dos archivos citan en su
encabezado como resuelto — «el contralor ve "No se pudo cargar el panel" y no hay
nada que preguntarle ni nada que buscar después» — sigue vivo para la mitad de los
fallos del panel. `global-error.tsx:22` afirma «Lo que sí conserva es lo único
que importa a las 3 a.m.: el `digest` en pantalla y una línea en el log con ese
mismo digest»: para este caso las dos mitades son falsas.
(`dashboard/error.tsx:40-42` sí lo dice con honestidad; `global-error.tsx` no.)

Causa raíz probable: se resolvió la observabilidad del servidor
(`instrumentation.ts`) y se dio por cubierto el cliente reusando el mismo
`logger`, que en el navegador no tiene a dónde escribir.

---

### [MEDIO] Una liquidación cerrada cuyo PDF nunca llegó al chofer solo produce un `logger.error` — el camino del dinero no dispara alerta
`src/lib/likida/processor.ts:4253`, `:4276`, `:1059`, `:1067`

Escenario: el chofer manda «listo». `processor.ts` cierra la liquidación en la
base, genera el PDF y `sendDocument` devuelve `{ok:false}` (Meta rechaza el
documento) o `createSignedUrl` falla. Se registra
`logger.error('pdf.no_entregado', { viaje, tenant, codigo, error })` — con
identificadores suficientes, eso está bien resuelto (`huellaId` en `logger.ts:89`
conserva la traza por flota y viaje). Pero **no** se llama `alertarOperador`:
`grep -n "alertarOperador" src/lib/likida/processor.ts` no devuelve nada. El
único destino es Sentry, y solo si `SENTRY_DSN` está puesto en Vercel — la misma
variable que `sentry.ts:213` documenta que ya faltó una vez sin que nadie lo
notara. Los 61 llamadores de `alertarOperador` cubren los 11 crons, el timbrado,
finanzas y cobranza; la entrega de la liquidación al operador, que es el
entregable del producto, no.

Consecuencia: la liquidación queda cerrada en la base con `pdf_url` escrito y el
chofer sin papel. El comentario de `processor.ts:4270` lo dice: «esto no es
recuperable por reintento y nadie lo va a notar salvo por el log». El propio
runbook (`docs/conocimiento/DEPLOY.md:334-335`) lo reconoce como hueco: «Qué se
hace con una liquidación cerrada cuyo PDF no salió — el procedimiento de reenvío
no está escrito».

Causa raíz probable: `alertarOperador` nació como canal de crons
(`observability/alerta.ts:2-9`) y nunca se extendió al ciclo síncrono del
webhook.

---

### [MEDIO] El runbook promete un backup programado de Storage que no existe, y se contradice a sí mismo 84 líneas después
`docs/conocimiento/DEPLOY.md:5` vs `docs/conocimiento/DEPLOY.md:89` vs `.github/workflows/backup-storage.yml:4-12`

Escenario: se borra por accidente el bucket `liquidaciones`. Quien opera abre el
runbook a las 3 a.m., lee en la línea 5 «backup programado de Storage,
manifiestos y hashes, restore drill seguro» y busca la última corrida. En
`backup-storage.yml` el bloque `on:` tiene **solo** `workflow_dispatch` — el
`schedule` se quitó a propósito (comentario en las líneas 4-11: fallaba todas las
noches a las 03:17 UTC porque el environment `production-backup` nunca se
configuró). `docs/operacion/RESILIENCIA-DEPLOY.md:74-84` lista siete pasos
pendientes, el séptimo de los cuales es «Reactivar el `schedule`». No hay
respaldo automático de nada. La línea 89 del mismo DEPLOY.md lo dice en negritas
—«Este proyecto no tiene respaldo automático ni PITR»— pero es la línea 5 la que
se lee primero.

Consecuencia: pérdida de las fotos de comprobantes y los PDF de liquidación, que
el CFF art. 30 obliga a conservar cinco años y que son evidencia fiscal de un
tercero, no producto propio. Y una hora perdida buscando un backup que no está
antes de aceptar que hay que restaurar a mano.

Causa raíz probable: el `schedule` se apagó como medida de ruido y el índice del
runbook, escrito antes, no se corrigió.

---

### [MEDIO] `npm run setup` no deja el proyecto corriendo en una máquina limpia: termina en error
`package.json` (`"setup": "npm install && npm run seed"`) → `scripts/seed.sh:10-15`

Escenario: se clona el repo en una Mac nueva y se corre `npm run setup`. `npm
install` pasa; `npm run seed` entra a `seed.sh:10`, `DATABASE_URL` y
`SUPABASE_DB_URL` están vacíos, imprime «❌ Falta DATABASE_URL» y `exit 1`. El
comando de arranque documentado termina en error. Tampoco crea `.env.local`
(`ls .env*` solo devuelve `.env.example`, 39,612 bytes), ni comprueba que `psql`
exista antes de invocarlo cuatro veces, ni ofrece la ruta local que el propio
repo ya usa en `e2e-navegador.yml:80-81` (`supabase start`).

Consecuencia: quien llega nuevo —o quien tiene que reconstruir el entorno a las 3
a.m. para reproducir un fallo— necesita un proyecto de Supabase creado a mano y
un `DATABASE_URL` antes de que el `setup` haga algo. El mensaje de error es bueno;
el problema es que el único comando llamado "setup" no puede completarse sin
trabajo previo que no está en la ruta.

Causa raíz probable: `setup` se definió como alias de dos comandos existentes, no
como un camino de arranque diseñado.

---

### [BAJO] La prueba de la compuerta no puede reprobar la parte que está mal: comprueba que existan cadenas en el YAML, no lo que hacen
`scripts/ci/compuerta_deploy_aud24.test.ts:71-75`

Escenario: el bloque «el cableado» valida `salud-produccion.yml` con tres
`expect(wf).toContain(...)`: `'scripts/ci/compuerta-deploy.mjs'`,
`"github.event_name != 'push'"` e `'issues: write'`. Las tres pasan hoy y
seguirían pasando con el `git log --grep` roto del hallazgo ALTO de arriba
—están a cinco líneas de distancia en el mismo archivo—. En cambio el caso puro
sí está bien probado: la línea 30 verifica que
`asunto: 'fix: menciona deploy en el cuerpo\n\n[deploy]'` **no** construya, es
decir, la suite afirma explícitamente que un `[deploy]` en el cuerpo no cuenta…
mientras el workflow del mismo PR se ancla justo en un commit así.

Consecuencia: la compuerta llega a revisión con luz verde y la contradicción
—dos piezas del mismo PR aplicando reglas opuestas al mismo commit— no la marca
nadie.

Causa raíz probable: la lógica pura se extrajo a `.mjs` para poder probarla (bien
hecho) y la lógica que quedó en Bash dentro del YAML se "probó" por presencia de
texto.

---

## Lo que revisé y está bien

- **OP-C2 (CRÍTICO de la 22) está cerrado en el árbol.** `src/app/api/health/route.ts:104-118`:
  `const muertos = [...vencidos, ...sinLatido]` se juzga **antes** de la rama de
  `config_ausente` (líneas 119-132). Con `cron_latido` vacía y solo
  `descarga-sat` en `parcial`, la ruta ya no contesta `200 ok`: los otros diez
  crons entran como `sin_latido` → `degraded` → 503. `CRONS`
  (`src/lib/admin/salud.ts:28`) lista los 11, exactamente los 11 `path` de
  `vercel.json:5-49`, y `CADENCIA_MS` espeja las cadencias con una prueba que
  compara las dos tablas. *(No verificable en producción: proxy bloqueado.)*
- **La compuerta de migraciones falla cerrado y está bien probada en su parte
  pura.** `scripts/ci/compuerta-deploy.mjs:66-87`: health `null` → no construye;
  base ilegible → no construye; base atrás → no construye con el rango exacto
  `0272..0276`; `[deploy:forzar]` como salida a la vista. La inversión de exit
  del `ignoreCommand` está fijada por prueba
  (`compuerta_deploy_aud24.test.ts:66-69`). `src/app/api/health/migracion.ts:71-83`
  es puro y `route.ts:184` degrada con `atras !== 0`, así que `atras: null`
  (ilegible) también degrada.
- **Identificadores suficientes en el log.** `src/lib/logger.ts:89-97`: `huellaId`
  (FNV-1a, 12 hex, estable entre despliegues) en vez de `[UUID]`, con `digest`
  exento de redacción (`logger.ts:131`) para que el código de pantalla case con
  la línea del servidor. `observability/alerta.ts:245-249` conserva el folio
  fiscal íntegro en eventos `timbre.*` — sin eso, un CFDI vivo ante el SAT era
  innombrable.
- **El piso de alertas ya no colapsa incidentes distintos.**
  `alerta.ts:126-144`: la llave del piso incluye una huella del detalle (código,
  identidades y todos los UUID que aparezcan en texto), así que doce viajes que
  fallan al timbrar en la misma hora son doce alarmas, no una. El piso vive en
  Redis con `SET NX PX` (`alerta.ts:70-88`) y cae al Map por instancia sin
  lanzar.
- **Segundo canal para el dinero.** `alerta.ts:185-192`: `EVENTOS_DE_DINERO`
  (`timbre.`, `finanzas.`, `stripe.`, `cron.facturar`, `cron.cobranza`,
  `wa.rechazo_masivo`) salen también por WhatsApp a `ALERTA_WA` bajo el mismo
  piso.
- **El arranque grita lo que falta.** `observability/arranque.ts:44-78`: las 7
  variables cuya ausencia *no rompe nada* (`DEMO_TENANT_ID`, `NEXT_PUBLIC_APP_URL`,
  `ALERTA_EMAIL`, las dos de Upstash…) se emiten con nombre y consecuencia, y
  `sentry.ts:227-232` emite `startup.observabilidad` a nivel **error** si falta
  `SENTRY_DSN` en un despliegue. `runbook.test.ts` ata `.env.example` a la tabla
  de DEPLOY.md.
- **Los 11 crons declaran `maxDuration` literal** (60-300 s), verificado uno por
  uno; ninguno depende del default de la plataforma. Y todos tienen puerta común
  con alerta cuando falta `CRON_SECRET` (`admin/salud.ts:78-96`).
- **Los crons no devuelven 200 tragándose el error:** `wa-outbox/route.ts:127`
  (`status: fallidas ? 500 : 200`), `jornada:114`, `escalar:382` y los `catch`
  que devuelven 500 en las once rutas.
- **El auto-merge no mergea con checks rojos ni desde un fork.**
  `auto-merge-rutina.yml:31-36` (exige `head_repository.full_name == github.repository`)
  y `:65-82` (distingue el exit 8 de `gh pr checks` del rojo real, tras el bug de
  `CODE=$?` documentado ahí mismo).
- **`ci-postgres.yml` corre en `push: ['**']` y en `pull_request`**, así que las
  migraciones y el aislamiento por RLS se prueban contra Postgres real en cada
  push, no solo en master.
- **`rollback-production.yml` existe** y `vercel rollback` está a un
  `workflow_dispatch`.
- **`seed.sh` no puede pisar una base real por accidente**: guard por host
  (`*.supabase.co` exige `--produccion` escrito a mano) y guard por nombre (si el
  tenant `1111…` no se llama «Flota Demo», rehúsa).

## Lo que NO alcancé a revisar

- **Nada de producción en vivo.** El proxy de salida devuelve **403 para
  `app.likida.ai`**, así que no pude leer `/api/health` ni una sola vez. En
  concreto quedan sin comprobar: qué `version` corre hoy (el hallazgo OP-C1 se
  sostiene solo en `git log` + el `ignoreCommand` de `vercel.json`), si
  `SENTRY_DSN` y `ALERTA_EMAIL` están puestos en el entorno de Vercel, si
  `migracion.base` ya existe en el health desplegado, y si el 429 del hallazgo
  de la compuerta ya ocurrió alguna vez.
- **El historial de corridas de GitHub Actions.** No consulté la API: no sé
  cuántas corridas de `salud-produccion.yml` llevan en rojo, si el issue
  `salud-produccion` está abierto, ni si `backup-storage.yml` ha tenido alguna
  corrida manual verde desde que se le quitó el `schedule`.
- **No corrí `tsc --noEmit`, `npm run build` ni la suite** (prohibido por el
  encargo). El OOM del Typecheck lo tomo de la reproducción que me entregaron
  (2048 revienta, 6144 pasa) más el comentario de `ci.yml:139-143`, que
  documenta el mismo fallo con fecha.
- **Sentry por dentro:** no pude ver si los issues agrupan como el código espera
  (`fingerprint` por `codigo`), ni la retención real del plan, ni si alguien
  tiene notificaciones configuradas. Todo lo que digo de Sentry sale de
  `observability/sentry.ts`.
- **El costo real del `maxBuffer: 20 * 1024 * 1024` de `lint-ratchet.mjs:20`**:
  sospecho que la salida JSON de ESLint sobre 359,942 líneas se acerca al tope y
  que al pasarlo el mensaje sería «ESLint no produjo JSON válido» en vez de
  «buffer excedido», pero no lo medí y por eso no lo reporto como hallazgo.
- **`e2e-navegador.yml` y `codeql.yml`** solo los leí por encima buscando el
  patrón del heap; no audité su lógica.
