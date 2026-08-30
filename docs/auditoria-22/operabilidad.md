# Operabilidad y DX — auditoría 22

**Nota: 5/10** (antes: s/d). Razón: línea base nueva, sin ancla previa legible.
El cableado es de los mejores del repo —los once crons laten en TODOS sus
caminos de salida, fallan cerrados sin secreto, distinguen «apagado a
propósito» de «muerto», y el CI está verde— pero el único lazo que cierra el
circuito (`/api/health` → `salud-produccion.yml` → correo de GitHub) lleva
**178 corridas seguidas en rojo desde el 27-ago-2026 01:36 UTC, sin un solo
verde**, verificado contra la API de GitHub Actions. Con ese lazo saturado, un
cron que muera hoy a las 02:00 es indistinguible de las 178 rojas anteriores:
un fallo de producción es, ahora mismo, invisible. El ancla de «4 o menos» la
salva el resto del andamiaje, que sí existe y sí está bien hecho.

**Riesgo mayor hoy:** la alarma que detecta crons muertos lleva tres días y
medio gritando por otra cosa, y con ella se cayó también el único detector del
modo de falla silencioso del `ignoreCommand` — nadie puede afirmar qué sha
corre en `app.likida.ai`.

## Hallazgos

### [CRÍTICO] El único detector automático de cron muerto lleva 178 corridas seguidas en rojo: una muerte real no cambiaría nada en pantalla

`src/app/api/health/route.ts:90-96` y `:131` · `.github/workflows/salud-produccion.yml:34-42` · `src/app/api/cron/descarga-sat/route.ts:132,142`

Escenario (verificado en producción, no inferido):
- `descarga-sat` late `parcial` en cada corrida porque `sano` (`descarga-sat/route.ts:132`) exige `descarga.corrio`, y `correrDescargaSat` devuelve `corrio:false` mientras `LIKIDA_SAT_PROVEEDOR` no esté configurado (`sat_descarga/ciclo.ts:748`). Cada 6 h, para siempre.
- `/api/health` mete a `descarga-sat` en `noSanos` (`route.ts:81-82`: latido fresco + `ultimoEstado !== 'ok'`) y pone `cronCheck = 'degraded'` en la línea 92 **antes** de repartir a quién avisar. El arreglo del 29-ago (`5fb45b1`) desvió el CORREO al canal semanal de `alertarHuecoConfiguracion` y dejó el status intacto: `:131` calcula `degraded` → HTTP 503.
- `salud-produccion.yml:42` falla el job si `status != "ok"`.
- Evidencia: run `33301542052` (2026-08-30T08:25 UTC) — `http=503 estado=degraded`; run `33286277208` (2026-08-30T01:42) idéntico. Última corrida verde: `2026-08-27T01:27:24Z`. Desde entonces, 100 % de fallos en las páginas 1-6 de la API de runs (30/30, 30/30, 30/30, 30/30, 30/30, 28/30).
- El mismo colapso lo producen `gps` (`parcial` si UNA flota tiene el token vencido, `gps/route.ts:138`) y `wa-outbox` (`parcial` si UN mensaje falló, `wa-outbox/route.ts:109`).

Entra: `wa-outbox` deja de drenar a las 02:00 (secreto rotado, 401). Sale: a los
21 minutos `juzgarLatido` lo marca `vencido`, `/api/health` sigue devolviendo
`503 degraded` —exactamente el mismo cuerpo que llevaba tres días devolviendo— y
`salud-produccion.yml` falla igual que las 178 veces anteriores. A las 09:00 los
choferes llevan siete horas sin recibir nada y el tablero de GitHub se ve como
ayer y como anteayer.

Consecuencia: Javier opera solo. El único canal que le avisa sin que él vaya a
mirar es el correo de GitHub Actions sobre este workflow, y ese correo lleva
tres días y medio significando «el PAC sigue sin contratar». Un mensaje de
WhatsApp perdido en el camino del dinero pasa por el mismo canal saturado.

Causa raíz probable: `/api/health` colapsa «hueco de configuración ya declarado»
y «cron muerto» en el mismo 503 público, y el arreglo del 29-ago separó el
destinatario del correo pero no el estado que consume la máquina.

---

### [ALTO] El cotejo del sha desplegado nunca corre: es el segundo paso del job que ya abortó

`.github/workflows/salud-produccion.yml:44-64` (paso 2) detrás de `:34-42` (paso 1)

Escenario: el push de `86813f4` — asunto `[deploy] cierre: los 9 altos + 14
medios + 2 bajos de la auditoría 21 (#284)` — disparó el run `33286277208` a las
2026-08-30T01:42:13Z. El log del job muestra un solo grupo de pasos: `http=503
estado=degraded` a las 01:42:20, `Process completed with exit code 1`, `Cleaning
up orphan processes`. El paso 2, que espera hasta 10 minutos a que
`/api/health.version` sea `86813f4`, **no se ejecutó** — un paso sin
`continue-on-error` ni `if: always()` detrás de un paso fallido no corre.

Entra: Javier pone `[deploy]` en el asunto, Vercel ignora el build por
cualquier motivo (cuota, error de configuración, `ignoreCommand` mal evaluado).
Sale: GitHub pinta rojo por el health degradado —igual que si el deploy hubiera
llegado bien— y el cotejo que hubiera dicho «producción sigue en 5d69f37 y
pusheaste 86813f4» no llega a correr.

Consecuencia: el modo de falla que `CLAUDE.md` y `DEPLOY.md:300-321` describen
como «silencioso» (el push se ve normal en GitHub y el sitio se queda atrás) hoy
no tiene detector. Antes de un demo, la única comprobación es `vercel inspect` a
mano, y en la ronda 21 se cerraron 25 hallazgos que nadie puede afirmar que
estén publicados.

Causa raíz probable: dos comprobaciones independientes cableadas como pasos
secuenciales del mismo job.

---

### [ALTO] La alerta que dice «ese folio existe ante el SAT» entrega un UUID irreversible por diseño

`src/lib/likida/carta_porte_timbre.ts:377-381` · `src/lib/observability/alerta.ts:143` · `src/lib/observability/sentry.ts:100-112,133-136`

Escenario: el PAC timbra el CFDI, devuelve `uuid = a3f21b9c-...`, y el `update
{uuid_fiscal}` de `carta_porte_timbre.ts:371` falla (timeout de `acotada`, red).
En ese punto el folio existe **solo** ante el SAT: no se escribió en
`ccp_timbre` ni en ninguna otra tabla. Entonces:
- `alerta.ts:143` pasa cada valor del detalle por `redactarTexto(...)`, que
  convierte todo UUID en una huella FNV (`logger.ts:101-107`). El correo dice:
  `Viaje id:9f2c1a4b77de: el PAC timbró el uuid id:33ab7e19c0d1 y ni siquiera se
  pudo guardar el folio en la reserva`.
- `logger.error('timbre.uuid_no_persistido', { viajeId, uuid })` (`:377`) emite
  la misma huella a la consola de Vercel.
- El evento de Sentry pierde la llave entera: `uuid` no está en
  `LLAVES_EXTRA_SEGURAS` (`sentry.ts:100-112`) y `extraSeguro` la descarta.

Entra: un CFDI de carta porte timbrado ante el SAT. Sale: en ningún log, correo
ni evento de Sentry existe el folio real, y no hay forma de derivarlo — la
huella es FNV-1a sobre 122 bits de entropía, irreversible a propósito
(`logger.ts:28-40`). El camino de vuelta que el comentario propone
(«`huellaId(fila.id)` y compara») exige tener la fila, y aquí la fila es
justamente lo que no se escribió. No existe script ni pantalla que compute
huellas contra la base (`grep huellaId` en `src/` y `scripts/` no devuelve
ningún consumidor operativo).

Consecuencia: hay un comprobante fiscal vivo ante el SAT que Likida no puede
nombrar. El contralor cuadra su lista contra el SAT y le sobra un folio; la
única salida es entrar al panel del PAC y comparar UUID por UUID a mano. Es el
escenario exacto del rubro: revienta a las 3 a.m. y a la mañana siguiente no hay
con qué reconstruirlo.

Causa raíz probable: el canal de alerta al operador reusa la redacción del log
público, que está calibrada para lo que sale del sistema, no para el correo que
Javier necesita para actuar.

---

### [ALTO] Las alertas del camino del dinero se deduplican por nombre de evento, así que el segundo incidente de la hora se descarta en silencio

`src/lib/observability/alerta.ts:136` y `:93-105` · llamadas en `carta_porte_timbre.ts:317,344,357,378,406`

Escenario: `reservarPiso(evento, ahora)` usa como llave el NOMBRE del evento
(`likida:alerta:timbre.ambiguo`) y reserva una hora. `alerta.ts:136` es
`if (!(await reservarPiso(evento, ahora))) return;` — un `return` mudo, sin log.
Con el PAC colgando veinte minutos y doce viajes cayendo en `timbre.ambiguo`
(`carta_porte_timbre.ts:357`), sale UN correo nombrando UN viaje; los otros once
se descartan sin dejar rastro en el canal.

Entra: 12 viajes con reserva puesta y CFDI posiblemente emitido. Sale: un correo
que dice «Viaje id:9f2c…: el PAC no contestó… La reserva queda puesta y bloquea
reintentos». Consecuencia: once viajes quedan BLOQUEADOS para timbrar hasta que
alguien borre su fila de `ccp_timbre`, sin que nadie sepa que existen; el
operador cree haber atendido el incidente cuando atendió 1 de 12.

El mismo patrón afecta a `timbre.uuid_huerfano`, `timbre.reserva_atorada`,
`timbre.emitido_sin_persistir` y `campania.respuesta`
(`correo/respuesta_campana.ts:123`, donde dos prospectos que contestan en la
misma hora producen un solo aviso y el texto promete «la conversación es tuya»).

Causa raíz probable: el piso de una hora se diseñó para crons —donde la N-ésima
repetición es la misma información— y se reusó tal cual en incidentes por
entidad, donde cada uno es información nueva. `alertarHuecoConfiguracion`
(`alerta.ts:227`) ya demuestra la llave correcta (`evento` + huella del motivo)
y no se aplicó aquí.

---

### [MEDIO] Un cron que nunca ha latido deja el health degradado sin una línea que lo diga

`src/app/api/health/route.ts:79-125`

Escenario: `portales-vivos` entró a `CRONS` (`admin/salud.ts:28`) y corre los
lunes 06:40. Entre el deploy y su primera corrida su fila de `cron_latido` no
existe, así que `juzgarLatido` devuelve `sin_latido` (`salud.ts:133`). Ese
estado **no** entra en `vencidos` (exige `estado === 'vencido'`, `:79`) ni en
`noSanos` (exige `estado === 'ok'`, `:81-82`), así que el flujo cae al
`else if (sinLatido.length === 0)` de `:123`, que es falso, y `cronCheck` se
queda en `'unknown'` → `:131` calcula `degraded` → 503.

Entra: un cron nuevo (o una fila de `cron_latido` borrada por una restauración).
Sale: `/api/health` en 503 hasta siete días, **sin `logger.error`, sin
`alertarOperador` y sin nombrar el cron en ningún sitio**. Las otras tres ramas
(`vencido`, regresión, hueco de configuración) sí gritan; ésta es la única muda.

Consecuencia: el operador ve el workflow rojo y no tiene dónde mirar; la única
salida es abrir `/admin/crons` a mano y comparar once renglones.

Causa raíz probable: `sin_latido` se trató como un estado transitorio de
arranque y quedó sin rama propia en el árbol de decisión.

---

### [MEDIO] El correo de alerta afirma «va a reintentarse solo» sobre incidentes que exigen mano humana

`src/lib/observability/alerta.ts:148` y `:151`

Escenario: el cuerpo del correo es fijo — `avance: 'Un proceso de fondo falló y
va a reintentarse solo; el detalle va adentro.'` y el primer párrafo: «El trabajo
se reintenta en la siguiente corrida programada». Ese texto sale igual para
`cron.gps` (donde es verdad, la corrida siguiente es en 5 min) y para
`timbre.uuid_huerfano` / `timbre.emitido_sin_persistir` /
`timbre.reserva_atorada` (`carta_porte_timbre.ts:378,406,344`), donde no hay
ninguna corrida programada de timbrado y el folio se queda huérfano hasta que
alguien entre al panel del PAC. Lo mismo con `cron.purgar.purgas_con_fallos`
(`purgar/route.ts:142`): una purga que lanzó dará el mismo error mañana.

Entra: un correo con asunto `[Likida] Falló timbre.uuid_huerfano`. Sale: un
operador que lee «se reintenta solo», lo archiva, y el CFDI queda sin registrar.

Consecuencia: viola la regla de la casa «un rótulo tiene que ser verdad», en el
único canal donde el rótulo es todo lo que hay.

Causa raíz probable: un solo cuerpo de correo para un canal que hoy sirve dos
clases distintas de evento (cron reintentable vs. incidente accionable).

---

### [MEDIO] El runbook de despliegue describe un `/api/health` que ya no existe

`docs/conocimiento/DEPLOY.md:313,324` y `:231` · `docs/runbook-de-llaves.md:26` vs `src/app/api/health/route.ts:135-142`

Escenario: `DEPLOY.md:324` documenta la comprobación como
`curl -s https://app.likida.ai/api/health   # {"ok":true,"db":"ok","sentry":"configurado","version":"553bee7",...}`
y `:313` promete que devuelve «`version`, `db` y `sentry`». El cuerpo real es
`{ ok, status, checks: { db, crons }, version, hora }` — no hay `db` de primer
nivel ni existe la llave `sentry`. Peor: `DEPLOY.md:231` y
`runbook-de-llaves.md:26` mandan comprobar si el rate limit (y con él el piso de
`alertarOperador`) es global leyendo `"ratelimit":"redis"` de ese mismo
endpoint; esa llave **no se emite en ninguna parte del cuerpo**.

Entra: Javier recrea el proyecto de Upstash y quiere confirmar que el piso de
alertas volvió a ser global. Sale: un `curl` sin `ratelimit` en la respuesta, del
que no se puede concluir nada — y la conclusión cómoda («no dice nada, ha de
estar bien») deja el piso de una hora contándose por instancia, que es cómo un
cron que falla en cuatro lambdas manda cuatro correos iguales.

Consecuencia: el runbook al que apunta el propio código enseña una verificación
imposible, en la variable de la que depende que el canal de alertas no se
convierta en ruido.

Causa raíz probable: el cuerpo del endpoint se reestructuró (`checks: {}`,
`status`) y los tres documentos que lo citan quedaron atrás.

---

### [BAJO] `npm run setup` no deja el proyecto corriendo en una máquina limpia

`package.json:19` · `scripts/seed.sh:10-15`

Escenario: `"setup": "npm install && npm run seed"` y `seed.sh:12` sale con
código 1 y `❌ Falta DATABASE_URL` si no hay base. En un clon nuevo sin Supabase
—el caso del rubro— el script que se llama `setup` falla siempre.

Consecuencia: menor, porque `README.md:233-236` documenta el camino que sí
funciona (`npm install` + `.env.example` + `npm run dev`) y `npm test` corre
solo. Pero `setup` es lo primero que alguien teclea, y su primer contacto con el
repo es un error.

Causa raíz probable: el script quedó nombrado para el flujo de demo con base, no
para el arranque en frío.

## Inventario de crons y alertas

### Crons (`vercel.json`, 11 entradas; `CRONS` en `admin/salud.ts:28` espeja las 11)

| Cron | Archivo | Cadencia | `maxDuration` | Si NO corre | Si corre dos veces | Quién se entera |
|---|---|---|---|---|---|---|
| `wa-pendientes` | `api/cron/wa-pendientes/route.ts` | `* * * * *` | 120 | la bandeja del apagado no se drena; a las 5 corridas un mensaje se vuelve carta muerta | seguro: `reclamarPendiente` + dedup de `claimMessage` | `vencido` a los 21 min → `/api/health` **(canal saturado, ver CRÍTICO)** |
| `wa-outbox` | `api/cron/wa-outbox/route.ts` | `* * * * *` | 300 | ningún WhatsApp sale; el outbox crece | seguro: lease `WA_OUTBOX_LEASE_SECONDS` | ídem; `salida_muerta` sí manda correo propio (`:35`) |
| `escalar` | `api/cron/escalar/route.ts` | `7 * * * *` | 120 | viajes sin aceptar y cobranza sin insistir | seguro: claim-first (`escalado_en`, unique(viaje,tier)) | correo por motor caído (`:200,226,255,284`) + racha de 3 cortes (`:310`) |
| `facturar` | `api/cron/facturar/route.ts` | `*/15 * * * *` | 300 | no se factura nada solo | reparte por QStash, un mensaje por flota | correo si QStash rechaza lotes (`:593`) y en el catch (`:631,1136`) |
| `purgar` | `api/cron/purgar/route.ts` | `15 4 * * *` | 120 | `llm_costo` y `wa_mensaje_procesado` crecen sin techo; plazos de retención legal se paran | seguro: RPC en tandas con lock | correo por RPC caída (`:124`), purgas con fallos (`:142`), `producto_evento` (`:189`), `mcp_oauth` (`:211`) |
| `runner` | `api/cron/runner/route.ts` | `0 */4 * * *` | 300 | los 34 agentes autónomos no despachan | reloj duro + latido; sin lock explícito entre invocaciones | correo en el catch (`:180`) y a la tercera pasada cortada (`:132`) |
| `gps` | `api/cron/gps/route.ts` | `*/5 * * * *` | 300 | el mapa de flota se congela; los eventos graves (choque/volcadura) no abren expediente | idempotente por upsert de posiciones | solo `alertarOperador` si truena la corrida entera (`:154`); un token vencido por flota es `parcial` mudo |
| `asistencia` | `api/cron/asistencia/route.ts` | `*/5 * * * *` | 120 | un ROJO sin reconocer no escala nunca | seguro: claim monótono | correo solo en el catch (`:72`); `fallosAviso > 0` es `parcial` sin correo |
| `descarga-sat` | `api/cron/descarga-sat/route.ts` | `25 */6 * * *` | 300 | no entran CFDI del SAT; el aviso de cierre de peaje no sale | idempotente por UUID | correo en el catch (`:158`); hoy late `parcial` PERMANENTE y satura `/api/health` |
| `jornada` | `api/cron/jornada/route.ts` | `30 * * * *` | 60 | huecos en el registro de jornada (LFT 132 XXXIV) | barre 3 días atrás: se recupera solo | correo en el catch (`:112`); `fallos > 0` es latido `fallo` + 500 |
| `portales-vivos` | `api/cron/portales-vivos/route.ts` | `40 6 * * 1` | 120 | un portal de facturación podrido se descubre con un ticket real fallando | idempotente (solo lee) | correo por portal roto confirmado (`:144`) y en el catch (`:173`) |

Común a los once: `puertaCron` (`admin/salud.ts:80`) → sin `CRON_SECRET` es 500
**con correo**; 401 con `codigo: 'cron_401'`. Interruptor `ilegible` = 500 con
latido de `fallo`; `apagado` = 200 con latido `saltado`. Todos escriben latido en
todos sus caminos de salida — eso está bien hecho y verificado archivo por
archivo.

### Alertas

| Alerta | Archivo | Se dispara cuando | Estado |
|---|---|---|---|
| `cron.<id>` (sin secreto) | `admin/salud.ts:84` | falta `CRON_SECRET` | sana |
| `cron.sin_latido` | `api/health/route.ts:86` | un cron pasó cadencia+20 min | **solo si alguien pega a `/api/health`**; hoy el consumidor está en rojo permanente |
| `cron.estado_no_ok` | `api/health/route.ts:118` | último latido `fallo`/`parcial`/`saltado` no clasificado como hueco | grita seguido: `gps` y `wa-outbox` laten `parcial` por un solo fallo unitario |
| `cron.config_ausente:<id>` | `api/health/route.ts:107` | hueco declarado | sana (piso semanal, `PISO_ALERTA_CONFIG_MS`) |
| latido `sin_latido` | `api/health/route.ts:123` | un cron nunca latió | **muda**: 503 sin log ni correo (MEDIO arriba) |
| `timbre.*` (4) | `carta_porte_timbre.ts:317,344,357,378,406` | folio ante el SAT sin registrar / reserva atorada | **degradadas**: UUID irreversible + dedup por nombre de evento (dos ALTOS arriba) |
| `aprobaciones.urgentes` | `wa-pendientes/route.ts:66` | pieza URGENTE > 10 min | sana, y va antes del kill switch a propósito |
| `cartas_muertas` / `salida_muerta` | `wa-pendientes/drenado.ts:178`, `wa-outbox/route.ts:35` | mensaje que agotó reintentos | sanas |
| `exito.soporte_sla` | `agentes/exito.ts:1445` | tickets vencidos | **satisfacible desde la 0268** (`ticket_mensaje` ya tiene escritores); refutado como insatisfacible |
| `campania.respuesta` | `correo/respuesta_campana.ts:123` | prospecto contesta | dedup por nombre de evento: la segunda respuesta de la hora se pierde |
| `portales_facturacion_rotos` | `portales-vivos/route.ts:144` | portal roto medido dos veces | sana, y con la mejor disciplina anti-falso-positivo del repo |
| `interruptores.lectura_fallo` | `likida/interruptores.ts:241` | palanca ilegible | sana |

## Lo que revisé y está bien

- **El latido en todo camino de salida.** Los once crons escriben
  `registrarLatido` antes del 500 en `interruptor_ilegible`, en el `saltado`
  deliberado, en el corte por reloj y en el catch. Abrí los once; no encontré un
  camino mudo. `registrarLatido` (`salud.ts:100`) nunca lanza, y `leerLatido` /
  `detalleLatidos` sí lanzan — la asimetría es correcta.
- **`motivoDeSalto` solo lee `detalle` cuando el estado fue `saltado`**
  (`salud.ts:259`) y `descarga-sat` mete el nombre de la palanca ilegible en
  `cual`, no en `interruptor` (`descarga-sat/route.ts:56`), para no leerse como
  «apagado a propósito». Es un detalle fino y está bien.
- **`purgar` NO reporta `ok` sobre purgas que lanzaron.** Fue mi hipótesis de
  hallazgo y quedó refutada: `mantenimiento_de_datos` calcula
  `'parcial' … or cardinality(fallos) > 0` (`0258_purga_satelites_prospecto.sql:305-309`),
  así que el latido sale `parcial` y además hay correo propio (`purgar/route.ts:142`).
- **`facturar` no está en la rama muerta.** Comprobé `PORTALES_CONOCIDOS`
  (`facturacion/adaptadores/registro.ts:298`, derivado de `TABLA` con CAPUFE +
  los guiones): no está vacío, así que el `saltado` con motivo en prosa de
  `facturar/route.ts:449` —cuyo texto NO matchea el regex de
  `RE_HUECO_CONFIGURACION`— no se está disparando hoy. Hipótesis descartada.
- **El reloj duro de `gps`** (`gps/route.ts:37,84`) comparte un solo `venceEn`
  entre las dos fases en serie, con margen de 20 s para latir. Es el molde de
  `descarga-sat` y está bien aplicado; el corte viaja en el CUERPO
  (`sinTurnoPorReloj`), no solo en el log.
- **La racha de cortes del runner sobrevive a un fallo intercalado**
  (`runner/route.ts:165-179`): omite la llave en vez de escribir 0, y el latido va
  ANTES del correo. Los dos son arreglos correctos de modos de falla reales.
- **`.env.example` no se queda atrás del código**: `observability/runbook.test.ts`
  compara las variables leídas por `process.env` en todo `src/` contra el archivo,
  en las dos direcciones. `SILENCIOSAS` (`arranque.ts:44`) grita en el arranque lo
  que falta y qué consecuencia tiene, incluida `ALERTA_EMAIL`.
- **Sentry.** Fingerprint por `msg` + nivel + tenant + `codigo`
  (`sentry.ts:324,343-351`), que es lo que convierte «ahora falla por otra causa» en un
  issue nuevo; `flushObservabilidad` espera los envíos antes de que la lambda se
  congele; el saneador cubre `spans[].data` y `contexts.trace.data`, no solo
  `request`. `avisarObservabilidad` grita a nivel `error` si falta el DSN en un
  despliegue real.
- **CI.** `.github/workflows/ci.yml` corre en cada push y PR sin secretos:
  typecheck, lint ratchet, resiliencia offline, tests con umbral de cobertura,
  build y smoke de Playwright. Las últimas 30 corridas: 21 verdes, 7 canceladas
  por concurrencia, 2 fallidas — sano.
- **`npm install && npm test`** alcanza: la compuerta de la MAPA corrió verde
  (9,918 pruebas, 86.7 s) sin credenciales.
- **Los guardias de `scripts/seed.sh`** (host gestionado exige `--produccion`,
  y la flota tiene que llamarse «Flota Demo») son la clase de red que evita
  cambiarle el RFC a un cliente por tener el `DATABASE_URL` equivocado exportado.

## Lo que NO alcancé a revisar

- **`facturar/route.ts` completo** (1,258 líneas). Leí la puerta, las palancas,
  el despacho por QStash y los tres `registrarLatido`; NO audité
  `procesarLoteEnCola` (`:637-1160`) ni el callback de QStash: su idempotencia
  ante reintento y su comportamiento al vencer el reloj quedan sin verificar por
  mí.
- **`instrumentation.ts` / `onRequestError`** y el `digest` de Next como puente
  entre la pantalla del contralor y el log: lo vi citado en `sentry.ts` y en
  `logger.ts:131` pero no abrí el archivo.
- **Si `ALERTA_EMAIL` y `SENTRY_DSN` están puestos en el Vercel de producción.**
  No hay forma de comprobarlo desde este clon (el proxy de salida rechaza
  `app.likida.ai`), y la respuesta cambia la severidad de todo lo demás: sin
  `ALERTA_EMAIL`, cada correo de este reporte es un correo que no existe.
- **`auto-merge-rutina.yml`, `e2e-navegador.yml`, `codeql.yml`,
  `ci-postgres.yml`**: solo los listé.
- **El comportamiento real del `ignoreCommand` sobre un Redeploy del panel**
  (`vercel.json:3`): `CLAUDE.md` ofrece «Redeploy» como salida cuando falta la
  bandera, pero si Vercel vuelve a evaluar `git log -1 --pretty=%s` en ese
  camino, el redeploy de un commit sin `[deploy]` también se saltaría. No pude
  verificarlo sin acceso al panel; queda como pregunta abierta, no como hallazgo.
- **La retención real de los runtime logs de Vercel**, que es lo que decide si
  «a la mañana siguiente» todavía hay algo escrito cuando Sentry descartó la
  llave que importaba.
