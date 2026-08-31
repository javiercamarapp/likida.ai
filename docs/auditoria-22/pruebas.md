# Pruebas — auditoría 22

**Nota: 7/10** (antes: s/d). Razón: línea base nueva, sin ancla previa legible
(`.gitignore` ignora `docs/auditoria-*/`). El 7 sale del criterio del rubro: el
anclaje histórico es ejemplar (25 citas de «AUDITORÍA 21» dentro de archivos de
prueba, cada arreglo con su ID de hallazgo) y **CI corre en cada push de cada
rama** con cobertura y trinquete — eso es el 8+. Lo que lo baja al 7 es lo
segundo del rubro, textual: *«hay zonas de dinero sin arnés»*. Las hay, y no son
periféricas: **el export de póliza —la promesa que encabeza la landing— no tiene
una sola prueba que ejecute su salida.**

**El riesgo mayor del rubro hoy:** el archivo que el contador de la flota importa
a CONTPAQi o a SAP se genera por un camino que la suite nunca ejecuta; sus dos
frenos y su numeración de pólizas se pueden romper con los 9,918 tests en verde.

## Cómo llegué a esto (método, para que se pueda repetir)

Copié el árbol a un sandbox (`node_modules` por symlink, sin tocar el repo) y
corrí **16 mutaciones dirigidas contra la suite COMPLETA**, no contra el archivo
vecino. Línea base del sandbox: 696 archivos, 9,916 pasan, 1 saltada, 106 s
(el archivo 697 es `arbol_sin_enlaces_ajenos.test.ts`, que falla por mi propio
symlink; se excluyó de las 16 corridas y de la base).

**10 muertas · 6 sobrevivientes.** Las 16 se eligieron adversarialmente —fui a
buscar donde el arnés se acaba—, así que 6/16 no es «el puntaje de mutación de
la suite»: es dónde termina la protección.

| # | Mutación | Resultado |
|---|---|---|
| M1 | `engine.ts`: el comprobado vuelve a sumar los duplicados | muerta (`copias_un_origen.test.ts`) |
| M2 | `engine.ts`: el IVA se acredita entero, sin la proporción deducible | muerta (`engine.test.ts`) |
| M3 | `engine.ts`: la base del peaje ignora el `@Descuento` | muerta (`peaje_medio_pago.test.ts`) |
| M4 | `facturacion_escritura.ts`: total = subtotal **−** IVA | muerta |
| M5 | `export.ts`: la fecha del CSV vuelve a ser UTC | muerta |
| M6 | `cuadre/cifras.ts`: `TOL = 1e9` (la guardia tolera cualquier cifra) | muerta (`guardia.test.ts`) |
| M10 | `proveedores.ts`: export de facturas **sin filtro de tenant** | muerta (guardián global, ver abajo) |
| M11 | `estadias/lector.ts`: políticas **sin filtro de tenant** | muerta (mismo guardián) |
| M14 | `repo.ts`: `saveLiquidacion` guarda comprobado y anticipo intercambiados | muerta |
| M15 | `repo.ts`: `saveLiquidacion` guarda IVA y peaje intercambiados | muerta |
| **M7** | `formatos.ts`: todas las pólizas del periodo con el **mismo número** | **SOBREVIVIÓ** |
| **M8** | `formatos.ts`: todas las pólizas con el **mismo JdtNum** | **SOBREVIVIÓ** |
| **M9** | `cola/route.ts`: la cola **re-timbra** gastos que ya tienen CFDI | **SOBREVIVIÓ** |
| **M12** | `export/poliza/route.ts`: exporta aunque la base gravable sea desconocida | **SOBREVIVIÓ** |
| **M13** | `export/poliza/route.ts`: exporta el archivo a medias en vez de 409 | **SOBREVIVIÓ** |
| **M16** | `estadias/lector.ts`: el pacto POR CLIENTE se lee como el de FLOTA | **SOBREVIVIÓ** |

Las 6 sobrevivientes caen en **tres módulos**, y los tres son dinero.

---

## Hallazgos

### [CRÍTICO] El export de póliza no tiene ninguna prueba que ejecute su salida: sus dos frenos se pueden quitar con la suite en verde

`src/app/api/export/poliza/route.ts:182` y `src/app/api/export/poliza/route.ts:204`

Su ÚNICO archivo de prueba es `src/app/api/export/poliza/rol_dinero.test.ts:55`
— 4 casos, todos sobre el rol (403 al encargado, 403 al operador, paso del
contador, paso del dueño). Ninguno mira el archivo que sale. Medido: **40.5% de
líneas y 27.3% de funciones ejecutadas** en toda la ruta.

Escenario, con las dos mutaciones que corrí contra la suite completa:

- **M12** — `:182` es el freno que bloquea cuando el XML no informó `SubTotal`
  («no se sustituye por el total porque duplicaría o mezclaría IVA»). Lo cambié
  por `const sinBase = []` —nunca bloquea— y los 9,916 tests siguieron verdes.
  Con esa línea rota, un renglón sin base entra a `polizaDeLiquidacion` como
  `Number(null)` → **subtotal 0**, la póliza cuadra igual (el residuo se va
  entero a la cuenta de «IVA/IEPS no acreditable») y el gasto se asienta con
  base cero e impuesto completo. El asiento importa sin protestar.
- **M13** — `:204` es el freno que devuelve 409 cuando alguna liquidación del
  periodo no se puede asentar («no se exporta el archivo a medias: un contador
  que importa la mitad cuadra a medias»). Lo cambié por `if (false)` y la suite
  siguió verde: el periodo se exporta con los viajes que sí se pudieron y sin
  decir cuáles faltan.

Refutación intentada: busqué en todo `src/` y `supabase/` cualquier otra prueba
que importe esa ruta. `grep -rln "export/poliza" --include="*.test.ts"` devuelve
exactamente un archivo, el de rol. No la hay.

**Consecuencia:** el contador de la flota importa a CONTPAQi/SAP un periodo
incompleto o con bases en cero, y lo descubre cuadrando el mes —o en la revisión
del año siguiente, que es justo lo que el encabezado de `poliza.ts` dice que este
módulo existe para evitar. Es la entrega que la landing pone primero.

**Causa raíz probable:** la ruta se probó por su puerta (rol/tenant, patrón de
`rutas_export.test.ts`) y nunca por su producto; la frontera de las pruebas
quedó en `polizaDeLiquidacion`, que sí está bien cubierta.

---

### [ALTO] `poliza.test.ts:190` y `:222` son tautológicos: pasan un número de póliza que nunca cotejan, y el archivo del ERP puede fundir el periodo entero en un solo asiento

`src/lib/likida/contabilidad/poliza.test.ts:190` y `src/lib/likida/contabilidad/poliza.test.ts:222`
(producción: `src/lib/likida/contabilidad/formatos.ts:90` y `:164`)

Los dos casos son los ÚNICOS que ejercen el camino multi-póliza, y los dos
llaman con **la misma póliza duplicada** y afirman sólo conteos de renglones:

```ts
const txt = archivoContpaqi([poliza, poliza], { tipo: 'Dr', numeroInicial: 20 });
expect(txt.match(/TipoMovimiento/g)).toHaveLength(1);
expect(txt.trim().split('\n')).toHaveLength(1 + poliza.movimientos.length * 2);
```

El `20` lo construye el propio test y no se afirma nunca. Rompe mentalmente
`formatos.ts:90` — `numero: (opts.numeroInicial ?? 1) + i` → `numero: opts.numeroInicial ?? 1`
— y las dos aserciones siguen valiendo: el conteo de encabezados no cambia y el
de líneas tampoco. Lo mismo en SAP: `formatos.ts:164`, `const jdtNum = i + 1`
→ `const jdtNum = 1`, y `expect(cabecera…).toHaveLength(4)` sigue en 4.

No es teoría: **M7 y M8 sobrevivieron a la suite completa.**

Refutación intentada: `formatos.ts` marca **100% de líneas** en el reporte de
cobertura, que es exactamente el caso que `vitest.config.ts` advierte («100% de
líneas con cero `expect` sigue siendo cero protección»). Grepeé los cuatro
símbolos (`archivoContpaqi`, `archivoSapB1`, `aSapB1`, `SAP_B1_BASE`) en todo
`src/`: fuera de producción sólo aparecen en `poliza.test.ts`.

**Consecuencia:** con `numero` constante, CONTPAQi importa las N liquidaciones
del mes como **una sola póliza**; con `JdtNum` constante, el DTW de SAP recibe
dos asientos con `Line_ID` repetidos ligados al mismo `JdtNum` —renglones que se
pisan o un rechazo del importador. En los dos casos el archivo se ve bien y el
error aparece dentro del ERP del cliente.

**Causa raíz probable:** la prueba se escribió para el hallazgo de *un solo
encabezado por archivo* y se quedó en la forma; nadie volvió a preguntarle al
archivo qué números trae.

---

### [ALTO] La cola de autofacturación tiene 0% de líneas ejecutadas y su única «prueba» es un grep del fuente — el guarda contra el doble CFDI no está probado

`src/app/api/cron/facturar/cola/route.test.ts:11` (producción: `src/app/api/cron/facturar/cola/route.ts:89`)

El archivo de prueba entero son 2 casos y no importa la ruta: lee `route.ts`
como texto y compara un número.

```ts
const leerMax = (ruta: string) => Number(readFileSync(ruta, 'utf8').match(/export const maxDuration = (\d+);/)?.[1]);
```

Cobertura medida de `cola/route.ts`: **0.0% de líneas, 0.0% de funciones,
0.0% de ramas.** Nada del `POST` corre nunca: ni la verificación de firma de
QStash, ni el kill switch (`estaApagado`), ni la re-validación del lote.

Escenario concreto: `:89` es `.is('cfdi_uuid', null)`, el filtro que impide
volver a timbrar un gasto que otra corrida ya facturó — el propio comentario lo
llama así («no se procesa un ticket que ya tiene CFDI»). Lo borré y corrí la
suite completa: **verde**. QStash reintenta con `retries: 2`; en un reintento el
lote entero vuelve a entrar al portal y se emite un **segundo CFDI** por el mismo
ticket de diésel.

Refutación intentada: `procesarLoteEnCola` sí está cubierta (vive en
`../route.ts`, 88.5% de líneas, `facturar/route.test.ts`). Lo que no lo está es
esta envoltura, que es la que corre en producción cuando el cron encola. Grepeé
`facturar/cola` en toda la suite: sólo su propio archivo.

**Consecuencia:** doble timbrado. El acto es irreversible ante el SAT, lo paga el
cliente en cancelaciones y en IVA acreditado dos veces, y es exactamente la
carrera que `al_vuelo.test.ts:906` documenta como «EL DOBLE CFDI» y protege en el
otro camino.

**Causa raíz probable:** la ruta se creó con la excusa de que su lógica «vive en
`../route.ts`»; las tres cosas que sólo viven aquí (firma, apagado,
re-validación) se quedaron sin dueño, y el archivo de prueba con el nombre
correcto tapó el hueco.

---

### [ALTO] La perilla de dinero de las estadías se lee por un camino al 2.4% de cobertura: el pacto de un cliente se puede tomar como el de la flota sin que nada enrojezca

`src/lib/likida/estadias/lector.ts:70` (consumo del monto: `src/lib/likida/estadias/motor.ts:170`, `monto: round2(horasCobrables * politica.tarifaHora)`)

`politicasDetencion` separa el pacto de flota (`cliente_id IS NULL`) del pacto
por cliente. `estadias/lector.ts` mide **2.4% de líneas**, y todos sus
consumidores lo **doblan**: `src/lib/likida/cotizador/lector.test.ts:73` y
`src/lib/likida/briefing_inicio_wa.test.ts:29` lo mockean. No existe
`lector.test.ts`.

Invertí la condición de `:70` (`=== null` → `!== null`) y corrí la suite
completa: **verde**. Con eso, `flota` queda cargada con el pacto de un cliente
cualquiera y `porCliente` se indexa bajo la llave `"null"`.

Refutación intentada: `estadias/motor.test.ts` sí prueba el cálculo del cargo, y
el guardián global de tenant sí mata quitar el `.eq('tenant_id')` (M11 muerta).
El reparto flota/cliente no lo cubre nadie.

**Consecuencia:** `cotizador/lector.ts:396` («el pacto del cliente gana sobre el
de flota») cotiza al Cliente A con la `tarifa_hora` pactada con el Cliente B, y
el panel de estadías propone cobrarle esa detención. Es una cifra que sale
firmada hacia afuera de la flota.

**Causa raíz probable:** el módulo se partió bien (motor puro + lector de base),
se probó el puro y el lector quedó sólo como mock de sus consumidores.

---

### [MEDIO] La aserción que da nombre a `poliza.test.ts` («el asiento cuadra al centavo») no puede fallar: la garantiza la propia función

`src/lib/likida/contabilidad/poliza.test.ts:44` (y el mismo patrón en `:112`)

```ts
expect(r.ok).toBe(true);          // :40
if (!r.ok) return;
const cargos = …; const abonos = …;
expect(cargos).toBeCloseTo(abonos, 2);   // :44  ← no puede ponerse roja
```

`poliza.ts:204` devuelve `{ok:false}` ante cualquier descuadre > 0.01. O sea:
mientras `:40` pase, `:44` pasa por construcción. No existe mutación que ponga
roja `:44` sin poner roja `:40` primero.

No es inofensivo por lo que hace, sino por lo que **aparenta**: el archivo se
lee como si verificara la aritmética del asiento cuando lo que verifica es que
el módulo no se auto-rechace. La única aserción que trabaja en ese caso es `:40`.

**Consecuencia:** para quien mantiene el archivo, «cuadra al centavo» ya está
probado — y el chequeo real (que los cargos correspondan a los conceptos, no que
sumen lo mismo que los abonos) nunca se escribió. Es el terreno donde nacieron
M7 y M8.

**Causa raíz probable:** se afirmó la postcondición que el código ya impone, en
vez del valor esperado independiente.

---

### [MEDIO] El guardián de crons no mira las rutas anidadas, y su `catch { continue }` haría invisible que un `route.ts` desaparezca

`src/lib/auth/cron.test.ts:55`

```ts
const rutas = readdirSync(CRONS).filter((d) => !d.includes('.'));
…
try { texto = readFileSync(join(CRONS, r, 'route.ts'), 'utf8'); } catch { continue; }
```

Sólo lee el primer nivel. Hoy existen dos rutas de cron anidadas —
`src/app/api/cron/facturar/cola/route.ts` y
`src/app/api/cron/wa-pendientes/cola/route.ts` — que este guardián **nunca
abre**. Y el `catch { continue; }` es el mecanismo que lo esconde: si mañana un
directorio de cron mueve su handler a un subdirectorio, la lectura falla, el
`continue` se lo traga y la ruta sale del escaneo **sin bajar el conteo de
pruebas ni poner nada rojo** — el mismo modo de falla silenciosa que
`dinero_por_area.test.ts` ya documenta haber pisado dos veces («se descubrieron
por casualidad»).

**Consecuencia:** el día que una de esas rutas anidadas maneje `CRON_SECRET`, la
regla «nunca comparar el secreto con `===`» dejará de aplicarle sin aviso. Hoy
las dos van firmadas por QStash, así que el daño es potencial, no actual.

**Causa raíz probable:** un escaneo por directorio de primer nivel escrito
cuando todas las rutas de cron eran planas.

---

### [BAJO] El doble de `exportarAprobadas` devuelve un campo que la función real ya no tiene

`src/app/api/export/rutas_export.test.ts:96` (real: `src/lib/likida/proveedores.ts:476`)

```ts
const exportarAprobadas = vi.fn(async () => ({ filas: [{ a: 1 }], ids: ['f-1'], recortado: false }));
```

`recortado` desapareció del contrato con ESC-8 (`route.ts:69-70` lo dice:
«un `recortado` que jamás se cumplía»). El doble sigue devolviéndolo. `vi.mock`
con fábrica no se verifica contra la firma real, así que el único «contrato» que
esa prueba de ruta ve es un objeto escrito a mano que ya no describe nada.

**Consecuencia:** hoy, ninguna — el campo se ignora. Importa como señal: el
doble puede alejarse de la producción sin que nada lo note, y esa prueba es la
que cubre el 70% de `facturas-proveedor/route.ts`.

**Causa raíz probable:** los dobles se escriben a mano y nada los ata al tipo de
la función que sustituyen.

---

## Los caminos de dinero y su cobertura real

| Camino | Producción | Prueba que lo cubre |
|---|---|---|
| Cuadre: comprobado, duplicados, diferencia | `src/lib/likida/cuadre/engine.ts:351` | **REAL** — `src/lib/likida/cuadre/engine.test.ts` (124 casos) + `cuadre/copias_un_origen.test.ts:1`. M1 muerta |
| Cuadre: IVA acreditable en proporción (LIVA 5-I) | `src/lib/likida/cuadre/engine.ts:1327` | **REAL** — `src/lib/likida/cuadre/engine.test.ts` («el viático que excede el tope acredita su IVA EN PROPORCIÓN»). M2 muerta |
| Cuadre: base del estímulo de peaje | `src/lib/likida/cuadre/engine.ts:1363` | **REAL** — `src/lib/likida/cuadre/peaje_medio_pago.test.ts` («$1,000 − $150 → $425»). M3 muerta |
| Guardia: cifra sin respaldo de tool | `src/lib/likida/cuadre/cifras.ts:167` | **REAL** — `src/lib/likida/cuadre/guardia.test.ts`. M6 muerta |
| Liquidación: el PDF que archiva el contralor | `src/lib/likida/liquidacion/pdf.ts` | **REAL y ejemplar** — `src/lib/likida/liquidacion/pdf_cifras.test.ts:112` lee el PDF renderizado y ata etiqueta↔monto por coordenada; incluye una prueba de control del propio extractor (`:115`) |
| Liquidación: la escritura del dinero | `src/lib/likida/repo.ts:994` (`saveLiquidacion`) | **REAL** — M14 y M15 (parámetros de la RPC intercambiados) mueren |
| Export CSV de liquidaciones (keyset, escritura concurrente) | `src/app/api/export/liquidaciones/route.ts:98` | **REAL** — `src/app/api/export/rutas_export.test.ts:30` interpreta el filtro keyset de verdad; 95.7% de líneas |
| Export CSV: la fecha del ERP en día de México | `src/lib/likida/export.ts:32` | **REAL** — `src/lib/likida/export.test.ts`. M5 muerta |
| CFDI a cliente: total = subtotal + IVA | `src/lib/likida/facturacion_escritura.ts:154` | **REAL** — `src/lib/likida/facturacion_escritura.test.ts`. M4 muerta |
| Póliza: el cálculo del asiento | `src/lib/likida/contabilidad/poliza.ts:98` | **REAL** — `src/lib/likida/contabilidad/poliza.test.ts:84` ancla el ALTO de la 21 con el escenario exacto (con la salvedad tautológica de `:44`) |
| **Póliza: la numeración del archivo del ERP** | `src/lib/likida/contabilidad/formatos.ts:90` y `:164` | **NINGUNA** — `poliza.test.ts:190` y `:222` sólo cuentan renglones. M7 y M8 sobreviven |
| **Póliza: la ruta HTTP que la entrega** | `src/app/api/export/poliza/route.ts:182`, `:204` | **NINGUNA** salvo el rol (`rol_dinero.test.ts:55`, 4 casos). M12 y M13 sobreviven |
| **CFDI: la cola de autofacturación (QStash)** | `src/app/api/cron/facturar/cola/route.ts:89` | **NINGUNA** — 0% ejecutado; `cola/route.test.ts:11` sólo grepea el fuente. M9 sobrevive |
| **Estadías: el pacto que fija el cargo por detención** | `src/lib/likida/estadias/lector.ts:70` | **NINGUNA** — 2.4% ejecutado, mockeado por sus dos consumidores. M16 sobrevive |
| Export de facturas de proveedor al ERP | `src/lib/likida/proveedores.ts:476` | **PARCIAL** — `proveedores_export.test.ts` cubre la paginación y el filtro; los formateadores (`proveedores.test.ts:99`) sí; la ruta se prueba con el módulo doblado |

---

## Lo que revisé y está bien

- **Los antipatrones clásicos casi no existen.** Barrido completo de los 697
  archivos: **0** `expect(true).toBe(true)`, **0** snapshots (`toMatchSnapshot`
  / `toMatchInlineSnapshot`), **0** `it.skip` / `it.todo` / `xit` acumulados.
  Los tres `skipIf` que hay son condicionales y documentados
  (`normas/fundamento.test.ts:148`, `duplicados.test.ts:185` —umbrales de
  tiempo que la instrumentación de cobertura falsea— y
  `arnes_ticket_real.test.ts:371`, que se apaga sin fixtures reales), y CI los
  vuelve a correr sin instrumentar (`ci.yml:124`, `npx vitest run fundamento duplicados`).
- **Nadie mockea la función bajo prueba.** Escaneé los 1,532 `vi.mock` buscando
  el módulo homónimo del archivo de prueba: un solo acierto real
  (`cotizador/lector.test.ts:73` dobla `../estadias/lector`, que es su
  dependencia, no su sujeto). El otro «acierto» estaba dentro de un comentario.
- **Aserciones sobre el mock:** 402 casos cuyo único `expect` toca un mock, pero
  sólo **12 de 9,918** se conforman con un `toHaveBeenCalled()` pelón sin
  argumentos; el resto usa `toHaveBeenCalledWith` con valores reales o el
  negativo `not.toHaveBeenCalled()`, que sí muerde. No es un problema sistémico.
- **`toBeDefined()` (67 usos) no es el antipatrón de la lista:** en todos los que
  abrí son guardas de un `.find()` seguidas de la aserción de verdad, casi
  siempre con mensaje (`expect(d, 'no se levantó la diferencia').toBeDefined()`).
- **Hay un guardián global del filtro por tenant** —
  `supabase/pruebas-aislamiento/consultas_admin_filtran_tenant.test.ts` — que
  escanea TODA consulta con `supabaseAdmin` contra tablas con `tenant_id` y
  exige el filtro o una exención con razón escrita. Mató M10 y M11 sin que
  existiera una prueba de comportamiento para ninguna de las dos funciones. Es
  el mejor tipo de prueba-de-fuente que hay en el repo: cubre una CLASE entera.
- **`pdf_cifras.test.ts` es el estándar que el resto debería alcanzar:** extrae
  los renglones dibujados del PDF con su coordenada, ata etiqueta↔monto, y trae
  una prueba de control (`:115`) que falla si el extractor deja de leer — o sea,
  se defiende de volverse tautológico. Nombra las mutaciones que lo originaron
  (M10, M11 de la ronda 5) en el comentario.
- **El anclaje por ID de hallazgo es real:** 25 citas de «AUDITORÍA 21» dentro de
  archivos de prueba, 76 de la 18, 35 de la 10. Los arreglos de la 21 que
  verifiqué tienen su prueba con el escenario numérico exacto
  (`poliza.test.ts:71-126` para el IVA no acreditado; `rutas_export.test.ts:60`
  para la escritura concurrente 21-b2).
- **CI corre en cada push de cada rama** (`ci.yml:21`, `branches: ['**']`), con
  `typecheck`, `lint:ratchet`, `test:coverage` con umbrales, la re-corrida de
  las pruebas de tiempo, `build` y smoke de navegador. No necesita secretos
  porque la suite es offline por diseño; los arneses que gastan dinero viven
  fuera del include de vitest.
- **La cobertura está medida y con trinquete** (`vitest.config.ts`: 78 líneas /
  69 ramas / 82 funciones). Medido hoy: **83.6% líneas · 70.9% ramas · 84.2%
  funciones**. Y el propio archivo advierte, por escrito, que esto no sustituye
  la mutación dirigida — advertencia que mis 6 sobrevivientes confirman
  (`formatos.ts` está al **100% de líneas** y dejó pasar dos).
- **Intermitencia:** sólo 14 archivos tocan relojes falsos y las aserciones de
  tiempo absoluto que quedan (`regex_sin_redos.test.ts:57`,
  `pagina_playwright.test.ts:347`) toman el mejor de tres corridas o miden
  cocientes, no absolutos frágiles. Corrí la suite completa 17 veces (base +
  16 mutaciones) sin un solo fallo intermitente.

---

## Lo que NO alcancé a revisar

- **`src/lib/likida/qa-motor.ts` (714 líneas, 44.7%)** y
  `src/lib/admin/qa-*`: el motor de QA nocturno. Es infraestructura de pruebas
  que a su vez casi no está probada; no llegué a decidir si eso importa.
- **`src/lib/likida/jornada/repo.ts` (117 líneas, 3.4%)** y
  `src/lib/likida/perfil/entrevista*.ts` (0% y 28.8%): fuera del camino de
  dinero, no los mutulé.
- **`processor.ts` (932 líneas, 80.4% líneas / 70.3% ramas)**: la máquina de
  estados de WhatsApp. Es el archivo más grande del motor y el más tocado por la
  ronda 21; no le corrí mutaciones por presupuesto de tiempo. Es donde yo
  buscaría primero en la ronda 23.
- **`repo.ts` al 63.7% de líneas y 63.3% de ramas**: probé las dos escrituras de
  dinero (`saveLiquidacion`, M14/M15, ambas muertas) pero no las ~25 funciones
  restantes (huérfanos, códigos pendientes, ARCO).
- **`supabase/verificaciones.sql`** y las pruebas de `ci-postgres.yml`: no las
  corrí (necesitan Postgres) ni las leí a fondo.
- **`pruebas-navegador/` y `playwright.config.ts`**: fuera de alcance por
  instrucción (no corro build ni navegador).
- **El «puntaje de mutación» de la suite entera**: mis 16 mutaciones fueron
  dirigidas y adversariales. Un barrido automático sobre `src/lib/likida/` daría
  el número honesto; no cabía en esta ronda.
