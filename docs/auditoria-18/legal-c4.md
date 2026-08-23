# Cumplimiento legal — auditoría 18 · continuación 4

**Nota: 4/10** (antes 6). Razón del movimiento: **mirada más profunda** — el
código no cambió y la nota anterior estaba inflada. Hay que decirlo con esas
palabras porque las dos mitades del 6 se cayeron al abrirlas:

- **Los trece abiertos de la c3 siguen abiertos.** El delta de 368 archivos y
  +32,183 líneas no tocó **ni uno**. Verificado abriendo cada archivo, no
  leyendo asuntos de commit: `361f2dc` —el commit que la c3 citó como el que
  ataca el CRÍTICO del decisor— no toca `redactor.ts` (`git show --stat`: diez
  archivos, ninguno es ése).
- **La pieza que sostenía el 6 no hace lo que se dijo que hace.** La c3 anotó en
  "lo que está bien": *"La purga de prospectos la ejecuta código, no un
  párrafo"*. La purga existe y corre — pero borra `contacto_nombre` y nada más
  (`0148:73-82`), mientras el aviso publicado promete que *"tu nombre, puesto,
  **correo y teléfono** se eliminan automáticamente"* (`privacidad.ts:767`). El
  correo y el teléfono de la persona se quedan, y el nombre sobrevive además
  dentro de `prospecto.mensaje_wa`. Eso no es un hueco anotado: es el mismo
  patrón que el rubro ya tiene marcado como su falla más cara —un documento
  público que afirma como hecho algo que el código contradice— y esta vez en la
  parte que se había declarado cerrada.

No bajo a 3 porque el aparato del aviso **existe**, la mayor parte de su texto
es honesta y probable por contenido, y las puertas de las rutas comerciales
(`sesionSuperadmin`, techos, RLS de `prospecto_persona`) están bien puestas.
Pero el ancla del rubro dice *"3 o menos si hay transferencia de datos
personales sin cobertura"*, y `redactor.ts:163` lleva tres pasadas siendo
exactamente eso.

**El riesgo mayor del rubro, hoy:** los dos documentos públicos que Likida
entrega a personas que no son sus clientes —`/aviso/prospectos` y el aviso
simplificado del operador— contienen tres afirmaciones que el código desmiente
línea por línea (el nombre no sale al modelo, el correo y el teléfono se borran
solos, la foto se puede borrar si la pides), y **ninguna de las tres tiene un
ejecutor**: no hay una sola línea en producción que borre un objeto de Storage.

---

## Verificación de los abiertos de la c3

Trece hallazgos abiertos. **Trece REINCIDENTES.** Cero cerrados.

| # (c3) | Hallazgo | Estado | Evidencia leída hoy |
|---|---|---|---|
| 1 | `/aviso/<tenant>` es 404 para toda flota real | **REINCIDENTE** (4ª pasada) | `grep` de las tres columnas sobre `src/`, `scripts/`, `supabase/`: **un** lector (`repo.ts:958`), **un** escritor en `src/` (`admin/qa-motor.ts:135`) y la siembra (`scripts/demo-5k.sql:39-40`). `aviso/[tenant]/page.tsx:69` sigue con `notFound()`. `startup.ts:338` sigue mandando capturar *"en la tabla `tenant`"*. |
| 2 | El Redactor manda el nombre del decisor al modelo | **REINCIDENTE** | `agentes/redactor.ts:163`: `` prospecto.contacto_nombre ? `Contacto: ${prospecto.contacto_nombre}` `` dentro del `dossier` que se manda a `generateResponse({ role:'back_office' })` (`:178-181`). Cero imports de `seudonimo.ts` en el archivo. `privacidad.ts:758` sigue afirmando lo contrario. |
| 3 | La baja por "BAJA" no existe | **REINCIDENTE** | `grep -rn "BAJA" src/lib/likida/agentes/ src/lib/correo/ src/app/api/correo/` → **cero resultados**. `privacidad.ts:766` sigue publicando la instrucción. |
| 4 | El primer toque sale sin liga del aviso por 2 de los 3 canales | **REINCIDENTE** | `mapa-prospectos/mensajes.ts:10-36` (plantillas) y `hrefCorreo`/`hrefWa` (`:58-70`) sin `pieAvisoProspectos`. `agentes/cola.ts:390-397` manda `porQueLoRecibes` y `plantilla.ts:183,318-321` pinta solo esa línea + la URL de la home. |
| 5 | El gate del aviso no es lo primero, y lo que corre delante despacha | **REINCIDENTE** | `processor.ts:894-923` (bloque de oficina con `{ incluirPreguntaLibre: !viajeId, incluirDespacho: !viajeId }`, `:920`) **delante** de `ponerAvisoADisposicion` (`:935`). El comentario que lo justifica sigue en `:888-893`. |
| 6 | El piloto de visión manda la pantalla autenticada al modelo | **REINCIDENTE** | `piloto_vision.ts:144,151,193` (`capturaSegura`) y `:370` (`images: [...]`); `pagina_playwright.ts:835` (`document.body.innerText … slice(0,1800)`). `registro.ts:180` sigue siendo la palanca. |
| 7 | Nada fija la jurisdicción del proveedor | **REINCIDENTE** | `openrouter.ts:271-272`: `provider: { data_collection: 'deny' }`, sin `only` ni `order`, aplicado en `:335,487,803`. `models.ts:83` sigue con `back_office: 'openai/gpt-oss-120b'` y `:30-31` sigue afirmando *"TODO el stack … es de proveedores USA"*. |
| 8 | El correo *adivinado* cuenta como decisor verificado | **REINCIDENTE** | `prospectos-mapa.ts:778`: `personasVerificadas: (p.prospecto_persona ?? []).filter((x) => x.confianza !== 'baja').length`. El contrato en `:242` y el cuerpo en `:278` siguen diciendo "NO inferido". |
| 9 | La credencial revocada conserva su contraseña cifrada | **REINCIDENTE** | `conectores/credenciales.ts:170-175`: solo `update({ activo: false })`. `mantenimiento_de_datos` redefinida por la 0165 (`:215-241`) enumera catorce purgas y `conector_credencial` no está. |
| 10 | `/privacidad` no enumera el contenido de los mensajes ni su salida | **REINCIDENTE** | `app/privacidad/page.tsx:61-69` (nombre, correo, teléfono, fiscales, enlace, registros técnicos — sin el contenido) y `:86` sigue con *"los modelos de lenguaje que **leen los comprobantes**"*. `analista.ts:288` sigue mandando `CON QUIÉN HABLAS: ${opts.usuario.nombre}`. |
| 11 | La foto de perfil vive en un bucket público y el borrado no la alcanza | **REINCIDENTE** | `dashboard/mi-perfil/page.tsx:113-117` y `admin/mi-perfil/page.tsx:70-72` (`getPublicUrl`); `0046:17-19,42-45` sin cambios. La 0155 endureció `comprobantes` (`:426-429`) y no tocó `avatares`. |
| 12 | La consola de Javier cita el art. 32 de la ley abrogada | **REINCIDENTE** | Texto que **se pinta**: `admin/guardia.ts:73` y `admin/escalaciones.ts:272`. Comentarios: `repo.ts:1166`, `processor.ts:231`, `admin/compliance/page.tsx:34`, `privacidad.ts:654`. |
| 13 | El correo del usuario en una cookie que ninguna página menciona | **REINCIDENTE** | `auth/reenvio_enlace.ts:44` (`COOKIE_CORREO`); `grep "cookie" src/app/privacidad/page.tsx` → cero. |

---

## Hallazgos

Dieciocho abiertos: **3 CRÍTICOS · 7 ALTOS · 6 MEDIOS · 2 BAJOS.** Los trece
reincidentes ya están razonados en `legal-c3.md` y aquí van con la evidencia de
hoy, no repetidos entero. Lo nuevo va completo.

---

### 1. [CRÍTICO · REINCIDENTE, 4ª pasada] `/aviso/<tenant>` es 404 para toda flota real: no hay pantalla que capture las tres columnas del aviso

`src/lib/likida/repo.ts:953-967` · `src/app/aviso/[tenant]/page.tsx:63-69` ·
`src/lib/likida/administracion.ts` (`crearFlota`) · `src/lib/saas/fiscal.ts`
(`guardarDatosFiscales`) · `src/lib/likida/processor.ts:935-948` ·
`src/lib/likida/startup.ts:338,350`

**Norma:** `normas/lfpdppp-15-16.yaml` —
> *«Artículo 15. El aviso de privacidad deberá contener, al menos, la siguiente
> información: I. La identidad y domicilio del responsable;»*

> *«Artículo 16 […] II. Cuando los datos personales sean obtenidos por cualquier
> medio electrónico […] deberá ser proporcionado en su modalidad simplificada
> […] y señalar el sitio donde se podrá consultar el aviso de privacidad
> integral.»*

Y el `impacto_en_producto` de la propia ficha: *"Likida no redacta el aviso de la
flota, pero sí tiene que darle el mecanismo para ponerlo a disposición […] Sin
el mecanismo, la flota no puede cumplir aunque quiera."*

**Escenario, con el dato nombrado.** Javier da de alta *Transportes Perla SA de
CV*. `tenant.domicilio_fiscal`, `tenant.url_aviso_privacidad` y
`tenant.contacto_privacidad` quedan en NULL: hoy, sobre el árbol completo, las
escriben **`src/lib/admin/qa-motor.ts:135`** (el sembrador de QA),
`scripts/qa-agentes/orquestador.qa.ts:90` y `scripts/demo-5k.sql:39-40`. Ninguna
pantalla de ninguno de los dos paneles. Entra *Juan Pérez* con su ticket de
diésel → `getDatosResponsable` devuelve `null` porque exige
`razon_social && domicilio` (`repo.ts:963-967`) → `'sin_datos'` →
`processor.ts:936-948` bloquea el mensaje y contesta *"tu empresa aún no ha
terminado de configurar su aviso de privacidad"*. La flota no puede hacer nada:
la pantalla no existe. Y `/aviso/<uuid>` devuelve `notFound()`
(`[tenant]/page.tsx:69`), así que la liga del integral no abre nunca.

**Consecuencia.** El titular es cada operador de cada flota real. El carril del
chofer no arranca; el de oficina sí arranca y **se salta el gate** (hallazgo 9).

**Causa raíz probable.** Las tres columnas nacieron con las migs. 0018/0033/0034
para que el motor las leyera y ninguna fase les adjudicó dueño de captura.

---

### 2. [CRÍTICO · REINCIDENTE] El Redactor manda el nombre del decisor a un modelo externo, y el aviso que se le entrega a esa persona declara expresamente que eso no pasa

`src/lib/likida/agentes/redactor.ts:163` (el dato) y `:178-181` (la salida) ·
`src/lib/likida/privacidad.ts:758` (la promesa) ·
`src/app/admin/vendedores/consola-vendedores.tsx:111-121` (el botón)

**Norma:** `normas/lfpdppp-15-16.yaml` —
> *«Artículo 14. El responsable tendrá la obligación de informar a la persona
> titular, a través del aviso de privacidad, la existencia y características
> principales del tratamiento al que serán sometidos sus datos personales, a fin
> de que pueda tomar decisiones informadas al respecto.»*

> *«Artículo 15 […] II. Los datos personales que serán sometidos a tratamiento
> […] III. Las finalidades del tratamiento…»*

**Escenario, con el dato nombrado.** *Ing. Ramón Treviño, Director de
Operaciones* está en `prospecto.contacto_nombre`. Javier pulsa **Redactar**.
`redactarCorreoFrio` arma:

```ts
prospecto.contacto_nombre ? `Contacto: ${prospecto.contacto_nombre}` : 'Contacto: no capturado',   // :163
prospecto.notas ? `Notas del vendedor: ${prospecto.notas.slice(0, 500)}` : 'Notas: ninguna',      // :165
```

y lo manda a OpenRouter con `role: 'back_office'` (`:178-181`) =
`openai/gpt-oss-120b` (`models.ts:83`). Sale el nombre completo y 500 caracteres
de notas sin filtro: `notasSinPersona`, `lineaDecisor` y `reponerDecisor` no se
importan en este archivo — el único import de `seudonimo.ts` está en
`app/api/admin/mapa-prospectos/mensaje/route.ts:23`.

Y `privacidad.ts:758`, que es lo que pinta `/aviso/prospectos`, le dice a Ramón:

> *"Cuando un programa redacta el primer mensaje, **tu nombre no sale de
> Likida**: la ficha que recibe el modelo de lenguaje lleva un marcador en lugar
> de tu nombre, y sin tus datos de contacto"*

**Verificación del cierre que la c3 dio por hecho:** `git show --stat 361f2dc`
lista diez archivos (`mensaje/route.ts`, `seudonimo.ts`, `aviso/prospectos`,
`privacidad.ts`, `0148`, pruebas y `verificaciones.sql`). `redactor.ts` **no
está**. El asunto del commit citaba el hallazgo; el archivo no se tocó.

**Consecuencia.** Frente a Ramón, Likida es **responsable** (art. 14). Un aviso
que afirma como hecho algo que el código contradice es peor que la omisión: es
el documento con el que se acredita el cumplimiento, y se desmiente con una
línea de `grep`.

**Causa raíz probable.** El arreglo persiguió el archivo que el hallazgo citaba
en vez del **dato** (`contacto_nombre` hacia cualquier modelo).

---

### 3. [CRÍTICO · NUEVO] La purga de prospectos borra el nombre de cabecera y nada más: el correo, el teléfono y el nombre repuesto dentro del mensaje redactado sobreviven, y el aviso dice que "lo único que queda es el registro de la empresa"

`supabase/migrations/0148_prospecto_persona_retencion.sql:73-82` ·
`src/lib/likida/privacidad.ts:766-767` ·
`src/app/api/admin/mapa-prospectos/mensaje/route.ts:101-110` ·
`supabase/migrations/0138_prospecto_persona.sql:4` ·
`src/lib/admin/prospectos-mapa.ts:539-541,676`

**Norma:** `normas/lfpdppp-15-16.yaml` —
> *«Artículo 15 […] IV. Las opciones y medios que el responsable ofrezca a las
> personas titulares para limitar el uso o divulgación de los datos;»*

(El plazo de conservación se apoya además en el art. 11, del que **no hay ficha
`verificado_fuente_primaria` en `normas/`** — lo digo para que nadie lo cite ante
un tercero sin abrir la fuente. La fr. IV basta: el plazo publicado ES la opción
que el responsable ofrece, y es la que no se cumple.)

**Escenario, con los valores.** *Ramón Treviño* entra al censo el 1-ago-2026 con
`contacto_nombre='Ramón Treviño'`, `correo='ramon.trevino@transportesx.mx'`,
`telefono='8112345678'`. Javier le genera el primer toque desde el Cerebro:
`mensaje/route.ts:101-110` escribe

```ts
mensaje_wa: `${reponerDecisor(r.data.mensaje_wa, p.contacto_nombre)}\n${pie}`,   // "Hola Ramón, soy Javier…"
mensaje_correo_asunto: reponerDecisor(r.data.correo_asunto, p.contacto_nombre),
mensaje_correo: `${reponerDecisor(r.data.correo_cuerpo, p.contacto_nombre)}…`,
```

Nadie lo toca nunca más. El 2-ago-2027 corre `purgar_prospecto_persona(365)`:

```sql
delete from public.prospecto_persona pp …                    -- :60-70  ✔ borra las personas
update public.prospecto p
   set contacto_nombre = null, updated_at = p_ahora           -- :74-75  ← SOLO esta columna
 where …
```

Después de la purga, la fila `prospecto` de Ramón contiene todavía:
`correo='ramon.trevino@transportesx.mx'`, `telefono='8112345678'`,
`mensaje_wa='Hola Ramón, soy Javier de Likida…'`, `mensaje_correo='…Ramón…'`, y
`notas` con lo que el investigador escribió en prosa. La función devuelve el
conteo de `prospecto_persona` borradas y `mantenimiento_de_datos` lo publica
como `prospectoPersonasPurgadas` — la cifra dice que la purga corrió.

Que `prospecto.correo`/`prospecto.telefono` son **de la persona** y no de la
empresa lo dice la migración que creó la libreta: *"`prospecto` guarda UN
contacto (`contacto_nombre`, `correo`, `telefono`) y una empresa tiene varias"*
(`0138:4`), y el mapa los pinta juntos como el decisor
(`prospectos-mapa.ts:539-541`).

Y el aviso público que Ramón recibió con ese mismo correo dice
(`privacidad.ts:767`):

> *"**Si no contestas nunca, también se borran solos:** a los 12 meses sin
> ningún contacto, tu nombre, puesto, **correo y teléfono** se eliminan
> automáticamente. **Lo único que queda es el registro de la empresa** (nombre,
> giro, plaza), que no es un dato tuyo."*

*Intento de refutación, que no prospera:* podría decirse que la purga apunta a
`prospecto_persona` y que el par de cabecera es "de la empresa". Lo desmienten
tres cosas del propio repo: el comentario de la 0138 citado arriba; que el
`update` de `:74` existe justamente porque *"el contacto «de cabecera» del
prospecto es la misma clase de dato"* (`0148:73`) — o sea, ya se reconoció que
esa fila es personal y se borró **una** de sus tres columnas; y que
`scoreCierre` puntúa `telefono`+`correo`+`contacto_nombre` como el mismo
decisor (`prospectos-mapa.ts:556`).

**Consecuencia.** El titular es cada persona del censo (33,065 filas hoy). Se
publica un plazo de conservación, se ejecuta una purga que reporta éxito, y el
dato que sirve para volver a contactarla —su correo y su teléfono de trabajo— se
conserva indefinidamente, junto con un texto que la nombra. Es el mismo tipo de
falla que el hallazgo 2 (documento público que afirma un hecho falso), agravado
porque aquí **el mecanismo existe y su existencia es lo que da confianza**: quien
audite va a leer la 0148, ver que corre desde el cron y darla por buena.

**Causa raíz probable.** El plazo se diseñó alrededor de la tabla nueva
(`prospecto_persona`) y la limpieza de la fila vieja se añadió como remate, sobre
una sola columna; los tres campos de texto generado (`mensaje_wa`,
`mensaje_correo_asunto`, `mensaje_correo`) ni siquiera existían como categoría
cuando se escribió la purga.

---

### 4. [ALTO · NUEVO] No existe ejecutor de la cancelación: ninguna línea de producción borra un objeto de Storage, ni un operador, ni un gasto — y el aviso le dice al operador "puedes pedir que la foto se borre"

`src/lib/likida/privacidad.ts:528` (la promesa) ·
`supabase/migrations/0165_storage_sin_delete_directo.sql:20-26,143-148` (marca,
no borra) · `src/app/dashboard/arco/page.tsx:41-66` (la resolución es texto
libre) · `src/lib/likida/repo.ts:1276-1305` (`resolverSolicitudArco`) ·
`src/lib/likida/hitos_viaje.ts:95-113` (`sellarHito`, sin comprobación) ·
`src/lib/likida/analytics.ts:949-969` (`getEventosConductores`, nominal)

**Norma:** `normas/lfpdppp-15-16.yaml` —
> *«Artículo 15 […] V. Los mecanismos, medios y procedimientos para ejercer los
> derechos ARCO, de conformidad con lo dispuesto en esta Ley, y»*

**Escenario, con el dato nombrado.** *Juan Pérez* compra su medicamento en el
camino y lo mete a gastos. `sanitizarProducto` hace bien su parte: detecta
`"METFORMINA 850MG 30 TABS"` y descarta el campo (`intake/sanitizar.ts:111-118`).
Pero la **foto entera** ya se subió a
`comprobantes/{tenant}/{viaje}/{hash}.jpg` (`intake/almacen.ts:82,100-108`) y el
panel la sirve con URL firmada a su patrón (`ligaComprobante`, `:132-144`). Juan
escribe **PRIVACIDAD** y pide que se borre esa foto — que es literalmente lo que
el aviso de su empresa le ofrece:

> *"…un filtro lo detecta y lo excluye: no se guarda, no participa en tu
> liquidación, y **puedes pedir que la foto se borre**."* (`privacidad.ts:528`)

La solicitud se registra (`processor.ts:229-244` — eso sí funciona). El contralor
abre `/dashboard/arco`, teclea *"listo, se borró"* en el campo `resolucion` y
pulsa Responder. `resolverSolicitudArco` (`repo.ts:1276-1305`) hace un `update`
de estado + un WhatsApp con ese texto. **No borra nada.** Y no puede: un `grep`
de `.remove(` sobre `src/` completo devuelve **una** llamada a Storage, en
`src/lib/admin/qa-motor.ts:279` — el sembrador de QA. Ninguna en el producto.

Lo mismo por los otros lados de la C:

- **Los huérfanos que el barrido marca no los borra nadie.** La 0165 cambió el
  `delete from storage.objects` por un `insert into storage_huerfano_candidato`
  (`:143-148`) porque Supabase lo prohíbe, y su cabecera dice *"el borrado real
  lo hace el servidor con la Storage API"* (`:23-24`). `grep -rn
  "storage_huerfano_candidato" src/ scripts/ .github/` → **cero resultados**.
  `borrado_en` no lo sella nadie. En producción ya hay 25 objetos marcados
  (`0165:36`) esperando a un borrador que no existe.
- **Ni un operador ni un gasto se borran.** No hay `delete` sobre `operador` ni
  sobre `gasto` en todo `src/` (los únicos `delete()` del dominio son
  `wa_mensaje_procesado`, `prospecto_contacto`, `desglose_peaje` y los de
  cobranza).
- **La limitación de uso tampoco tiene ejecutor.** El aviso ofrece oponerse al
  seguimiento de hitos, que declara finalidad no necesaria
  (`privacidad.ts:545`). `sellarHito` (`hitos_viaje.ts:95-113`) no consulta
  ninguna bandera, y `getEventosConductores` (`analytics.ts:953,962`) sigue
  pintando *"Juan Pérez · ya llegué 14:20"* al panel sin filtrar
  `oposicion_automatizada`. La única oposición que enciende algo es la del cuadre
  (`processor.ts:268-282` → `desde_db.ts:53`), que está bien hecha y es la
  excepción.

**Consecuencia.** El titular es el operador; la responsable es la flota, que no
puede cumplir aunque quiera —el mismo hueco de producto del hallazgo 1—. Aquí
duele más porque el dato que sobrevive puede ser **sensible** (art. 2 fr. VI:
salud), y `normas/lfpdppp-59.yaml` es explícita: *«En tratándose de infracciones
cometidas en el tratamiento de datos sensibles, las sanciones podrán
incrementarse hasta por dos veces, los montos establecidos.»*

No es CRÍTICO porque lo que el aviso promete literalmente es *"puedes pedir"*, y
pedir sí funciona: la solicitud se registra, aparece en `/dashboard/arco` y el
plazo del art. 31 corre. Lo que no existe es la mitad de atrás.

**Causa raíz probable.** El camino ARCO se construyó como bandeja
(registrar → contestar → cerrar el plazo) y nunca como ejecución; la 0165, al
cambiar borrar por marcar, dejó el borrador como "trabajo del servidor" sin
que ningún servidor lo reclamara.

---

### 5. [ALTO · NUEVO] Las dos purgas de privacidad pueden fallar cada noche y el cron sale en verde: la 0165 las envolvió en `exception when others` y nadie lee `fallos`

`supabase/migrations/0165_storage_sin_delete_directo.sql:212-241,260,265` ·
`src/app/api/cron/purgar/route.ts:99-127` ·
`src/lib/admin/salud.ts:105-113` · `src/app/api/health/route.ts:70-79`

**Norma:** `normas/lfpdppp-15-16.yaml` —
> *«Artículo 15 […] IV. Las opciones y medios que el responsable ofrezca a las
> personas titulares para limitar el uso o divulgación de los datos;»*

El plazo publicado es esa opción: `privacidad.ts:767` (*"a los 12 meses […] se
eliminan automáticamente"*) y `app/privacidad/page.tsx:107` (*"los registros
operativos del sistema **sí tienen plazos que corren solos**"*).

**Escenario, con valores.** Antes de la 0165, las catorce purgas iban en fila:
la que lanzaba se llevaba a las demás, el cron devolvía **500** y
`alertarOperador('cron.purgar', …)` mandaba correo. La 0165 arregló el "todo o
nada" —correctamente— metiendo cada purga en su bloque:

```sql
begin conversaciones_purgadas := public.purgar_wa_conversacion(180, p_ahora);
exception when others then fallos := fallos || ('wa_conversacion: ' || sqlerrm); end;   -- :224-225
begin personas_purgadas := public.purgar_prospecto_persona(365, p_ahora);
exception when others then fallos := fallos || ('prospecto_persona: ' || sqlerrm); end; -- :228-229
```

Ahora suponga que `purgar_prospecto_persona` empieza a fallar —un
`lock_not_available` sobre `prospecto` mientras el enriquecedor escribe sus
lotes, o un `55P03` por el `update` masivo—. Lo que pasa: la RPC devuelve 200 con
`fallos: ["prospecto_persona: canceling statement due to lock timeout"]`; el cron
(`route.ts:100-126`) comprueba `r.error` (que es `null`), lee **solo**
`data.parcial` y termina con `logger.info('cron.purgar.ok', {...data, vueltas})`
y `registrarLatido('purgar', parcial ? 'parcial' : 'ok', { vueltas })`. `grep
-rn "fallos" src/` no devuelve ni un lector de esa llave. Resultado: evento
llamado **`.ok`**, HTTP **200**, y el dato personal de todos los prospectos
fríos se queda un año más — cada noche, indefinidamente.

*Intento de refutación, y hasta dónde llega:* la 0165 sí propaga la señal —
`'parcial' … or cardinality(fallos) > 0` (`:265`)— así que el cron entra al
`while` y emite `logger.warn('cron.purgar.parcial', { vuelta, transcurridoMs })`
(`route.ts:122`), que sí llega a Sentry. Ese guardarraíl existe y hay que
reconocerlo. Lo que **no** cierra:

1. El `warn` no lleva `fallos`: dice que la corrida quedó a medias, no **cuál**
   purga murió. La cabecera de la 0165 declara justo lo contrario como su
   objetivo: *"el cron puede gritar con el nombre de la que falló en vez de con
   un error opaco"* (`:33-34`).
2. `parcial` ya es cierto por motivos benignos: `limpiar_storage_huerfano` tiene
   un presupuesto propio de 20 s y devuelve `parcial: true` en cuanto el catálogo
   no cabe (`0165:75,97`). Una señal que es verdadera casi todas las noches no
   distingue nada.
3. El latido guarda `'parcial'`, pero `juzgarLatido` (`salud.ts:105-113`) devuelve
   `estado: 'ok'|'vencido'|'sin_latido'` según la **hora**, y `/api/health:71`
   mapea exactamente ese campo. `ultimoEstado` no lo consume ni una pantalla
   (`grep`: solo su propia definición). En `/api/health` y en
   `/admin/salud-sistema`, el cron `purgar` sale verde.

**Consecuencia.** Las dos purgas que un aviso público promete
(`purgar_wa_conversacion` a 180 días y `purgar_prospecto_persona` a 365) son
justamente las que pueden apagarse sin que nadie lo note. Es la definición de
falla silenciosa, y el rubro entero descansa en que estos plazos corran.

**Causa raíz probable.** El aislamiento por bloques se hizo del lado de SQL
(que es lo correcto) y el contrato de salida creció con una llave nueva
(`fallos`) que el llamador nunca aprendió a leer.

---

### 6. [ALTO · NUEVO] `/aviso/prospectos` se publica sin la identidad ni el domicilio del responsable, que son la fracción I del art. 15 — y están puestos a `null` en el código

`src/app/aviso/prospectos/page.tsx:20-26,32` ·
`src/lib/likida/privacidad.ts:729-730,738`

**Norma:** `normas/lfpdppp-15-16.yaml` —
> *«Artículo 15. El aviso de privacidad deberá contener, al menos, la siguiente
> información: I. La identidad y domicilio del responsable;»*

**Escenario, con los valores.** Ramón abre la liga que va al pie de su primer
toque. La página construye el aviso con:

```tsx
const RESPONSABLE = {
  razonSocial: null as string | null,   // page.tsx:23
  domicilio:   null as string | null,   // page.tsx:24
  contacto: 'likida.ai@gmail.com',
};
```

y `avisoProspectos` sustituye (`privacidad.ts:729-730`), así que lo que Ramón lee
en la primera línea del documento es, literalmente:

> **🔴 razón social pendiente 🔴** (Likida), con domicilio en **🔴 domicilio
> pendiente 🔴**, es la responsable de tus datos personales.

**Consecuencia.** El único documento con el que Likida —**responsable**, no
encargada, frente a estas 33 mil personas— acredita su cumplimiento carece del
primer elemento obligatorio del art. 15. Ramón no puede saber contra qué persona
moral reclamar ni a qué domicilio presentar un ARCO por escrito, que es el otro
medio que el propio aviso ofrece. El mismo hueco existe en el aviso integral de
la flota (`privacidad.ts:504`), pero allá el 404 del hallazgo 1 impide que se
publique; aquí **se publica**.

Lo pongo en ALTO y no en CRÍTICO porque la página **lo confiesa**
(`page.tsx:39-44`: *"Falta capturar la razón social y el domicilio fiscal […]
Aparece señalado en vez de quedar en blanco"*), que es la decisión correcta
frente a inventarlo, y porque el canal de contacto sí existe y es real. Pero un
aviso que declara su propio incumplimiento sigue incumpliendo, y este está vivo
en producción detrás de cada correo frío.

**Causa raíz probable.** No es código: es un dato del dueño que ninguna fase
adjudicó. Es la misma casilla vacía que el hallazgo 1, un piso más arriba —
mientras Likida no tenga razón social y domicilio escritos en alguna parte,
ninguno de sus tres avisos está completo.

---

### 7. [ALTO · REINCIDENTE] La baja prometida en el aviso de prospectos no existe: nada en el código lee un "BAJA"

`src/lib/likida/privacidad.ts:766` · `src/app/api/correo/entrante/route.ts:27-44`
· `src/lib/likida/agentes/cola.ts:370-397`

**Norma:** `normas/lfpdppp-15-16.yaml` — *«Artículo 15 […] IV. Las opciones y
medios que el responsable ofrezca a las personas titulares para limitar el uso o
divulgación de los datos;»*

Verificado hoy: `grep -rn "BAJA"` sobre `src/lib/likida/agentes/`,
`src/lib/correo/` y `src/app/api/correo/` devuelve **cero**. El buzón entrante
sigue siendo *"el buzón de facturas de proveedor"*, resuelve tenant por el token
del destinatario y descarta explícitamente el texto humano. No hay columna de
opt-out en `prospecto` y `enviarPiezaPorCorreo` no consulta ninguna antes de
mandar. La cadencia solo frena 48 h (`cola.ts:376`): **le vuelven a escribir**.

---

### 8. [ALTO · REINCIDENTE] El primer toque sale sin la liga del aviso por dos de los tres canales, incluido el único que manda solo

`src/app/admin/mapa-prospectos/mensajes.ts:10-36,58-70` ·
`src/lib/likida/agentes/cola.ts:390-397` · `src/lib/correo/plantilla.ts:183,318-321`

**Norma:** `normas/lfpdppp-15-16.yaml` — *«Artículo 16 […] II. […] deberá ser
proporcionado en su modalidad simplificada […] y señalar el sitio donde se podrá
consultar el aviso de privacidad integral.»*

Verificado hoy: solo `mapa-prospectos/mensaje/route.ts:100-103` añade
`pieAvisoProspectos()`. Las plantillas deterministas (el caso masivo del
prospecto no trabajado) no lo llevan, y `enviarPiezaPorCorreo` —el único camino
que sale por Resend sin que nadie lo pegue a mano— manda `cuerpo_final ?? cuerpo`
con el pie *"Recibes este correo porque tu empresa publicó una vacante…"* y la
URL de la home, nada más.

---

### 9. [ALTO · REINCIDENTE, agravado] El gate del aviso sigue sin ser lo primero, y lo que corre delante despacha a terceros

`src/lib/likida/processor.ts:894-923` frente al gate en `:935` ·
`src/lib/likida/oficina_wa.ts:157-167` · `src/lib/agents/analista.ts:288`

**Norma:** `normas/lfpdppp-15-16.yaml` — art. 16 fr. II (transcrito arriba), más
el `contexto_verificado` de la ficha: *"lo exigible en el canal es la modalidad
SIMPLIFICADA […] antes de cualquier tratamiento"*.

Verificado hoy: el bloque de oficina sigue delante del gate y sigue llamando
`atenderTextoOficina(…, { incluirPreguntaLibre: !viajeId, incluirDespacho: !viajeId })`
(`:920`). Sin viaje abierto eso manda el **nombre** del usuario
(`analista.ts:288`) y 1,500 caracteres de su texto a OpenRouter, y el despacho
crea viajes y manda WhatsApp a un **tercero** (otro operador), todo antes de
`ponerAvisoADisposicion`. Agravante intacta: como el gate está de facto siempre
en `sin_datos` (hallazgo 1), el único camino que abre en una flota real es
justo el que se puso delante de él.

---

### 10. [ALTO · REINCIDENTE] El piloto de visión manda la pantalla de un portal ya autenticado a un modelo externo, y ningún aviso lo menciona

`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:144,151,193,370` ·
`.../pagina_playwright.ts:835` · `src/app/privacidad/page.tsx:86` ·
`src/lib/likida/privacidad.ts:604`

**Norma:** `normas/lfpdppp-2-XII-XX.yaml` — *«Artículo 35. Cuando el responsable
pretenda transferir los datos personales a terceros nacionales o extranjeros,
distintos de la persona encargada deberá comunicar a éstos el aviso de
privacidad y las finalidades…»*, más art. 15 fr. II.

Verificado hoy, idéntico: `capturaSegura` en `:144,151,193`, `images: [captura]`
en `:370`, y `document.body.innerText … slice(0,1800)` en
`pagina_playwright.ts:835`. Los dos avisos siguen acotando los modelos a fotos de
comprobantes y texto de mensajes. Sigue ALTO y no CRÍTICO porque
`FACTURACION_PILOTO` está apagada (`registro.ts:180`) — y el doc del demo manda
encenderla.

---

### 11. [MEDIO · REINCIDENTE] Nada en el código fija la jurisdicción del proveedor, mientras dos archivos afirman que el stack es 100% USA "por regla legal"

`src/lib/llm/openrouter.ts:271-272` (aplicado en `:335,487,803`) ·
`src/lib/llm/models.ts:30-31,83,102`

**Norma:** `normas/lfpdppp-2-XII-XX.yaml` — el `contexto_verificado`: *"Cadena
real del proyecto: la FLOTA es responsable. LIKIDA es persona encargada.
OPENROUTER es a quien Likida contrata, y Google/Anthropic/OpenAI están debajo de
OpenRouter"*.

Verificado hoy: `PROVIDER_OPTS = { provider: { data_collection: 'deny' }, usage:
{ include: true } }` y nada más — sin `provider.only`, sin `order`, sin sufijo de
proveedor en los slugs. `back_office: 'openai/gpt-oss-120b'` y `extraccion:
'openai/gpt-oss-20b'` son open-weight servidos por terceros de hospedaje, y por
`back_office` pasa el dossier del hallazgo 2. La regla que el repo llama legal la
aplica el criterio de quien escribió el slug; una rotación por
`LIKIDA_MODEL_BACK_OFFICE` la rompe sin que nada se entere.

---

### 12. [MEDIO · REINCIDENTE] El correo *adivinado* de una persona cuenta como decisor verificado en el score que decide a quién se le escribe

`src/lib/admin/prospectos-mapa.ts:778` frente a `:242` y `:278` ·
`supabase/migrations/0138_prospecto_persona.sql:41-50`

**Norma:** el aviso lo declara con honestidad (`privacidad.ts:748`: *"Algunos
correos no se leyeron en ninguna parte: se dedujeron […] y así quedan
marcados"*) y el consumidor ignora justo esa marca. La 0138 solo prohíbe que un
`inferido` sea `alta`; `media` es el default de la columna (`:47`), y el filtro
mira `confianza`, no `origen`.

---

### 13. [MEDIO · REINCIDENTE] La credencial revocada conserva su contraseña cifrada para siempre, y ninguna purga la alcanza

`src/lib/likida/conectores/credenciales.ts:157-175` ·
`supabase/migrations/0165_storage_sin_delete_directo.sql:215-241`

Verificado hoy: `desactivarCredencial` sigue haciendo solo
`update({ activo: false })`, y la lista de catorce purgas de la 0165 no menciona
`conector_credencial`. Se conserva un secreto **todavía válido del otro lado**
mucho después de que su finalidad terminó.

---

### 14. [MEDIO · REINCIDENTE] `/privacidad` no enumera el contenido de los mensajes ni su salida al analista, y ahí Likida es responsable, no encargada

`src/app/privacidad/page.tsx:61-69,86` · `src/lib/likida/oficina_wa.ts:157-167` ·
`src/lib/agents/analista.ts:288`

**Norma:** `normas/lfpdppp-15-16.yaml` — *«Artículo 15 […] II. Los datos
personales que serán sometidos a tratamiento…»*

Verificado hoy: la lista sigue sin el contenido de los mensajes y la cláusula de
terceros sigue diciendo *"los modelos de lenguaje que leen los comprobantes"*.
El aviso del operador **sí** se corrigió (`privacidad.ts:604`), lo que hace la
asimetría más visible. Se suma un caso nuevo del mismo tipo:
`agents/copiloto-tools.ts:252` manda al modelo `nombre: v.nombre ?? v.email` de
cada vendedor de Likida.

---

### 15. [MEDIO · REINCIDENTE] La foto del usuario vive en un bucket público, no está en la lista del art. 15 fr. II, y el borrado de cuenta no la alcanza

`src/app/dashboard/mi-perfil/page.tsx:113-117` ·
`src/app/admin/mi-perfil/page.tsx:70-72` ·
`supabase/migrations/0046_perfil_avatar.sql:17-19,42-45`

Verificado hoy: sin cambios. Y el delta lo subraya: la 0155 endureció el bucket
`comprobantes` con `file_size_limit` y `allowed_mime_types` (`:426-429`) y no
tocó `avatares`, que sigue siendo el único bucket `public = true` con policy
`for select to anon`.

---

### 16. [MEDIO · NUEVO] El redactor del logger no cubre NOMBRES, y el nombre de un chofer sale entero a Sentry desde un `logger.error` — mientras el anexo de subencargados declara que Sentry recibe "warn y error, ya redactados"

`src/lib/likida/crear_viaje_wa.ts:847-851` · `src/lib/logger.ts:51-66,101-109` ·
`docs/conocimiento/52-anexo-subencargados.md:62,96-101` ·
`src/lib/meta/telefono_en_logs.test.ts:52-67`

**Norma:** `normas/lfpdppp-2-XII-XX.yaml` —
> *«XII. Persona encargada: Persona física o jurídica que sola o conjuntamente
> con otras trate datos personales por cuenta del responsable;»*

Sentry es persona encargada y está declarada (`app/privacidad/page.tsx:86`:
*"monitoreo de errores"*), así que **no** es una transferencia del art. 2 fr. XX.
Lo que falla es la afirmación interna sobre qué le llega.

**Escenario, con el dato nombrado.** El jefe de tráfico escribe por WhatsApp
*"nuevo viaje para Juan Pérez, Puebla a Monterrey"*. `despacho_wa.ts:378` llama
`resolverOperadorPorNombre(tenantId, intencion.operador)`. Hay dos "Juan Pérez"
activos → `OperadorNombreAmbiguo` → `crear_viaje_wa.ts:847-851`:

```ts
logger.error('operador.nombre_ambiguo', {
  tenantId,
  buscado: buscado.join(' '),          // "juan perez"
  operadores: e.candidatos.map((c) => c.operadorId),
});
```

`warn` y `error` se replican a Sentry **después** de `redactarTexto`
(`logger.ts:101-109`), cuyo `SENSIBLE` alterna UUID, RFC, teléfono, CLABE y
tarjeta (`:51-66`). **No hay regla para nombres.** `tenantId` sale huellado, los
ids de operador huellados, y `"juan perez"` sale entero.

El anexo dice de Sentry: *"Solo `warn` y `error`, **ya redactados**"*
(`52-anexo…:62`) y detalla qué se borra —RFC y teléfono— y qué se huella —el
UUID— sin mencionar que un nombre propio pasa intacto (`:103-116`).

**Consecuencia.** El titular es el operador de una flota cliente, y el
responsable frente a él es la flota: lo que se le entrega a esa flota como
descripción del subencargado es más estrecho que lo que ocurre. Es MEDIO —no
ALTO— porque el destinatario está declarado, el volumen es bajo y un nombre de
pila sin teléfono ni RFC identifica poco por sí solo. Lo que lo mantiene abierto
es que la prueba de vigilancia que nació de SEG-7
(`telefono_en_logs.test.ts:52-67`) mira **dos archivos** y **una** variable
(`telefono`): el día que alguien añada `{ nombre }` a un log, nada falla.

**Causa raíz probable.** El redactor se diseñó sobre la asimetría de entropía
(`logger.ts:41-47`: se huella lo que no se puede adivinar, se borra lo que sí) y
un nombre no cae limpiamente en ninguno de los dos lados, así que quedó fuera de
la regla sin que nadie escribiera esa decisión.

---

### 17. [BAJO · REINCIDENTE] La consola de Javier sigue citando el art. 32 de la ley abrogada, en texto que se pinta

`src/lib/admin/guardia.ts:73` · `src/lib/admin/escalaciones.ts:272` ·
`src/lib/likida/privacidad.ts:654` · `src/lib/likida/repo.ts:1166` ·
`src/lib/likida/processor.ts:231` · `src/app/admin/compliance/page.tsx:34`

El plazo vigente es el art. 31; el 32 es de la ley abrogada el 21-mar-2025.
`/dashboard/arco` ya se corrigió (`page.tsx:24,93`), la consola del superadmin no.
Sigue viva la nota de `privacidad.ts:654` que invita a bajar el plazo a 15 — el
día que alguien la siga, el producto incumple citando la ley.

---

### 18. [BAJO · REINCIDENTE] El correo del usuario se guarda en una cookie del navegador y ninguna página lo dice

`src/lib/auth/reenvio_enlace.ts:44,52-66` · `src/app/privacidad/page.tsx` (cero
menciones de "cookie" en sus ocho secciones)

Fundamento: Reglamento de la LFPDPPP art. 30. **Sigue sin ficha
`verificado_fuente_primaria` en `normas/`**; lo cito por el criterio del repo
(`11-datos-personales.md` §3) y hay que abrir la fuente antes de redactar el
párrafo. Daño material pequeño: la cookie es `httpOnly` y `secure`.

---

## Lo que revisé y está bien

- **La seudonimización del Cerebro sigue siendo correcta y completa.**
  `mensaje/seudonimo.ts` quita correos, teléfonos y cada nombre suelto de ≥3
  letras; `mensaje/route.ts:71-83` arma la ficha con `notasSinPersona` y
  `lineaDecisor`, y el nombre vuelve **después** de la llamada (`:101-103`). Es
  el contraejemplo exacto de `redactor.ts`.
- **La puerta de las rutas del Cerebro.** `mapa-prospectos/route.ts:22-23`,
  `textos/route.ts:30-31` y `mensaje/route.ts` pasan por `sesionSuperadmin()`
  **antes** de leer nada; `textos` va por POST con tope de 2,000 ids y filtro de
  UUID (`:36-42`), no por query string.
- **`purgar_prospecto_persona` respeta el trato vivo y el freno explícito.**
  `0148:63-70`: solo estados `nuevo|contactado|perdido`, solo sin toque en
  `prospecto_contacto` dentro del plazo, y `conservar_hasta` bloquea la purga
  (para un ARCO en curso). La función está revocada de
  `public/anon/authenticated` (`:110-112`). Lo que le falta es alcance
  (hallazgo 3), no criterio.
- **`limpiar_storage_huerfano` no destruye evidencia fiscal.** Borra —hoy,
  marca— solo huérfanos **por estructura** (flota inexistente o viaje
  inexistente), con gracia de 7 días y dos anti-join contra
  `comprobante_huerfano.ruta_imagen` y `liquidacion_historico.pdf_url`
  (`0165:124-142`). Un objeto cuya ruta no reconoce queda en NULL y **no** se
  toca. El razonamiento del CFF art. 30 está escrito (`0162:281-320`).
- **El filtro de datos sensibles del ticket.** `intake/sanitizar.ts:74-98,111-118`
  descarta el campo `producto` entero ante señales de salud, vida sexual o
  creencias, en vez de sustituirlo por una marca —*"guardar la etiqueta del dato
  sensible es guardar el dato sensible"* (`:105-109`)— y su propio comentario
  declara el límite que no cubre (`:47-51`).
- **Las rutas de export tienen puerta de rol, no solo de tenant.**
  `api/export/liquidaciones/route.ts:25-64`: `resolverTenantApi`, doble rate
  limit (IP y tenant), `puedeVerArea(rol,'dinero')` y `puedeExportar(rol)`. El
  operador no baja el CSV de sus compañeros.
- **`alertarOperador` no filtra por correo.** `observability/alerta.ts:140` pasa
  cada valor por `redactarTexto` antes de meterlo en el cuerpo del correo.
- **La oposición del art. 26 fr. II sigue honrada donde importa.**
  `processor.ts:268-282` enciende la bandera solo si estaba en NULL,
  `desde_db.ts:53` la lee y manda la liquidación a revisión humana, y el agregado
  en SQL la filtra (`0150:341`: `where o.tenant_id = p_tenant and
  o.oposicion_automatizada is null`). El único llamador de
  `getStatsPorOperador` (`dashboard/agentes/liquidacion/page.tsx:75`) no pasa
  `{ nominal: true }`.
- **`ficha_cliente`, la tool nueva del copiloto, no manda personas al modelo.**
  `admin/ficha-cliente.ts:47,83` solo selecciona `id, nombre, plan, created_at`
  del tenant.
- **El bucket `comprobantes` sigue privado, ahora con techo de tipo y peso.**
  `0155:426-429` (8 MB, `image/*` + `application/pdf`), servido con URL firmada
  de una hora (`almacen.ts:132-144`).
- **`3b69836` es real y está bien hecho.** `conv.ts:327,345` y los logs de
  `meta/client.ts` usan `destinatarioEnmascarado`, exportado para que no haya dos
  copias de la regla; la prueba demuestra primero **la premisa** —que el redactor
  no cacha un teléfono con espacios— antes de probar el arreglo.

---

## Lo que NO alcancé a revisar

- **El texto vigente de la LFPDPPP más allá de los artículos transcritos en las
  cinco fichas.** Los arts. 8, 9, 11, 21, 22 y 31 que aparecen en este reporte y
  en el código salen de `docs/conocimiento/11-datos-personales.md`, no de la
  fuente primaria abierta por mí. **Sigue sin ficha verificada el plazo ARCO
  (art. 31)**, que es el número que dos pantallas imprimen, y el art. 11
  (conservación), que es el fundamento de tres hallazgos de esta ronda.
- **`bitacora_auditoria` y `evento_seguridad` a fondo.** Confirmé que
  `administracion.ts:322,436` escriben `{ nombre, telefono }` y la fila editada
  del operador en `detalle`, y que la 0155 los purga a 365 días. **No** verifiqué
  qué otros campos personales entran por los otros catorce llamadores de
  `anotar()`, ni si `/privacidad:107` debería enumerar ese plazo.
- **`prospecto.notas` como depósito de datos personales.** El deduplicador,
  el enriquecedor y el investigador escriben prosa ahí; `notasSinPersona` la
  filtra para el Cerebro pero `redactor.ts:165` la manda cruda. No construí el
  caso con valores porque no tengo una fila real de `notas` que citar.
- **`al_vuelo.ts`, `enrutar.ts` y `avisar.ts`**, y qué campos del ticket lleva el
  aviso al jefe. Tercera ronda que quedan fuera.
- **Los contratos**: anexo de subencargado con OpenRouter y autorización de
  subcontratación con la flota. Son documentos, no código; `models.ts:26-27` los
  marca como pendiente #3.
- **La landing (`likida.ai`), que vive en otro repo.** Sigue sin poder
  comprobarse si `/getdemo` muestra aviso o casilla antes de escribir
  `contacto_nombre`, `correo` y `telefono` en `prospecto` — y `scoreCierre:272`
  premia con +20 a esa fuente precisamente porque "ya hay permiso".
- **La 0164 (dedup de fotos) desde el ángulo de retención.** Verifiqué que el
  nombre del objeto es el hash del contenido y que `upsert: true` hace que el
  reenvío reescriba su propio objeto (`almacen.ts:82,107`), así que no se
  acumulan copias. **No** verifiqué qué pasa con la foto cuando el `insert` del
  gasto se rechaza por `uq_gasto_wamid`: la subida ocurre antes y no revisé si
  algo la reclama.
