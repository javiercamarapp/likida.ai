import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/0186_wa_evento_pendiente_leases_fencing.sql', 'utf8');

describe('contrato SQL del fencing WhatsApp 0186', () => {
  it('todas las SECURITY DEFINER fijan search_path vacío y califican tablas', () => {
    expect((sql.match(/security definer/g) ?? []).length).toBe(10);
    expect((sql.match(/set search_path = ''/g) ?? []).length).toBe(10);
    expect(sql).toContain('from public.wa_evento_pendiente w');
    expect(sql).toContain('from public.wa_mensaje_procesado');
    expect(sql).toContain('for update skip locked');
  });

  it('todas las transiciones mutan con token y owner', () => {
    expect(sql).toContain('and lease_token = p_lease_token');
    expect(sql).toContain('and lease_owner = p_lease_owner');
    expect(sql).toContain('renew_wa_evento_pendiente');
    expect(sql).toContain('renew_wa_mensaje_procesado');
  });
});
