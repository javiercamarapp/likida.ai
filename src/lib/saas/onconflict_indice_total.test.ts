import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ═══════════════════════════════════════════════════════════════════════════
// UN `onConflict` CONTRA UN ÍNDICE ÚNICO **PARCIAL** NO ES UN UPSERT: ES UN 500.
//
// PostgREST traduce `{ onConflict: 'col' }` a `ON CONFLICT (col) DO UPDATE`,
// sin predicado — no tiene forma de emitir uno. Postgres solo infiere un índice
// parcial si la sentencia repite su `WHERE`, así que contra
// `create unique index ... (col) where col is not null` contesta:
//
//   ERROR: there is no unique or exclusion constraint matching the
//          ON CONFLICT specification            (SQLSTATE 42P10)
//
// Y falla **siempre**, también sobre tabla vacía: no es una carrera, es que la
// escritura nunca ocurre. Reproducido en Postgres 16.13 contra el esquema real.
//
// El modo de falla es caro porque es silencioso del lado del código: se lee
// como un upsert normal y el error solo aparece en producción, en el webhook
// de Stripe, después de que la flota ya pagó.
//
// Esta prueba mira la CLASE, no el caso: recorre cada `onConflict` de `src/` y
// exige que las migraciones declaren un único TOTAL sobre esas columnas.
// ═══════════════════════════════════════════════════════════════════════════

const DIR_MIGRACIONES = 'supabase/migrations';

/** Todos los `.ts` de `src/`, sin pruebas. */
function fuentes(dir = 'src'): string[] {
  const salida: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) salida.push(...fuentes(p));
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) salida.push(p);
  }
  return salida;
}

type Sitio = { archivo: string; linea: number; tabla: string; columnas: string[] };

/**
 * Cada `onConflict: '...'` con la tabla del `.from('...')` que lo precede.
 * La cadena siempre es `.from(tabla).upsert(fila, { onConflict })`, así que el
 * `.from` más cercano hacia arriba es el suyo.
 */
function sitiosOnConflict(): Sitio[] {
  const sitios: Sitio[] = [];
  for (const archivo of fuentes()) {
    const lineas = readFileSync(archivo, 'utf8').split('\n');
    for (let i = 0; i < lineas.length; i++) {
      const m = lineas[i].match(/onConflict:\s*'([^']+)'/);
      if (!m) continue;
      let tabla: string | null = null;
      for (let j = i; j >= 0 && j > i - 40; j--) {
        const f = lineas[j].match(/\.from\('([a-z0-9_]+)'\)/);
        if (f) { tabla = f[1]; break; }
      }
      if (!tabla) throw new Error(`${archivo}:${i + 1} — onConflict sin .from() a la vista`);
      sitios.push({
        archivo, linea: i + 1, tabla,
        columnas: m[1].split(',').map((c) => c.trim()),
      });
    }
  }
  return sitios;
}

/** El SQL de todas las migraciones, en orden, sin comentarios `--`. */
function sqlMigraciones(): string {
  return readdirSync(DIR_MIGRACIONES).sort()
    .map((f) => readFileSync(join(DIR_MIGRACIONES, f), 'utf8').replace(/--[^\n]*/g, ''))
    .join('\n');
}

const norm = (cols: string) => cols.split(',').map((c) => c.trim().toLowerCase()).sort().join(',');

/**
 * ¿Las migraciones declaran un único **sin predicado** sobre esas columnas?
 * Cuenta las dos formas: `create unique index ... on tabla (cols)` y la
 * restricción `unique (cols)` dentro del `create table`.
 */
function tieneUnicoTotal(tabla: string, columnas: string[]): boolean {
  const sql = sqlMigraciones();
  const objetivo = norm(columnas.join(','));

  // `create unique index [if not exists] <nombre> on [public.]<tabla> (<cols>) [where ...];`
  const reIndice = new RegExp(
    `create\\s+unique\\s+index[\\s\\S]*?\\bon\\s+(?:public\\.)?${tabla}\\s*\\(([^)]*)\\)([^;]*);`,
    'gi',
  );
  for (const m of sql.matchAll(reIndice)) {
    if (norm(m[1]) !== objetivo) continue;
    if (/\bwhere\b/i.test(m[2])) continue; // parcial: Postgres no lo infiere
    return true;
  }

  // Restricción `unique (...)` dentro del `create table <tabla> ( ... );`
  const reTabla = new RegExp(
    `create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+(?:public\\.)?${tabla}\\s*\\(([\\s\\S]*?)\\n\\);`,
    'i',
  );
  const cuerpo = sql.match(reTabla)?.[1];
  if (cuerpo) {
    for (const m of cuerpo.matchAll(/\bunique\s*\(([^)]*)\)/gi)) {
      if (norm(m[1]) === objetivo) return true;
    }
  }
  return false;
}

describe('cada onConflict tiene un índice único TOTAL que Postgres pueda inferir', () => {
  const sitios = sitiosOnConflict();

  it('hay sitios que revisar (si esto falla, el escáner dejó de encontrarlos)', () => {
    expect(sitios.length).toBeGreaterThanOrEqual(4);
  });

  it.each(sitios.map((s) => [`${s.archivo}:${s.linea} → ${s.tabla}(${s.columnas.join(',')})`, s] as const))(
    '%s',
    (_titulo, s) => {
      expect(
        tieneUnicoTotal(s.tabla, s.columnas),
        `${s.archivo}:${s.linea} hace upsert con onConflict '${s.columnas.join(',')}' sobre `
        + `'${s.tabla}', pero las migraciones no declaran un único SIN predicado sobre esas `
        + `columnas. PostgREST emite ON CONFLICT sin WHERE, así que Postgres contesta 42P10 `
        + `y la escritura nunca ocurre — ni siquiera con la tabla vacía.`,
      ).toBe(true);
    },
  );
});

describe('el caso que lo destapó: factura_saas', () => {
  it('el único de stripe_invoice_id no puede ser parcial', () => {
    const sql = sqlMigraciones();
    const indices = [...sql.matchAll(
      /create\s+unique\s+index[\s\S]*?\bon\s+(?:public\.)?factura_saas\s*\(([^)]*)\)([^;]*);/gi,
    )].filter((m) => norm(m[1]) === 'stripe_invoice_id');

    expect(indices.length, 'ninguna migración declara el único de factura_saas.stripe_invoice_id')
      .toBeGreaterThan(0);
    // Al menos uno tiene que ser total: el último que quede en pie es el que
    // Postgres usa, y `suscripcion.ts` hace `onConflict: 'stripe_invoice_id'`.
    expect(
      indices.some((m) => !/\bwhere\b/i.test(m[2])),
      'todos los únicos de factura_saas.stripe_invoice_id son PARCIALES (`where ... is not null`). '
      + 'aplicarFactura() en src/lib/saas/suscripcion.ts no puede escribir NUNCA: cada invoice.paid '
      + 'de Stripe termina en 500 y la flota queda pagada sin fila en factura_saas.',
    ).toBe(true);
  });
});
