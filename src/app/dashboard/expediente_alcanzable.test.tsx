import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pases 4 y 5), ALTO — EL EXPEDIENTE Y SU "DESCARGAR PDF" NO
// TENÍAN UN SOLO ENLACE ENTRANTE.
//
// `/dashboard/<uuid>` es la única pantalla con el desglose de IVA/IEPS, la
// deducibilidad por renglón y el botón que baja el PDF que le llega al contador
// de la flota. Las dos páginas que enlazaban ahí (`dashboard/cuadre` y
// `dashboard/analitica`) se borraron en `2be4b1c`; por ser ruta DINÁMICA no
// puede estar en `rutas.ts`, así que `sidebar_puerta.test.tsx` —que cubre las
// ocho estáticas— no puede alcanzarla. Resultado: el entregable que da nombre
// al producto ("entrega la liquidación en PDF") solo se abría pegando un UUID
// en la barra de direcciones.
//
// Por eso esta prueba tiene dos mitades: el componente que ahora sí enlaza (se
// renderiza de verdad y se cuentan sus `href`), y un barrido del árbol que
// afirma que ALGUIEN enlaza — que es la mitad que faltaba y la que se vuelve a
// romper si mañana se borra la sección que lo hace.
// ═══════════════════════════════════════════════════════════════════════════

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const { UltimasLiquidaciones } = await import('./ultimas-liquidaciones');

const FILAS = [
  { id: '0f3a9c3e-1111-4c2b-9d9e-aaaaaaaaaaaa', folio: 'TI-0412', creadoEn: '2026-08-10T15:00:00Z', comprobado: 18400, diferencia: 0, estatus: 'cuadrada' },
  { id: '0f3a9c3e-2222-4c2b-9d9e-bbbbbbbbbbbb', folio: 'TI-0413', creadoEn: '2026-08-11T15:00:00Z', comprobado: 9200, diferencia: -640.5, estatus: 'revisar' },
];

describe('la lista de liquidaciones lleva al expediente', () => {
  it('cada fila trae un link a /dashboard/<id>', () => {
    const html = renderToStaticMarkup(<UltimasLiquidaciones liquidaciones={FILAS} />);
    for (const f of FILAS) expect(html).toContain(`href="/dashboard/${f.id}"`);
  });

  it('el link arrastra el `?tenant=`/`?vista=`/`?rol=` — si no, el superadmin cae en la demo', () => {
    const html = renderToStaticMarkup(<UltimasLiquidaciones liquidaciones={FILAS} sufijo="?tenant=t-1&rol=contador" />);
    expect(html).toContain(`href="/dashboard/${FILAS[0].id}?tenant=t-1&amp;rol=contador"`);
  });

  it('con la consulta caída dice que no se pudo leer, no que no haya liquidaciones', () => {
    const html = renderToStaticMarkup(<UltimasLiquidaciones liquidaciones={null} />);
    expect(html).toMatch(/No se pudieron leer/);
    expect(html).not.toMatch(/Todavía no hay liquidaciones/);
  });

  it('y un vacío REAL sí se puede decir', () => {
    const html = renderToStaticMarkup(<UltimasLiquidaciones liquidaciones={[]} />);
    expect(html).toMatch(/Todavía no hay liquidaciones/);
  });
});

// ── El barrido: ¿alguien en el producto enlaza a la ruta dinámica? ──────────

/** Todos los .tsx de `src/app`, sin pruebas. */
function fuentes(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) fuentes(p, acc);
    else if (p.endsWith('.tsx') && !p.includes('.test.')) acc.push(p);
  }
  return acc;
}

describe('el expediente tiene al menos una puerta de entrada en la interfaz', () => {
  it('EL BUG: existe un href interpolado a /dashboard/<id> en una pantalla ALCANZABLE', () => {
    // La forma que se busca es la del link REAL: `/dashboard/${…}`. Un href
    // literal a una de las ocho rutas estáticas no cuenta — la que no tenía
    // puerta es la dinámica.
    //
    // Y no basta con que el link exista en un archivo: un componente huérfano
    // que nadie importa no es una puerta. Se exige que el archivo sea una
    // página o que alguien más en `src/app` lo importe.
    const todos = fuentes('src/app');
    const sin = (f: string) => readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
    const importado = (f: string) => {
      const nombre = f.split('/').pop()!.replace(/\.tsx$/, '');
      return todos.some((o) => o !== f && new RegExp(`from '[^']*/${nombre}'|from '\\./${nombre}'`).test(sin(o)));
    };
    const puertas = todos.filter((f) =>
      /href=\{`\/dashboard\/\$\{/.test(sin(f)) && (/\/(page|layout)\.tsx$/.test(f) || importado(f)));
    expect(
      puertas,
      'ninguna pantalla alcanzable enlaza a /dashboard/<uuid>: el expediente y su "Descargar PDF" solo se abren tecleando el UUID',
    ).not.toEqual([]);
  });

  it('y el Resumen del dueño es una de ellas — es la pantalla del demo', () => {
    const src = readFileSync('src/app/dashboard/page.tsx', 'utf8');
    expect(src).toContain('UltimasLiquidaciones');
    expect(src).toContain('getLiquidaciones');
  });
});
