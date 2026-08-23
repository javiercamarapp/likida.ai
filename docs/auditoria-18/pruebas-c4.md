# Pruebas — auditoría 18 · continuación 4

**Nota: 5/10** (antes 6). Razón del movimiento: **mirada más profunda** — el
código no empeoró, la nota anterior estaba inflada. La c3 midió la suite
offline y ahí el delta se defiende bien (11 mutaciones nuevas ROJAS hoy sobre
gates que llegaron ayer). Lo que no se había mirado es la **otra mitad de la
red**: el delta bajó la agregación de dinero a **18 migraciones SQL** y las
respaldó con dos cosas que resultan no ser puertas — pruebas «de equivalencia»
que nunca tocan el RPC, y bloques de `verificaciones.sql` que CI **corre y no
califica**. El ancla del rubro («4 o menos si la suite pasa con la función
rota») se cumple hoy en SQL, no en TS: quité el filtro de tenant de dos RPC de
la 0150 y **4,325 pruebas siguieron verdes**, y el único bloque de CI que lo
cazaría no cuenta para el resultado del job. No baja a 4 porque la mitad TS sí
tiene arnés real y demostrado, y porque los doce bloques nuevos que sí
quedan alineados (0149, 0152, 0153, 0157, 0158, 0160-0162, 0164-0167) son de
los mejores del repo.

**El riesgo mayor del rubro, hoy:** de los 123 bloques de
`supabase/verificaciones.sql`, **19 corren en CI y no se califican nunca** —y
seis de esos 19 son justo los de las migraciones del delta que mueven dinero
(0150 agregados, 0151 fiscal, 0154, 0155, 0159 escrituras atómicas, 0163
Stripe)—: se puede reprobar cada aserción de los seis y el runner imprime
«La batería pasó» con código de salida 0.

---

## Verificación de los abiertos de la c3

| Hallazgo | Estado | Evidencia |
|---|---|---|
| [CRÍTICO c2] `FACTURACION_PILOTO=si` sin una sola prueba con la palanca puesta | **REINCIDENTE** | `grep -rn FACTURACION_PILOTO src/ .github/ vitest.config.ts scripts/` → **3 aciertos**, ninguno una prueba: `facturacion/adaptadores/registro.ts:180` (la lectura), `registro.ts:170` y `llm/models.ts:133` (comentarios). Cero workflows. `src/app/api/cron/facturar/route.test.ts:161` la sigue clavando en `pilotoHabilitado: () => false` (subió de :132 a :161, el contenido es el mismo) |
| [CRÍTICO c3] El lease del claim de WhatsApp se desarma con la suite en verde | **REINCIDENTE** | Borré **las dos** guardas de `src/lib/likida/conv.ts:431-432` (`.is('completado_en', null)` y `.lt('created_at', …)`) y corrí `conv_*`, `wa_pendientes`, `api/webhook/whatsapp/`, `api/cron/` → **200/200 verdes** (20 archivos). El doble sigue igual: `conv_claim_lease.test.ts:33-38` define `is: () => nodo, lt: () => nodo`, que no registran nada |
| [ALTO c3] `acuse_ticket.ts` — la regla que impide pedirle firma al chofer sobre un monto dudoso | **REINCIDENTE** | `src/lib/likida/acuse_ticket.ts:172` (`if (l.confianza === null \|\| l.confianza < CONFIANZA_LEGIBLE)`) → `if (false)`; `npx vitest run src/lib/likida/` → verde. Sigue sin archivo `*.test.ts` propio |
| [ALTO c2] El filtro de tenant del cofre de credenciales | **REINCIDENTE** | Borré los **tres** `.eq('tenant_id', tenantId)` de `src/lib/likida/facturacion/cuentas.ts:39,73,114` → verde |
| [ALTO c2] Las «cuatro reglas que no se negocian» del piloto de visión | **CERRADO 1 de 4** | La regla del **veto por TEXTO del botón** ya está anclada: mutar `adaptadores/piloto_vision.ts:254` pone ROJA `piloto_vision.test.ts` («…ni cuando el modelo NO lo marca: el veto por texto del botón lo caza»). Las otras tres siguen verdes con la función rota: captcha (`:155`), `PASOS_MAXIMOS` (`:187`) y `enmascarar` (`:308`) → **164/164 verdes** en `adaptadores/` |
| [ALTO c2] `scoreCierre` da dos cifras según la pantalla | **REINCIDENTE** | `src/lib/admin/prospectos-mapa.ts:555` sigue llamando `scoreCierre({...})` **sin** `personasVerificadas`; `:775` sí lo pasa |
| [MEDIO c3] `abrirTicket` sin una sola prueba | **REINCIDENTE** | `src/lib/likida/comercial.ts:583` `abierto_por: abiertoPor` → `null`, y `:573` validación de `categoria` → `if (false)`: los dos verdes |
| [MEDIO c3] `puedeExportar` inalcanzable detrás de `puedeVerArea` | **REINCIDENTE** | `if (!puedeExportar(t.rol))` → `if (false)` en **las cuatro** rutas (`export/{bitacora-peaje:40, facturas-proveedor:53, liquidaciones:61, pdf/[id]:74}`) → verde |
| [MEDIO c2] `esSecreto()` sin consumidor de producción | **REINCIDENTE** | `grep -rn esSecreto src/` → 3 aciertos, dos son del propio archivo de prueba (`conectores/portales_facturacion.test.ts:7,44`); el único otro es la definición (`conectores/tipos.ts:266`) |
| [MEDIO c2] `armarAviso` ignora la cuenta compartida / `repartir` con tercer parámetro muerto | **REINCIDENTE** | `facturacion/avisar.ts:70` sigue llamando `repartir(tickets, sabeOperarlo)` con dos argumentos; `facturacion/enrutar.test.ts:155` también |
| [MEDIO c2] Las pruebas de reloj de `pagina_playwright.test.ts` corren instrumentadas | **REINCIDENTE** | `grep -c skipIf src/lib/likida/facturacion/adaptadores/pagina_playwright.test.ts` → **0** |

**La intermitente de `engine_iva_medio_pago.test.ts:35`.** Su diseño **no
admite intermitencia**: `src/lib/likida/cuadre/engine_iva_medio_pago.test.ts`
no tiene `vi.mock`, ni reloj, ni `Math.random`, ni estado de módulo; llama a
`cuadrarViaje` (pura: `engine.ts` no contiene `new Date`, `Date.now`,
`process.env` ni `Math.random`) con literales fijos, y el valor que afirma
—`ivaAcreditable`, `engine.ts:1189`— depende solo de `ivaTraslado`, `formaPago`
y `proporcionDeducible` (que aquí es 1: el gasto es hospedaje, no alimentación).
No hay orden, reloj ni estado compartido que la puedan mover. En mis dos
corridas completas de hoy tampoco se reprodujo (485/485 archivos, 6,247
pruebas, 1 saltada). Conclusión: si volvió a fallar, la causa está en el
runner (worker reciclado / OOM), no en la prueba — y eso es rubro de
operabilidad, no de pruebas.

---

## Mutaciones que corrí

24 mutaciones. **13 ROJAS / 11 VERDES.** Cada una revertida con
`git checkout --` antes del siguiente bloque.

| # | Mutación aplicada | Archivo mutado:línea | ¿Roja? | Cuáles |
|---|---|---|---|---|
| 1 | Borré `.is('completado_en', null)` **y** `.lt('created_at', ahora − LEASE_CLAIM_MS)` | `src/lib/likida/conv.ts:431-432` | **VERDE** | 200/200 en 20 archivos (`conv_*`, `wa_pendientes`, `webhook/whatsapp/`, `cron/`) |
| 2 | `if (escribe(req.method) && !vieneDeNuestroSitio(req))` → `if (false && …)` | `src/app/api/v1/_comun.ts:242` | **ROJA** | `_comun.test.ts` «POST cross-site con la cookie: 403 y no se resuelve ni el tenant» |
| 3 | `if (!vieneDeNuestroSitio(req))` → `if (false)` | `src/app/api/admin/palette/route.ts:75` | **ROJA** | `palette/route.test.ts` (2: «desde otro sitio: 403 y NINGÚN interruptor se toca» y «se contesta 403 sin mirar si es superadmin») |
| 4 | `exigirLlaveCoherente()` → no-op | `src/lib/saas/stripe.ts:64` | **ROJA** | `stripe.test.ts` «lanza en producción con sk_test» |
| 5 | `eventoEnModoDeLaLlave()` → `return true` | `src/lib/saas/stripe.ts:87` | **ROJA** | `stripe.test.ts` (2: el evento cruzado y el evento sin `livemode`) |
| 6 | `if (vivas.length > 1)` → `if (false)` (con DOS suscripciones vivas ya no se para) | `src/lib/saas/suscripcion.ts:411` | **ROJA** | `suscripcion_doble.test.ts` «con DOS vivas se PARA y lo dice» |
| 7 | `if (!(precio.montoMensual > 0))` → `if (false)` (un price de $0 se acepta) | `src/lib/saas/suscripcion.ts:277` | **ROJA** | `plan_price.test.ts` «rechaza un price en cero» |
| 8 | `OFFSET_MX = '-06:00'` → `'Z'` **y** `hoyMx` con `timeZone: 'UTC'` | `src/lib/formato.ts:57,47` | **ROJA** | **32 pruebas en 14 archivos** (entre ellas `stripe/webhook/route.test.ts:231` «el periodo se guarda en días de MÉXICO») |
| 9 | `if (l.confianza === null \|\| l.confianza < CONFIANZA_LEGIBLE)` → `if (false)` | `src/lib/likida/acuse_ticket.ts:172` | **VERDE** | — |
| 10 | `abierto_por: abiertoPor` → `null` | `src/lib/likida/comercial.ts:583` | **VERDE** | — |
| 11 | Borré la validación de `categoria` de `abrirTicket` | `src/lib/likida/comercial.ts:573` | **VERDE** | — |
| 12 | `if (!puedeExportar(t.rol))` → `if (false)` en las **cuatro** rutas | `export/{bitacora-peaje:40, facturas-proveedor:53, liquidaciones:61, pdf/[id]:74}` | **VERDE** | — |
| 13 | Borré los **tres** `.eq('tenant_id', tenantId)` | `facturacion/cuentas.ts:39,73,114` | **VERDE** | — |
| 14 | `if (accion.hayCaptcha)` → `if (false)` | `adaptadores/piloto_vision.ts:155` | **VERDE** | — |
| 15 | `>= PASOS_MAXIMOS` → `> 10_000` | `adaptadores/piloto_vision.ts:187` | **VERDE** | — |
| 16 | `enmascarar()` → identidad | `adaptadores/piloto_vision.ts:308` | **VERDE** | — |
| 17 | Quité el veto por TEXTO del botón | `adaptadores/piloto_vision.ts:254` | **ROJA** | `piloto_vision.test.ts` «el veto por texto del botón lo caza» — **cerrado por el delta** |
| 18 | `COOKIES_DE_SESION = { httpOnly: true }` → `false` | `src/lib/supabase/cookies.ts:35` | **ROJA** | `cookies.test.ts` «se impone httpOnly sobre el default del SDK» |
| 19 | `const para = destinatarioEnmascarado(telefono)` → `= telefono` (el teléfono ARCO entero al log) | `src/lib/meta/client.ts:574` | **VERDE** | — |
| 20 | `if (status === 401 \|\| 402 \|\| 403)` → `if (false)`; y `else if (!fueAbortado && vigilante.fallo())` → `else if (false)` | `src/lib/likida/intake/ocr.ts:362,364` | **ROJA** | `ocr_alerta.test.ts` (4) |
| 21 | `maxRetries: 0` → `3` | `src/lib/llm/openrouter.ts:46` | **ROJA** | `openrouter_reintentos.test.ts` |
| 22 | `if (transitorio)` → `if (false)` (con el LLM caído se vuelve a pedir el reenvío) | `src/lib/likida/processor.ts:2761` | **ROJA** | `processor_llm_caido.test.ts` (4) |
| 23 | Borré el `logger.error('cron.…no_autorizado')`, el `alertarOperador` de `cron_sin_secreto` y el cuerpo de `registrarLatido` | `src/lib/admin/salud.ts:57,66,75` | **ROJA** | `salud.test.ts` (3) |
| 24 | `if (error) throw` → `return []` y `throw new Error('… otra forma')` → `return []` | `src/lib/likida/analytics.ts:47,49` | **ROJA** | **36** en `analytics_agregados_0150.test.ts` + `analytics_periodo_series.test.ts` |
| **25** | **En SQL:** quité `tenant_id = p_tenant` de `anomalias_gasto_tenant` y de `gasto_semanal_tenant` | `supabase/migrations/0150_agregados_analytics.sql:104,211` | **VERDE** | **4,325 pruebas verdes** (`src/lib/likida/` + `src/lib/admin/`) |

Baseline limpio: `npx vitest run` → **485 archivos, 6,247 pasadas, 1 saltada,
126.9 s**, todo verde.

---

## Hallazgos

### [CRÍTICO] 19 de los 123 bloques de `verificaciones.sql` corren en CI y NO se califican — seis son los de las migraciones de dinero del delta

`scripts/ci/correr-verificaciones.mjs:229` (`tipo: 'sin_calificar'`) y `:349`
(`if (fallas > 0 || noLanzaron > 0) … exit(1)` — `sinCalificar` **no** entra) ·
los seis del delta: `supabase/verificaciones.sql:5970` (REGISTRO_0154),
`:6089` (FISCAL_AGREGADO_0151), `:6279` (AGREGADOS_0150), `:6576`
(PURGAS_0155), `:6738` (RPCS_0159), `:7331` (STRIPE_0163).

**Escenario (corrido, con un `psql` falso que devuelve el `raise` de cada
bloque con TODAS sus aserciones en `f`).** Extraje los seis bloques a un
archivo aparte y corrí el runner real:

```
6 bloque(s) · 0 ok · 0 fallo(s) · 0 no-lanzó · 6 sin-calificar · 0 reporte(s)
La batería pasó.        EXIT=0
```

Con `RPCS_0159 parcial-entra=f sobrepago-rebota=f saldo-nunca-negativo=f
salda-y-marca-pagada=f factura-ajena-rebota=f … anon=f` impreso en pantalla.
Sobre el archivo entero: **123 bloques → 19 sin-calificar**, y ninguno cuenta
para el código de salida.

La causa es mecánica y se ve en el `(esperado …)` de cada uno: el runner cuenta
las claves del lado izquierdo y las compara **posicionalmente** contra el
`(esperado …)` partido por `/`. Los seis no casan:

| Bloque | claves | valores esperados | por qué |
|---|---|---|---|
| `AGREGADOS_0150` :6279 | 16 | 5 | `(esperado 11/t/t/t/t y once t)` — «y once t» es prosa, no once tokens |
| `RPCS_0159` :6738 | 16 | 1 | `(esperado todo t salvo anon=f)` |
| `STRIPE_0163` :7331 | 8 | 1 | `(esperado todo t salvo anon_price=f)` |
| `FISCAL_AGREGADO_0151` :6089 | 14 | 7 | el `(esperado …)` mezcla `\|` y `,` con los `/` |
| `PURGAS_0155` :6576 | 9 | 10 | `bucket=%/%` es UNA clave con dos `%` |
| `REGISTRO_0154` :5970 | 8 | 9 | `anon=%/%`, mismo caso |

**Consecuencia.** `RPCS_0159` es el bloque que demuestra que `registrar_pago_tx`
no acepta un sobrepago, que el saldo nunca queda negativo y que una factura de
otra flota rebota — las tres escrituras de dinero que la 0159 vino a hacer
atómicas. Hoy ese bloque puede reprobar sus dieciséis aserciones y el job sale
verde. Lo mismo `AGREGADOS_0150`, que es **el único sitio del repo donde las
once RPC de la 0150 se comparan contra cifras reales** (lo declara
`src/lib/likida/analytics_rpc_0150.fixture.ts:16`: «El bloque 122 de
`supabase/verificaciones.sql` corre las mismas cifras contra Postgres de
verdad»). El contralor ve el tablero del panel; si la RPC suma mal, ni la suite
offline ni CI lo dicen.

**Causa raíz probable.** El `(esperado …)` es prosa escrita por humanos y el
runner lo trata como formato; el modo degradado («aviso fuerte, no fallo») es
razonable para un parser, pero nadie mide cuántos bloques caen ahí ni impide
que crezca — no hay tope de `sinCalificar` ni lista blanca.

---

### [CRÍTICO] Las pruebas «de equivalencia JS-vs-RPC» no verifican ni una línea de SQL: comparan TS viejo contra una transcripción a mano del SQL, escrita por el mismo commit

`src/lib/likida/analytics_rpc_0150.fixture.ts:1-21` ·
`src/lib/likida/espejo_0152.pruebas.ts:1-18` ·
`src/lib/likida/comercial_equivalencia.test.ts:26-40` (el `vi.mock` que
sustituye `supabaseAdmin().rpc` por `despacharRpc(doble, …)`) ·
`src/lib/likida/analytics_agregados_0150.test.ts:1-20`.

**Escenario (corrido).** Abrí `supabase/migrations/0150_agregados_analytics.sql`
y borré `tenant_id = p_tenant` de dos funciones —`anomalias_gasto_tenant`
(`:104`) y `gasto_semanal_tenant` (`:211`)—, o sea una fuga de datos entre
flotas dentro del propio SQL. `npx vitest run src/lib/likida/ src/lib/admin/`
→ **309 archivos, 4,325 pruebas, TODAS VERDES**. No hay nada que leerlo pueda
poner rojo: `migraciones_verificadas.test.ts` solo comprueba que exista un
**título** de bloque para cada migración, no el cuerpo.

Y no es que falten pruebas: las hay, muchas, y su nombre dice «equivalencia».
Lo que comparan es *la reducción JS congelada de antes de la migración* contra
*la función nueva con el RPC doblado por un espejo en JS escrito a mano leyendo
la migración*. Las dos mitades son TypeScript. El SQL nunca corre. Si la
transcripción se equivoca en el mismo sentido en que se equivoca la migración
—que es el error probable, porque las escribió el mismo autor en el mismo
commit— la prueba pasa y la producción está mal.

Los propios archivos remiten la verificación real a Postgres:
`analytics_rpc_0150.fixture.ts:16` → «el bloque 122»; `espejo_0152.pruebas.ts:16`
→ «el bloque 124». Para la 0152 esa promesa se cumple (el bloque de
`verificaciones.sql:6337-6527` tiene 17 claves contra 17 esperados y sí se
califica). **Para la 0150 no**: su bloque es uno de los 19 SIN CALIFICAR del
hallazgo anterior. Entre las dos cosas, las **once RPC de la 0150 no tienen red
en ningún lado**.

**Consecuencia.** El delta metió 18 migraciones a producción y la nota de la
campaña dice «hay pruebas de equivalencia». Un `where` mal puesto en cualquiera
de las once funciones de la 0150 sale al panel del contralor como una cifra —o
como las cifras de otra flota— con la suite en verde y el CI en verde.

**Causa raíz probable.** Se eligió el patrón de la 0112 (espejo en JS) para
poder probar sin base, y la mitad que sí necesita base se delegó a un bloque de
`verificaciones.sql` sin comprobar que ese bloque de verdad califique.

---

### [ALTO] `ci-postgres.yml` no bloquea nada: el auto-merge de la rutina se dispara con `ci.yml` a secas

`.github/workflows/auto-merge-rutina.yml:17-20` (`on: workflow_run: workflows:
["CI"]`) y `:31` (`conclusion == 'success'`) · `.github/workflows/ci-postgres.yml:60`
(`name: CI Postgres (aislamiento entre tenants)`).

**Escenario.** Un PR `mejora/*` con las 163 migraciones rotas y los 123 bloques
de la batería en rojo: `ci-postgres` termina en `failure`, pero el
`workflow_run` que dispara el merge escucha **solo** el workflow llamado `CI`.
Con `tsc`+`lint`+`vitest` en verde, `gh pr merge --squash --delete-branch`
(`:42`) corre igual. La cabecera del propio archivo lo dice sin querer: «El CI
("verificar" de ci.yml) es la auditoría: tsc + lint + toda la suite» — la
batería de Postgres no está en esa frase.

**Consecuencia.** La única puerta que ejecuta SQL de verdad es informativa. Con
`master` además sin protección de rama (abierto desde la c3), no hay ningún
punto del flujo donde una migración rota detenga un merge.

**Causa raíz probable.** `ci-postgres.yml` se añadió después del gate de
auto-merge y nadie volvió a la lista de workflows que lo disparan.

---

### [ALTO · REINCIDENTE] El lease del claim de WhatsApp se sigue desarmando entero con la suite en verde

`src/lib/likida/conv.ts:431-432` · `src/lib/likida/conv_claim_lease.test.ts:33-38`.

**Escenario (corrido).** Borré las dos guardas del UPDATE que decide si un
claim es huérfano y corrí 20 archivos (`conv_*`, `wa_pendientes`,
`api/webhook/whatsapp/`, `api/cron/`) → **200/200 verdes**. El doble de
Supabase sigue con `is: () => nodo, lt: () => nodo`: los filtros no se
registran y quién gana lo decide `retomar.mockResolvedValue`, no la consulta.

**Consecuencia.** Sin `.lt(...)`, el webhook y el cron de la bandeja durable
procesan el mismo comprobante a la vez: la foto de $4,200 del chofer aparece
dos veces en la liquidación. Es el bug C5 que este mismo delta vino a matar, y
su arreglo sigue sin nada que impida revertirlo.

**Causa raíz probable.** El doble se escribió para devolver un valor por
escalón de decisión; `is`/`lt` se añadieron solo para que la cadena no
reventara. (REINCIDENTE de la c3.)

---

### [ALTO · REINCIDENTE] `FACTURACION_PILOTO=si` sigue sin una sola prueba con la palanca puesta, y el delta le agregó carga

`src/lib/likida/facturacion/adaptadores/registro.ts:179-180` ·
`src/app/api/cron/facturar/route.test.ts:161`.

**Escenario.** `grep -rn FACTURACION_PILOTO src/ .github/ vitest.config.ts
scripts/` → tres aciertos, y el único ejecutable es la lectura de la variable.
Todo lo que corre detrás de la palanca —el piloto de visión, sus credenciales,
sus portales— se prueba con `pilotoHabilitado: () => false`. De las cuatro
reglas «que no se negocian» del piloto, tres siguen mutables en verde
(mutaciones 14, 15 y 16 arriba).

**Consecuencia.** El doc del demo manda encender la palanca. Encenderla activa
un camino cuya rama de código ninguna prueba ha ejecutado nunca, con un modelo
de visión operando un portal del SAT con credenciales del cliente.

**Causa raíz probable.** Nadie escribió el `describe` con
`vi.stubEnv('FACTURACION_PILOTO', 'si')`; el arnés del cron la fija en `false`
para que sus otras pruebas sean deterministas y eso se quedó como la única
configuración probada. (REINCIDENTE de la c2 y de la c3.)

---

### [ALTO] El arreglo SEG-7 (el teléfono de una solicitud ARCO fuera del log) llegó sin una sola prueba

`src/lib/meta/client.ts:554` (`enviarRespuestaArco`), `:574`
(`const para = destinatarioEnmascarado(telefono)`), `:576`, `:594`, `:596`, `:601`
(los cuatro `logger` que lo usan) · `src/lib/likida/repo.ts:1301-1302` (el único
llamador).

**Escenario (corrido).** Cambié `:574` por `const para = telefono;` —o sea,
revertí `3b69836` entero— y corrí `src/lib/supabase/ src/lib/meta/
src/lib/likida/intake/ src/lib/llm/ src/lib/auth/`: **verde**.
`grep -rn "enviarRespuestaArco\|arco.envio" src/ --include=*.test.ts` → **cero
aciertos**: la función no tiene prueba, ni directa ni por rebote.

Con la mutación, un titular que escribe su teléfono como `999 370 0779` en su
solicitud ARCO lo ve salir **entero** al log —el regex del redactor pide los
dígitos pegados (`\b\+?521?\d{10}\b`) y no casa con espacios—, que es
exactamente el caso que el commit documenta en `:566-573`.

**Consecuencia.** Es la peor fila para filtrar: la de alguien ejerciendo
derechos ARCO, cuyo teléfono es el dato que la solicitud venía a proteger
(LFPDPPP art. 21, confidencialidad). Y el arreglo es un one-liner: cualquier
refactor futuro lo revierte sin ruido.

**Causa raíz probable.** El commit de SEG-7 tocó cinco `logger` en dos archivos;
los de `conv.ts` caen dentro del alcance de pruebas existentes y los de
`enviarRespuestaArco` no, y nadie contó cuáles quedaban cubiertos.

---

### [MEDIO · REINCIDENTE] `acuse_ticket.ts` sigue sin arnés propio, y es la regla que evita que el chofer firme una cifra que el OCR no leyó

`src/lib/likida/acuse_ticket.ts:172` · sin archivo `*.test.ts` propio.

**Escenario (corrido).** `if (l.confianza === null || l.confianza <
CONFIANZA_LEGIBLE)` → `if (false)`; `npx vitest run src/lib/likida/` → verde.
Con la mutación, un ticket leído con confianza 0.30 deja de caer en `refoto` y
cae en `confirmar`: se le manda al chofer un botón con la cifra que el OCR
creyó leer. El propio archivo declara eso como su peor modo de falla
(`:24-31`). (REINCIDENTE de la c3.)

---

### [MEDIO · REINCIDENTE] `abrirTicket` (la señal de PMF #3), el cofre de credenciales y la tercera puerta del IDOR de export siguen sin poder ponerse rojos

`src/lib/likida/comercial.ts:573,583` · `src/lib/likida/facturacion/cuentas.ts:39,73,114` ·
`src/app/api/export/{bitacora-peaje/route.ts:40, facturas-proveedor/route.ts:53,
liquidaciones/route.ts:61, pdf/[id]/route.ts:74}`.

**Escenario (corrido).** Las tres mutaciones —`abierto_por: null`, borrar los
tres filtros de tenant del cofre, y `puedeExportar` → `if (false)` en las cuatro
rutas— aplicadas a la vez: verde. En `puedeExportar` el caso además **no puede
existir** (`EXPORTA` ⊃ los roles con área `dinero`, y el `puedeVerArea` va
antes), así que el commit «anclan las tres puertas del IDOR» ancla dos.
(REINCIDENTE de la c2 y la c3.)

---

### [MEDIO · REINCIDENTE] `scoreCierre` sigue dando dos cifras según la pantalla, sin prueba que las compare

`src/lib/admin/prospectos-mapa.ts:555` vs `:775`.

**Escenario.** `:775` pasa `personasVerificadas: (p.prospecto_persona ?? [])
.filter((x) => x.confianza !== 'baja').length`; `:555` no pasa el campo. El
mismo prospecto puntúa distinto en el listado que en el detalle y ninguna
prueba cruza las dos rutas. (REINCIDENTE de la c2.)

---

### [BAJO · REINCIDENTE] `esSecreto()`, el tercer parámetro de `repartir` y el `skipIf` ausente de `pagina_playwright.test.ts`

`src/lib/likida/conectores/tipos.ts:266` (solo lo usa su propia prueba) ·
`src/lib/likida/facturacion/enrutar.ts:196` vs `avisar.ts:70` (dos argumentos) ·
`src/lib/likida/facturacion/adaptadores/pagina_playwright.test.ts` (`grep -c
skipIf` → 0, y afirma tiempos que bajo `--coverage` miden la instrumentación).
(REINCIDENTES de la c2.)

---

## Lo que revisé y está bien

- **Los gates de seguridad del delta sí muerden.** `src/app/api/v1/_comun.ts:242`
  y `src/app/api/admin/palette/route.ts:75`: apagar la puerta CSRF pone rojas 3
  pruebas que además comprueban lo correcto —que **no se resuelve el tenant** y
  que **ningún interruptor se toca**, no solo el 403—. `src/lib/auth/cron.test.ts:63`
  va más lejos: escanea el fuente de **todas** las rutas de cron y exige que cada
  una use `autorizaCron` o `puertaCron`, así que una ruta nueva sin puerta falla
  sola.
- **Los cuatro candados de Stripe del delta están anclados uno por uno**
  (`stripe.ts:64` `exigirLlaveCoherente`, `:88` `eventoEnModoDeLaLlave`,
  `suscripcion.ts:411` las dos vivas, `:277` el price de $0). Ninguno sobrevivió
  a su mutación.
- **La campaña del «día de México» es la mejor cubierta del delta.** Un solo
  cambio de `OFFSET_MX` y de la zona de `hoyMx` (`src/lib/formato.ts:57,47`)
  pone rojas **32 pruebas en 14 archivos**, incluido el 31-dic/1-ene del periodo
  de Stripe (`stripe/webhook/route.test.ts:231`). Que el primitivo viva en un
  solo sitio es justo lo que hace que una prueba de zona horaria sirva.
- **El fail-closed de la capa RPC en TS es de los mejores arneses del repo.**
  `src/lib/likida/analytics.ts:47,49`: cambiar los dos `throw` por `return []`
  pone rojas **36** pruebas —una por función y por modo de falla (error de base,
  `null`, «filas con campos de otro tipo»)—. Es exactamente la regla del
  CLAUDE.md («fallar cerrado y decirlo») escrita como assertion, once veces.
- **La resiliencia del delta también.** OCR (`intake/ocr.ts:362,364`), OpenRouter
  (`llm/openrouter.ts:46`), el degradado del LLM caído
  (`processor.ts:2761` → `processor_llm_caido.test.ts`, que además afirma que
  **NO** se cierra la liquidación) y el latido/puerta de crons
  (`admin/salud.ts:57,66,75`): las cuatro rojas.
- **`AGREGADOS_0152` (`supabase/verificaciones.sql:6337-6527`) es un bloque
  ejemplar** y sí se califica (17 claves / 17 esperados). No comprueba «que la
  función devuelva algo»: siembra dos flotas, afirma `ingreso = 15000` («si B
  contamina: +99,999»), que la suma de las cinco cubetas de antigüedad **es** el
  `porCobrar` al centavo, y que la ventana de un día deja los liquidados fuera
  **sin borrar al operador**. Los diez bloques nuevos que sí quedan alineados
  (0149, 0152, 0153, 0157, 0158, 0160, 0161, 0162, 0164, 0165, 0166, 0167) están
  al mismo nivel.
- **`scripts/ci/correr-verificaciones.mjs` distingue bien los dos modos de
  fallo**: `:106-120` (`esRaiseDelPropioBloque`) separa «la protección se rompió»
  de «el bloque mismo está roto», y `:283-291` trata un bloque que **no lanza**
  como fallo duro. El problema no es el runner, es que `sinCalificar` no cuente.
- **`migraciones_verificadas.test.ts`** obliga a que toda migración nueva tenga
  título de bloque o exención escrita con razón — buena red contra el olvido,
  aunque no mire el cuerpo del bloque.
- **`src/lib/likida/cuadre/engine_iva_medio_pago.test.ts`** es determinista por
  construcción (ver arriba): no es candidata a intermitencia.

---

## Lo que NO alcancé a revisar

- **La batería de Postgres corriendo de verdad.** Aquí no hay base: todo lo que
  digo de `verificaciones.sql` sale de leer los bloques y de correr el runner
  real contra un `psql` falso que yo escribí. Eso demuestra **cómo califica el
  runner**, no si los bloques pasan contra Postgres. Un bloque de los 19 podría
  estar además roto por dentro y tampoco se sabría desde aquí.
- **Los otros 13 bloques SIN CALIFICAR** (`verificaciones.sql:147, 1107, 1531,
  1601, 1769, 1920, 2024, 2299, 2563, 2655, 2845, 3864, 3977`). Son anteriores
  al delta; los conté y verifiqué el desalineamiento, pero no leí qué protege
  cada uno ni evalué la consecuencia.
- **`espejo_0152.pruebas.ts` línea por línea contra la 0152.** Verifiqué que la
  arquitectura de la prueba no toca el SQL; **no** audité si la transcripción es
  fiel (390 líneas de JS contra ~700 de SQL). Si hay una divergencia concreta,
  no la busqué — el hallazgo es estructural.
- **Las otras 16 migraciones del delta.** Solo muté la 0150. Las 0151, 0159 y
  0163 quedaron sin mutación de SQL por presupuesto; el argumento de que su
  bloque no califica sí está verificado.
- **`--coverage`.** No corrí la puerta de cobertura (`vitest.config.ts:110-115`,
  umbrales 78/78/84/84), así que no sé si los ~53 archivos nuevos la movieron ni
  si alguna de las tres pruebas de tiempo cambió de comportamiento bajo
  `LIKIDA_COBERTURA`.
- **`getTickets`, `getCotizaciones` y `getEstadoRastreo`** (`comercial.ts`).
  Siguen sin arnés y siguen sin mutar; la de `getEstadoRastreo` promete «el
  token NUNCA sale de aquí».
- **Los `test(...)` del delta que no toqué**: los de FE-14/FE-16 (`dashboard/
  bloque.tsx`, `serie-diaria*.ts`, `paginar-*.ts`, `limite-error.tsx`) y el
  arnés de la 0166 (serie + folio + ejercicio) en TS.

---

## Confirmación de árbol limpio

Las 25 mutaciones se revirtieron con `git checkout -- src/` (y
`git checkout -- supabase/` para la #25) inmediatamente después de correr sus
pruebas. Salida real al terminar:

```
$ git status --porcelain
$
```

Vacío. (Este archivo no figura porque `.gitignore:34` ignora
`docs/auditoria-*/`.) El `psql` falso, el extractor de bloques y el SQL
recortado viven en el scratchpad de la sesión, fuera del repo. No hice ni un
commit.
