# Cumplimiento fiscal — auditoría 19

**Nota: 3/10** (antes 3). Razón del movimiento: **se atacó y subió · mirada más profunda**,
y las dos se cancelan contra el ancla del rubro.

- *Se atacó y subió, de verdad*: el `@Descuento` que la c4 levantó como CRÍTICO **está
  cerrado de punta a punta** —parser (`cfdi_xml.ts:323`), escritura (`processor.ts:2115`,
  `repo.ts:366/765`), lectura (`repo.ts:906/936`), tipo (`types/likida.ts:75-76`), motor
  (`engine.ts:1239`) y prueba con el caso exacto de la norma
  (`peaje_medio_pago.test.ts:121`: $120,000 − $18,000 → $51,000)—. La clave **624
  Coordinados** existe (`0172`, `saas/fiscal.ts:29`, `administracion.ts:195`) y el estímulo
  de peaje dejó de ser fail-open: `engine.ts:1237` exige `elegiblePeaje === true`. Son tres
  cierres estructurales en un solo delta y hay que decirlo.
- *Mirada más profunda*, y es lo que manda: esta ronda abrí el camino que ninguna auditoría
  había abierto —**qué le pasa a un CFDI con más de un concepto**— y la respuesta es que
  pierde `xml_verificado`, `sub_total`, `iva_traslado`, `ieps_traslado` y `forma_pago`. Ese
  comprobante sale del motor con **$0 de IVA acreditable, $0 de estímulo de peaje y 0 litros
  de diésel**, en silencio. Es la migración `0168` de este mismo delta la que declara que ese
  segmento «es justo donde el estímulo vale más», y la cadena que construyó termina un
  eslabón antes del motor.

El ancla no admite matices: «3 o menos si el producto imprime una cifra fiscal equivocada».
Hoy siguen imprimiéndose tres, más una nueva —y la nueva es en la dirección contraria: le
quita al cliente dinero que la ley sí le concede.

**El riesgo mayor del rubro, hoy:** el motor solo acredita lo que pasó por
`updateGastoCfdiXml`, y `processor.ts:2004` desvía a otro camino **cualquier CFDI con dos o
más conceptos** — que es como llegan el monedero, el TAG y media gasolinera. Todo el
acreditamiento del producto está construido sobre una bandera que ese camino nunca escribe.

---

## Verificación de los abiertos de la c4

| Hallazgo de `fiscal-c4.md` | Estado hoy | Evidencia |
|---|---|---|
| **CRÍTICO** · estímulo de peaje sobre `@SubTotal` ignorando `@Descuento` | **CERRADO** | `engine.ts:1239` `Math.max(0, subTotal − (descuento ?? 0))`; columna `0171`; prueba `peaje_medio_pago.test.ts:105-131` |
| **CRÍTICO** · numerador del 15% en SQL `'01'` vs LISR 27-III en TS | **REINCIDENTE (4ª ronda)** | `0112:151` sin tocar; `desde_db.ts:116` idem → **F2** |
| **ALTO** · el panel recalcula una liquidación archivada | **REINCIDENTE** | `analytics.ts:1589-1590`, `:1702` — `efectivo_sobre_15` sigue sin `esperado` (`engine.ts:530`) → **F8** |
| **CRÍTICO** · tenant del demo 601 + facilidad a mano | **REINCIDENTE** | `scripts/demo-5k.sql:45` y `:58` byte por byte; `repo.ts:1285` sigue sin leer `regimen_fiscal` → **F4** |
| **ALTO** · la caseta excluida borra el estímulo sin decirlo | **REINCIDENTE y PEOR** | `engine.ts:1238` sigue sin `diferencias.push`, y ahora son **tres** causas de $0 → **F5** |
| **ALTO** · clave 624 no existe | **CERRADO** | `0172`, `saas/fiscal.ts:29`, `administracion.ts:195` (`['624','612']`) |
| **ALTO** · denominador del 15% = «lo que Likida vio» | **REINCIDENTE** | `engine.ts:525` → **F7** |
| **MEDIO** · `liva-5.yaml` sin fr. III | **REINCIDENTE** | la ficha termina en la fr. II (`normas/liva-5.yaml:26-28`) → **F9** |
| **MEDIO** · `actualizarRfcOperador` sin llamador | **REINCIDENTE** | `repo.ts:1271`; `grep` fuera de `repo.ts` → **0** → **F11** |
| **MEDIO** · `usoCfdi` de la mensualidad se teclea en el portal | **REINCIDENTE** | `facturacion/flota_fiscal.ts:87` `usoCfdi: datos.usoCfdi ?? ''` → **F12** |
| **MEDIO** · el aviso presenta el plazo del comercio como vencimiento | **REINCIDENTE** | `facturacion/enrutar.ts:163-164` `⚠️ VENCE HOY` → **F13** |
| **BAJO** · `iepsDieselDocumentado`/`pctElectronico` con `!== '01'` | **REINCIDENTE** | `fiscal.ts:735` y `:792`; siguen sin renderizarse → **F14** |
| **BAJO** · `indice.ts` con `titulo: ">"` | **REINCIDENTE** | `src/lib/likida/normas/indice.ts:127` → **F15** |

---

## Hallazgos

### [CRÍTICO] Un CFDI con dos o más conceptos nunca recibe `xml_verificado`: su IVA, su estímulo de peaje y sus litros de diésel salen en cero, sin una línea que lo diga

`src/lib/likida/processor.ts:2004` → `src/lib/likida/intake/consolidado.ts:197`
→ `src/lib/likida/cuadre/engine.ts:1193`
· fichas `normas/liva-5.yaml` (`verificado_fuente_primaria`, frs. I y II),
`normas/lif-2026-20-A.yaml` (`verificado_fuente_primaria`),
`normas/rmf-2026-9.1.8.yaml` (`verificado_fuente_primaria`)

Texto de la norma (transcrito de `normas/liva-5.yaml`, `texto_vigente`, fr. II):

> «Que el impuesto al valor agregado haya sido **trasladado expresamente al contribuyente
> y que conste por separado en los comprobantes fiscales** a que se refiere la fracción III
> del artículo 32 de esta Ley.»

Y de `normas/lif-2026-20-A.yaml`, `estimulo_diesel_transporte.texto_vigente`:

> «…el monto que se podrá acreditar será el que resulte de multiplicar la cuota del impuesto
> especial sobre producción y servicios… **por el número de litros importados o
> adquiridos**.»

El requisito de la LIVA se cumple: el CFDI **sí** trae el IVA por separado. Lo que no lo
cumple es la ruta de escritura. `processor.ts:2004` desvía:

```ts
// processor.ts:2004
if (esConsolidado(xml)) {
  const resumen = await guardarYConciliarConsolidado(op.tenantId, xml, xmlText!);
  …
  return;                      // ← nunca llega a updateGastoCfdiXml
}
```

y `esConsolidado` (`intake/cfdi_xml.ts:161-163`) es **`xml.lineas.length > 1`**: no «monedero
o TAG», sino *cualquier* comprobante con dos conceptos. El único escritor de la bandera es
`repo.ts:768` (`xml_verificado: true`), dentro de `updateGastoCfdiXml`, que ese camino ya no
alcanza. Lo que sí escribe la ruta consolidada es exactamente esto:

```ts
// consolidado.ts:197
const cambios: Record<string, unknown> = { cfdi_uuid: cfdiUuid, cfdi_orden: orden };
// :213  cambios.clave_prod_serv = diesel.claveProdServ;
// :219  cambios.ocr_extra = ocrExtra;          // { …, litros }
```

Ni `xml_verificado`, ni `sub_total`, ni `iva_traslado`, ni `ieps_traslado`, ni `forma_pago`.
Y `gasto.xml_verificado` no tiene default (`0006:9`), así que queda `NULL` →
`repo.ts:933` lo mapea a `undefined` → el motor corta en la primera línea del bloque de
acreditamiento:

```ts
// engine.ts:1193
if (!g.xmlVerificado) continue;
```

**Escenario (una flota con monedero y TAG, que es el 54% del gasto real según el propio
`cfdi_xml.ts:15-17`).** Mes de agosto:

| documento | lo que ampara | lo que el motor acredita | lo que la norma concede |
|---|---|---|---|
| CFDI ECC de Edenred, 62 líneas: 4,800 L de diésel, SubTotal $124,000, IVA $19,840 | 4,800 L y $19,840 de IVA | **0 L · $0.00** | 4,800 L (≈ **$10,924** a la cuota disminuida de $2.2760/L, `normas/datos/cuota-ieps-diesel.yaml`) y **$19,840** de IVA acreditable |
| CFDI mensual de TeleVía, 320 casetas, SubTotal $58,000, IVA $9,280, `FormaPago 03` | estímulo del 50% | **$0.00** | **$29,000** (`rmf-2026-9.1.8` fr. IV: importe sin IVA × 0.5) |
| CFDI de gasolinera con 2 conceptos (diésel + aditivo), $11,600 | IVA $1,600 | **$0.00** | **$1,600** |

**$60,364 de acreditamiento perdido en un mes**, y ninguno de los tres renglones aparece en
el PDF ni para negarse: `acreditable.ts:115/123/131` dibuja cada fila con `> 0`, así que un
cero no imprime nada. La sección «ACREDITABLE / RECUPERABLE» sale vacía y el contralor lee
eso como «no había nada que acreditar».

**Intento de refutación.** ¿Lo arregla la migración `0168` de este delta? No — y ése es el
punto: `0168` existe para que «los litros del monedero ya no se tiren» y los guarda bien
(`consolidado.ts:420`, `:534`, `ocr_extra.litros`), pero el motor los descarta antes de
mirarlos, en `engine.ts:1193`, tres líneas antes de leer `ocrExtra.litros` (`:1266`). ¿Hay
prueba que lo cace? `consolidado.test.ts:309` y `:407` verifican que los litros lleguen **al
gasto**; ninguna prueba del repo los sigue hasta `litrosDieselAcreditables`. ¿Es teórico?
`esConsolidado` es `lineas.length > 1`: dos conceptos bastan. ¿No lo salva otro escritor?
`grep -rn "xml_verificado" src/lib/likida` → un solo productor, `repo.ts:768`.

**Consecuencia.** La flota que más vale el producto —la que ya paga con monedero y TAG— es
justo a la que Likida le entrega $0 de estímulo y $0 de IVA, sin decirle por qué. Es la cara
opuesta del error caro: aquí el papel no miente contra el SAT, miente contra el cliente, y en
la primera revisión su contador va a encontrar el IVA que Likida no vio.

**Causa raíz probable:** el camino consolidado se escribió para resolver el *emparejamiento*
(qué línea es qué gasto) y nadie volvió a mirar qué columnas fiscales llenaba el camino 1:1
que sustituye.

---

### [CRÍTICO · REINCIDENTE, 4ª ronda] El numerador del 15% se mide en SQL con `forma_pago = '01'` y se juzga en TS con la lista cerrada de la LISR 27-III: el productor SQL **no se movió**

`supabase/migrations/0112_agregados_rpc.sql:151` ← `src/lib/likida/repo.ts:1194-1226`
← `src/lib/likida/cuadre/desde_db.ts:116` → `src/lib/likida/cuadre/engine.ts:477, 517, 525`
· ficha `normas/rfa-2026-2.9.yaml` (`verificado_fuente_primaria`: **sí**)

Texto de la norma (transcrito de la ficha, `texto_vigente`):

> «…considerarán cumplida la obligación establecida en el artículo 27, fracción III, segundo
> párrafo de la Ley del ISR, cuando los pagos por consumo de combustible se realicen **con
> medios distintos a cheque nominativo de la cuenta del contribuyente; tarjeta de crédito, de
> débito o de servicios; o monederos electrónicos autorizados por el SAT**, siempre que estos
> no excedan el 15 por ciento del total de los pagos efectuados por consumo de combustible
> para realizar su actividad.»

El MAPA me mandó verificar si el productor SQL ya se movió. **No se movió.** Lo leí hoy:

```sql
-- 0112:149-151
select coalesce(sum(monto), 0) as total,
       coalesce(sum(monto) filter (where forma_pago = '01'), 0) as efectivo
```

`grep -rn "sumar_combustible_ejercicio" supabase/migrations/` → solo `0084` y `0112`.
Ninguna de las 21 migraciones nuevas del delta (`0164`–`0184`) la toca. Y el consumidor
directo repite el criterio viejo:

```ts
// desde_db.ts:114-116
const efectivoDeEsteViaje = gastos
  .filter((g) => (g.fecha?.slice(0, 4) ?? anioEjercicio) === anioEjercicio
    && g.formaPago === '01' && (…))
```

mientras el juicio usa el predicado bueno (`engine.ts:477`, `medioNoAdmitidoCombustible`,
que excluye `'02','03','04','05','28','29'` y por tanto **incluye** `'06'`, `'08'`, `'12'`,
`'17'`, `'23'`).

**Escenario (flota 624, dedicación exclusiva a carga federal, ejercicio 2026).** Combustible
del ejercicio ya en la base: **$10,000,000**, de los cuales **$1,400,000** pagados con
`'06' Dinero electrónico` (monedero de red privada, no autorizado por el SAT) y **$0** en
efectivo `'01'`. Tope = **$1,500,000**. Entra un CFDI de diésel de **$200,000** con
`formaPago '06'`:

| paso | valor que produce el código | valor correcto |
|---|---|---|
| `sumar_combustible_ejercicio.efectivo` (`0112:151`) | **$0.00** | $1,400,000.00 |
| `efectivoPrevEjercicio` (`desde_db.ts:118`) | **$0.00** | $1,400,000.00 |
| `cupoRestante` (`engine.ts:517`) | **$1,500,000.00** | $100,000.00 |
| deducible de este comprobante | **$200,000.00** | $100,000.00 |

Y el PDF imprime, literal (`engine.ts:525`):

> «…deducible por la facilidad del 15% (RFA 2026 regla 2.9): el ejercicio lleva **$200,000.00**
> de $10,000,000.00 de combustible pagado con medios que la LISR 27-III no admite (**2%** del
> total, tope 15%).»

La cifra real del ejercicio es **$1,600,000 = 16%**, ya pasada del tope. El rótulo se equivoca
por **8×** y por 14 puntos, y son **$100,000 de deducción inventada ≈ $30,000 de ISR** bajo
la lectura (a) que el motor declara aplicar (`lectura_aplicada_por_el_motor` de la ficha);
bajo la (b), que la misma ficha declara igualmente sostenible, caen los $1,600,000.

**Intento de refutación.** ¿Lo atrapa el fail-closed de `engine.ts:492`? No: solo dispara con
`total <= 0` o ejercicio distinto — protege contra la base **sin medir**, no contra el
numerador **mal medido**. ¿Hay prueba de equivalencia? Sí, y **fija el error**:
`repo_acumulado.test.ts:84-107` espeja la RPC «línea por línea» incluido `forma_pago === '01'`.
¿Compensa `tope15DeGastos` (`fiscal.ts:815`), que sí usa el predicado bueno? No: `grep` fuera
de `fiscal.ts` → 0 llamadores.

**Consecuencia.** Es la cifra que el producto vende como su ventaja. Y el `comment on
function` de `0112:161` sigue prometiendo «mismo criterio que el motor de cuadre», que desde
el merge de la c3 es falso: la documentación de la base afirma la equivalencia que el código
rompió.

**Causa raíz probable:** el arreglo se aplicó al archivo donde el hallazgo señaló la línea
(`engine.ts`) y no al productor del insumo, que vive en otro lenguaje y no sale en el diff.

---

### [CRÍTICO] La pregunta que abre la facilidad del 15% pregunta por «carga / pasaje / turismo» (que es la condición del **estímulo de peaje**) y su respuesta gobierna la **RFA 2.9**, que exige carga **federal**

`src/app/dashboard/onboarding/forma.tsx:69` y `src/lib/likida/perfil/entrevista.ts:162`
→ `src/lib/likida/perfil/preguntas.ts:238, 289, 336-342`
→ `src/lib/likida/cuadre/desde_db.ts:83` → `src/lib/likida/cuadre/engine.ts:477, 521-527`
· fichas `normas/rfa-2026-2.9.yaml` y `normas/lif-2026-20-A.yaml`
(las dos `verificado_fuente_primaria`) · **NUEVO en este delta**

Los dos textos, uno al lado del otro, transcritos de sus fichas:

> RFA 2026 regla 2.9 (`texto_vigente`): «Los contribuyentes personas físicas o morales,
> **dedicados exclusivamente al autotransporte terrestre de carga federal**, que tributen
> conforme al Título II, Capítulo VII o Título IV, Capítulo II, Sección I…»

> LIF 2026 art. 20 ap. A fr. V (`estimulo_peaje.texto_vigente`): «…personas contribuyentes que
> **se dediquen exclusivamente al transporte terrestre público y privado, de carga o pasaje,
> así como el turístico**…»

Son dos ámbitos distintos, y la propia ficha de la LIF lo subraya
(`aplicabilidad_por_segmento`). El producto los fundió en **una** pregunta, redactada con el
ámbito **ancho**, cuya respuesta alimenta solo el estrecho:

```tsx
// dashboard/onboarding/forma.tsx:69-70   (ruta NUEVA de este delta)
<Selector nombre="dedicacion" etiqueta="¿Dedicación exclusiva a transporte de carga / pasaje / turismo?"
  opciones={SI_NO} ayuda="Válvula del 15% de combustible en efectivo (RFA 2.9) y del estímulo de peaje." />
```

```ts
// perfil/entrevista.ts:161-162   (el chat de onboarding, también NUEVO)
titulo: 'Dedicación exclusiva',
pregunta: '¿La flota se dedica exclusivamente al autotransporte terrestre de carga federal, pasaje o turismo?',
```

Las dos escriben `dedicacionExclusivaCarga` (`onboarding.ts:36`, `preguntas.ts:238/289`), que
`facilidad15Declarada` (`preguntas.ts:336-342`) entrega a `desde_db.ts:83` como
`facilidad15`, y que en el motor **solo** gobierna la RFA 2.9 (`engine.ts:477` en adelante).
El estímulo de peaje no lo consulta: `calificaEstimuloPeaje` (`preguntas.ts:126-133`) usa
únicamente ingresos y parte relacionada. O sea: la pregunta se redactó con la condición del
beneficio que **no** la usa.

Que el error es de esta ronda se ve comparando con la ruta vieja, que sí pregunta bien:

```tsx
// admin/flotas/page.tsx:430  (el alta, correcta)
<b>¿Exclusivamente autotransporte de carga federal?</b> — habilita la
facilidad del 15% de diésel en efectivo (RFA 2026 regla 2.9).
```

**Escenario.** «Autobuses del Bajío», transporte de **pasaje** exclusivamente, coordinado
real (624, régimen que la LISR 72 concede también al pasaje). En el onboarding contesta —con
verdad— **Sí** a «¿Dedicación exclusiva a transporte de carga / pasaje / turismo?» y **Sí** a
régimen elegible. `facilidad15 = true`. Diésel del ejercicio $6,000,000, de los cuales
**$600,000** pagados en efectivo (10%, dentro del tope):

| | lo que el producto imprime | lo que la RFA 2.9 concede |
|---|---|---|
| cubeta de esos $600,000 | **deducible** (`combustible_efectivo_dentro15`) | **no deducible** (LISR 27-III sin excepción) |
| nota del PDF (`engine.ts:525`) | «deducible por la **facilidad del 15% (RFA 2026 regla 2.9)**: el ejercicio lleva $600,000.00 de $6,000,000.00… (10% del total, tope 15%)» | la regla no aplica a una flota de pasaje |

**$600,000 de deducción indebida ≈ $180,000 de ISR**, en verde, citando la regla que lo
prohíbe. Lo mismo con una flota de carga **local/estatal** sin permiso federal: la pregunta
del formulario no dice «federal» ni una vez.

**Intento de refutación.** ¿No es un caso de laboratorio, siendo Likida un producto de carga?
`normas/lif-2026-20-A.yaml` (`aplicabilidad_por_segmento`) dice explícitamente que el mercado
del producto incluye pasaje y turismo, y el propio formulario los ofrece en la pregunta. ¿Lo
salva el candado de `regimenElegible`? No: 612 y 624 admiten pasaje. ¿Lo salva alguna nota en
el papel? La nota de `efectivo_no_elegible` (`engine.ts:537`) —la única que menciona
dedicación— solo se emite cuando la flota declaró **no** (`engine.ts:535-539`).

**Causa raíz probable:** una sola casilla del perfil se reutilizó para dos condiciones legales
de alcance distinto, y la redacción se copió del beneficio que no la consume.

---

### [CRÍTICO · REINCIDENTE] El tenant del demo sigue con régimen 601 y la facilidad del 15% concedida a mano, y ahora son **cuatro** rutas de escritura contra **una** que valida

`scripts/demo-5k.sql:45` y `:58` · `src/lib/likida/repo.ts:1285-1304`
· `src/app/admin/flotas/page.tsx:226-238` · `src/app/dashboard/onboarding/forma.tsx:71`
· ficha `normas/rfa-2026-2.9.yaml` (`verificado_fuente_primaria`: **sí**)

Texto de la norma (transcrito de la ficha, `condiciones_de_aplicacion`):

> «Tributar en **Título II Cap. VII (coordinados)** o Título IV Cap. II Secc. I (PF act.
> empresarial)»

```sql
-- demo-5k.sql:45  (Transportes Peninsulares, S.A. de C.V.)
'https://app.likida.ai/aviso/' || t, 'privacidad@tps-demo.mx', '601', '66600', 'G03',
-- demo-5k.sql:58
"facilidadCombustibleEfectivo":{"dedicacionExclusivaCarga":true,"regimenElegible":true}
```

Sin cambio desde la c3. Lo que sí cambió es que hay más puertas: `actualizarFacilidad15`
(`repo.ts:1285`) escribe `regimenElegible` tal cual se lo den y **no lee `tenant.regimen_fiscal`
ni una vez**; la llaman el panel del dueño (`flotas/page.tsx:93`, con un `<select>` de
«Régimen: Sí/No» en `:232-238`), el onboarding nuevo (`onboarding/page.tsx:70`) y el chat
(`entrevista-aplicar.ts:82`). El único sitio que lo **deriva** de la clave sigue siendo el alta
(`administracion.ts:195-196`, `['624','612']`) — y, para su crédito, el chat de entrevista, que
lo deriva de la clave declarada (`entrevista.ts:705`, `v === '612' || v === '624'`). El
formulario de onboarding no: `forma.tsx:71` pide un sí/no libre («¿Régimen fiscal elegible para
la facilidad del 15%?»).

**Escenario.** Se levanta el demo y llega un ticket de diésel de **$8,700** en efectivo (`'01'`).
`desde_db.ts:83-88` lee la config, `facilidad15 = true`, el motor entra por `elegible === true`
(`engine.ts:482`) y emite `combustible_efectivo_dentro15` (`:521-527`, nota en `:525`):

> «Diésel pagado en EFECTIVO — **deducible por la facilidad del 15% (RFA 2026 regla 2.9)**…»

Para una **S.A. de C.V. en régimen 601** la norma dice **$0.00**: la rama correcta
—`efectivo_no_elegible` (`engine.ts:537`, `monto: g.monto`)— nunca se alcanza. El propio panel
se contradice en pantalla: `flotas/page.tsx:450-453` afirma «la facilidad del 15% (RFA 2.9)
exige 624 Coordinados o 612 persona física; cualquier otro, **601 incluido**, no califica».

**Consecuencia.** El error sale impreso, en verde, citando «RFA 2026 regla 2.9», en la única
liquidación que un prospecto mira de cerca.

**Causa raíz probable:** el arreglo se aplicó a una de las rutas que escriben el mismo estado,
y el delta agregó dos rutas nuevas sin la validación.

---

### [ALTO · REINCIDENTE, y peor que en la c4] El estímulo de peaje se anula por **tres** causas distintas sin emitir una sola diferencia, y la pantalla de peajes afirma lo contrario de lo que el motor hace

`src/lib/likida/cuadre/engine.ts:1224, 1237-1241` · `src/lib/likida/liquidacion/acreditable.ts:131`
· `src/app/dashboard/agentes/peajes/vista.tsx:305, 308, 309`
· ficha `normas/rmf-2026-9.1.8.yaml` (`verificado_fuente_primaria`: **sí**)

Texto de la norma (transcrito de la ficha, fr. III):

> «Efectuar los pagos de autopistas mediante la tarjeta de identificación automática vehicular
> o de cualquier otro sistema electrónico de pago con que cuente la autopista y conservar los
> estados de cuenta».

La guarda del motor es correcta y **no emite nada** cuando excluye:

```ts
// engine.ts:1237-1241
const elegiblePeaje = input.elegiblePeaje === true;
if (g.concepto === 'caseta' && (g.subTotal ?? 0) > 0 && peajePagadoElectronicamente && elegiblePeaje) {
  const baseDelEstimulo = Math.max(0, (g.subTotal as number) - (g.descuento ?? 0));
  peajeAcreditable += baseDelEstimulo * peajeFactor;
}
```

Cuatro condiciones y ningún `else`. `acreditable.ts:131` dibuja el renglón con
`if (liq.peajeAcreditable > 0)`, así que el pie que explica la condición se imprime **solo
cuando ya hay cifra**. Y la pantalla dice tres cosas que hoy son falsas:

```tsx
// peajes/vista.tsx:305
"Fr. III — … Likida no verifica la forma de pago de cada caseta"     // sí la verifica: MEDIOS_ELECTRONICOS_PEAJE, engine.ts:1224
// peajes/vista.tsx:308
"Ingresos anuales menores a $300 millones — dato de la flota, Likida no lo conoce"
// peajes/vista.tsx:309
"No ser parte relacionada (LISR art. 179) — dato de la flota, Likida no lo conoce"
```

Las dos últimas eran verdad hasta este delta: hoy Likida **sí** los conoce, los pide en
`dashboard/contador/estimulo-peaje.tsx:99-121` y **cierra la puerta con ellos**
(`engine.ts:1237`). Once líneas más abajo, la misma pantalla imprime `peajeAcreditable`
(`vista.tsx:311-315`) como si incluyera todo lo que los renglones dicen que no filtra.

**Escenario.** Factura consolidada mensual de CAPUFE, 40 casetas, `SubTotal $10,000`, IVA
$1,600, `FormaPago '03'`:

| situación | `peajeAcreditable` | diferencias emitidas | renglón en el PDF |
|---|---|---|---|
| elegibilidad declarada | $5,000.00 | ninguna | «Estímulo de peaje 50% … $5,000.00» |
| `FormaPago '02'` (cheque) | **$0.00** | **ninguna** | **no existe** |
| elegibilidad **sin declarar** (perfil vacío) | **$0.00** | **ninguna** | **no existe** |
| CFDI con 2+ conceptos (F1) | **$0.00** | **ninguna** | **no existe** |

**$5,000 mensuales** que el papel no menciona ni para negarlos. Y el caso «sin declarar» es
el estado de **toda flota nueva**: el fail-closed que este delta introdujo es correcto, pero
su único aviso vive en una tarjeta del panel del contador (`estimulo-peaje.tsx:90-95`) que el
PDF archivado no lleva.

**Consecuencia.** Dos daños opuestos: la flota que sí tiene derecho no sabe que lo perdió, y
la que lee la pantalla de peajes cree que la cifra incluye casetas y condiciones que ya no
incluye. Rompe «un rótulo tiene que ser verdad».

---

### [ALTO] La póliza contable se niega a exportar el periodo **entero** en cuanto una liquidación trae IVA no acreditable, y el mensaje culpa a un descuadre que el contador no puede rastrear

`src/lib/likida/contabilidad/poliza.ts:107-117, 156-166`
· `supabase/migrations/0178_fiscal_retencion_arco_y_perfiles_erp.sql:230-233`
· `src/app/api/export/poliza/route.ts:185-198`
· fichas `normas/liva-5.yaml` (frs. I y II, `verificado_fuente_primaria`) y
`normas/rmf-2026-9.1.8.yaml`

Texto de la norma (transcrito de `normas/liva-5.yaml`, fr. I):

> «Tratándose de erogaciones **parcialmente deducibles** para los fines del impuesto sobre la
> renta, únicamente se considerará para los efectos del acreditamiento… el monto equivalente
> al impuesto al valor agregado que haya sido trasladado al contribuyente… **en la proporción
> en la que dichas erogaciones sean deducibles**.»

El motor aplica esa proporción correctamente (`engine.ts:1209`, `:1217`) y guarda solo el IVA
**acreditable**. La póliza carga la base por concepto (`0178:230`, `sum(gg.sub_total)`) y el
IVA acreditable (`poliza.ts:107-117`), y luego exige que cargos = abonos al centavo
(`poliza.ts:156-166`). El asiento **no tiene renglón para el IVA que existe en el papel y no
se acredita**, así que el cuadre solo cierra cuando *todo* el IVA es acreditable.

**Escenario.** Viaje VJ-2026-0812, anticipo **$20,000**:
- diésel de un emisor en el listado definitivo del 69-B: $11,600 (SubTotal 10,000 + IVA 1,600) → `cfdi_efos`, IVA negado (`engine.ts:1170`, `SIN_ACREDITAMIENTO`);
- caseta: $1,160 (SubTotal 1,000 + IVA 160).

`total_comprobado` = $12,760; `diferencia` = $7,240.

| | valor |
|---|---|
| cargos (10,000 + 1,000 + 160 + 7,240) | **$18,400.00** |
| abonos (anticipo) | **$20,000.00** |
| resultado | `ok:false` → «la póliza no cuadra: cargos 18400.00 vs abonos 20000.00» |

y la ruta convierte ese único bloqueo en un **409 para todo el periodo**
(`route.ts:190-198`: «No se exporta el archivo a medias»). Un trimestre con un solo CFDI
EFOS, un `'99'` o un duplicado no exporta nada. El mismo descuadre lo produce un
`@Descuento`: la póliza carga $120,000 donde el comprobante amparó $102,000, y bloquea por
$18,000 que el mensaje no nombra.

**Intento de refutación.** ¿No es fail-closed correcto? Lo es en la dirección —mejor no
exportar que exportar descuadrado— pero el mensaje atribuye la causa a un descuadre
aritmético y no al hecho fiscal que lo produce, así que el contador no tiene con qué
actuar. Y `poliza.test.ts` (163 líneas) solo prueba casos donde `ivaAcreditable` es el IVA
completo: la combinación IVA-negado + póliza no está cubierta.

**Consecuencia.** La promesa de la landing («el formato que SAP Business One o CONTPAQi ya
sabe importar») se cae exactamente en las liquidaciones que motivan comprar el producto: las
que traen un problema fiscal.

**Causa raíz probable:** el catálogo contable no contempla una cuenta de «IVA no acreditable»
(ni de gasto no deducible), así que el asiento no puede representar lo que el motor sí sabe.

---

### [ALTO · REINCIDENTE] El denominador del 15% es «lo que Likida vio», y la nota impresa lo llama «el ejercicio»

`src/lib/likida/cuadre/engine.ts:525` ← `desde_db.ts:106` ← `repo.ts:1194-1226`
· ficha `normas/rfa-2026-2.9.yaml` (`verificado_fuente_primaria`: **sí**)

> «…siempre que estos no excedan el 15 por ciento del **total de los pagos efectuados por
> consumo de combustible para realizar su actividad**.»

El denominador de la norma es la actividad completa del contribuyente; el del código es la
suma de las filas de `gasto` del tenant en ese año.

**Escenario.** Flota con **$10,000,000** de combustible reales en 2026, **$1,800,000** con
medios no admitidos (**18%**, ya pasada del tope). Solo 3 de sus 15 operadores mandan
comprobantes, así que Likida ve $1,000,000 y $100,000. Entra un diésel en efectivo de $8,700
→ el papel imprime «el ejercicio lleva **$108,700.00 de $1,000,000.00** … (**11%** del total,
tope 15%)». La realidad es **18%**. La cifra se equivoca por **10×**, y ninguna de las dos
notas de la regla 5 lleva la palabra «de lo capturado en Likida».

---

### [ALTO · REINCIDENTE] El panel recalcula la deducibilidad de una liquidación archivada con el contador del 15% de HOY, y el guardia solo mira los TIPOS de diferencia

`src/lib/likida/analytics.ts:1589-1590`, `:1702` · `src/lib/likida/cuadre/engine.ts:530`
· ficha `normas/rfa-2026-2.9.yaml` (`verificado_fuente_primaria`: **sí**)

```ts
// analytics.ts:1589-1590
const liq = await cuadrarDesdeDB(tenantId, viajeId);
if (Math.abs(liq.totalComprobado - totalPersistido) > 0.015) return null;
// analytics.ts:1702 — la llave de deriva
.map((d) => (typeof d.esperado === 'number' ? `${d.tipo}:${d.esperado}` : d.tipo)),
```

y `efectivo_sobre_15` **sigue sin `esperado`** (`engine.ts:529-532`): su llave es la palabra a
secas, así que un movimiento **dentro** del mismo tipo pasa el portón.

**Escenario.** VJ-2026-0310, cerrada en marzo con un diésel en efectivo de $30,000. Al
cerrar: combustible del ejercicio $500,000, tope $75,000, previo $60,000 → deducible
**$15,000**. Al abrirla en diciembre: ejercicio $2,000,000, tope $300,000, previo $280,000 →
deducible **$20,000**. Mismo tipo de diferencia, mismo `totalComprobado`: las dos puertas
pasan. **$5,000 de diferencia sobre el mismo folio**, y el PDF archivado —el que ya está con
el contador— dice $15,000.

---

### [MEDIO] El texto que introduce el onboarding afirma lo contrario de lo que el motor hace desde este delta

`src/app/dashboard/onboarding/forma.tsx:55-56` · ficha `normas/lif-2026-20-A.yaml`
(`verificado_fuente_primaria`)

> «Estas dos son las únicas obligatorias. **Sin ellas el motor aplica el 50% de peaje a
> cualquier flota.** El resto se puede dejar en blanco y completarlo después.»

Es exactamente al revés: `engine.ts:1237` exige `input.elegiblePeaje === true`, y
`desde_db.ts:48-49` traduce `null` a `undefined`. Sin la declaración el estímulo es **$0**,
no «a cualquier flota». El mismo comentario obsoleto vive en
`dashboard/contador/inicio-contador.tsx:217` («el motor fail-open»). No produce una cifra
mala —el código falla del lado bueno— pero le dice al contralor que el producto sobreacredita
por omisión, que es justo la acusación que este repo existe para no merecer.

---

### [MEDIO · REINCIDENTE] `liva-5.yaml` sigue sin transcribir la fracción III, y la superficie que se apoya en ella no bajó

`normas/liva-5.yaml` (`estado_verificacion: verificado_fuente_primaria`, `texto_vigente`
termina en la fr. II, línea 28) · `src/lib/likida/cuadre/engine.ts:1211-1217`
· `src/lib/likida/fiscal.ts:648-661`

La ficha va de la fr. I a la fr. II y se detiene. La fr. III —«efectivamente pagado en el
mes»— es la que sostiene el candado del `'99'` en **dos** módulos. Y el fundamento auxiliar
que el código cita para definir `'99'`, **RMF 2.7.1.29 fr. II** (`engine.ts:125`, `:127`, `:1213`),
**sigue sin ficha**: `ls normas/*.yaml` → 25, ninguna 2.7.1.29. Una ficha marcada
`verificado_fuente_primaria` que no contiene la fracción que se cita apaga la alarma en vez
de encenderla. La decisión vale **$1,600 por cada $10,000 de base** en cada CFDI PPD.

---

### [MEDIO · REINCIDENTE] El uso de CFDI capturado para la mensualidad de Likida es el que se teclea en el portal de la caseta

`src/lib/likida/facturacion/flota_fiscal.ts:87` · ficha `normas/cff-29-A.yaml`
(`texto_vigente: null`, `evidencia_corroborante` — **no verificable en fuente primaria en
esta ronda**; el hallazgo se sostiene en la contradicción interna del producto)

`usoCfdi: datos.usoCfdi ?? ''` es el mismo valor que `dashboard/suscripcion` presenta como
«con estos se emite el CFDI de cada mensualidad». **Escenario:** el dueño elige `I04 — Equipo
de cómputo y accesorios` (una de las tres opciones de `saas/fiscal.ts:34-38`); semanas después
el cron factura 8 casetas por **$2,000** y el portal emite un CFDI con `UsoCFDI = I04` — un
peaje declarado como adquisición de equipo de cómputo, irreversible ante el SAT.

---

### [MEDIO · REINCIDENTE] `actualizarRfcOperador` sigue sin un solo llamador: la rama buena del RLISR 57 es inalcanzable

`src/lib/likida/repo.ts:1271` · ficha `normas/rlisr-57.yaml` (`verificado_fuente_primaria`)

> «Si benefician a personas que le prestan **servicios personales subordinados**, los
> comprobantes fiscales **podrán ser expedidos a nombre de dichas personas**…»

`grep -rn "actualizarRfcOperador" src/` fuera de `repo.ts` → **0**. `operador.rfc` (mig. 0080)
no la escribe nadie, así que `desde_db.ts:67` siempre entrega `operadorRfc = undefined` y el
motor siempre pide «captura su RFC», un dato que ninguna pantalla permite capturar. Un
hospedaje de **$2,500** timbrado al RFC del operador —deducible por el RLISR 57— manda la
liquidación a `revisar` para siempre.

---

### [MEDIO · REINCIDENTE] El aviso de WhatsApp presenta el plazo del comercio como vencimiento fiscal

`src/lib/likida/facturacion/enrutar.ts:160-166` · ficha `normas/politica-portales-plazos.yaml`
(jerarquía 6, `sin_verificar` **a propósito** — lo citado es su directiva de uso)

> «ESTO NO ES UNA NORMA FISCAL. […] El plazo LEGAL para pedir factura es todo el ejercicio (el
> SAT lo dice expresamente) […] El producto **NUNCA** debe presentar estos plazos como una
> obligación fiscal.»

`enrutar.ts:163-164` sigue emitiendo `⚠️ VENCE HOY` / `vence en N día(s)` sin leer
`plazoVerificado` y sin una palabra sobre el plazo legal. **Escenario:** diésel del 3-ago por
$11,600 en un comercio con `plazo: 'mes_natural'`; el 29-ago el encargado lee «vence en 2
día(s)» y el 1-sep da el gasto por perdido: **$10,000** de deducción y **$1,600** de IVA que
el ejercicio entero seguía amparando.

---

### [BAJO · REINCIDENTE] Dos cifras del panel siguen tratando «≠ efectivo» como «medio admitido»

`src/lib/likida/fiscal.ts:735` (`iepsDieselDocumentado`) y `:792` (`pctElectronico`)
· ficha `normas/lif-2026-20-A.yaml` (`verificado_fuente_primaria`)

```ts
// fiscal.ts:735
if (esDieselConIeps(g, o) && g.iepsTraslado !== null && g.formaPago && g.formaPago !== '01') {
// fiscal.ts:792
const electronico = conFormaPago.filter((g) => g.formaPago !== '01').reduce(…);
```

Son las **dos últimas** con el criterio viejo. Un diésel con `'99'` (no pagado) cuenta aquí
como «pago electrónico». BAJO y no ALTO porque ninguna se renderiza hoy
(`grep -rn "iepsDieselDocumentado\|pctElectronico" src/app` → 0).

---

### [BAJO · REINCIDENTE] Una ficha del índice runtime tiene por título el carácter de bloque YAML

`src/lib/likida/normas/indice.ts:127` — `'criterio-1-CFF-PI'` lleva `titulo: ">"`, arrastrado
del volcado del YAML. `normas_sincronizadas.test.ts` compara ficha e índice y no mira que el
valor tenga sentido, así que el error sobrevive a la puerta que existe para atraparlo.

---

### [BAJO] La tabla de cuotas del DOF lleva **tres** semanas sin cubrir el día de hoy

`normas/datos/cuota-ieps-diesel.yaml:66-70` — la última semana es **2026-08-15 a 2026-08-21**
y hoy es **24-ago-2026**. No produce cifra equivocada (`cuota_diesel.ts` devuelve `null` fuera
de rango y `grep` → 0 consumidores fuera del test), pero la vigilancia semanal se atrasa una
semana más cada ronda, y la causa está escrita en el único commit que tocó `normas/` en el
delta (`63d4eac`, «latido de vigilancia — domingo 23-ago, **egress bloqueado**»). El día que
alguien conecte `cuotaDieselVigente` al panel, el estímulo de agosto no se podrá fechar.

---

## Fichas: cuáles ganan y cuáles no son verificables en esta ronda

**Abiertas y leídas esta ronda:** `rmf-2026-3.3.1.7` (**nueva**), `rmf-2026-9.1.8`,
`rfa-2026-2.9`, `lif-2026-20-A`, `liva-5`, `datos/cuota-ieps-diesel`, más consulta puntual de
`lisr-27-III`, `rlisr-57`, `cff-89-90`, `cff-29-A`, `politica-portales-plazos`.

**La ficha nueva, contra el código que dice implementarla — y su estado.**
`normas/rmf-2026-3.3.1.7.yaml` está marcada **`evidencia_corroborante`, NO
`verificado_fuente_primaria`** (`:29`), y su propia `nota_verificacion` lo explica: «Esta
ficha no re-descargó el PDF del SAT en la sesión que la creó». Por la regla del rubro se
anota como **no verificable en esta ronda**: no se asume ni bien ni mal. Dicho eso, el código
que la cita **sí corresponde** a lo transcrito:

> «…por lo que las estaciones de servicio **no deberán emitir el CFDI** a los clientes
> adquirentes de combustibles, por las operaciones que se realicen a través de monederos
> electrónicos autorizados por el SAT.»

`evidencia_monedero.ts:62-91` no adivina: camino A solo afirma con un RFC del padrón semilla,
camino B solo con una línea ECC de **mismo día + misma estación + mismo monto**
(`:76-84`, tolerancias compartidas con `consolidado.ts` y probadas), y `{tipo:'ninguna'}`
significa «no lo sabemos», nunca «no lo es» (`:59-61`). El motor lo emite solo cuando el gasto
**no** tiene CFDI (`engine.ts:449`, `esCombustible && !g.cfdiUuid`) y lo manda a `por_confirmar` (`engine.ts:236`, `POR_CONFIRMAR`), que es el
tratamiento que el segundo párrafo de la regla ordena («podrá realizarse **hasta que**…
cuente con el CFDI y el complemento»). La nota impresa (`evidencia_monedero.ts:94`) cita la
regla y dice lo que la regla dice. **Es el módulo mejor construido del delta.**

**`verificado_fuente_primaria` y por lo tanto usables como veredicto:** `rfa-2026-2.9`
(ancla F2, F3, F4, F7), `rmf-2026-9.1.8` (ancla F5 y respalda el cierre del `@Descuento`),
`lif-2026-20-A` (ancla F3, F5, F14), `liva-5` **solo frs. I y II** (ancla F1, F6),
`rlisr-57`, `cff-89-90`, `cff-30`, `cff-69-B`, `rmf-2026-2.7.7`, `rfa-2026-2.2`,
`rmf-2026-2.7.1.48`, `lisr-28-V`.

**NO verificables en esta ronda** — no se asume ni bien ni mal:
- `rmf-2026-3.3.1.7` — `evidencia_corroborante` (ver arriba). **Nueva y ya citada en un
  veredicto impreso** (`por_diferencia.ts:69`).
- `lisr-27-III` — `evidencia_corroborante`, «NO se leyó en diputados.gob.mx». **Quinta ronda
  seguida.** Es la que sostiene el veredicto «no deducible» más frecuente del motor; por eso
  F2 y F3 se anclan en la RFA 2.9, que sí está verificada y transcribe la misma lista.
- `liva-5` — la fr. III sobre la que deciden dos módulos no está transcrita (F9).
- `cff-29-A` — `texto_vigente: null`; sostiene F10.
- `lisr-28-XX`, `rmf-2026-2.7.1.21`, `criterio-1-LIF-PI`, `criterio-1-CFF-PI` — sin texto
  literal.
- **Sin ficha y citada en código para decidir dinero:** RMF **2.7.1.29 fr. II**
  (`engine.ts:125`, `:127`, `:1213`).

---

## Lo que revisé y está bien

- **El `@Descuento` está cerrado en toda la cadena, no solo donde dolía.** Lo seguí columna
  por columna: `cfdi_xml.ts:323` (atributo del Comprobante, que es el que la identidad del
  Anexo 20 usa) → `processor.ts:2115` → `repo.ts:366` y `:765` → `select` de `repo.ts:906` →
  mapeo `:936` → `types/likida.ts:75-76` → `engine.ts:1239` con `Math.max(0, …)` para un CFDI
  mal formado. Y la migración `0171` deja la columna **nullable a propósito** («`null` es "el
  CFDI no trae descuento", y se distingue de un `0` declarado») y **no recalcula el
  histórico**, que es lo correcto: una liquidación cerrada conserva la cifra con la que se
  cerró. La prueba `peaje_medio_pago.test.ts:105-131` incluye el caso literal de la norma y
  el caso degenerado (descuento > subtotal → base 0).
- **La clave 624 existe de verdad y en los tres lugares:** `0172` (CHECK con las seis claves),
  `saas/fiscal.ts:29` y `REGIMENES_ELEGIBLES = ['624','612']` (`administracion.ts:195`). El
  comentario dice «mig. 0170» donde es la 0172, y eso es todo lo que queda del hallazgo.
- **La puerta de elegibilidad del peaje es fail-closed de verdad:** `desde_db.ts:47-49`
  traduce `null` a `undefined` con el motivo escrito, `engine.ts:1237` exige `=== true`, y
  `calificaEstimuloPeaje` (`preguntas.ts:126-133`) devuelve `{elegible:null}` si falta
  cualquiera de los dos datos. El umbral está bien leído: la ficha dice «ingresos totales
  anuales… **menores** a 300 millones» y el formulario dice «$300 millones exactos ya no
  califican» (`estimulo-peaje.tsx:109`) — es el sentido correcto de la palabra «menores».
- **`decidir()` en `preguntas.ts:86-91` es el candado que este rubro pedía:** un campo con
  procedencia `inferido`, `default` o `ausente` **no** puede gobernar un beneficio fiscal, y
  el tipo `Perfil` no se exporta, así que un agente no puede leer `ingresosAnualesMxn` por su
  cuenta. Es la forma correcta de impedir que un modelo declare un hecho fiscal.
- **`contabilidad/catalogo.ts` no inventa una sola cuenta.** Lee el override crudo de
  `tenant.config.catalogoCuentas` y **no** `getConfig()`, con el motivo escrito (`:12-19`):
  `getConfig` fusiona `DEMO_CONFIG`, cuyas cuentas `600-001` están marcadas demo y se
  asentarían en el ERP del cliente como suyas. Ninguna cuenta del catálogo del SAT se
  hardcodea en el repo — se pregunta.
- **`0178:230-233` corrigió bien a la `0175`:** el primer RPC hacía `coalesce(sub_total,
  monto)` y llamaba a eso «base», mezclando IVA dentro de la cuenta de gasto. Hoy
  `sum(sub_total) filter (where sub_total is not null)` con `bool_and(...) as base_conocida`,
  y la ruta bloquea el archivo (`route.ts:168-175`) en vez de sustituir la base por el total.
  Esa es la disciplina correcta.
- **`iepsAcreditable = 0` sigue `const` con el motivo escrito** (`engine.ts:1180-1183`) y el
  estímulo se entrega en **litros**, no en pesos. El crítico histórico del rubro —confundir
  el IEPS trasladado del CFDI con el estímulo del LIF 20-A, que es cuota semanal × litros—
  continúa cerrado, y `criterio-1-LIF-PI` es la ficha que lo justifica.
- **`0174` está bien razonada:** `liquidacion.diferencia` es `numeric(12,2)`, así que
  `abs(...) >= 0.01` coincidía con la resolución de la columna y equivalía a `<> 0`; el
  cambio a `> 0.01` es el mínimo que excluye el redondeo sin decidir por la flota qué es
  material.
- **`leyendas.ts`** — la eximente del CFF 89 último párrafo (la manifestación **por escrito**)
  está en `LEYENDA_CORTA` y en `leyendaPdf()`, con `cff-89-90.yaml`
  (`verificado_fuente_primaria`) detrás.
- **`deducibilidad.ts:47` y `:55-56`** — el portón que devuelve `null` cuando las tres cubetas no
  suman `totalComprobado` con un centavo de tolerancia: la pantalla se calla antes de
  contradecir su propio total. Y el tono `condicionado` del permiso CRE (`:65-73`) nombra la
  condición de la RFA 2.9 que el motor no verifica.
- **`claveProdServDeLinea` (`consolidado.ts:100-103`)** no confunde gasolina con diésel: solo
  mapea `TipoCombustible = 'Diesel'` a `15101505`, y una clave `15101…` ajena se conserva tal
  cual — el estímulo del LIF 20-A fr. IV solo reconoce la clave del diésel, así que una Magna
  del mismo estado de cuenta no entra (probado en `consolidado.test.ts:420`).
- **Suite:** `npx vitest run src/lib/likida/{cuadre,liquidacion,contabilidad,intake}
  src/lib/likida/fiscal.test.ts` → **79 archivos, 1,025 pruebas, 0 fallos.**

---

## Lo que NO alcancé a revisar

- **`intake/desglose_peaje.ts` y `/api/export/bitacora-peaje`** contra la **fr. II** de la
  9.1.8 (si la bitácora concilia de verdad viaje ↔ estado de cuenta del TAG, o solo lo
  afirma). **Quinta ronda seguida**, y ahora con más razón: F1 pasa por ese mismo pipeline.
- **`facturacion/permiso_cre.ts` + `permisos_cre.json`** contra el padrón de la CNE — la
  condición de la RFA 2.9 que la ficha declara `pendiente_en_producto` y que
  `deducibilidad.ts:65-73` solo advierte.
- **El padrón de monederos contra la fuente.** `padron_monederos.json` afirma 13 RFCs con
  nombre y fecha de autorización, y esos RFCs se **imprimen** en la nota del gasto
  (`evidencia_monedero.ts:96`). No los crucé contra ninguna de las tres URLs del SAT que el
  propio archivo lista; su `consultado_el` es **27-jul-2026** y su propio aviso dice que la
  ventana de renovación (ago-oct) está abierta ahora.
- **`facturacion/adaptadores/` completo** por el lado fiscal (si una credencial compartida
  puede emitir un CFDI a nombre de la flota equivocada). Solo leí el camino del `usoCfdi`.
- **`carta_porte.ts`** contra `rmf-2026-2.7.7.yaml`: lo cruzó la c3 y salió limpio; no lo
  reabrí, así que su estado es «bueno según la c3», no según yo.
- **`0176`, `0177`, `0180`–`0184`** — las leí por encabezado; solo `0168`, `0171`, `0172`,
  `0174`, `0175` y `0178` línea por línea.
- **Ninguna migración se puede ejecutar aquí** (no hay Postgres): todo lo que digo de SQL sale
  de **leer el archivo**. Las afirmaciones que dependen de eso son F2 (`0112:151`), el bloque
  de póliza de F6 (`0178:230`) y la ausencia de `xml_verificado` en la ruta consolidada, que
  además verifiqué por el lado de TypeScript (`grep` de escritores → un solo productor).
