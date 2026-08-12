# Auditoría 17 — síntesis · pase 5 · 12-ago-2026

**Ronda de CONTINUACIÓN.** El PR **#9** seguía abierto sobre `claude/auditoria-17`,
así que esta corrida continuó sobre él en vez de abrir uno nuevo. Árbol limpio al
arrancar (`927e78f`, punta de la rama) → autofix habilitado. Corrida **en la nube**:
compuerta sin `npm run build`.

> Las síntesis de los pases 1, 2, 3 y 4 siguen íntegras más abajo.

## Nota global: 4.8/10 (igual que el pase 4) — **= 0.0**

Y el empate es una mentira estadística, no una meseta. **Cinco de los seis rubros
auditados se movieron**, tres para abajo y dos para arriba, y se cancelaron:

```
frontend +2 · pruebas +1        =  +3
backend −1 · seguridad −1 · fiscal −1  =  −3
```

Suma 57 / 12 = 4.75 → **4.8**, el mismo número que ayer sobre un repo que por
dentro se movió seis puntos-rubro. Es la tercera vez en esta ronda que la global
esconde el movimiento (p3 también cerró en 0.0 con ±1). **La tabla manda sobre
el número, y a estas alturas la global es el peor resumen de la ronda.**

## Lo que este pase existía para contestar

`master` no avanzó ni un commit desde el pase 4 (`origin/master` = `003c88a`, y
es ancestro de esta rama). Lo único que cambió de código fueron **los tres
arreglos del propio pase 4**, que entraron *después* de que sus auditores
escribieran el archivo. El pase 4 dejó esa deuda escrita, literal:

> *"Frontend se queda en 3 aunque su CRÍTICO ya esté arreglado en este PR. El
> arreglo entró después de que su auditor escribiera el archivo, y quien lo
> arregló fui yo. Subirle la nota por mi propio commit es exactamente la nota
> inflada que esta serie existe para desinflar: lo verifica el pase 5, con ojos
> que no lo escribieron."*

Se verificó. **Los tres arreglos cierran de verdad**, y los tres auditores lo
midieron en vez de leerlo —revirtiendo el commit en el árbol y contando fallos—:

| Arreglo del pase 4 | Veredicto independiente | Medido |
|---|---|---|
| `8d6ac51` · sidebar sin puertas | **cierra** | 8 `href` para `flota_admin`, 2 para `contador`, 3 para `encargado`; ninguno cuelga de página borrada. Revertido: 4 de 5 casos rojos |
| `12cc8c6` · régimen `624` | **cierra el valor, no el modo de falla** | Revertido: 2 de 3 rojos. Pero quedó un segundo catálogo divergido (ver abajo) |
| `58c44f9` · uuid → 404 | **cierra, y su prueba no** | Revertido: rojo. Pero **invirtiendo la guarda** los 21 casos siguen verdes |

Frontend sube dos puntos por eso, y es la subida mejor ganada de la serie: la
verificó quien no escribió el arreglo, contando `href` en el HTML renderizado.

## La tabla

| Rubro | p4 | p5 | | Razón del movimiento |
|---|:--:|:--:|---|---|
| Frontend | 3 | **5** | ▲▲ | **se atacó y subió**: el CRÍTICO de navegación cerrado y verificado por ojos que no lo escribieron —8/2/3 `href` contados en el HTML, y 4 de 5 casos rojos al revertir—. Sin CRÍTICOS abiertos por primera vez desde el borrado |
| Backend y API | 5 | **4** | ▼ | **mirada más profunda**: no es regresión —`58c44f9` está bien hecho—. Baja porque apareció, y se verificó contra un **Postgres 16 real**, un camino donde el dinero **no se escribe nunca** y nadie se entera |
| Agéntico | 4 | **4** | = | *no auditado este pase* — cero archivos de `src/lib/agents/` cambiaron |
| Tool calling | 7 | **7** | = | *no auditado* — cuarto pase por rotación, cero cambios en `tools.ts`/`llm/`/`agents/` |
| Seguridad | 6 | **5** | ▼ | **mirada más profunda** + **deuda que cobró factura**: los 3 ALTO de RLS llegan a su **quinto** pase, y el arreglo que le tocaba firmar resultó ser higiene de ruteo y no una capa — el filtro de tenant sigue siendo la única capa real, y la misma forma quedó sin tapar en `api/export/pdf/[id]/route.ts:81` |
| Fiscal | 5 | **4** | ▼ | **deuda que cobró factura**: `12cc8c6` cerró **un valor y no el modo de falla** — el segundo catálogo de regímenes ofrecía 8 claves que el CHECK rechaza y escondía 3 que acepta |
| Legal | 3 | **3** | = | *no auditado este pase* |
| Arquitectura | 4 | **4** | = | **mirada más profunda**: el arreglo cerró la instancia y **no la clase** (su oráculo es otro spread a mano en el mismo archivo), y el recuento medido salió peor que el heredado: **43** símbolos sin llamador, no 29 |
| Pruebas | 5 | **6** | ▲ | **se atacó y subió**: los tres arneses del pase 4 anclan de verdad, medido revirtiendo cada arreglo; `sidebar-nav.tsx` pasó de **0.0% a 90.5%** |
| Operabilidad y DX | 5 | **5** | = | *no auditado este pase* |
| Rendimiento y costo | 4 | **4** | = | *no auditado este pase* — sus 11 abiertos viven en `dashboard/page.tsx:90-122` y `analytics.ts`, con `git diff` vacío |
| Modelo de datos | 6 | **6** | = | *no auditado este pase* |

**Suma 57 / 12 = 4.75 → 4.8.**

Ninguna nota subió por un commit de esta corrida: los tres arreglos de hoy
entraron *después* de que los auditores entregaran, igual que ayer. Los verifica
el pase 6.

## El hallazgo de la ronda: el upsert de Stripe no podía escribir NUNCA

Lo encontró backend, y es el tipo de defecto que esta rutina existe para cazar:
**cero síntomas en el código, cero pruebas rojas, y el dinero no se escribe.**

`aplicarFactura()` (`src/lib/saas/suscripcion.ts:413-429`) hace
`.upsert(..., { onConflict: 'stripe_invoice_id' })`. PostgREST traduce eso a
`ON CONFLICT (stripe_invoice_id) DO UPDATE`, **sin predicado** — no tiene forma
de emitir uno. Y el único índice sobre esa columna era **parcial**
(`0052:105-106`, `where stripe_invoice_id is not null`). Postgres solo infiere un
índice parcial si la sentencia repite su `WHERE`.

Verificado dos veces, por el auditor y otra vez por mí, contra un Postgres 16.13
efímero con el esquema real:

```
ERROR:  there is no unique or exclusion constraint matching the
        ON CONFLICT specification                          (SQLSTATE 42P10)
```

**Falla siempre, también con la tabla vacía.** No era una carrera: la escritura
nunca ocurría. Cada `invoice.paid` daba 500, Stripe agotaba sus reintentos, y la
flota quedaba **pagada, sin fila en `factura_saas` y sin CFDI que timbrarle**.
Las dos suites de Stripe no lo veían porque mockean `aplicarFactura` entera.

Arreglado (`0b4cadd`): la `0089` cambia el índice a total —el predicado no
compraba nada, `NULLS DISTINCT` es el default de Postgres— y el **bloque 64** de
`verificaciones.sql` corre la sentencia exacta de PostgREST. Probado en los dos
sentidos: con el índice parcial revienta con 42P10; con la 0089 reporta
`primer-insert=1 tras-reintento=1 monto=2320 sin-stripe-id=2`.

## Los otros dos arreglos — tope de 3 vueltas agotado

**ALTO · [fiscal] El alta de flota ofrecía 8 regímenes que la base rechaza** — `93af2fd`
El `<select>` de `/admin/flotas:218` tenía su catálogo escrito a mano: once
claves. El CHECK vigente (`0088`) acepta seis, y no son las mismas seis.
Ofrecidas y rechazadas: `605, 606, 607, 608, 610, 611, 615, 616`. Aceptadas y no
ofrecidas: `603, 621, 626`. Elegir «605 — Sueldos y Salarios» tira el alta con
`23514` en la cara de quien la hace; y una flota **RESICO (626)** —media flota
chica en México— no se podía capturar, se quedaba en "Sin declarar" y ese hueco
viaja al `tax_system` del CFDI. El pase 4 arregló este mismo modo de falla en el
*otro* catálogo añadiéndole el `624`: arregló un valor y dejó dos listas a mano
para la misma columna. Ahora la página deriva de `REGIMENES`, que la prueba
amarra contra el CHECK **en las dos direcciones**.

**ALTO · [backend] La prueba de la guarda de uuid sobrevivía a invertirla** — `9ea0824`
`id_no_uuid.test.ts` fija *dónde* se llama la guarda, no *en qué sentido decide*.
Cambiando `page.tsx:62` de `if (!esIdDeLiquidacion(id))` a
`if (esIdDeLiquidacion(id))`, los 21 casos **siguen verdes** y toda liquidación
real contesta 404 — la pantalla que el demo abre para el renglón por renglón y
el botón de PDF, con la suite entera en verde. Los dos casos nuevos no leen el
código: **ejecutan la página** y afirman si la consulta ocurrió. Medido: con la
guarda invertida el archivo pasa de 23 verdes a 2 fallos. No se tocó `page.tsx`
— el arreglo del pase 4 estaba bien; lo que faltaba era la red que lo sostiene.

## Un auditor corrigió a otro, y también a su predecesor

Vale tanto como un hallazgo, porque es lo que impide que la serie se contamine:

- **Fiscal abrió eslabón por eslabón la cadena que el pase 4 escribió, y encontró
  que el propio commit del pase 4 la encadenó mal.** La corrección del pase 4 era
  correcta (`guardarDatosFiscales` nunca toca `config`), pero su mensaje afirma
  `registro.ts:133 → facturapi.ts:183`, y son **dos ramas distintas**: la de
  `registro.ts` termina en el portal de CAPUFE, o sea en el CFDI de peaje **del
  cliente**, no en la suscripción de Likida. Se anota en vez de corregirlo en
  silencio.
- **Arquitectura recontó lo que había heredado y salió peor:** **43** símbolos
  exportados sin llamador (no 29), **4** módulos sin importador (no 2), y un
  **cuarto** mapa duplicado (`FASE_LABEL` ×4, ya divergido). La cifra heredada
  estaba baja, no alta.
- **Pruebas midió en vez de creer**, y confirmó los tres conteos del pase 4
  (4/5, 2/3) salvo uno: `id_no_uuid` es **ancla parcial**, no total. Ese matiz
  se volvió el arreglo `9ea0824`.

## Los CRÍTICOS pendientes — con la razón, sin cuarta opción

- **C12 · [arquitectura] La pantalla de detalle de liquidación no tiene un solo
  link entrante** — `/dashboard/[id]`, 409 líneas: el renglón por renglón y el
  botón de PDF. *Verificado:* el único `Link` con id dinámico del panel son
  autorreferencias de la propia página; `dashboard/page.tsx:142` documenta que la
  lista "se fue a `/dashboard/cuadre`", y `/dashboard/cuadre` es una de las 35
  páginas que `2be4b1c` borró. El arreglo del sidebar le puso puertas a las seis
  pantallas de administración y no a ésta. *Razón por la que no se arregló:*
  ponerle puerta exige **rehacer la lista de liquidaciones**, que es exactamente
  el trabajo que el dueño difirió a propósito al borrar esas páginas "para
  rehacerlas desde cero". Decisión de producto, no de código — y un arreglo mío
  aquí sería inventar la pantalla que él quiere rediseñar.
- **C6 · [pruebas] El callback de QStash emite CFDI sin una sola prueba** —
  REINCIDENTE, **quinto pase**. `api/cron/facturar/cola/route.ts:40,66`, 0.0% de
  47 statements, último commit `ec012da` del 5-ago. *Razón:* el arreglo es el
  arnés de un endpoint que factura de verdad; sesión propia. El auditor volvió a
  no gastar la ronda ahí, y es la decisión correcta.
- **C4 · [fiscal] El 15% se mide contra "el combustible que Likida vio"** —
  `engine.ts:337,354`, ficha `rfa-2026-2.9.yaml`. Confirmado idéntico con `git
  diff` vacío. *Razón:* el denominador correcto exige un dato que el producto no
  tiene. Decisión de producto.
- **C7 · [rendimiento] El cierre no cabe en su propia reserva** — rubro *no
  auditado este pase*; conserva su estado del pase 4.
- **C10 y C5 · [legal]** — rubro *no auditado este pase*; conservan su estado.

## Lo que queda arriba de la pila para el pase 6

Ninguno se arregló: el tope de 3 vueltas se agotó con los de arriba.

- **[fiscal] Un CFDI de diésel PPD sale impreso "Deducible para ISR".** El motor
  lee `formaPago !== '01'` como "medio de pago que la ley acepta", y `MetodoPago`
  no se parsea en ningún punto del repo. `FormaPago 99` es obligatorio para toda
  flota con línea de crédito. Va en dirección **sobre-afirmante**, que es la peor.
- **[seguridad] `api/export/pdf/[id]/route.ts:81`** tiene la misma forma que
  `58c44f9` arregló en la página: segmento crudo a columna `uuid` → 500, no 404.
- **[frontend] Las tres tarjetas de KPI del Resumen** pintan blanco sobre el
  degradado naranja a **2.1–2.6:1**; la prueba de contraste solo mide tokens
  contra `--surface`, nunca tinta sobre color de componente.
- **[arquitectura] `engine.ts:14` importa `intake/cfdi.ts`**, que arrastra
  `sharp`, `node:fs/promises` y `zxing-wasm`: el motor de dinero **no es puro**
  pese a que `engine.ts:19` lo afirma.

## Compuerta

```
npx tsc --noEmit -p .   → 0 errores
npx vitest run          → 263 archivos · 3,145 verdes · 1 saltada
npm run lint            → 0 errores · 17 warnings
```

Línea base al arrancar: **261 archivos · 3,134 verdes · 1 saltada** (idéntica al
cierre del pase 4). Los tres arreglos sumaron 11 pruebas y 2 archivos.
Sin `npm run build` y sin `pruebas-manuales/*`: en la nube no hay
Supabase/OpenRouter/Facturapi/Upstash, y esas pruebas hacen llamadas de pago.

**Ningún arreglo revertido.** Un tropiezo intermedio, anotado porque el guardarraíl
funcionó: la `0089` puso roja `migraciones_verificadas.test.ts`, que exige que
toda migración nueva tenga bloque en `verificaciones.sql` o exención escrita. Se
escribió el bloque 64. Y el bloque no cuadró a la primera: el test lee **solo la
línea del título**, y `(mig. 0089)` había quedado en la segunda.

---

# Auditoría 17 — síntesis · pase 4 · 11-ago-2026

**Ronda de CONTINUACIÓN.** El PR **#9** seguía abierto sobre `claude/auditoria-17`,
así que esta corrida continuó sobre él en vez de abrir uno nuevo. Árbol limpio al
arrancar (HEAD detached en `003c88a`) → autofix habilitado.

> Las síntesis de los pases 1, 2 y 3 siguen íntegras más abajo.

## Nota global: 4.8/10 (antes 4.9) — **▼ 0.1**

Y el −0.1 miente por lo bajo. Debajo de ese décimo hay **frontend cayendo dos
puntos** y backend subiendo uno: la global se movió menos que cualquiera de los
rubros que la componen, otra vez. La tabla manda sobre el número.

**Lo que pasó en este pase, en una línea: `master` borró 6,000 líneas del panel
del cliente y el panel se quedó sin puertas.**

`2be4b1c` y `003c88a` borraron **35 páginas** —el panel del Contador entero y las
17 de "dueño de flota"— para rehacerlas desde cero. La decisión es del dueño y no
se audita. Lo que sí se audita es el estado en que quedó el árbol, y quedó así:

1. **El sidebar dejó de tener items.** `sidebar-nav.tsx` importaba exactamente
   las dos listas que el borrado vació, y las otras dos —vivas, con siete páginas
   que funcionan— nunca llegaban al render. El dueño se quedaba con **un** link y
   el contador con **ninguno**. Arreglado (`8d6ac51`).
2. **18 URLs viejas empezaron a contestar con la pantalla de error**, no con un
   404, porque el segmento crudo llegaba a una columna `uuid`. Arreglado
   (`58c44f9`).
3. **Se cerraron pantallas, no bugs.** De los hallazgos abiertos, los que murieron
   con su página fueron pocos y ninguno del motor: fiscal cerró 4 de 16 por
   supresión y los 12 restantes siguen en `engine.ts`, `repo.ts`, `fiscal.ts`;
   arquitectura cerró **cero** de 5, porque los cinco viven en el Resumen, que es
   justo la página que sobrevivió.

## La tabla

| Rubro | p3 | p4 | | Razón del movimiento |
|---|:--:|:--:|---|---|
| Frontend | 5 | **3** | ▼▼ | **deuda que cobró factura**: el borrado dejó el panel sin navegación —1 CRÍTICO nuevo— y de los hallazgos abiertos solo 3 murieron con su página; 13 siguen vivos, uno en su 6ª ronda |
| Backend y API | 4 | **5** | ▲ | **se atacó y subió**: el lease del mutex (`3404616`) y el recorte a 1,000 filas (`ea23059`) cierran de verdad, verificados por quien no los escribió. Cero CRÍTICOS abiertos |
| Agéntico | 4 | **4** | = | *no auditado este pase* — cero archivos de `src/lib/agents/` cambiaron |
| Tool calling | 7 | **7** | = | *no auditado* — cero cambios en `tools.ts`/`llm/`/`agents/` desde `94c0733` (3 pases por rotación) |
| Seguridad | 6 | **6** | = | **se atacó y subió** (la reescritura de `visibilidad.ts` es estrictamente restrictiva, verificada línea por línea) compensado por **deuda que cobró factura**: los 3 ALTO de RLS siguen los tres |
| Fiscal | 5 | **5** | = | **se atacó y subió** (4 hallazgos cerrados por supresión) compensado por **deuda que cobró factura**: 4 nuevos, dos de ellos en `src/lib/saas/`, territorio que dos pases declararon *no revisado* |
| Legal | 3 | **3** | = | *no auditado este pase* |
| Arquitectura | 5 | **4** | ▼ | **deuda que cobró factura**: 4 de sus 5 hallazgos siguen palabra por palabra, y el borrado dejó 29 símbolos sin llamador, 2 módulos sin importador y un **tercer** mapa concepto→etiqueta ya divergido — el ejemplo canónico del rubro, reproducido |
| Pruebas | 5 | **5** | = | **se atacó y subió** (ninguna de las 89 pruebas perdidas anclaba dinero; la única intermitente del repo quedó arreglada) compensado por **deuda que cobró factura**: C6 llega a su **cuarto** pase idéntico |
| Operabilidad y DX | 5 | **5** | = | *no auditado este pase* |
| Rendimiento y costo | 4 | **4** | = | **deuda que cobró factura**: ninguno de los 11 abiertos se cerró, y el reconteo tumbó la premisa de que el borrado los aliviaba |
| Modelo de datos | 6 | **6** | = | *no auditado este pase* |

**Suma 57 / 12 = 4.75 → 4.8.**

Dos apuntes sobre cómo se escribieron estas notas, porque el proceso importa
tanto como el número:

- **Frontend se queda en 3 aunque su CRÍTICO ya esté arreglado en este PR.** El
  arreglo entró después de que su auditor escribiera el archivo, y quien lo
  arregló fui yo. Subirle la nota por mi propio commit es exactamente la nota
  inflada que esta serie existe para desinflar: lo verifica el pase 5, con ojos
  que no lo escribieron. Es la misma regla que le dio a backend su +1 hoy.
- **La razón de arquitectura venía escrita como "se ignoró y bajó"**, que no es
  ninguna de las tres formas admitidas. Se normalizó a **deuda que cobró
  factura**, que es lo que su propio texto describe. Se deja anotado en vez de
  corregirlo en silencio.

## El reconteo que tumbó mi propia premisa

Vale más que un hallazgo. Al despachar al auditor de rendimiento le escribí que
su ALTO de "214 consultas por carga de `/dashboard`" había que recontarlo porque
*"el 60% de ese trabajo era para vistas que ya no existen"*. Volvió con el
número medido: **siguen siendo 214 en el SSR, y 244 por carga de navegador** —los
30 extra son el rail del layout, que repite `getKpis` y un segundo barrido
completo de `gasto`. Las 214 nunca vivieron en las páginas borradas: viven en
`dashboard/page.tsx:90-122`, que sobrevivió intacto (su diff completo son 41
líneas y ninguna toca ese `Promise.all`).

Un orquestador que le pasa su hipótesis a un auditor le pasa también su sesgo. La
línea que la corrigió fue *"recuéntalo con el código de hoy"*, no *"confirma que
bajó"*.

## Los tres arreglos de este pase — tope de 3 vueltas agotado

**CRÍTICO · [frontend + arquitectura] El panel del cliente se quedó sin puertas** — `8d6ac51`
`sidebar-nav.tsx:6` importaba **solo** `SIDEBAR_PRINCIPAL` y `FISCAL`, y `2be4b1c`
vació las dos. `NEGOCIO` y `GESTION` —que `rutas.ts:26-28` declara explícitamente
como *"no se tocó, pedido de Javier"*— nunca llegaban al render. Medido, no
inferido: con `?rol=contador` el `<nav>` de `chrome.tsx:65` sale **vacío**
(`puedeVerRuta('contador','/dashboard')` es false, porque `/dashboard` es área
`operacion`), y esa es la vista que el demo abre desde `admin/selector-vista.tsx:54`.
Con `?rol=flota_admin` sale **un** item: "Resumen", la página en la que ya estás.
Siete páginas que funcionan quedaban alcanzables solo tecleando la URL, entre
ellas `/dashboard/arco` (plazo de 20 días hábiles del art. 32 LFPDPPP, cuatro
rondas sin link) y `combustible-casetas`, donde vive la cita de la LIF 20-A que es
el argumento de venta.
El guardarraíl que debía cazarlo (`visibilidad.test.ts:85-125`) sigue verde porque
arma su lista de las **seis** constantes de sección, no de las dos que el
componente lee: cubre la regla y no el cableado.
Prueba: `sidebar_puerta.test.tsx` (5 casos) — renderiza el componente REAL y
afirma sobre los `href` del HTML, en las dos direcciones (ninguna puerta falta,
ninguna sobra). Sin el arreglo fallan 4.

**ALTO · [fiscal] El catálogo de la flota no tenía `624`, y guardar reescribía el régimen** — `12cc8c6`
`saas/fiscal.ts` —el catálogo con el que el **dueño** captura su régimen en Plan &
Facturación— no traía `624`, mientras `admin/flotas/page.tsx:223` sí lo trae desde
el arreglo del CRÍTICO C3. Los dos escriben `tenant.regimen_fiscal`.
`forma.tsx:174-178` pinta el `<select>` con `defaultValue` y sin opción vacía, así
que un `624` guardado no empataba ninguna `<option>` y el navegador seleccionaba
la primera: el dueño entraba a corregir su código postal y salía en `601`.
Prueba: `regimen_no_se_pierde.test.ts` (3 casos) — sin el arreglo fallan 2.

**ALTO · [backend + seguridad] Un marcador viejo enseñaba la pantalla de error, no un 404** — `58c44f9`
Las 18 carpetas borradas empatan ahora con el segmento dinámico `[id]`. El
segmento llegaba crudo a `.eq('id','viajes')` sobre una columna `uuid`, Postgres
contesta `22P02`, y `exigir()` —que falla cerrado a propósito— lo convertía en
excepción. Es un modo de falla que el borrado **estrenó**: hasta ayer esas 18
rutas resolvían a su propia página, y cada URL pegada en un WhatsApp del demo
apunta ahí.
Prueba: `id_no_uuid.test.ts` (21 casos), que cubre la regla **y** el cableado — el
último caso lee el código fuente de la página y exige que la guarda esté antes de
la consulta, porque el bug no era la regla sino que nadie la llamaba.

## Un hallazgo verificado a la baja (y por qué se anota)

**El auditor fiscal declaró que el régimen reescrito "le apaga a un coordinado la
facilidad del 15%". Eso es falso, y el arreglo entró igual.**

La elegibilidad para la facilidad de la RFA 2.9 vive en
`tenant.config.facilidadCombustibleEfectivo` (`cuadre/desde_db.ts:56`,
`likida/fiscal.ts:220`, `tools.ts:116`), que solo escriben `crearFlota` y
`actualizarFacilidad15`. `guardarDatosFiscales` **nunca toca `config`**: el motor
de cuadre no se entera de que el régimen cambió. La cadena causal del auditor se
rompe en el último eslabón, y con ella su afirmación de que "reabre el CRÍTICO C3
por otra puerta". No lo reabre.

Lo que sí pasa, y por eso el hallazgo sobrevive como ALTO con la consecuencia
corregida: `regimen_fiscal` es la columna que viaja al receptor del CFDI que
Likida le emite a la flota (`flota_fiscal.ts:84` → `adaptadores/registro.ts:133` →
`facturapi.ts:183`, `tax_system`). Un coordinado recibe su factura timbrada con
el régimen equivocado, y de paso `regimen_fiscal` queda contradiciendo a
`config.regimenElegible` sobre la misma flota sin que nada lo señale.

Un hallazgo con el daño exagerado y el defecto real es más peligroso que uno
falso: el falso se descarta, este se arregla creyendo que cerró otra cosa.

## Los 4 CRÍTICOS pendientes — con la razón, sin cuarta opción

- **C6 · [pruebas] El callback de QStash emite CFDI sin una sola prueba** —
  REINCIDENTE, **cuarto pase**. `api/cron/facturar/cola/route.ts:40,66`, 0.0% de
  47 statements, byte-idéntico desde antes de la ronda 17. *Razón:* el arreglo es
  escribir el arnés de un endpoint que factura de verdad; sesión propia. El
  auditor no volvió a correr el mutante y lo dijo: ya se demostró verde en los
  pases 2 y 3 sobre el mismo archivo sin cambios, y gastó esa corrida en código
  nuevo. Es la decisión correcta.
- **C4 · [fiscal] El 15% se mide contra "el combustible que Likida vio"** —
  `engine.ts:337,354`, ficha `rfa-2026-2.9.yaml` (verificada). `git diff` de esos
  archivos contra el merge: vacío. *Razón:* el denominador correcto exige un dato
  que el producto no tiene. Decisión de producto.
- **C7 · [rendimiento] El cierre no cabe en la reserva que él mismo aparta** —
  13,700 ms nominales contra `MARGEN_CIERRE_MS` = 12,000, y ningún paso del cierre
  consulta el reloj. *Razón:* subir el margen le quita techo al agente, y eso
  tiene efecto en el demo.
- **C10 · [legal] Likida hace el PRIMER contacto por WhatsApp sin aviso** —
  rubro *no auditado este pase*; conserva su estado del pase 3. *Razón:* texto de
  aviso y canal de baja; producto y abogado.

**C5 (legal, la foto al modelo externo antes del aviso)** también sigue abierto y
tampoco se auditó este pase: su nota y su estado se conservan sin tocar.

**El CRÍTICO de navegación fue el quinto, y se cerró.**

## Lo que este pase dice del proceso

- **Un borrado grande cierra pantallas, no bugs.** El instinto era que quitar
  6,000 líneas bajaría la cuenta de hallazgos. Bajó poco y muy desigual: fiscal
  cerró 4 de 16, frontend 3, backend 1, arquitectura **cero**. Lo que se borró
  fueron las páginas; la lógica que las alimentaba sigue en `lib/likida/` sin
  tocar, y ahí es donde vivían los hallazgos.
- **Y estrena modos de falla propios.** Los dos ALTO que arreglé hoy no existían
  anteayer: los dos son consecuencia del borrado, no del código borrado. Un
  `git rm` limpio deja el árbol compilando y la navegación rota.
- **La suite rechazó un arreglo mío por la razón correcta.** El primer intento de
  la vuelta 3 ponía la guarda del uuid en la capa de datos; 15 pruebas de
  `analytics.test.ts` se pusieron rojas porque dejaba inalcanzable su caso de
  fail-closed. Se revirtió y se puso en la página. El bucle retuvo lo que mejora.
- **Una prueba que congela una lista congela la fecha en que dejó de ser cierta.**
  `saas/fiscal.test.ts` comparaba contra la lista de la migración `0056` escrita a
  mano; la `0088` la movió hace tres días y la prueba no se enteró. Ahora lee el
  CHECK vigente.

---

# Auditoría 17 — síntesis · pase 3 · 10-ago-2026

**Ronda de CONTINUACIÓN.** El PR **#9** seguía abierto sobre `claude/auditoria-17`,
así que esta corrida continuó sobre él en vez de abrir uno nuevo. Árbol limpio al
arrancar (HEAD detached en `53c9d49`) → autofix habilitado.

> Las síntesis de los pases 1 y 2 siguen íntegras más abajo.

## Nota global: 4.9/10 (igual que el pase 2) — **= 0.0**

Y el empate es el hallazgo, no la ausencia de uno. **Frontend subió 1 y backend
bajó 1, y se cancelaron.** Un promedio quieto puede esconder dos movimientos
grandes en direcciones opuestas; por eso la tabla manda sobre el número.

Lo que pasó de verdad en este pase es más interesante que el 4.9:

1. **Los arreglos del pase 2 sí sirvieron** — un auditor que no los escribió los
   abrió uno por uno y confirmó que cierran. Frontend cierra su primer pase en
   cuatro rondas **sin un solo CRÍTICO**.
2. **Y al mirar de cerca apareció lo que llevaba rondas invisible:** un CRÍTICO
   de concurrencia que ninguna ronda anterior había tocado, y dos formas en que
   los arreglos del pase 2 quedaron a medio camino.

**`master` avanzó un solo commit desde el pase 2** (`20ecbb1` → `53c9d49`) y toca
únicamente `normas/.latido-vigilancia`: **cero código**. Por eso se relanzaron
**3 de 12** rubros — los que cambiaron desde que se escribió su archivo— y los
otros nueve conservan su nota marcados *no auditado este pase*.

| Rubro | p2 | p3 | | Razón del movimiento |
|---|:--:|:--:|---|---|
| Frontend | 4 | **5** | ▲ | **se atacó y subió**: `d7b71a8` y `e47b124` cierran de verdad, verificados por quien no los escribió |
| Backend y API | 5 | **4** | ▼ | **mirada más profunda**: el lease del mutex (60s) era más corto que el turno que protege (72s documentados) y nadie lo había mirado nunca |
| Agéntico | 4 | **4** | = | *no auditado este pase* |
| Tool calling | 7 | **7** | = | *no auditado* — cero archivos del rubro cambiaron desde `94c0733` (2 pases por rotación) |
| Seguridad | 6 | **6** | = | *no auditado este pase* |
| Fiscal | 5 | **5** | = | *no auditado este pase* |
| Legal | 3 | **3** | = | *no auditado este pase* |
| Arquitectura | 5 | **5** | = | *no auditado este pase* |
| Pruebas | 5 | **5** | = | **se atacó y subió** (los 3 arreglos del PR mueren al revertirlos) compensado por **deuda que cobró factura** (C6 en su tercer pase idéntico) |
| Operabilidad | 5 | **5** | = | *no auditado este pase* |
| Rendimiento | 4 | **4** | = | *no auditado este pase* |
| Modelo de datos | 6 | **6** | = | *no auditado este pase* |

## Por qué la nota de backend BAJA en el pase donde su arreglo funcionó

Merece decirse claro porque parece una contradicción. `709e410` cerró su CRÍTICO
y el auditor lo confirmó: falla cerrado de verdad, no quema el sello, no deja
secuela en el cron. Aun así el rubro baja de 5 a 4, y la razón escrita es
**mirada más profunda**: el CRÍTICO del lease del mutex **no es nuevo en el
código** —lleva ahí desde que existe el mutex—, es nuevo en *lo que sabemos*.
Un rubro cuya nota sube porque arregló lo que él mismo rompió, mientras arrastra
un defecto de concurrencia que nadie había buscado, es exactamente la nota
inflada que esta serie existe para desinflar.

## Los arreglos de este pase (3) — tope de 3 vueltas agotado

**C11 · [backend] El lease del mutex era más corto que el turno que protege** — `3404616`
`conv.ts:419` pedía el candado con `p_ttl_ms = 60_000`. `presupuesto.ts:188-190`
documenta un peor caso de **~72s** para el turno que ese candado serializa
(lock ≤12s + intake 20s + cuadre ~40s), dentro de una invocación presupuestada a
120s, y `processor.ts:1751` nunca pasaba `ttlMs`. El fallo no es ruidoso: **el
lease vence solo**. A los 60s `try_lock_viaje` considera el viaje libre, un
segundo mensaje entra al ciclo completo mientras el primero sigue cuadrando, y
los dos cierran. Ninguno lanza —`guardar_liquidacion` no mira `viaje.estatus`,
el `on conflict do update` de la 0013 sobrescribe la fila, el `upsert: true`
sobrescribe el PDF—, así que los dos reportan éxito: el chofer se queda con un
PDF de $5,600 y la base con $7,000. La doble liquidación que la 0005 existe para
impedir, causada por el reloj del propio candado.
Prueba: `conv_lock_expira.test.ts` (5 casos) — sin el arreglo fallan 2
(`expected 60000 to be greater than or equal to 72000`). Fija la **invariante**,
no el número: si alguien sube el techo del agente sin subir el lease, se pone rojo.

**A · [frontend] «Ahorro generado» inventaba un cero** — `b9a191c` · ALTO AGRAVADO
`page.tsx:274` seguía con `resumenPerdidas?.montoRecuperable ?? 0`, dos celdas a
la derecha de la que `e47b124` arregló en el mismo grid. `resumenPerdidas` es
null exactamente cuando `cfgFiscal` o `gastosFiscales` vinieron nulos, y esos
salen de `safe()`, que se come el fallo de la consulta: el `?? 0` no cubría "la
flota no ahorró nada", cubría **"no se pudo leer"**. Con el motor fiscal caído el
panel del dueño pintaba `Ahorro generado — Ejercicio 2026   $0.00` en el KPI que
ES el diferenciador del producto, sin banda de aviso.
Prueba: `ahorro_sin_dato.test.ts` (3 casos), verificada en las dos direcciones.

**A · [backend] El arreglo del pase 2 se reabría solo en una flota grande** — `ea23059`
La consulta de comprobación que agregó `709e410` no llevaba `limit`, ni `range`,
ni `count`, ni pasaba por `traerTodo` — y su propio comentario afirmaba que "se
pide `limit` amplio". Sin acotar, PostgREST aplica `max_rows` (1,000) y **recorta
en silencio**. Con 100 viajes abiertos de 12 gastos son 1,200 filas: los gastos
de los últimos **16 viajes** quedaban fuera del `Set`, esos viajes se leían como
"sin un solo comprobante", y a sus choferes les salía por WhatsApp la acusación
falsa que el pase 2 acababa de cerrar — mientras el panel del contralor mostraba
sus doce recibos. Peor que el original, porque ahora había una consulta que
"comprueba" dando falsa confianza.
Prueba: `recordatorio_lote_truncado.test.ts` (4 casos) — sin el arreglo fallan 3
(`expected 1000 to be 1200`), con dos controles: que el escenario exceda el tope
de verdad, y que un viaje SIN gastos se siga señalando.

## Los 5 CRÍTICOS pendientes — con la razón

Ninguno es un arreglo de código pendiente por falta de ganas; **cuatro esperan
una decisión de producto** y el quinto es una sesión de trabajo propia.

- **C6 · [pruebas] El callback de QStash emite CFDI sin una sola prueba** —
  REINCIDENTE, **tercer pase idéntico**. Re-verificado en vivo hoy con mutante
  doble (verificación de firma desactivada **y** sin re-validar `cfdi_uuid`):
  **3,182 pruebas siguen verdes**, tsc y lint limpios. *Razón:* el arreglo es
  escribir el arnés de un endpoint que factura de verdad; sesión propia.
- **C4 · [fiscal] El 15% se mide contra "el combustible que Likida vio"** —
  *Razón:* el denominador correcto exige un dato que el producto no tiene.
- **C5 · [legal] La foto viaja al modelo externo antes del aviso** —
  *Razón:* mover el bloqueo cambia el flujo de huérfanos (mig. 0040).
- **C7 · [rendimiento] El cierre no cabe en la reserva que él mismo aparta** —
  REINCIDENTE AGRAVADO. Verificado hoy: `avisarCierreAlJefe` sigue **fuera** de
  `PASOS_CIERRE` y `MARGEN_CIERRE_MS` sigue en 12,000. *Razón:* subir el margen
  le quita techo al agente, y eso tiene efecto en el demo.
- **C10 · [legal] Likida hace el PRIMER contacto por WhatsApp sin aviso** —
  REINCIDENTE, 5 pases. *Razón:* texto de aviso y canal de baja; producto y abogado.

## Descartados

**Ninguno de este pase resultó falso.** Los tres hallazgos que se arreglaron se
abrieron uno por uno contra el código antes de anotarlos, y los tres son reales.
Lo que sí hubo fue una hipótesis que el propio auditor de pruebas cerró **a favor
del código**, y vale tanto como un hallazgo: `repo_escritura.test.ts:124` **sí
caza** el cambiazo comprobado↔anticipo y `p_ieps`←IVA en `saveLiquidacion`
(`1 failed | 3181 passed`). La *escritura* del dinero está anclada de verdad.
De 11 mutaciones intentadas, 7 sobrevivieron; las 11 se revirtieron una por una y
el árbol quedó limpio.

## Lo que este pase dice del proceso

- **Un arreglo verificado no es un arreglo completo.** Los dos arreglos de
  frontend del pase 2 cierran lo que dicen cerrar, y los dos dejaron trabajo a
  medias a dos celdas de distancia: el mismo commit que habilitó `number | null`
  no lo aplicó al llamador de su propia fila. Sale solo cuando el que revisa no
  es el que arregló.
- **Un arreglo puede reabrir el bug que cerró, a otra escala.** La consulta de
  comprobación era correcta para 8 viajes y falsa para 100. El comentario decía
  que estaba acotada y no lo estaba: la prosa de un commit no es evidencia.
- **El «arnés que aparenta» se reprodujo dentro de este mismo PR.** La prueba de
  `d7b71a8` cubre la regla (`rail-marca.ts`, 100%) y no el cableado
  (`rail.tsx`, 0%), que es donde vivía el bug: se puede devolver el CRÍTICO
  entero y la suite sigue verde. Queda como ALTO propuesto.
- **El árbol de trabajo es compartido.** Los auditores corren sobre el mismo
  checkout y el de pruebas hace mutaciones en vivo; durante esa ventana
  `git status` muestra archivos de producción modificados que no son de nadie
  que esté arreglando nada. La suite de la primera vuelta se corrió en un
  `git worktree` aparte por eso. **Nunca se commiteó un archivo mutado.**

## Compuerta (salida real, árbol final)

```
npx tsc --noEmit -p .   → 0 errores
npx vitest run          → 260 archivos, 3,194 pruebas verdes, 1 saltada
npm run lint            → 0 errores, 18 warnings (mismo número que las tres líneas base)
```

Línea base al arrancar el pase 3: **3,182** verdes (idéntica al cierre del pase 2,
sin deriva). Los tres arreglos sumaron **12** pruebas y ninguno se revirtió: los
tres pasan la suite completa y los tres fallan sin su cambio, verificado
corriendo la prueba **antes** del arreglo.

Sin `npm run build` y sin `pruebas-manuales/*`: no hay credenciales en la nube y
esas pruebas hacen llamadas de pago.

## Lo que NO se hizo, y hay que decirlo

- **Nueve rubros no se auditaron.** No es descuido: `master` no movió una línea
  de código desde el pase 2, y repetir un auditor sobre código idéntico no
  produce señal. Sus notas son del pase 2, no de hoy.
- **Tool calling lleva dos pases sin auditar** por rotación. Su 7/10 es el más
  alto de la tabla y el menos reciente: conviene relanzarlo en la ronda 18
  aunque su código no cambie, para que la nota no descanse indefinidamente.
- **Backend y frontend se recalificaron con los arreglos de HOY sin auditar.**
  Los tres commits de este pase (`3404616`, `b9a191c`, `ea23059`) entraron
  después de que sus auditores escribieran. Se remiden en la 18.
- **Los 4 ALTO nuevos del auditor de pruebas quedan propuestos**, no arreglados:
  el tope de 3 vueltas se agotó con el CRÍTICO y los dos ALTO de mayor daño.

---
---

# Auditoría 17 — síntesis · pase 2 · 9-ago-2026

**Ronda de CONTINUACIÓN.** El PR **#9** seguía abierto sobre
`claude/auditoria-17`, así que esta corrida continuó sobre él en vez de abrir
uno nuevo. Árbol limpio al arrancar → autofix habilitado. 11 auditores con
contexto fresco, en paralelo, sobre `origin/master` = `20ecbb1` mergeado a la
rama.

> La síntesis del pase 1 (8-ago) sigue íntegra más abajo. Esto es lo que cambió
> en un día.

## Nota global: 4.9/10 (antes 5.8 en el pase 1) — **baja 0.9**

**El código no se pudrió en 24 horas.** Bajó porque en ese día `master` avanzó
**12 commits** con superficie genuinamente nueva —el rework del dashboard del
dueño, el recordatorio automático por WhatsApp y el retiro del rol `operador`—
y esa superficie llegó **sin arnés y sin la letra chica** que el resto del
producto sí tiene. De los 93 hallazgos con ficha propia de este pase, la
mayoría de los ALTO nuevos viven en código escrito en los últimos dos días.

Dicho de otra forma: este pase no midió un producto que empeoró, midió
**funcionalidad nueva entrando más rápido de lo que se ancla**. Es exactamente
el patrón que la serie histórica existe para hacer visible.

| Rubro | p1 | p2 | | Razón del movimiento |
|---|:--:|:--:|---|---|
| Frontend | 6 | **4** | ▼ | deuda que cobró factura: los 5 reincidentes siguen textualmente iguales y los 5 componentes nuevos entraron con 0 pruebas de render |
| Backend y API | 6 | **5** | ▼ | deuda que cobró factura: el camino nuevo del recordatorio repitió la ceguera del anterior (afirmar sin comprobar, 200 con fallos dentro) |
| Agéntico | 5 | **4** | ▼ | deuda que cobró factura: un actor nuevo en el ciclo (el recordatorio) sin cierre definido hacia el humano |
| Tool calling | 7 | **7** | = | **no auditado este pase** — cero archivos del rubro cambiaron |
| Seguridad | 7 | **6** | ▼ | mirada más profunda: el contador "de solo lectura" puede ESCRIBIR 19 tablas por PostgREST, incluida la bitácora que lo delataría |
| Fiscal | 4 | **5** | ▲ | **se atacó y subió**: C3 cerrado (régimen 624 = Coordinados) y media superficie del ALTO del peaje |
| Legal | 4 | **3** | ▼ | deuda que cobró factura: primer contacto por WhatsApp sin aviso, y se borró el único código que implementaba el derecho de acceso |
| Arquitectura | 6 | **5** | ▼ | deuda que cobró factura: "periodo" definido cuatro veces y `hoy` calculado en UTC para ocho funciones que lo declaran en hora de México |
| Pruebas | 6 | **5** | ▼ | mirada más profunda: 6 de 8 mutantes no equivalentes sobrevivieron, y apareció la **primera prueba intermitente del repo** |
| Operabilidad | 6 | **5** | ▼ | deuda que cobró factura: el cron nuevo responde 200 con 40 fallos dentro y pierde la lista de cuáles |
| Rendimiento | 5 | **4** | ▼ | deuda que cobró factura: 214 consultas por carga de `/dashboard` y el cron a 510 s nominales contra un `maxDuration` de 120 |
| Modelo de datos | 7 | **6** | ▼ | deuda que cobró factura: tres bloques de `verificaciones.sql` abortan hoy y el test los sigue contando como comprobación |

**93 hallazgos con ficha propia: 7 CRÍTICO · 40 ALTO · 32 MEDIO · 14 BAJO**,
más los reincidentes que cada auditor lleva en su tabla de estado sin abrirles
ficha nueva.

**Fiscal es el único que sube, y sube por la única razón que vale:** hay commits
de la ronda anterior que cerraron un hallazgo suyo, verificados contra el código
por un auditor que no fue quien los escribió.

## Los 7 CRÍTICOS, uno por uno

Sin cuarta opción: commiteado con prueba, `pendiente` con razón, o `descartado`.

### Cerrados en este pase (2)

**C8 · [frontend] El panel del dueño se queda en blanco al volver del chat expandido** — `d7b71a8`
`globals.css:217` retira `.columna-centro` (`opacity: 0` + `pointer-events:
none`) mientras la raíz lleve `data-asistente="expandido"`. `rail.tsx` ponía esa
marca mirando **solo** `expandido` y la limpiaba en el `return` del efecto, que
corre al **desmontar**. En `/dashboard` el rail devuelve `null` —el Resumen va a
ancho completo— y renderizar `null` **no** desmonta: la limpieza nunca corría.
Dos clics del flujo normal del demo (expandir el chat en `/dashboard/cuadre`,
luego "Resumen" en el sidebar, que sigue clickeable bajo el chat) dejaban el
panel del dueño invisible y sin un solo control para revertirlo. A cualquier
resolución, delante del contralor.
Prueba: `rail_marca.test.ts` (4 casos, con control) — con la regla vieja fallan 2.

**C9 · [backend] El recordatorio afirmaba "sin mandarme comprobantes" sin haber mirado uno solo** — `709e410`
`viajesSinComprobar` seleccionaba por estatus + fecha + sello y nunca preguntaba
si el viaje traía gastos, pero el texto que sale afirma un hecho. El viaje del
seed del demo es exactamente ese caso: `VJ-2026-0001`, abierto, **dos gastos
precargados** ($4,200 de diésel entre ellos) y un operador cuyo teléfono es
`529993700779`, el número real del demo por WhatsApp. Tres días después de
sembrar, el cron le reclama al teléfono del demo mientras el panel de al lado
muestra los dos comprobantes. Con una flota real, el chofer que mandó doce
recibos y sigue en carretera recibe una reclamación falsa firmada por el
producto que su patrón acaba de comprar.
Prueba: 4 casos nuevos en `recordatorio_comprobacion.test.ts`, incluido el de
fallo cerrado — sin el arreglo fallan 3.

### Pendientes (5) — con la razón

**C4 · [fiscal] El 15% se mide contra "el combustible que Likida vio"** — REINCIDENTE
`engine.ts:337,354` · `repo.ts:831-834`. **Razón:** el denominador correcto
exige un dato que el producto no tiene (el combustible que NO pasó por Likida).
Es decisión de producto —declarar el supuesto en el PDF o capturar el total del
ejercicio—, no un arreglo de código. Se propone, no se inventa.

**C5 · [legal] La foto viaja al modelo externo antes del aviso** — REINCIDENTE
`processor.ts:470` · `:522-525` contra el bloqueo de `:636`. **Razón:** mover el
bloqueo antes del intake cambia el flujo de huérfanos (mig. 0040) y puede dejar
fotos sin recoger. Cambio de diseño del ciclo, no de una línea.

**C6 · [pruebas] El callback de QStash emite CFDI y no tiene una sola prueba** — REINCIDENTE
`api/cron/facturar/cola/route.ts:40`, 0% de cobertura. **Razón:** el arreglo es
escribir el arnés de un endpoint que factura de verdad; sesión propia, no una
vuelta de auditoría.

**C7 · [rendimiento] El cierre no cabe en la reserva que él mismo aparta** — REINCIDENTE, AGRAVADO
`presupuesto.ts`. El tramo creció 500 ms con el arreglo del pase 1 y la reserva
no se movió: **13,700 ms nominales contra `MARGEN_CIERRE_MS = 12,000`.**
**Razón:** subir el margen le quita techo al agente, y eso tiene efecto en el
demo. Decisión de producto.

**C10 · [legal] Likida hace el PRIMER contacto por WhatsApp sin aviso** — NUEVO
`operacion.ts:585` → `notificar.ts:170`, contra `normas/lfpdppp-15-16.yaml:59-61`.
Y por **plantilla**, que sí entrega fuera de la ventana de 24 h. **Razón:** el
arreglo es texto de aviso + un canal de baja, no código; requiere producto y
abogado. Mismo expediente que el ToS, reincidente desde hace cinco pases.

## Descartados

Ninguno de los 7 críticos. Los 3 nuevos se abrieron uno por uno contra el código
antes de anotarlos y los 3 son reales. Lo que sí hubo fueron **dos hipótesis que
los propios auditores refutaron** con el guardarraíl que ya existía, y eso vale
tanto como un hallazgo:

- *mis-routing por dos viajes abiertos del mismo operador* → lo cierra
  `uq_viaje_abierto_por_operador` (mig. 0029).
- *la mig. 0086 aflojó el aislamiento al quitar `and not is_operador()` de ~20
  policies* → **no**: `is_operador()` era `rol='operador'`, siempre falso para
  los cuatro roles que quedan, así que quitarlo es un no-op algebraico. Se leyó
  policy por policy antes de descartarlo.

## Un arreglo del pase 1 que dejó secuela

El auditor agéntico encontró que, tras cerrar C1 (el PDF del contralor), existe
un camino donde **el cierre es limpio, el PDF del contralor no se genera, al
jefe no le llega nada, y el log afirma que sí le llegó**. Queda como ALTO
abierto, y se anota aquí porque es la clase de hallazgo que solo aparece cuando
el auditor del pase siguiente no es quien hizo el arreglo.

## Compuerta (salida real, árbol final)

```
npx tsc --noEmit -p .   → 0 errores
npx vitest run          → 257 archivos, 3,182 pruebas verdes, 1 saltada
npm run lint            → 0 errores, 18 warnings (mismo número que la línea base)
```

Línea base al arrancar el pase 2: 3,168 verdes. Los tres arreglos sumaron 14
pruebas y ninguno se revirtió: los tres pasaron la suite completa y los tres
fallan sin su cambio, verificado corriendo la prueba **antes** del arreglo.

Sin `npm run build` y sin `pruebas-manuales/*`: no hay credenciales en la nube y
esas pruebas hacen llamadas de pago.

## Dos cosas que este pase dice del proceso

- **La referencia contra la que mides puede estar podrida.** El `origin/master`
  del clon apuntaba a una historia **sin ancestro común** con la línea viva
  (`git merge-base` devolvía vacío). Medido contra ella, el delta del día era
  "494 archivos, −50,315 líneas". Un `git fetch origin master` lo corrigió.
  Auditar ese diff habría producido una ronda entera de hallazgos sobre código
  que nadie borró.
- **Dos migraciones se llamaron `0086` al mismo tiempo**, una en master y otra en
  la rama de auditoría, y nada en el repo lo detecta: se aplican en orden
  indefinido. Se renumeró la de la auditoría a `0088`. Que la colisión solo se
  vea al mergear es, en sí, un hallazgo del modelo de datos.

## Lo que NO se hizo, y hay que decirlo

- **Frontend y backend se calificaron ANTES** de que entraran los tres arreglos
  de este pase. Sus notas (4 y 5) no reflejan esos cierres. La regla del modo
  desatendido permite relanzar **un** rubro reauditado por ronda; no se usó, para
  no gastar la ventana en subir un número en vez de encontrar algo. Se remide en
  la ronda 18.
- **Tool calling no se auditó.** Conserva 7/10 por rotación, no por revisión.
- Los **4 CRÍTICOS pendientes** de fiscal, legal, pruebas y rendimiento llevan
  entre uno y cinco pases abiertos, y **ninguno es un arreglo de código**: los
  cuatro esperan una decisión de producto. Ese es hoy el cuello de botella real
  de esta rutina, no la capacidad de encontrar bugs.

---
---

# Auditoría 17 — síntesis · 8-ago-2026

**Ronda COMPLETA.** 12 auditores con contexto fresco, en paralelo, sobre
`94c0733`. Árbol limpio al arrancar → autofix habilitado. Rama
`claude/auditoria-17`, sin tocar `master`.

## Nota global: 5.8/10 (antes 7.2 en la ronda 13) — **baja 1.4**

Y esa bajada es el resultado de la ronda, no un accidente. **El código no
empeoró en tres días.** Bajó porque:

1. **La ronda 16 declaró cerrado el ciclo de auditoría** ("el loop cierra aquí")
   y dos de sus afirmaciones no se sostuvieron al comprobarlas contra el código:
   - *"el barrido anual del 15% ya es un SUM en SQL (mig. 0084)"* — la migración
     existe, pero **nadie la llama**: `grep -rn sumar_combustible src/` solo
     encuentra la cadena dentro de un test. `getAcumuladoCombustible`
     (`repo.ts:803-836`) sigue paginando hasta 100 páginas en el camino caliente.
   - *"la válvula del 15% ya no se ofrece a cualquier tenant"* — cierto como
     compuerta, pero quedó conectada al **código de régimen equivocado**.
2. **La mirada fue más profunda en tres rubros** que llevaban rondas sin que
   nadie recorriera su ciclo completo (agéntico, legal, rendimiento).

Las rondas 14, 15 y 16 no regrabaron los 12 rubros —fueron de arreglo—, así que
el delta se mide contra la **13**, la última con tabla completa.

| Rubro | R13 | R17 | | Razón del movimiento |
|---|:--:|:--:|---|---|
| Frontend | 8 | **6** | ▼ | mirada más profunda + deuda que cobró factura: dos rótulos que mienten ("Vencen pronto ≤5 días" cuenta solo lo ya vencido; "Comprobación del periodo" no filtra por fecha) y el asistente <1280 px REINCIDENTE |
| Backend y API | 7 | **6** | ▼ | deuda que cobró factura: QStash entró al camino del dinero sin una sola prueba; el cron responde `corrio: true` cuando solo encoló |
| Agéntico | 8 | **5** | ▼ | mirada más profunda — la nota anterior estaba inflada: el ciclo nunca se había recorrido punto por punto. CRÍTICO del PDF del contralor + "Listo 👍" sin mutación |
| Tool calling | 7 | **7** | = | se atacó y subió (la regla `properties:{}` se respeta en todas las tools, verificado), compensado por 5 MEDIO acumulados |
| Seguridad | 8 | **7** | ▼ | mirada más profunda: sin camino sin autenticar a datos de un tenant, pero el callback público de QStash es frontera nueva y `operador_sube_su_pod` sigue |
| Fiscal | 6 | **4** | ▼ | deuda que cobró factura + mirada más profunda: **dos sitios donde el producto imprime una cifra fiscal equivocada**; 7 de 11 no-críticos son REINCIDENTES verificados |
| Legal | 7 | **4** | ▼ | deuda que cobró factura: ToS reincidente 4 rondas, ARCO con dos reglas de plazo, y la foto del operador viaja al modelo externo antes del aviso |
| Arquitectura | 7 | **6** | ▼ | deuda que cobró factura: la verdad duplicada volvió a ocurrir (bloque "Acreditable" reimplementa `filasAcreditables` y perdió tres advertencias legales) |
| Pruebas | 7 | **6** | ▼ | mirada más profunda: **10 experimentos de mutación, 6 sobrevivieron**. El motor de cuadre está anclado; el anillo que lo rodea, no |
| Operabilidad | 7 | **6** | ▼ | deuda que cobró factura: `seed.sh` sigue, y el sondeo de arranque soltaba un mutex ajeno |
| Rendimiento | 7.5 | **5** | ▼ | deuda que cobró factura: el ALTO del cron lleva 4 rondas, el 0084 nunca se llamó, y el cierre no cabe en su propia reserva |
| Modelo de datos | 7 | **7** | = | se atacó y subió (`operador_sube_su_pod` cerrado y verificado en `0081:15-19`), compensado por las 0082/0083/0085 que borran el `search_path` de `config_tenant_valida` |

**113 hallazgos: 7 CRÍTICO · 36 ALTO · 47 MEDIO · 23 BAJO.**

## Los 7 CRÍTICOS, uno por uno

Sin cuarta opción: commiteado con prueba, `pendiente` con razón, o `descartado`.

### Cerrados en esta ronda (3)

**C1 · [agéntico] Al contralor le llegaba el PDF censurado del operador** — `0d6bea7`
`processor.ts:2111` firmaba `{viaje}-operador.pdf` (filtrado con `SOLO_CONTRALOR`
para que el chofer no lea `cfdi_efos`/`cfdi_cancelado`/`rfc_receptor`) y reusaba
**esa misma liga** para `avisarCierreAlJefe`. A la oficina le llegaba un texto que
sí nombra "proveedor en lista 69-B" con un PDF adjunto que no trae esa línea, y
que contradice al que se baja del panel. En **todo** cierre.
Prueba: `cierre_pdf_del_jefe.test.ts` (3 casos) — sin el arreglo falla en 2.

**C2 · [operabilidad] El sondeo de arranque liberaba el mutex de un viaje ajeno** — `61cf600`
`unlock_viaje` (mig. 0005) es un `delete` sin token de dueño. El probe llamaba
`try_lock_viaje(viaje_real, 1ms)` y luego `unlock_viaje` **incondicionalmente**.
Si otra invocación tenía el lease, `try_lock` devuelve `false` —no un error, así
que nada se reportaba— y el probe le borraba el lock: el siguiente mensaje del
lote entra a liquidar en paralelo. La doble liquidación que la 0005 existe para
impedir, causada por el probe que la verifica.
Prueba: `startup_mutex_ajeno.test.ts` (3 casos, con control).

**C3 · [fiscal] La facilidad del 15% se abría al régimen equivocado** — `37612f1`
RFA 2.9 dice, literal (ficha `verificado_fuente_primaria`, DOF/SIDOF 5780249):
*"Título II, **Capítulo VII** o Título IV, Capítulo II, Sección I"*. Título II
Cap. VII = **Coordinados = 624**. El código usaba `['601','612']` con el
comentario *"601 (General de Ley PM — coordinados)"*, fundiendo dos claves
distintas del catálogo; y `624` no estaba ni en la lista ni en el CHECK de la
0056. Abría para quien no califica —con el PDF imprimiendo "deducible" citando
la regla— y cerraba para el coordinado real, al que ni se le podía capturar el
régimen. Es el error de jerarquía que `normas/README.md` llama *"el más caro del
dominio"*.
Prueba: `regimen_facilidad_15.test.ts` (4 casos) — sin el arreglo fallan 2.
Incluye migración `0088` + bloque 63 de `verificaciones.sql`.

### Pendientes (4) — con la razón

**C4 · [fiscal] El 15% se mide contra "el combustible que Likida vio"**
`engine.ts:337,354` · `repo.ts:826-834`. La norma dice *"del total de los pagos
efectuados por consumo de combustible"*; el denominador real es solo lo que pasó
por el producto, y con él el PDF imprime "No deducible".
**Razón de pendiente:** el denominador correcto exige un dato que el producto no
tiene (el gasto de combustible que NO pasó por Likida). No es un arreglo de
código, es una decisión de producto: o se declara el supuesto en el PDF, o se
captura el total del ejercicio. Se propone, no se inventa.

**C5 · [legal] La foto viaja al modelo externo antes del aviso**
`processor.ts:522-525` corre entero antes del bloqueo de `:647`. Sin viaje
abierto, `downloadMediaAsDataUrl` + `extraerComprobante` ya mandaron la imagen
del operador a un tercero sin aviso ni constancia. **Verificado el orden.**
**Razón de pendiente:** mover el bloqueo antes del intake cambia el flujo de
huérfanos (la sala de espera de comprobantes sin viaje, mig. 0040) y puede dejar
fotos sin recoger. Es un cambio de diseño del ciclo, no de una línea, y con el
tope de 3 vueltas agotado no se toca a ciegas.

**C6 · [pruebas] El callback de QStash emite CFDI y no tiene una sola prueba**
`api/cron/facturar/cola/route.ts:40,66`, 0% de cobertura. **Verificado en vivo:**
el auditor le quitó la verificación de firma (`if (false)`) y la re-validación de
`cfdi_uuid`, y los 3,148 tests siguieron verdes.
**Razón de pendiente:** el arreglo es escribir el arnés de un endpoint que
factura de verdad; es trabajo de una sesión propia, no de una vuelta de auditoría.

**C7 · [rendimiento] El cierre no cabe en la reserva que él mismo aparta**
`presupuesto.ts:37-72`. `avisarCierreAlJefe` (2 lecturas + 1 envío) **no está en
`PASOS_CIERRE`** — verificado. Con sus propios números nominales el tramo se va a
~13.2s contra `MARGEN_CIERRE_MS = 12_000`, y dos consultas del tramo van sin
`acotada` (techo de undici: 300s contra `maxDuration=120`).
**Razón de pendiente:** subir el margen le quita techo al agente (de 48s a menos)
y esa es una decisión de producto con efecto en el demo. Lo que sí se hizo:
**anotar el paso que este mismo arreglo agregó** (`a30f7b0`), para que la
contabilidad no siga mintiendo — el archivo advierte que meter un paso sin
anotarlo es cómo la reserva deja de ser cierta.

## Descartados

Ninguno. Los 7 críticos se abrieron uno por uno contra el código y los 7 son
reales. Lo que sí hubo fue **una prueba que fijaba el bug**:
`ruta_pdf_sincronizada.test.ts` exigía que `processor.ts` NO nombrara la ruta del
contralor. Su intención era buena —que el chofer no reciba el ejemplar completo—
pero el proxy era el archivo entero, y con un solo PDF firmado eso obligaba a
mandarle al jefe el del operador. Se acotó y la garantía real pasó a la prueba de
comportamiento.

## Compuerta (salida real, árbol final)

```
npx tsc --noEmit -p .   → 0 errores
npx vitest run          → 252 archivos, 3,159 pruebas verdes, 1 saltada
npm run lint            → 0 errores, 18 warnings (mismo número que la línea base)
```

Sin `npm run build` y sin `pruebas-manuales/*`: no hay credenciales en la nube y
esas pruebas hacen llamadas de pago.

## Lo que esta ronda dice del proceso

- **Un rubro que se autocalifica sube.** La ronda 16 se puso 7 en fiscal; con las
  fichas abiertas al lado del código, el rubro está en 4. La calificación de un
  arreglo no la puede dar quien lo hizo.
- **Una migración aplicada no es una migración usada.** La 0084 se dio por
  cerrada tres rondas seguidas sin que nadie comprobara la llamada.
- **La suite grande da falsa seguridad.** 3,148 pruebas verdes y 6 de 10 mutantes
  sobreviven: el motor de cuadre está anclado de verdad, el anillo que lo rodea
  no. Es el dato más accionable de la ronda.
