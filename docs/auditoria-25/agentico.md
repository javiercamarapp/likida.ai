# Sistema agéntico y orquestación — auditoría 25

**Nota: 4/10** (antes 5). Razón del movimiento: **mirada más profunda — el
código no cambió y la nota anterior estaba inflada.** La 24 subió a 5 apoyada en
que su CRÍTICO (`app_user.activo` en el canal de WhatsApp) quedaba cerrado. Está
cerrado a la MITAD: el arreglo `70dd5c6` tapó la puerta de ENTRADA
(`resolverCuentaOficina`) y dejó abiertas las tres de SALIDA que el propio texto
del hallazgo de la 24 nombraba con línea y todo. Y de los cinco hallazgos de la
24, **tres siguen abiertos verbatim** (los dos ALTO y el MEDIO): ninguno se
tocó, y el rubro no ha recibido un solo commit desde `b8a1a3a`.

Riesgo mayor hoy: la flota da de baja a su dueño/contador, el panel y la RLS lo
echan, y Likida **le sigue mandando por WhatsApp el PDF del contralor, las
cifras de cada cierre y la ubicación del chofer en un 🚨** — porque los tres
resolutores de "a qué número se le escribe" nunca miraron `activo`.

---

## Hallazgos

### [CRÍTICO] La baja de un usuario cierra el panel y el WhatsApp de ENTRADA, pero no el de SALIDA: se le sigue escribiendo al ex-empleado (REINCIDENTE, medio-arreglado en la 24)
`src/lib/likida/contactos.ts:141-154` (`telefonoParaDineroDe`) ·
`src/lib/likida/contactos.ts:168-195` (`telefonosJefe`) ·
`src/lib/likida/asistencia_escalamiento.ts:107-115` (`telefonoDeRol`)

El hallazgo de la 24 nombraba **tres** funciones. El arreglo tocó **una**:
`resolverCuentaOficina` (`contactos.ts:71-83`) ya lleva
`.or('activo.is.null,activo.eq.true')` más el filtro en TS, con cuatro pruebas
en `contactos.test.ts:75-96`. Las otras dos siguen con el `select` de siempre:
`telefonoParaDineroDe` pide `rol, telefono` filtrando solo `tenant_id` y rol
(`:142-147`); `telefonosJefe` pide `tenant_id, rol, telefono` igual
(`:173-178`). Ninguna prueba las cubre — `contactos.test.ts` solo tiene, de la
mitad de salida, `telefonoJefeDe devuelve null sin jefe asignado` (`:97-99`).
Y la escalada de emergencia tiene su propia copia sin filtrar
(`asistencia_escalamiento.ts:109-111`).

`desactivarUsuario` (`src/lib/auth/usuarios_escritura.ts:191`) escribe
`activo=false` + `desactivado_en` y BANEA en Auth, pero **no borra
`app_user.telefono`** — el número sigue ahí para que estas tres consultas lo
encuentren.

Escenario, con valores:
- Flota Innovativos da de baja a Luis, su único `flota_admin`
  (`/dashboard/usuarios` → `activo=false`, ban en Auth). Su teléfono
  `5219993700779` queda intacto en `app_user`.
- Luis intenta escribirle al bot: ahora sí recibe «no te tengo registrado como
  operador» (`processor.ts:1487`). La entrada está cerrada. Hasta ahí el
  arreglo.
- Cinco minutos después el chofer Juan escribe `listo` y su viaje cierra.
  `processor.ts:4335` → `avisarCierreAlJefe` → `avisar_cierre.ts:118`
  `telefonoParaDineroDe('innovativos')`. `ORDEN_AVISO_DINERO` es
  `['flota_admin','contador']` y el único `flota_admin` con teléfono es Luis:
  **devuelve `5219993700779`**.
- A ese número salen: el texto con **anticipo, comprobado y diferencia**
  (`armarAvisoJefe`) y —`avisar_cierre.ts:187-206`— el `sendDocument` del
  **ejemplar del CONTRALOR** (`${tenant}/${viaje}.pdf`), el completo, con RFC,
  folios y los veredictos `SOLO_CONTRALOR` (EFOS 69-B, CFDI cancelado, RFC
  receptor). Es literalmente el papel que el comentario de `:101-104` describe
  como «el jefe lo archiva y se lo pasa a su contador».
- Y por `telefonosJefe` (`ORDEN_AVISO = ['encargado','flota_admin']`) le siguen
  llegando los ~20 avisos operativos: escalación de viajes
  (`escalar_viaje.ts:254`), la solicitud de talacha con botones de autorizar
  (`talacha_wa.ts:168`), la carta porte (`carta_porte_wa.ts:145`), los relojes
  legales (`relojes_legales.ts:276,538`), el vigilante (`reglas/vigilante.ts:80`)
  y —lo peor— el **🚨 de asistencia con el nombre y la ubicación GPS del
  chofer** (`asistencia_wa.ts:402`, `asistencia_camara.ts:288`,
  `asistencia_coordinacion.ts:257,585,647,676`).
- Con `telefonoDeRol` la escalada de nivel 2+ (`asistencia_escalamiento.ts:274`)
  le despierta a las 3 a.m. con la descripción del accidente y el contacto de
  emergencia del chofer lesionado.

Consecuencia: la flota cree que dio de baja a alguien y le dio media baja. El
ex-empleado ya no puede MANDAR órdenes (eso sí lo cerró la 24) pero sigue
RECIBIENDO datos fiscales de la flota y datos personales del chofer —nombre,
teléfono, ubicación—, que es justo lo que la 0294 dice haber venido a cerrar
(«seguía descargando CFDI y liquidaciones semanas después») y lo que los propios
términos le cargan a la empresa. Para el chofer, además, la ubicación de una
emergencia se va a un número que ya no es de su flota.

Causa raíz probable: el arreglo se hizo sobre el punto que el escenario de la 24
narraba primero (el ex-empleado escribiendo) y no sobre la lista de funciones
que el mismo hallazgo enumeraba; sin una prueba de la mitad de salida, la
omisión no se ve.

---

### [ALTO] El resumen consolidado de la ráfaga cuenta las copias y contradice al motor y al PDF (REINCIDENTE de la 24, sin tocar)
`src/lib/likida/processor.ts:2930-2945`

Verificado hoy contra el fuente: `copiasDeComprobante` solo aparece en
`processor.ts` en las líneas 16 (import), 2449 (comentario) y 3514-3520 (la rama
de huérfanos). El bloque del resumen de ráfaga sigue siendo
`const puestos = await getGastos(...)` + `puestos.reduce(...)` crudos
(`:2930-2931`) y `«llevo *${puestos.length} comprobantes* por *${mxn(total)}*»`
(`:2942-2945`).

Escenario, con valores (el protocolo normal de dos fotos por ticket): el chofer
manda el ticket de diésel de **$8,340.50** (folio `05461`), el acercamiento al
QR del MISMO ticket, el ticket de caseta de **$1,341.00** y su voucher. Son 4
filas en `gasto` con `cfdi_uuid#orden` repetido, así que
`copiasDeComprobante` (`cuadre/engine.ts:421-445`) marca 2 como copias: el motor
y el PDF dicen **2 comprobantes por $9,681.50**. El resumen de la ráfaga dice
**«llevo *4 comprobantes* por *$19,363.00*»**. Minutos después el «listo» le
devuelve `resumenCuadre` con **$9,681.50**: dos cifras del mismo viaje en el
mismo hilo, con $9,681.50 de diferencia.

Consecuencia: el chofer cree que ya rebasó el anticipo y deja de mandar tickets;
y si el contralor mira el teléfono del chofer en la sala, ve una cifra que su
PDF desmiente — el modo de falla que el producto declara como definitorio.

Causa raíz probable: `getGastos` devuelve filas crudas y éste es el único
consumidor del camino del chofer que no pasa por `copiasDeComprobante`.

---

### [ALTO] «Tu jefe ya tiene la solicitud» se sigue afirmando sin comprobarlo, en la rama a la que se llega DESPUÉS de que el aviso falló (REINCIDENTE de la 24, sin tocar)
`src/lib/likida/talacha_wa.ts:243` y `src/lib/likida/talacha_wa.ts:275`

`talacha_wa.ts` no tiene un solo commit desde `b9678a7` (29-ago). Las dos
frases están idénticas, y `pendienteDelViaje` (`:114-131`) sigue leyendo solo
`id, monto_estimado, evidencia_path, gasto_id`: no existe columna que diga si el
aviso salió, así que el segundo turno no tiene con qué desmentirse.

Escenario, con valores: 02:10, el chofer escribe `se me ponchó una llanta, la
talacha son 800`. `avisarAlJefe` (`:186-190`) manda `sendButtons` al dueño, que
lleva 3 días sin escribirle al número de Likida → Meta contesta **131047**
(re-engagement) → `sendButtons` devuelve `null` → `avisado=false` → el chofer
recibe la verdad (`:314`, «NO le pude mandar el aviso a tu jefe»). 02:14 manda
la foto de la nota con el mismo texto: `cambios = {evidencia_path}`,
`cambios.monto_estimado === undefined` → **no se reintenta el aviso** → línea
275: «Listo, quedó la foto de evidencia en tu reporte 📸. **Tu jefe ya tiene la
solicitud** — en cuanto decida te aviso.» La línea 243 es peor: el reporte
repetido tal cual deja `cambios` vacío y contesta «Ya tengo anotada esa avería y
**tu jefe tiene la solicitud** 👍» sin tocar ni la base ni Meta.

Consecuencia: `incidencia.autorizacion='pendiente'` sin aviso entregado, el
chofer deja de marcarle a su jefe, y el tracto sigue parado. Es exactamente el
estado que este rubro puntúa más bajo, sobre dinero y con una unidad detenida.

Causa raíz probable: el éxito del envío es una variable local (`avisado`), no un
hecho persistido.

---

### [MEDIO] El asistente del panel le miente al comprador sobre el propio producto: su prompt dice que las páginas «están en reconstrucción» y hay 47
`src/lib/agents/prompts.ts:24` (bloque `CONOCIMIENTO_PRODUCTO`, `:19-26`), usado
por `analistaFlotaPrompt` (`:68`) y cargado en el chat del panel por
`src/lib/agents/analista.ts:344`

El prompt afirma, como conocimiento que el modelo puede dar «con confianza» y
**sin llamar tools** (`:19`):

> «EL PANEL HOY: Resumen (KPIs, motor fiscal, viajes recientes, gráficas de
> periodo) y este chat. **Las demás páginas están en reconstrucción y van
> llegando una por una.**»
> «Altas hoy: la flota y los teléfonos de operadores los da de alta el equipo de
> Likida durante el onboarding.»

`find src/app/dashboard -name page.tsx` da **47** páginas, y
`src/app/dashboard/rutas.ts` pinta el menú completo (Despacho, Viajes,
Facturación, Motor fiscal, Carta Porte, Operadores, Unidades, Clientes…). No hay
un solo «en reconstrucción» en todo `src/app/dashboard/`. Y las altas: el propio
panel edita operadores —teléfono incluido— y los da de baja
(`src/app/dashboard/operadores/page.tsx:141-190`, `actualizarOperador`), y
`/dashboard/usuarios` alta, degrada y desactiva cuentas
(`src/lib/auth/usuarios_escritura.ts`).

Escenario, con valores: el contralor de Innovativos, en la demo, escribe en
«Pregunta a tus datos»: *«¿aquí puedo ver mis facturas emitidas?»*. Es una
pregunta de producto → por `:66` («LO TRIVIAL VA DIRECTO, SIN TOOLS») el modelo
contesta en una pasada con el conocimiento del prompt: «hoy el panel tiene el
Resumen y este chat; las demás páginas están en reconstrucción». `/dashboard/
facturacion` existe, está cableada y escribe `factura_emitida`. El comprador
acaba de oír, del propio producto, que lo que le van a enseñar no está listo.

Consecuencia: es una cifra-que-no-es-cifra pero rompe la misma regla —un rótulo
tiene que ser verdad— y el que la lee es el que firma. En la sala, el asistente
contradice al menú que el contralor tiene a la izquierda.

Causa raíz probable: `CONOCIMIENTO_PRODUCTO` se escribió como texto libre sin
prueba que lo ate al repo (`prompts.test.ts` solo revisa el prompt de
`liquidacion`), así que el panel creció 47 páginas y el prompt se quedó en la
foto del 29-ago.

---

### [MEDIO] Una firma de PDF fallida sella `avisada_oficina_en`: el ejemplar del contralor no se reintenta nunca
`src/lib/likida/processor.ts:4326-4338` · `src/lib/likida/avisar_cierre.ts:187-214`
· `src/lib/likida/processor.ts:1072-1095` (`entregarCierrePendiente`)

`processor.ts:4328-4333`: si `createSignedUrl` del `${tenant}/${viaje}.pdf`
falla, se deja `logger.warn('cierre.pdf_jefe_sin_url')` y `urlPdfJefe` queda
`null`. `avisarCierreAlJefe` recibe `urlPdf: null`, **salta entero el bloque del
`sendDocument`** (`avisar_cierre.ts:187`, `if (args.urlPdf)`) y devuelve
`{ enviado: true }` porque el TEXTO sí salió. Con `rj.enviado === true`,
`processor.ts:4338` sella `avisada_oficina_en`. A partir de ahí
`entregarCierrePendiente` corta en seco (`:1073`, `if (liq.avisadaOficinaEn)
jefe = 'ya_avisado'`) y ningún camino vuelve a intentar el PDF.

Escenario, con valores: cierre de la liquidación `LIQ-000412`. La tool reportó
`pdf_contralor_generado: true` (el objeto está en el bucket) pero
`createSignedUrl` se rinde en el tope de `acotada` (8 s + 1.5 de gracia) por un
blip de Storage. El contralor recibe por WhatsApp «Liquidación LIQ-000412:
requiere tu decisión» con anticipo/comprobado/diferencia **y ningún adjunto**. El
sello queda puesto. Los tres «listo» siguientes del chofer entran por
`entregarCierrePendiente` y dicen `jefe: 'ya_avisado'`. El único rastro es un
`warn`.

Consecuencia: la liquidación que «requiere decisión» le llega al contralor sin
el papel que su contador necesita, y el circuito «entra por WhatsApp, sale por
WhatsApp» que este bloque existe para cerrar (`:4288-4293`) se rompe en
silencio; hay que entrar al panel, que es la mitad de las veces que nadie entra.

Causa raíz probable: `enviado` responde por el TEXTO y el sello se puso sobre
`enviado`, no sobre «se entregó lo que había que entregar».

---

### [MEDIO] La 0303 dejó `prompt_ref` en NULL sobre nueve agentes VIVOS y con eso fabricó una alarma semanal insatisfacible por construcción
`supabase/migrations/0303_gradua_agentes_experimentales_auditados.sql:47` ·
`src/lib/likida/agentes/backoffice.ts:605-615` y `:647-652`

Ésta es la respuesta a la pregunta obligatoria de la ronda, por el camino que
importa: **el runner no lee `prompt_ref` en ninguna parte** (verificado con grep
sobre `src/`: los únicos lectores son `backoffice.ts` y el formulario de alta).
`correrRunner` (`runner.ts:642-648`) selecciona `id, presupuesto_dia_usd,
experimental` y despacha por id contra las listas literales —los nueve están en
`CRECIMIENTO` (`:165-169`), `LEADS` (`:190`) e `INGENIERIA` (`:176-178`)—, con
kill switch declarado para los nueve (`interruptores.ts:71-74,85,97`). O sea:
graduados, con motor, y `prompt_ref` NULL no los rompe. Hasta ahí, bien.

Lo que sí rompió es el otro lector. `compararCatalogo` recorre los agentes
`estado === 'vivo'` y empuja `VIVO Y SIN DOCUMENTAR: sin prompt_ref al blueprint`
(`backoffice.ts:611`). Los nueve están `vivo` desde la 0230/0235.

Escenario, con valores: el lunes corre el agente `documentacion` (está en
`BACK_OFFICE_RESTANTE`, `runner.ts:146`). Su parte encola en `cola_aprobacion`
con:

```
DEUDA DOCUMENTAL (agentes VIVOS, 9):
  · cazador: VIVO Y SIN DOCUMENTAR: sin prompt_ref al blueprint.
  · guiones: VIVO Y SIN DOCUMENTAR: sin prompt_ref al blueprint.
  … (siete más)
```

Antes de la 0303 esa sección decía «DEUDA DOCUMENTAL: ninguna» (`:650`). Y la
deuda es **impagable a propósito**: la propia 0303 dice que los nueve son
deterministas, que los nueve markdown «NUNCA se escribieron» y que por eso se
deja NULL «en vez de una promesa colgante».

Consecuencia: el parte que Javier lee cada semana estrena nueve renglones
permanentes de deuda que nadie va a cerrar, y ese parte se encola SIEMPRE
(`correrDocumentacion` no condiciona el encolado a que haya cambios), sumando a
la contrapresión global de la bandeja (`runner.ts:118-131`, tope 40 pendientes /
7 días) que frena a los otros ~45 agentes. Es la misma trampa que el CLAUDE.md
ya documenta con `ticket_mensaje`: «una alarma insatisfacible por construcción».

Causa raíz probable: la migración cambió el dato mirando al runner (que no lo
lee) sin mirar al único consumidor que sí lo audita.

---

### [MEDIO] El fix del tenant fantasma (`66339d5`) dejó abierta una de sus dos ramas: con `?tenant=` inválido el chat vuelve a fallar en cada turno
`src/app/api/dashboard/chat/tenant.ts:24-42`

El commit cerró la rama `else` (tenant de la sesión / demo): lee `error`, lee
`!t`, y devuelve `null` con `chat.tenant_sesion_fantasma`. La rama de arriba
—`if (tenantPedido && sesion.rol === 'superadmin')`— consulta el tenant PEDIDO,
y cuando no existe deja `tenantId` en lo que traía: para un superadmin sin flota
eso es `tenantDemo()` (`src/lib/auth/tenant-demo.ts:36`, default
`11111111-1111-1111-1111-111111111111`), **sin verificar que exista**. El
comentario bendice ese fallback («un uuid que simplemente no existe SÍ sigue
cayendo al de la sesión: eso es un enlace viejo»), pero para el superadmin ese
«de la sesión» es precisamente el uuid fantasma que el resto del archivo acaba
de aprender a rechazar.

Escenario, con valores: Javier abre un enlace guardado
`/dashboard/chat?tenant=9f3c…` de una flota que se limpió de la base, en un
entorno donde `DEMO_TENANT_ID` no está puesto. `tenantEfectivoChat` devuelve
`{ tenantId: '11111111-1111-1111-1111-111111111111', nombreFlota: 'tu flota' }`,
la ruta responde 200, y cada turno truena en `reservar_presupuesto_llm` por
violación de FK — el incidente literal del 3-sep-2026 que el comentario cita
(«12 fallos en 5 minutos, siempre el mismo tenant_id inexistente»), ahora por la
otra puerta. El usuario ve el chat cargar y morir en cada pregunta.

Consecuencia: la única pantalla del panel que se enseña en el demo se queda muda
con un 200 en la mano, y el `tenant.test.ts` nuevo no cubre este cruce
(`?tenant=` inexistente + superadmin sin flota).

Causa raíz probable: la verificación de existencia se puso en la rama del `else`
en vez de sobre el `tenantId` final, que es lo que de verdad se va a usar.

---

### [MEDIO] El sondeo de la 0172 INSERTA un `tenant` real en cada arranque en frío y el arranque no espera a que lo borre (REINCIDENTE de la 24, sin tocar)
`src/lib/likida/startup.ts:230-250` · `src/instrumentation.ts`

Sigue igual: `admin.from('tenant').insert({ nombre: '__likida_probe_624__',
regimen_fiscal: '624' })` con un `finally` que borra, disparado con `void` desde
`register()`. En Vercel el webhook contesta 200 en ~40 ms y la instancia se
congela con el `delete` en vuelo. `lib/admin/negocio.ts:384` sigue listando los
tenants filtrando solo `.not('nombre','ilike','ZZZ %')`, así que
`__likida_probe_624__` aparece en `/admin` como una flota más con plan `demo` y
suma en el conteo. Con 0 clientes reales, una flota fantasma es la mitad de la
lista. (Lo único que cambió es que ahora hay un `delete` por nombre TAMBIÉN
antes del insert (`:230`), que limpia el fantasma de la vez anterior en el
siguiente arranque frío — pero no en el ínterin, que es cuando se mira el panel.)

---

### [BAJO] `graduarAgente` no tiene un solo llamador: graduar sigue siendo un `UPDATE` a mano, y la bitácora `agente.graduado` nunca va a existir
`src/lib/likida/agentes/definiciones.ts:183-197` · `src/app/admin/agentes/page.tsx`
· `src/app/admin/agentes/contenido.tsx:130-137`

`grep -rn graduarAgente src/` devuelve el fuente y su propio test, nada más.
`/admin/agentes` tiene dos server actions —`accionAlta` y `accionPalanca`— y
ninguna gradúa. La función se escribió con la razón explícita de que «graduar
era un `UPDATE` a mano contra la base — sin registro, sin bitácora», y la
graduación real de esta ronda se hizo… con un `UPDATE` a mano contra la base
(0303), sin bitácora: `agente_bitacora` no tiene ni tendrá una fila
`agente.graduado`, ni el actor que decidió graduar a los nueve.

Encima, la píldora que 5180c72 añadió al panel (`contenido.tsx:132`) dice al
pasar el cursor «el runner no lo despacha en automático **hasta que se gradúe**»
— un rótulo que apunta a una acción que la pantalla no ofrece.

Consecuencia: la próxima graduación repetirá la migración a mano (y quien la
audite no tendrá con qué reconstruir quién la autorizó), o alguien escribirá el
botón desde cero sin ver que la función ya está hecha y probada.

---

### [BAJO] El resumen de la ráfaga y el cierre por corte salen por `sendText`, no por `say`: su costo de WhatsApp no se cuenta (REINCIDENTE de la 24, sin tocar)
`src/lib/likida/processor.ts:2942` (contra `:2923`, que sí usa `say` doce líneas
arriba, en el MISMO bloque) y
`src/lib/likida/processor.ts:1211`

Doce líneas más arriba el mismo archivo explica por qué la foto suelta va por
`say`: «para que siga contando su costo de WhatsApp». El resumen consolidado —el
único mensaje de un fajo de 22 fotos— y el cierre de libreta por corte
(`cerrarRafagasPorCorte`, el final NORMAL de un fajo grande) salen por `sendText`
crudo. En un negocio que cobra POR LIQUIDACIÓN, el costo unitario se subestima
justo en el camino más transitado.

---

## Lo que revisé y está bien

- **La pregunta obligatoria de la ronda tiene respuesta limpia por el lado del
  runner.** Un agente graduado con `prompt_ref` NULL corre igual: `correrRunner`
  (`runner.ts:642-648`) ni pide esa columna. Los nueve pasan los cinco candados
  —kill switch declarado (`interruptores.ts:71-74,85,97`), `experimental=false`
  (`runner.ts:698`), techo de dinero (`:713`), contrapresión global (`:786`)— y
  aterrizan en la rama de su departamento, que además re-estrecha con el
  predicado del motor (`esAgenteCrecimiento`/`esAgenteLeads`/`esAgenteIngenieria`,
  `:954, :1039, :984`) y NO despacha a ciegas si las listas divergen. El id sin
  rama tiene su cierre dicho: «sin motor despachable en el runner todavía»
  (`:1128`). No hay agente graduado que caiga en silencio.
- **AGEN-1 sigue en pie y no quedó inerte.** `processor.ts:3822-3845` relee la
  base en el camino FELIZ (no solo en el `catch` de `:3924-3935`), con los tres
  desenlaces cubiertos: `cerrado` → registro sintético con el vocabulario de la
  tool (`confirmarCierreEnBase:1160-1182`, `pdf_generado`) + PDF +
  `logger.error('agent.cierre_commiteado_tras_fallo_tool')`; `no_verificable` →
  texto que no afirma ni «cerré» ni «no cerré»; `abierto` → colofón explícito.
- **El arreglo `70dd5c6` (`resolverCuentaOficina` + `activo`) NO es inerte, y lo
  comprobé punto por punto.** El filtro va en la base (`.or('activo.is.null,
  activo.eq.true')`, `contactos.ts:75`) Y otra vez en TS (`:82`), con el
  razonamiento correcto del `.limit(2)`; el `false` explícito es el único que da
  de baja (base sin la 0294 → todos entran); la ambigüedad se juzga sobre las
  vivas. Con eso queda cerrado TODO el mando de entrada: despacho
  (`processor.ts:694`), asignación, autorización de talacha
  (`atenderAutorizacionTalacha`), comandos de admin, informes y analista, porque
  los seis cuelgan de `atenderTextoOficina` y ése solo se alcanza con `cuenta !=
  null` (`processor.ts:1373`). Lo que falta es la mitad de SALIDA (hallazgo 1).
- **La duda que la 24 dejó abierta sobre asistencia queda CERRADA, y en verde.**
  `asistencia_wa.ts:571-574` le contesta `RESPUESTA_MUDA` a un chofer en
  violencia activa aunque `avisado === false`, justificándose en que «el
  escalamiento (Fase 5) lo reintenta». Sí lo reintenta: `nivelObjetivo`
  (`asistencia_escalamiento.ts:72-80`) se calcula sobre `abierta_en`, no sobre si
  el primer aviso salió, así que a los 5 min (ROJO) la incidencia no reconocida
  escala sola con claim atómico (`reclamarEscalacionAsistencia:87-101`); y
  CUALQUIER aviso que no sale dispara `alertarOperador('asistencia.escalamiento',
  … 'aviso_escalada_fallido')` (`:295-303`). No es un CRÍTICO.
- **El mutex con dueño sigue siendo real**: `nuevoTokenDeLock` (`conv.ts:790`),
  el token viaja a `try_lock_viaje` (`:836`), `intentarLockViaje` distingue
  `obtenido`/`ocupado`/`indeterminado` y el `indeterminado` falla CERRADO en el
  cierre (`processor.ts:3675-3693`, con texto distinto para cada motivo y
  `soltarClaim`); el `finally` suelta con SU token (`:4401`). La ventana de
  despliegue (0280 sin aplicar) reintenta sin token y NO concluye «abre el
  mutex» sin volver a preguntar (`conv.ts:856-871`).
- **La barrera falla cerrado**: `intakeDelta` e `intakePendientes` devuelven
  `null` («no sé») y `esperarIntake` no abre con `null` (`conv.ts:1086-1089`); el
  sondeo dejó de ser escritura y aplica el TTL de la 0031 del lado del cliente
  (`:1012-1036`); la gracia anti-carrera de 2 s está y es configurable.
  `fotoAnteriorSinProcesar` corre DESPUÉS de la barrera y compara `evento->
  timestampMs` con `->` (jsonb), no `->>`.
- **Ninguna ruta del chofer recibe veredictos de contralor**: los seis llamadores
  de `resumenCuadre` pasan `'operador'` explícito (`processor.ts:3779, 3831,
  3958, 4007`; `guardia.ts:116`), y `SOLO_CONTRALOR` (`resumen.ts:24-33`) está
  razonada caso por caso, incluida la excepción de
  `complemento_no_verificable`.
- **El prompt no autoriza al modelo a narrar lo determinístico y el candado no
  depende del prompt**: `guardiaCifras` (`guardia.ts:84`) sustituye SIEMPRE el
  texto cuando hubo cuadre —no consulta al detector de cifras primero—, usa el
  snapshot de la tool en vez de una segunda lectura de la base (AG-3, `:70-73,
  107`) y falla CERRADO si no puede calcular (`:117-123`). La guardia de
  fundamento y `guardiaEstado` corren solo cuando el texto NO es determinístico
  (`processor.ts:4107, 4129`), que es lo correcto: correrlas encima del texto del
  motor le quitaría sus propias citas.
- **La bandeja durable no pierde el turno abandonado**: `processInbound` devuelve
  `'sin_tiempo'` ANTES de tomar el claim (`processor.ts:1232-1246`) y cierra la
  libreta de ESE chofer y solo de ése (`cerrarRafagasPorCorte:1201-1216`); el
  `catch` general suelta el claim (`:4390`) y `devolverIntentoPendiente`
  (`wa_pendientes.ts:209`) no le cobra el intento a un mensaje que nadie miró.
  Las cartas muertas al quinto intento GRITAN al operador
  (`drenado.ts:172-178`), no desaparecen.
- **La palabra suelta de la talacha no puede firmar una incidencia ajena**:
  aunque `atenderAutorizacionTalacha:488-492` no filtra `tipo`, `crearIncidencia`
  con `autorizacion:'pendiente'` tiene UN solo escritor en todo `src/`
  (`talacha_wa.ts:291`), así que no hay otra clase de incidencia que pueda caer
  ahí. Estructuralmente cerrado; lo dejo escrito para que la próxima ronda no lo
  reporte.
- **El reintento no duplica efecto**: la llave de idempotencia lleva `runId`
  (`tool-executor.ts:332`), `abrirOrdenPorAveria` es idempotente por la unique de
  la 0209 y el camino «ya estaba autorizada» la vuelve a abrir en vez de
  perderla (`talacha_wa.ts:410-421`), y `sellarEntregaLiquidacion` usa
  `.is(sello,null)`.

## Lo que NO alcancé a revisar

- **El copiloto del panel** (`agents/copiloto.ts`, `copiloto-acciones.ts`,
  `copiloto-intents.ts`, `copiloto-tools.ts`, ~62 KB): es el único agente del
  repo con acciones de ESCRITURA guiadas por modelo y no abrí su ciclo. Solo
  toqué `analista.ts` por el prompt. Si hay un «efecto duplicado» agéntico vivo
  hoy, es el candidato más probable y quedó sin mirar.
- **`agentes/cola.ts` y la contrapresión global bajo carga real**: verifiqué la
  lógica de `motivoBandejaGlobalSinAtender` pero no medí qué le pasa a la vuelta
  del runner ahora que los 9 graduados empezaron a encolar — nueve productores
  nuevos contra un tope de 40 pendientes y un vencimiento de 7 días, con 0
  humanos aprobando, se come el presupuesto de la bandeja en días, y no calculé
  en cuántos.
- **El reloj de la vuelta del runner con los 9 agentes nuevos**: `PLAZO_RUNNER_MS`
  = 270 s para ~54 agentes en serie. Los nueve son deterministas y deberían salir
  en milisegundos, pero no lo medí, y `saltadosPorReloj` es el síntoma que
  aparecería.
- **`escalar_viaje.ts`, `relojes_legales.ts` y `reglas/vigilante.ts` por dentro**:
  los abrí solo lo justo para confirmar que consumen `telefonosJefe` /
  `telefonoParaDineroDe` (hallazgo 1). Sus propios ciclos —qué pasa si mueren a
  media escalación— no los recorrí.
- **No corrí ninguna prueba.** Todo lo de arriba es lectura del fuente, de las
  migraciones y del árbol de archivos; los conteos (47 páginas, llamadores de
  `graduarAgente`, escritores de `autorizacion:'pendiente'`) salen de `find` y
  `grep` sobre `src/`, no de una corrida.
