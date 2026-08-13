# Operabilidad y DX — auditoría 17 (pase 6)

**Nota: 4/10** (antes 5). Razón del movimiento: **deuda que cobró factura**, dos
veces y de forma medible. (1) La compuerta de CI se puso ROJA en `master` el
12-ago a las 00:12 y lleva **seis corridas seguidas** fallando en `Lint`, con los
pasos `Tests` y `Build` **saltados** — o sea que los dos subsistemas nuevos
(agente analista y lector universal de archivos) y el panel v3 **nunca han
pasado por `next build` ni por la suite en CI**, y nadie se enteró en 11 horas.
(2) El A3 del pase 1 pasó de 5 commits sin desplegar (pase 1) a 17 (pase 2) a
**48 hoy**, siete días: producción no tiene ni el chat, ni el lector, ni el panel
que se va a enseñar. Encima, los subsistemas nuevos llegaron sin una sola línea
de instrumentación operativa propia: el tope diario de IA se agota **sin emitir
nada**, y `intake/archivo.ts` es un archivo que **git no puede diferenciar y
ripgrep no puede leer**.

**El riesgo mayor de hoy:** todo lo que se va a enseñar en el demo —chat,
lector de archivos, resumen v3— existe únicamente como código que ninguna
máquina ha compilado: CI se detiene antes del `Build` desde el 12-ago y Vercel
no construye desde el 6-ago. El primer `next build` de esa superficie va a
ocurrir el día que alguien la quiera publicar.

---

## Estado de los hallazgos abiertos (pases 1–2)

| # | Hallazgo | Estado |
|---|---|---|
| C2 | Sondeo de arranque suelta el mutex ajeno | CERRADO (verificado de nuevo hoy: `startup.ts:83-85`) |
| A1 | `/admin/observabilidad` dice "Conectado" a mano | **REINCIDENTE** (`observabilidad/page.tsx:55,62`) |
| A2 | Un fallo de cliente no deja rastro | REINCIDENTE (no reauditado a fondo este pase) |
| A3 | La compuerta de despliegue colapsa todo fallo en "no desplegar" | **REINCIDENTE, PEOR** (48 commits) |
| A4 | El respaldo es un script manual que nada agenda | REINCIDENTE (`scripts/respaldo.sh`, sin cron) |
| M3 | Una base caída se reporta como "sin viajes en la base" | **REINCIDENTE** (`startup.ts:63`) |
| M5 | Fingerprint fijo: una causa nueva nunca dispara alerta | REINCIDENTE |
| M6 | `npm run setup` no deja el proyecto corriendo en limpio | **REINCIDENTE** (`package.json:12-13`, `scripts/seed.sh:11-15`) |
| B1 | El runbook manda a `src/lib/cuadra/costos.ts`, que no existe | REINCIDENTE, y ahora hay un segundo caso (ver MEDIO del runbook) |
| pase 2 · recordatorio nocturno | los 3 ALTO + 2 MEDIO del cron `escalar` | **REINCIDENTES**: `git diff 65da222..HEAD -- src/lib/likida/recordatorio_comprobacion.ts src/app/api/cron/escalar/route.ts` → vacío. Nada se tocó; no los repito aquí. |

**A1, verificado hoy.** `src/app/admin/observabilidad/page.tsx:55` y `:62`
siguen siendo `<StatusPill estado="ok">Conectado</StatusPill>` literales.
`envHealth()` (`src/lib/env.ts:99-105`) existe y no lo llama nadie de esa
página. Escenario: `SENTRY_DSN` sin poner en Vercel —el caso exacto que
`DEPLOY.md:105` marca como "no hay alerta de nada"— y la consola de
observabilidad de Javier pinta "Conectado" en verde sobre Sentry.

**M3, verificado hoy.** `src/lib/likida/startup.ts:63` sigue siendo
`const { data: viajeReal } = await admin.from('viaje').select('id').limit(1);`
— el `error` se descarta. Es la única consulta del archivo que no pasa por
`reportarProbe`. Con Supabase caído, `viajeReal` es `undefined` y el arranque
emite `startup.migraciones_0005_skip {"msg":"sin viajes en la base…"}` en nivel
`info` (que `logger.ts` no manda a Sentry). Sexto pase abierto.

**M6, verificado hoy.** `git diff 94c0733..HEAD -- scripts/` → vacío.
`package.json` sí cambió, pero solo `dev`/`build` a `--webpack` y dos
dependencias nuevas (`pdf-parse`, `xlsx`). En una máquina limpia sin
`DATABASE_URL`, `npm run setup` sigue saliendo `1` en `scripts/seed.sh:14`.

---

## Hallazgos

### [CRÍTICO] CI lleva seis corridas rojas en `master`: `Tests` y `Build` se SALTAN, y la superficie nueva nunca se ha compilado

`.github/workflows/ci.yml:52-53, 67-68, 81-82` · `src/app/dashboard/chat.tsx:362`

El job `verificar` corre en serie: `Typecheck` → `Lint` → `Tests` →
`Pruebas de tiempo` → `Build`. Sin `continue-on-error`, un paso rojo salta los
siguientes. Medido hoy sobre el árbol:

```
$ npm run lint ; echo $?
✖ 18 problems (1 error, 17 warnings)
1
```

El error es `src/app/dashboard/chat.tsx:362:20 — Cannot call impure function
during render` (`Date.now()` en el cuerpo del componente). Ese error **ya está
fichado como R6-9** en `docs/auditoria-17/progreso.md:64-70`; no lo reclamo. Lo
que nadie escribió es su consecuencia en CI, que sí medí contra la API de
GitHub Actions (run `31655899605`, `master`, commit `d661517`):

```
5  Typecheck                       success
6  Lint                            failure
7  Tests (con umbral de cobertura) skipped
8  Pruebas de tiempo               skipped
9  Build                           skipped
```

Ese patrón se repite en **seis corridas consecutivas de `master`**, todas del
12-ago-2026 entre 00:12 y 00:52 (runs `31653637589`, `31653906905`,
`31654264513`, `31654672840`, `31655045055`, `31655899605`). La última corrida
verde de `master` es `31653148306` (00:04:07, `4e18233`). Los commits que
quedaron del otro lado de esa línea son exactamente:

| Commit | Qué trae |
|---|---|
| `df2b42c`, `4b849e3` | el resumen v3 final |
| `1073502` | `/dashboard/viajes/nuevo` |
| `6fe2370` | el tope diario de $1 del chat |
| `d661517` | **el lector universal de archivos** (`pdf-parse`, `xlsx`) |

Escenario concreto: `d661517` agrega dos dependencias nuevas a
`package.json:32,37` (`pdf-parse`, `xlsx`) e importa ambas desde código de
servidor. Ese es *literalmente* el tipo de fallo que el propio `ci.yml:78-80`
dice que este paso ya cazó una vez (*"Turbopack no resolvía el .wasm del lector
de códigos"*). Hoy nadie lo ha compilado: CI salta el `Build` desde el 12-ago y
Vercel no construye desde el 6-ago (ver el ALTO siguiente). El primer
`next build` de todo el chat + lector va a correr el día que alguien intente
publicar, con el demo enfrente.

Agrava: no hay ninguna señal de que la compuerta esté roja fuera de mirar la
pestaña de Actions. `master` no tiene protección de rama que exija el check, y
las notificaciones de GitHub Actions no aparecen en ninguna parte del repo ni
del runbook.

**Consecuencia:** Javier cree que la superficie del demo está verificada porque
"la suite pasa en local"; en realidad `npm run test:coverage` (el que impone el
umbral de cobertura) y `npm run build` no se han ejecutado ni una vez sobre
ella. Un fallo que solo aparece en build se descubre en el peor momento posible.

**Causa raíz probable:** la compuerta es secuencial y su rojo no le llega a
nadie; el pase 6 apuntó el síntoma (el error de lint) y no la consecuencia (que
la compuerta lleva 11 h sin correr los tres pasos que importan).

---

### [ALTO] Producción lleva 48 commits y siete días congelada, y ni el repo ni la app lo dicen — REINCIDENTE, y ahora incluye todo el demo

`vercel.json:3` · `docs/conocimiento/DEPLOY.md:157-183` · `CLAUDE.md:70-84`

```
$ git rev-list --count 87426f8..origin/master
48
$ git log -1 --format='%h %ad %s' --date=short 87426f8
87426f8 2026-08-06 [deploy] refactor(marca): Likida en todo …
```

`87426f8` es el último commit cuyo asunto lleva la bandera. Producción, por
tanto, es del **6-ago**: no tiene el agente analista, ni el chat, ni el lector
de archivos, ni `/dashboard/viajes/nuevo`, ni el resumen v3, ni los 36 arreglos
de la oleada 1 de reparadores. La progresión del hallazgo es la medida de que
la deuda cobró: **5 commits (pase 1) → 17 (pase 2) → 48 (hoy)**.

Sigue sin haber forma de verlo desde el producto:
`grep -rn "VERCEL_GIT_COMMIT_SHA\|COMMIT_SHA" src/ next.config.ts .github/` →
**cero resultados**, y no existe ninguna ruta `/api/health` en
`src/app/api/` (12 `route.ts`, ninguno de salud). La única verificación que
`DEPLOY.md:177-180` ofrece es comparar a mano `git log -1` contra
`vercel inspect`, que solo funciona si a alguien se le ocurre hacerlo.

Y hay dos modos de falla del `ignoreCommand` que ni `CLAUDE.md` ni `DEPLOY.md`
contemplan, los dos verificados por mí:

**(a) Un merge nunca despliega.** El comando es
`git log -1 --pretty=%s | grep -qi '\[deploy\]' && exit 1 || exit 0`. En Vercel,
`exit 0` = *saltar el build*. El asunto de un merge lo genera git o GitHub
("Merge pull request #9 from …", o el título del PR con "(#9)" en el squash), y
ninguno de esos generadores sabe de la bandera. PR #9 es el vehículo de entrega
de toda esta auditoría: fusionarlo con cualquiera de los tres botones de GitHub
produce un HEAD cuyo asunto no lleva `[deploy]` → `exit 0` → Vercel no
construye, aunque cada commit de la rama la llevara. El repo ya tiene tres
merges con asunto escrito a mano (`0fa27b0`, `6b1b125`, `c7c9a0e`), ninguno con
bandera.

**(b) Cualquier fallo del comando = no desplegar, en silencio.** Si `git log`
falla (clon superficial sin historia, git ausente en la imagen del builder), la
tubería entrega vacío, `grep` no encuentra, y `|| exit 0` salta el build. Un
fallo de infraestructura y un "no me toca desplegar" producen exactamente la
misma señal, que además es la señal invisible. Es el A3 tal cual, sexto pase.

**Consecuencia:** el escenario que `CLAUDE.md:81-84` describe como "el modo de
falla es silencioso" ya no es hipotético: llevamos una semana viviéndolo con el
demo entero fuera de producción, y el día que se quiera arreglar por PR, el
merge tampoco va a desplegar.

**Causa raíz probable:** una compuerta que solo sabe decir "no" y ningún
mecanismo que compare lo publicado contra lo commiteado; el `ignoreCommand`
funciona para el caso `git commit` directo y para ningún otro.

---

### [ALTO] `src/lib/likida/intake/archivo.ts` es BINARIO para git y para ripgrep: no se puede diferenciar en un PR ni buscar dentro

`src/lib/likida/intake/archivo.ts:42` · `src/lib/likida/normas/fundamento.ts:467,522`

La línea 42 escribe el byte NUL **literal** dentro de un literal de expresión
regular en vez de la fuga `\0`:

```
$ sed -n '42p' src/lib/likida/intake/archivo.ts | od -c
  c o n s t   l i m p i o   =   s . r e p l a c e ( /  \0  / g ,   ' ' ) …
```

`tsc` y `eslint` lo aceptan (es un regex válido que casa NUL, que es lo que el
autor quería). El problema es todo lo demás:

1. **Git lo trata como binario.** El NUL cae en el byte ~1,500, dentro de la
   ventana de olfateo de 8 KB:
   ```
   $ git show d661517 --stat -- src/lib/likida/intake/archivo.ts
    src/lib/likida/intake/archivo.ts | Bin 0 -> 7515 bytes
    1 file changed, 0 insertions(+), 0 deletions(-)
   ```
   En el PR #9 este archivo aparece como *"Binary file not shown"*. Es
   **el lector de archivos subidos por el usuario** — la frontera de confianza
   que el propio `MAPA.md:28-30` señala como la más ancha y nunca auditada del
   producto —, y no se puede revisar en un diff. Ningún cambio futuro suyo se
   verá tampoco.

2. **Ripgrep lo salta en silencio.** Medido:
   ```
   $ rg -l "MAX_EXTRACTO" src/lib/likida/intake/
   src/lib/likida/intake/archivo.test.ts          ← falta archivo.ts
   $ rg -l --binary "MAX_EXTRACTO" src/lib/likida/intake/
   src/lib/likida/intake/archivo.ts
   src/lib/likida/intake/archivo.test.ts
   ```
   Ripgrep es el motor de la búsqueda de VS Code, de la búsqueda de código de
   GitHub y de la herramienta `Grep` con la que trabajan los agentes de esta
   misma auditoría. Escenario con valores: un auditor de este pase busca
   `rg "pdf-parse" src/` para revisar cómo se invoca el parser → **cero
   resultados** → concluye "no se usa" o "no existe". Lo comprobé conmigo mismo:
   mi primer `grep -rn "extraerComprobante" src/` devolvió
   `Binary file src/lib/likida/intake/archivo.ts matches`, sin la línea.

3. **No es un caso aislado.** `src/lib/likida/normas/fundamento.ts` —el buscador
   de fundamentos fiscales— tiene tres NUL literales (bytes 25140, 25163, 28464,
   líneas 467 y 522). Ahí el NUL cae fuera de los 8 KB, así que git sí lo
   diferencia, pero ripgrep tampoco lo lee:
   `rg -l "guardado" src/lib/likida/normas/` → nada, mientras
   `grep -rln "guardado" src/lib/likida/normas/` → lo encuentra.

Intenté refutarlo: (a) ¿rompe los guardarraíles que hacen `grep` sobre `src/`?
No — `formato.test.ts:190-193` y `:215-217` usan `grep -rl`, y GNU grep con `-l`
sí reporta archivos binarios (verificado:
`grep -rl "MAX_EXTRACTO" src/lib/likida/intake/` sí lista `archivo.ts`). Ese
riesgo lo descarto por escrito. (b) ¿lo arregla un `.gitattributes`? No hay
ninguno: `git check-attr -a` sobre el archivo devuelve vacío. (c) ¿rompe la
compilación? No — `tsc --noEmit` sale limpio.

**Consecuencia:** el subsistema nuevo de mayor riesgo del producto entró al repo
sin poder ser revisado en diff y es invisible para la herramienta con la que
todo el mundo —humano y agente— busca en este repo. Es DX puro, pero es el tipo
de DX que hace que un hallazgo real no se encuentre nunca.

**Causa raíz probable:** un NUL pegado tal cual dentro de un regex literal
(seguramente al escribirlo desde una herramienta que interpretó el escape) en un
archivo que nadie volvió a abrir con `git diff`.

---

### [ALTO] El tope diario de IA se agota sin emitir una sola línea: nadie se entera nunca

`src/app/api/dashboard/chat/route.ts:91-96` · `src/app/admin/calcular-alertas.ts:14-25`

```ts
  if (gastadoHoy >= topeDiaUsd()) {
    return NextResponse.json({
      agotado: true,
      bloques: [{ tipo: 'texto', texto: 'El análisis con IA de hoy llegó a su tope diario …' }],
    });
  }
```

No hay `logger.warn`, ni `logger.error`, ni escritura en ninguna tabla. Nótese
el contraste dentro del mismo archivo: la rama de al lado, `:86-89` (fallo de
lectura del gasto), **sí** emite `logger.error('chat.tope_dia.error', …)`. El
caso "el candado disparó" —el único que significa algo operativamente— es el
mudo.

Escenario con valores: el 6 de agosto por la mañana Javier prueba el chat contra
el tenant de Transportes Innovativos para preparar el demo. A ~$0.005 por
análisis medido (`route.ts:30-35`) más los reintentos correctivos de
`analista.ts:348-376`, llega a $1.00 alrededor de la consulta 150-200. Por la
tarde, con el contralor delante, la primera pregunta al chat contesta *"El
análisis con IA de hoy llegó a su tope diario"* y todas las demás también. En el
servidor no hay ninguna línea que lo explique, en Sentry no hay nada (no se
emite nada, y aunque se emitiera, `logger.ts:148` solo manda `warn`/`error`), y
en `/admin` el único aviso de costo que existe es
`calcular-alertas.ts:17` — *"El costo de IA subió N% esta semana vs la
anterior"*, semanal, de tendencia, y hay que ir a mirarlo.

Intenté refutarlo: (a) ¿lo ve en `/admin/model-ops`? El **gasto** sí —
`fases_etiquetadas.test.ts` garantiza que la fase `chat` tiene rótulo en las
cuatro pantallas—, pero eso muestra dólares, no "este tenant chocó contra el
techo": $1.00 y $0.98 se ven igual en una dona. (b) ¿lo ve el cliente? Sí, y ese
es el problema: el único que se entera de que el candado disparó es la persona a
la que no le sirve saberlo. (c) ¿hay algún contador de "veces agotado"?
`grep -rn "agotado" src/` → cuatro apariciones, todas del texto de respuesta o
de topes de Playwright, ninguna de contabilidad.

**Consecuencia:** el único límite de gasto del subsistema nuevo funciona como
interruptor sin lámpara. Javier no puede contestar "¿algún cliente se está
topando?" ni "¿esto se agotó durante el demo o antes?", y la degradación se
lee, desde fuera, como que el producto se quedó tonto.

**Causa raíz probable:** el tope se diseñó como control de costo (lo cumple) y
no como evento operable; la respuesta al usuario se tomó como si fuera el
registro del hecho.

---

### [MEDIO] Poner `LIKIDA_CHAT_TOPE_DIA_USD=0` para apagar el gasto de IA lo reactiva en $1.00, sin decirlo

`src/app/api/dashboard/chat/route.ts:36-39` · `.env.example` (§ chat)

```ts
function topeDiaUsd(): number {
  const v = Number(process.env.LIKIDA_CHAT_TOPE_DIA_USD);
  return Number.isFinite(v) && v > 0 ? v : 1.0;
}
```

`.env.example` documenta esta variable como la palanca por cliente:
*"Bajarlo o subirlo por cliente es solo esta env."* Escenario con valores: un
tenant se dispara y Javier pone `LIKIDA_CHAT_TOPE_DIA_USD=0` en Vercel para
cortarle el análisis con IA. `Number('0')` es `0`, `0 > 0` es `false`, y la
función devuelve **1.0**: el tope vuelve a ser el default y el gasto sigue.
Mismo resultado con `LIKIDA_CHAT_TOPE_DIA_USD=1,00` (coma decimal, `NaN`) o con
un espacio de más pegado en el panel de Vercel. En los tres casos **no se emite
nada**.

Y el repo ya sabe hacerlo bien, en el archivo de al lado: `LIKIDA_WHATSAPP_MSG_USD`
respeta un `0` explícito y grita `costo.precio_wa_invalido` cuando el valor no
es número (`costos.ts`, documentado en `.env.example` y en `DEPLOY.md:69`). Dos
criterios distintos para la misma clase de variable, en el mismo producto.

**Consecuencia:** la única palanca de emergencia del gasto de IA del panel hace
lo contrario de lo que se le pide en su valor más útil, y confirmarlo exige leer
el código: no hay línea de arranque, ni de petición, que diga qué tope está
vigente.

**Causa raíz probable:** el `> 0` se escribió para rechazar negativos y se llevó
por delante el cero, que aquí no es un valor inválido sino el más significativo.

---

### [MEDIO] `/api/dashboard/ingesta` gasta visión real y no escribe una sola fila en `llm_costo`

`src/app/api/dashboard/ingesta/route.ts:50-54`

Es el **único** llamador de `extraerComprobante` que no llama a `registrarCosto`.
Los dos del camino de WhatsApp sí lo hacen (`processor.ts:526` y `:800`). Aquí
el costo solo viaja en un `logger.info`:

```ts
const r = await extraerComprobante(imagen, AbortSignal.timeout(45_000));
logger.info('ingesta.sonda', { tenantId, rol, legible, motivo, costoUsd: r.costo.costoUsd });
```

El encabezado del archivo (`:5-8`) dice *"NO ESCRIBE NADA: ni gasto, ni foto, ni
costo por liquidación"*. Para el **costo por liquidación** la decisión es
correcta —esa sonda no pertenece a ninguna liquidación—. El problema es que
`llm_costo` no es solo la fuente del costo por liquidación: es la **única**
bitácora del gasto de IA del producto, la que alimenta `/admin/model-ops`,
`/admin/page.tsx`, `/admin/analitica` y `/admin/costos-facturacion`, y la que
`negocio.ts` agrega para la tendencia semanal.

Escenario con valores: el contralor prueba la pata "Ingest" del panel con 40
fotos de tickets de una carpeta, una tras otra. Cada una es una llamada de
visión a `gemini-3.6-flash` que `.env.example` mide en **$0.0176 con
razonamiento** → $0.70 gastados de verdad. En `/admin`, el gasto de ese día
sigue diciendo exactamente lo mismo que antes de las 40 fotos. Además este
endpoint no tiene tope de ningún tipo (el diario es del chat y consulta
`fase='chat'`), así que un bucle desde una sesión válida gasta sin techo y sin
dejar rastro en la bitácora.

Intenté refutarlo: (a) ¿lo cuenta OpenRouter? Sí, en el panel de OpenRouter —
pero ahí no está partido por tenant ni por fase, que es lo que las cuatro
pantallas de `/admin` prometen. (b) ¿la línea `ingesta.sonda` sirve? Es
`logger.info`, así que no llega a Sentry (`logger.ts:148`) y vive en el runtime
log de Vercel, cuya retención `DEPLOY.md:152-153` deja anotada como desconocida
desde hace rondas. (c) ¿el `costoUsd` es cero por ser sonda? No: `ocr.ts:470`
devuelve `res.cost` real.

**Consecuencia:** la cifra de gasto de IA que Javier usa para fijar el precio
del producto está sistemáticamente por debajo del gasto real, y la diferencia
crece con el uso del panel — justo el uso que el producto está empujando.

**Causa raíz probable:** "no contamina el costo por liquidación" se implementó
como "no se registra en ningún lado", que son dos cosas distintas.

---

### [MEDIO] El runbook no sabe que existen el agente, el chat, el lector ni los tres crons — y manda a buscar un mensaje de log que no existe

`docs/conocimiento/DEPLOY.md:42-47, 97-114, 145-153`

```
$ grep -ni "chat\|analista\|agente\|archivo\|tope\|cron\|escalar\|qstash" docs/conocimiento/DEPLOY.md
(cero resultados)
```

187 líneas, y el documento al que se acude a las 3 a.m. no menciona ninguno de
los subsistemas de los últimos dos meses. Dos cosas concretas dentro de eso:

**(a) El paso 3 nombra un mensaje que ningún archivo emite.** `DEPLOY.md:47`
manda a buscar `startup.entorno` — *"falta configuración crítica"*. Los mensajes
reales son `startup.config_silenciosa` (`arranque.ts:59,61`) y
`startup.entorno_grupos` (`arranque.ts:87,90`); `startup.entorno` a secas no
existe en todo `src/` (verificado con `grep -o "startup\.\w*" -r src/`). Un
`grep startup.entorno` en los logs de Vercel encuentra el de grupos por
subcadena y **pierde el de `DEMO_TENANT_ID`**, que es precisamente la variable
que el propio `DEPLOY.md:106` pone en su tabla como "el panel pinta cero
liquidaciones, sin log". A las 3 a.m. eso es un rastro que no aparece.

**(b) Nada dice qué hacer con los subsistemas nuevos.** `CRON_SECRET` sigue
descrito en `.env.example` solo por su mitad vieja ("le insiste al chofer a las
5 h"), no por el recordatorio de comprobación que `c5a7c19` montó sobre la
misma URL. `LIKIDA_CHAT_TOPE_DIA_USD` no aparece en `DEPLOY.md`, así que el
día que un cliente diga "el chat me dice que se acabó", no hay página que
explique qué es ni dónde se sube. Y `runbook.test.ts` no puede atrapar nada de
esto: sus seis pruebas (verdes hoy, corridas por mí) comparan **nombres** de
variable leídos contra declarados y exigen dos literales en `DEPLOY.md`
(`SENTRY_DSN`, `DEMO_TENANT_ID`); ninguna mira si lo que el documento *dice* de
un subsistema sigue siendo verdad, ni si el subsistema aparece.

**Consecuencia:** el runbook cubre bien el producto de julio. El de agosto
—dos subsistemas, tres crons, una cola en Upstash— no está en ninguna página, y
el único paso de diagnóstico que sí menciona la configuración manda a un
identificador que no existe.

**Causa raíz probable:** el inventario de `.env.example` tiene prueba y por eso
no se desincroniza; la **prosa** del runbook no tiene ninguna, y ahí es donde
vive todo lo que se necesita a las 3 a.m.

---

### [BAJO] `git log -1 --pretty=%s` NO lee "solo la primera línea": `%s` pliega el primer párrafo entero

`vercel.json:3` · `CLAUDE.md:70-75` · `docs/conocimiento/DEPLOY.md:185-187`

Las tres fuentes afirman lo mismo: *"lee solo el asunto (la primera línea) a
propósito: leyendo el mensaje completo, cualquier commit que mencione desplegar
disparaba un build"*. `%s` de git no es "la primera línea": es el **asunto**, y
git lo construye uniendo con espacios todas las líneas hasta el primer renglón
en blanco. Comprobado con un repo desechable:

```
mensaje:  "asunto de prueba\nsegunda linea sin blanco [deploy]\n\ncuerpo\n"
$ git log -1 --pretty=%s
asunto de prueba segunda linea sin blanco [deploy]
$ git log -1 --pretty=%s | grep -qi '\[deploy\]' && echo CONSTRUYE
CONSTRUYE
```

O sea: un commit cuyo cuerpo arranque en la línea 2 sin renglón en blanco de
separación —lo que produce un `git commit -F` mal formado o un heredoc sin la
línea vacía— dispara el build aunque su primera línea no lleve nada. Es el
mismo bug del 5-ago que la regla existe para cerrar, reducido de "el mensaje
completo" a "el primer párrafo completo".

Verifiqué que hoy no ha ocurrido: de los últimos 60 commits, ninguno tiene texto
en la línea 2 sin blanco previo. Por eso es BAJO y no ALTO — es una afirmación
falsa en la documentación que gobierna el despliegue, latente, no un incidente.

**Consecuencia:** directa en DX. `CLAUDE.md` es el documento cuyo trabajo es
que el siguiente agente no pierda una hora, y aquí describe una garantía que el
comando no da.

---

### [BAJO] El tope diario suma con un `select` sin paginar: si se sube el tope, el candado deja de disparar en silencio

`src/app/api/dashboard/chat/route.ts:80-84`

```ts
supabaseAdmin().from('llm_costo').select('costo_usd')
  .eq('tenant_id', tenantId).eq('fase', 'chat')
  .gte('created_at', inicioDiaMxIso(ahoraMs()))
```

Sin `range`, sin `limit`, sin agregación en SQL. `CLAUDE.md:36` documenta esta
trampa como propia del proyecto (*"PostgREST recorta a 1,000 filas en
silencio"*) y `analytics.ts` tiene `traerTodo()` construido para exactamente
esto; esta consulta no lo usa. Con el tope en $1.00 no se alcanza (≈200
análisis/día × 1-2 filas), y por eso es BAJO. Pero `.env.example` documenta subir
el tope por cliente como la operación normal: con `LIKIDA_CHAT_TOPE_DIA_USD=10`,
la suma se congela alrededor de las 1,000 primeras filas (~$2.50-$5) y **nunca
llega a 10**, así que el candado se apaga solo. No se emite ninguna línea: no
hay error, la consulta devuelve datos, y `gastadoHoy` simplemente deja de
crecer.

**Consecuencia:** un control de gasto que se desactiva por su propio éxito, en el
momento exacto en que más falta hace, y cuya avería no tiene ninguna señal.

**Causa raíz probable:** se aplicó `acotada()` (que es el tope de *tiempo*) y se
dio por resuelto el acceso a la tabla; el tope de *filas* es otro problema y
tiene otra herramienta en este mismo repo.

---

## Lo que revisé y está bien

- **El inventario de `.env.example` no se quedó atrás del código nuevo.**
  `npx vitest run src/lib/observability/runbook.test.ts` → **6/6 verdes** hoy.
  `LIKIDA_CHAT_TOPE_DIA_USD` está declarada, y el único `process.env.*` de todo
  el código nuevo (agente, chat, archivo, ingesta) es esa misma variable
  (`grep -rn "process\.env\." src/lib/agents/ src/app/api/dashboard/ src/lib/likida/intake/archivo.ts`
  → una sola línea, `chat/route.ts:37`). Los subsistemas nuevos **no traen
  configuración obligatoria propia**: heredan `OPENROUTER_API_KEY`, que ya está
  en `GROUPS.llm` (`env.ts:30`) y por tanto se grita en el arranque.
- **El arranque sí dice qué falta, y con nombre.** `instrumentation.ts:23-24`
  llama de verdad a `avisarConfiguracionSilenciosa()`, que emite dos mensajes
  SEPARADOS a propósito (`arranque.ts:70-82` explica por qué: Sentry agrupa por
  mensaje) y en nivel `error`, que sí llega a Sentry. La decisión de reportar en
  vez de lanzar está razonada en `env.ts:5-27` y sigue siendo la correcta para
  serverless.
- **La media configuración de QStash sí se caza.** `env.ts:61-66` (`CONDICIONALES`)
  exige las dos signing keys en cuanto existe `UPSTASH_QSTASH_TOKEN`, y explica
  por qué no van en `GROUPS`. Es el arreglo de un MEDIO reincidente y está bien
  hecho: `QSTASH_URL` queda fuera con justificación (tiene default correcto).
- **La fase `chat` sí tiene rótulo en las cuatro pantallas de `/admin`.**
  `model-ops/fases_etiquetadas.test.ts` lee el union `FaseCosto` del fuente y
  falla si una fase nueva aparece sin etiqueta en cualquiera de las cuatro
  copias. El gasto del chat **se puede ver** (lo que no se ve es el tope, ver el
  ALTO).
- **`registrarCosto` nunca es mudo.** `costos.ts:115-159`: descarta NaN/negativos
  con `costo.monto_invalido`, comprueba el `{ error }` de supabase-js por valor y
  emite `costo.no_registrado` con tenant, viaje, fase, modelo y monto. Un modelo
  sin precio tampoco cuesta $0: `openrouter.ts:198-207` estima con la tarifa más
  cara y emite `llm.modelo_sin_precio`.
- **El tope diario falla CERRADO ante un error de lectura.** `chat/route.ts:85-89`
  responde `agotado:true` y emite `chat.tope_dia.error`. Y `acotada()`
  (`presupuesto.ts:155-176`) nunca lanza: devuelve `{data:null,error}`, así que
  ese camino está cubierto y no hay un 500 escondido antes del `try`.
- **El fallback del chat no rompe la contabilidad del tope.** Sospeché que
  `faseDeModelo(modelo,'chat')` (`costos.ts:102-105`) podía registrar como
  `escalacion` y escapar del `.eq('fase','chat')`. No: el fallback de
  `google/gemini-3.5-flash-lite` es `openai/gpt-5.6-luna` (`openrouter.ts:65`),
  que no contiene `opus`. Descartado.
- **Los guardarraíles de `formato.ts` sobreviven a los archivos binarios.**
  `formato.test.ts:190-193` y `:215-217` usan `grep -rl`, y GNU grep con `-l` sí
  lista binarios que casan (verificado). El hallazgo del NUL no los toca.
- **CI corre en todas las ramas y no necesita secretos** (`ci.yml:on.push.branches: ['**']`),
  con `concurrency` que cancela lo que quedó atrás, y el paso extra de pruebas de
  tiempo que recupera las dos que `--coverage` salta. El diseño es bueno; lo que
  falla es que su rojo no le llega a nadie (ver el CRÍTICO).
- **`tsc --noEmit -p .` → 0 errores** sobre el árbol de hoy (`0e245d2`),
  coincide con la línea base del `MAPA.md`.

---

## Lo que NO alcancé a revisar

- **La suite completa.** Corrí `tsc`, `npm run lint` y las pruebas puntuales
  (`runbook.test.ts`). No repetí `npx vitest run` entero: la línea base del
  pase 6 (3,298 verdes / 15 rojos) la doy por buena del `MAPA.md`, no medida
  por mí.
- **Si Vercel evalúa el `ignoreCommand` en un "Redeploy" del panel.** La salida
  de emergencia que documentan `CLAUDE.md:77-78` y `DEPLOY.md:182` depende de
  que NO lo evalúe. Sigue sin comprobarse, cuarto pase.
- **Si las variables de QStash, Stripe y Facturapi están de verdad en Vercel.**
  Sin `vercel env ls` no se puede cerrar. Abierto desde la ronda 13.
- **A2 (un fallo de cliente no deja rastro) y M5 (fingerprint fijo)** los dejo
  como reincidentes por herencia: los verifiqué de lectura pero no construí
  escenario nuevo este pase, porque el presupuesto se fue en la superficie nueva
  y en la compuerta.
- **Cuánto gasta de verdad una sesión de chat.** Uso los $0.005/análisis
  declarados en `chat/route.ts:30-35`; no hay medición en el repo que los
  respalde y el arnés que lo mediría (`pruebas-manuales/chat-analista.prueba.ts`)
  no se corre. Cuánto cuesta es del auditor de rendimiento; a mí me faltó saber
  cuántas consultas caben antes del tope, que es lo que decide si el ALTO del
  tope mudo es un riesgo de demo o de mes.
- **Retención real de los runtime logs de Vercel**, de la que depende que las
  líneas `info` (`ingesta.sonda`, `cron.recordatorio_comprobacion.ok`) sirvan de
  algo a la mañana siguiente. Lo mismo que `DEPLOY.md:152-153` deja pendiente
  desde hace rondas.
