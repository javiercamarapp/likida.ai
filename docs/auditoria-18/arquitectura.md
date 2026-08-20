# Arquitectura y mantenibilidad — auditoría 18

**Nota: 5/10** (antes 6). Razón del movimiento: **se atacó y subió** el hallazgo
canónico abierto (`otro: 'Gasto'` / `otro: 'Otro'` está MUERTO: `pdf.ts` ya no
tiene mapa propio, importa `etiquetaConcepto`, y un test lo ancla), y **deuda que
cobró factura** en un sitio peor: la migración 0065 le enseñó a la base una
distinción sobre el dinero que el motor de cuadre nunca aprendió, y hoy las dos
verdades están escritas, comentadas y —una de ellas— fijada con test. Sube por lo
arreglado, baja más por lo encontrado.

El riesgo mayor del rubro hoy: **"¿estas dos filas son el mismo comprobante?" se
responde en dos lugares con dos llaves distintas** — la base dice `(cfdi_uuid,
cfdi_orden)` y el motor dice `cfdi_uuid` a secas — y el que se equivoca es el que
suma el dinero.

---

## Hallazgos

### [CRÍTICO] Un CFDI que ampara N gastos: la base lo llama legítimo, el motor lo llama duplicado y le quita el dinero

**Los dos lados, abiertos y leídos:**

- **La base (N a 1 es legítimo):** `supabase/migrations/0065_cfdi_de_varias_casetas.sql:29-36`
  separa los dos hechos por escrito —
  `"este gasto NACIÓ de ese CFDI" → 1 a 1` vs
  `"este gasto está AMPARADO por ese CFDI" → N a 1. Es la factura de CAPUFE.` —
  y mueve el índice único a `(tenant_id, cfdi_uuid, cfdi_orden)`
  (`:69`). Su primer párrafo (`:8`) dice literalmente: *"Ocho casetas de **un
  viaje** = ocho filas de `gasto` y UN `cfdi_uuid`"*.
  Los dos escritores lo cumplen: `src/lib/likida/facturacion/al_vuelo.ts:518`
  (`escribirUuid`, con el reparto `1..N` documentado en `:427-428` y el motivo en
  `:302-304`) y `src/lib/likida/intake/consolidado.ts:176` (`ligarLineaAGasto`,
  descrito en `:157-165` como *"el ÚNICO lugar que decide qué significa ligar una
  línea del consolidado a un gasto"*).

- **El motor (N a 1 es duplicado):** `src/lib/likida/cuadre/engine.ts:162-167` —
  `copiasDeComprobante` colapsa **solo por `cfdiUuid`**, sin mirar el orden:
  ```
  if (g.cfdiUuid) { const u = g.cfdiUuid.toLowerCase();
    const previo = vistoUuid.get(u);
    if (previo) originalDe.set(g.id, previo); … }
  ```
  y `engine.ts:275-278` excluye a las "copias" del `totalComprobado`.
  `engine.ts:637-653` además emite una diferencia `tipo: 'duplicado'` por cada
  una, y `engine.ts:1137` fuerza la liquidación a `con_diferencias`.
  La regla está **fijada por test**: `src/lib/likida/cuadre/engine.test.ts:83-93`
  (*"duplicado por UUID NO infla el total"*), con dos gastos de $2,000 que
  comparten UUID y difieren en folio.

- **Por qué el motor no puede distinguir aunque quisiera:** `Gasto`
  (`src/types/likida.ts:40`) tiene `cfdiUuid` y **no tiene `cfdiOrden`**, y
  `repo.ts:663` (`getGastos`, select en `:666`) no trae `cfdi_orden` de la base.
  `cuadre/desde_db.ts:30-34` alimenta al motor exactamente con eso.

**Escenario con valores.** Un viaje cruza 8 casetas de $250 = **$2,000**, anticipo
$2,000. El cron de facturación agrupa por flota y por portal
(`src/app/api/cron/facturar/route.ts:72`, `:473`), CAPUFE emite **una** factura
con los ocho códigos, y `escribirUuid` sella los 8 gastos con `cfdi_uuid = U` y
`cfdi_orden = 1..8`. Nada de eso viola el índice: es exactamente lo que la 0065
vino a permitir. Después se re-cuadra el viaje (`cuadrarDesdeDB`):

- `copiasDeComprobante` ve `U` ocho veces → marca 7 gastos como copia del primero;
- `totalComprobado` = **$250**, no $2,000;
- la diferencia contra el anticipo pasa de $0 a **−$1,750**;
- el PDF imprime siete veces *"Comprobante duplicado: Caseta por $250.00 aparece
  8 veces (7 excluidas del total)"* (`engine.ts:653`);
- `resumenLaboral` —que consume la MISMA función, `liquidacion/pdf.ts:14`—
  reembolsa al operador **$250** de los **$2,000** que puso de su bolsa;
- la liquidación no cierra como `cuadrada` nunca (`engine.ts:1137`).

El mismo camino existe sin cron: `intake/consolidado.ts` concilia el estado de
cuenta mensual de CAPUFE/IAVE contra **todos** los gastos del tenant, así que las
casetas de un mismo viaje comparten UUID por construcción.

**Intento de refutación (falló).** ¿Y si el lote nunca cae dentro de un solo
viaje? El lote se agrupa por flota+portal, no por viaje — pero basta con que
**dos** casetas del mismo viaje caigan en el mismo lote, y el comentario de la
0065 y el del cron (`route.ts:50`) usan "ocho casetas de un viaje" como el caso
motivador. ¿Y si `desde_db.ts` filtra antes? No: pasa `getGastos(viajeId,
tenantId)` crudo. ¿Y si el orden llega al motor por otra vía? No existe: el campo
no está en el tipo ni en el `select`.

**Consecuencia para quien mantenga esto.** Las dos reglas están *documentadas y
defendidas*, cada una en su archivo, cada una con su historia real (la 0019 con
las dos fotos del mismo XML; la 0065 con CAPUFE). Quien toque una va a leer un
comentario que le dice que tiene razón. El test de `engine.test.ts:83` bloquea el
arreglo obvio, y no hay ninguna prueba que ponga las dos reglas en la misma mesa.

**Causa raíz probable.** El esquema aprendió una distinción (5-ago, mig. 0065) que
nunca subió al modelo de dominio: `cfdi_orden` se quedó como columna de base sin
representación en `Gasto`, así que el motor de dinero quedó estructuralmente
incapaz de verla.

---

### [ALTO] `bitacora_auditoria`: 17 escritores a mano, sin función común — uno ya escribe la entidad equivocada

**Los dos lados.** El bloque canónico —el que casi todos copiaron— es
`src/lib/likida/administracion.ts:48-56`:
`{ tenant_id, actor_id: actor?.id ?? null, actor_email: actor?.email ?? null, accion, entidad, entidad_id, detalle }`.
La copia que ya se desincronizó es
`src/lib/likida/facturacion/avisar.ts:131-137`:

```
.insert({ tenant_id: args.tenantId, accion: 'facturacion.aviso_enviado',
          entidad: 'gasto', entidad_id: args.tenantId, … })
```

Dice que la entidad es un **gasto** y le pone como id el **uuid del tenant**. Y es
el único de los 17 que no escribe `actor_id` **ni** `actor_email`.

Los 17 (todos con `.from('bitacora_auditoria').insert(` escrito a mano, no
`insert` vía repositorio): `admin/campanas.ts:104`, `agents/copiloto-acciones.ts:170`,
`auth/llave-api-escritura.ts:71`, `auth/admin-context.ts:143`,
`auth/tenant-efectivo.ts:131`, `likida/interruptores.ts:204`,
`likida/facturacion/avisar.ts:131`, `likida/conectores/credenciales.ts:40`,
`likida/administracion.ts:48`, `likida/facturacion_escritura.ts:215`,
`likida/carta_porte_datos.ts:192`, `likida/clientes.ts:779`,
`likida/agentes/estrategia.ts:90`, `likida/agentes/definiciones.ts:159`,
`likida/agentes/cola.ts:270`, `correo/buzon_escritura.ts:70` (nuevo esta ronda),
más el único lector, `admin/bitacora.ts:54`.

Ya hay **tres formas** distintas de firmar el actor: 7 escriben `actor_id` +
`actor_email`; 7 escriben solo `actor_id`; `llave-api-escritura.ts:71` escribe
`actor_email: null` a mano; `avisar.ts:131` no escribe ninguno. El lector ya tiene
una rama para eso — `admin/bitacora.ts:74` cae en cascada
`actorJoin?.nombre ?? actorJoin?.email ?? f.actor_email ?? null` y su comentario
(`:24-25`) dice *"escritores viejos sin firma — se pinta 'sistema', no se
inventa"*. O sea: la divergencia ya está aceptada en el lector.

**Escenario con valores.** El contralor abre `/admin/observabilidad` → Bitácora y
filtra `facturacion`. Ve el renglón `facturacion.aviso_enviado`, entidad
`gasto`, id `8f3c…-a91b` — y copia ese id para buscar el gasto. No existe: es el
id de su propia flota. Y el actor sale como "sistema" en un evento que sí tuvo
destinatario humano (el encargado al que se le mandó el WhatsApp).
El costo estructural es el siguiente cambio: si mañana la bitácora necesita `ip`
o `via` (LFPDPPP obliga a dejar constancia del medio en el trámite ARCO), son 17
ediciones idénticas; la que se olvide deja un hueco que solo se descubre
auditando, que es cuando ya no sirve.

**Consecuencia.** El registro de auditoría es el artefacto cuya única función es
ser confiable, y su forma no la garantiza nada: ni un tipo, ni una función, ni un
test. Cada `insert` nuevo es una tirada de dados sobre 7 campos.

**Causa raíz probable.** El módulo `admin/bitacora.ts` se creó como **lector**
(su cabecera lo dice: *"EL PRIMER LECTOR de `bitacora_auditoria`"*, tras encontrar
"siete escritores y cero lectores"); nunca se creó el escritor recíproco, así que
la asimetría se arregló por el lado barato.

---

### [ALTO] La URL base de la app está escrita a mano en 7 sitios y ya divergió en 4 valores distintos

**Los lados** (todos leídos, ninguno importa al otro):

| Sitio | Qué hace si falta `NEXT_PUBLIC_APP_URL` |
|---|---|
| `src/app/login/page.tsx:61` (`siteUrl()`) | `'https://app.likida.ai'` |
| `src/lib/correo/plantilla.ts:58` (`base()`) | `'https://app.likida.ai'` — **nuevo esta ronda** |
| `src/lib/correo/avisos.ts:28` (`const APP`) | `'https://app.likida.ai'` — **nuevo esta ronda** |
| `src/lib/observability/alerta.ts:49` (`const APP`) | `'https://app.likida.ai'` |
| `src/app/api/auth/correo/route.ts:161` | `'https://app.likida.ai'` |
| `src/app/dashboard/usuarios/page.tsx:98` | `'https://app.likida.ai'` |
| `src/app/admin/vendedores/consola-vendedores.tsx:158` | `'https://app.likida.ai'` |
| `src/app/dashboard/suscripcion/page.tsx:192` | **`''`** |
| `src/lib/llm/openrouter.ts:31` | **`'https://likida.ai'`** (deliberado y comentado: es cabecera `HTTP-Referer`) |
| `src/app/api/v1/openapi/route.ts:753` | `new URL(req.url).origin` |
| `src/app/api/cron/facturar/route.ts:341` | `https://${req.headers.get('host')}` |

Que la variable puede faltar no es hipótesis del auditor: el repo ya tiene una
alarma de arranque dedicada a ese estado exacto, `src/lib/observability/arranque.ts:44-46`.

**Escenario con valores.** Se despliega una preview de Vercel sin
`NEXT_PUBLIC_APP_URL` (o alguien la borra del entorno). En el mismo build:
`login/page.tsx:61` arma el magic link contra `https://app.likida.ai` y el login
funciona; pero el dueño de la flota entra a `/dashboard/suscripcion` y pulsa
"Administrar cobro" → `suscripcion/page.tsx:192` manda a Stripe
`return_url = "/dashboard/suscripcion"`, una URL **relativa**, que la API de
Billing Portal rechaza; el `catch` de `:193` pinta el mensaje genérico de
`mensajeParaPantalla`. Misma variable ausente, dos comportamientos, y el que
falla es el de cobrar.

El barrido ya salió mal una vez: el 17-ago-2026 el suelo cambió de `likida.ai` a
`app.likida.ai` (`login/page.tsx:53-58` cuenta el incidente: *"el correo llegaba,
el link abría, y el usuario caía en un sitio que NO TIENE `/auth/callback`"*), lo
que obligó a tocar cada copia una por una.

**Consecuencia.** Cada dominio nuevo, cada subdominio, cada entorno de staging es
un barrido manual de 7+ archivos donde olvidar uno no rompe el build, no rompe
ningún test, y se descubre porque alguien no puede entrar o no puede pagar.

**Causa raíz probable.** `src/lib/env.ts` es un **inventario** de variables
(`faltantes()`, `envHealth()`), no un accesor; nunca se creó el punto único que
resuelva el valor, así que cada consumidor nuevo copia la expresión. El subsistema
`correo/` —nuevo esta ronda— añadió dos copias más en vez de reusar `siteUrl()`.

---

### [MEDIO] Cuarta copia del mapa de conceptos, esta vez fuera del guardia que existe para eso · REINCIDENCIA

**Los lados.** El guardia vivo es `src/lib/likida/etiquetas_sincronizadas.test.ts`
y vigila exactamente dos mapas (`:36-37`): el del motor
(`src/lib/likida/cuadre/engine.ts:1181`) y el del panel de detalle
(`src/app/dashboard/[id]/page.tsx:28-32`). Además prohíbe que el PDF vuelva a
tener uno propio (`:43`: `not.toMatch(/const CONCEPTO_LABEL/)` sobre `pdf.ts`).

El cuarto mapa —fuera de toda esa vigilancia— es
`src/app/dashboard/gasto-semanal-chart.tsx:9-13`, y se llama **exactamente
`CONCEPTO_LABEL`**, el nombre que el test prohíbe en el otro archivo:

```
const CONCEPTO_LABEL: Record<string, string> = {
  diesel: 'Diésel', caseta: 'Casetas', viaticos: 'Viáticos',
  factura: 'Facturas', … otro: 'Otros',
};
```

Ya diverge en tres valores contra el motor: `'Casetas'` vs `'Caseta'`,
`'Facturas'` vs `'Factura'`, `'Otros'` vs `'Otro'`. Se dio de alta el
**16-ago-2026** (`2943219`), dentro de la ventana de esta ronda — es decir,
*después* de que el test se escribiera para impedir la tercera copia.

**Escenario con valores.** `getGastoPorSemana` (`analytics.ts:497-505`) rellena
`series[].nombre` con la clave cruda de `gasto.concepto`. Mañana entra un concepto
nuevo al tipo — digamos `'lavado'` en `ConceptoGasto`. El test
`etiquetas_sincronizadas.test.ts:57-66` obliga a etiquetarlo en el motor, y de ahí
lo hereda el PDF por import; el panel de detalle lo obliga la comparación de
`:46-48`. La gráfica del Resumen no la obliga nadie: `gasto-semanal-chart.tsx:40`
cae en `CONCEPTO_LABEL[s.nombre] ?? s.nombre` y pinta la leyenda **`lavado`**, en
minúscula y sin acento, junto a "Diésel" y "Casetas". La suite entera pasa en
verde. Es literalmente el fallo que la cabecera del test narra como la PRIMERA
desincronización (*"`viaticos` partido en tres: el dashboard se quedó corto y un
concepto salía en blanco en pantalla"*).

**Consecuencia.** El guardia da una sensación de cobertura que ya no corresponde
al mapa real: quien lea el test creerá que las tres fuentes están cerradas cuando
son cuatro y la nueva es la única que se ve en la pantalla de entrada.

**Causa raíz probable.** El test ancla por **rutas literales** (`'./cuadre/engine.ts'`,
`'../../app/dashboard/[id]/page.tsx'`), no por barrido de `src/`, así que un
archivo nuevo entra al repo por fuera de su radar. El mecanismo que sí escala —el
del `formato.ts`, que busca el patrón en TODO `src/`— existe en este mismo repo y
no se aplicó aquí.

---

### [BAJO] El PDF de dinero depende del subsistema de correo

`src/lib/likida/liquidacion/pdf.ts:19` y `src/lib/likida/informes/pdf.ts:16`
importan `LOGO_PNG_BASE64` de `@/lib/correo/logo` (`src/lib/correo/logo.ts:10`).
El import se introdujo el **17-ago-2026** (`f5bdb3a`), dentro de esta ronda; el
módulo `correo/` es de la ronda también (16-ago).

La dependencia apunta al revés: el papel que el contralor le manda a su contador
—el artefacto más viejo y más crítico del producto— cuelga de un módulo cuya razón
de existir es un problema de clientes de correo. La cabecera de `logo.ts:4-9` lo
dice sola: el PNG está en base64 *"porque Gmail bloquea las imágenes externas por
defecto"* y *"son 4.5 KB por correo"*. Un PDF no tiene ninguna de esas dos
restricciones.

**Escenario con valores.** Alguien optimiza la entregabilidad y cambia
`logo.ts:10` por una variante monocroma de 1.2 KB que se vea bien en el modo
oscuro de Gmail. `npx tsc` pasa, los tests de `correo/` pasan, y el pie de **todas
las liquidaciones y todos los informes** cambia de logo sin que nadie lo pida ni
lo note hasta mirar un PDF.

**Consecuencia.** Cualquier refactor del canal de correo (cambio de proveedor,
plantillas hospedadas, borrado del módulo) arrastra al motor de papel de dinero.

**Causa raíz probable.** No hay un lugar para "activos de marca"; el logo se
codificó donde primero se necesitó y el segundo consumidor lo importó de ahí.

---

### [BAJO] "Hoy en México" tiene dos ortografías y el guardia de formato solo cubre las cifras

`src/lib/formato.ts` es frontera real para el dinero: `toLocaleString('es-MX')` no
aparece en ningún otro archivo no-test (verificado; `src/lib/formato.test.ts`
pasa). Pero el mismo archivo exporta `TZ_MX` (`:34`) y `fechaMx`/`fechaCorta`/
`fechaHoraMx` y **no** exporta un `hoyMx()`, así que el día local de México se
escribe de dos maneras que el guardia no mira:

- `new Date().toLocaleDateString('en-CA', { timeZone: TZ_MX })` — 13 sitios
  no-test, entre ellos `analytics.ts:105,155,380,473,526,549,583,1190`,
  `admin/negocio.ts:189,195`, `clientes.ts:601`;
- `new Intl.DateTimeFormat('en-CA', { timeZone: TZ_MX }).format(new Date())` —
  25 sitios no-test, entre ellos `dashboard/inicio-contenido.tsx:256`,
  `likida/agentes/runner.ts:63`, `likida/agentes/cola.ts:340`,
  `auth/tenant-efectivo.ts:87`.

Y dos de ellos ni siquiera usan la constante: `src/lib/admin/consumo.ts:49` y
`src/lib/admin/qa-storage.ts:244` escriben el literal
`'America/Mexico_City'` a mano en vez de `TZ_MX`.

**Escenario con valores.** El día que la zona horaria deje de ser una constante
—México reintroduce horario de verano, o el producto pasa a cortar por la zona de
la flota— hay que tocar 40 sitios. Los dos que hardcodean el literal no aparecen
buscando `TZ_MX`, así que `/admin` → "Costo de IA hoy" (`consumo.ts:49`) seguiría
cortando el día por Ciudad de México mientras `/dashboard` → "Gasto de hoy"
(`analytics.ts:473`) ya cortaría por otra: dos pantallas con la palabra "hoy" y
dos ventanas distintas, sin un solo error.

**Consecuencia.** El invariante que el repo cree tener ("el formato vive en un
solo archivo") es cierto para las cifras y falso para las fechas, y la prueba que
lo defiende no distingue.

**Causa raíz probable.** El guardia se escribió contra el síntoma concreto que
dolió (`toLocaleString('es-MX')`, tres representaciones de 1234.56 litros) y no
contra la categoría.

---

## Estado de las fronteras

| Frontera | ¿Se respeta? | Fugas (`archivo:línea`) | Conteo |
|---|---|---|---|
| **Motor de dinero puro** (`cuadre/`, `liquidacion/`) | **Sí, sin excepción** | cero `supabase`/`createClient`/`fetch(` en los 2 directorios; `engine.ts:20` lo declara y `deducibilidad.ts` importa **solo** un tipo | 0 fugas |
| **`repo.ts` como acceso único a datos** | **No — la frontera es nominal** | `.from('…')` fuera de `repo.ts`/`pg.ts`: `admin/qa-motor.ts:169` (insert `viaje`), `likida/operacion.ts:627`, `carta_porte_datos.ts:182`, `administracion.ts:496` (delete `liquidacion`), `hitos_viaje.ts:104`, `escalar_viaje.ts:470`, `confirmar_viaje.ts:91`, `importar_viajes.ts:434`, `agentes/cobranza.ts:320`, `facturacion/al_vuelo.ts:518`, `intake/consolidado.ts:176`, `dashboard/agentes/facturas/page.tsx:78`… | **119 archivos no-test / 579 llamadas** fuera de `repo.ts`+`pg.ts` (repo.ts aporta 2). Por capa: `lib/likida` 55, `lib/admin` 16, `app/api` 15, `app/dashboard` 10, `lib/auth` 7, `app/admin` 7, `lib/agents` 4, `lib/correo` 1. **36 llamadas viven dentro de componentes `.tsx`** |
| **Escritura de `gasto.cfdi_uuid`** | **No** | 4 escritores: `al_vuelo.ts:518`, `intake/consolidado.ts:176`, `dashboard/agentes/facturas/page.tsx:78` (fija `cfdi_orden: 1` a mano), `intake/*` vía repo | 4 |
| **`bitacora_auditoria`** | **No** | ver hallazgo ALTO — 16 `insert` a mano + 1 lector | **17 archivos** |
| **`formato.ts` para cifras** | **Sí** | ninguna: `toLocaleString('es-MX')` no aparece fuera; `app/dashboard/formato.ts` es re-export puro; `admin/ui/formato-preset.ts` importa y no reimplementa | 0 |
| **`formato.ts` para fechas / zona** | **No** | ver hallazgo BAJO; literal `'America/Mexico_City'` en `admin/consumo.ts:49`, `admin/qa-storage.ts:244` | 38 sitios, 2 sin `TZ_MX` |
| **Mapa único de conceptos de gasto** | **Parcial (mejoró)** | `pdf.ts` ya importa `etiquetaConcepto` (`liquidacion/pdf.ts:14`) — el hallazgo canónico está cerrado. Queda la copia vigilada (`dashboard/[id]/page.tsx:28`) y la **no vigilada** (`gasto-semanal-chart.tsx:9`) | 3 mapas, 2 bajo test |
| **Mapa único de estatus** | **Sí** | duplicado eliminado: `app/dashboard/estatus.ts` es fuente única y el test (`etiquetas_sincronizadas.test.ts:107-117`) impide que vuelva | 0 |
| **Un solo bucle de tool-calling** | **Sí** | `tool_calls` solo se itera en `src/lib/llm/openrouter.ts:757,796`; los 4 definidores de tools (`likida/tools.ts`, `agents/chat-tools.ts`, `agents/copiloto-tools.ts`, `llm/tool-executor.ts`) alimentan ese único bucle | 1 bucle |
| **Un solo emisor de correo** (`correo/enviar.ts`) | **Sí** — la frontera mejor respetada del repo | 18 importadores de `enviarCorreo`/`correoConfigurado`, cero reimplementaciones. Única lectura directa de `RESEND_API_KEY` fuera: `app/api/correo/entrante/route.ts:169,226`, y es OTRO endpoint (bajar adjuntos) | 1 |
| **URL base de la app** | **No** | ver hallazgo ALTO | **11 sitios, 4 valores** |
| **`lib/admin` = el único barrio cross-tenant** | Parcial | ya no es "una sola función": `admin/negocio.ts`, `admin/bitacora.ts:54`, `admin/soporte.ts`, `admin/consumo.ts`… El `MAPA.md:15` y `CLAUDE.md` siguen diciendo *"`lib/admin/negocio.ts` es la única función con ese permiso"* | 16 archivos en el barrio |

---

## Lo que revisé y está bien

- **El hallazgo abierto de la ronda anterior está cerrado, y bien cerrado.**
  `otro: 'Gasto'` ya no existe: `engine.ts:1181` dice `otro: 'Otro'` con el
  comentario que explica por qué, y `liquidacion/pdf.ts:14` **importa**
  `etiquetaConcepto` en vez de tener mapa gemelo. La cabecera del test
  (`etiquetas_sincronizadas.test.ts:33-35`) razona el cambio correctamente:
  *"Una función importada no puede desincronizarse, que es mejor que un test que
  avisa cuando ya pasó."* Eso es subir el nivel de la frontera, no parchear.
- **El motor de dinero es puro, verificado y no por confianza.** Cero
  `supabase`/`fetch` en los 12 archivos no-test de `cuadre/` y `liquidacion/`.
  `deducibilidad.ts` importa **una sola línea**: un `type`. Todo el I/O que el
  motor necesita lo precalcula `cuadre/desde_db.ts` y se lo pasa como argumento.
- **El duplicado de `ESTATUS` se eliminó de verdad** (no se vigiló: se borró), y
  el test lo dice con honestidad: *"comparar una copia consigo misma no prueba
  nada"* (`etiquetas_sincronizadas.test.ts:69-83`).
- **El subsistema nuevo respeta la frontera que más importaba.** `correo/enviar.ts`
  es el único emisor y tiene 18 importadores sin una sola reimplementación;
  `correo/auth.ts` es **puro** (recibe `base` como parámetro, `destinoPermitido`
  en `:119-131` compara `origin` completo) y devuelve un `Correo` en vez de HTML,
  para que el logo, el pie y el escapado sigan en un solo sitio (`:190-193`).
- **`formato.ts` sigue siendo frontera dura para el dinero**, y los dos archivos
  que parecen competencia no lo son: `app/dashboard/formato.ts` es re-export puro,
  `admin/ui/formato-preset.ts` importa `mxn`/`litros` con el motivo escrito.
- **Un solo bucle de tool-calling** para cuatro conjuntos de tools.
- `npx vitest run src/lib/likida/etiquetas_sincronizadas.test.ts src/lib/formato.test.ts`
  → 33/33 en verde: los dos guardias que cité están vivos hoy.

---

## Lo que NO alcancé a revisar

- **El `.from(` archivo por archivo.** Conté los 119 archivos y abrí ~25. No sé
  cuántas de las 579 llamadas fuera de `repo.ts` pasan por `acotada()`
  (`presupuesto.ts`) ni cuántas por `traerTodo()`; el corte de 1,000 filas de
  PostgREST puede estar sin cubrir en sitios que no miré. Es medible con un
  barrido dedicado.
- **Si el bug CRÍTICO tiene ya un caso en producción.** La base está en cero
  viajes (no hay clientes), así que el hallazgo se sostiene por lectura de código
  y por el índice de la 0065; no hay fila que lo demuestre.
- **`src/lib/likida/agentes/` (11 archivos) y `src/lib/admin/` (16)** los recorrí
  solo por sus `.from(` y sus `insert` de bitácora, no por su acoplamiento entre
  sí.
- **Las ~31 páginas de `/dashboard` como grafo de dependencias.** Verifiqué que
  reusan `ui/kit`/`charts` (no hay segunda librería) pero no busqué componentes
  gemelos entre `/admin` y `/dashboard`.
- **`npx tsc --noEmit` completo** — no lo corrí; no toqué código y los dos tests
  que cité pasan, pero no puedo afirmar que el árbol compile limpio.
- **Las 136 migraciones** contra el código: solo abrí la 0065 y la 0008. Puede
  haber más columnas que, como `cfdi_orden`, existen en la base y no en el tipo
  del dominio — ese es el patrón exacto del hallazgo CRÍTICO y merece un barrido
  propio.
