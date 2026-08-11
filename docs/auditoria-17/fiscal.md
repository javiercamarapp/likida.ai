# Cumplimiento fiscal — auditoría 17 · pase 4 (11-ago-2026)

**Nota: 5/10** (antes 5). Razón del movimiento: **el código cambió, y los dos
movimientos se cancelan.** Cuatro hallazgos abiertos murieron con su pantalla
(el ALTO del peaje en pesos, y tres MEDIOS del panel del Contador) y el `?? 0`
del KPI "Ahorro generado" se arregló de verdad en el pase 3
(`page.tsx:265` → `?? null`). Contra eso: **ninguno de los doce restantes se
tocó** —el CRÍTICO C4 está línea por línea idéntico— y este pase encontró, en
territorio que las dos pasadas anteriores declararon *no revisado*
(`src/lib/saas/`), un ALTO que **reabre por otra puerta el CRÍTICO C3 que se
dio por cerrado en el pase 2**: `/dashboard/suscripcion` no ofrece el régimen
`624` y su selector cae por defecto en `601`, así que la pantalla donde el
dueño captura sus datos fiscales **le apaga la facilidad del 15% al coordinado
que la tiene**. Se cerraron pantallas, no bugs.

**Riesgo mayor del rubro, hoy:** el borrado dejó a `fiscal.ts` con **un solo
consumidor** (`/dashboard/page.tsx`). Seis de sus nueve funciones públicas
—`resumirFiscal`, `aFilasExport`, `tope15DeGastos`, `resumirCombustibleCasetas`,
`diagnosticoRetencion`, `getLiquidacionesFiscales`— ya no las llama nadie
(`grep` de consumidores fuera de `*.test.ts`: cero). Lo que queda vivo es
justo la parte que **no** tiene contraparte en el motor: `causasDe` /
`resumirPerdidas`, que reparte pesos en perdido / en riesgo / recuperable con
criterios que ya no coinciden con `engine.ts`, y que hoy alimenta las **dos
primeras cifras en pesos** que ve el contralor al entrar. La ficha
`rfa-2026-2.9.yaml` sigue diciendo, en `usado_en_codigo`, que la regla vive en
dos sitios de `engine.ts`. Hoy vive en siete archivos y en la pantalla de
aterrizaje.

---

## Hallazgos abiertos del pase 2: qué cerró el borrado y qué NO

| # | Hallazgo (pase 2) | Estado hoy | Nota |
|---|---|---|---|
| 1 | CRÍTICO · el 15% contra "lo que Likida vio" | **REINCIDENTE** (`repo.ts:831-833`, `engine.ts:337,354`) | Motor y `repo`, no pantalla. El borrado no lo toca. `git diff 20ecbb1..HEAD -- src/lib/likida/repo.ts src/lib/likida/cuadre/engine.ts` → vacío |
| 2 | ALTO · "Ahorro generado" es el monto bruto del gasto | **REINCIDENTE, mitad cerrada** (`page.tsx:259,265`) | El `?? 0` se arregló (pase 3). El **sustantivo** sigue. La página que lo contradecía (`valor-ahorro`) se borró; la contradicción se mudó a `combustible-casetas/page.tsx:193` |
| 3 | ALTO · "En riesgo / perdido" cuenta el efectivo dentro del 15% | **REINCIDENTE** (`motor-fiscal-periodo.tsx:60-63`, `fiscal.ts:294-299,360,440`) | Vive en `/dashboard`, que no se borró |
| 4 | ALTO · "Ya no se recupera" por plazo de nivel 6, fundado en LISR 27-III | **REINCIDENTE, superficie cambiada** (`fiscal.ts:264-268`) | `contador/deducciones` y la ruta del CSV se borraron; el monto sigue entrando al KPI del dueño, y `facturacion/avisar.ts:26-27,56` **calla** el aviso de los vencidos |
| 5 | ALTO · peaje en pesos sin las 4 condiciones, en `/dashboard/facturacion` | **CERRADO POR SUPRESIÓN** | `src/app/dashboard/facturacion/page.tsx` borrado (`2be4b1c`). Las 3 superficies vivas (`[id]/page.tsx:267`, `politicas/page.tsx:276`, `chat.tsx:41`) sí llevan "sujeto a elegibilidad" |
| 6 | ALTO · el combustible en efectivo no acredita IVA | **REINCIDENTE** (`engine.ts:985,1003`) | La mitad del panel (`fiscal.ts:536`) quedó en **código muerto**: `resumirFiscal` ya no tiene consumidor. La del motor —que es la que imprime el PDF— idéntica |
| 7 | MEDIO · `causasDe` no conoce `no_encontrado` / `pendiente` | **REINCIDENTE** (`fiscal.ts:335-364`) | Peor que antes: era una discrepancia entre dos pantallas, ahora es la única pantalla contra el PDF |
| 8 | MEDIO · `efectivo_no_elegible` fuera de `ORDEN` | **REINCIDENTE (4ª ronda)** (`fiscal.ts:375-378`) | Idéntico |
| 9 | MEDIO · píldora/gauge del 15% sin `elegible15` | **CERRADO POR SUPRESIÓN** | `contador/combustible/page.tsx` borrado. `tope15DeGastos` (`fiscal.ts:632`) sobrevive con el mismo defecto, pero **sin consumidor** |
| 10 | MEDIO · gasto sin fecha contra el contador del 15% | **REINCIDENTE** (`engine.ts:312-313`) | Motor |
| 11 | MEDIO · `tools.ts` cuenta el 15% sin las claves del SAT | **REINCIDENTE (5ª ronda)** (`tools.ts:109`) | Sigue sin el tercer argumento |
| 12 | MEDIO · la base del peaje afirmada como resuelta | **CERRADO POR SUPRESIÓN** | `contador/combustible/page.tsx:227-230` borrado. El PDF (`acreditable.ts:47-49`) conserva el matiz correcto |
| 13 | MEDIO · leyenda del CFF 89 ausente en el panel del contador | **CERRADO POR SUPRESIÓN** | Las 6 pantallas se fueron. Las 2 que quedan con veredicto fiscal SÍ la traen: `page.tsx:325` y `[id]/page.tsx:372` (`LEYENDA_CORTA`) |
| 14 | MEDIO · las ventanas de 7/30 días excluyen en silencio los sin-fecha | **REINCIDENTE** (`fiscal.ts:754-755`, `motor-fiscal-periodo.tsx:15`) | `ResumenSimple` sigue sin `sinFecha` |
| 15 | BAJO · `avisoTope15` afirma efectivo sin mirarlo | **REINCIDENTE** (`aviso.ts:32-33`) | Idéntico |
| 16 | BAJO · el `continue` del fail-closed se lleva otras notas | **REINCIDENTE** (`engine.ts:324`) | Idéntico |

**4 cerrados por supresión de 16.** Los 12 restantes viven en `engine.ts`,
`repo.ts`, `fiscal.ts`, `tools.ts`, `aviso.ts` o `/dashboard` — ninguno vivía
*solo* en una página borrada.

---

## Hallazgos

### [CRÍTICO · REINCIDENTE] El 15% se sigue midiendo contra "el combustible que Likida vio", no contra el total de pagos por consumo de combustible del ejercicio

`src/lib/likida/cuadre/engine.ts:337,354` · `src/lib/likida/repo.ts:831-833` ·
ficha `normas/rfa-2026-2.9.yaml` (**verificado_fuente_primaria**, DOF/SIDOF 5780249, 2026-07-27)

> «…siempre que estos no excedan el 15 por ciento **del total de los pagos
> efectuados por consumo de combustible para realizar su actividad**.»
> — `rfa-2026-2.9.yaml:16-17`, `texto_vigente`

Código, literal:

```
engine.ts:337   const tope = 0.15 * total;
repo.ts:831       .or(claves?.length ? `concepto.eq.diesel,clave_prod_serv.in.(${claves.join(',')})` : 'concepto.eq.diesel')
repo.ts:832       .gte('fecha', `${ejercicio}-01-01`)
repo.ts:833       .lte('fecha', `${ejercicio}-12-31`)
```

`gasto` es solo lo que entró por WhatsApp. El motor lo usa como si fuera el
universo de "los pagos efectuados por consumo de combustible".

**Escenario.** Flota elegible (624 + dedicación exclusiva), ejercicio 2026.
Carga $1,200,000 de diésel en su terminal con factura directa a la cuenta de la
empresa — nunca pasa por el teléfono. Por WhatsApp llegan $80,000 de cargas de
carretera, **$30,000 de ellos en efectivo**.
- Motor: `total = 80,000` → `tope = $12,000`; acumulado $30,000; el excedente
  se prorratea por `proporcionDeducible` (`engine.ts:343`) y **$18,000 salen a
  `totalNoDeducible`**. El PDF imprime **"No deducible $18,000.00"** con la
  frase de `engine.ts:354`: *"…contra un tope de $12,000.00 (15% de $80,000.00);
  el excedente de $18,000.00 de ESTE comprobante NO se deduce (RFA 2026 regla
  2.9)"*.
- Norma: el total de pagos por consumo de combustible del ejercicio es
  **$1,280,000**; el 15% son **$192,000**; los $30,000 en efectivo son el
  **2.34%**. Lo correcto es **$0.00 no deducible**.

**Consecuencia.** El contralor archiva una pérdida de deducción que no existe,
y el rótulo "15% de $80,000" es falso como afirmación sobre el ejercicio de su
flota. **Causa raíz probable:** el denominador se construyó sobre la única
tabla que el producto tiene y ningún renglón acota la afirmación a ese alcance
— es decisión de producto (¿se le pide el total del ejercicio al contralor?),
no aritmética.

*Intenté refutarlo:* ¿lo salva el fail-closed de `engine.ts:315-324`? No: ese
solo cubre `total <= 0`. Con $80,000 el motor se cree medido. ¿Lo salva alguna
nota en pantalla? Las dos pantallas que acotaban el alcance
(`contador/comun.tsx:177-179`, "No es la contabilidad completa de la flota")
**se borraron este pase**: la advertencia desapareció y la afirmación se quedó.

---

### [ALTO · NUEVO en el pase 4] `/dashboard/suscripcion` no ofrece el régimen `624`, arranca en `601`, y al guardar **le apaga a un coordinado la facilidad del 15%** — reabre el CRÍTICO C3 por otra puerta

`src/lib/saas/fiscal.ts:20-26` · `src/app/dashboard/suscripcion/page.tsx:353-355` ·
contraste `src/lib/likida/administracion.ts:128` y `src/app/admin/flotas/page.tsx:226-228` ·
ficha `normas/rfa-2026-2.9.yaml` (**verificado_fuente_primaria**)

> «…que tributen conforme al **Título II, Capítulo VII** o Título IV, Capítulo II,
> Sección I de la Ley del ISR…» — `rfa-2026-2.9.yaml:10-12`.
> Y `condiciones_de_aplicacion` (línea 34): "Tributar en **Título II Cap. VII
> (coordinados)** o Título IV Cap. II Secc. I (PF act. empresarial)".

El propio repo ya tradujo esa línea a claves del catálogo, y lo dejó por
escrito (`administracion.ts:120-121`): *"Título II, Capítulo VII = Coordinados
→ **624**"*, *"`601` es el Título II GENERAL, no su Capítulo VII"*. Ese fue el
arreglo del CRÍTICO C3, con prueba (`regimen_facilidad_15.test.ts`, 4 casos).

Código, literal (`saas/fiscal.ts:20-26`) — el catálogo con el que la **flota**
captura su propio régimen:

```
export const REGIMENES = [
  { clave: '601', nombre: 'General de Ley Personas Morales' },
  { clave: '603', nombre: 'Personas Morales con Fines no Lucrativos' },
  { clave: '612', nombre: 'Personas Físicas con Actividades Empresariales' },
  { clave: '621', nombre: 'Incorporación Fiscal' },
  { clave: '626', nombre: 'RESICO' },
] as const;
```

**`624` no está.** Y el formulario (`suscripcion/page.tsx:354`) pone
`valorInicial={fiscales?.regimenFiscal ?? '601'}` sobre un `<select>` sin
opción vacía (`admin/ui/forma.tsx:174-178`): un `defaultValue` de `'624'` no
empata ninguna `<option>`, así que el navegador selecciona **la primera —601—**
sin decir nada. `guardarDatosFiscales` (`saas/fiscal.ts:99`) rechaza cualquier
cosa fuera de la lista con *"Elige un régimen fiscal de la lista"*, y escribe
`tenant.regimen_fiscal` (`:111`) — **la misma columna** que `crearFlota`
(`administracion.ts:140`).

**Escenario.** Javier da de alta a Transportes Innovativos en `/admin/flotas`
con **624 — Coordinados** y "¿Exclusivamente carga federal? Sí" →
`config.facilidadCombustibleEfectivo = { dedicacionExclusivaCarga: true,
regimenElegible: true }` y `regimen_fiscal = '624'`. Semanas después el dueño
entra a *Plan & Facturación* a corregir su código postal. El selector ya está
pintado en **601**. Guarda.
- `tenant.regimen_fiscal` pasa a **`601`** — el régimen que el propio código
  documenta como NO elegible.
- El CFDI que Likida le emite por la mensualidad sale con
  `RegimenFiscalReceptor = 601` sobre un RFC que el SAT tiene registrado como
  coordinado: el PAC lo rechaza, o se timbra con un régimen que no es el suyo.
  Es exactamente el modo de falla que el encabezado de `saas/fiscal.ts:12-17`
  dice existir para evitar (*"ya tienes su dinero y no lo puede deducir"*).
- Y el segundo daño, silencioso: `config.facilidadCombustibleEfectivo`
  **no se re-deriva**. Quedan dos verdades sobre el mismo tenant —
  `regimen_fiscal = '601'` y `regimenElegible: true` — y el motor sigue leyendo
  la segunda (`desde_db.ts:55-57`, `fiscal.ts:213-222`, `tools.ts:115-117`).
  El PDF imprime "deducible por la facilidad del 15% (RFA 2026 regla 2.9)"
  citando la regla, sobre una flota cuyo régimen registrado ya no califica.
  En el sentido inverso (el dueño elige 601 desde el principio y el alta nunca
  declaró nada) la flota real coordinada **no puede** registrar su régimen: la
  facilidad no abre y su diésel en efectivo sale no deducible.

**Consecuencia.** El arreglo del CRÍTICO C3 solo cubre la puerta del
superadmin. La del cliente lo revierte, sin aviso y sin prueba que lo detecte:
`regimen_facilidad_15.test.ts` prueba `crearFlota`, no `guardarDatosFiscales`.
**Causa raíz probable:** dos catálogos de `c_RegimenFiscal` en el mismo
producto escribiendo la misma columna, y una elegibilidad **derivada una vez y
congelada** en `tenant.config` en vez de derivarse del código en cada lectura.

---

### [ALTO · NUEVO en el pase 4] El rail del Asistente dice "**este periodo**" sobre cifras de TODO el histórico, con LIVA 5 y LIF 20-A citados al lado

`src/app/dashboard/chat.tsx:32,38,41` · `src/app/api/dashboard/asistente/route.ts:78` ·
`src/lib/likida/analytics.ts:535-536,42-47` ·
fichas `normas/liva-5.yaml` y `normas/lif-2026-20-A.yaml` (**verificado_fuente_primaria** ambas)

> El estímulo de peaje se otorga a quien «obtenga **en el ejercicio fiscal en
> el que hagan uso** de la infraestructura carretera de cuota, ingresos totales
> anuales… menores a 300 millones». — `lif-2026-20-A.yaml:41-44`
> El acreditamiento del IVA es **del mes** que se declara (LIVA 5, `liva-5.yaml`).

Código, literal:

```
chat.tsx:32   return acred ? `${litros(acred.litrosDiesel)} elegibles para el estímulo este periodo (LIF 2026, Art. 20-A).` : …
chat.tsx:38   return acred ? `${mxn(acred.iva)} de IVA acreditable este periodo (LIVA, Art. 5).` : …
chat.tsx:41   return acred ? `${mxn(acred.peaje)} de peaje acreditable (50%) este periodo — sujeto a elegibilidad.` : …
```

y el único productor de `acred` para ese rail
(`api/dashboard/asistente/route.ts:78`):

```
    safe(() => getAcreditables(tenantId!)),
```

**sin `ventanaDias`.** `getAcreditables(tenantId, undefined)` →
`corteVentana(undefined)` devuelve `null` (`analytics.ts:43`) → la consulta no
lleva `.gte('created_at', …)`: **suma todas las liquidaciones de la historia
del tenant.** El rail vive en el `chrome.tsx` del layout, o sea en todas las
páginas de `/dashboard` menos el Resumen (`rail.tsx:90`).

**Escenario.** Flota que arrancó en marzo de 2025. Histórico acumulado:
$310,000 de IVA acreditable y $96,000 de peaje. Estamos en agosto de 2026 y el
contralor está preparando su declaración del mes. Pregunta al asistente
*"¿cuánto IVA acreditable llevo?"* y lee, textual: **"$310,000.00 de IVA
acreditable este periodo (LIVA, Art. 5)"** — dos ejercicios completos
presentados como el periodo en curso, con el artículo al lado. La misma caja
responde **"$96,000.00 de peaje acreditable (50%) este periodo"**, cuando el
estímulo del LIF 20-A se determina **por ejercicio** y el de 2025 ya se aplicó
o se perdió.

**Consecuencia.** La respuesta es una cifra fiscal en pesos, con norma citada,
sobre un periodo que no existe. Es la primera cosa que un contralor le pregunta
a un asistente. **Causa raíz probable:** `getAcreditables` tiene la ventana como
parámetro **opcional**, así que omitirla compila y devuelve "todo" en silencio;
`/dashboard/page.tsx:95` sí le pasa `diasEjercicio`, el endpoint del rail no.

*Intenté refutarlo:* ¿"este periodo" podría leerse como "desde siempre"? No en
este producto: `resolverPeriodo` (`fiscal.ts:131`) construye el rótulo junto al
rango precisamente porque *"cuando eran dos cosas separadas el encabezado decía
'del periodo' sobre una consulta sin filtro"* (`fiscal.ts:127-129`). El propio
archivo llama a esto un hallazgo ya documentado.

---

### [ALTO · REINCIDENTE, mitad cerrada] "Ahorro generado — Ejercicio 2026" sigue imprimiendo en pesos el **monto bruto del gasto**, y ahora la pantalla hermana llama al mismo dinero "deducible que se pierde"

`src/app/dashboard/page.tsx:259,265` · `src/lib/likida/fiscal.ts:441,306-310` ·
contraste vivo `src/app/dashboard/combustible-casetas/page.tsx:193` ·
*sin ficha en `normas/`* que sostenga una tasa de ISR — el hallazgo no depende de ella

Regla del producto (`CLAUDE.md`, "Un rótulo tiene que ser verdad"). La página
que lo contradecía por escrito (`valor-ahorro/page.tsx`) **se borró este pase**,
así que la contradicción hay que leerla en lo que queda:

```
page.tsx:259                       etiqueta={`Ahorro generado — ${periodoFiscal.etiqueta}`}
page.tsx:265                       valor={resumenPerdidas?.montoRecuperable ?? null} formato="mxn"

fiscal.ts:441      else montoRecuperable += f.gasto.monto;
fiscal.ts:306-310  sin_cfdi: { gravedad: 'recuperable', titulo: 'Sin CFDI todavía', …
                     detalle: 'El ticket todavía se puede timbrar. Es deducción PENDIENTE, no perdida…' }

combustible-casetas/page.tsx:193   nota={… `${sinCfdi} de ${combustibleYCasetas.length} sin factura — es deducible que se pierde`}
```

`montoRecuperable` es la suma del **monto bruto** (IVA incluido — el mismo campo
que `fiscal.ts:482` describe como *"lo que salió de la caja, no la base
gravable"*) de los comprobantes cuya causa dominante es `sin_cfdi`.

**Escenario.** Flota con 62 tickets de diésel y casetas sin CFDI en el ejercicio
2026, por **$250,000** brutos, todos con plazo abierto.
- `/dashboard`: tarjeta de marca con alcancía — **"Ahorro generado — Ejercicio
  2026: $250,000.00"**.
- `/dashboard/combustible-casetas`, un clic al lado, sobre los **mismos**
  comprobantes: *"48 de 71 sin factura — **es deducible que se pierde**"*.
- Y `fiscal.ts:310`, la fuente de los dos: *"Es deducción **pendiente**, no
  perdida"*.
Tres nombres para los mismos pesos en el mismo producto: ahorro ganado, pérdida,
y pendiente. Solo el tercero es cierto.
- Aun cobrada entera, una deducción baja la **base**, no el impuesto: el efecto
  en caja sería del orden de $75,000 de ISR + $34,483 de IVA acreditable ≈
  **$109,500**, menos de la mitad de lo impreso. *(La tasa del 30% la doy como
  orden de magnitud declarado: no hay ficha de LISR 9 en `normas/`, así que no
  la cito como norma. El hallazgo no depende de ella — $250,000 de gasto bruto
  nunca es el ahorro de deducir $250,000.)*

**Progreso real:** el `?? 0` sí se cerró en el pase 3 (`page.tsx:260-265`
documenta por qué), así que una caída de `getConfig` ya no imprime "$0.00 de
ahorro"; imprime "—". Queda el sustantivo. `KpiDegradado`
(`resumen-visual.tsx:95-141`) sigue sin ranura para `nota`: la cifra sale sin
un solo qualifier.

**Causa raíz probable:** el KPI se cableó al campo que ya existía y se le puso
el nombre del pedido, sin pasar por la única función que sabía nombrarlo
(`TITULOS.sin_cfdi`). **No lo marco CRÍTICO** porque la cifra es una medición
real de gasto recuperable; lo falso es el sustantivo.

---

### [ALTO · REINCIDENTE] La tarjeta "En riesgo / perdido" cuenta en rojo el combustible en efectivo que el motor ya declaró **deducible** dentro del 15%, sobre una ventana de 7 días para una regla que la norma ancla al ejercicio

`src/app/dashboard/motor-fiscal-periodo.tsx:60-63,11-13,36` ·
`src/lib/likida/fiscal.ts:294-299,360,440` ·
contraste `src/lib/likida/cuadre/engine.ts:344-351` ·
ficha `normas/rfa-2026-2.9.yaml` (**verificado_fuente_primaria**)

> «…siempre que estos no excedan el 15 por ciento del total de los pagos
> efectuados por consumo de combustible **para realizar su actividad**.»
> — `rfa-2026-2.9.yaml:16-17`. Y `condiciones_de_aplicacion` (línea 35),
> literal: «El efectivo no puede exceder el 15% del total pagado por combustible
> **en el ejercicio**».

Código, literal:

```
motor-fiscal-periodo.tsx:11-12  const ETIQUETA_MODO: Record<Modo, string> = {
                                  semanal: 'últimos 7 días', mensual: 'últimos 30 días', historico: 'histórico', };
motor-fiscal-periodo.tsx:36     const [modoIdx, setModoIdx] = useState(0);      // ← arranca en 'semanal'
motor-fiscal-periodo.tsx:61       {mxn(r.montoEnRiesgo + r.montoPerdido)}
```

`montoEnRiesgo` recibe **el 100% del monto** de todo diésel en efectivo
(`fiscal.ts:360` → `combustible_efectivo`, gravedad `en_riesgo`
`fiscal.ts:295` → `fiscal.ts:440`), y **`causasDe` nunca consulta el tope**:
`grep -n "evaluarTope15\|tope15" src/lib/likida/fiscal.ts` no aparece dentro de
`causasDe` ni de `resumirPerdidas` (solo en `tope15DeGastos`, que ya no tiene
consumidor).

**Escenario.** Flota elegible (624 + dedicación exclusiva). Ejercicio 2026:
$200,000 de combustible, de los cuales **$12,000 en efectivo (6%)** — holgado.
En los últimos 7 días llegan **3 tickets de diésel en efectivo con CFDI por
$8,000**.
- Motor / PDF (`engine.ts:344-351`): `combustible_efectivo_dentro15`, `monto: 0`,
  y la nota impresa **"deducible por la facilidad del 15% (RFA 2026 regla 2.9):
  el ejercicio lleva $12,000.00 de $200,000.00 de combustible en efectivo (6%
  del total, tope 15%)"**. Los $8,000 entran íntegros a `totalDeducible`.
- `/dashboard`, al abrir: **"En riesgo / perdido · $8,000.00 · últimos 7 días"**
  en `var(--color-bad)`.

Agravante de forma: la tarjeta **funde** `montoPerdido` y `montoEnRiesgo` en un
solo número rojo, cuando `Gravedad` (`fiscal.ts:246-252`) los define como cosas
distintas ("El dinero ya no se recupera" vs "Depende de algo que todavía puede
moverse"). La pantalla que los pintaba separados y en colores distintos
(`contador/deducciones`) **se borró**, así que hoy no queda ninguna superficie
que muestre la diferencia: un CFDI cancelado y un diésel al 6% del tope se leen
idénticos.

**Consecuencia.** El contralor que cruce el panel contra el PDF ve al producto
contradecirse sobre los mismos pesos, y el error va del lado que *sí* revisa
(dice que pierde dinero que no pierde). **Causa raíz probable:**
`resumirPerdidas` se diseñó para una pantalla que enseñaba las tres cubetas con
su `detalle` normativo al lado (*"Cuenta contra el 15% del combustible del
ejercicio"*, `fiscal.ts:298`); el KPI consume los tres escalares y tira título,
detalle, norma y la separación entre gravedades.

---

### [ALTO · REINCIDENTE] "Ya no se recupera $X" por un plazo de **nivel 6** fundado en **LISR 27-III** — y ahora el producto además **calla el aviso** de esos tickets

`src/lib/likida/fiscal.ts:264-268,345,439` (→ `page.tsx:136-138` → `motor-fiscal-periodo.tsx:61`) ·
`src/lib/likida/facturacion/avisar.ts:26-27,56` ·
ficha `normas/politica-portales-plazos.yaml` (**`sin_verificar`**, `jerarquia: 6`)

> «**ESTO NO ES UNA NORMA FISCAL.** Es la política interna de un tercero y tiene
> CERO fuerza legal. El plazo LEGAL para pedir factura es **todo el ejercicio**
> (el SAT lo dice expresamente), y negarla porque "ya pasó el mes" es una
> práctica indebida listada por el propio SAT, con remedio en la Conciliación de
> Factura. **El producto NUNCA debe presentar estos plazos como una obligación
> fiscal.**» — `politica-portales-plazos.yaml:30-35`, `advertencia_de_jerarquia`

Código, literal (`fiscal.ts:264-269`):

```
  plazo_vencido: {
    gravedad: 'perdida',
    titulo: 'Plazo de facturación vencido',
    norma: 'LISR 27-III',
    detalle: 'El comercio ya no acepta timbrarlo. Sin CFDI no ampara deducción y el IVA no se acredita.',
  },
```

`LISR 27-III` (ficha `normas/lisr-27-III.yaml`, `evidencia_corroborante`) habla
de **medio de pago y comprobante**; su texto transcrito (`:8-22`) no menciona
plazos de facturación en ninguna de sus dos partes.

Y `facturacion/avisar.ts`, literal (`:26-27`, encabezado):

> «Y lo VENCIDO no va: **ya no se puede facturar**. Se ve en la pantalla, con su
> monto perdido, pero no se le manda a alguien a intentar lo imposible.»

implementado en `:56` (`.filter((x) => !x.t.caducidad.vencido && …)`).

**Escenario.** Ticket de diésel de **$4,800** del 3-jul-2026, sin CFDI, comercio
con `plazo: 'mes_natural'` y `plazoVerificado: false` (12 de las 13 entradas del
catálogo, según la propia ficha `:37`). Hoy 11-ago-2026 → `plazoVencido: true`.
- `/dashboard`: esos $4,800 entran a `montoPerdido` y salen sumados en rojo en
  **"En riesgo / perdido"**, sin causa ni fundamento a la vista.
- El aviso de WhatsApp que existe para rescatarlos **no lo incluye**: se filtra
  por vencido antes de armar el mensaje. Nadie va a pedir esa factura.
- El PDF del **mismo ticket** dice lo contrario (`engine.ts:749`): *"…pero
  legalmente puedes exigirlo dentro del ejercicio (Conciliación de Factura del
  SAT)"*.

**Consecuencia.** El contador da por perdidos $4,800 (y su IVA) que se recuperan
con una llamada, y el único canal que podría empujar esa llamada está
programado para callarse justo en ese caso. **Causa raíz probable:** el arreglo
de jerarquía se aplicó a `engine.ts` y nunca se propagó ni a `fiscal.ts` ni a
`avisar.ts`; el borrado de este pase quitó la pantalla donde se leía el
fundamento falso, pero dejó el dinero contado como perdido.

---

### [ALTO · REINCIDENTE] El combustible en efectivo dentro del 15% no acredita **IVA**, y la ficha que se invoca excluye el **IEPS**, no el IVA

`src/lib/likida/cuadre/engine.ts:985,1003` ·
fichas `normas/liva-5.yaml` y `normas/rfa-2026-2.9.yaml` (**verificado_fuente_primaria** ambas)

> «…se consideran estrictamente indispensables **las erogaciones efectuadas por
> el contribuyente que sean deducibles para los fines del impuesto sobre la
> renta**, aun cuando no se esté obligado al pago de este último impuesto.»
> — `liva-5.yaml`, art. 5 fr. I

> «Conserva la **DEDUCCIÓN para ISR**. NO habilita el acreditamiento **del
> IEPS**: son dos beneficios distintos y el efectivo solo salva uno.»
> — `rfa-2026-2.9.yaml:37-39`, `limite_importante`

Código, literal:

```
engine.ts:985   const SIN_ACREDITAMIENTO: TipoDiferencia[] = [… 'combustible_efectivo', 'combustible_efectivo_dentro15',
                  'efectivo_sobre_15', 'efectivo_no_elegible', …];
engine.ts:1003    if (diferencias.some((d) => d.gastoId === g.id && SIN_ACREDITAMIENTO.includes(d.tipo))) continue;
```

El `continue` salta el gasto entero, incluida la línea de IVA
(`engine.ts:1026`). El propio comentario del bloque (`engine.ts:981-984`)
explica bien por qué la lista existe —"`combustible_efectivo` SÍ es deducible
hasta el 15%, pero **NO acredita IEPS**"— y luego niega también el IVA, que es
otro impuesto y otra ficha.

**Escenario.** CFDI de diésel de **$5,800** (SubTotal $5,000, IVA trasladado
$800), pagado en efectivo, XML verificado, flota elegible, dentro del 15%. El
motor emite `combustible_efectivo_dentro15`, el gasto entra a `totalDeducible`
por $5,800 (correcto) y `ivaAcreditable` recibe **$0.00**. Por LIVA 5-I (la
erogación es deducible para ISR gracias a la RFA 2.9) + fr. III (IVA trasladado
expresamente y por separado) serían **$800.00** acreditables. El PDF no imprime
el renglón "IVA acreditable (LIVA art. 5)" (`acreditable.ts:102-109`) para ese
comprobante.

**Consecuencia.** Al cliente le faltan $800 de IVA acreditable por CFDI en el
papel que Likida le entrega. El error va a la baja (menos riesgo ante el SAT,
más dinero perdido para el cliente), pero **niega** un acreditamiento citando
una restricción que ninguna ficha contiene. **Causa raíz probable:**
`SIN_ACREDITAMIENTO` es una sola dimensión ("no acredita nada") para dos
impuestos con requisitos distintos. *(La copia de esta regla en `fiscal.ts:536`
sigue ahí pero quedó **muerta**: `resumirFiscal` ya no tiene consumidor.)*

---

### [MEDIO · NUEVO en el pase 4] Dos catálogos de `c_RegimenFiscal` en el mismo producto le ponen el mismo nombre a dos claves distintas, y escriben la misma columna

`src/app/admin/flotas/page.tsx:228,230` · `src/lib/saas/fiscal.ts:24` ·
*sin ficha en `normas/`* — **no verificable en esta ronda** (no hay ficha del catálogo `c_RegimenFiscal`; el egress al SAT sigue bloqueado)

```
admin/flotas/page.tsx:228     <option value="615">615 — Incorporación Fiscal</option>
admin/flotas/page.tsx:230     <option value="616">616 — Otros regímenes</option>
saas/fiscal.ts:24             { clave: '621', nombre: 'Incorporación Fiscal' },
```

Los dos formularios escriben `tenant.regimen_fiscal`
(`administracion.ts:140`, `saas/fiscal.ts:111`), y **necesariamente uno de los
dos está mal**: "Incorporación Fiscal" no puede ser 615 y 621 a la vez. No lo
resuelvo contra fuente porque no hay ficha del catálogo y no puedo consultar el
SAT desde aquí; lo que sí es comprobable sin salir del repo es la
contradicción.

**Escenario.** Javier registra una flota chica eligiendo *"615 — Incorporación
Fiscal"*. Esa clave viaja a `getDatosFiscales` → `FlotaFiscal.regimenFiscal`
(`flota_fiscal.ts:84`) → al portal de CAPUFE como dato del **receptor**
(`capufe.ts:603`, `revisarReceptor` solo comprueba que sean 3 dígitos,
`:1245`) y a Stripe (`saas/stripe.ts:266`). El CFDI se emite con un
`RegimenFiscalReceptor` que no es el de esa flota.

**Consecuencia.** Un CFDI con el régimen del receptor equivocado se rechaza al
timbrar, o se timbra mal y el cliente no lo puede deducir — el modo de falla
que el encabezado de `saas/fiscal.ts:12-17` dice existir para evitar.
**Causa raíz probable:** el catálogo se tecleó dos veces, en dos archivos, sin
una fuente única ni una ficha en `normas/` que lo respalde.

---

### [MEDIO · REINCIDENTE] "El SAT no reconoce este CFDI" sigue sin llegar a `causasDe` — y ahora esa es la **única** pantalla que queda

`src/lib/likida/fiscal.ts:335-364` · contraste `src/lib/likida/cuadre/engine.ts:100,119` ·
`src/lib/likida/intake/sat.ts:18` (`EstadoSat = 'vigente' | 'cancelado' | 'no_encontrado' | 'pendiente'`) ·
ficha `normas/cff-29-A.yaml` (`evidencia_corroborante`, `texto_vigente: null` — **no verificable en esta ronda**)

```
fiscal.ts:342    if (g.estadoSat === 'cancelado') push('cfdi_cancelado');
fiscal.ts:344    if (!g.cfdiUuid) { … }
```

`grep -n "no_encontrado" src/lib/likida/fiscal.ts` → **una sola línea, la 530**
(`ivaSostenible`, hoy código muerto). `causasDe` no tiene rama.

**Escenario.** Gasto de **$11,600** con UUID que el SAT devuelve *no
encontrado*, pagado por transferencia.
- Motor / PDF: `cfdi_no_encontrado` ∈ `NO_DEDUCIBLE_ISR` (`engine.ts:100`) →
  cubeta `no_deducible` (`:119`) → **"No deducible $11,600.00"** en el papel.
- `/dashboard`: `causasDe` → `[]`, la fila no entra a `resumirPerdidas`, y
  **"En riesgo / perdido"** muestra **$0.00** sobre los mismos $11,600.
Igual con `'pendiente'`. **Consecuencia:** el panel dice que no hay nada
perdido sobre pesos que el PDF de la misma liquidación ya dio por perdidos, y
ya no queda una segunda pantalla donde el contador pudiera notarlo.

---

### [MEDIO · REINCIDENTE (4ª ronda)] `efectivo_no_elegible` sigue fuera de `ORDEN`

`src/lib/likida/fiscal.ts:375-378` (declarado en `:240`, con título en `:300`, emitido en `:359`)

```
const ORDEN: CausaPerdida[] = [
  'efos', 'cfdi_cancelado', 'plazo_vencido', 'efectivo_sobre_tope',
  'efos_indeterminado', 'combustible_efectivo', 'sin_cfdi',
];
```

**Escenario.** Flota con `elegible15 = false` y un diésel en efectivo de
**$1,000**:
- **Sin** CFDI → `causasDe` da `[sin_cfdi, efectivo_no_elegible]`;
  `causaDominante` recorre `ORDEN`, encuentra `sin_cfdi` y devuelve esa →
  $1,000 a `montoRecuperable` → **$1,000 se suman a "Ahorro generado"**. Falso:
  aun timbrado, el efectivo en combustible de una flota que no califica no
  deduce — es lo que dice el propio `TITULOS.efectivo_no_elegible`
  (`fiscal.ts:300-305`) y lo que imprime el motor (`engine.ts:358-363`).
- **Con** CFDI la dominante sí es `efectivo_no_elegible` → $1,000 a
  `montoPerdido`, pero `porCausa` lo filtra por `ORDEN` (`fiscal.ts:450-451`) y
  la causa **desaparece de la lista** de `MotorFiscal` (`page.tsx:303`): el
  desglose no suma el total que está arriba.

---

### [MEDIO · REINCIDENTE] Un gasto de combustible **sin fecha** corre contra un contador del 15% cuyo denominador lo excluye

`src/lib/likida/cuadre/engine.ts:312-313` · `src/lib/likida/repo.ts:832-833` ·
ficha `normas/rfa-2026-2.9.yaml` (**verificado_fuente_primaria**)

```
engine.ts:312   const anioComprobante = g.fecha ? g.fecha.slice(0, 4) : null;
engine.ts:313   const mismoEjercicio = !anioComprobante || anioComprobante === input.anioEjercicio;
```

Un gasto sin fecha se declara "del mismo ejercicio" por construcción, pero
`repo.ts:832-833` filtra `.gte('fecha', …)/.lte('fecha', …)` y nunca lo sumó.

**Escenario (ejercicio 2026).** La consulta trae `efectivo = 14,300` y
`totalCombustible = 99,000`. Este viaje trae además un diésel en efectivo de
**$1,000 sin fecha** (el OCR no la leyó). `efectivoAcumuladoEjercicio` lo suma
→ acumulado $14,300 (la consulta ya lo excluyó del previo) contra
`tope = $14,850` → **cero exceso impreso**. El efectivo real del ejercicio es
$15,300 contra un tope real de $15,000 (el sin-fecha también es base): el
exceso verdadero es **$300** y el PDF imprimió **$0**.

---

### [MEDIO · REINCIDENTE (5ª ronda)] El chat cuenta el 15% con `concepto='diesel'` a secas

`src/lib/likida/tools.ts:109` (`await getAcumuladoCombustible(ctx.tenantId, ejercicio)` — **sin** el tercer argumento) ·
`src/lib/likida/repo.ts:831` (sin `claves` cae a `concepto.eq.diesel`) ·
contraste `src/lib/likida/cuadre/desde_db.ts:78` (mismo llamado **con** `clavesCombustible`) ·
ficha `normas/rfa-2026-2.9.yaml` (**verificado_fuente_primaria**)

**Escenario.** El CFDI de diésel llega después de la foto:
`repo.updateGastoCfdiXml` escribe `clave_prod_serv = '15101505'` pero no
reescribe `concepto` (queda `otro`/`factura`). Motor y `desde_db` lo cuentan en
el 15% por clave; el aviso del chat no. Con $8,000 de diésel-por-clave fuera del
conteo del chat sobre $60,000 del ejercicio, WhatsApp dice "vas en 8%" el mismo
día en que la liquidación imprime "el excedente NO se deduce". Además,
`0084_sumar_combustible_ejercicio.sql` sigue sin invocarse desde producción
(`grep -rn "sumar_combustible_ejercicio" src/` → solo
`migraciones_verificadas.test.ts`).

---

### [MEDIO · REINCIDENTE] Las ventanas de 7 y 30 días excluyen en silencio los comprobantes sin fecha; el campo que lo diría se calcula y se tira

`src/lib/likida/fiscal.ts:754-755,473` · `src/app/dashboard/motor-fiscal-periodo.tsx:15`

`getGastosFiscales` documenta la regla, literal (`fiscal.ts:733-735`): *"Los
comprobantes SIN `fecha` quedan fuera de cualquier corte por periodo, y eso **se
cuenta y se dice** (`sinFecha` en el resumen) en vez de meterlos calladamente en
el mes actual."* La tarjeta no lo dice: `ResumenSimple` (`:15`) solo lleva los
tres escalares, y `page.tsx:136-138` descarta `sinFecha` al armar la serie.

**Escenario.** Flota con 9 tickets sin fecha por **$27,400**, todos sin CFDI. En
`semanal` y `mensual` la consulta los excluye (`.gte('fecha', …)` descarta NULL)
→ la tarjeta muestra "Recuperable pidiendo factura **$3,100** · últimos 30
días". Al pasar a `histórico` (`resolverPeriodo('todo')`, `desde/hasta = null`,
sin filtro) reaparecen de golpe: **$30,500**. Un salto de 10× al mover la
flecha, sin una palabra que lo explique — y la pantalla que sí tenía el campo
para decirlo (`contador/deducciones`) ya no existe.

---

### [MEDIO · NUEVO en el pase 4] "Litros elegibles para el estímulo · LIF 2026, Art. 20-A" suma todo el histórico bajo una tarjeta sin periodo

`src/app/dashboard/combustible-casetas/page.tsx:121,188-189` ·
`src/lib/likida/analytics.ts:535-543,42-47` ·
ficha `normas/lif-2026-20-A.yaml` (**verificado_fuente_primaria**)

> «…el monto que se podrá acreditar será el que resulte de multiplicar la cuota
> del impuesto especial… **vigente en el momento en que se haya realizado la
> importación o adquisición del diésel**…, por el número de litros importados o
> adquiridos.» — `lif-2026-20-A.yaml:26-30`
> Y `advertencia_critica` (`:32-35`): «la cuota **cambia SEMANALMENTE**».

```
combustible-casetas/page.tsx:121    safe<Acreditables>(() => getAcreditables(tenantId)),
combustible-casetas/page.tsx:188      etiqueta="Litros elegibles para el estímulo" valor={acred?.litrosDiesel ?? 0} formato="litros"
combustible-casetas/page.tsx:189      nota="LIF 2026, Art. 20-A" />
```

Sin `ventanaDias`, `corteVentana` devuelve `null` y la consulta no filtra:
son los litros de **todas las liquidaciones del tenant, de todos los
ejercicios**, bajo una tarjeta cuya única nota es el artículo.

**Escenario.** Flota con 41,000 L acumulados desde 2025. El contralor lee
"41,000 L elegibles para el estímulo · LIF 2026, Art. 20-A", multiplica por la
cuota de esta semana como el propio producto le enseña a hacer
(`acreditable.ts:78-80`: *"se entregan los litros para que su contador aplique
la cuota fechada"*) y determina un estímulo de 2026 con litros de 2025 — que ni
son de este ejercicio ni corresponden a esa cuota. El Resumen, dos clics allá,
sí acota al ejercicio (`page.tsx:95`, `getAcreditables(tenantId, diasEjercicio)`)
y da otra cifra para lo mismo.

**Causa raíz probable:** la misma que el ALTO del rail — `ventanaDias` es
opcional y omitirlo devuelve "todo" en silencio.

---

### [MEDIO · NUEVO en el pase 4] La misma pantalla llama "deducible que se pierde" a lo que el motor clasifica como recuperable

`src/app/dashboard/combustible-casetas/page.tsx:190-193` ·
contraste `src/lib/likida/fiscal.ts:306-311` ·
ficha `normas/politica-portales-plazos.yaml` (**`sin_verificar`**, `jerarquia: 6`) y `normas/lisr-27-III.yaml`

```
combustible-casetas/page.tsx:193   nota={pctSinCfdi === null ? undefined : `${sinCfdi} de ${combustibleYCasetas.length} sin factura — es deducible que se pierde`}
```

`sinCfdi` es `docs.filter((d) => !d.cfdiUuid)` (`:149-150`): **ningún** filtro
por plazo. El motor, sobre exactamente los mismos comprobantes, dice
(`fiscal.ts:307-310`): `gravedad: 'recuperable'`, *"El ticket todavía se puede
timbrar. Es deducción **pendiente, no perdida**"*. Y la ficha de plazos
(`:30-35`) recuerda que el plazo legal es todo el ejercicio.

**Escenario.** Flota con 71 comprobantes de diésel y casetas, 48 sin CFDI, todos
de este mes y con el portal abierto. La pantalla imprime *"48 de 71 sin factura
— **es deducible que se pierde**"*. Nada se ha perdido: falta pedir 48 facturas.
El contralor que crea la frase deja de perseguirlas.

**Consecuencia.** Es una afirmación de pérdida sin ninguna condición que la
sostenga, y empuja a la conducta contraria a la que el producto quiere provocar.

---

### [BAJO · NUEVO en el pase 4] El concepto heredado `viaticos` recibe el tope de alimentación de LISR 28-V, que no cubre hospedaje

`src/lib/likida/cuadre/engine.ts:889-892` ·
ficha `normas/lisr-28-V.yaml` (**verificado_fuente_primaria**)

> «Tratándose de gastos de viaje destinados a la **alimentación**, éstos sólo
> serán deducibles hasta por un monto que no exceda de $750.00 diarios por cada
> beneficiario…» — `lisr-28-V.yaml:21-25`.
> Y su propio `confirmado_del_codigo` (`:43`): «**Solo alimentación; el
> hospedaje nacional no tiene tope: CORRECTO**».

```
engine.ts:892     const conTope = (c: string) => c === 'alimentacion' || c === 'viaticos';
```

`viaticos` es un concepto **genérico heredado** (`types/likida.ts:24`, y sigue
en el dominio de la migración `0025` y en el editor de políticas,
`politicas/page.tsx:20`): puede ser una comida, un hotel o un taxi.

**Escenario.** Fila vieja con `concepto: 'viaticos'` de **$1,900** que era una
noche de hotel. El motor la mete al cubo del día, cruza el tope de $750 y emite
`viatico_excede_fiscal` con nota **"…excede el tope fiscal de $750.00 por día
(LISR 28-V) — el excedente de $1,150.00 no es deducible"**. El hospedaje
nacional **no tiene tope** en esa fracción: la cifra impresa en el PDF es una
deducción quitada que la ley concede.

**Causa raíz probable:** el comentario lo llama *"criterio conservador"*
(`engine.ts:889-891`), pero conservador aquí es del lado que **le quita**
deducción al cliente citando un artículo que no aplica.

---

### [BAJO · REINCIDENTE] `avisoTope15` afirma "hay pagos de combustible en efectivo" a toda flota sin declarar, incluso con cero efectivo

`src/lib/likida/periodo/aviso.ts:32-33`

```
  if (elegible === undefined) {
    return `Diésel en efectivo ${ejercicio}: hay pagos de combustible en efectivo, pero la facilidad del 15% …`;
  }
```

La rama devuelve el texto **sin mirar `r`**, contra el contrato de la propia
función (`:19-20`: "En `holgado` devuelve null a propósito").
**Escenario:** tenant sin declarar con `efectivo = 0, total = 0` → `holgado`;
`tools.ts:119` mete el aviso en el turno del agente y el jefe de flota recibe
por WhatsApp "hay pagos de combustible en efectivo" sobre un hecho que nadie
midió.

---

### [BAJO · REINCIDENTE] La rama fail-closed del 15% hace `continue` y se lleva por delante `monto_discrepante` del mismo comprobante

`src/lib/likida/cuadre/engine.ts:324` · notas saltadas en `engine.ts:381,399,402`.
Las otras cuatro ramas del 15% no continúan.
**Escenario:** el contador del ejercicio no responde (`total = 0`, bache de red)
y ese mismo ticket de diésel en efectivo trae `ocrExtra.montoDiscrepante`
($4,200 del código vs $4,700 del OCR). Sale a `por_confirmar` con la nota
honesta de la facilidad, pero **sin** la advertencia de que el total está en
duda. El contralor recibe la liquidación con un monto dudoso y sin aviso.

---

## Estado de las fichas de `normas/`

`normas/` tiene hoy **21 fichas** YAML (16 fiscales, 5 de datos/laboral) — el
MAPA dice 24. **Ninguna se pudo re-verificar contra la fuente en esta ronda:**
`normas/.latido-vigilancia` declara la **undécima** corrida bloqueada por egress
a `sidofqa.segob.gob.mx`, `www.sat.gob.mx` y `diputados.gob.mx`. Todo lo que
este reporte afirma sobre las normas sale del texto ya transcrito en las fichas.

| Ficha | Estado | Efecto en el veredicto |
|---|---|---|
| `rfa-2026-2.9.yaml` | **verificado_fuente_primaria** (2026-07-27) | Gana el CRÍTICO, el ALTO del régimen 624, el ALTO de "En riesgo", 2 MEDIOS |
| `lif-2026-20-A.yaml` | **verificado_fuente_primaria** (2026-07-27) | Gana el ALTO del rail y el MEDIO de los litros históricos |
| `liva-5.yaml` | **verificado_fuente_primaria** | Gana el ALTO del IVA sobre efectivo |
| `lisr-28-V.yaml` | **verificado_fuente_primaria** (2026-07-27) | Gana el BAJO de `viaticos`. Sus H1 y H2 (severidad alta/media) **están implementados** hoy (`alimentacion_sin_soporte`, `alimentacion_transporte_sin_tarjeta_credito` en `engine.ts:828,1155`): la ficha se quedó atrás |
| `cff-89-90.yaml`, `rlisr-57.yaml`, `cff-69-B.yaml`, `cff-30.yaml`, `rfa-2026-2.2.yaml` | **verificado_fuente_primaria** | Verificadas contra el código: correctas. `rlisr-57.pendiente` está **stale** (dice que `operador` no tiene columna `rfc`; `repo.ts:907` la escribe desde la auditoría 13) |
| `lisr-27-III.yaml` | evidencia_corroborante | **No verificable en esta ronda.** Su `advertencia` (`:37-40`) prohíbe citarla sola para negar combustible en efectivo de carga federal; `fiscal.ts:267` la cita sola para un plazo de portal |
| `cff-29-A.yaml` | evidencia_corroborante, `texto_vigente: null` | **No verificable.** El PDF (`engine.ts` `comprobante_no_fiscal`) y `TITULOS.cfdi_cancelado` citan CFF 29-A sobre una ficha sin texto transcrito |
| `criterio-1-LIF-PI.yaml`, `criterio-1-CFF-PI.yaml` | evidencia_corroborante, `texto_vigente: null` | **No verificables.** Sostienen la decisión de no imprimir el IEPS en pesos y las leyendas |
| `rmf-2026-2.7.1.48.yaml`, `rmf-2026-2.7.1.21.yaml` | evidencia_corroborante | **No verificables.** `exigibleDesde: null` — el motor avisa y no declara no deducible: correcto mientras siga null |
| `politica-portales-plazos.yaml` | **sin_verificar**, `jerarquia: 6` | Sostiene el ALTO del plazo: una ficha sin verificar de nivel 6 mueve dinero en el KPI del dueño y silencia el aviso de WhatsApp |
| `cuota-ieps-diesel.yaml` | **NO EXISTE** (15 días de latidos bloqueados) | Correcto que el producto no imprima el estímulo en pesos; sigue sin poder crearse |
| *Sin ficha* | — | **`c_RegimenFiscal`** (el MEDIO de los dos catálogos) y la **tasa de ISR** (el ALTO de "Ahorro generado") no tienen ficha; ambos hallazgos se argumentan sin depender de ellas |

**Trazabilidad ficha→código, peor que en el pase 2.** `rfa-2026-2.9.yaml:42-44`
(`usado_en_codigo`) sigue listando **dos** sitios de `engine.ts`. Hoy la regla
decide en `engine.ts`, `fiscal.ts`, `desde_db.ts`, `repo.ts`, `tools.ts`,
`aviso.ts`, `administracion.ts`, `saas/fiscal.ts` y la pantalla de aterrizaje.
`lif-2026-20-A.yaml:91-94` lista tres sitios; falta `analytics.ts` y las dos
pantallas que hoy citan el artículo.

---

## Lo que revisé y está bien

- **El estímulo de IEPS sigue sin imprimirse en pesos, en las cinco superficies
  que podrían.** `engine.ts:998` (`const iepsAcreditable = 0;`) +
  `acreditable.ts:94-100` entregan **litros**; `page.tsx:298` y
  `combustible-casetas:188` van en litros; `[id]/page.tsx:261-265` documenta que
  `d.ieps` solo puede venir de filas viejas y por eso se conserva; y
  `fiscal.ts:1025-1027` lo declara en `LO QUE ESTE MÓDULO NO HACE`. La confusión
  "IEPS trasladado = estímulo del 20-A" está cerrada. Verifiqué que **nadie**
  escribe `liquidacion.ieps_acreditable` distinto de 0 hoy
  (`grep -rn "ieps_acreditable" src/` → 6 lectores, cero escritores fuera de
  `0013_guardar_liquidacion_tx.sql`, que recibe el 0 del motor).
- **El renglón de peaje del PDF sigue completo.** `acreditable.ts:110-119` lleva
  la condición **en el label** ("— sujeto a elegibilidad"), tono `condicionado`,
  `BASE_ESTIMULO_PEAJE` (dice qué base usó y cuánto cambia con la otra) y
  `CONDICIONES_ESTIMULO_PEAJE` (las cuatro, transcritas de la ficha). Las tres
  superficies de peaje que sobrevivieron el borrado llevan el matiz
  (`[id]/page.tsx:267`, `politicas:276`, `chat.tsx:41`).
- **`/dashboard/politicas` es de solo lectura y lo dice.** `:288-291`: *"Los
  topes fiscales de arriba NO se editan desde aquí: los fija la ley, no la
  flota."* Los tres valores por defecto empatan sus fichas:
  `viaticosTopeFiscalDiarioMxn: 750` (`lisr-28-V.yaml:22`),
  `efectivoTopeMxn: 2000` (`lisr-27-III.yaml:9`), `peajeFactor: 0.5`
  (`lif-2026-20-A.yaml:46`), y `clavesDieselIeps: ['15101505']` — solo diésel,
  la gasolina fuera (`config.ts:109`).
- **El prorrateo de LIVA 5-I proporcional y el tope de LISR 28-V por día están
  bien resueltos.** `engine.ts:889-960`: la proporción se calcula **solo entre
  los timbrados del día** (auditoría 8) y el `monto` de la diferencia es solo el
  exceso de lo timbrado (auditoría 9). Las dos correcciones siguen en pie.
- **`opcionesDe` (lo nuevo de `fiscal.ts`, +21 líneas) es un movimiento fiel.**
  `git diff 20ecbb1..HEAD -- src/lib/likida/fiscal.ts`: sale de
  `contador/comun.tsx` y llega **idéntica** a la derivación que ya usaban
  `tools.ts:116-118` y `desde_db.ts:56-58` — mismo triple estado
  (true/false/undefined), sin cambiar un operador. Mover una función fiscal de
  un archivo de página a la capa de datos **antes** de borrar la página es lo
  correcto: si se hubiera ido con el panel, `/dashboard` habría perdido su
  única fuente de `elegible15` y el motor fiscal del dueño habría tratado a
  toda flota como "sin declarar".
- **CRÍTICO C3 sigue cerrado por la puerta del superadmin, con prueba que cita
  la norma.** `regimen_facilidad_15.test.ts` (4 casos: 624→true, 612→true,
  601→false, 626→false) transcribe el `texto_vigente` de la ficha en su
  encabezado. Es la única prueba del repo que compara una decisión fiscal contra
  el texto de una ficha verificada. Lo que no cubre es la otra puerta — el ALTO
  de arriba.
- **`LEYENDA_CORTA` sobrevivió el borrado** en las dos pantallas que quedan con
  veredicto fiscal (`page.tsx:325`, `[id]/page.tsx:372`), y `leyendaPdf`
  (`leyendas.ts:50-59`) conserva la eximente literal del CFF 89 último párrafo
  ("pueden diferir de los que dé a conocer el SAT") y la referencia al art. 52.
- **`MotorFiscalPeriodo` falla cerrado** con `series === null`
  (`:39-41`: "No se pudo leer el motor fiscal en este momento"), y `KpiDegradado`
  ya distingue "—" de "$0.00" (`resumen-visual.tsx:105-107`).
- **`recordatorio_comprobacion.ts` (lo que dejé pendiente en el pase 2) no
  repite ninguna afirmación fiscal.** `armarRecordatorioComprobacion:129-137`
  pide fotos y no menciona plazos, deducciones ni normas. El cambio de este pase
  (+47) es el `traerTodo` que impide acusar a un chofer por un recorte silencioso
  de PostgREST. Nada fiscal que objetar.
- **`intake/cfdi.ts` completo (292 líneas), revisado por primera vez.** No
  afirma nada fiscal: lee el QR del SAT, valida formato y **dígito verificador**
  del RFC (`rfcChecksumOk:53-74`, con la excepción correcta de los genéricos
  XAXX/XEXX), y separa el QR de verificación de una liga de autofacturación. El
  UUID nunca pasa por OCR.
- **`diagnosticoRetencion` (`fiscal.ts:686-701`) se niega a inventar el 4%** y
  nombra los dos campos exactos que faltarían. Hoy es código muerto (sin
  consumidor), pero el criterio es el correcto.
- **`traerTodo` / `exigir` / `conteo` en todas las lecturas fiscales**
  (`fiscal.ts:751,925`, `repo.ts:856-862`): una lectura recortada lanza en vez
  de devolver medio ejercicio. `getAcumuladoCombustible` falla cerrado y lo
  registra.

---

## Lo que NO alcancé a revisar

- **`facturacion/al_vuelo.ts` (31 KB) y `facturacion/comercios.ts` (34 KB,
  entrada por entrada).** `comercios.ts` es donde viven los `plazo` /
  `plazoVerificado` que el ALTO del plazo consume; solo verifiqué la afirmación
  agregada de la ficha (12 de 13 en `false`), no cada entrada.
- **`facturacion/adaptadores/capufe.ts` completo (1,250+ líneas).** Revisé
  `revisarReceptor` (`:1236-1248`) y el gateo de `:603`; el resto —que teclea
  datos fiscales de la flota en un portal real— sigue sin auditarse.
- **`src/lib/saas/stripe.ts` y el CFDI que Likida EMITE.** Toqué el borde
  (`REGIMENES`, `USOS_CFDI`, `guardarDatosFiscales`) y de ahí salieron dos
  hallazgos; falta el camino completo hasta Facturapi: PUE/PPD, complemento de
  pagos (REP), `MetodoPago` y qué pasa cuando Stripe cobra y el timbrado falla.
- **`intake/consolidado.ts` e `intake/ocr.ts`** (424 y 472 líneas): de dónde
  salen `litros`, `formaPago`, `subTotal` y `producto`, insumos directos de
  cuatro reglas fiscales. `litros` alimenta la única cifra de estímulo que el
  producto imprime.
- **Corrida real del motor con estos escenarios.** No creé archivos en el repo
  (instrucción del brief): todas las cifras salen de leer el código línea por
  línea. Las aritméticas son deliberadamente simples para recomprobarlas a mano.
- **Verificación de las fichas contra el DOF/SAT/diputados**: imposible en este
  entorno (egress bloqueado, undécimo latido consecutivo).
