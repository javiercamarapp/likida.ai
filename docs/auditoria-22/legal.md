# Cumplimiento legal — auditoría 22

**Nota: 5/10** (antes: s/d). Razón: línea base nueva, sin ancla previa legible
(`.gitignore` deja fuera del clon los reportes de la 21). El 5 y no el 6 del
ancla «el aviso existe y cubre lo principal con huecos anotados» porque los
huecos de hoy no están anotados: **son afirmaciones activas y falsas** dentro
del propio documento legal —el aviso jura que no se tratan datos de salud
mientras `incidencia.hay_lesionados` los guarda, y el panel le confirma a la
flota que un titular «quedó anonimizado en la base» dejando su texto crudo
intacto—. Y el 5 y no el 3 del ancla «transferencia sin cobertura» porque la
maquinaria sí existe y es buena: hay aviso simplificado e integral, compuerta
antes de tratar, ARCO con RPC de verdad cableada a un botón, redacción de PII
antes de Sentry y `data_collection: 'deny'` en las tres puertas de salida al
modelo. Lo que falla es la SINCRONÍA: el producto creció (voz, GPS, jornada,
asistencia, carta porte, piloto de portales) y el aviso se quedó describiendo
el producto de julio.

**El riesgo mayor de hoy:** el aviso de privacidad solo se pone a disposición
cuando el operador escribe primero por WhatsApp, y desde el 29-ago hay dos
tratamientos que corren **sin que el operador escriba nunca** —el poller de GPS
cada 5 minutos y el derivador de jornada cada hora—, así que existe una
población de titulares rastreados y evaluados laboralmente que jamás vio un
aviso.

---

## Hallazgos

### [CRÍTICO] El operador que nunca escribe por WhatsApp queda rastreado por GPS y con jornada laboral derivada, sin que ningún aviso se le haya puesto a disposición
`src/lib/likida/conectores/sincronizar_gps.ts:149` · `src/lib/likida/jornada/derivar.ts:159` · `src/lib/likida/processor.ts:1365` · `vercel.json:30,42` · norma: `normas/lfpdppp-15-16.yaml` — *"Artículo 16. El responsable debe poner a disposición de las personas titulares el aviso de privacidad […] II. Cuando los datos personales sean obtenidos por cualquier medio electrónico, óptico, sonoro, visual, o a través de cualquier otra tecnología, deberá ser proporcionado en su modalidad simplificada"* y *"Artículo 14. El responsable tendrá la obligación de informar a la persona titular […] la existencia y características principales del tratamiento"*.

**Escenario:** flota «Transportes del Bajío» conecta su credencial de rastreo en
`conector_credencial` el lunes y da de alta a Juan Pérez en `/dashboard/operadores`
con su teléfono, RFC y licencia. El cron `/api/cron/gps` (`*/5 * * * *`) escribe
posiciones de la unidad 12 en `posicion` (`sincronizar_gps.ts:149`). El cron
`/api/cron/jornada` (`30 * * * *`) toma la primera y la última posición del día
de esa unidad (`derivar.ts:159-160`) y asienta `inicio_jornada` / `fin_jornada`
en `jornada_dia` **contra `operador_id` de Juan** (`derivar.ts:135-141`). Juan
recibe su viaje por radio y no manda un solo mensaje: su
`operador.aviso_privacidad_en` sigue en `NULL`, porque el ÚNICO llamador de
`ponerAvisoADisposicion` es el camino de mensaje entrante
(`processor.ts:1212` y `1365`; `reclamarEnvioAviso`/`confirmarEnvioAviso` no
tienen otro llamador en todo `src/`). Un mes después su expediente laboral
—horas, banderas de exceso citando el art. 61 y el 68— existe y él nunca supo
que se estaba construyendo.

**Consecuencia:** el expuesto es el operador y el sancionable es la FLOTA
(responsable, art. 14). El propio `privacidad.ts:38-42` escribe el principio que
el sistema incumple: *"credencial activa = el cron va a intentar traer
posiciones, y el consentimiento tiene que ser PREVIO a la primera. Esperar a que
haya filas en `posicion` sería avisar después de tratar."* Es exactamente lo que
pasa, solo que el disparador que falta no es la primera posición: es el primer
mensaje del chofer, que puede no llegar nunca. Multa del art. 59 fr. III
(`normas/lfpdppp-59.yaml`: *"Multa de 200 a 320,000 veces la Unidad de Medida y
Actualización"*), y para Likida el hueco de producto que la ficha 15-16 nombra:
*"sin el mecanismo, la flota no puede cumplir aunque quiera"*.

**Causa raíz probable:** la compuerta del aviso está atada al canal de entrada
(WhatsApp) y no al inicio del tratamiento; los tres tratamientos nuevos (GPS,
derivación de jornada, alta desde el panel) entran por otras puertas.

---

### [CRÍTICO] El aviso jura que no se conservan datos de salud; el circuito de asistencia los guarda en columna propia y en texto crudo
`src/lib/likida/privacidad.ts:644` · `src/lib/likida/asistencia_wa.ts:524,556,670` · `supabase/migrations/0198_asistencia_siniestros.sql:46,25` · norma: `normas/lfpdppp-15-16.yaml` — *"Artículo 15. El aviso de privacidad deberá contener, al menos […] II. Los datos personales que serán sometidos a tratamiento, identificando aquéllos que son sensibles"*.

**Escenario:** Juan escribe por WhatsApp *"chocamos en la 57, traigo un
herido, me duele el pecho"*. `interpretarAsistencia` lo marca rojo,
`tipoDeAsistencia` abre `emergencia_medica` (constraint de la 0198, línea 25) y
`lesionadosSegunTexto` devuelve `true`. Se persisten: `incidencia.descripcion =
"chocamos en la 57, traigo un herido, me duele el pecho"`
(`asistencia_wa.ts:524`), `incidencia.hay_lesionados = true`
(`0198:46`) y el evento con el mismo texto en
`incidencia_evento.detalle` (`asistencia_wa.ts:670`). El panel lo pinta:
`/dashboard/asistencia/page.tsx:154` imprime `· ⛑️ CON LESIONADOS`. Y el aviso
integral que ese mismo operador puede abrir dice, textual
(`privacidad.ts:644`): **"No se piden ni se conservan datos sensibles. Ni salud,
ni origen racial o étnico…"**.

**Consecuencia:** el aviso —el documento con el que la flota prueba su
cumplimiento— contiene una afirmación desmentida por dos columnas y una
pantalla. Además el tratamiento es de dato sensible, y la propia sanitización
del repo ya razonó la consecuencia en `intake/sanitizar.ts:38-42`: *"el art. 59
fr. IV permite incrementar la sanción 'hasta por dos veces' cuando hay sensibles
de por medio"* — confirmado en `normas/lfpdppp-59.yaml`: *"En tratándose de
infracciones cometidas en el tratamiento de datos sensibles, las sanciones
podrán incrementarse hasta por dos veces, los montos establecidos."* El
tratamiento en sí es defendible (interés vital, y el `hay_lesionados` con NULL =
no preguntado está bien diseñado); lo indefendible es negarlo por escrito.

**Causa raíz probable:** la frase de «sin sensibles» se escribió cuando el único
sensible posible era el que se colaba por accidente en un ticket de farmacia
(el caso que `sanitizar.ts` cubre); la 0198 introdujo una recolección de salud
DELIBERADA y nadie volvió al aviso.

---

### [ALTO] La nota de voz del chofer se manda íntegra a OpenRouter y ningún aviso la enumera ni como dato ni como salida
`src/lib/likida/voz_transcrita.ts:102-106` · `src/lib/likida/processor.ts:1227` · `src/lib/likida/privacidad.ts:274,602-606,737` · norma: `normas/lfpdppp-15-16.yaml` — *"II. Los datos personales que serán sometidos a tratamiento"*; y `normas/lfpdppp-2-XII-XX.yaml` — *"XII. Persona encargada: Persona física o jurídica que sola o conjuntamente con otras trate datos personales por cuenta del responsable"*.

**Escenario:** Juan manda una nota de voz de 12 segundos. `processor.ts:1227`
llama `transcribirNotaDeVoz`, que descarga el audio de Meta y lo remite a
OpenRouter como adjunto binario: `audios: [{ data: base64, format:
formatoDesdeMime(mime) }]` (`voz_transcrita.ts:106`). Búsqueda literal
`grep -niE "nota de voz|audio|voz"` sobre `src/lib/likida/privacidad.ts`,
`src/app/privacidad/page.tsx` y `src/app/aviso/`: **cero coincidencias**. El
simplificado (`privacidad.ts:274`) enumera *"tu nombre y teléfono, las fotos de
comprobantes […] los avisos del viaje […] y la posición GPS"*. La cláusula de
transferencias del integral (`privacidad.ts:737`) es enumerativa y taxativa:
*"les llegan **las fotos de tus comprobantes** para leerlas y **el texto de tus
mensajes** —la conversación completa— para poder contestarte"*. La grabación de
voz no es una foto ni es texto.

**Consecuencia:** el titular no puede tomar la decisión informada que el art. 14
persigue sobre la categoría de dato que más le cuesta reconocer (su propia voz,
y lo que dice en ella, que en una emergencia es justo el dato de salud del
hallazgo anterior). La ficha 2-XII-XX quita el requisito de consentimiento por
ser persona encargada, pero **no quita el de enumerar el dato ni el de describir
el flujo real** — que es justamente lo que la auditoría 18 (M7) ya corrigió una
vez para el historial de texto, y que la E.28 volvió a dejar incompleto al
cablear la voz.

**Causa raíz probable:** la E.28 movió la compuerta del aviso *antes* de
transcribir (bien) y dio el asunto por cerrado; nadie tocó el CONTENIDO del
aviso, que sigue describiendo un canal de fotos y texto.

---

### [ALTO] El RFC y el número de licencia del operador salen hacia el PAC dentro del Carta Porte y no están en ninguna de las dos listas del aviso
`src/lib/likida/carta_porte_xml.ts:183-185` · `src/lib/likida/carta_porte.ts:591` · `src/lib/likida/pac/sw.ts:105` · `src/app/dashboard/operadores/forma.tsx:120,130-146` · `src/lib/likida/privacidad.ts:601-606,737` · norma: `normas/lfpdppp-15-16.yaml` — *"II. Los datos personales que serán sometidos a tratamiento"*; `normas/lfpdppp-2-XII-XX.yaml` — *"Artículo 35. Cuando el responsable pretenda transferir los datos personales a terceros nacionales o extranjeros, distintos de la persona encargada deberá comunicar a éstos el aviso de privacidad y las finalidades"*.

**Escenario:** el contralor captura en `/dashboard/operadores` el RFC
`GODE561231GR8` y la licencia federal de Juan (`forma.tsx:120,130-146`). Al
timbrar el viaje, `carta_porte.ts:591` toma `operador.licencia` y
`carta_porte_xml.ts:183-184` emite
`<cartaporte31:TiposFigura … NumLicencia="…" RFCFigura="…"/>`, y el XML sale por
`fetch(${cfg.urlBase}/cfdi33/issue/v4)` hacia SW Sapien
(`pac/sw.ts:105`, `services.sw.com.mx`). El aviso integral enumera en la fr. II
*"RFC del establecimiento"* (`privacidad.ts:602`) — el del comercio, no el del
chofer— y no menciona ni el RFC del operador ni su licencia de conducir. La
cláusula de transferencias (`privacidad.ts:737-738`) nombra tres encargadas
(mensajería, alojamiento, modelos) y como transferencia *"a la autoridad fiscal
cuando la ley lo exige"*: un PAC es una empresa privada certificadora, no la
autoridad.

**Consecuencia:** dos identificadores emitidos por autoridades externas (SAT y
autoridad de tránsito) —los que ubican a la persona FUERA de la base de Likida,
como razona la propia migración `0262`— se tratan y se remiten sin que el aviso
los declare. El operador no puede oponerse a lo que no sabe que existe, y la
flota no puede acreditar la fr. II sobre esos campos.

**Causa raíz probable:** la 0262 barrió el esquema de `operador` para
ANONIMIZAR RFC y licencia, y esa misma revisión no se propagó a la enumeración
del art. 15 fr. II ni al inventario de subencargados.

---

### [ALTO] La jornada laboral se deriva de las posiciones GPS: finalidad nueva, que el propio aviso declara imposible sin permiso nuevo
`src/lib/likida/jornada/derivar.ts:10-35,159-160` · `src/lib/likida/privacidad.ts:678,680` · `vercel.json:42` · norma: `normas/lfpdppp-15-16.yaml` — *"III. Las finalidades del tratamiento de datos personales, distinguiendo aquéllas que requieren el consentimiento de la persona titular"*.

**Escenario:** el aviso integral declara, para el GPS, exactamente dos
finalidades (`privacidad.ts:678`): *"Usar las posiciones GPS de la unidad para
el seguimiento del viaje y para medir sus tiempos —por ejemplo, cuánto estuvo
detenida la unidad en un sitio de carga o descarga— y mostrárselo a la
empresa."* Y cierra la sección con su propio candado (`privacidad.ts:680`):
*"Cualquier finalidad que no esté escrita aquí requiere que te vuelvan a pedir
permiso. La ley vigente ya no permite ampararse en usos 'compatibles o
análogos'."* Sin embargo `/api/cron/jornada` (cada hora) usa la primera y la
última posición del día para asentar el inicio y el fin de la jornada de Juan
(`derivar.ts:21-23,159-160`), y `jornada/riesgo.ts` emite EXCESO contra el tope
del art. 61 o el del art. 68 de la LFT. Ni la palabra «jornada», ni «horas», ni
el registro del art. 132 fr. XXXIV aparecen en `privacidad.ts`.

**Consecuencia:** el mismo dato (la posición del camión) alimenta un expediente
laboral que puede terminar en una autoridad del trabajo —el registro que
`normas/lft-132-XXXIV-jornada.yaml` transcribe: *"XXXIV. Registrar de manera
electrónica la jornada laboral de cada persona trabajadora […] así como
proporcionarlo a la autoridad cuando se le requiera"*— sin que esa finalidad
esté declarada. Es además el terreno del art. 26 fr. II
(`normas/lfpdppp-26-II.yaml`: *"analizar o predecir, en particular, su
rendimiento profesional […] fiabilidad o comportamiento"*): la ficha avisa
*"no construir cierre automático sin revisión humana sin volver aquí"*, y aquí
la evaluación de horas sí la genera un programa —el mitigante real es que el
motor nunca emite «cumple» y el contralor decide, lo que mantiene el supuesto
cerrado; lo que no se sostiene es la fr. III.

**Causa raíz probable:** la 0241 (registro de jornada, 27-ago) construyó un
consumidor nuevo de `posicion` sin pasar por la lista de finalidades del aviso,
que sí se había refinado dos días antes (28-ago) para el renglón del GPS.

---

### [ALTO] «El titular quedó anonimizado en la base» es falso: la cancelación ARCO deja intacto el texto crudo que el titular escribió
`src/app/dashboard/arco/page.tsx:90-91` · `supabase/migrations/0262_arco_cancelacion_anonimiza_rfc_y_licencia.sql:60-120` · `src/lib/likida/asistencia_wa.ts:524,670,832` · norma: `normas/lfpdppp-15-16.yaml` — *"V. Los mecanismos, medios y procedimientos para ejercer los derechos ARCO, de conformidad con lo dispuesto en esta Ley"*.

**Escenario:** Juan pide cancelación por WhatsApp; el contralor aprieta
«Ejecutar cancelación» en `/dashboard/arco`. La RPC anonimiza `operador`
(nombre, teléfono, RFC, licencia), anonimiza `app_user`, borra
`wa_conversacion` y `envio_mensaje`. **No toca** `incidencia.descripcion`, que
guarda hasta 500 caracteres de lo que Juan escribió textualmente
(`asistencia_wa.ts:524`), ni `incidencia_evento.detalle->>'texto'`, que guarda
otros 500 por cada mensaje adicional (`asistencia_wa.ts:670` y `:832`). Si Juan
escribió *"soy Juan Pérez de la unidad 12, choqué en el km 84 y me llevaron al
IMSS de Querétaro"*, esa cadena sobrevive íntegra y el panel le confirma al
contralor: **"Cancelación ejecutada: el titular quedó anonimizado en la base"**
(`arco/page.tsx:90`).

**Consecuencia:** falla silenciosa del tipo más caro — la flota firma que
cumplió y no cumplió; si la autoridad pide el expediente, el nombre del titular
cancelado aparece en texto libre. Rompe además la regla de la casa: un rótulo
tiene que ser verdad.

**Causa raíz probable:** el alcance de la revisión de la 0262 fue *"el esquema
completo de `operador`"* —así lo dice su propio comentario— y las tablas de
texto libre donde vive lo que el titular escribió quedaron fuera de ese
perímetro.

---

### [MEDIO] Likida almacena el nombre, teléfono y parentesco de un familiar del operador, y ningún aviso lo enumera
`src/lib/likida/emergencias.ts:265-276` · `src/app/dashboard/emergencias/page.tsx:281,309` · `supabase/migrations/0198_asistencia_siniestros.sql:93-105` · `src/lib/likida/privacidad.ts:601-606` · norma: `normas/lfpdppp-15-16.yaml` — *"II. Los datos personales que serán sometidos a tratamiento"*; *"Artículo 16 […] II. Cuando los datos personales sean obtenidos por cualquier medio electrónico […] deberá ser proporcionado en su modalidad simplificada"*.

**Escenario:** el contralor captura en `/dashboard/emergencias` a «María Pérez,
55 55 1234 5678, esposa» como contacto de Juan y activa «avisar si hay
lesionados». `crearContactoEmergencia` inserta la fila
(`emergencias.ts:265-276`). Con `hay_lesionados = true`, el agente de dirección
le pone ese teléfono en la mano al dueño (`agentes/direccion.ts:473,542`). La
fr. II del aviso integral (`privacidad.ts:601-606`) no menciona contactos de
emergencia; y María, que no es cliente ni operadora ni prospecto, no tiene
ningún aviso en el producto.

**Consecuencia:** una tercera persona identificada, cuyo dato revela además una
relación familiar, tratada sin aviso alguno. **Mitigante real y honesto:** la
migración lo anticipó por escrito (`0198:104-105`: *"esta fila guarda a un
familiar que nunca aceptó ningún aviso de privacidad […] y el aviso de
privacidad del operador debe declararlo antes de que se capture el primero"*) y
la pantalla se lo repite al contralor (`emergencias/page.tsx:281`). Es decir: el
producto sabe lo que falta y lo dice — pero construyó el escritor antes que el
aviso, que es el orden inverso al que su propio comentario ordenaba. Tampoco lo
borra la cancelación ARCO del operador.

**Causa raíz probable:** el aviso de la flota lo genera `privacidad.ts` y el
formulario de contactos vive en otra pantalla; nada ata una cosa a la otra.

---

### [MEDIO] El piloto de facturación manda al modelo el texto visible completo del portal y el inventario del DOM; la política declara solo seis campos y una captura
`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:413-418,433,435,449-451` · `src/app/privacidad/page.tsx:118` · norma: `normas/lfpdppp-2-XII-XX.yaml` — *"Artículo 35. Cuando el responsable pretenda transferir los datos personales a terceros […] deberá comunicar a éstos el aviso de privacidad y las finalidades a las que la persona titular sujetó su tratamiento"*; `normas/lfpdppp-15-16.yaml` — *"II. Los datos personales que serán sometidos a tratamiento"*.

**Escenario:** el aviso que se tocó ayer (`page.tsx:118`) declara que al modelo
le llegan *"los datos fiscales de tu empresa (RFC, razón social, código postal,
régimen fiscal, uso CFDI y el correo de recepción) junto con capturas de
pantalla del portal de facturación del comercio"*. El código manda además, en
CADA paso: el inventario JSON de todos los campos del formulario incluidos los
`type="hidden"` con su valor (`piloto_vision.ts:433`) y el **texto visible
completo de la página** (`piloto_vision.ts:435`). Con `arrancoConSesion = true`
(`piloto_vision.ts:423`) esa página es el portal del comercio con la sesión de
la flota ya abierta: el texto visible puede traer el nombre del usuario de la
cuenta, su correo, su dirección y el historial de facturas previas, y todo eso
va al modelo junto con la captura.

**Consecuencia:** la enumeración del aviso es más angosta que el flujo, y lo es
en el sentido peligroso (declara menos de lo que sale). La corrección de la
ronda 21 acertó el diagnóstico —el modelo recibe datos fiscales y capturas— pero
se quedó con la lista de campos y no con lo que la pantalla arrastra.

**Causa raíz probable:** se auditó el prompt del sistema (donde están los seis
campos) y no el mensaje de usuario, donde están el DOM y el texto.

---

### [MEDIO] El PDF imprime a 14 pt «Diferencia a favor de la empresa» sin ninguno de los dos topes del art. 110 fr. I; el módulo que los calcula tiene cero consumidores
`src/lib/likida/liquidacion/pdf.ts:366-373` · `src/lib/likida/laboral/pagadero.ts:122-149` · `src/lib/likida/cuadre/resumen.ts:59` · norma: `normas/lft-110-111-263.yaml` — *"Artículo 110.- Los descuentos en los salarios de los trabajadores, están prohibidos salvo […] I. […] La cantidad exigible en ningún caso podrá ser mayor del importe de los salarios de un mes y el descuento será al que convengan el trabajador y el patrón, sin que pueda ser mayor del treinta por ciento del excedente del salario mínimo"* y *"Artículo 111.- Las deudas contraídas por los trabajadores con sus patrones en ningún caso devengarán intereses."*

**Escenario:** anticipo $12,000, comprobado $6,500. El PDF pinta en su banda de
veredicto, a 14 pt y en tinta principal, **«Diferencia a favor de la empresa
$5,500.00»** (`pdf.ts:366-373`), y el WhatsApp le dice al chofer *"Sobró $5,500
del anticipo (a favor de la empresa)"* (`resumen.ts:59`). La flota lo aplica a
la nómina de la quincena. `topeDescuento` —que calcula el tope al saldo
exigible (un mes de salario) y el tope periódico (30% del EXCEDENTE del salario
mínimo) y que está probado en `pagadero.test.ts:76-108`— **no tiene un solo
llamador en `src/`**: la única referencia fuera de sus pruebas es el texto
embebido de la ficha en `normas/corpus_texto.ts`. El propio comentario de
`pagadero.test.ts:111-118` lo dejó anotado como pendiente y siguió pendiente.

**Consecuencia:** el papel que firma la flota entrega la cifra sin la
advertencia de que descontarla del salario exige acuerdo y está topada; para un
operador cuyo salario no excede el mínimo, `topeDescuento` habría dicho *"no se
le puede descontar nada este periodo"*. La ficha lo dice con todas sus letras:
*"sin esta separación, una liquidación puede imprimir un neto ilegal"*.
**Mitigante:** la sección «LO QUE SE LE REEMBOLSA AL OPERADOR» (`pdf.ts:425`)
sí impide el error inverso (leer «no deducible» y descontarlo), y el veredicto
`sin_criterio` sobre política existe. El hueco es el otro lado: el saldo a favor
de la empresa.

**Causa raíz probable:** `resumenLaboral` se cableó al PDF y `topeDescuento` se
quedó sin puente porque le falta un dato que el modelo no tiene
(`operador.salario_mensual` no existe en el esquema) — y en vez de emitir el
`sinCriterio: true` que la función ya sabe devolver, no se llama.

---

### [BAJO] La solicitud ARCO se registra sin el texto de lo que el titular pidió
`src/lib/likida/repo.ts:1330-1353` · `supabase/migrations/0053_cuentas_bitacora_arco_campanias.sql:98-117` · `src/lib/likida/privacidad.ts:777-784` · norma: `normas/lfpdppp-15-16.yaml` — *"V. Los mecanismos, medios y procedimientos para ejercer los derechos ARCO"*.

**Escenario:** Juan escribe *"oigan, ¿qué hacen con mi ubicación? ya no me
gusta"*. `tipoDeSolicitudArco` no casa `cancelacion` ni `oposicion` ni
`rectificacion` y cae al default `'acceso'` (`privacidad.ts:783`).
`registrarSolicitudArco` inserta tenant, operador, teléfono, tipo, canal y
vencimiento — y nada más (`repo.ts:1338-1346`); la tabla no tiene columna para
el texto (`0053:98-117`). El contralor abre `/dashboard/arco` y ve «acceso» sin
saber que lo que se pedía era oposición al rastreo, y tiene 20 días hábiles
para contestar algo que no puede leer.

**Consecuencia:** el mecanismo del art. 15 fr. V existe y opera, pero la
responsable resuelve a ciegas. Riesgo de una resolución que no responde lo
pedido, con el plazo ya consumido.

**Causa raíz probable:** el registro se diseñó como constancia del plazo (que es
lo que faltaba en la auditoría 12) y no como expediente de la petición.

---

## Fichas legales que abrí y contra qué código las comparé

| Ficha | Artículo | Archivo contrastado | Veredicto |
|---|---|---|---|
| `normas/lfpdppp-15-16.yaml` | 14, 15 fr. I–VI, 16 fr. II | `lib/likida/privacidad.ts`, `processor.ts:347,1212,1365`, `repo.ts:1152,1177`, `conectores/sincronizar_gps.ts:149`, `jornada/derivar.ts:159` | **INCUMPLE** — fr. II omite voz, RFC/licencia del operador, jornada, salud y contacto de emergencia; art. 16 fr. II no alcanza al operador que nunca escribe (2 CRÍTICOS, 3 ALTOS, 1 MEDIO) |
| `normas/lfpdppp-15-16.yaml` | 15 fr. III | `privacidad.ts:648-681`, `jornada/derivar.ts` | **INCUMPLE** — la finalidad «registro de jornada» no está declarada y el propio aviso cierra la válvula de usos análogos (ALTO) |
| `normas/lfpdppp-15-16.yaml` | 15 fr. IV, V, VI | `privacidad.ts:319,693-709,756-764`, `pideAtencionPrivacidad`, `versionAviso`, `/dashboard/arco` | **CUMPLE** con un hueco menor: el medio existe, es determinístico, se reenvía por hash y hay botón que ejecuta; falta el texto de la petición (BAJO) |
| `normas/lfpdppp-2-XII-XX.yaml` | 2 fr. XII y XX, 35 | `privacidad.ts:737-739`, `app/privacidad/page.tsx:118`, `llm/openrouter.ts:274`, `pac/sw.ts:105`, `saas/stripe.ts:337-357`, `observability/sentry.ts` | **PARCIAL** — la calificación de encargada está bien argumentada y `data_collection:'deny'` va en las tres puertas; el inventario de encargadas omite el PAC, el procesador de pagos y el alcance real del piloto (1 ALTO, 1 MEDIO) |
| `normas/lfpdppp-26-II.yaml` | 26 fr. II | `privacidad.ts:314,684-690,375-408`, `processor.ts:atenderPrivacidad`, `cuadre/engine.ts` (oposición), mig. 0100 | **CUMPLE** — el derecho se anuncia en el canal, se reconoce con regex tolerante y ENCIENDE la bandera `oposicion_automatizada` que manda la liquidación a revisión humana. Es lo mejor construido del rubro |
| `normas/lfpdppp-59.yaml` | 59 fr. III y IV | usado para dimensionar sanción en los dos CRÍTICOS | **REFERENCIA** — se cita el rango correcto (200 a 320,000 UMA, no 200,000) y el «hasta por dos veces» solo para el hallazgo de salud |
| `normas/lft-110-111-263.yaml` | 110 fr. I, 111, 263 fr. I | `laboral/pagadero.ts`, `liquidacion/pdf.ts:366-373,425-440` | **PARCIAL** — el 263 fr. I y el «no deducible ≠ descontable» sí llegan al PDF; los dos topes del 110 fr. I no llegan a ningún lado (MEDIO) |
| `normas/lft-132-XXXIV-jornada.yaml` | 132 fr. XXXIV, 58-69, 784, 804-805, 994 IV Bis | `jornada/topes.ts`, `jornada/riesgo.ts`, `jornada/derivar.ts`, mig. 0241 | **CUMPLE en lo laboral, INCUMPLE en lo de datos** — el motor nunca dice «cumple», usa la tabla escalonada del Transitorio Segundo y respeta el `restrict` del 804; pero el insumo (GPS) se usa para una finalidad no declarada (ALTO) |
| `normas/reglamento-transito-83.yaml` | 83 | `jornada/topes.ts` (`LEYENDA_NO_ES_BITACORA_83`), `jornada/reporte.ts` | **CUMPLE** — el reporte declara en su encabezado que NO es la bitácora de horas de servicio y nombra los campos que le faltan (placas, licencia en la fila, ruta, firmas). Sin «cumple falso» |
| `normas/nom-087-sct-2-2017.yaml` | 4.1-4.7, 8.2.1, 8.3.2, 8.5 | `jornada/topes.ts`, `jornada/riesgo.ts` | **CUMPLE por abstención** — el producto no evalúa tiempos de conducción de la NOM (que son distintos de los topes de la LFT) y no lo promete. No encontré ninguna pantalla que afirme cumplimiento de la NOM-087 |
| `normas/red-nacional-autopistas.yaml` | LIF 2026 art. 20 ap. A fr. V; LCPAF 2o. fr. I | — | **FUERA DE MI RUBRO** — es materia del auditor fiscal (estímulo de peaje). Abierta y descartada para no invadir |

---

## Lo que revisé y está bien

- **La compuerta del aviso en el canal de WhatsApp.** `processor.ts:1349-1386`
  está izada antes de la foto, el XML, el ticket 1:1 y el agente; y la E.28 la
  duplicó correctamente antes de transcribir el audio (`:1206-1225`) sin
  invocarla dos veces por turno. Falla cerrado con dos mensajes distintos según
  la causa, y suelta el claim solo cuando el fallo es nuestro.
- **El aviso simplificado degradado.** `avisoSimplificado` devuelve `null` sin
  razón social o domicilio, pero **sí** manda el aviso cuando lo único que falta
  es la liga del integral, diciéndole la verdad al titular
  (`privacidad.ts:329-331`). Y `versionAviso` (FNV-1a sobre el texto) hace que un
  cambio de domicilio o de liga reenvíe solo — el art. 15 fr. VI sin depender de
  que alguien incremente un contador.
- **`revisarAvisoIntegral` con frontera de palabra.** `privacidad.ts:112-162`:
  `transportistaindependiente.mx` ya no cae por contener «pendiente». El
  razonamiento medido está escrito en el comentario con los cuatro dominios de
  prueba.
- **Redacción antes de Sentry.** `logger.ts:100-108` borra teléfono, RFC, CLABE
  y tarjeta y huella los UUID; `observability/sentry.ts:100-140` añade una
  segunda capa de **lista blanca de llaves** que deja fuera `err`/`message`/
  `motivo` por ser texto libre, y vuelve a redactar el valor de las permitidas.
  Es la defensa correcta y está bien argumentada.
- **`data_collection: 'deny'` en las tres salidas al modelo.**
  `openrouter.ts:273-278` y sus tres usos (`:374`, `:611`, `:1022`), que son
  todos los `chat.completions.create` del archivo. Y el aviso dice lo que el
  código hace («se les PIDE que no retengan»), no lo que nadie contrató — la
  corrección de la auditoría 8 sigue en pie.
- **El filtro de sensibles colados por el ticket.** `intake/sanitizar.ts`
  detecta formas farmacéuticas pegadas al número («10TAB») y declara su propio
  límite: reduce lo que se PERSISTE, no lo que se remite. El aviso describe
  exactamente ese matiz (`privacidad.ts:644`).
- **ARCO cancelación cableada de verdad.** `/dashboard/arco/page.tsx:73-96`
  llama la RPC; la 0262 anonimiza RFC y licencia además de nombre y teléfono, y
  deja escrita la regla para la próxima columna. La oposición (`:104-127`)
  registra constancia sin cerrar la solicitud, que es lo correcto.
- **El aviso ARCO responde a quien ya no es operador.** `processor.ts:1021-1039`
  atiende PRIVACIDAD antes de resolver identidad, incluido el operador dado de
  baja — que es la población más probable de ejercerlo.
- **Purga de posiciones a 90 días, real.** `purgar_posicion(90, …)` dentro de
  `mantenimiento_de_datos`, invocada desde `/api/cron/purgar`; con piso duro de
  30 días en la propia función (`0155:174`). La cifra del aviso está respaldada.
- **Aviso de prospectos con Likida como responsable**, y su pie en el correo
  frío (`agentes/cola.ts:87`), con purga a 365 días (mig. 0148) y seudónimo
  antes del modelo. El aviso declara los dos orígenes (raspado y formulario) y
  el `fbclid`.
- **`/aviso/[tenant]` es público** (`notFound()` sin sesión), que es lo que el
  art. 16 fr. II necesita: un sitio consultable por el titular.

## Lo que NO alcancé a revisar

- **El contrato con la flota y el de OpenRouter.** La ficha 2-XII-XX dice que la
  calificación de encargada no quita *"el pendiente contractual: hace falta que
  el contrato con la flota autorice la subcontratación y que el de OpenRouter
  cubra su propia cadena"*. Eso vive en `docs/` y en papel, no en el código; no
  lo audité.
- **`docs/conocimiento/52-anexo-subencargados.md`** — `sentry.ts:33` lo cita
  como el inventario de subencargados. No lo abrí, así que no puedo decir si el
  PAC, Stripe y Facturapi están listados ahí aunque falten en el aviso.
- **Retención de `incidencia`, `incidencia_evento`, `jornada_dia` y
  `coordinacion_proveedor`.** Ninguna aparece en las purgas que revisé; no
  alcancé a barrer las 252 migraciones para descartar que otra las cubra.
- **El ciclo de soporte (0268, `ticket_mensaje`)** y qué datos del operador
  quedan en los tickets — quedó fuera por tiempo.
- **`/dashboard/facturacion` y `facturacion_escritura.ts`** desde el ángulo de
  datos personales del receptor persona física.
- **Los prompts de los agentes de oficina** (`atenderTextoOficina` con
  `incluirPreguntaLibre`), que corren ANTES de la compuerta del aviso
  (`processor.ts:1318-1347`) por una razón declarada y razonable; no verifiqué
  si alguna herramienta que ese camino invoca devuelve datos del operador al
  modelo.
- **Render de pantallas.** No levanté preview ni tomé screenshots; todos los
  hallazgos son de lectura de código y de texto de aviso.
