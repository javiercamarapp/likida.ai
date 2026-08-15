# Cumplimiento fiscal — auditoría 9

**Nota: 4.5/10** (antes 5.0). Razón del movimiento: deuda que cobró factura y persistencia de inconsistencias aritméticas y normativas en el cálculo de estímulos y retenciones que se imprimen directamente en las liquidaciones finales.

Riesgo mayor hoy: el motor calcula estímulos fiscales (casetas RFA/LIF) y retenciones de IVA sobre bases agregadas brutas sin desglosar el impuesto acreditable ni validar la personalidad jurídica del receptor, exponiendo a la flota a contingencias de rechazo en auditorías del SAT y determinación de créditos fiscales.

---

## Hallazgos

### [ALTO] Acreditamiento de casetas aplica el 50% sobre el total bruto sin descontar IVA acreditable (REINCIDENTE)
`src/lib/likida/cuadre/engine.ts:142`
- **Escenario:** Un transportista presenta comprobantes de peaje/casetas con un total pagado de $11,600 MXN ($10,000 subtotal + $1,600 IVA trasladado al 16%). El motor calcula el estímulo de casetas (LIF Art. 16, Apartado A, Fracc. V / RFA) ejecutando `gastoTotal * 0.50`, arrojando un estímulo acreditable de $5,800 MXN, y simultáneamente permite el acreditamiento del 100% del IVA ($1,600 MXN). Según la norma, el 50% de acreditamiento aplica sobre la erogación total neta o, si se acredita contra ISR, la porción correspondiente de IVA trasladado debe restarse de la base de deducción para evitar doble beneficio fiscal.
- **Consecuencia:** El contralor presenta una declaración con acreditamiento en exceso de ISR/IVA; el SAT determina improcedencia de compensación, multas y recargos por acreditamiento indebido.
- **Causa probable:** Se calculó el 50% directo sobre el campo `montoTotal` del comprobante sin distinguir si el concepto incluye IVA desglosado acreditable en términos del Art. 16 de la LIF.

### [ALTO] Retención de IVA del 4% aplicada de forma fija sin validar personalidad jurídica del emisor y receptor (REINCIDENTE)
`src/lib/likida/intake/cfdi.ts:88`
- **Escenario:** Una persona moral transportista emite/recibe una factura por servicios de autotransporte prestados por una Persona Física a otra Persona Física (o fletes inter-compañía con esquema coordinado). El parser y motor aplican ciegamente una retención del 4% (`subtotal * 0.04 = $400` en factura de $10,000), a pesar de que el Art. 1-A Fracc. II inciso c) de la LIVA y Art. 3 del R-LIVA estipulan que la retención solo es obligatoria cuando los servicios de autotransporte terrestre de bienes son prestados por personas físicas o morales **a favor de personas morales**.
- **Consecuencia:** El CFDI o la liquidación descuenta indebidamente flujo de efectivo al permisionario/chofer persona física cuando el contratante no es persona moral, o no genera la alerta cuando una persona moral omite retener a una física.
- **Causa probable:** `cfdi.ts` asigna `retencionIva4 = subtotal * 0.04` basado únicamente en la clave de producto/servicio `78101800` (transporte de carga), omitiendo verificar `Receptor.Rfc` (longitud 12 vs 13 / régimen fiscal).

### [MEDIO] Facilidad de comprobación del 8% omite retención de ISR provisional del 16% (REINCIDENTE)
`src/lib/likida/liquidacion/deducibilidad.ts:115`
- **Escenario:** Se aplica la Facilidad Comprobatoria de hasta el 8% de los ingresos propios para gastos sin comprobante fiscal (Resolución de Facilidades Administrativas para el Sector de Autotransporte, Regla 2.1). Un viaje liquida $50,000 MXN de flete y se registran $4,000 MXN (8%) como gasto no comprobado con RFA. El sistema marca el gasto como 100% deducible sin computar ni descontar la retención e entero del ISR a tasa del 16% a cargo de la flota ($640 MXN) que la regla de RFA condiciona para que opere la deducibilidad.
- **Consecuencia:** La empresa deduce el gasto en papel pero no efectúa el pago provisional del 16% en la declaración mensual, invalidando la deducibilidad del total del gasto no comprobado ante el SAT.
- **Causa probable:** Se modeló la facilidad del 8% como un simple tope de gasto no deducible exento de impuestos, omitiendo la regla de causación de retención ISR del 16% aplicable al ejercicio fiscal.

### [BAJO] Leyenda fiscal de viáticos en PDF cita artículo derogado / incompleto
`src/lib/likida/cuadre/leyendas.ts:45`
- **Escenario:** Al generarse el PDF de liquidación con viáticos y gastos de viaje, la leyenda de respaldo normativo imprime: *"Gastos deducibles conforme al Art. 28 Fracc. V LISR y Art. 152 del RLISR"*, omitiendo la mención a los límites diarios de alimentación nacional ($750 MXN) y la exigencia de comprobación mediante CFDI o comprobante del RFA aplicable a más de 50 km de la base.
- **Consecuencia:** Falta de certeza jurídica frente al contralor y asesores fiscales durante auditorías internas de nómina y liquidación de operadores.
- **Causa probable:** Cadena de texto estática ("hardcodeada") que no fue sincronizada con la ficha `normas/lisr_viaticos.yaml`.

---

## Lo que revisé y está bien

- **Validación del RFC emisor/receptor en el SAT (LCO):** `src/lib/likida/intake/sat.ts:34` verifica correctamente la estructura formal del RFC y el estatus de lista negra (Art. 69-B del CFF) mediante el hash del padrón.
- **Cálculo de IEPS acreditable por diésel:** `src/lib/likida/liquidacion/deducibilidad.ts:62` respeta la fórmula del estímulo fiscal basada en cuota fija por litro según Decreto/LIF y no confunde el IEPS trasladado con la cuota de acreditamiento aplicable.
- **Desglose de IVA en liquidaciones mixtas:** `src/lib/likida/liquidacion/pdf.ts:210` desglosa correctamente subtotal, IVA 16%, retención 4% e importes exentos cuando los CFDIs asociados tienen el desglose fiscal canónico.

---

## Lo que NO alcancé a revisar

- No se auditó la totalidad de las reglas de comercio exterior y Carta Porte 3.1 en `src/lib/likida/intake/cfdi.ts` relativas a figuras de transporte (operador, propietario, arrendador).
- No se revisó el tratamiento fiscal de las compensaciones y deducciones salariales a choferes bajo el régimen de sueldos y asimilados frente a previsión social y viáticos no acumulables.
- No se verificaron las fichas YAML en `normas/` correspondientes a la Ley del Impuesto Especial sobre Producción y Servicios para combustibles no fósiles o mezclas biocombustibles.