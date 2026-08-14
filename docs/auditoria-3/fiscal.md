# Cumplimiento fiscal — auditoría 3

**Nota: 3.5/10** (antes 6.5). Razón del movimiento: **mirada más profunda** — se
auditó por primera vez la puerta que ABRE la facilidad de la RFA 2.9 (el alta de
flota), no solo el motor que la aplica, y ahí el código traduce "Título II
Capítulo VII" a la clave SAT equivocada en las dos direcciones. Se suma que los
dos ALTOS heredados (FI-A1, FI-A2) siguen **vivos, línea por línea, sin tocar**.
El motor de cuadre en sí sigue siendo lo mejor del repo — la proporcionalidad de
LIVA 5, el presunto/definitivo del 69-B, el interruptor de exigibilidad del
complemento y el matiz de nivel 6 en `factura_por_vencer` son trabajo de primer
nivel —, pero el ancla del rubro es explícita: si el producto imprime una cifra
fiscal equivocada, la nota es 3 o menos. Aquí la imprime por dos caminos
soportados.

**El riesgo mayor, hoy:** una flota S.A. de C.V. que se dio de alta con régimen
**601** recibe, en verde y en el PDF que archiva su contador, su diésel pagado en
efectivo declarado "Deducible para ISR — facilidad del 15%, RFA 2026 regla 2.9";
601 es Título II **Capítulo I**, y la regla exige Capítulo VII. Y el
transportista que sí califica —el **Coordinado, clave 624**— ni siquiera aparece
en la lista del alta, así que se le declara NO deducible lo que el DOF le
concede.

---

## Hallazgos

### [CRÍTICO] La elegibilidad de la RFA 2.9 se deriva de la clave SAT equivocada — en las dos direcciones

`src/lib/likida/administracion.ts:115-116` · `src/app/admin/flotas/page.tsx:218-232`
· consumido en `src/lib/likida/cuadre/desde_db.ts:55-58` → `src/lib/likida/cuadre/engine.ts:302-370`
· espejado en `src/lib/likida/fiscal.ts:218-222` y `src/lib/likida/tools.ts:116-118`.

**Ficha:** `normas/rfa-2026-2.9.yaml`, `estado_verificacion: verificado_fuente_primaria`,
leída en el DOF (SIDOF 5780249). Texto literal:

> "Los contribuyentes personas físicas o morales, dedicados exclusivamente al
> autotransporte terrestre de carga federal, **que tributen conforme al Título II,
> Capítulo VII o Título IV, Capítulo II, Sección I de la Ley del ISR**,
> considerarán cumplida la obligación establecida en el artículo 27, fracción III,
> segundo párrafo de la Ley del ISR, cuando los pagos por consumo de combustible
> se realicen con medios distintos a cheque nominativo… siempre que estos no
> excedan el 15 por ciento del total de los pagos efectuados por consumo de
> combustible…"

y su `condiciones_de_aplicacion`: *"Tributar en Título II Cap. VII (**coordinados**)
o Título IV Cap. II Secc. I (PF act. empresarial)"*.

El código:

```ts
// administracion.ts:115-116
const REGIMENES_ELEGIBLES = ['601', '612'];
const regimenElegible = f.regimenFiscal ? REGIMENES_ELEGIBLES.includes(f.regimenFiscal) : undefined;
```

y el comentario de la línea 112 lo dice con todas sus letras: *"los códigos 601
(General de Ley PM — **coordinados**) y 612 … son los dos títulos que la regla
admite"*. La pantalla repite el error: `admin/flotas/page.tsx:219` ofrece
`601 — General de Ley PM (coordinados)` y `:230-232` afirma *"la facilidad del
15% (RFA 2.9) exige 601 o 612; cualquier otro no califica y el efectivo en
combustible no se deduce"*.

En el catálogo `c_RegimenFiscal` del SAT, **601 es "General de Ley Personas
Morales" — LISR Título II, Capítulo I**. "Coordinados" es la clave **624**, que
es el Título II **Capítulo VII** que la regla nombra. 624 **no está en el
`<select>`**; tampoco en `src/lib/saas/fiscal.ts:20-26`.

**Escenario A — se regala una deducción que no existe.** Transportes X, S.A. de
C.V., alta con régimen `601` y la casilla de dedicación exclusiva marcada →
`regimenElegible = true` → `desde_db.ts:56` `facilidad15 = true`. Ejercicio 2026:
`totalCombustibleEjercicio = $2,000,000`, efectivo `$180,000` (9%).
`engine.ts:337` calcula tope = `0.15 × 2,000,000 = $300,000`; `$180,000 < $300,000`
→ diferencia `combustible_efectivo_dentro15` con `monto: 0`, que **no** está en
`NO_DEDUCIBLE_ISR` (`engine.ts:100`) → `cubetaDe` = `deducible` → los $180,000
entran a `totalDeducible` y `liquidacion/deducibilidad.ts:72` los imprime como
**"Deducible para ISR", tono `bueno`, en VERDE** (`pdf.ts:295`), con la nota
*"deducible por la facilidad del 15% (RFA 2026 regla 2.9)"*. La verdad: 601 no es
Título II Cap. VII, la facilidad no aplica, y por LISR 27-III 2º párrafo el
combustible exige pago electrónico sin excepción → **$180,000 no deducibles
impresos como deducibles; ~$54,000 de ISR (30%) omitido por ejercicio.**

**Escenario B — se destruye la deducción de quien sí califica.** Un Coordinado
real (clave `624`, la figura arquetípica del autotransporte de carga federal) no
puede elegirse en el alta; capturado por cualquier otra vía,
`REGIMENES_ELEGIBLES.includes('624') === false` → `regimenElegible = false` →
`engine.ts:358-363` emite `efectivo_no_elegible` con `monto: g.monto`, que **sí**
está en `NO_DEDUCIBLE_ISR` → los mismos $180,000 salen **"No deducible" en ROJO**
(`pdf.ts:295`, `RED`) citando *"la flota declaró que NO califica … LISR 27-III —
no deducible"*. **$54,000 de ISR pagados de más, sobre una facilidad que el DOF
le concede.**

**Consecuencia:** el contador cruza el PDF contra su papel de trabajo y encuentra
la afirmación exactamente al revés en los dos casos. En el escenario A, Likida
—no el cliente— es quien "presta servicios para omitir… el pago de alguna
contribución": CFF 89 fr. I, con la multa del art. 90 (`normas/cff-89-90.yaml`,
`verificado_fuente_primaria`) y el agravante del 2º párrafo por criterio diverso
al del SAT.

**Refutación intentada:** ¿el `<select>` de `/admin/flotas` corrige a mano
(`repo.ts:1027 actualizarFacilidad15`)? Sí, existe un override "Régimen: Sí/No"
— pero quien lo usa es el mismo superadmin al que la pantalla de al lado le
afirma que "601 o 612" es lo correcto, y el default del alta no es neutro: si se
elige 601 la derivación ya escribió `true`. ¿Y si el campo se deja "Sin
declarar"? Entonces `regimenElegible = undefined` y todo el camino cae en
`por_confirmar`, que sí es honesto — el defecto solo se dispara cuando alguien
contesta la pregunta. Sigue siendo un camino soportado, documentado en pantalla y
sin una sola prueba: `administracion.test.ts` no menciona `regimen`.

**Causa raíz probable:** se tradujo "Título II Capítulo VII" al primer régimen de
persona moral que vino a la mano (601) en vez de al catálogo `c_RegimenFiscal`, y
el comentario que lo justificaba petrificó el error como si fuera la lectura de
la ficha.

---

### [ALTO · REINCIDENTE] La card de peajes cita una regla sin ficha y pinta en VERDE lo que la ficha deja SIN RESOLVER

`src/app/dashboard/agentes/peajes/vista.tsx:144-161` (y `page.tsx:30`, `vista.tsx:13`).
FI-A1 de la ronda anterior: **vivo, sin un solo cambio**.

**Ficha:** `normas/lif-2026-20-A.yaml`, `verificado_fuente_primaria`. Texto
literal del estímulo de peaje: *"…consistente en permitir un acreditamiento de
los gastos realizados en el pago de los servicios por el uso de la infraestructura
mencionada **hasta en un 50 por ciento del gasto total erogado** por este
concepto."* Y su hallazgo H4, textual:

> `id: H4` · `que_hace_el_motor: "peajeAcreditable += g.subTotal * 0.5 — usa el SubTotal SIN IVA."`
> `severidad: alta` · **`estado: SIN RESOLVER`** · *"Esta es una pregunta para un contador, NO para resolverse sola."*

La pantalla imprime `<Requisito ok texto="Factor 0.5 sobre el importe sin IVA — el
motor lo aplica por viaje" />` (`:150`), y `ok` pinta palomita en `var(--ok)`
(`:174`). O sea: pinta como requisito CUMPLIDO la única decisión que la ficha
verificada declara sin resolver.

Además, el encabezado `:144` y el copy `:146-147` fundan las cinco condiciones en
**"RMF 9.1.8"**, y **no existe `normas/rmf-2026-9.1.8.yaml`**: `IDS_NORMA`
(`normas/indice.ts:80-309`) no la tiene, `normas_sincronizadas.test.ts` no puede
verla porque la cita vive en JSX, y `README.md` de `normas/` es explícito
(*"Ninguna ficha `sin_verificar` debe sostener una cifra que el producto
imprima"*) — aquí no hay ni ficha sin verificar. El único respaldo es
`docs/conocimiento/04-iva-ieps-estimulos.md`, que es documentación interna, no la
fuente de verdad del rubro.

**Escenario con cifras:** flota con $169,000 de subtotal de casetas en el
histórico. El motor (`engine.ts:1028`) acumula `peajeAcreditable = 169,000 × 0.5
= $84,500` y `:159` lo imprime. Con la base que la ley nombra —gasto total
erogado, $196,040 con IVA al 16%— serían **$98,020**: **$13,520 (13.8%) de
diferencia** sobre una elección que la ficha manda llevar a un contador. La
pantalla no da al lector ninguna forma de saber cuál de las dos bases se usó ni
que la pregunta esté abierta.

Peor todavía, la MISMA cifra en el PDF sí se comporta:
`liquidacion/acreditable.ts:44-49` la marca `tono: 'condicionado'`, la etiqueta
"— sujeto a elegibilidad" y adjunta `BASE_ESTIMULO_PEAJE` y
`CONDICIONES_ESTIMULO_PEAJE` (las cuatro condiciones, incluida "no ser parte
relacionada, LISR art. 179", **que la card ni menciona**). Dos pantallas, un solo
hecho, dos veredictos: exactamente lo que `CLAUDE.md` llama "se lee como dos
cálculos".

**Consecuencia:** el contralor lee "requisito cumplido ✓" sobre una base que su
contador puede corregir al alza en 13.8%, y lee una regla ("RMF 9.1.8") que
Likida no ha transcrito de ninguna fuente primaria. Si la cita está mal
renumerada —el riesgo que `normas/README.md` documenta con la 2.7.1.24/2.7.1.21—
el papel del contralor cita una regla que trata otra cosa.

**Causa raíz probable:** la card se escribió desde `docs/conocimiento/` en vez de
desde `normas/`, y `normas_sincronizadas.test.ts` solo vigila el índice contra
las fichas, no las citas que aparecen en la UI.

---

### [ALTO · REINCIDENTE] "Plazo de comercio vencido" se contabiliza como pérdida definitiva y se funda en un artículo que no habla de plazos

`src/lib/likida/fiscal.ts:263-269` (definición), `:347` (disparo), `:376` y `:439`
(suma a `montoPerdido`), `:1011` (columna `fundamento` del Excel).
FI-A2 de la ronda anterior: **vivo, sin un solo cambio**.

```ts
plazo_vencido: {
  gravedad: 'perdida',
  titulo: 'Plazo de facturación vencido',
  norma: 'LISR 27-III',
  detalle: 'El comercio ya no acepta timbrarlo. Sin CFDI no ampara deducción y el IVA no se acredita.',
},
```

**Ficha:** `normas/politica-portales-plazos.yaml`, `jerarquia: 6`,
`estado_verificacion: sin_verificar`. `advertencia_de_jerarquia`, literal:

> "**ESTO NO ES UNA NORMA FISCAL.** Es la política interna de un tercero y tiene
> CERO fuerza legal. **El plazo LEGAL para pedir factura es todo el ejercicio** (el
> SAT lo dice expresamente), y negarla porque 'ya pasó el mes' es una práctica
> indebida listada por el propio SAT, con remedio en la Conciliación de Factura.
> **El producto NUNCA debe presentar estos plazos como una obligación fiscal.**"

Y `normas/lisr-27-III.yaml` (`evidencia_corroborante`) transcribe la fracción
completa: habla de comprobante fiscal y de la FORMA DE PAGO sobre $2,000 y del
permiso de hidrocarburos. **No dice una palabra sobre plazos para solicitar la
factura.** Citarla como fundamento de "plazo vencido" es citar un artículo que no
dice eso.

**Escenario con cifras:** ticket de diésel de **$8,700** del **3-jul-2026**, sin
CFDI, comercio no reconocido. `fiscal.ts:786-799` llama a `armar()`
(`pendientes.ts:182`), que con `plazo: 'mes_natural'` fija el límite el
**31-jul**; hoy 14-ago → `vencido = true` → `plazoVencido = true` → `:347`
`push('plazo_vencido')` → `gravedad: 'perdida'` → `:439` suma a `montoPerdido` →
la tarjeta de `/dashboard` imprime esos $8,700 dentro de **"En riesgo / perdido"**
en `--color-bad` (`motor-fiscal-periodo.tsx:63-75`), y el export a Excel
(`fiscal.ts:1010-1011`) sale con `situacion_fiscal = "Plazo de facturación
vencido"` y `fundamento = "LISR 27-III"`. La verdad: al 14-ago-2026 el ejercicio
sigue abierto, la factura es exigible y hay remedio administrativo con el SAT →
**recuperable con fricción, no perdida.**

Lo que hace que esto duela más: el **motor sí lo dice bien**. `engine.ts:749`
imprime, sobre el mismo hecho, *"se pasó el plazo de facturación… pero legalmente
puedes exigirlo dentro del ejercicio (Conciliación de Factura del SAT)"*, y
`engine.ts:707-732` dedica 25 líneas de comentario a explicar por qué un plazo de
nivel 6 no puede sonar a obligación. Ese cuidado no cruzó a `fiscal.ts`, que es
el módulo del que come el panel del contador y el chat (`chat-tools.ts:93-97`).

**Consecuencia:** el contralor da por perdido dinero que recupera con una
llamada, y su contador ve un papel de trabajo que atribuye a la LISR una regla de
plazos que la LISR no tiene.

**Causa raíz probable:** `fiscal.ts` se escribió como "las mismas reglas que el
motor, por comprobante y por periodo" (su encabezado, `:24-28`) y en la
traducción se perdió el único matiz que el motor había resuelto a mano — la
jerarquía del plazo.

---

### [ALTO] El panel de una liquidación imprime en verde el estímulo de IEPS en PESOS, calculado con la fórmula que el propio repo repudió

`src/app/dashboard/[id]/page.tsx:265` (renderizado) · `:148` (compuerta) ·
`src/lib/likida/analytics.ts:1332` (lectura de `ieps_acreditable`) ·
`src/lib/likida/analytics.ts:638` (misma columna, sumada en `getAcreditables`).

**Fichas:** `normas/lif-2026-20-A.yaml` (`verificado_fuente_primaria`),
`como_se_calcula`, literal:

> "**cuota IEPS vigente al momento de la compra × LITROS. No es el IEPS trasladado
> en el CFDI.**"

y `normas/criterio-1-LIF-PI.yaml`, `pendiente_en_producto`, literal:

> "El motor de cuotas semanales NO existe. **Hasta que exista, el producto NO debe
> imprimir una cifra de estímulo de diésel en pesos**: solo litros, cuota fechada y
> rango."

El motor ya obedece: `engine.ts:998` fija `const iepsAcreditable = 0` y entrega
`litrosDieselAcreditables`. Pero el panel **lee la columna persistida**, no el
recálculo:

```tsx
{d.ieps > 0 && <Tot label="IEPS de diésel (vs ISR)" value={mxn(d.ieps)} ok />}
```

`ok` es verde. El comentario de `:262-264` admite el problema y lo deja: *"`ieps`
solo puede venir de filas viejas escritas antes del cambio; se conserva para no
ocultarlas"*. Y ninguna migración pone a cero la columna: `0021` solo agrega
`litros_diesel_acreditables` y el `guardar_liquidacion_tx` la reescribe **solo al
re-cerrar** el viaje (`on conflict … do update`). Una liquidación cerrada antes
del commit `2a0579c` conserva su valor para siempre.

**Escenario con cifras:** liquidación de junio con 5 CFDI de diésel, 1,000 L,
IEPS trasladado en los comprobantes ≈ **$6,340** (la cuota entera del art. 2-I-D
de la LIEPS). El panel imprime **"IEPS de diésel (vs ISR) $6,340.00"** en verde.
El estímulo del LIF 20-A de esa semana, con la cuota DISMINUIDA del acuerdo del
DOF (la ficha `criterio-1-LIF-PI` documenta que fue de $7.3634 a $2.0925 en cinco
meses), sería **$2,092.50**: **3.0× de más**. Y el criterio 1/LIF/PI del Anexo 3
—`jerarquia: 5`, alcance a "quien preste servicios"— nombra exactamente esa
conducta: *"Calcularlo con la entera es práctica indebida — de quien lo hace Y de
quien le presta el servicio."*

**Consecuencia:** el contralor abre la liquidación desde el navegador y ve una
cifra de estímulo tres veces mayor que la real, en verde, mientras el PDF de la
misma liquidación entrega litros. Si la teclea, el acreditamiento se declara de
más y quien responde es el cliente.

**Refutación intentada:** ¿existen filas viejas? No puedo consultar la base desde
aquí. Lo que sí es verificable: el camino de render es incondicional para
`ieps > 0`, la única forma de que sea `> 0` es la fórmula repudiada
(`0021_liquidacion_litros_diesel.sql:8-12` lo afirma: *"`ieps_acreditable` ahora
es siempre 0"*), y `git log -S"iepsAcreditable +="` confirma que la fórmula vivió
en el motor hasta `2a0579c`. Es un ALTO y no un CRÍTICO solo porque depende de
filas heredadas.

**Causa raíz probable:** se arregló el motor y el esquema pero no se hizo el
backfill, y se decidió "no ocultar" un dato que el propio producto declara mal
calculado — la excepción es más cara que el hueco.

---

### [MEDIO] Dos contadores del 15% con criterios distintos: el del chat cuenta menos combustible que el del motor

`src/lib/likida/tools.ts:109` contra `src/lib/likida/cuadre/desde_db.ts:78`.

`getAcumuladoCombustible(tenantId, ejercicio, claves?)` (`repo.ts:909-937`) filtra
con `concepto.eq.diesel` **a secas** cuando no recibe `claves`, y con
`concepto.eq.diesel,clave_prod_serv.in.(…)` cuando sí. `desde_db.ts:78` pasa
`config.hidrocarburos.claves`; `tools.ts:109` **no pasa nada**.

El propio comentario de `repo.ts:933-936` documenta por qué importa: *"AUDITORÍA
14, MEDIO: … Tres contadores con tres criterios = el chat dice 8% y el motor
12%."* El arreglo llegó a `desde_db.ts` y no a `tools.ts`.

**Escenario:** ejercicio con $1,800,000 de combustible bajo `concepto='diesel'` y
$200,000 más de CFDI con `clave_prod_serv = 15101514` (Magna) clasificados como
otro concepto, de los cuales $30,000 en efectivo, más $240,000 en efectivo del
resto. Motor (`desde_db`): 270,000 / 2,000,000 = **13.5% → `cerca`**. Tool
(`tools.ts`): 240,000 / 1,800,000 = **13.3% → `cerca`** también, pero con otro
margen: `$30,000` contra `$0` de cupo restante. En una flota con más peso en
claves de gasolina la diferencia cruza el 15% en un lado y no en el otro, y el
aviso de `avisoTope15` (`periodo/aviso.ts:44`) dice "te quedan $X antes de perder
la deducción" con una X que el PDF no reconoce.

**Consecuencia:** el motivo por el que el contralor cambia de medio de pago sale
de una cifra que no cuadra con la del papel. **Causa raíz probable:** el
parámetro `claves` se agregó como opcional y el segundo llamador se quedó atrás.

---

### [MEDIO] El IVA del combustible en efectivo DENTRO del 15% se niega en bloque; la ficha de LIVA 5 apunta al revés

`src/lib/likida/cuadre/engine.ts:985` (`SIN_ACREDITAMIENTO` incluye
`combustible_efectivo_dentro15`) · `src/lib/likida/fiscal.ts:536`
(`ivaSostenible` devuelve `false` para todo combustible con `formaPago === '01'`).

**Ficha:** `normas/liva-5.yaml`, `verificado_fuente_primaria`, fracción I,
literal: *"Para los efectos de esta Ley, **se consideran estrictamente
indispensables las erogaciones efectuadas por el contribuyente que sean
deducibles para los fines del impuesto sobre la renta**, aun cuando no se esté
obligado al pago de este último impuesto."* Y `normas/rfa-2026-2.9.yaml`, literal:
la flota elegible *"considerará cumplida la obligación establecida en el artículo
27, fracción III, segundo párrafo de la Ley del ISR"* — es decir, **el gasto SÍ es
deducible para ISR**.

Encadenando las dos fichas verificadas: si el gasto es deducible para ISR, su IVA
es acreditable por LIVA 5-I. El `limite_importante` de la ficha 2.9 acota la
excepción a **un** beneficio: *"Conserva la DEDUCCIÓN para ISR. **NO habilita el
acreditamiento del IEPS**"* — nombra el IEPS, no el IVA. El comentario de
`engine.ts:981-984` hace el mismo razonamiento y luego mete el tipo en la lista
que también corta el IVA.

**Escenario:** carga de diésel de $11,600 (IVA trasladado $1,600) pagada en
efectivo por una flota elegible, dentro del 15% del ejercicio. El motor la deja en
`totalDeducible` ($11,600, verde) y a la vez **no suma los $1,600 a
`ivaAcreditable`**. El PDF acaba diciendo, en la misma hoja, que el gasto es
deducible y que su IVA no se acredita, sin explicar por qué. **Consecuencia:** el
error va del lado barato (se acredita de menos, no de más), pero es una cifra
menos que el contador va a reclamar, y el papel la afirma sin matiz — no está
marcada como pregunta abierta, como sí lo está H4 del peaje.

**Causa raíz probable:** `SIN_ACREDITAMIENTO` es una sola lista para dos impuestos
con reglas distintas; el nombre del arreglo anterior ("no era NO_DEDUCIBLE, era
sin acreditamiento") resolvió una confusión y dejó la otra.

---

### [MEDIO] `efectivo_no_elegible` suma al monto perdido pero desaparece del desglose por causa

`src/lib/likida/fiscal.ts:375-378` (`ORDEN`) y `:450-461` (`porCausa`).

`ORDEN` lista siete causas y **no incluye `efectivo_no_elegible`**, que sí existe
en `CausaPerdida` (`:242`) y en `TITULOS` (`:300-305`, `gravedad: 'perdida'`).
`causaDominante` (`:380-388`) recorre `ORDEN`, no encuentra nada y cae al
`return cs[0]` — así que la causa sí se vuelve dominante y `:439` suma su monto a
`montoPerdido`. Pero `porCausa` se construye con `ORDEN.filter(c => porCausaMapa.has(c))`,
que la excluye.

**Escenario:** flota que declaró NO calificar (`elegible15 === false`), con
$180,000 de diésel en efectivo **con CFDI** en el ejercicio. La tarjeta "En
riesgo / perdido" del panel muestra $180,000; la lista de causas debajo
(`resumen-visual.tsx` `MotorFiscal`, top 3) no trae ni un renglón que los
explique. El contralor suma las causas con el dedo y le faltan $180,000.

**Consecuencia:** un desglose que no cuadra con su propio total es el modo de
falla que este repo ya persiguió en `omitidos.ts` y en `filasDeducibilidad`
(`deducibilidad.ts:54-55` aborta si las cubetas no suman). Aquí no hay esa red.
**Causa raíz probable:** `efectivo_no_elegible` se agregó en la auditoría 14/15 a
`CausaPerdida`, `TITULOS` y `causasDe`, y no a la cuarta lista.

---

### [MEDIO] Tres veredictos de "no deducible" se fundan en una ficha sin texto transcrito

`src/lib/likida/normas/por_diferencia.ts:45,49,50` (`rfc_receptor`,
`cfdi_cancelado`, `cfdi_no_encontrado` → `cff-29-A`) ·
`src/lib/likida/cuadre/engine.ts:100` (los tres están en `NO_DEDUCIBLE_ISR`) ·
`src/lib/likida/fiscal.ts:270-274`.

**Ficha:** `normas/cff-29-A.yaml` → `texto_vigente: null`, `estado_verificacion:
evidencia_corroborante`, `nota_verificacion`: *"El texto del artículo NO se
transcribió de diputados.gob.mx. **PARA CERRAR: pegar el texto vigente.**"*

Este repo ya fijó el estándar contrario, y por escrito: `normas/cff-69-B.yaml`
existe porque *"el motor YA decidía 'no deducible' duro con este fundamento… y no
había ficha: se estaba tirando una deducción entera sobre una norma que nadie
había transcrito"*. La misma frase describe hoy a CFF 29-A, que sostiene tres
veredictos duros más `comprobante_no_fiscal`.

**Escenario:** CFDI de $11,600 timbrado a un RFC ajeno → `rfc_receptor` →
`NO_DEDUCIBLE_ISR` → el PDF imprime "No deducible $11,600.00" en ROJO y el agente
puede citar "CFF 29-A". El veredicto probablemente es correcto (la fracción IV
exige el RFC del receptor), pero **nadie ha leído el texto vigente**, y la reforma
del DOF 07-11-2026 que la propia ficha registra (inciso f de la fracción V,
cuarto párrafo de cancelación) demuestra que el artículo se mueve.
**Consecuencia:** el ancla del rubro pide que cada cifra impresa rastree a una
ficha `verificado_fuente_primaria`; aquí el veredicto más caro después del EFOS no
lo hace. **Causa raíz probable:** el cierre de fichas de la auditoría 5 priorizó
las que decidían dinero *nuevo* (30, 69-B, 89-90) y dejó la que ya llevaba tiempo
decidiéndolo.

---

### [MEDIO] Dos rótulos que convierten deducción pendiente en un hecho consumado

`src/app/dashboard/inicio-contenido.tsx:316-318` y
`src/app/dashboard/combustible-casetas/page.tsx:193`.

1. `StatCard etiqueta={`Ahorro generado — ${periodoFiscal.etiqueta}`} valor={resumenPerdidas?.montoRecuperable}`.
   `montoRecuperable` es la suma de gastos **sin CFDI cuyo plazo sigue abierto**
   (`fiscal.ts:306-311`, `gravedad: 'recuperable'`). No es ahorro y nadie lo ha
   generado: es trabajo pendiente. El propio comentario de `:304-306` admite que
   es "mismo número que Recuperable pidiendo factura".
2. `nota={…`${sinCfdi} de ${combustibleYCasetas.length} sin factura — es deducible que se pierde`}`.
   `engine.ts:121-126` dice lo contrario en el mismo repo: *"Tampoco es pérdida:
   se puede timbrar. Por eso POR CONFIRMAR"*, y el PDF lo imprime como *"Por
   confirmar … Se puede recuperar"* (`deducibilidad.ts:79`).

**Escenario:** 38 de 40 comprobantes sin CFDI por $47,300. La página de
Combustible & Casetas dice que es deducción que se pierde; el PDF de las mismas
liquidaciones dice que se recupera; y el inicio llama a la cifra hermana "Ahorro
generado". **Consecuencia:** tres lecturas del mismo hecho fiscal en tres
pantallas del mismo producto. **Causa raíz probable:** los rótulos se escribieron
para vender el moat, no desde la clasificación del motor.

---

### [BAJO] El catálogo de regímenes con el que Likida factura a su cliente no incluye a los Coordinados y trae dos claves mal nombradas

`src/lib/saas/fiscal.ts:20-26` y `src/app/admin/flotas/page.tsx:219-228`.

`REGIMENES` ofrece 601, 603, 612, 621, 626 — **sin 624 (Coordinados)**, que es la
figura del transportista de carga federal. `guardarDatosFiscales` valida contra
esa lista (`:99`), así que un coordinado no puede capturar su régimen real y el
PAC rechaza el timbrado por `RegimenFiscalReceptor` distinto al de su Constancia
(o timbra con el régimen equivocado). En el alta, además, `615` se rotula
"Incorporación Fiscal" (615 es "obtención de premios"; el RIF es 621) y `616`
"Otros regímenes" (616 es "Sin obligaciones fiscales").

**Consecuencia:** el cliente no puede deducir la suscripción que ya pagó — el
escenario que el encabezado de `saas/fiscal.ts:12-16` dice venir a evitar
("ya tienes su dinero y no lo puede deducir"). **Causa raíz probable:** el
catálogo se escribió de memoria y no contra `c_RegimenFiscal`.

---

## Fichas de `normas/` y su estado

| Ficha | `verificado_fuente_primaria` | Dónde la implementa el código | ¿Coincide? |
|---|---|---|---|
| `lif-2026-20-A.yaml` | **sí** | `config.ts:106` (`peajeFactor 0.5`, `clavesDieselIeps`), `engine.ts:1028` (peaje), `:1029-1081` (litros, IEPS = 0), `acreditable.ts:44-121`, `peajes/vista.tsx:144-161` | **Parcial.** El PDF sí (litros, no pesos; peaje `condicionado` con las 4 condiciones). La card de peajes **no**: pinta H4 (`SIN RESOLVER`) como cumplido y cita una regla sin ficha. `[id]/page.tsx:265` **no**: imprime el estímulo en pesos. |
| `rfa-2026-2.9.yaml` | **sí** | `administracion.ts:115`, `desde_db.ts:55-58`, `engine.ts:284-370`, `periodo/combustible.ts`, `periodo/aviso.ts`, `fiscal.ts:218-222`, `tools.ts:116` | **NO.** El texto pide Título II Cap. VII (clave 624); el código exige 601. El 15%, la base combustible-contra-combustible y "no acredita IEPS" sí coinciden. |
| `lisr-28-V.yaml` | **sí** | `config.ts:107` ($750), `engine.ts:872-969` (tope por día), `:772-869` (H1 y H2) | **Sí.** $750 diarios, solo alimentación, por día y beneficiario, proporción del día. H3 (faja de 50 km) declarado no implementado, con motivo. |
| `liva-5.yaml` | **sí** | `engine.ts:1010-1026` (proporción de LIVA 5-I), `fiscal.ts:527-538` | **Casi.** La proporcionalidad del viático está bien y probada. Discrepa en el IVA del combustible en efectivo dentro del 15% (ver MEDIO arriba). |
| `cff-69-B.yaml` | **sí** | `intake/sat.ts:66-85`, `engine.ts:503-506`, `fiscal.ts:276-287` | **Sí.** Distingue presunto (a bandeja) de definitivo (duro), que es la lectura literal del 1er vs 4º párrafo. No modela el plazo de 30 días del receptor, y la ficha lo declara. |
| `cff-89-90.yaml` | **sí** | `cuadre/leyendas.ts:36-58`, `pdf.ts:452-460` | **Sí.** La eximente del último párrafo del 89 va literal y POR ESCRITO en el papel archivado. |
| `cff-30.yaml` | **sí** | `repo.ts saveCfdiXmlRaw`, `processor.ts:238` y `:494` | **Sí.** Best-effort declarado; no promete que 5 años basten. |
| `rlisr-57.yaml` | **sí** | `engine.ts:479-498` (`viatico_rfc_operador`), mig. `0080_operador_rfc.sql`, `repo.ts:1016` | **Sí en el código; la ficha está VENCIDA.** Dice *"NO se creó la columna"* y la 0080 la creó. Una ficha que contradice al código es el fallo que `politica-portales-plazos.yaml` documenta haber sufrido. |
| `lisr-27-III.yaml` | no (`evidencia_corroborante`) | `config.ts:108` ($2,000), `engine.ts:371-374`, `:302-370`, `fiscal.ts:288-305` | **Sí en el tope y la forma de pago.** **NO** en `fiscal.ts:267`, donde se cita como fundamento de un plazo que el artículo no regula. Ficha no verificable en esta ronda para el 2º párrafo (permiso de hidrocarburos). |
| `cff-29-A.yaml` | no (`texto_vigente: null`) | `intake/cfdi.ts` (UUID/RFC), `engine.ts:100,399,496,500,502`, `por_diferencia.ts:45-52`, `fiscal.ts:270-274` | **No verificable en esta ronda.** Sostiene tres veredictos duros de "no deducible" sin texto transcrito (ver MEDIO). |
| `criterio-1-LIF-PI.yaml` | no (`evidencia_corroborante`) | `engine.ts:1034-1046` (litros, no pesos), `acreditable.ts:80-83`, `por_diferencia.ts:56` | **Sí en el motor y el PDF; NO en `[id]/page.tsx:265`.** `usado_en_codigo: []` está desactualizado. |
| `criterio-1-CFF-PI.yaml` | no (`evidencia_corroborante`) | `cuadre/leyendas.ts` | **Sí.** La leyenda es la mitigación que la ficha nombra. |
| `politica-portales-plazos.yaml` | no (`sin_verificar`, jerarquía 6, a propósito) | `facturacion/comercios.ts` (4 de 91 con `plazoVerificado: true`), `engine.ts:695-768`, `pendientes.ts:182-186`, `fiscal.ts:264-269` | **Sí en `engine.ts`** (las dos ramas dicen que el plazo legal es el ejercicio). **NO en `fiscal.ts`**: nivel 6 elevado a pérdida definitiva con cita de nivel 1. |
| `rmf-2026-2.7.1.48.yaml` | no (`evidencia_corroborante`, `fecha_vigencia_desde: null`) | `config.ts:104` (`vigenteDesde`, solo filtro de ruido), `indice.ts:306` (`exigibleDesde: null`), `engine.ts:511-581` | **Sí, y es el mejor trabajo del rubro.** Con `exigibleDesde` nulo el motor emite `complemento_no_verificable` (revisión) y nunca "no deducible". El interruptor vive en la ficha. |
| `rmf-2026-2.7.1.21.yaml` | no (`evidencia_corroborante`, `texto_vigente: null`) | `por_diferencia.ts:57` (`factura_por_vencer`) | **No verificable en esta ronda.** Solo habilita una cita al agente; no decide dinero. |
| `rfa-2026-2.2.yaml` (8% "gasto ciego") | **sí** | `usado_en_codigo: []` — no implementada | N/A. Su `advertencia` ("NO cubre combustible") no está contradicha por ningún código; sí conviene vigilar el material comercial. |
| `lft-110-111-263.yaml` | **sí** | `laboral/pagadero.ts`, `pdf.ts:376-399` | Fuera de mi rubro (laboral). Revisado de paso: la sección "lo que se le reembolsa al operador" existe y usa `cubetaDe`, no una copia. |
| `lfpdppp-*.yaml` (4 fichas) | **sí** | `privacidad.ts`, `arco`, `repo.ts registrarSolicitudArco` | Fuera de mi rubro (legal). |
| **RMF 9.1.8** | **NO EXISTE FICHA** | `peajes/vista.tsx:144-161`, `peajes/page.tsx:30` | **No.** El producto imprime cinco requisitos y un encabezado fundados en una regla que `normas/` no conoce y que `normas/indice.ts` no puede citar. |

---

## Lo que revisé y está bien

- **La proporcionalidad de LIVA 5-I** (`engine.ts:1010-1026`) y su orden: el
  bloque de acreditamiento corre **después** del tope de alimentación, con el
  comentario que explica por qué (`:974-978`). El reparto es por proporción del
  día y solo entre timbrados (`:931-936`) — nunca negativo, nunca dependiente del
  orden del arreglo.
- **El tope de $750 de LISR 28-V**: por día, por beneficiario, solo alimentación,
  con H1 (soporte de hospedaje/transporte, `:772-835`) y H2 (tarjeta de crédito
  cuando solo hay transporte, `:837-869`) implementados como **aviso** y no como
  veredicto, que es lo que la ficha admite.
- **EFOS**: `intake/sat.ts:66-85` nunca afirma `efos: true` desde el
  `ConsultaCFDIService` porque el servicio no distingue presunto de definitivo —
  lectura literalmente correcta del 1er vs 4º párrafo del 69-B.
- **El complemento de hidrocarburos**: el interruptor del veredicto duro es
  `fecha_vigencia_desde` de la ficha, espejado en `indice.ts` y atado por
  `normas_sincronizadas.test.ts`. Mientras sea `null`, el motor avisa y no tira la
  deducción. Es el patrón que el resto del rubro debería copiar.
- **RLISR 57**: el viático a nombre del operador subordinado ya no se rechaza;
  con `operadorRfc` ausente va a revisión, no a "no deducible" (`engine.ts:479-498`,
  mig. `0080`).
- **El estímulo de peaje en el PDF y en WhatsApp**: `acreditable.ts:44-121` y
  `resumen.ts:96` dicen "sujeto a elegibilidad", nombran las cuatro condiciones y
  declaran la base usada. Es el modelo del que la card de peajes se apartó.
- **`por_diferencia.ts`**: el inventario de qué norma fundamenta qué diferencia,
  con `SIN_NORMA` explícito para lo que es política interna o calidad del dato —
  y `rfc_receptor_no_verificable` correctamente sin norma, para no fingir un
  veredicto legal sobre un problema de captura.
- **El acumulado del 15% es del EJERCICIO** (`repo.ts:938-939`), con fail-closed
  si la paginación no prueba haber leído todo (`:962-968`), y anclado al año de los
  **comprobantes**, no del proceso (`desde_db.ts:63-65`).
- **Los litros del estímulo se cotejan** contra `monto ÷ precio de referencia` con
  tolerancia 0.5×–2× (`engine.ts:1057-1076`): un decimal corrido ya no acredita
  cien veces.
- `config.ts:108` `efectivoTopeMxn: 2000` con comparación estricta `>` — coincide
  con "los pagos cuyo monto **exceda** de $2,000.00".
- `clavesDieselIeps: ['15101505']` — solo diésel, la gasolina fuera, tal como
  `LIF 20-A fr. IV` y `etiquetaConcepto` (`engine.ts:1191-1198`) para que un
  ticket de PLUS no diga "Diésel".

## Lo que NO alcancé a revisar

- **El contenido real de RMF 9.1.8, 9.1.6 y 9.1.7.** No hay ficha y no puedo
  bajar el DOF desde aquí. Todo lo que el producto afirma sobre el estímulo de
  peaje a nivel de regla general es, en esta ronda, **no verificable**.
- **Si existen filas con `liquidacion.ieps_acreditable > 0`** en la base real.
  Sin acceso a Supabase solo puedo probar que el camino de render existe y que la
  única fórmula que produce ese valor es la repudiada.
- **`facturacion/adaptadores/capufe.ts`** (1,282 líneas) y `al_vuelo.ts` (669):
  revisé `revisarReceptor` y el ruteo de datos fiscales, no la emisión completa
  ni qué CFDI queda timbrado (uso, forma de pago, método) al automatizar el
  portal. Es superficie fiscal grande sin auditar.
- **`intake/cfdi_xml.ts`**: no verifiqué qué nodos se parsean del CFDI 4.0 más
  allá de lo que `diagnosticoRetencion` declara ausente (retenciones). El IVA
  acreditable sale de ahí, y no leí el parser.
- **Retenciones del 4% de IVA por autotransporte** — `fiscal.ts:686-701` las
  declara no calculables con nombre de columna y de nodo XML; no busqué si algún
  otro módulo las insinúa.
- **Las fichas `sin_verificar` / `evidencia_corroborante`** (`cff-29-A`,
  `rmf-2026-2.7.1.21`, `criterio-1-CFF-PI`, `criterio-1-LIF-PI`,
  `politica-portales-plazos`, `lisr-27-III`) quedan **no verificables en esta
  ronda**: no asumo que estén bien ni que estén mal, solo señalo dónde sostienen
  una afirmación que el producto imprime.
