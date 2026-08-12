# Seguridad — auditoría 17 · pase 5

**Nota: 5/10** (antes 6). Razón del movimiento: **mirada más profunda** ·
**deuda que cobró factura**. No bajó porque algo se rompiera: el único código
que cambió (`58c44f9`) es correcto y no abrió nada. Bajó por dos cosas que se
suman. Una, los tres ALTO llevan **cinco pases** abiertos y hoy los verifiqué
byte a byte contra el SQL y contra `node_modules`: siguen los tres, palabra por
palabra, sin una migración ni un `package-lock` que los toque. Dos, al recorrer
la frontera `proxy.ts ↔ requireSessionTenant` que el brief señaló encontré algo
que los cuatro pases anteriores no habían nombrado: **las nueve páginas vivas de
`/dashboard` leen con `supabaseAdmin()`, que salta RLS**, así que el aislamiento
entre flotas del panel es UNA capa —el `.eq('tenant_id', …)` de TypeScript— y la
pantalla `/dashboard/usuarios` le afirma al contralor, por escrito, que hay dos.
Verifiqué las ~40 consultas del panel y ninguna olvida el filtro hoy; el
problema es que si una lo olvidara mañana no hay nada debajo que la detenga, y
el cliente ya leyó que sí lo hay.

**El riesgo mayor del rubro, hoy — el mismo del pase 2, 3 y 4:** el jefe de
tráfico (`encargado`) y el contador tienen, por RLS, lectura **y escritura**
completas sobre las 19 tablas de negocio de su flota —`gasto`, `liquidacion`,
`operador`, `wa_conversacion` incluidas—, y la separación que el producto vende
("el encargado despacha, no factura") vive únicamente en TypeScript.

---

## Verificación del arreglo del pase 4 (`58c44f9`)

**Veredicto: el arreglo es correcto y no abrió puerta a nadie, pero NO es una
capa de seguridad. Es higiene de ruteo.** La capa real de tenant sigue siendo la
que ya estaba, y sigue siendo una sola.

Lo miré con las cuatro preguntas del brief.

**1. ¿La guarda es capa de seguridad o cosmética?** Cosmética en el sentido
estricto: convierte una pantalla de error en un 404. `esIdDeLiquidacion`
(`src/app/dashboard/[id]/id.ts:24-28`) solo comprueba **forma**, no pertenencia.
La comprobé contra evasión por si el `$` de JavaScript se comportaba como el de
Perl —no lo hace, sin `m` ancla al fin de la entrada—: `"<uuid>\n"`,
`"\n<uuid>"`, `"<uuid> "` y `"<uuid>%00"` dan **false**; mayúsculas dan true por
el `/i`, que es correcto (Postgres normaliza el uuid). No hay bypass de forma.

**2. Un segmento que SÍ es uuid válido pero de OTRO tenant.** Recorrido
completo, con valores. Mario es `contador` del tenant `1111…1111` y teclea
`/dashboard/9c3f…de41`, una liquidación real de Transportes del Bajío
(`2222…2222`):

1. `[id]/page.tsx:41` — `requireSessionTenant` le da su sesión.
2. `:54` — `puedeVerArea('contador','dinero')` → true, pasa.
3. `:62` — `esIdDeLiquidacion` → **true**. La guarda nueva no lo detiene, y no
   debe: no sabe de tenants.
4. `:71` — `rolReal !== 'superadmin'`, así que `?tenant=` se ignora y `tenantId`
   sigue siendo `1111…1111`.
5. `:93` → `analytics.ts:1152-1159` — `.eq('id', …)` **y** `.eq('tenant_id',
   '1111…1111')`. Cero filas → `maybeSingle` devuelve `data: null` sin error →
   `exigir()` no lanza → `return null`.
6. `:94` — `notFound()`.

**El filtro de tenant sigue siendo la capa real, y está puesta.** La guarda de
uuid no la debilitó ni la sustituyó: se ejecuta antes y solo descarta lo que ni
siquiera podía ser un id.

**3. ¿La guarda le abrió puerta a un enumerador?** No, la estrecha. Antes del
arreglo, `/dashboard/<basura>` llegaba a Postgres y gastaba una consulta;
después, se corta en la página. Y enumerar sigue exigiendo adivinar un uuid v4
completo: `[id]` no acepta prefijos ni rangos.

**4. ¿El 404 filtra si el recurso existe en otro tenant?** No. Los tres casos
—segmento sin forma de uuid, uuid inexistente, uuid de otra flota— terminan en
el **mismo** `notFound()`, renderizado por el mismo `src/app/not-found.tsx`
("Esta página no existe"), sin `digest`, sin código y sin diferencia de cuerpo.
No hay oráculo de existencia. Sí hay una diferencia por **rol**, y es correcta:
un `encargado` recibe `redirect(inicioDe(rol))` en `:54` antes de llegar a la
guarda, porque su rol no ve `dinero` — eso le dice "esta sección no es tuya", no
"esa liquidación existe".

**Lo que el arreglo NO cubrió, y por eso hay un BAJO abajo:** la misma forma
—`.eq('id', <segmento crudo de URL>)` contra una columna `uuid`— sigue viva en
`src/app/api/export/pdf/[id]/route.ts:81`. Ahí el `22P02` cae en el `if (error)`
de `:85` y sale un **500** en vez de un 404. La guarda se puso en un lado de la
pareja.

**Contexto que da confianza en el arreglo:** el patrón ya existía en la casa.
`src/app/aviso/[tenant]/page.tsx:62` lleva el mismo regex con la misma
justificación escrita ("`maybeSingle` con un uuid inválido devuelve error de
Postgres, no `null` — se leería como una caída"). `58c44f9` no inventó una
defensa, replicó una. Y `src/app/dashboard/id_no_uuid.test.ts:54-64` amarra el
**cableado** —lee el fuente y exige que la guarda esté antes de la consulta—,
que es lo que impide que el arreglo se deshaga al reordenar. Los 21 casos pasan
hoy, junto con `proxy.test.ts` y las 7 suites de `src/lib/auth/` (129 verdes).

---

## Estado de los 3 ALTO de RLS que arrastro

Los tres **siguen abiertos, palabra por palabra**. No es una copia del pase 4:
volví a abrir el SQL y a leer el catálogo local de `node_modules`.

| # | Estado | Evidencia leída HOY |
|---|---|---|
| **A1 — las tablas del dinero no tienen capa de rol en la base** | **ABIERTO, byte-idéntico** | `supabase/migrations/0086_retirar_rol_operador.sql:38-52`: el `do $$` recrea `tenant_data` sobre las 19 tablas (`gasto`, `liquidacion`, `operador`, `wa_conversacion`, `viaje`…) como `for all using (tenant_id = any(get_user_tenant_ids()) or is_superadmin())`. Ni un `ve_finanzas()`, ni un `and rol <> 'encargado'`. La última migración es `0088_regimen_624_coordinados.sql`, y `grep -n "policy\|grant\|revoke\|search_path" 0087 0088` → **cero líneas**. `ve_finanzas()` sigue aplicada solo a las 6 tablas vacías (`0048:167-172`, `0049:140-158`, `0051:139-140`, `0052:135-140`) |
| **A2 — el contador "de solo lectura" puede ESCRIBIR las 19 tablas, incluida la bitácora** | **ABIERTO, byte-idéntico** | `0086:47-49`: `for all` con el `with check` idéntico al `using` — no hay policy de `select` separada de la de `insert/update/delete` en ninguna de las 19. `0086:75-77`: `bitacora_insercion` sigue siendo `for insert with check (tenant_id = any(get_user_tenant_ids()) or is_superadmin())`, **sin comparar `actor_email`/`actor_id` contra `auth.uid()`**: cualquier usuario de la flota puede insertar una fila de auditoría firmada con el nombre de otro |
| **P1-1 — `sharp` decodifica bytes que elige el chofer** | **ABIERTO, 5º pase** | `node -e "require('sharp/package.json').version"` → **0.34.5**. `package.json:35` → `"sharp": "^0.34.0"`. `git diff --stat 003c88a..HEAD -- package.json package-lock.json` → **vacío**. `npm audit` sigue marcando GHSA-f88m-g3jw-g9cj (CVE-2026-33327/-33328/-35590/-35591) |

**Por qué siguen los tres:** ninguno se arregla en TypeScript. A1 y A2 piden una
migración que parta `tenant_data` en lectura y escritura y meta el rol en la
expresión; P1-1 pide un `major` de `sharp` (0.35.x) que el pase 4 ya identificó
como breaking. Los tres pases de arreglo de esta ronda se fueron en frontend,
fiscal y ruteo.

---

## Hallazgos

### [MEDIO · NUEVO] El panel entero lee con service-role, y la pantalla de Usuarios le promete al contralor que RLS lo respalda
`src/app/dashboard/usuarios/page.tsx:126-128` (la promesa) · `:23` (la consulta
que la contradice) · más `dashboard/page.tsx`, `[id]/page.tsx`, `arco/page.tsx`,
`combustible-casetas/page.tsx`, `politicas/page.tsx`, `suscripcion/page.tsx`,
`motor-fiscal-periodo.tsx`, `resumen-visual.tsx` y `lib/likida/analytics.ts` —
las nueve fuentes de datos del panel, todas con `supabaseAdmin()`

El texto que se le pinta al cliente, literal:

> Cada consulta de este panel va filtrada por tu flota, y la base tiene RLS por
> tenant encima: aunque alguien pidiera datos de otra flota a mano, Postgres no
> se los devuelve.

La segunda mitad es falsa **para el panel**. `supabaseAdmin()` usa
`SUPABASE_SERVICE_ROLE_KEY`, que por definición salta RLS —el propio repo lo
escribe dos veces: `api/export/pdf/[id]/route.ts:75-77` ("el service-role salta
RLS, así que el filtro por tenant es EXPLÍCITO") y
`api/dashboard/asistente/route.ts:36-37`—. Barrí las nueve páginas de
`/dashboard`: **`supabaseServer()` (el cliente con la sesión del usuario, el
único sujeto a RLS) aparece exactamente una vez, en `dashboard/layout.tsx:24`, y
solo para `signOut()`**. Ninguna lectura de negocio pasa por RLS.

**Escenario, con valores.** No hay hoy una consulta sin filtro: barrí las ~40
`.from('…')` de `analytics.ts`, `repo.ts` y las páginas con un script que exige
`tenant_id` en la cadena de la consulta, y las únicas sin él son legítimas
(`plan`, `evento_stripe`, `suscripcion`, los sondeos de `startup.ts`, los
`storage.from(...)`). El escenario es el de mañana, y es de un teclazo: alguien
agrega `getViajesRecientes(limit)` a `analytics.ts` sin `.eq('tenant_id', …)`.
Con RLS debajo, ese olvido devuelve las filas de la flota que consulta y nada
más. Con service-role, devuelve **las 50 liquidaciones más recientes de todas
las flotas de la base**, y el panel del contralor de Transportes Innovativos
pinta los folios y los montos de su competidor. No hay error, no hay log, no hay
`exigir()` que se dispare: la consulta salió bien.

**Consecuencia.** Dos, de distinto tipo. (a) La estructural: el aislamiento
entre clientes del producto es una sola capa, y es la capa más fácil de olvidar
—una línea por consulta, repetida ~40 veces, sin nada que la exija—. (b) La
comercial, que es la que muerde antes: el contralor lee esa tarjeta en la
pantalla de Usuarios & Roles, que es exactamente la pantalla que abre cuando
pregunta "¿y cómo sé que mis datos no se mezclan con los de otra flota?". Es un
rótulo que no es verdad, en el rubro donde una respuesta falsa cuesta el trato.

**Refutación intentada.** Tres, y ninguna salva la frase. (i) "RLS sí está
puesta en la base" — cierto, y protege el camino de PostgREST con la anon key;
pero la frase dice *"cada consulta de este panel"*, y ninguna consulta del panel
pasa por ahí. (ii) "El filtro de TypeScript basta" — basta hoy, y por eso esto
es MEDIO y no ALTO: verifiqué que ninguna consulta viva lo omite. (iii) "Es solo
copy" — no lo es en este repo: `CLAUDE.md` eleva "un rótulo tiene que ser
verdad" a regla que no se rompe, y una promesa de aislamiento es el rótulo con
más consecuencia de todos.

**Causa raíz probable.** El panel migró a service-role para poder resolver el
caso del superadmin sin fila propia en `app_user`; el texto de la tarjeta
describe la arquitectura anterior y nadie lo volvió a leer.

---

### [MEDIO · NUEVO] `try_lock_viaje` y `unlock_viaje` se revocaron solo `from public` — el grant explícito de Supabase a `anon`/`authenticated` sigue puesto, y las verificaciones del repo lo dan por cerrado
`supabase/migrations/0012_seguridad_rls.sql:13-14` (el revoke corto) · contra
`supabase/migrations/0013_guardar_liquidacion_tx.sql:52-55` (la lección) ·
`supabase/migrations/0031_intake_barrera_ttl.sql:83` (la corrección que solo se
aplicó a una de las tres) · `supabase/verificaciones.sql:625-631` y `:742-747`
(los dos bloques que afirman lo contrario)

El propio repo documenta el mecanismo, en `0013:52-55`:

> OJO: Supabase concede EXECUTE a anon/authenticated de forma **EXPLÍCITA** por
> default privileges, así que `revoke from public` NO basta (se verificó en la
> DB: anon/authenticated seguían con EXECUTE).

Ese descubrimiento es **posterior** a la 0012, y la 0012 nunca se corrigió. Las
tres RPC internas se revocaron ahí con la forma corta:

```sql
revoke execute on function try_lock_viaje(uuid, integer) from public;   -- 0012:13
revoke execute on function unlock_viaje(uuid)            from public;   -- 0012:14
revoke execute on function intake_delta(uuid, integer)   from public;   -- 0012:15
```

De las tres, **solo `intake_delta` recibió después la forma completa**
(`0031:83`: `from public, anon, authenticated`). Las otras dos nunca. Ninguna
migración posterior las vuelve a tocar: `grep -rn "try_lock_viaje\|unlock_viaje"
supabase/` da exactamente cinco líneas de migración, y la última es
`0035_search_path_fijo.sql:35-36`, que solo fija `search_path`. `0005:31,45` las
crea con `create or replace`, que conserva ACL, así que el grant original de los
default privileges de Supabase sigue vivo.

**Escenario, con valores.** Un anónimo con la anon key —pública por diseño, el
propio repo lo asume en `0048:43-44`— hace
`POST https://<proj>.supabase.co/rest/v1/rpc/unlock_viaje` con
`{"p_viaje":"<uuid>"}`. PostgREST resuelve la función porque `anon` conserva
`EXECUTE`, y ejecuta `delete from viaje_lock where viaje_id = p_viaje`.

**Hasta dónde llega, dicho honestamente.** No llega a robar el lock. Las dos
funciones son **SECURITY INVOKER** (`0005:31-58`: ni `security definer` ni
`security invoker` escrito → invoker por default), y `viaje_lock` tiene RLS
encendida sin una sola policy (`0005:27`), así que corriendo como `anon` el
`delete` filtra a cero filas y el `insert` de `try_lock_viaje` choca con la RLS.
La segunda capa aguanta. **Eso es lo que lo deja en MEDIO y no en ALTO, y es
justo lo que lo hace reportable:** el repo tiene aquí exactamente dos capas, y
una de las dos está caída sin que nadie lo sepa.

**Consecuencia.** La que muerde no es la explotación, es la **verificación que
miente**. `verificaciones.sql:625-631` calcula `anon_lock`/`anon_unlock` con
`has_function_privilege` y anuncia `(esperado t / f / f / f / t)`; el bloque 18
(`:742-747`) mete las dos en la lista de "RPC que ninguna puede ser ejecutable
por anon" y espera `—`. Si ese script se corre contra producción, **sale rojo en
dos renglones**, y quien lo lea va a creer que la RLS de `viaje_lock` se cayó en
vez de leer que faltó una palabra en la 0012. Y ambos bloques solo miran `anon`:
`authenticated` —que sí es un usuario real de una flota— no se comprueba en
ningún lado.

**Causa raíz probable.** La lección de la 0013 se escribió como comentario en la
migración que la descubrió, no como una revisión de las que ya estaban puestas;
la 0031 la aplicó a la función que estaba tocando y no a sus dos hermanas de la
misma línea.

---

### [MEDIO · REINCIDENTE, 2º pase] `accionResponder` de ARCO sigue siendo el único server action del panel sin re-comprobación de rol
`src/app/dashboard/arco/page.tsx:34-56` (el action) · `:37`
(`requireSessionTenant(RUTA)` y nada más) · contra
`src/app/dashboard/combustible-casetas/page.tsx:50-56` (la doctrina escrita y
aplicada)

Rebarrí hoy los `'use server'` de `src/app/dashboard/`: son **nueve**, los
mismos que el pase 4. Ocho re-comprueban el rol dentro del action con la sesión
REAL — `politicas/page.tsx:79` (`puedeAdministrar`), `suscripcion/page.tsx:123`,
`:165`, `:184` (vía `tenantDelAction`), `[id]/page.tsx:111` (`puedeAdministrar`)
y `:138` (`puedeAsignar`), `combustible-casetas/page.tsx:55` (`puedeVerRuta`), y
`layout.tsx:23` que no aplica (cierra la sesión propia). **`arco.accionResponder`
sigue sin ninguno.**

Y sigue siendo el hermano del archivo que escribió la regla, textual
(`combustible-casetas/page.tsx:50-52`): *"se revalida `puedeVerRuta` aquí porque
una Server Action es un endpoint POST alcanzable por su cuenta — el gateo de la
página (arriba) no la protege."*

**Escenario, con valores** (sin cambio respecto al pase 4, reverificado):
`/dashboard/arco` es área `operacion` (`visibilidad.ts:77`); el contador tiene
`['dinero']`, así que la página lo rebota. Con el `Next-Action` de
`accionResponder`, el POST corre entero: `requireSessionTenant` valida su sesión,
`resolverSolicitudArco` marca la solicitud `estado='resuelta'` con su texto y
dispara el WhatsApp al titular. El chofer recibe una resolución de derechos ARCO
que nadie autorizado firmó y el plazo del art. 32 LFPDPPP queda cerrado.

**Lo que agrego este pase, que refuerza el hallazgo:** confirmé que el proxy no
ayuda aquí ni indirectamente. Un Server Action se resuelve por su ID en el
manifiesto, no por la ruta del POST, así que la petición puede ir a cualquier
path — incluido uno fuera de `RUTAS_CON_SESION` (`proxy.ts:108`). La primera
capa no existe para los actions: la única puerta es la que está dentro del
action. En ocho de nueve hay dos comprobaciones dentro; en ARCO hay una.

**Lo que lo mantiene en MEDIO y no sube:** el action es un closure sobre
`searchParams` (`:34`, `:37`), así que Next serializa argumentos ligados
cifrados que solo viajan en el RSC de alguien que sí pudo renderizar la página.
La ruta de explotación necesita el blob de una sesión con rol suficiente del
mismo build. Y `resolverSolicitudArco` filtra por `tenant_id` en lectura y en el
UPDATE (`repo.ts:980`, `:989`): el daño no cruza flotas.

**Causa raíz probable.** El re-chequeo se agrega archivo por archivo cuando
alguien lo nota, en vez de vivir en un helper que `requireSessionTenant` no
pueda saltarse.

---

### [MEDIO · REINCIDENTE, 5º pase] `/admin` tiene una sola capa para el ROL
`src/proxy.ts:114-117` (la capa que solo pregunta "¿hay sesión?") ·
`src/app/admin/layout.tsx:36` (la única que pregunta "¿superadmin?")

Recontado hoy: **20 `page.tsx` bajo `src/app/admin/`, ninguna con guarda propia
de lectura.** `requireSuperadmin()` vive exclusivamente en el layout, y
`proxy.ts:117` solo comprueba que exista un `user`. Un `flota_admin` con sesión
válida pasa la primera capa de `/admin` sin fricción; lo único que lo detiene es
que el layout se renderice.

**Lo que sí mejoró y hay que decirlo:** las **escrituras** de `/admin` sí tienen
dos capas. Los seis server actions —`costos-facturacion:32,92,125`,
`flotas:25,57`, `compliance:29`, `usuarios/nuevo:26`, `mi-perfil:34,43`—
**todos** llaman `requireSuperadmin()` adentro, y `usuarios/nuevo/page.tsx:37`
además rechaza explícitamente `rol === 'superadmin'`, cerrando la escalada por
alta de usuario. El hallazgo es sobre la **lectura**: qué tenants existen,
cuánto gasta Likida en IA, el MRR.

**Consecuencia.** Si el layout se salta (petición RSC con
`Next-Router-State-Tree` forjado apuntando a un subárbol ya conocido), un
`flota_admin` ve la consola de negocio de Likida. No pude confirmarlo en
ejecución —ver "lo que no alcancé"—; lo verificado es estático y no cambia: la
autorización por rol de 20 páginas cuelga de un solo archivo.

---

### [MEDIO · REINCIDENTE] QStash: el productor arranca con menos configuración que la que el consumidor exige
`src/app/api/cron/facturar/route.ts:308` (dispara con `UPSTASH_QSTASH_TOKEN` a
secas) · `src/app/api/cron/facturar/cola/route.ts:22-28` (exige las tres y
devuelve 503)

Sin cambio. El cron encola en cuanto existe el token; el callback rechaza con
**503** si falta `QSTASH_CURRENT_SIGNING_KEY` o `QSTASH_NEXT_SIGNING_KEY`.
Resultado: los 8 tickets salen del cron, QStash reintenta dos veces contra un
503 y el lote muere en la cola de Upstash. El cron responde
`{corrio:true, encolado:true}` — verde, y nada se facturó. Ninguna de las cinco
`QSTASH_*`/`UPSTASH_*` está en `GROUPS` de `src/lib/env.ts:29-38`, así que su
ausencia tampoco sale en `avisarConfiguracionSilenciosa()`.

---

### [BAJO · NUEVO] El arreglo de `58c44f9` se puso en la página y no en su gemela de API: `/api/export/pdf/<no-uuid>` sigue devolviendo 500
`src/app/api/export/pdf/[id]/route.ts:73-88` · contra
`src/app/dashboard/[id]/page.tsx:62`

Misma forma exacta que el ALTO que se arregló: un segmento de URL crudo va a
`.eq('id', id)` (`:81`) contra la columna `uuid`. `GET /api/export/pdf/cuadre`
con sesión de contralor → PostgREST devuelve `22P02` → `if (error)` de `:85` →
**500** con `logger.error('export.pdf.lectura')`.

**Consecuencia.** Baja y la acoto: no hay fuga (el cuerpo es genérico, "No se
pudo leer la liquidación"), no hay oráculo de tenant (un uuid ajeno da 404 igual
que uno inexistente, `:91`) y hay rate limit de 30/min por IP (`:30`). Lo que
queda es (a) ruido de nivel `error` que un humano leerá como "la base falla" y
(b) la asimetría: la misma URL vieja da 404 en el panel y 500 en la API. La
doctrina que el propio archivo escribe en `:89-90` —404 indistinguible— se
cumple para los ids con forma y se rompe para los que no la tienen.

**Causa raíz probable.** El arreglo se dirigió al síntoma reportado (el error
boundary en pantalla) y no al patrón; nadie buscó los otros `.eq('id', <param de
ruta>)`.

---

### [BAJO · REINCIDENTE] `resolverTenantEfectivo` sigue ignorando el `error` al resolver `?tenant=`
`src/lib/auth/tenant-efectivo.ts:121`

`const { data: t } = await supabaseAdmin().from('tenant')…` — sin `error`, a
diez líneas del bloque `:137-140` que sí lo comprueba y explica por qué hace
falta. Un bache de red al resolver `?tenant=<flota real>` se lee como "ese uuid
no existe" y la página cae al tenant de la sesión **sin el badge "viendo como
superadmin"** (`[id]/page.tsx:170-174` lo pinta solo si `volverQS` se llenó).
`resolverTenantPedido` (`tenant-api.ts:92-98`) y `resolverTenantApi` (`:63-67`)
ya hacen lo correcto; este es el único de los tres que no.

---

### [BAJO · REINCIDENTE] `config_tenant_valida` sigue sin `search_path`: la 0085 lo volvió a borrar
`supabase/migrations/0085_fix_config_tenant_valida_tipo.sql:17` · contra
`supabase/migrations/0035_search_path_fijo.sql:27`

`CREATE OR REPLACE FUNCTION public.config_tenant_valida(p_config jsonb)` sin
cláusula `SET`. En Postgres, `CREATE OR REPLACE` reemplaza `proconfig` entero,
así que el `alter function … set search_path = public, pg_catalog` de la 0035
queda anulado; lo mismo hicieron la 0082 y la 0083, y ninguna migración
posterior lo restaura (`grep -n search_path 0082 0083 0085` → **cero líneas**).
Es la función del `CHECK` de `tenant.config`, o sea la que valida **todos los
topes de dinero de una flota**. Riesgo real bajo: es `language plpgsql`,
`immutable` y **no** `security definer`, así que corre como el invocador. Lo que
lo mantiene abierto es que es la tercera vez que se pierde por la misma vía.

---

### [BAJO · REINCIDENTE] `/cuenta` sigue fuera del matcher del proxy
`src/proxy.ts:108` (`RUTAS_CON_SESION = ['/dashboard','/admin']`) ·
`src/app/cuenta/page.tsx:9`

`/cuenta` lee `tenant.nombre` con `supabaseAdmin()` (`:10-11`) y tiene una sola
puerta: su propio `requireSessionTenant('/cuenta')`. Es la única página con
datos del tenant que depende de una sola capa por omisión del matcher, y el
comentario de `proxy.ts:97-99` dice explícitamente que sobrar ahí es barato y
faltar es caro.

---

### [BAJO · REINCIDENTE] El callback de QStash no verifica el destino de la firma
`src/app/api/cron/facturar/cola/route.ts:36-39`

`receiver.verify({ signature, body })` — sin el campo `url`. La firma de QStash
incluye el destino; no comprobarlo permite que un mensaje firmado para otro
endpoint del mismo proyecto se replay aquí. Alcance acotado por ser el único
callback de QStash del repo.

---

### [BAJO · REINCIDENTE] La URL de callback de QStash cae al header `Host`
`src/app/api/cron/facturar/route.ts:316`

`const base = process.env.NEXT_PUBLIC_APP_URL ?? \`https://${req.headers.get('host')}\`;`
y el `body` que se publica son **8 filas completas de `gasto`** (`:317-322`):
`tenant_id`, `monto`, `fecha`, `folio`, `rfc_emisor`, `cfdi_uuid`, `ocr_extra`.
Es el único `??` del árbol donde un destino de datos fiscales sale de una
cabecera de la petición. Acotado por `Authorization: Bearer <CRON_SECRET>`
(`:254`) y por el ruteo por dominio de Vercel.

---

### [BAJO · NUEVO] La foto de perfil sube al bucket PÚBLICO con extensión y content-type que elige quien sube
`src/app/admin/mi-perfil/page.tsx:47-52` · `supabase/migrations/0046_perfil_avatar.sql:17-18`

`const ext = (archivo.name.split('.').pop() || 'jpg').toLowerCase()` y
`contentType: archivo.type || undefined`, hacia `avatares`, que es
`public: true` (`0046:18`, con `avatares_lectura_publica for select to public`,
`:43-45`). Subir `x.svg` con `image/svg+xml` deja un SVG servido con ese
content-type en
`https://<proj>.supabase.co/storage/v1/object/public/avatares/<userId>/avatar.svg`.

**Consecuencia: baja, y por eso es BAJO.** Solo `requireSuperadmin()` alcanza el
action (`:44`), o sea Javier; el archivo se sirve desde el origen de Supabase, no
desde `app.likida.ai`, así que no toca cookies de la app; y el CSP
(`proxy.ts:74`) permite `*.supabase.co` en `img-src` pero no en `script-src`.
Verifiqué además que no hay traversal: `split('.').pop()` sobre
`a/b/../c.png` devuelve `png`. Lo que queda es la forma: extensión y
content-type de un tercero hacia un bucket público, en el único bucket público
del proyecto.

---

## CVEs revisados y descartados, con la razón

`npm audit` corrido hoy sobre este árbol: **13 — 2 critical, 8 high, 3
moderate.** Idéntico a los pases 1, 2 y 4; `git diff --stat 003c88a..HEAD --
package.json package-lock.json` → **vacío**. Repito el veredicto completo por
escrito, no por referencia: un "ver pase anterior" no es descartar.

| Paquete | Sev. | Camino real en ESTA app | Veredicto |
|---|---|---|---|
| **`sharp` <0.35.0** — GHSA-f88m-g3jw-g9cj (CVE-2026-33327/-33328/-35590/-35591: corrupción de memoria en los cargadores TIFF/WebP/HEIF de libvips) | HIGH | **Sí.** Instalada **0.34.5**, dependencia de producción. `intake/cfdi.ts:249` hace `sharp(image).rotate().resize().jpeg().toBuffer()` sobre bytes que un chofer elige y manda por WhatsApp, dentro del proceso que tiene `SUPABASE_SERVICE_ROLE_KEY` en memoria. `sharp` enruta por *magic bytes*, no por el mime declarado, así que "es una foto de ticket" no acota nada | **ABIERTO — es el ALTO reincidente P1-1** |
| `vitest` ≤3.2.5 — GHSA-5xrq-8626-4rwp (CVSS 9.8) | CRITICAL | No. Exige el **servidor de Vitest UI** escuchando. La suite corre `npx vitest run`; no hay `--ui` ni `@vitest/ui` en `package.json`. `devDependency`, no viaja al bundle | **DESCARTADO** |
| `@vitest/coverage-v8` ≤3.2.5 | CRITICAL | No. Su `via` es literalmente `["vitest"]`, sin advisory propio. Dev-only | **DESCARTADO** |
| `vite` ≤6.4.2 (path traversal en `.map` de deps optimizadas; bypass de `server.fs.deny`; NTLMv2 por UNC de `launch-editor`) | HIGH | No. Los tres son del **dev server** de Vite, que este repo nunca levanta (Next trae el suyo), y dos son específicos de Windows; el entorno es Linux. Entra solo bajo `vitest` | **DESCARTADO** |
| `vite-node` ≤2.2.0-beta.2, `@vitest/mocker` ≤3.0.0-beta.4 | MOD | No. Cuelgan de `vite`/`vitest`, sin advisory propio. Dev-only | **DESCARTADO** |
| `esbuild` ≤0.24.2 — GHSA-67mh-4wv8-2f99 | MOD | No. Exige su dev server escuchando **y** que la víctima visite una web hostil con él encendido. Dev-only; el arreglo es `vitest@4`, semver-major | **DESCARTADO** |
| `brace-expansion` — GHSA-mh99-v99m-4gvg + tres bypasses de la mitigación de CVE-2026-14257 (DoS por expansión sin cota) | HIGH | No. `npm audit` lo ancla en `@eslint/config-array`, `@eslint/eslintrc`, `eslint-plugin-*` y `test-exclude`. **Todas dev.** Lo que expande son los globs de configuración que escribimos nosotros; un DoS del linter no es un DoS del producto | **DESCARTADO** |
| `js-yaml` 4.0.0–4.3.0 — CVE-2026-59870 (CPU cuadrática en `!!omap`) | HIGH | No. Camino único `@eslint/eslintrc → js-yaml`. **La trampa tentadora, desarmada otra vez:** las 24 fichas de `normas/` son YAML, pero no pasan por `js-yaml` (no está en el árbol de producción) y son archivos del repo, no entrada de un tercero | **DESCARTADO** |
| `fast-uri` 3.0.0–3.1.4 — GHSA-7p8r-x3mc-p8w7 (confusión de host por `\`) | HIGH | No. Camino único `@sentry/nextjs → @sentry/webpack-plugin → webpack → schema-utils → ajv → fast-uri`. Ese `ajv` valida esquemas de **configuración de webpack** en build; ninguna URL de petición pasa por ahí (la app valida entrada con `zod`) | **DESCARTADO** |
| `nanoid` <3.3.17 — GHSA-2v37-7h3g-55p8 (bucle infinito con `size = 0` y generador propio) | HIGH | No. Camino único `postcss → nanoid`, con tamaño fijo para ids de source-map. Nada lo llama con generador propio ni con `size` de un tercero. Build-time | **DESCARTADO** |
| `postcss` ≤8.5.22 — 4 advisories (lectura de `.map` arbitrarios por `sourceMappingURL` ×2, path traversal, XSS por `</style>` sin escapar) | HIGH | No. El CSS que procesa es el nuestro (`@tailwindcss/postcss` sobre `src/**/*.css`), en build. No hay ruta que meta CSS de un usuario en postcss en runtime: el repo pinta con `style={{}}`, no genera hojas a partir de datos | **DESCARTADO** |
| `next` (agregado) | HIGH | Su `via` son exactamente `postcss` y `sharp`, sin advisory propio de Next | **Cubierto por `sharp`** |

**Resumen honesto:** de las diez críticas/altas, **una sola** tiene camino real
de explotación en esta app (`sharp`), la misma que lleva cinco pases abierta.
Las otras nueve quedan descartadas arriba por escrito: dev-only o build-time.
Subir `vitest` a 4.x limpiaría 6 renglones del reporte y **cero** riesgo de
producción.

---

## Lo que revisé y está bien

- **`58c44f9` no abrió nada** — ver la sección de arriba: la guarda es de forma,
  el filtro de tenant sigue en `analytics.ts:1158`, y los tres caminos
  (sin forma / inexistente / de otra flota) dan el mismo 404 sin `digest`.
- **El proxy SÍ está cableado.** Lo dudé a propósito porque no existe
  `middleware.ts` en el repo. Next 16.2.11 renombró la convención: verifiqué en
  `node_modules/next/dist/build/index.js:613-651` que `proxy.ts` es el nombre
  vigente, y en `node_modules/next/dist/build/templates/middleware.js` que el
  handler se toma de `mod.proxy || mod.default` y que **lanza en build** si no
  existe. `src/proxy.ts:110` exporta `proxy`. La primera capa corre.
- **Ninguna consulta viva del panel olvida el tenant.** Script sobre las ~40
  `.from('…')` de `src/lib` y `src/app`: las únicas sin `tenant_id` en la
  consulta son legítimas (`plan`, `evento_stripe`, `suscripcion`, `factura_saas`
  por id, `app_user` por `id = userId`, los sondeos de `startup.ts`, los
  `storage.from(...)`, y las de `admin/negocio.ts` que cruzan tenants **a
  propósito**). El caso más delicado —`consolidado.ts:230,288`, que consulta por
  `cfdi_xml_id` sin tenant— resultó cerrado: ese id sale de un upsert con
  `.eq/tenant_id` (`:203-220`) y `resolverLineaAMano` filtra por tenant en las
  cinco consultas (`:356`, `:366`, `:382`, `:392`) y además exige que el gasto
  elegido esté en la lista de candidatos ya ofrecida (`:376`).
- **Los server actions de `/admin` tienen dos capas, todos.** Los seis llaman
  `requireSuperadmin()` dentro; `usuarios/nuevo/page.tsx:37` rechaza
  `rol === 'superadmin'`, así que no hay escalada por alta de usuario.
- **`rolEfectivo` sigue siendo solo-quita.** `visibilidad.ts:146-150`: se honra
  únicamente si `rolReal === 'superadmin'` y solo hacia `PREVISUALIZABLES`
  (`:128`). `?rol=flota_admin` desde una sesión de encargado se ignora.
  `AREAS_POR_ROL` (`:36-45`) y `AREA_POR_RUTA` (`:75-92`) siguen negando por
  default (`:100`, `area !== undefined`).
- **Las nueve páginas de `/dashboard` están todas gateadas.** Ocho pasan por
  `resolverTenantEfectivo` (que aplica `puedeVerRuta` en `tenant-efectivo.ts:105`)
  o `exigirVerRuta` (`soporte:33`); `[id]` se gatea a mano con
  `puedeVerArea(rol,'dinero')` (`:54`) porque su ruta es dinámica. Cero rutas
  huérfanas de matcher.
- **`getSessionTenant` falla cerrado y lo dice.** `session.ts:96`: sin fila
  legible el rol es `SIN_ROL`, que no está en ninguna matriz → `areasDe` → `[]`,
  `inicioDe` → `/sin-acceso`. El `?? 'flota_admin'` histórico ya no está, y el
  reintento (`:86-89`) cubre el fallo POR VALOR de supabase-js sin abrir nada.
- **Firma del webhook de WhatsApp.** `meta/client.ts:40-47`: HMAC-SHA256 con
  guardia de longitud antes de `timingSafeEqual`, y `false` si falta el secreto.
  Tope de cuerpo **antes** de leer (`whatsapp/route.ts:90`) y otra vez con
  `raw.length` (`:93`), que cierra el hueco de `Transfer-Encoding: chunked` que
  `ratelimit.ts:99-107` documenta. El challenge GET (`client.ts:31-36`) exige
  `mode === 'subscribe'` y un token no vacío.
- **Firma de Stripe** — tolerancia de tiempo antes del HMAC, firma sobre el
  cuerpo crudo, `timingSafeEqual`, **503 y no 200** si falta
  `STRIPE_WEBHOOK_SECRET`, e idempotencia por `evento_stripe` antes de aplicar.
- **QStash: el consumidor falla cerrado.** `cola/route.ts:22-28` exige las tres
  variables y devuelve 503; `verify()` corre **antes** de `JSON.parse` y sobre el
  `raw` exacto; firma inválida → 401 con log. Solo le falta el campo `url`.
- **Los tres crons** comparan `Authorization: Bearer <CRON_SECRET>`, devuelven
  **500** si la variable falta (no 200: un cron verde mintiendo es peor) y **401
  sin cuerpo** si no cuadra (`facturar/route.ts:249-256`).
- **`/api/dashboard/asistente` y los dos export tienen las tres puertas.**
  Sesión (401), área `dinero` (403), y en los export además `puedeExportar` y
  rate limit (`export/pdf:30` 30/min, `export/liquidaciones:18` 10/min). Los tres
  usan el tenant de la **sesión**, no el de la URL, y `?tenant=` solo lo honra un
  superadmin contra la tabla (`tenant-api.ts:57-73`, que distingue "no existe"
  de "no pude preguntar" con 503).
- **`/auth/callback` no es open redirect** — `next` solo se honra si
  `startsWith('/dashboard')`, y el destino se ancla con `new URL(dest, req.url)`.
- **URLs firmadas: cuatro puntos vivos, los cuatro a 60 s.**
  `export/pdf/[id]/route.ts:95` (con `download:` nombrado), `processor.ts:2123`
  (PDF al operador) y `:2178` (PDF al contralor). `ligaComprobante`
  (`intake/almacen.ts:94`, default 3600 s) sigue **sin un solo llamador**
  (`grep -rn ligaComprobante src/` → solo su definición): código muerto, no TTL
  vivo. Los buckets `liquidaciones` (0008) y `comprobantes` (0039) son
  `public: false`; el único público es `avatares` (ver el BAJO).
- **Ningún secreto con fallback derivado de otro secreto.** Rebarrí los
  `process.env.X ?? …` / `|| …` del árbol: URL pública, tenant de demo, entorno
  de observabilidad, ruta de chromium y los datos bancarios (que degradan a
  `null` y la pantalla lo dice). `supabaseAdmin()` **lanza** si falta la
  service-role key; `token()`/`phoneNumberId()` (`meta/client.ts:19-27`) lanzan
  igual. El único `??` en una frontera es el de la URL de QStash, reportado.
- **Nada de secretos en el repo.** `.gitignore` cubre `.env*`; el único
  rastreado es `.env.example`, en blanco. Barrido de
  `eyJ…`/`sk-…`/`sk_live`/`whsec_…`/`EAA…`/`qstash_…` sobre los archivos
  tocados desde el pase 4: cero.
- **CSP y cabeceras.** `proxy.ts:66-68` mete `'unsafe-eval'` SOLO bajo
  `NODE_ENV === 'development'` (ternario de módulo, no por petición);
  `withSecurityHeaders` se aplica también al redirect a `/login`, y las cookies
  de refresh viajan en él (`:143-145`).
- **`/aviso/[tenant]`, la única página pública con dato de tenant, está bien
  construida:** guarda de uuid antes de consultar (`:62`), `notFound()`
  indistinguible entre "no existe" y "está a medias" (`:68`), `robots: noindex`,
  y solo razón social/domicilio/contacto — nunca RFC, plan ni config.
- **`GET /api/demo` es público y devuelve `envHealth()`**: tres booleanos, sin un
  solo valor (`env.ts:59-65`). Lo miré por si filtraba; no filtra.
- **Compuerta verde a mi paso:** `npx vitest run` sobre `src/lib/auth/`,
  `src/proxy.test.ts` y `src/app/dashboard/id_no_uuid.test.ts` → **9 archivos,
  129 pruebas verdes**.

---

## Lo que NO alcancé a revisar

- **El estado REAL del catálogo de Postgres.** Todo lo de RLS, grants y
  `search_path` sale de leer las 88 migraciones y componerlas mentalmente. Sin
  conexión a Supabase no pude correr `supabase/verificaciones.sql` ni consultar
  `pg_policies` / `pg_proc.proconfig` / `has_function_privilege`. **Esto pesa
  especialmente sobre el MEDIO de `try_lock_viaje`/`unlock_viaje`:** afirmo que
  el grant de Supabase sigue puesto porque es lo que el propio repo verificó en
  la DB para el caso gemelo (`0013:52-55`) y porque nadie volvió a revocarlas —
  no porque yo haya leído el catálogo. La consulta que lo zanja en un segundo es
  el bloque 16 de `verificaciones.sql`.
- **Si la 0086 se aplicó a producción.** Su `alter table … add constraint`
  rechaza la migración entera si queda una fila `rol='operador'`. Si revirtió, el
  estado vigente es el anterior, con las policies del chofer todavía puestas.
- **La explotabilidad real del MEDIO de ARCO y del MEDIO de `/admin`.** Las dos
  exigen levantar la app (prohibido `npm run build`, sin credenciales) y armar
  el POST / la petición RSC con `Next-Router-State-Tree` forjado. Lo verificado
  es estático: la ausencia del re-chequeo en uno, y 20 páginas sin puerta propia
  en el otro.
- **Si la anon key está expuesta por otra vía** (variable en un Preview de
  Vercel, screenshot, consola compartida). Verifiqué que no está en el bundle de
  cliente de hoy; los canales de fuera del repo no los puedo ver. De eso depende
  cuán fácil es A1/A2 en la práctica, **no si son ciertos**.
- **Políticas de `storage.objects` creadas a mano** en la consola de Supabase:
  solo la 0046 crea políticas de storage desde el repo. En particular, si
  `avatares` se creó antes con otra visibilidad, el `on conflict (id) do nothing`
  de `0046:19` no la corrige.
- **`src/lib/agents/` y `src/lib/llm/` desde el ángulo de inyección de prompt
  con efectos.** El MAPA declara cero cambios; confirmé que ninguna tool nueva
  rompe la regla de `properties: {}`, no audité prompts ni `registry`.
- **`pruebas-manuales/*.prueba.ts`** (prohibido correrlas) y el adaptador de
  Playwright contra portales reales: solo lectura de código.
