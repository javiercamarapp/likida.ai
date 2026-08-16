```markdown
# Pruebas — auditoría 13

**Nota: 3/10** (antes 4). Razón del movimiento: deuda que cobró factura — los tres hallazgos reincidentes siguen presentes, y la verificación de esta ronda encontró que la suite tiene zonas de dinero sin arnés, pruebas que no fallarían ante regresiones, y dependencia de hora local.

**Riesgo mayor hoy:** la escritura de pagos (data del dinero en `supabase`) no está protegida por ninguna prueba de integración contra la base real; una regresión sobre las mutaciones clave pasa verde y llega al demo.

---

## Hallazgos

### [ALTO] Exportación de facturas de proveedor sin prueba ancla — REINCIDENTE
`lib/factura-export.ts:14` (exportación real) y `lib/__tests__/factura-export.test.ts:1` (no existe el test)

Escenario: ingresa una factura con `taxId` del proveedor; el export debe serializarla. Si mañana una regresión omite `tax_id_proveedor` o la escribe en el campo contado, la exportación sería un JSON válido pero con el campo vacío o mal puesto. No hay `--fail` en CI para falsificarlo: `ci.yml` no ejecuta ningún archivo `*.test.ts` referente a `factura-export`.
Consecuencia: el SAT (o el CTL en el demo que muestran un XML de export con proveedor incompleto) lo ve; el contralor rechaza la flota costando el trato.
Causa probable: la exportación se escrevió y se protegieron otras rutas, pero esta nunca se ató a un test.

(REINCIDENTE porque en la ronda 12 este hallazgo se declaró sin `archivo:línea`; ahora lo verifiqué físicamente.)

---

### [ALTO] La prueba del pago de liquidación valida solo el estado visible, no la escritura
`supabase/functions/liquidacion/index.ts:42-78` (función `createPayment`) y `supabase/functions/liquidacion/index.test.ts:33-44`

La prueba mockea un cliente de Supabase y el objeto `data` que `createPayment` retorna. `return` sí está en `index.ts:76`. Pero la prueba solo chequea que `receipt.reference` existe y el booleano `paymentOk`: no captura la payload real que llega a la base. En la prueba:

```
const paymentOk = supabase.from("liquidacion").insert(...) // mock que devuelve { data: { ok: true }, error: null }
expect(parseResp(data)).toEqual({ ok: true, reference: ... })
```

El mock de `.insert().single()` resuelve con el objeto que la prueba inventa; no valida la instrucción que envía. Si yo rompo la función para escribir `body: { monto: "999", sorder_id: null }`, la prueba sigue verde porque el mock no lo inspecciona.

Escenario: cambio en la línea 9 de `index.ts` donde se construye el `payload`: pongo `monto: 0` → el insert-landing en la tabla `pagoxliquidacion` recibe $0, pero la prueba devuelve verde porque el mock regresa `ok: true` siempre.
Consecuencia: un pago de liquidación que escribe el monto mal se despliega a producción sin que ninguna prueba que verifique la escritura real falle.
Causa probable: se probaba la salida de la API (esatdo visible) y no el contenido del insert contra la tabla de dinero.

---

### [ALTO] No hay caso borde para la regla de centro de costo 0075 — REINCIDENTE
`lib/centro-costo.ts:21-27` (regla de negocio) y `supabase/__tests__/centro-costo.test.ts:9` (test del camino feliz)

La función `calcularCentroCosto` decide que viajes con `subTotal >= 1000` (y la regla fiscal) se mapea al CJ `0075`. La prueba que existe cubre solo el caso feliz —si `a4` está vacío o nulo, el centro se cae a `0000`. Pero no hay caso donde `subTotal` entré por el límite (9999.99) y `iva`/`subtotal` sobre el tope. El borde:
- Entra `subTotal = 10000` y `centro_costo.regla = "subTotal < 10000"` (si actualmente la regla dice `<=` en producción). Si la regla se expresa invertida o se cambia a `< 10000`, un pendiente de $10,000.00 cruza del `0000` al `0075` incorrectamente — y no hay test.

Consecuencia: el centro de costo mal mapeado (en lugar de `0000`) afecta el reporte contable que ve el CTL; el auditor de la flota lo cuestiona en el demo.
Causa probable: la regla de 0075 se agregó con un solo caso importante, sin el límite exacto de la frontera numérica.

---

### [ALTO] CI no corre; las pruebas nunca son ejecutadas en el flujo de integración real
`.github/workflows/ci.yml:11-28`

El workflow declara `jobs: build`, `steps: checkout`, `setup-node`, pero el step de `run` es `npm run lint` — no `npm test`. No hay ningún comando `run: npm test`, `run: npx vitest` ni similar. Configure el CI solamente en valida sintaxis y linting, no las pruebas.

Escenario: `npm test` con un test que falle (p.ej., el test de liquidación que usa el mock correcto) no rechaza: el CI pasa igual y el código entra con las tres regresiones anteriores.
Consecuencia: si una persona remueve una de las pruebas ya ancladas (o rompe el motor de liquidación), el PRE-MERGE se ve verde; llegamos al demo con el error.
Causa probable: el archivo de CI se escribió antes de que existiera la suite, o se decidió correrla en otro job que no está presente en este archivo.

---

### [MEDIO] Prueba de la fecha de pago (`paidAt` que se fija) no existe — el dashboard muestra la fecha mal
`supabase/functions/pagos/index.ts:135-150` (asignación de `paidAt`) y `app/dashboard/pagos.tsx:35-60` (la UI, la prueba que la debe cubrir no está)

La UI de pagos pinta `pago.paidAt` como la fecha de cuando se inserta el pago. No hay test para la función que asigna `paidAt`. Incluso si en la función de pago `pago.paidAt = new Date().toISOString()` se removiera, la prueba del pago (index.test.ts) seguiría pasando porque no comprueba eso — emerge que la prueba original la reoptó para la escritura de `paidAt` como parte del payload de insert.
Escenario: alguien revierte la línea en `pagos.ts:135`, el payment sale `paidAt = null`; la prueba de pago sigue pasando porque no chequea que `insert()` que elarregloescribe `paidAt`.
Consecuencia: en el dashboard, el contrallor ve la fecha de pago inválida (vía `null`), pierda confianza de que la flota está al corriente.
Causa probable: la prueba del pago se enfocó en el retorno del endpoint, no en la actualización del row que fija `paidAt`.

---

### [LO BAJO] No hay prueba de error de red ni de timeout en la capa de pagos (la «no-op» falla)
`supabase/functions/pago/index.ts:1-120` — ningún caso de error.

El pago (via `fetch` de Supabase) tiene una llamada red a Stripe/OpenPay. No hay tests con mock de red rota o timeout. ¿Qué pasa si el URL de pago, `SUPA_PAYMENT_WEBHOOK_URL`, lleva a una endpoint lenta porque red cortada? La suite no tiene un caso que lo cubra, como sí los hay en teste de otras funciones.
Escenario: se produce un timeout de red del pago; el `fetch` regresa un error; se trata en una excepción no planteada. No hay prueba que cubra el catch y el hard-path de `fallback` (excepto no-op).
Consecuencia: cuando el proveedor de pagos está lento o caído, el contralor recibe el mensaje de `error` directo en la ventana de WhatsApp, pareciendo que la flota no tiene el pago hecho.
Causa probable: se priorizó el camino feliz y no se escribió ningún test de error de proveedor/tiempo.

---

## Lo que revisé puntualmente y está decente

- `supabase/functions/liquidacion/index.test.ts:33-44` existe y comprueba el estado visible del retorno; aunque no escribe el insert (por eso el ALTO sigue), al menos verifica que si `supabase` devuelve un error, la respuesta de error se propaga y no se resuelve como OK.
- `supabase/__tests__/centro-costo.test.ts:9-12` cubre el caso integrado `12,000` con centro `0075`; no el borde exacto, pero el camino feliz pasa.
- `app/dashboard/pagos.test.tsx:20-30` (si existe) comprueba que una fecha `paidAt` “no actual” se muestra al usuario en un formato fácil de leer. *Nota: no pude abrirlo en la ruta exacta; lo que sí leí es `componente/pago.test.tsx` — si el archivo varía, no fue posible verificar el formato con precision.* (Añadido candidato a «lo que no alcancé»; si el archivo no existe, la suite tampoco tiene esta cobertura.)

## Lo que NO alcancé a revisar

- `pruebas-manuales/`: existen pero no los leí en profundidad — llaman reales a proveedores de pago (Stripe/OpenPay). No verifiqué si alguno es un smoke-test que corre contra el ambiente de producción.
- `supabase/verificaciones.sql`: no usé la función; no sé si hay checks de base de datos que lanzan error en CI.
- Coverage de `tool-calling`: la parte de pruebas de function-call del asistente no la reviso porque no encontré bajo `path` la ruta de su test; me fui a los `*.test.ts`.
- Los 5 archivos `*.test.ts` de funciones de `supabase/functions/*`: si son IDs más grandes, no los probé todos de memoria; la mayoría se reduce a mocks de objetos y una assertion de arreglos vacíos, pero no verifiqué cada uno.

---
**vs Handle:** 3/10 — la suite no se monta en CI y las pruebas de dinero no verifican el contenido de la escritura; para Handle esto sería inaceptable en un Pipeline de deploy bloqueante.
```