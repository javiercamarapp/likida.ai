# Operabilidad y DX — auditoría 4

**Nota: 6/10** (antes 7). Razón del movimiento: **deuda que cobró factura**. Esta
ronda construyó el mejor cron del repo —`wa-pendientes` responde **500** cuando
un solo evento falla, alerta al operador por cartas muertas y pone el `id` en
cada línea (`route.ts:88,99,101`)— y en el mismo árbol dejó **intactos, palabra
por palabra, los dos CRÍTICOS del pase 3**: el cron hermano, doce metros más
allá, sigue devolviendo 200 con el 100 % de sus envíos rotos. Cuando el repo
demuestra que sabe hacerlo bien y no lo aplica donde ya se le dijo dos veces, la
nota no puede subir. Además la compuerta propia de la ronda está **en rojo**:
`npx tsc --noEmit -p .` falla hoy en `master`+esta rama.

**El riesgo mayor, hoy:** el camino del dinero —`processor.ts`, 2 490 líneas, el
único por el que un cliente real toca el producto— sigue **sin un solo
`alertarOperador`**, mientras el único canal que existe se puede llenar de 288
correos al día por una pieza de la cola sin aprobar. A las 3 a.m. el sistema
tiene canal, pero lo tiene apuntado al sitio equivocado y sin freno.

---

## Hallazgos

### [CRÍTICO] 100 % de fallos sin excepción → HTTP 200 y nivel `info` (3.ª ronda, OP-C1)

`src/app/api/cron/escalar/route.ts:90,105,130,148` · `src/lib/likida/agentes/cobranza.ts:307-308,328` · `src/lib/likida/escalar_viaje.ts:344,367`

**Escenario, con valores.** `WHATSAPP_ACCESS_TOKEN` caduca (`.env.example:19`
lo marca «CADUCA»). 03:00, `/api/cron/escalar`, 3 flotas, 40 viajes vencidos.
Cada `sendText` devuelve `null` y cada `sendTemplate` `{ok:false}`, así que
`cobranza.ts:308` empuja 40 renglones a `r.fallos` y `escalar_viaje.ts:344` otros
12. **Ninguno lanza.** La ruta entra por la rama feliz:

```ts
const r = await escalarViajesSinAceptar();
logger.info('cron.escalar.ok', { ...r });                       // ← :105, INFO
const r = await ejecutarCobranzaGlobal();
logger.info('cron.cobranza.ok', { ...r });                      // ← :130, INFO
return NextResponse.json(resultado, { status: huboFallo ? 500 : 200 });  // ← :148
```

`huboFallo` (`:90`) solo se pone a `true` dentro de los dos `catch`, y ningún
`catch` se dispara. Sale **200**, dos líneas `info`. `logger.ts:157` solo replica
`warn`/`error` a Sentry: Sentry no ve nada. `alertarOperador` solo vive en los
`catch` (`:116,138`). Cron **verde** en Vercel, indefinidamente.

**Lo que hace este hallazgo peor que hace un pase:** el cron nuevo de esta misma
ronda hace exactamente lo contrario, en el mismo repo y con la misma librería —
`wa-pendientes/route.ts:101` devuelve `status: fallidos > 0 ? 500 : 200`. La
receta ya está escrita a doce archivos de distancia y no se aplicó aquí.

**Consecuencia.** El agente que existe para que vuelvan los comprobantes queda
mudo para toda la flota, y el contralor lo descubre preguntando por qué no le
llegó nada. A la mañana siguiente solo queda una línea `info` en el runtime log
de Vercel, con retención corta y sin log drain (`DEPLOY.md:152-153`).

**Causa raíz probable.** El motor reporta fallos POR VALOR (`fallos: string[]`)
y el cron solo mira excepciones; nada lee `r.fallos.length` para decidir status
ni nivel — es `exigir()` sin aplicar al cron.

---

### [CRÍTICO] Cobranza cierra su propio incidente con un éxito falso (2.ª ronda, OP-C2)

`src/lib/likida/agentes/cobranza.ts:387,399` · contra `src/lib/likida/escalar_viaje.ts:392` · `src/lib/likida/agentes/notificaciones.ts:458-462,994`

**Escenario, con valores.** Misma corrida: la flota `A` tiene 40 viajes vencidos
y los 40 contactos fallan (ventana de 24 h cerrada + plantilla rechazada).
`ejecutarCobranza` **devuelve normalmente** con `{contactados: 0, fallos: [40
renglones]}`. Entonces:

```ts
const r = await ejecutarCobranza(t, ahora, { venceEn });
...
corridas.set(t, null);                                    // ← :387  null = "esta corrida SÍ terminó"
...
await avisarCorridasPorFlota('cobranza', corridas, ahora); // ← :399
```

`avisarCorridaFallida` traduce ese `null` a `hayProblema: fallo_ !== null` =
`false` (`notificaciones.ts:994`) y `debeAvisar` corta en `:458-462`
(*«no hay nada que avisar ahora mismo»*). No manda nada **y re-arma el filo**:
`MARCAS_DE_INSISTENCIA` (`:349`) vuelve a cero cada hora, así que el contador
nunca llega ni a la marca 1.

El hermano ya lo arregla en el árbol de hoy: `escalar_viaje.ts:392` hace
`cierre.set(tenantId, c.fallidos === c.intentos ? c.ultimo : null)` y su propio
comentario (`:373-377`) dice *«Un éxito falso es peor que no avisar: borra la
racha de la flota justo cuando su problema sigue vivo»*. Cobranza sigue sin
recibir esa corrección.

**Consecuencia.** Convierte el hallazgo anterior de «silencioso» en «activamente
suprimido»: ni Javier (no hay `alertarOperador` fuera de los `catch`) ni el
contralor (el aviso se cancela y la racha se resetea) se enteran jamás. Lo único
que sobrevive es la ficha del agente, que sí anota `parcial` (`:404-411`) — un
dato que hay que ir a mirar a propósito.

**Causa raíz probable.** El mapa de cierre se llena desde el `try/catch` del
bucle de flotas (solo la excepción cuenta como fallo) en vez de desde el
resultado medido (`r.fallos` vs `r.contactados`).

---

### [ALTO] La compuerta de la ronda está en ROJO: `tsc` no compila el árbol de hoy

`src/lib/likida/migraciones_verificadas.test.ts:53,61` · `supabase/migrations/0112_agregados_rpc.sql` × `supabase/migrations/0112_config_llave_agentes.sql` · `.github/workflows/ci.yml:63-64`

**Escenario, con valores.** Verificado corriendo el comando esta ronda:

```
$ npx tsc --noEmit -p .
src/lib/likida/migraciones_verificadas.test.ts(61,3): error TS1117:
An object literal cannot have multiple properties with the same name.
$ echo $?   → 1
```

El objeto `EXENTAS` trae `'0112'` **dos veces** (`:53` y `:61`) porque existen
**dos migraciones con el mismo prefijo**: `0112_agregados_rpc.sql` (de la rama de
auditoría) y `0112_config_llave_agentes.sql` (de `master`). Git las fusionó sin
conflicto — están en líneas distintas del mismo literal — y el merge `f72d7ab`
que abrió este pase quedó commiteado con el árbol sin compilar.
`npm run typecheck` (paso «Typecheck» de `ci.yml:63-64`) reproduce el mismo
fallo, así que **el CI de esta rama está rojo ahora mismo**.

**Y hay un segundo daño, silencioso.** `vitest` NO falla: solo emite
`[vite] warning: Duplicate key "0112"` y pasa los 4 tests. El guardián
`migraciones_verificadas.test.ts` indexa por el prefijo de 4 dígitos
(`:107-118`), así que **una sola exención cubre las DOS migraciones 0112** y la
razón del `:53` es código muerto. La prueba que existe para que ninguna
migración se quede sin decisión explícita —«así se coló la 0030»— acaba de
dejar pasar una sin decidir, por la misma clase de descuido que vino a matar.

**Consecuencia.** Una de las tres compuertas del repo (`tsc`) está roja y la otra
(`vitest`) dice verde sobre el mismo archivo: exactamente el escenario que
enseña a ignorar una compuerta. Y el numerado duplicado de migraciones es una
bomba de relojería aparte: `ci-postgres.yml:126-136` las aplica por orden
alfabético del glob, que no es el orden en que se escribieron.

**Causa raíz probable.** Nada valida que el prefijo de migración sea único, y
dos líneas de trabajo paralelas tomaron el mismo número sin que ningún guardián
mirara.

---

### [ALTO] El camino del dinero sigue sin canal de alerta: `alertarOperador` no aparece en las 2 490 líneas de `processor.ts`

`src/lib/observability/alerta.ts:59` (13 llamadas, TODAS en `api/cron/*`: `escalar:116,138`, `wa-pendientes:58,99,107`, `facturar:374,684`, `purgar:98,109`) × `src/lib/likida/processor.ts:2341,2382,2419,2448`

**Escenario, con valores.** 03:10. La flota `A` cierra su viaje `F-1042`; la
generación del PDF revienta contra storage. `processor.ts:2341` emite
`logger.error('pdf.contralor_no_generado', { tenant, viaje, liqId })` — con
identificadores suficientes, eso está bien hecho. Va a Sentry con
`fingerprint: ['pdf.contralor_no_generado','error','id:9f2c1a4b77de']`
(`sentry.ts:161-169,192`). Nace el issue: Javier recibe **una** notificación. A
las 03:40 fallan los otros 39 cierres de la misma flota: caen todos en el issue
ya existente y, por el modelo que el propio repo declara en `alerta.ts:7-9`
(*«Sentry solo notifica cuando NACE un issue»*), **cero notificaciones nuevas**.
Ningún correo: `grep alertarOperador src/lib/likida/processor.ts` no devuelve
nada.

**Consecuencia.** El producto ES el cierre de liquidación por WhatsApp. Los
cuatro crons —la red de seguridad— tienen canal directo; el camino principal no
tiene ninguno. El chofer lee «se me trabó el sistema tantito» (`:2183`), el
contralor no recibe su PDF, y el guardia se entera cuando alguien llame.

**Causa raíz probable.** El canal se cableó donde el hallazgo ardía (los crons) y
no donde vive el dinero; sigue sin haber criterio de qué `msg` merece correo
además de Sentry.

---

### [ALTO] El monitor de SLA nuevo puede mandar 288 correos al día por UNA pieza, y quema el único canal que hay

`src/app/api/cron/wa-pendientes/route.ts:54-62` × `vercel.json:5-8` × `src/lib/observability/alerta.ts:41-44,70-76` · `src/lib/likida/agentes/cola.ts:387-396` · `supabase/migrations/0117_cola_aprobacion.sql:30-72`

**Escenario, con valores.** Viernes 19:00. El copiloto encola UNA pieza
`prioridad='urgente'` y Javier se va. A las 19:10 `urgentesVencidas(10)` devuelve
`1`. El cron corre **cada 5 minutos** (`vercel.json:7`, `*/5 * * * *`), así que
desde ese minuto y hasta que alguien apruebe la pieza:

```ts
const vencidas = await urgentesVencidas(10);
if (vencidas > 0) {
  logger.error('cron.wa_pendientes.urgentes_vencidas', { vencidas });
  await alertarOperador('aprobaciones.urgentes', { ... });   // ← :58
}
```

El único freno es `ultimaAlerta`, un `Map` **en memoria del proceso**
(`alerta.ts:44`), cuya propia cabecera declara que en serverless «cada instancia
caliente lleva su propia cuenta y un arranque en frío la resetea» (`:20-23`). Un
cron de 5 minutos en Vercel es, típicamente, una invocación fría: el piso de una
hora casi nunca aplica. Y no hay dedup en la base — `cola_aprobacion` (0117) no
tiene ninguna columna de «ya avisado». **Hasta 12 correos/hora, 288 en un fin de
semana de 24 h**, todos idénticos.

**Consecuencia.** `ALERTA_EMAIL` es el mismo buzón por el que llegan
`cron.escalar`, `cron.facturar` y `cron.purgar`. Trescientos correos de una pieza
de cola sin aprobar entierran el correo que sí importa, y a la tercera vez el
canal se filtra a una carpeta. Es la forma clásica de perder una alerta: no
apagándola, ahogándola.

**Causa raíz probable.** El monitor de SLA se colgó del heartbeat de 5 min
heredando un anti-ruido diseñado para crons horarios y para un proceso de larga
vida, sin marca durable de «esto ya se avisó».

---

### [ALTO] DX: `npm ci` no corre en una máquina limpia y deja `node_modules` VACÍO (3.ª ronda)

`package.json:40` (`"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`) · `package-lock.json:30,11013` · `.github/workflows/ci.yml:47` · `.github/workflows/ci-postgres.yml:102` · `README.md:83`

**Escenario, con valores.** Alguien clona detrás de una política de red que solo
permite `registry.npmjs.org` (el contenedor de esta auditoría y cualquier proxy
corporativo). `npm ci` recibe **403 en el CONNECT** a `cdn.sheetjs.com`,
**revierte la instalación entera** y deja `node_modules/` vacío: no falta un
paquete, faltan todos. No corre `tsc`, ni `vitest`, ni `next dev`. Es el **paso
1 de los DOS workflows** (`ci.yml:47` y ahora también `ci-postgres.yml:102`), así
que el día que SheetJS retire ese tarball —lo hacen: solo publican las últimas
versiones en su CDN— todas las ramas se ponen rojas a la vez y nadie puede
instalar.

Nuevo esta ronda: `dependency-review.yml:27-35` **documenta el problema y lo deja
abierto** («no se pudo probar… si el primer PR real revienta por esto, es este
paquete»). O sea, la puerta de supply chain nueva sabe que tiene un agujero con
nombre y apellido.

Y sigue sin haber una línea que explique **por qué** viene del CDN: `package.json`
documenta con detalle el override de `sharp` (`"//overrides"`) y de `xlsx` no
dice nada. El arreglo «obvio» para quien se topa con esto es apuntarla al
registry (`xlsx@0.18.5`), que es una versión con prototype pollution conocida,
alcanzable desde el `.xlsx` que sube el usuario.

**Consecuencia.** «Arranca en una máquina limpia» es condicional a la red del que
clona, y el modo de falla es total y sin diagnóstico.

**Causa raíz probable.** Se pinneó el tarball del CDN sin dejar la nota que
convierte una decisión en conocimiento, y sin ninguna verificación de que la
instalación sea reproducible.

---

### [ALTO] La bandeja durable nueva no tiene quien la mire: si el drenado deja de correr, los mensajes se acumulan sin una sola señal

`src/lib/likida/wa_pendientes.ts:69-79,122-131` · `src/app/api/cron/wa-pendientes/route.ts:40-47,96-100` · `src/app/api/health/route.ts:24-26` · sin ningún consumidor en `src/app/admin/` (verificado: `grep -rn wa_evento_pendiente src/` solo devuelve el cron y su módulo)

**Escenario, con valores.** Javier rota `CRON_SECRET` en Vercel un viernes y
olvida uno de los entornos. A partir de ahí `/api/cron/wa-pendientes` corta en la
línea 41 con 500 **antes** de tocar la bandeja. Simultáneamente el interruptor
`global` está abajo por un incidente, así que el webhook está guardando cada foto
en `wa_evento_pendiente` (`route.ts:209`). Tres días después hay 900 filas con
`intentos = 0` y `procesado_en = null`. ¿Qué las ve?

- `cartasMuertas()` cuenta solo `intentos >= 5` (`wa_pendientes.ts:127`) — con el
  cron muerto nadie incrementó `intentos`, así que devuelve **0**;
- `/api/health` declara explícitamente que **no** mide ausencia de corridas
  (`health/route.ts:24-26`) y contesta **200**;
- `/admin/salud-sistema` no tiene renglón para esta tabla;
- ninguna pantalla del repo lee `wa_evento_pendiente`.

Y el 500 del cron sin secreto solo se ve en el panel de Vercel, que es el mismo
sitio que este rubro lleva cuatro rondas declarando insuficiente.

**Consecuencia.** La mig. 0119 cambió «se pierde para siempre» por «espera en una
cola», que es un progreso real — pero una cola sin medición de profundidad es un
cementerio con otro nombre. El comentario de `route.ts:120-127` del webhook dice
justamente eso de la idea que se descartó: «una tabla que guarde el payload crudo
SIN un reproceso que la vacíe… se ve como un respaldo y es un cementerio». El
reproceso existe; lo que falta es saber si está corriendo.

**Causa raíz probable.** Se construyó el productor y el consumidor, y no el
medidor: `select count(*) where procesado_en is null` no tiene llamador.

---

### [MEDIO] El cron nuevo repite el interruptor ilegible y lo baja a `info` — por debajo del umbral de Sentry

`src/app/api/cron/wa-pendientes/route.ts:66-69` × `src/lib/likida/interruptores.ts:72-86` × `src/lib/logger.ts:157` · mismo patrón en `escalar/route.ts:79-82,99-101,124-126`

**Escenario, con valores.** Supabase tiene un incidente de red parcial: el
`SELECT apagado FROM interruptor WHERE id='global'` devuelve error por valor.
`estaApagado` falla cerrado (decisión deliberada y bien argumentada) y devuelve
`true`. Entonces:

```ts
if (await estaApagado('global')) {
  logger.info('cron.wa_pendientes.saltado', { interruptor: 'global' });  // ← :67, INFO
  return NextResponse.json({ corrio: false, saltado: 'interruptor global' });  // 200
}
```

`logger.ts:157` replica a Sentry **solo** `warn`/`error`, así que esta línea no
sale del proceso. Sale un **200**, cron verde, y una afirmación —«saltado:
interruptor global»— que es **falsa**: nadie tocó ninguna palanca. La línea que
sí dice la verdad, `interruptores.lectura_fallo` (`:76,81`), lleva meta
`{interruptor, err}` **sin `tenant` ni `codigo`/`status`**, así que
`discriminadores` (`sentry.ts:161-169`) devuelve `[]` y el fingerprint queda en
`['interruptores.lectura_fallo','error']`: un solo issue para siempre, una sola
notificación en la vida del producto.

El cron viejo (`escalar/route.ts:80`) al menos usa `warn`. El nuevo lo bajó a
`info`, que es la única diferencia entre «llega a Sentry» y «no llega».

**Consecuencia.** Un hipo de base de 40 minutos deja los cuatro crons parados y
se lee, en el panel y en el log, igual que «Javier apagó todo a propósito».
Rompe la regla del repo de que un rótulo tiene que ser verdad, en la línea que un
guardia leería primero.

**Causa raíz probable.** `estaApagado` devuelve un `boolean` que colapsa dos
estados distintos («apagado a propósito» y «no pude leer»), y el llamador no
puede distinguirlos para elegir status, nivel ni texto.

---

### [MEDIO] El catch del webhook sigue borrando el único identificador del mensaje perdido

`src/app/api/webhook/whatsapp/route.ts:220-222`

**Escenario, con valores.** Meta entrega un POST con 5 fotos del chofer
`5219993700779`. `processInbound` lanza en la tercera. Sale, literalmente:

```json
{"t":"2026-08-15T09:03:11.482Z","level":"error","msg":"processInbound",
 "meta":{"err":"TypeError: Cannot read properties of null"}}
```

Sin `waMessageId`, sin `from`, sin tenant, sin viaje. El `m` está en el closure
—`(m) => processInbound(m).catch(...)`— y no se usa. El webhook **ya contestó
200** (`DEPLOY.md:138-141`), así que Meta no reintenta y ese comprobante se perdió.
En Sentry el fingerprint es `['processInbound','error']` sin discriminadores:
todos los fallos del corazón del producto, de todas las flotas y todas las
causas, colapsan en **un issue**.

Contrasta con el cuidado del mismo archivo doce líneas más arriba
(`wa.entrante_apagado`, `:210-215`, que sí emite `ids`), más abajo
(`wa.no_entregado`, `:266-271`) y con el cron nuevo (`wa-pendientes:88`, que
emite `{ id, intento, err }`). Es el único punto del camino vivo que se quedó
atrás.

**Causa raíz probable.** El `.catch` se escribió como red de última hora sobre el
pool y no se le pasó el contexto que tenía a mano.

---

### [MEDIO] El respaldo de una base sin PITR es un script manual que nadie dispara, y no hay procedimiento de restauración

`scripts/respaldo.sh:1-22,26-47` · sin referencia en `package.json`, `README.md`, `docs/conocimiento/DEPLOY.md` ni `.github/workflows/` (verificado por grep)

**Escenario, con valores.** El propio archivo lo dice: plan **FREE** de Supabase,
**sin respaldo automático ni PITR**, verificado el 4-ago-2026 — y ese mismo día
se borró la base entera y la salvó un dump hecho a mano. El script existe, está
bien escrito (comprueba que el dump pese >2 000 bytes, `:34-39`; rota a 14 días,
`:43`) y **su único disparador es que Javier se acuerde**: escribe a
`~/Desktop/likida-respaldos`, exige `npx supabase link` en esa laptop, y no
aparece en `package.json` (no hay `npm run respaldo`), ni en DEPLOY.md, ni en
ningún workflow. Nada mide cuándo fue el último respaldo ni avisa si lleva
semanas sin correr.

Y del otro lado no hay nada: `grep -rni "restaur|pg_restore" docs/conocimiento
scripts README.md` no devuelve **una sola línea** sobre cómo volver a subir ese
`.sql`.

**Consecuencia.** Con el primer cliente adentro esto deja de ser producto y pasa
a ser CFF art. 30: son los comprobantes de la flota, con obligación legal de
conservarlos 5 años. El escenario que ordena el rubro —«revienta a las 3 a.m.,
¿qué tengo a la mañana siguiente?»— aquí se contesta con «un dump de fecha
desconocida en un Escritorio, y ningún procedimiento escrito para restaurarlo».

**Causa raíz probable.** El script se escribió como reacción a un susto concreto
y nunca pasó de herramienta a procedimiento: falta el disparador y falta la
mitad de vuelta.

---

### [MEDIO] `DEPLOY.md` sigue diciéndole al guardia que no existe ningún canal, y su guardián no puede detectarlo

`docs/conocimiento/DEPLOY.md:101-106,145-149` × `src/lib/observability/arranque.ts:34-48` · `src/lib/observability/runbook.test.ts:101-109`

**Escenario, con valores.** Javier provisiona Vercel siguiendo el runbook. La
tabla «Variables… las **dos** que hay que revisar a mano porque si faltan el
sistema arranca igual» (`:101-106`) lista `SENTRY_DSN` y `DEMO_TENANT_ID`. Pero
`SILENCIOSAS` (`arranque.ts:34-48`) son **cuatro** desde el pase 3: faltan
`NEXT_PUBLIC_APP_URL` y `ALERTA_EMAIL`. Y `CRON_SECRET`, que `salud-sistema`
pinta en **rojo** porque sin él los cuatro crons devuelven 500, no aparece en la
tabla en absoluto.

Cuarenta líneas abajo, «Lo que este runbook NO cubre» sigue diciendo (`:147-149`):
*«**Quién recibe qué cuando algo falla.** Hoy no hay nadie asignado ni ningún
canal: sin `SENTRY_DSN` no hay a dónde mandarlo»*. Es **falso desde `f7d6981`**:
el canal existe, se llama `ALERTA_EMAIL`, y esta ronda le colgó dos alertas más.
El documento al que se acude en un incidente le dice al guardia que no busque un
canal que sí tiene.

`runbook.test.ts:104-109` existe para impedir esto y comprueba una lista
literal —`for (const v of ['SENTRY_DSN','DEMO_TENANT_ID'])`— en vez de leer
`SILENCIOSAS`. Por construcción, nunca va a detectar la quinta variable.

**Causa raíz probable.** El guardián prueba una lista hardcodeada en vez de la
lista del código.

---

### [MEDIO] `/admin/salud-sistema` afirma «los tres crons» cuando ya son cuatro, y el cuarto es el que drena la pérdida de datos

`src/app/admin/salud-sistema/page.tsx:42-44,143-155` × `vercel.json:4-21`

**Escenario, con valores.** `CRON_SECRET` no está puesta. La pantalla dibuja el
renglón en rojo con el detalle: *«Los tres crons devuelven 500 sin él…
Escalación, facturación y purga están paradas.»* (`:153-154`). Lo que NO dice es
que también está parado `/api/cron/wa-pendientes`, que es el único consumidor de
`wa_evento_pendiente` **y** el que hospeda el monitor de SLA de la cola de
aprobación (`wa-pendientes/route.ts:40-47,55`). El comentario de cabecera
(`:42-44`) repite el mismo censo viejo.

**Consecuencia.** La única pantalla que existe para preguntar «¿está vivo el
sistema?» enumera mal el inventario, y justo omite el cron cuyo silencio produce
pérdida de mensajes del chofer. Es la misma regla que esa página fue construida
para respetar («cada renglón está medido o dice que no lo está»), aplicada a un
rótulo que envejeció en una ronda.

**Causa raíz probable.** El censo de crons está escrito a mano en prosa en vez de
derivarse de `vercel.json`, así que cada cron nuevo lo deja falso.

---

### [MEDIO] Los diagnósticos de arranque no pueden usar el canal de correo, que es el único que sobrevive a su propio fallo

`src/instrumentation.ts:16-24` · `src/lib/observability/arranque.ts:66-72,95` · `src/lib/observability/sentry.ts:69-75` · `src/lib/logger.ts:157`

**Escenario, con valores.** Un despliegue del viernes pierde `SENTRY_DSN`.
`avisarObservabilidad()` hace exactamente lo que debe:
`logger.error('startup.observabilidad', { sentry:false, err:'SENTRY_DSN ausente…' })`.
Pero `logger.ts:157` replica a Sentry solo `if (process.env.SENTRY_DSN)` — y no
hay DSN. El grito **muere en el runtime log de Vercel**, que es justo el sitio
que el propio mensaje declara insuficiente. Lo mismo con
`startup.config_silenciosa` (`arranque.ts:70`) y `startup.entorno_grupos`
(`:95`). `ALERTA_EMAIL` está puesta, es independiente de Sentry, y nadie la usa
aquí: `alertarOperador` no se importa en ningún archivo de arranque.

**Causa raíz probable.** El arranque se cableó antes de que existiera un segundo
canal y no se revisó al añadirlo.

---

### [MEDIO] `/api/health` está construido, contesta 503 bien, y sigue sin aparecer en un solo documento

`src/app/api/health/route.ts:35-56` · ausente en `docs/conocimiento/DEPLOY.md` y `README.md` (verificado por grep)

El endpoint está bien hecho: consulta real HEAD+count sobre `tenant` bajo
`acotada`, devuelve `{ok, db, sentry, version, hora}` y **503** si la base no
responde; sin auth a propósito para que un monitor gratuito pueda usarlo. Su
propio comentario (`:12-16`) dice que un UptimeRobot cada minuto convertiría el
incidente de 9 días en una alerta de minutos. Pero
`grep -rn "api/health" docs/ README.md` no devuelve nada: el runbook no lo
menciona, no dice a qué monitor apuntarlo, y no hay registro de que exista un
monitor externo. El pulso está construido y sin enchufar.

Y `version` (`:52`) es la pieza que faltaba contra el modo de falla silencioso del
`ignoreCommand` (`vercel.json:3`): un `GET /api/health` compara el sha publicado
contra `git log -1` en un segundo, y `DEPLOY.md` sigue mandando a `vercel inspect`.

**Causa raíz probable.** Se cerró la parte que se escribe en código y no la que
se configura fuera del repo, sin dejar la instrucción de hacerlo.

---

### [BAJO] `dependabot.yml` dice que aísla los majors y lo que hace es suprimirlos

`.github/dependabot.yml:35-41`

El comentario declara: *«Los MAJOR quedan FUERA de los grupos a propósito… Cada
major llega solo, con su propio PR, para que se revise como lo que es»* (`:35-38`).
Lo que sigue es:

```yaml
ignore:
  - dependency-name: '*'
    update-types: ['version-update:semver-major']
```

`ignore` no aísla: **suprime**. Con esa regla Dependabot no va a abrir jamás un
PR de actualización mayor para ningún paquete — Next 16→17, React 19→20,
supabase-js — así que «cada major llega solo con su propio PR» describe algo que
no puede ocurrir. Consecuencia: el repo envejece por debajo del radar y el
comentario le dice al siguiente lector que la vigilancia está cubierta.

---

### [BAJO] Una cifra numérica de 10, 16 o 18 dígitos en el `meta` de un log destruye el `meta` ENTERO

`src/lib/logger.ts:57,63-64,72,110-121` (regexes de CLABE y TARJETA, nuevas esta ronda)

`redact()` serializa el objeto, aplica los regexes sobre el JSON y vuelve a
parsear. Sobre un valor **numérico** (no entrecomillado) el reemplazo produce
JSON inválido y el `catch` de `:117` devuelve la cadena `'[unserializable]'`
**para todo el objeto**. Reproducido esta ronda con las regexes del archivo:

```
redact({ viaje:'F-1042', bytes:1234567890 })  →  "[unserializable]"
redact({ viaje:'F-1042', epoch:1755300000 })  →  "[unserializable]"
```

Hoy no encontré un `logger.*` del árbol que pase un número de esa longitud, así
que es latente y no activo — pero las dos regexes nuevas de esta ronda
(`CLABE = \b\d{18}\b`, `TARJETA = \b\d{16}\b`) ampliaron la ventana justo en la
capa de la que dependen todos los demás hallazgos de este rubro: el día que
alguien loguee una referencia bancaria o un epoch en segundos, la línea que se
mire a las 3 a.m. no dirá `[CLABE]`, dirá `"meta":"[unserializable]"` y se habrá
llevado el `tenant`, el `viaje` y el `err` con ella.

---

### [BAJO] El `README` describe un arranque que no deja el proyecto corriendo, y cita cifras de otra época

`README.md:17,18,66,70,82-86`

`## Correr el demo` (`:82-86`) dice `npm install` → `cp .env.example .env.local` →
`npm run dev`. Con eso la app levanta y **no hay base**: no menciona
`npm run seed` (`package.json:14`, que exige `DATABASE_URL` + `psql`), ni
`npm run setup` (`:15`), ni que hay que crear el proyecto de Supabase, ni el
bucket `liquidaciones` — todo lo cual `scripts/seed.sh` sí sabe hacer y termina
diciendo *«Siguiente: pon las llaves en .env.local… y corre npm run dev»*, que es
el orden inverso al del README.

Y las cifras: «**3,149 pruebas verdes**» (`:17`), «~3,150 pruebas» (`:66`) y «61
bloques de verificación» (`:18,70`) contra el propio `CLAUDE.md` («~2,880… la
cifra crece; no la cites de memoria») y contra `ci-postgres.yml:51` («78 bloques
de batería»). Dos documentos del mismo repo se contradicen sobre el mismo número.

---

### [BAJO] `.env.example` describe `CRON_SECRET` como si protegiera una sola ruta

`.env.example` (sección `── CRON_SECRET ──`) × `vercel.json:4-21`

El bloque dice *«Protege /api/cron/escalar»* y explica su modo de falla en
singular. Hoy lo exigen **cuatro** rutas (`escalar`, `facturar`, `purgar`,
`wa-pendientes`), y la consecuencia de olvidarlo ya no es «la escalación no
corre» sino también «la bandeja del apagado no se drena y el SLA de la cola no
se vigila». El inventario está verificado por `runbook.test.ts` en cuanto a
*presencia*, no en cuanto a que lo que dice sea cierto.

---

## Lo que revisé y está bien

- **`src/app/api/cron/wa-pendientes/route.ts:78-101`** — es el mejor cron del
  repo y el modelo de lo que le falta a `escalar`: 500 cuando `fallidos > 0`
  (`:101`), `alertarOperador` con `codigo: 'cartas_muertas'` (`:99`), y cada
  fallo de evento con `{ id, intento, err }` (`:88`) — el `id` ES el wamid, o
  sea el identificador con el que se reconstruye el caso.
- **`src/lib/likida/wa_pendientes.ts:33-57,87-98`** — el claim anclado
  (`.eq('intentos', intentosLeidos)`) hace idempotente el drenado solapado; el
  intento se anota EN el claim, así que un proceso que revienta ya quedó contado;
  el `23505` se trata como dedup y no como pérdida; y el insert fallido se GRITA
  con `id` y `from` completos porque ahí ya no hay a quién contestarle.
  `pendientesPorDrenar` y `cartasMuertas` **lanzan** ante error de lectura
  (`:77,128`) en vez de devolver «no había nada» — `exigir()` bien aplicado.
- **`.github/workflows/ci-postgres.yml:126-162`** — las 118 migraciones una por
  una sobre base virgen (para que el fallo señale cuál), y sobre todo
  `:150-162`: la nota de que `{ echo; node; echo } | tee` esconde el exit code
  real y el `${PIPESTATUS[0]}` explícito. Eso es alguien que probó su propio CI
  en verde falso antes de publicarlo.
- **`.github/workflows/ci.yml:60-61`** — `npm audit --omit=dev --audit-level=high`
  con la clasificación escrita (runtime rojo / tooling a Dependabot) y la
  prohibición explícita de `audit fix --force`. Convierte una decisión de un día
  en regla permanente.
- **`src/lib/likida/agentes/cola.ts:286-360`** — el claim anclado con RETURNING,
  el `revertir()` compensatorio en los cuatro caminos de fallo (sin correo, sin
  historial, cadencia, Resend rechaza), la guardia de cadencia **fail-closed**
  (`:322-327`: si el historial no se puede leer, no se manda), y el grito cuando
  ni la compensación entra (`:307-308`). Cero éxitos falsos en todo el archivo.
- **`src/app/api/cron/purgar/route.ts:90-111`** — sigue siendo el patrón correcto
  de cron: `error` comprobado por valor, `codigo`, `alertarOperador` y 500 en los
  dos caminos.
- **`src/lib/observability/sentry.ts:161-169,192-203`** — `discriminadores`
  (tenant + causa) en el fingerprint, con el argumento de cardinalidad escrito y
  la decisión de NO meter `viajeId`; y el nivel dentro del fingerprint para que
  un aviso y su desmentido no caigan en el mismo cubo.
- **`src/lib/logger.ts:11-46,89-97`** — la huella FNV en vez del borrado sigue
  siendo la decisión que hace que un log a las 3 a.m. sirva: `huellaId(fila.id)`
  cruza el log contra Postgres. Las regexes nuevas de CLABE/TARJETA están fijadas
  a 18 y 16 dígitos EXACTOS con la razón escrita (`:58-62`) — el mismo error de
  rango que ya se cometió con `PHONE`, no repetido.
- **`src/instrumentation.ts:56-86`** — `onRequestError` con `digest` conservado es
  el único puente real entre lo que ve el contralor y la línea del servidor, y
  llama `flushObservabilidad()` antes de que la invocación se congele.
- **`src/app/api/webhook/whatsapp/route.ts:195-218`** — el bloque que reemplaza
  «acusar y tirar» por «pausado y durable» documenta que el comentario anterior
  era falso, en vez de borrarlo. Esa honestidad es lo que hace auditable el
  archivo.
- **`.github/workflows/codeql.yml:8-14`** — el razonamiento de por qué corre solo
  en master/PR y no en cada rama (a diferencia de `ci.yml`), con el costo
  explícito; y el `cron: '17 4 * * 1'` con la nota de evitar la estampida del
  minuto 0.
- **`scripts/respaldo.sh:32-39`** — «un respaldo que no se comprueba no es un
  respaldo»: verifica que el dump pese más de 2 000 bytes. La pieza está bien; lo
  que falta es quien la dispare (ver hallazgo).

## Lo que NO alcancé a revisar

- **La configuración fuera del repo.** Si `SENTRY_DSN`, `ALERTA_EMAIL` y
  `CRON_SECRET` están de verdad en Vercel production, si hay reglas de alerta en
  Sentry más allá de «issue nuevo», y si algún monitor externo apunta a
  `/api/health`. Sin `vercel env ls` ni acceso a Sentry, desde el código todo es
  «configurado», nunca «conectado». Es el mismo hueco de los tres pases
  anteriores.
- **La prueba de fuego en vivo.** No disparé ningún cron, ningún correo de alerta
  ni ningún evento de Sentry (no corro `npm run build` ni las pruebas de pago).
  Todo lo de arriba es lectura del árbol de hoy más `tsc`, `lint` y `vitest`
  sobre archivos puntuales.
- **Si el CI de GitHub está de verdad rojo.** Verifiqué el fallo de `tsc`
  localmente y que `ci.yml:63-64` corre ese mismo comando; no consulté el estado
  de las Actions del PR #13 ni de los tres PRs de dependabot abiertos.
- **`scripts/cosecha`, `scripts/deploy-vercel.sh`, `scripts/auditoria/`** — los
  abrí solo de nombre.
- **El volumen y el costo de logs con tráfico real** (la base está en cero
  viajes): cuántas líneas por liquidación y si eso es sostenible. Es también lo
  que decidiría si el ruido de `aprobaciones.urgentes` es tolerable o fatal.
- **La retención real de los runtime logs** en el plan Pro y si hay log drain: el
  propio `DEPLOY.md:152-153` lo declara sin resolver.
