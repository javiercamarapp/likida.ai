-- ═══════════════════════════════════════════════════════════════════════════
-- 0136 — Un abono no puede dejar la factura con pagado > total.
--
-- `registrarPago` evalúa el saldo en memoria. Dos POST simultáneos leen el
-- mismo snapshot y los dos insertan (AUD5 BE-A). La vista `factura_saldo`
-- quedaba negativa y `pagada` al doble. El candado tiene que vivir en la
-- base: FOR UPDATE serializa los abonos de la misma factura y el trigger
-- rechaza el que no cabe.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.pago_no_excede_total()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_total numeric;
  v_pagado numeric;
begin
  select total into v_total
    from public.factura_emitida
   where id = new.factura_id
     and tenant_id = new.tenant_id
     for update;
  if v_total is null then
    raise exception 'pago_no_excede_total: esa factura no existe en esta flota';
  end if;
  select coalesce(sum(monto), 0) into v_pagado
    from public.pago_recibido
   where factura_id = new.factura_id
     and tenant_id = new.tenant_id
     and (tg_op = 'INSERT' or id is distinct from new.id);
  if v_pagado + new.monto > v_total + 0.005 then
    raise exception 'pago_no_excede_total: el abono rebasa el total de la factura'
      using errcode = '23514';
  end if;
  return new;
end
$$;

drop trigger if exists pago_no_excede_total on public.pago_recibido;
create trigger pago_no_excede_total
  before insert or update of monto on public.pago_recibido
  for each row execute function public.pago_no_excede_total();

comment on function public.pago_no_excede_total() is
  'Serializa abonos de una factura (FOR UPDATE) y rechaza pagado > total.';

revoke all on function public.pago_no_excede_total() from public, anon, authenticated;
grant execute on function public.pago_no_excede_total() to service_role;
