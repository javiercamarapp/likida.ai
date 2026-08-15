# Seguridad — auditoría 9

**Nota: 5.5/10** (antes 6). Razón del movimiento: se confirmaron dos reincidentes sin evidencia de arreglo (alta exposición por autorización de una sola capa y URL firmada con TTL excesivo) y se descartó por escrito el CVE de Next.js por falta de camino real de explotación. La deuda acumulada cobró factura sin llegar a un acceso sin autenticar confirmado a datos de tenant.

Riesgo mayor: la autorización de rutas administrativas descansa en un solo matcher de middleware cuyo bypass silencioso expone datos de flota.

## Hallazgos

### [ALTO] Ruta administrativa de exportación protegida solo por el matcher de middleware
`src/middleware.ts:18` · `src/app/api/admin/export/route.ts:11`
Escenario: entra una petición GET a `/api/admin/export?tenant_id=12` desde un cliente no autenticado. Si el matcher de `middleware.ts` no cubre `/api/admin/export` (por patrón o por omisión), la ruta devuelve un CSV con viajes, montos y combustible del tenant 12 sin verificar sesión dentro del handler. Sale un CSV con datos reales descargado por quien no debía.
Consecuencia: el contralor ve en la sala datos de otro tenant o un atacante descarga información de flota; se rompe el aislamiento entre flotas.
Causa probable: la ruta asume que el middleware ya autenticó y no valida sesión en el handler. (REINCIDENTE)

### [MEDIO] URL firmada con TTL de 7 días para descargas de liquidación
`src/lib/storage.ts:88`
Escenario: se genera una URL firmada para descargar la liquidación de un viaje con expiración de 604800 segundos (7 días). El chofer recibe el enlace por WhatsApp y lo reenvía a un tercero; 6 días después, el tercero abre la URL y descarga la liquidación con importes y datos del viaje.
Consecuencia: fuga de información de pagos y datos operativos de la flota durante una semana después de la necesidad real de descarga.
Causa probable: TTL fijo de 7 días sin considerar la duración real de la necesidad. (REINCIDENTE)

### CVE en Next.js vía `next/image` — descartado por falta de camino real de explotación
`package.json:32` · búsqueda regex en `src/`
Revisé la versión de Next.js (15.1.6) y busqué usos de `next/image`. Solo aparece en `src/components/Avatar.tsx:4`, que se renderiza exclusivamente en rutas autenticadas y no procesa URLs externas controladas por el usuario. No hay camino real de explotación en esta app; se descarta por escrito, como se descartó el bypass de middleware de Next en rondas anteriores.

## Lo que revisé y está bien
- `src/lib/env.ts:14` valida la presencia de secretos sin fallback derivado de otro secreto (no hay `process.env.X || process.env.Y` silencioso).
- `supabase/migrations/20240101_seguridad.sql:25` ejecuta `revoke from public` y otorga grants explícitos a roles de aplicación; el `GRANT` implícito de Supabase no queda alcanzado por el revoke.
- `src/lib/ratelimit.ts:12` define límite de tasa sobre rutas de API; se aplica en `/api/export`.
- `src/app/api/webhook/route.ts:16` verifica firma de webhook con secreto dedicado y sin fallback a otro secreto.

## Lo que NO alcancé a revisar
- Políticas RLS reales en el dashboard de Supabase (solo revisé migraciones; no pude confirmar que el `revoke from public` no deje huecos en `authenticated`).
- Firma de webhooks en flujo completo de Stripe/PayPal (no verifiqué si el secreto se rota correctamente).
- Auditoría de dependencias completa (`package-lock.json`) para otros CVEs fuera de Next.js; solo revisé `next` por el hallazgo abierto.