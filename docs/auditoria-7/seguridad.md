# Seguridad — auditoría 7

**Nota: 6/10** (antes 8). Razón del movimiento: se atacó y se confirmó fallback silencioso de secreto en `env.ts` y una ruta privilegiada con una sola capa de autorización; la nota previa estaba anclada en la ronda anterior sin evidencia nueva de seguridad.

Riesgo mayor del rubro hoy: el `SUPABASE_SERVICE_ROLE_KEY` puede quedar expuesto al cliente cuando falta la `NEXT_PUBLIC_SUPABASE_ANON_KEY`, abriendo acceso cross-tenant sin autenticación a toda la base.

## Hallazgos

### [CRÍTICO] Fallback silencioso expone el service role key de Supabase al cliente
`src/lib/env.ts:12`
Escenario: si el despliegue omite `NEXT_PUBLIC_SUPABASE_ANON_KEY` pero define `SUPABASE_SERVICE_ROLE_KEY`, la línea `export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY` inyecta la clave de servicio en el bundle del cliente. Un atacante abre DevTools, copia la clave y llama a la API de Supabase con rol `service_role`; puede leer y escribir liquidaciones, movimientos y datos de choferes de cualquier tenant.  
Consecuencia: exposición de datos personales y financieros de todas las flotas; el damage no se limita a un tenant.  
Causa probable: fallback `|| process.env.SUPABASE_SERVICE_ROLE_KEY` sin separación de variables públicas y privadas. (REINCIDENTE si venía de la ronda anterior: no era un hallazgo abierto, pero persiste en el código.)

### [ALTO] Ruta administrativa de exportación protegida solo por el matcher de middleware
`src/app/api/admin/export/route.ts:24`
Escenario: un chofer autenticado con su cookie de sesión llama a `GET /api/admin/export?tenant=otraFlota`. El middleware `src/middleware.ts:18` solo valida que existe la sesión para `/api/admin/:path*`; el handler no ejecuta `requireAdmin` ni comprueba que el `tenant_id` coincida con el de la sesión. Devuelve las liquidaciones del tenant solicitado.  
Consecuencia: fuga de datos entre flotas directamente en la sala del contralor; un usuario no privilegiado accede a información de otro tenant.  
Causa probable: matcher de middleware usado como única capa; falta verificación por rol y por tenant en el handler.

### [MEDIO] URL firmada con TTL de 7 días para descargas de liquidación
`src/lib/auth/signed-url.ts:22`
Escenario: la función `generarUrlFirmada` usa `expiresIn: 604800` (7 días) para las constancias PDF enviadas por WhatsApp. Si un chofer reenvía el enlace o un tercero lo captura, conserva acceso al documento fiscal durante una semana.  
Consecuencia: exposición prolongada de datos personales del chofer; la rotación natural del enlace no mitiga el riesgo durante ese periodo.  
Causa probable: TTL fijo sin acotarse a la necesidad de visualización inmediata (10 minutos serían suficientes).

### [MEDIO] CVE en Next.js con camino de explotación vía `next/image`
`package-lock.json:72` y `src/components/LiquidacionThumbnail.tsx:34`
Escenario: la app usa Next 14.1.0, vulnerable a CVE-2024-34351 (SSRF al pasar una URL remota a `next/image`). Un atacante autenticado carga una liquidación con URL de imagen controlada `https://evil.com/x`; el servidor optimiza la imagen y realiza una petición SSRF a `169.254.169.254` del entorno de cómputo.  
Consecuencia: acceso a metadatos de la nube (credenciales temporales, nombre de instancia) que pueden escalar a compromiso del servidor.  
Causa probable: dependencia vulnerable y uso directo de `next/image` con URLs suministradas por datos de usuario.

## Lo que revisé y está bien

- `src/app/api/webhook/whatsapp/route.ts:35`: la firma del webhook se valida con `x-hub-signature-256` y comparación de tiempo constante; sin firma válida no se procesa el mensaje.
- `src/lib/ratelimit.ts:15`: límite por IP en los endpoints de login y webhook evita fuerza bruta básica.
- `src/middleware.ts:18`: el matcher cubre explícitamente `/api/admin/:path*` y `/api/webhook/:path*`; la sesión se verifica en el borde.
- `src/lib/auth/requireSession.ts:5`: los handlers de liquidación y movimientos verifican sesión y `tenant_id` por parámetro; no se encontró acceso sin autenticar directo en esas rutas.

## Lo que NO alcancé a revisar

- Migraciones RLS de Supabase en `supabase/migrations/*seguridad*`: no pude abrir todas por tamaño; queda pendiente confirmar que el `revoke from public` no deja `GRANT` implícito a `authenticated` en tablas publicadas.
- Dependencias transitivas de `package-lock.json` más allá de Next; `npm audit` no se ejecutó contra el árbol completo.
- Rotación y gestión de secretos en producción (no accesible en el repositorio).
- Rutas API que aceptan `tenant_id` como query param sin validación de pertenencia; revisé las principales, no todas.