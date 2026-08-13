import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { TablaSinAsignar } from './tablero-operacion';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pases 4 y 5), ALTO — EL PANEL LE GRITA AL JEFE DE TRÁFICO
// "3 VIAJES SIN CHOFER" Y NO LE DA CON QUÉ ASIGNARLOS.
//
// `inicio-operacion.tsx` arma la banda de urgentes y pinta "Atender · 3 viajes
// sin chofer." con los folios debajo, en `<li>` de puro texto: ni un `<select>`
// ni un `<form>` en toda la pantalla. Las dos vías que existían están cerradas
// para este rol:
//   · `/dashboard/despacho` (donde vivían el select de operador y la server
//     action `asignar`) se borró en `2be4b1c`;
//   · `/dashboard/<id>` sí tiene "Reasignar" y `puedeAsignar` SÍ incluye al
//     encargado, pero la página entera se le niega antes
//     (`puedeVerArea(rol,'dinero')`, y el encargado solo tiene `operacion`).
//
// O sea: al usuario DIARIO del producto se le exige actuar y no hay dónde. Es
// justo lo que el propio archivo dice evitar: "una banda de alertas que siempre
// dice algo entrena a ignorarla".
//
// El arreglo devuelve `TablaSinAsignar` a `tablero-operacion.tsx` —de donde
// salió al borrar despacho, ver la nota de cabecera de ese archivo— y la
// escritura la hace `reasignarOperador` (`lib/likida/repo.ts`), que ya
// comprueba que el operador sea de la misma flota. Aquí se renderiza el
// componente REAL: `inicio-operacion.tsx` es un Server Component asíncrono con
// cinco consultas y no se puede montar en vitest.
// ═══════════════════════════════════════════════════════════════════════════

const VIAJES = [
  { id: 'v1', folio: 'TI-0412', origen: 'Monterrey', destino: 'Querétaro', fechaInicio: '2026-08-12', estatus: 'abierto' },
  { id: 'v2', folio: 'TI-0413', origen: 'Saltillo', destino: 'CDMX', fechaInicio: '2026-08-12', estatus: 'abierto' },
  { id: 'v3', folio: 'TI-0414', origen: null, destino: null, fechaInicio: null, estatus: 'abierto' },
];
const OPERADORES = [{ id: 'o1', nombre: 'Rubén Álvarez' }, { id: 'o2', nombre: 'Martha Solís' }];
const ACCION = async () => { /* la server action real vive en la página */ };

describe('los viajes sin chofer se pueden asignar desde donde se anuncian', () => {
  it('EL BUG: cada fila trae un selector de chofer y un botón que la despacha', () => {
    const html = renderToStaticMarkup(
      <TablaSinAsignar viajes={VIAJES} operadores={OPERADORES} accion={ACCION} />,
    );
    expect((html.match(/<form/g) ?? []).length, 'una forma por viaje sin chofer').toBe(3);
    expect((html.match(/name="operadorId"/g) ?? []).length).toBe(3);
    for (const v of VIAJES) expect(html).toContain(`value="${v.id}"`);
    for (const o of OPERADORES) expect(html).toContain(o.nombre);
    expect(html).toContain('type="submit"');
  });

  it('los folios que la banda de urgentes menciona siguen a la vista', () => {
    const html = renderToStaticMarkup(
      <TablaSinAsignar viajes={VIAJES} operadores={OPERADORES} accion={ACCION} />,
    );
    for (const v of VIAJES) if (v.folio) expect(html).toContain(v.folio);
  });

  it('sin choferes dados de alta NO se pinta un select vacío: se dice por qué', () => {
    // Un `<select>` con una sola opción deshabilitada es un callejón igual de
    // ciego que el `<li>` de texto que esto reemplaza.
    const html = renderToStaticMarkup(
      <TablaSinAsignar viajes={VIAJES} operadores={[]} accion={ACCION} />,
    );
    expect(html).not.toContain('name="operadorId"');
    expect(html).toMatch(/WhatsApp/);
  });
});

describe('la casa del encargado usa esa tabla y escribe con la función acotada por flota', () => {
  const fuente = readFileSync('src/app/dashboard/inicio-operacion.tsx', 'utf8');

  it('EL BUG: la pantalla ya no es de solo lectura', () => {
    expect(fuente).toContain('TablaSinAsignar');
    expect(fuente).toContain('reasignarOperador');
  });

  it('la server action revalida el permiso por su cuenta, no confía en que el botón se pintó', () => {
    // Un server action es un endpoint POST alcanzable solo: el `puedeAsignar`
    // del render decide si se DIBUJA, no si se puede EJECUTAR. Mismo criterio
    // que `combustible-casetas/page.tsx` y que el despacho borrado.
    const i = fuente.indexOf("'use server'");
    expect(i, 'no hay server action en la pantalla del encargado').toBeGreaterThan(-1);
    expect(fuente).toContain('requireSessionTenant');
    expect(fuente).toContain('puedeAsignar');
  });
});
