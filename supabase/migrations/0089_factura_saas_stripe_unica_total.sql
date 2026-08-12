-- El índice único de `factura_saas.stripe_invoice_id` era PARCIAL:
--
--   create unique index factura_saas_stripe_unica
--     on public.factura_saas (stripe_invoice_id) where stripe_invoice_id is not null;   -- 0052
--
-- y `aplicarFactura()` (src/lib/saas/suscripcion.ts) hace
-- `.upsert(..., { onConflict: 'stripe_invoice_id' })`. PostgREST traduce eso a
-- `ON CONFLICT (stripe_invoice_id) DO UPDATE`, **sin predicado** — no tiene
-- forma de emitir uno. Postgres solo infiere un índice parcial si la sentencia
-- repite su `WHERE`, así que contestaba:
--
--   ERROR: there is no unique or exclusion constraint matching the
--          ON CONFLICT specification                         (SQLSTATE 42P10)
--
-- Reproducido en Postgres 16.13 contra este mismo esquema: falla SIEMPRE,
-- también con la tabla vacía. No era una carrera — la escritura nunca ocurría.
-- Consecuencia: cada `invoice.paid` de Stripe terminaba en 500, Stripe agotaba
-- sus reintentos, y la flota quedaba pagada sin fila en `factura_saas` y por
-- tanto sin CFDI que timbrarle.
--
-- El predicado no compraba nada: en Postgres un único sobre columna nullable ya
-- deja pasar cuantos NULL quieras (NULLS DISTINCT es el default), así que el
-- índice total conserva exactamente la misma regla de negocio —un
-- `stripe_invoice_id` repetido sigue prohibido, y las filas sin él siguen
-- permitidas— y encima Postgres sí lo puede inferir.

drop index if exists public.factura_saas_stripe_unica;

create unique index if not exists factura_saas_stripe_unica
  on public.factura_saas (stripe_invoice_id);

comment on index public.factura_saas_stripe_unica is
  'Un invoice de Stripe = una fila. TOTAL a proposito, no parcial: `aplicarFactura` hace upsert con onConflict y PostgREST no puede emitir el predicado que un indice parcial exige para ser inferido. NULLS DISTINCT (default) mantiene permitidas las facturas sin id de Stripe.';
