import { describe, it, expect, vi, afterEach } from 'vitest';

// BACKEND-19C2-3 — `beforeSend` y `beforeSendTransaction` son hooks
// INDEPENDIENTES del SDK: con `tracesSampleRate` > 0 (default 0.05), una
// transacción de performance salía sin pasar por `sanitizarEventoSentry`
// (mismas cookies/headers/RFC/domicilio que un evento de error). Este test
// fija que `init()` registra los dos hooks con el mismo saneador.

const init = vi.hoisted(() => vi.fn());
vi.mock('@sentry/nextjs', () => ({
  init,
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  flush: vi.fn(async () => true),
}));

const { reportar, flushObservabilidad } = await import('./sentry');

describe('sentry — init() sanea error Y transacción', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('registra beforeSend y beforeSendTransaction con el mismo saneador', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://algo@sentry.io/1');
    reportar('warn', 'algo.pasó');
    await flushObservabilidad();

    expect(init).toHaveBeenCalledTimes(1);
    const opciones = init.mock.calls[0][0] as { beforeSend: (e: unknown) => unknown; beforeSendTransaction: (e: unknown) => unknown };
    expect(typeof opciones.beforeSendTransaction).toBe('function');

    // Mismo comportamiento de saneado para los dos tipos de evento.
    const evento = { request: { url: 'https://app.likida.ai/x?token=secreto', cookies: 'c' }, user: { email: 'a@b.com' } };
    const porError = opciones.beforeSend(structuredClone(evento)) as { user?: unknown; request: { cookies?: unknown } };
    const porTransaccion = opciones.beforeSendTransaction(structuredClone(evento)) as { user?: unknown; request: { cookies?: unknown } };
    expect(porTransaccion.user).toBeUndefined();
    expect(porTransaccion.request.cookies).toBeUndefined();
    expect(porTransaccion).toEqual(porError);
  });
});
