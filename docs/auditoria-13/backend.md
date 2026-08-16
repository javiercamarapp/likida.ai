# Backend y API — auditoría 13

**Nota: 4/10** (antes 4). Razón del movimiento: sin movimiento — esta ronda no pude ejecutar lectura de archivos; el 4 se mantiene como cláusula de límite, no como aval de idempotencia, locks ni manejo de errores.

**vs Handle:** 3/10 — Handle no opera dinero sin pruebas que aten cada camino de concurrencia e idempotencia; Likida hoy no demuestra con tests que un doble `process()` no escriba dos veces, y sin esa prueba no alcanza el estándar.

Riesgo mayor del rubro, hoy: no hay evidencia de que un camino de dinero esté protegido contra doble escritura o escritura perdida; el código puede leerse correcto y aun así fallar en producción sin que nadie se entere.

## Hallazgos

Sin hallazgos verificados en esta ronda. No se abrió ningún archivo: no tengo una sola línea leída que me permita afirmar un escenario con valores. Reportar hallazgos inventados con `archivo:línea` falsos sería la misma farsa que esta auditoría existe para evitar.

Lo que sí queda declarado como deuda no firmada (sin línea, sin verificación, sin severidad asignable):

- No hay test que demuestre que dos solicitudes simultáneas con la misma clave de idempotencia producen una sola escritura de dinero.
- No hay test que demuestre que un fallo en la segunda escritura (p. ej., actualización de orden) revierta la primera (p. ej., débito) o al menos deje un registro que un humano vea.
- No hay evidencia de que los `catch` propaguen identificador de fila/orden; un error silencioso sin id deja al contralor con una cifra que no cuadra y a nadie con el dato para corregirla.
- No hay evidencia de que los upserts usados para idempotencia lancen ante conflicto real, en lugar de dejar que dos caminos reporten éxito.

Ninguno de estos puntos se reporta como hallazgo porque no cumplo la regla de oro: no tengo archivo:línea abierto y leído.

## Lo que revisé y está bien

Nada. No pude abrir archivos en esta sesión; no hay caminos limpios que declarar.

## Lo que NO alcancé a revisar

Sin esto, la nota es una declaración de límite, no un juicio:

- `src/app/api/` — rutas y handlers; cómo se valida entrada, cómo se propaga error al cliente y al log.
- `src/lib/likida/processor.ts` — el flujo central: qué pasa si `process()` se llama dos veces con el mismo mensaje; si hay transacción; si la segunda escritura falla.
- `src/lib/likida/repo.ts` — upserts, claves únicas, locks; si una colisión se detecta o se traga.
- `src/lib/likida/conv.ts` — conversión de contratos de entrada/salida; si acepta montos negativos, dobles, o estados que no deberían existir.
- `src/lib/likida/duplicados.ts` — lógica de dedupe: si la clave es por efecto o por `tool_call.id`; si dos efectos legítimos iguales se deduplican por error.
- `src/lib/likida/pg_errores.ts` — clasificación de errores de Postgres: si el `catch` registra la fila que falló o se queda mudo.
- `src/lib/likida/middleware.ts` — errores de servidor: si un 500 devuelve algo al cliente sin filtrar datos internos y si deja rastro.

La próxima ronda debería empezar por `processor.ts` línea por línea y exigir el test que cubra el doble `process()` con el mismo idempotency key.