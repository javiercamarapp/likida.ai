# Arquitectura y mantenibilidad — auditoría 24

**Nota: 6/10** (antes 5). Razón del movimiento: **se atacó y subió**, pero menos
de lo que podía. ARQ-1 —cinco rondas cayéndose por el mismo hueco— por fin se
cerró **derivando**: `REVISAR` ya no se escribe a mano, es
`[...new Set([...NO_DEDUCIBLE_ISR, ...POR_CONFIRMAR, ...REVISAR_OPERATIVO])]`
(`cuadre/engine.ts:371`) y `contencion_listas.test.ts` exige la contención entre
las cinco listas. Medí la cobertura sobre los 43 valores de `TipoDiferencia`: el
único hueco que queda (`ticket_monedero` fuera de `SIN_IVA_ACREDITABLE`) está
declarado y argumentado en `engine.ts:1522-1525`. Eso es el arreglo que la 22 y
la 23 no hicieron.

Lo que frena la nota: la fusión de las 15 ramas metió **tres divergencias
nuevas** del mismo patrón que ARQ-1 —dos de ellas delante del contralor— y
`procesarTurno` volvió a crecer, de 2,913 a **3,096 líneas**
(`processor.ts:1308-4403`, medido hoy).

**El riesgo mayor del rubro, hoy:** `cubetaDe()` se declara en `engine.ts:388`
como «LA ÚNICA definición de en qué cubeta cae un gasto … para que nadie la
reconstruya», y **el panel la sigue reconstruyendo**. El arreglo de la 18-c3
sincronizó las dos listas en vez de llamar a la función; este ciclo le agregó a
`cubetaDe` un tercer criterio (FIS-6, pago a crédito sin REP) que el panel no
puede ver, y la contradicción está viva en la misma pantalla.

---

## Hallazgos

### [ALTO] El renglón sale en verde con palomita mientras la misma hoja dice que ese comprobante no es deducible todavía (REINCIDENTE — patrón ARQ-C3-1, tercera reconstrucción de `cubetaDe`)

`src/app/dashboard/[id]/vista.tsx:199-215` (`estadoRenglon`) ·
`src/lib/likida/cuadre/engine.ts:388-396` (`cubetaDe`, los tres criterios) ·
`src/lib/likida/cuadre/engine.ts:162-164` (`pagoPendiente`) ·
`src/lib/likida/cuadre/engine.ts:1748` (`hayPagoPendiente`) ·
`src/app/dashboard/[id]/detalle.tsx:364` (dónde se pinta) ·
`src/lib/likida/liquidacion/deducibilidad.ts:86-94` (lo que dice el bloque de arriba) ·
`src/app/dashboard/[id]/estado_renglon.test.ts:1-30` (el guardarraíl que no alcanza)

**Escenario.** Un CFDI de refacciones de **$23,200**, timbrado, `estadoSat:
'vigente'`, `formaPago: '99'` (Por definir — la forma NORMAL de una compra a
crédito en México), sin REP todavía (`pagadoEn` vacío):

- **El motor**: `cubetaDe` → `'por_confirmar'` por la tercera rama
  (`if (pagoPendiente(g)) return 'por_confirmar'`, `engine.ts:393`).
  `totalDeducible` **no lo incluye**; `totalPorConfirmar += 23,200`; el estatus
  baja a `revisar` (`engine.ts:1748-1749`).
- **La misma pantalla, bloque de deducibilidad**: «Por confirmar $23,200.00» con
  la leyenda «A crédito (forma de pago 99) y sin complemento de pago…».
- **La misma pantalla, tabla de renglones**: `estadoRenglon` solo mira
  `diferencias`, y **para este caso el motor no emite ninguna**
  (`medioDistinto` devuelve `false` para `'99'` a propósito, `engine.ts:189-192`;
  `medio_pago_no_admitido` exige `formaPagoJuzgable !== undefined`,
  `engine.ts:812`). Con `tipos = []` cae hasta
  `if (g.estadoSat === 'vigente') return { estado: 'ok', etiqueta: 'CFDI vigente', validado: true }`
  → **pastilla verde `--color-ok` con palomita**.

Entra: un comprobante a crédito de $23,200 → sale: «CFDI vigente ✓» en verde en
el renglón y «Por confirmar $23,200.00» doce centímetros arriba, en la misma
hoja.

**Consecuencia.** El contralor lee la tabla renglón por renglón para armar su
papel de trabajo —es la vista que enseña el detalle— y se lleva como bueno un
comprobante que el motor excluyó del deducible. Es exactamente el daño que el
encabezado de `estado_renglon.test.ts` describe («salía perdida arriba y
recuperable abajo»), con el signo invertido.

**Intento de refutación.** Sí hay guardarraíles parciales y por eso no es
CRÍTICO: la columna «Forma de pago» del mismo renglón imprime «Por definir»
(`vista.tsx:152`), el bloque de deducibilidad sí lo dice, el PDF sí usa
`cubetaDe` (`liquidacion/pdf.ts:442`) y `analytics.ts:1591` también. El que no lo
usa es la pantalla.

**Causa raíz probable:** el arreglo de la 18-c3 cerró la divergencia
**importando las dos listas** (`NO_DEDUCIBLE_ISR`, `POR_CONFIRMAR`) en vez de
llamar a `cubetaDe`; su prueba cruza esas dos listas contra el motor y por
construcción no puede ver un criterio que no sea un `TipoDiferencia`. Es el mismo
cierre-por-sincronizar-miembros que arrastró ARQ-1 cinco rondas.

---

### [ALTO] Las dos salidas de liquidaciones que el ERP y tesorería leen no coinciden ni en qué acepta `?revision=` ni en qué devuelven sin parámetro

`src/app/api/export/liquidaciones/periodo.ts:71-73` (7 valores, default `sin_rechazadas`) ·
`src/app/api/export/liquidaciones/route.ts:122-124` (cómo lo aplica) ·
`src/app/api/v1/liquidaciones/route.ts:41-43` (6 valores, default `firmadas`) ·
`src/app/api/v1/liquidaciones/route.ts:113-121` (`leerFiltroRevision`, la segunda copia con el mismo nombre) ·
`src/lib/likida/revision.ts:9` («este archivo es el ÚNICO lector/escritor de `liquidacion.revision`»)

**Escenario.** Un tenant con 100 liquidaciones del mes: 60 `aprobada`, 10
`ajustada`, 25 `pendiente` (nadie las firmó), 5 `rechazada`.

- Tesorería descarga `GET /api/export/liquidaciones?desde=…&hasta=…` **sin**
  `revision` → `q.neq('revision','rechazada')` → **95 filas**, incluidas las 25
  que nadie firmó. El comentario de `periodo.ts:56-65` dice explícitamente que
  este CSV es «con lo que tesorería arma la dispersión al chofer».
- El ERP pega `GET /api/v1/liquidaciones` **sin** `revision` → `firmadas` →
  **70 filas**. Su comentario dice que las firmadas son «lo asentable».
- El integrador que leyó el CSV y prueba `GET /v1/liquidaciones?revision=sin_rechazadas`
  se lleva un **400 `parametro_invalido`**: el valor existe en una salida del
  producto y no en la otra.

Entra: el mismo mes, la misma flota → salen 95 renglones por una puerta y 70 por
la otra, y 25 liquidaciones sin firma se dispersan por una y no por la otra.

**Consecuencia.** El contralor cuadra el CSV contra el ERP y le faltan 25
liquidaciones sin que nada explique por qué; o peor, paga sobre las 25 que
todavía esperan firma —el caso que la 0299 se escribió para impedir—. Y para
quien mantenga esto: el mismo nombre de función (`leerFiltroRevision`), el mismo
nombre de parámetro y dos vocabularios que ya no se pueden cambiar juntos.

**Intento de refutación.** Los dos filtros VIAJAN en la respuesta (el nombre del
archivo y un encabezado en el CSV; `filtro.significado` en el JSON), lo cual es
correcto y evita el silencio. Lo que no evita es que las dos puertas contesten
distinto a la misma pregunta.

**Causa raíz probable:** dos ramas paralelas (`aud24/revision` y la que trajo el
export por cursor) contestaron por separado «¿qué es seguro pagar?» y ninguna
supo de la otra; `revision.ts` afirma ser el único punto de acceso a
`liquidacion.revision` y las dos rutas leen la columna directas.

---

### [ALTO] El mismo cálculo de «cuál papel de la unidad vence antes y en cuántos días», dos veces, anclado a dos días distintos (UTC contra México)

`src/lib/likida/operacion.ts:181-203` (`getUnidades`: `base = Date.UTC(hoy.getUTCFullYear(), …)`, papeles como literales `['Póliza','Permiso SICT','Verificación']`) ·
`src/lib/likida/administracion.ts:1261-1283` (`papelMasProximo`: `diasEntreIso(hoy, iso)` con `hoy` = día de México) ·
`src/app/dashboard/inicio-operacion.tsx:101` (`getUnidades(tenantId)`, sin `hoy`) ·
`src/app/dashboard/unidades/page.tsx:78-81` (`getUnidadesRegistro(tenantId, hoyMx(...))`) ·
`src/lib/likida/vigencias.ts:50-82` (`clasificarVigencia`) ·
`src/lib/likida/administracion_aud24.test.ts:59` (el test que dice cruzar las dos y no cruza ninguna)

**Escenario.** Un tracto cuya póliza vence **2026-09-03**. Son las **19:00 del
2026-09-02 en CDMX** (= 2026-09-03T01:00Z; México no tiene horario de verano
desde 2022, así que la ventana es 18:00–24:00 todos los días):

- `/dashboard` (Operación) llama `getUnidades(tenantId)` sin `hoy`, así que
  `base = Date.UTC(2026, 8, **3**)` → `dias = 0` → `clasificarVigencia(0)` →
  **«Póliza: vence HOY»**, y una unidad cuya póliza venció ayer ya cuenta como
  **vencida** en el semáforo del Inicio.
- `/dashboard/unidades` llama `getUnidadesRegistro(tenantId, '2026-09-02')` →
  `diasEntreIso('2026-09-02','2026-09-03') = 1` → **«Póliza: vence mañana»**.

Entra: la misma unidad, el mismo instante → «vence HOY» en el Inicio y «vence
mañana» en el Registro; y con la póliza del **2026-09-02**, «vencida ayer»
(rojo, cuenta en `vencidos`) contra «vence HOY» (ámbar, cuenta en `porVencer`).
El mismo desfase sale por `/v1/unidades` (`route.ts:119`) y por la herramienta
MCP (`lib/mcp/herramientas/unidades.ts:15`), que también llaman sin `hoy`.

**Consecuencia.** El gerente ve «2 unidades vencidas» en el Inicio y abre el
Registro, que le lista una. Cada tarde. Es literalmente la regla «un rótulo tiene
que ser verdad» rota por un huso horario, sobre el dato que decide si un tracto
sale a carretera.

**Intento de refutación.** Busqué el guardarraíl: el comentario de
`administracion.ts:1195-1202` dice que los nombres salen de `PAPELES_UNIDAD` «que
es la misma constante que usa el resto del producto» y que
`administracion_aud24.test.ts` «fija que las dos implementaciones coincidan».
Las dos afirmaciones son falsas hoy: `getUnidades` **no** importa
`PAPELES_UNIDAD` (los tres nombres están tecleados en `operacion.ts:187-191`), y
el test **nunca llama a `getUnidades`** —solo compara `papelMasProximo` contra
valores escritos a mano—. El SQL de la 0298 (`least(…)`, `< p_hoy`,
`<= p_hoy + p_dias_aviso`) sí concuerda con `papelMasProximo`; el que va solo es
`getUnidades`.

**Causa raíz probable:** la rama `masivo`/`admin` escribió el segundo lector para
paginar en la base y, en vez de mover el cálculo, lo rehizo — y el comentario
que declara la equivalencia se escribió antes de que existiera el test que la
probaría.

---

### [MEDIO] Tres respuestas distintas a «¿la base va a la par del código?», y la que bloquea el despliegue es la más débil de las tres

`src/app/api/health/migracion.ts:78` (`atras = Number(codigo) - Number(base)`) ·
`scripts/ci/compuerta-deploy.mjs:79-85` (la MISMA aritmética, segunda copia, es la que decide si Vercel construye) ·
`src/lib/likida/agentes/ingenieria.ts:704-724` (G4 «prefijos chocados» y G5 «huecos de numeración» — la única que mira la lista completa)

**Escenario.** El árbol auditado tiene **279 migraciones** y los números
**0277, 0293 y 0295 nunca existieron** (los reservaron ramas paralelas que
después renumeraron; lo verifiqué con `git log --diff-filter=A`). Con producción
en `0276`:

- La compuerta imprime literalmente «faltan **25** migración(es)
  (**0277**..0301)» y manda a aplicar un rango cuyo primer archivo no existe. Los
  archivos reales son 24 (0278..0301).
- Peor: la comparación es **máximo contra máximo**. Si una rama que quedó
  cortada abajo aterriza mañana con `0295_*.sql` y producción ya está en `0301`,
  entonces `base = '0301'`, `codigo = '0301'`, `atras = 0`, `motivo` ausente →
  `/api/health` verde y la compuerta responde «base 0301 a la par del código
  0301: se construye», con la migración **sin aplicar**. Es el modo de falla que
  esta misma ola ya produjo dos veces (0275→0276 renumerada por colisión; 0283 y
  0299 redefiniendo la misma función SQL).

**Consecuencia.** La compuerta se escribió para ser fail-closed («un cotejo que
no pudo hacerse no es un cotejo verde») y en este caso concreto es fail-**open**:
deja publicar código que le pide a la base algo que no está. Y quien mantenga
esto tiene que tocar la regla en dos archivos —uno `.ts`, uno `.mjs`— para
cambiarla.

**Intento de refutación.** Sí existe la comprobación buena, y por eso esto es
MEDIO y no ALTO: el agente de ingeniería sí detecta huecos (G5), prefijos
chocados (G4) y orden invertido (G2), sobre la lista completa. Pero corre en el
parte diario de Javier, no en la puerta del despliegue, y su propio texto declara
que «este servidor no tiene el repo y NO puede distinguir» un hueco real de un
número que nunca existió — la información que la compuerta sí tiene y no usa.

**Causa raíz probable:** el cotejo se definió como «el número más alto» en vez de
«el conjunto de nombres», que es lo único que sobrevive a 15 ramas eligiendo
número a la vez.

---

### [BAJO] `procesarTurno` creció otra vez: 2,913 → **3,096 líneas** (REINCIDENTE, tercera ronda seguida)

`src/lib/likida/processor.ts:1308-4403` (una sola función; entre esas dos líneas
no hay ninguna otra declaración de nivel superior — lo verifiqué con un barrido
de columna 0). El archivo entero son 4,403 líneas y es el más grande del repo por
un factor de 1.7 sobre el segundo.

**Escenario.** No es un bug de hoy: es el costo de cambiar. Cualquier arreglo en
el turno de WhatsApp —el camino por el que entra el 100% del producto— se hace
dentro de una función que no cabe en pantalla, no se puede probar por partes y
cuyo `git blame` cruza las 15 ramas de esta ola.

**Consecuencia.** El equipo que mantenga esto paga la revisión completa por cada
línea que toque; y es precisamente el archivo donde la ola metió más diffs
cruzados (`b70db10`, `22d7c58`, `236b0d3`).

**Causa raíz probable:** ninguna ronda ha extraído un solo paso del turno; cada
arreglo agrega su rama dentro.

---

### [BAJO] `repo_paginado.ts` declara un contrato en su encabezado que su propia tercera función rompe

`src/lib/likida/repo_paginado.ts:10-13` («**NINGUNA** de estas funciones LANZA
por un fallo de lectura … el fallo se atrapa aquí y viaja en `error`») ·
`src/lib/likida/repo_paginado.ts:247` (`if (error) throw new Error(error.message)`) ·
`src/lib/likida/repo_paginado.ts:265` (`if (!errOp && porOperador)` — el segundo
fallo se traga sin dejar rastro)

**Escenario.** `buscarViajesVivos` lanza cuando la primera consulta falla —el
llamador (`huerfanos/page.tsx:186`) lo atrapa, así que hoy no hay daño— y
**descarta en silencio** el error de la segunda: si la búsqueda por nombre de
operador falla, el combo «Adjuntar a…» devuelve solo los que casaron por folio y
nada dice que hubo una lectura caída. El operario que buscó «Ramírez» ve «sin
resultados» y concluye que el viaje no existe.

**Consecuencia.** Para el equipo: el encabezado del módulo es la fuente que un
autor nuevo va a creer, y ya no describe el módulo. Para el usuario: la única
ruta de este archivo que puede quedarse callada es la que decide a qué viaje se
adjunta un comprobante huérfano.

**Causa raíz probable:** el archivo nació con dos funciones que cumplían el
contrato y la tercera se agregó después, con otra forma, sin actualizar el
encabezado.

---

### [BAJO] Dos declaraciones de `RevisionLiquidacion` y dos definiciones del mismo permiso de firma

`src/types/likida.ts:166` y `src/lib/likida/revision.ts:31` (la misma unión de
cuatro valores, declarada dos veces; `src/lib/likida/revision.ts:32` exporta
además `REVISIONES` que solo existe en una) ·
`src/lib/auth/permisos.ts:35` (`TIMBRA = {superadmin, flota_admin, contador}`) y
`src/lib/likida/revision.ts:45` (`FIRMA = {superadmin, flota_admin, contador}`)

**Escenario.** El día que el producto agregue un quinto estado de revisión —o el
día que se decida que el `encargado` sí puede firmar pero no timbrar— hay que
tocar dos archivos, y `permisos.ts`, cuyo trabajo declarado es ser «PERMISOS DE
NIVEL APLICACIÓN», deja de ser la lista completa de quién puede qué. El propio
comentario de `revision.ts:43-44` lo admite: «Vive aquí y no en `permisos.ts`
porque es el permiso de ESTA función; el día que se consolide, se mueve».

**Consecuencia.** Deuda pura, sin defecto hoy: hoy los dos conjuntos son
idénticos y las dos uniones también. Se reporta porque es el patrón exacto que
este rubro persigue y porque un permiso de firma que autoriza un pago al chofer
es mal sitio para tener dos verdades.

**Causa raíz probable:** la rama `aud24/revision` no quiso tocar `permisos.ts`
para no chocar con `aud24/auth`, que lo estaba reescribiendo en paralelo.

---

## Lo que revisé y está bien

- **ARQ-1, cerrado de verdad.** `REVISAR` se DERIVA (`cuadre/engine.ts:371`) y
  `cuadre/contencion_listas.test.ts:25-56` exige las tres contenciones
  (cubetas ⊆ REVISAR, `SIN_IVA_ACREDITABLE` ⊆ `SIN_ESTIMULO`, `NO_DEDUCIBLE_ISR`
  ⊆ `SIN_IVA_ACREDITABLE`) más el escenario del RFC de tercero con
  `estatus === 'revisar'`. Crucé las 4 listas contra los 43 valores de
  `TipoDiferencia`: el único hueco (`ticket_monedero`) está argumentado en
  `engine.ts:1522-1525` y es correcto (nunca trae CFDI, el
  `if (!g.xmlVerificado) continue` lo ataja antes).
- **El motor sigue puro.** `cuadre/engine.ts:11-22` importa 9 módulos y ninguno
  hace I/O: verifiqué transitivamente `normas/indice.ts`, `facturacion/identificar.ts`
  (solo `./comercios`), `facturacion/caducidad.ts`, `intake/cfdi.ts` e
  `intake/evidencia_monedero.ts` (solo `./padron_monederos`). Cero `supabase`,
  cero `fetch`, cero `fs`.
- **`otro: 'Gasto'` / `otro: 'Otro'` — el ejemplo canónico — está cerrado por
  mecanismo, no por vigilancia.** `etiquetas_sincronizadas.test.ts:42-88` barre
  **todo `src/`** buscando el PATRÓN `const CONCEPTO(_LABEL)?` (no una lista de
  rutas, que es lo que dejó ciego al guardia anterior) y compara cada mapa
  encontrado contra el del motor. El PDF ya no tiene mapa propio: importa
  `etiquetaConcepto` (`liquidacion/pdf.ts:14`).
- **La frontera de datos está medida y el número es honesto.** Corrí el mismo
  barrido de `frontera_datos_guardiana.test.ts:74-80` sobre el árbol y da
  **exactamente 251** archivos de producción con `.from(`/`.rpc(` fuera de
  `repo.ts`/`pg.ts` — el techo declarado. `repo.ts` dejó de ser la frontera hace
  tres rondas, pero eso está escrito, medido y con trinquete, no oculto.
- **Los 11 crons no pueden desincronizarse.** `lib/admin/salud.ts:28` (`CRONS`)
  se cruza contra `vercel.json` **y** contra el CHECK de `cron_latido` en
  `lib/admin/salud.test.ts:75-141`. Conté 11 directorios en `src/app/api/cron/`,
  11 entradas en `vercel.json` y 11 ids en `CRONS`.
- **Las migraciones 0288 y 0289 NO se pisaron.** Las dos redefinen
  `mantenimiento_de_datos()` desde ramas distintas; leí las dos versiones línea
  por línea y la 0289 conserva íntegras las purgas de la 0288
  (`purgar_wa_outbox`, `purgar_evento_seguridad_flota`) y agrega la suya. Es el
  contraejemplo del accidente 0283/0299.
- **`/v1/liquidaciones` y `/export/liquidaciones` sí atrapan el recorte silencioso
  de PostgREST** (`v1/liquidaciones/route.ts:169-178`, keyset `(created_at, id)`
  con la segunda rama del empate). El cursor y el fail-closed son correctos; lo
  que difiere entre ellos es el filtro, arriba.
- **`conRelojDuro` duplicado** (`agentes/runner.ts:1169` y
  `api/cron/_reloj_duro.ts:29`) — lo miré esperando un hallazgo y no lo es: las
  dos copias son idénticas, la razón está escrita (importar `runner.ts` arrastra
  el stack de agentes a un cron de 15 líneas) y `route.test.ts` verifica contra
  el fuente que la ruta siga envuelta.
- **`diaMx` en `facturacion/relogin_portal.ts:211` y `facturacion_clientes.ts:97`**
  son dos envoltorios finos sobre el mismo `hoyMx` de `formato.ts`, no dos
  cálculos.

## Lo que NO alcancé a revisar

- **Las 24 migraciones nuevas leídas de punta a punta.** Crucé los nombres de
  función redefinidos entre 0278 y 0301 y abrí las dos parejas sospechosas
  (0288/0289 y la reconciliación 0300); no leí el cuerpo de `0281` contra `0272`
  (`poliza_datos_tenant`, redefinida) ni `0286` contra `0273`
  (`ejecutar_arco_cancelacion`, redefinida), donde puede haber el mismo accidente
  de `create or replace`.
- **`src/app/**` completo.** El detector de clones que corrí es de ventana fija
  (14 líneas normalizadas) y encontró 4 formas de `/dashboard/*/forma.tsx` que
  comparten estructura; no evalué si esa duplicación de UI ya divergió en
  validación.
- **`sat_descarga/*` (11 módulos nuevos) contra `facturacion/*`** — dos ramas
  distintas tocando el mismo dominio de comprobantes; no comparé sus lectores de
  CFDI entre sí.
- **`lib/mcp/herramientas/*` contra `/v1/*`** — los dos exponen el mismo dominio
  a sistemas ajenos y `lib/mcp/credencial.ts:20` importa la regla de autorización
  desde `@/app/api/v1/_comun` (una dependencia que apunta al revés: `lib` → `app`,
  igual que `likida/oficina_wa.ts:7` → `@/app/api/dashboard/chat/tope`). Las
  anoto porque las vi, pero no construí el escenario de falla que exige este
  rubro, así que no van como hallazgo.
- **La suite completa.** Corrí solo lecturas y barridos estáticos; no ejecuté
  `vitest` sobre los archivos citados.
