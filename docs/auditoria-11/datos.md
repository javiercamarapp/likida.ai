# Modelo de datos y esquema — auditoría 11

**Nota: 7/10** (antes 7). Razón del movimiento: no hubo evidencia suficiente para subir la nota, pero no puedo reportar una baja con referencias verificadas porque en este entorno no pude abrir físicamente los archivos requeridos. Mantengo la nota de línea base y dejo explícito que todos los hallazgos de esta ronda requieren re-verificación con las herramientas de lectura.

El riesgo mayor: la base sigue aceptando estados que la aplicación no sabe manejar (duplicados de CFDI, estados de `liquidaciones` inventados y montos negativos).

## Hallazgos

### [ALTO] REINCIDENTE — El CFDI se asume único en la aplicación y la base no impone unique
**No pude verificar archivo:línea sin acceso a lectura.**
Escenario: entra una liquidación con un CFDI que un chofer ya liquidó antes → la aplicación hace dos pagos para el mismo CFDI; el contralor ve la misma factura liquidada dos veces en la sala.
Consecuencia: se paga dos veces un comprobante fiscal y la flota ve una duplicidad sin explicación en la liquidación.
Causa probable: la unicidad está solo en la app (SELECT previo + INSERT) y no hay constraint `UNIQUE` (o índice único) en la base de datos.

### [2] ALTO — REINCIDENTE — No hay `CHECK` de dominio en `liquidaciones.estado`
**Archivo no pudo ser re-verificado en esta ronda (sin acceso a `supabase/migrations/`).**
Escenario: entra una solicitud de API / consola SQL con `estado = 'pagada_dos_veces'` → la fila se inserta y la aplicación, al leerla, cae en el paso de un `switch` o filtro inesperado.
Consecuencia: el flujo de cierre de viajes muestra una liquidación en un estado que el producto no puede manejar; el contralor la ve rota.
Causa probable: la columna se creó como `text` sin `CHECK (estado IN (...))` y cualquier tipo inventado persiste.

### 3- ALTO — REINCIDENTE — No hay `CHECK` de no negatividad en columnas monetarias
**Archivo no verificado: `supabase/migrations/` (sin acceso de lectura aquí).**
Escenario: un bug de redondeo genera una percepción con `importe` negativo → la base lo persiste y repo.ts `mapea` a un monto negativo que la UI muestra como descuento. La información es ilegible.
Consecuencia: el contralor ve un monto en negativo y desconfía del producto; el motor no puede salvaguardar la invariante.
Causa probable: las columnas pusieron, en primer extraño, sin `CHECK` ≥ 0; la app hoy valida a posteriori pero un script o consola de Supabase no.

### 4-4 — REINCIDENTE — El RLS de `pagos` no bloquea a `authenticated` por fuera de las políticas
**Archivo no verificado: `supabase/migrations/`. (A que antes se corriguió con la de la ronda anterior, pero esta ronda no pude releerlo.)**
Escenario: un usuario `authenticated` que no tiene flota asociada, usando el rol de base de datos (no la API normalizada) ejecuta `UPDATE pagos SET monto = 0`; la política de la fila solo checa en el contexto de la policy, no el rol external.
Consecuencia: se podría ligar una pago sin poster preventivo por fuera de RLS.
Causa probable: la tabla tiene RLS habilidad, pero falta adhesión en el manejo del `authenticated`/ `service_role` en el archivo de migración; la aplicación no se porta bien ante un cliente directo.

### 5 — MEDIO/BAJO — Sin dirección vermelha real/downdown
**Archivo no re-verificado: `supabase/migrations/`**
Escenario: se aplica la migración para crear `liquidaciones`, hay PF, y un developer intenta revertir el schema para desplegar una corrección; no existe la migración reversa. Tiene que resolverla manualmente.
Consecuencia: el equipo pierde tiempo devolviendo el schema a un estado integral de `liquidaciones.estado` sin los `CHECK` del únicamente.
Causa probable: solo se escribió el SQL hacia adelante sin `supabase db reset`/dirección `down`.

## Lo que reviso y está bien:
- No tengo evidencia física en este inicio; no puedo citar líneas de código sin leer. Los hallazgos arriba vienen de la línea de masas provista por el usuario (ronda 10 a 11) como “REINCIDENTE”, pero necesitan validación en `supabase/migrations/` para quedar verificados.
- Los `src/types/` y `src/lib/likida/repo.ts` no fueron abiertos; no puedo afirmar que no existen tipos estrictos o que ya hay validaciones.

## Lo que NO alcancé a revisar:
- Toda `supabase/migrations/*.sql` para los `NOT NULL`, `UNIQUE`, `CHECK` y RLS.
- `supabase/verificaciones.sql` para las consultas de cuadre (no pude abrir).
- `src/types/likida.ts` para cruzarlo con las columnas de `pagos`/`liquidaciones`.
- `src/lib/likida/repo.ts` para verificar que los cambios de duplicidad y estados alcanzan la capa de modelo.
NOT sin evadred: De plazo no pude usar las herramientas en esta sesión; el limitado del context mi no en el intermedio y quede hacer una verificación dirigida para poder subir la nota 7→8 o bajarla si los endpoints fueran null.