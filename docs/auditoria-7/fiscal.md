# Cumplimiento fiscal — auditoría 7

**Nota: 5.5/10** (antes 6.5). Razón del movimiento: mirada más profunda (la nota previa estaba inflada).

El riesgo mayor del rubro hoy es la exposición en liquidaciones impresas y cálculos de cuadre de estímulos fiscales y retenciones con aritmética errónea (estímulo de casetas sobre total con IVA y retención de IVA 4% aplicada ciegamente a personas físicas), lo que expone a la flota a contingencias de auditoría ante el SAT y genera desconfianza inmediata en el contralor.

---

## Hallazgos

### [ALTO] Acreditamiento de casetas aplica el 50% sobre el total bruto sin descontar IVA acreditable (REINCIDENTE)
`src/lib/likida/liquidacion/deducibilidad.ts:142`
- **Escenario:** Un viaje registra $1,000.00 MXN de casetas con CFDI ($862.07 subtotal + $137.93 IVA trasladado 16%). El motor calcula el estímulo de peaje (LIF Art. 16 Fracc. V) como `$1,000.00 * 0.50 = $500.00`, mientras simultáneamente permite acreditar los `$137.93` completos de IVA en el cuadre. El valor correcto del estímulo deducible/acreditable debe ajustarse sobre la base erogada sin duplicar el beneficio del impuesto trasladado acreditable ($431.04 de estímulo y $68.96 de IVA proporcional, o base neta).
- **Consecuencia:** La flota sobrestima su estímulo acreditable contra ISR en un 16%, generando diferencias en pagos provisionales y riesgo de créditos fiscales con recargos y actualización por parte del SAT.
- **Causa probable:** Implementación directa del porcentaje 50% sobre `gasto.monto_total` en lugar de segregar subtotal e IVA según la ficha `normas/lif_peaje.yaml`. (REINCIDENTE)

---

### [ALTO] Retención de IVA del 4% aplicada de forma fija sin validar personalidad jurídica del receptor (REINCIDENTE)
`src/lib/likida/facturacion/impuestos.ts:88`
- **Escenario:** Se emite liquidación o pre-factura para un cliente receptor con RFC de Persona Física (`GARM850101XYZ`, 13 caracteres) por flete de $20,000.00 MXN. El motor aplica automáticamente `retencion_iva = $20,000.00 * 0.04 = $800.00`, arrojando un total a cobrar de `$22,400.00` en lugar de `$23,200.00` ($20,000 + 16% IVA). De acuerdo con el Art. 1-A Fracc. II Inciso c de la LIVA, la retención del 4% solo es obligatoria cuando el prestatario del servicio es Persona Moral.
- **Consecuencia:** La flota retiene indebidamente IVA a clientes personas físicas, subfacturando el cobro efectivo o emitiendo CFDIs con retenciones inválidas que el receptor rechaza en contabilidad.
- **Causa probable:** Falta de discriminación por longitud de RFC (`rfc.length === 12` para PM vs `13` para PF) o régimen fiscal en el cálculo de impuestos retenidos. (REINCIDENTE)

---

### [MEDIO] Facilidad de comprobación del 8% omite retención de ISR provisional del 16% (REINCIDENTE)
`src/lib/likida/liquidacion/deducibilidad.ts:215`
- **Escenario:** Chofer presenta gastos no comprobados bajo Facilidad Administrativa de Autotransporte (RFA Art. 2.1) por $5,000.00 MXN (dentro del tope del 8% de ingresos propios). El motor acredita los $5,000.00 como gasto deducible para la liquidación pero no registra el pasivo ni calcula la retención del 16% de ISR provisional ($800.00 MXN) que la regla obliga a retener y enterar en la declaración provisional de la empresa.
- **Consecuencia:** El chofer recibe un reembolso íntegro y la empresa asume la omisión de retención fiscal, lo que invalida la deducibilidad de la facilidad ante una revisión del SAT.
- **Causa probable:** Se modeló la facilidad como una deducción ciega de viáticos sin incluir la contrapartida de retención fiscal en el esquema de liquidación. (REINCIDENTE)

---

### [BAJO] Leyenda de deducibilidad en viáticos omite fundamentación de RFA y LISR en PDF (REINCIDENTE)
`src/lib/likida/cuadre/leyendas.ts:45`
- **Escenario:** El PDF de liquidación imprime una leyenda genérica de viáticos deducibles ("Gastos sujetos a comprobación fiscal") sin citar el Art. 28 Fracción V de la LISR ni la Regla de Facilidades Administrativas aplicable al ejercicio fiscal 2026.
- **Consecuencia:** El contralor y los auditores externos de la flota no cuentan con la referencia normativa inmediata en la carátula de soporte del viaje, obligando a revisiones manuales de papeles de trabajo.
- **Causa probable:** Texto hardcodeado en `leyendas.ts` sin mapeo dinámico a las fichas de `normas/*.yaml`. (REINCIDENTE)

---

## Lo que revisé y está bien

1. **Tasa general de IVA (16%) en servicios de flete:**
   - `src/lib/likida/facturacion/impuestos.ts:34`: Aplica correctamente el 0.16 conforme al Art. 1 de la LIVA sin desvíos de redondeo en subtotal acumulado.
2. **Validación de estructura de UUID de CFDI en intake:**
   - `src/lib/likida/intake/cfdi.ts:62`: Expresión regular cumple con el estándar RFC 4122 (8-4-4-4-12 hex) y parseo de timbrado del SAT.
3. **Tope de deducibilidad de consumo de combustible con tarjeta/monedero:**
   - `src/lib/likida/liquidacion/deducibilidad.ts:78`: Exige forma de pago electrónica (monedero autorizado, tarjeta o transferencia) para deducibilidad del 100% de combustible conforme al Art. 27 Fracc. III LISR.

---

## Lo que NO alcancé a revisar

1. **Manejo del estímulo IEPS diésel (LIF Art. 16 Fracc. IV vs Art. 20-A):** No se verificó la integración de cuotas semanales publicadas en el DOF para el cálculo de acreditamiento de IEPS contra pagos provisionales de ISR.
2. **Complemento Carta Porte 3.1 / 3.0:** Reglas de validación de catálogos SAT (`c_ClaveProdSTCC`, `c_TipoPermiso`, claves de autotransporte) en `src/lib/likida/facturacion/cartaporte.ts`.
3. **Tratamiento fiscal de casetas no facturadas (telepeaje / IAVE sin CFDI emitido a fin de mes):** No se auditó la ventana de conciliación mensual de comprobantes de peaje electrónico.