# Pruebas — auditoría 23

**Nota: 7/10** (antes 7). Razón del movimiento: **se atacó y subió, compensado
por mirada más profunda.** Las dos mitades se midieron, no se opinaron:

- *Se atacó y subió.* Volví a correr las **6 mutaciones que sobrevivieron a la
  auditoría 22** contra la suite completa. **Las 6 mueren hoy.** Los cuatro
  arreglos de `d3ce510` (PRU-C1/A1/A2/A3) no son decoración. Y la cobertura de
  las tres zonas que la 22 señaló subió de verdad: el export de póliza de
  **40.5% → 81.72%** de líneas, la cola de autofacturación de **0% → 85.29%**,
  el lector de estadías de **2.4% → 15.29%**.
- *Mirada más profunda.* Corrí por primera vez lo que la 22 declaró fuera de
  alcance —`supabase/verificaciones.sql` contra un Postgres real— y encontré una
  compuerta de CI que **imprime la fuga en su propia salida y contesta «La
  batería pasó»**. Y las mutaciones nuevas muestran el patrón del día: los
  arreglos de la 22 cerraron **el punto que nombraron, no la clase**. La misma
  ruta de export de póliza sigue con cuatro decisiones de dinero que se pueden
  romper con los 9,993 tests en verde.

Neto: ni subió ni bajó lo suficiente. Se queda en 7.

**El riesgo mayor del rubro hoy:** hay una compuerta de CI que **no puede
reprobar**. `scripts/ci/correr-verificaciones.mjs` corre 203 bloques de ataque
contra Postgres y **19 —los más complejos, que son justamente los de RLS por
rol, los RPC de cobranza y los agregados— salen «SIN CALIFICAR» y no cuentan
como fallo**. Lo comprobé quitándole a la policy de `pago_recibido` su guarda
`ve_finanzas()`: la batería imprimió `pagos=1` y terminó con **exit 0 y «La
batería pasó»**.

---

## Cómo se midió (para que se pueda repetir)

Copié el árbol a un sandbox fuera del repo (`node_modules` por symlink) sobre
`master = c7c3d1c`, con el árbol limpio, y corrí **la suite COMPLETA por cada
mutación** —nunca el archivo vecino—. Línea base del sandbox: **708 archivos,
9,993 pasan, 1 saltada, 108 s**. Se excluye de cada corrida
`src/lib/pruebas/arbol_sin_enlaces_ajenos.test.ts`, que falla por mi propio
symlink y por correr fuera de un repo git; es la única diferencia con la corrida
real. **23 mutaciones de código: 12 muertas, 11 sobrevivientes.**

Aparte levanté un **Postgres 16 efímero**, apliqué el andamio de CI y las **255
migraciones una por una** (todas limpias sobre base virgen) y corrí la batería
completa —`capa1_auditoria_estatica.sql` + `verificaciones.sql`— con el mismo
runner de `ci-postgres.yml`. Salida real: **203 bloques · 182 ok · 0 fallos · 19
sin calificar · 2 reportes · exit 0**. Sobre esa base corrí **4 mutaciones más:
2 muertas, 2 sobrevivientes.**

**Total: 27 mutaciones · 14 muertas · 13 sobrevivientes.** Son dirigidas y
adversariales: fui a buscar dónde se acaba el arnés. El cociente NO es «el
puntaje de mutación de la suite», es **dónde termina la protección**.

---

## Mutaciones corridas hoy

### Grupo A — las 6 que sobrevivieron a la auditoría 22 · ¿las mató?

| # | Mutación | `archivo:línea` | Resultado | Prueba que la mata |
|---|---|---|---|---|
| M7 | `numero: (numeroInicial ?? 1) + i` → `+ 0`: todas las pólizas del periodo con el MISMO número | `contabilidad/formatos.ts:90` | **muerta** | `poliza.test.ts:203` |
| M8 | `const jdtNum = i + 1` → `= 1`: todos los asientos SAP con el mismo JdtNum | `contabilidad/formatos.ts:164` | **muerta** | `poliza.test.ts:246` |
| M9 | `lote.filter(vigentesIds.has)` → `lote`: la cola re-timbra lo ya facturado | `api/cron/facturar/cola/route.ts:92` | **muerta** (2) | `guarda_doble_cfdi.test.ts:83`, `:97` |
| M12 | `sinBase` nunca se llena: exporta con base gravable desconocida | `api/export/poliza/route.ts:231` | **muerta** (2) | `salida.test.ts:102`, `:121` |
| M13 | `if (bloqueos.length > 0)` → nunca: exporta el periodo a medias | `api/export/poliza/route.ts:254` | **muerta** (3) | `salida.test.ts:102`, `:113`, `:121` |
| M16 | `f.cliente_id === null` → `!== null`: el pacto de un cliente se lee como el de flota | `estadias/lector.ts:70` | **muerta** (4) | `lector_aud22.test.ts:33`… |

**6/6 muertas.** El trabajo de la 22 en este rubro es real y aguanta.

### Grupo B — dónde se acaba el arnés hoy

| # | Mutación | `archivo:línea` | Resultado |
|---|---|---|---|
| **N1** | Los DOS archivos del DTW de SAP, intercambiados: `oJournalEntries.txt` recibe las LÍNEAS y `JournalEntries_Lines.txt` la CABECERA | `api/export/poliza/route.ts:315-316` | **SOBREVIVIENTE** |
| **N2** | La base del asiento deja de restar `@Descuento` (revierte media FIS-A1) | `api/export/poliza/route.ts:85` | **SOBREVIVIENTE** |
| **N3** | `retenciones: Number(f.retenciones ?? 0)` → `0` (revierte la otra media FIS-A1) | `api/export/poliza/route.ts:246` | **SOBREVIVIENTE** |
| **N4** | La cubeta `por_confirmar` se asienta como gasto DEDUCIBLE | `api/export/poliza/route.ts:95` | **SOBREVIVIENTE** |
| **N5** | `Line_ID` de todos los renglones SAP colapsa a `0` | `contabilidad/formatos.ts:167` | **SOBREVIVIENTE** |
| **N6** | `guardarPoliticaDetencion` usa siempre `.eq('cliente_id', …)`, nunca `.is(…, null)` | `estadias/lector.ts:105` | **SOBREVIVIENTE** |
| **N7** | `LLAVES_SIN_REDACTAR` pierde `uuidFiscal`, `uuidCfdi`, `folioFiscal` | `observability/alerta.ts:155` | **SOBREVIVIENTE** |
| **N8** | El guarda del doble CFDI filtra por la columna equivocada: `.is('cfdi_uuid', null)` → `.is('ocr_extra', null)` | `api/cron/facturar/cola/route.ts:89` | **SOBREVIVIENTE** |
| N9 | `getAcumuladoCombustible` devuelve efectivo y total intercambiados | `repo.ts:1352-1353` | **muerta** (5) — `repo_acumulado.test.ts` |

### Grupo C — revertir los arreglos de la 22 · ¿la prueba nueva los ancla?

| # | Arreglo revertido | `archivo:línea` | Resultado |
|---|---|---|---|
| D1 | **FIS-C3** (`61b45b3`): la frontera vuelve a ser «¿es 01?» | `cuadre/engine.ts:595` | **muerta** (6) — `medio_pago_lisr27.test.ts`, los seis `FormaPago` |
| D2 | **FIS-C2** (`8c585ad`): las dos listas se vuelven a fundir en una | `cuadre/engine.ts:1328` | **muerta** (3) — `rfa29_iva_acreditable.test.ts` |
| D3 | **FIS-C1** (`75a5ac0`): `repartirPorCubeta` manda todo a la cubeta deducible | `api/export/poliza/route.ts:77` | **muerta** (1) — `salida.test.ts:130` |
| D4 | **LEG-C1** (`5b64259`): se deriva el expediente laboral sin aviso previo | `jornada/derivar.ts:309` | **muerta** (3) — `derivar.test.ts` |
| **D5** | El número inicial de póliza declarado por la flota se ignora (`perfil.opciones.numero` → `1`) | `api/export/poliza/route.ts:292` | **SOBREVIVIENTE** |
| **D6** | `filaTarifa` guarda origen y destino INVERTIDOS | `clientes.ts:859-860` | **SOBREVIVIENTE** |
| D7 | `traerTodo` pagina por número de página en vez de por filas leídas (la trampa que su propio comentario documenta) | `pg.ts:193` | **muerta** (4) — `pg.test.ts`, `crear_viaje_wa.test.ts` |
| **D8** | El parser del CFDI cuenta el **IVA retenido (002) como ISR** — la mitad de intake de FIS-A1 | `intake/cfdi_xml.ts:362` | **SOBREVIVIENTE** |

### Grupo D — la batería SQL contra Postgres real

| # | Mutación | Dónde | Resultado |
|---|---|---|---|
| SQL-1 | `registrar_pago_tx`: se borra el freno de sobrepago (`p_monto > v_saldo + 0.005` → nunca) | función de la 0237 | **muerta**, pero **por accidente**: el bloque `RPCS_0159` reventó más adelante con «ERROR INESPERADO (no llegó al RAISE)», no por su bandera `sobrepago-rebota` — que es SIN CALIFICAR |
| SQL-2 | `ve_finanzas()` incluye al `encargado` | función de la 0048 | **muerta**, pero **no por `FINANZAS_RLS`** (que salió SIN CALIFICAR mostrando `clientes=1 tarifas=1 facturas=1 pagos=1 cotizaciones=1`): la mató `GASTO_FINANZAS_0146`, `verificaciones.sql:5595` |
| **SQL-3** | La policy `tenant_finanzas` de **`tarifa`** pierde `AND ve_finanzas()` | 0048/0051 | **SOBREVIVIENTE** — salida `FINANZAS_RLS … tarifas=1 …`, y aun así `182 ok · 0 fallo(s)` · **exit 0** · «La batería pasó» |
| **SQL-4** | La policy `tenant_finanzas` de **`pago_recibido`** pierde `AND ve_finanzas()` | 0048/0051 | **SOBREVIVIENTE** — salida `FINANZAS_RLS … pagos=1 …` · **exit 0** · «La batería pasó» |

---

## Hallazgos

### [CRÍTICO] La batería de `verificaciones.sql` imprime la fuga y contesta «La batería pasó»: 19 de 203 bloques no se califican, y son los de RLS por rol, cobranza y agregados

`scripts/ci/correr-verificaciones.mjs:332-335` (marca `SIN CALIFICAR`) y
`:412-431` (decide que eso **no es un fallo**). Bloque afectado que sí probé:
`supabase/verificaciones.sql:1107-1141` (`FINANZAS_RLS`).

**Escenario, con la mutación exacta y la salida real.** Sobre un Postgres 16 con
las 255 migraciones aplicadas, cambié la policy de `pago_recibido`:

```sql
alter policy tenant_finanzas on public.pago_recibido
  using (tenant_id = ANY (get_user_tenant_ids()) OR is_superadmin());  -- sin ve_finanzas()
```

El bloque 29 hace exactamente lo que debe: inserta una factura de $11,600 y un
abono de $5,000, se impersona como `encargado` de esa misma flota y cuenta. Su
salida, textual:

```
▲ supabase/verificaciones.sql:1107  SIN CALIFICAR (6 clave(s) detectada(s) vs 1 valor(es) esperado(s)) — revisar a mano:
   FINANZAS_RLS clientes=0 tarifas=0 facturas=0 pagos=1 cotizaciones=0 factura_viaje=0 (esperado 0 en las seis — cualquier otra cosa le abre precios y saldos al encargado)
…
203 bloque(s) · 182 ok · 0 fallo(s) · 0 no-lanzó · 19 sin-calificar · 2 reporte(s)
19 bloque(s) sin calificar, todos conocidos y con razón (ver SIN_CALIFICAR_CONOCIDOS). Ninguno nuevo.
La batería pasó.
```

`exit 0`. El job `aislamiento-postgres` sale **verde**. Repetí lo mismo con
`tarifa` (la lista de precios por cliente) y el resultado fue idéntico.

**Consecuencia:** el jefe de tráfico —que tiene la anon key porque tiene sesión—
lee por PostgREST los abonos de los clientes de su flota, y la única prueba
escrita para impedirlo corrió, lo midió, lo imprimió y **no reprobó**. No es un
bloque aislado: de los 19 sin calificar, `RPCS_0159` agrupa dieciséis banderas de
dinero (`sobrepago-rebota`, `saldo-nunca-negativo`, `factura-ajena-rebota`),
`STRIPE_0163` ocho, `AGREGADOS_0150` diecisiete y `RESUMEN_POR_TENANT`
veintidós, incluyendo su propio `AISLADO=`. Ninguna de esas banderas se compara
contra nada.

**Causa raíz probable:** el runner solo califica cuando el número de claves del
mensaje coincide con el de valores del `(esperado …)`, y los bloques más ricos
—los que resumen su veredicto en prosa— nunca coinciden; caen en una lista de
excepciones que se lee como «conocidos y con razón» y que en realidad los apaga.

---

### [ALTO] El export de póliza: el arreglo de la 22 cerró los dos frenos que nombró y dejó cuatro decisiones de dinero sin arnés — la rama SAP entera nunca se ejecuta

`src/app/api/export/poliza/route.ts:85`, `:95`, `:246`, `:306-316`.
Cobertura medida hoy sobre sus dos únicos archivos de prueba
(`rol_dinero.test.ts`, 4 casos; `salida.test.ts`, 5 casos): **81.72% de líneas,
56.25% de ramas**, con **`306-312` sin ejecutar** — que es exactamente el bloque
`sap_b1`.

Cuatro escenarios, cada uno con su mutación corrida contra la suite completa:

- **N1 (`:315-316`)** — intercambié los dos archivos del DTW:
  `'oJournalEntries.txt': sap.lineas` y `'JournalEntries_Lines.txt':
  sap.cabecera`. **Suite verde, 9,993 pasan.** El contador de la flota carga en
  el Data Transfer Workbench el archivo de renglones como si fuera el de
  cabeceras: el import de SAP truena o crea asientos sin encabezado. Nada en la
  suite pide `formato=sap_b1` a esta ruta —lo grepeé: `sap_b1` aparece en 8
  archivos de prueba y ninguno es de este export—, y el mock de
  `perfilExportacionDeclarado` (`salida.test.ts:55-61`) devuelve un perfil
  **sin `plantilla`**, así que ni siquiera podría entrar a esa rama.
- **N2 (`:85`)** — `const monto = Number(g.subtotal ?? 0) - Number(g.descuento ?? 0)`
  → sin el descuento. **Suite verde.** Una factura de casetas de $120,000 con
  $18,000 de `@Descuento` entra al asiento por $120,000; el residuo derivado
  (`comprobado − base − IVA`) sale negativo, `polizaDeLiquidacion` lo lee como
  «dato de origen roto» y la ruta contesta 409 **tirando el periodo entero**. Es
  la regresión que `89a6b60` (FIS-A1) dice haber cerrado: su prueba
  (`poliza_deducibilidad.test.ts:146`) cubre `polizaDeLiquidacion`, no la
  plomería de la ruta que le arma el número.
- **N3 (`:246`)** — `retenciones: 0`. **Suite verde.** Un flete subcontratado a
  un permisionario persona física con $400 de IVA retenido pierde el abono a
  «retenciones por pagar»: o el 409 del periodo completo, o —si en el mismo
  periodo hay IVA no acreditado que lo compense— el IVA retenido, que es cuenta
  POR PAGAR al SAT, **desaparece del asiento sin renglón**. Es el reverso que el
  encabezado de `poliza_deducibilidad.test.ts:142` llama «peor que el 409».
- **N4 (`:95`)** — `else if (cubeta === 'por_confirmar')` nunca se cumple, así
  que lo por confirmar se suma a `subtotal`. **Suite verde.** Los $58,000 de
  hospedaje pagados con `'06' Dinero electrónico` —el crítico FIS-C3 de la
  22— se asientan en `5010-004`, la cuenta de gasto **deducible**. `salida.test.ts:130`
  prueba la cubeta `no_deducible` y solo esa; la tercera cubeta, que es la que el
  motor usa para el tercer estado, no la mira nadie.

**Consecuencia:** el archivo que el contralor pone primero en la landing («el
formato que SAP Business One o CONTPAQi ya sabe importar») se puede romper de
cuatro maneras distintas con CI en verde, y las cuatro se descubren dentro del
ERP del cliente o en la revisión del ejercicio siguiente.

**Causa raíz probable:** `salida.test.ts` se escribió para los dos frenos que el
hallazgo PRU-C1 nombró (`:182` y `:204`) y con **un solo** formato, un solo
concepto y `descuento: null` en su fixture; la ruta tiene cuatro decisiones más.

---

### [ALTO] `formatos.ts` marca 100% de líneas y el `Line_ID` de SAP se puede colapsar a cero sin que nada enrojezca

`src/lib/likida/contabilidad/formatos.ts:167`
(pruebas: `contabilidad/poliza.test.ts:236` y `:246`).

**Escenario:** cambié `lineas.push([jdtNum, linea, m.cuenta, …])` por
`[jdtNum, 0 * linea, …]` — todos los renglones de todos los asientos con
`Line_ID = 0`. **Suite completa verde (9,993).** Las dos pruebas
multi-póliza de SAP cuentan filas (`:238`) y comparan `JdtNum` (`:248-251`);
ninguna mira la segunda columna. El DTW recibe, dentro de un mismo `JdtNum`,
seis renglones con `Line_ID` repetido: se pisan entre sí o el importador
rechaza el lote.

**Consecuencia:** es la mitad exacta del hallazgo PRU-A1 de la 22, que quedó sin
cerrar. El archivo mide **100% de líneas y 86.66% de ramas** — la demostración
en vivo de la advertencia que `vitest.config.ts` escribió: «100% de líneas con
cero `expect` sigue siendo cero protección».

**Causa raíz probable:** el arreglo de la 22 afirmó el número de póliza y el
`JdtNum` porque eran los dos que su mutación había tocado; el `Line_ID` es la
tercera llave del mismo formato y no entró.

---

### [ALTO] OP-A2: la prueba nueva de la 22 ancla una forma de payload que ningún llamador de producción emite — la regresión que dice cerrar sigue viva

`src/lib/observability/alerta_aud22.test.ts:48`; producción:
`src/lib/observability/alerta.ts:154-155` y `:199`;
llamadores reales: `src/lib/likida/carta_porte_timbre.ts:317`, `:379`, `:409`.

`alerta.ts:199` deja pasar sin redactar **solo** las llaves
`uuid | uuidFiscal | uuidCfdi | folioFiscal`. La prueba de la 22 llama
`alertarOperador('timbre.…', { uuid: UUID, … })` y comprueba que el folio llegue
entero. **Ningún llamador de producción usa esas llaves.** Los tres que llevan
un folio fiscal lo meten dentro de la llave `error`:

```ts
await alertarOperador('timbre.uuid_huerfano', {
  error: `Viaje ${viajeId}: el PAC timbró el uuid ${otra.reservaPendiente.uuidFiscal} y la consolidación no cerró…`,
  codigo: 'timbre_uuid_huerfano',
});
```

`error` **no** está en `LLAVES_SIN_REDACTAR`, así que pasa por `redactarTexto`
(`logger.ts:100-107`), que convierte todo UUID en `huellaId(m)`. El correo dice,
hoy, exactamente lo que el encabezado de la prueba jura haber corregido: «el PAC
timbró el uuid **id:33ab7e19c0d1**».

El otro extremo del cable tampoco lo ve: `carta_porte_timbre.test.ts:287-288`
afirma que el folio va dentro de `error` —pero con `alertarOperador`
**mockeado** (`:75-76`), así que la redacción nunca corre. Las dos mitades están
probadas y la costura no.

Y la lista está sin arnés: **N7** —borrar `uuidFiscal`, `uuidCfdi` y
`folioFiscal` y dejar solo `'uuid'`— **sobrevivió a la suite completa**.

**Consecuencia:** a las 3 de la mañana el PAC timbra, el `update` del folio
falla, y el correo de alerta trae una huella FNV irreversible en vez del folio.
Ese CFDI existe ante el SAT y Likida no lo puede nombrar — que es literalmente
el daño que OP-A2 describe.

**Causa raíz probable:** el arreglo se hizo en el punto donde el reporte lo
describió (la lista de llaves) sin recorrer los llamadores; la prueba se escribió
contra la lista, no contra el mensaje que sale.

---

### [ALTO] El parser de `Retenciones` del CFDI —la mitad de intake del arreglo FIS-A1— no tiene una sola prueba

`src/lib/likida/intake/cfdi_xml.ts:352-364`.

**Escenario (D8):** cambié `if (imp === '002') ivaRetenido += importe;` por
`if (imp === '001')`. **Suite completa verde (9,993 pasan).** Con eso, un CFDI de
flete con `Retencion Impuesto="002" Importe="400.00"` (IVA retenido 4%, lo normal
en carga federal subcontratada) deja `ivaRetenido = 0`: la 0272 calcula
`retenciones = Σ(iva_retenido + isr_retenido)` y le entrega `0` a la póliza. El
asiento pierde el abono a «retenciones por pagar» de $400, o el periodo entero
rebota con 409.

Grepeé `Retencion` y `ivaRetenido` en todos los `*.test.ts` de `intake/`: la
única aparición es un fixture con `ivaRetenido: 0`
(`consolidado_orquestador.test.ts:78`). **Ningún XML de prueba trae un nodo
`Retenciones`.**

**Consecuencia:** el arreglo de la 22 que cableó descuento y retención «de punta
a punta» tiene prueba en la punta contable (`poliza_deducibilidad.test.ts:146`)
y ninguna en la punta de entrada. Con la de entrada rota, la de salida seguiría
verde.

**Causa raíz probable:** la prueba se escribió donde estaba el síntoma (el
asiento descuadrado), no donde estaba el dato.

---

### [MEDIO] La ESCRITURA de la perilla de dinero de las estadías tiene 0% ejecutado: el pacto de flota se puede volver imposible de guardar sin que nada enrojezca

`src/lib/likida/estadias/lector.ts:105` (y `:119`).
Cobertura medida hoy del archivo, con TODOS sus importadores de prueba:
**15.29% de líneas · 8.08% de ramas**, con **`88-296` sin ejecutar** — o sea
`guardarPoliticaDetencion` entera.

**Escenario (N6):** sustituí
`q = clienteId === null ? q.is('cliente_id', null) : q.eq('cliente_id', clienteId)`
por `q = q.eq('cliente_id', clienteId)`. **Suite verde.** Con `clienteId = null`,
PostgREST traduce `cliente_id=eq.null`, que no empata ninguna fila: el UPDATE
toca 0 filas, cae al INSERT, choca con el índice único parcial de la 0207
(23505), reintenta el UPDATE con el mismo `.eq` y vuelve a tocar 0 filas →
`throw new Error('estadias.politica.insert: …')`. **El contralor teclea la tarifa
por hora de detención de su flota, aprieta guardar y recibe un error cada vez.**

La 22 arregló el LECTOR de este mismo archivo (PRU-A3, `lector_aud22.test.ts`,
M16 muerta) y dejó el escritor sin tocar.

**Causa raíz probable:** el hallazgo de la 22 se enunció sobre `politicasDetencion`
y la prueba se escribió con ese alcance; la función de al lado —la que escribe—
quedó fuera del enunciado.

---

### [MEDIO] Las escrituras del catálogo de tarifas están sin arnés por decisión escrita, y el mapeo a columnas se puede invertir sin que nada falle

`src/lib/likida/clientes.ts:855-867` (`filaTarifa`), consumido por
`crearTarifa:870` y `editarTarifa:893`. Cobertura medida con sus dos únicos
importadores de prueba: **59.88% de líneas, con `604-918` sin ejecutar.**

`clientes.test.ts:12-13` lo dice explícito: «Las escrituras (`crearCliente`,
`crearTarifa`) no se prueban aquí: probarlas contra un mock del cliente de
Supabase demostraría que el mock funciona». Ese criterio no es el del repo — con
un mock de Supabase se prueban `saveLiquidacion` (M14/M15 de la 22, ambas
muertas) y `facturacion_escritura` (M4, muerta).

**Escenario (D6):** invertí `origen: t.origen` / `destino: t.destino` en
`filaTarifa`. **Suite verde.** Cada tarifa que la flota captura se guarda con la
ruta al revés; `tarifaSugerida` —que sí está probada, y bien— busca
`Silao → Nuevo Laredo`, no encuentra la fila (quedó `Nuevo Laredo → Silao`) y el
cotizador propone el precio de otro carril o ninguno. La cifra sale firmada hacia
el cliente de la flota.

**Causa raíz probable:** una regla escrita («no se prueban escrituras contra
mocks») que el resto del repo no sigue, aplicada justo a la tabla de precios.

---

### [MEDIO] El número inicial de póliza que la flota declaró en su perfil ERP se puede ignorar y la suite no lo nota

`src/app/api/export/poliza/route.ts:292`.

**Escenario (D5):** `numeroInicial: perfil.opciones.numero` → `numeroInicial: 1`.
**Suite verde.** El mock de `salida.test.ts:59` declara `numero: 1`, así que la
prueba no puede distinguir «usa el perfil» de «usa 1». Una flota cuya
contabilidad ya lleva 4,300 pólizas del ejercicio y declaró `numero: 4301` recibe
un archivo numerado desde 1: CONTPAQi lo importa contra pólizas que ya existen, o
lo rechaza en bloque.

**Causa raíz probable:** el fixture usa el valor por defecto de la propia
función; una prueba solo puede afirmar lo que su fixture puede desmentir.

---

### [MEDIO] REINCIDENTE — dos guardianes de fuente solo miran el primer nivel de `src/app/api/cron`, y las mismas dos rutas anidadas escapan a los dos

`src/lib/auth/cron.test.ts:49` (venía de la 22, MEDIO, sin arreglar) y
`src/app/api/cron/latido-en-toda-salida.test.ts:41` (nuevo hoy).

Los dos hacen `readdirSync` del primer nivel. Hay **13** `route.ts` bajo
`src/app/api/cron/` y **11** directorios de primer nivel: quedan fuera
`facturar/cola/route.ts` y `wa-pendientes/cola/route.ts`.

**Escenario concreto para el segundo guardián**, que se anuncia como «la prueba
que cierra la CLASE»: su regla 2 dice que una ruta que contesta con `saltado:`
tiene que registrar `registrarLatido(…, 'saltado', …)`. Las dos rutas anidadas
contestan `{ corrio: false, saltado: … }`
(`facturar/cola/route.ts:79`, `wa-pendientes/cola/route.ts:68`), y
`wa-pendientes/cola/route.ts:63` además maneja `interruptor_ilegible` sin latido
—la regla 1—. **Ninguna de las dos se abre nunca.** Si estuvieran en el escaneo,
el guardián estaría rojo hoy.

Y `cron.test.ts:55` esconde el hueco: `catch { continue; }` se traga la lectura
fallida, así que mover un handler a un subdirectorio saca la ruta del escaneo
**sin bajar el conteo de pruebas ni poner nada rojo**.

**Consecuencia:** la clase que estos dos guardianes existen para cerrar tiene dos
miembros vivos hoy, y el día que una de esas rutas maneje `CRON_SECRET` la regla
«nunca comparar el secreto con `===`» dejará de aplicarle sin aviso.

**Causa raíz probable:** un escaneo escrito cuando todas las rutas de cron eran
planas, más un `catch` que convierte la ausencia en silencio.

---

### [MEDIO] El mock de Supabase del guarda contra el doble CFDI no puede ver la columna del filtro

`src/app/api/cron/facturar/cola/guarda_doble_cfdi.test.ts:41-51`
(producción: `src/app/api/cron/facturar/cola/route.ts:89`).

El doble es `select: () => ({ in: (_c, ids) => ({ is: async () => …vigentes }) })`:
`is` **ignora sus dos argumentos**. Es el mismo patrón que la 22 corrigió en
`oficina_wa.io.test.ts` (un mock que no puede fallar por el bug que cubre).

**Escenario (N8):** cambié `.is('cfdi_uuid', null)` por `.is('ocr_extra', null)`.
**Suite verde.** En producción esa consulta devuelve los gastos cuyo `ocr_extra`
es nulo —casi todos los que no pasaron por OCR—, así que un ticket que **ya tiene
`cfdi_uuid`** vuelve al lote y se emite un **segundo CFDI** por el mismo gasto en
el reintento de QStash. Es exactamente el daño que el archivo se escribió para
impedir; lo que la prueba sí ancla es el `filter` de JS (M9 muerta), no el filtro
que hace el trabajo en el servidor.

**Causa raíz probable:** el doble se escribió para devolver el dato y no para
observar la consulta; `in()` sí captura sus ids y se afirma (`:90`), `is()` no.

---

### [BAJO] `agentico_aud22.test.ts:28` es tautológico: recalcula la constante con la misma fórmula que la define

`src/lib/likida/agentico_aud22.test.ts:27-29`; producción
`src/lib/likida/presupuesto.ts:175`.

```ts
// producción
export const MARGEN_CIERRE_CRITICO_MS = PASOS_CIERRE.reduce((s, p) => s + (p.critico ? p.techoMs : 0), 0);
// prueba
const esperado = PASOS_CIERRE.filter((p) => p.critico).reduce((s, p) => s + p.techoMs, 0);
expect(MARGEN_CIERRE_CRITICO_MS).toBe(esperado);
```

Es la misma reducción sobre el mismo arreglo. No existe cambio en `presupuesto.ts`
que ponga roja esa aserción sin cambiar también la prueba. Los otros dos casos del
archivo sí trabajan (el tercero reproduce el escenario con números).

**Consecuencia:** ninguna hoy; importa como señal, porque el archivo se lee como
si verificara que el margen crítico cubre los pasos irrenunciables y lo que
verifica es que dos copias de la misma línea dan lo mismo.

---

### [BAJO] REINCIDENTE — el doble de `exportarAprobadas` sigue devolviendo un campo que la función real ya no tiene

`src/app/api/export/rutas_export.test.ts:97` (real: `src/lib/likida/proveedores.ts:443`
documenta que `recortado` «jamás se cumplía» y se quitó). El doble sigue
devolviendo `recortado: false`. Era el BAJO de la 22 y no se tocó.

---

### [BAJO] Un `vi.mock` que dobla un módulo que el sujeto no importa, con dos nombres que ese módulo no exporta

`src/lib/agents/copiloto-tools.test.ts:91-94`.

Mockea `@/lib/likida/agentes/cola` con `piezasPendientes` y `contarPendientes`.
`cola.ts` no exporta ninguno de los dos (sus lectores son `bandejaPendiente`,
`aprobadasSinEnviar`, …) y `copiloto-tools.ts` **no importa ese módulo**: cuenta
las piezas con `supabaseAdmin().from('cola_aprobacion')…{ count: 'exact' }`
(`copiloto-tools.ts:388-389`). O sea: el doble sustituye un módulo que nadie usa,
por una forma que nunca existió.

Escaneé los ~1,500 `vi.mock` con fábrica del repo comparando cada clave de primer
nivel contra los `export` reales del módulo: **este es el único caso.** No es
sistémico; es la señal de que nada ata un doble a la firma que sustituye.

---

## Lo que revisé y está bien

- **Los cuatro arreglos de la 22 en este rubro aguantan.** 6/6 mutaciones que
  antes sobrevivían mueren hoy, cada una con la prueba que la mata nombrada
  arriba. Y las tres coberturas que la 22 midió subieron de verdad:
  `api/export/poliza/route.ts` **81.72%** líneas (era 40.5%),
  `api/cron/facturar/cola/route.ts` **85.29%** (era 0.0%),
  `estadias/lector.ts` **15.29%** (era 2.4%).
- **Los arreglos fiscales y legales de la 22 tienen ancla real, verificado por
  reversión.** D1 (FIS-C3) muere con seis casos de `medio_pago_lisr27.test.ts`;
  D2 (FIS-C2) con tres de `rfa29_iva_acreditable.test.ts`; D3 (FIS-C1) con
  `salida.test.ts:130`; D4 (LEG-C1) con tres de `derivar.test.ts`. No son
  pruebas decorativas.
- **`pg.ts` / `traerTodo` está bien probado.** D7 —paginar por número de página
  en vez de por filas leídas, la trampa que su propio comentario documenta—
  muere con cuatro casos, dos de ellos en `pg.test.ts:97` y `:110`, más
  `crear_viaje_wa.test.ts` («el chofer 1,001 no es indistinguible de uno que no
  existe»). El archivo `pg.test.ts` prueba el techo de páginas, la página corta,
  el `count` y la fila que entra mientras se pagina.
- **`getAcumuladoCombustible` sí tiene arnés**, contra lo que sugiere que todos
  sus consumidores lo mockeen: `repo_acumulado.test.ts` trae una prueba de
  **equivalencia** (JS viejo vs. la RPC de la 0112) con 2,500 cargas, mezcla de
  formas de pago y gastos de otro tenant/ejercicio. N9 (intercambiar efectivo y
  total) muere con cinco casos.
- **La batería SQL corre y pasa de verdad en lo que sí califica.** Con Postgres
  16 virgen: **255 migraciones aplican limpias una por una**, y la batería da
  **182 bloques ok**. `ci-postgres.yml` no es decorativo: replica el andamio de
  Supabase, instala pgTAP, corre `wal_leases_fencing.sql` con `pg_prove` y lee el
  código de salida con `${PIPESTATUS[0]}` para no comerse el fallo.
- **Los antipatrones clásicos siguen en cero.** Barrido de los 708 archivos:
  **0** `expect(true).toBe(true)`, **0** snapshots, **0** `it.skip`/`it.todo`/`xit`.
  De **9,111** bloques `it(`/`test(` detectados, **uno solo** no contiene
  `expect` — `arnes_ticket_real.test.ts:234`, y ahí la aserción es una función
  que lanza (`afirmarFormaDeLiquidacion`). Los tres `skipIf` son condicionales,
  documentados y CI los recupera (`ci.yml:124`).
- **No hay red en las pruebas.** Ningún `await fetch(` en un `*.test.ts`; 53
  archivos stubean `fetch` explícitamente. Las dos aserciones de tiempo que
  quedan miden mejor-de-nueve contra un umbral tres órdenes de magnitud por
  encima del ReDoS que persiguen (`fundamento.test.ts:160-167`), con la razón
  escrita.
- **El anclaje por ID de hallazgo sigue vivo:** 25 citas de «AUDITORÍA 21», **24
  de la 22** y 6 de la 23 dentro de archivos de prueba.
- **El guardián global de filtro por tenant** (`supabase/pruebas-aislamiento/
  consultas_admin_filtran_tenant.test.ts`) sigue cubriendo una CLASE entera, y
  es lo que sostiene el aislamiento del camino real (service_role salta RLS).
- **`scripts/test-resiliencia.sh`**, que CI corre antes de la suite, ataca el
  restore drill con seis vectores reales (SHA alterado, conflicto sin
  `--overwrite`, `..` en el bucket, symlink padre del origen, symlink padre del
  destino, symlink del archivo final) y verifica que el destino no se tocó.
- **`qa-motor.ts`**, que la 22 dejó anotado como «no alcancé», se movió a
  `src/lib/admin/` y hoy tiene `qa-motor.test.ts`, `qa-panel.test.ts` y
  `qa-escenarios.test.ts`.

---

## Lo que NO alcancé a revisar

- **`processor.ts`** (2,874 líneas en `procesarTurno`) sigue sin una sola
  mutación dirigida — la 22 dijo que era donde ella buscaría en esta ronda y yo
  gasté el presupuesto en el export de póliza y en la batería SQL. Sigue siendo
  el hueco más grande de este rubro.
- **`repo.ts` fuera de `saveLiquidacion` y `getAcumuladoCombustible`**: quedan
  ~25 funciones (huérfanos, códigos pendientes, ARCO) sin mutación.
- **Los 17 bloques SIN CALIFICAR restantes**: probé que `FINANZAS_RLS` y
  `RPCS_0159` no reprueban; no verifiqué uno por uno si otro bloque cubre lo
  mismo, como sí pasó con `GASTO_FINANZAS_0146`. Puede haber más de los cuatro
  vectores que sí demostré, o menos.
- **`pruebas-navegador/`, `playwright.config.ts` y `e2e-navegador.yml`**: fuera
  de alcance por instrucción (no corro `npm run build` ni navegador).
- **El puntaje de mutación honesto de la suite**: mis 27 mutaciones son
  dirigidas. Un barrido automático sobre `src/lib/likida/` daría el número real y
  no cabía hoy.
- **`getLiquidacionesFiscales` (`fiscal.ts:1395`)**: lo abrí y no tiene ningún
  llamador en `src/` —`fiscal.test.ts:677` reimplementa sus cortes de fecha en
  vez de ejecutarla—, así que lo dejé fuera por impacto nulo hoy; si mañana una
  pantalla la usa, no hay red.

---

## Estado del árbol

```
$ git status --short
(vacío)

$ git log --oneline -2
92f28fa docs(auditoría 23): los 12 rubros, el tablero y la síntesis — global 5.4 (▼0.7)
fd80af1 fix(rendimiento): el informe del jefe paginaba sin ORDER BY (aud. 23, REN-1)
```

**No toqué ningún archivo del repo salvo este.** Todas las mutaciones se
aplicaron en un sandbox fuera del repo
(`…/scratchpad/sb`, copia de `master = c7c3d1c` con `node_modules` por symlink)
y cada una se restauró al terminar su corrida; las cuatro mutaciones SQL se
aplicaron sobre un Postgres efímero levantado para esta auditoría y también se
revirtieron; el Postgres efímero se apagó al terminar y nunca tocó nada del repo.

Advertencia para quien lea esto en frío: mientras yo medía, **otros agentes de
esta misma ronda commitearon a la rama** (`8e8b17f`, `c4787f7`, `fd80af1` y la
síntesis `92f28fa`). Mi línea base y las 27 mutaciones son contra **`c7c3d1c`**,
antes de esos cuatro commits. En particular `c4787f7` tocó
`cuadre/engine.ts` y `medio_pago_lisr27.test.ts`, que son el objetivo de D1;
D1 murió contra la versión de `c7c3d1c`.
