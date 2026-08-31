# Operabilidad y DX — auditoría 23

**Nota: 4/10** (antes 5). Razón del movimiento: **deuda que cobró factura**. El
modo de falla silencioso que este mismo rubro documenta —«pusheaste sin
`[deploy]` y producción se queda atrás sin avisar»— se lo comió el arreglo del
CRÍTICO de la ronda 22: `75afd55` vive en `master` desde el PR #285 y **nunca se
desplegó**. El watchdog sigue rojo, verificado hoy. Y hay una segunda factura:
dos de los tres ALTOS que la 22 dio por cerrados (OP-A2 y OP-A3) son **inertes
en todos los llamadores reales**, con pruebas ancla verdes que usan una forma de
llamada que ningún archivo de producción usa. Un arreglo que se cree hecho es
peor que uno pendiente: nadie vuelve a mirarlo.

**Riesgo mayor hoy:** producción corre `86813f4` (30-ago 01:42) mientras `master`
va en `c7c3d1c`; los 34 arreglos críticos y altos de la auditoría 22 —fiscales,
legales, de dinero— **no están publicados**, y el único detector automático de
esa deriva está apagado por diseño en exactamente el caso que la produce.

---

## El watchdog: ¿sigue rojo?

**Sí. Rojo hoy, con la corrida de esta madrugada.** Esto sí lo pude comprobar.

Consulté la API de GitHub Actions (`mcp__github__actions_list` →
`list_workflow_runs` sobre `salud-produccion.yml`, repo `javiercamarapp/cuadra`)
y `mcp__github__get_job_logs` sobre la corrida más reciente:

- `total_count = 405` corridas. Las **60 más recientes que pude paginar (#405 →
  #346) son todas `conclusion: failure`**, sin una sola excepción. La 22
  verificó que la última verde fue el 2026-08-27T01:27 UTC; nada la contradice.
- **Run #405, id `33365279210`, 2026-08-31T06:42:26Z, `schedule`, `failure`.**
  Log del job `pulso`, textual:

  ```
  2026-08-31T06:42:32.3003417Z http=503 estado=degraded crons=degraded
  2026-08-31T06:42:32.3120291Z ##[error]/api/health no está healthy
  (http=503 estado=degraded crons=degraded); un cron vencido o con
  regresión se reporta como degraded.
  ```

**Y el log dice por qué**: `crons=degraded`, no `crons=config_ausente`. El
tercer estado que la 22 escribió **no existe en el binario que corre en
`app.likida.ai`**. Lo confirmé sin salir del repo:

```
$ git log --format='%h | %s' -6
c7c3d1c | dof-diario: 2026-08-30 (#289)
54672b0 | jarvis-brief: 2026-08-30 (#288)
581f3d3 | fiscal: 4 fichas nuevas para coordinados y retenciones (área 5) (#287)
6f3d61f | chore(normas): latido de vigilancia — domingo 30-ago (#286)
7b1f109 | Auditoría 22 — los 12 rubros auditados y los 34 hallazgos … (#285)
86813f4 | [deploy] cierre: los 9 altos + 14 medios + 2 bajos de la auditoría 21 (#284)

$ git show 86813f4:src/app/api/health/route.ts | grep -n "let cronCheck"
76:  let cronCheck: 'ok' | 'degraded' | 'unknown' = 'unknown';
```

El último asunto con `[deploy]` es `86813f4`. El PR que trae el arreglo
(`7b1f109`) y los cuatro commits posteriores **no lo llevan**, así que
`vercel.json`'s `ignoreCommand` los ignoró. Producción sirve el `route.ts` de
`86813f4`, que solo conoce dos estados y devuelve `degraded` → 503 → el paso 1
del workflow falla, como las 60 veces anteriores.

**Veredicto sobre OP-1: REINCIDENTE y CRÍTICO.** El código del arreglo es
correcto en su intención, pero *el hallazgo no está cerrado*: el watchdog no
cambió de color ni una vez. Y la causa ya no es «falta configurar
`LIKIDA_SAT_PROVEEDOR`» sino algo peor y más barato de arreglar: **falta
publicar el arreglo**.

**Lo que NO pude comprobar desde aquí:**
- El cuerpo real de `/api/health` en producción. El proxy de salida bloquea el
  dominio: `curl https://app.likida.ai/api/health` → `curl: (56) CONNECT tunnel
  failed, response 403`. El `version` que confirmaría el sha desplegado solo lo
  vi indirectamente, por el `crons=degraded` del log del workflow.
- Si `ALERTA_EMAIL` y `SENTRY_DSN` están puestos en el Vercel de producción.
  Sigue sin poder comprobarse, y sigue cambiando la severidad de todo lo demás.

---

## Hallazgos

### [CRÍTICO] El arreglo del watchdog se mergeó sin `[deploy]` y lleva 5 commits sin llegar a producción; el detector de esa deriva está apagado justo en ese caso

`.github/workflows/salud-produccion.yml:64-84` (paso 2) · `:65` · `docs/conocimiento/DEPLOY.md:284,300,309`

Escenario, con valores reales de hoy:
1. El PR #285 mergea `7b1f109` con asunto `Auditoría 22 — los 12 rubros
   auditados y los 34 hallazgos críticos y altos arreglados (#285)`. Sin
   `[deploy]` en la primera línea → `vercel.json` no construye.
2. El push dispara el run #400 (2026-08-31T05:18:12Z, head_sha `7b1f109`).
   El paso 2 corre (`if: always() && github.event_name == 'push'` — el arreglo
   OP-A1 de la 22 funciona), lee el asunto, no encuentra `[deploy]`, imprime
   «El asunto no lleva `[deploy]`: este push NO construye a propósito» y
   **`exit 0`** (`:72-75`).
3. Las corridas por `schedule` (cada 30 min, 4 de las 6 últimas) **ni siquiera
   entran al paso 2**: `github.event_name == 'push'` es falso.

Resultado: `/api/health` publica `version` con el sha desplegado, el workflow
lo consulta 20 veces seguidas en un solo caso —push cuyo asunto trae la
bandera— y **jamás en los otros dos**. La pregunta «¿qué sha corre ahora en
producción?» no se hace nunca de forma periódica, aunque el dato esté publicado
y el workflow ya pegue a ese endpoint cada media hora.

Consecuencia: hoy, 31-ago, `app.likida.ai` corre `86813f4`. Los 34 arreglos
CRÍTICOS y ALTOS de la auditoría 22 —el tope LISR 27-III contra la lista
cerrada, la RFA 2.9 que niega el IEPS y no el IVA, la deducibilidad en la
póliza, el aviso de privacidad que declara los cuatro tratamientos, la
compuerta de `derivar.ts` que no trata antes de avisar— **no están vivos para
nadie**. Si Javier enseña el producto mañana, enseña la versión anterior; si un
cliente entra, entra a la versión con los CRÍTICOS fiscales abiertos. Y nada en
el tablero de GitHub lo dice: el workflow está rojo, pero rojo por otra cosa,
que es la definición del CRÍTICO de la ronda pasada.

Causa raíz probable: el cotejo del sha se cableó como reacción a un evento de
push en vez de como una comprobación de estado; una comparación
`master HEAD ↔ /api/health.version` en el disparador de `schedule` no depende
de que alguien se acuerde de la bandera. (REINCIDENTE — variante viva de OP-A1
de la auditoría 22: el `if: always()` se arregló, la ceguera de fondo no.)

---

### [CRÍTICO] El tercer estado `config_ausente` vuelve VERDE un health con diez crons que nunca han latido — y la prueba de la 22 lo consagra

`src/app/api/health/route.ts:101,114,137-139,150-153` · `src/lib/admin/salud.ts:133` · `src/app/api/health/route.test.ts:288-298`

El árbol de decisión es una cadena `if / else if / else if`:

```
94   if (vencidos.length > 0)        → 'degraded'
101  else if (noSanos.length > 0)    → regresiones? 'degraded' : 'config_ausente'
137  else if (sinLatido.length === 0) → 'ok'
```

`sinLatido` **solo se consulta en la tercera rama**. Y `juzgarLatido`
(`salud.ts:133`) devuelve `sin_latido` —nunca `vencido`— cuando la fila de
`cron_latido` no existe: sin latido previo no hay contra qué medir la cadencia.

Escenario con valores, y es el estado permanente del producto:
- `descarga-sat` late `parcial` cada 6 h con `configAusente: true`
  (`cron/descarga-sat/route.ts:133-142`) mientras `LIKIDA_SAT_PROVEEDOR` no se
  configure. Eso mantiene `noSanos = ['descarga-sat']` **para siempre**.
- Se restaura la base desde respaldo (o se despliega el proyecto de nuevo) y
  `cron_latido` queda vacía. A las 00:25 `descarga-sat` escribe su fila.
- Desde ese minuto: `vencidos = []`, `noSanos = ['descarga-sat']`,
  `sinLatido = ['wa-pendientes','wa-outbox','escalar','facturar','purgar',
  'runner','gps','asistencia','jornada','portales-vivos']` — **diez de once**.
- La segunda rama gana. `regresiones = []` → `cronCheck = 'config_ausente'` →
  `:150-153` no lo cuenta como degradado → cuerpo
  `{"ok":true,"status":"ok","checks":{"db":"ok","crons":"config_ausente"}}`,
  **HTTP 200**. El workflow imprime un `::warning::` y pasa (`salud-produccion.yml:54-57`).

O sea: **once crons, diez sin correr jamás, y el pulso dice `ok`.** Ningún
`logger.error`, ningún `alertarOperador`, ningún nombre de cron en ninguna
parte. La rama de `sinLatido` que la 22 clasificó como MEDIO («muda: 503 sin
log ni correo») pasó de muda a **mentirosa**: antes del arreglo esa misma
combinación caía en `cronCheck = 'degraded'` → 503; lo comprobé contra
`git show 86813f4:src/app/api/health/route.ts:93`.

Y no es un descuido de borde: la prueba que la 22 escribió lo fija como
comportamiento correcto. `route.test.ts:288-298` monta `latidos = [HUECO]` —una
sola fila, la de `descarga-sat`— y afirma `expect(http).toBe(200)`. Los otros
diez crons de `CRONS` no tienen fila en ese fixture: la prueba verde *es* el
escenario de arriba.

Consecuencia: el escenario del rubro, literal. Un cron nuevo cuyo `path` en
`vercel.json` tenga una errata nunca late, nunca vence, y el health queda en
verde para siempre. Los WhatsApp del outbox no salen, `facturar` no factura,
`asistencia` no escala un ROJO — y a la mañana siguiente el tablero está verde y
no hay una sola línea que nombre a ninguno de los diez.

Causa raíz probable: el arreglo movió el veredicto de la segunda rama sin
sacar `sinLatido` de la tercera; `sin_latido` necesita entrar al cálculo antes
del `else if`, no después.

---

### [ALTO] OP-A2 es inerte: el folio fiscal sigue saliendo como huella irreversible en los tres canales, porque ningún llamador real pasa el uuid en una llave propia

`src/lib/observability/alerta.ts:154-156` y `:199` · `src/lib/likida/carta_porte_timbre.ts:316,342,355,378,408` · `src/lib/logger.ts:100-112,145-158` · `src/lib/observability/alerta_aud22.test.ts:47-57`

El arreglo añadió una lista blanca **por nombre de llave**:
`LLAVES_SIN_REDACTAR = {uuid, uuidFiscal, uuidCfdi, folioFiscal}`, aplicada en
`:199` como `LLAVES_SIN_REDACTAR.has(k) ? String(v) : redactarTexto(String(v))`.

Abrí los cinco llamadores de `carta_porte_timbre.ts`. **Ninguno pasa el uuid en
una llave propia.** Todos lo meten dentro de la prosa de `error`:

```ts
// carta_porte_timbre.ts:378
await alertarOperador('timbre.uuid_huerfano', {
  error: `Viaje ${viajeId}: el PAC timbró el uuid ${r.uuid} y ni siquiera se
          pudo guardar el folio en la reserva (${puso.error.message}).`,
  codigo: 'timbre_uuid_huerfano',
});
```

Escenario con valores: el PAC devuelve
`uuid = a3f21b9c-1111-2222-3333-444455556666`; el `update {uuid_fiscal}` de
`:371` truena por timeout. La llave del detalle es `error`, que **no** está en
la lista blanca → `redactarTexto` → el regex `UUID` de `logger.ts:74` casa
dentro de la cadena → `huellaId` (`:104-107`). El correo dice
`el PAC timbró el uuid id:33ab7e19c0d1`. Exactamente lo mismo que antes del
arreglo.

Los otros dos canales tampoco cambiaron:
- **Consola**: `logger.error('timbre.uuid_no_persistido', { viajeId, uuid: r.uuid })`
  pasa por `emit` → `redactMeta(meta)` (`logger.ts:146`) antes de imprimir. Huella.
- **Sentry**: el mismo `emit` manda a `s.reportar(level, msg, redactado)`
  (`:158`) — el objeto **ya redactado**. Que `sentry.ts:113` ahora deje pasar la
  llave `uuid` por `extraSeguro` no recupera nada: el valor que llega es
  `'id:33ab7e19c0d1'`. La lista blanca se puso una capa por debajo de donde se
  destruye el dato.

La prueba ancla (`alerta_aud22.test.ts:49-53`) llama
`alertarOperador(evento, { viajeId, uuid: UUID, error: 'timeout al guardar el
folio' })` — con `uuid` como llave suelta. **Ningún archivo de `src/` llama así.**
La prueba verifica una forma de llamada que solo existe en la prueba.

Consecuencia: sin cambios respecto de la 22 — hay un CFDI vivo ante el SAT que
Likida no puede nombrar, y el contralor que cuadre su lista contra el SAT tiene
que ir folio por folio al panel del PAC. Lo que sí cambió, y a peor: el hallazgo
figura como cerrado.

Causa raíz probable: se arregló el transporte (la lista blanca) y no el origen
(el uuid viaja embebido en `error`). El dato tiene que salir del llamador en su
propia llave para que la lista blanca lo alcance. (REINCIDENTE.)

---

### [ALTO] OP-A3 es inerte para las alertas del dinero: la huella de deduplicación solo mira llaves que esos llamadores no mandan, así que la llave vuelve a ser constante por evento

`src/lib/observability/alerta.ts:115-121` y `:188` · `src/lib/likida/carta_porte_timbre.ts:316,342,355,378,408` · `src/app/api/health/route.ts:97,132` · `src/lib/correo/respuesta_campana.ts:123` · `src/lib/observability/alerta_aud22.test.ts:68-76`

`huellaDeDetalle` toma solo llaves de una lista cerrada:
`['codigo','code','viajeId','viaje','gastoId','operadorId','tenantId','cron','uuid']`
(`:116`). Los llamadores del camino del dinero mandan `{ error, codigo }` —
`error` es texto libre (ignorado) y `codigo` es **una constante por sitio de
llamada**.

Escenario con valores: el PAC se cuelga 20 minutos y doce viajes caen en
`carta_porte_timbre.ts:355`. Los doce producen
`huellaDeDetalle({error: '...', codigo: 'timbre_ambiguo'}) === 'codigo=timbre_ambiguo'`,
así que la llave del piso es `timbre.ambiguo|codigo=timbre_ambiguo` — idéntica
para los doce. `:188` es `if (!(await reservarPiso(...))) return;` — un `return`
mudo. **Sale UN correo nombrando UN viaje; los otros once se descartan sin dejar
rastro**, y los once quedan BLOQUEADOS para timbrar hasta que alguien borre su
fila de `ccp_timbre`. Es, palabra por palabra, el escenario que la 22 escribió
como OP-A3.

El mismo patrón, verificado llamador por llamador:
- `health/route.ts:132` — `alertarOperador('cron.estado_no_ok', { error, codigo:
  'cron_estado_no_ok' })`. `gps` late `parcial` a las 03:00 y sale el correo; a
  las 03:25 `wa-outbox` empieza a fallar al enviar → misma llave → **descartado
  en silencio**. Nadie se entera de que WhatsApp dejó de salir. Y `crons` no
  está en el detalle, aunque `'cron'` sí está en la lista de salientes.
- `health/route.ts:97` — `cron.sin_latido`, `codigo: 'cron_sin_latido'`. Igual.
- `respuesta_campana.ts:123` — `codigo: 'campania_respuesta'`. Dos prospectos
  que contestan en la misma hora siguen produciendo un solo aviso, con un texto
  que promete «la conversación es tuya».
- `purgar/route.ts:142`, `escalar/route.ts:200,226,255,284`,
  `facturar/route.ts:631` — todos `{ error, codigo }` con `codigo` constante.

La prueba ancla (`alerta_aud22.test.ts:71-72`) pasa `{ viajeId: 'viaje-A' }` y
`{ viajeId: 'viaje-B' }` explícitos. Ningún llamador de producción manda
`viajeId` como llave; los cinco de `carta_porte_timbre.ts` lo interpolan dentro
de `error`.

Consecuencia: el operador cree haber atendido el incidente cuando atendió 1 de
12, y en el caso de `cron.estado_no_ok` el segundo cron que muere en la hora es
literalmente invisible. Sin cambio material respecto de la 22.

Causa raíz probable: la misma que el hallazgo anterior — la identidad del
incidente vive dentro de una cadena de prosa, y la lista de salientes no puede
verla. (REINCIDENTE.)

---

### [ALTO] Un lote de facturación encolado a QStash puede morir en cada corrida con el latido de `facturar` en `ok` y cero alertas

`src/app/api/cron/facturar/cola/route.ts:31-37,44-56,99` · `src/app/api/cron/facturar/route.ts:479,543,595-600` · `src/lib/env.ts:44-56`

Escenario con valores:
1. `UPSTASH_QSTASH_TOKEN` está puesto, así que `conQstash = true`
   (`facturar/route.ts:479`) y el cron toma el camino encolado (`:543`).
2. `QSTASH_CURRENT_SIGNING_KEY` se rota en Upstash y no en Vercel — o, el caso
   ya documentado en `env.ts:44-49`, queda con el valor literal `[SENSITIVE]`
   tras re-guardar la variable enmascarada en el panel (pasó el 20-ago-2026 con
   seis variables; el OCR facturó cero durante horas y el health decía verde).
   `cola/route.ts:34` comprueba `!currentKey` — **presencia, no contenido**:
   `[SENSITIVE]` pasa la guardia. `envPuesta()`/`MARCADOR`, que existen
   exactamente para esto, no se usan aquí.
3. El cron encola bien: `publishJSON` devuelve `messageId`, `sinEncolar = []`, y
   `:598` escribe **`registrarLatido('facturar', 'ok', { encolado: true, … })`**.
4. QStash entrega. `receiver.verify()` devuelve `false` →
   `logger.warn('qstash.cola.firma_invalida', {})` (`:50`) → **401**. QStash
   reintenta 2 veces y abandona.
5. `cola/route.ts` **no llama `registrarLatido` ni `alertarOperador` en ninguno
   de sus tres caminos de salida temprana** (`:36` 503 sin config, `:51` y `:55`
   401 de firma, `:90` 500 de base). El comentario de `facturar/route.ts:595-597`
   dice «el resultado del lote lo latirá el callback de QStash al procesar» —
   y eso solo ocurre si el callback llega a `procesarLoteEnCola`.

Sale: cada 15 minutos, `cron_latido.facturar = 'ok'`, `/api/health` verde, cero
correos, y la única traza es un `warn` con **meta vacío `{}`**: no dice qué
flota, cuántos tickets ni qué lote. Es el ejemplo textual del rubro —«un log de
fallo que no dice cuál liquidación falló»— en el camino del dinero.

Consecuencia: la flota deja de facturar sus casetas y su diésel y nadie se
entera hasta el cierre de mes. El contralor descubre el hueco cuando ya no puede
deducirlo.

Causa raíz probable: el latido se escribe por «encolé» y no por «se procesó», y
la puerta del callback valida presencia de credencial en vez de contenido.

---

### [MEDIO] El runbook sigue enseñando un `/api/health` que no existe, en la variable de la que depende que las alertas no se dupliquen

`docs/conocimiento/DEPLOY.md:324` y `:231` · `docs/runbook-de-llaves.md:26` vs `src/app/api/health/route.ts:157-164`

Sin cambios desde la 22, verificado hoy. `DEPLOY.md:324` documenta la salida
como `{"ok":true,"db":"ok","sentry":"configurado","version":"553bee7",...}`; el
cuerpo real es `{ ok, status, checks: { db, crons }, version, hora }` — no hay
`db` de primer nivel ni existe la llave `sentry`. `DEPLOY.md:231` y
`runbook-de-llaves.md:26` mandan comprobar si el piso de `alertarOperador` es
global leyendo `"ratelimit":"redis"` de ese endpoint; **esa llave no se emite en
ninguna parte del cuerpo**.

Escenario: Javier recrea el proyecto de Upstash y hace el `curl` que el runbook
le indica. Sale un JSON sin `ratelimit`, del que no se concluye nada — y la
conclusión cómoda deja el piso de una hora contándose por instancia
(`alerta.ts:101-104`), que es cómo un cron que falla en cuatro lambdas manda
cuatro correos iguales. (REINCIDENTE.)

---

### [BAJO] `npm run setup` sigue fallando siempre en una máquina limpia

`package.json:19` · `scripts/seed.sh:11-15`

`"setup": "npm install && npm run seed"`, y `seed.sh:12-15` sale con código 1 y
`❌ Falta DATABASE_URL` si no hay base. En un clon nuevo sin Supabase —el caso
del rubro— lo primero que alguien teclea falla. `README.md` documenta el camino
que sí funciona, así que el daño es de primera impresión, no de bloqueo.
(REINCIDENTE.)

---

## Lo que revisé y está bien

- **`src/instrumentation.ts` completo** (la 22 no lo abrió). `register()` enciende
  Sentry ANTES de sondear migraciones, para que el diagnóstico salga por un canal
  que ya existe; los tres sondeos van con `void … .catch()` para no retener la
  primera petición de una instancia fría. `onRequestError` registra el `digest`
  de Next —el único puente entre lo que el contralor ve en pantalla y la línea
  del servidor—, llama `reportarExcepcion` y **espera** `flushObservabilidad()`
  en el único punto donde se puede esperar. Nunca lanza.
- **El `digest` sobrevive a la redacción**: `logger.ts:131,137` (`CLAVES_NO_PII`)
  y `sentry.ts:121` (`LLAVES_SIN_REDACTAR_VALOR`) lo excluyen los dos, con la
  razón escrita (diez dígitos = la forma de un celular mexicano sin lada).
- **`esHuecoDeConfiguracion` está bien construido** (`admin/salud.ts:211-219`):
  prefiere la señal estructurada `detalle.configAusente` sobre el regex de
  prosa, y `descarga-sat/route.ts:142` sí la manda (`configAusente:
  !descarga.configurado`). Cuando el arreglo llegue a producción, el paso 1 del
  watchdog sí pasará a verde por esa vía.
- **`procesarLoteEnCola` sí late en sus tres salidas** (`facturar/route.ts:1049,
  1102, 1137`), incluidas las del `finally`, y `corridas`/`bloqueadosPorFlota`/
  `resultados` viven FUERA del `try` a propósito para que el aviso salga cuando
  el lote reventó a la mitad. Era mi hipótesis de hallazgo y quedó refutada; lo
  que falla es el camino en que el callback **no llega** (ALTO arriba).
- **El kill switch está también en el callback de QStash**
  (`cola/route.ts:74-80`) y contesta 200 y no 5xx, para que QStash no reintente
  lo que está apagado a propósito. Es el detalle correcto.
- **`ci.yml`** corre en `branches: ['**']` (no solo master/main), sin secretos,
  con `npm ci`, una puerta bloqueante de `npm audit --omit=dev --audit-level=high`
  para runtime y una no bloqueante para tooling, con el comentario corregido de
  cuál omite qué.
- **`auto-merge-rutina.yml:32-36`** exige `head_repository.full_name ==
  github.repository` y `startsWith(head_branch, 'mejora/')`, y espera a que
  TODOS los checks terminen — no solo «CI» — antes de mergear.
- **`alertarHuecoConfiguracion`** (`alerta.ts:272-311`) sigue siendo el modelo de
  llave correcta: `evento` + huella del **motivo**, piso de una semana, y vuelve
  a avisar si el motivo cambia. Es la pieza que los llamadores del ALTO de
  arriba deberían imitar.
- **`alertarOperador` nunca lanza** en ninguno de sus caminos (`:219-222`), y el
  piso se reserva ANTES del envío para que dos instancias no manden dos correos.
- **`arranque.ts`** grita en `logger.error` las siete SILENCIOSAS ausentes con su
  consecuencia en prosa, solo en despliegues reales, y nunca emite el valor.
  `runbook.test.ts` obliga a que cada entrada de `SILENCIOSAS` esté también en
  la tabla de `DEPLOY.md`.
- **La suite del rubro corre limpia**: `npx vitest run src/lib/observability/
  src/app/api/health` → 8 archivos, 89 pruebas, 3.8 s, sin credenciales.

---

## Lo que NO alcancé a revisar

- **El cuerpo real de `/api/health` en producción.** El proxy devuelve
  `CONNECT tunnel failed, response 403`. Todo lo que afirmo del estado de
  producción sale del log del workflow (`crons=degraded`) y del historial de
  commits, no de una lectura directa.
- **Si `ALERTA_EMAIL` y `SENTRY_DSN` están puestos en el Vercel de producción.**
  Sin la primera, todos los correos de este reporte son correos que no existen y
  el rubro entero cambia de nota. Sigue sin poder comprobarse desde este clon.
- **Cinco workflows sin abrir**: `ci-postgres.yml`, `codeql.yml`,
  `e2e-navegador.yml`, `deploy-preview-promote.yml`, `rollback-production.yml`,
  `backup-storage.yml`. El de rollback es el que importa a las 3 a.m. y no lo
  leí.
- **Si el «Redeploy» del panel de Vercel vuelve a evaluar el `ignoreCommand`.**
  `CLAUDE.md` y `DEPLOY.md:309` lo ofrecen como la salida cuando falta la
  bandera; si Vercel reevalúa `git log -1 --pretty=%s` en ese camino, la salida
  no existe y el CRÍTICO de arriba no tiene arreglo rápido. Queda como pregunta
  abierta, no como hallazgo.
- **La retención real de los runtime logs de Vercel**, que decide si «a la
  mañana siguiente» todavía hay algo escrito.
- **`runner/route.ts` y `escalar/route.ts` por dentro** (solo verifiqué sus
  `alertarOperador` y su forma de detalle, no su idempotencia ante doble
  invocación).
- **Cuántas de las 405 corridas del watchdog son rojas en total.** Verifiqué 60
  consecutivas (#405 → #346); la API me devuelve 30 por página pese a pedir 100
  y no seguí paginando hasta la última verde.
