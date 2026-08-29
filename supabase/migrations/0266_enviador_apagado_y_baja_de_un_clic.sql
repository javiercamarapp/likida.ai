-- ═══════════════════════════════════════════════════════════════════════════
-- 0266 — El envío autónomo acotado (Fase E del plan de cierre): topes,
-- cadencia y lista de bajas YA EXISTEN desde la 0217 (el enviador de
-- campaña); lo que faltaba y esta migración cierra es EL INTERRUPTOR
-- EXPLÍCITO, apagado por default.
--
-- ── POR QUÉ ESTA MIGRACIÓN, SI `agente:enviador` YA TIENE PALANCA ──────────
--
-- La 0217 dio de alta el interruptor `agente:enviador` en el DOMINIO (el
-- CHECK que valida nombres) pero nunca sembró una FILA para él. Y el
-- contrato de `interruptores.ts` es explícito: "SIN FILA = ENCENDIDO". O sea:
-- un motor que manda correo de verdad a prospectos reales, sin aprobación
-- humana por mensaje, nace ENCENDIDO por el default general del kill switch
-- — el mismo default que es correcto para un agente que solo deja piezas en
-- una bandeja, y que es el equivocado para el único de los tres agentes de
-- prospección que "toca un canal real" (comentario de interruptores.ts).
--
-- Encenderlo es DECISIÓN DE JAVIER, tomada a propósito desde /admin/
-- observabilidad o ⌘K — no el efecto secundario de aplicar una migración ni
-- de que `RESEND_API_KEY` ya esté puesta por otra razón. Esta fila apaga el
-- envío autónomo HOY MISMO si ya estaba corriendo, y lo deja apagado para
-- cualquier despliegue futuro hasta que alguien mueva la palanca a mano (el
-- `on conflict do nothing` de abajo respeta esa decisión si ya se tomó).
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.interruptor (id, apagado, motivo, cambiado_por, cambiado_en)
values (
  'agente:enviador',
  true,
  'Envío autónomo de prospección (Fase E): arranca APAGADO por decisión explícita — la 0217 lo dejó sin fila (=ENCENDIDO por default del kill switch), y es el único de los tres agentes de la máquina de prospección que manda correo real sin aprobación humana por mensaje. Enciéndelo desde /admin/observabilidad o ⌘K cuando quieras que empiece a mandar.',
  null,
  now()
)
on conflict (id) do nothing;

comment on table public.interruptor is
  'Kill switch (0110). SIN FILA = ENCENDIDO: una fila solo existe cuando alguien tocó la palanca — EXCEPTO ''agente:enviador'' (0266), sembrado APAGADO a propósito por ser el único agente de prospección que manda correo real de forma autónoma. Los crons consultan ''global'' y su ''agente:*'' antes de trabajar (fail-closed: si no se puede leer, se lee como apagado). Global por agente en v1, no por tenant. Lo escribe solo el servidor (deny-all).';
