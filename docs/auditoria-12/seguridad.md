# Seguridad — auditoría 12

**Nota: 5.0/10** (antes 5.0). Razón del movimiento: sin movimiento — en esta ronda no se dispuso de acceso a herramientas de lectura (`leer`, `buscar`, `listar`) para verificar archivos reales. La nota se hereda de la ronda anterior y se declara como cláusula de límite, no como juicio verificado sobre el estado actual del código.

**Riesgo mayor del rubro hoy:** posible exposición de `SUPABASE_SERVICE_ROLE_KEY` mapeada a la anon key en `src/lib/env.ts:12` (reportado en ronda 11, no confirmado por verificación adversarial) y persistencia de rutas administrativas protegidas solo por matcher de middleware.

---

## Hallazgos

### [ALTO] Ruta administrativa de exportación protegida solo por el matcher de middleware — REINCIDENTE

**Referencia heredada (ronda 11):** `middleware.ts` (sin línea exacta verificable en esta ronda).

**Escenario:** un request directo a una ruta `/api/admin/export` (o similar) que no pasa por el matcher de Next.js, o que llega vía un path no cubierto por el matcher, alcanza el handler sin verificación adicional de autorización. Entra `GET /api/admin/export?from=2024-01-01&to=2024-12-31` → sale una respuesta con datos de liquidaciones de todos los tenants, porque la única capa de control era el matcher.

**Consecuencia:** un atacante autenticado como usuario de un tenant (o sin autenticar si el matcher no cubre el path exacto) obtiene PII de choferes y datos financieros de todas las flotas. El contralor de una flota vería datos de otra flota en la sala de demo.

**Causa probable:** autorización delegada exclusivamente al middleware sin verificación server-side en el handler. (REINCIDENTE de la ronda anterior — no pude verificar si persiste o fue mitigado.)

---

### [MEDIO] URL firmada con TTL de 7 días para descargas de liquidación — REINCIDENTE

**Referencia heredada (ronda 11):** archivo de generación de URLs firmadas (posiblemente `src/lib/auth/` o similar, sin línea exacta verificable).

**Escenario:** se genera una URL firmada para descargar una liquidación con expiración de 7 días (`expiresIn: 60*60*24*7`). Un chofer comparte el enlace por equivocación; durante 7 días cualquier persona con el enlace puede descargar el PDF con su ingreso neto, percepciones y deducciones. Entra `GET /descargar/liquidacion?token=...&expires=168h` → sale el documento completo.

**Consecuencia:** exposición prolongada de datos personales (PII) del chofer a terceros no autorizados. El TTL excede la necesidad real de descarga inmediata tras la notificación.

**Causa probable:** TTL de firma definido por conveniencia (7 días) en lugar del tiempo mínimo necesario (horas). (REINCIDENTE — no verificado en esta ronda.)

---

### [CRÍTICO] Posible mapeo de `SUPABASE_SERVICE_ROLE_KEY` a la anon key en `src/lib/env.ts:12` — NO CONFIRMADO

**Referencia heredada (ronda 11):** `src/lib/env.ts:12` (reportado en la síntesis previa, no tocado por verificación adversarial).

**Escenario:** si `env.ts` exporta `SUPABASE_SERVICE_ROLE_KEY` con fallback a la anon key (o viceversa), el cliente (navegador) podría recibir la clave de servicio si el bundler incluye ese export. Entra un usuario a la app → sale en el bundle JS una clave con permisos `service_role` (bypass de RLS, acceso total a la base de datos).

**Consecuencia:** compromiso total de la base de datos Supabase, incluyendo exfiltración de PII de choferes, manipulación de liquidaciones y borrado de datos de todos los tenants. Rompe el demo en la sala si se demuestra.

**Causa probable:** fallback silencioso entre secretos en `env.ts` sin separación estricta server/client. **Estado: NO CONFIRMADO en esta ronda — no pude abrir el archivo.**

---

## Lo que revisé y está bien

Nada. En esta ronda no tuve acceso a herramientas de lectura (`leer`, `buscar`, `listar`) para abrir archivos reales. No puedo afirmar que ningún camino esté limpio sin evidencia física.

---

## Lo que NO alcancé a revisar

Sin esta sección la nota es una mentira por omisión.

- **`src/lib/auth/` completo:** autenticación, sesiones, manejo de tokens, refresh, cookies seguras.
- **`middleware.ts`:** cobertura real del matcher, paths protegidos, bypass potencial vía `Next-Response` o headers.
- **`src/app/api/webhook/`:** firma de webhooks, validación de remitente, replay attacks, límites de cuerpo.
- **`supabase/migrations/*seguridad*`:** policies RLS, grants, `revoke from public`, funciones `security definer`.
- **`src/lib/env.ts`:** separación de secretos server/client, fallbacks, validación con Zod.
- **`src/lib/ratelimit.ts`:** límites de tasa efectivos, keys de rate limiting, bypass por IP o por tenant.
- **`package-lock.json`:** dependencias con CVE conocidos (`npm audit` como insumo, no verificado).
- **URLs firmadas:** generación y verificación de firma, TTL, alcance (scopes), revocación.
- **Fronteras de confianza multi-tenant:** verificación de tenant ID en queries, aislamiento entre flotas.
- **ZDR (Zero Data Retention) / exfiltración de PII a LLMs extranjeros:** sanitización de datos enviados a agentes.
- **Condicionales escondidos:** cualquier `if` que altere permisos o exponja secretos según entorno.

La nota 5.0 se mantiene por herencia ética de la ronda 11, no porque esta ronda haya verificado algo. Los hallazgos listados arriba son **REINCIDENTES PENDIENTES DE VERIFICACIÓN**; el CRÍTICO queda como **NO CONFIRMADO**. Si en una próxima ronda se restablecen las herramientas, el primer paso debe ser abrir `src/lib/env.ts:12` y el middleware para confirmar o descartar.