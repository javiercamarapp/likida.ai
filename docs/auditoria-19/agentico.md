# Sistema agéntico y orquestación — auditoría 19

**Nota: 4/10** (antes 5). Razón del movimiento: *deuda que cobró factura* + *mirada
más profunda*. Hubo trabajo real que sí cerró cosas — `piloto_vision.ts` **ya no
existe** (cierra cuatro reincidentes de golpe) y el lease de 0177
(`wa_pendientes.ts:128`, `reclamar_wa_pendiente`) desactiva la mitad mecánica de
AGEN-C4-3 y AGEN-C4-7. Pero la superficie agéntica **nueva** de este delta —el
outbox durable y la entrevista que escribe la configuración fiscal— entró con un
CRÍTICO en el camino del demo y con tres formas nuevas de que la base diga una
cosa y el chofer crea otra. Y siete reincidentes de la c4 siguen intactos, letra
por letra.

**El riesgo mayor del rubro, hoy:** el outbox de WhatsApp entrega —un minuto
después, sin dedupe y sin avisarle a nadie— mensajes que el llamador ya dio por
rechazados, ya volvió a mandar por otra vía, y ya decidió **no** guardar en la
conversación. El chofer lee dos veces lo mismo, o lee una pregunta que el
sistema tiene registrada como nunca hecha.

> **Nota sobre el árbol.** A media auditoría el autofix del rubro de backend
> (BACK-19-1) cambió `src/app/api/cron/wa-outbox/route.ts` para meterle la
> compuerta del interruptor global. Eso cierra AGEN-19-4, que yo ya había
> levantado; lo dejo escrito y marcado como arreglado en vez de borrarlo, porque
> los otros dos síntomas del mismo hueco (AGEN-19-2 y AGEN-19-3) siguen abiertos
> y el escenario explica por qué. Todo lo demás está verificado contra
> `8b43121` más ese cambio.

---

## Verificación de los 13 reincidentes de la c4 (`docs/auditoria-18/agentico-c4.md`)

| # de la c4 | Estado hoy | Evidencia |
|---|---|---|
| verif-3 (`rafaga`) | **REINCIDENTE** | `intake/rafaga.ts:99` sigue siendo el `Map` de módulo y `:158` `cerrarRafaga` su único lector; `processor.ts:1899` sigue siendo el único llamador y sólo con `ultima`. El comentario `rafaga.ts:20-27` sigue diciendo «un caso que hoy no ocurre» con el cron en `* * * * *`. Ver AGEN-19-6. |
| verif-4 (piloto sin `signal`) | **CERRADO** | `src/lib/likida/facturacion/piloto_vision.ts` **ya no existe** (`ls src/lib/likida/facturacion/`). |
| verif-5 (ticket que no se emite) | **CERRADO** | Ídem: el archivo desapareció. |
| verif-6 (contraseña donde diga el modelo) | **CERRADO** | Ídem. |
| verif-13 (piloto sin `registrarCosto`) | **CERRADO por eliminación** | Ídem. |
| verif-11 (`repartir`/`enrutar` de 2 args) | **REINCIDENTE** | `facturacion/avisar.ts:70` sigue `repartir(tickets, sabeOperarlo)` y `:98` `enrutar(t, …)` con dos argumentos. |
| verif-12 (texto libre antes del gate del aviso) | **REINCIDENTE** | `processor.ts:920` (`atenderTextoOficina(..., { incluirPreguntaLibre: !viajeId, … })`) sigue **antes** de `ponerAvisoADisposicion` (`:935`). |
| verif-14 (consulta extra a `app_user`) | **REINCIDENTE (atenuado)** | `processor.ts:895` sigue llamando `resolverCuentaOficina` para todo texto. |
| AGEN-C3-1 (sin presupuesto) | **REINCIDENTE** | `processor.ts:2618-2628` idéntico, y ahora se puede afirmar lo peor: el `return` de `:2627` no llama `soltarClaim`, así que `processInbound` devuelve `'procesado'` (`:728-730`) y la fila durable **se sella**. Ver AGEN-19-8. |
| AGEN-C3-2 (despacho entero) | **REINCIDENTE** | `processor.ts:920` sigue pasando `incluirDespacho: !viajeId`; `:558` sigue envolviendo despacho **y** asignación en un solo `if`. |
| AGEN-C3-3 (aviso al encargado) | **PARCIAL** | Se creó `ORDEN_AVISO_DINERO` y `telefonoParaDineroDe` (`contactos.ts:120-140`) y el cierre lo usa. `cron/facturar/route.ts:260` sigue en `telefonoJefeDe`, pero su aviso es de operación (tickets por facturar), no de dinero: ya no es el mismo hallazgo. |
| AGEN-C3-4 (cobranza que regaña a quien sí mandó) | **REINCIDENTE** | `agentes/cobranza.ts:115-174` (`colaCobranza`) sigue sin mirar `gasto`; el texto de `cobranza_pura.ts:112` es literalmente el mismo: «Llevas ${dias} días con tu viaje *X* sin mandarme comprobantes.» |
| AGEN-C3-5 / AGEN-C4-3 (intentos) | **PARCIAL (mejorado)** | 0177 metió `lease_expires_at` y `pendientesPorDrenar` lo filtra (`wa_pendientes.ts:128`): la fila **en vuelo ya no se re-reclama**, que era el motor del hallazgo. Queda lo del contador: `en_curso` sigue consumiendo intento en los dos llamadores (`drenado.ts:107`, `route.ts:362`), y el webhook **sigue sin devolver** el intento de `sin_tiempo` (`route.ts:362` corre antes del `return` de `:367`). Degradado a MEDIO. |
| AGEN-C3-6 (`reengancharPendiente`) | **REINCIDENTE** | `grep` → sólo `despacho_wa.ts:228,238,362` y `asignar_wa.ts:298,359`. Sin llamador de producción que pase el tercer argumento. |
| AGEN-C3-7 (`.limit(1000)`) | **REINCIDENTE** | `agentes/runner.ts:71`: `gastoDelDiaUsd` sigue con `.limit(1000)` crudo en vez de `traerTodo()`. |
| AGEN-C4-2 (cierre parcial) | **REINCIDENTE** | `processor.ts:2692` sigue leyendo `LIKIDA_RECUPERAR_CIERRE_PARCIAL === '1'`, apagada por default; `:2762-2765` sigue siendo `resumenCuadre(…, false, 'operador')`. `docs/conocimiento/51-boletin-tecnico.md:101` la sigue listando como pendiente #32. Ver AGEN-19-7. |
| AGEN-C4-4 (`pidioCerrar`) | **REINCIDENTE** | `processor.ts:485`: el `RegExp` es idéntico, con el mismo `(m[áa]s\|nada\|otro\|ninguno)?` opcional. Ver AGEN-19-9. |
| AGEN-C4-5 (`liberarEscalacion`) | **REINCIDENTE** | `escalar_viaje.ts:553` sigue escribiendo `avisos_enviados: v.avisosEnviados` (deshace el `+1` de `:572`), y `:342-346` sigue mandando el recordatorio al chofer **antes** de la rama que libera. Ver AGEN-19-10. |
| AGEN-C4-6 (`cortadosPorReloj`) | **REINCIDENTE** | `agentes/cobranza.ts:463-467`: el `break` del corte global sigue sin sumar nada a `total.cortadosPorReloj`, mientras `:486` (rechazo masivo) sí lo suma. `cron/escalar/route.ts:184-201` sigue derivando la racha de ese contador. |
| AGEN-C4-7 (auto-reencolado) | **CERRADO en lo esencial** | `pendientesPorDrenar` ya descuenta lo leaseado (`wa_pendientes.ts:128`), así que `tomados` ya no cuenta filas en vuelo de otra cadena. |

**Cuenta: 5 cerrados · 3 parciales/mejorados · 10 reincidentes** (los cinco
cerrados incluyen cuatro que se cerraron borrando el archivo, no arreglándolo).

---

## Hallazgos

### [CRÍTICO] AGEN-19-1 — El PDF adjunto se queda pegado a la conversación, y la razón social del receptor CFDI acaba siendo el extracto de la constancia
`src/app/dashboard/onboarding/chat.tsx:130, 168, 268` · `src/app/api/dashboard/onboarding-chat/route.ts:43-49` · `src/lib/likida/perfil/entrevista.ts:694-700` · `src/lib/likida/perfil/entrevista-aplicar.ts:131-148` · `src/lib/saas/fiscal.ts:150-153`

Dos cosas que por separado se ven inocentes:

1. **El adjunto nunca se suelta.** `setDocumento` se llama en un solo sitio
   (`chat.tsx:168`) y lo único que lo limpia es el botón «Quitar archivo»
   (`:376`). `enviar()` lo manda en el cuerpo de **cada** turno (`:268`), y el
   servidor lo concatena a la respuesta del usuario:
   `` ultimo = `${texto}\n\nDocumento «${nombre}»:\n${extracto}` `` con
   `extracto` recortado a **16,000 caracteres** (`route.ts:44-49`).
2. **El parser de razón social acepta cualquier cosa.**
   ```ts
   case 'razonSocial': {
     const s = texto.trim();
     if (s.length < 3 || parseSiNo(texto) !== undefined) { …ambiguo… }
     return { ok: true, hechos: { razonSocial: s.slice(0, 254) } };
   }
   ```
   `texto` es el `ultimo` de arriba, con el PDF dentro.

Escenario, con valores. El dueño de Transportes del Bajío está en la pregunta
del RFC —que literalmente dice *«tal cual la Constancia de Situación Fiscal»*
(`entrevista.ts:113`)— y adjunta su CSF. `parseRfc` saca `TDB950214QK3`:
correcto. Turno siguiente: `estado.siguiente` es `razonSocial` y el chat le
pregunta la razón social. Él escribe `TRANSPORTES DEL BAJIO SA DE CV` — la
respuesta **buena**. Pero el adjunto sigue pegado, así que el servidor
interpreta:

```
TRANSPORTES DEL BAJIO SA DE CV

Documento «csf.pdf»:
CONSTANCIA DE SITUACIÓN FISCAL
Datos de identificación del contribuyente
RFC: TDB950214QK3
Nombre, denominación o razón social: TRANSPO…
```

`parseSiNo` da `undefined`, `s.length ≥ 3` → se declara
`razonSocial = "TRANSPORTES DEL BAJIO SA DE CV\n\nDocumento «csf.pdf»:\nCONSTANCIA DE SITUACIÓN FISCAL\n…"`
(254 caracteres), con `procedencia: 'declarado'` — la procedencia de máxima
confianza, la que el candado de `preguntas.ts:86-91` existe para proteger.

Y no se queda en el perfil. Dos turnos después, cuando llega el CP,
`nutrirDesdeHechos` (`entrevista-aplicar.ts:131-148`) recupera esa razón social
del perfil (`declarado<string>(perfil,'razonSocial')`) y llama
`guardarDatosFiscales`, cuya única validación es `razonSocial.length < 3`
(`fiscal.ts:150-153`). El blob queda en `tenant.razon_social`: **el nombre del
receptor de los CFDI 4.0 que Likida le va a timbrar a ese cliente**, y el que
sale en pantalla.

Consecuencia. El PAC rechaza el timbrado por razón social que no casa con el
RFC (el propio código lo advierte: *«un "S.A de C.V." vs "S.A. DE C.V." lo
rechaza el PAC»*, `entrevista.ts:126`), y antes de eso el contralor ve su
empresa llamándose «TRANSPORTES DEL BAJIO SA DE CV\n\nDocumento «csf.pdf»…» en
la confirmación del chat (`mensajeConfirmacion` la imprime tal cual,
`entrevista.ts:943`) y en el panel. Esto pasa en el **primer** flujo que toca un
cliente nuevo — la pantalla de onboarding —, o sea en la sala.

La prueba que parecería cubrirlo no lo cubre:
`perfil/entrevista.test.ts:75-86` corre `interpretarTurno({}, blob)` con el
perfil **vacío**, donde la pregunta de turno es `ingresosMenoresA300M` y
`razonSocial` ni siquiera se evalúa. Pasa por construcción, no por protección.

Causa raíz probable: el extracto del adjunto entra por el mismo `texto` que los
parsers deterministas, y `razonSocial` es el único campo cuyo parser es «lo que
sea que hayas escrito»; nadie separó «lo que el usuario tecleó» de «lo que el
documento dice».

---

### [ALTO] AGEN-19-2 — El outbox reentrega lo que su llamador ya dio por fallido y ya volvió a mandar por otra vía: el chofer recibe el mismo aviso dos y tres veces
`src/lib/likida/wa_outbox.ts:14-23` · `src/lib/meta/client.ts:178-181, 194, 323, 334, 385, 393, 474, 482` · `src/app/api/cron/wa-outbox/route.ts:31-45` · `src/lib/likida/agentes/cobranza.ts:303-348` · `src/lib/likida/escalar_viaje.ts:342-346` · `supabase/migrations/0180_reservas_agente_y_outbox_wa.sql:69`

`encolarSalidaWhatsApp` se llama en **ocho** puntos de `meta/client.ts`: los
cuatro `catch` de red y los cuatro `if (esReintentableMeta(...))`. En los ocho,
la función que encoló **devuelve fallo a su llamador** (`{ok:false,status:503}`
o `null`), y todos los llamadores tienen su propia política de reintento. Nadie
le dice a esa política que el mensaje ya está en una cola que lo va a mandar.

Encima el insert es:

```ts
supabaseAdmin().from('wa_outbox').insert({ payload, ultimo_error: motivo.slice(0,500) })
```

Sin `dedupe_key`. La columna existe en 0180 (`dedupe_key text unique`,
línea 69) precisamente para esto, y `grep -rn dedupe_key src/` devuelve **cero
líneas**. Con `null` el índice único no restringe nada.

Escenario, con valores. Flota con el tier 2 de cobranza vencido en V-2026-0733,
6 días abiertos. 11:00:

- `ejecutarCobranza` inserta el claim `cobranza_contacto(viaje, tier=2)`
  (`cobranza.ts:293-294`) y llama `enviarTexto(tel, armarMensajeCobranza(...))`
  → *«Llevas 6 días con tu viaje V-2026-0733 sin mandarme comprobantes. 📋»*.
  Meta contesta **429**. `esReintentableMeta(undefined, 429)` → `true` →
  **se encola en `wa_outbox`** (`client.ts:194`) y se devuelve
  `{ok:false, status:503}`.
- Como el texto rebotó, la cobranza cae a `sendTemplate('recordatorio_cierre')`
  (`cobranza.ts:323`) — **segundo** intento de contacto, con otro texto.
- Los dos rebotaron reintentable → `cobranza.ts:346-348` **borra** el claim de
  `cobranza_contacto`, así que el tier 2 queda sin consumir.
- 11:01 — el cron `wa-outbox` (cada minuto, `vercel.json:9-12`) reclama la fila
  y hace el POST idéntico. Ahora sí pasa: **el chofer recibe el texto de las
  11:00**.
- 12:00 — `ejecutarCobranza` vuelve a ver el tier 2 pendiente (el claim se
  borró) y manda **otra vez** *«Llevas 6 días…»*, ahora con `dias = 6` igual.

Resultado: dos veces el mismo texto de cobranza más una plantilla, para un tier
que el sistema cree haber mandado cero veces. Lo mismo, palabra por palabra, en
la escalación: `escalar_viaje.ts:342` manda el recordatorio al chofer, y si
rebota, `:346` manda `avisarAlChofer` (la plantilla) — mientras el outbox tiene
guardado el recordatorio original.

Y el caso más caro no necesita rate limit: `SEND_TIMEOUT_MS = 10_000`
(`client.ts:18`). Un POST que Meta **aceptó y entregó** pero tardó 10.2 s cae en
el `catch` de `:178`, se encola, y el outbox lo manda de nuevo. Aplicado al
cierre: el chofer recibe dos veces *«Listo, cuadré tu viaje 👇 · Comprobado:
$18,430.00 · Anticipo: $20,000.00 · Sobró $1,570.00»*.

Consecuencia. El chofer aprende a ignorar el canal, que es exactamente lo que el
encabezado de `escalar_viaje.ts:26-30` declara inaceptable — y es el canal por el
que después tiene que llegar su liquidación. Para el contralor, el historial de
cobranza deja de ser evidencia: `cobranza_contacto` dice un contacto donde
hubo tres mensajes.

Causa raíz probable: el outbox se insertó en la capa más baja (`meta/client.ts`)
para no tocar llamadores, y con eso quedó invisible para las políticas de
reintento que viven arriba; el `dedupe_key` que habría hecho idempotente el
reintento se creó en la migración y nunca se cableó.

---

### [ALTO] AGEN-19-3 — El outbox entrega mensajes que la conversación registró como NO entregados: el agente contesta sin saber lo que preguntó
`src/lib/likida/processor.ts:1118-1123, 2305, 2313-2324, 2863, 3052-3054` · `src/lib/likida/wa_outbox.ts:14-23`

`say()` devuelve `false` cuando `sendText` devuelve `null`, y todo el processor
usa ese booleano como «esto NO llegó»:

```ts
// :3052  await saveConversation(conv.id, entregado ? [...turns, {role:'assistant', content: reply}] : turns, …)
// :2324  intentosConfirmacion: entregado && (c.estado === 'ambiguo' || …) ? intento : 0,
```

El comentario de `:2308-2312` dice por qué, y tiene razón: *«un mensaje rebotado
que quedara en el historial haría que el agente diera por dicho algo que el
chofer nunca leyó»*. El outbox invirtió la premisa: ahora un rechazo
reintentable **sí** se entrega, un minuto después.

Escenario, con valores. El chofer tiene dos viajes candidatos y escribe «ya
salí». `atenderConfirmacion` produce *«¿Es tu viaje V-2026-0912 a Querétaro?
Contéstame sí o no.»* → `say()` → Meta contesta **130429** (rate limit de la
cuenta) → reintentable → se encola en `wa_outbox` → `sendText` devuelve `null`
→ `entregado = false`:

- `saveConversation` guarda el turno del chofer y **no** el del asistente
  (`:2316`);
- `intentosConfirmacion` se pone en **0** (`:2324`).

11:01 — el outbox entrega la pregunta. El chofer la lee y contesta **«sí»**.

Turno siguiente: `conv0.turns` no tiene la pregunta, `intentosConfirmacion` es
0, y `atenderConfirmacion` recibe un «sí» que no responde a nada que él tenga
registrado. `pidioCerrar('sí')` es `false` (ni `pareceCierre` ni el `RegExp` de
`:485` casan con «sí» a secas), así que `guardar_liquidacion` **ni siquiera
está en la lista de tools de ese turno**. El chofer contestó que sí, el viaje
no se confirma, y el ciclo vuelve a empezar desde cero.

Consecuencia. El chofer manda sus comprobantes al viaje equivocado o a ninguno,
y desde su lado el bot le hizo una pregunta y luego actuó como si no se la
hubiera hecho. Es el «se trabó» sin ningún síntoma que lo delate: el log dice
`wa.respuesta_no_entregada` (`:3062`) sobre un mensaje que sí se entregó.

Causa raíz probable: `sendText → null` significaba «el chofer no lo leyó» y esa
equivalencia era la base de tres decisiones de estado; el outbox la rompió sin
darle a los llamadores forma de enterarse (no devuelve «encolado», devuelve
fallo).

---

### [ALTO — ARREGLADO DURANTE ESTA RONDA, no lo cuentes] AGEN-19-4 — El botón de pánico no apagaba el outbox
`src/app/api/cron/wa-outbox/route.ts:20-40` (estado de hoy) · `src/lib/admin/salud.ts:57-73`

Lo levanté y a media auditoría dejó de ser cierto: el autofix del rubro de
backend (BACK-19-1) metió la compuerta del interruptor en esa ruta. **Lo dejo
escrito porque el escenario sigue siendo el que hay que no volver a permitir**,
no porque siga abierto — verificado contra el archivo en disco.

Lo que había: `puertaCron` verifica **sólo** el `CRON_SECRET`
(`salud.ts:57-73`), y `wa-outbox` era el único cron que no llamaba
`estaApagado`/`leerInterruptor` en ningún punto — mientras `escalar`, `facturar`,
`gps`, `purgar` y `wa-pendientes` sí, y `runner` lo hereda de
`correrRunner` (`agentes/runner.ts:156`).

Escenario, con valores. 11:40 — una corrida de cobranza sale con el texto mal
(unas `config.instrucciones` recién editadas) y Meta empieza a contestar 131048
por calidad. En diez minutos `wa_outbox` acumula ~300 filas. 11:52 — Javier baja
el interruptor `global` desde ⌘K. El webhook deja de contestar
(`whatsapp/route.ts:293-300`), `wa-pendientes` se detiene, `escalar` se detiene.
11:53 — `wa-outbox` reclamaba 25 (`reclamarSalidasWhatsApp(25)`), las mandaba con
`conPool(4)`, y respondía `{corrio:true, enviadas:25}`. 11:54, otras 25… Los 300
mensajes salían íntegros en doce minutos con el producto oficialmente apagado.

Cómo quedó: `leerInterruptor('global')` **antes** de reclamar (la posición
correcta: un lease tomado con el sistema apagado secuestra la salida hasta que
expire), con `ilegible → 500` y `apagado → 200 + saltado`, igual que
`wa-pendientes`. La compuerta está bien puesta.

Lo que este hallazgo deja abierto de todos modos: es el tercer síntoma del mismo
hueco que AGEN-19-2 y AGEN-19-3 —el outbox es un canal de salida que ninguno de
sus vecinos sabe que existe—, y los otros dos siguen en pie.

---

### [ALTO] AGEN-19-5 — «No guardé nada» sobre una declaración fiscal que sí quedó escrita: al repetirla, se aplica a la pregunta siguiente
`src/app/dashboard/onboarding/chat.tsx:310-322` · `src/app/api/dashboard/onboarding-chat/route.ts:77-79` · `src/lib/likida/perfil/entrevista-aplicar.ts:77-89` · `src/lib/likida/perfil/entrevista.ts:502-516, 864-869`

La entrevista es *stateless por turno*: cada POST vuelve a leer `tenant.perfil`
y la pregunta de turno es `pendientes[0]` (`entrevista.ts:513`). La escritura
ocurre **dentro** del turno (`entrevista-aplicar.ts:78`, `guardarPerfilPatch`) y
**antes** de tres pasos que pueden fallar por su cuenta: la relectura
`getPerfilCrudo` (`:79`), `actualizarFacilidad15` (`:82`) y
`guardarConfigCobranza` (`:86`). Cualquiera de los tres lanza → la excepción
sube hasta `route.ts:77-79`, que emite `{t:'error', error:'no pude guardar esa
declaración'}`. El cliente tiene además su propio `catch` (`chat.tsx:318-322`)
que escribe, textual:

> Se cortó la conexión. **No guardé nada.** Repite la respuesta o usa el formulario.

Las dos frases afirman lo contrario de lo que hay en la base.

Escenario, con valores. El dueño va en `dedicacionExclusivaCarga` («¿Se dedican
exclusivamente al transporte de carga?»). Contesta **«sí»**.
`guardarPerfilPatch` escribe `dedicacionExclusivaCarga = {valor:true,
procedencia:'declarado'}`. Un bache de red corta el NDJSON antes del evento
`fin` → `chat.tsx:318` pinta «No guardé nada. Repite la respuesta».

Él repite **«sí»**. El servidor relee el perfil: `dedicacionExclusivaCarga` ya
está declarado, así que `pendientes[0]` es ahora **`transporteDedicado`**
(`entrevista.ts:160` → `:173`, cuatro preguntas de sí/no seguidas:
`dedicacionExclusivaCarga`, `transporteDedicado`, `hombreCamion`,
`tarjetasANombreEmpresa`). `parseCampo('transporteDedicado','sí')` → `true` →
se declara un hecho que el dueño **nunca vio preguntado**, con
`procedencia:'declarado'`.

Consecuencia. La regla fundacional del producto es no afirmar un hecho que el
cliente no declaró, y el candado entero de `preguntas.ts:86-91` (`decidir()`
rechaza `inferido`/`default`/`ausente`) existe para eso. Aquí se salta por
arriba: el campo entra como *declarado* sin declaración. La familia de campos que
esto puede desplazar incluye `casetasRedNacional` (la condición de Red Nacional
del estímulo de peaje, `entrevista.ts:243`) y `creditoEstacion` (el IVA que
espera el REP, `:230`), los dos consecutivos y los dos de sí/no. Y la variante
sin red —el `{t:'error'}` de `route.ts:79`— produce lo mismo de forma
determinista, sin que haga falta ninguna falla de conexión.

Causa raíz probable: el texto de error del cliente afirma un hecho sobre el
servidor («no guardé nada») que el cliente no puede saber, y la escritura no es
un solo statement: entre `guardarPerfilPatch` y la respuesta hay tres viajes de
red más que pueden convertir un turno exitoso en un error visible.

---

### [ALTO · REINCIDENTE] AGEN-19-6 — La libreta de la ráfaga sigue muriendo con la invocación que no cierra la barrera (era AGEN-C4-1)
`src/lib/likida/intake/rafaga.ts:20-27, 99, 158-163` · `src/lib/likida/processor.ts:1869, 1895-1899, 1937-1953` · `vercel.json:5-8`

Sin cambios. `bandejas` sigue siendo un `Map` de módulo (`:99`), `cerrarRafaga`
(`:158`) sigue siendo su único lector, y `processor.ts:1899`
(`const rafaga = ultima ? cerrarRafaga(viajeId) : null`) sigue siendo el único
sitio que lo llama. La invocación que no ve `quedan === 0` no manda nada y su
libreta se va con el proceso.

Escenario (idéntico al de la c4, revalidado contra el árbol de hoy): 22 fotos en
un POST a las 10:14:30; el webhook procesa con `MAX_EN_PARALELO = 5`; a las
10:15:00 el cron `wa-pendientes` (`* * * * *`) toma las que el lease ya soltó y
las procesa en **su** invocación. Las 3 ilegibles que cayeron del lado del
webhook se anotan en el `Map` W, su `-1` no ve 0, y nadie lee W. El resumen que
sí sale (`processor.ts:1950-1953`) dice *«📸 Ya revisé tus fotos. En este viaje
llevo 19 comprobantes por $24,180.00»* sin una palabra de las tres.

La justificación escrita (`rafaga.ts:20-27`, *«un caso que hoy no ocurre»*) sigue
sin actualizarse desde que el cron pasó a cada minuto, y el lease de 0177 no la
toca: reparte mejor el trabajo entre invocaciones, que es justo lo que hace más
probable el reparto de la ráfaga.

Consecuencia. Los $4,200 de las tres ilegibles quedan como anticipo en contra del
chofer, irreversible por los triggers 0036/0037.

---

### [ALTO · REINCIDENTE] AGEN-19-7 — Con el LLM caído tras el cierre, el chofer sigue recibiendo el cuadre neutro de un viaje ya liquidado (era AGEN-C4-2)
`src/lib/likida/processor.ts:2692, 2711-2712, 2762-2765` · `src/lib/likida/cuadre/resumen.ts:55` · `.env.example:80` · `docs/conocimiento/51-boletin-tecnico.md:101`

Sin cambios de código. `const recuperar = process.env.LIKIDA_RECUPERAR_CIERRE_PARCIAL === '1'`
(`:2692`) sigue apagado por default; `cierreParcial` sólo se calcula
`recuperar && parcial?.find(...)` (`:2711-2712`), así que un
`PartialExecutionError` que trae `guardar_liquidacion` **sin error** cae igual al
`else`, y ahí `:2764` responde
`resumenCuadre(await cuadrarDesdeDB(...), false, 'operador')` — encabezado
*«Este es el cuadre de tu viaje 👇»* (`resumen.ts:55`), con `closed` en `false`,
así que ni el PDF al operador ni `avisarCierreAlJefe` corren.

Lo único que cambió es la contabilidad del costo (`:2701-2710` ahora registra
`registrarCosto` del parcial), que es un arreglo real pero de otro rubro. La
base sigue diciendo `viaje.estatus = 'liquidado'` mientras el chofer lee un
mensaje que no afirma cierre y el contralor no recibe nada.

---

### [ALTO · REINCIDENTE] AGEN-19-8 — «Sin presupuesto» manda el cuadre y SELLA el mensaje: el «listo» del chofer se consume sin cerrar nada (era AGEN-C3-1, agravado)
`src/lib/likida/processor.ts:2618-2628, 721-730` · `src/lib/likida/cuadre/resumen.ts:55`

El bloque es idéntico al de la c4, pero mirándolo con la pregunta del rubro —«si
el proceso muere aquí, qué queda»— se ve que es peor de lo que la c4 dijo:

```ts
// :2618  if (!reloj.alcanza(COSTO_AGENTE_MS)) {
// :2622    await say(resumenCuadre(liq, false, 'operador'));
// :2627    return;
```

Ese `return` **no** llama `soltarClaim`, así que `claimLiberado` queda en `false`
y `processInbound` devuelve `'procesado'` (`:728-730`). Los dos llamadores
—`drenado.ts:118` y `whatsapp/route.ts:369`— sellan entonces `procesado_en`.

Escenario, con valores. 14:02, el chofer escribe **«listo»** sobre V-2026-0847.
La invocación viene cargada (una ráfaga de fotos se comió el reloj), así que
`reloj.alcanza(15_000)` da `false`. Él recibe:

> Este es el cuadre de tu viaje 👇
> • Comprobado: $18,430.00
> • Anticipo: $20,000.00
> • Sobró $1,570.00 del anticipo (a favor de la empresa)

Sin una palabra sobre qué hacer. El viaje queda **abierto**, no hay liquidación,
no hay PDF, el contralor no se entera — y la fila de `wa_evento_pendiente` queda
sellada, así que **nadie va a reintentar ese «listo»**. El chofer, que acaba de
leer sus tres cifras completas, se baja del camión.

Consecuencia. Es el «se trabó» perfecto: la salida existe, es correcta, y no
cierra el ciclo; y el único mecanismo que podía reintentarlo se apagó solo.

---

### [ALTO · REINCIDENTE] AGEN-19-9 — `pidioCerrar` sigue abriendo el cierre irreversible sobre frases que dicen lo contrario (era AGEN-C4-4)
`src/lib/likida/processor.ts:482-486` · `src/lib/likida/tools.ts:234-241` · `src/lib/likida/tools_cierre_pedido.test.ts:114-119`

Byte por byte igual. El grupo decisivo sigue con el calificador opcional:

```
(no|sin)\s+(traigo|tengo|me\s+falta|falta)\s*(m[áa]s|nada|otro|ninguno)?
```

El `?` convierte «no traigo **más**» en «no traigo» a secas, sin ancla. Sobre el
árbol de hoy siguen dando `true`: `no traigo el de casetas`, `no tengo señal`,
`se me acabó la gasolina`, `¿ya está lista mi liquidación?`, `cuádrame lo que
llevo`, `no me cuadra el anticipo`.

Escenario, con valores. V-2026-0912, 9 comprobantes por $11,340, anticipo
$15,000. El chofer escribe **«no traigo el de casetas, ¿lo mando mañana?»** →
`pidioCerrar` es `true` → `guardar_liquidacion` existe en ese turno y el único
freno que queda es el prompt (`prompts.ts:89`: *«si el operador ya confirmó que
terminó, CIERRA en ese turno»*). El viaje puede quedar liquidado con los $3,660
de casetas en contra del chofer, irreversible por 0036/0037.

La prueba que lo respalda (`tools_cierre_pedido.test.ts:114-119`) sigue probando
sólo seis frases limpias.

---

### [ALTO · REINCIDENTE] AGEN-19-10 — Liberar la escalación borra la prueba de que el recordatorio salió, y se lo vuelve a mandar cada hora (era AGEN-C4-5)
`src/lib/likida/escalar_viaje.ts:342-346, 395, 546-563` · `src/lib/meta/client.ts:142-145` · `vercel.json:17-20`

Sin cambios. El orden del loop sigue siendo 1) recordarle al chofer (`:342`),
2) avisarle al jefe (`:395`), y `liberarEscalacion` sólo se llama en el paso 2.
Y sigue escribiendo `avisos_enviados: v.avisosEnviados` (`:553`), deshaciendo el
`+1` de `reclamarEscalacion` (`:572`): después de liberar no queda en la base una
sola columna que diga que ese recordatorio salió.

Escenario (revalidado): V-2026-0733, plantilla `recordatorio_cierre` pausada por
calidad (132015, reintentable según `client.ts:143`). 09:00 el chofer recibe *«Te
recuerdo tu viaje V-2026-0733: lo tienes asignado desde hace 5 horas…»*; el
aviso al jefe rebota por los dos caminos con código reintentable →
`liberarEscalacion` → `escalado_en = null`. 10:00, 11:00, 12:00: el chofer
recibe **el mismo texto**, con el «desde hace 5 horas» congelado.

Nuevo agravante de este delta: el outbox (AGEN-19-2) tiene además guardada cada
una de esas copias y las reintenta por su cuenta.

---

### [ALTO · REINCIDENTE] AGEN-19-11 — Las flotas que el corte global deja sin cobranza siguen sin contarse: la alarma de RES-6 no puede dispararse (era AGEN-C4-6)
`src/lib/likida/agentes/cobranza.ts:463-467` vs `:480-486` · `src/app/api/cron/escalar/route.ts:184-201`

Sin cambios. El `break` del corte por reloj (`:466`) sólo escribe un
`logger.warn`; la rama de rechazo masivo, veinte líneas abajo, sí suma
(`:486`). `cron/escalar/route.ts:184-185` deriva `cortados` de ese contador y
`:187-201` es la única entrada de la alarma `corte_por_reloj_repetido`.

Escenario (revalidado): 40 flotas, `venceCobranza = inicio + 105 s`, la
escalación gasta 20 s → `venceFlota = min(30s, max(5s, 85/40)) = 5 s`; ninguna
flota reporta corte propio; a los 85 s el `break` deja 12 flotas sin cobrar y
`total.cortadosPorReloj = 0` → `registrarLatido('escalar','ok')` (`route.ts:207`).
Doce flotas sin cobranza cada hora, `/api/health` en verde.

---

### [MEDIO] AGEN-19-12 — `parseUnidades` no puede fallar: cualquier frase se convierte en unidades reales dadas de alta
`src/lib/likida/perfil/entrevista.ts:630-641, 758-762` · `src/lib/likida/perfil/entrevista-aplicar.ts:182-189` · `src/lib/likida/operacion.ts:817-824`

```ts
function parseUnidades(t: string) {
  const partes = t.split(/[,;]| y /i).map(p => p.trim()).filter(Boolean);
  const out = [];
  for (const p of partes) {
    const tokens = p.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    if (tokens.length === 1) out.push({ economico: tokens[0].slice(0,20) });
    else out.push({ economico: tokens[0].slice(0,20), placas: tokens.slice(1).join('').slice(0,12) });
  }
  return out.length > 0 ? out : undefined;
}
```

Para cualquier texto no vacío devuelve algo. `validarUnidad`
(`operacion.ts:817-824`) sólo rechaza el económico vacío o de más de 40
caracteres. Y `esNoSe` (`entrevista.ts:520`) sólo casa con frases exactas
(`^no se$`, `^despues$`, …).

Escenario, con valores. Pregunta de turno `unidadesAlta`. El dueño escribe
**«las subo después, son 40 camiones»**. `esNoSe` no casa. `parseUnidades` parte
en dos: `{economico:'las', placas:'subodespues'}` y `{economico:'son',
placas:'40camiones'}`. `nutrirDesdeHechos` (`entrevista-aplicar.ts:182-189`)
llama `crearUnidad` dos veces y contesta *«Unidad las dada de alta. Unidad son
dada de alta.»* Quedan dos filas en `unidad` con ese nombre, y el perfil declara
`unidadesAlta` como hecho del cliente.

Combinado con el adjunto pegajoso de AGEN-19-1, el mismo turno con un CSF
adjunto parte 16,000 caracteres por comas y punto y coma: decenas de
`crearUnidad` en serie dentro de una petición de 120 s. Si la petición muere a
la mitad, las que alcanzaron a escribirse quedan y el usuario no recibe ninguna
respuesta.

Consecuencia. El panel del contralor enseña unidades inventadas en la primera
pantalla del producto. Es la regla «nunca inventar» rota por un parser que no
sabe decir «no entendí».

---

### [MEDIO · REINCIDENTE] AGEN-19-13 — La cobranza le sigue diciendo «llevas N días sin mandarme comprobantes» a quien sí los mandó (era AGEN-C3-4)
`src/lib/likida/agentes/cobranza.ts:115-174` · `src/lib/likida/agentes/cobranza_pura.ts:105-120`

`colaCobranza` selecciona por `estatus in ('abierto','en_cuadre')` + `avisado_en
not null` + días transcurridos. No mira `gasto` en ninguna línea. El texto
(`cobranza_pura.ts:112`) sigue siendo `Llevas ${dias} días con ${viaje} sin
mandarme comprobantes. 📋`.

Escenario: V-2026-0844, 6 días, **14 comprobantes ya registrados** por $16,240
(el chofer los fue mandando en ruta y sólo falta que escriba «listo»). A las
11:00 recibe *«Llevas 6 días con tu viaje V-2026-0844 sin mandarme
comprobantes»*. La instrucción correcta para él está en la línea 4 del mismo
mensaje («si el viaje ya terminó y falta cerrarlo, dime»), después de haberle
dicho que no mandó nada.

---

### [MEDIO · REINCIDENTE, atenuado] AGEN-19-14 — El intento se sigue consumiendo por «ni se miró», y el webhook sigue sin devolverlo (era AGEN-C3-5 / AGEN-C4-3)
`src/app/api/cron/wa-pendientes/drenado.ts:97-108` · `src/app/api/webhook/whatsapp/route.ts:360-367` · `src/lib/likida/wa_pendientes.ts:26, 168-189`

El lease de 0177 quitó el motor del hallazgo (la fila en vuelo ya no se
re-reclama, `wa_pendientes.ts:128`), pero el contador sigue mezclando dos hechos:

- `drenado.ts:107` (`await anotar('pospuesto: ' + resultado)`) consume el intento
  para `en_curso`, bajo un comentario que afirma *«el resto de los pospuestos SÍ
  consumen: ahí el motor trabajó»* (`:101`) — y `processor.ts:704-706` devuelve
  `'en_curso'` **antes** de `procesarTurno`, sin tocar nada.
- El webhook (`route.ts:360-367`) llama `anotar(...)` para los **tres** estados y
  sólo después decide si corta la cadena; nunca llama
  `devolverIntentoPendiente`. O sea que `sin_tiempo` —el caso que ESC-1 arregló
  en el cron— sigue quemando intento aquí.

Y `anotarFalloPendiente` (`wa_pendientes.ts:195`) pone
`lease_expires_at = new Date().toISOString()`, o sea libera el lease de
inmediato: la fila vuelve a ser reclamable en el mismo segundo, y el techo de 5
intentos se puede agotar en cinco minutos de cron. `MAX_INTENTOS_PENDIENTE`
sigue documentado como *«5 corridas del cron son ~25 min»* (`:25`) y
`conv.ts:387` sigue diciendo *«el cron drena cada 5 min»*: los dos se
escribieron contra `*/5 * * * *`.

---

### [MEDIO] AGEN-19-15 — Lo que sale por el outbox no cuenta su costo de WhatsApp
`src/app/api/cron/wa-outbox/route.ts:31-45` · `src/lib/likida/processor.ts:1118-1123` · `src/lib/likida/costos.ts:86`

`say()` sólo registra `registrarCostoWhatsApp` cuando el envío devolvió wamid
(`processor.ts:1120-1121`) — decisión correcta y bien argumentada en su
comentario (`:1113-1114`: *«se cobraba el costo de un mensaje que no se entregó,
inflando el costo por liquidación»*). El outbox entrega ese mismo mensaje después
y no registra nada: `wa-outbox/route.ts` no importa `costos.ts`, y su `payload`
ni siquiera lleva `tenantId` o `viajeId` con qué atribuirlo.

Consecuencia. El costo por liquidación que se enseña en `/admin` subestima justo
el modo de falla que más mensajes manda (reintentos por rate limit). Es el mismo
defecto que la c4 reportó del piloto de visión, en un módulo nuevo.

---

## Lo que revisé y está bien

- **El lease de la bandeja durable (0177) es correcto.**
  `reclamar_wa_pendiente` (`0177_entregas_distribuidas.sql:57-70`) es un UPDATE
  anclado por `intentos`, `procesado_en is null` y `lease_expires_at < now()`,
  y `pendientesPorDrenar` (`wa_pendientes.ts:122-131`) filtra por el mismo
  predicado. `marcarPendienteProcesado` y `devolverIntentoPendiente` anclan por
  `claim_token`, así que un worker viejo no puede sellar lo que otro reclamó.
  Es el arreglo que cierra AGEN-C4-7 y el 80% de AGEN-C4-3.
- **La reserva de presupuesto del runner (0180) resuelve la carrera que
  declara.** `reservar_presupuesto_agente` toma `pg_advisory_xact_lock` por
  `(agente, día)` y descuenta reservas vivas además del gasto medido
  (`:32-42`); `runner.ts:211-229` falla cerrado en las dos direcciones —no se
  pudo reservar → se salta; el lote lanzó → `cerrarReserva(id, 0)`— y deja el
  lease vivo a propósito cuando el cierre falla (`:98-103`).
- **La entrevista NO deja que el modelo escriba.** `responderEntrevista`
  (`entrevista-agente.ts:41-76`) manda al LLM **sólo** cuando `parecePregunta` y
  devuelve `guardado: false`; toda declaración pasa por `parseCampo`
  (`entrevista.ts:671-838`), que es determinístico. El system prompt
  (`:16-28`) prohíbe declarar hechos y citar artículos fuera del catálogo, y el
  catálogo se construye desde `CATALOGO` en el mismo archivo. La arquitectura es
  la correcta; los defectos que reporto están en los parsers y en el transporte,
  no en el reparto de responsabilidades.
- **`declararAusente` y el candado de procedencias.** `decidir()`
  (`preguntas.ts:86-91`) rechaza `inferido`, `ausente` y `default`, y `Perfil` no
  se exporta: un agente no puede leer un campo crudo. `requeridaParaPanel`
  (`entrevista-aplicar.ts:43-55`) impide que las dos preguntas del estímulo de
  peaje se dejen pendientes con un «no sé».
- **La guardia de cifras.** `cuadre/guardia.ts:37-118`: separa `cuadro` de
  `cerro`, usa el **snapshot** que devolvió `guardar_liquidacion` en vez de
  releer la base (cierra AG-3 de verdad), coteja cifra por cifra cuando sólo se
  consultó política, y falla cerrado sin cifras. `destinatario: 'operador'` va
  explícito para no mandarle veredictos fiscales al chofer.
- **El mutex del cierre y el claim huérfano.** `conv.ts:638-690` y `:425-455`
  siguen como los dejó la c4: tres estados distinguidos, `indeterminado`
  fail-closed en `processor.ts:2516-2540`, y `TTL_LOCK_CIERRE_MS =
  PRESUPUESTO_WEBHOOK_MS` (`conv.ts:599`).
- **El paralelismo por chofer en el webhook.** `whatsapp/route.ts:330-341`
  agrupa por remitente y procesa en serie dentro de cada cadena, con `continue`
  y no `return` (`:345-348`) para no saltarse los mensajes siguientes del mismo
  chofer. Es el arreglo correcto al «listo que adelantaba» del lado del webhook.
- **`runAgent` sigue teniendo un solo call site** (`processor.ts:2631`), así que
  no hay una segunda entrada al agente que se salte `cierrePedidoPorTexto`.
- **El outbox, en lo suyo, está bien construido.** `reclamar_wa_outbox`
  (`0180:85-101`) usa `for update skip locked`, backoff exponencial con techo de
  una hora y `dead` a los 8 intentos (`:112-113`); `finalizarSalidaWhatsApp`
  ancla por `lease_token` y grita si perdió el claim (`wa_outbox.ts:39`). Lo que
  falta no es la mecánica: es que nadie más sabe que existe.

## Lo que NO alcancé a revisar

- **`agentes/notificaciones.ts` (1,050 líneas).** Igual que la c4: entré por
  `avisar` y `avisarCorridasPorFlota`; el anti-ruido por magnitud y el cierre de
  incidentes no los recorrí con la pregunta de «si muere aquí».
- **`agentes/cola.ts` (444 líneas), la puerta de salida de las piezas
  aprobadas.** Verifiqué `redactor.ts` completo (su contabilidad de costo en el
  `catch` de `:216-225` está bien: registra el gasto aunque la pieza no entre),
  pero no el tope diario de envío ni el CHECK enviar-solo-aprobado.
- **`copiloto*.ts` (≈1,200 líneas en `src/lib/agents/`).** Fuera del ciclo de
  vida del chofer, y el delta no los tocó de forma sustantiva.
- **El régimen 624 y `0172_regimen_624_coordinados.sql`** desde el ángulo
  fiscal: sólo verifiqué que `parseRegimenSat` (`entrevista.ts:588-598`) deriva
  `regimenElegible` de la clave y no de un «sí califico», que es lo que me toca.
- **Frecuencia real.** AGEN-19-2, 19-3 y 19-6 dependen de cuántos envíos rebota
  Meta y de cómo agrupa los POST, y eso no se mide aquí (sin `.env`, sin base,
  sin red al proveedor). Los hallazgos se sostienen por el `if`, el `Map` y las
  consultas; lo que no puedo dar es cada cuántos mensajes ocurre.
- **Sin render y sin `npm run build`** (los dos prohibidos en esta ronda). Corrí
  `npx vitest run src/lib/likida/perfil/` — 4 archivos, 49 pruebas, verde. El
  CRÍTICO AGEN-19-1 no lo contradice ninguna: la única prueba que se le acerca
  (`entrevista.test.ts:75-86`) corre con el perfil vacío, donde la pregunta de
  turno no es `razonSocial`.
