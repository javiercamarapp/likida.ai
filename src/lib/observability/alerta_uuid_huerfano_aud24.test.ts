// ═══════════════════════════════════════════════════════════════════════════
// AUD24 · PRU-A3 (ALTO, REINCIDENTE) — el correo de "uuid huérfano" tiene que
// preservar el UUID FISCAL íntegro, no una huella redactada (`id:<hash>`).
//
// `alerta.ts` YA exime `uuidFiscal`/`uuidCfdi`/`folioFiscal` de la redacción
// (`LLAVES_SIN_REDACTAR`, alerta.ts:154-156) — ESO está bien. El bug real
// sigue vivo en el LLAMADOR: `src/lib/likida/carta_porte_timbre.ts:317,
// 379, 409` mete el uuid DENTRO del texto de `error` (nunca pasa una llave
// `uuidFiscal` aparte), y `error` NO está exenta — así que `redactarTexto`
// (logger.ts:99-107, que sí se ejecuta REAL en esta prueba, no el mock
// simplificado de `alerta.test.ts`) sustituye el UUID por `id:<huella>`
// antes de que el correo salga.
//
// Esta prueba usa el payload EXACTO que construye `carta_porte_timbre.ts:317`
// hoy (confirmado leyendo el archivo) contra el `alertarOperador` REAL.
//
// it.fails: hoy está roja porque el bug es real y vive fuera de mis archivos
// (`src/lib/likida/carta_porte_timbre.ts`, dominio fiscal/timbrado). La
// vuelve verde el constructor fiscal, pasando `uuidFiscal: otra.
// reservaPendiente.uuidFiscal` como llave APARTE en los tres llamadores
// (317, 379, 409), como propone PRU-A3 — sin tocar `LLAVES_SIN_REDACTAR`.
// ═══════════════════════════════════════════════════════════════════════════

import { it, expect, vi, beforeEach, afterEach } from 'vitest';

const enviarCorreo = vi.fn().mockResolvedValue({ ok: true, id: 'correo-1' });
const correoConfigurado = vi.fn(() => true);
vi.mock('@/lib/correo/enviar', () => ({
  enviarCorreo: (...a: unknown[]) => enviarCorreo(...a),
  correoConfigurado: () => correoConfigurado(),
}));

beforeEach(() => {
  enviarCorreo.mockClear();
  vi.stubEnv('ALERTA_EMAIL', 'javier@likida.ai');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
  vi.resetModules();
});
afterEach(() => vi.unstubAllEnvs());

it.fails('AUD24 PRU-A3: el uuid del "uuid huérfano" llega ÍNTEGRO al correo, no como id:<huella>', async () => {
  const { alertarOperador } = await import('./alerta');
  const viajeId = 'v-777';
  const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  // Payload EXACTO de carta_porte_timbre.ts:317-320 hoy: el uuid solo vive
  // DENTRO de `error`, nunca como llave `uuidFiscal` aparte.
  await alertarOperador('timbre.uuid_huerfano', {
    error: `Viaje ${viajeId}: el PAC timbró el uuid ${uuid} y la consolidación no cerró. Ese folio fiscal existe ante el SAT y hay que registrarlo o cancelarlo a mano.`,
    codigo: 'timbre_uuid_huerfano',
  });

  expect(enviarCorreo).toHaveBeenCalledTimes(1);
  const cuerpo = JSON.stringify(enviarCorreo.mock.calls[0][1]);
  expect(cuerpo).toContain(uuid);
});
