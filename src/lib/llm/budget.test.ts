import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: () => ({ rpc }) }));
vi.mock('@/lib/likida/presupuesto', () => ({ acotada: (query: unknown) => query }));

const { createLlmBudget, reserveLlmBudget, settleLlmBudget, LlmBudgetExceededError } = await import('./budget');

describe('presupuesto monetario duro del runtime', () => {
  beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: true, error: null }); vi.unstubAllEnvs(); });

  it('reserva antes de gastar y liquida al costo real', async () => {
    const budget = createLlmBudget('tenant-1', '00000000-0000-4000-8000-000000000001');
    const reservation = await reserveLlmBudget(budget, 0.10);
    expect(rpc).toHaveBeenCalledWith('reservar_presupuesto_llm', expect.objectContaining({ p_tenant_id: 'tenant-1', p_reserva_usd: 0.1, p_tope_run_usd: 0.5 }));
    await settleLlmBudget(budget, reservation, 0.02);
    expect(rpc).toHaveBeenLastCalledWith('liquidar_presupuesto_llm', expect.objectContaining({ p_costo_real_usd: 0.02 }));
    expect(budget.reservadoRunUsd).toBeCloseTo(0.02);
  });

  it('rechaza localmente una reserva que excede el techo del run', async () => {
    vi.stubEnv('LIKIDA_LLM_RUN_BUDGET_USD', '0.10');
    const budget = createLlmBudget('tenant-1', '00000000-0000-4000-8000-000000000002');
    await expect(reserveLlmBudget(budget, 0.11)).rejects.toBeInstanceOf(LlmBudgetExceededError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('frena si la reserva atómica del tenant devuelve false', async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    const budget = createLlmBudget('tenant-1', '00000000-0000-4000-8000-000000000003');
    await expect(reserveLlmBudget(budget, 0.01)).rejects.toMatchObject({ scope: 'tenant' });
    expect(budget.reservadoRunUsd).toBe(0);
  });
});
