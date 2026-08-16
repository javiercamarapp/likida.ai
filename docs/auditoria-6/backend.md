# Backend y API — auditoría 6

**Nota: 4/10** (antes 7). Razón del movimiento: la deuda que cobró factura. El dedup de importación sigue siendo memoria viva y la rama “oficina” sigue tragándose la caída de la base; con eso existe al menos un camino real donde el dinero se escribe dos veces o no se escribe y nadie se entera. La nota previa estaba inflada por lectura favorable, no por prueba.

Riesgo mayor, hoy: una importación de CSV confirmada por el contralor se puede duplicar si dos _submits_ llegan a la misma instancia, y un error de conexión a Postgres en el flujo de “oficina” puede responder 200 sin ninguna instrucción persistida.

## Hallazgos

### [ALTO] REINCIDENTE — El dedup de importación es un `Set` en memoria, y el `INSERT` no tiene llave de negocio que lo respalde
`src/lib/likida/duplicados.ts:3` (declaración del `Set` global)  
`src/lib/likida/repo.ts:157` (`INSERT INTO viajes` dentro de la importación)

Escenario: entra dos veces el mismo archivo, en paralelo, desde dos flotas que comparten el mismo operador (o la misma petición reintentada por el cliente).

- El hash SHA-256 de cada línea es idéntico: `2025-DES-01473`.
- Proceso A entra a `esDuplicado()`, no encuentra el hash en el `Set`, lo agrega e inicia `INSERT`.
- Proceso B entra al mismo tiempo, no ve el hash (el `Set` es de un solo proceso y además puede ser un worker distinto), ejecuta la misma transacción y el `INSERT` no tiene `UNIQUE(viaje_id, manifiesto_hash)`.
- Ambos contestan `200 OK`.
- El cuadre del despacho reporta el viaje dos veces: se cotiza, se descarga y el contralor arma en pantalla una tarifa de $7,200 donde la del cliente era de $3,600.

Consecuencia: dinero escrito dos veces (viaje sumado dos veces), sin que ningún proceso lo marque. Si esto es en demo frente al contralor, el trato se cae.

Causa probable: se puso la barrera en una variable en memoria en lugar de un `UNIQUE`/`ON CONFLICT` en la tabla, y no se probó ni con dos procesos ni con reintentos.

### [MEDIO] REINCIDIDO — La rama “oficina” traga la caída de la base y responde 200 al webhook
`src/lib/likida/processor.ts:272` (catch de la rama “oficina” a 274-276)

Escenario: llega la confirmación de despacho “oficina”.

- `inserta_instruccion()` lanza `ECONNREFUSED`.
- El `catch` imprime `console.warn` y hace `return next()` con un `ok`, sin propagar el error.
- El webhook responde `200` al proveedor de WhatsApp.
- No hay ninguna fila nueva en `instruccion`, no hay instrucción, no hay cambio de estado.
- Elixir: El operador escribe el mensaje siguiente “¿ya?”, y el mensaje se ve engañosamente como entregada.

Consecuencia: el contralor cree que se ordenó y no se ordenó, la flota pierde tiempo/combustible y el error no aparece en el listado de alertas.

Causa probable: falta un `throw` o una respuesta 5xx en el camino de errores, y no hay test que verifique que el webhook devuelve error cuando la base falla.

### [MEDIO] El procesador de confirmación repite lectura + escritura sin bloqueo de concurrencia
`src/lib/likida/processor.ts:311-317` (SELECT de confirmación y UPDATE posterior sin `FOR UPDATE`)

Escenario: el conductor confirma “llegué” desde WhatsApp; dos reintentos del propio proveedor se ejecutan con diferencia de 50 ms.

- Consulta 1: `estado = 'en_transito'`.
- Consulta 2: `estado = 'en_transito'`.
- Update 1: `estado = 'entregado'`.
- Update 2: `estado = 'entregado'`.
- Ambos responden `200` y se emiten dos eventos de “llegada” al despacho.

El segundo UPDATE no rompe nada porque es idempotente, pero el evento duplicado sí le llega al chat del contralor como dos confirmaciones y la cámara de pagos puede registrar dos eventos de entrega del mismo viaje.

Consecuencia: indeces y reportes de cobranza con doble conteo.

Causa probable: chequeo o estado y escritura sin `SELECT ... FOR UPDATE` y sin _handler_ de mensaje ya procesado.

### [BAJO] `pg_errores` muestra el código de SQL, pero no identifica la fila que falló
`src/lib/likida/pg_errores.ts:27`

Escenario: importador de 112 viajes, la fila 64 tiene `fecha_salida = NULL`; PostgreSQL rechaza la violación de not null.

- El log: “Violación de restricción not_null” con la constante de `err.code` Postgres y un mensaje genérico.
- No incluye el índice de la fila del CSV ni el identificador del viaje: no queda claro cuál fue la fila problemática.

Consecuencia: un simple lote de 112 filas se vuelve un proceso de abrir el código y adivinar la fila, cuando el error pertenece al mundo del implementador.

Causa probable: el parser se traduce el `code` del driver y descarta el `detail`/`context` que trae el nombre de la restricción y los metadatos de la fila.

## Lo que revisé y está bien

- `src/lib/likida/repo.ts:82-88`: la ruta básica de creación de un viaje tiene `BEGIN` y `ROLLBACK` en el `catch`, no deja la fila a medio estado cuando la tabla es local.
- `src/app/api/viajes/route.ts:29-34`: rechaza el cuerpo no JSON con `415` antes de tocar la base. Buen contrato de entrada.
- `src/app/api/webhook/route.ts:15`: valida la firma del proveedor y no llama más allá si no pasa la verificación.

## Lo que NO alcancé a revisar

No está disponible el baseline real de esta ronda y no pude ejecutar los test de concurrencia. Lo que sigue no fue verificado en repositorio:

- `src/lib/likida/conv.ts`: lógica de conversación de estados del operador: puede filtrar “verificaciones pendientes”.
- La transacción de CFDI: no alcancé a leer el código que coincidiza el `tim`-pago con el SAT.
- La conexión entre Postgres y el middleware de reintentos del webhook: no sé si éste ya reintenta o lo dobla.
- No hay listado de tests para autentificar el escenario duplicado: si existe un `.test.ts`, no está marcado en la ruta de backend de la ronda.

Si la nota fuera solo “correcto por lectura”, sería 6; pero el escenario que pone demasiado vivos es el doble y causal, y lo que voy a la ancla: “un camino donde el dinero se escribe dos veces” → 4. Hay que cerrarlo con la prueba de concurrencia y mover la nota allá.