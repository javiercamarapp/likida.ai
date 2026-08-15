# Cumplimiento legal — auditoría 3 (pase 3)

**Nota: 6/10** (antes 5.5). Razón del movimiento: **se atacó y subió** — tres
cosas que el pase 2 dejó abiertas están cerradas y verificadas línea por línea
(LEG-A1 los hitos ya viven en el aviso; E5 la retención de verdad corre y la
página promete exactamente lo que las funciones borran; Resend entró al anexo
**y** a la cláusula de encargados con lo que de verdad recibe en las dos
direcciones). No pasa de 6 porque una **mirada más profunda** encontró que E1
construyó el mecanismo de la oposición y no lo conectó a la última pieza —la
decisión automatizada se sigue ejecutando y cerrando sola—, y porque D6 abrió
una superficie donde **Likida es responsable, no encargada**, y no hay aviso.

**El riesgo mayor, hoy:** el producto le manda al chofer un WhatsApp que dice
*"desde ahora tus liquidaciones las revisa una persona antes de cerrarse"*, y la
siguiente liquidación se cierra sola, genera el PDF y se lo manda a él — sin que
nadie la haya mirado.

## Hallazgos

### [ALTO] La oposición ya marca, pero la decisión automatizada se ejecuta igual — y al titular se le afirma lo contrario
`src/lib/likida/processor.ts:192` · `src/lib/likida/tools.ts:202-207` ·
`supabase/migrations/0021_liquidacion_litros_diesel.sql:51` ·
`src/lib/likida/processor.ts:2366` · contra `src/lib/likida/cuadre/engine.ts:199-202`
y `src/lib/likida/privacidad.ts:544` ·
norma: **LFPDPPP 2025 art. 26 fr. II**.

**Escenario.** Juan Pérez escribe *"no quiero que un programa decida, que lo vea
una persona"*. `tipoDeSolicitudArco` (privacidad.ts:625) lo clasifica
`'oposicion'`, `processor.ts:182-186` enciende
`operador.oposicion_automatizada = 2026-08-15T…` (mig. 0100) y
`processor.ts:192` le contesta textualmente: *"Además, desde ahora tus
liquidaciones las revisa una persona antes de cerrarse. Queda registrado. 👍"*.
Al día siguiente Juan manda su última foto del viaje F-1204 y dice "ya no tengo
más". El agente llama `guardar_liquidacion`:

1. `cuadrarDesdeDB` (desde_db.ts:54) lee la bandera y el motor añade la
   diferencia `oposicion_titular` → `estatus = 'revisar'` (engine.ts:203-210,
   :1135).
2. `saveLiquidacion` (repo.ts:711) llama `guardar_liquidacion_tx` con
   `p_estatus='revisar'`, y esa función hace, **sin mirar `p_estatus`**:
   `update viaje set estatus = 'liquidado'` (0021:51).
3. `tools.ts:202-203` ya generó los dos PDF, y `processor.ts:2366` le manda a
   Juan el suyo: *"Aquí está tu liquidación 📄"*, con el resumen
   *"Listo, cuadré tu viaje"* (`resumenCuadre(liq, true, 'operador')`,
   processor.ts:2174).

Ninguna persona intervino entre el paso 1 y el paso 3. El `oposicion_titular`
sale después a la cola de decisión del jefe (`cierre_aviso.ts:131`), o sea
**después** de que el viaje quedó liquidado y el resultado ya viajó al titular.
Busqué el freno: `grep -rn "estatus === 'revisar'\|oposicionTitular" src/` no
devuelve un solo llamador que detenga el cierre; la RPC de la 0021 no tiene rama
condicional; y `guardar_liquidacion` no consulta la bandera antes de mutar.

**Consecuencia.** Al titular se le mandó por escrito, por el canal, una
afirmación falsa sobre cómo se le trata — la clase de rótulo que este repo
prohíbe. Ante la autoridad, la flota (responsable) tiene la constancia de haber
honrado el art. 26 fr. II, la bandera con fecha que "demuestra desde cuándo lo
honra" (0100:14-18) y una liquidación cerrada sin intervención humana esa misma
semana. Y el comentario del propio motor afirma lo que no ocurre:
*"sale a revisar y una persona la mira **antes de que al operador se le afirme
nada**"* (engine.ts:201-202).

**Intento de refutación.** ¿No basta con que la liquidación quede en `revisar` y
el jefe la abra después? No: el supuesto del art. 26 fr. II es el tratamiento
que evalúa **sin intervención humana** y produce el efecto; aquí el efecto (el
viaje liquidado, el PDF entregado al titular) ya se produjo. Y el aviso no
promete "un jefe la revisará luego": promete *"la empresa la hará a mano"*
(privacidad.ts:544). ¿Y `desde_db.ts`? Ahí sí se hizo lo correcto —se quitó el
`.catch(() => null)` para no liquidar en automático a quien ejerció el derecho
(desde_db.ts:44-52)—; el hueco está una capa más abajo, en la RPC de cierre.

**Causa raíz probable.** `guardar_liquidacion_tx` (mig. 0021) cierra el viaje
incondicionalmente; la bandera se cableó al motor de cuadre y no al cierre.

*(Es la evolución del ALTO nº 1 del pase 2 —"se registra y no se ejecuta"—: hoy
sí se ejecuta la mitad de cálculo y no la mitad de gobierno.)*

---

### [ALTO] La Cancelación del art. ARCO no tiene ejecutor: no existe un solo borrado de datos del operador en todo el código
`src/lib/likida/repo.ts:1084-1112` · `supabase/migrations/0104_retencion_operativa.sql:112-149`
· `src/lib/likida/privacidad.ts:559` · norma: **LFPDPPP 2025 art. 11** (limitación de
finalidades / el dato deja de tratarse cuando deja de ser necesario) y el propio
aviso.

**Escenario.** El aviso integral dice al titular (privacidad.ts:559): *"Tienes
derecho a … **Cancelarlos** cuando ya no deban tratarse"*. Juan, ya dado de baja
de la flota, escribe *"denme de baja, borren mis datos"*.
`tipoDeSolicitudArco` (privacidad.ts:622) lo clasifica `'cancelacion'`; la fila
entra en `solicitud_arco`. El contralor abre `/dashboard/arco`, escribe "se
borraron sus datos" y envía. `resolverSolicitudArco` (repo.ts:1093-1097) hace
**un solo UPDATE** (`estado='resuelta'`, `resuelta_en`, `resolucion`) y después
manda al titular: *"Tu solicitud de derechos ARCO fue atendida por TRANSPORTES
INNOVATIVOS SA DE CV: se borraron sus datos"* (repo.ts:1108).

Lo que de verdad se borró: nada. Lo comprobé de tres formas:
- `grep -rn "\.remove(" src/lib` → **cero** resultados: ninguna imagen sale
  jamás del bucket `comprobantes` (`intake/almacen.ts:66` es el único escritor).
- No existe `borrarOperador`/`eliminarOperador` ni ningún `.delete()` sobre
  `operador`, `gasto` o `comprobante_huerfano` en `src/`.
- `mantenimiento_de_datos` (0104:112-149) purga siete cosas —`wa_mensaje_procesado`,
  `api_idempotencia`, `correo_procesado`, `agente_corrida`, `wa_conversacion`,
  `codigo_pendiente`, consolidación de `llm_costo`— y la propia migración declara
  en su encabezado (0104:34-49) que `comprobante_huerfano` **no se purga a
  propósito** ("es el rastro de un comprobante que existió"). La ficha del
  operador se inactiva con `activo=false` y se queda.

**Consecuencia.** El titular recibe por WhatsApp una constancia de que su
cancelación fue atendida, con la razón social de su patrón encima. Ante una
verificación, la flota no tiene manera de acreditar la supresión, y **no puede
hacerla aunque quiera**: el producto no le da la palanca. Es exactamente el
mismo defecto estructural que E1 acaba de corregir para la oposición, sobre el
otro derecho.

**Intento de refutación.** ¿Lo tapa el CFF art. 30? Tapa los comprobantes
fiscales y las liquidaciones, y el aviso lo dice bien (privacidad.ts:568). No
tapa la foto cruda en Storage, ni `wa_conversacion` fuera de los 180 días, ni la
ficha del operador con licencia y RFC. La distinción existe en la 0104 y no se
usó para construir el lado de la supresión.

**Causa raíz probable.** El pase E5 construyó la retención por **calendario** y
no la supresión **a solicitud**; ARCO sigue modelado como bandeja de tickets.

---

### [ALTO · REINCIDENTE] Likida resuelve solicitudes ARCO de cualquier flota y firma la respuesta con la razón social de la flota
`src/app/admin/compliance/page.tsx:36-53` · `src/lib/likida/repo.ts:1103-1109` ·
`supabase/migrations/0053_cuentas_bitacora_arco_campanias.sql:98-117` ·
norma: **LFPDPPP 2025 art. 2 fr. XX** (persona encargada) y **Reglamento art. 50**.

**Verificación de reincidencia:** intacto respecto del pase 2. `accionResolver`
sigue en `page.tsx:36`, sigue resolviendo el tenant desde la solicitud
(`page.tsx:45`) y sigue llamando `resolverSolicitudArco` sin registrar quién lo
hizo.

**Escenario.** Javier abre `/admin/compliance` (superadmin, cruza tenants a
propósito), ve la solicitud de oposición de Juan Pérez de la flota B, escribe
"procede" y envía. `resolverSolicitudArco` (repo.ts:1103-1108) lee
`tenant.razon_social` y le manda al titular: *"Tu solicitud de derechos ARCO fue
atendida por TRANSPORTES INNOVATIVOS SA DE CV: procede"*. La flota B nunca vio
la solicitud. Y la fila no permite reconstruirlo: `solicitud_arco` tiene
`estado`, `resolucion` (texto libre) y `resuelta_en`, **no tiene columna de
actor** (0053:98-117), y `anotar()` —la bitácora de `administracion.ts`— no se
llama desde ninguno de los dos caminos (`page.tsx:36-53`, `repo.ts:1084-1112`).

**Consecuencia.** La persona encargada ejerce por cuenta propia una obligación
indelegable del responsable, y no queda evidencia de quién la ejerció: en una
verificación, ni la flota puede probar que contestó ella ni Likida puede probar
que actuó por instrucción. `privacidad.ts:387-391` declara por escrito la
doctrina correcta —*"Likida no puede resolver un ARCO por su cuenta"*— y esta
pantalla la contradice.

**Causa raíz probable.** `/admin/compliance` nació como la única pantalla de
ARCO y conservó el poder de escritura cuando `/dashboard/arco` le dio a la flota
la suya.

---

### [ALTO] D6: Likida guarda nombre, correo y WhatsApp de un tercero, le escribe por WhatsApp, y nunca le pone a disposición ningún aviso — y aquí Likida es RESPONSABLE
`src/app/dashboard/usuarios/page.tsx:92` y `:99-103` · `src/lib/auth/provisionar.ts:52-64`
· `src/lib/likida/contactos.ts:114-125` → `src/lib/likida/escalar_viaje.ts:333` ·
`src/lib/correo/avisos.ts:294` (plantilla sin llamador) · `src/app/login/page.tsx:227` ·
norma: **LFPDPPP 2025 art. 16** (puesta a disposición) y **Reglamento art. 29 fr. I**
(datos obtenidos indirectamente: el aviso, en el primer contacto).

**Escenario.** El dueño de la flota abre `/dashboard/usuarios` y teclea a su
contralor: nombre "Ana Ruiz", correo `ana@flota.mx`, rol `contador`, teléfono
`9993700779`. `invitarUsuario` (page.tsx:92) llama `provisionarUsuario`, que
crea el usuario de Auth y escribe la fila de `app_user` con
`telefono = 5219993700779` normalizado (provisionar.ts:52-64). El propio código
declara que **no se manda nada**: *"`avisoInvitacion` existe como plantilla pero
NADIE la emite todavía"* (page.tsx:95-97), y la pantalla le dice al dueño
"pásale tú la liga". Ana no recibe correo alguno.

Cuatro horas después, un viaje pasa las `HORAS_PARA_ESCALAR` sin que el chofer
lo acepte. `escalarViajesSinAceptar` resuelve el teléfono con `telefonosJefe`
(contactos.ts:114-125, que lee `app_user.telefono` de los roles avisables) y
`escalar_viaje.ts:333` le manda a Ana un WhatsApp con el nombre del operador y
el folio. **Ese es el primer contacto de Likida con Ana**, y es de salida.
Likida no es aquí persona encargada: por su propia declaración
(`src/app/privacidad/page.tsx:50`) es **responsable** de los datos de "la
persona que administra la flota, el contralor, quien entra al panel". El único
lugar donde ese aviso se pone a disposición es el pie de `/login`
(`login/page.tsx:227`) — una pantalla a la que Ana puede no entrar nunca.

**Consecuencia.** Likida trata (y transfiere a Supabase, Meta y —si algún día se
enciende `avisoInvitacion`— a Resend) el nombre, correo y celular de una persona
que no se los dio, y le escribe, antes de haberle informado nada. La expuesta
directa es Likida, no el cliente: es su propio sombrero de responsable.

**Intento de refutación.** ¿No basta con que el aviso esté publicado en
`/privacidad`? Publicarlo no es ponerlo a disposición del titular concreto; el
Reglamento art. 29 fr. I fija el momento —el primer contacto— y aquí el primer
contacto existe y es un mensaje de Likida. ¿Y el gate de `ponerAvisoADisposicion`?
Solo cubre al chofer, en el camino de entrada de WhatsApp
(`processor.ts:617`), y a la cuenta de oficina no la toca.

**Causa raíz probable.** El alta de usuarios se diseñó como puerta de acceso
(quién puede entrar) y no como recolección de datos personales de un tercero.

---

### [ALTO · REINCIDENTE] Consentimiento tácito donde la ley pide expreso, sobre dato patrimonial
`src/lib/likida/privacidad.ts:527-528` y `:221` · `src/lib/likida/processor.ts:617-636`
· norma: **LFPDPPP 2025 art. 7 párrafo quinto** (datos financieros o
patrimoniales: consentimiento expreso) y **art. 2 fr. IV**.

**Verificación de reincidencia:** el texto está intacto. Sigue clasificando la
revisión de duplicados como finalidad **NO necesaria** (privacidad.ts:527-528) y
sigue sin existir un "responde ACEPTO": `ponerAvisoADisposicion` devuelve
`'puesto'` y `processor.ts:638` continúa en el mismo turno.

**Escenario.** Juan manda su primera foto. El gate pone el aviso (bien) y el
procesamiento sigue de inmediato: la foto se descarga, va al modelo de visión y
`detectarAnomalias` la compara contra los comprobantes de sus viajes anteriores
— la finalidad que el aviso acaba de declarar *"NO necesaria"*. El objeto son
comprobantes de gasto de un operador identificado, que
`docs/conocimiento/11-datos-personales.md:129` califica sin matices como dato
patrimonial de esa persona física. El art. 7 párrafo quinto exige expreso, y el
art. 9 fr. IV (relación jurídica) no puede invocarse para una finalidad que el
propio aviso declara no necesaria.

**Consecuencia.** La finalidad secundaria opera sin base de licitud válida. La
expuesta directa es la flota, pero el mecanismo y el texto los escribió Likida.

**Causa raíz probable.** Separar finalidades (correcto y poco común) activó el
régimen del art. 7 párrafo quinto para la mitad no necesaria, y nadie construyó
el "ACEPTO". **Decisión del fundador: o se reclasifica la finalidad como
necesaria en el texto, o se construye el consentimiento expreso por el canal.**

---

### [MEDIO · REINCIDENTE ×2] El artículo abrogado sigue en la pantalla del cliente, y las cifras del plazo ARCO no concuerdan entre sí
`src/app/dashboard/arco/page.tsx:80` (visible al cliente) y `:23` ·
`src/app/admin/compliance/page.tsx:33` · `src/lib/likida/privacidad.ts:634-637` ·
`src/lib/likida/privacidad.test.ts:396` · `src/lib/admin/escalaciones.ts:244` ·
`src/lib/likida/repo.ts:978` · `src/lib/likida/processor.ts:164` · contra
`docs/conocimiento/11-datos-personales.md:48` · norma: **LFPDPPP 2025, plazos
ARCO = art. 31** (el 32 es de la ley abrogada).

**Verificación de reincidencia:** el pase 2 lo reportó y `arco/page.tsx:80`
sigue literal. Los 81 commits de master no lo tocaron.

**Escenario.** El contralor abre `/dashboard/arco` y lee en el encabezado
*"Solicitudes de tus operadores y cómo responderlas a tiempo (LFPDPPP art. 32:
20 días hábiles)"*. Es el artículo de la ley **abrogada**, en la pantalla que
existe para cumplir la vigente — y la tabla de correspondencia del propio repo
(11-datos-personales.md:48) dice que el vigente es el 31. Las cifras tampoco
cierran: `privacidad.ts:635` afirma *"La LFPDPPP art. 32 fija 15"*,
`DIAS_HABILES_ARCO = 20` (privacidad.ts:638), el aviso promete *"20 … y 15 días
hábiles más"* (privacidad.ts:561), el comentario de `repo.ts:978` dice 15 y el
nombre de la prueba dice *"venceArco suma 15 DÍAS HÁBILES (LFPDPPP art. 32)"*
(privacidad.test.ts:396) sobre una función cuyo default es 20. Y **no existe
ficha en `normas/`** para el plazo: hay `lfpdppp-15-16`, `-2-XII-XX`, `-26-II` y
`-59`, ninguna del 31.

**Consecuencia.** `vence_en` —el reloj con el que la flota se defiende de una
sanción por no contestar— se calcula contra un número que ninguna fuente
primaria respalda dentro del repo, y el cliente lee en pantalla un fundamento
que ya no existe. Un verificador que lea esa línea concluye que el obligado está
razonando con la ley anterior, que es en sí mismo lo que este rubro persigue.

**Causa raíz probable.** Herencia textual de las auditorías 12-16, copiada hacia
adelante; el corpus `normas/` nunca recibió la ficha que la volvería verificable.

---

### [MEDIO · REINCIDENTE, con superficie NUEVA] Carta Porte trata RFC y licencia federal del operador, y ninguno de los dos está en el catálogo del aviso
`src/lib/likida/carta_porte.ts:231-234` · `src/lib/likida/carta_porte_datos.ts:68`
y `:110-111` · `src/app/dashboard/carta-porte/vista.tsx:114` ·
`src/lib/likida/administracion.ts:220-223` · contra `src/lib/likida/privacidad.ts:210`
(simplificado) y `:510-515` (integral) · norma: **LFPDPPP 2025 art. 15 fr. II y III**.

**Escenario.** El jefe abre `/dashboard/carta-porte`. `datosCartaPorte`
(carta_porte_datos.ts:68) trae `operador:operador_id (nombre, rfc, licencia)` y
el mapeo de los 37 campos (carta_porte.ts:231-234) llena `operador_nombre`,
`operador_rfc`, `num_licencia` y `nombre_figura`; la vista pinta el nombre en
pantalla (vista.tsx:114) y el validador escribe fallas que citan al operador por
su nombre (`carta_porte.ts:411`: *"El operador «Juan Pérez» no trae número de
licencia…"*). Ahora leo el catálogo del art. 15 fr. II: el simplificado dice
*"tu nombre y teléfono, las fotos de comprobantes … y los avisos del viaje"*
(privacidad.ts:210); el integral suma *"contenido de tus mensajes, viajes y
liquidaciones"* (privacidad.ts:510-515). **RFC del operador, número de licencia
federal, tipo y vigencia de la licencia y número de empleado no aparecen en
ninguno de los dos**, y los cuatro se capturan y guardan
(`administracion.ts:220-223`, `repo.ts` `actualizarRfcOperador`). La finalidad
—cumplir el complemento Carta Porte— tampoco está enunciada, y el art. 11
vigente perdió la válvula de "compatible o análogo".

**Consecuencia.** El titular no puede tomar la decisión informada que el art. 14
persigue sobre datos que sí se tratan, y el renglón que la autoridad revisa
primero está incompleto justo donde el producto acaba de crecer. El RFC es dato
personal por declaración del propio repo (`src/lib/llm/models.ts:22`).

**Causa raíz probable.** El aviso se redactó contra el producto de comprobantes;
cada módulo nuevo (Carta Porte, agentes) amplía el tratamiento y nadie toca el
texto. **Es cuestión de REDACCIÓN: decisión para el fundador**, mecánica (cinco
renglones).

---

### [MEDIO · REINCIDENTE] Sentry recibe el nombre de un operador sin redactar, y el anexo de subencargados afirma lo contrario
`src/lib/likida/crear_viaje_wa.ts:812-816` · `src/lib/logger.ts:49-57` y `:136-152`
· `src/lib/correo/enviar.ts:113` · `docs/conocimiento/52-anexo-subencargados.md`
(tabla "La cadena real", renglón 5) · contra `src/lib/likida/privacidad.ts:585` ·
norma: **LFPDPPP 2025 art. 15 fr. II y III; Reglamento arts. 54-55**.

**Verificación de reincidencia:** intacto. `logger.ts:49-57` sigue definiendo
`SENSIBLE` como la alternancia de UUID + RFC + teléfono; no hay regla de nombre
ni de correo.

**Escenario.** Dos choferes se llaman "Juan Pérez" en la misma flota. El jefe
escribe por WhatsApp *"nuevo viaje para Juan Pérez, Puebla a Monterrey"*.
`resolverOperadorPorNombre` detecta la ambigüedad y emite
`logger.error('operador.nombre_ambiguo', { tenantId, buscado: q, … })`
(crear_viaje_wa.ts:812-816), donde `q` **es el nombre de la persona**.
`redactarTexto` (logger.ts:92-98) cubre UUID (huella), RFC (`[RFC]`) y teléfono
(`[TEL]`) y **no cubre nombres**; `emit` replica todo `warn`/`error` a Sentry
(logger.ts:146-152). El anexo dice de Sentry *"Solo `warn` y `error`, **ya
redactados**"*, y el aviso al titular no lo menciona: su cláusula de encargados
(privacidad.ts:585) enumera mensajería, alojamiento y modelos de lenguaje, y
nada más.

**Consecuencia.** Un dato personal identificable sale a un subencargado que el
aviso no declara y sobre el que el titular no tiene camino de revocación. Poco
volumen, pero rompe una garantía escrita en el anexo.

**Anexo de la misma familia, dicho con su límite:** `enviar.ts:113` mete a
`logger.error` 200 caracteres del cuerpo de error de Resend. El anexo afirma que
"el correo del destinatario NO se escribe en los logs (`enviar.ts`)"; esa
garantía descansa por completo en que Resend nunca eco de la dirección en su
mensaje de error —una lista de supresión o un rebote es justo donde la
devolvería—, y el redactor no cubre correos. **No lo cuento como hallazgo aparte
porque no puedo escribir el escenario con un cuerpo de error real desde aquí**;
lo dejo anotado porque el guardarraíl no está en el código, está en un supuesto.

---

### [MEDIO · REINCIDENTE] La cláusula de encargados describe "los modelos que leen las fotos" y por ahí sale bastante más
`src/lib/likida/privacidad.ts:585` · `src/lib/agents/chat-tools.ts:117` ·
`src/app/api/dashboard/chat/route.ts:65-69` · `src/lib/agents/analista.ts` ·
norma: **LFPDPPP 2025 art. 15 fr. II y III**.

**Verificación de reincidencia:** `chat-tools.ts:117` sigue mandando
`operador: v.operadorNombre` y `chat/route.ts:69` sigue recortando el adjunto a
`16_000` caracteres. (Lo que sí murió: el asistente de IA de `/admin` fue
borrado en `d25b93e`, así que la superficie hacia el modelo **no creció** este
ciclo — siguen siendo los tres puntos de entrada de siempre: `intake/ocr.ts`,
`agents/run.ts` y `agents/analista.ts`.)

**Escenario.** El contralor abre el chat del panel y escribe "¿cómo van los
viajes de esta semana?". La tool `viajes_flota` devuelve al modelo, entre otros
campos, `operador: "Juan Pérez"` (chat-tools.ts:117). Después sube un archivo
"para que lo analices": `chat/route.ts:69` recorta su extracto a 16,000
caracteres y lo manda al modelo. Si ese archivo es una nómina o un padrón de
choferes, ese contenido viaja a OpenRouter bajo una cláusula que solo habla de
*"los modelos de lenguaje que **leen las fotos**"* (privacidad.ts:585).

**Consecuencia.** Es remisión a persona encargada (no requiere consentimiento,
art. 2 fr. XX), pero la descripción del aviso queda materialmente más angosta
que el tratamiento real, y no hay guardia de tipo ni de contenido en el adjunto.

**Causa raíz probable.** La cláusula se redactó cuando el único camino al modelo
era el OCR; el chat del panel abrió un segundo camino de entrada libre.

---

### [BAJO] La bandera de oposición se enciende y no hay un solo escritor que la apague
`supabase/migrations/0100_oposicion_decision_automatizada.sql:17-18` ·
`src/lib/likida/processor.ts:182-186` (único escritor) ·
`src/lib/likida/repo.ts:1084-1112` · norma: **LFPDPPP 2025 art. 7 último párrafo**
(revocación) y la promesa de la propia migración.

**Escenario.** La migración declara: *"se levanta poniéndola en NULL, decisión
de la flota con el titular"* (0100:18). Juan se opone en enero; en marzo le dice
a su jefe "ya está bien, déjenlo automático". La flota abre `/dashboard/arco`,
`/dashboard/operadores`, `/admin/compliance`: en ninguna aparece la bandera, y
`grep -rn "oposicion_automatizada" src/` devuelve exactamente cuatro sitios —el
tipo (`types/likida.ts:169`), la lectura (`repo.ts:74,86`), el consumo
(`desde_db.ts:54`) y el ÚNICO escritor (`processor.ts:184`), que solo la
enciende con `.is('oposicion_automatizada', null)`. `resolverSolicitudArco` no
la toca. Para levantarla hace falta un UPDATE a mano en Postgres.

**Consecuencia.** Un derecho ejercido se vuelve irreversible desde el producto,
y toda liquidación de ese operador sale a `revisar` para siempre. Es deuda que
va a cobrar factura el día que un cliente tenga veinte choferes.

---

### [BAJO] La credencial de conector desactivada conserva su cifrado indefinidamente y ninguna purga la alcanza
`src/lib/likida/conectores/credenciales.ts:161-189` ·
`supabase/migrations/0104_retencion_operativa.sql:112-149` ·
`supabase/migrations/0094_conector_credencial.sql:47-80` ·
norma: **LFPDPPP 2025 art. 11**.

**Escenario.** Una flota conecta su SAP Business One: `guardarCredencial` cifra
usuario y contraseña con AES-256-GCM (`cofre.ts:66-72`) y guarda `pistas` con
los últimos 4. Seis meses después cancela el conector: `desactivarCredencial`
hace `update … set activo = false` y **no borra el `valores_cifrados`**
(credenciales.ts:177, con el motivo escrito: "para poder auditar qué acceso
existió"). `mantenimiento_de_datos` (0104:112-149) no lista
`conector_credencial`. El texto cifrado del usuario y la contraseña del ERP del
cliente se queda en la base para siempre.

**Consecuencia.** El radio de explosión de una filtración de `LIKIDA_COFRE_LLAVE`
crece con cada cliente que se va, y no hay camino de producto para pedir la
supresión. Es BAJO —el diseño es bueno (cifrado en la app, no pgcrypto; llave
solo en el entorno; CHECK que impide guardar JSON en claro) y hoy no hay clientes—
pero la decisión de conservar está tomada sin plazo ni contrapeso.

---

## Lo que revisé y está bien

- **LEG-C1 sigue cerrado, y lo verifiqué contra el árbol de hoy.** El gate está
  en `processor.ts:617`, **delante** de `if (!viajeId)` (`:638`), con su lápida
  explicando dónde vivía (`:607-613`). Los cuatro desenlaces se distinguen y el
  claim se libera solo cuando el fallo es nuestro (`:618-635`). No es
  reincidente esta ronda.
- **LEG-A1 (los hitos) está CERRADO.** El aviso simplificado ya enumera el dato
  con las palabras que el chofer manda (privacidad.ts:210) y la finalidad, entre
  las **no necesarias** (`:221`, `:515`, `:531`), con el límite dicho: *"No hay
  GPS ni rastreo del teléfono"*. Verifiqué que ese "no hay GPS" siga siendo
  cierto: los conectores GPS declaran `leer_posiciones` (`conectores/gps.ts:95`)
  pero **nadie escribe `posicion`** — `grep` no devuelve un escritor. El día que
  alguien cablee esa capacidad, esa frase del aviso deja de ser verdad y no hay
  nada que lo vigile.
- **E5 / mig. 0104: la retención corre de verdad, y la página promete
  exactamente lo que las funciones borran.** Crucé los seis plazos uno por uno:
  WhatsApp procesado 30 d (0104:129), idempotencia de API 7 d (`:131`), intake
  por correo 90 d (`:132`), corridas de agentes 180 d (`:133`),
  `wa_conversacion` 180 d (`:134`), `codigo_pendiente` 180 d (`:135`) — contra
  `src/app/privacidad/page.tsx:100`, que los enumera con esas mismas cifras. El
  cron existe y falla cerrado sin `CRON_SECRET`
  (`api/cron/purgar/route.ts:57-63`), está en `vercel.json` a las 04:15, y
  respeta el interruptor global. Y la 0104 **declara por escrito lo que NO
  purga y por qué** (`:34-49`), incluido no tocar nada fiscal por el CFF 30.
  Es el mejor trabajo del rubro este ciclo.
- **Resend está declarado en los dos documentos, con lo que de verdad recibe.**
  `52-anexo-subencargados.md` lo pone como renglón 6 distinguiendo salida y
  **entrada** (el correo completo del proveedor y sus adjuntos, almacenados en
  Resend antes de llegarnos), y añade el eslabón 6a (AWS SES) con la evidencia
  del DNS. `/privacidad` lo cubre en su cláusula de encargados
  (`page.tsx:79`: "envío de correo para los avisos del panel").
- **Ningún correo saliente lleva datos del operador ni cifras.** Revisé los
  siete avisos de `correo/avisos.ts`: llevan conteos, folios, número económico y
  nombre de flota. `avisoHuerfanos` declara por escrito que el monto no viaja
  porque un correo se reenvía (`avisos.ts:186-190`), y hay prueba que escanea
  buscando `$`/`MXN`/`peso`. `alertarOperador` pasa **todo** el detalle por
  `redactarTexto` antes de que salga a Resend (`observability/alerta.ts:83`).
- **El webhook de correo entrante no guarda nada fuera de política.** Firma Svix
  **antes** de leer el cuerpo (`api/correo/entrante/route.ts:76-92`), tenant
  desde el destinatario y nunca desde el `from` (`:116`), no registra el correo
  del remitente a propósito (`:119-120`), tope doble de adjunto —declarado y
  real— de 4 MB (`:225-238`), y solo persiste el XML del CFDI, que es dato
  fiscal con obligación de conservación. El único identificador que guarda es
  `email_id` en `correo_procesado`, que además se purga a los 90 días.
- **El buzón es una credencial bien hecha:** 24 caracteres base32 de Crockford
  desde `randomBytes` con rechazo por módulo (`correo/buzon.ts:47-58`), y
  `tokenDeDestinatarios` devuelve `null` si hay dos buzones en el mismo correo
  en vez de adivinar a qué flota entra el gasto (`:122-130`).
- **«Mándate una prueba» no es un relay abierto:** el destino sale de
  `app_user.email` del propio usuario de la sesión, nunca del formulario
  (`agentes/seccion-notificaciones.tsx:164-173`), con re-gateo de rol dentro de
  la server action y turno por (usuario, agente).
- **El mecanismo de la oposición, hasta donde llega, está bien construido.**
  `timestamptz` y no boolean para poder demostrar **desde cuándo** se honra
  (0100:14-18); el escritor solo enciende si estaba en NULL; y `desde_db.ts:44-52`
  **quitó** el `.catch(() => null)` con el razonamiento correcto escrito al lado.
  El problema es la última pieza, no el diseño.
- **La constancia del art. 16 sigue bien modelada** (mig. 0033, reserva vs
  constancia con TTL) y **la versión del aviso se deriva del texto**
  (`versionAviso`, privacidad.ts:283-290), así que el art. 15 fr. VI se cumple
  por construcción.
- **Sin bóveda de credenciales fiscales.** Volví a buscar e.firma, CSD, CIEC y
  contraseñas del SAT en el catálogo de 19 conectores (`conectores/erp.ts`,
  `gps.ts`, `peaje.ts`): **no existe ninguna**. Es la decisión correcta del §9.5
  y elimina el tipo penal del art. 62.
- **Degradación honesta en todo el rubro:** liga rota → se dice
  (privacidad.ts:265-267); sin razón social → `null` en vez de aviso a medias;
  contacto art. 29 ausente → sección marcada `pendiente`; `/aviso/[tenant]` es
  `noindex` con `notFound()` indistinguible; `/privacidad` marca en rojo la
  razón social que falta en vez de inventarla (`privacidad/page.tsx:36-43`).
- **`sanitizarProducto`** (`intake/sanitizar.ts`) sigue descartando el valor
  entero cuando revela salud, y declarando por escrito su propio límite (la foto
  ya viajó).

## Lo que NO alcancé a revisar

- **El texto vigente del art. 31** (plazos ARCO) y el del artículo que rige la
  **Cancelación** en la ley de marzo 2025. No hay ficha en `normas/` para
  ninguno de los dos y no salí a la red; por eso los dos hallazgos que los
  tocan se limitan a lo que sí puedo probar desde el repo: que el artículo
  citado en pantalla es de la ley abrogada, que las cifras internas no
  concuerdan, y que no existe ejecutor. **Falta `normas/lfpdppp-31.yaml`
  verificada contra diputados.gob.mx antes de tocar `DIAS_HABILES_ARCO`.**
- **El régimen contractual de Resend y de OpenRouter** (anexo de subencargado,
  retención, ZDR por escrito). Es el pendiente B20 y es contractual: desde aquí
  solo confirmo que el código *pide* `data_collection:'deny'` en los tres
  puntos de entrada.
- **Cuánto tiempo conserva Resend el correo entrante** antes y después de
  entregarlo por webhook. El anexo lo reconoce como una retención que no
  controlamos; no hay forma de medirla desde el repo.
- **Las RLS efectivas de `solicitud_arco`, `operador`, `app_user` y
  `conector_credencial`** contra Postgres real: leí las políticas de las migs.
  0053 y 0094, no la aplicación. No hay credenciales en este entorno.
- **Las políticas de ciclo de vida del bucket `comprobantes`** del lado de
  Supabase Storage, fuera de las migraciones. El código no borra nada; si algo
  borra, vive allá.
- **El contrato flota↔Likida** (autorización de subcontratación, Regl. arts.
  54-55; instrucciones por escrito al encargado). Es lo que sostendría o
  tumbaría el hallazgo de `/admin/compliance`.
- `pruebas-manuales/*` — no se corren (pago real), por instrucción.
