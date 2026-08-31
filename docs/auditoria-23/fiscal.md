# Cumplimiento fiscal — auditoría 23

**Nota: 4/10** (antes 4). Razón del movimiento: **se atacó y no subió**. De los
cuatro arreglos de la 22, dos aguantan enteros (FIS-C2, FIS-A1), **uno quedó a
medias** (FIS-C1 arregló las cubetas categóricas y dejó intactas las
proporcionales y el duplicado) y **uno introdujo una regresión de dinero**
(FIS-C3 mató la vía del REP y manda a POR CONFIRMAR toda compra a crédito de más
de $2,000). Siguen siendo tres CRÍTICOS de dinero verificables contra texto
normativo, así que el ancla del rubro —«3 o menos si el producto imprime una
cifra fiscal equivocada»— sigue rozando por abajo y la disciplina de fichas
(41 fichas, 29 con `verificado_fuente_primaria`, corpus y índice sincronizados
con las cuatro nuevas) sigue siendo lo que impide bajar de 4.

**El riesgo mayor de hoy:** el arreglo de ayer (FIS-C3) trata `'99 Por definir'`
como «se pagó con un medio que la LISR 27-III no admite» — cuando el propio
`engine.ts:127-128` define `'99'` como *no pagado todavía*. Toda factura a
crédito (PPD) por encima de $2,000 sale del deducible, pierde su IVA, e imprime
una frase falsa citando el artículo. Es la misma forma de falla que la 22
documentó de la 21: un arreglo que cierra un hueco abriendo otro más ancho.

---

## Hallazgos

### [CRÍTICO] Una factura a crédito pagada por transferencia sale «por confirmar» con $0 de IVA, y el complemento de pago dejó de servir

`src/lib/likida/cuadre/engine.ts:594-595` (la condición nueva de FIS-C3) ·
`engine.ts:599` (la nota que se imprime) · `engine.ts:127-128` y `:148-152` (la
doctrina contraria, en el mismo archivo) · `engine.ts:1328` (`'medio_pago_no_admitido'`
dentro de `SIN_IVA_ACREDITABLE`) · `engine.ts:1396-1398` (la vía del REP, ahora
inalcanzable) · ficha `normas/lisr-27-III.yaml` (**`verificado_fuente_primaria`? NO** —
`evidencia_corroborante`)

> «Estar amparadas con un comprobante fiscal y que los pagos cuyo monto exceda de
> $2,000.00 se efectúen mediante transferencia electrónica de fondos desde cuentas
> abiertas a nombre del contribuyente en instituciones que componen el sistema
> financiero…; cheque nominativo de la cuenta del contribuyente, tarjeta de crédito,
> de débito, de servicios, o los denominados monederos electrónicos autorizados por
> el Servicio de Administración Tributaria.»

Y lo que el propio motor tiene escrito sobre `'99'`, `engine.ts:148-152`:

> «**`'99'` devuelve `false`.** No es un medio distinto: es que NO se pagó
> (RMF 2.7.1.29 fr. II). Ese caso lo juzga la regla de pago efectivo, no esta…»

`medioNoAdmitidoCombustible` respeta esa frontera (`engine.ts:156`:
`if (formaPago === FORMA_PAGO_SIN_PAGAR) return false;`). La rama nueva de FIS-C3
**no la replicó**: solo excluye `undefined` y `'01'`.

**Escenario (corrido con `cuadrarViaje` real, no razonado en papel):** hospedaje
subcontratado de $58,000 (SubTotal $50,000 + IVA $8,000), CFDI verificado,
receptor correcto, `MetodoPago: 'PPD'` / `FormaPago: '99'` — la forma normal de
una compra a crédito en México — y su **complemento de pago (REP) ya ingerido**
con `FormaDePagoP = '03'` (transferencia) y `pagadoEn = 2026-08-03`.

| | antes de FIS-C3 | hoy |
|---|---|---|
| `totalDeducible` | $58,000 | **$0** |
| `totalPorConfirmar` | $0 | **$58,000** |
| `ivaAcreditable` | $8,000 | **$0** |
| estatus | cuadrada | **revisar** |

Y la nota que sale impresa es literalmente:

> «Hospedaje de $58,000.00 **se pagó con la forma «99»**, que no está en la lista
> de la LISR 27-III … Mientras tanto no acredita IVA.»

El rótulo no es verdad por partida doble: no se pagó *con* la forma 99, y el REP
prueba que se pagó por transferencia — que sí está en la lista.

El control lo confirma: el mismo comprobante con `formaPago: '03'` da
deducible $58,000 e IVA $8,000. Y el mismo comprobante `'99'` + REP por **$1,160**
(bajo el tope) da deducible $1,160 e IVA $160 — que es exactamente por qué la
suite no lo vio: **los cinco casos de `iva_rep_liberado.test.ts` usan $1,160 y
$580, los dos por debajo del tope de $2,000**, y
`medio_pago_lisr27.test.ts:49` afirma `'99' → medio_pago_no_admitido` como
comportamiento deseado, sin un solo caso con REP.

**Consecuencia:** la flota y el contralor. La FASE 7 (mig. 0199) existe para
recuperar el IVA de lo comprado a crédito —«16% del gasto de diésel a crédito,
cada mes», dice su propia prueba— y desde ayer está muerta para todo comprobante
que supere $2,000, que son todos los que importan. Sobre una flota que
subcontrata $500,000/mes de fletes a crédito son **$80,000 mensuales de IVA
acreditable que desaparecen del papel**, más medio millón de deducción movida a
«por confirmar». Y toda liquidación con una compra a crédito baja a la bandeja de
revisión (`medio_pago_no_admitido` está en `REVISAR`, `engine.ts:1568`), que es
como se vacía de significado una bandeja.

**Causa raíz probable:** la rama de FIS-C3 juzga `g.formaPago` crudo en vez de la
`formaPagoEfectiva` que el mismo archivo construye 800 líneas más abajo, y no
excluyó `FORMA_PAGO_SIN_PAGAR` como sí hace su hermana de combustible.

---

### [CRÍTICO] Los gastos PARCIALMENTE deducibles se asientan al 100% en la cuenta de gasto deducible: FIS-C1 solo cubrió las cubetas categóricas

`src/app/api/export/poliza/route.ts:72-98` (`repartirPorCubeta`) ·
`route.ts:63-66` (el comentario que afirma lo contrario) ·
`src/lib/likida/cuadre/engine.ts:269-279` (`cubetaDe`, todo-o-nada) ·
`engine.ts:1547-1550` (el reparto **proporcional** que sí usa el PDF) ·
ficha `normas/liva-5.yaml` (**`verificado_fuente_primaria`: sí**) y
`normas/lisr-28-V.yaml` (**sí**)

> «Tratándose de erogaciones **parcialmente deducibles** para los fines del
> impuesto sobre la renta, únicamente se considerará para los efectos del
> acreditamiento … **en la proporción** en la que dichas erogaciones sean
> deducibles para los fines del impuesto sobre la renta.» (LIVA 5, fr. I)

El comentario de `route.ts:63-65` promete: *«La clasificación NO se reimplementa
aquí ni en SQL: se llama a `cubetaDe`, la misma función que el PDF y el panel
usan.»* **Eso no es cierto.** El PDF imprime `liq.totalDeducible` /
`totalNoDeducible`, que el motor calcula en `engine.ts:1521-1551` con `cubetaDe`
**más** `proporcionDeducible`. `repartirPorCubeta` usa solo la primera mitad.

**Escenario A — el de todos los días (corrido con `cuadrarViaje` +
`polizaDeLiquidacion` reales):** una comida de $2,000 (SubTotal $1,724.14 +
IVA $275.86) con CFDI, tope fiscal $750/día (LISR 28-V).

- El motor: `totalDeducible 750` · `totalNoDeducible 1,250` · `ivaAcreditable 103.45`.
  El PDF imprime las dos cubetas.
- La póliza que baja el contador:
  `5020-001 cargo 1,724.14 «alimentacion — viaje V-1»` → **la base entera a la
  cuenta de gasto deducible**, y la póliza **cuadra**.

**Escenario B — el caso estrella (corrido):** flota elegible
(`facilidad15: true`), CFDI de diésel de $232,000 (SubTotal $200,000 + IVA
$32,000) en efectivo, con la mitad dentro del 15% de la RFA 2.9.

- El motor: `totalDeducible 116,000` · `totalNoDeducible 116,000` ·
  `ivaAcreditable 16,000` (la mitad — el IVA sí respeta la proporción).
- La póliza: `5010-001 cargo 200,000.00 «diesel — viaje V-1»`. Cuadra. La cuenta
  `5990-001` de gasto no deducible sale con **cero**.

**Consecuencia:** la flota. El PDF y el archivo del ERP —los dos artefactos del
mismo cálculo— dicen cosas contrarias, que es exactamente lo que FIS-C1 declaró
haber cerrado. Sobre 200 viajes/mes con un excedente medio de $1,000 de viáticos
son ~$200,000/mes de deducción inexistente asentada, más el excedente del 15% de
combustible; el ISR (30%) más actualización y recargos los paga la flota, y el
papel que lo prueba lo generó Likida. El contralor no lo puede cruzar: el PDF
dice $750 deducibles y el ERP asienta $1,724.14.

**Causa raíz probable:** `cubetaDe` es todo-o-nada por diseño y `proporcionDeducible`
vive solo dentro de `cuadrarViaje`; la RPC 0272 no entrega la proporción ni la
liquidación la guarda, así que la ruta no tiene con qué partir el renglón.

---

### [CRÍTICO] El comprobante duplicado se sigue asentando dos veces como gasto deducible, y la póliza cuadra (REINCIDENTE de la 22)

`supabase/migrations/0272_poliza_deducibilidad.sql:80-91` (el `lateral` que lista
**todos** los `gasto` del viaje, copias incluidas) ·
`src/app/api/export/poliza/route.ts:81-97` (`repartirPorCubeta` los suma todos) ·
`src/lib/likida/cuadre/engine.ts:934` (el `gastoId` de la diferencia
`duplicado` es el **original**, no la copia) · `engine.ts:299` (`copiasDeComprobante`,
«exportada y única, porque tiene DOS consumidores») ·
ficha `normas/lisr-27-III.yaml` (**no** `verificado_fuente_primaria`)

> «Estar amparadas con un comprobante fiscal…» — una deducción por comprobante,
> no por fotografía del comprobante.

FIS-C1 partió la base en tres cubetas pero **no tocó el doble conteo** que la 22
midió como corolario. Peor: la ruta no puede detectarlo aunque quisiera. La RPC
entrega `id, concepto, subtotal, descuento, tieneCfdi` — sin `cfdi_uuid`, sin
folio y sin monto—, y la única diferencia que delata la copia (`tipo: 'duplicado'`)
apunta al **original**, así que el id de la copia no aparece en ningún lado.

**Escenario (corrido con `cuadrarViaje` + `polizaDeLiquidacion` reales):**
anticipo $70,000. Gasto A: diésel $58,000 (SubTotal $50,000 + IVA $8,000) en
efectivo con `facilidad15: false` → `efectivo_no_elegible`, NO DEDUCIBLE, IVA no
acreditado $8,000. Gastos B y B′: **dos fotos del mismo CFDI de flete** de $8,000
(SubTotal $8,000, sin IVA trasladado).

El motor: `totalComprobado 66,000` (la copia excluida) · `deducible 8,000` ·
`no deducible 58,000` · `IVA acreditable 0` · `diferencia 4,000`.

La póliza que sale:

```
5990-001  cargo  50,000.00  «diesel NO DEDUCIBLE — viaje V-1»
5030-001  cargo  16,000.00  «flete — viaje V-1»      ← $8,000 gastados, $16,000 asentados
1150-001  abono  70,000.00  «Cancela anticipo de Juan»
1160-001  cargo   4,000.00  «Juan devuelve del viaje V-1»
```

Cargos $70,000 = abonos $70,000: **cuadra**, sin 409 y sin aviso. Y de paso los
$8,000 de IVA no acreditado del diésel **desaparecieron sin renglón**, porque el
residuo por diferencia (`poliza.ts:230`) se los comió contra los $8,000 del
duplicado. Dos errores que se compensan exactamente.

**Consecuencia:** el contador asienta $16,000 de gasto donde salieron $8,000 del
anticipo, y pierde el renglón de IVA/IEPS no acreditable que le corresponde a la
cuenta de balance. En una flota con fajos de fotos de WhatsApp —el caso normal
del producto: el comentario de `engine.ts:289-293` documenta $15,762.10 de copias
en un solo PDF real— esto no es un borde, es el flujo principal.

**Causa raíz probable:** la 0272 se escribió para entregar «los insumos que
`cubetaDe` mira» y `cubetaDe` no sabe de copias; el tercer consumidor de
`copiasDeComprobante` nació sin llamarla.

---

### [ALTO] El corpus del agente contador afirma que el diésel en efectivo NO acredita IVA — lo contrario de lo que el motor imprime desde el arreglo FIS-C2

`normas/rfa-2026-2.9.yaml:79` · `src/lib/likida/normas/corpus_texto.ts:122` (el
mismo texto, verbatim, dentro del prompt) · `src/lib/agents/contador.ts:25,55-60`
(«su ÚNICO material afirmable es el corpus») ·
`src/lib/likida/cuadre/engine.ts:1328,1332` (el código que dice lo contrario) ·
ficha `normas/rfa-2026-2.9.yaml` (**`verificado_fuente_primaria`: sí**)

> `usado_en_codigo`: «cuadre/engine.ts — **SIN_ACREDITAMIENTO: la facilidad salva
> la deducción de ISR, NO el IEPS ni el IVA**»

Ese renglón sigue ahí después de FIS-C2. El símbolo `SIN_ACREDITAMIENTO` **ya no
existe** en el código (se partió en `SIN_IVA_ACREDITABLE` / `SIN_ESTIMULO`) y la
afirmación se invirtió: `combustible_efectivo_dentro15` y `efectivo_sobre_15`
están hoy **fuera** de `SIN_IVA_ACREDITABLE`, o sea que sí acreditan IVA en la
proporción deducible. `normas/liva-5.yaml` (`riesgo_actual`) cita el mismo símbolo
muerto.

Nada lo detecta: `normas_sincronizadas.test.ts:186-208` coteja que la **ruta**
citada exista y declara explícitamente que *«los símbolos ("— tal función") NO se
exigen a propósito»*.

**Escenario:** el contralor de una flota con $5,000,000 anuales de combustible y
su 15% en efectivo ($750,000) pregunta en el chat: «¿acredito el IVA de mi diésel
pagado en efectivo?». El agente contador responde con su única fuente afirmable,
que dice **no**. El PDF de la misma flota, el mismo día, imprime «IVA acreditable
(LIVA art. 5) $120,000» incluyendo esos $103,448 anuales. Dos artefactos del
mismo producto, cifras contrarias, sobre el caso que el producto usa de gancho.

**Consecuencia:** el contralor, y la credibilidad del rubro entero. El prompt del
contador (regla 5) le ordena *enseñar* las contradicciones entre fichas — pero
esta es ficha-contra-motor, invisible para él, así que la resuelve en silencio y
en contra del cliente.

**Causa raíz probable:** FIS-C2 cambió el código y no la ficha, y el único test
que las ata solo comprueba rutas de archivo.

---

### [ALTO] «IEPS de diésel documentado» se calcula con la frontera abierta `!== '01'` e incluye comprobantes que ni siquiera están pagados

`src/lib/likida/fiscal.ts:793` —
`if (esDieselConIeps(g, o) && g.iepsTraslado !== null && g.formaPago && g.formaPago !== '01')` ·
`src/lib/mcp/herramientas/dinero.ts:176` (la cifra servida al contador) ·
ficha `normas/lif-2026-20-A.yaml` (**`verificado_fuente_primaria`: sí**)

> `como_se_calcula`: «cuota IEPS vigente al momento de la compra × LITROS. **No es
> el IEPS trasladado en el CFDI.**»

Y `normas/lisr-27-III.yaml` / `rfa-2026-2.9.yaml` fijan la lista **cerrada**
(02, 03, 04, 05, 28, 29), que el motor ya tiene escrita en
`engine.ts:126` (`MEDIOS_LISR_27_III`) y que este acumulador no usa.

**Escenario:** flota con 400,000 L/mes. Tres CFDI de diésel: uno con
`FormaPago '03'` e IEPS trasladado $200,000; otro con `'06' Dinero electrónico`
e IEPS $50,000; otro con `'99' Por definir` (a crédito, **no pagado**) e IEPS
$34,000. La herramienta contesta al contralor:

> «• IEPS de diésel documentado: **$284,000.00**.»

junto al renglón de arriba, que dice «IVA acreditable documentado». Los $50,000
del `'06'` y los $34,000 del `'99'` no pueden sostener el estímulo —el segundo ni
siquiera se pagó— y **ninguno de los tres** es el estímulo: la LIF lo fija en
cuota semanal disminuida × litros, que esta semana (29-ago a 4-sep,
`normas/datos/cuota-ieps-diesel.yaml`) es $1.3622/L.

**Consecuencia:** el contralor. Es la confusión exacta que el rubro nombra —el
IEPS trasladado presentado como si fuera el beneficio— servida por una tool a un
LLM que la va a parafrasear como cifra dura. El motor y el PDF se cuidaron de
esto con disciplina (`iepsAcreditable = 0`, litros con tono `condicionado`,
`NOTA_LITROS_DIESEL`); este camino lateral no.

**Causa raíz probable:** el acumulador es anterior a `MEDIOS_LISR_27_III` y quedó
con el `!== '01'` que la auditoría 18 (A7) y la 22 (FIS-C3) ya corrigieron en las
otras tres puertas del mismo archivo.

---

### [MEDIO] El panel del contador afirma que la columna de retenciones «no existe» y que el nodo `Retenciones` no se parsea — FIS-A1 hizo las dos cosas ayer

`src/lib/likida/fiscal.ts:906-936` (`diagnosticoRetencion`, `calculable: false`
cableado, `camposFaltantes: ['gasto.iva_retenido (columna inexistente)', …]`) ·
`src/lib/likida/intake/cfdi_xml.ts:354-363` (el nodo **sí** se parsea desde ayer) ·
`src/lib/likida/repo.ts:384-385,804-805,978-979` (las columnas **sí** se escriben
y se leen) · `supabase/migrations/0272…sql:89` (la póliza **ya** las suma) ·
ficha `normas/liva-5.yaml` (**sí**) y regla del producto «un rótulo tiene que ser
verdad»

**Escenario:** una flota que subcontrata fletes a permisionarios persona física
tiene $400,000 de fletes en el mes con $16,000 de IVA retenido ya guardado en
`gasto.iva_retenido`. El export de póliza lo asienta correctamente como abono a
`retenciones_por_pagar`. El diagnóstico del panel, con los mismos datos delante,
devuelve `calculable: false` y le dice al contador que la cifra **no existe en la
base** y que derivarla sería inventarla.

**Consecuencia:** el contralor deja de buscar un dato que ya tiene, y el
inventario de honestidad del producto —que es el que hace creíbles las demás
abstenciones— pasa a mentir sobre su propio sistema. Hoy sin UI que lo pinte
(`diagnosticoRetencion` solo tiene consumidores en pruebas), por eso es MEDIO y
no ALTO; el día que se conecte, es una afirmación falsa en pantalla.

**Causa raíz probable:** FIS-A1 cableó el dato de punta a punta y no revisó quién
declaraba su ausencia.

---

### [MEDIO] El export de póliza sigue diciendo «liquidaciones cerradas» y sigue sin filtrar estatus — y ahora asienta la cubeta POR CONFIRMAR como definitiva (REINCIDENTE de la 22)

`supabase/migrations/0272_poliza_deducibilidad.sql:92-95` — el `where` es
`l.tenant_id` + rango de fechas; `liquidacion.estatus` **no aparece** ·
`src/app/api/export/poliza/route.ts:222` —
`detalle: 'No hay liquidaciones cerradas en ese periodo.'` ·
ficha `normas/cff-69-B.yaml` (**`verificado_fuente_primaria`: sí**)

> «Los efectos de la publicación de este listado serán considerar, con efectos
> generales, que las operaciones contenidas en los comprobantes fiscales expedidos
> por el contribuyente en cuestión **no producen ni produjeron efecto fiscal
> alguno**.» (4º párrafo)

La 22 lo reportó como MEDIO y la 0272 reescribió esta misma RPC sin agregar el
filtro. Y el arreglo lo agravó: antes toda la base caía en una sola cuenta; hoy
`gastoPorConfirmar` le da a la cubeta «no se pudo verificar» **su propia cuenta
en el asiento**, que un ERP importa como movimiento firme.

**Escenario:** una liquidación con `cfdi_efos_indeterminado` (validación EFOS no
concluyente) queda en estatus `revisar` — el tercer estado que la 21 introdujo
justamente para no afirmar nada. Con un CFDI de $58,000 de ese emisor, el archivo
del ERP lleva `5980-001 cargo 50,000.00 «flete POR CONFIRMAR»` fechado y
numerado, mientras el emisor puede estar en el listado **definitivo** del 69-B.

**Consecuencia:** el contador asienta como firme lo que el sistema dejó pendiente
de revisión humana, y el rótulo del 404 le promete un filtro que no existe.

---

### [MEDIO] El nuevo tipo `medio_pago_no_admitido` se funda en la única ficha de LISR que no se transcribió — teniendo el PDF oficial en la mano

`normas/lisr-27-III.yaml:26-32` (`fuente_tipo: fuente_secundaria`,
`estado_verificacion: evidencia_corroborante`) ·
`src/lib/likida/normas/por_diferencia.ts:46` —
`medio_pago_no_admitido: ['lisr-27-fr-III']` ·
`normas/lisr-72-73.yaml:146-152` (el PDF oficial **sí** se descargó el 30-ago)

> `nota_verificacion` de `lisr-27-III.yaml`: «El texto coincide entre Justia, SDV
> Asesores y la propia página del SAT… **NO se leyó en diputados.gob.mx. PARA
> CERRAR: leer el PDF vigente de la LISR en diputados.gob.mx**…»

> `nota_verificacion` de `lisr-72-73.yaml`: «**Descargado el 30-ago-2026 el PDF
> oficial de diputados.gob.mx** ("LEY DEL IMPUESTO SOBRE LA RENTA", pie de página
> "Última Reforma DOF 01-04-2024")… transcritos literalmente los artículos 72 y 73».

Es el mismo documento, el mismo día, el mismo archivo. Se transcribieron los
arts. 72-73 (que hoy `usado_en_codigo: []` para el motor) y se dejó el art. 27
fr. III —que sostiene `efectivo_sobre_tope` (NO DEDUCIBLE), la matriz entera de
la RFA 2.9 y ahora el tipo nuevo de FIS-C3— en fuente secundaria.

**Escenario:** el fiscalista del cliente pide el fundamento de por qué su pago
con vales (`'08'`) de $58,000 salió «por confirmar». El motor cita LISR 27-III; la
ficha que lo respalda no transcribe una palabra del artículo y su propia nota
dice que no se leyó en la fuente primaria. Por el método de este rubro, ese
veredicto **no es verificable en esta ronda**.

**Consecuencia:** el veredicto que más dinero mueve del motor descansa en la
única ficha de LISR sin fuente primaria, y no se puede confrontar contra un texto
cuando alguien lo reclame.

---

### [MEDIO] La retención del 4% que Likida TIMBRA no tiene ficha en `normas/`, y la cita que imprime nombra el artículo de la obligación, no el de la tasa

`src/lib/likida/carta_porte_cfdi.ts:167-169` (`const ret = esMoral ? dinero(sub * 0.04) : null`) ·
`carta_porte_cfdi.ts:200-204,209-215` (los nodos `Retenciones` del XML que va al PAC) ·
`carta_porte_cfdi.ts:18-21` (el comentario: «la regla **3.1.2 de la RMF** fija el 4%») ·
`src/app/dashboard/timbrado/[viajeId]/timbrar.tsx:209` (lo que ve el usuario) ·
**no existe ficha de LIVA 1-A ni del RLIVA en `normas/`** (37 fichas, ninguna)

> `normas/README.md`: «Ninguna ficha `sin_verificar` debe sostener una cifra que el
> producto imprima.»

Aquí la situación es un grado peor que la de `cff-29-A`: no hay ficha **de
ninguna clase**. La pantalla imprime

> «… − retención IVA 4% 400 (receptor persona moral, **LIVA 1-A II c**)»

y el mismo importe viaja dentro del CFDI que el PAC sella y timbra ante el SAT.
El art. 1-A fr. II inciso c) es la fuente de la **obligación de retener**; la
**tasa del 4%** vive en el Reglamento de la LIVA, no en la regla 3.1.2 de la RMF
que el comentario nombra (la 3.1.2 está en el Título 3, de ISR). Sin ficha no
puedo afirmar cuál es la redacción vigente: lo que sí puedo afirmar es que **una
cifra timbrada ante el SAT no rastrea a ninguna ficha**, que es la condición que
este rubro pide para un 8.

**Escenario:** flete de $10,000 a un cliente persona moral. Likida timbra
SubTotal 10,000, IVA 1,600, Retención 400, Total 11,200, y el panel lo justifica
citando un artículo que el corpus no contiene. Si la redacción cambia (o si el
receptor es una persona moral no obligada), nadie en el repo lo va a detectar: la
skill `vigilancia-normativa` vigila las 37 fichas y esta cifra no está en ninguna.

**Consecuencia:** el contralor y el SAT. Es la única cifra fiscal que el producto
**emite** (no solo lee) y es la única sin trazabilidad normativa.

---

### [BAJO] El comentario que documenta `REGIMENES_ELEGIBLES` dice «601/612» noventa líneas antes de que el código diga `['624','612']`

`src/lib/likida/administracion.ts:106` —
*«la elegibilidad se DERIVA de él (los códigos **601/612** son los que califican)»* ·
`administracion.ts:181-195` — el bloque FISC-C2-1 que explica por qué 601 **no**
entra, y `const REGIMENES_ELEGIBLES = ['624', '612'];` ·
ficha `normas/rfa-2026-2.9.yaml` (**sí**) y `normas/lisr-72-73.yaml` (**sí**)

> «Los contribuyentes … que tributen conforme al **Título II, Capítulo VII** o
> Título IV, Capítulo II, Sección I de la Ley del ISR…» (RFA 2.9) — Cap. VII es
> **624**, no 601.

No hay cifra mal hoy: el código es correcto y el comentario está en el JSDoc de
un campo. Pero es la frase exacta del error que FISC-C2-1 (auditoría 18-c2,
CRÍTICO) costó cerrar, viva en el mismo archivo, esperando al próximo agente que
lea el contrato del campo y no el bloque de 15 líneas de abajo.

---

## Los cuatro arreglos de la 22, verificados contra la norma

| Arreglo | Veredicto |
|---|---|
| **FIS-C1** (`75a5ac0` — la póliza sabe qué es deducible) | **A MEDIAS, y con un modo de falla que su propio comentario niega.** Las cubetas **categóricas** aguantan: verificado con `cuadrarViaje` + `polizaDeLiquidacion` reales, un diésel `efectivo_no_elegible` de base $50,000 va a `gastoNoDeducible` y no a la cuenta de gasto. Pero (a) las cubetas **proporcionales** —viático sobre el tope de LISR 28-V y excedente del 15% de la RFA 2.9— se asientan íntegras en la cuenta deducible (CRÍTICO 2), y (b) el **duplicado** se sigue asentando dos veces y la póliza cuadra (CRÍTICO 3). El comentario de `route.ts:63-65` afirma usar «la misma función que el PDF y el panel usan», y el PDF usa `cubetaDe` **más** `proporcionDeducible`. |
| **FIS-C2** (`8c585ad` — la RFA 2.9 niega el IEPS, no el IVA) | **AGUANTA, y es correcto contra la norma.** `rfa-2026-2.9.yaml` `limite_importante` dice IEPS y no dice IVA; `liva-5.yaml` fr. I ata el acreditamiento a la deducibilidad para ISR, que la facilidad conserva. Verificado que `SIN_IVA_ACREDITABLE` (`engine.ts:1328`) **no** contiene los dos tipos de la RFA 2.9 y `SIN_ESTIMULO` (`:1332`) sí. Verificado además que la **proporción** de la fr. I se respeta: `proporcionDeducible.set(g.id, dentro / g.monto)` en `engine.ts:536` produce IVA $16,000 de $32,000 en un diésel al 50% del cupo. **Lo que no aguantó fue la ficha**: sigue afirmando lo contrario y viaja así en el prompt del agente contador (ALTO 1). |
| **FIS-C3** (`61b45b3` — el tope de LISR 27-III contra la lista cerrada) | **INTRODUJO UN MODO DE FALLA NUEVO** (CRÍTICO 1). Respeta la advertencia de la ficha —`'12'` dación, `'17'` compensación y `'23'` novación van a `POR_CONFIRMAR`, no a `NO_DEDUCIBLE_ISR`, y el comentario `engine.ts:585-590` lo razona bien— pero metió `'99 Por definir'` en el mismo saco, contra la doctrina que el propio archivo tiene escrita en `:148-152`, y con eso mató la vía del REP (FASE 7, mig. 0199) para todo comprobante sobre $2,000. Nota al margen: la advertencia que el encargo mencionaba (no declarar no deducible una dación/compensación/novación) **no está** en `lisr-27-III.yaml`; su `advertencia` real es sobre no citar la fracción sola contra el combustible en efectivo, y esa sí se respeta. |
| **FIS-A1** (`89a6b60` — descuento y retención de punta a punta) | **AGUANTA.** `cfdi_xml.ts:354-363` parsea `Impuestos/Retenciones/Retencion` separando `002` (IVA) de `001` (ISR); `repo.ts:384-385,804-805` las escribe; `repo.ts:944,978-979` las lee; la 0272 las suma; `poliza.ts:229-238` las lleva como **abono** a `retencionesPorPagar` y las suma al residuo (`comprobado + retenciones − base − IVA`), que es la contabilidad correcta: la retención baja lo que cobra el proveedor, no el gasto. El `@Descuento` se resta por comprobante en `route.ts:85`, no agregado — bien razonado. **El efecto colateral es el MEDIO de `diagnosticoRetencion`**, que sigue declarando inexistente lo que ahora existe. |

---

## Las cuatro fichas nuevas (coordinados y retenciones)

Las cuatro entraron **bien** a la infraestructura: están en `normas/`, en
`src/lib/likida/normas/indice.ts:293-303,324-367` con su `estado`, su
`jerarquia` y su `exigibleDesde`, y en `corpus_texto.ts` (el prompt del agente
contador). Las cuatro son `verificado_fuente_primaria`. No hay ninguna que el
código implemente **mal**; hay una que abre un hueco de precisión declarado.

**`lisr-72-73.yaml` — coordinados (LISR 72 y 73).** Confirma con texto de ley que
`administracion.ts:181-195` tiene razón al distinguir 624 (Título II Cap. VII) de
601 (Título II a secas) y 612 (Título IV Cap. II Secc. I) — la corrección de
FISC-C2-1. El dato nuevo es el **test del 90% de ingresos** (art. 72, 3er párrafo:
*«aquéllos cuyos ingresos por dichas actividades representan cuando menos el 90%
de sus ingresos totales…»*): es requisito **de la ley**, no de la RFA, y el
producto no lo mide — solo pregunta un booleano de dedicación exclusiva
(`dedicacionExclusivaCarga`). **Eso no produce una cifra mal impresa**: el motor
falla cerrado sin la declaración (`engine.ts:564-569`, `combustible_efectivo` →
por confirmar) y la declaración es del cliente, no una medición de Likida. Es
ausencia, no error. Los tres plazos que la ficha extrae (declaración anual en
marzo/abril, constancia a integrantes al 31 de enero, aviso de tributación
individual antes del primer pago provisional) **no están** en el corpus como
plazos citables, solo dentro del texto de la ficha.

**`rfa-2026-2.1.yaml` — retención del 7.5% a operadores, macheteros y
maniobristas.** *«…podrán optar por enterar el 7.5 por ciento por concepto de
retenciones del ISR, correspondiente a los pagos efectivamente realizados a
operadores, macheteros y maniobristas, en lugar de aplicar las disposiciones
correspondientes al pago de salarios»*, tomando como base *«el salario base de
cotización utilizado para el cálculo de las aportaciones … al IMSS»*.
`usado_en_codigo: []` y es correcto: Likida no calcula nómina — verificado que no
existe ningún cálculo de retención sobre pagos al operador (`grep` de
`iva_retenido`/`isr_retenido` solo devuelve el camino del CFDI **recibido**, no
del pago al chofer). **Ausencia declarada, no drift.** Lo que la ficha sí cambia
es que el agente contador ya puede citar la regla en vez de callar; antes el tema
`nomina_imss_y_descuentos` no tenía de dónde. Ojo con la trampa que la propia
ficha nombra (`lo_que_no_dice_la_regla`): no es exención ni tasa reducida, sigue
exigiendo CFDI de nómina y la relación individualizada antes del **15-feb-2027**.

**`rfa-2026-2.3.yaml` — responsabilidad solidaria acotada.** *«…serán responsables
solidarios únicamente por los ingresos, deducciones, impuestos y retenciones que
hayan consignado en la liquidación emitida al integrante de que se trate»*, y solo
cuando el coordinado aplica 2.1 o 2.2 **y** el integrante tributa individual.
`usado_en_codigo: []`, correcto: el producto no modela la relación
coordinado-integrante. Su valor es defensivo — evita que el agente responda sobre
responsabilidad solidaria citando LISR 72 sin la acotación, o al revés,
presentándola como si el coordinado nunca respondiera (la propia ficha marca esa
lectura como falsa).

**`rfa-2026-2.5.yaml` — concepto de coordinado, y la excepción con dientes.**
*«En el caso de centrales o paraderos de autotransporte que no sean integrantes de
algún coordinado, podrán tributar en el Título II, Capítulo VII de la Ley del ISR
… Además, dichas centrales o paraderos **no aplicarán las facilidades contenidas
en las reglas 2.1., 2.2. y 2.9.** de la presente Resolución.»*
Contra el código: `administracion.ts:195` deriva `regimenElegible` **solo** del
código de régimen (`['624','612']`), así que una central o paradero con régimen
624 pasaría ese filtro. **No es drift confirmado, y hay medio guardarraíl**: la
facilidad exige además que la flota declare `dedicacionExclusivaCarga`, y una
central de autotransporte —que presta servicios *a* transportistas— no se dedica
al autotransporte, así que la declaración honesta la cierra. El hueco real es que
el código no puede distinguir una declaración honesta de una equivocada, y que
`regimenFiscal` no tiene forma de expresar «624 pero central/paradero». La propia
ficha lo etiqueta como *«hueco de precisión … antes de que el producto entre a ese
segmento»*, y coincido: hoy no produce una cifra mal impresa porque Likida vende
a flotas, no a paraderos.

---

## Lo que revisé y está bien

- **La proporción de LIVA 5-I para el combustible en efectivo.**
  `engine.ts:536` (`proporcionDeducible.set(g.id, dentro / g.monto)`) y
  `engine.ts:1378,1399`. Medido: diésel de $232,000 con la mitad dentro del 15%
  → IVA acreditable $16,000 de $32,000, exacto. Ficha `liva-5.yaml`
  (`verificado_fuente_primaria`), fr. I, *«en la proporción en la que dichas
  erogaciones sean deducibles»*.
- **El IEPS de diésel nunca sale en pesos por el camino principal.**
  `engine.ts:1341-1345` (`const iepsAcreditable = 0`, con la razón escrita),
  `acreditable.ts:115-121` (litros, tono `condicionado`) y `NOTA_LITROS_DIESEL`.
  Es lo que `criterio-1-LIF-PI` exige de quien presta el servicio. (El desvío está
  en `fiscal.ts:793`, reportado arriba.)
- **La cuota semanal del IEPS ya cubre hoy.** `normas/datos/cuota-ieps-diesel.yaml`
  llega hasta `2026-08-29 a 2026-09-04` ($1.3622/L, DOF 28-ago vespertina,
  codNota 5797457). El MEDIO de la 22 (ocho días de hueco) está **cerrado**, y
  `cuota_diesel.ts` sigue sin caer al último valor conocido, que es lo único
  correcto para una cuota semanal.
- **El fail-closed del 15%.** `engine.ts:505-518`: sin total de combustible del
  ejercicio medido, o con un comprobante de otro ejercicio, no se afirma nada —
  ni deducible ni no deducible. Ficha `rfa-2026-2.9.yaml`.
- **La lectura del «siempre que» de la RFA 2.9 se declara, no se esconde.**
  `LECTURA_RFA_29_PRORRATEO` (`engine.ts:231-234`) sale impresa en la nota de
  `efectivo_sobre_15` diciendo que es una lectura y cuál es la alternativa.
- **La base del estímulo de peaje.** `engine.ts:1435-1436` (SubTotal menos
  `@Descuento`, por 0.5) y `BASE_ESTIMULO_PEAJE` (`acreditable.ts:55-57`) citando
  la RMF 9.1.8 fr. IV *«sin incluir el IVA»*. Ficha `rmf-2026-9.1.8.yaml`
  (`verificado_fuente_primaria`).
- **Los medios de pago del peaje.** `engine.ts:1420` usa `MEDIOS_ELECTRONICOS_PEAJE`
  (lista cerrada de la RMF 9.1.8 fr. III), y `formaPagoEfectiva` del REP cuando lo
  hay — con `pagadoForma` ausente la puerta sigue cerrada.
- **Las leyendas del PDF.** `cuadre/leyendas.ts:36-58` llevan literal *«puede
  diferir de los criterios que dé a conocer el SAT»*, que es la conducta que exime
  del último párrafo del CFF 89. Ficha `cff-89-90.yaml` (`verificado_fuente_primaria`).
- **`filasDeducibilidad`** (`liquidacion/deducibilidad.ts:47-55`): si las tres
  cubetas no suman el comprobado devuelve `null` en vez de imprimir un desglose
  que contradice su propio total. Y el tono `condicionado` cuando el permiso CRE
  no se verificó, con la condición **en el label**.
- **El catálogo contable no inventa cuentas.** `contabilidad/catalogo.ts:80-97`
  lee el override crudo (nunca `getConfig()`, que fusiona `DEMO_CONFIG`) y falla
  cerrado si la base truena. Las tres cuentas nuevas de la 22
  (`gasto_no_deducible`, `gasto_por_confirmar`, `retenciones_por_pagar`) están
  documentadas en `AYUDA_BALANCE` con el texto que la persona va a teclear.
- **Las cuatro fichas nuevas están sincronizadas** con `indice.ts` y
  `corpus_texto.ts`, con `estado`, `jerarquia` y `exigibleDesde` correctos.

---

## Lo que NO alcancé a revisar

- **Fichas que el método marca como *no verificables en esta ronda*** (sin
  `verificado_fuente_primaria`), con lo que sostienen:
  - `cff-29-A.yaml` — `texto_vigente: null` y `reformas_relevantes` fechadas
    **2026-11-07**, dos meses en el futuro y descritas en pasado. Sostiene
    `comprobante_no_fiscal`, `rfc_receptor`, `cfdi_cancelado`, `cfdi_no_encontrado`
    y `cfdi_pendiente` (`por_diferencia.ts:51,56-58`), tres de ellos en
    `NO_DEDUCIBLE_ISR`. **REINCIDENTE de la 22, sin tocar.**
  - `lisr-27-III.yaml` — `evidencia_corroborante` (ver MEDIO arriba).
  - `lisr-28-XX.yaml` — `evidencia_corroborante`; sostiene `consumo_bar`. El 8.5%
    de restaurantes sigue sin existir en el motor, declarado en la ficha.
  - `criterio-1-LIF-PI.yaml` — `texto_vigente: null`.
  - `rmf-2026-2.7.1.21.yaml` — `texto_vigente: null`; sostiene `factura_por_vencer`.
  - `rmf-2026-2.7.1.48.yaml` y `rmf-2026-3.3.1.7.yaml` — `evidencia_corroborante`.
  - `politica-portales-plazos.yaml` — `sin_verificar` (nivel 6, sin fuerza legal;
    el código lo dice en las tres ramas).
- **`carta_porte.ts` y `carta_porte_xml.ts` contra `normas/rmf-2026-2.7.7.yaml`** —
  el árbol 2.7.7.2.1/2.7.7.2.8, `CAMPOS_CCP` y `validarComplemento` contra el
  Estándar 3.1. Es la ficha con la sanción más severa (presunción de contrabando,
  CFF 103-XXII) y queda sin abrir por **segunda ronda consecutiva**.
- **`facturacion/al_vuelo.ts` (41k) y `comercios.ts` (147k)** — los requisitos del
  CFDI que Likida solicita a los portales, y `caducidad.ts` contra la RMF
  2.7.1.21 (cuya ficha no tiene texto, así que tampoco era verificable).
- **La RPC `gastos_fiscales_agregados_tenant` (mig. 0151)** — verifiqué la ley en
  TS (`fiscal.ts`), no el SQL que arma las celdas. Una dimensión mal agrupada
  mueve la cifra del panel del contador sin tocar TypeScript.
- **`intake/desglose_peaje.ts` / `bitacoraRmf918`** y el CSV de
  `api/export/bitacora-peaje` contra la fr. II de la RMF 9.1.8.
- **El efecto en ISR del IVA no acreditable** que la póliza manda a una cuenta de
  balance (`1190-002`): no hay ficha de LISR 28-XV en `normas/`, así que sigue sin
  poder compararse contra texto. Pregunta abierta para el fiscalista, igual que en
  la 22.
- **`lss-27.yaml` / `criterios-imss-sbc.yaml`** (`usado_en_codigo: []` en ambas) y
  la interacción entre viáticos no comprobados y el SBC — es la frontera con el
  rubro laboral y la dejé ahí.
- **Nota de alcance:** los CRÍTICOS 2 y 3 viven en el camino de export de póliza,
  que exige catálogo declarado **y** perfil de ERP confirmado. Con la base en cero
  (sin clientes) nadie los ha disparado todavía; se reproducen llamando
  `cuadrarViaje` y `polizaDeLiquidacion` directamente, que es como los medí.
