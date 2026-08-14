# Cumplimiento fiscal — auditoría 3

**Nota: 6.5/10** (antes 6). El motor subió: los tres hallazgos del ancla vieja están cerrados o
contenidos con prueba (IEPS ya no se imprime en pesos, el contador del 15% existe y está bien
construido, EFOS ya distingue presunto de definitivo), la capa de impresión del PDF es disciplinada
(tonos `condicionado`, base declarada, leyenda CFF 89). Lo que impide llegar a 8 —y lo que frena la
nota— es que **lo nuevo de hoy rompe la regla de trazabilidad del propio repo**: la pantalla de
peajes afirma requisitos de una regla (RMF 9.1.8) que **no tiene ficha en `normas/`**, y presenta
como requisito cumplido en verde lo que la única ficha verificada declara SIN RESOLVER; y el panel
fiscal clasifica como "perdido" lo que el propio motor —citando la ficha de nivel 6— dice que es
legalmente exigible dentro del ejercicio. No encontré ninguna cifra computada demostrablemente
equivocada contra ficha verificada (por eso no hay CRÍTICO), pero sí pantallas que afirman más de lo
que las fichas sostienen.

**Riesgo mayor hoy:** la tarjeta "El estímulo del 50% de peaje (RMF 9.1.8)" de
`dashboard/agentes/peajes/vista.tsx`. Es la pantalla que un contralor va a leer con la LIF en la
mano, cita una regla que ninguna ficha respalda, dice "la regla pide EXACTAMENTE lo que esta
pantalla produce", y omite 3 de las 4 condiciones de elegibilidad que la ficha verificada de la LIF
sí lista. Es la misma clase de sobrepromesa que la auditoría vieja (40-auditoria-codigo §2.2) marcó
y que el PDF ya había corregido — reincide en la superficie nueva.

---

## Hallazgos

### A1 · ALTO — La pantalla de peajes afirma requisitos de una regla sin ficha, y pinta en verde lo que la ficha verificada deja SIN RESOLVER

**Código:** `src/app/dashboard/agentes/peajes/vista.tsx:144-161`

- Línea 144: `El estímulo del 50% de peaje (RMF 9.1.8)` — **no existe `normas/rmf-9.1.8.yaml`**;
  la regla no está en `normas/indice.ts` (`NORMAS`) y por tanto `guardiaFundamento` ni siquiera
  podría citarla. La única fuente en el repo es `docs/conocimiento/04-iva-ieps-estimulos.md`
  (documento de investigación, no ficha), y el propio ancla vieja
  (`40-auditoria-codigo.md`, sección SIN VERIFICAR #2) declara: *"El texto literal de la RMF 2026
  regla 9.1.8 … Se usó lo verificado en 04-iva-ieps-estimulos.md §5, no una lectura propia de la
  fuente."*
- Línea 146: `La regla pide EXACTAMENTE lo que esta pantalla produce: la bitácora de viaje conciliada
  contra el estado de cuenta del TAG` — sin ficha, "EXACTAMENTE" es incomprobable. Y lo que la
  pantalla produce es un cruce por monto±$1 y fecha±1 día (`intake/consolidado.ts:123-126`), no una
  bitácora con origen, destino y ruta conciliada, que es lo que los docs del repo atribuyen a la
  fracción II.
- Línea 150: `<Requisito ok texto="Factor 0.5 sobre el importe sin IVA — el motor lo aplica por viaje" />`
  — palomita verde afirmando que la regla pide "importe sin IVA". La ficha
  `normas/lif-2026-20-A.yaml` (verificado_fuente_primaria) transcribe otra cosa y lo deja abierto:

  > `que_dice_la_ley: "hasta en un 50 por ciento del GASTO TOTAL EROGADO por este concepto"`
  > `que_hace_el_motor: "peajeAcreditable += g.subTotal * 0.5 — usa el SubTotal SIN IVA."`
  > `severidad: alta` / `estado: SIN RESOLVER` (hallazgo H4 de la ficha)

  El PDF maneja esto bien (`liquidacion/acreditable.ts:47-49` declara la base y la diferencia de
  ~13.8%); la pantalla nueva convierte la pregunta abierta en requisito cumplido.
- Líneas 150-154: la lista de "requisitos" omite 3 de las 4 `condiciones` de la ficha LIF:

  > `- "Dedicarse EXCLUSIVAMENTE al transporte terrestre de carga, pasaje o turístico"`
  > `- "Usar la RED NACIONAL DE AUTOPISTAS DE CUOTA (no cualquier caseta)"`
  > `- "No ser parte relacionada (LISR art. 179)"`

  Solo aparece "Ingresos anuales menores a 300 MDP". Bajo el encabezado "Qué cumple Likida hoy y
  qué va por cuenta de la flota", la lista se lee completa sin serlo.
- Línea 159-160: imprime la cifra `peajeAcreditable` (histórica, de `getAcreditables`) en esta misma
  tarjeta, **sin leyenda de descargo**: la página no importa `LEYENDA_CORTA` ni ninguna variante
  (sí lo hacen `inicio-contenido.tsx:370` y `[id]/page.tsx:372`). La mitigación del CFF 89 último
  párrafo (`normas/cff-89-90.yaml`: la eximente es la manifestación *por escrito*) no acompaña a la
  afirmación más agresiva del panel.

**Escenario:** flota con $80,000 de casetas timbradas en el histórico. La tarjeta dice que la regla
pide exactamente lo que la pantalla produce, dos palomitas verdes, y $40,000 con el factor aplicado.
La flota es parte relacionada de su comercializadora (LISR 179) y la mitad de sus casetas son
estatales fuera de la Red Nacional — dos causas de improcedencia que la pantalla ni menciona.
**Consecuencia:** el contralor cruza contra el texto de la LIF, encuentra las condiciones omitidas y
la cita sin ficha; o peor, acredita y responde ante una revisión — y el criterio 1/CFF/PI y CFF 89-I
alcanzan a "quien preste servicios", o sea a Likida. Reincidencia en superficie nueva del hallazgo
§2.2 del ancla vieja (el cálculo del motor sigue disparando con `concepto === 'caseta'` a secas,
`engine.ts:1028` — H5 y H6 de la ficha siguen SIN RESOLVER; lo que el PDF matiza, esta pantalla lo
desmatiza).

### A2 · ALTO — El panel fiscal clasifica "plazo del comercio vencido" como pérdida definitiva, contradiciendo la ficha de nivel 6 y al propio motor

**Código:** `src/lib/likida/fiscal.ts:263-269` y `:439` (`montoPerdido`), alimentado por
`getGastosFiscales` (`fiscal.ts:786-800`, vía `facturacion/pendientes.ts:183-187`):

```ts
plazo_vencido: {
  gravedad: 'perdida',
  titulo: 'Plazo de facturación vencido',
  norma: 'LISR 27-III',
  detalle: 'El comercio ya no acepta timbrarlo. Sin CFDI no ampara deducción y el IVA no se acredita.',
},
```

`gravedad: 'perdida'` suma el monto a `montoPerdido`, documentado como *"Lo que ya no se recupera"*
(`fiscal.ts:400-401`). La ficha `normas/politica-portales-plazos.yaml` (la fuente de verdad de estos
plazos, jerarquía 6) dice lo contrario:

> `ESTO NO ES UNA NORMA FISCAL. Es la política interna de un tercero y tiene CERO fuerza legal.`
> `El plazo LEGAL para pedir factura es todo el ejercicio (el SAT lo dice expresamente), y negarla`
> `porque "ya pasó el mes" es una práctica indebida listada por el propio SAT, con remedio en la`
> `Conciliación de Factura. El producto NUNCA debe presentar estos plazos como una obligación fiscal.`

Y el propio motor, sobre el mismo ticket, imprime lo correcto (`cuadre/engine.ts:748-749`): *"se
pasó el plazo de facturación. El comercio ya no suele facturarlo en su portal, pero legalmente
puedes exigirlo dentro del ejercicio (Conciliación de Factura del SAT)"*.

**Escenario:** ticket de diésel de $8,000 del 5 de julio, mirado el 14 de agosto, sin CFDI. El PDF
de la liquidación dice "legalmente puedes exigirlo dentro del ejercicio"; el panel del contador lo
suma a "En riesgo / perdido" (`motor-fiscal-periodo.tsx:69-73`), la lista de causas imprime "Plazo de
facturación vencido · $8,000" (`resumen-visual.tsx:198-209`), y la tool del chat entrega
`montoPerdido` descrito como "monto perdido" (`lib/agents/chat-tools.ts:83,96`).
**Consecuencia:** dos superficies del mismo producto dan veredictos opuestos sobre el mismo papel; el
contralor que crea al panel da por perdida una deducción que la Conciliación de Factura recupera —
es exactamente "el error más caro del dominio" (confundir nivel 6 con obligación fiscal) que
`normas/README.md` documenta, cometido por el panel que vendemos. Agrava: el plazo se calcula con el
default `mes_natural`, que la propia ficha mantiene `sin_verificar`.

### A3 · MEDIO — La bandeja de proveedores reimplementa la validación de receptor sin las lecciones del motor: ni RFC genérico ni razones sociales múltiples

**Código:** `src/lib/likida/proveedores.ts:57-60`:

```ts
export function compararReceptor(rfcReceptor, rfcFlota) {
  if (!rfcFlota || !rfcReceptor) return null;
  return rfcReceptor.trim().toUpperCase() === rfcFlota.trim().toUpperCase();
}
```

El motor, para la misma pregunta, descarta el genérico y acepta los RFC adicionales
(`cuadre/engine.ts:203-209`: `[input.empresaRfc, ...(input.rfcsAdicionales ?? [])]` con
`.filter((r) => r !== RFC_GENERICO)`), y le costó dos auditorías llegar ahí (comentarios AL-6 y
"auditoría 6" en `engine.ts:194-246`). La bandeja compara contra UN solo RFC leído de `tenant`
(`page.tsx:48`) y `rfcChecksumOk` da por bueno el genérico explícitamente
(`intake/cfdi.ts:59`: `if (r === 'XAXX010101000' || r === 'XEXX010101000') return true;`), así que
`revisarReceptor` (`capufe.ts:1236-1252`) no lo frena.

**Escenario 1:** flota con dos razones sociales (`config.empresa.rfcsAdicionales`, caso que el motor
reconoce). El taller factura a la segunda razón social → la bandeja imprime en rojo **"receptor
ajeno — el CFDI no es a tu RFC"** (`vista.tsx:95-98`) y el KPI "Con receptor ajeno" (`vista.tsx:39-40`)
sube — rótulo falso sobre una factura legítima. **Escenario 2:** tenant a medio onboarding con el RFC
genérico en su ficha: la pantalla imprime "Se valida contra el RFC de tu flota (XAXX010101000)"
(`vista.tsx:50`) y una factura a público en general —que no es de la flota ni ampara su deducción—
pasa sin bandera (`receptorEsFlota === true`). **Consecuencia:** el rótulo promete una validación
("no es a tu RFC") que el código no puede sostener en los dos sentidos.

### A4 · MEDIO — La bandeja de proveedores no consulta estatus SAT ni EFOS, y no lo dice

**Código:** flujo completo `proveedores.ts` + `agentes/proveedores/page.tsx` +
`api/export/facturas-proveedor` — cero referencias a `consultarCFDI`, `estado_sat` o `efos`
(verificado con grep sobre los tres archivos). El mismo CFDI, entrando como *gasto*, sí se valida y
saldría "CANCELADO ante el SAT — no deducible" (`engine.ts:499-506`) o a bandeja EFOS. Aquí una
factura cancelada o de un EFOS definitivo (CFF 69-B: *"no producen ni produjeron efecto fiscal
alguno"*, `normas/cff-69-B.yaml`, verificado_fuente_primaria) llega "Pendiente", se aprueba con un
clic y sale en el KPI "Aprobadas — **listas para el export**" (`vista.tsx:37`) al CSV del ERP.
Ninguna fila ni pie dice "estatus SAT sin verificar" — el texto de la tarjeta hasta refuerza ("dato
duro del CFDI, sin OCR", `vista.tsx:48-49`).

**Escenario:** el taller cancela su factura de $46,400 una semana después de emitirla; el XML viejo
ya está aprobado y exportado; el contador la importa a CONTPAQi y deduce $40,000 + acredita $6,400
de IVA de un comprobante cancelado. **Consecuencia:** deducción rechazable en revisión, originada en
un flujo del producto que en su otro carril sí valida. Falta la validación o, mínimo, el rótulo
honesto que el patrón del repo exige ("fallar cerrado **y decirlo**").

### A5 · MEDIO — Tres fichas se quedaron atrás del código (la fuente de verdad desincronizada, segunda vez para portales)

1. `normas/politica-portales-plazos.yaml:16-17` dice: *"Office Depot … Es la ÚNICA entrada del
   catálogo con `plazoVerificado: true`"*. El catálogo real trae **4**:
   `facturacion/comercios.ts:206, 295, 390, 419` (Office Depot, Megasur ×2, Lagas — con evidencia de
   ticket/portal en comentarios). La propia ficha narra que este mismo desfase ya ocurrió y se
   corrigió el 28-jul; reincidió.
2. `normas/rfa-2026-2.9.yaml:45-47` dice: *"El CONTADOR del 15% por ejercicio no existe todavía.
   Hoy el motor avisa que hay que contarlo pero no lleva la cuenta."* — Falso desde 0089:
   `cuadre/desde_db.ts:48-91` + `repo.ts:909-971` (`getAcumuladoCombustible`) + la matriz completa
   de `engine.ts:284-374`. También `usado_en_codigo` está corto.
3. `normas/rlisr-57.yaml:36-39` dice: *"La tabla `operador` NO tiene columna `rfc`, así que
   `operadorRfc` no se puede poblar todavía… NO se creó la columna"*. — Superada:
   `desde_db.ts:41-46` documenta *"El RFC vive en operador.rfc (mig. 0080)"* y lo pobla.

**Consecuencia:** un auditor (o un agente con `guardiaFundamento`) que confíe en la ficha concluye lo
contrario de lo que el producto hace. En este repo la ficha ES el fundamento; una ficha que dice
menos de lo que el código afirma es trazabilidad rota — en el caso 2 y 3 a favor, pero rota igual.

### A6 · MEDIO — "Es ingreso acumulable" se imprime sin ficha que lo transcriba

**Código:** `liquidacion/acreditable.ts:70-71` (`NOTA_INGRESO_ACUMULABLE`: *"Los estímulos del art.
20 ap. A son ingreso acumulable para ISR: el beneficio neto es menor."*, pie general del PDF) y
`agentes/peajes/vista.tsx:160` (*"es estímulo BRUTO y es ingreso acumulable: tu contador lo neta de
ISR"*). La ficha `normas/lif-2026-20-A.yaml` transcribe los dos estímulos y sus condiciones, pero
**no** el párrafo de acumulación; ninguna otra ficha lo hace. La afirmación es plausible (el ancla
vieja la usa) y su dirección es conservadora —reduce el beneficio prometido—, pero es una afirmación
normativa impresa cuyo fundamento no está en `normas/`. **No verificable en esta ronda.** Para
cerrarla: transcribir en la ficha LIF el párrafo del art. 20 que declara acumulables los estímulos
de las fracciones correspondientes, o quitar la frase del papel.

### A7 · MEDIO — El IVA del combustible en efectivo dentro del 15% se niega sin ficha que lo sostenga, y en silencio

**Código:** `cuadre/engine.ts:985` — `combustible_efectivo_dentro15` está en `SIN_ACREDITAMIENTO`
(igual `fiscal.ts:533-536`). La ficha `normas/rfa-2026-2.9.yaml` solo niega el IEPS:

> `limite_importante: Conserva la DEDUCCIÓN para ISR. NO habilita el acreditamiento del IEPS: son`
> `dos beneficios distintos y el efectivo solo salva uno.`

Y `normas/liva-5.yaml` (verificado_fuente_primaria) condiciona el acreditamiento a que la erogación
sea *deducible para ISR* — que, dentro del 15%, lo es. **Escenario:** carga de diésel de $5,800 en
efectivo, con XML verificado, dentro del 15% del ejercicio: el motor la declara deducible por la
facilidad (correcto) pero su IVA de $689.66 no entra a `ivaAcreditable`, y ninguna nota lo dice (las
notas de la regla 5 solo dicen "No acredita IEPS"). **Consecuencia:** cifra de IVA impresa MENOR a la
que las fichas transcritas sostienen, sin declararlo. Dirección conservadora — pero es la misma
clase de pregunta-para-contador que H4, y aquélla sí se declara en el papel
(`acreditable.ts:47-49`); ésta no. O se documenta el fundamento (¿LIVA 5 tiene requisito de medio de
pago que la ficha no transcribe?) o se dice en el papel qué IVA se excluyó y por qué.

### A8 · MEDIO — El importador de viajes convierte "anticipo ausente" en $0 medido, y no lo reporta

**Código:** `lib/likida/importar_viajes.ts:214` — `anticipo: f.anticipo ?? 0` (columna opcional; solo
3 encabezados reconocidos, `:49`). El `ResultadoImportacion` (`:159-167`) reporta creados, saltados y
operadores sin amarrar, pero **no** cuántas filas venían sin anticipo. El cuadre usa el mismo valor
sin distinguir (`desde_db.ts:103` → `engine.ts:641-652`). **Escenario:** el export del TMS trae la
columna "importe anticipo" (encabezado no reconocido) — 200 viajes entran con anticipo $0; al primer
viaje liquidado con $9,400 comprobados, el PDF imprime *"El operador puso $9,400 de su bolsa — a
favor del operador"* sobre un anticipo que nadie capturó. **Consecuencia:** el cero-que-parece-medición
que la regla de oro del repo (`CLAUDE.md`) prohíbe. Atenuante: el flujo de WhatsApp ya iguala 0
dicho y 0 por omisión (`crear_viaje_wa.ts:277-279`) — pero ahí el jefe está en la conversación; aquí
son hasta 2,000 filas mudas. Mínimo exigible: contar y decir "N viajes entraron sin anticipo".

### A9 · BAJO — `pendientes.armar()` no gatea el plazo por `plazoVerificado`, a diferencia del motor

`facturacion/pendientes.ts:185`: `plazo: c?.plazo ?? 'mes_natural'` — usa el plazo del catálogo esté
o no verificado. El motor sí gatea (`engine.ts:698`: `comercio?.plazoVerificado ? comercio.plazo :
'mes_natural'`). Hoy es latente (el catálogo solo trae `mes_natural`/`mes_siguiente` y los
`mes_siguiente` están verificados); el día que alguien agregue un plazo en días sin verificar, la
pantalla "por facturar" y `plazoVencido` de `fiscal.ts` (→ A2) vencerán tickets con un plazo
inventado, exactamente lo que `plazoVerificado` existe para evitar.

### A10 · BAJO — El contador del 15% suma duplicados

`repo.ts:909-971` (`getAcumuladoCombustible`) suma toda fila de `gasto` de combustible del ejercicio
sin deduplicar por UUID/folio (el dedup de `copiasDeComprobante` es por viaje, dentro del motor).
Una foto repetida del mismo ticket en dos viajes infla base y numerador del 15%; si la copia es
electrónica, infla el tope y el motor puede declarar "dentro del 15%" contra una base engordada.
Caso de borde de calidad de datos; `detectarAnomalias` cubre parte.

### A11 · BAJO — LISR 27-III exige medio electrónico; el motor solo castiga `formaPago === '01'`

`engine.ts:302,371`: solo el efectivo dispara las reglas. La ficha `lisr-27-III` exige para >$2,000
(y todo combustible) transferencia/cheque/tarjeta/monedero; una forma de pago exótica del catálogo
SAT (p. ej. '99' por definir, '30' aplicación de anticipos) pasa sin observación y su gasto sale
deducible con IVA. Falso negativo raro pero fail-open en el camino del dinero.

---

## Verificación del ancla vieja (40-auditoria-codigo.md)

| Hallazgo viejo | Estado | Evidencia |
|---|---|---|
| §2.1 IEPS: se acreditaba el trasladado del comprobante | **CERRADO** | `engine.ts:994-998`: `const iepsAcreditable = 0` con el porqué; el dato entregado son litros con verosimilitud 0.5×–2× (`engine.ts:1054-1077`) y candado de medio de pago (`:1055`); el PDF imprime litros, no pesos (`acreditable.ts:94-100`); cumple el `pendiente_en_producto` de `criterio-1-LIF-PI` ("solo litros, cuota fechada") |
| §2.2 50% de casetas sin requisitos, en verde | **PARCIAL / REINCIDENTE** | El cálculo sigue sin gate (`engine.ts:1028` dispara con `concepto === 'caseta'` + `subTotal`; H4/H5/H6 de la ficha LIF siguen `SIN RESOLVER`); la **presentación** en PDF sí se corrigió (`acreditable.ts:110-119`: "sujeto a elegibilidad", base declarada, 4 condiciones, tinta neutra) — pero la pantalla nueva de peajes reincide en afirmar de más (hallazgo A1) |
| §2.3 Diésel en efectivo no deducible sin la válvula del 15% | **CERRADO** | Matriz completa en `engine.ts:284-374` (elegible/dentro, elegible/excede con excedente por comprobante, no elegible, sin declarar→por confirmar); base combustible-contra-combustible (`periodo/combustible.ts:15-17`, `TOPE_EFECTIVO = 0.15`); productor real del contador (`desde_db.ts:48-91` + `repo.ts:909` fail-closed); pruebas `engine_diesel_medio_pago.test.ts`, `diesel_estimulo.test.ts` en la suite verde de la línea base |

---

## Lo que revisé y está bien (ficha ↔ código)

- **LISR 28-V, tope de alimentación** — ficha: *"$750.00 diarios por cada beneficiario… sólo
  alimentación"* ↔ `config.ts:107` (`viaticosTopeFiscalDiarioMxn: 750`) y `engine.ts:872-968`: por
  día, solo `alimentacion`/`viaticos` legado, hospedaje sin tope; prorrateo del día solo entre
  timbrados (el `monto` de la diferencia ya no afirma exceso sobre tickets sin timbrar,
  `engine.ts:938-961`). H1 como aviso (`alimentacion_sin_soporte`, `engine.ts:772-835`, con amparo
  "real" — monto no trivial o CFDI); H2 implementado: *"sólo procederá cuando el pago se efectúe
  mediante tarjeta de crédito"* ↔ `engine.ts:856-868` exige `'04'` y excluye débito. H3 (faja de 50
  km) sigue sin regla, declarado en la ficha con su causa (falta la base del operador).
- **LIVA 5 fr. I, proporcionalidad** — ficha: *"en la proporción en la que dichas erogaciones sean
  deducibles"* ↔ `engine.ts:1010-1026`: `proporcionDeducible` (tope diario y frontera del 15%)
  aplicada al IVA leído del XML; bloque al final del motor para ver todas las diferencias; nunca IVA
  recalculado con tasa asumida (`engine.ts:1004-1008`, exige `xmlVerificado`).
- **RMF 2.7.1.48, exigibilidad** — ficha: *"la obligación puede estar latente… `fecha_vigencia_desde`
  null"* ↔ `normas/indice.ts:306` (`exigibleDesde: null`) y `engine.ts:530-573`: con null solo
  `complemento_no_verificable` (revisión); el veredicto duro requiere fecha respaldada e imprime esa
  fecha. `vigenteDesde` de config degradado a filtro de ruido. Prueba: `complemento_exigibilidad.test.ts`.
- **CFF 69-B, presunto vs definitivo** — ficha: el efecto duro es *solo* del listado definitivo ↔
  `intake/sat.ts:66-85`: nunca se afirma `efos: true` desde la respuesta del ConsultaCFDIService;
  todo código no-limpio cae en `efosDesconocido` → `cfdi_efos_indeterminado` (bandeja), no fraude.
- **RFA 2.9, permiso CRE** — ficha: *"en el comprobante fiscal deberá constar la información del
  permiso vigente"* ↔ `engine.ts:545-594`: no se extrae del XML → nunca se declara cumplido NI
  incumplido; aviso único acumulado; el renglón "Deducible para ISR" baja a `condicionado` con pie
  (`deducibilidad.ts:59-72`) en vez de afirmar en verde.
- **RLISR 57, viático a nombre del operador** — ficha: *"podrán ser expedidos a nombre de dichas
  personas"* ↔ `engine.ts:479-497` (tres caminos: coincide→nada, sin RFC→aviso sin quitar deducción,
  tercero→no deducible) con productor real `operador.rfc` (`desde_db.ts:41-46`, mig. 0080).
- **Política de portales, nivel 6 en el motor** — ficha: *"nunca presentar estos plazos como
  obligación fiscal"* ↔ `engine.ts:698` (gate `plazoVerificado`), `:730-752`: ambas ramas dicen que
  el plazo legal es el ejercicio; fecha dudosa suspende el cálculo del plazo (`:745-747`). Prueba:
  `plazo_jerarquia.test.ts`, `plazo_fecha_dudosa.test.ts`. `caducidad.ts:62-68` implementa
  `mes_siguiente` exactamente como el ticket de Office Depot de la ficha (25-jul → 31-ago).
- **CFF 89-90, la eximente por escrito** — ficha: *"cuando se manifieste… POR ESCRITO"* ↔
  `cuadre/leyendas.ts` ("puede diferir de los criterios que dé a conocer el SAT") impreso en el PDF
  que se archiva (`pdf.ts:452-460`) y en el panel (`inicio-contenido.tsx:370`, `[id]/page.tsx:372`).
  (La pantalla de peajes es la excepción — ver A1.)
- **Constantes fiscales** — `config.ts:106-109`: 0.5 (LIF 20-A), $750 (LISR 28-V), $2,000
  (LISR 27-III, `>` = "exceda de"), IEPS solo `15101505` (diésel; magna/premium excluidas) — todas
  rastrean a su ficha. `etiquetaConcepto` (`engine.ts:1191-1198`) evita rotular "Diésel" una gasolina
  y con ello invitar un estímulo que no aplica.
- **Casetas por XML entran como `caseta`** — `intake/concepto.ts:41-49` mapea claves de peaje
  (cierre del hallazgo "toda caseta timbrada entraba como factura y perdía el estímulo").
- **Conciliador de consolidados** — `intake/consolidado.ts`: ante duda no liga (0 o >1 candidatos →
  humano), no toca monto/fecha del gasto, idempotente, guardia anti-doble-ligado. La página de
  peajes deja el KPI primario sin catch (página caída ≠ "no hay nada", `peajes/page.tsx:45-46`).
- **`getAcreditables`** — suma por tenant lo ya calculado por el motor; el rótulo de la vista
  ("con el factor ya aplicado, histórico") describe exactamente eso (`analytics.ts:608-628`).
- **`resumirFiscal` / motor del periodo** — IVA solo documentado y sostenible (`fiscal.ts:527-538`),
  nunca estimado al 16% (`:443-447`); IEPS del comprobante NO se imprime en pesos en el panel
  (`resumen-visual.tsx:180-185` documenta por qué se quitó); `iepsDieselDocumentado` y
  `subTotalCasetas` hoy no tienen consumidor de UI (sin cifra impresa que auditar).

## Lo que NO alcancé a revisar

- **`processor.ts` (~2,300 líneas)** — la rama nueva de oficina (~402-470) y los hitos (~1545); si
  algún mensaje de WhatsApp afirma algo fiscal fuera de `resumen.ts`, no lo vi.
- **`facturacion/` en profundidad** — adaptadores Playwright (CAPUFE, pagina_playwright), `al_vuelo`,
  `enrutar`, `caducidad` sí; el cron `api/cron/facturar` y `avisar.ts` solo por encima. `modo.ts`
  (candado apagado) excluido por instrucción: decisión de negocio, no hallazgo.
- **`api/export/facturas-proveedor/route.ts`** — solo el contrato de columnas vía
  `aFilaExportProveedor`; no leí la ruta (encabezados CSV, escape, tenant-scoping).
- **`laboral/pagadero.ts` y `cuadre/resumen.ts`** — LFT 110/111/263 y el filtrado SOLO_CONTRALOR:
  los toqué de pasada; son frontera con el rubro legal.
- **Vistas de agentes de liquidación/facturas/cobranza** — fuera del foco fiscal de hoy salvo el
  cruce con leyendas.
- **Los tests caso-por-caso de la norma** — verifiqué que existen y están en la suite verde de la
  línea base (`diesel_estimulo`, `complemento_exigibilidad`, `plazo_jerarquia`,
  `engine_diesel_medio_pago`, `viatico_transporte_sin_tarjeta`, `cifras_tolerancia`) pero no leí
  cada aserción; no corrí pruebas (regla del MAPA).
- **El texto real de la RMF 9.1.8** — sin ficha y sin acceso a fuente primaria en esta ronda, todo
  lo atribuido a esa regla queda **no verificable**; es la ficha que más urge crear (A1).
