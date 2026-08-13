import { describe, it, expect, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17, MEDIO REINCIDENTE (5º pase): /admin tenía UNA SOLA CAPA PARA
// EL ROL.
//
// `proxy.ts:114-117` solo preguntaba "¿hay sesión?" y seguía. Las 20 `page.tsx`
// bajo `src/app/admin/` no traen guarda propia de lectura: `requireSuperadmin()`
// vive exclusivamente en `admin/layout.tsx:36`. Un `flota_admin` con sesión
// válida pasaba la primera capa sin fricción, y lo único que lo detenía era que
// el layout se renderizara. Lo que hay detrás es la consola de negocio de
// Likida: qué tenants existen, cuánto gasta en IA, el MRR.
//
// ── POR QUÉ ESTA CAPA NIEGA SOLO ANTE UN "NO" DEFINITIVO ───────────────────
//
// La consulta del rol puede fallar, y aquí fallar cerrado sería un retroceso,
// no una mejora: `getSessionTenant()` (session.ts:64-89) REINTENTA una vez
// antes de rendirse, precisamente porque un `fetch failed` de tres segundos no
// es "este usuario no es superadmin". Si el proxy rebotara ante un error, un
// bache de red echaría a Javier de su consola donde hoy el reintento del
// layout lo salva.
//
// Así que la composición es deliberada y las dos mitades hacen falta:
//   · el PROXY niega cuando la base contesta un rol que NO es superadmin —
//     el caso del atacante, que tiene sesión válida y fila legible;
//   · el LAYOUT (`requireSuperadmin`, con su reintento) niega todo lo demás:
//     sin fila, sin poder leerla, o sin sesión.
// Ninguna afloja a la otra: antes de esto el proxy no miraba el rol EN
// ABSOLUTO, así que cualquier negativa suya es estrictamente más restrictiva.
// ═══════════════════════════════════════════════════════════════════════════

type Cb = { getAll: () => unknown[]; setAll: (l: { name: string; value: string; options?: object }[]) => void };
let cookiesCb: Cb;
let usuario: { id: string } | null = null;
/** Lo que contesta `app_user` para la fila del usuario de la sesión. */
let filaRol: { data: { rol: string } | null; error: { message: string } | null } = { data: null, error: null };
let consultas: string[] = [];

vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, opts: { cookies: Cb }) => {
    cookiesCb = opts.cookies;
    return {
      auth: {
        getUser: async () => {
          cookiesCb.setAll([{ name: 'sb-proyecto-auth-token', value: '', options: { path: '/', maxAge: 0 } }]);
          return { data: { user: usuario } };
        },
      },
      from: (tabla: string) => ({
        select: (cols: string) => ({
          eq: (col: string, val: string) => ({
            maybeSingle: async () => {
              consultas.push(`${tabla}.${cols} ${col}=${val}`);
              return filaRol;
            },
          }),
        }),
      }),
    };
  },
}));

const { NextRequest } = await import('next/server');
const { proxy } = await import('./proxy');

function pedir(path: string) {
  const req = new NextRequest(`https://likidaai.vercel.app${path}`);
  req.cookies.set('sb-proyecto-auth-token', 'token-vivo');
  return proxy(req);
}

beforeEach(() => {
  usuario = { id: 'u-1' };
  filaRol = { data: null, error: null };
  consultas = [];
});

describe('/admin: un rol que NO es superadmin se corta en el proxy', () => {
  it('un flota_admin con sesión válida no llega a la página', async () => {
    filaRol = { data: { rol: 'flota_admin' }, error: null };
    const res = await pedir('/admin');
    expect(new URL(res.headers.get('location')!).pathname).toBe('/dashboard');
  });

  it('lo mismo en una SUBRUTA — no solo en la portada de la consola', async () => {
    // Es el punto entero del hallazgo: 20 páginas sin guarda propia. Si el
    // corte fuera solo para `/admin` exacto, `/admin/costos-facturacion`
    // seguiría colgando de que el layout se renderice.
    filaRol = { data: { rol: 'contador' }, error: null };
    const res = await pedir('/admin/costos-facturacion');
    expect(new URL(res.headers.get('location')!).pathname).toBe('/dashboard');
  });

  it('el rebote va a /dashboard, igual que `requireSuperadmin` (guard.ts:48)', async () => {
    // Dos capas que rebotan a sitios distintos es cómo nace un bucle de
    // redirects entre ellas.
    filaRol = { data: { rol: 'encargado' }, error: null };
    const res = await pedir('/admin');
    expect(new URL(res.headers.get('location')!).pathname).toBe('/dashboard');
  });

  it('el rebote lleva cabeceras de seguridad y arrastra las cookies del refresh', async () => {
    filaRol = { data: { rol: 'flota_admin' }, error: null };
    const res = await pedir('/admin');
    // Que haya rebote es parte de la aserción: sin esta línea, la respuesta
    // normal —que también trae cabeceras y la cookie borrada— dejaría la
    // prueba verde sin que el corte existiera.
    expect(new URL(res.headers.get('location')!).pathname).toBe('/dashboard');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Content-Security-Policy')).toBeTruthy();
    expect(res.cookies.get('sb-proyecto-auth-token')?.value).toBe('');
  });

  it('pregunta por SU propia fila, no por la que diga la URL', async () => {
    filaRol = { data: { rol: 'flota_admin' }, error: null };
    await pedir('/admin?tenant=otra-flota&rol=superadmin');
    expect(consultas).toEqual(['app_user.rol id=u-1']);
  });
});

describe('y no se convierte en un candado nuevo', () => {
  it('el superadmin entra', async () => {
    filaRol = { data: { rol: 'superadmin' }, error: null };
    const res = await pedir('/admin');
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });

  it('si la consulta del rol se cae, NO rebota: decide el layout, que reintenta', async () => {
    // Fallar cerrado aquí sería un retroceso: `getSessionTenant` reintenta una
    // vez antes de rendirse, y un `fetch failed` de tres segundos echaría a
    // Javier de su consola. La negativa por ausencia la sigue dando
    // `requireSuperadmin`, que es quien tiene el reintento.
    filaRol = { data: null, error: { message: 'fetch failed' } };
    const res = await pedir('/admin');
    expect(res.headers.get('location')).toBeNull();
  });

  it('sin fila en app_user tampoco rebota aquí — mismo reparto', async () => {
    filaRol = { data: null, error: null };
    const res = await pedir('/admin');
    expect(res.headers.get('location')).toBeNull();
  });

  it('/dashboard no paga la consulta: su autorización por rol es de la página', async () => {
    // El panel del cliente lo ven los tres roles de oficina; qué pantalla ve
    // cada uno lo decide `visibilidad.ts` ruta por ruta, no un prefijo.
    filaRol = { data: { rol: 'flota_admin' }, error: null };
    const res = await pedir('/dashboard');
    expect(res.headers.get('location')).toBeNull();
    expect(consultas, 'se consultó el rol en una ruta que no lo necesita').toEqual([]);
  });

  it('sin sesión sigue mandando a /login, sin preguntar el rol', async () => {
    usuario = null;
    const res = await pedir('/admin');
    expect(new URL(res.headers.get('location')!).pathname).toBe('/login');
    expect(consultas).toEqual([]);
  });
});
