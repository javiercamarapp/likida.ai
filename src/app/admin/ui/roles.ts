import type { RolAppUser } from '@/lib/auth/provisionar';

// ═══════════════════════════════════════════════════════════════════════════
// CÓMO SE LLAMA CADA ROL EN PANTALLA. UNA VEZ.
//
// AUDITORÍA 17 (pase 5), MEDIO — "Usuarios & Roles", la pantalla cuyo trabajo
// es decir quién es quién, imprimía la CLAVE CRUDA de la base en la columna
// "Rol": `flota_admin`, `contador`, `encargado`, en snake_case y minúsculas,
// tal como sale del check constraint. Y a tres centímetros, en el mismo
// render, la insignia del sidebar de esa misma sesión decía "ADMIN FLOTA".
//
// Había cuatro mapas de rol en el producto y los cuatro coincidían en la
// etiqueta legible (`admin/equipo`, `admin/mi-perfil`, `dashboard/aviso-rol`,
// `dashboard/chrome`); esa columna no usaba ninguno. En vez de escribir el
// quinto, esto vive en `admin/ui/` —la librería que /dashboard ya reusa
// (`kit`, `graficas`, `charts`)— y se importa.
//
// El tipo es `Record<RolAppUser | 'operador', …>`: si mañana el dominio de
// `app_user.rol` gana un rol y alguien lo agrega a `RolAppUser`, esto deja de
// compilar en vez de enseñar la clave cruda en pantalla. `operador` no está en
// `RolAppUser` (el chofer perdió el login el 7-ago-2026, mig. 0086) pero SÍ
// sigue en el constraint de la base, así que una fila vieja lo puede traer.
// ═══════════════════════════════════════════════════════════════════════════

export const ROL_LABEL: Record<RolAppUser | 'operador', string> = {
  superadmin: 'Superadmin',
  flota_admin: 'Dueño / Admin de flota',
  encargado: 'Encargado',
  contador: 'Contador',
  operador: 'Operador / Chofer',
};

/** Un rol que el mapa no conoce se enseña con su clave cruda, nunca vacío ni
 *  con una etiqueta inventada — mismo criterio que `etiquetaEstatus`. */
export function etiquetaRol(rol: string): string {
  return ROL_LABEL[rol as RolAppUser | 'operador'] ?? rol;
}
