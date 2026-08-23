# Operabilidad y DX — auditoría 18 · continuación 4

**Nota: 6/10** (antes 6). **Sin movimiento**, y la razón hay que escribirla porque
dos fuerzas del mismo tamaño se cancelaron:

- **Se atacó y subió** — de verdad. `923bbfb` convirtió un repo que **no arrancaba
  al clonarse** en uno que llega a suite verde en dos pasos (lo cloné y lo corrí:
  485 archivos, 6,247 pruebas, 157 s, árbol limpio). Y el aparato de alerta que
  entró con RES-3/7/8/16/17 es bueno de verdad: latido por cron, códigos estables,
  timeouts acotados en los dos saltos a terceros, piso global en Redis.
- **Mirada más profunda** — y pesa lo mismo hacia abajo. La **única** puerta que
  demuestra el aislamiento entre flotas y la atomicidad de las escrituras de dinero
  contra un Postgres real corre sus seis bloques más nuevos y **no califica ni uno**;
  imprime lo que midió y sale con código 0 diciendo «La batería pasó». Eso no lo
  sabía la c3, y es peor que lo que el 6 anterior estaba pagando.

**El riesgo mayor del rubro, hoy:** el CI dice verde sobre afirmaciones que nadie
comparó. `verificaciones.sql` bloque 131 —el que prueba que `registrar_pago_tx` no
deja pasar un sobrepago— corre en cada push, imprime `sobrepago-rebota=?` y el
runner lo marca «SIN CALIFICAR» sin fallar. Y el auto-merge ni siquiera escucha ese
workflow.

---

## Verificación de los abiertos de la c3

| Hallazgo (c3) | Estado | Evidencia |
|---|---|---|
| **[CRÍTICO]** `master` sin protección + auto-merge cuyo control de acceso es cómo se llama una rama | **REINCIDENTE** (la mitad del workflow, verificada hoy; la de Settings, no) | `.github/workflows/auto-merge-rutina.yml:22-24` sigue con `contents: write` + `pull-requests: write`; `:29-32` sigue condicionando solo a `event=='pull_request'`, `conclusion=='success'` y `startsWith(head_branch,'mejora/')`; `:40-43` sigue resolviendo el PR con `gh pr list --head "$RAMA"` y mergeando con `--squash --delete-branch`. **No pude reverificar `"protected": false`**: esta corrida tiene prohibida la red hacia fuera. Ese dato viene de la c3 (22-ago). |
| **[CRÍTICO]** El piloto de visión opera portales fiscales y todo su camino de fallo está en `info` | **REINCIDENTE, byte por byte** | `git log -- .../piloto_vision.ts` devuelve **un solo commit**, `feb0f6b` (#36): el delta de hoy no lo tocó. Las cuatro llamadas siguen en las mismas líneas: `:121` warn, `:153` info, `:206` error, `:255` info. Conté las salidas de fallo de `volar()` abriendo el archivo: `:135` (sin inventario), `:147` (captcha del DOM), `:157` (captcha visto por el modelo), `:161` (`no_puedo`), `:172` (loop-guard), `:181` (problema de `ejecutar`), `:188` (agotó los pasos), `:201` (terminó sin llenar un campo) — **ocho, y ninguna registra nada**. `grep registrarCosto` → 0. |
| **[ALTO]** El auto-merge mergea el HEAD del momento, no el sha auditado | **REINCIDENTE** | `auto-merge-rutina.yml:40-43`: sigue sin `--match-head-commit`, y `github.event.workflow_run.head_sha` no aparece en el archivo (`grep head_sha` → 0). |
| **[ALTO]** Lo que auto-mergea el bot no vuelve a correr CI en `master` ni dispara el cotejo de salud | **REINCIDENTE** | `auto-merge-rutina.yml:36` sigue en `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`; `ci.yml:22-23` y `salud-produccion.yml:22-23` siguen disparando por `push`. |
| **[ALTO]** La compuerta es no determinista (`engine_iva_medio_pago.test.ts:35`) | **NO REPRODUCIDO hoy** (sigue abierto) | Corrida completa con la máquina ocupada por mis propios greps: `485 passed (485) · 6247 passed | 1 skipped · 157.02 s`, exit 0. Dos rondas seguidas sin reproducirlo no lo cierran; solo bajan la frecuencia estimada. |
| **[MEDIO]** `salud-produccion.yml` sale por la puerta de atrás justo en el caso de deriva que su encabezado dice cubrir | **REINCIDENTE** | `salud-produccion.yml:52-55` sigue siendo `if ! grep -qi '\[deploy\]'; then echo "…Nada que cotejar."; exit 0; fi`. Y la rama `schedule` (`:34-42`) sigue comprobando solo `"ok":true`: **nunca** compara `version` contra el HEAD de `master`. |
| **[MEDIO]** El `[deploy]` puede entrar por el título del PR que redacta el modelo barato | **REINCIDENTE** | `scripts/mejora-diaria/correr.sh:76` (`TITULO` sale del JSON del auditor), `:99` (el encargo prohíbe `[deploy]` **en el commit**), `:133` (`--title "mejora-diaria: $TITULO"`). `vercel.json:3` sin cambios. |
| **[MEDIO]** `DEPLOY.md` no nombra `FACTURACION_PILOTO` ni `FACTURACION_MODO` | **REINCIDENTE** | `grep -c "FACTURACION_PILOTO\|FACTURACION_MODO" docs/conocimiento/DEPLOY.md` → **0**. `SILENCIOSAS` (`arranque.ts:44-79`) sigue con ocho entradas y ninguna es esa, así que `runbook.test.ts` sigue sin poder cazarlo. |
| **[BAJO]** `.latido-salud` fechado el 10-ago | **REINCIDENTE, ahora 13 días** | `.latido-salud:1` → `fecha: 2026-08-10`, y su cuerpo dice «3157 passed … 252 archivos» contra los **6,247 / 485** de hoy. `grep -rn latido-salud` fuera de `docs/auditoria-*` → **solo** `.claude/skills/salud-del-repo/references/prompt.md:72`. Nada comprueba su frescura. |
| **OPER-C4-1** — `node_modules` como enlace a la laptop del autor | **CERRADO, y verificado clonando** | `git ls-tree HEAD node_modules` → vacío. `.gitignore:1` es `node_modules` **sin diagonal**. Cloné el repo a otro directorio (`git clone --no-hardlinks`) y `git status --porcelain` sale **vacío**; los 5 enlaces que sí quedan versionados (`.claude/skills/{agent-email-inbox,email-best-practices,react-email,resend,resend-cli}`) son **relativos** (`../../.agents/skills/…`) y resuelven. La guardia (`src/lib/pruebas/arbol_sin_enlaces_ajenos.test.ts:48-62`) prohíbe destino absoluto y `git ls-files -- node_modules` no vacío: está bien acotada, no de más. |

---

## Hallazgos

### [CRÍTICO] La batería de Postgres corre los seis bloques más nuevos y no califica ninguno — imprime lo que midió y sale «pasó»

`scripts/ci/correr-verificaciones.mjs:349-357` · `:325-328` ·
`supabase/verificaciones.sql:6738` (bloque 131), `:6279` (122), `:6089` (123),
`:5970` (126), `:6576` (127), `:7331` (135) ·
`.github/workflows/ci-postgres.yml:155-163`

El runner califica un bloque comparando las claves `x=` del mensaje contra la lista
`(esperado a / b / c)`. Si los dos conteos no coinciden, marca `sin_calificar`… y
`sin_calificar` **no falla**: la salida solo es distinta de cero con `fallas > 0 ||
noLanzaron > 0` (`:349`).

Partí los 123 bloques `do $$` del archivo y apliqué el mismo parser del runner a
cada mensaje de cierre. Salieron **2 reportes** —exactamente los dos que el propio
encabezado del runner nombra (`:466` «FOTOS REPETIDAS», `:2387` planes con/sin
índice), que es lo que me dice que el parser está replicado bien— y **21 bloques
que no se califican**: 19 `sin_calificar` y 2 en los que *todos* los esperados son
prosa con espacios, o sea comodín, y que se cuentan como **✓ ok**.

De esos 21, **seis son del delta de hoy**, y son los grandes:

| Bloque | Migración | Claves vs esperados | Su `(esperado …)` |
|---|---|---|---|
| 131 (`:6738`) | 0159 — las tres escrituras de dinero atómicas | **16 vs 1** | `(esperado todo t salvo anon=f)` |
| 122 (`:6279`) | 0150 — los 11 agregados que reemplazaron a `analytics.ts` | **16 vs 5** | `(esperado 11/t/t/t/t y once t)` |
| 123 (`:6089`) | 0151 — el agregado fiscal | **14 vs 7** | `(esperado t/f/f/t \| 11 celdas, 11/11, …)` |
| 126 (`:5970`) | 0154 — cursor del Registro de Viajes | **8 vs 9** | `anon=%/%` es UNA clave con DOS valores |
| 127 (`:6576`) | 0155 — purgas y bucket | **9 vs 10** | `bucket=%/%`, mismo caso |
| 135 (`:7331`) | 0163 — el cobro de Stripe | **8 vs 1** | `(esperado todo t salvo anon_price=f)` |

Escenario, con valores: alguien reescribe `registrar_pago_tx` (0159) y el guard del
sobrepago deja de aplicar. Un pago de **$1,500** contra una factura de **$1,000**
ahora entra. El bloque 131 corre en CI Postgres, hace su ataque y lanza
`RPCS_0159 parcial-entra=t sobrepago-rebota=f saldo-nunca-negativo=f …`. El runner
detecta 16 claves y **1** valor esperado, imprime `▲ …:6610 SIN CALIFICAR (16
clave(s) detectada(s) vs 1 valor(es) esperado(s)) — revisar a mano`, no incrementa
`fallas`, y al final imprime **«La batería pasó»** con exit 0. El step de
`ci-postgres.yml:155-163` sale verde. El ▲ vive dentro de un `$GITHUB_STEP_SUMMARY`
plegado, de un workflow que —ver el ALTO de abajo— no bloquea nada.

Consecuencia: el único lugar del repo donde se demuestra contra Postgres real que
una flota no ve a otra y que el dinero se escribe una sola vez, **hoy tiene 17% de
sus bloques en "sin opinión"**, y los seis que la campaña de agregación de hoy
escribió a propósito están entre ellos. Para Javier, «CI Postgres verde» significa
menos de lo que cree; para el contralor, la garantía de aislamiento que el pitch
promete no está siendo medida en el camino nuevo.

Causa raíz probable: el `(esperado …)` es prosa libre del autor y el runner lo
acepta como formato; nada obliga a que el bloque sea calificable ni acota cuántos
pueden dejar de serlo (no hay tope de `sinCalificar`, y `correr-verificaciones.mjs`
es el único archivo de la puerta que no tiene una sola prueba propia — no está en el
include de vitest).

*(Salvedad honesta: aquí no hay Postgres. Esto es análisis estático de las cadenas
de formato, no una corrida. Para los seis bloques nuevos los `%` son booleanos o
enteros, así que la sustitución no puede añadir `=` ni `/` y los conteos se
sostienen; en algún bloque viejo con listas de texto podrían moverse.)*

---

### [CRÍTICO · REINCIDENTE] El repo es público y el único control de acceso a `master` es cómo se llama una rama

`.github/workflows/auto-merge-rutina.yml:22-24`, `:29-32`, `:40-43`

Reverificado hoy abriendo el archivo: idéntico a como lo dejó la c3. El escenario
completo está desarrollado en `operabilidad-c3.md:89-132` y no lo repito. Lo que sí
agrego, porque es nuevo: la mitad de Settings (protección de rama) **no la pude
reverificar** — esta corrida tiene prohibida la red hacia fuera, así que ese dato
sigue siendo el de la c3 (22-ago, `"protected": false`). Si alguien la activó desde
entonces, este hallazgo cambia de tamaño; el workflow, no.

---

### [CRÍTICO · REINCIDENTE] El piloto de visión opera portales fiscales y sus ocho salidas de fallo no dejan una línea

`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:135,147,157,161,172,181,188,201`

Escenario con valores: la flota Innovativos tiene el piloto encendido
(`FACTURACION_PILOTO`) para el comercio `pemex-xyz`. El portal cambia el `name` del
campo de RFC. El piloto abre la página, gasta **8 llamadas de visión** (`decidir()`
en `:152`, una por paso hasta `PASOS_MAXIMOS`) y sale por `:188` con
«El piloto agotó sus N pasos sin terminar el formulario. El historial quedó en el
log» — pero el historial vive en la variable local `historial`, y el único log del
camino feliz es `piloto.paso` a nivel **`info`** (`:153`). En Sentry no nace nada:
`logger.error` solo se emite en el `catch` de `:206`, y esta salida es un `return`,
no una excepción. Al día siguiente la pregunta «¿por qué no se facturó el viaje
V-8842?» se contesta con ocho `info` sin `tenant` y sin `codigo`, si el log todavía
existe.

Consecuencia: el subsistema con más riesgo del producto —un robot tecleando en un
portal fiscal ajeno, con la credencial de la flota— es el único cuyo camino de fallo
no llega al canal que alguien mira. El doc del demo manda encenderlo.

Causa raíz probable: el archivo se escribió como prototipo detrás de bandera y nunca
pasó por la campaña de `codigo`/`alertarOperador` que sí recorrió los crons y el
intake (`883055e`, `0d1d7fe`, `faa959f`).

---

### [ALTO] El auto-merge solo escucha "CI": migraciones rotas, fuga entre flotas, CodeQL y Dependency Review pueden estar en rojo y el PR se squashea igual

`.github/workflows/auto-merge-rutina.yml:18-20` · `ci-postgres.yml:54` ·
`codeql.yml:15` · `dependency-review.yml:10`

`workflow_run.workflows` casa por **nombre exacto**, y el gate declara
`workflows: ["CI"]`. Los nombres reales del repo son cuatro más:
`CI Postgres (aislamiento entre tenants)`, `CodeQL`, `Dependency Review`,
`Salud de producción`. Ninguno entra.

Escenario con valores: la rutina de las 05:30 abre `mejora/2026-08-24-indice-viajes`
con una migración `0168_indice_viajes.sql` que usa `create index concurrently`
—ilegal dentro de la transacción implícita de un `psql -f`—. `ci.yml` no toca
Postgres: tsc, lint, 6,247 pruebas offline y build pasan en ~6 min y sale **verde**.
`ci-postgres.yml` corre en paralelo, el bucle de `:126-137` imprime
`::error::La migración supabase/migrations/0168_indice_viajes.sql no aplicó limpia
sobre una base virgen` y sale **rojo** a los ~2 min. El `workflow_run` de "CI"
dispara `verde-mergea`, que squashea a `master`. La migración rota queda en la rama
principal y el siguiente `supabase db push` truena en producción.

El mismo camino sirve para el caso caro: un `alter view … security_definer` que
`verificaciones.sql` caza como fuga entre flotas (es el ataque que dio origen a esa
batería, la vista `factura_saldo` de la 0054). Rojo en CI Postgres, verde en CI,
mergeado.

Consecuencia: el comentario que el propio workflow publica —«🔴 La auditoría (CI)
salió en rojo»— enseña que "la auditoría" es una cosa sola. No lo es: la mitad que
prueba la base ni siquiera se consulta.

Causa raíz probable: el gate se escribió cuando `ci.yml` era el único workflow con
pruebas, y `workflow_run` obliga a enumerar nombres a mano — no hay forma de decir
«todos los checks».

---

### [ALTO] `/api/health` es pública, sin límite de tasa, y es el disparador del único aviso de cron muerto

`src/app/api/health/route.ts:54-82` · `src/proxy.ts:163-165` ·
`src/lib/observability/alerta.ts:66-102`

`proxy.ts:164` excluye `/api` del matcher, y la ruta no llama a `rateLimit` (lo
comprobé contra el resto: `/v1` sí en `_comun.ts:190,218,272`, el webhook en
`route.ts:186`, el copiloto en `:111`). Cada GET anónimo a `/api/health` ejecuta
**dos** consultas a Supabase —`tenant` count en `:57-60` y `cron_latido` en
`salud.ts:117-119`— y, mientras algún cron esté `vencido`, además un
`SET NX PX` a Upstash (`alerta.ts:71-76`) y, el primero de la hora, un envío por
Resend.

Escenario con valores: 04:00, el cron `facturar` lleva 35 min sin latir (cadencia
15 min + tolerancia 20, `salud.ts:41,47`) → `vencido`. Alguien —o un escáner— pega
`/api/health` a 50 req/s durante un minuto: **3,000 comandos** a Upstash en 60
segundos, sobre el mismo proyecto Upstash del que dependen el techo del login, el
del webhook de WhatsApp, el de `/v1`, el de leads y el de exports (`DEPLOY.md`, tabla
de variables). Agotado el cupo o degradado el servicio, `reservarPisoRedis` devuelve
`null` (`:79`,`:85`), `alertarOperador` cae al `Map` **por instancia** (`:98-101`) y
cada lambda nueva manda su propio correo por el mismo evento. Y `ratelimit.ts` cae
al mismo Map: el techo del login deja de ser un techo.

Consecuencia: el endpoint que existe para decir si el sistema está vivo es el camino
más barato para tumbar la defensa compartida y para inundar el canal de alerta,
justo en el momento en que un cron ya está caído. Es la alerta matando a quien
avisa, por el lado del presupuesto.

Causa raíz probable: la ruta nació como health estático («sin auth a propósito»,
`:47-49`) y en `883055e` se le colgó un **efecto secundario** —consultar latidos y
alertar— sin revisar que el disparador ahora fuera tráfico anónimo y no acotado.

---

### [ALTO] El único cotejo automático de producción se queda VERDE con los cinco crons muertos

`.github/workflows/salud-produccion.yml:34-42` · `src/app/api/health/route.ts:97`
· `src/lib/admin/salud.ts:105-113`

`/api/health` decide a propósito no bajar a 503 por un cron vencido
(`route.ts:28-33`: «No baja el status a 503 … el cron muerto se avisa por correo»).
El workflow, del otro lado, comprueba exactamente dos cosas: `status = 200`
(`:41`) y `grep -q '"ok":true'` (`:42`). Nadie mira el campo `crons`, que está ahí
mismo en el cuerpo (`route.ts:95`).

Escenario con tiempos: 23-ago 03:00. Vercel deja de disparar los cinco crons (plan
degradado, proyecto pausado, `vercel.json` desplegado sin la sección `crons` — casos
que **no** producen 401 y por tanto no dejan ni un `cron.*.no_autorizado`). A las
03:21 `wa-pendientes` cruza cadencia+tolerancia; a las 04:00, la corrida programada
de `salud-produccion` pega a `/api/health`, que devuelve **200** con
`{"ok":true,…,"crons":{"wa-pendientes":"vencido",…}}`. El workflow imprime el cuerpo
y **pasa**. Lo mismo las 48 corridas del día. La bandeja de WhatsApp de los
operadores no se drena, y el tablero de Actions lleva 48 palomitas.

Lo único que quedaría es el correo de `alertarOperador('cron.sin_latido')`
(`route.ts:75-78`), que depende de `ALERTA_EMAIL` — **tercera ronda seguida en que
nadie ha podido confirmar que esté puesta en Vercel**.

Consecuencia: la respuesta a «si esto revienta a las 3 de la mañana, ¿qué tengo a la
mañana siguiente?» es hoy «un correo, si la variable está puesta». El semáforo
automático no lo dice, y el runbook (`DEPLOY.md:207-210`) invita a confiar en él.

Causa raíz probable: `salud-produccion.yml` se escribió (M18, c3) contra un
`/api/health` que todavía no medía crons; `883055e` amplió el cuerpo y no amplió al
consumidor. Un `grep -q '"vencido"' && exit 1` cierra el hueco.

---

### [ALTO · REINCIDENTE] El auto-merge mergea el HEAD del momento, no el sha que la auditoría aprobó

`.github/workflows/auto-merge-rutina.yml:40-43`

Sin cambios desde la c3; el escenario con tiempos está en `operabilidad-c3.md:169-198`.
Confirmado hoy: `grep head_sha .github/workflows/auto-merge-rutina.yml` → 0
coincidencias, y `gh pr merge` sigue sin `--match-head-commit`.

---

### [ALTO · REINCIDENTE] Lo que auto-mergea el bot no vuelve a correr CI en `master` ni dispara el cotejo de salud

`.github/workflows/auto-merge-rutina.yml:36` · `ci.yml:22-23` · `salud-produccion.yml:22-23`

Sin cambios desde la c3 (`operabilidad-c3.md:202-227`). Se agrava con el ALTO del
gate: el push con `GITHUB_TOKEN` que no dispara workflows es el mismo que ya se
mergeó sin consultar CI Postgres, así que ese código **nunca** ve una corrida de la
batería de aislamiento, ni en el PR ni en `master`.

---

### [MEDIO] La «comprobación de conteo» del respaldo de Storage es una tautología: compara dos números que el mismo bucle acaba de escribir

`scripts/respaldo-storage.sh:163-169` (y su encabezado `:22-24`) ·
`docs/conocimiento/DEPLOY.md:101-102`, `:113`

El encabezado promete: «Compara CONTEO listado vs CONTEO en disco y falla si no
cuadra. Un respaldo que no se comprueba no es un respaldo». El código:

- `TOTAL` = `wc -l MANIFIESTO.tmp` (`:131`).
- El bucle `:145-161` lee **una línea de `MANIFIESTO.tmp` por vuelta** y escribe
  **exactamente una línea** a `MANIFIESTO.nuevo` (`:160`).
- `EN_DISCO` = `wc -l MANIFIESTO.nuevo` (`:165`).

`EN_DISCO == TOTAL` por construcción: bajo `set -e`, si el `curl -f` falla el script
sale en `:157` y nunca llega a la comparación. **Nada vuelve a mirar el disco**: no
se hace `stat` del archivo bajado ni se compara su tamaño contra el `$bytes` que el
origen listó. El único `wc -c` real está en la rama de *idempotencia* (`:151`), que
solo corre cuando el archivo **ya estaba**.

Y hay una fuga concreta por debajo: la columna sha256 se calcula con
`$(shasum -a 256 …)` **dentro de los argumentos de `printf`** (`:160`), y el script
comprueba `jq` (`:76`) y `aws` (`:176`) pero **no `shasum`**. Lo probé en esta caja:
con `set -euo pipefail`, un comando inexistente dentro de esa sustitución **no aborta**
—`printf` devuelve 0— y la línea se escribe con la cuarta columna vacía. Resultado:
en una máquina de respaldo sin perl, `MANIFIESTO.tsv` queda sin un solo hash y el
script imprime `✓ N objeto(s) verificados`.

Escenario con valores: 2027, la flota Innovativos pide los comprobantes de 2026 por
un requerimiento del SAT. Se restaura el dump y se corre el paso 3 del runbook
(`DEPLOY.md:152-166`, «cada ruta de la base tiene que aparecer en el manifiesto»).
Las 4,300 rutas aparecen. Pero 12 PDFs quedaron truncados o con el hash vacío y
nadie puede demostrar cuáles: el respaldo dijo `✓ 4300 objeto(s) verificados` cada
semana.

Consecuencia: el runbook advierte —bien— que «correr solo el primero deja un
respaldo que *parece* completo — es la forma más cara de este fallo», y el segundo
script tiene exactamente esa forma. Un rótulo que no es verdad, en el archivo cuyo
propósito es que se pueda confiar en él.

Causa raíz probable: la comprobación se escribió sobre el manifiesto (el registro de
lo que el script *creyó* hacer) en vez de sobre el sistema de archivos (lo que de
verdad quedó).

---

### [MEDIO · REINCIDENTE] `salud-produccion.yml` sale por la puerta de atrás justo en el caso de deriva que su encabezado dice cubrir

`.github/workflows/salud-produccion.yml:52-55`, `:34-42` · `docs/conocimiento/DEPLOY.md:207-210`

Idéntico a la c3 (`operabilidad-c3.md:282-321`). Verificado abriendo el archivo hoy.

---

### [MEDIO · REINCIDENTE] El asunto que publica a producción lo puede redactar el modelo barato, por la vía del título del PR

`scripts/mejora-diaria/correr.sh:76`, `:99`, `:133` · `auto-merge-rutina.yml:43` · `vercel.json:3`

Idéntico a la c3 (`operabilidad-c3.md:325-357`). Sigue pendiente de un dato de
Settings que tampoco pude leer hoy (el ajuste de título de squash del repositorio).

---

### [MEDIO · REINCIDENTE] `DEPLOY.md` no nombra `FACTURACION_PILOTO` ni `FACTURACION_MODO`, y la guardia nueva no puede cazarlo

`docs/conocimiento/DEPLOY.md` (grep → 0) · `src/lib/observability/arranque.ts:44-79`
· `src/lib/observability/runbook.test.ts:135-136`

La guardia de A18 itera `SILENCIOSAS`, que hoy tiene ocho entradas
(`DEMO_TENANT_ID`, `LIKIDA_WHATSAPP_MSG_USD`, `NEXT_PUBLIC_APP_URL`, `ALERTA_EMAIL`,
`LIKIDA_FLOTA_COOKIE_LLAVE`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`).
Las dos del piloto no están, así que la suite no puede exigir que el runbook las
nombre. Escenario: el día del demo hay que encender el piloto; la única
documentación viva es `.env.example:259-325`, que no es el archivo que se abre a las
3 a.m.

---

### [MEDIO] El único detector de podredumbre lenta lleva 13 días muerto y nada lo nota

`.latido-salud:1` · `.claude/skills/salud-del-repo/references/prompt.md:72`

`fecha: 2026-08-10`. Su cuerpo afirma «5/5 corridas verdes. 3157 passed | 1 skipped
(3158 total), 252 archivos» — la suite de hoy tiene **6,247 pruebas en 485
archivos**, o sea que el archivo describe un repo que ya no existe. `grep -rn
latido-salud` fuera de `docs/auditoria-*` devuelve **una sola** coincidencia: el
prompt que lo escribe. No hay prueba, ni workflow, ni paso de CI que mire su fecha.

Escenario: la rutina semanal de `salud-del-repo` dejó de dispararse el 10-ago (cron
caído, cuota, cambio de nombre de la skill — da igual cuál). Nadie se entera porque
el único rastro de que corre es el archivo que ella misma escribe. Tres semanas
después, una dependencia con CVE y un test intermitente llevan ese tiempo sin
clasificarse, y quien abra `.latido-salud` lee «Sin intermitencia, sin roto. Sano».

Causa raíz probable: un vigilante cuyo único registro es su propia salida no puede
señalar su propia ausencia. Falta que algo compare su fecha contra hoy.

---

### [BAJO] El cotejo del sha puede tardar 16.7 min con `timeout-minutes: 15`: el job muere sin imprimir su diagnóstico

`.github/workflows/salud-produccion.yml:32`, `:37`, `:57-62`

El bucle son 20 vueltas de `curl --max-time 20` + `sleep 30` = hasta **1,000 s**,
más los hasta 20 s del primer paso: 17 minutos contra un tope de 15. Escenario: el
build de Vercel tarda y las respuestas van lentas; a los 15:00 GitHub mata el job.
El operador ve «The job exceeded the maximum execution time» en vez de la línea que
el autor escribió para él (`:63`: «Producción sigue en 'abc1234' y el push con
[deploy] fue 'def5678' — el build no llegó»). Rojo en los dos casos, pero el
diagnóstico se pierde justo cuando hace falta.

---

### [BAJO] El README público anuncia un panel que se borró hace 16 días, y `npm run setup` falla en una máquina limpia

`README.md:80-82` · `src/proxy.ts:105-108` · `package.json:15` · `scripts/seed.sh:10-15`

`README.md:81` lista «**`/chofer`** (portal del operador)» entre los cuatro paneles.
`ls src/app` no tiene `chofer` ni `mis-viajes`, y `proxy.ts:105-107` explica por qué:
«salieron el 7-ago-2026: el chofer ya no tiene cuenta ni panel propio, solo
WhatsApp». Es la primera página que ve cualquiera —el repo es público y el propio
`.gitignore:29-38` dice que se dejó así «para lectura externa tipo VC/diligence»—.

Y el atajo que un desarrollador nuevo probaría primero, `npm run setup`
(`= npm install && npm run seed`), termina en `❌ Falta DATABASE_URL` con exit 1
después de la instalación. El camino bueno está en `README.md:118-131` y no lo
menciona. (El camino bueno **sí funciona**: ver abajo.)

---

## Lo que revisé y está bien

- **DX, la mejora del día, medida y no supuesta.** Cloné el repo a un directorio
  limpio (`git clone --no-hardlinks`), `git status --porcelain` salió **vacío**, y
  `npx vitest run` dio `485 passed (485) · 6247 passed | 1 skipped · 157.02 s`,
  exit 0. **Dos pasos** (`npm install` → `npx vitest run`, `README.md:118-129`) y la
  suite está verde. Hasta hoy la respuesta era «ninguno, no arrancaba».
- **`src/lib/pruebas/arbol_sin_enlaces_ajenos.test.ts:48-68`** defiende la regla
  ancha (ningún enlace versionado a ruta **absoluta**) sin prohibir de más: los
  cinco enlaces relativos de `.claude/skills/` pasan y resuelven.
- **`src/lib/admin/salud.ts` completo.** `juzgarLatido` (`:105-113`) es puro y por
  eso probable; `registrarLatido` (`:73-82`) nunca lanza y lo dice; `puertaCron`
  (`:53-70`) distingue «sin secreto» (500 + alerta) de «no autorizado» (401 con
  `codigo: 'cron_401'` y **sin cuerpo**), que es exactamente la distinción que hacía
  falta. Y la tabla de cadencias no es una copia a ojo: `salud.test.ts:74-88` lee
  `vercel.json` y compara cron por cron, con el comentario de `:37-40` explicando
  qué se rompe si se desincroniza.
- **Los cinco crons llaman `registrarLatido` en TODAS sus salidas**, incluidas las
  malas: `escalar:207`, `runner:35,50`, `wa-pendientes/drenado:139,147`,
  `facturar:348,367,528,874`, `purgar:117,126,134`. Un `fallo` deja marca; un
  `saltado` por interruptor también, y no se confunde con estar muerto.
- **`alerta.ts` sigue siendo el mejor archivo del rubro.** El piso vive en Redis con
  `SET NX PX` atómico (`:71-76`), la marca se pone **antes** del envío (`:128-133`),
  el detalle pasa por `redactarTexto` antes de salir a un tercero (`:140`), y nunca
  lanza (`:159-162`). `DEPLOY.md` (tabla de variables) documenta que Upstash está
  **verificado presente en producción el 22-ago**, que es lo que hace que ese piso
  sea global de verdad.
- **Ninguna alerta puede colgar el camino del dinero.** Lo perseguí a fondo porque
  era la pregunta: `alertarOperador` se `await`ea dentro de `subirComprobante`
  (`almacen.ts` vía `reportarFallo`), o sea en la ruta caliente del intake de
  WhatsApp — pero los dos saltos a terceros están acotados:
  `AbortSignal.timeout(1200)` para Upstash (`alerta.ts:59,75`) y
  `AbortSignal.timeout(5_000)` para Resend (`correo/enviar.ts:42,137`), este último
  con el porqué escrito («un correo que no sale cuesta un aviso; una invocación
  colgada cuesta la liquidación»). Peor caso: 6.2 s acotados, nunca los 300 s del
  default de undici.
- **`ci-postgres.yml` hace bien lo que hace.** Migraciones **una por una** sobre base
  virgen con `ON_ERROR_STOP=1` y `exit 1` nombrando el archivo (`:126-137`) — un
  fallo de migración **sí** rompe ese job. Y el `${PIPESTATUS[0]}` de `:161` está
  puesto a propósito, con el comentario que explica que sin él un `{ …; } | tee`
  habría escondido el código de salida real. El problema no es este workflow: es
  que nada lo escucha.
- **`correr-verificaciones.mjs` distingue «el bloque probó y falló» de «el bloque
  reventó antes de probar»** (`:296-305`, por el `at RAISE` del CONTEXT de psql), y
  falla duro si un bloque **no lanza** (`:285-294`). Las dos decisiones son
  correctas y raras de ver; el hueco está solo en `sin_calificar`.
- **`migraciones_verificadas.test.ts:128-140`** sigue obligando a una decisión
  explícita por migración. Comprobé el rango nuevo: 0150–0167 (no existe 0156;
  el hueco del bloque 128 es eso, no una migración perdida) y **todas** aparecen en
  un título de `verificaciones.sql`. Ninguna exención fantasma.
- **`/api/health` declara lo que NO mide** (`route.ts:43-45`, la ausencia de corridas
  con trabajo) y devuelve **503** cuando la base no contesta (`:97`), que es lo que
  un monitor entiende sin leer el cuerpo.
- **El runbook declara sus huecos.** `DEPLOY.md:174` dice, con todas sus letras,
  «Última prueba de restauración: **nunca** (22-ago-2026)», y `:137` dice que la
  ventana de pérdida «hoy no la sabe nadie». Eso vale más que un runbook que lo
  omite — el hallazgo del respaldo es sobre la comprobación, no sobre la honestidad.
- **`ci.yml:49-61`** convierte la clasificación de supply chain en regla permanente
  (`npm audit --omit=dev --audit-level=high`: runtime rompe, tooling no), y
  `:84-90` recupera las dos pruebas de tiempo que `--coverage` se salta, con
  `pruebas_en_ci.test.ts` vigilando que no se vuelvan a perder.

---

## Lo que NO alcancé a revisar

- **Todo lo que vive en Settings de GitHub**: protección de `master`, el ajuste de
  título de squash (`PR_TITLE` vs `COMMIT_OR_PR_TITLE`) y la aprobación de workflows
  para contribuyentes externos. Esta corrida tiene **prohibida la red hacia fuera**,
  así que los tres siguen siendo el dato de la c3. Los tres modulan el tamaño de dos
  CRÍTICOS y un MEDIO.
- **La batería contra un Postgres real.** No hay psql ni base aquí. El CRÍTICO del
  runner es análisis estático del parser contra las cadenas de formato: reproduce
  exactamente los dos bloques-reporte que el propio runner declara, lo que me da
  confianza, pero **no es una corrida**. Alguien con Docker lo confirma en 30 s:
  `DATABASE_URL=… node scripts/ci/correr-verificaciones.mjs supabase/verificaciones.sql`
  y se cuenta cuántos ▲ salen.
- **Si `SENTRY_DSN` y `ALERTA_EMAIL` están de verdad puestas en Vercel.** Cuarta
  ronda seguida que se pide. Todo el aparato verificado arriba —y el ALTO del
  workflow que se queda verde con los crons muertos— se apoya en eso.
- **La retención real de los runtime logs de Vercel y si hay log drain.** Declarado
  pendiente en `DEPLOY.md` desde hace rondas. Es lo que decide si «quedó en el log»
  significa algo doce horas después, que es justo lo que el CRÍTICO del piloto de
  visión necesita.
- **`scripts/respaldo.sh`** (el de la base). Solo leí lo que `DEPLOY.md` dice de él;
  no abrí el archivo para comprobar que su «se comprueba que no venga vacío» no sea
  la misma tautología que encontré en el de Storage.
- **La causa del intermitente `engine_iva_medio_pago.test.ts:35`.** No se reprodujo
  hoy (una corrida completa, con la máquina ocupada). Sigue sin aislar el vecino que
  lo contamina; hace falta `--sequence.seed` fijo y `--pool=forks
  --no-file-parallelism` en corridas repetidas.
- **Si el «Redeploy» del panel de Vercel salta el `ignoreCommand`.** `CLAUDE.md` lo
  ofrece como la salida cuando se olvida la bandera; no pude comprobar que funcione
  sin consultar a Vercel.
- **Las cuotas reales de Upstash y Resend del proyecto.** El ALTO de `/api/health`
  describe el mecanismo de amplificación, que es cierto por lectura; cuántas
  peticiones hacen falta para agotar el cupo depende del plan contratado.
