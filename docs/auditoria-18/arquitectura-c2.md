# Arquitectura y mantenibilidad — auditoría 18 · continuación 21-ago

**Nota: 4/10** (antes 5). Razón del movimiento: **deuda que cobró factura**, en
las dos advertencias vivas y en una tercera que el propio delta había cerrado
seis días antes. Las dos que estaban anotadas volvieron a ocurrir —la URL base
tiene un **octavo** sitio (`auth/reenvio_enlace.ts:98`) y el escritor
desalineado de `bitacora_auditoria` **se editó en este delta y salió igual de
desalineado**—, y el subsistema nuevo de facturación reabre, un parámetro más
allá, la misma asimetría que `decidirAutofactura` documenta haber cerrado
(«Dos opiniones sobre quién factura un mismo ticket», `al_vuelo.ts:97`). Sube
lo cerrado —el CRÍTICO del CFDI N:1 está muerto y anclado, y el validador
fiscal ganó dueño único—; baja más lo que se abrió: **una invariante escrita
en `despacho_wa.ts:26-28` dejó de ser cierta y nadie tocó ese archivo**.

El riesgo mayor del rubro hoy: **`(tenant_id, telefono)` de `wa_conversacion`
tiene ahora dos dueños con contratos opuestos** —uno hace `upsert` que
sobrescribe el `estado` entero, el otro hace `update` que sobrescribe el
`estado` entero— y desde `d432e89` los dos caen sobre la MISMA fila.

---

## Hallazgos

### [CRÍTICO] «El dueño que maneja» puso a dos módulos a pisarse la misma fila de `wa_conversacion`: el despacho se pierde y la conversación del chofer se borra

`src/lib/likida/processor.ts:721-768` (el bloque nuevo) ·
`src/lib/likida/despacho_wa.ts:80-90` (`guardarPendiente`) ·
`src/lib/likida/asignar_wa.ts:152-160` (idéntico) ·
`src/lib/likida/conv.ts:374-393` (`saveConversation`)

**Los dos lados, leídos.**

- `wa_conversacion` tiene **unique `(tenant_id, telefono)`**
  (`supabase/migrations/0005_concurrencia.sql:13-14`). Una fila por número, no dos.
- `despacho_wa.guardarPendiente` (`:81-90`) hace
  `upsert({ tenant_id, operador_id: null, telefono, viaje_id: null, estado: { viajePendiente } }, { onConflict: 'tenant_id,telefono' })`.
  Sobrescribe **el `estado` completo**, y de paso pone `viaje_id` y
  `operador_id` en `null`. `asignar_wa.ts:152-160` es el mismo `upsert` con
  otra llave (`asignacionPendiente`).
- `conv.saveConversation` (`:382-393`) hace lo contrario y con el mismo daño:
  `update({ estado: { turns, … }, viaje_id })`. **Reescribe el jsonb entero** —
  el propio processor lo dice en `:2659`: *«`saveConversation` las borraría
  (reescribe el jsonb entero)»*.
- Lo que mantenía a los dos separados estaba escrito, y es lo que el delta
  anuló: `despacho_wa.ts:26-28` — *«La fila de oficina jamás choca con la de un
  chofer: si el teléfono fuera de un operador, `resolveOperador` lo habría
  atrapado antes de llegar aquí.»* El bloque nuevo de `processor.ts:721` corre
  **exactamente cuando `resolveOperador` SÍ acertó** (`:717-722` lo dice: *«ya
  acertó, así que hasta aquí este mensaje era del chofer»*).
- `conv.ts:258-260` deja escrito por qué esto no se hace: *«No es un upsert
  porque el upsert PISARÍA el `estado` de la fila que ganó: sobrescribir con
  `{ turns: [] }` borra justamente el historial que se está tratando de
  conservar.»* Es el mismo razonamiento, en el archivo de al lado, contra el
  `upsert` que ahora sí cae encima.

**Escenario con valores.** Ramón es dueño de *Transportes del Bajío*, está en
`app_user` como `flota_admin` y en `operador` con el mismo teléfono
`5214771234567` (el caso que `contactos.ts` documenta como NORMAL y para el que
el delta se escribió). Trae abierto el viaje `VJ-2026-0311`.

1. **09:00** Ramón escribe *«nuevo viaje para Juan Pérez, Puebla a Monterrey,
   anticipo 8000»*. `resolveOperador` acierta → `getOpenViaje` = `VJ-2026-0311`
   → el bloque nuevo (`:740`, `:765`) llama `atenderTextoOficina` →
   `atenderDespachoOficina` → `interpretarPeticionViaje` casa →
   `guardarPendiente` (`despacho_wa.ts:333`) **hace el upsert sobre la fila de
   Ramón**. Resultado en base: `estado = { viajePendiente: {…} }`,
   `viaje_id = null`, `operador_id = null`. Sus `turns`,
   `intentosConfirmacion` y `cierreSinComprobantes` **ya no existen**. Bot:
   *«¿Confirmas? Juan Pérez, Puebla→Monterrey, $8,000»*.
2. **09:02** Ramón —que va manejando— fotografía el ticket de diésel. Sale
   oscuro, `decidirAcuse` pide refoto y `recordarPeticionDeFoto`
   (`processor.ts:373-388`) llama `saveConversation`, que escribe
   `estado = { turns: [...] }`. **`viajePendiente` desapareció.**
3. **09:05** Ramón contesta *«sí»*. `cargarPendiente` (`despacho_wa.ts:61-76`)
   lee `estado.viajePendiente` → `undefined` → `null`. **El viaje de Juan Pérez
   nunca se crea**, el anticipo de $8,000 nunca se registra, y ese *«sí»* baja a
   los reconocedores de abajo. Ramón vio un resumen y una confirmación aceptada;
   Juan Pérez nunca recibe su asignación.

El paso 1 ocurre **siempre**, sin interleaving: cada despacho del dueño que
maneja le borra su propio historial de conversación de ruta y deja
`viaje_id = null`, con lo que `desdeFila` (`conv.ts:300-303`) descarta los
turnos aunque el viaje siga abierto. Los pasos 2-3 solo necesitan que entre una
foto, un XML o un botón entre el resumen y el *«sí»* — es decir, que el dueño
haga lo que el producto le pide hacer.

**Intento de refutación (falló).** ¿La fila de oficina es otra? No: la unicidad
es `(tenant_id, telefono)` y el `onConflict` la nombra. ¿El mutex de viaje los
serializa? No: `guardarPendiente` corre antes de `acquireViajeLock` y las fotos
**no toman el mutex a propósito** (`processor.ts:362-363`). ¿Lo cubre el test
nuevo? `processor_dueno_maneja.test.ts:26` **mockea `despacho_wa` entero** y
`:48` mockea `saveConversation` con un `vi.fn()`: no puede ver la fila.

**Consecuencia.** El demo de esta funcionalidad —enseñarle a un contralor que
el dueño despacha desde el mismo WhatsApp por el que manda tickets— se rompe en
la sala, y el modo de falla es silencio: HTTP 200, cero errores en el log, un
viaje que no existe. Para quien mantenga esto, el archivo que hay que leer
(`despacho_wa.ts`) sigue afirmando por escrito que este caso no puede pasar.

**Causa raíz probable.** El delta borró una invariante que vivía como
comentario en dos módulos ajenos (`despacho_wa.ts:26-28`,
`asignar_wa.ts:24-32`) en vez de como código, y ninguno de los dos entró en el
diff.

---

### [ALTO] «Quién factura este ticket» vuelve a tener dos opiniones: el aviso al encargado no sabe de la cuenta compartida

`src/lib/likida/facturacion/avisar.ts:70` y `:98` ·
`src/lib/likida/facturacion/enrutar.ts:78` y `:106` ·
`src/lib/likida/facturacion/al_vuelo.ts:92-98`

**Los dos lados.** `enrutar(t, sabeOperarlo, cuentaCompartida = false)` es la
única fuente de verdad de quién factura, y su tercer parámetro es lo que el PR
#35 vino a agregar. Lo pasan:

- `al_vuelo.ts:232-243` (`facturarAlVuelo`) y `:411-420` (`facturarLoteAlVuelo`),
  vía `decidirAutofactura(…, conCuenta)` → `enrutar(t, tieneAdaptador, cuentaCompartida)`.

No lo pasa:

- `avisar.ts:70` → `repartir(tickets, sabeOperarlo)` — el tercer argumento de
  `repartir` (`enrutar.ts:199`) cae a su default `() => false`;
- `avisar.ts:98` → `enrutar(t, sabeOperarlo(...))` — dos argumentos, `cuentaCompartida`
  cae a `false`.

Y `enrutar.ts:106` mira `requiereCuenta && !cuentaCompartida` **antes** que
todo lo demás, así que con `false` el ticket sale por `requiere_cuenta` sin
llegar al resto de los filtros.

**Escenario con valores.** *Transportes del Bajío* comparte en
`/dashboard/conexiones` su cuenta de **OXXO Gas**
(`conector_credencial.conector_id = 'portal_facturacion:oxxo_gas'`, `activo = true`).
`FACTURACION_PILOTO=si`. Un ticket de OXXO Gas de $1,840 con sucursal, folio y
monto leídos, 20 días de plazo:

- **El cron** (`al_vuelo.ts:233`): `cuentasCompartidas` trae `oxxo_gas` →
  `conCuenta = true` → `enrutar(t, true, true)` → `via: 'automatico'` → el
  piloto entra al portal con la credencial.
- **El aviso** (`avisar.ts:98`): `enrutar(t, true)` → `cuentaCompartida = false`
  → `via: 'mensaje', motivo: 'requiere_cuenta'` → al encargado le llega, por
  WhatsApp: *«Falta la factura de un combustible — 20 días para facturar … Ese
  portal pide cuenta, por eso no se pudo hacer solo.»*

Son **10 comercios** con `requiereCuenta` y ficha completa —`oxxo_gas`, `g500`,
`petromax`, `red_estatal_autopistas`, `la_gas`, `pinfra`, `gorm_brentec`,
`iave`, `tag_pase`, `televia`— los que reciben este mensaje falso.

**Consecuencia.** La flota entrega su contraseña de portal precisamente para
dejar de recibir estos mensajes, y los sigue recibiendo con el motivo al revés.
El encargado va a buscar una cuenta que él mismo ya compartió, o —peor, con
`FACTURACION_MODO=emitir`— entra a facturar a mano el mismo ticket que el robot
está trabajando. El propio encabezado de `avisar.ts:61-64` promete lo
contrario: *«NO hay que avisarle de uno que el piloto va a intentar en la
siguiente corrida»*. `avisar.test.ts` no tiene un solo caso con cuenta
compartida.

**Causa raíz probable.** El parámetro se agregó con default (`= false`) en vez
de obligatorio; el mismo parámetro hermano (`sabeOperarlo`) se hizo obligatorio
a propósito *«y por eso rompe la compilación de quien no lo pase»*
(`enrutar.ts:56`), justo por este motivo.

---

### [ALTO] `portalesOperables()` responde una pregunta distinta de la que `enrutar` hace, y 10 comercios se quedan sin quien los facture y sin quien avise

`src/lib/likida/facturacion/adaptadores/registro.ts:194-198` ·
`src/lib/likida/facturacion/enrutar.ts:54` y `:138-140` ·
`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:31-38` y `:119-122` ·
`src/lib/likida/facturacion/al_vuelo.ts:282-289`

**Los dos lados.** El contrato de `sabeOperarlo` está escrito en
`enrutar.ts:54`: *«¿Hay un adaptador ESCRITO para el portal de este ticket?»*.
Es el dato que decide si el ticket va al robot o a una persona. El delta lo
alimenta con `portalesOperables()` (`avisar.ts:68`,
`route.ts` vía `adaptadorDe`), que con la palanca puesta devuelve
`PORTALES_CONOCIDOS` **más las 20 fichas pilotables**.

Pero el piloto **no puede terminar de facturar, por diseño y sin excepción**:
`piloto_vision.ts:31-38` («EL PILOTO NO EMITE. NUNCA, ni en modo `emitir`») y
`:119-122` normalizan el modo y siguen adelante sin apretar botón. `volar()`
devuelve `ok: true` sin `cfdiUuid` (`:194-203`), y en `al_vuelo.ts:282-289`
eso cae en la rama del ensayo exitoso: `facturado: false`, `cfdi_uuid` **sin
escribir**.

**Escenario con valores.** `FACTURACION_PILOTO=si`, `FACTURACION_MODO=emitir`,
mandato aceptado. Un ticket de **Enerser** (gasolineras Efigas/Palmira) de
$3,214, con el número de referencia leído —su único campo requerido,
`comercios.ts:132`— y 11 días de plazo. El portal permite *«continuar sin
registro»* (`comercios.ts:129`) y no hay pre-vuelo que le encuentre CAPTCHA:

- `enrutar(t, sabeOperarlo('enerser') = true, false)` → `via: 'automatico'`.
- `avisar.ts:74` solo mete en el mensaje los `mensajes` y los `incompletos`:
  **el ticket sale del aviso al encargado**.
- El cron lo toma, el piloto llena el formulario, se detiene, devuelve
  `ok: true` sin UUID. `getPorFacturar` (`pendientes.ts:126-137`) filtra por
  `cfdi_uuid is null` y nada lo selló: **el mismo ticket vuelve la hora
  siguiente**, y paga otras ~8-14 llamadas de visión a Sonnet 5
  (`llm/models.ts:123`), hasta que el plazo vence.
- Ese comprobante no se deduce nunca, y el encargado —que antes lo recibía por
  `sin_robot` con la liga y el WebID listos— jamás se entera.

Son **10 comercios** sin cuenta y con ficha completa los que cambian de camino
al encender la palanca: `enerser`, `gogas`, `libramientos_meta`, `oxxo`,
`office_depot`, `megasur`, `controlnet`, `ado`, `primera_plus`, `autozone`.

**Intento de refutación (parcial, y por eso el escenario cambió de comercio).**
El caso del CAPTCHA **sí se salva**: el piloto devuelve `requiereCaptcha`
(`piloto_vision.ts:143-149`), `motivoDeBloqueo` (`al_vuelo.ts:600-603`) lo
convierte en bloqueo, `bloquear()` lo sella y la corrida siguiente lo enruta por
`via: 'mensaje'`. Es exactamente el camino que `comercios.ts:389-397` documenta
para **Megasur**, cuyo pre-vuelo del 20-ago sí encontró reCAPTCHA — así que
Megasur, el comercio que `enrutar.ts:65-68` cita como el caso medido, queda
cubierto. Los que se pierden son los portales **sin** CAPTCHA, que son los que
el piloto sí puede llenar: ahí `ok: true` sin UUID es indistinguible de un
ensayo exitoso y el ticket no sale nunca de la cola. De los 10 sin cuenta solo
uno tiene pre-vuelo escrito; de los otros nueve no sabemos, y esa incertidumbre
es justo el problema: el diseño premia con silencio al portal que el piloto
logra llenar.

**Consecuencia.** El `sin_robot` que se creó el 20-ago para acabar con este
silencio (*«El silencio es el modo de falla que este repo persigue en todos
lados menos aquí»*, `enrutar.ts:68`) queda inalcanzable para 10 comercios en
cuanto se pone una variable de entorno que el propio `.env.example:290-309`
describe como una opción normal.

**Causa raíz probable.** `portalesOperables()` mezcla dos predicados que el
resto del subsistema separa con cuidado —«sé abrir este portal» y «puedo
cerrar la factura de este portal»— y `enrutar` solo tiene un hueco donde
enchufarlos.

---

### [ALTO] La URL base de la app: octavo sitio a mano · REINCIDENTE (ronda 18, ALTO 3)

`src/lib/auth/reenvio_enlace.ts:98`

`const base = process.env.NEXT_PUBLIC_APP_URL || 'https://app.likida.ai';` —
copia literal de `login/page.tsx:63` (`siteUrl()`), que existe para esto y no
se exporta. El módulo nuevo además **copia el rate-limit entero**: sus
`:89-91` (`x-forwarded-for` → `rateLimit('login:email:'+ip, 10, 5*60_000)`) son
la reimplementación de `login/page.tsx:76-80` (`dentroDelLimite`), con la misma
llave y los mismos números escritos otra vez.

El inventario, hoy: `login/page.tsx:63`, `correo/plantilla.ts:58`,
`correo/avisos.ts:28`, `observability/alerta.ts:49`,
`api/auth/correo/route.ts:161`, `dashboard/usuarios/page.tsx:98`,
`admin/vendedores/consola-vendedores.tsx:158` y **`auth/reenvio_enlace.ts:98`**
caen a `'https://app.likida.ai'`; `dashboard/suscripcion/page.tsx:192` cae a
`''`; `llm/openrouter.ts:31` a `'https://likida.ai'` (deliberado);
`processor.ts:694` a `'tu panel'`; `api/v1/openapi/route.ts:753` al `origin` de
la petición y `api/cron/facturar/route.ts:342` al `host` del header. **11
sitios, 5 valores distintos de suelo.**

**Escenario con valores.** Se levanta un preview de Vercel sin
`NEXT_PUBLIC_APP_URL` (el repo ya tiene alarma dedicada a ese estado exacto:
`observability/arranque.ts:44-46`). Un usuario abre un magic link caducado en
ese preview: `reenvio_enlace.ts:103` arma
`emailRedirectTo = https://app.likida.ai/auth/callback?next=/dashboard` — o
sea, **el reenvío automático lo saca del entorno en el que estaba** y lo manda
a producción, con una sesión que no es la que se estaba probando. Misma
variable ausente, y en la misma pantalla: `suscripcion/page.tsx:192` manda a
Stripe un `return_url` relativo que la API rechaza.

**Consecuencia.** Cada dominio o entorno nuevo sigue siendo un barrido manual
de 8 archivos donde olvidar uno no rompe el build ni un test. El barrido ya
salió mal una vez (17-ago, `login/page.tsx:53-58`), la ronda 18 lo anotó, y el
delta agregó una copia más.

**Causa raíz probable.** Sin cambio: `src/lib/env.ts` es un inventario
(`faltantes()`, `envHealth()`), no un accesor; no existe el punto único que
resuelva el valor, así que el módulo nuevo copió la expresión — y de paso el
rate-limit.

---

### [ALTO] `bitacora_auditoria`: el escritor desalineado se editó en este delta y salió igual de desalineado · REINCIDENTE (ronda 18, ALTO 2)

`src/lib/likida/facturacion/avisar.ts:175-181`

La ronda 18 marcó este `insert` exacto por decir `entidad: 'gasto'` con
`entidad_id: args.tenantId` (el uuid de la flota) y por ser el único de los 16
que no escribe ni `actor_id` ni `actor_email`. El commit `686b8f4` **tocó estas
mismas líneas** —le agregó `via` al `detalle` y le movió el `wamid`— y dejó
`entidad`/`entidad_id` tal cual:

```
.insert({ tenant_id: args.tenantId, accion: 'facturacion.aviso_enviado',
          entidad: 'gasto', entidad_id: args.tenantId,
          detalle: { tickets: cuantos, wamid, via } });
```

El conteo sigue en **16 escritores a mano + 1 lector**
(`admin/bitacora.ts:54`), ninguno detrás de una función común, y siguen las
tres formas de firmar el actor.

**Escenario con valores.** El contralor abre `/admin/observabilidad` → Bitácora,
filtra `facturacion` y ve `facturacion.aviso_enviado`, entidad `gasto`, id
`8f3c…-a91b`. Lo pega en el buscador de gastos: no existe — es el id de su
flota. El actor sale como *«sistema»* aunque el evento tuvo destinatario humano
(el encargado al que se le mandó el WhatsApp).

**Consecuencia.** Es el registro cuya única función es ser confiable, y su forma
no la garantiza nada: ni tipo, ni función, ni test. El delta demuestra el costo:
un editor pasó por encima del renglón malo sin poder verlo, porque no hay nada
que se lo enseñe.

**Causa raíz probable.** Sin cambio: `admin/bitacora.ts` nació como **lector**
y nunca se creó el escritor recíproco.

---

### [MEDIO] El rótulo de `necesidad_pct` en pantalla se quedó dos migraciones atrás, y su comentario jura que eso no puede pasar

`src/lib/admin/prospectos-mapa.ts:283-291` ·
`supabase/migrations/0142_necesidad_pct_ajusta_auxiliar_administrativo.sql:27-35` ·
`supabase/migrations/0143_necesidad_pct_excluye_liquidacion_financiera.sql:24-40`

**Los dos lados.** El comentario de `CRITERIO_SCORES` (`:283-284`) dice: *«el
pie del mapa lo enseña TAL CUAL (misma fuente que el cálculo, no una copia que
se desincronice)»*. Es falso para `similitud` y `necesidad`: esas dos son
**columnas GENERADAS en SQL** y lo de aquí es prosa escrita a mano. `:290` dice:

> `Necesidad (0140, GENERADA) = vacante de liquidación/cuadre/auxiliar administrativo +50 (cualquier otra vacante +25), flota investigada ≥20 unidades +25.`

La base, tras 0142 y 0143 —las dos dentro de este delta—, dice otra cosa:
`liquidaci` vale +50 **salvo** si la vacante también nombra `de pagos` o
`compensación`; `auxiliar administrativ` vale +50 **solo si además** nombra
`viaje|flota|diesel|combustible|caseta|embarque|operativ|mesa de control`, y si
no cae a +25.

**Escenario con valores.** Prospecto *Qualtia Alimentos*, vacante *«Auxiliar
Administrativo»*, `num_unidades = 25`. La base calcula `25 + 25 = 50` y la
tarjeta pinta la barra **Necesid. 50%**. Javier pasa el cursor por el
encabezado (`cerebro.tsx:705`, `title={CRITERIO_SCORES.necesidad}`) y lee
«auxiliar administrativo +50 … flota ≥20 +25» = **75**. Segundo caso, el que la
0143 nombra: *Copayment de México*, vacante *«Analista de Operaciones
Liquidación y Compensación»* → base 25, rótulo prometido 50.

**Consecuencia.** Es la regla de la casa —«un rótulo tiene que ser verdad»— en
la pantalla desde la que se decide a quién llamar. Y para quien mantenga esto,
el comentario de arriba le dice que no hace falta revisar la prosa cuando
cambia la fórmula: la próxima migración también se va a olvidar.

**Causa raíz probable.** La fórmula vive en SQL (donde debe estar, es
`generated always as … stored`) y su explicación vive en TypeScript, sin nada
que las case — no hay ni un test que compare el texto contra el
`comment on column` que la migración sí escribe.

---

### [MEDIO] `fiscalListo()` copia cinco de las seis condiciones de `getFiscalDeFlota` y se anuncia como «la condición exacta»

`src/app/admin/flotas/page.tsx:34-38` ·
`src/lib/likida/facturacion/flota_fiscal.ts:63-96` ·
`src/lib/likida/administracion.ts:135-145`

**Los tres lados.** La verdad vive en `getFiscalDeFlota` y exige **seis** cosas:
los cinco del receptor **y** un correo de facturación —un `app_user` con rol
`contador` o `flota_admin` y email no vacío (`flota_fiscal.ts:45`, `:69-77`,
`:106-120`)—. Sin correo devuelve `flota: null` y la flota **no se registra
para facturar**.

`admin/flotas/page.tsx:35-38` la reimplementa:

```
function fiscalListo(fd: FormData): boolean {
  return ['rfc','razonSocial','regimenFiscal','codigoPostalFiscal','usoCfdi']
    .every((c) => String(fd.get(c) ?? '').trim().length > 0);
}
```

…con el comentario `/** ¿Vienen los CINCO del receptor? Es la condición exacta de
getFiscalDeFlota. */`. Y `administracion.ts:139-142` tiene una **tercera** copia
de la misma lista (`fiscalCompleto`), que calcula lo mismo y no lo devuelve, por
eso la pantalla lo recalcula.

**Escenario con valores.** Javier da de alta *Transportes del Bajío* con los
cinco datos fiscales completos y **deja vacío** «Correo del administrador» —el
formulario lo permite y la página tiene rama para ello. `fiscalListo(fd)` es
`true`, así que el aviso omite el `OJO` y solo dice *«dada de alta. Todavía no
tiene a nadie que pueda entrar: falta darle de alta un usuario.»* Javier lo
resuelve dando de alta a un **`encargado`** —un rol legítimo del dominio—, que
no está en `ROLES_QUE_RECIBEN`. El cron de facturación entra por
`route.ts:518-532` con `falta = ['no hay a dónde mandar el CFDI…']`, no abre
navegador y responde 200. **Ni un ticket se factura, y el único aviso que
existía se calló.**

**Consecuencia.** Es literalmente el hueco que el commit `d432e89` vino a
cerrar —*«el hueco aparecía semanas después, como un cron que no hacía nada,
sin un error que mirar»* (`administracion.ts:130-134`)— reabierto por la copia
de la condición, en la misma pantalla que lo arregla.

**Causa raíz probable.** El alta se arregló escribiendo un tercer predicado en
vez de preguntarle a `getFiscalDeFlota`, que es la función que decide de verdad.

---

### [MEDIO] `processInbound` sigue siendo una función de 2,153 líneas: la reescritura movió 110 líneas afuera y metió 80 adentro

`src/lib/likida/processor.ts:553-2706`

El archivo pasó de **2,602 a 2,706 líneas** (+104). Dentro de él,
`processInbound` va de `:553` al final: **2,153 líneas en una sola función**,
con **61 `return`**, **35 bloques `try`**, hasta 9 niveles de indentación y 55
imports en la cabecera. Antes del delta eran 2,184 (`:418`–`:2602`). El delta
extrajo `atenderTextoOficina` (`:443-551`, 108 líneas) y volvió a meter el
bloque nuevo del dueño que maneja (`:721-768`) más el rework de las incidencias
(`:1655-1700`): saldo neto **−31 líneas** en la función.

Además el archivo se salta la frontera de `repo.ts` en tres puntos: `:110`
(`.from('viaje')`), `:114` (`.from('posicion')`) y `:234` (`.from('operador')`).

**Escenario con valores.** El CRÍTICO de arriba es el escenario: el bloque nuevo
se insertó entre `getOpenViaje` (`:717`) y el gate de privacidad (`:770`), y su
efecto sobre `wa_conversacion` se manifiesta 1,900 líneas más abajo, en
`saveConversation` (`:2654`) y en `recordarPeticionDeFoto` (`:373`). No hay
lectura razonable de esta función que ponga esos tres puntos en la misma
pantalla: por eso la colisión pasó la revisión y por eso el test nuevo tuvo que
mockear cinco módulos (`processor_dueno_maneja.test.ts:25-54`) para poder
probar 48 líneas.

**Consecuencia.** Cualquier cambio aquí se paga con lectura de 2,000 líneas o
con un mock que esconde justo lo que hay que ver. Es el archivo más caro de
cambiar del repo y este delta no lo abarató.

**Causa raíz probable.** El pipeline entrante nunca se partió por fase
(identificar → autorizar → despachar por tipo → responder); cada
funcionalidad nueva encuentra su sitio *dentro* del `if` que le queda cerca.

---

### [BAJO] `conector_credencial` ganó un segundo módulo dueño, sin `acotada()` y con un lector muerto de estreno

`src/lib/likida/facturacion/cuentas.ts:36-41`, `:70-75`, `:111-117` ·
`src/lib/likida/conectores/credenciales.ts:97`, `:144`, `:176`

`credenciales.ts` es el módulo del cofre y envuelve **sus tres** consultas en
`acotada(...)` (el tope de consulta de `presupuesto.ts:148-169`). `cuentas.ts`
—nuevo— agrega **tres consultas más a la misma tabla desde otro módulo**, las
tres **sin `acotada`**, dentro del cron de facturación, que es donde el
presupuesto de tiempo se cuenta al segundo. Y `credencialDePortal`
(`cuentas.ts:105-135`, 31 líneas) **no tiene un solo llamador no-test**: nace
muerto junto a `credencialesDePortales`, que hace lo mismo en lote.

**Escenario con valores.** El cron corre con `PRESUPUESTO_LOTE_MS`; una lectura
de `conector_credencial` que se cuelga no tiene tope propio —las de
`credenciales.ts` sí lo tienen, y el mismo archivo del cron lo consume en
`route.ts:554`— así que el corte por presupuesto (`route.ts:540-546`) se salta
y la flota siguiente se reporta como «no quedaba presupuesto» sin que nadie
sepa que el tiempo se fue esperando a Postgres.

**Consecuencia.** Dos módulos dueños de la misma tabla con contratos de error
opuestos (uno LANZA por decisión escrita, `credenciales.ts:138-141`; el otro
devuelve vacío, `cuentas.ts:16-22`) y con distinto trato del presupuesto.
Ninguno de los dos se menciona en el otro.

**Causa raíz probable.** El acceso a `conector_credencial` nunca se declaró
frontera; `cuentas.ts` se escribió al lado de su consumidor en vez de dentro
del módulo que ya la poseía.

---

### [BAJO] El piloto de visión es un segundo procedimiento para operar un portal, colgado de nada

`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:114-224` ·
`src/lib/likida/facturacion/adaptadores/playwright_base.ts:211-476`

`AdaptadorPlaywrightBase` es, por su encabezado (`:6-12`), *«el
procedimiento»* del que cuelga cada adaptador. `crearPilotoVision` **no lo
extiende**: reimplementa la normalización del modo (`:119` vs `:243`),
`capturaSegura` (`:218-224` vs `:468-475`, idénticas), el `try/finally` que
cierra la página (`:208-210` vs `:374-384`) y la forma del `ResultadoAgente`
— y no hereda nada de lo que la base defiende: `emisionSinConfirmar`, el
«en `emitir` es UNO. Siempre» (`:263-264`), ni `verificarSelectores`.

**Escenario con valores.** Alguien endurece la base —por ejemplo, mete el tope
por tiempo del `esperarUuid` también en la escritura, o cambia
`capturaSegura` para que registre el fallo con el comercio—. `npx tsc` pasa,
los tests de `capufe` pasan, y el piloto —que atiende **20 de los 21 comercios
operables** con la palanca puesta— se queda con el comportamiento viejo. Cuando
alguien vaya a diagnosticar por qué las capturas del piloto no traen el
comercio en el log, va a leer `playwright_base.ts` y va a encontrar el arreglo
puesto.

**Consecuencia.** La frase «cada adaptador cuelga de la base» dejó de ser
cierta el día que entró el adaptador que va a atender casi todos los portales,
y nada en `playwright_base.ts` lo dice.

**Causa raíz probable.** La base está construida alrededor de `MapeoPortal`
(selectores escritos), que es justo lo que el piloto no tiene; en vez de sacar
lo común (ciclo de vida de página, modo, captura, contrato de resultado) a un
tronco sin mapeo, se duplicó.

---

## Estado de los hallazgos abiertos de la ronda 18

| Ronda 18 | Hoy |
|---|---|
| **CRÍTICO** — CFDI N:1 tratado como duplicado | **CERRADO y anclado.** `engine.ts:176` dedup por `` `${uuid}#${cfdiOrden ?? 1}` `` con el porqué escrito (`:161-175`); `repo.ts:666` selecciona `cfdi_orden` y `:681` lo mapea; `types/likida.ts:45` lo declara con su comentario. Verifiqué además que el **segundo** consumidor de `copiasDeComprobante` —`liquidacion/omitidos.ts:93`, la tabla del PDF— recibe la liquidación viva de `cuadrarDesdeDB` (`analytics.ts:1452`, `pdf.ts:279`), o sea que también ve el orden: la invariante «la suma de las filas es EXACTAMENTE `totalComprobado`» no se rompió por el arreglo. `npx vitest run src/lib/likida/cuadre/engine.test.ts` → 119/119 verde. |
| **ALTO** — 17 archivos de `bitacora_auditoria` a mano | **ABIERTO y REINCIDENTE.** Ver hallazgo. No hubo escritor 18 (siguen 16 + 1 lector), pero el desalineado se editó y sobrevivió. |
| **ALTO** — URL base en 7 sitios, 4 valores | **ABIERTO y EMPEORADO.** 8 sitios con fallback a mano, 5 valores de suelo contando los tres derivados. |
| **MEDIO** — 4.º mapa de conceptos (`gasto-semanal-chart.tsx:9-13`) | **ABIERTO, sin cambios.** El mapa sigue ahí, sigue llamándose `CONCEPTO_LABEL` (el nombre que `etiquetas_sincronizadas.test.ts:43` prohíbe en `pdf.ts`) y sigue diciendo `'Casetas'/'Facturas'/'Otros'` contra `'Caseta'/'Factura'/'Otro'` del motor. El delta no lo tocó. |
| **BAJO** — el PDF de dinero importa `@/lib/correo/logo` | **ABIERTO, sin cambios** (`liquidacion/pdf.ts:19`, `informes/pdf.ts:16`). |
| **BAJO** — «hoy en México» con dos ortografías, 38 sitios | **ABIERTO, sin cambios.** `admin/consumo.ts:49` y `admin/qa-storage.ts:244` siguen con el literal `'America/Mexico_City'` en vez de `TZ_MX`. |

---

## Lo que revisé y está bien

- **El motor de dinero sigue puro, y lo verifiqué de nuevo tras el cambio de
  `engine.ts`:** cero coincidencias de `supabase|createClient|fetch(|process.env`
  en los archivos no-test de `cuadre/` y `liquidacion/`. El arreglo del CFDI
  N:1 entró sin meter I/O ni una lectura de entorno.
- **`formato.ts` sigue siendo frontera dura.** `toLocaleString('es-MX')` no
  aparece en ningún archivo no-test fuera de `lib/formato.ts`; las tres
  coincidencias restantes son comentarios o el propio test.
- **El validador fiscal ganó dueño único, y bien.**
  `saas/fiscal.ts:99-137` extrajo `validarDatosFiscales` con el motivo escrito
  (*«dos copias de un validador fiscal se separan: la copia laxa acaba siendo la
  que escribe»*), `guardarDatosFiscales` lo consume y `administracion.crearFlota`
  también (`:139-145`), validando **antes** del insert. Eso es subir el nivel de
  la frontera, no parchear.
- **El catálogo fiscal se importa en vez de copiarse.**
  `admin/flotas/page.tsx:21` trae `REGIMENES` y `USOS_CFDI` de
  `@/lib/saas/fiscal`; el `<select>` que ofrecía regímenes que no califican
  (605, 606, 607…) murió.
- **Los dos registros NO definen la misma verdad.**
  `conectores/registro.ts` es el catálogo de «qué sé conectar y qué credenciales
  pido»; `facturacion/adaptadores/registro.ts` es el **ciclo de vida por lote**
  de una flota. Ninguno escribe una lista paralela:
  `PORTALES_CONOCIDOS` (`:165`) se deriva de `TABLA`,
  `COMERCIOS_PILOTABLES` (`:184-186`) y `CONECTORES_PORTALES_FACTURACION`
  (`portales_facturacion.ts:93-95`) se derivan los dos de `COMERCIOS`, y
  `portalesVivos` (`:357-359`) se cruza contra el `Map` real en vez de
  devolver lista propia. La diferencia entre las tres capas está escrita
  (`conectores/registro.ts:20-35`). El problema no es que dupliquen; es cuál
  pregunta contesta `portalesOperables()` (ver ALTO 3).
- **La clave del registro lleva el tenant, y con separador NUL** (`:372-374`):
  el CFDI con el RFC de otra empresa ya no es alcanzable desde ahí, y las firmas
  lo exigen sin default.
- **`llm/models.ts` agregó el rol `piloto` en los CUATRO `Record<ModelRole, …>`**
  (`:118`, `:141`, `:164`) — la exhaustividad del tipo es guardarraíl real ahí.
- **`identificar.ts` cerró un empate por especificidad** (`:33-49`, `:72-101`)
  en vez de reordenar `COMERCIOS` a mano, que habría sido la copia frágil.
- **`startup.ts:65-76`** ya no libera el lease de otro proceso: el `unlock`
  quedó condicionado a `locked === true`.
- Corrí `npx vitest run src/lib/likida/cuadre/engine.test.ts
  src/lib/likida/facturacion/avisar.test.ts` → **129/129 verde**: el arreglo del
  CFDI está anclado, y `avisar.test.ts` pasa **sin un solo caso de cuenta
  compartida**, que es la mitad del ALTO 1.

---

## Lo que NO alcancé a revisar

- **El `.from(` archivo por archivo.** El conteo pasó de **119 archivos / 579
  llamadas** a **122 / 583** fuera de `repo.ts`+`pg.ts`; las 4 nuevas están en
  `facturacion/cuentas.ts` (3) y `admin/prospectos-mapa.ts` (1). No sé cuántas
  de las 583 pasan por `acotada()` o `traerTodo()`; el corte silencioso de 1,000
  filas de PostgREST puede estar sin cubrir en sitios que no abrí.
- **El grafo completo del subsistema de facturación.** Abrí `enrutar`,
  `cuentas`, `al_vuelo`, los dos registros, `piloto_vision`, `playwright_base`,
  `flota_fiscal`, `avisar`, `identificar`, `comercios` y `pendientes`. No abrí
  `agente.ts`, `capufe.ts`, `facturacion_escritura.ts` ni
  `facturacion_clientes.ts`, y `agente.ts` es donde vive el `Map` de adaptadores.
- **`admin/mapa-prospectos/[id]/detalle.tsx` (280 líneas nuevas) y
  `cerebro.tsx`** los recorrí solo por dónde consumen `CRITERIO_SCORES` y los
  `pct`; no revisé su acoplamiento con `prospectos-mapa.ts` ni si repiten
  componentes de `/admin/ui`.
- **`auth/callback/route.ts`, `motivo_login.ts`** — de los cuatro commits que la
  ronda 18 confesó no haber mirado, solo abrí `reenvio_enlace.ts` (y de ahí
  salió la octava URL). Los otros dos quedan pendientes para el rubro.
- **`npx tsc --noEmit` y `npx eslint` completos** — no los corrí; no toqué
  código y los dos archivos de prueba que cité pasan, pero no puedo afirmar que
  el árbol compile limpio.
- **El barrido de columnas que existen en la base y no en el tipo del dominio**
  —el patrón exacto del CRÍTICO de ayer (`cfdi_orden`)— sigue sin hacerse. Con
  143 migraciones y solo la 0005, 0140, 0142 y 0143 abiertas hoy, es la
  búsqueda con mejor razón de rendimiento que le queda a este rubro.
