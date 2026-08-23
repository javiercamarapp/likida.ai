# Modelo de datos y esquema — auditoría 18 · continuación 21-ago

**Nota: 5/10** (antes 6). Razón del movimiento: **mirada más profunda**. El esquema no
empeoró en estilo —las cuatro migraciones nuevas traen CHECK, comentarios y columnas
GENERADAS en vez de números escritos por un agente, que es lo correcto—. Lo que cambió es
lo que se midió, en dos frentes:

1. **La FK compuesta de la 0028, contada tabla por tabla** (la ronda 18 lo dejó
   explícitamente "no verificado una por una"). El resultado es peor que su estimación,
   no en número sino en profundidad: los huecos accionables no son veinte, son **once** —
   y **siete de esos once ni siquiera se pueden cerrar hoy**, porque la tabla destino
   (`cliente`, `unidad`, `factura_emitida`, `cfdi_xml`, `desglose_peaje`) no tiene el
   `unique (id, tenant_id)` que Postgres exige para poder apuntarle. La 0028 creó cuatro
   de esos índices y nadie creó uno más en 115 migraciones. El patrón no está "olvidado":
   está estructuralmente cerrado.
2. **La 0140 introdujo un cero que parece medición.** `similitud_icp_pct` es una columna
   GENERADA cuyo término de mayor peso (+40, "el giro correcto") compara `scian` con
   `in ('484','485','488')` — igualdad exacta de tres caracteres — mientras el resto del
   repo guarda y lee el SCIAN del DENUE como código de 6 (`'484222'`,
   `prospectos-mapa.test.ts:41`). El término nunca puede valer 40. La cabecera de esa
   misma migración invoca "nunca inventar una cifra" para justificar la columna, y
   `CLAUDE.md` prohíbe expresamente rellenar "con ceros que parezcan medición".

**El riesgo mayor del rubro, hoy:** sigue siendo que el aislamiento entre flotas viva en un
`if` de TypeScript — pero con un agravante nuevo y verificado: `posicion` **ya tiene
escritor vivo** (`processor.ts:114`, el pin de WhatsApp del chofer), así que la lista de
"tablas sin escritor" del MAPA está desactualizada y está suprimiendo un camino que hoy
escribe filas con una FK simple.

---

## Hallazgos

### [CRÍTICO] La FK compuesta de la 0028 cubre 5 de 40 relaciones entre entidades; de las 11 que faltan y se podrían cerrar, 7 no tienen dónde apuntar — y la cadena de cobranza es una de ellas
`supabase/migrations/0028_fks_con_tenant.sql:72-82` (los cuatro `unique (id, tenant_id)`)
· `0028:93-96` (las cuatro compuestas) · `0073_huerfano_integridad.sql:30-34` (la quinta)
· `0049_cobranza_factura_emitida_pago.sql:96` (la que rompe el dinero) ·
`0049:143-158` (las policies que solo miran un lado) ·
`src/lib/likida/facturacion_escritura.ts:256-262,267-277,384-390` (dónde lo suple la app)

(REINCIDENTE de la ronda 18 — se reverifica y se acota; sigue abierto.)

**Escenario, con valores.** `pago_recibido` (0049:92-102) tiene `tenant_id uuid not null` y
`factura_id uuid not null references public.factura_emitida(id) on delete cascade` — FK de
una sola columna. Su policy (0049:143-145) es
`using/with check ((tenant_id = any(get_user_tenant_ids()) and ve_finanzas()) or is_superadmin())`:
solo mira su propio `tenant_id`. Un `contador` de la flota A, autenticado, contra PostgREST:

```
POST /rest/v1/pago_recibido
{"tenant_id":"<A>","factura_id":"<factura de B, $250,000>","fecha":"2026-08-21","monto":250000}
```

El `with check` pasa (el tenant es el suyo). La FK pasa (la factura existe). `pago_monto_positivo`
pasa. **Entra una fila con `pago_recibido.tenant_id = A` y `factura_emitida.tenant_id = B`.**

La vista `factura_saldo` (0049:112-129) une `left join public.pago_recibido p on p.factura_id = f.id`
—sin mirar tenant— y `getCobranza` la lee con service role (`comercial.ts:200-201`), que salta
RLS. La pantalla de cobranza de **B** pinta `pagado $250,000.00 · saldo $0.00 · vencida false`,
y B no puede ver ni una fila de abono que lo explique: `pago_recibido` está filtrada por
`tenant_id` y el abono es de A.

La misma clase sin vista de por medio: `insert into factura_viaje (factura_id, viaje_id)` con
una factura de A y un `viaje_id` de B pasa, porque la policy de `factura_viaje` (0049:150-158)
resuelve el tenant por `exists(... where f.id = factura_id ...)` y **nunca valida el lado
`viaje_id`**.

**Consecuencia.** El contralor de B deja de perseguir un cuarto de millón porque su tablero
dice que ya se lo pagaron, y no tiene pantalla desde la cual descubrirlo.

**Causa raíz probable.** La 0028 se escribió como migración puntual sobre las cuatro tablas
de julio y no como regla del esquema: creó los cuatro `unique (id, tenant_id)` que hacían
falta ese día y ninguna migración posterior creó uno más, así que el patrón dejó de ser
aplicable antes de dejar de ser necesario.

---

### [ALTO] `similitud_icp_pct` compara el SCIAN por igualdad exacta de 3 caracteres mientras el resto del repo lo guarda con 6: el término de mayor peso de la columna nunca se puede activar
`supabase/migrations/0140_prospecto_investigacion_profunda.sql:59` ·
`supabase/migrations/0139_prospecto_calidad.sql:54` (`scian text`, sin CHECK de forma) ·
`src/lib/admin/prospectos-mapa.ts:139` · `src/lib/admin/prospectos-mapa.test.ts:41`

**Escenario, con valores.** La 0140:59 genera
`(case when scian in ('484', '485', '488') then 40 else 0 end)`. En el mismo repo,
`giroDe` lee la misma columna con **prefijo**:
`const esOtroSectorDeTransporte = !!scian && /^(48[1235-9]|49)/.test(scian);`
(`prospectos-mapa.ts:139`), y la prueba que fija ese comportamiento usa códigos de seis
dígitos: `giroDe('AZ TRANSPORTES DE CARGA', null, null, '484222')`
(`prospectos-mapa.test.ts:41`), `'485111'`, `'488511'`, `'492110'`, `'493110'`. La columna
no tiene ningún CHECK de forma ni de longitud (0139:54) y **no tiene escritor en `src/`**
(la escriben los agentes de investigación a mano), así que las dos convenciones pueden
convivir en la misma columna.

Prospecto «TRANSPORTES MONTERREY», `scian = '484121'` (autotransporte foráneo de carga
general), `vacante = 'Auxiliar de Liquidaciones'`, `num_unidades = 45`,
`sitio_verificado = true`. La base calcula
`similitud_icp_pct = 0 + 25 + 20 + 15 = 60`. La cabecera de la 0140 promete 100 para
exactamente ese prospecto.

**Consecuencia.** El ICP es un rótulo declarado ("giro correcto SCIAN 484/485/488 +40",
`CRITERIO_SCORES.similitud`, `prospectos-mapa.ts:289`, impreso al pie del mapa en
`cerebro.tsx:1045`) que la columna no cumple. El orden `by similitud_icp_pct desc`
(`cerebro.tsx:369`) coloca al transportista verificado 40 puntos por debajo de donde
declara, y el filtro «≥85%» lo esconde. En una empresa cuyo único pipeline es este censo,
el criterio de criba está apagado en su término más pesado y la pantalla enseña un número
que se lee como medición.

**Causa raíz probable.** La 0140 se escribió desde el comentario de la 0139
("484=autotransporte de carga") en vez de desde el dato, y `scian` nunca recibió una
restricción de forma que obligara a elegir una convención.

---

### [MEDIO] `necesidad_pct` no puede pasar de 75 y el tablero ofrece un filtro «≥85%»: la lista sale vacía siempre y el vacío se lee como "no hay urgentes"
`supabase/migrations/0143_necesidad_pct_excluye_liquidacion_financiera.sql:24-37` ·
`src/app/admin/mapa-prospectos/cerebro.tsx:71,343,707-712`

**Escenario, con valores.** La fórmula vigente suma como máximo `50` (el tramo de vacante)
+ `25` (flota ≥ 20) = **75**; los valores alcanzables son exactamente `{0, 25, 50, 75}`.
El `least(100, …)` nunca ata. El tipo del filtro es
`minNecesidad: 0 | 40 | 65 | 85` (`cerebro.tsx:71`) y los chips se pintan desde
`([0, 40, 65, 85] as const)` con la etiqueta `≥${u}%` (`cerebro.tsx:707-711`). El filtro
aplica `p.necesidadPct >= filtros.minNecesidad` (`cerebro.tsx:343`).

Javier hace clic en «≥85%» → **0 de 31,778 prospectos**, hoy y siempre. La pantalla no
distingue ese cero de "ninguna empresa del censo tiene urgencia alta".

**Consecuencia.** Un cero que parece medición, en el filtro que decide a quién llamar. Es la
misma clase de daño que la regla de la casa prohíbe (`CLAUDE.md`: "no se rellena… con ceros
que parezcan medición"), sin un `EstadoVacio` que diga por qué.

**Causa raíz probable.** El techo declarado de la columna (los comentarios de 0140/0142/0143
dicen "0-100") se copió al UI como si fuera el rango alcanzable; nadie sumó los sumandos.

---

### [MEDIO] El rótulo que la pantalla enseña como criterio de `necesidad_pct` es la fórmula de la 0140, derogada dos veces el mismo día
`src/lib/admin/prospectos-mapa.ts:290` · `src/app/admin/mapa-prospectos/cerebro.tsx:705,1046` ·
`supabase/migrations/0142_…:27-39` · `supabase/migrations/0143_…:24-37`

**Escenario, con valores.** `CRITERIO_SCORES.necesidad` dice, textual:
*"vacante de liquidación/cuadre/auxiliar administrativo +50 (cualquier otra vacante +25),
flota investigada ≥20 unidades +25"*. Se pinta al pie del mapa (`cerebro.tsx:1046`) y como
`title=` del filtro (`cerebro.tsx:705`). Ese archivo se declara a sí mismo la fuente única
del criterio (`prospectos-mapa.ts:15-16`: *"el pie del mapa enseña el criterio con las
mismas palabras de este archivo"*).

Prospecto «Copayment de México», `vacante = 'Analista de Operaciones Liquidación y
Compensación'`, sin flota conocida. La base (0143:27) calcula
`vacante ~* 'liquidaci' and vacante !~* 'de pagos|compensaci[oó]n'` → falso →
cae al tramo genérico → **`necesidad_pct = 25`**. El pie del mapa afirma +50.
Al revés con «Auxiliar Administrativo» de una dulcería: el rótulo promete 50, la columna
da 25 (0142:31-33).

**Consecuencia.** El criterio a la vista y el número a la vista dicen cosas distintas del
mismo prospecto, que es exactamente lo que el archivo existe para impedir. El comentario
`comment on column` sí está al día (0143:39-40); la única copia que un humano lee, no.

**Causa raíz probable.** La fórmula vive en dos lugares —la expresión GENERADA y una cadena
de texto en TypeScript— y solo uno de los dos se actualizó en 0142 y 0143.

---

### [MEDIO] Las cuatro migraciones nuevas son las primeras desde la 0135 que no traen su bloque en `verificaciones.sql`
`supabase/verificaciones.sql:5263` (bloque 107 → 0135) · `:5289` (108 → 0136) ·
`:5334` (109 → 0138) · `:5381` (110 → 0139) · fin del archivo en `:5414`

**Escenario, con valores.** El repo tiene la convención de un bloque por migración de
esquema, cada uno con su fixture y su `raise exception` con el veredicto esperado
(`PERSONAS_0138 … (esperado t / t / t / t)`). `grep -n "necesidad_pct|similitud_icp|0140|0141|0142|0143|num_unidades|mensaje_linkedin" supabase/verificaciones.sql`
devuelve **cero líneas**. Un bloque de tres líneas —insertar un prospecto con
`vacante='Coordinador de Liquidaciones de flota'`, `num_unidades=45`, `scian='484121'`,
`sitio_verificado=true` y afirmar `similitud_icp_pct = 100 and necesidad_pct = 75`— habría
reventado en rojo y habría cazado los dos hallazgos anteriores el mismo día que se
escribieron.

**Consecuencia.** El arnés propio del repo dejó de cubrir el esquema exactamente donde el
esquema empezó a cambiar más rápido (dos redefiniciones de una columna generada en 24 horas).

**Causa raíz probable.** El bloque se escribe a mano y nada lo exige; la compuerta
(`npm test` + `tsc` + `lint`) no toca `verificaciones.sql` porque necesita una base.

---

### [BAJO] `mensaje_linkedin` (0141) no tiene escritor ni lector, y queda fuera de la coherencia que la 0129 impuso a sus dos hermanos
`supabase/migrations/0141_prospecto_mensaje_linkedin.sql:12-13,18-21` ·
`supabase/migrations/0129_prospecto_mensajes.sql:22-25` ·
`src/app/api/admin/mapa-prospectos/mensaje/route.ts:97-105`

**Escenario, con valores.** La 0141 se justifica con *"El Cerebro de ventas no puede abrir un
botón de LinkedIn con un mensaje que no existe en la fila"*.
`grep -rn "mensaje_linkedin|mensajeLinkedin" src/` devuelve **cero**: el redactor
(`mensaje/route.ts:97-105`) escribe `mensaje_wa`, `mensaje_correo_asunto`, `mensaje_correo`,
`mensajes_generados_en` y `mensajes_modelo`, y ni el mapa ni la ficha la seleccionan.
Además, la 0141 deja fuera a propósito la columna de `prospecto_mensajes_coherentes`
(0129:23-24: `check ((mensajes_generados_en is null) = (mensaje_wa is null and mensaje_correo is null))`),
así que cuando aparezca el escritor esto entrará sin queja:

```sql
update prospecto set mensaje_linkedin = 'Hola Ing. Ramírez…' where id = '<X>';
-- mensajes_generados_en = null, mensajes_modelo = null
```

Un mensaje generado por un LLM, guardado, sin fecha y sin firma de modelo — exactamente el
estado que 0129:20-22 escribió su CHECK para impedir (*"un mensaje sin fecha ni firma no dice
quién lo pensó ni cuándo caducó"*).

**Consecuencia.** Hoy, una columna que la migración dice necesitar y nadie usa. Mañana, un
DM que se manda a un decisor sin saber de qué corrida ni de qué modelo salió — que es el
dato que el aviso de privacidad obliga a poder reconstruir.

**Causa raíz probable.** La migración se adelantó al escritor, y la excepción al CHECK se
argumentó sobre "LinkedIn es opcional" (cierto) en vez de sobre "si hay LinkedIn, hay
generación" (que es el invariante que faltaba).

---

### [BAJO] El redactor que le escribe al prospecto clasifica el giro sin el SCIAN, el único veredicto duro
`src/app/api/admin/mapa-prospectos/mensaje/route.ts:73,81` ·
`src/lib/admin/prospectos-mapa.ts:124,131-142`

**Escenario, con valores.** El `select` de :73 pide
`'id, empresa, ciudad, telefono, correo, contacto_nombre, vacante, estado, fuente, notas'`
— **sin `scian`** — y :81 llama `giroDe(p.empresa, p.vacante, p.notas)` con tres argumentos.
Para «AAZ TRANSPORTE», `scian = '485111'` (autobuses de pasajeros), `giroDe` sin SCIAN
devuelve `'transportista'` por el nombre, y la ficha que va al LLM dice
`Giro: Transportista`. El SYSTEM prompt ordena citar el giro como gancho. Los otros dos
llamadores (`prospectos-mapa.ts:407,504`) sí pasan `p.scian`.

**Consecuencia.** El único texto de todo el flujo que sale del producto hacia una persona
externa es el que se redacta con la clasificación menos confiable — el error que la 0139 y
el candado de `giroDe` existen para cerrar, entrando por la puerta que no se cerró.

**Causa raíz probable.** `giroDe` recibió `scian` como cuarto parámetro **opcional**
(`scian?: string | null`), así que los llamadores viejos siguieron compilando.

---

### [BAJO] `num_unidades` solo tiene CHECK de no-negatividad, pero el CHECK que de verdad ata es el desbordamiento de `viajes_mes_estimado`
`supabase/migrations/0140_prospecto_investigacion_profunda.sql:47-48,75-77`

**Escenario, con valores.** La columna es `int` con
`check (num_unidades is null or num_unidades >= 0)` (0140:48) y sin techo. La generada es
`num_unidades * 18` sobre `int` (0140:76). `update prospecto set num_unidades = 150000000`
pasa el CHECK y **revienta con `integer out of range`** al calcular la generada
(el límite real es 119,304,647). El agente investigador ve un error de Postgres que no
nombra la columna que él tocó.

Y por debajo del techo, `num_unidades = 100000` (un dedazo) da
`viajes_mes_estimado = 1,800,000`, que la ficha imprime como
`≈ 1,800,000` con el rótulo "Estimado, no medido" (`detalle.tsx:200,208`) — un supuesto
declarado sobre un hecho absurdo que ningún CHECK acota.

**Consecuencia.** La restricción escrita no es la que gobierna. Menor hoy (la tabla la
escriben agentes bajo revisión), pero el CHECK da la impresión de que el rango está acotado.

**Causa raíz probable.** El rango plausible de una flota mexicana (0–5,000 unidades) se
conocía al escribir la migración y se acotó solo por abajo.

---

### [BAJO] `prospecto` es deny-all y su hija `prospecto_persona` no: los datos de los decisores se leen por PostgREST con la sesión del superadmin
`supabase/migrations/0105_zona_vendedores.sql:120-122` ·
`supabase/migrations/0138_prospecto_persona.sql:69-75`

**Escenario, con valores.** La 0105:120-122 dice, textual: *"Deny-all: enable SIN políticas…
todo acceso es service-role desde el servidor"*, y `prospecto` no tiene ni una policy en
las 140 migraciones. La 0138:69-75 dice *"Mismo criterio que `prospecto` (0105)"* y luego
crea `prospecto_persona_lee_superadmin … for select using (exists (select 1 from app_user u
where u.id = auth.uid() and u.rol = 'superadmin'))`. No es el mismo criterio: es una policy
donde el criterio citado era la ausencia de policy. Con la sesión del navegador de Javier:

```
GET /rest/v1/prospecto_persona?select=nombre,puesto,correo,telefono,linkedin,evidencia
```

devuelve nombres, correos y teléfonos de decisores de todo el censo, sin pasar por la app.

**Consecuencia.** Datos personales de terceros (LFPDPPP) accesibles fuera del camino que
registra y redacta, con la superficie que la 0048:42-46 ya identificó como real. Superficie
acotada a un rol, por eso BAJO.

**Causa raíz probable.** El comentario describe la intención y la policy describe otra cosa;
no hay prueba ni bloque que compare las dos tablas hermanas.

---

## La FK compuesta de la 0028, tabla por tabla (la tabla que la ronda 18 no hizo)

Método: se extrajeron las **40 claves foráneas entre entidades** del esquema (excluyendo las
que apuntan a `tenant`, a `plan` y a `agente_definicion`, que son globales) y se clasificó
cada una por (a) si la tabla hija tiene `tenant_id`, (b) si la columna hija es `NOT NULL`,
(c) la acción de borrado, y (d) si la tabla destino tiene el `unique (id, tenant_id)` que
Postgres exige. **Las cinco compuestas existentes son las de la 0028 (4) y la de la 0073 (1);
no hay ninguna más en las 140 migraciones.** El repo tiene solo cuatro
`unique (id, tenant_id)`: `viaje`, `operador`, `gasto`, `liquidacion` (0028:72-82).

### A · Las cinco que SÍ la tienen

| Relación | Dónde |
|---|---|
| `gasto (viaje_id, tenant_id) → viaje` | 0028:93 |
| `liquidacion (viaje_id, tenant_id) → viaje` | 0028:94 |
| `codigo_pendiente (viaje_id, tenant_id) → viaje` | 0028:95 |
| `viaje (operador_id, tenant_id) → operador` | 0028:96 |
| `comprobante_huerfano (operador_id, tenant_id) → operador` | 0073:30-34 |

### B · Las ONCE que faltan y se podrían cerrar (columna hija utilizable, acción ≠ `set null`)

Esta es la lista accionable. La columna «destino apuntable» dice si la tabla padre tiene hoy
el `unique (id, tenant_id)`; **`no` significa que la compuesta ni siquiera se puede escribir
sin crear antes ese índice.**

| # | Relación | Mig:línea | Hija | Acción | Destino apuntable | ¿Escritor vivo? |
|---|---|---|---|---|---|---|
| 1 | `pago_recibido.factura_id → factura_emitida` | 0049:96 | NOT NULL | cascade | **no** | sí — `facturacion_escritura.ts:384-390` |
| 2 | `factura_emitida.cliente_id → cliente` | 0049:31 | NOT NULL | restrict | **no** | sí — `facturacion_escritura.ts:256-262` |
| 3 | `pod.viaje_id → viaje` | 0047:130 | NOT NULL | cascade | sí | sí — panel `/dashboard` |
| 4 | `incidencia.viaje_id → viaje` | 0047:100 | nullable | cascade | sí | sí — panel |
| 5 | `cobranza_contacto.viaje_id → viaje` | 0089:48 | NOT NULL | cascade | sí | sí — `agentes/cobranza.ts:224,246,267,311` |
| 6 | `posicion.unidad_id → unidad` | 0050:47 | NOT NULL | cascade | **no** | **sí — `processor.ts:114`** (ver corrección al MAPA) |
| 7 | `desglose_peaje_linea.desglose_id → desglose_peaje` | 0106:58 | NOT NULL | cascade | **no** | sí — `intake/desglose_peaje.ts` |
| 8 | `cfdi_consolidado_linea.cfdi_xml_id → cfdi_xml` | 0076:40 | NOT NULL | cascade | **no** | sí — flujo de consolidado |
| 9 | `tarifa.cliente_id → cliente` | 0048:110 | nullable | cascade | **no** | sí — panel |
| 10 | `mantenimiento.unidad_id → unidad` | 0047:76 | NOT NULL | cascade | **no** | no (solo lectura, `operacion.ts:180`) |
| 11 | `foto_pendiente.viaje_id → viaje` | 0038:33 | NOT NULL | cascade | sí | no (revertido, `processor.ts:1123`) |

**Las cuatro del camino del dinero son 1, 2, 5 y 8.** La #1 es la del CRÍTICO. La #5 es
nueva respecto del reporte de ayer: `cobranza_contacto` la escribe un agente autónomo con
service role, no un humano.

**Nota de fechas:** la #11 (`foto_pendiente`, 0038) nació **diez migraciones después** de la
0028, sobre `viaje`, que ya tenía su `unique (id, tenant_id)`. Es el mismo defecto que la
0073 documentó y arregló para `comprobante_huerfano` (0040) y que nunca se barrió.

### C · Las diecinueve donde la compuesta está BLOQUEADA por la regla que la propia 0028 escribió

Columna hija nullable + `on delete set null`: una compuesta pondría NULL también en
`tenant_id`, que es NOT NULL, y reventaría el DELETE del padre (0028:44-47, 0073:25-29).
Cerrarlas exige `on delete set null (columna)` de Postgres 15+, que es una decisión de
versión, no un olvido:

`operador.terminal_id` (0001:32) · `viaje.terminal_id` (0001:50) · `llm_costo.viaje_id`
(0003:10) · `llm_costo.liquidacion_id` (0003:11) · `cfdi_xml.gasto_id` (0009:8) ·
`comprobante_huerfano.viaje_id` (0040:44) · `viaje.unidad_id` (0047:65) ·
`incidencia.unidad_id` (0047:101) · `pod.operador_id` (0047:131) · `viaje.cliente_id`
(0048:139) · `factura_emitida.viaje_id` (0049:34) · `ticket_soporte.viaje_id` (0051:29) ·
`cotizacion.cliente_id` (0051:77) · `cotizacion.viaje_id` (0051:92) ·
`factura_saas.suscripcion_id` (0052:89) · `solicitud_arco.operador_id` (0053:101) ·
`cfdi_consolidado_linea.gasto_id` (0076:57) · `desglose_peaje_linea.viaje_id` (0106:73) ·
`incidencia.gasto_id` (0107:41).

Tres de estas (`llm_costo.viaje_id`, `llm_costo.liquidacion_id`, `cfdi_xml.gasto_id`) están
nombradas explícitamente en 0028:44-47 como exclusión razonada. Las otras dieciséis no están
nombradas en ningún lado, pero caen en la misma regla.

### D · Las cinco donde es IMPOSIBLE porque la tabla hija no tiene `tenant_id`

| Relación | Mig:línea | Qué la protege hoy |
|---|---|---|
| `factura_viaje.factura_id → factura_emitida` | 0049:84 | policy por `exists` sobre la factura (0049:150-158) |
| `factura_viaje.viaje_id → viaje` | 0049:85 | **nada** — la policy no mira este lado |
| `ticket_mensaje.ticket_id → ticket_soporte` | 0051:61 | policy por `exists` (0086:56-61) |
| `chat_mensaje.conversacion_id → chat_conversacion` | 0088:37 | policy heredada |
| `viaje_lock.viaje_id → viaje` | 0075:21 | tabla interna, RLS sin policy = negada |

`factura_viaje.viaje_id` es el segundo agujero del CRÍTICO y el único de este grupo que no
tiene nada encima.

**Resumen numérico:** 40 relaciones entre entidades · **5 compuestas** · 11 abiertas y
cerrables (7 de ellas requieren crear antes el `unique (id, tenant_id)` en el destino) ·
19 bloqueadas por la regla del `set null` · 5 imposibles sin agregar `tenant_id` a la hija.

---

## Estado de los hallazgos abiertos de la ronda 18

| Hallazgo (ronda 18) | Estado hoy | Evidencia |
|---|---|---|
| **CRÍTICO** — FK compuesta ausente en la cadena de cobranza | **ABIERTO**, ahora con la cuenta exacta (sección anterior). Ninguna migración 0140-0143 lo toca | 0049:96 sin cambios |
| **ALTO** — `gasto` y `liquidacion` fuera de `ve_finanzas()` | **ABIERTO, sin cambio.** El bucle de la 0086:45-50 sigue recreando `tenant_data … for all using (tenant_id = any(get_user_tenant_ids()) or is_superadmin())` sobre ambas; ninguna de las cuatro migraciones nuevas toca policies | 0086:38-51 |
| **MEDIO** — las tres cifras de `liquidacion` aceptan negativos | **ABIERTO.** Sigue solo `liquidacion_montos_no_nan` (0025:129); la 0070 no se extendió | 0025:126-130 |
| **MEDIO** — `gasto.ocr_confianza` sin rango 0–1 | **ABIERTO.** `numeric(4,3)` sin CHECK; la gemela `factura_proveedor_ocr_rango` (0108:52) sigue siendo la única | 0001:63 |
| **MEDIO** — ciclo A→B→A en `prospecto.duplicado_de` | **ABIERTO.** `prospecto_duplicado_no_circular` (0139:68-72) sigue prohibiendo solo la autorreferencia. **Agravado**: los dos índices nuevos de la 0140 (`idx_prospecto_similitud`, `idx_prospecto_necesidad`, 0140:86-87) usan el mismo `where duplicado_de is null`, así que un ciclo ahora esconde la fila de tres filtros en vez de uno | 0139:68-72, 0140:86-87 |
| **BAJO** — `wa_conversacion.tenant_id` nullable | **ABIERTO, sin cambio** | 0001:80 |
| **BAJO** — `worker_llave.capacidades` sin dominio | **ABIERTO, sin cambio** | 0135:26 |

---

## Lo que revisé y está bien

- **La hipótesis de la fórmula conviviendo en dos versiones está REFUTADA, y con detalle.**
  `necesidad_pct` es una columna **`generated always as (…) stored`**, no materializada ni
  escrita por nadie. La 0142 y la 0143 hacen `alter table public.prospecto drop column if
  exists necesidad_pct;` seguido de `add column … generated always as (…) stored`
  (0142:24-39, 0143:21-37), y `ADD COLUMN … STORED` en Postgres **reescribe la tabla
  entera**: las 32,890 filas quedan con la fórmula vigente. **No hay convivencia de
  versiones ni datos viejos con la fórmula vieja.** El `drop` también borra
  `idx_prospecto_necesidad` y las dos migraciones lo vuelven a crear (0142:44, 0143:42), así
  que el índice tampoco se pierde. La única copia desincronizada es la cadena de texto de
  `CRITERIO_SCORES` (hallazgo aparte).
- **Las tres columnas GENERADAS son legales y no pueden fallar al aplicarse.** Las
  expresiones usan solo funciones IMMUTABLE (`least`, `case`, `in`, `~*` → `texticregexeq`),
  que es lo que Postgres exige para `STORED`. Ninguna puede devolver NULL cuando el tipo de
  TypeScript la declara `number`: cada `case` tiene su `else 0`, `scian` NULL cae a 0 y
  `sitio_verificado` es `not null default false` (0139:54). `viajes_mes_estimado` sí puede
  ser NULL y `FilaDetalle` lo declara `number | null` (`prospectos-mapa.ts:472`). **Los tipos
  no mienten sobre nulabilidad en lo nuevo.**
- **Las cuatro migraciones son reversibles.** `0140` y `0141` se deshacen con
  `drop column`; `0142` y `0143` son auto-reversibles por construcción (borran y reponen la
  misma columna). Ninguna borra datos que no se puedan recalcular, porque `num_unidades` e
  `historia` (los únicos hechos) solo se agregan.
- **RLS y grants de lo nuevo: sin superficie añadida.** Las cuatro migraciones solo agregan
  columnas a `prospecto`, que tiene RLS habilitada **sin ninguna policy** (0105:120-122) —
  `grep "policy .* on public.prospecto "` no devuelve nada en las 140 migraciones. Ningún
  usuario autenticado puede leer una sola fila por PostgREST; todo pasa por
  `supabaseAdmin()`. Las columnas nuevas heredan eso.
- **`num_unidades` está bien planteada como HECHO y no como derivado**, con su CHECK de
  no-negatividad (0140:48) y su comentario de "NULL = no se encontró, no se infiere" — que
  es exactamente la regla de la casa, y el código lo respeta (`numUnidades: number | null`).
- **Intenté y refuté que la flota sin RFC apagara la validación de receptor.** `tenant.rfc`
  es nullable (0001:11) y `crearFlota` permite el alta sin él (`administracion.ts:136-149`),
  así que `getConfig` cae a `DEMO_CONFIG.empresa.rfc = 'XAXX010101000'` (`config.ts:92,258`).
  Pero `engine.ts:276` calcula `rfcEmpresaInservible = rfcsOk.size === 0 && !!input.empresaRfc`
  y emite `rfc_receptor_no_verificable` por cada gasto (`engine.ts:479-507`), que está en
  `POR_CONFIRMAR` (`:109`) y en `SIN_ACREDITAMIENTO` (`:978`). **Falla declarado, no en
  silencio.** No es hallazgo.
- **Intenté y refuté que el pin de ubicación del chofer rebotara.** `processor.ts:114`
  inserta `proveedor: 'whatsapp'` y `posicion.proveedor` es `text not null` **sin CHECK de
  dominio** (0050:58), así que entra. El `unique (unidad_id, medida_en, proveedor)`
  (0050:71-72) no colisiona porque `medida_en` es el instante con milisegundos.
- **Los cinco datos fiscales del receptor: tres tienen CHECK en la base y coinciden letra por
  letra con el catálogo de TypeScript.** `tenant_regimen_fiscal_dominio` (0056:46-53) admite
  601/603/612/621/626 y `REGIMENES` (`saas/fiscal.ts:20-26`) declara exactamente esos cinco.
  `tenant_cp_fiscal_forma` (0056:68) es `^[0-9]{5}$` y `validarDatosFiscales` lo espeja. El
  único desajuste es que la base admite `uso_cfdi = 'S01'` (0056:61) y `USOS_CFDI`
  (`fiscal.ts:29-33`) solo declara tres — el TS es **más estricto**, que es la dirección
  segura, y el camino de escritura pasa siempre por el validador.
- **`conector_credencial` (0094:74-79) sostiene la cuenta de portal compartida sin hueco
  nuevo**: `unique (tenant_id, conector_id)` hace que el `.maybeSingle()` de
  `cuentas.ts:112-118` no pueda recibir dos filas, y `conector_credencial_no_en_claro`
  (`valores_cifrados !~ '^\s*\{'`) sigue siendo suficiente porque `ValoresCredencial` es un
  objeto y su serialización siempre empieza con `{`.
- **`prospecto_persona`, salvo la policy, es de las mejores tablas del repo**: dominio
  cerrado de `origen` y `confianza`, el CHECK cruzado `prospecto_persona_inferido_no_es_alta`
  y el único parcial sobre `lower(correo)` (0138:37-60), todos con su bloque 109 en
  `verificaciones.sql:5334-5378`.

**Corrección al MAPA (no es hallazgo, es un anclaje mal puesto que suprime uno):** la lista
de "tablas sin escritor" del `MAPA.md:152-154` incluye `posicion`. **Es falso desde antes de
esta ronda**: `src/lib/likida/processor.ts:114` inserta en `posicion` cada vez que un chofer
manda un pin de WhatsApp en un viaje con unidad. Su FK a `unidad` es simple (0050:47) y
`comercial.ts:348` la lee para el km/l. Quien lea el MAPA la va a descartar como muerta.

---

## Lo que NO alcancé a revisar

- **No hay base de datos aquí.** Ningún bloque de `verificaciones.sql` se corrió y el
  esquema **vivo** no se pudo comparar con el que describen las migraciones — el repo tiene
  precedente de que no siempre coincidieron (0065:72-79). En particular no pude leer los
  valores reales de `prospecto.scian`: el hallazgo ALTO se sostiene en que la columna no
  tiene restricción de forma y en que el propio repo la lee con semántica de prefijo y la
  prueba con seis dígitos. **Un `select distinct length(scian) from prospecto` lo cierra en
  un segundo y es lo primero que haría quien tenga la base delante.**
- **Los grants reales por tabla.** Sigo asumiendo el default de Supabase
  (`GRANT ALL … TO anon, authenticated` en `public`), que es lo que asumen 0048:42-46 y 0052,
  sin haberlo leído de `information_schema.role_table_grants`.
- **Las policies de las ~35 tablas de plataforma** (`agente_*`, `cola_*`, `bus_*`, `campana`,
  `evalops`, `evento_stripe`) las inventarié por nombre al hacer el barrido de FK, pero no
  crucé sus CHECK contra los tipos de TypeScript que las consumen. Prioricé el delta y la
  cadena del dinero.
- **`supabase/seed.sql`** no se cruzó contra los CHECK de dominio.
- **El delta de `piloto_vision.ts` (381 líneas) y `playwright_base.ts`** no toca esquema
  —lo verifiqué con `git diff 8d608a4..d432e89 --stat -- supabase/`, que solo lista las
  cuatro migraciones— así que no lo audité desde este rubro.
