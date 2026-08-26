# Cumplimiento fiscal — auditoría 19 c2

**Nota: 3/10** (antes 3). Razón del movimiento: **deuda que cobró factura**, y por eso
la nota **no se mueve**.

- *Deuda que cobró factura, textual*: los dos arreglos fiscales de `6340aac` —el plazo
  impreso y la canasta mixta— **se desplegaron y se retiraron el mismo día**. `69aa71b`
  sacó `plazo_facturacion_horas` y `renglones` del esquema del OCR porque tumbaron la
  extracción en producción (`ocr.ts:60-76`). El motor sigue leyendo las dos llaves
  (`engine.ts:623`, `engine.ts:950`), **nadie las escribe**, y el catálogo de comercios
  tampoco usa `{horas}`. Los dos tickets reales que motivaron el cambio —24 hrs y
  72 horas— vuelven a recibir «puedes timbrarlo hasta el 31 de agosto».
- *No hubo «se atacó y subió»*: **ninguno** de los cuatro hallazgos que dejé abiertos se
  cerró. El numerador del 15% medido en SQL con `forma_pago='01'` va por su **QUINTA**
  ronda consecutiva: `0112:151` no se movió ni un byte.
- *No bajo a 2* porque el ancla de 0–2 dice «el rubro no está atendido», y eso sería
  falso: 25 fichas, la proporción de LIVA 5-I implementada, el peaje fail-closed y el
  módulo de monedero siguen ahí. El ancla que aplica es la de arriba —«3 o menos si el
  producto imprime una cifra fiscal equivocada»— y hoy imprime cuatro.

**El riesgo mayor del rubro, hoy:** un ticket de autoservicio donde la mayoría del
importe no es gasto de viaje sale del motor como **«Deducible para ISR» en verde y con
estatus `cuadrada`**. El único freno que se construyó para eso —`renglones_ajenos`— no
está en ninguna de las cinco listas que gobiernan la deducibilidad, y además ya no se
levanta nunca porque el OCR dejó de producir su insumo.

---

## Verificación de los abiertos de la ronda 19 (contra el código de HOY)

| Hallazgo de `fiscal.md` | Estado hoy | Evidencia leída hoy |
|---|---|---|
| **CRÍTICO** · CFDI multiconcepto nunca recibe `xml_verificado` | **REINCIDENTE, sin tocar** | `grep -rn "xml_verificado" src/lib/likida` → un solo productor, `repo.ts:768`; `consolidado.ts:197` sigue escribiendo solo `cfdi_uuid`/`cfdi_orden`/`clave_prod_serv`/`ocr_extra`; guardia en `engine.ts:1248` |
| **CRÍTICO** · numerador del 15% en SQL `'01'` | **REINCIDENTE, 5ª ronda** | `0112:151` byte por byte; `desde_db.ts:116` idem; ninguna de las 4 migraciones nuevas (0185–0188) la toca |
| **CRÍTICO** · la pregunta «carga / pasaje / turismo» gobierna la RFA 2.9 | **REINCIDENTE** | `forma.tsx:69` y `entrevista.ts:162`, ambos sin cambio |
| **CRÍTICO** · demo 601 + facilidad a mano | **REINCIDENTE** | `demo-5k.sql:45` (`'601'`) y `:58` (`"regimenElegible":true`); `repo.ts:1285` sigue sin leer `regimen_fiscal` |
| **ALTO** · póliza bloquea el periodo entero por IVA no acreditable | **REINCIDENTE** | `contabilidad/` no aparece en el diff `8b43121→69aa71b`; `poliza.ts:156-166` y `route.ts:204-215` intactos |
| **ALTO** · el estímulo de peaje se anula por tres causas sin emitir diferencia | **REINCIDENTE** | `engine.ts:1292-1295` (cuatro condiciones, ningún `else`); `acreditable.ts:131` (`> 0`); `peajes/vista.tsx:305/308/309` |
| **ALTO** · denominador del 15% = «lo que Likida vio» | **REINCIDENTE** | `engine.ts:525` |
| **ALTO** · el panel recalcula una liquidación archivada | **REINCIDENTE** | `analytics.ts:1589`, `:1702`; `efectivo_sobre_15` (`engine.ts:529-533`) sigue sin `esperado` |
| MEDIO · `forma.tsx:55-56` «sin ellas el motor aplica el 50% a cualquier flota» | **REINCIDENTE** | sin cambio |
| MEDIO · `liva-5.yaml` sin fr. III; RMF 2.7.1.29 sin ficha | **REINCIDENTE** | la ficha termina en la fr. II (`:26-28`); `ls normas/*.yaml` → 25, ninguna 2.7.1.29 |
| MEDIO · `usoCfdi` de la mensualidad | **REINCIDENTE** | `flota_fiscal.ts:85` |
| MEDIO · `actualizarRfcOperador` sin llamador | **REINCIDENTE** | `repo.ts:1271`; `grep` fuera de `repo.ts` → 0 |
| MEDIO · `enrutar.ts` presenta el plazo del comercio como vencimiento | **REINCIDENTE** | `enrutar.ts:162-164`, `⚠️ VENCE HOY` |
| BAJO · `fiscal.ts:735` y `:792` con `!== '01'` | **REINCIDENTE** | sin cambio |
| BAJO · `indice.ts:127` `titulo: ">"` | **REINCIDENTE** | sin cambio |
| BAJO · cuota del DOF sin cubrir hoy | **REINCIDENTE y PEOR** | última semana `2026-08-15 a 2026-08-21`; hoy es 25-ago → **4 días descubiertos, 2ª ronda seguida** |

**Cerrados esta ronda: cero.**

---

## Hallazgos

### [ALTO · NUEVO] Los dos arreglos fiscales del delta están MUERTOS: el motor lee dos llaves de `ocr_extra` que ningún escritor pone, y la única prueba nueva no toca ninguno de los dos extremos

`src/lib/likida/intake/ocr.ts:60-76` (el hueco donde estaban los dos campos)
→ `src/lib/likida/cuadre/engine.ts:623` y `:950-954`
· `src/lib/likida/cuadre/renglones_y_plazo.test.ts` (**nuevo**, 53 líneas)
· ficha `normas/politica-portales-plazos.yaml` (`sin_verificar` **a propósito**; lo que
se cita es su `advertencia_de_jerarquia` y su `uso_permitido_hoy`)

Texto de la ficha (transcrito literal, `advertencia_de_jerarquia`):

> «ESTO NO ES UNA NORMA FISCAL. Es la política interna de un tercero y tiene CERO fuerza
> legal. El plazo LEGAL para pedir factura es todo el ejercicio (el SAT lo dice
> expresamente) […] El producto **NUNCA** debe presentar estos plazos como una obligación
> fiscal.»

Y su `nota_verificacion`, que es la que **respalda** el diseño nuevo:

> «EXCEPCIÓN VERIFICADA — Office Depot (25-jul-2026). Fue la PRIMERA entrada del catálogo
> con `plazoVerificado: true`, y no viene del blog: **viene del papel**. El ticket de campo
> trae impreso al pie "…DEBERÁ SOLICITARLA A MÁS TARDAR DENTRO DEL MES SIGUIENTE…"»

Respondo la pregunta del MAPA de frente: **la norma sí respalda que el papel le gane al
catálogo**, y el mensaje cumple el `uso_permitido_hoy` («nombrándola como lo que es»):
`engine.ts:990` cierra con «*plazo impreso en el propio ticket, no de la ley: legalmente
puedes exigir la factura dentro del ejercicio*». El diseño está bien. **Lo que no existe
es el dato.**

`ocr.ts:60-76` es hoy un comentario donde estaban los dos campos:

> «`plazo_facturacion_horas` y `renglones` se agregaron esta mañana y TUMBARON EL OCR EN
> PRODUCCIÓN: OpenRouter devolvió `400 Provider returned error` de inmediato, sin consumir
> un token, en cada foto.»

Verificado por los dos lados:
- `grep -rn "plazoFacturacionHoras\|ajenoAlViaje\|renglones_ajenos" src/ supabase/` → **ni
  un solo escritor**; los únicos aciertos son el lector (`engine.ts:623`, `:950`), el
  rótulo, el `SIN_NORMA` y el mapa de `cierre_aviso.ts:143`.
- `ocrExtra` se arma completo en `ocr.ts:525-571` y **ninguna de las dos llaves aparece**.
- `grep -n "horas" src/lib/likida/facturacion/comercios.ts` → 0 en las 38 entradas con
  `plazo:`. La rama `{ horas }` de `calcularCaducidad` (`caducidad.ts:75-89`) es
  **inalcanzable desde producción**: solo la ejercita el test.

**Escenario (los dos tickets reales del commit).** Ferretería de Mérida, 19-ago-2026,
«plazo máximo de 24 hrs para facturar este ticket», diésel/consumible de $1,160:

| | lo que promete el commit | lo que imprime el código de hoy |
|---|---|---|
| `plazo` que usa `engine.ts:951` | `{ horas: 24 }` | `'mes_natural'` (no hay `horasImpresas`) |
| `fechaLimite` | 2026-08-20 | **2026-08-31** |
| nota en la liquidación | «se pasó el plazo…» | «**puedes timbrarlo hasta el 2026-08-31 (12 días)** (la ventana del comercio no está verificada y puede ser menor…)» |

Y el ticket de Boston's del 16-ago con «solo 72 horas» sale igual: **31-ago**, quince días
después de que el portal cerró.

**Intento de refutación.** ¿No basta con que el comentario diga «degrada, no rompe»?
Degrada respecto de la fantasía, no respecto del papel: la liquidación afirma una fecha
que es 11 y 15 días posterior a la que el comercio imprimió. ¿Lo caza alguna prueba?
`renglones_y_plazo.test.ts` **llama a `calcularCaducidad` directo con `{horas: 24}` a
mano** — no pasa por `ocr.ts`, no pasa por `cuadrarViaje`, y pese al nombre del archivo
**no tiene una sola prueba de `renglones_ajenos`**. Los 14 tests pasan en verde
(`npx vitest run src/lib/likida/cuadre/renglones_y_plazo.test.ts` → 2 archivos, 14
pruebas, 0 fallos) verificando el único tramo que nunca estuvo roto.

**Consecuencia.** El daño está acotado porque la misma frase dice que legalmente se puede
exigir dentro del ejercicio; lo que se pierde es la única acción a tiempo. Y el efecto
lateral es peor que el bug: un `ocr_extra` que ya no trae `renglones` significa que la
canasta mixta del hallazgo siguiente **no levanta ni una línea**.

**Causa raíz probable:** el esquema estructurado se validó contra el tipo de TypeScript y
no contra el proveedor, y al revertirlo se retiró el productor sin retirar ni marcar al
consumidor.

---

### [ALTO · NUEVO] Un ticket de canasta mixta sale «Deducible para ISR» al 100% y con estatus `cuadrada`: `renglones_ajenos` no está en ninguna de las cinco listas que deciden la cubeta, el acreditamiento y la revisión

`src/lib/likida/cuadre/engine.ts:634-641` (la observación)
· `:235` `NO_DEDUCIBLE_ISR` · `:236` `POR_CONFIRMAR` · `:253-262` `cubetaDe`
· `:1225` `SIN_ACREDITAMIENTO` · `:1264` `proporcionDeducible` · `:1425` `REVISAR`
· `src/lib/likida/liquidacion/deducibilidad.ts:58-72`
· ficha `normas/liva-5.yaml` (`verificado_fuente_primaria`)

Texto de la norma (transcrito de `normas/liva-5.yaml`, `texto_vigente`, fr. I):

> «I. Que el impuesto al valor agregado corresponda a bienes, servicios o al uso o goce
> temporal de bienes, **estrictamente indispensables** para la realización de actividades
> distintas de la importación… Para los efectos de esta Ley, se consideran estrictamente
> indispensables las erogaciones efectuadas por el contribuyente que sean deducibles para
> los fines del impuesto sobre la renta… **Tratándose de erogaciones parcialmente
> deducibles** para los fines del impuesto sobre la renta, únicamente se considerará para
> los efectos del acreditamiento… **en la proporción en la que dichas erogaciones sean
> deducibles** para los fines del impuesto sobre la renta.»

El motor levanta la observación (`:637-640`) y **no toca nada más**. Lo verifiqué lista
por lista:

```ts
// engine.ts:235-236 — renglones_ajenos NO aparece en ninguna
export const NO_DEDUCIBLE_ISR: TipoDiferencia[] = ['rfc_receptor', 'cfdi_cancelado', …];
export const POR_CONFIRMAR:   TipoDiferencia[] = ['combustible_efectivo', …, 'ticket_monedero'];
// engine.ts:1225 — tampoco
const SIN_ACREDITAMIENTO: TipoDiferencia[] = [… 'consumo_bar', 'moneda_extranjera'];
// engine.ts:1425 — tampoco
const REVISAR: TipoDiferencia[] = [… 'texto_sospechoso', 'fecha_sospechosa', 'consumo_bar', …];
```

Resultado en cadena: `cubetaDe` cae al `return 'deducible'` de `:262`;
`proporcionDeducible.get(g.id) ?? 1` (`:1404`) devuelve **1**, así que
`totalDeducible += g.monto` **completo** (`:1405-1406`); `deducibilidad.ts:72` imprime
`{ label: 'Deducible para ISR', tono: 'bueno' }` —verde, sin pie—; y `hayRevisar`
(`:1426`) es **false**, así que con el anticipo cuadrado el estatus final es
`'cuadrada'` (`:1428`).

**Escenario (el ticket textual del propio comentario del código, `engine.ts:610-612`).**
Walmart, $640.49, con CFDI timbrado a la flota: $299 de manguera de jardinería, $258 de
dos tapetes, $83.49 de comida. Concepto `otro` (el prompt del OCR manda «usa el concepto
de lo que domina el importe»), tope de política `otro` $1,500 → sin `sobre_politica`.

| | lo que imprime el motor | lo que sostiene LIVA 5-I / LISR 27-I |
|---|---|---|
| cubeta | **Deducible para ISR $640.49** (verde, `tono: 'bueno'`) | erogación **parcialmente** deducible: $557 no son estrictamente indispensables de un viaje de carga |
| estatus de la liquidación | **`cuadrada`** | una decisión pendiente de una persona |
| nota al pie | «incluye $557.00 en partidas que no parecen gasto de viaje… decide **qué parte es deducible**» | — |

Las dos últimas filas se contradicen **en la misma hoja**: el renglón grande afirma que
todo es deducible y la letra chica pide que alguien decida qué parte lo es.

**Intento de refutación, y es serio.** ¿No es correcto abstenerse, dado que `ajenoAlViaje`
es un juicio de un modelo y solo una persona puede rechazar un gasto? Sí — pero el motor
tiene un tercer estado exactamente para eso, y ya lo usa para un juicio **más débil**. El
comentario de `SENAL_BAR` (`engine.ts:206-218`) lo escribe él mismo:

> «el motor **NO puede afirmar 0% sin inventar**; lo que sí puede es **NO afirmar
> "deducible al 100%"** cuando la razón social o el producto gritan bar… el gasto va a
> **POR CONFIRMAR** (tercer estado), no a deducible.»

`consumo_bar` sale de un **regex sobre la razón social** y va a `POR_CONFIRMAR`, a
`SIN_ACREDITAMIENTO` y a `REVISAR`. `renglones_ajenos` sale de un modelo de visión que
**leyó las partidas** y no va a ninguna. La abstención correcta no es «deducible»: es
`por_confirmar`. ¿Y el IVA? Hoy la mitad de IVA está **neutralizada por accidente**: un
CFDI de Walmart con 8 conceptos entra por la ruta consolidada y nunca recibe
`xml_verificado`, así que `engine.ts:1248` corta antes. Es el CRÍTICO reincidente F1
tapando a éste — el día que F1 se cierre, este ticket acreditará **$88.34 de IVA** al 100%
sobre una manguera de jardinería.

**Causa raíz probable:** el tipo de diferencia se agregó al motor, al rótulo, al
`SIN_NORMA` y al mapa de avisos, y no a las cinco listas de `engine.ts` que son las que de
verdad deciden la cifra.

---

### [MEDIO · NUEVO] El 15% de `renglones_ajenos` es una materialidad que ninguna ficha concede, se mide sobre el total del ticket, y se llama igual que el 15% de la RFA 2.9 en el mismo documento

`src/lib/likida/cuadre/engine.ts:634`
· fichas `normas/liva-5.yaml` (fr. I, `verificado_fuente_primaria`) y
`normas/rfa-2026-2.9.yaml` (`verificado_fuente_primaria`)

```ts
// engine.ts:634
if (ajenos.length > 0 && sumaAjena > 0 && g.monto > 0 && sumaAjena / g.monto >= 0.15) {
```

El comentario que lo justifica (`:631-633`) dice «un solo renglón de a peso no vale una
observación». El umbral no es «un peso»: es **el 15% del ticket**, y la fr. I de la
LIVA —y la exigencia de «estrictamente indispensable» que define— **no tiene de minimis**.

**Escenario.** Ticket de autoservicio de **$8,000** de un viaje largo: $1,120 en
electrónica personal y ropa (**14.0%**), $6,880 de comida y consumibles del camión. El
motor **no levanta nada**, la liquidación sale `cuadrada` y $1,120 se imprimen dentro de
«Deducible para ISR». Un ticket de $640 con $95 de crema (14.8%) idem.

Dos observaciones más sobre la aritmética, que el MAPA me pidió verificar explícitamente:

- **Base vs. total: está bien.** El prompt retirado pedía el importe «TAL CUAL aparece en
  la columna de la derecha» (`git show 6340aac -- src/lib/likida/intake/ocr.ts`, línea
  174 del diff) y `g.monto` es el TOTAL del comprobante (`ocr.ts:508`). En un ticket de
  autoservicio mexicano ambos llevan IVA, así que el cociente es homogéneo. En un ticket
  de restaurante, donde las partidas van sin IVA y sin propina, el cociente queda
  **subestimado** — el error va del lado de marcar de menos, que es el conservador para
  el operador y el caro para el fisco.
- **El nombre.** «15%» ya significa una cosa muy concreta en este producto —el tope de la
  RFA 2026 regla 2.9, `engine.ts:514`— y ahora significa dos en el mismo PDF. La nota de
  `renglones_ajenos` no dice de dónde sale su 15%, y `SIN_NORMA`
  (`por_diferencia.ts:91`) declara con razón que no hay ficha detrás. Un contralor que
  vea las dos cifras en la misma hoja tiene derecho a confundirlas.

---

### [MEDIO · NUEVO] `floor(horas / 24)` no es la dirección conservadora justo en los dos plazos que motivaron el cambio, y el comentario que lo justifica invoca un cierre que esa rama no imprime

`src/lib/likida/facturacion/caducidad.ts:75-89` · `src/lib/likida/cuadre/engine.ts:987-993`
· `src/lib/likida/cuadre/renglones_y_plazo.test.ts:33-41`
· ficha `normas/politica-portales-plazos.yaml` (`uso_permitido_hoy`)

El MAPA me pidió la aritmética con valores concretos. Aquí está, y el resultado no es el
que el commit afirma.

`normalizarFecha` (`intake/fecha.ts:4-12`) devuelve **solo la fecha**: la hora de compra
nunca existe. `calcularCaducidad` hace `compra + Math.floor(horas/24) * DIA_MS` y el
plazo «vence al FINAL del día límite» (`caducidad.ts:93`).

| compra | plazo impreso | `fechaLimite` que sale | vencimiento real | diferencia |
|---|---|---|---|---|
| 25-ago **18:00** | 24 h | **2026-08-26** (hasta las 23:59) | 26-ago 18:00 | **+6 h de más** |
| 19-ago **12:44** (el ticket real) | 24 h | 2026-08-20 | 20-ago 12:44 | **+11 h de más** |
| 16-ago 20:00 (Boston's) | 72 h | 2026-08-19 | 19-ago 20:00 | **+4 h de más** |
| 10-ago 12:44 | 36 h | 2026-08-11 | 12-ago 00:44 | −1 h (conservador) |
| 10-ago 18:00 | 12 h | 2026-08-10 | 11-ago 06:00 | −6 h (conservador) |

`floor` es conservador **solo cuando las horas no son múltiplo de 24**. Los dos plazos
que el commit cita como motivo —24 y 72— **son múltiplos de 24**, y en ellos el día
límite completo siempre promete `24 − hora_de_compra` horas que ya no existen. La prueba
que afirma lo contrario (`renglones_y_plazo.test.ts:33`, *«las horas se truncan hacia
ABAJO — la dirección conservadora»*) solo verifica los dos casos donde sí lo es (36 y 12).

Y el comentario que sostiene la decisión (`caducidad.ts:85-88`) dice:

> «El último día puede ser PARCIAL y eso no se oculta: **el mensaje del motor ya cierra
> con que la ventana del comercio puede ser menor**.»

Eso **no es cierto para esta rama**. `engine.ts:987-993` tiene tres cierres, y la frase
«la ventana del comercio no está verificada y **puede ser menor**» vive únicamente en el
tercero (`:993`, el del catálogo sin verificar). La rama del plazo impreso (`:990`) dice
«plazo impreso en el propio ticket, no de la ley: legalmente puedes exigir la factura
dentro del ejercicio» — el matiz legal que la ficha exige, sí; el matiz de la hora
parcial, **no**.

*(Inerte hoy por el hallazgo anterior; se vuelve real el día que `plazo_facturacion_horas`
regrese. Nota de menor calibre en la misma zona: `engine.ts:951` exige
`Number.isFinite(horasImpresas)` y `:954` no, así que `plazoDelTicket` puede quedar `true`
con una fecha calculada desde el catálogo — un rótulo de procedencia falso. `jsonb` no
puede almacenar `Infinity`, así que es inalcanzable; lo anoto por ser dos guardas
distintas sobre el mismo valor en líneas contiguas.)*

---

### [MEDIO · NUEVO] El acuse que sustituyó al silencio afirma en PESOS el monto de un comprobante en moneda extranjera

`src/lib/likida/processor.ts:1786-1797, 1814-1824` · `src/lib/likida/acuse_ticket.ts:234-243`
· `src/lib/formato.ts:125-127` · ficha `normas/liva-5.yaml` (fr. II, `verificado_fuente_primaria`)

`6340aac` cambió el peldaño `silencio` por `acusar`, así que ahora **toda** lectura sólida
recibe respuesta. El acuse se arma con `montoMxn: gasto.monto` (`processor.ts:1787`) y se
formatea con `mxn()`, que es literalmente `currency: 'MXN'` (`formato.ts:126`). El mismo
bloque lee `gasto.ocrExtra` dos líneas antes (`:1785`) y **no consulta `extra.moneda`**,
que es el campo que DAT-19 agregó para esto (`ocr.ts:553`).

**Escenario.** Caseta de EE. UU. o comida en la frontera, ticket de **USD 45.00**, leído
nítido (confianza 0.95). El chofer recibe:

> Anotado ✅ Caseta · **$45.00** · 19/08/2026
> Llevas $12,345.00 de $20,000.00.

Antes de este delta el sistema callaba y la contradicción vivía solo en el motor, que sí
la detecta (`engine.ts:604`, `moneda_extranjera`, y la excluye de `SIN_ACREDITAMIENTO`
en `:1225` para no acreditar su IVA). Ahora el producto **afirma** una cifra en pesos que
es en dólares, y la suma al saldo del viaje en la misma pantalla. Rompe «un rótulo tiene
que ser verdad»; el motor lo corrige después, el chofer no.

*(Superficie compartida con el rubro agéntico; la anoto aquí porque el defecto es la
unidad de una cifra, no el mensaje.)*

---

### [CRÍTICO · REINCIDENTE] Un CFDI con dos o más conceptos nunca recibe `xml_verificado`: su IVA, su estímulo de peaje y sus litros de diésel salen en cero, sin una línea que lo diga

`src/lib/likida/processor.ts:2045` → `src/lib/likida/intake/consolidado.ts:197-235`
→ `src/lib/likida/cuadre/engine.ts:1248`
· fichas `normas/liva-5.yaml`, `normas/lif-2026-20-A.yaml`, `normas/rmf-2026-9.1.8.yaml`
(las tres `verificado_fuente_primaria`)

> `normas/liva-5.yaml`, fr. II: «Que el impuesto al valor agregado haya sido **trasladado
> expresamente al contribuyente y que conste por separado en los comprobantes fiscales**…»

Sin cambio. Reverificado hoy por los dos extremos: `grep -rn "xml_verificado" src/lib/likida
supabase/migrations` devuelve **un solo productor** (`repo.ts:768`, dentro de
`updateGastoCfdiXml`), y la ruta consolidada —`ligarLineaAGasto`, `consolidado.ts:197`—
escribe `cfdi_uuid`, `cfdi_orden`, `clave_prod_serv` y `ocr_extra.litros`, y nada más. La
guarda del motor cambió de línea (`:1193` → **`:1248`**) y no de contenido:
`if (!g.xmlVerificado) continue;`. El escenario y las cifras de `fiscal.md`
(**$60,364 de acreditamiento perdido en un mes**) siguen vigentes tal cual.

---

### [CRÍTICO · REINCIDENTE, 5ª ronda] El numerador del 15% se mide en SQL con `forma_pago = '01'` y se juzga en TS con la lista cerrada de la LISR 27-III

`supabase/migrations/0112_agregados_rpc.sql:151` · `src/lib/likida/cuadre/desde_db.ts:116`
→ `src/lib/likida/cuadre/engine.ts:477, 517, 525`
· ficha `normas/rfa-2026-2.9.yaml` (`verificado_fuente_primaria`)

> «…cuando los pagos por consumo de combustible se realicen **con medios distintos a cheque
> nominativo de la cuenta del contribuyente; tarjeta de crédito, de débito o de servicios;
> o monederos electrónicos autorizados por el SAT**, siempre que estos no excedan el 15 por
> ciento del total de los pagos efectuados por consumo de combustible para realizar su
> actividad.»

```sql
-- 0112:150-151, leído hoy, byte por byte
coalesce(sum(monto), 0) as total,
coalesce(sum(monto) filter (where forma_pago = '01'), 0) as efectivo
```

Y el `comment on function` de `0112:161` sigue prometiendo «**mismo criterio que el motor
de cuadre**». Las cuatro migraciones nuevas del delta (0185–0188) no la tocan. El
escenario de `fiscal.md` —$100,000 de deducción inventada ≈ $30,000 de ISR, con el rótulo
equivocándose por 8× y por 14 puntos— se sostiene sin un cambio.

---

### [CRÍTICO · REINCIDENTE] La pregunta que abre la facilidad del 15% pregunta por «carga / pasaje / turismo» y su respuesta gobierna la RFA 2.9, que exige carga **federal**

`src/app/dashboard/onboarding/forma.tsx:69` · `src/lib/likida/perfil/entrevista.ts:162`
· fichas `normas/rfa-2026-2.9.yaml` y `normas/lif-2026-20-A.yaml`

> RFA 2026 regla 2.9: «Los contribuyentes… **dedicados exclusivamente al autotransporte
> terrestre de carga federal**…»
> LIF 2026 art. 20 ap. A: «…**se dediquen exclusivamente al transporte terrestre público y
> privado, de carga o pasaje, así como el turístico**…»

`forma.tsx:69` sigue diciendo «¿Dedicación exclusiva a transporte de **carga / pasaje /
turismo**?» y `entrevista.ts:162` «…**carga federal, pasaje o turismo**?». Las dos
escriben `dedicacionExclusivaCarga`, que en el motor gobierna **solo** la RFA 2.9
(`engine.ts:477`); `calificaEstimuloPeaje` (`preguntas.ts:126-133`) ni la consulta. Los
$600,000 de deducción indebida ≈ $180,000 de ISR del escenario de la flota de pasaje
siguen exactamente igual.

---

### [CRÍTICO · REINCIDENTE] El tenant del demo sigue con régimen 601 y la facilidad del 15% concedida a mano

`scripts/demo-5k.sql:45` (`'601'`) y `:58`
(`"facilidadCombustibleEfectivo":{"dedicacionExclusivaCarga":true,"regimenElegible":true}`)
· `src/lib/likida/repo.ts:1285` · ficha `normas/rfa-2026-2.9.yaml`

> `condiciones_de_aplicacion`: «Tributar en **Título II Cap. VII (coordinados)** o Título IV
> Cap. II Secc. I (PF act. empresarial)»

Leídos hoy, sin un byte de diferencia. `actualizarFacilidad15` sigue sin leer
`tenant.regimen_fiscal`, y el propio panel se sigue contradiciendo en pantalla
(`admin/flotas/page.tsx:450-453`: «cualquier otro, **601 incluido**, no califica»).

---

### [ALTO · REINCIDENTE] La póliza contable se niega a exportar el periodo entero en cuanto una liquidación trae IVA no acreditable

`src/lib/likida/contabilidad/poliza.ts:107-117, 156-166`
· `src/app/api/export/poliza/route.ts:204-215`
· ficha `normas/liva-5.yaml`, fr. I

> «Tratándose de erogaciones **parcialmente deducibles**… únicamente se considerará para
> los efectos del acreditamiento… **en la proporción en la que dichas erogaciones sean
> deducibles**.»

`git diff 8b43121 origin/master -- src/lib/likida/contabilidad/` → **vacío**. El asiento
sigue sin renglón para el IVA que existe en el papel y no se acredita, `poliza.ts:157`
exige cargos = abonos al centavo, y `route.ts:204` convierte un solo bloqueo en un **409
para todo el periodo**. El escenario de `fiscal.md` (VJ-2026-0812, cargos $18,400 vs
abonos $20,000 por un CFDI EFOS) es reproducible línea por línea.

---

### [ALTO · REINCIDENTE, y sigue peor que en la c4] El estímulo de peaje se anula por tres causas distintas sin emitir una sola diferencia, y la pantalla de peajes afirma lo contrario de lo que el motor hace

`src/lib/likida/cuadre/engine.ts:1292-1295` · `src/lib/likida/liquidacion/acreditable.ts:131`
· `src/app/dashboard/agentes/peajes/vista.tsx:305, 308, 309`
· ficha `normas/rmf-2026-9.1.8.yaml` (`verificado_fuente_primaria`)

> Fr. III: «Efectuar los pagos de autopistas mediante la tarjeta de identificación
> automática vehicular o de cualquier otro sistema electrónico de pago…»

Cuatro condiciones y ningún `else` (`:1293`); `acreditable.ts:131` dibuja el renglón solo
`if (liq.peajeAcreditable > 0)`. Y `vista.tsx:305/308/309` siguen afirmando que «Likida no
verifica la forma de pago de cada caseta» (sí lo hace, `MEDIOS_ELECTRONICOS_PEAJE`,
`engine.ts:1279`) y que no conoce ingresos ni parte relacionada (los pide en
`contador/estimulo-peaje.tsx` y **cierra la puerta con ellos**, `engine.ts:1292`).

---

### [ALTO · REINCIDENTE] El denominador del 15% es «lo que Likida vio», y la nota impresa lo llama «el ejercicio»

`src/lib/likida/cuadre/engine.ts:525` ← `desde_db.ts:106` ← `repo.ts:1194-1226`
· ficha `normas/rfa-2026-2.9.yaml`

> «…siempre que estos no excedan el 15 por ciento del **total de los pagos efectuados por
> consumo de combustible para realizar su actividad**.»

Sin cambio. El escenario de la flota con 3 de 15 operadores mandando comprobantes (11%
impreso contra 18% real) sigue vigente.

---

### [ALTO · REINCIDENTE] El panel recalcula la deducibilidad de una liquidación archivada con el contador del 15% de HOY, y el guardia solo mira los TIPOS de diferencia

`src/lib/likida/analytics.ts:1589-1590`, `:1702` · `src/lib/likida/cuadre/engine.ts:529-533`

`efectivo_sobre_15` se sigue empujando sin `esperado` (lo leí hoy: `:530` lleva `tipo`,
`concepto`, `monto`, `nota`, `gastoId` y nada más), así que la llave de deriva de
`analytics.ts:1702` es la palabra a secas y un movimiento dentro del mismo tipo pasa el
portón. **$5,000 sobre el mismo folio**, con el PDF archivado diciendo otra cosa.

---

### [MEDIO · REINCIDENTE] El texto que introduce el onboarding afirma lo contrario de lo que el motor hace

`src/app/dashboard/onboarding/forma.tsx:55-56` · ficha `normas/lif-2026-20-A.yaml`

> «Estas dos son las únicas obligatorias. **Sin ellas el motor aplica el 50% de peaje a
> cualquier flota.**»

`engine.ts:1292` exige `input.elegiblePeaje === true`. Sin la declaración el estímulo es
**$0**, no «a cualquier flota». Sin cambio, y el gemelo de
`contador/inicio-contador.tsx:217` también.

---

### [MEDIO · REINCIDENTE] `liva-5.yaml` sigue sin la fracción III, y la RMF 2.7.1.29 fr. II sigue sin ficha

`normas/liva-5.yaml:26-28` · `src/lib/likida/cuadre/engine.ts:1266-1272`, `fiscal.ts:648-661`

La ficha va de la fr. I a la fr. II y se detiene; la fr. III («efectivamente pagado en el
mes») es la que sostiene el candado del `'99'` en dos módulos, y el fundamento auxiliar
que el código cita para definir `'99'` —RMF 2.7.1.29 fr. II, `engine.ts:1268`— sigue sin
ficha (`ls normas/*.yaml` → 25, ninguna 2.7.1.29). Vale **$1,600 por cada $10,000 de base**
en cada CFDI PPD.

---

### [MEDIO · REINCIDENTE] El uso de CFDI de la mensualidad de Likida es el que se teclea en el portal de la caseta

`src/lib/likida/facturacion/flota_fiscal.ts:85` (`usoCfdi: datos.usoCfdi ?? ''`)
· ficha `normas/cff-29-A.yaml` (`texto_vigente: null` — **no verificable en fuente
primaria**; el hallazgo se sostiene en la contradicción interna del producto). Sin cambio.

---

### [MEDIO · REINCIDENTE] `actualizarRfcOperador` sigue sin un solo llamador: la rama buena del RLISR 57 es inalcanzable

`src/lib/likida/repo.ts:1271` · ficha `normas/rlisr-57.yaml` (`verificado_fuente_primaria`)

> «Si benefician a personas que le prestan **servicios personales subordinados**, los
> comprobantes fiscales **podrán ser expedidos a nombre de dichas personas**…»

`grep -rn "actualizarRfcOperador" src/` fuera de `repo.ts` → **0**. Sin cambio.

---

### [MEDIO · REINCIDENTE] El aviso de WhatsApp presenta el plazo del comercio como vencimiento fiscal

`src/lib/likida/facturacion/enrutar.ts:160-166` · ficha `normas/politica-portales-plazos.yaml`

`⚠️ VENCE HOY` / `⚠️ vence en N día(s)` sin leer `plazoVerificado` y sin una palabra sobre
el plazo legal — mientras el motor, para el mismo hecho, sí lo dice en las tres ramas
(`engine.ts:987-993`). El mismo repositorio dice las dos cosas por dos canales.

---

### [BAJO · REINCIDENTE] Dos cifras del panel siguen tratando «≠ efectivo» como «medio admitido»

`src/lib/likida/fiscal.ts:735` (`iepsDieselDocumentado`) y `:792` (`pctElectronico`).
Sin cambio; siguen sin renderizarse (`grep` en `src/app` → 0), de ahí el BAJO.

---

### [BAJO · REINCIDENTE] Una ficha del índice runtime tiene por título el carácter de bloque YAML

`src/lib/likida/normas/indice.ts:127` — `titulo: ">"`. Sin cambio.

---

### [BAJO · REINCIDENTE y peor] La tabla de cuotas del DOF lleva ahora **cuatro días** sin cubrir el día de hoy, en su segunda ronda seguida

`normas/datos/cuota-ieps-diesel.yaml` — la última semana sigue siendo **2026-08-15 a
2026-08-21** y hoy es **25-ago-2026**. `git diff 8b43121 origin/master -- normas/` →
**vacío**: el delta de 115 archivos no tocó `normas/` ni una vez. No produce cifra
equivocada (`cuota_diesel.ts` devuelve `null` fuera de rango), pero el día que
`cuotaDieselVigente` se conecte al panel, agosto entero no se podrá fechar.

---

## Lo que revisé y está bien

- **El diseño del plazo impreso es correcto y está bien fundado.** La ficha
  `politica-portales-plazos.yaml` ya trae el precedente que lo autoriza (Office Depot,
  «viene del papel») y el mensaje del motor (`engine.ts:990`) cumple su `uso_permitido_hoy`
  al pie de la letra: nombra el plazo como del ticket, no de la ley, y en la misma frase
  dice que legalmente se puede exigir dentro del ejercicio. Lo que falla es el cableado,
  no la lectura de la norma.
- **`renglones_ajenos` está bien declarado en `SIN_NORMA`** (`por_diferencia.ts:88-91`):
  la razón escrita —«La ley no dice que un tapete no sea deducible: dice que el gasto
  tiene que ser estrictamente indispensable (LISR 27-I), y si ESTE lo es o no lo decide la
  flota»— es exactamente el criterio correcto, y así el agente no puede citar una norma
  al explicarlo. `por_diferencia.test.ts` obliga a que todo tipo esté clasificado.
- **`cierre_aviso.ts:143` lo manda a `decision`, no a `panel`**: la canasta mixta llega a
  la cola del jefe. Es la mitad correcta del tratamiento; la que falta es la cubeta.
- **El estímulo de peaje sigue fail-closed de verdad** (`engine.ts:1292`, `=== true`), el
  IEPS acreditable sigue en `const iepsAcreditable = 0` con el motivo escrito
  (`:1236-1238`) y el estímulo se entrega en **litros**, no en pesos: el crítico histórico
  del rubro continúa cerrado.
- **La proporción de LIVA 5-I está bien implementada donde existe** (`engine.ts:1250-1272`,
  con la fr. I transcrita en el comentario) — el problema del segundo hallazgo es que
  `proporcionDeducible` solo se llena desde el tope de alimentación y desde el 15%.
- **`calcularCaducidad` conserva `mes_natural` y `mes_siguiente` intactos** (probado en
  `renglones_y_plazo.test.ts:43-47`): el arreglo del ticket de Office Depot del 25-jul no
  se rompió al añadir la rama de horas.
- **El adaptador de facturación solo recibió `budget`** (`computer_use.ts`,
  `piloto_vision.ts`, `registro.ts`): nada fiscal cambió ahí, y `piloto_vision` ya no
  puede caer a un tenant global.
- **Suite:** `npx vitest run src/lib/likida/cuadre/renglones_y_plazo.test.ts
  src/lib/likida/normas/por_diferencia.test.ts` → 2 archivos, **14 pruebas, 0 fallos**.

---

## Fichas no verificables en esta ronda

`git diff 8b43121 origin/master -- normas/` está **vacío**: ninguna ficha cambió, así que
el estado es el mismo que dejé en `fiscal.md`.

- **`lisr-27-III`** — `evidencia_corroborante`, «NO se leyó en diputados.gob.mx».
  **SEXTA ronda seguida.** Es la que sostiene el veredicto «no deducible» más frecuente
  del motor; por eso los hallazgos del 15% se anclan en la RFA 2.9, que sí está verificada
  y transcribe la misma lista.
- **`liva-5`** — la fr. III sobre la que deciden dos módulos no está transcrita.
- **`cff-29-A`** — `texto_vigente: null`; sostiene el hallazgo del `usoCfdi`.
- **`rmf-2026-3.3.1.7`** — `evidencia_corroborante`; ya citada en un veredicto impreso
  (`por_diferencia.ts:69`).
- **`lisr-28-XX`, `rmf-2026-2.7.1.21`, `criterio-1-LIF-PI`, `criterio-1-CFF-PI`** — sin
  texto literal.
- **`politica-portales-plazos`** — `sin_verificar` **a propósito** (jerarquía 6). Lo que
  cité de ella es su directiva de uso y su excepción verificada, no un texto normativo.
- **Sin ficha y citada en código para decidir dinero:** RMF **2.7.1.29 fr. II**
  (`engine.ts:1268`). Y **LISR 27-I**, ahora citada en `por_diferencia.ts:90` — solo en
  comentario, nunca en texto que vea el usuario, así que no es un hallazgo; sí es una
  ficha que hace falta.

**Usables como veredicto (`verificado_fuente_primaria`):** `rfa-2026-2.9`,
`rmf-2026-9.1.8`, `lif-2026-20-A`, `liva-5` (solo frs. I y II), `rlisr-57`, `cff-89-90`,
`cff-30`, `cff-69-B`, `rmf-2026-2.7.7`, `rfa-2026-2.2`, `rmf-2026-2.7.1.48`, `lisr-28-V`.

---

## Lo que NO alcancé a revisar

- **Si el esquema retirado del OCR tumbó algo más.** Verifiqué que `plazoFacturacionHoras`
  y `renglones` no tienen escritor; **no** revisé si `0186`/`0188` (idempotencia y
  presupuesto del runtime) pueden abortar una extracción a media corrida y dejar un gasto
  con `ocr_confianza` pero sin `sub_total` — que sería otra puerta al mismo $0 de IVA.
- **`intake/desglose_peaje.ts` y `/api/export/bitacora-peaje`** contra la **fr. II** de la
  9.1.8. **Sexta ronda seguida.**
- **`facturacion/permiso_cre.ts` + `permisos_cre.json`** contra el padrón de la CNE.
- **El padrón de monederos contra la fuente.** `padron_monederos.json` sigue con
  `consultado_el: 27-jul-2026` y sus 13 RFCs se **imprimen** en la nota del gasto.
- **`facturacion/adaptadores/` completo** por el lado fiscal (si una credencial compartida
  puede emitir un CFDI a nombre de la flota equivocada). Solo leí el diff de esta ronda,
  que es de presupuesto.
- **`carta_porte.ts`** contra `rmf-2026-2.7.7.yaml`: no lo reabrí.
- **Ninguna migración se puede ejecutar aquí** (no hay Postgres): todo lo que digo de SQL
  sale de **leer el archivo**. Lo que depende de eso es `0112:151` y el bloque de póliza
  de `0178:230`; ambos verificados además por el lado de TypeScript.
