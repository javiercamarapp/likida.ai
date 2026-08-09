# Operabilidad y DX — auditoría 17 (pase 2)

**Nota: 5/10** (antes 6). Razón del movimiento: **el terreno cambió**. Se cerró
el CRÍTICO del pase 1 —el sondeo de arranque ya no suelta el mutex ajeno, y
tiene prueba que lo reproduce— pero en su lugar entró un camino que corre solo
de madrugada y manda WhatsApp a personas reales (`recordatorio_comprobacion.ts`,
mig. `0087`, cron `escalar`) con exactamente la clase de ceguera que este rubro
existe para cazar: sella el viaje ANTES de saber si el mensaje salió, responde
200 cuando falla, y el único identificador de qué viaje falló vive en un `info`
que Sentry nunca ve. Encima, la limpieza de `/chofer` (mig. `0086`) dejó
`verificaciones.sql` sin poder correr de punta a punta y nada lo dijo. Los otros
once hallazgos del pase 1 siguen abiertos, uno de ellos peor que ayer.

**El riesgo mayor de hoy:** el recordatorio nocturno puede fallar para el 100 %
de su población objetivo —Meta no entrega texto libre fuera de la ventana de
24 h, y la población objetivo es, por definición, la del operador que lleva días
callado— y el sistema queda marcando esos viajes como "ya recordado" para
siempre, con el cron en verde en el panel de Vercel.

---

## Estado de los hallazgos del pase 1

| # | Hallazgo | Estado |
|---|---|---|
| C2 | Sondeo de arranque suelta el mutex de un viaje ajeno | **CERRADO** (`61cf600`, verificado post-merge) |
| A1 | `/admin/observabilidad` dice "Conectado" a mano | **REINCIDENTE** |
| A2 | Un fallo de cliente no deja rastro en ninguna parte | **REINCIDENTE** |
| A3 | La compuerta de despliegue colapsa todo fallo en "no desplegar" | **REINCIDENTE, PEOR** |
| A4 | El respaldo es un script manual que nada agenda | **REINCIDENTE** |
| M1 | La cola de QStash se sigue cortando a los 150 s | **REINCIDENTE** |
| M2 | Encolar a QStash devuelve 200 y nadie observa el callback | **REINCIDENTE** |
| M3 | Una base caída se reporta como "sin viajes en la base" | **REINCIDENTE** |
| M4 | Los dos KPI de ARCO pintan 0 cuando la lectura falló | **REINCIDENTE** |
| M5 | Fingerprint fijo: una causa nueva nunca dispara alerta | **REINCIDENTE** |
| M6 | `npm run setup` no deja el proyecto corriendo en limpio | **REINCIDENTE** |
| B1 | El runbook manda a `src/lib/cuadra/costos.ts`, que no existe | **REINCIDENTE** |
| B2 | El catch exterior del `after()` pierde el `waMessageId` | **REINCIDENTE** |

**C2 — cerrado, con evidencia.** `src/lib/likida/startup.ts:65` ahora captura el
`data` del RPC (`const { data: tomado, error } = await admin.rpc('try_lock_viaje'…)`)
y :83-85 condiciona el `unlock` a `tomado === true`. El comentario de :68-82
explica el modo de falla. El merge de master (`c7c9a0e`) no lo revirtió:
verificado sobre el árbol de hoy, no sobre el commit. Además llegó
`startup_mutex_ajeno.test.ts` (89 líneas) que reproduce el caso "otro proceso
tiene el lease → `try_lock_viaje` devuelve `false` sin error → no se llama a
`unlock_viaje`". Este es el único hallazgo de mi rubro que está mejor que ayer.

**A3 empeoró y es medible.** En el pase 1 producción iba 5 commits atrás. Hoy:

```
$ git rev-list --count 87426f8..origin/master
17
```

17 commits en `master` desde el último `[deploy]` (`87426f8`). Entre ellos van
el retiro del rol operador (`31babfd`, mig. `0086`), el recordatorio automático
completo (`c5a7c19`, mig. `0087`) y los 8 commits del rework del dashboard. O
sea: el camino nocturno que este pase audita **no está desplegado**, y ni el
repo ni la app lo dicen. Sigue sin haber ningún `/api/health` con commit
(`grep -rn "VERCEL_GIT_COMMIT_SHA" src/ next.config.ts` → 0 resultados) ni paso
de CI que mire la bandera.

**M3 sigue idéntico:** `startup.ts:63` conserva
`const { data: viajeReal } = await admin.from('viaje').select('id').limit(1);`
— el `error` se descarta, así que una base caída sigue emitiendo
`startup.migraciones_0005_skip {"msg":"sin viajes en la base…"}`. Es la única
consulta del archivo que no pasa por `reportarProbe`. El arreglo del mutex tocó
la línea de al lado y no esta.

**M6 sigue idéntico:** `package.json:12` (`"setup": "npm install && npm run seed"`)
y `scripts/seed.sh:11-15` no cambiaron un carácter desde `94c0733`
(`git diff 94c0733..HEAD -- scripts/ .env.example` → vacío). En una máquina
limpia sin `DATABASE_URL`, `npm run setup` sigue saliendo `1`.

---

## Hallazgos

### [ALTO] El recordatorio nocturno sale por el único canal que WhatsApp NO entrega a un operador callado, y el viaje queda sellado como "ya recordado"

`src/lib/likida/recordatorio_comprobacion.ts:117-137` · `src/lib/meta/client.ts:89-104,155-162`

El envío es `sendText` pelado (`:135`), sin caída a plantilla. El propio
`meta/client.ts:155-162` documenta la regla: *"WhatsApp lo entrega únicamente
dentro de las 24 h desde el último mensaje DEL USUARIO… Fuera de esa ventana Meta
responde 131047 ('Re-engagement message')… Para eso está `sendTemplate`, que es
lo único que abre la ventana."* Y `escalar_viaje.ts:222-228` —el módulo hermano,
en el mismo cron— sí lo implementa: intenta `sendText` y si devuelve `null` cae a
`avisarAlChofer` / `sendTemplate`. `recordatorio_comprobacion.ts` no tiene esa
segunda rama.

Escenario con valores: 03:00, cron `escalar`. La consulta de `:54-61` devuelve 40
viajes `abierto` con `fecha_inicio <= 2026-08-06`. Para cada uno:

1. `reclamarRecordatorio` escribe `recordatorio_comprobacion_en = '2026-08-09T03:00:00Z'`
   y devuelve `ganado: true` (`:117`).
2. `sendText('529993700779', …)` → Meta 400 con
   `(#131047) Re-engagement message` porque ese operador lleva 3 días sin
   escribirle al número — que es literalmente el criterio con el que se le
   seleccionó (`:6-13`: *"El operador que lleva días sin mandar nada"*).
3. `res.ok` es `false` → `client.ts:96` emite
   `logger.error('wa.sendText', { status: 400, body: '…131047…' })` y devuelve
   `null`.
4. `enviado` es `null` → `r.fallos.push('VJ-104: WhatsApp rechazó el envío')` (`:137`).

Resultado: 40 viajes sellados, 0 mensajes entregados, y como no hay ningún sitio
que ponga `recordatorio_comprobacion_en` de vuelta a `NULL`
(`grep -rn "recordatorio_comprobacion_en" src/ supabase/` → 4 usos, ninguno lo
limpia), esos 40 operadores **no volverán a recibir el recordatorio nunca**,
tampoco cuando sí estén dentro de ventana.

Lo que tiene el de guardia a la mañana siguiente: en Sentry, **un** issue
`wa.sendText` con 40 eventos, cuyo `extra` es `{status, body}` — sin viaje, sin
tenant, sin teléfono, y agrupado por `fingerprint: [msg, nivel]`
(`observability/sentry.ts:160`) con todos los demás fallos de envío del producto.
Los folios (`VJ-104…`) solo existen en `cron.recordatorio_comprobacion.ok`, que
es `logger.info` (`escalar/route.ts:77`) y por tanto **nunca llega a Sentry**
(`logger.ts:148`: solo `warn`/`error`). Reconstruir a quién no se le mandó qué
exige cruzar por hora dos canales, uno de ellos con la retención corta que
`DEPLOY.md:151-153` deja anotada como desconocida.

Intenté refutarlo: (a) la ventana de 24 h es por teléfono, no por viaje, así que
un operador con OTRO viaje activo sí recibiría el mensaje — cierto, pero eso solo
reduce la población afectada a la que el módulo declara como su objetivo;
(b) `sendText` podría lanzar y caer al `catch` de `:138` — no: `client.ts:96`
devuelve `null`, no lanza; (c) podría haber un reintento en la corrida siguiente
— no lo hay, el sello es definitivo por diseño declarado (`:100-108`).

**Consecuencia:** la flota cree que Likida le insiste al chofer y no le insiste a
nadie; el contralor descubre el hueco cuando la liquidación no llega. Y no hay
forma de listar los viajes afectados sin volver a la base.

**Causa raíz probable:** el módulo se copió de `escalar_viaje.ts` sin la mitad
que resuelve la ventana de 24 h, y su fallo se clasificó como "un fallo más de la
lista" en vez de como "este canal no puede funcionar para esta población".

---

### [ALTO] El cron responde 200 con 40 fallos dentro, y la lista de cuáles se pierde si la invocación se corta

`src/app/api/cron/escalar/route.ts:75-89` · `src/lib/likida/recordatorio_comprobacion.ts:109-145`

```ts
    const r = await enviarRecordatoriosComprobacion();
    logger.info('cron.recordatorio_comprobacion.ok', { ...r });
    resultado.comprobacion = r;
  } catch (e) { … }
  return NextResponse.json(resultado);      // 200 siempre
```

Tres cosas se juntan aquí:

1. **200 con fallos.** `resultado.comprobacion = { revisados: 40, recordados: 0, fallos: [40 cadenas] }`
   sale con status 200. El panel de crons de Vercel queda verde. El comentario de
   `:85-88` dice que los fallos van "en la RESPUESTA, no solo en el log" — pero el
   lector de esa respuesta es Vercel Cron, que solo mira el código de estado. Es el
   mismo modo de falla que el propio archivo condena en `:33-40` para el secreto
   ausente, aplicado al caso parcial.
2. **El resumen del módulo cuenta, no nombra.** `recordatorio_comprobacion.ts:143`
   emite `{ revisados, recordados, fallos: r.fallos.length }` — un número. Los
   folios solo aparecen porque la ruta hace `{ ...r }`, y en nivel `info`.
3. **Nada se materializa hasta el final.** El array `fallos` vive en memoria hasta
   `:143`. `maxDuration = 120` (`route.ts:11`) cubre DOS chequeos que leen hasta
   100 viajes cada uno (`recordatorio_comprobacion.ts:61`, `escalar_viaje.ts:90`),
   con `SEND_TIMEOUT_MS = 10_000` por envío (`meta/client.ts:17`) y sin un solo
   chequeo de reloj dentro del `for` — a diferencia de `facturar/route.ts:158`,
   que sí corta con `MARGEN_LOTE_MS`. Escenario: primera corrida tras desplegar
   `0087`, donde **todos** los viajes históricos abiertos tienen la columna en
   `NULL` a la vez; 100 viajes × 2 s de Meta = 200 s > 120 s. Vercel mata la
   invocación: N viajes quedaron sellados y enviados, M fallaron, y **no se emite
   ninguna de las dos líneas de resumen** — el único rastro son los
   `wa.sendText.ok` sueltos de `client.ts:102`, que no dicen a qué viaje
   pertenecen.

**Consecuencia:** el de guardia no puede contestar "¿a cuántos operadores les
llegó el recordatorio anoche?" ni "¿cuáles fallaron?", y el panel de Vercel le
dice que todo salió bien.

**Causa raíz probable:** el resultado se diseñó como valor de retorno de una
función pura, no como registro de una corrida desatendida; la ruta lo traduce a
un 200 porque "corrió" y "salió bien" se colapsaron en la misma señal.

---

### [ALTO] El único guardia contra el WhatsApp duplicado es una cláusula que ninguna prueba puede ver

`src/lib/likida/recordatorio_comprobacion.test.ts:47,143` · `src/lib/likida/escalar_viaje.test.ts:90` · `src/lib/likida/migraciones_verificadas.test.ts:53`

El claim de `:158-163` depende enteramente de `.is('recordatorio_comprobacion_en', null)`:
sin esa línea, dos corridas solapadas del cron (Vercel entrega *at-least-once*,
y el propio encabezado lo dice en `:15-21`) leen las dos la fila en `NULL`, las
dos actualizan, las dos reciben una fila de vuelta, y las dos mandan el WhatsApp.

El mock de la prueba **descarta esa llamada**:

```ts
nodo.eq = (col: string, val: unknown) => { por.push([col, val]); return nodo; };
nodo.is = () => nodo;                    // ← :47, no registra ni argumentos
```

y la única aserción exhaustiva sobre la cadena del UPDATE es
`expect(updates[0].por).toEqual([['id','v-1'],['tenant_id','t-1']])` (`:143`),
que solo mira los `eq`. La prueba "DOS CORRIDAS SOLAPADAS" (`:171-190`) programa
`resultadosUpdate = [{ data: [], error: null }]` para simular la corrida
perdedora: verifica cómo **reacciona** el código a perder la carrera, nunca que
el UPDATE la perdería. Nótese el contraste dentro del mismo archivo: en la cadena
de LECTURA el mock sí registra `is` (`:34`) y `:92` afirma
`args('is')).toContainEqual(['recordatorio_comprobacion_en', null])`. La cláusula
que importa es la que no se mira.

Lo comprobé empíricamente durante esta corrida: con esa línea borrada del árbol,
`npx vitest run src/lib/likida/recordatorio_comprobacion.test.ts` → **15/15 en
verde**. `escalar_viaje.test.ts:90` tiene el mismo `nodo.is = () => nodo`, así
que `escalado_en IS NULL` está igual de desprotegido.

Y hay un tercer sitio donde esto se cobra: `migraciones_verificadas.test.ts:53`
exime a la `0087` de tener bloque en `verificaciones.sql` con este argumento
textual — *"La carrera entre corridas solapadas SÍ se prueba, exhaustivamente, en
TS (recordatorio_comprobacion.test.ts: 'DOS CORRIDAS SOLAPADAS'…) contra un mock
que modela la fila ganada/perdida"*. Esa afirmación es la que sostiene que no
haga falta verificar la migración contra Postgres, y no es cierta: el mock no
modela la condición, la ignora.

**Consecuencia:** borrar seis palabras del claim —en un refactor, en un merge
mal resuelto— produce dos WhatsApp idénticos al mismo chofer por cada corrida
solapada, con typecheck, lint y 3,168 pruebas en verde y sin bloque SQL que lo
atrape.

**Causa raíz probable:** un mock que registra los filtros que el autor estaba
mirando (`eq`) y absorbe en silencio los que no, más una exención de
verificación SQL justificada con la cobertura que ese mock aparenta dar.

---

### [ALTO] `verificaciones.sql` ya no corre de punta a punta: tres bloques mueren en el INSERT desde la mig. `0086`

`supabase/verificaciones.sql:1005-1006, 1103-1104, 1201-1202` · `supabase/migrations/0086_retirar_rol_operador.sql:96-98`

La `0086` cierra el dominio de roles:

```sql
alter table public.app_user
  add constraint app_user_rol_dominio
  check (rol in ('superadmin', 'flota_admin', 'contador', 'encargado'));
```

La limpieza de `verificaciones.sql` borró los bloques 54, 55 y 56 (los de las
migs. 0078/0079/0081) y añadió el 62. Pero dejó **tres bloques anteriores** que
siembran una sesión de chofer para poder impersonarla:

- `:1005` — bloque **26**, "El chofer solo ve sus propios viajes (mig. 0045)":
  `insert into app_user (…, rol, operador_id) values (…, 'operador', v_o1);`
- `:1103` — bloque **28**, "Las tablas de operación no se le abren al chofer (mig. 0047)"
- `:1201` — bloque **30**, "El rastreo: ni el chofer ve posiciones, ni el contador ve tokens (mig. 0050)"

Ninguno está envuelto en `begin … exception when check_violation`, a diferencia
del INSERT equivalente del bloque 62 (`:3024-3026`), que sí lo espera. Escenario
con valores: `psql "$DB" -f supabase/verificaciones.sql` contra una base con la
`0086` aplicada. Donde antes salía

```
ERROR:  RLS_CHOFER  viaje=1  gasto=1  liquidacion=1  viaje-ajeno=0   (esperado 1/1/1/0)
```

ahora sale

```
ERROR:  new row for relation "app_user" violates check constraint "app_user_rol_dominio"
```

El bloque aborta **antes** de `set local role authenticated`, así que las
aserciones que sí seguían siendo válidas —que un usuario de sesión no ve `unidad`,
`mantenimiento`, `incidencia` y `pod` de otro, y que el **contador** (rol vivo) no
ve `rastreo_credencial.token`— dejan de comprobarse. Como el archivo se lee por la
salida y cada bloque termina en `raise exception` a propósito, un error de más se
mimetiza con los 60 errores esperados.

Nada lo detecta: `migraciones_verificadas.test.ts` solo compara **títulos** de
bloque contra nombres de migración (`:38-41`), no ejecuta SQL; y
`.github/workflows/ci.yml` no levanta Postgres ni corre este archivo.
Colateral menor del mismo cambio: el bloque 49 (`:2686-2713`) documenta como
"corrida REAL, salida copiada tal cual" siete funciones con `pg_temp`, dos de las
cuales (`is_operador`, `get_user_operador_id`) la `0086` dropeó — el bloque no
revienta, pero su salida ya no coincide con lo que dice esperar.

**Consecuencia:** el único artefacto del repo que demuestra garantías que un test
con Supabase mockeado no puede tocar quedó parcialmente inservible, y quedó así
en silencio.

**Causa raíz probable:** la limpieza buscó los bloques por el nombre de las
migraciones retiradas (0078/0079/0081) en vez de buscar quién crea una sesión con
`rol='operador'`, que es lo que la `0086` prohíbe.

---

### [MEDIO] El viaje se sella antes de comprobar que hay teléfono, y el aviso se pierde entre iguales

`src/lib/likida/recordatorio_comprobacion.ts:117-131`

El orden es: reclamar (`:117`) → comprobar teléfono (`:127`). Un viaje cuyo
operador no tiene `telefono` capturado queda con
`recordatorio_comprobacion_en` puesto y sin mensaje, para siempre — incluso si al
día siguiente el jefe de flota captura el número.

Escenario con valores: la flota da de alta 6 choferes desde
`/dashboard/operadores` y deja el teléfono en blanco en 2. Sus viajes cruzan los
3 días. El cron sella los 6, manda 4, y emite dos veces
`logger.error('recordatorio_comprobacion.sin_telefono', { tenantId, viaje })`.
Eso sí llega a Sentry (es `error`), pero con `fingerprint: ['recordatorio_comprobacion.sin_telefono','error']`
—un solo issue para todos los tenants y todos los viajes, para siempre— y con el
`tenantId`/`viaje` huellados (`id:9f2c…`) dentro del `extra`, no en el título. Con
el issue ya visto y silenciado una vez, el tercer tenant al que le pase no
dispara ninguna alerta (es el M5 del pase 1, aquí en su forma nueva).

El módulo hermano tiene el mismo orden pero el precio es menor: en
`escalar_viaje.ts:222-228` la falta de teléfono en la fila cae a
`avisarAlChofer`, que lo resuelve por su cuenta.

**Causa raíz probable:** el claim se puso al principio del bucle por la carrera
del cron, y las precondiciones que no dependen de la carrera se quedaron después.

---

### [MEDIO] Ni el runbook ni `.env.example` saben que este cron manda mensajes

`docs/conocimiento/DEPLOY.md:145-153` · `.env.example` (§ CRON_SECRET)

`grep -n "cron\|escalar\|recordatorio" docs/conocimiento/DEPLOY.md` → **cero
resultados**. El documento al que se acude a las 3 a.m. no menciona que existan
tres crons, ni qué significa `cron.recordatorio_comprobacion.falló`, ni qué hacer
con 40 viajes sellados sin mensaje. Su sección "Lo que este runbook NO cubre"
sigue diciendo, literal: *"**Quién recibe qué cuando algo falla.** Hoy no hay
nadie asignado ni ningún canal"*.

`.env.example` describe `CRON_SECRET` como lo que *"protege /api/cron/escalar, que
a las 5 h sin aceptar le insiste al chofer y le avisa al jefe de flota"* — la
mitad vieja del cron. Desde `c5a7c19` la misma URL dispara un segundo camino con
otro criterio (3 días), otro destinatario y otro sello.
`observability/runbook.test.ts` compara nombres de variable leídos contra
declarados; no mira si la descripción sigue siendo verdad, así que la deriva pasa
verde.

Escenario: alguien rota `CRON_SECRET` para probar el cron, se equivoca de valor y
la ruta devuelve 401 sin cuerpo (`route.ts:58-61`, correcto). Con el runbook en
la mano no hay forma de saber qué dejó de correr ni durante cuánto.

**Causa raíz probable:** el runbook documenta el webhook y el despliegue; el cron
nunca se le agregó, y el segundo chequeo se montó sobre la ruta existente
—decisión razonable— sin tocar la única página que lo describe.

---

### [BAJO] `CLAUDE.md` y `README.md` afirman cosas que la base ya rechaza

`CLAUDE.md:47` · `README.md:43`

`CLAUDE.md:47` sigue diciendo `app_user.rol`: *"superadmin, flota_admin,
contador, **operador**, encargado"*. Desde la `0086` un
`insert into app_user (…, rol) values (…, 'operador')` rebota con
`app_user_rol_dominio`. Es la sección "Trampas ya pisadas", es decir, el sitio
del repo cuyo trabajo es evitar que el siguiente agente pierda una hora — y hoy
es la trampa. Lo mismo `README.md:43`, que anuncia como parte del producto un
*"**portal del chofer** (`/chofer`)"* que `31babfd` borró entero (12 archivos), y
`README.md:72`, que cita "RLS del chofer" entre lo que `verificaciones.sql`
comprueba, que es justo lo que dejó de comprobar (ver el ALTO de arriba).

**Consecuencia:** menor en producción, directa en DX — es exactamente el mismo
patrón que el B1 del pase 1 (`DEPLOY.md` apuntando a `src/lib/cuadra/costos.ts`),
que también sigue abierto.

---

## Lo que revisé y está bien

- **El arreglo del mutex (C2) está en pie después del merge**, con prueba de
  regresión propia (`startup_mutex_ajeno.test.ts`) y el porqué escrito en
  `startup.ts:68-82`. Verificado sobre el árbol, no sobre el commit.
- **La `0086` no puede aflojar RLS en silencio.** `drop function … is_operador()`
  va **sin CASCADE** (`0086:80-81`): si quedara una policy dependiente, la
  migración revienta en vez de tirarla. Y las 21 tablas se reescriben explícitas
  con la lista sacada de `pg_policies` en vivo, con el fallo del primer intento
  documentado en el encabezado. Es el patrón correcto.
- **La exención de la `0087` en `migraciones_verificadas.test.ts` existe y está
  razonada** — el mecanismo que obliga a decidir "bloque o exención" funcionó.
  Lo que falla es el contenido del argumento, no el mecanismo (ver el ALTO).
- **Los dos chequeos del cron corren en `try/catch` independientes**
  (`escalar/route.ts:65-83`): que el recordatorio truene no deja ciega la
  escalación, y viceversa. La razón está escrita en `:29-31`.
- **`viajesSinComprobar` falla cerrado** (`:63`: `if (error) throw`), a
  diferencia de la consulta de `startup.ts:63`. Un error de lectura no se lee
  como "no hay viajes vencidos".
- **El sello se pone ANTES del envío, no después** — la decisión correcta para un
  cron *at-least-once*, con el razonamiento completo en `:15-21` y `:100-108`.
  Mi objeción es a lo que pasa cuando el envío falla, no al orden.
- **`huellaId` / redacción** (`logger.ts:82-110`) siguen intactos y cubren los
  `fallos` del cron: un folio viaja legible, un UUID sale como `id:…` estable.
- **Los tres crons siguen fallando cerrado sin `CRON_SECRET`** (500, no 200) y
  `facturar` sigue devolviendo 503 sin marcar tickets cuando Chromium no arranca.
- **Compuerta reproducida hoy sobre el árbol post-merge**, coincide con el MAPA:
  `npx tsc --noEmit -p .` → 0 errores; `npx vitest run` → **255 archivos, 3,168
  pruebas verdes, 1 saltada** (104.8 s).

---

## Lo que NO alcancé a revisar

- **Si `verificaciones.sql` corre de verdad.** No hay Postgres en este entorno:
  el hallazgo de los bloques 26/28/30 es por lectura del constraint de la `0086`
  contra los tres `insert … rol='operador'`, no por ejecución. Alguien con
  `DATABASE_URL` debería correrlo y pegar la salida.
- **Si las variables de QStash y el passcode siguen en Vercel.** Sin
  `vercel env ls` no se puede cerrar. Abierto desde la ronda 13.
- **Si Vercel evalúa el `ignoreCommand` en un "Redeploy" del panel** — la salida
  de emergencia que documentan `CLAUDE.md` y `DEPLOY.md:182` depende de que no lo
  evalúe, y sigue sin comprobarse.
- **Cuánto tarda de verdad una corrida del cron `escalar` con 100 viajes.** El
  cálculo del ALTO usa los topes declarados (`SEND_TIMEOUT_MS`, `maxDuration`);
  la latencia real contra Meta desde Vercel no está medida en ningún sitio del
  repo, y no hay presupuesto anotado para este camino como sí lo hay para el
  cierre (`presupuesto.ts`, `PASOS_CIERRE`).
- **Retención real de los runtime logs de Vercel**, que es de lo que depende que
  la lista de `fallos` en nivel `info` sirva de algo a la mañana siguiente. Lo
  mismo que `DEPLOY.md:152-153` deja pendiente desde hace rondas.
