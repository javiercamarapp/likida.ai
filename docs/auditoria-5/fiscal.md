# Cumplimiento fiscal — auditoría 5

**Nota: 7.0/10** (antes 7.5). Razón del movimiento: mirada más profunda en las reglas de cálculo de retenciones del CFDI 4.0 de fletes y la mecánica del estímulo de peajes frente al RFA 2026; la nota previa asumía que declarar la discrepancia era suficiente, pero el motor sigue exponiendo inconsistencias normativas directas al contralor.

El mayor riesgo hoy es la determinación de la retención del 4% de IVA en fletes frente a receptores personas físicas vs morales y el tratamiento de gastos no comprobados (8% RFA) sin el cálculo de la retención del ISR aplicable.

---

## Hallazgos

### [ALTO] Retención de IVA del 4% aplicada de forma fija sin validar el tipo de persona del receptor (Art. 1-A fracc. II inc. c LIVA)
`src/lib/likida/facturacion/impuestos.ts:42` (y referencia en `src/lib/likida/intake/cfdi.ts:118`)
Escenario: Una persona moral transportista emite una factura de flete por $10,000 MXN a un cliente persona física (RFC con 13 posiciones, homoclave de 3 letras/dígitos). El motor calcula automáticamente Subtotal $10,000 + IVA 16% ($1,600) - Retención IVA 4% ($400) = Total $11,200 MXN.
Consecuencia: El Art. 1-A fracc. II inc. c de la Ley del IVA y el Art. 3 del Reglamento de la LIVA establecen que la obligación de retener el 4% recae **exclusivamente en Personas Morales** que reciban servicios de autotransporte federal de carga. Si el cliente es Persona Física, no existe retención; emitir el CFDI con retención inválida genera rechazo del cliente, riesgo de no deducibilidad para el cliente y un saldo a favor inexistente para la flota ante el SAT.
Causa probable: Se asumió que todo flete lleva retención del 4% fija sin condicionar `calcularRetencionIVA` a la longitud del RFC receptor (`rfc.length === 12` para PM).

---

### [ALTO] Acreditamiento de casetas (LIF Art. 16 fracc. V / LIF 2026 20-A) calcula el 50% sobre el total bruto incluyendo IVA acreditable
`src/lib/likida/peajes/desglose.ts:68`
Escenario: Se procesa una relación de peajes con subtotal $10,000 MXN + IVA $1,600 MXN = Total $11,600 MXN. El reporte de estímulo fiscal calcula: `estimulo_peaje = 11,600 * 0.50 = $5,800 MXN` y simultáneamente marca los $1,600 de IVA como "100% acreditable".
Consecuencia: Duplicación indebida de beneficio fiscal. El Art. 16 fracc. V de la LIF establece que el 50% del gasto erogado en la red de autopistas concesionadas es acreditable contra el ISR; sin embargo, al acreditar el estímulo sobre la base con IVA y acreditar el IVA completo en el pago definitivo mensual, se viola la simetría del Art. 28 fracc. I de la LISR (el impuesto acreditable o deducido no puede formar parte del estímulo). Un contralor fiscal detecta contingencia por acreditamiento indebido de $800 MXN de IVA duplicado.
Causa probable: Se tomó la propiedad `monto_total` del ticket/CFDI consolidado en lugar de operar sobre `subtotal` o descontar la proporción de IVA acreditado.

---

### [MEDIO] Facilidad del 8% de comprobación (RFA Regla 2.3) clasifica gastos menores sin retención de ISR provisional del 16%
`src/lib/likida/liquidacion/deducibilidad.ts:89`
Escenario: El operador liquida $3,000 MXN de maniobras y parches menores sin CFDI. El sistema marca el concepto como `tipo: 'facilidad_8_porciento'` y `deducible: true` por $3,000 MXN íntegros en el resumen de liquidación.
Consecuencia: La Resolución de Facilidades Administrativas (RFA Sector Autotransporte Regla 2.3) condiciona la deducibilidad de hasta el 8% de los ingresos propios sin CFDI a que el permisionario retenga y entere el **16% de ISR** por cuenta del operador a más tardar el día 17 del mes siguiente. Al mostrar el gasto como 100% deducible sin calcular ni advertir el pasivo de retención ($480 MXN de ISR a enterar al SAT), la flota subestima su flujo fiscal real.
Causa probable: La regla clasifica el gasto como deducible binario sin desglosar el tributo correlativo obligatorio en la ficha de liquidación.

---

### [BAJO] Leyenda de deducibilidad de viáticos cita LISR Art. 28 fracc. V sin especificar el radio de 50 km del domicilio fiscal
`src/lib/likida/cuadre/leyendas.ts:47`
Escenario: En el PDF de liquidación de viaje local (origen: Tlalnepantla, destino: Cuautitlán, distancia: 18 km), se imprime la leyenda legal: *"Deducible conforme a LISR Art. 28 Fracc. V (Alimentación en territorio nacional hasta $750 diarios)"*.
Consecuencia: El Art. 28 fracc. V de la LISR exige expresamente que los viáticos de alimentación solo son deducibles cuando se eroguen fuera de una faja de 50 kilómetros alrededor del domicilio fiscal de la empresa. La impresión de la leyenda en viajes con distancia menor genera inconsistencia documental en una revisión de gabinete del SAT.
Causa probable: La función de selección de leyendas evalúa únicamente el tipo de concepto (`alimentacion`) y el monto diario sin cruzar contra la distancia o kilometraje del viaje.

---

## Lo que revisé y está bien

- **Tope de deducción de viáticos de hospedaje y alimentación nacional/extranjero**: `src/lib/likida/liquidacion/deducibilidad.ts:14-38` valida correctamente los $750 MXN diarios nacionales y $1,500 MXN en el extranjero para alimentación, y $3,850 MXN diarios en el extranjero para hospedaje conforme al Art. 28 fracc. V LISR.
- **Validación de medio de pago en combustible**: `src/lib/likida/liquidacion/deducibilidad.ts:55` rechaza la deducibilidad de combustibles pagados en efectivo (`forma_pago: '01'`) sin importar que el monto sea inferior a $2,000 MXN, cumpliendo estrictamente con el Art. 27 fracc. III segundo párrafo de la LISR.
- **Tasa de retención RESICO Personas Físicas (1.25%)**: `src/lib/likida/intake/sat.ts:142` valida que cuando el proveedor o transportista tributa en el Régimen Simplificado de Confianza (Régimen 626), la retención de ISR sea exactamente del 1.25% conforme al Art. 113-E y 113-J de la LISR.
- **Integración y validación del Complemento Carta Porte 3.1**: `src/lib/likida/intake/cfdi.ts:210-265` verifica la presencia obligatoria de los nodos `Autotransporte`, `IdentificacionVehicular`, `PermisoSCT` y `Seguros` conforme al catálogo del SAT y la regla 2.7.7.1.1 de la RMF.

---

## Lo que NO alcancé a revisar

- **Mecánica del Estímulo Diésel LIF Art. 16 fracc. IV**: No se auditó a profundidad la fórmula de acreditamiento del IEPS cuota contenido en la compra de diésel para maquinaria/vehículos frente a las tablas de cuotas semanales publicadas por SHCP en el DOF.
- **Factor de prorrateo de IVA no acreditable en ingresos mixtos**: No se revisó si la flota cuenta con ingresos gravados a tasa 0% (exportación de flete transfronterizo) y la mecánica de acreditamiento proporcional de IVA de acuerdo con el Art. 5 fracc. V inc. c de la LIVA.
- **Caducidad y sello digital en cancelaciones de CFDI de egreso (Notas de crédito)**: No se verificó el flujo de aceptación de cancelación de facturas con motivo '01' con relación de sustitución en `src/lib/likida/facturacion/cancelaciones.ts`.