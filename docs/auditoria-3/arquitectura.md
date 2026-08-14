# Arquitectura y mantenibilidad — auditoría 3

**Nota: 4/10** (antes 6). Baja por la regla del rubro y por el ancla: hay DOS
reincidentes formales — el redondeo naive de dinero que `formato.ts` documenta
como "AUDITORÍA 9, ALTO REINCIDENTE" volvió a escribirse a mano en dos rutas de
anticipo nuevas, y `getStatsPorOperador` (marcado en la ola 2 como "si llega al
dashboard, miente") llegó al dashboard sin arreglarse y hoy miente. Además, la
lógica de redondeo de dinero vive otra vez en más de un archivo con
comportamiento distinto, que es el piso de 4 del ancla. Las fronteras grandes
(dominio, motor de cuadre, formato, page/vista) siguen en pie — por eso 4 y no
menos.

**Riesgo mayor hoy:** las seis páginas de agente se construyeron en un día
copiando la misma anatomía (Kpi, Leyenda, safe, gate de permiso, sufijo) en
cada carpeta, y la divergencia ya empezó el mismo día (3 variantes de Leyenda,
2 contratos de `exigirPermiso`, 3 de 6 páginas usan `sufijoTenant` y 3 lo
re-inlinean sin encoding). La séptima página va a copiar de la que le toque, y
cada arreglo futuro a esta anatomía son seis ediciones que nadie va a hacer
completas.

## Hallazgos

### 1. CRÍTICO — `diferencias: 0` hardcodeado llegó al dashboard y pinta un rótulo falso (REINCIDENTE de la ola 2)

- `src/lib/likida/analytics.ts:324` — `getStatsPorOperador` devuelve
  `diferencias: 0` fijo para TODO operador (nunca se calculó).
- `src/app/dashboard/agentes/liquidacion/page.tsx:53` lo consume y en `:70`
  filtra `o.diferencias > 0` → el arreglo resultante es SIEMPRE vacío.
- `src/app/dashboard/agentes/liquidacion/vista.tsx:218-219` — con arreglo
  vacío la sección "Diferencias por operador" afirma: **"Ningún operador
  acumula diferencias — la señal que quieres ver."**
- Reincidente literal: `docs/conocimiento/40-auditoria-codigo.md:278` lo marcó
  el 27-jul: "Sin consumidores, y devuelve `diferencias: 0` hardcodeado […] si
  llega al dashboard, miente". Se le dio consumidor sin quitarle el cero.

**Escenario:** una flota con operadores que sí acumulan diferencias (el caso
que la página existe para enseñar) abre el agente de liquidación y lee que
nadie acumula diferencias, presentado como medición y como buena noticia.
**Consecuencia:** viola la regla que define el producto (un cero que parece
medición); el contralor que cruce contra sus liquidaciones (donde
`getLiquidaciones` SÍ trae diferencias reales por viaje) ve dos pantallas del
mismo panel contándose historias distintas.
**Refutación intentada:** ¿hay otro camino que llene `diferencias`? No — el
único consumidor es liquidacion/page.tsx y el único productor es analytics.ts.
El `safe()` solo cubre el caso base-caída (null → "No se pudo leer"); en
operación sana el rótulo falso se pinta siempre.

### 2. ALTO — el redondeo naive de dinero volvió a escribirse a mano en rutas de anticipo (REINCIDENTE de "AUDITORÍA 9, ALTO REINCIDENTE")

`src/lib/formato.ts:39-46` documenta que `Math.round(n * 100) / 100` se
reimplementó a mano en cuatro archivos de dinero, que los cuatro tenían el bug
de `1.005 → 1`, y que por eso existe `round2()` (con `Number.EPSILON` y signo
separado). El código nuevo de esta semana lo reintroduce naive:

- `src/lib/likida/importar_viajes.ts:66` y `:76` — `leerCifraImportada`
  redondea el **anticipo importado** del TMS con la forma naive; ese valor se
  inserta en `viaje.anticipo` (`:214`).
- `src/lib/likida/crear_viaje_wa.ts:302` — el anticipo que el jefe dicta por
  WhatsApp, misma forma naive.
- Menor pero misma deriva: `src/lib/agents/chat-tools.ts:199,203,205` y
  `src/lib/agents/analista.ts:120-175` (cifras del chat).

**Escenario:** un anticipo tipo `1234.565` en el Excel del TMS entra redondeado
un centavo abajo respecto de cómo `round2` lo redondearía; el motor de cuadre
reporta una diferencia de un centavo contra la liquidación que el propio TMS
del prospecto imprime.
**Consecuencia:** la misma pregunta ("¿cuánto es esto en centavos?") tiene dos
respuestas según el archivo — exactamente lo que la auditoría 9 cerró y el
comentario de `formato.ts` cuenta. Un centavo no quiebra a nadie; dos
comportamientos de redondeo de dinero en el repo sí quiebran la confianza en
que hay UNA aritmética.
**Refutación intentada:** ¿es deliberado por pureza (no importar formato)? No
se sostiene: `cobranza_pura.ts` importa `TZ_MX` de `@/lib/formato` sin
problema — `round2` estaba a un import de distancia.

### 3. ALTO — la anatomía de las 6 páginas de agente está copiada, no compartida, y ya divergió

Conteo exacto de copias, todas leídas:

- **`function Kpi` — 10 copias.** Idénticas (9):
  `agentes/liquidacion/vista.tsx:285`, `agentes/facturas/vista.tsx:266`,
  `agentes/cobranza/vista.tsx:187`, `agentes/conductores/vista.tsx:171`,
  `agentes/peajes/vista.tsx:189`, `agentes/proveedores/vista.tsx:154`,
  `mapa/vista.tsx:69`, `operadores/vista.tsx:144`, `viajes/vista.tsx:165`.
  **Divergida (1):** `despacho/vista.tsx:239` — perdió el prop `nota`.
- **`function Leyenda` — 6 copias en 3 variantes.**
  `agentes/liquidacion/vista.tsx:277` (`max-w-[30ch]`);
  `agentes/peajes/vista.tsx:181`, `agentes/cobranza/vista.tsx:179`,
  `agentes/conductores/vista.tsx:163` (`max-w-[34ch]`);
  `agentes/facturas/vista.tsx:255` y `despacho/vista.tsx:228` (con `icono`,
  `max-w-[32ch]`, DOM distinto). Tres anchos de texto distintos para el mismo
  concepto, en páginas hermanas del mismo pasillo.
- **`function safe<T>` — 10 copias** del mismo helper de 3 líneas, ya en dos
  formas (`async function` en `inicio-operacion.tsx:28`,
  `inicio-contenido.tsx:36`, `soporte/page.tsx:11`, `suscripcion/page.tsx:28`,
  `combustible-casetas/page.tsx:37`; `function` sin async en
  `agentes/conductores/page.tsx:12`, `agentes/cobranza/page.tsx:15`,
  `agentes/liquidacion/page.tsx:17`, `despacho/page.tsx:19`,
  `agentes/peajes/page.tsx:21`).
- **El gate de las actions — 7 sitios en 4 formas.** Helper de módulo que
  devuelve `string | null`: `agentes/cobranza/page.tsx:24`,
  `huerfanos/page.tsx:17`. Helper que devuelve `{error}|{quien}`:
  `agentes/proveedores/page.tsx:20`. Inline en cada action:
  `agentes/facturas/page.tsx:57-62`, `agentes/peajes/page.tsx:58-60`,
  `viajes/page.tsx:76-80`. Closure dentro del componente:
  `despacho/page.tsx:59-64` (`guardia()`).

Nótese que estas mismas vistas SÍ importan lo compartido cuando existe
(`EstadoVacio`, `Dona`, `HBars` de `admin/ui`), y que el propio repo enunció la
regla en `agentes/facturas/pills.tsx:3-4`: "dos copias de un semáforo se
desincronizan". La regla se aplicó a la pill y se ignoró para Kpi/Leyenda/safe/
gate, el mismo día.

**Escenario:** el rediseño v4, o un cambio de contraste/accesibilidad al
componente Kpi, se aplica en las 3-4 copias que el autor encuentra; despacho
(que ya divergió) y mapa quedan con la versión vieja. El usuario navega entre
dos páginas del mismo panel y las tarjetas KPI se ven distintas — y CLAUDE.md
promete "no hay una segunda librería de UI", que hoy ya es falso por
acumulación: hay una segunda librería, ensamblada por copy-paste.
**Consecuencia:** costo de cambio ×10 en el componente más repetido del panel;
divergencia visual silenciosa ya iniciada.
**Refutación intentada:** ¿es la duplicación deliberada de "cada página es
dueña de su pixel"? No hay comentario que lo declare (la doctrina escrita del
repo dice lo contrario en pills.tsx y CLAUDE.md), y la divergencia de despacho
no es una decisión: es un prop perdido.

### 4. MEDIO — el sufijo de tenant: canónico con prueba + 6 re-implementaciones, la mitad sin encoding

- Canónico: `src/app/dashboard/sufijo.ts:20-26` (`encodeURIComponent`, con
  `sufijo.test.ts`). Copia documentada y justificada: `sidebar-nav.tsx`
  (client, otra fuente de entrada — lo dice el encabezado de sufijo.ts).
- Variante propia con encoding: `src/app/dashboard/[id]/page.tsx:80-83`
  (`partes.push(...)`).
- **Copias manuales SIN `encodeURIComponent` — 5:** `dashboard/page.tsx:36-37`,
  `agentes/liquidacion/page.tsx:36-37`, `agentes/cobranza/page.tsx:49-50`,
  `agentes/facturas/page.tsx:32-33`, `despacho/page.tsx:42-43`.
- De las seis páginas de agente construidas hoy/ayer, 3 usan el canónico
  (conductores:68, peajes:43, proveedores:43) y 3 lo re-inlinean
  (liquidacion, cobranza, facturas). Mismo día, mismo patrón, 50/50.

**Escenario:** `sufijo.ts` existe porque perder el query string te cambia de
tenant sin avisar (CLAUDE.md lo lista en "trampas ya pisadas"). El día que un
valor de `tenant`/`rol` necesite encoding, o que el sufijo gane un cuarto
parámetro, el canónico y su prueba se actualizan y las 5 copias no — y la
trampa reabre exactamente en las páginas de dinero (cobranza, facturas).
**Consecuencia:** hoy los slugs son seguros y no hay bug visible; la deriva es
el hallazgo — la misma verdad en 8 lugares, con test solo en uno.
**Refutación intentada:** ¿las 5 copias son anteriores al canónico? No aplica
como excusa: 3 páginas hermanas del mismo commit-día ya importan el canónico,
así que estaba disponible y conocido.

### 5. MEDIO — el normalizador de acentos: 1 canónico, 10 re-implementaciones, y una copia exacta entre dos módulos que ya se importan entre sí

- Canónico: `strip_accents` en `src/lib/likida/cuadre/util.ts:2` (lo importan
  `cuadre/engine.ts`, `hitos_viaje.ts`, `inicio_viaje.ts`,
  `intake/huerfanos.ts`).
- Re-implementaciones inline (todas NFD + strip, con extras ad-hoc):
  `analytics.ts:1072`, `consulta_chofer.ts:64`, `privacidad.ts:353` **y**
  `privacidad.ts:603` (dos en el mismo archivo), `geo/ciudades.ts:122`,
  `importar_viajes.ts:53-60`, `peajes/desglose.ts:44-51`,
  `facturacion/adaptadores/capufe.ts:154`, `intake/sanitizar.ts:115`,
  `app/dashboard/barra-acciones.tsx:33`.
- Divergencia JUSTIFICADA (no cuenta como copia): `crear_viaje_wa.ts:87-110`
  — `aplanar` preserva el largo para poder rebanar el original; el comentario
  explica por qué NFD no sirve ahí. Bien.
- **La peor:** `peajes/desglose.ts:44-51` es copia carácter por carácter de
  `normalizarEncabezado` de `importar_viajes.ts:53-60` — y desglose.ts YA
  importa dos funciones de importar_viajes en su línea 1. Se copió lo que
  estaba a un `export` de distancia, entre dos módulos nacidos el mismo día.

**Escenario:** el lector de desgloses aprende un encabezado con un carácter
nuevo (p. ej. tolerar `#` o dígitos con `º`) tocando SU normalizador; el
importador de viajes, que promete la misma tolerancia de encabezados, se queda
atrás — el mismo Excel del mismo prospecto entra por una pantalla y no por la
otra.
**Consecuencia:** dos productos "leen tu archivo" con dos gramáticas que hoy
son idénticas por accidente, no por construcción.
**Refutación intentada:** ¿cada contexto necesita SU normalización? Cierto
para geo/ciudades (reglas de ciudad) y crear_viaje_wa (largo); falso para el
par desglose/importar (idénticos) y dudoso para los 2 de privacidad.ts entre
sí.

### 6. MEDIO — el lector "puro" de desgloses cuelga de un módulo con `supabaseAdmin`, teniendo el patrón `_pura` a la vista

- `src/lib/likida/peajes/desglose.ts:1` importa `leerCifraImportada,
  leerFechaImportada` de `../importar_viajes`, cuyo módulo carga
  `supabaseAdmin` y `logger` en el top (`importar_viajes.ts:1-2`).
- El mismo día se hizo el split correcto para cobranza:
  `agentes/cobranza_pura.ts` (solo `TZ_MX`) + `agentes/cobranza.ts` (I/O,
  re-exporta) — documentado en su encabezado precisamente para que el
  navegador no arrastre `supabaseAdmin`. `importar_viajes.ts` mezcla las puras
  (`interpretarFilasViajes`, `leerCifraImportada`, `leerFechaImportada`) con
  `importarViajes` (I/O) en un solo archivo.

**Escenario:** la fase siguiente del PoC quiere previsualizar el desglose en
el navegador (como la vista previa de cobranza) — e importar
`interpretarDesglose` desde un client component arrastra el módulo del admin
al bundle o revienta el build; alguien lo "resuelve" copiando las funciones, y
nace la copia #3 del lector de cifras.
**Consecuencia:** el helper que se anuncia PURO (desglose.ts:8 "ANDAMIAJE
puro") no es importable desde donde un helper puro vale oro; la propia
etiqueta del repo miente a nivel de módulo.
**Refutación intentada:** hoy nadie lo importa desde cliente y el build pasa —
correcto, por eso es MEDIO y no ALTO: es deuda de frontera, no bug.

### 7. MEDIO — `viajes/vista.tsx` importa `PillAviso` desde la vista de OTRA página (fuga app→app)

- `src/app/dashboard/viajes/vista.tsx:6` → `import { PillAviso } from
  '../despacho/vista'`; el export vive en
  `src/app/dashboard/despacho/vista.tsx:218`.
- El repo tiene los dos precedentes correctos: compartido de pasillo en la
  raíz (`dashboard/resumen-visual.tsx`, `forma-viaje.tsx`, `estatus.ts`) y
  extracción local con razón escrita (`agentes/facturas/pills.tsx`).

**Escenario:** alguien ajusta `PillAviso` para la semántica de despacho
(p. ej. "reavisado hace X" con los datos que solo despacho tiene) o mueve/
renombra la vista en el siguiente rediseño; la página de viajes cambia de
significado o se rompe, y nada en la carpeta de despacho te dice que tiene un
inquilino.
**Consecuencia:** la "vista" del patrón page/vista deja de ser privada de su
página; el grafo de dependencias entre páginas hermanas apunta lateral, que es
la dirección que el patrón existe para prohibir.
**Refutación intentada:** ¿es como `pills.tsx`? No — pills.tsx comparte dentro
de la MISMA carpeta; esto cruza carpetas de página. ¿Frontera correcta o fuga?
Fuga: el lugar de un componente con dos páginas dueñas es la raíz del
dashboard, donde ya viven sus cinco hermanos.

### 8. MEDIO — la única escritura de dinero que vive en una page: el amarre de CFDI en facturas

- `src/app/dashboard/agentes/facturas/page.tsx:71-78` — la action
  `marcarFacturada` hace el `UPDATE gasto SET cfdi_uuid, cfdi_orden` con
  `supabaseAdmin()` directo en el archivo de la página (bien anclado a tenant
  y a `cfdi_uuid IS NULL`, eso no está en duda).
- Sus cinco hermanos rutean la escritura por módulo de dominio:
  cobranza → `lib/likida/agentes/cobranza.ts`, proveedores →
  `lib/likida/proveedores.ts`, peajes → `lib/likida/intake/consolidado.ts`,
  viajes → `lib/likida/importar_viajes.ts`, despacho → `crear_viaje_wa`/
  `despacho_wa` (con una lectura suelta en `despacho/page.tsx:140-142`).
- El dominio de facturación existe (`lib/likida/facturacion/pendientes.ts`
  pone los tickets EN la cola); sacarlos de la cola quedó en la page.

**Escenario:** el webhook/cron de facturación (o el chat, o la mesa del jefe)
necesita mañana "marcar facturada" — y la regla del amarre (validar UUID,
respetar el índice único, `cfdi_orden: 1`) no está en ningún módulo importable:
está en una closure de una page. Se reimplementa, y las dos implementaciones
del amarre divergen en el manejo del 23505.
**Consecuencia:** la entrada y la salida de la misma cola viven en capas
distintas; la regla de "todo acceso pasa por módulos de dominio" tiene su
excepción justo en la operación fiscalmente más delicada de la página.
**Refutación intentada:** las demás pages también tocan `supabaseAdmin` — sí,
pero para lecturas o resolución de tenant; esta es la única ESCRITURA de un
dato fiscal desde una page.

### 9. BAJO — "cuadre/ es PURO" ya solo es verdad a nivel de `engine.ts`

- `src/lib/likida/cuadre/desde_db.ts:9-10` importa `supabaseAdmin` y `logger`
  (en la carpeta desde el 6-ago, commit `87426f8`); `cuadre/guardia.ts:23`
  importa `logger`. `engine.ts` sigue puro (solo `./util`, `./fecha_dudosa`).
- El enunciado del mapa ("cuadre/ es PURO") y el contenido de la carpeta ya no
  coinciden. **El motor de dinero en sí NO se contaminó** — la respuesta a la
  pregunta del rubro es: el motor sigue puro, la carpeta no.

**Escenario:** el siguiente agente lee "cuadre/ es puro", importa algo de
`cuadre/desde_db` en un contexto de navegador o en una prueba sin mocks, y
pierde una hora en el error de bundle.
**Consecuencia:** un invariante citado en dos documentos de a bordo vale menos
cada vez que se cita.

### 10. BAJO — el widget de periodo (‹ › semanal/mensual/histórico) duplicado, y su literal ya divergió

- `src/app/dashboard/kpi-periodo.tsx:10-18` y
  `src/app/dashboard/motor-fiscal-periodo.tsx:7-13` definen cada uno el mismo
  `type Modo`, `MODOS`, `ETIQUETA_MODO` **y** la clase `BOTON` — y `BOTON` ya
  divergió: `transition-colors` en uno, `transition-opacity` en el otro.
  Mismo lenguaje de widget, misma dirección del 8-ago.

**Escenario:** se ajusta el hover o se agrega un modo ("trimestral") en una de
las dos tarjetas; la otra cicla otra cosa a un scroll de distancia.
**Consecuencia:** menor — pero es el ejemplo de libro de "dos literales que
dicen lo mismo y ya divergieron", en la página de inicio.

### 11. BAJO — dos páginas hermanas se contradicen por escrito sobre cómo se debe construir el gate

- `agentes/cobranza/page.tsx:21-23` y `huerfanos/page.tsx:15-16` afirman que
  el gate debe ser "helper de módulo y no closure: una action solo puede
  capturar VALORES serializables (tenantId), no funciones".
- `despacho/page.tsx:59-64` hace exactamente lo contrario: `guardia()` es una
  closure dentro del componente, capturada por sus cuatro actions — y despacho
  está en producción desde el 12-13 ago.
- No corrí runtime (regla de la ronda), así que no afirmo cuál funciona mal;
  lo que sí es hallazgo es que la doctrina escrita del repo apunta en dos
  direcciones a la vez.

**Escenario:** el autor de la página siete copia el comentario de cobranza o
el código de despacho según dónde caiga su vista, y la mitad de las páginas
argumenta que la otra mitad es imposible.

### 12. BAJO — `interpretarDesglose` no tiene ningún consumidor fuera de su prueba

- `grep interpretarDesglose src/` → solo `peajes/desglose.ts` y su test. El
  encabezado (desglose.ts:13-15) lo declara andamiaje del PoC con integración
  en la fase siguiente — es deliberado y está dicho, por eso BAJO y no más.
  Se anota para que la auditoría 4 verifique que se cableó o se mató: código
  exportado sin consumidor es donde las copias nacen sin que nadie las vea.

## Lo que revisé y está bien

- **El split `cobranza_pura.ts` / `cobranza.ts`** (`agentes/cobranza_pura.ts:1`
  solo importa `TZ_MX`; `cobranza.ts:13` re-exporta como fachada): el patrón
  correcto, con su porqué escrito, y la vista previa del navegador
  (`estrategia.tsx:6-8`) importa la pura directamente. Así se hace.
- **`geo/ciudades.ts` es puro de verdad** (cero imports, tabla horneada,
  `resolverCiudad` devuelve null honesto) y tiene un solo consumidor
  (`mapa/page.tsx`). `hitos_viaje.ts` reusa el `strip_accents` canónico
  (`hitos_viaje.ts:4`) en vez de copiar el suyo, y se cablea UNA vez en
  `processor.ts:31,1573`.
- **El guardián de formato sigue sellado:** cero `toLocaleString` fuera de
  `lib/formato.ts` en todo src/ (solo menciones en comentarios y en la propia
  prueba `lib/pruebas/codigo.ts`). `round2` canónico se usa en analytics
  (`analytics.ts:16`).
- **El patrón page/vista es consistente en las 6 páginas de agente** (page =
  sesión + datos + actions; vista = dibujo), y las vistas reusan el kit
  compartido para lo que el kit ya tiene (`EstadoVacio`, `Dona`, `HBars`,
  `CalendarHeatmap` desde `admin/ui` — 20+ imports verificados; no nació una
  segunda librería de charts).
- **`politicas/page.tsx:66` lee la fila cruda de `tenant.config` a propósito**
  y el comentario explica por qué `getConfig()` no puede responder "¿es suya o
  heredada?" — lo revisé como sospecha de bypass y me refuté: es la excepción
  bien documentada.
- **`facturas/pills.tsx`** — extracción con la razón escrita ("dos copias de
  un semáforo se desincronizan"); la doctrina correcta existe en el repo, lo
  que hace más raro que no se aplicara a Kpi/Leyenda.
- **Las lecturas de las 6 páginas pasan por módulos de dominio** (analytics,
  agentes/cobranza, proveedores, facturacion/pendientes, intake/consolidado) y
  el primario falla cerrado con el comentario estándar en las seis — la
  disciplina de "base caída = página caída" se copió bien.

## Lo que NO alcancé a revisar

- `processor.ts` por dentro (~2,300 líneas): verifiqué el cableado de hitos
  (una sola entrada) pero no busqué duplicación interna de la rama oficina
  (~402-470) contra `despacho_wa.ts`.
- `src/app/admin/**` a fondo: confirmé que solo 2 archivos tocan
  `supabaseAdmin` directo, pero no auditué si todo lo cross-tenant pasa por
  `lib/admin/negocio.ts`.
- El runtime de la closure `guardia()` de despacho (hallazgo 11) — sin correr
  build/pruebas por regla de la ronda, dejo la contradicción documental, no un
  veredicto de bug.
- `lib/likida/chat/` y el lector universal de archivos del chat contra
  `importar_viajes`/`desglose`: si el chat lee Excel por su propio camino,
  habría un TERCER lector de matrices — no lo verifiqué.
- Los cinco pares de tablas con doble FK de la 0075 (lo cubre modelo de
  datos; solo confirmé que no toca mis fronteras).
