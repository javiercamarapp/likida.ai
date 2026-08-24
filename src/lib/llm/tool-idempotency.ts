import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { acotada } from '@/lib/likida/presupuesto';

const LEASE_MS = Number(process.env.LIKIDA_TOOL_IDEMPOTENCY_LEASE_MS) || 120_000;

interface Row {
  tool_name: string;
  owner_token: string;
  status: 'running' | 'succeeded' | 'failed';
  result: unknown;
  error: string | null;
  lease_until: string;
  attempts: number;
}

export type MutationClaim =
  | { kind: 'execute'; token: string }
  | { kind: 'cached'; result: unknown }
  | { kind: 'busy' };

function expired(row: Row): boolean {
  return new Date(row.lease_until).getTime() <= Date.now();
}

/** Claim durable, cross-process para una mutación cuyo efecto es estable. */
export async function claimMutation(tenantId: string, effectKey: string, toolName: string): Promise<MutationClaim> {
  const token = randomUUID();
  const leaseUntil = new Date(Date.now() + LEASE_MS).toISOString();
  const admin = supabaseAdmin();
  const base = { tenant_id: tenantId, effect_key: effectKey, tool_name: toolName };

  const inserted = await acotada(admin.from('agente_mutacion_idempotencia').insert({
    ...base,
    owner_token: token,
    status: 'running',
    lease_until: leaseUntil,
    attempts: 1,
  }).select('tool_name, owner_token, status, result, error, lease_until, attempts').maybeSingle(), 'claimMutation.insert');
  if (!inserted.error && inserted.data) return { kind: 'execute', token };
  if (inserted.error && (inserted.error as { code?: string }).code !== '23505') {
    throw new Error(`claimMutation: ${inserted.error.message}`);
  }

  const actual = await acotada(admin.from('agente_mutacion_idempotencia')
    .select('tool_name, owner_token, status, result, error, lease_until, attempts')
    .eq('tenant_id', tenantId).eq('effect_key', effectKey).maybeSingle(), 'claimMutation.read');
  if (actual.error) throw new Error(`claimMutation: ${actual.error.message}`);
  const row = actual.data as Row | null;
  if (!row) throw new Error('claimMutation: conflicto sin fila durable');
  if (row.tool_name !== toolName) throw new Error('claimMutation: la llave de efecto ya pertenece a otra tool');
  if (row.status === 'succeeded') return { kind: 'cached', result: row.result };
  if (row.status === 'running' && !expired(row)) return { kind: 'busy' };

  const reclaimed = await acotada(admin.from('agente_mutacion_idempotencia').update({
    owner_token: token,
    status: 'running',
    lease_until: leaseUntil,
    attempts: row.attempts + 1,
    error: null,
    result: null,
    updated_at: new Date().toISOString(),
  }).eq('tenant_id', tenantId).eq('effect_key', effectKey).eq('tool_name', toolName)
    .eq('owner_token', row.owner_token).eq('status', row.status)
    .select('owner_token').maybeSingle(), 'claimMutation.reclaim');
  if (reclaimed.error) throw new Error(`claimMutation: ${reclaimed.error.message}`);
  return reclaimed.data ? { kind: 'execute', token } : { kind: 'busy' };
}

/** Renueva el lease de una mutación larga sin poder revivir un lease vencido. */
export async function renewMutation(tenantId: string, effectKey: string, token: string): Promise<boolean> {
  const leaseUntil = new Date(Date.now() + LEASE_MS).toISOString();
  const { data, error } = await acotada(supabaseAdmin().from('agente_mutacion_idempotencia').update({
    lease_until: leaseUntil,
    updated_at: new Date().toISOString(),
  }).eq('tenant_id', tenantId).eq('effect_key', effectKey).eq('owner_token', token)
    .eq('status', 'running').gt('lease_until', new Date().toISOString())
    .select('owner_token').maybeSingle(), 'renewMutation');
  if (error) throw new Error(`renewMutation: ${error.message}`);
  return Boolean(data);
}

export async function completeMutation(
  tenantId: string,
  effectKey: string,
  token: string,
  result: unknown,
): Promise<void> {
  const { data, error } = await acotada(supabaseAdmin().from('agente_mutacion_idempotencia').update({
    status: 'succeeded', result, error: null, lease_until: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('tenant_id', tenantId).eq('effect_key', effectKey).eq('owner_token', token).eq('status', 'running')
    .select('owner_token').maybeSingle(), 'completeMutation');
  if (error) throw new Error(`completeMutation: ${error.message}`);
  if (!data) throw new Error('completeMutation: se perdió el fencing token');
}

export async function failMutation(tenantId: string, effectKey: string, token: string, errorMessage: string): Promise<void> {
  const { data, error } = await acotada(supabaseAdmin().from('agente_mutacion_idempotencia').update({
    status: 'failed', error: errorMessage.slice(0, 1000), lease_until: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('tenant_id', tenantId).eq('effect_key', effectKey).eq('owner_token', token).eq('status', 'running')
    .select('owner_token').maybeSingle(), 'failMutation');
  if (error) throw new Error(`failMutation: ${error.message}`);
  if (!data) throw new Error('failMutation: se perdió el fencing token');
}
