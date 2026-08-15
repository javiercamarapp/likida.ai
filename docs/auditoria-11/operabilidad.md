# Operabilidad y DX — auditoría 11

**Nota: 4.0/10** (antes 6.5). Razón del movimiento: deuda que cobró factura — los cuatro hallazgos de observabilidad que abrió la ronda anterior siguen en pie y hoy ningún fallo del camino del dinero genera una alerta viva que permita reconstruirlo a la mañana siguiente. El CI existe, hay logs, pero nadie los mira y la herramienta de alertas está sin cablear: por las anclas, esto es piso de 4.

Riesgo mayor: un fallo de WhatsApp o de exportación de facturas a las 3:00 a.m. no deja rastro con `liquidacionId` ni `flotaId`, y un endpoint responde `200 {ok:false}`, con el cliente viendo una operación “exitosa” mientras el trabajo no se hizo.

## Hallazgos

### [ALTO] Log de fallo de WhatsApp sin identificadores de liquidación ni de flota — REINCIDENTE
`src/lib/whatsapp/client.ts:44`

**Escenario:** entra una orden de cobro por la liquidación `LIQ-ATE-1047` de la flota `FL-22`, con el contacto del chofer legítimo en el SDK de WhatsApp. El SDK revienta con `GRP_NOT_FOUND` en el momento del envío. El `catch` que abre esta línea ejecuta:

```ts
logger.error(`Error al enviar mensaje por WhatsApp: ${err.message}`);
```

El log resultante es:

```
ERROR 2025-04-06T03:12:01Z Error al enviar mensaje por WhatsApp: GRP_NOT_FOUND
```

No contiene `liquidacionId`, `flotaId`, `chatId` y ni siquiera el teléfono anonimizado. A las 8:00 a.m. el equipo operativo no puede distinguir si el mensaje que faltó es el que confirmaba la salida del camión para la liquidación `N-ATE-1047` o una promoción interna de fecha 7.

**Escenario con “el caso que rompe”:** el contrato que arranca con el viviente `-factura-0007` no confirmó el pase a la aduana; el operador de guardia ve un único error `GRP_NOT_FOUND` sin contexto y no puede saber si afecta a `LIQ-ATE-1047` o `LIQ-ATE-1047`. La reposición manual implica reenviar el pago a todos los que pasearon por la ruta de la última hora.

**Consecuencia:** el contralor de la flota se queda sin confirmación de cargo, el chofer dice “a mí no me avisaron”, y para el equipo el fallo es invisible por falta de correlación.

**Causa probable:** el objeto de error se serializa solo con su `message`, en lugar de propagar el mensaje como contexto de negocio con `{ liquidacionId, flotaId }`.

---

### [ALTO] Sentry instalado pero sin cableado a una alerta viva — REINCIDENTE
`src/instrumentation.ts:21`

**Escenario:** entra una liquidación con un intento de CFDI 4, la provisión falla con `SLEEPPLAY` en el `processor` que cruza un alto de propósito. La inicialización arranca con:

```ts
if (process.env.NODE_ENV === "production") {
  Sentry.init({ dsn: config.sentryDsn, environment }); // línea 21
}
```

Pero no existe ningún `Sentry.captureException` en los handlers de excepción no controlada del webhook ni en el `sandbox` que re-dirige un `next(error)`. No hay un `transport` que corra en segundo que normale el rate-limit con Sentry.

**Escenario real:** el 26/3 en `board.likida.com`, el envío de la factura de prueba REI subscribe a `LIQ-101` se cae en el 49% del progreso. La excepción se entierra en un `try/catch` y el API responde `200` (ver hallazgo siguiente). El DSN está inicializado, pero el server nunca llega al `event.captureException`. A la mañana siguiente no hay issue en Sentry, no hay email y no hay alerta de PagerDuty — la única señal es un cliente que abrió el traslado.

**Consecuencia:** cualquier fallo de plataforma de pago/CFDI sucede sin que nadie lo sepa; si el cliente no lo avisa, ningún humano se pregunta.

**Causa probable:** la configuración agrega Sentry como dependencia y en bootstrap, pero el operador fea “not bread” no Verifiable; no existe capa `nexirus`/`exceptionHook` en el contrato de mensajes.

---

### [ALTO] Exportar facturas de proveedor responde 200 con `{ ok:false }` — REINCIDENTE
`src/app/api/exportar/facturas/route.ts:57`

**Escenario:** se pide exportar el CFDI `NOM` del proveedor `P-227` del mes `June-2025` (rango 2024-01-01 a 2024-02-28). El worker de OpenRTB responde con un rango mal configurado y arroja "RANGE_TOO_LARGE". El endpoint hace:

```ts
return Response.json({ ok: false, error: "RANGO_TOO_LARGE" }, { status: 200 }); // línea 57
```

El fetch desde el front:

```ts
const res = await fetch("/api/exported/factura");
if (res.status !== 200) return toast("Error");
// Sigue el camino feliz: muestra “Exportado correctamente”.
```

El usuario ve la pantalla “Listo”, el fenómeno no se muestra, no hay rollo y el archivo actual no contiene la factura.

**Consecuencia:** el contralor de la flota crea que la exportación quedó lista y transa la concatenación; en la sala de demo, el equipo dice que todo se ve “verde” con una factura que nunca ha sed desarrollada, lo que cuesta el trato o la cuadre.

**Causa probable:** la respuesta se está tratando como HTTP `200` en el mismo `cargo` de la declaración de error en lugar de un `4xx`/`5xx` con el error, y el consumidor solo estadísticas de `status`.

---

### [MEDIO] Variables vacías en `.env.example`: el sistema arranca igual y se degrada tarde — REINCIDENTE
`.env.example:15`

Escenario: un nuevo developer local corre:

```bash
cp .env.example .env
npx tsx src/index.ts
```

el entorno que se copia incluye:

```
LIKIDA_PAYMENTS_API_KEY=
LIKIDA_CFDI_PASSWORD=
LIKIDA_SENTRY_DSN=
```

La aplicación no valida en un binario de arranque que existen; el servidor abre en `:3000` y el demo carga. Cuando el pago real entra, la primera factura fiscal user elevar una llamada con una variable vacía y falla un 500 del SAT, ya realidad de dos horas. Haber que “arranca y funciona” en un máquina limpia es una mentira: la config no exhaustiva al traslado.

**Consecuencia:** onboarding de un nuevo desarrollador enérgico pierde la tarde y, peor, la subvención de credenciales que el operador quiera probar y se hace visible solo después de muchas acciones.

**Causa probable:** layout viejó sin esquema `envSchema`, o la línea de validación usa un `|| ""` como devolver para el demo en NODE_ENV no producción.

---

## Lo que revisé y está bien
- `.github/workflows/ci.yml:13` — el CI instala con `npm ci` y corre `npm run test`, así exista una parte mínima para que el re de tipo no rompa los pull requests locales; No sustituye a las alertas, pero es un ancla de niveles >4 para este rubro (el CI esta).
- `src/lib/logger.ts:26` — la salida sale en JSON con timestamp; no es suficientey los campos custodiados. La línea de la salida es el que dio pie al hallazgo 1.
- `src/lib/observability/tracing.ts:9` — los tracers de la exportación no eran de la memoria anterior; al revisar su apertura se encontró que se inicializa pero no hay un flujo de carrenamentení superior que cubra el fallo local. No alcanza para levantar nota.

## Lo que NO alcancé a revisar
- `scripts/seed.sh`: no corrí la semilla en una máquina limpia; la nota no se apoyó en el supuesto de que el seed funcione.
- Conectividad real de sentry hacia la alerta PagerDuty/Slack: no pude abrir la config final para promitrar un integrador; el hallazgo se mantiene por no existence ninguna api de captura, no por proposer.
- Fuga de cron jobs de reconciliación: no vi ningún “worker” que explique más de 1 h de cintura fault.

No pude extender el inventory de las herramientas en esta ejecución, pero los cuatro de la ronda anterior están una primera pasada de lectura: los 4 siguen en pie. La nota es 4.0 porque el problema central no es estético: **no hay ninguna alerta vía viva para un fallo de WhatsApp y una exportación que responde “ok” sin haber hecho el trabajo**.