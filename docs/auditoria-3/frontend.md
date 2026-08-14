# Frontend — auditoría 3

**Nota: 7/10** (antes 7). Razón del movimiento: se atacó y subió la base (estados pintados a propósito, mapas derivados del tipo, guardias de contraste/dinero/etiquetas en verde) — pero la superficie nueva de hoy trae dos ALTOs propios que aparecen exactamente a la escala del prospecto de 750 camiones. Se compensan: la nota no se mueve.

Riesgo mayor del rubro hoy: **las páginas nuevas reusan `getViajes` (ventana de 100 filas de tabla) como si fuera el universo** — los KPIs de Conductores y Mapa divergen de los de Viajes en cuanto el PoC importe más de 100 viajes, sin que ninguna nota lo declare.

## Hallazgos

### [ALTO] La bandeja de la oficina pinta "$0.00" como monto de un comprobante que el OCR no pudo leer — y deja adjuntarlo a un viaje vivo
`src/app/dashboard/huerfanos/vista.tsx:78` · `src/app/dashboard/huerfanos/page.tsx:85` · `src/lib/likida/repo.ts:399`
Escenario: el proveedor de visión se cae → el processor guarda el huérfano con `monto: 0` y motivo `fallo_ocr` (`processor.ts:567-573`, comentario textual: "adjuntarlo metería una línea de $0.00 en la liquidación del contralor, que es una cifra que nadie midió"). La bandeja de oficina lo lista con **Monto "$0.00"** (`mxn(h.monto)` sobre `Number(g?.monto ?? 0)`) junto a "La foto no se pudo leer completa", y el botón Adjuntar funciona: `adjuntar` (page.tsx:64-101) no filtra por monto, `addGasto` (repo.ts:141-172) no valida, y la base no tiene `CHECK (monto > 0)` a propósito (migs. 0019:27, 0025:42). El gasto de $0.00 entra al viaje; el motor lo marca `monto_invalido` y fuerza el viaje a revisión — la línea de $0.00 llega al detalle que el contralor lee.
Consecuencia: el contralor ve un cero que parece medición en una columna de dinero (violación directa de la regla #1 del producto), y con un clic ese cero entra a la liquidación. El flujo gemelo de WhatsApp SÍ tiene el guardia (`processor.ts:1683` filtra `h.gasto.monto > 0`); el de la oficina no.
Causa raíz probable: la bandeja de oficina (F2) se construyó sin replicar el filtro `monto > 0` que el camino de WhatsApp ya documentaba como obligatorio.
(No es CRÍTICO solo porque el motor ataja el $0.00 aguas abajo con `monto_invalido` → revisar; el rótulo falso en pantalla sí es inmediato.)

### [ALTO] KPIs y colas construidos sobre la ventana de 100 de `getViajes` sin declararla — cifras distintas para lo mismo en pantallas hermanas
`src/app/dashboard/agentes/conductores/page.tsx:34-64` · `src/app/dashboard/mapa/page.tsx:43-44` + `mapa/vista.tsx:35` · `src/app/dashboard/huerfanos/page.tsx:50-62,79-82`
Escenario: el kit del PoC importa 180 viajes del TMS (`importar_viajes.ts:216` los crea `abierto`). `/dashboard/viajes` dice "Abiertos 180" (usa `contarViajes`, conteo directo) y declara su ventana ("La tabla enseña los 100 viajes más recientes…", `viajes/vista.tsx:152-155`). Pero `/dashboard/agentes/conductores` dice "Viajes en curso **100**" (`getViajes` sin límite explícito = 100, `analytics.ts:931`; los KPIs vivos/aceptados/esperan se derivan de ese arreglo) y `/dashboard/mapa` dice "Viajes en curso **100** · abiertos o en cuadre" — dos cifras distintas para el mismo dato, sin nota alguna. Peor en huérfanos: el `<select>` "Elegir viaje…" solo ofrece viajes dentro de los 100 recientes, así que un comprobante de un viaje abierto viejo **no se puede resolver desde la oficina** y nadie dice por qué; y el re-check `destinoOk` (page.tsx:79-82) rechaza con "Ese viaje ya no está abierto" un viaje que SÍ está abierto pero salió de la ventana.
Consecuencia: el contralor cruza dos pantallas y ve dos totales distintos el primer día del PoC; la oficina no puede acomodar comprobantes de viajes viejos y recibe un mensaje falso.
Causa raíz probable: reuso de `getViajes` (ventana de tabla) como universo; el repo ya tiene los dos patrones correctos (`contarViajes` para KPIs, `traerTodo` en `getTableroOperacion` — Despacho lo hace bien).

### [MEDIO] La vigencia de la licencia se pinta sin año
`src/app/dashboard/operadores/vista.tsx:139,141`
Escenario: licencia federal que vence 2029-05-03 → pill "E · vigente hasta 03 may" — ¿de qué año? Una vencida en 2025 dice "vencida 03 may", indistinguible de una vencida este año. `PillLicencia` usa `fechaCorta`, que se documenta para rangos "donde el año ya es obvio por contexto" (`formato.ts:156-160`) — en una vigencia plurianual no lo es.
Consecuencia: el contralor no puede decidir renovaciones con la pantalla; la parte de la fecha que decide (el año) es la que se recorta.
Causa raíz probable: se eligió `fechaCorta` por espacio donde tocaba `fechaMx`.

### [MEDIO] El mapa rotula "En ruta" (con camión animado) viajes en_cuadre que ya volvieron
`src/app/dashboard/mapa/mapa-vivo.tsx:158-161` · `src/app/dashboard/mapa/page.tsx:44`
Escenario: viaje en `en_cuadre` (el chofer ya regresó y se está liquidando) → su card pinta la pill verde "En ruta" y, al seleccionarlo, el camión animado recorre el arco. La leyenda de honestidad de la página cubre el trayecto ilustrativo ("Likida no rastrea GPS"), pero no este rótulo: "En ruta" afirma un estado que la base contradice (`viaje.estatus = 'en_cuadre'`).
Consecuencia: el jefe de tráfico ve "en ruta" una unidad que está en el patio; en el demo, un prospecto que conozca sus propios viajes lo detecta al primer vistazo.
Causa raíz probable: el binario escalado/no-escalado se pintó como si fuera el estatus del viaje.

### [BAJO] Conteos post-acción impresos crudos, fuera de `lib/formato`
`src/app/dashboard/agentes/peajes/subir.tsx:40-42` · `src/app/dashboard/agentes/cobranza/controles.tsx:74-77`
Escenario: consolidado mensual de una flota grande con 1,024 líneas → el resumen del cruce dice "Cruce corrido: 823 de 1024 líneas" (JSX crudo, sin separador de millares) en la misma pantalla cuyos KPIs dicen "1,024" vía `numero()`. La prueba guardián de formato no lo ve: escanea `toLocaleString`, no números interpolados directo.
Consecuencia: dos formatos para la misma cifra en la misma pantalla — el patrón exacto que `formato.ts` existe para impedir.
Causa raíz probable: los resúmenes de los client components imprimen el número directo en vez de pasar por `numero()`.

## Lo que revisé y está bien

- **Mapas literales contra tipos de motor (el trabajo obligatorio del rubro)** — todos derivan del tipo o caen a crudo visible, nunca a blanco: `EVENTO` tipado `Record<EventoConductor['tipo'],…>` (`agentes/conductores/vista.tsx:20` vs `analytics.ts:877-887`); `MOTIVO` tipado `Record<MotivoHuerfano,…>` con fallback crudo (`huerfanos/vista.tsx:11-15,80`); `PillEstado` de proveedores cubre los 3 estados y la base los cierra con CHECK (`0091:35-36`); `PILL_ESTATUS` de viajes con fallback a clave cruda (`viajes/vista.tsx:115`) sobre el dominio cerrado `viaje_estatus_dominio`; `TIPO_DIFERENCIA`/`ESTATUS` de liquidación con fallback (`agentes/liquidacion/vista.tsx:13-18,296-300,318`); `PillAviso` compartido entre Despacho y Viajes en un solo módulo (`despacho/vista.tsx:218-226`).
- **Estados vacío/cargando/error pintados a propósito** en las 8 páginas nuevas: primarios fallan cerrado (cobranza `page.tsx:52-56`, proveedores `page.tsx:46`, huérfanos `page.tsx:50`), secundarios degradan a leyenda honesta ("No se pudo leer… ahora mismo") distinta del vacío real; el mapa lista aparte lo que no pudo ubicar con sus palabras (`mapa/page.tsx:53-58`).
- **Validación de la estrategia de cobranza**: `validarConfigCobranza` cierra tiers vacíos/duplicados/fuera de rango, ventana invertida y cero días (`cobranza_pura.ts:42-69`); fila corrupta cae a defaults y grita (`cobranza.ts:51-54`); la vista previa es literalmente el motor puro en el navegador (`estrategia.tsx:151-159`) — sin segundo armado que diverja.
- **Formato**: `mxn/numero/fechaCorta` de `lib/formato` en todas las páginas nuevas; date-only sin corrimiento de día (`formato.ts:146-152,161-170`).
- **Keys de React estables por id de entidad en toda tabla de dinero** (`proveedores/vista.tsx:91`, `viajes/vista.tsx:117`, `cola-jefe.tsx:55`, `huerfanos/vista.tsx:67`); los `key={i}` restantes son bitácoras server-rendered de solo lectura sin reorden en cliente.
- **Contraste y tema**: tokens medidos por prueba guardián que lee el CSS real (`contraste.test.ts`); claro/sistema/oscuro con anti-FOUC (`layout.tsx:52`) y "sistema" resuelto en cliente con listener en vivo (`selector-tema.tsx:26-57`); jerarquía ink>ink2>muted>faint conservada en oscuro (`globals.css:117-145`).
- **Dinero por área**: viajes/operadores/mapa/conductores dejan el peso en el servidor a propósito y el escaneo `dinero_por_area.test.ts` cubre page+vista; toda ruta nueva está clasificada en `visibilidad.ts:75-128` (default niega) y el sidebar filtra con la MISMA función (`sidebar-nav.tsx:90`).
- **Errores a pantalla**: boundary con digest seleccionable y log (`dashboard/error.tsx:66-70`); ninguna action devuelve un stack — todos los mensajes están escritos para pantalla y los `catch` loguean el detalle en servidor.
- **Acciones peligrosas**: "Ejecutar ahora" de cobranza con confirmación en dos pasos y resultado con fallos a la vista (`controles.tsx:44-84`); descartar huérfano con confirmación (`huerfanos/acciones.tsx:32-43`); "Ya quedó" de facturas valida UUID, ancla tenant y no pisa factura amarrada (`facturas/page.tsx:47-91`).
- **Alertas del inicio no afirman en falso**: `null ≠ 0` en escalados y huérfanos (`inicio-contenido.tsx:116-119,154-165`).
- **Export de proveedores**: doble puerta (área + verbo), tope de 5,000 dicho en vez de recortar callado (`api/export/facturas-proveedor/route.ts:26-43`).
- **Ancla vieja (40-auditoria-codigo.md)**: el hallazgo 2.2 (estímulo de peaje presentado sin sus condiciones) quedó atendido en pantalla — la sección RMF 9.1.8 de peajes declara qué cumple y qué no, y rotula el monto como bruto y acumulable (`agentes/peajes/vista.tsx:142-162`). Nada de esa ola sigue vivo en este rubro.

## Lo que NO alcancé a revisar

- **El render real (mirar, no medir)**: prohibido correr `npm run build`/screenshots en fase de auditoría. En particular queda sin verificar mirando la grilla de 7 columnas de `ColaJefe` (`cola-jefe.tsx:57`) que no tiene contenedor `overflow-x-auto` — en anchos angostos podría desbordar la card.
- **`/admin/**` a fondo** — el delta de hoy fue `/dashboard`; solo verifiqué los componentes compartidos que las páginas nuevas importan (`EstadoVacio`, gráficas).
- **`chat.tsx` (951 líneas)** — solo skim del manejo de errores del stream NDJSON (se ve defensivo: todo `JSON.parse` con catch, estados `'error'` distintos de vacío); sin lectura línea a línea.
- **`combustible-casetas/page.tsx` (313 líneas)** — solo la vista de líneas por conciliar; su forma "Resolver" no tiene estado pending (doble submit posible, servidor presuntamente idempotente).
- **Compatibilidad de `offset-path`/`offset-distance`** (el camión animado, `mapa-vivo.tsx:106`) en Safari viejos — requiere navegador real.
- **`[id]/page.tsx`** (detalle de liquidación) — pre-existente y cubierto por las pruebas guardián de etiquetas.
