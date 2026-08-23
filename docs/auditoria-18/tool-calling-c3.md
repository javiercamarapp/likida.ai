# Tool calling — auditoría 18 · continuación 3

**Nota: 6/10** (antes 5). Razón del movimiento: *se atacó y subió*. Los **siete**
hallazgos de la ronda 18 que llevaban dos pasadas abiertos están cerrados con
código y con prueba unitaria propia (`openrouter_loopguard.test.ts`, 11 pruebas;
`analista_costo_reintento.test.ts`; `costos_fase.test.ts`; `run.test.ts`), y eso
mueve al rubro exactamente al ancla que el rubro define: *«6 si la regla se
respeta pero el cliente que la implementa no tiene pruebas unitarias»* — ahora sí
las tiene. No sube más porque el ancla de 8 pide que **ninguna** tool acepte
datos del modelo, y hoy hay dos superficies donde sí los acepta: `piloto_vision`
(cableado, opt-in, apagado — sus 11 hallazgos siguen **intactos**, el archivo no
tiene un byte de diferencia) y un adaptador **nuevo**, `computer_use.ts`, que
llegó con el merge de `master` y que repite —en código escrito 24 horas después
de que se levantara— el mismo error de `emisionSinConfirmar` que ya se le había
escrito al piloto.

**El riesgo mayor hoy:** la regla de `properties: {}` se rompió por primera vez
en el repo. `computer_use.ts:319-329` declara cinco tools cuyo `selector` es un
`string` libre, sin `enum` y sin `additionalProperties: false` —las dos
invariantes que `chat-tools.test.ts:105-133` hace fallar para las tools del
chat—, y una de ellas se llama `emitir`. Hoy no cuesta un peso porque el
adaptador **no tiene call site**; el día que `registro.ts` lo cablee, el modelo
elige por texto libre qué botón de un portal fiscal se aprieta.

---

## Verificación de los abiertos de la pasada anterior

### Los 7 de la ronda 18 (los que arrastraba el rubro desde el 20-ago)

| # | Hallazgo | Estado |
|---|---|---|
| 1 | ALTO — el loop-guard mata la tool terminal | **CERRADO** — `src/lib/llm/openrouter.ts:858-862`: en `round === maxRounds-1` se filtra `calls` a las terminales y solo se tira `LoopGuardError` si no queda ninguna; `:925-928` corta el ciclo en cuanto una entregó. Cableado de verdad en los dos chats: `analista.ts:333` y `copiloto.ts:212`. |
| 2 | MEDIO — el costo de la primera vuelta desaparece si el reintento truena | **CERRADO** — `src/lib/agents/analista.ts:384-392`: el `catch` del segundo ciclo suma `res.tokensIn/tokensOut/cost` al `PartialExecutionError` antes de re-lanzarlo. |
| 3 | MEDIO — el copiloto no contabiliza nada cuando el turno truena | **CERRADO** — `src/app/api/admin/copiloto/route.ts:262-271`: el `catch` del stream emite `copiloto.costo` desde `PartialExecutionError` con `fallo: true`. |
| 4 | MEDIO — `correr_runner`: la previsualización enseña un objetivo que el ejecutor tira | **CERRADO** — `src/lib/agents/copiloto-acciones.ts:145-147`: `objetivoDelRunner(params.id)` acota la vuelta al agente que la tarjeta nombró, y `:158-162` anota el objetivo en la bitácora. |
| 5 | BAJO — `finish_reason:'length'` con `tool_calls` se reporta como «args JSON inválidos» | **CERRADO** — `src/lib/llm/openrouter.ts:824-832`: la comprobación de truncamiento va **antes** de mirar `calls`. |
| 6 | BAJO — la rejilla de caché de lectura no cubre ninguna tool de los dos chats | **CERRADO** — `src/lib/llm/openrouter.ts:675`+`:761` (`readOnlyTools`), consumido en `analista.ts:334` (`TOOLS_LECTURA`, 10 nombres) y `copiloto.ts:213`. |
| 7 | BAJO — `faseDeModelo` saca el gasto del chat del universo que mira su tope | **CERRADO** — `src/lib/likida/costos.ts:107-110`: la escalada a `escalacion` solo ocurre `if (base === 'cuadre')`. |

### Los 11 de la continuación 2

`git diff d95e44f..HEAD` **no toca** `src/lib/likida/facturacion/adaptadores/piloto_vision.ts`
(cero líneas). Los ocho hallazgos que viven en ese archivo son todos
**REINCIDENTES**, verificados por relectura de la línea, no por ausencia de commit:

| Hallazgo (c2) | Estado |
|---|---|
| CRÍTICO — el piloto SÍ puede timbrar: el veto del botón es un regex de cinco verbos y `ensayo` no gatea el clic | **REINCIDENTE** — `piloto_vision.ts:254` sigue siendo `if (a.esBotonQueEmite \|\| HUELE_A_EMITIR.test(boton?.texto ?? '') \|\| HUELE_A_EMITIR.test(a.selector))`; `modo` no aparece en la condición. |
| CRÍTICO — el piloto nunca levanta `emisionSinConfirmar` | **REINCIDENTE** — `piloto_vision.ts:195-210` sin cambios. |
| ALTO — catorce llamadas de Sonnet 5 por ticket y cero filas de costo | **REINCIDENTE** — `piloto_vision.ts:364` sigue siendo `const { data } = await generateStructured…`; `registrarCosto` sigue sin un solo llamador en `facturacion/`. |
| ALTO — ninguna llamada de visión trae `signal`, y el presupuesto del lote no cuenta un paso del piloto | **REINCIDENTE** — `piloto_vision.ts:363-372` sin `signal`. |
| ALTO — la regla 3 no comprueba en QUÉ campo cae la contraseña | **REINCIDENTE**. |
| MEDIO — el loop-guard del piloto recuerda UNA acción | **REINCIDENTE** — `piloto_vision.ts:166-173`. |
| MEDIO — `ok` significa «escribió al menos un campo» | **REINCIDENTE** — `piloto_vision.ts:194-203`. |
| MEDIO — el respaldo del rol `piloto` se eligió cuando `sonnet-5` era un rol de texto | **REINCIDENTE** — `openrouter.ts:69` sigue `'anthropic/claude-sonnet-5': 'openai/gpt-5.6-terra'`; `models.ts:118-124` no declara visión. `cd26f5a` tocó `models.ts` pero solo el comentario de ZDR. |
| MEDIO — el redactor de prospectos: «solo las canónicas» sin nada del lado de la salida | **REINCIDENTE** — `mapa-prospectos/mensaje/route.ts:41` (la regla) y `:31-35` (`Salida` sigue midiendo solo longitud). El delta sí atacó el otro lado del archivo (el decisor ya no sale al modelo, `seudonimo.ts`), pero no la salida de cifras. |
| BAJO — el costo del redactor solo se registra en el camino feliz | **REINCIDENTE, y agravado** — `mapa-prospectos/mensaje/route.ts:125-128`: el `catch` sigue sin leer `StructuredError.usage`; y como `:114` ahora lanza si falla la escritura en base, el `logger.info` de `:115` quedó **detrás** de esa escritura: hoy también se pierde el costo cuando la base falla, no solo cuando falla el modelo. |
| BAJO — `selectorDelInventario` valida por subcadena | **REINCIDENTE** — `piloto_vision.ts:282-288`. |

---

## Hallazgos

### [ALTO] `computer_use`: tres caminos en los que el `emitir` ya apretado vuelve sin `emisionSinConfirmar`, y el ticket regresa a la cola cada hora

`src/lib/likida/facturacion/adaptadores/computer_use.ts:294-296` · `:300-306` ·
`:308-311` · `al_vuelo.ts:448` y `:600-608` (`motivoDeBloqueo`) ·
`cron/facturar` corre cada hora

**Escenario, con valores.** `FACTURACION_MODO=emitir`, ticket de `megasur`,
gasto `g-77`. El modelo llama `emitir` con `selector:'#facturar'` en la ronda 6 —
el portal timbra el CFDI. Después pasa **cualquiera** de estas tres cosas:

1. La pantalla de confirmación tarda y el modelo, sin ver el folio, llama
   `rendirse` con `motivo:'el portal no confirmó'`. → `:294` devuelve
   `{ ok:false, error:'el portal no confirmó' }` **antes** de llegar al `if
   (modo === 'emitir' && !uuid)` de `:300`. Sin bandera.
2. El modelo sigue pidiendo tools hasta la ronda 14. `openrouter.ts:862` tira
   `LoopGuardError`, que sale envuelto en `PartialExecutionError` y cae en el
   `catch` de `:308`. → `{ ok:false, error:'…' }`. Sin bandera.
3. El portal navega a un PDF y el `await inventario(p)` de `:286` —que corre
   **después** del clic de emitir— revienta con «Execution context was
   destroyed». Mismo `catch` de `:308`. Sin bandera.

En los tres, `motivoDeBloqueo(r)` (`al_vuelo.ts:600`) devuelve `null`: solo mira
`requiereCaptcha` y `emisionSinConfirmar`, y a propósito no lee el texto del
error. `guardarUno` cae en `:492` → `intentado:true, facturado:false`,
`cfdi_uuid` y `autofactura_bloqueada_en` siguen `null`, que son exactamente las
dos columnas por las que la cola vuelve a elegir el gasto. A las 24 h, hasta 24
CFDI del mismo consumo con el RFC de la flota.

**Consecuencia.** El contralor recibe N facturas de un consumo de $850 y tiene
que cancelarlas una por una; fuera de plazo ya no puede, y se le queda en su
contabilidad — el daño textual que `agente.ts:53-63` describe. La prueba que
existe (`computer_use.test.ts:123-131`) cubre **solo** el cuarto camino, el del
`return` limpio, y por eso pasa en verde.

**Mitigante que hay que decir en voz alta:** `AdaptadorComputerUse` **no tiene
call site** — `grep` sobre `src/` da tres resultados y los tres están dentro del
propio archivo. Por eso es ALTO y no CRÍTICO: hoy no puede mover un peso. El día
que `registro.ts` lo cablee al lado de `crearPilotoVision`, es CRÍTICO sin que
nada más cambie.

**Causa raíz probable.** La bandera se levanta en **un** `return` en vez de en
una variable que se ponga en el momento del clic — que es la forma que
`playwright_base.ts:334-336` (`seApreto = true` **antes** del clic) ya tiene
escrita doce archivos más allá y por escrito la razón.

---

### [ALTO] `computer_use` cosecha el UUID del texto de la pantalla y lo devuelve TAMBIÉN en `ensayo`: un ensayo que no emitió marca el gasto como facturado

`src/lib/likida/facturacion/adaptadores/computer_use.ts:286` · `:307` ·
`agente.ts:40-41` (el contrato: «*Solo en `emitir` y solo si salió*») ·
`agente.ts:274` · `al_vuelo.ts:492-501`

**Escenario, con valores.** Modo `ensayo` (el default, el candado en el que
descansa el módulo entero). Portal de `enerser`, gasto `g-91`. El adaptador
nunca aprieta nada que emita —la tool `emitir` ni se le ofrece al modelo,
`:210-214`, y eso está bien hecho—. Pero al cerrar:

```ts
uuid = extraerUuid(r.finalText) ?? extraerUuid(await inventario(p)) ?? undefined;   // :286
return { modo, ok: true, capturado, cfdiUuid: uuid, captura };                      // :307
```

`inventario(p)` es el `JSON.stringify` de **todo**: los 1,200 caracteres de
`document.body.innerText` (`:155`), el `valorActual` de cada input y el texto de
cada botón. Basta que la página traiga un UUID en cualquiera de esos sitios —el
listado «Facturas emitidas» que estos portales pintan bajo el formulario, el
folio de la factura anterior de la misma flota en la misma sesión, o el
«Ejemplo: 550e8400-e29b-41d4-a716-446655440000» de una ayuda— y `extraerUuid`
(`:332-335`, un regex sobre 36 caracteres hex) lo devuelve. Río abajo:

- `agente.ts:274` → `incluido: r.ok && (modo === 'ensayo' || …)` = **true**.
- `al_vuelo.ts:492` no corta (`incluido` y `cfdiUuid` presentes) → `:501`
  `escribirUuid(...)` escribe ese folio en `gasto.cfdi_uuid` y devuelve
  `facturado: true`.

**Consecuencia.** Un gasto queda marcado como facturado con el folio fiscal de
**otro** CFDI. El contralor ve el UUID en su pantalla, su contador lo busca en el
XML y no está, y el gasto ya salió de la cola: su CFDI real no se va a pedir
nunca. Es la regla «nunca inventar una cifra» rota por un regex.

La primera mitad del `??` es peor que la segunda: `r.finalText` es lo que el
modelo **escribió**, no lo que leyó. El comentario de `:284-285` dice «se busca
en lo que el modelo leyó Y en la página», y la prueba que lo fija
(`computer_use.test.ts:133-141`) se titula «con UUID en la pantalla» pero lo que
inyecta es `textoFinal = 'Listo, UUID B0800A68-…'` — o sea la prosa del modelo,
rotulada como pantalla.

**Causa raíz probable.** La extracción se escribió para el camino de `emitir` y
el `return` de éxito es uno solo para los dos modos; nada en el tipo
`ResultadoAgente` impide que un `ensayo` traiga `cfdiUuid`, aunque su comentario
lo prohíba.

---

### [ALTO] La regla `properties: {}` se rompió: las cinco tools nuevas declaran `selector` como string libre, sin `enum` y sin `additionalProperties`, y ninguna prueba de invariante las alcanza

`src/lib/likida/facturacion/adaptadores/computer_use.ts:319-329`
(la fábrica `herramienta()`) · `:200-214` (las cinco declaraciones) ·
`src/lib/agents/chat-tools.test.ts:105-133` (las dos invariantes, que solo
recorren `funciones()` de `chat-tools.ts`)

**Escenario.** El repo hace fallar una prueba si una tool del chat declara un
`string` sin `enum` («*`X.y` es string SIN enum*») o si le falta
`additionalProperties: false` («*sin él el modelo puede inventar un parámetro que
algún handler lea por accidente*»). `herramienta()` produce:

```ts
parameters: { type: 'object', properties: props, required: Object.keys(props) }
```

sin `additionalProperties`, y `props` es `{ selector: { type: 'string' } }` en
`clic`, `seleccionar` y **`emitir`**. De las cinco tools, la única propiedad con
`enum` es `clave` en `escribir` (`:202`). O sea: el candado que el archivo
declara en su encabezado —«el modelo elige DÓNDE va cada dato; nunca CUÁL es»—
cubre **una** de las nueve propiedades declaradas. `selector`, que decide qué
control del portal se toca, es texto libre; en `emitir` decide qué botón timbra
un CFDI. Y ninguna de las dos pruebas de invariante lo ve: viven en
`chat-tools.test.ts` y solo recorren el registro del analista.

**Consecuencia.** Es el punto exacto que el rubro manda vigilar («*lo que sí hay
que vigilar es que ninguna tool nueva rompa esa regla*»). La regla no está
escrita en ningún sitio ejecutable que cubra al repo entero: es una prueba de un
archivo, y el adaptador nuevo nació fuera de su alcance. El siguiente adaptador
nacerá igual.

**Causa raíz probable.** La invariante se implementó como prueba de **un
módulo** (`funciones()` de `chat-tools.ts`) en vez de como prueba de **todo
schema que se le pase a `generateWithTools`**, que es la frontera que de verdad
importa.

---

### [ALTO] `emitir` no pasa por la rejilla de idempotencia de mutaciones: dos llamadas en rondas distintas son dos clics

`src/lib/likida/facturacion/adaptadores/computer_use.ts:265-278` (executor
propio, sin registro) · `src/lib/llm/tool-executor.ts:159-175`
(`isMutation` → la rejilla que existe justo para esto) ·
`src/lib/llm/openrouter.ts:761` (`crossRound` solo cachea `esLectura`)

**Escenario, con valores.** Modo `emitir`. El modelo llama `emitir` con
`selector:'#facturar'` en la ronda 5. El portal timbra pero re-renderiza el mismo
formulario (varios de estos portales vuelven a la pantalla de captura tras
emitir). El inventario que vuelve como resultado de tool (`:242`) se parece al
anterior, el modelo concluye que no pasó nada y llama `emitir` otra vez en la
ronda 7. Nada lo detiene: `crossRound` (`openrouter.ts:761`) solo memoriza tools
de **lectura** —y `emitir` no empieza por ningún prefijo de `READ_PREFIXES`—, y
`inRound` solo dedupea dentro de la MISMA ronda. **Dos CFDI, una sesión.**

El repo ya tiene resuelto exactamente este problema para la otra mutación cara:
`tool-executor.ts:159-175` cachea la promesa de una tool `isMutation` por nombre
para que un `guardar_liquidacion` repetido no produzca dos PDF. `computer_use`
pasa su propio `toolExecutor` (`:265`) y no toca ese registro, así que la tool
más cara del repo es la única mutación sin rejilla.

**Consecuencia.** Dos CFDI del mismo consumo dentro de una sola invocación —sin
siquiera esperar a la vuelta del cron del hallazgo anterior—. Mismo mitigante:
hoy no hay call site.

**Causa raíz probable.** La rejilla vive en `tool-executor.ts` y se gana
registrando la tool; un ejecutor a mano (que es la forma correcta para tools que
no tocan la base) la pierde entera sin que nada avise.

---

### [MEDIO] `PROHIBIDOS` mira el selector y no la etiqueta: el checkbox de partidos políticos de CAPUFE —el caso que dice generalizar— no lo dispara

`src/lib/likida/facturacion/adaptadores/computer_use.ts:71` · `:218` ·
`capufe.ts:237` (`complementoPartidos: '#cb1'`) · `capufe.ts:1110-1113` (la
prohibición original, por igualdad de selector) ·
`computer_use.test.ts:144-152` (la prueba, con `#checkPartidoPolitico`)

**Escenario, con valores.** El inventario devuelve el campo
`{ s:'#cb1', tipo:'checkbox', etiqueta:'Complemento para la facturación de
partidos políticos' }` — el selector y la etiqueta reales, leídos de
`capufe.ts:237` y de `pagina_playwright.test.ts:120`. El modelo, que «*ve una
casilla sin marcar y tiende a marcarla*» (palabras del propio comentario de
`:67-70`), llama `clic` con `selector:'#cb1'`. La guarda de `:218` evalúa
`PROHIBIDOS.test('#cb1')` → `false`: el regex busca `partido|donativ|…` **en el
selector**, y la etiqueta —que es donde está la palabra— no se mira, aunque el
inventario la trae. Se aprieta.

La prueba que declara este candado cerrado usa `selector:'#checkPartidoPolitico'`,
una cadena que sí contiene «Partido» y que no se parece a ningún selector real de
los portales del catálogo.

**Consecuencia.** Un CFDI con complemento de partidos políticos emitido por una
flota de carga: un comprobante que no aplica, que llega al SAT y que el contador
tiene que explicar. La única forma en que el selector delata la etiqueta es el
camino de botones sin `id`/`name` (`:149`, donde el selector se arma con
`:has-text("…")`); para inputs, `sel()` siempre devuelve `#id` o
`tag[name="…"]` (`:115-121`), o sea nunca el texto.

**Causa raíz probable.** Se generalizó una prohibición **por igualdad de
selector conocido** a una prohibición **por parecido de cadena**, sobre el único
dato que no contiene la palabra prohibida.

---

### [MEDIO] Las acciones de una ronda corren en `Promise.all` sobre la misma pestaña: el orden que el modelo pidió no es el orden que se ejecuta

`src/lib/llm/openrouter.ts:869` (`const results = await Promise.all(` sobre
`llamadas`) · `computer_use.ts:216-250` (el executor toca `p`, una sola pestaña
compartida) · comparar con `playwright_base.ts`, que es estrictamente secuencial

**Escenario, con valores.** El modelo devuelve en UNA ronda tres tool calls, que
es el comportamiento normal de Sonnet con `tool_choice:'auto'`:
`escribir(#rfc, rfc)`, `escribir(#webid, webId)`, `clic(#validar)`. `:869` las
dispara **a la vez** contra la misma `PaginaPlaywright`. El `click` no espera a
los dos `fill`: el portal recibe el submit con el formulario a medio llenar,
contesta «RFC requerido», y `capturado` (`:228`) registra los dos campos como
escritos porque el `fill` sí terminó — después. En modo `emitir` la misma ronda
puede traer `escribir(...)` y `emitir(...)` juntos.

**Consecuencia.** Un diagnóstico que no corresponde a lo que pasó («el portal
pide el RFC» cuando el RFC sí se escribió) y, en `emitir`, un CFDI timbrado con
los campos que alcanzaron a entrar. No es un defecto de `generateWithTools` —para
las tools vivas de hoy, que son lecturas contra `repo.ts`, el paralelismo es
correcto y es lo que las hace rápidas—: es que el contrato «las tools de una
ronda son independientes» dejó de ser cierto en cuanto una tool empezó a mutar
un estado compartido, y nada en la firma lo dice.

**Causa raíz probable.** `Promise.all` es la decisión correcta para tools puras y
no hay forma de declarar que un juego de tools es secuencial.

---

### [MEDIO] El tope de la sonda de ingesta cuenta como suyo el OCR de WhatsApp sin viaje abierto: el contralor recibe un 429 por gasto que no hizo

`src/app/api/dashboard/ingesta/tope.ts:34-45` (`fase='ocr'` + `viaje_id IS
NULL`) · `:8-10` (el comentario que declara la distinción: «*lo que la distingue
del OCR real de WhatsApp, que siempre lleva viaje*») ·
`src/lib/likida/processor.ts:966` · `src/app/api/dashboard/ingesta/route.ts:74-76`

**Escenario, con valores.** La afirmación del comentario es falsa:
`processor.ts:966` escribe `registrarCosto({ tenantId, viajeId: null, fase:
'ocr', … })` — es la rama «la foto tampoco se tira», la del chofer que «*termina
la ruta, saca el fajo y manda once fotos de golpe*» **sin viaje abierto**
(`processor.ts:952-957`). Esa fila es indistinguible de una sonda.

A ~$0.01 por lectura de visión (la cifra del propio `tope.ts:17-19`) y con
`topeSondaDiaUsd()` en $1.00: diez operadores de la flota mandando su fajo de
once fotos antes de que la oficina abra los viajes = 110 filas = **$1.10** →
`gastoSondaHoyUsd()` devuelve más que el tope. El contralor entra a
«Preguntar a la IA», arrastra un ticket para ver qué leería el motor, y recibe
**429** con el texto *«la lectura de prueba llegó a su tope diario (existe para
cuidar tu costo); mañana se renueva»* — sin haberla usado nunca.

**Consecuencia.** El rótulo miente sobre quién gastó, y la pantalla que existe
para que el comprador **vea** el motor leyendo un comprobante es justo la que se
apaga el día que sus choferes mandan más fotos. El día del demo eso es la
demostración cancelada por un tope de otro.

**Causa raíz probable.** La partición del gasto se hizo sobre `(fase, viaje_id
IS NULL)`, que describe *qué se leyó* y no *quién lo pidió*; la fase `sonda` (o
un `origen`) no existe en `FaseCosto`.

---

### [MEDIO] `seleccionar` deja que el modelo elija el valor: régimen fiscal y uso de CFDI son `<select>` en estos portales, y ahí la regla «nunca CUÁL es» no aplica

`src/lib/likida/facturacion/adaptadores/computer_use.ts:204-206` (la tool:
`valor: { type:'string' }`, sin `enum`) · `:231-236` (se pasa tal cual a
`p.seleccionar`, sin cruzarlo contra `valores`) · `:41-48` (la regla declarada:
«*EL MODELO NO PUEDE TECLEAR TEXTO LIBRE. Nunca.*») · `capufe.ts:233-234`
(`regimenFiscal`/`usoCfdi` son `select[name="receptor.…"]`) ·
`computer_use.test.ts:183-191`

**Escenario, con valores.** El receptor de la flota trae `usoCfdi: 'G03'`
(gastos en general) y `regimenFiscal: '601'`. Ninguno de los dos puede escribirse
con `escribir`: `p.escribir` hace `loc.fill(...)`
(`pagina_playwright.ts:671-682`), que sobre un `<select>` lanza. O sea que los
dos campos fiscales del receptor pasan **obligatoriamente** por `seleccionar`,
cuyo `valor` lo pone el modelo. El inventario le ofrece hasta 40 opciones
(`:135`), y nada compara lo elegido contra `valores.usoCfdi`: el modelo lee la
etiqueta «G01 Adquisición de mercancías», le parece que un ticket de diésel es
mercancía, y manda `{ selector:'#usoCfdi', valor:'G01' }`. Se ejecuta.
`capturado['#usoCfdi'] = 'G01'` y el ensayo sale verde.

**Consecuencia.** Un CFDI con el uso equivocado es un gasto que el contador tiene
que corregir o que no acredita; y la frase que encabeza el archivo —«el modelo
elige DÓNDE va cada dato; nunca CUÁL es»— no describe al código en los dos
campos donde más importa. La prueba `:183-191` fija el comportamiento
(`valor:'601'` se ejecuta) sin comprobar que `601` sea el valor del receptor.

**Causa raíz probable.** La regla se implementó en `escribir` (clave→valor) y
`seleccionar` se agregó después como camino «para `<select>`», heredando la
firma de `PaginaPlaywright` en vez de la del candado.

---

### [BAJO] `computer_use` no deja una sola fila de costo, y el camino que truena pierde también lo que ya se pagó

`src/lib/likida/facturacion/adaptadores/computer_use.ts:289-292` (el único sitio
donde `r.cost` aparece: un `logger.info`) · `:308-311` (el `catch` que descarta
el `PartialExecutionError` sin leer su `cost`) · `:255` (`role: 'cuadre'` →
Sonnet 5, $2/$10 por M) · `costos.ts:121` (`registrarCosto`, sin un solo
llamador en toda la ruta de facturación)

**Escenario, con números.** Un vuelo típico: 14 rondas de Sonnet 5, cada una
reenviando el inventario del formulario (~300 tokens según el propio comentario
de `:27-34`) más la conversación acumulada. `generateWithTools` devuelve `cost` y
`costoPorModelo` desglosado, y aquí solo se imprime el primero en una línea de
log. En `llm_costo` no entra nada, así que ni el tablero de `/admin` ni el costo
por flota lo cuentan. Y cuando el ciclo truena —loop-guard, truncamiento,
provider caído—, `PartialExecutionError` trae `cost` con lo ya gastado y el
`catch` de `:308` lee solo `e.message`: se pierde entero.

Es el mismo hallazgo que se le escribió al piloto de visión hace una pasada
(ALTO, «catorce llamadas de Sonnet 5 por ticket y cero filas de costo»), repetido
en un archivo nuevo. Va como BAJO y no como ALTO por el mismo motivo que los
demás de este adaptador: sin call site, hoy el gasto es cero.

---

## Lo que revisé y está bien

- **El loop-guard, de verdad y con prueba.** `openrouter.ts:842-862` corta
  **antes** del `Promise.all` que dispara las tools —o sea antes de pagar la
  ronda y antes de que una mutación corra para nadie—, y la excepción de la tool
  terminal está acotada a las terminales (`:861`). Once pruebas nuevas en
  `openrouter_loopguard.test.ts` lo fijan, incluida la que comprueba que en la
  última ronda las lecturas **no** corren.
- **El costo por modelo cuando el ciclo cruza de proveedor.** `openrouter.ts`
  acumula ronda a ronda con el modelo que de verdad respondió
  (`acumularCosto`, `costoRonda`) y expone `costoPorModelo`; `analista.ts:397-401`
  lo fusiona con el del reintento. Es la forma correcta y está probada.
- **La caché de lectura ya acierta.** `llaveDeCache` (`openrouter.ts:627-637`)
  llavea por **nombre** las tools sin parámetros —que es lo que describe el
  efecto, no la llamada— y por `nombre:args` las que sí los tienen. El
  razonamiento está escrito y es correcto; solo se cachea el éxito.
- **La rejilla de mutaciones sigue en su sitio y con su razón escrita**
  (`tool-executor.ts:159-175`), incluido el aviso de qué habría que revisar
  primero el día que una tool decida sobre datos.
- **Las 26 tools vivas no se movieron.** `tools.ts:34,96,139,210` siguen con
  `properties: {}, additionalProperties: false`, `chat-tools.ts:25` con
  `SIN_PARAMS`, y las cuatro invariantes de `chat-tools.test.ts:100-133` (sin
  texto libre, sin propiedades extra, sin `tenant` por parámetro, sin schema
  fantasma) siguen verdes.
- **`computer_use` hace bien lo más importante de todo:** en `ensayo` la tool
  `emitir` **no se le ofrece** al modelo (`:210-214`), y hay prueba de que no
  está en la lista (`computer_use.test.ts:112-116`). Es estrictamente mejor que
  el piloto de visión, que en el mismo modo sí puede apretar el botón. Y
  `escribir` con una clave inexistente devuelve texto de error al modelo en vez
  de escribir (`:226`), con prueba.
- **La sonda de ingesta falla cerrado.** `ingesta/route.ts:67-76`: si no se pudo
  leer el presupuesto se contesta 503 y **no se gasta**; el tope se lee antes de
  tocar el modelo; hay rate limit por usuario y fila de costo por llamada. El
  defecto que reporto es de a quién se le imputa el gasto, no del freno.
- **El `catch` de la sonda no pierde costo**, aunque lo parezca:
  `intake/ocr.ts:262-291` no re-lanza, devuelve `motivo:'fallo_tecnico'` con el
  `usage` del `StructuredError`, así que la fila se escribe igual.

## Lo que NO alcancé a revisar

- **Si `openai/gpt-5.6-terra` lee imágenes.** Sigue sin red y sigue decidiendo si
  el MEDIO reincidente del fallback del rol `piloto` es «decide a ciegas» o «se
  cae limpio».
- **Si `AdaptadorComputerUse` está pensado para sustituir a `piloto_vision` o
  para convivir.** Los dos resuelven el mismo problema («los 36 portales que
  nadie escribió») con dos ciclos distintos, uno por visión y otro por
  inventario del DOM, y solo uno está cableado. Cuál se queda cambia cuáles de
  estos hallazgos importan; es decisión de arquitectura y no la levanto como
  hallazgo de este rubro.
- **El tamaño real del prompt de `computer_use`.** `inventario()` no acota el
  número de campos ni de botones (solo 40 opciones por `<select>`, 1,200
  caracteres de texto y 60 de etiqueta), y ese JSON vuelve **entero** como
  resultado de cada `clic` (`:239`). Una página con 300 inputs multiplica el
  costo de cada ronda; no medí tokens.
- **`valorActual` de un `input[type=password]`.** `inventario()` lo incluye
  (`:142`) sin mirar el `tipo`, así que un portal que traiga la contraseña
  precargada la mandaría al modelo. No pude construir el escenario con valores:
  este adaptador no recibe credencial ni hace login, y depende de si
  `sesion_portal.ts` llega a restaurar una sesión con el campo relleno. Lo dejo
  anotado porque es la misma clase del ALTO reincidente del piloto.
- **`registrarCorrida` y el `finally` de `procesarLoteEnCola` bajo el reloj de
  Vercel** con un adaptador que gasta rondas de modelo. Es el ALTO reincidente
  del piloto y aplica igual aquí, pero el cálculo en segundos exige topes de
  página que `computer_use` no declara.
