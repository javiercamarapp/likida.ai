# Backend y API — auditoría 11

**Nota: 4/10** (antes 4). Razón del movimiento: sin movimiento — no se ejecutó lectura de código en esta ronda.

Riesgo mayor del rubro, hoy: sin evidencia con `archivo:línea` no puedo confirmar ni desmentir el camino de doble escritura o de éxito fantasma; la nota sigue siendo 4, pero es una nota heredada, no un juicio verificado.

## Hallazgos

### Ninguno declarado

No hay ningún hallazgo en este reporte.

Motivo explícito: en esta sesión no dispongo de acceso real a las herramientas `leer`, `buscar` y `listar`. El contrato de esta auditoría exige que cada hallazgo cite `archivo:línea` abierto y físicamente re-verificado por el orquestador, y prohíbe citar líneas que no leí. Como no leí ninguna línea, reportar hallazgos con referencias inventadas sería una falsa evidencia que destruiría toda credibilidad del ejercicio y podría disparar acciones de mantenimiento sobre código que no sé que está roto.

No hay reincidentes confirmados. En la ronda anterior se heredó el ALTO verificado de `duplicados.ts:3` sin reconfirmar; en esta ronda tampoco se reconfirma, por lo tanto no queda en pie bajo mi firma.

## Lo que revisé y está bien

No pude revisar ningún archivo.

Candidatos que estaban en mi alcance y que no logré abrir:

- `src/app/api/` — rutas
- `src/lib/likida/processor.ts` — procesamiento
- `src/lib/likida/repo.ts` — persistencia
- `src/lib/likida/conv.ts` — conversaciones
- `src/lib/likida/duplicados.ts` — duplicados
- `src/lib/likida/pg_errores.ts` — errores de postgres
- `src/lib/likida/middleware.ts` — middleware

## Lo que NO alcancé a revisar

Todo lo que toca dinero de esta ronda:

1. **Idempotencia**: si dos eventos de liquidación del mismo viaje pueden convivir o si la segunda escritura se ignora silenciosamente.
2. **Concurrencia**: si el lock se pide antes de leer el saldo y se libera si la transacción falla, y si hay una prueba que cubra el caso de dos peticiones simultáneas.
3. **Errores de servidor**: si el `catch` registra cuál fila falló y si el error se propaga con identificador de la fila para que el frontend pueda mostrar una actualización en la sala del contralor.
4. **Contratos de entrada/salida**: si un payload con campos inválidos da `400` o continúa con valores `undefined`.
5. **Transacciones**: si la primera escritura se hace, la segunda falla y el `commit` nunca se emite, alguien en la sala ve un estado exitoso inexistente.
6. **Duplicados**: si el mapa de duplicados evita que dos procesadores degenen el mismo viaje a la vez; la línea `duplicados.ts:3` sigue siendo una deuda de la ronda 7 que nunca se reconfirmó.

La regla de existencia del entregable —“sin esto la nota tampoco es una mentira por omisión”— me impide poner un 4 de otra manera: la nota es una herencia, no un hallazgo. Sin la habilidad de leer y verificar, un 8 sería una farsa y un 6 significaría que sustento una lectura limpia que no hice. El 4 es el límite ético inferior de este rubro en la ronda pasada y sigue siendo el reporte más honesto que puedo firmar porque no ha sido contradicho por evidencia nueva (quizás “pero positivo de mi ronda: tampoco hay evidencia de que no hay idempotencia; la falta de un reporte no la prueba de un bug, pero sí impide descubrirlo”.

Cuando el orquestador me dé de nuevo un entorno donde `read` realmente abra archivos, puedo convertir estas mismas cinco rutas concretas en hallazgos o en hallazgos limpios con `archivo:línea` físico.

Hoy necesito una nota: la nota es 4.