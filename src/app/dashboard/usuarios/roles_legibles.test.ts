import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { ROL_LABEL, etiquetaRol } from '../../admin/ui/roles';

const PAGINA = readFileSync('src/app/dashboard/usuarios/page.tsx', 'utf8');

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 5), MEDIO — "USUARIOS & ROLES" IMPRIMÍA LA CLAVE CRUDA
// DE LA BASE.
//
//     <StatusPill …>{u.rol}</StatusPill>     → "flota_admin"
//
// El contralor abre la pantalla cuyo trabajo es decir quién es quién y, en la
// columna **Rol**, lee su propia fila como `flota_admin`; la de su contador,
// `contador`; la del jefe de tráfico, `encargado`. Snake_case y minúsculas,
// tal cual el check constraint de `app_user.rol`. Y no cuadra con la insignia
// del sidebar de esa MISMA sesión, que dice "ADMIN FLOTA".
//
// Había cuatro mapas de rol en el producto —los cuatro coincidiendo en la
// etiqueta legible— y esta columna no usaba ninguno.
// ═══════════════════════════════════════════════════════════════════════════

describe('la columna Rol se lee en español, no en snake_case', () => {
  it('EL BUG: la celda no pinta `u.rol` crudo', () => {
    const sin = PAGINA.replace(/\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(sin, 'la píldora de rol volvió a la clave cruda').not.toMatch(/StatusPill[^>]*>\{u\.rol\}</);
    expect(sin).toMatch(/etiquetaRol\(u\.rol\)/);
  });

  it('los cinco roles del constraint tienen etiqueta, ninguno se cae al crudo', () => {
    // El dominio real (`app_user_rol_dominio`, 0044) — se lee de la migración
    // para que un rol nuevo obligue a etiquetarlo en vez de salir en crudo.
    const mig = readFileSync('supabase/migrations/0044_rol_encargado.sql', 'utf8');
    const decl = mig.slice(mig.indexOf('check (rol in ('));
    const roles = [...decl.slice(0, decl.indexOf(')')).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(roles.length, 'no se pudo leer el dominio de app_user.rol').toBe(5);
    for (const r of roles) {
      expect(ROL_LABEL[r as keyof typeof ROL_LABEL], `falta etiqueta para "${r}"`).toBeTruthy();
      expect(etiquetaRol(r), `"${r}" se está enseñando crudo`).not.toBe(r);
    }
  });

  it('un rol desconocido se enseña crudo, no vacío ni inventado', () => {
    expect(etiquetaRol('rol_del_futuro')).toBe('rol_del_futuro');
  });

  it('no se abre un quinto mapa: la etiqueta es la MISMA que la de /admin/equipo', () => {
    // Si alguien cambia una de las dos, esto lo caza — mismo instrumento que
    // `etiquetas_sincronizadas.test.ts` usa para los conceptos de gasto.
    const equipo = readFileSync('src/app/admin/equipo/page.tsx', 'utf8');
    const bloque = equipo.slice(equipo.indexOf('const ROL_LABEL'));
    const suyo: Record<string, string> = {};
    for (const m of bloque.slice(0, bloque.indexOf('};')).matchAll(/(\w+):\s*'([^']*)'/g)) suyo[m[1]] = m[2];
    expect(Object.keys(suyo).length).toBeGreaterThan(3);
    for (const [k, v] of Object.entries(suyo)) {
      expect(ROL_LABEL[k as keyof typeof ROL_LABEL], `"${k}" difiere entre /admin/equipo y la fuente compartida`).toBe(v);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 5), MEDIO — EL PANEL MANDABA AL CHOFER A `/mis-viajes`,
// QUE DEVUELVE 404.
//
// `/mis-viajes` y `/chofer` se borraron el 7-ago-2026 con el retiro del rol
// `operador` (mig. 0086); `src/app` no tiene esa carpeta. El texto lo lee el
// dueño de la flota mientras decide cómo dar de alta a su gente.
// ═══════════════════════════════════════════════════════════════════════════
describe('lo que la pantalla promete existe', () => {
  it('EL BUG: ninguna ruta citada en la tabla de roles es un 404', () => {
    const bloque = PAGINA.slice(PAGINA.indexOf('const ROLES'), PAGINA.indexOf('};', PAGINA.indexOf('const ROLES')));
    const rutas = [...bloque.matchAll(/(?:^|[\s(])(\/[a-z0-9-]+(?:\/[a-z0-9-]+)*)/gm)].map((m) => m[1]);
    for (const r of rutas) {
      const dir = `src/app${r}`;
      expect(
        existsSync(`${dir}/page.tsx`),
        `la tabla de roles manda a "${r}" y esa página no existe: es un 404 prometido en pantalla`,
      ).toBe(true);
    }
  });
});
