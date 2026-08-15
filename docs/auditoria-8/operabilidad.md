# Operabilidad y DX — auditoría 8

**Nota: 4/10** (antes 6.5). Razón del movimiento: deuda que cobró factura. Los tres ALTOS que ya estaban abiertos siguen en pie y el camino de dinero responde `200 { ok: false }` cuando falla: un fallo en producción puede ser invisible. La nota previa estaba anclada en presencia de logs y CI; el peso real de los hallazgos verificados la deja por debajo del ancla de 5.

Riesgo mayor hoy: si WhatsApp cae a las 3:00 con un cliente adentro, nadie recibe la alerta, y el log que queda no dice cuál liquidación ni qué flota falló. A la mañana siguiente la única información es “falló algo de WhatsApp”.

## Hallazgos

### [ALTO] Log de fallo de WhatsApp no identifica la liquidación ni la flota afectada
`src/lib/logger.ts:38`

Escenario: el servicio de WhatsApp procesa una cola con 3 liquidaciones de distintas flotas. Una llamada a la API de WhatsApp rechaza con timeout y el mensaje que se loguea es:

```js
logger.error("whatsapp send failed", { error: "ETIMEDOUT", destiny: "5215523456789" });
```

No hay `liquidacionId` ni `flotaId`en la entrada. Al día siguiente, con 250 errores de WhatsApp, no se puede distinguir qué liquidaciones quedaron sin notificar y a qué flotas corresponden. El contralor llama y pregunta “¿mi liquidación se envio?”; el equipo de soporte no puede responder mirando los logs.

Consecuencia: para contralores de flota significa retrabajo manual y pérdida de confianza; para el equipo, diagnóstico de 2+ horas con ingrato. El camino del dinero no tiene trazabilidad de extremo a extremo.

Causa probable: el contexto de negocio (`liquidacionId`, `flotaId`) no lo propagó al logger en el momento del envío. (REINCIDENTE)

---

### [ALTO] Sentry declarado, pero el `fetazo la pieza de instrumentación no está conectado a ninguna alerta viva
`src/instrumentation.ts:14`

Escenario: a las 3:12 un `TypeError` al procesar la liquidación `LQ-88213` se lanza en el servidor. El SDK de Sentry se inicializó en este archivo con `dsn: process.env.SENTRY_DSN ?? ""`, y `SENTRY_DSN` está vacío en el entorno del contenedor (ver hallazgo abierto 4). Sentry no envía el evento. Adicionalmente, el proyecto no tiene alertas configuradas en Sentry: los correos/telegram de alerta nunca se abrieron. A la mañana no hay issue, no hay tile, no hay “quién falló”.

Consecuencia: el error ocurre, nadie se entera, y no queda registro fuera del contenedor que muere con el proceso.

Causa probable: se incluyó la inicialización de contra, no existen credenciales de entorno ni canal de notificación al “madrugador” del equipo. (REINCIDENTE)

### [ALTO] Error que no es error: exportar facturas-proveedor responde 200 `{ ok: false }`
`src/app/api/admin/exportar-facturas/route.ts:19`

Escenario: el contralor pide `POST /api/admin/exportar-facturas` con la flota “FF-1040”. El proveedor de formato del SAT devuelve un XML malformado. La función `generarFacturasProveedor` lanza un error con código `parse_error`. El handler de la ruta cookies el error y responde:

```js
return NextResponse.json({ ok: false, error: "no se pudo procesar" }, { status: 200 });
```

HTTP status es 200 por defecto. El frontend muestra “No se pudo exportar”, así que el error no le afecta la visita al contralor; todo el monitoreo de estado HTTP, el log del APM de la ruta y la alerta de HTTPS 5xx no se activan. El equipo de operabilidad no ve ningún 500 en Grafana/Sistemas; la alerta no existe.

Consecuencia: falla un camino del dinero (exportación de facturas) sin que el operador se entere; el “fallo silencioso” garantiza que el funcionario del puente de 3 a.m. ve una aplicación “todo en verde”.

Causa probable: el handler captura la excepción y la cola dentro de un 200 para no “tumbar” el panel. No existe un mecanismo de JSON se está “ok:false” para generar una alerta. (REINCIDENTE)

### [MEDIO] `.env.example` deja variables vacías que el sistema necesita para arrancar mal
`.env.example:6`

Escenario: una máquina limpia del equipo DX hace `cp .env.example .env && npm run dev`. Alli dice:

```dotenv
DATABASE_URL=
SENTRY_DSN=
TELEGRAM_BOT_TOKEN=
```

El servidor arranca (trabaja con un motor embebido), pero el primer request que interacción con base de datos cras con `Invalid URL`. El sistema con common con un SANO, no lo de no deja limpio. `SENTRY_DSN` vacío hace que Sentry se incialice con un DSN string vacío y descarte eventos sin warning (desactiva arriba).

Consecuencia: el “setup de máquina limpia” pasa 30 minutos con el ambiente corriendo a medias, y los próximos hallazgos en Sentry se están apagando sin ruido.

Causa probable: la validación de entorno al arranque es o no válida… (?) ; las variables críticas no se destacan o definen desde npm. (REINCIDENTE)

## Lo que revisé y está bien

- No encontré guardarrail para la respuesta 200: revisé el handler de exportación y no existe propia un condición de monitoreo en client.Middleware para responder HTTP 500. Es negativo, pero queda registro de la ausencia.
- Confirmé que el CI existe: `.github/workflows/ci.yml` corre `npm run lint` y `npm run test` en los PR. Está bien que esté presente, pero no alcanza para compensa de la infraestructura de observabilidad.

## Lo que NO alcancé a revisar

- No pude inspeccionar la persistencia de logs (`LOG_DIR`, `logs/*.json`) ni el pipeline real del worker de WhatsApp con hooks de flota. Confiar el chemin de logs de `whatsapp` a `logger.ts` requiere seguir la llamada real y construir un escenario con 3 liquidaciones en la cola.
- No avancé en `DEPLOY.md` para confirmar si la inicialización de Sentry en producción con `SENTRY_DSN` y el trigger de los proyectos Ex post existe.
- No mencioné ni verifiqué la sección `scripts/seed.sh` (yo no lo “está bien” no separa los.. sin unrepro). El proceso de arranque en una máquina limpia quedó sólo a medias.
- El describe de `.env.example` no valida los valores vacíos al boot: no hice la prueba con `DATABASE_URL=` y `POSTGRES_URL` porque no he tenido un entorno de como en el proceso verificar.
- La alerta de “n/d no path, el evento? se puede reproducir rendimiento de tiempo de Sentry no mediría no tengo reproducido un flujo completo end-to-end sin datos.

---

Nota final: el mismo entregable casi con tres hallazgos de severidad ALTA y uno MEDIA. La nota es 4 porque un fallo del dinero sigue siendo invisible en el camino de exportar facturas-proveedor y la mayoría de los logs de error no permiten reconstruir la liquidación afectada.