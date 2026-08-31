# Cumplimiento fiscal — auditoría 22

**Nota: 4/10** (antes: s/d). Razón: línea base nueva, sin ancla previa legible
(`.gitignore` deja los reportes de la 21 fuera de este clon). El 4 y no un 6:
la trazabilidad normativa es de las mejores que he visto —34 fichas, texto
literal, `usado_en_codigo` apuntando a archivo y función, y un motor que
declara sus lecturas ambiguas en el papel— pero **tres caminos de dinero
imprimen o exportan una cifra fiscal equivocada hoy**, y uno de ellos es el
caso estrella del producto (diésel en efectivo). El ancla del rubro es
explícita: «3 o menos si el producto imprime una cifra fiscal equivocada». No
bajo de 4 porque los tres errores son *acotados a rutas concretas* y porque la
disciplina de fichas es justamente lo que los hace demostrables.

**El riesgo mayor de hoy:** el arreglo de ayer (`010a7f5`) quitó el único
guardarraíl que impedía que una póliza contablemente falsa saliera hacia el ERP
del cliente. Antes bloqueaba con 409; hoy exporta, y asienta como gasto
deducible exactamente los comprobantes que el PDF de la misma liquidación
declara NO DEDUCIBLES.

---

## Hallazgos

### [CRÍTICO] La póliza asienta como gasto deducible lo que el motor declaró no deducible — y el arreglo de ayer convirtió el bloqueo en exportación

`src/lib/likida/contabilidad/poliza.ts:101-115` (cargo por concepto, sin mirar
cubeta) · `poliza.ts:140-152` (el renglón nuevo de ayer) ·
`supabase/migrations/0178_fiscal_retencion_arco_y_perfiles_erp.sql:229-236`
(la RPC suma **todos** los `gasto` del viaje, sin filtro de deducibilidad ni de
duplicados) · `src/app/api/export/poliza/route.ts:195-201`

norma: `normas/lisr-27-III.yaml` — *"Estar amparadas con un comprobante fiscal
y que los pagos cuyo monto exceda de $2,000.00 se efectúen mediante
transferencia electrónica de fondos… cheque nominativo de la cuenta del
contribuyente, tarjeta de crédito, de débito, de servicios, o los denominados
monederos electrónicos autorizados por el Servicio de Administración
Tributaria."*
norma: `normas/rfa-2026-2.9.yaml` — *"…siempre que estos no excedan el 15 por
ciento del total de los pagos efectuados por consumo de combustible para
realizar su actividad."*
norma: `normas/cff-69-B.yaml` (4º párrafo) — *"Los efectos de la publicación de
este listado serán considerar, con efectos generales, que las operaciones
contenidas en los comprobantes fiscales expedidos por el contribuyente en
cuestión no producen ni produjeron efecto fiscal alguno."*

**Escenario (corrido contra el código real, no razonado en papel):** viaje con
anticipo $60,000; un CFDI de diésel de $58,000 (SubTotal $50,000 + IVA $8,000)
pagado en efectivo, con la flota que **declaró que NO califica** a la facilidad
de la RFA 2.9 (`facilidad15: false` → `efectivo_no_elegible`, que está en
`NO_DEDUCIBLE_ISR`, `engine.ts:236`). El motor entrega
`totalNoDeducible = 58,000`, `ivaAcreditable = 0`, y el PDF imprime «No
deducible $58,000.00» en rojo.

La póliza que baja el contador (`formato=contpaqi`) sale así:

```
5010-001  cargo 50,000.00  «diesel — viaje V-1»              ← CUENTA DE GASTO DEDUCIBLE
1190-002  cargo  8,000.00  «IVA/IEPS no acreditable»
1150-001  abono 60,000.00  «Cancela anticipo»
1160-001  cargo  2,000.00  «devuelve del viaje»
```

**Antes del commit de ayer ese mismo caso devolvía 409** («la póliza no cuadra:
cargos 52,000.00 vs abonos 60,000.00») y el archivo no salía. El renglón nuevo
lo cuadra y lo deja pasar. Idéntico para `rfc_receptor`, `cfdi_cancelado`,
`cfdi_no_encontrado`, `gasto_otro_ejercicio` y para todo lo que cae en
`POR_CONFIRMAR` (`cfdi_efos_indeterminado`, ticket sin timbrar): el catálogo
(`contabilidad/catalogo.ts:27-46`) tiene **una sola cuenta por concepto**, sin
cuenta de gasto no deducible, así que no hay dónde separarlos.

Peor: el guardarraíl de cuadre (`poliza.ts:202-212`, «LA PÓLIZA CUADRA O NO
SALE») quedó **tautológico**. Con `residuo = comprobado − Σsubtotal − IVA
acreditable`, los cargos suman `comprobado + max(dif,0)` por construcción, que
es siempre igual a los abonos. Ya no puede disparar. Corolario medido: dos
copias del mismo ticket de comida de $8,000 —que `copiasDeComprobante`
(`engine.ts:299`) excluye del comprobado pero que la RPC suma dos veces en
`porConcepto`— salen así:

```
5020-001  cargo 16,000.00  «alimentacion — viaje V-2»   ← $8,000 gastados, $16,000 asentados
```

…y la póliza **cuadra**, porque el duplicado de $8,000 se compensó exactamente
contra los $8,000 de IVA no acreditado del otro CFDI. Sin renglón de
`iva_no_acreditable`, sin aviso, sin 409.

**Consecuencia:** la flota. El ERP toma como deducción del ejercicio la base de
comprobantes que el propio producto declaró perdidos, y como gasto real el de
un ticket duplicado. Sobre 200 viajes/mes con un 5% de comprobantes no
deducibles de $50,000 de base son ~$500,000/mes de deducción inexistente
asentada; el ISR asociado (30%) y su actualización y recargos los paga la
flota, y la prueba en su contra la generó Likida. Y el contralor no lo puede
cruzar: el PDF dice una cosa y el archivo que importa su contador dice otra.

**Causa raíz probable:** `poliza.ts` reconstruye el impuesto **por diferencia**
(`comprobado − base − IVA acreditable`) en vez de recibir la cubeta
(`deducible/no_deducible/por_confirmar`) y el impuesto leídos del comprobante;
`cubetaDe` existe y está exportada, pero ni la RPC ni el módulo contable la
consultan.

---

### [CRÍTICO] El diésel en efectivo dentro del 15% de la RFA 2.9 sale 100% deducible y con $0 de IVA acreditable — y la nota solo advierte del IEPS

`src/lib/likida/cuadre/engine.ts:1267` (`SIN_ACREDITAMIENTO` incluye
`combustible_efectivo_dentro15` y `efectivo_sobre_15`) ·
`engine.ts:1285` (el `continue` que salta el gasto entero) ·
`engine.ts:546` (la nota que se imprime) · `src/lib/likida/fiscal.ts:656`
(`ivaSostenible` repite el mismo criterio en el panel del contador)

norma: `normas/liva-5.yaml`, art. 5 fr. I (verificado_fuente_primaria) —
*"Para los efectos de esta Ley, se consideran estrictamente indispensables las
erogaciones efectuadas por el contribuyente que sean deducibles para los fines
del impuesto sobre la renta, aun cuando no se esté obligado al pago de este
último impuesto."*
norma: `normas/rfa-2026-2.9.yaml`, `limite_importante` —
*"Conserva la DEDUCCIÓN para ISR. NO habilita el acreditamiento del **IEPS**:
son dos beneficios distintos y el efectivo solo salva uno."* (dice IEPS; **no
dice IVA**).

**Escenario (corrido con `cuadrarViaje` real):** flota elegible
(`facilidad15: true`), ejercicio con $5,000,000 de combustible, un CFDI de
diésel de $116,000 (SubTotal $100,000 + IVA $16,000, clave 15101505) con
`formaPago: '01'`. Está muy dentro del 15% ($750,000 de cupo).

| forma de pago | totalDeducible | ivaAcreditable | litros |
|---|---|---|---|
| `'01'` efectivo | **$116,000** | **$0** | 0 |
| `'03'` transferencia | $116,000 | $16,000 | 4,300 |

El mismo comprobante, con la misma base deducible declarada por el mismo motor,
pierde los $16,000 de IVA acreditable solo por el medio de pago. Pero la LIVA
no impone medio de pago: su fr. I ata el acreditamiento a que la erogación sea
**deducible para ISR** —y el propio motor acaba de declararla deducible al
100% por la RFA 2.9— y su fr. III solo pide que esté *efectivamente pagada*,
cosa que el efectivo está (así lo afirma la prueba
`engine_iva_medio_pago.test.ts:41`: *«pago en efectivo (01) también acredita —
el efectivo SÍ es pago para IVA»*, para un hospedaje).

Y el rótulo no es verdad: la nota de `engine.ts:546` dice literalmente **«No
acredita IEPS.»** y nada más. El IEPS no se podía acreditar de todos modos
—`iepsAcreditable` es `const … = 0` en `engine.ts:1280`—, así que la
pertenencia de estos dos tipos a `SIN_ACREDITAMIENTO` **no protege nada de lo
que su comentario dice proteger** («la facilidad salva un beneficio, no los
dos») y su único efecto real es tirar el IVA, en silencio. Con
`efectivo_sobre_15` es aún más claro: el motor calcula la proporción deducible
(150,000 de 200,000 en la prueba `rfa29_lectura.test.ts:36`) y aun así acredita
**cero** IVA en vez del 75% que manda la fr. I. Ninguna prueba de la suite
afirma el IVA en la rama elegible: `engine_combustible_medio_pago.test.ts` solo
cubre `facilidad15: false`.

**Consecuencia:** la flota, y en el caso que el producto usa como gancho. Una
flota con $5,000,000 anuales de combustible y 15% en efectivo ($750,000) pierde
~$103,000 al año de IVA acreditable que la ley le concede, y el PDF se lo
presenta bajo el rótulo «IVA acreditable (LIVA art. 5)». Es una cifra fiscal
equivocada impresa citando el artículo que la contradice.

**Causa raíz probable:** `SIN_ACREDITAMIENTO` es una sola lista para dos
preguntas distintas (¿acredita IVA? ¿acredita el estímulo de diésel/peaje?);
los tipos de la RFA 2.9 entraron para cerrar la segunda y cerraron las dos.

---

### [CRÍTICO] El tope de efectivo de LISR 27-III solo mira `'01'`: las formas de pago 06, 08, 12, 17 y 23 salen deducibles con su IVA

`src/lib/likida/cuadre/engine.ts:571` —
`} else if (g.formaPago === '01' && !esCombustible && g.monto > topeEfectivo) {`
· `src/lib/likida/fiscal.ts:458` y `fiscal.ts:652` (el panel del contador y
`ivaSostenible` repiten la misma frontera)

norma: `normas/lisr-27-III.yaml` (evidencia_corroborante; tres fuentes
concordantes) — *"Estar amparadas con un comprobante fiscal y que los pagos
cuyo monto exceda de $2,000.00 se efectúen mediante transferencia electrónica
de fondos desde cuentas abiertas a nombre del contribuyente en instituciones
que componen el sistema financiero…; cheque nominativo de la cuenta del
contribuyente, tarjeta de crédito, de débito, de servicios, o los denominados
monederos electrónicos autorizados por el Servicio de Administración
Tributaria."*

La lista de la ley es **cerrada**, y el motor ya la tiene escrita
(`MEDIOS_LISR_27_III = ['02','03','04','05','28','29']`, `engine.ts:126`) — pero
la usa **solo para combustible** (`medioNoAdmitidoCombustible`). Para todo lo
demás la frontera sigue siendo «¿es `'01'`?», que es exactamente el defecto que
la auditoría 18 (FISC-C3-1, CRÍTICO) documentó y arregló para el diésel
(`engine.ts:134-141`) y que la 19 (F2, CRÍTICO) arregló en
`desde_db.ts:115` y en la migración 0190. La regla general se quedó sin
arreglar.

**Escenario (corrido con `cuadrarViaje` real):** hospedaje de $58,000 (SubTotal
$50,000 + IVA $8,000), CFDI verificado, receptor correcto, vigente ante el SAT.

| `FormaPago` del CFDI | deducible | no deducible | IVA acreditable | diferencias |
|---|---|---|---|---|
| `'01'` Efectivo | $0 | $58,000 | $0 | `efectivo_sobre_tope` |
| `'06'` Dinero electrónico | **$58,000** | $0 | **$8,000** | *(ninguna)* |
| `'08'` Vales de despensa | **$58,000** | $0 | **$8,000** | *(ninguna)* |
| `'12'` Dación en pago | **$58,000** | $0 | **$8,000** | *(ninguna)* |
| `'03'` Transferencia | $58,000 | $0 | $8,000 | *(ninguna)* |

Ninguna de las tres del medio está en la lista del artículo, y el pago excede
$2,000. El PDF imprime «Deducible para ISR $58,000.00» en verde y «IVA
acreditable (LIVA art. 5) $8,000.00», sin una sola diferencia y con la
liquidación en estatus `cuadrada`.

**Consecuencia:** la flota. Es una deducción y un acreditamiento afirmados en
verde que el SAT rechaza en la primera revisión; sobre $58,000 son $17,400 de
ISR más $8,000 de IVA, más actualización y recargos, por comprobante. Y por
`liva-5.yaml` fr. I el IVA cae con la deducción, así que el daño es doble. Es
además el caso que más rápido se dispara con proveedores que timbran mal la
forma de pago.

**Causa raíz probable:** `medioNoAdmitidoCombustible` se generalizó solo al
segundo párrafo de la fracción (combustible) y el primero (>$2,000, cualquier
gasto) se quedó con el literal `'01'` de la versión anterior.

---

### [ALTO] La póliza declara «dato de origen roto» un CFDI perfectamente válido que trae `@Descuento` o retención de IVA, y bloquea el periodo entero

`src/lib/likida/contabilidad/poliza.ts:140-142` (el residuo por diferencia) y
`poliza.ts:153-163` (el bloqueo) · `src/app/api/export/poliza/route.ts:204-216`
(un solo folio bloqueado tira el archivo completo con 409) ·
`src/lib/likida/intake/cfdi_xml.ts:323-335` (se parsean **solo** los
`Traslado`; el nodo `Retenciones` no se lee)

norma: `normas/liva-5.yaml`, art. 5 fr. II —
*"Que el impuesto al valor agregado haya sido trasladado expresamente al
contribuyente y que **conste por separado en los comprobantes fiscales** a que
se refiere la fracción III del artículo 32 de esta Ley."*

El módulo hace lo contrario de lo que la fracción describe: en vez de leer el
impuesto **por separado del comprobante**, lo **deriva por resta**
(`comprobado − Σsubtotal − ivaAcreditable`). Cualquier término del CFDI que no
sea SubTotal ni traslado envenena esa resta.

**Escenario A (corrido):** factura de casetas con `SubTotal 10,000`,
`@Descuento 500`, `IVA 1,520`, `Total 11,020` — un descuento del emisor que el
propio motor sabe leer (`engine.ts:1363` lo resta para la base del estímulo de
peaje). El residuo sale −500 y el export contesta:

> «la póliza no cuadra: el comprobado (11020.00) es menor que la base más el IVA
> acreditable (11520.00) por 500.00. No se inventa un ajuste: revisar la
> liquidación a mano antes de exportar.»

**Escenario B (corrido):** flete subcontratado a un permisionario persona
física — el caso que `fiscal.ts:846-887` (`diagnosticoRetencion`) documenta como
«el único lado que este panel podría ver». `SubTotal 10,000`, `IVA 1,600`,
retención de IVA 4% `400`, `Total 11,200`. Residuo −400, mismo 409, mismo texto.

**Consecuencia:** el contralor y el contador. El entregable que la landing
promete («el formato que SAP Business One o CONTPAQi ya sabe importar, sin
retecleo») no sale para **todo el periodo** por un CFDI sano, y el mensaje manda
al contador a buscar un error que no existe en su liquidación. En una flota que
subcontrata fletes —normal en carga federal— el bloqueo es permanente, no
esporádico. Y el reverso es peor: si en el mismo periodo hay IVA no acreditado
que compense la retención, el residuo cuadra y el IVA retenido —que es una
**cuenta por pagar al SAT**, no un gasto— desaparece del asiento sin renglón.

**Causa raíz probable:** el impuesto se infiere de una identidad
(`anticipo − diferencia`) en vez de leerse de las columnas que ya existen
(`gasto.iva_traslado`, `gasto.ieps_traslado`, `gasto.descuento`), más la
ausencia declarada de una columna de retenciones.

---

### [MEDIO] El export de póliza dice «liquidaciones cerradas» y no filtra estatus: las que están `revisar` se asientan como definitivas

`src/app/api/export/poliza/route.ts:173` —
`detalle: 'No hay liquidaciones cerradas en ese periodo.'` ·
`supabase/migrations/0178_…sql:238-240` — el `where` es solo
`tenant_id` + rango de fechas; `liquidacion.estatus` no aparece.

norma: `normas/cff-69-B.yaml` (4º párrafo, ya citado) y regla del producto «un
rótulo tiene que ser verdad».

**Escenario:** una liquidación con `cfdi_efos_indeterminado` (validación EFOS no
concluyente) queda en estatus `revisar` y en cubeta POR CONFIRMAR — el tercer
estado que la auditoría 21 introdujo justamente para no afirmar nada. Esa
liquidación entra al archivo de póliza como asiento contable definitivo, con su
base cargada a la cuenta de gasto deducible, mientras el emisor puede estar en
el listado definitivo del 69-B.

**Consecuencia:** el contador asienta como firme lo que el sistema mismo dejó
pendiente de revisión humana. Es el mismo hallazgo que el CRÍTICO de arriba
visto desde el otro extremo del tubo, pero se arregla en un sitio distinto (un
filtro en la RPC o en la ruta), por eso va aparte.

---

### [MEDIO] `normas/cff-29-A.yaml` sostiene los cuatro veredictos más duros del motor sin una línea de texto normativo, y fecha sus reformas en el futuro

`normas/cff-29-A.yaml:8` — `texto_vigente: null` ·
`cff-29-A.yaml:16` y `:23` — `fecha: 2026-11-07` (hoy es **2026-08-30**) ·
`src/lib/likida/normas/por_diferencia.ts:31,56-59` — esta ficha es el fundamento
de `comprobante_no_fiscal`, `rfc_receptor`, `cfdi_cancelado`,
`cfdi_no_encontrado` y `cfdi_pendiente`.

norma: `normas/README.md` — *"`usado_en_codigo` apunta a los archivos y líneas
que dependen de la ficha"* y *"Ninguna ficha `sin_verificar` debe sostener una
cifra que el producto imprima."*

Tres de esos cinco tipos están en `NO_DEDUCIBLE_ISR` (`engine.ts:236`) y en
`SIN_ACREDITAMIENTO` (`engine.ts:1267`): son los que tiran una deducción entera
y su IVA. La ficha que los funda no transcribe una sola palabra del artículo
(`nota_verificacion`: *"El texto del artículo NO se transcribió de
diputados.gob.mx. PARA CERRAR: pegar el texto vigente"*), así que **no es
verificable en esta ronda** —el método del rubro lo exige— y el agente tiene
permiso de citarla al explicar por qué un CFDI cancelado no se deduce.

Y las dos `reformas_relevantes` están fechadas **07-nov-2026**, dos meses en el
futuro, descritas en pasado («adiciona el inciso f)», «Se reformó el cuarto
párrafo»). O es un error de captura por 2025-11-07 —la misma fecha de
publicación que `lif-2026-20-A.yaml`— o es una reforma que aún no existe
presentada como derecho vigente. En ambos casos, la vigencia declarada de la
ficha no se sostiene.

**Consecuencia:** el contralor recibe el veredicto más caro del motor
fundamentado en una ficha que no puede confrontar contra un texto. Sin dinero
mal calculado hoy, pero es el ancla que impide auditar los tres CRÍTICOS de
arriba desde la norma.

---

### [MEDIO] La cuota semanal del IEPS de diésel lleva ocho días sin cubrir la fecha de hoy

`normas/datos/cuota-ieps-diesel.yaml:66` — la última semana capturada es
`2026-08-15 a 2026-08-21`. Hoy es 2026-08-30: faltan las semanas del 22-28 y
29-ago.
`src/lib/likida/cuadre/cuota_diesel.ts:131-135` — `cuotaDieselVigente` devuelve
`null` fuera de rango.

norma: `normas/criterio-1-LIF-PI.yaml` — *"El estímulo del IEPS de diésel se
calcula con la CUOTA SEMANAL DISMINUIDA, no con la cuota entera. Calcularlo con
la entera es práctica indebida — de quien lo hace Y de quien le presta el
servicio."* · `normas/lif-2026-20-A.yaml`, `advertencia_critica`: *"«con los
ajustes que, en su caso, correspondan» es la cuota DISMINUIDA, y la cuota cambia
SEMANALMENTE."*

**No hay dinero mal hoy** y hay que decirlo: `engine.ts:1280` deja
`iepsAcreditable = 0` a propósito y el papel entrega LITROS, así que nada
multiplica por una cuota vieja. El hallazgo es de **operación de la memoria
normativa**: la rutina semanal que alimenta el archivo lleva dos viernes sin
correr, y el día que se cablee el cálculo —«es una línea», dice el encabezado
del módulo— una liquidación de esta semana se negará a calcular, o peor, alguien
tapará el hueco con la última conocida. Sobre 200,000 L/mes la diferencia entre
la cuota del 25-jul ($2.0925) y la del 15-ago ($2.2760) son ~$36,700 mensuales.

**Causa raíz probable:** la skill `cuota-diesel` (viernes por la noche) no está
corriendo o falla en silencio; el archivo no tiene ningún chequeo de «cubre
hoy», solo de empalme interno.

---

## Fichas de `normas/` que abrí y contra qué código las comparé

| Ficha | Artículo | Archivo de código | Veredicto |
|---|---|---|---|
| `lisr-27-III.yaml` | LISR 27 fr. III, 1er párr. (>$2,000) | `cuadre/engine.ts:571`, `fiscal.ts:458,652` | **NO CUADRA** — solo juzga `'01'` (CRÍTICO 3) |
| `lisr-27-III.yaml` | LISR 27 fr. III, 2º párr. (combustible) | `cuadre/engine.ts:126,154,493` | cuadra — lista cerrada, `'99'` tratado aparte |
| `rfa-2026-2.9.yaml` | RFA 2026 regla 2.9 (15% efectivo) | `cuadre/engine.ts:493-570`, `desde_db.ts:121`, `repo.ts` `getAcumuladoCombustible` | cuadra en ISR (matriz completa + fail-closed sin base medida); **NO CUADRA en IVA** (CRÍTICO 2) |
| `rfa-2026-2.9.yaml` | permiso CRE del proveedor | `cuadre/engine.ts:857-867`, `liquidacion/deducibilidad.ts:64-71` | cuadra — no se verifica y se **declara** que no se verifica (tono `condicionado`) |
| `liva-5.yaml` | LIVA 5 fr. I (proporción deducible) | `cuadre/tope_alimentacion.ts`, `engine.ts:1306,1327`, `fiscal.ts` | cuadra para alimentación (criterio compartido, sin bifurcación); **no cuadra** para combustible en efectivo |
| `liva-5.yaml` | LIVA 5 fr. II (traslado por separado) | `contabilidad/poliza.ts:140-142` | **NO CUADRA** — el impuesto se deriva por resta (ALTO) |
| `liva-5.yaml` | LIVA 5 fr. III (efectivamente pagado) | `engine.ts:1324-1338`, `intake/rep.ts` | cuadra — `'99'` cierra la puerta, el REP la abre y avisa del mes del pago |
| `lisr-28-V.yaml` | tope $750/día alimentación | `cuadre/tope_alimentacion.ts:94-120`, `engine.ts:1193-1235` | cuadra — por día, por beneficiario, proporción solo entre timbrados |
| `lisr-28-V.yaml` | H1 (hospedaje/transporte que ampare) | `engine.ts:1096-1126` | parcial declarado — aviso, no veredicto (así lo dice la ficha) |
| `lisr-28-V.yaml` | H2 (solo transporte → tarjeta de crédito) | `engine.ts:1145-1160` | cuadra — exige `'04'`, débito no cuenta |
| `lisr-28-V.yaml` | H3 (faja de 50 km) | — | no implementado (declarado en la ficha; falta la base del operador) |
| `lisr-28-XX.yaml` | bares 0%, restaurantes 8.5% | `engine.ts:221-229,1168-1177` | parcial conservador — `pareceBar` manda a POR CONFIRMAR; el 8.5% sigue sin existir (declarado) |
| `lif-2026-20-A.yaml` | fr. IV, estímulo IEPS diésel | `engine.ts:1276-1281,1366-1420`, `liquidacion/acreditable.ts:99-121` | cuadra — litros, nunca pesos; medio de pago con lista cerrada; cotejo litros vs monto |
| `lif-2026-20-A.yaml` | fr. V, estímulo 50% peaje | `engine.ts:1348-1365`, `acreditable.ts:54-88` | cuadra en base y forma; H5 (Red Nacional) y H6 (ingresos/partes relacionadas) siguen abiertos y **declarados en el papel** |
| `rmf-2026-9.1.8.yaml` | fr. III (pago electrónico) y fr. IV (base sin IVA × 0.5) | `engine.ts:186,1348,1362-1364` | cuadra — incluido el `@Descuento` en la base |
| `rmf-2026-9.1.7.yaml` | remisión rota a «carreteras o caminos» | — (`usado_en_codigo: []`) | cuadra la decisión de **no** usarla |
| `red-nacional-autopistas.yaml` | LIF 20-A-V / LCPAF 2o-I | — (`usado_en_codigo: []`) | no implementado — H5, declarado en `CONDICIONES_ESTIMULO_PEAJE` |
| `criterio-1-LIF-PI.yaml` | cuota disminuida, no entera | `cuadre/cuota_diesel.ts`, `normas/datos/cuota-ieps-diesel.yaml` | cuadra en el código; **el dato lleva 8 días vencido** (MEDIO) |
| `cff-69-B.yaml` | 1er vs 4º párrafo (presunto vs definitivo) | `intake/sat.ts:80-86`, `engine.ts:775-781,252,1267` | cuadra — tercer estado, nunca se afirma fraude desde el código del SAT |
| `cff-69-B.yaml` | «no producen efecto fiscal alguno» | `contabilidad/poliza.ts:101-115` | **NO CUADRA** — la póliza los asienta como gasto (CRÍTICO 1) |
| `cff-29-A.yaml` | requisitos del comprobante | `intake/cfdi.ts`, `normas/por_diferencia.ts:31,56-59` | **no verificable en esta ronda** (`texto_vigente: null`) + fechas futuras (MEDIO) |
| `cff-30.yaml` | conservación 5 años | `normas/indice.ts` | cuadra (solo citable, sin cifra) |
| `cff-89-90.yaml` | eximente de la manifestación por escrito | `cuadre/leyendas.ts:36-58` | cuadra — la leyenda dice «puede diferir de los criterios que dé a conocer el SAT», que es la conducta que exime |
| `criterio-1-CFF-PI.yaml` | Anexo 3, práctica indebida | `cuadre/leyendas.ts` | cuadra |
| `rmf-2026-2.7.1.48.yaml` | complemento de hidrocarburos | `engine.ts:802-853`, `normas/indice.ts` `exigibleDesde: null` | cuadra — con exigibilidad sin confirmar solo avisa, no tira la deducción |
| `rmf-2026-3.3.1.7.yaml` | ticket de monedero ≠ factura | `engine.ts:465-473`, `intake/evidencia_monedero.ts` | cuadra — solo afirma con evidencia (padrón o línea ECC) |
| `rmf-2026-2.7.1.21.yaml` | plazo de facturación | `engine.ts:943-1060`, `facturacion/caducidad.ts` | cuadra — y distingue nivel 6 (política del portal) de la ley |
| `politica-portales-plazos.yaml` | nivel 6, sin fuerza legal | `engine.ts:1016-1022` | cuadra — las tres ramas dicen «no es la ley» |
| `rlisr-57.yaml` | comprobante a nombre del subordinado | `engine.ts:751-770` | cuadra — viático al RFC del operador es válido; sin RFC va a revisión, no a rechazo |
| `rmf-2026-2.7.7.yaml` | Carta Porte | `carta_porte.ts` | **no alcancé a compararla** (ver abajo) |
| `rfa-2026-2.2.yaml` | deducción 8% «gasto ciego» | — (`usado_en_codigo: []`) | no implementado, correctamente (excluye combustible) |
| `lss-27.yaml` / `criterios-imss-sbc.yaml` | SBC y anticipo de ruta | — (`usado_en_codigo: []` en ambas) | no implementado; la póliza sí cumple el requisito 2 (cuenta de gasto de operación) y el 4 (reintegro vía `por_cobrar_operador`) |
| `nom-087-sct-2-2017.yaml`, `lft-*`, `reglamento-transito-83`, `tesis-autotransporte`, `lfpdppp-*` | — | — | fuera de rubro o no alcanzadas |

---

## Lo que revisé y está bien

- **El IEPS de diésel nunca se imprime en pesos.** `engine.ts:1280` deja
  `iepsAcreditable = 0` con la razón escrita, `acreditable.ts:115-121` entrega
  **litros** con tono `condicionado`, y `NOTA_LITROS_DIESEL` dice que la cuota
  fechada la pone el contador. Es exactamente lo que el criterio 1/LIF/PI exige
  de quien presta el servicio, y es la decisión que más dinero evita perder.
- **La base del estímulo de peaje.** SubTotal menos `@Descuento`, por 0.5, y
  `BASE_ESTIMULO_PEAJE` explica **por qué no** se toma el total con IVA citando
  la RMF 9.1.8 fr. IV. El pie anterior (que invitaba a subir la base ~13.8%) ya
  no está.
- **`CONDICIONES_ESTIMULO_PEAJE`** enumera las cuatro condiciones de la LIF y
  las tres de la RMF 9.1.8, y dice cuál cerró el motor y cuáles no. Un renglón
  en verde con la condición **en el label**, no escondida en un pie.
- **La proporción de LIVA 5-I vive en un solo archivo** (`tope_alimentacion.ts`)
  y la importan motor y panel. Es la corrección de la auditoría 4 y sigue en pie:
  no hay dos motores de IVA sobre el mismo comprobante.
- **EFOS con tres estados.** `intake/sat.ts:80-86` nunca afirma `efos: true`
  desde el código del SAT porque `ConsultaCFDIService` no distingue presunto de
  definitivo; el arreglo de ayer (`37df270`) metió
  `cfdi_efos_indeterminado` en POR_CONFIRMAR **y** en SIN_ACREDITAMIENTO. Ese
  arreglo está bien hecho y no introdujo error.
- **`'99' Por definir` y el REP.** El IVA no se acredita hasta que el
  complemento de pago liquida el CFDI, y cuando el mes del pago difiere del mes
  del comprobante se emite `iva_mes_del_pago` diciéndolo. Es LIVA 5-III
  completo, no a medias.
- **El complemento de hidrocarburos no decide dinero con una fecha sin
  respaldo.** `exigibleDesde: null` en el índice; `vigenteDesde` de la config
  quedó reducido a filtro de ruido.
- **El fail-closed del 15%**: sin total de combustible del ejercicio medido, o
  con un comprobante de otro ejercicio, el motor **no afirma nada**
  (`engine.ts:508-518`), en vez de evaluar contra un tope de $0.
- **`cuotaDieselVigente` no cae al último valor conocido.** Es el único
  comportamiento correcto para una cuota semanal.
- **Las leyendas del PDF** (`cuadre/leyendas.ts`) llevan la frase literal que el
  último párrafo del CFF 89 exige para la eximente, por escrito y en el
  documento que se archiva.

---

## Lo que NO alcancé a revisar

- **`carta_porte.ts` contra `normas/rmf-2026-2.7.7.yaml`** — 500+ líneas,
  árbol 2.7.7.2.1/2.7.7.2.8, `CAMPOS_CCP` y `validarComplemento` contra el
  Estándar 3.1. Es el rubro con la sanción más severa citada en la ficha
  (presunción de contrabando, CFF 103-XXII) y quedó sin abrir.
- **`facturacion/` completo** (emisión de CFDI vía Facturapi,
  `facturacion_escritura.ts`, el piloto que ya escribe `factura_emitida` y
  `pago_recibido`): requisitos del CFDI que Likida **emite**, no solo los que
  recibe.
- **La RPC `gastos_fiscales_agregados_tenant` (mig. 0151)** — verifiqué que
  `fiscal.ts` reproduce la ley en TS, pero no leí el SQL que arma las celdas;
  una dimensión mal agrupada mueve la cifra del panel del contador sin tocar TS.
- **`intake/desglose_peaje.ts` / `bitacoraRmf918`** y el CSV de
  `api/export/bitacora-peaje` contra la fr. II de la RMF 9.1.8 (conciliación
  viaje por viaje).
- **`normas/nom-087-sct-2-2017.yaml`**, `lft-132-XXXIV`, `reglamento-transito-83`
  y `tesis-autotransporte`: son de operación/laboral y los dejé al auditor
  correspondiente.
- **El efecto en ISR del IVA no acreditable** que la póliza manda a una cuenta
  de balance: no hay ficha de LISR 28-XV en `normas/`, así que no pude comparar
  contra texto normativo si ese impuesto debería ir a resultados en vez de a
  balance. Queda como pregunta abierta para el fiscalista, no como hallazgo.
