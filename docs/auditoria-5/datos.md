# Modelo de datos y esquema — auditoría 5

**Nota: 6/10** (antes 7). Razón: deuda que cobró factura y mirada más profunda. La ronda anterior dejó **dos candados pendientes en la base** — en cobranza (0089) y proveedores (0091) — y hoy no veo que hayan pasado a una migración: siguen como propuestas, no como restricciones. Además, la nueva tabla de historial de sesión (0088) no tiene una unicidad verificable para “un turno de chat” que no sea la serial local. No subo porque lo que sí se arregló en esta ronda (la llave duplicada de la 0075) ya tiene guardián estructural, y eso impedirá silenciosamente una clase entera de errores de relación.

**Riesgo mayor del rubro, hoy:** un `INSERT` a la consola de Supabase puede meter una operación con monto negativo o una cobranza que no corresponde a ninguna factura del tenant, y el panel lo va a mostrar como dinero válido.

## Hallazgos

### [ALTO] La 0091 quedó sin candado de signo: un monto negativo entra a la base y el contralor lo ve como deuda a favor

`supabase/migrations/0091_proveedores.sql` (falta el `CHECK` donde hoy se publican los `monto` / `saldo`).

Escenario: entrada: `INSERT INTO proveedor_movimiento (tenant_id, proveedor_id, monto, concepto) VALUES ('flota-7', 'prov-abc', -1250.00, 'nota de crédito no modelada')`. La base lo acepta porque no hay ninguna restricción `CHECK` en la columna de monto. La pantalla `dashboard/agentes/proveedores` suma: el total del proveedor se dibuja como saldo a favor (`-1,250.00`), y la exportación `api/export/facturas-proveedor` lo serializa sin transformarlo. El contralor ve dinero que se desvanece solo y, al intentar pagar, el sistema no sabe si está cobrando o debiendo.

Consecuencia: al cliente real (flota) se le pinta un pasivo inventado; a la impresión del try-deal le cuesta el entendimiento del proveedor.

Causa probable: el dominio fue perfeccionado en `lib/` pero la tabla no tiene respaldo en la base. Las reglas de signo viven solo en la capa de aplicación.

REINCIDE: señalado en la ronda anterior como “0091 sin candado de signo”.

### [ALTO] La migración 0089 modela cobranza sin llave natural hacia la factura; una fila puede quedar huérfana
`supabase/migrations/0089_cobranza.sql`

Escenario: en la base, una fila de `cobranza` se inserta con el `folio_factura` de una factura que no pertenece al mismo `tenant_id` (o con `factura_id` que no existe). No hay una FK compuesta a la factura que imponga la pareja `(tenant_id, folio_de_la_factura)`. Supabase acepta esa fila. Luego corre el motor `lib/likida/agentes/cobranza_pura.ts`: y puede arrancar el aviso al chofer para una factura que jamás vio el sistema: “le avisamos” aunque el reporte de cobranza no sabe qué pasó. En la consulta del contralor, la fila desaparece cuando se aplica `WHERE tenant_id` + join por `folio`, pero los duplicados ya se cuantificaron.

Consecuencia: dos arrancan el mismo CFDI o una cobranza a un folio inexistente; el histórico muestra alertas de “pendiente” que no se pueden saldar y el aviso por WhatsApp sale con base vacía.

Causa probable: El hecho no fue atado a la llave natural compuesta de la factura; solo se pensó el lado de la aplicación.

### [MEDIO] El historial del agente (0088) no tiene restricción de unicidad de turno por sesión / tenant
`supabase/migrations/0088_historial_chat.sql`

Escenario: dos escrituras de streaming del chat, por una lectura del `run`, insertan dos “usuarios” de turno para la misma conversación (una corriente se reenvía por reintento del `webhook`). La tabla no tiene `UNIQUE (turno_id, mensaje_id)` ni algo equivalente, de modo que la misma respuesta se guarda dos veces. La UI de `dashboard/agentes` muestra la misma herramienta duplicada y, al continuar, las referencias del modelo se apuntan a una fila repetida.

Consecuencia: el punto donde se está “history” es con contexto duplicado; si afuera ese historial alimenta el agente, el mismo estado costará en un segundo, sumará tokens y muestra incoherencia al otro — pero no por hilo entre dos tenants.

Causa probable: la nueva tabla de persistencia se publicó sin unicidad de “turno original”.

Nota: no alcancé la enumeración completa de su columna; la línea exacta de la constricción que falta no está en la migración.

## Lo que revisé y está bien

- **FK compuesta de la migración 0075**: se detectó que dejó “dos relaciones” en 5 pares de tablas. Los commits `2e59040` y `566a962` repararon los tres embeds que se caían, y hay un mapa en `embeds_con_alias.test.ts` que barre y ancla para no porte a este autoreino atrás. La clase de bug es estructural ahora.
- **El caso CFDI doble** está cubierto en lo nuevo: la migración 0092 aplico `UNIQUE (tenant_id, folio)` en el camino que eso protegía; verificación 67 anotada con corrida real. El caso de manual más importante (“el mismo CFDI liquidándose dos veces”) dejó de pertenessiglo a un script.
- **Las migraciones que de verdad quedaron aplicadas** están en orden con `verificaciones.sql`; la 0092 fue corregida la misma semana y la verificación 67 lo sostiene. Los 66 bloques previos siguientes sí tener la corrida anotada, y cada nueva migración cuenta con su parte de verificación escrita.
- **Tipos de dinero en el resto de los agentes**: los campos que pertenecientemente están con signo/confirmación para no pintar pesos en pantallas que no lo autorizan (`lib/auth/visibilidad.ts`, guard suíte) — al menos en los primeros que pude confirmar en `visibilidad`; la expulsión de pesos en zonas no válidas está bajo prueba.

## Lo que NO alcancé a revisar

- La migración completa `supabase/migrations/0088_historial_chat.sql` y su RLS: no tuve el móvil de leer entera la tabla (pero la nico que señalo es la falta de unique del turno). Si existe un `unique(turno_id)` en otra extensión, este hallazgo queda inválido y con una nota por encima de la reposición.
- `src/types/likida.ts` contra la totalidad de las columnas nuevas de `li antes`: no verifiqué fila por fila que los tipos (números, booleans, `zod` si existe) no estén más en estricto que lo que en realidad puede contener la base.
- Las migraciones de la forma `0090` (`hitos_viaje` y despacho por WhatsApp): no alcancé a comprobar si el hit “un viaje computa con hitos duplicados” está restringido, ni si la DSL/ `processor.ts` puede contra la misma tabla con dos bloques distintos.
- Las restricciones de reactividad de la **mesa del jefe** de facturas: no llegué a verificar.

Si el trabajo de este rubro termina aquí, la nota es 6/10: las carpetas más grandes — la integridad del dinero y las llaves compuestas — ya están cubiertas, pero los tres índices/checks que todavía son “trabajo” son uno de los modos de falla que descaradamente van a la consola del investigador.