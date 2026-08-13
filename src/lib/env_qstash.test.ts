import { describe, it, expect, vi, afterEach } from 'vitest';
import { faltantes, envHealth } from './env';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17, MEDIO REINCIDENTE: EL PRODUCTOR DE QSTASH ARRANCA CON MENOS
// CONFIGURACIÓN DE LA QUE EL CONSUMIDOR EXIGE, Y NADA LO DICE.
//
// `cron/facturar/route.ts:308` encola en cuanto existe `UPSTASH_QSTASH_TOKEN`.
// `cron/facturar/cola/route.ts:22-28` exige las TRES y devuelve 503 sin las
// firmas. Con el token puesto y las signing keys no: los 8 tickets salen del
// cron, QStash reintenta dos veces contra un 503, el lote muere en la cola de
// Upstash — y el cron contesta `{corrio:true, encolado:true}`. Verde, y nada
// se facturó.
//
// El arreglo de la GUARDA está en `cron/facturar/route.ts`, que en este pase
// es de otro agente. Lo que sí es de este archivo es la otra mitad, y es la
// que convierte el fallo de silencioso en visible: ninguna de las cinco
// `QSTASH_*`/`UPSTASH_*` estaba en el inventario de `env.ts`, así que la
// media configuración no salía en `avisarConfiguracionSilenciosa()`
// (`observability/arranque.ts:84`).
//
// LA REGLA NO ES "SIEMPRE OBLIGATORIAS". QStash es OPCIONAL: sin token, el
// cron factura por el camino síncrono de siempre y eso está bien. Lo que no
// puede existir es la MEDIA configuración. Por eso el grupo es condicional:
// solo se exige lo que el token ya prometió.
// ═══════════════════════════════════════════════════════════════════════════

const BASE = [
  'OPENROUTER_API_KEY',
  'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET',
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
];

function ponerBase() {
  for (const v of BASE) vi.stubEnv(v, 'x');
  // El estado por default de una instancia: QStash sin configurar.
  vi.stubEnv('UPSTASH_QSTASH_TOKEN', '');
  vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', '');
  vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', '');
}

afterEach(() => { vi.unstubAllEnvs(); });

describe('la media configuración de QStash sale en el arranque', () => {
  it('con el token puesto y SIN las dos signing keys, las nombra', () => {
    // El escenario exacto del hallazgo: el cron encolará, el callback dará 503.
    ponerBase();
    vi.stubEnv('UPSTASH_QSTASH_TOKEN', 'qstash_tok');

    expect(faltantes().qstash).toEqual(['QSTASH_CURRENT_SIGNING_KEY', 'QSTASH_NEXT_SIGNING_KEY']);
  });

  it('con una sola de las dos, nombra la que falta y no la otra', () => {
    ponerBase();
    vi.stubEnv('UPSTASH_QSTASH_TOKEN', 'qstash_tok');
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'sig_cur');

    expect(faltantes().qstash).toEqual(['QSTASH_NEXT_SIGNING_KEY']);
  });

  it('una cadena vacía cuenta como ausente, igual que en los otros grupos', () => {
    // En Vercel se puede crear una variable sin valor: `''` pasa cualquier
    // comprobación de existencia y falla en el uso.
    ponerBase();
    vi.stubEnv('UPSTASH_QSTASH_TOKEN', 'qstash_tok');
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', '');
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'sig_next');

    expect(faltantes().qstash).toEqual(['QSTASH_CURRENT_SIGNING_KEY']);
  });
});

describe('y no se convierte en ruido — QStash es opcional a propósito', () => {
  it('sin token no reporta nada: el cron factura síncrono y eso es válido', () => {
    ponerBase();
    expect(faltantes()).toEqual({});
  });

  it('con las tres puestas tampoco', () => {
    ponerBase();
    vi.stubEnv('UPSTASH_QSTASH_TOKEN', 'qstash_tok');
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'sig_cur');
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'sig_next');
    expect(faltantes()).toEqual({});
  });

  it('sin token, unas signing keys sueltas no se reclaman', () => {
    // Restos de una configuración anterior no son una falla que avisar.
    ponerBase();
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'sig_cur');
    expect(faltantes()).toEqual({});
  });
});

describe('lo que un anónimo puede preguntar NO cambia', () => {
  it('`envHealth()` sigue siendo exactamente los tres grupos', () => {
    // `GET /api/demo` es público y devuelve esto. El inventario de arranque
    // creció; la superficie pública no. Si algún día `qstash` aparece aquí,
    // esta prueba lo detiene: sería contar de más a quien no tiene sesión.
    ponerBase();
    vi.stubEnv('UPSTASH_QSTASH_TOKEN', 'qstash_tok');

    expect(Object.keys(envHealth()).sort()).toEqual(['llm', 'supabase', 'whatsapp']);
    expect(envHealth()).toEqual({ llm: true, whatsapp: true, supabase: true });
  });
});
