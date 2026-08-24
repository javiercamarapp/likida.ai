import { afterEach, describe, expect, it } from 'vitest';
import { estadoLegalProduccion, exigirLegalEnProduccion, LEGAL_PLACEHOLDERS } from './config';

describe('gate legal enterprise', () => {
  afterEach(() => { delete process.env.LEGAL_ENFORCE_PRODUCTION; });

  it('no inventa identidad y expone pendientes', () => {
    const estado = estadoLegalProduccion();
    expect(estado.listo).toBe(false);
    expect(estado.bloqueado).toBe(true);
    expect(estado.faltantes).toContain('LEGAL_ENTITY_NAME');
    expect(LEGAL_PLACEHOLDERS.razonSocial).toContain('[COMPLETAR:');
  });

  it('bloquea explícitamente cuando se exige producción', () => {
    process.env.LEGAL_ENFORCE_PRODUCTION = 'true';
    expect(() => exigirLegalEnProduccion()).toThrow('LEGAL_PRODUCTION_BLOCKED');
  });
});
