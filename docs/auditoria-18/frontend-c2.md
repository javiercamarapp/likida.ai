# Frontend — auditoría 18 · continuación 21-ago

**Nota: 5/10** (antes 6). Razón del movimiento: **deuda que cobró factura**. La
ronda 18 nombró el patrón dominante del rubro —«la pantalla afirma lo que no
midió»— y dejó siete hallazgos abiertos. En las 24 horas siguientes entraron
~500 líneas nuevas de panel (`mapa-prospectos/[id]/detalle.tsx`, los filtros del
Cerebro, el enrutado del Agente de Facturas) y **ninguno de los siete se tocó**,
mientras el código nuevo repite el patrón tres veces: el panel del cliente
enruta un ticket con dos entradas menos que el motor que de verdad lo va a
facturar, y dos rótulos de pantalla describen una fórmula que dos migraciones ya
reemplazaron. No es que el rubro empeorara de golpe: es que la advertencia se
escribió, el código siguió y la advertencia no se leyó.

**El riesgo mayor hoy:** hay dos opiniones sobre quién factura un ticket. El
`/dashboard/agentes/facturas` recalcula `enrutar()` por su cuenta con menos
datos que el cron y que el aviso de WhatsApp, así que la lista «Te toca a ti»
puede mandar al encargado a capturar a mano exactamente lo que la máquina va a
hacer sola.

---

## Hallazgos

### [ALTO] El panel del cliente enruta con dos entradas menos que el motor: manda al encargado tickets que la máquina va a facturar sola

`src/app/dashboard/agentes/facturas/page.tsx:102` y `src/app/dashboard/agentes/facturas/vista.tsx:61`

La vista vuelve a llamar `enrutar()` en el cliente, pero le pasa dos cosas
distintas de las que le pasan el cron y el aviso:

| entrada | motor | panel |
|---|---|---|
| `sabeOperarlo` | `portalesOperables()` — escritos **+ pilotables** (`api/cron/facturar/route.ts:425`, `facturacion/avisar.ts:68`) | `PORTALES_CONOCIDOS` — **solo los escritos** (`page.tsx:102`) |
| `cuentaCompartida` | `cuentasCompartidas(tenantId)` (`facturacion/al_vuelo.ts:233` y `:411`) | **omitido** → default `false` (`vista.tsx:61`) |

El propio `adaptadores/registro.ts:188-193` escribe la regla que el panel rompe,
textual: *«Es la lista que el cron y el aviso tienen que mirar — mirar solo
`PORTALES_CONOCIDOS` con el piloto encendido mandaría al encargado tickets que
la máquina va a intentar sola.»*

Escenario 1, con valores. `FACTURACION_PILOTO=si`. Adaptador escrito hay **uno**
(`TABLA` → `capufe`, `registro.ts:130`); comercios en el registro, **37**, de los
cuales 16 traen `camposPendientes`, así que ~20 quedan `COMERCIOS_PILOTABLES`
(`registro.ts:184`). Entra un ticket de G500 Sureste de $3,180: `portalesOperables()`
lo incluye → el cron lo vuela y `avisar.ts` **no** le manda WhatsApp al encargado
(solo manda lo que `enrutar` marcó para una persona). El panel, con
`PORTALES_CONOCIDOS`, lo clasifica `sin_robot` y lo pinta bajo **«Te toca a ti»**
con la píldora «A mano» (`cola-jefe.tsx:71-80`, el `title` en `:76`). El encargado abre el portal y
captura un CFDI que el robot ya está emitiendo en la misma ventana.

Escenario 2, con valores. La flota guarda su cuenta de IAVE en el cofre
(`/dashboard/conexiones` → `conectores/portales_facturacion.ts`, uno de los 11
comercios con `requiereCuenta`). Entra un peaje de $1,240. `al_vuelo` ve
`cuentaCompartida = true` y lo saca de `requiere_cuenta` (`enrutar.ts:106`); el
panel, con el default `false`, lo sigue pintando **«Tu cuenta»** y el mensaje
para el encargado dice «Ese portal pide cuenta, por eso no se pudo hacer solo»
(`enrutar.ts:179`) — sobre la cuenta que él mismo acaba de entregar.

Consecuencia: trabajo duplicado sobre un documento fiscal irreversible (un CFDI
emitido dos veces se cancela con el cliente encima), y la pantalla que vende el
diferenciador —«mira lo que el agente hace solo»— es la que le dice al encargado
que lo haga él. El párrafo de `vista.tsx:190` («los factura sola en la próxima
corrida») y la cola de al lado se contradicen sobre el mismo ticket.

Causa raíz probable: el enrutado se re-deriva en la vista en vez de llegar
resuelto del servidor, y el tercer y cuarto parámetro de `enrutar` son
opcionales/derivables — el compilador no obliga al panel a saber lo que el motor
sabe.

---

### [MEDIO] El rótulo de «Necesidad» describe la fórmula de la 0140, que las migraciones 0142 y 0143 ya reemplazaron dos veces

`src/lib/admin/prospectos-mapa.ts:290` (se pinta en `cerebro.tsx:1046` y como
`title=` del filtro en `cerebro.tsx:705`) y `src/app/admin/mapa-prospectos/[id]/detalle.tsx:134`

La columna es GENERADA, así que el número siempre es correcto; lo que miente es
el texto que la explica. Hoy dice: *«vacante de liquidación/cuadre/auxiliar
administrativo +50 (cualquier otra vacante +25), flota ≥20 +25»*. La fórmula
vigente (0143) es: `liquidaci` **y no** `de pagos|compensación` → +50; `cuadre` →
+50; `auxiliar administrativ` **solo si además** nombra
`viaje|flota|diesel|combustible|caseta|embarque|operativ|mesa de control` → +50.

Escenario con valores, con dos filas que las propias migraciones nombran:
- «Analista de Liquidaciones de Pagos» (Soriana): la pantalla explica +50, la
  columna vale **25**. Javier lee 25% junto a un texto que dice que debería ser
  50 y concluye que el score está roto.
- «Auxiliar Administrativo» a secas (Qualtia, una dulcería): la explicación dice
  +50, la columna vale **25** — que es justo el arreglo de la 0142.
- «Auxiliar Administrativo Mesa de Control» de una flota de 40 unidades: vale
  **75**, y el `sub` de `detalle.tsx:134` («vacante de liquidación/cuadre +50 ·
  flota ≥20 +25») no nombra ese caso, así que el lector no puede reconstruir el
  75 desde lo que ve.

Además el `sub` de la barra declara un máximo de 75 puntos para una métrica
rotulada 0-100: no hay combinación en el texto que llegue a 100.

Consecuencia: el Cerebro es la herramienta con la que Javier decide a quién le
habla hoy. Un criterio publicado que no es el criterio aplicado convierte cada
desacuerdo en «no le creo al tablero», que es como muere un tablero. Rompe la
regla escrita del repo: un rótulo tiene que ser verdad.

Causa raíz probable: `CRITERIO_SCORES` se escribió como copia en prosa de la
0140 —el comentario de `:283-284` dice «misma fuente que el cálculo, no una
copia»— y las dos migraciones que ajustaron la fórmula no tenían por qué saber
que existía esa copia. Nada la ata al SQL.

---

### [MEDIO] El mismo prospecto enseña dos «% Cierre» distintos: el de la tarjeta y el de su ficha

`src/lib/admin/prospectos-mapa.ts:420-424` (mapa, sin `personasVerificadas`) contra `:514-518` (ficha, con él)

`scoreCierre` suma `+10 por decisor con contacto VERIFICADO, tope 20`
(`prospectos-mapa.ts:278`). `getDetalleProspecto` le pasa
`personasVerificadas` contando las personas de `prospecto_persona`;
`getDatosMapa` **no le pasa nada** (ni siquiera trae la tabla en su `select`,
`:370`), así que en el mapa ese término vale 0 **siempre**.

Escenario con valores: «Transportes Tres Guerras», SCIAN 484, con teléfono,
correo, `contacto_nombre` y dos decisores investigados con confianza alta.
- Tarjeta del Cerebro (`cerebro.tsx:236`, `Barra etiqueta="Cierre"`): 20+15+20+15 = **70 %**.
- Su ficha, un clic después (`detalle.tsx:122`): 70+20 = **90 %**.
El CSV que exporta el Cerebro (`cerebro.tsx:107`, columna `cierre_pct`) lleva el
70, y el orden por defecto de la cola («% cierre», `cerebro.tsx:753`) ordena con
el 70.

Y el pie del mapa promete en pantalla el término que ahí nunca se suma:
`CRITERIO_SCORES.cierre` (`:289`, pintado en `cerebro.tsx:1043`) dice
«+10 por decisor con contacto VERIFICADO».

Segundo desajuste en la misma línea: la ficha cuenta como verificado
`confianza !== 'baja'` (`:518`), pero el criterio publicado y el comentario del
código (`:275-277`) dicen «el `inferido` no cuenta… un correo adivinado no es
alcance, es una apuesta». La 0138 solo prohíbe `origen='inferido'` con
confianza `alta` (`0138:49-50`), así que un decisor **inferido con confianza
media** —un correo `nombre.apellido@empresa.mx` adivinado— sí suma sus +10.

Consecuencia: el número que ordena la cola de ventas no es el número que se
enseña al abrir el prospecto, y el criterio publicado no es el aplicado en
ninguno de los dos. Con 33 mil filas, un orden que se mueve 20 puntos al abrir
una ficha no se detecta a ojo.

Causa raíz probable: `personasVerificadas` y `scian` entraron a `scoreCierre`
como parámetros **opcionales**, así que el llamador que no los pasa compila
igual y devuelve otro número.

---

### [MEDIO] «Redactar con IA» falla en silencio: el servidor escribe el mensaje de error para una persona y ningún cliente lo enseña

`src/app/admin/mapa-prospectos/[id]/detalle.tsx:80` (`if (!r.ok) return;`), gemelo en `cerebro.tsx:406`

La ruta devuelve una frase pensada para leerse:
`{ error: 'Tope de generación por hora alcanzado — respira y vuelve.' }` con 429
(`api/admin/mapa-prospectos/mensaje/route.ts:52`), `'Ese prospecto no existe.'`
con 404 (`:67`) y `'El redactor no contestó — el botón sigue con la plantilla.'`
con 502 (`:114`). Los dos clientes tiran la respuesta y solo apagan el spinner.

Escenario con valores: el tope es 120 generaciones/hora
(`rateLimit('cerebro:mensaje', 120, 3_600_000)`), y la lista pinta 60 tarjetas a
la vez (`cerebro.tsx:967`), cada una con su botón ✨. En una sesión de
prospección se llega. A partir de la 121, Javier abre la ficha de «Autolíneas
del Norte», pica **«↻ Redactar de nuevo con IA»**, el botón dice «redactando…»,
vuelve a su estado normal — y el texto y el sello «Última redacción del agente
experto: 20-ago 18:42» (`detalle.tsx:242`) siguen exactamente iguales, porque
son los de ayer. No hay ninguna señal en pantalla que distinga «se regeneró y
salió parecido» de «no se regeneró». Manda el mensaje viejo creyendo que es el
nuevo.

Consecuencia: quien opera el Cerebro no puede saber si el agente corrió. Es el
modo de falla silenciosa que el repo persigue en todos lados (`enrutar.ts:62-68`
lo dice con esas palabras) reproducido en el archivo nuevo del día.

Causa raíz probable: el comentario de `cerebro.tsx:406` («el error ya quedó en
el log del servidor») trata el log como si fuera la interfaz; `detalle.tsx` lo
copió sin el comentario.

---

### [MEDIO] El contraste de la ficha nueva reprueba en los dos temas, y `contraste.test.ts` no puede verlo porque los colores son hex a mano

`src/app/admin/mapa-prospectos/[id]/detalle.tsx:236`, `:159`, `:256`

/admin sí tiene tema oscuro (`selector-tema.tsx` está montado en
`admin/sidebar-nav.tsx:135` y estampa `data-theme="dark"` en `<html>`). Medido
con la fórmula WCAG sobre los tokens reales de `globals.css`
(`--surface` claro `#ffffff`, oscuro `#131316`):

| elemento | tamaño | claro | oscuro |
|---|---|---|---|
| Botón «✨ Redactar con IA» `#6d28d9` sobre `color-mix(#7c3aed 8%, --surface)` (`:236`) | 12 px | 6.31:1 | **2.48:1** |
| Píldora «Confianza alta» `#16a34a` sobre `color-mix(#16a34a 14%, --surface)` (`:159`) | 10 px | **2.82:1** | 4.77:1 |
| Píldora «Confianza media» `#d97706` (`:159`) | 10 px | **2.75:1** | 4.89:1 |
| Botón «💬 Enviar WhatsApp», `#fff` sobre `#16a34a` (`:256`) | 13 px | **3.30:1** | **3.30:1** |

El mínimo AA para texto menor a 18 pt es 4.5:1. Escenario: Javier trabaja en
claro (el default de `selector-tema.tsx:20`) y el dato que decide si le cree a
un decisor —«Confianza alta» / «Confianza media» / «Confianza baja»— es el único
texto de la tarjeta que no se lee; en oscuro, la acción principal de la pantalla
queda a 2.48:1, por debajo incluso del 3:1 que se le pide a un componente de
interfaz.

Consecuencia: la distinción alta/media/baja es justamente lo que la 0138 se
construyó para no perder («un `inferido` no puede declararse alta»), y se pinta
en el color menos legible de la tarjeta. Y la red que el repo ya tiene —
`contraste.test.ts`, que mide `--color-ok`/`--color-bad`/`--faint` leyendo los
hex de `globals.css`— no ve nada de esto: estos colores no son tokens.

Causa raíz probable: el idiom `color-mix(color 14%, --surface)` con el mismo hex
de texto y de fondo viene de `COLOR_EMBUDO` (`prospectos-mapa.ts:25-32`) y del
pill de `cerebro.tsx`; funciona para un punto en un mapa y no para texto de
10 px.

---

### [MEDIO] Dos definiciones de «duplicado» en el mismo módulo: el mapa esconde por prosa, la ficha nueva 404ea por columna

`src/lib/admin/prospectos-mapa.ts:390` (`.filter((p) => !/DUPLICADO:/.test(p.notas ?? ''))`) contra `:497` (`if (!p || p.duplicado_de) return null;`)

La 0139 añadió `duplicado_de` precisamente para dejar de depender de la prosa —
su cabecera lo dice: *«es la misma lógica del filtro `/DUPLICADO:/` que
`prospectos-mapa.ts` ya aplica sobre `notas`, pero con dientes y sin depender de
prosa»*, y el índice `idx_prospecto_vivos` se declara «el filtro por defecto del
tablero» (`0139:84`). El mapa no migró: sigue con el regex y ni siquiera trae la
columna en su `select` (`:370`). La ficha nueva sí la usa.

Escenario con valores: la 0139 midió 1,291 filas de más, con Tres Guerras
apareciendo cinco veces. En cuanto se marquen esas filas con `duplicado_de` —
que es la operación que la migración deja pendiente para «su propia migración»—
el Cerebro seguirá pintando **cinco** pines y contando cinco prospectos en
«Se enseñan las 60 mejores de N» (`cerebro.tsx:973`) y en el CSV, y **al hacer
clic en cuatro de ellos** `getDetalleProspecto` devuelve `null` →
`page.tsx:17` → `notFound()` → 404. Una tarjeta que el mapa acaba de pintar
lleva a un 404.

Precisión honesta: hoy ningún archivo de `src/` escribe `duplicado_de` (lo
verifiqué con grep), así que la falla está **cargada pero no disparada**. Lo
reporto porque el disparador es una operación de datos, no un despliegue: basta
un `update` de la corrida de deduplicación para que el 404 aparezca sin que
nadie toque código.

Causa raíz probable: la 0139 dejó los dos criterios conviviendo y el consumidor
nuevo eligió el correcto sin actualizar al viejo.

---

### [MEDIO] «Te toca a ti» ya no es lo que su subtítulo dice, y la propia fila lo contradice

`src/app/dashboard/agentes/facturas/vista.tsx:116`

El subtítulo sigue siendo *«Portales que piden TU cuenta, o donde la máquina se
topó con un muro»*. Desde este delta la sección incluye un tercer motivo,
`sin_robot` (`enrutar.ts:138`), que no es ninguna de las dos: es «el hueco es
nuestro, todavía no sabemos llenar ese portal».

Escenario con valores: entra un ticket de Enerser por $2,450, portal
reconocido, campos leídos, sin cuenta que pedir. La fila aparece bajo un
subtítulo que dice «portales que piden TU cuenta», con una píldora que dice
**«A mano»** y un `title` que dice **«Todavía no sabemos llenar ese portal
solos»** (`cola-jefe.tsx:76`). Dos afirmaciones incompatibles a 3 cm de
distancia, y la primera manda al encargado a buscar una contraseña que no
existe — exactamente lo que `enrutar.ts:174-176` explica que hay que evitar en
el mensaje de WhatsApp, y evita ahí.

Consecuencia: el encargado pierde el rato buscando un acceso inexistente; con
la mayoría de los 37 comercios sin adaptador escrito, `sin_robot` no es un caso
raro sino el mayoritario de esa cola.

Causa raíz probable: el tipo `MotivoDeMensaje` creció, la píldora se actualizó
y el encabezado de la sección no; `motivo` es un union exhaustivo en el render
de la píldora pero el subtítulo es texto suelto.

---

### [BAJO] El enlace a LinkedIn del decisor no normaliza el esquema; su vecino de tres líneas arriba sí

`src/app/admin/mapa-prospectos/[id]/detalle.tsx:167` (contra `:191`)

`href={per.linkedin}` sin tocar. El campo `sitio`, en la misma pantalla, sí
resuelve el caso: `href={p.sitio.startsWith('http') ? p.sitio : \`https://${p.sitio}\`}`.
`prospecto_persona.linkedin` es `text` sin CHECK (`0138:40`) y ningún archivo de
`src/` lo escribe ni lo normaliza: lo llena el agente que investiga.

Escenario con valores: el agente guarda `linkedin.com/in/juan-perez-flota`, que
es como se copia un perfil. El navegador lo resuelve **relativo**: el clic lleva
a `/admin/mapa-prospectos/{uuid}/linkedin.com/in/juan-perez-flota` → 404 de Next.

Consecuencia: en la pantalla que existe para «llamar al decisor correcto», el
tercer botón de contacto tira al 404 del propio panel. Menor porque solo lo ve
Javier y el diagnóstico es inmediato.

Causa raíz probable: `sitio` heredó la defensa de la 0139 y `linkedin` (0138)
nunca la tuvo.

---

### [BAJO] El alta de flota dice «los CINCO y ya factura», pero `getFiscalDeFlota` exige seis cosas

`src/app/admin/flotas/page.tsx:34-38` y `:76`

El comentario afirma *«Es la condición exacta de `getFiscalDeFlota`»*. No lo es:
`getFiscalDeFlota` (`facturacion/flota_fiscal.ts:71-77`) exige, además de los
cinco del receptor, un **correo de facturación** — una cuenta con rol `contador`
o `flota_admin` con correo — y sin él devuelve `flota: null` con «no hay a dónde
mandar el CFDI».

Escenario con valores: Javier da de alta «Transportes del Bajío» con los cinco
completos (RFC, razón social, 601, CP 37000, G03) y deja vacío «Correo del
administrador». `fiscalListo(fd)` es `true`, así que la advertencia fiscal
**no** se imprime y el mensaje verde dice solo «falta darle de alta un usuario».
Esa flota no factura ni un ticket, y el único aviso que existe para decirlo
—«Hasta que estén los CINCO, esta flota no factura ni un ticket»— se suprimió
justo en el caso en que también aplicaba.

Consecuencia: la mejora que este delta introdujo para que el hueco fiscal deje
de descubrirse «semanas después como un cron que no hacía nada» sigue teniendo
esa puerta abierta, con el agravante de que ahora el silencio se lee como
confirmación.

Causa raíz probable: `fiscalListo` se escribió mirando `estanCompletos`
(`saas/fiscal.ts:44`), que sí son cinco, y no `getFiscalDeFlota`, que es la
función que el comentario cita.

---

## Estado de los hallazgos abiertos de la ronda 18

Ninguno de los siete se cerró. Verificado uno por uno contra el árbol de hoy
(`6c18684`):

1. **[ALTO] Un selector rotula cinco ventanas de tiempo distintas** —
   **SIGUE**. `src/app/dashboard/panel-periodo.tsx:44-51` intacto (`modoIdx` →
   `MODOS[modoIdx]` gobernando `seriesKpis`, `gastoSemanalSeries`,
   `liquidadoSemanalSeries` y `topRutasSeries`), `totalLiquidado` se sigue
   sumando del `liquidadoModo` acotado por `SEMANAS_POR_MODO`
   (`panel-periodo.tsx:50`). REINCIDENTE.
2. **[ALTO] `StatCard` escribe «0% · sin movimiento» cuando no pudo comparar** —
   **SIGUE**. `src/app/admin/ui/kit.tsx:157` sigue siendo el literal
   `0% · sin movimiento` en la rama `delta === null`. REINCIDENTE.
3. **[ALTO] Una consulta caída del Resumen se pinta como «aún no hay gastos
   capturados»** — **SIGUE**. `panel-periodo.tsx:100` conserva el texto y
   `estado.ts:30` sigue vigilando solo cuatro secciones (`acreditables`, `kpis`,
   `liquidaciones`, `anomalias`). REINCIDENTE.
4. **[ALTO] «Vencen pronto (≤ 5 días)» cuenta las que ya vencieron** —
   **SIGUE**. `src/app/dashboard/arco/page.tsx:71` sigue con
   `venceEn(s.venceEn) <= hoy` y el rótulo de `:87` sigue diciendo «≤ 5 días».
   REINCIDENTE.
5. **[MEDIO] `costoPorViaje === null` se imprime como «$0.00»** — **SIGUE**.
   `src/app/dashboard/kpi-periodo.tsx:67`: `valor={valorActual ?? 0}`.
   REINCIDENTE.
6. **[MEDIO] El mapa `TIPO_DIFERENCIA` cubre 2 de ~30 tipos y uno no existe** —
   **SIGUE**. `src/app/dashboard/agentes/liquidacion/vista.tsx:14-18` sigue
   tipado `Record<string, string>` con `sin_comprobar` (la clave real es
   `sin_comprobante`). REINCIDENTE.
7. **[BAJO] `/login?enviado=1` es un estado terminal sin salida** — **SIGUE, y
   ahora tiene un camino más que lleva a él**. `login/page.tsx:237-253`: el
   ternario sigue reemplazando todo el bloque de acciones, y desde este delta
   `auth/callback/route.ts:63` puede redirigir ahí solo
   (`/login?enviado=1&reenviado=1`) tras un reenvío automático. Quien llegue por
   ese camino con el correo equivocado en la cookie tampoco tiene formulario en
   pantalla. REINCIDENTE.

## Lo que revisé y está bien

Vale tanto como los hallazgos; varias de estas defensas son la razón de que la
nota no baje más.

- **El magic link, que la ronda 18 confesó no haber auditado — está bien
  resuelto.** `motivo_login.ts:44-74` traduce las dos señales reales de fallo
  (el `error_code=otp_expired` que Supabase pega al redirect y el error de
  `exchangeCodeForSession`) a tres motivos con nombre, mira `code` **y** el
  texto del mensaje porque el `code` estructurado no existe en SDKs viejos, y
  `mensajeDeError` (`:87-100`) evita a propósito «intenta otra vez» donde
  reintentar es el consejo garantizado a fallar. `aParametro` serializa
  `generico` como `1` para no romper los redirects previos. Los cuatro mensajes
  hablan del **enlace**, nunca de la cuenta, así que el oráculo de enumeración
  que cierra `esCorreoSinCuenta` no se reabre. Y `sp.error` viene de la URL pero
  solo indexa literales: no hay reflexión de texto del atacante en la pantalla.
- **El formulario sigue en pantalla cuando hay error.** Verifiqué que el
  ternario de `login/page.tsx:237` lo esconde solo con `enviado`, no con
  `error`, así que «Pide uno nuevo con tu correo» (`motivo_login.ts:89`) y
  «pide uno nuevo desde aquí» (`:97`) apuntan a un campo que sí está ahí.
- **El reenvío automático no puede empeorar un login que ya falló.**
  `auth/callback/route.ts:60-70`: el reenvío va dentro de un `try/catch` que
  degrada al mensaje de caducado, y `reenvio_enlace.ts:96` pone la cookie de
  espera **antes** de conocer el resultado, así que un fallo repetido no
  reintenta en cada visita a un enlace muerto. La cookie del correo es
  `httpOnly` con la misma vida que el enlace (`:64`), se guarda antes de saber
  si el correo tiene cuenta (`login/page.tsx:137`) y el reenvío conserva
  `shouldCreateUser:false` y la **misma** llave de rate limit por IP que el
  formulario (`reenvio_enlace.ts:91`) — no duplica el techo de correo.
- **`global-error.tsx` cubre /admin.** No hay `error.tsx` bajo `src/app/admin/`,
  así que un `exigir()` que lance en `getDetalleProspecto`
  (`prospectos-mapa.ts:496`) cae en `global-error.tsx`, que está escrito con
  hex literales y `<img>` estático precisamente para sobrevivir a un fallo del
  layout, y enseña el `digest`. No sale un stack a pantalla.
- **Los secretos del cofre no vuelven al DOM.** El delta mete 11 conectores
  nuevos con `usuario`/`contraseña` (`conectores/portales_facturacion.ts:50-64`)
  y `credenciales-controles.tsx:57` mapea `secreto → type="password"`, con
  `autoComplete="off"` (`:136`); al panel solo vuelven pistas
  (`seccion-credenciales.tsx:100`). El catálogo de captura se deriva de
  `CATEGORIAS` (`seccion-credenciales.tsx:38`), así que la categoría nueva
  «Portal de facturación» aparece sola — no hay lista paralela que se olvide.
- **`getDetalleProspecto` lee los tres derivados, no los recalcula.**
  `prospectos-mapa.ts:522-523` toma `similitud_icp_pct`, `necesidad_pct` y
  `viajes_mes_estimado` de las columnas GENERADAS. Es la decisión correcta y es
  la que impide que el número —a diferencia de su rótulo— se desincronice.
  `viajesMesEstimado` se muestra siempre con su supuesto a la vista
  (`detalle.tsx:206-210`), como manda la regla de la estimación declarada.
- **Los estados vacíos de la ficha nueva están pintados a propósito.**
  `Campo` (`detalle.tsx:48-59`) escribe «no disponible» en cursiva y en gris en
  vez de dejar el hueco; `numUnidades`/`viajesMesEstimado` distinguen `null` de
  0 (`:198-201`); «Sin decisor público confirmado todavía» (`:145`) y «Sin
  teléfono — no se puede mandar» (`:257`) dicen qué falta y por qué.
- **`ORIGEN_LABEL` cae a la clave cruda** (`detalle.tsx:170`, `?? per.origen`) y
  los 7 valores del dominio de `0138:43-44` están todos presentes.
  `CONFIANZA_COLOR`/`CONFIANZA_LABEL` (`:26-27`) cubren los 3 valores que el
  CHECK `prospecto_persona_confianza_dominio` permite — sin fallback, pero el
  dominio está cerrado en la base.
- **El catálogo de regímenes del alta ya es el que valida.**
  `admin/flotas/page.tsx:437-439` deriva las opciones de `REGIMENES`
  (`saas/fiscal.ts:20-26`), el mismo arreglo contra el que `validarDatosFiscales`
  compara (`saas/fiscal.ts:124`). Antes ofrecía 605/606/607/608/610/611/615/616, que el
  validador rechazaba «elige uno de la lista» hablando de una lista donde el
  valor sí estaba. De paso corrige la clave de Incorporación Fiscal (era 615,
  es 621). Esto sí es un arreglo real de este delta, en mi rubro.
- **La validación fiscal se extrajo sin duplicarse.** `validarDatosFiscales`
  (`saas/fiscal.ts:102`) es ahora la única fuente, y `crearFlota` la llama
  **antes** del insert (`administracion.ts:144-149`) para que un CP de cuatro
  dígitos no deje una flota creada a medio configurar.
- **Los nuevos filtros del Cerebro mueven todo lo que hay debajo.**
  `cerebro.tsx:342-343` mete `minSimilitud`/`minNecesidad` en el mismo `filter`
  que gobierna mapa, lista, CSV y el conteo de filtros activos (`:331`); los dos
  órdenes nuevos traen desempate explícito (`:369-370`). Cumple la regla del
  filtro que mueve todo.
- **Los dos atajos nuevos de la barra comparten estado con sus chips**
  (`cerebro.tsx:600-616`): se apagan desde cualquiera de los dos lados, no hay
  un segundo estado que se desincronice.
- `npx tsc --noEmit -p .` y `npx eslint src/`: no los corrí esta ronda (los
  corre la compuerta); ver abajo.

## Lo que NO alcancé a revisar

Sin esto la nota es una mentira por omisión.

- **No miré un solo render, otra vez.** Corrida en la nube, sin `npm run build`,
  sin base y sin credenciales. Todo lo de arriba se sostiene por lectura de
  código y por aritmética. El hallazgo de contraste está **medido** (fórmula
  WCAG sobre los hex reales de `globals.css`), pero no **visto**: composición,
  jerarquía visual y responsive real de `detalle.tsx` —una página nueva de 280
  líneas que nadie ha visto pintada— no se auditaron.
- **Responsive de la ficha nueva**: `sm:grid-cols-2 lg:grid-cols-3`
  (`detalle.tsx:181`) y las dos columnas de mensajes (`:245`) no se probaron a
  390 px. El bloque de `pre` de las notas (`:223`) usa `whitespace-pre-wrap`
  pero no `overflow-x`, y las notas del censo traen URLs largas: no verifiqué si
  desbordan.
- **No corrí `vitest`.** La instrucción limitaba a dos archivos y preferí gastar
  el tiempo en lectura. No ejecuté `mensajes.test.ts`, `enrutar.test.ts` ni
  `contraste.test.ts`; leí los tres.
- **No corrí `tsc` ni `eslint`** esta ronda (los corre la compuerta con 11
  agentes en paralelo).
- **El resto del delta que toca pantalla**: `cerebro.tsx` fuera de los bloques
  del diff (el mapa SVG, `Calles`, el latido de 60 s) no se revisó; tampoco
  `piloto_vision.ts` (no es frontend) ni el efecto de `sin_robot` sobre
  `ficha-corridas.tsx`.
- **Las ~24 páginas de `/dashboard` que la ronda 18 dejó fuera siguen fuera**:
  `facturacion/`, `rentabilidad/`, `combustible-casetas/`, `conocimiento/`,
  `politicas/`, `integraciones/`, `llaves-api/`, `notificaciones/`, `mapa/`,
  `soporte/`, `contador/`, `despacho/`, `carta-porte/` y
  `agentes/{peajes,conductores,notificaciones}`. Cualquiera puede tener el mismo
  patrón que encontré cuatro veces en el Resumen y dos veces hoy en el delta.
- **`/admin` fuera del Cerebro y de Flotas**: ~35 pantallas sin auditar.
- **Accesibilidad con lector de pantalla**: no probada. Sigue abierta la duda de
  la ronda 18 sobre `role="alert"` que llega por redirect ya presente en el
  primer parseo (`login/page.tsx:336`), y ahora la misma duda aplica al
  `role="status"` de la tarjeta de «enviado» (`:239`), que es el único aviso del
  reenvío automático.
