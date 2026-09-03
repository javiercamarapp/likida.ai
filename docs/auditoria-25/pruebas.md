# Pruebas — auditoría 25

**Nota: 7/10** (antes 7). Razón del movimiento: **se atacó y subió, y la mirada
más profunda se lo comió**. Lo que subió es real y verificado: el CRÍTICO de la
24 (`22dc127`, el techo de heap del typecheck) sigue en pie **y está anclado con
una prueba que muere si lo bajan** — lo medí. Lo que lo compensó: bajé un nivel
por debajo del parseo estático que la 24 usó para certificar
`verificaciones.sql`, levanté un Postgres 16 de verdad, y **un bloque de esa
batería sale `✓ ok` con sus CUATRO valores medidos mal**. Es la clase exacta de
PRU-1 —la que la 24 declaró cerrada— en el mismo archivo, un piso más abajo.

Riesgo mayor del rubro hoy: **la compuerta ya corre, pero todavía hay puertas
que no pueden reprobar** — una en SQL que grada con comodín, y toda la mitad de
autorización de la firma humana, donde `puedeFirmarLiquidacion` puede devolver
`false` para siempre y las 819 pruebas quedan verdes.

---

## Mutaciones dirigidas

**12 mutaciones · 6 muertas · 6 sobrevivientes.** Método: editar el archivo
real, correr `npx vitest run` (la suite COMPLETA en 6 de los 12 casos, no un
subconjunto), restaurar con `git checkout --`. La mutación de SQL se corrió
contra un Postgres 16 efímero levantado para esto y apagado al terminar.

| # | Qué rompí | `archivo:línea` | Qué debía cazarlo | Resultado |
|---|---|---|---|---|
| M1 | `FIRMA` gana `'encargado'` (el jefe de tráfico firma liquidaciones) | `src/lib/likida/revision.ts:45` | cualquier prueba de rol | **SOBREVIVE** (49 archivos que nombran `encargado`, 1,308 casos) |
| M2 | `puedeFirmarLiquidacion()` → `return false` (nadie firma nunca) | `src/lib/likida/revision.ts:47-49` | idem | **SOBREVIVE** (suite COMPLETA: 819 archivos, 10,950 casos) |
| M3 | `leerRevision().firmable` → `true` siempre | `src/lib/likida/revision.ts:297` | `revision.test.ts`, `revision_panel.test.tsx` | **SOBREVIVE** (suite COMPLETA) |
| M4 | `listarAgentes()` mapea `experimental: false` fijo | `src/lib/likida/agentes/definiciones.ts:146` | `definiciones.test.ts` | **SOBREVIVE** (suite COMPLETA) |
| M5 | la compuerta de deploy tolera 3 migraciones de atraso (`> 0` → `> 3`) | `scripts/ci/compuerta-deploy.mjs:80` | `compuerta_deploy_aud24.test.ts` | **SOBREVIVE** (REINCIDENTE, M20 de la 24) |
| M6 | la póliza se exporta aunque cargos ≠ abonos (`> 0.01` → `> 1e9`) | `src/lib/likida/contabilidad/poliza.ts:300` | `poliza.test.ts` | **SOBREVIVE** (REINCIDENTE, M9 de la 24) |
| M7 | bloque 50 de la batería: los CUATRO valores medidos, mal a propósito | `supabase/verificaciones.sql:2790` | el runner de `ci-postgres.yml` | **SOBREVIVE** — `calificar()` devuelve `ok` (medido contra Postgres real) |
| M8 | el tope de alimentación (LISR 28-V) deja de partirse POR VIAJE: un solo balde para todos los operadores | `src/lib/likida/fiscal.ts:814` | — | **muerta** (5 casos: `fiscal.test.ts` + 4 de `fiscal_agregado.test.ts`) |
| M9 | `tenantEfectivoChat` deja de fallar cerrado ante el tenant fantasma | `src/app/api/dashboard/chat/tenant.ts:56-59` | `tenant.test.ts` | **muerta** |
| M10 | el techo de heap del typecheck baja a 2048 | `package.json:20` | `pruebas_en_ci.test.ts:99` | **muerta** — el arreglo `22dc127` está anclado de verdad |
| M11 | si las ligas a viajes fallan, la factura ya NO se compensa (queda emitida sin sus viajes) | `src/lib/likida/facturacion_escritura.ts:428-429` | — | **muerta** (`facturacion_compensacion.test.ts`) |
| M12 | `marcarEmitida` pierde el ancla `.eq('estatus','borrador')` | `src/lib/likida/facturacion_escritura.ts:481` | — | **muerta** (`facturacion_escritura_cableado.test.ts`) |

Lectura del mapa: **cero sobrevivientes en el motor y en la escritura del
dinero** (M8, M11, M12 — tercera ronda seguida). Los seis sobrevivientes están,
otra vez, en las **compuertas** (M5, M6, M7) y en la **superficie nueva sin
arnés** (M1-M4).

---

## Hallazgos

### [ALTO] Un bloque de `verificaciones.sql` sale `✓ ok` con sus cuatro valores medidos mal — probado contra Postgres real
`supabase/verificaciones.sql:2760-2792` (el `raise` en `:2790`) · `scripts/ci/calificar-verificacion.mjs:84-105`

Escenario, medido y no razonado: levanté un Postgres 16 (`initdb` + `pg_ctl`,
apagado y borrado al terminar), reproduje el `raise exception` del bloque 50 con
los valores que la protección **rota** produciría —`quedan=999` (el candado
huérfano sobrevive al viaje), `validadas='viaje_ingreso_no_negativo=false
viaje_km_sanos=false'` (las dos restricciones desvalidadas),
`quedan_sin_fk=0`, `convalidated=t`— y pasé el `stderr` de `psql` por
`extraerMensaje()` + `calificar()`, las funciones reales del runner. Veredicto:

```
TODOS LOS VALORES MAL → ok
[{ clave: "candado-borrado-con-el-viaje", actual: "999",
   esperado: "0) constraints: ... (esperado 1) ... (esperado f",
   comodin: true, ok: true }]
```

La causa es mecánica y está en `partirEnClavesYEsperado`: corta el mensaje en el
**primer** `(esperado`, y el bloque 50 tiene **cuatro** grupos `(esperado …)`
intercalados (es el único de los 226 con más de uno — lo verifiqué barriendo los
dos archivos). Así, `izq` se queda con UNA clave y `der` se traga todo el resto
del mensaje como si fuera un solo valor esperado. Ese valor trae espacios →
`calificar()` lo clasifica como prosa del autor → **comodín, `ok: true`
incondicional**. Las otras tres mediciones ni se miran.

Consecuencia: la garantía de la 0075 —que `viaje_lock` se va con su viaje
(`ON DELETE CASCADE`) y que `viaje_ingreso_no_negativo` / `viaje_km_sanos`
quedaron `VALIDATE`— está en la batería, se corre en cada push, imprime un
palomita, y **no puede reprobar**. `viaje_ingreso_no_negativo` es el CHECK que
impide un `ingreso_flete` negativo: la columna de la que sale la rentabilidad
que el contralor mira. Y el equipo que mantiene esto lee «226 bloques, 0 fallos»
como si los 226 aseveraran algo.

Por qué la 24 no lo vio (y no fue descuido): auditó este archivo **estáticamente**,
sustituyendo cada `%` por un token sin espacios ni barras, y lo dijo en su
sección de límites. El valor real de `validadas` se construye con
`conname||'='||convalidated::text` (`:2769-2771`) — o sea que en tiempo de
ejecución inyecta `clave=` de más, que es justo lo que el token sintético no
modelaba.

Causa raíz probable: el calificador supone un `(esperado …)` único y al final;
el bloque 50 es el único que rompe esa forma, y nada la exige.

*Refutación intentada: barrí los 226 bloques buscando comodines. Son 18 claves
comodín sobre 1,442 (1.2%), y salvo el bloque 50 todas son valores que de verdad
dependen de datos («lo que suman 1000 filas», «el total real» en
`RESUMEN_POR_TENANT`) y conviven con 22 claves duras en el mismo bloque. El
mecanismo del comodín no está mal; el bloque 50 sí.*

### [ALTO] La mitad de autorización de la firma humana no tiene una sola prueba: `puedeFirmarLiquidacion` puede devolver `false` para siempre y la suite queda verde
`src/lib/likida/revision.ts:45-49` · llamada en `src/app/dashboard/[id]/page.tsx:198` y `:210`

Escenario (M2, medido): cambio el cuerpo de `puedeFirmarLiquidacion` por
`return false`. Corro **la suite completa**: 819 archivos, 10,950 casos, **1
fallo: ninguno**. Con esa mutación, `/dashboard/[id]:198` deja de pintar el
panel de revisión para todos los roles y el server action de `:210` rechaza toda
petición con «Tu rol no firma liquidaciones» — es decir, la promesa que da
nombre al producto («el agente cuadra, tú firmas lo que no») desaparece entera y
CI no se entera.

No hace falta un `return false` para que duela. La regresión realista está
invitada por el comentario del propio archivo (`:43-44`: «Vive aquí y no en
`permisos.ts` porque es el permiso de ESTA función; el día que se consolide, se
mueve con su prueba»): quien consolide `FIRMA` en `permisos.ts` y se coma
`'contador'` deja al **contador —el comprador— sin poder firmar**, y todo verde.
Verifiqué también la dirección contraria (M1, `FIRMA` gana `'encargado'`): 49
archivos de prueba que nombran ese rol, 1,308 casos, todos verdes.

Consecuencia: el contralor abre el detalle de una liquidación en la sala del
demo y no hay botón. Y en la dirección permisiva el daño está contenido solo por
suerte estructural: el server action re-gatea con `puedeVerArea(s.rol,'dinero')`
(`visibilidad.ts:36-45`, `encargado: ['operacion']`), así que hoy un encargado no
llega a firmar aunque `FIRMA` lo incluya — pero **eso no lo prueba nadie
tampoco**, y el panel sí se pintaría.

Causa raíz probable: la lista de roles se escribió con su justificación en prosa
y sin un caso que la fije; `revision.test.ts` (255 líneas, 14 casos, muy bueno)
cubre la cola, los filtros, el cursor y la RPC — y no toca el permiso.

### [MEDIO] `leerRevision().firmable` puede quedar en `true` fijo y nada se pone rojo
`src/lib/likida/revision.ts:297` · `src/app/dashboard/[id]/revision_panel.test.tsx:22,42,52,66`

Escenario (M3, medido): cambio
`firmable: revision === 'pendiente' || (revision !== 'rechazada' && !humano)`
por `firmable: true`. Suite COMPLETA verde. Con la mutación, una liquidación
ya firmada por una persona vuelve a ofrecer «Aprobar / Ajustar / Rechazar»; el
contralor aprieta y la RPC rebota con `LR010` («no se firma dos veces») o
`LR011` si estaba rechazada — un error rojo en pantalla sobre una liquidación
que estaba bien.

La prueba que parece cubrirlo no lo cubre: `revision_panel.test.tsx` **recibe
`firmable` como prop** en sus cuatro casos (`firmable: true` en `:22` y `:42`,
`false` en `:52` y `:66`). Prueba que el panel obedece el booleano, nunca que el
booleano se calcule bien. Y `revision.test.ts` no importa `leerRevision` en
ninguna línea.

Consecuencia: la regla «puede recibir firma humana» —pendiente, o firme por el
motor, nunca rechazada ni ya firmada por alguien— vive sin arnés, y su modo de
falla se ve en el demo.

Causa raíz probable: la prueba del panel se escribió contra el render y la
función que alimenta al render se quedó del otro lado de la frontera.

### [MEDIO] REINCIDENTE — la compuerta de despliegue sigue sin probar `atras = 1`, el único caso que ocurre
`scripts/ci/compuerta-deploy.mjs:80` · `scripts/ci/compuerta_deploy_aud24.test.ts`

Re-medido hoy (M5): cambio `if (atras > 0)` por `if (atras > 3)`. La suite
completa sigue verde. Es literalmente el M20 de la auditoría 24, con la misma
prueba única (`base 0271, código 0276` → `atras = 5`, que el `> 3` sigue
bloqueando) y el mismo hueco en la frontera. Con la mutación, un push con
`[deploy]` con la base en `0303` y el código en `0304` —el caso que **está
ocurriendo ahora mismo**, hay una `0304_llm_costo_fase_transcripcion.sql` sin
aplicar en el árbol— devuelve `{ construir: true }` y Vercel publica código que
llama a un objeto que la base no tiene.

Consecuencia: la única compuerta que impide que el código se adelante a la base
sigue probada exactamente en el escenario que no pasa.

### [MEDIO] REINCIDENTE — el freno final de la póliza sigue sin una sola aserción
`src/lib/likida/contabilidad/poliza.ts:300-308`

Re-medido hoy (M6): `if (Math.abs(cargos - abonos) > 0.01)` → `> 1e9`. Suite
completa verde. Sigue sin existir una sola prueba que llegue a esa rama
(`grep -rn "no cuadra: cargos" src --include="*.test.ts"` no devuelve nada; la
única línea es la del propio `poliza.ts:304`). La 24 ya demostró que la rama es
alcanzable con aritmética normal de CFDI (cargos 1000.02 vs abonos 1000.00).

Consecuencia: una póliza descuadrada por dos centavos entra al CONTPAQi o al SAP
B1 del cliente y el ERP rechaza el lote entero sin decir qué renglón. Un año
después de este hallazgo el último freno antes del ERP sigue sin arnés.

### [BAJO] `graduarAgente()` nació con dos pruebas y cero llamadores; la graduación real la hizo la 0303 por el camino que la función vino a sustituir
`src/lib/likida/agentes/definiciones.ts:183-196` · `src/lib/likida/agentes/definiciones.test.ts:90-105` · `supabase/migrations/0303_gradua_agentes_experimentales_auditados.sql:51`

Escenario: el commit `5180c72` dice, textual, «Antes graduar era un UPDATE a
mano sin registro», y agrega `graduarAgente(id, actorId)` con bitácora y con el
candado de «el id existe de verdad». Pero:
`grep -rn "graduarAgente" src/ scripts/ supabase/` devuelve **7 líneas y las 7
son su propia definición o su propia prueba** — cero llamadores.
`/admin/agentes` expone dos server actions (`accionAlta`, `accionPalanca`,
`page.tsx:11` y `:41`) y ninguna gradúa. Y la graduación de los nueve la hizo, en
el mismo commit, un `update public.agente_definicion set experimental = false …`
a pelo en la 0303 — **sin bitácora**, o sea el camino exacto que la función
declara reemplazar.

Consecuencia: el tablero dice que la graduación de un agente está probada y
auditada. Lo está una función que nunca ha corrido en producción y para la que
no hay puerta por dónde correrla. Quien lea la suite para saber si el rastro de
auditoría existe sacará la conclusión contraria a la verdad. Es REINCIDENTE en
clase: mismo patrón que `evaluarAbono` (MEDIO de la auditoría 24), en otro
archivo y en el mismo ciclo en que se señaló.

Causa raíz probable: la función se escribió por simetría con `darDeAltaAgente`
sin decidir quién la iba a llamar, y la migración resolvió el caso urgente por
su cuenta.

### [BAJO] La mitad visible del arreglo de agentes —el badge «Experimental»— no tiene una sola prueba
`src/lib/likida/agentes/definiciones.ts:146` · `src/app/admin/agentes/contenido.tsx:128-136`

Escenario (M4, medido): cambio `experimental: f.experimental === true` por
`experimental: false`. Suite COMPLETA verde. Con eso el badge de
`contenido.tsx:130` no se pinta nunca y `/admin/agentes` vuelve exactamente al
estado que `5180c72` vino a arreglar: un agente `vivo` con `experimental = true`
se ve idéntico a uno que sí corre, y nadie puede saber por qué nunca aparece una
corrida.

Ninguna prueba abre `src/app/admin/agentes/` (`ls` del directorio: `[id]/`,
`contenido.tsx`, `page.tsx`, `palanca.tsx` — cero `*.test.tsx`), y
`definiciones.test.ts` mockea `select()` devolviendo `data: []`, así que el
mapeo de `listarAgentes` nunca se ejercita con una fila.

Consecuencia: deuda que ya cobró factura una vez. La regresión que se acaba de
pagar puede volver sin que nada suene.

---

## Lo que revisé y está bien

- **El CRÍTICO de la 24 está cerrado Y anclado.** `package.json:20` conserva
  `node --max-old-space-size=6144 ./node_modules/typescript/bin/tsc --noEmit`, y
  `pruebas_en_ci.test.ts:99-150` exige ≥ 4096 **y** que `ci.yml` y
  `deploy-preview-promote.yml` entren por `npm run typecheck` sin colar un
  `npx tsc --noEmit` suelto. Lo bajé a 2048 (M10) y la prueba muere. Verifiqué
  además que las dos únicas invocaciones del typecheck en workflows
  (`ci.yml:95`, `deploy-preview-promote.yml:104`) pasen por el script.
- **El seam de la firma humana (0299) SÍ tiene pruebas — el hallazgo abierto de
  backend queda REFUTADO.** `src/lib/likida/revision.test.ts` (255 líneas, 14
  casos: cola por llave con `count` real y fila de más, filtros de URL sin
  aplicar nada a medias, cursor ida y vuelta, lectura caída que LANZA, los
  SQLSTATE traducidos, el aviso al chofer sin cifras),
  `src/app/dashboard/[id]/revision_panel.test.tsx`,
  `src/app/api/export/liquidaciones/revision.test.ts`, y **dos bloques SQL
  contra Postgres real**: 246 (`verificaciones.sql:15747`) y 247 (`:15847`).
  Lo que falta es la mitad de AUTORIZACIÓN, y va como hallazgo aparte.
- **El motor y la escritura del dinero siguen duros.** M8 (el tope de
  alimentación de LISR 28-V dejando de partirse por viaje — compartir un tope
  que la ley da por persona) muere en 5 casos de dos archivos; M11 (la factura
  sin ligas deja de compensarse) y M12 (`marcarEmitida` pierde su ancla al
  borrador) mueren cada una en su prueba nombrada. Tercera ronda seguida sin un
  solo sobreviviente ahí.
- **`chat/tenant.ts` (`66339d5`) llegó CON prueba y la prueba muerde.**
  `tenant.test.ts` (86 líneas, 7 casos) cubre las dos ramas de fail-closed, el
  uuid inexistente que SÍ cae a la sesión, y el rol real que ignora `?tenant=`.
  Le quité el `if (!t) … return null` del tenant fantasma (M9) y muere.
- **El parseo estático de la batería sigue sano en lo grueso.** Recorrí los 226
  bloques de `verificaciones.sql` + `capa1_auditoria_estatica.sql` con el
  `calificar()` real: **222 calificables, 0 `sin_calificar`, 4 reportes**, igual
  que la 24 tras la reparación de `4198985`. Comodines: 18 claves sobre 1,442
  (1.2%), concentradas en valores legítimamente dependientes de datos — salvo el
  bloque 50, que es el hallazgo ALTO.
- **`pruebas-manuales/` no puede colarse a la suite.** 27 archivos `*.prueba.ts`
  fuera del patrón `include` por defecto de vitest (`**/*.{test,spec}.*`);
  `vitest.config.ts:29-34` solo agrega excludes. Ninguno se corrió.
- **El mecanismo de EXENTAS de `migraciones_verificadas.test.ts` sigue exigiendo
  razón escrita.** Las dos entradas nuevas de esta ronda (0301 y 0302,
  `:53-54`) traen párrafo con el criterio y la cobertura que las reemplaza; no
  es una lista de silencio.
- `src/lib/utils.ts` quedó como re-export puro de `formato.ts` (4 líneas) y el
  cambio a `formato.test.ts` de `aa5304d` es solo un comentario: la prueba que
  exige que `formato.ts` no importe nada sigue intacta.

---

## Lo que NO alcancé a revisar

- **El árbol se movió debajo de mí.** Arranqué en `4f94490` y terminé en
  `b5449c2`: durante la sesión aterrizaron tres commits de otros rubros
  (`24ce4c2` toca `contactos.ts`, `003f386`, `b5449c2`) y quedaron dos archivos
  sin seguimiento que no son míos (`src/lib/likida/costos_dominio.test.ts`,
  `supabase/migrations/0304_llm_costo_fase_transcripcion.sql`) más una
  modificación viva en `supabase/verificaciones.sql` (bloque 250, DATOS-A1). Una
  corrida completa mía atrapó 4 fallos en `contactos.test.ts` **que no
  reproducen** ni en aislamiento bajo cuatro husos horarios ni en la corrida
  siguiente: es un árbol a medio commit, no un test intermitente, y por eso NO
  lo reporto como hallazgo. Todos mis conteos de «verde» son de corridas
  distintas sobre árboles ligeramente distintos.
- **No corrí la batería SQL completa.** Levanté un Postgres 16 y reproduje UN
  bloque (el 50) con su `raise` literal; no apliqué las 281 migraciones ni el
  andamio, así que no sé qué dicen hoy los otros 225 bloques en ejecución real.
  Mi barrido de los 226 sigue siendo estático salvo ese.
- **No medí cobertura.** `--coverage` es la suite entera instrumentada y el
  árbol se movía; el mapa de zonas con 0 % de líneas ejecutadas sigue sin
  actualizarse desde la ronda 5. Mi sustituto fue un barrido de nombres
  (275 funciones exportadas de `lib/likida` y `lib/admin` cuyo identificador no
  aparece en ninguna prueba), pero es solo una pista: `hablaDeDineroSinCifraVerificable`
  salía en esa lista y resultó bien cubierta *a través de* `guardia.test.ts`.
- `supabase/tests/wa_leases_fencing.sql` (pgTAP, Capa 0), `andamio_ci.sql`,
  `scripts/ci/e2e/`, `playwright-smoke.mjs` y `e2e-navegador.yml`: fuera de
  alcance por tiempo, igual que en la 24.
- Los tres sobrevivientes restantes de la 24 que no re-medí (M15a, el escáner de
  aislamiento; M21, la colisión de migraciones; M22/M23, el trinquete de lint y
  el paso de `ci-postgres.yml`) siguen abiertos por construcción: nadie escribió
  prueba para ninguno.

---

## Árbol limpio

```
$ git status --porcelain
 M supabase/verificaciones.sql          ← NO ES MÍO (bloque 250, otra sesión)
?? src/lib/likida/costos_dominio.test.ts ← NO ES MÍO
?? supabase/migrations/0304_*.sql        ← NO ES MÍO
```

Las 8 rutas que yo mutué —`src/lib/likida/revision.ts`,
`src/lib/likida/agentes/definiciones.ts`, `src/lib/likida/fiscal.ts`,
`src/lib/likida/facturacion_escritura.ts`,
`src/lib/likida/contabilidad/poliza.ts`, `src/app/api/dashboard/chat/tenant.ts`,
`scripts/ci/compuerta-deploy.mjs`, `package.json`— están restauradas byte a byte
con `git checkout --` y **ninguna aparece en `git status`**. No creé ni borré
ningún archivo del repo. El Postgres 16 que levanté vivió en `/var/tmp/pgverif`,
se detuvo con `pg_ctl stop` y se borró; los scripts de sonda viven en el
scratchpad, fuera del repo. El único archivo que este rubro agrega es
`docs/auditoria-25/pruebas.md`.
