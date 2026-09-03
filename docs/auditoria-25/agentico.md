# Sistema agéntico y orquestación — auditoría 25

**Nota: 5/10** (antes 4 en la primera pasada de esta misma ronda; 5 en la 24).
Razón del movimiento: **se atacó y subió** — el CRÍTICO se cerró de verdad en las
tres salidas que se le señalaron, con pruebas que caen al revertir. Sube UN punto
y no más porque el arreglo se hizo sobre la LISTA del hallazgo y no sobre su
PREGUNTA, y por esa misma costura aparecieron **dos salidas más de la misma
clase** que nadie había mirado —`usuariosAvisables` y `correoDeFacturacion`,
ahora por correo—, una de las cuales le sigue mandando al ex-contador **los CFDI
de la flota**, que es literalmente el daño que la preámbulo de la 0294 dice haber
venido a cerrar. Y los ocho hallazgos restantes de la primera pasada siguen sin
tocarse, verbatim.

Riesgo mayor hoy: ya no es WhatsApp. Es que la flota da de baja a su contador, el
panel y la RLS lo echan, el WhatsApp por fin lo echa también… y el portal de
facturación **le sigue poniendo su correo como receptor del CFDI**
(`facturacion/flota_fiscal.ts:106-121`).

---

## Reauditoría tras el arreglo 24ce4c2

Relanzamiento acotado. Se auditó el commit `24ce4c2`
(*fix(agentes): AGEN-C1 — la baja tambien cierra las TRES salidas de WhatsApp*,
4 archivos, +111/−9) con ojo adversarial, y se recalificó el rubro entero a la
luz de lo que sigue abierto.

### 1. ¿Cierra las TRES salidas que el hallazgo nombraba?

**Sí, las tres.** Verificado con `git show 24ce4c2` y contra el fuente:

| Salida | Filtro en BASE | Filtro en TS |
|---|---|---|
| `telefonoParaDineroDe` | `contactos.ts:153` `.or('activo.is.null,activo.eq.true')` | `:157` `f.activo !== false` |
| `telefonosJefe` | `contactos.ts:189` | `:202` |
| `telefonoDeRol` | `asistencia_escalamiento.ts:118` | `:122` `.find(f => f.activo !== false)` |

Las tres suman `activo` al `select` (`:150`, `:186`, `:116`), que es lo que hace
falta para que la capa de TS tenga qué mirar. La doble capa está bien razonada
en `telefonoDeRol`: el `.limit(1)` de `:119` cuenta filas del SERVIDOR, así que
sin el filtro de la base una fila de baja se lleva el cupo y el filtro de TS
convertiría el 🚨 en un `null` — silencio en vez de destinatario equivocado.

**No quedó una cuarta puerta de WhatsApp.** `grep -rn "from('app_user')" src/`
devuelve 34 consultas; solo cuatro piden `telefono`, y son exactamente
`contactos.ts:72,149,185` y `asistencia_escalamiento.ts:116` — las cuatro ya
filtran. Por el canal de WhatsApp, la baja quedó cerrada de entrada y de salida.

### 2. La CUARTA y la QUINTA salida: nadie las vio, y no son de WhatsApp

Aquí es donde el arreglo se queda corto, y es un hallazgo nuevo. La pregunta que
el hallazgo de la 24 hacía era «¿quién resuelve un destinatario desde
`app_user`?». Contestada sobre `telefono` da tres funciones; contestada sobre
`email` da **dos más, ninguna filtrada**. Ver el hallazgo `[ALTO]` nuevo abajo.

- `src/lib/likida/agentes/notificaciones.ts:705-711` (`usuariosAvisables`)
- `src/lib/likida/facturacion/flota_fiscal.ts:106-121` (`correoDeFacturacion`)

Comprobado que ninguno de los dos archivos menciona `activo`:
`grep -rn "activo" src/lib/likida/agentes/notificaciones.ts
src/lib/likida/facturacion/flota_fiscal.ts src/lib/likida/portal_pago_aviso.ts`
→ **cero resultados**.

### 3. ¿Las pruebas prueban algo? — Sí la mitad de TS; **no** la mitad de la base

Base verde: `npx vitest run src/lib/likida/contactos.test.ts
src/lib/likida/asistencia_escalamiento.test.ts` → **31/31** en 840 ms.

**Experimento A — revertir `contactos.ts` al padre:**
`git checkout 24ce4c2^ -- src/lib/likida/contactos.ts` → **4 fallan / 10 pasan**.
Coincide con lo que declara el commit. La quinta (`sigue funcionando con la
columna ausente`) pasa con y sin el arreglo: es una prueba de no-regresión, no de
la corrección — legítimo, pero conviene saber que 4, no 5, defienden el arreglo.

**Experimento B — revertir `asistencia_escalamiento.ts` al padre:**
→ **1 falla / 16 pasan**, exactamente como dice el commit
(`nivel 2 NO va al dueño dado de baja`, `:196-200`).

**Experimento C (el que importa) — borrar SOLO el filtro de la base, dejando el
de TS:**
`sed -i "/\.or('activo.is.null,activo.eq.true')/d" src/lib/likida/contactos.ts
src/lib/likida/asistencia_escalamiento.ts` — quita las CUATRO
(las tres de este arreglo **y la de `resolverCuentaOficina` que puso la 24) →
**31/31 pasan**. Verde.

O sea: **la mitad del arreglo cuyo razonamiento está escrito con más cuidado es
la mitad que ninguna prueba puede defender**, ni en este arreglo ni en el de la
24. Los dobles lo declaran en un comentario honesto
(`contactos.test.ts:14-16`, `asistencia_escalamiento.test.ts:41-45`: «el doble
devuelve la misma fila con o sin el encadenado»), pero declararlo no lo cubre, y
el repo tiene 20+ pruebas que leen el fuente con `readFileSync` para exactamente
esto (`embeds_con_alias.test.ts`, `limite_con_orden.test.ts`,
`acotada_guardiana.test.ts`…). Ver el hallazgo `[MEDIO]` nuevo abajo.

Árbol restaurado con `git checkout HEAD -- <archivo>` después de cada
experimento; `git status --short` vacío.

### 4. ¿El arreglo rompió algo? — No, y se comprobó en los dos casos difíciles

**Caso «la flota cuyo único contacto quedó de baja»: falla fuerte, no en
silencio.** Verificado en los dos consumidores que importan:

- Cierre de liquidación: `avisar_cierre.ts:120-125` — sin teléfono se escribe
  `logger.error('cierre.sin_telefono_de_jefe')`, con el comentario explicando
  por qué es ERROR y no WARN. Antes del arreglo llegaba al ex-empleado; ahora no
  llega a nadie **y se grita**. Es el desenlace correcto.
- Emergencia: `asistencia_escalamiento.ts:303-310` — `alertarOperador(
  'asistencia.escalamiento', … 'aviso_escalada_fallido')` se dispara con
  `!avisado` por CUALQUIER motivo, incluido «no había a quién». Y el nivel 2+ ya
  cae al jefe cuando el dueño no sirve (`:289`), que es justo lo que la prueba
  nueva ejerce. El 🚨 no se pierde: cambia de destinatario o despierta a Likida.

**Caso «base sin la 0294» (`activo` NULL): la tranquilidad que da el commit no
es la que se puede dar.** La 0294 declara
`alter table public.app_user add column if not exists activo boolean not null
default true` (`0294_app_user_activo_y_sesiones.sql:47`). Con eso:

- **Aplicada la 0294**, `activo` NUNCA es NULL — la rama `activo.is.null` del
  `.or()` y el `!== false` de TS son cinturón sobre tirantes, correctos pero
  muertos.
- **Sin la 0294**, la columna no existe, así que `select('rol, telefono,
  activo')` no devuelve filas sin la llave: PostgREST responde 42703 y las tres
  funciones **lanzan**. No «siguen recibiendo sus avisos», como dice el cuerpo
  del commit: se quedan sin ninguno.

La prueba `telefonoParaDineroDe sigue funcionando con la columna ausente (base
sin la 0294)` (`contactos.test.ts:143-146`) modela una fila cuyo objeto no trae
la llave — un estado que ninguna base real produce. Radio de daño acotado, y por
eso es BAJO y no más: la compuerta de despliegue
(`scripts/ci/compuerta-deploy.mjs`) se niega a construir si la base va atrás de
`supabase/migrations`, y el camino de emergencia atrapa el throw y alerta igual
(`asistencia_escalamiento.ts:292-294` → `:303`). Pero la misma property la
heredó `resolverCuentaOficina` desde la 24, así que son cuatro consultas del
camino caliente del webhook con el mismo supuesto sin comprobar.

**Regresión en consumidores: ninguna.** `npx vitest run avisar_cierre.test.ts
talacha_wa.test.ts asistencia_wa.test.ts carta_porte_wa.test.ts
escalar_viaje.test.ts relojes_legales.test.ts cierre_aviso.test.ts
admin_comandos_wa.test.ts` → **262/262 verdes**.

### 5. Lo que sigue abierto de la primera pasada

Comprobado archivo por archivo con `git log -1 -- <archivo>`: **ninguno de los
ocho hallazgos restantes se tocó.**

| Hallazgo | Archivo | Último commit |
|---|---|---|
| ALTO · resumen de ráfaga cuenta copias | `processor.ts:2930-2945` | `b8a1a3a` (2-sep) |
| ALTO · «tu jefe ya tiene la solicitud» | `talacha_wa.ts:243,275` | `b9678a7` (29-ago) |
| MEDIO · prompt «páginas en reconstrucción» | `agents/prompts.ts:24` | `b9678a7` (29-ago) |
| MEDIO · sello sobre PDF fallido | `processor.ts:4326-4338` | `b8a1a3a` |
| MEDIO · `prompt_ref` NULL y deuda impagable | `agentes/backoffice.ts` | `5180c72` (2-sep) |
| MEDIO · `?tenant=` inválido + superadmin | `chat/tenant.ts:24-42` | `66339d5` (2-sep) |
| MEDIO · sondeo que inserta un `tenant` | `startup.ts:230-250` | `b9678a7` |
| BAJO · `graduarAgente` sin llamador | `agentes/definiciones.ts` | `5180c72` |

Los dos ALTO se releyeron contra el fuente hoy y están **idénticos**:
`processor.ts:2930-2931` sigue con `getGastos` + `reduce` crudos y `:2942` sigue
diciendo `llevo *${puestos.length} comprobantes*`; `talacha_wa.ts:243` sigue
afirmando «tu jefe tiene la solicitud» con `cambios` vacío.

### 6. Nota final: **5/10** — se atacó y subió

Sube un punto, no dos. Lo que justifica el punto: el CRÍTICO está cerrado de
verdad —dos capas, comentarios que explican el porqué de cada una, y pruebas que
se caen cuando se revierte el código, comprobado a mano—, y el arreglo falla
FUERTE en el caso feo (nadie a quién avisar → `logger.error` y
`alertarOperador`), que es lo que este rubro premia.

Lo que le impide subir más: el arreglo se hizo, otra vez, sobre las líneas que el
hallazgo enumeraba en vez de sobre la pregunta que el hallazgo hacía. Es el mismo
patrón que la primera pasada le reprochó a `70dd5c6` —«se arregló el punto que el
escenario narraba primero y no la lista de funciones»— y por eso quedaron
`usuariosAvisables` y `correoDeFacturacion`, que responden la misma pregunta por
correo. Con el CRÍTICO cerrado el rubro carga hoy **3 ALTO** (los dos reincidentes
verbatim de la 24, más el nuevo), **6 MEDIO** y **3 BAJO**. Eso no es un 7.

---

## Hallazgos nuevos de la reauditoría

### [ALTO] La baja cerró las tres salidas de WhatsApp y dejó abiertas las dos de CORREO: al ex-contador le siguen llegando los CFDI de la flota
`src/lib/likida/facturacion/flota_fiscal.ts:106-121` (`correoDeFacturacion`) ·
`src/lib/likida/agentes/notificaciones.ts:699-717` (`usuariosAvisables`)

Misma causa raíz exacta que el CRÍTICO que `24ce4c2` acaba de cerrar
—`desactivarUsuario` (`usuarios_escritura.ts:191`) escribe `activo=false` y NO
borra la fila ni sus datos de contacto— y las dos consultas resuelven «a quién se
le escribe» desde `app_user` sin mirar `activo`. Solo que el dato de contacto
aquí es `email`, y por eso el barrido del arreglo (que buscó `telefono`) no las
tocó.

**`correoDeFacturacion` es la peor de las dos.** Su encabezado dice qué es:
«A qué dirección manda el portal el CFDI de esta flota», con la prioridad
`contador → flota_admin` (`:45`, `ROLES_QUE_RECIBEN`) y el razonamiento «el
contador primero porque es quien archiva el CFDI y quien lo va a cruzar contra su
papel» (`:29-31`). La consulta (`:107-113`) filtra `tenant_id` y `rol`, ordena
por `created_at` y toma 50 — **`activo` no aparece**. El correo elegido viaja a
`FlotaFiscal.correo` (`:87`), entra a `getFiscalDeFlota`, y de ahí al registro de
portales que consume el cron de facturación (`api/cron/facturar/lote.ts:431`).

Escenario, con valores: Innovativos cambia de despacho contable y da de baja a
Marisol, su `contador`, el 12-sep. `usuarios_escritura.ts:186` solo protege al
ÚNICO `flota_admin` activo — para `contador` no hay guarda, así que la baja pasa
limpia. El panel la echa, la RLS la echa, el ban de Auth le mata la cookie, y
desde `24ce4c2` el WhatsApp también la echa. El 13-sep corre el cron de
facturación: `getFiscalDeFlota('innovativos')` devuelve
`correo: 'marisol@despacho-anterior.mx'`, el portal timbra y **manda el CFDI de
Innovativos a la bandeja del despacho que ya no es su despacho** — con el RFC, la
razón social y el importe. Y el correo del receptor viaja DENTRO del comprobante:
no es solo una copia de más, es un dato del CFDI emitido.

Es, palabra por palabra, el daño que la propia 0294 dice haber venido a cerrar:
«el contador externo que dejó de trabajar con la flota … seguía descargando CFDI
y liquidaciones semanas después de que la flota cambió de despacho»
(`0294_app_user_activo_y_sesiones.sql:8-12`). La 0294 le cerró la descarga. Nadie
le cerró el envío.

**`usuariosAvisables` es la segunda, y tiene tres consumidores vivos.** La
consulta (`:705-711`) trae `id, nombre, email, rol` por `tenant_id`, ordena y
limita a 200 — sin `activo`. De ahí sale:

1. `notificaciones.ts:926` → `repartoDe(...)` → `enviarCorreo(reparto.reciben.map
   (d => d.email), correo)` (`:953`): las alarmas de los agentes de la flota.
   `repartoDe` (`:586-624`) filtra por rol, por config y por correo duplicado, y
   declara CADA exclusión con su porqué — pero «esta cuenta está dada de baja» no
   es una de las causas, porque la fila llega ya sin esa información.
2. `portal_pago_aviso.ts:108-120` → `avisarPropuestaAlContralor`: el aviso de una
   propuesta de PAGO, disparado desde `api/pago/registrar/route.ts:162`. Dinero.
3. `app/dashboard/agentes/seccion-notificaciones.tsx:49,81`: la pantalla que le
   enseña a la flota **a quién le llega**. Con esto, `/dashboard/usuarios` pinta
   a Marisol como «dada de baja» y `/dashboard/agentes` la pinta, dos clics más
   allá, en la lista de quién recibe. Dos rótulos del mismo panel que se
   contradicen sobre la misma persona — la regla que el producto declara como
   propia.

Consecuencia: la flota cree que la baja cierra todo porque el panel se lo dijo
textualmente («ya no entra al panel y su sesión quedó revocada»), y sigue
abierta la puerta por la que salen los comprobantes fiscales.

Causa raíz probable: el arreglo barrió por `telefono` porque el hallazgo nombraba
tres funciones de teléfono. La pregunta que había que barrer era «quién resuelve
un DESTINATARIO desde `app_user`», y esa incluye el correo.

---

### [MEDIO] La mitad del arreglo que carga el razonamiento —el filtro en la BASE— es la mitad que ninguna prueba puede defender
`src/lib/likida/contactos.test.ts:11-22` ·
`src/lib/likida/asistencia_escalamiento.test.ts:41-53`

Medido, no razonado: borrar las CUATRO llamadas
`.or('activo.is.null,activo.eq.true')` de `contactos.ts` y
`asistencia_escalamiento.ts` —las tres de `24ce4c2` **y la de
`resolverCuentaOficina` que puso la 24**— deja las 31 pruebas de los dos archivos
en verde. Los dobles encadenan `or` como identidad (`contactos.test.ts:17`,
`asistencia_escalamiento.test.ts:47`) y devuelven la tabla entera.

No es un descuido escondido: los dos archivos lo dicen en un comentario. Pero lo
que se declara sigue sin cubrirse, y la capa descubierta es precisamente la que
los comentarios del fuente justifican con más detalle: «el `.limit(1)` cuenta
filas del SERVIDOR, así que el filtro tiene que ir en la base o una fila de baja
se lleva el cupo y esconde a la viva» (`asistencia_escalamiento.ts:110-112`).

Escenario, con valores: alguien simplifica en tres meses —«el filtro de TS ya
hace esto, el `.or()` sobra»— y borra los cuatro. `npx vitest run` sigue verde,
`tsc` y `eslint` también, y la compuerta deja pasar. En producción, la flota con
dos `flota_admin` (uno de baja) hace que `telefonoDeRol` reciba del servidor
UNA fila —la de baja, porque `.limit(1)` sin `.order()` no promete cuál— el
filtro de TS la descarta, devuelve `null`, y el 🚨 de nivel 2 cae al jefe o
—si tampoco hay— se convierte en un `alertarOperador`. La regresión no la ve
nadie hasta que hay una emergencia.

El repo ya tiene el idioma para esto: 20+ pruebas leen el fuente con
`readFileSync` y afirman sobre la FORMA de la consulta
(`embeds_con_alias.test.ts` compara cadenas de `.select(...)` literales;
`limite_con_orden.test.ts` exige `.order()` junto a cada `.limit()`). Una prueba
que exija `activo` en el `select` y `or('activo.is.null,activo.eq.true')` en cada
una de las cuatro consultas de `app_user` que resuelven destinatario cuesta
veinte líneas y cierra las dos capas.

---

### [BAJO] La prueba «base sin la 0294» no puede fallar, porque modela un estado que ninguna base produce
`src/lib/likida/contactos.test.ts:143-146` ·
`supabase/migrations/0294_app_user_activo_y_sesiones.sql:47`

La 0294 crea la columna `not null default true`. Aplicada, `activo` nunca es
NULL: la rama `activo.is.null` del `.or()` y el `!== false` de TS no se ejercen
jamás. Sin aplicar, la columna no existe y `select('rol, telefono, activo')`
devuelve 42703 desde PostgREST, así que las tres funciones **lanzan** en vez de
degradar — lo contrario de lo que afirma el cuerpo de `24ce4c2` («una fila sin la
columna sigue recibiendo sus avisos»). La prueba, en cambio, alimenta al doble
con un objeto al que le falta la llave, que es un tercer estado que no ocurre.

Es defensa en profundidad barata y no hace daño; se anota porque la frase del
commit y el nombre de la prueba afirman una garantía que no está. El radio real
está acotado por dos cosas verificadas: la compuerta
(`scripts/ci/compuerta-deploy.mjs`) no construye si la base va atrás de
`supabase/migrations`, y el camino de emergencia atrapa el throw y alerta igual
(`asistencia_escalamiento.ts:292-294` → `:303-310`).

---

### [BAJO] El interruptor `duenoActivo` de la prueba nueva no se resetea en `beforeEach`: si su assert falla, contamina las 16 pruebas siguientes
`src/lib/likida/asistencia_escalamiento.test.ts:38,116-122,196-200`

`duenoActivo.valor = false` se pone en `:196` y se devuelve a `null` en `:200`,
**después** del `expect` de `:199`. El `beforeEach` de `:116-122` resetea el otro
interruptor del mismo doble (`telefonoDueno.mockResolvedValue('5210000000002')`,
`:122`) pero no éste. Si el assert de `:199` falla, el valor `false` se queda
puesto y toda prueba posterior del archivo que dependa del teléfono del dueño
enruta al jefe: una falla se convierte en una cascada, y la verdadera queda
sepultada. El propio archivo demuestra que el patrón correcto se conocía
(`telefonoDueno.mockResolvedValue(null)` en `:185` SÍ lo limpia el `beforeEach`).

---

### [BAJO] `telefonosJefe` no tiene techo de filas: PostgREST recorta a 1,000 en silencio y una flota desaparece del mapa
`src/lib/likida/contactos.ts:184-190`

La consulta no lleva `.limit()`, no pasa por `traerTodo()` y `acotada` es solo un
temporizador (`presupuesto.ts:219-240`), no un paginador. `escalar_viaje.ts:254`
la llama con **todos** los tenants que tienen viajes vencidos en una corrida. Con
más de 1,000 filas de `app_user` en el lote, PostgREST recorta sin avisar y las
flotas que quedaron fuera del corte salen del mapa como si no tuvieran contacto —
el modo de falla que el propio CLAUDE.md nombra («PostgREST recorta a 1,000 filas
en silencio»). Hoy es teórico (0 clientes), y por eso es BAJO; se anota porque el
arreglo acaba de añadirle una columna al `select` sin revisar el techo, y porque
el remedio ya existe en el repo y son dos líneas.

---

## Hallazgos de la primera pasada (íntegros)

> **Cabecera original de la primera pasada, conservada tal cual se escribió**
> (la nota que encabeza este documento ya es la de la reauditoría):
>
> > **Nota: 4/10** (antes 5). Razón del movimiento: **mirada más profunda — el
> > código no cambió y la nota anterior estaba inflada.** La 24 subió a 5
> > apoyada en que su CRÍTICO (`app_user.activo` en el canal de WhatsApp)
> > quedaba cerrado. Está cerrado a la MITAD: el arreglo `70dd5c6` tapó la
> > puerta de ENTRADA (`resolverCuentaOficina`) y dejó abiertas las tres de
> > SALIDA que el propio texto del hallazgo de la 24 nombraba con línea y todo.
> > Y de los cinco hallazgos de la 24, **tres siguen abiertos verbatim** (los
> > dos ALTO y el MEDIO): ninguno se tocó, y el rubro no ha recibido un solo
> > commit desde `b8a1a3a`.
> >
> > Riesgo mayor hoy: la flota da de baja a su dueño/contador, el panel y la RLS
> > lo echan, y Likida **le sigue mandando por WhatsApp el PDF del contralor,
> > las cifras de cada cierre y la ubicación del chofer en un 🚨** — porque los
> > tres resolutores de "a qué número se le escribe" nunca miraron `activo`.

### [CERRADO por `24ce4c2` · era CRÍTICO] La baja de un usuario cierra el panel y el WhatsApp de ENTRADA, pero no el de SALIDA: se le sigue escribiendo al ex-empleado (REINCIDENTE, medio-arreglado en la 24)
`src/lib/likida/contactos.ts:141-154` (`telefonoParaDineroDe`) ·
`src/lib/likida/contactos.ts:168-195` (`telefonosJefe`) ·
`src/lib/likida/asistencia_escalamiento.ts:107-115` (`telefonoDeRol`)

> **Estado tras la reauditoría: CERRADO.** Las tres salidas filtran `activo` en
> la base y en TS (`contactos.ts:153,157`, `:189,202`,
> `asistencia_escalamiento.ts:118,122`), y las pruebas caen al revertir (4/5 y
> 1/17). El texto de abajo se conserva como quedó escrito. Lo que queda vivo de
> esta clase está arriba: las salidas por CORREO (`[ALTO]` nuevo) y el filtro de
> la base sin prueba (`[MEDIO]` nuevo).

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
