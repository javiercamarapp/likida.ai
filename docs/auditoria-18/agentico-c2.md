# Sistema agéntico y orquestación — auditoría 18 · continuación 21-ago

**Nota: 4/10** (antes 5). Razón del movimiento: **deuda que cobró factura.** Sí
hubo *se atacó y subió* —dos de mis seis hallazgos de ayer están cerrados con
commit y los verifiqué línea por línea (`4f25078` y `e1b9474`)—, pero la nota
anterior diagnosticó por escrito el defecto de proceso: *«la mitad NUEVA del
ciclo se cableó sin las mismas reglas»*. En el delta de hoy volvió a ocurrir
**dos veces en el mismo día**: `processor.ts` metió al camino del chofer cinco
reconocedores de oficina que comparten con él la MISMA fila de
`wa_conversacion` y el MISMO turno, sin que ninguno de los dos lados sepa del
otro; y `piloto_vision.ts` cableó un ciclo agéntico entero —14 pasos, llamadas
de visión, credenciales— sin presupuesto de tiempo, sin contabilidad de costo y
sin un cierre definido hacia el humano cuando no puede terminar. Cuatro de los
seis hallazgos de ayer siguen abiertos. La regla del rubro es explícita: una
advertencia que vuelve a ocurrir no es advertencia, es hallazgo, y baja la nota.

**El riesgo mayor hoy:** el número que es chofer Y oficina tiene un solo turno y
un solo renglón de estado para dos conversaciones distintas, así que una de las
dos se come a la otra — y la que pierde con más facilidad es la que cierra la
liquidación.

---

## Hallazgos

### [CRÍTICO] Un despacho pendiente le tapa la boca al chofer: el dueño que maneja no puede cerrar su propia liquidación durante 30 minutos
`src/lib/likida/processor.ts:765` · `src/lib/likida/despacho_wa.ts:157-276` · `src/lib/likida/asignar_wa.ts:241-298`

`atenderTextoOficina` corre para **todo** texto del chofer (`msg.type === 'text'`)
antes que cualquier cosa del camino de ruta. Lo único que el desempate de
`viajeId` apaga es el analista (`incluirPreguntaLibre: !viajeId`, :765).
Despacho y asignación corren SIEMPRE. Y `atenderDespachoOficina`, con un
pendiente vivo, se queda con **cualquier** texto que no sea sí/no ni una
petición nueva:

```ts
// despacho_wa.ts:275-276
if (!interpretarPeticionViaje(texto)) {
  return `Tengo este viaje esperando tu confirmación:\n\n${resumenDePendiente(pendiente)}`;
}
```

Devolver un string ≠ `null` hace que `atenderTextoOficina` devuelva `true` y que
`processInbound` haga `return` en :766.

**Escenario, con valores.** Javier es `flota_admin` **y** operador del viaje
V-1042 (el caso que `d432e89` vino a habilitar). 14:00 escribe *«nuevo viaje
para Pedro López, Puebla a Monterrey, anticipo 8000»* → `guardarPendiente`
(vigencia `VIGENCIA_PENDIENTE_MS = 30 * 60_000`, despacho_wa.ts:59) y le llega
el resumen «¿confirmas? SÍ/NO». Se sube a la unidad y se olvida. 14:12 termina
su ruta y escribe **«listo»**. `esAfirmacion('listo')` es `false` **a propósito**
(`intake/huerfanos.ts:106-118`: *«`listo` NO cuenta como sí… quiere decir cierra
mi viaje»*), `esNegacion` es `false`, e `interpretarPeticionViaje('listo')`
devuelve `null` (no hay DISPARADOR, `crear_viaje_wa.ts:541`). Recibe: **«Tengo
este viaje esperando tu confirmación: Pedro López · Puebla → Monterrey ·
anticipo $8,000.00»**. Vuelve a escribir «ya terminé», «cierra», «eso es todo»:
lo mismo, las tres veces. Durante 30 minutos su liquidación no se cuadra, no se
emite el PDF, y el viaje queda `abierto`.

**Consecuencia:** es exactamente el guion del demo que este commit habilita
—despachar por WhatsApp y cerrar por WhatsApp desde el mismo número— y se rompe
en la sala, contestando sobre el viaje equivocado. En producción, el chofer que
además es dueño queda sin poder liquidar hasta que expire un pendiente que él ya
olvidó, o hasta que acierte a escribir «no».

**Causa raíz probable:** los cinco reconocedores de oficina se izaron delante del
camino del chofer con un solo desempate (el analista), cuando el que de verdad
disputa el turno es el pendiente de confirmación de despacho/asignación, que
reclama todo el texto que no entiende.

---

### [ALTO] Chofer y oficina comparten UNA fila de `wa_conversacion` y se borran el estado mutuamente: un viaje confirmado con «sí» no se crea, y nadie se entera
`src/lib/likida/despacho_wa.ts:80-99` · `src/lib/likida/asignar_wa.ts:150-176` · `src/lib/likida/conv.ts:374-395`

Las tres escrituras pisan el jsonb **entero** de la misma llave
`(tenant_id, telefono)`:

```ts
// despacho_wa.ts:83-90 — upsert, no merge
.upsert({ tenant_id, operador_id: null, telefono, viaje_id: null,
          estado: p ? { viajePendiente: p } : {}, updated_at }, { onConflict: 'tenant_id,telefono' })
// conv.ts:382-392
.update({ estado: { turns: …, …marcas }, viaje_id: viajeId, updated_at })
```

`asignar_wa.ts:24-25` declara la premisa que ya es falsa: *«El estado vive en la
MISMA fila **de oficina** de `wa_conversacion`»*. Desde `d432e89` no hay «fila de
oficina»: para el dueño que maneja es la misma fila del chofer.

**Escenario A (oficina borra al chofer), con valores.** Javier trae V-1042 con
`estado = { turns: [12 turnos], cierreSinComprobantes: true }` y
`viaje_id = 'V-1042'`. Escribe *«asígnale la unidad 12 al viaje de Pedro»* →
`asignar_wa.ts:150` upsertea `estado = { asignacionPendiente }`, `viaje_id = null`.
El siguiente `loadConversation(t, tel, 'V-1042')` ve `fila.viaje_id === null`,
`mismoViaje = false` (`conv.ts:299`) y devuelve `turns: []`,
`intentosConfirmacion: 0`, `cierreSinComprobantes: false`. El agente arranca sin
memoria, la escalación al encargado por intentos fallidos vuelve a cero, y la
confirmación de cierre en ceros que él ya dio hay que volvérsela a pedir.

**Escenario B (el chofer borra a la oficina) — el caro.** 14:00 Javier dicta el
viaje de Pedro → `estado = { viajePendiente }`. 14:03 manda una foto de ticket
que sale movida; el acuse pide refoto y `recordarPeticionDeFoto`
(`processor.ts:373-387`) hace `saveConversation` → `estado = { turns: [...] }` y
**`viajePendiente` desaparece**. 14:05 Javier contesta **«sí»** a la pregunta que
sigue en su pantalla. `cargarPendiente` devuelve `null`,
`interpretarPeticionViaje('sí')` devuelve `null`, despacho devuelve `null`, y el
mensaje cae al camino del chofer, que le contesta sobre SU viaje. **El viaje de
Pedro nunca se creó**, Pedro nunca recibe aviso, y a Javier el sistema le
contestó algo — no un error.

**Consecuencia:** un despacho confirmado que no existe. El chofer al que se le
asignó no sale, el dueño cree que sí, y la única traza es la ausencia de una
fila. Es el modo de falla exacto que `despacho_wa.ts:166-182` (el claim antes de
`crearViaje`) se escribió para cerrar, reabierto por la puerta de al lado.

**Causa raíz probable:** dos módulos escritos asumiendo que su fila de
`wa_conversacion` era exclusiva —uno reescribe el jsonb entero con `turns`, el
otro con `viajePendiente`— y un tercero (`d432e89`) que los puso a compartir la
misma llave sin tocar ninguno de los dos.

---

### [ALTO] La foto que se traba mientras otra sigue en vuelo en otra invocación ya no dice nada: el mensaje individual se movió a una libreta que el cierre no ve
`src/lib/likida/processor.ts:1678-1690` · `src/lib/likida/intake/rafaga.ts:17-27, 99`

`d432e89` quitó los tres `if (llegoSola) await say(...)` inline del camino de la
foto y los convirtió en `mensajeSolo`, un texto anotado en la libreta de módulo
(`const bandejas = new Map<...>`, rafaga.ts:99) que **solo** se pronuncia si la
invocación que cierra la ráfaga encuentra exactamente una incidencia en **su
propio** Map:

```ts
const unicaEntera = rafaga && rafaga.incidencias.length === 1 ? rafaga.incidencias[0].mensajeSolo : undefined;
if (ultima && rafaga && !huboRafaga) { if (unicaEntera) await say(unicaEntera); }
```

`rafaga.ts:24-27` autoriza el caso de la ráfaga repartida entre dos invocaciones
y promete su peor caso: *«cada invocación resume LO SUYO. Son dos mensajes en
vez de uno, nunca 22, y **nunca un silencio**»*. Esa promesa ya no se cumple.

**Escenario, con valores.** Dos POST de Meta seguidos, dos invocaciones (A y B).
14:03:00 foto A → `intakeDelta(+1)` = 1 → `anotarFoto(v, true)` en el Map del
proceso A. 14:03:01 foto B (proceso B) → `intakeDelta(+1)` = 2 → su propio Map.
14:03:20 el OCR de A truena con un 429: `anotarIncidencia(v, { tipo:
'fallo_tecnico', mensajeSolo: 'Se me trabó a mí al leer ese comprobante ⚙️…' })`
en el Map de A. `finally` de A: `intakeDelta(-1)` = **1** → `ultima = false` →
`rafaga = null` → **no se dice nada** y la bandeja de A queda abierta hasta que
la desaloje `MAX_VIAJES`. B termina bien: `intakeDelta(-1)` = 0 → `ultima =
true` → `cerrarRafaga` en el Map de **B**, que tiene `vistas: 1, incidencias: []`
→ `huboRafaga` es `true` (`incrementado = 2 > 1`) → sale el resumen **«📸 Ya
revisé tus fotos. En este viaje llevo *1 comprobante* por $850.00»**.

El chofer mandó dos fotos, una se perdió, y el sistema le confirma un
comprobante sin mencionar la otra. Antes de este commit A habría dicho su
mensaje inline (`llegoSola = incrementado === 1` era `true` para A).

**Consecuencia:** un comprobante que no entró y un chofer que no lo sabe — el
silencio que `rafaga.ts` existe para quitar, reintroducido por el mecanismo que
lo quitaba. Ninguna prueba lo cubre: `rafaga_consolidada.test.ts` corre las 22
fotos dentro de un solo proceso, que es justo el caso que sí funciona.

**Causa raíz probable:** el mensaje individual dejó de ser responsabilidad del
camino que lo conoce (que puede hablar siempre) y pasó a depender de un estado
en memoria de proceso que el cierre puede estar mirando desde otro proceso.

---

### [ALTO] El piloto de visión llama al modelo sin `AbortSignal` y sin presupuesto: 14 pasos dentro de una invocación dimensionada para 147 s
`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:138-152, 364-373` · `src/app/api/cron/facturar/route.ts:33, 166`

`decidir()` llama `generateStructured` **sin `signal`** (:364-373). El campo
existe y su propio jsdoc dice para qué (`openrouter.ts:362-370`: *«sin esto se
cae al default del SDK de OpenAI —10 minutos—»*), y el cliente se construye sin
`timeout` (`openrouter.ts:23-35`), así que el default del SDK manda. El camino
de OCR sí lo pasa (`processor.ts:858`, `reloj.senal(25_000)`); éste no.
Tampoco hay tope de tiempo del vuelo: el único tope es `PASOS_MAXIMOS = 14`
(:58), un contador de pasos.

**Escenario, con valores.** `FACTURACION_PILOTO=si`, una flota con 3 tickets de
G500 en la cola. `MARGEN_LOTE_MS = 150_000` está calculado —y así lo documenta
route.ts:143-164— contra *«el peor caso medido de UNA sola sesión de portal
~147 s»*, que es un adaptador **escrito**, sin una sola llamada a un modelo. La
sesión del piloto son 14 × (`inventario()` + `captura()` + una llamada de visión
con JPEG a Sonnet 5 + la acción). A 8 s por llamada eso ya son ~150 s **por
ticket**, y `correrLote` los corre en serie: ~450 s para los tres. Con una sola
llamada lenta, el techo es el del SDK (600 s × hasta 3 intentos). La invocación
arranca a t=10 s, pasa el chequeo de reloj (10 s < 150 s), abre navegador y
Vercel la mata a los 300 s **a media sesión de portal**.

**Consecuencia:** al morir la invocación no corre el `finally` de
`procesarLoteEnCola` (route.ts:696-774): no se registra la corrida
(`registrarCorrida`), no sale `avisarCorridasPorFlota`, no sale el aviso de cola
atorada, no hay `alertarOperador` ni `logger.error`. La corrida desaparece sin
dejar rastro y el cron se ve verde. Es la pregunta del rubro contestada de la
peor forma: el proceso muere a media sesión, el humano no ve nada y en la base
solo queda un `autofactura_intentada_en` movido.

**Causa raíz probable:** el ciclo nuevo se midió por pasos y no por reloj, y se
insertó dentro de un presupuesto de tiempo cuyo número se derivó de un camino
que no llamaba a ningún modelo.

---

### [ALTO] El ticket que el piloto toma no lo emite nunca, no se bloquea nunca y ya no llega a una persona: se recicla cada hora hasta que vence el plazo
`src/lib/likida/facturacion/adaptadores/registro.ts:194-198, 236-269` · `src/lib/likida/facturacion/enrutar.ts:131-138` · `src/lib/likida/facturacion/al_vuelo.ts:263-289, 600-608`

Tres piezas que por separado están bien y juntas cierran el círculo sobre sí
mismo:

1. Con la palanca puesta, `portalesOperables()` incluye los pilotables (:194-198).
2. `enrutar` ve `sabeOperarlo = true` y devuelve `{ via: 'automatico' }` en vez
   de `sin_robot` (:131-138), así que ese ticket **deja de entrar** al mensaje
   del encargado (`avisar.ts` solo manda lo que `enrutar` marcó para persona).
3. El piloto **no emite nunca, ni en modo `emitir`** (regla 1,
   `piloto_vision.ts:31-38, 119-122`). Devuelve `ok: true` sin `cfdiUuid`, y
   `motivoDeBloqueo` (`al_vuelo.ts:600-608`) solo bloquea por CAPTCHA o
   `emisionSinConfirmar`: ninguna de las dos aplica. El gasto **no** recibe
   `autofactura_bloqueada_en`.

**Escenario, con valores.** Un ticket de diésel de $2,400 de un portal pilotable,
`FACTURACION_MODO=emitir` y `FACTURACION_PILOTO=si`. Cada hora el cron lo toma,
abre Chromium, paga entre 8 y 14 llamadas de Sonnet 5 con captura, llena el
formulario, se detiene en `detenido_antes_de_emitir` (:178-181) y devuelve
`ok: true`. `al_vuelo.ts:282-289` lo registra como *«ensayo: se llenó el portal y
no se emitió»*, `facturado: false`, y solo mueve `autofactura_intentada_en`. Al
encargado no le llega nada, porque para `enrutar` ese ticket es `automatico`.
Esto se repite 24 veces al día durante los 7-15 días del plazo de la gasolinera;
al día 16 `enrutar` lo marca `incompleto` con *«el plazo para facturar ya
venció»* (`enrutar.ts:99`). El IVA de $331.03 no se acredita y la flota no
deduce los $2,400.

**Consecuencia:** el hueco que `sin_robot` acababa de cerrar («ni se facturaban
ni nadie se enteraba», enrutar.ts:53-66) se reabre por debajo: ahora sí se
intenta, y por eso nadie avisa — pero el intento no puede terminar por diseño.
Un ciclo agéntico que estructuralmente no puede cumplir su tarea y no tiene
cierre hacia el humano.

**Causa raíz probable:** «operable» se definió como «hay quien lo intente» y no
como «hay quien lo termine», y el único estado que saca un ticket de la cola
automática (`bloquear`) no contempla el resultado que este adaptador siempre
produce.

---

### [ALTO] La contraseña compartida se escribe donde diga el modelo, sin mirar el tipo del campo — y la captura del paso siguiente se la manda al modelo en claro
`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:266-277, 151-152, 370` · `:44-47`

La regla 3 del encabezado es absoluta: *«LA CONTRASEÑA NO VIAJA AL MODELO… Al
modelo, al log y a `capturado` solo les llega el marcador»*. Se cumple en el
canal de texto y **no** en el de imagen. `ejecutar` sustituye el marcador por el
secreto sin comprobar nada del campo destino —la única guarda es
`selectorDelInventario`, que solo exige que el id/name exista (:282-288)— y el
inventario **sí** trae `type` por campo (`playwright_base.ts:98-109`); nadie lo
mira:

```ts
const { real, registro } = resolverValor(a.valor, op.credencial);
…
await pagina.escribir(a.selector, real);   // :275
capturado[a.selector] = registro;          // el marcador, correcto
```

**Escenario, con valores.** Portal con `<input type="text" name="usuario">` y
`<input type="text" id="claveAcceso">` (clave numérica; ambos `type="text"`, que
es común en portales de autofacturación mexicanos). Paso 3: el modelo devuelve
`{ tipo: 'escribir', selector: '#claveAcceso', valor: '«CONTRASEÑA»' }` — o se
equivoca y elige `[name="usuario"]`. En los dos casos el código escribe
`Fl0ta2026!` en un campo que el navegador pinta en claro. Paso 4: `capturaSegura`
(:151) toma el JPEG **con la contraseña legible** y lo manda como `images`
(:370) al modelo externo vía OpenRouter, y el mismo data-uri viaja después en
`ResultadoAgente.captura` → la respuesta JSON de `/api/cron/facturar?captura=1`
(route.ts:243-254) y, en la Mac, a un `.jpg` en `LIKIDA_CAPTURAS_DIR`.

**Consecuencia:** la credencial que una flota entregó al cofre sale del cofre
hacia un tercero y hacia un artefacto de diagnóstico. La prueba que dice cubrir
esta regla (`piloto_vision.test.ts:138-151`) verifica el historial de texto y
`capturado`, y pasaría igual con este camino abierto: el campo del caso feliz se
llama `#pass` y nadie comprueba su `type`.

**Causa raíz probable:** la regla se implementó como «qué texto sale hacia el
modelo» y el piloto tiene dos canales hacia el modelo; el segundo es una foto de
la pantalla que el propio código acaba de escribir.

---

### [ALTO · REINCIDENTE] Un mensaje que muere o se abandona a media ejecución queda sellado como procesado: el inbox durable no reintenta nada
`src/lib/likida/processor.ts:553-559` · `src/app/api/webhook/whatsapp/route.ts:249-259`

Sin cambios respecto de ayer, verificado en el árbol de hoy. `claimMessage`
sigue reclamando en la PRIMERA línea de `processInbound` (:555) y saliendo con
`return` ante `'duplicado'` (:556-559); `route.ts:255` sigue sellando
`procesado_en` cuando `processInbound` **no lanza**, que es lo que hacen todos
los caminos de abandono. El reintento del cron entra, choca contra su propio
claim y sella la fila. Convergencia de tres auditores en la ronda 18, todavía
abierto. Escenario completo en `docs/auditoria-18/agentico.md`, hallazgo 2.

---

### [ALTO · REINCIDENTE] El cierre de liquidación —cifras y PDF— sale por WhatsApp al *encargado*, el rol que no ve dinero
`src/lib/likida/contactos.ts:94` · `src/lib/likida/avisar_cierre.ts:95` · `src/lib/auth/visibilidad.ts:41`

Literalmente sin tocar: `const ORDEN_AVISO: RolOficina[] = ['encargado',
'flota_admin'];` sigue en `contactos.ts:94`, `avisarCierreAlJefe` sigue
resolviendo con `telefonoJefeDe` en `avisar_cierre.ts:95`, y `visibilidad.ts:41`
sigue diciendo `encargado: ['operacion']`. Escenario completo en el reporte de
ayer, hallazgo 3. Agrego un dato del delta que lo empeora: `cron/facturar/route.ts:207`
usa el mismo `telefonoJefeDe` para el aviso de facturación, y ahora ese aviso
lleva **el texto completo** (`avisar.ts:157`, commit `686b8f4`) con folios y
montos por ticket, no ya el conteo de la plantilla.

---

### [MEDIO · REINCIDENTE] El jefe recibe el ejemplar del OPERADOR, no el del contralor
`src/lib/likida/processor.ts:2562, 2627`

`const path = \`${op.tenantId}/${viajeId}-operador.pdf\`` (:2562) y esa misma
`data.signedUrl` se le pasa a `avisarCierreAlJefe` (:2627). El ejemplar completo
sigue existiendo en `${tenantId}/${viajeId}.pdf` y sigue sin mandarse. Escenario
completo en el reporte de ayer, hallazgo 5.

---

### [MEDIO · REINCIDENTE] Si el PDF del operador no se generó, el jefe no se entera del cierre en absoluto
`src/lib/likida/processor.ts:2559-2560, 2627`

`avisarCierreAlJefe` sigue anidado dentro del `try` que abre con
`if (!pdfGenerado) throw new Error('la tool reportó pdf_generado=false')`
(:2559-2560). El aviso de TEXTO al jefe no necesita el PDF y muere con él.
Escenario completo en el reporte de ayer, hallazgo 6.

---

### [MEDIO] El aviso le pide al encargado que facture a mano un portal que el piloto va a intentar solo
`src/lib/likida/facturacion/avisar.ts:66-70, 98` · `src/lib/likida/facturacion/enrutar.ts:177-207`

`enrutar` y `repartir` aprendieron un tercer argumento, `cuentaCompartida`, y
`armarAviso` **no lo pasa por ninguno de los dos caminos**: `repartir(tickets,
sabeOperarlo)` (:70) y `enrutar(t, sabeOperarlo(...))` (:98) dejan el default
`() => false` / `false`.

**Escenario:** flota que ya compartió en el cofre su cuenta de un portal
pilotable, con la palanca del piloto puesta. `registrarPortales`
(`registro.ts:245-253`) SÍ registra el piloto para ese comercio porque la
credencial existe. Pero `enrutar(t, true, false)` corta antes, en :106, y
devuelve `{ via: 'mensaje', motivo: 'requiere_cuenta' }`, así que al encargado le
llega **«Ese portal pide cuenta, por eso no se pudo hacer solo»**
(`enrutar.ts:176-179`) por un ticket que la máquina está intentando cada hora.

**Consecuencia:** trabajo humano duplicado sobre un ticket que el robot ya tomó,
y un mensaje que afirma como causa («pide cuenta») algo que dejó de ser cierto en
cuanto la flota entregó la cuenta. Contradice el propósito que el propio jsdoc
de `armarAviso` acaba de escribir (:57-65): *«NO hay que avisarle de uno que el
piloto va a intentar»*.

**Causa raíz probable:** el parámetro se agregó a la firma de `enrutar`/`repartir`
en `169c3f6` y el único llamador de producción no se actualizó; como tiene
default, no rompe la compilación.

---

### [MEDIO] El texto libre del dueño-chofer viaja a un modelo externo antes del gate del aviso de privacidad
`src/lib/likida/processor.ts:739-768` (bloque) vs `:780` (`ponerAvisoADisposicion`)

El bloque de oficina está colocado **antes** del gate a propósito y lo explica
(:733-738): *«pedir el informe de la flota no trata datos personales del
operador»*. Esa razón cubre `atenderInformeOficina` —consulta estructurada,
plantilla, sin modelo— y **no** cubre `atenderPreguntaLibre`, que es el analista:
sin viaje abierto (`incluirPreguntaLibre: !viajeId`, :765) el texto crudo del
operador se manda al LLM.

**Escenario:** un chofer nuevo dado de alta también como `flota_admin` (el caso
del commit), con `aviso_privacidad_en = NULL` y sin viaje asignado todavía,
escribe *«oye, ¿cuánto llevo de diésel? soy Juan Pérez, el de la unidad 12»*.
Eso sale hacia OpenRouter antes de que `ponerAvisoADisposicion` haya corrido una
sola vez para él. El gate que `AUDITORÍA 3, LEG-C1` izó hasta aquí
(:770-779) tiene ahora un camino que lo rodea.

**Consecuencia:** una transferencia a un tercero antes de poner el aviso a
disposición, en el mismo archivo cuyo comentario declara que TODO camino que
trate datos queda detrás del aviso. Lo pongo en MEDIO y no más arriba porque el
titular es aquí también el administrador de la responsable, que es el argumento
que el comentario usa; el hueco es que el código no distingue ese caso de un
operador cualquiera con cuenta de contador o encargado.

---

### [MEDIO] El piloto no registra el costo de ninguna de sus llamadas: 8-14 llamadas de Sonnet 5 por ticket que no aparecen en «Costo de IA»
`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:364`

```ts
const { data } = await generateStructured<AccionPiloto>({ role: 'piloto', … });
```

`generateStructured` devuelve `{ data, raw, model, tokensIn, tokensOut, cost }`
(`openrouter.ts:375`) y aquí se descarta todo menos `data`. No hay una sola
llamada a `registrarCosto` en todo `src/lib/likida/facturacion/` (verificado con
grep). El camino de OCR sí la hace, dos líneas después de su llamada
(`processor.ts:859`).

**Escenario, con valores.** `models.ts:118` fija `piloto:
'anthropic/claude-sonnet-5'` a $2/$10 por millón, y su propio comentario dice
*«se paga por PASO (~8-14 por portal)»*. Cada paso manda el system, el
inventario en JSON, el texto visible de la página y **una captura JPEG**. Con 3
tickets pilotables en una flota, 24 corridas al día y el hallazgo de arriba (el
ticket nunca sale de la cola), eso es del orden de 1,000 llamadas de visión
diarias que no aparecen en `llm_costo`, no se atribuyen a ningún tenant y no
salen en la consola de Javier.

**Consecuencia:** el panel que existe para saber cuánto cuesta una liquidación
subestima el costo real de la flota que tenga el piloto encendido, y el
sobrecosto de un ticket atorado es exactamente el que no se ve.

**Causa raíz probable:** el adaptador se escribió contra la interfaz
`AdaptadorPortal`, que no tiene por dónde devolver consumo, y el llamador
(`al_vuelo.ts`) tampoco lo pide.

---

### [BAJO] Cada texto de cada chofer paga una consulta extra a `app_user`
`src/lib/likida/processor.ts:740`

`resolverCuentaOficina(msg.from)` corre para **todo** mensaje de texto de
**todo** operador, dentro del presupuesto de 120 s que `processor.ts:570-572`
documenta como ya justo, para cubrir un caso (el dueño que maneja) que en una
flota mediana es cero de N choferes. No es un fallo, es un peaje en el camino
más medido del sistema, y se paga aunque el mensaje sea «listo».

---

## Estado de los hallazgos abiertos de la ronda 18

| # | Hallazgo | Estado hoy | Dónde lo verifiqué |
|---|---|---|---|
| 1 | El informe en PDF de la oficina se acusa como entregado aunque Meta lo rechace | **CERRADO** (`4f25078`) | `oficina_wa.ts:117-122` — ahora `if (!enviado.ok) throw` con el `error` de Meta en el mensaje; el comentario explica el contrato del objeto discriminado |
| 2 | Un mensaje que muere a media ejecución queda sellado como procesado | **SIGUE** · REINCIDENTE | `processor.ts:553-559`, `route.ts:249-259` — el claim sigue antes de todo efecto y el sellado sigue colgando de que no se lance |
| 3 | El cierre —cifras y PDF— sale al *encargado* | **SIGUE** · REINCIDENTE | `contactos.ts:94`, `avisar_cierre.ts:95`, `visibilidad.ts:41` — sin cambio; y el aviso de facturación (`cron/facturar/route.ts:207`) usa el mismo lookup, ahora con texto completo |
| 4 | El arranque libera el mutex del viaje que otro proceso está cerrando | **CERRADO** (`e1b9474`) | `startup.ts:64-81` — `unlock_viaje` solo corre `if (locked === true)`, con el comentario del porqué; base vacía cae a `startup.migraciones_0005_skip` |
| 5 | El jefe recibe el ejemplar del OPERADOR | **SIGUE** · REINCIDENTE | `processor.ts:2562` arma `-operador.pdf` y `:2627` pasa esa misma URL a `avisarCierreAlJefe` |
| 6 | Sin PDF del operador, el jefe no se entera del cierre | **SIGUE** · REINCIDENTE | `processor.ts:2559-2560` — el `throw` de `pdfGenerado` sigue abriendo el `try` que contiene el aviso al jefe en `:2627` |

Pendiente explícito de la ronda: **`553bee7` («un fajo es un mensaje») queda
auditado** — su mecanismo (`mensajeSolo`, `unicaEntera`, `huboRafaga`) es el
objeto del tercer ALTO de arriba.

---

## Lo que revisé y está bien

- **Las cuatro reglas del piloto de visión, en el canal de texto, están de
  verdad implementadas y no solo escritas.** La regla 1 tiene doble guarda
  independiente —`esBotonQueEmite` del modelo Y `HUELE_A_EMITIR` contra el texto
  del botón del inventario (`piloto_vision.ts:250-257`)—, y `volar` normaliza
  `emitir` y deja constancia de que no va a emitir (:119-122). La regla 4
  (`selectorDelInventario`, :282-288) es el mismo principio del pre-vuelo y
  rechaza el selector inventado sin tocar la página. La regla 2 sale por dos
  caminos: el DOM (:143-149) y el juicio del modelo (:155-160), y el del DOM
  corre **antes** de pagar la captura y la llamada. El loop-guard por firma
  (:169-173) corta ANTES de ejecutar la acción repetida, no después.
- **El presupuesto de pasos no se puede engañar.** `historial.push` solo ocurre
  en iteraciones que ejecutaron acción, así que `historial.length >=
  PASOS_MAXIMOS` (:187) es equivalente al conteo del `for`; no hay camino que
  agote las 14 vueltas con el historial corto.
- **`ok: llenoAlgo` es el criterio correcto y está dicho** (:194-202): terminar
  sin llenar un campo se reporta como fallo con su frase, no como verde.
- **El desempate del analista es el correcto y está probado.** `incluirPreguntaLibre:
  !viajeId` (`processor.ts:765`) impide que el analista —el único reconocedor que
  contesta cualquier cosa— se coma «listo» y «ya llegué»; `processor_dueno_maneja.test.ts:137`
  lo ancla. El choque de tenants no se adivina (:752-755, con su prueba en :161).
  Una foto, un XML o un botón nunca entran al camino de oficina (:739), y eso
  también tiene prueba (:154).
- **El registro de adaptadores por flota resiste el proceso caliente.** La clave
  lleva el tenant, `exigirTenantRegistrado` lanza en vez de devolver `false`, y
  `conPortales` retira el registro en `finally` incluyendo los pilotables, que
  llevan credencial dentro (`registro.ts:319-329`). El centinela dice por qué, en
  vez de parecer «no hay adaptador».
- **`avisarPorFacturar` ahora manda el texto bueno primero y la plantilla como
  respaldo, y anota POR CUÁL camino salió** (`avisar.ts:143-185`). El campo `via`
  en la bitácora es exactamente el dato que mañana explica por qué el encargado
  preguntó «¿cuáles?». Es el patrón correcto de «no afirmar una entrega sin el
  dato».
- **El corte por reloj del cron sigue en los dos niveles** —antes de cada flota
  (route.ts:540) y antes de cada portal nuevo dentro de la flota (:585)— y lo que
  no alcanza NO se marca. El problema no es el mecanismo, es el número contra el
  que compara (ver el ALTO del piloto).
- **La barrera de ráfaga sigue fallando cerrada** y `anotarFoto(viajeId,
  incrementado === 1)` sigue tirando la libreta de una ráfaga anterior que nunca
  cerró (`rafaga.ts:129-132`), que es lo que impide un «de tus 9 fotos» inventado.

## Lo que NO alcancé a revisar

- **`src/lib/likida/agentes/`** completo (cobranza, cola, runner, estrategia,
  redactor). Sigue siendo el hueco que dejé apuntado ayer y sigue abierto; solo
  entré por `avisar()` y `avisarCorridasPorFlota()` desde el cron de facturación.
  La pregunta sigue viva: `avisar(tenantId, 'conductores', …)` reparte por
  correo — ¿filtra por rol como `informes_wa`, o repite el hallazgo del
  encargado?
- **`talacha_wa.ts` con `cuenta.tenantId === null`.** `atenderTextoOficina`
  llama a `atenderAutorizacionTalacha` antes del corte `if (!cuenta.tenantId)`
  (`processor.ts:468`), o sea que el superadmin entra ahí con tenant nulo. Lo
  miré por encima y no vi cómo eso tocaría filas de otra flota, pero no lo
  recorrí contra sus pruebas y no lo reporto sin escenario.
- **`pagina_playwright.ts`** (los +60 del delta: `inventario()` y `seleccionar()`
  reales). Sin Chromium en este entorno no puedo decir cuánto tarda un
  `inventario()` contra una página real, que es el dato que faltaba para poner
  un número duro en el peor caso del piloto en vez de una cota.
- **`conectores/portales_facturacion.ts` y `facturacion/cuentas.ts`** los leí solo
  hasta donde el piloto los consume (`credencialesDePortales` → `ValoresCredencial`).
  La custodia y la revocación de esas credenciales son del auditor de seguridad
  y legal; yo solo reporto lo que el ciclo agéntico hace con ellas una vez
  descifradas.
- **No pude verificar contra base ni contra render**: sin `.env`, sin Supabase y
  sin `npm run build`. Todo lo de arriba se sostiene por lectura del código y por
  los contratos que las propias pruebas fijan. El CRÍTICO y los tres primeros
  ALTOS son deterministas por lectura (un `return` de string donde se esperaba
  `null`, dos `upsert` sobre el mismo jsonb, un `Map` de proceso y un
  `AbortSignal` ausente), no probabilísticos.
