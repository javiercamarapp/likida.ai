# Pruebas — auditoría 17 · pase 5 (12-ago-2026)

**Nota: 6/10** (antes 5). Razón del movimiento: **se atacó y subió**. Los tres
arneses nuevos del pase 4 **anclan de verdad** —lo medí revirtiendo cada arreglo,
no leyéndolos—, `sidebar-nav.tsx` pasó de **0.0% a 90.5%**, y `saas/fiscal.test.ts`
**sí lee el CHECK vigente** de la migración (lo probé en las dos direcciones).
Ninguno de los tres arreglos entró sin red, que era el hallazgo caro que este pase
venía a buscar. No sube más porque **el síntoma del CRÍTICO todavía se reproduce
con la suite entera en verde** (hallazgo 1), porque la aserción de cableado del
tercero **se derrota en un intento** (hallazgo 3), y porque **C6 llega a su quinto
pase** con los otros once hallazgos abiertos byte-idénticos.

> **El riesgo mayor del rubro, hoy:** las tres pruebas nuevas anclan el **archivo
> que se arregló** y no el **camino que falla**. Puedo dejar el `<nav>` del panel
> vacío otra vez —el CRÍTICO del pase 4, mismo síntoma, misma pantalla— tocando
> `chrome.tsx` en vez de `sidebar-nav.tsx`, y las 3,134 pruebas siguen verdes.
> Puedo apagar la guarda de `[id]` dejándola escrita en su línea, y sus 21 casos
> siguen verdes. El arnés se pegó al parche, no al modo de falla.

---

## Compuerta, verificada por mí hoy

```
npx vitest run          → 261 archivos · 3,134 verdes · 1 saltada   (54.8 s)
npx vitest run --coverage
   Statements 71.58% (12811/17897) · Branches 84.64% (4933/5828)
   Functions  83.29% (708/850)     · Lines     71.58%
   umbrales 67/84/79 → PASA
```

Coincide con la línea base del orquestador. Delta contra el pase 4:

| | pase 4 | pase 5 | delta |
|---|---|---|---|
| pruebas verdes | 3,105 | **3,134** | +29 |
| statements **cubiertos** | 12,749 | **12,811** | **+62** |
| statements totales | 17,890 | 17,897 | +7 |
| % statements | 71.26 | **71.58** | +0.32 |
| % ramas | 84.66 | **84.64** | **−0.02** |
| margen de RAMAS contra el umbral 84 | 0.66 pt | **0.64 pt** | −0.02 |

Esta vez el porcentaje sube porque de verdad se cubrió más (+62 statements con
+7 de denominador), que es lo contrario del pase 4. Lo apunto porque el hallazgo
del trinquete sigue abierto y este pase es el contraejemplo honesto. **Ramas es la
excepción:** las tres pruebas nuevas metieron 24 ramas y cubrieron 19, así que el
umbral con menos aire se apretó un poco más.

Los tres archivos que cambiaron, medidos:

```
  90.5%   63  src/app/dashboard/sidebar-nav.tsx     ← 0.0% en el pase 4
 100.0%    4  src/app/dashboard/[id]/id.ts          ← nuevo
  73.9%   69  src/lib/saas/fiscal.ts
   0.0%   57  src/app/dashboard/chrome.tsx          ← el que MONTA el sidebar (hallazgo 1)
   0.0%   47  src/app/api/cron/facturar/cola/route.ts   ← C6, QUINTO pase
```

`src/app/**/page.tsx` está **excluido** de la cobertura por configuración
(`vitest.config.ts`), así que `[id]/page.tsx` —donde vive la guarda del arreglo
3— no aparece en ningún número: la única evidencia sobre él es la aserción de
texto que el hallazgo 3 desarma.

---

## Mutación medida de las 3 pruebas nuevas del pase 4

Reverti cada arreglo a su versión previa con `git show <commit>^:<archivo>`, corrí
**solo** su prueba, conté, y restauré con `git checkout --` verificando
`git status` entre una y otra.

| Prueba | Casos | Fallos al revertir el arreglo | ¿Ancla de verdad? |
|---|---|---|---|
| `src/app/dashboard/sidebar_puerta.test.tsx` | 5 | **4** (`flota_admin`, `contador`, `encargado` sin puertas + `hrefsPintados('contador').length === 0`) | **SÍ** — y coincide exacto con lo que afirmó `8d6ac51`. Pero ancla el componente, no el montaje: ver hallazgo 1 |
| `src/lib/saas/regimen_no_se_pierde.test.ts` | 3 | **2** (`faltantes = ['624']` en el barrido + `624 no está en el catálogo`) | **SÍ** — coincide exacto con lo que afirmó `12cc8c6`. Pero su mensaje de fallo nombra un archivo que la prueba nunca abre: hallazgo 2 |
| `src/app/dashboard/id_no_uuid.test.ts` | 21 | **1** de 21 revirtiendo solo el cableado (`page.tsx`); revirtiendo también `id.ts` el archivo entero **no carga** (0 pruebas corridas) | **PARCIAL** — el caso de cableado es el único con valor y se derrota en un intento: hallazgo 3 |
| `src/lib/saas/fiscal.test.ts` (reescrito) | 8 | 0 con el arreglo revertido, **y eso es correcto**: afirma SUBCONJUNTO a propósito | **SÍ lee el CHECK vigente** — verificado abajo. Con un hueco de silencio: hallazgo 4 |

### ¿`fiscal.test.ts` de verdad lee el CHECK, o lee otra cosa que hoy coincide?

Lo probé en las **dos** direcciones, porque leer el archivo no distingue una
lectura real de una coincidencia:

```
# 1) ¿lee la 0088 (la vigente) y no la 0056 (la vieja)?
   quité '626' del CHECK de 0088_regimen_624_coordinados.sql
 × los catálogos que ofrece la pantalla son los que la base acepta
   → la pantalla ofrece regímenes que el CHECK de la base rechaza: expected [ '626' ]
   Tests  1 failed | 7 passed (8)          ← LEE LA 0088. Confirmado.
```

Es la única de las cuatro que hace lo que dice hacer sobre la fuente de verdad,
y `git diff` confirma que el bloque de la lista a mano desapareció. Ese pedazo
está bien hecho.

---

## C6 — estado

`src/app/api/cron/facturar/cola/route.ts:40,66` — **0.0%, 47 statements. QUINTO
pase sin moverse.** Confirmado como se me pidió, sin gastar la ronda ahí:

```
$ git log -1 --format="%h %ad %s" --date=short -- src/app/api/cron/facturar/cola/route.ts
ec012da 2026-08-05 fix(qstash): imports estáticos del Client/Receiver …

$ ls src/app/api/cron/facturar/cola/
route.ts          ← un solo archivo, cero *.test.ts

cobertura de hoy:  0.0%  47 stmts
```

El último commit que lo tocó es del **5-ago-2026**, *cuatro días antes* de que
empezara la auditoría 17. Es el callback que QStash invoca para emitir CFDI: el
mutante doble (firma a `false &&` + quitar `.is('cfdi_uuid', null)`) se corrió ya
en los pases 2 y 3 con la suite verde las dos veces. Correrlo una cuarta vez
sobre un archivo que no cambió no produce señal; el escenario y la consecuencia
—un CFDI duplicado que le queda al cliente en su contabilidad y que no se
deshace— siguen tal cual en el pase 3, sección *«C6 primero»*. **Sigue CRÍTICO.**

Lo nuevo que vale registrar: este pase el equipo tocó cuatro archivos de `src/` y
escribió tres arneses. Ninguno fue este.

---

## Hallazgos

### [ALTO] El síntoma exacto del CRÍTICO del pase 4 —el `<nav>` del panel vacío— se vuelve a producir con las 3,134 pruebas en verde: la prueba nueva ancla el sidebar, no que alguien lo monte

`src/app/dashboard/chrome.tsx:66` (0.0% de cobertura, 57 statements) ·
`src/app/dashboard/sidebar_puerta.test.tsx:43` (renderiza `SidebarNav` directo)

El arreglo `8d6ac51` cerró el bug *«`sidebar-nav.tsx` no importa NEGOCIO ni
GESTION»* y su prueba lo ancla bien (4 fallos, medidos arriba). Pero el CRÍTICO
que el auditor de frontend reportó no era ese: era **«el `<nav>` de `chrome.tsx:65`
se renderiza vacío»**. Y `chrome.tsx` es el único archivo que monta el sidebar:

```
$ grep -n "SidebarNav" src/app/dashboard/chrome.tsx
5:import SidebarNav from './sidebar-nav';
66:          <SidebarNav rol={rol} />
$ grep -rln "sidebar-nav\|SidebarNav" src/ --include=*.test.ts --include=*.test.tsx
src/app/dashboard/sidebar_puerta.test.tsx        ← el único, y monta el componente él mismo
```

**Mutante exacto** (corrido hoy, suite completa):

```tsx
-          <SidebarNav rol={rol} />
+          {false && <SidebarNav rol={rol} />}
```

```
 Test Files  261 passed (261)
      Tests  3134 passed | 1 skipped (3135)
 npx tsc --noEmit -p .  → 0 errores
```

**Escenario con valores.** Javier abre el demo en `/dashboard?vista=demo` desde
`admin/selector-vista.tsx:54`. `chrome.tsx` pinta la barra lateral, el logo, el
avatar — y el `<nav>` vacío. Cero links, para los cinco roles. Es el mismo píxel,
la misma pantalla y la misma consecuencia que el CRÍTICO que este PR dice haber
cerrado: siete páginas vivas (`arco`, `soporte`, `combustible-casetas`,
`usuarios`, `politicas`, `suscripcion`, `configuracion`) alcanzables solo
tecleando la URL, `/dashboard/arco` entre ellas.

**Refutación que intenté y falló.** ¿Lo caza otra prueba por otro lado?
`chrome.tsx` está en **0.0%** de 57 statements y ningún `*.test.ts*` lo nombra
(`grep -rln "chrome" src/ --include=*.test.ts*` → vacío). ¿Lo caza el linter, por
JSX inalcanzable? No: `npx tsc --noEmit` da 0 y el mutante es JSX legal.

**Consecuencia:** el contralor abre el panel en la sala y no hay a dónde hacer
clic. Y lo específico de mi rubro: la prueba nueva se escribió con el encabezado
*«el guardarraíl que debía cazarlo cubre la regla y no el cableado»* — y cerró un
nivel de cableado dejando el siguiente abierto. Es el mismo patrón que critica,
movido un archivo arriba.

**Causa raíz probable:** el arnés se pegó al archivo del parche
(`sidebar-nav.tsx`) en vez de a la pantalla que falla (`chrome.tsx`, que es la que
tiene el `<nav>` del que hablaba el hallazgo).

---

### [ALTO] `regimen_no_se_pierde.test.ts` dice en su mensaje de fallo *«el alta (/admin/flotas) reconoce estos regímenes»* y nunca abre `/admin/flotas`: ese `<select>` ofrece 8 claves que el CHECK de la base rechaza, y nada lo caza

`src/lib/saas/regimen_no_se_pierde.test.ts:45-50` (lee `administracion.ts`) y
`:58-61` (el mensaje que nombra `/admin/flotas`) ·
`src/app/admin/flotas/page.tsx:218-234` (el `<select>` real) ·
`supabase/migrations/0088_regimen_624_coordinados.sql:32-39` (el CHECK)

La prueba deriva su lista con esto:

```ts
const src = readFileSync('src/lib/likida/administracion.ts', 'utf8');
const m = src.match(/REGIMENES_ELEGIBLES\s*=\s*\[([^\]]*)\]/);
```

`REGIMENES_ELEGIBLES` es **`['624','612']`** (`administracion.ts:128`) — la lista
de quién califica a la facilidad del 15%, **no** el catálogo del alta. El
`<select>` de `/admin/flotas` ofrece **once** claves:

```
624  601  612  605  606  607  608  610  611  615  616
```

y el CHECK vigente (`tenant_regimen_fiscal_dominio`, mig. 0088) acepta **seis**:

```
601  603  612  621  624  626
```

**Ocho de las once opciones que Javier puede elegir violan el CHECK**: 605, 606,
607, 608, 610, 611, 615, 616. Y `crearFlota` las inserta crudas, sin validar:

```ts
// administracion.ts:140
.insert({ nombre, rfc: rfc ?? null, ciudad: …, regimen_fiscal: f.regimenFiscal ?? null, … })
```

**Escenario con valores.** Javier da de alta una flota y elige *«615 —
Incorporación Fiscal»* (una etiqueta razonable, y la única que suena a régimen
chico en la lista). Postgres contesta `23514 new row for relation "tenant"
violates check constraint "tenant_regimen_fiscal_dominio"`, `crearFlota` lo
reenvía como `Error`, y el alta de la flota **truena**. Nótese además que el CHECK
sí admite `621` —la clave real de Incorporación Fiscal— y el `<select>` no la
ofrece: la etiqueta y la clave no empatan.

**Refutación que intenté y falló.** ¿Alguna prueba mira ese `<select>`?
`grep -rln "admin/flotas/page.tsx" src/ --include=*.test.ts*` devuelve **un solo
archivo: `regimen_no_se_pierde.test.ts`, y solo en su comentario de la línea 13**.
`grep -rn "'605'\|'616'" src/ --include=*.test.ts*` → **cero**.
¿Lo cubre `fiscal.test.ts`? No: ese compara `saas/fiscal.ts` REGIMENES contra el
CHECK, y `saas/fiscal.ts` sí es subconjunto exacto. ¿`regimen_facilidad_15.test.ts`?
Mockea supabase, así que el CHECK nunca se evalúa.

**Consecuencia:** el alta de una flota puede fallar con un 500 en el paso uno de
un demo. Y para mi rubro, lo caro es otra cosa: una prueba cuyo **mensaje de
fallo afirma haber comparado contra `/admin/flotas`** cuando comparó contra
`administracion.ts`. El próximo que la lea creerá que esa divergencia está
cubierta. Está cubierta para 2 claves de 11.

**Por qué ALTO y no CRÍTICO:** las tres opciones plausibles para una flota de
carga (624, 601, 612) son las tres que sí pasan el CHECK, así que el demo se cae
solo si Javier elige mal. Pero el hueco es de 8 claves y no lo mira nadie.

**Causa raíz probable:** la prueba tomó la lista más fácil de parsear
(`REGIMENES_ELEGIBLES`, una sola línea) en vez de la que su propio texto declara
comparar (las `<option>` de la página del alta).

---

### [MEDIO] La aserción de cableado de `id_no_uuid.test.ts` falla en las dos direcciones: se derrota dejando la guarda escrita, y se pone roja con un renombre inocente

`src/app/dashboard/id_no_uuid.test.ts:54-64` · `src/app/dashboard/[id]/page.tsx:62`

Es el caso que el commit `58c44f9` presenta como la diferencia entre este arnés y
el *«arnés que aparenta»*: lee el código fuente y exige que la guarda esté antes
de la consulta. Se me pidió juzgar si es sólida. **No lo es**, y lo medí en los
dos sentidos.

**Falso negativo — la guarda se apaga y los 21 casos siguen verdes:**

```tsx
-  if (!esIdDeLiquidacion(id)) notFound();
+  if (false && !esIdDeLiquidacion(id)) notFound();
```

```
 ✓ src/app/dashboard/id_no_uuid.test.ts (21 tests) 6ms
      Tests  21 passed (21)
```

El texto `esIdDeLiquidacion(id)` sigue apareciendo antes de
`getLiquidacionDetalle(id`, y `notFound()` sigue apareciendo entre los dos: las
tres aserciones de `:60-63` se cumplen al pie de la letra mientras el `22P02`
vuelve entero. La prueba mide **orden de aparición en el texto**, no flujo de
control, y un `indexOf` no distingue una guarda de una guarda muerta.

**Falso positivo — el código está bien y la prueba se pone roja mintiendo:**

```tsx
-  const { id } = await params;
-  if (!esIdDeLiquidacion(id)) notFound();
+  const { id: segmento } = await params;
+  const id = segmento;
+  if (!esIdDeLiquidacion(segmento)) notFound();
```

```
 × la página llama la guarda ANTES de consultar la liquidación
   → la página no llama esIdDeLiquidacion: expected -1 to be greater than -1
```

La guarda **sí** se llama, exactamente igual de bien. El mensaje afirma lo
contrario y manda al siguiente a buscar un bug que no existe.

**Escenario con valores.** Alguien reconstruye el panel del contador (está
agendado: `rutas.ts:12-24` dice que las 35 páginas se rehacen), toca
`[id]/page.tsx` para meter el nuevo layout y envuelve la guarda en una condición
—`if (!esVistaEmbebida && !esIdDeLiquidacion(id)) notFound();`— sin darse cuenta
de que `esVistaEmbebida` es siempre `true` en su caso. Un contralor abre el
marcador `/dashboard/cuadre` que le pegaron por WhatsApp en el demo, Postgres
lanza `22P02 invalid input syntax for type uuid: "cuadre"`, `exigir()` falla
cerrado como debe, y la pantalla que sale es el error boundary. Los 21 casos
verdes en el CI.

**Refutación que intenté y falló.** ¿Hay otra prueba que ejerza la página?
`[id]/page.tsx` está **excluido de la cobertura** por `vitest.config.ts`
(`src/app/**/page.tsx`), así que ni siquiera aparece un 0% que lo delate. Los
otros 20 casos prueban `esIdDeLiquidacion` en aislamiento y ninguno toca la
página.

**Por qué MEDIO y no ALTO:** hoy el cableado está bien puesto y la regla
(`id.ts`, 100%) está sólidamente probada; lo que reporto es que el despertador
del cableado se apaga solo. Los 20 casos de la regla sí valen.

**Causa raíz probable:** se eligió `indexOf` sobre el fuente en lugar de invocar
la página (que es un Server Component con sesión, y por eso se evitó) — pero un
`indexOf` no puede distinguir código de código muerto, y el comentario de `:55`
promete que sí.

---

### [MEDIO] `dominioVigente()` se queda leyendo una migración vieja **en silencio** si una futura escribe el mismo CHECK con otra sintaxis — el arreglo desconjeló la lista solo para una forma exacta de SQL

`src/lib/saas/fiscal.test.ts:24-41`, la línea del silencio es `:36-38`

El bucle recorre `supabase/migrations` en orden y guarda `ultimo` **solo cuando
la regex empata**. Si una migración posterior redefine el mismo constraint en
cualquier otra forma válida, no empata, `ultimo` conserva el valor anterior, y la
prueba compara contra un dominio que ya no existe — sin avisar. Solo lanza si
**ninguna** migración empató.

**Mutante exacto** (creé una migración de sondeo y la borré):

```sql
-- supabase/migrations/0089_zz_probe.sql
alter table public.tenant drop constraint if exists tenant_regimen_fiscal_dominio;
alter table public.tenant
  add constraint tenant_regimen_fiscal_dominio
  check (regimen_fiscal is null or regimen_fiscal = any (array['601','624']));
```

```
 ✓ src/lib/saas/fiscal.test.ts (8 tests) 22ms
      Tests  8 passed (8)
```

La base ahora rechaza `603`, `612`, `621` y `626`; la pantalla los sigue
ofreciendo los cuatro; la prueba que existe para cazar exactamente eso está
verde. Un `drop constraint` sin `add` produce el mismo silencio.

**Escenario con valores.** La 0089 quita `626` (RESICO) del dominio porque el SAT
lo reclasificó. Un dueño en RESICO entra a Plan & Facturación, ve `626` en el
`<select>`, guarda, y `guardarDatosFiscales` recibe `23514 check constraint
violation`: la pantalla revienta al guardar. La prueba de sincronía sigue verde
todo el trimestre.

**Consecuencia:** es el mismo modo de falla que el arreglo cerró —el catálogo y
el CHECK divergidos con la prueba en verde—, con el disparador cambiado de «la
lista está escrita a mano» a «la próxima migración se escribe distinto». Y es
peor de detectar, porque ahora el archivo *dice* que lee la fuente viva.

**Refutación que intenté y falló.** ¿La regex es lo bastante ancha? Exige
literalmente `check ( <col> is null or <col> in ( … ) ) ;`. No tolera
`= any (array[…])`, ni el orden invertido (`… in (…) or … is null`), ni un
`not valid`, ni que el constraint se mueva a un `create table`. Las tres
migraciones del repo que tocan dominios de `tenant` usan la forma que sí empata,
así que hoy funciona: mide bien y avisa mal.

**Causa raíz probable:** el bucle trata «no empaté» como «esta migración no habla
del constraint», y esos dos casos no son el mismo — el nombre del constraint
aparece en las dos y podría distinguirlos.

---

### [MEDIO] La regla de «Ver como» duplicada del lado cliente en el sidebar no la mira nadie: la borré y las 3,134 siguen verdes

`src/app/dashboard/sidebar-nav.tsx:99` · `src/app/dashboard/sidebar_puerta.test.tsx:26-29`

La prueba nueva mockea `useSearchParams: () => new URLSearchParams('')` y
descarta el query string de cada href (`:44`, `.split('?')[0]`). Eso deja fuera
del arnés **todo** lo que el componente hace con los parámetros —líneas 69 a 99—,
que es donde viven cuatro arreglos documentados en el propio archivo.

**Mutante exacto** sobre el que más pesa:

```ts
-  const rolMenu = rol === 'superadmin' && rolVista ? rolVista : rol;
+  const rolMenu = rol; void rolVista;
```

```
 Test Files  261 passed (261)
      Tests  3134 passed | 1 skipped (3135)
```

**Escenario con valores.** Javier abre `/dashboard?vista=demo&rol=encargado` desde
`admin/selector-vista.tsx` para enseñarle al contralor *«así ve el panel su jefe de
tráfico»*. Con el mutante, `rolMenu` es `superadmin`, `visibles()` deja pasar
`/dashboard/suscripcion` y `/dashboard/combustible-casetas` (las dos son área
`dinero`), y el sidebar del "encargado" enseña Plan & Facturación y Combustible &
Casetas. La demostración de que el encargado no ve finanzas la desmiente la
propia pantalla.

**Refutación que intenté y falló.** ¿No lo cubre `tenant-efectivo.test.ts`? Cubre
`rolEfectivo` **del servidor**. El comentario de `sidebar-nav.tsx:95-99` dice,
textual, que esta es una **duplicación deliberada** de esa regla porque el
componente es cliente y no puede llamar a la del servidor. Una regla duplicada a
propósito necesita su propia prueba, y `grep -rln "sidebar-nav\|SidebarNav"` sobre
los tests devuelve un solo archivo, el que la mockea a vacío.

**Causa raíz probable:** el mock de `useSearchParams` se puso en cero para
simplificar el render, y el `.split('?')[0]` de `hrefsPintados` remató: la prueba
mide qué páginas se listan y a propósito no mide con qué parámetros — que es la
mitad del componente.

---

### [MEDIO] `regimen_fiscal` y `config.regimenElegible` son dos verdades sobre la misma flota, las escriben rutas distintas, y ninguna prueba exige que coincidan — el arreglo del pase 4 amplió el camino para separarlas

`src/lib/saas/fiscal.ts` (`guardarDatosFiscales`, escribe la columna) ·
`src/lib/likida/administracion.ts:129-140` y `src/lib/likida/repo.ts:921-935`
(escriben el `config`) · lectores del motor: `cuadre/desde_db.ts:56`,
`likida/fiscal.ts:220`, `tools.ts:116`

El propio `regimen_no_se_pierde.test.ts:30-36` reconoce la divergencia en prosa
—*«`regimen_fiscal` y `config.regimenElegible` quedan diciendo cosas distintas
sobre la misma flota sin que nada lo señale»*— y **no la afirma en ningún
`expect`**. Barrí los tres archivos de prueba del tema (`fiscal.test.ts`,
`regimen_facilidad_15.test.ts`, `regimen_no_se_pierde.test.ts`): ninguno compara
las dos fuentes.

**Escenario con valores.** Una flota se da de alta como `601` (Javier no sabía
todavía que es coordinado): `crearFlota` escribe `regimen_fiscal='601'` y
`config.facilidadCombustibleEfectivo.regimenElegible=false`. El contador lo
corrige y el dueño entra a Plan & Facturación y elige `624` —que **ahora sí está
en el catálogo**, gracias al arreglo `12cc8c6`—. `guardarDatosFiscales` escribe
`regimen_fiscal='624'` y **no toca `config`**. Resultado: la columna dice 624 y el
motor sigue leyendo `regimenElegible=false`, así que `engine.ts:358` emite
`efectivo_no_elegible` con `monto: g.monto` — el diésel pagado en efectivo se
declara **NO deducible** para un coordinado que sí tiene derecho a la facilidad
del 15% (RFA 2026 regla 2.9). En el otro sentido, `actualizarFacilidad15`
(`admin/flotas/page.tsx:141`) deja poner `regimenElegible = sí` a mano sobre una
flota cuyo `regimen_fiscal` es `601`, y entonces se deduce lo que no se deduce.

**Consecuencia:** una deducción real perdida (o una inventada) en el PDF que el
contralor cruza con su contador. Para mi rubro: el arreglo del pase 4 **abrió**
esta puerta —antes el dueño no podía elegir 624 desde esa forma— y el arnés que
llegó con él documenta el riesgo sin anclarlo.

**Por qué MEDIO y no ALTO:** el arreglo mejoró el balance neto (la dirección
peligrosa que cerró —601 en la columna con `elegible=true` en el config, o sea
deducir de más— es la más cara). Lo que queda abierto es la dirección
conservadora y el camino manual del admin.

**Causa raíz probable:** la elegibilidad se **deriva** del régimen en un solo
punto (`crearFlota`) y se **almacena**; nada re-deriva al cambiar la fuente, y
ninguna prueba cierra el círculo.

---

### [BAJO] El detector de `pruebas_en_ci.test.ts` solo mira `*.test.ts`: un `*.test.tsx` con `skipIf(CUADRA_COBERTURA)` se le escapa

`src/lib/likida/pruebas_en_ci.test.ts:43`

```ts
else if (e.name.endsWith('.test.ts') && /skipIf\([^)]*CUADRA_COBERTURA/.test(…))
```

`.endsWith('.test.ts')` es **false** para `.test.tsx`. Hay 6 archivos `.test.tsx`
en el repo y hoy ninguno usa `skipIf` (`grep -rln "skipIf" --include=*.test.tsx`
→ vacío), así que no hay hueco vivo. Pero la red existe justo para el caso en que
alguien añada uno: si mañana una prueba de componente con `renderToStaticMarkup`
se salta bajo cobertura —la instrumentación de v8 encarece un render igual que un
regex—, CI no la correría nunca y la red que se escribió para avisarlo no lo
diría. El propio encabezado del archivo llama a eso *«documentación con sintaxis
de prueba»*.

**Causa raíz probable:** el detector se escribió en la ronda 7, cuando no había
`.test.tsx` en el repo; los seis llegaron después.

---

## Hallazgos abiertos de pases anteriores: qué pasó con cada uno

Todos verificados contra la cobertura de hoy y el `git diff 8f70906..HEAD -- src/`
(8 archivos, ninguno de estos).

| Hallazgo | Estado | Evidencia de hoy |
|---|---|---|
| **[CRÍTICO] C6 — la cola de CFDI sin una sola prueba** | **REINCIDENTE, 5.º pase** | 0.0% / 47; último commit `ec012da`, 5-ago |
| **[ALTO] `opcionesDe` — el 15% derivado sin arnés** | **REINCIDENTE** | `likida/fiscal.ts` sigue en **75.4% / 471**, byte-idéntico; `grep opcionesDe` en tests → los mismos 2 falsos positivos. No re-muté: mismo criterio que C6 |
| **[ALTO] el trinquete de cobertura premia borrar** | **ABIERTO, pero este pase NO lo ejerció** | +62 cubiertos con +7 de denominador: la puerta se movió por la razón correcta esta vez. La holgura de 873 statements que dejó el borrado sigue ahí |
| **[ALTO] "DOS CORRIDAS SOLAPADAS" no prueba el claim** | **REINCIDENTE** | `recordatorio_comprobacion.ts` byte-idéntico; `grep "\.is("` en sus dos test files → cero |
| **[ALTO] cron `escalar` a 0%** | **REINCIDENTE** | 0.0% / 37 |
| **[ALTO] las descargas de dinero a 0%** | **REINCIDENTE (2 vivas)** | `export/liquidaciones` 0.0% / 42 · `export/pdf/[id]` 0.0% / 106 |
| **[ALTO] `analytics.ts` pierde el filtro de tenant sin que nada falle** | **REINCIDENTE** | 88.2% / 817, idéntico al pase 4 |
| **[ALTO] `rail.tsx` a 0%** | **REINCIDENTE** | 0.0% / 93 |
| **[ALTO] `/api/dashboard/asistente` — IDOR, 0%** | **REINCIDENTE** | 0.0% / 39 |
| **[ALTO] cron `purgar` BORRA filas a 0%** | **REINCIDENTE** | 0.0% / 33 |
| **[ALTO] `agente.ts:325` — el `ok` clavado en `true`** | **REINCIDENTE** | 28.8% / 146 |
| **[ALTO] el rollback del candado de Stripe sin aseverar** | **REINCIDENTE** | `webhook/route.ts` 62.1% / 116 |
| **[MEDIO] `dinero_por_area.test.ts` con una sola pila** | **REINCIDENTE** | archivo byte-idéntico; sigue en 2 pruebas, con la premisa "página + un hermano" que `/dashboard` ya rompió |
| **[MEDIO] `getLiquidaciones` rescatada sin arnés** | **REINCIDENTE** | `grep -rn "getLiquidaciones(" src/ \| grep -v PorDia` → solo su definición |
| **[MEDIO] las pantallas del Resumen a 0%** | **REINCIDENTE** | `panel-periodo` 84 · `gasto-semanal-chart` 63 · `motor-fiscal-periodo` 43 · `top-rutas` 41 · `inicio-operacion` 106, todas 0.0% |
| **[MEDIO] `comercial.ts` 0%** | **REINCIDENTE** | 0.0% / 200 |
| **[MEDIO] el ancla del PGRST201** | **REINCIDENTE** | sin violación viva |
| **[MEDIO] `verificaciones.sql` sin corredor** | **REINCIDENTE** | `ci.yml` sin un solo paso que ejecute SQL; el archivo ya trae su **bloque 63** para la 0088 (`:3052`) y nadie lo corre nunca |
| **[MEDIO] la regresión de layout de `contador/page.test.tsx`** | **REINCIDENTE** | `combustible-casetas/page.tsx:200` sin `items-start` |
| **[BAJO] 3 aserciones de permisos tautológicas** | **REINCIDENTE** | `visibilidad.test.ts:29,133`, `session.test.ts:67` sin cambios |
| **[BAJO] `fiscal_series.test.ts` afirma por índice de llamada** | **REINCIDENTE** | sin cambios |
| **[MEDIO] `actividad.test.ts` intermitente** | ✅ **SIGUE CERRADO** | verde en UTC, Asia/Tokyo y Etc/GMT+12 (spot-check de hoy) |

---

## Lo que revisé y está bien

- **Los tres arneses nuevos anclan de verdad.** Es la pregunta que traía y la
  respuesta es limpia: 4 de 5, 2 de 3 y 1 de 21 (el único que cubre el cableado),
  medidos revirtiendo cada arreglo a su commit padre. **Ninguno de los tres
  arreglos del pase 4 entró sin red.** Los conteos que afirmaron `8d6ac51` y
  `12cc8c6` en sus mensajes de commit son **exactos**.
- **`fiscal.test.ts` de verdad lee el CHECK vigente.** Verificado con mutante
  sobre la propia migración: quitarle `626` a la 0088 pone la prueba roja con la
  clave exacta. La lista escrita a mano desapareció y la sustituyó una lectura
  real de `supabase/migrations`. Es el mejor pedazo de trabajo de prueba del pase.
- **La dirección "subconjunto, no igualdad" está bien razonada y bien documentada**
  (`fiscal.test.ts:130-136`): `S01` en el CHECK y fuera de la pantalla es
  deliberado, y exigir igualdad obligaría a ofrecerlo. La prueba no se aflojó para
  pasar; se acotó a la dirección que rompe.
- **`sidebar-nav.tsx` pasó de 0.0% a 90.5%** de 63 statements, y la prueba tiene
  dientes en las dos direcciones que declara: quitarle el filtro
  (`visibles = (items) => items`) pone roja la aserción de "no ofrece de más".
  No es tautológica.
- **El motor de cuadre sigue anclado en el número que importa.** Mutante fresco:
  `const tope = 0.15 * total` → `0.20 * total` en `engine.ts:337` mata **2**
  pruebas de la matriz de la RFA 2.9, con el nombre del caso exacto. El 100% de
  `engine.ts` no es solo ejecución: al menos ahí se afirma sobre el valor.
- **Ninguna de las pruebas nuevas depende del reloj ni de la red.** Corrí los
  cuatro archivos en `UTC`, `Asia/Tokyo` y `Etc/GMT+12`: 37 verdes en las tres.
  La suite completa corrió 4 veces hoy en un entorno sin salida a internet.
- **`pruebas_en_ci.test.ts` sigue haciendo su trabajo** (salvo el `.tsx` del
  hallazgo BAJO): el paso `npx vitest run fundamento duplicados` sigue en
  `ci.yml:76` y el `npm run test:coverage` sigue en `:68`, con las aserciones que
  fallarían si alguien los quitara.
- **El CI no se tocó.** `git diff 927e78f..HEAD -- .github/` vacío: 6 pasos,
  `branches: ['**']` + `pull_request`, `concurrency` con `cancel-in-progress`.
  Corre en cada push, sin secretos, y en CI **sí** se corre `npm run build`
  (aquí no, por falta de credenciales — no es un hueco del CI).
- **`pruebas-manuales/` no cambió** y sigue fuera del include de vitest. No se
  corrió nada de ahí, por instrucción.

---

## Lo que NO alcancé a revisar

- **`engine.test.ts` (86 KB, ~600 casos).** Quinto pase sin barrerlo caso por caso.
  Este pase le hice **una** mutación dirigida (el tope del 15%) y la cazó, pero
  una mutación de 600 casos no es una auditoría del archivo. Sigue siendo la
  mitad que le falta al rubro.
- **`chrome.tsx`, `selector-vista.tsx`, `aviso-rol.tsx`** — 0.0% / 57, 63 y 44.
  Solo constaté el hallazgo 1 sobre el primero; no miré los otros dos, y
  `selector-vista.tsx` es literalmente la puerta del demo.
- **`repo.ts` al 56.7% de 557.** Siguen ~26 funciones exportadas sin revisar.
  `actualizarFacilidad15` (`:921`) es de dinero y entró a mi radar este pase por
  el hallazgo 6, pero no la audité.
- **`src/lib/saas/suscripcion.ts` (35.5% / 231)** y **`stripe.ts` (22.3% / 175)**
  — la cobranza de Likida a sus propias flotas, sin auditar en cinco pases.
- **`intake/consolidado.ts` (58.2% / 208)** y **`meta/client.ts` (65.6% / 273)**:
  nunca los he mirado.
- **Cobertura de RAMAS por archivo.** Quinto pase sin saber qué sostiene el
  84.64%, que sigue siendo el umbral con menos aire y este pase perdió 0.02 pt.
- **`supabase/verificaciones.sql`.** Confirmé que nadie lo corre y que su bloque
  63 (mig. 0088) existe; no leí los 63 bloques buscando aserciones flojas.
- **`al_vuelo.test.ts` (46 KB)** y el 24.6% sin ejecutar de `likida/fiscal.ts`.

---

## Árbol limpio

`git status --short` al terminar mis experimentos, **antes** de escribir este
archivo:

```
 M docs/auditoria-17/arquitectura.md
 M docs/auditoria-17/backend.md
 M docs/auditoria-17/fiscal.md
 M docs/auditoria-17/frontend.md
 M docs/auditoria-17/pruebas.md          ← el mío
 M docs/auditoria-17/seguridad.md
?? src/lib/saas/onconflict_indice_total.test.ts
?? supabase/migrations/0089_factura_saas_stripe_unica_total.sql
```

```
$ git diff --stat -- src/ supabase/ .github/
(vacío)
```

**Solo `pruebas.md` es mío.** Los otros cinco `.md` y los dos archivos sin
trackear son trabajo sin commitear de los demás auditores del pase 5 corriendo en
paralelo (aparecieron entre mi penúltima y mi última verificación); no los toqué.
De todo lo trackeado en `src/`, `supabase/` y `.github/`: **cero modificaciones**.

Mi único archivo temporal fue la migración de sondeo del hallazgo 4,
`supabase/migrations/0089_zz_probe.sql`, borrada en el mismo comando que la creó
—`ls` lo confirma: *No such file or directory*—. **No la confundan con
`0089_factura_saas_stripe_unica_total.sql`, que no es mía.** No hice ningún
commit.

Las **once** mutaciones de este pase se revirtieron con `git checkout -- <archivo>`
(o `rm`, en el caso del archivo de sondeo) inmediatamente después de cada corrida,
una a la vez, con `git status` verificado entre una y otra:

| # | Archivo | Mutante | ¿Murió? |
|---|---|---|---|
| 1 | `dashboard/sidebar-nav.tsx` | revertido entero a `8d6ac51^` | ✅ **4 de 5** *(confirma la afirmación del commit)* |
| 2 | `lib/saas/fiscal.ts` | revertido entero a `12cc8c6^` | ✅ **2 de 3** *(confirma la afirmación del commit)* |
| 3 | `dashboard/[id]/page.tsx` + borrar `id.ts` | revertido entero a `58c44f9^` | ✅ el archivo de prueba no carga (21 casos no corren) |
| 4 | `dashboard/[id]/page.tsx` | revertido solo el cableado, `id.ts` en su sitio | ✅ **1 de 21** — el caso de cableado |
| 5 | `dashboard/[id]/page.tsx:62` | `if (false && !esIdDeLiquidacion(id))` | ❌ **SOBREVIVIÓ** — 21/21 verdes (hallazgo 3) |
| 6 | `dashboard/[id]/page.tsx:56,62` | renombrar `id` → `segmento` (equivalente) | ⚠️ **FALSO POSITIVO** — 1 fallo con mensaje falso (hallazgo 3) |
| 7 | `dashboard/sidebar-nav.tsx:105` | `visibles = (items) => items` | ✅ **1 fallo**, el de "ofrece de más" |
| 8 | `dashboard/sidebar-nav.tsx:99` | `rolMenu = rol` (mata "Ver como") | ❌ **SOBREVIVIÓ** — 3,134 verdes (hallazgo 5) |
| 9 | `dashboard/chrome.tsx:66` | `{false && <SidebarNav …/>}` | ❌ **SOBREVIVIÓ** — 3,134 verdes (hallazgo 1) |
| 10 | `supabase/migrations/0089_zz_probe.sql` *(creado y borrado)* | CHECK redefinido con `= any (array[…])` | ❌ **SOBREVIVIÓ** — 8/8 verdes (hallazgo 4) |
| 11 | `supabase/migrations/0088_…sql` | quitar `'626'` del CHECK | ✅ **1 fallo** con la clave exacta *(control: sí lee el CHECK vigente)* |
| 12 | `lib/likida/cuadre/engine.ts:337` | `0.15 * total` → `0.20 * total` | ✅ **2 fallos** en la matriz de la RFA 2.9 |

**5 controles murieron a la primera y con el mensaje exacto**, así que el método
distingue. **Tres sobrevivieron**, y los tres son el mismo patrón: el arnés está
pegado al archivo que se arregló, no al camino por el que la pantalla falla.
