# Cumplimiento fiscal — auditoría 17 (pase 2)

**Nota: 5/10** (antes 4). Razón del movimiento: **el código cambió, y en las dos
direcciones a la vez.** Se cerró de verdad el CRÍTICO C3 (el régimen `624`
Coordinados existe hoy en `administracion.ts:128`, en el selector y en el CHECK
de la migración `0088`), y la mitad del ALTO del peaje se cerró por supresión (las
tarjetas "Peaje (50%) · LIF 2026 20-A" e "IVA acreditable" ya **no** están en
`/dashboard`). Contra eso, el rework del dashboard —el foco de este pase—
**introdujo dos ALTOS nuevos en la pantalla de aterrizaje del contralor**, y
ninguno de los 7 reincidentes del pase 1 se tocó. Un CRÍTICO menos sube la nota
un punto; dos ALTOS nuevos en la superficie más vista se lo comen casi entero.

**Riesgo mayor del rubro, hoy:** el panel del dueño ascendió cifras fiscales a
KPI sin ascender sus matices — la misma pantalla que estrena "Ahorro generado"
en pesos es la que en otra página del mismo producto declara por escrito que
llamarle "ahorro" a eso sería contar como ganado algo que todavía no se cobra.

**Respuesta a la pregunta dura del pase 2:** *no* hay una segunda implementación.
`getGastosFiscalesSeries` (`fiscal.ts:829-849`) llama tres veces a
`getGastosFiscales` y `page.tsx:141-143` corre el mismo `resumirPerdidas` sobre
cada ventana; `analytics.ts` +454 no agregó **ninguna** consulta fiscal (todo lo
nuevo es gasto/viaje/liquidación por semana, mes y ruta). Y `getAcreditables`
sigue leyendo las columnas que **escribió el motor**, no recalculando. Lo que sí
apareció con el periodo es peor que una segunda implementación: es la **misma**
implementación presentada sin su letra chica.

---

## Estado de los hallazgos del pase 1

| # (pase 1) | Sev. | Estado hoy | Evidencia |
|---|---|---|---|
| Régimen `601` abre la facilidad; `624` no existe | CRÍTICO | **CERRADO** | `administracion.ts:128` → `['624','612']`; `admin/flotas/page.tsx:223` → `<option value="624">`; `0088_regimen_624_coordinados.sql:36` mete `'624'` al CHECK |
| El 15% contra "lo que Likida vio" | CRÍTICO | **ABIERTO — REINCIDENTE** | `engine.ts:337,354` y `repo.ts:831-834` idénticos |
| "Ya no se recupera" por plazo de nivel 6, fundado en LISR 27-III | ALTO | **ABIERTO — REINCIDENTE, superficie nueva** | `fiscal.ts:243-248` idéntico; ahora además alimenta el KPI del dueño |
| Peaje en pesos sin las 4 condiciones | ALTO | **PARCIAL** — `/dashboard` cerrado por supresión, `/dashboard/facturacion:98` abierto | ver hallazgo A4 |
| Combustible en efectivo no acredita IVA sin ficha | ALTO | **ABIERTO — REINCIDENTE** | `engine.ts:985` y `fiscal.ts:515` idénticos |
| `causasDe` no conoce `no_encontrado`/`pendiente` | MEDIO | **ABIERTO — REINCIDENTE, superficie nueva** | `fiscal.ts:321-328`; `grep no_encontrado fiscal.ts` → solo la línea 509 |
| `efectivo_no_elegible` fuera de `ORDEN` | MEDIO | **ABIERTO — REINCIDENTE (3ª)** | `fiscal.ts:354-357` idéntico |
| Píldora/gauge del 15% sin `elegible15` | MEDIO | **ABIERTO — REINCIDENTE (3ª)** | `contador/combustible/page.tsx:134` idéntico |
| Gasto sin fecha contra el contador del 15% | MEDIO | **ABIERTO — REINCIDENTE (3ª)** | `engine.ts:312-313` idéntico |
| `tools.ts` cuenta el 15% sin las claves del SAT | MEDIO | **ABIERTO — REINCIDENTE (4ª)** | `tools.ts:110` sigue sin tercer argumento |
| Base del peaje afirmada como resuelta | MEDIO | **ABIERTO — REINCIDENTE** | `contador/combustible/page.tsx:227-230` idéntico |
| Leyenda del CFF 89 ausente en el panel del contador | MEDIO | **ABIERTO — REINCIDENTE** | `grep -rln "LEYENDA\|criterios que dé a conocer" src/app/dashboard/contador/` → **cero archivos** |
| `avisoTope15` afirma efectivo sin mirarlo | BAJO | **ABIERTO — REINCIDENTE** | `periodo/aviso.ts:32-33` idéntico |
| `continue` del fail-closed se lleva otras notas | BAJO | **ABIERTO — REINCIDENTE** | `engine.ts:324` idéntico |

Compuerta corrida por mí: `npx vitest run src/lib/likida/fiscal.test.ts
src/lib/likida/fiscal_series.test.ts src/app/dashboard/estado.test.ts` → 79/79
verdes. Ninguna de esas 79 pruebas compara una cifra del panel contra la cifra
que el motor imprime para el mismo comprobante — que es exactamente el hueco
por donde entran los dos ALTOS nuevos.

---

## Hallazgos

### [CRÍTICO · REINCIDENTE] El 15% se sigue midiendo contra "el combustible que Likida vio", no contra el total de pagos por consumo de combustible del ejercicio

`src/lib/likida/cuadre/engine.ts:337,354` · `src/lib/likida/repo.ts:831-834` ·
ficha `normas/rfa-2026-2.9.yaml` (`verificado_fuente_primaria`: **sí**, DOF/SIDOF 5780249)

> "…siempre que estos no excedan el 15 por ciento **del total de los pagos
> efectuados por consumo de combustible para realizar su actividad**."
> — `rfa-2026-2.9.yaml:16-17`, `texto_vigente`

Código, literal (`engine.ts:337` y la frase que se imprime, `engine.ts:354`):

```
        const tope = 0.15 * total;
        … `el ejercicio lleva ${mxn(acumulado)} de combustible en efectivo contra un tope de ${mxn(tope)} (15% de ${mxn(total)}); el excedente de ${mxn(excedenteDeEste)} de ESTE comprobante NO se deduce (RFA 2026 regla 2.9).`
```

y el único productor de `total` (`repo.ts:831-834`):

```
      .or(claves?.length ? `concepto.eq.diesel,clave_prod_serv.in.(${claves.join(',')})` : 'concepto.eq.diesel')
      .gte('fecha', `${ejercicio}-01-01`)
      .lte('fecha', `${ejercicio}-12-31`)
```

`gasto` es solo lo que los operadores mandaron por WhatsApp; el propio producto
lo dice en `contador/comun.tsx:177-179` ("No es la contabilidad completa de la
flota"). El motor lo usa como si fuera el universo.

**Escenario:** flota elegible (624 + dedicación exclusiva), ejercicio 2026.
Carga $1,200,000 de diésel en su terminal con factura directa a la cuenta de la
empresa — nunca pasa por el teléfono. Por WhatsApp llegan $80,000 de cargas de
carretera, de los cuales **$30,000 en efectivo**.
- Motor: `total = 80,000` → `tope = $12,000`; acumulado $30,000 →
  `excedenteDeEste` se reparte por `proporcionDeducible` (`engine.ts:343`) y
  **$18,000 salen a `totalNoDeducible`**. El PDF imprime **"No deducible
  $18,000.00"** en rojo con la frase "…contra un tope de $12,000.00 (15% de
  $80,000.00) … NO se deduce (RFA 2026 regla 2.9)".
- Norma: el total de pagos por consumo de combustible del ejercicio es
  **$1,280,000**; el 15% son **$192,000**; los $30,000 en efectivo son el
  **2.34%**. Lo correcto es **$0.00 no deducible**.

Sale **$18,000** en rojo donde la norma da **$0**, con la regla citada al lado.

**Consecuencia / causa raíz.** El contralor archiva una pérdida de deducción que
no existe, y el rótulo "15% de $80,000" es falso como afirmación sobre el
ejercicio de su flota. Causa raíz: el denominador se construyó sobre la única
tabla que el producto tiene y ningún renglón acota la afirmación a ese alcance —
es decisión de producto (¿se pide el total del ejercicio al contralor?), no un
bug de aritmética.

---

### [ALTO · NUEVO en el pase 2] "Ahorro generado — Ejercicio 2026" imprime en pesos el **monto bruto del gasto**, no un ahorro — y el mismo producto tiene escrito por qué eso no se hace

`src/app/dashboard/page.tsx:272-274` · `src/lib/likida/fiscal.ts:420` ·
contraste literal: `src/app/dashboard/valor-ahorro/page.tsx:109-112` y
`src/app/dashboard/contador/deducciones/page.tsx:104` ·
sin ficha en `normas/` que sostenga una tasa de ISR (`verificado_fuente_primaria`: **n/a — no hay ficha**)

Regla del producto (`CLAUDE.md`, "Un rótulo tiene que ser verdad") y regla que
el propio código escribió, literal (`valor-ahorro/page.tsx:109-112`):

> "Esto es dinero **señalado**, no recuperado: el motor lo marca y tú decides.
> Presentarlo como **&quot;ahorro&quot;** sería contar como ganado algo que todavía no
> se cobra."

Código nuevo, literal (`page.tsx:272-274`, commit `44ade83`):

```
                    <KpiDegradado icono={<PiggyBank width={17} height={17} strokeWidth={1.75} />}
                      etiqueta={`Ahorro generado — ${periodoFiscal.etiqueta}`}
                      valor={resumenPerdidas?.montoRecuperable ?? 0} formato="mxn" />
```

Qué es `montoRecuperable` (`fiscal.ts:420`): `else montoRecuperable +=
f.gasto.monto;` — la suma del **monto bruto** (IVA incluido — el mismo campo `monto` que `fiscal.ts:461` describe como "lo
que salió de la caja, no la base gravable") de los comprobantes
cuya causa dominante es `sin_cfdi`, cuyo título es "**Sin CFDI todavía**"
(`fiscal.ts:285-290`). La página hermana rotula ese mismo número "Dinero que ya
salió de la caja y **no va a bajar la base gravable**"
(`deducciones/page.tsx:104`).

**Escenario:** flota con 62 tickets de diésel y casetas sin CFDI en el ejercicio
2026, por **$250,000** brutos, todos con plazo de facturación abierto.
- Panel del dueño: tarjeta con degradado de marca y alcancía — **"Ahorro
  generado — Ejercicio 2026: $250,000.00"**.
- Lo que hay: una deducción **pendiente de $250,000** que todavía hay que ir a
  pedir. Ni un peso ahorrado: nadie timbró nada. Y aun cobrada entera, una
  deducción baja la **base**, no el impuesto: el efecto en caja sería del orden
  de $75,000 de ISR (30% PM) + $34,483 de IVA acreditable ≈ **$109,500** —
  menos de la mitad de lo impreso. *(La tasa del 30% la doy como orden de
  magnitud declarado: **no hay ficha de LISR 9 en `normas/`**, así que no la
  cito como norma. El hallazgo no depende de ella: aunque la tasa fuera otra,
  $250,000 de gasto bruto nunca es el ahorro de deducir $250,000.)*

`KpiDegradado` (`resumen-visual.tsx:95-134`) **no tiene ranura para `nota`**: la
cifra sale sin un solo qualifier. Y `?? 0` es alcanzable: `estadoPanel`
(`estado.ts:30`) solo mira `acreditables/kpis/liquidaciones/anomalias`, así que
si únicamente `getConfig` o `getGastosFiscales` truena, el panel se queda en
estado `datos` e imprime **"Ahorro generado $0.00"** — un cero que parece
medición, justo lo que `MotorFiscalPeriodo:39-41` sí evita ("No se pudo leer el
motor fiscal en este momento").

**Consecuencia / causa raíz.** Es la primera cifra en pesos que ve el contralor
al entrar, y la que el guion de demo va a leer en voz alta. Causa raíz: el KPI
se cableó al campo que ya existía (`montoRecuperable`) y se le puso el nombre
que el pedido usaba ("Ahorro generado"), sin pasar por la única función que
sabía nombrarlo. **No lo marco CRÍTICO** porque la cifra es una medición real de
gasto recuperable; lo falso es el sustantivo.

---

### [ALTO · NUEVO en el pase 2] La tarjeta "En riesgo / perdido" cuenta en rojo el combustible en efectivo que el motor ya declaró **deducible** dentro del 15% — y lo hace sobre una ventana de 7 días para una regla que la norma ancla al ejercicio

`src/app/dashboard/motor-fiscal-periodo.tsx:60-63` · `src/lib/likida/fiscal.ts:273-278,339,419` ·
contraste: `src/lib/likida/cuadre/engine.ts:344-350` ·
ficha `normas/rfa-2026-2.9.yaml` (`verificado_fuente_primaria`: **sí**)

> "…siempre que estos no excedan el 15 por ciento del total de los pagos
> efectuados por consumo de combustible **para realizar su actividad**."
> — `rfa-2026-2.9.yaml:16-17`. Y `condiciones_de_aplicacion` (línea 35), literal:
> "El efectivo no puede exceder el 15% del total pagado por combustible **en el
> ejercicio**".

Código nuevo, literal (`motor-fiscal-periodo.tsx:60-63`):

```
        <div className="text-xl font-semibold tracking-tight tabular mt-1" style={{ color: 'var(--color-bad)' }}>
          {mxn(r.montoEnRiesgo + r.montoPerdido)}
        </div>
        <div className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>{ETIQUETA_MODO[modo]}</div>
```

con `ETIQUETA_MODO.semanal = 'últimos 7 días'` (`:12`) y `modoIdx = 0` por
defecto (`:36`). El sumando `montoEnRiesgo` recibe **el 100% del monto** de todo
diésel en efectivo (`fiscal.ts:339` → `combustible_efectivo`, gravedad
`en_riesgo`, `fiscal.ts:273-278` → `fiscal.ts:419`), y **`causasDe` nunca
consulta el tope**: `grep -n "evaluarTope15\|tope15" fiscal.ts` no aparece en
ninguna parte de `causasDe`/`resumirPerdidas`.

**Escenario:** flota elegible (624 + dedicación exclusiva). Ejercicio 2026:
$200,000 de combustible, de los cuales **$12,000 en efectivo (6%)** — holgado.
En los últimos 7 días llegan **3 tickets de diésel en efectivo con CFDI por
$8,000** en total.
- Motor / PDF (`engine.ts:344-350`): `combustible_efectivo_dentro15`, `monto: 0`,
  y la nota impresa **"deducible por la facilidad del 15% (RFA 2026 regla 2.9):
  el ejercicio lleva $12,000.00 de $200,000.00 de combustible en efectivo (6%
  del total, tope 15%)"**. Los $8,000 entran íntegros a `totalDeducible`.
- Panel del dueño, al abrir: **"En riesgo / perdido · $8,000.00 · últimos 7
  días"** en `var(--color-bad)`.

$8,000 en rojo sobre pesos que el PDF de los mismos viajes imprimió como
deducibles. Agravante de forma: la tarjeta **funde** `montoPerdido` y
`montoEnRiesgo` en un solo número rojo, cuando `Gravedad` (`fiscal.ts:225-231`)
los define como cosas distintas ("El dinero ya no se recupera" vs "Depende de
algo que todavía puede moverse") y `/dashboard/contador/deducciones:126-136` los
pinta **separados y en colores distintos** (`--bad` vs `--warn`). Un CFDI
cancelado y un diésel en efectivo al 6% del tope se leen idénticos.

**Consecuencia / causa raíz.** El contralor que cruce el panel contra el PDF ve
al producto contradecirse sobre los mismos pesos, y el error va del lado que
*sí* revisa (dice que pierde dinero que no pierde). Causa raíz: `resumirPerdidas`
se diseñó para una pantalla que enseña las tres cubetas con su detalle y su
`detalle` normativo al lado ("Cuenta contra el 15% del combustible del
ejercicio", `fiscal.ts:277`); el KPI nuevo consume solo los tres escalares y tira
título, detalle, norma y la separación entre gravedades.

---

### [ALTO · REINCIDENTE, ahora también en el panel del dueño] "Ya no se recupera $X" por un plazo de **nivel 6** fundado en **LISR 27-III**

`src/lib/likida/fiscal.ts:243-248,326,418` · `src/app/dashboard/contador/deducciones/page.tsx:126-127` ·
`src/lib/likida/fiscal.ts:960,990` (columna `fundamento` del export) ·
`src/app/dashboard/motor-fiscal-periodo.tsx:61` (nuevo consumidor) ·
ficha `normas/politica-portales-plazos.yaml` (`verificado_fuente_primaria`: **NO** — `sin_verificar`, `jerarquia: 6`)

> "**ESTO NO ES UNA NORMA FISCAL.** Es la política interna de un tercero y tiene
> CERO fuerza legal. El plazo LEGAL para pedir factura es todo el ejercicio (el
> SAT lo dice expresamente), y negarla porque 'ya pasó el mes' es una práctica
> indebida listada por el propio SAT… **El producto NUNCA debe presentar estos
> plazos como una obligación fiscal.**"
> — `politica-portales-plazos.yaml`, `advertencia_de_jerarquia`

Código, literal (`fiscal.ts:243-248`):

```
  plazo_vencido: {
    gravedad: 'perdida',
    titulo: 'Plazo de facturación vencido',
    norma: 'LISR 27-III',
    detalle: 'El comercio ya no acepta timbrarlo. Sin CFDI no ampara deducción y el IVA no se acredita.',
  },
```

**Escenario:** ticket de diésel de **$4,800** del **3-jul-2026**, sin CFDI,
comercio con `plazo: 'mes_natural'` y `plazoVerificado: false`. Hoy 9-ago-2026 →
`plazoVencido: true`.
- `/dashboard/contador/deducciones`: **"Ya no se recupera $4,800.00"** en
  `var(--bad)`, causa "Plazo de facturación vencido", fundamento **"LISR
  27-III"** — artículo de nivel 1 que habla de medio de pago y comprobante y
  **no dice una palabra de plazos de facturación**. El fundamento viaja además a
  la columna `fundamento` del CSV (`fiscal.ts:960,990` — `fundamento: dominante ? dominante.norma : ''`).
- **Nuevo en este pase:** ese mismo `montoPerdido` entra al KPI del dueño
  (`motor-fiscal-periodo.tsx:61`), así que ahora la afirmación aparece también
  en la pantalla de aterrizaje, sin causa ni fundamento visibles.
- El PDF del **mismo ticket** dice lo contrario (`engine.ts:749`): *"…pero
  legalmente puedes exigirlo dentro del ejercicio (Conciliación de Factura del
  SAT)"*.

**Consecuencia / causa raíz.** El contador da por perdidos $4,800 (y su IVA) que
recupera con una llamada. Causa raíz: el arreglo de jerarquía se aplicó al motor
y nunca se propagó a `fiscal.ts`; el pase 2 amplió el radio del error sin tocar
la línea.

---

### [ALTO · REINCIDENTE PARCIAL] El estímulo de peaje se sigue imprimiendo en pesos, sin ninguna de las cuatro condiciones, en `/dashboard/facturacion`

`src/app/dashboard/facturacion/page.tsx:96-98` · contraste `src/lib/likida/liquidacion/acreditable.ts:110-119` ·
ficha `normas/lif-2026-20-A.yaml` (`verificado_fuente_primaria`: **sí**)

> "Se otorga un estímulo fiscal a las personas contribuyentes que se dediquen
> **exclusivamente** al transporte terrestre público y privado, de carga o
> pasaje… que utilizan la **Red Nacional de Autopistas de Cuota**, que obtengan
> en el ejercicio fiscal… **ingresos totales anuales… menores a 300 millones de
> pesos**… El estímulo **no podrá ser aplicable por las personas morales que se
> consideran partes relacionadas** de acuerdo con el artículo 179…"
> — `lif-2026-20-A.yaml:39-51`, `estimulo_peaje.texto_vigente`

Y sus hallazgos propios, literales (`:69-80`):
> H5 · que_hace_el_motor: "**Aplica el 50% a TODO gasto con concepto 'caseta'.**"
> H6 · que_hace_el_motor: "**No conoce los ingresos de la flota ni su relación de
> partes.** El estímulo se aplica sin verificar si el cliente califica."

Código, literal (`facturacion/page.tsx:98`):
```
                etiqueta="Peaje acreditable (50%)" valor={acred.peaje} formato="mxn" nota="LIF 2026, Art. 20-A" />
```
Además `getAcreditables(tenantId)` se llama **sin ventana** (`:35`), y
`corteVentana(undefined)` devuelve `null` (`analytics.ts:43`): la cifra es de
todo el histórico, bajo un encabezado que no declara periodo.

**Escenario:** flota con **$420M** de ingresos anuales. Histórico de casetas:
$50,000 de SubTotal → `peajeAcreditable = 50,000 × 0.5 = $25,000` (`engine.ts:1028`).
La pantalla imprime **"Peaje acreditable (50%) $25,000.00 · LIF 2026, Art.
20-A"**. El estímulo real de esa flota es **$0.00**: supera los $300M. El PDF de
las mismas liquidaciones sí lleva "— sujeto a elegibilidad", tono `condicionado`
y los dos pies `BASE_ESTIMULO_PEAJE` / `CONDICIONES_ESTIMULO_PEAJE`
(`acreditable.ts:115-118`), que enumeran las cuatro.

**Progreso real:** `/dashboard/page.tsx` **ya no** tiene ese renglón — el rework
retiró las tarjetas de peaje e IVA en pesos y dejó solo litros de diésel
(`page.tsx:304-309`). Queda una sola superficie abierta.

**Consecuencia / causa raíz.** Una cifra en pesos con artículo citado al lado es
una afirmación; `normas/criterio-1-CFF-PI.yaml` recuerda que la fracción de
cierre alcanza a quien "PRESTE SERVICIOS" — es exposición de Likida. Causa raíz:
`analytics.acreditables()` entrega `peaje` como número crudo y cada pantalla
decide su copy; el renglón condicionado vive en `acreditable.ts`, que solo
consume el PDF.

---

### [ALTO · REINCIDENTE] El combustible en efectivo dentro del 15% no acredita **IVA**, y la ficha que se invoca excluye el **IEPS**, no el IVA

`src/lib/likida/cuadre/engine.ts:985,1003` · `src/lib/likida/fiscal.ts:512-515` ·
fichas `normas/liva-5.yaml` y `normas/rfa-2026-2.9.yaml` (ambas `verificado_fuente_primaria`: **sí**)

> "…se consideran estrictamente indispensables **las erogaciones efectuadas por
> el contribuyente que sean deducibles para los fines del impuesto sobre la
> renta**, aun cuando no se esté obligado al pago de este último impuesto."
> — `liva-5.yaml`, art. 5 fr. I

> "Conserva la **DEDUCCIÓN para ISR**. NO habilita el acreditamiento **del
> IEPS**: son dos beneficios distintos y el efectivo solo salva uno."
> — `rfa-2026-2.9.yaml:37-39`, `limite_importante`

Código, literal (`engine.ts:985`, la lista, y `:1003`, el salto):
```
  const SIN_ACREDITAMIENTO: TipoDiferencia[] = [… 'combustible_efectivo', 'combustible_efectivo_dentro15', 'efectivo_sobre_15', 'efectivo_no_elegible', …];
  …
    if (diferencias.some((d) => d.gastoId === g.id && SIN_ACREDITAMIENTO.includes(d.tipo))) continue;
```
El `continue` salta el gasto entero, incluida la línea de IVA (`engine.ts:1027`).
`fiscal.ts:515` repite la exclusión en el panel con este comentario: *"el
combustible en EFECTIVO no acredita IVA — la facilidad del 15% (RFA 2.9) solo
salva la deducción de ISR"*. La ficha dice **IEPS**.

**Escenario:** CFDI de diésel de **$5,800** (SubTotal $5,000, IVA trasladado
$800), pagado en efectivo, XML verificado, flota elegible, dentro del 15%. El
motor emite `combustible_efectivo_dentro15`, el gasto entra a `totalDeducible`
por $5,800 (correcto) y `ivaAcreditable` recibe **$0.00**. Por LIVA 5-I (la
erogación es deducible para ISR gracias a la RFA 2.9) + fr. III (IVA trasladado
expresamente y por separado) serían **$800.00** acreditables. El PDF no imprime
el renglón "IVA acreditable (LIVA art. 5)" para ese comprobante y el panel lo
suma a `ivaNoAcreditable` (`fiscal.ts:536`).

**Consecuencia / causa raíz.** Al cliente le faltan $800 de IVA acreditable por
CFDI en el papel que Likida le entrega. El error va a la baja (menos riesgo ante
el SAT, más dinero perdido para el cliente), pero **niega** un acreditamiento
citando una restricción que ninguna ficha contiene. Causa raíz:
`SIN_ACREDITAMIENTO` es una sola dimensión ("no acredita nada") para dos
impuestos con requisitos distintos.

---

### [MEDIO · REINCIDENTE, ahora en el KPI del dueño] "El SAT no reconoce este CFDI" sigue sin llegar a `causasDe` — y ahora tampoco al panel del dueño

`src/lib/likida/fiscal.ts:314-344` · contraste `src/lib/likida/cuadre/engine.ts:100-101,985` ·
`src/lib/likida/intake/sat.ts:18` (`EstadoSat = 'vigente' | 'cancelado' | 'no_encontrado' | 'pendiente'`) ·
ficha `normas/cff-29-A.yaml` (`verificado_fuente_primaria`: **no** — `texto_vigente: null`)

Código, literal (`fiscal.ts:321-328`):
```
  if (g.estadoSat === 'cancelado') push('cfdi_cancelado');

  if (!g.cfdiUuid) {
    if (g.plazoVencido === true) push('plazo_vencido');
    else push('sin_cfdi');
  }
```
`grep -n "no_encontrado" src/lib/likida/fiscal.ts` devuelve **una sola línea, la
509** (`ivaSostenible`). `causasDe` no tiene rama.

**Escenario:** gasto de **$11,600** con UUID que el SAT devuelve *no encontrado*,
pagado por transferencia.
- Motor / PDF: `cfdi_no_encontrado` → **no deducible** → "No deducible
  $11,600.00" en rojo (`engine.ts:502`).
- `/dashboard/contador/deducciones`: `causasDe` → `[]`, la fila no entra a
  `resumirPerdidas`; si es el único marcado, la pantalla imprime "Ningún
  comprobante del periodo tiene una observación fiscal"
  (`deducciones/page.tsx:120-122`) y **$0.00** en las tres cubetas.
- **Nuevo:** la tarjeta "En riesgo / perdido" del dueño también da **$0.00**
  sobre los mismos $11,600 que el PDF declara perdidos.

Igual con `'pendiente'`. **Consecuencia:** dos pantallas dicen que no hay nada
perdido sobre el peso que el PDF ya dio por perdido.

---

### [MEDIO · REINCIDENTE (3ª ronda)] `efectivo_no_elegible` sigue fuera de `ORDEN`

`src/lib/likida/fiscal.ts:354-357,429-440`

```
const ORDEN: CausaPerdida[] = [
  'efos', 'cfdi_cancelado', 'plazo_vencido', 'efectivo_sobre_tope',
  'efos_indeterminado', 'combustible_efectivo', 'sin_cfdi',
];
```
`'efectivo_no_elegible'` está en `CausaPerdida` (`:221`), en `TITULOS` (`:279`) y
en `causasDe` (`:338`) — no aquí.

**Escenario:** flota con `elegible15 = false`, diésel en efectivo de **$1,000**
**sin** CFDI → `causasDe` da `[sin_cfdi, efectivo_no_elegible]`; `causaDominante`
recorre `ORDEN`, encuentra `sin_cfdi` y devuelve esa → **$1,000 a
`montoRecuperable`**, "Se recupera pidiendo la factura", y **$1,000 se suman a
"Ahorro generado"** en el panel del dueño. Falso: aun timbrado, el efectivo en
combustible de una flota que no califica no deduce (es lo que el propio
`TITULOS.efectivo_no_elegible` dice, `fiscal.ts:279-284`). Con CFDI la dominante
sí es `efectivo_no_elegible` → $1,000 en "perdido" pero **`porCausa = []`**: el
desglose por causa desaparece y la suma por causa no cuadra con el total.

---

### [MEDIO · REINCIDENTE (3ª ronda)] La píldora y el gauge del 15% dicen "Holgado / Excedido" a flotas a las que la facilidad no aplica

`src/app/dashboard/contador/combustible/page.tsx:134` · `src/lib/likida/fiscal.ts:611-619`
(`tope15DeGastos` no recibe ni lee `o.elegible15`)

```
                accion={<StatusPill estado={ESTADO_TOPE[tope.estado].estado}>{ESTADO_TOPE[tope.estado].texto}</StatusPill>}
```

**Escenario:** flota con `elegible15 = false`, $500 de diésel en efectivo sobre
$10,000 de combustible del periodo → `evaluarTope15` → `'holgado'` → píldora
**verde "Holgado"** y gauge al 5%, justo encima del texto que dice "La flota
declaró que NO califica… el combustible en efectivo no es deducible"
(`:155-159`). La píldora se lee primero.

---

### [MEDIO · REINCIDENTE (3ª ronda)] Un gasto de combustible **sin fecha** corre contra un contador del 15% cuyo denominador lo excluye

`src/lib/likida/cuadre/engine.ts:312-313` · `src/lib/likida/cuadre/desde_db.ts:87` ·
`src/lib/likida/repo.ts:832-833`

```
        const anioComprobante = g.fecha ? g.fecha.slice(0, 4) : null;
        const mismoEjercicio = !anioComprobante || anioComprobante === input.anioEjercicio;
```
Un gasto sin fecha se declara "del mismo ejercicio" por construcción, pero
`repo.ts:832-833` filtra `.gte('fecha', …)/.lte('fecha', …)` y nunca lo incluyó.

**Escenario (ejercicio 2026):** la consulta trae `efectivo = 14,300` y
`totalCombustible = 99,000`. Este viaje trae además un diésel en efectivo de
**$1,000 sin fecha** (el OCR no la leyó). `efectivoDeEsteViaje = 500 + 1,000 =
1,500` → `prev = 12,800` (se resta un monto que la consulta nunca sumó) →
acumulado $14,300 contra `tope = $14,850` → **cero exceso impreso**. El efectivo
real del ejercicio es $15,300 contra un tope real de $15,000 (el sin-fecha
también es base): el exceso verdadero es **$300** y el PDF imprimió **$0**.

---

### [MEDIO · REINCIDENTE (4ª ronda)] El chat cuenta el 15% con `concepto='diesel'` a secas

`src/lib/likida/tools.ts:110` (`await getAcumuladoCombustible(ctx.tenantId, ejercicio)` — **sin** el tercer argumento) ·
`src/lib/likida/repo.ts:831` (sin `claves` cae a `concepto.eq.diesel`) ·
contraste `src/lib/likida/cuadre/desde_db.ts:78` (mismo llamado **con** `clavesCombustible`)

**Escenario:** el CFDI de diésel llega después de la foto;
`repo.updateGastoCfdiXml` escribe `clave_prod_serv = '15101505'` pero **no**
reescribe `concepto` (queda `otro`/`factura`). Motor y `desde_db` lo cuentan en
el 15% por clave; el aviso del chat no. Con $8,000 de diésel-por-clave fuera del
conteo del chat sobre $60,000 del ejercicio, WhatsApp dice "vas en 8%" el mismo
día en que la liquidación imprime "el excedente NO se deduce". Además,
`0084_sumar_combustible_ejercicio.sql` sigue sin invocarse desde producción
(`grep -rn "sumar_combustible_ejercicio" src/` → solo
`migraciones_verificadas.test.ts:56`).

---

### [MEDIO · REINCIDENTE] El panel afirma como resuelto lo que la ficha marca `SIN RESOLVER`: "el estímulo es el 50% del gasto en peaje **sin IVA**"

`src/app/dashboard/contador/combustible/page.tsx:227-230` ·
ficha `normas/lif-2026-20-A.yaml`, hallazgo **H4** (`severidad: alta`, `estado: SIN RESOLVER`)

> "…hasta en un 50 por ciento **del gasto total erogado** por este concepto."
> — `lif-2026-20-A.yaml:46`
> H4 · `por_que_importa`: "…CONFLICTO: usar el total podría duplicar el beneficio
> del IVA… **Esta es una pregunta para un contador, NO para resolverse sola.**"

```
                    El estímulo es el 50% del gasto en peaje sin IVA (LIF 2026 20-A, para ingresos bajo $300M). La
                    base es el SubTotal, no el total: aplicar el 50% al total incluiría el IVA…
```
**Escenario:** $50,000 de SubTotal de casetas. El panel afirma sin matiz que la
base del estímulo es $50,000 → $25,000. Con la base literal de la ley ($58,000
erogados) serían $29,000: **$4,000 de diferencia** presentados como si no hubiera
discusión. El PDF, para la misma cifra, dice lo contrario
(`acreditable.ts:47-49`): *"La ley dice '50% del gasto total erogado'; si su
contador toma el total con IVA, la cifra sube alrededor de 13.8%."*

---

### [MEDIO · REINCIDENTE] Las seis pantallas del panel del contador emiten veredictos con norma citada sin la leyenda del CFF 89

`src/app/dashboard/contador/comun.tsx:174-183` · `src/lib/likida/fiscal.ts:960,990` ·
`src/lib/likida/cuadre/leyendas.ts:36-39` · ficha `normas/cff-89-90.yaml` (`verificado_fuente_primaria`: **sí**)

> "No se incurrirá en la infracción a que se refiere la fracción primera de este
> artículo, cuando se manifieste… **o bien manifiesten también por escrito al
> contribuyente que su asesoría puede ser contraria a la interpretación de las
> autoridades fiscales.**" — art. 89, último párrafo

`grep -rln "LEYENDA\|criterios que dé a conocer" src/app/dashboard/contador/` →
**cero archivos**. `PieDeAlcance` dice de dónde sale el dato, no que el criterio
pueda diferir del del SAT. **Escenario:** el contador abre "Deducciones
perdidas", ve "$4,800 ya no se recupera · LISR 27-III", exporta el CSV con la
columna `fundamento` y lo mete a su papel de trabajo; el art. 90 sube la multa
del 10% al 20% de la contribución omitida cuando el criterio es diverso al del
SAT, y la conducta eximente nunca se manifestó por escrito.

---

### [MEDIO · NUEVO en el pase 2] Las ventanas de 7 y 30 días excluyen en silencio los comprobantes sin fecha; el campo que lo diría se calcula y se tira

`src/lib/likida/fiscal.ts:733-734` (`if (periodo.desde) q = q.gte('fecha', …)`) ·
`fiscal.ts:452` (`sinFecha: gastos.filter((g) => !g.fecha).length`) ·
`src/app/dashboard/motor-fiscal-periodo.tsx:15` (`interface ResumenSimple { montoPerdido; montoEnRiesgo; montoRecuperable }`)

`getGastosFiscales` documenta la regla, literal (`fiscal.ts:712-714`): *"Los
comprobantes SIN `fecha` quedan fuera de cualquier corte por periodo, y eso **se
cuenta y se dice** (`sinFecha` en el resumen) en vez de meterlos calladamente en
el mes actual."* La tarjeta nueva no lo dice: `ResumenSimple` solo lleva los tres
escalares, y `page.tsx:141-143` descarta `sinFecha` al armar la serie.

**Escenario:** flota con 9 tickets sin fecha por **$27,400** (OCR no leyó la
fecha), todos sin CFDI. En `semanal` y `mensual` la consulta los excluye
(`.gte('fecha', …)` descarta NULL) → la tarjeta muestra "Recuperable pidiendo
factura $3,100 · últimos 30 días". Al pasar a `histórico`
(`resolverPeriodo('todo')`, `desde/hasta = null`, sin filtro) los $27,400
reaparecen de golpe: **$30,500**. Un salto de 10× al mover la flecha, sin una
palabra que lo explique — mientras `/dashboard/contador/deducciones` sí tiene el
campo para decirlo.

---

### [BAJO · REINCIDENTE] `avisoTope15` afirma "hay pagos de combustible en efectivo" a toda flota sin declarar, incluso con cero efectivo

`src/lib/likida/periodo/aviso.ts:32-33`
```
  if (elegible === undefined) {
    return `Diésel en efectivo ${ejercicio}: hay pagos de combustible en efectivo, pero la facilidad del 15% de la RFA 2026 regla 2.9 exige que la flota declare su dedicación y régimen al registrarla. …`;
  }
```
La rama devuelve el texto **sin mirar `r`**, contra el contrato de la propia
función (`:19-20`: "En `holgado` devuelve null a propósito").
**Escenario:** tenant sin declarar con `efectivo = 0, total = 0` → `holgado`;
`tools.ts:119` mete el aviso en el turno del agente y el jefe de flota recibe por
WhatsApp "hay pagos de combustible en efectivo" sobre un hecho que nadie midió.

---

### [BAJO · REINCIDENTE] La rama fail-closed del 15% hace `continue` y se lleva por delante `monto_discrepante` del mismo comprobante

`src/lib/likida/cuadre/engine.ts:324` (`continue;`) · notas saltadas en `engine.ts:381,399,402`.
Las otras cuatro ramas del 15% no continúan.
**Escenario:** el contador del ejercicio no responde (`total = 0`, bache de red)
y ese mismo ticket de diésel en efectivo trae `ocrExtra.montoDiscrepante`
($4,200 del código vs $4,700 del OCR). Sale a `por_confirmar` con la nota honesta
de la facilidad, pero **sin** la advertencia de que el total está en duda. El
contralor recibe la liquidación con un monto dudoso y sin aviso.

---

## Fichas que NO pude verificar en esta ronda

`normas/` tiene hoy **21 fichas** (16 fiscales; el MAPA dice 24 — la cuenta
cambió). **Ninguna se pudo re-verificar contra la fuente:** los dos latidos
(`normas/.latido-vigilancia`, `.latido-cuota-diesel`) siguen declarando egress
bloqueado a `sidofqa.segob.gob.mx`, `www.sat.gob.mx` y `diputados.gob.mx`. Todo
lo que este reporte afirma sobre las normas sale del texto ya transcrito en las
fichas.

| Ficha | Estado | Efecto en el veredicto |
|---|---|---|
| `rfa-2026-2.9.yaml` | **verificado_fuente_primaria** (2026-07-27) | Gana el CRÍTICO y el ALTO de la tarjeta "En riesgo" |
| `lif-2026-20-A.yaml` | **verificado_fuente_primaria** (2026-07-27) | Gana el ALTO del peaje y el MEDIO de la base |
| `liva-5.yaml` | **verificado_fuente_primaria** | Gana el ALTO del IVA sobre efectivo |
| `cff-89-90.yaml` | **verificado_fuente_primaria** (2026-07-28) | Gana el MEDIO de la leyenda ausente |
| `lisr-28-V.yaml`, `rlisr-57.yaml`, `cff-69-B.yaml`, `cff-30.yaml`, `rfa-2026-2.2.yaml` | **verificado_fuente_primaria** | Verificadas contra el código: correctas |
| `lisr-27-III.yaml` | evidencia_corroborante | **No verificable.** El motor decide "no deducible" con ella (`efectivo_sobre_tope`, `efectivo_no_elegible`) |
| `cff-29-A.yaml` | evidencia_corroborante, `texto_vigente: null` | **No verificable.** El PDF y `TITULOS.cfdi_cancelado` citan CFF 29-A sobre una ficha sin texto transcrito |
| `criterio-1-LIF-PI.yaml`, `criterio-1-CFF-PI.yaml` | evidencia_corroborante, `texto_vigente: null` | **No verificables.** Sostienen la decisión de no imprimir el IEPS en pesos y las leyendas |
| `rmf-2026-2.7.1.48.yaml`, `rmf-2026-2.7.1.21.yaml` | evidencia_corroborante | **No verificables.** `exigibleDesde: null` — el motor avisa y no declara no deducible: correcto mientras siga null |
| `politica-portales-plazos.yaml` | **sin_verificar**, `jerarquia: 6` | Sostiene el ALTO de "Ya no se recupera": una ficha sin verificar de nivel 6 mueve dinero en dos pantallas |
| `cuota-ieps-diesel.yaml` | **NO EXISTE** (13 días) | Correcto que el producto no imprima el estímulo en pesos; sigue sin poder crearse |
| *Sin ficha* | — | La **tasa de ISR** no tiene ficha en `normas/`; por eso el ALTO de "Ahorro generado" se argumenta sin depender de ella |

`rfa-2026-2.9.yaml:42-44` (`usado_en_codigo`) sigue listando solo dos sitios de
`engine.ts`; hoy la regla también decide en `fiscal.ts`, `desde_db.ts`,
`repo.ts`, `tools.ts`, `aviso.ts`, `administracion.ts` y dos páginas del panel.
La trazabilidad ficha→código está desactualizada en la dirección que importa.

---

## Lo que revisé y está bien

- **No hay segunda implementación fiscal.** Verificado línea a línea:
  `getGastosFiscalesSeries` (`fiscal.ts:829-849`) llama 3× a `getGastosFiscales`
  y `page.tsx:141-143` corre el **mismo** `resumirPerdidas`; el diff de
  `analytics.ts` (+454) no introduce ni una consulta de IVA, IEPS, peaje ni 15%
  (`git diff 94c0733..HEAD -- src/lib/likida/analytics.ts | grep '^+'` filtrado
  por términos fiscales: solo coincidencias accidentales con "15" de `3650`).
- **`getAcreditables` sigue leyendo columnas escritas por el motor**
  (`analytics.ts:537-546`), no recalculando: una cifra, un cálculo.
- **CRÍTICO C3 cerrado con evidencia:** `administracion.ts:128`
  (`['624','612']`), `admin/flotas/page.tsx:223` (`<option value="624">`),
  `0088_regimen_624_coordinados.sql:36`. El comentario de `flotas/page.tsx:221-222`
  explica la equivalencia falsa que se corrigió.
- **Refuté yo mismo el "15% mensual".** `/dashboard/contador/combustible` sí
  permite `?p=mes`, pero `page.tsx:175-178` imprime, literal: *"Ojo con el rango:
  la regla es del EJERCICIO completo. Con el filtro en un mes, esto mide ese mes,
  no el año — para el dato que va a la declaración anual, pon el filtro en
  'Ejercicio'."* Con esa nota el rótulo es verdad: **no es hallazgo.** Lo que la
  tarjeta nueva del dueño no tiene es exactamente esa nota.
- **El estímulo de IEPS sigue sin imprimirse en pesos.** `engine.ts:998`
  (`const iepsAcreditable = 0;`) + `acreditable.ts:94-100` entregan **litros**.
  El rework lo respetó: la tarjeta del dueño quedó "Diésel elegible para el
  estímulo" en **litros** (`page.tsx:306-307`), y `facturacion/page.tsx:100-101`
  dice "El estímulo en pesos lo calcula tu contador con la cuota semanal del
  DOF". La confusión "IEPS trasladado = estímulo" está cerrada en las cinco
  superficies que podrían cometerla.
- **El retiro de las tarjetas de peaje e IVA en pesos de `/dashboard`** cerró la
  superficie más vista del ALTO del peaje sin inventar un matiz nuevo.
- **`LEYENDA_CORTA` sigue al pie de `/dashboard`** (`page.tsx:334`), incluso
  después del rework completo de la página.
- **`MotorFiscalPeriodo` falla cerrado** con `series === null`
  (`motor-fiscal-periodo.tsx:39-41`: "No se pudo leer el motor fiscal en este
  momento") — el criterio correcto, y por eso el `?? 0` de `KpiDegradado` dos
  líneas arriba destaca tanto.
- **Las ventanas nuevas están probadas en sus límites**
  (`fiscal_series.test.ts`, 4 pruebas: `2026-08-02..2026-08-08` para 7 días,
  `2026-07-10..2026-08-08` para 30, y `desde/hasta = undefined` para histórico) y
  `getGastosFiscales` filtra por `fecha` del comprobante, no por `created_at`
  (`fiscal.ts:733-734`), que es el criterio del contador.
- **LISR 28-V, LIVA 5-I proporcional, RLISR 57, la clave del estímulo solo
  diésel, el cotejo de litros y el permiso CRE** siguen como los verifiqué en el
  pase 1: sin cambios en el diff y correctos contra sus fichas.

---

## Lo que NO alcancé a revisar

- **`src/lib/likida/facturacion/` completo** (adaptadores CAPUFE/Playwright,
  `permiso_cre.ts`, `comercios.ts` entrada por entrada). El adaptador de CAPUFE
  teclea datos fiscales del receptor en un portal real y sigue sin auditarse.
- **`src/lib/saas/`** (Stripe, Facturapi — el CFDI que Likida **emite** a la
  flota: uso, régimen, CP, PUE/PPD, REP). Sin auditar en las dos pasadas.
- **`intake/consolidado.ts` e `intake/ocr.ts`** (424 y 472 líneas): de dónde
  salen `litros`, `formaPago`, `subTotal` y `producto`, insumos directos de
  cuatro reglas fiscales.
- **`recordatorio_comprobacion.ts`** (+171, nuevo en `c5a7c19`): manda mensajes
  solos sobre plazos de facturación. No revisé si el texto que sale por WhatsApp
  repite la afirmación de nivel 6 ("ya no se recupera") o si lleva el matiz de
  `engine.ts:749`. Es la primera cosa que miraría en un pase 3.
- **Corrida real del motor con estos escenarios.** No creé archivos en el repo
  (instrucción del brief): todas las cifras salen de leer el código línea por
  línea. Las aritméticas son deliberadamente simples para recomprobarlas a mano.
- **Verificación de las fichas contra el DOF/SAT**: imposible en este entorno
  (egress bloqueado).
