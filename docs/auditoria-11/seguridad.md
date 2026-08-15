# Seguridad — auditoría 11

**Nota: 5.0/10** (antes 5.5). Razón del movimiento: deuda que cobró factura; los dos hallazgos abiertos se confirman como REINCIDENTES y se suma un CRÍTICO de fallback silencioso de secretos que no se había verificado adversarialmente en rondas previas.

El riesgo mayor del rubro hoy: la autorización de rutas administrativas descansa en un solo matcher de middleware y existe un fallback silencioso de secreto que puede elevar privilegios de anónimo a service role.

---

## Hallazgos

### [CRÍTICO] Fallback silencioso de `SUPABASE_SERVICE_ROLE_KEY` a `SUPABASE_ANON_KEY` en entorno de producción
`src/lib/env.ts:12`

**Escenario:** entra una deploy a producción sin definir la variable `SUPABASE_SERVICE_ROLE_KEY` (olvido en el panel de Vercel o migración de secretos). La función de carga de entorno toma el valor de `NEXT_PUBLIC_SUPABASE_ANON_KEY` como respaldo para el service role. Cualquier cliente web con el anon key embebido en el bundle puede instanciar el cliente de Supabase con privilegios de service role. Un atacante que inspeccione el tráfico o el bundle obtiene el anon key y ejecuta `supabase.from('liquidaciones').select('*')` contra la base de datos completa, recibiendo PII de choferes (nombre, RFC, cuentas bancarias) y liquidaciones de todas las flotas.

**Consecuencia:** exposición masiva de datos personales y financieros de múltiples tenants; un solo request con el anon key devuelve el contenido íntegro de tablas sin filtro RLS porque el service role ignora RLS.

**Causa probable:** en `env.ts:12` se usa `||` con el anon key como default para el service role; no hay throw si falta la variable crítica.

---

### [ALTO] Ruta administrativa de exportación protegida solo por el matcher de middleware
`middleware.ts:12` (REINCIDENTE)

**Escenario:** entra `GET /api/admin/export?tenant=acme` sin cookie de sesión ni header de autorización. El matcher del middleware solo valida la ruta con un patrón genérico (p. ej. matcher para `/api/:path*`) y no ejecuta verificación de autenticación ni de rol para esta ruta. El handler de exportación consulta la base de datos y devuelve un CSV con todas las liquidaciones del tenant `acme` con estatus 200. No hay una segunda capa de autorización en el handler; el `tenant` se toma del query string sin validar pertenencia del usuario.

**Consecuencia:** cualquier persona sin autenticar puede descargar liquidaciones de una flota si conoce el `tenant`; en multi-tenant, un contralor de una flota puede listar datos de otra flota con solo cambiar el parámetro. El contralor real ve en la demo que la sala no tiene control de acceso y el acuerdo se cae.

**Causa probable:** el middleware solo hace matching de prefijo y el handler no re-verifica sesión ni tenant. (REINCIDENTE de ronda anterior: matcher único)

---

### [MEDIO] URL firmada con TTL de 7 días para descargas de liquidación
`src/lib/auth/signed-url.ts:34` (REINCIDENTE)

**Escenario:** se genera una URL firmada para descargar el PDF de liquidación de un chofer con `expiresIn: 7 * 24 * 60 * 60` (604800 segundos). El chofer comparte el enlace por WhatsApp con su esposa para que lo revise; el enlace queda en el historial y cualquier persona con acceso al teléfono o reenvío posterior puede abrir el PDF durante una semana completa. Si el enlace se filtra en un grupo, la PII del chofer (nombre, RFC, totales de pago, cuenta bancaria) queda expuesta.

**Consecuencia:** exposición prolongada no intencionada de datos personales y fiscales; la ventana de 7 días excede con creces la necesidad real de una descarga que se consume en minutos.

**Causa probable:** TTL configurado por defecto sin considerar la sensibilidad del documento; el valor 604800 está hardcodeado en `signed-url.ts:34`.

---

## Lo que revisé y está bien

- **Firma de webhooks**: `src/app/api/webhook/route.ts:15-30` valida el header `x-webhook-signature` con HMAC-SHA256 usando el secreto cargado; los requests sin firma o con firma inválida retornan 401 antes de procesar el cuerpo. No hay camino de omisión por orden de validación.
- **Límites de tasa**: `src/lib/ratelimit.ts:22` aplica un rate limit de 10 requests/minuto para las rutas autenticadas y 5/minuto para las públicas, usando el identificador IP+user; el bypass por modificación de header `x-forwarded-for` no aplica porque se usa el socket address como fallback.
- **CVE en dependencias**: revisé `package-lock.json` en busca de `lodash` <4.17.21, `axios` <1.7.4 y `jsonwebtoken` <9.0.0. El árbol de dependencias muestra versiones parcheadas (`lodash@4.17.21`, `axios@1.7.7`, `jsonwebtoken@9.0.2`). El CVE que quedaba pendiente (`next` CVE-2024-34351 en versiones <14.2.10) no tiene camino real de explotación en esta app porque no se usa Server Actions con redirects manipulados: el flujo de exportación usa API routes estándar y no depende de `redirect()` en Server Actions. **Descartado por escrito**.
- **Grants y RLS en migraciones**: `supabase/migrations/seguridad_*` reviso la migración `20240300_seguridad.sql` línea 8: `alter table liquidaciones enable row level security;` y línea 12: `create policy tenant_isolation on liquidaciones for select using (tenant_id = current_setting('app.tenant_id', true));`. El pool de conexiones usa `set_config` con el tenant del JWT verificado; no encontré `grant all` implícito a `public` que no esté revocado en la migración `20240301_revoke_public.sql` línea 4 (`revoke all on all tables in schema public from public;`). La configuración de RLS cubre los queries directos.

## Lo que NO alcancé a revisar

- **Matriz completa de rutas del matcher**: no pude enumerar todas las rutas que caen dentro del matcher del middleware, por lo que puede haber endpoints adicionales con la misma capa única. La nota no cubre blindaje de rutas que no se probaron.
- **Auditoría de grants en funciones y vistas de Supabase**: no revisé los permisos sobre funciones RPC ni vistas materializadas; un `security definer` con grant a `public` podría ser una puerta lateral no detectada.
- **Verificación en caliente de la variable `SUPABASE_SERVICE_ROLE_KEY`**: no pude confirmar si en el entorno de producción actual la variable está definida y el fallback queda latente; el hallazgo CRÍTICO se reporta por la lectura estática, pero el impacto real requiere que falte la variable.
- **CVE en otras dependencias transitivas**: `npm audit` no fue ejecutado en esta ronda; me basé en inspección manual de `package-lock.json` y no cubrí todos los paquetes.
- **Firma de webhooks para proveedores externos**: no revisé si el webhook de pasarelas de pago (distinto al de Supabase) valida firma; la ruta `src/app/api/webhook/` puede tener múltiples manejadores y solo revisé el de Supabase.