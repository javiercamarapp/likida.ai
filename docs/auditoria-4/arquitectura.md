# Arquitectura y mantenibilidad — auditoría 4

**Nota: 4/10** (antes 4). Razón del movimiento: **se atacó y subió en lo nuevo,
y la deuda vieja cobró factura otra vez**. Lo que llegó esta ronda está, en
arquitectura, mejor construido que el promedio del repo: la mig. 0112 movió
cuatro agregados a SQL **reemplazando** la función JS (no dejándola al lado),
con fail-closed explícito en los tres llamadores y un bloque de verificación
contra Postgres real; el copiloto reusa las guardias del analista en vez de
copiarlas; `cola.ts` deja el candado de estado en el esquema. Nada de eso mueve
la nota porque el ancla del rubro es categórica —**"4 o menos si la misma
lógica de dinero vive en más de un archivo"**— y hoy hay **dos** conceptos de
dinero en dos casas: `contribución/margen` (`libro_viaje.ts` × `comercial.ts`,
el CRÍTICO heredado, **intacto en el pase 4**) y **"dinero observado"**, que
esta ronda se partió en SQL y TS con filtros distintos. Además el ejemplo
canónico del rubro (`CONCEPTO_LABEL`) **reincide por cuarta ronda**, cinco
advertencias más volvieron a ocurrir, y la compuerta del pase (`npx tsc
--noEmit -p .`) está **roja hoy** por dos migraciones que se llaman 0112.

**El riesgo mayor, hoy:** `/dashboard/rentabilidad` sigue dividiendo el ingreso
de N viajes entre el costo de TODOS y jurando debajo que no lo hace — cuarto
pase con la misma cifra de dinero inventada bajo un rótulo que afirma lo
contrario.

## Hallazgos

### [CRÍTICO] La contribución de la flota se mide con ingreso de N viajes y costo de TODOS — PENDIENTE, sin un solo cambio en el pase 4

`src/lib/likida/comercial.ts:133-163` — la consulta de costo (`:141-145`) no
filtra a los viajes que entraron al numerador; el cálculo es `:158-159` ·
`src/app/dashboard/rentabilidad/vista.tsx:64` (la tarjeta) y `:69` (la frase) ·
contra la implementación correcta del MISMO concepto en
`src/lib/likida/libro_viaje.ts:151` (`contribucion`) y `:163` (`margenPct`),
usada en `:504,523-524`.

**Verificación contra el árbol de hoy.** `comercial.ts` SÍ se modificó esta
ronda (le entraron `abrirTicket`, `getEstadoRastreo` y la sección de PMF), pero
`getRentabilidad` **no se tocó**: el hallazgo no cerró, no se movió de
concepto y solo corrió una línea (era `:132-162`, hoy `:133-163`). El propio
archivo lo agrava sin querer: `libro_viaje.ts:21` dice hoy *"Mismo criterio que
ya aplica `Rentabilidad.contribucion` en comercial.ts"* — el módulo que hace la
cuenta bien declara alinearse con el que la hace mal.

**Escenario (idéntico al del pase 3, revalidado línea por línea).** Flota con
10 viajes. Tres entraron por Despacho con `ingreso_flete = $50,000` c/u
($150,000). Siete por WhatsApp con `ingreso_flete = NULL`. Los diez liquidados
con `total_comprobado = $40,000` c/u ($400,000).

- `comercial.ts:149-152` suma ingreso saltándose los NULL → **$150,000**,
  `viajesConIngreso: 3`, `viajesSinIngreso: 7`.
- `comercial.ts:141-145` suma `liquidacion.total_comprobado` de **la tabla
  entera del tenant** (`.eq('tenant_id', …)` y nada más) → **$400,000**.
- `contribucion = round2(150,000 − 400,000)` = **−$250,000.00** ·
  `margenPct = round2((−250,000/150,000)×100)` = **−166.67**.
- La pantalla imprime *"Contribución (ingreso − comprobado): −$250,000.00"* y
  debajo, literal: *"Margen: −166.67% — medido solo sobre los 3 viajes con
  ingreso capturado. 7 viajes sin ingreso quedan fuera de esta medición."*
- La verdad sobre esos 3: $150,000 − $120,000 = **+$30,000**, margen **+20%**.

Funciona en los dos sentidos: un viaje con ingreso capturado y sin liquidar mete
su ingreso completo con costo cero e infla el margen.

**Consecuencia.** El contralor decide TARIFA con esto: −167% dice "esta flota se
está quemando", +20% dice "sube volumen", y salen del mismo dato en la misma
pantalla. El pie de la cifra le impide detectarlo porque le jura que los viajes
sin ingreso quedaron fuera. Para el equipo: hay dos motores de contribución y el
que tiene el criterio correcto escrito y probado (`libro_viaje.ts:151-167`, que
devuelve `null` si falta cualquier mitad) no es el que alimenta la pantalla de
flota — y ya empezó a citar al equivocado como referencia.

**Causa raíz probable.** `getRentabilidad` agrega como dos consultas
independientes los dos lados de una misma razón; nadie cruzó `liquidacion`
contra el conjunto de viajes del numerador, y `comercial.ts` no importa el
`contribucion()`/`margenPct()` que ya existe a 300 metros.

---

### [ALTO] "Dinero observado" quedó implementado DOS veces con filtros distintos — uno en SQL (0112) y otro en TS, en la misma página, y el comentario afirma que son el mismo total

`supabase/migrations/0112_agregados_rpc.sql:322-326` (el CTE `base` filtra
`d->>'tipo' in ('sobre_politica','duplicado')`) y `:334`
(`'diferenciaDetectada'`) · contra `src/lib/likida/analytics.ts:258-281`
(`getDineroObservadoPorTipo`, **sin filtro de tipo**: recorre todo
`liquidacion.diferencias` y suma `Math.abs`) · el comentario que los ata es
`analytics.ts:253-256`: *"`getKpis` suma el total; esta lo abre para la dona del
agente — misma fuente (`liquidacion.diferencias`), mismo valor absoluto."* ·
las dos se piden en la MISMA página, `src/app/dashboard/agentes/liquidacion/page.tsx:51`
y `:60`, ambas sin ventana · el total de la dona se pinta en
`src/app/dashboard/agentes/liquidacion/vista.tsx:76` y `:203`, bajo el rótulo de
`:194-195`.

**Escenario, con valores.** Una liquidación: anticipo $20,000, comprobado
$12,000, y un gasto $500 arriba del tope de la política. El motor empuja dos
diferencias (`cuadre/engine.ts:454-455`, `tipo:'sobre_politica'`, `monto: 500`;
y `:662-667`, `tipo:'anticipo'`, `monto: round2(20,000 − 12,000) = 8,000`).

- SQL: `kpis_liquidacion_tenant` filtra por tipo → `diferenciaDetectada` =
  **$500.00**.
- TS: `getDineroObservadoPorTipo` no filtra → `[{anticipo, 8000}, {sobre_politica, 500}]`,
  y `vista.tsx:76` los suma → `totalObservado` = **$8,500.00**, impreso a 22 px
  en `vista.tsx:203` bajo *"Dinero observado — Lo que el agente atrapó fuera de
  regla o duplicado"*.

Los $8,000 son el remanente del anticipo que el operador regresa: ni está fuera
de regla ni está duplicado. Lo mismo entra por `efectivo_no_elegible`
(`engine.ts:380`, `monto: g.monto`, el gasto **completo**),
`efectivo_sobre_15` (`:373`) y `viatico_excede_fiscal` (`:943-944`).

**Consecuencia.** Hoy el choque no se ve en pantalla por un accidente:
`diferenciaDetectada` viaja dentro de `DashboardKpis` y `vista.tsx:88-91` pinta
los otros cuatro campos del mismo objeto, no ese. O sea que las dos cifras ya
están calculadas, ya llegan juntas al mismo componente, y basta con una tarjeta
más para que la pantalla se contradiga a sí misma ($500 arriba, $8,500 abajo).
Lo que sí se ve hoy es el rótulo falso de la dona. Para el equipo, el daño es el
del rubro: cambiar qué cuenta como "dinero observado" exige tocar una migración
SQL y un `for` de TypeScript, y lo único que declara que van juntos es un
comentario que **ya es falso** — la migración fue explícita en no duplicar la
ley fiscal (`0112:39-65`) y duplicó esta definición sin notarlo.

**Causa raíz probable.** El agregado se movió a SQL leyendo `getKpis`, no el
concepto: nadie buscó el segundo lector de `liquidacion.diferencias` que vivía
80 líneas más abajo en el mismo archivo.

---

### [ALTO] Dos migraciones se llaman 0112: la compuerta `npx tsc` está ROJA hoy, y la exención de la migración de agregados quedó pisada en silencio

`supabase/migrations/0112_agregados_rpc.sql` y
`supabase/migrations/0112_config_llave_agentes.sql` (los dos únicos con número
repetido en las 120) · el guardián que los identifica por el prefijo de 4
dígitos: `src/lib/likida/migraciones_verificadas.test.ts:113`
(`num: f.slice(0, 4)`) y las claves de `EXENTAS`, donde `'0112'` aparece **dos
veces**: `:53` y `:61`.

**Escenario, verificado corriendo la compuerta.**

```
$ npx tsc --noEmit -p .
src/lib/likida/migraciones_verificadas.test.ts(61,3): error TS1117:
  An object literal cannot have multiple properties with the same name.
```

Es el único error del proyecto: la compuerta declarada del pase (MAPA.md:93)
está en rojo. `npx vitest run` sobre ese archivo **pasa** (4 tests verdes) — vite
solo emite `warning: Duplicate key "0112"`, así que la suite no protege nada
aquí.

Y el efecto silencioso: en JavaScript la segunda clave gana. La razón escrita
para **`0112_agregados_rpc.sql`** (`:53`, la que explica por qué la migración
que movió cuatro agregados de dinero a SQL no necesita bloque) queda descartada
en tiempo de ejecución, y las DOS migraciones quedan exentas por el texto de
`:61`, que habla de `config_tenant_valida` y de la lista blanca de `agentes`.
El test que existe para que *"toda migración tome una decisión explícita"*
(`:22-23`) ya no puede sostener dos decisiones para dos archivos que comparten
número — y tampoco lo detecta: `EXENTAS['0112']` existe, así que ninguna de las
dos entra al chequeo contra los títulos de `verificaciones.sql`.

**Consecuencia.** Para el equipo: el número de migración es la identidad en tres
lugares a la vez (el nombre del archivo, la clave de `EXENTAS`, y el `\b0112\b`
que se busca en los títulos de `verificaciones.sql`), y esa identidad ya no es
única. La siguiente migración que colisione se comportará igual: guardián verde,
decisión perdida, y `tsc` rojo solo si la colisión cae en `EXENTAS`. El orden de
aplicación entre las dos también pasa a depender del que lea el directorio —
`ci-postgres.yml:130` usa el glob del shell (alfabético: `agregados` antes que
`config`), que no es el mismo criterio que "por número de versión".

**Causa raíz probable.** Dos ramas escribieron su migración contra el mismo
`master` en la misma tarde y ninguna herramienta reclama el número; el guardián
que sí podría reclamarlo lo usa como clave de un objeto en vez de comprobar su
unicidad.

---

### [ALTO] `CONCEPTO_LABEL` sigue duplicado y divergido en el archivo que la prueba guardián no mira — REINCIDENTE (4ª ronda; es el ejemplo canónico del rubro)

`src/app/dashboard/gasto-semanal-chart.tsx:9-13` (`caseta: 'Casetas'`,
`factura: 'Facturas'`, `otro: 'Otros'`, usado en `:40`) contra
`src/lib/likida/cuadre/engine.ts:1181` (`caseta: 'Caseta'`, `factura: 'Factura'`,
`otro: 'Otro'`) y `src/app/dashboard/[id]/page.tsx:29-32`. El guardián:
`src/lib/likida/etiquetas_sincronizadas.test.ts:36-37` — sigue comparando
únicamente `engine.ts` con `[id]/page.tsx` — y `:43-44`, que prohíbe el
identificador `CONCEPTO_LABEL` solo dentro de `pdf.ts`.

**Escenario.** `getGastoPorSemana` devuelve la CLAVE cruda como nombre de serie
(`analytics.ts:502`, `nombre: concepto`). Con un gasto de caseta de $2,400:
`/dashboard` → "Gasto por categoría" (`panel-periodo.tsx:98` →
`GastoSemanalChart`) pinta la leyenda **"Casetas"**;
`/dashboard/combustible-casetas` y `/dashboard/{id}` y el PDF que el contralor
manda a su contador dicen **"Caseta"**.

**Consecuencia.** El comentario del propio guardián dice *"esto no es un test de
etiquetas: es el mecanismo que evita la tercera"* — y la tercera ya ocurrió,
sobrevivió a la ronda que la marcó como ALTO, sobrevivió a 37 commits más, y
sigue viva. El daño para el equipo es peor que el del usuario: la prueba **cree**
que vigila el patrón, así que el archivo nuevo nº4 nacerá igual de desprotegido.
El único mapa que compara es el de `[id]/page.tsx`, que su propio comentario
(`:23-25`) declara *"traducción de respaldo"* — ya ni siquiera pinta el renglón.

**Causa raíz probable.** La guardia está escrita contra dos rutas fijas y un
identificador prohibido en un archivo, no contra "cualquier mapa de conceptos en
`src/`". `normas_sincronizadas.test.ts:31-43` sí lo hace bien y está al lado.

---

### [ALTO] El formateo `es-MX` fuera de `formato.ts` pasó de tres a CUATRO, y el cuarto es una copia literal del tercero — REINCIDENTE, empeorada por un subsistema nuevo

`src/lib/formato.test.ts:215-228` (el grep es el literal
`toLocaleString('es-MX'`, comillas simples, un solo método) contra
`src/lib/agents/copiloto.ts:186-188` — **nuevo esta ronda** —,
`src/lib/agents/analista.ts:294-296`, `src/lib/likida/hitos_viaje.ts:116-119` y
`src/lib/saludo.ts:37`.

**Escenario.** `copiloto.ts:186-188` es carácter por carácter el mismo bloque que
`analista.ts:294-296`:

```ts
const fechaLarga = new Intl.DateTimeFormat('es-MX', {
  timeZone: TZ_MX, weekday: 'long', day: 'numeric', month: 'long',
  year: 'numeric', hour: 'numeric', minute: '2-digit',
}).format(ahora);
```

El copiloto es el subsistema que el propio MAPA describe como *"NUEVO y sin
auditar nunca"*, y su encabezado (`copiloto.ts:5-13`) presume de **reusar** las
guardias del analista en vez de copiarlas — reusa `validarBloques`,
`cifrasRespaldadas` y `extraerNumeros` (`:21`) y copia el formateador. La reja
sigue verde ante los cuatro. Lo que ya cuesta hoy:

- `formato.ts:197` usa `hourCycle: 'h23'` **explícitamente** porque *"«24:00» no
  es una hora que exista"*; `hitos_viaje.ts:118` usa `hour12: false`. Entra: el
  chofer manda "ya llegué" a las **00:05** de CDMX → `mensajeHito`
  (`hitos_viaje.ts:129`) le contesta *"Anotado: llegaste a las **24:05**"* en
  cualquier build de ICU que resuelva `hour12: false` a `h24`, mientras
  `/dashboard/viajes` imprime el mismo sello como **"00:05"** vía `fechaHoraMx`.
- La reja tampoco atrapa `"es-MX"` con comillas dobles ni
  `Intl.NumberFormat('es-MX')`. Hoy no hay dinero fuera de `formato.ts` — se
  verificó archivo por archivo—, pero eso es suerte, no la prueba.

**Consecuencia.** CLAUDE.md le promete al siguiente agente que *"hay una prueba
que falla si aparece `toLocaleString('es-MX')` en cualquier otro archivo"*, y la
prueba cubre una de las cuatro formas de escribirlo. El caso nuevo demuestra el
modo de propagación exacto: se copia el archivo más parecido, y el más parecido
ya traía la copia.

**Causa raíz probable.** El guardián se escribió contra el síntoma concreto del
día (`toLocaleString`) y no contra la clase (cualquier formateo con localización
mexicana fuera de `formato.ts`).

---

### [ALTO] El motor "puro" sigue arrastrando `sharp`, `zxing-wasm` y `node:fs` por dos regex de RFC — REINCIDENTE

`src/lib/likida/cuadre/engine.ts:15`
(`import { esRfcValido, rfcChecksumOk } from '../intake/cfdi'`) →
`src/lib/likida/intake/cfdi.ts:11-15` (`import sharp from 'sharp'`,
`node:fs/promises`, `node:module`, `node:path`, `zxing-wasm/reader`).

**Escenario.** Se recorrió el grafo completo del motor esta ronda: `cuadre/util.ts`,
`cuadre/fecha_dudosa.ts`, `intake/sanitizar.ts`, `facturacion/caducidad.ts`,
`normas/indice.ts` no importan **nada**; `cuadre/tope_alimentacion.ts:48` solo
`formato.ts`; `facturacion/identificar.ts:12` solo su catálogo. `intake/cfdi.ts`
es la **única** impureza del grafo, y entra por un import estático usado una
sola vez (`engine.ts:228`). Seis módulos de `/dashboard` importan `engine.ts`
solo para `etiquetaConcepto`, una función de dos líneas.

**Consecuencia.** `engine.ts:6` afirma *"Es una función pura → testeable,
auditable, sin sorpresas"* y `:20` insiste *"`formato.ts` no importa NADA: el
motor sigue siendo puro y sin I/O"*. Las dos frases son falsas por un solo
import, y `next.config.ts` ya midió el precio (`sharp-libvips`, 15.34 MB). Para
el equipo: la puerta de pureza está declarada en prosa, no verificada — el
siguiente import "inofensivo" del motor hacia `intake/` entra igual y nada se
pone rojo. Y está a un `grep` de distancia de verificarse: el grafo tiene seis
archivos.

**Causa raíz probable.** `intake/cfdi.ts` mezcla dos naturalezas —validación pura
de RFC/UUID y decodificación de códigos de barras sobre imagen— en un archivo.

---

### [ALTO] Tres páginas vivas siguen fuera del menú, incluida la del alta de usuarios — REINCIDENTE

`src/app/dashboard/rutas.ts` (28 `href`, enumerados) contra las 33 páginas
reales de `src/app/dashboard/**/page.tsx`. Las huérfanas, verificadas por
diferencia de conjuntos y por `grep` de `href` sobre todo `src/`:
`/dashboard/arco` (`arco/page.tsx:19`), `/dashboard/usuarios`
(`usuarios/page.tsx:15`) y `/dashboard/politicas` (`politicas/page.tsx:51`).

**Refutación parcial que sí corresponde acreditar.** El pase 3 no listó
`/dashboard/contador`, y hoy tampoco es huérfana: `visibilidad.ts:262`
(`inicioDe`) manda ahí al rol con área `dinero` y `sidebar-nav.tsx:99` lo usa
como inicio. Queda fuera de la lista.

**Escenario.** Un `flota_admin` que quiere invitar a su contador recorre las 28
entradas del sidebar y no hay camino a `/dashboard/usuarios`; solo tecleando la
URL. Igual `/dashboard/politicas`, la pantalla donde se edita la política de
gasto que el motor SÍ lee (`tenant.config.politica`): su único enlace en todo el
repo es `src/app/admin/flotas/page.tsx:295`, o sea desde la consola de Javier —
la flota no puede editar su propia política desde su propio panel. Y
`/dashboard/arco` es donde la flota responde solicitudes ARCO en 20 días hábiles.

**Consecuencia.** El argumento comercial de D6 —"el dueño invita a su propio
contralor, ya no pasa por Javier"— sigue siendo falso en el producto por
segunda ronda. El propio `rutas.ts:99-101` declara la regla que se rompe: *"nada
debe ser alcanzable solo tecleando URL"*. Modo de falla mudo: `tsc` pasa (salvo
por el 0112), las pruebas pasan.

**Causa raíz probable.** "Qué páginas tiene el panel" está escrito dos veces con
propósitos distintos (pintar en `rutas.ts` vs. autorizar en
`visibilidad.ts:76-179`) y nada compara las listas; `visibilidad.test.ts` ya
itera una de ellas para otra cosa.

---

### [MEDIO] La promesa "un agente nuevo es una fila, no una migración" no se sostiene: la identidad de un agente vive en cinco sitios y tres son código cerrado

`src/lib/likida/agentes/definiciones.ts:4-5` (*"Un agente nuevo es una FILA, no
una migración"*) y `src/app/admin/agentes/contenido.tsx:134-135` (la misma frase
en pantalla, sobre la forma de alta de `:168-188`) · contra las otras cuatro
casas del mismo concepto: `supabase/migrations/0116_agente_definicion.sql:69-77`
(la siembra de los 7, con `nombre` y `disparador`),
`src/lib/likida/agentes/notificaciones.ts:53,86-115` (`AgenteId`, 6 valores, con
su propio `nombre` y `ruta`), `src/lib/likida/agentes/corridas.ts:23`
(`AgenteConCorridas`, 7 valores) y `src/lib/likida/interruptores.ts:32-37`
(`INTERRUPTORES`, 8 valores) espejado por el CHECK
`interruptor_id_dominio` de `supabase/migrations/0110_interruptores.sql:69-70`.

**Escenario.** Javier da de alta `cazador_censo` desde la forma de
`/admin/agentes`. La fila entra (`definiciones.ts:144-153`) y aparece en la
tabla. A partir de ahí, todo lo que hace a un agente ser un agente exige tocar
código:

- registrar una corrida → `registrarCorrida` tipa `agente: AgenteConCorridas`
  (`corridas.ts:23`), un literal nuevo **no compila**;
- apagarlo → `apagar()` exige `NombreInterruptor` (`interruptores.ts:41,55`) y
  la base lo rebota con el CHECK de la 0110: hace falta **una migración**. La
  celda "Kill switch" de su propia fila ya lo dice hoy —
  `contenido.tsx:105`, *"Sin palanca propia"*;
- avisarle a la flota si falla → `AGENTES_NOTIFICABLES` no lo contiene.

**Consecuencia.** El criterio de terminado escrito en el módulo y repetido al
usuario en pantalla describe una arquitectura que el repo no tiene. Para el
equipo el costo real de un agente nuevo es cinco archivos y una migración, con
la trampa de que los cuatro primeros pasos parecen funcionar. Nada compara la
tabla contra los tres tipos cerrados: el día que alguien pause `ventas` en la
tabla, `interruptores.ts` y `corridas.ts` siguen creyendo que existe.

**Causa raíz probable.** El catálogo declarativo se agregó **al lado** de los
tres catálogos de tipos que ya existían en vez de convertirse en su origen, y la
FK de la 0116 (`agente_corrida_agente_fk`) ata la base a la tabla pero deja
`AgenteConCorridas` como una segunda verdad sin nada que la sincronice.

---

### [MEDIO] Una page component reimplementa a mano una lectura que ya vive en `lib/admin`, con Supabase crudo y otro mapeo

`src/app/admin/agentes/contenido.tsx:32-42` (`ultimaCorridaDe`: `from('agente_corrida')`,
`.eq('agente', …)`, `.order('inicio', desc)`, `.limit(1)`) contra
`src/lib/admin/negocio.ts:549-561` (`getUltimaCorridaPorAgente`, la misma
consulta con `COLUMNAS_CORRIDA` + `mapearCorrida`), consumida por
`src/app/admin/consola.tsx:108`.

**Escenario.** El comentario de la copia declara el porqué (`:30-31`: *"dinámico
— a diferencia de getUltimaCorridaPorAgente, que itera los 7 fijos"*), y es una
razón real. El precio es que hoy dos pantallas de `/admin` leen "la última
corrida del agente X" con dos SELECT y dos mapeos distintos: la consola pinta lo
que devuelva `mapearCorrida` (duración, tareas, resumen), `/admin/agentes` solo
`inicio` y `estado` crudos. Entra: se agrega una columna a `agente_corrida` —
digamos `actor`, que la 0120 acaba de introducir— y se refleja en
`COLUMNAS_CORRIDA`; `/admin/agentes` no se entera y sigue pintando la ficha vieja
sin que nada falle.

**Consecuencia.** Es la frontera del repositorio cediendo en el sitio más caro
de vigilar: hoy hay **31 archivos bajo `src/app/`** que llaman `supabaseAdmin()`
directo (99 en todo `src/`, eran 94 el pase pasado), y este es el ejemplo nuevo
de la ronda con un gemelo demostrable a 500 líneas. Para el equipo: no existe
"la consulta de la última corrida", existen dos.

**Causa raíz probable.** La función de `lib/` tiene la lista de agentes
horneada dentro (`AGENTES_BITACORA`) en vez de recibirla como parámetro, así
que el llamador dinámico no pudo reusarla y escribió la suya donde estaba
pintando.

---

### [MEDIO] `PILL_ESTATUS` de `viaje.estatus` sigue en tres copias, en el archivo cuyo comentario existe para impedirlo — REINCIDENTE

`src/app/dashboard/resumen-visual.tsx:106` (la copia canónica, exportada) ·
`src/app/dashboard/viajes/vista.tsx:25` y
`src/app/dashboard/viajes/libro.tsx:58` (gemelas literales entre sí).

**Escenario.** `resumen-visual.tsx:100-102` dice, textual: *"dos mapas se separan
al primer estatus nuevo, que es exactamente como se rompió `CONCEPTO` dos
veces"*. Hoy las tres dicen lo mismo, así que **no hay bug visible**: lo que hay
es que el día que `viaje_estatus_dominio` gane un cuarto valor —o que `en_cuadre`
se re-rotule— `/dashboard` lo pinta bien y `/dashboard/viajes` + el libro del
viaje caen al `??` y pintan la clave cruda.

**Consecuencia.** El costo de tocar el vocabulario de estatus del viaje son tres
archivos, y el que documenta el peligro es justo el que se ignoró. El mecanismo
"exporta la constante y ponle un comentario" ya se probó insuficiente tres veces
en este repo (`CONCEPTO`, `ESTATUS`, y ahora `es-MX` en el copiloto).

---

### [MEDIO] La flecha `/admin` ↔ `/dashboard` sigue apuntando en las dos direcciones y creció — REINCIDENTE

`src/app/dashboard/resumen-visual.tsx:3-4` (importa `../admin/ui/formato-preset`
y `../admin/ui/kit`) contra **36 archivos** de `/admin` y `/vendedor` que
importan `dashboard/resumen-visual` (eran 33 el pase pasado). El más nuevo es
`src/app/admin/agentes/contenido.tsx:10` — la pieza estrella de la ronda. En
sentido contrario hay 39 imports de `/dashboard` hacia `admin/ui`.

**Escenario.** CLAUDE.md declara una sola dirección: *"`/dashboard` … Reusa los
componentes de `/admin` … no hay una segunda librería de UI"*. `BarraPagina` y
`TituloSeccion` viven en el panel del CLIENTE y hoy los consumen 36 archivos de
la consola de Javier. Entra: alguien reestructura `/dashboard` —cosa que ya pasó
el 10-ago— y mueve o renombra `resumen-visual.tsx` → se caen 36 archivos de la
parte del producto que el documento describe como aislada.

**Consecuencia.** No hay ciclo a nivel de archivo, así que no truena en runtime;
el costo es que ninguno de los dos directorios se puede tocar o extraer sin el
otro, y el mapa mental que CLAUDE.md le da al siguiente agente dice que sí. La
tendencia es la parte que importa: la ronda que "no tocó UI" sumó tres cruces
más.

---

### [MEDIO] "Viajes vigilados · abiertos o en cuadre" sigue midiendo otro universo — REINCIDENTE

`src/lib/likida/agentes/cobranza.ts:122` (`.in('estatus', ['abierto','en_cuadre'])`),
`:129` (`.not('avisado_en','is',null)`) y `:155` (`vigilados: viajes.length`) ·
`src/app/dashboard/agentes/cobranza/vista.tsx:67` (`nota="abiertos o en cuadre"`).

**Escenario.** Flota con 40 viajes abiertos/en cuadre: 25 creados desde Despacho
(con `avisado_en`) y 15 importados del TMS (sin aviso). `/dashboard/agentes/cobranza`
→ KPI **"Viajes vigilados: 25"**, nota *"abiertos o en cuadre"*. `/dashboard/viajes`
→ KPIs `contarViajes` exactos: **Abiertos + En cuadre = 40**. Dos pantallas del
mismo panel, el mismo rótulo, 25 contra 40.

**Consecuencia.** Cobranza es el agente cuya promesa es "no se me escapa un
comprobante"; un KPI que declara vigilar un universo mayor del que vigila es lo
contrario de esa promesa, y los 15 viajes del TMS quedan sin decir que nadie los
persigue.

**Causa raíz probable.** El resultado de la consulta de trabajo se recicla como
métrica de pantalla: `vigilados` es `viajes.length` de la cola, no un conteo
propio.

---

### [MEDIO] `sufijoTenant` existe y cinco páginas lo siguen reimplementando en línea — REINCIDENTE

`src/app/dashboard/sufijo.ts:21-26` (con `encodeURIComponent`, importado por 34
sitios) contra las copias literales sin escapar en
`src/app/dashboard/page.tsx:36`, `despacho/page.tsx:44`,
`agentes/liquidacion/page.tsx:44`, `agentes/facturas/page.tsx:35` y
`agentes/cobranza/page.tsx:52`. Sexta variante documentada a propósito en
`sidebar-nav.tsx:68` (Client Component).

**Escenario.** Ya divergieron: el canónico escapa los tres parámetros, las cinco
copias los concatenan crudos. Con los valores de hoy (UUID, `vista=demo`,
nombres de rol) el resultado no cambia, así que **no hay bug visible**; lo que
hay son seis lugares que tienen que enterarse del próximo parámetro de contexto.
El historial del propio archivo (`sufijo.ts:12-18`) cuenta el precio: `?rol=` se
agregó al sidebar y NO a los links de la página, y "ver como" se apagaba a media
navegación.

---

### [BAJO] Ocho mapas de rol→etiqueta, ya divergidos: el mismo usuario tiene tres nombres en tres pantallas — REINCIDENTE

`src/app/dashboard/chrome.tsx:27` (`'ADMIN FLOTA'`) ·
`src/app/dashboard/mi-perfil/page.tsx:13` y `src/app/admin/mi-perfil/page.tsx:11`
(`'Dueño / Admin de flota'`) · `src/app/dashboard/aviso-rol.tsx:8` y
`src/app/dashboard/agentes/notificaciones-forma.tsx:46` (`'Dueño de la flota'`,
`encargado: 'Jefe de tráfico'`) · `src/app/admin/equipo/page.tsx:16` ·
`src/app/dashboard/usuarios/vista.tsx:12` · `src/lib/agents/analista.ts:283`
(`'dueño/administrador de la flota'`).

**Escenario.** Un `encargado` abre `/dashboard/mi-perfil` y lee **"Encargado"**;
la insignia de la esquina, en esa misma vista, dice **"ENCARGADO"**; abre
Notificaciones y la casilla que decide si le llegan correos dice **"Jefe de
tráfico"**.

**Consecuencia.** No rompe dinero ni permisos (los ocho caen a `?? rol`). Es
vocabulario del producto con ocho dueños y ninguno canónico; el rol que se
agregue tendrá que tocarse ocho veces.

---

### [BAJO] `OperadorStat.viajes` cuenta viajes con carga de diésel, no viajes — REINCIDENTE

`src/lib/likida/analytics.ts:311-317,330`: `viajesPorOp` solo se llena dentro
del bucle de `gastos`, que la consulta ya acotó a `.eq('concepto','diesel')`
(`:292`). Un operador con 8 viajes de los que 3 cargaron diésel sale con
`viajes: 3`. Hoy inofensivo: el único consumidor
(`agentes/liquidacion/page.tsx`) usa `nombre` y `diferencias`. Superficie muerta
con un nombre que promete otra cosa.

---

### [BAJO] `topeDescuento` formatea pesos con `toFixed(2)` y sigue sin llamador de producción — REINCIDENTE

`src/lib/likida/laboral/pagadero.ts:147` (`${exigible.toFixed(2)}` y
`${descuentoPeriodo.toFixed(2)}`) — el archivo importa `mxn` y lo usa bien en
`resumenLaboral`. El único consumidor en todo `src/` es su propia prueba
(`pagadero.test.ts:76-107`), que ya lo documenta (`:115`). Si alguien la conecta,
el contralor lee *"exigir hasta 12500.00"* junto a *"$12,500.00"* en el párrafo
de al lado, y `formato.test.ts` no lo atrapa.

---

### [BAJO] La leyenda de la ventana de 100 sigue escrita a mano en Conductores — REINCIDENTE

`src/app/dashboard/agentes/conductores/vista.tsx:67,70` (el literal "100")
contra `mapa/vista.tsx`, `viajes/vista.tsx` y `huerfanos/vista.tsx`, que reciben
`cargados` (el `viajes.length` real). El default vive en `analytics.ts`
(`limite = 100`). Cambiar el default deja a Conductores declarando una ventana
que ya no existe.

## Verdades duplicadas

| El concepto | Dónde vive cada copia | ¿Ya divergieron? |
|---|---|---|
| **Contribución y margen** | `libro_viaje.ts:151-167` (pura, `null` si falta una mitad) · `comercial.ts:158-159` (agrega dos universos) | **SÍ, con dinero de por medio** — "—" en una pantalla, "−166.67%" en otra |
| **"Dinero observado"** | `0112_agregados_rpc.sql:322-334` (SQL, filtra 2 tipos) · `analytics.ts:258-281` (TS, todos los tipos) | **SÍ, esta ronda** — $500 vs $8,500 sobre la misma liquidación |
| Identidad de un agente | `agente_definicion` (0116:69-77) · `notificaciones.ts:53` · `corridas.ts:23` · `interruptores.ts:32` + CHECK 0110 · `rutas.ts` | Parcial — cardinalidades 7/6/7/8 y ningún guardián |
| Etiqueta de concepto de gasto | `engine.ts:1181` · `[id]/page.tsx:29` · **`gasto-semanal-chart.tsx:9-13`** | **SÍ (4ª ronda)** — 'Caseta'/'Casetas', 'Otro'/'Otros' |
| Formateo con localización mexicana | `formato.ts` (canónico, `hourCycle:'h23'`) · `saludo.ts:37` · `analista.ts:294` · `hitos_viaje.ts:117` · **`copiloto.ts:186`** | **SÍ** — y el guardián solo greppea `toLocaleString('es-MX'` |
| "La última corrida del agente X" | `admin/negocio.ts:549` (`COLUMNAS_CORRIDA` + `mapearCorrida`) · `admin/agentes/contenido.tsx:32` (crudo) | **SÍ en columnas** — la copia solo lee `inicio` y `estado` |
| Identidad de una migración | nombre de archivo · `EXENTAS` de `migraciones_verificadas.test.ts:53,61` · títulos de `verificaciones.sql` | **SÍ** — dos archivos "0112", `tsc` rojo, una exención pisada |
| Etiqueta y color de `viaje.estatus` | `resumen-visual.tsx:106` (canónica) · `viajes/vista.tsx:25` · `viajes/libro.tsx:58` | No todavía — tres copias idénticas |
| Nombre visible de un rol | 8 mapas (ver el BAJO) | **SÍ** |
| Qué páginas existen en `/dashboard` | `rutas.ts` (navegar) · `visibilidad.ts:76-179` (autorizar) | **SÍ** — arco/usuarios/politicas solo en la segunda |
| El sufijo `?tenant/?vista/?rol` | `sufijo.ts:21` (escapa) · 5 copias en línea · `sidebar-nav.tsx:68` (a propósito) | **SÍ, sin efecto hoy** |
| Topes anti-quemadura del LLM | `analista.ts:325-327,367-369` · `copiloto.ts:206-208,236-238` | No — literales idénticos, copiados con el porqué escrito |
| Índice de normas ↔ fichas YAML | `normas/indice.ts` · `normas/*.yaml` | **No** — `normas_sincronizadas.test.ts` compara en las dos direcciones |

## Lo que revisé y está bien

- **El movimiento de agregados a SQL NO dejó la lógica en dos lugares — que era
  la pregunta central de esta ronda.** `getSerieComparativa`
  (`analytics.ts:101-133`), `getKpis` (`:176-200`) y `getAcreditables`
  (`:637-656`) fueron **reescritas**, no duplicadas: las tres llaman su RPC y no
  queda un `traerTodo` paralelo. Las tres validan la forma del `jsonb` y
  **lanzan** citando la migración (`:118-123`, `:189-191`, `:645-647`) en vez de
  leer un cero — el fail-closed que el rubro pedía. `sumar_combustible_ejercicio`
  cerró el caso opuesto: una RPC aplicada desde el 5-ago con **cero llamadores**,
  hoy conectada.
- **La única copia del bucketeo JS que sobrevive está en el test y está
  declarada como oráculo** (`analytics_serie_comparativa.test.ts:51-70`,
  `legacySerieJs`), y el SQL real **sí se ejecuta** contra Postgres en CI:
  `verificaciones.sql` bloque 89 llama las cuatro funciones con dos flotas
  sembradas y compara cifras a mano (`comb_total=2300`, `kpis_ok`, `acred_ok`,
  `serie_ok`), disparado por `.github/workflows/ci-postgres.yml:156-160`. Es la
  primera vez que este repo prueba SQL de verdad.
- **La migración 0112 se NEGÓ explícitamente a duplicar la ley fiscal**
  (`0112_agregados_rpc.sql:39-65`): dejó `getGastosFiscales` en TS con la razón
  escrita —"la lógica es demasiado móvil para vivir en dos sitios"—, que es
  exactamente el criterio de este rubro, argumentado mejor que en la mayoría del
  repo.
- **El copiloto no reimplementa el dominio ni toca SQL.** `copiloto-tools.ts:16-26`
  importa once funciones de `lib/admin`, `lib/likida/interruptores`,
  `lib/likida/vendedores` y `lib/saas/transferencia`; cero `from(...)` crudo.
  Reusa `validarBloques`/`cifrasRespaldadas`/`extraerNumeros` de `analista.ts:21`
  en vez de copiarlas, y `copiloto-acciones.ts:115` delega en el mismo `apagar()`
  que el ⌘K y `/admin/observabilidad` — una sola bitácora.
- **`guardia.ts` es una separación pura bien hecha**: `clasificarBandeja`
  (`:89-109`) no toca la base y `clasificacionDeGuardia` (`:113-116`) es el único
  borde impuro, sobre `getBandejaEscalaciones` — no reimplementa ninguna de las
  seis fuentes.
- **`cola.ts` deja el candado en el esquema, no en el archivo**: `:12-15`
  documenta que "enviar" lo rebota el CHECK `cola_enviado_solo_aprobado` de la
  base y que toda transición va anclada a `estado = 'pendiente'`; `encolarPieza`
  traduce el `23503` de la FK a `agente_definicion` en texto de pantalla
  (`:57-58`).
- **El motor de la liquidación sigue teniendo UNA sola casa.** Ningún archivo
  fuera de `cuadre/` recalcula `totalComprobado` ni `diferencia`; `analytics.ts`,
  `[id]/page.tsx` y `export/` leen la columna persistida.
- **Cero imports `lib/ → app/`** (verificado por grep sobre todo `src/lib`). La
  capa de dominio sigue sin conocer la UI, con 110 archivos nuevos encima.
- **`pmf.ts` nació como módulo propio con la razón escrita** (`:19-22`) en vez de
  engordar `analytics.ts`, y cada señal lleva el discriminante `medida` para que
  el llamador no pueda pintar un porcentaje sin pasar por él.
- **`normas_sincronizadas.test.ts` sigue siendo el guardián que el rubro querría
  en todas partes** — enumera el directorio y falla en las dos direcciones. Es el
  contraste directo con `etiquetas_sincronizadas.test.ts` y con `EXENTAS`.

## Lo que NO alcancé a revisar

- **El límite real del repositorio, otra vez.** 99 archivos de producción llaman
  `supabaseAdmin()` directo (94 en el pase 3), **31 de ellos bajo `src/app/`**.
  No tracé qué consultas están duplicadas entre `analytics.ts`, `operacion.ts`,
  `comercial.ts`, `fiscal.ts` y las páginas: el MEDIO de `ultimaCorridaDe` es una
  muestra de lo que hay ahí, no el inventario.
- **`processor.ts` (2,300+ líneas) como unidad** y `facturacion/al_vuelo.ts`.
- **`wa_pendientes.ts` + `wa_evento_pendiente` (0119/0120)** desde el ángulo de
  "cuántas máquinas de estado de envío hay ahora" — hay al menos dos colas con
  reintento (`cola_aprobacion` y `wa_evento_pendiente`) que no comparé.
- **`src/lib/observability/`** y los siete agentes desde el ángulo de "cuánta
  lógica de decisión se repite entre `ejecutar*` y su página".
- **`carta-porte/`** (los 37 campos por responsable): superficie nueva completa,
  no verifiqué si el mapa de responsables está escrito una o dos veces.
- **`src/lib/correo/`** más allá de comprobar que `cola.ts` usa `enviarCorreo`
  y no arma su propio transporte.
