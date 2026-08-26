# Cumplimiento legal — auditoría 19

**Nota: 3/10** (antes 4). Razón del movimiento: **deuda que cobró factura**. Los
trece abiertos de la c4 siguen abiertos —verificados uno por uno abriendo el
archivo de hoy, no leyendo asuntos de commit— y encima el delta metió a
producción **una tubería nueva de datos personales que los dos avisos del
operador niegan con todas sus letras**: `sincronizar_gps.ts` escribe posiciones
cada cinco minutos (`vercel.json`, `*/5 * * * *`) mientras
`privacidad.ts:520` publica, en negritas, *«No hay GPS ni rastreo del
teléfono»*. Ése es exactamente el patrón que este rubro lleva cinco rondas
marcando como su falla más cara —un documento público que afirma como hecho
algo que el código contradice— y esta vez el documento no envejeció: el código
lo desmintió ayer.

Bajo a 3 y no me quedo en 4 porque el ancla del rubro lo dice sin margen: *«3 o
menos si hay transferencia de datos personales sin cobertura»*.
`redactor.ts:164` lleva **cinco pasadas** siendo eso, y ahora se le suma un
tratamiento nuevo (geolocalización de persona identificable) sin base en
ningún aviso. No bajo más porque **algo sí se cerró de verdad**, y hay que
decirlo: `storage_borrado.ts` existe, lo llama el cron (`cron/purgar/route.ts:141`)
y es la primera línea de producción que borra un objeto de Storage — la mitad
de atrás del hallazgo 4 de la c4.

**El riesgo mayor del rubro, hoy:** el aviso que la flota le entrega a su chofer
—el documento con el que ella acredita su cumplimiento frente al INAI— afirma
que no hay GPS, y desde el 23-ago-2026 sí lo hay, corriendo cada cinco minutos
contra la API de Samsara.

---

## Verificación de los trece abiertos de la c4

**Trece REINCIDENTES. Uno cerrado a medias.** Evidencia leída hoy:

| # (c4) | Hallazgo | Estado | Evidencia de HOY |
|---|---|---|---|
| 1 | `/aviso/<tenant>` es 404 para toda flota real | **REINCIDENTE** (5ª) | `getDatosResponsable` sigue exigiendo `razonSocial && domicilio` (`repo.ts:1042`); `[tenant]/page.tsx:69` sigue con `notFound()`. `razon_social` **ya tiene escritor** (`saas/fiscal.ts:174`), `domicilio_fiscal` **no**: el único `insert/update` sobre esa columna en todo el árbol es `scripts/demo-5k.sql:39`. |
| 2 | El Redactor manda el nombre del decisor al modelo | **REINCIDENTE** (5ª) | `redactor.ts:164` y `:167` intactos, dentro del `dossier` que va a `generateResponse({role:'back_office'})` (`:179-181`). Cero imports de `seudonimo.ts`. |
| 3 | La baja por "BAJA" no existe | **REINCIDENTE** | `grep -rn "BAJA" src/lib/likida/agentes/ src/lib/correo/ src/app/api/correo/` → **cero**. `privacidad.ts:765` sigue publicándola. |
| 4 | El primer toque sale sin liga del aviso por 2 de 3 canales | **REINCIDENTE** | `pieAvisoProspectos` tiene **un** llamador en todo `src/`: `mapa-prospectos/mensaje/route.ts:102`. |
| 5 | El gate del aviso no es lo primero | **REINCIDENTE** | `processor.ts:894-923` sigue delante de `ponerAvisoADisposicion` (`:935`). |
| 6 | El piloto de visión manda la pantalla autenticada al modelo | **REINCIDENTE** | `piloto_vision.ts:144,151,193` (`capturaSegura`) y `:370` (`images:`). |
| 7 | Nada fija la jurisdicción del proveedor | **REINCIDENTE** | `openrouter.ts:271-272`: `provider: { data_collection: 'deny' }`, sin `only` ni `order`. `models.ts:89` sigue con `back_office: 'openai/gpt-oss-120b'`. |
| 8 | El correo adivinado cuenta como decisor verificado | **REINCIDENTE** | `prospectos-mapa.ts:613` **y `:844`** (ahora son dos): `filter((x) => x.confianza !== 'baja')`. |
| 9 | La credencial revocada conserva su contraseña cifrada | **REINCIDENTE** | `credenciales.ts:169-174`: sigue `update({ activo: false })`. `conector_credencial` no está en las catorce purgas de `0165:214-241`. |
| 10 | `/privacidad` no enumera el contenido de los mensajes ni su salida | **REINCIDENTE, agravado** | `privacidad/page.tsx:86` sigue diciendo *"los modelos de lenguaje que **leen los comprobantes**"*. Agravante nueva abajo (hallazgo 18). |
| 11 | La foto de perfil vive en bucket público y el borrado no la alcanza | **REINCIDENTE** | `dashboard/mi-perfil/page.tsx:117` y `admin/mi-perfil/page.tsx:72` (`getPublicUrl('avatares')`); `0046:43` (`avatares_lectura_publica`) sin tocar. |
| 12 | La consola de Javier cita el art. 32 de la ley abrogada | **REINCIDENTE, ampliado** | `guardia.ts:73`, `escalaciones.ts:272`, `compliance/page.tsx:34`, `processor.ts:231` — **y ahora también `0173_ejecutor_arco.sql:6`**, migración escrita esta ronda. |
| 13 | El correo del usuario en una cookie que ninguna página menciona | **REINCIDENTE** | `reenvio_enlace.ts:44,63`; `grep -c cookie src/app/privacidad/page.tsx` → **0**. |

Y el que **sí** se movió: el hallazgo 4 de la c4 («ninguna línea de producción
borra un objeto de Storage»). Hoy la hay: `storage_borrado.ts:81`
(`db.storage.from(bucket).remove(nombres)`), llamada desde
`cron/purgar/route.ts:141`. Queda abierta la otra mitad, que empeoró — ver el
hallazgo 7 de abajo.

---

## Hallazgos

**4 CRÍTICOS · 9 ALTOS · 7 MEDIOS · 2 BAJOS.**

---

### 1. [CRÍTICO · NUEVO] El poller de GPS asienta la ubicación de un chofer identificable cada 5 minutos, y los dos avisos que ese chofer recibe afirman en negritas que no hay GPS

`src/lib/likida/conectores/sincronizar_gps.ts:144-146` (la escritura) ·
`src/app/api/cron/gps/route.ts:56` y `vercel.json` (`"/api/cron/gps"`,
`"*/5 * * * *"`) · `src/lib/likida/privacidad.ts:520` (integral) y `:232`
(simplificado) · `supabase/migrations/0176_gps_ingesta.sql:26-28,63-69`

**Norma:** `normas/lfpdppp-15-16.yaml` — art. 15 fr. II (*«Los datos personales
que serán sometidos a tratamiento»*) y fr. III (*«Las finalidades del
tratamiento»*), más el art. 14 (informar la existencia y características
principales del tratamiento).

**Escenario, con los valores.** *Transportes Perla* conecta su cuenta de Samsara
(`conectores/gps.ts:165`, `claveAlmacen: 'samsara'`) y liga el tractocamión
económico 214 con `unidad.gps_device_id = '281474977568233'`,
`gps_proveedor = 'samsara'` (0176:26-28). A las 03:05 el cron llama
`sincronizarGpsTodas` → `leerPosicionesSamsara` (`posiciones.ts:65`) →
`GET /fleet/vehicles/stats?types=gps` → y `sincronizar_gps.ts:144-146` hace
`upsert` en `posicion` de `{tenant_id, unidad_id, lat: 25.6866, lng: -100.3161,
velocidad: 0, medida_en: '2026-08-24T03:04:12Z'}`. A las 03:10, otra. **288
lecturas por unidad y por día**, retenidas 90 días (`purgar_posicion(90)`,
`0165:232`).

Esa serie **no es de un camión, es de una persona**: `viaje` tiene
`operador_id` y `unidad_id` (`0047:67`), así que cruzar la ventana del viaje con
la serie de la unidad devuelve dónde estuvo *Juan Pérez* minuto a minuto —
incluida su casa a las 22:00 y en qué hospital paró el martes. El propio 0173
lo reconoce por escrito: *«La huella de dónde anduvo una persona sí está ahí de
forma indirecta»* (`0173:102-107`).

Y lo que Juan tiene por escrito, en el aviso integral que su empresa publica y
que Likida aloja, es esto (`privacidad.ts:520`):

> *«**No hay GPS ni rastreo del teléfono:** se anota únicamente lo que tú
> escribes y cuándo lo mandaste.»*

Y en el simplificado que le llegó por WhatsApp (`privacidad.ts:232`):

> *«No hay GPS: solo se anota lo que tú escribes y a qué hora lo mandaste.»*

*Intento de refutación, que no prospera:* (a) «el GPS es del vehículo, no de la
persona» — la fracción II obliga a enumerar los **datos que serán sometidos a
tratamiento**, y una ubicación asociable a un titular identificable lo es;
además el aviso no dice «no rastreamos tu teléfono», dice «**no hay GPS**».
(b) «la posición ya se escribía antes» — sí, por el pin manual
(`processor.ts:132`), que es un acto del titular; el poller no lo es.
(c) «`purgar_posicion(90)` existe» — cierto, y es lo único de esta tubería que
está bien; una retención correcta sobre un tratamiento no informado sigue
siendo un tratamiento no informado. (d) «no hay clientes» — el cron está en
`vercel.json` y corre en producción; el día que exista la primera flota con
token de Samsara, la contradicción es un `grep`.

**Consecuencia.** El titular es cada operador. La responsable es la flota, que
publica un aviso falso sin saberlo porque el texto lo redacta y lo aloja Likida.
Ante el INAI el aviso es la prueba, y aquí la prueba dice lo contrario de lo que
hace el producto. Es también el hallazgo que más caro sale en la sala: el
contralor que abra `/aviso/<su-tenant>` y luego el mapa de unidades ve las dos
cosas en la misma sesión.

**Causa raíz probable.** El párrafo «No hay GPS» se escribió en la auditoría 3
como una *concesión honesta* sobre los hitos (la hora es del mensaje, no
telemetría) y quedó como afirmación absoluta; el PR #46 implementó la fuente sin
que nada ate el texto del aviso al conjunto de escritores de `posicion`.

---

### 2. [CRÍTICO · REINCIDENTE, 5ª pasada] El Redactor sigue mandando el nombre y las notas del decisor a un modelo externo, y el aviso que esa persona recibe dice que eso no pasa

`src/lib/likida/agentes/redactor.ts:164,167` (el dato) y `:179-181` (la salida) ·
`src/lib/likida/privacidad.ts:757` (la promesa)

**Norma:** `normas/lfpdppp-15-16.yaml` — art. 14 y art. 15 fr. II y III.

**Escenario, con los valores.** *Ing. Ramón Treviño* está en
`prospecto.contacto_nombre`. Javier pulsa **Redactar**. `redactarCorreoFrio`
arma el dossier con `` `Contacto: ${prospecto.contacto_nombre}` `` (`:164`) y
`` `Notas del vendedor: ${prospecto.notas.slice(0, 500)}` `` (`:167`), y lo manda
a `generateResponse({ role: 'back_office' })` (`:179-181`) =
`openai/gpt-oss-120b` (`models.ts:89`), servido por un tercero de hospedaje que
nada en el código fija (hallazgo 15). Sale el nombre completo y 500 caracteres
de prosa del investigador.

`privacidad.ts:757`, que es lo que pinta `/aviso/prospectos`, le dice a Ramón:

> *«Cuando un programa redacta el primer mensaje, **tu nombre no sale de
> Likida**: la ficha que recibe el modelo de lenguaje lleva un marcador en lugar
> de tu nombre, y sin tus datos de contacto»*

Verificado hoy contra el archivo, no contra el commit: `redactor.ts` no importa
`seudonimo.ts`, `notasSinPersona` ni `lineaDecisor`; el único import de
`seudonimo.ts` sigue siendo `mapa-prospectos/mensaje/route.ts`.

**Consecuencia.** Frente a Ramón, Likida es **responsable** (art. 14), no
encargada. Transferencia de dato personal a un tercero sin cobertura en el
aviso, y un aviso que la niega expresamente.

**Causa raíz probable.** El arreglo persiguió el archivo que el hallazgo citaba
(`mensaje/route.ts`) en vez del dato (`contacto_nombre` hacia cualquier modelo).

---

### 3. [CRÍTICO · REINCIDENTE, 5ª pasada] `/aviso/<tenant>` sigue siendo 404 para toda flota real: `domicilio_fiscal` no tiene ninguna pantalla que lo capture

`src/lib/likida/repo.ts:1026,1042` · `src/app/aviso/[tenant]/page.tsx:63-69` ·
`src/lib/saas/fiscal.ts:101-108,174` · `src/lib/likida/processor.ts:935-948`

**Norma:** `normas/lfpdppp-15-16.yaml` — art. 15 fr. I y art. 16 fr. II.

**Escenario, con los valores.** *Transportes Perla SA de CV* entra a
`/dashboard/facturacion` y captura sus datos fiscales.
`guardarDatosFiscales` escribe **cinco** columnas —`rfc`, `razon_social`,
`regimen_fiscal`, `codigo_postal_fiscal`, `uso_cfdi`
(`fiscal.ts:101-108`)—. `domicilio_fiscal` **no está en esa lista**, y en todo
el árbol (`src/`, `scripts/`, `supabase/`) el único escritor de esa columna es
`scripts/demo-5k.sql:39`. Entonces `getDatosResponsable` devuelve `null`
(`repo.ts:1042`: `razonSocial && domicilio`), `avisoSimplificado` devuelve
`null`, y `processor.ts:936-948` bloquea el primer mensaje de *Juan Pérez*
contestándole que *«tu empresa aún no ha terminado de configurar su aviso de
privacidad»*. Y `/aviso/<uuid>` responde `notFound()` (`[tenant]/page.tsx:69`).

**Novedad de esta ronda, y por eso no bajo la severidad:** ahora falta **una
sola columna**. Antes faltaban tres y el hueco parecía un módulo; hoy es un
campo de formulario, y sigue sin existir después de cinco rondas pidiéndolo.

**Consecuencia.** El carril del chofer no arranca en ninguna flota real, la
flota no puede cumplir aunque quiera, y el carril de oficina —que sí arranca—
se salta el gate (hallazgo 11).

**Causa raíz probable.** `domicilio_fiscal` nació en la 0018 para el aviso y la
pantalla de facturación se construyó alrededor del receptor del CFDI, que no lo
necesita.

---

### 4. [CRÍTICO · REINCIDENTE] La purga de prospectos sigue borrando el nombre de cabecera y nada más — y esta ronda añadió una segunda columna con el correo que tampoco se borra

`supabase/migrations/0148_prospecto_persona_retencion.sql:72-82` ·
`supabase/migrations/0181_crm_remediacion.sql:3-6` ·
`src/app/api/lead/route.ts:183-191` · `src/lib/likida/privacidad.ts:766`

**Norma:** `normas/lfpdppp-15-16.yaml` — art. 15 fr. IV (*«Las opciones y medios
que el responsable ofrezca a las personas titulares para limitar el uso o
divulgación de los datos»*): el plazo publicado **es** esa opción.

**Escenario, con los valores.** *Ramón Treviño* llena `/getdemo` el 1-ago-2026.
`/api/lead` escribe `contacto_nombre='Ramón Treviño'`,
`correo='ramon.trevino@transportesx.mx'` (`route.ts:183`), `telefono='8112345678'`
(`:184`) y —**nuevo esta ronda**— `lead_clave='correo:ramon.trevino@transportesx.mx'`
(`:190-191`, índice único `prospecto_lead_clave_unica`). Nadie vuelve a tocarlo.
El 2-ago-2027 corre `purgar_prospecto_persona(365)`:

```sql
update public.prospecto p
   set contacto_nombre = null, updated_at = p_ahora   -- 0148:73-74  ← SOLO esta columna
```

Después de la purga la fila conserva `correo`, `telefono`, **`lead_clave` con el
correo dentro**, `mensaje_wa`/`mensaje_correo` con el nombre repuesto, `notas` y
`atribucion` con su `fbclid`. La RPC devuelve el conteo de `prospecto_persona`
borradas y `mantenimiento_de_datos` lo publica como éxito.

Y el aviso que Ramón puede abrir dice (`privacidad.ts:766`):

> *«a los 12 meses sin ningún contacto, tu nombre, puesto, **correo y teléfono**
> se eliminan automáticamente. **Lo único que queda es el registro de la
> empresa** (nombre, giro, plaza), que no es un dato tuyo.»*

**Consecuencia.** Cada persona del censo. Se publica un plazo, se ejecuta una
purga que reporta éxito, y el dato que sirve para volver a contactarla se
conserva indefinidamente — ahora en **dos** columnas en vez de una. Lo agrava
que quien audite lea la 0148, la vea corriendo desde el cron y la dé por buena.

**Causa raíz probable.** El plazo se diseñó alrededor de `prospecto_persona`;
la limpieza de la fila vieja se añadió como remate sobre una columna, y la 0181
creó `lead_clave` sin mirar la purga.

---

### 5. [ALTO · NUEVO] El ejecutor ARCO no tiene un solo llamador en producción: `ejecutar_arco_cancelacion` existe, está probado en `verificaciones.sql` y nadie lo invoca — la resolución sigue siendo un `update` de estado y un WhatsApp

`supabase/migrations/0178_fiscal_retencion_arco_y_perfiles_erp.sql:69-133` ·
`supabase/migrations/0173_ejecutor_arco.sql:45-147` ·
`src/lib/likida/repo.ts:1345-1376` (`resolverSolicitudArco`) ·
`src/app/dashboard/arco/page.tsx:53-63` · `src/app/admin/compliance/page.tsx:49`

**Norma:** `normas/lfpdppp-15-16.yaml` — art. 15 fr. V (*«Los mecanismos, medios
y procedimientos para ejercer los derechos ARCO»*).

**Escenario, con los valores.** *Juan Pérez* escribe **PRIVACIDAD, quiero que
borren mis datos**. `tipoDeSolicitudArco` (`privacidad.ts:646`) lo clasifica
`'cancelacion'` y `registrarSolicitudArco` (`repo.ts:1249`) la inserta con
`vence_en` a 20 días hábiles. Todo eso funciona. El contralor abre
`/dashboard/arco`, teclea *«listo, se anonimizó»* y pulsa Responder. Lo que corre
es `resolverSolicitudArco` (`repo.ts:1345-1376`): un
`update({estado:'resuelta', resuelta_en, resolucion})` y un WhatsApp con ese
texto. **No llama a nada más.**

`grep -rn "ejecutar_arco" src/` → **cero resultados**. Los únicos llamadores de
`ejecutar_arco_cancelacion` en todo el repo están en
`supabase/verificaciones.sql:8131,8151,8153,8155`, que es el arnés de pruebas.
La función está `revoke all … from public, anon, authenticated` y
`grant execute … to service_role` (`0178:169-172`) — o sea, lista para que
alguien la llame, y nadie la llama.

Después de «resolver», la fila de `operador` conserva `nombre='Juan Pérez'` y su
teléfono real; `anonimizado_en` sigue en NULL; `solicitud_arco.evidencia` y
`ejecutada_en` —las columnas que la 0173 creó para que *«ya lo borramos» tenga
respaldo el día que el INAI pregunte* (`0173:25-27`)— quedan en NULL para
siempre, porque el único código que las escribe es el que nadie llama.

**Consecuencia.** El titular es el operador; la responsable es la flota. La
solicitud se cierra en verde, el plazo del art. 31 deja de correr en el panel, y
el dato sigue igual. Es peor que la ronda pasada en un sentido concreto: antes
el hueco era visible (no existía el ejecutor); ahora existe, está en el árbol,
tiene pruebas en `verificaciones.sql` y **parece** cerrado — quien audite el
delta va a leer el asunto del commit («una cancelación que de verdad cancela»),
abrir la migración y darlo por hecho. Es exactamente el error que la c3 cometió
con `361f2dc`.

No es CRÍTICO porque el registro y el plazo sí funcionan y la lógica SQL, cuando
se conecte, está bien pensada (anonimiza en vez de borrar, respeta el CFF art.
30, ancla al `tenant_id` en el `WHERE`).

**Causa raíz probable.** La migración y el código de aplicación se hicieron en
pasadas distintas; la RPC nació con su contrato y su prueba de SQL, y el botón
de `/dashboard/arco` nunca se reescribió para usarla.

---

### 6. [ALTO · NUEVO] El webhook de Cal.com guarda el payload íntegro del invitado —nombre, correo, teléfono, notas— en una tabla append-only sin purga, y ningún aviso menciona ni el dato ni al proveedor

`src/app/api/webhook/calcom/route.ts:71` · `src/lib/admin/calcom.ts:92-100` ·
`supabase/migrations/0181_crm_remediacion.sql:20-41` ·
`supabase/migrations/0165_storage_sin_delete_directo.sql:214-241` (las catorce
purgas) · `src/lib/likida/privacidad.ts:783` ·
`docs/conocimiento/52-anexo-subencargados.md:53-63`

**Norma:** `normas/lfpdppp-15-16.yaml` — art. 15 fr. II (qué datos) y fr. IV
(el plazo publicado como opción), y `normas/lfpdppp-2-XII-XX.yaml` (art. 2 fr.
XII: quién es persona encargada).

**Escenario, con los valores.** *Ramón Treviño* agenda la demo en el Cal.com de
Likida. Cal.com dispara `BOOKING_CREATED` y la ruta hace:

```ts
payload: evt.payload ?? {},        // route.ts:71 — el objeto ENTERO, verbatim
```

De ese payload la ruta **solo lee** el correo (`emailDelEvento`, `:34-39`) y el
id (`:29-32`); todo lo demás —`attendees[].name`, `attendees[].phoneNumber`,
`attendees[].timeZone`, `responses` (el campo libre «cuéntanos de tu
operación»), `organizer`— entra tal cual a `comercial_evento.payload jsonb`
(`calcom.ts:98`), con un tope de 256 KB por evento (`route.ts:10`). La tabla es
un ledger **append-only** (`0181:39-40`) y `grep -rn "comercial_evento"
supabase/migrations/` fuera de la 0181 devuelve **cero**: no está en las catorce
purgas de `0165:214-241`, no tiene `mantenimiento_de_datos`, no tiene plazo.

Y el aviso donde Likida es **responsable** de Ramón dice (`privacidad.ts:783`):

> *«Pasan por proveedores que trabajan por instrucción de Likida —**alojamiento
> de la base de datos, envío de correo y mensajería**—»*

Cal.com no está ahí, ni en el anexo de subencargados
(`52-anexo-subencargados.md:53-63`: Meta, OpenRouter, Supabase, Vercel, Sentry,
Resend). Y el `/aviso/prospectos` que promete que *«lo único que queda es el
registro de la empresa»* (`:766`) no alcanza esta tabla: aunque el
`prospecto_id` se ponga a NULL (`0181:24`, `on delete set null`), el correo y el
nombre de Ramón siguen dentro del `payload`.

*Intento de refutación:* podría decirse que Ramón dio sus datos voluntariamente
al agendar, y es cierto — el **consentimiento** no es el problema. Lo son la fr.
II (el dato no está enumerado), el plazo (no existe) y el art. 15 fr. IV (el
plazo que **sí** está publicado es falso respecto de esta tabla).

**Consecuencia.** Cada persona que agende una demo. Likida es responsable, no
encargada. Retención indefinida de un dato personal, en una tabla que por diseño
no se puede rectificar ni cancelar (append-only), sin cobertura en el aviso.

**Causa raíz probable.** El ledger se diseñó para idempotencia de webhooks —un
problema de integridad— y guardar el payload crudo es la solución correcta para
eso; nadie le puso el sombrero de datos personales encima.

---

### 7. [ALTO · NUEVO] El aviso del operador sigue prometiendo «puedes pedir que la foto se borre», y la 0178 decidió a propósito que esa foto no se borra nunca

`src/lib/likida/privacidad.ts:528` (la promesa) ·
`supabase/migrations/0178_fiscal_retencion_arco_y_perfiles_erp.sql:22-26,28-53`
· `src/lib/likida/storage_borrado.ts:44-52`

**Norma:** `normas/lfpdppp-15-16.yaml` — art. 15 fr. V, y art. 26 (el
responsable puede negarse a cancelar cuando el dato es necesario para cumplir
una obligación legal — la negativa es legítima; **anunciar lo contrario no**).

**Escenario, con los valores.** *Juan Pérez* compra su medicamento en el camino
y sube la foto. `sanitizarProducto` hace bien su parte: detecta
`"METFORMINA 850MG 30 TABS"` y descarta el campo entero
(`intake/sanitizar.ts:111-118`). Pero la imagen ya vive en
`comprobantes/{tenant}/{viaje}/{hash}.jpg` y el `gasto` la referencia en
`imagen_url`. Juan escribe PRIVACIDAD y pide que se borre — que es literalmente
lo que su aviso le ofrece (`privacidad.ts:528`):

> *«…un filtro lo detecta y lo excluye: no se guarda, no participa en tu
> liquidación, y **puedes pedir que la foto se borre**.»*

Lo que el código hace ahora, deliberadamente:

1. La 0178 **quitó** de `ejecutar_arco_cancelacion` el `insert` a
   `storage_huerfano_candidato` que la 0173 había puesto, y lo dice:
   *«Las imágenes de gasto/CFDI se CONSERVAN … la antigua 0173 las ponía en una
   cola de borrado; 0178 no promete ese borrado»* (`0178:104-106`).
2. Reclasificó retroactivamente lo ya encolado:
   `update … set clase_retencion='fiscal_cff_30' where motivo='arco'` (`:22-26`).
3. Puso un trigger que marca `fiscal_cff_30` **cualquier** objeto referenciado
   por `gasto.imagen_url` (`:36-42`).
4. Y `storage_borrado.ts:52` filtra `.eq('clase_retencion', 'operativa')`.

Resultado: la foto del ticket de farmacia de Juan es, por construcción,
imborrable. La decisión jurídica de fondo es **defendible** (CFF art. 30, y el
0178 la razona bien). Lo que no lo es: el aviso sigue diciendo lo contrario, en
la misma frase donde el producto presume su filtro de datos sensibles, y
`normas/lfpdppp-59.yaml` duplica las sanciones cuando el tratamiento es de datos
sensibles.

**Consecuencia.** El titular pide una cancelación amparándose en una frase del
aviso, y la respuesta correcta es «no procede». La flota queda contradiciendo
por escrito su propio aviso ante el titular.

**Causa raíz probable.** Dos pasadas del mismo día en direcciones opuestas: la
0173 prometió el borrado, la 0178 lo revocó por buenas razones fiscales, y el
texto del aviso —que es el que el titular lee— no participó de ninguna de las
dos.

---

### 8. [ALTO · REINCIDENTE] Los tres avisos donde Likida es responsable se publican sin la identidad ni el domicilio del responsable, puestos a `null` en el código

`src/app/aviso/prospectos/page.tsx:23-24` ·
`src/app/privacidad/page.tsx:40-41` · `src/lib/likida/privacidad.ts:728-729,737`

**Norma:** art. 15 fr. I.

Verificado hoy, idéntico: `razonSocial: null`, `domicilio: null`, y
`avisoProspectos` sustituye por `'🔴 razón social pendiente 🔴'` y
`'🔴 domicilio pendiente 🔴'` (`privacidad.ts:728-729`), de modo que la primera
línea que lee Ramón es *«🔴 razón social pendiente 🔴 (Likida), con domicilio en
🔴 domicilio pendiente 🔴, es la responsable de tus datos personales»*. Sigue
ALTO y no CRÍTICO porque las páginas **lo confiesan** (`prospectos/page.tsx:39-43`)
y el canal de contacto es real, que es la decisión correcta frente a
inventarlo. Pero es la misma casilla vacía que el hallazgo 3, un piso más
arriba: mientras Likida no tenga razón social y domicilio escritos en algún
lado, **ninguno** de sus tres avisos está completo.

---

### 9. [ALTO · REINCIDENTE] La baja por «BAJA» que el aviso de prospectos publica no existe en ninguna línea de código

`src/lib/likida/privacidad.ts:765` · `src/app/api/correo/entrante/route.ts` ·
`src/lib/likida/agentes/cola.ts`

**Norma:** art. 15 fr. IV.

Verificado hoy: `grep -rn "BAJA"` sobre `src/lib/likida/agentes/`,
`src/lib/correo/` y `src/app/api/correo/` → **cero**. El buzón entrante sigue
siendo el de facturas de proveedor, no hay columna de opt-out en `prospecto`, y
la cadencia solo frena 48 h (`redactor.ts:144-152`): a quien contesta BAJA se le
vuelve a escribir. Escenario con valores: Ramón responde *«BAJA»* al correo
frío; el correo cae en el buzón de facturas, se descarta como no-CFDI, y a los
tres días el runner le encola la siguiente pieza.

---

### 10. [ALTO · REINCIDENTE] El primer toque sale sin la liga del aviso por dos de los tres canales, incluido el único que manda solo

`src/app/admin/mapa-prospectos/mensajes.ts` · `src/lib/likida/agentes/cola.ts` ·
`src/lib/correo/plantilla.ts`

**Norma:** art. 16 fr. II.

Verificado hoy: `pieAvisoProspectos` tiene **un** llamador en todo `src/`
(`mapa-prospectos/mensaje/route.ts:102`). Las plantillas deterministas —el caso
masivo— no lo llevan, y `enviarPiezaPorCorreo`, el único camino que sale por
Resend sin que nadie lo pegue a mano, tampoco. Ramón recibe un correo frío de
una empresa que tiene su nombre y su teléfono, sin dónde consultar por qué.

---

### 11. [ALTO · REINCIDENTE] El gate del aviso sigue sin ser lo primero, y lo que corre delante despacha a terceros

`src/lib/likida/processor.ts:894-923` frente al gate en `:935` ·
`src/lib/agents/analista.ts:288`

**Norma:** art. 16 fr. II, más el `contexto_verificado` de la ficha (*«antes de
cualquier tratamiento»*).

Verificado hoy: el bloque de oficina sigue delante de `ponerAvisoADisposicion`,
sigue llamando `atenderTextoOficina(…, { incluirPreguntaLibre: !viajeId,
incluirDespacho: !viajeId })` (`:920`), y sin viaje abierto eso manda el nombre
del usuario y su texto a OpenRouter y crea viajes con WhatsApp a un tercero,
todo antes del gate. Agravante intacta: como el gate está de facto siempre en
`sin_datos` (hallazgo 3), el único camino que abre en una flota real es
justamente el que se puso delante de él.

---

### 12. [ALTO · REINCIDENTE] El piloto de visión manda la pantalla de un portal ya autenticado a un modelo externo, y ningún aviso lo menciona

`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:144,151,193,370` ·
`.../pagina_playwright.ts` · `src/lib/likida/privacidad.ts:604`

**Norma:** art. 35 y art. 15 fr. II.

Verificado hoy, idéntico: `capturaSegura` en `:144,151,193` e
`images: [captura]` en `:370`. Sigue ALTO y no CRÍTICO porque
`FACTURACION_PILOTO` está apagada — y el guion del demo manda encenderla.

---

### 13. [ALTO · REINCIDENTE] Las dos purgas que un aviso público promete pueden fallar cada noche y el cron sale en verde: nadie lee `fallos`

`supabase/migrations/0165_storage_sin_delete_directo.sql:224-229,265` ·
`src/app/api/cron/purgar/route.ts:99-127,148`

**Norma:** art. 15 fr. IV — el plazo publicado (`privacidad.ts:766`,
`app/privacidad/page.tsx:107`) es la opción que se ofrece.

Verificado hoy: `grep -rn "fallos" src/` sigue sin devolver **un solo lector** de
esa llave del contrato de la RPC. Escenario con valores: un `lock_not_available`
sobre `prospecto` mientras el enriquecedor escribe → la RPC devuelve 200 con
`fallos: ["prospecto_persona: canceling statement due to lock timeout"]`; el cron
comprueba `r.error` (null), lee solo `data.parcial`, y termina en
`logger.info('cron.purgar.ok', …)` (`route.ts:148`) con HTTP 200. Los datos de
todos los prospectos fríos se quedan un año más, cada noche, indefinidamente.
Y `parcial` ya es cierto por motivos benignos (`limpiar_storage_huerfano` tiene
presupuesto propio), así que la única señal que sí llega no distingue nada.

---

### 14. [MEDIO · NUEVO] El aviso de prospectos le dice al lead de `/getdemo` «no nos diste tus datos, salieron de fuentes públicas» — y sus datos salieron del formulario que él mismo llenó, junto con su `fbclid`

`src/lib/likida/privacidad.ts:738,746-747` · `src/app/api/lead/route.ts:51-54,180-191`
· `src/app/privacidad/page.tsx:55`

**Norma:** art. 15 fr. II (qué datos y de dónde) y art. 14.

**Escenario, con los valores.** Ramón hace clic en un anuncio de Meta y llena
`/getdemo`. `/api/lead` escribe su nombre, correo y WhatsApp **y**
`atribucion = {"fbclid":"IwAR1x…","utm_campaign":"flotas-mx-ago","referrer":"…"}`
(`route.ts:51-54,187`). `/privacidad:55` lo manda al aviso de contactos
comerciales, y ahí lee (`privacidad.ts:738`):

> *«No eres cliente de Likida ni **nos diste tus datos**: por eso te decimos aquí
> de dónde salieron»*

y a continuación (`:747`): *«Salieron de **fuentes de acceso público**: el
directorio de empresas del INEGI (DENUE), bolsas de trabajo…»*. Las dos frases
son falsas para él, y el identificador de clic publicitario —que sí es un dato
suyo, y el que permite reconstruir de qué anuncio vino— no está enumerado en
ninguna de las tres listas de datos de ningún aviso.

**Consecuencia.** El único documento que cubre las filas de `prospecto` describe
una vía de obtención distinta de la que se usó y omite una categoría de dato. Es
MEDIO y no ALTO porque aquí el titular sí consintió al enviar el formulario y el
daño material es bajo; lo que falla es la exactitud de la fr. II.

**Causa raíz probable.** El aviso se escribió para el censo raspado (0105-0141),
que era la única fuente cuando nació; `/api/lead` llegó después y hereda su
tabla sin heredar su documento.

---

### 15. [MEDIO · REINCIDENTE] Nada en el código fija la jurisdicción del proveedor, mientras dos archivos afirman que el stack es 100% USA «por regla legal»

`src/lib/llm/openrouter.ts:271-272` · `src/lib/llm/models.ts:89,108`

Verificado hoy: `PROVIDER_OPTS = { provider: { data_collection: 'deny' }, … }`
y nada más — sin `provider.only`, sin `order`, sin sufijo de proveedor en los
slugs. `back_office: 'openai/gpt-oss-120b'` y `extraccion: 'openai/gpt-oss-20b'`
son open-weight servidos por terceros de hospedaje, y por `back_office` pasa el
dossier del hallazgo 2. Una rotación por `LIKIDA_MODEL_BACK_OFFICE`
(`models.ts:167`) cambia el destino de un dato personal sin que nada se entere.

---

### 16. [MEDIO · REINCIDENTE, ampliado] El correo *adivinado* de una persona cuenta como decisor verificado — y ahora el cálculo está duplicado en dos sitios

`src/lib/admin/prospectos-mapa.ts:613` **y `:844`** frente a `:319`

Verificado hoy: `personasVerificadas: (p.prospecto_persona ?? []).filter((x) =>
x.confianza !== 'baja').length` aparece **dos veces**, y `scoreCierre:319` le da
hasta +20 puntos. El filtro mira `confianza`, no `origen`, y `media` es el default
de la columna, así que un correo `inferido` —que el propio aviso confiesa como
deducido (`privacidad.ts:747`)— puntúa como verificado y decide a quién se le
escribe primero.

---

### 17. [MEDIO · REINCIDENTE] La credencial revocada conserva su contraseña cifrada para siempre y ninguna purga la alcanza — y ahora esa credencial abre además un feed de ubicaciones

`src/lib/likida/conectores/credenciales.ts:169-174` ·
`supabase/migrations/0165_storage_sin_delete_directo.sql:214-241`

Verificado hoy: `desactivarCredencial` sigue haciendo solo
`update({ activo: false })`, y `conector_credencial` no está entre las catorce
purgas de la 0165. Escenario con valores: *Transportes Perla* desconecta Samsara
el 1-sep; el token `samsara_api_…` sigue cifrado en la fila, sigue siendo válido
del otro lado, y `descifrar()` (`sincronizar_gps.ts:92`) sabe abrirlo. Lo que se
conserva ya no es solo «un acceso que existió»: es la llave de la telemetría del
hallazgo 1.

---

### 18. [MEDIO · REINCIDENTE, agravado] `/privacidad` no enumera el contenido de los mensajes ni su salida al modelo — y esta ronda añadió un canal nuevo: 16 KB del documento que el dueño suba en el onboarding

`src/app/privacidad/page.tsx:66-70,86` ·
`src/app/api/dashboard/onboarding-chat/route.ts:45-50` ·
`src/lib/likida/perfil/entrevista-agente.ts:43-56`

**Norma:** art. 15 fr. II.

Verificado hoy: la lista de datos de `/privacidad:66-70` sigue siendo nombre,
correo, teléfono, datos fiscales, enlace de acceso y registros técnicos —**sin
el contenido de lo que el usuario escribe**—, y la cláusula de terceros sigue
diciendo *«los modelos de lenguaje que leen los comprobantes»* (`:86`).

La agravante nueva: `/api/dashboard/onboarding-chat` acepta
`documento.extracto` y lo recorta a **16,000 caracteres** (`route.ts:48`), lo
pega al último mensaje (`:50`) y `responderEntrevista` lo manda a OpenRouter con
`role: 'chat'` junto con los últimos 6 turnos (`entrevista-agente.ts:50-54`).
Escenario: el dueño de la flota pega su política interna de viáticos, que nombra
a sus operadores y sus topes — y sale entera al modelo. Ni «comprobantes» ni
«mensajes» describen eso, y para los operadores nombrados ahí la responsable es
la flota, cuyo aviso integral (`privacidad.ts:604`) tampoco lo enumera.

---

### 19. [MEDIO · REINCIDENTE] La foto de perfil vive en un bucket público, no está en la lista del art. 15 fr. II, y el ejecutor ARCO tampoco la alcanza

`src/app/dashboard/mi-perfil/page.tsx:117` · `src/app/admin/mi-perfil/page.tsx:72`
· `supabase/migrations/0046_perfil_avatar.sql:42-45` ·
`supabase/migrations/0178_…:125-126`

Verificado hoy: `avatares` sigue siendo el único bucket con
`avatares_lectura_publica` y `getPublicUrl` (URL adivinable, sin firma). Y el
ejecutor ARCO —cuando alguien lo conecte— hace
`update app_user set … avatar_url = null` (`0178:125`): borra el **puntero**, no
el objeto, que se queda en un bucket que `anon` puede leer. El comentario de
cabecera de la 0173 dice que la cancelación borra *«su avatar»* (`0173:16-17`); no
lo borra.

---

### 20. [MEDIO · REINCIDENTE] El redactor del logger no cubre NOMBRES, y el nombre de un chofer sale entero a Sentry desde un `logger.error`

`src/lib/logger.ts:49-66` · `src/lib/likida/crear_viaje_wa.ts:847-851` ·
`docs/conocimiento/52-anexo-subencargados.md:62`

Verificado hoy: `SENSIBLE` alterna UUID, RFC, teléfono, CLABE y tarjeta
(`logger.ts:49-66`). **No hay regla para nombres.** El jefe de tráfico escribe
*«nuevo viaje para Juan Pérez, Puebla a Monterrey»*, hay dos «Juan Pérez»
activos, y `logger.error('operador.nombre_ambiguo', { buscado: "juan perez", … })`
llega a Sentry con el nombre intacto, mientras el anexo declara que a Sentry solo
le llegan `warn` y `error` **«ya redactados»** (`:62`).

---

### 21. [BAJO · REINCIDENTE, ampliado] El art. 32 de la ley abrogada sigue en texto que se pinta — y esta ronda lo escribió otra vez, en una migración nueva

`src/lib/admin/guardia.ts:73` · `src/lib/admin/escalaciones.ts:272` ·
`src/app/admin/compliance/page.tsx:34` · `src/lib/likida/processor.ts:231` ·
**`supabase/migrations/0173_ejecutor_arco.sql:6`**

El plazo vigente es el art. 31 de la LFPDPPP del 20-mar-2025; el 32 es de la ley
abrogada. `/dashboard/arco` ya se corrigió y hasta tiene prueba
(`arco/fundamento_legal.test.ts:13`), pero esa prueba mira **un** archivo: la
0173, escrita esta semana, volvió a citar el 32. Que el error se reintroduzca en
código nuevo es lo que lo mantiene abierto.

---

### 22. [BAJO · REINCIDENTE] El correo del usuario se guarda en una cookie del navegador y ninguna página lo dice

`src/lib/auth/reenvio_enlace.ts:44,63,83` · `src/app/privacidad/page.tsx`
(`grep -c cookie` → 0)

Fundamento: Reglamento de la LFPDPPP art. 30. **Sigue sin ficha
`verificado_fuente_primaria` en `normas/`**; lo cito por el criterio del repo
(`11-datos-personales.md` §3) y hay que abrir la fuente antes de redactar el
párrafo. Daño material pequeño: la cookie es `httpOnly` y `secure`.

---

## Lo que revisé y está bien

- **El borrador de Storage existe y corre.** `storage_borrado.ts:81`
  (`db.storage.from(bucket).remove(nombres)`) llamado desde
  `cron/purgar/route.ts:141`. Es fail-closed con la marca —`borrado_en` solo se
  sella cuando la API confirmó (`:92-101`)— y su comentario `:89-93` razona bien
  el caso del archivo que ya no existía. **Cierra la mitad de atrás del hallazgo
  4 de la c4**, que llevaba dos rondas abierta.
- **`purgar_posicion(90)` existe y tiene piso.** `0155:163-185`: lanza
  `PU001` si le mandan menos de 30 días, está revocada de
  `public/anon/authenticated` y se llama desde `mantenimiento_de_datos`
  (`0165:232`). La telemetría del hallazgo 1 al menos no se acumula para
  siempre.
- **El ejecutor ARCO, como pieza de SQL, está bien pensado** aunque nadie lo
  llame: `0178:69-133` anonimiza en vez de borrar (razonando que borrar
  arrastraría los libros por FK), sustituye el teléfono por un derivado del hash
  con prefijo `anon:` para que nadie lo confunda con un número real
  (`0173:117-124`), ancla el `tenant_id` en el `WHERE` (`0178:83`), rebota
  `acceso`/`rectificacion` con motivo (`:92-99`) y deja `evidencia` fila por
  tabla. Y **declara por escrito lo que NO cubre** —`posicion` se liga a la
  unidad, no al operador (`0173:102-107`)— en vez de fingir que lo alcanza.
- **La separación cancelación/oposición de la 0178 es correcta y corrige a la
  0173.** `ejecutar_arco_oposicion` (`0178:136-167`) no anonimiza nada: deja la
  solicitud `en_proceso` con evidencia de que requiere revisión humana. La 0173
  las trataba igual, y eso habría anonimizado a quien solo se opuso.
- **La retención fiscal está razonada, no adivinada.** `0178:5-9` funda la
  conservación en el CFF art. 30 y en el art. 26 de la LFPDPPP, y el trigger
  `clasificar_retencion_storage_candidato` (`:28-53`) es una segunda barrera
  independiente de la consulta que llena la cola. El problema no es la decisión,
  es que el aviso no la refleja (hallazgo 7).
- **El poller de GPS no inventa unidades.** `sincronizar_gps.ts:127`: una
  lectura cuyo `deviceId` no reclama ninguna unidad se cuenta como huérfana y se
  reporta (`:165-169`), no se da de alta un vehículo desde un feed ajeno. Y el
  `.eq('tenant_id', …)` de `:111` no es decorativo con `supabaseAdmin`.
- **El webhook de Cal.com verifica la firma antes de tocar nada.**
  `calcom.ts:31-37` usa `timingSafeEqual` con validación previa de forma hex, y
  la ruta contesta 503 si no hay secreto configurado en vez de aceptar sin firmar
  (`route.ts:43`). La ruta plural reexporta el mismo handler firmado
  (`webhooks/calcom/route.ts:3`), no una copia.
- **`comercial_evento` nace con RLS habilitada** (`0181:41`) y sin políticas: solo
  `service_role`. El problema del hallazgo 6 es de retención y de aviso, no de
  acceso.
- **La seudonimización del Cerebro sigue siendo el contraejemplo correcto.**
  `mapa-prospectos/mensaje/route.ts:102` es el único sitio que pega
  `pieAvisoProspectos()`, y el nombre vuelve **después** de la llamada al modelo.
  Es exactamente lo que `redactor.ts` no hace.
- **`purgar_prospecto_persona` respeta el trato vivo y el freno explícito.**
  `0148:60-70`: solo estados `nuevo|contactado|perdido`, solo sin toque en
  `prospecto_contacto` dentro del plazo, y `conservar_hasta` bloquea la purga
  para un ARCO en curso. Le falta alcance (hallazgo 4), no criterio.
- **El filtro de datos sensibles del ticket sigue descartando el campo entero.**
  `intake/sanitizar.ts:102-118`: no sustituye por una marca, porque *«guardar la
  etiqueta del dato sensible es guardar el dato sensible»* (`:107-110`).
- **`/dashboard/arco` falla cerrado y usa el día de México.** `page.tsx:77-82`
  (una base caída no se pinta como «ninguna solicitud») y `hoyMx()` en `:38`, con
  lo vencido contado aparte de lo que vence pronto (`:80-81`).
- **`/api/lead` no deja que un formulario público pise datos existentes.**
  `route.ts:211-216`: lo que llega sobre un hueco lo rellena; lo que choca con un
  dato distinto se anota en `notas` y una persona decide. El teléfono de un
  prospecto en negociación no se puede desviar desde el navegador de un extraño.
- **El chat de onboarding no deja que el modelo declare un hecho fiscal.**
  `entrevista-agente.ts:18-22`: el modelo solo explica y solo cita del catálogo;
  lo que escribe el perfil es `aplicarTurnoEntrevista`, determinístico.

---

## Lo que NO alcancé a revisar

- **El texto vigente de la LFPDPPP más allá de los artículos transcritos en las
  fichas de `normas/`.** Los arts. 9, 11, 26 y 31 que aparecen en este reporte y
  en el código salen de `docs/conocimiento/11-datos-personales.md`, no de la
  fuente primaria abierta por mí. **Sigue sin ficha verificada el plazo ARCO
  (art. 31)** —el número que imprimen dos pantallas— y el art. 11
  (conservación), que funda los hallazgos 4, 6 y 13.
- **`posicion` desde el ángulo de acceso.** Verifiqué el escritor y la purga; no
  verifiqué qué pantalla del `/dashboard` la lee ni con qué rol, ni si un
  `encargado` puede ver la serie de un operador que no es suyo. `grep` solo
  devolvió dos escritores y ningún lector en `src/` — que una tubería escriba y
  nadie lea es en sí mismo una pregunta de minimización que no pude cerrar.
- **El contenido real del payload de Cal.com.** Construí el hallazgo 6 sobre lo
  que la ruta **guarda** (`evt.payload` íntegro, hasta 256 KB) y lo que
  **descarta** (nada). No tengo un payload real de la cuenta de Cal.com de
  Likida para enumerar campo por campo qué llega.
- **`bitacora_auditoria` y `evento_seguridad` a fondo.** Tercera ronda que queda
  fuera. No verifiqué qué campos personales entran por los catorce llamadores de
  `anotar()` ni si `/privacidad:107` debería enumerar ese plazo.
- **`prospecto.notas` como depósito de datos personales.** `redactor.ts:167` la
  manda cruda al modelo; no tengo una fila real de `notas` que citar con valores.
- **Los contratos**: anexo de subencargado con OpenRouter, con Cal.com y
  autorización de subcontratación con la flota. Son documentos, no código.
- **La landing (`likida.ai`), que vive en otro repo.** Sigue sin poder
  comprobarse si `/getdemo` muestra aviso o casilla antes de que `/api/lead`
  escriba `contacto_nombre`, `correo` y `telefono` — que es la mitad que falta
  del hallazgo 14.
- **`al_vuelo.ts`, `enrutar.ts` y `avisar.ts`**, y qué campos del ticket lleva el
  aviso al jefe. Cuarta ronda que quedan fuera.
