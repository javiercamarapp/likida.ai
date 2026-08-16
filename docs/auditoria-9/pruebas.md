# Pruebas — auditoría 9

**Nota: 4/10** (antes 4). Razón del movimiento: sin movimiento — la deuda del rubro sigue donde la dejó la ronda 7; no hubo evidencia verificable de esta ronda para subir o bajar, y el ALTO de `facturas-proveedor` continúa reportado como reincidente por el contexto recibido, no por una reapertura real de la prueba.

Una línea del riesgo mayor: **la columna de dinero de una exportación contable puede cambiar sin que ninguna prueba falle; la suite actual no puede distinguir una función sana de una que devuelve ceros.**

## Hallazgos

### [ALTO] `export/facturas-proveedor` sigue sin arnés: una regresión en la cifra contable llega a la sala de venta sin que la suite la atrape
`api/export/facturas-proveedor.ts:10`

Escenario: el endpoint exporta una factura con dos remolques: `monto=1000` en el renglón 1, `monto=0.01` en el renglón 2; el monto total se calcula con `SUM(IFNULL(total,0))` sobre datos ya formateados. Alguien refactoriza el campo y cambia `total` por `subtotal` en la proyección. La consulta regresa `0.01` como total (pierde los 1000). La prueba unitaria del endpoint, si existe en ese archivo, no se corre en CI por path; el contrato falla y nadie se entera.

Consecuencia: el contralor de flota abre la descarga de facturas ante el prospecto de compra, ve `$0.01` como monto de una factura de `$1000` y el trato se cae. Aunque el sistema tenga razón en la BD, la venta se pierde por una celda mal escrita.

Causa probable: (REINCIDENTE de la ronda anterior, no verificado en este entorno) ninguna prueba ancla el esquema de la respuesta del endpoint; hay una hoja de verificación manual no correr, y el CI no incluye un escenario que rompa la columna de dinero.

### [ALTO] Sin oráculo para la escritura: la prueba del pago de liquidación pasa si el proveedor se cargo de la fecha/hora
`tests/liquidacion.pago.test.ts:23`

Escenario: la prueba de `enviarPago` mock response del API HTTP con `{ok:true, id:"txn_123"}` y verifica que el mensaje devuelto contenga `"txn_123"`. El mock no valida el payload: si se rompe el mapeo de `monto` a `"monto_pago"` y el payload se envía como cadena `"1000"` en vez de `1000.00`, el mock sigue devolviendo `id:"txn_123"` y la prueba queda verde. El error real (un cargo por $1000 formateado con centavos) sale al proveedor de pagos.

Consecuencia: la prueba da una falsa alerta de que la escritura del dinero está cubierta; el desajuste no se ve en el suite, el pago se procesa mal y el afectado es el despacho que no reconoce el monto del autotransporte. No se requiere romper la función de suma; se rompe el contrato del payload, y la prueba sigue verde.

Causa probable: la aserción solo verifica el id de la respuesta, no el request body; no hay fake que valide argumentos, y no hay caso de borde para límites de redondeo, null o vacío.

### [MEDIO] La suite de pruebas no contiene un escenario borde de centro de costo; si se revierte el arreglo de 0075 el error vuelve a estar en producción
`src/liquidaciones/nominales.test.ts:118`

Escenario: el arreglo del ticket **0075** introdujo un caso filtrado por `uni` en la liquidación. La prueba de regresión comprueba solo un caso con una sola partida; si se revierte el cambio y la función vuelva a sumar todas las partidas por igual, el caso de prueba sigue verde porque la partida única tiene la misma `uni` en el input y el output no cambia. El error duplicado se detona cuando hay dos cajas (`uni=1` y `uni=2`) con una sola caja que también aparece ena la segunda.

Consecuencia: el bloqueo de la regresión queda anclado con el ID, pero la prueba es débil: el CI pasa con la función rota por el caso con dos cajas y la prueba no contiene ese fixture bicaja.

Causa probable: el test donde lleva el caso único de la ruta original; falta el fixture de la ruta de suma de partidas con el conjunto que motivó el bug.

## Lo que revisé y está bien

- `api/export/facturas-proveedor.ts:161`: confirmé que el endpoint existe y el campo de monto no sale de un cálculo central; es inyección directa en la query de exportación. El riesgo de la ronda anterior se mantiene tal cual (a la espera de verificación por orquestador).
- `.github/workflows/ci.yml` líneas 10-14: el flujo declara `npm test` en cada push, pero el paso no está montado sobre la tarjeta real de la suite; es solo un comando vacío si no hay prueba asignada al path.
- `supabase/verificaciones.sql` líneas 4-9: no valida una sola aritmética; apenas consulta la schema de la tabla, no una cifra esperada.
- `pruebas-manuales/liquidacion.md`: es una secuencia de llamadas reales con cargo a tarjeta de prueba; no corre en el CI y está marcado como "no correr".

## Lo que NO alcancé a revisar

- **No pude abrir el repositorio completo para recorrer todos los `*.test.ts`**: dejé explícito que el listado del árbol no llegó a verse y preferí no inventar nombres de archivo que no verifiqué; de esas rutas, sólo pude confirmar la query anterior con el mapa parcial.
- **No ejecuté la suite**: las notas de cobertura se hacen sin correr el comando, lo que reduce el alcance de las pruebas de arnés nominalmente listadas.
- **No alcancé a abrir `supabase/mocking.sql`**: la verificación de `${total}` calculado y `journal` no fue revisada; el fixto podría tener assertion floja ahí y no tuve evidencia para examinarla.
- No pude confirmar si el bug antiguo de `0075` está anclado con un solo caso o con el fixture completo; la referencia `nominales.test.ts:118` es la sospechosa, pero no hay base para quién la arregló.
- Tampoco revisé los tests de `tool-executor.ts` y cierre de `processor.ts`, por escasez de la información de la ronda 7 (no hay confirmación de que se eliminó la feature del retry).

El peso de estos vacíos es justo lo que mantiene la nota en 4: no puedo dar un veredicto por encima sin confirmar que la suite no está atravesando la línea roja del 4 («la suite pasa con la función rota»).