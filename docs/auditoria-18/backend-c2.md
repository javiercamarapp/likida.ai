# Backend y API — auditoría 18 · continuación 21-ago

**Nota: 6/10** (antes 7). Razón del movimiento: **deuda que cobró factura**. Los
cuatro ALTOs de ayer siguen abiertos línea por línea, y los tres focos nuevos del
delta —el dueño que maneja, el piloto de visión, la cuenta de portal compartida—
metieron tres caminos más donde el producto hace algo mal y nadie se entera. El
patrón se repite textualmente: `al_vuelo.ts:95` escribió «dos opiniones sobre
quién factura un mismo ticket» como el bug que venía a cerrar, y el mismo commit
abrió una segunda opinión por otro parámetro. La lectura sigue siendo buena; lo
que no crece al ritmo de la superficie es la red.

El riesgo mayor del rubro hoy: **con `FACTURACION_PILOTO=si` —la palanca que
`docs/demo-facturacion-lunes.md:101` manda poner en Vercel para el demo— diez
comercios dejan de avisarle al encargado y a la vez son imposibles de facturar,
porque el piloto no emite por diseño. El ticket no se factura, nadie lo sabe, y
el plazo se vence solo.**

## Hallazgos

### [CRÍTICO] Encender el piloto de visión apaga el aviso al encargado de 10 comercios, y el piloto no puede facturar ninguno

`src/lib/likida/facturacion/avisar.ts:68` · `src/lib/likida/facturacion/adaptadores/registro.ts:194-198` ·
`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:31-38,193-203` ·
`src/lib/likida/facturacion/al_vuelo.ts:282-290`

Escenario, con valores, verificado ejecutando el código:

Con `FACTURACION_PILOTO=si`, `portalesOperables()` pasa de 1 a **21** claves.
`armarAviso` usa esa lista como `sabeOperarlo` (`avisar.ts:68`). Un ticket de
diésel Megasur de **$8,000** (IVA acreditable $1,103), con su WebID leído,
plazo `mes_natural` vigente, `requiereCuenta: false`:

```
operables con piloto: 21   incluye 'megasur': true
megasur requiereCuenta = false
aviso con piloto ON  → cuantos = 0
aviso con piloto OFF → cuantos = 1
```

Con el piloto apagado, `enrutar` devolvía `sin_robot` y el encargado recibía la
liga y los campos. Encendido devuelve `automatico` y el ticket **sale del
mensaje**. Los diez son: `enerser, gogas, libramientos_meta, oxxo, office_depot,
megasur, controlnet, ado, primera_plus, autozone`.

Y la máquina tampoco lo factura: la regla 1 del piloto es que **NUNCA emite**
(`piloto_vision.ts:31-38`), así que `volar` devuelve `ok:true` sin `cfdiUuid`
(`:193-203`). En `facturarAlVuelo` eso cae en `if (!r.cfdiUuid)`
(`al_vuelo.ts:282`) → `intentado:true, facturado:false`, **sin campo
`bloqueado`**. Sin `bloqueado`, `anotarBloqueo` no corre
(`cron/facturar/route.ts:457`), la flota no entra a `bloqueadosPorFlota` y
`avisarALasPersonas` —el ÚNICO llamador de `avisarPorFacturar` en todo el repo—
no la visita nunca. `gasto.cfdi_uuid` sigue NULL, `autofactura_bloqueada_en`
sigue NULL, así que el ticket vuelve a la cola en la siguiente corrida
(`route.ts:307-318`) y vuela otra vez.

Sale mal: cada hora, ~8-14 llamadas de `anthropic/claude-sonnet-5` a $2/$10
(`llm/models.ts:123`) por ticket, para siempre; al cierre del mes natural
`enrutar` lo declara `incompleto: ['el plazo para facturar ya venció']` y
`armarAviso` descarta los vencidos (`avisar.ts:75-78`) — el ticket desaparece sin
que nadie lo haya visto una sola vez.

Consecuencia: la flota pierde el IVA acreditable y la deducción de un gasto que
sí hizo, y el contralor lo descubre en su conciliación de fin de mes, no en el
panel. Encima paga la factura de modelo del intento inútil. Es exactamente el
modo de falla que `enrutar.ts:56-68` documenta como «medido el 20-ago-2026 con un
ticket de G500 Sureste… el silencio es el modo de falla que este repo persigue en
todos lados menos aquí», reintroducido por otra puerta.

Sin prueba: `cron/facturar/route.test.ts:126` mockea `portalesOperables: () =>
['capufe']`, o sea que la suite entera corre con el piloto apagado.
`avisar.test.ts` llama `armarAviso(t, HAY_ROBOT)` con un doble, nunca con
`portalesOperables()` real.

Causa raíz probable: `sabeOperarlo` se cableó a «qué sé hacer» y no a «qué de
verdad va a producir un CFDI», y el piloto es lo primero que cumple lo uno sin lo
otro.

---

### [CRÍTICO] El dueño que maneja no puede cerrar su liquidación durante 30 minutos después de dictar un viaje

`src/lib/likida/processor.ts:739-767` (el bloque nuevo) ·
`src/lib/likida/despacho_wa.ts:157,277-279` · `src/lib/likida/despacho_wa.ts:59`
(`VIGENCIA_PENDIENTE_MS = 30 * 60_000`)

Escenario, con valores: Javier es `flota_admin` y también `operador` de su propia
flota `t1`, con el mismo número `529993700779` — el caso que
`processor_dueno_maneja.test.ts:96` fija como el normal. Trae el viaje `v1`
abierto.

1. 10:00 — dicta «nuevo viaje para Juan Pérez, Puebla a Monterrey, anticipo
   8000». `atenderTextoOficina` → `atenderDespachoOficina` → arma el resumen y
   guarda el pendiente en `wa_conversacion.estado.viajePendiente`
   (`despacho_wa.ts:80-90`).
2. Se distrae y no contesta SÍ ni NO.
3. 10:07 — manda sus fotos (`type: 'image'`, no pasan por el bloque nuevo, bien)
   y escribe **«listo»** para cerrar su liquidación.
4. `processor.ts:765` llama `atenderTextoOficina` ANTES de todo lo del chofer.
   `atenderDespachoOficina` carga el pendiente (vigente, 7 min < 30),
   `esAfirmacion('listo')` es **false** (`intake/huerfanos.ts:118` — «listo» no
   está en la lista), `esNegacion` false, `interpretarPeticionViaje('listo')`
   null → cae en `despacho_wa.ts:277` y devuelve
   `'Tengo este viaje esperando tu confirmación:\n\n…'`.
5. `atenderTextoOficina` devuelve `true` → `processInbound` hace `return`.

Sale mal: el «listo» **nunca llega** a `esperarIntake`/`guardar_liquidacion`, que
viven cientos de líneas más abajo. Lo mismo para «ya llegué», «cuánto llevo», y
cualquier otro texto de ruta durante 30 minutos. Lo único que contesta es un
resumen de un viaje ajeno.

Consecuencia: el dueño —la persona que compra el producto y la que sale en el
guion del demo— manda sus 22 comprobantes y no puede cerrar. Su PDF no sale, el
anticipo no se cuadra, y el mensaje que recibe habla de otro viaje. En una sala,
esto es el demo cayéndose.

Sin prueba: `processor_dueno_maneja.test.ts:112` hace
`atenderDespachoOficina.mockReset().mockResolvedValue(null)` en el `beforeEach`,
así que las ocho pruebas del archivo corren con el módulo de despacho SIEMPRE
diciendo «esto no es mío». El caso «hay un pendiente vivo» no existe en la suite.

Causa raíz probable: el bloque nuevo gateó el ÚNICO reconocedor que se declaró
glotón (el analista, vía `incluirPreguntaLibre`), y despacho es igual de glotón
cuando tiene un pendiente abierto — su re-pregunta atrapa todo lo que no sea sí,
no o un viaje nuevo.

---

### [ALTO] `guardarPendiente` y `saveConversation` escriben la MISMA fila y se borran el estado mutuamente

`src/lib/likida/despacho_wa.ts:80-91` (upsert `onConflict: 'tenant_id,telefono'`,
`estado: { viajePendiente }`, `viaje_id: null`, `operador_id: null`) ·
`src/lib/likida/conv.ts:374-395` (`update` con `estado: { turns, …marcas }`) ·
`src/lib/likida/conv.ts:299-312` (`desdeFila`)

Escenario, con valores, mismo Javier de arriba (tenant `t1`, teléfono
`529993700779`, viaje `v1`). `wa_conversacion` tiene UNA fila por
`(tenant_id, telefono)` — el índice `wa_conversacion_tenant_tel_uidx` — y hasta
`d432e89` un número que resolvía como operador no llegaba nunca a despacho, así
que estos dos escritores no se cruzaban. Ahora sí:

- **Dirección A.** La fila trae `viaje_id='v1'`,
  `estado={turns:[…8 turnos…], intentosConfirmacion:2}`. Javier dicta un viaje →
  `guardarPendiente` **upsertea** la fila a `viaje_id=null`, `operador_id=null`,
  `estado={viajePendiente:{…}}`. Se pierden los ocho turnos y las marcas. Al
  siguiente mensaje, `desdeFila` evalúa `mismoViaje = fila.viaje_id === 'v1'` →
  **false** → descarta el historial y pone `intentosConfirmacion: 0`. El freno de
  `intento >= 2` que manda la duda con el encargado —cuyo arreglo está
  documentado en `processor.ts:2000-2019`— vuelve a ser inalcanzable.
- **Dirección B.** Con el pendiente vivo, Javier manda una foto: el camino del
  chofer termina en `saveConversation(convId, turns, viajeId, marcas)`, que
  reescribe `estado` entero como `{ turns, …marcas }` y **borra
  `viajePendiente`**. Su «SÍ» de las 10:20 ya no encuentra nada: `cargarPendiente`
  devuelve null, `interpretarPeticionViaje('sí')` devuelve null, y el viaje de
  Juan Pérez —origen, destino, anticipo $8,000, unidad ya resuelta— se pierde sin
  un solo mensaje que lo diga.

Consecuencia: el viaje que el jefe dictó no se crea y él cree que sí (nadie le
dijo lo contrario), o el historial del chofer se borra y el agente arranca sin
memoria de lo que ya se dijo. Los dos son el mismo tipo de pérdida silenciosa que
`conv.ts:255-262` describe al explicar por qué `loadConversation` NO usa upsert
— «el upsert PISARÍA el `estado` de la fila que ganó» — y que `despacho_wa.ts:83`
sí usa.

Sin prueba: ningún test cruza los dos escritores.
`processor_dueno_maneja.test.ts:47-48` mockea `loadConversation` y
`saveConversation` a vacío; `despacho_wa` está mockeado entero.

Causa raíz probable: dos subsistemas guardan estado propio en el mismo jsonb sin
llave de sección, y hasta este commit no había un actor que fuera de los dos.

---

### [ALTO] Dos opiniones sobre quién factura el mismo ticket, otra vez: `avisar.ts` no conoce la cuenta compartida

`src/lib/likida/facturacion/avisar.ts:70` y `:98` (llaman `repartir`/`enrutar` sin
el tercer argumento) · `src/lib/likida/facturacion/enrutar.ts:78,106,199` ·
`src/lib/likida/facturacion/al_vuelo.ts:230-241,410`

Escenario, con valores, verificado ejecutando el código. La flota comparte en el
cofre su cuenta de G500 (`conector_credencial.conector_id =
'portal_facturacion:g500'`, `activo=true`). Llega un ticket de diésel de $8,000
con sus tres campos leídos y 10 días de plazo. En la MISMA corrida del cron:

```
al_vuelo  (sabeOperarlo=true, cuentaCompartida=true): {"via":"automatico", …}
avisar    (sabeOperarlo=true, sin 3er arg)          : {"via":"mensaje","motivo":"requiere_cuenta", …}
armarAviso cuantos = 1
  → "Ese portal pide cuenta, por eso no se pudo hacer solo."
```

`al_vuelo` lee el cofre (`cuentasCompartidas`, `:230-234`) y despacha el ticket al
robot. `armarAviso` no lo lee —`cuentaCompartida` cae al default `false` de
`enrutar.ts:78` y `repartir.ts:199`— y le manda al encargado la liga con todos
los campos y una frase que ya no es cierta.

Sale mal en los diez comercios con `requiereCuenta: true` (`oxxo_gas, g500,
petromax, red_estatal_autopistas, la_gas, pinfra, gorm_brentec, iave, tag_pase,
televia`). En modo `emitir`, la persona y la máquina compiten por el mismo
ticket: dos intentos de emisión sobre el mismo consumo, y el segundo lo rechaza
el portal o —peor— lo timbra.

Consecuencia: el encargado hace a mano el trabajo que el robot está haciendo, con
un mensaje que le dice una razón falsa; y el riesgo de un segundo CFDI por el
mismo consumo, que es lo que `al_vuelo.ts:258-262` llama irreversible.

Sin prueba: `enrutar.test.ts:51,59` sí cubre `cuentaCompartida` en `enrutar`;
`avisar.test.ts` no tiene una sola prueba con cuenta compartida, y `armarAviso`
ni siquiera acepta el parámetro.

Causa raíz probable: `enrutar` ganó un tercer argumento con default seguro, y de
sus dos llamadores solo uno se enteró — el default silencia el error de
compilación que habría avisado.

---

### [ALTO] El veto contra emitir del piloto de visión es un booleano del modelo y un regex de cinco palabras en español

`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:90,250-260,282-288`

Escenario, con valores: `HUELE_A_EMITIR =
/emitir|generar|timbrar|facturar|crear\s*(mi\s*)?(cfdi|factura)/i`. Un portal
cuyo último botón dice **«Aceptar»**, **«Continuar»**, **«Enviar»**,
**«Confirmar»** o **«Submit»** no casa con ninguna de las cinco. Además
`inv.botones.find(b => (b.id && selector.includes(b.id)) || …)` devuelve
`undefined` cuando el botón no trae `id` ni `name`, y entonces
`HUELE_A_EMITIR.test(boton?.texto ?? '')` prueba contra la cadena vacía: el veto
por texto no existe para ese botón. Queda solo `a.esBotonQueEmite`, que lo decide
el modelo.

Si el modelo se equivoca una vez: el piloto aprieta el botón, el CFDI se timbra
ante el SAT, `volar` sigue devolviendo `ok:true` **sin `cfdiUuid`** (no sabe
leerlo), `facturarAlVuelo` lo registra como `'ensayo: se llenó el portal y no se
emitió'` (`al_vuelo.ts:284`), `gasto.cfdi_uuid` se queda NULL — y a la hora
siguiente el mismo ticket vuelve a la cola y el piloto vuelve a volar el mismo
formulario.

Y `selectorDelInventario` (`:282-288`) es un `includes` de subcadena sobre la
lista de ids/names: con un campo llamado `RFC` en la página —el de Megasur lo
tiene, `comercios.ts:390`— el selector `#btnRFCContinuar` pasa la guarda 4 sin
que ese botón exista.

Consecuencia: un CFDI irreversible emitido a nombre de la flota, no registrado en
nuestra base, y un segundo intento programado para dentro de una hora. Es
exactamente lo que el encabezado del archivo (`:31-38`) promete que no puede
pasar: «EL PILOTO NO EMITE. NUNCA, ni en modo `emitir`».

Sin prueba de comportamiento: `piloto_vision.test.ts` ejercita el veto con
botones cuyo texto SÍ contiene una de las cinco palabras; ninguna prueba pasa un
botón «Aceptar» sin id con `esBotonQueEmite:false`.

Causa raíz probable: la regla se enunció como invariante de código y se
implementó como heurística de idioma más el juicio del modelo que la regla existe
para no tener que creerle.

---

### [ALTO · REINCIDENTE] Si la invocación muere a media ráfaga, el cron sella como procesado el mensaje que nunca se procesó

`src/lib/likida/processor.ts:555` · `src/lib/likida/processor.ts:2693` ·
`src/app/api/cron/wa-pendientes/route.ts:79-84`

Sigue idéntico tras la reescritura de 314 líneas. `claimMessage` sigue siendo lo
PRIMERO de `processInbound` (`:555`), antes de cualquier efecto;
`releaseMessageClaim` sigue viviendo solo en ramas de fallo explícito
(`:797, :1035, :1741, :2201`) y en el `catch` (`:2693`) — **no hay `finally`**.
Una muerte dura de la invocación (22 fotos ÷ 5 obreros × 25 s ≈ 125 s contra
`maxDuration = 120`) deja el claim tomado; cinco minutos después
`cron/wa-pendientes` gana `reclamarPendiente`, `processInbound` sale por
`claim === 'duplicado'` (`:556-559`), y la línea 82 hace
`marcarPendienteProcesado`. Hasta cinco comprobantes por invocación muerta se
sellan como procesados y el cron responde `{procesados:5, fallidos:0}`.

La reescritura tocó el bloque de ráfaga y el de oficina; no tocó el ciclo de vida
del claim. Consecuencia sin cambios: el diésel de $8,000 que el chofer jura haber
mandado no está en la liquidación y el sistema reporta éxito.

---

### [ALTO · REINCIDENTE] El webhook de entrega de correo nunca escribe nada: `neq` descarta las filas con `entrega_estado` NULL

`src/app/api/correo/eventos/route.ts:85`

Verificado hoy, sin cambios: `.neq('entrega_estado', estado === 'entregado' ?
'rebotado' : '~nunca~')`. `NULL <> 'rebotado'` y `NULL <> '~nunca~'` son ambos
NULL en SQL, así que la fila recién enviada (que nace con `entrega_estado` NULL,
`0124_cadencia_atomica_y_entrega.sql:64-69`) nunca entra al `WHERE`. El UPDATE
afecta 0 filas y la ruta contesta `200 {"sinPieza": true}` (`:92-95`). El circuito
de entrega de la 0124 sigue siendo código muerto en producción, rebotes
incluidos.

---

### [ALTO · REINCIDENTE] El detector de fraude acusa a la flota de duplicar un CFDI cada vez que concilia un consolidado

`src/lib/likida/duplicados.ts:86` · `src/lib/likida/analytics.ts:349-366`

Sigue: `entreViajes(filas, (f) => f.cfdiUuid?.toLowerCase() ?? null)` agrupa solo
por UUID y `FilaGasto` sigue sin `cfdiOrden`. Nota nueva: `repo.ts:666,681` ya
trae `cfdi_orden` desde este delta, o sea que el dato existe a un `select` de
distancia y la consulta de `analytics.ts` sigue sin pedirlo. Un mes de casetas
conciliado (40 cruces en 12 viajes, un CFDI, `cfdi_orden 1..40`, legal desde la
mig. 0065) sigue produciendo `'CFDI a1b2c3d4… liquidado en 12 viajes'` con el
monto de la primera caseta de $87.

---

### [ALTO · REINCIDENTE] `/api/dashboard/ingesta` gasta visión sin techo y su costo no lo cuenta ningún medidor

`src/app/api/dashboard/ingesta/route.ts`

Verificado hoy: `grep -n "rateLimit\|registrarCosto"` sobre el archivo devuelve
**cero coincidencias**, y el directorio sigue conteniendo solo `route.ts`. El
gasto de visión de esta ruta no entra a `llm_costo`, así que no descuenta del
tope diario que lee `gastoChatHoyUsd(tenantId)` ni aparece en «Costo de IA».

---

### [MEDIO] `crearFlota` tira en silencio los datos fiscales capturados a medias

`src/lib/likida/administracion.ts:140-149,168-179` ·
`src/app/admin/flotas/page.tsx:35-38,70-77`

Escenario, con valores: Javier da de alta «Transportes del Sureste SA de CV» y
captura RFC `TSU010203AB1`, razón social, régimen `601` y CP fiscal `97000`, pero
deja «Uso del CFDI» en «Sin declarar». `fiscalCompleto` (`:140`) exige los cinco
→ **false** → `filaFiscal = null` → el insert escribe solo `nombre`, `rfc`,
`ciudad` y `regimen_fiscal`. **La razón social y el CP fiscal que acaba de teclear
no se guardan en ninguna columna** y nadie se lo dice: el mensaje de vuelta
(`admin/flotas/page.tsx:76`) enumera los cinco como si no hubiera capturado ninguno.

Consecuencia: quien da de alta la flota cree que ya capturó cuatro de cinco;
semanas después alguien entra a `/dashboard/suscripcion` y los encuentra vacíos y
los vuelve a teclear desde la Constancia. Es el mismo «se capturó a medias y
parece completo» que el comentario de `:136-139` dice haber cerrado, con el signo
invertido: ahora se captura a medias y **parece que no se capturó nada**.

Causa raíz probable: la validación es todo-o-nada por diseño, pero la escritura
también, y no hacía falta que lo fuera para tres columnas que no dependen entre
sí.

---

### [MEDIO · REINCIDENTE] La cola de facturación pide 600 s de presupuesto y corta el lote a los 150 s

`src/app/api/cron/facturar/cola/route.ts:12` (`maxDuration = 600`) y `:90` ·
`src/app/api/cron/facturar/route.ts:33` (`maxDuration = 300`), `:137`
(`PRESUPUESTO_LOTE_MS = maxDuration * 1000`), `:166` (`MARGEN_LOTE_MS =
150_000`), `:534`

Sin cambios: el callback de QStash llama `procesarLoteEnCola` con su propio
`inicio`, y adentro el corte sigue derivándose del `maxDuration` de la ruta del
cron (300 s), no del de la cola (600 s). Corta a los 150 s con 450 s sin usar.
El comentario de `cola/route.ts:9-12` sigue afirmando lo contrario.

---

### [BAJO] Un id que no es UUID en `/admin/mapa-prospectos/[id]` da 500, no 404

`src/lib/admin/prospectos-mapa.ts:484-498` · `src/lib/likida/pg.ts:33-36`

Escenario: `GET /admin/mapa-prospectos/basura`. `.eq('id', 'basura')` sobre una
columna `uuid` hace que PostgREST devuelva `22P02 invalid input syntax for type
uuid`; `exigir` **lanza** (`pg.ts:34`), la página revienta con 500 y el
`notFound()` de `mapa-prospectos/[id]/page.tsx:17` nunca corre. `getDetalleProspecto` documenta en su
propio comentario tres casos de `null` —no existe, duplicado, lectura falló— y
solo dos llegan.

Consecuencia: solo la ve el superadmin, pero es la misma confusión entre «uuid
inexistente» y «error de base» que `tenant-api.ts:63-72` ya separa a propósito, y
en Sentry se lee como caída de base.

---

### [BAJO · REINCIDENTE] `POST /api/lead` dedupe leyendo antes de escribir, sobre una tabla sin unique

`src/app/api/lead/route.ts:173-195`

Sin cambios: `select … limit(1)` y después `escribir(db, 'insert', …)`, sobre una
tabla que la `0139_prospecto_calidad.sql:46-48` declara explícitamente sin índice
único porque hay 1,227 grupos duplicados vivos. Dos POST a 150 ms siguen
produciendo dos filas.

## Estado de los hallazgos abiertos de la ronda 18

| # | Hallazgo | Estado | Dónde lo verifiqué |
|---|---|---|---|
| 1 | ALTO — claim muerto sellado por el cron | **sigue** | `processor.ts:555`, `:2693` (sin `finally`); `cron/wa-pendientes/route.ts:82` |
| 2 | ALTO — `neq` sobre `entrega_estado` NULL | **sigue** | `correo/eventos/route.ts:85` |
| 3 | ALTO — duplicados sin `cfdi_orden` | **sigue** | `duplicados.ts:86`, `analytics.ts:349-366` (aunque `repo.ts:666` ya lo trae) |
| 4 | ALTO — `/api/dashboard/ingesta` sin rate limit ni costo | **sigue** | el `grep` de `rateLimit`/`registrarCosto` sobre `ingesta/route.ts` no da nada |
| 5 | MEDIO — `PRESUPUESTO_LOTE_MS` del cron aplicado a la cola | **sigue** | `cron/facturar/route.ts:137,166`; `cola/route.ts:12,90` |
| 6 | BAJO — `/api/lead` dedupe read-then-write | **sigue** | `lead/route.ts:173-195` |

Cero cerrados. **El delta sí cerró tres bugs de otros rubros que tocan este
código y lo digo porque es lo que sostiene que la nota no baje más:**
`startup.ts:65-76` ya no le borra el lease del mutex a otro proceso (comprueba
`locked === true` antes de `unlock_viaje`), `oficina_wa.ts:117-121` dejó de leer
`sendDocument` como booleano (`{ok:false}` era truthy y acusaba entregado un
rechazo de Meta), y `al_vuelo.ts:95-113` metió `tieneAdaptador` DENTRO de
`enrutar` para que el cron y el aviso dejaran de opinar distinto — el arreglo
correcto, al que le faltó el segundo parámetro (hallazgo 4 de arriba).

## Lo que revisé y está bien

**Caminos de concurrencia del delta, con su prueba nombrada o su ausencia
declarada:**

- Registro de adaptadores por flota — `adaptadores/registro.ts:212-280,338-348`.
  El `tenantId` va EN LA CLAVE (`marca()`, `:374`, con separador `\u0000`),
  `exigirTenantRegistrado` **lanza** en vez de devolver `false` (`:294-301`), y
  `conPortales` retira el registro en un `finally`. Verifiqué en particular que
  `olvidarPortales` (`:319-329`) barre también los pilotables, que llevan la
  credencial descifrada dentro. Es la defensa correcta contra el CFDI con el RFC
  de la flota de al lado en una función caliente.
- Descifrado de credenciales — `facturacion/cuentas.ts:66-95,105-135`. Falla
  cerrado en las tres puertas (`cofreConfigurado()`, `error` de la consulta,
  `descifrar` que lanza), una fila corrupta no tumba a las demás, y **el secreto
  no viaja en ningún log ni en ningún error**: revisé los tres `logger` y los tres
  imprimen solo tenant y comercio. Cubierto por `cuentas.test.ts` (incluye el
  caso «la base contesta error → set vacío», `:73`).
- Regla 3 del piloto (la contraseña no llega al modelo) —
  `piloto_vision.ts:291-309`. `resolverValor` devuelve `registro:
  MARCA_CONTRASENA` para la contraseña y el marcador crudo para el usuario, así
  que `capturado` y el historial que se le reenvía al modelo llevan el marcador.
  Y el inventario (`pagina_playwright.ts:797-833`) extrae `id/name/placeholder/
  etiqueta/opciones` pero **nunca `value`**, o sea que la captura del DOM no puede
  filtrar lo que ya se escribió. Correcto y no obvio.
- Talacha ante un tenant nulo — `talacha_wa.ts:450-454`. El superadmin que además
  maneja (`cuentaPropia.tenantId === null`, el caso que `processor.ts:752` deja
  pasar a propósito) no consulta `incidencia` sin filtro de tenant: corta antes.
  Y `leerPalabraDecision` (`:343-348`) excluye explícitamente el «sí»/«no»
  pelones, así que la talacha **no** le roba la confirmación al chofer — es el
  único de los cuatro reconocedores de oficina que se protegió de esto.
- Choque de tenants en el bloque nuevo — `processor.ts:752-755`: dos filas del
  mismo número apuntando a flotas distintas se registran y se sigue como chofer,
  nunca se adivina. Cubierto por `processor_dueno_maneja.test.ts:161`. Y
  `resolverCuentaOficina` lanza `TelefonoAmbiguo` con `.limit(2)` para poder
  DETECTAR la ambigüedad en vez de recortarla (`contactos.ts:59,65-72`); el
  `.catch()` de `processor.ts:740` no la confunde con «no tiene cuenta».
- El mando de oficina es SOLO texto — `processor.ts:739`. Una foto, un XML, un
  pin o un botón (`type: 'interactive'`) no pasan por ahí, así que la
  confirmación con botón del acuse de ticket **no** entra en la disputa del
  hallazgo 2. Cubierto por `processor_dueno_maneja.test.ts:154`.
- `sitio_verificado`/`similitud_icp_pct`/`necesidad_pct` se **leen**, nunca se
  recalculan en TS (`prospectos-mapa.ts:424-427,455-460`), y `getDetalleProspecto`
  usa `exigir` en vez de tragarse el error. La ficha va detrás de
  `requireSuperadmin()` (`mapa-prospectos/[id]/page.tsx:14`) — comprobado, no
  inferido: las rutas de `/admin/api` no heredan el layout.
- `guardarDatosFiscales`/`validarDatosFiscales` — `saas/fiscal.ts:98-158`. La
  extracción del validador no cambió una sola regla, y `administracion.ts:145`
  llama al MISMO, así que el alta y la pantalla fiscal no pueden discrepar sobre
  qué es un CP bueno. El `<select>` de régimen de `admin/flotas/page.tsx:427-434`
  ahora se deriva de `REGIMENES`, que es lo que el validador acepta: la lista que
  ofrecía 605/606/607/608 y el validador rechazaba ya no existe.
- `auth/callback/route.ts:11-73` (el pendiente explícito de la ronda 18). El
  `next` se valida contra `startsWith('/dashboard')` ANTES de usarse (`:10`), y
  ese mismo valor es el único que llega a `emailRedirectTo`
  (`reenvio_enlace.ts:103`): no hay redirect abierto. El reenvío no da de alta a
  nadie (`shouldCreateUser: false`), no distingue «correo sin cuenta» de «cuota
  agotada» hacia el usuario, y no imprime el correo en el log
  (`reenvio_enlace.ts:111`). Los dos frenos existen y el de la cookie se pone
  ANTES de conocer el resultado (`:96`), que es el orden correcto. Confirmé
  contra `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/
  cookies.md` que `cookies().set` en un Route Handler sí sale en la respuesta,
  incluida una construida a mano con `NextResponse.redirect`.
- `identificar.ts:33-49,72-101`. El desempate por dominio/token más LARGO es
  correcto y está bien acotado: dos marcas de verdad («no anidadas») siguen
  devolviendo `null` en vez de adivinar (`:99`). Cubierto por
  `identificar.test.ts`.
- Errores por valor en el delta: revisé los cinco archivos nuevos que consultan
  la base (`cuentas.ts`, `prospectos-mapa.ts`, `portales_facturacion.ts`,
  `reenvio_enlace.ts`, `motivo_login.ts`) buscando `data` sin su `error`. **No
  encontré ninguno.**

## Lo que NO alcancé a revisar

- `src/lib/likida/facturacion/adaptadores/pagina_playwright.ts` completo (~840
  líneas): solo leí `inventario()` y su contrato. No revisé los topes de tiempo
  (`this.topes`), ni el manejo de pestañas/descargas, que es donde vive el riesgo
  real de una sesión de portal que se queda colgada dentro del presupuesto del
  cron.
- `src/lib/likida/conectores/portales_facturacion.ts` (121 líneas nuevas de
  credenciales): leí las dos funciones que `cuentas.ts` consume
  (`comercioDeConector`, `conectorDePortal`) y no el resto — en particular no
  verifiqué la forma de los campos de captura ni si alguno se marca como no
  secreto por error.
- `facturarLoteAlVuelo` completo (`al_vuelo.ts:330-520`): leí la decisión por
  gasto y `escribirUuid`, pero no la re-lectura anti-doble-emisión ni el reparto
  de un mismo UUID sobre N gastos con `cfdi_orden` — que es justamente lo que el
  hallazgo de `duplicados` necesita del otro lado.
- El bloque de despacho de oficina, talacha e hitos de `processor.ts` fuera de lo
  que toca el delta (~1,400 líneas): leí el camino de la foto entero y el bloque
  nuevo, no el del XML ni el del cierre.
- `asignar_wa.ts`: no comprobé si su pendiente sufre el mismo doble efecto que el
  de despacho (hallazgos 2 y 3). Comparte teléfono como llave, así que la
  sospecha es fuerte y no la verifiqué.
- **No corrí la suite completa** (hay once agentes más en la máquina). Verifiqué
  los dos hallazgos de facturación **ejecutando el código real** con `tsx` contra
  `enrutar`, `armarAviso`, `COMERCIOS` y `portalesOperables` —las dos salidas
  están transcritas en los hallazgos 1 y 4— y el resto por lectura, con la prueba
  que cubre o no cubre cada camino nombrada en su hallazgo.
