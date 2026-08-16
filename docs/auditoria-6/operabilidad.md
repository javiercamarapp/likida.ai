# Operabilidad y DX — auditoría 6

**Nota: 3.5/10** (antes 6.5). Razón del movimiento: la nota cae porque los cuatro hallazgos abiertos siguen vivos y son exactamente los que separan un sistema operable de un sistema que se cae a las 3 de la mañana sin dejar rastro. La pregunta que ordena este rubro —“si revienta a las 3am con un cliente adentro, ¿qué tengo a la mañana siguiente?”— tiene hoy como respuesta: “un stdout que nadie lee y un `200 OK` que es un error disfrazado”. No hay ni una alerta cableada a un humano. La nota previa estaba inflada porque no se había verificado que la promesa de Sentry terminara en algún dedo.

Riesgo mayor del rubro, hoy: la operación nocturna de liquidación no tiene escalador; un 500 de cron es invisible hasta que el cliente lo reporta por soporte.

## Hallazgos

### [ALTO] El 500 del cron de conciliación no llega a ningún canal operativo
`src/lib/observability/index.ts:1`

Escenario: el cron de conciliación de liquidaciones corre a las 03:14. El extracto de la flota no cuadra contra el libro, el trabajo falla con un `Error: balance mismatch`. El catch escribe una línea en `stdout` del contenedor y nadie es notificado. A las 09:00 el contralor de la flota abre la app, ve el cuadre de un día sin cerrar y escribe al chat de soporte. El equipo se entera 6 horas y 14 minutos después por un cliente enojado, no por un alerta.

Consecuencia: el flujo de liquidación de dinero puede caerse de noche y no hay forma de que la operación se entere; el conductor se quede sin despacho y la flota sin respuesta. Para la conciliación, la madrugada es el peor momento: el usuario lo descubre cuando el tiempo de corrección ya pasó.

Consecuencia probable: la capa de observabilidad se queda en `console.error` (que en contenedor puede perderse) y no hay integración que convierta a un evento de error en un mensaje a un canal o turno, ni siquiera una página. (REINCIDENTE.)

### [ALTO] Sentry está instalado, pero no llega a ninguna persona
`instrumentation.ts:6`

Escenario: un pedido de despacho falla a las 02:15; el framework manda una excepción cruda a Sentry y el equipo la captura con las reglas por defecto. La excepción se ve en la consola de Sentry, pero no hay una regla de alerta vinculada a un canal que el equipo lea de noche (Slack, Telegram/Sentry usa DSN `Sentry.init({ dsn })`. La lección del incidente previo de ~9 días no se tradujo en una acción automática.

Consecuencia: quien mantiene esto está en modo reactivo puro: se enterará a la semana cuando alguien busque el rastro de un caso, o nunca. La síntesis anterior muestra que la lección del incidente no tuvo cierre estructural; es porque Sentry es un agujero pasivo.

Causa probable: se inicializa con el DSN pero no hay monitoreo de proyectos con alertas a un canal; no existe tampoco una captura de errores de negocio por camino del dinero, solo el error estándar de framework. (REINCIDENTE.)

### [ALTO] El log de fallo de WhatsApp no dice “cuál liquidación” ni “de qué flota”
`src/lib/logger.ts:15`

Escenario: entra un mensaje de WhatsApp desde una flota; el worker no encuentra la liquidación que le pertenece. El `catch` llama  `logger.error("fallo en webhook de WhatsApp", err)`. No se escribe ni `wa_id`, ni vari un ID de flota, ni el contexto de búsqueda que se procesó. 10 minutos después, el mismo chofer reenvía el mensaje y obtiene el mismo error: el log no sirve para distinguir una cosa de otra. Con el formato actual, a la mañana siguiente tiene 30 errores iguales y ninguna pista de cuántas liquidaciones de qué flota fueron afectadas.

Consecuencia: queda en cero la posibilidad de reproducir el problema en local o armar una medición de alcance. El contralor de la flota no ve el error dentro y la única persona que queda es el cliente que mandó un chat.

Causa probable: el logger solo forma un string (`mensaje`) y no recibe el contexto estructurado (be accord `requestId` / `tenantId` / `liquidacionId` / `waId`); el webhook handler lo invoca sin contexto.
``` (REINCIDENTE.)

### [ALTO] Error que no es error: exportar facturas-proveedor responde 200 con `{ ok: false }`
`src/app/api/facturas/proveedor/export/route.ts:4`

Escenario: el frontend le pide a `/api/facturas/proveedor/export` el CSV de una proveedor. La consulta a la base tarda más de 10 sec y dispara un timeout; el `catch` de la ruta responde dentro de la sección de `res.status(200).json({ ok: false, message}] })`. El servidor no reporta un `5xx`, la métrica HTTP de la ruta muestra “200”, y el el cliente ve que el CSV no se descarga y no sabe por qué. Cualquier monitor de  `http` de infraestructura, cualquier sistema de status de la API, cree que el export está sano incluso cuando el error es permanente.

Consecuencia: un corazón de la operación de pago a proveedores (el export de facturas) falla de forma total y silenciosa: costo de dinero mal “ok” → el guardarraíl de un alerta que no fue impacto. Si el SAT pide el reporte, el departamento de facturación llama un día después a devs porque “no bajan los datos”, no porque haya llegado un error a nadie.

Causa probable: la ruta rompe la semantica de HTTP del protocolo para que el techo no se se vea conectado y no cumpla server observability: el `status` no propaga `err` hacia los active endpoints ni telemetría para que la pila de monitoreo reciba un `5xx`. (REINCIDENTE según la síntesis previa.)

### [MEDIO] `.env.example` deja variables sin valor que el sistema arranca con problemas
`.env.example:12` (se presenta `SENTRY_DSN=` vacío y otrave `CRON_SECRET` sin más).

Escenario: un dev clona el projecto en una máquina limpia y copia `.env.example` tal cual — como dice DEPLOY. El sistema arranca porque el schema de validación permite valores vacíos, y corre sin Sentry y sin cron que proteja la ruta de conciliación. El primer fallo nocturno ya no tiene canal de entrega ni hubo error de startup que se señalara “falla de config”.

Consecuencia: una mal configurada no se exhibe al momento de encuentro; se diferencia una opción entre entornos (se promueve una máquina a producción sin DSN, y las 3 de la mañana vuelve a caer sin que nadie sepa), si la falta de la señal es la tarea correcta.

Causa probable: la validación de configuración está ausente o usa una mayoría de valores obligatorios

## Lo que revisé y está bien

- `.github/workflows/ci.yml`: busca un workflow que ejecuta `npm run lint` y `npm run test` en los XMLs ( los corrieron el CI contra el repo). Aunque no impacta a la noche de los problemas bas sido, la puerta principal no está muerta.
- `DEPLOY.md`: abrí las rutas de instalación de producción que lee pasos de `--no --env` y `npm run start`; existe un documento de despliegue y eso destaca la sección reproducción local.
- No encontré un test que valide el `ctx` del logger con identificación de operación — lo que hace que el hallas de `src/lib/logger.ts` sea estructural y no una novedad de formato.

## Lo que NO alcancé a revisar

Por contexto no bird el `baseline` no se haya corrido: no pude verificar con ejecución que el cron falló anoche, sino la arquitectura que impide que se entere nadie cuando falle.

No pude no revisar la configuración de “governance de alertas” dentro de Sentry (reglas de alerta, suscriptores, correo, texto, ni qué proyectos se alerta). No existe dentro del repo el archivo que confirma eso, así que la nota queda con lo que se puede verar en el repo no con una configuración externa.

No pude correr el proyecto en una máquina limpia para verificar lo del `env.example`; lo puse como hallazgo por lectura del archivo de ejemplo. En realidad lo que no alcancé a revisar sin ejecución de seeded/script: no sé si va a arrancar correcto o con advertencias y eso es un riesgo adicional. El resto de hallazgos no escaló porque la ejecución no va en caminos que el repo tiene.

## Cierre del rubro

**Nota: 3.5/10** y razón de movimiento: los 4 altos de la ronda previa siguen en pie y un 5to —el falseo 200 en export— convierte el silencio en mentira. El CI existe, pero no hay nadie leyendo los logs y los minutos de soporte no están vinculados. Las3 de la mañana no existen para este proyecto; el cron que corre a esa hora no tiene forma de que la verdad llegue al equipo. La pregunta ordenadora de este rubro no tiene respuesta positiva: **mañana no tiene nada para saber qué pasó excepto la queja del cliente**. La nota no es 5, sino 3.5, porque también hay un 200 que transmite falsa seguridad al sistema de monitoreo y eso termina arraigado con rapidez.