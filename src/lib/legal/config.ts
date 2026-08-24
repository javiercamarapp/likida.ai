/** Datos legales que solo puede proporcionar la entidad operadora. */
function dato(valorCrudo: string | undefined): string | null {
  const valor = valorCrudo?.trim();
  return valor ? valor : null;
}

export const LEGAL_CONFIG = {
  razonSocial: dato(process.env.LEGAL_ENTITY_NAME),
  domicilio: dato(process.env.LEGAL_ENTITY_ADDRESS),
  jurisdiccion: dato(process.env.LEGAL_JURISDICTION),
  contacto: dato(process.env.LEGAL_CONTACT_EMAIL) ?? 'likida.ai@gmail.com',
  dpaVersion: dato(process.env.LEGAL_DPA_VERSION),
  slaVersion: dato(process.env.LEGAL_SLA_VERSION),
  seguridadVersion: dato(process.env.LEGAL_SECURITY_ANNEX_VERSION),
  subencargadosVersion: dato(process.env.LEGAL_SUBPROCESSORS_VERSION),
} as const;

export const LEGAL_PLACEHOLDERS = {
  razonSocial: '[COMPLETAR: razón social inscrita de la entidad operadora]',
  domicilio: '[COMPLETAR: domicilio legal/fiscal para notificaciones]',
  jurisdiccion: '[COMPLETAR: entidad federativa y tribunales competentes]',
  contacto: '[COMPLETAR: correo legal o de privacidad bajo control de la entidad]',
  dpa: '[COMPLETAR Y FIRMAR: versión del DPA]',
  sla: '[COMPLETAR Y FIRMAR: versión del SLA]',
  seguridad: '[COMPLETAR Y APROBAR: versión del anexo de seguridad]',
  subencargados: '[COMPLETAR Y APROBAR: versión del anexo de subencargados]',
} as const;

const REQUISITOS: Array<[keyof typeof LEGAL_CONFIG, string]> = [
  ['razonSocial', 'LEGAL_ENTITY_NAME'],
  ['domicilio', 'LEGAL_ENTITY_ADDRESS'],
  ['jurisdiccion', 'LEGAL_JURISDICTION'],
  ['dpaVersion', 'LEGAL_DPA_VERSION'],
  ['slaVersion', 'LEGAL_SLA_VERSION'],
  ['seguridadVersion', 'LEGAL_SECURITY_ANNEX_VERSION'],
  ['subencargadosVersion', 'LEGAL_SUBPROCESSORS_VERSION'],
];

export function estadoLegalProduccion() {
  const faltantes = REQUISITOS.filter(([campo]) => !LEGAL_CONFIG[campo]).map(([, env]) => env);
  return {
    listo: faltantes.length === 0,
    faltantes,
    bloqueado: !LEGAL_CONFIG.razonSocial || !LEGAL_CONFIG.domicilio || !LEGAL_CONFIG.jurisdiccion,
  };
}

/** Solo bloquea cuando el despliegue lo activa explícitamente. */
export function exigirLegalEnProduccion(): void {
  if (process.env.VERCEL_ENV !== 'production' && process.env.LEGAL_ENFORCE_PRODUCTION !== 'true') return;
  const estado = estadoLegalProduccion();
  if (!estado.listo) {
    throw new Error(`LEGAL_PRODUCTION_BLOCKED: faltan ${estado.faltantes.join(', ')}`);
  }
}
