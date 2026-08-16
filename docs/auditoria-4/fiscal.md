# Cumplimiento fiscal — auditoría 4

**Nota: 3/10** (antes 4). Razón del movimiento: **deuda que cobró factura** —
FI-C1 sigue cerrado y con su ancla verde (`rfa29_regimenes.test.ts`, 5/5), pero
**ninguno de los 5 ALTOS, 2 MEDIOS y 2 BAJOS del pase 3 se tocó** (verificados
uno por uno contra el árbol de hoy, con `archivo:línea` nuevos), y esta ronda
aparece un **CRÍTICO nuevo** que borra dinero comprobado del papel: el motor de
cuadre trata como *duplicados* las N casetas que la migración 0065 diseñó
expresamente para compartir un CFDI. El ancla del rubro es explícita —«3 o menos
si el producto imprime una cifra fiscal equivocada»— y hoy imprime varias.

**El riesgo mayor del rubro, hoy:** el único mecanismo que le consigue CFDI a
las casetas (el agente de Facturas contra CAPUFE, y el desglose consolidado de
TAG) produce ocho gastos con un solo `cfdi_uuid`, y el cuadre los lee como el
mismo comprobante ocho veces: la liquidación resta $7,000 del comprobado, se los
cobra al operador como diferencia, y los saca de «Deducible para ISR» — es decir,
el camino que existe para *ganar* la deducción es el que la destruye.

---

## Hallazgos

### [CRÍTICO] El cuadre declara duplicadas las N casetas que la 0065 diseñó para compartir UN CFDI

`src/lib/likida/cuadre/engine.ts:156-167` (`copiasDeComprobante`) ·
`src/lib/likida/cuadre/engine.ts:271-277` (exclusión del total) ·
`src/lib/likida/cuadre/engine.ts:644-655` (la nota que se imprime) ·
`src/lib/likida/repo.ts:663-667` (el `select` que **no** trae `cfdi_orden`)
· escritores: `src/lib/likida/facturacion/al_vuelo.ts:518` y
`src/lib/likida/intake/consolidado.ts:173-186`
· fichas: `normas/rmf-2026-9.1.8.yaml` (**verificado_fuente_primaria**) y
`normas/lisr-27-III.yaml` (`evidencia_corroborante`)

> RMF 2026, regla 9.1.8, fr. IV: «Para la determinación del monto del
> acreditamiento, **se aplicará al importe pagado por concepto del uso de la
> infraestructura carretera de cuota**, sin incluir el IVA, el factor de 0.5
> para toda la Red Nacional de Autopistas de Cuota.»
> LISR 27, fr. III: «**Estar amparadas con un comprobante fiscal**…»

La base de la propia migración (`supabase/migrations/0065_cfdi_de_varias_casetas.sql:4-38`)
distingue los dos hechos con todas sus letras:

> «"este gasto **NACIÓ** de ese CFDI" → 1 a 1. Es lo que hay que impedir.
> "este gasto está **AMPARADO** por ese CFDI" → N a 1. Es la factura de CAPUFE.»
> «Ocho casetas de un viaje = ocho filas de `gasto` y UN `cfdi_uuid`.»

La base aprendió la distinción (`uq_gasto_cfdi_uuid` pasó a `(tenant_id,
cfdi_uuid, cfdi_orden)`, `0065:68-69`). **El motor no.** `copiasDeComprobante`
deduplica por UUID a secas y `cfdi_orden` **ni siquiera llega al motor**: no está
en el `select` de `getGastos` (`repo.ts:666`) ni en el tipo `Gasto`
(`src/types/likida.ts:29`).

```ts
// engine.ts:162-167
if (g.cfdiUuid) {
  const u = g.cfdiUuid.toLowerCase();
  const previo = vistoUuid.get(u);
  if (previo) originalDe.set(g.id, previo);   // ← copia = duplicado
  else vistoUuid.set(u, g.id);
  continue;
}
```

**Escenario con cifras.** Viaje con anticipo de $8,000 y 8 cruces de caseta de
$1,000 c/u (subtotal $862.07, IVA $137.93). El cron de facturación
(`api/cron/facturar/route.ts:473`) los manda **en un solo lote** al portal de
CAPUFE —«Ocho casetas de un viaje son UNA sesión, no ocho»,
`facturacion/agente.ts:116`—, CAPUFE emite **una** factura, y `escribirUuid`
(`al_vuelo.ts:518`) escribe el mismo `cfdi_uuid` con `cfdi_orden` 1..8. Al
cuadrar:

| Cifra que imprime el PDF | Con el bug | Lo correcto |
|---|---|---|
| Total comprobado | **$1,000.00** | $8,000.00 |
| Diferencia contra el anticipo | **$7,000.00 «sobró anticipo — el operador regresa»** | $0.00 |
| Deducible para ISR | **$1,000.00** | $8,000.00 |
| Diferencia impresa | «Comprobante duplicado: caseta por $1,000.00 aparece **8 veces (7 excluidas del total)**» | — |

Y con el mismo mecanismo por el otro camino: un consolidado mensual de TAG
enviado por WhatsApp (`guardarYConciliarConsolidado`) sella exactamente igual
(`consolidado.ts:176`), así que las casetas de un mismo viaje dentro de ese
estado de cuenta caen en la misma trampa.

**Consecuencia.** Para el operador: se le reclaman $7,000 que sí gastó y sí
comprobó, y el papel lo acusa por escrito de duplicar comprobantes. Para el
contralor: el ejercicio pierde $7,000 de deducción de peaje **amparados con
CFDI** (LISR 27-III cumplido) y el importe pagado que la fr. IV usa como base del
estímulo se reduce a un octavo. Para la flota: el único camino automatizado que
Likida vende para conseguir el CFDI de las casetas es el que destruye la
deducción de esas casetas. No hay prueba que lo cubra: `duplicados.test.ts:69-70`
sólo prueba dos gastos con el mismo UUID —el caso 1:1— y ningún test de
`cuadre/` menciona `cfdi_orden` ni CAPUFE.

Causa raíz probable: la 0065 partió el concepto «un CFDI» en dos (nació / ampara)
en la base y en los dos escritores, y el lector del dinero —el motor— se quedó
con la definición vieja.

---

### [ALTO · REINCIDENTE 2ª ronda] El pie del PDF sigue invitando a inflar el estímulo de peaje 13.8% contra el texto expreso de la RMF 9.1.8 fr. IV

`src/lib/likida/liquidacion/acreditable.ts:47-49` (impreso vía
`liquidacion/pdf.ts:357-381`), docstring en `:37-42`
· fichas: `normas/rmf-2026-9.1.8.yaml` y `normas/lif-2026-20-A.yaml` (ambas
**verificado_fuente_primaria**)

> RMF 2026, 9.1.8, fr. IV: «…se aplicará al importe pagado por concepto del uso
> de la infraestructura carretera de cuota, **sin incluir el IVA**, el factor de
> 0.5…»
> `lif-2026-20-A.yaml`, hallazgo H4: «`estado: RESUELTO (14-ago-2026)` … La
> lectura conservadora del motor es la que la regla ordena — **no hay que cambiar
> el código**.»

El texto impreso no cambió: «*si su contador toma el total con IVA, la cifra sube
alrededor de 13.8%*» (`:48-49`), y el docstring que lo justifica sigue diciendo
`estado: SIN RESOLVER` (`:41`) dos días después de que la ficha lo cerrara.

Escenario: $10,000 de subtotal de casetas → el PDF imprime «Estímulo de peaje
50% … $5,000.00» y debajo sugiere $11,600 × 0.5 = **$5,800**. $800 de
acreditamiento improcedente por liquidación; con 40 al mes, $32,000 mensuales,
con nuestro papel como respaldo. La pantalla de Peajes
(`app/dashboard/agentes/peajes/vista.tsx:304`) dice lo contrario en la misma
ronda: dos superficies del mismo producto afirman cosas opuestas sobre la misma
cifra.

Causa raíz probable: `acreditable.ts` no se revisó al cerrar H4 en la ficha.

---

### [ALTO · REINCIDENTE 2ª ronda] El estímulo del 50% se acredita sobre casetas pagadas en EFECTIVO, y el PDF no menciona la fr. III

`src/lib/likida/cuadre/engine.ts:1008` ·
`src/lib/likida/liquidacion/acreditable.ts:64-67`
· ficha: `normas/rmf-2026-9.1.8.yaml` (**verificado_fuente_primaria**)

> Fr. III: «**Efectuar los pagos de autopistas mediante la tarjeta de
> identificación automática vehicular o de cualquier otro sistema electrónico de
> pago** con que cuente la autopista y conservar los estados de cuenta…»
> `consecuencias_operativas` de la ficha: «*La fr. III mata el efectivo: una
> caseta pagada en ventanilla con billetes NO genera estímulo aunque después se
> facture.*»

```ts
// engine.ts:1008
if (g.concepto === 'caseta' && (g.subTotal ?? 0) > 0) peajeAcreditable += (g.subTotal as number) * peajeFactor;
```

No mira `g.formaPago`. Veintisiete líneas más abajo el estímulo hermano sí lo
exige: `const pagoElectronico = !!g.formaPago && g.formaPago !== '01';`
(`engine.ts:1035`). Escenario: 8 casetas de $1,000 pagadas en ventanilla,
autofacturadas después en el portal (que es justo lo que hace el agente),
`forma_pago = '01'`, subtotal $862.07 c/u → el motor suma 8 × $862.07 × 0.5 =
**$3,448.28** y el PDF los imprime citando el artículo. Por la fr. III el
estímulo es **$0.00**. `CONDICIONES_ESTIMULO_PEAJE` (`acreditable.ts:64-67`)
sigue enumerando **sólo las cuatro condiciones de la LIF** y no nombra las
fracciones I, II ni III.

Causa raíz probable: las fracciones de la 9.1.8 se cablearon en la pantalla del
agente Peajes y nunca en el cálculo ni en el papel.

---

### [ALTO · REINCIDENTE 2ª ronda] El panel del contador acredita el IVA de CFDI timbrados a un TERCERO — el motor no

`src/lib/likida/fiscal.ts:559-574` (`ivaSostenible`) · `src/lib/likida/fiscal.ts:777`
(la cadena `COLUMNAS`) · contra `src/lib/likida/cuadre/engine.ts:108` y `:965`
· ficha: `normas/liva-5.yaml` (**verificado_fuente_primaria**)

> LIVA 5o., fr. I: «Que el IVA corresponda a bienes, servicios o al uso o goce
> temporal de bienes, **estrictamente indispensables**… se consideran
> estrictamente indispensables las erogaciones efectuadas por el contribuyente
> **que sean deducibles para los fines del impuesto sobre la renta**…»
> Fr. II: «Que el impuesto al valor agregado **haya sido trasladado expresamente
> al contribuyente** y que conste por separado en los comprobantes fiscales…»

`ivaSostenible` comprueba CFDI, cancelado, pendiente, no_encontrado, EFOS,
efectivo sobre tope y combustible en efectivo — y **nada del receptor**. No
puede: `COLUMNAS` (`:777`) sigue sin `rfc_receptor`, aunque la columna existe y
`repo.ts:666` sí la lee para el motor.

Escenario: CFDI de diésel de $11,600 (subtotal $10,000, IVA $1,600) timbrado al
RFC de otra empresa. La liquidación dice «No deducible $11,600.00» e «IVA
acreditable $0.00»; la pantalla del contador
(`app/dashboard/contador/inicio-contador.tsx:344-346`) suma esos **$1,600 a "IVA
acreditable documentado"** con la nota «LIVA art. 5 — solo el IVA desglosado en
CFDI que lo sostiene». Ese CFDI no lo sostiene por ninguna de las dos
fracciones. El mismo producto entrega dos cifras para el mismo papel, y la que
se teclea en la DIOT es la inflada.

Causa raíz probable: `resumirFiscal` heredó la lista de columnas de las
«pérdidas», que no necesita receptor, y nadie la revisó al volverla la fuente del
IVA acreditable del periodo.

---

### [ALTO · REINCIDENTE 2ª ronda] Un viático timbrado a un RFC desconocido sale deducible y con su IVA acreditado, en verde

`src/lib/likida/cuadre/engine.ts:511-514` · `:108-109` · `:965` · `:1135`
· fichas: `normas/rlisr-57.yaml` y `normas/liva-5.yaml` (ambas
**verificado_fuente_primaria**)

> RLISR 57: «…Si benefician a personas que le prestan servicios personales
> subordinados, los comprobantes fiscales **podrán** ser expedidos a nombre de
> dichas personas, en cuyo caso… se tendrá por cumplido el requisito de respaldar
> dichos gastos con el comprobante fiscal **a nombre de aquél por cuenta de quién
> se efectuó el gasto**.»

La excepción está condicionada a que el receptor sea **esa persona**. El motor
emite `viatico_rfc_operador` justo cuando **no puede saberlo** (`else if
(esViatico && !rfcOperador)`), y ese tipo está en `REVISAR` (`:1135`) pero **no**
en `NO_DEDUCIBLE_ISR` (`:108`), ni en `POR_CONFIRMAR` (`:109`), ni en
`SIN_ACREDITAMIENTO` (`:965`).

Escenario: hospedaje de $2,320 (subtotal $2,000, IVA $320), XML verificado,
`rfcReceptor = PEGJ850101AB1` — un RFC que nadie confirmó que sea del operador.
`cubetaDe` lo manda a `deducible`: el PDF imprime «**Deducible para ISR
$2,320.00**» en verde y «**IVA acreditable (LIVA art. 5) $320.00**» en verde. Al
lado, el hermano `rfc_receptor_no_verificable` —que significa lo mismo— sí está
en `SIN_ACREDITAMIENTO` y no da ni un peso. Dos estados con el mismo significado
y veredictos opuestos; el permisivo depende de una etiqueta de concepto que pone
el OCR sobre una foto.

Causa raíz probable: el caso «sin dato» se movió al lado permisivo en lugar del
tercer estado que el resto del motor ya usa.

---

### [ALTO · REINCIDENTE 2ª ronda] Al combustible en efectivo dentro del 15% se le niega el IVA acreditable, y la norma sólo excluye el IEPS

`src/lib/likida/cuadre/engine.ts:965` y `:983` · `src/lib/likida/fiscal.ts:566-568`
· fichas: `normas/rfa-2026-2.9.yaml` y `normas/liva-5.yaml` (ambas
**verificado_fuente_primaria**)

> `rfa-2026-2.9.yaml`, `limite_importante`: «Conserva la **DEDUCCIÓN** para ISR.
> **NO habilita el acreditamiento del IEPS**: son dos beneficios distintos y el
> efectivo solo salva uno.»
> LIVA 5o., fr. I: «…se consideran estrictamente indispensables las erogaciones…
> **que sean deducibles para los fines del impuesto sobre la renta**…»

La regla excluye **el IEPS**. La LIVA no condiciona el acreditamiento del IVA al
medio de pago: su requisito es que la erogación sea deducible para ISR, y dentro
del 15% **lo es** por la propia RFA 2.9. Sin embargo `SIN_ACREDITAMIENTO`
(`:965`) incluye `combustible_efectivo_dentro15` y `efectivo_sobre_15`, y esa
lista gobierna también `ivaAcreditable` (`:983`). El panel replica la exclusión
en `fiscal.ts:566-568` («AUDITORÍA 14, ALTO») con el mismo argumento de IEPS.

Escenario: flota elegible, diésel de $11,600 (subtotal $10,000, IVA $1,600)
pagado en efectivo, dentro del 15%, XML verificado. El PDF imprime «Deducible
para ISR $11,600.00» y **cero** de IVA acreditable por ese CFDI; lo correcto son
$1,600. Con $2M de diésel al año, el 15% son $300,000 → **~$41,379 de IVA que el
producto le borra al cliente cada ejercicio**. Nótese que la maquinaria para
prorratear ya existe (`proporcionDeducible`, `engine.ts:363`) y el `continue` de
`:983` la salta entera.

Causa raíz probable: una sola lista gobierna tres acreditamientos (IVA, IEPS por
litros, peaje) que no comparten requisitos.

---

### [ALTO · NUEVO] La mitad no arreglada de FI-C1: el cliente no puede declarar el régimen 624, y su formulario sobrescribe la columna que el portal teclea en cada CFDI

`src/lib/saas/fiscal.ts:20-26` (catálogo `REGIMENES`) y `:99` (la validación que
lo hace obligatorio) · escritura en `:107-114` sobre `tenant.regimen_fiscal` ·
lectura en `src/lib/likida/facturacion/flota_fiscal.ts:2` y `:83` ·
uso final en `src/lib/likida/facturacion/adaptadores/capufe.ts:851`
· ficha: `normas/rfa-2026-2.9.yaml` (**verificado_fuente_primaria**)

> RFA 2026, regla 2.9: «Los contribuyentes… **que tributen conforme al Título II,
> Capítulo VII** o Título IV, Capítulo II, Sección I de la Ley del ISR…»
> (Título II, Cap. VII = **624, Coordinados**; es la ficha que cerró FI-C1.)

El arreglo de `86fb450` puso `REGIMENES_ELEGIBLES_RFA_2_9 = ['624','612']`
(`administracion.ts:83`) y agregó el `<option value="624">` en `/admin/flotas`.
Pero el **otro** formulario que escribe la MISMA columna —el del cliente, en
`/dashboard/suscripcion` (`page.tsx:355`)— sigue con el catálogo viejo:

```ts
// src/lib/saas/fiscal.ts:20-26
export const REGIMENES = [
  { clave: '601', … }, { clave: '603', … }, { clave: '612', … },
  { clave: '621', … }, { clave: '626', … },
] as const;   // 624 (Coordinados) NO está
```

y `guardarDatosFiscales` lo hace obligatorio: `if (!REGIMENES.some((r) => r.clave
=== d.regimenFiscal)) throw new DatoInvalido('Elige un régimen fiscal de la
lista.')` (`:99`). Un Coordinado **no puede guardar su propio régimen**.

Escenario: «Autotransportes del Bajío, S.C. de R.L.», Coordinado, dada de alta
por Javier con 624 (`tenant.regimen_fiscal = '624'`). El contralor entra a
Suscripción a capturar sus datos fiscales, el `<select>` no ofrece 624 y elige
601. `guardarDatosFiscales` escribe `regimen_fiscal = '601'`. A partir de ahí,
`getFiscalDeFlota` (`flota_fiscal.ts:83`) entrega `regimenFiscal: '601'`, y el
adaptador lo teclea como **RegimenFiscalReceptor** en el portal
(`capufe.ts:851`): cada CFDI de caseta que el agente emite para esa flota sale
con un régimen que no es el suyo. El único guardia es de forma —«3 dígitos»
(`capufe.ts:1245`)—, así que nada lo detiene. Con 8 casetas por viaje y 40 viajes
al mes son ~320 CFDI mensuales con el receptor mal declarado; el mismo dato
alimenta el CFDI que Likida le emite por su suscripción.

Consecuencia: el CFDI 4.0 valida el régimen del receptor contra el padrón del
SAT — el timbrado se rechaza, o si el portal lo acepta, el comprobante nace
defectuoso y no ampara la deducción del peaje ni su estímulo. Y en la dirección
contraria: el `tenant.regimen_fiscal` que Javier ve en `/admin/flotas` deja de
ser el que la flota declaró, sin aviso.

Causa raíz probable: FI-C1 se cerró sobre el catálogo de `/admin` y sobre el
derivador de elegibilidad; el segundo catálogo de regímenes del repo —el que el
cliente sí toca— no entró en el radio del arreglo.

---

### [MEDIO · REINCIDENTE] La factura que emite la flota sigue sin admitir la retención del 4% de IVA de autotransporte

`supabase/migrations/0049_cobranza_factura_emitida_pago.sql:53-55` ·
`src/lib/likida/facturacion_escritura.ts:107-114`
· **ficha: SIGUE SIN EXISTIR en `normas/`** (LIVA 1-A fr. II inciso c) / RLIVA 3
fr. II) — y esa ausencia es parte del hallazgo.

El constraint sigue igual: `check (abs(total - (subtotal + iva)) <= 0.01)`. No
hay campo de retenido. Escenario: la flota factura $10,000 + IVA $1,600, el
cliente persona moral retiene el 4% ($400) y paga **$11,200**; `evaluarAbono`
deja saldo $400, la factura nunca pasa a `pagada` y la cartera la pinta vencida.
La salida práctica es teclear IVA = 1,200, y entonces el IVA trasladado del libro
y del export queda mal para siempre.

Causa raíz probable: la 0049 modeló la factura como subtotal+IVA sin nodo de
retenciones, que en autotransporte de carga es el caso normal, no el raro.

---

### [MEDIO · NUEVO] El CSV se declara «el documento de la fracción II» sin la ruta y con origen/destino en blanco

`src/lib/likida/intake/desglose_peaje.ts:922-927` (leyendas), `:953-969`
(`filasBitacora`), `:1041-1057` (`bitacoraACsv`) ·
`src/app/api/export/bitacora-peaje/route.ts:56-62`
· ficha: `normas/rmf-2026-9.1.8.yaml` (**verificado_fuente_primaria**)

> Fr. II: «Llevar una bitácora de viaje **de origen y destino, así como la ruta
> de que se trate**, que coincida con el estado de cuenta de la tarjeta de
> identificación automática vehicular o de un sistema electrónico de pago.»

La primera leyenda del archivo afirma sin condición: «Bitácora de cruces
conciliados… **el documento de la fracción II de la regla 9.1.8 de la RMF 2026**:
viaje (origen y destino), caseta y monto…». Pero `filasBitacora` deja `origen` y
`destino` en `''` cuando el viaje no los trae (`:962-964`, comentado a
propósito), **no existe columna de ruta** en `FilaBitacora` (`:929-937`) ni en el
CSV (`:1049-1057`), y el archivo no incluye una sola advertencia cuando esos
campos salen vacíos. La pantalla sí lo dice («origen/destino salen del viaje y
quedan vacíos si no se capturaron», `agentes/peajes/vista.tsx:302`); el archivo
que se archiva, no.

Escenario con cifras: flota que despacha por WhatsApp (los viajes nacen sin
`origen`/`destino`; son columnas opcionales) descarga
`bitacora_rmf_918_likida.csv` con 412 cruces conciliados por $184,300. Las 412
filas traen `origen` y `destino` vacíos y ninguna trae ruta, y el encabezado del
propio archivo declara que ese es el documento de la fr. II. Si el SAT lo
rechaza, cae el requisito operativo del ejercicio entero: **$92,150 de estímulo
(50% del importe sin IVA) sin la bitácora que lo sostiene.**

Consecuencia: el contralor archiva como cumplimiento un documento que no cumple,
y se entera en la revisión. Es el mismo patrón del hallazgo del pie del PDF: la
pantalla dice la verdad completa, el papel afirma de más.

Causa raíz probable: la leyenda se redactó describiendo el caso completo, y el
caso incompleto —que es el normal en el producto de hoy— no la modifica.

---

### [MEDIO · REINCIDENTE] El agente sigue sin poder citar la regla que fija la base del estímulo de peaje

`src/lib/likida/normas/por_diferencia.ts:131-133` · ficha:
`normas/rmf-2026-9.1.8.yaml` (**verificado_fuente_primaria**, en el índice con
`exigibleDesde 2026-01-01`)

`NORMA_POR_CONCEPTO` da para `caseta` únicamente `['lif-2026-art-20-A']`.
Escenario: el contralor pregunta en el chat «¿por qué el peaje acreditable es
$5,000 y no $5,800?»; la única norma que el agente puede citar es la LIF art.
20-A, cuyo texto dice «hasta en un 50 por ciento del **gasto total erogado**» —o
sea, la respuesta que puede fundamentar es la equivocada, y la fracción que
resuelve la duda («sin incluir el IVA») se le borra a media frase.

---

### [BAJO · REINCIDENTE] El bloque «LO QUE ESTE MÓDULO NO HACE» de `fiscal.ts` sigue sin ser cierto

`src/lib/likida/fiscal.ts:1097-1104` vs `src/lib/likida/fiscal.ts:585-595` y `:606-609`

> «1. NO evalúa el tope de $750/día de alimentación (LISR 28-V)… Repetirlo aquí
> con otra implementación produciría dos cifras distintas para el mismo hecho.»

`resumirFiscal` **sí** lo evalúa desde `1eb65c5` —importa
`proporcionAlimentacionPorGasto`, lo aplica por viaje (`:585-595`) y prorratea el
IVA con él (`:606-609`)— y lo hace bien, con el módulo compartido. El único
inventario de límites del módulo fiscal miente al revés.

---

### [BAJO · REINCIDENTE] La ficha del criterio 1/CFF/PI sigue en el índice con el título roto

`src/lib/likida/normas/indice.ts:129` (`titulo: ">"`)

El generador copió el marcador de bloque YAML en lugar del título. `citaDe`/
`norma()` alimentan los mensajes del agente y el corpus de `guardiaFundamento`,
así que la ficha que sostiene la **leyenda de descargo** —la conducta literal con
la que el art. 89, último párrafo, exime a Likida— aparece sin nombre legible.

---

## Lo que revisé y está bien

- **La ficha que cambió esta ronda (`e099f15`) contra el código que la usa.**
  `normas/lif-2026-20-A.yaml:22-40` incorpora la definición legal de transporte
  privado («aquel que realizan las personas contribuyentes con vehículos de su
  propiedad o… en arrendamiento… para transportar bienes propios o su personal…
  **sin que por ello se genere un cobro**», **verificado_fuente_primaria**, PDF de
  diputados). Verifiqué que el código **no** cuelga el estímulo de IEPS de ninguna
  declaración de dedicación exclusiva: `engine.ts:1009-1060` sólo exige clave SAT
  de diésel, pago electrónico y litros cotejados — que es exactamente lo que la
  fr. IV pide («vehículos que se destinen exclusivamente…», el «exclusivamente»
  califica al vehículo). No hay sobre-restricción. Y verifiqué que **ningún
  archivo del producto promete el 50% de peaje a flota privada**: grepeé `peaje`
  y `50%` en `src/app/page.tsx`, `terminos`, `comercial.ts` y los prompts de
  agentes; los únicos lugares que lo nombran (`acreditable.ts:115`,
  `inicio-contador.tsx:281`, `chat-tools.ts:63`) lo rotulan «sujeto a
  elegibilidad» y enumeran la dedicación exclusiva como condición de la flota.
  El único hueco de la fr. V queda descrito en los hallazgos de arriba (el motor
  no la verifica), y la ficha ya lo declara como H6.
- **FI-C1 sigue cerrado y sin recaída.** `administracion.ts:83`
  (`REGIMENES_ELEGIBLES_RFA_2_9 = ['624','612']`), derivación en `:138`, `<option
  value="624">Coordinados` en `app/admin/flotas/page.tsx:384`. Ancla verde:
  `npx vitest run src/lib/likida/rfa29_regimenes.test.ts` → **5/5**, incluido el
  aserto `['612','624']` contra el texto de `normas/rfa-2026-2.9.yaml`
  (**v.f.p.**). El daño residual está en el otro catálogo (ALTO nuevo, arriba).
- **El estímulo de IEPS de diésel NO se calcula con el IEPS trasladado.**
  `engine.ts:976-979` deja `iepsAcreditable = 0` como `const` y con su razón
  escrita; `acreditable.ts:94-101` entrega LITROS con `NOTA_LITROS_DIESEL`;
  `inicio-contador.tsx:298-301` idem. Coincide literal con
  `lif-2026-20-A.yaml:106` (**v.f.p.**): «cuota IEPS vigente al momento de la
  compra × LITROS. **No es el IEPS trasladado en el CFDI**», y con
  `criterio-1-LIF-PI.yaml` (cuota semanal disminuida, `evidencia_corroborante`).
- **El medio de pago del estímulo de diésel sí se exige y la facilidad del 15% no
  lo salva** (`engine.ts:1035`, y el comentario `:1029-1033` cita el 4º párrafo
  de la LIF 20-A-IV). Coherente con `rfa-2026-2.9.yaml`, `limite_importante`
  (**v.f.p.**).
- **Los litros del OCR se cotejan** contra `monto ÷ precioRef` con tolerancia
  0.5×–2× (`engine.ts:1045-1056`) y emiten `diesel_desviacion` en vez de
  acreditar.
- **El denominador del 15% es combustible contra combustible, del EJERCICIO.**
  `periodo/combustible.ts:14-18` y `supabase/migrations/0112_agregados_rpc.sql:149-157`
  (`sumar_combustible_ejercicio`): rango `make_date(p_anio,1,1)..(p_anio,12,31)`,
  `monto > 0`, y el denominador incluye **gasolina** vía `hidrocarburos.claves`
  (`config.ts:122`, magna y premium), no sólo diésel. Es la lectura correcta de
  «el total de los pagos efectuados por consumo de combustible para realizar su
  actividad» (`rfa-2026-2.9.yaml`, **v.f.p.**). El ejercicio se ancla en la fecha
  del VIAJE, no en la del proceso (`desde_db.ts:68-71`) — un plazo por ejercicio
  tratado como ejercicio.
- **Tope de alimentación $750/día** (`cuadre/tope_alimentacion.ts`, `engine.ts:907-948`)
  y **proporcionalidad del IVA de LIVA 5-I** desde un módulo compartido por los
  dos motores (`engine.ts:1004`, `fiscal.ts:591`). Contra `normas/lisr-28-V.yaml`
  y `normas/liva-5.yaml` (ambas **v.f.p.**).
- **El pie del permiso CRE cita bien sus dos artículos.**
  `liquidacion/deducibilidad.ts:64-71` dice «LISR 27-III y RFA 2026 regla 2.9
  exigen que el CFDI de combustible consigne el permiso CRE vigente». Lo comprobé
  palabra por palabra: `lisr-27-III.yaml` 2º párrafo («en el comprobante fiscal
  deberá constar la información del permiso vigente, expedido en los términos de
  la Ley de Hidrocarburos al proveedor… y que, en su caso, dicho permiso no se
  encuentre suspendido») y `rfa-2026-2.9.yaml`, última oración, dicen
  exactamente eso. Es una leyenda que cita un artículo **que sí dice eso**.
- **Las leyendas son la eximente literal.** `cuadre/leyendas.ts:36-58`: «puede
  diferir de los criterios que dé a conocer el SAT», por escrito y en el papel
  que se archiva, que es la conducta que exige `normas/cff-89-90.yaml` (**v.f.p.**),
  art. 89 último párrafo.
- **EFOS nunca se afirma sin certeza** (`intake/sat.ts:80-86` → `cfdi_efos_indeterminado`),
  contra `normas/cff-69-B.yaml` (**v.f.p.**).
- **El parser del XML no inventa impuestos.** `intake/cfdi_xml.ts:266-278`: suma
  `Traslado[@Impuesto='002']` como IVA y `'003'` como IEPS, del nodo
  `Impuestos/Traslados` del comprobante; **ignora `Retenciones`** y no recomputa
  ninguna tasa —16% u 8% fronterizo salen tal cual del papel, y `Exento` no suma
  porque no trae `Importe`—. Es el requisito de la fr. II de LIVA 5 («conste por
  separado en los comprobantes fiscales»). Era el punto que el pase 3 no alcanzó
  a revisar.
- **Un consolidado no fabrica IVA ni base de peaje.** `intake/consolidado.ts:194-198`
  escribe **sólo** `cfdi_uuid` + `cfdi_orden`, nunca `sub_total`, `iva_traslado`
  ni `xml_verificado`, así que un CFDI mensual de TAG no reparte su IVA completo
  sobre cada caseta. (El problema de ese sellado es otro, y es el CRÍTICO.)
- **Una liquidación no se cuenta dos veces.** `guardar_liquidacion_tx` con
  `unique(viaje_id)` (`repo.ts:700-727`) y el RPC `acreditables_liquidacion_tenant`
  (`0112:361-380`) sumando columnas ya calculadas: re-cuadrar un viaje no duplica
  IVA ni peaje en el panel del contador. Refuté esta hipótesis, no es un hallazgo.
- **El rótulo del periodo fiscal corresponde a la consulta.**
  `inicio-contador.tsx:67-76` calcula `diasEjercicio` desde `periodoFiscal.desde`
  y se lo pasa a `getAcreditables`, que lo convierte en `p_desde`
  (`analytics.ts:42-47`, `637-641`). «— ejercicio 2026» filtra por ejercicio.
- **Carta Porte** (`carta_porte.ts:98-170`) reproduce el árbol de 2.7.7.2.1 /
  2.7.7.2.8 de `normas/rmf-2026-2.7.7.yaml` (**v.f.p.**), `radioFederalKm <= 30`
  es la lectura correcta de «radio de distancia de 30 kilómetros», con huecos
  responde `falta_declarar`, y el supuesto de carga general está declarado en el
  código (`carta_porte_datos.ts:95`) y repetido en la pantalla. Revisé además
  `validarComplemento:373-435` (traslado con SubTotal/Total en 0, moneda XXX,
  UsoCFDI S01, receptor = emisor; licencia sólo en TipoFigura 01) y no encontré
  contradicción con la ficha.
- **Los parámetros de LEY no son editables por el cliente**
  (`ajustes_operativos.ts:20-30`): `peajeFactor`, claves del SAT e
  `hidrocarburos.*` no tienen formulario.

### Fichas que sostienen veredictos y NO están verificadas en fuente primaria

Sin cambio respecto del pase 3, y es la razón estructural por la que este rubro
no puede acercarse al 8 aunque se cierren los hallazgos: `lisr-27-III.yaml`
(`evidencia_corroborante`, Justia), `cff-29-A.yaml` (`texto_vigente: null`),
`rmf-2026-2.7.1.48.yaml`, `criterio-1-LIF-PI.yaml`, `criterio-1-CFF-PI.yaml`,
`rmf-2026-2.7.1.21.yaml`, `politica-portales-plazos.yaml` (`sin_verificar`, nivel
6 a propósito). Siguen sin ficha: **LIVA 1-A fr. II inciso c) / RLIVA 3 fr. II**
(la retención del 4%) y el **4º párrafo del LIF 20-A-IV** (el medio de pago del
estímulo de diésel, elidido con «…» en la ficha aunque `engine.ts:1029-1035` lo
exige). Los dos latidos de vigilancia (`normas/.latido-vigilancia`,
`.latido-cuota-diesel`) siguen bloqueados por egress: ninguna ficha se
re-verificó esta ronda salvo la LIF 20-A.

---

## Lo que NO alcancé a revisar

- **`facturacion/adaptadores/` completo** (capufe 1,300 líneas, playwright,
  registro): seguí `regimenFiscal` de punta a punta para el ALTO nuevo, pero no
  audité qué otros campos fiscales se teclean ni si el CFDI resultante se coteja
  contra lo pedido.
- **`facturacion/permiso_cre.ts` + `permisos_cre.json`**: no comprobé si el
  padrón embebido se usa para AFIRMAR algo (el motor sólo emite
  `permiso_cre_no_verificable`, que es lo correcto).
- **`intake/desglose_peaje.ts` completo** (1,059 líneas): revisé la bitácora de
  la fr. II, no el cruce `cruzarLineasDesglose` contra el estado de cuenta del
  TAG (la otra mitad de esa fracción).
- **`normas/fundamento.ts`** (29 KB): no lo leí completo, así que no puedo
  afirmar qué más deja o no deja citar al agente más allá de `por_diferencia.ts`.
- **El CFDI que Likida emite por su suscripción** (`lib/saas/fiscal.ts` más allá
  del catálogo, y el timbrado con el PAC): sólo audité el catálogo de regímenes.
- **`cfdi_pendiente` / `tipoComprobante` en el panel**: `ivaSostenible` no mira
  `tipo_comprobante` aunque la columna llega a `GastoFiscal` (`fiscal.ts:899`).
  No pude construir el escenario con cifras —depende de si el intake acepta un
  CFDI tipo `E` (egreso) como gasto— así que **no lo reporto**; queda anotado
  como la primera piedra del próximo pase.
