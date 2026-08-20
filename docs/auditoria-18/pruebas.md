# Pruebas — auditoría 18

**Nota: 6/10** (antes 6). Razón del movimiento: **mirada más profunda**. La nota
se sostiene por dos cosas que se empujan en sentido contrario. A favor: la
compuerta mejoró de verdad desde la ronda 5 — CI corre en **todas** las ramas,
hay umbral de cobertura medido (78.52 / 84.16 / 84.75, apenas por encima del
trinquete) y `pruebas_en_ci.test.ts` cierra el hueco de las pruebas que se
saltaban bajo `--coverage`. En contra: de seis mutaciones dirigidas, **dos
siguieron verdes con la suite entera**, y las dos caen justo donde peor duele —
una puerta de **autorización** y las **escrituras de dinero**. El ancla del
rubro es explícita: "4 o menos si la suite pasa con la función rota". No se baja
a 4 porque el núcleo del dinero (motor de cuadre, duplicados entre viajes,
guardia de cifras) sí está anclado y sí se puso rojo. No sube a 7 porque el
arreglo histórico documentado como IDOR en `export/pdf` no tiene una sola línea
ejecutada que lo ancle.

**El riesgo mayor del rubro, hoy:** la suite protege el *cálculo* del dinero y
no protege su *borde* — todo lo que decide quién entra y qué se escribe en la
base vive en `route.ts` y en funciones `async` contra Supabase, y ahí la
cobertura es 0%.

Baseline de esta corrida: **388 archivos, 5,045 pruebas verdes, 1 saltada,
80 s** (`npx vitest run`). Con `--coverage`: 78.52% líneas / 84.16% ramas /
84.75% funciones — pasa el umbral con 0.16 puntos de margen en ramas.

## Chequeo de mutación

| # | Función mutada | Qué rompí | Prueba que debía atraparlo | ¿Roja o verde? | Revertido |
|---|---|---|---|---|---|
| M1 | `src/lib/likida/cuadre/engine.ts:661` — `diferencia` | Invertí el signo: `round2(input.anticipo - totalComprobado)` → `round2(totalComprobado - input.anticipo)` | `cuadre/engine.test.ts:54`, `cuadre/propiedades.test.ts:105` (P3, 200 casos sembrados) | **ROJA** — 4 archivos, 5 pruebas | sí (`git checkout`) |
| M2 | `src/lib/auth/guard.ts:95` — `requireVendedor` | Anulé el gate de rol: `if (s.rol !== 'vendedor' && s.rol !== 'superadmin')` → `if (false && …)` | ninguna | **VERDE** — 388/388, 5,045 pruebas | sí (`git checkout`) |
| M3 | `src/lib/likida/duplicados.ts:44` — `entreViajes` | Off-by-one: `viajes.size > 1` → `viajes.size > 2` (deja de ver el duplicado en DOS viajes, que es el caso real) | `duplicados.test.ts` (varios) | **ROJA** — 2 archivos, 7 pruebas | sí (`git checkout`) |
| M4 | `src/lib/likida/facturacion_escritura.ts:404` y `:455` | Borré `if (abono.rechazo) throw` en `registrarPago` **y** `if ((count ?? 0) > 0)` en `cancelarFactura` → `if (false)` | ninguna | **VERDE** — 388/388, 5,045 pruebas | sí (`git checkout`) |
| M5 | `src/lib/likida/cuadre/cifras.ts:160` — `cifrasSinRespaldo` | Valor fijo: `return []` al entrar (todo queda "respaldado") | `cuadre/guardia.test.ts:249` y otras | **ROJA** — 3 archivos, 10 pruebas | sí (`git checkout`) |
| M6 | `src/app/api/v1/viajes/[id]/contribucion/route.ts:73` | Aflojé el área de la llave de API: `abrir(req, 'dinero')` → `abrir(req, 'operacion')` | ninguna | **VERDE** — 388/388 | sí (`git checkout`) |

Árbol verificado limpio después de las seis (`git status` solo con
`docs/auditoria-18/backend.md` y `legal.md`, que son de otros auditores de esta
misma corrida).

## Hallazgos

### [ALTO] La única puerta de /vendedor no tiene una sola prueba: se rompe y la suite no se entera

`src/lib/auth/guard.ts:92-100` (`requireVendedor`) · `src/lib/auth/guard.test.ts`
(cubre `requireSessionTenant` y `requireSuperadmin`; `requireVendedor` y
`exigirVerRuta` no aparecen).

**Escenario (M2, corrido).** Cambié la línea 95 a `if (false && s.rol !== 'vendedor' && s.rol !== 'superadmin')`
y corrí la suite completa: **388 archivos, 5,045 pruebas, todas verdes**. Con esa
línea rota, una sesión de `flota_admin` de una flota cliente entra a `/vendedor`.
Y entra a la versión ancha: `panel-vendedor.tsx:70` calcula
`esVendedor = rol === 'vendedor'`, que para un `flota_admin` es `false`, así que
llama `listarProspectos({})` — sin filtro. `vendedores.ts:303-314` construye esa
consulta con `supabaseAdmin()` y **sin ninguna cláusula de tenant**: devuelve
`empresa, contacto_nombre, telefono, correo, ciudad, vacante, estado` de TODOS
los prospectos. Es el pipeline comercial completo de Likida —incluidas las
flotas competidoras del que está mirando— y datos personales de terceros que
nunca dieron su aviso a ese cliente.

Intenté refutarlo por tres lados y no se cae: `proxy.test.ts:77` exige **sesión**
en las tres secciones, no rol (un `flota_admin` con sesión pasa); el gate está
duplicado en `layout.tsx` y `page.tsx` pero **es la misma función**, así que una
mutación abre las dos; y no existe ninguna prueba estructural que recorra
`src/app/**/route.ts` o los layouts verificando que cada zona tenga su gate
(las que sí recorren archivos —`sin_previews`, `dinero_por_area`,
`pruebas_en_ci`— vigilan otra cosa).

**Consecuencia.** Quien mantenga esto puede refactorizar `requireVendedor` —
extraerlo, invertir una condición, meter el rol nuevo del día — con la suite
entera en verde diciéndole que no rompió nada. `requireSuperadmin`, que es la
puerta hermana y la que sí tiene tres pruebas, es la evidencia de que aquí no se
trata de una decisión sino de un olvido.

**Causa raíz probable.** `/vendedor` (mig. 0105, 14-ago) llegó después de que se
escribiera `guard.test.ts`, y su gate se añadió al archivo sin añadirse al
archivo de pruebas de al lado.

---

### [ALTO] Las dos reglas que impiden cobrar contra nada no tienen arnés

`src/lib/likida/facturacion_escritura.ts:404` (`registrarPago`) y `:455`
(`cancelarFactura`) · `src/lib/likida/facturacion_escritura.test.ts:9-13` declara
explícitamente que las escrituras no se prueban. Cobertura del archivo:
**31.8% de 283 líneas**.

**Escenario (M4, corrido).** Borré las dos guardas a la vez y corrí la suite:
**5,045 pruebas verdes**. Con eso puesto:

- `registrarPago` deja de leer el veredicto que ya calculó una línea antes.
  Una factura emitida de **$11,600 con $10,000 pagados** acepta un abono de
  **$2,000**: quedan **$12,000 cobrados contra $11,600 facturados**, y
  `abono.quedaSaldada` sigue mandando la factura a `pagada`. El sobrepago de
  **$400** no existe en ningún CFDI. Peor: la función pura `evaluarAbono` **sí**
  está probada (`:110-113` afirma que ese caso se rechaza con el saldo exacto en
  el mensaje) — o sea que la prueba verde certifica una decisión que el llamador
  ya no consulta.
- `cancelarFactura` cancela una factura **con pagos encima**. El comentario de
  `:440-443` explica por qué eso no puede pasar ("ese dinero ya contado tiene que
  aclararse primero"); la regla vive solo dentro de la función `async` y nadie la
  ejerce.

**Consecuencia.** La cartera del contralor —lo que se le debe y lo que ya se
cobró— descansa en dos `if` que ninguna prueba toca. Y el patrón engaña: al ver
`facturacion_escritura.test.ts` verde con 149 líneas y casos de centavo y de año
bisiesto, se concluye razonablemente que el módulo está cubierto.

**Causa raíz probable.** La decisión (correcta) de no probar contra un mock de
Supabase se aplicó al bulto: se extrajo `evaluarAbono` a función pura y se probó,
pero no se extrajo el **cableado** (¿se consulta el veredicto? ¿se cuenta antes
de cancelar?), que es lo que aquí se rompe.

---

### [ALTO] Las cuatro rutas de export tienen CERO líneas ejecutadas — y una de ellas documenta un IDOR ya corregido

`src/app/api/export/pdf/[id]/route.ts` (0.0% de **150** líneas),
`export/facturas-proveedor/route.ts` (0.0% de 62),
`export/liquidaciones/route.ts` (0.0% de 43),
`export/bitacora-peaje/route.ts` (0.0% de 40).
`grep -rn "export/pdf" --include="*.test.ts" src/` → **nada**.

**Escenario.** `export/pdf/[id]/route.ts:49-56` cuenta por escrito el bug:
"Faltaba esto y era un IDOR: la ruta autorizaba por SESIÓN y por TENANT, y ahí
se detenía. Cualquier usuario de la flota —incluido un OPERADOR— bajaba el PDF
de la liquidación de cualquier compañero con nada más que el id en la URL". El
arreglo son tres cosas encadenadas: `puedeVerArea(t.rol, 'dinero')` (:68),
`puedeExportar(t.rol)` (:74) y el `.eq('tenant_id', tenantId)` explícito (:87).
Ninguna de las tres se ejecuta en ninguna prueba. Borrar la línea 68 —el gate de
área, que es el que excluye al `encargado`, jefe de tráfico— devuelve el PDF con
anticipo, comprobado y diferencia por viaje a un rol al que la pantalla de al
lado le esconde la gráfica de dinero, y la suite queda en verde. El mismo
párrafo del IDOR está copiado como comentario en `facturas-proveedor` y
`bitacora-peaje`: la lección está escrita cuatro veces y anclada cero.

**Consecuencia.** El repo trata este IDOR como resuelto y documentado. Está
resuelto y **no** está protegido: el próximo refactor de las rutas de export no
tiene nada que se lo impida, y el modo de falla es silencioso (un 200 con un CSV
de más, no una excepción).

**Causa raíz probable.** La cobertura de `src/app/**/*.tsx` se excluye a
propósito y con buen argumento (`vitest.config.ts`), pero el argumento dice
expresamente "las RUTAS de API sí cuentan (`route.ts`, no `.tsx`): llevan HMAC,
filtro por tenant y dinero". El denominador las cuenta; nadie las ejerce.

---

### [MEDIO] El área de la llave de API está declarada en prosa y no atada al código de la ruta

`src/app/api/v1/viajes/[id]/contribucion/route.ts:73` (0.0% de **108** líneas) ·
`src/app/api/v1/openapi/route.ts:343` y `:584`.

**Escenario (M6, corrido).** Cambié `abrir(req, 'dinero')` por
`abrir(req, 'operacion')` y la suite quedó **verde (388/388)**. Con eso, una
llave `lk_live_…` de área `operacion` —la que se le entrega a un TMS o al
tablero del jefe de tráfico— lee `ingreso`, `comprobado`, `contribucion` y
`margenPct` de cada viaje. El OpenAPI que esa misma integración descarga sigue
prometiendo lo contrario, palabra por palabra: "una llave de operación no puede
leer el margen de la flota" (`openapi/route.ts:343`) y "Área `dinero`"
(`:584`). `openapi/route.test.ts:104` sí verifica que cada método HTTP exportado
esté documentado — la existencia de la ruta— pero nada compara el **área que el
spec declara** contra el argumento real de `abrir()`.

Refutación intentada: `_comun.ts` (el que implementa `abrir`) está al 95.2% y su
lógica de áreas sí se prueba. Eso confirma que el mecanismo funciona; no que
esta ruta le pase el argumento correcto. Ninguna de las cinco rutas de datos de
`/v1` tiene archivo de prueba propio (`clientes` y `viajes/[id]` también están
en 0.0%).

**Consecuencia.** El contrato público es el artefacto que el integrador lee y
sobre el que su abogado y el de la flota deciden qué llave entregar. Hoy puede
divergir del código sin que nada avise, y el que diverge en silencio siempre es
el código.

**Causa raíz probable.** El área se escribe dos veces —en el `abrir()` y en la
`description` del spec— y no hay ninguna prueba que las una, aunque el repo ya
tiene la técnica hecha para exactamente esto (`ruta_pdf_sincronizada.test.ts`,
`etiquetas_sincronizadas.test.ts`).

---

### [MEDIO] El lado del ingreso entero —Rentabilidad, Cartera, Cobranza— tiene 3 de 229 líneas ejecutadas

`src/lib/likida/comercial.ts` (**1.3%** de 229 líneas). El único `import` desde
una prueba es de **tipo**: `facturacion_clientes.test.ts:2` importa
`type FacturaRow`. Cero assertions sobre su comportamiento.

**Escenario.** `getRentabilidad` (`:133-163`) alimenta `/dashboard/rentabilidad`,
que es área `dinero` y de las pocas pantallas que le enseñan margen al dueño.
Invertir `contribucion: round2(ingreso - costoComprobado)` a
`round2(costoComprobado - ingreso)` no rompe nada: con **$500,000** de ingreso
capturado y **$380,000** comprobados, la pantalla imprimiría **−$120,000** de
contribución en vez de **+$120,000** —un margen de −24% donde hay uno de +24%—
y las 5,045 pruebas siguen verdes. Lo mismo con el guardia de división entre
cero: `margenPct: ingreso > 0 ? … : null` → `ingreso >= 0` devuelve
`Infinity`/`NaN` para una flota que aún no captura ingresos, que es
**exactamente el estado de toda flota nueva** (`viaje.ingreso_flete` se llena a
mano). El archivo abre declarando la regla del producto —"una cifra o es un
conteo real de la base, o NO SE MUESTRA"— y no hay una sola prueba que la
obligue.

**Consecuencia.** Es un módulo puro salvo por las dos consultas: el reparto
`conIngreso/sinIngreso`, el `round2` y el `null` del margen se prueban sin base
ni mock, igual que se probó `evaluarAbono`. Que esté al 1.3% no es una
limitación técnica, es una ausencia.

**Causa raíz probable.** Nació el 14-ago junto con las pantallas que lo consumen
y se dio por verificado "mirando el render" — que es la regla correcta para la
vista y no sustituye al arnés del cálculo.

## Lo que revisé y está bien

- **El núcleo del dinero SÍ está anclado.** Tres de las mutaciones más
  destructivas que se me ocurrieron se pusieron rojas: invertir el signo de la
  diferencia contra el anticipo (M1: 5 pruebas, entre ellas la propiedad P3 con
  200 casos sembrados, que da el número exacto de la desviación), cegar el
  detector de duplicados entre viajes al caso de dos viajes (M3: 7 pruebas) y
  hacer que la guardia de cifras declare todo respaldado (M5: 10 pruebas). En
  las tres, el mensaje de fallo dice qué se rompió, no solo que algo falló.
- **Ninguna prueba sensible a la hora.** Los 10 `new Date()` de la suite se
  revisaron uno a uno. `actividad.test.ts:17-28` ya trae el arreglo del bug de
  zona horaria documentado (`setHours(0,0,0,0)` antes de `toISOString`).
  `processor_cadena.test.ts:38` y `canal_e2e.test.ts:21` calculan `HOY` en UTC —
  y el motor también (`fecha_dudosa.ts:57`, `ahora.toISOString()`), así que
  coinciden por construcción; además, si la corrida cruzara la medianoche UTC la
  fecha del gasto quedaría *un día atrás* de `fechaMax`, que es dentro de la
  ventana, no fuera. No hay flake.
- **Las dos pruebas de tiempo están bien tratadas.** `duplicados.test.ts:150-193`
  usa mejor-de-nueve con umbral de 20 contra un ~80 histórico, y documenta las
  dos caídas reales del 28-jul que motivaron aflojarlo. `pruebas_en_ci.test.ts`
  es la red que impide que un `skipIf(LIKIDA_COBERTURA)` nuevo se quede sin
  correr en CI, e incluso verifica que el nombre de la bandera en
  `vitest.config.ts` sea el mismo que leen los `skipIf` — el bug del rename del
  12-ago.
- **`arnes_ticket_real.test.ts` ya no gasta sin poder fallar.** Se salta sin
  `TICKET_PATH` (es la única saltada de la suite) y su caso de oro corre gratis
  en CI con `hoy` inyectado.
- **CI.** Corre en `push: ['**']` y en PR, con `concurrency` que cancela lo que
  quedó atrás; tiene puerta de `npm audit --omit=dev --audit-level=high`
  (runtime, no tooling), typecheck, lint, cobertura con umbral y el paso
  separado para las pruebas de tiempo sin instrumentar.
- **`guard.test.ts`** cubre bien las dos puertas que sí prueba, incluido el caso
  que mató el tenant implícito del superadmin (cookie ilegible = no-selección) y
  que la cookie ni se lee en el camino de "ver como".

## Lo que NO alcancé a revisar

- **Mutación en el resto de la superficie.** Seis mutaciones sobre 388 archivos.
  No toqué `liquidacion/pdf.ts`, `cuadre/leyendas.ts`, `cuadre/acreditable.ts`,
  `intake/desglose_peaje.ts` (46.3% de 640 líneas) ni ninguno de los adaptadores
  de facturación.
- **`repo.ts` al 49.0% de 608 líneas** — la frontera única de datos. No busqué
  cuáles de sus 34 funciones exportadas son las que están sin ejecutar.
- **Los 0% restantes** que no son de export ni de `/v1`:
  `api/cron/facturar/cola/route.ts` (54 líneas), `api/dashboard/ingesta/route.ts`
  (46), `lib/agents/copiloto-historial.ts` (86), `lib/likida/conexiones.ts` (89),
  `lib/admin/qa-motor.ts` (4.2% de 355), `lib/likida/wa_pendientes.ts` (2.7%).
- **`supabase/verificaciones.sql`** (5,414 líneas, 110 bloques). Confirmé que los
  bloques llegan hasta la migración 0139 y que hay salidas reales registradas
  hasta el 16-ago (bloques ~92), pero no verifiqué bloque por bloque cuáles se
  han corrido contra la base y cuáles solo están escritos. Sin base en este
  entorno no se pueden ejecutar.
- **`pruebas-manuales/*.prueba.ts` y `vitest.qa.config.ts`** — quedaron fuera por
  la restricción de la corrida (hacen llamadas reales de pago). No sé si el
  ejército de QA nocturno afirma algo o solo imprime, que es el hallazgo ALTO
  que la ronda 5 encontró en `arnes_ticket_real`.
- **Calidad de las assertions en los ~380 archivos que no mutaria.** Barrí
  `toBeDefined`/`toBeTruthy`/`not.toThrow` sobre `src/lib/likida` y `src/lib/auth`
  y no encontré nada flojo en el camino del dinero, pero es un barrido de
  patrón, no una lectura.
