-- ═══════════════════════════════════════════════════════════════════════════
-- 0090 — RLS: el ROL entra a las tablas del dinero, y la ESCRITURA se cierra.
--
-- AUDITORÍA 17, los dos ALTO de seguridad que llevan CINCO pases abiertos
-- (A1 y A2). Los dos nacen de la misma línea: la 0086 recreó `tenant_data`
-- sobre 19 tablas como `for all using (tenant_id = any(get_user_tenant_ids())
-- or is_superadmin())`. Acota el TENANT y no mira ni el ROL ni el VERBO.
--
-- Reproducido contra un Postgres 16 con las 89 migraciones aplicadas
-- (12-ago-2026), impersonando con `set local role authenticated` +
-- `request.jwt.claims`:
--
--   enc-ve-gasto=1  enc-ve-liq=1  enc-escribe-liq=t
--   cont-inserta-gasto=t  cont-borra-gasto=1  cont-update-operador=t
--   bitacora-firmada-por-otro=t
--
-- Es decir, hoy, con la anon key —que es pública por diseño— y una sesión de
-- la flota:
--
--   · A1 · el ENCARGADO (jefe de tráfico, `visibilidad.ts` le da solo
--     'operacion') lee y escribe `gasto` y `liquidacion` por PostgREST. La
--     frase que el producto vende —"el encargado despacha, no factura"— vive
--     únicamente en TypeScript. La 0048 ya había escrito la solución para las
--     tablas comerciales (`ve_finanzas()`), y las 19 del núcleo se quedaron
--     fuera.
--   · A2 · el CONTADOR, que en la app solo exporta (`permisos.ts`: no
--     `puedeAsignar` ni `puedeAdministrar`), puede INSERTAR, ACTUALIZAR y
--     BORRAR las 19 tablas: borrar un gasto comprobado, mover el teléfono de
--     un operador (que es su identidad de WhatsApp) o sembrar una entrada de
--     bitácora firmada con el correo del dueño.
--
-- ── LA REGLA QUE SE APLICA, Y DE DÓNDE SALE ────────────────────────────────
--
-- No se inventa doctrina: la escribió la 0078 para `tenant`, con estas
-- palabras — "la app escribe SIEMPRE por service_role (server actions,
-- supabaseAdmin), así que por RLS nadie debe escribir — solo leer". Sigue
-- siendo cierto y se verificó archivo por archivo antes de escribir esto:
-- `supabaseServer()` (el ÚNICO cliente sujeto a RLS) aparece seis veces en
-- todo `src/`, y ninguna escribe una tabla de negocio — `dashboard/layout.tsx`
-- (signOut), `admin/layout.tsx` (signOut), `login`, `auth/callback`,
-- `cuenta/page.tsx` (lee `tenant.nombre`) y `session.ts` (lee su propia fila
-- de `app_user`). Todo lo demás pasa por `supabaseAdmin()`, que es
-- service_role y BYPASEA RLS.
--
-- Por eso esta migración NO PUEDE romper la app de hoy: cierra un camino
-- —PostgREST con la anon key— que el producto no usa. Lo que cierra es el
-- camino del que un usuario de la flota sí dispone.
--
-- Y por eso mismo el modo de falla del futuro es el bueno: el día que alguien
-- escriba una de estas tablas con el cliente de sesión, PostgREST contesta
-- 42501 en la primera prueba. Falla ruidoso y en desarrollo, no callado y en
-- producción. El arreglo, ese día, es escribir por service_role como escribe
-- todo lo demás — no reabrir la policy.
--
-- ── LA PARTICIÓN, Y POR QUÉ ESTA Y NO OTRA ─────────────────────────────────
--
-- DINERO (6): el `select` exige `ve_finanzas()` (0048: superadmin,
-- flota_admin, contador — espeja `AREAS_POR_ROL.dinero`). Es exactamente el
-- criterio con el que la 0048/0049/0051 cerraron `cliente`, `tarifa`,
-- `factura_emitida`, `pago_recibido`, `cotizacion` y `factura_viaje`; estas
-- seis son las mismas de siempre, las que sí tienen filas.
--
-- OPERACIÓN (13): el `select` NO cambia — sigue siendo el tenant. Los tres
-- roles de oficina despachan sobre los mismos viajes, unidades y operadores;
-- restringir la LECTURA de operación al contador rompería la liquidación (una
-- liquidación es de un viaje) sin cerrar ningún hallazgo. Lo que cambia en
-- las 13 es el verbo: se acabó la escritura.
--
-- `viaje` queda en OPERACIÓN aun cargando `anticipo` e `ingreso_flete`: es la
-- pantalla del jefe de tráfico y RLS es por fila, no por columna. Esa
-- distinción se anota aquí porque es real y no la cierra esta migración.
--
-- Lo que esta migración deliberadamente NO toca, para que no se lea como
-- cubierto: `ticket_mensaje` (su policy filtra por join a `ticket_soporte` y
-- se queda `for all`), y las seis tablas comerciales de 0048/0049/0051, donde
-- que el contador ESCRIBA un pago recibido es una decisión de producto
-- plausible y no un hallazgo de nadie.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Las 6 tablas del DINERO ─────────────────────────────────────────────
--    Lectura con rol; escritura, ninguna.
do $$
declare t text;
begin
  foreach t in array array[
    'cfdi_consolidado_linea', 'cfdi_xml', 'gasto', 'liquidacion',
    'llm_costo', 'politica_gasto'
  ]
  loop
    execute format('drop policy if exists tenant_data on public.%I', t);
    execute format('drop policy if exists finanzas_lectura on public.%I', t);
    execute format($p$
      create policy finanzas_lectura on public.%I for select
      using ((tenant_id = any(get_user_tenant_ids()) and ve_finanzas()) or is_superadmin())
    $p$, t);
    execute format($c$
      comment on policy finanzas_lectura on public.%I is
        'SOLO lectura y SOLO para quien ve dinero (0090). El encargado despacha, no factura: ve_finanzas() espeja AREAS_POR_ROL.dinero de lib/auth/visibilidad.ts. Escritura: ninguna por RLS — la app escribe por service_role.'
    $c$, t);
  end loop;
end $$;

-- ── 2. Las 13 tablas de OPERACIÓN ──────────────────────────────────────────
--    Misma lectura que antes (el tenant); la escritura se va.
do $$
declare t text;
begin
  foreach t in array array[
    'campania', 'envio_mensaje', 'geocerca', 'incidencia', 'mantenimiento',
    'operador', 'pod', 'posicion', 'terminal', 'ticket_soporte', 'unidad',
    'viaje', 'wa_conversacion'
  ]
  loop
    execute format('drop policy if exists tenant_data on public.%I', t);
    execute format('drop policy if exists tenant_lectura on public.%I', t);
    execute format($p$
      create policy tenant_lectura on public.%I for select
      using (tenant_id = any(get_user_tenant_ids()) or is_superadmin())
    $p$, t);
    execute format($c$
      comment on policy tenant_lectura on public.%I is
        'SOLO lectura por RLS (0090), misma regla de tenant que traía. La escritura se retiró: la app escribe por service_role (misma doctrina que tenant_self en 0078), y por PostgREST ni el contador ni el encargado mueven la operación.'
    $c$, t);
  end loop;
end $$;

-- ── 3. La bitácora deja de aceptar firmas ajenas ───────────────────────────
--
-- La 0053 lo declaró en su propia cabecera —"solo la service role escribe, y
-- solo inserta"— y acto seguido creó `bitacora_insercion` abierta a cualquier
-- usuario del tenant. La 0079 le añadió `not is_operador()` (el chofer), y la
-- 0086 lo retiró al morir ese rol, dejándola otra vez a secas. El resultado
-- verificado hoy: un contador inserta `actor_email = 'dueño@flota'` con la
-- acción que quiera.
--
-- No se parcha con `actor_id = auth.uid()`: `actor_id` es nullable y
-- `actor_email` es texto libre, así que la comparación se esquiva dejando el
-- id en NULL. Se cierra el verbo entero, que es lo que la 0053 quiso decir.
-- Los dos únicos escritores del repo —`administracion.ts:47` y
-- `facturacion/avisar.ts:131`— ya usan `supabaseAdmin()`.
--
-- `bitacora_lectura` (0053) se queda intacta: `administra_flota()`, solo el
-- dueño lee su bitácora. Y sin policy de UPDATE ni de DELETE, sigue siendo
-- append-only (bloque 32).
drop policy if exists bitacora_insercion on public.bitacora_auditoria;

comment on table public.bitacora_auditoria is
  'Append-only y de ESCRITURA EXCLUSIVA del service_role (0090). Un registro de auditoria que un usuario de la flota puede firmar con el correo de otro no sirve como evidencia: hasta la 0090, un contador insertaba una entrada a nombre del dueno.';
