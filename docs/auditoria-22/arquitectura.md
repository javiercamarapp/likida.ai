# Arquitectura y mantenibilidad — auditoría 22

**Nota: 6/10** (antes: s/d). Razón: línea base nueva, sin ancla previa legible.
El 6 y no más: las fronteras EXISTEN y están medidas (la del dato tiene trinquete
propio, el motor de dinero tiene UN solo ensamblador, el código muerto es
prácticamente cero: 2 módulos huérfanos de 773). El 6 y no menos: la lógica de
dinero no vive en dos archivos. Lo que lo baja son **dos reincidencias del mismo
patrón estructural** —una regla arreglada en UNA de sus N copias— y una de ellas
produce hoy una cifra en pesos equivocada.

**El riesgo mayor del rubro, hoy:** el destino fiscal de un comprobante lo deciden
**cuatro listas de `TipoDiferencia` escritas a mano** sobre una unión de 42
valores, y TypeScript solo verifica pertenencia, nunca cobertura ni coherencia
entre ellas. Ya se rompió cuatro veces por el mismo camino (`gasto_otro_ejercicio`,
`cfdi_pendiente` ×2, `cfdi_efos_indeterminado`, `renglones_ajenos`); la quinta está
viva y medida abajo.

---

## Hallazgos

### [ALTO] `renglones_ajenos` cae en «por confirmar» para ISR y aun así acredita su IVA completo — la lista que lo debía atajar es la única de las cuatro que no se actualizó

`src/lib/likida/cuadre/engine.ts:252` (`POR_CONFIRMAR`) · `src/lib/likida/cuadre/engine.ts:1267` (`SIN_ACREDITAMIENTO`) · `src/lib/likida/cuadre/engine.ts:1285` · `src/lib/likida/cuadre/renglones_ajenos.test.ts:23`

**Escenario (corrido, no inferido).** Con el fixture que la propia prueba del repo
usa —hospedaje de **$1,000.00**, CFDI timbrado y `xmlVerificado: true`,
`ivaTraslado: 137.93`, y un OCR que detectó **$300.00 de «Cargador de celular»**
(30% ajeno al viaje)— `cuadrarViaje` devuelve:

```
cubeta          : por_confirmar
totalComprobado : 1000
totalDeducible  : 0
totalPorConfirmar: 1000
totalNoDeducible: 0
ivaAcreditable  : 137.93      ← entra → sale mal
```

Es decir: la misma hoja dice «Deducible para ISR: nada · Por confirmar:
$1,000.00» y, dos renglones abajo, «IVA acreditable: $137.93». El propio bloque
que calcula esa cifra cita LIVA 5-I —«en la PROPORCIÓN en la que dichas
erogaciones sean deducibles»— y con deducible $0 la proporción es cero.

La causa es puramente estructural y está medida: de los 7 tipos de
`POR_CONFIRMAR`, **5 están también en `SIN_ACREDITAMIENTO` y 2 no**:
`renglones_ajenos` y `ticket_monedero`. `ticket_monedero` es inofensivo por
accidente (solo se emite con `!g.cfdiUuid`, `engine.ts:465`, y el bucle de
acreditamiento exige `xmlVerificado`, `engine.ts:1290`); `renglones_ajenos` no,
porque un ticket de canasta mixta fotografiado y luego timbrado tiene las dos
cosas. La doctrina «tercer estado: ni deducible ni acreditable» está escrita en
prosa en `engine.ts:1268-1275` pero **no está derivada en código**: son dos
arreglos literales independientes, y quien arregló FISCAL-19C2-6
(`renglones_ajenos.test.ts:1-10`) tocó `POR_CONFIRMAR` y `REVISAR` y no la
tercera lista, que vive **1,015 líneas más abajo y DENTRO del cuerpo de la
función**, no junto a sus dos hermanas exportadas de las líneas 236 y 252.

**Consecuencia.** El contralor cruza el PDF contra su papel de trabajo y encuentra
IVA acreditado sobre un comprobante que la misma hoja declara no confirmado. Es
exactamente la contradicción que costó dos CRÍTICOS fiscales antes
(`engine.ts:237-251` y `engine.ts:1256-1261` documentan los dos). El rubro fiscal
puede calificar la cifra por su cuenta; aquí se reporta por su causa: **la misma
verdad repartida en cuatro literales que nadie obliga a coincidir** (8 · 7 · 17 ·
34 valores sobre una unión de 42).

**Causa raíz probable:** `cubetaDe()` (engine.ts:268) es «la ÚNICA definición»
para ISR, pero no existe su gemela para el acreditamiento: `SIN_ACREDITAMIENTO`
es un `const` local sin exportar, sin prueba de contención contra `POR_CONFIRMAR`
ni `NO_DEDUCIBLE_ISR`.

---

### [ALTO] «un costo no medido no es cero» está implementado en 1 de los 3 agentes que gastan modelo — `atencion_faq` anota $0.00 y el único techo de gasto nunca corta

`src/lib/likida/agentes/faq.ts:421` · `src/lib/likida/agentes/contenido.ts:390` · `src/lib/likida/agentes/runner.ts:755` · `src/lib/likida/agentes/exito.ts:226` · `src/lib/likida/agentes/sdr.ts:171`

**Escenario.** OpenRouter contesta sin bloque `usage` (rama real y prevista:
`openrouter.ts:391-406` la marca con `noMedido: true` y devuelve `cost` ≈ 0 en
modo plataforma, donde no hay reserva de la que colgarse). Entonces:

- `contenido.ts:390` — **cierra**: `if (r.noMedido) costoUsd = null`, y
  `runner.ts:755` pregunta `corridasSinCostoMedidoHoy('contenido_fiscal')` y
  **salta** el agente hasta el día siguiente.
- `faq.ts:421-422` — **no cierra**: `costoUsd += r.cost` (o sea, `+= 0`) y
  `if (r.noMedido) logger.warn(...)`. Nada más. `exito.ts:226` recibe
  `costoUsd = 0` con tipo `number` (no `number | null`), así que
  `agente_corrida.costo_usd` queda en **0.00, no en NULL**.
- El runner, para `atencion_faq` (`runner.ts:703-712`), consulta **solo**
  `gastoDelDiaUsd`. Nunca `corridasSinCostoMedidoHoy` — esa llamada existe una
  sola vez en todo el archivo (`runner.ts:755`).

Con valores: `atencion_faq` tiene `presupuesto_dia_usd = 1.00` y
`modelo_rol = 'back_office'` (mig. `0218_agentes_exito_cliente.sql:117`),
redacta hasta `TOPE_BORRADORES_FAQ = 5` borradores por vuelta (`faq.ts:63`) y el
runner corre `0 */4 * * *` (`vercel.json:14`) → 6 vueltas, hasta 30 llamadas de
600 tokens de salida sobre un prompt con corpus. Las 6 corridas escriben
`costo_usd = 0.00`, `gastoDelDiaUsd` suma **$0.00 < $1.00**, y el techo despacha
otra vuelta, todo el día. `/admin` reporta $0.00 gastados por un agente que
gastó de verdad.

Es **literalmente** el modo de falla que `runner.ts:336-340` y
`crecimiento.ts:100-107` describen como c7-11 («el agente redactaba, gastaba de
verdad, anotaba $0, y el techo NUNCA cortaba»), arreglado en el hermano y no en
éste. `sdr.ts:171` está a mitad de camino por accidente: devuelve `r.cost`
ignorando `noMedido`, y solo se salva cuando la suma da exactamente 0 gracias al
`costoUsd || undefined` de `sdr.ts:227` — con 3 llamadas medidas y 2 no medidas
en la misma corrida, escribe la suma parcial como si fuera medida.

**Consecuencia.** Javier es el único que paga estas corridas hoy y el panel de
costo de IA le miente a favor. Con clientes, el mismo patrón está a un
`generateResponse` de distancia de cualquiera de los 52 agentes.

**Causa raíz probable:** `registrarCorrida` acepta `number | null`
(`agentes/corridas.ts:95`) pero **tres** envoltorios `anotarCorrida` distintos
—`leads.ts:156`, `crecimiento.ts:173`, `direccion.ts:132`— más el de
`exito.ts:226` deciden por su cuenta cómo tratar el nulo, y solo uno lo propaga.

---

### [MEDIO] `procesarTurno` son 2,874 líneas en una sola función: 74% de `processor.ts` y el archivo por el que pasa todo el dinero entrante

`src/lib/likida/processor.ts:989-3862`

**Escenario.** Dentro de ese cuerpo hay **73 `return;` pelones**, 159 `if (`,
224 `await` y una anidación de hasta 18 espacios (`processor.ts:2759`). La
conversación se carga tarde (`processor.ts:3252`) y se guarda al final
(`processor.ts:3810`), así que **cada `return` anterior es un turno que el
operador vio y que el historial no tiene**. Ese no es un riesgo teórico: es el
bug ya pagado, descrito con nombre y apellido en `processor.ts:2963-2979`
(«el atajo salía con `say(...); return;` sin pasar nunca por `saveConversation`
…`intento` valía 1 para siempre… el chofer recibía "Perdón, no te entendí"
indefinidamente»). Se cerró en **2** de los 65 puntos donde hoy se contesta y se
sale: `processor.ts:3015` y `processor.ts:3290`.

Uno concreto y vivo: `processor.ts:3320-3328` —la rama «no alcanza el
presupuesto para el agente»— carga `conv` en 3252, manda el cuadre
determinístico con `say(resumenCuadre(...))` y hace `return;` sin guardar. El
operador escribe «listo», recibe su cuadre; escribe «ok, ¿y mi PDF?» y el agente
arranca ese turno con un historial en el que ni el «listo» ni el cuadre que ya
mandó existen.

**Consecuencia.** Quien añada una rama nueva a `procesarTurno` —que es lo que se
hace cada semana: el archivo creció con hitos, jornada, POD, talacha, briefing—
tiene que acordarse a mano de guardar el turno. Nada en el tipo ni en la suite se
lo recuerda. El costo lo paga el chofer con un bot que repregunta.

**Causa raíz probable:** el `try/catch/finally` general vive en la misma función
que las ~20 ramas de despacho, así que extraer una rama obliga a reproducir el
contrato de salida (`soltarClaim`, `lockedViaje`, `saveConversation`) en vez de
heredarlo.

Dato de contexto del rubro: la otra función de este tamaño es
`cuadrarViaje` — **1,165 líneas**, `engine.ts:351-1515`, 76% del motor, con 44
`diferencias.push`. Las dos funciones más largas del repo son las dos por donde
pasa el dinero. 43 archivos de producción pasan de 800 líneas; 26 pasan de 1,000.

---

### [MEDIO] La consola del superadmin monta la mitad de sus pantallas sobre un archivo del panel del CLIENTE, y la dependencia cruza en las dos direcciones

`src/app/dashboard/resumen-visual.tsx:1-4` · `src/app/admin/corridas/page.tsx:8` · `src/app/admin/soporte/page.tsx:27` · `src/app/admin/mapa-prospectos/cerebro.tsx:25`

**Escenario.** No existe `app/ui/`. El kit visual está partido en dos árboles de
RUTAS: `app/admin/ui/kit.tsx` (importado por **64** archivos de `/dashboard`) y
`app/dashboard/resumen-visual.tsx` (importado por **53** archivos de `/admin`,
que además se lleva `paginar-registro`, `registro-filtro`, `soporte/estatus` y
`mapa/mexico-geo`). CLAUDE.md describe una sola dirección («/dashboard reusa los
componentes de /admin»); el árbol dice las dos, y la más pesada es la que el
documento no menciona.

El bug nombrable: `/dashboard` es el árbol que este repo **borra entero cuando
rediseña**. `lib/auth/visibilidad.ts:62-71` deja constancia de que el 10-ago-2026
se borraron 17 páginas de «dueño de flota» y 6 del panel del contador en un solo
día. Quien haga el siguiente rediseño de `/dashboard` —y lo va a haber— toca
`resumen-visual.tsx` creyendo que edita el panel del cliente y está editando el
encabezado de 53 pantallas de Javier. En la variante barata rompe el build (que
sí se ve); en la cara, cambia un rótulo «para el cliente» y se lo cambia también
al superadmin, que es la clase de cambio que ninguna prueba pinta.

**Consecuencia.** La regla «quién es dueño de qué» dejó de poderse leer del árbol
de directorios, que es lo único que un agente nuevo lee antes de tocar.

**Causa raíz probable:** el kit nació en `/admin` y el lenguaje visual nuevo nació
en `/dashboard`; nadie promovió ninguno de los dos a un módulo neutro cuando
empezaron a cruzarse.

---

### [BAJO] `viajes/libro.tsx` — 333 líneas de UI terminada, documentada y probada en comentario, que ninguna página renderiza

`src/app/dashboard/viajes/libro.tsx:1-333` · `src/app/dashboard/viajes/page.tsx` · `src/lib/likida/libro_viaje.ts:1-717`

**Escenario.** Es **1 de los 2 únicos módulos huérfanos** de los 773 de
producción (el otro es `src/app/admin/ui/use-in-view.ts`, 34 líneas). Su lógica
(`libro_viaje.ts`) sí está viva: la usan `/api/v1/viajes/[id]`,
`/api/v1/viajes/[id]/contribucion`, `lib/mcp/herramientas/dinero.ts` y
`auditor_cobranza.ts`. La VISTA no: `dashboard/viajes/page.tsx` no la importa
—ni ningún otro archivo— y `git log` muestra un solo commit sobre ella, o sea que
nació sin cablear. El archivo se presenta con tres reglas de producto
(«la palabra UTILIDAD no aparece», «el verde no se regala», `puedeVerDinero`
obligatoria) y con instrucciones para mirarla bajo un preview temporal.

Quien cambie `rotuloFacturacion`/`rotuloCobro` en `libro_viaje.ts` y siga
CLAUDE.md §«Mirar el render» abrirá `/dashboard/viajes`, no verá cambio alguno, y
concluirá que su cambio no llegó a pantalla —cuando lo que pasa es que esa
pantalla no existe, aunque el MCP y `/v1` sí sirvan esos rótulos a un cliente.

**Consecuencia.** Deuda que cobra factura el día del rediseño de `/dashboard`:
333 líneas que parecen la implementación actual y son un borrador.

**Causa raíz probable:** la vista se construyó antes que su página y el commit que
la iba a cablear no llegó; nada en la suite detecta un componente sin importador.

---

### [BAJO] Una ruta de producción importa desde `scripts/`, que `npm run lint` no mira

`src/app/admin/qa/page.tsx:6` · `src/lib/admin/qa-motor.ts:34` · `scripts/qa-agentes/config.qa.ts:16,63,97`

**Escenario.** `npm run lint` es `eslint src/` (`package.json`). Pero
`/admin/qa` (server component) y `/api/admin/qa/lanzar` → `qa-motor.ts` importan
`scripts/qa-agentes/config.qa.ts`, así que ese archivo **viaja en el bundle
serverless**. Ahí adentro hay `export const REPO = process.cwd()` evaluado al
importar, `readFileSync`/`existsSync` de `.env.local`, y —lo que importa— el
guard `exigirTenantZZZ` (`config.qa.ts:97`), que es lo único que impide que la
limpieza de QA (`qa-motor.ts:382`, `db.from('tenant').delete()`) borre un tenant
real del **mismo proyecto de Supabase que algún día tendrá clientes**
(`config.qa.ts:8-9` lo dice textualmente).

Quien edite ese archivo lo va a leer como un script de desarrollo —su encabezado
dice «ejército de QA», escribe evidencia en `docs/qa/`— sin saber que corre en
Vercel: un `cargaEnvLocal()` a nivel de módulo, o un `readFileSync` de un archivo
que no está en el bundle, revienta `/admin/qa` en producción y no lo ve ningún
linter.

**Consecuencia.** El guard más importante del repo contra un borrado real vive
fuera de la puerta de verificación declarada en CLAUDE.md. (`tsc --noEmit -p .`
sí lo cubre: `tsconfig.json` incluye `**/*.ts` desde la raíz. `eslint` y el
`lint:ratchet` no.)

**Causa raíz probable:** el panel de QA reusó el arnés del ejército «tal cual»
—decisión correcta, para no tener dos guards— sin mover el módulo compartido a
`src/`.

---

### [BAJO] Los rótulos de rol viven en 7 mapas `Record<string, string>`, dos de ellos ya divergen y ninguno conoce a `vendedor`

`src/app/dashboard/mi-perfil/page.tsx:18` · `src/app/admin/mi-perfil/page.tsx:10` · `src/app/dashboard/chrome.tsx:26` · `src/app/dashboard/usuarios/vista.tsx:11` · `src/app/dashboard/aviso-rol.tsx:7` · `src/app/dashboard/agentes/notificaciones-forma.tsx:45` · `src/app/dashboard/sesiones-mcp/vista.tsx:19`

**Escenario.** El dominio real de `app_user.rol` es
`('superadmin','flota_admin','contador','encargado','vendedor')`
(`supabase/migrations/0105_zona_vendedores.sql:52`; `operador` se retiró en la
0086) y el tipo `RolAppUser` (`src/lib/auth/provisionar.ts:20`) lo refleja bien.
Los siete mapas de pantalla, en cambio:

- llaman al mismo rol **«Encargado»** (`mi-perfil/page.tsx:21`) y **«Jefe de
  tráfico»** (`aviso-rol.tsx:9` y `notificaciones-forma.tsx:47`) — la misma
  persona, dos nombres, en el mismo panel;
- cuatro de ellos siguen listando `operador`, que ya no puede existir en esa
  tabla;
- **ninguno** conoce `vendedor`, que sí puede: un usuario de ventas que abra
  `/admin/mi-perfil` lee `ROL_LABEL[s.rol] ?? s.rol`
  (`admin/mi-perfil/page.tsx:124`) y ve la cadena cruda `vendedor`, y en
  `chrome.tsx:89` la ve como `VENDEDOR` a gritos.

**Consecuencia.** Cosmético hoy (los `??` evitan el `undefined`), pero es el
mismo patrón que ya obligó a construir `etiquetas_sincronizadas.test.ts` para los
conceptos de gasto: mapas `Record<string, string>` en vez de
`Record<RolAppUser, string>`. La forma cerrada existe en la casa y funciona —
`dashboard/soporte/estatus.ts:21` usa `Record<EstadoTicket, …>` y explica por qué
en su encabezado; `reglas/catalogo.ts:96` usa `Record<ConceptoGasto, string>`.
Los mapas del panel eligieron la forma abierta y por eso necesitan un test que
escanee el disco.

**Causa raíz probable:** `rol` viaja como `string` desde la sesión hasta la
pantalla, así que anotar el mapa con el tipo cerrado obligaría a estrechar en el
borde y nadie lo hizo.

---

## Lo que revisé y está bien

- **El motor de dinero sigue siendo puro y con un solo ensamblador.**
  `cuadre/engine.ts:11-22` no importa nada con I/O y lo declara
  (`// 'formato.ts' no importa NADA`). `cuadrarViaje` se llama desde **un** sitio
  de producción (`cuadre/desde_db.ts:136`) más la demo pública
  (`app/api/demo/route.ts:68`); todo lo demás —tools del agente
  (`tools.ts:83`), guardia determinística (`cuadre/guardia.ts:107`), panel
  (`analytics.ts:1546`)— pasa por `cuadrarDesdeDB`. No hay segundo ensamblador.
- **El techo del acceso directo a datos es un trinquete real, no una allowlist.**
  `frontera_datos_guardiana.test.ts:30-64` barre `src/` completo (la lección de
  `acotada_guardiana.test.ts`) y congela el número. Lo medí a mano hoy: **241 de
  241** — saturado, así que cualquier archivo nuevo con `.from(`/`.rpc(` fuera de
  `repo.ts`/`pg.ts` pone la suite en rojo. La regresión que mató al guard
  anterior no puede repetirse.
- **`service_role` no cruza al navegador.** Los 13 componentes con `'use client'`
  que mencionan `supabaseAdmin` lo hacen **en comentarios que explican por qué
  NO lo importan** (`dashboard/clientes/forma.tsx:8`,
  `dashboard/llaves-api/forma.tsx:6`, `admin/copiloto.tsx:102`). Cero
  importaciones reales.
- **Un solo escritor de `viaje`, y el segundo camino conserva los invariantes.**
  `operacion.ts:658` es el único `insert` de producción (el otro,
  `qa-motor.ts:244`, es del arnés). `crearViaje` cierra cinco invariantes a mano
  (`operacion.ts:611-655`: operador propio, operador activo, unidad propia,
  unidad activa, cliente propio) y el importador masivo
  (`importar_viajes.ts:456-484`) resuelve sus catálogos con
  `.eq('activo', true)` (`importar_viajes.ts:291`, `:366`) y verifica ocupación
  **fallando cerrado** si no puede leerla (`:466-475`). No divergen.
- **La ruta del PDF está atada por prueba estructural.**
  `ruta_pdf_sincronizada.test.ts:47-82` compara las plantillas de `tools.ts` y
  `processor.ts` con los nombres de variable borrados, y exige que el ejemplar
  completo se firme en UNA sola línea. Verifiqué que no apareció un tercer
  literal: `api/export/pdf/[id]/route.ts:100` lee la ruta de
  `liquidacion.pdf_url`, no la reconstruye.
- **Las copias de etiquetas de concepto están vigiladas por barrido, no por
  lista.** `etiquetas_sincronizadas.test.ts:42-88` busca el PATRÓN en todo
  `src/` (la corrección del fallo de la auditoría 18) y
  `conceptos_gasto_espejos.test.ts:50-111` cruza los cuatro espejos de
  `ConceptoGasto` entre sí y contra el tipo, con la única excepción declarada.
  El caso canónico del rubro está cerrado: `engine.ts:1540` dice `otro: 'Otro'`
  con el comentario que explica por qué.
- **«Qué gasto es copia» tiene una sola fuente con prueba de contención.**
  `copias_un_origen.test.ts:88-106` prohíbe por escaneo de fuentes que alguien
  vuelva a derivarlo de `diferencias` y exige que los tres consumidores importen
  `copiasDeComprobante`.
- **Invariantes que SÍ están cerradas por tipo** (no por acordarse):
  `dashboard/soporte/estatus.ts:21` (`Record<EstadoTicket, …>`, con el porqué
  escrito), `reglas/catalogo.ts:96` (`Record<ConceptoGasto, string>`),
  `briefing_inicio_wa.ts:48` y `asistencia_coordinacion.ts:96` (los dos
  `Record<TipoProveedor, string>`), `lib/auth/invitar.ts:49-68`
  (`ROLES_INVITABLES` como `as const` → `RolInvitable`, con `superadmin`,
  `operador` y `vendedor` fuera y justificados uno por uno).
- **Fail-closed por defecto en la capa de visibilidad.**
  `lib/auth/visibilidad.ts:47-49` y `:56-60`: un rol desconocido no ve nada y
  una ruta sin clasificar se niega. Es la dirección correcta del error.
- **Código muerto ≈ 0.** Resolví el grafo de importaciones de los 773 archivos de
  producción (alias `@/` y relativos, excluyendo los archivos especiales de
  Next): **2 huérfanos**, ambos reportados arriba.
- **Las 8 copias de `lunesDe`/`lunesDeSemana` NO divergen.** Las comparé una por
  una (`direccion/reportes.ts:70`, `agentes/{finanzas:109, backoffice:107,
  leads:105, crecimiento:120, direccion:85, ingenieria:171, exito:157}`,
  `jornada/semanas.ts:67`): todas hacen `- ((getUTCDay()+6)%7)` sobre
  `YYYY-MM-DD`, unas ancladas a 00:00Z y otras a 12:00Z, y con aritmética UTC
  pura eso da idéntico resultado. La redefinición está justificada por escrito
  en cada una (evitar arrastrar el árbol del módulo en un import dinámico). No es
  hallazgo; queda como deuda de vigilancia, porque nada prueba que sigan iguales.
- **`areaDeLlaveAlcanza` se importa, no se copia**, aunque la dirección esté
  invertida (`lib/mcp/credencial.ts:20` → `app/api/v1/_comun.ts:179`). Preferible
  a dos implementaciones del alcance de una llave; lo anoto solo como dependencia
  que apunta al revés, sin bug hoy.

---

## Lo que NO alcancé a revisar

- **`facturacion/` (2,642 + 1,339 + 1,282 + 1,114 líneas en cuatro archivos)**:
  `comercios.ts`, `adaptadores/pagina_playwright.ts`, `adaptadores/capufe.ts` y
  `adaptadores/portales.ts`. Es el subsistema más grande que no abrí, y por su
  forma (un adaptador por portal) es donde más probable es que la misma regla de
  timbrado esté escrita N veces.
- **`contabilidad/poliza.ts` + `catalogo.ts` contra `fiscal.ts` (1,468 líneas)**:
  no verifiqué si el reparto de cuentas de la póliza deriva de `cubetaDe` o lo
  reconstruye. Dado el hallazgo de las cuatro listas, es el sitio con más
  probabilidad de albergar la quinta.
- **Las 69 rutas de `src/app/api/`**: solo abrí `export/pdf`, `export/poliza`,
  `admin/qa/lanzar`, `v1/viajes` y `cron/runner`. No comparé los ~10 `route.ts`
  de `cron/` entre sí, donde el patrón de reloj/presupuesto/`after()` se repite.
- **`sat_descarga/` y `peajes/`**: cuatro archivos con `.from('gasto')` propio
  (`peaje_cierre.ts`, `ciclo.ts`, `resolucion.ts`, `bandeja.ts`) que no crucé
  contra el mapeo de `repo.ts:934`, donde 26 columnas se traducen a mano.
- **Ciclos de importación reales**: hice el grafo para huérfanos, no para
  detectar ciclos. `lib/mcp/credencial.ts` → `app/api/v1/_comun.ts` es el único
  que vi de casualidad.
- **`supabase/migrations/` (252 archivos)**: no verifiqué que los `CHECK` de
  dominio y las uniones de TypeScript coincidan más allá de `app_user.rol`,
  `viaje.estatus` y `ticket_soporte.estado`.
