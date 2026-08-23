# Cumplimiento legal — auditoría 18 · continuación 21-ago

**Nota: 5/10** (antes 6). Razón del movimiento: **deuda que cobró factura + mirada
más profunda**. Las dos, y hay que decirlas separadas porque miden cosas
distintas:

- *Deuda que cobró factura:* el CRÍTICO de la ronda 18 —nombres de decisores
  hacia un modelo externo sin un solo aviso— no se atendió, y el delta lo
  **agrandó**: la 0140 le añadió dos columnas de hecho y tres puntuaciones
  generadas por persona/empresa, la 0141 abrió sitio para un DM de LinkedIn, y
  `[id]/detalle.tsx` publicó la **ficha nominal** de cada decisor (teléfono,
  correo, LinkedIn, "Confianza alta") en una pantalla propia con URL propia.
  Cero columnas de consentimiento, cero purga, cero canal ARCO — igual que ayer,
  sobre más datos.
- *Mirada más profunda:* la nota de 6 se sostenía en la frase «el carril del
  operador vale 8 solo». **No vale 8: no puede correr.** `tenant.domicilio_fiscal`,
  `tenant.url_aviso_privacidad` y `tenant.contacto_privacidad` —las tres columnas
  de las que cuelga todo el aparato (aviso simplificado, aviso integral,
  constancia del art. 16, canal ARCO, art. 29)— **no las escribe ninguna pantalla
  de ninguno de los dos paneles**. El alta de flota del 20-ago pasó por ese
  archivo agregando cuatro campos fiscales y no agregó el domicilio. La máquina
  está bien construida y no tiene por dónde arrancar.

No es que empeorara el código del carril del operador: es que se vio mejor.

**El riesgo mayor del rubro, hoy:** Likida trata datos personales de dos
poblaciones para las que hoy no existe aviso posible — los decisores de 31,778
empresas prospecto (no existe el documento) y los operadores de cualquier flota
real (existe el documento y no hay dónde capturar lo que le falta para poder
emitirse).

---

## Hallazgos

### [CRÍTICO] El aviso de privacidad no tiene captura: tres de sus cuatro columnas no las escribe ninguna pantalla, y mientras tanto el carril de oficina sí trata

`src/lib/likida/administracion.ts:140-177` · `src/app/admin/flotas/page.tsx:387-404`
· `src/lib/likida/repo.ts:751,767` · `src/lib/likida/processor.ts:780-806` ·
`src/lib/likida/processor.ts:250-251` · `src/lib/likida/startup.ts:266-270`

**Escenario, con el dato nombrado.** Javier da de alta *Transportes Perla SA de
CV* desde `/admin/flotas`. La forma pide ocho cosas (`page.tsx:387-404`): nombre,
RFC, ciudad, **razón social**, **CP fiscal**, uso de CFDI, correo y nombre del
administrador. `crearFlota` inserta exactamente eso (`administracion.ts:170-177`:
`nombre, rfc, ciudad, regimen_fiscal, config` + `filaFiscal`, que son
`rfc/razon_social/regimen_fiscal/codigo_postal_fiscal/uso_cfdi`).
`tenant.domicilio_fiscal`, `tenant.url_aviso_privacidad` y
`tenant.contacto_privacidad` quedan en NULL — y se quedan ahí para siempre: un
grep de las tres columnas sobre `src/` completo devuelve **un solo lector** (`repo.ts:751`, del que
cuelgan `startup.ts:269,281` y `/aviso/[tenant]`) y **un solo escritor, el
sembrador de QA** (`src/lib/admin/qa-motor.ts:132-133`). Ni `/dashboard/configuracion`, ni
`/dashboard/suscripcion`, ni `/admin/flotas` las capturan.

Entonces entra el primer operador, *Juan Pérez*, con la foto de su ticket de
diésel. `ponerAvisoADisposicion` llama a `getDatosResponsable`, que termina en
`return r.razonSocial && r.domicilio ? r : null` (`repo.ts:767`) → `null` →
`'sin_datos'` → `processor.ts:781` **bloquea el mensaje** y le contesta *"tu
empresa aún no ha terminado de configurar su aviso de privacidad. Avísale a tu
flota"*. Su flota no puede hacer nada: no existe la pantalla. Y si Juan escribe
PRIVACIDAD, `atenderPrivacidad` cae al mismo `null` y se va por `:250-251` — una
frase amable y **ni una fila en `solicitud_arco`**.

Lo que hace de esto un CRÍTICO y no un bloqueo inofensivo: **la flota sigue
operando y sigue tratando a Juan por el otro carril**. El camino de oficina
(`processor.ts:660-700`) **no pasa por el gate**: el dueño escribe *"nuevo viaje
para Juan Pérez, Puebla a Monterrey, anticipo 8000"*, `atenderDespachoOficina`
crea el viaje y el sistema **le manda un WhatsApp a Juan** — su nombre y su
teléfono usados, un mensaje enviado, `aviso_privacidad_en` en NULL y sin ninguna
ruta por la que pueda dejar de estarlo.

**Consecuencia.** El titular es cada operador de cada flota real. El responsable
es la flota, y la ficha verificada lo dice con todas sus letras
(`normas/lfpdppp-15-16.yaml`, *impacto_en_producto*): *"Likida no redacta el
aviso de la flota, pero sí tiene que darle el mecanismo […] Sin el mecanismo, la
flota no puede cumplir aunque quiera, y ese es un hueco de producto"*. Hoy el
mecanismo existe en código y **no tiene puerta de entrada**: `/aviso/<tenant>`
devuelve 404 para todo tenant real, la constancia del art. 16 no se puede
escribir nunca, y el canal ARCO del art. 15 fr. V no registra una sola solicitud.
El propio arranque lo grita y su remedio confiesa el hueco: *"Captura
`razon_social` y `domicilio_fiscal` **en la tabla `tenant`**"* (`startup.ts:269`)
— o sea, a mano, por SQL.

**Causa raíz probable.** Las columnas de privacidad nacieron con las migraciones
(0018/0033/0034) para que el motor las leyera, y ninguna fase posterior les
adjudicó dueño de captura; el commit del 20-ago tocó justo `crearFlota` para
completar "los cinco del receptor" fiscal y nadie preguntó por los tres del
aviso.

---

### [CRÍTICO] El decisor del prospecto ahora tiene ficha nominal propia, tres puntuaciones y CSV — y sigue sin existir el aviso que lo cubra

`supabase/migrations/0140_prospecto_investigacion_profunda.sql:46-77` ·
`src/app/admin/mapa-prospectos/[id]/detalle.tsx:154-174` ·
`src/lib/admin/prospectos-mapa.ts:488-493,518` ·
`src/app/admin/mapa-prospectos/cerebro.tsx:102-110,373-377` ·
`src/app/api/admin/mapa-prospectos/mensaje/route.ts:64,74,76,83` ·
`src/app/privacidad/page.tsx:50`
**(REINCIDENTE de la ronda 18 — y agravado por el delta.)**

**Escenario, con el dato nombrado.** *Ing. Ramón Treviño, Director de
Operaciones* de una transportista de Escobedo entra a `prospecto_persona` (0138)
con `nombre/puesto/correo/telefono/linkedin/origen/confianza`. Lo nuevo de esta
ronda es lo que se hace con él:

1. **Se le abrió una página propia.** `/admin/mapa-prospectos/<uuid>` pinta su
   nombre, su puesto, su teléfono como `tel:`, su correo como `mailto:`, su
   perfil de LinkedIn y una etiqueta *"Confianza alta"* (`detalle.tsx:154-174`),
   más las "Notas de investigación" en crudo (`:220-228`).
2. **Se le añadieron tres puntuaciones calculadas por la base.** La 0140 creó
   `similitud_icp_pct`, `necesidad_pct` y `viajes_mes_estimado` como columnas
   `generated always … stored` (`:57-77`) con índices para ordenar por ellas
   (`:86-87`); la ficha las enseña como barras (`detalle.tsx:131-134`) y el
   Cerebro filtra y ordena por ellas.
3. **Se le añadieron al CSV.** `csvDe` exporta la vista completa —`contacto`,
   `telefono`, `correo`, `notas` y ahora los tres derivados— a un archivo que se
   descarga a la laptop (`cerebro.tsx:102-110, 373-377`), sin registro de quién
   lo bajó ni cuándo.
4. **Y sigue saliendo hacia OpenRouter.** `mensaje/route.ts` lee
   `contacto_nombre` (`:64`), lo interpola literal —`Decisor: ${p.contacto_nombre}`
   (`:74`)— junto con 1,500 caracteres de `notas` (`:76`) y lo manda por
   `generateStructured` (`:83`). El delta tocó ese archivo: cambió la regla de
   cifras del prompt. **No tocó la ficha con el nombre.**

**Consecuencia.** Ramón Treviño nunca contrató nada con Likida. Aquí Likida no es
persona encargada: decide sobre esos datos, o sea es **responsable**, y el art. 14
la obliga a informarle la existencia y características del tratamiento. No hay
aviso que lo haga: `/privacidad:50` se acota expresamente a *"quien **contrata y
usa el servicio**"*, `/terminos` es el contrato con la flota y `/aviso/[tenant]`
es el de la flota frente a sus operadores. No hay columna de consentimiento ni de
aviso puesto a disposición en ninguna de las once migraciones de `prospecto`
(0105→0141), y `mantenimiento_de_datos` (0104) **no toca `prospecto`** — verificado:
sus `delete from` son `wa_conversacion` y `codigo_pendiente`, ninguno de
prospección. El dato se queda para siempre.

*Intento de refutación, que no prospera:* el art. 9 puede eximir del
consentimiento cuando el dato figura en fuentes de acceso público; no exime del
**aviso** (arts. 14 y 16), que es obligación autónoma, ni del plazo de
conservación, ni del canal ARCO. Y `origen: 'inferido'` (0138) declara que parte
de esos correos no vienen de ninguna fuente pública: se dedujeron.

*Lo que sí hay que refutar del encargo:* **la 0141 no guarda hoy ningún mensaje
de LinkedIn.** Añadió `prospecto.mensaje_linkedin` y nada más — un grep de
`mensaje_linkedin`/`mensajeLinkedin` sobre `src/` no devuelve un solo escritor ni
lector. La columna está vacía y el DM sigue viviendo en los `.md` de la cola de
marketing. No lo reporto como transferencia; lo dejo anotado como superficie
abierta.

**Causa raíz probable.** El producto tiene dos sombreros y solo escribió el
documento de uno: todo el aparato legal se construyó para "Likida encargada de la
flota", y la maquinaria de adquisición sigue creciendo sin que nadie la reclame
como tratamiento con Likida de responsable.

---

### [ALTO] El gate del aviso dejó de ser lo primero del camino del chofer: el dueño que maneja pasa antes por el analista

`src/lib/likida/processor.ts:749-772` (el bloque nuevo) frente al gate en `:780`
· `src/lib/likida/oficina_wa.ts:157-172` · `src/lib/agents/analista.ts:288`

**Escenario, con el dato nombrado.** *Ramiro Salas* es dueño de una flota de seis
camiones y maneja uno: está dado de alta como `operador` (para mandar sus
tickets) **y** como `app_user` con rol `flota_admin`. Escribe por WhatsApp
*"oye, ¿cómo vamos con lo de Sabinas? el chofer nuevo me trae mal el diésel"*.
`resolveOperador` acierta, y el bloque que entró con el delta
(`processor.ts:749-772`) resuelve además su cuenta de oficina y llama a
`atenderTextoOficina(..., { incluirPreguntaLibre: !viajeId })`. Sin viaje abierto,
eso llega a `atenderPreguntaLibre` (`oficina_wa.ts:157`), que manda su **nombre**
(`analista.ts:288`: *"CON QUIÉN HABLAS: ${opts.usuario.nombre}"*) y su **texto
íntegro, recortado a 1,500 caracteres** a OpenRouter. Todo esto ocurre **antes**
de `ponerAvisoADisposicion` (`:780`), que es la línea siguiente.

**Consecuencia.** El titular es Ramiro, que en la base es un `operador` como
cualquier otro. El comentario que justifica la colocación dice: *"pedir el
informe de la flota no trata datos personales del operador"* (`:743-747`). No es
exacto: el aviso que ese mismo archivo pone a disposición enumera *"el **contenido
de tus mensajes** en esa conversación"* como dato tratado (`privacidad.ts:512`), y
obtener y usar ese texto es tratamiento (art. 2). Este es exactamente el hallazgo
que el propio archivo documenta como *"AUDITORÍA 3, LEG-C1 (CRÍTICO,
reincidente)"* en `:772-779` —*"Izado aquí, TODO camino que trate datos […] queda
detrás del aviso"*— y hoy hay un camino nuevo delante. Agrava que el gate está de
facto siempre en `'sin_datos'` (hallazgo anterior): la única puerta que sí abre en
una flota real es justo la que se puso por delante de él.

*Refutación parcial, que sí vale:* al analista solo llegan `flota_admin` y
`contador` (`rolConAnalista`, `oficina_wa.ts:129-131`), y para el `flota_admin`
la deuda del aviso es consigo mismo. Para el `contador` no lo es, y talacha,
despacho, asignación e informe PDF corren antes del gate para **cualquier** rol
de oficina.

**Causa raíz probable.** El bloque se colocó optimizando el desempate
chofer/oficina (necesita `getOpenViaje`, que va después) y se resolvió el
conflicto con el gate por comentario en vez de partiendo el trabajo en dos: lo
que no trata datos, antes; lo que sí, después.

---

### [ALTO] El piloto de visión manda la pantalla de un portal ya autenticado a un modelo externo, y ningún aviso menciona ese flujo

`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:151,193,352-374` ·
`.../pagina_playwright.ts:728,834` · `src/app/privacidad/page.tsx:79` ·
`src/lib/likida/privacidad.ts:592`

**Escenario, con el dato nombrado.** *Transportes Perla* comparte en
`/dashboard/conexiones` la cuenta de La Gas de su encargado —
`ayudante.contraloria@transportesperla.mx` + contraseña — y se enciende
`FACTURACION_PILOTO`. El piloto abre `facturacion.lagas.com.mx`, escribe el
usuario, y en el paso siguiente vuelve a hacer `capturaSegura` (`:151`) y manda
esa imagen al modelo (`:370`, `images: [...]`). Dos cosas viajan que la regla 3
del encabezado —*"LA CONTRASEÑA NO VIAJA AL MODELO […] Al modelo, al log y a
`capturado` solo les llega el marcador"* (`:44-47`)— no cubre, porque solo
gobierna el canal de texto:

- el **usuario ya tecleado**, renderizado en claro en el `<input>` de la captura
  JPEG, que además es `fullPage` por defecto (`pagina_playwright.ts:728`);
- el **texto visible completo de la página autenticada**, hasta 1,800 caracteres
  de `document.body.innerText` (`:834`), reenviado verbatim en el prompt
  (`piloto_vision.ts:359`) — lo que el portal enseñe tras el login: el titular de
  la cuenta, su correo, su historial de facturas.

Ese canal no lo toca ningún filtro: `sanitizarProducto` (`intake/sanitizar.ts:111`)
solo actúa sobre el campo `producto` del OCR.

**Consecuencia.** El titular es el empleado de la flota cuya cuenta se compartió.
Los dos avisos acotan los modelos por escrito: `/privacidad:79` dice *"los modelos
de lenguaje que **leen los comprobantes**"* y `privacidad.ts:592` dice *"los
modelos de lenguaje que **leen las fotos**"*. Una captura de la sesión abierta de
un portal de un tercero no es ninguna de las dos cosas, y quien lea esas cláusulas
concluye lo contrario de lo que pasa. Es el mismo defecto que la auditoría 8
corrigió una vez en ese párrafo (nota en `privacidad.ts:584-589`).

*Lo que sí está bien y hay que decirlo:* el `CampoInventariado` **no lleva
`value`** (`playwright_base.ts:98-109`), así que el contenido de los campos no
viaja por el JSON del inventario; el marcador `«CONTRASEÑA»` se sustituye local
(`:290-304`) y `capturado` guarda el marcador; y la palanca `FACTURACION_PILOTO`
está apagada, así que hoy esto no corre en producción. Por eso es ALTO y no
CRÍTICO.

**Causa raíz probable.** La regla 3 se escribió pensando en el canal de texto —el
único que el autor controlaba línea por línea— y la imagen entró como "evidencia",
categoría que nadie clasificó como salida de datos.

---

### [MEDIO] La credencial revocada conserva su contraseña cifrada para siempre, y ninguna purga la alcanza

`src/lib/likida/conectores/credenciales.ts:161-189` ·
`src/lib/likida/facturacion/cuentas.ts:33-55,66-95` ·
`supabase/migrations/0104_retencion_operativa.sql`

**Escenario, con el dato nombrado.** *Transportes Perla* comparte su cuenta de La
Gas, la usa tres meses y decide retirarla: `/dashboard/conexiones` llama a
`desactivarCredencial`, que hace `update({ activo: false })` (`:176-181`). El
acceso queda cortado de verdad —los tres lectores filtran por `activo = true`
(`cuentas.ts:40,75,116`)— pero **`valores_cifrados` se queda en la fila**, con la
contraseña del portal dentro, indefinidamente. El comentario lo declara y da la
razón: *"NO se borra — el cifrado se queda para poder auditar qué acceso existió y
hasta cuándo"* (`:162-164`). Auditar *qué acceso existió y hasta cuándo* lo
resuelven `pistas`, `creada_en` y la fila de `bitacora_auditoria` que la propia
función escribe (`:188`); la **contraseña** no aporta nada a esa pregunta.
`mantenimiento_de_datos` (0104) no menciona `conector_credencial`, y no hay
ningún plazo declarado.

**Consecuencia.** El titular es la persona cuya cuenta de portal es —en La Gas, un
correo y una contraseña personales—. Se conserva un secreto reutilizable mucho
después de que su finalidad terminó: si `LIKIDA_COFRE_LLAVE` se filtra alguna vez,
lo recuperable no son las cuentas vivas, son **todas las que alguna vez existieron**.
Es el supuesto literal del rubro ("datos que se quedan más de lo necesario") y
choca con la promesa de `/privacidad:99-100`, que enumera los plazos que *sí*
corren solos y no incluye este.

**Causa raíz probable.** Se copió el criterio de "revocar una llave de API" —donde
el secreto ya no sirve para nada porque el proveedor lo invalidó— a un caso donde
el secreto sigue siendo válido del otro lado, porque el portal de La Gas no sabe
que Likida lo desactivó.

---

### [MEDIO] El correo *adivinado* de una persona cuenta como decisor verificado en el score que decide a quién se le escribe

`src/lib/admin/prospectos-mapa.ts:518` frente a `:241` y `:277-278` ·
`supabase/migrations/0138_prospecto_persona.sql:41-50`

**Escenario, con el dato nombrado.** El agente investiga la transportista de
Escobedo, no encuentra el correo de *Ramón Treviño* y lo deduce del patrón de la
empresa: `ramon.trevino@transportesx.mx`, con `origen: 'inferido'`. La 0138 solo
prohíbe que un inferido se declare `confianza: 'alta'` (`:49-50`); **`'media'` es
el default de la columna** (`:47`), así que la fila nace `inferido` + `media`. La
ficha llama a `scoreCierre` con
`personasVerificadas: (p.prospecto_persona ?? []).filter((x) => x.confianza !== 'baja').length`
(`:518`) — y el contrato del parámetro dice *"Personas de `prospecto_persona` con
contacto **NO inferido**"* (`:241`), y el cuerpo lo repite: *"`inferido` no cuenta:
un correo adivinado no es alcance, es una apuesta, y sumarlo aquí pintaría de
verde un camino que rebota"* (`:277-278`). El filtro no mira `origen`. Ramón suma
+10 y la empresa sube en la cola.

**Consecuencia.** El titular es Ramón. Un dato personal que Likida **fabricó** —no
lo obtuvo de una fuente pública, y por tanto ni siquiera el art. 9 lo ampara— se
almacena, se puntúa como verificado, se exporta en el CSV y termina recibiendo
correo comercial en una dirección que puede ser de otra persona con ese nombre. Es
el principio de calidad del dato (exacto, correcto y actualizado) tratado al revés:
la única columna que separaba "lo leí" de "lo adiviné" existe y el consumidor no la
lee. El propio encabezado de la 0138 nombra el daño (`:16-22`) y la comprobación
está a una línea de distancia.

**Causa raíz probable.** `confianza` y `origen` son dos ejes distintos y el
llamador usó el que tenía más a mano; el constraint que los liga solo cubre el
caso extremo (`inferido` + `alta`), y el default `media` deja pasar todo lo demás.

---

### [MEDIO] `/privacidad` no enumera ni el dato ni la salida del analista, y Likida ahí es responsable, no encargada

`src/app/privacidad/page.tsx:59-62,79` · `src/lib/likida/oficina_wa.ts:157-172` ·
`src/lib/agents/analista.ts:288`

**Escenario, con el dato nombrado.** *Ana Ruiz*, contadora de la flota, escribe por
el WhatsApp de Likida *"¿por qué la liquidación de Juan salió con diferencia? el
mes pasado también"*. `atenderPreguntaLibre` manda su **nombre** y su texto a
OpenRouter (`analista.ts:288`, `oficina_wa.ts:161-167`). En `/privacidad`, la
sección "Qué datos se tratan" enumera *nombre, correo, teléfono*, los datos
fiscales de la empresa y *"registros técnicos de uso: cuándo entras al panel, qué
liquidaciones consultas y los errores"* (`:59-62`) — **el contenido de sus
mensajes no está**; y "Con quién se comparten" acota los modelos a *"los modelos
de lenguaje que **leen los comprobantes**"* (`:79`).

**Consecuencia.** El titular es la usuaria del panel, y aquí Likida **es
responsable**, no encargada (`/privacidad:50`): no responde por contrato ante la
flota, responde ante la autoridad. Un dato tratado que el aviso no enuncia
incumple el art. 15 fr. II, y una salida a un tercero descrita más estrecha de lo
que es incumple el art. 35. Es hermano del MEDIO de ayer sobre el aviso del
operador, pero **no es el mismo hallazgo**: otro documento, otro titular y otra
posición de Likida en la ley — por eso lo separo en vez de darlo por cubierto.

**Causa raíz probable.** `/privacidad` se redactó cuando el usuario de oficina
solo tocaba el panel; el analista por WhatsApp y el copiloto de admin llegaron
después y nadie volvió a la lista del art. 15 fr. II.

---

### [BAJO] El correo del usuario se guarda en una cookie del navegador y ninguna página lo dice

`src/lib/auth/reenvio_enlace.ts:43,60-66` · `src/app/privacidad/page.tsx` (sin
mención de cookies en ninguna de sus ocho secciones)

**Escenario, con el dato nombrado.** *Ana Ruiz* teclea su correo en `/login`.
`guardarCorreoParaReenvio` escribe `likida_correo_enlace = ana.ruiz%40flota.mx`
en una cookie de **una hora** (`:60-66`). No es un identificador opaco de sesión:
es el dato personal en claro (URL-encoded), y no se borra al entrar — sobrevive
la hora completa en la máquina compartida de la oficina. `/privacidad` no
menciona cookies, almacenamiento local ni cómo deshabilitarlos en ninguna de sus
secciones (grep de "cookie" sobre `src/app/privacidad/` y `privacidad.ts`: cero
resultados).

**Consecuencia.** El deber de informar sobre mecanismos locales/remotos que
guardan datos personales en el equipo del titular (Reglamento art. 30) no está
cubierto por ninguna sección del aviso. El daño material es pequeño —la cookie es
`httpOnly` y `secure` en producción (`:50-55`), así que ningún script la lee y el
reenvío solo puede mandar un enlace **al buzón de la propia Ana**— y por eso es
BAJO, no más.

*Honestidad sobre el fundamento:* el art. 30 del Reglamento no está transcrito en
ninguna ficha `verificado_fuente_primaria` de `normas/`; lo cito por el criterio
del propio repo, que trata el Reglamento como vigente (arts. 21, 24, 29, 31, 54-55
en `11-datos-personales.md`). Si alguien va a redactar el párrafo, que verifique
el texto antes.

**Causa raíz probable.** La cookie nació el 19-ago como pieza de UX del magic
link y se razonó como detalle de implementación, no como recolección.

---

## Estado de los hallazgos abiertos de la ronda 18

| # | Hallazgo | Estado hoy |
|---|---|---|
| CRÍTICO | Nombre del decisor → modelo externo sin aviso | **ABIERTO Y AGRANDADO** (ver arriba). El delta tocó `mensaje/route.ts` para cambiar la regla de cifras del prompt; la ficha con `contacto_nombre` sigue igual. |
| ALTO | "Diferencias por operador" es ranking nominal | **ABIERTO, sin cambios.** `analytics.ts:283-334` y `vista.tsx:217-226` intactos en el delta; la consulta sigue sin mirar `oposicion_automatizada`. |
| ALTO | Solicitud ARCO sin registro cuando falta la razón social | **ABIERTO Y PEOR.** `processor.ts:210-251` intacto. Ahora se sabe que no es un caso de borde: como `domicilio_fiscal` no tiene escritor, la rama sin registro es **la única** que puede ejecutarse en una flota real. |
| MEDIO | El panel cita el art. 32 de la ley abrogada | **ABIERTO.** Verificado que sigue en `processor.ts:215` (*"LFPDPPP art. 32"*) dentro del comentario que justifica el insert. |
| MEDIO | El aviso acota los modelos a "las fotos" | **ABIERTO**, y con dos consumidores nuevos que tampoco cubre: el piloto de visión y el analista por WhatsApp. |
| MEDIO | Token de sesión por Resend/AWS ausente del anexo | **ABIERTO.** `52-anexo-subencargados.md:63` sin cambios. |
| BAJO | El aviso cita "art. 2 fr. XX" para persona encargada | **ABIERTO.** `privacidad.ts:503` intacto (debe ser fr. XII, como el propio `:5` y `normas/lfpdppp-2-XII-XX.yaml`). |
| BAJO | `models.ts` afirma que el gateway "fuerza ZDR" | **PARCIALMENTE ATENDIDO.** `models.ts` cambió en el delta (11 líneas) pero el claim sigue: hay que releerlo con calma en la ronda siguiente; no lo reclamo cerrado. |

---

## Lo que revisé y está bien

- **La 0140 no guarda ni un dato personal nuevo.** Columna por columna:
  `num_unidades` (tamaño de flota) e `historia` (contexto de la empresa) son de la
  persona moral; `similitud_icp_pct` / `necesidad_pct` / `viajes_mes_estimado` son
  derivadas de `scian`, `vacante`, `num_unidades` y `sitio_verificado`. **Ninguna
  puntúa a una persona física**: no leen `contacto_nombre` ni `prospecto_persona`.
  El "ranking de personas" del rubro no se materializa aquí — lo que sí puntúa a
  una persona es `scoreCierre` (+20 por `contacto_nombre`, +10 por persona), que
  es de la ronda 18. Y son `generated … stored`: ningún agente las escribe, así
  que no hay puntuación inventada por un LLM.
- **La 0141 está vacía y sin escritor.** `prospecto.mensaje_linkedin` no la
  escribe ni la lee nadie en `src/`. No hay hoy un DM a una persona nombrada
  guardado en base.
- **La regla 3 del piloto se cumple en el canal de texto.** El marcador
  `«CONTRASEÑA»` se sustituye local (`piloto_vision.ts:290-304`), `capturado`
  guarda el marcador (`:301`), `enmascarar` protege el historial (`:307-309`), y
  `CampoInventariado` no lleva `value` — el JSON del inventario no puede filtrar lo
  tecleado.
- **El cofre sigue siendo cofre.** AES-256-GCM, la llave solo en entorno, `cifrar`
  lanza si falta en vez de guardar en claro, el CHECK `conector_credencial_no_en_claro`
  como segundo candado, `listarCredenciales` jamás selecciona `valores_cifrados`, y
  el descifrado que falla se reporta **sin un byte del contenido**
  (`cuentas.ts:88-92,128-133`).
- **El acceso a `prospecto_persona` está cerrado a los tenants.** RLS encendida y
  policy de solo-lectura para `superadmin` (0138:69-75). Ninguna flota ve la
  libreta de prospección.
- **La ruta del redactor de mensajes tiene puerta y techo:** `sesionSuperadmin()`
  antes de todo y 120 generaciones/hora (`mensaje/route.ts:47-53`), y el log deja
  `actor` sin volcar el contenido del prospecto (`:102-105`).
- **El medio ARCO responde antes de resolver identidad.** El chequeo de
  `pideAtencionPrivacidad` vive ahora arriba del todo (`processor.ts:599-608`),
  antes de `resolveOperador`, y busca tenant por teléfono **o** por cuenta de
  oficina — el operador dado de baja sigue teniendo canal. Sobrevivió intacto a la
  reescritura de 402 líneas.
- **`motivo_login.ts` no reabre el oráculo de enumeración.** Los tres motivos
  (`caducado`, `navegador`, `generico`) hablan del estado del ENLACE, nunca de si
  el correo tiene cuenta (`:21-24`), y `reenvio_enlace.ts` mantiene
  `shouldCreateUser: false` (`:105`) y no loguea el correo en el fallo (`:109-111`).
  Revisado a propósito porque la ronda 18 confesó no haberlos mirado.
- **El aviso de facturación no divulga de más:** `avisarPorFacturar` va al teléfono
  del jefe resuelto por tenant (`cron/facturar/route.ts:207-217`) y la captura del
  portal **no viaja** en la respuesta salvo que se pida con `?captura=1`
  (`:226-255`).

---

## Lo que NO alcancé a revisar

- **`al_vuelo.ts` y `enrutar.ts` completos** (+123 líneas entre los dos). Los leí
  solo por el borde de las credenciales y de la captura; la decisión de qué ticket
  va a máquina y cuál a persona puede tener implicaciones de divulgación que no
  auditté.
- **`avisar.ts`** (+82 líneas, commit `686b8f4`): confirmé que el aviso sale al
  jefe, no qué campos del ticket lleva el texto. Si incluye el nombre del operador
  que subió el comprobante, es una divulgación que merece su propia línea.
- **El texto vigente de la LFPDPPP de marzo 2025 más allá de los cinco artículos
  transcritos** en `normas/lfpdppp-*.yaml`. Los arts. 9, 11, 14 y 31 que cito salen
  de la tabla de equivalencias de `11-datos-personales.md:44-60`, no de la fuente
  primaria abierta por mí. **Ojo con la tabla misma:** su §5.3 cita *"datos
  obtenidos indirectamente (art. 17)"* mientras su propia tabla mapea el viejo 17 →
  el nuevo 16. No lo levanto como hallazgo porque es documentación y no pude
  verificar cuál es el artículo correcto en el texto vigente; queda como pregunta
  para la ficha.
- **Si el primer toque debe llevar aviso** (art. 16 fr. II + Regl. art. 29 fr. I:
  aviso en el primer contacto cuando el dato se obtuvo indirectamente). Los
  mensajes de `mensajes.ts:10-37` no lo llevan y el hueco es real, pero no lo
  reporto aparte: es la misma raíz del CRÍTICO de prospectos y desdoblarlo infla el
  conteo sin añadir información.
- **La landing (`likida.ai`), que vive en otro repo.** Sigue sin poder comprobarse
  si `/getdemo` muestra aviso o casilla antes de escribir `contacto_nombre`,
  `correo` y `telefono` en `prospecto`. Nada llega hasta acá que lo acredite.
- **Los contratos** (anexo de subencargado con OpenRouter, autorización de
  subcontratación con la flota): documentos, no código.
