# Cumplimiento fiscal — auditoría 18 · continuación 4

**Nota: 3/10** (antes 4). Razón del movimiento: **mirada más profunda** — el código no
cambió en el punto que baja la nota, la nota anterior estaba inflada. Y hay que decirlo
con esas palabras, porque el delta SÍ atacó y SÍ cerró:

- *Se atacó y subió*: el merge cerró **de verdad 2 de los 3 CRÍTICOS** de la c3, y los
  cerró **estructuralmente**, no con un parche: `medioNoAdmitidoCombustible`
  (`engine.ts:140-144`) es ahora **un solo predicado importado** por el motor
  (`engine.ts:449`), por `causasDe` (`fiscal.ts:446`), por `ivaSostenible`
  (`fiscal.ts:647`) y por `tope15DeGastos` (`fiscal.ts:815`). Eso es lo que este rubro
  lleva rondas pidiendo. Y `0151_fiscal_agregado.sql` bajó a SQL la agregación de
  300k comprobantes **sin duplicar una sola regla** — lo verifiqué línea por línea,
  incluida la aritmética de `banda` y el corte del día de alimentación.
- *Mirada más profunda*, y es lo que manda: la nota de 4 se sostenía en «el crítico
  histórico del IEPS sigue cerrado y la trazabilidad es lo mejor construido del repo».
  Las dos cosas siguen siendo ciertas y **ninguna de las dos dice si una cifra impresa
  está bien**. Esta ronda abrí el camino que ninguna de las 18 auditorías había abierto
  —de dónde sale `subTotal`— y la respuesta es que **el estímulo de peaje se calcula
  sobre una base que no existe en el CFDI**. El ancla del rubro no admite matices:
  «3 o menos si el producto imprime una cifra fiscal equivocada». Hoy puedo nombrar
  **tres** cifras impresas equivocadas, con pesos, y una de ellas la creó el arreglo de
  ayer.

**El riesgo mayor hoy:** el numerador del 15% de la RFA 2.9 se mide en SQL con
`forma_pago = '01'` (`0112:151`) y se juzga en TS con la lista cerrada de la LISR 27-III
(`engine.ts:449`). **Son dos poblaciones distintas del mismo comprobante, y el PDF
imprime la razón entre ellas como si fuera un porcentaje.** El arreglo de FISC-C3-1
movió el consumidor del contador y no el contador.

---

## Verificación de los abiertos de la c3

| Hallazgo de `fiscal-c3.md` | Estado | Evidencia |
|---|---|---|
| **CRÍTICO A** · combustible con medio ≠ `'01'` sale deducible | **CERRADO en TS · REABIERTO en SQL** | `engine.ts:449` usa `medioNoAdmitidoCombustible`; `0112:151` sigue en `'01'` → hallazgo **F1** |
| **CRÍTICO B** · `ivaSostenible` acredita el IVA de un CFDI `'99'` | **CERRADO** | `fiscal.ts:661` — `if (g.formaPago === FORMA_PAGO_SIN_PAGAR) return false;` con el motivo escrito :648-660 |
| **CRÍTICO C** · el tenant del demo, 601 + facilidad concedida a mano | **REINCIDENTE** | `scripts/demo-5k.sql:45` (`'601'`) y `:58` (`"regimenElegible":true`), byte por byte iguales → **F4** |
| **ALTO D** · la caseta excluida borra el estímulo sin decirlo | **REINCIDENTE** | `engine.ts:1196-1197` sigue sin `diferencias.push`; `acreditable.ts:131` sigue dibujando sólo `> 0`; `peajes/vista.tsx:305` sigue afirmando lo contrario → **F5** |
| **ALTO E** · el denominador del 15% es «lo que Likida vio» | **REINCIDENTE** | `engine.ts:497` sigue imprimiendo «el ejercicio lleva … de …» sobre `sumar_combustible_ejercicio` → **F7** |
| **ALTO F** · la clave 624 (Coordinados) no existe | **REINCIDENTE** | `saas/fiscal.ts:20-26` (cinco claves, sin 624) y `0056:46-53` (mismo CHECK). Ninguna de las migs. 0150–0167 la agrega → **F6** |
| **MEDIO G** · `liva-5.yaml` no transcribe la fr. III | **REINCIDENTE** | `normas/liva-5.yaml` — `texto_vigente` empieza en la fr. I y termina en la fr. II; `git log normas/` sin cambios en el delta → **F8** |
| **MEDIO H** · `actualizarRfcOperador` sin llamador | **REINCIDENTE** | `repo.ts:1202`; `grep -rn actualizarRfcOperador src/` fuera de `repo.ts` → **0** → **F10** |
| **MEDIO I** · el `UsoCFDI` de la mensualidad se teclea en el portal | **REINCIDENTE** | `facturacion/flota_fiscal.ts:85` sigue siendo `usoCfdi: datos.usoCfdi ?? ''` → **F9** |
| **MEDIO J** · el aviso de WhatsApp presenta el plazo del comercio como vencimiento | **REINCIDENTE** | `facturacion/enrutar.ts:163-164` sigue emitiendo `⚠️ VENCE HOY` sin `plazoVerificado` ni el plazo legal → **F11** |
| **BAJO K** · `iepsDieselDocumentado` / `pctElectronico` con `!== '01'` | **REINCIDENTE** | `fiscal.ts:735` y `:792`. Siguen sin renderizarse (`grep --include=*.tsx` → 0) → **F12** |
| **BAJO L** · `indice.ts` con `titulo: ">"` | **REINCIDENTE** | `src/lib/likida/normas/indice.ts:127` |

**Los tres puntos que el MAPA me mandó verificar primero, resueltos:**

1. **Tenant del demo** — REINCIDENTE, sin tocar. Y la puerta de escritura sigue abierta:
   `actualizarFacilidad15` (`repo.ts:1216-1236`) recibe `reg` del formulario y **nunca lo
   compara contra `tenant.regimen_fiscal`**; el `<select name="reg">` de
   `admin/flotas/page.tsx:233-238` ofrece «Régimen: Sí» sin decir qué claves lo justifican
   y `accionFacilidad` (`:84-98`) lo pasa tal cual.
2. **Clave 624** — REINCIDENTE. `administracion.ts:193-198` deja el pendiente escrito, que
   es honesto, pero el catálogo y el CHECK siguen sin ella.
3. **El numerador del 15% en SQL** — **ninguna de las 18 migraciones nuevas lo tocó**
   (`grep -rn sumar_combustible_ejercicio supabase/migrations/` → sólo `0084` y `0112`), y
   ahora está **peor** que en la c3: antes TS y SQL coincidían en el criterio equivocado;
   hoy divergen. Es el hallazgo F1.

---

## Hallazgos

### [CRÍTICO] El estímulo de peaje se calcula sobre `@SubTotal`, que en un CFDI con `@Descuento` NO es el importe pagado — y el pie del PDF cita la fracción que lo prohíbe

`src/lib/likida/intake/cfdi_xml.ts:299` → `src/lib/likida/processor.ts:2114` →
`src/lib/likida/repo.ts:300` → `src/lib/likida/cuadre/engine.ts:1197`
· ficha `normas/rmf-2026-9.1.8.yaml` (`verificado_fuente_primaria`: **sí**)

Norma, fr. IV, literal de la ficha:

> «Para la determinación del monto del acreditamiento, se aplicará al **importe pagado**
> por concepto del uso de la infraestructura carretera de cuota, **sin incluir el IVA**,
> el factor de 0.5 para toda la Red Nacional de Autopistas de Cuota.»

El parser lee **un solo** atributo de importe del comprobante:

```ts
// intake/cfdi_xml.ts:299
subTotal: num(comp['@_SubTotal']),
```

`@Descuento` **no se lee en ninguna parte del repo**
(`grep -rn "Descuento" src/lib/likida --include=*.ts` → sólo `laboral/pagadero.ts`, que es
otro descuento, y una palabra dentro de un regex de `desglose_peaje.ts:94`). Y en el
Anexo 20 la identidad del CFDI 4.0 es `Total = SubTotal − Descuento + Traslados −
Retenciones`: **`@SubTotal` es la suma de los `Concepto/@Importe` ANTES del descuento**.
O sea que `subTotal` no es «el importe pagado sin IVA»: es el importe **de lista** sin
IVA. El motor lo multiplica por 0.5 sin más:

```ts
// engine.ts:1197
if (g.concepto === 'caseta' && (g.subTotal ?? 0) > 0 && peajePagadoElectronicamente)
  peajeAcreditable += (g.subTotal as number) * peajeFactor;
```

**Escenario.** CFDI mensual consolidado de un proveedor de TAG (TeleVía/PASE/IAVE), que
es como llega el peaje de una flota — el propio `cfdi_xml.ts:15-17` dice que diésel por
monedero y peaje por TAG son ~54% del gasto real. Bonificación por volumen del 15%:

```xml
<cfdi:Comprobante SubTotal="120000.00" Descuento="18000.00" Total="118320.00" FormaPago="03">
  <cfdi:Traslado Impuesto="002" Importe="16320.00"/>   <!-- 16% de 102,000 -->
```

| | lo que el producto hace | lo que la fr. IV ordena |
|---|---|---|
| base | `@SubTotal` = **$120,000.00** | importe pagado sin IVA = 120,000 − 18,000 = **$102,000.00** |
| `peajeAcreditable` | **$60,000.00** | **$51,000.00** |

Sale **$60,000.00**; debería salir **$51,000.00**. **$9,000 de estímulo inventado en un
mes; $108,000 en el ejercicio.** Y se imprime en el renglón «Estímulo de peaje 50% (LIF
2026 art. 20, ap. A)» con el pie `BASE_ESTIMULO_PEAJE` (`acreditable.ts:54-57`) debajo,
que afirma textualmente: *«Base usada: el importe SIN IVA de las casetas … Así lo fija la
RMF 2026 regla 9.1.8 fr. IV ("sin incluir el IVA")»*. El papel cita la fracción para
justificar una base que la fracción no autoriza.

El mismo dato viaja al panel: `resumirFiscal` acumula `subTotalCasetas` (`fiscal.ts:741`)
con el mismo `subTotal` bruto, rotulado en el tipo como *«Base (SubTotal) de casetas — el
50% del estímulo se calcula sobre esto»* (`fiscal.ts:613-614`).

**Intento de refutación.** ¿Lo salva el filtro de `xmlVerificado` (`engine.ts:1165`)? Al
revés: lo garantiza — sólo el camino XML llega aquí, y es justo el camino donde el
descuento existe y se puede leer. ¿Lo salva alguna comprobación de coherencia? No: nada
compara `subTotal + ivaTraslado` contra `monto` (que sí es `@Total`, ya neto —
`processor.ts:2102`), y esa resta es exactamente el descuento. ¿Es un caso de laboratorio?
`@Descuento` es un atributo estándar del CFDI 4.0 y las bonificaciones por volumen de TAG
y de monedero son la norma comercial en este segmento. ¿Hay prueba que lo ancle? Ningún
fixture de `cfdi_xml.test.ts` incluye `Descuento`.

**Consecuencia.** El contralor archiva un PDF que reclama un estímulo mayor al que la
regla concede, citando la regla. Es acreditamiento de más contra ISR: lo paga el cliente
en una revisión, y el criterio 1/LIF/PI del Anexo 3 —«quien preste servicios»— alcanza a
Likida, que es exactamente lo que `leyendas.ts:1-12` dice que este repo existe para evitar.

**Causa raíz probable:** el parser se escribió alrededor de los atributos que el motor
pedía (`SubTotal` como «base sin IVA») y nadie volvió a leer la identidad aritmética del
comprobante.

---

### [CRÍTICO · REINCIDENTE] El contador del 15% mide `forma_pago = '01'` en SQL y se juzga con la lista cerrada de la LISR 27-III en TS: el mismo comprobante entra en el numerador por un lado y no por el otro

`supabase/migrations/0112_agregados_rpc.sql:151` ← `src/lib/likida/repo.ts:1132`
← `src/lib/likida/cuadre/desde_db.ts:85,95,97` → `src/lib/likida/cuadre/engine.ts:449,485,497`
· ficha `normas/rfa-2026-2.9.yaml` (`verificado_fuente_primaria`: **sí**)

> «…considerarán cumplida la obligación establecida en el artículo 27, fracción III,
> segundo párrafo de la Ley del ISR, cuando los pagos por consumo de combustible se
> realicen **con medios distintos a cheque nominativo de la cuenta del contribuyente;
> tarjeta de crédito, de débito o de servicios; o monederos electrónicos autorizados por
> el SAT, siempre que estos no excedan el 15 por ciento del total de los pagos efectuados
> por consumo de combustible** para realizar su actividad.»
> — `normas/rfa-2026-2.9.yaml`, `texto_vigente`

El delta corrigió **quién consume** el contador, y no **quién lo calcula**:

```sql
-- 0112:148-158 (sin base aquí; esto sale de LEER el archivo, no de correrlo)
select coalesce(sum(monto), 0) as total,
       coalesce(sum(monto) filter (where forma_pago = '01'), 0) as efectivo
```

```ts
// engine.ts:449 — el juicio, ya corregido por FISC-C3-1
if (medioNoAdmitidoCombustible(g.formaPago) && esCombustible) { …
// engine.ts:485 — pero el previo con el que se compara viene de la RPC de arriba
const acumulado = (input.efectivoPrevEjercicio ?? 0) + efectivoAcumuladoEjercicio;
```

`desde_db.ts:95` resta **sólo** los `'01'` de este viaje, así que es coherente con SQL y no
con el motor. Resultado: **el combustible pagado en liquidaciones anteriores con un medio
no admitido que no sea efectivo es invisible para el contador**, y el motor lo compara
contra un tope que cree intacto. Y el comentario del propio predicado
(`engine.ts:132-134`) afirma «mismo estándar que … `getAcumuladoCombustible` en `repo.ts`»,
que desde este merge es falso — igual que el `comment on function` de `0112:161`, que
promete «mismo criterio que el motor de cuadre».

**Escenario (flota elegible, 612, dedicación exclusiva, ejercicio 2026).** Combustible del
ejercicio ya en la base: **$10,000,000**, de los cuales **$1,400,000** pagados con
`'06' Dinero electrónico` (monedero de una red privada, no autorizado por el SAT) y **$0**
en efectivo `'01'`. Tope = 15% × 10,000,000 = **$1,500,000**. Entra un CFDI de diésel de
**$200,000** con `formaPago '06'`:

| paso | valor que produce el código | valor correcto |
|---|---|---|
| `sumar_combustible_ejercicio.efectivo` | **$0.00** | $1,400,000.00 |
| `efectivoPrevEjercicio` (`desde_db.ts:97`) | **$0.00** | $1,400,000.00 |
| `cupoRestante` (`engine.ts:489`) | **$1,500,000.00** | $100,000.00 |
| deducible de este comprobante | **$200,000.00** | $100,000.00 |
| no deducible | **$0.00** | **$100,000.00** (`efectivo_sobre_15`) |

Y el PDF imprime, literal (`engine.ts:497`):

> «…deducible por la facilidad del 15% (RFA 2026 regla 2.9): el ejercicio lleva
> **$200,000.00** de $10,000,000.00 de combustible pagado con medios que la LISR 27-III no
> admite (**2%** del total, tope 15%).»

La cifra real del ejercicio es **$1,600,000 = 16%**, ya pasada del tope. El rótulo se
equivoca por **8×** y por **14 puntos**, y son **$100,000 de deducción inventada ≈ $30,000
de ISR** bajo la lectura (a) que el motor declara aplicar. Bajo la lectura (b) que la
propia ficha declara igualmente sostenible (`lectura_aplicada_por_el_motor`), caen los
$1,600,000 completos.

**Intento de refutación.** ¿Lo atrapa el fail-closed de `engine.ts:464`? No: sólo dispara
con `total <= 0` o ejercicio distinto — protege contra la base **sin medir**, no contra el
numerador **mal medido**. ¿Hay prueba de equivalencia que lo cace? Hay una, y **bloquea el
error en su sitio**: `repo_acumulado.test.ts:82-107` escribe un `sqlEquivalente` que
espeja la RPC «línea por línea» incluido `g.forma_pago === '01'`, y compara SQL contra el
JS legado — dos implementaciones del **mismo criterio equivocado**. Ninguna prueba compara
el numerador contra `medioNoAdmitidoCombustible`. ¿Se arregla solo por el lado de TS?
`tope15DeGastos` (`fiscal.ts:815`) ya usa el predicado bueno, pero **no lo consume nadie**
(`grep` → 0 fuera de `fiscal.ts`), así que no compensa nada.

**Consecuencia.** La cifra que el producto vende como su ventaja —«te digo cuánto te queda
del 15% antes de perder la deducción»— está midiendo un cubo con el fondo abierto, y el
papel lo afirma con el número exacto y la regla citada. Es REINCIDENTE: la c3 lo dejó
escrito («el numerador del 15% vive también en SQL … pide migración») y el merge tocó todo
menos eso.

**Causa raíz probable:** el arreglo se aplicó al archivo donde el hallazgo señaló la línea
(`engine.ts`) y no al productor del insumo, que vive en otro lenguaje y por eso no salió en
el diff.

---

### [ALTO] El panel recalcula la deducibilidad de una liquidación ya archivada con el contador del 15% de HOY, y el guardia que existe para eso sólo mira los TIPOS de diferencia

`src/lib/likida/analytics.ts:1582-1590`, `:1625`, `:1693-1709`
· `src/app/dashboard/[id]/detalle.tsx:72` · ficha `normas/rfa-2026-2.9.yaml`
(`verificado_fuente_primaria`: **sí**)

Las tres cubetas **no se persisten** — el propio comentario lo dice (`analytics.ts:1613`:
«no hay columnas ni parámetros en `guardar_liquidacion_tx`», y lo confirmé:
`grep -rn "total_deducible" supabase/migrations/` → **0**). El detalle las reconstruye
llamando otra vez al motor:

```ts
// analytics.ts:1589-1590
const liq = await cuadrarDesdeDB(tenantId, viajeId);
if (Math.abs(liq.totalComprobado - totalPersistido) > 0.015) return null;
```

`cuadrarDesdeDB` vuelve a llamar `getAcumuladoCombustible` **con el estado de la base de
hoy** (`desde_db.ts:85`), que en un ejercicio en curso crece cada semana. El guardia contra
la deriva compara **sólo la llave `tipo`**:

```ts
// analytics.ts:1698-1703
.map((d) => (typeof d.esperado === 'number' ? `${d.tipo}:${d.esperado}` : d.tipo))
```

y `efectivo_sobre_15` **no lleva `esperado`** (`engine.ts:501-505`): su llave es la palabra
`'efectivo_sobre_15'` a secas. Si el excedente cambia pero el tipo no, el portón pasa.

**Escenario.** Flota elegible, 2026. Liquidación **VJ-2026-0310** cerrada en marzo con un
diésel en efectivo de **$30,000**:

| | al cerrar (marzo) | al abrirla en el panel (diciembre) |
|---|---|---|
| total combustible del ejercicio | $500,000 → tope $75,000 | $2,000,000 → tope $300,000 |
| `efectivoPrevEjercicio` | $60,000 | $280,000 |
| `cupoRestante` | $15,000 | $20,000 |
| **deducible del comprobante** | **$15,000.00** | **$20,000.00** |
| **no deducible** | **$15,000.00** | **$10,000.00** |
| tipo de diferencia | `efectivo_sobre_15` | `efectivo_sobre_15` |
| `totalComprobado` | idéntico | idéntico |

Las dos puertas pasan y la pantalla imprime **$20,000 deducibles** sobre la misma
liquidación cuyo PDF archivado —el que el contralor ya mandó a su contador— dice
**$15,000**. **$5,000 de diferencia sobre el mismo folio, sin una marca de que se
recalculó.**

**Intento de refutación.** ¿No lo cubre el salto `combustible_efectivo_dentro15` →
`efectivo_sobre_15`? Ése sí lo cubre: cambia el tipo y el portón cierra. Lo que no cubre es
el movimiento **dentro** de `efectivo_sobre_15`, que es el caso más frecuente en el segundo
semestre de un ejercicio. ¿Lo cubre el portón de `totalComprobado`? No: la suma de montos
no depende del contador del ejercicio, exactamente el mismo agujero que el comentario
`:1591-1599` documenta para el RFC.

**Consecuencia.** Rompe la regla escrita en `CLAUDE.md`: «una cifra fiscal que se lee
distinto en dos pantallas se lee como dos cálculos». Aquí son la pantalla y el papel
archivado, sobre el mismo UUID, y el que se teclea en la declaración anual es el del papel.

**Causa raíz probable:** la llave de deriva se diseñó contra un cambio de *configuración*
(que sí cambia el conjunto de tipos) y no contra un insumo **temporal** que se mueve solo.

---

### [CRÍTICO · REINCIDENTE] El tenant del demo sigue con régimen 601 y la facilidad del 15% concedida a mano — y la puerta para volver a crearlo sigue abierta con dos clics

`scripts/demo-5k.sql:45` y `:58` · `src/lib/likida/repo.ts:1216-1236`
· `src/app/admin/flotas/page.tsx:87,93,233-238`
· ficha `normas/rfa-2026-2.9.yaml` (`verificado_fuente_primaria`: **sí**)

> `condiciones_de_aplicacion`: «Tributar en **Título II Cap. VII (coordinados)** o Título
> IV Cap. II Secc. I (PF act. empresarial)»

```sql
-- demo-5k.sql:45  (Transportes Peninsulares, S.A. de C.V.)
'https://app.likida.ai/aviso/' || t, 'privacidad@tps-demo.mx', '601', '66600', 'G03',
-- demo-5k.sql:58
"facilidadCombustibleEfectivo":{"dedicacionExclusivaCarga":true,"regimenElegible":true}
```

Sin cambio desde la c3. `desde_db.ts:62-65` lee **sólo** `config.facilidadCombustibleEfectivo`
y nunca vuelve a mirar `tenant.regimen_fiscal`, así que el motor recibe `facilidad15 = true`.

Lo nuevo que verifiqué esta ronda: **la ruta de escritura del panel tampoco valida**.
`accionFacilidad` (`flotas/page.tsx:87`) toma `reg` de un `<select>` de tres opciones
(`:233-238`) y lo pasa a `actualizarFacilidad15` (`repo.ts:1216`), que lo escribe con
`tenant_config_merge` **sin leer `tenant.regimen_fiscal` ni una vez**. El `REGIMENES_ELEGIBLES`
que `99a6b7c` puso vive sólo en `administracion.ts:198`, o sea **sólo en el alta**.

**Escenario.** Se levanta el demo y se manda un ticket de diésel de **$8,700** en efectivo
(`'01'`) con permiso CRE en el CFDI. El motor entra por `elegible === true`
(`engine.ts:454`) y emite `combustible_efectivo_dentro15` (`:495-499`):

> «Diésel pagado en EFECTIVO — **deducible por la facilidad del 15% (RFA 2026 regla 2.9)**…»

y los **$8,700** quedan íntegros en `totalDeducible`. Para una **S.A. de C.V. en régimen
601** la norma dice **$0.00**, y la rama correcta —`efectivo_no_elegible` (`engine.ts:508`,
`monto: g.monto`)— nunca se alcanza. El propio panel lo contradice en pantalla
(`flotas/page.tsx:453-455`: «cualquier otro, **601 incluido**, no califica»).

**Intento de refutación.** ¿Es «sólo un seed»? Es el archivo del que salen las capturas y
el guion del demo, y en un demo la cifra la lee el comprador. ¿Lo salva el CHECK de la
0056? No: la 0056 valida la **clave**, no la coherencia entre la clave y el JSON de la
config, que son dos columnas distintas de la misma fila.

**Consecuencia.** El error sale impreso, en verde, citando «RFA 2026 regla 2.9», en la
única liquidación que un prospecto va a mirar de cerca.

**Causa raíz probable:** el arreglo se aplicó a **una** de las tres rutas que escriben el
mismo estado (alta, panel, SQL de siembra).

---

### [ALTO · REINCIDENTE] Una caseta con la forma de pago «equivocada» borra el estímulo del papel sin una línea, y la pantalla de peajes sigue afirmando lo contrario de lo que el motor hace

`src/lib/likida/cuadre/engine.ts:1196-1197` · `src/lib/likida/liquidacion/acreditable.ts:131`
· `src/app/dashboard/agentes/peajes/vista.tsx:305`
· ficha `normas/rmf-2026-9.1.8.yaml` (`verificado_fuente_primaria`: **sí**)

> Fracción III: «Efectuar los pagos de autopistas mediante la tarjeta de identificación
> automática vehicular o de cualquier otro sistema electrónico de pago con que cuente la
> autopista y conservar los estados de cuenta».

El filtro es correcto y **no emite ninguna diferencia** cuando excluye: la rama de
`engine.ts:1197` no tiene `diferencias.push`. Y `acreditable.ts:131` dibuja el renglón
`if (liq.peajeAcreditable > 0)`, así que el pie que explica la condición se imprime
**únicamente cuando ya hay cifra**. Mientras tanto:

```tsx
// peajes/vista.tsx:305
<Requisito tono="flota" texto="Fr. III — pagar las autopistas con TAG o sistema electrónico
  y CONSERVAR los estados de cuenta — Likida NO VERIFICA la forma de pago de cada caseta; …" />
```

y ocho líneas abajo la misma pantalla imprime `peajeAcreditable`, que sí la verifica.

**Escenario.** Factura consolidada mensual de CAPUFE, 40 casetas, `SubTotal $10,000`, IVA
$1,600, `FormaPago = '02'` (cheque nominativo — no es un sistema electrónico de la
autopista) o `'99'` (PPD, cuenta a crédito):

| forma de pago | `peajeAcreditable` | diferencias emitidas | renglón en el PDF |
|---|---|---|---|
| `'03'` | $5,000.00 | ninguna | «Estímulo de peaje 50% … $5,000.00» |
| `'02'` | **$0.00** | **ninguna** | **no existe** |
| `'99'` | **$0.00** | **ninguna** | **no existe** |

**$5,000 mensuales** de estímulo que el papel no menciona ni para negarlo — y que la flota
recupera cambiando un dato con su proveedor de TAG, si alguien se lo dijera.

**Consecuencia.** Dos daños opuestos en el mismo producto: la flota que sí tiene derecho no
sabe que lo perdió, y la que lee la pantalla de peajes cree que la cifra incluye casetas
que ya no incluye. Rompe «un rótulo tiene que ser verdad».

---

### [ALTO · REINCIDENTE] La clave 624 (Coordinados) sigue sin existir: el contribuyente para el que la RFA 2.9 fue escrita no puede declararse

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

y la base impone lo mismo (`0056:46-53`). **Ninguna de las migraciones 0150–0167 la
agrega.** `administracion.ts:193-197` deja el pendiente escrito y el panel se lo dice al
usuario (`flotas/page.tsx:455`: «La 624 todavía no está en esta lista: pídesela a Javier»),
lo cual es honesto y no lo repara.

**Escenario.** «Autotransportes Unidos, coordinado» (LISR art. 72), régimen real **624**,
dedicación exclusiva a carga federal. No puede declarar 624: el `<select>` no lo ofrece y
`validarDatosFiscales` lo rechazaría. Teclea **601** → `REGIMENES_ELEGIBLES`
(`administracion.ts:198`) lo excluye → `regimenElegible = false` → **todo** su diésel en
efectivo cae a `efectivo_no_elegible`. Sobre **$150,000** anuales que la norma sí le
concede: **$45,000 de ISR** que podía deducir y no deduce. Y ese `regimen_fiscal` falso es
el que se teclea como `RegimenFiscalReceptor` en los portales (`flota_fiscal.ts:84`).

**Consecuencia.** Falla cerrado —es el error correcto de los dos— pero le cuesta $45,000 al
año al cliente que más debería querer el producto, y en un CFDI emitido a su nombre queda
un régimen que no es el suyo.

---

### [ALTO · REINCIDENTE] El denominador del 15% es «lo que Likida vio», y la nota impresa lo llama «el ejercicio»

`src/lib/likida/cuadre/engine.ts:497` ← `desde_db.ts:85` ← `repo.ts:1126-1160`
· ficha `normas/rfa-2026-2.9.yaml` (`verificado_fuente_primaria`: **sí**)

> «…siempre que estos no excedan el 15 por ciento del **total de los pagos efectuados por
> consumo de combustible para realizar su actividad**.»

El denominador de la norma es la actividad completa del contribuyente; el del código es la
suma de las filas de `gasto` del tenant en ese año — el combustible que pasó por un ticket
de WhatsApp. La nota impresa lo presenta como lo primero: «el ejercicio lleva X de **Y** de
combustible».

**Escenario.** Flota con **$10,000,000** de combustible reales en 2026, **$1,800,000** con
medios no admitidos (**18%**, ya pasada del tope). Sólo 3 de sus 15 operadores mandan
comprobantes, así que Likida ve $1,000,000 y $100,000. Entra un diésel en efectivo de
$8,700 → el producto imprime «el ejercicio lleva **$108,700.00 de $1,000,000.00** … (**11%**
del total, tope 15%)». La realidad del ejercicio es **18%**: bajo la lectura (a) ya hay
$300,000 de excedente no deducible; bajo la (b) caen los $1,800,000. La cifra del papel se
equivoca por **10×**.

**Consecuencia.** Es la cifra sobre la que el producto funda su afirmación más rentable, y
es la primera que se cae cuando el contralor la cruza contra la cuenta de su contador.
Ninguna de las dos notas de la regla 5 lleva la palabra «de lo capturado en Likida».

---

### [MEDIO · REINCIDENTE] `liva-5.yaml` sigue sin transcribir la fracción III, que es la que dos módulos citan para decidir dinero

`normas/liva-5.yaml` (`estado_verificacion: verificado_fuente_primaria`)
· `src/lib/likida/cuadre/engine.ts:1183-1189` · `src/lib/likida/fiscal.ts:648-661`

El `texto_vigente` de la ficha **empieza en la fr. I y termina en la fr. II**. No hay una
línea de la fr. III. Y ahora son **dos** módulos, no uno, los que deciden sobre ella: el
merge extendió el candado de `'99'` al panel (`fiscal.ts:661`, el cierre de FISC-C3-2),
así que la superficie que se apoya en un texto que ninguna ficha sostiene **creció** en
este delta. Además el fundamento auxiliar —RMF **2.7.1.29 fr. II**, citada en
`engine.ts:114` y `:1185`— **sigue sin ficha** (`ls normas/*.yaml` → 24, ninguna 2.7.1.29).

**Escenario.** Un CFDI PPD de refacciones de $58,000 (IVA $8,000): el producto niega el
acreditamiento en las dos pantallas —probablemente con razón—, pero si un fiscalista lo
discute no hay nada que abrir. La decisión vale **$1,600 por cada $10,000 de base** en cada
CFDI PPD. Una ficha marcada `verificado_fuente_primaria` que no contiene la fracción que se
cita es peor que una `sin_verificar`: apaga la alarma.

---

### [MEDIO · REINCIDENTE] El uso de CFDI capturado para la mensualidad de Likida es el que se teclea en el portal de la caseta

`src/lib/likida/facturacion/flota_fiscal.ts:85` → `adaptadores/capufe.ts` y
`adaptadores/piloto_vision.ts` · ficha `normas/cff-29-A.yaml`
(`texto_vigente: null`, `evidencia_corroborante` — **no verificable en fuente primaria en
esta ronda**; el hallazgo se sostiene en la contradicción interna del producto)

Sin cambio: `usoCfdi: datos.usoCfdi ?? ''` es el mismo valor que
`dashboard/suscripcion/page.tsx` presenta como «con estos se emite el CFDI de **cada
mensualidad**». **Escenario:** el dueño elige `I04 — Equipo de cómputo y accesorios` (una
de las tres opciones que el producto ofrece, `saas/fiscal.ts:29-33`); semanas después el
cron factura 8 casetas por **$2,000** y el portal emite un CFDI de $2,000 con
`UsoCFDI = I04` — un peaje declarado como adquisición de equipo de cómputo, irreversible
ante el SAT. `revisarReceptor` sólo valida la forma `^[A-Z]{1,2}\d{2}$`.

---

### [MEDIO · REINCIDENTE] `actualizarRfcOperador` sigue sin un solo llamador: la rama buena del RLISR 57 es inalcanzable

`src/lib/likida/repo.ts:1202` · ficha `normas/rlisr-57.yaml` (`verificado_fuente_primaria`: **sí**)

> «Si benefician a personas que le prestan **servicios personales subordinados**, los
> comprobantes fiscales **podrán ser expedidos a nombre de dichas personas**…»

`grep -rn "actualizarRfcOperador" src/` fuera de `repo.ts` → **0**. `operador.rfc` (mig.
0080) no la escribe nadie, así que `desde_db.ts` siempre entrega `operadorRfc = undefined`
y el motor siempre pide «captura su RFC», un dato que ninguna pantalla permite capturar.
**Escenario:** hospedaje de $2,500 timbrado al RFC del operador —deducible por el RLISR
57— manda la liquidación a `revisar` para siempre. No se pierde dinero; se pierde la
promesa, que es el estatus con el que el contralor decide si el motor le ahorra trabajo.

---

### [MEDIO · REINCIDENTE] El aviso de WhatsApp presenta el plazo del comercio como vencimiento fiscal

`src/lib/likida/facturacion/enrutar.ts:159-166` · ficha
`normas/politica-portales-plazos.yaml` (jerarquía 6, `sin_verificar` **a propósito** — lo
citado es su directiva de uso, que sí es verificable contra el código)

> «ESTO NO ES UNA NORMA FISCAL. […] El plazo LEGAL para pedir factura es todo el ejercicio
> (el SAT lo dice expresamente) […] El producto **NUNCA** debe presentar estos plazos como
> una obligación fiscal.»
> «El aviso tiene que llevar el matiz del `advertencia_de_jerarquia` **en la misma frase**.»

`enrutar.ts:163-164` sigue emitiendo `⚠️ VENCE HOY` / `vence en N día(s)`, sin leer
`t.plazoVerificado` y sin una palabra sobre el plazo legal (`grep -n "plazoVerificado" en
enrutar.ts y avisar.ts` → **0**). **Escenario:** diésel del 3-ago por $11,600 en un
comercio con `plazo: 'mes_natural'` y `plazoVerificado: false`; el 29-ago el encargado lee
«vence en 2 día(s)» y el 1-sep da el gasto por perdido: **$10,000** de deducción y
**$1,600** de IVA que el ejercicio entero seguía amparando.

---

### [BAJO · REINCIDENTE] Dos cifras del panel siguen tratando «≠ efectivo» como «medio admitido», con el error que el motor ya corrigió en todos los demás sitios

`src/lib/likida/fiscal.ts:735` (`iepsDieselDocumentado`) y `:792` (`pctElectronico`)
· ficha `normas/lif-2026-20-A.yaml` (`verificado_fuente_primaria`: **sí**)

```ts
// fiscal.ts:735
if (esDieselConIeps(g, o) && g.iepsTraslado !== null && g.formaPago && g.formaPago !== '01') {
// fiscal.ts:792 — "% del MONTO pagado con medio electrónico (todo lo que no es '01')"
const electronico = conFormaPago.filter((g) => g.formaPago !== '01').reduce(…);
```

Es la puerta que `engine.ts:1226` ya cambió por `MEDIOS_LISR_27_III` y que
`causasDe`/`ivaSostenible`/`tope15DeGastos` cambiaron en este merge: **son las dos últimas
que quedan con el criterio viejo**. Un diésel con `'99'` (no pagado) cuenta aquí como
«pago electrónico». **BAJO y no ALTO porque ninguna se renderiza hoy**
(`grep -rn "iepsDieselDocumentado\|pctElectronico" src/ --include=*.tsx` → 0). El día que
alguien las pinte, nacen mal.

---

### [BAJO · REINCIDENTE] Una ficha del índice runtime tiene por título el carácter de bloque YAML

`src/lib/likida/normas/indice.ts:127` — `'criterio-1-CFF-PI'` lleva `titulo: ">"`, arrastrado
del volcado del YAML. `normas_sincronizadas.test.ts` compara ficha e índice y no mira que el
valor tenga sentido, así que el error sobrevive a la puerta que existe para atraparlo.

---

## Fichas que abrí, y cuáles NO son verificables en esta ronda

**Abiertas y leídas ÍNTEGRAS esta ronda: las 24 de `normas/*.yaml` más
`normas/datos/cuota-ieps-diesel.yaml`.**

**`verificado_fuente_primaria`, y por lo tanto usables como veredicto:**
`rfa-2026-2.9` (anclan F2, F4, F7), `rmf-2026-9.1.8` (ancla F1 y F5), `lif-2026-20-A`,
`lisr-28-V`, `rlisr-57`, `rmf-2026-2.7.7`, `cff-30`, `cff-69-B`, `cff-89-90`, `rfa-2026-2.2`,
`rmf-2026-2.7.1.48`, `liva-5` (**sólo frs. I y II**).

**NO verificables en esta ronda** — no se asume ni bien ni mal:

- `lisr-27-III.yaml` — `evidencia_corroborante`, `fuente_tipo: fuente_secundaria`, «NO se
  leyó en diputados.gob.mx». **Cuarta ronda seguida.** Es la que sostiene el veredicto «no
  deducible» más frecuente del motor; por eso F1 y F2 se anclan en la RFA 2.9, que sí está
  verificada y transcribe la misma lista de medios.
- `liva-5.yaml` — la fr. III sobre la que dos módulos deciden desde este merge no está
  transcrita (F8).
- `cff-29-A.yaml` — `texto_vigente: null`. Sus dos `reformas_relevantes` siguen fechadas
  `2026-11-07`, casi tres meses en el futuro (casi seguro 07-nov-**2025**). Sostiene F9.
- `lisr-28-XX.yaml` — `evidencia_corroborante`; el cierre del bar es conservador
  precisamente por eso, y eso es lo correcto.
- `rmf-2026-2.7.1.21.yaml`, `criterio-1-LIF-PI.yaml`, `criterio-1-CFF-PI.yaml` —
  `texto_vigente: null`, sin cambio.
- `politica-portales-plazos.yaml` — `sin_verificar` **a propósito** (jerarquía 6).
- **Sin ficha y citada en código para decidir dinero:** RMF **2.7.1.29 fr. II**
  (`engine.ts:114,1185`).
- `datos/cuota-ieps-diesel.yaml` — la última semana cubierta es **2026-08-15 a 2026-08-21**
  y hoy es **23-ago**: la tabla **ya no cubre hoy**, dos semanas seguidas. No produce cifra
  equivocada porque `cuotaDieselVigente` devuelve `null` fuera de rango y **nadie lo
  consume** (`grep` → 0 fuera del test), pero la vigilancia semanal se está atrasando y la
  causa está escrita en el único commit que tocó `normas/` en todo el delta
  (`06317d1`, «latido de vigilancia — sábado 22-ago, **egress bloqueado**»).

---

## Lo que revisé y está bien

- **`0151_fiscal_agregado.sql` no duplica la ley — verificado línea por línea**, que es
  justo lo que el MAPA me pidió comprobar y no dar por bueno. Las 17 columnas del
  `group by` (`:155`) son **exactamente** las dimensiones que `causasDe`, `ivaSostenible` y
  `resumirFiscal` consultan por fila; SQL no evalúa deducibilidad en ninguna línea. Los tres
  juicios no categóricos se resuelven sin mover la regla:
  - `sobre_tope` (`:93`) es una **partición fila por fila** con el tope del llamador, y TS
    la lee con `sobreTopeEfectivo` (`fiscal.ts:152-154`) en vez de recalcular. Correcto:
    sobre la suma de una celda no se puede evaluar.
  - El día de alimentación (`:103-113`): el `having` usa **sólo lo timbrado**, y aunque
    `diasSobreTope` dispara con el total del día, `proporcionTimbrado = min(1,
    tope/totalTimbrado)` vale 1 cuando lo timbrado no rebasa — **las dos rutas dan el mismo
    número**, y la fórmula la sigue aplicando `tope_alimentacion.ts` a través de
    `proporcionDeCelda` (`fiscal.ts:701-709`). Se agrupa por `(viaje_id, dia)`, que es el
    «por beneficiario» del LISR 28-V.
  - **La aritmética de `banda` es correcta.** SQL cuenta `count(*) where fecha < corte`
    (`:118-120`) y TS decide `banda >= cortes.length - cortes.indexOf(corte)`
    (`fiscal.ts:1037`). Lo verifiqué: con los cortes ordenados y sin duplicados, `fecha <
    cortes[j]` ⟺ los `k−j` cortes mayores exceden la fecha ⟺ `banda ≥ k−j`. La comparación
    estricta deja el día del corte como NO vencido, que es su definición.
  - `leerCelda` (`fiscal.ts:942-983`) es **fail-closed de forma de verdad**: lanza campo por
    campo con el nombre y la migración en el mensaje, en vez de `?? 0`.
- **Los cierres de la c3 son reales, no asuntos de commit.** `fiscal.ts:661` niega el IVA
  del `'99'` con el motivo escrito; `engine.ts:449`, `fiscal.ts:446`, `:647` y `:815` usan
  **el mismo predicado importado**, con el comentario `:440-444` diciendo por qué no se
  copia. Ése es el patrón correcto y hay que decirlo.
- **`0166_factura_serie.sql`** — bien hecho y **no deja huérfanas** las filas viejas, que es
  lo que me mandaron verificar. El índice nuevo `(tenant_id, upper(coalesce(serie,'')),
  upper(folio), extract(year from fecha)) where folio is not null` (`:182-185`) **afloja** a
  los dos que sustituye: les agrega dimensiones sin quitar ninguna, así que toda fila que hoy
  convive lo sigue haciendo; el bloque `:146-172` lo **mide** antes de crear en vez de
  confiar en la demostración, y falla ruidoso con los grupos. `coalesce(serie,'')` mete a
  todas las facturas sin serie al mismo consecutivo, que es lo que significa «no uso
  series». El nombre del índice se conserva a propósito porque `traducirChoque`
  (`facturacion_escritura.ts:309-320`) discrimina el 23505 por él. Y el escritor **existe y
  está cableado**: `facturacion_escritura.ts:158,180,378` y `page.tsx:94`; `sellarFactura`
  (`:471-477`) usa `undefined` para no dejar sin serie un borrador que sí la traía.
- **`iepsAcreditable = 0`** sigue `const` con el motivo escrito (`engine.ts:1151-1155`) y el
  estímulo se entrega en **litros**. El crítico histórico del rubro continúa cerrado, y
  `criterio-1-LIF-PI` es la ficha que lo justifica.
- **LISR 28-V completo** (`tope_alimentacion.ts` + `engine.ts:1035`): el tope sólo lo carga
  alimentación, es por día y por beneficiario, la proporción sale sólo de lo timbrado, y la
  tercera oración —«sólo procederá cuando el pago se efectúe mediante **tarjeta de
  crédito**»— exige `'04'` y rechaza el débito `'28'`.
- **`intake/sat.ts:80-85`** — nunca afirma `efos: true` desde el código del SAT; cualquier
  valor no limpio cae en `efosDesconocido` → `cfdi_efos_indeterminado`. Es exactamente lo
  que `cff-69-B.yaml` distingue entre el listado presunto y el definitivo, y es la primera
  vez que se cruza con la ficha.
- **`intake/cfdi_xml.ts:187-191`** (`formaPagoSat`) — un `FormaPago="1"` se rellena a `"01"`
  y cualquier otra cosa se descarta a `undefined`; perder un dato accesorio antes que perder
  el CFDI que el CFF 30 obliga a conservar. `iepsTraslado`/`ivaTraslado` se suman del nodo
  `Impuestos/Traslados` del comprobante por clave (`002`/`003`), no por posición.
- **`leyendas.ts`** — la eximente del CFF 89 último párrafo (la manifestación **por
  escrito**) está en `LEYENDA_CORTA` y en `leyendaPdf()`, con `cff-89-90.yaml`
  (`verificado_fuente_primaria`) detrás. Es la protección de Likida y está bien puesta.
- **`deducibilidad.ts:47-55`** — el portón que devuelve `null` cuando las tres cubetas no
  suman `totalComprobado` con un centavo de tolerancia: la pantalla se calla antes de
  contradecir su propio total.
- **`diagnosticoRetencion` (`fiscal.ts:863-878`)** — se niega a derivar la retención del 4%
  como `sub_total * 0.04` y nombra los dos campos que faltan con ruta y nodo XML. Es el modo
  correcto de no inventar una cifra.
- **`cuota_diesel.ts`** sigue siendo un lector fail-closed: `null` fuera de rango, y **lanza**
  si aparece el nombre viejo `estimulo_por_litro`.
- **Suite**: `npx vitest run src/lib/likida/cuadre src/lib/likida/liquidacion
  src/lib/likida/fiscal.test.ts src/lib/likida/fiscal_agregado.test.ts src/lib/saas` →
  **56 archivos, 728 pruebas, 0 fallos**.

---

## Lo que NO alcancé a revisar

- **`intake/desglose_peaje.ts` y `/api/export/bitacora-peaje`** contra la **fr. II** de la
  9.1.8 (si la bitácora concilia de verdad viaje ↔ estado de cuenta del TAG, o sólo lo
  afirma). **Cuarta ronda seguida.** Con el hallazgo del `@Descuento` encima, es lo primero
  que abriría la ronda que viene: es el mismo pipeline.
- **`facturacion/permiso_cre.ts` + `permisos_cre.json`** contra el padrón de la CNE — la
  condición de la RFA 2.9 que `deducibilidad.ts:64-71` sólo advierte con tono
  `condicionado`.
- **`facturacion/adaptadores/` completo** (capufe, piloto_vision) por el lado fiscal: si una
  credencial compartida puede acabar emitiendo un CFDI a nombre de la flota equivocada. Sólo
  leí el camino del `usoCfdi`.
- **`comercios.ts` completo** (37 fichas de plazo) más allá de contar `plazoVerificado`.
- **`carta_porte.ts`** contra `rmf-2026-2.7.7.yaml`: lo cruzó la c3 y salió limpio; esta
  ronda no lo reabrí, así que su estado es «bueno según la c3», no según yo.
- **Las migraciones 0150–0167 fuera de 0151, 0158 y 0166.** De `0158` leí el índice completo
  y sólo el bloque 1 (`guardar_liquidacion_tx`) en detalle; los bloques 2 a 10 (RLS del
  dinero, `cfdi_uuid` en minúsculas, dominios de fecha) los miré por encabezado.
- **Ninguna migración se puede ejecutar aquí** (no hay Postgres): todo lo que digo de SQL
  sale de **leer el archivo**, y las dos afirmaciones que dependen de eso son F1 (el filtro
  `forma_pago = '01'` de `0112:151`) y la ausencia de columnas `total_deducible` en las 163
  migraciones (F3).

**Nota de corrida (no es hallazgo).** A media auditoría leí `src/lib/formato.ts:47` con
`timeZone: 'UTC'` en vez de `TZ_MX` y `OFFSET_MX = 'Z'` en vez de `'-06:00'`, con **seis
pruebas fiscales en rojo** —incluida «el ejercicio en curso es 2026, no 2027» a las 19:00
del 31 de diciembre—. Volví a leer el archivo veinte minutos después y estaba intacto
(`git status` limpio, `git diff HEAD` vacío) y las seis pruebas verdes. Fue una **mutación
transitoria de otro rubro**, igual que el `if (false)` de `acuse_ticket.ts` que la c3
anotó. No la reporto como hallazgo; queda anotada porque durante ese rato la suite corría
con el corte del ejercicio en UTC, y porque estuve a un párrafo de levantarla como CRÍTICO.
La lección para el tablero es de la corrida, no del código: **un auditor y un mutador no
pueden compartir árbol.**
