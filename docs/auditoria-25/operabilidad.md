# Operabilidad y DX — auditoría 25

**Nota: 5/10** (antes 5). Razón del movimiento: **deuda que cobró factura**. Los
dos CRÍTICOS de la 24 se cerraron de verdad y los verifiqué uno por uno (el
techo de heap vive ahora en `package.json:20` y lo heredan los dos workflows;
`deploy-preview-promote.yml:122` ya trae su `NODE_OPTIONS`) — eso es lo único
que impide que la nota baje. Pero el ALTO que la 24 dejó abierto
(`salud-produccion.yml:134`, `git log --grep` casa contra el cuerpo) **cobró la
factura exacta que se le anunció**: hoy está anclado en `4f94490`, un commit que
Vercel nunca pudo construir, así que el único detector automático de la deriva
nace y muere en rojo. Y en el mismo movimiento apareció un CRÍTICO nuevo de la
misma familia: el `[deploy]` de un PR abierto **a propósito para publicar** se
perdió en el merge commit, y nadie se enteró.

**Riesgo mayor hoy:** hay un bug vivo en producción (`chat.analista.fallo`, 12
fallos en 5 minutos con el mismo tenant inexistente — citado por el propio
arreglo en `src/app/api/dashboard/chat/tenant.ts:44-48`), su arreglo está en
`master` desde el 2-sep, se abrió el PR #318 con `[deploy]` para publicarlo, y
el arreglo **sigue sin salir**. Las tres piezas que debían gritarlo —el
`ignoreCommand`, el paso de push de `salud-produccion.yml` y el cotejo por
schedule— dijeron respectivamente «no construye a propósito», «nada que
cotejar» y un rojo anclado en el commit equivocado.

---

## Estado de despliegue (medido hoy, 3-sep-2026)

`master` local y `origin/master` en este clon apuntan a `615496d` (31-ago) —
están **atrás**; el tip real de la rama base de esta ronda es `HEAD` =
`4f94490`, y `615496d` es ancestro suyo (`git merge-base --is-ancestor` → SI).
Todas las cuentas van sobre `HEAD`.

```
$ git log -1 --format='%h %cd %s' --date=short HEAD
4f94490 2026-09-03 Merge pull request #318 from javiercamarapp/deploy/trigger-chat-fix

$ git log --format='%h|%cd|%s' --date=short HEAD | grep -m1 '|\[deploy'
5a14012|2026-09-03|[deploy] promueve el fix del chat con tenant fantasma (PR #314) a producción

$ git log -1 --format='%s' 4f94490
Merge pull request #318 from javiercamarapp/deploy/trigger-chat-fix
$ git log -1 --format='%b' 4f94490
[deploy] promueve el fix del chat con tenant fantasma (PR #314) a producción
```

`5a14012` lleva la bandera **en el asunto**, pero **nunca fue tip de `master`**:
entró por el merge commit `4f94490`, cuyo asunto la pierde y solo la conserva en
el cuerpo. La compuerta lee la primera línea (`compuerta-deploy.mjs:57`), así que
sobre el tip real el veredicto es:

```
$ node -e "import('./scripts/ci/compuerta-deploy.mjs').then(m=>console.log(
    JSON.stringify(m.decidir({asunto:'Merge pull request #318 from javiercamarapp/deploy/trigger-chat-fix',
                              codigo:'0303', health:{migracion:{base:'0303'}}}))))"
{"construir":false,"nivel":"ok",
 "motivo":"el asunto no lleva [deploy]: este push NO construye a propósito (vercel.json)."}
```

**Por tanto, el último commit con `[deploy]` en el asunto que Vercel pudo
evaluar como tip de `master` es `3cc8ead` (2-sep-2026 11:03:48 -0600)**, «[deploy]
docs: confirma migraciones 0272→0301 aplicadas». Es un commit de un solo padre
(`git log -1 --format='%p' 3cc8ead` → `9d8fea4`), o sea el único de los recientes
que llegó a la punta con la bandera intacta.

```
$ git log --oneline --first-parent 3cc8ead..HEAD | wc -l
9
```

**Sha del último `[deploy]` efectivo: `3cc8ead`. Commits encima: 9**
(de primer padre; 172 contando la historia que arrastró el merge de la rama
vieja `qa/panel-fase-b` en `94ad172`, que no es deriva real). Los 9:

| Sha | Qué se quedó sin publicar |
|---|---|
| `4f94490` | el merge que debía publicar todo esto |
| `5a14012` | el `[deploy]` que se perdió |
| `4c4e465` | dof-diario 2-sep |
| `953d2ce` | merge del diagnóstico de migraciones |
| `70aed6a` | merge del **fix del chat con tenant fantasma** (`66339d5`) |
| `154e015` | merge del `NODE_OPTIONS` de `deploy-preview-promote.yml` |
| `94ad172` | merge de `qa/panel-fase-b` |
| `9f922fd` | cosechador de sitios de prospectos |
| `4198985` | reparación de 2 bloques de `verificaciones.sql` |
| `5180c72` | los 9 agentes graduados + **migraciones 0302 y 0303** |

```
$ git diff --name-only 3cc8ead..HEAD -- supabase/migrations/
supabase/migrations/0302_retira_reservar_presupuesto_llm_huerfana.sql
supabase/migrations/0303_gradua_agentes_experimentales_auditados.sql
```

*No pude cotejarlo contra `https://app.likida.ai/api/health`: el proxy de salida
bloquea ese host, igual que en la 24. La afirmación sale de `git log` + la lógica
real de `compuerta-deploy.mjs`, ejecutada arriba. Un Redeploy manual en el panel
sobre un deployment posterior invalidaría la cuenta; el botón Redeploy sobre el
último deployment, no.*

**Lo que necesita mano humana:** Redeploy en el panel de Vercel **no basta** —
redespliega `3cc8ead`. Hace falta publicar el tip actual, y antes aplicar 0302 y
0303 (si no, la compuerta bloquea con razón: `base 0301` vs `código 0303`).

---

## Hallazgos

### [CRÍTICO] El `[deploy]` se pierde en el merge commit: un PR abierto exclusivamente para publicar no publicó nada, y las tres alarmas dijeron que todo iba bien
`vercel.json:3` · `scripts/ci/compuerta-deploy.mjs:57` y `:89-97` · `.github/workflows/salud-produccion.yml:90-93` y `:109-113` · tip real `4f94490`

Escenario, con valores reales de este repo:

1. `66339d5` («fix(chat): `tenantEfectivoChat` falla cerrado si el tenant de
   sesión/demo no existe») entra a `master` el 2-sep. Arregla un fallo **que ya
   estaba pasando en producción**: el propio comentario del archivo lo fecha y
   lo cuenta (`src/app/api/dashboard/chat/tenant.ts:44-48`: «visto en producción
   el 3-sep-2026 (`chat.analista.fallo`, 12 fallos en 5 minutos, siempre el mismo
   tenant_id inexistente)»).
2. Alguien crea la rama `deploy/trigger-chat-fix` con un commit cuyo asunto es
   `[deploy] promueve el fix del chat con tenant fantasma (PR #314) a producción`
   (`5a14012`). La intención no puede ser más explícita: la rama se llama
   *deploy*, el commit se llama *promueve … a producción*.
3. El PR #318 se mergea **con merge commit** (no squash). El tip de `master`
   pasa a ser `4f94490`, asunto `Merge pull request #318 from
   javiercamarapp/deploy/trigger-chat-fix`. La bandera queda en el **cuerpo**.
4. Vercel corre el `ignoreCommand`. `asuntoDelCommit()`
   (`compuerta-deploy.mjs:89-97`) hace `git log -1 --pretty=%s` → la línea del
   merge. `decidir()` (`:57-59`) evalúa solo la primera línea → `{construir:
   false, nivel:'ok'}`. **No se construye, y ni siquiera con nivel `error`: con
   `ok`, porque desde dentro de la compuerta esto es un push normal.**
5. `salud-produccion.yml:90-93` (paso de la compuerta en el push) hace
   `printf '%s' "$ASUNTO" | head -n1` sobre `github.event.head_commit.message`,
   que para un push de merge es el mensaje del merge commit → primera línea sin
   bandera → «El asunto no lleva [deploy]: nada que cotejar», exit 0.
6. `salud-produccion.yml:109-113` (cotejo del sha) hace exactamente lo mismo y
   sale con «este push NO construye a propósito … Nada que cotejar», exit 0.

Salida: **el CI verde, el push normal en GitHub, cero avisos, y producción
sigue corriendo `3cc8ead`** con el bug del chat vivo.

Consecuencia: el contralor que entre a `/dashboard/chat` en producción sigue
tropezando con el mismo `reservar_presupuesto_llm` reventando por FK violation
turno tras turno — el fallo que un humano ya diagnosticó, ya arregló y ya
intentó publicar. Y para el que mantiene esto, el modo de falla es peor que
olvidar la bandera: **la puso, y el sistema se la comió**. `docs/conocimiento/DEPLOY.md:378-386`
enseña la regla con el ejemplo de un `git commit -m '… [deploy]' && git push`
directo a master, que sí funciona; en ninguna parte de `DEPLOY.md`, `CLAUDE.md`
ni `RESILIENCIA-DEPLOY.md` aparece la palabra «merge commit» ni «squash»
(verificado con grep). El único camino documentado que preserva la bandera es
el que la rutina usa sin decirlo: `auto-merge-rutina.yml:92` mergea con
`--squash`, y por eso los `[deploy]` históricos con `(#NNN)` en el asunto sí
construyeron.

Causa raíz probable: la regla se definió sobre «el commit» sin distinguir *el
commit que escribo* de *el commit que queda en la punta de `master`*; el segundo
es el único que Vercel ve, y el merge de GitHub reescribe su asunto.

---

### [CRÍTICO] Producción lleva 9 commits (y 2 migraciones) sobre el último `[deploy]` efectivo — REINCIDENTE de la 23, la 24 y la 25
`vercel.json:3`, medido con `git log` (ver «Estado de despliegue» arriba)

Escenario: el sha desplegado es `3cc8ead` (2-sep 11:03). Sobre él,
`git log --oneline --first-parent 3cc8ead..HEAD | wc -l` → **9**. Entre lo que
no está en producción: el fix del chat (`66339d5`), la reparación de dos bloques
de `verificaciones.sql` (`4198985`), la graduación de los 9 agentes
(`5180c72`) y **las migraciones 0302 y 0303**.

Consecuencia: `/admin/agentes` en producción sigue pintando 9 agentes como
`vivo` sin la etiqueta `experimental` que la 0301/0303 vinieron a poner — que es,
literalmente, la promesa falsa que esa auditoría cerró en el repo y no en el
producto. Y el chat del contralor sigue roto. Para el equipo: es la tercera
ronda seguida en que se reporta la deriva; en la 24 eran 15 commits sobre
`86813f4`, hoy son 9 sobre `3cc8ead` — el número bajó porque el 2-sep sí hubo
un `[deploy]` que llegó, no porque la deriva se haya cerrado.

Causa raíz probable: no es código; el `ignoreCommand` hace lo que se le pidió.
Lo que falta es publicar. **Pero esta vez el Redeploy del panel no alcanza**
(redespliega `3cc8ead`): hay que aplicar 0302/0303 y publicar el tip, o el
cotejo de la compuerta bloqueará con razón.

*(REINCIDENTE: OP-C1 de la 23 y de la 24.)*

---

### [ALTO] El detector automático de la deriva está anclado HOY en `4f94490`, un commit que Vercel no puede haber construido: rojo permanente, e issue que no se cierra nunca — REINCIDENTE
`.github/workflows/salud-produccion.yml:134` (y el issue de `:150-160`)

Escenario, ejecutado sobre este árbol:

```
$ git log -i --grep='\[deploy' -1 --pretty='%H %s'     # exactamente la línea 134
4f94490abe4f0f9b3328a3f3f88672364b52fdfe Merge pull request #318 from javiercamarapp/deploy/trigger-chat-fix
```

`--grep` de git casa contra asunto **y** cuerpo, y el cuerpo de `4f94490` lleva
la bandera. El paso de la línea 129 entonces exige que el `version` de
`/api/health` sea `4f94490` o un descendiente. Producción corre `3cc8ead`, que
es **ancestro**, no descendiente: `git merge-base --is-ancestor 4f94490
3cc8ead` falla → `::error::Producción corre 3cc8ead y el último commit con
[deploy] en master es 4f94490` → exit 1, cada 30 minutos, para siempre —
porque `4f94490` no llevaba la bandera en el asunto y Vercel jamás lo va a
construir. El paso de `:150` abre el issue `salud-produccion` la primera vez y
`:162` solo lo cierra en `success()`, que no volverá a ocurrir.

Consecuencia doble, y es la peor parte: (1) el mensaje de error **es correcto en
el fondo y falso en el detalle** — sí hay deriva, pero el commit que nombra no
es el que hay que publicar, así que quien lo lea a las 3 a.m. va a buscar por
qué no se construyó un merge commit; (2) el job es uno solo con `if: always()`,
así que el pulso real de `/api/health` (`:64-78`, «¿está viva la app?») queda
sepultado bajo un rojo crónico. Es exactamente la enfermedad que el encabezado
del archivo (`:19-23`) dice estar curando: «40 corridas rojas seguidas sin que
nadie las atendiera demostraron que un correo por corrida se aprende a ignorar».
Y `DEPLOY.md:424-426` advierte contra este mismo error con todas sus letras:
«Lee solo el asunto a propósito: con el mensaje completo, cualquier commit que
*mencionara* la palabra en el cuerpo disparaba un build».

Causa raíz probable: se reusó `git log --grep` en vez de reproducir la regla de
«primera línea» que `decidir()` sí implementa en el mismo PR. La 24 lo reportó
como ALTO con la reproducción hecha; no se arregló, y el escenario ocurrió.

*(REINCIDENTE de la 24, ahora con el disparo real y no hipotético.)*

---

### [ALTO] El job `repair_migrations` marca 0302 y 0303 como aplicadas sin correr su SQL, y a partir de ahí la compuerta de migraciones es un sello de goma
`.github/workflows/deploy-preview-promote.yml:293-331` (el job), `:319-323` (el paso que las marca) · `scripts/ci/migraciones-huerfanas-local.txt` (281 líneas, de `0001` a `0303`) · `supabase/APLICAR-EN-PRODUCCION.md:3-11` · `src/app/api/health/migracion.ts:61-68`

Escenario, con valores:

1. La lista local termina en `0300 / 0301 / 0302 / 0303` (`tail -4`). La lista
   remota trae 288 versiones con sello de tiempo (`20260725062052` …
   `20260902154037`).
2. Se lanza el workflow con `repair_migrations: production` — un desplegable, sin
   la frase de confirmación `APPLY_MIGRATIONS_AND_PROMOTE` que sí exige el job de
   promoción (`:83-86`, `:239`), y **saltándose `preflight`, `quality`, el
   dry-run de staging, la Preview y el smoke**, porque `preflight` lleva
   `if: inputs.repair_migrations == 'none'` (`:61`).
3. El paso 1 (`:315-316`) marca las 288 entradas remotas como `reverted`. El
   paso 2 (`:321-322`) marca las 281 locales como `applied`, **0302 y 0303
   incluidas**.
4. El SQL de 0302 (`drop function … reservar_presupuesto_llm(uuid,uuid,uuid,
   numeric,numeric,numeric)`) y el de 0303 (`update public.agente_definicion set
   experimental = false …`) **nunca se ejecutan**: `migration repair` toca solo
   la tabla de bookkeeping, como el propio comentario del input dice
   (`:36-38`).
5. El paso 4 (`:330`) corre `db push --dry-run` y sale limpio — porque la tabla
   ya afirma que están aplicadas. `db push` no volverá a aplicarlas jamás.
6. `migraciones_aplicadas()` (0234:291-299) devuelve el máximo prefijo de
   `name`, `ultimaMigracionAplicada` (`migracion.ts:61-68`) lo lee como `0303`,
   `cotejar` (`:78-82`) da `atras: 0`, y `decidir()`
   (`compuerta-deploy.mjs:86`) responde «base 0303 a la par del código 0303: se
   construye». **Verde, para siempre, sobre un esquema que no tiene esos
   cambios.**

Que 0302/0303 no están aplicadas no es conjetura: el propio repo lo dice.
`APLICAR-EN-PRODUCCION.md:3-4` (commit `3cc8ead`, 2-sep 11:03:48) afirma
«las migraciones **0272→0301** ya están aplicadas»; 0302 y 0303 nacieron cinco
horas después, en `5180c72` (2-sep 16:06:09). Ese documento es el único registro
de qué se aplicó.

Consecuencia: la única pieza que la auditoría 24 construyó para que «código y
esquema» no dependieran de la memoria de nadie
(`compuerta-deploy.mjs:3-21`, declarada BLOQUEANTE) se vuelve incapaz por
construcción de detectar una migración faltante — y lo hace en silencio, con
el mensaje más tranquilizador de todos. Las dos migraciones perdidas son de
bajo daño (una función muerta y una etiqueta de panel), pero la puerta que se
queda abierta la cruzará la próxima migración de dinero.

Causa raíz probable: el desajuste de bookkeeping (versiones con sello de tiempo
en producción contra prefijos `NNNN` en el repo) se atacó reconciliando la
*tabla* en vez del *esquema*, y la lista se generó por diferencia de nombres,
sin separar «lo que sí corrió y quedó mal anotado» de «lo que nunca corrió».

---

### [ALTO] La compuerta se vuelve permisiva si `/api/health` contesta 429, y contesta 429 en cuanto Upstash parpadea — REINCIDENTE
`scripts/ci/compuerta-deploy.mjs:99-108` (`leerHealth`) · `src/app/api/health/route.ts:58-63`

Escenario: `rateLimit()` falla cerrado sin Redis y `/api/health` devuelve **HTTP
429** con `{"ok":false,"status":"fail","error":"demasiadas peticiones"}` — la
única rama de la ruta que sale **antes** de calcular `migracion` (el campo se
arma más abajo, y `route.ts:184` es el que lo mete en el `status`). `leerHealth`
hace `await r.json()` sin mirar `r.status` (el comentario de `:102` solo
contempla el 503), así que `decidir()` recibe un objeto sin `migracion` y cae en
la puerta de escape de `:70-75`: `{construir: true, nivel:'aviso', motivo: 'el
health desplegado no publica migracion (versión anterior a la auditoría 24)'}`.
**Se construye y se publica** con la base atrás del código, y el log dice que es
porque producción corre una versión vieja.

Consecuencia: la pieza BLOQUEANTE se vuelve no-op justo en el escenario que vino
a impedir, y el motivo desvía al que lo lea. Verificado sin cambios respecto a la
24: `leerHealth` sigue tirando `r.status` a la basura.

*(REINCIDENTE de la 24.)*

---

### [ALTO] Un fallo solo-de-cliente del panel sigue sin dejar rastro en ninguna parte — REINCIDENTE
`src/app/global-error.tsx:31-38` y `:109-113` · `src/lib/logger.ts:157` · `src/proxy.ts:47-51`

Escenario: el contralor abre `/dashboard/facturacion`; un componente cliente
truena después de hidratar. `global-error.tsx:31-38` llama
`logger.error('app.global_error', { digest: error.digest ?? 'sin-digest', err })`.
En `logger.ts` eso es `console.error(JSON.stringify(line))` — la consola **del
navegador del contralor**. La réplica a Sentry (`logger.ts:157`) está tras
`process.env.SENTRY_DSN`, que en el bundle de cliente es `undefined`: no es
`NEXT_PUBLIC_*` y `grep -rn "NEXT_PUBLIC_SENTRY_DSN\|instrumentation-client" src/`
solo devuelve los dos comentarios que documentan su ausencia
(`proxy.ts:50`, `next.config.ts:213`). `onRequestError` no se entera: no hubo
petición al servidor. Y como un error puramente de cliente no trae `digest`, el
bloque de `:109` no pinta el «Código del incidente». Lo único que cambió desde
la 24 es el `?? 'sin-digest'` de la línea 34 — que mejora una línea de log que
no tiene a dónde ir.

Consecuencia: la pantalla dice «La aplicación no pudo continuar» y no hay nada
que preguntarle al contralor ni nada que buscar después — el escenario que el
encabezado del propio archivo (`:21-22`) declara resuelto: «Lo que sí conserva
es lo único que importa a las 3 a.m.: el `digest` en pantalla y una línea en el
log con ese mismo digest». Para este caso las dos mitades siguen siendo falsas.

*(REINCIDENTE de la 24.)*

---

### [MEDIO] `APLICAR-EN-PRODUCCION.md` quedó atrás de las migraciones que documenta: dice 0272→0301 y el repo llega a 0303
`supabase/APLICAR-EN-PRODUCCION.md:3-11` y la tabla de `:51-65` · `supabase/migrations/0302_*.sql`, `0303_*.sql`

Escenario: la compuerta bloquea un `[deploy]` con `faltan 2 migración(es)
(0302..0303)` y remite a este documento. Quien lo abra lee en la primera línea
que «las migraciones 0272→0301 **ya están aplicadas**» y que la sección se deja
«como referencia histórica». La tabla «Qué usa el código de cada pendiente»
(`:51-65`) enumera 0272…0300 y **no tiene fila para 0302 ni 0303**: no hay
manera de saber qué se rompe si no se aplican. El documento se escribió en
`3cc8ead` (2-sep 11:03:48) y las dos migraciones entraron en `5180c72` (2-sep
16:06:09); nadie volvió a tocarlo.

Consecuencia: el único registro de qué está aplicado en producción afirma estar
al día y no lo está. Es también el insumo del hallazgo del `repair_migrations`
de arriba: la lista de 281 migraciones a marcar como aplicadas se construyó
contra un repo cuya última verdad escrita era «0301».

Causa raíz probable: el documento se actualiza a mano, en el mismo commit que
publica, y la migración siguiente entró por otra rama.

---

### [MEDIO] Una liquidación cerrada cuyo PDF no llegó al chofer solo produce un `logger.error`: el camino del dinero no dispara alerta — REINCIDENTE
`src/lib/likida/processor.ts:1059`, `:1067`, `:4253`, `:4276` · `src/lib/observability/alerta.ts:185`

Escenario: el chofer manda «listo», `processor.ts` cierra la liquidación,
`sendDocument` devuelve `{ok:false}` y se registra `logger.error('pdf.no_entregado',
{viaje, tenant, codigo, error})` — con identificadores suficientes, eso está bien
resuelto. Pero `grep -n "alertarOperador" src/lib/likida/processor.ts` sigue sin
devolver nada, y `EVENTOS_DE_DINERO` (`alerta.ts:185`) es
`/^(timbre\.|finanzas\.|stripe\.|cron\.facturar|cron\.cobranza|wa\.rechazo_masivo)/`:
`pdf.` no entra. El único destino es Sentry, y solo si `SENTRY_DSN` está puesto.

Consecuencia: la liquidación queda cerrada con `pdf_url` escrito y el chofer sin
papel; el comentario de `processor.ts:4270` lo dice («no es recuperable por
reintento y nadie lo va a notar salvo por el log»), y `DEPLOY.md:334-335` admite
que el procedimiento de reenvío no está escrito.

*(REINCIDENTE de la 24.)*

---

### [MEDIO] El runbook promete un backup programado de Storage que no existe, y se contradice 84 líneas después — REINCIDENTE
`docs/conocimiento/DEPLOY.md:3-6` vs `:87-89` vs `.github/workflows/backup-storage.yml:3-12`

Verificado sin cambios: el bloque `on:` de `backup-storage.yml` tiene **solo**
`workflow_dispatch` (el `schedule` se quitó porque el environment
`production-backup` nunca se configuró), mientras `DEPLOY.md:3-6` sigue
anunciando en su primera pantalla «backup programado de Storage, manifiestos y
hashes, restore drill seguro». La línea 87 dice en negritas «Este proyecto no
tiene respaldo automático ni PITR», pero es la 5 la que se lee primero.

Consecuencia: pérdida de fotos de comprobantes y PDF de liquidación —evidencia
fiscal de un tercero que el CFF art. 30 obliga a conservar cinco años— más una
hora buscando un backup que no está.

*(REINCIDENTE de la 24.)*

---

### [MEDIO] `npm run setup` no deja el proyecto corriendo en una máquina limpia: termina en error — REINCIDENTE
`package.json:22` (`"setup": "npm install && npm run seed"`) → `scripts/seed.sh:12`

Verificado sin cambios: en un clon limpio, `npm run seed` entra a `seed.sh`, con
`DATABASE_URL` y `SUPABASE_DB_URL` vacíos imprime «❌ Falta DATABASE_URL» y sale
1. No crea `.env.local` (solo existe `.env.example`, 668 líneas), no comprueba
que `psql` exista, y no ofrece la ruta local (`supabase start`) que el propio
repo usa en `e2e-navegador.yml`.

Consecuencia: quien tenga que reconstruir el entorno a las 3 a.m. para
reproducir un fallo necesita un proyecto de Supabase creado a mano antes de que
el comando llamado «setup» haga nada.

*(REINCIDENTE de la 24.)*

---

### [BAJO] La prueba de la compuerta afirma por escrito la regla que el sistema acaba de violar, y no puede reprobar la parte que falló
`scripts/ci/compuerta_deploy_aud24.test.ts:29-32` y `:71-77`

Escenario: la línea 30 fija
`decidir({asunto: 'fix: menciona deploy en el cuerpo\n\n[deploy]', …})` →
`{construir:false, nivel:'ok'}`. Es decir, la suite **afirma explícitamente que
un `[deploy]` en el cuerpo no cuenta** — que es exactamente lo que le pasó a
`4f94490`. Y el bloque «el cableado» (`:71-77`) valida
`salud-produccion.yml` con tres `expect(wf).toContain(...)`
(`'scripts/ci/compuerta-deploy.mjs'`, `"github.event_name != 'push'"`,
`'issues: write'`): las tres pasan hoy y seguirían pasando con el `git log
--grep` roto de la línea 134, que está a cinco líneas de una de ellas. Ninguna
prueba mira nunca el asunto del **tip de `master`**, que es el único que Vercel
lee.

Consecuencia: la suite da luz verde mientras el sistema aplica reglas opuestas
al mismo commit, y el hueco no lo marca nadie.

*(REINCIDENTE de la 24, con la ironía añadida.)*

---

## Lo que revisé y está bien

- **OP-1 / PRU-C1 (el CRÍTICO propio de la 24) está cerrado y sigue en pie.**
  `package.json:20`: `"typecheck": "node --max-old-space-size=6144
  ./node_modules/typescript/bin/tsc --noEmit"`. Los dos workflows lo invocan por
  el script y no por el binario (`ci.yml:95`, `deploy-preview-promote.yml:104`);
  `grep -rn "tsc " .github/workflows/` no devuelve **ninguna** llamada directa a
  `tsc` (los únicos hits son comentarios y scripts locales de la Mac). El techo
  se hereda, como se pidió.
- **El segundo CRÍTICO de la 24 también está cerrado.**
  `deploy-preview-promote.yml:122` ya declara `NODE_OPTIONS:
  --max-old-space-size=6144` en el `Build reproducible`, con el comentario
  fechado de la reproducción (`:115-121`). El camino sancionado ya no muere en
  el primer paso útil.
- **La compuerta de migraciones falla cerrado en su parte pura, y lo probé
  ejecutándola.** `compuerta-deploy.mjs:66-87`: health `null` → no construye;
  base ilegible → no construye; base atrás → no construye con el rango exacto;
  `[deploy:forzar]` como salida a la vista con `nivel:'aviso'`. La inversión de
  exit del `ignoreCommand` está fijada por prueba
  (`compuerta_deploy_aud24.test.ts:66-69`) y `vercel.json:3` la conserva literal.
- **El health degrada por migración, no solo por cron.** `route.ts:184`:
  `migracion.atras !== 0` entra en el `status: 'degraded'`, así que `atras: null`
  (base ilegible) también degrada — un cotejo que no se pudo hacer no es verde.
  Y `migracion.ts:94-107` nunca lanza: un fallo de lectura es `base: null` con
  motivo.
- **OP-C2 de la 22 sigue cerrado.** `route.ts:104-118`: `const muertos =
  [...vencidos, ...sinLatido]` se juzga antes de la rama `config_ausente`
  (`:119-132`), y un cron muerto dispara `alertarOperador('cron.sin_latido')`
  con la lista de cuáles y hace cuántos minutos.
- **Los identificadores del log siguen siendo suficientes, y hay prueba de que
  funcionaron.** El arreglo del chat (`tenant.ts:44-48`) cita la evidencia real
  con la que se diagnosticó en producción: nombre de evento
  (`chat.analista.fallo`), volumen (12 en 5 minutos) y la constante que se
  repetía (el mismo `tenant_id` inexistente). Eso es exactamente lo que este
  rubro pide de un log, y lo entregó. `logger.ts:131` mantiene `digest` exento
  de redacción para que el código de pantalla case con la línea del servidor.
- **El propio arreglo del chat falla cerrado y lo dice, en las dos ramas.**
  `tenant.ts:36-39`, `:52-55` y `:56-59`: `error` de supabase-js se mira por
  valor y se devuelve `null`; un tenant fantasma emite
  `chat.tenant_sesion_fantasma` con el uuid. Es el patrón `exigir()`/`traerTodo()`
  aplicado bien.
- **No hay deriva de variables de entorno en lo nuevo.**
  `git diff b8a1a3a..HEAD -- src/ scripts/ | grep -o 'process\.env\.[A-Z_0-9]*'`
  devuelve solo `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y
  `QA_MES_SMOKE` — ninguna nueva sin declarar. `SENTRY_DSN` (`:89`),
  `ALERTA_EMAIL` (`:100`), `ALERTA_WA` (`:108`), `DEMO_TENANT_ID` (`:72`) y
  `CRON_SECRET` (`:370`) siguen en `.env.example`.
- **El auto-merge de la rutina mergea con `--squash`**
  (`auto-merge-rutina.yml:92`), que preserva la bandera en el asunto — por eso
  los `[deploy]` con `(#NNN)` sí construyeron. El agujero del CRÍTICO 1 es el
  merge **manual**, no el automático.
- **El job de promoción a producción sí exige intención escrita**
  (`deploy-preview-promote.yml:83-86` y `:239`: `APPLY_MIGRATIONS_AND_PROMOTE`),
  y `promote` verifica que las migraciones reales terminaran en verde antes de
  promover (`:265`). El contraste con `repair_migrations`, que no pide nada, es
  lo que hace de ese job un hallazgo.
- **El diagnóstico de migraciones es de solo lectura de verdad**
  (`:283-291`: solo `link` + `migration list`, y el nombre del paso lo declara).

## Lo que NO alcancé a revisar

- **Nada de producción en vivo.** El proxy de salida sigue bloqueando
  `app.likida.ai`, así que no leí `/api/health` ni una vez. Quedan sin
  comprobar: qué `version` corre hoy realmente (toda la sección de estado sale
  de `git log` + la lógica de la compuerta ejecutada localmente), si
  `SENTRY_DSN` y `ALERTA_WA` están puestos en Vercel, y si `migracion.base`
  devuelve hoy `0301` como afirma el runbook.
- **El historial de GitHub Actions.** No consulté la API: no sé cuántas corridas
  de `salud-produccion.yml` llevan en rojo desde el 3-sep, si el issue
  `salud-produccion` ya está abierto (el hallazgo del ancla predice que sí y que
  no se cerrará), ni si `repair_migrations` se llegó a lanzar contra
  `production` o solo contra `staging`.
- **La forma exacta de `schema_migrations.name` después de un `migration
  repair`.** El hallazgo del `repair_migrations` lo reporto por su mitad
  verificable (0302/0303 marcadas sin correr su SQL). Sospecho un segundo efecto
  peor: si el CLI escribe `name` sin el prefijo `NNNN_` (hoy producción lo tiene
  *con* prefijo, según `migracion.ts:16-20`), `ultimaMigracionAplicada`
  devolvería `null` y la compuerta bloquearía **todo** `[deploy]` para siempre.
  No puedo verificarlo sin el CLI ni la base, y por eso no es un hallazgo.
- **`instrumentation.ts`, `sentry.ts` y `arranque.ts` por dentro.** Los di por
  buenos con la revisión de la 24 (no cambiaron desde `b8a1a3a`) y gasté el
  presupuesto en la superficie nueva. No verifiqué el `fingerprint` de Sentry ni
  el agrupado real de issues.
- **`supabase/verificaciones.sql`** (los 2 bloques reparados en `4198985`): no
  puedo correr la batería sin Postgres, así que no sé si la reparación es
  correcta — solo que el commit existe y que el archivo no está en el camino
  del despliegue.
- **`e2e-navegador.yml`, `codeql.yml` y `ci-postgres.yml`**: solo los abrí para
  el patrón de `NODE_OPTIONS`; no audité su lógica.
- **No corrí la compuerta completa** (prohibido: 3 minutos). Ejecuté únicamente
  `decidir()` de `compuerta-deploy.mjs` en un `node -e` aislado, cuya salida está
  transcrita arriba.
