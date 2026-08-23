# Rendimiento y costo — auditoría 18 · continuación 21-ago

**Nota: 3/10** (antes 4). Razón del movimiento: **deuda que cobró factura**. La
ronda 18 dejó escrito que en este repo el reloj y el presupuesto viven *dentro*
de una función y nadie los une con el `maxDuration` de la invocación, y que el
único camino de LLM sin techo de salida era el del modelo caro. Diez días
después entró el subsistema más caro que ha tenido el producto —el piloto de
visión, 381 líneas— **sin un solo reloj, sin un solo `signal`, sin un solo
registro de costo y sin nada que saque de la cola al ticket que ya voló**. No es
que la nota anterior estuviera inflada: es que la advertencia se cumplió, en el
sitio donde más cuesta.

**El riesgo mayor hoy:** con `FACTURACION_PILOTO=si`, un solo ticket puede pedir
**625 s** de techos declarados dentro de una invocación de **300 s**, el cron le
pone **ocho seguidos sin mirar el reloj ni una vez**, y como el piloto **no
emite nunca**, ninguno de esos ocho sale jamás de la cola: se vuelven a volar
cada hora, para siempre, a un costo que **no aparece en ninguna tabla, ningún
log y ninguna pantalla**.

---

## Hallazgos

### [CRÍTICO] Un vuelo del piloto son 625 s de techos contra un `maxDuration` de 300 — y el cron le pone ocho seguidos sin mirar el reloj

`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:138-185` ·
`src/lib/likida/facturacion/agente.ts:223-225,260-278` ·
`src/app/api/cron/facturar/route.ts:33,134,166,540,585,591`

El bucle del piloto son 14 pasos (`PASOS_MAXIMOS`, `piloto_vision.ts:58`) y cada
paso paga cuatro operaciones de navegador, **todas con techo propio y ninguna
con presupuesto compartido**: `inventario()` 4.5 s, `captura()` hasta 23 s (son
DOS disparos: `pagina_playwright.ts:737` y el re-disparo de `:751` cuando el
base64 pasa de 950 000), y la acción 14 s (`uno()` 4.5 + `fill`/`click` 9.5). Son
**41.5 s por paso sin contar el modelo**; ×14 = 581 s, más 21.5 s de `abrir()` y
23 s de la captura final = **625.5 s por UN ticket**.

El piloto **no declara `facturarLote`**, así que `facturarLoteConAgente` cae a
`unoPorUno` (`agente.ts:225`) y vuela los tickets **en serie, con un `for` que
no consulta el reloj ni una vez** (`agente.ts:260`). Los dos chequeos que sí
existen en el cron son *entre flotas* (`route.ts:540`) y *entre portales de una
flota* (`route.ts:585`); **dentro de un `correrLote` no hay ninguno**.

**Escenario:** una flota manda un fajo con ocho tickets de OXXO. Un solo
comercio, una sola flota → un solo `correrLote` (`route.ts:591`) → ocho vuelos
seguidos. Sin necesidad de que ningún techo se toque: son **8 × 14 = 112
llamadas de visión** en una invocación de **300 s** (`route.ts:33`), o sea
**2.68 s por llamada** para cubrir screenshot + inventario + subida de ~700 KB
de imagen + respuesta del modelo + la acción en el DOM. Ninguna de las dos cosas
cabe: ni los 625 s de techos de UN ticket, ni el presupuesto de 2.68 s por paso
de los ocho.

`MARGEN_LOTE_MS = 150_000` (`route.ts:166`) está dimensionado, con el número
escrito en su propio comentario, sobre *«el peor caso medido de UNA sola sesión
de portal … es ~147 s»* — y ese 147 es el del adaptador **escrito** (CAPUFE). La
constante no se movió cuando entró un adaptador cuya sesión vale 4× eso.

**Consecuencia:** Vercel mata la invocación a media sesión de portal. Los
tickets 3 a 8 ya tienen su claim puesto (`al_vuelo.ts:376`) y nadie escribió
nada; a los 10 minutos (`CLAIM_MINUTOS`, `al_vuelo.ts:622`) vuelven a la cola, y
la corrida siguiente repite el mismo corte en el mismo sitio. La cola **no
drena nunca** y cada vuelta se paga entera.

**Causa raíz probable:** `MARGEN_LOTE_MS` y `TOPE_POR_CORRIDA` son las dos
únicas defensas de tiempo del cron y las dos cuentan *sesiones de navegador*,
no *llamadas a un modelo*; el piloto metió 14 llamadas de modelo dentro de lo
que el cron contabiliza como una sesión.

---

### [CRÍTICO] La llamada de visión del piloto es la única de todo el repo sin `signal`: su techo real son los 10 minutos del SDK

`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:364-373` ·
`src/lib/llm/openrouter.ts:23-25,362-370,419-442,493-527` ·
`node_modules/openai/client.js:163,173`

`decidir()` llama `generateStructured` **sin `signal`**. El JSDoc de ese
parámetro (`openrouter.ts:362-368`) dice literalmente qué pasa entonces: *«Sin
esto se cae al default del SDK de OpenAI —10 minutos—»*. Lo verifiqué en el
paquete instalado: `this.timeout = options.timeout ?? DEFAULT_TIMEOUT /* 10
minutes */` y `this.maxRetries = options.maxRetries ?? 2`
(`openai/client.js:163,173`), y el propio `client.d.ts:82-83` advierte que *«los
timeouts de petición se reintentan por default»*. `getClient()`
(`openrouter.ts:23`) no pasa ninguno de los dos.

Lo comprobé contra los otros dos llamadores, que es la refutación obvia: el OCR
pasa `reloj.senal(25_000)` (`intake/ocr.ts:260`) y el redactor de prospectos
pasa `AbortSignal.timeout(30_000)`
(`api/admin/mapa-prospectos/mensaje/route.ts:88`). **El piloto es el único de
los tres sin techo.**

**Escenario:** el proveedor de visión acepta la conexión y no contesta en el
paso 3. Un `attempt()` = 600 s × 3 (los dos reintentos del SDK) = **1 800 s**, y
`generateStructured` encadena hasta cuatro `attempt` (original, reintento por
truncamiento con `tope × 2`, reintento con nota, fallback de proveedor:
`:494-524`). **Contra un `maxDuration` de 300 s** (`cron/facturar/route.ts:33`)
la primera llamada colgada ya se lleva la invocación entera, **con el navegador
abierto y el formulario a medio llenar**.

**Consecuencia:** la invocación muere sin respuesta. QStash reintenta dos veces
sobre el fallo —el propio archivo lo dice, `route.ts:708`— así que el mismo lote
se vuela **tres veces**, pagando cada paso de visión que sí alcanzó a
responder antes del cuelgue. Y como el que muere es el proceso, el `finally` de
`conNavegador` que cierra Chromium (`pagina_playwright.ts:1144`) tampoco corre.

**Causa raíz probable:** el piloto se escribió contra el contrato de
`generateStructured` mirando `schema`, `images` y `maxTokens`, y `signal` es
opcional en la firma — el único de los tres campos de seguridad que no rompe la
compilación si falta.

---

### [CRÍTICO] El piloto no emite nunca, así que su ticket no sale nunca de la cola: el costo es por HORA, no por ticket

`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:119-122,250-257` ·
`src/lib/likida/facturacion/agente.ts:274` ·
`src/lib/likida/facturacion/al_vuelo.ts:492-497` ·
`src/app/api/cron/facturar/route.ts:304-320`

La regla 1 del piloto es que **nunca aprieta el botón que emite**, ni con
`FACTURACION_MODO=emitir` (`piloto_vision.ts:119-122`). O sea que un vuelo
perfecto devuelve `ok:true` **sin `cfdiUuid`**. Río abajo:
`incluido = r.ok && (modo === 'ensayo' || Boolean(r.cfdiUuid))`
(`agente.ts:274`), y después `if (!p.incluido || !p.cfdiUuid) → facturado:false`
(`al_vuelo.ts:492`). **En los dos modos el gasto se queda sin `cfdi_uuid`.**

La consulta de la cola es `.is('cfdi_uuid', null)` + `.is('autofactura_bloqueada_en', null)`
(`route.ts:307,314`). Un vuelo bueno no bloquea nada (`motivoDeBloqueo` solo
dispara con CAPTCHA o emisión sin confirmar, `al_vuelo.ts:600-607`) y **no hay
columna de intentos ni tope de reintentos en ninguna parte de esa consulta**. El
ticket vuelve **cada hora, indefinidamente**.

**Escenario, con el precio del propio repo** (`openrouter.ts:151`,
`anthropic/claude-sonnet-5` = $2/$10 por millón): un vuelo de 8-14 pasos —el
rango que declara `models.ts:123`— cuesta **$0.09–$0.15**. Ocho vuelos por
corrida = **$0.88**. Veinticuatro corridas al día = **$21/día**, **~$634/mes**,
para **UNA flota chica** y **sin haber emitido un solo CFDI**. Contra la banda
que este repo usa para fijar su precio: **$0.03–$0.05 por liquidación completa**
(`models.ts:17`). **Un vuelo del piloto vale entre 2 y 5 liquidaciones enteras,
y se repite 24 veces al día sobre el mismo ticket.** El 1-sep-2026 vence la
tarifa intro y el mismo comentario del repo manda revertir a $3/$15: los
$634/mes pasan a **~$972/mes**.

**Consecuencia:** el gasto no está acotado por el trabajo hecho sino por el
reloj de pared. Y no compra nada: el ticket sigue sin CFDI al final del día, del
mes y del año.

**Causa raíz probable:** la cola se diseñó para un adaptador que termina en
`cfdi_uuid` o en `autofactura_bloqueada_en`; el piloto introdujo un tercer
final —«llenó y se detuvo a propósito»— que no es ninguno de los dos y que
por eso el filtro lee como «pendiente».

---

### [ALTO] El gasto más grande del producto no se registra en ningún lado: la consola de costo de Javier muestra $0

`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:364` ·
`src/lib/admin/consumo.ts:10-13` ·
`src/lib/likida/agentes/corridas.ts:70` ·
`src/app/api/cron/facturar/route.ts:719-732`

`decidir()` escribe `const { data } = await generateStructured<AccionPiloto>({…})`
(`:364`). `generateStructured` devuelve además `cost`, `tokensIn`, `tokensOut` y
`model` (`openrouter.ts:375`) — **los cuatro se tiran en la desestructuración**.
No hay `registrarCosto` en ningún archivo de `facturacion/` (lo verifiqué con
grep sobre todo `src/`: los únicos llamadores son `api/dashboard/chat/route.ts`
y `processor.ts`), y `logger.info('piloto.paso', …)` (`:153`) registra `tipo`,
`selector` y `veo` — **ni un token ni un dólar**.

`/admin/consumo` lee **exactamente dos fuentes** y lo dice en su encabezado
(`consumo.ts:10-13`): `llm_costo` y `agente_corrida.costo_usd`. El piloto no
escribe en la primera, y en la segunda tampoco: `registrarCorrida` acepta
`costo_usd: c.costoUsd ?? null` (`corridas.ts:70`) y la llamada del cron
(`route.ts:720-732`) **no pasa `costoUsd`**.

**Escenario:** la palanca se enciende para el demo. La flota gasta $21/día en
visión (hallazgo anterior). `/admin/consumo` sigue mostrando el gasto de OCR y
cuadre y **$0.00 de facturación**; el `techoDiaUsd` que la pantalla pinta
(`consumo/page.tsx:130-137`) es el del runner de back office y no cubre este
camino. La primera señal es la factura de OpenRouter a fin de mes.

**Consecuencia:** el rubro que define este producto —«el costo por operación
está medido»— se rompe justo donde el costo por operación es 100× el de
cualquier otro camino. Es la misma clase de fallo que `openrouter.ts:161-170`
describe para un modelo sin precio (*«una liquidación que parecía gratis»*),
salvo que aquí no es la tabla la que falta: es la escritura.

**Causa raíz probable:** el piloto se registró como `AdaptadorPortal`, y la
interfaz de un adaptador de portal no tiene por dónde devolver un costo —los
adaptadores escritos cuestan $0.

---

### [ALTO] Con la palanca puesta, hasta 20 de los 37 comercios dejan de avisarle al encargado, y la máquina tampoco los factura

`src/lib/likida/facturacion/adaptadores/registro.ts:184-198` ·
`src/lib/likida/facturacion/avisar.ts:68` ·
`src/lib/likida/facturacion/enrutar.ts:138`

`portalesOperables()` devuelve los escritos **más los pilotables** cuando la
palanca está puesta (`registro.ts:194-198`), y `avisar.ts:68` usa esa misma
función como `sabeOperarlo`. Conté los pilotables ejecutando el filtro real de
`registro.ts:184-186` contra `COMERCIOS`: **20 de 37** (10 sin `requiereCuenta`,
que entran de inmediato; 10 más en cuanto la flota comparta su cuenta en el
cofre).

**Escenario:** hoy esos 20 salen por `enrutar → 'sin_robot'`
(`enrutar.ts:138`) y el encargado recibe la liga y los datos, y factura *«en un
minuto»* —lo dice el propio mensaje. Con `FACTURACION_PILOTO=si`, los 20 pasan
a `via: 'automatico'`, **el aviso deja de salir**, y la máquina que los toma
nunca emite (hallazgo anterior). El ticket queda con **cero personas y cero
CFDI**, quemando $0.09–$0.15 por hora cada uno.

**Consecuencia:** el plazo para facturar vence (`enrutar.ts:99` lo comprueba, y
cuando venza el ticket sale como `incompleto`). El IVA no acreditado y el gasto
no deducible los paga la flota, y la única huella es un `autofactura.ensayo` de
nivel `info` por hora — el mismo renglón que se escribe cuando todo va bien.

**Causa raíz probable:** `portalesOperables()` responde «¿lo voy a intentar?» y
`avisar.ts` la usa para responder «¿lo voy a lograr?». Con adaptadores escritos
las dos preguntas tenían la misma respuesta.

---

### [ALTO] `resolverCuentaOficina` entra al camino caliente del chofer sin `acotada` (REINCIDENTE)

`src/lib/likida/processor.ts:739-745` · `src/lib/likida/contactos.ts:54-61`

La ronda 18 reportó nueve consultas del camino caliente sin techo y dio el
razonamiento de `TOPE_CONSULTA_MS` (*«con 8 s la invocación sobrevive a TRES
colgadas»*). El commit `d432e89` **añadió una décima**, y en el peor sitio
posible: `resolverCuentaOficina(msg.from)` corre ahora para **todo mensaje de
texto de un chofer** (`processor.ts:739`), no solo en la rama `!op` donde vivía
antes. `contactos.ts:54` la escribe con `supabaseAdmin()` en crudo — cero
`acotada(` en todo el archivo, verificado con grep.

**Escenario:** el chofer escribe «listo». La consulta cae al default de undici:
**300 000 ms contra un `maxDuration` de 120** (`webhook/whatsapp/route.ts:80`).
Corre **antes** del mutex, del agente y del cierre, así que el turno muere sin
haber escrito nada — y con el CRÍTICO reincidente del claim envenenado
(`processor.ts:555`, `conv.ts:343-353`), ese «listo» se pierde para siempre.

Si además el número es un dueño-que-maneja, `atenderTextoOficina`
(`processor.ts:443,765`) suma dos `acotada` más antes de seguir
(`despacho_wa.ts:62`, `asignar_wa.ts:241`): **+19 s de techo** sobre la cadena 1.
El caso típico solo sube **+0.9 s** (91.3 → 92.2 s contra 120), así que la
cadena 1 sigue cabiendo; lo que se degradó es el margen contra consultas lentas,
que era el único colchón que esa cadena tenía.

**Causa raíz probable:** la misma que la ronda 18 nombró — no hay prueba ni
regla de lint que exija `acotada` en un `supabaseAdmin()` nuevo, a diferencia de
`toLocaleString('es-MX')`, que sí tiene su prueba guardiana.

---

### [MEDIO] El loop-guard del piloto solo mira el paso anterior: una oscilación A→B→A→B paga los catorce pasos

`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:169-173`

`const firma = …; if (firma === anterior)` compara **únicamente contra el paso
inmediatamente anterior**. Dos acciones alternándose no se detectan nunca. El
comentario del propio bloque dice la razón por la que existe —*«cada vuelta
cuesta una llamada de visión»*— y esa razón se cumple igual en la oscilación.

**Escenario:** el portal repinta el formulario al escribir el RFC (patrón normal
en los que cargan catálogos por AJAX), así que el modelo alterna «escribe RFC» y
«escribe CP» sin converger. El guard no dispara nunca; el vuelo gasta los **14
pasos completos** —$0.15 al precio de hoy, $0.24 desde el 1-sep— y termina en el
error de `:188` sin haber facturado nada. Se repite cada hora (ver el CRÍTICO de
la cola).

**Consecuencia:** el caso de no-convergencia, que es el que el piloto va a
encontrar en un portal que nadie mapeó, es también el que paga el techo
completo. Contra el `LoopGuardError` del ciclo de tools —que corta **antes** de
gastar la ronda (`openrouter.ts:792-794`)—, éste corta después.

**Causa raíz probable:** el guard se escribió contra el modelo que se atora
repitiendo, que es un modo de falla de un solo paso de memoria.

---

### [MEDIO] Quince capturas `fullPage` por vuelo, sin tope de dimensión y sin caché de prompt

`src/lib/likida/facturacion/adaptadores/pagina_playwright.ts:511,726-755` ·
`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:151,193,370` ·
`src/lib/llm/openrouter.ts:686-693`

`capturaCompleta` es `true` por default (`:728`), así que cada captura es la
**página entera**. El único tope es de **tamaño**, no de dimensión:
`MAX_CAPTURA_B64 = 950_000` caracteres = **712 KB de JPEG** (`:511`), y pasarse
cuesta un **segundo disparo completo** de hasta 11.5 s (`:751`).

**Escenario:** un vuelo de 14 pasos toma **15 capturas** (`:151` una por paso más
la final de `:193`) y sube **14** al modelo. A 712 KB de tope son **hasta 10 MB
subidos por ticket** y **~78 MB por corrida de ocho**; ~1.9 GB al día con el cron
horario. Del lado de los tokens: sin `cache_control` —`openrouter.ts:692` solo lo
pone en `generateWithTools`, no en `generateStructured`— el bloque `system` del
piloto (~550 tokens, `piloto_vision.ts:325-350`) se **vuelve a pagar 14 veces por
vuelo**: 13 × 550 × $2/M = **$0.014 por vuelo tirados**, ~9 % del costo del vuelo.

**Consecuencia:** el eslabón más caro en tiempo de cada paso no es el modelo, es
la captura (23 s de techo contra 4.5 del inventario), y es el único de los
cuatro que se puede recortar sin perder la evidencia que el modo `ensayo`
necesita.

**Causa raíz probable:** `capturaCompleta: true` se eligió para que la tabla de
CAPUFE cupiera en la evidencia de un ensayo humano; el piloto reusó la misma
captura para alimentar a un modelo, que es otro consumidor con otras
necesidades.

---

### [MEDIO] El analista entra al camino del chofer con un timeout literal que no consulta el presupuesto

`src/lib/likida/processor.ts:443,765` · `src/lib/likida/oficina_wa.ts:157-167`

`atenderTextoOficina(..., { incluirPreguntaLibre: !viajeId })` (`:765`) permite
que un dueño-que-maneja **sin viaje abierto** caiga en `atenderPreguntaLibre`,
que llama `ejecutarAnalista` con **`timeoutMs: 35_000` escrito a mano**
(`oficina_wa.ts:166`) y precedido de una consulta a `tenant` **sin `acotada`**
(`:159`).

**Escenario:** el dueño escribe «¿en qué quedó lo de ayer?» sin viaje abierto.
La cadena del webhook suma preámbulo (~2.5 s) + `resolverCuentaOficina` (0.3 s
típico / **sin techo**) + despacho y asignación (2 × 9.5 s de techo) + el
`tenant` sin techo + **35 s del analista** = **66.3 s de techo** contra los 120
del webhook. Cabe hoy, pero **los 35 s son un literal, no `reloj.acotar(35_000)`**:
el reloj del presupuesto existe en esa misma función (`processor.ts:579`) y no
se le pasa. Es el mismo patrón exacto que la ronda 18 reportó en el copiloto.

**Consecuencia:** el único camino del webhook que llama a un modelo fuera del
agente del cuadre es también el único que no descuenta del presupuesto. Si
mañana se mueve delante de más eslabones, el desbordamiento no lo va a avisar
ningún `alcanza()`.

**Causa raíz probable:** `atenderTextoOficina` se extrajo para poder llamarse
desde dos sitios, y en la extracción no viajó el parámetro que el segundo sitio
sí tenía a mano: el reloj.

---

## La suma a mano del peor caso

### A — UN vuelo del piloto de visión (un ticket)

Todos los techos salen del código; «+1.5» es `GRACIA_TOPE_MS`
(`pagina_playwright.ts:132`), que es lo que de verdad dispara la red de
seguridad de `acotar()` (`:538`).

| # | Eslabón | Techo (s) | Fuente | Acum. |
|---|---|---|---|---|
| 0 | `SesionNavegador.abrir` (Chromium) | 31.5 | `TOPE_LANZAR_MS` 30 000 (`:123,1018-1021`) | *una vez por FLOTA* |
| 1 | `pagina.abrir(portal)` | 21.5 | `TOPE_NAVEGAR_MS` 20 000 (`:84,642`) | 21.5 |
| 2 | `inventario()` × paso | 4.5 | `acotar(TOPE_LECTURA_MS 3 000)` (`:838`) | |
| 3 | `captura()` × paso, **2 disparos** | 23.0 | `TOPE_CAPTURA_MS` 10 000 × 2 (`:737,751`) | |
| 4 | `decidir()` × paso | **sin techo** | `piloto_vision.ts:364` no pasa `signal`; SDK 600 s × 3 reintentos | |
| 5 | `ejecutar()` × paso (`uno()` + acción) | 14.0 | `acotar(3 000)` (`:929`) + `acotar(8 000)` (`:680,685`) | |
| — | **subtotal por paso, SIN el modelo** | **41.5** | | |
| 6 | × `PASOS_MAXIMOS` = 14 | 581.0 | `piloto_vision.ts:58,138` | 602.5 |
| 7 | captura final | 23.0 | `piloto_vision.ts:193` | **625.5** |

**Límite: 300 s** (`cron/facturar/route.ts:33`). **NO CABE por 2.1×, con UN solo
ticket y sin contar el modelo.** El margen que el cron cree tener
(`MARGEN_LOTE_MS = 150 000`, `:166`) está dimensionado sobre «~147 s el peor caso
de UNA sesión» del adaptador **escrito**.

### B — La corrida completa, sin tocar un solo techo

| Magnitud | Valor | Fuente |
|---|---|---|
| Tickets por corrida | 8 | `TOPE_POR_CORRIDA` (`route.ts:134`) |
| Vuelos por ticket | 1, en serie | `agente.ts:225,260` (`unoPorUno`; el piloto no declara `facturarLote`) |
| Chequeos de reloj dentro de `correrLote` | **0** | `agente.ts:260-278` |
| Llamadas de visión por corrida | **112** | 8 × 14 |
| Presupuesto por llamada | **2.68 s** | 300 s ÷ 112 |

Esos 2.68 s tienen que cubrir: screenshot de la página entera, `evaluate` del
inventario, subida de hasta 712 KB de imagen, respuesta del modelo y la acción
en el DOM. **No cabe ni en el camino feliz.**

### C — Reverificación de los tres números de la ronda 18

| Cadena | Ronda 18 | Hoy | ¿Cambió? |
|---|---|---|---|
| Un «listo» solo (chofer normal) | 91.3 s / 120 | **91.6 s** / 120 | +0.3 s: `resolverCuentaOficina` (`processor.ts:740`) entró al camino de todo texto. Sigue cabiendo. |
| Un «listo» de un dueño-que-maneja | (no existía) | **92.2 s** típico / **+19 s** de techo nuevo | dos `acotada` más (`despacho_wa.ts:62`, `asignar_wa.ts:241`). Cabe; el colchón se encogió. |
| Ráfaga de 6 fotos, `conPool(…,5,…)` | 124.6 s / 120 | **124.6 s** / 120 | **igual, sigue sin caber**. `webhook/whatsapp/route.ts` no se tocó en el delta y el camino de foto de `processor.ts` tampoco (`intake/rafaga.ts` solo cambió el texto del mensaje). |
| Cron `wa-pendientes`, `LOTE = 10` | 623 s / 120 | **623 s** / 120 | **igual, sigue sin caber**. `cron/wa-pendientes/route.ts` no aparece en `git diff 8d608a4..HEAD -- src/`. |

---

## El costo por operación del piloto de visión

**Fuente del precio:** `src/lib/llm/openrouter.ts:151` —
`'anthropic/claude-sonnet-5': [2, 10]`, con la nota del propio archivo *«intro
VIGENTE hasta 31-ago-2026; revertir a [3,15] después»*. El rol se eligió en
`models.ts:124`. **Faltan diez días para el +50 %.**

| Concepto | Cantidad | Fuente |
|---|---|---|
| Capturas por vuelo | 15 (14 al modelo + 1 final) | `piloto_vision.ts:151,193` |
| Llamadas de visión por vuelo | 8–14 | `models.ts:123`; tope `PASOS_MAXIMOS` (`:58`) |
| Entrada por paso: `system` | ~550 tok, **repagados 14 veces** (sin `cache_control` en `generateStructured`) | `piloto_vision.ts:325-350`; `openrouter.ts:686-693` |
| Entrada por paso: inventario + texto visible + historial | ~2 500–3 500 tok | `piloto_vision.ts:352-362`; `texto` recortado a 1 800 chars (`pagina_playwright.ts:834`) |
| Entrada por paso: la captura | ~1 000–1 600 tok (tope de tamaño 712 KB) | `MAX_CAPTURA_B64` (`pagina_playwright.ts:511`) |
| **Entrada total por paso** | **~4 000–5 600 tok** | |
| Salida por paso | ~100–150 tok (tope 700) | `piloto_vision.ts:371`; schema `Accion` (`:74-86`) |
| **Costo por paso** | **$0.011** hoy · **$0.017** desde el 1-sep | 4 800 × $2/M + 150 × $10/M |
| **Costo por vuelo (8–14 pasos)** | **$0.09–$0.15** hoy · **$0.13–$0.24** después | |
| Costo por corrida (8 tickets) | **$0.88** hoy · **$1.35** después | `TOPE_POR_CORRIDA` (`route.ts:134`) |
| Costo por día (cron horario) | **$21** hoy · **$32** después | 24 corridas |
| Costo por mes, **una** flota | **~$634** hoy · **~$972** después | |

**Contra qué se compara:**

| Referencia | Cifra | Fuente |
|---|---|---|
| Banda con la que este repo fija su precio | **$0.03–$0.05 por liquidación COMPLETA** | `models.ts:17`, repetida en `docs/escala-15k.md:227` |
| Un adaptador de portal escrito | **$0.00 por corrida** | `piloto_vision.ts:24` |
| Un vuelo del piloto | **2–5 liquidaciones enteras** | derivado de las dos filas de arriba |
| Y ese vuelo se repite | **24 veces al día, indefinidamente** | ver el CRÍTICO de la cola |
| Registrado en `llm_costo` | **$0.00** | `piloto_vision.ts:364` tira el `cost` |

Egress, por si importa para el plan: 14 imágenes × hasta 712 KB = **10 MB por
ticket**, **78 MB por corrida**, **~1.9 GB/día**.

---

## Estado de los hallazgos abiertos de la ronda 18

Ninguno se cerró en el delta. Verificados uno por uno contra el árbol de hoy:

| Hallazgo (ronda 18) | Estado | Verificación |
|---|---|---|
| CRÍTICO — presupuesto por mensaje vs `maxDuration` por invocación | **abierto y agravado** | `crearPresupuesto` sigue en `processor.ts:579`; el piloto añade un tercer llamador que ni siquiera crea reloj |
| CRÍTICO — mensaje matado a media corrida, envenenado por su claim | **abierto** | `claimMessage` sigue en la primera línea (`processor.ts:555`); `conv.ts:343-353` intacto |
| ALTO — el mutex del viaje sin techo | **abierto** | `conv.ts:426` sigue siendo `admin.rpc('try_lock_viaje', …)` sin `acotada` |
| ALTO — nueve consultas del camino caliente sin techo | **abierto y a diez** | `acotada(` = 0 en `wa_pendientes.ts`, `interruptores.ts`, `avisar_cierre.ts` y `contactos.ts`; se sumó `resolverCuentaOficina` |
| ALTO — `MARGEN_CIERRE_MS` ya rebasado | **abierto** | `presupuesto.ts:72` y `PASOS_CIERRE` sin tocar |
| MEDIO — el camino de LLM sin techo de salida es el del modelo caro | **abierto y peor** | `run.ts:48-57` sigue sin `maxTokens`; el piloto añade un segundo camino caro, y sin `signal` |
| MEDIO — la bandeja durable inserta N veces en serie antes del 200 | **abierto** | `wa_pendientes.ts:43-65` sin tocar |
| MEDIO — el copiloto necesita 21.3 s más de los que tiene | **abierto** | `admin/copiloto/route.ts:47` sigue en `maxDuration = 60` |
| BAJO — `maxDuration = 600` contra un techo verificado de 300 | **abierto** | `cron/facturar/cola/route.ts:12` sigue en 600 |

---

## Lo que revisé y está bien

- **La palanca es opt-in y hay interruptor.** `FACTURACION_PILOTO` está vacía por
  default (`.env.example:309`) y `pilotoHabilitado()` exige la palabra exacta
  (`registro.ts:180`); además el cron respeta `estaApagado('agente:facturas')`
  (`route.ts:280`). Nada de lo de arriba está corriendo hoy — pero está a un
  campo de texto del panel de Vercel, y el guion del demo lo pide
  (`docs/demo-facturacion-lunes.md:101`).
- **`credencialesDePortales` se lee una vez por flota, no por ticket**
  (`route.ts:554`, `cuentas.ts:66-95`) y solo con la palanca puesta. Busqué el
  N+1 obvio del cofre y no está.
- **El chequeo de reloj entre portales de una flota sí existe**
  (`route.ts:585`), y su comentario cita correctamente el hallazgo de la
  auditoría 12 que lo puso ahí. El hueco es el nivel de abajo (entre tickets del
  mismo portal), no éste.
- **`acotar()` de `pagina_playwright.ts:524-545` es correcto**, incluido el
  `p.catch(() => {})` que evita el `unhandledRejection` cuando gana la red de
  seguridad. Cada tope está justificado como múltiplo de lo típico y es
  ajustable por entorno. El problema no es el mecanismo: es que 14 pasos × 4
  topes no caben en la invocación que los contiene.
- **La captura no tumba el vuelo** (`capturaSegura`, `piloto_vision.ts:218-224`)
  y el `finally` cierra la pestaña (`:209`). El navegador se cierra en
  `conNavegador` (`pagina_playwright.ts:1144`) pase lo que pase — salvo muerte
  por `maxDuration`, que es el caso del segundo CRÍTICO.
- **`generateStructured` cobra los intentos fallidos** (`openrouter.ts:412-417,
  449-451`). Si el piloto registrara su costo, lo registraría bien. La
  contabilidad está; lo que falta es la escritura.
- **El redactor de prospectos está acotado por los dos lados**: `rateLimit` de
  120/hora (`mapa-prospectos/mensaje/route.ts:51`) y `AbortSignal.timeout(30_000)`
  (`:88`), con `maxTokens: 900` (`:86`) y el costo en el log con tokens y modelo
  (`:102-105`). El comentario del encabezado explica por qué no entra a
  `llm_costo` y la razón se sostiene. **Es exactamente lo que el piloto no hace.**
- **`prospectos-mapa.ts`**: los +126 son lectura pura (`getDetalleProspecto`,
  una consulta con dos embeds y `exigir()`), sin LLM y sin bucle. Los tres
  derivados nuevos son columnas GENERADAS que se leen, no se recalculan. Con 96
  prospectos censados no hay número que reportar.

## Lo que NO alcancé a revisar

- **Nada de esto se ejecutó.** Sin `.env`, sin base, sin red hacia proveedores y
  con `npm run build` prohibido. Todo se sostiene por lectura de código y por
  las constantes que el propio repo declara. En particular: **el repo no tiene
  una sola latencia medida de una llamada de visión**, así que la columna de
  costo usa el tope de tokens y el precio escritos en el código, y la de tiempo
  usa únicamente techos declarados. La única cifra empírica de todo el rubro
  sigue siendo la de `pagina_playwright.ts:30-39` (arranque de Chromium y sesión
  de portal, medidos en una Mac, no en el contenedor).
- **El tamaño de la función con Chromium adentro.** `pagina_playwright.ts:1163-1167`
  declara 67 MB de `@sparticuz/chromium` + 13 MB de `playwright-core` contra un
  límite de 250 MB sin comprimir, y ~190 MB descomprimidos en `/tmp`. No verifiqué
  el bundle real, y ahora hay 20 comercios pilotables más en el camino.
- **El arranque en frío del cron de facturación.** Chromium se descomprime la
  primera vez dentro de los mismos 300 s. `TOPE_LANZAR_MS` son 30 s; si la
  descompresión no cabe ahí, el fallo entra por `falloDeArranque` (503) y no por
  el reloj. No lo pude medir.
- **`/api/dashboard/chat` (el analista) e `ingesta`/`archivo`** — `maxDuration = 60`
  cada una, sin sumar. Sigue pendiente de la ronda 18, y ahora el analista
  además cuelga del camino del chofer (`processor.ts:765`).
- **Las ~31 páginas del `/dashboard` y las de `/admin`**: ninguna declara
  `maxDuration`. Sigue igual que ayer.
- **`api/admin/mapa-prospectos/mensaje/route.ts` no declara `maxDuration`** y su
  cadena es 30 s de modelo + dos consultas sin `acotada` (`:70`, `:91`). Cabe en
  cualquier default razonable, pero el número no está escrito en ningún archivo
  del repo.
