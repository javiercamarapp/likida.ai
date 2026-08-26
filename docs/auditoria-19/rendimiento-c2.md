# Rendimiento y costo — auditoría 19 c2

**Nota: 5/10** (antes 5). Razón del movimiento: *deuda que cobró factura* — el
tope de dinero que este rubro pidió cuatro rondas seguidas **llegó, y llegó a
todas partes** (cuadre, OCR, onboarding, ingesta, analista, copiloto, piloto de
facturación), y el backstop de 25 s en `supabaseAdmin` mató de una vez el
«300 000 ms de undici» que anclaba media docena de hallazgos viejos. Pero el
tope se denominó **en caracteres contra una tarifa por token**, y en el camino
de visión esos caracteres son el base64 de la foto del chofer: sobre-reserva
entre 37× y 237×, y **apaga el respaldo entre proveedores del OCR para
cualquier ticket de más de ~229 KB**. Encima, cada ronda de modelo pagó dos
viajes de red a Postgres que nadie puede cancelar: 171 s de techo contra un
`maxDuration = 60` en dos rutas del panel. Los dos CRÍTICOS reincidentes siguen
sin una línea, quinta ronda.

**El riesgo mayor hoy:** la reserva de dinero del OCR se calcula con
`JSON.stringify(body.messages).length` (`openrouter.ts:515`) sobre unos
`messages` que llevan la foto en base64 — a $0.25/M «tokens» un ticket de
150 KB reserva **$0.056** contra un costo real medido de **$0.0015**, y la
escalera de resiliencia (reintento → reintento con nota → fallback
cross-provider) se queda sin los $0.50 del run **antes de llegar al fallback**
en cuanto la foto pasa de ~229 KB.

> **Nota de procedencia.** Toda línea citada aquí es la del commit auditado
> (`HEAD` = `7bc0bde`, merge de `69aa71b`), verificada con
> `git show HEAD:<archivo>`. **Durante esta auditoría el árbol de trabajo
> cambió**: llegó un autofix que introduce `cotaEntradaEnTokens()` en
> `openrouter.ts` y cierra la mitad `generateStructured` del CRÍTICO de la
> reserva (detalle en ese hallazgo), y `tool-idempotency.ts` apareció con dos
> líneas marcadas `// MUTADO` —una corrida de mutation testing en vuelo, no
> código de producto—. Nada de eso está commiteado; si al verificar los números
> de línea no cuadran, es por esos +38 renglones.

---

## ¿El presupuesto nuevo cierra los hallazgos de la ronda 19?

Sí para «existe un tope». No para «el tope está en la unidad correcta».

| Ruta / camino | ¿Tope antes? | ¿Tope hoy? | `archivo:línea` |
|---|---|---|---|
| Cuadre por WhatsApp (`runAgent`) | **no** | **sí** — `createLlmBudget(ctx.tenantId, runId)` | `src/lib/agents/run.ts:64,84` |
| OCR del webhook (por comprobante) | no | **sí** — un run por foto | `src/lib/likida/processor.ts:1046,1333` |
| `/api/dashboard/onboarding-chat` | **no** (ALTO r19) | **sí** | `src/lib/likida/perfil/entrevista-agente.ts:57` |
| `/api/dashboard/ingesta` | tope diario propio, sin reserva | **sí**, además del diario | `src/app/api/dashboard/ingesta/route.ts:80` |
| `/api/dashboard/chat` (analista) | tope diario propio | **sí**, además | `src/lib/agents/analista.ts:284,334,388` |
| `/api/admin/copiloto` | no | **sí** | `src/lib/agents/copiloto.ts:188,221,255` |
| Piloto de visión (facturación) | no | **sí** (reserva) — pero **sigue sin `registrarCosto`** | `src/lib/likida/facturacion/adaptadores/piloto_vision.ts:377` |
| Redactor del runner | reserva por agente (0180) | **sí**, ledger por tenant… pero `correrRunner()` se llama **sin tenant** y el redactor se salta siempre | `src/lib/likida/agentes/runner.ts:178-181` · `src/app/api/cron/runner/route.ts:30` |
| Panel de QA | — (módulo nuevo) | **sí**: $2/corrida + $5/día leídos de `llm_costo` | `src/lib/admin/qa-motor.ts:45` · `qa-tipos.ts:120` · `qa/lanzar/route.ts:50-56` |

Lo que el tope **no** cierra: el gasto del piloto sigue sin fila en `llm_costo`
(`rg "registrarCosto|llm_costo" src/lib/likida/facturacion/ src/app/api/cron/facturar/` →
**cero**, igual que en la c3, la c4 y la r19), así que la banda de
**$0.03–$0.05 por liquidación** de `models.ts:17` sigue calculada sobre un
universo incompleto.

**El `renglones` del OCR: no cuesta un token más hoy.** El brief de esta ronda
pedía cuantificar los tokens de salida extra por partida. `6340aac` los
agregó y `69aa71b` —el commit de HOY— **los retiró**: `intake/ocr.ts:60-77`
documenta que `plazo_facturacion_horas` y `renglones` *«TUMBARON EL OCR EN
PRODUCCIÓN»* con `400 Provider returned error`, `tokens_in/out = 0`, de las
14:20 a las 17:16. El prompt tampoco los menciona ya
(`rg "renglon|partida" src/lib/likida/intake/ocr.ts` → solo los tres
comentarios). Delta de tokens por comprobante: **0**. Delta de costo de un
viaje de 22 comprobantes: **$0.00**. Lo que sí costó fueron ~3 h de OCR muerto
en producción, y `isTransientError` (`openrouter.ts:180`) no casa «Provider
returned error», así que al menos no se pagó un fallback por cada foto.

---

## Las sumas

Techos usados, todos del repo: `acotada` = `TOPE_CONSULTA_MS` 8 000 +
`GRACIA_TOPE_MS` 1 500 = **9.5 s** (`presupuesto.ts:113,117,160-180`);
backstop de `supabaseAdmin` sin `acotada` = **25 s** (`supabase/admin.ts:17`);
`TIMEOUT_LLM_MS` = **30 s** (`openrouter.ts:24`); `timeoutToolMs()` = **15 s**
(`tool-executor.ts:59-62`).

| Cadena | Peor caso sumado | `maxDuration` | ¿Cabe? |
|---|---|---|---|
| Cuadre por WhatsApp: barrera 20 + mutex 12 + `runAgent` 87 (R1: reserva 9.5 + LLM 30 + liquidar 9.5 · tool: claim 9.5 + fail 9.5 · R2: reserva 9.5 + liquidar 9.5) + cierre 14 | **133 s** | 120 | **no** |
| `/api/dashboard/chat` (analista): 5 + 4 rondas × (reserva 9.5 + liquidar 9.5) = 171, **solo el ledger** | **171 s +** | 60 | **no** |
| `/api/admin/copiloto`: 5 + 4 rondas × 19 s | **171 s +** | 60 | **no** |
| `/api/dashboard/ingesta`: tope diario 9.5 + reserva 9.5 + OCR 45 + liquidar 9.5 + `registrarCosto` 9.5 | **83 s** | 60 | **no** (antes ~55, cabía) |
| `/api/admin/qa/lanzar`: pre-trabajo 5 consultas sin techo fino × 25 + un `processInbound` arrancado en t=90 s con **su propio** presupuesto de 103 s + cierre 14 | **207 s** | 120 | **no** |
| `/api/cron/gps`: 10 páginas × 15 s + 3 × `acotada` (REINCIDENTE) | **174 s / flota** | 60 | **no** |
| `/api/cron/wa-outbox`: interruptor 9.5 + reclamar 9.5 + 7 × (fetch 10 + finalizar 9.5) | **155.5 s** | 60 | **no** (creció: el interruptor es nuevo) |
| `/api/cron/wa-pendientes`: pool hasta 103 + cierre 14 + `cartasMuertas` 9.5 + latido 9.5 | **136 s** | 120 | **no** |
| `/api/cron/facturar` y `/api/cron/escalar` | reparten su propio presupuesto (`PRESUPUESTO_LOTE_MS`, `venceCobranza`) | 300 / 120 | **sí** |

---

## Hallazgos

### [CRÍTICO] La reserva de dinero cuenta CARACTERES donde el precio es por token, y en el camino de visión esos caracteres son la foto: el respaldo entre proveedores del OCR se queda sin presupuesto con cualquier ticket de más de ~229 KB

`src/lib/llm/openrouter.ts:515,528,589-615,468,255,73` ·
`src/lib/llm/budget.ts:64-66,77-79` ·
`src/lib/likida/intake/ocr.ts:345-356` · `src/lib/meta/client.ts:552-553` ·
`src/app/api/dashboard/ingesta/limites.ts:23`

`generateStructured` reserva así:

```ts
reserveLlmBudget(opts.budget, calcCost(m,
  Math.max(1, JSON.stringify(body.messages).length + JSON.stringify(jsonSchema).length),
  maxTokens))
```

`calcCost(model, tokIn, tokOut)` multiplica su segundo argumento por la tarifa
**por millón de TOKENS** (`openrouter.ts:255-262`). Y `body.messages` del OCR
lleva la imagen entera: `generateStructured` la mete como `image_url` en el
último `user` (`:468-476`), y `downloadMediaAsDataUrl` la entrega en base64
**sin redimensionar** (`meta/client.ts:552-553`; no hay `sharp` ni resize en el
repo). El comentario del camino hermano (`:837-839`, `generateWithTools`) lo
llama «cota conservadora: cada carácter puede representar un token» — cierto
para JSON de texto, falso por dos órdenes de magnitud para base64. Un modelo de
visión cobra una imagen a **tarifa fija de unos cientos de tokens**, no por
byte.

**La suma, con los precios del propio archivo** (`gemini-3.1-flash-lite`
`[0.25, 1.5]`, `:194`; `claude-haiku-4.5` `[1, 5]`, `:200`; `maxTokens` = 4 000
por `DEFAULT_MAX_TOKENS`, `:73`; `maxRunUsd` = $0.50, `budget.ts:66`):

| Foto de WhatsApp | data-URL (chars) | Reserva 1er intento | Costo real medido |
|---|---|---|---|
| 150 KB | ~200 000 | **$0.056** | $0.0015 (`models.ts:50-51`) → **37×** |
| 400 KB | ~533 000 | **$0.139** | $0.0015 → **93×** |
| 1 MB | ~1 398 000 | **$0.356** | $0.0015 → **237×** |

Y como en el camino de error `settle` se llama con `reservation.amountUsd`
—la cifra inflada— a propósito (`:528`, *«el proveedor pudo haber cobrado»*),
la escalera de resiliencia de `:589-615` se queda sin run:

- Gemini caído → intento 1 lanza, liquida **inflado**: `0.25·N/10⁶ + 0.006`
- intento 2 (mismo modelo + nota) lanza, liquida **inflado**: otro tanto
- intento 3 = **el fallback cross-provider a Anthropic**: `1.0·N/10⁶ + 0.02`

`1.5·N/10⁶ + 0.032 ≤ 0.50` → **N ≤ 312 000 caracteres ≈ 229 KB de foto**. Por
encima de eso, `reserveLlmBudget` lanza `LlmBudgetExceededError('run')` en la
comprobación **local** (`budget.ts:77-79`) sin tocar la base ni el proveedor, y
el fallback nunca sale. Una foto de ticket de WhatsApp pesa rutinariamente
100–300 KB.

Y el corte duro del primer intento: `0.25·N/10⁶ + 0.006 ≤ 0.50` →
**N ≤ 1 976 000 chars ≈ 1.41 MB de foto**. `/api/dashboard/ingesta` acepta
hasta `MAX_DATAURL = 4_000_000` (`limites.ts:23`, *«~3 MB de imagen — una foto
de celular normal cabe»*): **la mitad superior del rango que la ruta admite a
propósito es rechazada por el presupuesto**, con un 502 genérico *«no se pudo
leer la imagen en este momento»* (`ingesta/route.ts:106-108`) que no nombra el
presupuesto por ninguna parte.

Consecuencia: el respaldo cross-provider que `openrouter.ts:75-76` existe para
que *«un provider caído nunca sea un error visible para el operador»* está
apagado para el tamaño de foto normal; y el contralor que sube un ticket de
2 MB por el panel recibe un 502 mudo, siempre, de forma determinista.
Ninguna de las seis pruebas de `budget.test.ts` ni la de
`generate_response_budget.test.ts` reserva sobre una imagen: todas usan montos
literales.

El **piloto de visión** entra por el mismo `generateStructured` con `images`
(`facturacion/adaptadores/piloto_vision.ts:368-374`), y ahí la imagen es una
captura de página completa, aún más pesada que un ticket.

Causa raíz probable: la cota se escribió para el camino de texto (`:837-839`
razona sobre JSON y URLs) y se aplicó tal cual al camino que transporta el
único payload binario del producto.

**Autofix en vuelo (sin commitear, verificado con `git diff`):** el árbol de
trabajo ya trae `cotaEntradaEnTokens()`, que reemplaza el data-URL por `''` en
el `JSON.stringify` y cobra `TOKENS_POR_IMAGEN = 4_000` por imagen, y sustituye
la reserva de `generateStructured`. Con eso una foto de cualquier tamaño
reserva $0.001 por la imagen a tarifa Gemini y el hallazgo queda cerrado **para
`generateStructured`** — que es donde viven el OCR y el piloto. Lo que el
autofix **no** toca es `generateWithTools`, que sigue contando caracteres
(`:840`, `inputUpperBound`); hoy no muerde porque ninguno de sus tres
llamadores manda imágenes (`computer_use.ts:255-268` arma solo texto), pero la
regla queda escrita en un sitio y no en el otro.

---

### [CRÍTICO] El agregado fiscal sigue agrupando por el nombre del emisor tal como lo leyó el modelo de visión — y por `viaje_id` (REINCIDENTE, quinta ronda)

`supabase/migrations/0151_fiscal_agregado.sql:128,132,155` ·
`src/lib/likida/intake/ocr.ts:105` (el campo `emisor`, texto libre) ·
`src/lib/likida/fiscal.ts:1190-1193`

Verificado hoy abriendo el archivo: `:128` sigue siendo
`case when not b.tiene_cfdi then nullif(b.ocr_extra->>'emisor','') end as emisor`,
`:132` sigue siendo `d.viaje_id as dia_viaje`, y el `group by 1..17` de `:155`
sigue incluyendo los dos. `rg -l "gastos_fiscales_agregados_tenant" supabase/migrations/`
→ **solo la 0151**: ninguna migración posterior la toca.

Escenario sin cambio: 3.6M gastos/año por flota, 30 % sin CFDI = 1.08M
comprobantes; con `emisor` (texto de un modelo) y `dia_viaje` (que es un
`viaje_id`) como llaves, las «cientos de celdas» que promete la cabecera
(`0151:21`) son cientos de miles, ~430 MB de `jsonb` en **una** respuesta, y
`getGastosFiscalesSeries` dispara tres más. `acotada` corta a los 9.5 s y las
cuatro fallan en bloque a propósito (`fiscal.ts:1196-1201`).

Consecuencia: «en riesgo/perdido» y «recuperable pidiendo factura» desaparecen
de `/dashboard` y `/dashboard/contador` para el cliente grande, con un
`logger.error` como único rastro.

Causa raíz probable: al elegir las dimensiones no se separó el dominio cerrado
del texto de un modelo; a `host` sí se le aplicó ese razonamiento
(`0151:123-126`) y a `emisor` no.

---

### [CRÍTICO] `anomalias_gasto_tenant` sigue con el anti-join por `position()` que `duplicados.ts` documenta haber quitado (REINCIDENTE, quinta ronda)

`supabase/migrations/0150_agregados_analytics.sql:96-105,138,168-171` ·
`src/lib/likida/duplicados.ts:52-83`

Verificado hoy: `:138` (`uuids as (select distinct uuid from filas …)`) y
`:168-171` (`where not exists (select 1 from uuids u where position(u.uuid in
g.concepto || '|' || g.folio) > 0)`) están **idénticos**. `position()` no es una
igualdad: no hay índice ni hash join que la sirva; es O(G × U) por bucle
anidado, la complejidad que `duplicados.ts:53-58` explica por escrito haber
eliminado. Y `filas` se referencia cinco veces, así que Postgres 12+ la
materializa sin índices.

Escenario: 3.6M gastos/año, 400 grupos → **1.44 × 10⁹ visitas de fila**, en
**cada carga** de cuatro pantallas (`inicio-contenido.tsx:121`,
`inicio-contador.tsx:88`, `combustible-casetas/page.tsx:130`,
`notificaciones/page.tsx:40`), sin ventana de fecha (`0150:89`) y sin caché.

Consecuencia: `acotada` corta a los 9.5 s y el detector de fraude entre viajes
queda apagado en las cuatro pantallas, justo para el cliente más grande.

Causa raíz probable: la migración se escribió como traducción semántica del
oráculo puro; la prueba de equivalencia compara resultados, no planes.

---

### [ALTO] El ledger del presupuesto puso DOS viajes de red a Postgres en cada ronda de modelo, y ninguno obedece la señal del llamador: 171 s de techo contra `maxDuration = 60`

`src/lib/llm/openrouter.ts:834-877` · `src/lib/llm/budget.ts:95-102,123-126` ·
`src/lib/agents/analista.ts:330,384` · `src/lib/agents/copiloto.ts:217,251` ·
`src/app/api/dashboard/chat/route.ts:28` · `src/app/api/admin/copiloto/route.ts:49` ·
`src/lib/agents/run.ts:62-64` · `src/lib/likida/processor.ts:2672-2680`

`completion()` reserva **antes** de cada `create` (`:845`, vía
`reservarCompletion` de `:834-841`) y liquida después (`:865`) o en el `catch`
(`:875`). Las dos son RPC vía `acotada` → **9.5 s de techo cada una**, y
ninguna es cancelable por la señal del turno:
`reserveLlmBudget`/`settleLlmBudget` corren **fuera** de `runWithToolSignal`,
así que el `fetch` del cliente admin toma la rama
`init?.signal && !currentToolSignal() ? init.signal : …` (`supabase/admin.ts:35`)
y se queda con los 8 s de `acotada`, no con el aborto del agente.

Y `generateWithTools` **no tiene un solo `throwIfAborted`**
(`rg "throwIfAborted" src/lib/llm/openrouter.ts` → `:333`, `:493`, `:500` — los
tres en los caminos hermanos, ninguno aquí): la ronda siguiente reserva aunque
la señal ya haya vencido.

Las sumas:

- **`/api/dashboard/chat`** (analista, `maxDuration = 60`): 5 rondas + 4 del
  segundo ciclo = 9 × (9.5 + 9.5) = **171 s solo de ledger**, antes de contar
  un token de modelo.
- **`/api/admin/copiloto`** (`maxDuration = 60`): idéntico, 5 + 4 rondas =
  **171 s**.
- **Cuadre del webhook** (`maxDuration = 120`): `processor.ts:2679` pide
  `timeoutMs: reloj.acotar(40_000)` y ese temporizador **solo aborta el fetch
  del LLM**. Ronda 1 = 9.5 + 30 + 9.5 = 49 s; la tool `guardar_liquidacion`
  = claim 9.5 + fail 9.5 = 19 s; ronda 2 (con la señal ya muerta) = reserva 9.5
  + liquidar 9.5 = 19 s → **87 s de un `runAgent` que declara 40**. Con los
  32 s de barrera + mutex que `presupuesto.ts:11-14` documenta y los 14 s de
  `COSTO_CIERRE_MS`: **133 s contra 120**.

Consecuencia: es el fallo arquetípico del rubro repetido con material nuevo —
la invocación muere pasado el límite y, en el webhook, muere **después** de que
Meta recibió su 200, así que el chofer no recibe nada y no hay reintento. Y
`PASOS_CIERRE` (`presupuesto.ts:39-62`), la tabla que existe justo para que
«meter un paso más al cierre» sea una prueba en rojo, **no tiene renglón para
ninguno de los cuatro pasos nuevos**.

Causa raíz probable: el ledger se diseñó como frontera de seguridad (correcto)
y se insertó en el camino caliente sin sumarlo contra los `maxDuration` que ya
estaban dimensionados sin él.

---

### [ALTO] El tope diario por tenant es de $5.00 sobre un producto que declara $0.03–$0.05 por liquidación, la ventana de día es UTC, y agotarlo se lee como error no transitorio: el chofer recibe «se me trabó el sistema» y no el cuadre determinístico

`src/lib/llm/budget.ts:66-69,104` ·
`supabase/migrations/0186_runtime_idempotencia_y_presupuesto.sql:62-68` ·
`src/lib/likida/processor.ts:2781-2783,2803-2811` · `src/lib/llm/models.ts:17` ·
`supabase/migrations/0180_reservas_agente_y_outbox_wa.sql:32-36`

Tres números que no cuadran entre sí:

1. **El techo.** `maxTenantDailyUsd` cae por default a **$5.00**
   (`budget.ts:69`) y lo comparten TODOS los caminos de modelo del tenant
   —OCR de cada comprobante, cuadre, chat del panel, copiloto, redactor—
   porque la RPC suma `sum(reservado_usd)` de todo el tenant del día
   (`0186:63-67`). Contra la banda declarada de **$0.03–$0.05 por
   liquidación** (`models.ts:17`), $5 son **100–165 liquidaciones/día**. La
   flota del tamaño objetivo (`docs/escala-50k/MAPA.md`: 50 000 viajes/mes ≈
   1 667/día) lo agota **antes de las 9 de la mañana**.
2. **La ventana.** `created_at >= date_trunc('day', now())` (`0186:66`) —
   `now()` en UTC. El día del presupuesto arranca a las **18:00/19:00 hora de
   México**, a media jornada. La migración de cinco días antes hace lo
   correcto y lo dice: `v_inicio := p_dia::timestamp at time zone
   'America/Mexico_City'` (`0180:32`). Dos relojes de día en dos ledgers de
   dinero del mismo repo.
3. **Cómo falla.** `reserveLlmBudget` lanza `LlmBudgetExceededError` con el
   mensaje *«presupuesto de IA agotado para tenant…»* (`budget.ts:7`).
   `isTransientError` (`openrouter.ts:153,180`) casa
   `timeout|network|rate.?limit|overloaded|capacity` — **no casa
   «presupuesto»**. Así que en `processor.ts:2781` `transitorio = false`, el
   chofer recibe *«Perdón, se me trabó el sistema tantito. ¿Me reenvías tu
   último mensaje?»* (`:2783`) y la rama RES-15 que existe exactamente para
   esto (*«el motor no necesita al LLM para cuadrar»*, `:2803-2811`,
   `cuadrarDesdeDB` + `resumenCuadre` en milisegundos y sin modelo) **no se
   ejecuta** porque está dentro de `if (transitorio)`. Reenvía, y vuelve a
   fallar igual — que es palabra por palabra el bucle que RES-15 vino a cerrar
   el 22-ago.

Consecuencia: el día que el tope muerda, la flota entera deja de recibir
respuesta por WhatsApp hasta las 18:00 hora local, cada reenvío quema una
invocación completa del webhook, y el camino determinístico que sí podía
contestar con los números reales está a dos líneas de distancia y apagado.

Causa raíz probable: el techo se eligió como cifra de seguridad para un piloto
sin clientes y no se cruzó contra el costo unitario que el propio repo declara;
y el error nuevo no entró en la taxonomía de fallos que decide si se degrada o
se pide un reenvío.

---

### [ALTO] El motor de QA arranca un `processInbound` con 20 s de margen contra un presupuesto que él mismo cree de 60 s y que en realidad es de 120, y sus 31 consultas no llevan techo fino

`src/lib/admin/qa-motor.ts:52-57,382,442-455,511-514` ·
`src/app/api/admin/qa/lanzar/route.ts:28,82-84` ·
`src/lib/likida/presupuesto.ts:200` · `src/lib/supabase/admin.ts:17`

El comentario de `:54-56` dice, textualmente: *«un `processInbound` puede tomar
hasta su propio presupuesto (~60 s), así que no se arranca con menos que esto
de sobra»*, y fija `MARGEN_MENSAJE_MS = 20_000`. Dos cosas fallan:

1. **El número está a la mitad.** `PRESUPUESTO_WEBHOOK_MS = 120_000`
   (`presupuesto.ts:200`), no 60 000.
2. **El presupuesto no se comparte.** Las tres llamadas a `processInbound`
   (`:447`, `:511`, `:514`) van **sin `inicioInvocacionMs`**, así que cada una
   crea su reloj en `Date.now()` (`processor.ts:694`) y se cree dueña de
   120 s completos — exactamente el CRÍTICO C4 de la auditoría 18, que
   `drenado.ts:106` sí obedece y este módulo nuevo no.

La suma: `sinTiempo()` (`:382`) permite arrancar un mensaje mientras
`Date.now() - t0 ≤ 90 000`. Un mensaje arrancado en t = 90 s consume hasta
`120 − 17 = 103` s de trabajo más 14 s de `COSTO_CIERRE_MS` → **t = 207 s**,
contra `maxDuration = 120` (`lanzar/route.ts:28`). El propio `TECHO_CORRIDA_MS
= 110_000` se justifica con *«margen para que el aborto se ESCRIBA en vez de
que Vercel mate la función»* — y es justo lo que no pasa.

Y el techo por consulta: `qa-motor.ts` tiene **17** `.from(`/`.rpc(` con
**0** `acotada`, y `qa-storage.ts` **14 con 0**
(`grep -o '\.\(from\|rpc\)(' | wc -l` contra `grep -o '\bacotada('`). El único
techo es el backstop de 25 s de `supabaseAdmin` (`admin.ts:17`) — 2.6× el de
`acotada`. `guardarCorrida` (`qa-storage.ts`) hace **dos** upserts y reescribe
**todos** los pasos acumulados, y se llama dos veces por paso (`paso()` y
`cerrarPaso()`); con doce pasos son 48 escrituras y 78 filas reescritas, más
una lectura completa de `llm_costo` del tenant por paso (`qa-motor.ts:226-227`,
sin `limit`).

Consecuencia: la corrida muere pasada la mitad, el `abortar()` que debía dejar
el motivo escrito no corre, y el panel se queda poleando un paso en estado
`corriendo` para siempre — que es precisamente el modo de falla que el panel
de QA existe para detectar en otros.

Causa raíz probable: `TECHO_CORRIDA_MS` se dimensionó contra un número de
memoria (60 s) en vez de contra la constante (`PRESUPUESTO_WEBHOOK_MS`), y el
motor no adoptó el `inicioInvocacionMs` que el resto del repo ya usa.

---

### [ALTO] El cron de GPS: 174 s de techo por flota contra `maxDuration = 60` (REINCIDENTE)

`src/app/api/cron/gps/route.ts:11-14` ·
`src/lib/likida/conectores/posiciones.ts:77` ·
`src/lib/likida/conectores/sincronizar_gps.ts:65,105,145,157`

Sin una línea de cambio. El comentario sigue diciendo *«Una llamada HTTP por
flota… 60 s cubre una decena de flotas con margen»* (`route.ts:11-13`) mientras
el lector pagina hasta **diez** veces (`posiciones.ts:77`, `for (let pagina =
0; pagina < 10; pagina++)`), cada vuelta con `AbortSignal.timeout(15_000)`.

10 × 15 + 3 × 9.5 (unidades, upsert, sello) = **178.5 s por flota**;
`ANCHO_FANOUT_FLOTAS = 4` (`:34`) → con una sola flota lenta la corrida ya son
178.5 + 9.5 de credenciales = **188 s contra 60**. Ningún `Date.now()` contra
`maxDuration` en todo el camino.

Consecuencia sin cambio: Vercel mata la invocación antes de `registrarLatido`
(`route.ts:76,80,88`) y de `alertarOperador` (`:87`), el panel de salud muestra
el latido de la corrida anterior, y se repite cada 5 minutos: 8 640
invocaciones/mes × 60 s = **144 GB-h/mes** quemadas sin escribir una posición.

---

### [ALTO] `TOPE_POR_FLOTA = 500` recorta las lecturas de GPS después de leerlas y reporta el número recortado como total (REINCIDENTE)

`src/lib/likida/conectores/sincronizar_gps.ts:31,99-100` ·
`src/app/api/cron/gps/route.ts:57-70`

Sin cambio: `const posiciones = r.posiciones.filter(posicionValida).slice(0,
TOPE_POR_FLOTA)` (`:99`) corta a 500 **después** de traer hasta diez páginas, y
`base.leidas = posiciones.length` (`:100`) asigna el número ya recortado. A
2 500 unidades (50 000 viajes/mes ÷ ~20 por unidad), 2 000 camiones nunca
reciben `gps_visto_en` (`:152-158` solo sella `unidadesVistas`) y el cron
contesta `{ guardadas: 500, huerfanas: 0, conError: 0 }` — verde.

---

### [ALTO] El cron del outbox: 155.5 s contra `maxDuration = 60`, y creció con el interruptor nuevo (REINCIDENTE)

`src/app/api/cron/wa-outbox/route.ts:10,28,43,46,57` ·
`src/lib/likida/wa_outbox.ts:25,27` ·
`supabase/migrations/0180_reservas_agente_y_outbox_wa.sql:97,104-113`

La suma de la r19 sigue en pie y ahora lleva un eslabón más: `leerInterruptor
('global')` (`:28`, `acotada` → 9.5 s) es **nuevo** en esta ronda. Total:
9.5 (interruptor) + 9.5 (`reclamarSalidasWhatsApp`, 25 por default) +
⌈25/4⌉ = 7 envíos secuenciales × (10 s de `AbortSignal.timeout` + 9.5 s de
`finalizarSalidaWhatsApp`) = **155.5 s contra 60**.

Y sin cambio: el backoff `least(3600, 15·2^intentos)` suma
15+30+60+120+240+480+960+1920 = **3 825 s = 63.7 min** antes de marcar
`'dead'` (`0180:110`), y `rg "wa_outbox" src/` sigue devolviendo tres archivos,
ninguno de los cuales consulta `estado='dead'`. Una caída de Meta de más de una
hora deja en carta muerta todo lo encolado, sin pantalla ni alerta.

---

### [ALTO] El export de póliza arma un mes entero en un solo `jsonb`, sin paginar ni stream (REINCIDENTE)

`src/app/api/export/poliza/route.ts:52,103,162,226` ·
`supabase/migrations/0175_poliza_datos.sql:34-36,64-67` ·
`src/app/api/export/liquidaciones/route.ts:66-82`

Sin cambio: `poliza_datos_tenant` sigue siendo `returns jsonb` con
`jsonb_agg(...)` sobre toda la consulta (`0175:34-36`), sin `limit`, sin
cursor; el único guardarraíl es `DIAS_MAXIMO = 92` (`route.ts:52`), un tope de
**días**, no de volumen. A 50 000 liquidaciones/mes × ~600 bytes son **~30 MB
de `jsonb`** que Postgres construye completo antes del primer byte, contra los
9.5 s de `acotada` (`:162`). El hermano de la misma carpeta explica por escrito
(`liquidaciones/route.ts:66-82`) que el archivo tiene que salir página por
página con `ReadableStream`; la ruta nueva no aplicó nada de eso. El predicado
sigue sin ser sargable (`0175:64-67`: la columna envuelta en dos conversiones),
así que acortar el rango —lo que el 413 le pide al usuario— no ayuda nada.

---

### [ALTO] La entrevista de onboarding da de alta operadores y unidades en un bucle serial sin cota (REINCIDENTE, atenuado)

`src/lib/likida/perfil/entrevista-aplicar.ts:173-188` ·
`src/lib/likida/administracion.ts` (8 consultas / **2** `acotada`) ·
`src/lib/likida/perfil/entrevista.ts:620-640` ·
`src/app/api/dashboard/onboarding-chat/route.ts:10,22`

`nutrirDesdeHechos` sigue recorriendo `hechos.operadoresAlta` y
`hechos.unidadesAlta` con un `await` por elemento (`:173-188`), sin cota: el
único límite es el recorte del mensaje a 2 000 caracteres, del que
`parseOperadores` saca hasta ~150 altas y `parseUnidades` hasta ~500.
`crearOperador` son tres viajes de red en serie.

**Lo que cambió, y hay que decirlo:** el techo por consulta ya no es el default
de undici. `supabaseAdmin` instala un backstop de **25 s**
(`supabase/admin.ts:17,32-37`), así que las seis consultas sin `acotada` de
`administracion.ts` pasaron de 300 s a 25 s. La aritmética realista no cambia:
40 choferes × 3 viajes = 120 en serie ≈ 36 s a 0.3 s, sumados a los ocho pasos
previos del turno, contra `maxDuration = 120`; y como la respuesta es un
`ReadableStream`, morir a mitad deja al navegador esperando el `{t:'fin'}` para
siempre.

---

### [ALTO] La guardiana de `acotada` no creció, y los dos módulos nuevos por los que pasa AHORA todo el dinero están fuera (REINCIDENTE)

`src/lib/likida/acotada_guardiana.test.ts:14-52` · `src/lib/llm/budget.ts` ·
`src/lib/llm/tool-idempotency.ts` · `src/lib/admin/qa-motor.ts` ·
`src/lib/admin/qa-storage.ts` · `src/lib/auth/session.ts` ·
`src/lib/auth/tenant-efectivo.ts` · `src/lib/admin/prospectos-mapa.ts`

`GUARDADOS` sigue con **los mismos diecisiete archivos** de la ronda 18.
Contado hoy:

| Archivo | `.from(`/`.rpc(` | `acotada(` | ¿En la guardiana? |
|---|---|---|---|
| `src/lib/llm/budget.ts` (nuevo, cada llamada al modelo) | 2 | 2 | **no** |
| `src/lib/llm/tool-idempotency.ts` (nuevo, cada mutación) | 1 | 1 | **no** |
| `src/lib/admin/qa-motor.ts` (nuevo) | 17 | **0** | **no** |
| `src/lib/admin/qa-storage.ts` (nuevo) | 14 | **0** | **no** |
| `src/lib/auth/session.ts` | 1 | **0** | no |
| `src/lib/auth/tenant-efectivo.ts` | 4 | **0** | no |
| `src/lib/admin/prospectos-mapa.ts` | 7 | **0** | no |
| `src/lib/likida/administracion.ts` | 8 | 2 | no |

`budget.ts` y `tool-idempotency.ts` **sí** llevan `acotada` en todo, por
disciplina de quien los escribió — pero la consulta número 3 que se les añada
mañana nace sin techo y nada falla. Y el módulo nuevo más grande de la ronda
(`qa-*`, 31 consultas) nació entero fuera de la regla.

Causa raíz probable: la guardiana es una lista a mano y se llena con lo que un
hallazgo nombró; el código nuevo nace fuera de ella por construcción.

---

### [MEDIO] El gasto del piloto de facturación sigue sin registrarse, ahora que sí reserva presupuesto (REINCIDENTE)

`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:377` ·
`src/lib/likida/facturacion/adaptadores/computer_use.ts:92,284` ·
`src/lib/llm/models.ts:17`

`piloto_vision.ts:377` ahora pasa
`budget: op.tenantId ? createLlmBudget(op.tenantId, randomUUID()) : undefined`,
así que el piloto **sí** consume el techo del tenant. Pero
`rg "registrarCosto|llm_costo" src/lib/likida/facturacion/ src/app/api/cron/facturar/`
sigue devolviendo **cero**: cada paso a `anthropic/claude-sonnet-5` a
$2/$10 por M no aparece en `/admin/consumo` ni entra en el costo por
liquidación. El resultado es lo peor de los dos mundos: el gasto **descuenta**
del presupuesto del tenant y **no se ve** en el tablero que dice cuánto se
gasta — el saldo baja sin una fila que lo explique.

---

### [MEDIO] Dos ledgers de dinero para lo mismo, uno de ellos sin purga: `llm_presupuesto_reserva` escribe una fila por llamada al modelo y nadie la borra

`supabase/migrations/0186_runtime_idempotencia_y_presupuesto.sql:27-42` ·
`supabase/migrations/0165_storage_sin_delete_directo.sql:205,234` ·
`src/lib/likida/costos.ts:137`

`llm_presupuesto_reserva` recibe un `insert` por reserva (`0186:75-76`) y un
`update` por liquidación (`0186:89-94`): **dos escrituras por llamada al
modelo**, encima del
`insert` en `llm_costo` que ya existía (`costos.ts:137`).
`agente_mutacion_idempotencia` añade una fila por cierre de viaje, para
siempre (`unique (tenant_id, effect_key)`, sin componente de corrida).

`mantenimiento_de_datos` (`0165:205-260`) enumera **catorce** purgas
compartiendo un reloj de 60 s; ninguna de las dos tablas nuevas está en la
lista, y `rg "llm_presupuesto_reserva" supabase/migrations/` solo devuelve la
0186. A 50 000 viajes/mes con ~10 llamadas de modelo por viaje son **~1M
filas/mes** de reserva que crecen sin techo, en la misma base donde el rubro
ya tiene una purga que no alcanza.

*(Declaro el supuesto: la consulta de la reserva filtra por
`created_at >= date_trunc('day', now())` y el índice
`llm_presupuesto_tenant_dia_idx` la sirve, así que el crecimiento cuesta
almacenamiento y `autovacuum`, no latencia de la RPC — eso lo digo leyendo el
índice, no midiendo.)*

---

### [MEDIO] El redactor comparte el pote del tenant con el cuadre, y hoy está apagado sin que ningún tablero lo diga

`src/lib/likida/agentes/runner.ts:178-181,197-199` ·
`src/app/api/cron/runner/route.ts:30` ·
`supabase/migrations/0186_runtime_idempotencia_y_presupuesto.sql:63-68`

`createLlmBudget(budgetTenantId, randomUUID(), { maxTenantDailyUsd:
a.presupuesto_dia_usd })` (`:197-199`) asienta el gasto del redactor en el
**mismo** `llm_presupuesto_reserva` del tenant, y la RPC compara
`usado_tenant + p_reserva_usd > p_tope_tenant_usd` con el tope **que pasa cada
llamador**. O sea: un redactor con `presupuesto_dia_usd = 20` puede gastar $20,
y la siguiente reserva del cuadre —que pasa $5— ve `usado_tenant = 20 > 5` y se
rechaza. **El agente de marketing puede dejar sin bot de WhatsApp a los
choferes de la flota.**

Hoy no muerde por una razón que tampoco se ve: `correrRunner()` se invoca sin
argumentos (`cron/runner/route.ts:30`), `budgetTenantId` queda `undefined` y el
redactor se salta en cada corrida (`:178-181`, *«sin tenant explícito para
presupuesto central — fail closed»*). El cron de las 4 horas sigue corriendo y
consultando; lo único que dice que el redactor está apagado es una cadena
dentro del JSON de respuesta.

---

### [MEDIO] `COSTO-VERCEL-50K.md`: el piso que la nota marca como MEDIDO es 47 010 y hoy son 98 850 (REINCIDENTE)

`docs/escala-50k/COSTO-VERCEL-50K.md:17-25,31` · `vercel.json`

La tabla del §1 se titula *«Lo MEDIDO»* y lista **cinco** crons con
**«47 010 fijas»** (`:25`), descritas como *«el piso: se pagan aunque no haya un
solo cliente»* (`:31`). `vercel.json` tiene hoy **siete**: faltan `wa-outbox`
(`* * * * *` → 43 200/mes) y `gps` (`*/5 * * * *` → 8 640/mes). Piso real:
**98 850 invocaciones/mes, 2.1× el número escrito bajo la etiqueta MEDIDO**.
Con la fórmula de la propia nota (`:55`), el techo de GB-h de esas dos rutas es
(43 200 + 8 640) × 60 ÷ 3 600 = **864 GB-h/mes a 1 GB**, contra el
«≈1 440–3 300» que la nota da para todo el sistema.

---

### [MEDIO] El cron de la bandeja: el pool puede consumir el presupuesto entero y la cola de la vuelta no está en el presupuesto de nadie

`src/app/api/cron/wa-pendientes/drenado.ts:106,157-167` ·
`src/app/api/cron/wa-pendientes/route.ts:22` ·
`src/lib/likida/presupuesto.ts:84,200`

`processInbound` sí comparte el reloj de la invocación (`:106`,
`inicioInvocacionMs`), que es lo correcto y está bien hecho. Pero ese reloj
reserva sus 17 s de `MARGEN_CIERRE_MS` para el **cierre del mensaje**, no para
la cola del cron: cuando el pool devuelve, ya se pueden llevar 103 + 14 = 117 s,
y después vienen `cartasMuertas()` (9.5 s), `registrarLatido` (9.5 s) y
`encolarOtraVuelta` — cuyo `publishJSON` de QStash (`:181-190`) **no lleva
`AbortSignal`**; su parámetro `timeout: 120` es el plazo del *callback*, no el
de esta llamada, así que hereda el backstop del `fetch` global (300 s, no pasa
por `supabaseAdmin`). Suma: **≥136 s contra `maxDuration = 120`**.

Consecuencia: el reencolado —lo que impide que la bandeja se vuelva
permanente— es lo primero que se pierde cuando la vuelta viene llena, que es
justo cuando hace falta.

---

### [MEDIO] La 0183 quitó dos índices duplicados y dejó el par que de verdad lo es, en la tabla con más escritura del producto (REINCIDENTE)

`supabase/migrations/0176_gps_ingesta.sql:50-51,66-68` ·
`supabase/migrations/0183_indices_duplicados_gps_wa.sql:5-6`

Sin cambio: `posicion_unidad_medida_idx` btree `(tenant_id, unidad_id,
medida_en desc)` y `uq_posicion_lectura` **unique** `(tenant_id, unidad_id,
medida_en)` — mismas columnas, mismo orden; un btree se recorre en las dos
direcciones, así que el no-único es redundante con el único. `posicion` queda
con cinco estructuras por fila. Con `TOPE_POR_FLOTA = 500` cada 5 minutos son
144 000 intentos de inserción al día por flota.

---

### [BAJO] `openrouter.ts` y `models.ts` siguen contradiciéndose sobre Sonnet 5 a partir del 1-sep-2026 (REINCIDENTE)

`src/lib/llm/openrouter.ts:198` · `src/lib/llm/models.ts:72-74`

`openrouter.ts:198` sigue diciendo `// intro VIGENTE hasta 31-ago-2026;
revertir a [3,15] después`. `models.ts:72-74` dice, con verificación del
23-ago, que *«el aumento a $3/$15 FUE CANCELADO… No hay reloj que vigilar
aquí»*. Faltan **siete días** para la fecha del comentario, y ahora importa más
que antes: `PRICES` ya no solo estima el costo *a posteriori* —alimenta
`calcCost` en la **reserva** (`:841`), así que subirla a [3,15] encogería el
presupuesto efectivo de cada ronda del cuadre un 50 %.

---

## Lo que revisé y está bien

- **El backstop de 25 s en `supabaseAdmin` es el arreglo estructural de la
  ronda.** `supabase/admin.ts:17,32-37`: toda consulta que no traiga su propia
  señal queda acotada a 25 s, y una tool abortada cancela también sus consultas
  directas, Storage y RPCs profundos vía `currentToolSignal()`. Esto mata de
  raíz el «300 000 ms de undici» que anclaba media docena de hallazgos de las
  rondas 8, 18 y 19. `acotada` (8 s) sigue ganando donde está puesto, que es lo
  correcto: red y tope fino, no uno u otro.
- **El presupuesto llegó a TODOS los caminos, no a uno.** `run.ts:64`
  (cuadre), `processor.ts:1046,1333` (OCR), `analista.ts:284`,
  `copiloto.ts:188`, `entrevista-agente.ts:57`, `ingesta/route.ts:80`,
  `piloto_vision.ts:377`. La queja de este rubro durante cuatro rondas era que
  el mecanismo existía (`0180`) y se aplicaba solo al organigrama; eso ya no es
  cierto.
- **La atribución de costo sobrevive al fallback.** `openrouter.ts:845` reserva
  con `activeModel` —que `complete()` ya movió al fallback antes de reintentar
  (`:904-905`)— y `acumularCosto(activeModel, …)` (`:921,923`) parte el gasto
  por modelo real; `processor.ts:2711-2716` escribe **una fila de `llm_costo`
  por modelo** cuando el ciclo cruzó de proveedor. La pregunta del brief tiene
  respuesta limpia: el fallback cambia de modelo **y** cambia la atribución.
- **`liquidar_presupuesto_llm` es idempotente en la base.**
  `0186:81-96`: el `update … where id = … and estado = 'reservado'` con
  `return found` hace que un reintento no duplique el commit, y
  `reservation.settled` lo corta antes en el proceso (`budget.ts:115`).
- **Fallar cerrado cuando no se conoce el costo.** `openrouter.ts:857-866`: si
  el proveedor omite `usage`, se conserva la reserva en vez de liquidar a cero
  — la decisión correcta para un tope duro, y está razonada por escrito.
- **El `renglones` que tumbó el OCR se retiró y quedó documentado con su
  firma.** `intake/ocr.ts:60-77` nombra la evidencia (`llm_costo` con
  `tokens_in/out = 0`), la ventana (14:20 → 17:16) y la regla que faltó
  («probar el esquema contra el proveedor, no contra el tipo de TypeScript»).
  Eso es una regresión de costo bien diagnosticada.
- **El panel de QA lee el ledger real, no un segundo medidor.**
  `qa-motor.ts:225-240` suma `llm_costo` por id ya visto en vez de estimar, y
  `lanzar/route.ts:50-56` falla cerrado si no puede leer el gasto del día
  (*«no se lanza a ciegas»*). El tope por corrida ($2) y el diario ($5) están
  declarados donde se pueden mover.
- **El default caro del OCR sigue muerto.** `models.ts:69` =
  `google/gemini-3.1-flash-lite`, con su entrada en `PRICES` (`:194`) para que
  `calcCost` no caiga a la red de seguridad. Es la palanca de costo más grande
  del producto y sigue en su sitio.
- **El lease de la bandeja no rompió el reloj.** `WA_LEASE_SECONDS = 180` con
  renovación cada 60 s (`wa_pendientes.ts:27-28`) es deliberadamente mayor que
  el `maxDuration = 120` del cron, y `iniciarRenovacionLease` usa `unref()` y
  un guard de `enVuelo` para no encimar renovaciones. Cuesta ~2 RPC por mensaje
  en vuelo por invocación: despreciable frente a lo que evita.
- **`reclamar_wa_outbox` con `for update skip locked` y `least(p_limite, 100)`**
  (`0180:88-99`): el límite está acotado del lado del servidor. La mecánica del
  claim está bien; lo que no cuadra son los números que la rodean.

---

## Lo que NO alcancé a revisar

- **Ni un `EXPLAIN`, ni una medición.** No hay Postgres aquí y `npm run build`
  está prohibido. Todo lo que digo de planes (la 0150, la 0151, la
  no-sargabilidad de la 0175, el par de índices de la 0176) sale de leer el SQL
  y los índices.
- **El tamaño real de una foto de WhatsApp.** El CRÍTICO de la reserva usa el
  tamaño del data-URL, que sí es del código (`meta/client.ts:552-553`, sin
  redimensionar) y los precios, que también. La distribución de pesos de las
  fotos que mandan los choferes no está en el repo; usé 150 KB / 400 KB / 1 MB
  como escenarios y dejé los umbrales expresados en caracteres para que
  cualquiera los recalcule.
- **El costo por turno de la entrevista y del copiloto en tokens.** No lo conté
  con un tokenizador.
- **`migration_0187` y el pgTAP de `wa_leases_fencing.sql` (259 líneas).** Los
  abrí solo lo suficiente para los relojes; no revisé el costo de sus triggers.
- **Los dos webhooks de Cal.com** (`api/webhook/calcom` y `api/webhooks/calcom`,
  singular y plural) y las migraciones 0181/0182/0184: sigue sin mirarse si sus
  consultas tienen índice ni si el trabajo se duplica entre las dos rutas.
- **`npx vitest run` completo.** No se corrió por presupuesto de sesión; sí
  enumeré `budget.test.ts` y `generate_response_budget.test.ts` (7 casos entre
  las dos) y ninguno reserva sobre una imagen ni sobre una cadena larga: todos
  usan montos literales, que es la razón por la que el CRÍTICO de la reserva no
  lo cazó nadie.
- **Si `service_role` tiene `statement_timeout`** en este proyecto de Supabase:
  `rg statement_timeout supabase/ src/` → cero. El único techo demostrable
  desde el repo sigue siendo el del cliente (ahora 8 s / 25 s).
