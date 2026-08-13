-- ═══════════════════════════════════════════════════════════════════════════
-- 0091 — `try_lock_viaje` y `unlock_viaje`: la revocación que la 0012 dejó a
--         medias, catorce migraciones antes de descubrir por qué no bastaba.
--
-- AUDITORÍA 17 pase 5, MEDIO de seguridad. La 0012 revocó las TRES RPC
-- internas con la forma corta:
--
--   revoke execute on function try_lock_viaje(uuid, integer) from public;
--   revoke execute on function unlock_viaje(uuid)            from public;
--   revoke execute on function intake_delta(uuid, integer)   from public;
--
-- y su propio comentario decía que revocar de PUBLIC bastaba. La 0013 midió
-- lo contrario contra la base real y lo escribió (`0013:52-55`): «Supabase
-- concede EXECUTE a anon/authenticated de forma EXPLÍCITA por default
-- privileges, así que `revoke from public` NO basta». De las tres, solo
-- `intake_delta` recibió después la forma completa (`0031:83`). Sus dos
-- hermanas de la misma línea nunca.
--
-- MEDIDO, no deducido. Con las 89 migraciones aplicadas sobre un Postgres 16
-- con los default privileges de Supabase reproducidos (12-ago-2026):
--
--   try_lock_viaje  anon=t  authenticated=t
--   unlock_viaje    anon=t  authenticated=t
--   intake_delta    anon=f  authenticated=f     ← la que sí se corrigió
--
-- Qué alcanza hoy un anónimo con la anon key (pública por diseño):
-- `POST /rest/v1/rpc/unlock_viaje` resuelve y ejecuta. No roba el candado —
-- las dos son SECURITY INVOKER y `viaje_lock` tiene RLS encendida sin una
-- sola policy (0005:27), así que el DELETE filtra a cero filas y el INSERT
-- rebota. Ese es justo el punto: aquí hay exactamente DOS capas y una lleva
-- 79 migraciones caída sin que nadie lo supiera. `authenticated` —un usuario
-- real de una flota— tampoco tenía por qué llamarlas, y no lo comprobaba
-- ningún bloque.
--
-- Efecto secundario que importa tanto como el hueco: los bloques 16 y 18 de
-- `verificaciones.sql` afirman por escrito que ninguna de las dos es
-- ejecutable por `anon`. Corridos contra producción salían ROJOS en dos
-- renglones, y se leerían como "se cayó la RLS de viaje_lock" en vez de
-- "faltó una palabra en la 0012". Con esta migración las dos afirmaciones se
-- vuelven ciertas, y el bloque 66 nuevo añade lo que ninguno miraba:
-- `authenticated`.
--
-- `alter function` y `create or replace` conservan ACL, así que esto no se
-- puede dar por hecho de ninguna migración posterior: se revoca explícito.
-- ═══════════════════════════════════════════════════════════════════════════

revoke execute on function public.try_lock_viaje(uuid, integer) from public, anon, authenticated;
revoke execute on function public.unlock_viaje(uuid)            from public, anon, authenticated;

-- El pipeline SÍ tiene que poder: una revocación de más rompe el mutex del
-- viaje entero, que es tan caro como el hueco que se cierra. Idempotente —
-- la 0012 ya los concedió; se repiten para que la garantía se lea en un solo
-- archivo, igual que hizo la 0031.
grant execute on function public.try_lock_viaje(uuid, integer) to service_role;
grant execute on function public.unlock_viaje(uuid)            to service_role;

comment on function public.try_lock_viaje(uuid, integer) is
  'Mutex por viaje (lease con TTL). SOLO service_role: la 0012 la revoco solo de PUBLIC y el grant explicito de Supabase a anon/authenticated sobrevivio 79 migraciones (0091).';
comment on function public.unlock_viaje(uuid) is
  'Libera el lease del viaje. SOLO service_role: mismo caso que try_lock_viaje, cerrado en la 0091.';
