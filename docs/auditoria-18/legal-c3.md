# Cumplimiento legal — auditoría 18 · continuación 3

**Nota: 6/10** (antes 5). Razón del movimiento: **se atacó y subió** *y* **mirada
más profunda**, y hay que decirlas separadas porque tiran en direcciones
distintas:

- *Se atacó y subió:* de los nueve abiertos que traía, el PR #38 cerró **ocho**
  con código verificable — el aviso de prospectos existe y es público
  (`src/app/aviso/prospectos/page.tsx`), la purga por inactividad la ejecuta una
  función real (0148 `purgar_prospecto_persona`), el nombre del decisor sale
  seudonimizado del redactor del Cerebro (`seudonimo.ts`), la solicitud ARCO se
  registra aunque falte la razón social, «Diferencias por operador» honra la
  oposición del art. 26 fr. II, y el comentario de `models.ts` dejó de prometer
  un ZDR que nadie firmó. Eso no es cosmético: es la primera ronda en la que el
  aparato legal de prospectos pasó de no existir a existir.
- *Mirada más profunda:* el arreglo de prospectos se hizo sobre **un** camino de
  primer toque y hay **tres**. El que quedó sin tocar (`agentes/redactor.ts`)
  sigue mandando `contacto_nombre` literal a un modelo externo — y ahora, además,
  el aviso publicado afirma en su cara que eso no pasa. Un aviso que omite es un
  hueco; un aviso que **declara falso** un tratamiento es otra cosa, y es lo que
  impide subir más de un punto.

**El riesgo mayor del rubro, hoy:** hay un documento público —`/aviso/prospectos`,
la liga que se le manda a la persona— que dice *"tu nombre no sale de Likida"*
mientras un botón vivo de `/admin/vendedores` lo manda a un modelo externo; y el
carril del operador sigue sin poder arrancar porque las tres columnas del aviso
de la flota no las captura ninguna pantalla.

---

## Verificación de los abiertos de la pasada anterior

| # | Hallazgo (c2) | Estado |
|---|---|---|
| CRÍTICO | El aviso de privacidad no tiene captura | **REINCIDENTE** — sin un solo cambio. Ver hallazgo 1. |
| CRÍTICO | El decisor del prospecto → modelo externo sin aviso | **CERRADO A MEDIAS.** Cerrado en el camino del Cerebro (`mensaje/seudonimo.ts:59-63,67-75`, `mensaje/route.ts:72-83,100-103`), con aviso público (`src/app/aviso/prospectos/page.tsx:28-31`) y purga real (`0148_prospecto_persona_retencion.sql:60-86,124`). **Sobrevive intacto el segundo escritor**: `agentes/redactor.ts:163`. Ver hallazgo 2. |
| ALTO | «Diferencias por operador» es ranking nominal | **CERRADO.** `analytics.ts:360` filtra `oposicion_automatizada == null`, y el único llamador (`dashboard/agentes/liquidacion/page.tsx:61`) no pasa `{ nominal: true }`, así que el nombre sale seudonimizado por `etiquetaOperador` (`analytics.ts:362`). |
| ALTO | Solicitud ARCO sin registro cuando falta la razón social | **CERRADO.** `registrarSolicitudArco` salió del `if (datos)` y corre en su propio try antes de leer al responsable (`processor.ts:229-244`); el `if (datos)` de la respuesta viene después (`:246`). |
| ALTO | El gate del aviso dejó de ser lo primero del camino del chofer | **REINCIDENTE Y AGRAVADO.** El bloque sigue en `processor.ts:846-874`, delante del gate de `:887`, y ahora además pasa `incluirDespacho: !viajeId` (`:872`), no solo la pregunta libre. Ver hallazgo 5. |
| ALTO | El piloto de visión manda la pantalla autenticada al modelo | **REINCIDENTE.** `piloto_vision.ts:151,193,370` y `pagina_playwright.ts:835` idénticos; el aviso sigue acotando los modelos a fotos y texto de mensajes (`privacidad.ts:604`). Ver hallazgo 6. |
| MEDIO | El panel cita el art. 32 de la ley abrogada | **CERRADO EN EL PANEL DEL CLIENTE** (`dashboard/arco/page.tsx:24,73,84` citan el art. 31), **abierto en el de Javier**. Ver hallazgo 12. |
| MEDIO | El aviso acota los modelos a «las fotos» | **CERRADO para el operador** (`privacidad.ts:604`: *"y **el texto de tus mensajes** —la conversación completa—"*), **REINCIDENTE para el usuario del panel** (`app/privacidad/page.tsx:86`). Ver hallazgo 10. |
| MEDIO | Token de sesión por Resend/AWS ausente del anexo | **CERRADO.** `52-anexo-subencargados.md:63` describe el `token_hash` en la liga y el OTP; `app/privacidad/page.tsx:67,86` lo enumera y lo declara como salida. |
| MEDIO | La credencial revocada conserva su contraseña cifrada | **REINCIDENTE.** `credenciales.ts:170-176` sigue haciendo solo `update({ activo: false })`; ninguna migración purga `conector_credencial`. Ver hallazgo 9. |
| MEDIO | El correo *adivinado* cuenta como decisor verificado | **REINCIDENTE.** `prospectos-mapa.ts:573` sigue filtrando por `confianza !== 'baja'` y sin mirar `origen`, contra su propio contrato en `:241` y `:276-278`. Ver hallazgo 8. |
| MEDIO | `/privacidad` no enumera el dato ni la salida del analista | **REINCIDENTE.** `app/privacidad/page.tsx:59-67` sigue sin el contenido de los mensajes. Ver hallazgo 10. |
| BAJO | El aviso cita «art. 2 fr. XX» para persona encargada | **CERRADO.** `privacidad.ts:505-508` cita la fr. XII y deja la nota del porqué. |
| BAJO | `models.ts` afirma que el gateway «fuerza ZDR» | **CERRADO.** `models.ts:22-32` hoy dice lo contrario con todas sus letras: *"NO es Zero Data Retention […] nadie lo ha firmado con OpenRouter"*. |
| BAJO | El correo del usuario en una cookie que ninguna página menciona | **REINCIDENTE.** `reenvio_enlace.ts:44,61-66`; cero apariciones de "cookie" en `src/app/privacidad/`. Ver hallazgo 13. |
| — | ARCO «Vencen pronto (≤ 5 días)» contaba hacia atrás (A14) | **CERRADO.** `dashboard/arco/page.tsx:71-75`: `venceDentroDe` para lo que falta y `yaVencio` como conteo aparte. |

---

## Hallazgos

### 1. [CRÍTICO] El aviso de privacidad de la flota sigue sin pantalla de captura: `/aviso/<tenant>` es 404 para toda flota real y el gate queda en `sin_datos` para siempre

`src/lib/likida/repo.ts:751,767` · `src/lib/likida/administracion.ts:178-186` ·
`src/app/admin/flotas/page.tsx:387-416` · `src/lib/saas/fiscal.ts:82-89,147-158` ·
`src/app/aviso/[tenant]/page.tsx:64-69` · `src/lib/likida/processor.ts:887-900` ·
`src/lib/likida/startup.ts:269`
**(REINCIDENTE de la c2, sin un solo cambio en el delta de 116 commits.)**

**LFPDPPP (mar-2025) art. 15 fr. I y V · art. 16 fr. II.**

**Escenario, con el dato nombrado.** Javier da de alta *Transportes Perla SA de
CV* en `/admin/flotas`. La forma pide nueve cosas (`page.tsx:387-416`): nombre,
RFC, ciudad, razón social, CP fiscal, uso de CFDI, correo, nombre y WhatsApp del
administrador. `crearFlota` inserta exactamente eso (`administracion.ts:178-186`:
`nombre, rfc, ciudad, regimen_fiscal, config` + `filaFiscal`, que es
`rfc/razon_social/regimen_fiscal/codigo_postal_fiscal/uso_cfdi`,
`fiscal.ts:82-89`). Más tarde, `/dashboard/suscripcion` llama a
`guardarDatosFiscales`, que escribe **las mismas cinco** (`fiscal.ts:151-156`).
`tenant.domicilio_fiscal`, `tenant.url_aviso_privacidad` y
`tenant.contacto_privacidad` quedan en NULL y ahí se quedan: un grep de las tres
columnas sobre `src/` completo devuelve **un lector** (`repo.ts:751`) y **un
escritor, el sembrador de QA** (`admin/qa-motor.ts:132-133`). Fuera de `src/`
solo las escribe la siembra del demo (`scripts/demo-5k.sql:44-49`). Ninguna
pantalla de ninguno de los dos paneles.

Entonces entra el primer operador, *Juan Pérez*, con la foto de su ticket de
diésel. `ponerAvisoADisposicion` → `getDatosResponsable` →
`return r.razonSocial && r.domicilio ? r : null` (`repo.ts:767`) → `null` →
`'sin_datos'` → `processor.ts:888-900` **bloquea el mensaje** y contesta *"tu
empresa aún no ha terminado de configurar su aviso de privacidad. Avísale a tu
flota"*. Su flota no puede hacer nada: no existe la pantalla. Y `/aviso/<uuid>`
devuelve `notFound()` (`[tenant]/page.tsx:69`) para todo tenant real, así que la
liga del aviso integral no abre nunca.

**Consecuencia.** El titular es cada operador de cada flota real; el responsable
es la flota. Hoy la flota no puede cumplir aunque quiera: no hay aviso integral
publicable, la constancia del art. 16 no se escribe nunca, y el propio arranque
confiesa el remedio: *"Captura `razon_social` y `domicilio_fiscal` **en la tabla
`tenant`**"* (`startup.ts:269`) — a mano, por SQL. La agravante que ya señalé y
sigue viva: el camino de oficina (`processor.ts:730-805`) **no pasa por el
gate**, así que la flota sigue tratando a Juan —creándole viajes, mandándole
WhatsApp— por el otro carril, con `aviso_privacidad_en` en NULL.

**Causa raíz probable.** Las tres columnas nacieron con las migraciones
(0018/0033/0034) para que el motor las leyera y ninguna fase les adjudicó dueño
de captura; el PR #38 tocó siete rubros y no tocó éste.

---

### 2. [CRÍTICO] El Redactor manda el nombre del decisor a un modelo externo, y el aviso que se le entrega a esa persona declara expresamente que eso no pasa

`src/lib/likida/agentes/redactor.ts:161-181` (`:163` la línea del nombre, `:178`
el rol del modelo) · `src/lib/likida/privacidad.ts:758` ·
`src/app/admin/vendedores/consola-vendedores.tsx:111-121`
**(REINCIDENTE parcial del CRÍTICO de prospectos: el arreglo cubrió el otro
camino.)**

**LFPDPPP (mar-2025) art. 14 · art. 15 fr. II y III.**

**Escenario, con el dato nombrado.** *Ing. Ramón Treviño, Director de
Operaciones* está en `prospecto.contacto_nombre`. Javier abre `/admin/vendedores`
y pulsa Redactar sobre esa fila. `accionRedactar`
(`consola-vendedores.tsx:111-116`) llama a `redactarCorreoFrio`, que arma el
dossier:

```
Contacto: ${prospecto.contacto_nombre}            // redactor.ts:163
Notas del vendedor: ${prospecto.notas.slice(0,500)} // redactor.ts:165
```

y lo manda entero a OpenRouter con `role: 'back_office'` (`:178-181`), que es
`openai/gpt-oss-120b` (`models.ts:88`). Sale el nombre completo, el puesto si
está en las notas, y 500 caracteres de notas **sin ningún filtro** — ni
`notasSinPersona`, ni `lineaDecisor`, ni el marcador `{{DECISOR}}`. `seudonimo.ts`
no se importa en este archivo: el import está solo en
`app/api/admin/mapa-prospectos/mensaje/route.ts:23`.

Y aquí está lo que lo separa de un simple hueco: **el aviso público que se le
entrega a Ramón dice lo contrario.** `privacidad.ts:758`, que es lo que pinta
`/aviso/prospectos`:

> *"Cuando un programa redacta el primer mensaje, **tu nombre no sale de
> Likida**: la ficha que recibe el modelo de lenguaje lleva un marcador en lugar
> de tu nombre, y sin tus datos de contacto"*

**Consecuencia.** Ramón Treviño nunca contrató nada con Likida; frente a él
Likida es **responsable** (art. 14). Un tratamiento no informado es incumplimiento
del art. 15 fr. II; un aviso que **afirma como hecho** algo que el código
contradice es una manifestación falsa en el documento con el que Likida acredita
su cumplimiento — es peor que la omisión de ayer, porque ayer faltaba el
documento y hoy el documento miente. Y la comprobación es de una línea: quien
audite abre `/aviso/prospectos`, lee la promesa, y `redactor.ts:163` la desmiente.

*Intento de refutación, que no prospera:* podría argumentarse que el aviso habla
solo del redactor del Cerebro. No dice eso: dice *"un programa"*, en singular
genérico, y el Redactor es exactamente un programa que redacta el primer mensaje.
Tampoco salva la ambigüedad de `notasSinPersona`, que su propio comentario
declara imperfecto (`seudonimo.ts:36-42`): en `redactor.ts` no corre en absoluto.

**Causa raíz probable.** El arreglo se hizo persiguiendo el archivo que el
hallazgo citaba (`mensaje/route.ts`) en vez del **dato** (`contacto_nombre` hacia
cualquier modelo), y el segundo escritor vive en otro directorio.

---

### 3. [ALTO] La baja prometida en el aviso de prospectos no existe: nada en el código lee un "BAJA"

`src/lib/likida/privacidad.ts:766` · `src/app/api/correo/entrante/route.ts:16-45`
· `src/lib/correo/enviar.ts:50-56` · `src/lib/likida/agentes/cola.ts:391-397`

**LFPDPPP (mar-2025) art. 15 fr. IV · art. 26 (oposición).**

**Escenario, con el dato nombrado.** A Ramón le llega el correo frío desde
`avisos@mail.likida.ai` (`enviar.ts:50-56`, remitente por defecto `avisos`).
Abre `/aviso/prospectos`, lee *"Contesta **BAJA** al mismo mensaje que recibiste"*
(`privacidad.ts:766`) y contesta `BAJA` a ese correo. Ese mensaje entra —si
entra— por `POST /api/correo/entrante`, cuyo encabezado declara su alcance: es
*"el buzón de facturas de proveedor"*, resuelve el tenant desde el token del
destinatario `f-<token>@mail.likida.ai` (`route.ts:27-30`) y trata explícitamente
*"un humano respondiendo «gracias»"* como caso a **responder 200 y descartar**
(`:37-44`). Un grep de `BAJA` sobre `src/lib/likida/agentes/`, `src/lib/correo/` y
`src/app/api/correo/` devuelve cero. No hay columna de opt-out en `prospecto`, y
`enviarPiezaPorCorreo` (`cola.ts:303-397`) no consulta ninguna antes de mandar.

**Consecuencia.** El titular ejerció su oposición por el medio que el propio
responsable le señaló, y no queda registro, no arranca el plazo del art. 31, y
—porque la cadencia solo frena 48 horas (`cola.ts:376`)— **le vuelven a
escribir**. El otro canal que el aviso ofrece (`likida.ai@gmail.com`) sí funciona
porque es un buzón humano, y por eso es ALTO y no CRÍTICO; pero de los dos medios
publicados, uno es una promesa vacía y el titular no tiene cómo saber cuál.

**Causa raíz probable.** El aviso se redactó con el criterio correcto de la casa
—"nada que no haga el producto"— y se le aplicó a la retención (que sí la ejecuta
la 0148) pero no al canal de baja, que se escribió como texto sin buscarle
implementación.

---

### 4. [ALTO] El primer toque sale sin la liga del aviso por dos de los tres canales, incluido el único que manda solo

`src/lib/likida/agentes/cola.ts:391-397` ·
`src/app/admin/mapa-prospectos/mensajes.ts:10-36,39-46` ·
`src/app/api/admin/mapa-prospectos/mensaje/route.ts:100-103` ·
`src/lib/correo/plantilla.ts:183,318-321`

**LFPDPPP (mar-2025) art. 16 fr. II** (poner a disposición el aviso simplificado
cuando el dato se obtuvo indirectamente y el contacto es por medio electrónico).

**Escenario, con el dato nombrado.** Tres caminos escriben el primer toque a
Ramón, y `pieAvisoProspectos()` lo llama **uno**:

1. `mapa-prospectos/mensaje/route.ts:100-103` — el redactor del Cerebro. **Lleva
   la liga.** ✔
2. `mensajes.ts:10-36` — las plantillas deterministas `mensajeWa` y
   `correoProspecto`. Cero liga. Y son las que `hrefCorreo`/`hrefWa` usan cuando
   el prospecto **no** fue "trabajado": *"la plantilla determinista es solo el
   respaldo del no trabajado"* (`:38-40`), o sea, el caso masivo de una lista de
   31,778 empresas.
3. `cola.ts:391-397` — `enviarPiezaPorCorreo`, el **único** que sale por Resend
   sin que nadie lo pegue a mano. Manda `cuerpo_final ?? cuerpo` de
   `cola_aprobacion` (lo que escribió `redactor.ts`) y un pie que dice
   *"Recibes este correo porque tu empresa publicó una vacante relacionada con
   liquidación de viajes"* más la URL de la home (`plantilla.ts:318-321`). Un
   grep de `aviso` sobre `cola.ts` devuelve cero.

**Consecuencia.** El correo que la máquina manda sola —el que llega al buzón de
una persona que no sabe que Likida existe— no señala dónde consultar el aviso, que
es la obligación literal de la fr. II. La página `/aviso/prospectos` existe y es
correcta; lo que falla es que la persona a la que se le debe no recibe la liga por
el canal automatizado. Es una falla silenciosa: en el panel todo se ve enviado.

**Causa raíz probable.** El pie se colgó del generador de texto en vez del
**enviador**, que es el único punto por el que pasan todos los caminos.

---

### 5. [ALTO] El gate del aviso sigue sin ser lo primero, y ahora lo que corre delante también despacha

`src/lib/likida/processor.ts:846-874` frente al gate en `:887` ·
`src/lib/likida/oficina_wa.ts:157-167` · `src/lib/agents/analista.ts:288`
**(REINCIDENTE de la c2, agravado por el delta.)**

**LFPDPPP (mar-2025) art. 16 fr. II · art. 2 (concepto de tratamiento).**

**Escenario, con el dato nombrado.** *Ramiro Salas* es dueño de seis camiones y
maneja uno: está de alta como `operador` y como `app_user` con rol `flota_admin`.
Escribe *"oye, ¿cómo vamos con lo de Sabinas?"*. `resolveOperador` acierta; el
bloque de `processor.ts:846-874` resuelve además su cuenta de oficina y llama a
`atenderTextoOficina(..., { incluirPreguntaLibre: !viajeId, incluirDespacho: !viajeId })`
(`:872`). Sin viaje abierto eso llega a `atenderPreguntaLibre`
(`oficina_wa.ts:157`), que manda su **nombre**
(`analista.ts:288`: *"CON QUIÉN HABLAS: ${opts.usuario.nombre}"*) y su **texto
recortado a 1,500 caracteres** (`oficina_wa.ts:165`) a OpenRouter. Todo esto
**antes** de `ponerAvisoADisposicion` (`:887`).

Lo que cambió respecto de ayer: la bandera `incluirDespacho` era `false` en la
forma de la rama y `master` la izó a `!viajeId`. Así que ahora, delante del gate,
también corre el despacho: *"nuevo viaje para Juan Pérez, Puebla a Monterrey,
anticipo 8000"* crea el viaje y le manda WhatsApp a **Juan** —un tercero— sin que
el aviso de nadie se haya puesto a disposición.

**Consecuencia.** El comentario que justifica la colocación dice *"pedir el
informe de la flota no trata datos personales del operador"* (`:842-845`). Deja de
ser cierto en dos frentes: el aviso que ese mismo archivo pone a disposición
enumera *"el contenido de tus mensajes"* como dato tratado (`privacidad.ts:604`),
y despachar trata los datos de un operador que **no** es quien escribe. Agrava que
el gate está de facto siempre en `sin_datos` (hallazgo 1): el único camino que sí
abre en una flota real es justo el que se puso por delante de él.

**Causa raíz probable.** Se resolvió el conflicto orden-de-ejecución vs.
cumplimiento por comentario en vez de partiendo el trabajo en dos —lo que no
trata datos, antes; lo que sí, después— y el merge de `master` ensanchó la
excepción sin releer el comentario que la sostenía.

---

### 6. [ALTO] El piloto de visión manda la pantalla de un portal ya autenticado a un modelo externo, y ningún aviso menciona ese flujo

`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:151,193,370` ·
`.../pagina_playwright.ts:835` · `src/app/privacidad/page.tsx:86` ·
`src/lib/likida/privacidad.ts:604`
**(REINCIDENTE de la c2, idéntico.)**

**LFPDPPP (mar-2025) art. 15 fr. II · art. 35.**

**Escenario, con el dato nombrado.** *Transportes Perla* comparte en
`/dashboard/conexiones` la cuenta de La Gas de su encargado —
`ayudante.contraloria@transportesperla.mx` + contraseña— y se enciende
`FACTURACION_PILOTO` (`adaptadores/registro.ts:180`). El piloto teclea el
usuario, vuelve a hacer `capturaSegura` (`piloto_vision.ts:151`) y manda esa
imagen al modelo (`:370`, `images: [...]`). Viajan dos cosas que la regla 3 del
encabezado —*"LA CONTRASEÑA NO VIAJA AL MODELO"*— no cubre, porque solo gobierna
el canal de texto: el **usuario ya tecleado**, renderizado en claro en el
`<input>` de la captura, y el **texto visible de la página autenticada**, hasta
1,800 caracteres de `document.body.innerText` (`pagina_playwright.ts:835`) —
titular de la cuenta, correo, historial de facturas. `sanitizarProducto` no toca
ese canal.

**Consecuencia.** El titular es el empleado de la flota cuya cuenta se compartió.
Los dos avisos acotan los modelos por escrito: `privacidad.ts:604` dice *"les
llegan **las fotos de tus comprobantes** […] y **el texto de tus mensajes**"* y
`app/privacidad/page.tsx:86` dice *"los modelos de lenguaje que **leen los
comprobantes**"*. Una captura de la sesión abierta de un portal de un tercero no
es ninguna de esas cosas, y el delta de esta ronda —que sí amplió esa cláusula
(M7)— la amplió al chat y no a esto. Sigue siendo ALTO y no CRÍTICO porque la
palanca está apagada.

**Causa raíz probable.** La regla 3 se escribió para el canal de texto y la
imagen entró como "evidencia", categoría que nadie clasificó como salida de datos.

---

### 7. [MEDIO] Nada en el código fija la jurisdicción del proveedor, mientras dos archivos afirman que el stack es 100% USA "por regla legal"

`src/lib/llm/openrouter.ts:249-254` (aplicado en `:313,465,781`) ·
`src/lib/llm/models.ts:29-32,85-89,102` ·
`src/app/api/admin/mapa-prospectos/mensaje/route.ts:11`

**LFPDPPP (mar-2025) art. 15 fr. II** (el aviso describe con quién se comparte).

**Escenario, con el dato nombrado.** El único bloque de ruteo que sale en cada
llamada es:

```ts
const PROVIDER_OPTS = { provider: { data_collection: 'deny' }, usage: { include: true } };
```

`data_collection: 'deny'` filtra por **política de retención**, no por
jurisdicción: no hay `provider.only`, ni `order`, ni sufijo de proveedor en
ningún slug de `DEFAULTS` (`models.ts:56-134`). Y dos de esos defaults son
**modelos open-weight** —`back_office: 'openai/gpt-oss-120b'` (`:89`) y
`extraccion: 'openai/gpt-oss-20b'` (`:102`)— que en OpenRouter los sirven
terceros de hospedaje, no OpenAI. Por `back_office` pasa exactamente el dossier
de `redactor.ts:163` con `Contacto: Ing. Ramón Treviño`. Mientras tanto
`models.ts:31-32` afirma *"REGLA (16-ago-2026): TODO el stack de este repo —
defaults y fallbacks — es de proveedores USA. Sin excepciones por precio"* y
`mensaje/route.ts:11` la repite como *"stack 100% USA, regla legal"*.

**Consecuencia.** La regla que el repo llama legal no la hace cumplir ninguna
línea de código: la aplica el criterio de quien escribió el slug, y OpenRouter
elige el host. Nadie —ni un contralor, ni la autoridad— puede verificar la
afirmación leyendo el repo, y una rotación de modelo por env
(`LIKIDA_MODEL_BACK_OFFICE`) la rompe sin que nada se entere. Es MEDIO y no ALTO
porque el aviso al titular **no** promete jurisdicción: la promesa vive solo
hacia adentro. Pero es la clase de afirmación que acaba en un anexo de
subencargados o en una respuesta a la autoridad.

**Causa raíz probable.** La decisión se tomó como política de selección de
modelos (una tabla de slugs) y no como control técnico (un allowlist de
proveedores en el gateway).

---

### 8. [MEDIO] El correo *adivinado* de una persona cuenta como decisor verificado en el score que decide a quién se le escribe

`src/lib/admin/prospectos-mapa.ts:573` frente a `:241` y `:276-278` ·
`supabase/migrations/0138_prospecto_persona.sql:41-50`
**(REINCIDENTE de la c2.)**

**LFPDPPP (mar-2025) art. 22 / principio de calidad** (dato exacto y correcto).

**Escenario, con el dato nombrado.** El agente no encuentra el correo de *Ramón
Treviño* y lo deduce del patrón de la empresa: `ramon.trevino@transportesx.mx`,
con `origen: 'inferido'`. La 0138 solo prohíbe que un inferido sea
`confianza: 'alta'` (`:49-50`); `'media'` es el **default de la columna**
(`:47`). `getDetalleProspecto` llama a `scoreCierre` con
`personasVerificadas: (p.prospecto_persona ?? []).filter((x) => x.confianza !== 'baja').length`
(`:573`) — y el contrato del parámetro dice *"Personas de `prospecto_persona` con
contacto **NO inferido**"* (`:241`) y el cuerpo lo repite: *"`inferido` no cuenta:
un correo adivinado no es alcance, es una apuesta"* (`:276-278`). El filtro no
mira `origen`. Ramón suma +10 (`:278`) y su empresa sube en la cola.

**Consecuencia.** Un dato personal que Likida **fabricó** —no lo obtuvo de fuente
pública, así que ni siquiera el supuesto de fuente pública lo ampara— se puntúa
como verificado y termina recibiendo correo comercial en una dirección que puede
ser de otra persona con ese nombre. El aviso de prospectos lo declara con
honestidad (`privacidad.ts:748`: *"Algunos correos no se leyeron en ninguna
parte: se dedujeron […] y así quedan marcados"*) y el consumidor del dato ignora
justo esa marca.

**Causa raíz probable.** `confianza` y `origen` son dos ejes y el llamador usó el
que tenía a mano; el constraint que los liga solo cubre el caso extremo.

---

### 9. [MEDIO] La credencial revocada conserva su contraseña cifrada para siempre, y ninguna purga la alcanza

`src/lib/likida/conectores/credenciales.ts:157-176` ·
`src/lib/likida/facturacion/cuentas.ts:40,75,116` ·
`supabase/migrations/0104_retencion_operativa.sql` · `0148` (`mantenimiento_de_datos`)
**(REINCIDENTE de la c2.)**

**LFPDPPP (mar-2025) art. 11** (conservar solo lo necesario para la finalidad).

**Escenario, con el dato nombrado.** *Transportes Perla* retira su cuenta de La
Gas: `/dashboard/conexiones` llama a `desactivarCredencial`, que hace
`update({ activo: false })` (`:170-176`). El acceso queda cortado —los lectores
filtran por `activo = true` y la sesión del portal se invalida (`:191-192`)— pero
`valores_cifrados` se queda en la fila, con la contraseña dentro,
indefinidamente. El comentario lo declara: *"NO se borra — el cifrado se queda
para poder auditar qué acceso existió y hasta cuándo"* (`:157-159`). Esa pregunta
la contestan `pistas`, `creada_en` y la fila de `bitacora_auditoria` que la propia
función escribe (`:182`); la **contraseña** no aporta nada a ella.
`mantenimiento_de_datos`, redefinida por la 0148 con ocho purgas (`:117-124`), no
menciona `conector_credencial`.

**Consecuencia.** El titular es la persona cuya cuenta de portal es. Se conserva
un secreto **todavía válido del otro lado** —el portal de La Gas no sabe que
Likida lo desactivó— mucho después de que su finalidad terminó. Si
`LIKIDA_COFRE_LLAVE` se filtra, lo recuperable no son las cuentas vivas: son
todas las que alguna vez existieron. Choca con `app/privacidad/page.tsx:107`, que
enumera los plazos que sí corren solos y no incluye éste.

**Causa raíz probable.** Se copió el criterio de "revocar una llave de API" —donde
el proveedor invalida el secreto— a un caso donde el secreto sigue sirviendo.

---

### 10. [MEDIO] `/privacidad` no enumera el contenido de los mensajes ni su salida al analista, y ahí Likida es responsable, no encargada

`src/app/privacidad/page.tsx:59-67,86` · `src/lib/likida/oficina_wa.ts:157-167` ·
`src/lib/agents/analista.ts:288`
**(REINCIDENTE de la c2; el arreglo M7 tocó el aviso del operador, no éste.)**

**LFPDPPP (mar-2025) art. 15 fr. II y art. 35.**

**Escenario, con el dato nombrado.** *Ana Ruiz*, contadora de la flota, escribe
por el WhatsApp de Likida *"¿por qué la liquidación de Juan salió con diferencia?
el mes pasado también"*. `atenderPreguntaLibre` manda su **nombre**
(`analista.ts:288`) y su texto (`oficina_wa.ts:165`) a OpenRouter. En
`/privacidad`, "Qué datos se tratan" enumera nombre, correo, teléfono, los datos
fiscales de la empresa, el enlace de acceso y *"registros técnicos de uso"*
(`:59-67`) — el **contenido de sus mensajes no está**; y "Con quién se comparten"
sigue acotando los modelos a *"los modelos de lenguaje que **leen los
comprobantes**"* (`:86`). El aviso del operador **sí** se corrigió
(`privacidad.ts:604`), lo que hace la asimetría más visible, no menos.

**Consecuencia.** El titular es la usuaria del panel, y ahí Likida **es
responsable** por su propia declaración (`page.tsx:50`): no responde por contrato
ante la flota, responde ante la autoridad. Un dato tratado que el aviso no
enuncia incumple la fr. II, y una salida a un tercero descrita más estrecha de lo
que es incumple el art. 35.

**Causa raíz probable.** El párrafo se corrigió en `privacidad.ts` (el aviso de la
flota) y `app/privacidad/page.tsx` es un texto distinto que nadie sincronizó.

---

### 11. [MEDIO] La foto del usuario vive en un bucket público, no está en la lista del art. 15 fr. II, y el borrado de cuenta no la alcanza

`src/app/dashboard/mi-perfil/page.tsx:113-121` ·
`src/app/admin/mi-perfil/page.tsx:70-72` ·
`supabase/migrations/0046_perfil_avatar.sql:17-19,42-45` ·
`src/app/privacidad/page.tsx:59-67,125-129`

**LFPDPPP (mar-2025) art. 15 fr. II · art. 18** (deber de seguridad).

**Escenario, con el dato nombrado.** *Ana Ruiz* sube su foto en
`/dashboard/mi-perfil`. Se guarda en `avatares/{userId}/avatar.jpg`
(`page.tsx:113-115`) y la URL se obtiene con `getPublicUrl` (`:117`). El bucket
se creó `public = true` (`0046:17-19`) y tiene policy `avatares_lectura_publica`
`for select to anon` (`0046:42-45`). Es decir: la fotografía de la cara de una
persona identificada queda servible **sin sesión** desde `*.supabase.co`, de
forma permanente. Comparado con el resto del sistema, es la excepción:
`liquidaciones` (0008), `comprobantes` (0039) y `bus` (0127) son privados y se
sirven con URL firmada, y los tres lo dicen en su comentario.

Dos cosas más: `/privacidad` "Qué datos se tratan" (`:59-67`) enumera nombre,
correo, teléfono, datos fiscales, enlace de acceso y registros técnicos —**no la
fotografía**—; y "Cómo pedir que se borre tu cuenta" promete *"Se borran tus
datos de cuenta y de acceso"* (`:127`) sin que nada borre el objeto del bucket:
las tres policies de escritura de la 0046 son `to authenticated` sobre la propia
carpeta, así que el día que la cuenta deja de existir, el archivo se queda y sigue
público.

**Consecuencia.** El titular es el usuario del panel, y ahí Likida es
responsable. Se trata un dato que el aviso no enumera y se publica —no se
"comparte con un encargado": se pone en la vía pública— sin decirlo en ninguna
sección. La URL lleva un UUID, así que no se enumera trivialmente; por eso es
MEDIO y no ALTO. Pero una URL de imagen viaja en capturas, en cachés y en el
`img-src` que `proxy.ts:42` abre, y una vez fuera es permanente.

**Causa raíz probable.** El bucket se hizo público para que el `<img>` del sidebar
no necesitara firmar URL, y la decisión se razonó como comodidad de render, no
como publicación de un dato personal.

---

### 12. [BAJO] La consola de Javier sigue citando el art. 32 de la ley abrogada, y un comentario del motor afirma un plazo que ese artículo nunca dijo

`src/lib/admin/guardia.ts:21,73` · `src/lib/admin/escalaciones.ts:244` ·
`src/app/admin/compliance/page.tsx:33` · `src/lib/likida/repo.ts:959` ·
`src/lib/likida/processor.ts:215` · `src/lib/likida/privacidad.ts:653-656`

**LFPDPPP (mar-2025): el plazo ARCO es el art. 31; el 32 es de la ley abrogada el
21-mar-2025** (tabla de equivalencias verificada,
`docs/conocimiento/11-datos-personales.md:48`).

**Escenario.** El arreglo `3e31569` corrigió `/dashboard/arco` (hoy `:24,73,84`
citan el art. 31). Quedaron seis sitios con el artículo viejo, y dos de ellos son
**texto que se pinta**, no comentario: `guardia.ts:73` produce la regla
*"Solicitud ARCO con el plazo legal VENCIDO (LFPDPPP art. 32) — incumplimiento,
no pendiente"*, y `escalaciones.ts:244` el detalle *"El titular tiene derecho a
respuesta en 20 días hábiles (LFPDPPP art. 32)"*. Aparte, `privacidad.ts:653-656`
dice *"La LFPDPPP art. 32 **fija 15**"* y añade *"Si el aviso cambia a 15, que
este número lo siga"* — el art. 31 vigente da **20 días para contestar y 15 más
para ejecutar** (`11-datos-personales.md:656`), que son dos plazos distintos, no
uno.

**Consecuencia.** Baja porque el número que el producto usa (`DIAS_HABILES_ARCO =
20`, `privacidad.ts:657`) es el correcto y lo que se le promete al titular es
correcto. Lo que está mal es el fundamento citado en la consola desde la que se
atienden esas solicitudes, y una nota que invita explícitamente a bajar el plazo
a 15 — el día que alguien la siga, el producto incumplirá citando la ley.

**Causa raíz probable.** La sustitución 32→31 se hizo sobre el archivo que el
hallazgo nombraba en vez de sobre el grep completo.

---

### 13. [BAJO] El correo del usuario se guarda en una cookie del navegador y ninguna página lo dice

`src/lib/auth/reenvio_enlace.ts:44,52-55,61-66` · `src/app/privacidad/page.tsx`
(sin mención de cookies en ninguna de sus ocho secciones)
**(REINCIDENTE de la c2.)**

**Reglamento de la LFPDPPP art. 30** (deber de informar sobre mecanismos que
recaban datos en el equipo del titular).

**Escenario, con el dato nombrado.** *Ana Ruiz* teclea su correo en `/login`.
`guardarCorreoParaReenvio` escribe `likida_correo_enlace = ana.ruiz%40flota.mx`
en una cookie de una hora (`:61-66`). No es un identificador opaco: es el dato
personal en claro (URL-encoded), y no se borra al entrar. Grep de "cookie" sobre
`src/app/privacidad/` y `privacidad.ts`: cero resultados.

**Consecuencia.** El daño material es pequeño —la cookie es `httpOnly` y `secure`
(`:52-55`), así que ningún script la lee y el reenvío solo manda al buzón de la
propia Ana— y por eso es BAJO. Lo que falta es la sección del aviso.

*Honestidad sobre el fundamento:* el art. 30 del Reglamento no está transcrito en
ninguna ficha `verificado_fuente_primaria` de `normas/`; lo cito por el criterio
del propio repo, que trata el Reglamento de 2011 como vigente en lo que no se
oponga a la ley (`11-datos-personales.md` §3). Verificar el texto antes de
redactar el párrafo.

---

## Lo que revisé y está bien

- **El aviso de prospectos existe, es público y no depende de un tenant.**
  `src/app/aviso/prospectos/page.tsx:1-55` con el segmento estático delante del
  dinámico `[tenant]`, y el texto en `privacidad.ts:728-808` para que se pruebe
  por contenido. Cubre las seis fracciones del art. 15, dice de dónde salieron los
  datos, y **declara los correos inferidos** como no verificados (`:748`).
- **La purga de prospectos la ejecuta código, no un párrafo.**
  `0148:60-86` borra `prospecto_persona` y anula `prospecto.contacto_nombre` a los
  365 días sin toque, solo en estados sin trato vivo, respetando
  `conservar_hasta`; `mantenimiento_de_datos` la llama (`:124`) y la expone como
  `prospectoPersonasPurgadas` (`:135`). La función está revocada de
  `public/anon/authenticated` (`:91-94`).
- **La seudonimización del Cerebro está bien hecha.** `seudonimo.ts:43-56` quita
  correos, teléfonos y **cada nombre y apellido suelto de ≥3 letras** con límites
  Unicode; `lineaDecisor` (`:59-63`) manda un marcador; `reponerDecisor`
  (`:67-75`) repone el nombre de pila y **limpia el marcador** cuando no hay
  contacto, en vez de dejarlo impreso. Y la ruta tiene puerta (`sesionSuperadmin`)
  y techo (120/hora) antes de todo (`mensaje/route.ts:49-55`).
- **`models.ts` ya no promete lo que no tiene.** `:22-32` dice explícitamente que
  `data_collection: 'deny'` es una preferencia de ruteo y **no** ZDR, que nadie lo
  firmó con OpenRouter, y que el aviso al titular no puede prometer menos que la
  justificación interna.
- **El ARCO se registra pase lo que pase.** `processor.ts:229-244` inserta la
  solicitud en su propio try antes de leer al responsable, y `:246` decide solo el
  texto de la respuesta; el chequeo de `pideAtencionPrivacidad` sigue arriba de la
  resolución de identidad (`:599-608` y la red redundante de `:826-829`).
- **La oposición del art. 26 fr. II apaga la lista nominal.**
  `analytics.ts:360` excluye a quien la ejerció, y el único llamador
  (`dashboard/agentes/liquidacion/page.tsx:61`) no pide `nominal`.
- **Los buckets de datos fiscales son privados y lo dicen.** `liquidaciones`
  (0008), `comprobantes` (0039:30-38) y `bus` (0127:133-135), los tres sin
  policies y servidos con URL firmada por el service-role.
- **El cofre sigue siendo cofre.** AES-256-GCM con la llave solo en entorno,
  `cifrar` lanza si falta, el CHECK `conector_credencial_no_en_claro` como segundo
  candado, `listarCredenciales` nunca selecciona `valores_cifrados`, y desactivar
  **también** invalida la sesión del portal (`credenciales.ts:184-192`) — que era
  el ALTO de la auditoría 1 y sigue cerrado.
- **La siembra del demo de 5,000 camiones no mete un solo dato real.**
  `scripts/demo-5k.sql:8` fija teléfonos del rango falso `5215559xxxxxx`, RFC y
  placas inventados, y `avisado_en` en NULL para que el cron de WhatsApp no
  escriba (`:22`).
- **La ruta de correo entrante no es un buzón abierto.** Firma svix antes de leer
  el cuerpo, tenant desde el destinatario y no desde el `from`, idempotencia al
  final (`api/correo/entrante/route.ts:22-32,74-90`).
- **`prospecto_persona` no la ve ninguna flota.** RLS encendida con policy de
  solo-lectura para `superadmin` (0138:69-75), y la RPC de cadencia quedó revocada
  de `public/anon/authenticated` (0147:137-138).

---

## Lo que NO alcancé a revisar

- **El texto vigente de la LFPDPPP de marzo 2025 más allá de los cinco artículos
  transcritos** en `normas/lfpdppp-*.yaml`. Los arts. 9, 11, 14, 18, 22, 26 y 31
  que cito salen de la tabla de equivalencias de `11-datos-personales.md:44-60`,
  no de la fuente primaria abierta por mí. **Sigue sin ficha verificada el plazo
  ARCO**, que es justo el número que dos pantallas imprimen.
- **`bitacora_auditoria` y `evento_seguridad` (0133) a fondo.** Confirmé que
  `desactivarCredencial` y la cola escriben ahí, no qué campos personales quedan
  en `detalle` ni con qué retención — la 0148 no los purga.
- **`al_vuelo.ts`, `enrutar.ts` y `avisar.ts`.** Leídos solo por el borde de las
  credenciales y la captura; qué campos del ticket lleva el aviso al jefe sigue
  sin auditarse.
- **Los contratos**: anexo de subencargado con OpenRouter y autorización de
  subcontratación con la flota. Son documentos, no código, y el propio
  `models.ts:28` los marca como pendiente #3.
- **La landing (`likida.ai`), que vive en otro repo.** Sigue sin poder comprobarse
  si `/getdemo` muestra aviso o casilla antes de escribir `contacto_nombre`,
  `correo` y `telefono` en `prospecto` — y `scoreCierre:272` premia con +20 a
  esa fuente precisamente porque "ya hay permiso".
- **Si `notasSinPersona` deja pasar a terceros nombrados en prosa.** Su propio
  comentario lo admite (`seudonimo.ts:36-42`); no construí el caso con valores
  porque el camino que sí filtra ya está cubierto y el que no filtra nada es el
  hallazgo 2.
