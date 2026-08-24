-- pgTAP: leases/fencing de WhatsApp (migración 20260824071823).
-- Cubre la carrera observable en una sesión y verifica que el claim usa
-- SKIP LOCKED. La carrera real de dos sesiones se ejercita en el test TS.

begin;
select plan(16);

select ok(
  (select prosrc ilike '%for update skip locked%'
     from pg_proc
    where oid = 'public.claim_wa_evento_pendiente(text,integer,text,integer)'::regprocedure),
  'el claim de la bandeja usa FOR UPDATE SKIP LOCKED'
);

insert into public.wa_evento_pendiente (id, evento)
values ('zzz-lease-pg-inbox', '{"from":"5219990000000","type":"text"}'::jsonb);
select is(
  (select count(*)::int from public.wa_evento_pendiente where id = 'zzz-lease-pg-inbox'),
  1,
  'la fila de prueba existe'
);

select is(
  (select count(*)::int from public.claim_wa_evento_pendiente('zzz-lease-pg-inbox', 0, 'worker-a', 180)),
  1,
  'el primer worker obtiene el lease'
);
select is(
  (select count(*)::int from public.claim_wa_evento_pendiente('zzz-lease-pg-inbox', 1, 'worker-b', 180)),
  0,
  'un segundo worker no obtiene un lease vigente'
);
select is(
  public.renew_wa_evento_pendiente('zzz-lease-pg-inbox', gen_random_uuid(), 'worker-a', 180),
  false,
  'un token ajeno no puede renovar'
);
select is(
  public.renew_wa_evento_pendiente(
    'zzz-lease-pg-inbox',
    (select lease_token from public.wa_evento_pendiente where id = 'zzz-lease-pg-inbox'),
    'worker-a', 180
  ),
  true,
  'el dueño puede renovar su lease'
);
select is(
  public.complete_wa_evento_pendiente('zzz-lease-pg-inbox', gen_random_uuid(), 'worker-a'),
  false,
  'un token ajeno no puede completar'
);
select is(
  public.complete_wa_evento_pendiente(
    'zzz-lease-pg-inbox',
    (select lease_token from public.wa_evento_pendiente where id = 'zzz-lease-pg-inbox'),
    'worker-a'
  ),
  true,
  'el dueño puede completar y limpiar el lease'
);
select is(
  (select count(*)::int from public.claim_wa_evento_pendiente('zzz-lease-pg-inbox', 1, 'worker-c', 180)),
  0,
  'un evento completado no se reclama otra vez'
);

insert into public.wa_evento_pendiente (id, evento)
values ('zzz-lease-pg-fail', '{"from":"5219990000001","type":"text"}'::jsonb);
select is(
  (select count(*)::int from public.claim_wa_evento_pendiente('zzz-lease-pg-fail', 0, 'worker-a', 180)),
  1,
  'el segundo evento obtiene un lease'
);
select is(
  public.fail_wa_evento_pendiente('zzz-lease-pg-fail', gen_random_uuid(), 'worker-b', 'ajeno', false),
  false,
  'un worker ajeno no puede liberar ni anotar el fallo'
);
select is(
  public.fail_wa_evento_pendiente(
    'zzz-lease-pg-fail',
    (select lease_token from public.wa_evento_pendiente where id = 'zzz-lease-pg-fail'),
    'worker-a', 'fallo de prueba', false
  ),
  true,
  'el dueño puede fallar y liberar su lease'
);
select is(
  (select count(*)::int from public.claim_wa_evento_pendiente('zzz-lease-pg-fail', 1, 'worker-b', 180)),
  1,
  'otro worker puede recuperar después de fail fenced'
);
select is(
  (select count(*)::int from public.claim_wa_mensaje_procesado('zzz-lease-downstream', 'worker-a', 180)),
  1,
  'el claim downstream obtiene su primer lease'
);
select is(
  (select estado from public.claim_wa_mensaje_procesado('zzz-lease-downstream', 'worker-b', 180)),
  'en_curso',
  'el claim downstream no roba un lease vigente'
);
select is(
  public.complete_wa_mensaje_procesado('zzz-lease-downstream', gen_random_uuid(), 'worker-b'),
  false,
  'el downstream también rechaza un token ajeno'
);

select * from finish();
rollback;
