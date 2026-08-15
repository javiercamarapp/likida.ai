# Cumplimiento fiscal — auditoría 8

**Nota: 5.0/10** (antes 5.5). Razón del movimiento: mirada más profunda en las reglas de cálculo fiscal (el motor persiste la base bruta de casetas en estímulos y retenciones de IVA sin validar tipo de contribuyente ni aislar el impuesto trasladado acreditable).

El riesgo mayor del rubro hoy es que el sistema imprime y calcula acreditamientos de casetas (LIF art. 16/20-A) e impuestos retenidos con bases aritméticas viciadas, exponiendo a la flota a contingencias en auditorías del SAT y rechazo inmediato del contralor en sala.

---

## Hallazgos

### [ALTO] Acreditamiento de casetas aplica el 50% sobre el total bruto sin descontar IVA acreditable (REINCIDENTE)
`src/lib/likida/liquidacion/deducibilidad.ts:142`
- **Escenario:** Un transportista presenta comprobantes de peaje por un total facturado de $1,160.00 MXN ($1,000.00 subtotal + $160.00 IVA trasladado acreditable). El motor calcula el estímulo de casetas aplicando `total * 0.50`, determinando un acreditamiento de $580.00 MXN. De acuerdo con el estímulo fiscal aplicable (LIF / RMF vigente) y el criterio de no doble beneficio, la base del estímulo debe ser el gasto neto sin duplicar el acreditamiento del IVA ya tomado. Al acreditarse $580.00 y adicionalmente acreditarse $160.00 de IVA, la deducción/acreditamiento excede el monto fiscalmente permitido por $80.00.
- **Consecuencia:** La empresa toma un acreditamiento indebido en su declaración provisional/anual de ISR; el SAT determina diferencias, recargos, actualización y multas por acreditamiento improcedente del estímulo.
- **Causa probable:** Se toma la propiedad `gasto.total` (con IVA incluido) directamente como base de cálculo del 50% en lugar de `gasto.subtotal` o desglosar el IVA acreditable.

---

### [ALTO] Retención de IVA del 4% aplicada de forma fija sin validar personalidad jurídica del receptor (REINCIDENTE)
`src/lib/likida/intake/cfdi.ts:88`
- **Escenario:** Una persona física fletera emite una factura de flete por $10,000.00 MXN a otro transportista persona física. El parser y liquidador asumen de forma cableada una retención de IVA del 4% ($400.00 MXN), liquidando un pago neto de $11,200.00 (con IVA trasladado del 16% menos retención). De acuerdo con el artículo 1-A, fracción II, inciso c) de la Ley del IVA, la retención del 4% es aplicable **únicamente** cuando los servicios de autotransporte son prestados por personas físicas o morales **a personas morales**. Tratándose de receptor persona física, no opera la retención.
- **Consecuencia:** Retención indebida a personas físicas que desvirtúa la liquidación operativa y el CFDI de retenciones/pagos, generando saldos a favor inexistentes o retenciones no enteradas ante el SAT.
- **Causa probable:** Lógica estática que no evalúa el tipo de persona (`RFC.length === 12` vs `13` o régimen fiscal en `cfdi.receptor.RegimenFiscal`) antes de exigir o aplicar la retención del 4%.

---

### [MEDIO] Facilidad de comprobación del 8% omite retención de ISR provisional del 16% (REINCIDENTE)
`src/lib/likida/liquidacion/deducibilidad.ts:215`
- **Escenario:** Se aplica la facilidad comprobatoria del 8% de los ingresos propios para gastos sin comprobante fiscal a un viaje con liquidación de $50,000.00 de gastos de maniobras y viáticos. El sistema deduce $4,000.00 MXN (8%) íntegros como gasto deducible sin registrar ni advertir la retención del 16% de ISR provisional que la Resolución Miscelánea Fiscal (Regla de Facilidades Administrativas para Autotransporte) exige retener y enterar a más tardar en la declaración del periodo.
- **Consecuencia:** El contribuyente deduce el gasto en la liquidación pero omite el entero del 16% de ISR a cuenta de los trabajadores/terceros, resultando en la no deducibilidad total del concepto por falta de entero de retenciones (LISR Art. 27 Fracción V).
- **Causa probable:** La función de cálculo de facilidad solo genera el monto deducible y no emite el pasivo fiscal ni la alerta contable de retención del 16% para el asiento contable.

---

### [BAJO] Leyenda de deducibilidad en viáticos omite fundamentación de RMF o LISR
`src/lib/likida/cuadre/leyendas.ts:45`
- **Escenario:** Al exportar el reporte de liquidación en PDF con viáticos alimenticios exentos / deducibles sin CFDI, el pie de página imprime: *"Gasto deducible bajo facilidades de transporte"* sin citar el artículo 28 fracción V de la LISR, ni la Regla de la Resolución de Facilidades Administrativas vigente.
- **Consecuencia:** En una revisión de gabinete del SAT o ante un auditor externo, la cédula de liquidación carece de sustento técnico-jurídico inmediato, obligando al contralor a justificar manualmente la procedencia de la partida.
- **Causa probable:** Cadena de texto genérica hardcodeada en el archivo de leyendas sin interpolar la norma YAML aplicable.

---

## Lo que revisé y está bien

1. **Validación de tasa de IVA 16% y 0% en combustible y fletes:**
   `src/lib/likida/intake/cfdi.ts:42-65`
   El desglose de impuestos trasladados procesa adecuadamente las claves de impuesto (`002`) y tasa cuota `0.160000`, asignando correctamente la porción acreditable a nivel de concepto.

2. **Cálculo de estímulo de IEPS diesel cuota fija semanal:**
   `src/lib/likida/cuadre/engine.ts:112-135`
   No confunde el IEPS trasladado del CFDI con la cuota de estímulo LIF; toma los litros acreditados de la partida y aplica la cuota de la tabla parametrizada según la fecha del comprobante.

3. **Restricción de deducibilidad de viáticos dentro de la faja de 50 km:**
   `src/lib/likida/liquidacion/deducibilidad.ts:78-95`
   Valida el origen-destino del viaje contra la ubicación del gasto para rechazar viáticos devengados dentro del radio de 50 km del domicilio fiscal o base operativa, conforme al Art. 28 Fracc. V LISR.

---

## Lo que NO alcancé a revisar

1. **Tratamiento del complemento Carta Porte 3.1:** No se verificó la validación cruzada entre los CFDI de ingreso/traslado y las claves de producto/servicio en los nodos de mercancías transportadas.
2. **Criterios de acreditamiento IEPS automotriz en RIF / RESICO:** No se auditó la interacción de los estímulos fiscales cuando el permisionario opera bajo el Régimen Simplificado de Confianza (RESICO).
3. **Manejo de Notas de Crédito y Descuentos posteriores en facturación de combustible:** No se validó el impacto de notas de crédito diferidas sobre el IVA acreditable y el volumen de litros ya liquidado al chofer.