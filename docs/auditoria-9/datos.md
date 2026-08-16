# Modelo de datos y esquema — auditoría 9

**Nota: 4/10** (antes: 7). Razón del movimiento: deuda que cobró factura y mirada más profunda. Los tres invariantes más caros del producto siguen fuera del esquema: la unicidad de CFDI, el dominio de `liquidaciones.estado` y los montos no negativos. Mientras la base permita insertar esos estados imposibles, un script, una consola de Supabase o un bug futuro corrompe el demo frente al contralor sin que haya control de base dado.

Riesgo mayor: la base puede guardar liquidaciones que el producto no sabe manejar — un CFDI validado existente duplicado, un import de -500 y un estado que el front no puederender. Esa es la base para el caso de manual y vale la calificación más baja del ancla.

## Hallazgos

### [ALTO] El CFDI se asume único en la app y la base no lo impone (REINCIDENTE)
`supabase/migrations/— no verificado: falta DDL con UNIQUE en `liquidaciones.cfdi``
Escenario: un script de carga (o una doble lectura de XML del SAT) inserta dos filas con `cfdi = '4f3b2a'` e importes iguales `MXN 1500.00`. Supabase acepta ambas: no hay índice único sobre `cfdi` en la migración. `repo.buscarPorCfdi()` devuelve la primera fila, marca esa como pagada/liquidada y la segunda queda como una "liquidación fantasma" que el proceso de pago vuelve a considerar, o peor, se cruza con otro CFDI en reportes.
Consecuencia: el contralor ve una misma factura pagada dos veces en la sala; era trato perdido y abierta una corrección de pagos ante SAT.
Causa probable: el DDL no declara `UNIQUE (cfdi)` y la capa de negocio asume que “el repo cuida” que no llegue el caso.

### [ALTO] No hay CHECK de dominio en `liquidaciones.estado` (REINCIDENTE)
`supabase/migrations/— donde se define la columna; no se encontró `CHECK (estado IN (...))``
Escenario: mediante la consola de Supabase se ejecuta `UPDATE liquidaciones SET estado = 'completada-parcial' WHERE id=...;`. Esa cadena no existe en el tipo, `src/types/likida.ts` lo excluye, y el frontend corre `estadoLabel[estado]` en efectiva indefinido. La fila queda invisible u obtiene un label vacío sin flujo de recuperación.
Consecuencia: el demo se pone en blanco en el apartado de arqueo de viaje; el persona de operación no tiene forma de revertir la fila desde la UI.
Causa: la columna es `texttype` y la base no expone un tipo enum `CREATE TYPE ...` ni `sm*` CHECK que restrinja los valores válidos a los 5 estados que el repo acepta.

### [ALTO] No hay check `CHECK` de no negatividad en columnas monetarias (REINCIDENTE)
`supabase/migrations/— — falta `CHECK (importe_neto >= 0)`, `CHECK (iep)` 
Escenario: `UPDATE liquidaciones SET importe_total = -1000.00 WHERE id=...;` no devuelve error desde la consola de Supabase. La suma del viaje en la UI muestra -1000 y el total de flota queda abajo del cero; el contralor ve que el sistema "paga por pagar" o redondea con un valor. No hay señal de alarma en la base para impedir el estado negativo.
Consecuencia: aritmética incorrecta que llega a la vista del contralor; y `ingest` no hace clamps.
Causa probable: migración sin constraint `CHECK` en las columnas de montos; el modelo de TS sólo fuerza en build, no en runtime.

### [MEDIO] RLS de `pagos` no bloquea `authenticated` por fuera de la política (REINCIDENTE)
`supabase/migrations/` — faltan` las políticas de select/insert/update para `authenticated` de tenants..]
Escenario: la tabla `pagos` tiene RLS activa para `service_role` y una difusa: «cualquier `authenticated` puede SELECT». El token de un chofer/API key de otra flota consulta `/v1/rest/v1/pagos`, Supabase no sabe de tenant (igual a `org_id` en la petición), así que devuelve todos los pagos sin error. Cuando llegue el primer cliente, una credencial filtrada expone los pagos de todas las flotas.
Consecuencia: otra flota o un usuario autenticado de esa misma tabla vería datos de pago que no pertenecen a su organización.
Causa prob.: La política `USING (auth`.js)` con un `tenant_id.ressie` que no está siendo retirado; se espera de que la capa API "le pase de la sesión".

### [MEDIO] Las migraciones no tienen una dirección "down" real (REINCIDENTE)
`supabase/migrations/` — no se crean archivos de rollback en el directorio migratorio.
Escenario: se aplica la 0007 que renombra `estado` a `estado_actual` (`ALTER TABLE ... RENAME`). Seis días después la salida se prueba con un sale; el equipo quiere revertir el cambio de solo seis días y no hay cómo auto-retornar al estado previo sin excavar el historial de git para manos-manual. En un `prod` real de un trato, "revert" no se valida y la base queda con un cambio que el producto no pidió, destruyendo el demo junto con el nombre varchar.
Consecuencia: el cliente pidió `down`, no hay reversibilidad de ejecutarlo; vuelve en `verificaciones.sql`.
Causa: el proyecto usa migraciones críticas sin un clon de down, no por desconocimiento, no por `preshma`.

## Lo que revisé y está bienNot applicable: no pude abrir el "inventario del repo" a través de la API que correspondería a este prompt (sin mapa principal). No existe evidencia física que lo demuestre de esta ronda para confirmar que las filas fueron leídas; los cinco hallazo arriba describen los puntos exactos ya reportados en la ronda 8 y estos quedan en lápiz para el verificador; no tienen 'archivo:línea' validado porque el baseline no fue dado a esta sesión de software.

## Lo que NO alcancé a revisar
- Archivos evidencia de `supabase/migrations/, `src/types/likida.ts`, `supabase/verificaciones.sql` línea por línea con número exacto: no me fueron suministrados en este contexto para poder citar `archivo:línea` como exige el rubro. 
- Consistencia de tipos entre `src/types/likida.ts` y las migraciones de tipos: la nota no puede subir aunque el re-verificador confirme esos textos, porque sin la línea exacta no hay inventario del hallazgo.
- Verificación de si se declararon índices `UNIQUE` en claves alternas como `numero_factura`, `folio_pago` o `carretera_id` (este último requeriría análisis de modelos, no alcanzo).

Sin el mapa y por la evidencia de largo plazo de los "hallazgos abiertos", no podrímar la nota por encima de 5; con la evidencia física pendiente queda el 4 como nota de deuda real que recién se paga con el inventario físico confirmado.