# Cumplimiento fiscal — auditoría 3 (pase 3)

**Nota: 3/10** (antes 3.5). Razón del movimiento: **mirada más profunda**. El
crítico heredado sigue intacto (tercera ronda) y esta vez sí abrí las 23 fichas
contra el código línea por línea: aparecieron **dos cifras fiscales impresas que
están mal** (el estímulo de peaje sobre casetas pagadas en efectivo, y el IVA
acreditable del panel del contador sobre CFDI timbrados a un tercero). El ancla
del rubro es explícita — «3 o menos si el producto imprime una cifra fiscal
equivocada» — y eso manda sobre lo mucho que sí está bien.

El riesgo mayor hoy: **el PDF que el contralor archiva es el único lugar donde
las condiciones del estímulo de peaje NO están dichas**, y encima su pie invita
a tomar una base que la RMF 2026 regla 9.1.8 fr. IV prohíbe por texto expreso.
La pantalla de Peajes dice la verdad completa; el papel que sale de la sala, no.

---

## Hallazgos

### [CRÍTICO] La elegibilidad de la RFA 2.9 se deriva de la clave SAT equivocada, y la clave correcta no existe en el producto
`src/lib/likida/administracion.ts:115-122` · `src/app/admin/flotas/page.tsx:361-377`
· ficha: `normas/rfa-2026-2.9.yaml` (**verificado_fuente_primaria**, DOF/SIDOF 5780249)

> «Los contribuyentes personas físicas o morales, dedicados exclusivamente al
> autotransporte terrestre de carga federal, **que tributen conforme al Título II,
> Capítulo VII o Título IV, Capítulo II, Sección I de la Ley del ISR**,
> considerarán cumplida la obligación establecida en el artículo 27, fracción III,
> segundo párrafo de la Ley del ISR, cuando los pagos por consumo de combustible
> se realicen con medios distintos a cheque nominativo… siempre que estos no
> excedan el 15 por ciento del total de los pagos efectuados por consumo de
> combustible…»

El código: `const REGIMENES_ELEGIBLES = ['601', '612'];` (`administracion.ts:121`).
En el catálogo `c_RegimenFiscal` del SAT, **601 es «General de Ley Personas
Morales» = Título II, Capítulo I** — no el Capítulo VII. **Título II Capítulo VII
(«De los Coordinados») es la clave 624**, que no está en el `<select>` de
`/admin/flotas` ni en `REGIMENES` de `src/lib/saas/fiscal.ts:20-26`. Sólo el 612
es correcto. Y el `<option>` mismo miente: `page.tsx:363` dice
`601 — General de Ley PM (coordinados)`, y el texto de ayuda (`:375`) le enseña a
Javier que «la facilidad del 15% (RFA 2.9) exige 601 o 612».

Escenario A (falso positivo, el caro):
Se da de alta «Transportes X, S.A. de C.V.», régimen real 601 (general de ley),
marcando dedicación exclusiva. `regimenElegible = true` → `config.facilidadCombustibleEfectivo`
→ `desde_db.ts:64-66` → `facilidad15 = true` → `engine.ts:325-377`. Con
$2,000,000 de diésel en el ejercicio y $300,000 pagados en efectivo, el motor
emite `combustible_efectivo_dentro15` («deducible por la facilidad del 15% (RFA
2026 regla 2.9)»), suma los $300,000 a `totalDeducible` y el PDF los imprime en
verde bajo **«Deducible para ISR»** (`liquidacion/deducibilidad.ts:58-72`). Por el
texto de arriba, esa flota no tributa en el Capítulo VII: la facilidad no la
alcanza y LISR 27-III, 2º párrafo, aplica sin excepción. **$300,000 no deducibles
presentados como deducibles → ~$90,000 de ISR + recargos + multa.**

Escenario B (falso negativo + dato fiscal corrupto):
Una flota que **sí** es Coordinado (624) no puede declararlo: no está en la lista.
Si Javier elige el 601 —porque la etiqueta dice «(coordinados)»— ese valor se
escribe en `tenant.regimen_fiscal` (`administracion.ts:133`), y de ahí lo lee
`facturacion/flota_fiscal.ts:80-87` → `FlotaFiscal.regimenFiscal` → el adaptador
lo teclea como **RegimenFiscalReceptor** en el portal de autofacturación
(`facturacion/adaptadores/capufe.ts:290, :1005`). Los CFDI de esa flota salen
timbrados con un régimen que no es el suyo. Si deja «Sin declarar», todo su
diésel en efectivo cae en `combustible_efectivo` → «por confirmar» para siempre.

Consecuencia: el contralor pierde una deducción que la RFA le concede (B) o la
declara teniéndola prohibida (A); en (B) además se contamina el receptor de cada
CFDI que el agente de facturación timbra. Y el criterio 1/CFF/PI del Anexo 3 y el
CFF 89 fr. I alcanzan a «quien preste servicios»: es exposición de Likida.

Causa raíz probable: la elegibilidad se derivó del catálogo de regímenes «que se
usan normalmente» en vez de mapear los dos capítulos que la regla nombra.

**(REINCIDENTE — tercera ronda. `git log -1 --format=%H -- src/lib/likida/administracion.ts` no tocó estas líneas desde el pase 2.)**

---

### [ALTO] El pie del PDF invita a inflar el estímulo de peaje 13.8% contra el texto expreso de la RMF 9.1.8 fr. IV
`src/lib/likida/liquidacion/acreditable.ts:35-49` (impreso vía `pdf.ts:357-381`)
· fichas: `normas/rmf-2026-9.1.8.yaml` (**verificado_fuente_primaria**) y
`normas/lif-2026-20-A.yaml` (**verificado_fuente_primaria**)

> RMF 2026, regla 9.1.8, fr. IV: «Para la determinación del monto del
> acreditamiento, **se aplicará al importe pagado por concepto del uso de la
> infraestructura carretera de cuota, sin incluir el IVA, el factor de 0.5** para
> toda la Red Nacional de Autopistas de Cuota.»

La ficha de la LIF cierra el punto sin ambigüedad: hallazgo **H4, `estado:
RESUELTO (14-ago-2026)` … «La lectura conservadora del motor es la que la regla
ordena — no hay que cambiar el código.»**

El PDF imprime, al pie del renglón del estímulo (`acreditable.ts:47-49`):

> «Base usada: el subtotal SIN IVA de las casetas con CFDI verificado. La ley
> dice "50% del gasto total erogado"; **si su contador toma el total con IVA, la
> cifra sube alrededor de 13.8%.**»

Y el docstring que lo justifica (`:40-41`) sigue diciendo `estado: SIN RESOLVER`
— la ficha lo cerró el 14-ago y este archivo no se enteró.

Escenario: liquidación con $10,000 de subtotal de casetas. El PDF imprime
«Estímulo de peaje 50% … $5,000.00» y debajo le sugiere al contador tomar
$11,600 × 0.5 = **$5,800**. Si el contador sigue la sugerencia, acredita **$800
de más** por liquidación — y con 40 liquidaciones al mes, $32,000 mensuales de
acreditamiento improcedente, con nuestro PDF citando el artículo como respaldo.

Consecuencia: el contralor acredita de más contra una regla de jerarquía 3
verificada en fuente primaria; en revisión responde él, con nuestro papel como
evidencia. La pantalla `dashboard/agentes/peajes/vista.tsx:302` ya dice lo
contrario («la duda de "gasto total erogado" de la LIF quedó resuelta por esta
fracción»): **dos superficies del mismo producto afirman cosas opuestas sobre la
misma cifra.**

Causa raíz probable: `acreditable.ts` se escribió cuando la ficha 9.1.8 no
existía y nadie volvió a él al cerrar H4.

---

### [ALTO] El estímulo del 50% se acredita sobre casetas pagadas en EFECTIVO
`src/lib/likida/cuadre/engine.ts:1008` · `src/lib/likida/liquidacion/acreditable.ts:64-67`
· ficha: `normas/rmf-2026-9.1.8.yaml` (**verificado_fuente_primaria**)

> RMF 2026, regla 9.1.8, fr. III: «**Efectuar los pagos de autopistas mediante la
> tarjeta de identificación automática vehicular o de cualquier otro sistema
> electrónico de pago con que cuente la autopista** y conservar los estados de
> cuenta» de dicha tarjeta o sistema.

La propia ficha lo traduce: «*La fr. III mata el efectivo: una caseta pagada en
ventanilla con billetes NO genera estímulo aunque después se facture.*»

El código:
```
if (g.concepto === 'caseta' && (g.subTotal ?? 0) > 0) peajeAcreditable += (g.subTotal as number) * peajeFactor;
```
No mira `g.formaPago`. El único filtro por efectivo del motor es
`efectivo_sobre_tope` (`engine.ts:391-394`), que sólo dispara **arriba de
$2,000** — y ninguna caseta de México cuesta eso. Dos líneas más abajo, el
estímulo hermano (IEPS de diésel) **sí** exige medio electrónico:
`const pagoElectronico = !!g.formaPago && g.formaPago !== '01';` (`:1035`). La
disciplina existe en el mismo bucle y no se aplicó al peaje.

Escenario: un viaje con 8 casetas pagadas en ventanilla con billetes, $1,000 cada
una, autofacturadas después en el portal de CAPUFE (que es justo lo que hace el
agente de Facturas), `forma_pago = '01'`, subtotal $862.07 c/u. El motor suma
8 × $862.07 × 0.5 = **$3,448.28** y el PDF los imprime como «Estímulo de peaje
50% (LIF 2026 art. 20, ap. A)». Por la fr. III el estímulo es **$0.00**.

Y el papel no avisa: `CONDICIONES_ESTIMULO_PEAJE` (`acreditable.ts:64-67`)
enumera **sólo las cuatro condiciones de la LIF** (exclusividad, Red Nacional,
<$300M, partes relacionadas) y **no menciona la fr. III ni la fr. I ni la fr.
II**. La pantalla de Peajes sí las dice todas
(`dashboard/agentes/peajes/vista.tsx:304-305`); el PDF, que es el documento que
se archiva y el que ve el contador, no.

Consecuencia: el contralor acredita un estímulo improcedente con nuestro PDF como
soporte, y ni el papel ni el motor le dan una señal de que ese dinero está en
duda. En una revisión son estímulos rechazados con actualización y recargos.

Causa raíz probable: la ficha `rmf-2026-9.1.8` se creó después que la regla del
motor, y sus fracciones I–III sólo se cablearon en la pantalla del agente
Peajes, nunca en el cálculo ni en el PDF.

---

### [ALTO] El panel del contador acredita el IVA de CFDI timbrados a un TERCERO — el motor no
`src/lib/likida/fiscal.ts:559-570` y `:777` (la lista de columnas) ·
`src/lib/likida/cuadre/engine.ts:965` · ficha: `normas/liva-5.yaml`
(**verificado_fuente_primaria**)

> LIVA art. 5o., fr. I: «Que el impuesto al valor agregado corresponda a bienes,
> servicios o al uso o goce temporal de bienes, **estrictamente indispensables**…
> Para los efectos de esta Ley, se consideran estrictamente indispensables las
> erogaciones efectuadas por el contribuyente **que sean deducibles para los
> fines del impuesto sobre la renta**…»
> Fr. II: «Que el impuesto al valor agregado **haya sido trasladado expresamente
> al contribuyente** y que conste por separado en los comprobantes fiscales…»

`ivaSostenible` (`fiscal.ts:559-570`) comprueba CFDI, cancelado, pendiente,
no_encontrado, EFOS y efectivo — y **nada del receptor**. No puede: `GastoFiscal`
(`fiscal.ts:49-89`) no tiene campo `rfcReceptor`, y la cadena de columnas que lee
de la base (`fiscal.ts:777`) no incluye `rfc_receptor`, aunque la columna existe y
`repo.ts:666` sí la lee para el motor. El motor, en cambio, mete `rfc_receptor` en
`NO_DEDUCIBLE_ISR` (`engine.ts:108`) y en `SIN_ACREDITAMIENTO` (`engine.ts:965`).

Escenario: un CFDI de diésel de $11,600 (subtotal $10,000, IVA trasladado $1,600)
timbrado al RFC de otra empresa. La liquidación del viaje dice: «No deducible
$11,600.00», IVA acreditable **$0.00**. La pantalla del contador
(`dashboard/contador/inicio-contador.tsx:344-346`), sobre el mismo comprobante y
el mismo ejercicio, suma esos **$1,600 a «IVA acreditable documentado»** con la
nota «LIVA art. 5 — solo el IVA desglosado en CFDI que lo sostiene». Ese CFDI no
lo sostiene ni por la fr. I (no es deducible) ni por la fr. II (el IVA no le fue
trasladado al contribuyente).

Consecuencia: la cifra que el contador teclea en su DIOT/declaración mensual sale
inflada, y el mismo producto le da dos números distintos para el mismo papel —
exactamente el modo de falla que `lib/formato.ts` existe para evitar, pero en
dinero fiscal. El commit `1eb65c5` («los dos motores de IVA dicen lo mismo») cerró
sólo la divergencia del tope de alimentación; **esta sigue abierta**, y ni
`liva-5.yaml` ni el bloque `LIMITES` de `fiscal.ts:1082-1097` la declaran.

Causa raíz probable: `resumirFiscal` nació sobre la lista de columnas de las
«pérdidas» (que no necesita receptor) y nadie la revisó al convertirla en la
fuente del IVA acreditable del periodo.

---

### [ALTO] Un viático timbrado a un RFC desconocido sale deducible y con su IVA acreditado, en verde
`src/lib/likida/cuadre/engine.ts:507-517`, `:108-109`, `:965`
· ficha: `normas/rlisr-57.yaml` (**verificado_fuente_primaria**) y
`normas/liva-5.yaml` (**verificado_fuente_primaria**)

> RLISR 57: «…Si benefician a personas que le prestan servicios personales
> subordinados, los comprobantes fiscales **podrán** ser expedidos a nombre de
> dichas personas, en cuyo caso… se tendrá por cumplido el requisito de respaldar
> dichos gastos con el comprobante fiscal **a nombre de aquél por cuenta de quién
> se efectuó el gasto**.»

La excepción está condicionada a que el receptor sea **esa persona** (el
trabajador subordinado). El motor emite `viatico_rfc_operador` precisamente
cuando **no puede saberlo**: `else if (esViatico && !rfcOperador)`
(`engine.ts:511-514`), y la propia ficha declara que `operador.rfc` no se puede
poblar todavía, así que **toda** liquidación con un viático a nombre de persona
entra por esta rama. Pero `viatico_rfc_operador` no está en `NO_DEDUCIBLE_ISR`
(`:108`), ni en `POR_CONFIRMAR` (`:109`), ni en `SIN_ACREDITAMIENTO` (`:965`).

Escenario: hospedaje de $2,320 (subtotal $2,000, IVA $320) con XML verificado y
`rfcReceptor = PEGJ850101AB1` — un RFC que no es de la flota y que nadie ha
confirmado que sea del operador. `cubetaDe` lo manda a **`deducible`**, se suma
íntegro a `totalDeducible` y sus $320 entran a `ivaAcreditable`. El PDF imprime
«**Deducible para ISR $2,320.00**» (tono `bueno`, verde) y «**IVA acreditable
(LIVA art. 5) $320.00**» (tono `bueno`). El motor afirma dos cosas que acaba de
decir por escrito que no puede confirmar.

Compárese con el hermano de al lado: cuando el receptor **no se puede leer**, el
motor emite `rfc_receptor_no_verificable`, que **sí** está en `SIN_ACREDITAMIENTO`
(`:965`) → nada deducible, nada acreditable, a revisión. Dos estados que
significan lo mismo («no se puede confirmar ni descartar») con veredictos
opuestos, y el que afirma es el que depende de una etiqueta de concepto que pone
el OCR sobre la foto que mandó el operador.

Consecuencia: basta que el comprobante se clasifique como
alimentacion/hospedaje/transporte para que un CFDI a nombre de un tercero
cualquiera salga deducible y acreditable en el papel. Es el mismo daño del
crítico AL-6 que el archivo documenta haber cerrado dos veces, por una tercera
puerta.

Causa raíz probable: al implementar la excepción de RLISR 57 se movió el caso
«sin dato» al lado permisivo en vez de al tercer estado que el resto del motor ya
usa.

---

### [ALTO] Al combustible en efectivo dentro del 15% se le niega el IVA acreditable, y la ficha sólo excluye el IEPS
`src/lib/likida/cuadre/engine.ts:959-965` · `src/lib/likida/fiscal.ts:565-568`
· fichas: `normas/rfa-2026-2.9.yaml` y `normas/liva-5.yaml` (ambas
**verificado_fuente_primaria**)

> RFA 2026 regla 2.9, `limite_importante` (ficha): «Conserva la **DEDUCCIÓN** para
> ISR. **NO habilita el acreditamiento del IEPS**: son dos beneficios distintos y
> el efectivo solo salva uno.»
> LIVA art. 5o., fr. I: «…se consideran estrictamente indispensables las
> erogaciones efectuadas por el contribuyente **que sean deducibles para los fines
> del impuesto sobre la renta**…»

La regla y la ficha excluyen **el IEPS**. La LIVA no condiciona el acreditamiento
del IVA al medio de pago; su requisito es que la erogación sea deducible para
ISR — y dentro del 15% **lo es**, por la propia RFA 2.9. Sin embargo
`SIN_ACREDITAMIENTO` (`engine.ts:965`) incluye `combustible_efectivo_dentro15` y
`efectivo_sobre_15`, y ese mismo arreglo gobierna `ivaAcreditable` (`:983`,
`:1006`). El comentario que lo justifica (`:959-964`) habla **sólo de IEPS**:
«`combustible_efectivo` SÍ es deducible hasta el 15%…, pero NO acredita IEPS…
Sacarlo de aquí acreditaría un IEPS que la facilidad no concede.» El efecto real
alcanza al IVA. `fiscal.ts:568` replica la misma exclusión en el panel.

Escenario: flota elegible, diésel de $11,600 (subtotal $10,000, IVA $1,600)
pagado en efectivo, dentro del 15% del ejercicio, con XML verificado. El PDF
imprime «Deducible para ISR $11,600.00» y **no imprime un solo peso de IVA
acreditable por ese CFDI**: `ivaAcreditable += 0`. Lo correcto por la fr. I son
$1,600. Para una flota que compra $2M de diésel al año, el 15% en efectivo son
$300,000 → **~$41,379 de IVA acreditable al año que el producto le borra**.

Nótese además que el `efectivo_sobre_15` sí tiene calculada su proporción
deducible (`engine.ts:363`, `proporcionDeducible`) —la maquinaria para acreditar
«en la proporción en la que dichas erogaciones sean deducibles» existe— y el
`continue` de `:983` la salta entera.

Consecuencia: el contralor paga IVA de más y el papel no le dice por qué; es una
cifra equivocada, aunque sea del lado conservador. Y contradice la regla de
producto: sobre-restringir también es afirmar algo que la norma no dice.

Causa raíz probable: una sola lista (`SIN_ACREDITAMIENTO`) gobierna tres
acreditamientos distintos (IVA, IEPS/litros, peaje) que no tienen los mismos
requisitos.

---

### [MEDIO] La factura que emite la flota no admite la retención del 4% de IVA de autotransporte: el constraint la vuelve imposible
`supabase/migrations/0049_cobranza_factura_emitida_pago.sql:54-55` ·
`src/lib/likida/facturacion_escritura.ts:107-114`
· **ficha: NO EXISTE en `normas/`** — y esa ausencia es parte del hallazgo.

No hay ficha de LIVA art. 1-A fr. II inciso c) ni de RLIVA art. 3 fr. II, que son
la norma que gobierna literalmente **cada** CFDI que este módulo nuevo va a
emitir. Lo único que hay en el repo es el propio código, que la conoce y la
describe (`src/lib/likida/fiscal.ts:718-743`): *«QUIÉN RETIENE A QUIÉN. Cuando la
flota CONTRATA a un tercero… la flota es persona moral que recibe un servicio de
autotransporte terrestre de bienes: está obligada a RETENER el IVA… El otro lado
—lo que los clientes de la flota le retienen a ELLA— vive en los CFDI que la
flota emite, y eso no es parte de este panel.»* Ese otro lado **ya es parte del
producto** desde `a0350ae`, y llegó sin retención.

El esquema fija `check (abs(total - (subtotal + iva)) <= 0.01)` y
`validarFactura` calcula `total = Math.round((subtotal + iva) * 100) / 100`. No
hay campo de retenido.

Escenario: la flota le factura a un cliente persona moral $10,000 + IVA $1,600;
el cliente retiene el 4% ($400) y paga **$11,200**, que es el total del CFDI. En
la pantalla el contralor teclea subtotal 10,000 e IVA 1,600 → la fila queda con
`total = 11,600`. Al registrar el pago de $11,200, `evaluarAbono`
(`facturacion_escritura.ts:178-186`) deja saldo **$400**, la factura nunca pasa a
`pagada`, y `facturacion_clientes.ts` la pinta vencida y en la cartera por
cobrar. La salida es teclear IVA = 1,200 para que cuadre — y entonces la columna
de IVA trasladado de las facturas propias de la flota queda mal en todo el
libro y en el export.

Consecuencia: el contralor persigue un saldo que no existe (o falsea su IVA
trasladado) en la superficie que precisamente compró para cuadrar cobranza contra
contabilidad.

Causa raíz probable: la 0049 modeló la factura como subtotal+IVA sin el nodo de
retenciones, que en autotransporte de carga no es un caso raro sino el caso
normal.

---

### [MEDIO] El agente no puede citar la regla que fija la base del estímulo de peaje
`src/lib/likida/normas/por_diferencia.ts:133` · ficha:
`normas/rmf-2026-9.1.8.yaml` (**verificado_fuente_primaria**, `exigibleDesde
2026-01-01` en `normas/indice.ts:310-321`)

`NORMA_POR_CONCEPTO` da para `caseta` únicamente `['lif-2026-art-20-A']`. La
ficha 9.1.8 está en el índice, verificada, y es la que fija la base (fr. IV) y
los cuatro requisitos operativos — pero `guardiaFundamento` le borra al agente
cualquier cita de ella.

Escenario: el contralor le pregunta al chat «¿por qué el peaje acreditable es
$5,000 y no $5,800?». La única norma que el agente tiene permitida es la LIF art.
20-A, cuyo texto dice «hasta en un 50 por ciento del **gasto total erogado**» —
o sea, la respuesta que el agente puede fundamentar es la equivocada, y la que
resuelve la duda (fr. IV, «sin incluir el IVA») se le borra a media frase.

Consecuencia: el agente explica la cifra con la norma que la contradice, o no la
explica. Es el mismo hueco del hallazgo ALTO del pie del PDF, por la puerta del
chat.

Causa raíz probable: `NORMA_POR_CONCEPTO` no se actualizó al crear la ficha 9.1.8.

---

### [BAJO] El bloque «LO QUE ESTE MÓDULO NO HACE» de `fiscal.ts` ya no es cierto
`src/lib/likida/fiscal.ts:1085-1090` vs `src/lib/likida/fiscal.ts:36`, `:587-595`

> «1. NO evalúa el tope de $750/día de alimentación (LISR 28-V)… Repetirlo aquí
> con otra implementación produciría dos cifras distintas para el mismo hecho.»

Desde `1eb65c5`, `resumirFiscal` **sí** lo evalúa —importa
`proporcionAlimentacionPorGasto` y lo aplica por viaje— y lo hace bien, con el
módulo compartido. El bloque que existe para que «nadie lo suponga» ahora
supone al revés: un auditor (o el próximo agente) leyendo ese contrato concluirá
que el IVA de los viáticos del panel está sin prorratear, y buscará un bug que ya
no existe. En este repo, un contrato escrito que miente es deuda que ya cobró
factura tres veces (`gasto.ocr_raw`, `politica_gasto`, las 16 fichas del E3).

Consecuencia: pérdida de confianza en el único inventario de límites del módulo
fiscal.

---

### [BAJO] La ficha del criterio 1/CFF/PI entró al índice con el título roto
`src/lib/likida/normas/indice.ts:124-131` (`titulo: ">"`)

El generador del corpus copió el marcador de bloque YAML (`>`) en lugar del
título. `citaDe`/`norma()` alimentan los mensajes del agente y el corpus de
`guardiaFundamento`, así que la norma que sostiene la **leyenda de descargo** —la
conducta literal con la que el art. 89, último párrafo, exime a Likida de la
infracción de la fr. I— aparece sin nombre legible.

Consecuencia: cosmético hoy, pero es la ficha de la que depende la eximente del
CFF 89; que su título esté corrupto en el índice indica que nadie lo mira.

---

## Lo que revisé y está bien

- **El estímulo de IEPS de diésel NO se calcula con el IEPS trasladado.**
  `cuadre/engine.ts:974-978, :1009-1060` deja `iepsAcreditable = 0` a propósito y
  entrega `litrosDieselAcreditables`; `liquidacion/acreditable.ts:78-101` los
  imprime en litros con `NOTA_LITROS_DIESEL`. Coincide literalmente con
  `normas/lif-2026-20-A.yaml` (**v.f.p.**): «cuota IEPS vigente al momento de la
  compra × LITROS. **No es el IEPS trasladado en el CFDI**», y con
  `normas/criterio-1-LIF-PI.yaml` (cuota semanal disminuida). Es lo que más
  fácilmente habría estado mal y está bien.
- **El medio de pago del estímulo de diésel sí se exige** (`engine.ts:1035`) y la
  facilidad del 15% no lo salva — coherente con `rfa-2026-2.9.yaml`
  (`limite_importante`).
- **Los litros del OCR se cotejan** contra `monto ÷ precioRef` con tolerancia
  0.5×–2× (`engine.ts:1045-1056`): un decimal corrido ya no acredita 100× el
  estímulo.
- **Tope de alimentación $750/día** (`cuadre/tope_alimentacion.ts:86-112`,
  `engine.ts:907-948`): territorio nacional, por día y por beneficiario (un
  operador por liquidación), sólo el concepto alimentación, y la proporción del
  día calculada **sólo entre lo timbrado**. Coincide con `normas/lisr-28-V.yaml`
  (**v.f.p.**) y con su `confirmado_del_codigo`. H1 y H2 implementados como aviso
  (`engine.ts:826-890`), incluida la exigencia de **tarjeta de crédito** ('04',
  débito no cuenta) cuando lo único que ampara la comida es transporte — que es
  la 3ª oración literal del 2º párrafo.
- **Proporcionalidad del IVA (LIVA 5-I)** aplicada en los dos motores desde un
  módulo compartido (`tope_alimentacion.ts` ← `engine.ts:1004`, `fiscal.ts:591`),
  con el caso $900/$750 → 83.33% fijado en prueba. Verificado contra
  `normas/liva-5.yaml` (**v.f.p.**). Ésta sí quedó cerrada por `1eb65c5`.
- **El interruptor del complemento de hidrocarburos** lo decide la **ficha**, no
  la configuración: `engine.ts:550-599` lee `exigibleDesde` de
  `NORMAS['rmf-2026-2.7.1.48']` (hoy `null`, `indice.ts:294-307`) y con `null`
  sólo emite `complemento_no_verificable` (revisión). Coincide con
  `normas/rmf-2026-2.7.1.48.yaml`, cuya regla sigue redactada en futuro. Es el
  patrón correcto para toda norma latente.
- **EFOS nunca se afirma sin certeza**: `intake/sat.ts:80-86` sólo mapea
  `efos: false` con códigos 200/201 y manda todo lo demás a
  `cfdi_efos_indeterminado`. Coherente con `normas/cff-69-B.yaml` (**v.f.p.**),
  que reserva el efecto duro al **listado definitivo**.
- **Las leyendas son la eximente literal, no adorno**: `cuadre/leyendas.ts:36-58`
  incluye «puede diferir de los criterios que dé a conocer el SAT» en la corta y
  en el pie del PDF. `normas/cff-89-90.yaml` (**v.f.p.**), art. 89 último
  párrafo: «No se incurrirá en la infracción… cuando se manifieste… **por
  escrito** al contribuyente que su asesoría puede ser contraria a la
  interpretación de las autoridades fiscales.» Va por escrito y en el papel que
  se archiva, que es la condición.
- **El plazo del portal se declara como nivel 6 en las dos ramas**
  (`engine.ts:751-753`): «legalmente puedes exigir la factura dentro del
  ejercicio». Coincide con `normas/politica-portales-plazos.yaml`
  (`advertencia_de_jerarquia`). Y `plazo_vencido` ya es `en_riesgo`, no
  `perdida` (`fiscal.ts:394-400`).
- **CFF 30**: `app/privacidad/page.tsx:101` promete «**al menos** cinco años» y
  nombra los tres supuestos que lo alargan, y la purga de `0104` excluye
  expresamente `gasto`, `cfdi_xml` y `liquidacion` (`0104:36`). Coincide con
  `normas/cff-30.yaml` (**v.f.p.**), `limite_importante`.
- **Carta Porte (superficie nueva, `e7b1b1f`)**: el árbol de
  `carta_porte.ts:100-170` reproduce las tres entradas de 2.7.7.2.1/2.7.7.2.8 de
  `normas/rmf-2026-2.7.7.yaml` (**v.f.p.**); `radioFederalKm <= 30` es la lectura
  correcta de «no exceda de un radio de distancia de 30 kilómetros»; con huecos
  responde `falta_declarar` y nunca «no necesita»; `C2R2`/`C2R3` van al lado
  seguro; el reparto 19/18 refleja el último párrafo de la 2.7.7.1.1
  («responsabilidad… limitada a los datos que proporcione cada una de las
  partes»); y el supuesto de carga general está **declarado** en el código
  (`carta_porte_datos.ts:95`) y **repetido en la pantalla**
  (`dashboard/carta-porte/vista.tsx:44-48`). No encontré un hallazgo fiscal aquí.
- **Retenciones del lado del gasto**: `fiscal.ts:744-759` se niega a derivar el 4%
  como `sub_total * 0.04` y nombra las dos columnas que faltarían. Correcto.
- **Los parámetros de la LEY no son editables por el cliente**
  (`ajustes_operativos.ts:20-30`): `peajeFactor`, claves del SAT y
  `hidrocarburos.*` no tienen formulario, a propósito.
- **`441eb86` (validación de receptor apagada)**: verificado. El seed ya propaga
  `rfc = excluded.rfc`, `/api/demo` pasa `empresaRfc` y mapea `rfcReceptor`
  (`api/demo/route.ts:39-50`), y el RFC del tenant demo pasa `esRfcValido` +
  `rfcChecksumOk`. La defensa corre. **Ese hallazgo quedó cerrado.**

---

## Fichas no verificables en esta ronda

Estas sostienen veredictos que el producto **imprime**, y no están en
`verificado_fuente_primaria`. No se asume que estén bien ni mal; se anota que hoy
el producto decide dinero sobre ellas. Es la razón principal por la que este
rubro no puede acercarse al 8 aunque se cierren los hallazgos de arriba.

| Ficha | Estado | Qué decide hoy | Qué falta (según la propia ficha) |
|---|---|---|---|
| `lisr-27-III.yaml` | `evidencia_corroborante`, texto de Justia | `efectivo_sobre_tope` y `efectivo_no_elegible` → **no deducible duro** (`engine.ts:108`) | «leer el PDF vigente de la LISR en diputados.gob.mx y confirmar que la redacción del segundo párrafo no cambió» |
| `cff-29-A.yaml` | `evidencia_corroborante`, `texto_vigente: null` | `rfc_receptor`, `cfdi_cancelado`, `cfdi_no_encontrado` → **no deducible duro**; `comprobante_no_fiscal` | «pegar el texto vigente» |
| `rmf-2026-2.7.1.48.yaml` | `evidencia_corroborante`, exigibilidad sin confirmar | hoy sólo avisa (correcto); el día que se llene `fecha_vigencia_desde`, tira deducciones | «confirmar en el Portal del SAT la fecha de publicación del complemento» |
| `criterio-1-LIF-PI.yaml` | `evidencia_corroborante`, `texto_vigente: null` | la decisión de NO imprimir pesos de IEPS | «pegar el texto del criterio desde el Anexo 3» |
| `criterio-1-CFF-PI.yaml` | `evidencia_corroborante`, `texto_vigente: null` | la leyenda de descargo del PDF | «bajar el Anexo 3 del DOF del 09-01-2026 y pegar fracciones II, III y IV» |
| `rmf-2026-2.7.1.21.yaml` | `evidencia_corroborante`, `texto_vigente: null` | fundamento de `factura_por_vencer` | «pegar el texto de la regla desde la RMF» |
| `politica-portales-plazos.yaml` | `sin_verificar` (jerarquía 6, a propósito) | la fecha límite impresa cuando `plazoVerificado` | entrar a cada portal; hoy declarado correctamente como nivel 6 |
| *(inexistente)* LIVA 1-A fr. II inciso c) / RLIVA 3 fr. II | **no hay ficha** | la retención del 4% que `factura_emitida` no modela | crear la ficha; ver hallazgo MEDIO |
| *(inexistente)* LIF 2026 art. 20-A, 4º párrafo (medio de pago del estímulo de diésel) | **no transcrito** en `lif-2026-20-A.yaml` (elidido con «…») | `pagoElectronico` en `engine.ts:1035` | transcribir el párrafo; hoy el código cita un requisito que su ficha no contiene |

---

## Lo que NO alcancé a revisar

- **`facturacion/adaptadores/`** (capufe, playwright, registro): sólo verifiqué
  que `regimenFiscal` viaja de `tenant.regimen_fiscal` al portal. No audité qué
  otros campos fiscales se teclean ni si el CFDI resultante se coteja contra lo
  pedido.
- **`facturacion/permiso_cre.ts` + `permisos_cre.json`**: no comprobé si el
  padrón embebido se usa para afirmar algo (el motor sólo emite
  `permiso_cre_no_verificable`, que es lo correcto, pero no seguí el otro
  consumidor).
- **`intake/cfdi_xml.ts`**: no verifiqué el parseo de `TipoFactor="Cuota"` vs
  `"Tasa"` ni el manejo de tasa 0%/exento en `iva_traslado` — de ahí sale la
  cifra que los dos motores de IVA suman.
- **`intake/desglose_peaje.ts` / `api/export/bitacora-peaje`**: no crucé el CSV de
  la bitácora contra el texto de la fr. II de la 9.1.8 (origen/destino/ruta
  conciliados con el estado de cuenta del TAG).
- **`lib/saas/fiscal.ts`** (la facturación de Likida a sus flotas): sólo miré el
  catálogo `REGIMENES`; no audité el CFDI que Likida emite por su suscripción.
- **`normas/fundamento.ts`** (29 KB, binario para grep): no lo leí completo, así
  que no puedo afirmar qué más deja o no deja citar al agente más allá de
  `por_diferencia.ts`.
- **`normas/.latido-*`**: las dos vigilancias (cuota diésel y normativa) llevan
  corridas bloqueadas por egress; no evalué si alguna ficha se pudrió por eso.
