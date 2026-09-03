# Rendimiento y costo — auditoría 25

**Nota: 5/10** (antes 6). Razón del movimiento: **deuda que cobró factura**. El
ALTO de la 24 sobre `PASOS_CIERRE` se reportó cuando vivía en una rama; hoy
`git` lo pone en `master` (`processor.ts:4266` y `:4338` existen, la tabla
sigue en 18 renglones y la prueba sigue exigiendo 18). Nada de mi rubro se
tocó en los 7 commits desde la 24 — o sea que los cinco abiertos siguen
abiertos por construcción — y la mirada más profunda de esta vuelta encontró
dos ALTOS nuevos del mismo tamaño: un cron cuyo bucle interior no mira el
reloj y **no cabe en su propio `maxDuration`** por un factor de 6×, y el
**costo por liquidación declarado ($0.05) contradicho por la medición que el
propio repo escribió** ($0.144 de entrada sola) — con el agravante de que ese
número declarado es el que DERIVA el techo diario de IA de cada flota.

El riesgo mayor hoy: **la cifra de dinero por operación no está medida, está
declarada**, y de ella cuelga el freno que corta el servicio del chofer
(`budget.ts:235`). Si el declarado va 2.9× corto, el freno de una flota a
escala de plan se dispara antes del mediodía — que es exactamente el fallo que
la 24 creyó cerrar.

---

## La aritmética

### 1. El presupuesto de tiempo del cierre del webhook

`maxDuration = 120 s` (`webhook/whatsapp/route.ts`, atado por prueba a
`PRESUPUESTO_WEBHOOK_MS`, `presupuesto.ts:259`).

| | escrito en `presupuesto.ts` | real hoy en `processor.ts` |
|---|---|---|
| pasos de red del cierre | **18** (`:87-110`) | **20** (los dos `sellarEntregaLiquidacion` de `:4266` y `:4338`) |
| `COSTO_CIERRE_MS` (nominal) | 14.0 s | 14.6 s |
| `MARGEN_CIERRE_MS` (lo que `restante()` le quita al agente) | 39.0 s | 39.6 s |
| `MARGEN_CIERRE_CRITICO_MS` (la puerta de `:4046`) | 29.5 s | 29.5 s (sin cambio: los sellos no son `critico`) |
| `TECHO_CIERRE_MS` (los pasos a su techo duro) | 173.5 s | **192.5 s** |

Comprobación de la suma escrita: 5 envíos × `TECHO_ENVIO_WHATSAPP_MS` (10 s) +
13 consultas × `TECHO_PASO_CONSULTA_MS` (9.5 s) = 50 + 123.5 = **173.5 s**. Con
los dos sellos, 15 consultas → 50 + 142.5 = **192.5 s**.

### 2. El peor caso de una nota de voz (capa E1)

| | valor | de dónde |
|---|---|---|
| precio del rol `transcripcion` | `[0.3, 2.5]` $/M | `models.ts:149` → `openrouter.ts:194` |
| `maxTokens` de salida | 1 000 | `voz_transcrita.ts:113` |
| tope por corrida | **$0.50** | `budget.ts:357` (`LIKIDA_LLM_RUN_BUDGET_USD`) |
| reserva | `(N_chars_base64 × 0.3 + 1 000 × 2.5) / 1e6` | `openrouter.ts:622` + `:505` |
| N que agota el tope | 1 658 333 chars ⇒ **1.24 MB de audio crudo** | despeje |
| costo REAL de esa llamada | ≈ **$0.0008** (audio se cobra por segundo, ~32 tok/s) | tarifa del modelo |
| error del estimador | **≈ 600×** | |

### 3. El ciclo de la descarga masiva del SAT

| | valor | de dónde |
|---|---|---|
| `maxDuration` del cron | 300 s | `cron/descarga-sat/route.ts:12` |
| margen para latir y responder | 20 s | `route.ts:81` |
| `venceEn` | inicio + **280 s** | `route.ts:82` |
| último punto donde se mira el reloj | ANTES de `prov.descargar` | `ciclo.ts:557` |
| viajes de red por CFDI nuevo sin pareja | **3** (sello + `saveCfdiXmlRaw` + `marcar`) | `ciclo.ts:252, 316, 317` |
| viajes por CFDI que sí casa | **4** (+ `ligar`) | `ciclo.ts:293-296` |
| costo nominal de un viaje de red | 0.3 s / techo 9.5 s | `presupuesto.ts:83, 88` |
| **CFDI que caben en la vuelta** | 280 / (3 × 0.3) = **≈ 311** | |
| tamaño de un paquete del SAT | «un ZIP con **miles** de CFDI» | `ciclo.ts:46-47`, palabras del propio archivo |
| paquetes por corrida | 3 | `ciclo.ts:57` |

⇒ **un paquete real no cabe**: 2 000 CFDI × 0.9 s = **1 800 s contra 300**.

### 4. El costo por liquidación

| | valor | de dónde |
|---|---|---|
| declarado | **$0.05** / liquidación, «la banda alta de la arquitectura (jul-2026)» | `models.ts:238-239, 253` |
| medido (4-ago-2026, 4 liquidaciones reales) | entrada crece a **21 224 tokens/ronda**; una liquidación de 21 comprobantes reenvía **~72 000 tokens de entrada en 8 vueltas** | `openrouter.ts:899-903` |
| precio del rol `cuadre` | `anthropic/claude-sonnet-5` `[2, 10]` $/M | `models.ts:74` → `openrouter.ts:207` |
| entrada sola, con la cifra medida | 72 000 × $2/1e6 = **$0.144** | |
| lo que la caché rescata | system = 6 241 chars ≈ **1 560 tokens** (medido por mí importando `getSystemPrompt('liquidacion')`); 7 lecturas × 1 560 × 0.9 × $2/1e6 = **$0.0197** | `openrouter.ts:917-921` |
| entrada neta | **≈ $0.125** | |
| salida (~600 tok × 8 rondas × $10/1e6) | ≈ $0.048 | |
| **total ≈** | **$0.17** contra **$0.05** declarado (**3.4×**) | |

Y de ese $0.05 cuelga el freno:

    topeDerivadoDelPlan(15 000 viajes/mes)
      = (15 000 / 30) × COSTO_ESTIMADO_USD.viajeCompleto
      = 500 × (0.05 + 3 × 0.0016) = 500 × 0.0548 = $27.40 / día     (budget.ts:235)

    gasto real de ese mismo día, con la medición del repo:
      500 × (0.17 + 3 × 0.0016) = $87.4 / día

⇒ el techo de la flota se agota al **31 %** del día.

### 5. Los cortes de 1 000 filas de PostgREST

`max_rows` = 1 000 (`pg.ts:38-48`, y el repo lo repite en
`desglose_peaje.ts:651, 775` y `export/facturas-proveedor/route.ts:73`).
PostgREST aplica `min(limit, max_rows)`, así que **todo `.limit(5000)` es un
`.limit(1000)` mudo**:

| sitio | ventana | ¿pasa de 1 000? |
|---|---|---|
| `ingenieria.ts:1193` (`agente_corrida`, costo por agente) | 7 días | sí: ~34 agentes × 6 pasadas/día = 204/día = **1 428/semana**, más una fila por turno de `liquidacion` (`tools.ts:297, 441`) |
| `sat_descarga/ciclo.ts:178` (`gasto` sin CFDI) | 31 días, una flota | sí a la primera flota de verdad |

---

## Hallazgos

### [ALTO] La nota de voz sigue reservando por BYTE: 1.24 MB de audio agotan el tope de $0.50 y el chofer en emergencia oye «no pude escucharte» (REINCIDENTE)
`src/lib/llm/openrouter.ts:505-517` · `src/lib/llm/openrouter.ts:579` ·
`src/lib/llm/openrouter.ts:622` · `src/lib/likida/voz_transcrita.ts:106,113,125-128` ·
`src/lib/llm/budget.ts:357,368`

Reconfirmado línea por línea, sin cambios desde la 24. `cotaEntradaEnTokens`
(`:507-515`) elide **solo** las claves llamadas `url` cuyo valor empieza con
`data:` — el arreglo que se hizo para la foto (`TOKENS_POR_IMAGEN = 4_000`,
`:503`). El audio no viaja así: `:579` lo adjunta como
`input_audio: { data: <base64>, format }`. La clave se llama `data` y el valor
no empieza con `data:`, así que el base64 entero se cuenta **a un token por
carácter**.

Escenario: el chofer manda una nota de voz reenviada en MP3 a 128 kbps de
**78 segundos** (1.24 MB) o una nota Opus larga (~7-10 min). La reserva sale
en $0.50, `reserveLlmBudget` compara **antes de tocar al proveedor**
(`budget.ts:368`) y lanza `LlmBudgetExceededError('run')`;
`voz_transcrita.ts:125-128` lo traduce a `RESPUESTA_SIN_PRESUPUESTO` («No pude
escuchar tu nota de voz ahora mismo 🙏 ¿me lo escribes?»). Lo que de verdad
costaba: **$0.0008**. La reserva se equivocó por **~600×**.

Por debajo del umbral el daño sigue: con el piso de tope diario en **$5.00**
(`budget.ts:204`), cada nota de 500 KB reserva **$0.20** — 25 notas de voz
vacían el presupuesto de IA del día de la flota entera mientras corren.

Agrava: `downloadMediaAsDataUrl` acota la IMAGEN (`meta/client.ts:46,664,674`,
`MAX_IMAGEN_WHATSAPP_BYTES = 6 MB`) pero **no acota el audio** — la Cloud API
entrega hasta 16 MB, que aquí serían 21.3 M de caracteres y una reserva
calculada de **$6.39**.

Refutación intentada: busqué un `TOKENS_POR_AUDIO`, una rama de
`cotaEntradaEnTokens` para `input_audio` y un tope de bytes en
`voz_transcrita.ts`. No existe ninguno. `maxTokens: 1000` (`:113`) acota la
SALIDA. `cota_entrada_imagenes_aud24.test.ts` cubre la imagen y solo la imagen.

Consecuencia: el chofer que manda voz en vez de escribir —el caso que la capa
E1 existe para atender— se queda sin canal, y el log dice «presupuesto
agotado», que manda a Javier a subir un tope que no era el problema.

Causa raíz probable: el arreglo se escribió sobre la forma `image_url.url`, y
cuando entró `input_audio` nadie volvió a `cotaEntradaEnTokens`.

Severidad: **ALTO**. (**REINCIDENTE** de la auditoría 24.)

---

### [ALTO] La tabla del presupuesto de cierre sigue en 18 pasos y el cierre hace 20 — y ahora está en `master` (REINCIDENTE)
`src/lib/likida/presupuesto.ts:87-110,113,123,151` ·
`src/lib/likida/processor.ts:4266` · `src/lib/likida/processor.ts:4338` ·
`src/lib/likida/conv.ts:222-229` · `src/lib/likida/presupuesto.test.ts:133-152`

Lo que cambió desde la 24: **ya no vive en una rama**. `4f94490` (master) trae
los dos `sellarEntregaLiquidacion(...)` en `processor.ts:4266` y `:4338`, y
`presupuesto.ts` sigue sin tocarse. Cada sello es un `UPDATE` real sobre
`liquidacion` envuelto en `acotada` (`conv.ts:225-229`): **0.3 s nominales y
9.5 s de techo cada uno**, en la cola del cierre, después de que la
liquidación ya se persistió.

La aritmética está en la tabla 1 de arriba: 18 → 20 pasos, `TECHO_CIERRE_MS`
173.5 → **192.5 s**, `MARGEN_CIERRE_MS` 39.0 → 39.6 s.

El guardarraíl que existe para exactamente esto no los ve, y la razón es
estructural: `presupuesto.test.ts:133-145` cuenta los envíos leyendo **solo el
fuente de `avisar_cierre.ts`**, y los sellos viven en `processor.ts`; y
`:146-152` verifica `toHaveLength(18)`, o sea que **ratifica el número viejo**
en vez de contrastarlo con el código.

Escenario con valores: un turno llega al cierre con `margenDuro()` = 30 s —
apenas por encima de `MARGEN_CIERRE_CRITICO_MS` (29.5 s), así que
`cierreConMargen` es `true` (`processor.ts:4045-4046`) y el camino completo
corre. Los tres pasos irrenunciables a su techo consumen los 29.5 s; llegan
entonces a `saveConversation` (`:4351`) y al `finally` que suelta el lock
**con 0.5 s de reloj** y 8 pasos por delante que suman 76.5 s de techo. Vercel
mata la función después de entregar el PDF y antes de `saveConversation`.

Consecuencia: el chofer recibe su PDF y, al mandar el siguiente mensaje, el
agente responde desde una conversación a la que le falta el último turno; el
viaje queda trabado hasta que expire el TTL del mutex. Nadie ve un error: Meta
ya recibió su 200.

Causa raíz probable: el mecanismo que obliga a declarar cada paso de red del
cierre vigila UN archivo (`avisar_cierre.ts`) y el cierre vive en dos.

Severidad: **ALTO**. (**REINCIDENTE** de la auditoría 24 — y de la 18 en su
forma original.)

---

### [ALTO] `ingerir` no mira el reloj a propósito: un paquete del SAT de más de ~311 CFDI no cabe en los 300 s del cron, muere mudo y quema la cuota de descarga
`src/lib/likida/sat_descarga/ciclo.ts:240-319` · `:252` · `:293-296` · `:316-317` ·
`:532-543` · `:557-573` · `src/app/api/cron/descarga-sat/route.ts:12,81-82,101,122`

El reloj de la vuelta se consulta **antes de bajar el paquete** (`ciclo.ts:557`)
y el comentario de `:537-548` declara la decisión: *«NO se corta dentro de
`ingerir`: un paquete es la unidad atómica de este ciclo»*. Dentro del
`for (const xml of xmls)` de `:240` no hay una sola consulta a `Date.now()`.

La aritmética está en la tabla 3: cada CFDI nuevo sin pareja cuesta **3 viajes
de red secuenciales** (`upsert` del sello `:252`, `saveCfdiXmlRaw` `:316`,
`marcar` `:317`) y **4** si casa (`ligar` `:293`). A 0.3 s nominales por viaje
—la unidad que el propio repo usa en `PASOS_CIERRE`— caben **311 CFDI** en los
280 s de `venceEn`. La cabecera del archivo describe un paquete como *«un ZIP
con miles de CFDI»* (`:46-47`). Un paquete de 2 000 CFDI pide **1 800 s**
dentro de un `maxDuration` de **300**.

Entra: la primera flota con e.firma y un mes real de diésel y casetas
(100 unidades × 20 cargas = 2 000 CFDI en la ventana de 31 días). Sale, en
cadena:

1. Vercel corta a los 300 s **dentro** del bucle. No hay `conRelojDuro` en
   esta ruta (existe en el repo, `api/cron/_reloj_duro.ts`, y solo lo usan
   `runner` y `escalar`), así que la ruta no tiene puerta propia:
   `registrarLatido` (`route.ts:122`) **nunca se escribe** → el tablero dice
   «descarga-sat no late» sin causa, el mismo silencio del runner el
   25-ago-2026.
2. `avisarCierrePeaje` (`route.ts:101`) corre DESPUÉS y nunca llega: **ninguna
   flota** recibe ese día el aviso de que su derecho a facturar casetas se
   extingue el último día del mes.
3. `bajados.push(p)` (`:574`) y el `UPDATE` de `paquetes_bajados` (`:576-583`)
   no se ejecutan, así que la corrida de 6 h después **vuelve a pedir el mismo
   paquete**. El comentario de `:537-540` dice el resto con sus palabras: *«Un
   paquete se puede bajar DOS veces y a la tercera el proveedor lo RECHAZA»*.
   Los CFDI sellados sí persisten y cuentan como `repetidos` (1 viaje de red,
   0.3 s), así que la 2ª vuelta avanza un poco más: 311 → ~518 de 2 000. La
   3ª se lleva el rechazo → `todoBien = false` → la solicitud nunca cierra →
   `ultima_descarga_hasta` **nunca avanza** y esa flota queda parada en ese
   rango para siempre.

Refutación intentada: busqué un tope de `xmls` por paquete, un `venceEn` en
`ingerir`, y un `conRelojDuro` en esta ruta. No hay ninguno. `MAX_PAQUETES = 3`
(`:57`) acota los paquetes, no su contenido — y su propio comentario dice que
bajar es lo caro «porque la función tiene reloj», que es justo lo que el bucle
interior no tiene.

Consecuencia: el contralor no ve entrar sus CFDI, el cron aparece muerto sin
decir por qué, y el aviso de cierre de peaje —el que protege un derecho que
caduca el día 30— se pierde para todas las flotas, no solo para la afectada.

Causa raíz probable: se eligió la atomicidad del paquete sobre el reloj sin
comprobar que el paquete cupiera en el reloj.

Severidad: **ALTO**.

---

### [ALTO] El costo por liquidación no está medido: el $0.05 declarado lo contradice la medición del propio repo (~$0.144 de entrada sola), y de ese número cuelga el freno de la flota
`src/lib/llm/models.ts:238-239,252-262` · `src/lib/llm/budget.ts:235` ·
`src/lib/llm/openrouter.ts:896-921` · `src/lib/agents/run.ts:33-41` ·
`src/lib/llm/presupuesto_por_tenant.test.ts:77`

`LIQUIDACION_USD = 0.05` se documenta a sí mismo como *«la banda alta de la
arquitectura (jul-2026, cabecera)»* — una estimación de diseño. Su vecino
`comprobanteOcr` sí dice «medido el 4-ago-2026 contra 18 comprobantes reales».
La medición que SÍ existe para el cuadre vive en otro archivo y dice lo
contrario (`openrouter.ts:899-903`, textual): *«MEDIDO el 4-ago-2026 sobre las
4 liquidaciones reales … la entrada crece con la conversación hasta 21 224
tokens. Una liquidación de 21 comprobantes reenvía ~72 000 tokens de entrada
en 8 vueltas»*.

La aritmética completa está en la tabla 4. En corto: 72 000 tokens × $2/M =
**$0.144 de entrada sola**, contra **$0.05 de total declarado**. La caché de
prompt rescata como mucho **$0.0197**, porque el `cache_control` se pone
únicamente en el `system` (`openrouter.ts:917-921`) y ese system son **1 560
tokens** de los ~21 000 que se reenvían por ronda — medido por mí importando
`getSystemPrompt('liquidacion')` con el `TenantContext` real: 6 241 caracteres;
las 4 tools del registro (`registry.ts:16`) suman otros 1 354. El prefijo que
de verdad crece —la conversación con los resultados de tools— viaja idéntico
entre rondas y se paga entero cada vuelta.

Entra: una flota con plan de 15 000 viajes/mes. Sale:
`topeDerivadoDelPlan` (`budget.ts:235`) le fija **$27.40/día** partiendo del
$0.0548 declarado, mientras el gasto real de esos 500 viajes/día ronda
**$87/día**. El techo se agota al **31 %** del día: a partir de media mañana,
cada chofer que manda un ticket recibe el rebote de `tope_tenant`. Es
literalmente el fallo que la propia auditoría 24 describe en `budget.ts:177`
(«el tope caía hacia las 10 de la mañana») y que se «arregló» derivando el
techo… del número equivocado.

Refutación intentada: busqué una prueba que ate `LIQUIDACION_USD` a una
medición. `presupuesto_por_tenant.test.ts:77` calcula
`(15_000 / 30) * COSTO_ESTIMADO_USD.viajeCompleto` — o sea **compara la
constante consigo misma**, el mismo defecto que `PASOS_CIERRE` tenía antes de
la auditoría 18. También verifiqué que `costoReal` prefiere el `cost` del
proveedor (`openrouter.ts:246-262`), así que el gasto REAL sí se asienta bien
en `llm_costo`: lo que está mal no es la contabilidad, es el número con el que
se dimensionó el freno.

Consecuencia: la flota se queda sin IA a media jornada y el chofer lee un
error de sistema; y hacia adentro, el precio por liquidación con el que Likida
piensa cobrar está construido sobre un supuesto que su propia bitácora
desmiente 3×.

Causa raíz probable: el único breakpoint de caché está en el bloque pequeño e
invariante (el system) y no en el prefijo grande que también es invariante
entre rondas; y nada obliga a que el costo unitario declarado se contraste con
`llm_costo`.

Severidad: **ALTO**.

---

### [MEDIO] Tres `.limit(5000)` que PostgREST convierte en 1 000 en silencio: el parte de costo por agente y el fondo de cruce del SAT salen de una muestra arbitraria
`src/lib/likida/agentes/ingenieria.ts:1189-1195` (y su llamador `:1226`) ·
`src/lib/likida/sat_descarga/ciclo.ts:167-179` ·
`src/lib/likida/agentes/insumos.ts:122-140` · `src/lib/likida/pg.ts:38-48`

El repo sabe que `max_rows` es 1 000 y que PostgREST aplica `min(limit,
max_rows)` — lo dice en `pg.ts:38-48`, en `desglose_peaje.ts:651` y `:775`, y
en `export/facturas-proveedor/route.ts:73`. Estos tres sitios no se enteraron:

**(a) `leerCostos`** (`ingenieria.ts:1193`) lee `agente_corrida` de **7 días**
con `.limit(5000)` y **sin `.order()`**. Volumen: ~34 agentes habilitados × 6
pasadas/día = 204 filas/día = **1 428/semana**, más una fila por turno del
agente `liquidacion` (`tools.ts:297,441`) y una por corrida de peaje, escalado
y cobranza. Entra: la semana real → salen 1 000 filas **elegidas por el
planner**, sin orden estable. Sale: el parte semanal «Rendimiento» reporta
«costo por corrida» de cada agente sobre una muestra arbitraria del 70 %, con
cara de censo, y su propio pie dice «Fuentes: … `agente_corrida` (costo por
corrida)». Dos corridas del mismo parte pueden dar cifras distintas.

**(b) `gastosSinCfdi`** (`ciclo.ts:178`) arma el FONDO contra el que se cruzan
los CFDI bajados del SAT, con `.limit(5000)` y sin `.order()`, sobre una
ventana de **31 días** de una flota. Entra: una flota de 100 unidades con
~2 000 gastos sin comprobante en el mes. Sale: `decidirCruce` (`:274`) solo ve
1 000 de ellos, así que los CFDI cuyo ticket quedó fuera del corte se marcan
`disponible` en vez de `casado` — y como el sello de dedup (`:252-270`) impide
re-ingerirlos, **no hay segunda oportunidad automática**: el contralor tiene
que casarlos a mano.

**(c) `contarPendientesPorAgente`** (`insumos.ts:135`) es el caso didáctico:
su comentario dice *«5 000 filas pendientes a la vez es muy por encima de la
escala de hoy, y si algún día se recortara el `.limit()` lo delataría un
conteo que deja de crecer»*. Ya está recortado —a 1 000, desde siempre— y por
eso el aviso que promete no puede dispararse.

Refutación intentada: los tres pasan por `acotada`, o sea que un error de base
sí se ve; lo que no se ve es el recorte, que llega como una respuesta normal y
corta. Ninguno usa `traerTodo` ni pide `conteo()`.

Consecuencia: una cifra de dinero (a), un cruce fiscal (b) y un contador de
bandeja (c) que salen a la baja sin decirlo — la dirección que nadie revisa.

Causa raíz probable: `.limit(N)` se lee como «tráeme hasta N» y en PostgREST
significa «tráeme hasta min(N, 1000)»; el conocimiento existe en `pg.ts` pero
no hay nada que lo aplique.

Severidad: **MEDIO**.

---

### [MEDIO] `/api/admin/qa/fotos/ocr` corta en 105 s con 15 s de margen contra un peor caso de 120 s de UNA sola foto (REINCIDENTE)
`src/app/api/admin/qa/fotos/ocr/route.ts:52,65,171` ·
`src/lib/llm/openrouter.ts:29,45-52,699,707,718,725`

Sin cambios desde la 24, reverificado. La ruta declara `maxDuration = 120`
(`:52`) y `PRESUPUESTO_MS = 105_000` (`:65`); el bucle consulta el reloj
**antes** de cada foto y llama `extraerComprobante(dataUrl)` **sin `signal` y
sin `budget`** (`:171`, con la nota que explica por qué se decidió así).

Sin señal, el único tope es `TIMEOUT_LLM_MS = 30_000` (`openrouter.ts:29`,
`maxRetries: 0`) por PETICIÓN, y `generateStructured` encadena hasta **cuatro**:
`:699` primer intento, `:707` reintento con el doble de tope si truncó, `:718`
reintento con nota, `:725` fallback cross-provider — que para el modelo de OCR
existe (`google/gemini-3.1-flash-lite → anthropic/claude-haiku-4.5`, `:92`).

    peor caso de UNA foto = 4 × 30 s = 120 s
    margen declarado      =        15 s
    maxDuration           =       120 s

Entra: una foto que arranca en t = 104.9 s contra un OpenRouter lento (429 o
timeout, que es justo cuando la escalera se despliega entera). Sale: la
invocación muere a los 120 s con la llamada en vuelo y el JSON con `sinTurno`
—el mecanismo que la cabecera del archivo describe como la razón de ser del
reloj— nunca llega. El caso sin truncamiento (timeout → reintento → fallback)
ya son 90 s, seis veces el margen.

Consecuencia: la pantalla de calidad del OCR se cae muda justo el día en que
el proveedor está lento, que es el día en que uno quiere mirarla.

Causa raíz probable: el margen se dimensionó contra el costo TÍPICO de una
foto (2-6 s, `openrouter.ts:50`) y no contra el techo de la escalera de
reintentos del propio gateway.

Severidad: **MEDIO**. (**REINCIDENTE** de la auditoría 24.)

---

### [MEDIO] Llamadores de `traerTodo` que paginan sin desempate único, y tres que ni siquiera piden `conteo()` (REINCIDENTE)
`src/lib/likida/pg.ts:132-135` (el contrato) · `:190-215` (el cursor) ·
`src/lib/likida/mesa_control.ts:80-89` · `:108` ·
`src/lib/likida/mantenimiento.ts:258-264` · `:267-272`

Spot-check de los peores de la 24: **sin cambios**.

`mantenimiento.ts:267-272` (`taller.cerradas`) lee toda la historia de
mantenimientos cerrados de la flota, sin filtro de fecha, ordenada solo por
`.order('cerrada_en', { ascending: false })`. Una flota de 800 unidades con
servicio de rutina mensual genera ~9 600 filas al año: cruza las 1 000 de
`PAGINA` (`pg.ts:45`) en cinco semanas. Con orden descendente por tiempo,
**cada cierre de orden que ocurra durante la lectura entra en la posición 0** y
recorre todo un lugar: la última fila de la página N se repite como primera de
la N+1 y una fila se pierde. El `count` también creció, así que
`filas.length >= esperadas` (`pg.ts:204`) se cumple y `LecturaIncompleta` **no
se lanza**.

`mesa_control.ts:80-89` y `:108` ordenan por `abierta_en`/`created_at` y
**no pasan `conteo(desde)`** en su `.select()`. Sin `count`, `traerTodo` cae a
la prueba de la página vacía (`pg.ts:206-209`) — exactamente la que un salto de
filas satisface: la lectura sale corta y devuelve normal, para siempre.

Consecuencia: la pantalla del taller declara «vencida» una rutina que sí se
sirvió, y la mesa de asistencia deja fuera una incidencia abierta sin decir que
la dejó fuera.

Causa raíz probable: el contrato está escrito en `pg.ts:132-135` y nada lo
verifica; se aplica a mano, llamador por llamador. Y de fondo, `range()` por
posición sobre una tabla viva se salta filas aunque el orden sea único — el
keyset real solo existe en `export/liquidaciones/route.ts:112-137`.

Severidad: **MEDIO**. (**REINCIDENTE** de las auditorías 23 y 24.)

---

### [MEDIO] El piloto de visión itera 14 pasos sin mirar el reloj ni pasar señal, dentro de un cron cuyo corte por portal solo garantiza 150 s (REINCIDENTE)
`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:101,242,559-568` ·
`src/app/api/cron/facturar/lote.ts:48,80,576`

Sin cambios, reverificado. `PASOS_MAXIMOS = 14` (`:101`) y el `for` de `:242`
no consulta ningún `venceEn`. Cada paso es un `generateStructured` con
`role: 'piloto'` = `anthropic/claude-sonnet-5` (`models.ts:140`) **sin
`signal`** (`:559-568`), o sea sin forma de cortarlo.

`TOPE_DURACION_S = 300` (`lote.ts:48`) y `MARGEN_LOTE_MS = 150_000` (`:80`),
así que el corte de `:576` solo garantiza que un portal **empiece** antes de
los 150 s. Con el piloto: 14 pasos × una llamada de visión de Sonnet con
captura (≈10-12 s típicos) = 140-168 s solo de modelo, más 14 inventarios,
14 capturas y 14 acciones de Playwright. Y un solo paso colgado se lleva 120 s
él solo (la escalera de cuatro intentos del hallazgo anterior).

    portal que arranca en t = 149 s  +  piloto de 14 pasos (≈160 s)  =  309 s
    maxDuration                                                     =  300 s

Consecuencia: latente mientras `FACTURACION_PILOTO=si` esté apagado
(`adaptadores/registro.ts:331`), y ese es el único guardarraíl que hoy lo
contiene. Si se enciende, la muerte es AMBIGUA con el navegador dentro del
formulario fiscal — que es como se acaba con dos CFDI por el mismo consumo.

Causa raíz probable: el piloto se escribió acotado por PASOS y no por TIEMPO,
y el reloj del cron se detiene en la frontera del portal.

Severidad: **MEDIO**. (**REINCIDENTE** de la auditoría 24.)

---

### [BAJO] La foto va al modelo de visión a resolución nativa, aunque el repo ya calculó la de 1600 px dos líneas antes (REINCIDENTE)
`src/lib/likida/intake/ocr.ts:389,398-407` ·
`src/lib/likida/intake/cfdi_imagen.ts:110-111` · `src/lib/meta/client.ts:46`

Sin cambios. `extraerComprobante` pasa `bufferFromDataUrl(f)` a
`decodeCodigosFromImage` (`ocr.ts:389`), que **sí** reescala con sharp a
1600 px y luego a 1000 (`cfdi_imagen.ts:110-111`) y tira ese buffer. Acto
seguido manda a `generateStructured` el `principal` (`ocr.ts:398,402`) — el
data-URL **original**, cuyo único tope es `MAX_IMAGEN_WHATSAPP_BYTES = 6 MB`.

Entra: un ticket fotografiado con un iPhone reciente (4032×3024, ~4-5 MB).
Sale: 5.3-6.7 MB de base64 dentro del cuerpo JSON de la llamada, y el mismo
cuerpo se reenvía **hasta cuatro veces** por la escalera de
`openrouter.ts:699-725` — hasta ~27 MB subidos por un comprobante, dentro de
los 25 s que `processor.ts:1809` le concede. Lo que sí es cierto sin estimar:
el buffer reducido ya se produjo y se descarta.

Severidad: **BAJO**. (**REINCIDENTE** de la auditoría 24.)

---

## Lo que revisé y está bien

- **La migración 0302 es segura y no mueve el redondeo de la reserva.**
  `supabase/migrations/0302_*.sql` hace `drop function if exists
  public.reservar_presupuesto_llm(uuid, uuid, uuid, numeric, numeric, numeric)`
  — solo el overload de 6. El único call-site real (`budget.ts:392-406`) pasa
  los **8 argumentos NOMBRADOS**, que es como PostgREST resuelve el overload de
  la 0244; no queda ninguna llamada que pudiera caer en la firma retirada
  (grep sobre `src/`, `scripts/` y `supabase/`). El redondeo no cambia: el
  cuerpo de la función de 8 args (`0244:181-256`) no se tocó, `budget.ts` sigue
  mandando `Number(x.toFixed(6))` y la columna es `numeric(18,6)`
  (`0186:31-32`). `verificaciones.sql` ya migró sus dos bloques a la firma de 8
  (`:8877, :8884, :13647-13652`) y ancla `pronargs = 8` en `:13660`.
- **El runner sí tiene puerta propia.** Intenté construir un hallazgo sobre
  `relojAgotado(venceEn)` en `loteRedactor` (`runner.ts:538`), que es un
  «¿ya vencí?» y no un «¿cabe el siguiente?», con una llamada de modelo que
  puede durar 120 s. Lo refuta `conRelojDuro` (`cron/runner/route.ts:66-70` +
  `agentes/runner.ts:1169`): la ruta espera a la CARRERA, no a la vuelta, así
  que a los 270 s devuelve `cerrarPorRelojDuro(avance)` y le quedan los 30 s de
  `MARGEN_RELOJ_MS` para latir. Y `PASOS_LATIDO` (`:335-343`) suma 25.2 s
  contra esos 30 — cabe con 4.8 s.
- **`puertaCron` no gasta reloj antes de fijar `venceEn`.** Verifiqué que
  `salud.ts:80-97` es puramente local (env + comparación en tiempo constante),
  así que el `Date.now()` de las rutas de cron no arranca con un prólogo de red
  sin contabilizar.
- **El outbox de WhatsApp cabe.** `reclamarSalidasWhatsApp` reclama 25
  (`wa_outbox.ts:90`) y el pool es de 4 (`wa-outbox/route.ts:104`): 7 tandas ×
  (10 s de `AbortSignal.timeout` + 9.5 s de `finalizar`) ≈ 136 s, más reclamo y
  latido ≈ 155 s contra `maxDuration = 300` — que es la medición que el propio
  archivo documenta. Y `WA_OUTBOX_LEASE_SECONDS = 450` = 1.5 × el `maxDuration`
  real, con prueba que lo lee del fuente de la ruta.
- **`acotada` + el backstop del cliente cubren toda consulta.**
  `presupuesto.ts:219-240` impone `abortSignal` **y** una carrera contra
  temporizador; `supabase/admin.ts` pone un backstop de 25 s a cualquier fetch
  sin señal propia. Es la respuesta correcta al default de 300 s de undici.
- **El presupuesto es por INVOCACIÓN, no por mensaje** (`presupuesto.ts:308`,
  `webhook/route.ts:129`) y el pool de 5 sigue justificado con la medición del
  bloqueo de zxing.
- **El ciclo de tools cobra bien.** `generateWithTools` acumula el costo POR
  RONDA con el modelo que de verdad respondió (`openrouter.ts:1067-1069`),
  parte el gasto en `costoPorModelo`, corta el loop-guard ANTES de ejecutar las
  tools de la última ronda (`:1122-1125`), termina el ciclo en cuanto una tool
  terminal tiene éxito (`:1187-1189`) y **deja la reserva sin liquidar ante
  error** (`:1014-1019`) en vez de cobrar una llamada que nunca ocurrió.
- **La caché de lectura entre rondas está bien llaveada.** `llaveDeCache`
  (`:803-815`) usa solo el nombre para las tools sin parámetros, que era el
  caso real que hacía repetir `cuadrar_viaje` entero; y solo se cachea el
  ÉXITO (`:1176`).
- **`costoReal` prefiere el `cost` del proveedor** sobre la tabla
  (`openrouter.ts:246-262`) y `calcCost` estima con la tarifa MÁS CARA ante un
  modelo sin precio — falla hacia lo ruidoso, que es lo correcto.
- **No hay N+1 en `repo.ts`** ni en los bucles con `await` que barrí: los que
  hay van en tandas (`pg.ts:162-181` `traerPorIds` en 200 con 5 en paralelo,
  `estadias/lector.ts:272` en 500, `proveedores.ts:507` en `IDS_POR_TANDA`,
  `cotizador/lector.ts:159` en 100, `importar_viajes.ts` en 200/100).
- **Las páginas de `/dashboard` no disparan una consulta por fila.** Revisé las
  cuatro con más `await` (`mi-perfil`, `jornada`, `despacho`, `usuarios`): la
  mayoría de esos `await` viven en server actions, no en el render.

## Lo que NO alcancé a revisar

- **El costo real por liquidación con una corrida de verdad.** Todo lo del
  hallazgo 4 sale de la medición que el repo escribió en `openrouter.ts:899` y
  de mi conteo de caracteres del system/tools; no tengo el tokenizador del
  proveedor ni una fila de `llm_costo` con la que contrastar (la base está en
  cero). La conclusión —que $0.05 está muy corto— aguanta con cualquier
  tokenizador razonable; el múltiplo exacto (3.4×) no.
- **Los crons de 120 s** (`asistencia`, `escalar`, `purgar`, `portales-vivos`,
  `wa-pendientes`): verifiqué que todos calculan un `venceEn`, no que el margen
  de cada uno cubra su peor caso eslabón por eslabón como hice con
  `descarga-sat` y `runner`.
- **`cron/facturar`** más allá del piloto de visión: no sumé la cadena de una
  sesión de portal completa (`pagina_playwright.ts` + `capufe.ts`) contra los
  300 s.
- **`generateResponse`** (el hermano de `generateStructured` para el chat del
  panel): solo verifiqué que comparte `cotaEntradaEnTokens`, no su escalera de
  reintentos ni su presupuesto.
- **Las ~31 páginas de `/dashboard` una por una**: cuántas consultas dispara
  cada render y si alguna repite la misma lectura en dos componentes. Solo
  miré las cuatro más pesadas por conteo de `await`.
- **El costo de pared de `decodeCodigosFromImage`** (dos pasadas de sharp +
  zxing por foto) dentro del pool de 5 del webhook: el repo dice que está
  medido, no lo remedí.
