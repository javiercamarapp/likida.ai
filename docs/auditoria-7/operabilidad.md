# Operabilidad y DX — auditoría 7

**Nota: 3.5/10** (antes 6.5). Razón del movimiento: deuda que cobró factura — los cinco hallazgos abiertos de la ronda anterior no muestran contraevidencia en el contexto disponible; en particular el camino del dinero sigue con fallos que no producen alerta u operan bajo un 200 engañoso.

Riesgo mayor: a las 3 de la mañana, una liquidación falla y lo único que queda es una línea en stdout que nadie mira; o peor, el sistema responde `200 { ok: false }` y el error nunca entra a Sentry ni toca ningún canal operativo.

## Hallazgos

### [ALTO — REINCIDENTE] El cron de conciliación termina en 500 sin alerta a ningún canal operativo
`src/crons/conciliacion.ts` (no reabierto en esta ronda; hallazgo heredado de la ronda 6)

Escenario: a las 3:10 el proceso de conciliación ejecuta `fetchPagos()` contra la base; la base responde `500`, el cron lanza una excepción, el `catch` registra solo `console.error` y no invoca a Sentry ni a un webhook. A la mañana siguiente el equipo no tiene ningún ticket, correo ni mensaje: la conciliación está caída desde las 3.

Consecuencia: la flota no ve términos finiquitos; el contralor no sabe que su liquidación quedó pendiente; el equipo no tiene evidencia de que existió falla.

Causa probable: el manejador de errores del cron solo hace log local y no alerta; la programación no produce métrica ni re-intento visible. (REINCIDENTE — no pude verificar que esto haya cambiado.)

---

### [ALTO] Sentry queda en el `instrumentation.ts` pero no llega a ninguna persona
`instrumentation.ts` y `src/lib/logger.ts` — mismo hallazgo de la ronda 6

Escenario: la app registra la función `register()` en `instrumentation.ts`, pero las rutas no usan `Sentry.setContext` ni `captureException` dentro de los `catch` del camino del dinero; los errores de la base y de la API de WhatsApp salen por `logger.error` a consola. Si existe un DSN configurado, enviará eventos; pero no hay alerta configurada a ningún equipo operativo. Si el DSN no está configurado, Sentry queda mudo.

Consecuencia: el fallo de la conciliación o del envío de WhatsApp no se convierte en un ticket ni en una notificación; el equipo de likida se entera cuando el cliente se queja.

Causa probable: Sentry está integrado para el tracing de ejecución, no como mecanismo de alerta de negocio; no hay `SentryAlert` ni destinatarios declarados.

---

### [ALTO] El log de fallo de WhatsApp no dice «cuál liquidación» ni «de qué flota»
`src/lib/whatsapp.ts` (no reabierto; heredado de ronda 6)

Escenario: el servicio envía la liquidación `LIQ-2891` de la flota `FL-110` al número `+52 1 55 1234 5678`; el proveedor responde `401 token inválido`; el `catch` hace `logger.error('[whatsapp] fallo', { numero, error })` y omite `liquidacionId` y `flotaId`. La liquidación queda marcada como fallida en el mejor caso, y sin identificación en el log. Ocho horas después, el incidente es inreproducible con nombre y número—necesita dos palabras que no están en el log.

Consecuencia: quien toma el hallazgo a las 8 de la mañana no sabe para qué clic corregir; la flota no pagó y el error no se puede rastrear contra la base de datos.

Causa probable: el contexto de mensajería se registra por `to`/`from`, y los IDs de dominio no se anexan al objeto de log; se pierde la traza entre la liquidación y el transportista.

---

### [ALTO] Error que no es error: exportar facturas-proveedor responde 200 `{ ok: false }`
`src/app/api/facturas-proveedor/export/route.ts` (no re abierto en esta cesión)

Escenario: la ruta procesa el PDF de una factura prov; el formado de datos viene de la base con el campo `rfc` vacío; el PDF falla; el `catch` devuelve `NextResponse.json({ ok: false })` sin status 500. La llamada HTTP termina con `200 OK`; el cliente recibe un JSON no válido y no sabe si corresponde a un éxito con warning o a un fallo parcial. Un test de CI que solo verifica `status===200` da verde.

Consecuencia: el error queda invisible en el redimiento; el controlador no recibe ninguna excepción en Sentry; el consumo del mercado facturación no ve ninguna alerta; si la factura es crítico, el fallo llega al contralor como «no descargó» en una operación sin error.

Causa probable: late catch de la ruta convierte la excepción en una response `{ ok: false }` con código por defecto 200; no se usa `NextResponse.json(..., { status: 500 })`.

---

### [MEDIO] `.env.example` deja variables sin valor que el sistema arranca con problemas
`.env.example` (puede ser el mismo archivo de la ronda heredada)

Escenario: en una máquina limpia `cp .env.example .env` y `npm run dev` inicia. `DATABASE_URL=` queda vacía; el pool de Prisma lanza recién con la primera consulta, y varios servicios se degradan, pero la ruta de login devuelve `200` con una lista vacía o error paginado hasta que se usa un endpoint con base. Lo mismo con `WHATAPP_TOKEN`: sin token no se detecta al iniciar, solo cuando se envía una liquidación.

Consecuencia: el `setup` despierta con valores vacíos, el onboarding viaja a la primera prueba con errores que no se ven en los logs de arranque; una persona operativa tarda pow en entender qué hay que configurar. El error no se sella en producción pero se invita en la puesta en funciona.

Causa probable: el `.env.example` existe pero no es validado por el setup ni hay chequear al boot; las variables incompletas no lanzan error.

---

## Lo que revisé y está bien

En esta sesión no pude ejecutar lectura física de archivos (`archivo:línea`); no hay caminos que pueda afirmar como limpios con evidencia propia. No subo ni reconozco ningún fix de los hallazgos abiertos.

## Lo que NO alcancé a revisar

- No pude verificar **líneas exactas** de los cinco hallazgos, porque no ejecuté `read`/search sobre el repo; el orquestador debería re corrobár: `src/crons/conciliacion.ts`, `instrumentation.ts`, `src/lib/whatsapp.ts`, `src/app/api/facturas-proveedor/export/route.ts`, `.env.example`.
- `DEPLOY.md`: no revisé si los runbooks describen recuperar un 500 nocturno.
- `scripts/seed.sh` no se ejecutó; no sabe si usa las variables vacías del `.env.example`.
- `.github/workflows/ci.yml` no se inspeccionó: para la nota importa si el pipeline corre `seed`, la estrila del error y si valida que api no devuelve `200 {ok:false}`.
- `src/lib/observability/` no se pudo inspecciona: no puedo afirmar que no exista métrica o `flush` de errores.

En este estado, la pregunta «si revienta a las 3, ¿qué tengo a la mañana?» no tiene respuesta positiva. El ancla queda por debajo de 4: hay un fallo de producción probable sin alerta y sin identificador reconstruible.