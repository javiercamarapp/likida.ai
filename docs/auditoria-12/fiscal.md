# Cumplimiento fiscal — auditoría 12

**Nota: 3.5/10** (antes 4.0). Razón del movimiento: deuda que cobró factura; confirmación de inconsistencias en la base de cálculo del estímulo carretero LIF y omisión de la retención del 16% de ISR en la facilidad RFA del 8%.

Riesgo mayor del rubro hoy: el PDF de liquidación y los reportes fiscales imprimen importes de estímulo fiscal inflados y aplican deducciones de la RFA sin computar el ISR retenido obligatorio, exponiendo a la flota a créditos fiscales por deducciones indebidas ante una revisión del SAT.

---

## Hallazgos

### [ALTO] Acreditamiento de estímulo de casetas aplica el 50% sobre el total bruto con IVA incluido, generando doble beneficio fiscal indebido
`src/lib/likida/liquidacion/deducibilidad.ts:142`
- **Escenario:** Entra un comprobante de caseta de peaje con Subtotal = $1,000.00 MXN e IVA trasladado (16%) = $160.00 MXN (Total = $1,160.00 MXN). El motor calcula el estímulo LIF Art. 16 Fracc. V aplicando `total * 0.50`, arrojando un acreditamiento de $580.00 MXN, al tiempo que en la cédula de IVA se toma el 100% del IVA acreditable ($160.00 MXN).
- **Consecuencia:** Para el contralor y la flota, aplicar el 50% sobre el valor con IVA incluido cuando ya se acreditó el impuesto indirecto constituye una deducción/estímulo inflado artificialmente por $80.00 MXN por cada $1,000 de peaje, generando una contingencia por acreditamiento indebido de ISR con actualización y recargos según el Art. 21 del CFF.
- **Causa probable:** `calcularEstimuloCaseta` toma `comprobante.total` en lugar de `comprobante.subtotal` (monto erogado neto del impuesto trasladado acreditable). *(REINCIDENTE)*

---

### [ALTO] Retención de IVA del 4% aplicada a ciegas sin verificar la personalidad jurídica del receptor (PF vs. PM)
`src/lib/likida/facturacion/retenciones.ts:58`
- **Escenario:** Entra un viaje facturado a un cliente persona física (`receptor.rfc.length === 13`, ej. `GARM850101XYZ`). La función liquidadora aplica en automático la retención del 4% de IVA sobre el flete bruto ($50,000.00 de flete → $2,000.00 de retención), liquidando al permisionario con un neto descontado.
- **Consecuencia:** Violación directa al Art. 1-A Fracción II inciso c) de la LIVA (la retención de autotransporte aplica exclusivamente cuando el receptor del servicio es Persona Moral). El chofer/permisionario recibe $2,000.00 MXN menos de flujo de efectivo en su liquidación y el CFDI de ingreso emitido a una PF nace viciado con retenciones inexistentes en ley, siendo rechazado en validaciones de proveedores.
- **Causa probable:** Lógica booleana `esAutotransporte === true` dispara `retencionIva = subtotal * 0.04` sin validar si el RFC receptor tiene longitud de 12 posiciones (PM). *(REINCIDENTE)*

---

### [MEDIO] Facilidad de comprobación del 8% (RFA) deduce gasto sin registrar la provisión de retención provisional obligatoria del 16% de ISR
`src/lib/likida/liquidacion/deducibilidad.ts:215`
- **Escenario:** Una flota aplica la facilidad de comprobación de gastos menores de viaje (RFA 2024 Regla 2.1) hasta por el 8% de los ingresos propios sin comprobante fiscal ($8,000.00 MXN sobre $100,000.00 de flete). El sistema clasifica los $8,000.00 como deducibles directos en la liquidación pero no calcula ni desglosa el 16% de retención de ISR ($1,280.00 MXN) que la regla condiciona a retener y enterar en la declaración provisional.
- **Consecuencia:** Al omitir el entero del 16% de ISR retenido a cuenta del impuesto anual, la flota pierde el derecho a deducir el 100% de los gastos no comprobados conforme a la condicionante de la Regla 2.1 de la RFA, convirtiendo $8,000.00 MXN en gasto no deducible en auditoría del SAT.
- **Causa probable:** `aplicarFacilidad8Porciento` únicamente calcula el tope deducible sin disparar la cuenta de pasivo/retención provisional de ISR al 16%. *(REINCIDENTE)*

---

### [BAJO] Leyenda fiscal de viáticos y comprobantes en PDF cita fundamento abrogado de RMF
`src/lib/likida/cuadre/leyendas.ts:84`
- **Escenario:** Al exportar la liquidación en PDF con deducción de viáticos de choferes, el pie de página imprime la leyenda: *"Comprobación de viáticos conforme a la Regla 2.7.1.13 de la RMF 2021"*.
- **Consecuencia:** En la mesa con el contralor o en una revisión de papeles de trabajo, las citas normativas desactualizadas restan credibilidad al producto y obligan al equipo contable a verificar manualmente si los criterios siguen vigentes bajo la RMF 2024/2026.
- **Causa probable:** Cadena de texto fija (*hardcoded*) en el generador de leyendas fiscales sin sincronización contra las fichas de `normas/*.yaml`. *(REINCIDENTE)*

---

## Lo que revisé y está bien

- `src/lib/likida/intake/cfdi.ts:112`: Validación estricta de UUID v4 y estructura de timbre fiscal digital (SAT SAT_TFD) con descarte de comprobantes en estado de cancelación previa.
- `src/lib/likida/cuadre/engine.ts:45`: Cuadre aritmético de Subtotal - Descuentos + Impuestos Trasladados - Impuestos Retenidos = Total con tolerancia menor a $0.01 MXN para evitar errores de redondeo en CFDIs de combustible.
- `src/lib/likida/liquidacion/deducibilidad.ts:78`: Validación de forma de pago en combustible (LISR Art. 27 Fracc. III y Art. 28 Fracc. XX); marca como no deducible cualquier consumo de combustible pagado en efectivo (`01`) sin importar el monto.

---

## Lo que NO alcancé a revisar

- Reglas de acreditamiento del estímulo de IEPS a diésel (LIF Art. 16 Fracc. I) en función de las cuotas publicadas semanalmente en el DOF vs. el IEPS desglosado en CFDI.
- Validación de complementos Carta Porte 3.0/3.1 en la ingesta de facturas emitidas por permisionarios subcontratados.
- Tratamiento fiscal de anticipos y reembolsos a operadores bajo el régimen simplificado de confianza (RESICO) en la liquidación.