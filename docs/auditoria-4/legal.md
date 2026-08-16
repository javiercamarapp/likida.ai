# Cumplimiento legal — auditoría 4

**Nota: 5/10** (antes 6). Razón del movimiento: **deuda que cobró factura** ·
**mirada más profunda**. No hay recaída ni retroceso en lo que estaba bien —
LEG-C1 sigue cerrado por tercer pase consecutivo y el trabajo de retención de E5
sigue siendo el mejor del rubro. Baja por dos cosas medibles: (1) **de los 11
hallazgos del pase 3, once siguen abiertos** — los verifiqué uno por uno contra
el árbol de hoy y ninguno cambió de línea de fondo; (2) la Fase 2 abrió **tres
superficies nuevas que tratan datos personales y ninguna de las tres está en
ningún aviso**: el pipeline de prospectos (donde Likida es RESPONSABLE y no hay
aviso en absoluto para esa clase de titulares), el copiloto (nombres y correos
de personas identificadas saliendo a OpenRouter cruzando tenants) y la bandeja
durable de WhatsApp (teléfono y texto del chofer, guardados para siempre,
contra un plazo publicado que dice 30 días).

**El riesgo mayor, hoy:** Likida da de alta a 828 personas de contacto con
nombre, teléfono y correo, les manda correo comercial desde su propio dominio, y
**no existe ni un renglón de aviso de privacidad que las cubra** — la única
política donde Likida es responsable declara en su primera línea que habla de
"quien contrata y usa el servicio". Aquí no hay flota que responda: la expuesta
ante el INAI es Likida, directa.

---

## Hallazgos

### [ALTO · NUEVO] El embudo de prospectos: Likida es RESPONSABLE de 828 contactos y ninguna página del producto los cubre

`supabase/migrations/0105_zona_vendedores.sql:63-66` ·
`src/app/admin/vendedores/consola-vendedores.tsx:111-118` ·
`src/lib/likida/vendedores.ts:412-416` ·
`src/lib/likida/agentes/cola.ts:344-350` ·
`src/lib/correo/plantilla.ts:146` y `:225` · contra
`src/app/privacidad/page.tsx:50` · `docs/conocimiento/52-anexo-subencargados.md:63` ·
norma: **LFPDPPP 2025 art. 15 fr. I-V y art. 16**, **Reglamento art. 29 fr. I**
(datos obtenidos indirectamente: el aviso, en el primer contacto), **art. 7
último párrafo** (revocación).

**Escenario, con valores.** Javier abre `/admin/vendedores` y captura un
prospecto del censo: empresa `AUTOTRANSPORTES DEL BAJÍO SA DE CV`, contacto
`Laura Méndez`, teléfono `4771234567`, correo `laura.mendez@adb.mx`, vacante
"analista de liquidaciones". `accionCrearProspecto`
(consola-vendedores.tsx:111-118) valida y `crearProspecto` (vendedores.ts:412-416)
escribe `contacto_nombre`, `telefono` y `correo` en `prospecto` (0105:63-65). Los
tres son datos personales de **Laura**, persona física identificada, y ninguno
se los dio ella: vienen de la vacante que publicó su empresa — recolección
INDIRECTA, art. 29 fr. I del Reglamento.

Después, la pieza aprobada en `/admin/aprobaciones` sale de verdad:
`enviarPiezaPorCorreo` (cola.ts:344) llama `enviarCorreo(laura.mendez@adb.mx, …)`
con el pie `porQueLoRecibes: 'Recibes este correo porque tu empresa publicó una
vacante relacionada con liquidación de viajes.'` (cola.ts:349). La plantilla pinta
ese renglón y **nada más** (plantilla.ts:225): debajo solo va la URL desnuda de
la app (`:227-229`), y la parte de texto plano hace lo mismo (`:146`). **No hay
liga al aviso, no hay identidad ni domicilio del responsable, no hay medio para
oponerse ni para darse de baja.** Ese correo es el primer contacto de Likida con
Laura, y es de salida.

Busqué el aviso que la cubriría y no existe: `/privacidad` —la única página donde
Likida se declara responsable— dice literalmente *"**Likida** es responsable de
los datos personales de quien **contrata y usa el servicio**: la persona que
administra la flota, el contralor, quien entra al panel"* (page.tsx:50). Laura no
contrata nada; es un lead. `/aviso/[tenant]` es de la flota sobre sus operadores.
Y el anexo de subencargados describe Resend como *"el correo de quien recibe el
aviso"* (52-anexo:63), o sea la persona de oficina de un cliente — no el correo
de un prospecto ni el cuerpo de un pitch comercial.

**Consecuencia.** Una clase entera de titulares queda sin aviso, sin base de
licitud declarada, sin camino ARCO y sin revocación, mientras se les escribe
desde `avisos@mail.likida.ai`. `prospecto_contacto` (0118) además construye el
**historial de relación** de cada uno —canal, dirección, fecha, resumen— y ni esa
tabla ni `prospecto` están en `mantenimiento_de_datos`
(0104:112-149): sin plazo, un lead que dijo "no me escribas" conserva su ficha
para siempre. Aquí no hay responsable intermedio a quien trasladarle la
obligación: es el sombrero propio de Likida.

**Intento de refutación.** ¿No basta con que sea dato de contacto profesional
publicado? No: el art. 3 fr. IX no exceptúa el dato de contacto laboral de
persona física, y la propia LFPDPPP solo exceptúa datos de personas morales — el
dato es de Laura, no de la empresa. ¿Y el pie "por qué lo recibes"? Es honestidad
de origen, no puesta a disposición del aviso: no dice quién es el responsable, ni
dónde consultar el integral, ni cómo oponerse. ¿No está la liga a la app en el
pie? Un dominio desnudo, sin decir que ahí hay un aviso y sin que el aviso de esa
página aplique a quien lo abre, no es señalar el sitio del art. 16 fr. II.

**Causa raíz probable.** El embudo se diseñó como CRM interno ("dato de NEGOCIO
de Likida, no de ninguna flota", 0105:31-32) y esa clasificación —correcta para
RLS— se leyó también como si el dato dejara de ser personal.

---

### [ALTO · NUEVO] El copiloto manda nombres y correos de personas identificadas, cruzando tenants, a un modelo externo que ningún aviso cubre para ese uso

`src/lib/agents/copiloto-tools.ts:304-306` · `src/lib/admin/bitacora.ts:55` y `:71` ·
`src/lib/agents/copiloto-tools.ts:182` · `:243-245` ·
`src/lib/llm/openrouter.ts:833` · contra `src/app/privacidad/page.tsx:79` y
`src/lib/likida/privacidad.ts:592` · `docs/conocimiento/52-anexo-subencargados.md:56` ·
norma: **LFPDPPP 2025 art. 15 fr. II y III**; **Reglamento arts. 54-55**.

**Escenario, con valores.** Javier abre `/admin/copiloto` y escribe *"¿quién apagó
el agente de cobranza y cuándo?"*. El modelo llama la tool `bitacora`
(copiloto-tools.ts:286). El handler llama `ultimasEntradasBitacora({limite: 20})`,
que hace `select(… actor:actor_id(nombre, email))` (bitacora.ts:55) y resuelve
`actor: actorJoin?.nombre ?? actorJoin?.email` (bitacora.ts:71). El resultado que
la tool devuelve trae, por cada una de las 20 entradas:

```
{ accion: 'interruptor.apagado', entidad: 'interruptor', entidadId: 'cobranza',
  actor: 'Ana Ruiz', flota: 'TRANSPORTES INNOVATIVOS SA DE CV', cuando: '…' }
```

(copiloto-tools.ts:304-306). Ese objeto se serializa con `JSON.stringify` y se
manda de vuelta al modelo como mensaje `role: 'tool'`
(openrouter.ts:833) → sale a **openrouter.ai** y de ahí a Anthropic/Google según
el ruteo. `actor` es el **nombre y, si no hay nombre, el correo** de una persona
física identificada — contralor, contador, vendedor. La bitácora **no filtra por
tenant** (es el catálogo cruzado de `/admin`), así que en un solo turno salen
nombres de personas de flotas distintas. La misma superficie tiene dos puertas
más: `estado_agentes` devuelve `cambiadoPor: i.cambiadoPorNombre`
(copiloto-tools.ts:182) y `pipeline_ventas` devuelve
`nombre: v.nombre ?? v.email` de cada vendedor (`:243-245`).

Ahora leo qué dicen los avisos sobre esta salida. `/privacidad` —donde Likida es
responsable de estas personas de oficina— enumera como encargados *"alojamiento
…, mensajería de WhatsApp, envío de correo …, monitoreo de errores, y **los
modelos de lenguaje que leen los comprobantes**"* (page.tsx:79). El aviso de la
flota dice lo mismo con las mismas palabras: *"los modelos de lenguaje que leen
las fotos"* (privacidad.ts:592). Y el anexo describe a OpenRouter como receptor
de *"Las fotos (OCR) y el texto de la conversación"* (52-anexo:56). **La bitácora
de auditoría de la compañía entera no es una foto, no es un comprobante y no es
la conversación del titular.**

**Consecuencia.** Es remisión a persona encargada (art. 2 fr. XX, no requiere
consentimiento), pero la descripción del art. 15 fr. II/III queda materialmente
más angosta que el tratamiento real, y ahora sobre la clase de titulares donde
Likida responde en primera persona. Un verificador que compare el anexo contra
el código encuentra un renglón que el propio repo escribió como completo. Es la
misma familia que el MEDIO de `chat-tools.ts` del pase 3, con dos agravantes que
lo suben: cruza tenants por diseño y lo que sale son **identificadores directos**
(nombre, correo), no un campo de dominio.

**Intento de refutación.** ¿No lo tapa `data_collection: 'deny'`
(openrouter.ts:213)? No: es una preferencia de ruteo que se pide por llamada — el
propio aviso ya fue corregido en la ronda 8 para no llamarlo contrato (comentario
en privacidad.ts:584-589). Y aunque se cumpliera, el problema no es la retención
del proveedor: es que el catálogo del aviso no enuncia este tratamiento. ¿No es
`/admin` una consola interna? Lo es para el acceso; no cambia que el dato salga
del sistema hacia un tercero.

**Causa raíz probable.** El copiloto se construyó como espejo del analista
(copiloto.ts:1-15) reusando sus garantías de **cifras** —guardia determinista,
tool terminal, topes— y ninguna de datos personales; la lista `TOOLS_COPILOTO_LECTURA`
(copiloto-tools.ts:31-35) es un sandbox de capacidades, no de campos.

---

### [ALTO · NUEVO] La bandeja durable guarda el teléfono y el texto del chofer para siempre, y vuelve falso el plazo de 30 días que la página publica

`supabase/migrations/0119_wa_evento_pendiente.sql:22-37` ·
`src/lib/likida/wa_pendientes.ts:41` · `src/app/api/webhook/whatsapp/route.ts:209` ·
`src/lib/likida/processor.ts:76-85` ·
`supabase/migrations/0104_retencion_operativa.sql:112-149` · contra
`src/app/privacidad/page.tsx:100` · norma: **LFPDPPP 2025 art. 11** (el dato deja
de tratarse cuando deja de ser necesario) y **art. 15 fr. VI / la promesa
publicada**.

**Escenario, con valores.** El interruptor `global` está apagado (mantenimiento,
o `interruptores` ilegible — es fail-closed). Juan Pérez manda una foto con el
pie *"esta es la de la caseta de Palmillas, ya llegué a Querétaro"*. El webhook
contesta 200 y, dentro del `after()`, `estaApagado('global')` es cierto:
`guardarEventosPendientes` inserta en `wa_evento_pendiente`
(wa_pendientes.ts:41) la fila `{ id: 'wamid.HBg…', evento: { from:
'5215512345678', type: 'image', text: 'esta es la de la caseta de Palmillas, ya
llegué a Querétaro', mediaId: '…' } }`. `InboundMessage` (processor.ts:76-85)
declara exactamente esos campos: **teléfono E.164 y el texto que el chofer
escribió**, en JSONB, en claro.

El cron drena, `processInbound` corre y `marcarPendienteProcesado`
(wa_pendientes.ts:103) estampa `procesado_en`. **La fila se queda.** La migración
lo dice por escrito: *"jamás se borra sola: borrar la evidencia de un mensaje que
no se pudo procesar es el mismo error que esta tabla vino a matar"* (0119:31-33)
— razonamiento correcto para la carta muerta, aplicado sin distinción también a
lo ya procesado. Y `mantenimiento_de_datos` (0104:112-149) purga siete cosas y
**no lista `wa_evento_pendiente`**: `purgar_wa_mensaje_procesado(30)`,
`api_idempotencia(7)`, `correo_procesado(90)`, `agente_corrida(180)`,
`wa_conversacion(180)`, `codigo_pendiente(180)`, y el consolidado de `llm_costo`.

Mientras tanto `/privacidad` promete al titular, con esas palabras: *"los
registros técnicos de mensajes de WhatsApp ya procesados se borran a los 30
días"* (page.tsx:100). A los 31 días existe una fila con el **mismo wamid**, el
teléfono y el cuerpo del mensaje — más de lo que jamás guardó
`wa_mensaje_convertido`, que solo tenía el id.

**Consecuencia.** El plazo publicado deja de ser verdad justo en la tabla que más
contenido guarda, y el mecanismo que sí ejecutaba la retención (el mejor trabajo
del rubro en el pase 3) queda con un agujero que crece con cada apagón. Anexo del
mismo hallazgo, dicho con su límite: esta escritura ocurre **antes** de
`ponerAvisoADisposicion` (processor.ts:617), porque el gate vive dentro de
`processInbound` y la persistencia es del borde. El almacenamiento es tratamiento
(art. 3), así que el chofer de una flota que nunca configuró su aviso —el caso
`sin_datos`, donde el gate se niega a tratar— igual deja su teléfono y su texto
guardados. No lo levanto como hallazgo aparte porque `claimMessage`
(`wa_mensaje_procesado`) ya escribía antes del gate desde siempre; lo que cambia
aquí es **qué** se guarda y que ya no se borra.

**Causa raíz probable.** La tabla nació resolviendo un P1 de durabilidad —no
perder la foto del chofer— y heredó de la carta muerta la regla "nunca borrar",
sin separar el caso ya procesado, que es el 99%.

---

## Reincidentes del pase 3 — verificados uno por uno, los once siguen abiertos

No repito los escenarios (están completos en `docs/auditoria-3/legal.md`). Lo que
sigue es la **verificación de hoy** con la línea real del árbol; ninguna se movió.

### [ALTO · REINCIDENTE ×2] La oposición del art. 26 fr. II se registra y la decisión automatizada se ejecuta igual
`supabase/migrations/0021_liquidacion_litros_diesel.sql:51` ·
`src/lib/likida/cuadre/desde_db.ts:53` y `:124` · `src/lib/likida/processor.ts:184-186`.
**Verificación:** busqué todas las redefiniciones de `guardar_liquidacion_tx`
(0013, 0021; la 0035 solo le fija `search_path`, la 0022 tira la firma vieja) — la
viva es la de la 0021 y su cuerpo sigue haciendo
`update viaje set estatus = 'liquidado' where id = p_viaje` **sin mirar
`p_estatus`**. El motor sigue marcando `oposicionTitular` (desde_db.ts:53, :124) y
nadie frena el cierre. El aviso sigue prometiendo *"la empresa la hará a mano"*
(privacidad.ts:551).

### [ALTO · REINCIDENTE ×2] La Cancelación no tiene ejecutor: no existe un solo borrado de datos del operador
`src/lib/likida/repo.ts:1063-1100` · `supabase/migrations/0104_retencion_operativa.sql:112-149`
· `src/lib/likida/privacidad.ts:566`.
**Verificación:** `resolverSolicitudArco` sigue siendo **un solo UPDATE** de
estado (repo.ts:1072-1076) más el WhatsApp *"Tu solicitud de derechos ARCO fue
atendida por {razón social}: {resolución}"* (`:1088`). `grep -rn "\.remove(" src/lib`
sigue devolviendo **cero**; no hay `.delete()` sobre `operador`, `gasto` ni
`comprobante_huerfano`. El aviso sigue prometiendo Cancelación (privacidad.ts:566).

### [ALTO · REINCIDENTE ×3] Likida resuelve ARCO de cualquier flota y firma con la razón social de la flota, sin dejar actor
`src/app/admin/compliance/page.tsx:36-56` · `src/lib/likida/repo.ts:1085-1088` ·
`supabase/migrations/0053_cuentas_bitacora_arco_campanias.sql:98-117`.
**Verificación:** `accionResolver` sigue en `page.tsx:36`, sigue resolviendo el
tenant desde la propia solicitud (`:46`) y sigue llamando `resolverSolicitudArco`
sin registrar quién. Y es un contraste que vale anotar: la 0120 **sí** añadió
snapshot de actor inmutable a `cola_aprobacion` con CHECK que lo exige
(`0120:23-36`) — el patrón correcto existe ya en el repo y `solicitud_arco` no lo
recibió (`grep solicitud_arco` sobre las migraciones 0054-0120: ni una).

### [ALTO · REINCIDENTE ×2] D6: se guarda nombre, correo y celular de un tercero, se le escribe por WhatsApp, y nunca se le pone aviso a disposición
`src/app/dashboard/usuarios/page.tsx:70-105` · `src/lib/auth/provisionar.ts:47-59` ·
`src/lib/likida/contactos.ts:114` → `src/lib/likida/escalar_viaje.ts:333` ·
`src/lib/correo/avisos.ts:294` (plantilla sin llamador) · `src/app/privacidad/page.tsx:50`.
**Verificación:** intacto. `provisionarUsuario` sigue normalizando y guardando el
teléfono (provisionar.ts:51-59); la página sigue diciendo *"No le llega invitación
por correo todavía — pásale tú la liga"* (page.tsx:100-103); `avisoInvitacion`
sigue sin emisor; y `escalar_viaje.ts:333` sigue mandándole `sendText` al jefe con
el teléfono que resuelve `telefonosJefe` (contactos.ts:114).

### [ALTO · REINCIDENTE ×2] Consentimiento tácito donde el art. 7 párrafo quinto pide expreso, sobre dato patrimonial
`src/lib/likida/privacidad.ts:221` y `:535` · `src/lib/likida/processor.ts:617` y `:638`.
**Verificación:** el texto está intacto. La revisión de duplicados sigue
declarada como finalidad **NO necesaria** en los dos avisos (simplificado `:221`,
integral `:535`) y sigue sin existir un "responde ACEPTO":
`ponerAvisoADisposicion` devuelve `'puesto'` y el flujo continúa en el mismo turno
(`:638`).

### [MEDIO · REINCIDENTE ×3] El artículo abrogado en pantalla, y las cifras del plazo ARCO que no concuerdan
`src/app/dashboard/arco/page.tsx:80` · `src/lib/admin/escalaciones.ts:245` ·
`src/lib/likida/privacidad.ts:641-645` · `src/app/admin/compliance/page.tsx:33` ·
contra `docs/conocimiento/11-datos-personales.md:48`.
**Verificación:** `arco/page.tsx:80` sigue literal (*"LFPDPPP art. 32: 20 días
hábiles"*) y ahora **hay una fuente más**: `escalaciones.ts:245` mete el mismo
artículo abrogado en el `detalle` de cada item ARCO de la bandeja — que el
copiloto lee y le repite a Javier. El comentario de `privacidad.ts:642-643` sigue
diciendo *"La LFPDPPP art. 32 fija 15"* sobre `DIAS_HABILES_ARCO = 20` (`:645`).
Y confirmé que **sigue sin existir `normas/lfpdppp-31.yaml`**: el corpus tiene
`lfpdppp-15-16`, `-2-XII-XX`, `-26-II` y `-59`, ninguna del 31.

### [MEDIO · REINCIDENTE ×2] Carta Porte trata RFC y licencia federal del operador; ninguno está en el catálogo del aviso
`src/lib/likida/carta_porte.ts:231-234` · `src/lib/likida/carta_porte_datos.ts:68` ·
contra `src/lib/likida/privacidad.ts:210` (simplificado) y `:510-515` (integral).
**Verificación:** releí los dos catálogos completos hoy. El simplificado enumera
*"tu nombre y teléfono, las fotos … y los avisos del viaje"* (`:210`); el integral
suma *"contenido de tus mensajes, viajes y liquidaciones"* (`:510-515`).
**RFC del operador, número y vigencia de licencia federal y número de empleado
siguen sin aparecer en ninguno de los dos.** Sigue siendo cuestión de redacción.

### [MEDIO · REINCIDENTE ×2] Sentry recibe el nombre de un operador sin redactar, y el anexo afirma lo contrario
`src/lib/logger.ts:49-72` · `src/lib/likida/crear_viaje_wa.ts:812-816` ·
`docs/conocimiento/52-anexo-subencargados.md:60`.
**Verificación:** `logger.ts` **sí cambió** esta ronda y cerró la mitad
patrimonial (ver "Lo que revisé y está bien"), pero `SENSIBLE` (`:72`) sigue
siendo `UUID | RFC | PHONE | CLABE | TARJETA`: **no hay regla de nombre ni de
correo**. `crear_viaje_wa.ts:812-816` sigue emitiendo `logger.error` con
`buscado: q`, que es el nombre de la persona, y `emit` sigue replicando
`warn`/`error` a Sentry (`logger.ts:157-159`).

### [MEDIO · REINCIDENTE ×2] La cláusula de encargados dice "los modelos que leen las fotos" y por ahí sale más
`src/lib/likida/privacidad.ts:592` · `src/lib/agents/chat-tools.ts:117` ·
`src/app/api/dashboard/chat/route.ts`.
**Verificación:** `chat-tools.ts:117` sigue mandando `operador: v.operadorNombre`
al modelo. Este ciclo la superficie **creció**: el copiloto es el tercer camino
(hallazgo nuevo nº 2 arriba), y con nombres y correos en vez de solo el nombre del
operador.

### [BAJO · REINCIDENTE ×2] La bandera de oposición se enciende y no hay un solo escritor que la apague
`supabase/migrations/0100_oposicion_decision_automatizada.sql:28-30` ·
`src/lib/likida/processor.ts:184-186`.
**Verificación:** `grep -rn "oposicion_automatizada" src/ supabase/migrations/`
devuelve hoy exactamente seis sitios: la lectura (repo.ts:74, :86), el único
escritor (processor.ts:184, que solo enciende con `.is(…, null)`), la migración y
el comentario de desde_db.ts:44. Ninguna pantalla la muestra y ninguna la apaga.

### [BAJO · REINCIDENTE ×2] La credencial de conector desactivada conserva su cifrado indefinidamente
`src/lib/likida/conectores/credenciales.ts:171-188` ·
`supabase/migrations/0104_retencion_operativa.sql:112-149`.
**Verificación:** `desactivarCredencial` sigue haciendo solo
`update … set activo = false` con el motivo escrito al lado (*"el cifrado se queda
para poder auditar qué acceso existió"*, `:161-163`), y `conector_credencial`
sigue sin aparecer en `mantenimiento_de_datos`.

---

## Lo que revisé y está bien

- **LEG-C1 sigue cerrado, tercer pase sin recaída, y lo verifiqué en el árbol de
  hoy.** `ponerAvisoADisposicion` está en `processor.ts:617`, **delante** de
  `if (!viajeId)` (`:638`), con la lápida explicando dónde vivía (`:607-613`).
  Los cuatro desenlaces se distinguen y el claim solo se libera cuando el fallo
  es nuestro (`:618-635`). Los 37 commits de master no lo movieron.
- **El redactor de logs cerró de verdad la mitad patrimonial** que las rondas
  viejas reportaron como ALTO. `logger.ts:63-64` define `CLABE = /\b\d{18}\b/` y
  `TARJETA = /\b\d{16}\b/`, y `redactarTexto` los sustituye por `[CLABE]` y
  `[TARJETA]` (`:103-104`) — borrado y no huella, con el razonamiento correcto
  escrito (`:42-46`: se huella lo que no se puede adivinar, se borra lo que sí).
  Y la decisión de fijar 18 y 16 exactos en vez de un rango 13-19 evita convertir
  un epoch en `[TARJETA]`, el error que ya se había documentado con `PHONE`.
  13 pruebas verdes en `logger.test.ts`.
- **El sanitizador hacia los LLMs: revisado a fondo, y el hallazgo viejo de
  PAN/CLABE NO se sostiene hoy.** `sanitizar.ts` sigue sin regla patrimonial
  (`SENSIBLE`, `:71-100`, cubre salud, vida sexual y creencias). Fui a buscar el
  escenario con valores y no existe: el esquema de extracción del OCR
  (`intake/ocr.ts:43`) solo produce `forma_pago: 'efectivo'|'tarjeta'|'otro'` —
  **no hay campo donde caiga un PAN**, y los últimos 4 solo se mencionan como
  heurística de reconocimiento del voucher (`ocr.ts:119`), no como campo
  extraído. Sin escenario con valores, no lo reporto. Queda anotado como
  supuesto: si algún día el OCR extrae un campo de texto libre del voucher, el
  sanitizador está ciego a esa familia.
- **La retención de E5 sigue corriendo y la página sigue diciendo la verdad sobre
  las siete cosas que sí purga.** Volví a cruzar los seis plazos contra
  `0104:129-135` y `privacidad/page.tsx:100`: coinciden. El hueco nuevo es una
  tabla que no entró a la lista (hallazgo nº 3), no una promesa rota de las que ya
  estaban.
- **El aviso integral resiste la relectura completa.** Los once elementos del
  checklist están, `pendiente: !contacto` degrada con honestidad en vez de
  inventar el contacto del art. 29 (`privacidad.ts:600-609`), la sección de
  transferencias describe `data_collection` como lo que es —una petición por
  llamada, no un contrato ZDR (`:584-589`)— y `versionAviso` (`:270-277`) deriva
  la versión del texto, así que el art. 15 fr. VI se cumple por construcción.
  28 pruebas verdes en `aviso_integral.test.ts`, 42 en `privacidad.test.ts`.
- **La cola de aprobación no deja salir nada sin humano ni sin actor.** El CHECK
  `cola_resolucion_con_actor` (0120:33-36) hace imposible a nivel esquema una
  pieza aprobada por nadie, el email del actor es snapshot inmutable
  (`cola.ts:150-158`), y la guardia de cadencia **falla cerrada**: si el historial
  de contactos no se puede leer, no se manda (`cola.ts:332-335`). Es exactamente
  el criterio correcto — mi hallazgo nº 1 no es contra este mecanismo, es contra
  el aviso que le falta al dato que mueve.
- **El copiloto no ejecuta: propone.** `proponer_accion` (copiloto.ts:52-93) arma
  una previsualización determinista del catálogo y el modelo nunca ejecuta; la
  ejecución es un POST aparte que el **servidor** rechaza sin `confirmado: true`
  (`api/admin/copiloto/route.ts:70-73`). El sandbox de tools es una lista blanca
  por nombre (`copiloto-tools.ts:31-35`) y `tenantId` va vacío a propósito para
  que una tool futura truene en vez de leer una flota equivocada
  (`copiloto.ts:179-183`). Ninguna tool del copiloto devuelve el teléfono ni la
  foto de un operador — lo que sí sale son nombres y correos de personal de
  oficina, y eso es el hallazgo nº 2.
- **`prospecto_contacto` (0118) guarda el índice de la relación, no el cuerpo.**
  La migración lo declara y el código lo cumple: `resumen` es una línea, el cuerpo
  vive en la pieza (`0118:26-31`, `cola.ts:365-369`). Es la decisión correcta de
  minimización; el problema del embudo es de aviso, no de exceso de captura.
- **Sin bóveda de credenciales fiscales.** Volví a barrer el catálogo de
  conectores (`conectores/erp.ts`, `gps.ts`, `peaje.ts`): no hay e.firma, CSD,
  CIEC ni contraseña del SAT en ninguno. Sigue siendo la decisión correcta.
- **"No hay GPS" sigue siendo cierto.** Los conectores GPS declaran
  `leer_posiciones` pero `posicion` sigue sin escritor (`grep` no devuelve
  ninguno), así que la frase del aviso (`privacidad.ts:230`, `:515`) se sostiene.
  Sigue sin haber nada que vigile el día que alguien cablee esa capacidad.

## Lo que NO alcancé a revisar

- **El texto vigente del art. 31** (plazos ARCO) y el que rige la Cancelación en
  la ley de marzo 2025. Sigue sin haber ficha en `normas/` y no salí a la red; por
  eso los hallazgos que los tocan se limitan a lo probable desde el repo (que el
  artículo citado en pantalla es de la ley abrogada y que las cifras internas no
  concuerdan). **Falta `normas/lfpdppp-31.yaml` verificada contra fuente primaria
  antes de tocar `DIAS_HABILES_ARCO`.**
- **El régimen contractual de OpenRouter y de Resend** (anexo de subencargado,
  retención, ZDR por escrito). Es el pendiente B20 y es contractual: desde aquí
  solo confirmo que el código *pide* `data_collection: 'deny'`.
- **Si el censo de 828 leads ya está cargado en `prospecto`**, y con qué
  procedencia documentada de cada dato de contacto. No hay credenciales de base en
  este entorno; el hallazgo nº 1 se sostiene sobre el camino de alta que sí leí
  (`crearProspecto`), no sobre un conteo de filas.
- **Las RLS efectivas** de `solicitud_arco`, `prospecto`, `prospecto_contacto`,
  `cola_aprobacion` y `wa_evento_pendiente` contra Postgres real: leí las
  políticas declaradas (deny-all en todas las nuevas), no su aplicación. Es rubro
  de seguridad de todos modos.
- **Las políticas de ciclo de vida del bucket `comprobantes`** del lado de
  Supabase Storage. El código no borra nada; si algo borra, vive allá.
- **El contrato flota↔Likida** (autorización de subcontratación, Regl. arts.
  54-55). Es lo que sostendría o tumbaría el hallazgo de `/admin/compliance`.
- `pruebas-manuales/*` — no se corren (pago real), por instrucción.
