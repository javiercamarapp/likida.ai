# Seguridad — auditoría 4

**Nota: 6/10** (antes 7). Razón del movimiento: **mirada más profunda sobre lo
que entró esta ronda, y deuda que cobró factura.** La superficie nueva de la
semana está, casi toda, bien construida: el Copiloto cruza tenants a propósito y
lo hace detrás de una puerta que se re-chequea en su propio archivo
(`api/admin/copiloto/route.ts:32-37`), la cola de aprobación re-gatea en la
página **y** en sus dos server actions (`admin/aprobaciones/page.tsx:25,38,61`),
las cuatro RPC de la 0112 y la de la 0114 nacen con `revoke … from public, anon,
authenticated` **y** `search_path` fijo, y el `search_path` de la 0113 sí cerró
lo que decía cerrar. Lo que baja la nota es que **abrí la capa 1 del aislamiento
nuevo y no falla cuando debería**: 13 de los 79 bloques de `verificaciones.sql`
—entre ellos los seis que prueban aislamiento entre flotas y el que vigila el
`search_path`— salen del runner como *SIN CALIFICAR*, y `SIN CALIFICAR` no
tumba el job. Y los tres ALTOS del pase 3 siguen los tres abiertos, ahora tras
118 commits.

**El fallback histórico `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_ANON_KEY` NO
EXISTE, y aquí está la línea:** `src/lib/supabase/admin.ts:12-13` lee
`process.env.SUPABASE_SERVICE_ROLE_KEY` y si falta **lanza**
(`if (!url || !key) throw new Error('Supabase service-role no configurado')`).
No hay `??`, no hay `||`, no hay segunda variable. `src/lib/env.ts:37` la
inventaria en el grupo `supabase` junto a la anon key, pero son entradas de una
lista de nombres, no una cadena de defaults. Barrí todo `src/` por
`SERVICE_ROLE|ANON_KEY`: siete apariciones, y las únicas dos que construyen un
cliente son `admin.ts:12` (service role, lanza) y `supabase/server.ts:11` (anon,
para la sesión del navegador). **Tres rondas citaron este hallazgo sin abrirlo;
queda descartado por escrito.**

**El riesgo mayor del rubro, hoy:** la puerta de CI que esta ronda construyó para
demostrar el aislamiento entre flotas *reporta* sus bloques de aislamiento en vez
de *calificarlos* — el job sale verde con `FINANZAS_RLS` sin comparar, que es
exactamente el bloque escrito para que un encargado de otra flota no vea precios
y saldos.

## Hallazgos

### [ALTO] 13 de los 79 bloques de `verificaciones.sql` no se califican, y `SIN CALIFICAR` no falla el job — entre ellos los seis que prueban aislamiento entre flotas

`scripts/ci/correr-verificaciones.mjs:227-233` (`esperados.length !== pares.length`
→ `tipo: 'sin_calificar'`) · `:353-357` (**solo** `fallas > 0 || noLanzaron > 0`
sale con código 1; `sinCalificar` imprime un aviso y sigue) ·
`.github/workflows/ci-postgres.yml:155-163` (el step lee `${PIPESTATUS[0]}`, o
sea el exit code de este script) · los bloques afectados:
`supabase/verificaciones.sql:1123`, `:1938`, `:2162`, `:2666`, `:2872`, `:3866`
(los de seguridad) más `:160`, `:1549`, `:1666`, `:1875`, `:2332`, `:2605`,
`:4025`.

**Escenario, con valores.** El runner parte cada mensaje de `raise exception` por
la cadena `(esperado`, cuenta los tokens `clave=` del lado izquierdo y los
compara contra los valores del derecho partidos por `/`. El bloque 29 termina en:

```
raise exception E'FINANZAS_RLS  clientes=%  tarifas=%  facturas=%  pagos=%
  cotizaciones=%  factura_viaje=%   (esperado 0 en las seis — cualquier otra
  cosa le abre precios y saldos al encargado)', n_cli, n_tar, n_fac, n_pag, n_cot, n_fv;
```
(`verificaciones.sql:1123`)

Seis claves a la izquierda, **un** token a la derecha (`0 en las seis — …` no
tiene ni una `/`). `calificar()` cae en `esperados.length (1) !== pares.length
(6)` y devuelve `sin_calificar`. Simulé el parser sobre los 83 bloques de los dos
archivos que el workflow le pasa: `capa1_auditoria_estatica.sql` 4/4
calificables; `verificaciones.sql` **64 calificables, 13 sin calificar, 2
reporte**. Si mañana una política de `cliente` o `tarifa` se afloja y `n_cli`
pasa de `0` a `3`, el bloque imprime `clientes=3`, el runner lo marca ▲ SIN
CALIFICAR, la suma final dice «Todo lo calificable pasó» y **el job sale en
verde**. Lo mismo con el bloque 49 (`:2666`), cuyo mensaje no tiene **ni un solo**
`clave=` a la izquierda (`49 CON pg_temp: % SIN pg_temp: % (esperado —)`): 0
claves vs 1 esperado → sin calificar. Ese es, textualmente, el bloque que vigila
el `search_path` de `is_superadmin`, `get_user_tenant_ids`, `is_operador` y
`get_user_operador_id` — las cuatro funciones que resuelven TODA política RLS del
esquema. Igual `:1938` (`rls=%  sin-politicas=%`), `:2162` (`AISLADO=%  anon=%
auth=%`), `:2872` (`anon=%  service_role=%`) y `:3866` (`anon=%/%`).

**Consecuencia.** El encabezado del workflow dice que la primera corrida
automática «encontró y arregló 4 bloques que llevaban semanas rotos» — la señal
que hace creíble a la puerta. Pero la puerta califica el 81% de sus bloques y
deja pasar el 16%, y la selección no es aleatoria: los bloques con más medidas
por línea son los de aislamiento y permisos, que son justo los que más `clave=`
acumulan y por eso más se desalinean del `(esperado …)`. Para Javier eso es peor
que no tener el job: un check verde sobre `verificaciones.sql` se lee como «el
aislamiento entre flotas está probado hoy», y de esa afirmación seis bloques no
participan.

**Causa raíz probable.** El oráculo se dedujo del formato que 79 bloques ya
traían escrito a mano para pegarse en el SQL editor, donde el lector era un
humano; el parser trata su propia incapacidad de leer un bloque como un caso
neutro («fallar la build por un bloque que el parser no entendió sería peor»,
`:40-41`) en vez de como un bloque no probado.

---

### [MEDIO] El `ALLOWLIST` de la capa 2 exime el ARCHIVO ENTERO aunque su propio comentario declara granularidad `archivo:tabla`

`supabase/pruebas-aislamiento/consultas_admin_filtran_tenant.test.ts:221-223`
(«Cada entrada es `archivo:tabla` o `archivo:tabla:snippet` cuando una tabla se
toca más de una vez en el mismo archivo con destinos distintos») ×
**`:270`** (`if (ALLOWLIST[archivo]) continue;`) · las 10 claves del objeto
(`:225-240`) son rutas desnudas, ninguna trae `:tabla`.

**Escenario, con valores.** `src/lib/likida/conv.ts` está exento con una razón
que solo cubre dos identificadores: «cada `convId`/`viajeId` que llega a
`saveConversation`/`intakePendientes` sale de una resolución YA filtrada por
tenant» (`:236`). Pero la exención es por archivo, así que cubre las **50** tablas
con `tenant_id` que el propio test descubre de las migraciones. Enumeré lo que hoy
toca cada archivo exento: `conv.ts` → `operador`, `viaje`, `wa_conversacion`;
`vendedores.ts` → `prospecto`, `app_user`; `suscripcion.ts` → `suscripcion`,
`factura_saas`, `viaje`, `operador`. Mañana alguien agrega al pipeline de
WhatsApp, dentro de `conv.ts`, un
`supabaseAdmin().from('gasto').select('monto, concepto').eq('viaje_id', viajeId)`
—natural: el `viajeId` ya está a la mano y `gasto` tiene FK a `viaje`—. Sin
`.eq('tenant_id', …)`, con `service_role` que salta RLS, un `viajeId` de otra
flota devuelve sus gastos. `npx vitest run` **pasa en verde**: la línea 270 sale
antes de mirar la tabla. Lo confirmé corriendo el test hoy: 3 tests, 3 passed.

**Consecuencia.** La prueba que el propio archivo declara «la PRIMERA red, la que
separa a una flota de otra en el camino que de verdad usa el producto»
(`:14-18`) tiene diez agujeros del tamaño de un archivo, y su encabezado enumera
sus límites con honestidad —tres párrafos de «lo que no cubre»— sin nombrar el
que de verdad tiene.

**Causa raíz probable.** La granularidad se diseñó (está escrita) y la búsqueda se
implementó con la clave más simple; nada compara el comentario con el `Record`.

---

### [MEDIO] La capa 1 «auto-descubriente» no mira `search_path`, que es la ÚNICA regresión que este repo ha tenido dos veces

`supabase/pruebas-aislamiento/capa1_auditoria_estatica.sql` — cuatro bloques
(`:57` vistas sin `security_invoker`, `:88` `SECURITY DEFINER` abiertas a `anon`,
`:120` tablas con `tenant_id` sin política que lo mencione, `:153` las cinco
deniega-todo nombradas). **Ninguno lee `pg_proc.proconfig`.** ·
`supabase/verificaciones.sql:2640-2668` (el único guardia que existe) usa una
lista FIJA de siete nombres, y además sale SIN CALIFICAR por el ALTO de arriba ·
la regresión: `supabase/migrations/0112_config_llave_agentes.sql:31-34`
(`CREATE OR REPLACE FUNCTION public.config_tenant_valida … LANGUAGE plpgsql
IMMUTABLE` — sin `SET search_path`).

**Escenario, con valores.** `0113_search_path_regresado.sql:5-11` culpa a la 0085
de haber perdido el `proconfig` con un `CREATE OR REPLACE`. Es cierto, y también
lo es que **la 0112 lo volvió a hacer en la misma tanda**: por orden alfabético
`0112_agregados_rpc.sql` → `0112_config_llave_agentes.sql` → `0113`, así que la
última redefinición sin `search_path` es de esta ronda y la 0113 la tapa por
accidente de orden, no porque alguien la viera. La cuenta completa de
redefiniciones de `config_tenant_valida` posteriores al `alter` de la 0035 es
**cuatro**: 0082, 0083, 0085 y 0112. Lo que detectó la de la 0085 no fue CI: fue
«el advisor en vivo de Supabase (14-ago-2026)» (`0113:10-11`). Y la defensa que
la 0113 deja para la próxima vez es, literalmente, un comentario: «este
comentario es la señal para no repetir el olvido» (`:24`). El próximo
`CREATE OR REPLACE` sobre cualquiera de las 15 funciones que hoy dependen de un
`alter function … set search_path` externo (0035 diez, 0074 cinco) vuelve a
abrirlo sin que nada rojo se encienda.

**Consecuencia.** La ronda que agregó una capa cuyo argumento de venta es «aquí
no hace falta acordarse — se lee del catálogo en cada corrida»
(`capa1_auditoria_estatica.sql:12-13`) dejó fuera precisamente la clase de
regresión que ya ocurrió dos veces y que solo se ha detectado desde fuera del
repo. Un `select 1 from pg_proc where prosecdef and proconfig is null` cuesta lo
mismo que los cuatro bloques que sí escribió.

**Causa raíz probable.** Los tres huecos que la capa 1 fue a llenar salieron del
incidente de `factura_saldo` (0054, una vista); el incidente de `search_path` es
de otra ronda y de otro autor, y nadie cruzó las dos listas.

---

### [MEDIO] `executeTool` sigue sin allowlist, y desde esta semana el REGISTRY contiene once tools que cruzan TODOS los tenants

`src/lib/llm/tool-executor.ts:96-99` (`const tool = REGISTRY.get(name);` — ningún
filtro por la lista con la que se armó el prompt) · `:172` (`makeExecutor` delega
en `executeTool` sin más) · las tools nuevas:
`src/lib/agents/copiloto-tools.ts:31-35` (`TOOLS_COPILOTO_LECTURA`, once) y su
propia defensa escrita: `:8-9` («el registro de tools es global, pero el analista
del cliente lista sus tools por nombre … un tenant no puede alcanzarlas») ·
el allowlist del cliente: `src/lib/agents/analista.ts:39,320`.

**Escenario, con valores.** Hasta esta semana el `REGISTRY` solo tenía tools
tenant-scoped: ejecutar una fuera del allowlist devolvía datos de la propia
flota. Hoy contiene `metrica_negocio`, que devuelve
`porFlota: [{nombre, plan, viajes, costoIaUsd}]` de las 20 primeras flotas
(`copiloto-tools.ts:72-74`); `bandeja`, que devuelve hasta 12 items de ARCO,
tickets y corridas en fallo **con el nombre de la flota de cada uno** (`:111-113`);
`pipeline_ventas`, con el embudo comercial completo de Likida (`:227-247`). Un
`contador` de la flota A abre `/dashboard` → «Preguntar a la IA» y escribe un
mensaje construido para que el modelo emita un `tool_call` con
`name: "metrica_negocio"` (una tool que no está en `TOOLS_LECTURA`, pero el
`content` del turno es texto que él controla). `executeTool` hace
`REGISTRY.get('metrica_negocio')`, la encuentra si el módulo está cargado en ese
proceso, la ejecuta y su resultado entra al `content` del mensaje `role: 'tool'`
que el modelo lee y parafrasea al contador.

**Me lo refuto yo, y lo digo:** verifiqué el grafo de imports. `copiloto-tools.ts`
lo importa **solo** `copiloto.ts:27`, y `copiloto.ts` solo lo importa
`api/admin/copiloto/route.ts`; el chat del cliente llega por
`api/dashboard/chat/route.ts:24` → `analista.ts:28` → `chat-tools.ts`. En Vercel
cada route handler es su propio bundle, así que en la función del chat el
`REGISTRY` no contiene esas once tools y el ataque **no corre hoy en producción**.
Lo que cambió respecto al pase 3, donde esto era BAJO, es el premio: la única
barrera es una frontera de empaquetado —que desaparece en `next start`, en
cualquier consolidación de rutas, y el día que una tool de `/admin` se registre
desde un módulo compartido— y detrás de ella ya no hay datos de la propia flota
sino el estado de negocio de todas.

**Causa raíz probable.** El `REGISTRY` es global por diseño (un solo
`registerTool`) y el allowlist se aplica donde se arma el prompt
(`toolSchemas(names)`), no donde se ejecuta; nadie volvió a mirar esa asimetría
cuando `lib/admin/*` —la zona cross-tenant declarada por `CLAUDE.md`— pasó a ser
importable desde `src/lib/agents/`.

---

### [MEDIO] El rol de superadmin de 20 de las 36 páginas de `/admin` cuelga de una sola línea; el matcher del proxy no pregunta rol

`src/app/admin/layout.tsx:15` (`const { nombre, avatarUrl } = await
requireSuperadmin();` — el único chequeo de ROL) · `src/proxy.ts:109,118`
(`RUTAS_CON_SESION` + `startsWith`; el comentario `:115-117` lo dice él mismo:
«la distinción de ROL vive en la página, no aquí — esta capa solo pregunta ¿hay
sesión?») · el estándar que el propio repo enuncia:
`src/app/admin/copiloto/page.tsx:8,16` («La puerta es doble a propósito: aquí
`requireSuperadmin` …») · las que no lo cumplen, contadas hoy: 20 de 36, entre
ellas `admin/escalaciones/page.tsx` (la bandeja cross-tenant), `admin/cobranza`,
`admin/conversaciones`, `admin/soporte`, `admin/equipo`, `admin/salud-sistema`.

**Escenario, con valores.** Un `contador` de la flota A, con sesión viva, pide
`GET /admin/escalaciones`. El middleware entra por `startsWith('/admin')`,
`supabase.auth.getUser()` devuelve usuario, no hay redirect: **la primera capa lo
deja pasar**, porque nunca miró `rol`. La segunda y última es el `await
requireSuperadmin()` del layout, que hoy sí lo rebota. Cero capas si esa línea se
edita, se envuelve en un `try`, o alguien agrega un `route.ts` bajo `src/app/admin/**`
(hoy no hay ninguno — lo verifiqué). Lo que sale por esa pantalla es la bandeja
completa: solicitudes ARCO con nombre de flota, tickets, corridas en fallo y
liquidaciones por revisar de **todos** los tenants (`lib/admin/escalaciones.ts`
vía `getBandejaEscalaciones`).

**Consecuencia.** No hay fuga hoy — lo escribo así a propósito. Lo que no hay es
la segunda capa que el propio repo promete por escrito en dos sitios
(`proxy.ts:14-16`, `copiloto/page.tsx:8`) y que sí aplicó en las 16 páginas
restantes y en los 20 server actions de `/admin` que el pase 3 barrió.

**Causa raíz probable.** El re-gateo se enunció como regla para los server
actions (endpoints POST propios) y para las rutas `/api` (fuera del layout);
para las páginas se dio por suficiente el layout, que es correcto en Next pero
es un solo punto.

---

### [MEDIO] Dependabot tiene prohibido proponer cualquier major, y el único aviso vivo de `npm audit` solo se corrige con un major

`.github/dependabot.yml` (`ignore: - dependency-name: '*'` con
`update-types: ['version-update:semver-major']`) ·
`.github/workflows/dependency-review.yml` (`fail-on-severity: moderate`, sobre
`actions/dependency-review-action@v4`, que compara **el diff del PR**, no el árbol
instalado) · `npm audit` de hoy: 6 avisos (2 críticos, 1 alto, 3 moderados), todo
el subárbol `esbuild ≤0.24.2 → vite → @vitest/mocker → vitest ≤3.2.5 →
@vitest/coverage-v8`, y su propio texto de salida: *«Will install vitest@4.1.10,
which is a breaking change»* contra el `"vitest": "^2.1.0"` de `package.json:56`.

**Escenario, con valores.** Las condiciones `ignore` de `dependabot.yml` aplican
también a las *security updates*, no solo a las de versión. Con
`dependency-name: '*'` + `semver-major`, el único arreglo que existe para estos
seis avisos (subir vitest de 2 a 4) **nunca genera un PR**. `dependency-review`
tampoco lo ve: solo inspecciona dependencias que el PR agrega o cambia, y estas
llevan meses en el lockfile. Resultado: tres mecanismos de cadena de suministro
nuevos esta semana (dependabot, CodeQL, dependency-review) y los seis avisos
vigentes no caen bajo ninguno.

**Consecuencia.** Hoy no hay daño —los seis son del árbol de desarrollo, ver la
tabla de más abajo— pero la regla es ciega por tipo de arreglo, no por
severidad: el día que un aviso con camino de producción solo se corrija con un
major (Next, sharp, openai y playwright-core están todos a un major de distancia
en cualquier momento), la alerta llega por correo de GitHub Security y no por un
PR, que es el canal que este repo acaba de declarar como el suyo.

**Causa raíz probable.** El `ignore` de majors se puso para que dependabot no
inundara de PRs de framework; se aplicó con `'*'` sin excluir el camino de
seguridad, que es un `ignore` distinto al de rutina.

## Reincidentes del pase 3 — verificados uno por uno contra el árbol de hoy

Los tres ALTOS y los seis MEDIOS **siguen abiertos**, con la línea de hoy. No los
vuelvo a razonar: el escenario de `docs/auditoria-3/seguridad.md` sigue siendo
palabra por palabra el mismo.

- **[ALTO] `resolverTenantEfectivo` ignora el `error` del lookup de `?tenant=`.**
  `src/lib/auth/tenant-efectivo.ts:190` sigue diciendo
  `const { data: t } = await supabaseAdmin().from('tenant')…maybeSingle();`. La
  línea **199** de ese mismo archivo, catorce líneas después, sí destructura
  `{ data, error }` para la comprobación de existencia — el arreglo está escrito
  en el archivo y a la función que usan las 34 páginas no le llegó.
- **[ALTO] El buzón de correo topa el TAMAÑO de cada adjunto y no la CANTIDAD.**
  `src/app/api/correo/entrante/route.ts:141`
  (`const adjuntos = (d.attachments ?? []).filter(…)`, sin `.slice()`), y el
  archivo sigue sin declarar `maxDuration`.
- **[ALTO] `/api/dashboard/ingesta` gasta visión sin límite de tasa ni fila en
  `llm_costo`.** `src/app/api/dashboard/ingesta/route.ts:28-32` (la puerta es
  `getSessionTenant` + `puedeVerArea('dinero')` y nada más); `grep -rn "rateLimit("
  src/` da 15 llamadas hoy y ninguna es ésta; `registrarCosto` no aparece en el
  archivo.
- **[MEDIO] El server action de ARCO comprueba sesión, no rol.**
  `src/app/dashboard/arco/page.tsx:34,37` — dentro del `'use server'` solo hay
  `requireSessionTenant(RUTA)`; `puedeVerRuta` no aparece en el archivo.
- **[MEDIO] El techo de 60/min por IP corta a quien ya se identificó con llave.**
  `src/app/api/v1/_comun.ts:190` sigue corriendo antes e independientemente del
  camino de la llave; `:218` y `:251` son el techo por flota, inalcanzable.
- **[MEDIO] El cofre deriva la llave AES-256 con un solo SHA-256.**
  `src/lib/likida/conectores/cofre.ts:56` (`createHash('sha256').update(secreto,
  'utf8').digest()`); sin `scrypt` ni `pbkdf2` en el archivo.
- **[MEDIO] `env.ts` no inventaria ninguno de los seis secretos nuevos.**
  `src/lib/env.ts:29-38` sigue con los tres grupos `llm`/`whatsapp`/`supabase`.
  Esta ronda le agregó dos consumidores más sin inventariar:
  `CRON_SECRET` en `api/cron/wa-pendientes/route.ts:40` y `RESEND_API_KEY` en el
  envío real de la cola de aprobación.
- **[MEDIO] `/api/dashboard/archivo` parsea el cuerpo antes de mirar el tope y no
  tiene `rateLimit`.** `route.ts:32` (`await req.json()`) contra `:41` (el tope de
  16 MB, después).
- **[MEDIO] `abrir()` tira el `llaveId`.** `src/app/api/v1/_comun.ts:228` sin
  cambios.
- **Los siete BAJOS siguen los siete.** `/cuenta` fuera de `proxy.ts:109`;
  `chat/tenant.ts:23-27` sin mirar `error`; el tope diario del chat check-then-act;
  la verificación 22 contra la 0046; D6 sin baja de usuarios; llaves de API sin
  `expira_en`.

## Lo que revisé y está bien

**Ninguna ruta llega a datos de un tenant sin autenticar.** Enumeré los 27
`route.ts` de `src/app/api`: 26 traen puerta propia (sesión, `CRON_SECRET`,
firma HMAC, o `abrir()` de llave de API) y la única sin puerta es
`api/health/route.ts:35-55`, que devuelve `{ok, db, sentry, version, hora}` y ni
un dato de negocio — con la razón escrita (`:28-32`). No hay `route.ts` bajo
`src/app/admin/**` ni bajo `src/app/dashboard/**` que pudiera saltarse su layout.

**El Copiloto (superficie nueva, la revisé entera).** La puerta está en el propio
archivo porque `/api` no pasa por el layout de `/admin`
(`api/admin/copiloto/route.ts:32-37`): sin sesión 401, otro rol 403, ninguna de
las dos dice qué hay. `validarMensajes` acota a 24 turnos × 2,000 chars y exige
que el último sea del usuario. El camino de ejecución **rechaza sin
`confirmado: true` en el SERVIDOR** (`:66-70`) y el `userId` sale de la sesión,
nunca del cuerpo (`:76`). `ejecutarAccionCopiloto` valida contra el catálogo
(`copiloto-acciones.ts:105`), rechaza lo no implementado (`:107`) y para
`apagar_agente` valida el nombre contra `INTERRUPTORES` (`:112-114`) antes de
llegar a `apagar()`, que exige motivo y anota en `bitacora_auditoria`
(`interruptores.ts:99-110`). El catálogo declara ocho acciones como
`implementada: false` en vez de fingirlas. `clasificarBandeja`
(`admin/guardia.ts:89-109`) es pura y determinista, no toma decisiones de
autorización, y cuenta cada fuente ciega como su propio S2 en vez de esconderla
— cumple la regla dura de CLAUDE.md sobre no rellenar con ceros.

**La cola de aprobación (0117) y `/admin/aprobaciones`.** Página gateada
(`page.tsx:25`) **y** los dos server actions re-gateados dentro
(`:38`, `:61`) con `requireSuperadmin`, que es el estándar que este reporte le
reclama a las 20 páginas de arriba. La tabla nace deniega-todo
(`0117:79`, RLS activa, cero políticas), y la 0120 le agrega el CHECK
`cola_resolucion_con_actor` que hace imposible por esquema una pieza resuelta sin
actor. `cola.ts` cruza tenants a propósito y su único llamador de interfaz es esa
pantalla (verificado por grep: los otros dos son `forma-pieza.tsx`, que solo
importa el tipo, y el cron con `CRON_SECRET`).

**Las migraciones 0112→0120, barridas.** Las cinco funciones nuevas o
redefinidas de la tanda traen las dos mitades: `sumar_combustible_ejercicio`
(0112:166-167), `serie_comparativa_tenant` (0112:272-273),
`kpis_liquidacion_tenant` (0112:346-347), `acreditables_liquidacion_tenant`
(0112:385-386) y `registrar_descarga_liquidacion` (0114:91-92) — todas
`revoke all … from public, anon, authenticated` **más** `grant execute … to
service_role`, todas `SECURITY INVOKER` con la razón escrita de por qué INVOKER
es más seguro que DEFINER aquí (0112:67-82), todas con `set search_path` en el
propio `CREATE`, y todas con `p_tenant` **sin default** para que olvidarlo sea un
404 de PostgREST y no la base de todas las flotas. `registrar_descarga_liquidacion`
mete el `tenant_id = p_tenant` **dentro** de la función en vez de confiarlo al
llamador (0114:64-66,86), y su único consumidor lo pasa desde la sesión
(`api/export/pdf/[id]/route.ts:132`). Las cuatro tablas nuevas —`agente_definicion`
(0116:66), `cola_aprobacion` (0117:79), `prospecto_contacto` (0118:41),
`wa_evento_pendiente` (0119:42)— tienen `enable row level security` y **cero
políticas** = deniega-todo. La 0113 hace lo que dice: reinstala el `proconfig` de
`config_tenant_valida` sin redefinir el cuerpo, sin cambiar permisos y sin dejar
dos firmas vivas.

**Los `grant` implícitos de Supabase están tratados.** El andamio de CI reproduce
a mano el `ALTER DEFAULT PRIVILEGES` con el que Supabase concede
SELECT/INSERT/UPDATE/DELETE a `anon`/`authenticated` en toda tabla nueva de
`public` (`andamio_ci.sql`, sección 2), con el argumento correcto y escrito: sin
ese bloque «la batería completa pasaría en verde sin que RLS hiciera ni un solo
filtro». Es la pieza que hace que la capa 1 signifique algo, y está bien
razonada. El bloque B de `capa1_auditoria_estatica.sql:88-116` pregunta
`has_function_privilege('anon', p.oid, 'EXECUTE')` sobre `pg_proc` —no sobre una
lista— y auto-exceptúa las ayudantes de RLS buscándolas dentro de `pg_policies`,
que es la excepción correcta por el motivo correcto.

**El resolvedor de sesión falla cerrado.** `src/lib/auth/session.ts:96` — sin fila
legible de `app_user` el rol es `SIN_ROL`, un marcador que ninguna puerta
reconoce; el `?? 'flota_admin'` histórico ya no existe. El `error` de la lectura
sí se mira (`:77-90`) y gasta el reintento, que es exactamente lo que le falta a
`tenant-efectivo.ts:190`.

**Redacción de PAN y CLABE.** `src/lib/logger.ts:66-67` fija CLABE en 18 dígitos
exactos y PAN en 16 exactos, en **una sola pasada** de regex alternado
(`:74`) para que lo ya sustituido no se vuelva a mirar, y con el razonamiento
correcto de por qué no se usa un rango 13-19 (un epoch en ms tiene 13 dígitos).
La asimetría UUID-se-huella / RFC-y-teléfono-se-borran está justificada por
entropía, no por gusto (`:32-45`).

**CSRF: cerrado por SameSite, no por casualidad.** `/api/admin/copiloto` y
`/api/admin/palette` son POST con cuerpo JSON autenticados por cookie, y
`Request.json()` no valida `Content-Type` — el molde clásico de JSON-CSRF por
formulario `text/plain`. No aplica: `@supabase/ssr` fija `sameSite: "lax"` por
defecto (`node_modules/@supabase/ssr/dist/main/utils/constants.js:6`) y el repo no
lo sobreescribe en ningún lado (grep de `sameSite`/`cookieOptions` en `src/`: cero
resultados), así que la cookie no viaja en un POST cross-site. Los server actions
los cubre además el chequeo Origin/Host propio de Next.

**URLs firmadas: dos, y las dos a 60 segundos.** `api/export/pdf/[id]/route.ts:101`
y `processor.ts:2372`, sobre buckets privados. `intake/almacen.ts:97`
(`ligaComprobante`, default 3600 s) **sigue sin ningún llamador de producción** —
las únicas nueve apariciones son mocks de pruebas y un test que verifica que la
página *no* la importe (`dashboard/foto_no_expuesta.test.ts:29`). Sigue siendo
código muerto, no una URL viva. La ronda no agregó firmadores nuevos.

**El runner de CI no esconde su código de salida.** `ci-postgres.yml:148-163`
documenta y evita la trampa de `{ echo; node; echo } | tee`, leyendo
`${PIPESTATUS[0]}`. Bien visto; es el bug que hace que un job de seguridad salga
verde para siempre. (Que el exit code llegue no arregla que 13 bloques no
califiquen — son dos cosas distintas.)

**CodeQL y dependency-review, permisos.** `codeql.yml` corre con
`permissions: contents: read` a nivel workflow y solo el job de análisis eleva a
`security-events: write`; `dependency-review.yml` con `contents: read`. Ninguno
usa `pull_request_target`, que es la forma en que estos dos workflows se
convierten en ejecución de código de un fork.

### CVEs — los 6 de `npm audit`, descartados uno por uno

`npm audit` reporta **6** (2 críticas, 1 alta, 3 moderadas) — uno menos que el
pase 3, y **`xlsx` ya no aparece en la lista**. Todos cuelgan del mismo subárbol
de `devDependencies`. **Ninguno tiene camino real de explotación en esta app.**

| Paquete | Aviso | Veredicto individual |
|---|---|---|
| `vitest` ≤3.2.5 (*critical*) | GHSA-5xrq-8626-4rwp, «Vitest UI server … arbitrary file read and execute» | **Descartado.** Es `devDependencies` (`package.json:56`), el vector exige el servidor de UI escuchando y los scripts del repo corren `vitest run` — una pasada, sin `--ui`, sin `--api`. No entra a ningún bundle de producción (`next build --webpack` no lo resuelve). Riesgo real acotado a la laptop de quien corra `vitest --ui` a mano. |
| `@vitest/coverage-v8` ≤3.2.5 (*critical*) | vía `vitest` | **Descartado.** No tiene aviso propio: hereda el de arriba, y solo se carga con `--coverage`, en desarrollo. |
| `vite` ≤6.4.2 (*high*) | vía `esbuild` | **Descartado.** El aviso que arrastra es el del dev-server de `esbuild` (abajo). Producción no ejecuta `vite`: el build de Next de este repo es webpack, y `vite` solo lo levanta el runner de pruebas. |
| `@vitest/mocker` (*moderate*) | vía `vite` | **Descartado.** Mismo árbol de desarrollo; el vector es el dev-server de Vite, que producción no ejecuta. |
| `vite-node` ≤2.2.0-beta.2 (*moderate*) | vía `vite` | **Descartado.** Idem: solo lo usa el runner de pruebas para transformar módulos. |
| `esbuild` ≤0.24.2 (*moderate*) | GHSA-67mh-4wv8-2f99 («any website can send requests to the development server and read the response») | **Descartado.** El aviso dice literalmente *development server*. Producción no levanta esbuild como servidor; el bundler de Next aquí es webpack. |

**Nota de entorno, no del repo.** `package.json:40` sigue pidiendo `xlsx` desde
`https://cdn.sheetjs.com/xlsx-0.20.3/…` (`git diff` del árbol: **limpio**), pero
`node_modules/xlsx/package.json` tiene `0.18.5`, instalado del registry porque la
política de red de este contenedor deniega `cdn.sheetjs.com`. Cualquier aviso
sobre `xlsx` en este árbol sería artefacto de esa desviación — esta vez `npm
audit` no levantó ninguno, así que ni siquiera hay que descartarlo. Lo que se
despliega es 0.20.3, donde GHSA-4r6h-8v6p-xvw6 (prototype pollution, corregida en
0.19.3) y GHSA-5pgg-2g8v-p4x9 (ReDoS, corregida en 0.20.2) ya no aplican.

**Evaluado aparte, sin que `npm audit` lo levantara.** `sharp` sigue en `^0.35.3`
con el bloque `overrides` que fuerza la copia anidada de Next
(`package.json:45-47`, con la razón escrita) — el arreglo del pase 3 sigue en pie
y no se deshizo en 37 commits. `fast-xml-parser` 5.10.1 sobre el camino de
`api/correo/entrante` → `parseCfdiXml` sigue sin ser hallazgo por lo mismo que en
los dos pases anteriores (límites duros de expansión de entidades + adjunto topado
a 4 MB antes del parser). **No es hallazgo.**

## Lo que NO alcancé a revisar

- **No ejecuté nada contra Postgres.** Todo lo de RLS, `grant`, `search_path` y
  `SECURITY DEFINER` sale de leer las 120 migraciones y de **simular** el runner
  de CI en JavaScript sobre los literales de `raise exception`. El ALTO de los 13
  bloques sin calificar está razonado sobre las plantillas de mensaje: si alguna
  sustitución `%` real introdujera un `=` inesperado, el conteo de claves de ese
  bloque cambiaría. Comprobé a mano los dos que sostienen el hallazgo
  (`FINANZAS_RLS` devuelve seis enteros, el bloque 49 devuelve tres listas de
  nombres): ninguno puede traer `=` en sus valores. Correr el job de verdad —o
  `node scripts/ci/correr-verificaciones.mjs` con un Postgres— es el experimento
  más barato que queda y contesta el hallazgo entero en un minuto.
- **`clientIp` y la falsificación de `x-forwarded-for`.** `ratelimit.ts:277` sigue
  tomando el extremo **izquierdo**, que es la posición que el cliente controla si
  el borde *antepone* en vez de sobrescribir. Tampoco pude verificar cuál de las
  dos hace Vercel desde este entorno, así que —igual que el pase 3— **no lo
  reporto como hallazgo**. Sigue siendo un `curl` con
  `X-Forwarded-For: 9.9.9.9` contra `/api/health`.
- **No reproduje el POST del server action de ARCO** ni un `tool_call` con nombre
  fuera del allowlist contra el chat. Los dos están razonados sobre el modelo de
  amenaza que el propio repo enuncia, no ejecutados.
- **`httpOnly: false` en la cookie de sesión.** Es el default de `@supabase/ssr`
  y el repo no lo cambia; con `script-src 'unsafe-inline'` en el CSP
  (`proxy.ts:68`, deuda ya documentada), un XSS leería el token completo en vez
  de solo poder hacer peticiones same-origin. No lo reporto porque no encontré un
  XSS con el que escribir el escenario, y sin él es una hipótesis.
- **`processor.ts` (2,300+ líneas) y `cron/facturar` (610).** Miré la firma del
  PDF (~2320-2375) y los gates de `CRON_SECRET`/QStash; la máquina de estados del
  cuadre y el manejo de credenciales de portal, solo por `grep`. Sigue cierta la
  nota heredada de `facturar/route.ts:341` (Host-header desde
  `req.headers.get('host')` cuando falta `NEXT_PUBLIC_APP_URL`, hoy inalcanzable
  porque solo llega quien trae el bearer).
- **Supabase Auth como servicio.** Expiración del magic link, reuso de refresh
  token, MFA y la configuración de Site URL / Redirect URLs viven en el panel de
  Supabase, no en el repo.
