import { describe, it, expect, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17, BAJO REINCIDENTE: `/cuenta` estaba fuera del matcher.
//
// `src/app/cuenta/page.tsx` lee `tenant.nombre` con `supabaseAdmin()` (:10-11),
// que es service_role y BYPASEA RLS, y tenía UNA sola puerta: su propio
// `requireSessionTenant('/cuenta')`. Era la única página con datos del tenant
// que dependía de una capa por omisión de la lista, justo donde el comentario
// de `proxy.ts:97-99` dice, con todas sus letras, que sobrar es barato y
// faltar es caro.
//
// El archivo va aparte de `proxy.test.ts` (que prueba el refresh de cookies y
// la CSP) porque prueba otra cosa: la COBERTURA del matcher, medida contra el
// árbol de páginas y no contra una lista escrita a mano — que es exactamente
// como `/cuenta` se quedó fuera cuatro pases seguidos.
// ═══════════════════════════════════════════════════════════════════════════

type Cb = { getAll: () => unknown[]; setAll: (l: { name: string; value: string; options?: object }[]) => void };
let cookiesCb: Cb;
let usuario: { id: string } | null = null;

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
    };
  },
}));

const { NextRequest } = await import('next/server');
const { proxy, RUTAS_CON_SESION } = await import('./proxy');
const { readFileSync, readdirSync } = await import('node:fs');

function pedir(path: string) {
  const req = new NextRequest(`https://likidaai.vercel.app${path}`);
  req.cookies.set('sb-proyecto-auth-token', 'token-muerto');
  return proxy(req);
}

beforeEach(() => { usuario = null; });

describe('/cuenta pasa por la primera capa, como el resto del panel', () => {
  it('sin sesión, el proxy la manda a /login antes de tocar la página', async () => {
    const res = await pedir('/cuenta');
    const destino = new URL(res.headers.get('location')!);
    expect(destino.pathname).toBe('/login');
    expect(destino.searchParams.get('next')).toBe('/cuenta');
  });

  it('con sesión pasa, y no se cachea: trae el nombre de la flota', async () => {
    usuario = { id: 'u-1' };
    const res = await pedir('/cuenta');
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });

  it('sigue llevando las cabeceras de seguridad en el redirect', async () => {
    const res = await pedir('/cuenta');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Content-Security-Policy')).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Y LA LISTA SE MIDE CONTRA EL ÁRBOL, NO CONTRA LA MEMORIA.
//
// `proxy.test.ts` fija la lista con un `toEqual` escrito a mano: atrapa el
// borrado accidental de una entrada, no la página NUEVA que nadie agregó —
// que es el modo en que `/chofer` primero y `/cuenta` después se quedaron
// fuera. Esto lo mide al revés: recorre `src/app`, se queda con las páginas
// que llaman a una de las dos guardas de sesión, y exige que cada una caiga
// bajo algún prefijo de `RUTAS_CON_SESION`.
// ═══════════════════════════════════════════════════════════════════════════
describe('ninguna página con guarda propia se queda fuera del matcher', () => {
  /** Rutas de `src/app/**\/page.tsx` cuyo archivo llama a una guarda de sesión. */
  function paginasGateadas(dir: string, ruta: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        // Los grupos de ruta `(x)` y los privados `_x` no cuentan como segmento.
        const seg = e.name.startsWith('(') || e.name.startsWith('_') ? '' : `/${e.name}`;
        paginasGateadas(`${dir}/${e.name}`, `${ruta}${seg}`, out);
      } else if (e.name === 'page.tsx') {
        const src = readFileSync(`${dir}/${e.name}`, 'utf8');
        if (/requireSessionTenant|requireSuperadmin|resolverTenantEfectivo|exigirVerRuta/.test(src)) {
          out.push(ruta || '/');
        }
      }
    }
    return out;
  }

  it('cada página con `requireSessionTenant`/`requireSuperadmin` cae bajo un prefijo', () => {
    const gateadas = paginasGateadas('src/app', '');
    // Guarda de la guarda: si el barrido dejara de encontrar páginas, la
    // prueba pasaría por vacío y no diría nada.
    expect(gateadas.length, 'el barrido no encontró ninguna página gateada').toBeGreaterThan(3);

    const huerfanas = gateadas.filter(
      (r) => !RUTAS_CON_SESION.some((p) => r === p || r.startsWith(`${p}/`)),
    );
    expect(
      huerfanas,
      `estas páginas se protegen solas, sin la primera capa del proxy:\n  ${huerfanas.join('\n  ')}\n\n` +
      'Agrega su prefijo a RUTAS_CON_SESION. Sobrar ahí cuesta un login de más; faltar sirve una pantalla con datos del tenant a quien no inició sesión.',
    ).toEqual([]);
  });

  it('y la lista no se llenó de prefijos que no protegen nada', async () => {
    // El otro lado del mismo cuidado: un prefijo que ya no corresponde a
    // ninguna página gateada manda a /login a quien no lo necesita.
    const gateadas = paginasGateadas('src/app', '');
    for (const p of RUTAS_CON_SESION) {
      expect(
        gateadas.some((r) => r === p || r.startsWith(`${p}/`)),
        `${p} está en el matcher y ninguna página suya tiene guarda propia`,
      ).toBe(true);
    }
  });
});
