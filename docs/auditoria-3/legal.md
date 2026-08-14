# Cumplimiento legal — auditoría 3

**Nota: 5.5/10** (antes 4). Razón del movimiento: **se atacó y subió** — LEG-C1
está cerrado y lo verifiqué línea por línea, y no encontré ningún CRÍTICO nuevo.
No llega a 6 porque una **mirada más profunda** encontró que el camino de
revocación existe como *registro* pero no como *efecto*: cuatro estructuras
(oposición, ARCO resuelto por el encargado, primer contacto de salida,
consentimiento tácito sobre dato patrimonial) sostienen promesas que el código
no cumple.

**El riesgo mayor, hoy:** el aviso le promete al chofer que puede oponerse a la
revisión automatizada de sus comprobantes, y no existe en ninguna parte del
código una bandera que apague esa revisión — la solicitud se marca "resuelta" y
el motor sigue exactamente igual.

## Hallazgos

### [ALTO] La oposición del art. 26 fr. II se registra, se contesta y no se ejecuta
`src/lib/likida/repo.ts:1082-1113` · `src/lib/likida/privacidad.ts:516-522` ·
`supabase/migrations/0053_cuentas_bitacora_arco_campanias.sql:98-117` ·
**LFPDPPP 2025 art. 26 fr. II** (y art. 31, plazos).

**Escenario.** El operador Juan Pérez recibe el aviso, que le dice literalmente
(privacidad.ts:520-522): *"tienes derecho a oponerte a que se decida así y a
pedir que una persona lo revise. Oponerte a esta revisión no detiene tu
liquidación: la empresa la hará a mano."* Escribe "no quiero que un programa
revise mis tickets, que lo revise una persona". `pideAtencionPrivacidad`
(privacidad.ts:351-361) lo caza, `tipoDeSolicitudArco` (privacidad.ts:602-609)
lo clasifica `'oposicion'`, y `registrarSolicitudArco` (repo.ts:983-1006) lo
inserta. El contralor abre `/dashboard/arco`, escribe "aceptada" y
`resolverSolicitudArco` (repo.ts:1082-1096) hace **un solo UPDATE:
`estado='resuelta'`**. La siguiente foto de Juan entra por
`processor.ts:699+`, se descarga, va al modelo de visión
(`intake/ocr.ts:225-253`) y pasa por `detectarAnomalias`
(`analytics.ts:354-376`) igual que antes. Busqué la bandera:
`grep -rn "oposicion" src/lib/likida src/lib/agents supabase/migrations` no
devuelve un solo consumidor — solo el clasificador, el regex y el CHECK de
dominio. La tabla `solicitud_arco` no tiene columna que el motor pueda leer, y
`operador` tampoco.

**Consecuencia.** El titular ejerció el único derecho que este producto activa
por sí mismo, recibió por WhatsApp la confirmación de que fue atendido
(repo.ts:1108) y su tratamiento automatizado continúa. Ante la autoridad la
responsable (la flota) tiene una constancia de haber resuelto una solicitud que
no resolvió; y no puede cumplirla aunque quiera, porque el producto no le da la
palanca — exactamente la clase de hueco que `privacidad.ts:6-8` reconoce como
propia de Likida para el aviso.

**Intento de refutación.** ¿Basta con que la flota "la haga a mano" fuera del
sistema? No: la revisión automatizada no es un paso que el contralor decida
ejecutar, es el camino por default de cada foto (`processor.ts` la corre antes
de que nadie mire). Para que la flota la apague tendría que dejar de usar el
canal con ese chofer, que es justo lo que el aviso promete que no pasará.

**Causa raíz probable.** El ARCO se modeló como bandeja de tickets (estado +
resolución de texto) y no como una preferencia del titular que el motor tenga
que consultar.

---

### [ALTO] El primer contacto con el titular es de SALIDA y no pasa por el gate del aviso
`src/lib/likida/processor.ts:510` (único llamador de `ponerAvisoADisposicion`) ·
`src/lib/likida/operacion.ts:585` → `src/lib/likida/notificar.ts:170` ·
`src/lib/likida/escalar_viaje.ts:228-232` ·
`src/lib/likida/agentes/cobranza.ts:261` ·
`src/lib/likida/administracion.ts:214-233` ·
**LFPDPPP 2025 arts. 14 y 16 fr. II**.

**Escenario.** El jefe da de alta a Juan Pérez en Despacho
(`dashboard/despacho/page.tsx:168` → `crearOperador`, administracion.ts:214-233:
nombre, teléfono, número de empleado, licencia, tipo y vigencia). Le despacha un
viaje: `crearViaje` (operacion.ts:585) llama a `avisarAlChofer`, que manda por
Meta una plantilla con folio, origen, destino y **anticipo**
(notificar.ts:170-172). A las 5 h sin respuesta, `escalar_viaje.ts:228-232` le
manda un recordatorio; el agente de cobranza le manda los suyos
(cobranza.ts:261). Juan nunca contesta. **Nunca recibe el aviso de privacidad**:
`ponerAvisoADisposicion` se llama desde un único sitio, `processor.ts:510`, en
el camino de ENTRADA. Lo verifiqué:
`grep -rn "ponerAvisoADisposicion" src/` → processor.ts:216 (definición) y
processor.ts:510 (uso).

**Consecuencia.** El producto obtiene los datos del titular por medio
electrónico y los usa —incluso para escribirle— antes de ponerle a disposición
el aviso que el art. 16 fr. II exige. LEG-C1 izó el gate delante de la rama
sin-viaje y eso está bien resuelto; lo que queda es que el gate solo vigila una
de las dos direcciones del canal, y la de salida es la que llega primero en el
flujo normal (jefe despacha → chofer recibe → chofer contesta).

**Intento de refutación.** ¿No cubre esto la relación laboral? El art. 9 fr. IV
exime del **consentimiento**, no del **deber de informar** —
`docs/conocimiento/11-datos-personales.md:172` lo dice con esas palabras: *"El
aviso se pone a disposición siempre"*. Y si el aviso ya lo dio la flota en el
contrato de trabajo, entonces el mecanismo de `ponerAvisoADisposicion` sobra
entero, cosa que el propio repo no sostiene (mig. 0018, encabezado).

**Causa raíz probable.** El gate se diseñó como precondición del *tratamiento de
la foto*, no como precondición del *primer contacto con el titular*.

---

### [ALTO] Likida resuelve solicitudes ARCO de cualquier flota y firma la respuesta con la razón social de la flota
`src/app/admin/compliance/page.tsx:28-45` · `src/lib/likida/repo.ts:1103-1108` ·
`supabase/migrations/0053_cuentas_bitacora_arco_campanias.sql:98-117` ·
**LFPDPPP 2025 art. 2 fr. XX** (persona encargada) y **Reglamento art. 50**
(tratar solo conforme a instrucciones del responsable).

**Escenario.** Javier abre `/admin/compliance`, ve las solicitudes de TODAS las
flotas (page.tsx:148-181, sin filtro de tenant, a propósito), escribe una
resolución y la envía. `accionResolver` (page.tsx:28-45) resuelve el tenant a
partir de la solicitud y llama `resolverSolicitudArco`, que manda al titular:
*"Tu solicitud de derechos ARCO fue atendida por **{razón social de la flota}**:
…"* (repo.ts:1108). El chofer recibe una respuesta que atribuye a su patrón una
decisión que su patrón nunca tomó. Y la fila no permite distinguirlo después: la
tabla `solicitud_arco` **no tiene columna de actor** — solo `resolucion` (texto
libre), `resuelta_en` y `estado`. `anotar()` (la bitácora de
`administracion.ts`) tampoco se llama desde ninguno de los dos caminos.

**Consecuencia.** El encargado ejerce por cuenta propia una obligación
indelegable del responsable, y el sistema no conserva evidencia de quién la
ejerció. En una verificación, la flota no puede probar que contestó ella, ni
Likida puede probar que actuó por instrucción. `privacidad.ts:366-370` ya
declara la doctrina correcta —*"Likida no puede resolver un ARCO por su cuenta:
es persona encargada y actúa por instrucciones del responsable"*— y esta
pantalla la contradice.

**Intento de refutación.** ¿Es una pantalla de soporte para destrabar a un
cliente? Puede serlo, pero entonces el texto que le llega al titular no puede
decir "atendida por {la flota}", y la fila tendría que registrar quién la
tocó. Hoy no hay ninguna de las dos cosas.

**Causa raíz probable.** `/admin/compliance` nació (auditoría 14-15) como la
única pantalla de ARCO y conservó el poder de escritura cuando la 16 le dio a la
flota la suya (`/dashboard/arco`).

---

### [ALTO · REINCIDENTE — LEG-A1] Los hitos del chofer (0090) no están en el aviso, ni como dato ni como finalidad
`src/lib/likida/hitos_viaje.ts:92-111` · `src/lib/likida/processor.ts:1572-1577`
· `src/lib/likida/analytics.ts:901-927` ·
`src/app/dashboard/agentes/conductores/vista.tsx:24-26` · contra
`src/lib/likida/privacidad.ts:204, 213-215, 496-498, 505-512` ·
**LFPDPPP 2025 art. 15 fr. II y III, y art. 11**.

**Verificación de reincidencia:** `git log --oneline -- src/lib/likida/privacidad.ts`
devuelve como último commit `4e18233` (feat de chat), anterior a esta ronda. El
fixer H nunca dejó commit; el texto del aviso está intacto.

**Escenario.** Juan escribe "ya llegué". `interpretarHito`
(hitos_viaje.ts:73-78) lo reconoce, `sellarHito` (hitos_viaje.ts:92-111) escribe
`viaje.llegada_en = now()`, y `getEventosConductores`
(analytics.ts:909-927) lo aplana a una bitácora que la pantalla del jefe de
tráfico pinta nominalmente: *"Juan Pérez avisó que llegó (F-1204)"*
(conductores/vista.tsx:24). Ahora leo el aviso: el catálogo del art. 15 fr. II
dice *"tu nombre y teléfono, y las fotos de comprobantes de gasto"*
(privacidad.ts:204) y en el integral *"nombre, teléfono, fotos, contenido de tus
mensajes, viajes y liquidaciones"* (privacidad.ts:496-498). Las finalidades
(fr. III) son liquidar, comprobar ante el SAT, responder por WhatsApp, revisar
duplicados y medir el servicio (privacidad.ts:213-215, 505-512). **El
seguimiento horario de dónde va y qué está haciendo una persona no es ninguna de
esas.**

**Consecuencia.** Es tratamiento para una finalidad no prevista, y el art. 11
vigente perdió la válvula de "compatible o análogo"
(`docs/conocimiento/11-datos-personales.md:145-149`): el test es binario y este
uso cae del lado malo. Para el titular, un registro nominal de su jornada que
nadie le dijo que se llevaba; para la flota, tratamiento sin base informada.

**Intento de refutación.** ¿Lo cubre *"el contenido de tus mensajes"* del
integral? Cubre el DATO (la frase que escribió), no la FINALIDAD (sellar y
exhibir su jornada en un tablero de seguimiento). Y ni siquiera el dato aparece
en el simplificado, que es el único documento que el chofer recibe de verdad.

**Causa raíz probable.** El aviso se redactó cuando el producto solo leía
comprobantes; cada agente nuevo (F4) amplía el tratamiento y nadie toca el texto.
**Es cuestión de REDACCIÓN del aviso: decisión para el fundador.**

---

### [ALTO] Consentimiento tácito donde la ley pide expreso, sobre dato patrimonial
`src/lib/likida/privacidad.ts:509-511` y `215` ·
`src/lib/likida/processor.ts:510-529` ·
**LFPDPPP 2025 art. 7 párrafo quinto** (datos financieros o patrimoniales:
consentimiento expreso) y **art. 2 fr. IV** (voluntad libre, específica e
informada).

**Escenario.** El aviso integral clasifica, con sus palabras, la detección de
duplicados como **finalidad NO necesaria**: *"Finalidades que NO son necesarias,
y a las que puedes oponerte sin que eso afecte tu liquidación: · Revisar si un
comprobante viene repetido o alterado…"* (privacidad.ts:509-510). Su objeto son
los comprobantes de gasto de un operador identificado, que
`docs/conocimiento/11-datos-personales.md:129` califica sin matices: *"Un
comprobante de diésel, caseta o viático de un operador identificado es un dato
patrimonial de esa persona física. No es opinable"*. El art. 7 párrafo quinto
exige **consentimiento expreso** para datos patrimoniales, salvo las excepciones
de los arts. 9 y 36 — y el art. 9 fr. IV (relación jurídica) no puede invocarse
para una finalidad que el propio aviso declara *no necesaria*. En el código, el
tratamiento arranca sin esperar nada: `ponerAvisoADisposicion` manda el texto y
`processor.ts:510-529` continúa en el mismo turno; no hay "responde ACEPTO", ni
casilla, ni signo inequívoco de voluntad. Consentimiento tácito puro.

**Consecuencia.** La finalidad secundaria opera sin base de licitud válida. El
expuesto directo es la flota (responsable), pero el mecanismo lo diseñó Likida y
el texto que crea la clasificación vive en `privacidad.ts`.

**Intento de refutación.** ¿Y si la revisión de duplicados es en realidad
*necesaria* (el patrón tiene derecho a verificar comprobaciones de gasto)? Es
defendible — y sería el arreglo más barato. Pero hoy el aviso dice lo contrario,
y un aviso que se contradice con la base de licitud invocada es peor que
cualquiera de las dos posturas sostenida con firmeza. **Es una decisión del
fundador: o se reclasifica la finalidad como necesaria en el texto, o se
construye un consentimiento expreso por el canal.**

**Causa raíz probable.** Se redactó la separación de finalidades (correcta y
poco común) sin advertir que separar activa el régimen del art. 7 párrafo quinto
para la mitad no necesaria.

---

### [MEDIO · REINCIDENTE] El artículo abrogado en pantalla, y tres cifras del plazo ARCO que no concuerdan
`src/app/dashboard/arco/page.tsx:23` y **`:80`** (visible para el cliente) ·
`src/app/admin/compliance/page.tsx:25` · `src/lib/likida/repo.ts:976-977` ·
`src/lib/likida/processor.ts:156-157` · `src/lib/likida/privacidad.ts:611-615` ·
`src/lib/likida/privacidad.test.ts:367` ·
`supabase/migrations/0053_…sql:96, 120` ·
**LFPDPPP 2025: plazos ARCO = art. 31**, no 32
(`docs/conocimiento/11-datos-personales.md:48`, tabla de correspondencia del
propio repo).

**Escenario.** El contralor abre `/dashboard/arco` y lee en el encabezado
*"(LFPDPPP art. 32: 20 días hábiles)"*. Cita el artículo de la ley **abrogada**
en la pantalla que existe para cumplir la vigente. Y las cifras no cierran entre
sí: `privacidad.ts:612` afirma *"La LFPDPPP art. 32 fija 15"*, `DIAS_HABILES_ARCO
= 20` (privacidad.ts:615), el aviso integral promete *"20 días hábiles… y 15 días
hábiles más"* (privacidad.ts:538), el comentario de `repo.ts:976` dice 15 y el de
`repo.ts:1047` dice 20. Además **no existe ficha en `normas/`** para el plazo:
hay `lfpdppp-15-16`, `-2-XII-XX`, `-26-II` y `-59`, ninguna del 31. Es el único
número con consecuencia jurídica del rubro que se sostiene sin fuente primaria,
en un repo cuya regla es que `normas/*.yaml` es la verdad.

**Consecuencia.** `vence_en` —el reloj que la flota usa para no incumplir— se
calcula contra un plazo que nadie verificó, y la pantalla enseña un fundamento
que ya no existe. Un verificador que lea esa línea concluye que el obligado está
razonando con la ley anterior.

**Causa raíz probable.** Herencia textual de las auditorías 12-16, que se
escribieron con la numeración vieja y se copiaron hacia adelante.

---

### [MEDIO] El catálogo del art. 15 fr. II no incluye licencia, número de empleado ni RFC del operador
`src/lib/likida/administracion.ts:216-224` · `src/lib/likida/repo.ts:1013-1019` ·
`supabase/migrations/0053_…sql:172-181` · contra `src/lib/likida/privacidad.ts:204`
(simplificado) y `:496-498` (integral) · **LFPDPPP 2025 art. 15 fr. II**.

**Escenario.** El alta de un operador guarda `licencia`, `licencia_tipo`,
`licencia_vence` y `numero_empleado` (administracion.ts:220-223), y
`actualizarRfcOperador` (repo.ts:1013-1019) escribe el **RFC del propio chofer**
(mig. 0080). `/dashboard/operadores` los pinta con semáforo de vigencia
(operadores/vista.tsx:125-141). Ninguno de los cuatro aparece en el catálogo del
aviso, que enumera nombre, teléfono, fotos, mensajes, viajes y liquidaciones. El
RFC es dato personal por declaración del propio repo
(`src/lib/llm/models.ts:22`: *"RFC y CFDI son datos personales"*).

**Consecuencia.** El titular no puede tomar la decisión informada que el art. 14
persigue sobre datos que sí se tratan; el catálogo es incompleto justo en el
renglón que la autoridad revisa primero. **Es cuestión de REDACCIÓN: decisión
para el fundador**, aunque aquí el arreglo es mecánico (cuatro renglones).

---

### [MEDIO] La cláusula de encargados describe "los modelos que leen las fotos" y por ahí sale bastante más
`src/lib/likida/privacidad.ts:562` · `src/lib/agents/chat-tools.ts:117` ·
`src/app/api/dashboard/chat/route.ts:64-68` y `:103` ·
`src/lib/agents/analista.ts:288, 301` · **LFPDPPP 2025 art. 15 fr. II y III**.

**Escenario.** El aviso integral dice que a los encargados van *"las fotos (OCR)
y el texto"*, concretamente *"los modelos de lenguaje que **leen las fotos**"*
(privacidad.ts:562). Lo que sale de verdad hacia OpenRouter incluye, además: el
historial de conversación del chofer (`conv.ts` → `runAgent`,
processor.ts:1895), el **nombre del operador** en la herramienta `viajes_flota`
del chat del panel (chat-tools.ts:117: `operador: v.operadorNombre`), el nombre
del usuario del panel (analista.ts:288) y **hasta 16,000 caracteres de cualquier
archivo que el jefe adjunte** (chat/route.ts:68 → analista.ts:301). Si el
contralor sube una nómina o un padrón de choferes al chat "para que lo analices",
ese contenido viaja a un modelo externo bajo una cláusula que solo habla de
fotos de comprobantes.

**Consecuencia.** Es remisión (no requiere consentimiento, art. 2 fr. XX), pero
la descripción del aviso queda materialmente más angosta que el tratamiento
real, y no hay ninguna guardia de tamaño/tipo en el adjunto. Es el mismo defecto
que el hallazgo de hitos, en otra superficie.

**Causa raíz probable.** La cláusula se redactó cuando el único camino al modelo
era el OCR; el chat del panel (12-ago) abrió un segundo camino de entrada libre.

---

### [MEDIO] Sentry recibe el nombre de un operador sin redactar, y el anexo afirma lo contrario
`src/lib/likida/crear_viaje_wa.ts:812-816` · `src/lib/logger.ts:51-58` y
`:146-149` · `docs/conocimiento/52-anexo-subencargados.md:62` ·
**LFPDPPP 2025 art. 15 fr. II/III; Reglamento arts. 54-55** (subencargados).

**Escenario.** Dos choferes se llaman "Juan Pérez" en la misma flota. El jefe
escribe por WhatsApp *"nuevo viaje para Juan Pérez, Puebla a Monterrey"*.
`resolverOperadorPorNombre` detecta la ambigüedad y emite
`logger.error('operador.nombre_ambiguo', { tenantId, buscado: q, … })`
(crear_viaje_wa.ts:812-816), donde `q` **es el nombre de la persona**. El
redactor de `logger.ts` cubre UUID (huella), RFC (`[RFC]`) y teléfono (`[TEL]`)
— `SENSIBLE`, logger.ts:51-58 — y **no cubre nombres**. `emit` replica todo
`warn`/`error` a Sentry (logger.ts:146-149). El anexo de subencargados dice de
Sentry: *"Solo `warn` y `error`, **ya redactados**"* (52-anexo:62), y el aviso al
titular ni lo menciona (enumera mensajería, alojamiento y modelos de lenguaje,
privacidad.ts:562).

**Consecuencia.** Un dato personal identificable sale a un cuarto encargado que
el aviso no declara y sobre el que el titular no tiene camino de revocación. Es
poco volumen, pero rompe una garantía escrita.

**Intento de refutación.** ¿Es identificable un nombre suelto? Sí (art. 3:
persona *identificada o identificable*), y llega acompañado de la huella estable
del tenant, que agrupa todos los eventos de la misma flota.

---

### [MEDIO] No hay plazo de conservación ni supresión: lo único que se borra son las filas de idempotencia
`src/app/api/cron/purgar/route.ts:24-38, 51, 68-70` ·
`supabase/migrations/0072_purga_y_consolidado_ia.sql:136` ·
`supabase/migrations/0001…sql:78-84` ·
**LFPDPPP 2025 art. 11** (limitación de finalidades / principio de calidad).

**Escenario.** El único borrado programado del sistema es
`delete from wa_mensaje_procesado` a 30 días (0072:136), y el propio cron declara
que **no borra nada más** (`llmCostoPurgado: false`, route.ts:37). Persisten sin
techo: las imágenes de comprobantes en Storage (`intake/almacen.ts:66`), las
filas `huerfano` con su foto, `wa_conversacion` —que conserva `telefono` aunque
el `operador_id` quede en NULL al borrar al chofer (0001:81-82)— y la ficha del
operador dado de baja (`activo=false` es la única inactivación). El aviso declara
un **piso** de cinco años (CFF 30, privacidad.ts:507 y 547) y ningún **techo**.

**Consecuencia.** Datos que dejaron de ser necesarios siguen tratados, y en una
solicitud de cancelación no hay a qué apuntar: `resolverSolicitudArco` no borra
nada (mismo hallazgo estructural que la oposición). Mitiga —y por eso es MEDIO y
no ALTO— que `wa_conversacion` recorta el historial a `MAX_TURNS`
(`conv.ts:306, 384`), así que el contenido de los mensajes no crece indefinido.

---

### [BAJO] "Queda registrada tu solicitud" se manda ANTES de registrarla, y el registro es best-effort
`src/lib/likida/processor.ts:150-167` · `src/lib/likida/repo.ts:1000-1005` ·
`src/lib/likida/privacidad.ts:402-408` · **LFPDPPP 2025 art. 31**.

**Escenario.** El chofer escribe PRIVACIDAD. `atenderPrivacidad` manda primero
la respuesta (processor.ts:153), que termina en *"Queda registrada tu solicitud
para la empresa"* (privacidad.ts:407), y **después** llama
`registrarSolicitudArco` (processor.ts:160) **descartando su valor de retorno**.
Si el insert falla, `repo.ts:1000-1003` devuelve `false` y solo escribe un log.
Resultado: el titular tiene la promesa, `/dashboard/arco` sigue vacío, y el reloj
de `vence_en` nunca arranca.

**Consecuencia.** Una constancia falsa hacia el titular — la misma familia que
la mig. 0033 cerró para el aviso (registrar como hecho algo que no ocurrió),
reabierta en el camino ARCO. Es BAJO por probabilidad, no por gravedad.

---

## Inventario de salidas de datos personales

| Qué dato | A dónde sale (`archivo:línea`) | ¿Lo cubre el aviso? | ¿Hay revocación? |
|---|---|---|---|
| Teléfono, texto de mensajes, fotos de comprobantes | Meta / WhatsApp Cloud API — `src/lib/meta/client.ts:9, 89, 223, 413` | **Sí** — "el proveedor de mensajería de WhatsApp" (`privacidad.ts:562`) | Registro sí (PRIVACIDAD → `solicitud_arco`); efecto **no** (nada apaga el canal) |
| Foto completa del comprobante + montos, folios, RFC del emisor | OpenRouter → modelo de visión — `src/lib/likida/intake/ocr.ts:225-253`, `src/lib/llm/openrouter.ts:417` con `data_collection:'deny'` (`:212-216`) | **Sí** — "los modelos de lenguaje que leen las fotos… se les pide que no retengan" | Efecto **no**: la oposición del art. 26 fr. II no se ejecuta (hallazgo 1) |
| Historial de conversación del chofer | OpenRouter → agente de liquidación — `processor.ts:1895` → `openrouter.ts:715` | **Parcial** — el dato está en el catálogo del integral (`:497`), el destino se describe como "los que leen las fotos" | Igual que arriba |
| **Nombre del operador** + folio, ruta, anticipo por viaje | OpenRouter → analista del panel — `src/lib/agents/chat-tools.ts:117` | **No explícitamente** | No |
| **Archivo arbitrario del panel** (hasta 16 k caracteres) | OpenRouter — `src/app/api/dashboard/chat/route.ts:68` → `analista.ts:301` | **No** | No |
| **Nombre del operador** (caso ambiguo) | Sentry (EE. UU.) — `crear_viaje_wa.ts:812-816` vía `logger.ts:146-149` | **No** (Sentry no está en el aviso; el anexo lo declara "ya redactado" y no lo está) | No |
| Teléfono, RFC, UUID en logs | Sentry — `logger.ts:92-98` | n/a: **redactados/huellados** antes de salir | n/a |
| Todo lo persistido (gastos, montos, folios, RFC, liquidaciones, hitos) | Supabase — `src/lib/supabase/admin.ts` | **Sí** — "el de alojamiento de la base de datos" | Registro sí; borrado **no** existe (hallazgo 10) |
| Datos en tránsito y cómputo | Vercel — hosting | **Implícito** en "alojamiento"; no nombrado | n/a |
| Nombre del operador, folio, diferencia, anticipo | CSV/PDF al contralor y su contador — `src/lib/likida/export.ts:68`, `api/export/liquidaciones/route.ts` | **Sí** — "al contador de la empresa para cumplir sus obligaciones" (`privacidad.ts:563`) | n/a (transferencia sin consentimiento, art. 36) |
| `titular_ref` (teléfono) + nombre + tipo de solicitud, **cruzando tenants** | `/admin/compliance` (superadmin de Likida) — `src/app/admin/compliance/page.tsx:155-160` | **Parcial**: Likida como encargada está declarada; que **resuelva** el ARCO, no (hallazgo 3) | n/a |
| Razón social y domicilio del responsable, contacto art. 29 | Página pública `/aviso/[tenant]` — `src/app/aviso/[tenant]/page.tsx:64-71` | Sí, es el aviso mismo | n/a |

## Lo que revisé y está bien

- **LEG-C1 está cerrado y vivo.** El gate está en `processor.ts:510`, delante de
  `if (!viajeId)` (`:531`); la lápida en `:690-692` explica dónde vivía. Recorrí
  las cuatro ramas que quedan detrás (XML consolidado `:555`, XML 1:1 `:561`,
  foto huérfana `:581`, texto al agente `:1895`) y todas están después del gate.
  El único camino que trata datos antes es el de la cuenta de **oficina**
  (`:405-475`), que no es el titular-chofer, y el chequeo global de PRIVACIDAD
  (`:374-385`), que es el ejercicio de un derecho. Y el gate **falla cerrado**
  con los cuatro desenlaces distinguidos (`:214`, `:511-528`), liberando el claim
  solo cuando el fallo es nuestro.
- **La constancia del art. 16 está bien modelada.** La separación
  reserva/constancia de la mig. 0033 (`aviso_privacidad_claim_en` vs
  `aviso_privacidad_en`) impide tanto la constancia falsa como la destrucción de
  una verdadera, con TTL de 5 min. Es de lo mejor del repo.
- **La versión del aviso se deriva del texto** (`versionAviso`,
  privacidad.ts:255-262), así que un cambio de la flota reenvía solo — el art. 15
  fr. VI cumplido por construcción y no por memoria de alguien.
- **La degradación honesta.** Liga rota → se dice que no la hay
  (`privacidad.ts:237-239`); sin razón social → `null` en vez de aviso a medias
  (`:191`); contacto art. 29 ausente → la sección lo declara pendiente y la
  página lo pinta en ámbar (`:570-579`, `aviso/[tenant]/page.tsx:100-112`).
- **El detector de oposición** (`OPOSICION`, `OPOSICION_AMBIGUA`,
  `OBJETO_DE_PAPEL`, `RECHAZA_AUTOMATIZADO`) es determinístico y corre **antes**
  del LLM, y atiende incluso a operadores dados de baja (`processor.ts:374-385`).
  El problema no es la detección: es que nada consume el resultado.
- **El filtro de datos sensibles colados** (`sanitizarProducto`,
  `intake/sanitizar.ts:107-119`) descarta el valor entero en vez de dejar una
  etiqueta —criterio correcto— y declara por escrito su propio límite (la foto ya
  viajó).
- **Redacción de logs**: una sola pasada, UUID huellado y teléfono/RFC borrados,
  con la asimetría de entropía razonada (`logger.ts:11-47`). Sentry recibe lo ya
  redactado.
- **`data_collection:'deny'`** va en los **tres** puntos de entrada al modelo
  (`openrouter.ts:276, 428, 715`), no en dos; y el texto del aviso ya no promete
  un contrato ZDR que nadie firmó (`:554-559`).
- **Sin bóveda de credenciales.** Busqué e.firma, CSD, CIEC y contraseñas de
  portales: no existe custodia de ninguna. El único apunte es la nota de
  `facturacion/comercios.ts:411` marcando ese límite a propósito. Es la decisión
  correcta del §9.5 del documento de conocimiento y elimina el tipo penal del
  art. 62.
- **Fotos y PDFs con URL firmada** (`intake/almacen.ts:97`,
  `api/export/pdf/[id]/route.ts:95`, 60 s), no públicas; el export de
  liquidaciones exige rol **y** área de dinero.
- **`/aviso/[tenant]`** es pública por obligación, `noindex`, con `notFound()`
  indistinguible para no volverse un censo de flotas, y solo expone tres campos.
- **`/dashboard/arco` existe** y falla cerrado: una base caída no se pinta como
  "ninguna solicitud".

## Lo que NO alcancé a revisar

- **El texto vigente del art. 31** (plazos ARCO) de la LFPDPPP 2025. No hay ficha
  en `normas/` y no salí a la red: por eso el hallazgo del plazo se limita a lo
  que sí puedo probar desde el repo — que el artículo citado es de la ley
  abrogada y que las cifras internas no concuerdan. **Falta una ficha
  `lfpdppp-31.yaml` verificada contra diputados.gob.mx antes de tocar
  `DIAS_HABILES_ARCO`.**
- **El régimen contractual real de OpenRouter** (anexo de subencargado, ZDR por
  escrito). Es el pendiente B20 del `52-anexo-subencargados.md:188` y es
  contractual, no de código: desde aquí solo puedo confirmar que el código
  *pide* `data_collection:'deny'` en cada llamada.
- **La cadena de subencargados debajo de OpenRouter** (Google, Anthropic, OpenAI
  según ruteo) — mismo motivo.
- **Las RLS de `solicitud_arco`, `operador` y `wa_conversacion` en la base real.**
  Leí las políticas de la 0053 (`solo_admin_flota`) pero no verifiqué la
  aplicación efectiva contra Postgres; no hay credenciales en este entorno.
- **La retención efectiva del bucket `comprobantes`** (políticas de ciclo de vida
  del lado de Supabase Storage, fuera de las migraciones).
- **El flujo de alta de la flota (onboarding)**: si en algún punto la flota
  declara por escrito las instrucciones al encargado, que es lo que sostendría
  o tumbaría el hallazgo 3.
- `pruebas-manuales/*` — no se corren (pago real), por instrucción.
