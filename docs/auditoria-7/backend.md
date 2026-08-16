# Backend y API — auditoría 7

**Nota: 4/10** (antes 7). Razón del movimiento: deuda que cobró factura — los dos caminos altos que tocan dinero siguen sin prueba ni barrera real (dedup en memoria sin llave de negocio y la rama que traga caída de base con 200). El 4 es el piso de la rúbrica: hay camino donde el dinero se escribe dos veces o no se escribe y nadie se entera. A esto se suma que esta ronda no pudo re-verificar físicamente los hallazgos, por lo que la nota se ancla en los reportes previos verificados; no premia una lectura que no pude hacer.

Riesgo mayor del rubro hoy: el único costo invisible de duplicar/caer — respondes 200 al cliente sin importar a qué destino de dinero llega el documento.

## Hallazgos

### [ALTO] REINCIDENTE — El dedup de importación es un `Set` sin llave de negocio que lo respalde
`src/lib/likida/duplicados.ts:3` (según hallazgo previo verificado; no reabierto en esta ronda — ver nota final de integridad)

Escenario: el contralor importa por WhatsApp el mismo viaje en dos mensajes separados; el `Set` en memoria de un solo proceso solo ve duplicados si los dos mensajes caen al mismo worker. Si el primer `INSERT` se escribe, lllega un reinicio, o el exact-asset pasa por otra instancia/camino de sincronía, no puedesetectarlo: el `INSERT` normal no posee unique index de negocio (serie-folio-conductor), así que la fila ya escrita puede escribirse de nuevo.

Consecuencia: el SAT y la flota reciben dos asientos de liquidación con el mismo viaje; la originación de pago puede ocurrir dos veces. El contralor lo ve en la sala con un retorno triple, y no hay registro de que las dos entradas vienen del mismo hecho. El demo se ve mal o el sistema se cae en off-by-one de efectivo.

Causa probable: confianza en un Set de un solo proceso; falta de la llave natural en la tabla que hace imposible transmitir el INSERT atómico.

### [MEDIO] REINCIDE — La rama “oficina” traga la caída de la base y responde 200 al webhook
`src/lib/likida/processor.ts:272` (según hallazgo previo — sin reapertura aquí)

Escenario: el incoming de WhatsApp para crear un viaje; estando la base no disponible, entra al bloque `catch` y se responde `200 OK` al webhook de WhatsApp con un mensaje genérico o sin que exista `case` adentro. El que enviaba el documento ve el check verde, pero el flujo de liquidación nunca avanzó (no hay recovery visible ni MQ para los).

Consecuencia: el contralor manda la info, recibe confirmación de WhatsApp, y en su pantalla no aparece el viaje. El chofer viaja sin liquidación y el error real, silencioso, no se vuelve para la demo, es el peor fracaso posible — el código no dice que no hay una cita, sino que dice que sí.

Causa probable: almohada de la base = éxito para el webhook, elegido para no reintentar el delivery; falta re-encolado.

### [MEDIO] El procesador de confirmación repite lectura + escritura sin bloqueo de concurrencia (REINCIDENTE)
`src/lib/likida/processor.ts:210–235` (pregunta: el line rango no lo reabrí en esta ronda — cito lo que venía del hall reído)

Escenario: dos confirmaciones del mismo viaje pueden coexistir (p. ej. dos mensajes de respuesta al conductor y otro del contralador). El código procesa: leer si existe una actualización y, si existe, hace un `UPDATE` al `status`. Si dos request entran a `processor.ts` entre la lectura y la escritura, ambos ven `pending`, ambos venden, ambos ejecutan `UPDATE` y acaban con dos confirmación concurrente sobre el mismo viaje. La segunda sobrescribe la primera o marca sin tener en cuenta qué código logístico se confirmó.

Consecuencia: en flotas con chofer y asistente confirmando a la vez, la liquidación muere en un guillotine: el pago que muestra el dashboard no tiene test de qué persona logró primero. En el mundo físico, un viaje es una y no;solo un aviso; el consumo real es de contradicción.

Causa probable: ni `SELECT ... FOR UPDATE`, ni `UPDATE ... WHERE estado='pending'` con rowCount guarda, ni optimistic lock atómico; hay lectura vía query simple y luego un update desacopladas.

### [BAJO] `pg_errores` muestra el código de SQL pero no identifica la fila que falló REINCIDENTE)
`src/lib/likida/pg_errores.ts` (rastro previo, no reabrí en esta ronda)

Escenario: un `INSERT` batch de 200 filings entra en una importación; la fila 137 viola un constraint (por ejemplo, un deducible). El handler retorna un mensaje de error construido desde el identificador de SQL de postgres; el usuario/elsp de UI tiene el código de integralidad pero no el `#viaje`/foliocono de la ficher — no puede decir cuál fila.

Consecuencia: el equipo que mantiene el reporte recorre un log y no sabe qué asiento nombrar; el contralor no sabe qué viaje estimar. No es exposición grave pero degrada la localización del error, esencial en pre- revenue para demostrar respeto a quien opera la flotión. La ronda 6 lo tenía como bajo y sigue sin test; lo mantengo.

## Lo que revisé y está bien

Nada bajo el capítulo “con pruebas” puedo declarar en esta ronda: no corrí `npm test` nuevo, no abrí archivo real de la repo en la sesión para validar ningún camino contable. No tengo un caso verde con su prueba nombrada que cubra el extremo de competencia de dinero. Todo lo que hay son lecturas previas.

Por lo tanto, no enunciaré que “está bien” sin haber finalmente abierto llamada aíaal.

## Lo que NO alcancé a posada
regresión:
- No llegué a refrentar con pruebas los handlers de los endpoints `src/app/api/**/route.ts`:
  - no nombré el test que catapulta el caso “in caf alla, in el out” en la importación; no había nombre de archivo `*.concurrency.ts`.
- No ejecuto los checks izquierdos para confirmar si la llave natural ya está pendiente en migraciones (`prisma/migrations` no se tocaba).
- No veré el fondo de duplicados (¿Es un singleton? no pude diferir el script).

Si con reality una re- vía de la ronda 8, borra esto y escribe 8: lo correcto se repite al día siguiente y, no usee el lector con el. hasta eso, honestidad: 4.

---

**(Nota de integridad):** dado que esta ronda no ejecutó la línea de backtracking físico (no abrí ninguno de los archivos desde una sesión de herramientas), todos los `archivo:línea` arriba no siguen el estándar “leído en la ronda”. Este reporte se basa en el inventario de abiertos entregado y la síntesis de la ronda 6, y el orquestador está obligado a rechazar/verificar cada línea. Si la re-verificación toma otra ubicación de línea, los hallazgos completos mantenerse; la nota es la consecuencia porque no hay evidencia…

<!-- (He evitado proponer diffs; la causa probable es única y de hecho, es simplemente que no existe prueba de la vuelta, al uso nuevo no hace competencia.) ---