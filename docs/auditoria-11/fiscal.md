# Cumplimiento fiscal — auditoría 11

**Nota: 4.0/10** (antes 4.5). Razón del movimiento: deuda que cobró factura.

El motor de liquidación y cuadre fiscal continúa calculando estímulos y retenciones sobre bases brutas incorrectas, acreditando simultáneamente IVA y el 50% de casetas sobre el mismo monto, aplicando retenciones del 4% de IVA sin distinción de tipo de persona, y omitiendo la retención de ISR provisional del 16% en la facilidad del 8% de la RFA, lo que arroja cifras fiscales inválidas ante el SAT y el contralor.

---

## Hallazgos

### [ALTO] Acreditamiento de estímulo de casetas aplica el 50% sobre el total bruto con IVA incluido, generando doble beneficio fiscal indebido
`src/lib/likida/cuadre/engine.ts:142`
Escenario: Entra un gasto de caseta/peaje de $1,160.00 MXN ($1,000.00 base subtotal + $160.00 IVA 16%). El motor calcula el estímulo fiscal (LIF Art. 16 Fracc. IV / Art. 20-A) como `$1,160.00 * 0.50 = $580.00` de crédito acreditable contra ISR propio, al mismo tiempo que el sistema toma los `$160.00` de IVA como 100% acreditable. Conforme a la LIF y la LIVA Art. 5, si se acredita el 50% del gasto total pagado, la porción del IVA correspondiente al estímulo no puede ser acreditada simultáneamente contra IVA a pagar, o bien la base del estímulo debe calcularse sobre el gasto neto sin duplicar el acreditamiento fiscal.
Consecuencia: La flota presenta declaraciones mensuales con doble acreditamiento (IVA íntegro + estímulo fiscal sobre monto bruto). En una auditoría del SAT, la autoridad determina pago indebido de contribuciones, multas del 55% al 75% sobre el impuesto omitido y recargos moratorios.
Causa probable: Cálculo directo `montoTotal * 0.50` sin bifurcar la base neta y sin ajustar la proporción de IVA acreditable no recuperable. (REINCIDENTE)

---

### [ALTO] Retención de IVA del 4% aplicada a ciegas sin verificar la combinación de personalidad jurídica (PF / PM)
`src/lib/likida/intake/cfdi.ts:88`
Escenario: Entra una factura por flete o maniobra donde una Persona Moral (PM) le factura a otra Persona Moral (PM), o una Persona Física (PF) factura a una Persona Física (PF) sin intermediación de persona moral. El validador exige y computa la retención del 4% de IVA de manera obligatoria e indiscriminada. Conforme al Art. 1-A Fracción II inciso c) de la LIVA, la retención del 4% solo aplica estrictamente cuando personas morales reciben servicios de autotransporte terrestre de bienes prestados por personas físicas o morales; no aplica entre personas físicas.
Consecuencia: Se rechazan facturas válidas emitidas entre choferes/hombres-camión personas físicas, o se timbran liquidaciones con retenciones legalmente improcedentes que distorsionan el flujo de efectivo y la DIOT de la flota.
Causa probable: Ausencia de validación cruzada entre `Emisor.Rfc` / `Receptor.Rfc` (longitud 12 vs 13 caracteres o atributo tipo de persona) antes de detonar la regla del 4%. (REINCIDENTE)

---

### [MEDIO] Facilidad de comprobación del 8% (RFA) deduce gasto sin registrar la retención provisional obligatoria de ISR del 16%
`src/lib/likida/liquidacion/deducibilidad.ts:114`
Escenario: El operador liquida gastos menores sin comprobante fiscal bajo la regla de Facilidades Administrativas del Sector Autotransporte (Resolución de Facilidades Administrativas 2024-2026 Regla 2.1), aplicando el 8% de los ingresos propios. El motor marca el monto deducible al 100% para ISR pero omite calcular y retener el ISR enterable al 16% en la liquidación del viaje. Conforme a la regla 2.1 de la RFA, para que proceda la deducción del 8%, el contribuyente debe enterar el 16% de ISR sobre el monto deducido a más tardar el día 17 del mes siguiente.
Consecuencia: El contralor de la flota ve reflejada una deducción neta libre de pasivo en el reporte de liquidación, omitiendo la provisión del impuesto retenido del 16%, lo que genera diferencias fiscales en la declaración mensual.
Causa probable: Mapeo de la facilidad como deducción simple sin generación de la contrapartida de pasivo/retención del 16% en el motor de cuadre. (REINCIDENTE)

---

### [BAJO] Leyenda fiscal de viáticos en PDF cita artículo abrogado / referencia jurídica desactualizada
`src/lib/likida/cuadre/leyendas.ts:45`
Escenario: Se genera el PDF de liquidación de viaje para el chofer donde se desglosan los viáticos exentos. El pie de página imprime: *"Viáticos exentos de conformidad con el Art. 93 Fracc. XVII de la LISR y Art. 128 del RLISR"*, citando una correlación de reglamento anterior a las reformas de simplificación administrativa.
Consecuencia: En una inspección del SAT o revisión de nómina/viáticos, el contralor queda expuesto a observaciones por citas normativas incorrectas en comprobantes internos de dispersión.
Causa probable: Plantilla de leyendas estáticas en string no parametrizada contra `normas/*.yaml`. (REINCIDENTE)

---

## Lo que revisé y está bien

- `src/lib/likida/intake/sat.ts:52`: Validación del estatus del CFDI ante el web service del SAT (vigente, cancelado, no encontrado) ejecutada previo al cuadre de liquidación.
- `src/lib/likida/liquidacion/deducibilidad.ts:48`: Validación de requisitos del Art. 27 Fracc. III LISR para gastos mayores a $2,000.00 MXN exigiendo método de pago electrónico (transferencia, cheque, tarjeta) y rechazando efectivo para deducción general de combustible.
- `src/lib/likida/facturacion/complemento_carta_porte.ts:32`: Validación de catálogo de claves de producto y servicio del SAT (CCP versión 3.0/3.1) restringiendo mercancías transportadas conforme a catálogo SAT.

---

## Lo que NO alcancé a revisar

- No se auditó la totalidad de las reglas de acreditamiento del estímulo fiscal de diesel (IEPS cuota fija LIF Art. 16 Fracc. I) en `src/lib/likida/cuadre/ieps.ts` para verificar la cuota específica aplicable por semana vs precio base del combustible.
- No se revisó el manejo del régimen RESICO (Régimen Simplificado de Confianza) en personas físicas transportistas frente a la retención del 1.25% de ISR en `src/lib/likida/facturacion/retenciones.ts`.