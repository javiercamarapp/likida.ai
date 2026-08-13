# Cumplimiento fiscal — auditoría 17 · pase 6 (13-ago-2026)

**Nota: 4/10** (igual que el pase 5). Razón del movimiento: **se atacó y subió, y
la deuda nueva se lo comió el mismo día**. `94530da` + `bcf42f3` cerraron
**siete** hallazgos del pase 5 con pruebas que muerden de verdad (A4, M9, M3,
B3, B4, M8-en-el-PDF, B1) y `admin/flotas` dejó de teclear su propio catálogo de
regímenes (A7 **cerrado**): es la mejor ronda de reparación fiscal desde que
existe este archivo, y lo verifiqué caso por caso abajo. Contra eso, el merge de
`master` metió **dos superficies fiscales enteras sin un solo guardarraíl del
rubro** —`intake/archivo.ts` y `agents/analista.ts`—, y en la primera hay un
defecto que **tira páginas de un documento del contralor sin decirlo**. Además,
el arreglo de M8 aterrizó en **una de las tres copias** del mismo renglón: el
PDF quedó impecable, el expediente y el chat siguen imprimiendo "IVA acreditable"
en verde con el artículo al lado y sin un pie. Eso es exactamente lo que el
rubro 8 llama deuda que cobra factura, aplicado a una cifra fiscal.

**Riesgo mayor del rubro, hoy:** el lector de archivos del chat le pide a
`pdf-parse` **las ÚLTIMAS 25 páginas** creyendo que le pide las primeras
(`archivo.ts:59`, `{ last: MAX_PAGINAS_PDF }`; la propia librería documenta
`last` como «*Parse the last N pages (pages total-N+1..total)*»). Un estado de
cuenta de TAG de 30 páginas entra al chat **sin sus páginas 1 a 5** —la portada
con el total del periodo incluida—, el globo de confirmación dice "Páginas
leídas: 25" sin denominador, y el extracto no lleva ninguna marca. El contralor
pide "súmame las casetas de este estado de cuenta" y recibe una cifra que le
falta un pedazo del documento que él mismo subió. Lo reproduje: pdf de 30
páginas → `PAG1..PAG5 = false`, `PAG6..PAG30 = true`, `r.pages` empieza en 6.

---

## Verificación de los arreglos del pase 5 — caso por caso, con el código de hoy

`git show 94530da --stat` · `git show bcf42f3` · las 632 pruebas de
`cuadre/`, `liquidacion/`, `fiscal.test.ts`, `saas/`, `agents/` y
`intake/archivo.test.ts` corren **verdes** (54 archivos, 0 rojos).

| Pase 5 | Estado hoy | Cómo lo comprobé |
|---|---|---|
| **A4** — el efectivo dentro del 15% no acreditaba IVA | **CERRADO, y bien** | `engine.ts:1084` `SIN_IEPS_CON_IVA = ['combustible_efectivo_dentro15','efectivo_sobre_15']`, separada de `SIN_ACREDITAMIENTO` (`:1059`); `engine.ts:1131` acredita el IVA y `:1133` `if (soloIva) continue;` **antes** del bloque del estímulo. La distinción de la ficha —«Conserva la DEDUCCIÓN para ISR. NO habilita el acreditamiento **del IEPS**», `rfa-2026-2.9.yaml:37-39`— quedó implementada literal, y la proporción de `liva-5.yaml:50-55` viaja en `proporcionDeducible` |
| **M9** — el `'04'` del OCR se tomaba por tarjeta de crédito | **CERRADO** | `engine.ts:910` `const conTarjetaDeCredito = (g) => g.formaPago === '04' && g.xmlVerificado === true;` y `:920-923` distingue "el ticket dice tarjeta" de "no hay dato". Ahora el `'04'` solo cuenta cuando viene del `c_FormaPago` del XML, que sí separa `04` de `28` |
| **M3** — combustible en efectivo sin fecha contra un denominador que lo excluye | **CERRADO** | `engine.ts:329-330` `const mismoEjercicio = anioComprobante !== null && anioComprobante === input.anioEjercicio;` con el comentario citando `repo.ts` `.gte('fecha')`/`.lte('fecha')` |
| **B3** — el `continue` del fail-closed apagaba el resto de la revisión | **CERRADO** | `engine.ts:341-348`: el `continue` desapareció y el comentario enumera lo que se llevaba (monto discrepante, CFDI cancelado, EFOS, complemento) |
| **B4** — litros agregados sin fecha de compra | **CERRADO, con la disciplina correcta** | `acreditable.ts:132-152` `desgloseLitrosPorFecha` **solo imprime si reconstruye exactamente el total** (`Math.abs(suma - totalLitros) > 0.001 → null`), y si no, `NOTA_LITROS_SIN_DESGLOSE` (`:119-122`) dice que viene agrupado. No inventa el reparto |
| **M8** — "IVA acreditable (LIVA art. 5)" en verde y sin pie | **CERRADO EN EL PDF · ABIERTO EN LAS OTRAS DOS COPIAS** | `acreditable.ts:178-185` ya va `tono: 'condicionado'` con `NOTA_IVA_ACREDITABLE` (`:90-93`), que nombra los dos requisitos que Likida sí comprueba sin inventar fracciones. Pero `[id]/page.tsx:273` y `chat.tsx:130,137` no cambiaron → **M8b, abajo** |
| **B1** — el tope de alimentación aplicado al concepto genérico `viaticos` | **CERRADO** | `engine.ts:1028-1032`: conserva el tope por criterio conservador **y declara el supuesto en la nota** («el tope de LISR 28-V es solo de ALIMENTACIÓN: el hospedaje nacional no lleva tope… si es hospedaje, reclasifícalo»). Es la forma correcta: no cambia el dinero a ciegas, deja de afirmarlo como hecho |
| **A7** — dos catálogos de `c_RegimenFiscal` divergentes | **CERRADO** | `admin/flotas/page.tsx:232-234` ahora mapea `REGIMENES` de `saas/fiscal.ts`, **y agrega `<option value="">Sin declarar</option>` (`:220`)**. Las 8 claves que el CHECK rechazaba y las 3 que escondía desaparecieron de una vez |
| **A6** — "la forma de pago no es `01`" ≠ "el medio de pago lo acepta la ley" | **PARCIAL — se cerró el valor `99`, no la clase** | `engine.ts:107,395-414` y `:1165-1166`. El propio mensaje de `94530da` lo anota: *"bcf42f3 cerro el 99 del PPD, no la CLASE… 12, 17, 23 y 30 todavia salen deducibles"* → **A6, abajo** |
| **C4** — el 15% contra "el combustible que Likida vio" | **ABIERTO por decisión de producto** | `git diff` vacío; las líneas se movieron a `engine.ts:360,377` y `repo.ts:831-833,846`. No gasté la ronda aquí |

**Lo que este pase pide anotar sobre el método del reparador:** las siete
pruebas nuevas (`iva_combustible_efectivo_15`, `tarjeta_credito_solo_del_xml`,
`combustible_sin_fecha_15`, `fail_closed_15_no_apaga_revision`,
`litros_por_fecha`, `iva_condicionado`, `viaticos_generico_tope`) leen el
comportamiento, no el texto del archivo, y `pdf_bloque_acreditable.test.ts` lee
el **PDF renderizado**. Eso es lo que hace verificable el "cerrado" de arriba.

---

## Fichas de `normas/` que abrí en esta ronda, con la línea transcrita

`normas/.latido-vigilancia` declara la **duodécima** corrida consecutiva
bloqueada por egress (403 en el CONNECT a `sidofqa.segob.gob.mx` y
`www.sat.gob.mx`, registrado a las 14:19:36 UTC del 11-ago). **Ninguna ficha se
pudo re-verificar contra la fuente en esta ronda:** todo lo que este reporte
afirma sobre las normas sale del texto ya transcrito, y las
`evidencia_corroborante` / `sin_verificar` quedan anotadas como **no
verificables en esta ronda**.

| Ficha | Estado | Línea transcrita | Código que la implementa | Veredicto |
|---|---|---|---|---|
| `rfa-2026-2.9.yaml:16-17` | **verificado_fuente_primaria** (DOF/SIDOF 5780249) | «…siempre que estos no excedan el 15 por ciento **del total de los pagos efectuados por consumo de combustible para realizar su actividad**.» | `engine.ts:360` `const tope = 0.15 * total;` · `repo.ts:831-833` | **MAL** → C4 |
| `rfa-2026-2.9.yaml:37-39` | ídem, `limite_importante` | «Conserva la DEDUCCIÓN para ISR. NO habilita el acreditamiento **del IEPS**: son dos beneficios distintos y el efectivo solo salva uno.» | `engine.ts:1084` `SIN_IEPS_CON_IVA` + `:1133` | **BIEN** (A4 cerrado) |
| `lisr-27-III.yaml:9-14` | evidencia_corroborante — *no verificable en esta ronda* | «…transferencia electrónica de fondos…; cheque nominativo de la cuenta del contribuyente, tarjeta de crédito, de débito, de servicios, o los denominados **monederos electrónicos autorizados** por el Servicio de Administración Tributaria.» | `engine.ts:310,395,415` — lista NEGRA de dos claves (`'01'`, `'99'`) | **MAL** → A6 |
| `lisr-27-III.yaml:16-19` | ídem | «Tratándose de la adquisición de combustibles…, el pago deberá efectuarse **en la forma señalada en el párrafo anterior**, aun cuando… no excedan de $2,000.00» | ídem | **MAL** → A6 |
| `lisr-27-III.yaml:37-40` | ídem, `advertencia` | «**NUNCA citar esta fracción sola** para declarar no deducible un combustible pagado en efectivo de una flota de carga federal.» | `fiscal.ts:267` `norma: 'LISR 27-III'` para un plazo de portal, ahora **servido a un LLM** por `chat-tools.ts:97` | **MAL** → A3 |
| `politica-portales-plazos.yaml:30-35` | **`sin_verificar`**, `jerarquia: 6` | «**ESTO NO ES UNA NORMA FISCAL**… El plazo LEGAL para pedir factura es **todo el ejercicio**… El producto **NUNCA** debe presentar estos plazos como una obligación fiscal.» | `fiscal.ts:264-268` (`gravedad: 'perdida'`, `norma: 'LISR 27-III'`) | **MAL** → A3 |
| `lif-2026-20-A.yaml:52-56` | **verificado_fuente_primaria**, `condiciones` (las cuatro) | «Dedicarse EXCLUSIVAMENTE al transporte terrestre de carga, pasaje o turístico · Usar la **RED NACIONAL DE AUTOPISTAS DE CUOTA** (no cualquier caseta) · Ingresos totales anuales del ejercicio **MENORES a $300,000,000** · No ser parte relacionada (LISR art. 179)» | `acreditable.ts:191-195` las lleva **completas** en el PDF; `chat-tools.ts:74` `peajeAcreditable50pct` las lleva **cero** | PDF **BIEN** · tool **MAL** → A8 |
| `lif-2026-20-A.yaml:26-30` | ídem | «…la cuota… **vigente en el momento en que se haya realizado la… adquisición del diésel**…, por el número de litros» | `engine.ts:1097` `const iepsAcreditable = 0;` · `acreditable.ts:169-176` (litros + desglose por fecha) | **BIEN** — la confusión "IEPS trasladado = estímulo" sigue cerrada y B4 se cerró |
| `lif-2026-20-A.yaml:41-44` | ídem | «que obtengan **en el ejercicio fiscal en el que hagan uso** de la infraestructura… ingresos totales anuales… menores a 300 millones» | `chat/page.tsx:33` `getAcreditables(tenantId)` **sin ventana** → `chat.tsx:130,132` «este periodo» | **MAL** → A5 |
| `liva-5.yaml:43-55` (fr. I) | **verificado_fuente_primaria** | «se consideran estrictamente indispensables las erogaciones… **que sean deducibles para los fines del impuesto sobre la renta**» / «…**en la proporción** en la que dichas erogaciones sean deducibles» | `engine.ts:1126,1131` `proporcionDeducible` | **BIEN** |
| `liva-5.yaml:78-82` (`riesgo_actual`) | ídem — la transcripción **termina en la fr. II** | «Si el artículo exige alguna condición adicional que hoy no se valida, **la cifra impresa está de más**. Es una cifra que el contralor usa.» | `acreditable.ts:183` (pie, **BIEN**) vs `[id]/page.tsx:273` y `chat.tsx:130` (**sin pie**) | **MAL** → M8b |
| `criterio-1-LIF-PI.yaml:15-18` | evidencia_corroborante, `texto_vigente: null` | «Calcularlo con la entera es práctica indebida — de quien lo hace **Y de quien le presta el servicio**.» | Sostiene que el producto no imprima el estímulo de diésel en pesos; sigue sin imprimirlo en las 5 superficies | **BIEN mientras siga así** |
| `lisr-28-V.yaml:21-29` | **verificado_fuente_primaria** | «gastos de viaje destinados a la **alimentación**… no exceda de $750.00 diarios» / «sólo procederá cuando el pago se efectúe mediante **tarjeta de crédito**» | `engine.ts:953,1028-1032` (B1) · `engine.ts:910` (M9) | **BIEN** — los dos cerrados |
| `cff-30`, `cff-69-B`, `cff-89-90`, `rlisr-57`, `rfa-2026-2.2` | verificado_fuente_primaria | — | Cotejadas contra el código: sin cambio desde el pase 5 | **BIEN** |
| `cff-29-A`, `rmf-2026-2.7.1.21`, `rmf-2026-2.7.1.48`, `criterio-1-CFF-PI` | evidencia_corroborante / `exigibleDesde: null` | — | `engine.ts:614-623` sigue **avisando** y nunca declarando no deducible | **BIEN mientras siga `null`** |
| *sin ficha* | — | `c_FormaPago`, `c_MetodoPago`, `Moneda`/`TipoCambio` del CFDI 4.0 | A6 y M11 se argumentan **sin depender de ellas** (contradicción interna al repo y documentación de la propia librería) | — |

**Trazabilidad ficha→código, peor que en el pase 5.** `lif-2026-20-A.yaml:91-94`
(`usado_en_codigo`) lista tres sitios; hoy el artículo se cita además en
`chat-tools.ts:63`, `chat.tsx:110`, `politicas/page.tsx:276` y
`combustible-casetas/page.tsx:200`. `liva-5.yaml:83-85` lista dos; falta
`acreditable.ts`, `chat.tsx:130` y `[id]/page.tsx:273`. Cada superficie nueva
que cita un artículo y no entra a la ficha es un sitio donde el próximo cambio
de norma no se va a buscar.

---

## Hallazgos

### [CRÍTICO · NUEVO] N1 — el lector de archivos del chat pide a `pdf-parse` las ÚLTIMAS 25 páginas creyendo que pide las primeras: un estado de cuenta de 30 páginas entra sin la 1 a la 5, y nada lo dice

`src/lib/likida/intake/archivo.ts:22,54-55,59,61,73` ·
`src/app/dashboard/chat.tsx:253` (el globo que pinta `meta`) ·
`node_modules/pdf-parse/dist/pdf-parse/esm/ParseParameters.d.ts:22`

Código, literal:

```
archivo.ts:22    const MAX_PAGINAS_PDF = 25;
archivo.ts:54-55 // pdf-parse v2: clase PDFParse sobre pdfjs (legacy build, corre en Node
                 // sin worker). `last` acota páginas — el extracto igual recorta chars.
archivo.ts:59    const r = await parser.getText({ last: MAX_PAGINAS_PDF });
archivo.ts:61    const paginas = r.pages?.length ?? 0;
archivo.ts:73    meta: [['Páginas leídas', paginas], ['Caracteres leídos', Math.min(texto.length, MAX_EXTRACTO)]],
```

La librería documenta lo contrario de lo que el comentario asume:

> «**Parse the last N pages (pages total-N+1..total).** Ignored when `partial`
> is provided.» — `pdf-parse/dist/pdf-parse/esm/ParseParameters.d.ts:22-24`

**Lo reproduje** (pdf-lib, 30 páginas con `PAG1 importe 1001.00` … `PAG30
importe 1030.00`, `pdf-parse@2.4.5`, el mismo que trae `package.json:32`):

```
PAG1 false   PAG2 false   PAG3 false   PAG4 false   PAG5 false
PAG6 true    PAG25 true   PAG26 true   PAG30 true
r.pages → [6, 7, 8, 9, 10, 11, …]     r.total → 30     r.pages.length → 25
```

**Escenario, con cifras.** El contralor de Transportes Innovativos sube al chat
su estado de cuenta mensual de TAG (IAVE/PASE): **30 páginas**, ~$4,000 de
casetas por página, **$120,000** el mes, y la **página 1 es el resumen con el
total del periodo**. Pregunta: *"¿cuánto llevo de casetas según este estado de
cuenta?"*.
- `leerPdf` devuelve el texto de las páginas **6 a 30** — $100,000 de casetas.
- El globo del chat (`chat.tsx:253`, que pinta `meta` como tabla) dice
  **"Páginas leídas: 25"**. Sin denominador. `r.total` (= 30) está en la
  respuesta de la librería y **no se lee**.
- El extracto que viaja al agente **no lleva ninguna marca**: el único marcador
  que existe es el de `recortar()` (`archivo.ts:43`,
  `…[recortado: el archivo sigue]`), que habla del **final** del texto — y aquí
  lo que falta es el **principio**. Con un estado de cuenta real el corte de
  15,000 caracteres también dispara, así que el contralor lee "el archivo
  sigue" y concluye que le falta la cola, cuando además le falta la cabeza.
- La guardia de cifras no puede atrapar nada: la suma de lo que el agente **sí**
  vio está respaldada por definición (`analista.ts:338`).

**Consecuencia.** El contralor obtiene $100,000 donde su propio papel dice
$120,000 — $20,000 de diferencia, sobre el concepto que alimenta el estímulo de
peaje del LIF 20-A—, y las dos partes del producto que podrían avisarle
(el globo de confirmación y el extracto) le dicen que la lectura fue completa.
Es el modo de falla que `CLAUDE.md` prohíbe por nombre: no se inventa una cifra,
se **omite** una parte del documento y se presenta el resultado como total.

**Causa raíz probable:** se leyó `last` como "tope de páginas" en vez de "las
últimas N", y la única prueba del camino (`archivo.test.ts:39-49`) usa un PDF de
**una** página, donde `first N` y `last N` son indistinguibles.

*Intenté refutarlo:* ¿lo salva el tope de caracteres? No — es ortogonal y
además desorienta (ver arriba). ¿Lo salva el aviso de escaneo
(`archivo.ts:62-70`)? No: solo dispara con `texto.length < 40`, y aquí hay
texto de sobra. ¿Aplica solo a PDFs raros? Aplica a **todo PDF de más de 25
páginas**, que es exactamente la forma de un estado de cuenta mensual de TAG o
de monedero — el documento que `cfdi_xml.ts:15-18` identifica como **~54% del
gasto real de una flota**. Con ≤25 páginas no hay efecto, que es por qué el demo
nunca lo enseña.

---

### [CRÍTICO · NUEVO] N2 — el agente que le habla de fiscal al contralor no pasa por `guardiaFundamento`, y su única guardia es numérica: una afirmación fiscal sin dígitos sale intacta

`src/lib/agents/analista.ts:168-187,340-400` (no importa `fundamento.ts`) ·
`src/lib/agents/analista.ts:142` (`BLANCOS`) ·
`src/lib/likida/normas/fundamento.ts:14-19` · contraste vivo
`src/lib/likida/processor.ts:33,1998` · `src/lib/agents/prompts.ts:63-65`

El repo ya tiene la guardia, escrita para este comprador exacto:

```
fundamento.ts:9-11   Frente a un contralor con fiscalista, una cita inventada cuesta más que un
                     número mal puesto: el número se corrige en la siguiente frase, la credibilidad no.
fundamento.ts:14-16  LA REGLA: el modelo solo puede referenciar una norma que una tool le devolvió
                     EN ESE TURNO. Lo demás se quita. Sin esto, "no alucina el artículo" es una
                     ESPERANZA SOBRE EL PROMPT; con esto es una propiedad del código.
```

`grep -rn "guardiaFundamento" src/` → **un solo consumidor**:
`processor.ts:33,1998`, el agente de **WhatsApp que habla con el chofer**. El
agente del panel —el que habla con el **contralor**, que es a quien la cabecera
de `fundamento.ts` nombra— no la importa. Su único filtro es
`cifrasRespaldadas`, y `analista.ts:171` deja ver que solo mira números:

```
analista.ts:170-176   for (const b of bloques) {
                        if (b.tipo === 'texto') extraerNumeros(b.texto, usadas);
                        …
analista.ts:177-185   for (const n of usadas) { … }
analista.ts:186       return true;
```

Con `usadas` vacío el bucle no corre y **devuelve `true`**. Y su prompt
autoriza explícitamente la conversación fiscal sin tools:

```
prompts.ts:38   …puedes explicar conceptos… lo único anclado a tools son las CIFRAS, no tu criterio.
prompts.ts:63   Puedes citar el fundamento SOLO si vino en el dato de la tool…
prompts.ts:67   VELOCIDAD — LO TRIVIAL VA DIRECTO, SIN TOOLS: …Todo eso se contesta en UNA pasada…
```

**Escenario 1, sin un solo dígito.** El contralor escribe: *"¿el diésel que
pago en efectivo me lo puedo deducir?"*. Es una pregunta de **concepto**, que
`prompts.ts:38` autoriza a contestar con criterio propio y sin tools. El modelo
(`flash-lite`, `temperature: 0.2`) entrega un bloque `texto`:
*"Sí: la Resolución de Facilidades Administrativas te lo permite mientras sea
combustible de tu actividad."* — sin porcentaje, sin tope, sin la condición de
régimen. `extraerNumeros` sobre ese texto → **conjunto vacío** → `usadas` vacío
→ `cifrasRespaldadas` **`true`** → sale tal cual. La afirmación omite las cuatro
condiciones de `rfa-2026-2.9.yaml:32-36` y contradice
`lisr-27-III.yaml:37-40`, que prohíbe justamente afirmar de un lado o del otro
sin la otra norma.

**Escenario 2, el número del artículo decide la cita.** `BLANCOS`
(`analista.ts:142`) es `[0..12, 50, 100]`. O sea: **"artículo 5 de la LIVA"
pasa siempre** (5 ∈ BLANCOS), y `liva-5.yaml:78-82` es precisamente la ficha
que dice de sí misma que su **interpretación no está dictaminada** y que «si el
artículo exige alguna condición adicional que hoy no se valida, la cifra impresa
está de más». En cambio "artículo 27" (27 ∉ BLANCOS) solo pasa si el 27 aparece
por casualidad en un KPI o en una fecha del turno. **La validez de una cita
fiscal la está decidiendo si el número del artículo cae por debajo de 13.** Eso
no es una regla, es una coincidencia.

**Consecuencia.** Likida vende «cada veredicto con su fundamento citado». En la
superficie donde el fundamento importa —el contralor, que lo va a repetir ante
su contador— el fundamento es lo único del turno que **nadie verifica**.
`criterio-1-LIF-PI.yaml:15-18` alcanza a «quien le **presta el servicio**»: una
cita inventada aquí no es un error del cliente, es una práctica de Likida.

**Causa raíz probable:** el agente nuevo se construyó copiando `guardiaCifras`
(lo dice `analista.ts:14-17`) y no su gemela `guardiaFundamento`, que vive dos
directorios más allá y que el agente viejo sí carga.

*Intenté refutarlo:* ¿lo cubre `analista_prompt.test.ts`? Fija que las frases
existan **en el prompt** (`:26-29`, `SOLO si vino en el dato de la tool`), que
es literalmente la "esperanza sobre el prompt" que `fundamento.ts:15` descarta.
¿Lo cubre la red determinística de `analista.ts:382-399`? Solo actúa cuando
`cifrasRespaldadas` **falla**; con un texto sin dígitos nunca falla. ¿Lo cubre
`validarBloques`? Valida forma (tipos, longitudes), no contenido normativo.
¿Está el fundamento en el resultado de las tools, como el prompt promete?
**No**: `chat-tools.ts:74` no devuelve ninguna cadena de norma —el artículo vive
en la `description` del schema (`:63`)—, así que la regla del prompt, leída
literal, es inaplicable y el modelo tiene que decidir solo.

---

### [CRÍTICO · REINCIDENTE · pendiente por decisión de producto] C4 — el 15% se mide contra "el combustible que Likida vio", no contra el total de pagos por consumo de combustible del ejercicio

`src/lib/likida/cuadre/engine.ts:360,377` · `src/lib/likida/repo.ts:831-833,846` ·
ficha `normas/rfa-2026-2.9.yaml` (**verificado_fuente_primaria**, DOF/SIDOF 5780249)

> «…siempre que estos no excedan el 15 por ciento **del total de los pagos
> efectuados por consumo de combustible para realizar su actividad**.»
> — `rfa-2026-2.9.yaml:16-17`

```
engine.ts:360   const tope = 0.15 * total;
engine.ts:377   nota: `…el ejercicio lleva ${mxn(acumulado)} de combustible en efectivo contra un tope
                de ${mxn(tope)} (15% de ${mxn(total)})…`
repo.ts:831-833 .or('concepto.eq.diesel,clave_prod_serv.in.(…)').gte('fecha', `${ejercicio}-01-01`)…
```

**Escenario (recomprobado, sin cambio).** Flota elegible, ejercicio 2026.
$1,200,000 de diésel facturado en terminal que nunca pasa por WhatsApp; por
WhatsApp llegan $80,000, de ellos **$30,000 en efectivo**. Motor:
`tope = $12,000` → **$18,000 a `totalNoDeducible`**, rotulado "15% de
$80,000.00". Norma: el 15% de $1,280,000 son $192,000; los $30,000 son el
2.34%. Lo correcto es **$0.00 no deducible**.

**Consecuencia.** El contralor archiva una pérdida de deducción que no existe, y
el rótulo es falso como afirmación sobre el ejercicio de su flota.
**Causa raíz probable:** el denominador se construyó sobre la única tabla que el
producto tiene, y ningún renglón acota la afirmación a ese alcance.
**Confirmo que sigue pendiente por producto, no por código:** `engine.ts` y
`repo.ts` no se tocaron aquí; la propia ficha lo dice en
`pendiente_en_producto:45-47` («el CONTADOR del 15% por ejercicio no existe
todavía»). No gasté la ronda aquí.

---

### [ALTO · NUEVO] A8 — la tool `acreditables_periodo` le entrega al agente el peaje del LIF 20-A y el IVA del LIVA 5 **desnudos**: sin las cuatro condiciones y sin el pie, que es todo lo que el PDF sí lleva

`src/lib/agents/chat-tools.ts:58-76` (especialmente `:63` y `:74`) ·
contraste `src/lib/likida/liquidacion/acreditable.ts:64-67,90-93,186-196` ·
fichas `normas/lif-2026-20-A.yaml` y `normas/liva-5.yaml` (**verificado_fuente_primaria**)

> «…que se dediquen **exclusivamente** al transporte terrestre público y
> privado, de carga o pasaje…, **que utilizan la Red Nacional de Autopistas de
> Cuota**, que obtengan… ingresos totales anuales… **menores a 300 millones de
> pesos**… El estímulo **no podrá ser aplicable** por las personas morales que
> se consideran **partes relacionadas** de acuerdo con el artículo 179…»
> — `lif-2026-20-A.yaml:38-51`; sus cuatro condiciones enumeradas en `:52-56`.

El PDF las lleva completas y **en el propio label**, con la razón escrita:

```
acreditable.ts:188-190  // La condición va en el LABEL y no solo en el pie: el renglón es lo que se
                        // skimmea, y "Estímulo de peaje 50%" a secas se lee como un derecho ya ganado.
acreditable.ts:191      label: 'Estímulo de peaje 50% (LIF 2026 art. 20, ap. A) — sujeto a elegibilidad',
acreditable.ts:194      pies: [BASE_ESTIMULO_PEAJE, CONDICIONES_ESTIMULO_PEAJE],
```

La tool entrega lo contrario:

```
chat-tools.ts:63  description: 'Acreditables fiscales del ejercicio en curso: IVA MXN, peaje al 50% MXN y
                  litros de diésel elegibles para el estímulo (LIF 2026 Art. 20-A)…'
chat-tools.ts:74  return { periodo: …, moneda: 'MXN', ivaAcreditable: a.iva,
                           peajeAcreditable50pct: a.peaje, litrosDieselElegibles: a.litrosDiesel };
```

Ningún campo `sujetoAElegibilidad`, ninguna condición, ningún pie. Y el motor
que produjo esa cifra **no verifica ninguna de las cuatro**: `engine.ts:1135`
`if (g.concepto === 'caseta' && (g.subTotal ?? 0) > 0) peajeAcreditable += …` —
los hallazgos H5 y H6 de la propia ficha (`lif-2026-20-A.yaml:69-80`,
severidad media, «El estímulo se aplica sin verificar si el cliente califica»).

**Escenario, con cifras.** Una flota que además renta unidades a una empresa
hermana (parte relacionada, LISR 179) o que pasa por casetas estatales fuera de
la Red Nacional. El contralor pregunta en el chat: *"¿cuánto puedo acreditar de
casetas este año?"*. `acreditables_periodo` devuelve
`peajeAcreditable50pct: 94_500` y `periodo: 'Ejercicio 2026'`. El agente entrega
`{tipo:'cifra', valor: 94500, formato:'mxn', nota:'Peaje acreditable 50% del
ejercicio 2026'}`; `chat.tsx:61` lo pinta como **$94,500.00** en la cifra grande.
`prompts.ts:63` le autoriza citar «LIF 2026 Art. 20-A» *"en acreditables"*, así
que el artículo puede ir al lado. Las cuatro condiciones **no existen en ningún
punto del turno**. El mismo dinero, en el PDF, sale con "— sujeto a
elegibilidad" en el título y dos pies. Idéntico con el IVA: la tool entrega
`ivaAcreditable` a secas y el PDF lo entrega con `NOTA_IVA_ACREDITABLE`
(«El artículo exige más requisitos que Likida **NO** verifica. Confírmelo con su
contador antes de acreditarlo», `acreditable.ts:90-93`).

**Consecuencia.** Dos superficies del mismo producto dicen cosas distintas sobre
la misma cifra fiscal, y la que se lee primero —el chat, una de las dos páginas
que existen hoy— es la que se quitó los descargos. Si la flota no califica, el
producto le entregó el estímulo con el artículo al lado: es la conducta que
`acreditable.ts:59-62` identifica como alcanzada por el criterio 1/LIF/PI, «esa
práctica sería de Likida, no del cliente».
**Causa raíz probable:** `chat-tools.ts` se escribió mapeando los campos de
`Acreditables` (`analytics.ts:547-554`), que es una estructura de números, sin
pasar por `filasAcreditables`, que es donde vive el contrato del rubro
(«una cifra en el papel con un artículo citado al lado es una AFIRMACIÓN»,
`acreditable.ts:9-11`).

*Intenté refutarlo:* ¿lo cubre el cierre obligatorio del prompt («Toda lectura
fiscal cierra con: esto es el motor de reglas con fundamento citado, no un
dictamen», `prompts.ts:64`)? Es el descargo **genérico** de responsabilidad, no
un qualifier de este renglón — exactamente la distinción que
`acreditable.ts:29-31` hace por escrito para no confundir un pie con la leyenda
del CFF 52. ¿Lo cubre `chat.tsx:132`? Esa línea —la del camino rápido, sin
LLM— **sí** dice "sujeto a elegibilidad"; es el propio repo demostrando que sabe
cómo se dice, dos archivos más allá.

---

### [ALTO · NUEVO] N3 — el lector de Excel entrega las fechas como número de serie: la columna "Fecha" de la hoja del contralor llega al agente (y al respaldo de la guardia) como 46,240

`src/lib/likida/intake/archivo.ts:88` · `src/lib/agents/analista.ts:338` ·
`src/lib/agents/prompts.ts:50`

```
archivo.ts:88   const filas = XLSX.utils.sheet_to_json<…>(libro.Sheets[h],
                  { header: 1, raw: true, defval: '' });
analista.ts:338 if (opts.documento) extraerNumeros(opts.documento.extracto, respaldo);
prompts.ts:50   4. SIEMPRE declara la ventana que usaste ("últimos 7 días", "el ejercicio 2026").
                Una cifra sin su "cuándo" es una cifra rota.
```

**Lo reproduje** con el mismo `xlsx@0.18.5` de `package.json:38`, sobre una hoja
de cuatro columnas (`Fecha | Concepto | Monto | IVA %`) con dos cargas de agosto
de 2026:

```
Fecha | Concepto | Monto | IVA %
46240 | Diesel   | 18560 | 0.16
46241 | Caseta   | 1240  | 0.16
```

`raw: true` devuelve el valor subyacente de la celda, no el formateado: la fecha
`06/08/2026` es el serial **46240**, y el `16%` es **0.16**. `XLSX.read` acepta
`cellDates: true` justo para esto y no se usa; ningún comentario del archivo
declara la decisión.

**Escenario, con cifras.** El contralor sube su *"control de diésel
agosto.xlsx"*: 60 renglones, columna A con las fechas de carga, columna D con
los montos ($3,000–$25,000 por carga). Pregunta: *"¿cuánto cargué la primera
semana de agosto?"*.
1. El agente recibe 60 seriales de cinco dígitos bajo el encabezado "Fecha" y
   **ninguna fecha legible**. No puede cumplir `prompts.ts:50` —declarar la
   ventana— porque el dato que la define no está en el extracto.
2. Peor: esos 60 seriales entran al respaldo de la guardia
   (`analista.ts:338`). **46,240 y 46,241 caen exactamente en el rango de pesos
   de una carga de diésel de una flota mediana**, así que el agente puede
   entregar `{tipo:'cifra', valor: 46240, formato:'mxn'}` y `chat.tsx:61` lo
   pinta como **$46,240.00**. La guardia lo aprueba: el número **sí** está en el
   archivo del usuario. Es la única guardia del producto contra la invención, y
   la fuente que la alimenta le está metiendo fechas disfrazadas de pesos.
3. Y en la otra dirección: `IVA % = 0.16` en vez de 16, así que cualquier lectura
   de tasa que el agente haga sobre esa hoja sale cien veces menor.

**Consecuencia.** El caso de uso que justificó la superficie entera —*"quiero
que tenga capacidad para leer cualquier tipo de archivo"*, `archivo.ts:2-3`— es
la hoja de control de gastos del contralor, y su columna más importante después
del monto es la fecha. Hoy el agente no puede fechar nada de un Excel, y las
fechas se le presentan a la guardia como montos válidos.
**Causa raíz probable:** `raw: true` se eligió para conservar los números sin
formatear (correcto para montos) sin considerar que el mismo flag desactiva la
conversión de fechas.

*Intenté refutarlo:* ¿lo salva el encabezado "Fecha"? Le da al modelo una pista,
no un dato — y no le da absolutamente nada a `extraerNumeros`, que es código
determinístico y no lee encabezados. ¿Lo salva que `formato` lo elige el modelo?
Al revés: el modelo es quien pone `formato:'mxn'`, y nada lo audita. ¿Lo cubre
`archivo.test.ts`? Sus dos casos de hoja (`:7-23`) usan solo texto y números;
no hay una sola celda de fecha en la suite.

---

### [ALTO · REINCIDENTE · superficie nueva] A5 — `/dashboard/chat` dice "IVA acreditable **este periodo** (LIVA, Art. 5)" sobre una consulta de **todo el histórico**

`src/app/dashboard/chat/page.tsx:33` · `src/app/dashboard/chat.tsx:110,130,132,137-139` ·
`src/lib/likida/analytics.ts:42-47,536,543` · contraste vivo
`src/app/dashboard/inicio-contenido.tsx:76-87` y `src/app/dashboard/estado.test.ts:178-181`

El rail del Asistente que el pase 5 señaló desapareció (`4b849e3`), y el mismo
defecto reapareció en la página dedicada:

```
chat/page.tsx:33     getAcreditables(tenantId).catch(…)          ← SIN ventanaDias
analytics.ts:42-46   if (!ventanaDias) return null;              ← corteVentana → null
analytics.ts:543     return (corte ? q.gte('created_at', corte) : q)…   ← la consulta NO filtra
chat.tsx:130         `${mxn(acred.iva)} de IVA acreditable este periodo (LIVA, Art. 5).`
chat.tsx:110         `${litros(acred.litrosDiesel)} elegibles para el estímulo este periodo.`
chat.tsx:132         `${mxn(acred.peaje)} de peaje acreditable (50%) este periodo…`
```

Y el mismo dato, en la otra página, sí lleva ventana:

```
inicio-contenido.tsx:87   safe<Acreditables>(() => getAcreditables(tenantId, diasEjercicio))
estado.test.ts:178-181    expect(llamada).toMatch(/diasEjercicio/)    ← la prueba solo mira inicio-contenido
```

**Escenario, con cifras.** Transportes Innovativos opera con Likida desde
septiembre de 2025. Acumulado histórico de `liquidacion.iva_acreditable`:
**$412,830**; del ejercicio 2026: **$268,140**. El contralor entra a *Preguntar
a la IA*, escribe "IVA", y lee **"$412,830.00 de IVA acreditable este periodo
(LIVA, Art. 5)"**. Abre el Resumen y la misma flota le da **$268,140.00** bajo
"Tu motor fiscal — Ejercicio 2026". Dos cifras fiscales del mismo producto para
el mismo concepto, y la que trae el artículo citado es la que mezcla ejercicios.

**Consecuencia.** El IVA acreditable es una cifra que se declara por periodo; la
que el chat entrega arrastra el ejercicio anterior, ya declarado. Rompe las dos
reglas de `CLAUDE.md` a la vez: el rótulo no es verdad, y la cifra no se puede
cruzar contra el PDF.
**Causa raíz probable:** el guardarraíl que existe (`estado.test.ts:178-181`)
está amarrado a `PAGINA` = `inicio-contenido.tsx`; cada superficie nueva que
llame `getAcreditables` nace fuera de él.
(**REINCIDENTE** del pase 5 y del 4, con la superficie cambiada.)

*Nota adicional del mismo mecanismo, sin hallazgo aparte:* aun **con** ventana,
`getAcreditables` filtra por `liquidacion.created_at`, que es cuándo se creó la
fila, no la fecha fiscal de los comprobantes. Una liquidación cerrada el
3-ene-2026 sobre CFDIs de diciembre de 2025 cuenta como "Ejercicio 2026" en
`chat-tools.ts:74` y en el Resumen. Lo anoto aquí porque es el mismo campo y
porque el arreglo de A5 debería resolver los dos, no uno.

---

### [ALTO · REINCIDENTE] A6 — la regla de LISR 27-III sigue escrita como lista NEGRA de dos claves (`01`, `99`) y no como la lista BLANCA de la ley: `12`, `15`, `17`, `23` y `30` salen impresos "Deducible para ISR", con IVA acreditado y litros contados

`src/lib/likida/cuadre/engine.ts:107,310,395,415,1165-1166` ·
ficha `normas/lisr-27-III.yaml` (evidencia_corroborante — *no verificable en esta ronda*)

> «…**transferencia electrónica de fondos** desde cuentas abiertas a nombre del
> contribuyente…; **cheque nominativo** de la cuenta del contribuyente, **tarjeta
> de crédito, de débito, de servicios**, o los denominados **monederos
> electrónicos autorizados** por el Servicio de Administración Tributaria.»
> — `lisr-27-III.yaml:9-14`. Y `:16-19`: «Tratándose de la adquisición de
> combustibles…, el pago deberá efectuarse **en la forma señalada en el párrafo
> anterior**, aun cuando… no excedan de $2,000.00».

La ley enumera **seis** claves permitidas del `c_FormaPago` (02, 03, 04, 05, 28,
29). El motor sigue implementando **dos prohibidas**:

```
engine.ts:107    const MEDIO_PAGO_POR_DEFINIR = '99';
engine.ts:310    if (g.formaPago === '01' && esCombustible) { …
engine.ts:395    } else if (g.formaPago === MEDIO_PAGO_POR_DEFINIR) { …
engine.ts:415    } else if (g.formaPago === '01' && !esCombustible && …) { …
engine.ts:1165   const pagoElectronico = !!g.formaPago && g.formaPago !== '01'
engine.ts:1166     && g.formaPago !== MEDIO_PAGO_POR_DEFINIR;
```

El propio commit que arregló el `99` lo dejó anotado: *"bcf42f3 cerro el 99 del
PPD, no la CLASE. La regla sigue siendo lista negra ('01','99') en vez de lista
blanca de los cuatro medios de LISR 27-III; 12, 17, 23 y 30 todavia salen
deducibles"* (`94530da`).

**Escenario, con cifras.** Transportes Innovativos compra diésel a una estación
del mismo grupo y lo liquida **compensando** contra el flete que le factura —
arreglo cotidiano entre empresas relacionadas de transporte. La estación timbra
con `FormaPago="17"` (Compensación). CFDI de diésel del 6-ago-2026: total
**$18,560**, SubTotal $16,000, IVA trasladado **$2,560**, 660 L,
`ClaveProdServ 15101505`, XML verificado.
- Motor: `'17'` no es `'01'` ni `'99'` → **ninguna** de las tres ramas dispara →
  `cubetaDe` (`engine.ts:118-128`) ve `cfdiUuid` y ninguna diferencia bloqueante
  → **`deducible`**. `engine.ts:1165` `pagoElectronico = true` → **660 L** a
  `litrosDieselAcreditables`. `engine.ts:1131` → **$2,560** a `ivaAcreditable`.
- PDF: **"Deducible para ISR $18,560.00"**, **"Diésel elegible para el estímulo
  de IEPS (LIF 2026 art. 20, ap. A): 660 L"** y **"IVA acreditable (LIVA art. 5):
  $2,560.00"**.
- Norma: la compensación **no está** en la lista del párrafo anterior, y para
  combustible la ley la exige *aun por debajo de $2,000*. Ninguna de las tres
  cifras está sostenida, y las tres van en dirección **sobre-afirmante**.
- Y el contador del 15% tampoco lo ve: `repo.ts:846`
  (`if (g.forma_pago === '01') efectivo += monto`) lo mete al **denominador**
  ($18,560 a `totalCombustible`) y no al numerador, así que además **infla el
  tope** del resto del ejercicio en **$2,784**.

Las mismas tres afirmaciones salen con `12` (dación en pago), `15`
(condonación — donde no hubo pago alguno), `23` (novación) y `30` (aplicación de
anticipos).

**Consecuencia.** El contralor deduce $18,560 y acredita $2,560 de IVA sobre un
comprobante cuyo medio de pago la ley no admite, con los artículos impresos al
lado — y en una revisión responde él.
**Causa raíz probable:** el arreglo del pase 5 cerró el **valor** que el
hallazgo traía de ejemplo en vez de invertir la regla; la lista blanca de seis
claves ya está transcrita en la ficha y en el comentario de `engine.ts:1155-1157`
y sigue sin implementarse. (**REINCIDENTE**, clase abierta.)

---

### [ALTO · REINCIDENTE] A1 — "Ahorro generado — Ejercicio 2026" imprime en pesos el monto **bruto** del gasto

`src/app/dashboard/inicio-contenido.tsx:286-287` · `src/lib/likida/fiscal.ts:441,306-310`

```
inicio-contenido.tsx:286   etiqueta={`Ahorro generado — ${periodoFiscal.etiqueta}`}
inicio-contenido.tsx:287   valor={resumenPerdidas?.montoRecuperable ?? 0} formato="mxn" delta={null} />
fiscal.ts:441              else montoRecuperable += f.gasto.monto;
fiscal.ts:309-310          detalle: 'El ticket todavía se puede timbrar. Es deducción PENDIENTE, no perdida…'
```

`montoRecuperable` es la **suma de los montos brutos** de los comprobantes sin
CFDI. Con $250,000 de tickets recuperables, el efecto real en caja es el ISR
(~30%) más el IVA acreditable (~13.8% del bruto): del orden de **$109,500**,
no $250,000. Y ni siquiera es "ahorro": es deducción **pendiente**, que el
propio archivo dice tres líneas más allá. Escenario y cifras sin cambio
respecto a los pases 4 y 5. **REINCIDENTE.** (El `?? 0` que reapareció en
`:287` es el rojo ya fichado en `MAPA.md` para frontend; el sustantivo —bruto
rotulado "ahorro"— es de este rubro y sigue abierto.)

---

### [ALTO · REINCIDENTE] A2 — "En riesgo / perdido" cuenta en rojo el combustible en efectivo que el motor ya declaró **deducible** dentro del 15%, sobre una ventana de 7 días para una regla anclada al ejercicio

`src/app/dashboard/motor-fiscal-periodo.tsx:11-13,15,73` ·
`src/lib/likida/fiscal.ts:294-299,360,440` · contraste `engine.ts:367-374`

```
motor-fiscal-periodo.tsx:12  semanal: 'últimos 7 días', mensual: 'últimos 30 días', historico: 'histórico',
motor-fiscal-periodo.tsx:73  {mxn(r.montoEnRiesgo + r.montoPerdido)}      ← color: var(--color-bad)
fiscal.ts:294-299            combustible_efectivo: { gravedad: 'en_riesgo', … }
fiscal.ts:360                else push('combustible_efectivo');           ← por el 100% del monto
```

`grep -n "evaluarTope15\|tope15" src/lib/likida/fiscal.ts` → **cero**: el
resumen del panel nunca consulta el contador del 15%, así que el diésel en
efectivo entra completo al rojo aunque `engine.ts:367-374` lo haya declarado
deducible con su nota. Con $8,000 de efectivo en un ejercicio que va al 6% del
tope, el panel pinta $8,000 en rojo bajo el rótulo "últimos 7 días" para una
regla que la ficha ancla al ejercicio (`rfa-2026-2.9.yaml:35`). **REINCIDENTE**
(4ª ronda), sin cambio de línea.

---

### [ALTO · REINCIDENTE · agravado] A3 — "Ya no se recupera" por un plazo de **nivel 6** fundado en **LISR 27-III**, y ahora ese `norma:` viaja dentro del resultado de una tool a un LLM que tiene permiso de citarlo

`src/lib/likida/fiscal.ts:264-268,450-460` · `src/lib/agents/chat-tools.ts:97` ·
`src/lib/agents/prompts.ts:63` · ficha `normas/politica-portales-plazos.yaml`
(**`sin_verificar`**, `jerarquia: 6`) y `normas/lisr-27-III.yaml`

> «**ESTO NO ES UNA NORMA FISCAL.** Es la política interna de un tercero y tiene
> **CERO fuerza legal**. El plazo LEGAL para pedir factura es **todo el
> ejercicio** (el SAT lo dice expresamente), y negarla porque "ya pasó el mes"
> es una **práctica indebida** listada por el propio SAT… El producto **NUNCA**
> debe presentar estos plazos como una obligación fiscal.»
> — `politica-portales-plazos.yaml:30-35`

```
fiscal.ts:264-268   plazo_vencido: { gravedad: 'perdida', titulo: 'Plazo de facturación vencido',
                      norma: 'LISR 27-III',
                      detalle: 'El comercio ya no acepta timbrarlo. Sin CFDI no ampara deducción…' }
fiscal.ts:450-457   const porCausa = ORDEN.filter(…).map((c) => ({ …, norma: TITULOS[c].norma,
                      detalle: TITULOS[c].detalle, … }))
chat-tools.ts:97      porCausa: r.porCausa.slice(0, 6),     ← el `norma` entra al turno del agente
prompts.ts:63         Puedes citar el fundamento SOLO si vino en el dato de la tool
```

Y `lisr-27-III.yaml:8-22` no menciona plazos de facturación en ninguno de sus
dos párrafos.

**Escenario, con cifras.** $14,200 en tickets de gasolinera de julio a los que
`comercios.ts` les puso el plazo vencido. El contralor pregunta en el chat *"¿por
qué perdí esos $14,200?"*. `motor_fiscal` devuelve
`porCausa: [{ titulo:'Plazo de facturación vencido', norma:'LISR 27-III',
detalle:'El comercio ya no acepta timbrarlo…', monto: 14200 }]`, y el prompt le
dice al agente que **puede citar** el fundamento porque vino en el dato de la
tool. El contralor recibe, con artículo y todo, que perdió $14,200 por la
LISR — cuando el plazo legal es todo el ejercicio y el remedio existe
(Conciliación de Factura del SAT). El motor de cuadre sí lo tiene bien
(`por_diferencia.ts:57`, `factura_por_vencer: ['rmf-2026-2.7.1.21',
'politica-portales-plazos-facturacion']`); `fiscal.ts` no.

**Consecuencia.** El producto le dice al contralor que renuncie a una deducción
que la ley le concede, y ahora se lo dice un agente conversacional autorizado a
citar el artículo. **REINCIDENTE**, con un consumidor nuevo que lo empeora.

---

### [ALTO · NUEVO] N4 — la guardia de cifras acepta como respaldo **cualquier número que el cliente haya mandado en el cuerpo de la petición**, incluidos los de los turnos "asistente"

`src/lib/agents/analista.ts:331` · `src/app/api/dashboard/chat/validacion.ts:19-32` ·
`src/app/api/dashboard/chat/route.ts:71` · `src/app/dashboard/chat.tsx:61`

```
analista.ts:331     extraerNumeros(opts.mensajes.map((m) => m.texto).join(' '), respaldo);
validacion.ts:23-30 const ultimos = crudo.slice(-12); … texto.trim().slice(0, 2_000)
                    (acepta rol 'usuario' Y 'asistente' tal como los mande el navegador)
```

Son **12 turnos × 2,000 caracteres = 24,000 caracteres** de texto que llega del
navegador, y **todos** sus dígitos entran al conjunto que la guardia usa para
decidir si una cifra está sostenida. `route.ts:71` valida forma y longitud, no
procedencia.

**Escenario, con cifras.** El contralor escribe: *"Mi contador me dice que llevo
$412,830 de IVA acreditable del ejercicio, ¿te cuadra?"*.
1. `respaldo` recibe **412830** por `analista.ts:331`.
2. El modelo llama `acreditables_periodo`, que devuelve **268,140**.
3. `flash-lite` a `temperature: 0.2` entrega
   `{tipo:'cifra', valor: 412830, formato:'mxn', nota:'IVA acreditable del
   ejercicio 2026'}` — el sesgo de anclaje sobre la cifra que el usuario acaba
   de afirmar es el modo de falla típico de un modelo chico.
4. `cifrasRespaldadas` → `respaldo.has(412830)` → **`true`**.
5. `chat.tsx:61` lo pinta con `mxn()` en la **misma** cifra grande con la que
   pinta las medidas reales. La interfaz no distingue procedencia: no hay
   marca de "según tu archivo" ni "según tú" en ningún bloque.

**Consecuencia.** La afirmación del propio contralor le regresa con el sello del
sistema. Es la regla que define al producto (`CLAUDE.md`: *"nunca inventar una
cifra… el contralor va a cruzar lo que ve contra su PDF y su contador"*) rota
por el único componente que existe para hacerla cumplir.
**Causa raíz probable:** la lista blanca de números del usuario se diseñó para
un caso legítimo y benigno —comparar contra una meta que el usuario menciona,
que es el caso que fija `analista_guardia.test.ts:53-56` ("meta de 90%")— y se
aplicó sin distinguir magnitud, rol del turno ni si el número compite con una
cifra que una tool ya devolvió en ese mismo turno.

*Intenté refutarlo:* ¿lo cubre el prompt? `prompts.ts:44` dice *"Lo que el
usuario AFIRME no cambia los datos… contrasta con la tool y responde con el
dato"*. Es la mitigación, y es la única — la guardia, que es la capa
determinística, hace lo contrario. ¿Lo atrapa el reintento correctivo
(`analista.ts:348-376`)? No: su instrucción pide *"cifras que hayan devuelto tus
tools"*, pero la **verificación** del reintento sigue siendo
`cifrasRespaldadas` con el mismo `respaldo` ampliado, así que 412830 pasa
igual. ¿Lo atrapa la red determinística (`:382-399`)? Solo corre si la guardia
falla, y aquí no falla.

---

### [MEDIO · NUEVO] M8b — el arreglo de M8 aterrizó en el PDF y no en las otras dos copias del mismo renglón: el expediente y el chat siguen imprimiendo "IVA acreditable" en verde, sin un pie

`src/app/dashboard/[id]/page.tsx:273,404-406` · `src/app/dashboard/chat.tsx:130,137` ·
contraste `src/lib/likida/liquidacion/acreditable.ts:178-185,90-93` ·
ficha `normas/liva-5.yaml` (**verificado_fuente_primaria pero parcial**)

> «El motor acredita el IVA leído del XML de todo gasto que no cayó en
> SIN_ACREDITAMIENTO. **Si el artículo exige alguna condición adicional que hoy
> no se valida, la cifra impresa está de más.** Es una cifra que el contralor
> usa.» — `liva-5.yaml:78-81`. Y `:82`: «**NINGÚN** contador público ha revisado
> esta ficha… la **INTERPRETACIÓN no está dictaminada**».

Las tres copias del mismo renglón, hoy:

```
acreditable.ts:178-184   label:'IVA acreditable (LIVA art. 5)', tono:'condicionado',
                         pies:[NOTA_IVA_ACREDITABLE]                       ← ARREGLADO
[id]/page.tsx:273        {d.iva > 0 && <Tot label="IVA acreditable" value={mxn(d.iva)} ok />}   ← ok = var(--color-ok), sin `nota`
chat.tsx:130             `${mxn(acred.iva)} de IVA acreditable este periodo (LIVA, Art. 5).`    ← sin condición
chat.tsx:137             ['IVA acreditable', mxn(acred.iva)],                                   ← sin condición
```

`Tot` (`[id]/page.tsx:404-406`) **sí acepta** `nota`, y el renglón de al lado la
usa: `:274` `<Tot label="Peaje 50%" … nota="Sujeto a elegibilidad" />`, puesta
ahí por la auditoría 12 con el comentario *"El PDF ya lo decía; el panel no"*
(`:410-412`). La historia se repitió: el PDF vuelve a decirlo y el panel vuelve
a no.

**Escenario.** Liquidación con **$41,300** de IVA acreditable. El PDF dice
"IVA acreditable (LIVA art. 5): $41,300.00 — *El artículo exige más requisitos
que Likida NO verifica. Confírmelo con su contador antes de acreditarlo.*". El
expediente en pantalla —la pantalla del demo— dice **"$41,300"** en verde y
nada más. El chat dice **"$41,300.00 de IVA acreditable este periodo (LIVA,
Art. 5)"**, con el artículo y sin la condición. Tres lecturas del mismo número
con tres niveles distintos de afirmación, y la más afirmante es la que se ve
primero.

**Consecuencia.** El descargo que la ficha exige existe en el papel que se
archiva y no en las pantallas donde se decide.
**Causa raíz probable:** `filasAcreditables` es el contrato del rubro pero solo
lo consume `pdf.ts`; las dos pantallas leen los escalares de `liquidacion`
directamente. Es la regla del rubro 8 —una verdad, tres copias— cobrando factura
sobre una cifra fiscal.

---

### [MEDIO · NUEVO] M11 — el lector de CFDI del chat es un segundo parser, de expresiones regulares, que ignora `Moneda`, `TipoDeComprobante`, `MetodoPago`, `FormaPago` y el estatus ante el SAT — y `Moneda`/`TipoCambio` no se parsean en NINGÚN punto del repo

`src/lib/likida/intake/archivo.ts:106-132` (especialmente `:113,116-124,127`) ·
`src/app/dashboard/chat.tsx:253` · contraste
`src/lib/likida/intake/cfdi_xml.ts:179-299` · `src/lib/agents/prompts.ts:22`

```
archivo.ts:113   const esCfdi = /cfdi:Comprobante|Comprobante\b/.test(xml) && /TimbreFiscalDigital|UUID=/i.test(xml);
archivo.ts:116   const total = atributo(xml, 'Total');
archivo.ts:120-124  if (total) campos.push(['Total', total]); … ['Fecha'] … ['UUID'] … ['RFC emisor'] … ['RFC receptor']
archivo.ts:127   extracto: `CFDI adjunto (campos extraídos del XML):\n…`
chat.tsx:253     visual: … { tipo: 'tabla', filas: d.meta … }     ← el globo que ve el contralor
```

`grep -rn "Moneda\|TipoCambio" src/lib/` → **cero resultados**. Ni este lector ni
`parseCfdiXml` (el maduro, que sí saca `tipoComprobante`, `formaPago`,
`subTotal`, los traslados 002/003 y las líneas del consolidado) miran la moneda.

**Lo reproduje** con un CFDI 4.0 de ingreso en dólares
(`SubTotal="1000.00" Moneda="USD" TipoCambio="18.6100" Total="1160.00"
MetodoPago="PPD" FormaPago="99"`):

```
Total = 1160.00      Moneda = USD (presente en el XML, no extraída)
meta → [['Total','1160.00'], ['Fecha',…], ['UUID',…], ['RFC emisor',…], ['RFC receptor',…]]
```

**Escenario, con cifras.** El contralor sube al chat el CFDI en USD de un
servicio de cruce fronterizo. El globo de confirmación le muestra una tabla con
**"Total — 1160.00"**, en un chat donde **todas** las demás cifras vienen
rotuladas `moneda: 'MXN'` por las diez tools (`chat-tools.ts:55,74,114,135,154`).
El valor real son **$21,588 MXN** (1,160 × 18.61). El agente puede entregarlo
como `{tipo:'cifra', valor: 1160, formato:'mxn'}` —el número está en el
extracto, la guardia lo aprueba— y `chat.tsx:61` lo pinta **$1,160.00**.

Los otros tres huecos del mismo bloque, todos verificados sobre el código:
- **`TipoDeComprobante` no se extrae.** Un CFDI de **Egreso** (nota de crédito,
  `E`) por $18,560 aparece en la tabla exactamente igual que un ingreso: "Total
  — 18560.00". El signo del dinero se pierde.
- **`FormaPago`/`MetodoPago` no se extraen.** Un CFDI **PPD** (`FormaPago="99"`)
  llega sin la única bandera que el motor de cuadre usa para negarse a afirmar
  deducibilidad (`engine.ts:395-414`). El chat no tiene esa puerta.
- **No hay validación ante el SAT.** `intake/sat.ts` existe y valida
  vigente/cancelado y la lista 69-B para el camino de WhatsApp; este camino no
  la toca, y el extracto no dice que no la tocó. Mientras tanto el prompt del
  agente afirma como hecho del producto que Likida *"valida cada CFDI ante el
  SAT (vigente/cancelado y lista negra 69-B de EFOS)"* (`prompts.ts:22`). Un
  CFDI **cancelado** subido al chat se presenta como "CFDI adjunto" con su UUID
  y su total, indistinguible de uno vigente.

**Consecuencia.** El producto tiene dos lectores de CFDI con dos criterios, y el
nuevo —el que habla con el comprador— es el pobre. Cada campo que el maduro
extrae y el nuevo no es una afirmación que el chat puede hacer y el motor no
haría.
**Causa raíz probable:** `leerXml` se escribió como "extracto genérico con un
guiño a CFDI" y no como un lector fiscal; `parseCfdiXml` está a un import de
distancia y no se reusó.

*Intenté refutarlo:* ¿lo salva el `xml.slice(0, 4_000)` que va dentro del
extracto? Contiene `Moneda="USD"` en el caso que probé (3,950 caracteres con un
certificado de 2,400), así que **el modelo puede verlo** — pero el globo que ve
el **humano** (`chat.tsx:253`) solo tiene `meta`, y `meta` no lo trae; y con un
certificado real más largo el `slice` se come el Emisor. Es una mitigación
probabilística sobre un modelo chico, no un dato. ¿Lo salva que sea "solo el
chat"? `prompts.ts:60` define analizar el documento adjunto como *"el trabajo"*
del agente, y sus cifras cuentan como respaldo por diseño
(`analista.ts:336-338`).

---

### [MEDIO · REINCIDENTE · 6ª ronda] M2 — `efectivo_no_elegible` sigue fuera de `ORDEN`, así que el desglose por causa **no suma el total** justo en el veredicto más duro

`src/lib/likida/fiscal.ts:242,300-306,360,375-378,450-451` ·
`src/app/dashboard/resumen-visual.tsx:198` · `src/lib/agents/chat-tools.ts:96-97`

```
fiscal.ts:242         | 'efectivo_no_elegible'            ← declarada
fiscal.ts:300-306     efectivo_no_elegible: { gravedad: 'perdida', … }   ← con título y norma
fiscal.ts:360         if (o.elegible15 === false) push('efectivo_no_elegible');   ← se emite
fiscal.ts:375-378     const ORDEN = ['efos','cfdi_cancelado','plazo_vencido','efectivo_sobre_tope',
                                     'efos_indeterminado','combustible_efectivo','sin_cfdi'];   ← NO está
fiscal.ts:450-451     const porCausa = ORDEN.filter((c) => porCausaMapa.has(c))…               ← la filtra fuera
```

El comentario de `causaDominante` (`fiscal.ts:373-374`) dice el invariante que
esto rompe: *"una sola, **para que la suma por causa siga cuadrando con el
total**"*.

**Escenario, con cifras.** Flota que declaró que **no** califica a la facilidad
(`facilidadCombustibleEfectivo` con `regimenElegible: false`). Ejercicio 2026:
**$46,000** de diésel en efectivo y **$12,000** de tickets sin CFDI.
- `resumirPerdidas`: `montoPerdido = 46,000`, `montoRecuperable = 12,000`.
- `porCausa`: **solo** `[{ sin_cfdi, $12,000 }]`. Los $46,000 entran a
  `porCausaMapa` y `ORDEN.filter` los tira.
- Panel: `motor-fiscal-periodo.tsx:73` pinta **$46,000** en rojo y
  `resumen-visual.tsx:198` (`porCausa.slice(0,3)`) enseña una lista que **no lo
  contiene**. El contralor ve una pérdida de $46,000 sin ningún renglón que la
  explique.
- Chat: `chat-tools.ts:96-97` entrega al agente `montoPerdido: 46000` con un
  `porCausa` donde esa cifra no aparece. Si el contralor pregunta "¿por qué?",
  el agente no tiene el dato — o se lo atribuye a la causa equivocada, que es
  peor.

**Consecuencia.** El único veredicto "no deducible por régimen" del motor fiscal
es invisible en el desglose, y ahora también en la tool que alimenta al agente.
**REINCIDENTE**, sexta ronda, misma línea.

---

### [MEDIO · REINCIDENTE · 7ª ronda] M4 — el chat de WhatsApp cuenta el 15% con `concepto='diesel'` a secas; el motor lo cuenta con las claves del SAT. Dos denominadores para la misma regla

`src/lib/likida/tools.ts:109` · contraste `src/lib/likida/cuadre/desde_db.ts:78` ·
`src/lib/likida/repo.ts:831`

```
tools.ts:109      const acum = await getAcumuladoCombustible(ctx.tenantId, ejercicio);   ← SIN el 3er argumento
desde_db.ts:78    totalesEjercicio = await getAcumuladoCombustible(tenantId, Number(anioEjercicio), clavesCombustible);
repo.ts:831       .or(claves?.length ? `concepto.eq.diesel,clave_prod_serv.in.(${claves.join(',')})` : 'concepto.eq.diesel')
```

El comentario de `repo.ts:827-830` describe exactamente el bug que sigue vivo:
*"Tres contadores con tres criterios = el chat dice 8% y el motor 12%"*. Con
$400,000 de combustible del ejercicio de los cuales $90,000 entraron por clave
del SAT sin `concepto='diesel'`, el aviso del agente calcula la razón sobre
$310,000 y el motor sobre $400,000: **12.9% contra 10.0%**, y el aviso de
`aviso.ts:41` puede decir "te quedan $0" mientras el motor sigue en holgado.
**REINCIDENTE**, séptima ronda.

---

### [MEDIO · REINCIDENTE] M10 — `/dashboard/suscripcion` sigue pre-seleccionando "601" para una flota que nunca declaró régimen, y el arreglo ya existe tres archivos más allá

`src/app/dashboard/suscripcion/page.tsx:334-337,353-355` · `src/app/admin/ui/forma.tsx:178` ·
contraste `src/app/admin/flotas/page.tsx:220`

```
suscripcion/page.tsx:335-337  Cópialos tal cual de tu Constancia de Situación Fiscal: el SAT los compara
                              contra tu RFC y rechaza el timbrado por diferencias que se ven inofensivas.
suscripcion/page.tsx:353-354  <Selector nombre="regimenFiscal" etiqueta="Régimen fiscal" requerido
                                valorInicial={fiscales?.regimenFiscal ?? '601'}
forma.tsx:178                 defaultValue={valorInicial ?? ''}      ← sigue sin <option value="">
admin/flotas/page.tsx:220     <option value="">Sin declarar</option>  ← el arreglo, ya escrito, en el otro formulario
```

`crearFlota` deja `regimen_fiscal = null` cuando se registra "Sin declarar", que
es el caso por defecto. El `?? '601'` convierte ese "nadie lo ha dicho" en una
respuesta concreta y ya seleccionada, que satisface el `requerido`.

**Escenario.** Flota coordinada (`624` real ante el SAT) registrada sin
declarar. El dueño entra a capturar sus datos para poder facturar, ve "Régimen
fiscal" **ya lleno con "601 — General de Ley Personas Morales"**, corrige RFC y
CP y guarda. `guardarDatosFiscales` escribe `regimen_fiscal = '601'` → de ahí
`tax_system: '601'` en el CFDI de la mensualidad (`facturapi.ts:183`) y
`receptor.regimenFiscalReceptor = 601` en el portal de CAPUFE
(`registro.ts:133` → `capufe.ts:851`) sobre un RFC que el SAT tiene como
coordinado. `revisarReceptor` (`flota_fiscal.ts:93`) solo valida forma. Con
$180,000 anuales de peaje, ese es el régimen con el que se piden **todos** los
CFDI de casetas del año — y el `624` es además el que
`administracion.ts:128` usa para derivar la facilidad de la RFA 2.9.

**Consecuencia.** El producto inventa un dato fiscal y lo presenta como del
cliente, en la pantalla que le acaba de pedir que lo copie de su Constancia.
**REINCIDENTE**, con el agravante de que el patrón correcto (`<option value="">`)
entró este pase en el formulario de al lado y no en este.

---

### Reincidentes del pase 5 que verifiqué línea por línea y siguen abiertos

Todos con las líneas de hoy, comprobadas una por una. Escenario, cifras y
consecuencia: los del pase 5, sin cambio.

| # | Sev | Hallazgo | `archivo:línea` de HOY | Comprobación |
|---|---|---|---|---|
| M1 | MEDIO | `no_encontrado` / `pendiente` del SAT no llegan a `causasDe` | `fiscal.ts:335-364` | `causasDe` solo mira `estadoSat === 'cancelado'` (`:342`). Un CFDI que el SAT no encuentra no aparece en ninguna causa del panel |
| M5 | MEDIO | Las ventanas de 7/30 días excluyen en silencio los comprobantes sin fecha | `fiscal.ts:756-758` (`.gte('fecha')`/`.lte('fecha')`) · `motor-fiscal-periodo.tsx:15` (`ResumenSimple`, tres escalares) | El campo que lo diría se calcula (`contarGastosDelTenant:882-885`, `sinFecha`) y no llega al componente |
| M6 | MEDIO | "Litros elegibles para el estímulo · LIF 2026 Art. 20-A" sobre todo el histórico, junto a un Resumen que usa el ejercicio | `combustible-casetas/page.tsx:121,200` vs `inicio-contenido.tsx:87` | `getAcreditables(tenantId)` sin ventana. Dos cifras para lo mismo |
| M7 | MEDIO | "N de M sin factura — es deducible que se pierde" sobre lo que el motor llama **recuperable** | `combustible-casetas/page.tsx:198` · contraste `fiscal.ts:309-310` | `sinCfdi` (`:151`) sin ningún filtro por plazo: cuenta como perdido lo que todavía se puede timbrar |
| B2 | BAJO | `avisoTope15` afirma "hay pagos de combustible en efectivo" sin mirar `r` | `periodo/aviso.ts:32-33` | La rama `elegible === undefined` no lee `r.razon` ni `r.estado`: con cero efectivo, el aviso lo afirma igual. `tools.ts:119` lo mete al turno del agente |

---

## Hallazgos de pases anteriores que YA NO APLICAN

- **[ALTO, pase 5] A7 — los dos catálogos de `c_RegimenFiscal` divergen** —
  **CERRADO.** `admin/flotas/page.tsx:232-234` mapea `REGIMENES` de
  `saas/fiscal.ts:36-43`, que `fiscal.test.ts:26-49` amarra contra el CHECK
  vigente leído de las migraciones. Las 8 claves que la base rechazaba y las 3
  que faltaban (603, 621, **626 RESICO**) desaparecieron de una vez, y
  `:220` agrega la opción vacía "Sin declarar" que cierra también el escenario C
  del pase 5 en ese formulario.
- **[ALTO, pase 5] A4 · [MEDIO] M8 (en el PDF) · [MEDIO] M3 · [MEDIO] M9 ·
  [BAJO] B1 · [BAJO] B3 · [BAJO] B4** — **CERRADOS**, verificados arriba caso
  por caso contra el código de hoy, no contra el mensaje del commit.
- **[ALTO, pase 5] A6 en su valor `99`** — cerrado; la **clase** sigue abierta y
  se reporta arriba con las claves que faltan.

---

## Lo que revisé y está bien

- **El estímulo de IEPS sigue sin imprimirse en pesos, en las cinco superficies
  que podrían, y ahora también en la tool.** `engine.ts:1097`
  (`const iepsAcreditable = 0;`), `acreditable.ts:169-176` (litros),
  `chat.tsx:110`, `combustible-casetas/page.tsx:200`, `[id]/page.tsx:271`. Y
  `chat-tools.ts:74` **no devuelve `ieps`** aunque `getAcreditables` lo calcula
  (`analytics.ts:548`): el campo se dejó fuera a propósito. La confusión "IEPS
  trasladado = estímulo del 20-A" sigue cerrada.
- **El agente no puede multiplicar, y eso protege exactamente la cifra correcta.**
  `esDerivada` (`analista.ts:149-164`) admite suma, resta y porcentaje, **no
  producto**. Es lo que impide que el agente entregue "cuota × litros" —el
  cálculo que `criterio-1-LIF-PI.yaml:15-18` llama práctica indebida de quien
  presta el servicio— aunque el contralor le suba una hoja con la cuota del DOF.
  No encontré ninguna combinación de suma/resta/razón que reconstruya un
  producto sin que los dos factores estén ya en el respaldo. Es la mejor
  decisión de diseño del archivo nuevo.
- **El renglón de peaje del PDF sigue siendo el modelo de cómo se hace.**
  `acreditable.ts:186-196`: la condición **en el label**, `tono: 'condicionado'`,
  `BASE_ESTIMULO_PEAJE` (`:47-49`, dice qué base usó y cuánto cambia con la otra:
  ~13.8%) y `CONDICIONES_ESTIMULO_PEAJE` (`:64-67`) con las **cuatro**
  condiciones transcritas de `lif-2026-20-A.yaml:52-56`, incluida la de partes
  relacionadas del art. 179.
- **`NOTA_IVA_ACREDITABLE` está redactada con el criterio correcto.**
  `acreditable.ts:74-93`: nombra los **dos** requisitos que Likida sí comprueba y
  declara que el artículo exige más «sin enumerarlo — citar una fracción que
  nadie transcribió sería inventar una norma para poder confesar que no se
  verifica». Es exactamente la disciplina que el rubro pide.
- **`desgloseLitrosPorFecha` se niega a inventar el reparto.**
  `acreditable.ts:132-152`: sin fecha en algún comprobante devuelve `null`
  (`:141`), y si la suma no reconstruye el total acreditado con tolerancia de
  0.001 L, también (`:147`). Misma disciplina que `filasDeducibilidad`.
- **El control de litros contra el monto sigue en pie.** `engine.ts:1176-1188`:
  tolerancia 0.5×–2× contra `precioDieselPorDefecto`, con `diesel_desviacion` y
  **sin acreditar** cuando no cuadra. Un decimal corrido (200 L leídos como
  20,000) no se convierte en cien veces el estímulo.
- **`getAcumuladoCombustible` falla cerrado.** `repo.ts:856-862`: si leyó menos
  filas de las que `count` reporta, **lanza** en vez de devolver medio ejercicio.
  El denominador del 15% no se puede recortar en silencio. Y `engine.ts:325-341`
  se niega a evaluar la facilidad si `total <= 0`.
- **El permiso CRE nunca se declara cumplido ni incumplido** (`engine.ts:628` y
  siguientes), y el complemento de hidrocarburos sigue detrás del interruptor
  `exigibleDesde: null` (`engine.ts:614-623`): con `null` el motor **avisa** y
  nunca declara no deducible.
- **`chat-tools.ts` no acepta texto libre que llegue a una consulta.** Los únicos
  parámetros son enums cerrados (`:28-35`, `:216-225`) y el `tenantId` lo fija el
  servidor (`analista.ts:277`). Es la alternativa deliberada a "lenguaje natural
  → SQL", y está bien hecha.
- **El endpoint del chat falla cerrado en el tope diario.** `route.ts:86-90`: si
  no se pudo leer el gasto del día, **no se gasta más** y responde con texto
  honesto en vez de dejar el chat mudo.
- **`/api/dashboard/archivo` autoriza antes de leer.** `route.ts:25-30`: sesión +
  `puedeVerArea(rol,'dinero')` antes de tocar el buffer, y rechaza imágenes
  mandándolas al OCR real (`:38-40`). La lectura de imagen del chat se rotula
  "lectura de prueba, no se registró ningún gasto" (`chat.tsx:292`).
- **`/dashboard/politicas` sigue de solo lectura y lo dice**, con los topes
  empatando sus fichas: $750 (`lisr-28-V.yaml:22`), $2,000
  (`lisr-27-III.yaml:9`), 0.5 y "sujeto a elegibilidad" (`politicas/page.tsx:276`).
- **Las 632 pruebas de `cuadre/`, `liquidacion/`, `fiscal.test.ts`, `saas/`,
  `agents/` e `intake/archivo.test.ts` corren verdes** (54 archivos, 0 rojos).
  Los 15 rojos de la suite completa son los ya fichados en `MAPA.md`, todos de
  frontend; ninguno es de este rubro.

---

## Lo que NO alcancé a revisar

- **`facturacion/adaptadores/capufe.ts` (1,250+ líneas), cuarto pase seguido sin
  auditarse.** Sigue siendo consumidor directo del régimen fiscal de la flota
  (`:851`) y teclea datos fiscales del receptor en un portal real que emite CFDI
  de peaje deducible. Es la superficie fiscal más grande sin revisar del repo, y
  M10 le entrega un `601` inventado.
- **`facturacion/al_vuelo.ts` y `facturacion/comercios.ts` entrada por entrada.**
  `comercios.ts` es donde viven los `plazo`/`plazoVerificado` que A3 consume; solo
  verifiqué el consumo, no el catálogo.
- **`intake/consolidado.ts` e `intake/ocr.ts` completos.** El consolidado es de
  donde salen `litros`, `subTotal`, `iva_monto` e `iva_tasa` de los CFDI de
  monedero y TAG — insumos directos de cuatro reglas fiscales — y este pase solo
  entró por `cfdi_xml.ts` para contrastarlo contra `archivo.ts`.
- **El REP (complemento de pagos) y qué pasa cuando el pago del PPD sí se
  documenta.** `medio_pago_no_acreditado` promete «se confirma con el complemento
  de pago (REP)» (`engine.ts:411`) y no verifiqué que exista camino para recibirlo.
- **Corrida real del motor con estos escenarios.** No creé archivos en el repo
  (instrucción del encargo). Lo único que sí ejecuté fuera del repo, porque sin
  ejecutarlo el hallazgo no existía, son las tres comprobaciones de librería que
  sostienen N1, N3 y M11 (`pdf-parse` con 30 páginas, `xlsx` con una columna de
  fechas, y los regex de `leerXml` sobre un CFDI 4.0 en USD). Las aritméticas de
  los escenarios son deliberadamente simples para recomprobarlas a mano.
- **Verificación de las fichas contra DOF / SAT / diputados: imposible en este
  entorno.** `normas/.latido-vigilancia` documenta la **duodécima** corrida
  consecutiva bloqueada por egress, con dieciocho días sin barrer (24-jul a
  10-ago). Todo lo que este reporte afirma sobre las normas sale del texto ya
  transcrito en las fichas, y las `evidencia_corroborante` / `sin_verificar`
  quedan anotadas como **no verificables en esta ronda**.
