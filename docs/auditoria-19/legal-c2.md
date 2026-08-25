# Cumplimiento legal — auditoría 19 c2

**Nota: 3/10** (antes 3). **La nota no se mueve**, y decirlo es el hallazgo:
el commit que se llama literalmente *«Compuerta legal»* (`69aa71b`) **no cerró
ninguno de los cuatro CRÍTICOS**, no tocó `privacidad.ts` ni `aviso/`, y lo que
sí construyó —`src/lib/legal/config.ts`— es un semáforo que se pone en verde
**sin que el documento gane un solo dato de los que la ley obliga a exhibir**.
Verificado abriendo los archivos de hoy: `git diff 8b43121 origin/master --stat`
no lista `src/lib/likida/privacidad.ts` ni `src/app/aviso/**`.

Se cerró **uno** de los veintidós, y por colateral: el `beforeSend` nuevo de
Sentry borra `extra` de todo evento (`observability/sentry.ts:62`), que era el
canal exacto del hallazgo 20. El mismo commit abrió una fuga por el otro lado
(hallazgo A3 de abajo).

No bajo a 2 porque el rubro **sí está atendido** —hay tres avisos escritos con
criterio, un ejecutor ARCO bien razonado, purgas con piso, un filtro de datos
sensibles que descarta el campo entero— y el ancla del 3 describe esto exacto:
*«3 o menos si hay transferencia de datos personales sin cobertura»*.
`redactor.ts:197,200` lleva **seis pasadas** siendo eso.

**El riesgo mayor del rubro, hoy:** sigue siendo el de ayer, intacto — el aviso
que la flota le entrega a su chofer afirma en negritas *«No hay GPS ni rastreo
del teléfono»* (`privacidad.ts:520`) y el cron de `vercel.json:30`
(`*/5 * * * *`) lleva dos días asentando su ubicación. Lo nuevo es que ahora hay
un archivo llamado `legal/config.ts` que un tercero puede leer como si eso
estuviera atendido.

---

## Qué cerró el commit `69aa71b` («compuerta legal») y qué no

Los veintidós de la ronda 19, uno por uno, contra el árbol de hoy.

| # (r19) | Hallazgo | Estado | Verificación de HOY |
|---|---|---|---|
| 1 | GPS escribiendo mientras el aviso dice «No hay GPS» | **ABIERTO** (2ª) | `sincronizar_gps.ts:145` (`upsert` en `posicion`) · `vercel.json:30` · `privacidad.ts:520` y `:232` **sin una línea de diff** en el delta |
| 2 | El Redactor manda nombre y notas del decisor al modelo | **ABIERTO** (6ª) | `redactor.ts:197` (`Contacto: ${prospecto.contacto_nombre}`), `:200` (`notas.slice(0,500)`), `:208` (`generateResponse`). Cero imports de `seudonimo.ts` |
| 3 | `/aviso/<tenant>` 404 por `domicilio_fiscal` | **ABIERTO** (6ª) | `repo.ts:1042` (`razonSocial && domicilio`), `[tenant]/page.tsx:68` (`notFound()`). Escritores de `domicilio_fiscal` hoy: `scripts/demo-5k.sql:39`, `qa-motor.ts:139`, `scripts/qa-agentes/orquestador.qa.ts:90`. **Ninguno de producción** |
| 4 | La purga de prospectos borra `contacto_nombre` y nada más | **ABIERTO, agravado** | `0148:73-74` intacto. Agravante nueva: hallazgo A4 |
| 5 | `ejecutar_arco_cancelacion` sin llamador | **ABIERTO** | `grep -rn "ejecutar_arco" src/` → **cero**. Sigue solo en `supabase/verificaciones.sql` |
| 6 | Cal.com: payload íntegro sin purga ni aviso | **ABIERTO** | `webhook/calcom/route.ts:71` (`payload: evt.payload ?? {}`); `comercial_evento` fuera de las 14 purgas de `0165:214-241` |
| 7 | El aviso promete borrar la foto; la 0178 decidió que no | **ABIERTO** | `privacidad.ts:528` («puedes pedir que la foto se borre») sin cambio |
| 8 | Los tres avisos sin identidad ni domicilio del responsable | **ABIERTO; el cableado nuevo NO lo cierra** | Ver hallazgo **A1** — es el corazón de esta ronda |
| 9 | La baja por «BAJA» no existe | **ABIERTO** | `grep -rn "BAJA" src/lib/likida/agentes/ src/lib/correo/ src/app/api/correo/` → **cero** |
| 10 | El primer toque sale sin liga del aviso por 2 de 3 canales | **ABIERTO** | `pieAvisoProspectos` sigue con **un** llamador: `mapa-prospectos/mensaje/route.ts:110` |
| 11 | El gate del aviso no es lo primero | **ABIERTO** | `processor.ts:945` (`atenderTextoOficina`) sigue delante de `:960` (`ponerAvisoADisposicion`) |
| 12 | El piloto de visión manda la pantalla autenticada al modelo | **ABIERTO** | `piloto_vision.ts:148,155,197` y `:374` (`images:`) |
| 13 | Nadie lee `fallos` de la RPC de purga | **ABIERTO** | `cron/purgar/route.ts:143` solo mira `storage`; la llave `fallos` de `0165` sigue sin lector |
| 14 | El aviso dice «no nos diste tus datos» al lead de `/getdemo` | **ABIERTO** | `privacidad.ts:738,747` sin cambio; `api/lead/route.ts:195-200` sigue escribiendo nombre, correo, teléfono y `fbclid` |
| 15 | Nada fija la jurisdicción del proveedor | **ABIERTO** | `openrouter.ts:272-273`: `provider: { data_collection: 'deny' }`, sin `only` ni `order`. `models.ts:89` sigue `openai/gpt-oss-120b` |
| 16 | El correo adivinado cuenta como decisor verificado | **ABIERTO** | `prospectos-mapa.ts:466` **y `:673`** (`confianza !== 'baja'`), sumando en `:296` |
| 17 | La credencial revocada conserva su contraseña cifrada | **ABIERTO** | `credenciales.ts:170` sigue `update({ activo: false })` |
| 18 | `/privacidad` no enumera el contenido de los mensajes | **ABIERTO** | La lista sigue en `privacidad/page.tsx:64-70` y la cláusula de terceros en `:87` («los modelos de lenguaje que leen los comprobantes»). El commit tocó esta página y **no tocó ninguna de las dos** |
| 19 | La foto de perfil en bucket público | **ABIERTO** | `dashboard/mi-perfil/page.tsx:128` y `admin/mi-perfil/page.tsx:72` (`getPublicUrl('avatares')`) |
| 20 | El nombre de un chofer sale a Sentry por `extra` | **CERRADO (colateral)** | `sentry.ts:239` sigue mandando `extra: meta`, pero `sanitizarEventoSentry` hace `delete salida.extra` (`:62`) antes de enviar. Es un cierre a hachazos —Sentry se queda sin contexto— pero el dato ya no sale |
| 21 | El art. 32 de la ley abrogada en texto que se pinta | **ABIERTO** | `guardia.ts:73`, `escalaciones.ts:272`, `compliance/page.tsx:34`, `processor.ts:233`, `0173:5` |
| 22 | El correo en una cookie que ninguna página menciona | **ABIERTO** | `reenvio_enlace.ts:44,63`; `grep -c cookie src/app/privacidad/page.tsx` → **0** |

**Marcador: 1 de 22 cerrado, y no por el commit legal.** El commit legal cerró cero.

---

## Hallazgos

**4 CRÍTICOS · 13 ALTOS · 8 MEDIOS · 3 BAJOS.** Los 21 reincidentes quedan
verificados en la tabla de arriba con `archivo:línea` de hoy; abajo van con
ficha completa **solo los cuatro CRÍTICOS** (porque son los que la síntesis
escaló) y **los siete que el delta trajo**.

---

### A1. [ALTO · NUEVO] La compuerta legal se pone en verde sin que el documento gane un solo dato: `razonSocial` y `domicilio` no se pintan en ninguna sección de `/privacidad`, y `/terminos` sigue diciendo «pendientes de definir» en el cuerpo

`src/app/privacidad/page.tsx:41-42` frente a `:117,126` ·
`src/app/terminos/page.tsx:38-41` frente a `:203` · `:176` y `:190` ·
`src/lib/legal/config.ts:77-89`

**Norma:** LFPDPPP art. 15 fr. I (*«La identidad y domicilio de la persona
responsable»*).

**Escenario, con los valores.** El commit sustituye `razonSocial: null as string
| null` por `razonSocial: LEGAL_CONFIG.razonSocial` en las dos páginas. Javier
pone en Vercel las ocho variables: `LEGAL_ENTITY_NAME="Likida Operaciones, S.A.P.I.
de C.V."`, `LEGAL_ENTITY_ADDRESS="Av. …, Mérida, Yucatán"`, `LEGAL_JURISDICTION`,
`LEGAL_CONTACT_EMAIL`, y las cuatro `LEGAL_*_VERSION`. `estadoLegalProduccion()`
devuelve `listo: true` y **el banner rojo desaparece**.

Y entonces `/privacidad` publica esto: `grep -n "RESPONSABLE" src/app/privacidad/page.tsx`
devuelve **tres líneas** — la definición en `:37` y dos usos, `:117` y `:126`,
**los dos de `RESPONSABLE.contacto`**. `RESPONSABLE.razonSocial` y
`RESPONSABLE.domicilio` **no aparecen en ninguna de las ocho secciones**. La
página que ya no lleva banner sigue sin decir quién es la responsable ni dónde
tiene su domicilio. Lo mismo en `/terminos`: `PRESTADOR` solo se usa en `:203`
(`PRESTADOR.contacto`), y el cuerpo conserva, cableado a mano:

- `:190` — *«🔴 **Plaza y tribunales competentes: pendientes de definir.**»*
  (mientras `PRESTADOR.jurisdiccion` ya lee `LEGAL_JURISDICTION`)
- `:176` — *«🔴 **El contrato de encargado del tratamiento está pendiente de
  firma.**»* (mientras `LEGAL_DPA_VERSION` cuenta como satisfecha)

*Intento de refutación, que no prospera:* «pero antes tampoco se pintaban». Es
cierto, y por eso el hallazgo 8 sigue abierto. Lo que el commit **empeoró** es
la señal: el banner de antes decía *«Falta capturar la razón social y el
domicilio fiscal»* —le nombraba al lector el dato ausente— y ahora hay un
interruptor de entorno que lo apaga sin que el dato exista. La prueba
`privacidad.test.ts:53` se actualizó para exigir `LEGAL_CONFIG.razonSocial`, así
que hay una prueba verde custodiando un cableado que no llega a ningún render.

**Consecuencia.** El día que se completen las ocho variables —que es
exactamente el día que alguien las completa para vender enterprise— la única
señal de que el aviso está incompleto se apaga, y queda un documento que
incumple la fr. I sin decirlo. Frente al INAI, un aviso sin identidad del
responsable es un aviso sin responsable.

**Causa raíz probable.** Se cableó la *fuente* del dato (env → `LEGAL_CONFIG` →
`RESPONSABLE`) sin cablear el *destino* (una sección que lo imprima), y el gate
se ató a la variable de entorno en lugar de al texto publicado.

---

### A2. [ALTO · NUEVO] `exigirLegalEnProduccion()` vive dentro del `RootLayout`: la disponibilidad del aviso de privacidad quedó acoplada a la completitud del contrato, al revés de la obligación

`src/app/layout.tsx:55` · `src/lib/legal/config.ts:92-100` ·
`src/lib/legal/config.test.ts:22-25` · `.env.example:43-51`

**Norma:** LFPDPPP art. 17 y 18 — el aviso debe **ponerse a disposición** del
titular. Y el aviso simplificado que `processor.ts` manda por WhatsApp remite a
`/aviso/<tenant>`, alojado en esta misma app.

**Escenario, con los valores.** `src/app/` tiene **un solo** root layout
(`find src/app -name layout.tsx` → `layout.tsx`, `admin/`, `dashboard/`,
`vendedor/`; los tres últimos son anidados). `RootLayout` envuelve por tanto
`/privacidad`, `/terminos`, `/aviso/prospectos` y `/aviso/[tenant]`. En su
primera línea llama `exigirLegalEnProduccion()`, que con `VERCEL_ENV=production`
lanza `LEGAL_PRODUCTION_BLOCKED` si falta cualquiera de las cuatro variables de
identidad. Que lanza no es una hipótesis mía: `config.test.ts:24` lo afirma
(`expect(() => exigirLegalEnProduccion()).toThrow('LEGAL_PRODUCTION_BLOCKED')`)
y `.env.example:43-46` las envía **vacías** con `LEGAL_ENFORCE_PRODUCTION=true`
en `:51`.

El disparador realista no es «se olvidaron»: es `datoLegal`
(`config.ts:2-6`), que anula cualquier valor donde encaje
`/\b(?:completar|pendiente|todo|tbd)\b/i`. Una razón social mexicana perfectamente
inscrita como **«Grupo Todo Carga, S.A. de C.V.»** hace match en `\btodo\b`,
`LEGAL_CONFIG.razonSocial` queda `null`, y el `RootLayout` lanza en cada render:
`/aviso/<tenant>` deja de abrir para todos los operadores a la vez. Las rutas
`/api/*` no pasan por el layout, así que el webhook seguiría contestando y
mandando ligas a un aviso caído — el modo de falla más silencioso posible.

**Consecuencia.** La sanción por publicar un aviso incompleto es una; la de no
ponerlo a disposición es otra. Este diseño convierte la primera en la segunda:
mientras menos completo el aviso, **menos disponible**. Y el propio archivo ya
documenta que este gate tumbó builds reales (`config.ts:46-56`: hubo que hacer
`vercel promote` porque era la única vía que no exigía build) — se corrigió el
alcance (cuatro documentos fuera) sin corregir el sitio donde vive.

**Causa raíz probable.** Un gate de *venta enterprise* se colocó en el punto de
render de *todo el producto*, incluidos los documentos que el gate protege.

---

### A3. [ALTO · NUEVO] El mismo commit encendió las trazas de Sentry (0 → 0.05) y las declaró cubiertas por un `beforeSend` que, por contrato del SDK, no ve un solo evento de traza

`src/lib/observability/sentry.ts:52-55` (`tasaTrazas`), `:126-131` (el `init`) ·
`.env.example:86` · `docs/conocimiento/52-anexo-subencargados.md:61`

**Norma:** LFPDPPP art. 15 fr. II y art. 2 fr. XII (alcance del encargo).

**Escenario, con los valores.** Antes: `tracesSampleRate: 0`, con el comentario
*«Sin trazas: aquí interesan los errores»*. Ahora: `tracesSampleRate:
tasaTrazas()` = **0.05** por defecto, y `.env.example:86` lo publica como
`SENTRY_TRACES_SAMPLE_RATE=0.05`. El comentario nuevo (`:126-127`) afirma:
*«`sendDefaultPii:false` y `beforeSend` impiden que request context lleve
query/cookies/body»*.

`beforeSend` no hace eso. En el SDK instalado (`@sentry/nextjs` 10.70.0) la
firma es
`beforeSend?: (event: ErrorEvent, hint: EventHint) => …`
(`node_modules/@sentry/node/node_modules/@sentry/core/build/types/types/options.d.ts:597`),
y los eventos de traza tienen sus propios ganchos —`beforeSendSpan` (`:608`) y
`beforeSendTransaction` (`:622`)—. `grep -rn "beforeSendTransaction" src/` →
**NINGUNO**. `sanitizarEventoSentry`, que es quien recorta el query string
(`:66-73`), quita headers/cookies/body (`:75-77`) y vacía los breadcrumbs
(`:80-86`), **no corre para ninguna transacción**.

Lo que sí sale, entonces, es una de cada veinte peticiones con su URL entera.
Una es `/auth/callback?code=<pkce>` (`auth/callback/route.ts:14`): el código de
un solo uso que abre la sesión de una persona identificada, hacia un
subencargado cuya ficha en el anexo dice, literal, *«Solo `warn` y `error`, ya
redactados»* (`52-anexo-subencargados.md:61`). Telemetría de rendimiento no es
`warn` ni `error`, y nadie la redactó.

*Intento de refutación:* «`sendDefaultPii:false` ya lo cubre». Cubre IP,
cabeceras y cuerpo; no recorta el query string de `request.url` de una
transacción — precisamente por eso el código escribió a mano el recorte de
`:66-73`, que es el que no se ejecuta aquí.

**Consecuencia.** Una categoría entera de datos empieza a salir hacia un
subencargado fuera del alcance declarado en el anexo, y el comentario del código
—que es lo que leerá el siguiente auditor— afirma que está cubierta.

---

### A4. [ALTO · NUEVO] Un formulario público sin sesión puede escribir el nombre y el teléfono de un tercero dentro de `prospecto.notas`, que ninguna purga toca y que `redactor.ts` manda entero a un modelo externo

`src/app/api/lead/route.ts:227` y `:248` · `src/app/api/lead/mezcla.ts:41,51-57` ·
`supabase/migrations/0148_prospecto_persona_retencion.sql:73-82` ·
`src/lib/likida/agentes/redactor.ts:200`

**Norma:** art. 15 fr. II y fr. IV, y art. 11 (conservación).

**Escenario, con los valores.** `prospecto` ya tiene la fila de *Transportes
Perla* con `telefono='9991234567'`. Un visitante cualquiera abre `likida.ai/getdemo`
—o hace `POST` desde `https://likida.ai` con CORS válido— y manda
`{empresa:'Transportes Perla', nombre:'Ramón', apellido:'Treviño', whatsapp:'8112345678'}`.
`mezclaQueSoloRellena` hace lo correcto con el teléfono: no lo pisa. Pero lo
anota:

```ts
pisados.push(`${k}=${String(v)}`);            // mezcla.ts:41
```

y `route.ts:227` lo escribe:

```
[2026-08-25] /getdemo mandó datos DISTINTOS a los que ya había
(sin verificar, no se aplicaron): telefono=8112345678; contacto_nombre=Ramón Treviño
```

en `prospecto.notas`, hasta 4,000 caracteres (`mezcla.ts:18`), **la línea nueva
arriba** (`:56`). Desde ahí:

1. **No se purga nunca.** `purgar_prospecto_persona` (0148:73-82) hace
   `set contacto_nombre = null` y nada más; `notas` no está en el `update` ni en
   ninguna de las catorce purgas de `0165:214-241`. El aviso que cubre esta fila
   promete que a los 12 meses *«tu nombre, puesto, correo y teléfono se
   eliminan»* (`privacidad.ts:766`).
2. **Sale a OpenRouter.** `redactor.ts:200` manda
   `` `Notas del vendedor: ${prospecto.notas.slice(0, 500)}` `` a
   `generateResponse({role:'back_office'})` — y como la línea inyectada va
   primero, cae **entera** dentro de esos 500 caracteres.

El rate limit no lo frena: 10/min por IP (`route.ts:152`) y 1 cada 10 s por
llave (`:188`) permiten cientos de líneas al día contra la misma empresa.

*Intento de refutación:* «es la protección anti-sobreescritura, y la ronda
pasada la elogió». Sí — y la elogié yo, en `legal.md:713-716`. Mirándola de
cerca, el mecanismo que impide **modificar** un dato lo hace **acumulando** el
dato rechazado en un campo sin plazo y con salida a un tercero. Contener no es
descartar.

**Consecuencia.** Un dato personal de una persona que nunca tocó a Likida entra
por un endpoint anónimo, se conserva indefinidamente contra un plazo publicado,
y se transfiere a un modelo externo. Es también un vector para envenenar el
prompt del Redactor, pero eso es de otro rubro.

---

### A5. [MEDIO · NUEVO] El banco de fotos del panel de QA guarda tickets reales sin plazo, sin figurar en ninguna finalidad del aviso, y cada corrida los vuelve a mandar por el pipeline real hacia OpenRouter

`src/lib/admin/qa-storage.ts:9-14,37-38` · `src/app/api/admin/qa/fotos/route.ts:17` ·
`src/lib/admin/qa-motor.ts:29,446-451` ·
`supabase/migrations/0185_qa_panel_tablas.sql:35-64` ·
`supabase/migrations/0165_storage_sin_delete_directo.sql:214-241` ·
`src/lib/likida/privacidad.ts:532-547` (las finalidades)

**Norma:** art. 15 fr. III (finalidades) y fr. IV (plazo), y art. 11.

**Escenario, con los valores.** El propio archivo declara qué guarda
(`qa-storage.ts:9-11`): *«un ticket real trae RFC, domicilio y a veces nombre
del titular (art. 2 fr. VI LFPDPPP)»*. Se suben por `/api/admin/qa/fotos`, se
indexan en `qa_foto` (0185:35) y viven en los buckets `qa-fotos` y
`qa-evidencia` (`:37-38`). Cada corrida llama `processInbound` —la función de
producción, importada tal cual (`qa-motor.ts:29`)— con
`mediaDataUrlQA: dataUrl` (`:446-451`), de modo que la foto vuelve a salir hacia
OpenRouter en cada ejecución del banco.

Lo que no existe: `grep -rn "qa_foto\|qa-fotos\|qa_corrida" supabase/migrations/`
fuera de la 0185 → **cero**. No hay `purgar_qa_foto`, no está en las catorce
purgas de `mantenimiento_de_datos`, y el trigger de clasificación de retención
de la 0178 solo mira objetos referenciados por `gasto.imagen_url`. Y en el aviso
integral, las finalidades enumeradas (`privacidad.ts:535-546`) son liquidar,
comprobar ante el SAT, responder por WhatsApp, revisar duplicados, anotar hitos
y medir uso: **probar el producto no está**.

*Intento de refutación:* hoy no hay clientes, así que los tickets del banco son
de Javier o sintéticos, y `qa-motor.ts` siembra un tenant `ZZZ QA` propio. Es
cierto y por eso es MEDIO y no ALTO. Lo que fija el hallazgo es que la puerta ya
está abierta: el día que un ticket de un operador real entre al banco para
reproducir un bug —que es exactamente para lo que sirve un banco de QA—, ese
tratamiento no tiene finalidad declarada ni plazo, y el operador ya recibió el
aviso que dice que sus fotos se conservan por el CFF art. 30.

---

### A6. [MEDIO · NUEVO] El rótulo nuevo de `/privacidad` y `/terminos` es una nota interna de despliegue publicada al titular, y dejó de decir qué falta

`src/app/privacidad/page.tsx:149-154` · `src/app/terminos/page.tsx:209-218` ·
`src/lib/legal/config.ts:77-89`

**Norma:** art. 14 y art. 15 fr. I; y la regla del repo (*«no se rellena; se
dice qué falta y por qué»*, `CLAUDE.md`).

**Escenario, con los valores.** Ramón abre `/privacidad`. Antes leía: *«Falta
capturar la razón social y el domicilio fiscal de la empresa que opera Likida.
Aparece señalado en vez de quedar en blanco.»* — una frase dirigida a él, que
nombra el dato ausente. Hoy lee: *«**PRODUCCIÓN BLOQUEADA:** faltan datos
legales o anexos contractuales. No debe presentarse como paquete enterprise
hasta completar identidad, contacto y versiones contractuales.»*

Dos problemas concretos: (a) *«no debe presentarse como paquete enterprise»* es
una instrucción al equipo de ventas de Likida, publicada en el documento legal
de un titular; (b) el rótulo dispara con `!estado.listo`, que incluye las cuatro
`LEGAL_*_VERSION` (`config.ts:67-72,80`), así que **una política de privacidad
con su identidad completa seguiría mostrando el cartel rojo** porque falta la
versión del SLA — un plazo comercial que no tiene nada que ver con el art. 15. El
banner deja de distinguir «este aviso está incompleto» de «falta firmar el SLA».

---

### A7. [BAJO · NUEVO] `datoLegal` anula valores legítimos por contener «todo» o «pendiente»

`src/lib/legal/config.ts:2-6`

`/\b(?:completar|pendiente|todo|tbd)\b/i` corre sobre el valor entero. Una razón
social inscrita como «Grupo **Todo** Carga, S.A. de C.V.» o un domicilio en una
calle llamada «Pendiente» devuelven `null`, con dos efectos encadenados: el
banner de A6 se enciende para siempre y —esto es lo que sube la severidad real,
aunque la ficha se quede en BAJO por lo remoto del nombre— `exigirLegalEnProduccion`
lanza en el `RootLayout` (A2). Un filtro anti-placeholder que no distingue el
placeholder del contenido.

---

### C1. [CRÍTICO · REINCIDENTE, 2ª pasada] El GPS asienta la ubicación de un chofer identificable cada 5 minutos y los dos avisos que ese chofer recibe dicen en negritas que no hay GPS

`sincronizar_gps.ts:145` · `vercel.json:30` (`*/5 * * * *`) ·
`privacidad.ts:520` (integral) y `:232` (simplificado)

Verificado hoy: `git diff 8b43121 origin/master --stat` **no lista**
`src/lib/likida/privacidad.ts`. Las dos frases están palabra por palabra donde
estaban —*«**No hay GPS ni rastreo del teléfono:** se anota únicamente lo que tú
escribes»*— y el `upsert` a `posicion` también. Escenario, plazos y refutaciones:
`legal.md:65-127`. Norma: art. 15 fr. II y III, art. 14. Lo único que se movió
en esta zona es que ahora `posicion` sí tiene purga (`purgar_posicion(90)`,
`0165:232`), que es retención correcta sobre un tratamiento no informado.

---

### C2. [CRÍTICO · REINCIDENTE, 6ª pasada] El Redactor sigue mandando el nombre y las notas del decisor a un modelo externo, y el aviso que esa persona recibe lo niega

`redactor.ts:197,200,208` · `privacidad.ts:757` · `models.ts:89`

Verificado hoy con líneas nuevas (el archivo se movió, el defecto no):
`:197` `` `Contacto: ${prospecto.contacto_nombre}` ``, `:200`
`` `Notas del vendedor: ${prospecto.notas.slice(0, 500)}` ``, `:208`
`generateResponse(...)` con rol `back_office` = `openai/gpt-oss-120b`. El único
import de `./seudonimo` en todo `src/` sigue siendo
`mapa-prospectos/mensaje/route.ts`. El aviso que lee Ramón sigue prometiendo
*«tu nombre no sale de Likida»* (`privacidad.ts:757`). **Este commit tocó
`mapa-prospectos/mensaje/route.ts` otra vez** —le puso presupuesto por tenant—
sin mirar el otro camino por el que sale el mismo dato. Sexta pasada.

---

### C3. [CRÍTICO · REINCIDENTE, 6ª pasada] `/aviso/<tenant>` sigue siendo 404 para toda flota real: falta una sola columna, `domicilio_fiscal`

`repo.ts:1042` · `aviso/[tenant]/page.tsx:62,68` · `saas/fiscal.ts` ·
`startup.ts:365-370`

Verificado hoy: los únicos escritores de `domicilio_fiscal` en todo el árbol son
`scripts/demo-5k.sql:39`, `qa-motor.ts:139` y `scripts/qa-agentes/orquestador.qa.ts:90`
— dos arneses de prueba y un seed de demo. Ninguna pantalla. Lo que sí hay, y no
había, es un diagnóstico que lo grita en el arranque (`startup.ts:367`: *«El
tenant no tiene razón social o domicilio fiscal, así que NO se puede armar el
aviso… el tratamiento de datos se detiene en el primer mensaje»*) — pero un
diagnóstico no es un formulario, y ese texto ya estaba en `8b43121`. La ironía
de esta ronda: el commit dedicó un archivo nuevo entero a resolver la identidad
del responsable **de Likida** por variables de entorno, y no tocó la del
responsable **de la flota**, que es la que bloquea el producto.

---

### C4. [CRÍTICO · REINCIDENTE] La purga de prospectos borra el nombre de cabecera y nada más, y ahora hay una tercera columna que tampoco alcanza

`0148:73-82` · `0181:3-6` (`lead_clave`) · `api/lead/route.ts:204` ·
`api/lead/mezcla.ts:51-57` (`notas`) · `privacidad.ts:766`

Verificado hoy: el `update` de la 0148 sigue tocando **una** columna
(`contacto_nombre`). Después de `purgar_prospecto_persona(365)` la fila conserva
`correo`, `telefono`, `lead_clave` (con el correo dentro, `route.ts:204`),
`mensaje_wa`/`mensaje_correo`, `atribucion` con su `fbclid` y —lo nuevo de esta
ronda— `notas` con lo que el hallazgo A4 describe. El aviso promete que *«tu
nombre, puesto, correo y teléfono se eliminan automáticamente»* y que *«lo único
que queda es el registro de la empresa»*. La RPC devuelve el conteo de
`prospecto_persona` borradas y el cron lo publica como éxito.

---

## Lo que revisé y está bien

- **`sanitizarEventoSentry` es la pieza mejor pensada del delta en este rubro.**
  `sentry.ts:58-88`: borra `user` y `extra`, recorta el query string
  reconstruyendo el `URL` (con caída a `split('?')` cuando no parsea), quita
  `headers`/`cookies`/`data` del request y `data` de cada breadcrumb. Cierra el
  hallazgo 20 de la ronda 19 sin que nadie lo persiguiera. Lo que le falta es el
  otro gancho (A3).
- **`legal/config.ts` acertó en la decisión de fondo: no inventar identidad.**
  `datoLegal` (`:2-6`) rechaza el placeholder como si fuera ausencia —
  `datoLegal('[COMPLETAR: razón social]')` → `null` — que es la regla del
  producto aplicada a un dato legal. Y `LEGAL_PLACEHOLDERS` (`:21-30`) dice qué
  falta en vez de dejarlo en blanco. El problema es dónde vive el gate (A2) y
  que el dato no llega a ningún render (A1).
- **La separación entidad / documentos, y el porqué escrito.** `config.ts:43-66`
  documenta con fechas que el gate anterior impidió publicar el arreglo de un bug
  de nueve días y revertir una caída del OCR: *«Un guardarraíl que también
  bloquea las REPARACIONES no protege: amplifica»*. Es exactamente el
  razonamiento correcto, aplicado a la mitad del problema.
- **`renglones` / `ajeno_al_viaje` NO está en producción.** Era mi sospecha
  principal al abrir el delta —un modelo juzgando las compras de una persona
  identificable, con umbral del 15%— y no procede: `ocr.ts:57-77` retiró
  `renglones` y `plazo_facturacion_horas` del esquema el mismo día, con la
  bitácora del incidente (`400 Provider returned error`, `tokens_in/out = 0`).
  `engine.ts:625-643` los sigue leyendo de `ocr_extra` a la defensiva, así que la
  observación `renglones_ajenos` está viva pero **sin fuente**. Queda anotado
  para la ronda siguiente: si el esquema vuelve, `sanitizarProducto`
  (`sanitizar.ts:111-118`) **solo cubre `data.producto`** (`ocr.ts:530`), no las
  `descripcion` de cada renglón — un `"METFORMINA 850MG"` entraría a `ocr_extra`
  y a la nota que ve el contralor por un camino que el filtro no vigila.
- **El presupuesto por tenant del Cerebro falla cerrado.**
  `mapa-prospectos/mensaje/route.ts:51-58`: sin `sesion.tenantId` no se llama al
  proveedor, 503. Es la disciplina correcta aplicada al gasto; ojalá el mismo
  criterio se aplicara al dato (C2).
- **`/api/lead` no filtra la URL entera.** `route.ts:50-54,93-102`: solo diez
  claves conocidas de atribución, recortadas a 300 caracteres. Un endpoint
  público que guardara la query completa sería peor; este descarta lo que no
  reconoce. (Que `fbclid` no esté enumerado en ningún aviso es el hallazgo 14,
  que sigue abierto.)
- **`qa_foto`, `qa_corrida` y `qa_corrida_paso` nacen con RLS y sin políticas**
  (`0185:129-131`) y los dos buckets son privados con URL firmada
  (`qa-storage.ts` → `firmarRuta`). El problema de A5 es de finalidad y plazo, no
  de acceso.
- **La `mezcla` del lead protege lo que dice proteger.** `mezcla.ts:36-41`: un
  `null` del formulario nunca borra un teléfono del censo, y un valor distinto no
  pisa. La objeción de A4 es sobre dónde va lo rechazado, no sobre la regla.

---

## Lo que NO alcancé a revisar

- **Si las ocho `LEGAL_*` están puestas en Vercel.** Todo A1/A2 se sostiene en el
  código y en `.env.example`, que las manda vacías con
  `LEGAL_ENFORCE_PRODUCTION=true`. No tengo acceso al panel de Vercel, así que no
  puedo decir cuál de las dos ramas de A2 está viva hoy — si el sitio renderiza
  (variables puestas → A1 en su forma más grave) o si lanza (variables vacías →
  A2 en su forma más grave). Las dos son hallazgos; cuál es cuál lo resuelve un
  `curl https://app.likida.ai/privacidad`.
- **El texto vigente de la LFPDPPP de marzo 2025 más allá de los artículos
  transcritos en `normas/`.** Cuarta ronda que lo anoto: **siguen sin ficha
  `verificado_fuente_primaria`** los arts. 11 (conservación), 17-18
  (disponibilidad del aviso — funda A2) y 31 (plazo ARCO, el número que imprimen
  dos pantallas). Los cito por `docs/conocimiento/11-datos-personales.md`.
- **El payload real de Cal.com.** Igual que la ronda pasada: construí el hallazgo
  6 sobre lo que la ruta guarda, no sobre un evento real capturado.
- **`bitacora_auditoria` y `evento_seguridad`.** Cuarta ronda fuera.
- **Qué transacción concreta muestrea Sentry hoy.** A3 se sostiene en el contrato
  de tipos del SDK y en la ausencia de `beforeSendTransaction`; no capturé un
  evento real para enumerar qué campos trae. La verificación barata es poner
  `SENTRY_TRACES_SAMPLE_RATE=1` en un preview y mirar un issue de performance.
- **`posicion` desde el ángulo de acceso** y **`al_vuelo.ts` / `enrutar.ts` /
  `avisar.ts`**: tercera y quinta ronda respectivamente que quedan fuera.
- **La landing (`likida.ai`, otro repo).** Sigue sin poder comprobarse si
  `/getdemo` enseña aviso o casilla antes de que `/api/lead` escriba — la mitad
  que falta de los hallazgos 14 y A4.
