-- ═══════════════════════════════════════════════════════════════════════════
-- AUDITORÍA 22 · LEG-A4 (ALTO) — «el titular quedó anonimizado» era falso.
--
-- La 0262 declaró su alcance en su propio comentario: «el esquema completo de
-- `operador`». Las tablas donde vive lo que el TITULAR ESCRIBIÓ quedaron fuera
-- de ese perímetro, y ahí es donde su nombre sobrevive en texto libre.
--
-- Escenario: Juan pide cancelación, el contralor aprieta «Ejecutar
-- cancelación», y `/dashboard/arco` le confirma «el titular quedó anonimizado
-- en la base». Pero si Juan escribió por el chat de asistencia
--
--     «soy Juan Pérez de la unidad 12, choqué en el km 84 y me llevaron al
--      IMSS de Querétaro»
--
-- esa cadena sobrevive íntegra en `incidencia.descripcion` (hasta 500
-- caracteres, asistencia_wa.ts:524) y en `incidencia_evento.detalle->>'texto'`
-- (otros 500 por cada mensaje adicional, :670 y :832).
--
-- Es la falla silenciosa más cara que existe en cumplimiento: la flota FIRMA
-- que cumplió y no cumplió. Si la autoridad pide el expediente, el nombre del
-- titular cancelado aparece en texto libre. Y rompe la regla de la casa: un
-- rótulo tiene que ser verdad.
--
-- ── QUÉ SE HACE CON EL TEXTO, Y POR QUÉ NO SE BORRA EL RENGLÓN ─────────────
-- La incidencia NO se borra: es un hecho operativo de la flota (hubo un
-- accidente, con lesionados o sin ellos, tal día en tal punto) y la empresa
-- tiene sus propias obligaciones sobre eso. Lo que se cancela es el vínculo
-- con la PERSONA, que es lo que el derecho de cancelación alcanza.
--
-- Así que se sustituye el texto libre por una marca explícita, se sueltan las
-- llaves al titular (`operador_id`) y se deja constancia de cuándo. Un texto
-- vaciado sin marca se leería como «no escribió nada», que es otra mentira.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.incidencia
  add column if not exists texto_anonimizado_en timestamptz;

comment on column public.incidencia.texto_anonimizado_en is
  'Cuándo la cancelación ARCO sustituyó `descripcion` por la marca. NULL = el texto sigue siendo el que escribió el titular. Auditoría 22, LEG-A4.';

create or replace function public.ejecutar_arco_cancelacion(
  p_tenant uuid,
  p_solicitud uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, extensions, pg_catalog
as $$
declare
  v_operador uuid;
  seudonimo text;
  ev jsonb := '{}'::jsonb;
  n int;
begin
  select s.operador_id into v_operador
    from solicitud_arco s
   where s.id = p_solicitud and s.tenant_id = p_tenant and s.tipo = 'cancelacion'
   for update;

  if v_operador is null then
    return jsonb_build_object('ok', false, 'motivo', 'solicitud_no_encontrada_o_sin_operador');
  end if;

  seudonimo := 'Titular cancelado ' || substr(encode(digest(v_operador::text, 'sha256'), 'hex'), 1, 8);

  -- Las imágenes de gasto/CFDI se CONSERVAN: son evidencia fiscal. La antigua
  -- 0173 las ponía en una cola de borrado; 0178 no promete ese borrado.
  ev := ev || jsonb_build_object('evidencia_fiscal_retenida', true, 'fundamento_retencion', 'CFF art. 30');

  delete from wa_conversacion where tenant_id = p_tenant and operador_id = v_operador;
  get diagnostics n = row_count; ev := ev || jsonb_build_object('wa_conversacion', n);

  delete from envio_mensaje e
   where e.tenant_id = p_tenant
     and e.telefono = (select telefono from operador where id = v_operador);
  get diagnostics n = row_count; ev := ev || jsonb_build_object('envio_mensaje', n);

  -- ── 0273 (LEG-A4): EL TEXTO QUE ESCRIBIÓ EL TITULAR ──────────────────────
  -- Lo que la 0262 no alcanzó. El renglón sobrevive (es un hecho operativo de
  -- la flota); lo que se cancela es el vínculo con la persona.
  update incidencia
     set descripcion = '[texto retirado por cancelación ARCO del titular]',
         operador_id = null,
         texto_anonimizado_en = now()
   where tenant_id = p_tenant and operador_id = v_operador
     and texto_anonimizado_en is null;
  get diagnostics n = row_count; ev := ev || jsonb_build_object('incidencia_texto_anonimizado', n);

  -- Los mensajes adicionales del mismo hilo: `detalle->>'texto'` guarda otros
  -- 500 caracteres por cada uno. Se sustituye la CLAVE, no se borra el evento:
  -- la bitácora de qué pasó y cuándo es de la flota.
  update incidencia_evento e
     set detalle = jsonb_set(
           coalesce(e.detalle, '{}'::jsonb),
           '{texto}',
           to_jsonb('[texto retirado por cancelación ARCO del titular]'::text),
           true)
   where e.tenant_id = p_tenant
     and e.detalle ? 'texto'
     and e.incidencia_id in (
       select i.id from incidencia i
        where i.tenant_id = p_tenant and i.texto_anonimizado_en is not null
     );
  get diagnostics n = row_count; ev := ev || jsonb_build_object('incidencia_evento_texto_anonimizado', n);

  update operador
     set nombre = seudonimo,
         telefono = 'anon:' || substr(encode(digest(v_operador::text || 'tel', 'sha256'), 'hex'), 1, 16),
         rfc = null,
         licencia = null,
         licencia_tipo = null,
         licencia_vence = null,
         anonimizado_en = now()
   where id = v_operador and tenant_id = p_tenant;
  get diagnostics n = row_count; ev := ev || jsonb_build_object('operador_anonimizado', n);

  update app_user
     set nombre = seudonimo, telefono = null, avatar_url = null
   where operador_id = v_operador;
  get diagnostics n = row_count; ev := ev || jsonb_build_object('app_user_anonimizado', n);

  update solicitud_arco
     set estado = 'resuelta', resuelta_en = now(), ejecutada_en = now(), evidencia = ev,
         resolucion = coalesce(resolucion, 'Cancelación ejecutada: datos personales anonimizados, incluido el texto libre que el titular escribió por el chat. La documentación fiscal se conserva por el art. 30 del CFF y queda desligada del titular.')
   where id = p_solicitud and tenant_id = p_tenant;

  return jsonb_build_object('ok', true, 'evidencia', ev, 'seudonimo', seudonimo);
end;
$$;

comment on function public.ejecutar_arco_cancelacion(uuid, uuid) is
  'Ejecuta una solicitud ARCO de CANCELACIÓN (no oposición): anonimiza nombre, teléfono, RFC y licencia del operador, borra su conversación de WhatsApp y sus envíos, anonimiza su app_user, y —desde la 0273 (auditoría 22, LEG-A4)— retira el TEXTO LIBRE que el titular escribió en `incidencia.descripcion` e `incidencia_evento.detalle->>texto`, soltando `incidencia.operador_id`. El renglón de la incidencia sobrevive: es un hecho operativo de la flota; lo que se cancela es el vínculo con la persona. NO toca la documentación fiscal ya emitida (gasto.imagen_url, cfdi_uuid, ccp_timbre.xml): inmutable, retención de 5 años (CFF art. 30), desligada del titular. Regla para la próxima columna: identidad de la persona se anonimiza aquí; dato de la relación operativa que no identifica por sí solo se queda. Y regla para la próxima tabla: si guarda TEXTO QUE EL TITULAR ESCRIBIÓ, entra a esta función. SECURITY INVOKER.';
