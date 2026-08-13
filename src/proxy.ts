import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Cabeceras de seguridad + gate de sesión del dashboard. El matcher EXCLUYE
// /api (webhook, demo, export manejan lo suyo y no deben pasar por el gate ni
// cargar cabeceras de página).
//
// El gate ya NO es un passcode compartido: usa la sesión real de Supabase
// Auth. `createServerClient` aquí, con las cookies de request/response, es el
// patrón oficial para refrescar el token de sesión en middleware — sin esto,
// una sesión cuyo access token expiró a mitad de vida se vería como "sin
// sesión" hasta el siguiente refresh del lado del navegador.
//
// Esta es la PRIMERA capa (barata, por matcher de ruta). La segunda vive en
// cada página vía `requireSessionTenant` (src/lib/auth/guard.ts): las dos
// tienen que fallar a la vez para que el panel se sirva sin autorización.
//
// LAS CABECERAS SE APLICAN AL FINAL, EN UN SOLO LUGAR. `setAll` reasigna
// `res` a una respuesta NUEVA cada vez que Supabase refresca el token de
// sesión (pasa a media vida, no solo al expirar) — si las cabeceras se
// hubieran puesto antes de ese punto, un refresh de sesión las tiraba en
// silencio en cualquier respuesta autenticada. Y el redirect a /login es
// OTRO objeto de respuesta aparte de `res`: sin este helper aplicado también
// ahí, la página de login nunca llevaba cabeceras de seguridad tampoco.
/**
 * CSP — reincidente desde al menos la auditoría 8 (nunca se había escrito).
 * No es una plantilla genérica: cada directiva sale de recorrer qué carga
 * esta app de verdad (`command grep` de `fetch(`, `<img`, `<script`,
 * `<iframe>`, `createBrowserClient`, `next/font` — auditoría 10):
 *
 * - `script-src 'unsafe-inline'`: el App Router de Next inyecta scripts
 *   inline para revelar streaming/Suspense (`self.__next_f.push(...)`).
 *   No hay infraestructura de nonce en este repo (ni un solo `next/script`
 *   ni un `<script>` propio en `src/app`), así que exigir nonce hoy
 *   rompería CADA página — se documenta como deuda, no como descuido.
 * - `style-src 'unsafe-inline'`: **1,178** `style={{...}}` en 125 archivos
 *   (`command grep -rc "style={{" src --include="*.tsx"`), el mecanismo con
 *   el que este repo aplica `var(--muted)` y el resto del sistema de
 *   diseño. Es un atributo `style=""`, no un `<style>` — ni nonce ni hash
 *   lo cubren (son dinámicos, calculados en cada render), así que sin
 *   `unsafe-inline` la mitad del panel se pinta sin color.
 * - `img-src https://*.supabase.co`: los avatares y las fotos de
 *   comprobante son URLs firmadas/públicas de Storage
 *   (`admin/mi-perfil/page.tsx:52`) — el navegador las pide directo, sin
 *   pasar por `/api`.
 * - `connect-src 'self'` y nada más: los dos `fetch(` que existen en
 *   componentes cliente (`dashboard/rail.tsx`, `demo/page.tsx`) son a rutas
 *   propias. Sentry vive SOLO en `SENTRY_DSN` (server, sin
 *   `NEXT_PUBLIC_SENTRY_DSN` ni `instrumentation-client.ts`) — el navegador
 *   nunca le habla. WhatsApp (Graph API) es server-only. Stripe se navega
 *   por `redirect()` de un server action (top-level, no XHR) — no hay
 *   Stripe.js ni Elements embebidos.
 * - `frame-src 'none'`: cero `<iframe>` en el repo.
 * - `frame-ancestors 'none'`: mismo candado que `X-Frame-Options: DENY`,
 *   pero por CSP — cinturón y tirantes, como el resto de este archivo.
 *
 * Verificado, no supuesto: `docs/auditoria-10/seguridad.md`.
 */
// `next dev` (Fast Refresh) parchea módulos con `eval()` al arrancar — sin
// `unsafe-eval` esa corrida truena ANTES de que la app hidrate, y la pantalla
// se queda pegada en el loading skeleton para siempre (rehidratación nunca
// llega a correr). Ese `eval` es exclusivo del bundle de DESARROLLO: el build
// de producción no lo usa, así que restringir la excepción a
// `NODE_ENV === 'development'` no afloja nada en producción — la comprobó
// `proxy.test.ts` no distingue por `script-src`, solo por presencia de CSP.
const scriptSrc = process.env.NODE_ENV === 'development'
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const CSP = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function withSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.headers.set('Content-Security-Policy', CSP);
  if (process.env.NODE_ENV === 'production') {
    res.headers.set('Strict-Transport-Security', 'max-age=31536000');
  }
  return res;
}

/**
 * Los prefijos que exigen sesión. Se compara con `startsWith` y no por
 * segmento exacto a propósito: sobrar en este gate solo cuesta un login de
 * más, faltar sirve una pantalla del panel a quien no inició sesión.
 *
 * Se exporta para que `proxy.test.ts` pueda comprobar que TODA sección con
 * `requireSessionTenant`/`requireSuperadmin` está nombrada aquí.
 *
 * `/chofer` y `/mis-viajes` salieron el 7-ago-2026: el chofer ya no tiene
 * cuenta ni panel propio, solo WhatsApp — ver `visibilidad.ts` (`PANEL_PROPIO`
 * vacío) y `guard.ts` (`requireOperador` retirada).
 *
 * `/cuenta` entró el 12-ago-2026 (auditoría 17, BAJO reincidente): su
 * `page.tsx` lee `tenant.nombre` con `supabaseAdmin()` —service_role, que
 * bypasea RLS— y era la única página con datos del tenant sostenida por una
 * sola puerta, la suya. Justo el caso que el párrafo de arriba describe.
 */
export const RUTAS_CON_SESION = ['/dashboard', '/admin', '/cuenta'] as const;

export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const path = req.nextUrl.pathname;

  // /admin es la consola de negocio de Javier (requireSuperadmin, guard.ts):
  // mismo gate de sesión que /dashboard, la distinción de ROL vive en la
  // página, no aquí — esta capa solo pregunta "¿hay sesión?".
  if (RUTAS_CON_SESION.some((p) => path.startsWith(p))) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: (list) => {
            list.forEach(({ name, value }) => req.cookies.set(name, value));
            res = NextResponse.next({ request: req });
            list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
          },
        },
      },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', path);
      // Las cookies que `setAll` escribió en `res` viajan TAMBIÉN en el
      // redirect. Cuando `getUser()` encuentra un refresh token muerto, el SDK
      // pide borrar la cookie por esa vía — y este camino devolvía otra
      // respuesta, así que la instrucción de borrado se perdía: el navegador
      // seguía mandando la cookie muerta y cada petición pagaba un refresh
      // fallido antes de acabar, otra vez, en este mismo redirect.
      const redirectRes = NextResponse.redirect(url);
      res.cookies.getAll().forEach((c) => redirectRes.cookies.set(c));
      return withSecurityHeaders(redirectRes);
    }

    // ── /admin: la segunda capa del ROL, no solo de la sesión ──────────────
    //
    // AUDITORÍA 17, MEDIO reincidente (5º pase). Las 20 `page.tsx` bajo
    // `src/app/admin/` no traen guarda propia de lectura: `requireSuperadmin()`
    // vive exclusivamente en `admin/layout.tsx`. Hasta aquí, la autorización
    // por rol de la consola de negocio de Likida —qué tenants existen, cuánto
    // gasta en IA, el MRR— colgaba de que ese layout se renderizara.
    //
    // Se pregunta con el cliente de SESIÓN (anon key), no con el service-role:
    // la policy `app_user_self` deja a cada quien leer su propia fila, así que
    // esta comprobación se apoya en RLS en vez de saltársela.
    //
    // NIEGA SOLO ANTE UN "NO" DEFINITIVO, y es a propósito. Si la consulta se
    // cae, `data` viene null y aquí NO se rebota: `getSessionTenant()`
    // (session.ts:64-89) reintenta una vez antes de rendirse justamente porque
    // un `fetch failed` de tres segundos no es "este usuario no es
    // superadmin", y cortar aquí echaría a Javier de su consola donde hoy ese
    // reintento lo salva. El reparto queda: el proxy corta cuando la base
    // contesta un rol que no es superadmin —el caso del atacante, que tiene
    // sesión válida y fila legible—, y `requireSuperadmin` (con su reintento)
    // sigue negando todo lo demás: sin fila, sin poder leerla, sin sesión.
    // Ninguna de las dos afloja a la otra; antes de esto el proxy no miraba el
    // rol en absoluto.
    if (path.startsWith('/admin')) {
      const { data: fila } = await supabase
        .from('app_user').select('rol').eq('id', user.id).maybeSingle();
      if (fila && fila.rol !== 'superadmin') {
        const url = req.nextUrl.clone();
        // El mismo destino que `requireSuperadmin` (guard.ts:48): dos capas que
        // rebotan a sitios distintos es como nace un bucle entre ellas.
        url.pathname = '/dashboard';
        url.search = '';
        const redirectRes = NextResponse.redirect(url);
        res.cookies.getAll().forEach((c) => redirectRes.cookies.set(c));
        return withSecurityHeaders(redirectRes);
      }
    }

    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  }

  return withSecurityHeaders(res);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
