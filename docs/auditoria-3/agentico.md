# Sistema agéntico y orquestación — auditoría 3

**Nota: 6/10** (antes 5). Sube porque el ciclo central (foto → "listo" → cierre → PDF) hoy tiene cierre definido hacia el humano en casi cada punto de muerte, con candados verificados en código y no en prosa: claim de 3 estados con release en cada abandono, barrera fail-closed que no se abre con `null`, mutex que distingue transitorio de ausente, snapshot del cuadre en el cierre (AG-3), y el turno del asistente que solo se persiste si Meta lo aceptó. No llega a 7 porque los agentes estrenados esta semana (despacho por WA, cobranza, hitos) abren cuatro caminos nuevos donde el humano recibe una afirmación falsa o no recibe nada — y ninguno tiene prueba que lo fije.

**Riesgo mayor hoy:** ya hay CUATRO voces (liquidación, cobranza, escalación, despacho) hablando con los mismos dos humanos por el mismo canal sin compartir estado — los mensajes proactivos no entran al historial de la conversación, así que el agente de cuadre contesta respuestas a preguntas que él nunca vio, y el cierre es irreversible.

---

## Hallazgos

### [ALTO] Un "ya" ambiguo con comprobantes registrados cierra la liquidación de forma irreversible — el freno solo cubre el caso de cero
**Dónde:** `src/lib/agents/prompts.ts:79,85` · `src/lib/likida/processor.ts:324-326,1833-1862` · `src/lib/likida/agentes/cobranza_pura.ts:112-113`
**Escenario:** chofer a mitad de ruta con 8 tickets registrados recibe el mensaje de cobranza ("Si el viaje ya terminó y falta cerrarlo, dime y seguimos con eso") y contesta "ya voy". Ese texto no es hito (lista cerrada), no es consulta, no es confirmación → llega al agente. El prompt lista `"ya"` pelón como ejemplo de disparador de cierre y ordena "CIERRA en ese turno... NO le pidas que vuelva a confirmar ni esperes otro mensaje". El agente además responde SIN contexto: los envíos proactivos de cobranza/escalación salen por `sendText` directo y nunca se guardan en `wa_conversacion.turns`, así que el modelo ve "ya voy" en frío.
**Consecuencia:** `guardar_liquidacion` cierra a mitad de viaje; los triggers 0036/0037 bloquean todo lo posterior; los tickets del regreso caen a huérfanos `tras_liquidar` y el PDF emitido dice una diferencia en contra del operador que no es la del viaje. El propio comentario del freno (processor.ts:1824) nombra "un 'ya voy' mal leído" como el riesgo — pero el freno solo pregunta cuando `cuantos === 0`.
**Causa raíz:** la protección determinística contra el cierre accidental se acotó al caso de cero comprobantes, dejando el caso común (con comprobantes) en manos de un prompt que autoriza "ya" como sinónimo de "terminé".

### [ALTO] El agente de cobranza es estructuralmente mudo para su población objetivo: texto libre sin plantilla contra ventanas de 24 h cerradas, y el tier se consume igual
**Dónde:** `src/lib/likida/agentes/cobranza.ts:205-233` (claim + `sendText` en :219, sin `sendTemplate`) · contraste: `src/lib/likida/escalar_viaje.ts:216-232,252-267`
**Escenario:** viaje con 3 días sin comprobantes = chofer que casi seguro lleva >24 h sin escribir. El cron reclama el tier 3 (INSERT con unique), llama `sendText` → Meta rechaza el mensaje de re-engagement → `enviado=false, detalle='WhatsApp rechazó el envío'`. El tier queda consumido en bitácora para siempre (`colaCobranza` lee `cobranza_contacto` sin filtrar `enviado`, cobranza.ts:118-128). A los 7 y 14 días, lo mismo con los tiers 7 y 14.
**Consecuencia:** el chofer atorado —exactamente a quien el agente existe para insistirle— no recibe NI UNO de los tres contactos, y el contralor que configuró tiers/ventana/firma cree que su agente cobra. La escalación resolvió este mismo problema con fallback de plantilla ("es justo el caso probable de alguien que lleva cinco horas sin contestar", escalar_viaje.ts:220-223); cobranza no lo copió.
**Causa raíz:** el canal se eligió (texto libre) sin cruzar la ventana de 24 h de Meta contra el perfil del destinatario, y el claim-antes-de-mandar vuelve permanente cada rechazo.

### [ALTO] Despacho por WA: el choque con `uq_viaje_abierto_por_operador` se narra como transitorio — "vuelve a responder SÍ" para una condición que el reintento nunca arregla
**Dónde:** `src/lib/likida/despacho_wa.ts:150-153` · `supabase/migrations/0029_un_viaje_abierto_por_operador.sql:71-73`
**Escenario:** el jefe despacha "nuevo viaje para Juan Pérez, Puebla a Monterrey, anticipo 8000" mientras Juan todavía trae abierto el viaje de ayer (el estado NORMAL de un chofer entre liquidaciones, que tardan días — los propios tiers de cobranza son 3/7/14). Confirma SÍ → `crearViaje` choca con el índice parcial 0029 (23505) → el catch genérico contesta "No se pudo crear el viaje ahorita. Vuelve a responder SÍ en un momento" y CONSERVA el pendiente. El jefe responde SÍ, y SÍ, y SÍ — misma falla cada vez, durante los 30 minutos de vigencia; luego el "sí" cae al saludo genérico.
**Consecuencia:** el caso más frecuente de despacho por WA termina en un bucle de reintentos con instrucción falsa ("ahorita" implica transitorio), cuando la respuesta cierta —"Juan todavía tiene un viaje abierto; ciérralo o reasigna"— está a un `violaIndice(e, 'uq_viaje_abierto_por_operador')` de distancia, la utilería que processor.ts ya usa para exactamente esta distinción.
**Causa raíz:** el catch de `crearViaje` no separa el error permanente de negocio (índice 0029) del tropiezo transitorio, la misma confusión que el repo ya corrigió en `claimMessage` y `resolveOperador`.

### [ALTO] "El aviso a su WhatsApp va en camino" se afirma cuando el aviso ya falló — o ni siquiera se intentó — y ese viaje queda fuera de la escalación para siempre
**Dónde:** `src/lib/likida/despacho_wa.ts:144-145` · `src/lib/likida/operacion.ts:585` (`.catch(() => {})`), `:622-627` (sin teléfono → `return` con warn), `:658-665` (Meta rechaza → `return` sin marcar) · `src/lib/likida/escalar_viaje.ts:94` (`.not('avisado_en','is',null)`)
**Escenario:** el jefe despacha por WA a un operador sin teléfono capturado (caso modelado: la cola `sinTelefono` de cobranza existe para ellos) o la plantilla está pausada. `crearViaje` ESPERA a `avisarAlChofer` y se traga el resultado; para cuando despacho_wa imprime "El aviso a su WhatsApp va en camino", el envío ya falló o se saltó. `avisado_en` queda NULL → `viajesSinAceptar` nunca ve ese viaje → la escalación de las 5 h no dispara jamás.
**Consecuencia:** la cadena completa del "se trabó": el jefe cree que avisó (se lo dijimos nosotros), el chofer nunca se entera, la red de seguridad está ciega por diseño (el reloj mide "desde que se le dijo", y no se le dijo), y a los 3 días la cobranza intenta cobrarle comprobantes de un viaje del que nunca supo — por `sendText`, que la ventana cerrada también rechaza (hallazgo 2). Nadie recibe nada; solo queda `viaje.aviso_no_salio` en el log.
**Causa raíz:** `crearViaje` no expone si el aviso salió, y despacho_wa afirma la entrega sin tener el dato — la misma clase de "constancia de algo que no ocurrió" que el aviso de privacidad ya pagó.

### [MEDIO] El hito del chofer no acepta el viaje: "ya llegué" sellado en la base mientras la escalación le dice al jefe "no ha confirmado"
**Dónde:** `src/lib/likida/processor.ts:1570-1577` (rama de hito, sin `aceptarPorActividad`) vs `:1174` (la foto sí acepta) · rama XML `:1373-1519` tampoco · `src/lib/likida/escalar_viaje.ts:145-149`
**Escenario:** viaje asignado a las 08:00; el chofer no contesta la pregunta de confirmación, maneja, y a las 11:30 escribe "ya llegué". El hito se sella (`llegada_en` puesto) y se le contesta "Anotado: llegaste a las 11:32". A las 13:00 el cron escala: al jefe "Juan no ha confirmado el viaje en 5 horas... conviene reasignarlo", y al chofer "Mientras no me confirmes no puedo anotar tus gastos" — con la llegada ya anotada en la base por el propio sistema.
**Consecuencia:** el jefe puede reasignar un viaje cuyo chofer ya llegó al destino, y el chofer lee una amenaza falsa ("no puedo anotar") de un sistema que le acaba de anotar la llegada. La base dice una cosa (llegada sellada) y los dos humanos creen otra.
**Causa raíz:** el criterio "actividad = aceptación" (documentado en confirmar_viaje.ts: "una foto es una aceptación más fuerte que un 'va'") se cableó solo en la rama de imagen; hito y XML quedaron fuera.

### [MEDIO] Cobranza no mira `aceptado_en`: insiste "mándame las fotos" a choferes que dijeron NO o que nunca fueron avisados, y el reloj arranca en el despacho, no en el aviso
**Dónde:** `src/lib/likida/agentes/cobranza.ts:105-111` (filtra estatus y `fecha_inicio`, nada más) · `src/lib/likida/despacho_wa.ts:138` (`fechaInicio: hoyMx()` siempre)
**Escenario:** el chofer contestó "no" a la asignación (estado `sin_viaje` de inicio_viaje.ts — el viaje queda abierto y asignado a él hasta que el jefe actúe). Al día 3, cobranza: "Llevas 3 días con tu viaje sin mandarme comprobantes. Mándame las fotos de tus recibos" — al mismo humano al que la escalación le dijo que sin confirmar no se le anotan gastos.
**Consecuencia:** dos agentes del mismo producto dan instrucciones opuestas sobre el mismo viaje al mismo teléfono; el canal se aprende a ignorar, que es el modo de falla que ambos módulos declaran evitar.
**Causa raíz:** la cola de cobranza define "viaje vigilable" solo por estatus + fecha, sin el eje aceptado/avisado que la escalación sí modela.

### [MEDIO] Dos "sí" en el mismo lote sobre los huérfanos ofrecidos: el perdedor de la carrera contesta "No pude agregarlos. Siguen guardados" sobre comprobantes que el ganador YA adjuntó
**Dónde:** `src/lib/likida/processor.ts:1691-1726` (rama sin mutex ni barrera) · lo que salva el dinero: `repo.ts:141-179` (`addGasto` inserta con `g.id`) + `intake/ocr.ts:375` (el id nace en el OCR y viaja en el jsonb del huérfano)
**Escenario:** el operador manda "si" y "si van" seguidos; Meta los entrega en un POST y `conPool` los corre en paralelo (route.ts). Ambos leen los mismos `ofrecidos`, ambos insertan: el segundo choca con la PK de `gasto` (mismo `id`), que NO es `uq_gasto_img_hash` ni `uq_gasto_cfdi_uuid`, así que no se trata como duplicado benigno → `puestos` vacío → responde "No pude agregarlos ⚙️. Siguen guardados; lo intento otra vez en un momento", junto al "Listo, agregué N comprobantes" del ganador.
**Consecuencia:** dos mensajes contradictorios seguidos, y el segundo es falso por partida doble: sí se agregaron, y NO "siguen guardados" (el ganador los resolvió — no se vuelven a ofrecer). El dinero queda bien de churro: lo protege la colisión de PK, no un candado deliberado, y ninguna prueba fija esa carrera.
**Causa raíz:** la rama de adjuntar huérfanos corre antes del mutex del viaje y no reclama los huérfanos antes de insertar (marca `resuelto_en` después).

### [MEDIO] Cualquier "ok"/"va" del jefe dentro de los 30 minutos reclama el pendiente de despacho — aunque esté contestando OTRO aviso del sistema
**Dónde:** `src/lib/likida/despacho_wa.ts:124-155` (`esAfirmacion` decide) · `src/lib/likida/intake/huerfanos.ts:114-119` (`ok|okey|va|vale|sale|dale|claro...`)
**Escenario:** 10:00, el jefe pide un viaje y recibe el resumen; se distrae sin contestar. 10:12, el sistema le manda al MISMO teléfono el aviso de cierre de otra liquidación (avisar_cierre.ts) o una escalación. El jefe acusa recibo con "ok" → `cargarPendiente` encuentra el viaje pendiente vigente → `esAfirmacion('ok')` → `crearViaje` + aviso al chofer.
**Consecuencia:** un acuse de cortesía dirigido a otro mensaje crea un viaje real y manda a una persona a carretera. La vigencia de 30 min ataja el "sí" de tres horas después, pero no el diálogo cruzado que el propio producto provoca al meter avisos proactivos en el mismo hilo.
**Causa raíz:** la confirmación se resuelve por forma del texto ("es una afirmación") y edad del pendiente, sin ancla a QUÉ pregunta responde.

### [MEDIO] Barrido con techo silencioso: `limit(1000)` en cobranza global, `limit(500)` por flota, `limit(100)` en escalación — a la escala del prospecto se quedan viajes sin vigilar y nadie lo dice
**Dónde:** `src/lib/likida/agentes/cobranza.ts:261` (filas de `viaje`, no de tenants), `:111` · `src/lib/likida/escalar_viaje.ts:96`
**Escenario:** flota de 750 camiones con 600 viajes abiertos: `colaCobranza` lee 500 y calcula `vigilados: 500`; los 100 restantes no entran a ningún tier y la página del agente enseña un total que no es. A nivel global, con >1,000 filas de viaje abiertas entre todas las flotas, los tenants que caen después del corte no se cobran esa corrida — sin log, sin fila, sin señal (contrasta con `traerTodo`, que existe justo porque "PostgREST recorta a 1,000 en silencio").
**Consecuencia:** el agente afirma vigilar N cuando vigila 500∧N, y el corte cae siempre sobre los mismos (el orden de la consulta es estable) — no es aleatorio, es un hoyo fijo.
**Causa raíz:** consultas de barrido con `limit` fijo en vez de paginación, en el único módulo cuyo trabajo es "todos, cada hora".

### [MEDIO] El huérfano de cierre parcial sigue detrás de un flag apagado por default, y la instrucción de la rama sin flag es imposible de obedecer
**Dónde:** `src/lib/likida/processor.ts:1944` (`LIKIDA_RECUPERAR_CIERRE_PARCIAL === '1'`), `:1993` ("¿Me reenvías tu último mensaje?")
**Escenario:** el timeout del ciclo pega DESPUÉS de que `guardar_liquidacion` corrió: liquidación y PDFs persistidos, `PartialExecutionError` con la tool en `partialToolCalls`. Sin la env, el operador recibe "se me trabó... ¿me reenvías tu último mensaje?" — reenviar cae en "No tienes un viaje abierto" (el viaje ya está `liquidado`) y el PDF no llega por ningún camino.
**Consecuencia:** la base dice "cerrada", el operador cree "se trabó", y el único rastro es `cerroSinEntregar: true` en un log. La recuperación existe y está probada, pero la garantía depende de una variable que nadie vigila en arranque — y esta semana la familia `LIKIDA_*` estrenó nombre (el hallazgo de deriva `CUADRA_*`→`LIKIDA_*` es de operabilidad, pero este flag es su víctima más cara).
**Causa raíz:** decisión HARD RULE 3 (default = conducta vieja) que quedó sin fecha de expiración: el default sigue siendo el modo de falla que el propio comentario llama CRÍTICO.

### [BAJO] Los "días sin comprobar" de cobranza se cuentan contra medianoche UTC, no de México
**Dónde:** `src/lib/likida/agentes/cobranza.ts:134` (`Date.parse(\`${fecha_inicio}T00:00:00Z\`)`)
**Escenario:** viaje con `fecha_inicio` de hoy; a las 18:01 hora MX (00:01 UTC del día siguiente) `dias` ya vale 1. Un tier de 3 días dispara la tarde del día 2 según el calendario del cliente, y el mensaje afirma "Llevas 3 días" cuando llevan 2 y horas.
**Consecuencia:** cifra levemente inflada en un producto cuya regla número uno es no inventar cifras; el resto del repo resuelve esto con `TZ_MX` (la propia ventana de cobranza lo hace bien dos funciones más arriba).
**Causa raíz:** el día-frontera se calculó en UTC en un módulo que ya importa `TZ_MX`.

### [BAJO] Crash entre el claim y el envío en cobranza deja el tier consumido sin contacto y sin reintento
**Dónde:** `src/lib/likida/agentes/cobranza.ts:208-233`
**Escenario:** la invocación muere entre el INSERT del claim y el `sendText`: queda `enviado=false, detalle=null` — el tier no se reintenta nunca (la cola lo ve consumido) y la fila es el único rastro.
**Consecuencia:** un contacto perdido por tier, visible solo si alguien lee la bitácora. Es el precio documentado del claim-antes-de-mandar (correcto contra el doble envío); se anota porque la fila `detalle=null` no se distingue de "en vuelo" y nada la barre.
**Causa raíz:** claim y constancia de resultado son dos escrituras sin ventana de reintento (a diferencia de `al_vuelo.ts`, que sí la tiene).

---

## Lo que revisé y está bien

- **Idempotencia y sus liberaciones**: claim de 3 estados (`conv.ts:343-353`), y el release en TODOS los abandonos nuevos: aviso bloqueado (`processor.ts:688`), intake fallido (`:731,1378`), mutex ocupado (`:1803`), catch general (`:2273`).
- **Barrera de ráfaga fail-closed**: `null` no abre (`conv.ts:488-497,530-547`), sondeo sin escritura con TTL de contador muerto (`conv.ts:524-555`), gracia anti-carrera del mismo lote (`conv.ts:591-604`), y el aviso al operador cuando venció, bifurcado por `closed` (`processor.ts:2117-2127`).
- **Mutex**: transitorio ≠ ausente ≠ ocupado (`conv.ts:418-464`); el abandono AVISA y libera el claim (`processor.ts:1796-1805`); re-verificación post-lock del doble "listo" (`:1807-1812`).
- **Las tres guardias y su orden**: cifras → fundamento → estado, con el snapshot del cierre para no narrar una segunda fotografía de la base (`cuadre/guardia.ts:69-114`), fundamento por historial y no por lista de ids (`processor.ts:2050-2060`), estado con `entrego: 'pendiente'` (`:2072-2084`).
- **Cierre con PDF, punto por punto**: `pdf_generado` y `pdf_contralor_generado` verificados (`processor.ts:2137-2152`), `createSignedUrl` acotada y TTL 60s (`:2168`), `sendDocument` verificado con verdad al chofer si rebota (`:2176-2186`), aviso al jefe best-effort esperado, no flotante (`:2206-2211`), y la conversación guarda solo lo que Meta aceptó (`:2234-2243`).
- **Cobranza — el claim**: INSERT con unique(viaje,tier) antes de mandar, perdedor sigue de largo (`cobranza.ts:208-212`); resultado anotado aunque falle (`:230-233`); sello 0087 con `.is(null)` (`:237-243`); ventana en TZ-MX con `% 24` correcto (`cobranza_pura.ts:73-81`); config corrupta cae a defaults y grita (`cobranza.ts:51-54`).
- **Escalación**: `reclamarEscalacion` fail-closed ANTES de tocar canal (`escalar_viaje.ts:196-210,306-327`); doble fallback texto→plantilla para jefe y chofer (`:224-267`); embed `operador:operador_id` ya corregido (`:90`).
- **Despacho WA — lo que sí cierra**: rol re-verificado en el "sí" (`despacho_wa.ts:128-131`), vigencia de 30 min contra el "sí" viejo (`:52,68`), pendiente conservado ante fallo de creación (`:150-153`), nombre RESUELTO en el resumen (`:207-208`), y el parser fail-closed con veto de palabras completas, cifras dudosas a `incompleto` y pregunta-nunca-crea (`crear_viaje_wa.ts:167-177,282-307,551`).
- **Hitos**: lista cerrada e indexada, pregunta nunca sella, tope de largo (`hitos_viaje.ts:44-78`); sello idempotente `WHERE col IS NULL` anclado a tenant (`:92-110`); el fallo se dice, no se finge (`:121`); orden correcto ante `pareceCierre` y botones/consultas (`processor.ts:1563-1577`), con prueba (`processor_hitos.test.ts`).
- **Presupuesto compartido**: reloj desde la primera línea (`processor.ts:354`), `acotada` en dos capas (`presupuesto.ts:148-169`), y el fallback determinístico sin LLM cuando no alcanza (`processor.ts:1879-1890`).
- **Resolución de identidad fail-closed**: `ConsultaFallida`/`OperadorAmbiguo` con mensajes distintos al humano (`conv.ts:100-161`, `processor.ts:2256-2281`); la carrera del INSERT de conversación se resuelve releyendo, no pisando (`conv.ts:247-286`).
- **Reincidente R1 del ancla vieja (dedup por hash tras bandera)**: sigue tras `LIKIDA_DEDUP_FOTOS === '1'` (`processor.ts:761`), pero hoy está en `.env.example=1` y según `docs/auditoria-3/operabilidad.md:90` la env de producción se parchó esta semana — la clase (deriva código↔Vercel) la lleva operabilidad; aquí no se re-abre.

## Lo que NO alcancé a revisar

- El interior de `tools.ts` (`guardar_liquidacion` transaccional, generación de los dos PDF, `on conflict (viaje_id)`) — lo cubre el rubro de tool calling; aquí solo consumí su contrato (`pdf_generado`, `result.liq`).
- Los valores reales de las env en Vercel (`LIKIDA_RECUPERAR_CIERRE_PARCIAL`, `LIKIDA_DEDUP_FOTOS`, `LIKIDA_INTAKE_*`) — no verificables desde el repo; la deriva `CUADRA_*`→`LIKIDA_*` está en operabilidad.
- `inicio_viaje.ts` a fondo (161 casos): solo verifiqué su contrato de estados y el efecto del "no" (el viaje queda asignado y abierto).
- `acuse_ticket.ts`, `intake/rafaga.ts` y `consulta_chofer.ts` por dentro — leídos al nivel de sus contratos con processor.
- El chat del panel (`agents/analista.ts`, `chat-tools.ts`) y las páginas `dashboard/agentes/*` — otra superficie agéntica, otro turno; el prompt del analista (`prompts.ts:37-72`) se leyó y sus reglas de cifras son consistentes con la guardia.
- El camino del panel de Despacho (server actions) — solo el `crearViaje` compartido con WA.
