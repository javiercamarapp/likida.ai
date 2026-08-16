# Cumplimiento fiscal — auditoría 13

**Nota: 3.5/10** (antes 3.5). Razón del movimiento: mirada más profunda / deuda que cobró factura.
**vs Handle:** 3/10. Handle maneja flujos financieros B2B con validación cruzada estricta de obligaciones fiscales y gravámenes (Lien waivers, retenciones y complementos); Likida aún calcula beneficios fiscales sobre bases brutas infladas y retiene IVA a personas físicas sin sustento en ley, exponiendo a la flota a contingencias con el SAT.

El riesgo mayor del rubro hoy es el cálculo indebido del estímulo de casetas (LIF art. 16/20-A) aplicando el 50% sobre el total con IVA en lugar del gasto neto devengado, generando deducciones y acreditamientos improcedentes con recargos y multas directas para el contribuyente.

---

## Hallazgos

### [ALTO] Acreditamiento de estímulo de casetas aplica el 50% sobre el total bruto con IVA incluido, generando doble beneficio fiscal indebido
`src/lib/likida/liquidacion/deducibilidad.ts:182`
- **Escenario:** Un viaje registra gastos de casetas/peaje por $1,160.00 MXN ($1,000.00 subtotal + $160.00 de IVA trasladado al 16%). El sistema toma el `total` del comprobante para calcular el estímulo: `$1,160.00 * 0.50 = $580.00 MXN`. Al mismo tiempo, la flota acredita los $160.00 de IVA conforme a LIVA Art. 4.
- **Consecuencia:** La flota acredita $580 de ISR contra el pago provisional cuando el estímulo legal conforme a la LIF (Art. 16 / 20-A) y norma `normas/LIF_art16_peaje.yaml` debe ser el 50% del gasto erogado sin incluir impuestos trasladados ($500.00 MXN). El SAT determinará un crédito fiscal por estímulo improcedente de $80.00 por comprobante más recargos y actualización por duplicidad de beneficio fiscal.
- **Causa probable:** `calcularEstimuloPeaje` recibe el objeto `gasto.monto` (que almacena el total con IVA) en vez de segregar `gasto.subtotal` previo a la aplicación del factor 0.50. (REINCIDENTE).

---

### [ALTO] Retención de IVA del 4% aplicada a ciegas sin verificar la personalidad jurídica del receptor (PF vs. PM)
`src/lib/likida/facturacion/impuestos.ts:94`
- **Escenario:** Una persona moral transportista emite una factura de flete a un cliente Persona Física con actividad empresarial por un subtotal de $10,000.00 MXN. El motor de impuestos aplica automáticamente una retención de IVA del 4% ($400.00 MXN), liquidando $11,200.00 MXN al permisionario.
- **Consecuencia:** Infracción directa al Art. 1-A fracción II inciso c) de la LIVA y RIVA Art. 3, que estipulan que la retención del 4% por servicios de autotransporte federal de carga procede **exclusivamente cuando el prestatario/receptor es Persona Moral**. Al retener indebidamente a una persona física, el CFDI queda con esquema de retenciones inválido y el transportista sufre un flujo de efectivo menor sin fundamento tributario.
- **Causa probable:** La función `calcularRetencionesFlete` evalúa únicamente el tipo de concepto (`transporte_carga`) e ignora la validación del RFC del receptor (`rfcReceptor.length === 12` para Persona Moral vs `13` para Persona Física). (REINCIDENTE).

---

### [MEDIO] Facilidad de comprobación del 8% (RFA) deduce gasto sin registrar la provisión de retención provisional obligatoria del 16% de ISR
`src/lib/likida/liquidacion/deducibilidad.ts:245`
- **Escenario:** En la liquidación mensual de un permisionario del régimen simplificado/autotransporte se aplica la facilidad de comprobación de gastos sin comprobante fiscal hasta por el 8% de los ingresos propios ($40,000.00 MXN deducidos vía RFA regla 2.1). El motor marca el importe como deducible al 100% en el resumen contable, pero no genera la partida de pasivo ni el aviso de retención de ISR del 16% ($6,400.00 MXN).
- **Consecuencia:** El contribuyente deduce el gasto en su conciliación mensual sin haber enterado la retención provisional del 16% establecida en la Resolución de Facilidades Administrativas (RFA). Al omitir el entero a más tardar el día 17 del mes siguiente, el gasto pierde la deducibilidad total ante auditoría del SAT.
- **Causa probable:** La lógica en `aplicarFacilidadRFA8Porciento` computa el beneficio como un monto exento neto sin alimentar la cuenta de retenciones por enterar. (REINCIDENTE).

---

### [BAJO] Leyenda fiscal en PDF de liquidación cita artículo abrogado para estímulo de diésel
`src/lib/likida/cuadre/leyendas.ts:58`
- **Escenario:** El PDF de liquidación imprime al calce: *"Estímulo fiscal aplicado de conformidad con el Artículo 16, Apartado A, Fracción I de la Ley de Ingresos de la Federación para el ejercicio 2018 y subsecuentes"*.
- **Consecuencia:** Desconfianza técnica inmediata por parte del contralor de la flota durante la revisión contable. El fundamento legal aplicable debe referenciar la LIF vigente del ejercicio correspondiente (LIF Art. 16 Fracción IV / reglas misceláneas vigentes).
- **Causa probable:** Cadena fija de texto (*hardcoded*) en el catálogo de leyendas no parametrizada por el año del ejercicio del comprobante. (REINCIDENTE).

---

## Lo que revisé y está bien

1. **Validación de UUID y estructura de CFDI 4.0 (`src/lib/likida/intake/cfdi.ts:42-88`):**
   - El parser valida correctamente la presencia del nodo `cfdi:Comprobante`, la versión `4.0`, la existencia del Timbre Fiscal Digital (`tfd:TimbreFiscalDigital`), y el formato regex estándar del UUID v4.

2. **Cálculo de IVA trasladado al 16% en conceptos gravados (`src/lib/likida/facturacion/impuestos.ts:32-55`):**
   - Los conceptos de flete, maniobras y seguro aplican la tasa general del 0.160000 conforme al Art. 1 de la LIVA con redondeo aritmético a 2 decimales según el Anexo 20.

3. **Separación de conceptos no deducibles por falta de CFDI (`src/lib/likida/liquidacion/deducibilidad.ts:112-140`):**
   - Gastos registrados por WhatsApp que carecen de XML o UUID asociado se clasifican correctamente bajo la categoría de `NO_DEDUCIBLE` para efectos de la determinación de utilidad contable del viaje.

---

## Lo que NO alcancé a revisar

1. **Validación de listas negras SAT (Art. 69-B del CFF) en `src/lib/likida/intake/sat.ts`:**
   - No se verificó si existe consulta en tiempo real o por lote contra el listado definitivo de EFOS del DOF/SAT al cargar gastos de permisionarios o proveedores de combustible.
2. **Complemento Carta Porte 3.1 (`src/lib/likida/facturacion/carta_porte.ts`):**
   - No se auditó la matriz de claves de productos y servicios (Catálogo SAT `c_ClaveProdServCP`) ni la validación de pesos y dimensiones de acuerdo con la NOM-012-SCT-2-2017.
3. **Manejo del IEPS acreditable vs IEPS no acreditable en combustibles (`src/lib/likida/liquidacion/combustible.ts`):**
   - Pendiente auditar si el desglose de cuotas fijas de IEPS (Art. 2-A LIEPS) en facturas de diésel se traslada al costo o si se confunde con el IVA acreditable.