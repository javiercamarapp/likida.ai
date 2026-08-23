# Cumplimiento fiscal — auditoría 18

**Nota: 7/10** (antes 6). Razón del movimiento: **se atacó y subió**. El crítico que
anclaba la nota —`iepsAcreditable` leyendo el IEPS trasladado del CFDI— está
**cerrado**, y cerrado en los seis lugares a la vez (motor, PDF, panel del contador,
chat, prompt del agente y ficha). Además la trazabilidad dejó de ser informal: hay 24
fichas, un índice tipado, un corpus, un mapa `diferencia → ficha` y una prueba de
sincronización que pasa. Lo que impide llegar a 8 es que **toda la deuda viva se
concentró en un solo estímulo, el de peaje**: el motor lo entrega sobre casetas
pagadas en efectivo, y el pie del PDF invita a una base que la regla 9.1.8 prohíbe
por escrito.

Riesgo mayor hoy: **la única regla verificada en fuente primaria que fija los
requisitos del 50% de peaje —RMF 2026 9.1.8— no existe ni para el motor ni para el
PDF; vive únicamente en una pantalla del panel que el contralor no archiva.**

---

## Hallazgos

### [ALTO · REINCIDENTE] El 50% de peaje se acredita sobre casetas pagadas en EFECTIVO

`src/lib/likida/cuadre/engine.ts:1008` · `src/lib/likida/liquidacion/acreditable.ts:110-119`

**Norma** (ficha `normas/rmf-2026-9.1.8.yaml`, `verificado_fuente_primaria`: **sí**),
fracción III, literal:

> «Efectuar los pagos de autopistas mediante la tarjeta de identificación automática
> vehicular o de cualquier otro sistema electrónico de pago con que cuente la
> autopista y conservar los estados de cuenta» de dicha tarjeta o sistema.

Y la propia ficha lo traduce en `consecuencias_operativas`:

> «La fr. III mata el efectivo: una caseta pagada en ventanilla con billetes NO genera
> estímulo aunque después se facture.»

**Código** (`engine.ts:1008`, dentro del bloque de acreditamiento):

```ts
if (g.concepto === 'caseta' && (g.subTotal ?? 0) > 0) peajeAcreditable += (g.subTotal as number) * peajeFactor;
```

No hay una sola lectura de `g.formaPago` en esa rama. La única puerta que podría
atraparlo —`efectivo_sobre_tope`, `engine.ts:391-393`— exige
`!esCombustible && g.monto > topeEfectivo` (**$2,000**), y una caseta casi nunca
llega a $2,000.

**Escenario con pesos.** Entra una caseta de **$928** (SubTotal $800 + IVA $128),
pagada en ventanilla con billetes (`formaPago: '01'`), con CFDI timbrado y XML
verificado — el caso normal de una flota que factura CAPUFE al final del mes.

- El motor imprime: `Estímulo de peaje 50% (LIF 2026 art. 20, ap. A) — sujeto a
  elegibilidad · **$400.00**`.
- La norma dice: **$0.00**. La fr. III no es una condición de fondo que la flota
  declare, es una condición de forma sobre **ese** pago.

Sobre 40 casetas al mes en esa condición son ~$16,000 mensuales de estímulo
inexistente en el papel que se archiva.

**Consecuencia.** El pie del PDF (`CONDICIONES_ESTIMULO_PEAJE`, `acreditable.ts:64-67`)
enumera **exactamente cuatro** condiciones y dice «El estímulo exige las cuatro»: la
frase es exhaustiva y omite las tres de la regla 9.1.8 (aviso de marzo, bitácora
conciliada, pago electrónico). El contralor que verifica las cuatro concluye que el
estímulo procede. Ni el PDF ni `acreditable.ts` nombran la regla 9.1.8 una sola vez, y
`normas/por_diferencia.ts:133` (`caseta: ['lif-2026-art-20-A']`) tampoco la habilita,
así que el agente tiene **prohibido** citarla al explicar el renglón. La única pantalla
donde sí aparece es `src/app/dashboard/agentes/peajes/vista.tsx:305`, que dice
literalmente «Likida no verifica la forma de pago de cada caseta; el efectivo en
ventanilla mata el estímulo» — el papel afirma lo que la pantalla desmiente.

**Estado del hallazgo previo:** REINCIDENTE, mitigado a medias. Lo que se atacó desde
la auditoría anterior fue el color (ya no sale verde) y las cuatro condiciones de la
LIF. Lo que no se atacó es la puerta que el motor sí podía cerrar solo, porque
`formaPago` ya está en la fila.

**Causa raíz probable:** el acreditamiento se ancló a la ficha de la LEY (`lif-2026-20-A`,
jerarquía 1) y la regla de carácter general que la instrumenta (jerarquía 3) se cableó
solo a la pantalla de peajes cuando se escribió la bitácora, sin volver al motor.

---

### [ALTO] El pie del PDF invita a subir la base del peaje 13.8%, contra el texto literal de la 9.1.8 fr. IV — y el porcentaje además está mal

`src/lib/likida/liquidacion/acreditable.ts:47-49` (impreso por `liquidacion/pdf.ts:399-404`)

**Norma** (ficha `normas/rmf-2026-9.1.8.yaml`, `verificado_fuente_primaria`: **sí**),
fracción IV, literal:

> «Para la determinación del monto del acreditamiento, se aplicará al importe pagado
> por concepto del uso de la infraestructura carretera de cuota, **sin incluir el IVA**,
> el factor de 0.5 para toda la Red Nacional de Autopistas de Cuota.»

La ficha `normas/lif-2026-20-A.yaml` ya cerró la duda con esa fracción, en su propio
hallazgo H4: `estado: RESUELTO (14-ago-2026) … La lectura conservadora del motor es la
que la regla ordena — **no hay que cambiar el código**.`

**Código** (la constante que se imprime al pie del renglón):

```ts
export const BASE_ESTIMULO_PEAJE =
  'Base usada: el subtotal SIN IVA de las casetas con CFDI verificado. La ley dice "50% del gasto total erogado"; ' +
  'si su contador toma el total con IVA, la cifra sube alrededor de 13.8%.';
```

Y el docstring que la encabeza (`acreditable.ts:37-45`) sigue diciendo
«Es el hallazgo H4 de la ficha, `severidad: alta`, `estado: SIN RESOLVER`» — la ficha
dice RESUELTO desde el 14-ago.

**Escenario con pesos.** Casetas del periodo con CFDI: SubTotal **$10,000**, IVA
**$1,600**, total erogado **$11,600**.

- El motor imprime **$5,000.00** — correcto.
- Debajo, el mismo papel imprime: «si su contador toma el total con IVA, la cifra sube
  alrededor de 13.8%». El contador que sigue la invitación acredita
  **$11,600 × 0.5 = $5,800.00**.
- La norma dice **$5,000.00** y cierra la discusión: «sin incluir el IVA».

Sobrancreditamiento invitado: **$800 por cada $10,000 de casetas**.

Y el número del pie tampoco cuadra: de $5,000 a $5,800 la cifra **sube 16%**, no 13.8%.
El 13.8% es la relación inversa ($5,000 es 13.8% *menos* que $5,800), que es como está
escrita —bien— en la ficha, e invertida —mal— en la constante. Un contralor con
calculadora encuentra eso en el primer minuto.

**Consecuencia.** El documento archivado presenta como pregunta abierta para el
contador algo que una regla verificada en fuente primaria resolvió, y empuja la
respuesta hacia el lado que sobre-acredita. Es exactamente el supuesto del criterio
1/LIF/PI del Anexo 3, que alcanza a «quien preste servicios»: la sugerencia sería de
Likida, no del cliente.

**Causa raíz probable:** la constante y su prueba (`acreditable.test.ts:16-22`, que fija
en un comentario «$580, no $500 … estado: SIN RESOLVER») se escribieron antes de que la
ficha 9.1.8 entrara al repo, y la ficha se actualizó sin tocar el texto que se imprime.

---

### [MEDIO] Los litros de diésel se declaran elegibles con cualquier forma de pago que no sea efectivo, incluida «99 · Por definir»

`src/lib/likida/cuadre/engine.ts:1035-1036`

**Norma** (ficha `normas/lif-2026-20-A.yaml`, `verificado_fuente_primaria`: **sí**).
La ficha transcribe el cuerpo de la fracción IV pero **no transcribe el párrafo del
medio de pago**; quien lo enuncia es el comentario del propio motor
(`engine.ts:1028-1029`): «El medio de pago es requisito del 4º párrafo de la LIF
20-A-IV (monedero, tarjeta, cheque nominativo o transferencia)». O sea: el motor aplica
un requisito cuyo texto no está en ninguna ficha — la regla del repo es que sin ficha no
se afirma.

**Código:**

```ts
const pagoElectronico = !!g.formaPago && g.formaPago !== '01';
if (pagoElectronico && Number.isFinite(litros) && litros > 0) { … litrosDieselAcreditables += litros; }
```

`!== '01'` no es la lista que el propio comentario cita. Entran `'99'` (Por definir,
el valor obligatorio de todo CFDI **PPD**), `'12'` (dación en pago), `'17'`
(compensación), `'23'` (novación) — ninguno es monedero, tarjeta, cheque nominativo ni
transferencia.

**Escenario con pesos.** CFDI de diésel a crédito (PPD, `formaPago: '99'`),
clave `15101505`, **500 litros**, $13,500.

- El motor imprime: «Diésel elegible para el estímulo de IEPS (LIF 2026 art. 20, ap. A)
  · **500 L**», y el pie le dice al contador que multiplique por la cuota fechada.
- Con la cuota disminuida de la semana del 15-21-ago-2026 ($2.2760/L, DOF 14-ago,
  codNota 5796377) eso son **$1,138.00** de estímulo declarados elegibles sobre un CFDI
  cuyo medio de pago todavía no existe: al timbrarse el complemento de pago puede
  resultar efectivo.
- La forma correcta es el mismo tercer estado que el motor ya aplica en todos lados: no
  elegible ni descartado, a revisión.

**Consecuencia.** Los litros son *la* cifra que el producto entrega en este estímulo
(porque los pesos se negaron a propósito). Inflarlos es inflar el único número duro que
sobrevivió a la decisión D2.

**Causa raíz probable:** `!== '01'` se escribió como «no fue efectivo» y nunca se
convirtió en la lista blanca que el comentario de al lado ya describe.

---

### [MEDIO] La rama buena de RLISR 57 es inalcanzable: nada en el producto escribe `operador.rfc`

`src/lib/likida/cuadre/engine.ts:509-514` · `src/lib/likida/repo.ts:994`

**Norma** (ficha `normas/rlisr-57.yaml`, `verificado_fuente_primaria`: **sí**), literal:

> «Si benefician a personas que le prestan servicios personales subordinados, los
> comprobantes fiscales **podrán ser expedidos a nombre de dichas personas**, en cuyo
> caso y para efectos del artículo 18, fracción VIII de la Ley, se tendrá por cumplido
> el requisito de respaldar dichos gastos con el comprobante fiscal a nombre de aquél
> por cuenta de quién se efectuó el gasto.»

**Código:**

```ts
if (esViatico && rfcOperador && norm(g.rfcReceptor) === rfcOperador) {
  // Es del operador: correcto por RLISR 57, no se reporta nada.
} else if (esViatico && !rfcOperador) {
  diferencias.push({ tipo: 'viatico_rfc_operador', …
    nota: `… Si es el del operador es válido (RLISR 57, trabajador subordinado) — captura su RFC para confirmarlo.` });
```

`rfcOperador` viene de `cuadre/desde_db.ts:52` (`operador?.rfc`). La columna existe
(mig. 0080) y el lector existe. El **escritor** `repo.ts:994 actualizarRfcOperador` se
agregó y **no lo llama nadie**: `grep -rn "actualizarRfcOperador" src/` fuera de
`repo.ts` → 0 resultados, y `src/app/dashboard/operadores/{page,vista}.tsx` no contiene
la cadena `rfc` en ninguna forma. Verificado hoy.

**Escenario con pesos.** Hospedaje de **$2,320** en carretera, timbrado al RFC del
operador (que es trabajador subordinado, es decir el supuesto que el reglamento
autoriza).

- El motor imprime `viatico_rfc_operador`, la liquidación entera baja a **«Por
  revisar»** (el tipo está en `REVISAR`, `engine.ts:1135`) y el papel instruye
  «captura su RFC para confirmarlo» — una acción que **no existe en ninguna pantalla ni
  endpoint del producto**.
- El dinero no se pierde ($2,320 siguen deducibles y su IVA acreditable: el tipo no
  está en `NO_DEDUCIBLE_ISR` ni en `SIN_ACREDITAMIENTO`), pero **toda** liquidación con
  un viático a nombre del operador queda condenada a revisión humana permanente.

**Consecuencia.** Al contralor se le pide una acción imposible en el documento que
archiva, y la promesa de «cero fallas» se convierte en una bandeja que nunca se vacía.
La ficha ya declara este pendiente («lo que SIGUE faltando es la CAPTURA»); lo nuevo de
esta ronda es que ahora hay una función escrita para hacerlo y sigue sin cablearse.

**Causa raíz probable:** la corrección se hizo por capas (esquema → lector → función de
escritura) y se detuvo un paso antes de la UI.

---

### [MEDIO] Un consumo en bar se imprime 100% deducible

`src/lib/likida/cuadre/tope_alimentacion.ts:60-62` · `src/lib/likida/cuadre/engine.ts:907-948`

**Norma** (ficha `normas/lisr-28-XX.yaml`, `verificado_fuente_primaria`: **NO** —
`evidencia_corroborante`; el PDF de diputados no se pudo leer en la sesión que la
cerró, así que este hallazgo se anota **no verificable en fuente primaria en esta
ronda**), texto transcrito:

> «XX. El 91.5% de los consumos en restaurantes. Para que proceda la deducción de la
> diferencia, el pago deberá hacerse invariablemente mediante tarjeta de crédito, de
> débito o de servicios, o a través de los monederos electrónicos que al efecto
> autorice el Servicio de Administración Tributaria. […] **En ningún caso los consumos
> en bares serán deducibles.**»

**Código:**

```ts
export function llevaTopeAlimentacion(concepto: string): boolean {
  return concepto === 'alimentacion' || concepto === 'viaticos';
}
```

Toda `alimentacion` recibe el mismo trato de viático de la fracción V (deducible hasta
$750/día). No existe el concepto `bar` ni una señal de consumo de alcohol en el intake.

**Escenario con pesos.** Ticket de bar de **$600** con CFDI y tarjeta, dentro de un
viaje con hospedaje.

- El motor imprime: `Deducible para ISR $600.00`, en verde, y acredita **$82.76** de
  IVA citando LIVA art. 5.
- La norma (fr. XX, última oración) dice **$0.00** deducible y, por LIVA 5-I (que
  define «estrictamente indispensable» como «deducible para ISR»), **$0.00** de IVA
  acreditable.

**Consecuencia.** Es el modo de falla que el producto prohíbe por escrito: sobreestimar
la deducción. La ficha lo declara `NO_IMPLEMENTADO` con su plan de cierre, así que no
es un descuido oculto — pero mientras no exista la clasificación, la cifra impresa está
de más y nada en el papel lo advierte.

**Causa raíz probable:** el OCR agrupa «restaurante, fonda, tortas, agua, café» bajo una
sola etiqueta (`intake/ocr.ts`), y sin esa distinción el motor no puede afirmar 8.5%/0%
sin inventar.

---

### [BAJO] El 15% de la RFA 2.9 se reparte en proporción, y el papel no dice que ésa es una lectura

`src/lib/likida/cuadre/engine.ts:357-377`

**Norma** (ficha `normas/rfa-2026-2.9.yaml`, `verificado_fuente_primaria`: **sí**),
literal:

> «…considerarán cumplida la obligación establecida en el artículo 27, fracción III,
> segundo párrafo de la Ley del ISR, cuando los pagos por consumo de combustible se
> realicen con medios distintos a cheque nominativo […] **siempre que estos no excedan
> el 15 por ciento del total de los pagos efectuados por consumo de combustible** para
> realizar su actividad.»

**Código:**

```ts
const tope = 0.15 * total;
const cupoRestante = Math.max(0, tope - previoSinEste);
const dentro = Math.min(g.monto, cupoRestante);
const excedenteDeEste = Math.max(0, g.monto - dentro);
```

**Escenario con pesos.** Ejercicio con **$1,000,000** de combustible, de los cuales
**$200,000** en efectivo (20%).

- El motor imprime «el excedente de $50,000 NO se deduce», afirmando implícitamente que
  los **$150,000** restantes sí.
- La lectura literal del «siempre que» es una condición de procedencia, no un
  prorrateo: incumplido el 15%, la facilidad no se tiene por cumplida y los **$200,000**
  caen bajo LISR 27-III sin excepción. Diferencia entre las dos lecturas: **$150,000**
  de deducción.

**Consecuencia.** El motor elige la lectura favorable al cliente —defendible y la más
usada en la práctica— pero no la declara como lectura, cuando el mismo archivo declara
todas las demás. Refutación honesta: la ficha, en `condiciones_de_aplicacion`, tampoco
resuelve la ambigüedad, así que no es un error demostrable; es una interpretación
callada en un producto cuya regla es decir cuál usó (`BASE_ESTIMULO_PEAJE` hace
justamente eso para el peaje).

---

### [BAJO] La cuota semanal del diésel: sin consumidor, sin contrato con la rutina que la escribe, y con el campo que invita a la multiplicación equivocada

`normas/datos/cuota-ieps-diesel.yaml` · `.claude/skills/cuota-diesel/SKILL.md`

**Qué pedí verificar y qué encontré.** Pregunta del encargo: qué pasa si una
liquidación cae **fuera** del rango de vigencia cubierto. Respuesta medida:
**nada, porque nada lee el archivo.** `grep -rn "cuota-ieps-diesel\|cuota_disminuida\|
estimulo_por_litro\|cuotaSemanal" src/` → 0 resultados en `src/`. Lo confirma el propio
archivo («el motor todavía NO consume este archivo») y el latido
(`normas/.latido-cuota-diesel`: «El motor AUN no consume el archivo»). El comportamiento
hoy es el honesto: `engine.ts:978` deja `iepsAcreditable = 0` y el papel entrega litros.
No hay cifra equivocada que reportar — pero tampoco existe el fail-closed que la skill
promete («Sin cuota vigente para la fecha, el motor NO calcula»), porque no hay nada que
pueda negarse a correr.

Tres cosas quedan cargadas para el día que se cablee, y las tres son verificables hoy:

1. **Cobertura.** Cuatro semanas, de `2026-07-25` a `2026-08-21`. Hoy es 20-ago: el
   archivo se queda sin rango **mañana**, y el latido ya dice que la rutina de la nube
   no tiene egress para renovarlo.
2. **Contrato roto con quien lo escribe.** La skill instruye escribir
   `normas/cuota-ieps-diesel.yaml` con las llaves `cuota`, `vigencia_desde`,
   `vigencia_hasta`, `cod_nota`, `fecha_publicacion`, `url`. El archivo real vive en
   `normas/datos/` y usa `semanas[].vigencia` (un string `«A a B»`),
   `cuota_disminuida_por_litro` y `fuente.codNota`. Ni la ruta ni el esquema coinciden,
   así que la verificación de empalme que la skill exige («el `vigencia_desde` de la
   nueva es el día siguiente del `vigencia_hasta` de la anterior») no puede correr sobre
   este archivo.
3. **El campo que invita al error.** Cada semana trae `estimulo_por_litro` (5.0874 la
   del 15-21-ago) **y** `cuota_disminuida_por_litro` (2.2760). El estímulo del
   transportista es la **cuota disminuida** × litros —así lo dice el latido y así lo
   pide el criterio 1/LIF/PI—; `estimulo_por_litro` es la reducción que la SHCP aplica a
   la cuota, no el acreditamiento de la flota. Sobre **500 litros**: la cifra correcta
   es **$1,138.00** y la del campo mal llamado es **$2,543.70**, un **2.2×**. Es
   exactamente la clase de error que ya se pagó una vez con el IEPS trasladado, con el
   arma cargada y guardada esperando a que alguien la conecte.

---

## Fichas abiertas y su estado

24 fichas en `normas/*.yaml` + 1 archivo de datos. Abiertas y leídas todas en esta
ronda; las de datos personales (`lfpdppp-*`) y `lft-*` se listan por completitud pero
su auditoría pertenece al rubro legal.

| Ficha | `verificado_fuente_primaria` | Código que la implementa | ¿Cuadra? |
|---|---|---|---|
| `lif-2026-20-A.yaml` | **sí** | `engine.ts:978` (IEPS = 0), `:1008` (peaje), `:1013-1060` (litros); `acreditable.ts` | **Parcial** — el IEPS quedó bien; el peaje tiene los 2 ALTO de arriba. H5 (Red Nacional) y H6 (<$300M, partes relacionadas) siguen abiertos pero **declarados en el papel** |
| `rmf-2026-9.1.8.yaml` | **sí** | `engine.ts:1008` (fr. IV), `intake/desglose_peaje.ts` (fr. II), `dashboard/agentes/peajes/vista.tsx` | **No** — fr. III no se gatea y la regla no llega ni al PDF ni a `por_diferencia.ts` |
| `liva-5.yaml` | **sí** | `engine.ts:1004-1006`, `tope_alimentacion.ts`, `fiscal.ts:597-616` | **Sí** — la proporción de la fr. I es un solo módulo compartido por motor y panel |
| `lisr-28-V.yaml` | **sí** | `tope_alimentacion.ts`, `engine.ts:793-948` | **Sí** — $750/día, por beneficiario, proporción solo entre timbrados; H1 y H2 implementados como aviso; H3 (faja de 50 km) declarado no implementado |
| `rfa-2026-2.9.yaml` | **sí** | `engine.ts:304-390`, `repo.ts getAcumuladoCombustible`, `fiscal.ts:690` | **Sí** en la matriz (incluye fail-closed sin base medida y por ejercicio distinto); BAJO sobre la lectura del «siempre que» |
| `rlisr-57.yaml` | **sí** | `engine.ts:499-518`, `desde_db.ts:52`, `repo.ts:994` | **No en la práctica** — rama buena inalcanzable, sin escritor conectado |
| `cff-69-B.yaml` | **sí** | `intake/sat.ts:80-84`, `engine.ts:519-528`, `fiscal.ts ivaSostenible` | **Sí** — presunto ≠ definitivo respetado: nunca se afirma `efos: true` desde el código del SAT |
| `cff-89-90.yaml` | **sí** | `cuadre/leyendas.ts` | **Sí** — la eximente literal del último párrafo del 89 («por escrito») está en las dos leyendas y en el pie del PDF |
| `cff-30.yaml` | **sí** | `repo.ts saveCfdiXmlRaw`, mig. `0104` | **Sí** — la purga operativa excluye lo fiscal a propósito |
| `rmf-2026-2.7.7.yaml` | **sí** | `carta_porte.ts`, mig. `0099`, `dashboard/carta-porte` | No auditado a fondo esta ronda (ver abajo) |
| `rfa-2026-2.2.yaml` | **sí** | ninguno (`usado_en_codigo: []`) | **Sí por omisión** — nada en el producto promete el 8%, que es lo correcto: la regla excluye combustible |
| `lisr-27-III.yaml` | **no** (`evidencia_corroborante`) | `engine.ts:391-393`, `fiscal.ts:564`, `TITULOS` | Umbral (`> $2,000`) y 2º párrafo de combustible correctos. **Anotar**: es la ficha que sostiene el veredicto NO DEDUCIBLE más frecuente del motor y su texto no se ha leído en diputados |
| `lisr-28-XX.yaml` | **no** | ninguno | **No implementada** — MEDIO de arriba; *no verificable en fuente primaria en esta ronda* |
| `cff-29-A.yaml` | **no** (`texto_vigente: null`) | `intake/cfdi.ts`, `engine.ts:420`, `por_diferencia.ts` | *No verificable en esta ronda.* Además sus dos `reformas_relevantes` están fechadas `2026-11-07` — tres meses en el **futuro** respecto de hoy (20-ago-2026); casi seguro son las del 07-nov-**2025**. No decide dinero |
| `rmf-2026-2.7.1.48.yaml` | **no** | `engine.ts:535-600`, `indice.ts` (`exigibleDesde: null`) | **Sí** — con la exigibilidad sin confirmar el motor avisa y no declara no deducible; la fecha de `config.ts` quedó reducida a filtro de ruido |
| `rmf-2026-2.7.1.21.yaml` | **no** (`texto_vigente: null`) | `por_diferencia.ts:60` | *No verificable en esta ronda.* Solo se usa como fundamento citable, no calcula |
| `criterio-1-LIF-PI.yaml` | **no** (`texto_vigente: null`) | `engine.ts:978`, `acreditable.ts NOTA_LITROS_DIESEL` | **Sí en la mitad defensiva** (0 pesos, litros + cuota fechada por el contador). *Texto no transcrito* |
| `criterio-1-CFF-PI.yaml` | **no** | `cuadre/leyendas.ts` | *No verificable en esta ronda* |
| `politica-portales-plazos.yaml` | `sin_verificar` (a propósito, jerarquía 6) | `engine.ts:691-790`, `facturacion/comercios.ts`, `caducidad.ts` | **Sí** — las dos ramas (vencida y vigente) dicen que el plazo legal es todo el ejercicio; `plazoVerificado: false` es el default |
| `lfpdppp-15-16` · `-2-XII-XX` · `-26-II` · `-59` | **sí** ×4 | `privacidad.ts`, `engine.ts:203-209` (oposición) | Rubro legal; el gancho fiscal (`oposicion_titular` no toca ninguna cifra) es correcto |
| `lft-110-111-263.yaml` | **sí** | `liquidacion/resumen laboral` | Rubro legal; no auditado aquí |
| `normas/datos/cuota-ieps-diesel.yaml` | (sin campo; 4 semanas cotejadas contra DOF con codNota) | **ninguno** | Ver BAJO de arriba |

---

## Lo que revisé y está bien

**Los dos hallazgos abiertos que traía de la auditoría 2:**

- **`iepsAcreditable` con el IEPS trasladado del CFDI — CERRADO, y bien cerrado.**
  `engine.ts:978` lo fija en `0` y lo deja `const` con el motivo escrito. El dato que
  sale es `litrosDieselAcreditables`, y lo dicen igual el PDF (`acreditable.ts:94-101`),
  el detalle del panel (`dashboard/[id]/page.tsx:264`), el inicio del contador
  (`inicio-contador.tsx:300`), el chat (`chat.tsx:129`), la tool del agente
  (`chat-tools.ts:63`) y el prompt (`prompts.ts:24`). Ningún camino imprime pesos de
  IEPS. `fiscal.ts:533` conserva `iepsDieselDocumentado` (IEPS trasladado) pero
  **ninguna vista lo consume** — verificado con grep: es un campo muerto, no una cifra
  publicada. Esto es lo que más pesa en la subida de nota.
- **El 50% de casetas sin gatear la 9.1.8 — SIGUE VIVO**, ver los dos ALTO. Se mitigó el
  color y las cuatro condiciones de la LIF; no se cerró el gate ni llegó la regla al PDF.

**Otras cosas que crucé contra la ficha y cuadran:**

- **La recolocación LIF art. 16 → art. 20 apartado A** (commit `2e02a43`) quedó
  **consistente**: no queda una sola cita al art. 16 en `src/` para el estímulo (las que
  hay son del art. 16 de la LFPDPPP, otro cuerpo legal). La ficha, `indice.ts:199-207`,
  `corpus.ts:179-193`, `types/likida.ts:131-138`, el PDF, el panel, el chat y el prompt
  dicen todos «art. 20, ap. A» o «20-A». `normas_sincronizadas.test.ts` pasa (12/12).
- **LIVA 5-I sobre erogaciones parcialmente deducibles**: el IVA de un viático que excede
  el tope se acredita en la misma proporción, y el criterio vive en un módulo único
  (`tope_alimentacion.ts`) importado por el motor y por el panel — la bifurcación que
  daba 83.3% contra 100% sobre el mismo viático de $900 está cerrada por construcción.
- **El tercer estado ante la duda**, aplicado de forma consistente: EFOS no concluyente,
  RFC de la flota inservible o genérico, receptor ilegible, CFDI pendiente ante el SAT y
  complemento de hidrocarburos sin fecha de exigibilidad **nunca** caen en «deducible».
  El genérico `XAXX010101000` ya entra por `rfcEmpresaInservible` (`engine.ts:263-266`):
  la puerta del CFDI de $11,600 timbrado a un tercero está cerrada.
- **La retención del 4% de IVA por autotransporte** (`fiscal.ts:744`): `calculable: false`
  con los dos campos que faltan nombrados con precisión y la frase «derivarlo como 4% del
  subtotal sería inventar la cifra». Es el mejor ejemplo del rubro en todo el repo.
- **La facturación** (`facturacion_escritura.ts:111-114`): subtotal e IVA se **teclean**,
  el total se suma; no hay una tasa asumida en ningún lado.
- **El tope de efectivo**: `> $2,000` (estricto, como dice «exceda de $2,000.00») y el
  gasto **entero** cae en no deducible, no solo el excedente. Correcto.
- **El plazo de facturación como nivel 6**: las dos ramas del aviso dicen que el plazo
  legal es todo el ejercicio, y `plazo_vencido` bajó de «pérdida» a «en riesgo» en el
  panel. Ningún plazo de portal se presenta como obligación fiscal.
- **El formato de cifras** sigue viviendo solo en `lib/formato.ts`; ninguna cifra fiscal
  se formatea a mano en los archivos que audité.

---

## Lo que NO alcancé a revisar

- **`carta_porte.ts` (453 líneas) contra `rmf-2026-2.7.7.yaml`**: el árbol
  2.7.7.2.1/2.7.7.2.8, el radio de 30 km, el umbral C2 de la NOM-012-SCT-2-2017 y los
  19/18 campos del Apéndice 3. Es la ficha `verificado_fuente_primaria` con más
  superficie de código sin cruzar, y su `advertencia` es la más dura del repo (presunción
  de contrabando, CFF 103-XXII). Debería ser el primer rubro de la próxima ronda.
- **`intake/desglose_peaje.ts` y `/api/export/bitacora-peaje`** contra la fr. II de la
  9.1.8: si la bitácora que se exporta de verdad concilia viaje ↔ estado de cuenta como
  la fracción exige, o si solo lo dice.
- **`facturacion/permiso_cre.ts` + `permisos_cre.json`** contra el padrón real de la CNE:
  el motor solo avisa que no valida, lo cual es correcto, pero no verifiqué si ese JSON
  se usa para afirmar algo en alguna pantalla.
- **`normas/fundamento.ts` (546 líneas) y su guardia**: comprobé el mapa
  `por_diferencia.ts` pero no la mecánica de borrado de citas, que es lo que decide si
  el agente puede o no nombrar una norma en una frase.
- **Los importes de `lft-110-111-263`** (descuentos al salario del operador) contra
  `resumenLaboral`: es frontera con el rubro legal y lo dejé de ese lado.
