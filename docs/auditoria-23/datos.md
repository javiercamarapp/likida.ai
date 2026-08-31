# Modelo de datos y esquema — auditoría 23

**Nota: 5/10** (antes 8). Razón del movimiento: **las dos formas a la vez**.
*Deuda que cobró factura* — la 22 dejó por escrito, en `MAPA.md:60-63`, que «un
arreglo que reescribe una función existente en vez de partir de su cuerpo es el
patrón de falla del día», y **volvió a ocurrir en la misma migración que decía
haberlo evitado**: la 0273 se declara reconstruida «verbatim» y lo que
reconstruyó fue el cuerpo de la **0262**, no el vivo de la **0264** — con lo que
revirtió, letra por letra, el arreglo que hacía que la cancelación ARCO pudiera
ejecutarse en producción. Y *mirada más profunda* — el 8 estaba inflado: se
obtuvo barriendo el **catálogo de restricciones como texto** (unicidades, RLS,
FK compuestas, dominios) y ese barrido nunca preguntó las dos cosas que hoy
duelen: **si las llaves que el SQL usa para unir tablas se escriben alguna vez**
(`wa_conversacion.operador_id` no la escribe nadie, y de ella cuelga el borrado
ARCO desde la 0173) y **si las columnas de dinero que alimentan el export tienen
piso** (`sub_total`, `iva_retenido`, `isr_retenido`, `iva_traslado`,
`ieps_traslado`: ninguna lo tiene). No es que el esquema empeorara en 24 horas;
es que se vio mejor.

**El riesgo mayor del rubro hoy:** la base tiene las restricciones que se pueden
enumerar y le faltan las que hay que ir a buscar — una función de cumplimiento
que no puede correr, un `delete` que empata contra una columna que nadie
escribe, y cinco columnas de dinero sin piso que la 0272 acaba de poner en el
camino del archivo que el contador importa a su ERP.

---

## Las tres migraciones nuevas, revisadas

### 0272 `poliza_deducibilidad.sql` (+99) — limpia como pieza de esquema

Es la mejor escrita de las tres y **no le encuentro defecto propio**. Verificado
línea por línea:

- No duplica la clasificación fiscal en SQL (0272:11-19) — entrega insumos y la
  ruta clasifica con `cubetaDe`. Correcto: evita la segunda fuente de verdad.
- **Ningún `null` se escapa al consumidor**: `folioViaje`, `operador`,
  `anticipo`, `comprobado`, `diferencia`, `ivaAcreditable`, `porConcepto`,
  `baseDesconocida`, `gastos`, `diferencias` y `retenciones` van todos con
  `coalesce` (0272:44-58). El tipo `FilaPoliza` de
  `src/app/api/export/poliza/route.ts:41-57` declara `subtotal: number | null`
  y `descuento?: number | null` — **más laxo que la columna, no más estricto**,
  que es la dirección que falla cerrado. No hay mentira de tipo aquí.
- **No hay doble conteo por `viaje_id`**: los dos `left join lateral` (0272:63,
  0272:81) agrupan por `l.viaje_id`, y `liquidacion_viaje_uidx`
  (`0005_concurrencia.sql:9`) garantiza una liquidación por viaje. Refutado el
  hallazgo que buscaba.
- `set search_path = public, pg_catalog` (0272:40) es correcto **aquí**: esta
  función no llama a nada de `extensions`.

Lo que sí cambia con la 0272 es **quién depende de qué**: las columnas
`gasto.sub_total`, `iva_retenido` e `isr_retenido` pasaron de huérfanas a
alimentar el archivo que el ERP asienta. Ninguna tiene `CHECK`. Eso es el
hallazgo DATOS-23-3, y es de la 0272 solo en el sentido de que ella las volvió
cargantes.

### 0273 `arco_cancelacion_texto_libre.sql` (+148), con la 0262 y la 0264 al lado

Puse los tres cuerpos en paralelo. Los guardas que la 22 dice haber recuperado
**sí están**, uno por uno:

| Guarda | 0262 | 0264 | 0273 |
|---|---|---|---|
| `v_operador is null` → rebota | :62 | :72 | **:54** ✓ |
| `v_tipo <> 'cancelacion'`, con el texto de `oposicion` | ✓ | :75-83 | **:57-65** ✓ |
| `v_estado in ('resuelta','improcedente')` → «ya estaba cerrada» | ✓ | :84-86 | **:66-68** ✓ |
| Formato del seudónimo (`'Operador ' || upper(substr(...,1,6))`) | ✓ | :92 | **:70** ✓ |
| `evidencia_fiscal_retenida` + CFF art. 30 | ✓ | :94 | **:74** ✓ |
| `update operador` con `rfc`, `licencia`, `licencia_tipo`, `licencia_vence` | ✓ | :104-112 | **:122-130** ✓ |
| `update app_user` | ✓ | :115-117 | **:133-136** ✓ |
| `revoke`/`grant` de la 0264 | — | :132-133 | **no repetidos, y no hace falta**: `create or replace function` conserva el ACL |
| **`search_path` con `extensions`** | :53 (sin) | **:59 (con)** | **:41 — SIN. Regresión.** |

La reconstrucción se hizo desde la **0262**. La 0264 —que existe únicamente para
arreglar ese `search_path`— quedó fuera del ejercicio. Es DATOS-23-1, CRÍTICO.

El `update incidencia_evento` nuevo (0273:105-116) además está **mal acotado**:
es DATOS-23-5.

### 0274 `wa_conversacion_telefono_normalizado.sql` (+51)

El índice es correcto y espeja bien la 0024: `telefono_normalizado` es
`immutable` (`0024:63`) —requisito para indexarla— y el índice es **por tenant**,
igual que `uq_operador_tenant_telefono_norm` (`0024:131`). `conv.ts:326-345` ya
lee con `.in('telefono', variantesTelefono(telefono))`, así que el camino del
chofer quedó cerrado.

Dos reservas:

1. **El arreglo de código cubrió `loadConversation` y no los otros dos módulos
   que el propio hallazgo DATOS-1 nombraba** (`asignar_wa.ts`, `despacho_wa.ts`).
   Con el índice puesto, lo que antes era un hilo partido ahora es una escritura
   que revienta. Es DATOS-23-4, ALTO, REINCIDENTE.
2. **Es destructiva y no dice qué borró** (0274:32-42). Su propio modelo, la
   0024, hace lo contrario: `do $$ ... raise exception` (0024:86-106) que
   **enumera los números duplicados y en qué flotas** antes de imponer nada. La
   0274 borra filas de `wa_conversacion` —el historial de la conversación, que
   es también la constancia del aviso de privacidad puesto a disposición— sin
   censo previo, sin log y sin línea `Reversible:`, que es convención de la casa
   (`0024:47-48`). Hoy la base está en cero y no borró nada; el día que se
   re-aplique el árbol contra una base con datos, sí. Es DATOS-23-7, BAJO.

### Bloques 220, 221 y 222 de `verificaciones.sql`

Los tres están **escritos de verdad, no silenciados**. Los leí completos
(`verificaciones.sql:15203-15243`, `:15260-15300`, `:15311-15351`) y los tres
aseveran comportamiento observable, con los fixtures ya corregidos contra los
dominios reales — el 220 inserta el `operador` que `viaje.operador_id NOT NULL`
exige (`:15214-15217`), y el 221 pone `vence_en` y `estado='recibida'`, con la
razón escrita en el comentario (`:15281-15283`). Los dos bloques preexistentes
que la 22 dice haber reparado, **ARCO_0178** (`:8153-8226`) y **ARCO_0262**
(`:8245-8269`), siguen aseverando lo suyo con `raise exception` y valores
esperados; no se aflojó ninguna aserción.

**Pero ninguno de los cinco puede ver DATOS-23-1**, y la razón está escrita por
la propia 0264 (`0264:30-38`): en el Postgres local de CI `pgcrypto` vive en
`public` —`0001_init.sql:6` es `create extension if not exists "pgcrypto"` sin
`with schema`, mientras que en Supabase gestionado la extensión ya existe en
`extensions` y ese `if not exists` es un no-op—, así que `digest()` resuelve por
`public` y los bloques salen **verdes con la función rota en producción**. El
único bloque que audita `search_path` en el árbol es INGENIERIA_0234
(`:11616-11621`) y solo mira funciones `SECURITY DEFINER`;
`ejecutar_arco_cancelacion` es `SECURITY INVOKER`.

---

## Hallazgos

### [CRÍTICO] La 0273 revirtió la 0264: `ejecutar_arco_cancelacion` vuelve a ser inejecutable en producción
`supabase/migrations/0273_arco_cancelacion_texto_libre.sql:41` ·
`supabase/migrations/0273_arco_cancelacion_texto_libre.sql:70` ·
`supabase/migrations/0273_arco_cancelacion_texto_libre.sql:124` ·
`supabase/migrations/0264_arco_cancelacion_digest_calificado.sql:59` ·
`supabase/migrations/0262_arco_cancelacion_anonimiza_rfc_y_licencia.sql:53`

Escenario: el chofer Juan Pérez ejerce su derecho de cancelación. El contralor
abre `/dashboard/arco` y aprieta «Ejecutar cancelación». La ruta llama
`ejecutar_arco_cancelacion(tenant, solicitud)`. La función declara
`set search_path = public, pg_catalog` (0273:41) y en su línea 70 hace
`digest(v_operador::text, 'sha256')` sin calificar. En Supabase gestionado
`pgcrypto` vive en el esquema `extensions` —verificado y documentado por la
propia 0264 (`0264:12-19`, con la salida de `pg_proc` pegada— y el `SET` de la
función **reemplaza** el `search_path` de la sesión en vez de extenderlo. Sale:

```
ERROR: 42883: function digest(text, unknown) does not exist
QUERY:  seudonimo := 'Operador ' || upper(substr(encode(digest(…), 'hex'), 1, 6))
```

antes de la primera escritura. Cero filas anonimizadas, la `solicitud_arco`
sigue en `recibida`, y el contralor recibe un error crudo de Postgres.

La 0264 existe **solo** para esto: su encabezado se titula «LA CANCELACIÓN ARCO
NUNCA HA PODIDO EJECUTARSE EN PRODUCCIÓN» y su único cambio de código respecto
de la 0262 es agregar `extensions` al `SET` (0264:59). La 0273 copió el cuerpo
de la **0262** —el anterior al arreglo—, incluido su `search_path`, y hasta
perdió el comentario `-- 0264: search_path EXTENDIDO` (0264:88-91) que estaba
ahí para que esto no pasara.

Consecuencia: el titular de los datos no puede ejercer su derecho de cancelación
—el plazo de la LFPDPPP corre igual, y `solicitud_arco.vence_en` lo cuenta— y la
flota queda incumpliendo con un 500 en pantalla. Es además el arreglo de un ALTO
de cumplimiento (LEG-A4) que, al aplicarse, rompió el arreglo de un CRÍTICO
anterior del mismo circuito.

Causa raíz probable: se partió del último archivo que *menciona* la función
(`0262`, el que el hallazgo legal citaba) en vez de la última definición
*aplicada* (`0264`); no hay nada en el repo que diga cuál es el cuerpo vivo de
una función con cinco redefiniciones (0173 → 0178 → 0262 → 0264 → 0273).

*(REINCIDENTE del patrón que `MAPA.md:60-63` declaró «el patrón de falla del
día» — reincidente dentro de la misma migración que decía haberlo evitado.)*

---

### [CRÍTICO] El borrado ARCO de la conversación de WhatsApp empata contra `wa_conversacion.operador_id`, una columna que ningún escritor llena: borra 0 filas, siempre, desde la 0173
`supabase/migrations/0273_arco_cancelacion_texto_libre.sql:76` ·
`src/lib/likida/conv.ts:372-374` · `src/lib/likida/asignar_wa.ts:194-200` ·
`src/lib/likida/despacho_wa.ts:139-145` ·
`supabase/migrations/0001_init.sql:80`

La función hace, desde la 0173 y sin cambios hasta hoy:

```sql
delete from wa_conversacion where tenant_id = p_tenant and operador_id = v_operador;
get diagnostics n = row_count; ev := ev || jsonb_build_object('wa_conversacion', n);
```

`wa_conversacion.operador_id` es nullable desde `0001_init.sql:80`, y **los tres
escritores de la tabla la omiten a propósito**:

- `conv.ts:373` inserta `{ tenant_id, telefono, viaje_id, estado }`.
- `asignar_wa.ts:195-200` hace upsert de `{ tenant_id, telefono, estado, updated_at }`,
  con el comentario explícito «`viaje_id`/`operador_id` fuera del payload a
  propósito» (`asignar_wa.ts:190-192`).
- `despacho_wa.ts:141-145`, idéntico; y `despacho_wa.ts:23` lo dice en una línea:
  «`operador_id` es nullable a propósito desde la 0001. **No se usa**».

Busqué el escritor por todos lados y no existe: ni en `src/` (ningún
`insert`/`update` de `wa_conversacion` menciona la columna) ni en las 274
migraciones (`grep` de `update wa_conversacion` / `set operador_id`: cero
resultados; lo único que existe es el índice de borrado `0071:72` y la FK
compuesta `0145:168`, o sea dos piezas de infraestructura sobre una columna
vacía).

Escenario con valores: Juan Pérez, `+5219993700779`, pide cancelación. Su fila
de `wa_conversacion` tiene `telefono = '5219993700779'`, `operador_id = NULL`, y
`estado.turns` con hasta 12 turnos (`conv.ts:308`, `MAX_TURNS = 12`) del texto
que él escribió —el mismo texto libre que la 0273 se escribió para perseguir en
`incidencia`—. El `DELETE` filtra por `operador_id = <uuid de Juan>`, no empata
ninguna fila, `n = 0`. La función continúa, anonimiza `operador` y `app_user`,
y devuelve `evidencia = {"wa_conversacion": 0, ...}`. La `solicitud_arco` se
cierra con `resolucion = 'Cancelación ejecutada: datos personales anonimizados,
incluido el texto libre que el titular escribió por el chat…'` (0273:140), y
`/dashboard/arco` se lo confirma al contralor.

Y el dato que queda **identifica directamente**: `wa_conversacion.telefono`
guarda el número real y la 0273 no lo toca (solo reescribe `operador.telefono` a
`'anon:…'`, 0273:124). En `/admin` la fila sigue siendo legible sin filtro de
tenant (`conversaciones.ts:75-76`, que además pide
`operador:operador_id(nombre)` y por eso siempre pinta el operador vacío — el
síntoma visible de esta misma columna muerta).

Consecuencia: el titular cancelado sigue teniendo, en la base, su número de
teléfono y su conversación completa, mientras la flota **firma** que lo
anonimizó. Es la misma falla que la 0273 fue a arreglar en `incidencia`, un
renglón más arriba en la misma función, y con el agravante de que la evidencia
que se archiva (`"wa_conversacion": 0`) parece decir «no había nada que borrar»
en vez de «no encontré nada porque busqué por la columna equivocada».

Refutación intentada: busqué (a) un trigger que rellene `operador_id` — no hay;
(b) una segunda ruta de borrado por teléfono — no hay: el único `delete` de
`wa_conversacion` en todo el árbol es éste y sus cuatro copias en 0173/0178/0262/
0264; (c) un bloque de `verificaciones.sql` que lo vigile — el ARCO_0178
(`:8153`) sí inserta una `wa_conversacion` de fixture, pero **la inserta con
`operador_id` puesto a mano**, cosa que la aplicación nunca hace: la prueba
verifica un mundo que el código no produce. Ese es exactamente el modo de falla
del rubro: la base «tiene» la relación y la aplicación no la escribe.

Causa raíz probable: la 0173 modeló la conversación por `(tenant, operador)` y
el producto la modeló por `(tenant, teléfono)`; la llave correcta (`telefono`,
con `telefono_normalizado` desde la 0274) está a la mano y no se usa. Nada en la
base obliga a que una conversación esté ligada a su operador.

---

### [ALTO] Cinco columnas de dinero de `gasto` no tienen piso, y la 0272 acaba de ponerlas en el archivo que el contador importa
`supabase/migrations/0007_acreditamiento.sql:5` ·
`supabase/migrations/0063_lo_que_falta_para_operar.sql:61-62` ·
`supabase/migrations/0070_montos_no_negativos.sql:41` ·
`supabase/migrations/0272_poliza_deducibilidad.sql:85` ·
`supabase/migrations/0272_poliza_deducibilidad.sql:89` ·
`src/lib/likida/intake/cfdi_xml.ts:262-266` ·
`src/lib/likida/intake/cfdi_xml.ts:372` · `src/lib/likida/repo.ts:380`

La 0070 puso `check (monto >= 0)` y se tituló «las **dos** columnas del camino
del dinero que aceptaban negativos» (`0070:41,44`). Barrí los `add constraint`
de `gasto` en las 274 migraciones: los únicos que acotan importes son
`gasto_monto_no_negativo` (0070:41) y `gasto_descuento_no_negativo` (0171:27-28).
**No existe ninguno** sobre `sub_total` (0007:5), `iva_traslado`,
`ieps_traslado`, `iva_retenido` ni `isr_retenido` (0063:61-62). Y el escritor
tampoco valida: `num()` (`cfdi_xml.ts:262-266`) es `parseFloat` con rechazo solo
de `NaN`, `subTotal: num(comp['@_SubTotal'])` (`:372`) pasa el signo tal cual, y
`repo.ts:380` lo escribe directo. La otra puerta es el OCR: `ocr.ts:596` escribe
`subTotal: data.subtotal` desde lo que extrajo el modelo.

**Escenario A — el dinero sale mal y el asiento CUADRA, que es lo peor.** El
chofer manda por WhatsApp un XML con `SubTotal="-5000.00"` y `Total="5800.00"`
(un XML mal formado, un signo invertido, o una alucinación del OCR sobre un
ticket borroso). `gasto_monto_no_negativo` no lo detiene: mira `monto`, que vale
5,800. La fila entra. Al exportar la póliza:

- `poliza_datos_tenant` devuelve `gastos[0].subtotal = -5000` (0272:85).
- `repartirPorCubeta` (`export/poliza/route.ts:83`) calcula `monto = -5000` y
  lo suma a la cubeta deducible.
- `polizaDeLiquidacion` emite un movimiento con **`cargo: -5000`** a la cuenta
  de diésel (`poliza.ts:151-155`: la guarda es `if (deducible !== 0)`, no
  `> 0`).
- `impuestoNoAcreditado = comprobado + retenciones − subtotalDeclarado −
  ivaAcreditable` (`poliza.ts:230`) = `5800 + 0 − (−5000) − 0` = **10,800**, y
  se asienta como cargo a «IVA/IEPS no acreditable».
- El cuadre final (`poliza.ts:296-307`) compara cargos contra abonos: los dos
  términos se cancelan algebraicamente, **cuadra**, y el CSV sale.

El contador importa a CONTPAQi un asiento con un cargo negativo de $5,000 a
gastos de diésel y $10,800 de IVA no acreditable inventados sobre un comprobante
de $5,800. Nada avisa.

**Escenario B — el periodo entero se cae.** Una retención llega negativa
(`iva_retenido = -640.00`, mismo origen: `cfdi_xml.ts:360-363` suma
`@_Importe` sin validar signo). `poliza_datos_tenant` la agrega en `retenciones`
(0272:89). En `poliza.ts:232` la guarda es `if (retenciones > 0.01)`, así que
**no se emite el abono**, pero el término sí entró en `impuestoNoAcreditado`
(`:230`): la póliza descuadra por exactamente 640 y `poliza.ts:296-307` devuelve
409 `polizas_incompletas`. El contralor recibe «cargos 12,340.00 vs abonos
12,980.00» **sin ninguna pista de cuál comprobante** —el mensaje no nombra el
gasto— y el export del mes entero se bloquea.

Consecuencia: en A, el contador asienta cifras falsas en su ERP y las descubre
en la auditoría del año siguiente; en B, pierde el cierre del mes y no tiene por
dónde empezar a buscar. En ambos, la puerta la abre el chofer con un archivo.

Refutación intentada: (a) `descuento` **sí** tiene su `>= 0` (0171:27-28) — ése
no es el hallazgo; (b) busqué una validación de signo en `cfdi_xml.ts`,
`intake/cfdi.ts`, `repo.ts` y `proveedores.ts:138,233` y no la hay; (c) busqué
un CHECK de coherencia `total = sub_total + traslados − descuento` en el árbol y
no existe. Lo que sí existe es un cuadre **en la aplicación** (`poliza.ts:296`),
que es justamente la respuesta que el rubro define como hallazgo: un script o la
consola de Supabase no pasan por ahí.

Causa raíz probable: la 0070 se escribió con el motor de cuadre en la cabeza
(`monto` y `anticipo` son los que entran a la resta) y `sub_total` no tenía
consumidor de dinero entonces; la 0272 lo cambió y nadie volvió sobre el piso.

---

### [ALTO] El arreglo de DATOS-1 llegó a `loadConversation` y no a `asignar_wa`/`despacho_wa`: ahí el índice nuevo convierte un hilo partido en una escritura que revienta
`src/lib/likida/asignar_wa.ts:161` · `src/lib/likida/asignar_wa.ts:181` ·
`src/lib/likida/asignar_wa.ts:200` · `src/lib/likida/asignar_wa.ts:232` ·
`src/lib/likida/despacho_wa.ts:100` · `src/lib/likida/despacho_wa.ts:124` ·
`src/lib/likida/despacho_wa.ts:145` · `src/lib/likida/despacho_wa.ts:420` ·
`supabase/migrations/0274_wa_conversacion_telefono_normalizado.sql:47`

El hallazgo DATOS-1 de la 22 nombró tres consumidores rotos:
`asignar_wa.ts:194-200`, `asignar_wa.ts:157-161` y `despacho_wa.ts:139-145`
(`docs/auditoria-22/datos.md:55-57`). El arreglo tocó `conv.ts:326-345` —que
ahora lee con `.in('telefono', variantesTelefono(telefono))`— y **dejó los otros
dos exactamente como estaban**: siguen leyendo con `.eq('telefono', telefono)`
(igualdad exacta) y siguen haciendo upsert con
`{ onConflict: 'tenant_id,telefono' }`, que apunta al índice **crudo** de la
0005, no al normalizado de la 0274.

Escenario con valores. El jefe de tráfico opera por el WhatsApp de oficina. No
es operador, así que `loadConversation` nunca corre para él: su fila de
`wa_conversacion` la crea el upsert de `guardarPendiente`.

1. Dicta «manda a Pedro a Querétaro con 8,000 de anticipo». Meta entrega
   `from = "5219993700779"`. `despacho_wa.ts:420` guarda el pendiente → INSERT
   con `telefono = '5219993700779'`. Recibe el resumen y un «¿Confirmas?».
2. Contesta «sí». Meta lo entrega esta vez como `"529993700779"` — la variación
   que `conv.ts:64-71` documenta textualmente («el mismo teléfono llega como
   `529993700779` o como `5219993700779` según por dónde entre»).
3. `cargarPendiente` (`despacho_wa.ts:100`) busca con igualdad exacta contra
   `'529993700779'`: **no encuentra nada**. El «sí» se cae al piso.
4. Peor, si el jefe vuelve a dictar el viaje: `guardarPendiente` hace upsert con
   `onConflict: 'tenant_id,telefono'`, que **no colisiona** (son dos cadenas
   distintas), así que intenta INSERT — y ahí sí choca, contra
   `uq_wa_conversacion_tenant_telefono_norm` (0274:47), un índice que ningún
   `ON CONFLICT` de este código nombra. Postgres devuelve 23505,
   `despacho_wa.ts:150` lo registra con `logger.error` y devuelve `false`… y
   `despacho_wa.ts:420` **ignora el valor de retorno** y contesta el resumen
   «¿Confirmas?» igual. El jefe dice «sí» a una pregunta que no quedó guardada.

Antes de la 0274 esto creaba una segunda fila y el estado se partía (el hallazgo
original). Después de la 0274 la escritura falla. El mismo caso rompe
`asignar_wa` (`:200`) y deja el reclamo del pendiente (`:232`, también igualdad
exacta) sin nada que reclamar.

Consecuencia: el jefe de tráfico despacha un viaje por WhatsApp, ve el resumen
con el operador y el anticipo, confirma, y no pasa nada — sin mensaje de error
para él, solo un `logger.error` que nadie mira a esa hora. Y `conv.ts:379`, que
sí maneja la carrera del insert, solo reconoce el índice viejo
(`violaIndice(errInsert, 'wa_conversacion_tenant_tel_uidx')`): una colisión
contra el índice nuevo cae al `throw ConsultaFallida` de `:380`, y el
`.eq('telefono', telefono)` de la relectura (`:387`) tampoco la encontraría.

Causa raíz probable: el arreglo se validó contra el archivo donde nació el
diagnóstico (`conv.ts`) en vez de contra la lista de consumidores que el propio
hallazgo enumeraba; y la base ahora impone una unicidad que ningún `onConflict`
del código declara.

*(REINCIDENTE de DATOS-1, auditoría 22 — cerrado a medias.)*

---

### [MEDIO] El `UPDATE` de `incidencia_evento` de la 0273 alcanza a todas las incidencias ya anonimizadas de la flota, no a las del titular que está cancelando
`supabase/migrations/0273_arco_cancelacion_texto_libre.sql:105-117`

El primer `UPDATE` (0273:94-99) sí está acotado a `operador_id = v_operador`.
El segundo no:

```sql
update incidencia_evento e
   set detalle = jsonb_set(..., '{texto}', to_jsonb('[texto retirado…]'), true)
 where e.tenant_id = p_tenant
   and e.detalle ? 'texto'
   and e.incidencia_id in (
     select i.id from incidencia i
      where i.tenant_id = p_tenant and i.texto_anonimizado_en is not null);
```

`texto_anonimizado_en is not null` no distingue «anonimizada hace un segundo por
esta llamada» de «anonimizada hace tres meses por la cancelación de otro
titular». Y `incidencia_evento` es una bitácora **append-only** que sigue
creciendo (`0198:117`): la incidencia sigue viva a propósito («el renglón
sobrevive… es un hecho operativo de la flota», 0273:87-90).

Escenario con valores: en marzo, el operador A cancela; su incidencia I-1 queda
con `texto_anonimizado_en = 2026-03-10`. En abril el taller sigue anotando sobre
I-1: `{"texto": "grúa Rescates del Bajío llegó 14:20, la unidad 12 quedó en el
patio, cotización 48,500"}`. En agosto el operador C, otra persona, cancela.
El segundo `UPDATE` empata I-1 —porque su `texto_anonimizado_en` no es NULL— y
**sustituye el texto de abril por la marca ARCO**. Ese renglón de la bitácora
operativa se pierde para siempre y nadie pidió que se perdiera.

Efecto secundario en el mismo bloque: `get diagnostics n` (0273:117) cuenta esas
filas ajenas, así que `evidencia.incidencia_evento_texto_anonimizado` reporta,
digamos, 7 cuando al titular C le correspondían 2. Esa evidencia es la que se
archiva en `solicitud_arco.evidencia` y la que se enseñaría a la autoridad.

Consecuencia: la flota pierde parte de su bitácora de siniestros (la que
sustenta una reclamación al seguro) y el expediente ARCO cuenta más de lo que
hizo. El bloque 221 no lo ve: su fixture tiene una sola incidencia
(`verificaciones.sql:15272-15279`).

Causa raíz probable: se usó la marca `texto_anonimizado_en` como si fuera un
predicado de «esta llamada» cuando es un predicado de «alguna vez»; el conjunto
correcto son las filas que el `UPDATE` anterior acaba de tocar.

---

### [MEDIO] `incidencia.monto_estimado` es `numeric` sin escala, la escribe el modelo con lo que dictó el chofer, y sale impresa en dos pantallas
`supabase/migrations/0107_talacha_autorizada.sql:39` ·
`src/lib/likida/talacha_wa.ts:238` · `src/lib/likida/talacha_wa.ts:428` ·
`src/lib/admin/escalaciones.ts:293`

`add column monto_estimado numeric` — sin precisión, sin escala, y con `add
column` a secas (sin `if not exists`, en un archivo que además no guarda sus
`add constraint`, 0107:62-67). El único CHECK que recibió después es
`monto_estimado >= 0` (`0158:677-678`): hay piso, **no hay techo ni escala**.
Todas las demás columnas de pesos del esquema son `numeric(12,2)`.

Esto contradice literalmente lo que la 22 dejó escrito
(`docs/auditoria-22/datos.md:240-243`: «Cero columnas de dinero en `numeric` sin
escala. `numeric(12,2)` uniforme»). No lo es: además de ésta,
`llm_costo.costo_usd` (0072:64), `agente_definicion.presupuesto_dia_usd`
(0116:50), `campana.presupuesto_aprobado_usd`/`cpl_objetivo_usd`/
`gasto_real_usd` (0123:53,55,71) y `reserva_agente.monto_usd`/`costo_real_usd`
(0180:12,16) son `numeric` desnudo. En las de USD es defendible (fracciones de
centavo de dólar); en pesos de una talacha no.

Escenario con valores: el chofer dicta por WhatsApp «se rompió la turbina, son
como 9999999999999999.999». El modelo extrae el número, `talacha_wa.ts:238` lo
escribe en `monto_estimado` y la columna lo acepta entero. El jefe recibe el
aviso con `mxn(monto)` (`talacha_wa.ts:433`) y Javier lo ve encabezando la lista
de escalaciones: «Talacha esperando autorización — $9,999,999,999,999,999.00»
(`escalaciones.ts:293`). Si además se autoriza y ese monto se lleva a un `gasto`
—`gasto.monto` es `numeric(12,2)`, tope 9,999,999,999.99— la escritura truena
con `22003 numeric field overflow` en un punto donde el flujo ya le prometió al
chofer «Autorizada ✅».

Consecuencia: una cifra sin techo entra a la consola del superadmin como si
fuera medición, y el mismo número que la pantalla acepta lo rechaza la tabla de
destino. Es MEDIO y no ALTO porque se ve a simple vista.

Causa raíz probable: la columna nació fuera del barrido de la 0070 y de la 0158,
que trataron `gasto` y `viaje` y no las tablas de operación.

---

### [BAJO] La 0274 borra filas de conversación sin censo, sin log y sin línea de reversión — su propio modelo, la 0024, hace lo contrario
`supabase/migrations/0274_wa_conversacion_telefono_normalizado.sql:32-42` ·
`supabase/migrations/0024_telefono_normalizado_unico.sql:86-106` ·
`supabase/migrations/0024_telefono_normalizado_unico.sql:47-48`

La 0024, que la 0274 declara espejar, **no borra nada**: recorre los duplicados
y lanza una excepción que nombra el número canónico, cuántas filas y en qué
flotas (`0024:99-104`), para que una persona decida. Y trae su línea
`Reversible: drop index …` (0024:47-48), convención de la casa. La 0274 hace
`delete … where rn > 1` (0274:40-42) conservando la más reciente por
`updated_at`, sin decir cuántas ni cuáles, y sin línea de reversión — el índice
se puede dropear, las filas no vuelven.

Escenario: se re-aplica el árbol contra una base con datos (una restauración,
un entorno de staging poblado). Un chofer con dos hilos pierde el más viejo, que
es donde puede vivir la constancia de que se le puso a disposición el aviso de
privacidad — el propio comentario de la 0274 lo enumera entre lo que se parte
(0274:19). Nadie sabrá que se borró.

Consecuencia: BAJO hoy, porque la base está en cero y el `delete` no empata
nada. Es deuda que cobra factura el día de la primera restauración.

---

## Invariantes del código que la base NO impone

| Invariante que el código asume | Dónde lo asume | ¿Lo impone la base? |
|---|---|---|
| Una conversación de WhatsApp pertenece a un operador identificable | `0273:76` (el `delete` ARCO empata por `operador_id`) | **No.** `operador_id` es nullable (`0001:80`) y **ningún escritor la llena** (`conv.ts:373`, `asignar_wa.ts:195`, `despacho_wa.ts:141`) |
| `gasto.sub_total ≥ 0` | `poliza.ts:151` emite el cargo tal cual; `fiscal.ts:799` suma casetas | **No.** Sin CHECK (0007:5); solo `monto` lo tiene (0070:41) |
| `gasto.iva_retenido ≥ 0`, `isr_retenido ≥ 0` | `0272:89` los suma como abono de la póliza | **No.** Sin CHECK desde 0063:61-62 |
| `gasto.iva_traslado ≥ 0`, `ieps_traslado ≥ 0` | `engine.ts` los acredita | **No.** Sin CHECK |
| `descuento ≤ sub_total` (el neto no es negativo) | `export/poliza/route.ts:83` (`monto = subtotal − descuento`) | **No.** Solo hay `descuento >= 0` (0171:28); nada ata las dos columnas |
| `total = sub_total + traslados − descuento` en un CFDI | `poliza.ts:230` deriva el impuesto no acreditado de esa identidad | **No.** No hay CHECK de coherencia entre importes de `gasto` |
| Un `(tenant, teléfono normalizado)` = una conversación, y el código sabe cómo colisiona | `asignar_wa.ts:200`, `despacho_wa.ts:145` (`onConflict: 'tenant_id,telefono'`) | **La base sí, desde 0274:47 — y el código no la nombra**: el `onConflict` apunta al índice crudo |
| `incidencia.monto_estimado` cabe en la `gasto.monto` de destino | `talacha_wa.ts:428` → gasto `numeric(12,2)` | **No.** `numeric` sin escala ni techo (0107:39) |
| `ejecutar_arco_cancelacion` puede resolver `digest()` | `0273:70,124` | **No.** Nada verifica el `search_path` de funciones `SECURITY INVOKER`; INGENIERIA_0234 (`verificaciones.sql:11616-11621`) solo mira las `DEFINER` |
| El texto ARCO retirado es el del titular que canceló | `0273:105-116` | **No.** El predicado es `texto_anonimizado_en is not null`, que incluye a otros titulares |

---

## Lo que revisé y está bien

- **0272 completa** (`0272:33-99`): sin nulos que se escapen, sin doble conteo
  (`liquidacion_viaje_uidx`, `0005:9`), `search_path` correcto para lo que usa,
  y su tipo consumidor (`export/poliza/route.ts:41-57`) declara `| null` donde
  la columna es nullable — la dirección que falla cerrado.
- **Los guardas de la 0273 contra la 0264**: los siete que la 22 dice haber
  recuperado están, verificados uno por uno en la tabla de arriba. Lo único que
  se perdió fue el `search_path`.
- **El ACL de la función**: `create or replace function` conserva privilegios,
  así que el `revoke … from public, anon, authenticated` + `grant … to
  service_role` de `0264:132-133` sigue en pie tras la 0273. No es hallazgo.
- **El índice de la 0274** (`:47-48`): expresión `immutable` (`0024:63`),
  alcance por tenant igual que su modelo, `if not exists`, y comentario que
  explica el modo de falla. Correcto como pieza de esquema.
- **Los cinco bloques ARCO/póliza de `verificaciones.sql`** (220, 221, 222,
  ARCO_0178 `:8153`, ARCO_0262 `:8245`): aseveran comportamiento real con
  `raise exception` y valores esperados; los fixtures nuevos ya respetan
  `viaje.operador_id NOT NULL` (`:15214`) y `solicitud_arco.vence_en NOT NULL` +
  `estado='recibida'` (`:15281-15284`). La reparación no aflojó ninguna
  aserción.
- **Higiene de las tres migraciones nuevas**: ningún `add constraint` sin
  guardia, ningún `create table`; `0273:29-30` usa `add column if not exists` y
  `0274:47` usa `create unique index if not exists`. La cuenta de 51
  `add constraint` sin guardia de la 22 no creció.
- **`descuento`**: `gasto_descuento_no_negativo` (0171:27-28) sí existe. Intenté
  hacerlo hallazgo y quedó refutado.
- **Numeración**: 0272, 0273 y 0274 son consecutivas y sin duplicar; última
  migración `0274`.

## Lo que NO alcancé a revisar

- **No hay Postgres corriendo en este entorno.** Todo lo anterior es lectura de
  SQL como texto. En concreto **no pude ejecutar**:
  - Los ~222 bloques de `supabase/verificaciones.sql`, que son la red real de
    este rubro. Los bloques 220/221/222 los leí; no los corrí.
  - **El CRÍTICO DATOS-23-1 no es reproducible aquí ni en CI**: depende de en
    qué esquema viva `pgcrypto`, y `0001_init.sql:6` lo instala sin
    `with schema` (→ `public` en local) mientras Supabase gestionado ya lo trae
    en `extensions`. La comprobación que falta es una línea en el proyecto
    gestionado: `select p.proconfig from pg_proc p where p.proname =
    'ejecutar_arco_cancelacion'` debe contener `extensions`, y
    `select n.nspname from pg_proc p join pg_namespace n on n.oid =
    p.pronamespace where p.proname = 'digest'` dice dónde está pgcrypto. Lo doy
    por CRÍTICO porque la 0264 pegó esa medición hecha contra producción
    (`0264:12-19`) y la 0273 revirtió el arreglo que de ella salió.
  - El **orden real de aplicación** (`supabase_migrations.schema_migrations`):
    si la 0273 se aplicó y la 0264 no, o al revés, desde el repo no se ve.
  - El **conteo de filas** de `wa_conversacion` con `operador_id` no nulo, que
    confirmaría en un segundo el CRÍTICO DATOS-23-2. Lo sostengo por ausencia de
    escritor en `src/` y en las 274 migraciones, que es evidencia estática
    completa pero no una medición.
- **Los ~120 CHECK de coherencia** (`*_coherente`, `*_cuadra`, `*_requiere_*`):
  revisé los que tocan el camino nuevo de la póliza y los de `gasto`; no los
  demás uno por uno.
- **`storage.objects` y sus policies**, y las tablas de la cadena de siniestros
  distintas de `incidencia`/`incidencia_evento`.
- **El resto de columnas de teléfono del esquema**: la 0274 cerró
  `wa_conversacion`, y la 0024 `operador`. No barrí si queda una tercera tabla
  con teléfono crudo y unicidad sobre texto.
- **`liquidacion.diferencias` (jsonb)**: sigue sin dominio para los ~40
  `TipoDiferencia`, y ahora la 0272 lo entrega a `cubetaDe`. Un `tipo`
  desconocido cae a la cubeta deducible en silencio; no lo reporto porque no
  encontré un camino que produzca un `tipo` fuera del enum de TypeScript, pero
  no lo agoté.
