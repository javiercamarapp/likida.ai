# Plan para cerrar el ciclo y llegar a nivel Handle

**Ronda 4 · 14-ago-2026.** Seis auditores independientes (seguridad multi-tenant,
backend y datos, capa agéntica, fiscal y legal, cierre del ciclo, operabilidad)
verificando contra el código, la base de producción, la Graph API de Meta y las
variables de Vercel. Este archivo es el ANCLA de la ronda: quien retome el
trabajo empieza aquí.

Informe ejecutivo (para enseñar, no para trabajar):
https://claude.ai/code/artifact/8cdbb2ad-ceef-4414-ac37-02005d11a196

---

## Cómo leer esto

Cada punto trae **dónde está el hueco** con `archivo:línea` y **qué lo cierra**.
Los `archivo:línea` son del commit `592a020`; si no cuadran, busca por el
símbolo, no por el número.

Antes de tocar nada, lee `CLAUDE.md`. Las reglas que más muerden en este plan:

- **Nunca inventar una cifra.** Un `0` que parece medición es un bug.
- **Un rótulo tiene que ser verdad.** Esta ronda encontró tres pantallas que
  mienten; están abajo.
- **Fallar cerrado y decirlo.** supabase-js reporta errores POR VALOR.
- **Migración: archivo en el repo PRIMERO**, luego `apply_migration`, luego
  bloque numerado en `verificaciones.sql` con la salida REAL de la corrida.
- **Suite completa antes de cada push.** `npx tsc --noEmit -p .`,
  `npx eslint src/`, `npx vitest run --coverage`.
- **Mirar el render.** Medir no sustituye a mirar.

---

## Estado de partida

| | |
|---|---|
| Pruebas | 3,920 verdes, tsc limpio, eslint 0 errores |
| Cobertura | 79.63 / 85.2 / 85.53 / 79.63 (umbrales 78/84/84/78) |
| Migraciones | hasta 0098, aplicadas y verificadas |
| **Filas en producción** | **0 viajes, 0 gastos, 0 liquidaciones, 0 operadores, 0 mensajes de WhatsApp** |

Ese último renglón es el que ordena todo lo demás: **nada de lo que sigue ha
corrido nunca contra datos reales.** Las pruebas verdes no lo desmienten — el
propio repo documenta que los mocks pasaron los nueve días que producción falló
cada hora (`docs/auditoria-3/operabilidad.md:138`).

---

## BLOQUE A — El lado del ingreso. Sin esto no hay ciclo.

Likida sabe cuánto **gastó** un viaje. No sabe cuánto **cobró**, si se facturó,
ni si le pagaron. Es el hueco que define la ronda.

### A1 · `factura_emitida` no tiene un solo escritor · CRÍTICO
Cuatro usos en `src/`, **todos `.select()`**: `libro_viaje.ts:599,627`,
`comercial.ts:191`, `facturacion_clientes.ts:629`. La tabla existe desde la 0049
con RLS e índices.
**Cierra con:** una server action que emita el CFDI de ingreso al cliente y
escriba la fila. Mientras no exista, `/dashboard/facturacion` es un EstadoVacío
permanente — y no por falta de clientes, sino porque no hay dónde teclear.

### A2 · `pago_recibido` no aparece ni una vez en código ejecutable · CRÍTICO
Sin esto no hay cuentas por cobrar ni «¿ya me pagaron?».
**Cierra con:** captura de pago + aplicación contra `factura_emitida`.

### A3 · Carta Porte / CFDI de ingreso: cero líneas · CRÍTICO
`grep CartaPorte20|CartaPorte30|Mercancias|Ubicaciones` en `src/` solo devuelve
**lecturas** de XML ajeno. `lib/saas/facturapi.ts` sí timbra, pero con
ClaveProdServ `81112101` (licencias de software): es Likida cobrándole a la
flota, no la flota cobrándole a su cliente.
**Por qué pesa:** es la obligación que toda flota mexicana tiene en cada viaje,
y la pregunta del minuto tres de cualquier demo. Hoy no hay nada que enseñar.
**Antes de escribir código:** lee `docs/conocimiento/02-carta-porte.md` y las
fichas de `normas/`.

### A4 · La unidad nunca se liga al viaje · ALTO
`asignarUnidad` (`operacion.ts:750`) tiene **0 llamadores fuera de pruebas**.
`FormaViaje` no tiene campo `unidadId`, y el importador de Excel tampoco.
`crearViaje` lo acepta y nadie se lo pasa.
**Consecuencia medible:** «¿cuánto gana el camión 47?» no tiene respuesta, y el
KPI `sinUnidad` del tablero de Despacho nunca podrá bajar de 100%.

### A5 · Alta de unidades: motor sin pantalla · ALTO
`operacion.ts:776` escribe, pero el único llamador es `POST /api/v1/unidades`.
`/dashboard/unidades` **no tiene un solo `<form>`**.

### A6 · La API es la única puerta de A5, y está cerrada con llave · ALTO
`generarLlave()` (`lib/auth/llave-api.ts:52`) es llamada **solo por su propio
test**. `tenant_api_key` (mig. 0093) no tiene ningún insert. La API que
CLAUDE.md cita como escritor es inalcanzable.
**Cierra con:** pantalla de emisión de llaves en el panel (mostrar el secreto
UNA vez; la tabla guarda solo el SHA-256).

### A7 · El ingreso solo se captura en el alta manual · ALTO
Las otras dos vías de creación —despacho por WhatsApp (`despacho_wa.ts:179`) e
importación de Excel (`importar_viajes.ts:283`)— crean el viaje **sin**
`cliente_id` ni `ingreso_flete`, y **no existe ningún UPDATE** de esas columnas
en todo `src/`. Un TMS importado entero nace con la rentabilidad en NULL para
siempre.

### A8 · La llave natural descarta el cuerpo del integrador en silencio · MEDIO
`_escritura.ts:717-723` + `viajes/route.ts:258`. Si el TMS manda un `POST` con
un folio que ya existe pero montos distintos y una `Idempotency-Key` **nueva**,
recibe `200 {idempotente:true}` y sus montos nunca llegan a la base. La mig.
0098 solo cierra el caso de llave REUSADA.

---

## BLOQUE B — Nivel Handle en los agentes

Referencia: `docs/conocimiento/handle-el-mapa-completo-para-likida.md`.

### B1 · Peajes no es un agente · ALTO
No corre solo (no está en ningún cron) y no se puede disparar a mano. Su página
es lectura más un formulario de subida (`agentes/peajes/page.tsx:53`).
**Decide:** cron, botón, o dejar de llamarlo agente. Un rótulo tiene que ser
verdad.

### B2 · `cola_atorada` y `escalado` no los emite nadie · ALTO
Las plantillas están escritas y muertas: `avisos.ts:211 avisoColaAtorada`,
`avisos.ts:176 avisoEscalados`, **cero llamadores**.
Hoy quedaron gateados —la pantalla los pinta apagados y el servidor los
descarta, ver `CON_EMISOR` en `notificaciones.ts`— para que no mientan. Pero el
gateo es el parche; **el arreglo es emitirlos**.
**Al cablear uno:** agrega el par a `CON_EMISOR` en el MISMO commit que el
`avisar(...)`. Hay prueba que lo vigila.

### B3 · Ningún agente tiene bitácora de corridas · ALTO
Es la pieza de Handle que más falta (`handle-el-mapa:75-76`: *Periodo · Estado ·
Tareas 2/2 · Duración · Fecha*). Hoy el único rastro es `logger.info`, que el
cliente no ve.
**Por qué pesa:** sin historial, un agente que nunca avisa es indistinguible de
uno que nunca corrió.

### B4 · Estrategia editable solo en cobranza · MEDIO
Handle la tiene en los ocho. Likida solo en cobranza (mig. 0089). Los otros
cinco corren con reglas de fábrica.

### B5 · Faltan «Ejecutar ahora» y «Mándate una prueba» · MEDIO
`handle-el-mapa:75,90-91`. Hoy el cliente no puede disparar ningún agente ni
confirmar que el correo llega hasta que algo se rompa de verdad.

### B6 · Cero pruebas sobre el cableado de notificaciones · MEDIO
`escalar_viaje.test.ts`, `cobranza.test.ts`, `facturar/route.test.ts` y
`escalar/route.test.ts` **no mencionan notificaciones**. Los tres bugs de
cableado que se arreglaron hoy pasaron por una suite verde.

### B7 · El piso de una hora no sobrevive al cierre del incidente · MEDIO
`olvidarEstado` (`notificaciones.ts:622-628`) hace DELETE de la fila entera,
borrando la huella `avisado_en` junto con la magnitud. Luego `debeAvisar` con
`ultimo === null` devuelve `true` **sin consultar el piso**.
**Consecuencia:** un agente que parpadea (Chromium que arranca un lote sí y otro
no) manda un correo POR LOTE, no por hora. Y la pantalla lo afirma como verdad:
*«Entre dos avisos siempre pasan al menos 60 minutos»*
(`notificaciones-forma.tsx:287`). **Es un rótulo que miente.**
**Cierra con:** conservar la huella al borrar la magnitud.

### B8 · Un fallo de infra de Likida se reporta como problema del cliente · MEDIO
`facturar/route.ts:450-457`: cuando Chromium no arranca, hasta 20 flotas reciben
«tu agente no pudo trabajar». No hay distinción entre «la plataforma está caída»
y «tus datos necesitan atención».

---

## BLOQUE C — Construido y sin cablear

Tres almacenes nacieron esta semana sin nadie que los llene.

### C1 · Nadie genera `tenant.buzon_token` · ALTO
`generarToken()` (`correo/buzon.ts:47`) no tiene llamadores fuera de pruebas. El
único uso de la columna es una LECTURA (`api/correo/entrante/route.ts:113`).
**Consecuencia:** todo el intake por correo —migs. 0095 y 0096, la verificación
de firma Svix, la ruta entera— es **inalcanzable**. Producción: 0 flotas con
buzón.
**Cierra con:** botón «generar dirección» en la pantalla del Agente de
Proveedores, con rotación.

### C2 · El cofre no está conectado a nada · ALTO
`cifrar`/`descifrar`/`pistasDe` (`conectores/cofre.ts`) sin llamadores;
`from('conector_credencial')` no aparece en `src/`. La tabla 0094 nació para que
los 14 conectores con `claveAlmacen: null` guardaran accesos y sigue vacía.

### C3 · `correo_procesado` no se purga nunca · MEDIO
La 0096 crea el índice por fecha «para poder limpiar», y
`mantenimiento_de_datos` no la toca. Crece para siempre.

---

## BLOQUE D — Operabilidad. Si truena a las 3am, nadie se entera.

### D1 · No existe canal de alerta al operador del sistema · ALTO
Los destinatarios salen de `app_user` filtrado por tenant, y `ROLES_AVISABLES`
(`notificaciones.ts:62`) es `['flota_admin','encargado','contador']` —
**`superadmin` no está**. No hay `ALERTA_EMAIL` ni webhook.
**Ya costó:** el cron del camino del dinero tronó cada hora ~9 días con Sentry
instalado, y se descubrió porque se cayó una página a la vista.

### D2 · El fingerprint colapsa los fallos de cron · ALTO
`cron.escalar.falló`, `cron.cobranza.falló`, `cron.purgar.falló` (×2) y
`cron.facturar.falló` (×2) no emiten `tenant` ni `codigo`, así que el
fingerprint vuelve a ser `[msg, nivel]`: **de la corrida 2 a la 365, silencio.**
Es el mismo modo de falla que la ronda 3 arregló, reintroducido.

### D3 · `/admin/salud-sistema` pinta verde hardcodeado · ALTO
`page.tsx:56` pone `<Semaphore estado="ok" etiqueta="Conectado" />` fijo para
Sentry, Vercel y Supabase. Con el DSN caído, el panel sigue en verde.
**Es un rótulo que miente**, y sobre el propio sistema de detección.

### D4 · No hay `/api/health` ni monitor externo · MEDIO
Nada detecta la **ausencia** de corridas.

### D5 · `app_user.telefono` no lo escribe nadie · ALTO
La columna existe (0059) y `resolverCuentaOficina` la consulta
(`contactos.ts:56-58`), pero `provisionarUsuario` (`auth/provisionar.ts:28-31`)
no la inserta.
**Consecuencia:** el dueño o el jefe de tráfico de un cliente nuevo **no puede
escribirle al bot** sin un UPDATE a mano.

### D6 · El cliente no puede dar de alta a su propio contralor · MEDIO
`/dashboard/usuarios` es solo lectura. Todo usuario nuevo pasa por Javier.

### D7 · El cron de facturar reporta `modo: "emitir"` corriendo en ensayo · MEDIO
`cron/facturar/route.ts:259,357` leen `process.env` sin pasar por
`modoEfectivo()`, y ese valor sale en el JSON y en el log. Falla del lado
seguro, pero miente sobre su propio estado.

---

## BLOQUE E — Legal y fiscal

### E1 · El derecho de oposición se anuncia y no se puede honrar · CRÍTICO
`privacidad.ts:237` le dice al operador que puede oponerse a la decisión
automatizada. Cuando se opone, `processor.ts:159-164` inserta una fila en
`solicitud_arco` y **no ocurre nada más**: no hay columna en `operador`, ni
bandera, ni lectura en el pipeline que suspenda el tratamiento.
LFPDPPP art. 26-II. El sancionado es **la flota**, no Likida — pero Likida
responde por contrato, y §14 de `/terminos` pone la indemnización al revés.

### E2 · Nada de lo construido esta semana entró a los documentos legales · ALTO
`git diff --stat 606e12d HEAD -- docs/ normas/ src/app/{privacidad,terminos,seguridad}`
devuelve **vacío**. Falta:
- El anexo de subencargados describe a Resend como canal de **salida**; desde
  esta semana también **recibe y almacena** el correo entrante del proveedor y
  sus adjuntos — o sea el CFDI completo (RFC, montos, UUID) vive en Resend y,
  por el renglón 6a, pasa por AWS SES.
- `/terminos` §10 no incluye el correo entre las dependencias de terceros, y §2
  sigue describiendo el producto como «recibe comprobantes por WhatsApp».
- El cofre introduce custodia de credenciales de ERP/GPS del cliente: cero
  menciones legales.

### E3 · Fichas de `normas/` con `usado_en_codigo` podrido · ALTO
`rmf-2026-2.7.1.21.yaml:31` apunta a un archivo que no existe; `cff-30.yaml:66`
cita líneas que hoy son otra cosa; `rfa-2026-2.9.yaml:45` afirma que algo «no
existe todavía» y ya existe (`repo.ts:909`).
`normas_sincronizadas.test.ts` coteja id, estado y citas **pero no
`usado_en_codigo`** — por eso llevan semanas podridas sin que falle nada.
**Contexto:** `normas/.latido-vigilancia` registra 14 corridas bloqueadas por
egreso de red desde el 24-jul: **21 días sin reverificar ninguna ficha.**

### E4 · Dos motores de IVA acreditable que no coinciden · ALTO (latente)
`engine.ts:1027` acredita con proporcionalidad (LIVA 5-I); `fiscal.ts:571`
suma el IVA completo. Sobre un viático de $900 con tope de $750: 83.3% contra
100%.
**Atenuante:** `resumirFiscal` no tiene consumidor fuera de su test. Es el arma
cargada, no disparada. Pero `normas/liva-5.yaml` no lista `fiscal.ts` en
`usado_en_codigo`, así que quien cambie la norma no lo va a encontrar.

### E5 · La promesa de retención no tiene implementación · MEDIO
`/privacidad:88,89,107` promete «un año» y «cinco años». No existe función que
borre a ninguno de los dos. Peor: `cff-30.yaml:56-61` advierte literalmente que
el producto **no debe** prometer que con cinco años basta sin mirar los tres
supuestos. La pantalla publicada lo promete plano.

---

## BLOQUE F — Higiene

- **F1 · Migraciones 0067, 0068 y 0069 sin archivo** en `supabase/migrations/`.
  Es el modo de falla conocido de `apply_migration` por MCP: una base
  reconstruida desde el repo no coincidiría con producción.
- **F2 · Seis variables huérfanas en producción** (`CUADRA_*`) que el código ya
  no lee. En `.env.local` la puesta es la inerte, así que **en local corre el
  modelo caro por default**.
- **F3 · Autofactura: un solo portal escrito** (`adaptadores/registro.ts:113` =
  `[capufe]`), no 37. Los «37 comercios» de `comercios.ts:106` son metadatos sin
  adaptador. Y sus dos últimos selectores nunca se han probado contra el portal
  real: la primera emisión será a ciegas.
- **F4 · Índice muerto:** `conector_credencial_por_flota` está totalmente
  cubierto por `conector_credencial_unica`.
- **F5 · El adjunto del webhook se descarga sin tope de tamaño**
  (`api/correo/entrante/route.ts:181`). Las dos rutas equivalentes del panel sí
  lo tienen (4 MB y 2 MB).
- **F6 · Un correo cuyos adjuntos no se pudieron bajar se pierde para siempre**
  (`entrante/route.ts:142-156`): marca `correo_procesado` ANTES de procesar y
  convierte todo fallo en `ignoradas++`, terminando en 200. Resend no reintenta.

---

## Lo que NO es código — solo Javier puede destrabarlo

Ningún agente puede hacer esto, y **bloquea cobrar** más que todo lo de arriba:

1. **El precio.** Los tres planes tienen `precio_mensual` en NULL. La propuesta
   a Innovativos dice `[definir]`. Anclas ya medidas: nómina de analista
   ~$17,368 MXN/mes; costo variable ~$2,880 MXN/mes para 30 camiones.
2. **El número mexicano de WhatsApp.** Hoy es el de prueba de Meta
   (`+1 555-659-6430`, `NOT_VERIFIED`): un chofer real no puede escribirle.
   1–3 días si hay número y documentos. **Contar con que dar de alta el número
   de producción crea una WABA nueva y las 11 plantillas es-MX aprobadas NO
   viajan** — hay que recrearlas y volver a pasar revisión.
3. **Razón social, domicilio fiscal, plaza y tribunales.** Hoy en NULL en
   `/terminos` y `/privacidad`. Sin RFC no se timbra nada.
4. **El contrato de encargado del tratamiento**, sin firmar (§17). Sin él, la
   cadena de subencargados queda sin base contractual.
5. **De qué lado del precio está el IVA** (`saas/iva.ts`). El código se niega a
   emitir hasta que se declare, y hace bien.
6. **Verificar qué llave de Facturapi hay en Vercel** (`sk_test` vs `sk_live`).

---

## El orden que recomiendo

**Primero, y no es código:** el precio. Cuesta una hora, no depende de nadie, y
bloquea a los otros dos — no se puede crear un price en Stripe ni mandar la
propuesta sin él. El mismo día, arrancar el número: es el único con reloj
externo.

**Después, en código, por lo que más bloquea vender:**

1. **BLOQUE A completo.** Sin el lado del ingreso no hay ciclo que vender, y es
   la mitad del producto que un contralor va a buscar en el minuto tres.
2. **D1 + D2 + D3** (alertas y el semáforo que miente). Barato, y es lo que
   evita repetir los nueve días ciegos.
3. **C1 + C2** (cablear el buzón y el cofre). Está todo construido; falta el
   botón que lo enciende.
4. **B1, B2, B3** (peajes, los eventos muertos, la bitácora). Es lo que de
   verdad separa a Likida de Handle en la capa agéntica.
5. **E1 + E2** antes de cobrarle a nadie.
6. Bloque F cuando haya hueco.

**Y antes del primer cliente de pago, obligatorio:** una corrida real de punta a
punta con número real, chofer real, foto real y PDF real. Hasta que `viaje`,
`gasto` y `liquidacion` tengan al menos una fila cada una, todo lo demás es
teoría — y este repo ya sabe que los mocks pasan mientras producción falla.

---

## Ya arreglado en esta ronda (no volver a abrirlo)

- **`purgar_api_idempotencia` era llamable por `anon` desde internet.**
  `SECURITY DEFINER` sin `revoke`. Verificado antes/después contra producción.
  Verificación 75 en `verificaciones.sql` vigila el CONJUNTO, no solo esa
  función.
- **16 de 18 interruptores de la pestaña Notificaciones no podían dispararse.**
  Gateados con `CON_EMISOR` + prueba. El arreglo de fondo sigue siendo B2.
- **El cierre de corrida de conductores reportaba éxito falso** para flotas
  donde falló el 100% de las escalaciones.
- **El aviso de facturas se saltaba justo en el fallo que lo merecía**
  (`if (arranco) throw e` propagaba por encima). Ahora en `finally`.
- **CLAUDE.md decía que nadie escribe `cliente`/`unidad`/`tarifa`** y mandaba a
  construir un escritor que ya existe.
