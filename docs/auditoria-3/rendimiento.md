# Rendimiento y costo — auditoría 3

**Nota: 4/10** (antes 6). Baja porque los seis agentes estrenados hoy metieron TRES caminos cuyo peor caso, sumado a mano con los costos unitarios que el propio repo declara (`presupuesto.ts:35`: 0.3s una consulta, 1.5s un `sendText`), excede su límite escrito entre 3× y 10× — y los tres mueren callados a media corrida, dos de ellos dejando estado a medias que no se repara solo. El ancla del rubro es explícita: peor caso que excede el límite y falla callado = 4 o menos. No baja más porque la disciplina de presupuesto del camino del dinero (webhook → cuadre → PDF) es real y mejor que en la auditoría 2: tabla de pasos verificada por prueba, topes en dos capas, costo por modelo, cachés medidas.

**Riesgo mayor hoy:** el PoC con el prospecto de 750 camiones es EXACTAMENTE el escenario que revienta lo nuevo: importar su TMS (750 nombres de operador), subir su consolidado de TAG (miles de líneas) y encender la cobranza sobre su backlog (cientos de viajes abiertos) son las tres primeras cosas que se harían en la primera semana, y las tres exceden su límite de tiempo en la primera pasada.

---

## Hallazgos

### H1 — CRÍTICO · El XML consolidado hace un UPDATE por línea conciliada, en serie y sin presupuesto: a escala real no cabe en el webhook, y morir a la mitad corrompe la conciliación para siempre

**Evidencia:** `src/lib/likida/intake/consolidado.ts:259-270` — `for (const r of resultados) { ... await ligarLineaAGasto(...) }`, un UPDATE serial por cada línea conciliada, ANTES del upsert de `cfdi_consolidado_linea` (línea 287). Entra por dos puertas: el webhook de WhatsApp (`processor.ts:421-436`, rama oficina nueva de hoy, `maxDuration = 120` en `route.ts:77`) y la página de Peajes (`agentes/peajes/page.tsx:74`, que NO declara `maxDuration`; el único tope verificado por el repo es "plan pro, 300s" en `presupuesto.ts:183`). Ninguna de las dos rutas consulta `crearPresupuesto` ni pasa señal de aborto al bucle.

**La suma:** un estado de cuenta de TAG de una flota de 750 camiones trae miles de cruces; el límite de archivo es 4 MB (`MAX_XML_BYTES`, peajes) y el parser no acota `lineas` (`cfdi_xml.ts` no tiene tope). Con 1,000 líneas conciliadas: 1,000 × 0.3s = **300s contra los 120s del webhook** (2.5×) y contra los 300s de la página (al límite, sin contar descarga ni parse). Con 2,000 conciliadas: 600s. El `acotada` de cada UPDATE (8s) protege del cuelgue individual, no de la suma.

**Consecuencia — y es peor que perder tiempo:** Vercel mata la invocación a media pasada. Los `gasto` ya ligados quedan con `cfdi_uuid` sellado, pero las filas de `cfdi_consolidado_linea` NUNCA se escriben (el upsert va al final). Al reenviar el mismo XML, el guardia de idempotencia (`consolidado.ts:229-236`) ve cero líneas existentes y re-corre el JOIN — pero los gastos ya sellados salen de `candidatosDb` (`.is('cfdi_uuid', null)`, línea 245), así que las líneas que SÍ estaban conciliadas se escriben como `por_conciliar` sin candidatos. Es exactamente la corrupción que el comentario de las líneas 222-228 dice venir a evitar: el kill por timeout entra por la puerta que el reenvío tiene cerrada. Un contador puede después ligar a mano esa línea a OTRO gasto: el mismo peaje sellado en dos comprobantes.

**Refutación considerada:** ¿de verdad llegan miles de líneas? El comentario de `getDesglosesRecibidos` (analytics.ts:1539) llama a 2,000 líneas "≈ meses de operación" — para la flota demo. Para 750 camiones con 4-8 casetas/día por camión, un corte SEMANAL ya rebasa 2,000. La escala del encargo es esa.

---

### H2 — CRÍTICO · El cron de escalación + cobranza suma hasta 330s + 1,200s de envíos seriales contra `maxDuration = 120`, y morir entre el claim y el envío consume el tier sin mandar nada

**Evidencia:** `src/app/api/cron/escalar/route.ts:11` (`maxDuration = 120`), que corre EN SERIE `escalarViajesSinAceptar()` (línea 68) y luego `ejecutarCobranzaGlobal()` (línea 78). Ninguno de los dos motores conoce el presupuesto: no hay `crearPresupuesto`, no hay corte por tiempo (contraste: `cron/facturar/route.ts:129` sí tiene `PRESUPUESTO_LOTE_MS` y para cuando no cabe).

**La suma, con los costos unitarios del repo:**
- Escalación (`escalar_viaje.ts:96`, `limit(100)`): por viaje ganado = claim 0.3s + `sendText` chofer 1.5s + `sendText` jefe 1.5s = 3.3s (peor caso con plantillas de respaldo: 6.3s; peor caso con Meta lento: `SEND_TIMEOUT_MS` = 10s por envío, `meta/client.ts:17`). **100 viajes × 3.3s = 330s contra 120s.** Con solo 37 viajes vencidos ya no cabe; a 750 camiones, docenas de choferes sin confirmar en 5h es un martes normal.
- Cobranza (`agentes/cobranza.ts:205-243`): por contacto = INSERT claim 0.3s + `sendText` 1.5s + UPDATE resultado 0.3s + UPDATE sello 0.3s = 2.4s, más 0.3s por cada sin-teléfono (líneas 196-203). La cola admite 500 (`colaCobranza`, línea 111) y el agente viene `activo: true` por default (`cobranza_pura.ts:31`) con tier 1 a los 3 días. El día que el tenant de 750 camiones entra con backlog: 300 viajes abiertos ≥ 3 días → **300 × 2.4s = 720s**, que se ejecutan DESPUÉS de la escalación, dentro de los mismos 120s. Y los tenants van en serie (`ejecutarCobranzaGlobal`, líneas 266-274): el primero grande deja a los demás sin turno.

**Consecuencia:** Vercel mata la corrida (~45 contactos/hora efectivos). Los tiers no reclamados reintentan a la hora siguiente — ese lado sana. Lo que NO sana: el contacto que muere entre el INSERT del claim (`enviado: false`, línea 209) y el `sendText` (línea 219) queda anotado para siempre — `colaCobranza` cuenta TODA fila de `cobranza_contacto` como tier consumido sin filtrar `enviado` (líneas 118-128) y `tierPendiente` lo excluye (`cobranza_pura.ts:93-96`). Ese operador nunca recibe ese recordatorio, no hay reintento ni alarma; solo una fila `enviado=false` sin detalle en una bitácora que enseña 12 renglones.

**Refutación considerada:** una corrida manda máximo UN mensaje por viaje por tier (`Math.max` de alcanzados), así que no hay tormenta de spam — cierto, el bucle está bien acotado POR VIAJE; lo que no cabe es la SUMA de viajes en el reloj de la función. Y el botón "Ejecutar ahora" de la página (`agentes/cobranza/page.tsx:102`) corre la misma cola de 500 dentro de una server action sin `maxDuration` declarado: el humano que aprieta no cambia la aritmética.

---

### H3 — ALTO · `importarViajes` trae TODOS los operadores del tenant POR CADA nombre distinto del archivo: 750 nombres = 1,500 viajes de red = ~450s, y la importación del prospecto muere determinista

**Evidencia:** `src/lib/likida/importar_viajes.ts:190-202` — el bucle de amarre llama `resolverOperadorPorNombre` una vez por nombre distinto; esa función (`crear_viaje_wa.ts:771-778`) hace `traerTodo` de TODOS los operadores activos del tenant en cada llamada, y como su `.select('id, nombre')` no pide `conteo()`, paga además la página vacía de prueba: **2 viajes de red por nombre**.

**La suma:** el archivo admite 2,000 filas (`interpretarFilasViajes`, línea 126). El TMS de 750 camiones trae hasta 750 nombres distintos: 750 × 2 × 0.3s = **450s** solo en resolver nombres — descargando 750 × 750 = 562,500 filas de operador para resolver lo que UNA lectura de 750 filas resuelve. Antes de eso, el dedup lee TODOS los folios del tenant (`importar_viajes.ts:174-180`): a 36,000 viajes/año son 36 páginas seriales ≈ 11s, y `traerTodo` LANZA al cruzar 100,000 viajes (`pg.ts:48`) — la importación entera deja de funcionar ese día. Total del peor caso: ~470s contra los 300s verificados del plan (`presupuesto.ts:183`), dentro de una server action que no declara `maxDuration` (`dashboard/viajes/page.tsx:73-108`).

**Consecuencia:** la acción muere antes de llegar a los INSERT (el amarre va primero): cero viajes creados, el usuario ve el formulario colgado y reintenta contra el mismo muro. Es el primer paso del kit del PoC y falla determinista a la escala del prospecto.

**Refutación considerada:** el mapa `operadorPorNombre` sí cachea por nombre — el bucle no repite nombres. El problema no es la caché: es que cada miss paga la tabla completa de operadores, y en el archivo real casi todos los nombres son miss la primera vez.

---

### H4 — ALTO · `getOperadoresDetalle` trae TODOS los viajes y TODAS las liquidaciones del tenant para pintar totales por operador: crece sin tope con la vida del tenant y la página muere al cruzar 100,000 filas

**Evidencia:** `src/lib/likida/analytics.ts:1190-1212` — tres `traerTodo` en `Promise.all`: operadores (bien, son ~750), pero también `viaje` completo (`id, operador_id, anticipo`, sin filtro de estatus ni fecha) y `liquidacion` completa (`viaje_id, total_comprobado`). Lo consume `/dashboard/operadores` (`page.tsx:32`) para pintar sumas por operador — una agregación que la base haría con un `group by`.

**La suma:** a 750 camiones × ~4 viajes/mes = 36,000 viajes/año → 36 páginas seriales de viaje + ~36 de liquidación (corren en paralelo entre sí, las páginas de cada una en serie): **~11s de carga de página al año uno, ~22s al año dos**, creciendo linealmente para siempre; y al cruzar 100,000 viajes (~2.8 años, o antes si el ritmo es mayor) `traerTodo` lanza `LecturaIncompleta` y la página entera cae al error boundary hasta que alguien la reescriba en SQL. Ninguna ventana de fecha lo acota: el detalle "vitalicio" del operador cuesta la tabla vitalicia.

**Refutación considerada:** `traerTodo` lanza A PROPÓSITO en vez de recortar en silencio — correcto y mejor que el recorte. El hallazgo no es el contrato de `traerTodo`: es traer 100,000 filas para pintar 750 renglones de totales, con el acantilado documentado (`pg.ts:46-48`: "un tenant que las pase necesita un `sum()` en SQL") esperando en una fecha calculable.

---

### H5 — ALTO · El JOIN del consolidado lee sus candidatos con una consulta SIN paginar ni contar: PostgREST la recorta a 1,000 en silencio y el cruce queda ciego justo a la escala del PoC

**Evidencia:** `src/lib/likida/intake/consolidado.ts:241-247` — `.from('gasto').select(...).is('cfdi_uuid', null).gte('fecha', ...).lte('fecha', ...)` sin `traerTodo`, sin `range`, sin `count`, sin `limit` propio. Es exactamente el patrón que `costos.ts:252-272` documenta como "el quinto camino" y que `pg.ts:38-44` existe para impedir — aquí, en el módulo estrenado para el PoC de peajes.

**La suma:** 750 camiones × ~8 cargas y cruces al día generan >6,000 gastos en el rango de fechas de un consolidado mensual. PostgREST entrega 1,000 (`max_rows`) sin error ni log; `conciliarLineas` cruza las líneas contra el 16% del fondo real. Las líneas cuyo gasto quedó fuera del recorte salen `por_conciliar` con candidatos incompletos o vacíos — "revisa a mano" inflado ~6×, y el contador revisa a mano lo que el JOIN habría ligado solo. El costo del agente se multiplica justo cuando más gastos hay que cruzar, que es el modo de falla que este repo dice perseguir.

---

### H6 — ALTO · El Inicio barre tablas completas del tenant en cada visita: a 750 camiones son ~30s de carga con cientos de consultas, y los widgets van muriendo por orden de crecimiento de sus tablas

**Evidencia:** `src/app/dashboard/inicio-contenido.tsx:83-120` lanza 15 lecturas en `Promise.all` (bien paralelizadas), pero varias son `traerTodo` sin ventana: `getKpis` sin `ventanaDias` → TODAS las liquidaciones (`analytics.ts:182-193`); `detectarAnomalias` → TODOS los gastos (`analytics.ts:337-349`); `getViajesPorMes` → TODOS los viajes (`analytics.ts:582+`).

**La suma:** a 750 camiones, `gasto` crece ~30,000 filas/mes y cruza 100,000 en ~3.5 meses. Desde entonces, CADA visita al Inicio: `detectarAnomalias` pagina 100 páginas seriales (~30s), lanza `LecturaIncompleta`, y el widget queda en error permanente — 100 viajes de red pagados por visita para terminar en error, todas las visitas, hasta que exista la agregación en SQL. `getKpis` y `getViajesPorMes` siguen el mismo camino meses después. La carga de la página ancla en el más lento: **~30s de wall y 200-500 consultas a Supabase por vista del dashboard principal.**

**Refutación considerada:** hoy, con la flota demo, el Inicio carga en ~2-3s y nada de esto se ve — por eso es hallazgo de escala y no incendio activo. Pero la fecha en que empieza es función del ritmo de gasto del primer cliente grande, no de un cambio de código, y el primer síntoma será "el panel tarda medio minuto" en la semana del PoC.

---

### H7 — MEDIO · Las colas de cobranza recortan sin `order`: `vigilados` afirma un total que es un subconjunto arbitrario, y el barrido global puede saltarse tenants en silencio

**Evidencia:** `src/lib/likida/agentes/cobranza.ts:105-111` — `colaCobranza` lee viajes vivos con `.limit(500)` y SIN `.order()`: con >500 abiertos (750 camiones lo cruzan), cuáles 500 entran lo decide Postgres, y `vigilados: viajes.length` (línea 131) pinta "500" en pantalla como si fuera el total vigilado. Y `ejecutarCobranzaGlobal` (líneas 256-263) deriva los tenants de `.select('tenant_id').limit(1000)` sin `order` ni `distinct` en SQL: cuando UNA flota grande aporta 1,000+ filas de viajes vivos, las demás flotas pueden quedar fuera de la corrida de esa hora sin log ni error.

**Consecuencia:** viajes atorados que nunca entran a la cola (el sort por días se hace DESPUÉS del recorte, así que el recorte no prefiere a los más viejos), y un contador de pantalla que afirma de menos. El costo está acotado — el problema es qué 500 y qué tenants, decidido por azar del plan de consulta.

---

### H8 — MEDIO · El mapa re-renderiza ~1,400 nodos SVG en cada movimiento de mouse, y su KPI "Viajes en curso" cuenta sobre el tope de 100 sin rotularlo

**Evidencia:** `src/app/dashboard/mapa/mapa-vivo.tsx:75-77` — los 987 puntos de `PUNTOS_MEXICO` se pintan como 987 `<circle>` individuales dentro del componente con estado; cada `onMouseEnter`/`onMouseLeave` (líneas 84-85, 146) hace `setState` → React reconcilia los 987 círculos estáticos + hasta 100 arcos × 4 nodos + 100 cards en cada evento de hover, que dispara continuamente al pasear el mouse. Sin `memo`/`useMemo` sobre la capa estática. En una laptop va; en la tablet del jefe de tráfico con 100 viajes vivos es jank medible en el único widget "wow" del demo.

**El KPI:** `mapa/page.tsx:43` alimenta todo desde `getViajes(tenantId)` = los 100 más recientes; `vista.tsx:35` pinta "Viajes en curso: N" con la nota "abiertos o en cuadre". Con 750 camiones y >100 vivos, el KPI y el mapa muestran un subconjunto sin decirlo — la página de Viajes sí rotula su tope (`cargados`); el mapa no. La refutación del encargo ("el tope de 100 está rotulado en pantalla") aplica a `/dashboard/viajes`, no aquí.

---

### H9 — MEDIO · `getDesglosesRecibidos` recorta 2,000 líneas SIN `order`: la "bitácora de los más recientes" no está garantizada de contener a los más recientes

**Evidencia:** `src/lib/likida/analytics.ts:1543-1547` — `.from('cfdi_consolidado_linea').select(...).limit(2000)` sin `.order()`; el sort por `recibido` ocurre en memoria DESPUÉS del recorte (línea 1569). El comentario (1539-1541) promete "si una flota la rebasa, los más viejos salen de esta bitácora" — sin `order`, quién sale lo decide el plan de consulta, no la fecha. A escala 750 (H1: un corte semanal ya rebasa 2,000 líneas), la bitácora del agente de Peajes puede enseñar 8 consolidados viejos y omitir el de ayer. El group-en-memoria de 2,000 filas en sí es barato (<10ms) — el problema es qué 2,000.

---

### H10 — BAJO · La contabilidad del peor caso del cierre cita un dato vencido: `sendText` ya NO es "fetch pelado a 300s"

**Evidencia:** `src/lib/likida/presupuesto.ts:67-70` afirma que "los `sendText`/`sendDocument` de `meta/client.ts` siguen usando `fetch` pelado, y ahí el techo es el default de undici: 300s". Falso desde la auditoría 8: `meta/client.ts:17` impone `SEND_TIMEOUT_MS = 10_000` con `AbortSignal.timeout` en todos los envíos (líneas 94, 193, 245, 339). El error es a favor (el peor caso real es MEJOR que el documentado), pero la tabla que el repo usa para razonar presupuestos razona con un techo 30× mayor al vigente — la próxima decisión de margen que se tome leyendo ese comentario partirá de un dato falso.

### H11 — BAJO · Dos páginas encadenan lecturas independientes en serie

`src/app/dashboard/agentes/proveedores/page.tsx:46-47` (`listarFacturasProveedor` → `getFiscalDeFlota`, independientes, ~0.6s en serie por ~0.3s en paralelo) y `src/app/admin/costos-facturacion/page.tsx` (3 awaits seriales). Sumas chicas; contraste con el patrón correcto que las demás páginas nuevas ya usan.

---

## Lo que revisé y está bien

- **El presupuesto del webhook es la mejor pieza del repo:** `PASOS_CIERRE` suma 8.9s verificados contra `MARGEN_CIERRE_MS` = 12s por prueba (`presupuesto.ts:37-54`); `PRESUPUESTO_WEBHOOK_MS` = 120s amarrado al `maxDuration` por otra prueba; `crearPresupuesto` reparte el mismo reloj entre etapas y `senal()` devuelve señal ya abortada cuando no queda nada (líneas 222-229).
- **`acotada` en dos capas** (abortSignal + carrera con temporizador, `presupuesto.ts:148-169`), aplicado también fuera de `repo.ts` (costos, conv, config, consolidado, importar_viajes). El fallo entra por el mismo camino `{ data, error }` que ya está probado.
- **Los envíos de WhatsApp tienen techo de 10s y las descargas 15s** (`meta/client.ts:10,17`) — cerrado el ALTO reincidente de la auditoría 8.
- **El costo de IA se mide de verdad:** `costoReal` prefiere el costo del proveedor (ve la caché de prompt, medida -91.6%); modelo sin precio se estima con la tarifa MÁS CARA y grita (`openrouter.ts:195-209`); el consumo de intentos fallidos viaja EN el error y se acumula (`gastado`/`cobrar`); `costoPorModelo` parte la fila cuando el ciclo cruzó de proveedor; `registrarCosto` rechaza NaN/negativos y `getResumenCosto` agrega en SQL (mig. 0064) con unión discriminada que no deja pintar ceros no medidos.
- **El chat del panel tiene anti-quemadura completa:** abort a 40s dentro de una ruta de 60s (`analista.ts:313-314`), 5 rondas, 900 tokens, tope de presupuesto diario en la ruta (`chat/route.ts:79`), modelo barato (flash-lite) tras medir que el salto a nano no pagaba, caché de prompt Anthropic en el system del cuadre, y caché de tools de lectura con llave consciente de tools sin parámetros (`llaveDeCache`) — medido, no supuesto.
- **`cron/facturar` sí sabe de su reloj:** `PRESUPUESTO_LOTE_MS` derivado del `maxDuration` real (misma constante, no copia) y corta cuando no cabe — el contraste con `cron/escalar` (H2) es la prueba de que el patrón existe y es aplicable.
- **El loop-guard corta ANTES de pagar la última ronda** (`openrouter.ts:779-781`): no se ejecutan tools cuyo resultado nadie va a leer.
- **La escalación y la cobranza reclaman ANTES de mandar** (claim con UPDATE condicional / INSERT único): corridas solapadas del cron at-least-once no duplican mensajes. El costo del claim está bien gastado; lo que falta es el reloj (H2).
- **`importarViajes` inserta en lotes de 100** con reporte de qué lote falló — la mitad de la escritura está bien; la de la lectura no (H3).
- **`getEventosConductores` está acotado a 60 viajes y rotulado como bitácora**, `bitacoraCobranza` a 12, `getHechosSolos` a 8, `getLiquidaciones` a 50: las bitácoras nuevas sí piensan en el tope.
- **Las páginas nuevas paralelizan:** cobranza, conductores, peajes e Inicio usan `Promise.all`. La acusación del encargo ("5-8 queries en serie") NO se sostiene contra las páginas de hoy — lo verifiqué página por página; solo cayeron las dos de H11.
- **El mapa no depende de tiles ni APIs** (geometría horneada, `mexico-geo.ts`): cero costo por vista y carga sin red. El costo es solo el re-render (H8).

## Lo que NO alcancé a revisar

- `pruebas-manuales/*` (prohibido — pago real) y cualquier medición en vivo: las cifras de este reporte son sumas de peor caso con los costos unitarios declarados por el repo, no trazas de producción. La latencia real Vercel↔Supabase sigue sin medir (el propio `presupuesto.ts:97-99` lo admite).
- El render real del mapa con 100 arcos en hardware modesto (no corrí navegador; H8 es aritmética de nodos, no un perfil).
- `dashboard/agentes/liquidacion` y `facturas` (v2 de ayer) a fondo, y `despacho_wa.ts` por dentro — les pasé la lupa de consultas-en-bucle por grep sin hallazgo obvio, no lectura línea a línea.
- El costo de generación del PDF y el tamaño del bundle cliente del panel v3.
- Confirmar el `maxDuration` efectivo de las páginas sin declaración (server actions de importar/peajes/cobranza): el repo solo tiene verificado "pro, tope 300s" (`presupuesto.ts:183`) y `cron/facturar/cola` declara 600 — el default real del proyecto hay que leerlo en el panel de Vercel, al que esta sesión no entra.
