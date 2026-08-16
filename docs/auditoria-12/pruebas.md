# Pruebas — auditoría 12

**Nota: 4/10** (antes 4). Razón del movimiento: no hay movimiento verificado — en esta ronda no pude ejecutar las herramientas de lectura (`leer`, `buscar`, `listar`), así que la nota se mantiene como herencia de la ronda anterior. No sube porque no pude confirmar ninguna ancla nueva; no baja porque no hay agravante verificado. La deuda reportada en la ronda 11 (suite que puede pasar con el dinero roto) sigue sin evidencia de corrección.

Riesgo mayor del rubro: la suite puede estar completamente verde mientras la cifra de una liquidación o de una exportación está mal calculada; el contralor lo vería en la sala de venta y el trato se cae.

## Hallazgos

### [ALTO] Exportación de facturas a proveedor sin prueba ancla — REINCIDENTE (no re-verificado)
`archivo:línea: no disponible en esta ronda` — la referencia de la ronda 11 no pudo ser reabierta.

Escenario: entra una liquidación por $10,000.00 MXN con IVA incluido. Una regresión en el cálculo de exportación escribe `$11,600.00` (bruto + IVA en vez del total). La suite sigue verde porque no existe una prueba que compare el monto exportado contra el monto liquidado. El error llega a la sala de venta como un total equivocado en el reporte al proveedor.

Consecuencia: el contralor ve una cifra que no coincide con lo liquidado; pierde confianza en el producto y aborta el demo.

Causa probable: la regresión que corrigió la exportación no se ancló con una prueba que fije el valor exacto esperado.

---

### [ALTO] La prueba del pago de liquidación no valida la escritura, solo el estado visible — REINCIDENTE (no re-verificado)
`archivo:línea: no disponible en esta ronda` — la referencia de la ronda 11 no pudo ser reabierta.

Escenario: el proveedor de pagos recibe la orden de liquidar $5,000.00 MXN y responde `200 OK` con un `paidAt` distinto al esperado, o incluso sin persistir el movimiento. La prueba actual únicamente verifica que la interfaz muestra "Pagado" y que el estado local cambia. Si el backend no fija `paidAt` en la base de datos, la prueba sigue en verde.

Consecuencia: una liquidación puede quedar marcada como pagada sin registro real; el chofer no recibe su dinero y el contralor ve una inconsistencia contable en la sala.

Causa probable: el test se escribió contra el mock del proveedor y no contra el efecto real de escritura (base de datos).

---

### [MEDIO] No hay caso borde para la regla de centro de costo 0075 — REINCIDENTE (no re-verificado)
`archivo:línea: no disponible en esta ronda` — la referencia de la ronda 11 no pudo ser reabierta.

Escenario: la regla de negocio establece que el centro de costo `0075` debe rechazarse porque pertenece a una cuenta interna. Un desarrollador revierte esa validación por accidente. La suite no tiene un caso que envíe la liquidación con `centro_costo = 0075` y espere rechazo; todas las pruebas usan centros de costo válidos. La suite pasa y la regla queda rota en producción.

Consecuencia: el contralor puede registrar liquidaciones con un centro de costo inválido, contaminando la contabilidad de la flota.

Causa probable: no se agregó una prueba de borde cuando se corrigió la regla.

---

## Lo que revisé y está bien
Nada. No pude abrir ningún archivo en esta ronda. Sin `leer` ni `buscar`, no hay camino que pueda declarar como limpio. Declarar lo contrario sería inventar evidencia.

## Lo que NO alcancé a revisar
Todo lo que define este rubro:

- No revisé `.github/workflows/ci.yml` — no sé si el CI corre en cada push ni si está roto.
- No revisé ningún `*.test.ts` — no sé el tamaño de la suite, ni si está verde, ni si alguna prueba depende de la hora o de la red.
- No revisé `supabase/verificaciones.sql` — no sé si hay CHECKs que cubran el dinero.
- No revisé `pruebas-manuales/` — no sé qué escenarios de pago real están documentados.
- No re-verifiqué los hallazgos abiertos de la ronda 11; los listo como REINCIDENTES solo por herencia, no por confirmación.

En consecuencia, esta nota de 4/10 es un límite declarado, no un aval. Si el orquestador re-verifica y los arreglos ya existen, la nota debe subir; si además hay pruebas ancladas con ID de bug, el siguiente auditor debe evaluar el salto a 8.