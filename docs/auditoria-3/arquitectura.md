# Arquitectura y mantenibilidad — auditoría 3 (pase 3)

**Nota: 4/10** (antes 5). Razón del movimiento: **se atacó y subió, y la deuda
cobró factura el mismo pase**. Lo que se arregló es real y se acredita abajo
(ARQ-C1 cerrado con la ventana DECLARADA en cuatro páginas, la bandera de
cobertura unificada, el `.limit(2000)` sin orden de peajes y el `.limit(500)` de
cobranza convertidos en lecturas honestas). Pero el ancla del rubro es
categórica: **"4 o menos si la misma lógica de dinero vive en más de un
archivo"**, y desde esta semana `contribución/margen` vive en dos —
`libro_viaje.ts`, que se niega a adivinar, y `comercial.ts`, que adivina y lo
rotula como medición—. Además, el ejemplo canónico del rubro (`CONCEPTO_LABEL`)
**reincide por tercera ronda**, tres páginas vivas siguen fuera de la navegación
—ahora incluida la funcionalidad estrella de esta semana (D6)— y el motor
"puro" sigue arrastrando `sharp`.

**El riesgo mayor, hoy:** `/dashboard/rentabilidad` calcula el margen de la
flota dividiendo un ingreso de N viajes entre un costo de TODOS los viajes, y
debajo imprime la frase *"medido solo sobre los N viajes con ingreso
capturado"* — una cifra de dinero inventada con un rótulo que afirma
explícitamente lo contrario de lo que el código hace.

## Hallazgos

### [CRÍTICO] La contribución de la flota se mide con ingreso de N viajes y costo de TODOS — y el rótulo afirma lo contrario

`src/lib/likida/comercial.ts:132-162` (la consulta de costo, `:140-145`, no
filtra a los viajes con ingreso; el cálculo, `:157-158`) ·
`src/app/dashboard/rentabilidad/vista.tsx:64` (la tarjeta) y `:69` (la frase) ·
contra la implementación correcta del MISMO concepto en
`src/lib/likida/libro_viaje.ts:152-155` (`contribucion`) y `:163-167`
(`margenPct`), usada en `:523-524`.

**Escenario.** Flota con 10 viajes. Tres entraron por Despacho con
`ingreso_flete = $50,000` cada uno ($150,000). Siete entraron por WhatsApp
—`crear_viaje_wa.ts` no captura ingreso— con `ingreso_flete = NULL`. Los diez se
liquidaron con `total_comprobado = $40,000` ($400,000).

- `getRentabilidad` suma `ingreso` recorriendo `viaje` y saltándose los NULL
  (`comercial.ts:147-151`) → **$150,000**, `viajesConIngreso: 3`,
  `viajesSinIngreso: 7`.
- `costoComprobado` suma `liquidacion.total_comprobado` de **la tabla entera del
  tenant** (`comercial.ts:140-145`: `.eq('tenant_id', …)` y nada más) →
  **$400,000**.
- `contribucion = round2(150,000 − 400,000)` = **−$250,000.00**;
  `margenPct = round2((−250,000 / 150,000) × 100)` = **−166.67**.
- La pantalla imprime la tarjeta *"Contribución (ingreso − comprobado):
  −$250,000.00"* y debajo, literal: *"Margen: −166.67% — medido solo sobre los 3
  viajes con ingreso capturado. 7 viajes sin ingreso quedan fuera de esta
  medición."*
- La verdad sobre esos 3 viajes: $150,000 − $120,000 = **+$30,000**, margen
  **+20%**.

Funciona en los dos sentidos: un viaje con ingreso capturado y sin liquidar
todavía mete su ingreso completo con costo cero e infla el margen. Es
exactamente el caso que `libro_viaje.ts:145-150` describe y rechaza a nivel de
renglón — *"devolver el ingreso pelón sería la versión más cara de inventar una
cifra: pinta de rentable justo el viaje del que menos se sabe"*—: en el libro
del viaje sale **"—"** con `falta: 'cerrar la liquidación del viaje'`, y en la
pantalla de flota sale un porcentaje.

**Consecuencia.** El contralor y el dueño toman decisiones de TARIFA con esto: un
−167% dice "esta flota se está quemando" y un +20% dice "sube volumen". Las dos
lecturas salen del mismo dato con la misma pantalla, y el usuario no tiene cómo
detectarlo porque el pie de la cifra le jura que los viajes sin ingreso quedaron
fuera. Rompe las dos reglas duras a la vez: "nunca inventar una cifra" y "un
rótulo tiene que ser verdad". Para el equipo: hay dos motores de contribución, y
el que ya tenía el criterio correcto escrito y probado no es el que alimenta la
pantalla de la flota.

**Causa raíz probable.** `getRentabilidad` se escribió antes que
`libro_viaje.ts` y agregó como consultas independientes dos lados de una misma
razón; nadie cruzó `liquidacion` contra el conjunto de viajes que sí entró al
numerador, y `comercial.ts` no importa el `contribucion()`/`margenPct()` que ya
existe a 300 metros.

---

### [ALTO] `CONCEPTO_LABEL` sigue duplicado y divergido, en el archivo que la prueba guardián no mira — REINCIDENTE (3ª ronda; es el ejemplo canónico del rubro)

`src/app/dashboard/gasto-semanal-chart.tsx:9-13`
(`caseta: 'Casetas'`, `factura: 'Facturas'`, `otro: 'Otros'`, usado en `:40` y
`:75`) contra `src/lib/likida/cuadre/engine.ts:1181`
(`caseta: 'Caseta'`, `factura: 'Factura'`, `otro: 'Otro'`) y
`src/app/dashboard/[id]/page.tsx:28-32`. El guardián:
`src/lib/likida/etiquetas_sincronizadas.test.ts:36-37` (solo compara `engine.ts`
con `[id]/page.tsx`) y `:43` (prohíbe el identificador `CONCEPTO_LABEL`
únicamente dentro de `pdf.ts`).

**Escenario.** `getGastoPorSemana` devuelve la CLAVE cruda como nombre de serie
(`analytics.ts:511`, `nombre: concepto`). Con un gasto de caseta de $2,400:
- `/dashboard` → "Gasto por categoría" (`panel-periodo.tsx:98` →
  `GastoSemanalChart`) pinta la leyenda **"Casetas"**;
- `/dashboard/combustible-casetas` (`page.tsx:202`, que sí usa
  `etiquetaConcepto`) pinta la barra del mismo dinero como **"Caseta"**;
- `/dashboard/{id}` y el PDF que el contralor manda a su contador
  (`pdf.ts` → `etiquetaConcepto`) dicen **"Caseta"**.

**Consecuencia.** El comentario del propio guardián dice, con todas sus letras,
*"esto no es un test de etiquetas: es el mecanismo que evita la tercera"* — y la
tercera ya ocurrió, sobrevivió a la ronda anterior que la marcó, y sigue viva
después de 81 commits. Peor para el equipo que el peor para el usuario: la
prueba **cree** que vigila el patrón, así que el archivo nuevo nº4 nacerá igual
de desprotegido. El único mapa de conceptos que la prueba compara es el que
`[id]/page.tsx` ya ni siquiera usa para pintar (`:23-25`, "traducción de
respaldo").

**Causa raíz probable.** La guardia está escrita contra una lista fija de dos
rutas y un identificador prohibido en un archivo, no contra "cualquier mapa de
conceptos en `src/`". Compárese con `normas_sincronizadas.test.ts:31-43`, que sí
lo hace bien: enumera el directorio y falla en las DOS direcciones.

---

### [ALTO] Tres páginas vivas siguen fuera del menú, y una de ellas es la funcionalidad estrella de esta semana — REINCIDENTE

`src/app/dashboard/rutas.ts:24-111` (`TODAS_LAS_RUTAS`, 28 entradas) contra
`src/lib/auth/visibilidad.ts:76-179` (`AREA_POR_RUTA`, 32 entradas). Las tres
huérfanas: `visibilidad.ts:103` (`/dashboard/arco`), `:177`
(`/dashboard/usuarios`), `:178` (`/dashboard/politicas`).

**Escenario.** El commit `fbfbeec` de ayer ("D6: el dueño invita a su propio
contralor — todo usuario nuevo ya no pasa por Javier") construyó el alta de
usuarios en `src/app/dashboard/usuarios/page.tsx:15`. Un `grep` de `href` sobre
todo `src/` no encuentra un solo enlace a esa ruta (los tres únicos aciertos son
la propia página, `visibilidad.ts` y un comentario en
`admin/vendedores/consola-vendedores.tsx:136`); `configuracion/page.tsx` no
contiene ni un `href=` en sus 188 líneas. Entra: un `flota_admin` que quiere
invitar a su contador → recorre las 28 entradas del sidebar y no hay camino;
solo tecleando `/dashboard/usuarios` en la barra.
Igual `/dashboard/politicas`, la pantalla donde se edita la política de gasto que
el motor SÍ lee (`tenant.config.politica`): su único enlace en todo el repo es
`src/app/admin/flotas/page.tsx:288`, o sea desde la consola de Javier — la flota
no puede editar su propia política desde su propio panel. Y `/dashboard/arco` es
donde la flota responde solicitudes ARCO en 20 días hábiles (LFPDPPP 32).

**Consecuencia.** El argumento comercial de D6 —"ya no pasa por Javier"— es falso
en el producto: sigue pasando por Javier, porque el dueño no tiene cómo llegar a
la pantalla. La política de gasto, que es la entrada del motor de dinero, tiene
la misma forma. El propio `rutas.ts:99-101` declara la regla que se está
rompiendo: *"nada debe ser alcanzable solo tecleando URL"*. Y el modo de falla es
mudo: el ticket dice "hecho", `tsc` pasa, las pruebas pasan.

**Causa raíz probable.** "Qué páginas tiene el panel" está escrito dos veces con
propósitos distintos (pintar vs. autorizar) y nada compara las listas.
`visibilidad.test.ts:266-272` y `:308-314` iteran `rutas.ts` para probar que el
chofer y el vendedor no entran — o sea que la lista SÍ está a mano en la prueba y
nadie comprobó la dirección contraria.

---

### [ALTO] El motor de cuadre sigue arrastrando `sharp`, `zxing-wasm` y `node:fs` por dos regex de RFC — REINCIDENTE

`src/lib/likida/cuadre/engine.ts:15`
(`import { esRfcValido, rfcChecksumOk } from '../intake/cfdi'`, usados una sola
vez, en `engine.ts:228`) → `src/lib/likida/intake/cfdi.ts:11-15`
(`import sharp from 'sharp'`, `node:fs/promises`, `node:module`, `node:path`,
`zxing-wasm/reader`).

**Escenario.** `engine.ts:6` afirma *"Es una función pura → testeable, auditable,
sin sorpresas"* y `:20` insiste *"`formato.ts` no importa NADA: el motor sigue
siendo puro y sin I/O"*. El import es estático, así que el grafo de módulos del
motor incluye el binario nativo de `sharp` y el lector WASM. Seis módulos de
`/dashboard` importan `engine.ts` solo para `etiquetaConcepto`, una función de 7
líneas: `politicas/page.tsx:4`, `[id]/page.tsx:7`,
`combustible-casetas/page.tsx:11`, `agentes/liquidacion/vista.tsx:4`,
`agentes/facturas/vista.tsx:4`, `huerfanos/vista.tsx:3` — ninguno procesa una
imagen.

**Consecuencia.** El propio `next.config.ts:102-104` ya midió el precio:
*"El arranque en frío lo sigue mandando `sharp-libvips` con 15.34 MB (68% de la
función)"* — medición hecha para el webhook, que sí lo usa, y que hoy heredan por
dependencia estática seis pantallas del panel. Para el equipo: la puerta de
pureza está declarada en prosa, no verificada; el siguiente import "inofensivo"
del motor hacia `intake/` o `facturacion/` entra igual y nada se pone rojo.

**Causa raíz probable.** `intake/cfdi.ts` mezcla dos naturalezas —validación pura
de RFC/UUID y decodificación de códigos de barras sobre imagen— en un archivo,
así que quien necesita la primera se lleva la segunda.

---

### [ALTO] La prueba guardián de `formato.ts` cubre menos de lo que CLAUDE.md promete, y ya hay tres archivos formateando en `es-MX` fuera de ella

`src/lib/formato.test.ts:216-220` (el grep es el literal
`toLocaleString('es-MX'`, comillas simples, un solo método) contra
`src/lib/saludo.ts:37` (`toLocaleDateString('es-MX', …)`),
`src/lib/agents/analista.ts:294` (`new Intl.DateTimeFormat('es-MX', …)`) y
`src/lib/likida/hitos_viaje.ts:117` (`new Intl.DateTimeFormat('es-MX', { …,
hour12: false })`).

**Escenario.** CLAUDE.md dice: *"Hay una prueba que falla si aparece
`toLocaleString('es-MX')` en cualquier otro archivo"*, y el `it` se titula
*"solo `formato.ts` formatea cifras mexicanas"*. Los tres archivos de arriba
pasan verdes hoy. Lo que ya cuesta:
- `formato.ts:198` usa `hourCycle: 'h23'` **explícitamente**, y su comentario
  (`:180-182`) explica por qué: *"`hour12: false` puede imprimir «24:00» para la
  medianoche según la versión de ICU, y «24:00» no es una hora que exista"*.
  `hitos_viaje.ts:117` usa `hour12: false`. Entra: el chofer manda "ya llegué" a
  las **00:05** de CDMX (llegada de madrugada, el caso normal en carga federal)
  → `mensajeHito` (`hitos_viaje.ts:126`) le contesta por WhatsApp *"Anotado:
  llegaste a las **24:05**"* en cualquier build de ICU que resuelva `hour12:
  false` a `h24`, mientras `/dashboard/viajes` imprime el mismo sello como
  **"15 ago 2026, 00:05"** vía `fechaHoraMx`.
- `saludo.ts:37` produce `"Martes, 4 de agosto de 2026"` (capitalizada) y
  `analista.ts:294` produce `"martes, 4 de agosto de 2026, 10:30"` (minúscula):
  dos `fechaLarga` distintas, una en el encabezado del panel y otra dentro del
  prompt con el que el agente le contesta al usuario en esa misma pantalla.
- La reja tampoco atrapa `"es-MX"` con comillas dobles ni
  `Intl.NumberFormat('es-MX')`. Hoy no hay dinero fuera de `formato.ts` — se
  verificó archivo por archivo—, pero eso es suerte, no la prueba.

**Consecuencia.** La regla dura del repo se cree mecánicamente aplicada por CI y
está aplicada solo contra una de las cuatro formas de escribirla. El día que
alguien meta `Intl.NumberFormat('es-MX', {style:'currency'})` en una pantalla de
peajes, la reja seguirá verde y la cifra fiscal se leerá distinta en dos
pantallas — que es el daño exacto que la regla existe para impedir.

**Causa raíz probable.** El guardián se escribió contra el síntoma concreto del
día (`toLocaleString`) y no contra la clase (cualquier formateo con la
localización mexicana fuera de `formato.ts`).

---

### [MEDIO] `PILL_ESTATUS` de `viaje.estatus` nació dos veces más esta semana, en el archivo cuyo comentario existe para impedirlo

`src/app/dashboard/resumen-visual.tsx:103-107` (la copia canónica, exportada) ·
`src/app/dashboard/viajes/vista.tsx:22-26` y
`src/app/dashboard/viajes/libro.tsx:55-59` (gemelas literales entre sí).

**Escenario.** `resumen-visual.tsx:100-102` dice, textual: *"Exportado porque
`tablero-operacion.tsx` pinta el mismo estatus: dos mapas se separan al primer
estatus nuevo, que es exactamente como se rompió `CONCEPTO` dos veces"*.
`tablero-operacion.tsx:3` lo importa y hace lo correcto. Las dos páginas del
Registro (F2, de esta semana) escribieron su propia copia. Hoy las tres dicen lo
mismo, así que **no hay bug visible**: lo que hay es que el día que
`viaje_estatus_dominio` gane un cuarto valor —o que `en_cuadre` se re-rotule—
`/dashboard` lo pinta bien y `/dashboard/viajes` + el libro del viaje lo pintan
con la clave cruda (`vista.tsx:115` y `libro.tsx:84` caen al `??`).

**Consecuencia.** El costo de tocar el vocabulario de estatus del viaje es tres
archivos, y el archivo que documenta el peligro es justo el que se ignoró. Para
el equipo: el mecanismo "exporta la constante y ponle un comentario" ya se probó
insuficiente dos veces en este repo (`CONCEPTO`, `ESTATUS`); esta es la tercera
demostración.

**Causa raíz probable.** Las dos copias necesitan `{fg, bg}` y la canónica
expone `{estado: Estado}` para `StatusPill`; en vez de ampliar la fuente única,
se copió el mapa y se le cambió la forma del valor.

---

### [MEDIO] La flecha de dependencia entre `/admin` y `/dashboard` ahora apunta en las dos direcciones, y CLAUDE.md solo declara una

`src/app/dashboard/resumen-visual.tsx:3-4` (importa `../admin/ui/formato-preset`
y `../admin/ui/kit`) contra **33 imports** de `/admin` y `/vendedor` hacia
`../../dashboard/resumen-visual` — p. ej. `src/app/admin/flotas/page.tsx:15`,
`src/app/admin/consola.tsx`, `src/app/admin/salud-sistema/page.tsx:4`,
`src/app/admin/compliance/page.tsx:3`, `src/app/admin/dev/page.tsx:3`.

**Escenario.** CLAUDE.md declara una sola dirección: *"`/dashboard` … Reusa los
componentes de `/admin` (`ui/kit`, `ui/graficas`, `charts`) — no hay una segunda
librería de UI"*. El rediseño de `/admin` (`c2911d0`, "habla el mismo idioma que
todo el producto") invirtió media flecha: `BarraPagina`/`TituloSeccion` viven en
el panel del CLIENTE y hoy los consume la consola de Javier. Entra: alguien
reestructura `/dashboard` —cosa que YA pasó el 10-ago, *"las páginas borradas ya
no sirven, empezaremos desde cero"*— y mueve o renombra `resumen-visual.tsx` →
se caen 33 archivos de `/admin` y `/vendedor`, que es precisamente la parte del
producto que el documento describe como aislada.

**Consecuencia.** No hay ciclo a nivel de archivo (`kit.tsx` no importa
`resumen-visual.tsx`), así que no truena en runtime; el costo es de
mantenimiento y de confianza en el documento: ninguno de los dos directorios se
puede tocar o extraer sin el otro, y el mapa mental que CLAUDE.md le da al
siguiente agente dice que sí se puede.

**Causa raíz probable.** No existe un `app/ui/` compartido, así que el segundo
que necesitó una pieza común la puso donde ya estaba escrita en vez de moverla a
tierra neutral.

---

### [MEDIO] "Viajes vigilados · abiertos o en cuadre" sigue midiendo otro universo — REINCIDENTE (parcialmente atacada)

`src/lib/likida/agentes/cobranza.ts:113-133` (los filtros
`.in('estatus', ['abierto','en_cuadre'])` + `.not('fecha_inicio','is',null)` +
`.not('avisado_en','is',null)`) y `:155` (`vigilados: viajes.length`) ·
`src/app/dashboard/agentes/cobranza/vista.tsx:67`.

**Escenario.** El `.limit(500)` sin orden **sí se arregló** (`traerTodo`, con el
porqué escrito en `:107-113`) — se acredita. Lo que queda es el rótulo. Flota con
40 viajes abiertos/en cuadre: 25 creados desde Despacho (con `avisado_en`) y 15
importados del TMS (sin aviso, que es el filtro correcto que cerró BE-C1).
- `/dashboard/agentes/cobranza` → KPI **"Viajes vigilados: 25"**, nota
  *"abiertos o en cuadre"*.
- `/dashboard/viajes` → KPIs `contarViajes` exactos: **Abiertos + En cuadre =
  40**.
Dos pantallas del mismo panel, el mismo rótulo, 25 contra 40.

**Consecuencia.** El número mide "avisados, con fecha de inicio" y la nota nombra
"abiertos o en cuadre". Cobranza es el agente cuya promesa es "no se me escapa un
comprobante"; un KPI que declara vigilar un universo mayor del que vigila es lo
contrario de esa promesa, y los 15 viajes del TMS quedan sin decir que nadie los
persigue.

**Causa raíz probable.** El resultado de la consulta de trabajo se recicla como
métrica de pantalla: `vigilados` es `viajes.length` de la cola, no un conteo
propio.

---

### [MEDIO] `sufijoTenant` existe y cinco páginas lo siguen reimplementando en línea — REINCIDENTE

`src/app/dashboard/sufijo.ts:21-26` (con `encodeURIComponent`) contra las copias
literales en `src/app/dashboard/page.tsx:36-37`,
`src/app/dashboard/despacho/page.tsx:44-45`,
`src/app/dashboard/agentes/liquidacion/page.tsx:42-43`,
`src/app/dashboard/agentes/facturas/page.tsx:35-36`,
`src/app/dashboard/agentes/cobranza/page.tsx:52-53` — ninguna codifica. Sexta
variante documentada a propósito en `sidebar-nav.tsx:68-72` (Client Component).
Trece archivos SÍ importan el helper.

**Escenario.** Ya divergieron: el canónico escapa los tres parámetros, las cinco
copias los concatenan crudos. Con los valores de hoy (UUID de tenant,
`vista=demo`, nombres de rol) el resultado no cambia, así que **no hay bug
visible**; lo que hay son seis lugares que tienen que enterarse del próximo
parámetro de contexto. El historial del propio archivo cuenta el precio
(`sufijo.ts:12-18`): `?rol=` se agregó al sidebar y NO a los links de la página,
y la previsualización "ver como" se apagaba a media navegación.

**Consecuencia.** Agregar un parámetro de contexto al panel cuesta seis archivos
y el modo de falla es mudo (un link te devuelve al tenant de la sesión bajo el
mismo encabezado).

**Causa raíz probable.** El helper llegó después que las páginas y nadie migró
las existentes.

---

### [BAJO] Ocho mapas de rol→etiqueta, ya divergidos: el mismo usuario tiene tres nombres en tres pantallas

`src/app/dashboard/chrome.tsx:26-32` (`flota_admin: 'ADMIN FLOTA'`,
`encargado: 'ENCARGADO'`) · `src/app/dashboard/mi-perfil/page.tsx:11-17` y
`src/app/admin/mi-perfil/page.tsx:10-12` (`'Dueño / Admin de flota'`,
`'Encargado'`) · `src/app/dashboard/aviso-rol.tsx:7-11` y
`src/app/dashboard/agentes/notificaciones-forma.tsx:45-49`
(`'Dueño de la flota'`, `encargado: 'Jefe de tráfico'`) ·
`src/app/admin/equipo/page.tsx:14-20` (el único con `vendedor`) ·
`src/app/dashboard/usuarios/vista.tsx:11-17` (descripciones, no nombres) ·
`src/lib/agents/analista.ts:282-286` (`'dueño/administrador de la flota'`).

**Escenario.** Un `encargado` abre `/dashboard/mi-perfil` y lee **"Encargado"**;
la insignia de la esquina, en esa misma vista, dice **"ENCARGADO"**; entra a
cualquier página de agente, abre Notificaciones y la casilla que decide si le
llegan correos dice **"Jefe de tráfico"**. Tres nombres para el mismo puesto sin
salir de la sesión. El rol `vendedor` (mig. 0105, de esta semana) se agregó a UNO
de los ocho mapas.

**Consecuencia.** No rompe dinero ni permisos: los ocho caen a `?? rol` y pintan
la clave cruda, nunca vacío. Es costo de mantenimiento y de confianza: el
vocabulario del producto ante el usuario tiene ocho dueños y ninguno canónico;
el noveno rol tendrá que tocarse ocho veces.

---

### [BAJO] `OperadorStat.viajes` cuenta viajes con carga de diésel, no viajes

`src/lib/likida/analytics.ts:319-327,338`: `viajesPorOp` solo se llena dentro del
bucle de `gastos`, que la consulta ya acotó a `.eq('concepto','diesel')`
(`:301`). Un operador con 8 viajes de los que 3 cargaron diésel sale con
`viajes: 3`.

**Consecuencia.** Hoy inofensivo: el único consumidor
(`agentes/liquidacion/page.tsx`) usa `nombre` y `diferencias`; `viajes` y
`dieselTotal` no llegan a ninguna pantalla. Es superficie muerta con un nombre
que promete otra cosa — el primero que la conecte a un KPI reproduce el CRÍTICO
de arriba con otra cifra.

---

### [BAJO] `topeDescuento` formatea pesos con `toFixed(2)` y no tiene un solo llamador

`src/lib/likida/laboral/pagadero.ts:147`:
`` `Se le puede exigir hasta ${exigible.toFixed(2)} en total y descontar hasta
${descuentoPeriodo.toFixed(2)} por periodo (LFT 110-I)` `` — el archivo importa
`mxn` en `:21` y lo usa correctamente en `resumenLaboral` (`:211-219`).
`grep` sobre todo `src/` no encuentra ningún consumidor de `topeDescuento`.

**Consecuencia.** Si alguien la conecta, el contralor lee *"exigir hasta
12500.00"* junto a *"$12,500.00"* en el párrafo de al lado, y el guardián de
`formato.test.ts` no lo atrapa porque solo mira `toLocaleString`. Deuda, no bug:
hoy no llega a nadie.

---

### [BAJO] La leyenda de la ventana de 100 está escrita a mano en Conductores y calculada en las otras tres

`src/app/dashboard/agentes/conductores/vista.tsx:69-72` (el literal "100")
contra `src/app/dashboard/mapa/vista.tsx:46-48`,
`src/app/dashboard/viajes/vista.tsx:153` y
`src/app/dashboard/huerfanos/vista.tsx:26`, que reciben `cargados` (el
`viajes.length` real). El default vive en
`src/lib/likida/analytics.ts:965` (`limite = 100`).

**Consecuencia.** Cambiar el default deja a Conductores declarando una ventana
que ya no existe. Además, con 40 viajes la frase dice "sobre los 100 más
recientes" para un universo de 40 — cierto pero confuso; las otras tres dicen el
número real.

## Verdades duplicadas

| El concepto | Dónde vive cada copia | ¿Ya divergieron? |
|---|---|---|
| **Contribución y margen de un viaje/flota** | `libro_viaje.ts:152-167` (pura, `null` si falta cualquier mitad) · `comercial.ts:157-158` (agrega dos universos distintos) | **SÍ, con dinero de por medio** — el mismo escenario da "—" en una pantalla y "−166.67%" en otra |
| Etiqueta legible de un concepto de gasto | `cuadre/engine.ts:1181` · `app/dashboard/[id]/page.tsx:28-32` · **`app/dashboard/gasto-semanal-chart.tsx:9-13`** | **SÍ** — 'Caseta'/'Casetas', 'Factura'/'Facturas', 'Otro'/'Otros'. El guardián solo mira las dos primeras |
| Etiqueta y color de `viaje.estatus` | `resumen-visual.tsx:103` (canónica, exportada) · `viajes/vista.tsx:22` · `viajes/libro.tsx:55` | No todavía — tres copias idénticas, dos escritas esta semana |
| Nombre visible de un rol | `chrome.tsx:26` · `dashboard/mi-perfil:11` · `admin/mi-perfil:10` · `admin/equipo:14` · `aviso-rol:7` · `notificaciones-forma:45` · `usuarios/vista:11` · `analista.ts:282` | **SÍ** — ADMIN FLOTA / Dueño / Admin de flota / Dueño de la flota / dueño-administrador; Encargado / Jefe de tráfico |
| Qué páginas existen en `/dashboard` | `app/dashboard/rutas.ts:24-111` (navegar) · `lib/auth/visibilidad.ts:76-179` (autorizar) | **SÍ** — `/dashboard/arco`, `/dashboard/usuarios`, `/dashboard/politicas` solo en la segunda |
| El sufijo `?tenant/?vista/?rol` | `app/dashboard/sufijo.ts:21` (canónico, escapa) · 5 copias en línea · `sidebar-nav.tsx:68` (a propósito) | **SÍ, sin efecto hoy** — solo el canónico usa `encodeURIComponent` |
| Formateo con localización mexicana | `lib/formato.ts` (canónico, `hourCycle:'h23'`) · `saludo.ts:37` · `analista.ts:294` · `hitos_viaje.ts:117` (`hour12:false`) | **SÍ** — y el guardián solo greppea `toLocaleString('es-MX'` |
| "Cuántos viajes vivos" | `analytics.ts:840` `contarViajes` (exacto) · `:965` `getViajes` (ventana 100, **hoy DECLARADA** en las 4 páginas) · `agentes/cobranza.ts:155` `vigilados` (filtros extra) | Parcial — la ventana ya se declara; el rótulo de cobranza no |
| Catálogo de agentes | `agentes/notificaciones.ts:53-115` · `agentes/corridas.ts:23` · `admin/negocio.ts:466-468` (`satisfies AgenteConCorridas`) · `admin/observabilidad/etiquetas.ts:12` | **No** — atados por tipo y con el porqué de cada copia escrito |
| Índice de normas ↔ fichas YAML | `lib/likida/normas/indice.ts` · `normas/*.yaml` | **No** — `normas_sincronizadas.test.ts` compara en las DOS direcciones, estado, jerarquía y citas |
| Etiqueta de estatus de liquidación | `app/dashboard/estatus.ts` (fuente única importada) | No — el duplicado se eliminó y hay guardia |
| Mapa de concepto en el PDF | `liquidacion/pdf.ts` importa `etiquetaConcepto` | No — mapa propio borrado, con guardia que impide su regreso |
| Tolerancias del cruce de peaje | `intake/consolidado.ts` (`VENTANA_DIAS_FECHA`, `TOLERANCIA_MONTO_MXN`, `diasDeDiferencia`) → importadas por `intake/desglose_peaje.ts:44` | No — el archivo nuevo de 1,059 líneas reusó en vez de copiar |

## Lo que revisé y está bien

- **ARQ-C1 (el crítico heredado) está cerrado, y bien cerrado.** Las cuatro
  páginas que consumen `getViajes` declaran su ventana en pantalla:
  `agentes/conductores/vista.tsx:69-72`, `mapa/vista.tsx:45-48`,
  `viajes/vista.tsx:97,153` y `huerfanos/vista.tsx:26`; `viajes/page.tsx:41-48`
  pide los conteos exactos por separado (`contarViajes` × 4 + `contarEscalados`)
  y `viajes/vista.tsx:64-67` los pinta como los KPIs, con la tabla rotulada
  aparte. La contradicción "100 vs 300 a 3 cm" ya no se puede producir.
- **La bandera de cobertura quedó con un solo nombre.** `vitest.config.ts:41`
  exporta `LIKIDA_COBERTURA`, los dos `skipIf` (`fundamento.test.ts:148`,
  `duplicados.test.ts:151`) lo leen, y `pruebas_en_ci.test.ts:90` falla si el
  config deja de declararlo. El MEDIO reincidente del pase 2 está cerrado.
- **`getDesglosesRecibidos` dejó de mentir** (`analytics.ts:1575-1592`): tiene
  `.order('created_at')` + desempate por `id`, y el límite pasó de un
  `.limit(2000)` que PostgREST recortaba a 1,000 en silencio, a un `.limit(1000)`
  declarado con el porqué escrito. El ALTO del pase 2 está cerrado.
- **`colaCobranza` cambió `.limit(500)` por `traerTodo`**
  (`agentes/cobranza.ts:107-136`) con el razonamiento de escala escrito encima.
- **El motor de la liquidación sigue teniendo UNA sola casa.** Ningún archivo
  fuera de `cuadre/` recalcula `totalComprobado` ni `diferencia`;
  `analytics.ts`, `[id]/page.tsx` y `export/` leen la columna persistida, y
  `desde_db.ts` sigue siendo el único adaptador impuro, contra `repo.ts` +
  `config.ts` y no contra Supabase crudo.
- **Cero imports `lib/ → app/`** (verificado por grep sobre todo `src/lib`). La
  capa de dominio no conoce la UI.
- **`/v1` no reimplementa el dominio.** `viajes/route.ts:24-32` compone
  `getViajes`/`contarViajes`/`crearViaje`/`validarIngreso`; el OpenAPI
  (`openapi/route.ts:373-389`) declara exactamente los campos de `ViajeApi`
  (`viajes/route.ts:40-59`), verificado campo por campo. Y `_comun.ts:279`
  documenta el borde de paginación en vez de esconderlo.
- **`intake/desglose_peaje.ts` (1,059 líneas nuevas) reusó las tolerancias del
  consolidado** en vez de copiarlas (`:44`), y `registrarCorrida` está atado por
  `satisfies` entre `corridas.ts:23` y `admin/negocio.ts:466-468`.
- **`normas_sincronizadas.test.ts` es el guardián que el rubro querría en todas
  partes**: enumera `normas/*.yaml` desde el disco y falla en las dos
  direcciones, con estado, jerarquía y citas — no contra una lista escrita a
  mano. Es el contraste directo con `etiquetas_sincronizadas.test.ts`.
- **`interruptores.ts` y `admin/observabilidad/etiquetas.ts`** duplican el
  catálogo a propósito y lo dicen (arrastrar `supabaseAdmin` al bundle del
  cliente), con el dominio real defendido por el CHECK de la 0110 y fallback a
  clave cruda.
- **`cobranza_pura.ts` sigue siendo una separación bien hecha** y `formato.ts`
  sigue sin importar nada (`formato.test.ts:229-235` lo fija).

## Lo que NO alcancé a revisar

- **El límite real del repositorio.** Hoy son **94** archivos de producción que
  llaman `supabaseAdmin()` directo (eran 58 en el pase 2), y **42** que leen
  `from('gasto')`. `repo.ts` (1,114 líneas) es el repositorio del flujo de
  WhatsApp, no la frontera de datos del producto, y hace tiempo que no lo es. No
  tracé qué consultas están duplicadas entre `analytics.ts`, `operacion.ts`,
  `comercial.ts`, `fiscal.ts` y las páginas; el CRÍTICO de arriba es una muestra
  de lo que hay ahí, no el inventario.
- **`processor.ts` (2,300+ líneas) como unidad** y `facturacion/al_vuelo.ts`
  (cinco accesos directos a `gasto`, una máquina de estados que no recorrí).
- **`src/lib/correo/` completo** más allá de comprobar que la paleta hex de
  `plantilla.ts:55-64` es una copia declarada y necesaria de los tokens de
  `globals.css` (un correo no puede leer variables CSS), y que
  `avisoInvitacion` (`avisos.ts:294`) no tiene emisor ni llamador —está
  documentado como deuda en `usuarios/page.tsx:95`, no fingido.
- **`src/lib/observability/` (7 archivos)** y los seis agentes desde el ángulo de
  "cuánta lógica de decisión se repite entre `ejecutar*` y su página".
- **`/admin` por dentro** más allá de la dirección de sus imports y de comprobar
  que `lib/admin/negocio.ts` sigue siendo el único que cruza tenants.
- **`carta-porte/`** (los 37 campos por responsable): superficie nueva completa,
  no verifiqué si el mapa de responsables está escrito una o dos veces.
