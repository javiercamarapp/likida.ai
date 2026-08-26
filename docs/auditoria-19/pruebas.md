# Pruebas — auditoría 19

**Nota: 5/10** (antes 5). Razón del movimiento: **se atacó y subió** la mitad
SQL —la batería de `verificaciones.sql` hoy corre de verdad en cada push, está
VERDE en `master`, y sus bloques nuevos sí califican— y **la deuda cobró
factura** en la mitad TS: los 27 módulos nuevos del delta entraron con el
arnés a medias (cuatro de ellos en **0 %** de líneas), y por ese hueco se
publicó una fuga de rol real. Neto: cero.

**El riesgo mayor del rubro, hoy:** el arnés de export es una **lista fija de
cuatro rutas** (`rutas_export.test.ts:90`) y el delta añadió la quinta; la
ruta nueva salió sin la puerta de área y **hoy un `encargado` —el rol que por
definición no ve dinero— baja la póliza contable completa con un 200**. Lo
comprobé ejecutando la ruta real.

---

## Lo que sí corrí esta vez (y la c4 no pudo)

Levanté un **Postgres 16.13 real** en la sesión, apliqué el andamio de CI y
las **179 migraciones sobre base virgen** (todas limpias) y corrí el runner
real de la batería. Es la primera vez en dos rondas que estos números salen de
Postgres y no de un `psql` falso:

```
179 migraciones aplicadas limpias.
139 bloque(s) · 118 ok · 0 fallo(s) · 0 no-lanzó · 19 sin-calificar · 2 reporte(s)
La batería pasó.                                                    EXIT=0
```

Sobre esa base hice **19 mutaciones** (2 en SQL contra la base viva, 17 en TS).
**8 ROJAS / 11 VERDES.** Cada una revertida con `git checkout --` antes de la
siguiente.

| # | Mutación | Archivo:línea | ¿Roja? |
|---|---|---|---|
| 1 | **SQL:** `where tenant_id = p_tenant` → `where true` en `anomalias_gasto_tenant` | `0150_agregados_analytics.sql:104` (aplicado a la base viva) | **VERDE** (batería EXIT=0) |
| 2 | **SQL:** `where l.tenant_id = p_tenant` → `where true` en `poliza_datos_tenant` | `0175_poliza_datos.sql:64` (base viva) | **ROJA** (`POLIZA_0178`, EXIT=1) |
| 3 | Borré `.eq('tenant_id', tenantId)` del lector de unidades del poller GPS | `conectores/sincronizar_gps.ts:111` | **ROJA** (3) |
| 4 | `Math.abs(cargos - abonos) > 0.01` → `> 1e9` (una póliza descuadrada sale) | `contabilidad/poliza.ts:158` | **ROJA** (1) |
| 5 | `!(MEDIOS_LISR_27_III).includes(formaPago)` → `formaPago === '01'` (revierte FISC-C3-1) | `cuadre/engine.ts:156` | **ROJA** (8) |
| 6 | Borré los 3 `.eq('tenant_id', tenantId)` del cofre de credenciales | `facturacion/cuentas.ts` | **ROJA** (1, escaneo estático) |
| 7 | Borré `.is('completado_en', null)` **y** `.lt('created_at', …)` del lease del claim | `conv.ts:431-432` | **VERDE** (6,438 pruebas) |
| 8 | `if (l.confianza === null \|\| l.confianza < CONFIANZA_LEGIBLE)` → `if (false)` | `acuse_ticket.ts:172` | **VERDE** |
| 9 | `abierto_por: abiertoPor` → `null` | `comercial.ts:583` | **VERDE** |
| 10 | Cambié `^\s*` por `^(\s\|\s)*` en el detector de cierre (ReDoS exponencial, misma semántica) | `processor.ts:453` | **VERDE** (130/130, y la propia `regex_sin_redos` 8/8) |
| 11 | Intercambié `tope('diesel', t.caseta)` / `tope('caseta', t.diesel)` | `perfil/entrevista-aplicar.ts:158-159` | **VERDE** |
| 12 | `if (err \|\| data !== true)` → `if (false)` (el lease perdido del outbox se calla) | `wa_outbox.ts:39` | **VERDE** |
| 13 | `.eq('id', tenantId)` → `.eq('id', 'CUALQUIER-OTRO-TENANT')` en el UPDATE del perfil, y quité el filtro del SELECT | `repo.ts:130,143` | **VERDE** (270/270) |
| 14-19 | Variantes de las anteriores para aislar la causa del rojo (ver texto) | — | — |

Baseline limpio (mismo día, antes de mutar): `npx vitest run` → **501 archivos,
6,434 pruebas, 1 saltada, 88 s**, todo verde. Bajo `--coverage`: **502 archivos,
6,436 pasadas, 3 saltadas**, y la puerta de cobertura pasa (statements 79.41 ·
ramas 70.01 · funciones 83.99 · líneas 81.99).

---

## Hallazgos

### [CRÍTICO] Un `encargado` baja la póliza contable completa: la ruta nueva de export salió sin la puerta de área porque el arnés que ancla el IDOR es una lista fija de cuatro rutas

`src/app/api/export/poliza/route.ts:75` · `src/app/api/export/rutas_export.test.ts:90`
· `src/lib/auth/permisos.ts:17` · `src/lib/auth/visibilidad.ts:41`

**Escenario (corrido).** Las cuatro rutas viejas de `export/` piden **dos**
puertas: `puedeVerArea(t.rol, 'dinero')` y luego `puedeExportar(t.rol)` (ver
`bitacora-peaje/route.ts:36-44`). `EXPORTA` incluye `'encargado'`
(`permisos.ts:17`) y `AREAS_POR_ROL.encargado` es `['operacion']`
(`visibilidad.ts:41`): la primera puerta es la que lo detiene, y su prueba lo
declara — «ENCARGADO (puede exportar pero NO ve dinero): 403 por área»
(`rutas_export.test.ts:128`).

`export/poliza/route.ts` **solo tiene la segunda** (`:75`). Escribí un arnés
temporal que importa la ruta REAL con `resolverTenantApi` doblado a
`{ rol: 'encargado' }` y el RPC `poliza_datos_tenant` devolviendo una
liquidación (anticipo $5,000, diésel $3,000, caseta $1,000, IVA $640):

```
STATUS ENCARGADO = 200
CUERPO = Tipo,Numero,Fecha,Concepto,Cuenta,TipoMovimiento,Importe,Referencia,…
Dr,1,20/08/2026,Liquidación viaje VJ-0007 — Juan Perez,5010-001,0,3000.00,…
Dr,1,20/08/2026,…,5010-002,0,1000.00,…
Dr,1,20/08/2026,…,1180-001,0,640.00,…
```

Las mismas credenciales contra `export/liquidaciones` devuelven **403 «Tu rol
no ve las cifras de dinero de la flota.»**. (El arnés temporal se borró; ver la
confirmación de árbol limpio.)

**Consecuencia.** El jefe de tráfico —el rol que el propio `visibilidad.ts`
describe como «no ve finanzas»— se baja el catálogo de cuentas de la flota,
todos los anticipos, todos los cargos y abonos y el IVA acreditable de cada
liquidación del periodo, en formato que su ERP importa. Es exactamente el IDOR
que la auditoría 18 cerró en cuatro rutas, reabierto en la quinta.

**Causa raíz probable (de pruebas).** `rutas_export.test.ts` enumera las rutas
a mano en `const RUTAS = [...]` (`:90-95`); una ruta nueva no entra sola, y no
hay ninguna red que exija que todo `src/app/api/export/*/route.ts` aparezca en
esa lista —al contrario de `src/lib/auth/cron.test.ts:63`, que **escanea el
fuente de todas las rutas de cron** y falla si una nace sin puerta. La ruta
está además en **0 % de cobertura de líneas** (medido, ver abajo).

---

### [CRÍTICO · REINCIDENTE] Los 19 bloques «sin calificar» son no-ops permanentes: metí una fuga entre flotas en el SQL, la batería la MIDIÓ, y salió EXIT=0

`scripts/ci/correr-verificaciones.mjs:390-410` (`SIN_CALIFICAR_CONOCIDOS`) y
`:412-431` · los seis de dinero: `supabase/verificaciones.sql:5903`
(REGISTRO_0154), `:6011` (FISCAL_AGREGADO_0151), `:6144` (AGREGADOS_0150),
`:6582` (PURGAS_0155), `:6648` (RPCS_0159), `:7283` (STRIPE_0163).

**Lo que sí mejoró:** desde `8b43121`, `sin_calificar` **es falla** para un
bloque NUEVO (`:412-426`). Eso cierra la mitad del hallazgo de la c4.

**Escenario (corrido contra Postgres real).** Apliqué a la base viva un
`create or replace` de `anomalias_gasto_tenant` idéntico al de la migración
salvo `where tenant_id = p_tenant` → `where true` —una fuga entre flotas dentro
del propio SQL— y volví a correr el runner **real**:

```
AGREGADOS_0150 funcs=11 invoker=t … anomalias_ok=f semanal_ok=t … (esperado 11/t/t/t/t y doce t)
139 bloque(s) · 118 ok · 0 fallo(s) · 0 no-lanzó · 19 sin-calificar · 2 reporte(s)
19 bloque(s) sin calificar, todos conocidos y con razón. Ninguno nuevo.
La batería pasó.                                                    EXIT=0
```

El bloque **detectó la fuga** (`anomalias_ok=f`, con `t` en las otras once) y el
runner salió **verde**. La lista `SIN_CALIFICAR_CONOCIDOS` no marca «no supe
leerlo»: marca «pase lo que pase, no cuenta».

**Consecuencia.** `RPCS_0159` (el sobrepago que no entra, el saldo que nunca
queda negativo, la factura ajena que rebota) y `AGREGADOS_0150` (las once RPC
que alimentan el tablero del contralor) pueden reprobar **todas** sus
aserciones y CI dice «La batería pasó». Y no hay red por el otro lado: la
mitad TS de la 0150 son las «pruebas de equivalencia» que comparan TS contra
una transcripción a mano del SQL (`analytics_rpc_0150.fixture.ts:16` remite
explícitamente a este bloque).

**Causa raíz probable.** La amnistía nominal se pensó como transitoria («esa
lista se baja, no se sube», `:422`) pero no tiene tope, fecha ni prueba que
haga bajar el conteo.

---

### [CRÍTICO] Tres de esos 19 bloques HOY contradicen su propio `(esperado …)`, y nadie lo ha visto nunca

`supabase/verificaciones.sql:6011` (FISCAL_AGREGADO_0151) · `:1531`
(INDICE_FACTURACION) · `:1601` (INDICES_PAGINACION).

**Escenario (corrido).** En la corrida limpia —sin ninguna mutación, 179
migraciones sobre base virgen— los tres imprimen un valor distinto del que su
autor escribió como esperado:

| Bloque | Medido hoy | `(esperado …)` escrito |
|---|---|---|
| `FISCAL_AGREGADO_0151` :6011 | `celdas=10  n=11/11  monto=8280.00/8280.00` | `11 celdas, 11/11, **7680.00**/7680.00` |
| `INDICE_FACTURACION` :1531 | `el-planeador-usa-el-indice=**f**` | `true` |
| `INDICES_PAGINACION` :1601 | `el-planeador-los-usa=**2/9**` | `9/9` |

Los $8,280 los verifiqué a mano contra la siembra del propio bloque
(`:6031-6053`: 1000+500+300+200+2500+1500+348+232+500+400+800), y la RPC y la
consulta directa **coinciden entre sí** —el que está mal es el oráculo escrito,
por $600 y por una celda—. En los otros dos el bloque declara en su cabecera
que 9/9 es lo medido («Falsificado: con los 9 índices tirados da 0/9. Con
ellos, 9/9», `:1591`) y siete de nueve planes salen hoy con `Sort Key: id` y un
`Bitmap Index Scan` sobre otro índice.

**Consecuencia.** El único bloque del repo que compara la agregación fiscal
contra Postgres lleva quién sabe cuánto tiempo midiendo una cifra distinta de
la que dice esperar, y el mecanismo que lo tenía que decir es el mismo que lo
silencia. Si `INDICES_PAGINACION` está diciendo la verdad, además, `traerTodo()`
está ordenando por `id` sin índice en siete tablas.

**Causa raíz probable.** Un bloque amnistiado deja de leerse: nadie compara sus
dos mitades ni cuando el propio runner las imprime una al lado de la otra.

---

### [ALTO] `regex_sin_redos.test.ts` prueba COPIAS de las regex: metí un ReDoS exponencial en la regex real y la prueba escrita para eso siguió 8/8 verde

`src/lib/likida/regex_sin_redos.test.ts:27-49` («copiadas de su archivo») ·
`:40-43` vs `src/lib/likida/processor.ts:453`.

**Escenario (corrido).** La copia de la prueba y la regex viva **ya divergieron**:

```
prueba :41   /^\s*(listo|ya est[aá]|ya qued[óo]|(ya\s+)?termin[éeoó]|cierra|cerrar)\s*[!.]*$/i
real   :453  /^\s*(listo|ya est[aá]|ya qued[óo]|ya no tengo m[áa]s|(ya\s+)?termin[éeoó]|(ya\s+)?acab[éeoó]|cierra|cerrar|eso es todo|es todo)(?!\p{L})/iu
```

Cambié en `processor.ts:453` el prefijo `^\s*` por `^(\s|\s)*` —**exactamente el
mismo lenguaje**, retroceso exponencial— y corrí `regex_sin_redos` más toda la
suite de `processor`: **130/130 verdes**, la propia `regex_sin_redos` **8/8**.
Medido con la regex mutada: 22 espacios → 33 ms, 26 → 92 ms, **30 → 1,432 ms**;
un mensaje de WhatsApp de 4,096 caracteres (el tope de Meta) no vuelve nunca.
`pareceCierre(texto)` corre sobre el texto que manda cualquiera que conozca el
número.

Dos cosas más, medidas: (a) `talacha_wa.ts:90` —la regex con la alternancia más
larga (`son|cuesta|cuestan|cobra|…`) y un grupo opcional detrás— **no está en la
lista** de la prueba; (b) el segundo `it` de cada caso («el tiempo NO explota al
doblar la entrada») no mide nada: en 3 de los 4 casos el tiempo chico cae por
debajo del piso de `0.01 ms` y la razón sale **0.35-1.23**, o sea `grande <
chico`. Y este archivo **no lleva `skipIf(LIKIDA_COBERTURA)`**, así que sus ocho
umbrales de milisegundos corren en CI **bajo instrumentación de v8**, que es
justo lo que `ci.yml:90-96` exceptúa para las otras dos pruebas de tiempo.

**Consecuencia.** La prueba que el commit `2151b98` vende como «ReDoS medido en
vez de adivinado» sustituye a CodeQL sobre un texto que ya no existe en el
código. Un refactor de esa regex —o de las de `talacha_wa`— pasa por CI sin que
nada lo mida.

**Causa raíz probable.** Se copiaron los literales en vez de exportarlos e
importarlos; es la misma trampa que `CLAUDE.md` documenta para los screenshots
(«una copia verifica la copia»).

---

### [ALTO] El onboarding por chat le escribe la política de topes y los datos fiscales a la flota, y está en 0 % de cobertura: le cambié los topes de lugar y la suite entera siguió verde

`src/lib/likida/perfil/entrevista-aplicar.ts:158-159` (y `:140`, `:165`) ·
sin ningún `*.test.ts` que lo importe.

**Escenario (corrido).** Intercambié `tope('diesel', t.caseta)` /
`tope('caseta', t.diesel)` —el tope de diésel que el modelo extrajo del chat se
escribe en el renglón de casetas y viceversa— y corrí **la suite completa**:
`502 archivos, 6,438 pruebas, 1 saltada, TODAS VERDES`.

`grep -rn "aplicarTurnoEntrevista\|nutrirDesdeHechos" src/ --include=*.test.ts`
→ **cero aciertos**. La cadena entera —`api/dashboard/onboarding-chat/route.ts`
→ `perfil/entrevista-agente.ts` → `perfil/entrevista-aplicar.ts`— mide **0 % de
líneas** en el reporte de cobertura de hoy.

**Consecuencia.** Con la política invertida, un ticket de caseta de $900 entra
bajo el tope de diésel y sale «dentro de política», y un diésel de $900 sale
«sobre política». Es la cifra que el contralor cruza contra su PDF. Y el módulo
también llama `guardarDatosFiscales` (`:140`: RFC, régimen, CP del receptor
CFDI 4.0) y `crearOperador`/`crearUnidad`, todo a partir de lo que un modelo
extrajo de un chat, sin una sola aserción.

**Causa raíz probable.** El delta puso las pruebas en las piezas puras
(`preguntas.ts` 94 %, `onboarding.ts` 87 %) y dejó sin arnés justo la que
escribe.

---

### [ALTO] Cobertura medida del delta: cuatro módulos nuevos en 0 %, y la puerta global no lo puede ver

Reporte de `npm run test:coverage` de hoy (`node_modules/.cache/coverage/coverage-summary.json`):

| Archivo nuevo del delta | líneas | ramas |
|---|---|---|
| `src/app/api/export/poliza/route.ts` (262 líneas, dinero al ERP) | **0 %** | 0 % |
| `src/lib/likida/perfil/entrevista-aplicar.ts` | **0 %** | 0 % |
| `src/lib/likida/perfil/entrevista-agente.ts` | **0 %** | 0 % |
| `src/app/api/dashboard/onboarding-chat/route.ts` | **0 %** | 0 % |
| `src/app/api/cron/gps/route.ts` | **0 %** | 0 % |
| `src/lib/likida/wa_outbox.ts` | 33.3 % | **5.3 %** |
| `src/lib/likida/perfil/entrevista.ts` (998 líneas) | 28.8 % | 19.3 % |
| `src/lib/admin/calcom.ts` | 36 % | 43.6 % |

**Escenario.** Los 27 archivos nuevos aportan **1,311 ramas de las que solo 539
están cubiertas (41 %)**, y arrastran el total de 72.28 % a 70.02 %. La puerta
(`vitest.config.ts:119-124`) exige `branches: 69`: pasa con **1.02 puntos de
margen**. No hay piso por archivo, así que un módulo en 0 % no puede poner roja
la puerta mientras las otras 6,400 pruebas carguen el promedio.

Aparte: el **mismo commit** `8b43121` (a) subió vitest de `^2.1.0` a `4.1.11`,
(b) metió esos 1,311 ramas nuevas y (c) **bajó** el trinquete de ramas de 78 a
69 y de funciones a 82, atribuyendo la caída solo a (a). Las dos causas van
entrelazadas en un commit y ya no se pueden separar desde CI.

**Consecuencia.** El número que CI publica dice «79 %» mientras el camino que
convierte un chat en la configuración fiscal de la flota no se ejecuta ni una
vez.

---

### [ALTO · REINCIDENTE] El lease del claim de WhatsApp se sigue desarmando entero con la suite en verde

`src/lib/likida/conv.ts:431-432` · `src/lib/likida/conv_claim_lease.test.ts:33-38`.

**Escenario (corrido).** Borré las dos guardas del UPDATE que decide si un claim
es huérfano (`.is('completado_en', null)` y `.lt('created_at', ahora −
LEASE_CLAIM_MS)`) y corrí **la suite completa**: 6,438 pruebas verdes. El doble
de Supabase sigue definiendo `is: () => nodo, lt: () => nodo`: los filtros no se
registran y quién gana lo decide `retomar.mockResolvedValue`.

**Consecuencia.** Sin `.lt(...)`, el webhook y el cron de la bandeja durable
procesan el mismo comprobante a la vez: la foto de $4,200 del chofer entra dos
veces en la liquidación. (REINCIDENTE de la c3 y la c4.)

---

### [MEDIO] El gate de auto-merge nunca espera: `CODE=$?` después de un `if` en bash siempre vale 0, así que la rama de «checks en curso» es código muerto

`.github/workflows/auto-merge-rutina.yml:52-67`, en particular `:57` (`CODE=$?`).

**Escenario (corrido).**

```
$ bash -c 'f(){ return 8; }; if f; then echo yes; fi; CODE=$?; echo "CODE=$CODE"'
CODE=0
```

POSIX: el estado de un `if` cuya condición falla y no tiene `else` es **cero**.
`gh pr checks` devuelve 8 cuando algún check sigue corriendo; el script lee
`CODE=0`, la comparación `[ "$CODE" = "8" ]` (`:58`) nunca es cierta, y cae
directo al bloque de `:63`: imprime «🔴 Hay checks en ROJO», **comenta el PR
diciendo que hay checks en rojo** y sale 1. El bucle `for i in $(seq 1 30)`
nunca da una segunda vuelta.

**Consecuencia.** El workflow se dispara al terminar `CI`; `CI Postgres` corre
en paralelo y suele seguir en curso en ese instante. Cuando eso pasa, el PR
`mejora/*` recibe un comentario falso de «checks en rojo» y no se mergea nunca,
aunque después todo salga verde. Es fail-closed —no mergea de más— pero la
rutina diaria queda parada y el comentario miente.

**Causa raíz probable.** El `$?` se escribió pensando en `cmd; CODE=$?`, no en
`if cmd; then … fi; CODE=$?`.

---

### [MEDIO · REINCIDENTE] `acuse_ticket.ts` sigue sin arnés propio: es la regla que evita pedirle firma al chofer sobre una cifra que el OCR no leyó

`src/lib/likida/acuse_ticket.ts:172` · no existe `acuse_ticket.test.ts`.

**Escenario (corrido).** `if (l.confianza === null || l.confianza <
CONFIANZA_LEGIBLE)` → `if (false)`; suite completa (junto con la #7): 6,438
verdes. Con la mutación, un ticket leído con confianza 0.30 deja de caer en
`refoto` y cae en `confirmar`: se le manda al chofer un botón con la cifra que
el OCR *creyó* leer, y su «sí» queda como acuse. El propio archivo declara eso
como su peor modo de falla (`:24-31`). (REINCIDENTE de la c3 y la c4.)

---

### [MEDIO] `wa_outbox.ts` — el último eslabón antes del teléfono del chofer, con 5.3 % de ramas y sin una sola prueba propia

`src/lib/likida/wa_outbox.ts:39` (`finalizarSalidaWhatsApp`).

**Escenario (corrido).** `if (err || data !== true) logger.error(…)` → `if
(false)`: suite completa verde. Esa condición es la única que distingue «cerré
el envío» de «perdí el lease»; con ella apagada, un mensaje ya entregado a Meta
se queda `pending` en el outbox y el cron lo vuelve a mandar en la siguiente
vuelta. `grep -rn "encolarSalidaWhatsApp\|reclamarSalidasWhatsApp\|finalizarSalidaWhatsApp"
src/ --include=*.test.ts` no da ningún acierto sobre el módulo (solo lo roza el
arnés del cron, que ya existe).

**Consecuencia.** El chofer recibe dos veces el mismo aviso de cobranza; peor,
el «listo» duplicado es el P0 que `8b43121` vino a matar.

---

### [MEDIO · REINCIDENTE] `FACTURACION_PILOTO=si` sigue sin una sola prueba con la palanca puesta

`src/lib/likida/facturacion/adaptadores/registro.ts:180` ·
`src/app/api/cron/facturar/route.test.ts` (fija `pilotoHabilitado: () => false`).

`grep -rn FACTURACION_PILOTO src/ .github/ vitest.config.ts scripts/` → **3
aciertos**: la lectura de la variable (`registro.ts:180`) y dos comentarios
(`registro.ts:170`, `llm/models.ts:139`). Ni un workflow, ni un `vi.stubEnv`.
Todo lo que corre detrás de la palanca —el piloto de visión operando un portal
del SAT con credenciales del cliente— se prueba con la palanca en `false`.
(REINCIDENTE de la c2, la c3 y la c4.)

---

### [MEDIO · REINCIDENTE] `abrirTicket` (la señal de PMF #3) sigue sin poder ponerse roja

`src/lib/likida/comercial.ts:583`.

**Escenario (corrido).** `abierto_por: abiertoPor` → `null`, y corrí
`src/lib/likida/comercial*` + `src/lib/admin/`: **277/277 verdes**. El ticket se
guarda sin quién lo abrió y nada lo dice. (REINCIDENTE de la c3 y la c4.)

---

### [BAJO] La lista blanca del runner casa por PREFIJO del mensaje, con claves tan cortas como `'45 '`

`scripts/ci/correr-verificaciones.mjs:413-415`
(`[...SIN_CALIFICAR_CONOCIDOS.keys()].some((k) => m.startsWith(k))`).

Cuatro de las diecinueve claves son `'45 '`, `'48 '`, `'49 '` y `'52 '`. Un
bloque **nuevo** cuyo `raise` empiece por «45 …» —un conteo, una fecha— entra a
la amnistía sin que nadie lo apruebe, y el gate de `:416-426` («un bloque nuevo
sin calificar SÍ falla») no lo ve. No lo pude disparar con un bloque real; el
riesgo es de construcción.

---

## Lo que revisé y está bien

- **La batería SQL de verdad pasa.** 179 migraciones limpias sobre base virgen y
  **118 bloques calificados en verde, 0 fallos**, contra Postgres 16 real. Es la
  primera verificación de esto en tres continuaciones.
- **`ci-postgres` está VERDE en `master`** (run #381 sobre `8b43121`, `success`)
  y corre en cada push de cada rama (`ci-postgres.yml:56-59`). **Cierra el ALTO
  de la c4** («24 h en rojo»). Sus últimos 15 runs: todos `success` salvo dos
  fallos legítimos en `codex/enterprise-go-10` que se arreglaron antes del merge.
- **El auto-merge ya no mergea con `CI` a secas.** `auto-merge-rutina.yml:46-77`
  exige `gh pr checks` (todos los checks del commit). **Cierra el ALTO de la c4**,
  con la salvedad del `$?` de arriba.
- **`sin_calificar` es falla para un bloque NUEVO**
  (`correr-verificaciones.mjs:412-426`). Cierra la mitad del CRÍTICO de la c4.
- **Los cuatro bloques SQL nuevos del delta SÍ califican y SÍ muerden.** Metí
  `where true` en `poliza_datos_tenant` (0175) y `POLIZA_0178`
  (`verificaciones.sql:8241`) puso la batería en **EXIT=1** con
  `n=2 … ajena_no_entra=f`. `GPS_0176` (:8333), `CLAIMS_0177` (:8406) y
  `OUTBOX_RESERVA_0180` (:8434) tienen sus claves alineadas con sus esperados.
- **El poller de GPS tiene el mejor arnés nuevo del delta.** Su doble de Supabase
  **aplica los filtros de verdad** (`sincronizar_gps.test.ts:63-66`): borrar
  `.eq('tenant_id', tenantId)` de `sincronizar_gps.ts:111` pone rojas 3 pruebas,
  entre ellas «el dispositivo 1234 de OTRA flota no recibe la lectura de esta».
- **La póliza contable está anclada donde importa.** `poliza.ts:158` (el cuadre
  cargos = abonos) mutado a `> 1e9` → roja; y las pruebas de `formatos.ts`
  afirman el DOBLE encabezado del DTW de SAP y el tipo 0/1 de CONTPAQi, no solo
  que salga texto.
- **FISC-C3-1 quedó anclado.** Revertir `engine.ts:156` a `formaPago === '01'`
  pone rojas **8** pruebas de `engine_combustible_medio_pago.test.ts` afirmando
  `totalDeducible`/`ivaAcreditable` como salida del motor real.
- **El cofre de credenciales YA NO es reincidente.** Borrar los tres
  `.eq('tenant_id', tenantId)` de `facturacion/cuentas.ts` pone roja
  `supabase/pruebas-aislamiento/consultas_admin_filtran_tenant.test.ts`
  («ninguna consulta se queda sin el filtro ni sin una exención con razón») —
  un escaneo de fuente que se auto-actualiza. **Cerrado.**
- **`scoreCierre` YA NO da dos cifras.** `prospectos-mapa.ts:607` y `:840` pasan
  los dos `personasVerificadas`. **Cerrado.**
- **`arbol_sin_enlaces_ajenos.test.ts` no decora.** Lee `git ls-files -s` del
  árbol real y saca el destino con `git cat-file blob`; ancla OPER-C4-1 de verdad.
- **`migraciones_verificadas.test.ts`** obligó a las 0168-0184 a decidir: cada
  una tiene bloque o exención con razón escrita (0168, 0172, 0183, 0184).
- **`engine_iva_medio_pago.test.ts` no es candidata a intermitencia.** Cinco
  corridas aisladas hoy, 3/3 verdes cada vez; el archivo no tiene `vi.mock`, ni
  reloj, ni `Math.random`, ni estado de módulo. Si volvió a fallar, es del
  runner — rubro de operabilidad.
- **`padron_monederos.test.ts` y `evidencia_monedero.ts`** (100 % de líneas) son
  pruebas honestas de módulos chicos, con los bordes (`null`, espacios,
  mayúsculas, RFC fuera de la semilla) cubiertos.

---

## Lo que NO alcancé a revisar

- **Si `INDICES_PAGINACION` (2/9) es un problema real de producción o un
  artefacto del planeador en mi cluster.** Verifiqué que los 8 índices existen y
  que los planes traen `Sort Key: id`; no comparé contra el `explain` de la base
  de Supabase, que tiene otras estadísticas y otro `random_page_cost`.
- **Los otros 13 bloques SIN CALIFICAR** (`:147, 1107, 1769, 1920, 2024, 2299,
  2563, 2655, 2845, 3864, 3977` y los dos ya citados). Leí sus mensajes medidos
  y ninguno contradice su esperado a simple vista, pero no auditué qué protege
  cada uno.
- **`espejo_0152.pruebas.ts` línea por línea contra la 0152.** El hallazgo
  estructural de la c4 sigue en pie (el SQL nunca corre en esas pruebas); no
  busqué una divergencia concreta en las ~390 líneas de transcripción.
- **`entrevista.ts` (998 líneas, 28.8 % de líneas / 19.3 % de ramas).** Es el
  intérprete del chat; no muté nada dentro.
- **`src/lib/admin/calcom.ts` (36 %)** y la verificación de firma del webhook:
  no muté `verificarFirmaCalcom`.
- **`getTickets`, `getCotizaciones` y `getEstadoRastreo`** (`comercial.ts`) —
  siguen sin arnés y sin mutar, como en la c4.
- **`pruebas-manuales/*.prueba.ts`** — no se corren por instrucción (llamadas
  reales de pago). Tampoco revisé si alguno se coló al `include` de vitest.

---

## Confirmación de árbol limpio

Las 19 mutaciones se revirtieron con `git checkout -- <archivo>` inmediatamente
después de correr sus pruebas. El único archivo que creé dentro de `src/` fue el
arnés temporal `src/app/api/export/zzz_auditoria_temp.test.ts` (la prueba del
CRÍTICO del `encargado`), borrado con `rm` en cuanto imprimió su resultado;
`git status --porcelain` quedó vacío en ese momento.

Salida real al terminar mi trabajo:

```
$ git status --porcelain
 M src/app/dashboard/page.tsx
?? src/app/dashboard/onboarding_gate.test.tsx
```

**Esos dos NO son míos.** Durante mi sesión el autofix de otros rubros commiteó
en este mismo árbol (`HEAD` pasó de `8b43121` a `035dac5`, «auditoría 19: rubro
backend y API»), y esas dos entradas son trabajo en curso de otro auditor sobre
`/dashboard`. Yo no toqué ninguno de los dos archivos en ningún momento. De los
míos —`conv.ts`, `acuse_ticket.ts`, `poliza.ts`, `sincronizar_gps.ts`,
`repo.ts`, `processor.ts`, `engine.ts`, `entrevista-aplicar.ts`, `wa_outbox.ts`,
`cuentas.ts`, `comercial.ts`— no queda ninguno modificado.

El cluster de Postgres, el SQL extraído de las migraciones y los reportes de la
batería viven en `/var/tmp/pgaudit`, fuera del repo; el servidor quedó detenido.
No hice ni un commit. (Este archivo no figura en `git status` porque
`.gitignore` ignora `docs/auditoria-*/`.)
