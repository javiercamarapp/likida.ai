// Inventario de las variables de entorno cuya ausencia sí rompe algo, y quién
// falta de cada grupo.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUÉ ESTO REPORTA Y YA NO LANZA (auditoría 5, MEDIO)
//
// Aquí vivía `requireEnv(group)`, que lanzaba con un mensaje claro y cuyo propio
// comentario decía «llamar en los paths críticos». Verificado con dos búsquedas
// distintas: la única aparición en todo el repo era su definición. Nunca se
// invocó. Un validador que nadie llama no es una defensa, es una promesa: al
// leer el archivo parece que la configuración está vigilada.
//
// No se le buscó un sitio donde lanzar, se cambió el mecanismo, por dos razones:
//
//   · Lanzar en el arranque de una función serverless no detiene nada — Vercel
//     vuelve a levantar la instancia en la siguiente petición. Convierte un
//     problema de configuración en una tormenta de 500 sin explicación, que es
//     peor que arrancar mal y decirlo.
//   · El resto del sistema ya decidió reportar en vez de lanzar cuando la
//     alternativa es tumbar el turno de un operador (`observability/arranque.ts`,
//     `cuadra/startup.ts`). Dos criterios distintos para lo mismo es lo que hace
//     que uno de los dos se ignore.
//
// Ahora `faltantes()` tiene un consumidor real: `avisarConfiguracionSilenciosa()`
// lo emite en el arranque de cada instancia desplegada. Si vuelve a quedarse sin
// llamar, sobra.
// ═══════════════════════════════════════════════════════════════════════════

const GROUPS = {
  llm: ['OPENROUTER_API_KEY'],
  whatsapp: ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET'],
  // `NEXT_PUBLIC_SUPABASE_ANON_KEY` entró al grupo con el login por usuario: la
  // usan `proxy.ts` y `supabase/server.ts`, así que sin ella `createServerClient`
  // lanza DENTRO del middleware y CADA petición a /dashboard se vuelve un 500.
  // Rompe ruidosamente, sí, pero en el turno de alguien y con el error del SDK:
  // aquí sale antes, con el nombre exacto.
  supabase: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
} as const;

/**
 * Los grupos CONDICIONALES: no se exigen siempre, se exigen en cuanto otra
 * variable ya prometió que la integración está encendida.
 *
 * AUDITORÍA 17, MEDIO reincidente. QStash es opcional a propósito —sin token,
 * `cron/facturar` factura por el camino síncrono de siempre—, pero la MEDIA
 * configuración es un fallo callado y caro: el productor
 * (`cron/facturar/route.ts:308`) encola en cuanto existe
 * `UPSTASH_QSTASH_TOKEN`, y el consumidor (`cola/route.ts:22-28`) devuelve
 * **503** si le falta cualquiera de las dos signing keys. Los 8 tickets salen
 * del cron, QStash reintenta dos veces contra el 503, el lote muere en la cola
 * de Upstash — y el cron ya contestó `{corrio:true, encolado:true}`. Verde, y
 * nada se facturó.
 *
 * Meterlas en `GROUPS` habría sido peor que no meterlas: una instancia que a
 * propósito no usa QStash gritaría tres faltantes en cada arranque, y un aviso
 * que siempre está encendido es un aviso que nadie lee.
 *
 * `QSTASH_URL` NO entra: su ausencia tiene un default correcto en el cliente
 * (`baseUrl: … ?? undefined`), así que no es media configuración.
 */
const CONDICIONALES = {
  qstash: {
    si: 'UPSTASH_QSTASH_TOKEN',
    exige: ['QSTASH_CURRENT_SIGNING_KEY', 'QSTASH_NEXT_SIGNING_KEY'],
  },
} as const;

/** Los grupos SIEMPRE obligatorios — los únicos que `envHealth()` publica. */
export type EnvGroup = keyof typeof GROUPS;
/** Grupo del inventario de arranque: los obligatorios más los condicionales. */
export type GrupoConfig = EnvGroup | keyof typeof CONDICIONALES;

const GRUPOS = Object.keys(GROUPS) as EnvGroup[];
const GRUPOS_COND = Object.keys(CONDICIONALES) as Array<keyof typeof CONDICIONALES>;

/**
 * Qué variable falta de cada grupo. Objeto vacío = todo puesto.
 *
 * Devuelve NOMBRES, nunca valores: lo consume el log de arranque de producción.
 */
export function faltantes(): Partial<Record<GrupoConfig, string[]>> {
  const out: Partial<Record<GrupoConfig, string[]>> = {};
  for (const g of GRUPOS) {
    const sinPoner = GROUPS[g].filter((k) => !process.env[k]);
    if (sinPoner.length) out[g] = sinPoner;
  }
  for (const g of GRUPOS_COND) {
    const { si, exige } = CONDICIONALES[g];
    // Sin el disparador, la integración está apagada y no falta nada. Con él,
    // lo que no esté puesto es una promesa a medias.
    if (!process.env[si]) continue;
    const sinPoner = exige.filter((k) => !process.env[k]);
    if (sinPoner.length) out[g] = sinPoner;
  }
  return out;
}

/** Reporte de configuración (para un health-check / panel admin). */
export function envHealth(): Record<EnvGroup, boolean> {
  return {
    llm: GROUPS.llm.every((k) => !!process.env[k]),
    whatsapp: GROUPS.whatsapp.every((k) => !!process.env[k]),
    supabase: GROUPS.supabase.every((k) => !!process.env[k]),
  };
}
