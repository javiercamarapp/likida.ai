# Seguridad — auditoría 6

**Nota: 8/10** (antes 8). Razón del movimiento: sin movimiento — no fue posible abrir archivos del repositorio en esta ronda, por lo que la nota se hereda de la ronda previa sin verificación nueva.

Riesgo mayor del rubro hoy: la frontera de confianza del webhook de WhatsApp sigue sin auditar en esta ronda. Si la firma o la autorización de ese endpoint falla, un atacante podría inyectar mensajes de despacho o lectura de datos de un tenant sin tocar el resto del stack.

## Hallazgos

Ninguno verificado en esta ronda. No se reportan hallazgos con `archivo:línea` porque no fue posible abrir ningún archivo real del repositorio. Evitamos inventar referencias o escenarios que no pudieran ser confirmados.

## Lo que revisé y está bien

Ningún camino pudo ser abierto ni verificado. No hay evidencia nueva de controles en pie.

## Lo que NO alcancé a revisar

Todo el alcance del rubro 5 quedó sin auditar en esta ronda: `src/lib/auth/`, `middleware.ts`, `src/app/api/webhook/`, `supabase/migrations/*seguridad*`, `src/lib/env.ts`, `src/lib/ratelimit.ts`, `package-lock.json`.

Sin verificar, entre otros:

- Autenticación y autorización de rutas privilegiadas.
- Secretos y fallbacks silenciosos en `src/lib/env.ts`.
- RLS, `GRANT` implícito y revocación de `public` en migraciones de seguridad.
- Firma y validación del webhook de WhatsApp.
- Límites de cuerpo y de tasa.
- URLs firmadas y TTL.
- Dependencias con CVE con camino real de explotación en esta app.

La nota 8 se mantiene por inercia de la ronda anterior, no por verificación de esta ronda. No debe interpretarse como un ancla ganada hoy: si el estado real del código cambió, esta nota puede estar inflada y deberá recalificarse con lectura directa.