import { describe, it, expect, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17, BAJO REINCIDENTE DE SEGURIDAD: `resolverTenantEfectivo`
// resolvía `?tenant=` SIN mirar `error`.
//
// supabase-js reporta los fallos POR VALOR: cuando la consulta se cae,
// `data` es null y `error` trae el motivo. Sin comprobar `error`, "no pude
// preguntar" se lee EXACTAMENTE igual que "ese uuid no existe" —los dos son
// `data: null`— y la página sigue con el tenant de la sesión.
//
// Lo caro no es el tenant: es que el badge "viendo como superadmin"
// (`[id]/page.tsx:170-174`) solo se pinta cuando `tenantNombre` se llenó. Un
// bache de red al abrir "Ver dashboard" de Transportes del Bajío deja a Javier
// mirando la flota DEMO con la pantalla de la flota real en la cabeza, y sin
// una sola señal de que la sustitución ocurrió.
//
// Sus dos hermanas ya lo hacían bien —`resolverTenantApi` (tenant-api.ts:63-67,
// 503) y `resolverTenantPedido` (:92-98, lanza)—; ésta era la única de las
// tres que no. Este archivo va aparte de `tenant-efectivo.test.ts` porque ese
// mockea `supabaseAdmin` con una respuesta fija y aquí hace falta gobernarla
// respuesta por respuesta.
// ═══════════════════════════════════════════════════════════════════════════

const redirect = vi.fn(() => { throw new Error('NEXT_REDIRECT'); });
vi.mock('next/navigation', () => ({ redirect: (...a: unknown[]) => redirect(...(a as [])) }));

const requireSessionTenant = vi.fn();
vi.mock('./guard', () => ({ requireSessionTenant: (...a: unknown[]) => requireSessionTenant(...a) }));

/** Cola de respuestas de `maybeSingle()`, en orden de consulta. */
let respuestas: Array<{ data: unknown; error: unknown }> = [];
const consultados: string[] = [];

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: (_col: string, valor: string) => ({
          maybeSingle: async () => {
            consultados.push(valor);
            return respuestas.shift() ?? { data: null, error: null };
          },
        }),
      }),
    }),
  }),
}));

const errores = vi.fn();
vi.mock('@/lib/logger', () => ({
  logger: {
    error: (...a: unknown[]) => errores(...a),
    warn: () => {}, info: () => {}, debug: () => {},
  },
}));

const { resolverTenantEfectivo } = await import('./tenant-efectivo');

const SUPER = {
  userId: 'u-0', tenantId: 'tenant-demo', rol: 'superadmin',
  nombre: 'Javier', operadorId: null, avatarUrl: null,
};

beforeEach(() => {
  redirect.mockClear();
  requireSessionTenant.mockReset();
  requireSessionTenant.mockResolvedValue(SUPER);
  errores.mockClear();
  respuestas = [];
  consultados.length = 0;
});

describe('un `?tenant=` que no se pudo verificar NO cae en silencio a la sesión', () => {
  it('la consulta caída LANZA en vez de servir otra flota', async () => {
    respuestas = [{ data: null, error: { message: 'fetch failed' } }];

    await expect(
      resolverTenantEfectivo('/dashboard/suscripcion', { tenant: 'tenant-bajio' }),
    ).rejects.toThrow(/no se pudo verificar la flota/i);
  });

  it('y NO devuelve el tenant de la sesión con el badge apagado', async () => {
    // Éste es el hallazgo con todas sus letras: antes del arreglo la llamada
    // resolvía bien, con `tenantId` = el de la sesión y `tenantNombre` = null,
    // que es justo la combinación que apaga la cinta de "viendo como
    // superadmin". Si algún día se decide degradar en vez de lanzar, esta
    // prueba tiene que seguir prohibiendo ESA combinación.
    respuestas = [{ data: null, error: { message: 'fetch failed' } }];

    const r = await resolverTenantEfectivo('/dashboard/suscripcion', { tenant: 'tenant-bajio' })
      .catch(() => null);

    expect(r, 'siguió adelante con un tenant que no pudo verificar').toBeNull();
  });

  it('lo deja escrito en el log de errores, no solo en la pantalla', async () => {
    respuestas = [{ data: null, error: { message: 'fetch failed' } }];

    await resolverTenantEfectivo('/dashboard/suscripcion', { tenant: 'tenant-bajio' }).catch(() => null);

    expect(errores).toHaveBeenCalled();
    expect(String(errores.mock.calls[0]?.[0])).toMatch(/tenant/);
  });
});

describe('lo que NO cambia — el arreglo no puede volverse un candado de más', () => {
  it('un `?tenant=` que sí existe se resuelve, con nombre para el badge', async () => {
    respuestas = [{ data: { id: 'tenant-bajio', nombre: 'Transportes del Bajío' }, error: null }];

    const r = await resolverTenantEfectivo('/dashboard/suscripcion', { tenant: 'tenant-bajio' });

    expect(r.tenantId).toBe('tenant-bajio');
    expect(r.tenantNombre).toBe('Transportes del Bajío');
    expect(r.tenantExiste).toBe(true);
  });

  it('un uuid que NO existe sigue cayendo en silencio a la sesión (enlace viejo)', async () => {
    // Distinguir los dos casos es el punto entero: "no existe" no puede
    // volverse un error, o un enlace viejo del panel rompe la pantalla.
    respuestas = [
      { data: null, error: null },   // el ?tenant= pedido: no hay fila
      { data: null, error: null },   // la comprobación de existencia del propio
    ];

    const r = await resolverTenantEfectivo('/dashboard/suscripcion', { tenant: 'tenant-borrado' });

    expect(r.tenantId).toBe('tenant-demo');
    expect(r.tenantNombre).toBeNull();
    expect(consultados).toEqual(['tenant-borrado', 'tenant-demo']);
  });

  it('a un rol real ni se le lee el `?tenant=`: no hay consulta que se pueda caer', async () => {
    requireSessionTenant.mockResolvedValue({
      userId: 'u-1', tenantId: 't-1', rol: 'flota_admin',
      nombre: 'Ana', operadorId: null, avatarUrl: null,
    });
    respuestas = [{ data: null, error: { message: 'fetch failed' } }];

    const r = await resolverTenantEfectivo('/dashboard/suscripcion', { tenant: 'tenant-bajio' });

    expect(r.tenantId).toBe('t-1');
    expect(consultados, 'se consultó la tabla por un rol que no puede cambiar de flota').toEqual([]);
  });
});
