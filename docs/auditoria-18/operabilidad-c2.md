# Operabilidad y DX — auditoría 18 · continuación 21-ago

**Nota: 5/10** (antes 7). Razón del movimiento: **deuda que cobró factura** y
**mirada más profunda**, en ese orden y las dos verificadas contra el remoto.

1. *Deuda que cobró factura.* La nota de ayer apoyó el 7 en «CI con puerta». Esa
   puerta lleva **cinco corridas seguidas en rojo sobre `master`** desde
   `0bfb51c` (20-ago 17:18Z) hasta `d432e89`, la cabeza de hoy — y dos de esos
   commits llevan `[deploy]` en el asunto, así que **se publicaron a producción
   igual**. La prueba que falla es, con toda ironía, la guardia escrita para que
   una migración no se cuele sin comprobar.
2. *Mirada más profunda.* Ayer conté el CI como puerta del despliegue sin
   comprobar que el despliegue dependiera de él. No depende: `vercel.json:3`
   lee el **asunto del commit**, nunca el estado de GitHub Actions. No es que
   empeorara; es que se vio mejor.

Y encima el delta metió un camino de dinero nuevo —un robot de visión tecleando
en portales fiscales de terceros— cuyo **fallo entero se registra en nivel
`info`**: ni Sentry, ni correo, ni una línea que nombre el gasto. El techo que
declaré ayer («ninguna alerta empujada en el camino del dinero») no solo sigue
en pie: el delta construyó encima de él.

**El riesgo mayor de hoy:** producción corre código que `next build` nunca
compiló, publicado por una bandera de texto en un mensaje de commit, sobre una
suite roja que nadie miró.

## Hallazgos

### [CRÍTICO] La compuerta no cierra: cinco corridas rojas en `master` y dos deploys publicados encima

`vercel.json:3` · `.github/workflows/ci.yml:82` y `:96` ·
`src/lib/likida/migraciones_verificadas.test.ts:110-122`

Medido en esta corrida contra la API de GitHub (`javiercamarapp/cuadra`,
workflow `ci.yml`, rama `master`):

| sha | conclusión | asunto |
|---|---|---|
| `d432e89` | **failure** | `[deploy]` el dueño que maneja… |
| `fe30263` | **failure** | migración (aplicada): necesidad_pct excluye… |
| `0f6fa31` | **failure** | `[deploy]` mapa de prospectos… |
| `0617f3e` | **failure** | migración: necesidad_pct ya no infla… |
| `0bfb51c` | **failure** | `[deploy]` Ficha por prospecto en el Cerebro… |
| `feb0f6b` | success | `[deploy]` piloto de visión… |

El job `verificar` de `d432e89` (run 32422808848, job 96598294109) termina así:
paso 8 «Tests (con umbral de cobertura)» → **failure**; paso 9 «Pruebas de
tiempo» → **skipped**; paso 10 **«Build» → skipped**. El mensaje:

> `AssertionError: estas migraciones no tienen bloque en supabase/verificaciones.sql ni una razón en EXENTAS: 0140… 0141… 0142… 0143…`
> `Test Files 1 failed | 392 passed (393) · Tests 1 failed | 5119 passed`

Reproducido local: `npx vitest run src/lib/likida/migraciones_verificadas.test.ts`
→ 1 failed | 3 passed, misma lista de cuatro.

Escenario: se hace `git commit -m "[deploy] …"` y `git push` sobre `master` con
la suite roja → GitHub Actions pinta rojo, **y Vercel construye y publica igual**,
porque `ignoreCommand` es `git log -1 --pretty=%s | grep -qi '\[deploy\]' &&
exit 1 || exit 0`: mira el asunto y nada más. El paso `Build` de CI está
condicionado a que los tests pasen, así que **`next build` no corrió sobre el
delta en ningún lado salvo dentro de Vercel**, donde su fallo se ve como un
deployment fallido y no como un commit malo.

Consecuencia: la única puerta automática del repo lleva 24 horas abierta y nadie
se enteró — el modo de falla es exactamente el del `ignoreCommand` que
`CLAUDE.md` documenta («el push se ve normal en GitHub»), pero al revés: el push
se ve **rojo** en GitHub y el sitio se actualiza de todos modos. A las 3 a.m.,
"¿está probado lo que está en producción?" no tiene respuesta.

Causa raíz probable: el despliegue y la compuerta se decidieron con dos señales
distintas —el asunto del commit y el resultado de CI— y nadie las ató; sin
branch protection ni `required status check`, rojo y verde publican igual.

---

### [CRÍTICO] El piloto de visión opera portales fiscales y todo su camino de fallo se registra en `info`

`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:131,146,157,162,171,182,188,202`
· `facturacion/agente.ts:452` · `facturacion/al_vuelo.ts:456` ·
`src/lib/logger.ts:157`

`volar()` tiene **ocho salidas de fallo y ninguna escribe una línea de log**:
sin inventario (:131), captcha del DOM (:146), captcha declarado por el modelo
(:157), `no_puedo` (:162), la guardia de bucle (:171), el problema devuelto por
`ejecutar` (:182), los 14 pasos agotados (:188) y «terminó sin llenar un solo
campo» (:202). Las únicas cuatro llamadas al logger del archivo son :121
(`warn`), :153 (`info`), :206 (`error`, solo si algo *lanza*) y :255 (`info`).

Aguas arriba, el camino que el cron usa de verdad es el LOTE:
`cron/facturar/route.ts:591 correrLote` → `facturarLoteAlVuelo` →
`facturarLoteConAgente` → `unoPorUno` → `facturarConAgente`. Ahí:

- `agente.ts:452` → `logger.info('agente.facturacion', { tenant, comercio, modo, ok: r.ok })`
  — **info**, y **sin el `error`**: un `ok:false` y un `ok:true` producen la misma
  clase de línea.
- `al_vuelo.ts:456` → `logger.info('autofactura.lote', { … facturados, bloqueados })`
  — **info**.
- El único `logger.warn('autofactura.fallo', { gastoId, error })` está en
  `al_vuelo.ts:283`, dentro de `facturarAlVuelo` (UN ticket), que el cron solo
  usa para los tickets **sin** portal operable (`route.ts:490` y `:526`).

Y `logger.ts:157` es explícito: a Sentry solo van `warn` y `error`.

Escenario con valores, `FACTURACION_PILOTO=si`. Flota T, ticket de una
gasolinera con ficha completa, gasto `a1b2…`, $2,430.00. El portal cambió su
formulario; en el paso 3 el modelo devuelve `tipo:'no_puedo'` con motivo «pide
un código por SMS». Sale por :162. Lo que queda a la mañana siguiente:

- `piloto.paso` ×3, nivel `info`, con `{ comercio, paso, tipo, selector, veo }`
  — **sin `tenant` y sin `gastoId`**: no se puede saber de qué flota ni de qué
  ticket era;
- `agente.facturacion` `{ ok:false }`, `info`, sin el texto del error;
- `autofactura.lote` `{ facturados: 0 }`, `info`;
- Sentry: **nada** (ningún `warn`/`error` en toda la cadena);
- `ALERTA_EMAIL`: **nada** — `alertarOperador` sigue apareciendo solo en
  `src/app/api/cron/*` (verificado: 10 usos, todos ahí), y el `catch` del cron
  no se alcanza porque el piloto **no lanza**, devuelve `ok:false`;
- panel de Crons de Vercel: **200 verde**, `corrio: true`, `facturados: 0`;
- `agente_corrida`: `estado: 'ok'` para esa flota (`route.ts:723` deriva el
  estado de `corridas`, que solo se marca en fallo si revienta el navegador).

El gasto quedó sellado con `autofactura_intentada_en` (`al_vuelo.ts:463
reclamarIntentos`), así que vuelve a la cola y **se reintenta cada hora, para
siempre, pagando hasta 14 llamadas de visión cada vez**, en verde y en silencio.

El caso peor del mismo camino es fiscal: si el piloto llega a apretar el botón
que emite (ver el ALTO de la doble guarda, abajo), el CFDI existe ante el SAT,
`r.cfdiUuid` viene vacío y `al_vuelo.ts:283-290` emite
`logger.info('autofactura.ensayo', { gastoId, capturado })`. **Un CFDI
irreversible que Likida no registró, anunciado con un `info`.**

Consecuencia: el subsistema más nuevo y más arriesgado del producto es el único
sin una sola señal que salga del runtime log de Vercel. Los 12 tests de
`piloto_vision.test.ts` no mencionan `logger` ni una vez (0 coincidencias).

Causa raíz probable: el resultado se modeló como valor (`ResultadoAgente.error`)
y el nivel de log se heredó del camino de éxito; nadie decidió qué de eso merece
atención humana.

---

### [ALTO] `piloto.fallo` no lleva `tenant` ni `codigo`: un solo issue de Sentry para 20 portales y todas las flotas, para siempre

`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:206` ·
`src/lib/observability/sentry.ts:161-169` y `:198`
(REINCIDENTE — extiende el MEDIO «el `codigo` estable nunca llegó al camino del
dinero» de la ronda 18, ahora sobre código nuevo.)

```ts
logger.error('piloto.fallo', { comercio: op.comercio.clave, error });
```

`discriminadores()` lee `meta.tenant`/`meta.tenantId` y `meta.codigo`/`meta.status`.
Aquí no hay ninguno de los cuatro → devuelve `[]` → el fingerprint es
`['piloto.fallo','error']`.

Escenario: con la palanca puesta hay **20 comercios pilotables** (medido:
`COMERCIOS` = 37, con ficha completa y sin adaptador escrito = 20, de los cuales
10 piden cuenta). La primera vez que un `page.goto` da timeout contra
`facturacion.lagas.com.mx` nace el issue y Sentry notifica. A partir de ahí,
Chromium reventando en OTRO portal, de OTRA flota, por OTRA causa —un
`TypeError` de `evaluate`, un `Target closed`— cae en el mismo issue viejo y
**no vuelve a notificar nunca**. En Sentry hay un contador que sube; en el correo,
nada.

Consecuencia: la lección OP-A1 que `sentry.ts:139-146` documenta con nombre y
fecha («los ~216 fallos del cron fueron UN solo issue y UNA notificación») se
repitió, palabra por palabra, en el archivo escrito ayer. El mecanismo que la
arregla —`codigoDeError` + `tenant` en el meta— existe, está probado y no se usó.

Causa raíz probable: `codigoDeError` se aplicó como si fuera «cosa de crons» y
no como la regla de todo `logger.error` del camino del dinero.

---

### [ALTO] La captura —la evidencia declarada del ensayo— no se persiste en ningún lado

`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:31-38` y `:191-203` ·
`src/app/api/cron/facturar/route.ts:228-254` y `:596-602`

La regla 1 del piloto dice, textual: «Llena el formulario, **captura la
pantalla** y se detiene ANTES de cualquier botón que cree el CFDI», y el system
prompt (:329) le promete al modelo que «una persona revisa la pantalla». El
comentario de `sinCapturas` (:228-232) lo repite: «en `ensayo` la captura es la
ÚNICA evidencia de qué se habría enviado». Nadie la guarda.

El rastro completo de un `Buffer` de JPEG:
`capturaSegura()` → `ResultadoAgente.captura` → `al_vuelo.ts:467` →
`Renglon.captura` → `sinCapturas(resultados, req)` → JSON de la respuesta HTTP.
No hay `insert`, ni subida a storage, ni columna: `grep captura` sobre
`al_vuelo.ts` da 11 coincidencias y ninguna escribe; en
`src/app/dashboard/agentes/facturas/*` la palabra solo aparece como verbo
(«capturar el folio»), nunca como imagen.

Escenario, producción: `LIKIDA_CAPTURAS_DIR` **no se pone en Vercel** a propósito
(`route.ts:596-598`: «`/tmp` no sobrevive a la invocación»), así que `captura` es
un data-uri. `sinCapturas` lo recorta salvo con `?captura=1`. El llamador es el
scheduler de Vercel (o el callback de QStash, `cola/route.ts`), que descarta el
cuerpo de la respuesta. Resultado: se gastó una captura por paso —hasta 14 por
ticket, ~120 KB cada una según el propio comentario— y **la imagen no existe en
ninguna parte cinco segundos después**.

Consecuencia: la única forma de saber si el piloto escribió el RFC en el campo
del RFC o en el del folio es mirar la pantalla, y no hay pantalla que mirar. Un
ensayo termina diciendo lo mismo que decía antes de que existiera la captura:
que ningún selector reventó.

Causa raíz probable: la captura se diseñó como campo de retorno para un humano
que llama a la ruta a mano, y el llamador real es una máquina que tira la
respuesta.

---

### [ALTO] La «doble guarda» que impide emitir se apaga sola en `<input type=submit>`, y su apagado no deja rastro

`src/lib/likida/facturacion/adaptadores/pagina_playwright.ts:827` ·
`piloto_vision.ts:254-257` y `:36-38`

El encabezado del piloto declara la guarda como no negociable: «el modelo declara
`esBotonQueEmite` **Y** el piloto veta por texto del botón
(emitir/generar/timbrar/facturar); cualquiera de las dos detiene». El veto por
texto lee `boton?.texto` del inventario, y el inventario lo arma así:

```ts
texto: (el.textContent ?? (el as HTMLInputElement).value ?? '').trim().slice(0, 60),
```

`Element.textContent` devuelve **cadena vacía**, no `null`, para un elemento sin
hijos. `<input>` es un elemento vacío. Así que `'' ?? el.value` evalúa a `''`:
el `??` **nunca cae al `value`** para los botones que son `<input type=submit>` o
`<input type=button>` —los dos que el selector de :826 recoge a propósito—.

Escenario: portal con `<input type="submit" id="btnGenerar" value="Generar CFDI">`.
El inventario lo entrega como `{ id: 'btnGenerar', texto: '' }`. El modelo,
paso 7, elige `#btnGenerar` con `esBotonQueEmite: false` (se equivoca; es lo que
hacen los modelos). En `:254` se evalúa
`false || HUELE_A_EMITIR.test('') || HUELE_A_EMITIR.test('#btnGenerar')` →
`false || false || false`. **El piloto hace clic y timbra un CFDI real.**

Consecuencia operativa —que es lo que me toca—: no hay forma de distinguir por
el log un portal donde la guarda funciona de uno donde está muerta.
`piloto.detenido_antes_de_emitir` (`:255`, y de nivel `info`) simplemente **no se
emite**, y su ausencia se lee igual que «ese portal no llegó al botón». Los dos
casos producen exactamente las mismas líneas.

Causa raíz probable: `??` en vez de `||` sobre una propiedad del DOM cuyo valor
por defecto es `''` y no nulo — y una guarda declarada doble que en la mitad de
los botones del web es simple.

---

### [ALTO] El aviso de facturación convierte una condición esperada en `logger.error` a Sentry, sobre un `msg` que comparten 42 llamadores

`src/lib/likida/facturacion/avisar.ts:157-170` · `src/lib/meta/client.ts:129-139`

El delta cambió el orden: primero `sendText` (texto rico con la liga y los
campos), y si falla, `sendTemplate`. El propio comentario del cambio dice por
qué va a fallar: «El texto libre solo lo entrega WhatsApp dentro de la ventana de
24 h desde el último mensaje del destinatario. **Fuera de ella Meta lo rechaza
(131047)** y ahí entra la plantilla».

Pero `sendText` no distingue lo esperado de lo roto: `client.ts:137` emite
`logger.error('wa.sendText', { para, status, codigo, body })` en cualquier
`!res.ok`, y `logger.ts:157` manda todo `error` a Sentry.

Escenario: el cron `facturar` corre a las 00:30, 01:30, 02:30… Cada corrida con
tickets bloqueados llama a `avisarPorFacturar` una vez por flota
(`route.ts:660`). El encargado de la flota T no le escribió al bot desde
anteayer, así que la ventana está cerrada: `sendText` devuelve `null` **después
de escribir una línea de error y disparar un evento a Sentry**, y el aviso sale
correctamente por plantilla. `enviado: true`, `via: 'plantilla'`. Todo funcionó
como se diseñó, y quedó registrado como un error de envío de WhatsApp.

Consecuencia: `wa.sendText` es el `msg` que comparten **42 llamadores** fuera de
`meta/client.ts` —incluidas todas las respuestas al chofer en `processor.ts`—.
Convertirlo en ruido diario y previsible es enseñar a saltarse la única línea que
dice «un mensaje al chofer no salió». Es el mismo daño que el silencio, por el
otro lado.

Causa raíz probable: el fallback se construyó sobre una función que ya trataba
todo `!res.ok` como incidente, y no se le dio forma de decir «este rechazo lo
esperaba».

---

### [MEDIO] `supabase/verificaciones.sql` no sabe que existen las migraciones 0140–0143

`supabase/verificaciones.sql:5381` (último bloque, el 110) ·
`supabase/migrations/0142_…sql:23` y `0143_…sql:24`

El archivo termina en «── 110. Un duplicado marcado no puede esconder la fila
buena (mig. 0139)». Las cuatro migraciones del delta no tienen bloque ni
exención — es lo que tiene el CI en rojo (ver el CRÍTICO), pero el hueco sigue
abierto aunque el CI se arregle poniéndolas en `EXENTAS`.

Escenario: 0142 y 0143 hacen `alter table public.prospecto drop column if exists
necesidad_pct;` seguido de `add column necesidad_pct int generated always as
(…) stored`. Sobre 32,890 filas eso es un reescrito de tabla con `ACCESS
EXCLUSIVE`, dos veces el mismo día. Si `supabase db push` se corre sobre una base
donde 0143 ya se aplicó y 0142 se replica por cualquier razón (restauración
parcial, rama, `db reset` a medias), el `drop … if exists` no protesta y la
columna vuelve **a la fórmula vieja** — la que sumaba +50 a «Analista de
Liquidaciones de Pagos». `/admin/mapa-prospectos` seguiría ordenando por
`necesidad_pct desc` sin que nada avise, porque nadie comprueba la fórmula
contra Postgres: `ci-postgres.yml` corre `verificaciones.sql`, y
`verificaciones.sql` no la nombra.

Consecuencia: la única comprobación post-despliegue que se hace contra una base
real es ciega a las cuatro migraciones más recientes, incluida la que define una
cifra por la que se ordena una pantalla.

Causa raíz probable: la guardia de cobertura es una prueba que se puede dejar en
rojo, y el rojo no impide publicar (ver el CRÍTICO).

---

### [MEDIO] Las 8–14 llamadas de visión del piloto nunca llaman `registrarCosto`

`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:364-374` ·
`src/lib/llm/models.ts:124` · `src/lib/likida/costos.ts:115`

```ts
const { data } = await generateStructured<AccionPiloto>({ role: 'piloto', … });
```

Se desestructura `data` y se tira el `usage`. `grep -rn registrarCosto src/`
sobre no-tests da 8 llamadores: `processor.ts` (×5), `costos.ts`,
`api/dashboard/chat/route.ts` (×2). El piloto no está.

Escenario, con los precios que el propio `models.ts:124` anota
(`anthropic/claude-sonnet-5`, $2/$10 por millón): un portal de 10 pasos con una
captura JPEG y el inventario por paso ronda los $0.15–$0.20 por ticket. Ocho
tickets por corrida, 24 corridas al día. Nada de eso escribe fila en
`llm_costo`, así que `/admin` (Costo de IA) enseña el gasto de OCR y cuadre y
**cero** por el camino que puede costar más que todos los demás juntos —el
propio `agente.ts:23-29` calculó ese riesgo antes de escribir el piloto.

Consecuencia para mi rubro, más allá del dinero: `llm_costo` es la ÚNICA tabla
que habría atado una corrida del piloto a un `tenantId` y una fase. Sin ella no
queda ninguna fila en base que diga que el piloto corrió, para quién y cuánto
tardó; solo líneas `info` en el runtime log de Vercel, sin tenant.

Causa raíz probable: `generateStructured` devuelve el `usage` pero no obliga a
consumirlo, y el llamador nuevo no heredó la disciplina de `processor.ts`.

---

### [MEDIO] «Credencial mala» y «portal caído» no se distinguen, no se registran y no se escriben de vuelta

`src/lib/likida/conectores/portales_facturacion.ts:111-119` ·
`src/lib/likida/facturacion/cuentas.ts:26-31` y `:66-95`

`probar()` de los conectores de portal nunca llama a nada: valida que los campos
estén y devuelve `sinApiQueProbar(...)`. El comentario de `cuentasCompartidas`
lo asume por diseño: «la prueba real de una cuenta de portal ES el intento del
agente… Si al entrar no sirve, el resultado del intento lo dice y el ticket sale
por `bloqueado`». **Ese cierre del lazo no existe.**

Escenario con valores. La flota T guarda en `/dashboard/conexiones` su cuenta de
La Gas; el usuario tecleó la contraseña vieja. Con `FACTURACION_PILOTO=si`, el
cron registra el piloto (`registro.ts:253`) porque hay credencial. El piloto
entra, escribe `«USUARIO»`/`«CONTRASEÑA»` sustituidos, hace clic en Entrar, y en
el paso 4 el modelo ve «Usuario o contraseña incorrectos» y devuelve
`no_puedo`. Sale por `piloto_vision.ts:162`, sin log.

Lo que NO pasa: no se escribe `conector_credencial.probada_en`, no se pone
`activo=false`, no se emite ningún `warn`, y `motivoDeBloqueo(r)` no marca nada
(no es CAPTCHA ni emisión sin confirmar), así que el gasto **no** sale de la cola
automática y `enrutar()` lo sigue viendo como `cuentaCompartida = true` — es
decir, **sigue sin avisarle al encargado**, porque `avisar.ts` solo manda lo que
va por `via: 'mensaje'`.

El mismo `no_puedo`, con el mismo cero rastro, es lo que devuelve el piloto si el
portal está caído y la página de error no tiene formulario. Desde fuera son
idénticos, y sus arreglos son opuestos: uno es «recaptura tu contraseña», el otro
es «espera».

Consecuencia: una credencial mala deja el ticket girando en la cola, invisible
para la máquina y para la persona, hasta que venza el plazo fiscal (7–15 días en
gasolineras).

Causa raíz probable: el veredicto del intento real —el único que este diseño
acepta como prueba de una credencial— no tiene camino de vuelta al cofre.

---

### [MEDIO] `DEPLOY.md` no nombra `FACTURACION_PILOTO` ni `FACTURACION_MODO`

`.env.example:290-309` · `docs/conocimiento/DEPLOY.md` ·
`src/lib/observability/runbook.test.ts:104-109`
(REINCIDENTE — misma forma que el ALTO del runbook de la ronda 18, sobre las
palancas nuevas.)

`grep -n "FACTURACION_PILOTO\|FACTURACION_MODO" docs/conocimiento/DEPLOY.md` →
**cero**. `.env.example` sí las documenta con 20 líneas cada una.

Escenario, 3 a.m.: el cron `facturar` devuelve `facturados: 0` corrida tras
corrida. Quien esté de guardia abre `DEPLOY.md`, que es el documento que este
repo declara como el de las 3 a.m., y no encuentra ninguna de las dos palancas
que deciden si el sistema factura algo. La respuesta —«el piloto está apagado y
por eso 20 de 37 portales van con el encargado»— vive en un `.env.example` que
nadie abre en un incidente.

Y la guardia contra esta deriva sigue cerrada en falso:
`runbook.test.ts:106` itera sobre el literal `['SENTRY_DSN', 'DEMO_TENANT_ID']`,
no sobre `SILENCIOSAS`, así que ninguna variable nueva puede hacerla fallar. Sin
tocar, un día después de que la reporté.

Consecuencia: el runbook describe un sistema con menos palancas de las que tiene,
y la prueba que promete impedirlo no puede notarlo.

---

## Estado de los hallazgos abiertos de la ronda 18

| Hallazgo (ronda 18) | Estado hoy |
|---|---|
| **[ALTO]** El sondeo de arranque borra el mutex de un viaje real | **CERRADO.** `startup.ts:65-76` ahora usa el retorno: `const { data: locked, … }` y `if (locked === true) await admin.rpc('unlock_viaje', …)`. El comentario cita el escenario. Verificado leyendo el diff. |
| **[ALTO]** El fail-closed del kill switch deja los cinco crons en verde y sin correo | **ABIERTO, sin cambios.** `facturar/route.ts:281-284` sigue devolviendo 200 (`warn`); `wa-pendientes/route.ts:66-69` sigue en `logger.info`, que ni llega a Sentry. |
| **[ALTO]** El runbook dice que el canal de alerta no existe, y su prueba de deriva no puede notarlo | **ABIERTO y PEOR.** `grep -rn ALERTA_EMAIL --include=*.md` sigue en cero; `runbook.test.ts:106` sigue con el literal de dos; y el delta agregó dos palancas más que el runbook tampoco nombra (ver el MEDIO de arriba). |
| **[MEDIO]** El `codigo` estable nunca llegó al camino del dinero | **ABIERTO y ampliado.** `grep -rn codigoDeError src/` sigue dando solo `api/cron/*`. El código nuevo (`piloto.fallo`) nació sin él. Promovido a ALTO arriba por el número de portales y flotas que colapsa. |
| **[MEDIO]** `cron/runner` es el único cron sin correo ni código de causa | **ABIERTO.** `runner/route.ts:42` sigue con `logger.error('cron.runner.fallo', { err })` a secas. |
| **[MEDIO]** `npm install` depende de `cdn.sheetjs.com` | **ABIERTO.** `package.json:45` sin cambios. |
| **[MEDIO]** El diagnóstico de configuración está apagado en `npm run dev` | **ABIERTO.** `arranque.ts:65-66` sigue con `if (!desplegado) return;`. |
| **[MEDIO]** `/api/health` no tiene consumidor | **ABIERTO.** Las únicas referencias en el repo siguen siendo la ruta, su prueba y un comentario de `runbook.test.ts:24`. |
| **[BAJO]** El arranque bloquea la primera petición con hasta 10 s de red externa | **ABIERTO.** `instrumentation.ts` sin cambios en el delta. |

## Lo que revisé y está bien

- **`startup.ts` — el arreglo es el correcto y está argumentado.** No se cambió
  `unlock_viaje` para que compruebe propiedad (que habría tocado el SQL de la
  0005): se usó el valor de retorno que ya estaba ahí, y el comentario deja
  escrito por qué el `p_ttl_ms: 1` hace innecesario el unlock. Es el arreglo
  chico y correcto, no el grande y arriesgado.
- **Las cuatro reglas del piloto están bien elegidas, y tres de ellas están bien
  construidas.** Que la contraseña no viaje al modelo (`resolverValor`, :291-304:
  a `capturado` y al historial les llega el marcador, nunca el secreto), que un
  selector tenga que existir en el inventario (:282-288), y que el CAPTCHA sea de
  persona sin reintento, son decisiones de producto correctas y verificables en
  el código. La cuarta —el veto al botón que emite— es la que tiene el agujero
  del `??` (ALTO arriba).
- **`cuentas.ts` falla cerrado hacia la persona, y lo dice.** Base caída o cofre
  sin configurar → `Set` vacío → el ticket va con el encargado. Y una fila que no
  descifra se salta con `logger.error('facturacion.credencial_no_descifra',
  { tenant, comercio })` — nivel correcto, con tenant, sin un byte del cifrado.
  Es el mejor log del delta.
- **`enrutar.ts` distingue tres motivos, no dos.** `sin_robot` («el hueco es
  NUESTRO») separado de `requiere_cuenta` («la sesión es tuya») y de `bloqueado`
  («lo intenté y no pude») es exactamente la distinción que hace accionable un
  aviso; y `mensajeParaEncargado:177-185` la traduce a tres frases distintas para
  el teléfono. `al_vuelo.ts:86-110` eliminó la doble opinión sobre quién factura
  un ticket, que era un fallo silencioso real.
- **`registro.ts:317-327` — `olvidarPortales` se extendió a los pilotables.** Un
  piloto vivo tras el lote lleva dentro la credencial y los datos fiscales de
  otra flota; el arreglo cubre el caso nuevo sin inventar un mecanismo nuevo.
- **`procesarLoteEnCola` conserva su disciplina de corte por reloj**
  (`MARGEN_LOTE_MS`, `sinTiempo`, `falloDeArranque` con 503 y sin sellar) y el
  `finally` que manda `avisarCorridasPorFlota` + `registrarCorrida` sigue en su
  sitio. El delta no lo tocó y no lo rompió.
- **`administracion.ts:122-152` + `saas/fiscal.ts:100-131`.** Extraer
  `validarDatosFiscales` para que el alta valide **antes** del insert cierra un
  fallo silencioso real («toda flota nueva nacía sin poder facturar y nada lo
  decía») con un solo validador en vez de dos copias. Bien hecho y bien
  argumentado.
- **`identificar.ts`** — el bug del dominio de red vs franquicia se arregló con
  «gana el más específico» y el comentario nombra el ticket real, la fecha y por
  qué la prueba anterior no podía cazarlo.

## Lo que NO alcancé a revisar

- **Si `SENTRY_DSN` y `ALERTA_EMAIL` están de verdad en el entorno de Vercel.**
  Sigue siendo la primera cosa que comprobaría, y sigue sin `vercel env ls` desde
  aquí. Todo este rubro se apoya en «si el DSN está puesto».
- **Si `FACTURACION_PILOTO` está puesta en producción.** El CRÍTICO 2 y tres de
  los ALTO cambian de urgencia según eso. El default del código es apagado.
- **`pagina_playwright.ts` completo** (1,181 líneas): leí `inventario()` y el
  contrato, no `acotar()`, ni los topes por operación, ni `conNavegador` de punta
  a punta.
- **`cron/facturar/cola/route.ts`** (la ruta de QStash): leí su verificación de
  firma y su kill switch, no el camino completo de reintentos de QStash (2
  reintentos sobre 5xx) contra el sellado de `autofactura_intentada_en`.
- **Si `verificaciones.sql` sigue verde contra Postgres real.** `ci-postgres.yml`
  es un workflow aparte del que fallé en revisar el estado; solo miré `ci.yml`.
- **`processor.ts` de punta a punta.** Miré el delta (`atenderTextoOficina`, el
  camino del dueño que maneja, la libreta de ráfaga) buscando logs y alertas, no
  la corrección del flujo — eso es del auditor agéntico.
- **La retención real de los runtime logs del plan Pro y si hay log drain.**
  Sigue declarado como pendiente en `DEPLOY.md:152-153` desde hace rondas, y es
  lo que decide si «queda en el log de Vercel» significa algo a la mañana
  siguiente.
- **`.latido-salud`** sigue fechado el 10-ago (11 días). No lo perseguí.
