# Cumplimiento fiscal — auditoría 24

**Nota: 5/10** (antes 4). Razón del movimiento: **se atacó y subió** — pero un
solo punto. Los dos CRÍTICOS reincidentes de la 23 (FIS-2 proporciones, FIS-3
duplicado) están **de verdad cerrados**: los medí corriendo la ruta real de
export, no leyendo el diff, y la 0281 entrega los insumos que las tres funciones
del motor necesitan. Lo que impide subir más es que **la misma clase de
divergencia que se cerró entre el PDF y la póliza sigue viva entre el PDF y el
panel del contador**, con números medidos, y que el arreglo FIS-5 (juzgar la
forma de pago del REP) se aplicó al motor y no al contador del ejercicio que lo
alimenta. El ancla «3 o menos si el producto imprime una cifra fiscal
equivocada» aplica y tira hacia abajo; lo que sostiene el 5 es que la disciplina
de fichas (37, con las de dinero en `verificado_fuente_primaria`) y las lecturas
declaradas en el papel siguen siendo mejores que las de cualquier competidor.

**El riesgo mayor del rubro, hoy:** el panel `/dashboard/contador` imprime «IVA
acreditable documentado (LIVA art. 5)» **sin aplicar la proporción deducible de
la RFA 2.9** — medido: $16,000 en pantalla contra $0.00 en el PDF de la misma
liquidación, sobre el mismo UUID. Es exactamente la falla que `tope_alimentacion.ts`
existe para impedir («dos motores de IVA acreditable que no coincidían»),
resucitada en la otra mitad de la regla, y el número que se teclea en la
declaración mensual es el de la pantalla.

---

## Hallazgos

### [CRÍTICO] El panel del contador acredita el IVA COMPLETO del combustible en efectivo; el motor acredita solo la proporción del 15%. Misma flota, mismo UUID, dos cifras

`src/lib/likida/fiscal.ts:806-818` (el mapa de proporciones **solo** se llena con
alimentación) · `fiscal.ts:850-851` (`proporciones.get(g.id) ?? 1` — el combustible
nunca está en el mapa) · `fiscal.ts:771` (con `elegible15 === true`, `ivaSostenible`
devuelve `true` y no reparte nada) · `src/app/dashboard/contador/inicio-contador.tsx:546-547`
(la cifra impresa, con la cita al lado) · contra `src/lib/likida/cuadre/engine.ts:726`
(`proporcionDeducible.set(g.id, dentro / g.monto)`) y `engine.ts:1569-1590` (el IVA
por esa proporción) ·
fichas: `normas/liva-5.yaml` (**`verificado_fuente_primaria`: sí**) y
`normas/rfa-2026-2.9.yaml` (**sí**)

Texto de la norma (LIVA art. 5, fr. I, ficha `liva-5.yaml`):

> «Tratándose de erogaciones **parcialmente deducibles** para los fines del
> impuesto sobre la renta, únicamente se considerará para los efectos del
> acreditamiento a que se refiere esta Ley, el monto equivalente al impuesto al
> valor agregado que haya sido trasladado al contribuyente… **en la proporción en
> la que dichas erogaciones sean deducibles** para los fines del impuesto sobre
> la renta.»

Y la propia ficha declara, en `usado_en_codigo`, que eso ya está hecho:

> «`fiscal.ts` — `ivaSostenible` y `resumirFiscal`: el panel del contador acredita
> con la MISMA proporción de la fr. I, no el traslado completo.»

Eso es cierto **solo para el tope de alimentación**. `resumirFiscal` construye
`proporciones` llamando `proporcionAlimentacionPorGasto` (`fiscal.ts:814`) y
nada más; la otra erogación parcialmente deducible del producto —el combustible
pagado con un medio que la LISR 27-III no admite, deducible hasta el 15% por la
RFA 2.9— entra con proporción 1.

**Escenario (medido con `resumirFiscal` y `cuadrarViaje` reales, no razonado en
papel).** Flota elegible a la facilidad (`elegible15: true`), ejercicio con
$1,000,000 de combustible y $150,000 ya pagados en efectivo (el 15% consumido).
Llega un CFDI de diésel de **$116,000** (SubTotal $100,000 + IVA $16,000),
`FormaPago '01'`, CFDI vigente y verificado:

| | motor / PDF | panel del contador |
|---|---|---|
| Deducible ISR | $0 | — |
| No deducible | $116,000 | — |
| **IVA acreditable** | **$0.00** | **$16,000.00** |

Segundo caso medido, con la frontera a la mitad (CFDI PPD de $174,000, SubTotal
$150,000, IVA $24,000, dentro del cupo): motor **$20,689.66**, panel
**$24,000.00** — $3,310.34 de más sobre un solo comprobante.

**Consecuencia:** el contralor. `fiscal.ts:778-779` lo dice él mismo sobre el
caso hermano que sí se arregló: *«el MISMO UUID daba $8,000 en la pantalla y
$0.00 en el PDF, y el que se teclea en la declaración es el de la pantalla»*.
Sobre una flota con $5,000,000 anuales de combustible y su efectivo al límite de
la facilidad, el excedente típico de un ejercicio arrastra decenas de miles de
pesos de IVA acreditado de más — que responde el cliente en una revisión, con el
papel que se lo dio Likida.

**Causa raíz probable:** `resumirFiscal` tiene UN productor de proporciones
(`proporcionAlimentacionPorGasto`) y el motor tiene DOS reglas que parten un
gasto (`proporcionesDeducibles`, `engine.ts:493-513`, ya exportada y con las dos).

---

### [CRÍTICO] El contador del 15% del ejercicio es ciego al complemento de pago; el motor no. Un diésel PPD liquidado en efectivo nunca entra al numerador y la facilidad se concede dos veces

`supabase/migrations/0190_15pct_efectivo_lista_lisr27iii.sql:36-40`
(`where forma_pago is not null and forma_pago <> '99' and forma_pago not in (…)`) ·
`src/lib/likida/cuadre/desde_db.ts:121-125` (`efectivoDeEsteViaje` filtra con
`medioNoAdmitidoCombustible(g.formaPago)` — la forma **cruda**) · contra
`src/lib/likida/cuadre/engine.ts:682` (la rama del 15% juzga
`formaPagoJuzgable`, la forma del REP) y `engine.ts:636-638` (donde se construye) ·
ficha `normas/rfa-2026-2.9.yaml` (**`verificado_fuente_primaria`: sí**)

Texto de la norma (RFA 2026, regla 2.9):

> «…cuando los pagos por consumo de combustible se realicen con medios distintos
> a cheque nominativo…; tarjeta de crédito, de débito o de servicios; o monederos
> electrónicos autorizados por el SAT, **siempre que estos no excedan el 15 por
> ciento del total de los pagos efectuados por consumo de combustible** para
> realizar su actividad.»

FIS-1 (aud. 23) y FIS-5 (aud. 24) hicieron que el motor juzgue el medio **real**:
un CFDI `FormaPago '99'` cuyo REP trae `FormaDePagoP = '01'` se pagó en efectivo
y entra al cubo del 15%. Ninguno de los dos tocó el numerador del ejercicio: la
RPC `sumar_combustible_ejercicio` sigue excluyendo `'99'` explícitamente (su
propio comentario lo justifica con la doctrina anterior: *«'99' tampoco cuenta —
no es un medio distinto, es que no se ha pagado»*), y `desde_db.ts` resta del
previo con la misma forma cruda. El resultado: **ese gasto nunca aparece en
`efectivoPrevEjercicio`**, así que cada liquidación posterior arranca el cupo
desde cero.

**Escenario (medido con `cuadrarViaje` real).** Flota elegible, $1,000,000 de
combustible en el ejercicio → tope de $150,000. Dos liquidaciones, cada una con
un CFDI de diésel de **$174,000** (SubTotal $150,000 + IVA $24,000), `FormaPago
'99'`, REP con `FormaDePagoP '01'` y `pagadoEn 2026-02-15`. Como la RPC devuelve
`efectivo = 0` en ambas corridas:

| | liquidación 1 | liquidación 2 | suma |
|---|---|---|---|
| Deducible (efectivo dentro del 15%) | $150,000 | $150,000 | **$300,000** |
| IVA acreditado | $20,689.66 | $20,689.66 | **$41,379.32** |

El tope real del ejercicio es **$150,000**. Se afirman en verde **$150,000 de
deducción** y **~$20,690 de IVA** que la regla 2.9 no concede. Y el mismo panel
del contador, que sí usa `formaPagoEfectiva` en `tope15DeGastos`
(`fiscal.ts:952`), calcula sobre esos dos comprobantes `estado: 'excedido',
excedente: $295,800` — la pantalla dice «excedido» mientras el PDF afirma la
deducción.

**Consecuencia:** la flota. $150,000 de deducción inexistente son ~$45,000 de ISR
más actualización y recargos, más el IVA acreditado de más, y el papel que lo
sostiene lo emitió Likida. Va en la dirección cara: se afirma un derecho que la
regla niega. No es un borde: la compra de diésel a crédito con liquidación
semanal en caja es rutina en carga federal, y la FASE 7 (mig. 0199) existe
justamente para ingerir esos REP.

**Causa raíz probable:** FIS-5 movió la frontera del medio de pago en TypeScript
y dejó en la RPC y en el término de resta la frontera anterior; no hay una
prueba que ate las dos (la que existe, `fiscal_agregado_15pct.test.ts`, compara
las LISTAS de formas, no la dimensión `pagado_forma`).

---

### [ALTO] «No deducible $116,000» sobre un CFDI impecable del ejercicio anterior: el veredicto más severo del motor lo emite una regla que el propio repo declara sin norma

`src/lib/likida/cuadre/engine.ts:280` (`gasto_otro_ejercicio` dentro de
`NO_DEDUCIBLE_ISR`) · `engine.ts:322` (y dentro de `SIN_IVA_ACREDITABLE`) ·
`engine.ts:937` (la nota impresa) · `src/lib/likida/cuadre/fecha_dudosa.ts:100-103`
(el disparo) · contra `src/lib/likida/normas/por_diferencia.ts:113` ·
ficha: **ninguna** — `por_diferencia.ts` lo declara explícitamente en `SIN_NORMA`

Lo que el propio repo declara sobre esta diferencia (`por_diferencia.ts:113`):

> `gasto_otro_ejercicio: 'Calidad del dato: la fecha, no un veredicto de qué
> norma exacta rige el periodo fiscal.'`

y el encabezado del mismo archivo, sobre `SIN_NORMA`:

> «Que no tengan norma no las hace menos válidas: significa que el agente **NO
> debe citar ley** al explicarlas.»

Pero la diferencia SÍ emite un veredicto legal, y el más caro que el motor tiene.
La nota impresa dice literalmente: *«un gasto de otro ejercicio **no se deduce en
este**»*, y el tipo está en las dos listas duras.

**Escenario (medido con `cuadrarViaje` real).** CFDI de diésel de **$116,000**
(SubTotal $100,000 + IVA $16,000), `FormaPago '03'` (transferencia), XML
verificado, receptor correcto, fechado **2025-12-30**, cuadrado el 2026-02-20
(un viaje de fin de año cerrado tarde, o una factura que el portal timbró
después):

- `totalDeducible 0` · `totalNoDeducible 116,000` · `ivaAcreditable 0` ·
  `litrosDieselAcreditables 0`.
- El PDF imprime «**No deducible $116,000.00**» en rojo, con el pie «Ver las
  diferencias detectadas abajo» (`liquidacion/deducibilidad.ts:96-102`).

Eso no es verdad: el gasto es deducible —en el ejercicio 2025— y su IVA es
acreditable en el mes que corresponde. La afirmación correcta es «no se deduce en
ESTE ejercicio», que es un asunto de periodo, no de pérdida. El propio motor sabe
distinguirlo cuando quiere: para el IVA liberado por REP emite
`iva_mes_del_pago` con la nota «asiéntalo en el periodo del pago»
(`engine.ts:1595-1601`) y **no** quita un peso. Aquí hace lo contrario sobre el
mismo tipo de hecho.

**Consecuencia:** el contralor da por perdidos $116,000 de deducción (~$34,800 de
ISR al 30%) y $16,000 de IVA que su empresa sí tiene, porque el papel se los
declaró perdidos. La ventana es enero-a-diciembre completa: la tolerancia de
`fecha_dudosa.ts:99` solo cubre enero, así que del 1 de febrero en adelante todo
comprobante del año anterior cae aquí.

**Causa raíz probable:** el tipo nació como señal de calidad de lectura (la nota
misma dice «Puede ser un error de lectura») y se metió a `NO_DEDUCIBLE_ISR` para
que la cifra y la frase coincidieran; se eligió la cubeta equivocada de las tres
—el tercer estado (`por_confirmar`) es el que describe «deducible, pero no aquí».

---

### [MEDIO] El consumo de bar acredita su IVA en el panel del contador, y no en el PDF

`src/lib/likida/fiscal.ts:745-789` (`ivaSostenible` no tiene una sola rama de
bar) · `src/lib/likida/fiscal.ts:1064-1120` (`GastoFiscal` / `CeldaFiscal` no
llevan `ocrExtra`, así que `pareceBar` es inevaluable ahí) · contra
`src/lib/likida/cuadre/engine.ts:265-273` (`SENAL_BAR`/`pareceBar`) y
`engine.ts:322` (`consumo_bar` en `SIN_IVA_ACREDITABLE`) ·
fichas: `normas/lisr-28-XX.yaml` (**`verificado_fuente_primaria`: NO** —
`evidencia_corroborante`; queda **no verificable en esta ronda** en cuanto al
0%) y `normas/liva-5.yaml` (**sí**, para el enlace deducible→acreditable)

Texto de la norma (LISR 28, fr. XX, ficha `lisr-28-XX.yaml`, *evidencia
corroborante*):

> «**En ningún caso los consumos en bares serán deducibles.**»

**Escenario (medido).** Ticket de «CANTINA EL GALLO SA DE CV» por **$600**
(SubTotal $517.24 + IVA $82.76), con CFDI vigente y pagado con tarjeta ('04'):

| | motor / PDF | panel del contador |
|---|---|---|
| Deducible | $0 | — |
| Por confirmar | $600 | — |
| **IVA acreditable** | **$0.00** | **$82.76** |

**Consecuencia:** el contralor, y la coherencia del rubro. La cifra es chica por
comprobante, pero el defecto es el mismo del primer CRÍTICO y confirma su forma:
`resumirFiscal` no puede reproducir las decisiones del motor porque el agregado
de la 0282 no le entrega las dimensiones que el motor mira. Lo pongo en MEDIO
—no ALTO— porque la ficha que sostiene el 0% no está en fuente primaria y el
motor mismo trata el caso como tercer estado, no como pérdida.

**Causa raíz probable:** la señal de bar vive en `ocrExtra`, que la RPC de
agregados no proyecta a la celda.

---

### [MEDIO, REINCIDENTE de la 23] La retención del 4% que Likida TIMBRA sigue sin ficha, y el comentario que la funda cita la regla equivocada

`src/lib/likida/carta_porte_cfdi.ts:168` (`const ret = esMoral ? dinero(sub * 0.04) : null`) ·
`carta_porte_cfdi.ts:201-202` (`TasaOCuota="0.040000"` dentro del XML que el PAC
sella) · `carta_porte_cfdi.ts:18-21` (el comentario: *«la regla 3.1.2 de la RMF
fija el 4%»*) · ficha: **no existe** — `normas/` sigue con 37 fichas y ninguna de
LIVA 1-A ni del RLIVA

Lo que el propio repo exige (`normas/README.md`):

> «Ninguna ficha `sin_verificar` debe sostener una cifra que el producto imprima.»

Aquí no hay ficha de ninguna clase. Y la cita es incorrecta por partida doble: el
art. 1-A fr. II inciso c) de la LIVA es la fuente de la **obligación de retener**,
no de la tasa; la tasa del 4% vive en el **Reglamento de la LIVA**, no en la regla
3.1.2 de la RMF, que está en el Título 3 (ISR) y trata otra cosa. Verificado
contra el listado de `normas/`: la 23 lo reportó y la rama no agregó la ficha.

**Escenario:** flete de $10,000 a un cliente persona moral → Likida timbra
SubTotal 10,000, IVA 1,600, **Retención 400**, Total 11,200, y la pantalla lo
justifica con «LIVA 1-A II c». La cifra viaja dentro de un CFDI sellado ante el
SAT y no rastrea a ninguna ficha, así que la skill `vigilancia-normativa` —que
vigila las 37— no la puede vigilar.

**Consecuencia:** el contralor y el SAT. Es la única cifra fiscal que el producto
timbra, y es la que menos trazabilidad tiene de todas las que imprime.

---

### [MEDIO, REINCIDENTE de la 23] El panel sigue afirmando que `gasto.iva_retenido` es una «columna inexistente» y que el nodo `Retenciones` no se parsea — las dos cosas son falsas desde hace dos rondas

`src/lib/likida/fiscal.ts:1005-1011` (`calculable: false`,
`camposFaltantes: ['gasto.iva_retenido (columna inexistente)', 'intake/cfdi_xml.ts: nodo … Retencion[@Impuesto="002"]']`) ·
contra `src/lib/likida/intake/cfdi_xml.ts:353-364` (el nodo **sí** se parsea) y
`supabase/migrations/0281_poliza_v2_cubetas_sin_copias.sql:132-135` (la RPC de la
póliza **sí** lee `gg.iva_retenido` / `gg.isr_retenido`) ·
regla del producto: «un rótulo tiene que ser verdad»

**Escenario:** una flota con $400,000 de fletes subcontratados a permisionarios
persona física y $16,000 de IVA retenido ya guardado. El export de póliza los
asienta correctamente como abono a `retencionesPorPagar`
(`contabilidad/poliza.ts:232-238`); `diagnosticoRetencion`, con los mismos datos
delante, contesta que el dato **no existe en la base**.

**Consecuencia:** sigue sin UI que lo pinte (`grep`: solo consumidores en
pruebas), por eso MEDIO y no ALTO. Pero es el inventario de honestidad del
producto —el que hace creíbles las demás abstenciones— mintiendo sobre su propio
sistema, y la 23 ya lo señaló.

---

### [BAJO] `LIVA 5-III` sostiene las decisiones de IVA a crédito y la ficha `liva-5.yaml` no transcribe la fracción III

`normas/liva-5.yaml` — `texto_vigente` transcribe **solo** las fracciones I y II ·
citada como fundamento del dinero en `src/lib/likida/cuadre/engine.ts:1571-1576`
y `:1591-1601`, `src/lib/likida/fiscal.ts:772-780`, `src/lib/likida/intake/rep.ts:250`
(el mensaje de WhatsApp al operador) y `normas/por_diferencia.ts:37`
(`iva_mes_del_pago: ['liva-art-5']`)

La ficha está en `verificado_fuente_primaria`, y por eso el hallazgo es BAJO: el
documento se leyó. Pero el párrafo que decide si un CFDI PPD de $58,000 acredita
o no sus $8,000 de IVA **no está en el corpus**, así que por el método de este
rubro esa decisión queda *no verificable en esta ronda*. De paso, el acuse por
WhatsApp (`rep.ts:253`) afirma «el IVA se libera hasta la última parcialidad»,
que es la política conservadora del producto y no lo que la fracción dice sobre
un pago parcial; declarada como lectura propia estaría bien, dicha como ley no.

---

## Lo que revisé y está bien

- **FIS-2 (CRÍTICO reincidente 22→23) — CERRADO, verificado.**
  `supabase/migrations/0281_poliza_v2_cubetas_sin_copias.sql:116-134` entrega
  `monto`, `fecha`, `cfdiUuid`, `folio`, `folioNorm`, `descuento` y las
  retenciones por comprobante; `src/app/api/export/poliza/route.ts:149-186`
  llama a `proporcionesDeducibles` (`engine.ts:493`) y parte el renglón. Corrí
  `src/app/api/export/poliza` + `src/lib/likida/contabilidad` +
  `proporciones_deducibles.test.ts`: 76 pruebas verdes, y `salida.test.ts:203-235`
  fija exactamente el caso de la 23 (comida de $2,000 con tope $750 →
  `5020-001 cargo 646.55` / `5990-001 cargo 1,077.59`). Fichas
  `normas/lisr-28-V.yaml` y `normas/liva-5.yaml`, ambas `verificado_fuente_primaria`.
- **FIS-3 (CRÍTICO reincidente 22→23) — CERRADO, verificado.** `route.ts:157-158`
  llama `copiasDeComprobante` antes de repartir y filtra `monto > 0`, con el
  mismo criterio que `totalComprobado`; `salida.test.ts:236-286` fija «dos fotos
  del mismo UUID de $8,000 → UN cargo de 6,896.55» y que las retenciones se
  suman sin copias.
- **FIS-4 — el fail-closed de la RPC es real.** `route.ts:102-110,320-330`:
  `RPC_VERSION_MINIMA = 281` y 409 `rpc_desactualizada` antes de armar nada.
  Degradar a «todo deducible» ya no es una rama alcanzable.
- **El estímulo de IEPS de diésel NO se imprime en pesos.** `engine.ts:1536`
  (`const iepsAcreditable = 0`), `engine.ts:1656-1681` (litros, con la
  verificación de desviación contra precio de referencia) y
  `liquidacion/acreditable.ts:115-121` + `NOTA_LITROS_DIESEL`. Es exactamente lo
  que `normas/lif-2026-20-A.yaml` (`verificado_fuente_primaria`) manda: «cuota
  IEPS vigente al momento de la compra × LITROS. No es el IEPS trasladado en el
  CFDI». `cuadre/cuota_diesel.ts:131-135` es fail-closed fuera del rango cubierto
  y no expone `reduccion_shcp_por_litro`.
- **La base del estímulo de peaje.** `engine.ts:1625-1627` (SubTotal neto de
  `@Descuento` × 0.5, solo con medio electrónico de `MEDIOS_ELECTRONICOS_PEAJE`
  y con `elegiblePeaje === true`) contra `normas/rmf-2026-9.1.8.yaml` fr. IV
  (`verificado_fuente_primaria`): «se aplicará al importe pagado… **sin incluir
  el IVA**, el factor de 0.5». `acreditable.ts:54-88` nombra las cuatro
  condiciones de la LIF y las tres de la 9.1.8 en el mismo papel.
- **FIS-A2 (aud. 23) — cerrado.** `fiscal.ts:867-870`: `iepsDieselDocumentado`
  ya usa `MEDIOS_LISR_27_III` y `formaPagoEfectiva`, no `!== '01'`, y
  `src/lib/mcp/herramientas/dinero.ts:176` lo rotula «NO es el estímulo».
- **FIS-6 — el `'99'` sin REP cae a por confirmar, no a deducible.**
  `engine.ts:156-163,393` y `liquidacion/deducibilidad.ts:82-94` con
  `LEYENDA_PAGO_PENDIENTE`.
- **DAT-3 — los pisos de la 0281.** `0281:40-62`: `gasto_importes_no_negativos`
  y `gasto_descuento_no_excede`, con `not valid` + `validate`.
- **La reconciliación 0283 ↔ 0299.** `0300_gasto_no_tras_liquidar_reconciliado.sql`
  reúne las dos mitades (la punta `old.viaje_id` de la 0283 y el escape del GUC
  + `revision <> 'rechazada'` de la 0299); `liquidacion.revision` es
  `not null default 'pendiente'` (`0299:58`), así que la comparación no tiene el
  hueco del NULL.
- **El tope de alimentación es un solo criterio compartido.**
  `cuadre/tope_alimentacion.ts` (por día, por beneficiario, proporción solo
  entre timbrados) lo usan el motor y el panel; el tope de $750/$1,500 y el
  «solo alimentación» coinciden literalmente con `normas/lisr-28-V.yaml`
  (`verificado_fuente_primaria`).
- **CFF 30.** No hay purga que toque `cfdi_xml_raw`: las de la 0288 son outbox,
  eventos, idempotencia, correo y corridas de agente.
- **Las leyendas del PDF.** `cuadre/leyendas.ts:50-59` y
  `normas/cff-89-90.yaml` (`verificado_fuente_primaria`): la manifestación por
  escrito del último párrafo del art. 89 está en el papel que se archiva, que es
  la conducta que exime.

## Lo que NO alcancé a revisar

- **`facturacion/` completo** (adaptadores de portales, `permiso_cre.ts`,
  `permisos_cre.json`, `caducidad.ts`): solo verifiqué que
  `permiso_cre_no_verificable` sea un aviso y no un veredicto. El cotejo del
  padrón CRE contra el catálogo real de la CNE queda pendiente.
- **`intake/sat.ts` y la validación EFOS** contra `normas/cff-69-B.yaml`: leí las
  listas del motor, no el cliente del servicio ni sus códigos.
- **`intake/desglose_peaje.ts` (bitácora RMF 9.1.8 fr. II)** y el export
  `api/export/bitacora-peaje`: no crucé el CSV contra el texto de la fracción.
- **La carta porte / complemento** más allá de la retención del 4%:
  `carta_porte_cfdi.ts` completo, `nom-087-sct-2-2017.yaml` y
  `rmf-2026-2.7.7.yaml` quedaron sin abrir.
- **`criterio-1-CFF-PI` y `criterio-1-LIF-PI`** (prácticas indebidas del Anexo 3)
  contra el material comercial y el corpus del agente contador.
- **Las 12 fichas sin `verificado_fuente_primaria`** (`lisr-27-III`,
  `lisr-28-XX`, `cff-29-A`, `rmf-2026-2.7.1.21`, `politica-portales-plazos`,
  entre otras): las traté como *no verificables en esta ronda*, ni bien ni mal.
  `lisr-27-III` sigue siendo la más cara de las que faltan — sostiene
  `efectivo_sobre_tope` (NO DEDUCIBLE), la matriz entera de la RFA 2.9 y
  `medio_pago_no_admitido`, y su propia nota dice que el PDF de diputados no se
  leyó. La 23 ya lo señaló y sigue igual.
