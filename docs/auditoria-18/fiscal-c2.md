# Cumplimiento fiscal — auditoría 18 · continuación 21-ago

**Nota: 4/10** (antes 7). Razón del movimiento: **mirada más profunda**. El código de
esta línea no cambió — `REGIMENES_ELEGIBLES` es anterior al delta — y la ronda 18
calificó `rfa-2026-2.9` como «**Sí** en la matriz» sin cruzar los **códigos de régimen**
contra el texto que la propia ficha transcribe («Título II, **Capítulo VII**»). No es que
empeorara: es que se vio mejor. Lo que aparece es la condición exacta del ancla del
rubro —«3 o menos si el producto imprime una cifra fiscal equivocada»— y hay un camino
completo, del alta al PDF, donde la imprime. No baja a 3 porque el crítico histórico del
IEPS sigue cerrado (`engine.ts:991` fija `iepsAcreditable = 0`), el fail-closed de la
matriz del 15% es real y verificado hoy, y la infraestructura de trazabilidad (24 fichas,
índice, corpus, `por_diferencia`) es de las mejores del repo.

Riesgo mayor hoy: **una S.A. de C.V. de carga que no sea coordinado se da de alta con
régimen 601, el producto le concede la facilidad del 15% de la RFA 2026 regla 2.9 —que
esa regla reserva al Título II Capítulo VII— y el papel imprime como deducible diésel
pagado en efectivo que la LISR 27-III niega.**

---

## Hallazgos

### [CRÍTICO] La facilidad del 15% de diésel en efectivo se concede al régimen 601, que no es el que la RFA 2.9 admite — y el panel lo imprime como si fuera la norma

`src/lib/likida/administracion.ts:158-159` · `src/app/admin/flotas/page.tsx:442`
· ficha `normas/rfa-2026-2.9.yaml` (`verificado_fuente_primaria`: **sí**, SIDOF 5780249)

**Texto de la norma**, literal de `texto_vigente`:

> «Los contribuyentes personas físicas o morales, dedicados exclusivamente al
> autotransporte terrestre de carga federal, **que tributen conforme al Título II,
> Capítulo VII o Título IV, Capítulo II, Sección I de la Ley del ISR**, considerarán
> cumplida la obligación establecida en el artículo 27, fracción III, segundo párrafo de
> la Ley del ISR, cuando los pagos por consumo de combustible se realicen con medios
> distintos a cheque nominativo […]; o monederos electrónicos autorizados por el SAT,
> siempre que estos no excedan el 15 por ciento del total de los pagos efectuados por
> consumo de combustible para realizar su actividad.»

Y `condiciones_de_aplicacion`, de la misma ficha:

> «Tributar en **Título II Cap. VII (coordinados)** o Título IV Cap. II Secc. I (PF act.
> empresarial)»

**Código:**

```ts
// administracion.ts:154-159
// … los códigos 601 (General de Ley PM — coordinados) y 612 (PF con
// actividades empresariales) son los dos títulos que la regla admite.
const REGIMENES_ELEGIBLES = ['601', '612'];
const regimenElegible = f.regimenFiscal ? REGIMENES_ELEGIBLES.includes(f.regimenFiscal) : undefined;
```

El comentario equipara «601 (General de Ley PM)» con «coordinados», y son dos cosas
distintas del catálogo `c_RegimenFiscal` del SAT: **601 es Título II en general** (la
S.A. de C.V. ordinaria), y **Título II Capítulo VII —Coordinados, LISR arts. 72-73— es la
clave 624**. La mitad de personas físicas sí está bien: 612 es exactamente Título IV Cap.
II Secc. I.

De ahí el dato viaja sin más filtros: `administracion.ts:160-166` lo escribe en
`tenant.config.facilidadCombustibleEfectivo.regimenElegible`, `cuadre/desde_db.ts:62-64`
lo conjunta con la dedicación exclusiva en `facilidad15`, y `engine.ts:337` lo consume.

**Escenario.** «Transportes del Bajío **S.A. de C.V.**», régimen **601**, casilla
«¿Exclusivamente autotransporte de carga federal?» marcada. Ejercicio 2026 con
$1,000,000 de combustible, $100,000 previos en efectivo. Entra un CFDI de diésel de
**$8,700** con `formaPago: '01'` (efectivo), permiso CRE en el comprobante.

- `previoSinEste = $100,000`, `tope = $150,000`, `cupoRestante = $50,000`,
  `dentro = $8,700`, `excedenteDeEste = $0`.
- El motor imprime (`engine.ts:379-385`, diferencia `combustible_efectivo_dentro15`,
  `monto: 0`): «Diésel pagado en EFECTIVO — **deducible por la facilidad del 15% (RFA
  2026 regla 2.9)**: el ejercicio lleva $108,700.00 de $1,000,000.00 de combustible en
  efectivo (11% del total, tope 15%)», y los **$8,700** quedan íntegros en
  `totalDeducible`.
- La norma dice **$0.00**: 601 no es Título II Capítulo VII, la facilidad no se tiene por
  cumplida y aplica LISR 27-III segundo párrafo sin excepción. La rama correcta es la que
  el motor ya tiene escrita al lado —`efectivo_no_elegible`, `engine.ts:393`, `monto:
  g.monto`, en `NO_DEDUCIBLE_ISR`— y nunca se alcanza.

Llevado al tope del ejercicio: **$150,000** declarados deducibles que no lo son ≈
**$45,000** de ISR, más recargos y multa.

Y el mismo error sale impreso como afirmación normativa en la consola, `flotas/page.tsx:442`:

> «— la facilidad del 15% (RFA 2.9) **exige 601 o 612**; cualquier otro no califica y el
> efectivo en combustible no se deduce.»

**Intento de refutación.** Busqué el guardarraíl y no existe: `validarDatosFiscales`
(`saas/fiscal.ts:124-126`) solo comprueba pertenencia a `REGIMENES`, que incluye 601;
`repo.ts:1018` (`actualizarFacilidad15`, el select del panel) deja declarar
«Régimen: Sí» a mano sin mirar `tenant.regimen_fiscal`; y `administracion.test.ts:105-111`
fija 601 como el caso feliz. El fail-closed de `engine.ts:344-360` protege contra la
**base sin medir**, no contra el **régimen mal clasificado**.

**Consecuencia.** El contralor archiva un PDF que cita «RFA 2026 regla 2.9» al lado de una
cifra que esa regla no ampara. La cita del artículo es lo que lo empeora: la sugerencia
lleva el nombre de Likida, no el del cliente.

**Causa raíz probable:** se tradujo «Título II» a la clave 601 sin bajar al Capítulo VII,
que tiene su propia clave (624 Coordinados) en `c_RegimenFiscal`.

---

### [ALTO · REINCIDENTE] El 50% de peaje se sigue acreditando sobre casetas pagadas en efectivo

`src/lib/likida/cuadre/engine.ts:1021` (era `:1008` en la ronda 18; se corrió 13 líneas por
el arreglo de `cfdiOrden`) · ficha `normas/rmf-2026-9.1.8.yaml`
(`verificado_fuente_primaria`: **sí**)

**Texto de la norma**, fracción III:

> «Efectuar los pagos de autopistas mediante la tarjeta de identificación automática
> vehicular o de cualquier otro sistema electrónico de pago con que cuente la autopista y
> conservar los estados de cuenta» de dicha tarjeta o sistema.

`consecuencias_operativas` de la misma ficha: «La fr. III mata el efectivo: una caseta
pagada en ventanilla con billetes NO genera estímulo aunque después se facture.»

**Código, verificado hoy, byte por byte igual que ayer:**

```ts
// engine.ts:1021
if (g.concepto === 'caseta' && (g.subTotal ?? 0) > 0) peajeAcreditable += (g.subTotal as number) * peajeFactor;
```

Cero lecturas de `g.formaPago` en esa rama. La única puerta cercana, `efectivo_sobre_tope`
(`engine.ts:391-393` → hoy dentro del mismo bloque de la regla 5), exige `> $2,000` y una
caseta casi nunca llega.

**Escenario.** Caseta de **$928** (SubTotal $800 + IVA $128) pagada en ventanilla con
billetes (`formaPago: '01'`), CFDI timbrado y XML verificado → el motor imprime «Estímulo
de peaje 50% — **$400.00**»; la norma dice **$0.00**. Cuarenta casetas al mes en esa
condición: **~$16,000** mensuales de estímulo inexistente en el papel que se archiva.

**Estado:** sin cambio. `git diff 8d608a4..HEAD` no toca esa línea. Es decisión del dueño,
queda anotada tal cual.

---

### [ALTO · REINCIDENTE] El pie del PDF sigue invitando a subir la base del peaje «13.8%», contra la 9.1.8 fr. IV — y el porcentaje sigue mal (es 16%)

`src/lib/likida/liquidacion/acreditable.ts:47-49` (docstring erróneo en `:37-45`) ·
fichas `normas/rmf-2026-9.1.8.yaml` (`verificado_fuente_primaria`: **sí**) y
`normas/lif-2026-20-A.yaml` (**sí**)

**Texto de la norma**, 9.1.8 fr. IV:

> «Para la determinación del monto del acreditamiento, se aplicará al importe pagado por
> concepto del uso de la infraestructura carretera de cuota, **sin incluir el IVA**, el
> factor de 0.5 para toda la Red Nacional de Autopistas de Cuota.»

`lif-2026-20-A.yaml`, H4, verificado hoy en `normas/lif-2026-20-A.yaml:143-148`:

> «`estado:` **RESUELTO (14-ago-2026)** … La lectura conservadora del motor es la que la
> regla ordena — **no hay que cambiar el código**.»

**Código, verificado hoy, idéntico:**

```ts
// acreditable.ts:47-49
export const BASE_ESTIMULO_PEAJE =
  'Base usada: el subtotal SIN IVA de las casetas con CFDI verificado. La ley dice "50% del gasto total erogado"; ' +
  'si su contador toma el total con IVA, la cifra sube alrededor de 13.8%.';
```

Y `acreditable.ts:38-40` sigue diciendo «Es el hallazgo H4 de la ficha, `severidad: alta`,
`estado: SIN RESOLVER`» cuando la ficha dice RESUELTO desde el 14-ago.

**Escenario.** Casetas del periodo: SubTotal **$10,000**, IVA **$1,600**, erogado
**$11,600**. El motor imprime **$5,000.00** (correcto) y debajo, en el mismo papel, invita
al total con IVA → el contador acredita **$5,800.00**. La norma dice **$5,000.00** y cierra
la discusión con «sin incluir el IVA». Sobreacreditamiento invitado: **$800 por cada
$10,000** de casetas. Además, de $5,000 a $5,800 **se sube 16%**, no 13.8%; el 13.8% es la
relación inversa, bien escrita en la ficha e invertida en la constante.

**Estado:** sin cambio.

---

### [ALTO] La clave 624 (Coordinados) —el único régimen de persona moral que la RFA 2.9 admite— no existe en el catálogo del producto

`src/lib/saas/fiscal.ts:20-26` · ficha `normas/rfa-2026-2.9.yaml`
(`verificado_fuente_primaria`: **sí**)

**Texto de la norma:** el mismo del primer hallazgo — «que tributen conforme al **Título
II, Capítulo VII**», que la propia ficha glosa como «(coordinados)».

**Código:**

```ts
// saas/fiscal.ts:20-26 — el ÚNICO catálogo de régimen del producto
export const REGIMENES = [
  { clave: '601', nombre: 'General de Ley Personas Morales' },
  { clave: '603', nombre: 'Personas Morales con Fines no Lucrativos' },
  { clave: '612', nombre: 'Personas Físicas con Actividades Empresariales' },
  { clave: '621', nombre: 'Incorporación Fiscal' },
  { clave: '626', nombre: 'RESICO' },
] as const;
```

`grep -rn "'624'\|Coordinados" src/ normas/` → **cero resultados en todo el repo**. Esta
lista alimenta las dos únicas pantallas donde se captura el régimen —el alta
(`admin/flotas/page.tsx:437`) y `dashboard/suscripcion/page.tsx:355`— y `validarDatosFiscales`
rechaza con «Elige un régimen fiscal de la lista» cualquier clave fuera de ella
(`saas/fiscal.ts:124-126`). `fiscal.test.ts:96` lo fija: `expect(REGIMENES.map(r => r.clave))
.toEqual(['601','603','612','621','626'])`.

**Escenario.** «Autotransportes Unidos, coordinado» (LISR art. 72), RFC válido, régimen
real **624**, dedicación exclusiva a carga federal — el contribuyente para el que la RFA
2.9 fue escrita. Al darlo de alta:

1. No puede declarar 624. La leyenda de la pantalla (`flotas/page.tsx:442`) le dice que
   «la facilidad del 15% exige 601 o 612», así que teclea **601** → cae en el CRÍTICO de
   arriba, ahora con un régimen falso escrito en `tenant.regimen_fiscal`.
2. Si en cambio deja «Sin declarar», `regimenElegible = undefined` → `facilidad15`
   indefinida → el motor manda cada diésel en efectivo a `combustible_efectivo` («se
   revisa», `engine.ts:397-402`), que es honesto pero deja a la flota **elegible de
   verdad** sin poder usar nunca la facilidad; sobre $150,000 anuales en efectivo eso es
   **$45,000 de ISR** que sí podía deducir y no deduce.
3. Y ese `regimen_fiscal` es el que se teclea como `RegimenFiscalReceptor` en el portal:
   `flota_fiscal.ts:84` → `capufe.ts:851-852`
   (`select[name="receptor.regimenFiscalReceptor"]`) y `piloto_vision.ts:340`. Un
   coordinado emitiendo con 601 no coincide con lo que el SAT tiene para su RFC.

**Intento de refutación.** `revisarReceptor` (`capufe.ts:1245`) solo valida la **forma**
—`^\d{3}$`, «tres dígitos»—, no el valor. No hay segunda red.

**Causa raíz probable:** el catálogo se acotó a «lo que aplica aquí» pensando en el
receptor de la mensualidad de Likida, y después se reusó como la lista que decide una
facilidad de la RFA, sin volver a preguntarse qué claves nombra esa regla.

---

### [MEDIO] El uso de CFDI capturado para la mensualidad de Likida es el que se teclea en el portal de la caseta

`src/lib/likida/facturacion/flota_fiscal.ts:85` → `adaptadores/capufe.ts:853-854`
y `adaptadores/piloto_vision.ts:341` · ficha `normas/cff-29-A.yaml`
(`verificado_fuente_primaria`: **NO** — `texto_vigente: null`, `evidencia_corroborante`;
el requisito del `UsoCFDI` se anota **no verificable en fuente primaria en esta ronda** y
el hallazgo se sostiene en la contradicción interna del producto, que sí es verificable)

**Lo que el producto le dice a la flota** cuando captura el dato
(`dashboard/suscripcion/page.tsx:333-336` y `:358`):

> «Datos para tu factura … **Con estos se emite el CFDI de cada mensualidad.**»
> Ayuda del selector: «**G03 es como se deduce una suscripción de software.**»

**Lo que el producto hace con el dato:**

```ts
// flota_fiscal.ts:79-87 — el receptor con el que se llena CUALQUIER portal
const flota: FlotaFiscal = { …, usoCfdi: datos.usoCfdi ?? '', … };
// capufe.ts:853 — y se teclea en el portal, en modo `emitir`
await this.elegirEnDesplegable(pagina, this.sel.usoCfdi, this.sel.buscadorUso, r.usoCfdi.trim(), 'Uso del CFDI');
```

**Escenario.** El dueño lee «suscripción de software» y elige del catálogo de tres opciones
(`saas/fiscal.ts:29-33`) **`I04 — Equipo de cómputo y accesorios`**. Semanas después el
cron factura un lote de **8 casetas por $2,000** (SubTotal $1,724.14 + IVA $275.86) y
CAPUFE emite un CFDI de $2,000 con **`UsoCFDI = I04`**: un peaje declarado como adquisición
de equipo de cómputo. El mismo valor se le dicta al modelo del piloto de visión
(`piloto_vision.ts:341`: «· Uso CFDI: I04») para cualquiera de los ~37 portales del
catálogo.

**Intento de refutación.** El único validador en el camino, `revisarReceptor`
(`capufe.ts:1246`), comprueba la **forma** `^[A-Z]{1,2}\d{2}$` y nada más; `I04` la pasa.
Con `G03` —el default— no hay daño, y por eso esto es MEDIO y no ALTO: el error necesita
que el dueño elija una de las otras dos opciones que el producto le ofrece.

**Consecuencia.** Un CFDI es irreversible ante el SAT; el contralor tiene que cancelarlo y
volver a pedirlo, y CAPUFE no re-timbra fuera de su ventana. Además rompe la regla del
repo: el rótulo «con estos se emite el CFDI de cada mensualidad» deja de ser verdad en
cuanto `flota_fiscal.ts` los usa para emitir CFDI de terceros.

**Causa raíz probable:** cuatro de los cinco datos del receptor son los mismos en los dos
contextos (RFC, razón social, CP, régimen) y el quinto —el uso— depende de qué se compra;
se reusó el bloque completo sin separar ese campo.

---

### [MEDIO] El aviso de WhatsApp —que desde el 20-ago sí se envía— presenta el plazo del comercio como vencimiento, sin el matiz que la ficha exige literalmente

`src/lib/likida/facturacion/enrutar.ts:161-165` · `src/lib/likida/facturacion/avisar.ts:88-90,157`
· ficha `normas/politica-portales-plazos.yaml` (jerarquía 6, `estado_verificacion:
sin_verificar` **a propósito** — no es norma; lo que se cita es su directiva de uso, que sí
es verificable contra el código)

**Texto de la ficha**, `advertencia_de_jerarquia` y `uso_permitido_hoy`:

> «ESTO NO ES UNA NORMA FISCAL. […] El plazo LEGAL para pedir factura es todo el ejercicio
> (el SAT lo dice expresamente) […] El producto NUNCA debe presentar estos plazos como una
> obligación fiscal.»
>
> «El aviso tiene que llevar el matiz del `advertencia_de_jerarquia` **en la misma frase**
> — un contralor que lee "puedes timbrarlo hasta el 31-ago" a secas concluye que el 1-sep
> perdió el CFDI, y no es cierto.»

**Código:**

```ts
// enrutar.ts:161-165 — mensajeParaEncargado
const urgencia = c.desconocido ? 'sin fecha legible'
  : c.urgente ? (c.diasRestantes === 0 ? '⚠️ VENCE HOY' : `⚠️ vence en ${c.diasRestantes} día(s)`)
  : `${c.diasRestantes} días para facturar`;
lineas.push(`Falta la factura de un ${t.concepto} — ${urgencia}`);
```

Ni `mensajeParaEncargado` ni `armarAviso` (`avisar.ts:88-90`: «Tienes N comprobante(s) sin
factura, y M vence(n) en 2 días o menos») leen `t.plazoVerificado`, que `pendientes.ts:206`
sí calcula y pone en el ticket, ni añaden una sola palabra sobre el plazo legal. El motor
sí lo hace en `factura_por_vencer`; este canal no.

**Lo que cambió en el delta y por qué entra hoy.** Hasta `d432e89` este texto **se tiraba**:
`avisarPorFacturar` solo mandaba la plantilla con el conteo. Ahora `avisar.ts:157`
(`const wamidTexto = await sendText(args.telefono, texto)`) lo envía. Es deuda que cobró
factura: una frase latente pasó a ser la que el encargado lee en el teléfono.

**Escenario.** Diésel del 3-ago por **$11,600** (SubTotal $10,000 + IVA $1,600) en un
comercio con `plazo: 'mes_natural'` y `plazoVerificado: false` (el default, sacado del
blog de un competidor según la propia ficha). El 29-ago le llega al encargado «Falta la
factura de un diesel — ⚠️ vence en 2 día(s)». El 1-sep da el gasto por perdido: **$10,000**
que deja de deducir y **$1,600** de IVA que deja de acreditar, cuando el plazo legal cubre
todo el ejercicio y la negativa del portal es práctica indebida con remedio en Conciliación
de Factura.

**Consecuencia.** El producto empuja al cliente a renunciar a una deducción que sí tiene, en
el único canal donde el encargado de verdad lee, y por una política de un tercero con cero
fuerza legal.

**Causa raíz probable:** el matiz se escribió donde vive el motor (`factura_por_vencer`) y
no bajó al mensaje de WhatsApp, que nació como recordatorio operativo y no como documento.

---

## Estado de los hallazgos abiertos de la ronda 18

| Hallazgo de la ronda 18 | Estado hoy | Verificación |
|---|---|---|
| **ALTO** · 50% de peaje sobre efectivo | **VIVO, idéntico** | `engine.ts:1021` (era `:1008`; se corrió por `cfdiOrden`). Sin `formaPago` en la rama. Decisión del dueño |
| **ALTO** · Pie del PDF «sube ~13.8%» (correcto: 16%) contra 9.1.8 fr. IV | **VIVO, idéntico** | `acreditable.ts:47-49` byte por byte; docstring `:38-40` sigue diciendo `SIN RESOLVER`; la ficha dice RESUELTO en `lif-2026-20-A.yaml:143-148`. Decisión del dueño |
| **MEDIO** · Litros de diésel elegibles con `formaPago !== '01'` (entra `'99'`) | **VIVO** | `engine.ts:1048`: `const pagoElectronico = !!g.formaPago && g.formaPago !== '01';` |
| **MEDIO** · RLISR 57: `actualizarRfcOperador` sin llamador | **VIVO** | `grep -rn "actualizarRfcOperador" src/` fuera de `repo.ts` → 0 |
| **MEDIO** · Consumo en bar 100% deducible | **VIVO** | `tope_alimentacion.ts` sin concepto `bar`; ficha `lisr-28-XX` sigue `NO_IMPLEMENTADO` |
| **BAJO** · El 15% de la RFA 2.9 se prorratea sin declarar que es una lectura | **VIVO** | `engine.ts:369-374` |
| **BAJO** · Cuota semanal del diésel sin consumidor | **VIVO, y hoy vence la cobertura** | `grep -rn "cuota-ieps-diesel\|cuota_disminuida" src/` → 0. La última semana del archivo es `2026-08-15 a 2026-08-21`: **hoy es el último día cubierto**. Como nada lo lee, sigue sin producir una cifra equivocada |

Ninguno se atacó en el delta. Ninguno empeoró.

## Fichas que NO son verificables en esta ronda

Sin `verificado_fuente_primaria`, no se asume ni bien ni mal:

- `cff-29-A.yaml` — `texto_vigente: null`, `evidencia_corroborante`. Es la que tendría que
  sostener el requisito del `UsoCFDI` del hallazgo MEDIO; por eso ese hallazgo se apoya en
  la contradicción interna del producto y no en la norma. Sus dos `reformas_relevantes`
  siguen fechadas `2026-11-07`, tres meses en el futuro (casi seguro 07-nov-**2025**).
- `lisr-27-III.yaml` — `evidencia_corroborante`. Es la que sostiene el veredicto «no
  deducible» más frecuente del motor y la excepción del CRÍTICO de arriba; su texto sigue
  sin leerse en diputados.gob.mx. **Es la ficha que más urge cerrar de todo el rubro.**
- `lisr-28-XX.yaml` (bares), `rmf-2026-2.7.1.21.yaml`, `rmf-2026-2.7.1.48.yaml`,
  `criterio-1-LIF-PI.yaml`, `criterio-1-CFF-PI.yaml` — sin cambio desde ayer.
- `politica-portales-plazos.yaml` — `sin_verificar` **a propósito** (jerarquía 6). No es
  norma; lo citado en el MEDIO es su directiva de uso, no un texto legal.

## Lo que revisé y está bien

- **El dedup por `(uuid, orden)`** (`engine.ts:160-178`, nuevo en el delta) es un arreglo
  fiscal real y está **cableado de punta a punta**: `repo.ts:681` lee `cfdi_orden`,
  `al_vuelo.ts:536` e `intake/consolidado.ts:176` lo escriben, y el default `1` conserva la
  regla vieja. Antes, las 8 casetas de una factura consolidada de CAPUFE entraban como una
  y las otras 7 salían del comprobado como «duplicado»: el operador cobraba $250 de $2,000
  y el papel lo acusaba de duplicar. Es el hallazgo que más dinero devuelve del delta.
- **`validarDatosFiscales` extraído** (`saas/fiscal.ts:102-138`) hace exactamente lo que su
  docstring promete: un solo validador para el alta y para la pantalla del cliente, y valida
  **antes** del insert, así que un CP de cuatro dígitos ya no deja una flota creada a medio
  configurar. La preocupación de «dos copias de un validador fiscal se separan» está bien
  resuelta; lo que falla es el **contenido del catálogo**, no la arquitectura.
- **El «o van los cinco, o va solo el RFC»** de `administracion.ts:138-149`: no hay estado
  intermedio en que `tenant` quede con tres de los cinco y `getFiscalDeFlota` se niegue en
  silencio semanas después. El alta ahora dice en la misma pantalla si la flota puede
  facturar (`flotas/page.tsx:69-74`).
- **`iepsAcreditable = 0`** sigue `const` con el motivo escrito (`engine.ts:987-991`) y el
  estímulo se entrega en litros. El crítico histórico continúa cerrado.
- **El piloto de visión no emite**, y la guarda es doble e independiente
  (`piloto_vision.ts:254`: el juicio del modelo `esBotonQueEmite` **o** el veto por texto
  `HUELE_A_EMITIR`), más el rechazo de selectores fuera del inventario (`:246`) y el
  loop-guard (`:170`). Para el rubro fiscal esto es lo correcto: ningún CFDI irreversible
  sale de un modelo de visión sobre un portal sin mapear.
- **Regla 5 del prompt del piloto** (`piloto_vision.ts:333`): «Un dato que no tengas NO se
  inventa: tipo=no_puedo y el motivo dice qué falta». Es la regla del producto escrita
  dentro del prompt, no solo en el código que lo rodea.
- **La matriz de la RFA 2.9 en sí** (`engine.ts:337-400`) sigue correcta en todo lo que no
  sea la clasificación del régimen: fail-closed sin base medida, fail-closed por ejercicio
  distinto, el excedente por comprobante y no acumulativo, y `SIN_ACREDITAMIENTO` incluye
  las cuatro ramas — la facilidad salva la deducción de ISR y **no** el IEPS, como dice el
  `limite_importante` de la ficha.
- **El fail-closed de `cuentas.ts:33-55`**: cofre no configurado o base caída → «no hay
  cuentas compartidas» → el ticket va con la persona. No afirma una cuenta que no puede
  descifrar.
- **`enrutar` con `sabeOperarlo` obligatorio** cierra un silencio real: antes 25 comercios
  se enrutaban a un robot inexistente y el aviso no los llevaba. No es fiscal, pero el
  gasto que nadie facturaba sí acababa en un CFDI que no existe.
- **El formato de cifras** sigue viviendo solo en `lib/formato.ts` en todo lo que audité.

## Lo que NO alcancé a revisar

- **`carta_porte.ts` (453 líneas) contra `rmf-2026-2.7.7.yaml`** — sigue siendo la ficha
  `verificado_fuente_primaria` con más superficie de código sin cruzar, y su `advertencia`
  es la más dura del repo (presunción de contrabando, CFF 103-XXII). Segunda ronda seguida
  que se queda fuera.
- **`intake/desglose_peaje.ts` y `/api/export/bitacora-peaje`** contra la fr. II de la
  9.1.8 (si la bitácora concilia de verdad viaje ↔ estado de cuenta).
- **`conectores/portales_facturacion.ts`** (121 líneas nuevas del delta) por el lado
  fiscal: solo verifiqué que `cuentas.ts` falle cerrado, no si una credencial compartida
  puede acabar emitiendo un CFDI a nombre de la flota equivocada.
- **`comercios.ts` completo** (767 líneas, ~37 fichas): revisé el cambio del delta —el
  pre-vuelo de megasur— y las cuatro entradas con `plazoVerificado: true`, no las demás.
- **`facturacion/permiso_cre.ts` + `permisos_cre.json`** contra el padrón de la CNE, que
  es la condición de la RFA 2.9 que la ficha declara `pendiente_en_producto`.
