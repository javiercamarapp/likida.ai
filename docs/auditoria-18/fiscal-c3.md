# Cumplimiento fiscal — auditoría 18 · continuación 3

**Nota: 4/10** (antes 4). Razón del movimiento: **ninguna neta — dos fuerzas del mismo
tamaño se cancelaron**, y las dos hay que decirlas con sus palabras:

- *Se atacó y subió*: el PR #38 cerró de verdad **6 de los 7 abiertos** que traía este
  rubro, incluido el CRÍTICO del régimen, el ALTO del peaje en efectivo y el ALTO del
  «13.8%». Lo verifiqué archivo por archivo y corriendo el motor real, no leyendo asuntos
  de commit. Es la mejor ronda de arreglo fiscal que ha tenido el repo.
- *Mirada más profunda*: y aparecieron **tres críticos nuevos** del mismo peso. Ninguno
  es regresión del delta: dos llevaban ahí desde siempre y esta es la primera ronda que
  mira la **forma de pago que no es `'01'`**; el tercero es el mismo CRÍTICO que el PR
  cerró en el formulario de alta, vivo en el `.sql` con el que se levanta el demo.

El ancla del rubro sigue mandando: «3 o menos si el producto imprime una cifra fiscal
equivocada». La imprime — con valores que reproduje. No baja a 3 porque el crítico
histórico del IEPS sigue cerrado (`engine.ts:1082`, `iepsAcreditable = 0` const con el
motivo escrito), la matriz fail-closed de la RFA 2.9 es real, la ficha de la RMF 9.1.8
**no** se acomodó al código cuando `480ca83` la tocó (sólo creció `usado_en_codigo`; el
`texto_vigente` es byte por byte el mismo), y la trazabilidad —25 fichas, índice,
`por_diferencia`, `guardiaFundamento`— sigue siendo lo mejor construido del repo.

**El riesgo mayor hoy:** el motor sólo sabe juzgar el efectivo (`'01'`). Un CFDI de
diésel con forma de pago **'06' dinero electrónico, '08' vales, '12' dación en pago o
'17' compensación** —ninguna de ellas admitida por la LISR 27-III— sale **«Deducible para
ISR» en verde, con su IVA acreditado**, y ni siquiera consume el contador del 15% de la
RFA 2.9.

---

## Verificación de los abiertos de la pasada anterior

| Abierto de `fiscal-c2.md` | Estado | Prueba |
|---|---|---|
| **CRÍTICO** · el 15% de la RFA 2.9 concedido al 601 | **CERRADO en el alta · REABIERTO en el demo** | ver abajo |
| **ALTO** · 50% de peaje sobre casetas en efectivo | **CERRADO** | ver abajo |
| **ALTO** · pie del PDF «13.8%» contra la 9.1.8 fr. IV | **CERRADO** | ver abajo |
| **ALTO** · la clave 624 (Coordinados) no existe | **REINCIDENTE** | hallazgo F |
| **MEDIO** · el `UsoCFDI` de la mensualidad se teclea en el portal de la caseta | **REINCIDENTE** | hallazgo I |
| **MEDIO** · el aviso de WhatsApp presenta el plazo del comercio como vencimiento | **REINCIDENTE** | hallazgo J |
| **MEDIO** · litros de diésel elegibles con `formaPago !== '01'` | **CERRADO** | ver abajo |
| **MEDIO** · RLISR 57: `actualizarRfcOperador` sin llamador | **REINCIDENTE** | hallazgo H |
| **MEDIO** · consumo en bar 100% deducible | **CERRADO** | ver abajo |
| **BAJO** · el 15% se prorratea sin declarar que es una lectura | **CERRADO** | ver abajo |
| **BAJO** · cuota semanal del diésel sin lector | **CERRADO a medias** | ver abajo |

### CERRADO · el 15% ya no se concede al 601 (en el formulario de alta)

`src/lib/likida/administracion.ts:166` · ficha `normas/rfa-2026-2.9.yaml`
(`verificado_fuente_primaria`: **sí**)

> «Los contribuyentes personas físicas o morales, dedicados exclusivamente al
> autotransporte terrestre de carga federal, que tributen conforme al **Título II,
> Capítulo VII** o Título IV, Capítulo II, Sección I de la Ley del ISR…»

```ts
// administracion.ts:166 — antes ['601', '612']
const REGIMENES_ELEGIBLES = ['624', '612'];
```

Y `admin/flotas/page.tsx:442-444` corrigió la leyenda: «la facilidad del 15% (RFA 2.9)
exige **624 Coordinados o 612** persona física; cualquier otro, **601 incluido**, no
califica». El comentario `:154-165` incluso deja escrito el pendiente que queda. Cerrado
por el camino del alta. **Por el camino del demo, no** — hallazgo C.

### CERRADO · el peaje ya no acredita sobre casetas en efectivo

`src/lib/likida/cuadre/engine.ts:1123-1124` · ficha `normas/rmf-2026-9.1.8.yaml`
(`verificado_fuente_primaria`: **sí**)

> Fracción III: «Efectuar los pagos de autopistas mediante la tarjeta de identificación
> automática vehicular o de cualquier otro sistema electrónico de pago con que cuente la
> autopista y conservar los estados de cuenta».

```ts
const peajePagadoElectronicamente = !!g.formaPago && (MEDIOS_ELECTRONICOS_PEAJE as readonly string[]).includes(g.formaPago);
if (g.concepto === 'caseta' && (g.subTotal ?? 0) > 0 && peajePagadoElectronicamente) peajeAcreditable += (g.subTotal as number) * peajeFactor;
```

Corrí el motor real (`cuadrarViaje`, caseta SubTotal $10,000 + IVA $1,600):
`'01'` → `peajeAcreditable = 0`; `'03'` → `5000`. La lista es **cerrada**
(`engine.ts:133`, `['03','04','05','06','28','29']`), no «todo lo que no sea efectivo»,
así que ni el cheque ni la dación entran. Cerrado. Efecto colateral no cubierto:
hallazgo D.

### CERRADO · el pie del PDF ya no invita a subir la base con IVA

`src/lib/likida/liquidacion/acreditable.ts:54-57` · ficha `normas/rmf-2026-9.1.8.yaml`
fr. IV (`verificado_fuente_primaria`: **sí**)

> «se aplicará al importe pagado por concepto del uso de la infraestructura carretera de
> cuota, **sin incluir el IVA**, el factor de 0.5».

La constante ya no menciona el 13.8%: «Base usada: el importe SIN IVA … Así lo fija la RMF
2026 regla 9.1.8 fr. IV ("sin incluir el IVA"); la frase "50% del gasto total erogado" de
la LIF **no autoriza** tomar el total con IVA como base». Y el docstring `:36-53` ya dice
`RESUELTO` en vez de `SIN RESOLVER`. Cerrado.

### CERRADO · los litros de diésel exigen la lista cerrada

`src/lib/likida/cuadre/engine.ts:113,1153` — `MEDIOS_LISR_27_III = ['02','03','04','05','28','29']`.
El `'99'` y el `'06'` ya no producen litros acreditables. Cerrado.

### CERRADO · el consumo que parece bar ya no sale deducible

`src/lib/likida/cuadre/engine.ts:168-176` (`SENAL_BAR`/`pareceBar`), `:986-995`
(`consumo_bar`), `:184` (POR_CONFIRMAR) y `:1069` (SIN_ACREDITAMIENTO) ·
ficha `normas/lisr-28-XX.yaml` (`evidencia_corroborante` — **no verificable en fuente
primaria en esta ronda**, y por eso la lectura conservadora es la correcta).
El gasto cae a *por confirmar* y no acredita IVA. La ficha se actualizó a
`PARCIAL_CONSERVADOR` describiendo exactamente eso. Cerrado en su lectura conservadora.

### CERRADO · el prorrateo del 15% ya se declara

`src/lib/likida/cuadre/engine.ts:178-181` (`LECTURA_RFA_29_PRORRATEO`), consumido en la
nota de `efectivo_sobre_15` (`:462`). La ficha `rfa-2026-2.9.yaml` tiene ahora el bloque
`lectura_aplicada_por_el_motor` que dice que la ficha **no resuelve** entre las dos
lecturas. Cerrado.

### CERRADO A MEDIAS · la cuota semanal del diésel

`src/lib/likida/cuadre/cuota_diesel.ts` existe, devuelve `null` fuera de rango (nunca cae
al último valor), valida la aritmética y **falla** si aparece el nombre viejo
`estimulo_por_litro` (`:84`). `cuota_diesel.test.ts` lee el YAML real. Lo que sigue: nadie
lo consume (`grep` → 0 fuera del test), por decisión D2 declarada. **La última semana
cubierta es `2026-08-15 a 2026-08-21` y hoy es 22-ago: la tabla ya no cubre hoy.** Como
nada la lee, no produce una cifra equivocada; sigue BAJO.

---

## Hallazgos

### [CRÍTICO] El combustible pagado con un medio que la LISR 27-III no admite —y que no es efectivo— sale «Deducible para ISR» en verde, y no consume el 15% de la RFA 2.9

`src/lib/likida/cuadre/engine.ts:410` (y su gemelo del panel, `src/lib/likida/fiscal.ts:375`)
· fichas `normas/rfa-2026-2.9.yaml` (`verificado_fuente_primaria`: **sí**) y
`normas/lisr-27-III.yaml` (`evidencia_corroborante`: **no verificable en fuente primaria
en esta ronda**, y por eso el hallazgo se ancla en la RFA, que sí lo está)

> «…considerarán cumplida la obligación establecida en el artículo 27, fracción III,
> segundo párrafo de la Ley del ISR, cuando los pagos por consumo de combustible se
> realicen **con medios distintos a cheque nominativo de la cuenta del contribuyente;
> tarjeta de crédito, de débito o de servicios; o monederos electrónicos autorizados por
> el SAT, siempre que estos no excedan el 15 por ciento** del total de los pagos
> efectuados por consumo de combustible para realizar su actividad.»
> — `normas/rfa-2026-2.9.yaml`, `texto_vigente`

La regla define el cubo del 15% por **exclusión**: todo pago con un medio que no sea uno
de esos cuatro entra al 15%. El motor lo define por **inclusión de un solo valor**:

```ts
// engine.ts:410 — la ÚNICA puerta de la regla 5
if (g.formaPago === '01' && esCombustible) {
```

Nada más en el archivo mira la forma de pago del combustible para efectos de ISR
(`grep -n formaPago engine.ts` → `:410`, `:479` efectivo no-combustible, `:966`
alimentación, `:1116` IVA, `:1123` peaje, `:1153` litros de IEPS). `'06' Dinero
electrónico`, `'08' Vales de despensa`, `'12' Dación en pago`, `'17' Compensación`,
`'23' Novación` caen por el hueco.

**Escenario (flota NO elegible, régimen 601).** CFDI de diésel de **$11,600**
(SubTotal $10,000 + IVA $1,600), clave 15101505, XML verificado, `formaPago: '06'`.
Corrido contra `cuadrarViaje` real, con `facilidad15: false`:

| forma de pago | totalDeducible | totalNoDeducible | ivaAcreditable | diferencias |
|---|---|---|---|---|
| `'01'` | $0.00 | **$11,600.00** | $0.00 | `efectivo_no_elegible` |
| `'06'` | **$11,600.00** | $0.00 | **$1,600.00** | *(ninguna sobre el pago)* |
| `'08'` | **$11,600.00** | $0.00 | **$1,600.00** | *(ninguna)* |
| `'12'` | **$11,600.00** | $0.00 | **$1,600.00** | *(ninguna)* |
| `'17'` | **$11,600.00** | $0.00 | **$1,600.00** | *(ninguna)* |

Sale **$11,600.00 deducible**; debería salir **$0.00**, exactamente como el `'01'`, porque
la flota no es elegible y el medio no está en la lista que la regla admite. Y el IVA
acompaña: $1,600 acreditados donde LIVA 5-I ata el acreditamiento a que la erogación sea
deducible para ISR.

**Escenario (flota SÍ elegible, 612).** Ejercicio con $1,000,000 de combustible, tope
$150,000, previo en efectivo $140,000. Entra un diésel de **$50,000**:

| forma de pago | totalDeducible | totalNoDeducible | diferencia emitida |
|---|---|---|---|
| `'01'` | $10,000.00 | $40,000.00 | `efectivo_sobre_15: 40000` |
| `'06'` | **$50,000.00** | **$0.00** | **ninguna** |
| `'17'` | **$50,000.00** | **$0.00** | **ninguna** |

La norma trata el `'06'` igual que el `'01'`: es «un medio distinto» y consume el 15%. Lo
correcto es **$10,000 deducible + $40,000 no deducible**; el producto imprime **$50,000
deducible** sin una sola nota. Sobre un ejercicio, **$40,000 de deducción inventada ≈
$12,000 de ISR**, más recargos, y el papel no lo advierte.

**Intento de refutación.** Busqué el guardarraíl y no existe. La lista cerrada correcta ya
está escrita en el mismo archivo (`MEDIOS_LISR_27_III`, `engine.ts:113`) — se usa **sólo**
para los litros de IEPS (`:1153`). El panel del contador repite el mismo criterio de un
solo valor (`fiscal.ts:375` en `causasDe`, `:568` en `ivaSostenible`, `:696` en
`tope15DeGastos`), así que las dos pantallas coinciden… en el error. `efectivo_sobre_tope`
(`:479`) exige `formaPago === '01'` y además excluye el combustible, así que tampoco cubre.

**Consecuencia.** El contralor archiva un PDF que afirma «Deducible para ISR» sobre un
gasto que su contador va a rechazar en la primera revisión, y la afirmación lleva el
nombre de Likida. Y para la flota elegible es peor: el contador del 15% —la cifra que el
producto vende como su ventaja— está midiendo el denominador equivocado.

**Causa raíz probable:** la regla se escribió contra el caso de negocio observado («el
operador paga la caseta con billetes») y `'01'` quedó como sinónimo de «medio no
admitido», en vez de leer la lista de la norma por exclusión.

---

### [CRÍTICO] El panel del contador acredita el IVA de un CFDI no pagado que el motor ya rechaza: $8,000 en una pantalla, $0 en la otra

`src/lib/likida/fiscal.ts:559-571` (`ivaSostenible`) contra
`src/lib/likida/cuadre/engine.ts:1116` · ficha `normas/liva-5.yaml`
(`verificado_fuente_primaria`: **sí** — pero **su `texto_vigente` transcribe sólo las
fracciones I y II; la fr. III que el código cita no está en la ficha**, ver hallazgo G)

Lo que la ficha sí dice, literal, y que basta para este hallazgo — `riesgo_actual`:

> «El motor acredita el IVA leído del XML de todo gasto que no cayó en SIN_ACREDITAMIENTO.
> Si el artículo exige alguna condición adicional que hoy no se valida, la cifra impresa
> está de más. **Es una cifra que el contralor usa.**»

Y `usado_en_codigo` de la misma ficha promete:

> «`fiscal.ts` — ivaSostenible y resumirFiscal: el panel del contador acredita con la
> **MISMA** proporción de la fr. I, no el traslado completo»

El commit `59c02ec` («fix(A2-fiscal CRÍTICO): el IVA acreditable exige pago efectivo, LIVA
5-III») añadió el candado **sólo al motor**:

```ts
// engine.ts:1116
if ((g.ivaTraslado ?? 0) > 0 && g.formaPago !== '99') ivaAcreditable += (g.ivaTraslado as number) * proporcion;
```

`ivaSostenible` (`fiscal.ts:559-571`), que es lo que alimenta «IVA acreditable
documentado» en `/dashboard/contador` (`inicio-contador.tsx:356`), no lo recibió: sus
cinco comprobaciones son CFDI presente, no cancelado, estado SAT resuelto, no EFOS y el
efectivo sobre tope. **Cero menciones de `'99'`.**

**Escenario.** Un CFDI de refacciones de **$58,000** (SubTotal $50,000 + IVA $8,000),
timbrado, vigente, método **PPD** y por lo tanto `FormaPago = '99'` (Por definir — la
contraprestación no se ha pagado). Es el caso diario de una flota con línea de crédito en
la refaccionaria. Corrido contra las dos funciones reales, mismo comprobante:

```
PANEL  (resumirFiscal → /dashboard/contador)  ivaAcreditable = 8000
MOTOR  (cuadrarViaje  → el PDF que se archiva) ivaAcreditable = 0
```

Sale **$8,000.00** en el panel; debería salir **$0.00**, que es lo que el propio producto
ya afirma en el PDF de la misma operación.

**Intento de refutación.** ¿Lo salva la proporción de LISR 28-V? No: sólo aplica a
alimentación. ¿Lo salva `causasDe`? Tampoco: `fiscal.ts:375` sólo mira `'01'`. ¿Hay
prueba que lo ancle? `engine_iva_medio_pago.test.ts` prueba el motor con `cuadrarViaje`
real y **no tiene gemelo en `fiscal.test.ts`** — revertir el candado del panel no rompe
nada porque nunca se puso.

**Consecuencia.** Rompe la regla del repo escrita en `CLAUDE.md`: «una cifra fiscal que se
lee distinto en dos pantallas se lee como dos cálculos». El contralor cruza el panel
contra el PDF con una calculadora — es literalmente lo que el comentario de
`tope_alimentacion.ts:1-12` dice que ya pasó una vez con el mismo par de archivos — y
encuentra $8,000 de diferencia sobre el mismo UUID. Y de los dos números, el que se
teclea en la declaración mensual es el del panel.

**Causa raíz probable:** el arreglo se hizo donde el hallazgo lo señaló (el motor) sin
recorrer el segundo consumidor del mismo criterio, que es el que la ficha misma nombra.

---

### [CRÍTICO] El tenant del demo —el que se enseña en la sala— trae régimen 601 con la facilidad del 15% concedida a mano, justo lo que el arreglo acaba de prohibir

`scripts/demo-5k.sql:45` y `:58` (y `supabase/seed.sql:117`) · ficha
`normas/rfa-2026-2.9.yaml` (`verificado_fuente_primaria`: **sí**)

> «…que tributen conforme al **Título II, Capítulo VII** o Título IV, Capítulo II, Sección
> I de la Ley del ISR…»
> `condiciones_de_aplicacion`: «Tributar en **Título II Cap. VII (coordinados)** o Título
> IV Cap. II Secc. I (PF act. empresarial)»

```sql
-- scripts/demo-5k.sql:42-58
values (t, 'Transportes Peninsulares, S.A. de C.V.', 'TPE150812AB3', …
        'privacidad@tps-demo.mx', '601', '66600', 'G03',
        '{ …
          "facilidadCombustibleEfectivo":{"dedicacionExclusivaCarga":true,"regimenElegible":true}}'::jsonb);
```

Una **S.A. de C.V.** con `regimen_fiscal = '601'` y `regimenElegible: true` escrito
directo en el JSON. `cuadre/desde_db.ts:62-64` lee **sólo** `config.facilidadCombustibleEfectivo`
— nunca vuelve a mirar `tenant.regimen_fiscal` — así que el motor recibe
`facilidad15 = true` y toma la rama `combustible_efectivo_dentro15`.

Es el mismo estado imposible que `administracion.ts:166` ahora impide crear por el
formulario, sembrado por SQL en el tenant que el MAPA describe como «tenant demo de 5,000
camiones **para capturas**». El propio panel lo contradice en pantalla
(`admin/flotas/page.tsx:443`: «cualquier otro, **601 incluido**, no califica»).

**Escenario.** Se levanta el demo, se manda por WhatsApp un ticket de diésel de **$8,700**
pagado en efectivo (`formaPago: '01'`) con permiso CRE en el CFDI. El motor imprime
(`engine.ts:455-457`):

> «Diésel pagado en EFECTIVO — **deducible por la facilidad del 15% (RFA 2026 regla 2.9)**:
> el ejercicio lleva $8,700.00 de $X de combustible en efectivo (n% del total, tope 15%)»

y los **$8,700** quedan íntegros en `totalDeducible`. Para una S.A. de C.V. en régimen 601
la norma dice **$0.00** y la rama correcta, `efectivo_no_elegible` (`engine.ts:471`,
`monto: g.monto`), nunca se alcanza.

**Intento de refutación.** ¿Es «sólo un seed»? No: es el archivo del que salen las
capturas y el guion del demo, y en un demo la cifra la lee el comprador. Y no hay
guardarraíl río abajo: `actualizarFacilidad15` (`repo.ts:1009-1024`) tampoco compara
`reg` contra `tenant.regimen_fiscal` —el `<select>` de `admin/flotas/page.tsx:226-231`
ofrece «Régimen: Sí» sin decir qué claves lo justifican—, así que el mismo estado se puede
volver a crear con dos clics.

**Consecuencia.** El error sale impreso, en verde, citando «RFA 2026 regla 2.9», en la
única liquidación que un prospecto va a mirar de cerca. Y si el contralor lo detecta ahí,
no cuesta una corrección: cuesta el trato.

**Causa raíz probable:** el arreglo del CRÍTICO se aplicó a la ruta de escritura
(`administracion.ts`) y no a los datos ya escritos ni al SQL que los siembra.

---

### [ALTO] Una caseta con la forma de pago «equivocada» borra el estímulo del papel sin decir una palabra, y la pantalla de peajes afirma lo contrario de lo que el motor hace

`src/lib/likida/cuadre/engine.ts:1123-1124` · `src/lib/likida/liquidacion/acreditable.ts:132`
· `src/app/dashboard/agentes/peajes/vista.tsx:305` · ficha `normas/rmf-2026-9.1.8.yaml`
(`verificado_fuente_primaria`: **sí**)

> Fracción III: «Efectuar los pagos de autopistas mediante la tarjeta de identificación
> automática vehicular o de cualquier otro sistema electrónico de pago con que cuente la
> autopista y conservar los estados de cuenta».

El filtro nuevo es correcto, pero **no emite ninguna diferencia** cuando excluye: no hay
`diferencias.push` en esa rama. Y `acreditable.ts:132` sólo dibuja el renglón
`if (liq.peajeAcreditable > 0)`, con lo cual el pie que explica la condición
(`CONDICIONES_ESTIMULO_PEAJE`) se imprime **únicamente cuando ya hay cifra**.

Al mismo tiempo, la pantalla que el contralor abre para entender el estímulo sigue
afirmando lo contrario:

```tsx
// agentes/peajes/vista.tsx:305
<Requisito tono="flota" texto="Fr. III — pagar las autopistas con TAG o sistema electrónico
  y CONSERVAR los estados de cuenta — Likida no verifica la forma de pago de cada caseta; …" />
```

y tres líneas abajo (`:313-317`) imprime `peajeAcreditable`, que sí la verifica.

**Escenario.** Factura consolidada mensual de CAPUFE, 40 casetas, SubTotal **$10,000**,
IVA $1,600, `FormaPago = '02'` (cheque nominativo) o `'99'` (PPD, el caso normal de una
cuenta a crédito). Corrido contra `cuadrarViaje` real:

| forma de pago | `peajeAcreditable` | diferencias emitidas |
|---|---|---|
| `'03'` | $5,000.00 | ninguna |
| `'02'` | **$0.00** | **ninguna** |
| `'99'` | **$0.00** | **ninguna** |

Sale **$0.00** y el renglón «Estímulo de peaje 50%» **desaparece del PDF**; debería salir
o la cifra, o —lo que falta— un renglón que diga *por qué* no la hay. Cuarenta casetas al
mes: **$5,000 mensuales** de estímulo que el papel no menciona ni para negarlo.

**Intento de refutación.** ¿Lo cubre el rótulo del label? No: el label
(`acreditable.ts:135`) sólo existe si la cifra existe. ¿Lo cubre `causasDe` del panel?
No: `fiscal.ts:372-383` no juzga la forma de pago de la caseta. La flota se entera de que
perdió el estímulo por la ausencia de una línea.

**Consecuencia.** Dos daños opuestos en el mismo papel: la flota que sí tiene derecho al
estímulo no sabe que lo perdió por un dato del CFDI que puede corregir con su proveedor de
TAG, y la que lee la pantalla de peajes se queda creyendo que la cifra incluye casetas en
efectivo cuando ya no las incluye. Rompe la regla del repo: «un rótulo tiene que ser
verdad».

**Causa raíz probable:** el arreglo A7 se hizo en la línea que suma y no en la que
explica; el tercer estado («no se pudo afirmar») que el motor aplica en todas las demás
reglas no se instanció aquí.

---

### [ALTO] El denominador del 15% es «lo que Likida vio», y la nota impresa lo llama «el ejercicio»

`src/lib/likida/cuadre/engine.ts:456` ← `desde_db.ts:83-86` ← `repo.ts:919-953`
(`getAcumuladoCombustible` → RPC `sumar_combustible_ejercicio`) · ficha
`normas/rfa-2026-2.9.yaml` (`verificado_fuente_primaria`: **sí**)

> «…siempre que estos no excedan el 15 por ciento del **total de los pagos efectuados por
> consumo de combustible para realizar su actividad**.»

El denominador de la norma es la actividad completa del contribuyente. El del código es la
suma de las filas de `gasto` del tenant en ese año — o sea, sólo el combustible que pasó
por un ticket de WhatsApp de Likida. La nota impresa lo presenta como si fuera lo primero:

```ts
// engine.ts:456
nota: `${etiqueta} pagado en EFECTIVO — deducible por la facilidad del 15% (RFA 2026 regla 2.9):
  el ejercicio lleva ${mxn(acumulado)} de ${mxn(total)} de combustible en efectivo
  (${pct}% del total, tope 15%). No acredita IEPS.`
```

**Escenario.** Flota con **$10,000,000** de combustible reales en 2026, de los cuales
**$1,800,000** en efectivo — o sea **18%**, ya pasada del tope. Sólo tres de sus quince
operadores mandan comprobantes por WhatsApp, así que Likida ve $1,000,000 y $100,000. Entra
un diésel en efectivo de $8,700:

- El producto imprime: «deducible por la facilidad del 15%: **el ejercicio lleva
  $108,700.00 de $1,000,000.00** de combustible en efectivo (**11%** del total, tope 15%)».
- La realidad del ejercicio es **18%**. Bajo la lectura (a) que el motor aplica, ya hay
  $300,000 de excedente no deducible; bajo la lectura (b) que la propia ficha declara
  igualmente sostenible, la facilidad **no se tiene por cumplida** y caen los $1,800,000.
- La cifra «$1,000,000.00 de combustible» del papel se equivoca por **10×**.

**Intento de refutación.** El fail-closed de `engine.ts:420-435` sólo dispara con
`total <= 0` o ejercicio distinto — protege contra la base **sin medir**, no contra la
base **parcial**. `getAcumuladoCombustible` es fail-closed en la forma de la respuesta
(`repo.ts:947-950`) pero no puede saber qué no le llegó. Y ninguna de las dos notas de la
regla 5 lleva la palabra «de lo capturado en Likida».

**Consecuencia.** El contralor cruza «$1,000,000 de combustible del ejercicio» contra la
cuenta de su contador y el número no se parece. Es la cifra sobre la que el producto funda
su afirmación más rentable, y es la primera que se cae al cruzarla.

**Causa raíz probable:** el contador se construyó sobre la única fuente que el producto
tiene (sus propias filas) y el rótulo se escribió describiendo la regla, no el dato.

---

### [ALTO · REINCIDENTE] La clave 624 (Coordinados) sigue sin existir — y ahora el efecto se invirtió: ninguna persona moral puede alcanzar la facilidad

`src/lib/saas/fiscal.ts:20-26` · `supabase/migrations/0056_datos_fiscales_y_cfdi.sql:46-53`
· ficha `normas/rfa-2026-2.9.yaml` (`verificado_fuente_primaria`: **sí**)

> «que tributen conforme al **Título II, Capítulo VII**» — glosado por la propia ficha
> como «**(coordinados)**».

```ts
// saas/fiscal.ts:20-26 — el ÚNICO catálogo de régimen del producto
export const REGIMENES = [
  { clave: '601', … }, { clave: '603', … }, { clave: '612', … },
  { clave: '621', … }, { clave: '626', … },
] as const;
```

y la base lo impone igual (`0056:47-53`, `tenant_regimen_fiscal_dominio` con esas mismas
cinco claves). El código de `administracion.ts:161-165` **declara el pendiente por
escrito**, lo cual es honesto, y el panel se lo dice al usuario
(`flotas/page.tsx:444`: «La 624 todavía no está en esta lista: pídesela a Javier»).

**Escenario.** «Autotransportes Unidos, coordinado» (LISR art. 72), régimen real **624**,
dedicación exclusiva a carga federal — el contribuyente para el que la RFA 2.9 fue
escrita. Al darlo de alta no puede declarar 624: el `<select>` no lo ofrece y
`validarDatosFiscales` (`fiscal.ts:126-128`) rechazaría la clave. Sus dos salidas:

1. Teclea **601** (lo único que se parece). `REGIMENES_ELEGIBLES` ya lo excluye, así que
   `regimenElegible = false` y **todo** su diésel en efectivo cae a `efectivo_no_elegible`,
   no deducible. Sobre $150,000 anuales que la norma sí le concede: **$45,000 de ISR** que
   podía deducir y no deduce. Y queda un régimen falso escrito en `tenant.regimen_fiscal`.
2. Deja «Sin declarar» → `facilidad15 = undefined` → cada diésel en efectivo va a
   `combustible_efectivo` («se revisa»), honesto pero con el mismo resultado económico.

Y ese `regimen_fiscal` es el que se teclea como `RegimenFiscalReceptor` en el portal
(`flota_fiscal.ts:84` → `capufe.ts:851-852`, `piloto_vision.ts:340`): un coordinado
emitiendo con 601 no coincide con lo que el SAT tiene para su RFC, y `revisarReceptor`
(`capufe.ts:1245`) sólo valida la **forma** `^\d{3}$`.

**Consecuencia.** Antes de `99a6b7c` el error era conceder de más; ahora es negar de más,
al único contribuyente que la regla nombra. Es mejor error —falla cerrado— pero le cuesta
$45,000 al año al cliente que más debería querer el producto.

**Causa raíz probable:** el catálogo se acotó a «lo que aplica al receptor de la
mensualidad de Likida» y se reusó como la lista que decide una facilidad de la RFA.

---

### [MEDIO] La ficha `liva-5.yaml` no transcribe la fracción III, que es la que el código cita para decidir dinero desde `59c02ec`

`normas/liva-5.yaml` (`estado_verificacion: verificado_fuente_primaria`) ·
`src/lib/likida/cuadre/engine.ts:1109-1116` · `src/lib/likida/cuadre/engine_iva_medio_pago.test.ts:1-13`

El `texto_vigente` de la ficha **empieza en la fr. I y termina en la fr. II**. No hay una
sola línea de la fr. III en el archivo. Y sin embargo el comentario del motor, el asunto
del commit y el encabezado de la prueba se apoyan en ella:

```ts
// engine.ts:1109-1112
// AUDITORÍA 2, CRÍTICO (fiscal): LIVA 5-III exige que el IVA trasladado esté
// "efectivamente pagado en el mes".
```

La regla del rubro dice que las fichas `verificado_fuente_primaria` ganan cualquier
discusión **por lo que transcriben**. Aquí el producto decide una cifra sobre un texto que
ninguna ficha sostiene, y encima lo apoya en la RMF 2.7.1.29 fr. II, que **no tiene ficha
en `normas/`** (`ls normas/*.yaml` → 25 archivos, ninguna 2.7.1.29).

**Escenario.** El día que alguien audite este candado —o que un fiscalista discuta si un
CFDI PUE con `FormaPago '99'` realmente impide el acreditamiento— no hay nada que abrir:
`normas/liva-5.yaml` no tiene el párrafo, y `normas/README.md` declara que ése es
justamente el fallo que las fichas existen para impedir. La decisión vale, hoy, $1,600 por
cada $10,000 de base en cada CFDI PPD.

**Consecuencia.** El candado es probablemente correcto, pero es **no verificable en esta
ronda**: no puedo confirmarlo ni negarlo contra fuente primaria, y la ficha dice que sí lo
está. Una ficha marcada `verificado_fuente_primaria` que no contiene la fracción que se
cita es peor que una `sin_verificar`, porque apaga la alarma.

**Causa raíz probable:** la ficha se cerró el 28-jul contra las dos fracciones que el
código usaba entonces (I y II) y el arreglo del 22-ago añadió una tercera sin volver a la
ficha.

---

### [MEDIO · REINCIDENTE] El uso de CFDI capturado para la mensualidad de Likida es el que se teclea en el portal de la caseta

`src/lib/likida/facturacion/flota_fiscal.ts:85` → `adaptadores/capufe.ts:853-854` y
`adaptadores/piloto_vision.ts:341` · ficha `normas/cff-29-A.yaml`
(`texto_vigente: null`, `evidencia_corroborante` — **no verificable en fuente primaria en
esta ronda**; el hallazgo se sostiene en la contradicción interna del producto)

Sin cambio desde la pasada anterior: `flota_fiscal.ts:85` sigue siendo
`usoCfdi: datos.usoCfdi ?? ''`, el mismo valor que `dashboard/suscripcion/page.tsx:333-336`
presenta como «Con estos se emite el CFDI de **cada mensualidad**» y cuya ayuda dice «G03
es como se deduce una **suscripción de software**».

**Escenario.** El dueño elige `I04 — Equipo de cómputo y accesorios` (una de las tres
opciones que el producto le ofrece, `saas/fiscal.ts:29-33`). Semanas después el cron
factura 8 casetas por **$2,000** y CAPUFE emite un CFDI de $2,000 con `UsoCFDI = I04`: un
peaje declarado como adquisición de equipo de cómputo. Un CFDI es irreversible ante el
SAT. El único validador del camino, `revisarReceptor` (`capufe.ts:1246`), comprueba la
forma `^[A-Z]{1,2}\d{2}$` y nada más.

---

### [MEDIO · REINCIDENTE] `actualizarRfcOperador` sigue sin un solo llamador: la rama buena de RLISR 57 es inalcanzable

`src/lib/likida/repo.ts:995-1002` · ficha `normas/rlisr-57.yaml`
(`verificado_fuente_primaria`: **sí**)

> «Si benefician a personas que le prestan **servicios personales subordinados**, los
> comprobantes fiscales **podrán ser expedidos a nombre de dichas personas**, en cuyo caso
> … se tendrá por cumplido el requisito de respaldar dichos gastos…»

`grep -rn "actualizarRfcOperador" src/` fuera de `repo.ts` → **0**. La columna
`operador.rfc` (mig. 0080) no la escribe nadie, así que `desde_db.ts:52` siempre entrega
`operadorRfc = undefined` y `engine.ts:599-602` siempre toma la rama del tercer estado:
«Viático timbrado al RFC X. Si es el del operador es válido (RLISR 57) — **captura su
RFC** para confirmarlo», pidiendo un dato que ninguna pantalla permite capturar.

**Escenario.** Hospedaje de $2,500 timbrado al RFC del operador —perfectamente deducible
por RLISR 57—. Cada liquidación con viáticos del operador entra a `revisar`
(`engine.ts:1253`) para siempre, y el estatus «Por revisar» es el que el contralor usa
para decidir si el motor le ahorra trabajo. No se pierde dinero; se pierde la promesa.

---

### [MEDIO · REINCIDENTE] El aviso de WhatsApp presenta el plazo del comercio como vencimiento fiscal

`src/lib/likida/facturacion/enrutar.ts:159-166` · `avisar.ts:87-90` · ficha
`normas/politica-portales-plazos.yaml` (jerarquía 6, `sin_verificar` **a propósito** — no
es norma; lo citado es su directiva de uso, que sí es verificable contra el código)

> «ESTO NO ES UNA NORMA FISCAL. […] El plazo LEGAL para pedir factura es todo el ejercicio
> (el SAT lo dice expresamente) […] El producto **NUNCA** debe presentar estos plazos como
> una obligación fiscal.»
> «El aviso tiene que llevar el matiz del `advertencia_de_jerarquia` **en la misma frase**».

Sin cambio: `enrutar.ts:159-166` sigue emitiendo `⚠️ VENCE HOY` / `vence en N día(s)` sin
leer `t.plazoVerificado` —que `pendientes.ts` sí calcula y que es `false` en 33 de 37
comercios (`comercios.ts`)— y sin una palabra sobre el plazo legal.

**Escenario.** Diésel del 3-ago por $11,600 en un comercio con `plazo: 'mes_natural'` y
`plazoVerificado: false`. El 29-ago el encargado lee «Falta la factura de un diesel — ⚠️
vence en 2 día(s)». El 1-sep da el gasto por perdido: **$10,000** de deducción y **$1,600**
de IVA que el ejercicio entero seguía amparando.

---

### [BAJO] Dos cifras del panel del contador siguen tratando «≠ efectivo» como «medio admitido», con el mismo error que el motor ya corrigió

`src/lib/likida/fiscal.ts:620` (`iepsDieselDocumentado`) y `:674` (`pctElectronico`) ·
ficha `normas/lif-2026-20-A.yaml` (`verificado_fuente_primaria`: **sí**)

```ts
// fiscal.ts:620
if (esDieselConIeps(g, o) && g.iepsTraslado !== null && g.formaPago && g.formaPago !== '01') {
  iepsDieselDocumentado += g.iepsTraslado;
}
// fiscal.ts:674 — "% del MONTO pagado con medio electrónico (todo lo que no es '01')"
const electronico = conFormaPago.filter((g) => g.formaPago !== '01').reduce(…);
```

Es exactamente la puerta que `engine.ts:1153` cambió por `MEDIOS_LISR_27_III`. Un diésel
con `'99'` (no pagado) cuenta aquí como «pago electrónico» y su IEPS entra a
`iepsDieselDocumentado`. **BAJO y no ALTO porque ninguna de las dos se renderiza hoy**
(`grep -rn "iepsDieselDocumentado\|pctElectronico" src/ --include=*.tsx` → 0): son cifras
calculadas que esperan pantalla. El día que alguien las pinte, nacen mal.

---

### [BAJO] Una ficha del índice runtime tiene por título el carácter de bloque YAML

`src/lib/likida/normas/indice.ts:132` — `'criterio-1-CFF-PI'` lleva `titulo: ">"`. Se
arrastró del volcado del YAML. `normas_sincronizadas.test.ts` compara ficha e índice y no
mira que el valor tenga sentido, así que el error sobrevive a la puerta que existe para
atraparlo. No se imprime hoy (`titulo` no sale en `guardiaFundamento`), pero es la única
entrada del índice cuyo contenido es basura.

---

## Fichas que abrí, y cuáles NO son verificables en esta ronda

**Abiertas y leídas íntegras esta ronda:** `rfa-2026-2.9.yaml`, `rmf-2026-9.1.8.yaml`,
`lisr-27-III.yaml`, `liva-5.yaml`, `lisr-28-V.yaml`, `lisr-28-XX.yaml`, `rlisr-57.yaml`,
`rmf-2026-2.7.7.yaml`, `datos/cuota-ieps-diesel.yaml`, y el diff de `480ca83` sobre las dos
que tocó.

**`verificado_fuente_primaria` y por lo tanto usables como veredicto:**
`rfa-2026-2.9` (el hallazgo A y el C se anclan aquí), `rmf-2026-9.1.8` (cierres del peaje
y hallazgo D), `lisr-28-V`, `rlisr-57`, `rmf-2026-2.7.7`, `lif-2026-20-A`.
Comprobé que `480ca83` **no acomodó la ficha al código**: en `rmf-2026-9.1.8.yaml` sólo
añadió tres renglones a `usado_en_codigo`; el `texto_vigente` no cambió un byte
(`git show 480ca83 -- normas/`).

**NO verificables en esta ronda** — no se asume ni bien ni mal:

- `lisr-27-III.yaml` — `evidencia_corroborante`, `fuente_tipo: fuente_secundaria`, «NO se
  leyó en diputados.gob.mx». Es la que sostiene el veredicto «no deducible» más frecuente
  del motor y la excepción del hallazgo A. **Tercera ronda seguida que es la que más urge
  cerrar de todo el rubro**; por eso el hallazgo A se ancla en la RFA 2.9, que sí está
  verificada y transcribe la misma lista de medios admitidos.
- `liva-5.yaml` — `verificado_fuente_primaria`, **pero sólo de la fr. I y la fr. II**. La
  fr. III sobre la que el código decide desde `59c02ec` no está transcrita: hallazgo G.
- `cff-29-A.yaml` — `texto_vigente: null`. Sus dos `reformas_relevantes` siguen fechadas
  `2026-11-07`, tres meses en el futuro (casi seguro 07-nov-**2025**). Sostiene el
  requisito del `UsoCFDI` del MEDIO reincidente.
- `lisr-28-XX.yaml` — `evidencia_corroborante`. El cierre del bar es conservador
  precisamente porque la ficha no está verificada; eso es lo correcto.
- `rmf-2026-2.7.1.21.yaml`, `rmf-2026-2.7.1.48.yaml`, `criterio-1-LIF-PI.yaml`,
  `criterio-1-CFF-PI.yaml` — sin cambio.
- `politica-portales-plazos.yaml` — `sin_verificar` **a propósito** (jerarquía 6).
- **Sin ficha, y citada en código:** la RMF **2.7.1.29 fr. II** («'99 Por definir' = no
  pagado»), citada en `engine.ts:114,1111`. No existe en `normas/`.

---

## Lo que revisé y está bien

- **La matriz de la RFA 2.9 en efectivo** (`engine.ts:410-477`) es correcta en las cuatro
  ramas para `'01'`: fail-closed sin base medida y por ejercicio distinto (`:420-435`), el
  excedente **por comprobante** y no acumulativo (`:445-452`), `proporcionDeducible`
  compartida con el IVA, y las cuatro ramas en `SIN_ACREDITAMIENTO` (`:1069`) — la
  facilidad salva la deducción y no el IEPS, como manda el `limite_importante` de la ficha.
  Lo verifiqué corriendo el motor: `'01'` con previo $140,000 y tope $150,000 da
  $10,000 deducible / $40,000 no deducible, exacto.
- **`iepsAcreditable = 0`** sigue `const` con el motivo escrito (`engine.ts:1078-1082`) y
  el estímulo se entrega en **litros**, no en pesos. El crítico histórico del rubro
  continúa cerrado.
- **La verificación de litros por precio de referencia** (`engine.ts:1155-1172`): un
  decimal corrido (200 L leídos como 20,000) cae en `diesel_desviacion` con tolerancia
  0.5×–2×, declarada como atrapa-errores y no como fijación de precio.
- **`cuota_diesel.ts`** es un lector fail-closed de verdad: `cuotaDieselVigente` devuelve
  `null` fuera de rango en vez de caer al último valor (`:131`), la validación exige que
  `reducción + disminuida = 7.3634` y **lanza** si aparece el nombre viejo
  `estimulo_por_litro` (`:84`) — el nombre que invitaba a multiplicar por litros y dar
  2.2× de más. 11 pruebas contra el YAML real.
- **LISR 28-V, completo** (`tope_alimentacion.ts` + `engine.ts:930-978`): el tope de $750
  sólo lo carga alimentación (no el hospedaje nacional), es por día **y por beneficiario**,
  la proporción se calcula sólo entre los timbrados, y la tercera oración del 2º párrafo
  —«sólo procederá cuando el pago se efectúe mediante **tarjeta de crédito**»— está
  implementada exigiendo `'04'` y rechazando el débito `'28'` (`:966`), con el texto de la
  ficha citado literal encima.
- **Carta Porte** (`carta_porte.ts:98-171`) contra `rmf-2026-2.7.7.yaml`
  (`verificado_fuente_primaria`) — primera vez que se cruza en tres rondas: el árbol de
  decisión reproduce la ficha renglón por renglón (materia excluida → sí; sin declarar si
  pisa federal → `falta_declarar` citando la «plena certeza» de la 2.7.7.2.1; local → no,
  con el CFDI de ingreso igualmente exigido; sobre C2 → sí; radio ≤ 30 km medido entre
  origen inicial y destino final → no). No encontré una rama que conceda «no necesita» con
  datos faltantes, que es exactamente lo que la `advertencia` de la ficha (presunción de
  contrabando, CFF 103-XXII) prohíbe.
- **`por_diferencia.ts`** sigue siendo un inventario honesto: 13 diferencias declaradas
  `SIN_NORMA` **con el motivo escrito** en vez de omitidas, y `normasDePolitica` filtra
  por `NORMAS[id]` para que no se pueda citar una ficha que el índice no reconoce.
- **`leyendas.ts`**: la eximente del CFF 89 último párrafo —la manifestación **por
  escrito**— está en las dos constantes y en el pie del PDF, con la ficha `cff-89-90`
  detrás. Es la protección de Likida, no del cliente, y está bien puesta.
- **El piloto de visión no emite**: guarda doble e independiente (`piloto_vision.ts:254`,
  juicio del modelo **o** veto por texto), rechazo de selectores fuera del inventario y
  loop-guard. Para el rubro fiscal es lo correcto: ningún CFDI irreversible sale de ahí.
- **El formato de cifras** sigue viviendo sólo en `lib/formato.ts` en todo lo que audité.
- **Suite verde**: `npx vitest run src/lib/likida/cuadre src/lib/likida/liquidacion
  src/lib/saas` → 46 archivos, **553 pruebas, 0 fallos**.

---

## Lo que NO alcancé a revisar

- **`intake/desglose_peaje.ts` y `/api/export/bitacora-peaje`** contra la **fr. II** de la
  9.1.8 (si la bitácora concilia de verdad viaje ↔ estado de cuenta, o sólo lo afirma).
  Tercera ronda seguida.
- **`facturacion/permiso_cre.ts` + `permisos_cre.json`** contra el padrón de la CNE — la
  condición de la RFA 2.9 que la ficha declara `pendiente_en_producto` y que
  `deducibilidad.ts:71-73` sólo advierte.
- **`intake/cfdi_xml.ts` e `intake/sat.ts`**: de dónde salen `formaPago`, `subTotal` e
  `ivaTraslado`. Todos los hallazgos de esta ronda asumen que el parser los lee bien; no lo
  comprobé.
- **`comercios.ts` completo** (767 líneas, ~37 fichas de plazo), más allá de contar los
  `plazoVerificado`.
- **`conectores/portales_facturacion.ts`** por el lado fiscal: si una credencial compartida
  puede acabar emitiendo un CFDI a nombre de la flota equivocada.
- **La reforma de `cff-29-A.yaml` fechada `2026-11-07`** — sin red hacia el DOF no puedo
  confirmar si es un typo de 2025 o una reforma real por venir.

**Nota sobre el árbol (no es hallazgo fiscal):** a media corrida el árbol tuvo
`src/lib/likida/acuse_ticket.ts` con `if (false)` en lugar de la puerta de confianza
(`:102`) — una mutación de prueba de otro rubro, revertida antes de que yo terminara. No
la toqué; queda anotada porque durante ese rato la suite corría con esa puerta abierta.
