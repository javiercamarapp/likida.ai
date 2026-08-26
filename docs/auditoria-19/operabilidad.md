# Operabilidad y DX — auditoría 19

**Nota: 6/10** (antes 6). Razón del movimiento: **se atacó y subió** y **mirada más
profunda**, del mismo tamaño, otra vez — pero por motivos distintos a los de la c4.

- **Subió, y es medible.** Los dos hallazgos más caros de la c4 están **cerrados**:
  `sin_calificar` ya **falla** el CI (`correr-verificaciones.mjs:412-427`) y el
  auto-merge ya exige que **todos** los checks estén verdes, no solo "CI"
  (`auto-merge-rutina.yml:47-64`). `ci-postgres` está **verde hoy sobre `master`**
  (run #381, sha `8b43121`, 24-ago 08:03 — verificado por la API de GitHub), contra
  las 24 h en rojo que reportó la ronda anterior. `.github/workflows/NOTAS-SEGURIDAD.md`
  es el mejor documento del rubro: dice qué compuerta está apagada, por qué (el plan
  de GitHub, no el código) y qué hay que comprar o tocar. Y **la pregunta de cuatro
  rondas se contestó**: el cuerpo vivo de `/api/health` de las 11:01 de hoy dice
  `"sentry":"configurado"` y `"ratelimit":"redis"`.
- **Bajó lo nuevo.** Las **dos** superficies que estrena este delta —el outbox durable
  y la entrevista de onboarding que escribe la configuración fiscal— salieron **sin el
  cableado de alerta que el resto del repo ya tiene**. El outbox tiene un estado
  `dead` que nadie consulta y un cron que no llama a `alertarOperador` ni una vez; la
  entrevista se traga tres excepciones de escritura fiscal sin dejar una línea. Cada
  una de las dos repite, en 2026-08-24, el modo de falla que su gemela vieja
  (`drenado.ts:148-150`, `chat/route.ts:132`) ya había arreglado.

**El riesgo mayor del rubro, hoy:** el latido mide que el cron **corrió**, nunca que
**funcionó**, y el único canal push (`alertarOperador`) no está conectado al camino
nuevo. Un `wa-outbox` que falla las 1,440 corridas del día se ve `"ok"` en
`/api/health`, verde en el workflow de salud, y no manda un solo correo.

---

## Verificación de los abiertos de la c4

| Hallazgo (c4) | Estado hoy | Evidencia |
|---|---|---|
| **[CRÍTICO]** La batería de Postgres no califica sus bloques nuevos y sale «pasó» | **ARREGLADO en su mitad grande, ABIERTO en la otra** → ver ALTO abajo | `correr-verificaciones.mjs:412-427`: `sin_calificar` ahora **sale con 1** si el bloque es nuevo. Pero los 21 viejos —incluidos `RPCS_0159`, `AGREGADOS_0150`, `STRIPE_0163`— quedaron indultados en `SIN_CALIFICAR_CONOCIDOS` (`:386-410`). |
| **[ALTO]** El auto-merge solo escucha "CI" | **CERRADO** | `auto-merge-rutina.yml:47-64`: bucle de 30×20 s sobre `gh pr checks`; rojo → comenta y `exit 1`. Migración rota o fuga entre flotas ya bloquean el merge. |
| **[CRÍTICO]** El repo es público y `master` sin protección | **Mitad cerrada, mitad ABIERTA y ahora POR ESCRITO** | El repo es privado (dato ya verificado, un colaborador). `NOTAS-SEGURIDAD.md:32-48` documenta que la protección de `master` **responde 403 por plan** y que hoy no existe. Prueba viva de que importa: `8b43121` (87 archivos) entró a `master` por push directo. |
| **[CRÍTICO]** El piloto de visión: ocho salidas de fallo sin una línea | **REINCIDENTE, byte por byte** | `git log -- .../piloto_vision.ts` → un solo commit, `f5bdc3f`; el delta no lo tocó. Sigue con `warn:121`, `info:153`, `error:206`, `info:255` y cero `alertarOperador`. No lo repito: está desarrollado en `operabilidad-c4.md:117-139`. |
| **[ALTO]** `/api/health` pública y sin límite de tasa | **REINCIDENTE** | `health/route.ts:54` sigue sin `rateLimit` (compárese con `export/poliza/route.ts:65,72`, que sí lo tiene dos veces). Sigue haciendo dos consultas + posible `SET NX PX` por GET anónimo. |
| **[ALTO]** El cotejo de producción se queda verde con los crons muertos | **REINCIDENTE, y hoy con prueba viva** | `salud-produccion.yml:41-42` sigue comprobando solo `200` y `grep '"ok":true'`. Ver el CRÍTICO 2. |
| **[MEDIO]** `salud-produccion.yml` sale por la puerta de atrás sin `[deploy]` | **REINCIDENTE, y hoy se disparó de verdad** | `:52-55`. Ver el CRÍTICO 2. |
| **[MEDIO]** `DEPLOY.md` no nombra `FACTURACION_PILOTO`/`FACTURACION_MODO` | **REINCIDENTE, y peor** | `grep` → 0. Y ahora tampoco las cuatro `CALCOM_*` que estrena el delta. Ver MEDIO. |
| **[MEDIO]** `.latido-salud` fechado el 10-ago | **REINCIDENTE, ahora 14 días** | `.latido-salud:1` → `fecha: 2026-08-10`, cuerpo «3157 passed … 252 archivos» contra los ~6,300 de hoy. |
| **[ALTO]** El auto-merge mergea el HEAD del momento | **REINCIDENTE, pero más estrecho** | `auto-merge-rutina.yml:71` sigue sin `--match-head-commit`. La ventana se redujo: `:47-64` re-consulta los checks justo antes. Ver MEDIO. |
| **[BAJO]** README anuncia `/chofer`; `npm run setup` falla en máquina limpia | **REINCIDENTE** | `README.md:81` sigue listando `/chofer`; `package.json:15` (`"setup": "npm install && npm run seed"`) y `scripts/seed.sh:11-15` (`❌ Falta DATABASE_URL`, `exit 1`). |
| **`scripts/demo-5k.sql` roto en su primer insert** | **REINCIDENTE, verificado hoy parseando** | Ver MEDIO. |
| **`SENTRY_DSN` / `ALERTA_EMAIL` / Upstash puestas en Vercel** | **Sentry y Upstash: CONFIRMADAS** | Cuerpo vivo de `/api/health` (log del job 97408262701, 24-ago 11:01): `"sentry":"configurado","ratelimit":"redis"`. `ALERTA_EMAIL` sigue sin confirmar (no sale en el cuerpo). |

---

## Hallazgos

### [CRÍTICO] El outbox durable —el P0 «el CFDI que se perdía»— tiene un estado `dead` que **nadie** consulta y un cron que no alerta ni una vez

`src/app/api/cron/wa-outbox/route.ts:51-57` · `supabase/migrations/0180_reservas_agente_y_outbox_wa.sql:112`
· `src/lib/likida/wa_outbox.ts:35-40` · `src/lib/meta/client.ts:474,482`
· contraste: `src/app/api/cron/wa-pendientes/drenado.ts:147-150`

Abrí el cron entero: **no importa `alertarOperador`**. Es el único de los siete que
no lo hace (`grep -rn alertarOperador src/app/api/cron/` → `escalar`, `runner`, `gps`,
`wa-pendientes`, `facturar`, `purgar`; falta `wa-outbox`). Y `grep -rn "'dead'" src/`
devuelve **cero**: la migración escribe el estado terminal y ninguna pantalla, cron o
consulta lo vuelve a mirar.

Escenario con valores. Se cierra la liquidación del viaje **V-8842** de la flota
Innovativos. `sendDocument` manda el PDF y Meta contesta **HTTP 500** (transitorio,
`esReintentableMeta` → true), así que `client.ts:482` encola la carga en `wa_outbox`.
El cron corre cada minuto. Meta sigue devolviendo 500 por una incidencia de 90
minutos. A la 8ª vuelta, `finalizar_wa_outbox` evalúa `intentos >= 8` y pone
`estado='dead'` (`0180:112`). A partir de ahí `reclamar_wa_outbox` ya no la toma
(`:88-91` filtra por `pending`/`sending`), así que ni siquiera vuelve a aparecer en
el conteo `fallidas`. Resultado exacto:

- **Cero correos.** `alertarOperador` no se llama en ninguna rama del cron.
- **Cero líneas de log por mensaje.** `finalizarSalidaWhatsApp` (`wa_outbox.ts:39`)
  solo escribe si el propio RPC de finalizar falla; el fallo de **envío** viaja como
  argumento `p_error` a una columna y no pasa por `logger`.
- **Latido `parcial`**, que —ver el ALTO de abajo— no lo lee nadie.
- **`/api/health` sigue diciendo `"ok"`** y `salud-produccion.yml:42` sigue verde.

El operador nunca recibe su liquidación en PDF, el contralor la ve «entregada» en el
panel, y a la mañana siguiente lo único que existe es una fila `wa_outbox` con
`estado='dead'` que hay que saber que existe para ir a buscarla.

Lo que confirma que es una omisión y no un criterio: la **misma** mecánica del lado
de entrada sí está cableada. `drenado.ts:147-150` cuenta las cartas muertas, emite
`logger.error('cron.wa_pendientes.cartas_muertas')` y manda
`alertarOperador(..., { codigo: 'cartas_muertas' })`. El outbox es su espejo de
salida y nació sin esa mitad.

Y el runbook lo afirma al revés: `docs/conocimiento/DEPLOY.md:222` enumera los crons
que alertan —«`escalar`, `facturar`, `purgar`, `wa-pendientes`, `runner`»— y `:268`
promete «`ALERTA_EMAIL` recibe un correo por **cada cron que falla**». Los dos crons
nuevos del delta no están en esa lista, y para `wa-outbox` la promesa es falsa.

**Consecuencia:** el camino por el que sale el papel que el contralor cruza contra su
contabilidad puede perder mensajes sin que nadie se entere, y el documento que se abre
a las 3 a.m. dice que sí se enteraría.

**Causa raíz probable:** el cron se escribió como drenador mecánico del lease y nunca
pasó por la campaña de `codigo`/`alertarOperador` que sí recorrió los otros seis
(`883055e`, `0d1d7fe`, `faa959f`).

---

### [CRÍTICO] Producción corre `df6b1be` y `master` está en `8b43121`: 87 archivos sin desplegar, y los tres semáforos en verde

`.github/workflows/salud-produccion.yml:34-42` y `:44-55` · `src/app/api/health/route.ts:93`
· `vercel.json:3` · (REINCIDENTE, la c4 lo tenía como MEDIO — hoy hay prueba viva)

No es hipotético. El log del job **97408262701** (`Salud de producción` #102, 24-ago
11:01 UTC) trae el cuerpo literal de producción:

```
status=200 cuerpo={"ok":true,"db":"ok","sentry":"configurado","ratelimit":"redis",
"version":"df6b1be","hora":"2026-08-24T11:01:11.451Z",
"crons":{"wa-pendientes":"ok","escalar":"ok","facturar":"ok","purgar":"ok","runner":"ok","gps":"ok"}}
```

`version` es **`df6b1be`**. El HEAD de `master` es **`8b43121`**, empujado a las 08:03
de hoy con el asunto «feat: endurecer Likida de punta a punta para operación
enterprise» — **sin `[deploy]`**, así que `vercel.json:3` no construyó. Los 87
archivos de ese commit (el outbox durable, las entregas distribuidas, el onboarding
por chat, las siete migraciones 0172-0184) **no están en producción**. La lista
`crons` del cuerpo lo confirma sola: son **seis**, sin `wa-outbox`, porque en
`df6b1be` la constante `CRONS` todavía no lo incluía (`git show df6b1be:src/lib/admin/salud.ts:28`).

Y los tres mecanismos que existen para detectarlo pasaron de largo:

1. `salud-produccion.yml:52-55` — el paso que **sí** compara el sha se llama «El sha
   desplegado es el que se pusheó (solo push con `[deploy]` en el asunto)» y arranca
   con `if ! grep -qi '\[deploy\]'; then … exit 0`. En el run #98 (push de `8b43121`)
   ese paso salió **`skipped`**.
2. La rama `schedule` (`:34-42`) comprueba **exactamente dos cosas**: `status = 200` y
   `grep -q '"ok":true'`. **Nunca** mira `version`. Las 48 corridas diarias de hoy son
   palomitas verdes sobre una producción tres commits atrás.
3. `/api/health` **publica** `version` (`route.ts:93`) y nadie del lado programado la
   consume.

**Consecuencia:** si Javier abre `app.likida.ai` para enseñar el producto, enseña
`df6b1be` creyendo que enseña lo de hoy — incluidas las correcciones al camino del
dinero que ese commit trae. Y a la pregunta «¿está desplegado lo último?» los tres
tableros contestan que sí. `CLAUDE.md` ya advierte que «el modo de falla es
silencioso»; lo que falta no es documentación, es que el monitor programado compare
el campo que él mismo imprime.

**Causa raíz probable:** el cotejo de deriva se colgó del disparador `push` (donde
`[deploy]` tiene sentido) en vez de la rama `schedule` (donde la pregunta correcta es
«¿producción corresponde al HEAD de `master`?», que no depende de la bandera).

---

### [ALTO] La entrevista de onboarding escribe el receptor CFDI de la flota y, si la escritura falla, no queda **una sola línea** en el servidor

`src/lib/likida/perfil/entrevista-aplicar.ts:145-146`, `:177-178`, `:186-187` ·
`src/lib/saas/fiscal.ts:200` · `src/app/api/dashboard/onboarding-chat/route.ts:77-79`

`nutrirDesdeHechos` hace cuatro escrituras reales desde lo que el modelo entrevistó.
**Tres de las cuatro** capturan la excepción y la convierten en prosa para el chat,
sin `logger`:

| Línea | Escribe | Qué hace el `catch` |
|---|---|---|
| `:145-146` | `guardarDatosFiscales` — **RFC, razón social, régimen SAT, CP fiscal** | `notas.push(e.message)` — **sin log** |
| `:167-169` | `guardarPolitica` | `logger.warn('entrevista.politica', { err })` — **sin `tenantId`** |
| `:177-178` | `crearOperador` | `notas.push(...)` — **sin log** |
| `:186-187` | `crearUnidad` | `notas.push(...)` — **sin log** |

Y las funciones de abajo tampoco loguean: `fiscal.ts:200` es
`if (error) throw new Error(\`guardarDatosFiscales: ${error.message}\`)` en un archivo
con **cero** llamadas a `logger` (`grep -c "logger\." src/lib/saas/fiscal.ts` → 0).

Escenario con valores: el contralor de Innovativos declara por chat RFC
`INN150812AB3`, razón social, régimen **`626`** y CP `66600`. `guardarDatosFiscales`
hace `update tenant` y Postgres lo rechaza porque el CHECK
`tenant_regimen_fiscal_dominio` no admite ese régimen en esta base (la 0172 amplió el
dominio a 624 y esta instalación no la aplicó). El `catch` de `:145` empuja el texto
al hilo; `route.ts:85` devuelve **HTTP 200** con un stream NDJSON; el contralor lee la
línea, cree que fue un tropiezo del chat y sigue. Al día siguiente la facturación se
niega o emite contra datos viejos. En el servidor: **nada**. Ni un `warn`, ni un
`error`, ni Sentry.

La única línea que sí sale, cuando el fallo es del turno completo
(`onboarding-chat/route.ts:78`), es
`logger.error('onboarding_chat.turno', { err })` — **sin `tenantId` ni `userId`**,
teniéndolos los dos en alcance (`efectivo.tenantId` en `:34`, `sesion.userId` en `:63`).
Es una regresión respecto de la ruta hermana: `src/app/api/dashboard/chat/route.ts:132`
sí emite `logger.error('chat.analista.fallo', { tenantId, err })`.

**Consecuencia:** la superficie agéntica que le escribe la **configuración fiscal** al
tenant es hoy la menos reconstruible del repo. A la pregunta «¿por qué la flota X
quedó sin receptor CFDI?» no hay nada que buscar, y con dos flotas onboardeando el
mismo día ni siquiera se sabe cuál falló.

**Causa raíz probable:** el módulo `perfil/` se escribió acumulando `notas` para el
usuario y se tomó esa lista como si fuera el canal de diagnóstico; el canal del
usuario y el del operador no son el mismo.

---

### [ALTO] El `estado` del latido (`fallo` / `parcial` / `saltado`) no lo lee nadie: un cron puntual que falla siempre se ve `"ok"` en los tres semáforos

`src/lib/admin/salud.ts:109-117` · `src/app/api/health/route.ts:71` ·
`src/app/admin/salud-sistema/page.tsx` (sin `estadoLatidos`) ·
`.github/workflows/salud-produccion.yml:42`

`registrarLatido` guarda `estado` en `cron_latido` y los siete crons lo alimentan bien
(`gps:77,80,88`; `wa-outbox:51,56`; etc.). Pero `juzgarLatido` (`salud.ts:113`) decide
**solo por frescura**: `hace > CADENCIA_MS + TOLERANCIA` → `vencido`, si no `ok`. El
campo `ultimoEstado` que la función devuelve (`:115`) **no lo consume nadie**:
`health/route.ts:71` proyecta únicamente `latidos[c].estado`, y
`grep -rn estadoLatidos src/` devuelve **una sola** llamada, la de `/api/health` —
`/admin/salud-sistema` no la usa.

Escenario con valores, y es el que hoy está armado: el cron `gps` corre cada 5 min. La
única flota con GPS conectado tiene el token de Samsara vencido, así que
`sincronizarGpsDeFlota` devuelve `error` por flota y el cron registra
`registrarLatido('gps', 'parcial')` (`gps/route.ts:77`). El comentario de `:24-28`
explica —con razón— por qué no alerta por flota. Resultado: 288 corridas al día, cero
posiciones escritas, y `/api/health` diciendo `"gps":"ok"` (exactamente lo que
imprimió el job de las 11:01). El mapa de flota lleva días con la última posición
conocida y ninguna señal dice que la fuente se secó.

El mismo mecanismo tapa el CRÍTICO 1: `wa-outbox` registra `'parcial'` o `'fallo'`
cada minuto y `/api/health` lo reporta `"ok"`, y el workflow solo hace
`grep -q '"ok":true'` sobre el objeto entero.

**Consecuencia:** el aparato de latidos —que es bueno, y que la c4 elogió con razón—
mide **presencia**, no **salud**, y el consumidor no puede distinguir «corrió y
funcionó» de «corrió y falló 288 veces». Es la diferencia entre un monitor y un
reloj.

**Causa raíz probable:** `estadoLatidos` se diseñó para contestar «¿está muerto?» y el
campo `estado` se añadió después (0155) sin que ningún consumidor lo incorporara.

---

### [ALTO] El sondeo de arranque se congeló en la 0171: trece migraciones de este delta pueden faltar y el sistema arranca igual

`src/lib/likida/startup.ts:287-294` · `src/lib/likida/startup_diagnostico.test.ts:361`
· `src/lib/admin/salud.ts:77-86`

`COLUMNAS_RECIENTES` tiene seis entradas y la última es **`0171`**. El delta trajo
`0172`…`0184` (falta la 0179; el número no existe). Solo la 0172 se sondea aparte
(`startup.ts:227-250`). Las **doce** restantes —incluidas `0176_gps_ingesta`,
`0177_entregas_distribuidas`, `0180_reservas_agente_y_outbox_wa` y
`0175_poliza_datos`— no tienen sonda.

Y la prueba que debería empujar la lista no puede: `startup_diagnostico.test.ts:361`
es
`expect(Object.keys(COLUMNAS_RECIENTES)).toEqual(expect.arrayContaining(['0119','0132','0149','0168','0169','0171']))`
— un `arrayContaining` sobre un literal fijo. Pasa para siempre sin que se añada una
sola entrada más.

Escenario con valores: se despliega `8b43121` (con `[deploy]`) y se olvida el
`supabase db push`. Cadena exacta:

1. `wa_outbox` no existe → `encolarSalidaWhatsApp` (`wa_outbox.ts:16`) recibe error de
   PostgREST → `logger.error('wa.outbox_no_encolado')` y **el PDF de la liquidación se
   pierde**, que es el P0 que 0180 vino a cerrar.
2. `reclamar_wa_outbox` no existe → el cron lanza cada minuto, cae al `catch`
   (`route.ts:53-57`) y devuelve **500**.
3. `cron_latido` conserva el CHECK viejo (0180:124-126 es quien añade `'wa-outbox'` al
   dominio) → el upsert de `registrarLatido` rebota → `logger.warn('cron.latido_sin_escribir')`
   (`salud.ts:82`), **nunca lanza**.
4. `/api/health` reporta `"wa-outbox":"sin_latido"`, y el propio encabezado de la ruta
   declara que **eso no alarma** a propósito (`health/route.ts:32-33`: «`sin_latido`
   (recién desplegado, tabla vacía) no alarma»).

Resultado: el cron devuelve 500 cada minuto durante días y el único rastro son
`logger.error` en el runtime log de Vercel — cuya retención `DEPLOY.md:277-279`
declara **desconocida**. Cero correos, health verde en lo que mira el workflow.

**Consecuencia:** el sondeo de arranque existe justamente para que un despliegue
adelantado a su base grite, y hoy cubre hasta la migración de hace dos semanas. El
mismo commit que trae 13 migraciones no toca la lista que las vigila.

**Causa raíz probable:** la lista es un literal mantenido a mano y su prueba se
escribió con `arrayContaining` (contiene al menos), que por construcción no puede
exigir crecimiento.

---

### [ALTO · REINCIDENTE] El bloque que prueba que un sobrepago rebota sigue sin calificarse — ahora con permiso escrito

`scripts/ci/correr-verificaciones.mjs:386-410`, `:412-427` ·
`supabase/verificaciones.sql` bloque `RPCS_0159`

Lo que se arregló el 23-ago es real y hay que decirlo: `sin_calificar` pasó de aviso a
**falla**, y un bloque **nuevo** que el parser no sepa leer rompe el CI (`:414-426`).
Eso cierra la mitad grande del CRÍTICO de la c4.

Lo que queda: los 21 bloques que ya no se calificaban entraron a
`SIN_CALIFICAR_CONOCIDOS` (`:386-410`) con su razón escrita, y **entre ellos están los
seis de dinero** que la c4 nombró uno por uno: `RPCS_0159` («el esperado agrupa nueve
banderas»), `AGREGADOS_0150`, `FISCAL_AGREGADO_0151`, `REGISTRO_0154`, `PURGAS_0155`,
`STRIPE_0163`.

Escenario, idéntico al de la c4 y todavía vigente: alguien reescribe
`registrar_pago_tx` y el guard del sobrepago deja de aplicar. Un pago de **$1,500**
contra una factura de **$1,000** entra. El bloque corre en CI Postgres, hace su ataque
y lanza `RPCS_0159 … sobrepago-rebota=f …`. El runner cuenta claves contra esperados,
no alinea, incrementa `sinCalificar`, comprueba que `RPCS_0159` está en la lista de
indultados y imprime «Ninguno nuevo» → **«La batería pasó»**, exit 0.

**Consecuencia:** la regresión más cara del producto —dinero que entra dos veces—
sigue teniendo su prueba escrita, corriendo, y sin poder ponerse en rojo. La lista es
honesta y trae su razón; el problema es que se hizo permanente sin fecha ni tope.

**Causa raíz probable:** la deuda se hizo nominal (bien) pero sin presupuesto: nada
obliga a que la lista baje ni prioriza los seis bloques de dinero dentro de ella.

*(Salvedad honesta, la misma de la c4: aquí no hay Postgres. Esto es lectura del
parser y de la lista, no una corrida.)*

---

### [MEDIO · REINCIDENTE] `scripts/demo-5k.sql` sigue muriendo en su primer `insert` por un `--` dentro de un literal JSON

`scripts/demo-5k.sql:48`

La línea es, literal:

```sql
{"concepto":"caseta","topeMonto":5000},   -- una línea del estado del TAG por viaje
```

y vive **dentro** del literal `'{"empresa":…}'::jsonb` que abre en `:44` y cierra en
`:56`. Dentro de comillas simples, `--` no es un comentario de SQL: son dos guiones de
texto. Lo verifiqué extrayendo el literal del archivo y parseándolo:
`JSON INVALIDO: Expecting value: line 3 column 67`.

Escenario: se pega el BLOQUE 1 en el SQL editor de Supabase para sembrar la flota
demo «Transportes Peninsulares». Postgres contesta
`invalid input syntax for type json … Token "-" is invalid` en el `insert into tenant`
y aborta. **Ni el tenant, ni las 25 terminales, ni los 40 clientes, ni las tarifas.**
Los bloques 2-5 dependen del tenant, así que la siembra completa —5,000 unidades,
~27,500 viajes, ~24,000 liquidaciones— no arranca nunca.

**Consecuencia:** el guion documentado en `docs/demo-5k.md` no se puede ejecutar. Se
descubre en el minuto cero de intentarlo, no en la sala — por eso es MEDIO y no
CRÍTICO —, pero lleva rondas así y nadie lo ha corrido: es la prueba de que el
artefacto del demo no se ha ensayado.

**Causa raíz probable:** el JSON se escribió con comentarios de SQL dentro de un
literal, y nada valida los `.sql` de `scripts/` (ni CI ni una prueba de vitest los
mira).

---

### [MEDIO] El análisis estático «que SÍ corre» no puede ponerse rojo: 132 avisos de seguridad y ningún techo

`package.json:15` · `eslint.config.mjs:60`, `:73` · `.github/workflows/ci.yml:70`

`2151b98` cambió CodeQL (que no puede correr sin GHAS) por `eslint-plugin-security`
con reglas elegidas una por una, y eso es lo correcto. Pero lo corrí:

```
npm run lint → 157 problems (0 errors, 157 warnings)
  93 security/detect-non-literal-fs-filename
  39 security/detect-unsafe-regex
```

`package.json:15` es `"lint": "eslint src/"` — **sin `--max-warnings`**. Las dos reglas
que más disparan están declaradas `'warn'` (`eslint.config.mjs:60`, `:73`), así que
`ci.yml:70` sale verde con 132 avisos de seguridad.

Escenario con valores: mañana alguien añade a `src/lib/likida/intake/` una regex con
cuantificador anidado sin tope, del tipo `(\d+)+$`, sobre texto que llega del OCR de
WhatsApp. `detect-unsafe-regex` la marca. Es el **aviso número 133** de una lista que
nadie lee y que CI no cuenta. El commit entra verde. El propio mensaje de `2151b98`
diagnosticó esto: «un análisis con 670 avisos que nadie lee es la misma trampa que el
check rojo» — bajó de 670 a 157 y dejó la trampa en pie a menor escala.

Además `eslint src/` **no mira `scripts/`**, que es justamente donde `respaldo.sh`,
`seed.sh` y los `.mjs` del CI viven; `security/detect-child-process` nunca ve ese
código.

**Consecuencia:** la compuerta que sustituyó a CodeQL informa pero no bloquea, y un
aviso nuevo es indistinguible de los 132 heredados.

**Causa raíz probable:** las reglas ruidosas se pusieron en `warn` para poder
adoptarlas de golpe, y no se congeló el conteo (`--max-warnings 157`) para que el
número solo pueda bajar.

---

### [MEDIO · REINCIDENTE] `DEPLOY.md` no nombra `FACTURACION_PILOTO`, `FACTURACION_MODO` ni las cuatro `CALCOM_*`, y la guardia no puede cazarlo

`docs/conocimiento/DEPLOY.md:218-226` · `src/lib/observability/arranque.ts:44-78` ·
`src/lib/observability/runbook.test.ts:128-140`

Medido: `grep -c` sobre `DEPLOY.md` → **0** para `FACTURACION_PILOTO`,
`FACTURACION_MODO`, `CALCOM_API_KEY`, `CALCOM_WEBHOOK_SECRET`, `CALCOM_EVENT_TYPE_ID`,
`CALCOM_API_URL`. Las seis **sí** están en `.env.example`.

La guardia de A18 (`runbook.test.ts:130-140`) itera `SILENCIOSAS`, que sigue con
**siete** entradas (`arranque.ts:45-77`) y ninguna es esa. O sea: la prueba solo puede
exigir que el runbook nombre lo que alguien ya se acordó de meter en la lista — y las
del delta no entraron.

Escenario: se enciende el CRM de Cal.com y el webhook rebota firmas porque
`CALCOM_WEBHOOK_SECRET` quedó sin poner en Vercel. El único archivo que lo nombra es
`.env.example`, que no es el que se abre a las 3 a.m. `DEPLOY.md` tiene ocho variables
en su tabla y da la impresión de ser exhaustiva.

*(Refutación que sí encontré: `LIKIDA_COFRE_LLAVE` —la que descifra las credenciales
de GPS— tampoco está en `DEPLOY.md`, pero **sí** está cubierta por
`/admin/salud-sistema/page.tsx:128-132` vía `cofreConfigurado()`. Esa no la cuento.)*

---

### [MEDIO · REINCIDENTE] El auto-merge sigue mergeando el HEAD del momento, no el sha que aprobó

`.github/workflows/auto-merge-rutina.yml:47-64`, `:71`

`grep head_sha` → 0; `gh pr merge` sigue sin `--match-head-commit`. Baja de ALTO a
MEDIO porque la ventana se estrechó de verdad: `:47-64` vuelve a consultar
`gh pr checks` inmediatamente antes del merge, así que un commit nuevo dejaría los
checks en curso (código 8) y el job esperaría. Queda la carrera entre la última
consulta verde y `gh pr merge` en `:71`. Con un solo colaborador y repo privado el
vector es la propia rutina empujando dos veces, no un tercero.

---

### [MEDIO · REINCIDENTE] `.latido-salud` lleva 14 días muerto y nada lo nota

`.latido-salud:1` · `.claude/skills/salud-del-repo/references/prompt.md:72`

`fecha: 2026-08-10`, y el cuerpo afirma «3157 passed … 252 archivos» contra los ~6,300
de hoy. `grep -rn latido-salud` fuera de `docs/auditoria-*` sigue devolviendo **una
sola** coincidencia: el prompt que lo escribe. Ninguna prueba, workflow ni paso de CI
mira su fecha. Quien lo abra hoy lee «Sin intermitencia, sin roto. Sano» sobre un repo
que ya no existe.

---

### [BAJO · REINCIDENTE] El README anuncia un panel borrado y `npm run setup` falla en una máquina limpia

`README.md:81` · `package.json:15` · `scripts/seed.sh:11-15`

`README.md:81` sigue listando **`/chofer`** entre los paneles; `ls src/app` no lo
tiene desde el 7-ago. Y `npm run setup` (`= npm install && npm run seed`) sigue
terminando en `❌ Falta DATABASE_URL` con `exit 1` después de instalar. El camino que
sí funciona (`npm install` → `npx vitest run`) está más abajo y el atajo no lo
menciona.

---

## Lo que revisé y está bien

- **Los dos crons nuevos están dados de alta de punta a punta, y hay prueba que lo
  ata.** `vercel.json:12-15` (`wa-outbox`, `* * * * *`) y `:32-35` (`gps`, `*/5 * * * *`);
  `salud.ts:28` los incluye en `CRONS`; `salud.ts:36,47` en `CADENCIA_MS`;
  `0180:124-126` amplía el CHECK `cron_latido_id_dominio` a los siete. Corrí
  `npx vitest run src/lib/admin/salud.test.ts src/lib/observability/runbook.test.ts` →
  **18 passed**: `salud.test.ts:74-88` lee `vercel.json` y compara cron por cron, así
  que la tabla no puede desincronizarse en silencio. Es exactamente lo que la pregunta
  «¿están dados de alta?» pedía, y la respuesta es sí.
- **El cron de GPS es el mejor archivo nuevo del rubro.** `gps/route.ts:41-48`
  distingue interruptor **ilegible** (500 declarado) de **apagado** (200 + latido
  `saltado`); `:84-89` emite `logger.error` con `codigo`, llama `alertarOperador` y
  registra `fallo`; `:72` deja los errores por flota en el cuerpo **con el `tenantId`**
  (que el redactor convierte en `huellaId`, o sea trazable contra la base) y **sin la
  credencial**. El encabezado `:24-33` explica por qué `parcial` no es `fallo`.
- **`/api/export/poliza/route.ts` no se traga un solo error.** Los tres saltos a la
  base tienen su `catch` con `logger.error` **nombrando el `tenantId`** (`:125`, `:137`,
  `:153`) y devuelven **503**, no 200 con archivo a medias. `:190-202` bloquea el
  export entero si una sola liquidación no asienta. Es el patrón que el resto del delta
  debería haber copiado.
- **`f5f9313` documentó bien lo que apagó.** `.github/workflows/NOTAS-SEGURIDAD.md`
  nombra las tres compuertas, la causa real de cada una (plan de GitHub, no código),
  el ajuste exacto de Settings para CodeQL y —lo más valioso— que la protección de
  `master` **hoy no existe** y qué dos checks debería exigir. Un check rojo permanente
  retirado con su razón escrita vale más que un check rojo permanente.
- **`2151b98` sí corre.** Verificado ejecutando: `npm run lint` carga
  `eslint-plugin-security` (`eslint.config.mjs:14,42`) y evalúa las reglas elegidas;
  `security/detect-object-injection` y `detect-non-literal-regexp` están **`off`** con
  su razón (`:78-79`), que es la decisión correcta. `regex_sin_redos.test.ts` mide en
  vez de adivinar. El pero está arriba, y es el techo, no la elección.
- **`npx tsc --noEmit -p .` → limpio. `npm run lint` → 0 errores.** Las dos puertas de
  lectura pasan sobre el HEAD de hoy.
- **`ci.yml` no aflojó.** `:57` (`npm audit --audit-level=high`), `:63` typecheck,
  `:66` lint, `:80` `test:coverage`, `:88` las dos pruebas de tiempo que `--coverage`
  se salta, `:93` build. Y corre en **todas** las ramas (`:21-23`).
- **`logger.ts` sigue siendo el guardarraíl que hace reconstruible un log.** `:89-97`
  (`huellaId` estable y derivable), `:101-108` (RFC/tel/CLABE/tarjeta se borran, UUID se
  huella), `:157-159` (los `warn` y `error` van a Sentry **ya redactados**, por un solo
  camino). Es lo que hace que `{"tenant":"id:9f2c…"}` sirva a las 3 a.m.
- **`instrumentation.ts:69-99`** captura lo que ninguna superficie web atrapa, registra
  el `digest` que el usuario ve en pantalla (y `logger.ts:131` lo exime del redactor a
  propósito) y hace `flushObservabilidad()` antes de que muera la invocación.
- **Sentry y Upstash están de verdad en producción.** Cuarta ronda pidiéndolo,
  contestada con el cuerpo vivo de `/api/health` de hoy: `"sentry":"configurado"`,
  `"ratelimit":"redis"`. Eso convierte en reales el piso global de `alerta.ts:71-76` y
  la réplica a Sentry de `logger.ts:157`.
- **`ci-postgres` está verde en `master` hoy.** Run #381, sha `8b43121`, 24-ago 08:03,
  `conclusion: success`. La ronda anterior lo reportó 24 h en rojo; ya no lo está.
- **El bloque 149 de `verificaciones.sql` (`:8432-8456`) sí califica.** Nueve claves
  contra nueve esperados (`claim/exclusivo/retry/sent/cerrado/reserva/segunda/reabre/permisos`),
  y prueba lo que importa del outbox: claim exclusivo, relevo tras el lease, `sent` con
  wamid, y RLS deny-all para `anon`/`authenticated`. (No cubre la transición a `dead`
  ni el backoff exponencial de `0180:112-113`.)
- **`LIKIDA_COFRE_LLAVE` no es silenciosa aunque no esté en `DEPLOY.md`:**
  `/admin/salud-sistema/page.tsx:128-132` la pinta con `cofreConfigurado()`, la misma
  función que usa la pantalla de conexiones.
- **Las dos rutas `calcom` (singular y plural) no son un duplicado peligroso:**
  `api/webhooks/calcom/route.ts:3` reexporta el `POST` firmado de la singular y
  redeclara `runtime`/`dynamic` con el comentario que explica por qué hay que
  declararlos literalmente. Un alias, no una segunda implementación.

---

## Lo que NO alcancé a revisar

- **Si `ALERTA_EMAIL` está puesta en Vercel.** Es la única de las tres que `/api/health`
  no publica, y de ella cuelga el correo del CRÍTICO 1 (cuando se cablee) y el de los
  otros seis crons. Cuarta ronda pidiéndolo. Un renglón más en el cuerpo del health
  (`alerta: "configurada"|"sin_email"`, como ya se hace con `sentry` y `ratelimit`) lo
  contestaría para siempre.
- **La batería contra un Postgres real.** No hay `psql` ni base aquí. El ALTO del
  runner es lectura del parser y de `SIN_CALIFICAR_CONOCIDOS`, no una corrida. Se
  confirma en 30 s con Docker:
  `DATABASE_URL=… node scripts/ci/correr-verificaciones.mjs supabase/verificaciones.sql`
  y se cuentan los ▲.
- **La retención real de los runtime logs de Vercel y si hay log drain.** `DEPLOY.md:277-279`
  lo declara pendiente desde hace rondas. Es lo que decide si «quedó en el log»
  significa algo doce horas después — y de eso dependen el CRÍTICO 1 (que solo deja
  logs), el ALTO del arranque y el CRÍTICO reincidente del piloto de visión.
- **`scripts/respaldo.sh`** (el de la base). La c4 dejó abierto que su «se comprueba que
  no venga vacío» podía ser la misma tautología que el de Storage; no lo abrí. El de
  Storage (`respaldo-storage.sh:163-169`) sigue con el MEDIO de la c4, no lo repito.
- **Si el «Redeploy» del panel de Vercel salta el `ignoreCommand`.** `CLAUDE.md` lo
  ofrece como la salida cuando se olvida la bandera, y hoy —con producción en
  `df6b1be`— es la acción que hace falta. No pude comprobar que funcione sin consultar
  a Vercel.
- **El intermitente `engine_iva_medio_pago.test.ts:35`.** No corrí la suite completa en
  esta pasada (solo `salud` + `runbook`, 18 passed), así que no aporto dato nuevo.
- **Settings de GitHub más allá de lo que `NOTAS-SEGURIDAD.md` documenta**: el ajuste
  de título de squash (`PR_TITLE` vs `COMMIT_OR_PR_TITLE`), que modula el MEDIO de la
  c4 sobre el `[deploy]` que puede redactar el modelo barato.
