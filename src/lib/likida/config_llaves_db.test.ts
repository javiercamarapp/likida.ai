import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ═══════════════════════════════════════════════════════════════════════════
// LA BASE TENÍA UNA LISTA BLANCA Y EL TIPO SE LE ADELANTÓ. 15-AGO-2026 (DAT-C1).
//
// `tenant.config` lo valida `config_tenant_valida()` en un CHECK que corre en
// CADA update de `tenant` (`0026_tenant_config_esquema.sql:336`). Su "Regla 2:
// nada de llaves inventadas" lanza excepción ante cualquier llave de primer
// nivel que no esté en su array `llaves_ok`. La intención es buena: una llave
// mal escrita no da error, se guarda, no la lee nadie, y la flota corre con
// DEMO_CONFIG creyendo que corre con sus topes.
//
// El efecto es simétrico y nadie lo cubría: cuando `CuadraConfig` ESTRENA una
// llave y la lista blanca no se actualiza, el guardado legítimo se rechaza
// SIEMPRE. Fue exactamente lo que pasó con `agentes` (config.ts:64, la
// estrategia editable por flota): `guardarEstrategiaAgente`
// (`agentes/estrategia.ts:79-85`) escribe `{agentes:{…}}` y el CHECK lo tumba
// en el 100% de los intentos. La pantalla de estrategia no podía guardar nada.
//
// LO QUE ESTA PRUEBA PRUEBA Y LO QUE NO. Es un escaneo de fuente, como
// `embeds_con_alias` y `dinero_por_area`: ata el array `llaves_ok` de la
// ÚLTIMA migración que lo define contra las llaves de primer nivel de
// `CuadraConfig`. Ninguna suite lo podía ver antes porque el escritor toca
// Supabase y los mocks aceptan cualquier objeto. NO valida la FORMA de cada
// subárbol — eso lo hacen los bloques específicos de la propia función.
// ═══════════════════════════════════════════════════════════════════════════

const RAIZ = join(__dirname, '../../..');
const MIGRACIONES = join(RAIZ, 'supabase/migrations');

/** La última migración (por número) que define `llaves_ok`. Es la que manda:
 *  `create or replace function` deja viva solo a la más reciente. */
function ultimaMigracionConListaBlanca(): { archivo: string; sql: string } {
  const archivos = readdirSync(MIGRACIONES)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  let encontrada: { archivo: string; sql: string } | null = null;
  for (const archivo of archivos) {
    const sql = readFileSync(join(MIGRACIONES, archivo), 'utf8');
    if (sql.includes('llaves_ok')) encontrada = { archivo, sql };
  }
  if (!encontrada) throw new Error('Ninguna migración define `llaves_ok`.');
  return encontrada;
}

/** Saca las cadenas del literal `llaves_ok text[] := array[…];`. */
function llavesDeLaBase(sql: string): string[] {
  const m = sql.match(/llaves_ok\s+text\[\]\s*:=\s*array\[([\s\S]*?)\]/);
  if (!m) throw new Error('No pude leer el literal de `llaves_ok`.');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/** El tipo de la config del tenant. Se llamó `CuadraConfig` hasta el renombre
 *  a Likida — los comentarios de las migraciones viejas todavía lo citan con
 *  el nombre anterior, así que se aceptan los dos y no se ata a ninguno. */
const TIPO_CONFIG = /export interface (?:Likida|Cuadra)Config\b/;

/** Las llaves de primer nivel del tipo de la config. */
function llavesDelTipo(): string[] {
  const ts = readFileSync(join(RAIZ, 'src/lib/likida/config.ts'), 'utf8');
  const m = TIPO_CONFIG.exec(ts);
  if (!m) throw new Error('No encontré la interfaz de la config del tenant.');
  const i = m.index;
  const cuerpo = ts.slice(ts.indexOf('{', i) + 1);

  // Recorre el cuerpo contando llaves para quedarse SOLO con el nivel 1.
  const llaves: string[] = [];
  let prof = 0;
  for (const linea of cuerpo.split('\n')) {
    if (prof === 0) {
      const m = linea.match(/^\s{2}([a-zA-Z][a-zA-Z0-9_]*)\??\s*:/);
      if (m) llaves.push(m[1]);
    }
    prof += (linea.match(/\{/g) ?? []).length - (linea.match(/\}/g) ?? []).length;
    if (prof < 0) break; // cerró la interfaz
  }
  return llaves;
}

describe('tenant.config — la lista blanca de la base contra CuadraConfig', () => {
  it('la base conoce TODAS las llaves de primer nivel del tipo', () => {
    const { archivo, sql } = ultimaMigracionConListaBlanca();
    const enLaBase = llavesDeLaBase(sql);
    const enElTipo = llavesDelTipo();

    const faltantes = enElTipo.filter((k) => !enLaBase.includes(k));

    expect(
      faltantes,
      `CuadraConfig declara ${faltantes.join(', ')} y la lista blanca de ` +
        `${archivo} no. El CHECK tenant_config_valida corre en cada update de ` +
        `tenant, así que guardar esa llave falla SIEMPRE — con excepción de ` +
        `Postgres, no con un error que la pantalla sepa explicar. ` +
        `Se arregla con una migración nueva que reemplace la función.`,
    ).toEqual([]);
  });

  it('la base no admite llaves que el tipo ya no tiene', () => {
    const { archivo, sql } = ultimaMigracionConListaBlanca();
    const enLaBase = llavesDeLaBase(sql);
    const enElTipo = llavesDelTipo();

    const sobrantes = enLaBase.filter((k) => !enElTipo.includes(k));

    expect(
      sobrantes,
      `${archivo} admite ${sobrantes.join(', ')}, que CuadraConfig ya no ` +
        `declara. Una llave de más deja pasar el typo que la función existe ` +
        `para atrapar.`,
    ).toEqual([]);
  });
});
