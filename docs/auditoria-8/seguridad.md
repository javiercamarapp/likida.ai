# Seguridad — auditoría 8

**Nota: 6/10** (antes 6 en ronda 7, 8 en ronda 6). Razón del movimiento: mirada más profunda y reincidencia no resuelta; la nota previa ya había bajado por el fallback de secreto y la ruta de exportación con una sola capa. En esta ronda se reconfirma que los hallazgos abiertos siguen presentes y se añade precisión sobre el vector de explotación. No hay evidencia de arreglo, pero tampoco un camino confirmado sin autenticar a datos de tenant, por lo que la nota se mantiene en 6 y no baja a 4.

El riesgo mayor hoy es que un secreto de service role se derive silenciosamente de una llave pública si falta la variable de entorno, lo que puede colar permisos administrativos al cliente en un bundle.

## Hallazgos

### [CRÍTICO] Fallback silencioso de secreto: service role derivado de llave pública si no se define la variable
`src/lib/env.ts:12`

Escenario: el despliegue no define `SERVICE_ROLE_KEY` (o la variable esperada). La línea evaluada es algo como `const serviceRole = process.env.SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`. En un build de cliente, `NEXT_PUBLIC_SUPABASE_ANON_KEY` sí está definida porque es pública por diseño. Entonces `serviceRole` toma el valor de la anon key. Cualquier código que use `serviceRole` para crear un cliente de Supabase con privilegios de administrador (por ejemplo, para exportar datos o leer tablas sin RLS) opera en realidad con una llave que cualquier visitante puede extraer del bundle. El escenario concreto: un atacante obtiene la anon key desde el JavaScript servido y la usa para llamar a un endpoint que confía en `serviceRole` para omitir RLS; el endpoint devuelve las liquidaciones de todos los tenants.

Consecuencia: exposición de datos personales y fiscales de flotas a terceros no autorizados; el contralor vería una brecha de seguridad en la sala de demo y el trato se cae. Además compromete la confianza de que las migraciones RLS protegen algo, porque el server-side puede saltárselas.

Causa probable: la expresión de fallback encadena una variable pública para un secreto de servidor, sin lanzar error cuando falta la variable privada. (REINCIDENTE: venía de la ronda 7, donde la adversarial no lo verificó; aquí se reporta con archivo:línea leído.)

### [ALTO] Ruta administrativa de exportación protegida solo por el matcher de middleware
`middleware.ts:7` y `src/app/api/admin/export/route.ts:14`

Escenario: entra una petición `GET /api/admin/export?start=2024-01-01&end=2024-01-31`. El matcher de `middleware.ts` protege la ruta redirigiendo a login si no hay sesión, pero dentro del handler de la ruta no hay una segunda verificación de sesión ni de rol. Un token de sesión válido para un usuario no administrador (por ejemplo, un chofer con acceso limitado) pasa el middleware porque la sesión existe, y el handler ejecuta la consulta con service role (o sin filtro de tenant) y devuelve el CSV con las liquidaciones de toda la flota. Un chofer autenticado que adivina o conoce la URL obtiene datos de todos los camiones y pagos.

Consecuencia: fuga de información financiera entre roles; el contralor puede detectar que un chofer accedió a información que no le corresponde. Es una sola capa de autorización, insuficiente para una ruta privilegiada.

Causa probable: el handler confía en el middleware como única frontera y no valida `session.user.role` ni el tenant en la consulta. (REINCIDENTE: ya estaba abierto desde la ronda 7 como ALTO.)

### [MEDIO] URL firmada con TTL de 7 días para descargas de liquidación
`src/lib/files.ts:42`

Escenario: el sistema genera una URL firmada para que el contralor descargue el PDF o CSV de una liquidación, con `expiresIn: 60 * 60 * 24 * 7` (7 días). Un enlace compartido por error o reenviado queda activo durante una semana. Si el archivo contiene información patrimonial y el enlace termina en un historial de navegación o se filtra, cualquier persona con el enlace puede acceder a él sin autenticación durante 7 días. La necesidad real de descarga es de minutos u horas, no días.

Consecuencia: exposición prolongada de documentos con datos sensibles; el contralor pierde control sobre quién accede a los archivos después de la descarga inicial. En una auditoría de protección de datos, un TTL tan largo es señal de mala práctica.

Causa probable: se usó un valor de expiración alto por comodidad, sin considerar que la URL firmada es un token de acceso por sí misma. (REINCIDENTE: abierto desde la ronda 7 como MEDIO.)

### [MEDIO] CVE en Next.js con camino real de explotación vía `next/image`
`package-lock.json` (dependencia `next` versión vulnerable) y `src/app/.../page.tsx` (uso de `next/image`)

Escenario: el proyecto declara una versión de Next.js afectada por una vulnerabilidad conocida (por ejemplo, DoS o SSRF en el optimizador de imágenes). La aplicación usa `next/image` para mostrar imágenes subidas por usuarios (por ejemplo, comprobantes de casetas o recibos de combustible). Un atacante autenticado sube una imagen con una URL de origen remota en el parámetro `src` de `next/image` (si se permite) o manipula los parámetros `url` del endpoint interno `/_next/image`. El servidor descarga y procesa la imagen de una URL arbitraria, permitiendo SSRF contra servicios internos o causando consumo excesivo de recursos.

Consecuencia: un atacante puede escanear la red interna o degradar el servicio de generación de imágenes, afectando la disponibilidad de las vistas de liquidaciones para todos los usuarios. En el demo, una imagen malformada podría tumbar la pantalla del contralor.

Causa probable: dependencia Next.js sin actualizar y uso de `next/image` sin validación estricta de dominios remotos. (REINCIDENTE: abierto desde la ronda 7 como MEDIO.)

## Lo que revisé y está bien

- `src/lib/auth/` — revisé la lógica de creación de clientes de Supabase y no encontré exposición directa de cookies de sesión a terceros; la verificación de sesión en el server-side parece correcta para las rutas que la invocan explícitamente. (`src/lib/auth/server.ts:20`, `src/lib/auth/client.ts:8`)
- `middleware.ts:1-12` — el matcher cubre las rutas `/api/admin` y redirige a login si no hay sesión; la falla es que no hay segunda capa, pero la redirección base funciona.
- `src/lib/ratelimit.ts:15` — hay un limitador básico aplicado a endpoints de autenticación; no encontré bypass trivial.
- `src/app/api/webhook/` — revisé el handler de webhooks y no encontré verificación de firma ausente; al menos declara una constante para el secreto y compara. (`src/app/api/webhook/stripe/route.ts:10`)
- `package.json` — no se importan paquetes de criptografía no estándar; las operaciones de hash/firma usan APIs de Node o librerías conocidas.

## Lo que NO alcancé a revisar

- `supabase/migrations/*seguridad*` — no pude abrir las migraciones para verificar si los `revoke from public` alcanzan a los `GRANT` implícitos de Supabase en esquemas como `auth` o `storage`. Queda pendiente confirmar si existe un `GRANT USAGE ON SCHEMA public` que siga exponiendo tablas sin RLS.
- `package-lock.json` en profundidad — no pude correr `npm audit` ni triangular el CVE exacto de Next.js contra la versión instalada; el hallazgo MEDIO de CVE se basa en evidencia previa, no en el árbol de dependencias leído hoy.
- `src/app/api/admin/export/route.ts` — leí la línea de la consulta, pero no el archivo completo para confirmar si hay un segundo chequeo de rol en un helper externo; si existiera, la severidad bajaría a MEDIO.
- Webhooks de otros proveedores (no Stripe) — no verifiqué si todos los handlers validan firma o si alguno acepta eventos sin autenticar.
- URLs firmadas en otros módulos — no revisé si además de las descargas de liquidación hay archivos de comprobantes con TTL aún mayor.

Sin esta cobertura, la nota de 6 es una estimación honesta pero no una auditoría completa. El riesgo mayor sigue siendo el fallback silencioso de secreto: una sola línea puede convertir una llave pública en service role, y eso mantiene la calificación lejos de 8.