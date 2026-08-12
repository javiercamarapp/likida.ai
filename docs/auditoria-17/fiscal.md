# Cumplimiento fiscal — auditoría 17 · pase 5 (12-ago-2026)

**Nota: 4/10** (antes 5). Razón del movimiento: **deuda que cobró factura**. El
arreglo `12cc8c6` es real y su prueba muerde de verdad (verificado abajo, caso
por caso), pero cerró **un valor**, no **el modo de falla**: `forma.tsx:178`
sigue con `defaultValue` y sin opción vacía, el segundo catálogo de
`c_RegimenFiscal` no solo sobrevive sino que **ofrece 8 claves que el CHECK
vigente rechaza**, y la prueba que vigila la divergencia la afirma en la
dirección que NO atrapa el caso que rompe. Contra eso: **cero** de los 12
hallazgos del motor se tocó (`git diff` de `engine.ts`, `repo.ts`, `fiscal.ts`,
`tools.ts`, `aviso.ts` contra el pase 4 → vacío, y las líneas citadas son
idénticas), y este pase encontró en `intake/` + el bloque de acreditamiento los
**primeros defectos que van en dirección SOBRE-afirmante** —deducible y
acreditable de más— y no en la conservadora. Un error que le regala deducción
al cliente lo paga el cliente ante el SAT; uno que se la quita solo le cuesta
dinero en la mesa. Los tres nuevos de este pase son del primer tipo.

**Riesgo mayor del rubro, hoy:** el motor confunde *"la forma de pago no es
`01`"* con *"el medio de pago es uno de los que la ley acepta"*
(`engine.ts:302,371,1055`). Un CFDI de diésel con `FormaPago 99` —que es el
valor **obligatorio** en cualquier CFDI PPD, o sea toda flota con línea de
crédito en la estación— sale impreso como **"Deducible para ISR"**, con su IVA
acreditado y sus litros contados para el estímulo del LIF 20-A, sin que el
motor haya visto un solo medio de pago. `MetodoPago` (PUE/PPD) **no se parsea
en ninguna parte del repo**.

---

## Verificación del arreglo del pase 4 (`12cc8c6`)

Las tres preguntas del encargo, contestadas con `archivo:línea` de hoy.

### 1a) ¿El catálogo de `src/lib/saas/fiscal.ts` coincide con el CHECK vigente?

**Sí, hoy es exacto — y por primera vez.**

```
saas/fiscal.ts:35-42     624, 601, 603, 612, 621, 626
0088_regimen_624_coordinados.sql:31-38   '601','603','612','621','624','626'
```

`0088` es la última migración que redefine `tenant_regimen_fiscal_dominio`
(`grep` de `regimen_fiscal_dominio` en `supabase/migrations/` → solo `0056:45-46`
y `0088:29-30`). Los dos conjuntos son idénticos. Correcto.

### 1b) ¿Y con el catálogo de `admin/flotas/page.tsx`? ¿Siguen pudiendo divergir?

**No coincide, y la divergencia es peor de lo que el pase 4 reportó — en las dos
direcciones.** Ver el ALTO A7 abajo.

```
admin/flotas/page.tsx:223-233   624, 601, 612, 605, 606, 607, 608, 610, 611, 615, 616
CHECK vigente (0088:31-38)      601, 603, 612, 621, 624, 626
```

- **8 claves que el alta ofrece y el CHECK rechaza:** `605, 606, 607, 608, 610,
  611, 615, 616`. `crearFlota` las escribe directo
  (`administracion.ts:140`, `.insert({ ..., regimen_fiscal: f.regimenFiscal ?? null })`)
  → violación de CHECK → `throw new Error('crearFlota: ' + error.message)`
  (`administracion.ts:147`) con el texto crudo de Postgres.
- **3 claves que el CHECK acepta y el alta NO ofrece:** `603, 621, 626`. Una
  flota RESICO (`626`) no se puede registrar desde `/admin/flotas`, aunque su
  propio dueño sí la pueda elegir después en Plan & Facturación.
- **Ninguna prueba las vigila.** `grep -rn "'605'\|'615'\|'616'" src/` → **cero
  resultados**: son literales JSX (`<option value="605">`), no una constante
  exportada, así que ni `fiscal.test.ts` ni `regimen_no_se_pierde.test.ts` las
  pueden leer. La prueba nueva lee `REGIMENES_ELEGIBLES` de
  `administracion.ts` (dos claves), no el `<select>`.

**Sí, siguen pudiendo divergir**, y el arreglo movió el riesgo de sitio en vez
de quitarlo: ver 2).

### 2) El `<select>` de `forma.tsx`: ¿cerrado, o solo tapado el `624`?

**Solo tapado el `624`, y el siguiente régimen que falte lo reabre — peor que
antes.**

`forma.tsx:178` no cambió una letra en `12cc8c6`:

```
src/app/admin/ui/forma.tsx:178        defaultValue={valorInicial ?? ''}
src/app/admin/ui/forma.tsx:182-186    {opciones.map((o) => (<option key={o.valor} value={o.valor}>…))}
```

Sigue sin `<option value="">`. El mecanismo —un `defaultValue` que no empata
ninguna `<option>` hace que el navegador seleccione la primera, en silencio— está
intacto. Lo que cambió es **cuál es la primera**: antes `601` (Título II
general, inofensivo como default), ahora **`624 — Coordinados`**
(`saas/fiscal.ts:36`), que es exactamente el régimen del que
`administracion.ts:128` deriva la facilidad de la RFA 2.9. El comentario del
arreglo lo dice: *"`624` VA PRIMERO Y NO ES COSMÉTICO"* (`saas/fiscal.ts:22`).
Es cosmético para el bug y **empeora el modo de falla**: el día que la lista
vuelva a quedar corta, el valor que el navegador inventa ya no es el neutro.

Hoy no es alcanzable **por coincidencia, no por diseño**: `REGIMENES` es
exactamente igual al CHECK, así que ningún valor de la columna puede quedar
fuera de la lista. Y la prueba que vigilaría esa coincidencia la afirma como
**subconjunto en la dirección que no atrapa el caso**
(`fiscal.test.ts:139-148`, `REGIMENES ⊆ base`, documentado a propósito por el
`S01` de `uso_cfdi`). Una migración `0089` que agregue una clave al CHECK
—`620` cooperativas, por decir— deja las dos pruebas en verde y reabre el bug
con `624` de premio.

Y hay un caso **vivo hoy**, sin necesitar migración futura:
`suscripcion/page.tsx:354` sigue con `valorInicial={fiscales?.regimenFiscal ?? '601'}`.
Ver el MEDIO M10.

### 3) `regimen_no_se_pierde.test.ts`: ¿falla de verdad sin el arreglo?

**Sí, dos de sus tres casos.** Leída línea por línea (no hay que revertir nada
para saberlo, la prueba no depende del entorno):

- `regimen_no_se_pierde.test.ts:64-73` lee `REGIMENES_ELEGIBLES` del **código
  fuente** de `administracion.ts` con un regex (`:57-62`) → `['624','612']`, y
  exige que las dos estén en `REGIMENES`. Sin la línea `saas/fiscal.ts:36`,
  `faltantes = ['624']` → **roja**.
- `:75-81` busca `624` explícitamente y exige que su nombre contenga
  "coordinado" → **roja** sin el arreglo.
- `:83-89` (`601` existe y NO se rotula "coordinados") pasaba antes y pasa
  ahora. Es un candado contra la regresión del CRÍTICO C3, no contra este bug.

Las 11 pruebas de los dos archivos corren verdes hoy
(`npx vitest run src/lib/saas/regimen_no_se_pierde.test.ts src/lib/saas/fiscal.test.ts`
→ 11 passed). El mérito real del commit está en `fiscal.test.ts:26-49`: la
prueba **dejó de comparar contra una lista copiada de la 0056** y ahora lee el
CHECK vigente de las migraciones. Eso sí cierra una clase entera —una lista
congelada congela la fecha en que dejó de ser cierta— y es el mejor trabajo del
pase 4.

### 4) La cadena del CFDI que el pase 4 exageró — verificada eslabón por eslabón

El encargo pide que no encadene consecuencias sin abrir cada eslabón. Los abrí.

**Confirmo que la corrección del orquestador es correcta:** `guardarDatosFiscales`
(`saas/fiscal.ts:122-131`) escribe **cinco columnas** de `tenant` —`rfc`,
`razon_social`, `regimen_fiscal`, `codigo_postal_fiscal`, `uso_cfdi`— y **nunca
toca `config`**. La elegibilidad del 15% vive en
`tenant.config.facilidadCombustibleEfectivo` y se lee en
`cuadre/desde_db.ts:56-58`, `likida/fiscal.ts` (`opcionesDe`) y `tools.ts:115-118`;
la escriben solo `crearFlota` (`administracion.ts:130-140`) y
`actualizarFacilidad15`. El motor de cuadre **no se entera** de un cambio de
`regimen_fiscal`. La afirmación del pase 4 ("le apaga la facilidad del 15%") es
**falsa** y queda retirada.

**La cadena que sí existe, abierta eslabón por eslabón — y con una corrección al
propio mensaje del commit:**

```
saas/fiscal.ts:76          regimenFiscal: (data.regimen_fiscal as string) || null
  ↓
facturacion/flota_fiscal.ts:84     regimenFiscal: datos.regimenFiscal ?? ''
  ↓ (rama A, portal CAPUFE)
adaptadores/registro.ts:133        regimenFiscal: op.flota.regimenFiscal
  → adaptadores/capufe.ts:851      elegirEnDesplegable(..., 'receptor.regimenFiscalReceptor')
```

```
  ↓ (rama B, el CFDI que Likida emite)
saas/transferencia.ts:310-318      getDatosFiscales → receptor.regimenFiscal
  → saas/facturapi.ts:183          tax_system: receptor.regimenFiscal
```

**El commit encadena `registro.ts:133 → facturapi.ts:183`, y eso no es una
cadena: son dos ramas distintas.** `registro.ts:133` termina en el
`<select name="receptor.regimenFiscalReceptor">` del portal de CAPUFE
(`capufe.ts:233,851`), no en Facturapi. Quien alimenta `facturapi.ts:183` es
`transferencia.ts:318`, que llama a `getDatosFiscales` por su cuenta. El daño
del régimen equivocado es **mayor** que el que el commit describe, no menor: la
rama A no es la suscripción de Likida sino **el CFDI de peaje que la flota
factura para deducir**, que es dinero del cliente, no de Likida. `revisarReceptor`
(`flota_fiscal.ts:93`) solo comprueba forma —3 dígitos— así que un `601` sobre
un RFC que el SAT tiene como coordinado pasa el filtro y llega al portal.

Nada más de esa cadena está roto hoy. `facturapi.ts` completo (246 líneas,
revisado por primera vez) está **bien**: ver "Lo que revisé y está bien".

---

## Fichas de `normas/` que abrí, con la línea transcrita y el código que la implementa

`normas/` tiene **21 fichas** (16 fiscales, 5 de datos/laboral). `normas/.latido-vigilancia`
declara la **undécima corrida consecutiva bloqueada por egress** (403 en el
CONNECT a `sidofqa.segob.gob.mx`, `www.sat.gob.mx`, `www.diputados.gob.mx`,
confirmado con `curl` a los tres). **Ninguna se pudo re-verificar contra la
fuente en esta ronda**: todo lo que este reporte afirma sobre las normas sale
del texto ya transcrito.

| Ficha | Estado | Línea que comparé | Código que la implementa | Veredicto |
|---|---|---|---|---|
| `rfa-2026-2.9.yaml:16-17` | **verificado_fuente_primaria** (DOF/SIDOF 5780249) | «…siempre que estos no excedan el 15 por ciento **del total de los pagos efectuados por consumo de combustible para realizar su actividad**.» | `engine.ts:337` `const tope = 0.15 * total;` + `repo.ts:831-833` | **MAL** → C4 |
| `rfa-2026-2.9.yaml:10-11` | ídem | «que tributen conforme al **Título II, Capítulo VII** o Título IV, Capítulo II, Sección I» | `administracion.ts:128` `['624','612']`, `saas/fiscal.ts:36`, `0088:31-38` | **BIEN hoy** (el arreglo) |
| `rfa-2026-2.9.yaml:37-39` | ídem, `limite_importante` | «Conserva la DEDUCCIÓN para ISR. NO habilita el acreditamiento **del IEPS**» | `engine.ts:985` `SIN_ACREDITAMIENTO` — niega también el **IVA** | **MAL** → A4 |
| `rfa-2026-2.9.yaml:17-21` | ídem | «en el comprobante fiscal deberá constar la información del **permiso vigente**… de acuerdo con la Ley de Hidrocarburos» | `deducibilidad.ts:70` (pie del renglón) + `engine.ts:557` `gastosSinPermisoCre` | **BIEN** — cita correcta, no afirma cumplimiento |
| `lisr-27-III.yaml:16-22` | evidencia_corroborante — *no verificable en esta ronda* | «Tratándose de la adquisición de combustibles…, el pago deberá efectuarse **en la forma señalada en el párrafo anterior**, aun cuando… no excedan de $2,000.00» (transferencia · cheque nominativo · tarjeta crédito/débito/servicios · monederos autorizados) | `engine.ts:302,371` — solo distingue `'01'` | **MAL** → A6 |
| `lisr-27-III.yaml:37-40` | ídem, `advertencia` | «**NUNCA citar esta fracción sola** para declarar no deducible un combustible pagado en efectivo de una flota de carga federal.» | `fiscal.ts:267` `norma: 'LISR 27-III'` para un **plazo de portal** | **MAL** → A3 |
| `lif-2026-20-A.yaml:26-30` | **verificado_fuente_primaria** | «el monto que se podrá acreditar será el que resulte de multiplicar la cuota… **vigente en el momento en que se haya realizado la… adquisición del diésel**…, por el número de litros» | `engine.ts:998` `const iepsAcreditable = 0;` + `acreditable.ts:96-100` (litros) | **BIEN** — la confusión "IEPS trasladado = estímulo" sigue cerrada |
| `lif-2026-20-A.yaml:32-35` | ídem, `advertencia_critica` | «la cuota **cambia SEMANALMENTE**» | `acreditable.ts:78-80` entrega un litraje **agregado por liquidación, sin fecha de compra** | **FLOJO** → B4 |
| `lif-2026-20-A.yaml:41-44` | ídem | «que obtengan **en el ejercicio fiscal en el que hagan uso** de la infraestructura… ingresos totales anuales… menores a 300 millones» | `chat.tsx:41` «este periodo» sobre `getAcreditables(tenantId!)` sin ventana (`route.ts:76`) | **MAL** → A5 |
| `lif-2026-20-A.yaml:52-56` | ídem, `condiciones` (las 4) | «Dedicarse EXCLUSIVAMENTE… · Red Nacional de Autopistas de Cuota · ingresos < $300M · no ser parte relacionada» | `acreditable.ts:64-67` `CONDICIONES_ESTIMULO_PEAJE`, transcritas y en el pie del renglón | **BIEN** — las cuatro, en el papel |
| `liva-5.yaml:12-24` (fr. I) | **verificado_fuente_primaria** | «se consideran estrictamente indispensables las erogaciones… **que sean deducibles para los fines del impuesto sobre la renta**» / «…**en la proporción** en la que dichas erogaciones sean deducibles» | `engine.ts:1050` `proporcionDeducible`; `engine.ts:1003` `continue` sobre efectivo dentro del 15% | proporción **BIEN**; el `continue` **MAL** → A4 |
| `liva-5.yaml:26-28` (fr. II) | ídem — **la transcripción TERMINA aquí** | «Que el IVA haya sido trasladado expresamente… y que conste por separado en los comprobantes» | `acreditable.ts:102-108` imprime el renglón con `tono: 'bueno'` y `pies: []` | **MAL** → M8 (la ficha misma lo declara en `riesgo_actual:47-50`) |
| `lisr-28-V.yaml:21-25` | **verificado_fuente_primaria** | «Tratándose de gastos de viaje destinados a la **alimentación**… no exceda de $750.00 diarios por cada beneficiario» | `engine.ts:892` `c === 'alimentacion' \|\| c === 'viaticos'` | **MAL** → B1 (`viaticos` incluye hospedaje) |
| `lisr-28-V.yaml:26-29` | ídem | «…sólo procederá cuando el pago se efectúe mediante **tarjeta de crédito** de la persona que realiza el viaje» | `engine.ts:857` `g.formaPago !== '04'` — pero `ocr.ts:360` mapea **toda** tarjeta a `'04'` | **MAL** → M9 |
| `politica-portales-plazos.yaml:30-35` | **`sin_verificar`**, `jerarquia: 6` | «**ESTO NO ES UNA NORMA FISCAL**… El plazo LEGAL para pedir factura es **todo el ejercicio**… El producto NUNCA debe presentar estos plazos como una obligación fiscal.» | `fiscal.ts:264-268` (`gravedad: 'perdida'`, `norma: 'LISR 27-III'`) + `avisar.ts:56` | **MAL** → A3 |
| `cff-89-90.yaml` | **verificado_fuente_primaria** | La eximente literal del último párrafo del art. 89 (manifestación **por escrito**) | `leyendas.ts:36-39,50-59` — «puede diferir de los criterios que dé a conocer el SAT» + art. 52 | **BIEN** |
| `cff-29-A.yaml` | evidencia_corroborante, `texto_vigente: null` | — | `por_diferencia.ts:31,46-49`, `engine.ts` `comprobante_no_fiscal` | **No verificable en esta ronda** |
| `rmf-2026-2.7.1.48`, `rmf-2026-2.7.1.21` | evidencia_corroborante, `exigibleDesde: null` | — | `engine.ts:531-534` — con `null` el motor **avisa** y nunca declara no deducible | **BIEN mientras siga `null`** |
| `criterio-1-LIF-PI`, `criterio-1-CFF-PI` | evidencia_corroborante, `texto_vigente: null` | — | Sostienen no imprimir el IEPS en pesos y las leyendas | **No verificables** |
| `cff-30`, `cff-69-B`, `rlisr-57`, `rfa-2026-2.2` | verificado_fuente_primaria | — | Cotejadas contra el código: correctas | **BIEN** |
| `cuota-ieps-diesel.yaml` | **NO EXISTE** | — | Correcto que el producto no imprima el estímulo en pesos | Sigue sin poder crearse |
| *sin ficha* | — | `c_RegimenFiscal`, `c_FormaPago`, `c_MetodoPago`, tasa de ISR | A6, A7, M9 y M10 se argumentan **sin depender de ellas** (contradicción interna al repo) | — |

**Trazabilidad ficha→código, sin mejora desde el pase 4.** `rfa-2026-2.9.yaml:42-44`
(`usado_en_codigo`) sigue listando **dos** sitios de `engine.ts`; hoy la regla
decide en `engine.ts`, `repo.ts`, `fiscal.ts`, `desde_db.ts`, `tools.ts`,
`aviso.ts`, `administracion.ts`, `saas/fiscal.ts`, la migración `0088` y la
pantalla de aterrizaje. `liva-5.yaml:52-54` lista dos; falta `acreditable.ts`,
que es quien decide el **tono** del renglón. `lif-2026-20-A.yaml:91-94` lista
tres; falta `analytics.ts` y las dos pantallas que citan el artículo.

---

## Hallazgos

### [CRÍTICO · REINCIDENTE · pendiente por decisión de producto] C4 — el 15% se mide contra "el combustible que Likida vio", no contra el total de pagos por consumo de combustible del ejercicio

`src/lib/likida/cuadre/engine.ts:337,354` · `src/lib/likida/repo.ts:831-833` ·
ficha `normas/rfa-2026-2.9.yaml` (**verificado_fuente_primaria**, DOF/SIDOF 5780249, 2026-07-27)

> «…siempre que estos no excedan el 15 por ciento **del total de los pagos
> efectuados por consumo de combustible para realizar su actividad**.»
> — `rfa-2026-2.9.yaml:16-17`, `texto_vigente`

Código, literal, **verificado hoy con `grep -n`** (mismas líneas que el pase 4):

```
engine.ts:337   const tope = 0.15 * total;
engine.ts:354     nota: `${etiqueta} pagado en EFECTIVO — el ejercicio lleva ${mxn(acumulado)} de combustible
                  en efectivo contra un tope de ${mxn(tope)} (15% de ${mxn(total)}); el excedente de
                  ${mxn(excedenteDeEste)} de ESTE comprobante NO se deduce (RFA 2026 regla 2.9)…`
repo.ts:831       .or(claves?.length ? `concepto.eq.diesel,clave_prod_serv.in.(…)` : 'concepto.eq.diesel')
repo.ts:832-833   .gte('fecha', `${ejercicio}-01-01`).lte('fecha', `${ejercicio}-12-31`)
```

**Escenario (idéntico al del pase 4, recomprobado).** Flota elegible, ejercicio
2026. $1,200,000 de diésel facturado en terminal, nunca pasa por WhatsApp; por
WhatsApp llegan $80,000, de ellos **$30,000 en efectivo**.
Motor: `tope = $12,000` → **$18,000 a `totalNoDeducible`**, impreso con el
rótulo "15% de $80,000.00". Norma: el 15% de $1,280,000 son $192,000; los
$30,000 son el 2.34%. Lo correcto es **$0.00 no deducible**.

**Consecuencia.** El contralor archiva una pérdida de deducción que no existe, y
el rótulo es falso como afirmación sobre el ejercicio de su flota.
**Causa raíz probable:** el denominador se construyó sobre la única tabla que el
producto tiene, y ningún renglón acota la afirmación a ese alcance.

**Confirmo lo que el encargo pide:** está pendiente **por decisión de producto,
no por código**. `git diff` de `engine.ts` y `repo.ts` contra el pase 4 → vacío;
las líneas 337 y 354 son las mismas. No gasté la ronda aquí. Lo único que
cambió es el contexto y a peor: las dos pantallas que acotaban el alcance
(`contador/comun.tsx:177-179`, *"No es la contabilidad completa de la flota"*) se
borraron en el pase 4 y nadie las reemplazó.

---

### [ALTO · NUEVO] A6 — el motor lee «la forma de pago no es `01`» como «el medio de pago es uno de los que la ley acepta»: un CFDI de diésel con `FormaPago 99` sale impreso "Deducible para ISR", con IVA acreditado y litros contados

`src/lib/likida/cuadre/engine.ts:302,371,1055` · `src/lib/likida/cuadre/desde_db.ts:87-88` ·
`src/lib/likida/repo.ts:846` · `src/lib/likida/fiscal.ts:354,532,536,616,638` ·
`src/lib/likida/intake/cfdi_xml.ts:284` (`MetodoPago` **no se parsea**) ·
ficha `normas/lisr-27-III.yaml` (evidencia_corroborante — *no verificable contra fuente en esta ronda*) y `normas/lif-2026-20-A.yaml` (**verificado_fuente_primaria**)

> «Tratándose de la adquisición de combustibles para vehículos marítimos, aéreos
> y terrestres, el pago **deberá efectuarse en la forma señalada en el párrafo
> anterior**, aun cuando la contraprestación de dichas adquisiciones no excedan
> de $2,000.00…» — `lisr-27-III.yaml:16-19`.
> Y el párrafo anterior (`:9-14`) enumera **exhaustivamente**: transferencia
> electrónica desde cuentas a nombre del contribuyente; cheque nominativo de su
> cuenta; tarjeta de crédito, de débito o de servicios; monederos electrónicos
> autorizados por el SAT.

Código, literal:

```
engine.ts:302    if (g.formaPago === '01' && esCombustible) {
engine.ts:371    } else if (g.formaPago === '01' && !esCombustible && g.monto > topeEfectivo) {
engine.ts:1055     const pagoElectronico = !!g.formaPago && g.formaPago !== '01';
```

La ley enumera **cuatro medios permitidos**; el motor implementa **un medio
prohibido** (`'01'`) y trata todo lo demás como permitido. El catálogo
`c_FormaPago` del SAT tiene ~22 claves: `99` (Por definir), `06` (Dinero
electrónico), `08` (Vales de despensa), `12` (Dación en pago), `17`
(Compensación), `23` (Novación), `30` (Aplicación de anticipos) **no están en la
lista del párrafo anterior** y hoy pasan como si lo estuvieran.

Y `cubetaDe` no tiene ninguna otra puerta: `engine.ts:118-128` devuelve
`'deducible'` en cuanto hay `cfdiUuid` y ninguna diferencia bloqueante. Ningún
tipo de diferencia mira la forma de pago fuera de `'01'`.

**Escenario, con cifras.** Transportes Innovativos tiene línea de crédito en su
estación (el arreglo normal de una flota de 30 unidades). La estación timbra
**PPD**, que por regla del SAT obliga `FormaPago = 99` y `MetodoPago = PPD`.
CFDI de diésel del 6-ago-2026: total **$18,560**, SubTotal $16,000, IVA
trasladado **$2,560**, 660 L, `ClaveProdServ 15101505`, XML verificado.
- Motor: `formaPago = '99'` → ni `engine.ts:302` ni `:371` disparan →
  `cubetaDe` → **`deducible`**. `engine.ts:1055` `pagoElectronico = true` →
  **660 L** a `litrosDieselAcreditables`. `engine.ts:1050` → **$2,560** a
  `ivaAcreditable`.
- PDF (`deducibilidad.ts:72`, `acreditable.ts:96-108`): **"Deducible para ISR
  $18,560.00"** con tono `bueno`; **"Diésel elegible para el estímulo de IEPS
  (LIF 2026 art. 20, ap. A): 660 L"**; **"IVA acreditable (LIVA art. 5):
  $2,560.00"**.
- Norma: en un PPD el medio de pago **todavía no existe** —se documenta después,
  en el complemento de pago (REP)—. El pago pudo ser en efectivo, y entonces:
  cuenta contra el 15% de la RFA 2.9, no acredita IEPS (`rfa-2026-2.9.yaml:37-39`)
  y los 660 L **no** son elegibles. Ninguna de las tres cifras impresas está
  sostenida, y las tres van en dirección **sobre-afirmante**.
- Y el contador del 15% tampoco lo ve: `repo.ts:846` (`if (g.forma_pago === '01')`)
  lo mete al **denominador** ($18,560 de `totalCombustible`) y no al numerador,
  así que además **infla el tope** del resto del ejercicio en $2,784.

**Consecuencia.** El contralor deduce $18,560 y acredita $2,560 de IVA sobre un
comprobante cuyo medio de pago Likida nunca vio, con los artículos impresos al
lado. En una revisión, quien responde es él, y el papel se lo dio Likida — que
es exactamente la posición que `leyendas.ts:9-11` identifica como práctica
indebida **propia** del prestador del servicio.

**Causa raíz probable:** la regla se escribió como "detectar efectivo" (una
clave) en vez de "verificar que el medio de pago esté en la lista de la ley"
(cuatro claves), y `MetodoPago` no se parsea en ningún punto del repo
(`grep -rn "MetodoPago\|metodoPago\|'PPD'" src/` → **cero** fuera de falsos
positivos de la palabra "PUEDE").

*Intenté refutarlo:* ¿lo salva `xmlVerificado`? No — al contrario: el XML es
justo de dónde sale el `99` (`cfdi_xml.ts:284`, `formaPagoSat`), y
`formaPagoSat` (`:173-176`) lo acepta como válido porque solo comprueba que
sean 1-2 dígitos. ¿Lo salva alguna diferencia informativa? `por_diferencia.ts`
no tiene ningún tipo para "medio de pago no acreditado"; el inventario de
`SIN_NORMA` (`:78-93`) tampoco lo menciona. ¿Lo cubre `fiscal.ts:472`
(`sinFormaPago`) o `:626` (`montoSinFormaPago`)? Cuentan solo los `null`, no los
`99`, y ambos viven en `resumirCombustibleCasetas`, que desde el pase 4 **no
tiene consumidor**.

---

### [ALTO · NUEVO] A7 — los dos catálogos de `c_RegimenFiscal` siguen pudiendo divergir, y hoy ya divergen: `/admin/flotas` ofrece 8 claves que el CHECK vigente rechaza

`src/app/admin/flotas/page.tsx:223-233` · `src/lib/likida/administracion.ts:140,147` ·
`supabase/migrations/0088_regimen_624_coordinados.sql:31-38` ·
`src/lib/saas/fiscal.ts:35-42` · `src/lib/saas/fiscal.test.ts:139-148` ·
*sin ficha de `c_RegimenFiscal`* — **no verificable contra el SAT en esta ronda** (undécimo latido bloqueado); lo que sí es comprobable sin salir del repo es la contradicción

Los tres catálogos del mismo `c_RegimenFiscal`, hoy:

```
0088:31-38                     601  603  612  621  624  626          ← el CHECK que la base impone
saas/fiscal.ts:35-42           624  601  603  612  621  626          ← lo que el DUEÑO puede elegir
admin/flotas/page.tsx:223-233  624  601  612  605  606  607  608  610  611  615  616
```

`admin/flotas ∖ CHECK = {605, 606, 607, 608, 610, 611, 615, 616}` (8 claves).
`CHECK ∖ admin/flotas = {603, 621, 626}` (3 claves).

**Escenario A, ruidoso y a la cara.** Javier da de alta una flota chica que
tributa en Arrendamiento y elige *"606 — Arrendamiento"*.
`administracion.ts:140` hace `.insert({ ..., regimen_fiscal: '606' })` →
`tenant_regimen_fiscal_dominio` lo rechaza → `administracion.ts:147` lanza
`crearFlota: new row for relation "tenant" violates check constraint
"tenant_regimen_fiscal_dominio"`. **La flota no se crea** y el mensaje que sale
en pantalla es texto crudo de Postgres. Ocho de las once opciones del
desplegable hacen eso.

**Escenario B, el que importa fiscalmente.** Una flota **RESICO** (`626`) —el
régimen más común en una PF de autotransporte chica hoy— **no se puede
registrar** desde `/admin/flotas`: la clave no está en el desplegable. Se
registra "Sin declarar", `regimen_fiscal = null`, y de ahí sale
`facilidad15 = undefined` (`administracion.ts:129-138`). El motor entra por la
rama `elegible === undefined` (`engine.ts:366-370`) y todo su diésel en efectivo
sale **"por confirmar"** para siempre. Con $180,000 de diésel al año y un 8% en
efectivo, son **$14,400** que el papel nunca declara ni deducibles ni no
deducibles.

**Escenario C, el latente que el arreglo dejó abierto.** El día que una
migración `0089` agregue una clave al CHECK y alguien la ponga en
`/admin/flotas` pero no en `saas/fiscal.ts`, el `<select>` de `forma.tsx:178`
vuelve a caer en la primera opción — que desde `12cc8c6` es **`624 —
Coordinados`**. Las dos pruebas se quedan verdes: `fiscal.test.ts:139-148`
afirma `REGIMENES ⊆ base` (la dirección contraria a la que rompe, y lo dice
por escrito en `:130-138`), y `regimen_no_se_pierde.test.ts:64-73` solo exige
que `['624','612']` estén.

**Consecuencia.** El alta de flota, que es el primer paso del demo, se cae con
un error de Postgres en 8 de sus 11 opciones de régimen; y el arreglo del ALTO
del pase 4 cerró un valor sin cerrar la clase, con el agravante de que el valor
que el navegador inventa cuando la lista queda corta ya no es el neutro.

**Causa raíz probable:** el catálogo se teclea a mano en tres sitios (JSX, un
`as const` y un CHECK de SQL) sin una fuente única ni ficha en `normas/` que lo
respalde; el arreglo del pase 4 sincronizó dos de los tres y dejó fuera
justamente el único que no es una constante legible por una prueba.

---

### [ALTO · REINCIDENTE] A1 — "Ahorro generado — Ejercicio 2026" imprime en pesos el monto **bruto** del gasto

`src/app/dashboard/page.tsx:259,265` · `src/lib/likida/fiscal.ts:441,306-310` ·
contraste vivo `src/app/dashboard/combustible-casetas/page.tsx:193`

Verificado hoy, mismas líneas: `page.tsx:259` `etiqueta={\`Ahorro generado — ${periodoFiscal.etiqueta}\`}`,
`:265` `valor={resumenPerdidas?.montoRecuperable ?? null}`, `fiscal.ts:441`
`else montoRecuperable += f.gasto.monto;`. `fiscal.ts:310` sigue diciendo, sobre
los mismos pesos, *"Es deducción **pendiente**, no perdida"*. Escenario y cifras
sin cambio respecto al pase 4 ($250,000 brutos impresos como ahorro contra
~$109,500 de efecto real en caja). El `?? 0` sí quedó cerrado en el pase 3; el
sustantivo no. **REINCIDENTE.**

### [ALTO · REINCIDENTE] A2 — "En riesgo / perdido" cuenta en rojo el combustible en efectivo que el motor ya declaró **deducible** dentro del 15%, sobre una ventana de 7 días para una regla anclada al ejercicio

`src/app/dashboard/motor-fiscal-periodo.tsx:60-61,11-12,36` ·
`src/lib/likida/fiscal.ts:294-299,360,440` · contraste `engine.ts:344-351`

Verificado hoy: `motor-fiscal-periodo.tsx:60-61` sigue fundiendo
`r.montoEnRiesgo + r.montoPerdido` en un solo número `var(--color-bad)`;
`fiscal.ts:360` sigue empujando `combustible_efectivo` (gravedad `en_riesgo`,
`:294-295`) por el **100% del monto**, y `grep -n "evaluarTope15\|tope15"` sigue
sin aparecer dentro de `causasDe` ni de `resumirPerdidas`. Escenario del pase 4
íntegro ($8,000 en rojo sobre un ejercicio al 6% del tope). **REINCIDENTE.**

### [ALTO · REINCIDENTE] A3 — "Ya no se recupera" por un plazo de **nivel 6** fundado en **LISR 27-III**, y el aviso de WhatsApp calla justo esos tickets

`src/lib/likida/fiscal.ts:264-268,347,441` · `src/lib/likida/facturacion/avisar.ts:26-27,56` ·
ficha `normas/politica-portales-plazos.yaml` (**`sin_verificar`**, `jerarquia: 6`)

Verificado hoy, literal (`fiscal.ts:264-269`): `gravedad: 'perdida'`,
`norma: 'LISR 27-III'`, `detalle: 'El comercio ya no acepta timbrarlo…'`. La
ficha dice, en `advertencia_de_jerarquia:30-35`: «**ESTO NO ES UNA NORMA
FISCAL**… El plazo LEGAL para pedir factura es **todo el ejercicio**… El
producto NUNCA debe presentar estos plazos como una obligación fiscal.» Y
`lisr-27-III.yaml:8-22` no menciona plazos de facturación en ninguna de sus dos
partes. El motor sí lo tiene bien (`por_diferencia.ts:57`:
`factura_por_vencer: ['rmf-2026-2.7.1.21', 'politica-portales-plazos-facturacion']`);
`fiscal.ts` no. **REINCIDENTE.**

### [ALTO · REINCIDENTE] A4 — el combustible en efectivo dentro del 15% no acredita **IVA**, y la ficha que se invoca excluye el **IEPS**, no el IVA

`src/lib/likida/cuadre/engine.ts:985,1003` · fichas `liva-5.yaml` y `rfa-2026-2.9.yaml:37-39`

Verificado hoy: `engine.ts:985` `SIN_ACREDITAMIENTO` sigue conteniendo
`'combustible_efectivo_dentro15'`, `'efectivo_sobre_15'`, `'efectivo_no_elegible'`,
y `:1003` sigue haciendo `continue` sobre el gasto entero, incluida la línea de
IVA de `:1050`. El comentario del bloque (`:981-984`) explica correctamente por
qué existe la lista —"NO acredita **IEPS**"— y acto seguido niega también el
IVA. Escenario del pase 4 íntegro ($800 de IVA no impresos por CFDI).
**REINCIDENTE.**

### [ALTO · REINCIDENTE] A5 — el rail del Asistente dice "**este periodo**" sobre cifras de todo el histórico, con LIVA 5 y LIF 20-A citados al lado

`src/app/dashboard/chat.tsx:32,38,41` · `src/app/api/dashboard/asistente/route.ts:76` ·
`src/lib/likida/analytics.ts:535-536,42-47`

Verificado hoy — la línea del endpoint es la **76**, no la 78 como decía el pase 4:

```
route.ts:76      safe(() => getAcreditables(tenantId!)),          ← sin ventanaDias
analytics.ts:42-46  if (!ventanaDias) return null;  → la consulta no lleva .gte('created_at', …)
chat.tsx:38      `${mxn(acred.iva)} de IVA acreditable este periodo (LIVA, Art. 5).`
```

`/dashboard/page.tsx:95` sí pasa `diasEjercicio`; el endpoint del rail no, y el
rail vive en `chrome.tsx:99` ("fijo a la derecha en las 20 páginas").
**REINCIDENTE.**

---

### [MEDIO · NUEVO] M8 — "IVA acreditable (LIVA art. 5)" es el único renglón del PDF con tono `bueno` y sin un solo pie, sobre una ficha cuya transcripción **termina en la fracción II** y que declara ese hueco como riesgo

`src/lib/likida/liquidacion/acreditable.ts:102-108` · `src/lib/likida/cuadre/engine.ts:1050` ·
ficha `normas/liva-5.yaml` (**verificado_fuente_primaria**, pero **parcial**)

La ficha transcribe la fr. I (`:12-24`) y la fr. II (`:26-28`) y **se corta ahí**
— el artículo 5 tiene más fracciones. Y lo dice ella misma, en `riesgo_actual`:

> «El motor acredita el IVA leído del XML de todo gasto que no cayó en
> SIN_ACREDITAMIENTO. **Si el artículo exige alguna condición adicional que hoy
> no se valida, la cifra impresa está de más.** Es una cifra que el contralor
> usa.» — `liva-5.yaml:47-50`

Y en `verificado_por` (`:51`): «NINGÚN contador público ha revisado esta ficha:
la transcripción es de fuente primaria, la **INTERPRETACIÓN no está
dictaminada**».

Código, literal:

```
acreditable.ts:102-108   if (liq.ivaAcreditable > 0) {
                           filas.push({ label: 'IVA acreditable (LIVA art. 5)',
                                        valor: mxn(liq.ivaAcreditable),
                                        tono: 'bueno',
                                        pies: [] });
```

`tono: 'bueno'` está definido tres líneas más arriba del archivo (`:20-21`) como
«cifra que el motor **sostiene entera**»; `condicionado` es «depende de algo que
el motor NO verifica, y el pie dice de qué». Los otros dos renglones de la
sección van `condicionado` con dos y un pie respectivamente
(`:94-101`, `:110-119`). El del IVA va en verde, sin nada.

**Escenario.** Liquidación con **$41,300** de IVA acreditable (una flota
mediana, mes de agosto). El PDF imprime **"IVA acreditable (LIVA art. 5):
$41,300.00"** con el mismo tono con el que imprime "Deducible para ISR". El
contralor lo pasa a su declaración del mes. Si el artículo condiciona el
acreditamiento a algo que el motor no mira —y la propia ficha dice no saber si
lo hace—, el error no lo detecta nadie hasta una revisión, y el papel afirmó lo
contrario de lo que la ficha sabe.

**Consecuencia.** La regla que el archivo se puso a sí mismo en su encabezado
(`acreditable.ts:9-11`: *"una cifra en el papel con un artículo citado al lado
es una AFIRMACIÓN. Si el motor no puede sostenerla entera, el renglón tiene que
decir qué parte no sostiene — en el mismo papel, no en un YAML"*) se cumple en
dos de los tres renglones y se rompe justo en el que trae más pesos.
**Causa raíz probable:** el tono se eligió cuando el requisito conocido era la
proporción de la fr. I —que sí está implementada (`engine.ts:1050`)— y nadie
volvió a mirar el renglón cuando la ficha se cerró declarando la transcripción
incompleta.

*Intenté refutarlo:* ¿lo cubre `piesGenerales`? No: `acreditable.ts:123` solo
lleva `NOTA_INGRESO_ACUMULABLE`, que habla de los estímulos del art. 20 ap. A,
no del IVA. ¿Lo cubre `leyendaPdf`? Es el descargo genérico del pie de página
(CFF 52/89), no un qualifier de este renglón — y es exactamente la distinción
que el propio archivo hace en `:29-31`.

---

### [MEDIO · NUEVO] M9 — el OCR colapsa **débito en `'04'` (tarjeta de crédito)**, y el motor tiene escrito tres archivos más allá que débito no cuenta para LISR 28-V

`src/lib/likida/intake/ocr.ts:360` · `src/lib/likida/cuadre/engine.ts:849-850,857` ·
ficha `normas/lisr-28-V.yaml` (**verificado_fuente_primaria**)

> «Cuando a la documentación que ampare el gasto de alimentación el
> contribuyente únicamente acompañe el comprobante fiscal relativo al
> transporte, la deducción a que se refiere este párrafo **sólo procederá cuando
> el pago se efectúe mediante tarjeta de crédito** de la persona que realiza el
> viaje.» — `lisr-28-V.yaml:26-29`

El motor lo sabe y lo dejó por escrito:

```
engine.ts:849-850   // Débito ('28') NO cuenta: la ley pide crédito ('04'), no cualquier
                    // tarjeta.
engine.ts:857       const comidasSinTarjeta = vivos.filter((g) => g.concepto === 'alimentacion' && g.formaPago !== '04');
```

El intake lo desmiente:

```
ocr.ts:43     forma_pago: z.enum(['efectivo', 'tarjeta', 'otro']).nullable(),
ocr.ts:360    const formaPago = data.forma_pago === 'efectivo' ? '01' : data.forma_pago === 'tarjeta' ? '04' : undefined;
```

El esquema del OCR **no tiene manera de distinguir crédito de débito** —el enum
solo dice `'tarjeta'`— y el mapeo elige `'04'`, la clave que el motor interpreta
como "cumple la condición".

**Escenario.** Viaje con transporte y **sin** hospedaje. Tres comidas del
operador por **$1,980** en total, pagadas con la **tarjeta de débito** de la
empresa, comprobadas con ticket y timbradas por el portal con UUID pero sin que
el XML se haya jalado todavía (`formaPago` sigue siendo el del OCR).
- Motor: `formaPago = '04'` → `comidasSinTarjeta` sale **vacío** → la diferencia
  `alimentacion_transporte_sin_tarjeta_credito` **no se emite**. `cubetaDe`
  (`engine.ts:118-128`) ve `cfdiUuid` y ninguna diferencia bloqueante →
  **`deducible`**. El PDF imprime esos $1,980 dentro de "Deducible para ISR".
- Norma: con solo transporte acompañando, y pagado con débito, **la deducción no
  procede**. Lo correcto era el aviso que el propio motor sabe redactar
  (`engine.ts:864-866`: *"LISR 28-V exige que, en ese caso, el pago sea con
  tarjeta de crédito de quien viaja. Sin esa condición la deducción no
  procede"*).

**Consecuencia.** El único requisito de LISR 28-V que depende del medio de pago
es inverificable con el dato que el intake produce, y el fallo es silencioso y
en la dirección sobre-afirmante: el aviso desaparece precisamente en los casos
en los que la ley lo pide. **Causa raíz probable:** el enum del OCR se diseñó
para la regla del efectivo (dos estados bastaban) y después se le colgó una
segunda regla que necesita tres.

*Intenté refutarlo:* ¿lo corrige el XML? Sí cuando llega: `repo.ts:428`
(`forma_pago: x.formaPago ?? null`) sobrescribe con el `c_FormaPago` real, que
sí distingue `04` de `28`. Pero ese mismo `?? null` es el otro filo: si el XML
llega **sin** `FormaPago` legible, `formaPagoSat` devuelve `undefined` y la
escritura **borra** el `'01'` que el OCR sí había leído — y con él desaparece la
regla del efectivo sobre ese gasto.

---

### [MEDIO · NUEVO] M10 — `/dashboard/suscripcion` pre-selecciona **"601 — General de Ley Personas Morales"** para una flota que nunca declaró régimen, tres líneas debajo de "cópialos tal cual de tu Constancia"

`src/app/dashboard/suscripcion/page.tsx:353-355,333-336` · `src/app/admin/ui/forma.tsx:178` ·
`src/lib/saas/fiscal.ts:115-131` → `facturapi.ts:183` (`tax_system`) / `capufe.ts:851`

```
suscripcion/page.tsx:333-335   Cópialos tal cual de tu Constancia de Situación Fiscal: el SAT los compara
                               contra tu RFC y rechaza el timbrado por diferencias que se ven inofensivas.
suscripcion/page.tsx:353-355   <Selector nombre="regimenFiscal" etiqueta="Régimen fiscal" requerido
                                 valorInicial={fiscales?.regimenFiscal ?? '601'}
```

`crearFlota` deja `regimen_fiscal = null` cuando Javier registra la flota "Sin
declarar" (`admin/flotas/page.tsx:219`, `administracion.ts:140`), que es el caso
por defecto. El `?? '601'` convierte ese `null` —"nadie lo ha dicho"— en una
respuesta concreta, ya seleccionada, que satisface el `requerido` del campo.

**Escenario.** Flota coordinada (`624` real ante el SAT) registrada "Sin
declarar". El dueño entra a capturar sus datos para poder facturar la
mensualidad, ve el campo "Régimen fiscal" **ya lleno con "601 — General de Ley
Personas Morales"**, asume que Likida lo sacó de algún lado, corrige RFC y CP y
guarda. `guardarDatosFiscales:127` escribe `regimen_fiscal = '601'`. De ahí:
`tax_system: '601'` en el CFDI de la mensualidad (`facturapi.ts:183`) y
`receptor.regimenFiscalReceptor = 601` en el portal de CAPUFE
(`registro.ts:133` → `capufe.ts:851`) sobre un RFC que el SAT tiene registrado
como coordinado. `revisarReceptor` (`flota_fiscal.ts:93`) solo valida forma.
Con $180,000 anuales de peaje, ese es el régimen con el que se piden **todos**
los CFDI de casetas del año.

**Consecuencia.** El producto **inventa un dato fiscal** y lo presenta como si
fuera del cliente, en la pantalla que le acaba de decir que lo copie de su
Constancia. Es la regla "nunca inventar una cifra" del `CLAUDE.md` aplicada a un
campo que no es un número. **Causa raíz probable:** el mismo patrón que el ALTO
que `12cc8c6` arregló —un `defaultValue` que se hace pasar por una respuesta—
sobreviviendo en la línea de al lado; `forma.tsx:178` no ofrece una opción vacía
que permitiera expresar "no lo sé".

---

### Reincidentes del pase 4 que verifiqué línea por línea y siguen abiertos

Todos con `git diff` vacío contra el pase 4 y **las mismas líneas**. Escenario,
cifras y consecuencia: los del pase 4, sin cambio.

| # | Sev | Hallazgo | `archivo:línea` de HOY | Comprobación |
|---|---|---|---|---|
| M1 | MEDIO | `no_encontrado` / `pendiente` no llegan a `causasDe` | `fiscal.ts:335-364` (`:342` cancelado, `:344` sin uuid) | `grep -n "no_encontrado" src/lib/likida/fiscal.ts` → **una línea, la 530** (`ivaSostenible`, sin consumidor). `causasDe` sin rama |
| M2 | MEDIO | `efectivo_no_elegible` fuera de `ORDEN` (**5ª ronda**) | `fiscal.ts:375-378` (declarado `:242`, título `:300`, emitido `:359`) | `ORDEN` idéntica: `efos, cfdi_cancelado, plazo_vencido, efectivo_sobre_tope, efos_indeterminado, combustible_efectivo, sin_cfdi` |
| M3 | MEDIO | Gasto de combustible **sin fecha** contra un contador cuyo denominador lo excluye | `engine.ts:312-313` · `repo.ts:832-833` · agravante `desde_db.ts:86-88` | `desde_db.ts:87` cuenta el sin-fecha como del ejercicio (`g.fecha?.slice(0,4) ?? anioEjercicio`) y lo **resta** de un previo que nunca lo incluyó |
| M4 | MEDIO | El chat cuenta el 15% con `concepto='diesel'` a secas (**6ª ronda**) | `tools.ts:109` `getAcumuladoCombustible(ctx.tenantId, ejercicio)` — **sin** 3er argumento · `repo.ts:831` | Contraste vivo: `desde_db.ts:78` sí pasa `clavesCombustible`. `grep -rn "sumar_combustible_ejercicio" src/` → solo `migraciones_verificadas.test.ts` |
| M5 | MEDIO | Las ventanas de 7/30 días excluyen en silencio los sin-fecha; el campo que lo diría se calcula y se tira | `fiscal.ts:754-755,473` · `motor-fiscal-periodo.tsx:15` · `page.tsx:136-138` | `ResumenSimple` sigue con tres escalares |
| M6 | MEDIO | "Litros elegibles para el estímulo · LIF 2026 Art. 20-A" suma todo el histórico bajo una tarjeta sin periodo | `combustible-casetas/page.tsx:121,188-189` · `analytics.ts:535,42-46` | `getAcreditables(tenantId)` sin ventana. `/dashboard/page.tsx:95` sí la pasa: dos cifras para lo mismo |
| M7 | MEDIO | "48 de 71 sin factura — es deducible que se pierde" sobre lo que el motor llama recuperable | `combustible-casetas/page.tsx:193` · contraste `fiscal.ts:306-310` | `sinCfdi` (`:149-150`) sin ningún filtro por plazo |
| B1 | BAJO | El concepto heredado `viaticos` recibe el tope de **alimentación** de LISR 28-V, que no cubre hospedaje | `engine.ts:892` `c === 'alimentacion' \|\| c === 'viaticos'` | `lisr-28-V.yaml:43`: «Solo alimentación; el hospedaje nacional no tiene tope: CORRECTO» — el código lo contradice para el concepto genérico |
| B2 | BAJO | `avisoTope15` afirma "hay pagos de combustible en efectivo" sin mirar `r` | `aviso.ts:32-33` | Idéntico. `tools.ts:119` lo mete al turno del agente |
| B3 | BAJO | El `continue` del fail-closed del 15% se lleva `monto_discrepante` del mismo comprobante | `engine.ts:324` · notas saltadas en `:381,399,402` | Las otras cuatro ramas del 15% no continúan |

### [BAJO · NUEVO] B4 — el PDF entrega los litros del estímulo **agregados y sin fecha de compra**, y su propio pie le pide al contador que aplique "la cuota fechada"

`src/lib/likida/liquidacion/acreditable.ts:78-80,94-100` · `src/lib/likida/liquidacion/pdf.ts:219,243,334` ·
ficha `normas/lif-2026-20-A.yaml` (**verificado_fuente_primaria**)

> «…la cuota… **vigente en el momento en que se haya realizado la importación o
> adquisición del diésel**…, por el número de litros importados o adquiridos.»
> — `lif-2026-20-A.yaml:26-30`. Y `advertencia_critica:32-35`: «la cuota **cambia
> SEMANALMENTE**».

```
acreditable.ts:96-99   label: 'Diésel elegible para el estímulo de IEPS (LIF 2026 art. 20, ap. A)',
                       valor: fmtLitros(litros),   ← liq.litrosDieselAcreditables, UN escalar
acreditable.ts:78-80   'se entregan los litros para que su contador aplique la cuota fechada.'
```

La tabla de comprobantes del PDF sí trae fecha por renglón (`pdf.ts:219,243`),
pero **no trae litros**: no hay forma de repartir el total entre semanas.

**Escenario.** Viaje largo del 27-jul al 5-ago-2026: 1,400 L en tres cargas (620 L
el 28-jul, 480 L el 1-ago, 300 L el 4-ago). El PDF dice **"1,400 L"**. Con dos
cuotas semanales distintas de por medio —la ficha documenta que pasó de $7.3634
a $2.0925 en cinco meses—, el contador que aplique una sola cuota se equivoca en
cualquiera de las dos direcciones, y el papel le dijo que aplicara "la cuota
fechada" sin darle las fechas.

**Consecuencia.** El único dato del estímulo de diésel que el producto entrega
es correcto en magnitud pero **no es utilizable como el propio pie indica**.
**Causa raíz probable:** la decisión D2 (entregar litros, no pesos) resolvió bien
el numerador y no bajó a la granularidad que la cuota semanal exige.

---

## Hallazgos de pases anteriores que YA NO APLICAN

- **[ALTO, pase 4] `/dashboard/suscripcion` no ofrece el régimen `624` y arranca
  en `601`** — **CERRADO** por `12cc8c6`. `saas/fiscal.ts:36` trae
  `{ clave: '624', nombre: 'Coordinados (Título II Cap. VII)' }`, el catálogo
  coincide exacto con el CHECK de la `0088`, y `regimen_no_se_pierde.test.ts`
  falla en 2 de 3 casos sin él. Lo que **no** cerró vive ahora en A7 y M10.
- **[ALTO, pase 4] «al guardar le apaga a un coordinado la facilidad del 15%»** —
  **RETIRADO POR FALSO, verificado por mí.** `guardarDatosFiscales`
  (`saas/fiscal.ts:122-131`) escribe cinco columnas de `tenant` y **nunca** toca
  `config`; la elegibilidad vive en `tenant.config.facilidadCombustibleEfectivo`
  (`desde_db.ts:56-58`, `fiscal.ts` `opcionesDe`, `tools.ts:115-118`) y solo la
  escriben `crearFlota` y `actualizarFacilidad15`. Lo confirmé abriendo los cinco
  eslabones, no citando el commit.
- **[MEDIO, pase 4] Dos catálogos le ponen "Incorporación Fiscal" a 615 y a 621** —
  **ABSORBIDO en A7**, con el problema real identificado: no es que uno de los
  dos nombres esté mal, es que las 8 claves exclusivas de `/admin/flotas`
  (`615` entre ellas) **el CHECK las rechaza**, así que ese camino no llega
  nunca a un CFDI: revienta antes, en el `insert`.
- Los cuatro cerrados **por supresión** en el pase 4 (peaje en pesos sin las 4
  condiciones en `/dashboard/facturacion`; píldora/gauge del 15% sin
  `elegible15`; base del peaje afirmada como resuelta; leyenda del CFF 89
  ausente en el panel del contador) siguen cerrados: reconfirmé que
  `dashboard/facturacion/` y `dashboard/contador/` no existen
  (`ls src/app/dashboard/` → 9 rutas) y que las dos pantallas con veredicto
  fiscal que quedan traen `LEYENDA_CORTA` (`page.tsx:325`, `[id]/page.tsx:372`).

---

## Lo que revisé y está bien

- **`src/lib/saas/facturapi.ts` completo (246 líneas), primera revisión.** Es el
  mejor archivo fiscal del repo. `exigirLlaveCoherente` (`:69-76`) impide timbrar
  en producción con `sk_test` —un UUID de sandbox tiene la misma forma que uno
  real y la base no los distingue—; `payment_form: '03'` y `payment_method: 'PUE'`
  (`:200-201`) son correctos y **coherentes con el único llamador**
  (`transferencia.ts:315`, cobro por transferencia ya ocurrido: verifiqué con
  `grep` que Stripe **no** timbra por aquí, así que no hay CFDI de tarjeta con
  forma de pago 03); `:213-218` contrasta el total del PAC contra el cobrado y
  grita el mismo día, dentro del plazo de 24h para cancelar; y el timbrado no se
  reintenta a ciegas (`:18-22`). Los tres regímenes que el receptor puede llevar
  son todos válidos para `G03`/`G01`/`I04`.
- **`src/lib/saas/iva.ts` completo, primera revisión.** `TASA_IVA = 0.16` en un
  solo sitio, y **se niega a operar** con `criterio === null`
  (`desglosarPrecio:98-100`) en vez de asumir un lado: exactamente el criterio
  correcto para una cifra irreversible. El redondeo cierra sobre el total
  (`:102-110`) para que `subtotal + iva === total` por construcción, que es lo
  que el CHECK `factura_saas_desglose_cuadra` verifica. La ausencia de tasa
  fronteriza está **declarada con su razón** (`:38-41`), no omitida.
- **El estímulo de IEPS sigue sin imprimirse en pesos, en las cinco superficies
  que podrían.** `engine.ts:998` (`const iepsAcreditable = 0;`),
  `acreditable.ts:94-100` (litros), `page.tsx:298`, `combustible-casetas:188`,
  `[id]/page.tsx:268`. Reverifiqué que nadie escribe `ieps_acreditable ≠ 0`.
  La confusión "IEPS trasladado = estímulo del 20-A" sigue cerrada, y el
  comentario de `engine.ts:1044-1052` la explica citando la ficha literal.
- **El renglón de peaje del PDF sigue completo.** `acreditable.ts:110-119`: la
  condición **en el label**, tono `condicionado`, `BASE_ESTIMULO_PEAJE` (dice qué
  base usó y cuánto cambia con la otra: ~13.8%) y `CONDICIONES_ESTIMULO_PEAJE`
  con las **cuatro** condiciones transcritas de `lif-2026-20-A.yaml:52-56`. Es
  el modelo de cómo debería verse el renglón del IVA (M8).
- **El control de litros contra el monto sigue en pie.** `engine.ts:1065-1074`:
  tolerancia 0.5×–2× contra `precioDieselPorDefecto`, con `diesel_desviacion` y
  **sin acreditar** cuando no cuadra. Un decimal corrido (200 L leídos como
  20,000) no se convierte en cien veces el estímulo.
- **`cubetaDe` (`engine.ts:118-128`) sigue siendo la única definición**, exportada
  y con su comentario explicando por qué `pdf.ts` no la puede reconstruir. El
  reparto en tres cubetas suma el total comprobado y `filasDeducibilidad:54-55`
  **se niega a imprimir** si no suma (tolerancia de 1.5 centavos).
- **`por_diferencia.ts` es un inventario honesto.** Las 13 diferencias sin norma
  están **declaradas** en `SIN_NORMA:78-93` con su motivo, no ausentes; y las que
  necesitan dos normas las traen (`combustible_efectivo: ['lisr-27-fr-III',
  'rfa-2026-2.9']`, `:32`). `factura_por_vencer` cita la política de nivel 6
  **como política** (`:57`) — que es justo lo que `fiscal.ts:267` no hace.
- **`normas_sincronizadas.test.ts` y las 96 pruebas de `normas/` corren verdes**
  y obligan a que `indice.ts` y las fichas no se separen, incluido
  `exigibleDesde`. El interruptor de `rmf-2026-2.7.1.48` en `null` sigue
  impidiendo veredictos duros sobre el complemento de hidrocarburos
  (`engine.ts:531-534`).
- **El permiso CRE nunca se declara cumplido ni incumplido** (`engine.ts:544-558`),
  y el pie de `deducibilidad.ts:70` cita las dos normas que sí lo exigen
  (`lisr-27-III.yaml:19-22` y `rfa-2026-2.9.yaml:17-21`) sin afirmar
  cumplimiento. Cita correcta, verificada contra las dos fichas.
- **`getAcumuladoCombustible` falla cerrado** (`repo.ts:860-864`): si leyó menos
  filas de las que `count` reporta, **lanza** en vez de devolver medio ejercicio.
  El denominador del 15% no se puede recortar en silencio.
- **`leyendas.ts` conserva la eximente literal del CFF 89 último párrafo** y la
  referencia al art. 52, y las dos pantallas con veredicto fiscal la llevan.
- **`/dashboard/politicas` sigue de solo lectura y lo dice** (`:288-291`), con
  los tres topes empatando sus fichas: $750 (`lisr-28-V.yaml:22`), $2,000
  (`lisr-27-III.yaml:9`), 0.5 (`lif-2026-20-A.yaml:46`).
- Las 562 pruebas de `cuadre/`, `liquidacion/`, `fiscal.test.ts`,
  `regimen_facilidad_15.test.ts` y `saas/` corren verdes (41 archivos).

---

## Lo que NO alcancé a revisar

- **`facturacion/adaptadores/capufe.ts` (1,250+ líneas), tercer pase seguido sin
  auditarse.** Este pase confirmó que es un consumidor **directo** del régimen
  fiscal de la flota (`:851`, `elegirEnDesplegable(..., 'Régimen Fiscal')`), o sea
  que teclea datos fiscales del receptor en un portal real que emite CFDI de
  peaje deducible. Es la superficie fiscal más grande sin revisar del repo.
- **`facturacion/al_vuelo.ts` (31 KB) y `facturacion/comercios.ts` (34 KB),
  entrada por entrada.** `comercios.ts` es donde viven los `plazo` /
  `plazoVerificado` que A3 consume.
- **`intake/consolidado.ts` e `intake/ocr.ts` completos.** Este pase solo entró a
  `ocr.ts:41-43,360` (de ahí salió M9) y no recorrió el prompt ni el
  consolidado, que es de donde salen `litros`, `subTotal`, `iva_monto` e
  `iva_tasa` — insumos directos de cuatro reglas fiscales.
- **Lo que pasa cuando Stripe cobra y el timbrado falla**, y el complemento de
  pagos (REP). Confirmé que `timbrarMensualidad` tiene **un solo llamador**
  (`transferencia.ts:315`) y que el camino de Stripe no timbra por ahí; qué
  emite entonces, no lo revisé.
- **Corrida real del motor con estos escenarios.** No creé archivos en el repo
  (instrucción del encargo): todas las cifras salen de leer el código línea por
  línea, y las aritméticas son deliberadamente simples para recomprobarlas a
  mano.
- **Verificación de las fichas contra DOF / SAT / diputados**: imposible en este
  entorno. `normas/.latido-vigilancia` documenta la **undécima** corrida
  consecutiva bloqueada por egress, confirmada hoy con `curl` a los tres hosts
  (403 en el CONNECT). Todo lo que este reporte afirma sobre las normas sale del
  texto ya transcrito en las fichas, y las `evidencia_corroborante` /
  `sin_verificar` quedan anotadas como **no verificables en esta ronda**.
