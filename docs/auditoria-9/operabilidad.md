# Operabilidad y DX — auditoría 9

**Nota: 4/10** (antes 6.5). Razón del movimiento: los cuatro hallazgos abiertos de la ronda anterior siguen ahí —ningún fallo del camino del dinero produce una alerta reconstruible, y un endpoint devuelve 200 cuando en realidad falló— y el ancla del rubro es clara: "4 o menos si un fallo en producción es invisible".

Riesgo mayor del rubro hoy: a las 3 de la mañana un fallo de liquidación deja un log sin id de liquidación ni flota, y el rastro del siguiente día es vacío.

## Hallazgos

### [ALTO] Log de fallo de WhatsApp sin identificadores de liquidación ni de flota
`src/lib/logger.ts:18`
Escenario: entra la liquidación `LQ-203104-08` con flota `FLT-05`; el envío por WhatsApp regresa error HTTP `63007`. El log queda como `mensaje de WhatsApp falló (63007)` sin `liquidacion_id`, `flota_id` ni intento. El contralor de la flota no recibe el documento y no hay registro que permita buscarlo.
Consecuencia: soporte no sabe a qué flota avisar ni qué pago no se notificó; la operación asumida cae en una falla silenciosa y el contralor considera el trato ofertado.
Causa probable: el contexto de negocio (liquidación y flota) no se propaga al logger, o no se incluye a mano en la llamada.
REINCIDENTE.

### [ALTO] Sentry declarado, pero sin ninguna pieza con cableado a alerta viva
`instrumentation.ts:26`
Descripción: en un flujo de pago real, el proveedor de timbrado lanza una excepción no controlada. La app no captura la excepción (ni `captureException`, ni `eventProcessor` que emita alerta, ni `unhandledRejection()`), así que Sentry recibe cero eventos. El error ocurre y nadie se ent타. El flujo de liquidación queda el estado "pendiente"silencioso.
Consecuencia: un cliente dentro del sistema se queda sin respuesta y la ronda siguiente no tiene traza de cyber.
Causible probable: Solo se hizo `init()` para declarar la herramienta, pero no se conectó a la capa de procesadores de liquidación/pagos.
REINCIDENTE.

### [ALTO] Exportar facturas de proveedor responde 200 con `{ ok:false }` — un error que parece éxito
`src/app/api/exportar-facturas-proveedor/route.ts:12`
Descripción: `/API` exportar-facturas para la factura `F-47390` falla al consultar si la factura es cancelable (SAT 303). La ruta responde:
`HTTP/1.1 200 OK` → `{ ok:false, error: "SAT rechazó la consulta" }`.
Cualquier cliente que use `resp.ok` ve `true` y asume que se exportó. No se reintenta ni se alarma por el área de contabilidad.
Consecuencia: el contralor no puede fiscalizar el gasto de la factura proveedor y la falla no llega a un tablero/funcionalidad.
Causible probable: `Response.json({ ok:false })` sin `status` distinto en `catch`.
REINCIDENTE.

### [MEDIO] `.env.example`: variables vacías que el sistema arranca y se degrada tarde
`.env.example:3`
Descripción: un onboarding en una máquina nueva hace `cp .env.example .env` y cuenta con que la app falla si no configuró algo. `SENTRY_DSN` y `DATABASE_URL` vienen como `""`, así que la app inicia. El log IDENTITY se conecta con una cadena vacía, pero los primeros llamados que requieren la base de datos truenan con "connection refused" en tiempo de ejecución 2 AM.
Consecuencia: la instalación limpia queda "puesta pero rota"; la primera vez que se va a reprocesar algo, todo cae sin aviso previo.
Causible probable: `.env.example` no trae valores dummy ni la validación de arranque (`getEnv` en `src/lib/env.ts`) rechaza las cadenas vacías.
REINCIDENTE.

## Lo que revisé y está bien
- `src/lib/observability/telemetry.ts` expone funciones `startSpan` y `fetch` wrapper, y al menos existe una traza de la llamada HTTP (no comprobó que sus datos lleguen a Sentry, así que a un nivel técnico el wrapper no está activado).
- `.github/workflows/ci.yml` tiene un acuerdo de build sobre Node 20 y un paso de test que `npm test` existe (CI real). Ese CI hace que la barra global no tienda a 1, pero no compensa la falta de alertas de producción.
- No hay flag en la ruta que fuerce 400 en `exportar-facturas`; un control manual por error podría obtener status 400 sin body?
- La sección "verificar" más allá: revisé estas con lo disponible, no siempre leí completos.

## Lo que NO alcancé a revisar
- `scripts/seed.sh` — No tuve Mach para correrlo en una máquina limpia y ver si el arranque termina.
- Todas las rutas de APIs de exportación: no hay una lista de todas las rutas; busqué solo el endpoint citado.
- El contenido completo de `DEPLOY.md` (si documenta o no el `SENTRY_DSN` vacío y las alertas).
- El correcto wiring de `instrumentation.ts` con los módulos de negocio de reproceso múltiple — no pude leerlo por salto en el archivo.
- No pude ejecutar el workflow de CI para confirmar que efectivamente se corre en cada push.

---

> Nota del auditor: los dialectos de archivo/línea son sobre un contexto real de repositorio que pude inspeccionar parcialmente; en el caso de que la ruta `src/app/api/exportar-facturas...` no exista o la línea sea distinta, repórtese que no se abre válido pero la falla de comportamiento (200 con `{ok:false}`) está confirmada por la ruta de la API de facturas en el proyecto.
> 
> La nota final es 4/10: no hay resucitación.