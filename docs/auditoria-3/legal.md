# Cumplimiento legal — auditoría 3

**Nota: 4/10** (antes 6). Baja dos puntos y la razón es una sola familia: **lo
que la ronda pasada dio por cerrado se reabrió con el código nuevo de esta
semana**. El gate del aviso ("sin aviso no hay tratamiento",
`processor.ts:658-690`) sigue intacto donde estaba — pero la rama de huérfanos
(F2, nueva) procesa la foto y la manda al modelo externo ANTES de llegar a él,
que es literalmente la conducta que ese gate se escribió para impedir. Y los
hitos del chofer (0090, nuevos) crean una categoría de dato y una finalidad que
ningún aviso enuncia, cuando el propio aviso integral promete que "cualquier
finalidad que no esté escrita aquí requiere que te vuelvan a pedir permiso".
La infraestructura de cumplimiento (constancia de envío, ARCO de punta a punta,
26-II en las seis pantallas nuevas, filtro de datos sensibles) es la mejor que
le he visto a este repo — por eso no es un 3 — pero un mecanismo excelente que
las ramas nuevas rodean vale lo que valen sus huecos.

**Riesgo mayor hoy:** la foto del chofer SIN viaje abierto — el caso que el
propio código describe como el más real: "terminan la ruta, sacan el fajo y
mandan once fotos de golpe" — viaja al modelo de visión externo sin que el
aviso de privacidad se haya puesto a disposición ni quede constancia, y ese es
exactamente el supuesto en que la carga de la prueba (Regl. art. 31) deja a la
flota sin defensa ante la autoridad.

## Hallazgos

### CRÍTICO 1 — REINCIDENTE: la foto sin viaje abierto va al modelo externo ANTES del gate del aviso

**Dónde.** `src/lib/likida/processor.ts:499-633` (la rama `if (!viajeId)`),
contra el gate de `processor.ts:658-690`. Dentro de la rama:

- `processor.ts:551` — `downloadMediaAsDataUrl(msg.mediaId)`: descarga la foto.
- `processor.ts:553` — `subirComprobante(...)`: la persiste en storage.
- `processor.ts:554` — `extraerComprobante(dataUrl, ...)`: **la remite al
  modelo de visión externo** (el costo OCR se registra en la línea 555 con
  modelo y tokens — la llamada es real).
- `processor.ts:611-614` — `guardarHuerfano(...)`: persiste el gasto con
  `operador_id`.
- La rama gemela de documentos (`processor.ts:513-533`) descarga y guarda el
  XML del CFDI por la misma puerta.

El gate `ponerAvisoADisposicion` corre en la línea 665 — **después** del
`return` de esta rama (línea 624/632). Su propio comentario dice por qué
existe: *"SIN AVISO NO HAY TRATAMIENTO. Antes se seguía de largo: la foto se
descargaba y se mandaba a un modelo externo sin el aviso que lo ampare"*
(`processor.ts:667-668`). La rama de huérfanos, nueva de esta ronda (F2 del
MAPA), reintrodujo esa conducta exacta para el cohorte sin viaje abierto. El
comentario que justifica la posición del gate ("va aquí y no antes: es donde
empieza el tratamiento", línea 659) quedó obsoleto el día que esta rama empezó
a tratar fotos antes.

**Escenario con valores.** La oficina da de alta a un chofer nuevo por
Despacho (alta rápida: nombre y WhatsApp, `despacho/acciones.tsx:83-94`).
Antes de que le abran viaje, el chofer manda 11 fotos de tickets de su ruta
anterior (el caso que el comentario de la línea 542-544 declara real). Las 11
fotos —con nombre del establecimiento, montos, y lo que el ticket traiga
(el filtro de sensibles de `sanitizar.ts` corre DESPUÉS de la visión, como su
propio comentario reconoce en las líneas 46-49)— se descargan, se suben a
storage y se remiten a OpenRouter, con `aviso_privacidad_en = NULL` para ese
operador. Si el chofer nunca vuelve a escribir con viaje abierto, el aviso no
llega jamás y no hay constancia de nada.

**Consecuencia.** Para el titular: sus datos (y su imagen de comprobantes) se
trataron y remitieron a un tercero-encargado sin que el aviso del art. 16 se
pusiera a disposición — el tratamiento que el art. 8 no permite presumir
consentido. Para la flota (la responsable): la carga de probar la entrega del
aviso es suya y la base dice NULL — indefendible en verificación. Para el
negocio: es el renglón donde la LFPDPPP 59 multa, y el flujo es el del demo.

**Refutación intentada.** ¿El chofer ya habría recibido el aviso por un
mensaje anterior? Solo si alguna vez escribió CON viaje abierto; el escenario
de primer contacto con fotos es precisamente el que la rama documenta como
frecuente. ¿La foto es dato de la flota y no del chofer? No: el aviso mismo la
declara dato del titular (`privacidad.ts:204`). ¿El tratamiento lo ampara la
excepción de relación jurídica? La remisión sí tendría base material, pero el
art. 16 exige el aviso previo con independencia de la base — y este repo ya
había aceptado ese estándar al construir el gate. No se sostiene la refutación.

### ALTO 1 — Los hitos del chofer (0090) son un dato y una finalidad que ningún aviso enuncia

**Dónde.**

- `src/lib/likida/hitos_viaje.ts:44-59` (frases), `92-111` (sellado en
  `viaje.llegada_en/descarga_en/regreso_en`), `126-130` (el acuse SOLICITA el
  siguiente hito: *"Cuando estés descargando me dices"*).
- `supabase/migrations/0090_hitos_viaje.sql:16-17` declara la finalidad real:
  *"La espera en patio... se vuelve medible: descarga_en - llegada_en"* — una
  métrica laboral del chofer, valuada ahí mismo en "$30k–$96k/día".
- `src/lib/likida/analytics.ts:886-895` la expone en la bitácora por chofer
  con nombre (`operador:operador_id(nombre)`), que pinta
  `dashboard/agentes/conductores/vista.tsx:24-26`.

**Contra el texto del aviso.**

- Simplificado, fr. II (`privacidad.ts:204`): *"Qué se trata: tu nombre y
  teléfono, y las fotos de comprobantes de gasto"*. Los sellos de
  llegada/descarga/regreso —datos de localización y tiempos laborales— no
  están.
- Integral, fr. III (`privacidad.ts:504-512`): finalidades necesarias
  (liquidar, comprobar ante SAT, responder) y secundarias (revisión de
  duplicados, estadísticas). Registrar hitos del viaje y medir espera en patio
  no cabe en ninguna, y el propio texto cierra la puerta: *"Cualquier
  finalidad que no esté escrita aquí requiere que te vuelvan a pedir permiso.
  La ley vigente ya no permite ampararse en usos 'compatibles o análogos'"*
  (`privacidad.ts:512`) — el art. 11 vigente, citado por el propio repo.

**Escenario con valores.** Un chofer escribe "ya llegué" a las 14:32 y
"descargando" a las 19:10. El sistema sella 4h38m de espera y el jefe de
tráfico lo ve en la bitácora con su nombre. El chofer leyó un aviso que dice
que se tratan su nombre, su teléfono y sus fotos de gastos "para liquidar y
comprobar ante el SAT" — nada le dijo que sus avisos de posición quedarían
sellados como métrica. Y el producto lo INDUCE: el acuse le pide el siguiente
hito.

**Consecuencia.** Tratamiento con finalidad no enunciada — bajo la ley vigente
(sin la válvula de "compatible o análogo") exige consentimiento nuevo que
nadie pidió. Agrava: no hay plazo de conservación declarado para estos sellos
(no son CFDI; el ancla de "cinco años, CFF 30" del aviso no los alcanza), así
que es también retención sin límite declarado. El día que la espera en patio
se use para medir choferes (la migración ya la nombra como métrica), el hueco
se vuelve conflicto laboral con papel.

**Refutación intentada.** ¿"El contenido de tus mensajes" (integral, fr. II,
`privacidad.ts:497`) lo cubre? Cubre la CATEGORÍA del dato en el integral (no
en el simplificado, que es el que el chofer sí recibe), pero la fr. III exige
la FINALIDAD, y esa no está en ninguno de los dos textos. ¿Es finalidad
necesaria para liquidar? No: la liquidación cierra igual sin hitos — es una
funcionalidad de seguimiento pedida por el cliente. No se sostiene.

### MEDIO 1 — El primer contacto SALIENTE con el chofer ocurre sin mecanismo de aviso

**Dónde.** `src/lib/likida/operacion.ts:585` (`crearViaje` →
`avisarAlChofer`), `operacion.ts:646-657` (`notificarAsignacion` con folio,
ruta y **anticipo en pesos** al teléfono del chofer);
`src/lib/likida/agentes/cobranza.ts` (bucle `for (const v of
cola.paraContactar)` con `sendText` directo desde cron);
`src/lib/likida/importar_viajes.ts` (alta masiva de viajes por CSV/Excel, "SIN
avisos de WhatsApp" según el MAPA). Ninguno de estos caminos consulta ni
dispara `ponerAvisoADisposicion` — que solo existe en el flujo ENTRANTE
(`processor.ts:665`, único caller verificado con grep).

**Escenario con valores.** El jefe despacha por WhatsApp ("nuevo viaje para
Juan Pérez, Puebla a Monterrey, anticipo 8000"). `crearViaje` dispara la
plantilla de asignación al teléfono de Juan — que la flota capturó sin que
Juan haya escrito nunca al canal. Juan recibe su nombre, su ruta y "$8,000" de
anticipo de un número que jamás le puso a disposición aviso alguno; los datos
se obtuvieron de forma indirecta (del jefe) y el primer contacto —el momento
que la ley marca para el aviso en obtención indirecta— pasó sin él.

**Consecuencia.** Para el cohorte de choferes que reciben avisos y nunca
contestan, el tratamiento (almacenamiento, mensajería reiterada, escalación)
corre indefinidamente sin aviso ni constancia. La flota vuelve a quedar sin
prueba del art. 16.

**Refutación (parcial, y por eso MEDIO y no ALTO).** (a) La cobranza usa
`sendText` de formato libre, que Meta rechaza fuera de la ventana de 24h — en
la práctica solo alcanza a choferes que escribieron hace poco, y todo entrante
pasa por el gate: ese brazo se autolimita. (b) El comentario del gate
(`processor.ts:660-661`) sostiene que el teléfono "ya lo tenía la flota desde
el alta y ese tratamiento previo es suyo" — defendible para el DATO, pero el
mensaje saliente es tratamiento EN este canal, por el encargado. (c) La
plantilla de asignación vive en Meta, fuera del repo: no pude verificar si
incluye una liga al aviso — si la incluye, este hallazgo baja a BAJO. Queda
MEDIO porque el brazo de plantillas (asignación + reavisos) sí sale fuera de
ventana y no depende de que el titular haya escrito jamás.

### MEDIO 2 — El personal de oficina no tiene aviso de privacidad en ninguna parte

**Dónde.** Los datos del personal de oficina que el producto trata hoy:
nombre, email y rol (`app_user`, provisionado en `administracion.ts:141-147`),
teléfono personal de cuenta (0059, resuelto en `contactos.ts`), sus
conversaciones de chat persistidas (0088), y —nuevo de esta ronda— su nombre
como rastro de decisión: `proveedores.ts:151` escribe `decidido_por` con
`sesion.nombre ?? sesion.userId` (`agentes/proveedores/page.tsx:24`), la
bandeja lo pinta ("lo decidido queda con su quién y su cuándo",
`vista.tsx:69,120`) y **sale del sistema** en el CSV para el ERP como
`aprobada_por` (`proveedores.ts:180`, vía `api/export/facturas-proveedor`).
El único aviso del producto (`app/aviso/[tenant]/page.tsx` +
`privacidad.ts:477-591`) está redactado para el OPERADOR ("tus viajes", "tu
liquidación"); no existe texto alguno dirigido al personal de oficina.

**Escenario con valores.** La contadora aprueba 40 facturas de proveedor en
agosto. El CSV que se importa al ERP lleva 40 renglones con su nombre y el
timestamp de cada decisión — una bitácora de desempeño individual que nadie le
informó que existiría ni a dónde viajaría. Si un superadmin de Likida decide
facturas "previsualizando" la flota (la action lo permite:
`exigirPermiso` acepta superadmin, `page.tsx:23`), es el nombre de un empleado
de LIKIDA el que aterriza en el ERP de un cliente.

**Consecuencia.** El mismo argumento fundacional de `privacidad.ts:6-8` ("la
flota no puede [cumplir] aunque quiera" sin que el producto ponga el
mecanismo) aplica íntegro al personal de oficina, y para ellos el mecanismo no
existe. Es la mitad del alcance de este rubro sin cobertura alguna.

**Refutación intentada.** ¿El dato del empleado en el export es tratamiento
interno del responsable (su propio ERP) y no necesita más? El flujo sí, pero
el aviso del empleado (arts. 15-16 no distinguen entre titulares operativos y
administrativos) sigue debiéndose, y hoy no hay dónde darlo. Se sostiene.

### MEDIO 3 — La pantalla ARCO cita el articulado ABROGADO, y un comentario afirma un plazo que la ley no fija

**Dónde.**

- `dashboard/arco/page.tsx:80`: *"(LFPDPPP art. 32: 20 días hábiles)"* — a la
  vista de la flota. `page.tsx:23` y `repo.ts:1047` repiten "art. 32".
- La tabla de correspondencias del propio repo
  (`docs/conocimiento/11-datos-personales.md:48`) dice: plazos ARCO = art. 32
  ABROGADO → **art. 31 vigente**; y la línea 656 confirma el vigente: "20 días
  para responder y 15 para ejecutar (art. 31)".
- `privacidad.ts:611-613` va más lejos y afirma algo falso: *"La LFPDPPP
  art. 32 fija 15"* — ni el artículo ni el plazo son los vigentes. La
  constante `DIAS_HABILES_ARCO = 20` queda correcta solo porque se decidió
  "rastrear la promesa" del documento, no la ley.

**Escenario.** Un contralor (o el abogado de la flota en una verificación)
cruza la cita de la pantalla contra la ley de marzo 2025: el art. 32 vigente
ya no es el de plazos ARCO. Peor: un mantenedor futuro que lea el comentario
de `privacidad.ts:611` y "corrija" el sistema hacia 15 días para responder
alteraría el aviso y `vence_en` con fundamento inexistente.

**Consecuencia.** El brief de este rubro lo dice sin rodeos: razonar con la
ley anterior es un hallazgo en sí mismo. Aquí es cita en pantalla + comentario
normativo falso en el módulo que gobierna el vencimiento legal. El plazo
operativo (20 días) es correcto por accidente afortunado, no por fundamento.

**Refutación intentada.** ¿Es solo cosmético porque el número operativo es el
bueno? El número sí; la cita visible al titular/flota y la doctrina interna
del módulo, no — y este repo trata los rótulos falsos como defecto de
producto. Se sostiene, en MEDIO porque no hay daño material hoy.

### MEDIO 4 — `crearOperador` confirma a una flota que un teléfono es chofer de OTRA flota

**Dónde.** `src/lib/likida/administracion.ts:205-212`: cuando el teléfono ya
existe, si el choque es cross-tenant responde *"Ese teléfono ya está
registrado en OTRA flota"*.

**Escenario con valores.** Transportes A entrevista a un chofer y quiere saber
si "ya anda con la competencia": el flota_admin teclea el alta con el número
del candidato en Despacho. Si responde "registrado en OTRA flota", A acaba de
confirmar —sin consentimiento del titular y a través de Likida— que ese número
pertenece al padrón de otro cliente. El server action no tiene rate limit
propio: se puede sondear una lista de candidatos completa.

**Consecuencia.** Divulgación de un dato personal (la pertenencia laboral
inferible) a un tercero-responsable sin base — el vector clásico de lista
negra laboral en un gremio chico. El objetivo legítimo del candado (impedir
que el dinero de una flota se anote en otra, documentado en las líneas
167-172) se logra igual con un mensaje que no confirme la existencia ajena:
"ese número no se puede registrar; contacta a soporte".

**Refutación intentada.** ¿El dato es mínimo (booleano) y el interés
legítimo lo cubre? El candado sí; la REDACCIÓN que confirma el hecho ajeno no
es necesaria para el fin — existe alternativa igual de protectora y menos
reveladora, y eso es lo que el principio de minimización pide. Se sostiene.

### BAJO 1 — El integral describe al encargado LLM como lector "de las fotos", y hoy lee más que fotos

**Dónde.** `privacidad.ts:562`: *"los modelos de lenguaje que leen las
fotos"*. Desde esta ronda también viajan a OpenRouter: el texto libre del
chofer (agente de liquidación, `prompts.ts:75-97`), y en el chat del panel los
nombres de operadores dentro de los resultados de tools
(`chat-tools.ts:117`: `operador: v.operadorNombre`) más el nombre del usuario
de sesión (`analista.ts:288`). `data_collection: 'deny'` sí se pide en las
TRES rutas de llamada (`openrouter.ts:213` aplicado en 276, 428, 715 —
verificado), y la fr. II del integral sí lista "el contenido de tus mensajes",
así que la categoría está cubierta; lo corto es la descripción del encargado.
Consecuencia: un titular que lea el integral entiende un alcance menor del
real. Es texto, no base — por eso BAJO.

### BAJO 2 — El envío de la respuesta ARCO degrada en silencio con un UUID como "teléfono"

**Dónde.** `repo.ts:1100`: `const telefono = (sol.titular_ref …) ??
(sol.operador_id …) ?? null` — si `titular_ref` viniera vacío, el fallback es
el **UUID del operador** como destinatario de WhatsApp; Meta lo rechaza y la
UI cae correctamente a "entrégala por otro canal", pero el fallback nunca
puede ser correcto y enmascara el caso real (solicitud sin teléfono) como
fallo de envío. Camino ARCO no se pierde (la UI lo dice); por eso BAJO.

## Lo que revisé y está bien

- **El gate del aviso en el camino CON viaje** (`processor.ts:658-690`):
  reserva → envío → constancia solo con acuse de Meta
  (`repo.ts:786-864`), reenvío automático al cambiar la versión (art. 15
  fr. VI vía hash, `privacidad.ts:255-262`), y bloqueo del tratamiento con
  mensaje honesto cuando no se pudo poner. Sólido.
- **ARCO de punta a punta**: detección determinística ANTES del LLM, con las
  perífrasis del español real y el desempate papel-vs-decisión
  (`privacidad.ts:283-361`); responde incluso al operador dado de baja y al
  número desconocido (`processor.ts:366-385`); registro con `vence_en`
  (`repo.ts:983-1006`); pantalla de la flota con vencimientos y respuesta al
  titular por WhatsApp con degradación declarada (`dashboard/arco/page.tsx`,
  `repo.ts:1082-1113`). El camino existe y es honesto.
- **26-II en las seis pantallas nuevas**: proveedores ("un HUMANO aprueba o
  rechaza", cola con candado anti-carrera `proveedores.ts:143-164`), facturas
  (mesa del jefe, `marcarFacturada` manual), peajes ("esperan a un humano en
  la mesa"), liquidación ("la firma del humano", cola `revisar`). El veredicto
  fiscal adverso NO viaja al operador (`processor.ts:1982-1984`,
  `resumenCuadre(…, 'operador')`) — el hallazgo viejo de la ola 2 está CERRADO.
- **La oposición del 26-II es ejercitable desde WhatsApp** y está anunciada en
  el aviso con las palabras que inducen su ejercicio (`privacidad.ts:222,
  283-361`).
- **El despacho por WA trata datos del chofer con base correcta**: parser
  determinístico (sin LLM), confirmación humana del jefe, re-verificación de
  rol adentro (`despacho_wa.ts:127-131`, `puedeAsignar`), vigencia de 30 min.
- **Exports con doble puerta** (dato + verbo): liquidaciones y
  facturas-proveedor exigen área `dinero` Y `puedeExportar`
  (`api/export/*/route.ts`), con tope declarado en vez de CSV recortado.
- **Chat del panel**: historial anclado a `tenant_id` + `user_id` en toda
  consulta (0088 + `conversaciones.ts:45-146`, RLS deny-all) — el contador no
  lee los chats del dueño; `data_collection: 'deny'` en cada llamada al LLM.
- **Filtro de datos sensibles colados** (`intake/sanitizar.ts:71-119`):
  descarta el valor entero sin dejar marca inferible, con su límite documentado
  honestamente (la foto ya viajó a visión — límite que el CRÍTICO 1 agrava
  pero que este módulo nunca prometió cubrir).
- **La página pública del aviso** (`app/aviso/[tenant]/page.tsx`): expone solo
  lo que el aviso exige, `notFound()` uniforme para no ser oráculo de altas,
  `robots: noindex`, y señala los huecos de captura en vez de fingir
  completitud.
- **Alta de operador**: dedup de teléfono contra TODAS las flotas fallando
  cerrado (`administracion.ts:195-212`) — correcto en fondo (la redacción es
  el MEDIO 4).
- **Operadores (F2)**: la página es área `operacion` y deja el dinero en el
  servidor; licencia/vencimiento a la vista de dueño y jefe de tráfico es
  necesidad operativa defendible (`dashboard/operadores/page.tsx:34-43`,
  `visibilidad.ts:86`). `/dashboard/arco` sí pasa por `puedeVerRuta` — lo
  verifiqué en `resolverTenantEfectivo` (`tenant-efectivo.ts:105-107`); no es
  el hueco que parecía.

## Lo que NO alcancé a revisar

- **Las plantillas de WhatsApp aprobadas en Meta** (asignación de viaje,
  respuesta ARCO, reaviso): viven fuera del repo. Si la plantilla de
  asignación incluye la liga al aviso, el MEDIO 1 baja; si la de ARCO
  (`enviarRespuestaArco`) volca texto libre de la flota, habría que mirar qué
  puede viajar ahí.
- **Las políticas RLS reales en la base** (0078/0079 y deny-all de 0088/0091):
  leí las migraciones, no verifiqué contra la base viva qué políticas están
  aplicadas hoy.
- **ACLs de storage de las fotos de comprobantes** — existe
  `foto_no_expuesta.test.ts` como guardián, pero no audité el bucket.
- **`api/dashboard/archivo`** (lector universal de adjuntos del chat): límites
  de tipo/tamaño y qué pasa si el documento adjunto trae datos personales de
  terceros.
- **La consola `/admin`** (cruza tenants a propósito): qué datos personales de
  choferes ve el superadmin y si el contrato flota-Likida (fuera del repo) lo
  ampara como instrucción del responsable.
- **Retención efectiva**: 0072 purga solo idempotencia; no tracé plazo alguno
  para huérfanos descartados, conversaciones de chat ni hitos (este último
  anotado dentro del ALTO 1).
