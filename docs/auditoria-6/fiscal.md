# Cumplimiento fiscal — auditoría 6

**Nota: 6.5/10** (antes 7.0). Razón del movimiento: mirada más profunda (la nota previa estaba inflada al persistir discrepancias aritméticas en estímulos fiscales de peaje y retenciones de IVA que se plasman directamente en el PDF de liquidación y en el cálculo de impuestos transferibles).

El riesgo mayor del rubro hoy es el acreditamiento indebido del 50% del total con IVA en casetas de peaje (duplicando beneficio fiscal al tomar el IVA como base de crédito ISR) y la omisión de la retención de ISR del 16% en la facilidad comprobatoria del 8% de la RFA.

---

## Hallazgos

### [ALTO] Acreditamiento de casetas calcula el 50% sobre el total bruto con IVA acreditable (REINCIDENTE)
`src/lib/likida/liquidacion/deducibilidad.ts:182-198` y `src/lib/likida/cuadre/engine.ts:245-258`
- **Escenario:** Un viaje registra un gasto de casetas/peajes con CFDI por un total de $1,160.00 MXN ($1,000.00 subtotal + $160.00 IVA trasladado acreditable al 16%).
  - Entrada: `gasto.subtotal = 1000.00`, `gasto.iva = 160.00`, `gasto.total = 1160.00`, concepto: `PEAJE_CASETA`.
  - El motor aplica el estímulo fiscal (LIF Art. 16 fracc. V / LIF 2026 Art. 20-A) calculando: `creditoFiscal = gasto.total * 0.50` = `$580.00 MXN`, y simultáneamente manda `ivaAcreditable = $160.00 MXN`.
  - Salida errónea: El contribuyente acredita $160.00 de IVA contra IVA causado y toma $580.00 de crédito contra ISR, acreditando el 50% de los $160.00 de IVA ($80.00) dos veces (en IVA y en ISR), violando la regla de que el estímulo de casetas se aplica sobre el gasto neto sin incluir el impuesto trasladado acreditable cuando este último se acredita por separado en términos de la LIVA.
- **Consecuencia:** El contralor de la flota deduce e imputa un crédito fiscal improcedente en la declaración provisional/anual de ISR; ante una revisión electrónica del SAT por cruce de DIOT y CFDI de casetas, la autoridad determinará créditos fiscales, actualización y recargos con multas del 55% al 75% por acreditamiento indebido.
- **Causa probable:** Uso de `gasto.total` (monto cobrado en caseta o tag) en lugar de `gasto.subtotal` como base de cálculo para la tasa del 50% del estímulo fiscal de peajes.

---

### [ALTO] Retención de IVA del 4% aplicada de forma fija sin validar régimen ni tipo de persona del cliente (REINCIDENTE)
`src/lib/likida/facturacion/retenciones.ts:44-62` e `src/lib/likida/cuadre/engine.ts:312-329`
- **Escenario:** La flota emite una factura o pre-liquidación por servicio de autotransporte federal de carga a un cliente que es Persona Física con Actividad Empresarial (o RIF/RESICO) por $50,000.00 MXN más $8,000.00 de IVA (16%).
  - Entrada: Servicio de flete a Persona Física (`rfc: "GARM800101XYZ"`, `tipoPersona: "FISICA"`).
  - Salida errónea: El sistema retiene automáticamente el 4% de IVA ($2,000.00 MXN), liquidando un cobro neto de $56,000.00 MXN y emitiendo el CFDI con nodo `RetencionesIVA` tasa `0.04`.
  - Conforme al Art. 1-A fracc. II inc. c) de la Ley del IVA, la retención del 4% aplica **exclusivamente cuando el prestatario/receptor es Persona Moral**. Al aplicarlo a Personas Físicas, la persona física no puede enterar la retención en términos del RIVA y el CFDI queda rechazado o con discrepancia operativa ante el cliente.
- **Consecuencia:** Rechazo de facturas por parte de clientes personas físicas y cobro deficitario de flotas a clientes particulares o personas físicas con actividad comercial.
- **Causa probable:** Se configuró una retención estática del 4% en el cálculo de transporte sin bifurcar por `receptor.rfc.length === 12` (Persona Moral) vs `receptor.rfc.length === 13` (Persona Física).

---

### [MEDIO] Facilidad del 8% de comprobación de gastos de viaje no deduce retención de ISR provisional del 16% (REINCIDENTE)
`src/lib/likida/liquidacion/deducibilidad.ts:220-244` y `src/lib/likida/cuadre/leyendas.ts:88-104`
- **Escenario:** El chofer reporta $3,000.00 MXN de gastos menores sin comprobante fiscal (maniobras, talachas, pensiones en ruta) acogidos a la facilidad del 8% de los ingresos propios de la actividad de autotransporte (Resolución de Facilidades Administrativas - RFA Regla 2.3).
  - Entrada: `gastoSinComprobante = 3000.00`, clasificado como `FACILIDAD_RFA_8_PCT`.
  - Salida errónea: El motor calcula deducible el monto íntegro de $3,000.00 MXN sin computar ni descontar el 16% de ISR provisional que la Regla 2.3 de la RFA obliga a retener y enterar al SAT a más tardar el día 17 del mes siguiente ($480.00 MXN). El PDF muestra los $3,000.00 como costo neto deducible directo.
- **Consecuencia:** La flota asume que el gasto no fiscal es 100% deducible a costo cero; omite la provisión contable y el entero de la retención del 16% ante el SAT, perdiendo el beneficio de la facilidad en una auditoría y convirtiendo el gasto en no deducible para ISR.
- **Causa probable:** La lógica de deducibilidad marca el concepto como exento/deducible simplificado sin ligar el pasivo fiscal de retención ISR exigido por la RFA.

---

### [BAJO] Leyenda de deducibilidad en viáticos omite validación de la faja de 50 km del domicilio fiscal
`src/lib/likida/cuadre/leyendas.ts:135-152`
- **Escenario:** Un chofer liquida gastos de alimentación local en ruta de patio/última milla dentro de la misma zona metropolitana (ej. CDMX a Cuautitlán Izcalli, distancia < 25 km del domicilio de la base).
  - Entrada: CFDI de restaurante por $350.00 MXN con ruta `ORIGEN: Tultitlán` -> `DESTINO: Tepotzotlán` (< 30 km).
  - Salida errónea: El sistema genera en la liquidación la leyenda: *"Gasto deducible conforme al Art. 28 fracc. V LISR (Alimentación nacional dentro del tope de $750 diarios)"* sin validar si el viaje excedió la faja de 50 km contados alrededor del establecimiento del contribuyente.
- **Consecuencia:** El contralor o auditor interno acepta como deducible viáticos de transporte local que no cumplen el requisito territorial de distancia del Art. 28 fracc. V de la LISR.
- **Causa probable:** Verificación únicamente de tope diario de monto sin cruce con los kilómetros de ruta o coordenadas origen/destino.

---

## Lo que revisé y está bien

1. **Validación de CFDI 4.0 y Complemento Carta Porte 3.1 / 3.0**
   - `src/lib/likida/intake/cfdi.ts:85-140`: Parseo riguroso de UUID, RFC emisor/receptor, Régimen Fiscal (Catálogo c_RegimenFiscal) y Uso de CFDI (G03/G01/S01).
   - `src/lib/likida/intake/sat.ts:32-78`: Consulta SOAP/REST al WebService del SAT para verificar estatus del CFDI (`Vigente`, `Cancelado`, `No Encontrado`) y concordancia de importes con Código QR antes de permitir la inclusión en liquidación.

2. **Tope de Viáticos de Alimentación Nacional e Internacional (LISR Art. 28 Fracc. V)**
   - `src/lib/likida/liquidacion/deducibilidad.ts:95-130`: Aplicación estricta de límites diarios ($750.00 MXN en territorio nacional, $1,500.00 MXN en el extranjero) segregando el excedente a la partida de `Gasto No Deducible`.

3. **Cálculo de IEPS Acreditable vs Trasladado en Combustibles**
   - `src/lib/likida/cuadre/engine.ts:180-215`: El motor separa adecuadamente el IEPS cuota trasladado (Art. 2-A LIEPS) del precio de la gasolina/diésel, sin confundirlo con IVA acreditable y reflejando el importe neto deducible en el costo del combustible.

4. **Trazabilidad de Reglas contra Fichas Normativas YAML**
   - `normas/liva_art1a.yaml`, `normas/lisr_art28.yaml`, `normas/rfa_autotransporte.yaml`: Estructura documental y transcripciones literales de fuentes primarias bien mapeadas en la documentación de base.

---

## Lo que NO alcancé a revisar

1. **Tratamiento del Estímulo Fiscal Diésel del Art. 16 Fracc. IV LIF frente a IEPS Cuota 2026**
   - No se auditó la fórmula específica cuando el precio del diésel contiene cuotas complementarias estatales o subsidios semanales publicados por la SHCP en el DOF.
2. **Retención de RESICO Personas Morales a Personas Físicas (Art. 113-J LISR - 1.25%)**
   - No se verificó la regla si el chofer o permisionario hombre-camión factura flete bajo el Régimen Simplificado de Confianza (RESICO).
3. **Manejo de Notas de Crédito y Devoluciones en Carta Porte**
   - No se revisó el impacto de CFDI tipo `E` (Egreso) asociados a penalizaciones de fletes sobre el IVA causado y retenciones previas.