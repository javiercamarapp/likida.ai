# Cumplimiento fiscal — auditoría 25

**Nota: 4/10** (antes 5). Razón del movimiento: **mirada más profunda — el código
no cambió y la nota anterior estaba inflada**. Los 7 commits desde la 24
(`592d26f`, `66339d5`, `4198985`, `5180c72`, `3cc8ead`, `aa5304d`, `18fa771`) no
tocan **una sola línea** de este rubro: `git log b8a1a3a..HEAD` sobre
`src/lib/likida/fiscal.ts`, `cuadre/`, `liquidacion/`, `intake/` y `normas/`
devuelve exactamente dos commits, `592d26f` y `18fa771`, y los dos son el latido de
`normas/.latido-vigilancia` — datos, ninguna ficha y ningún código. Los dos
CRÍTICOS que la síntesis de la 24 declaró «lo primero de la ronda 25» siguen
exactamente donde estaban, con los mismos números de línea, y además abrí dos
caminos que la 24 no había abierto (`acreditables_liquidacion_tenant` y el
`TipoDeComprobante` en el intake) y los dos imprimen dinero mal. El ancla del
rubro es explícita —«3 o menos si el producto imprime una cifra fiscal
equivocada»— y hoy lo hace por **cuatro** puertas, no por una. Lo único que
sostiene el 4 y no un 3 es que la disciplina de fichas sigue intacta (37 fichas,
todas las de dinero en `verificado_fuente_primaria`) y que las abstenciones
declaradas —IEPS en litros y no en pesos, permiso CRE nunca afirmado, EFOS nunca
declarado fraude— siguen siendo correctas y verificadas.

**El riesgo mayor del rubro, hoy:** el panel del contador y el PDF de la misma
liquidación siguen dando dos cifras de IVA acreditable sobre el mismo UUID
($16,000.00 contra $0.00), y ahora sé que la divergencia viaja también a la
herramienta MCP `resumen_fiscal` (`dinero.ts:172`) — o sea que el número
equivocado ya no solo se lee en pantalla: un agente lo puede dictar.

---

## Hallazgos

### [CRÍTICO, REINCIDENTE de la 23 y la 24] El panel del contador acredita el IVA COMPLETO del combustible en efectivo; el motor solo la proporción del 15%

`src/lib/likida/fiscal.ts:806-818` (el mapa `proporciones` se llena **solo** con
`proporcionAlimentacionPorGasto`, `:814`) · `fiscal.ts:850`
(`proporciones.get(g.id) ?? 1` — el combustible nunca está en el mapa) ·
`fiscal.ts:771` (con `elegible15 === true`, `ivaSostenible` devuelve `true` y no
reparte nada) · `fiscal.ts:31-45` (la lista de imports: **no importa**
`proporcionesDeducibles`) · contra `src/lib/likida/cuadre/engine.ts:493-513`
(`proporcionesDeducibles`, exportada y con LAS DOS reglas), `engine.ts:726`
(`proporcionDeducible.set(g.id, dentro / g.monto)`) y `engine.ts:1569`
(el IVA por esa proporción) · impreso en
`src/app/dashboard/contador/inicio-contador.tsx:546-547` y en
`src/lib/mcp/herramientas/dinero.ts:172`

Norma: `normas/liva-5.yaml`, **`verificado_fuente_primaria`**, art. 5 fr. I,
línea literal:

> «Tratándose de erogaciones **parcialmente deducibles** para los fines del
> impuesto sobre la renta, únicamente se considerará para los efectos del
> acreditamiento a que se refiere esta Ley, el monto equivalente al impuesto al
> valor agregado que haya sido trasladado al contribuyente […] **en la proporción
> en la que dichas erogaciones sean deducibles** para los fines del impuesto sobre
> la renta.»

Y `normas/rfa-2026-2.9.yaml`, **`verificado_fuente_primaria`**, es la que parte
la erogación:

> «…cuando los pagos por consumo de combustible se realicen con medios distintos a
> cheque nominativo de la cuenta del contribuyente; tarjeta de crédito, de débito
> o de servicios; o monederos electrónicos autorizados por el SAT, **siempre que
> estos no excedan el 15 por ciento del total de los pagos efectuados por consumo
> de combustible** para realizar su actividad.»

`resumirFiscal` tiene UN productor de proporciones (el tope de alimentación de
LISR 28-V) y el motor tiene DOS (ese y el 15% de la RFA 2.9). La segunda no llega
al panel.

**Escenario.** Flota con `elegible15: true`, ejercicio con $1,000,000 de
combustible y $150,000 ya pagados en efectivo (el 15% consumido). Llega un CFDI de
diésel de **$116,000** (SubTotal $100,000 + IVA $16,000), `FormaPago '01'`, XML
verificado, SAT vigente:

| | motor / PDF | panel del contador y `resumen_fiscal` |
|---|---|---|
| Deducible ISR | $0.00 | — |
| **IVA acreditable** | **$0.00** | **$16,000.00** |

Con la frontera a la mitad (CFDI PPD de $174,000 — SubTotal $150,000, IVA
$24,000 — dentro del cupo): motor **$20,689.66**, panel **$24,000.00**, $3,310.34
de más sobre UN comprobante.

**Consecuencia:** el contralor teclea en la declaración mensual el número de la
pantalla, no el del PDF. Sobre una flota con $5,000,000 anuales de combustible con
el efectivo al límite de la facilidad, el excedente típico de un ejercicio arrastra
decenas de miles de pesos de IVA acreditado de más, y quien responde en la revisión
es el cliente, con el papel que le dio Likida. El propio archivo lo dice sobre el
caso hermano que sí se arregló (`fiscal.ts:778-779`): *«el MISMO UUID daba $8,000
en la pantalla y $0.00 en el PDF»*.

**Causa raíz probable:** `proporcionesDeducibles` necesita las `diferencias` del
motor y el panel trabaja sobre un periodo de muchos viajes que no las tiene; nadie
ha construido el puente.

---

### [CRÍTICO, REINCIDENTE de la 24] El contador del 15% del ejercicio es ciego al complemento de pago; el motor no. La facilidad se concede dos veces

`supabase/migrations/0190_15pct_efectivo_lista_lisr27iii.sql:36-40`
(`where forma_pago is not null and forma_pago <> '99' and forma_pago not in ('02','03','04','05','28','29')`) ·
`src/lib/likida/cuadre/desde_db.ts:121-125` (`efectivoDeEsteViaje` filtra con
`medioNoAdmitidoCombustible(g.formaPago)` — la forma **cruda**) · contra
`src/lib/likida/cuadre/engine.ts:682` (la rama del 15% juzga `formaPagoJuzgable`) y
`engine.ts:636-638` (donde se construye desde el REP) · verificado además que la
0190 es la ÚLTIMA definición de `sumar_combustible_ejercicio`: solo 0084, 0112 y
0190 la tocan, y la 0282 (que sí aprendió `pagado_forma`) es de **otra** RPC.

Norma: `normas/rfa-2026-2.9.yaml`, **`verificado_fuente_primaria`** — la línea
literal es la transcrita arriba («siempre que estos no excedan el 15 por ciento del
total de los pagos efectuados por consumo de combustible»). El numerador de ese
15% es «los pagos efectuados», o sea el medio con el que **de verdad se pagó**;
FIS-1 (aud. 23) y FIS-5 (aud. 24) llevaron esa lectura al motor y no al contador
que lo alimenta. El comentario de la propia migración conserva la doctrina
anterior: *«'99' tampoco cuenta — no es un medio distinto, es que no se ha
pagado»*, que dejó de ser cierta el día que se ingirió el REP.

**Escenario.** Flota elegible, $1,000,000 de combustible en el ejercicio → tope
$150,000. Dos liquidaciones, cada una con un CFDI de diésel de **$174,000**
(SubTotal $150,000 + IVA $24,000), `FormaPago '99'`, REP con `FormaDePagoP '01'` y
`pagadoEn 2026-02-15`. Como la RPC devuelve `efectivo = 0` en las dos corridas:

| | liquidación 1 | liquidación 2 | suma |
|---|---|---|---|
| Deducible por la facilidad | $150,000 | $150,000 | **$300,000** |
| IVA acreditado | $20,689.66 | $20,689.66 | **$41,379.32** |

El tope real del ejercicio es **$150,000**. Se afirman en verde $150,000 de
deducción y ~$20,690 de IVA que la regla no concede. Y el mismo panel del contador,
que sí usa `formaPagoEfectiva` en `tope15DeGastos` (`fiscal.ts:952`), califica esos
dos comprobantes como `excedido` — la pantalla dice «excedido» mientras el PDF
afirma la deducción.

**Consecuencia:** la flota. $150,000 de deducción inexistente son ~$45,000 de ISR
más actualización y recargos, más el IVA acreditado de más. Va en la dirección
cara: se afirma un derecho que la regla niega. No es un borde — la compra de diésel
a crédito con liquidación semanal en caja es rutina en carga federal, y la FASE 7
(mig. 0199) existe justamente para ingerir esos REP.

**Causa raíz probable:** FIS-5 movió la frontera del medio de pago en TypeScript y
dejó en la RPC y en el término de resta la frontera anterior; ninguna prueba ata
las dos (`fiscal_agregado_15pct.test.ts` compara las LISTAS de formas, no la
dimensión `pagado_forma`).

---

### [ALTO, nuevo] «IVA acreditable de tus liquidaciones — LIVA art. 5» suma también las liquidaciones que una persona RECHAZÓ y las que nadie ha firmado

`supabase/migrations/0112_agregados_rpc.sql:361-380` — la RPC completa:

```sql
select jsonb_build_object('litrosDiesel', …, 'iva', coalesce(sum(iva_acreditable),0), 'peaje', …)
  from liquidacion
 where tenant_id = p_tenant
   and (p_desde is null or created_at >= p_desde);
```

Sin una sola cláusula sobre `revision`. La consume
`src/lib/likida/analytics.ts:675-697` (`getAcreditables`) y la imprimen
`src/app/dashboard/contador/inicio-contador.tsx:440-442` («IVA acreditable de tus
liquidaciones — {ejercicio}», nota «LIVA art. 5»), `:447-449` («Estímulo de peaje
50% … LIF 2026 art. 20, ap. A») y `:464-466` («Diésel elegible para el
estímulo»), más la herramienta de chat `acreditables_periodo`
(`src/lib/agents/chat-tools.ts:113-132`).

Norma: `normas/liva-5.yaml`, **`verificado_fuente_primaria`**, art. 5, encabezado
literal:

> «Artículo 5o.- **Para que sea acreditable** el impuesto al valor agregado
> **deberán reunirse los siguientes requisitos**: I. Que el impuesto al valor
> agregado corresponda a bienes, servicios o al uso o goce temporal de bienes,
> **estrictamente indispensables** […] se consideran estrictamente indispensables
> las erogaciones efectuadas por el contribuyente **que sean deducibles** para los
> fines del impuesto sobre la renta…»

Una liquidación que el contralor **rechazó** es, por definición del propio
producto, una cuyas cifras no sostienen ese requisito todavía. Y el repo lo tiene
escrito dos veces, sobre los mismos datos:

- `src/app/api/export/liquidaciones/periodo.ts:73` —
  `FILTRO_REVISION_DEFECTO = 'sin_rechazadas'`, y `route.ts:89-94`:
  *«Por omisión NO salen las rechazadas: tesorería dispersa con este CSV y el
  total de una rechazada está a punto de cambiar.»*
- `src/app/api/v1/openapi/route.ts:1120-1121` —
  *«POR OMISIÓN TRAE SOLO LO ASENTABLE (`?revision=firmadas`)… las rechazadas
  —cuyas cifras el motor va a recalcular— se piden explícito»*, y `:616`:
  *«`pendiente` = nadie la ha firmado: **no la asientes**.»*

El export y la API se abstienen; la tarjeta que el contador mira para declarar, no.
Y `revisar_liquidacion` (`supabase/migrations/0299_revision_liquidacion.sql:406-415`)
al rechazar solo escribe `revision`, `revisada_*` y `motivo`, y devuelve el viaje a
`en_cuadre`: **`iva_acreditable`, `peaje_acreditable` y `litros_diesel_acreditables`
se quedan intactos en la fila**, disponibles para el `sum()`.

**Escenario.** Ejercicio 2026, tres liquidaciones cerradas. La del viaje 4471 cierra
con `iva_acreditable = 16,000.00`, `peaje_acreditable = 2,500.00` y
`litros_diesel_acreditables = 1,200.000`. El contralor la abre en
`/dashboard/4471`, ve que dos CFDI son de otro viaje, y la **rechaza** con motivo
(el motivo es obligatorio: constraint `liquidacion_revision_motivo`). El viaje
vuelve a `en_cuadre` y el chofer todavía no manda el comprobante bueno. Ese mismo
día, `/dashboard/contador` sigue mostrando esos **$16,000.00** dentro de «IVA
acreditable de tus liquidaciones — ejercicio 2026 · LIVA art. 5», **$2,500.00** de
estímulo de peaje y **1,200.000 L** de diésel elegible; el CSV de liquidaciones del
mismo periodo, con el mismo botón de exportar de esa pantalla, no trae esa fila.
Dos cifras sobre el mismo hecho, en la misma pantalla, con una hora de diferencia.

**Consecuencia:** el contralor. La ventana no es corta: entre el rechazo y el
re-cierre pueden pasar semanas (o no volver nunca, si el comprobante bueno no
llega), y ahí caen los días 17 en que se presenta la declaración mensual. El daño
va en la dirección cara —acreditar de más— y lo respalda un rótulo que cita el
art. 5 de la LIVA. Con `pendiente` es más suave pero es la misma puerta: la API dice
literalmente «no la asientes» y la pantalla la asienta.

**Causa raíz probable:** la RPC es de la 0112 y la columna `revision` nació en la
0299; nadie volvió a pasar por los agregados de dinero al cerrar el ciclo de
revisión humana.

---

### [ALTO, nuevo] Una NOTA DE CRÉDITO (`TipoDeComprobante = 'E'`) entra como gasto deducible y acredita su IVA: nada en el camino del dinero mira el tipo de comprobante

`src/lib/likida/processor.ts:3008-3020` (el único tipo que el intake distingue es
`'P'`, el REP) · `processor.ts:3075` (`emparejarXmlConTicket` empareja **solo por
total y fecha**) · `processor.ts:3129-3160` (si no hay ticket previo, `addGasto`
**crea el gasto desde el XML**: `monto: xml.total`, `ivaTraslado: xml.ivaTraslado`,
`tipoComprobante: xml.tipoComprobante`, `xmlVerificado: true`) ·
`src/lib/likida/repo.ts:801-824` (`updateGastoCfdiXml` escribe `iva_traslado` e
`ieps_traslado` y pone `xml_verificado: true`, sin mirar el tipo) ·
`src/lib/likida/intake/emparejar.ts:126` (`emparejarXmlConTicket`, sin filtro de
tipo) · `src/lib/likida/sat_descarga/cruce.ts:92-135` (`decidirCruce`, el camino
automático de la descarga masiva, tampoco lo mira).

`grep` de `tipoComprobante` en todo `src/lib/likida`: los ÚNICOS consumidores que
deciden algo son `processor.ts` (rama `'P'`), `engine.ts:1061`
(`tipoAplica = 'I' || 'E'`, y ahí `'E'` se ADMITE a propósito, para el complemento
de hidrocarburos) y `carta_porte.ts` (emisión). **Ninguna línea del motor, de
`fiscal.ts` ni de las cinco listas de `engine.ts:280-326` distingue un comprobante
de ingreso de uno de egreso.** No hay una sola prueba con `TipoDeComprobante="E"`
en los 810 archivos de prueba.

Norma: `normas/liva-5.yaml`, **`verificado_fuente_primaria`**, art. 5 fr. I: el
acreditamiento exige que el IVA «corresponda a bienes, servicios o al uso o goce
temporal de bienes» y que la erogación sea **deducible**. Un CFDI de egreso no
documenta una erogación: documenta su devolución, descuento o bonificación —
disminuye una deducción y **restituye** IVA ya acreditado. *(La ficha que
gobernaría el caso de frente —LIVA art. 7, restitución del impuesto acreditable—
**no existe en `normas/`**, y lo anoto abajo: el hallazgo se sostiene en el fr. I
de la ficha verificada y en que el código no distingue el tipo en ninguna línea.)*

**Escenario.** La gasolinera timbró mal la factura del cargamento y emite una **nota
de crédito** por el total: `TipoDeComprobante="E"`, SubTotal $10,000.00, IVA
$1,600.00, Total **$11,600.00**, `FormaPago '03'`, receptor = el RFC de la flota,
`ClaveProdServ 15101505`. El operador ve un XML de la gasolinera con su nombre y lo
reenvía por WhatsApp como si fuera «la factura del diésel».

- Si el viaje ya tiene el ticket de $11,600 sin timbrar → `emparejarXmlConTicket`
  lo casa por total y `updateGastoCfdiXml` lo marca `xml_verificado: true`.
- Si no hay ticket → `addGasto` **crea un gasto nuevo** de $11,600.00 con
  `concepto: 'diesel'`.

En los dos casos el CFDI está vigente ante el SAT, el receptor es correcto y el
medio de pago está en `MEDIOS_LISR_27_III`: **cero diferencias**. El PDF imprime
«Deducible para ISR **$11,600.00**» en verde y «IVA acreditable (LIVA art. 5)
**$1,600.00**», y como cuadró sin diferencias el trigger de la 0299
(`0299_revision_liquidacion.sql:127-128`) la deja `revision = 'aprobada'` **sin que
ninguna persona la mire**. La verdad fiscal es la contraria: ese papel resta $10,000 de deducción y
obliga a restituir $1,600 de IVA. El error es de **signo**, así que el
desplazamiento contra la realidad es de $23,200 de base y $3,200 de IVA por
comprobante.

**Consecuencia:** el contralor y el SAT. Es la única familia de hallazgos de esta
ronda que ensucia el PDF archivado *y* la póliza contable (`api/export/poliza`
reparte por `cubetaDe`, que tampoco mira el tipo), y el camino no exige un
operador distraído: `sat_descarga/ciclo.ts:274` cruza **automáticamente** todo CFDI
bajado del buzón —notas de crédito incluidas— contra los gastos sin factura, solo
por total, fecha y RFC del emisor.

**Causa raíz probable:** el intake nació leyendo tickets de gasolinera (donde solo
hay tipo `'I'`), y cuando llegaron el REP y la descarga masiva se añadió la rama de
`'P'` sin convertir el tipo en una puerta.

---

### [ALTO, REINCIDENTE de la 24] «No deducible $116,000» sobre un CFDI impecable del ejercicio anterior, con una regla que el propio repo declara sin norma

`src/lib/likida/cuadre/engine.ts:280` (`gasto_otro_ejercicio` dentro de
`NO_DEDUCIBLE_ISR` — reconfirmado, la línea no se movió) · `engine.ts:322`
(y dentro de `SIN_IVA_ACREDITABLE`) · `engine.ts:937` (la nota impresa) ·
`src/lib/likida/cuadre/fecha_dudosa.ts` (el disparo) · contra
`src/lib/likida/normas/por_diferencia.ts:113`.

Lo que el repo declara sobre esta diferencia (`por_diferencia.ts:113`, literal):

> `gasto_otro_ejercicio: 'Calidad del dato: la fecha, no un veredicto de qué norma
> exacta rige el periodo fiscal.'`

y el encabezado de `SIN_NORMA` (`por_diferencia.ts:80-83`):

> «Que no tengan norma no las hace menos válidas: significa que el agente **NO debe
> citar ley** al explicarlas.»

Pero la diferencia emite el veredicto más caro del motor, y la nota impresa
(`engine.ts:937`) dice literal *«un gasto de otro ejercicio no se deduce en
este»*. **Ficha: ninguna.**

**Escenario.** CFDI de diésel de **$116,000** (SubTotal $100,000 + IVA $16,000),
`FormaPago '03'`, XML verificado, receptor correcto, fechado **2025-12-30**,
cuadrado el 2026-02-20 → `totalDeducible 0`, `totalNoDeducible 116,000`,
`ivaAcreditable 0`, y el PDF imprime «No deducible $116,000.00» en rojo. El gasto sí
es deducible —en el ejercicio 2025— y su IVA acreditable en su mes. El propio motor
sabe hacerlo bien cuando quiere: para el IVA liberado por REP emite
`iva_mes_del_pago` con «asiéntalo en el periodo del pago» (`engine.ts:1595-1601`) y
**no quita un peso**.

**Consecuencia:** el contralor da por perdidos $116,000 de deducción (~$34,800 de
ISR) y $16,000 de IVA que su empresa sí tiene. La ventana es de once meses: la
tolerancia de `fecha_dudosa.ts` solo cubre enero.

**Causa raíz probable:** se eligió la cubeta equivocada de las tres — el tercer
estado (`por_confirmar`) es el que describe «deducible, pero no aquí».

---

### [MEDIO, REINCIDENTE de la 23 y la 24] La retención del 4% que Likida TIMBRA sigue sin ficha, y el comentario que la funda cita la regla equivocada

`src/lib/likida/carta_porte_cfdi.ts:168` (`const ret = esMoral ? dinero(sub * 0.04) : null`) ·
`carta_porte_cfdi.ts:202` (`TasaOCuota="0.040000"` dentro del XML que el PAC sella) ·
`carta_porte_cfdi.ts:19-21` (el comentario: *«la regla 3.1.2 de la RMF fija el
4%»*) · ficha: **no existe** — `normas/` sigue con 37 fichas y ninguna de LIVA 1-A
ni del RLIVA (`ls normas/*.yaml` reconfirmado).

Lo que el propio repo exige (`normas/README.md`, sección «Cómo se usa»):

> «Ninguna ficha `sin_verificar` debe sostener una cifra que el producto imprima.»

Aquí no hay ficha de ninguna clase, y la cita es incorrecta por partida doble: el
art. 1-A fr. II inciso c) de la LIVA es la fuente de la **obligación de retener**,
no de la tasa; la tasa del 4% vive en el Reglamento de la LIVA, no en la regla
3.1.2 de la RMF (Título 3, ISR).

**Escenario:** flete de $10,000 a un cliente persona moral → Likida timbra SubTotal
$10,000.00, IVA $1,600.00, **Retención $400.00**, Total $11,200.00. Es la única
cifra fiscal que el producto **timbra ante el SAT** y es la que menos trazabilidad
tiene de todas las que imprime; la skill `vigilancia-normativa`, que vigila las 37
fichas, no la puede vigilar.

---

### [BAJO, nuevo] El motor niega los litros del estímulo de diésel por un «4º párrafo de la LIF 20-A-IV» que la ficha verificada no transcribe

`src/lib/likida/cuadre/engine.ts:1650-1653` (el comentario: *«El medio de pago es
requisito del 4º párrafo de la LIF 20-A-IV (monedero, tarjeta, cheque nominativo o
transferencia)»*) · `engine.ts:1659` (`const pagoElectronico = … MEDIOS_LISR_27_III
…`) y `engine.ts:1660` (`if (pagoElectronico && … litros > 0)` es la puerta de
`litrosDieselAcreditables`) ·
`src/lib/likida/fiscal.ts:867-870` (la misma condición en el panel).

Ficha `normas/lif-2026-20-A.yaml` está en `verificado_fuente_primaria`, y por eso
el hallazgo es BAJO: el documento se leyó. Pero su `estimulo_diesel_transporte.
texto_vigente` transcribe **dos** fragmentos —el del hecho generador y el de la
fórmula («cuota […] vigente en el momento en que se haya realizado la importación o
adquisición del diésel […] por el número de litros importados o adquiridos»)— y
**ningún párrafo sobre el medio de pago**. Por el método de este rubro, la
condición que hoy borra litros del papel queda *no verificable en esta ronda*.

**Escenario:** flota elegible a la RFA 2.9, diésel de $27,000 (1,000 L) pagado en
efectivo dentro del 15% → el motor lo declara **deducible** y sin embargo reporta
**0 L** elegibles; el contralor multiplica por la cuota del DOF y le faltan 1,000 L.
La restricción va en la dirección conservadora (niega, no concede), por eso es BAJO
y no ALTO — pero es una cifra del papel decidida por un texto que el corpus no
tiene.

---

## Lo que revisé y está bien

- **El estímulo de IEPS de diésel NO se imprime en pesos.** `engine.ts:1536`
  (`const iepsAcreditable = 0`), `engine.ts:1656-1690` (litros, con la verificación
  de desviación 0.5×–2× contra precio de referencia) y
  `liquidacion/acreditable.ts:96-100` + `NOTA_LITROS_DIESEL`. Es exactamente lo que
  manda `normas/lif-2026-20-A.yaml` (`verificado_fuente_primaria`):
  *«cuota IEPS vigente al momento de la compra × LITROS. No es el IEPS trasladado en
  el CFDI.»* El único consumidor del IEPS trasladado (`dinero.ts:176`) lo rotula
  *«NO es el estímulo (cuota × litros)»*.
- **La base del estímulo de peaje.** `engine.ts:1625-1627` — SubTotal neto de
  `@Descuento`, × 0.5, solo con `MEDIOS_ELECTRONICOS_PEAJE` y con
  `elegiblePeaje === true` — contra `normas/rmf-2026-9.1.8.yaml`
  (`verificado_fuente_primaria`) fr. IV, literal: *«se aplicará al importe pagado por
  concepto del uso de la infraestructura carretera de cuota, **sin incluir el IVA**,
  el factor de 0.5»*. Y `acreditable.ts:83-92` (`CONDICIONES_ESTIMULO_PEAJE`) nombra
  en el papel las cuatro condiciones de la LIF y las tres de la 9.1.8, diciendo cuál
  cierra el motor y cuáles corren por cuenta de la flota. Es el renglón mejor
  fundamentado del producto.
- **La bitácora de la fr. II.** `intake/desglose_peaje.ts:923-929`
  (`LEYENDAS_BITACORA_RMF_918`) y `:961-1011` (`filasBitacora` / `bitacoraRmf918`,
  solo líneas `estatus = 'cuadra'`, `traerTodo` para no recortar a 1,000). La leyenda
  declara explícitamente que el documento **no afirma que el estímulo proceda** y
  enumera lo que corre por cuenta del contribuyente. Coincide con la fr. II de
  `normas/rmf-2026-9.1.8.yaml`.
- **La lista cerrada de la LISR 27-III, generalizada.** `engine.ts:761-765`
  (`efectivo_sobre_tope`, `'01'` y `monto > topeEfectivo`) y `engine.ts:812-818`
  (`medio_pago_no_admitido`: cualquier forma fuera de `MEDIOS_LISR_27_III` sobre el
  tope, a `POR_CONFIRMAR`, sin acreditar IVA). Las dos ya juzgan
  `formaPagoJuzgable` (la del REP), que es lo que FIS-5 pedía. `config.ts:129`
  fija `efectivoTopeMxn: 2000` y la comparación es `>` estricto, que es lo que dice
  «cuyo monto **exceda** de $2,000.00» en `normas/lisr-27-III.yaml` (ojo: esa ficha
  es `evidencia_corroborante`, ver abajo).
- **EFOS: nunca se declara fraude por descarte.** `intake/sat.ts:80-85`
  (`EFOS_LIMPIO = {'200','201'}`; cualquier otro código → `efos: null` +
  `efosDesconocido`) y `engine.ts:281-296` (`cfdi_efos_indeterminado` en
  `POR_CONFIRMAR` y en `SIN_IVA_ACREDITABLE`, nunca en `NO_DEDUCIBLE_ISR`). Es
  exactamente la distinción que exige `normas/cff-69-B.yaml`
  (`verificado_fuente_primaria`): *«Los efectos de la publicación de este listado
  serán considerar, con efectos generales, que las operaciones […] no producen ni
  produjeron efecto fiscal alguno»* es del **4º párrafo** (listado definitivo),
  mientras el 1er párrafo solo dice *«se presumirá la inexistencia»*.
- **Las leyendas del PDF.** `cuadre/leyendas.ts:36-58`: las tres constantes traen
  «puede diferir de los criterios que dé a conocer el SAT» y la referencia al art.
  52 del CFF. Es la eximente literal del último párrafo del art. 89 del CFF en
  `normas/cff-89-90.yaml` (`verificado_fuente_primaria`): *«No se incurrirá en la
  infracción […] cuando se manifieste […] POR ESCRITO al contribuyente que su
  asesoría puede ser contraria a la interpretación de las autoridades fiscales»* —
  y va escrito en el papel que se archiva, que es la conducta que exime.
- **RLISR 57 y el viático a nombre del operador.** `por_diferencia.ts:50`
  (`viatico_rfc_operador: ['rlisr-57']`) contra `normas/rlisr-57.yaml`
  (`verificado_fuente_primaria`), literal: *«Si benefician a personas que le prestan
  servicios personales subordinados, los comprobantes fiscales **podrán ser
  expedidos a nombre de dichas personas**»*. El motor no tira la deducción: emite
  revisión.
- **`filasDeducibilidad` falla cerrado.** `liquidacion/deducibilidad.ts:62-63`: si
  las tres cubetas no suman el total comprobado (± 1.5 centavos) devuelve `null` y
  no imprime desglose. Es el guardarraíl que cubre el caso de una liquidación
  `ajustada` por una persona (`revisar_liquidacion` mueve `total_comprobado` por
  delta y **no re-cuadra**, `0299:391-396`), y el camino del panel recalcula las
  cubetas con `cubetaDe` sobre los gastos vivos (`analytics.ts:1583-1607`), con
  `derivoLaConfig` callando la pantalla ante deriva. Buscaba aquí un hallazgo y no
  lo hay.
- **El tope de alimentación es un solo criterio compartido.**
  `cuadre/tope_alimentacion.ts` (por día, por beneficiario, proporción solo entre
  timbrados) lo usan el motor (`engine.ts`) y el panel (`fiscal.ts:814`); $750 /
  $1,500 y el «solo alimentación» coinciden literalmente con `normas/lisr-28-V.yaml`
  (`verificado_fuente_primaria`): *«sólo serán deducibles hasta por un monto que no
  exceda de $750.00 diarios por cada beneficiario […] o $1,500.00 cuando se eroguen
  en el extranjero»*. Sus dos huecos (H1 sin comprobante de hospedaje/transporte,
  H2 tarjeta de crédito) están implementados **como avisos** y declarados en la
  ficha.
- **`permiso_cre.ts` no decide nada fiscal.** Es una tabla marca↔permiso con tres
  estados (`reconocido` / `desconocido` / `sin_permiso`) y **sin un solo
  consumidor** fuera de su prueba; el motor nunca afirma que el permiso esté
  vigente (`engine.ts:1062-1078`), solo avisa que no lo verifica, y el aviso baja el
  renglón a tono `condicionado` (`deducibilidad.ts:72-79`). No es el cotejo del
  padrón CRE, y no pretende serlo.

## Fichas que NO pude verificar

Las traté como *no verificables en esta ronda* — ni bien ni mal:

- **Sin `verificado_fuente_primaria` (6 de 37):** `lisr-27-III`
  (`evidencia_corroborante` — la más cara de todas: sostiene `efectivo_sobre_tope`,
  `medio_pago_no_admitido` y la matriz entera de la RFA 2.9, y su propia nota dice
  que el PDF de diputados no se leyó), `lisr-28-XX` (el 0% de los bares),
  `cff-29-A` (`texto_vigente: null`, y es la ficha que fundamenta `rfc_receptor`,
  `cfdi_cancelado`, `cfdi_no_encontrado` y `cfdi_pendiente`),
  `rmf-2026-2.7.1.21`, `rmf-2026-2.7.1.48` y `politica-portales-plazos`.
  Las tres primeras sostienen veredictos que quitan dinero. Es la misma lista que
  la 23 y la 24 dejaron abierta.
- **Fichas que el código necesitaría y NO EXISTEN:** la de **LIVA 1-A / RLIVA** (la
  retención del 4% que se timbra — ver el MEDIO reincidente) y la de **LIVA art. 7**
  (restitución del IVA acreditable por devoluciones, descuentos y bonificaciones —
  la que gobernaría el ALTO de la nota de crédito). Ninguna de las dos está en las
  37.
- **`liva-5.yaml` sigue sin transcribir la fracción III**, que es la que decide si
  un CFDI PPD acredita o no su IVA (`engine.ts:1576-1601`, `fiscal.ts:772-788`,
  `intake/rep.ts`). La 24 lo reportó como BAJO y no cambió.

## Lo que NO alcancé a revisar

- **`facturacion/` completo**: los adaptadores de portales, `relogin*.ts`,
  `portales_vivos.ts`, `flota_fiscal.ts` y `vinculacion_asistida.ts`. Solo abrí
  `permiso_cre.ts` y `caducidad.ts` (que es política de nivel 6 y lo declara).
  El cotejo del padrón CRE contra el catálogo real de la CNE sigue pendiente desde
  la 24.
- **`intake/cfdi_xml.ts` completo**: verifiqué qué campos se leen y cuáles no, pero
  no crucé el parseo de `Traslado` contra el Anexo 20 (`TipoFactor="Exento"`, tasas
  al 8% fronterizo, traslados a nivel Concepto vs Comprobante) ni el manejo de
  `@TipoCambio` en CFDI en moneda extranjera más allá de que `moneda_extranjera`
  existe como diferencia.
- **La carta porte** más allá de la retención del 4%: `carta_porte.ts` (403-575),
  `normas/nom-087-sct-2-2017.yaml` y `normas/rmf-2026-2.7.7.yaml` quedaron sin
  abrir, y los dos están `verificado_fuente_primaria` — o sea que son verificables y
  nadie los ha cruzado contra el código.
- **`criterio-1-CFF-PI` y `criterio-1-LIF-PI`** (prácticas indebidas del Anexo 3)
  contra el material comercial, el corpus del agente contador
  (`normas/corpus_texto.ts`) y `guardiaFundamento`.
- **`api/export/bitacora-peaje/route.ts`**: leí `bitacoraRmf918` pero no el CSV que
  sale por la ruta ni sus encabezados.
- **El camino de la descarga masiva (`sat_descarga/`)** más allá de `cruce.ts` y
  `ciclo.ts:225-320`: `resolucion.ts` (deshacer un cruce, archivar) y el efecto
  fiscal de un CFDI archivado por error quedaron fuera.
- **`resumirPerdidas` / `armarPorFacturar`** (`fiscal.ts:1000-1350`), que producen
  «perdido / en riesgo / recuperable» — las cifras que la pantalla del contador pinta
  al lado de las que sí revisé.
