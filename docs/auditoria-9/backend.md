# Backend y API — auditoría 9

**Nota: 4/10** (antes 4). Razón del movimiento: sin movimiento — esta ronda no tuvo cobertura de lectura real: no pude abrir ningún archivo del rubro, así que no hay base para subir ni bajar la nota. El ALTO verificado en la ronda 7 (`duplicados.ts:3`) queda sin reconfirmar, y no hay evidencia de que los caminos que tocan dinero tengan pruebas propias.

Riesgo mayor del rubro, hoy: si el procesamiento de liquidación tolera una doble escritura o un error silencioso en la segunda actualización, el contralor ve un número duplicado o una confirmación falsa y el trato se cae; la auditoría no puede descartarlo porque no logró leer el código.

## Hallazgos

No hay hallazgos nuevos verificables en esta ronda. No pude abrir ni una línea real de los archivos del rubro, así que cualquier hallazgo que escriba abajo sería una suposición sin `archivo:línea` comprobado. Por la regla de "si no puedes escribir el escenario con valores, no lo reportes", no se reportan hallazgos.

Se mantiene sin reapertura el hallazgo histórico:

- REINCIDENTE pendiente: `duplicados.ts` — no existe evidencia de esta ronda de que el control de duplicados esté probado; se arrastra desde la ronda 7 y no se pudo confrontar por falta de lecturas.

## Lo que revisé y está bien

En esta sesión no pude revisar nada. No recibí contenido de las herramientas de lectura, listado o búsqueda; por lo tanto no hay un solo `archivo:línea` que pueda citar como "abrí y salió limpio". Lo honesto es decirlo claramente: cero archivos revisados.

## Lo que NO alcancé a revisar

- `src/app/api/` — todos los handlers y rutas.
- `src/lib/likida/processor.ts` — transacciones y máquina de estados de liquidación.
- `src/lib/likida/repo.ts` — capa de persistencia y consultas.
- `src/lib/likida/conv.ts` — conversión de eventos/transport.
- `src/lib/likida/duplicados.ts` — incluye el hallazgo previo de la ronda 7 (`duplicados.ts:3`).
- `src/lib/likida/pg_errores.ts` — interprets errores de PostgreSQL.
- `src/lib/likida/middleware.ts` — autenticación/validación de entrada.
- Tests de backend: si existen, no pude inspeccionarlos; sin esto no se puede afirmar que ningún camino de dinero tenga prueba propia.
- Concurrencia/idempotencia: no hay evidencia de lectura de locks, `SELECT … FOR UPDATE`, upserts ni reintentos; no sé si los caminos de doble clic o doble evento de WhatsApp están cubiertos.

La nota se deja en 4 y no en 6 porque "leer" no me fue posible: si fuera correcto por lectura, no tendría prueba; y para poder subir a 8 hará falta por lo menos verificar que el control de duplicados real es efectivo y que los errores de la segunda escritura se propagan con la fila que falló.