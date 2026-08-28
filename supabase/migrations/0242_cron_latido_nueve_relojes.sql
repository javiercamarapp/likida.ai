-- ═══════════════════════════════════════════════════════════════════════════
-- 0242 · LOS NUEVE RELOJES CABEN EN LA TABLA QUE LOS VIGILA.
--
-- `cron_latido` (0155) tiene un CHECK que enumera los ids permitidos. Se ha
-- ido ampliando a mano cada vez que nació un cron: la 0176 metió `gps`, la
-- 0180 metió `wa-outbox`. Se quedó en SIETE:
--
--     check (id in ('wa-pendientes','wa-outbox','escalar','facturar',
--                   'purgar','runner','gps'))                    -- 0180:125-126
--
-- Desde entonces nacieron DOS crons más y nadie amplió el dominio:
--
--     · `asistencia`   (Fase 5, 26-ago-2026) — vercel.json, cada 5 min
--     · `descarga-sat` (0231)                — vercel.json, cada 6 h
--
-- `src/lib/admin/salud.ts:28` sí los declara: `CRONS` son NUEVE. Sus rutas sí
-- llaman `registrarLatido` (`asistencia/route.ts:51,59,70` y
-- `descarga-sat/route.ts:61,128,147`). Pero el upsert viola este CHECK.
--
-- ── POR QUÉ NADIE SE ENTERÓ ───────────────────────────────────────────────
--
-- Porque `registrarLatido` es best-effort A PROPÓSITO y está bien que lo sea:
-- un cron que hizo su trabajo no debe fallar porque no pudo escribir su
-- propia bitácora. Traga el error con un `logger.warn` (`salud.ts:91`). El
-- resultado es el peor de los dos mundos: los dos crons CORREN, y para el
-- panel llevan meses `sin_latido`.
--
-- Y `sin_latido` deja `/api/health` en `degraded` PERMANENTE
-- (`health/route.ts:93`), que es la forma más eficaz de que nadie vuelva a
-- mirar ese semáforo: un rojo que siempre está rojo deja de ser una señal.
-- El reloj que se dejó de vigilar es, entre los dos, el de EMERGENCIAS —
-- `asistencia` corre cada 5 minutos justamente porque un ROJO sin reconocer
-- no puede esperar a que `escalar` pase dentro de una hora.
--
-- ── POR QUÉ SE AMPLÍA EL DOMINIO EN VEZ DE QUITARLO ───────────────────────
--
-- La tentación es borrar el CHECK: se acabaría el drift para siempre. Pero
-- el dominio cerrado es lo que hace que `estadoLatidos()` pueda afirmar
-- «faltan estos» — sin él, un id con dedazo (`'facutrar'`) entraría como
-- fila válida, latiría feliz, y el cron de verdad se vería `sin_latido`
-- mientras el panel enseña nueve renglones en verde. El CHECK es la razón
-- por la que este bug se puede DETECTAR; el bug fue no ampliarlo.
--
-- Lo que sí se arregla de raíz es el olvido: `salud.test.ts` gana una prueba
-- que lee ESTE archivo y exige que `CRONS` y este dominio digan lo mismo. La
-- próxima vez que nazca un cron, la prueba truena antes del merge en vez de
-- callarse seis semanas.
--
-- IDEMPOTENTE y sin pérdida: `drop constraint if exists` + `add constraint`
-- sobre un dominio que es un SUPERCONJUNTO del vigente. Ninguna fila
-- existente puede violarlo, así que no hace falta limpiar nada antes.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.cron_latido drop constraint if exists cron_latido_id_dominio;
alter table public.cron_latido add constraint cron_latido_id_dominio
  check (id in ('wa-pendientes', 'wa-outbox', 'escalar', 'facturar', 'purgar',
                'runner', 'gps', 'asistencia', 'descarga-sat'));

comment on constraint cron_latido_id_dominio on public.cron_latido is
  'Los nueve crons de vercel.json (0242). Espeja CRONS de src/lib/admin/salud.ts; '
  'salud.test.ts lee este archivo y falla si las dos listas divergen.';
