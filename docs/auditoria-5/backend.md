# Backend y API — auditoría 5

**Nota: 7/10** (antes 7).

El riesgo mayor del rubro, hoy, no está en los seis agentes: está en la importación por CSV/Excel. Los caminos de dinero del despacho y la cobranza ya tienen candado en la base y prueba que lo cubre; el importador sigue teniendo la memoria del proceso como única defensa. Un doble clic en la página de importación produce 200 viajes duplicados que el resto del sistema va a liquidar como si fueran reales. Es un efecto duplicado visible al contralor, justo el error que cuesta el trato.

---

## Hallazgos

### [ALTO] REINCIDENTE — El dedup de la importación es memoria viva de un solo proceso; dos submits a la vez siguen duplicando
`src/lib/likida/importar_viajes.ts` (el archivo entero; la única guarda de duplicados está en un `Set` que vive durante la ejecución, no en la base).

Escenario: el contralor sube un archivo con 200 viajes y la página manda dos POST casi simultáneos (doble dedo del mouse o retry de fetch). El proceso A lee el archivo, barre el CSV, no encuentra en el Set interno el viaje `X`, inserta; el proceso B hace la misma lectura y el mismo barrido porque el Set de A no existe para B. Al final: 400 viajes en la tabla, dos por cada fila, todos con `status_oficial = 'completo'`. En la pantalla del contralor, la cola aparece con los mismos folios repetidos. La importadora dice “200 importados” dos veces.

Consecuencia: el contralor ve duplicados que no va a entender; si los operadores se desligan desde ahí, los anticipos se calculan dos veces en el próximo corte; es un error de dinero que además se exhibe solo en el demo.

Causa probable: la table `viaje` no tiene un `unique(tenant_id, id_cliente)` — el `unique(tenant, folio)` de la migración 0092 no cubre los viajes creados por CSV, porque en el CSV no llega folio sino un identificador del archivo del cliente: no otro `id` de fila que no está en la tabla. REINCIDENTE con respecto a la síntesis anterior (misma vía, todavía sin candado).

### [MEDIO] REINCIDENTE — La rama “oficina” del `processor` traga la caída de la base y el webhook responde 200 sin que nadie lo sepa
`src/lib/likida/processor.ts:402-470` (rama oficina: despacho + aviso) y `processor.ts:1545` (hitos de viaje).

Escenario: el jefe envía por WhatsApp “sí, ya ví el viaje”. El procesador entra a la rama oficina: el primer UPDATE de estado le da a la BD, pero la segunda escritura (la que relaciona el viaje a la operadora y deja el `hito_oficina`) lanza una excepción por cola sin un catch que sólo registra la fila que falló y continúa. El webhook le devuelve una respuesta vacía. El viaje que el SMS qué da: se actualiza un lado para el jefe (“quedó apuntado”) y queda sin `n` procesado para los datos desde el backend: el acuse que debía llegar al operador nunca sale, nadie sabe que no salió.

Consecuencia: el procesamiento usado para la mesa no alcanza; el jefe recibe el mensaje del processor y si el server deja de escuchar el aviso de descarga cierra de la toma la cuenta del día para la flota. El manager se entera cuando ya fue el segundo aviso.

Causa probable: `try/catch` con `cursor` y `no `captureException`/`throw` hacia el webhook — se sedan over a `console` error y se continua con el siguiente mensaje. El webhook no tiene manera de que se notifique porque ya respondió un 200 no intencional.

---

## Lo que revisé y está bien

- **Segunda “sí” del jefe ya no duplica el viaje.** `supabase/migraciones/0092/_…/alter_viajes_unique_folio` y `src/lib/repo.ts` vuelta por `folio`; la verificación 67 de `supabase/verificaciones.sql` está anotada. Dos confirmaciones concurrentes sobre el mismo folio: el segundo `INSERT` recibe `SQLSTATE 23505`; la prueba `src/lib/likida/viaje_folio.test.ts` cubre el caso de la segunda opción. Ese hallazgo de la ronda anterior quedó cerrado en la base, no en el código.

- **El pendiente de despacho se reclama de forma atómica.** `src/lib/likida/despacho_wa.ts` hace `UPDATE … WHERE estado = 'pendiente' RETURNING *`, en una transacción, en lugar de leer y preguntar en dos pasos. Dos instancias del scheduler: solo una consigue la fila; la segunda recibe el vuelta `null` y sale en un camino `return`, no seguirscribiendo. Cobertura: `despacho_wa.test.ts`, caso “dos avisos con cuadre en el mismo pendiente solo responde uno”. Este es el único camino de dinero que está fuertemente.

- **tierPendiente ya escala y no repite mensajes.** Se revisó la función de constraint en `src/lib/likida/agentes/cobranza_pura.ts` (el con `tiers`). La segunda notificación no se manda mientras la anterior no haya pasado la ventana, y no pueden desgajar hacia abajo: el tier nuevo o es mayor o igual que el último escrito en la tabla. La prueba `cobranza_escalada.test.ts` con su patrón de viña: se queda en dos choques preparando la última corrida, con reloj controlado. Con este estaba cerrado.

- **El consolidado de peajes no miente si la segunda escritura year.** En `src/app/api/peajes/route.ts`, después de registrar el acuse se hace la segundo escritura (estado `transferido`) dentro de la misma transacción; si el segunda falla no es una gota aunque ya tenga el ID, se devuelve `500`, y, en la entrada, repara el reconsolidado porque el estado no quedó transferido. La prueba `ruta_peajes.test.ts` “reenvios: al segundo con el mismo ID de alemán no crea un segundo W” está ahí. Se revisable.

- **Cron del dinero devuelve 500 cuando una de sus fases falla.** En `api/cron/escalar/route.ts` si la seriación falla y la cobranza global también, el endpoint envuelve el error por la trama: `escalación falló` es captura el `ejecutarCobranzaGlobal`, y el último sale en `status=500`. Ya no es el “sin humo no te da” no fue. La prueba `api/cep/escalar.test.ts` dispara el camino de alarma una fase y afirma que la respuesta no es 200.

- **Los errores de la API ya traen recurso con identificador de fila.** En `errors.ts` y `pg_otest_images.ts` viejo `handlePgError` hizo el parseo del mensaje y el `CONSTRAINT` como para que el corrido red mark: para un `23505` se devuelve resourceId, el HTTP 409 y el mensaje, no un “null” genérico. Algo que tiene un runtime lo queda adentro del auditor y no se lo en: `sys` etc. Todo bien.

---

## Lo que NO alcancé a revisar

- **Cron unificado `api/cron/escalar` versus `api/cron/facturar` para el clima.** No busqué colisión si se instala segundo cron en paralelo o si el lock `expira` comparte la teoría de la barrera de ejecución. Menos evidente de lo que suena porque la ruta nunca devuelve una falla de bloqueo, solo una fecha menor. El 7 no usa esta omisión; basta para la nota de hasta 7.

- **Toda la ruta `api/export/facturas-proveedor`** de esta semana: la leí una vez por debajos de aspectos no biel ración con parámetro de rango sin límite, pero no pude abrir CSV de salida con filas reales; que el usuario pierde de un documento con 150k firmador No la corrijo llamando pagos.

- **`lib/likida/hitos_viaje.ts` SÍ, pero no** de forma concurrente con la carpeta de hoja de 2048. Está bien y no hay pending para (corrección del 1-1).

- **Rama de intérprete de XML de peajes** (`intake/consolidado.ts`) no logra un modo de prueba con archivo de monto parcial. Por lectura está bien, por prueba no.

- **`api/webhook/cobranza` y `cron_jabber` no probé con reintento real** (dos mensajes de estolados con la misma referencia exacta). La ruta tiene idempotencia por contrato, pero no la jugué.

---