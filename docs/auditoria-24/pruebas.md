# Pruebas — auditoría 24

**Nota: 7/10** (antes 7). Razón del movimiento: **se atacó y subió** — la suite
es medibly más dura (de 8 sobrevivientes sobre 9 en la ronda 22 a 6 sobre 24
aquí, y **0 sobre las 14 mutaciones dirigidas al motor del dinero**), y PRU-1
está cerrado de verdad, con dos mutaciones que lo matan. No sube de 7 porque el
mismo trabajo destapó lo contrario en la otra mitad del rubro: **la compuerta
no corrió ni una vez sobre el árbol que este PR propone mergear**, y toda la
regla de dinero que se mudó a SQL quedó fuera del alcance de `npm test`.

Riesgo mayor hoy: las pruebas están bien; **la puerta que las corre, no**. En el
sha auditado, `npm test` (819 archivos) no se ejecutó en CI ni una sola vez, y
las garantías de dinero que viven en Postgres (`registrar_pago_tx`,
`cancelar_factura_tx`, `revisar_liquidacion`, `gasto_no_tras_liquidar`) cuelgan
de un solo paso de un workflow que ninguna prueba vigila.

## Mutaciones

**24 dirigidas · 18 muertas · 6 sobrevivientes.**

Método: editar el archivo real, correr un subconjunto acotado de `vitest`,
restaurar. Cada sobreviviente se corrió además contra TODO archivo de prueba que
pudiera verlo (derivado por `grep`, no por nombre de carpeta).

| # | Mutación | `archivo:línea` | Resultado |
|---|---|---|---|
| M1 | `proporcion` del IVA acreditable fijo en 1 (ignora el tope de LISR 28-V) | `src/lib/likida/cuadre/engine.ts:1569` | muerta (2 archivos, 5 casos) |
| M2 | `elegiblePeaje === true` → `!== false` (undefined abre el estímulo) | `src/lib/likida/cuadre/engine.ts:1624` | muerta |
| M3 | tolerancia de litros de diésel `0.5×–2×` → `0.005×–200×` | `src/lib/likida/cuadre/engine.ts:1672` | muerta |
| M4 | base del estímulo de peaje sin restar `@Descuento` | `src/lib/likida/cuadre/engine.ts:1626` | muerta (3 casos) |
| M5 | `evaluarAbono` deja de rechazar el sobrepago | `src/lib/likida/facturacion_escritura.ts:261` | muerta — **pero ver hallazgo MEDIO: la función no tiene llamador en producción** |
| M6 | `traerTodo` devuelve tras la 1ª página (`>= esperadas` → `> 0`) | `src/lib/likida/pg.ts:204` | muerta (11 archivos, 74 casos) |
| M7 | página vacía SIEMPRE devuelve (recorte silencioso con `count` conocido) | `src/lib/likida/pg.ts:206-213` | muerta (2 casos) |
| M8 | `normalizarAjustes` sin tope de $1,000,000 | `src/lib/likida/revision.ts:347` | muerta |
| M9 | la póliza se exporta aunque cargos ≠ abonos (`> 0.01` → `> 1e9`) | `src/lib/likida/contabilidad/poliza.ts:300` | **SOBREVIVE** |
| M10 | `saveLiquidacion` manda `totalComprobado`/`totalAnticipo` intercambiados | `src/lib/likida/repo.ts:1076-1077` | muerta |
| M11 | «éxito del PAC sin timbre legible» pasa de `red` a `rechazado` | `src/lib/likida/pac/sw.ts:176` | muerta |
| M12 | CONTPAQi invierte `tipoMovimiento` (0=cargo/1=abono) | `src/lib/likida/contabilidad/formatos.ts:67` | muerta (2 archivos, 7 casos) |
| M13 | el cursor del export pierde el desempate `.order('id')` | `src/app/api/export/liquidaciones/route.ts:133` | muerta |
| M14 | tolerancia de respaldo de cifras `0.011` → `1000` | `src/lib/likida/cuadre/cifras.ts:117` | muerta (5 casos) |
| M15a | `.eq('tenant_id', tenantId)` → `.not('tenant_id','is',null)` | `src/lib/likida/sat_descarga/escritura.ts:98` | **SOBREVIVE** (límite declarado del escáner) |
| M15b | el mismo filtro **borrado** entero | `src/lib/likida/sat_descarga/escritura.ts:98` | muerta (capa 2 lo caza) |
| M16 | `calificar()` nunca devuelve `falla` | `scripts/ci/calificar-verificacion.mjs:200` | muerta (2 casos) |
| M17 | el runner deja de salir 1 ante `sin_calificar` | `scripts/ci/correr-verificaciones.mjs:191` | muerta |
| M18 | el límite de tasa falla ABIERTO cuando Redis no contesta | `src/lib/ratelimit.ts:290` | muerta (6 casos) |
| M19 | el PDF invierte a favor de quién es la diferencia | `src/lib/likida/liquidacion/pdf.ts:386-387` | muerta (2 casos) |
| M20 | la compuerta de deploy tolera 3 migraciones de atraso (`> 0` → `> 3`) | `scripts/ci/compuerta-deploy.mjs:80` | **SOBREVIVE** |
| M21 | se borra de la 0300 la mitad que aportó la 0283 (mover un gasto fuera de un viaje liquidado) | `supabase/migrations/0300_gasto_no_tras_liquidar_reconciliado.sql:60-70` | **SOBREVIVE** (21 archivos que leen migraciones, verdes) |
| M22 | el trinquete de lint nunca reprueba (`if (...)` → `if (false)`) | `scripts/ci/lint-ratchet.mjs:62` | **SOBREVIVE** |
| M23 | se borra de `ci-postgres.yml` el paso «Capa 1 — batería de aislamiento» | `.github/workflows/ci-postgres.yml:191-199` | **SOBREVIVE** |

Los seis sobrevivientes **no están en el motor del dinero**: están en las
compuertas (M20, M22, M23), en la mitad SQL del dinero (M21) y en dos frenos
defensivos sin una sola aserción (M9, M15a). Es un mapa distinto al de la
ronda 22 y vale la pena leerlo así: el cálculo está probado; **lo que decide si
las pruebas corren, no**.

## Hallazgos

### [CRÍTICO] La compuerta de CI muere antes de correr una sola de las 819 pruebas
`.github/workflows/ci.yml:94-95` (paso Typecheck) contra `.github/workflows/ci.yml:129-144` (paso Build)

Escenario: el paso `Typecheck` corre `npm run typecheck` — que en el sha
auditado es `"typecheck": "tsc --noEmit"` (`package.json:20`, verificado con
`git show 49ecf93:package.json`) — **sin `NODE_OPTIONS`**. El único paso del
workflow que declara techo de heap es el `Build`, siete pasos más abajo
(`NODE_OPTIONS: --max-old-space-size=6144`, línea 144). En el runner
`ubuntu-24.04` el heap por defecto de Node 22 queda ~2 GiB y `tsc` en frío pica
en ~2.7 GiB: `FATAL ERROR: Ineffective mark-compacts near heap limit`, exit 134,
en las dos corridas del PR #303. Como los pasos son secuenciales y ninguno de
los siguientes lleva `if: always()`, **Lint, `test-resiliencia.sh`,
`npm run test:coverage`, las pruebas de tiempo, el Build y el smoke de
Playwright quedan `skipped`**. Entra: un push a `aud24/integracion` → sale: cero
pruebas ejecutadas, cero cobertura evaluada, y el cuerpo del PR afirmando
«`tsc --noEmit`: limpio».

Por qué el modo de falla es invisible: `tsconfig.json:22` tiene
`"incremental": true` y `tsconfig.tsbuildinfo` está ignorado, así que en local
el typecheck corre CALIENTE y en CI siempre en FRÍO — el caso que revienta es
justo el que en la máquina del autor no se da.

Consecuencia: los 188 commits de esta ronda —24 migraciones, el motor fiscal,
las policies RLS, la cola de revisión— llegan al merge con la palabra del autor
como única verificación. El contralor que ve un número mal en la sala lo va a
ver porque la compuerta que existía para atraparlo no llegó a arrancar.

Causa raíz probable: el techo de heap se declaró en el paso que lo necesitaba
(Build) en vez de en el script de npm que los dos workflows comparten
(`ci.yml:95` y `deploy-preview-promote.yml:82`).

*Nota de honestidad: mientras auditaba, otra sesión escribió en el árbol de
trabajo el arreglo (`package.json` con `--max-old-space-size=6144` y una prueba
nueva en `src/lib/likida/pruebas_en_ci.test.ts:99-145` que exige ≥ 4096 y que
los dos workflows entren por el script). La verifiqué y es correcta. El hallazgo
se reporta igual porque describe el sha 49ecf93, que es el árbol que el PR #303
propone mergear.*

### [ALTO] La regla del dinero se mudó a SQL y `npm test` ya no puede verla — la colisión 0283/0299 se repite sin que nada se ponga rojo
`supabase/migrations/0300_gasto_no_tras_liquidar_reconciliado.sql:60-70`, `src/lib/likida/facturacion_escritura.ts:604-612`, `src/lib/likida/revision.ts:367-378`

Escenario (M21, medido): borro de la 0300 el bloque
`if tg_op = 'UPDATE' and old.viaje_id is distinct from new.viaje_id then …` —
exactamente la mitad que la 0299 se comió al hacer `create or replace` partiendo
de un cuerpo viejo. Corro **los 21 archivos de prueba del repo que leen
`supabase/migrations/`**: 320 casos, todos verdes. Con esa mutación, mover un
gasto de $58,000 DESDE un viaje ya liquidado HACIA uno abierto pasa limpio, y el
PDF que el contralor ya firmó afirma una cifra que la base ya no puede
reproducir.

No es hipotético: es lo que **ya ocurrió** entre la 0283 (fiscal) y la 0299
(revisión) en esta misma ronda, y no lo atrapó ninguna prueba — lo atrapó la
batería SQL al correr las dos migraciones en orden contra Postgres real, durante
la integración. Lo mismo aplica a las tres decisiones de dinero que este ciclo
sacó de TypeScript: `registrar_pago_tx` (sobrepago, saldo, `estatus='pagada'`),
`cancelar_factura_tx` y `revisar_liquidacion` (recálculo de `total_comprobado` y
`diferencia`). Los tres son ahora una llamada `rpc()` en TS; el juicio vive en
SQL, y `npm test` solo puede probar que la llamada se hizo.

Consecuencia: la mitad de la lógica de dinero solo se demuestra en un job
distinto (`ci-postgres.yml`), y la única red que hay contra esta familia de
regresión es puntual y de un solo nombre de función
(`src/lib/likida/arco_search_path.test.ts`, que vigila
`ejecutar_arco_cancelacion` y nada más). No existe la red general: «dos
migraciones que redefinen la misma función, la última partiendo de un cuerpo
que no incluye lo que la anterior agregó».

Causa raíz probable: el trabajo se repartió por rama sin un invariante que
detecte, en el árbol fusionado, dos `create or replace function` del mismo
identificador con cuerpos divergentes.

### [ALTO] La compuerta de despliegue solo está probada con 5 migraciones de atraso; el caso de 1 —el único que ocurre— no
`scripts/ci/compuerta-deploy.mjs:79-85` · `scripts/ci/compuerta_deploy_aud24.test.ts:13-18`

Escenario (M20, medido): cambio `if (atras > 0)` por `if (atras > 3)`. Los 5
archivos de `scripts/ci` (51 casos) siguen **verdes**. La única prueba del
umbral usa `base 0271, código 0276` → `atras = 5`, que sigue bloqueando con el
`> 3`. El caso frontera (`atras` de 1, 2 o 3) no lo toca nadie.

Con la mutación, un push con `[deploy]` cuando la base está en `0298` y el
código llega a `0299` devuelve `{ construir: true, nivel: 'ok' }` y Vercel
publica. Lo que sale a producción es el panel de revisión llamando al RPC
`revisar_liquidacion`, que en esa base todavía no existe: PostgREST devuelve
404, `revisarLiquidacion` lanza (`revision.ts:386`), y **la pantalla de revisión
de liquidaciones truena para todas las flotas**. Y en este repo las migraciones
entran de una en una: `atras = 1` es el caso normal, no el raro.

Consecuencia: la compuerta que existe para que el código no se adelante a la
base está probada exactamente en el escenario que no ocurre.

Causa raíz probable: la prueba se escribió desde el ejemplo del hallazgo
(0271→0276) y no desde el contrato (`atras > 0`).

### [MEDIO] `ci-postgres.yml` es la única puerta de todo el dinero en SQL y ninguna prueba fija que siga existiendo
`.github/workflows/ci-postgres.yml:191-199`

Escenario (M23, medido): borro el paso «Capa 1 — batería de aislamiento (RLS
estático + dinámico)» del workflow. Corro los 8 archivos de prueba que leen
`.github/workflows/` (`scripts/ci/*`, `pruebas_en_ci.test.ts`,
`runbook.test.ts`, `migraciones_verificadas.test.ts`): 71 casos, todos verdes.
Ninguna prueba del repo abre `ci-postgres.yml` — el único lugar donde ese nombre
aparece es dentro de una cadena de prosa en `migraciones_verificadas.test.ts:57`.

Consecuencia: se pueden apagar de un tirón los 226 bloques de ataque
(`verificaciones.sql` + `capa1_auditoria_estatica.sql`), las 279 migraciones
sobre base virgen y el pgTAP de leases, y el PR sale verde. Es la misma clase de
fallo que PRU-1 (una compuerta que se puede volver decorativa sin que nada
suene), un nivel más arriba: no el trinquete de un runner, el runner entero.
`pruebas_en_ci.test.ts` ya hace exactamente este trabajo para `ci.yml`; no lo
hace para `ci-postgres.yml`.

Causa raíz probable: `pruebas_en_ci.test.ts` nació para el hueco de las pruebas
de tiempo y se quedó anclado al workflow donde se descubrió.

### [MEDIO] Seis pruebas de dinero sobre una función que producción no llama
`src/lib/likida/facturacion_escritura.ts:245-263` · `src/lib/likida/facturacion_escritura.test.ts:102-133`

Escenario: `evaluarAbono` —las cuatro reglas del abono: cancelada, borrador,
pagada, sobrepago— **no tiene un solo llamador en `src/`**. Verificado:
`grep -rn "evaluarAbono" src` fuera de pruebas devuelve tres líneas, y las tres
son su propia definición y dos comentarios (`facturacion_escritura.ts:245`,
`:597`, `formato.ts:121`). La decisión real la toma `registrar_pago_tx` en SQL
(`facturacion_escritura.ts:604`), y este archivo solo TRADUCE el motivo que la
base devuelve (`traducirErrorDelPago`, `:511-519`).

La mutación M5 (quitar el rechazo por sobrepago) pone en rojo 1 caso — o sea que
la prueba «funciona». Pero lo que protege es una copia muerta de la regla: un
cambio en el SQL que permitiera abonar $20,000 contra un saldo de $11,600 deja
esas 6 pruebas en verde.

Consecuencia: el tablero dice que el sobrepago está probado en TS. Lo está el
texto del mensaje; la decisión, no. Quien lea la suite para saber si el dinero
está cubierto sacará la conclusión contraria a la verdad.

Causa raíz probable: la migración de la lógica al RPC (DAT-05) dejó la función
pura como referencia y nadie borró ni re-apuntó sus pruebas.

### [MEDIO] El freno final de la póliza no tiene una sola aserción — y la prueba que dice cubrirlo prueba otra rama
`src/lib/likida/contabilidad/poliza.ts:300-308` · `src/lib/likida/contabilidad/poliza.test.ts:48-58`

Escenario (M9, medido): cambio `if (Math.abs(cargos - abonos) > 0.01)` por
`> 1e9`. Los 9 archivos de `contabilidad/` + `api/export/poliza/` (71 casos)
siguen **verdes**. Y `grep -rn "no cuadra: cargos" src --include="*.test.ts"` no
devuelve nada: **ninguna prueba del repo llega a esa rama**. La prueba que se
llama «un asiento que NO cuadra se NIEGA» (`poliza.test.ts:48`) entra por la
otra puerta — la de `impuestoNoAcreditado < -0.01` (`poliza.ts:249`).

Que la rama es alcanzable lo verifiqué con una sonda temporal (creada, corrida y
borrada): 5 conceptos de `subtotal: 100.005` con `anticipo 1000`,
`ivaAcreditable 80`, `diferencia 419.97` produce
`cargos 1000.02 vs abonos 1000.00` — los cargos se redondean uno por uno
(`poliza.ts:145`) y `subtotalDeclarado` una sola vez sobre la suma cruda
(`poliza.ts:203-204`). Es la aritmética normal de un CFDI cuyo SubTotal sale de
despejar el 16% de un importe bruto.

Con la mutación, esa póliza descuadrada por dos centavos se exporta a CONTPAQi o
a SAP B1 y el ERP rechaza el lote entero sin decir qué renglón.

Consecuencia: el último freno antes de que un archivo entre al ERP del cliente
está sin arnés; el nombre de la prueba vecina hace creer lo contrario.

Causa raíz probable: la prueba se escribió contra el mensaje («no cuadra») y no
contra la rama, y las dos ramas comparten esa frase.

### [MEDIO] El trinquete de ESLint SUBIÓ en esta rama (166 → 173) y nada lo impide ni lo prueba
`ci/eslint-warnings-baseline.json` · `scripts/ci/lint-ratchet.mjs:62-69`

Escenario: `git show 615496d:ci/eslint-warnings-baseline.json` da
`totalWarnings: 166` con 85 entradas; el archivo en `49ecf93` da **173 con 91
entradas**. Subieron 8 entradas (commits `4c5819d` «regenera los ratchets» y
`6b7a500`), una de ellas en producción:
`src/lib/likida/intake/cfdi_imagen.ts::security/detect-non-literal-fs-filename`
(0 → 1). El propio encabezado del script dice «no permite que aumenten», pero el
`--write` regenera el baseline hacia arriba sin que nada lo señale.

Y M22 (medido): cambio `if (errors || warnings > baseline || nuevos.length)` por
`if (false)` — el trinquete deja de reprobar por completo. Los 6 archivos de
prueba que se acercan (51 + 21 casos) siguen verdes: **`lint-ratchet.mjs` no
tiene ni una prueba**; el único sitio que lo nombra es un comentario en
`src/lib/likida/limite_con_orden.test.ts:34`.

Consecuencia: el trinquete que la casa usa como patrón («se baja, no se sube»)
es hoy nominal en su instancia de lint. Es la misma forma exacta de
`SIN_CALIFICAR_CONOCIDOS` que PRU-1 acaba de cerrar en el runner de SQL —
REINCIDENTE en clase, no en archivo. (El otro trinquete, `ci/limite-sin-orden-baseline.json`,
sí bajó: 213 → 204.)

Causa raíz probable: el mecanismo de regeneración no distingue «bajé la deuda» de
«congelé deuda nueva», y no hay prueba que compare el baseline contra su
antecesor.

### [BAJO] 49 cadenas pasan la capa 2 de aislamiento por MENCIONAR `tenant_id`; 19 archivos lo hacen sin exención escrita
`supabase/pruebas-aislamiento/consultas_admin_filtran_tenant.test.ts:312` (`if (/tenant_id/.test(ventana)) continue;`)

Escenario (M15a, medido): en
`src/lib/likida/sat_descarga/escritura.ts:98` cambio
`.eq('tenant_id', tenantId)` por `.not('tenant_id','is',null)`. El UPDATE deja
de anclar a una flota y borra `certificado_numero`/`certificado_vence_en` de
**todas** las flotas cada vez que una verifica su e.firma. Los 10 archivos de
`pruebas-aislamiento/` + `sat_descarga/` (166 casos) siguen verdes. (Borrar el
filtro entero —M15b— sí lo caza: la diferencia es solo la palabra.)

Medido sobre el árbol: **49 cadenas en 32 archivos** mencionan `tenant_id` sin
usarlo en ninguna posición de filtro (casi todas por ser una columna del
`select`). De esos 32 archivos, **19 no tienen entrada en el `ALLOWLIST`** —
entre ellos `src/lib/likida/agentes/faq.ts` (lee `ticket_soporte` de todas las
flotas), `src/lib/admin/escalaciones.ts` (`incidencia`, `factura_proveedor`) y
`src/lib/likida/relojes_legales.ts` (5 tablas). Casi todas son barridos de cron
legítimamente cross-tenant; el punto es que **pasan sin declararlo**, y el propio
archivo dice que «una exención sin motivo es la misma falsa confianza que esta
prueba existe para quitar» (`:275-277`).

Consecuencia: la lista de exenciones —que es el valor real de esta red, porque
obliga a escribir por qué— no cubre a 19 archivos que de hecho cruzan flotas. El
día que uno de esos barridos empiece a recibir un id por parámetro, no hay quien
lo note.

Causa raíz probable: el escáner declara este límite en su encabezado (`:32-36`)
y lo trata como aceptable; con 49 casos ya no es un residuo, es la mitad del
mecanismo.

## Lo que revisé y está bien

- **PRU-1 está CERRADO de verdad, no inerte.** `scripts/ci/correr-verificaciones.mjs:171-201`:
  `SIN_CALIFICAR_CONOCIDOS` desapareció (el `git show 069fa92 --stat` lo confirma:
  −290 líneas en ese archivo) y `sinCalificar > 0` sale con `process.exit(1)`.
  Verificado con dos mutaciones que mueren: M16 (`calificar()` sin `falla`) y
  M17 (el runner sin su `exit 1`). Además parseé **estáticamente los 226 bloques
  `do $$` de `verificaciones.sql` + `capa1_auditoria_estatica.sql` con el propio
  `calificar()`**: 222 calificables, **0 `sin_calificar`**, 4 reportes
  declarados (`verificaciones.sql:466`, `:1559`, `:1638`, `:2437`). `FINANZAS_RLS`
  quedó alineado clave por clave (`verificaciones.sql:1143`, seis claves contra
  seis valores). El único matiz: `INDICE_FACTURACION` e `INDICES_PAGINACION`
  dejaron de calificar convirtiéndose en REPORTE — está declarado en el commit y
  es defendible (el planeador depende del volumen), pero conviene saber que esos
  dos ya no pueden reprobar.
- El motor del cuadre resiste todo lo que le tiré: proporción del IVA
  (`engine.ts:1569`), elegibilidad del peaje (`:1624`), `@Descuento` en la base
  del estímulo (`:1626`), desviación de litros (`:1672`). Cuatro mutaciones,
  cuatro rojos.
- `pg.ts` (el borde de PostgREST) es de lo más duro del repo: dos mutaciones al
  contrato de `traerTodo` (`:204`, `:206-213`) matan 74 y 2 casos.
- La escritura del cierre está anclada campo por campo:
  `repo_escritura.test.ts` mata el intercambio de `p_total_comprobado`/
  `p_total_anticipo` (`repo.ts:1076-1077`) con la prueba «manda los DOCE
  parámetros a su lugar».
- Los anclajes `_aud24` que la ronda dejó son reales, no decorativos: verifiqué
  `route_orden_cursor_aud24.test.ts` (M13), `sw.test.ts` sobre la clase `red` vs
  `rechazado` (M11) y `calificar_verificacion_aud24.test.ts` (M16/M17).
- `pruebas_en_ci.test.ts:37-72` sigue siendo la mejor red estructural del repo:
  detecta los `skipIf(LIKIDA_COBERTURA)` recorriendo `src/` y exige que el paso
  «Pruebas de tiempo (sin cobertura)» de `ci.yml:124` los alcance.
- `vitest.config.ts:112-117`: los umbrales (78/78/69/82) están anclados a una
  medición fechada y con la exclusión de `src/app/**/*.tsx` explicada. No es un
  número inventado.
- `ci.yml:63-64` (auditoría de dependencias de runtime, bloqueante) y `:100-101`
  (`test-resiliencia.sh`) están en el orden correcto — solo que en el sha
  auditado nunca llegan a correr.

## Lo que NO alcancé a revisar

- **La suite completa nunca se corrió aquí** (el orquestador la tiene). Todos mis
  conteos de «verde» son sobre subconjuntos derivados por `grep` del símbolo
  mutado — amplios (43, 47, 48 archivos), pero no las 819. Un sobreviviente mío
  podría morir en un archivo que mi `grep` no alcanzó; los seis los elegí de modo
  que eso sea improbable (ninguno de los seis tiene un símbolo importable que
  otro archivo pueda ejercitar salvo los que corrí).
- `supabase/verificaciones.sql` lo audité **estáticamente** (parser propio con el
  `calificar()` real, sustituyendo los `%` por un token sin espacios ni barras).
  Sin Postgres no puedo saber si un valor real trae una barra o un `clave=` que
  desalinee el conteo en tiempo de ejecución. Los 4 reportes y los 222
  calificables son estructura, no ejecución.
- `supabase/tests/wa_leases_fencing.sql` (pgTAP, Capa 0) y
  `supabase/pruebas-aislamiento/andamio_ci.sql`: leídos por encima, no auditados.
- `scripts/ci/e2e/`, `playwright-smoke.mjs` y `e2e-navegador.yml`: fuera de
  alcance por tiempo.
- No medí cobertura (`--coverage` es la suite entera). El mapa de zonas con 0%
  de líneas ejecutadas queda sin actualizar desde la ronda 5.
- Los `*.prueba.ts` de `pruebas-manuales/` no se tocaron, por instrucción.

## Árbol limpio

```
$ git status --porcelain
(vacío)

$ git diff --stat
(vacío)
```

Durante mi sesión otra sesión en paralelo dejó cuatro archivos modificados
(`package.json`, `src/lib/likida/pruebas_en_ci.test.ts` — el arreglo del techo de
heap del typecheck, OP-1, el CRÍTICO de arriba — y `src/lib/likida/contactos{,.test}.ts`,
de otro rubro) y ya los commiteó: `22dc127 fix(ci): OP-1 el typecheck declara
techo de heap` y `70dd5c6 fix(agentico): AGEN-1`. Nada de eso es mío. Las 16
rutas que yo mutué
(`cuadre/engine.ts`, `pg.ts`, `facturacion_escritura.ts`, `revision.ts`,
`contabilidad/poliza.ts`, `contabilidad/formatos.ts`, `repo.ts`, `pac/sw.ts`,
`cuadre/cifras.ts`, `liquidacion/pdf.ts`, `ratelimit.ts`,
`sat_descarga/escritura.ts`, `app/api/export/liquidaciones/route.ts`,
`scripts/ci/{calificar-verificacion,correr-verificaciones,compuerta-deploy,lint-ratchet}.mjs`,
`supabase/migrations/0300_*.sql`, `.github/workflows/ci-postgres.yml`) están
restauradas byte a byte y ninguna aparece arriba. La sonda temporal
`src/lib/likida/contabilidad/zzz_tmp_aud24_probe.test.ts` se borró (no hay
archivos sin seguimiento). El único archivo que este rubro agrega es
`docs/auditoria-24/pruebas.md`, ignorado por `.gitignore:34` como las rondas 22 y 23.
