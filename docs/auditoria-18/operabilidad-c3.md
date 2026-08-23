# Operabilidad y DX — auditoría 18 · continuación 3

**Nota: 6/10** (antes 5). Razón del movimiento: **se atacó y subió** —ocho de los
nueve abiertos de la ronda 18 están cerrados y verificados abriendo el archivo—
templado por **mirada más profunda**: el mismo delta que cerró esos ocho abrió
una superficie nueva que nadie había mirado (un auto-merge que escribe en
`master` sobre un repo **público**), y la causa raíz del incidente de ayer sigue
exactamente donde estaba.

**El riesgo mayor de hoy:** `master` no está protegido y ahora, además de que
cualquier push rojo publica, hay un workflow con `contents: write` que mergea
solo a `master` cualquier PR cuya **rama se llame** `mejora/*` — el nombre de
una rama es el único control de acceso a la rama principal de un repo público.
Y la señal en la que ese automatismo confía no es determinista: la compuerta me
falló una de dos corridas hoy, en la prueba que ancla un CRÍTICO fiscal.

---

## ¿Puede volver a pasar lo de la compuerta roja?

**Sí. El síntoma se curó; el mecanismo no se tocó.**

Lo que sí cambió (verificado contra la API de GitHub, workflow `ci.yml`, rama
`master`): la racha roja no terminó en `d432e89` —siguió **ocho corridas más**,
hasta `1c8a119` (21-ago 21:47Z), todas con `[deploy]` en el asunto salvo dos— y
se cerró en `8b5d8d3` (21-ago 22:25Z, «test(migraciones): 0140-0143…»), que
metió las cuatro migraciones a `EXENTAS` con razón escrita
(`src/lib/likida/migraciones_verificadas.test.ts:70-73`). De ahí en adelante,
las 12 corridas de `master` están en verde. Reproducido local:
`npx vitest run migraciones_verificadas runbook` → 14 passed.

Lo que **no** cambió, y es lo que la pregunta pedía medir:

| Pieza | Estado hoy | Evidencia |
|---|---|---|
| Protección de `master` | **ninguna** | `GET /repos/.../branches` devuelve `{"name":"master","protected":false}`. No hay `required_status_checks`. |
| `vercel.json` | **idéntico** | `vercel.json:3` sigue siendo `git log -1 --pretty=%s \| grep -qi '\[deploy\]'`. Nunca consulta el estado de Actions. |
| `ci.yml` | corre en todas las ramas, **no bloquea nada** | `ci.yml:21-24`: `on: push: branches: ['**']` + `pull_request`. Es un semáforo, no una puerta. |
| `salud-produccion.yml` | vigila que producción **exista** y que el sha coincida | no mira si la suite estaba verde: durante toda la racha roja habría dado success. |

Es decir: si mañana alguien vuelve a hacer `git commit -m "[deploy] …"` sobre una
suite roja y `git push origin master`, ocurre lo mismo, línea por línea. Los dos
workflows nuevos no tocan ese camino: `auto-merge-rutina.yml` solo actúa sobre
**PRs** de ramas `mejora/*`, y el trabajo real de estos dos días entró por push
directo a `master`.

Y el auto-merge, además, **no es neutral**: ver los dos CRÍTICOS de abajo.

---

## Verificación de los abiertos de la pasada anterior

### Cerrados — abrí el archivo, no el asunto del commit

| Abierto | Estado | Dónde lo verifiqué |
|---|---|---|
| **[ALTO]** El fail-closed del kill switch deja los cinco crons en verde y sin correo (A17) | **CERRADO** | `src/lib/likida/interruptores.ts:71-112`: `leerInterruptor` devuelve tres estados y `gritarIlegible` emite `logger.error` **con `codigo`** + `alertarOperador`. Los cinco consumidores contestan **500** en `ilegible`: `api/cron/facturar/route.ts:283-291`, `wa-pendientes/route.ts:79-86`, `purgar/route.ts:80-86`, `escalar/route.ts:93-94` y `:116-119`. El 200 `saltado` queda solo para el apagado a propósito. |
| **[ALTO]** El runbook dice que el canal de alerta no existe, y su prueba de deriva no puede notarlo (A18) | **CERRADO** | `docs/conocimiento/DEPLOY.md:113` describe `ALERTA_EMAIL` como «el único canal push del sistema» con sus cinco disparadores. `src/lib/observability/arranque.ts:44-61` exporta `SILENCIOSAS` (5 variables) y `runbook.test.ts:135-136` **itera sobre esa lista**, no sobre un literal, con `expect(SILENCIOSAS.length).toBeGreaterThanOrEqual(4)`. |
| **[MEDIO]** El `codigo` estable nunca llegó al camino del dinero (M14) | **CERRADO en el camino del PDF y del webhook** | `src/lib/likida/processor.ts:2727` (`codigo: codigoDeError(e)` en `pdf.no_entregado`) y `:2706` (`codigo: enviado.codigo`); `src/app/api/webhook/whatsapp/route.ts:286` (`processInbound`). **Sigue ausente en el piloto de visión** — ver REINCIDENTES. |
| **[MEDIO]** `cron/runner` es el único cron sin correo ni código de causa (M15) | **CERRADO** | `src/app/api/cron/runner/route.ts:48-51`: `codigoDeError(e)` + `logger.error('cron.runner.fallo', { error, codigo })` + `await alertarOperador('cron.runner', { error, codigo })`, y 500. |
| **[MEDIO]** `npm install` depende de `cdn.sheetjs.com` (M16) | **CERRADO, y con guardia** | `package.json:45` → `"xlsx": "file:vendor/xlsx-0.20.3.tgz"`. `runbook.test.ts:102-124` falla si **cualquier** dependencia de `package.json` o del lockfile se resuelve por `http(s)` fuera de `registry.npmjs.org`, y comprueba que el tarball vendorizado exista y pese >1 MB. |
| **[MEDIO]** El diagnóstico de configuración está apagado en `npm run dev` (M17) | **CERRADO** | `src/lib/observability/arranque.ts:76-79`: el `if (!desplegado)` ahora llama `avisarGruposDeConfiguracion(false)` **antes** del `return`. En local se dice qué grupo DURO falta; las SILENCIOSAS siguen calladas a propósito. |
| **[MEDIO]** `/api/health` no tiene consumidor (M18) | **CERRADO, y funcionando** | `.github/workflows/salud-produccion.yml:20-42`. Verificado contra la API: 3 corridas, **las 3 success** (runs `32566499072` push, `32568495584` y `32569599081` schedule), todas sobre `21630c0`. Producción contesta 200 con `ok:true`. |
| **[BAJO]** El arranque bloquea la primera petición con hasta 10 s de red externa (B11) | **CERRADO** | `instrumentation.ts`: `void verificarAvisoDePrivacidad().catch(() => {})`, con el porqué escrito («una instancia fría del webhook pagaba ese sondeo ANTES del primer 200 a Meta»). |
| **[MEDIO]** `verificaciones.sql` no sabe que existen las 0140–0143 | **Cerrado por decisión declarada, no por verificación.** `migraciones_verificadas.test.ts:70-73` las exime con razón escrita («score de prospección, no dinero»). Es una respuesta legítima y auditable; ya no hay hueco de proceso. |

### Reincidentes — el PR #38 no tocó un solo byte de este subsistema

`git log d432e89..HEAD -- .../piloto_vision.ts .../pagina_playwright.ts
src/lib/meta/client.ts .../avisar.ts` devuelve **cero commits** sobre esos cuatro
archivos. Todos los hallazgos del piloto de visión siguen exactamente donde
estaban, con los mismos números de línea:

| Abierto | Estado | Evidencia |
|---|---|---|
| **[CRÍTICO]** El piloto opera portales fiscales y todo su camino de fallo se registra en `info` | **REINCIDENTE** | `piloto_vision.ts` tiene 4 llamadas al logger, las mismas cuatro: `:121` warn, `:153` info, `:206` error, `:255` info. Las ocho salidas de fallo de `volar()` siguen mudas. |
| **[ALTO]** `piloto.fallo` no lleva `tenant` ni `codigo` | **REINCIDENTE** | `piloto_vision.ts:206`: `logger.error('piloto.fallo', { comercio: op.comercio.clave, error })`. Ninguno de los cuatro discriminadores que lee `sentry.ts`. |
| **[ALTO]** La captura no se persiste en ningún lado | **REINCIDENTE** | `al_vuelo.ts:467-468` sigue devolviéndola en el `Renglon`; `grep captura` sobre ese archivo da 11 coincidencias y **ninguna escribe** a base ni a storage. |
| **[ALTO]** La doble guarda de emisión se apaga sola en `<input type=submit>` | **REINCIDENTE** | `pagina_playwright.ts:828`: `texto: (el.textContent ?? (el as HTMLInputElement).value ?? '')…`. El `??` sigue sin caer al `value`. |
| **[ALTO]** `wa.sendText` convierte una condición esperada en `logger.error` a Sentry | **REINCIDENTE** | `src/lib/meta/client.ts:129-137` sigue emitiendo `logger.error('wa.sendText', …)` en cualquier `!res.ok`, y `avisar.ts:157` sigue llamándolo primero a propósito, sabiendo que fuera de la ventana de 24 h Meta rechaza con 131047. |
| **[MEDIO]** Las 8–14 llamadas de visión del piloto nunca llaman `registrarCosto` | **REINCIDENTE** | `grep registrarCosto piloto_vision.ts` → 0. |
| **[MEDIO]** «Credencial mala» y «portal caído» no se distinguen ni se escriben de vuelta | **REINCIDENTE** | `conectores/portales_facturacion.ts` sin cambios en el delta. |
| **[MEDIO]** `DEPLOY.md` no nombra `FACTURACION_PILOTO` ni `FACTURACION_MODO` | **REINCIDENTE** | `grep -n "FACTURACION_PILOTO\|FACTURACION_MODO" docs/conocimiento/DEPLOY.md` → **cero**. `.env.example:259-325` sí las documenta. Y la guardia nueva de `runbook.test.ts` **no puede** cazarlas: itera `SILENCIOSAS` y estas dos no están en la lista. |

---

## Hallazgos

### [CRÍTICO] El repo es público y el único control de acceso a `master` es cómo se llama una rama

`.github/workflows/auto-merge-rutina.yml:22-24`, `:29-32` y `:40-43` ·
`.github/workflows/ci.yml:24` · commit `b119a50` («Pedido de Javier — **el repo
es público a propósito**»)

El workflow declara `permissions: contents: write` + `pull-requests: write` y
dispara con `workflow_run` sobre **"CI"**. Su condición completa es:

```yaml
github.event.workflow_run.event == 'pull_request' &&
github.event.workflow_run.conclusion == 'success' &&
startsWith(github.event.workflow_run.head_branch, 'mejora/')
```

y su acción es `gh pr merge "$NUM" --squash --delete-branch`, donde `$NUM` sale
de `gh pr list --head "$RAMA"` — un filtro **por nombre de rama**. No hay
comprobación de que el PR venga del mismo repositorio, ni de quién lo abrió, ni
de que la base sea `master`.

`head_branch` en un `workflow_run` de un PR de fork es el nombre de la rama **en
el fork**. `gh pr list --head mejora/x` encuentra igual el PR cruzado.

Escenario, con valores: alguien forkea `github.com/javiercamarapp/likida.ai`,
crea la rama `mejora/2026-08-23-typo-en-el-readme`, y abre un PR con un cambio
de una línea en `README.md` más una línea en `src/lib/likida/cuadre/engine.ts`.
Javier —o el ajuste por defecto de Actions, si el autor ya no es «first-time
contributor»— aprueba que corra el CI de un PR que se ve trivial. `ci.yml` corre
sobre el código del fork (es `pull_request`, no `pull_request_target`: no hay
secretos que robar, ése no es el problema), y pasa, porque el cambio no rompe
ninguna prueba. Al terminar, `verde-mergea` lo mergea con squash a `master` y
borra la rama. **Nadie apretó «Merge».** Y si el asunto del commit resultante
lleva `[deploy]`, `vercel.json:3` lo publica en `app.likida.ai`.

Consecuencia: el repo que calcula el IVA acreditable de flotas mexicanas tiene
un camino de escritura a su rama principal cuyo control de acceso es una
convención de nombres. El operador no ve **nada**: el merge aparece como
actividad normal del bot, y —ver el ALTO de abajo— ni siquiera dispara la
corrida de CI sobre `master` que dejaría constancia.

Causa raíz probable: el gate se diseñó para un pipeline interno de confianza
(`scripts/mejora-diaria/correr.sh:78`, que es quien crea esas ramas) y se ancló
al artefacto más falsificable de ese pipeline —el prefijo de la rama— en vez de
al autor, al repositorio de origen o a una etiqueta que solo el dueño ponga.

---

### [CRÍTICO] `master` sigue sin protección: el incidente de ayer no tiene nada que se lo impida

`vercel.json:3` · `.github/workflows/ci.yml:21-24` ·
API de GitHub: `branches/master` → `"protected": false`

Ya está desarrollado arriba, pero va como hallazgo porque es la conclusión de la
pregunta que ordenó la ronda. La racha roja fue de **10 corridas** sobre
`master`, del 20-ago 22:07Z (`d432e89`) al 21-ago 21:47Z (`1c8a119`), con al
menos siete asuntos `[deploy]` publicados encima. Se cerró arreglando la
**prueba**, no la puerta.

Escenario: el 23-ago a las 02:00, la rutina de la noche hace
`git commit -m "[deploy] fix(cuadre): …"` y `git push origin master` con
`migraciones_verificadas.test.ts` en rojo por la migración 0150 que acaba de
escribir. GitHub pinta la ✗ en el commit; Vercel construye y publica igual
porque el asunto trae la bandera; `salud-produccion.yml` espera hasta 10 minutos
a que `/api/health` devuelva `version` = los 7 caracteres del sha nuevo, lo
consigue, y termina en **verde**. El operador tiene, a la mañana siguiente, un
deployment verde, un health verde y una ✗ en el historial de commits que nada
resume.

Consecuencia: no existe respuesta automática a «¿lo que corre en producción pasó
la suite?». Con un contralor adentro, ésa es la pregunta que decide si se puede
volver atrás con confianza o hay que auditar a mano.

Causa raíz probable: la compuerta y el despliegue siguen decididos por dos
señales que nadie ató —el resultado de Actions y el asunto del commit—, y la
única pieza que podría atarlas (un `required status check` sobre `master`) es
configuración de GitHub, no un archivo del repo, así que ninguna ronda de
arreglos de código puede cerrarla.

---

### [ALTO] El auto-merge mergea el HEAD del momento, no el sha que la auditoría aprobó

`.github/workflows/auto-merge-rutina.yml:40-43`

```bash
NUM=$(gh pr list --repo "$REPO" --head "$RAMA" --state open --json number,isDraft …)
gh pr merge "$NUM" --repo "$REPO" --squash --delete-branch
```

`gh pr merge` sin `--match-head-commit` mergea lo que sea el head del PR **en el
instante del merge**. El evento trae el sha auditado
(`github.event.workflow_run.head_sha`) y el workflow no lo usa en ningún lado.

Escenario, con tiempos reales de este repo: 05:34 la rutina pushea `a1b2c3d` a
`mejora/2026-08-23-x` y abre el PR; el CI tarda ~2 min y termina verde a 05:36.
El `workflow_run` encola `verde-mergea`, que arranca ~40 s después (los runs
medidos hoy tardan entre 1 y 10 s desde `created_at` hasta `updated_at`, pero la
cola de runners no está acotada). En esos 40 s el propio pipeline —o cualquiera—
pushea `e4f5g6h` a la misma rama. `concurrency` de `ci.yml:28-30` **cancela** la
corrida de `a1b2c3d`, pero la de `e4f5g6h` apenas empieza. `verde-mergea`
resuelve el PR por nombre de rama y squashea `e4f5g6h` a `master`: **código que
ninguna corrida verde tocó**.

Consecuencia: la promesa que el propio encabezado del archivo hace («el CI es la
auditoría… si pasó → se mergea») no se cumple en el caso que importa, y no deja
rastro: en `master` queda un squash cuyo mensaje dice que pasó la auditoría.

Causa raíz probable: se ató el permiso de merge al **PR** (identificado por
nombre de rama) en vez de al **commit** que la auditoría aprobó, que es el dato
que el evento ya entrega.

---

### [ALTO] Lo que auto-mergea el bot no vuelve a correr CI en `master` ni dispara el cotejo de salud

`.github/workflows/auto-merge-rutina.yml:36` (`GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`) ·
`.github/workflows/ci.yml:22-23` · `.github/workflows/salud-produccion.yml:22-23`

Un push hecho con el `GITHUB_TOKEN` del repo no dispara workflows nuevos —es
comportamiento documentado de Actions, y existe para evitar bucles—. El squash
que `verde-mergea` deposita en `master` lo hace ese token.

Escenario: `mejora/2026-08-23-x` se auto-mergea a las 05:36. `ci.yml`, que corre
`on: push: branches: ['**']`, **no corre** sobre `master`. `salud-produccion.yml`,
que corre `on: push: branches: [master]` y es lo único que compara el sha
desplegado contra el pusheado, **tampoco**. Vercel sí ve el push (su webhook es
independiente de Actions) y publica si el asunto trae la bandera.

Lo que queda: `master` avanza sin una sola corrida de CI propia, sin cotejo de
sha, y —si el squash publicó— con producción en un commit que el workflow de
salud no sabe que debía verificar. La única señal es la corrida del **PR**, que
ya se demostró arriba que puede no corresponder al código mergeado.

Consecuencia: se pierde justo la corrida que hace auditable el historial de
`master`, que es de donde salieron los datos del incidente de ayer.

Causa raíz probable: se eligió `secrets.GITHUB_TOKEN` por ser el camino sin
configuración, sin considerar que su efecto secundario es apagar el resto de la
cadena de verificación.

---

### [ALTO] La compuerta es no determinista: la prueba que ancla un CRÍTICO fiscal falla bajo carga y pasa sola

`src/lib/likida/cuadre/engine_iva_medio_pago.test.ts:35` ·
`.github/workflows/ci.yml:81-90` · `vitest.config.ts` (sin `retry`, sin
`sequence.seed` fijo)

Medido en esta corrida, sobre `38eef84`, tres veces:

| Corrida | Comando | Condición | Resultado |
|---|---|---|---|
| A, 11:18 | `npx vitest run` | con `npm run lint` corriendo **en paralelo** | **1 failed** \| 5513 passed \| 432 archivos · 208.28 s |
| B, 11:23 | `npx vitest run` | sola | 432 passed \| 5514 passed \| **114.93 s** |
| C, 11:23 | `npx vitest run src/lib/likida/cuadre/engine_iva_medio_pago.test.ts` | sola | 3 passed · 0.63 s |

El único fallo de A es la primera aserción del archivo:

```
❯ src/lib/likida/cuadre/engine_iva_medio_pago.test.ts:35:32
   35| expect(ivaDe(gasto('99'))).toBe(0);
```

Ese archivo es el ancla del CRÍTICO fiscal de `59c02ec` («el IVA acreditable
exige pago efectivo, LIVA 5-III»), y su propio encabezado dice por qué existe:
«sin esta prueba, revertir el candado no rompía nada». `cuadrarViaje` es pura
—`grep "Date.now\|new Date\|performance.now"` sobre `cuadre/engine.ts`,
`cuadre/guardia.ts` y `liquidacion/deducibilidad.ts` da **cero**—, así que el
veredicto no depende del código sino de la máquina: la única variable entre A y
B fue la contención de CPU.

Escenario: el 25-ago la rutina nocturna abre un PR `mejora/*`. El runner de
GitHub va cargado y `ci.yml` sale rojo por esta prueba. `rojo-avisa`
(`auto-merge-rutina.yml:52-61`) comenta «🔴 La auditoría (CI) salió en rojo».
Quien lo mire corre la prueba en su máquina, pasa en 0.63 s, y aprende la
lección equivocada: *«es el flaky de siempre, dale re-run»*. La siguiente vez
que la compuerta se ponga roja **de verdad** —como el 20-ago— ya está entrenado
el reflejo de pasarla por alto. Y del otro lado: el mismo no determinismo
significa que un PR `mejora/*` con un fallo real puede salir verde en el intento
afortunado y auto-mergearse.

Consecuencia: el resultado de la única compuerta automática del repo no es una
función del código. Eso no solo deja pasar defectos; destruye el valor de la
señal, que es el activo que este rubro cuida.

Causa raíz probable: no la determiné —la prueba es de una función pura, así que
la interferencia viene de fuera del archivo (aislamiento del pool, orden, o un
worker degradado bajo carga)—. Lo que sí es del rubro: la compuerta no tiene
`retry`, ni cuarentena, ni un registro de intermitencia (`.latido-salud` lleva
12 días sin actualizarse), así que un fallo así no se distingue de uno real.

---

### [MEDIO] El runbook promete que el monitor cubre la deriva del `ignoreCommand`, y el workflow sale por la puerta de atrás justo en ese caso

`.github/workflows/salud-produccion.yml:52-55` · `docs/conocimiento/DEPLOY.md:205-210`
· `salud-produccion.yml:6-8` (su propio encabezado)

El encabezado del workflow nombra la deriva: «el campo `version` —el único
detector de la deriva silenciosa del `ignoreCommand` (**push sin `[deploy]` en el
asunto = producción se queda atrás sin avisar**)— no se comparaba contra nada».
`DEPLOY.md:208-210` lo repite como cubierto: «tras cada push a `master` cuyo
asunto lleve `[deploy]`… falla si no — que es **exactamente el modo de falla
silencioso** del `ignoreCommand`».

El código hace lo contrario:

```bash
if ! printf '%s' "$asunto" | grep -qi '\[deploy\]'; then
  echo "El asunto no lleva [deploy]: este push NO construye a propósito … Nada que cotejar."
  exit 0
fi
```

Y la rama `schedule` (`:34-42`) solo comprueba `ok:true`: **nunca** compara
`version` contra el HEAD de `master`.

Escenario con valores: 23-ago, Javier arregla el PDF y hace
`git commit -m "fix(pdf): el folio se corta a 12 caracteres"` —sin bandera, que
es el olvido que `DEPLOY.md:186` documenta como el modo de falla— y pushea.
`salud-produccion` corre, imprime «Nada que cotejar», **verde**. Las 48 corridas
programadas del día siguiente también dan verde: producción contesta 200. El
lunes, en el demo, el contralor ve el folio cortado en el PDF que Javier arregló
el sábado, y el tablero de Actions lleva 50 palomitas seguidas.

Consecuencia: el documento de las 3 a.m. afirma una cobertura que el código no
tiene, y encima invita a dejar de hacer el cotejo manual (`git log -1` +
`vercel inspect`) que sí la daba. Un rótulo que no es verdad en el runbook es
peor que no tener runbook.

Causa raíz probable: el workflow se escribió alrededor del caso «puse la bandera
y el build no llegó», que es el fácil de detectar, y el texto se escribió
alrededor del caso que dolía.

---

### [MEDIO] El asunto que decide si se publica a producción lo redacta un modelo barato, y el único candado está en la mitad equivocada del merge

`scripts/mejora-diaria/correr.sh:99` y `:133` ·
`.github/workflows/auto-merge-rutina.yml:43` · `vercel.json:3`

El encargo que la rutina le da a Claude Code es explícito: «Commit (conventional,
en español, **SIN "[deploy]" en el asunto**…)» (`correr.sh:99`). Pero el
título del PR no lo escribe ese agente: sale del JSON del auditor barato
(gpt-oss-120b) que abrió el hallazgo —

```bash
--head "$RAMA" --title "mejora-diaria: $TITULO"
```

donde `$TITULO` es `json.load(...)['titulo']` (`correr.sh:76`). Y el merge es
`--squash`: según el ajuste de título de squash del repositorio, o cuando el PR
lleva más de un commit, el asunto del commit que aterriza en `master` es **el
título del PR**, no el del commit que sí pasó por el candado.

Escenario con valores: el auditor barato revisa el área «operabilidad» —que es
un área real de su rotación— y devuelve
`{"titulo":"el ignoreCommand [deploy] no valida el estado de CI", …}`. La rutina
abre el PR «mejora-diaria: el ignoreCommand [deploy] no valida el estado de CI»,
el CI pasa, `verde-mergea` squashea, y el asunto en `master` contiene `[deploy]`.
`vercel.json:3` es un `grep -qi '\[deploy\]'` sobre esa línea: **producción se
publica a las 05:36 de la madrugada sin que nadie lo haya decidido**, con un
parche que ningún humano leyó.

Consecuencia: la palanca de publicación del producto acaba dependiendo del texto
libre de un modelo de $0.10 que está escribiendo *sobre esa misma palanca*.

Causa raíz probable: el candado se puso sobre el asunto del commit, y el método
de merge elegido después (squash) puede descartar precisamente ese asunto.

---

## Lo que revisé y está bien

- **`src/lib/likida/interruptores.ts:71-112` es el mejor arreglo del delta.**
  El tercer estado (`ilegible`) no se inventó en cada cron: se modeló una vez en
  `LecturaInterruptor`, `estaApagado` lo colapsa a fail-closed para quien no
  necesita distinguir, y los cinco crons lo distinguen con la misma forma. El
  grito lleva `codigo` (fingerprint por causa) **y** correo, y el comentario
  explica por qué cinco crons verdes sin trabajo es el peor síntoma posible.
- **`src/lib/observability/alerta.ts` completo.** Nunca lanza, redacta el
  detalle antes de mandarlo a un tercero (`redactarTexto`), piso de una hora por
  evento con la marca puesta **antes** del envío, y el propio archivo declara que
  el rate limit en memoria es de mejor esfuerzo y que el respaldo real es el
  fingerprint de Sentry. Las tres decisiones están escritas y son las correctas.
- **`src/app/api/health/route.ts`.** Mide una consulta real (`HEAD + count` sobre
  `tenant`), devuelve **503** cuando la base no contesta —no un 200 con
  `ok:false`, que es lo que un monitor no sabría leer— y declara por escrito qué
  **no** mide y por qué. Y ahora tiene consumidor, con tres corridas verdes.
- **`src/lib/observability/arranque.ts:44-61` + `runbook.test.ts:135-136`.**
  Que la prueba itere la lista viva en vez de un literal es la diferencia entre
  una guardia y un adorno: hoy una variable nueva en `SILENCIOSAS` no puede
  entrar sin que `DEPLOY.md` la nombre.
- **`docs/conocimiento/DEPLOY.md:155-166`.** La sección «Lo que este runbook NO
  cubre» dice con todas sus letras que no hay guardia ni escalación, y que la
  retención de los runtime logs sigue sin medirse. Un runbook que declara sus
  huecos vale más que uno que los omite.
- **`src/lib/admin/slo.ts:43-60`.** `cumple: null` con «muestra insuficiente
  (mínimo 5)» en vez de un 100% fabricado sobre dos filas. Es la regla de la casa
  aplicada a la observabilidad, no solo al dinero.
- **El árbol typechequea y lintea limpio**: `npx tsc --noEmit -p .` exit 0;
  `npm run lint` exit 0 (5 warnings, 0 errors). La guardia de migraciones que
  tumbó el CI ayer pasa: `npx vitest run migraciones_verificadas runbook` →
  14 passed. La suite completa pasa **cuando la máquina está desocupada**
  (432 archivos, 5514 pruebas) — ver el ALTO de la compuerta no determinista.

---

## Lo que NO alcancé a revisar

- **El ajuste de título de squash del repositorio** (`PR_TITLE` vs
  `COMMIT_OR_PR_TITLE`). Es lo que decide si el MEDIO del `[deploy]` en el título
  del PR es un camino abierto o uno cerrado por configuración. Se lee en un clic
  desde Settings → General → «Default to pull request title»; desde aquí la API
  del repo me la devolvió bloqueada por el proxy.
- **El ajuste de aprobación de workflows para contribuyentes externos**
  (Settings → Actions → «Fork pull request workflows from outside
  collaborators»). Modula cuánto empuja el CRÍTICO del auto-merge, pero no lo
  elimina: el default deja pasar a quien ya tenga una contribución aceptada.
- **Si `SENTRY_DSN` y `ALERTA_EMAIL` están de verdad puestas en Vercel.** Tercera
  ronda seguida que lo pido. Todo el aparato de alerta verificado arriba se apoya
  en eso, y `/api/health` lo dice (`sentry: configurado|sin_dsn`) — pero no lo
  pude consultar desde aquí.
- **`ci-postgres.yml`.** Es el único workflow que corre `verificaciones.sql`
  contra una base real y no miré su estado ni su disparador.
- **La retención real de los runtime logs de Vercel y si hay log drain.**
  Declarado pendiente en `DEPLOY.md:164-166` desde hace rondas; sigue siendo lo
  que decide si «quedó en el log» significa algo doce horas después.
- **La causa del fallo intermitente de `engine_iva_medio_pago.test.ts`.** Lo
  reproduje una de dos veces y descarté el reloj dentro del motor, pero no
  aislé al vecino que lo contamina. Hacen falta corridas repetidas con
  `--sequence.seed` fijo y `--pool=forks --no-file-parallelism` para acotarlo, y
  eso es una sesión propia.
- **`.latido-salud`** sigue fechado el **10-ago** (12 días). No lo perseguí; es
  del rubro de salud del repo, pero conviene que alguien lo mire.
