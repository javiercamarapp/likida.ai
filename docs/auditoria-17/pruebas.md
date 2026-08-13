# Pruebas — auditoría 17 · pase 6 (13-ago-2026)

**Nota: 6/10** (antes 6). Razón del movimiento: **sostenida por un empate, y es
un empate medido, no una duda**. Sube un punto lo que el arnés viejo hizo:
**11 de los 15 rojos son detección real y sin ayuda** —lo verifiqué componente
por componente, no leyendo la tabla del MAPA—. Lo baja un punto lo que el arnés
nuevo no hizo: dos subsistemas enteros aterrizaron con **5 archivos y 32
pruebas**, y la afirmación central del más caro de los dos —*"una cifra que
ninguna tool devolvió NO sale hacia el contralor"*— **es falsa en producción y
su prueba está verde**. Ese es el ancla de "4 o menos si la suite pasa con la
función rota", y es lo único que me impidió subir a 7.

> **El riesgo mayor del rubro, hoy:** `analista_guardia.test.ts` afirma que la
> guardia bloquea `$12,500` inventados, y es cierto — con su respaldo de **3
> números**. Con el respaldo del tamaño que devuelven las tools de verdad (**77
> números**, medido con la forma real de `kpis_flota` + `liquidaciones_flota` +
> `serie_gasto`), `cifrasRespaldadas` devuelve **`true` para ese mismísimo
> `$12,500`**, para el **27.6%** de los montos redondos entre \$1,000 y
> \$100,000, y para el **100%** de los porcentajes enteros. La única prueba que
> el producto tiene contra "la IA inventó un número" pasa porque su escenario es
> más chico que la realidad.

---

## Compuerta, medida por mí hoy

```
npx vitest run
  Test Files  7 failed | 285 passed (292)
       Tests  15 failed | 3298 passed | 1 skipped (3314)     (~72 s)
```

Corrida **cinco veces** hoy (línea base, dos corridas con `--coverage`, dos con
mutantes puestos): **siempre 15 / 3,298 / 1, mismos archivos, mismos casos.**
Cero intermitencia. `find src -name '*.test.ts*'` → **292 archivos**, que es
exactamente lo que vitest colecta (no hay archivos huérfanos fuera del include).

Los 15 rojos coinciden **uno a uno** con la tabla del MAPA. No es ruido de
merge y no hay un decimosexto escondido.

### Cobertura — y una nota que importa más que los números

**Con la suite en rojo, vitest NO emite reporte de cobertura.** Lo confirmé
corriendo `npx vitest run --coverage` completo dos veces: 1,055 líneas de salida,
ni una sección `Coverage summary`, y `node_modules/.cache/coverage/` vacío. O
sea: **el trinquete 67/84/79 lleva todo este pase sin evaluarse**, y el paso
`npm run test:coverage` de `ci.yml:68` no produce número.

Para poder medir, corrí la cobertura **excluyendo los 7 archivos rojos**:

```
npx vitest run --coverage --exclude '**/{sidebar_puerta,objetivo_de_toque,aria_current,
   panel_periodo,kpi-periodo,expediente_alcanzable}.test.tsx' --exclude '**/ahorro_sin_dato.test.ts'
  → EXIT 0
  Statements 68.66% (13418/19540) · Branches 84.68% (5148/6079) · Functions 81.39% (735/903)
```

| | pase 5 | pase 6 | delta |
|---|---|---|---|
| archivos de prueba | 261 | **292** | +31 |
| pruebas verdes | 3,134 | **3,298** | +164 |
| **statements totales** | 17,897 | **19,540** | **+1,643** |
| statements cubiertos | 12,811 | **13,418** | +607 |
| % statements | 71.58 | **68.66** | **−2.92** |
| % ramas | 84.64 | 84.68 | +0.04 |

**Caveat honesto:** mi exclusión deja fuera 8 módulos que esos 7 archivos sí
ejercen (`sidebar-nav.tsx`, `kpi-periodo.tsx`, `motor-fiscal-periodo.tsx`,
`panel-periodo.tsx`, `periodo.ts`, `rutas.ts`, `ultimas-liquidaciones.tsx`,
`resumen-visual.tsx` ≈ 400 statements). Con ellos el número real rondaría
**~70%**, no 68.66. Todo lo demás de la tabla de abajo es **exacto**: ninguno de
los 7 archivos rojos toca esos módulos.

**Los números que importan de este pase** (exactos):

```
   0.0%   510  src/app/dashboard/chat.tsx            ← el 0% más grande del repo
   0.0%   174  src/app/dashboard/inicio-contenido.tsx   ← el Resumen v3 entero
   0.0%    75  src/app/dashboard/barra-acciones.tsx
   0.0%    67  src/app/api/dashboard/chat/route.ts      ← tope diario + 3 puertas
   0.0%    65  src/app/dashboard/forma-viaje.tsx
   0.0%    55  src/app/dashboard/chrome.tsx             ← hallazgo 1 del pase 5, REINCIDENTE
   0.0%    47  src/app/api/cron/facturar/cola/route.ts  ← C6, SEXTO pase
   0.0%    46  src/app/api/dashboard/ingesta/route.ts
   0.0%    36  src/app/api/dashboard/archivo/route.ts
   0.0%    21  src/app/dashboard/viajes-recientes.tsx
  55.6%   275  src/lib/agents/analista.ts
  68.4%   209  src/lib/agents/chat-tools.ts
  92.1%   101  src/lib/likida/intake/archivo.ts       ← el mejor pedazo del frente nuevo
  90.9%   408  src/lib/llm/openrouter.ts
  94.7%   433  src/lib/likida/operacion.ts
```

**El frente nuevo entero tiene 5 archivos de prueba y 32 pruebas**
(`analista_guardia` 14 · `analista_prompt` 6 · `prompts` 3 · `chat/validacion` 3
· `intake/archivo` 6), contra ~1,900 statements de código nuevo.

---

## Historia 1 — el arnés viejo SÍ funcionó, y este es el conteo

Lo verifiqué caso por caso, abriendo cada archivo rojo y viendo **cómo** se pone
rojo. Hay dos clases, y la diferencia no es cosmética:

| Archivo | Casos rojos | Cómo se pone rojo | ¿Reproduce el defecto? |
|---|---|---|---|
| `sidebar_puerta.test.tsx` | 3 | calcula `faltantes` con `rutas.ts` + el componente real | **SÍ** |
| `panel_periodo.test.tsx` | 3 | `renderToStaticMarkup(<PanelPeriodo …>)` | **SÍ** |
| `objetivo_de_toque.test.tsx` | 2 | renderiza `KpiPeriodo` y `MotorFiscalPeriodo`, lee las clases del `<button>` | **SÍ** |
| `aria_current.test.tsx` | 2 | renderiza el sidebar y cuenta `aria-current` | **SÍ** |
| `kpi-periodo.test.tsx` | 1 | renderiza y afirma `not.toContain('$0.00')` | **SÍ** |
| `ahorro_sin_dato.test.ts` | 3 | `readFileSync('src/app/dashboard/page.tsx')` + `indexOf` | **NO** — hallazgo 4 |
| `expediente_alcanzable.test.tsx` | 1 | `readFileSync('…/page.tsx')` + `toContain` | **NO, y es falsa alarma** — hallazgo 5 |

**11 de 15 rojos son detección de regresión real y sin ayuda humana.** Eso es lo
mejor que este rubro ha producido en seis pases y hay que decirlo con el número:
un rediseño de 177 archivos reintrodujo siete defectos y **once casos de prueba
levantaron la mano solos**, con el mensaje correcto y la línea correcta.

**Los otros 4 son greps de fuente clavados a un `page.tsx` que se vació.** Los
dos archivos que los contienen son, además, los únicos dos del grupo que no
renderizan nada. Ese es el patrón que el pase 5 llamó *"el arnés se pegó al
parche"* — aquí se pegó a la **ruta del archivo**.

Y hay una asimetría que delata que fue descuido y no criterio: **tres pruebas SÍ
se repuntaron** a la casa nueva del panel (`estado.test.ts:108,144` y
`guion_demo.test.ts:25` ya leen `inicio-contenido.tsx`), y `ahorro_sin_dato.test.ts`
—la que guarda la regla *"nunca inventar una cifra"*— **se quedó apuntando a
`page.tsx`**.

---

## Hallazgos

### [CRÍTICO] La guardia de cifras del chat deja pasar `$12,500` inventados con un respaldo del tamaño real; su prueba dice lo contrario porque usa un respaldo de 3 números

`src/lib/agents/analista.ts:149-164` (`esDerivada`) y `:168-187`
(`cifrasRespaldadas`) · `src/lib/agents/analista_guardia.test.ts:31` (el respaldo
de la prueba) y `:41-44` (la aserción que se invierte)

La prueba construye su respaldo así:

```ts
// analista_guardia.test.ts:31
const respaldo = respaldoDe({ montoComprobado: 8340.5, tasaCuadre: 87, liquidados: 14 });
// :41-44
it('BLOQUEA un monto que ninguna tool devolvió', () => {
  const bloques = [{ tipo: 'texto', texto: 'Te puedes ahorrar unos $12,500 al mes.' }];
  expect(cifrasRespaldadas(bloques, respaldo)).toBe(false);
});
```

Tres números. En producción el respaldo se arma con
`extraerNumeros(t.result, respaldo)` sobre **cada resultado de tool del turno**
(`analista.ts:330`), y `extraerNumeros` mete además **todos los dígitos
incrustados en strings** (`:124-132`): folios `TI-0412`, fechas
`2026-08-01T15:00:00Z`, UUIDs. `esDerivada` (`:149`) declara respaldada
cualquier cifra que sea `a+b`, `|a−b`| o `(a/b)·100` de dos elementos del
conjunto — con tolerancia `0.011` en las dos primeras y `0.6` en la tercera, y
un tope de trabajo de 600 elementos.

**Medición.** Armé el respaldo con la **forma real de tres tools**
(`kpis_flota` + `liquidaciones_flota` con 14 filas + `serie_gasto` mensual con 3
categorías × 4 cortes, copiadas de los `return` de `chat-tools.ts`) y llamé
`cifrasRespaldadas` real, importada del módulo real:

```
TAMANO DEL RESPALDO REAL   : 77
TAMANO DEL RESPALDO JUGUETE: 3          ← el de analista_guardia.test.ts

12500 con respaldo JUGUETE (lo que asevera la prueba): false
12500 con respaldo REAL                              : TRUE   ← se invierte

MONTOS REDONDOS 1,000..100,000 (de 500 en 500, n=199)
   pasan con respaldo JUGUETE:   0 / 199   (0.0%)
   pasan con respaldo REAL   :  55 / 199   (27.6%)
   ejemplos que cuelan: 1000, 1500, 2000, 2500, 3000, 3500, 4500, 5500, 6000, 6500, 7000, 7500

PORCENTAJES ENTEROS 0..100
   juguete:  20 / 101        real: 101 / 101   (100%)
```

Con 77 elementos hay 3,003 pares; entre sumas, restas y cocientes, la malla
cubre casi todo el rango redondo. Lo único que sigue bloqueado son los montos
**con centavos arbitrarios** (2 de 500 colaron), que es justo lo que un modelo
inventando *no* produce: inventa cifras redondas.

**Escenario con valores.** El contralor de Transportes Innovativos escribe
*"¿cuánto me podría ahorrar Likida al mes?"*. El agente llama `kpis_flota` y
`liquidaciones_flota` —77 números en el respaldo— y contesta *"Con tu operación
actual te puedes ahorrar unos **\$12,500** al mes."*. `cifrasRespaldadas`
devuelve `true`, no se registra `chat.guardia_cifra`, no hay reintento
correctivo, y el número sale a pantalla con la tipografía de una medición. Es
exactamente el texto que la prueba dice bloquear.

**Refutación que intenté y falló.** ¿Lo tapa la red determinística de
`analista.ts:382-399`? No: solo corre cuando la guardia devuelve `false`. ¿Lo
tapa el prompt (`prompts.ts:41`, *"promedios propios, extrapolaciones o
aproximadamente"*)? Eso es instrucción a un modelo, no un portón — la guardia
existe precisamente porque el prompt no basta, y `analista_prompt.test.ts` solo
verifica que la frase esté escrita. ¿Lo tapan los `BLANCOS` (`:142`)? Al revés:
esos ensanchan el hueco, no lo cierran.

**Consecuencia:** el diferenciador del producto es *"nunca inventar una cifra"*,
y la única defensa automática que el chat tiene contra eso está calibrada con un
escenario 25 veces más chico que el de producción. El contralor cruza el
\$12,500 contra su contador y no existe.

**Causa raíz probable:** la prueba fija el contrato de la función y nunca fija su
**punto de operación**: no hay un solo caso con un respaldo del tamaño que la
función va a ver.

---

### [ALTO] La guardia se puede DESCONECTAR entera de `ejecutarAnalista` y las 3,298 pruebas siguen verdes: sus 14 casos prueban la función, no que alguien la llame

`src/lib/agents/analista.ts:348` y `:382` (los dos únicos call sites) ·
`src/lib/agents/analista_guardia.test.ts` (14 casos, ninguno invoca `ejecutarAnalista`)

`ejecutarAnalista` es la función que el endpoint llama y la que decide qué sale a
pantalla; vive en un archivo al **55.6%** y sus ~90 statements de orquestación
—reintento correctivo, red determinística final, `CAPTURAS`, el `AbortController`
de 40 s— no los ejercita nadie. Los 14 casos de `analista_guardia.test.ts`
importan `cifrasRespaldadas` y la llaman directo.

**Mutante exacto** (corrido hoy, suite completa, `npx tsc --noEmit` en 0):

```ts
-    if (!bloques || !cifrasRespaldadas(bloques, respaldo)) {   // :348
-    if (!bloques || !cifrasRespaldadas(bloques, respaldo)) {   // :382
+    if (!bloques) {
+    if (!bloques) {
```

```
 Test Files  7 failed | 285 passed (292)
      Tests  15 failed | 3298 passed | 1 skipped (3314)     ← IDÉNTICO a la línea base
```

**Escenario con valores.** Alguien optimiza el turno del chat —el archivo ya
documenta dos rondas de "medido el 12-ago" recortando latencia— y quita la
segunda llamada a la guardia para ahorrarse el reintento de `$0.005`. La suite
sale verde, `tsc` sale verde, el lint sale verde, y el chat empieza a entregar
cualquier bloque que el modelo devuelva. El commit se ve como una mejora de
rendimiento.

**Refutación que intenté y falló.** ¿Lo caza `validacion.test.ts`? No: cubre
`validarMensajes`/`inicioDiaMxIso`, que están *antes* del agente. ¿Lo caza algo
en `src/lib/llm/`? Tampoco: ahí se prueba `generateWithTools`, que ni conoce la
guardia. `grep -rln "ejecutarAnalista" src --include=*.test.ts*` → **vacío**.

**Causa raíz probable:** exactamente el patrón que el pase 5 nombró y que este
pase repite en código nuevo: el arnés se pegó a la **función pura** (fácil de
probar) y no al **camino** (que exige un doble del cliente LLM, que el repo ya
sabe construir — `openrouter_loopguard.test.ts` lo hace).

---

### [ALTO] Los tres endpoints nuevos —chat, archivo, ingesta— suman 149 statements a **0%** y **cero archivos de prueba**: el tope diario de gasto, las tres puertas de rol y el límite de tamaño no los mira nadie

`src/app/api/dashboard/chat/route.ts` (0.0% / 67) ·
`src/app/api/dashboard/archivo/route.ts` (0.0% / 36) ·
`src/app/api/dashboard/ingesta/route.ts` (0.0% / 46)

```
$ grep -rln "api/dashboard/chat\|api/dashboard/archivo\|api/dashboard/ingesta" src --include=*.test.ts*
(vacío)
```

Lo único probado del trío son los **dos helpers puros** que se sacaron a
`chat/validacion.ts` — y el comentario de ese archivo (`:1-3`) dice, textual, que
viven fuera de `route.ts` *"porque así se prueban solos"*. La lección se aplicó
al 30% del endpoint y no al 70% que decide sobre dinero y sobre acceso.

Lo que queda sin arnés, con línea:

- **`chat/route.ts:91`** — `if (gastadoHoy >= topeDiaUsd())`. El tope diario por
  tenant, la pieza que existe por pedido explícito *"que no implique que si se
  quedan ahí todo el día quemar un exceso de tokens"*.
- **`chat/route.ts:86-89`** — el fallo CERRADO cuando no se puede leer `llm_costo`.
  Es la regla *"fallar cerrado y decirlo"* del `CLAUDE.md`, sin una sola aserción.
- **`chat/route.ts:56-60`** — `?tenant=` honrado solo para `superadmin`. Es la
  misma forma del IDOR que se cerró en `/api/dashboard/asistente` (ruta que ya no
  existe; ver la tabla de reincidentes).
- **`archivo/route.ts:41-43`** — el corte de ~12 MB, y **`:37-39`** el desvío de
  imágenes al OCR.
- **`ingesta/route.ts:31`** — `puedeVerArea(sesion.rol, 'dinero')` antes de gastar
  una llamada de visión.

**Escenario con valores.** Alguien invierte el signo en `:91`
(`gastadoHoy <= topeDiaUsd()`) al refactorizar. Todo tenant queda **siempre**
agotado desde el primer peso: el chat degrada al respondedor local de keywords
para todos, para siempre, respondiendo *"El análisis con IA de hoy llegó a su
tope diario"*. La suite entera sale verde. Se descubre cuando el contralor
pregunta algo fuera del catálogo de 6 palabras clave y el chat dice que no sabe.

**Refutación que intenté y falló.** ¿Cuenta `visibilidad.test.ts` como cobertura
de la puerta? Cubre `puedeVerArea` como función; ninguna prueba afirma que
`chat/route.ts` la **llame** —es el mismo hueco del hallazgo anterior, un nivel
más arriba—. ¿Los cubre el `npm run build` de CI? Compila, no ejecuta.

**Causa raíz probable:** las rutas de API **sí** cuentan para el trinquete
(`vitest.config.ts:73` lo dice explícito: *"Las RUTAS de API sí cuentan"*), pero
el trinquete tiene 1.66 pt de aire y 149 statements a 0% caben de sobra.

---

### [ALTO] `src/app/dashboard/chat.tsx` — 510 statements a **0%**, el archivo más grande sin una sola prueba: produce cifras fiscales él solo, y su función no está exportada, así que ni siquiera *se puede* probar

`src/app/dashboard/chat.tsx:73-145` (`function responder`, no exportada) ·
`:53-70` (`respuestaDeBloques`, tampoco) · call sites `:384` y `:387`

`responder()` es el paracaídas: cuando `/api/dashboard/chat` devuelve no-ok o el
`AbortSignal.timeout(75_000)` dispara, **es lo que el contralor lee**
(`:387`, dentro del `catch`). Y no repite datos: **calcula y redacta**.

```ts
// :94   una cifra DERIVADA que ninguna tool devolvió
const limpias = Math.max(0, kpis.viajesLiquidados - kpis.conDiferencias - kpis.porRevisar);
// :130  y una afirmación fiscal con su fundamento citado
? `${mxn(acred.iva)} de IVA acreditable este periodo (LIVA, Art. 5).`
```

Nada de esto pasa por `cifrasRespaldadas` —la guardia vive en el servidor— ni
por prueba alguna.

**Escenario con valores.** El contralor abre el catálogo de la pantalla y toca
*"Monto observado por el motor en las liquidaciones"* (`CATALOGO_CONSULTA`,
`:322` — es un texto que el producto ofrece, no algo que él inventó). La red
tose. Cae en `responder()`. La cadena `q.toLowerCase()` contiene **`monto`**, y
la primera `if` del árbol (`:76`) es `q.includes('comprobad') || q.includes('monto')`
— gana ella. Contesta *"Llevas \$184,320.75 comprobados en 14 viajes"* con la
tabla de cuadre. Lo mismo con *"¿de cuánto es el monto de IVA que puedo
acreditar?"*: `monto` gana sobre `iva` (que es la quinta `if`, `:125`) y el
contralor recibe el monto comprobado donde pidió el IVA. Son **seis ramas
ordenadas por prefijo** y el orden es el contrato — sin una prueba que lo fije.

**Refutación que intenté y falló.** ¿La cubre `estado.test.ts` o
`guion_demo.test.ts`? Esas leen `inicio-contenido.tsx` como texto, no
`chat.tsx`. `grep -rln "dashboard/chat" src --include=*.test.ts*` → los tres
archivos que salen lo nombran solo en prosa de comentario. ¿Está excluida de
cobertura por ser vista? **No**: el exclude de `vitest.config.ts:74-79` es
`page.tsx`/`layout.tsx`/`loading.tsx`/`error.tsx`, y `chat.tsx` **sí cuenta** —
por eso aparece como 0.0% de 510, el número más grande de la lista.

**Consecuencia para mi rubro:** `responder` y `respuestaDeBloques` son funciones
**puras** (entran `pregunta` + dos objetos, sale un objeto) y no están
exportadas. Son el caso de libro de lo que `chat/validacion.ts` hizo bien tres
carpetas más allá. Hoy no hay hueco de arnés: hay una **imposibilidad** de
arnés.

---

### [ALTO] `ahorro_sin_dato.test.ts` está roja en LAS DOS DIRECCIONES: el `?? 0` volvió a `inicio-contenido.tsx:287` y la prueba no lo ve — su rojo no es evidencia, y su mensaje pide "actualiza esta prueba"

`src/app/dashboard/ahorro_sin_dato.test.ts:42` (`readFileSync('src/app/dashboard/page.tsx')`)
y `:54` (el mensaje) · `src/app/dashboard/inicio-contenido.tsx:287` (el defecto real)

El defecto **sí volvió**, textual:

```tsx
// inicio-contenido.tsx:287
<StatCard … etiqueta={`Ahorro generado — ${periodoFiscal.etiqueta}`}
  valor={resumenPerdidas?.montoRecuperable ?? 0} formato="mxn" delta={null} />
```

y `StatCard` **sí** acepta `number | null` y pinta `'—'` (`admin/ui/kit.tsx:39`,
donde el propio comentario dice que es el arreglo del pase 5). O sea: el arreglo
está disponible y el llamador lo desperdicia.

Pero la prueba no mira ahí. Mira `page.tsx`, que hoy tiene 43 líneas y solo monta
`<InicioContenido/>`. Sus tres casos fallan con
*"el KPI «Ahorro generado» ya no está en page.tsx — **actualiza esta prueba**"*.

**Mutante exacto** (arreglé el defecto y volví a correr):

```tsx
-  valor={resumenPerdidas?.montoRecuperable ?? 0}
+  valor={resumenPerdidas?.montoRecuperable ?? null}
```

```
 × EL BUG: el valor del KPI no se aplana con `?? 0`
 × el valor se pasa tal cual, dejando que `KpiDegradado` decida qué pintar
 × CONTROL: `KpiDegradado` sí sabe pintar el dato ausente
      Tests  3 failed (3)          ← ROJA IGUAL, con el defecto ARREGLADO
```

**Escenario con valores.** El reparador de la siguiente oleada lee el mensaje al
pie de la letra y "actualiza la prueba" repuntando el `readFileSync` a
`inicio-contenido.tsx`. Dos de los tres casos siguen rojos y ahora sí por la
razón correcta, así que los arregla — bien. Pero el tercero (el CONTROL de
`:79-85`) exige `valor: number | null` en `resumen-visual.tsx`, y ese archivo ya
no tiene `KpiDegradado` (la v3 lo movió a `admin/ui/kit.tsx`): el camino barato
para poner verde es **borrar el CONTROL**, y con él se va la única aserción de
que la pieza del arreglo existe. En el otro escenario, el que rehace el panel
mañana ve tres rojas que dicen "actualiza esta prueba" y la borra entera.

**Refutación que intenté y falló.** ¿Lo caza `litros_sin_dato.test.tsx`? Cubre
`combustible-casetas`, otro llamador, otro KPI. ¿Lo caza `estado.test.ts`, que sí
lee `inicio-contenido.tsx`? Abre el archivo, pero sus aserciones son sobre
`estadoPanel` y las etiquetas de periodo: `grep -n "?? 0" src/app/dashboard/estado.test.ts`
→ **cero**.

**Causa raíz probable:** la prueba se ancló a una **ruta de archivo** en vez de a
un **componente**, y cuando el panel se mudó de casa quedó vigilando un edificio
vacío. Es la razón exacta por la que el pase 5 marcó `id_no_uuid.test.ts` como
frágil, cumplida.

---

### [ALTO] El lector de archivos **finge haber leído** un xlsx corrupto o vacío e inventa "Filas: 1" en el globo del chat; `archivo.test.ts` no tiene un solo caso de archivo dañado, vacío o del tipo equivocado

`src/lib/likida/intake/archivo.ts:82-102` (`leerHoja`, sin `try`) y `:14`
(la promesa del encabezado) · `src/app/dashboard/chat.tsx:253` (lo que se pinta)
· `src/lib/likida/intake/archivo.test.ts` (6 casos, los 6 del camino feliz)

El encabezado del módulo promete: *"Lo que NO se reconoce se dice honesto —
nunca se finge haber leído."* Medí las entradas que la prueba no ejerce,
llamando `leerArchivoUniversal` real (bundle de `esbuild` del módulo, sin tocar
el repo):

```
[XLSX CORRUPTO]      NO LANZÓ · clase=hoja · meta=[["Hojas",1],["Filas",1]]
                     extracto="### Hoja: Sheet1 (1 filas)\nesto no es un zip en absoluto"
[XLSX VACIO 0 bytes] NO LANZÓ · clase=hoja · meta=[["Hojas",1],["Filas",1]]
[CSV  VACIO 0 bytes] NO LANZÓ · clase=hoja · meta=[["Hojas",1],["Filas",1]]
[XLSX RENOMBRADO .csv] NO LANZÓ · clase=hoja · lo parsea igual
[PDF CORRUPTO]       LANZÓ InvalidPDFException  ← el único camino honesto
[PDF VACIO]          LANZÓ InvalidPDFException
```

`XLSX.read` sobre basura no lanza: la trata como CSV de una línea. El resultado
viaja tal cual a `chat.tsx:253`, que pinta `d.meta` **como tabla**.

**Escenario con valores.** El contralor arrastra `gastos-agosto.xlsx` desde una
carpeta de OneDrive sincronizada a medias (el archivo son 0 bytes en disco). El
chat contesta: *"Listo, leí «gastos-agosto.xlsx» y lo tengo a la mano en esta
conversación — pregúntame lo que quieras sobre él"*, con la tablita **Hojas 1 ·
Filas 1**. Un archivo de cero bytes no tiene una fila; **"Filas: 1" es una cifra
inventada**, y es la primera regla del `CLAUDE.md`. Después el contralor pregunta
*"¿cuánto suma la columna de diésel?"*, el extracto vacío entra al prompt del
agente como `documento`, y el agente contesta sobre un documento que no existe.

**Refutación que intenté y falló.** ¿Lo tapa el `!d?.extracto` de `chat.tsx:244`?
No: el extracto **no** está vacío, vale `"### Hoja: Sheet1 (1 filas)"`. ¿Lo tapa
`archivo/route.ts:49-57`? Su `catch` solo actúa si `leerArchivoUniversal`
**lanza**, y aquí no lanza. ¿Está probada alguna de estas entradas?
`archivo.test.ts` tiene 6 casos: Excel bueno, CSV bueno, texto gigante, CFDI
bueno, PDF bueno y extensión desconocida. **Cero de archivo dañado, vacío o
disfrazado.**

**Lo que sí está bien, y es mucho:** `archivo.test.ts` usa **archivos de verdad**
—genera el `.xlsx` con `XLSX.write` y el PDF con `pdf-lib` y lo lee con el
`pdf-parse` real (`:44-56`, 20 s de timeout)—. Es lo contrario del mock que
devuelve lo que la prueba quiere oír, y por eso `archivo.ts` está al 92.1%. El
hueco no es el método: es la **clase de entrada** que falta.

**Causa raíz probable:** el archivo se probó con el material que el autor tenía
a la mano (los que él mismo generó), y ese material siempre está bien formado.

---

### [MEDIO] `expediente_alcanzable.test.tsx`: su rojo es **falsa alarma**, su mitad importante sobrevive a que se desmonte la única puerta, y 4 de sus 6 casos renderizan un componente que ya nadie monta

`src/app/dashboard/expediente_alcanzable.test.tsx:94-98` (el caso rojo) y
`:72-92` (el barrido) · `src/app/dashboard/ultimas-liquidaciones.tsx` (huérfano,
0.0% / 54) · `src/app/dashboard/resumen-visual.tsx:157` (la puerta que sí existe)

El caso rojo exige `readFileSync('src/app/dashboard/page.tsx')` → `toContain('UltimasLiquidaciones')`.
Pero el expediente **sí tiene puerta viva**: `TablaViajes` (`resumen-visual.tsx:157`)
pinta `<Link href={`/dashboard/${v.liqId}${sufijo}`}>Ver</Link>`, y la cadena de
montaje está completa — `page.tsx:43 → InicioContenido → :321 <ViajesRecientes/>
→ viajes-recientes.tsx:34 <TablaViajes/>`. El defecto que el rojo nombra **no
está presente**.

Y `UltimasLiquidaciones`, el componente que los otros 4 casos renderizan, quedó
huérfano:

```
$ grep -rn "UltimasLiquidaciones" src/ | grep -v expediente_alcanzable.test
src/app/dashboard/ultimas-liquidaciones.tsx:32:export function UltimasLiquidaciones({   ← solo su definición
```

**Mutante exacto** sobre el barrido, que su propio encabezado (`:19-22`) presenta
como *"la mitad que faltaba y la que se vuelve a romper si mañana se borra la
sección que lo hace"*:

```tsx
// viajes-recientes.tsx:34 — se desmonta la ÚNICA puerta viva
-        <TablaViajes viajes={visibles} sufijo={sufijo} />
+        {false && <TablaViajes viajes={visibles} sufijo={sufijo} />}
```

```
 ✓ EL BUG: existe un href interpolado a /dashboard/<id> en una pantalla ALCANZABLE
      Tests  1 failed | 5 passed (6)     ← el mismo 1 de antes; el barrido NO se movió
```

**Escenario con valores.** La reconstrucción del panel del contador (agendada:
`rutas.ts` dice que las páginas se rehacen) reemplaza `ViajesRecientes` por otra
tarjeta sin la columna "Acción". `/dashboard/<uuid>` —la única pantalla con el
desglose de IVA/IEPS y el botón "Descargar PDF"— vuelve a quedar sin un solo
enlace entrante. La prueba escrita para ese bug exacto **sigue verde**, porque
`resumen-visual.tsx` sigue conteniendo el `href` interpolado y sigue siendo
importado por otros tres archivos (`panel-periodo.tsx`, `inicio-contenido.tsx`,
`viajes/nuevo/page.tsx`) — y el heurístico `importado()` (`:82-85`) pregunta si
**el archivo** se importa, no si **el componente** se monta.

**Por qué MEDIO y no ALTO:** hoy la puerta existe y el entregable es alcanzable;
lo que reporto es que el despertador no suena. Y el rojo que sí hay es ruido: le
resta credibilidad a los otros 11, que sí valen.

**Causa raíz probable:** el barrido midió *"¿hay un archivo con este href que
alguien importe?"* cuando la pregunta es *"¿hay un render que llegue a este
href?"*. Son distintas en cuanto el archivo exporta más de una cosa — que es el
caso de `resumen-visual.tsx`, con seis exports.

---

### [MEDIO] El `skipIf` de cobertura está MUERTO desde el renombre Cuadra→Likida, y la red que existe para vigilarlo está verde porque busca el *string* en el fuente en vez del comportamiento

`vitest.config.ts:35` (`env: { CUADRA_COBERTURA: … }`) ·
`src/lib/likida/normas/fundamento.test.ts:148` y
`src/lib/likida/duplicados.test.ts:151` (`skipIf(process.env.LIKIDA_COBERTURA === '1')`) ·
`src/lib/likida/pruebas_en_ci.test.ts:9` (la afirmación falsa) y `:43` (el detector)

La configuración exporta **`CUADRA_COBERTURA`**. Las dos pruebas de tiempo leen
**`LIKIDA_COBERTURA`**, que nadie define. `grep -rn "COBERTURA" src/` confirma que
no hay un tercer lector, aunque el comentario de `vitest.config.ts:7` dice *"Tres
pruebas de la suite afirman TIEMPO"*.

**Medición:**

```
$ npx vitest run --coverage src/lib/likida/duplicados.test.ts src/lib/likida/normas/fundamento.test.ts
      Tests  49 passed (49)          ← 0 saltadas, tres corridas seguidas
```

Y `pruebas_en_ci.test.ts:9` afirma, en su propio encabezado: *"`vitest.config.ts`
exporta `LIKIDA_COBERTURA=1` cuando hay `--coverage`"*. Es falso. Su detector
(`:43`) hace `/skipIf\([^)]*LIKIDA_COBERTURA/.test(fuente)`: encuentra las dos
pruebas porque el **texto** empata, y su primera aserción —`saltadas.length > 0`,
puesta explícitamente para que *"el día que desaparezca el último `skipIf` la
prueba de abajo no pase por vacía"* (`:52-54`)— sale verde certificando un
mecanismo desconectado.

**Escenario con valores.** El paso `ci.yml:76` (`npx vitest run fundamento
duplicados`) existe para correr sin instrumentar lo que la corrida instrumentada
se salta. Hoy no se salta nada: esos 49 casos corren **dos veces** en cada CI, y
el paso no aporta protección — solo minutos. Al revés, si alguien un día arregla
el nombre de la variable, los dos umbrales de tiempo empezarán a evaluarse en
condiciones distintas de las que llevan seis meses tolerando, sin que nadie lo
esté esperando.

**Por qué MEDIO y no ALTO:** verifiqué el daño real y hoy es acotado. Los dos
umbrales se ensancharon a `500 ms` (`fundamento.test.ts:141`) y `< 20`
(`duplicados.test.ts:193`) tras las caídas del 28-jul, y bajo instrumentación
sus propios comentarios miden `~107 ms` y cociente `~9` — **dentro** del umbral.
O sea: no hay intermitencia viva, hay una red que certifica lo que no pasa.

**Causa raíz probable:** el renombre de marca tocó los cuerpos de prueba y no
`vitest.config.ts` (o al revés), y el detector no pudo notarlo porque compara un
literal contra sí mismo en vez de leer el nombre de la variable desde la
configuración.

---

### [MEDIO] `TOOLS_LECTURA` puede nombrar una tool que no existe y nada falla —`toolSchemas` filtra en silencio—; 10 de las 11 tools del chat no tienen una sola aserción

`src/lib/agents/analista.ts:39-43` (la lista) · `src/lib/llm/tool-executor.ts:57-61`
(`toolSchemas`) · `src/lib/agents/chat-tools.ts` (11 `registerTool`, 68.4% / 209)

```ts
// tool-executor.ts:57
export function toolSchemas(names: string[]): OpenAI.Chat.ChatCompletionTool[] {
  return names.map((n) => REGISTRY.get(n)?.schema)
    .filter((s): s is OpenAI.Chat.ChatCompletionTool => Boolean(s));   // ← el nombre malo se cae aquí, callado
}
```

**Mutante exacto** (suite completa):

```ts
-const TOOLS_LECTURA = ['kpis_flota', 'acreditables_periodo', …
+const TOOLS_LECTURA = ['kpis_flota_XX', 'acreditables_periodo', …
```

```
      Tests  15 failed | 3298 passed | 1 skipped (3314)     ← IDÉNTICO a la línea base
```

Y de las 11 tools registradas, **solo `proyectarPuntos` tiene prueba**
(`analista_guardia.test.ts:75-84`, y es la única exportada como función pura).
`grep -rln "kpis_flota\|serie_gasto\|top_rutas\|duplicados_detectados" src --include=*.test.ts*`
→ un solo archivo, `analista_prompt.test.ts`, y solo porque el **prompt** los
menciona en prosa.

**Escenario con valores.** Alguien renombra `top_rutas` → `rutas_top` en
`chat-tools.ts` para alinearlo con la tool de `tools.ts`. `analista.ts:42` sigue
diciendo `'top_rutas'`, `toolSchemas` lo descarta, y el agente **pierde
silenciosamente** la capacidad de responder "¿cuáles son mis rutas más caras?".
El modelo, sin esa tool, contesta con las que sí tiene o dice que no puede — y
como no hay cifra inventada, la guardia no se queja. Suite verde, `tsc` verde,
lint verde. Se descubre en el demo.

**Refutación que intenté y falló.** ¿Es a propósito el filtro silencioso?
Probablemente sí en `tool-executor.ts` (es genérico y lo comparten varios
agentes). Lo que falta no es que lance: es **una prueba que afirme que
`toolSchemas(TOOLS_LECTURA)` devuelve 10 esquemas**, que es una línea. La regla
estructural de `properties: {}` —que el MAPA marca como "reconocer, no
encontrar"— **sí la respetan las 11 tools nuevas**: los únicos parámetros son
`modo` y `serie`, enums cerrados (`chat-tools.ts:28-35`, `:216-224`). Eso está
bien y lo verifiqué antes de escribir esto.

---

### [BAJO] El alta de viaje llegó con la lógica probada y el **cableado** sin arnés: `forma-viaje.tsx` 0.0% / 65, y la server action de `viajes/nuevo/page.tsx` es invisible para la cobertura

`src/app/dashboard/viajes/nuevo/page.tsx:38-79` (la server action `crear`) ·
`src/app/dashboard/forma-viaje.tsx` (0.0% / 65) · `vitest.config.ts:74`
(`src/app/**/page.tsx` excluido)

Lo bueno primero, porque es la mitad que importa: **`crearViaje` sí está
anclado**. Mutante de control corrido hoy:

```ts
// operacion.ts:551
-  if (propio.length === 0) throw new Error('crearViaje: el operador no pertenece a esta flota');
+  if (false && propio.length === 0) throw new Error(…);
```

```
 × AUDITORÍA 10: crearViaje RECHAZA un operadorId de OTRA flota, y no inserta el viaje
      Tests  1 failed | 32 passed (33)      ← muere con el nombre exacto
```

Lo que no tiene arnés es lo que la página agrega encima: `puedeAsignar(sesion.rol)`
(`:44`), la validación de `anticipo` (`:52-56`) y la de formato de fecha
(`:57-60`). Tres reglas escritas a mano, en un archivo que la cobertura **excluye
por configuración**, así que ni siquiera aparece un 0% que las delate. Y el
formulario que las alimenta está a 0.0% de 65.

**Escenario con valores.** Alguien reordena la action y deja el `re-check` de
`puedeAsignar` **después** del `crearViaje`. Un `contador` —que no puede asignar—
hace POST directo a la server action (que el comentario `:41-42` reconoce como
alcanzable) y crea un viaje. La suite sale verde: es la misma clase de falla que
`id_no_uuid.test.ts` intentó cubrir para `[id]/page.tsx`, en la página nueva, y
sin ni siquiera el `indexOf` frágil.

**Por qué BAJO:** la escritura peligrosa (`crearViaje`) está bien probada, con
sus dos candados de tenant vivos y medidos. Lo que falta es la capa de arriba,
y hoy está bien escrita.

---

## Hallazgos abiertos de pases anteriores: qué pasó con cada uno

Verificados contra la cobertura de hoy y contra el árbol post-merge.

| Hallazgo | Estado | Evidencia de hoy |
|---|---|---|
| **[CRÍTICO] C6 — la cola de CFDI sin una sola prueba** | **REINCIDENTE, 6.º pase** | `cola/route.ts` **0.0% / 47**; `ls` → un solo archivo, cero `*.test.ts`. Último commit que lo tocó: `88a0ee6`, **6-ago**. Este pase el equipo escribió 31 archivos de prueba nuevos; ninguno fue este |
| **[ALTO] `/api/dashboard/asistente` — IDOR, 0%** | ✅ **CERRADO POR SUPRESIÓN** | la carpeta ya no existe (`ls src/app/api/dashboard/` → `archivo chat ingesta`). El IDOR se fue con la ruta — pero su forma reaparece sin arnés en `chat/route.ts:56-60` (hallazgo 3) |
| **[ALTO] hallazgo 1 del pase 5 — `chrome.tsx` monta el sidebar y nadie lo prueba** | **REINCIDENTE** | **0.0% / 55**, byte-idéntico; `grep -rln "chrome" src --include=*.test.ts*` → vacío |
| **[MEDIO] hallazgo 4 del pase 5 — `dominioVigente()` lee una migración vieja en silencio** | **REINCIDENTE, y ahora DUPLICADO** | El arreglo del pase 5 copió la misma regex a `admin/flotas/regimen_catalogo.test.ts:39`. Sonda: creé `0094_zz_sonda_auditoria17.sql` redefiniendo el CHECK con `= any (array['601','624'])` → **`fiscal.test.ts` 8/8 y `regimen_catalogo.test.ts` 3/3, verdes las dos**, con la base rechazando 4 de las 6 claves que las pantallas ofrecen. Sonda borrada |
| **[ALTO] hallazgo 2 del pase 5 — `/admin/flotas` ofrecía 8 claves que el CHECK rechaza** | ✅ **CERRADO Y ANCLADO** | `regimen_catalogo.test.ts` (nuevo, 3 casos) lee el CHECK vivo y el `<select>` vivo, y afirma en las dos direcciones. Lo mejor del trabajo de reparación de este ciclo |
| **[MEDIO] hallazgo 3 del pase 5 — la aserción de cableado de `id_no_uuid.test.ts`** | **REINCIDENTE** | `[id]/page.tsx:62` y el test byte-idénticos; no re-muté (mismo criterio que C6) |
| **[MEDIO] hallazgo 5 del pase 5 — la regla "Ver como" del sidebar sin arnés** | **REINCIDENTE, no medible hoy** | `sidebar-nav.tsx:98` sigue con `rolMenu = rol === 'superadmin' && rolVista ? rolVista : rol`. No lo pude re-mutar con señal: su única prueba (`sidebar_puerta.test.tsx`) ya está roja por el merge |
| **[ALTO] el trinquete de cobertura premia borrar** | **ABIERTO, y este pase lo ejerció al revés** | +1,643 statements de denominador contra +607 cubiertos. El % baja ~2.9 pt y **el trinquete no se entera**: 68.66 sigue por encima de 67. Peor: con la suite en rojo, **el reporte no se emite** y el umbral no se evalúa en absoluto |
| **[ALTO] `opcionesDe` — el 15% derivado sin arnés** | **REINCIDENTE** | `likida/fiscal.ts` en **75.4% / 471**; sigue leído por `chat-tools.ts:93` (`motor_fiscal`), o sea que ahora también alimenta al agente |
| **[ALTO] cron `escalar` a 0%** | **REINCIDENTE** | 0.0% / 37 |
| **[ALTO] cron `purgar` BORRA filas a 0%** | **REINCIDENTE** | 0.0% / 33 |
| **[ALTO] las descargas de dinero a 0%** | **REINCIDENTE** | `export/liquidaciones` 0.0% / 42 · `export/pdf/[id]` **0.0% / 122** (creció de 106) |
| **[ALTO] `analytics.ts` pierde el filtro de tenant sin que nada falle** | **REINCIDENTE** | 88.2% / 817. Ahora lo llaman también 8 de las 11 tools del agente |
| **[MEDIO] `comercial.ts` 0%** | **REINCIDENTE** | 0.0% / 200 |
| **[MEDIO] las pantallas del Resumen a 0%** | **REINCIDENTE Y AGRAVADO** | el Resumen se rehizo entero y volvió a llegar a 0%: `inicio-contenido.tsx` 0.0% / **174**, `barra-acciones.tsx` 0.0% / 75, `viajes-recientes.tsx` 0.0% / 21 |
| **[MEDIO] `verificaciones.sql` sin corredor** | **REINCIDENTE** | `grep -rn "verificaciones.sql" .github/ package.json` → **vacío**. Nadie lo ejecuta, sexto pase |
| **[MEDIO] `dinero_por_area.test.ts` con una sola pila** | **REINCIDENTE** | sigue en 2 casos; su lista (`:76`) sí se repuntó a `inicio-contenido.tsx` |
| **[MEDIO] `getLiquidaciones` rescatada sin arnés** | **REINCIDENTE Y AGRAVADO** | ahora es el cuerpo de la tool `liquidaciones_flota` (`chat-tools.ts:133`), o sea que su salida llega al modelo |
| **[BAJO] `pruebas_en_ci.test.ts` solo mira `.test.ts`** | **REINCIDENTE** | `:43` sigue con `.endsWith('.test.ts')`; hay 8 `.test.tsx` en el repo. Se queda BAJO porque ninguno usa `skipIf` — y de todas formas el mecanismo está muerto (hallazgo 7) |
| **[BAJO] 3 aserciones de permisos tautológicas** | **REINCIDENTE** | `visibilidad.test.ts`, `session.test.ts` sin cambios |
| **[BAJO] `fiscal_series.test.ts` afirma por índice de llamada** | **REINCIDENTE** | sin cambios |
| **[MEDIO] `actividad.test.ts` intermitente** | ✅ **SIGUE CERRADO** | verde en UTC, Asia/Tokyo y Etc/GMT+12 |
| **[ALTO] "DOS CORRIDAS SOLAPADAS" no prueba el claim** · **[ALTO] rollback del candado de Stripe** · **[ALTO] `agente.ts:325` `ok` clavado en `true`** · **[ALTO] `rail.tsx` a 0%** · **[MEDIO] el ancla del PGRST201** · **[MEDIO] la regresión de layout de `contador/page.test.tsx`** | **REINCIDENTES** | no los re-medí este pase: el presupuesto se fue al frente nuevo, que es lo que se me pidió priorizar. Lo apunto en "lo que NO alcancé a revisar" para que no cuente como verificado |

---

## Lo que revisé y está bien

- **Los 11 rojos de verdad.** Abrí los 7 archivos y verifiqué el mecanismo de cada
  uno: `sidebar_puerta` (3) calcula faltantes con `rutas.ts` real,
  `panel_periodo` (3) / `objetivo_de_toque` (2) / `aria_current` (2) /
  `kpi-periodo` (1) hacen `renderToStaticMarkup` del componente real. **Ninguno
  necesitó a nadie que lo fuera a buscar.** Es la evidencia dura de que la
  inversión de los pases 2–5 en pruebas de render —no de fuente— fue la correcta.
- **`archivo.test.ts` no mockea nada.** Genera el `.xlsx` con `XLSX.write`, el PDF
  con `pdf-lib` y lo lee con el `pdf-parse` de producción (`:44-56`). Es lo
  contrario de las dos suites de Stripe que el pase 5 cazó, y es la razón de que
  `archivo.ts` esté al 92.1%. El método está bien; lo que falta es la clase de
  entrada (hallazgo 6).
- **La capa LLM sigue siendo la mejor probada del repo.** `openrouter.ts` al
  **90.9% de 408** con arnés propio para loop-guard (`openrouter_loopguard.test.ts`,
  que sí afirma que la 3.ª ronda **no ejecuta** su tool antes de tirar
  `LoopGuardError`), fallback entre modelos, costo por modelo, truncado y truncado
  con tools. `tool-executor.ts` al 94.7%. El agente nuevo se apoya en eso, y ese
  apoyo es sólido.
- **`crearViaje` está anclado en el número que importa.** Mutante de control:
  apagar el candado de tenant (`operacion.ts:551`) mata **1 de 33** con el nombre
  exacto del caso (`AUDITORÍA 10: crearViaje RECHAZA un operadorId de OTRA
  flota`). El método distingue.
- **`regimen_catalogo.test.ts` cerró bien el ALTO del pase 5.** Lee el CHECK vivo
  de `supabase/migrations` y el `<select>` vivo de la página, y afirma en las
  **dos** direcciones (ofrecidas-que-la-base-rechaza y aceptadas-que-no-se-ofrecen).
  Además cubre el default vacío. Es el trabajo de reparación mejor hecho del ciclo.
- **La regla estructural de tool calling se respetó en las 11 tools nuevas.**
  Verifiqué cada `parameters`: 9 usan `SIN_PARAMS` (`{}`) y 2 usan enums cerrados
  (`modo`, `serie`). Ninguna acepta texto libre; `ctx.tenantId` sale del servidor
  en las 11. Eso es lo que el MAPA pide reconocer y no "encontrar", y se cumplió.
- **`validacion.ts` es el patrón correcto, y su prueba tiene dientes.** Sacar los
  helpers puros fuera de `route.ts` "para que se prueben solos" es exactamente lo
  que hay que hacer; sus 3 casos fijan el recorte a 12 turnos / 2,000 chars, los
  roles inválidos y el cierre por usuario. Mi crítica (hallazgo 3) es que se hizo
  para el 30% del endpoint.
- **Cero intermitencia en el frente nuevo.** Los 32 casos de `src/lib/agents/`,
  `chat/validacion` e `intake/archivo` corren verdes en `UTC`, `Asia/Tokyo` y
  `Etc/GMT+12`. La suite completa corrió 5 veces hoy con resultado byte-idéntico,
  sin salida a internet.
- **El CI no se tocó y sigue completo.** `ci.yml`: `npm ci`, `typecheck`, `lint`,
  `test:coverage`, el paso de tiempo sin instrumentar, y `npm run build` (que aquí
  no se corre por falta de credenciales — no es hueco del CI).
- **`pruebas-manuales/` no cambió** y sigue fuera del include de vitest. No corrí
  nada de ahí, por instrucción.

---

## Lo que NO alcancé a revisar

- **Seis reincidentes que NO re-medí este pase** (los de la última fila de la
  tabla): el recordatorio de comprobación, el rollback del candado de Stripe,
  `agente.ts:325`, `rail.tsx`, el ancla del PGRST201 y la regresión de layout. Los
  reporto como reincidentes por lectura del diff, **no** por mutación fresca. El
  presupuesto se fue al frente nuevo, que es lo que se priorizó.
- **`engine.test.ts` (86 KB, ~600 casos).** Sexto pase sin barrerlo caso por caso.
  Este pase no le hice ni una mutación. Sigue siendo la mitad que le falta al rubro.
- **`ejecutarAnalista` de punta a punta.** Demostré que la guardia se desconecta
  sin costo, pero no audité el reintento correctivo (`:351-376`), la red
  determinística final (`:382-399`), el `AbortController` de 40 s ni la fuga
  potencial del mapa `CAPTURAS` si el `finally` no corre. Son ~90 statements de
  orquestación que nadie ha mirado.
- **`chat.tsx` (510 statements)** más allá del árbol de `responder()`: el manejo
  de adjuntos, el reloj de fases, el historial que se manda al servidor.
- **La cobertura REAL con los 7 rojos dentro.** Mientras la suite esté roja no hay
  número, y mi 68.66% es una cota inferior con ~400 statements de sesgo conocido.
- **Cobertura de RAMAS por archivo.** Sexto pase sin saber qué sostiene el 84.68%,
  que sigue siendo el umbral con menos aire (0.68 pt).
- **`src/lib/saas/suscripcion.ts` y `stripe.ts`** — la cobranza de Likida a sus
  propias flotas, sin auditar en seis pases.
- **`intake/consolidado.ts`**, **`meta/client.ts`**, **`al_vuelo.test.ts` (46 KB)**
  y el 24.6% sin ejecutar de `likida/fiscal.ts`.
- **`supabase/verificaciones.sql`.** Confirmé otra vez que nadie lo corre; no leí
  sus bloques buscando aserciones flojas.

---

## Árbol limpio

`git status --short` y `git diff` al terminar todos mis experimentos:

```
$ git diff --stat -- src/ supabase/ .github/
(vacío)

$ git status --short
 M docs/auditoria-17/arquitectura.md      ← de otro auditor del pase 6, no lo toqué
```

**De todo lo trackeado en `src/`, `supabase/` y `.github/`: cero modificaciones.**
No hice ningún commit.

Las **siete** mutaciones y las **dos** sondas de este pase, cada una revertida
con `git checkout -- <archivo>` (o `rm`) inmediatamente después de su corrida,
con `git status` verificado entre una y otra:

| # | Archivo | Mutante / sonda | ¿Murió? |
|---|---|---|---|
| 1 | `dashboard/inicio-contenido.tsx:287` | `?? 0` → `?? null` *(arreglar el defecto)* | ❌ **ROJA IGUAL** — 3/3 (hallazgo 4) |
| 2 | `dashboard/viajes-recientes.tsx:34` | `{false && <TablaViajes …/>}` | ❌ **SOBREVIVIÓ** el barrido — 5 verdes (hallazgo 5) |
| 3 | `lib/agents/analista.ts:348,382` | quitar `cifrasRespaldadas` de las dos guardas | ❌ **SOBREVIVIÓ** — 3,298 verdes, suite byte-idéntica (hallazgo 2) |
| 4 | `lib/agents/analista.ts:40` | `'kpis_flota'` → `'kpis_flota_XX'` | ❌ **SOBREVIVIÓ** — 3,298 verdes (hallazgo 8) |
| 5 | `lib/likida/operacion.ts:551` | `if (false && propio.length === 0)` | ✅ **1 de 33**, con el nombre exacto *(control: el método distingue)* |
| 6 | `supabase/migrations/0094_zz_sonda_auditoria17.sql` *(creado y borrado)* | CHECK redefinido con `= any (array[…])` | ❌ **SOBREVIVIÓ** — `fiscal.test.ts` 8/8 y `regimen_catalogo.test.ts` 3/3 |
| 7 | `src/lib/agents/zzz_sonda_auditoria17.test.ts` *(creado y borrado)* | sonda de dilución de la guardia, importando el módulo REAL | midió: 12,500 pasa con respaldo de 77 (hallazgo 1) |
| 8 | *(fuera del repo)* | bundle de `archivo.ts` con esbuild + 10 entradas de borde | midió: xlsx corrupto y vacío no lanzan (hallazgo 6) |
| 9 | *(sin mutar)* | `npx vitest run --coverage` sobre los 2 tests de tiempo | midió: **0 saltadas** (hallazgo 7) |

**Un control murió a la primera y con el mensaje exacto**, así que el método
distingue. **Cuatro mutantes sobrevivieron**, y tres de los cuatro son el mismo
patrón que el pase 5 nombró y este pase encontró en código nuevo: **el arnés se
pega a la función pura o a la ruta del archivo, nunca al camino por el que la
pantalla falla.**
