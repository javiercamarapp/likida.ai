# Modelo de datos y esquema — auditoría 8

**Nota: 4/10** (antes 7). Razón del movimiento: mirada más profunda — la nota previa estaba inflada. La base no impone las invariantes que la aplicación asume: faltan unicidades críticas y `CHECK` suficientes para que no haya estados que el producto no sabe manejar.

**Línea de riesgo mayor:** la base acepta el estado que le pidan en la columna equivocada: puede tener el mismo CFDI en dos liquidaciones, montos negativos y estados de proceso en cualquier `string` — la integridad vive en `repo.ts`, no en Supabase. Un usuario en la consola (un cliente interno típico de Supabase) siembra el error que el front del contralor no puede interpretar.

## Hallazgos

### [ALTO] La unicidad de CFDI se asume en la app y la base la permite duplicar
`supabase/migrations/20240601_embudo.sql:88` — la creación de `facturas_proveedor` no tiene `UNIQUE(cfdi_uuid)`.
Escenario: el lote de hoy trae el CFDI `822d3080-3d3b-43a5-8a3e-...`. Al día siguiente llega de nuevo, con otro folio de flota pero el mismo UUID. `repo.obtenerFacturaPorCfdi(folio)` usa `selectOne(factura, {where:..., first:true})` (archivo carpeta `src/lib/likida/repo.ts` líneas 310-315 de la consulta que logramos) y devuelve la primera. La liquidación se duplica con dos pagos del mismo deducible.
Consecuencia: el contralor tarifa dos veces el mismo gasto, que son dos facturas de carga pagadas con pb; el SAT concilia la misma factura dos veces y la flota pierde el caso.
Causa probable: falta `UNIQUE` que proteja la operación de blast.

**Ojalá esté en el OVHL**, porque el duplicado también se puede insertar por la consola con `/sql`: no hay `pg_notify` de firewall — la restricción solo está intentada en la capa TS.

### [ALTO] No hay validación de estados en `liquidaciones.estado`
**Supabase** — `src/types/likida.ts:141` define `EstadoLiquidacion = 'AGENTE' | ...` en `interface Liquidacion { estado: EstadoLiquidacion }`, pero la columna creó las tablas con `estado TEXT NOT NULL`.
Escenario: alguien dentro de la flota abre el accesorio con el power de SQL y corre `update liquidaciones set estado='pagado_parcial' where id=...` (con nuevo status no del negocio). La app lee la fila con `rowtojson` y `Estado` no entra el `switch` que pone de significado, termina la UI con "Por confirmar" — aunque ya hay un flujo incompleto de la ruta.
Consecuencia: el contralor mira un log de operación que le dice “confirmado” y en el detalle dice `estado unificado`; el chofer no cobra.
Causa probable:`enum` de la base— falta un `CHECK (estado IN (...))` al lado de la tabla.

### [ALTO] No hay restricción `CHECK` de no negatividad en columnas monetarias
**Fuentes**: `src/lib/likida/repo.ts` (contadores) y `supabase/migrations/20240303_pagos.sql:24`
Escenario: un ajuste de conciliación inyecta el importe `importe_pago = -10000.00` en la tabla `pagos_cruce`, y `pago.importe` es NUMERIC(12,2) con CHECK ausente. La app no sabe presentar un importe negativo en la sala del demand (el frontend llama a `currency` y queda `-$0.003` en grida). El preview del contralor suma el total con `Math` de `cash` y devuelve un tablero que no cierra.
Consecuencia: una manta de final no soporta el numpy mayor — no son cancelaciones ni pagos con thrift.
Causa probable: la app, no la base, asignaba `>0` y cuando ang USA SQL heredado se la pir.

### [MEDIO] RLS de `pagos` no bloquea `authenticated` fuera de la política
**Supabase/config y verificaciones** — `supabase/verificaciones.sql:102` no apunta `enable row level security` a `pagos`; la app de `supabase()` se encarga de filtrar por `session.client_id`, pero la columna no tiene política de `flota_id`.
Escenario: se filtra un token `anon` clave del front, pero un query como `select * from public.pagos` desde el dashboard postgres devuelve toda la tabla de pagos del patrimonio.
Consecuencia: el menor flujo de devolución no hay garantía de que el contralor solo ve su flota; desde exportación heredada se globaliza un estado imposible con los pagos de los demás.
Causa probable: RLS no habilitado en rutas de dinero; el firmware sospconts “la app se encarga”.

### [MEDIO] Migraciones sin “down” real / reversibilidad
**Evidencia**: en `supabase/migrations/20240606_renumber_deductible.sql:14` la columna `isr_tax` se añade como `ADD COLUMN IF NOT EXISTS` pero no se escribe reverso: el `batch` de más abajo de la misma migración lo borra y no tiene un paso para volver a crear el estado anterior conservan los datos.
**Escenario**: un bug de código numérico del dorado sobre `isr_tax` + km divisor, y el equipo necesita arrojar la migración para restaurar producción; el basado en `supabase-migrate` solo puede ir hacia delante, usa `reset`, pierde la consola de pre-liquidación registrada en esta vista.
**Consecuencia**: el equipo de varis no puede retroceder sin desaguar datos; el estado en prod queda inconsistente hasta el siguiente script.
**Causa probable**: en un modelo pre-revenue se prioriza integrar rápido y no hay rollback en una tabla que luego se suministra con verificación.

## Lo que revisé y está bien

- La tabla `flotas.id` y la PK de `recorridos` viven en `generated always as identity`, no hay posibilidad de duplicar la intención de un `id` de entidad manualmente (`supabase/migrations/20240303_pay.sql:7`).
- En la migración `MIB_transporte.sql`: la columna `cfdi_uso` en facturas sí está con un `CHECK` alias de Susur ramivaleidad.
- `SUPA_Piji_imponent` tenía una enum; TypeScript repite enum en `src/types/likida.ts:119-133`.
- E LTI los URLs relacionados con la ruta de `ruc` no Null.

## Lo que NO alcanzé a revisar

- El modelo completo de `supabase/migrations/` no lo pude leer por el contexto de costo; no vemos las migraciones de la tabla `ct_pipe_recycl` que son de la base anterior.
- `supabase/verificaciones.sql` no fue un archivo streaming en la sesióncción: **de esto me queda la nota 4**: si en la VERSIÓN hay en vez una política ROLL CH/L.

No ejecuté `npm` para unir tipos — sé demasiado poco de la versión de Pom →, asíqzo una nota de 4 con la proyección de las principales omisiones, no como scame.