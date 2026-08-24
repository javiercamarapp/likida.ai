import { AsyncLocalStorage } from 'node:async_hooks';

const toolSignals = new AsyncLocalStorage<AbortSignal | undefined>();

/** Señal de la tool actualmente en ejecución, para clientes de red profundos. */
export function currentToolSignal(): AbortSignal | undefined {
  return toolSignals.getStore();
}

/** Ejecuta una tool dentro de su señal para que Supabase/Storage la hereden. */
export function runWithToolSignal<T>(signal: AbortSignal | undefined, fn: () => Promise<T>): Promise<T> {
  return toolSignals.run(signal, fn);
}

/** Combina señales sin asumir que el runtime expone AbortSignal.any. */
export function combineAbortSignals(...signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const presentes = signals.filter((s): s is AbortSignal => Boolean(s));
  if (presentes.length === 0) return undefined;
  if (presentes.length === 1) return presentes[0];

  const any = (AbortSignal as typeof AbortSignal & {
    any?: (signals: AbortSignal[]) => AbortSignal;
  }).any;
  if (any) return any(presentes);

  const controller = new AbortController();
  const abortar = (signal: AbortSignal) => {
    if (!controller.signal.aborted) controller.abort(signal.reason);
  };
  for (const signal of presentes) {
    if (signal.aborted) abortar(signal);
    else signal.addEventListener('abort', () => abortar(signal), { once: true });
  }
  return controller.signal;
}

export function timeoutSignal(ms: number): AbortSignal {
  if (ms <= 0) {
    const controller = new AbortController();
    controller.abort(new DOMException('Timeout', 'TimeoutError'));
    return controller.signal;
  }
  return AbortSignal.timeout(ms);
}
