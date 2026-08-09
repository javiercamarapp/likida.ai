# Cumplimiento legal — auditoría 17 (pase 2)

**Nota: 3/10** (antes 4). Razón del movimiento: **deuda que cobró factura**. De
los 14 hallazgos del pase 1 no se cerró **ninguno** —el `git diff 94c0733..HEAD`
acotado a la superficie legal devuelve un solo archivo cambiado, y es el latido
de `normas/`—, y encima los dos commits del foco empujaron en la misma
dirección: `c5a7c19` abre un canal donde **Likida inicia** el contacto y no pasa
por el aviso, y `31babfd` borra el único código del repo que implementaba el
derecho de acceso del titular sobre sus propios datos. Con el C5 abierto y un
segundo camino de primer contacto sin aviso, el ancla del rubro ("3 o menos si
hay transferencia de datos personales sin cobertura") ya no admite un 4.

**El riesgo mayor de hoy:** el producto tiene tres caminos que le escriben al
chofer por WhatsApp **antes** de que exista el aviso —el de asignación de viaje
(que sí entrega, porque va por plantilla), el recordatorio nuevo y la
escalación—, y ninguno de los tres llama a `ponerAvisoADisposicion`. El bloqueo
"sin aviso no hay tratamiento" solo vigila la puerta de entrada; la de salida no
tiene guardia.

---

## Estado de los hallazgos del pase 1

Verificación mecánica primero: `git diff --stat 94c0733..HEAD` sobre
`privacidad.ts`, `repo.ts`, `dashboard/arco/`, `admin/compliance/`,
`app/privacidad/`, `app/terminos/`, `meta/client.ts`, `lib/llm/`,
`intake/sanitizar.ts`, `api/cron/facturar/`, `docs/conocimiento/`, `normas/` y
`seed.sql` → **1 archivo, `normas/.latido-vigilancia`**. Ningún hallazgo del
pase 1 pudo cerrarse. Además abrí uno por uno y confirmé el texto en la línea:

| # | Hallazgo pase 1 | Sev. | Estado |
|---|---|---|---|
| 1 | Foto → modelo externo antes del aviso, rama sin viaje (`processor.ts:520-525` vs `:636`) | CRÍTICO | **REINCIDENTE**. Verificado línea por línea abajo. |
| 2 | "Que borren mis datos" no abre el canal ARCO (`privacidad.ts:351-361` vs `:602-609`) | ALTO | **REINCIDENTE**. `pideAtencionPrivacidad` sigue exigiendo `mis datos personales`; `tipoDeSolicitudArco:604` sigue entrenado para `borr…`. |
| 3 | La revocación del consentimiento no la detecta nada (`privacidad.ts:546` vs `:351-361`) | ALTO | **REINCIDENTE**. El texto del integral sigue diciendo "retirar tu consentimiento"; la compuerta no lo conoce. |
| 4 | La oposición se registra y no apaga nada (`privacidad.ts:516-522`, `repo.ts:877-900`) | ALTO | **REINCIDENTE**, y **empeorado**: ver el ALTO nuevo del recordatorio. |
| 5 | Nada borra: la cancelación se "resuelve" con un texto (`repo.ts:985-1007`) | ALTO | **REINCIDENTE**. Sigue sin existir una ruta de supresión. |
| 6 | "Vencen pronto (≤ 5 días)" se enciende el día del vencimiento (`dashboard/arco/page.tsx:71`, `:87`) | ALTO | **REINCIDENTE**. Confirmado: `venceEn(s.venceEn) <= hoy` bajo el rótulo "≤ 5 días". |
| 7 | Likida publica aviso y ToS sin decir quién es el responsable (`app/privacidad/page.tsx:40-41`, `app/terminos/page.tsx:38-41`) | ALTO | **REINCIDENTE**. `razonSocial: null`, `domicilio: null`, `jurisdiccion: null`. |
| 8 | Upstash/QStash recibe filas de `gasto` y no está en el anexo de subencargados | ALTO | **REINCIDENTE**. `api/cron/facturar` y `52-anexo-subencargados.md` sin cambios. |
| 9 | ToS reincidente: "No timbra facturas" (`app/terminos/page.tsx:57`, `:174`) | MEDIO | **REINCIDENTE, quinta ronda**. Literal en pantalla, y el 🔴 de contrato de encargado pendiente de firma sigue ahí. |
| 10 | La plantilla ARCO manda el literal `'la flota'` (`meta/client.ts:467`) | MEDIO | **REINCIDENTE**. Verificado: `parameters: [{ type: 'text', text: 'la flota' }, …]`. |
| 11 | Se cita la ley abrogada: "LFPDPPP art. 32" para los plazos ARCO | MEDIO | **REINCIDENTE**. `privacidad.ts:612` sigue diciendo "La LFPDPPP art. 32 fija 15". |
| 12 | El aviso de Likida omite al procesador de pagos y al PAC (`app/privacidad/page.tsx:79`) | MEDIO | **REINCIDENTE**. Las cuatro categorías siguen siendo las mismas. |
| 13 | La liga sembrada del aviso apunta a `likida.ai`, no a `app.likida.ai` (`seed.sql:55`) | BAJO | **REINCIDENTE**. |
| 14 | `normas/lfpdppp-15-16.yaml:65` apunta a `src/lib/cuadra/privacidad.ts` (borrado) | BAJO | **REINCIDENTE**. Sigue literal. |

---

## Hallazgos

### [CRÍTICO] La foto viaja al modelo externo antes del aviso cuando no hay viaje abierto — REINCIDENTE (C5)
`src/lib/likida/processor.ts:470` (apertura de `if (!viajeId)`), `:522`, `:524`,
`:525`, `:604` (cierre de la rama), `:636` (donde por fin corre
`ponerAvisoADisposicion`).

Reverificado línea por línea en el árbol post-merge: el orden es idéntico al del
pase 1. Escenario, con valores: operador `o1` de `t1`, `aviso_privacidad_en =
NULL`; la oficina no le ha abierto viaje; manda once fotos. `getOpenViaje`
devuelve `null` (`:468`) y por cada foto corren `downloadMediaAsDataUrl`
(`:522`), `subirComprobante` (`:524`) y `extraerComprobante` (`:525` → OpenRouter
→ Gemini). El bloqueo `avisoPuesto !== 'puesto'` está 166 líneas más abajo, en
`:637`, dentro de la rama **con** viaje.

Consecuencia: once comprobantes de una persona física identificada salen hacia un
subencargado en el extranjero sin que el titular haya recibido el aviso
simplificado del art. 16 fr. II, y sin fila que acredite la puesta a disposición
—que es la carga del responsable, o sea la flota. Es exactamente lo que
`processor.ts:638-639` declara como el motivo de existir del bloqueo.

Causa raíz probable: la rama "la foto tampoco se tira" quedó por encima del
bloqueo en el orden de ejecución, y el único test que lo ejercita
(`aviso_bloqueo.test.ts:23`) mockea `getOpenViaje: vi.fn(async () => 'v1')`, así
que el camino sin viaje nunca se mide.

---

### [CRÍTICO] Likida hace el PRIMER contacto por WhatsApp sin aviso — y por plantilla, que sí entrega
`src/lib/likida/operacion.ts:585` (`crearViaje` → `avisarAlChofer`), `:646-657`;
`src/lib/likida/notificar.ts:16-21`, `:43`, `:50`, `:170-172`.
Contra `normas/lfpdppp-15-16.yaml:59-61`: *"tiene que darle el mecanismo para
ponerlo a disposición **en el primer contacto por WhatsApp**, y guardar
constancia de que se puso."*

Escenario, con los valores del seed del demo: el encargado da de alta al operador
`33333333-0000-0000-0000-000000000001` — Juan Pérez Ramírez, teléfono
`529993700779`, `aviso_privacidad_en = NULL`, `aviso_privacidad_claim_en =
NULL` — y crea el viaje `VJ-2026-0001` (Silao, GTO → Nuevo Laredo, TAM, anticipo
$10,600.00). `crearViaje` (`operacion.ts:585`) llama a `avisarAlChofer` en cuanto
vuelve el insert, y `notificarAsignacion` (`notificar.ts:170`) manda
`sendTemplate('viaje_asignado', …)` con los cuatro parámetros de
`piezasDeDatos`: `["Viaje VJ-2026-0001", "Ruta: Silao, GTO → Nuevo Laredo, TAM",
"Salida: 9 ago 2026", "Unidad: falta asignarte una, anticipo $10,600.00"]`, más
el cuerpo aprobado que cierra con `CIERRE` (`:50`): **"Manda por aquí la foto de
cada ticket."** Nada en ese camino toca `ponerAvisoADisposicion`. El aviso solo
existe en `processor.ts:636`, que es el camino de **entrada**, y se ejecuta
cuando Juan contesta — es decir, después.

Y esto **sí llega**, a diferencia del recordatorio nuevo: el propio archivo
razona (`notificar.ts:16-21`) que va por plantilla justamente porque Likida
inicia la conversación y fuera de la ventana de 24 h WhatsApp solo entrega
plantillas aprobadas.

Consecuencia: el primer mensaje que un titular recibe de este producto no es el
aviso de privacidad: es un mensaje que le dice de qué viaje se trata, con cuánto
dinero, y que le **pide** que empiece a mandar comprobantes. El art. 16 fr. II
exige la modalidad simplificada al obtener los datos por medio electrónico, y la
constancia (`operador.aviso_privacidad_en`, mig. 0033) queda en NULL mientras el
canal ya está abierto y solicitando datos. Frente a la autoridad, la flota no
tiene con qué probar la puesta a disposición del periodo en que su chofer ya
estaba recibiendo instrucciones por el canal. La misma ficha que el repo trata
como fuente de verdad nombra el momento —"el primer contacto por WhatsApp"— y es
el que se salta.

Causa raíz probable: el aviso se cableó al **procesador de entrada**
(`processInbound`), y todo lo que sale por iniciativa del sistema
—`notificar.ts`, `escalar_viaje.ts`, `recordatorio_comprobacion.ts`,
`avisar_cierre.ts`— se construyó después, cada uno con su propio `sendText` /
`sendTemplate`, sin una puerta común que exigiera la constancia.

---

### [ALTO] El recordatorio nuevo no pregunta si hay aviso, ni si el operador sigue activo, ni si pidió que dejaran de escribirle
`src/lib/likida/recordatorio_comprobacion.ts:54-61` (la consulta) y `:109-145`
(el envío). La consulta selecciona `id, tenant_id, folio, operador_id,
fecha_inicio, operador(nombre, telefono)` filtrando por `estatus`,
`recordatorio_comprobacion_en is null` y `fecha_inicio <= limite`. No lee
`operador.aviso_privacidad_en`, no lee `operador.activo` (que existe desde
`0001_init.sql:34`), y no consulta `solicitud_arco`. Ningún archivo del repo lee
`solicitud_arco` fuera de `admin/compliance/page.tsx` y `dashboard/arco/page.tsx`.

Escenario A — el tenant sin aviso posible. Flota `t9` con
`tenant.razon_social = NULL`: `getDatosResponsable` devuelve `null`,
`avisoSimplificado` devuelve `null`, y cuando su operador `o9` escribe con viaje
abierto, `processor.ts:637-653` bloquea el tratamiento y le contesta *"No puedo
procesar tus comprobantes todavía: tu empresa aún no ha terminado de configurar
su aviso de privacidad"*. Ese mensaje entrante abre la ventana de 24 h. Si el
viaje `VJ-9001` lleva 3 días abierto, la corrida del cron de la hora siguiente
(`vercel.json`, `0 * * * *`) le manda por `sendText`: *"Llevas 3 días con tu
viaje **VJ-9001** sin mandarme comprobantes. 📋 Mándame las fotos de tus recibos
(diésel, casetas, lo que traigas) para irlos anotando."* El producto acaba de
negarse a tratar sus datos por falta de aviso y tres días después se los pide.

Escenario B — el que se opuso. Operador `o5` escribe `me opongo a que un programa
revise mis comprobantes`; `pideAtencionPrivacidad` lo reconoce, se inserta
`solicitud_arco(tipo='oposicion', estado='recibida')` y se le contesta que queda
registrada. Su viaje `VJ-5501` sigue abierto: al tercer día el mismo cron le
insiste para que mande más comprobantes al mismo tratamiento automatizado al que
se opuso. No hay palabra de baja en el texto (`armarRecordatorioComprobacion:84-92`
no ofrece ninguna) ni columna que la soporte.

Escenario C — el que ya no trabaja ahí. `operador.activo = false` desde el
12-jul-2026, pero su viaje `VJ-4407` quedó en `abierto` porque nadie lo cerró.
`viajesSinComprobar` no mira `activo`, así que sigue siendo candidato; y como la
migración `0087` **no rellena** `recordatorio_comprobacion_en` para las filas
existentes, en la primera corrida tras el despliegue entran de golpe todos los
viajes abiertos con `fecha_inicio` vieja, hasta 100 por hora
(`recordatorio_comprobacion.ts:61`), con el `dias` calculado en `:134` dando
cifras de tres dígitos.

Consecuencia: el único derecho que este producto activa por sí mismo (art. 26
fr. II) ahora tiene, además, un canal que le escribe al titular para pedirle más
datos del mismo tratamiento; y el art. 15 fr. IV —"opciones y medios para limitar
el uso"— no tiene expresión en el canal que Likida inicia. Para el titular, la
lectura es que oponerse no sirvió de nada.

Causa raíz probable: `recordatorio_comprobacion.ts` se escribió como clon de
`escalar_viaje.ts` (el propio encabezado lo dice tres veces) y heredó su modelo
mental —"un viaje que se pasa de tiempo"—, que es de operación; nadie preguntó
del lado del titular. Sus 15 pruebas no mencionan privacidad ni una vez.

---

### [ALTO] Se borró el único código que implementaba el derecho de acceso del titular, y el aviso lo sigue prometiendo
`31babfd` borra `src/lib/likida/chofer.ts` (499 líneas). En el árbol anterior,
`git show 31babfd^:src/lib/likida/chofer.ts:294-308` documentaba `misComprobantes`
con estas palabras: *"Aquí el que mira es el TITULAR de esos datos mirando los
suyos —derecho de acceso, **LFPDPPP art. 22**— y es además quien tomó la foto."*
Contra `src/lib/likida/privacidad.ts:536-538`, que sigue prometiendo *"Tienes
derecho a **Acceder** a tus datos"*.

Escenario: Juan Pérez escribe por WhatsApp `qué datos tienen de mí`.
`pideAtencionPrivacidad` no casa (no dice `privacidad`, ni `arco`, ni `mis datos
personales`) — pero aun casando, el camino termina en
`registrarSolicitudArco(tipo='acceso')` y en que el contralor escriba a mano un
texto libre en `/dashboard/arco`. Antes del 7-ago-2026 tenía además
`/chofer/comprobantes`, que le enseñaba sus propios gastos con liga firmada de
vida corta a **su propia foto**, y `/chofer/liquidacion` y `/mis-viajes` con su
historial. Hoy eso devuelve 404 y no hay sustituto: `consulta_chofer.ts` solo
contesta saldo/faltantes/último **del viaje abierto**, `processor.ts:2131` le
manda el PDF de la liquidación **en el momento del cierre**, y ninguna de las dos
cosas es acceso a sus datos ni existe si no hay viaje en curso.

Consecuencia: el derecho de acceso (art. 22) pasó de tener una implementación
—self-service, instantánea, gratuita, con la foto incluida— a depender al 100 %
de que el contralor de la flota conteste un ticket a mano dentro de 20 días
hábiles, en un panel que además no le avisa cuando llega uno (hallazgo 6 del pase
1, reincidente). Y quien más lo va a ejercer es justamente el ex-chofer, que ya
no tiene viaje abierto ni razón para escribirle al bot.

Causa raíz probable: el borrado se justificó por seguridad y superficie de auth
—que es un argumento correcto en su propio rubro— sin que nadie inventariara qué
obligaciones del titular estaban implementadas dentro de esa carpeta. El commit
no menciona datos personales; la migración `0086` sí aclara que la **tabla**
`operador` no se toca, pero no que el acceso del titular se iba con el login.

---

### [MEDIO] El sello del recordatorio dice "se le mandó" también cuando Meta no entregó nada, y no queda constancia de qué se mandó
`src/lib/likida/recordatorio_comprobacion.ts:116-141` (el claim va antes del
envío, a propósito) y `supabase/migrations/0087_recordatorio_comprobacion.sql:18`,
cuyo `comment on column` dice: *"Cuándo se le mandó al operador el recordatorio
automático… NULL = no se ha mandado."*

Escenario, con valores: operador `o7`, viaje `VJ-7702`, `fecha_inicio =
2026-08-04`, sin mensajes entrantes desde el 2026-08-04 (la ventana de 24 h está
cerrada). El 2026-08-07 a las 14:00 el cron gana el claim y escribe
`recordatorio_comprobacion_en = '2026-08-07T14:00:00Z'`; después llama a
`sendText` (`:135`), Meta lo rechaza con `131047` porque es texto libre fuera de
ventana, `sendText` devuelve `null` y el código apunta `"VJ-7702: WhatsApp
rechazó el envío"` en `fallos`. La fila queda para siempre diciendo que se le
mandó, y como el filtro es `is('recordatorio_comprobacion_en', null)`, `o7` no
vuelve a ser candidato nunca. A diferencia de `escalar_viaje.ts:224-232`, este
camino **no tiene plantilla de respaldo**, así que ese es el desenlace normal y no
el excepcional.

Consecuencia: dos capas, y la segunda es la del rubro. (a) El operador que más
falta hace que reciba el recordatorio es precisamente el que lleva días sin
escribir, y es el único que nunca lo va a recibir. (b) La base guarda una
afirmación de comunicación con el titular que no ocurrió, y es la misma familia
de error que este repo ya cerró para el aviso de privacidad en `0033`
(constancia separada de la reserva, escrita solo tras un id de Meta). Aquí no hay
ni id de Meta guardado ni copia del texto: `sendText` devuelve el `wamid` y
`:135` lo descarta con `if (enviado)`. Si mañana un titular reclama un mensaje que
no autorizó, Likida no puede exhibir qué se le mandó ni cuándo llegó.

Causa raíz probable: el patrón "reclamar antes de enviar" se copió de
`escalar_viaje.ts` sin copiar su otra mitad —la caída a plantilla— ni el criterio
de `0033` sobre qué es reserva y qué es constancia.

---

### [BAJO] El panel le dice al contralor que su chofer ve sus datos en `/mis-viajes`, y esa ruta ya no existe
`src/app/dashboard/usuarios/page.tsx:8-17`: el comentario dice *"Los cinco roles
que la base admite (`app_user.rol`, check constraint)"* —son cuatro desde
`0086`— y la línea `:16` describe el rol así:
`operador: 'No entra a este panel: usa WhatsApp y /mis-viajes'`.

Escenario: el contralor de la flota abre `/dashboard/usuarios` el 9-ago-2026 para
decidir cómo contestar una solicitud de acceso de su chofer. La única frase del
panel que le dice por dónde el chofer consulta sus propios datos le nombra una
ruta que devuelve 404 desde el 7-ago (`proxy.ts:104`). Es el mismo hueco del ALTO
de arriba, visto desde la única pantalla donde el responsable lo leería.

Consecuencia: el responsable —que es quien responde el ARCO— tiene en pantalla
una creencia falsa sobre el mecanismo de acceso de sus titulares.

Causa raíz probable: `31babfd` barrió `guard.ts`, `visibilidad.ts` y `permisos.ts`
pero no los textos de catálogo del panel.

---

### [BAJO] No hay ficha en `normas/` de los artículos ARCO, que son los únicos que el producto cita en pantalla con numeración abrogada
`normas/` tiene cuatro fichas de LFPDPPP: `15-16`, `2-XII-XX`, `26-II` y `59`.
Ninguna cubre los arts. 22-33 (derechos ARCO y plazos). Mientras tanto,
`src/app/dashboard/arco/page.tsx:23` y `:80` imprimen al cliente "LFPDPPP art. 32:
20 días hábiles", y `src/lib/likida/privacidad.ts:612` razona sobre "La LFPDPPP
art. 32 fija 15" — la numeración de la ley abrogada el 20-mar-2025 (hallazgo 11
del pase 1, reincidente).

Escenario: la vigilancia normativa (`skill vigilancia-normativa`) detecta una
reforma a los plazos ARCO y calcula el radio de impacto por `usado_en_codigo`. No
hay ficha que consultar, así que el radio es cero y las ocho ocurrencias de
"art. 32" siguen ahí. Es la contraparte del hallazgo 14: una ficha apunta a un
archivo borrado; esta familia entera no tiene ficha a la que apuntar.

Consecuencia: el mecanismo que este repo construyó para que una norma contradicha
llegue al código no cubre la única familia de artículos que el producto cita mal
hoy.

Causa raíz probable: las fichas se crearon por lo que el motor de cuadre
necesitaba (aviso, encargado, decisión automatizada, sanciones); los plazos ARCO
se escribieron directo en el código en la ronda 12, antes de que `normas/`
existiera como fuente de verdad.

---

## Lo que revisé y está bien

- **La consulta del recordatorio falla cerrado.** `recordatorio_comprobacion.ts:63`
  lanza ante `error` en vez de devolver lista vacía, y el UPDATE del claim va
  acotado por `tenant_id` además de por `id` (`:161-163`), con prueba propia
  (`recordatorio_comprobacion.test.ts:207`). No hay fuga entre flotas por este
  camino nuevo.
- **El texto del recordatorio no evalúa a la persona.** `armarRecordatorioComprobacion:84-92`
  dice días y qué mandar; no puntúa, no compara con otros choferes y no emite
  juicio — así que no abre un supuesto nuevo de art. 26 fr. II más allá del que ya
  existe con el cuadre.
- **`0086` no borró la tabla `operador` ni `app_user.operador_id`**, y lo dice en
  su encabezado (`:15-17`). El retiro del rol no destruyó datos del titular: lo
  que se fue es el login. Verifiqué que las 22 policies se reescriben explícitas,
  sin `CASCADE`, así que no hay tabla que se haya quedado sin RLS y expuesta.
- **El recordatorio no toca al modelo externo.** No hay llamada a `lib/llm/` en
  el camino nuevo: es consulta + plantilla de texto armada en código. No agrega
  una salida de datos personales hacia un tercero.
- **Contenido de la conversación acotado.** `conv.ts:306` y `:384` recortan a
  `MAX_TURNS` por viaje y descartan los turnos al cambiar de viaje, así que
  `wa_conversacion.estado` no crece sin techo con el contenido de los mensajes que
  el aviso integral enumera como dato tratado.
- **`data_collection: 'deny'` sigue en las tres salidas al modelo**
  (`openrouter.ts:207-213`, aplicado en `:271`, `:423`, `:705`); `lib/llm/` no
  tiene un solo cambio en los 12 commits del pase 2 y no aparecieron clientes HTTP
  nuevos hacia proveedores de IA.
- **`sanitizar.ts` intacto**: sigue descartando `producto` entero ante señales de
  salud, vida sexual o creencias, y sigue documentando su propio límite.
- **Custodia de credenciales sin cambios y sin uso**: `portal_credencial` (0063)
  con su CHECK contra cualquier cosa con pinta de contraseña, y
  `rastreo_credencial` (0050) con `token_cifrado` separado de `token_ultimos4`.
  Ninguna migración del pase 2 las toca.
- **`export.ts` no exporta datos personales del chofer más allá del nombre**
  (`:68`, `r.viaje?.operador?.nombre ?? ''`): no lleva teléfono, ni licencia, ni
  RFC del operador al CSV del ERP.

## Lo que NO alcancé a revisar

- **Verificación en red**, otra vez: el entorno no tiene salida, así que no pude
  comprobar si las plantillas `viaje_asignado`, `respuesta_arco_v2` y
  `recordatorio_cierre` están aprobadas por Meta, ni qué devuelve
  `likida.ai/aviso/<uuid>`. El CRÍTICO del primer contacto depende de que
  `viaje_asignado` esté aprobada; si estuviera en revisión (132001) el mensaje no
  saldría, pero el hueco de orden en el código es el mismo.
- **Retención efectiva del bucket `comprobantes` y de las filas de `operador` tras
  la baja.** El único purgador sigue siendo `0072` sobre `wa_mensaje_procesado`
  (30 días). Los comprobantes tienen justificación declarada (CFF 30, cinco años,
  y el aviso integral lo dice), pero no encontré plazo declarado para
  `wa_conversacion` ni para el operador dado de baja, y no medí si existe en algún
  documento fuera de `src/`.
- **`avisar_cierre.ts`, `facturacion/avisar.ts` y `administracion.ts`**, los otros
  tres emisores de WhatsApp iniciados por el sistema. Los abrí lo justo para saber
  que existen y que no llaman a `ponerAvisoADisposicion`; no tracé sus escenarios
  con valores, así que no los reporto.
- **El rework del dashboard del dueño (8 commits, `analytics.ts` +454)** desde la
  óptica de datos personales: si alguna de las consultas nuevas (`top-rutas`,
  `actividad`) expone al operador por nombre en pantallas donde antes no aparecía.
- **`docs/conocimiento/11-huecos.md` y `31-cumplimiento-continuo.md`**, que sigo
  sin cruzar.
