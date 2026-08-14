# Modelo de datos y esquema — auditoría 3

**Nota: 6/10** (antes 7).

**Razón del movimiento.** La factura que cobró la deuda hoy es de este rubro: la FK compuesta anti-cross-tenant (patrón 0028, catálogo vivo) dejó doble relación en 5 pares de tablas y tres embeds sin alias tumbaron producción (página de Cobranza con error boundary, cron de escalación y aviso de cierre rotos en silencio; commits `2e59040`/`566a962`). Un cambio de esquema correcto se desplegó sin barrer a sus consumidores — eso baja la nota aunque el arreglo ya esté verificado. Además, dos de las tres migraciones nuevas repiten lecciones que este repo ya pagó: la 0091 crea una columna de dinero sin candado de signo (la lección de la 0070) y la 0089 crea una tabla hija de viaje sin la FK compuesta que sus hermanas recibieron en 0028/0073. Lo que evita caer más: el barrido exhaustivo confirma CERO embeds ambiguos restantes, y todas las unicidades críticas nuevas están en la base y verificadas con corrida real (bloques 64 y 66).

**Riesgo mayor hoy.** `factura_proveedor` acepta `total <= 0` y cualquier tipo de comprobante, y la ruta de ingesta real produce esas filas con archivos comunes: un REP (complemento de pago, tipo `P`, `Total="0"`) entra a la bandeja como "factura" de $0.00 y sale en el layout al ERP.

---

## Resultado del barrido de embeds (el encargo central)

**CERO embeds ambiguos sobre los 5 pares con doble FK.** Barrido sobre `src/`, `scripts/` y `pruebas-manuales/` con dos métodos independientes (extractor de literales dentro de `.select(...)` en Python, y grep crudo sobre toda literal de cadena), **ambos validados con control positivo**: la versión pre-fix de `cobranza.ts` (`git show 2e59040^`) es atrapada por los dos detectores — el primer intento de grep con `\s` dentro de corchetes NO la atrapaba y se descartó. También cero usos de `foreignTable`/`referencedTable`, cero filtros `.eq('tabla.columna')` sobre los pares, cero `!inner`/`!left`, y cero `select=` en URLs crudas.

### Tabla de embeds por par de FK doble (los 20 que existen, alias por alias)

| Par (doble FK) | Archivo:línea | Embed usado | Veredicto |
|---|---|---|---|
| viaje→operador | `src/lib/likida/agentes/cobranza.ts:107` | `operador:operador_id(nombre, telefono)` | desambiguado |
| viaje→operador | `src/lib/likida/analytics.ts:238` | `operador:operador_id(nombre)` | desambiguado |
| viaje→operador | `src/lib/likida/analytics.ts:895` | `operador:operador_id(nombre)` | desambiguado |
| viaje→operador | `src/lib/likida/analytics.ts:934` | `operador:operador_id(nombre)` | desambiguado |
| viaje→operador | `src/lib/likida/avisar_cierre.ts:59` | `operador:operador_id(nombre)` | desambiguado |
| viaje→operador | `src/lib/likida/escalar_viaje.ts:90` | `operador:operador_id(nombre, telefono)` | desambiguado |
| viaje→operador | `src/lib/likida/fiscal.ts:769` | `operador:operador_id(nombre)` | desambiguado |
| viaje→operador (anidado) | `src/lib/likida/analytics.ts:1285` | `viaje:viaje_id(…, operador:operador_id(nombre))` | desambiguado |
| viaje→operador (anidado) | `src/lib/likida/fiscal.ts:929` | `viaje:viaje_id(folio, operador:operador_id(nombre))` | desambiguado |
| viaje→operador (anidado) | `src/app/api/export/liquidaciones/route.ts:67` | `viaje:viaje_id(folio, operador:operador_id(nombre))` | desambiguado |
| viaje→operador (anidado) | `src/lib/likida/agentes/cobranza.ts:291` | `viaje:viaje_id(folio, operador:operador_id(nombre))` | desambiguado |
| liquidacion→viaje | `src/lib/likida/analytics.ts:1285` | `viaje:viaje_id(…)` | desambiguado |
| liquidacion→viaje | `src/lib/likida/analytics.ts:1730` | `viaje:viaje_id(folio)` | desambiguado |
| liquidacion→viaje | `src/lib/likida/fiscal.ts:929` | `viaje:viaje_id(…)` | desambiguado |
| liquidacion→viaje | `src/app/api/export/liquidaciones/route.ts:67` | `viaje:viaje_id(…)` | desambiguado |
| gasto→viaje | `src/lib/likida/repo.ts:214` | `viaje:viaje_id(folio)` | desambiguado |
| codigo_pendiente→viaje | — | ningún embed en ninguna dirección | limpio |
| comprobante_huerfano→operador | `src/lib/likida/repo.ts:384` | `operador:operador_id(nombre)` | desambiguado |
| Dirección inversa (padre→hijo) en los 5 pares | — | ningún embed `gasto(`, `liquidacion(`, `codigo_pendiente(`, `viaje(` desde operador, `comprobante_huerfano(` | limpio |
| (fuera de par, alias defensivo) | `repo.ts:1057`, `admin/compliance/page.tsx:157` (solicitud_arco→operador), `cobranza.ts:291` (cobranza_contacto→viaje) | `operador:operador_id` / `viaje:viaje_id` | sin doble FK, alias de más no daña |

---

## Hallazgos

### M-1 (MEDIO) — `factura_proveedor.total` acepta cero y negativo, y la ingesta real los produce

1. **Leído:** `supabase/migrations/0091_factura_proveedor.sql:32` (`total numeric(12,2) not null` — sin CHECK de signo); `src/lib/likida/proveedores.ts:77,93` (solo exige `typeof xml.total === 'number'`); `src/app/dashboard/agentes/proveedores/page.tsx:63-69` (ningún filtro por tipo de comprobante); `src/lib/likida/intake/cfdi_xml.ts:282,288` (el parser SÍ expone `tipoComprobante: I|E|P|N|T` y nadie lo mira en este ciclo).
2. **Escenario:** el contador sube el XML de un REP — el complemento de pago que TODA factura PPD genera, tipo `P`, `Total="0"` — o una nota de crédito (tipo `E`). `parseCfdiXml` devuelve `total: 0` (número válido), `guardarFacturaProveedor` inserta, la base acepta. Un XML deforme con `Total="-5000"` entra igual: `INSERT INTO factura_proveedor (tenant_id, cfdi_uuid, total, xml_crudo) VALUES (t, 'u', -5000, '<x/>')` no choca con nada.
3. **Consecuencia:** "facturas" de $0 o negativas en la cola de aprobación humana y, si el humano aprueba de prisa, en el layout importable al ERP (`aFilaExportProveedor`, `proveedores.ts:169`) — el entregable que sustituye la captura manual del cliente. Es la lección de la 0070 ("las columnas del camino del dinero que aceptaban negativos") no heredada por la tabla de dinero más nueva del esquema.
4. **Refutación intentada:** el total NO entra al motor de cuadre (ciclo aparte, no contamina liquidaciones) y hay un humano en el bucle — por eso es MEDIO y no crítico. Pero el bloque 66 de verificaciones prueba dedup, dominio de estado y RLS, y no puede probar el signo porque la restricción no existe.

### M-2 (MEDIO) — `cobranza_contacto` sin FK compuesta `(viaje_id, tenant_id)`: regresión del patrón 0028/0073

1. **Leído:** `supabase/migrations/0089_agente_cobranza.sql:45-58` (FK simple `viaje_id → viaje(id)` con cascade + FK simple `tenant_id → tenant(id)`); contra `0028_fks_con_tenant.sql:93-96` (sus hermanas `gasto`, `liquidacion`, `codigo_pendiente` llevan la compuesta) y `0073_huerfano_integridad.sql:29-34` (comprobante_huerfano también). La trampa documentada en 0073 (SET NULL + tenant NOT NULL) **no aplica aquí**: `cobranza_contacto.viaje_id` es NOT NULL ON DELETE CASCADE, y `viaje_id_tenant_key` (0028:72) ya existe como destino. La compuesta era gratis y no está; la 0089 no documenta la omisión como decisión.
2. **Escenario:** `INSERT INTO cobranza_contacto (tenant_id, viaje_id, tier) VALUES ('<A>', '<uuid de viaje del tenant B>', 3)` — las dos FK simples pasan, la fila queda cruzada.
3. **Consecuencia:** la bitácora de A (`bitacoraCobranza` filtra `eq('tenant_id', A)`) enseña el folio y el chofer de B — fuga entre flotas en la pantalla del agente; y el claim `unique(viaje_id, tier)` queda consumido para el tenant equivocado: la corrida legítima de B pierde el insert y ese tier jamás se contacta. Borrar el tenant A con la fila cruzada viva revienta además el DELETE (la fila no cae por el cascade de sus viajes).
4. **Refutación intentada:** RLS deny-all (verificado, bloque 64) — solo el service role escribe, y `ejecutarCobranza` deriva viaje y tenant de la misma consulta filtrada. Hoy el código no puede cruzarlos; la base tampoco lo impide, que es exactamente la deuda que la 0028 pagó para sus hermanas. "La aplicación se encarga."

### B-1 (BAJO) — `tiers`/`dias_semana` son `jsonb` sin CHECK de forma, y el modo de falla incluye revivir a un agente pausado

1. **Leído:** `0089:29,33` (jsonb sin restricción alguna: acepta `'"foo"'`, `'5'`, `'{}'`, `'[-3]'`); `src/lib/likida/agentes/cobranza_pura.ts:44` (`(base.tiers ?? []).map(...)` — un jsonb NO-array lanza `TypeError`, no devuelve `{error}`); `src/lib/likida/agentes/cobranza.ts:41-55` (el fallback a defaults solo atrapa el caso array-inválido).
2. **Escenario:** `UPDATE agente_cobranza_config SET tiers = '5'` (una escritura por SQL/MCP que no pase por `guardarConfigCobranza` — este repo ya vivió migraciones aplicadas por MCP sin archivo). O bien `SET tiers = '[99]', activo = false`.
3. **Consecuencia:** con el no-array, `leerConfigCobranza` revienta → página del agente caída y tenant saltado en el cron. Con el array-inválido, `validarConfigCobranza` devuelve error y el código cae a `CONFIG_COBRANZA_DEFAULT` — **que trae `activo: true`**: una flota que PAUSÓ a su agente y tiene la fila corrupta amanece con el agente cobrándole a sus choferes otra vez. El tipo TS (`tiers: number[]`) es más estricto que la columna: caso de libro.
4. **Refutación intentada:** el único escritor hoy valida y normaliza; RLS deny-all cierra a los autenticados. Por eso BAJO. Pero la base acepta un estado que el producto responde con dos conductas distintas y una de ellas contradice la voluntad explícita del cliente (pausado es pausado, dice el propio código).

### B-2 (BAJO) — Los hitos del chofer pueden quedar en orden imposible y el sello lo hace permanente

1. **Leído:** `0090_hitos_viaje.sql:20-23` (tres `timestamptz` sin CHECK de orden ni de prerequisito); `src/lib/likida/hitos_viaje.ts:92-111` (cada columna se sella independiente, `WHERE <col> IS NULL`); `src/lib/likida/processor.ts:1570-1576` (el processor sella cualquier hito en cualquier orden, sin mirar los otros dos).
2. **Escenario:** el chofer manda "voy de regreso" a las 10:00 y "ya llegué" a las 11:00 → `regreso_en=10:00 < llegada_en=11:00`, o `descarga_en` con `llegada_en NULL`. El sello no se mueve nunca (ese es su contrato), así que el estado imposible queda grabado de por vida.
3. **Consecuencia hoy:** acotada — el único consumidor es `getEventosConductores` (`analytics.ts:886-911`), que aplana a bitácora ordenada por hora y no resta nada. **El detonador está armado:** la propia 0090 vende "descarga_en − llegada_en = espera en patio medible ($30k–$96k/día)"; el día que alguien escriba esa resta, saldrán minutos negativos sobre datos que ya no se pueden corregir.
4. **Refutación intentada:** la semántica declarada es "hora del mensaje, no del evento físico" — el orden de los MENSAJES puede legítimamente diferir del físico, así que un CHECK duro `descarga_en >= llegada_en` rechazaría avisos reales y sería peor. El hallazgo no es "falta el CHECK": es que la invariante que la métrica prometida necesita no la impone nadie — ni base, ni processor, ni el consumidor futuro tiene dónde enterarse.

### B-3 (BAJO) — `factura_proveedor`: estado y decisión pueden contradecirse

1. **Leído:** `0091:35-38` (`estado` con dominio, `decidido_por`/`decidido_en` sueltos, sin CHECK de coherencia); `src/lib/likida/proveedores.ts:149-155` (la app siempre los escribe juntos).
2. **Escenario:** `UPDATE factura_proveedor SET estado='aprobada'` sin tocar `decidido_por/decidido_en` — o al revés, `decidido_en` en una `pendiente`. La base acepta.
3. **Consecuencia:** una "aprobada" sin autor viola el registro que la LFPDPPP 26-II justifica (la persona decide, y debe constar QUIÉN); el export enseñaría `aprobada_por` vacío.
4. **Refutación:** un solo escritor, atómico, con candado anti-carrera (`eq('estado','pendiente')`) que sí verifiqué. "La aplicación se encarga" — de nuevo.

### B-4 (BAJO) — El bloque 64 dice "deny-all" pero solo lo prueba en una de las dos tablas de la 0089

1. **Leído:** `supabase/verificaciones.sql:3098-3138` — título: "claim único, ventana válida, deny-all, cascade". El `set local role authenticated` (l. 3128-3130) solo consulta `cobranza_contacto`; **`agente_cobranza_config` nunca se prueba como authenticated**.
2. **Escenario:** si una migración futura le crea una policy floja a `agente_cobranza_config` (o un `grant` raro), el bloque 64 seguiría pasando y afirmando deny-all.
3. **Consecuencia:** la config del agente (instrucciones y firma que viajan en mensajes de WhatsApp a los choferes) quedaría legible/escribible sin que la batería lo detecte. El bloque no verifica todo lo que dice; los bloques 65 y 66 sí (el 65 es honesto sobre delegar la atomicidad a TS).

### B-5 (BAJO) — `iva: xml.ivaTraslado || null` borra la diferencia entre "el XML dice 0" y "el XML no lo dice"

1. **Leído:** `src/lib/likida/proveedores.ts:92` (`||` en vez de `??` o un chequeo de tipo — un `0` numérico real se guarda como NULL); la columna `iva numeric(12,2)` (0091:31) es nullable justo para distinguir esos dos casos.
2. **Escenario:** factura de proveedor a tasa 0% o exenta → `ivaTraslado = 0` → la fila guarda `iva = NULL`.
3. **Consecuencia:** la bandeja y el export (`aFilaExportProveedor` pinta `''` para null) afirman "no trae IVA desglosado" cuando el XML sí lo traía, en cero. Contra la regla de la casa: null ≠ 0, y este repo la predica hasta en los comentarios de la misma tabla (`receptor_es_flota`).
4. **Refutación:** en refacciones/taller/diésel el IVA real casi siempre es 16%, así que el caso es raro — por eso BAJO y no MEDIO.

---

## Lo que revisé y está bien

- **Embeds ambiguos: cero** (tabla completa arriba, método con control positivo). El barrido cubrió `src/`, `scripts/`, `pruebas-manuales/`, ambas direcciones de los 5 pares, `!inner`/`!left`, `foreignTable`/`referencedTable`, filtros con punto y URLs con `select=`.
- **`unique(viaje_id, tier)`** (0089:57) — el candado anti-doble-envío existe en la base y el bloque 64 lo probó con corrida real (`doble-rebota=t`). El código reclama insertando ANTES de mandar (`cobranza.ts:208-213`) y trata el 23505 como "perdí, no mando": el patrón 0058/0087 bien heredado.
- **`unique(tenant_id, cfdi_uuid)`** (0091:41) — dedup en la base, probado en bloque 66; `guardarFacturaProveedor` traduce el 23505 a `duplicada` (proveedores.ts:102).
- **`wa_conversacion` tenant+teléfono: el índice único REAL existe** — `wa_conversacion_tenant_tel_uidx` en **`supabase/migrations/0005_concurrencia.sql:13-14`**, sobre `(tenant_id, telefono)` exactos. `despacho_wa.ts:82` hace upsert con `onConflict: 'tenant_id,telefono'` — coincide columna por columna con ese índice, y `atenderDespachoOficina` corta al inicio si `tenantId` es falsy (el NULL de `tenant_id` que dejaría pasar duplicados no llega a este camino).
- **Ventana de cobranza:** CHECKs de hora en base (0-23 / 1-24 / `hora_fin > hora_inicio`, 0089:30-39) idénticos a la validación de la app (cobranza_pura.ts:52-55), y probados (bloque 64, `ventana-rebota=t`). Los límites de longitud `instrucciones<=300`/`firma<=80` también coinciden base↔app exactos.
- **Dominios de estado:** `estado in (pendiente|aprobada|rechazada)` (0091:35-36, probado en bloque 66) empata 1:1 con el tipo TS; `viaje.estatus`, `liquidacion.estatus`, `gasto.concepto` traen su CHECK desde la 0025 y los union types de `src/types/likida.ts` coinciden con esos dominios.
- **Montos del camino del cuadre:** `gasto.monto >= 0` y `viaje.anticipo >= 0` (0070) siguen ahí y la 0075 los dejó VALIDADOS; los hitos y sellos se escriben por UPDATE, no tocan esos candados.
- **RLS deny-all probado como authenticated** para `cobranza_contacto` (bloque 64) y `factura_proveedor` (bloque 66) — con corrida real anotada, no de palabra.
- **Cascade:** borrar el viaje se lleva su bitácora (bloque 64, `tras-borrar=0`); `agente_cobranza_config` y `factura_proveedor` cascadean del tenant (0089:25, 0091:20).
- **Reversibilidad de 0089-0091:** puras creaciones (`create table` × 3, `add column` × 3), sin datos migrados ni `NOT VALID` nuevos — reversibles con drops simples. No repiten la deuda que la 0075 tuvo que pagar.
- **Dedup de UUID fiscal:** el parser normaliza a lowercase en el único punto de entrada (`cfdi_xml.ts:291`), mismo contrato que el ciclo de gasto (0019/0065). Es convención de app y no de base (la columna compara texto crudo), pero es UNA sola puerta y está fijada por pruebas — lo dejo anotado, no como hallazgo.
- **Sello write-once:** `tenant_data ... for all` (0001:114, endurecida en 0045) permite en teoría que un flota_admin edite `llegada_en`/`recordatorio_comprobacion_en` de su propio tenant por REST — el write-once es de la app. Es el patrón aceptado desde la 0058 para TODOS los sellos, daño confinado al propio tenant; preexistente, no lo cuento contra esta ronda.
- **`viaje.operador_id` NOT NULL + FK compuesta a operador (0001:49, 0028:96):** la cola de cobranza no puede toparse con un viaje sin operador real; el brazo `sinTelefono` es defensa muerta útil (teléfono `''`), no un hueco del esquema.

## Lo que NO alcancé a revisar

- **El catálogo vivo.** Sin acceso a la base: la afirmación "5 pares con doble FK" la tomé del MAPA y la reconstruí desde 0028+0073; si alguien aplicó por MCP una FK sin archivo (ya pasó con la 0058), habría un sexto par que mi barrido de código no sabría nombrar — aunque el barrido cubre TODOS los embeds del repo sobre cualquier tabla de esos nombres, así que un par nuevo entre otras tablas (p. ej. `cfdi_consolidado`) quedaría fuera.
- **Los seis `page.tsx` de agentes a fondo** — leí proveedores y cobranza (los que escriben); liquidacion/facturas/peajes/conductores solo por grep de embeds y consumidores de columnas.
- **`importar_viajes.ts` y el ciclo de peajes** (`intake/consolidado.ts`) contra el esquema — fuera del foco 0089-0091; los candados de 0070/0076-0077 los cubren en teoría, no lo verifiqué línea a línea.
- **Los bloques 1-63 de verificaciones.sql** — solo 64-66, como pedía el encargo.
