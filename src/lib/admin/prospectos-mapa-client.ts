// Contrato compartido por componentes cliente. Este módulo debe permanecer
// libre de Supabase, Node y cualquier otra dependencia server-only.

export const COLOR_EMBUDO: Record<string, { color: string; nombre: string }> = {
  nuevo: { color: '#64748b', nombre: 'Sin contactar' },
  contactado: { color: '#d97706', nombre: 'Contactado' },
  demo: { color: '#7c3aed', nombre: 'Demo dado' },
  negociacion: { color: '#ea580c', nombre: 'En negociación' },
  cerrado: { color: '#16a34a', nombre: 'Cliente' },
  perdido: { color: '#94a3b8', nombre: 'Perdido' },
};

export type Giro =
  | 'transportista' | 'embotelladora' | 'abarrotes_mayoreo'
  | 'flota_propia' | 'logistica' | 'otro';

export const NOMBRE_GIRO: Record<Giro, string> = {
  transportista: 'Transportista',
  embotelladora: 'Embotelladora',
  abarrotes_mayoreo: 'Abarrotes / Mayoreo',
  flota_propia: 'Flota propia',
  logistica: 'Logística',
  otro: 'Otro giro',
};

export const TAMANOS = ['11-30', '31-50', '51-100', '101-250', '250+'] as const;
export type Tamano = (typeof TAMANOS)[number];

export const CRITERIO_SCORES = {
  urgencia: 'vacante de liquidación +45 · anuncios +4 (máx 20) · recencia +5–20 · ficha trabajada +15',
  cierre: 'teléfono +30 · correo +25 · decisor +20 · estado/fuente/ficha hasta +25',
  datos: 'teléfono +30 · correo +25 · decisor +20 · ubicación +15 · sitio verificado +10',
  similitud: 'giro correcto +40 · vacante publicada +25 · flota ≥10 +20 · sitio verificado +15',
  necesidad: 'vacante de liquidación/cuadre +50 (otra vacante +25) · flota ≥20 +25',
} as const;

export interface ProspectoMapa {
  id: string;
  empresa: string;
  ciudad: string | null;
  entidad: string | null;
  lat: number | null;
  lng: number | null;
  telefono: string | null;
  correo: string | null;
  contacto: string | null;
  vacante: string | null;
  estado: string;
  fuente: string;
  giro: Giro;
  urgencia: number;
  cierre: number;
  tamano: Tamano | null;
  completitud: number;
  ultimoToque: string | null;
  mensajesGeneradosEn: string | null;
  numUnidades: number | null;
  similitudIcpPct: number;
  necesidadPct: number;
}

export interface TextosProspecto {
  id: string;
  notas: string | null;
  mensajeWaIa: string | null;
  correoAsuntoIa: string | null;
  correoCuerpoIa: string | null;
}

export type FilaCompacta = [
  id: string, empresa: string, ciudad: string | null, entidad: string | null,
  lat: number | null, lng: number | null, telefono: string | null,
  correo: string | null, contacto: string | null, vacante: string | null,
  estado: string, fuente: string, giro: Giro, urgencia: number, cierre: number,
  tamano: Tamano | null, completitud: number, ultimoToque: string | null,
  mensajesGeneradosEn: string | null, numUnidades: number | null,
  similitudIcpPct: number, necesidadPct: number,
];

export function desempacar(f: FilaCompacta): ProspectoMapa {
  const [
    id, empresa, ciudad, entidad, lat, lng, telefono, correo, contacto, vacante,
    estado, fuente, giro, urgencia, cierre, tamano, completitud, ultimoToque,
    mensajesGeneradosEn, numUnidades, similitudIcpPct, necesidadPct,
  ] = f;
  return {
    id, empresa, ciudad, entidad, lat, lng, telefono, correo, contacto, vacante,
    estado, fuente, giro, urgencia, cierre, tamano, completitud, ultimoToque,
    mensajesGeneradosEn, numUnidades, similitudIcpPct, necesidadPct,
  };
}

export interface DatosMapa {
  filas: FilaCompacta[];
  generadoEn: string;
  fallo: boolean;
  marca: string | null;
  delta: boolean;
  total: number | null;
}

export interface PersonaProspecto {
  id: string;
  nombre: string;
  puesto: string | null;
  correo: string | null;
  telefono: string | null;
  linkedin: string | null;
  origen: string;
  confianza: 'alta' | 'media' | 'baja';
  evidencia: string | null;
}

export interface DetalleProspecto extends ProspectoMapa, TextosProspecto {
  sitio: string | null;
  sitioVerificado: boolean;
  historia: string | null;
  viajesMesEstimado: number | null;
  fuenteCruda: string;
  creadoEn: string;
  personas: PersonaProspecto[];
}
