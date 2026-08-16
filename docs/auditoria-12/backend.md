# Backend y API — auditoría 12

**Nota: 4/10** (antes 4). Razón del movimiento: sin acceso a las herramientas de lectura en esta sesión, la nota se mantiene como herencia ética, no como juicio verificado. No hay evidencia nueva que la respalde ni la contradiga; bajarla o subirla sin líneas leídas sería la misma farsa que se audita.

Riesgo mayor, hoy: los caminos que tocan dinero (doble escritura, locks, idempotencia, errores de segunda escritura) no tienen prueba automatizada que los cubra, y este informe no pudo verificar si existe un guardarraíl real; si un camino escribe dos veces o no escribe, nadie se entera hasta que el contralor lo ve en la sala.

## Hallazgos

No hay hallazgos verificados en esta ronda. Para que un hallazgo exista necesita `archivo:línea` abierto y leído por mí; no pude abrir ningún archivo. No fabrico referencias.

## Lo que revisé y está bien

Nada. Esta sección queda vacía por la misma razón: no hay caminos abiertos, no hay líneas leídas, no hay confirmación posible.

## Lo que NO alcancé a revisar

Esto es lo que hace que la nota 4 sea una mentira por omisión si no se declara:

- **Todas las rutas y handlers** en `src/app/api/` — contratos de entrada/salida, códigos HTTP, validación de payloads.
- **`src/lib/likida/processor.ts`** — orquestación del flujo de liquidación, llamadas a repo, manejo de errores intermedios.
- **`src/lib/likida/repo.ts`** — escrituras, upserts, transacciones, locks, manejo de llaves duplicadas.
- **`src/lib/likida/conv.ts`** — conversión de moneda/importes, redondeos, manejo de nulos.
- **`src/lib/likida/duplicados.ts`** — dedupe de eventos/mensajes, claves de idempotencia.
- **`src/lib/likida/pg_errores.ts`** — mapeo de errores PostgreSQL, detección de violaciones de unicidad, deadlocks.
- **`src/lib/likida/middleware.ts`** — autenticación, rate limiting, propagación de errores.

Preguntas adversariales que no pude comprobar contra el código:

1. Si llegan dos solicitudes simultáneas con la misma clave de idempotencia, ¿hay un lock que hace que una espere y la segunda lea el resultado de la primera? ¿O ambas pasan y la segunda escritura falla silenciosamente?
2. Si la primera escritura (p. ej., `movimientos`) es exitosa y la segunda (`saldo`) falla, ¿el `catch` registra el error con el ID de la fila/evento que falló? ¿O lo traga para que el usuario vea éxito?
3. ¿Los upserts de repo lanzan cuando la fila afectada es 0, o dejan que dos caminos reporten éxito?
4. ¿El procesador distingue entre error de concurrencia (deadlock, serialización) y error de validación? ¿Reintenta el primero?
5. ¿Los handlers de API devuelven el identificador de la transacción fallida en el error, o un genérico `500` sin contexto?
6. ¿El código de deduplicación usa el `message_id` de WhatsApp o el efecto ya aplicado? ¿Qué pasa si un mismo viaje se liquida dos veces con distinto `message_id`?

Sin abrir esos archivos, no puedo afirmar que existen estos problemas ni que no existen. La nota 4 heredada significa exactamente eso: no hay evidencia de que esté roto ni de que esté sano.

## Nota metodológica

El prompt exige “nunca citar una línea que no leíste”. No leí ninguna. Cualquier hallazgo que escribiera con `archivo:línea` inventado sería descartado por el orquestador y envenenaría la auditoría. Prefiero un informe con cero hallazgos y la deuda declarada a un informe lleno de referencias falsas que el verificador tendría que cazar una por una.

La nota 4 no es un juicio sobre el código; es un juicio sobre el proceso: no hay pruebas que cubran los caminos de dinero, y esta ronda no pudo ni siquiera leerlos. Mientras eso siga así, backend no debería estar por encima de 4.