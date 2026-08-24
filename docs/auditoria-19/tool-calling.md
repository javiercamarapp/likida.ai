# Tool calling — auditoría 19

**Nota: 4/10** (antes 5). Razón del movimiento: **deuda que cobró factura**. El
núcleo del rubro no empeoró y hay que decirlo con precisión: `openrouter.ts`,
`tools.ts`, `chat-tools.ts` y `copiloto-tools.ts` **no cambiaron ni un byte** en
el delta (`git diff 583fec4..8b43121` no los lista), siguen siendo **31** tools
registradas —las mismas 31—, ninguna acepta un dato del modelo, y las 241
pruebas de `src/lib/llm/` + `src/lib/agents/` + `src/lib/likida/perfil/` pasan.
Lo que cobró factura es lo otro: el delta abrió **una superficie nueva conducida
por modelo que ESCRIBE la configuración fiscal del tenant** (`perfil/`), y la
construyó **fuera de todos los guardarraíles que la frontera ya tenía** — sin
fila de costo, sin tope diario, sin guardia de salida, sin una sola prueba del
aplicador. Y por ese hueco entra el primer CRÍTICO del rubro en cuatro pasadas:
la política **de demo** se persiste en `tenant.config` como si el cliente la
hubiera declarado. Además, de los seis hallazgos abiertos de la c4, **cinco
siguen abiertos íntegros y uno se cerró a medias**.

**El riesgo mayor hoy:** el configurador de onboarding escribe en la
configuración de dinero de la flota los números de `DEMO_CONFIG` —$1,500 de
caseta, $800 de comida, $2,500 de hotel— con procedencia de declarados, y la
pregunta que los provoca promete en pantalla exactamente lo contrario.

---

## Verificación de los abiertos de la c4

| Hallazgo (c4) | Estado | Evidencia leída hoy |
|---|---|---|
| ALTO — `viajes_flota`/`liquidaciones_flota` llaman `total` al tope de su consulta | **REINCIDENTE** | `chat-tools.ts:135` (`total: vs.length`) contra `analytics.ts:994` (`limite = 100`); `chat-tools.ts:156` contra `analytics.ts:1973-1980` (`.limit(50)`). Archivo sin cambios en el delta. |
| ALTO — el 2º `generarPdfs` puede fallar en silencio y se archiva el PDF viejo | **REINCIDENTE** | `tools.ts:322-323` siguen siendo `let` del alcance exterior; `:359-361` el `catch` solo loguea; `:386-388` el reintento vuelve a llamar `generarPdfs` y luego `saveLiquidacion(..., pdfPath, ...)`; `:399` `estado: pdfPath && pdfOperadorPath ? 'ok' : 'parcial'`. |
| ALTO — `motor_fiscal` entrega un desglose que no suma su total (`efectivo_no_elegible` fuera de `ORDEN`) | **REINCIDENTE** | `fiscal.ts:475-478`: `ORDEN` sigue con SIETE causas; `:319` y `:386` `efectivo_no_elegible` sigue viva y `:450` se sigue emitiendo; `:554-555` `porCausa = ORDEN.filter(...)`. |
| ALTO — la invariante de schemas cubre 10 de 31 tools | **REINCIDENTE** | `chat-tools.test.ts:89-94` sigue recorriendo solo `TOOLS` (las 10 del analista); `copiloto-tools.test.ts` sigue **sin una sola aserción de schema** (`rg 'parameters\|properties\|schema'` sobre ese archivo: cero resultados). |
| MEDIO — `motor_fiscal` recorta `porCausa` a 6 sin declararlo | **REINCIDENTE** | `chat-tools.ts:119` `porCausa: r.porCausa.slice(0, 6)`, sin `total` ni `mostrando`, contra `:136` y `:157` que sí los traen. |
| MEDIO/ALTO — RES-10 depende de `emisionSinConfirmar` y ningún adaptador la levanta | **CERRADO A MEDIAS** | `computer_use.ts:298-306` **ahora sí** devuelve `emisionSinConfirmar: true` en `modo === 'emitir' && !uuid`. Pero los otros dos caminos siguen igual: `:293` (`if (rendido)`) y el `catch` de `:308-311` regresan sin la bandera, y `motivoDeBloqueo` (`al_vuelo.ts:701-709`) sigue mirando solo captcha y esa bandera. `vercel.json:22-23` sigue en `*/15 * * * *`. Mitigante verificado hoy: `AdaptadorComputerUse` **sigue sin call site** (`rg` sobre `src/` fuera de su propio archivo: cero resultados). |
| Los 11 de la c2 en `piloto_vision.ts` | **REINCIDENTES** | `git diff 583fec4..8b43121 -- src/lib/likida/facturacion/` toca únicamente `pendientes.ts` y su prueba. `piloto_vision.ts:194-203` sigue devolviendo `ok: llenoAlgo` sin `emisionSinConfirmar`. |

---

## Hallazgos

### [CRÍTICO] El configurador persiste la política DE DEMO como política declarada de la flota — y la pregunta que lo dispara promete por escrito lo contrario

`src/lib/likida/perfil/entrevista-aplicar.ts:150-171` (bloque completo) ·
`:153` (`getConfig`) · `:155-156` (el fallback `cfg.politica.find`) ·
`:157-164` (el arreglo) · `:165` (`guardarPolitica`) · `:166` (la nota) ·
`src/lib/likida/config.ts:93-103` (`DEMO_CONFIG.politica`) · `:171`
(`if (override == null) return base`) · `:224` (`fusionarConfig(DEMO_CONFIG, override)`) ·
`src/lib/likida/perfil/entrevista.ts:378-379` (la promesa) · `:966` (la confirmación) ·
`src/lib/likida/cuadre/engine.ts:636-643` · `:1372`

**Escenario, con valores.** Flota nueva, `tenant.config` en `NULL` (es el caso
por construcción: el onboarding es la primera sesión). El dueño llega a la
pregunta 22 del catálogo, «Topes de gasto por viaje», y contesta lo que tiene a
la mano: **«diésel 6000»**.

1. `parseCampo` → `parseTopes` (`entrevista.ts:603-618`) devuelve
   `{ diesel: 6000, caseta: undefined, alimentacion: undefined, hospedaje: undefined }`.
2. `nutrirDesdeHechos` entra al bloque de `:150`. `getConfig(tenantId)`
   (`:153`) devuelve **`DEMO_CONFIG` tal cual**: `fusionarConfig` regresa la
   base cuando no hay override (`config.ts:171`), y el override es `null`.
3. `tope('diesel', 6000)` → `{ concepto: 'diesel', topeMonto: 6000 }` — correcto,
   es lo que el cliente dijo.
   `tope('caseta', undefined)` → cae al `cfg.politica.find(...)` de `:156` →
   **`{ concepto: 'caseta', topeMonto: 1500 }`**, que es el renglón de demo.
   Igual `alimentacion` → **800** y `hospedaje` → **2500**.
   El spread de `:162` arrastra además `{ concepto: 'transporte', topeMonto: 800 }`
   y `{ concepto: 'flete' }`, que el cliente nunca vio.
4. `guardarPolitica(tenantId, politica, actor)` (`:165`) los **escribe en
   `tenant.config.politica`** vía `mezclarConfig` (`administracion.ts:477`).
   Desde ese instante ya no son un default: son la política del tenant.
5. El chat contesta `Topes de flota escritos en Políticas (no son ley).`
   (`:166`) y `mensajeConfirmacion` imprime
   `Topes de flota (no son ley): {"diesel":6000}` (`entrevista.ts:966`) —
   **solo `hechos`**. Los tres números inventados no aparecen en ninguna línea.
6. Al siguiente viaje, una caseta real de **$1,800** (un T3S2 en la México–
   Querétaro pasa de $1,500 sin esfuerzo) dispara
   `sobre_politica` (`engine.ts:636-643`) con la nota literal *«Caseta de
   $1,800.00 excede el tope de política ($1,500.00) por $300.00»*, entra al
   `hayDif` de `engine.ts:1372` —así que la liquidación sale «con diferencias»
   aunque el dinero cuadre al peso— y se pinta en el PDF que recibe el operador
   (`liquidacion/pdf.ts:429`).

**Lo que hace esto CRÍTICO y no MEDIO** es que la propia pregunta dice, en la
pantalla, lo que el código incumple. `entrevista.ts:378-379`:

> `porQue`: «Sin política propia, el motor usa los números de la demo. **No son
> los de ustedes hasta que los declaren.**»
> `sustento`: «Si no los tienes, **se deja el de demo marcado como default, no
> como declarado.**»

Intenté refutarlo por tres lados y no aguanta ninguno: (a) `guardarPolitica`
(`administracion.ts:452-481`) valida forma, no procedencia — no hay guarda río
abajo; (b) el chip `topes-demo` (`entrevista.ts:381`) al menos enseña los cuatro
números antes de escribirlos, pero el camino de texto libre no enseña ninguno; y
(c) el mensaje de confirmación, que sería la última red, imprime únicamente lo
que el usuario dijo.

**Consecuencia.** El contralor abre `/dashboard/politicas` y ve cuatro topes que
él no puso, con la autoridad de haberlos «declarado»; y sus operadores empiezan a
salir marcados por exceder un tope que la flota nunca fijó. Es la regla que
define al producto —*nunca inventar una cifra; una estimación se puede mostrar,
declarada*— rota escribiendo el dato de demo en la base con la etiqueta de real.

**Causa raíz probable.** `tope()` usa `cfg.politica` como fuente de «lo que ya
había», pero `getConfig` no distingue «lo que el tenant declaró» de «lo que
DEMO_CONFIG rellena»; se copia una lista completa donde solo había que aplicar
un patch de los conceptos nombrados.

---

### [ALTO] El mismo bloque reescribe el renglón entero de política: un tope declarado por chat borra el `requiereCfdi` que el panel había puesto

`src/lib/likida/perfil/entrevista-aplicar.ts:155-156` ·
`src/lib/likida/administracion.ts:581` ·
`src/lib/likida/cuadre/engine.ts:26-28` · `:645`

**Escenario, con valores.** Flota que ya usó `/dashboard/politicas` y guardó
`{ concepto: 'diesel', topeMonto: 4000, requiereCfdi: true }` — el escritor del
panel lo permite explícitamente (`administracion.ts:581`:
`nueva.push({ concepto, topeMonto, requiereCfdi: r.exigeCfdi })`). Después el
dueño vuelve al chat de onboarding a corregir el tope y escribe **«diesel
5000»**.

`tope('diesel', 5000)` construye el renglón **desde cero**:
`{ concepto: 'diesel', topeMonto: 5000 }`. `requiereCfdi` no se copia porque el
literal no lo menciona. `guardarPolitica` lo persiste.

A partir de ahí, `engine.ts:645` (`if (pol?.requiereCfdi && !g.cfdiUuid)`) deja
de emitir `sin_cfdi` para el diésel: una carga de $4,800 pagada con ticket y sin
CFDI ya no aparece en `diferencias` como «requiere factura CFDI y no trae UUID
válido». El control no se apagó por una decisión: se cayó de un objeto literal.

**Consecuencia.** El contralor deja de ver la lista de cargas de diésel sin
timbrar — que es justo la lista con la que persigue al portal de la estación
antes de que se le venza el plazo. Y no hay señal: el chat contesta «Topes de
flota escritos en Políticas», el log queda mudo, y la única forma de notarlo es
abrir Políticas y ver que la casilla se destildó sola.

**Causa raíz probable.** El patch de topes se escribe como reemplazo del renglón
completo en vez de como mezcla sobre el renglón existente; `PoliticaGasto` tiene
cuatro campos y el literal solo llena dos.

---

### [ALTO] Cada turno del configurador reescribe la fila fiscal COMPLETA del tenant: `uso_cfdi` se fuerza a `G03` y `email_facturacion` se pone en NULL

`src/lib/likida/perfil/entrevista-aplicar.ts:131-148` (esp. `:135` y `:142`) ·
`src/lib/saas/fiscal.ts:163-165` · `:172-179` (`uso_cfdi`, `email_facturacion: email || null`) ·
`:189-201` (`update(fila)` sin patch) ·
`src/lib/likida/perfil/entrevista.ts:109/122/131/151` (preguntas 3-6) vs `:461` (pregunta 30) ·
`src/app/dashboard/suscripcion/page.tsx:197` y `:387`

**Escenario, con valores.** La flota ya capturó sus datos fiscales en
`/dashboard/suscripcion` — que es la pantalla que existe para eso
(`page.tsx:197` llama `guardarDatosFiscales`): RFC `TPE010203AB1`, razón social,
régimen 601, CP 76000, **uso `G01`** (uno de los tres de `USOS_CFDI`,
`fiscal.ts:34-38`) y **correo `facturacion@transpeninsulares.mx`**.

Después el dueño entra al chat de onboarding y contesta las preguntas 3 a 6
(RFC, razón social, régimen, CP). En cuanto la cuarta queda declarada,
`nutrirDesdeHechos` entra al `if` de `:138` y llama:

```ts
await guardarDatosFiscales(tenantId, {
  rfc, razonSocial: razon, regimenFiscal: regimen, codigoPostal: cp,
  usoCfdi: 'G03', email,                      // :142  ← G03 fijo; email = undefined
});
```

`email` sale de `:135` y es `undefined`, porque **`emailFacturacion` es la
pregunta 30 de 30** (`entrevista.ts:461`), veinticuatro turnos más adelante.
`validarDatosFiscales` produce `email_facturacion: email || null`
(`fiscal.ts:178`) y `uso_cfdi: 'G03'` (`:177`), y `guardarDatosFiscales` hace un
`update(fila)` de la fila completa (`:195-198`). Resultado en `tenant`:

- `uso_cfdi`: `G01` → **`G03`**. La entrevista nunca pregunta el uso (no está en
  `CampoEntrevista`, `entrevista.ts:26-49`): lo decide un literal.
- `email_facturacion`: `facturacion@transpeninsulares.mx` → **`NULL`**.

Y se repite: `nutrirDesdeHechos` corre en **todos** los turnos que guardan algo,
así que del turno 6 al 29 se reescribe `NULL` veinticuatro veces, cada una
acompañada de la nota `Los cinco datos del receptor CFDI 4.0 ya están en la
flota (uso G03).` (`:144`) — que afirma completitud justo mientras vacía un
campo.

**Consecuencia.** El CFDI que **Likida le timbra a su propio cliente** sale con
`use: receptor.usoCfdi` (`saas/facturapi.ts:220`) = `G03` en vez del que el
cliente eligió, y sin correo de entrega. Un UsoCFDI equivocado se corrige
cancelando y re-timbrando; y el cliente que no recibe su factura la reclama al
mes siguiente. `esFiscalCompleto` (`fiscal.ts:61`) no mira el correo, así que
nada avisa.

**Causa raíz probable.** El escritor de datos fiscales es un `update` de fila
entera pensado para un formulario que trae los seis campos; el chat lo llama con
cuatro y dos constantes, y los que no trae no quedan intactos: quedan escritos.

---

### [ALTO] El turno del configurador gasta modelo y no deja una sola fila de `llm_costo` — ni tiene tope diario; su gemelo `/api/dashboard/chat` tiene los dos

`src/lib/likida/perfil/entrevista-agente.ts:44-63` (el `r` se descarta entero) ·
`src/app/api/dashboard/onboarding-chat/route.ts:61-76` ·
contra `src/app/api/dashboard/chat/route.ts:62-76` (tope) y `:92-99` (registro por modelo)

**Escenario, con valores.** `generateResponse` devuelve
`{ text, model, tokensIn, tokensOut, cost }` (`openrouter.ts:338-344`). En
`entrevista-agente.ts:57-63` el `return` toma **solo `r.text`**: `tokensIn`,
`tokensOut` y `cost` se tiran. La ruta tampoco los pide, y `rg registrarCosto
src/` no da un solo resultado en `perfil/` ni en `onboarding-chat/`.

Tamaño del turno, medido sobre el código: el system es `systemExplicar`, que
inserta el **catálogo entero de 30 preguntas** con su cita y su sustento
(`entrevista-agente.ts:13-15`; `CATALOGO` ocupa ~26 KB de fuente,
`entrevista.ts:77-530`), más hasta 6 mensajes de historial de 2,000 caracteres
(`:50`, y el recorte de `route.ts:21`), más el extracto del documento adjunto de
hasta **16,000 caracteres** (`route.ts:45`). Del orden de 10–11 K tokens de
entrada por turno, en `google/gemini-3.5-flash-lite` ($0.30/$2.50 por M,
`openrouter.ts:188`). Nada de eso aparece en `llm_costo`.

Consecuencias encadenadas, todas verificadas:
- `getResumenCosto` (`costos.ts:325-351`) devuelve `estado: 'medido'` sobre una
  suma que no incluye este gasto. Es exactamente lo que el encabezado del propio
  módulo llama el peor modo de falla (`costos.ts:5-13`: *«bajó sola y nadie lo
  notó»*), y el que hace que el precio por liquidación se fije con una cifra
  baja.
- **No hay freno.** `/api/dashboard/chat` corta a `topeDiaUsd()` ($1/día por
  tenant, `chat/tope.ts:18-21`) y falla **cerrado** si no puede leer el gasto
  (`chat/route.ts:66-70`). El onboarding-chat no consulta nada: un `flota_admin`
  autenticado que deja la pestaña abierta mandando preguntas gasta sin techo y
  sin registro.
- El `catch` de `:64-75` tampoco contabiliza: una llamada que revienta después
  de que el proveedor cobró (o después de un fallback, `openrouter.ts:350-353`)
  se pierde entera.

**Consecuencia.** El costo por flota que ve Javier en `/admin` es una afirmación
—`estado: 'medido'`— sobre una medición incompleta, y la única superficie del
producto sin tope de gasto es la que el cliente usa en su primera sesión.

**Causa raíz probable.** El módulo se escribió mirando `entrevista.ts` (que no
llama al modelo) y no `chat/route.ts` (que sí): se copió la forma del stream
NDJSON y no la disciplina de costo que va con ella.

---

### [ALTO] La respuesta del configurador vuelve al contralor sin ningún control de salida — y su prompt le pide precisamente lo que nadie verifica

`src/lib/likida/perfil/entrevista-agente.ts:16-28` (las reglas, solo en el prompt) ·
`:57-63` (`texto: r.text`, verbatim) ·
contra `src/lib/agents/analista.ts:165-180` (`cifrasRespaldadas`) y `:409-427` (la red final)

**Escenario, con valores.** `parecePregunta` (`:6-10`) garantiza que toda
pregunta del dueño cae en esta rama. El dueño escribe: **«¿de cuánto es el
estímulo del IEPS del diésel esta semana?»**. El catálogo que viaja en el system
no contiene ninguna cuota semanal —esas viven en `normas/` y las baja la skill
`cuota-diesel`, con su rango de vigencia—, así que la única regla que impide una
cifra inventada es la línea 19 del prompt («NUNCA declares un hecho fiscal por el
usuario») y la 20 («NUNCA cites un artículo que no esté en el catálogo»).

`gemini-3.5-flash-lite` a `temperature: 0.2` contesta con una cuota de memoria
—«$0.4529 por litro»— o con un artículo que no está en el catálogo, y el código
la devuelve **tal cual**: `return { texto: r.text, ... }` (`:58`). No hay una
sola comprobación entre el modelo y la pantalla.

La asimetría es lo que lo vuelve reportable y no una limitación del medio: el
otro chat del panel sí tiene la red. `analista.ts` extrae cada número de la
respuesta (`:112-135`), exige que esté respaldado por lo que devolvió una tool o
sea derivada de un nivel (`:145-163`, `:165-180`), reintenta, y si aun así no
cuadra pinta la tabla determinística de lo leído o el aviso honesto (`:409-427`).
El configurador —que habla de *ley fiscal*, con el comprador, en la sesión que
decide la venta— no tiene ni el primer paso.

**Consecuencia.** El contralor recibe una cifra o una cita fiscal inventada
dentro de la pantalla que se vende como «el configurador te dice el sustento», y
la va a cruzar contra su papel de trabajo. Es la regla número uno del repo
—*nunca inventar una cifra*— sin defensa alguna, en el peor sitio para no
tenerla.

**Causa raíz probable.** Las tres prohibiciones se cablearon en el prompt (que es
lo correcto como primera capa) y se dio por hecho que bastaban; la segunda capa
—verificar la salida, que este repo ya sabe construir— no se replicó.

---

### [MEDIO] `parecePregunta` mira el texto CON el documento adjunto pegado: cualquier `?` en el archivo desvía el turno al modelo y tira la respuesta del usuario

`src/lib/likida/perfil/entrevista-agente.ts:6-10` · `:41` ·
`src/app/api/dashboard/onboarding-chat/route.ts:43-49` ·
`src/lib/likida/intake/archivo.ts:127` y `:131`

**Escenario, con valores.** El route arma
`ultimo = "${mensaje}\n\nDocumento «${nombre}»:\n${extracto}"` (`route.ts:47-49`)
y lo pasa como `texto`. `responderEntrevista` evalúa
`parecePregunta(opts.texto)` sobre **esa concatenación**, y la primera condición
es `/[¿?]/.test(t)` (`:8`).

El input de adjuntos acepta `.xml` (`onboarding/chat.tsx:403`), y **todo XML
empieza por `<?xml version="1.0"?>`** — el lector lo devuelve dentro del extracto
en los dos caminos (`archivo.ts:127`, «XML (inicio): …», y `:131` para el XML
crudo). Entonces:

1. El dueño está en la pregunta 6, «CP fiscal». Adjunta su CFDI en XML y escribe
   «ahí viene todo».
2. `parecePregunta` → **true** por el `?` del prólogo.
3. El turno se va a `generateResponse` (`:44`), se paga la llamada, y el `return`
   de `:57-63` sale con **`guardado: false`** y los mismos chips.
4. `aplicarTurnoEntrevista` **nunca corre**. Nada del documento se lee, nada se
   declara, y la entrevista se queda en la misma pregunta.

El caso sin adjunto es igual de real y más frecuente: «menores a 300 millones,
¿verdad?» parsea perfecto con `parseIngresos` (`entrevista.ts:537`) y aun así se
descarta, porque la compuerta se evalúa **antes** de intentar interpretar la
respuesta.

**Consecuencia.** Adjuntar un XML en el onboarding nunca avanza la entrevista, y
cualquier respuesta rematada con un signo de interrogación se pierde. En la sala,
es el configurador contestando amablemente lo mismo tres veces mientras el
comprador cree que ya declaró su dato.

**Causa raíz probable.** El orden de la compuerta: «¿parece pregunta?» decide
antes que «¿parsea como respuesta?», y el predicado se aplica a un texto que ya
lleva pegado contenido que el usuario no escribió.

---

### [BAJO] El panel anuncia «Escribiendo en operadores, unidades y políticas» en turnos donde no se escribe nada

`src/lib/likida/perfil/entrevista-aplicar.ts:91-92` (`marcar('nutrir_operacion', …)`) ·
`:123-192` (`nutrirDesdeHechos` puede devolver `[]`) ·
`src/app/dashboard/onboarding/chat.tsx:31` (la etiqueta) · `:495-503` (el render)

**Escenario, con valores.** El dueño contesta la pregunta 1 con el chip
«Menores a $300 millones». `hechos = { ingresosMenoresA300M: true }`. El
`marcar('nutrir_operacion', …)` de `:91` emite `{fase:'inicio'}` y `{fase:'fin'}`
igual, `nutrirDesdeHechos` recorre sus cuatro `if` (`:138`, `:150`, `:173`,
`:182`), ninguno entra, y devuelve `[]`. La secuencia en pantalla le dice al
contralor **«Escribiendo en operadores, unidades y políticas»** en un turno donde
no se tocó ninguna de las tres tablas.

**Consecuencia.** Es la traza de pasos —el canal que en el otro chat sí refleja
ejecuciones reales de tool (`openrouter.ts:676-680`, `:925-930`)— afirmando una
escritura que no ocurrió, en el panel de un producto cuya regla es que un rótulo
sea verdad. Barato de notar y caro de explicar si lo nota el comprador.

**Causa raíz probable.** El paso se emite alrededor de la *llamada* a la
función, no de que la función haya hecho algo.

---

## Lo que revisé y está bien

- **La regla estructural aguanta y el delta no la tocó.** 31 `registerTool` en
  `src/` fuera de pruebas (`tools.ts` 4, `chat-tools.ts` 10, `analista.ts` 1,
  `copiloto-tools.ts` 14, `copiloto.ts` 2) — el mismo reparto que en la c4.
  `properties: {}` intacto en las cuatro de WhatsApp (`tools.ts:35, 97, 140,
  211`) y en `SIN_PARAMS` (`chat-tools.ts:26`). **El módulo `perfil/` no agrega
  ni una tool**, y eso es lo correcto: sus «pasos» son eventos de UI
  (`entrevista-aplicar.ts:24, 33-37`), no funciones que el modelo pueda invocar.
- **Y lo más importante del módulo nuevo: el modelo NO decide qué se escribe.**
  `interpretarTurno` (`entrevista.ts:852-902`) es parseo determinístico —
  `parseCampo`, `parseRfc`, `parseTopes`, `parseOperadores`— sobre el texto del
  usuario; el único `generateResponse` del módulo (`entrevista-agente.ts:44`) va
  por una rama que **no escribe nada** (`guardado: false` en sus dos salidas,
  `:62` y `:72`). Un auditor que reporte «el modelo puede inyectar el RFC» no
  leyó `entrevista-agente.ts:41`.
- **La guarda del RFC contra el emisor SÍ funciona en el camino que importa.**
  Construí el escenario del CFDI adjunto: `archivo.ts:122` rotula el primer RFC
  como `RFC emisor: …` dentro del extracto, y `entrevista.ts:877`
  (`if (!/rfc\s*emisor/i.test(texto))`) lo detecta y se abstiene. El comentario
  de `:872-874` («la razón social NO se toma de un blob») describe lo que el
  código hace.
- **Las reservas de presupuesto del runner no doble-cuentan y fallan cerradas.**
  `runner.ts:84-92` toma `pg_advisory_xact_lock` por agente/día (0180:31) y
  calcula `tope − SUM(agente_corrida.costo_usd) − SUM(reservas vivas)`
  (0180:33-41); `costo_real_usd` de la reserva no lo lee nadie, así que cerrarla
  con el costo real no vuelve a restar lo que `registrarCorrida` ya restó. El
  `cerrarReserva(id, 0)` del `catch` (`runner.ts:227`) es correcto y lo verifiqué:
  `loteRedactor` solo puede lanzar en la consulta de candidatos (`:114-121`),
  antes de gastar un token — los fallos por prospecto los absorbe el `catch` de
  `:132-138`. Y el redactor registra su costo en los tres caminos, incluido el
  de encolado fallido (`redactor.ts:189-193`, `:219-223`, `:227-231`).
- **Quitar los roles `router` y `chat_ligero` fue una poda honesta, no una
  amputación.** `models.ts:155-159` dice qué se retiró y por qué; `AgentName`
  quedó en `'liquidacion'` (`types.ts:3`), el `orchestrator` salió del registro
  (`registry.ts`) y de `prompts.ts`, y `npx tsc --noEmit` sobre `src/` no deja
  una referencia colgando. `FaseCosto` conserva `'router'` (`costos.ts:41`), que
  es correcto: hay filas históricas con esa fase.
- **La inversión del default de OCR está bien argumentada y no rompe el
  respaldo.** `models.ts:69` pasa a `google/gemini-3.1-flash-lite`, que sí tiene
  entrada en `FALLBACK` (`openrouter.ts:85` → `anthropic/claude-haiku-4.5`,
  visión con visión), y la prueba de cobertura (`openrouter_fallback_cobertura.test.ts:30`,
  `modelosAisladosDeFallback()`) sigue en verde — o sea que la clase entera del
  bug de `cc2d6b8` sigue cerrada.
- **El ciclo de tools sigue siendo el que la c4 dejó.** Loop-guard que corta
  ANTES del `Promise.all` (`openrouter.ts:882-885` contra `:891`), terminales que
  sí corren en la última ronda (`:883`) y cortan el ciclo al entregar (`:937`,
  `:947-949`), `finish_reason: 'length'` evaluado antes de mirar `tool_calls`
  (`:846-854`), costo acumulado por ronda al precio del modelo que respondió
  (`:827-829`) y `costoPorModelo` para que el fallback no le cargue todo al
  último modelo (`:733-737`). `costoReal` (`:241-252`) prefiere el costo del
  proveedor sobre la tabla.
- **La compuerta corre y es real.** `npx vitest run src/lib/llm/ src/lib/agents/
  src/lib/likida/perfil/` → **33 archivos, 241 pruebas, todas pasando**.

## Lo que NO alcancé a revisar

- **Si `parseRfc` puede cosechar el RFC equivocado desde un PDF (no XML) de una
  factura.** El camino del XML lo refuté arriba (el extracto rotula «RFC emisor»
  y la guarda de `entrevista.ts:877` muerde). Para un PDF, `archivo.ts:72`
  devuelve el texto crudo y una etiqueta tipo «R.F.C.: …» del emisor **no**
  activaría la guarda; `parseRfc` (`entrevista.ts:576-580`) toma el **primer**
  RFC del blob. No lo levanto como hallazgo porque no tengo un PDF real de
  estación para fijar el orden de aparición, y `parecePregunta` puede además
  desviar el turno. Queda como el escenario a construir con un ticket de campo.
- **Si `cache_control` sobrevive al fallback cross-provider.** `openrouter.ts:761`
  decide `soportaCache` con el modelo **primario**, así que un ciclo que arranca
  en `anthropic/claude-sonnet-5` y cae a `openai/gpt-5.6-terra` (`:91`) sigue
  mandando el system como array con `cache_control`. El comentario de `:759-760`
  afirma que un modelo que no la entienda la ignora; sin red no pude comprobar
  qué hace OpenRouter con eso en el proveedor destino.
- **Cuánto cuesta de verdad un turno del configurador.** Estimé entrada de
  10–11 K tokens leyendo el código (catálogo + historial + documento); no medí
  contra el proveedor. La conclusión del hallazgo —que **cero** de ese gasto se
  registra— no depende de la magnitud.
- **Las dos rutas de webhook de Cal.com** (`api/webhook/calcom` y
  `api/webhooks/calcom`, singular y plural). `admin/calcom.ts` no habla con
  ningún modelo, así que sale de este rubro; la verificación HMAC
  (`calcom.ts:31-37`) se ve correcta pero quién la llama es de seguridad.
- **`ficha_cliente` y su `.ilike` sin sanear** (`copiloto-tools.ts:341`): tercera
  pasada sin poder acotar un daño concreto, igual que en la c4. Sigue anotado
  como la asimetría contra `admin/bitacora.ts:51`.
- **Si `openai/gpt-5.6-terra` lee imágenes** (el respaldo del rol `piloto`).
  Cuarta pasada consecutiva sin red.
