# Frontend — auditoría 4

**Nota: 5/10** (antes 6). Razón del movimiento: **deuda que cobró factura**.
Verifiqué los **diez** hallazgos abiertos del pase 3 uno por uno contra el árbol
de hoy (`f72d7ab`, master ya mergeado): **los diez siguen ahí, en el mismo
archivo, en la misma línea o a un puñado de líneas de distancia.** Ninguno se
tocó. Encima llegaron tres pantallas nuevas —Copiloto, Aprobaciones, Panel de
agentes— y **ninguna trae una sola prueba** (`npx vitest run src/app/dashboard
src/app/admin` → 22 archivos, 182 pruebas, cero de ellas toca
`admin/copiloto.tsx`, `admin/aprobaciones/`, `admin/agentes/contenido.tsx`,
`admin/flotas/senales-pmf.tsx` ni `admin/charts.tsx`). De esa superficie nueva
salieron tres ALTOS. Y al abrir por fin `admin/charts.tsx` —que el pase 3
declaró explícitamente sin auditar— encontré que la dona no dibuja nada cuando
tiene un solo segmento, que es justo el estado en el que va a estar el demo.

Lo que sí subió: `senales-pmf.tsx` y `admin/aprobaciones/page.tsx` son de los
bloques mejor escritos del repo en cuanto a "los tres estados dichos a
propósito" — lo detallo abajo. No alcanza para sostener el 6 cuando el conteo
de cosas que el comprador puede ver mal subió en vez de bajar.

**El riesgo mayor hoy:** el Resumen —la primera pantalla del demo— estrena un
banner que compara una semana ISO **a medias** contra una semana **completa** y
rotula esa resta como "vs periodo anterior". Un lunes, una flota que va a su
ritmo normal ve "↓ 71.4%" en rojo bajo su propio dinero.

---

## Hallazgos

### [ALTO] `BannerInsight` compara la semana en curso (parcial) contra la anterior (completa) y lo rotula "vs periodo anterior"
`src/app/dashboard/inicio-contenido.tsx:207-209` × `:278` × `src/lib/likida/analytics.ts:443-453` (`ultimasSemanas`) × `:546-570` (`getLiquidadoPorSemana`)

El banner nuevo del 16-ago saca sus dos números de los **buckets de semana
ISO** de la gráfica "Liquidado":

```
const bucketsLiq = liquidadoSemanalSeries?.semanal ?? [];
const liqSemanaActual   = bucketsLiq[bucketsLiq.length - 1].valor;   // ← semana ISO EN CURSO
const liqSemanaAnterior = bucketsLiq[bucketsLiq.length - 2].valor;   // ← semana ISO COMPLETA
```

`ultimasSemanas(5, hoy)` genera el último bucket con `semanaIso(hoy)`: la semana
que contiene HOY, no la última semana cerrada. `getLiquidadoPorSemana` suma
`liquidacion.total_comprobado` dentro de ese bucket, así que el último solo
contiene los días transcurridos.

Escenario con valores: flota que liquida ~$100,000 por semana de forma pareja
(~$14,300/día). **Martes 18-ago-2026**, semana ISO en curso con 2 días
corridos → `liqSemanaActual = $28,600`; semana anterior completa →
`liqSemanaAnterior = $100,000`. `pctCambio(28600, 100000) = -71.4`. El banner
pinta, en `--bad` sobre `--badbg`:

```
● ESTA SEMANA  Tu flota liquidó $28,600.00 en viajes cerrados   ↓ 71.4% vs periodo anterior
```

Nada bajó. La flota va exactamente igual. El lunes por la mañana la cifra es
peor todavía (un día contra siete → −85.7%), y el domingo por la noche el mismo
banner sale en verde por la razón inversa.

Peor: **en la misma pantalla, tres tarjetas más abajo**, `KpiPeriodo` imprime la
frase *idéntica* ("vs periodo anterior") sobre una base **distinta y correcta**:
`getSeriesKpiCards` (`analytics.ts:157-161`) pide `getSerieComparativa(tenantId,
7, 2)`, o sea **ventanas rodantes de 7 días** — 7 días terminando hoy contra los
7 previos, que sí son comparables. El mismo martes, "Gasto total" puede decir
"↑ 3%" mientras el banner de arriba dice "↓ 71.4%" del mismo negocio y del mismo
periodo nominal.

Consecuencia: el contralor lee una caída de tres cuartas partes de su
liquidación semanal que nadie midió. Rompe las dos reglas duras de CLAUDE.md a
la vez — la cifra no es una medición y el rótulo "vs periodo anterior" no es
verdad, porque los dos periodos no son del mismo largo. Es la primera pieza
visible del Resumen, arriba incluso de las alertas.

Causa raíz probable: el banner reusó los buckets de la gráfica (donde una barra
parcial se lee bien porque es la barra de hoy) como si fueran periodos cerrados
comparables; `pctCambio` no puede saber que las dos bases tienen distinto largo.

---

### [ALTO] La dona no dibuja NADA cuando tiene un solo segmento — y la leyenda de al lado dice "100%"
`src/app/admin/charts.tsx:194-207` (`pathRebanada`) × `:224` × `:234` · llamadores: `src/app/admin/model-ops/page.tsx:94`, `src/app/dashboard/agentes/liquidacion/vista.tsx:204`, `src/app/admin/consola.tsx:491`, `src/app/admin/analitica/page.tsx:81`, `src/app/admin/costos-facturacion/page.tsx:242`

Con `segmentos.length === 1`, `gap = 0` (`:234`) y `pasos = [1]` (`:224`), así
que la única rebanada se pide de 0° a 360°. `puntoEnCirculo(r, 0)` y
`puntoEnCirculo(r, 360)` devuelven **el mismo punto** (cos/sin de −90° y de 270°
son idénticos, y el redondeo a 3 decimales los iguala como string). El path que
sale es, verificado ejecutando la función tal cual está en el archivo:

```
M 96 6  A 90 90 0 1 1 96 6   L 96 30  A 66 66 0 1 0 96 30  Z
```

Por la spec de SVG, un segmento de arco cuyo punto final es igual al punto
actual **se omite entero**. Los dos arcos desaparecen y el path se reduce a
`M 96 6 L 96 30 Z`: una línea de área cero. **No se pinta nada.**

Escenario con valores, hoy mismo: `/admin/model-ops` con una sola fase que haya
gastado (`r.porFase = [{ fase: 'ocr', costoUsd: 12.40 }]`, exactamente el estado
de una base pre-revenue donde solo corrió el OCR). La tarjeta "Costo por fase"
pinta el **anillo gris de fondo** (`:239`, `stroke: var(--line)`) y, a su
derecha, la leyenda:

```
● Agente OCR   100%
```

Un círculo vacío junto a una leyenda que afirma que ese círculo está lleno. Lo
mismo en `/dashboard/agentes/liquidacion` cuando `extra.porTipo` trae un solo
tipo de diferencia (`[{ tipo: 'sobre_politica', monto: 18400 }]`, el caso más
común de una flota que apenas empieza): la dona "Dinero observado" sale hueca
con "Sobre política · 100%" al lado y $18,400.00 en el desglose de abajo.

Con dos o más segmentos NO pasa: `gap = 2.4°` corre los ángulos y los extremos
dejan de coincidir. Por eso el bug es invisible en cuanto hay datos variados, y
solo aparece en el estado en el que va a estar el producto en la sala.

Consecuencia: la tarjeta que existe para demostrar que el agente trabajó se ve
rota justo cuando hay un solo dato, que es el escenario del demo. `charts.tsx`
no tiene ni una prueba, y el pase 3 lo dejó declarado como no auditado — nadie
lo iba a cazar.

Causa raíz probable: `pathRebanada` se escribió para el caso de N rebanadas con
separación; el caso degenerado de 360° exactos no tiene rama propia y el `gap`
que accidentalmente lo salvaba se anula cuando hay un solo segmento.

---

### [ALTO] El chip "Fuentes: Corridas" del Copiloto lleva a un 404 que expulsa a Javier de `/admin`
`src/app/admin/copiloto.tsx:90` · `src/app/admin/corridas/` no tiene `page.tsx` (solo `[id]/page.tsx`)

`PANTALLA_UI` mapea `traza_corrida: { ruta: '/admin/corridas', etiqueta: 'Corridas' }`.
Bajo `src/app/admin/corridas/` solo existe `[id]/page.tsx`; **no hay
`page.tsx`** en el segmento padre, y `next.config.ts` no declara `redirects` ni
`rewrites`. Lo verifiqué barriendo TODOS los literales `/admin…` y `/dashboard…`
de `src/app`: `/admin/corridas` es el único que no resuelve a una página.

Escenario: Javier abre `/admin/copiloto` y pregunta "¿por qué falló la corrida
de cobranza de anoche?". El agente llama `traza_corrida`; el cliente deriva las
fuentes de `d.toolsUsadas` (`copiloto.tsx:328-336`) y pinta la pastilla
**Fuentes: Corridas ↗**. Un clic y cae en `src/app/not-found.tsx`: pantalla
completa, "Error 404 — Esta página no existe", **fuera del layout de /admin** (se
pierde el sidebar, el `.tema-neutro` y la sesión visible), y con una sola salida:
un link "Ir al panel" que apunta a **`/dashboard`**, o sea al panel del CLIENTE,
no a la consola de la que venía.

Consecuencia: la promesa que el propio Copiloto imprime en su pantalla vacía
("Toda cifra sale de una consulta real y **trae su pantalla fuente**",
`copiloto.tsx:481-484`) se rompe precisamente en la tool cuyo único propósito es
enseñar la traza. En un demo, la pieza estrella del producto contesta con un
404 de pantalla completa.

Lo reporto como ALTO y no MEDIO porque el modo de falla es **silencioso para el
repo**, no para el usuario: no hay lint, ni prueba, ni tipo que lo cace, y el
reporte del pase 3 certificó "cero rutas muertas" — esa afirmación ya es falsa y
nada avisó. Si el criterio de quien recalifica es "un 404 se nota, luego es
MEDIO", bájenlo; el hecho está verificado igual.

Causa raíz probable: `PANTALLA_UI` es un mapa literal escrito a mano contra
rutas imaginadas (`observabilidad/page.tsx:173` sí construye
`/admin/corridas/<id>`, que existe); nadie comprobó que el segmento padre fuera
navegable por su cuenta.

---

### [ALTO] La cola de salida de Aprobaciones DESAPARECE cuando su consulta falla — sin una palabra
`src/app/admin/aprobaciones/page.tsx:32` × `:118`

La página se escribió con el criterio correcto y lo dice en su propio
comentario (`:27-28`): *"Cada lectura cae POR SU LADO … y 'no se pudo leer'
jamás se pinta como 'no hay nada'"*. Las **dos bandejas** lo cumplen: capturan
el error en un objeto `{ok, error}` (`:30-31`) y pintan "No se pudo leer ESTA
bandeja — no significa que esté vacía" (`:84-86`).

La tercera lectura no:

```
aprobadasSinEnviar().catch(() => null),          // :32
…
{porEnviar !== null && porEnviar.length > 0 && ( // :118
```

`null` (falló) y `[]` (no hay nada) producen **exactamente el mismo render**:
nada. La sección entera "Aprobadas por enviar" no se dibuja.

Escenario con valores: hay 12 piezas en `cola_aprobacion` con `estado =
'aprobado'` e `enviado_en IS NULL` — 12 correos de prospección que Javier ya
aprobó y que están esperando el clic de envío. `aprobadasSinEnviar()` lanza
(timeout de PostgREST, la 0117/0120 sin aplicar en ese entorno, un `select` con
el join de `prospecto` caído). `catch(() => null)`. La página carga **entera y
sin un solo aviso**: bandeja urgente "Nada urgente esperando — así debe verse
casi siempre", bandeja normal "Nada pendiente", y donde iba la cola de salida,
aire. Javier concluye que no hay nada que mandar y cierra la pestaña.

Consecuencia: doce correos aprobados a prospectos reales no salen, y la única
pantalla que los muestra afirma implícitamente que no existen. Es el modo de
falla exacto que `exigir()` y el párrafo "Fallar cerrado y decirlo" de CLAUDE.md
existen para prohibir, dentro de una página que lo prohíbe por escrito dos
párrafos más arriba. Aplica igual a `ultimasResueltas(8).catch(() => null)`
(`:33` × `:133`), aunque ahí el daño es menor porque es contexto, no cola.

Causa raíz probable: las dos bandejas se blindaron a propósito (la nota del
auditor externo sobre el SLA en minutos) y las dos lecturas secundarias
quedaron con el `.catch(() => null)` de plantilla, que aquí significa lo
contrario de lo que la página dice hacer.

---

### [ALTO] `StatCard` sigue inventando una comparación: `delta={null}` imprime "0% · sin movimiento" — REINCIDENTE
`src/app/admin/ui/kit.tsx:147-152` · llamadores `src/app/dashboard/inicio-contenido.tsx:338-340` y `:362-363`

Sin cambio alguno desde el pase 3. La rama `delta === null` sigue renderizando
literal `<p …>0% · sin movimiento</p>` (`kit.tsx:152`), y los dos únicos
llamadores del producto —"Ahorro generado — ejercicio 2026" y "Diésel elegible
para el estímulo", ambos en el Resumen— siguen pasando `delta={null}` en vez de
omitirlo, que es lo que el propio comentario del componente (`:148-151`) dice
que hay que hacer para las métricas sin comparativo. Con la base en cero
(14-ago) salen "$0.00" y debajo "0% · sin movimiento".

`kit.test.tsx` (7 pruebas, verdes) sigue sin una sola aserción sobre `delta`.

Consecuencia y causa raíz: idénticas a `docs/auditoria-3/frontend.md`.

---

### [ALTO] "Actividad" sigue sumando sobre 100 filas pegada al conteo exacto de la misma semana — REINCIDENTE
`src/app/dashboard/actividad.tsx:14-28` (`bucketsPorDia`) × `src/app/dashboard/panel-periodo.tsx:70` (`md:grid-cols-3`), `:74-78`, `:87` × `src/app/dashboard/inicio-contenido.tsx:94` × `src/lib/likida/analytics.ts:965` (`getViajes`, `limite = 100`)

Sin cambio. Reverifiqué la cadena completa hoy: `inicio-contenido.tsx:94` sigue
llamando `safe(() => getViajes(tenantId))` sin argumento (tope 100, orden
`created_at desc`), ese arreglo sigue viajando a `PanelPeriodo` y de ahí a
`Actividad`, y sigue montado **en la misma fila de grid** que la dona "Viajes",
cuyo `kpiModo.totalViajes` ahora sale del RPC `serie_comparativa_tenant` (mig.
0112, `analytics.ts:101-135`) — un `count()` en SQL **sin tope**, o sea exacto.

La migración a SQL agrandó el hueco en vez de cerrarlo: antes las dos cifras
salían de bucketeo JS y al menos compartían origen; ahora una es un agregado
exacto de la base y la otra un conteo sobre una ventana de 100 filas, lado a
lado, sin un rótulo que lo declare. Con 20 tractocamiones a 1 viaje/día: dona
"140", barras que suman "100"; en Mensual, 600 contra 100 y 20 de 30 barras en
cero.

Consecuencia y causa raíz: idénticas al pase 3.

---

### [ALTO] El mismo estatus de liquidación sigue ROJO en una pantalla y ÁMBAR en otra, con la severidad invertida — REINCIDENTE
`src/app/dashboard/estatus.ts:19-20` × `src/app/dashboard/agentes/liquidacion/vista.tsx:302-306`

Sin cambio. Las dos copias siguen enfrentadas, verificadas hoy:

| estatus | `estatus.ts` (detalle `/dashboard/[id]:88`) | `agentes/liquidacion/vista.tsx:302-306` (cola del agente) |
|---|---|---|
| `con_diferencias` | `var(--color-warn)` → **ámbar** | `fg: var(--bad)` → **rojo** |
| `revisar` | `var(--color-bad)` → **rojo** | `fg: var(--warn)` → **ámbar** |

`estatus.test.ts` (3 pruebas, verdes) sigue sin poder ver la segunda copia.
Consecuencia y causa raíz: idénticas al pase 3.

---

### [MEDIO] El contador de "Aprobadas por enviar" está capado a 20 y el pill lo presenta como el tamaño de la cola
`src/app/admin/aprobaciones/page.tsx:32` × `:124` × `src/lib/likida/agentes/cola.ts:136`

`aprobadasSinEnviar(limite = 20)` se llama **sin argumento**, así que la
consulta trae 20 filas como máximo (`order resuelto_en asc`, `.limit(20)`). La
página imprime `{porEnviar.length}` en un pill mono junto al título, y renderiza
esas 20 tarjetas — sin un solo rótulo que diga que hay un tope.

Escenario con valores: la propia página titula su bandeja normal *"Normal —
prospección y contenido (**20-40/día**)"* (`:111`). Un día en que Javier aprueba
34 piezas y no alcanza a mandarlas, abre `/admin/aprobaciones` y lee:

```
✉ Aprobadas por enviar   [20]
```

Manda las 20, la sección se vacía, y se va convencido de que la cola quedó
limpia. Quedan 14 correos aprobados sin salir que no vuelven a aparecer hasta
la siguiente carga.

Consecuencia: es el mismo patrón de `ARQ-C1` (conteo capado presentado como
conteo) en una superficie nueva, y aquí el conteo gobierna una decisión de
"¿ya terminé?". Compárese con `/dashboard/viajes/vista.tsx:151-154`, que sí
declara su ventana, y con "Últimas resueltas" de esta misma página, cuyo título
es honesto por construcción.

Causa raíz probable: el default de 20 de `aprobadasSinEnviar` se pensó como
paginado y el llamador lo usó como si fuera la cola entera.

---

### [MEDIO] El campo "Motivo (obligatorio) — queda en la bitácora" del Copiloto llega PRE-LLENADO con texto que escribió el modelo
`src/app/admin/copiloto.tsx:169` × `:225-229` × `src/lib/agents/copiloto.ts:80` (`motivoSugerido`)

```
const [motivo, setMotivo] = useState(a.motivoSugerido ?? '');   // :169
…
<label …>Motivo (obligatorio)
  <input value={motivo} … placeholder="Por qué se apaga — queda en la bitácora" />
```

`motivoSugerido` viene del bloque `accion` que arma la tool `proponer_accion`:
es un campo de texto libre que **el LLM redacta** (`copiloto.ts:80`,
`a.motivo.trim().slice(0, 300)`). La interfaz lo mete en el input y no marca de
ninguna forma que ese texto no lo escribió el humano.

Escenario con valores: Javier teclea *"Apaga el agente de cobranza"*. El modelo
llama `proponer_accion` con `motivo: "Se apaga preventivamente mientras se
revisa el ruido de los recordatorios reportado por la flota Norte"`. La tarjeta
aparece con ese párrafo ya escrito en el campo. Javier lo lee de reojo, pulsa
**Apagar**, y `apagar()` escribe en `bitacora_auditoria` el evento
`interruptor.apagado` con ese motivo y con **el `userId` de Javier**. En la
bitácora queda una justificación de una flota que Javier nunca mencionó,
firmada por él.

Consecuencia: el motivo existe exactamente para que "en tres semanas alguien
sepa si ya se puede encender" (el texto del propio error de validación,
`copiloto.tsx:186`). Un motivo generado por el modelo y atribuido al humano no
sirve para eso, y el diseño de todo lo demás en esta tarjeta —`efecto` y
`revertir` salen del catálogo determinista, no del modelo— demuestra que el
criterio de separar lo determinista de lo generado sí estaba claro; solo este
campo se saltó la regla.

Causa raíz probable: `motivoSugerido` se pensó como ahorro de tecleo y quedó
como valor inicial de un control que la UI presenta como autoría humana.

---

### [MEDIO] La dona "Dinero observado" sigue etiquetando 31 de 33 diferencias con la clave cruda, y su mapa sigue teniendo una clave inexistente — REINCIDENTE
`src/app/dashboard/agentes/liquidacion/vista.tsx:13-18`

Sin cambio. `TIPO_DIFERENCIA` sigue con tres entradas y `sin_comprobar` sigue
sin existir en ningún otro archivo del repo (grep de hoy: **una sola
ocurrencia**, la de este mapa; el valor real es `sin_comprobante`).
`src/types/likida.ts` sigue declarando 33 `TipoDiferencia` y
`getDineroObservadoPorTipo` sigue sin filtrar ninguno, así que el fallback
`t.replaceAll('_',' ')` sigue imprimiendo "cfdi efos" y "alimentacion transporte
sin tarjeta credito" en la leyenda.

Consecuencia y causa raíz: idénticas al pase 3.

---

### [MEDIO] `/admin/model-ops` sigue afirmando "3 fases fijas" con una dona que puede pintar 6 — REINCIDENTE
`src/app/admin/model-ops/page.tsx:11`, `:46`, `:94` × `src/lib/likida/costos.ts:41`

Sin cambio. `FASE_LABEL` sigue con tres entradas en `:11`, el copy sigue diciendo
"Registro de las 3 fases fijas del pipeline" en `:46`, y la dona de `:94` sigue
mapeando `r.porFase` sin filtrar contra `FaseCosto`, que sigue declarando seis
valores (`ocr | cuadre | escalacion | chat | router | whatsapp`). Los otros tres
sitios que pintan la misma dona (`consola.tsx:491`, `analitica/page.tsx:81`,
`costos-facturacion/page.tsx:242`) siguen trayendo las seis etiquetas: cuatro
copias del diccionario, una desincronizada.

Consecuencia y causa raíz: idénticas al pase 3. (Este es además uno de los
llamadores del hallazgo de la dona vacía de arriba.)

---

### [MEDIO] `--faint` y `--muted` siguen reprobando AA sobre `--g1`, y la prueba guardián sigue midiendo el fondo equivocado — REINCIDENTE
`src/app/globals.css:80` (`--faint: #73737c`) × `:177` (`--g1: #f4f4f5` en `.tema-neutro`) · `src/app/dashboard/contraste.test.ts:60-61`, `:90-93`

Sin cambio. Recalculé con la misma fórmula WCAG que usa la prueba del repo:
`--faint` #73737c sobre `--g1` #f4f4f5 = **4.27:1**; `--muted` #6b7280 sobre el
mismo fondo = **4.40:1**. Los dos por debajo de 4.5:1.
`contraste.test.ts:60-61` sigue declarando solo `SUPERFICIE = '#ffffff'` y
`FONDO = '#fbfbfd'`, así que sigue pasando en verde.

El sitio concreto sigue vivo y se movió una línea: `inicio-contenido.tsx:393`
pinta `LEYENDA_CORTA` —el descargo legal— en `text-[11px]` con `--faint` directo
sobre el contenedor `--g1` de `:227`. Se suma uno nuevo: `login/page.tsx:135`
envuelve la pantalla en `.tema-neutro`, así que el aviso "Ábrelo desde este
mismo dispositivo" (`:155`) también cae en `--muted` sobre `--g1`.

Consecuencia y causa raíz: idénticas al pase 3.

---

### [MEDIO] Abajo de 1024px sigue sin haber forma de cerrar sesión en ninguno de los dos paneles — REINCIDENTE
`src/app/dashboard/chrome.tsx:81`, `:88` · `src/app/admin/chrome.tsx:66`, `:73`

Sin cambio. El `<form action={cerrarSesion}>` sigue envuelto en `hidden lg:block`
en los dos chromes, el sidebar sigue sin ocultarse (`marco.ts:22`,
`w-[72px] lg:w-[232px]`), y `/dashboard/mi-perfil` sigue sin ningún control de
salida.

Consecuencia y causa raíz: idénticas al pase 3.

---

### [BAJO] `bucketsPorDia` sigue armando los días con el reloj del entorno — REINCIDENTE
`src/app/dashboard/actividad.tsx:20-26`

Sin cambio: `new Date()` + `setHours(0,0,0,0)` + `toISOString().slice(0,10)`, en
un componente que corre en SSR (`TZ=UTC`) y otra vez en el navegador. Es el
único sitio del panel donde "hoy" se calcula sin `TZ_MX` — compárese con
`inicio-contenido.tsx:256`, que usa
`Intl.DateTimeFormat('en-CA', { timeZone: TZ_MX })`.

---

### [BAJO] Una credencial probada con éxito sigue pintándose en color de advertencia — REINCIDENTE
`src/app/dashboard/conexiones/seccion-credenciales.tsx:126`

Sin cambio: `style={{ color: c.activo ? 'var(--warn)' : 'var(--faint)' }}` decide
el color por `activo` mientras el texto de al lado (`:129-131`) lo decide por
`probadaEn`. "probada el 12 ago" sigue saliendo en el mismo ámbar que "guardada
— sin probar".

---

### [BAJO] "18" y "19" siguen a mano en Carta Porte — REINCIDENTE
`src/app/dashboard/carta-porte/vista.tsx:82`, `:119`, `:123`

Sin cambio: `const listos = 18 - c.faltanTransportista`, `{numero(listos)} de 18`,
`{numero(19 - c.faltanCliente)} de 19`, contra una `CAMPOS_CCP` que sí es
contable en tiempo de render.

---

### [BAJO] La cartera sigue agrupando por NOMBRE de cliente — REINCIDENTE
`src/lib/likida/comercial.ts:219` (`nombrePorId.get(...) ?? '—'`) × `src/app/dashboard/facturacion/vista.tsx:266` (`key={c.cliente}`)

Sin cambio: la cadena del nombre sigue siendo la llave del `Map` de agregación y
además el `key` de React de la fila. Dos `cliente_id` que no resuelven siguen
fundiéndose en un renglón "—" con la suma de los dos saldos.

---

### [BAJO] El Copiloto declara `gateo: 'confirma' | 'doble'` en su tipo y su UI nunca lo lee
`src/app/admin/copiloto.tsx:42` × `:173-186` × `:228-244`

`AccionPropuesta.gateo` se recibe del servidor y se tipa, pero `TarjetaAccion`
solo ramifica por `!a.implementada` (`:173`). Hoy no muerde porque las **cinco**
acciones marcadas `'doble'` del catálogo (`copiloto-acciones.ts:41`, `:51`,
`:56`, `:71`, `:76`) están todas con `implementada: false` y caen en la rama sin
botón. El día que `encender_agente` (🔴 doble: *"Vuelve a soltar al agente sobre
clientes reales"*) o `marcar_pago_conciliado` (🔴 doble: *"MUEVE DINERO"*) pasen
a `implementada: true` —que es un cambio de una línea en un archivo de
catálogo—, la UI las va a renderizar con **el mismo botón único** que
`apagar_agente`, y el gateo doble que `copiloto-acciones.test.ts:28-30` vigila
como "contrato, no default" se pierde exactamente en la capa donde el humano lo
ejerce.

Además, en esa misma tarjeta el rótulo del botón está fijo a `"Apagar"` /
`"Apagando…"` (`:243`) mientras el encabezado sí ramifica
(`a.accion === 'apagar_agente' ? 'apagar' : 'ejecutar'`, `:222`): la primera
acción no-apagar que se implemente va a decir "Voy a ejecutar X" arriba y
"Apagar" en el botón.

---

## Lo que revisé y está bien

- **`FE-C1` sigue CERRADO y no reabrió con los 37 commits.**
  `src/app/dashboard/chat.tsx:104-119` sigue sin rama heurística.
- **El Copiloto NO repite `FE-C1`.** `respuestaDeBloques`
  (`admin/copiloto.tsx:105-124`) solo pinta bloques que el servidor mandó, y la
  rama de fallo (`:342-346`, `:349`) devuelve el aviso explícito ("El copiloto no
  pudo responder en este momento") en vez de improvisar. El lector NDJSON
  (`:296-330`) guarda tanto `{t:'fin'}` como `{t:'error'}` en `d`, igual que el
  chat del cliente.
- **La previsualización de acción del Copiloto es honesta donde importa.**
  `efecto` y `revertir` salen del catálogo determinista
  (`copiloto-acciones.ts:36-39`), no del modelo; el `objetivo` que se muestra en
  la tarjeta es **el mismo string** que viaja en el POST de confirmación
  (`copiloto.tsx:222` × `:194`), así que no hay forma de que el botón haga algo
  distinto de lo que la tarjeta dice; y una acción no implementada se pinta sin
  botón, con la frase textual (`:173-186`). Busqué el hueco de "el modelo
  ejecuta" y **no está**.
- **`ETIQUETA_TOOL` y `PANTALLA_UI` del Copiloto cubren las 13 tools reales.**
  Comparé una por una contra los `name:` de `copiloto-tools.ts:56-290` (11) más
  `proponer_accion` y `entregar_respuesta_admin` (`copiloto.ts:56`, `:99`):
  ninguna tool cae al fallback crudo. El único defecto es la ruta de una de
  ellas, reportado arriba.
- **`senales-pmf.tsx` es el mejor bloque nuevo de la ronda y el contraejemplo
  del rubro.** Distingue **tres** estados por señal, no dos
  (`senales-pmf.tsx:26-38`), y el texto dice cuál es cuál: "sin datos que medir"
  (`:42`, `:60`), "no se pudo leer (≠ que falten)" (`:106`), y el glosario al pie
  lo explica (`:117-122`). Nombra el demo como demo en vez de contarlo como uso
  (`:53`), y trata cero tickets como ausencia de dato y no como buena noticia
  (`:71-73`). `flotas/page.tsx:141` lo alimenta con un `catch` **por flota**, así
  que una lectura caída no contamina a las demás.
- **`admin/aprobaciones` blinda sus dos bandejas de verdad.** Cada una tiene su
  propia consulta y su propio `{ok, error}` (`page.tsx:30-31`), el error dice
  "no significa que esté vacía" (`:84-86`), y el vacío urgente y el vacío normal
  tienen textos distintos porque significan cosas distintas (`:89-91`). El único
  hueco es la tercera lectura, reportado arriba.
- **`FormaPieza` no deja aprobar a ciegas.** El borrador se pinta COMPLETO con
  scroll propio y `whitespace-pre-wrap`, nunca truncado
  (`forma-pieza.tsx:44-47`); el botón de aprobar desaparece mientras se está
  rechazando (`:69`); y el estado de éxito reemplaza la tarjeta con el mensaje
  del servidor (`:23-29`) en vez de dejarla clicable otra vez. `FormaEnvio` dice
  a quién sale y con qué versión, y cuando no hay correo del prospecto **no
  pinta un botón muerto** (`:141-143`).
- **`admin/agentes/contenido.tsx` deriva de sus catálogos, no de literales.**
  `rotuloDepartamento` y `rotuloEstado` se construyen con
  `new Map(DEPARTAMENTOS.map(...))` / `ESTADOS_AGENTE.map(...)` (`:71-72`), que es
  el patrón correcto; los dos únicos mapas literales (`PILL_ESTADO`,
  `PILL_CORRIDA`, `:44-47`) tienen fallback a `'neutral'` y el rótulo cae a la
  clave cruda, nunca a `undefined`. Además distingue tres estados en la celda de
  corrida (`:89-98`) y **cuatro** en la de kill switch (`:100-111`), incluido
  "No se pudo leer" separado de "Sin palanca propia" — que es exactamente la
  distinción que este rubro suele perder.
- **`usd` de `admin/agentes/contenido.tsx:8` NO es una segunda fuente de
  formato.** Lo perseguí porque el import viene de `@/lib/utils` y no de
  `@/lib/formato`: `utils.ts:12` es un **re-export** literal
  (`export { TZ_MX, mxn, usd, litros, fechaMx, numero } from './formato'`). Una
  sola implementación. No es hallazgo.
- **Todos los demás mapas literales del panel cuadran con su dominio.** Comparé
  uno por uno contra el tipo/constraint: los seis mapas de rol
  (`usuarios/vista.tsx:11`, `chrome.tsx:26`, `aviso-rol.tsx:7`,
  `mi-perfil/page.tsx:11` ×2, `notificaciones-forma.tsx:45`) contra
  `app_user.rol`; los tres de `viaje.estatus` (`viajes/vista.tsx:22`,
  `viajes/libro.tsx:55`, `resumen-visual.tsx:103`) contra el constraint
  `viaje_estatus_dominio` — los tres coinciden **entre sí** y con el dominio;
  `CONCEPTO`/`CONCEPTO_LABEL` (`[id]/page.tsx:28`, `gasto-semanal-chart.tsx:9`);
  `MOTIVO_LEGIBLE` (`peajes/vista.tsx:330`) contra los seis `motivo` que emite
  `intake/desglose_peaje.ts:435-495`; `MOTIVO_ERROR`
  (`combustible-casetas/page.tsx:29`); `TONO_DOCUMENTAL` (`libro.tsx:63`) contra
  `EstadoDocumental`. Ninguno desincronizado.
- **Barrido completo de rutas muertas.** Extraje **todos** los literales
  `/admin…` y `/dashboard…` de `src/app` (`.ts` y `.tsx`) y los contrasté contra
  la existencia de `page.tsx`. Único fallo: `/admin/corridas`, reportado arriba.
  Los tres nuevos (`/admin/copiloto`, `/admin/agentes`, `/admin/aprobaciones`)
  están dados de alta en el sidebar (`admin/rutas.ts:23`, `:24`, `:40`) y sus
  páginas existen — no nacieron inalcanzables.
- **El ancla del `BannerInsight` existe.** `href="#estadisticas"` resuelve al
  `id="estadisticas"` de `inicio-contenido.tsx:380`. (Sí queda muerta en la rama
  `estado === 'error'`, donde el bloque no se renderiza y el banner sí — pero eso
  es un clic sin efecto, no una cifra falsa.)
- **`Gauge` y `HBars` están guardados contra la división por cero**
  (`graficas.tsx:35` clamp 0-100, `:88` `Math.max(..., 1)`), y las dos traen la
  nota de la auditoría 12 explicando por qué ya no nacen animadas desde cero: un
  0% servido en el HTML se leía como medición. Ese criterio está bien puesto.
- **Fronteras de error y formato centralizado**, sin cambios respecto al pase 3:
  `dashboard/error.tsx` / `global-error.tsx` no filtran stacks, y ninguna
  pantalla nueva llama `toLocaleString('es-MX')` por su cuenta (el Copiloto
  formatea con `mxn`/`litros`/`numero` en `copiloto.tsx:110-114`, comentado a
  propósito; `BannerInsight` calcula el % con aritmética y lo dice en
  `kit.tsx:304-306`).
- **Tablas responsive:** barrí todos los `.tsx` con `<table>` y los únicos tres
  sin `overflow-x-auto` (`copiloto.tsx`, `chat.tsx`, `suscripcion/vista.tsx`) son
  tablas de dos columnas clave/valor dentro de un contenedor acotado. No
  desbordan.
- **La compuerta está verde:** `npx vitest run src/app/dashboard src/app/admin` →
  22 archivos, 182 pruebas, 0 fallos. Que esté verde con los 18 hallazgos de
  arriba vivos es, en sí, el dato del rubro.

---

## Lo que NO alcancé a revisar

- **No miré un solo píxel.** Prohibido `npm run build` y no levanté preview
  headless. Todo lo visual —incluidos los dos contrastes y la dona degenerada—
  está **medido y ejecutado sobre el código** (el path de la dona lo corrí con
  `node` copiando la función tal cual), no mirado en pantalla. La regla del repo
  dice que medir no sustituye a mirar; esta nota sigue a medio camino por
  construcción, igual que la del pase 3.
- **`admin/copiloto.tsx` en ejecución.** Leí las 494 líneas, pero no pude
  ejercitar el stream NDJSON contra el endpoint real: no verifiqué qué pasa con
  un `{t:'error'}` que trae mensaje del servidor (hoy se descarta y se pinta el
  genérico, `:349`), ni el `AbortSignal.timeout(75_000)` a mitad de lectura, ni
  el scroll `sticky` de la caja con una conversación larga.
- **Accesibilidad más allá del contraste.** No inventarié orden de foco,
  `aria-live` (el bloque "Pensando…" del Copiloto, `:400-418`, no lo tiene), ni
  trampas de foco. Vi que `forma-pieza.tsx:60` y `:65` usan placeholder como
  única etiqueta (sin `<label>` ni `aria-label`) pero no lo reporto como hallazgo
  porque no pude medir el impacto real. Los botones nuevos rondan 28px de alto:
  pasan el mínimo de 24px de WCAG 2.2 AA, no el de 44px recomendado.
- **Modo oscuro.** Ni una pantalla. `:root[data-theme="dark"]` redefine `--g1` a
  `#2f1c0e` (`globals.css:136`) y `.tema-neutro` oscuro a `#1b1b1f` (`:154`); no
  medí `--faint` #98989f contra ninguno de los dos.
- **`admin/ui/graficas.tsx` — 546 líneas, 11 componentes.** Abrí `Gauge`, `HBars`
  y las firmas de los otros nueve; **no** audité `MultiLine`, `StackedBars`,
  `Funnel`, `Waterfall`, `Histogram`, `Heatmap`, `CalendarHeatmap`,
  `MarginDivergingBars` ni `ParetoBars` por dentro (ejes, redondeos, casos de un
  solo dato). Dado que la dona escondía un caso degenerado, asumo que ahí hay
  más.
- **Los cinco agentes restantes de `/dashboard/agentes/`** (cobranza,
  conductores, talacha, OCR, proveedores) — solo revisé el de liquidación a fondo
  y los mapas literales de peajes.
- **~18 páginas de `/dashboard` y ~12 de `/admin`** siguen sin abrir, casi las
  mismas que el pase 3 listó: `rentabilidad`, `despacho`, `operadores`,
  `documentos`/`huerfanos`, `mapa`, `politicas`, `conocimiento`, `arco`,
  `suscripcion`, `notificaciones`, `contador`, `integraciones`, `soporte`; y del
  lado de /admin: `compliance`, `trust-safety`, `escalaciones`, `crecimiento`,
  `capacidad-forecast`, `calidad-evals`, `conocimiento-rag`, `salud-sistema`,
  `whatsapp-infra`, `playground`, `dev`.
- **Las formas de captura.** Leí `forma-pieza.tsx` y la forma de alta de
  `admin/agentes` completas; **no** verifiqué validación en cliente,
  `aria-invalid`/`aria-describedby`, ni el comportamiento de un `useActionState`
  que devuelve error mientras el usuario ya editó el campo — el mismo hueco que
  dejó el pase 3.
- **`design-system/` sigue sin existir** en este árbol; el kit vive en
  `src/app/admin/ui/` y `src/app/admin/charts.tsx`. De `kit.tsx` leí `StatCard`,
  `StatusPill`, `Semaphore`, `EstadoVacio`, `BannerInsight` y `EstadoCargando`;
  no abrí `ChartCard`, `global-filter.tsx` ni `forma.tsx`.
