# Arquitectura y mantenibilidad — auditoría 19

**Nota: 4/10** (antes 4). Razón del movimiento: **deuda que cobró factura**.

La c4 puso el 4 porque el folio fiscal tenía cinco normalizadores y uno iba al
revés. Ese caso concreto **está cerrado** (`pendientes.ts:196` ya baja a
minúsculas y su prueba lo dice), y el delta trajo el mejor guardia estructural de
la ronda: `etiquetas_sincronizadas.test.ts:44-67` ya no ancla por rutas
literales, barre **todo `src/`** buscando el patrón — el ejemplo canónico del
rubro (`otro: 'Gasto'` vs `otro: 'Otro'`) tiene por fin un mecanismo, no una
promesa. Pero se arregló **la instancia, no la clase**: hoy hay una **sexta**
normalización del mismo folio y también va a MAYÚSCULAS (`computer_use.ts:334`),
con su prueba en verde certificándola, exactamente como la anterior. Y el delta
—48 archivos nuevos en un día— estrenó un **segundo libro contable del mismo
viaje**: `contabilidad/poliza.ts` asienta base + IVA acreditable mientras
`liquidacion.total_comprobado` está en totales con impuesto, y las dos cifras se
restan una a la otra dentro del mismo cálculo. El ancla del rubro es literal:
*«4 o menos si la misma lógica de dinero vive en más de un archivo»*.

**El riesgo mayor del rubro hoy:** el export de póliza —la promesa insignia de la
landing— no puede cuadrar un asiento en cuanto el periodo trae un solo
comprobante cuyo IVA no es acreditable, que es *el caso que el motor entero
existe para detectar*; y como no se exporta a medias, un ticket de diésel en
efectivo tumba el archivo del mes completo.

---

## Verificación de los abiertos de la c4

| Hallazgo (c4) | Hoy | La evidencia |
|---|---|---|
| **CRÍTICO** — el folio a MAYÚSCULAS en la captura manual | **CERRADO** | `facturacion/pendientes.ts:194-198` es ahora `crudo.trim().toLowerCase()`, con un comentario de 14 líneas (`:177-193`) que nombra ARQ-C4-1, la 0158 y `repo.ts:33`. `pendientes.test.ts:125-126` invirtió la aserción: las dos ortografías de entrada salen en minúsculas. Pero la **clase** sigue abierta — ver ALTO 2. |
| **ALTO** — el numerador del 15% de la RFA 2.9, en SQL y en TS | **REINCIDENTE, sin un solo cambio** | `0112_agregados_rpc.sql:151` sigue siendo `sum(monto) filter (where forma_pago = '01')`; `cuadre/desde_db.ts:93` sigue restando con el mismo criterio viejo a propósito, mientras `engine.ts:130-140` (`medioNoAdmitidoCombustible`) usa la lista cerrada nueva. Sin base donde aplicar migraciones, esto no se puede cerrar desde `src/`; lo dejo anotado y no lo reescribo. |
| **ALTO** — `repo.ts` no es la frontera de datos | **REINCIDENTE, y peor** | 128 archivos / 591 llamadas → **171 archivos / 709 llamadas**. Ver ALTO 3. |
| **MEDIO** — dos `getViajesRegistro`, el vivo y el muerto | **CERRADO** | `rg getViajesRegistro src/` ya solo devuelve `viajes_registro.ts` y sus dos consumidores (`viajes/page.tsx:8`, `inicio-contenido.tsx:31`). La copia de `analytics.ts` con `.range()` desapareció. |
| **MEDIO** — tres paginaciones; los tres Registros no llegan a SQL | **REINCIDENTE, sin cambio** | `paginar-registro.ts:82` sigue con `slice()` en memoria y `operacion.ts:151-161` sigue con `traerTodo` sobre `unidad` y `mantenimiento`. |
| **MEDIO** — `procesarTurno` | **REINCIDENTE, cuarta ronda** | 2,153 → 2,157 → 2,369 → **2,370** (`processor.ts:735-3104`, medido por llaves). Ver MEDIO 5. |
| **MEDIO** — `fiscalListo()` copia el predicado | **REINCIDENTE, y ahora son CUATRO** | Ver MEDIO 2: el delta añadió la cuarta copia. |
| **BAJO** — el sufijo, cinco implementaciones | **REINCIDENTE, sin cambio** | `sidebar-nav.tsx:76` sigue con `: rol === 'superadmin' ? '?vista=demo' : ''`; `sufijo.ts:20-26`, `paginar-campos.ts:10-18`, `page.tsx:36-37`, `tenant-efectivo.ts`. `sufijo.test.ts` sigue probando una de las cinco. |
| **BAJO** — `reengancharPendiente` sin llamador | **REINCIDENTE, sin un solo cambio** | `despacho_wa.ts:238`/`:362` y `asignar_wa.ts:298`/`:359` siguen aceptando y ramificando el flag; las únicas menciones restantes son `despacho_wa.test.ts:206,215`. |
| (c3, heredados) `portalesOperables()`, `cuentaCompartida`, `LibroDelViaje` | **REINCIDENTES, sin cambio** | `adaptadores/registro.ts:194-198` sigue devolviendo `[...PORTALES_CONOCIDOS, ...COMERCIOS_PILOTABLES]`; `avisar.ts:70` sigue llamando `repartir(tickets, sabeOperarlo)` y `:98` `enrutar(t, …)` con 2 de 3 argumentos, así que `enrutar.ts:78` `cuentaCompartida = false` siempre; `viajes/libro.tsx:70` sigue exportado y sin un solo consumidor. |

---

## Hallazgos

### [ALTO] La póliza y el motor llevan DOS contabilidades distintas del mismo viaje: el motor suma totales con IVA y la póliza asienta base + IVA acreditable — un solo diésel en efectivo descuadra el asiento y tumba el export del periodo entero

`src/lib/likida/contabilidad/poliza.ts:98-105`, `:107-117`, `:119-129`, `:131-149`, `:156-166` ·
`src/lib/likida/cuadre/engine.ts:415-418`, `:846`, `:1170`, `:1188`, `:1217` ·
`src/lib/likida/repo.ts:982-987` ·
`supabase/migrations/0178_fiscal_retencion_arco_y_perfiles_erp.sql:215-225` ·
`src/app/api/export/poliza/route.ts:180-202` ·
`src/lib/likida/contabilidad/poliza.test.ts:22-33`

**Los dos libros.** El motor cierra el viaje con esta identidad
(`engine.ts:415-418` y `:846`):

> `total_comprobado = Σ g.monto` (el **total** del comprobante, con IVA, de los
> gastos no duplicados y con `monto > 0`) y `diferencia = anticipo − total_comprobado`.

`repo.ts:982-987` persiste esos tres números tal cual (`p_total_comprobado`,
`p_diferencia`, `p_iva`). El IVA que persiste es `engine.ts:1388`
`ivaAcreditable`, que **solo** acumula lo que pasa por tres filtros:
`xmlVerificado` (`:1192`), fuera de `SIN_ACREDITAMIENTO` (`:1188`) y
`formaPago !== '99'` (`:1217`), y aún así **prorrateado** por
`proporcionDeducible`.

`poliza.ts` asienta con **otra** identidad (`:98-149`):

> `cargos = Σ subtotal_por_concepto + ivaAcreditable + (dif > 0 ? dif : 0)`
> contra `abonos = anticipo + (dif < 0 ? |dif| : 0)`

y los `subtotal` vienen de `0178:224-231`: `sum(gg.sub_total)`, o sea la **base
sin impuestos** del CFDI. Las dos identidades solo coinciden cuando **cada peso
de IVA de cada comprobante es acreditable y ningún comprobante trae descuento**.

**Escenario con valores.** *Transportes del Bajío*, catálogo de cuentas
declarado y completo, perfil ERP CONTPAQi confirmado. Viaje VJ-2026-0031,
anticipo **$5,000**. Un solo comprobante: CFDI de diésel con XML, `SubTotal
$3,000.00`, IVA trasladado `$480.00`, `Total $3,480.00`, **`FormaPago '01'`
(efectivo)** — el caso estrella del producto.

1. Motor: `combustible_efectivo` está en `SIN_ACREDITAMIENTO`
   (`engine.ts:1170`), así que `engine.ts:1188` hace `continue` →
   **`ivaAcreditable = 0`**. `totalComprobado = 3,480` (`:415`).
   `diferencia = 5,000 − 3,480 = 1,520` (`:846`).
2. `poliza_datos_tenant` (0178) devuelve
   `porConcepto = [{diesel, subtotal: 3000, baseConocida: true}]`,
   `ivaAcreditable: 0`, `anticipo: 5000`, `diferencia: 1520`.
3. `polizaDeLiquidacion`: `:98` cargo diesel **3,000**; `:107` no entra
   (`ivaAcreditable > 0` es falso); `:122` abono anticipo **5,000**; `:138`
   cargo por-cobrar **1,520**.
4. `:156-158`: cargos **4,520.00**, abonos **5,000.00** → `|480| > 0.01` →
   `{ ok: false, falta: ['la póliza no cuadra: cargos 4520.00 vs abonos 5000.00…'] }`.
5. `route.ts:186` mete el folio en `bloqueos`, y `:190-202` devuelve **HTTP 409
   `polizas_incompletas` para TODO el periodo**, con el argumento explícito de
   que no se exporta a medias.

El descuadre es exactamente el IVA que el motor se negó a acreditar. La misma
aritmética falla, sin necesidad de efectivo, con: un CFDI con `@Descuento`
(columna añadida por la 0171, que la RPC ignora), un viático de alimentación
sobre el tope (`proporcionDeducible < 1`), un CFDI con `FormaPago '99'`, un
`rfc_receptor` malo, y con cualquier gasto duplicado o de monto ≤ 0 — el motor
los excluye de `total_comprobado` (`:415-418`) y la RPC los suma igual.

**Consecuencia.** Para el contralor: el export que la landing promete
—«el formato que SAP Business One o CONTPAQi ya sabe importar, sin retecleo»,
citado literalmente en `poliza.ts:2-9`— devuelve 409 en cuanto el mes tiene un
comprobante de los que este producto existe para detectar, y le echa la culpa a
un «descuadre» que no puede arreglar desde ninguna pantalla: no es un dato que
falte, es la resta. Para quien mantiene: la identidad contable del viaje está
escrita dos veces, en TypeScript y en SQL, y nadie las casa — `poliza.test.ts`
usa una fixture con `ivaAcreditable: 640` sobre `subtotal 4,000` (el 16% exacto
y entero), que es el único mundo en el que las dos cuadran.

**Causa raíz probable.** El asiento se diseñó contra el CFDI ideal (base + IVA
acreditable) y se cerró contra `liquidacion.diferencia`, que está expresada en
totales con impuesto; falta la cuenta del IVA **no** acreditable, que es lo que
absorbe la diferencia en una contabilidad real.

---

### [ALTO] El folio fiscal tiene un SEXTO normalizador y también va a MAYÚSCULAS, con su prueba en verde certificándolo — y el único escritor vivo de `gasto.cfdi_uuid` que no pasa por `repo.ts` sigue escribiendo lo que le den · REINCIDENTE (clase de ARQ-C4-1)

`src/lib/likida/facturacion/adaptadores/computer_use.ts:332-335` ·
`src/lib/likida/facturacion/adaptadores/computer_use.test.ts:204-208` ·
`src/lib/likida/facturacion/al_vuelo.ts:307`, `:528`, `:554-580` ·
`src/lib/likida/facturacion/adaptadores/playwright_base.ts:440-444` ·
`src/lib/likida/repo.ts:20-35` ·
`supabase/migrations/0158_integridad_fiscal.sql:428-435`

**La sexta copia, palabra por palabra.** `computer_use.ts:332-335`:

```ts
export function extraerUuid(texto: string): string | null {
  const m = texto.match(/[0-9a-f]{8}-…/i);
  return m ? m[0].toUpperCase() : null;
}
```

y su prueba, `computer_use.test.ts:205`, se llama literalmente
**«lo encuentra donde sea y lo normaliza a mayúsculas»** y afirma
`extraerUuid('folio b0800a68-8565-47d9-90e0-cda7803c50e4 ok')` →
`'B0800A68-8565-47D9-90E0-CDA7803C50E4'`. Es la misma forma exacta de
`pendientes.test.ts:105` que la c4 llamó CRÍTICO: una prueba verde que documenta
como correcta la ortografía que la 0158 rechaza
(`check (cfdi_uuid is null or cfdi_uuid = lower(cfdi_uuid))`, aplicado en las
cuatro tablas por el `do $$` de `0158:428-435`).

**Escenario con valores.** `computer_use.ts:307` devuelve
`{ ok: true, cfdiUuid: 'B0800A68-8565-47D9-90E0-CDA7803C50E4' }`. Ese objeto es
el `ResultadoPortal` que `al_vuelo.ts:307` consume sin mirar:
`escribirUuid(admin, tenantId, gastoId, r.cfdiUuid, 1, ahora)` → `al_vuelo.ts:562-564`
→ `update gasto set cfdi_uuid = 'B0800A68-…', cfdi_orden = 1`
→ **violación de `gasto_cfdi_uuid_minuscula`, SQLSTATE 23514**. `al_vuelo.ts:571`
no reconoce el código (solo distingue `llegoTarde` y `uq_gasto_cfdi_uuid`), cae
al `else` de `:575` y `:579` llama `bloquear()` con
«el CFDI B0800A68-… YA SE EMITIÓ en el portal y no se pudo guardar aquí
(*violates check constraint "gasto_cfdi_uuid_minuscula"*). Hay que pegárselo a
mano». El CFDI existe en el SAT y Likida no puede registrar su folio, en cada
intento, para siempre.

**Intento de refutación (parcialmente logrado, y lo digo).** Busqué el llamador:
`rg 'computer_use|ComputerUse' src/` **no devuelve nada fuera del propio archivo
y su prueba** — `AdaptadorComputerUse` no está cableado hoy, así que el escenario
de arriba no se está ejecutando en producción. Lo que **sí** está vivo es la otra
mitad: `al_vuelo.ts:564` es el **único** escritor de `gasto.cfdi_uuid` que no
pasa por `uuidCfdi()` de `repo.ts:34` ni por ninguna normalización (los otros
cinco —`repo.ts:351`, `repo.ts:46`, `facturacion_escritura.ts:162` y `:456`,
`agentes/facturas/page.tsx:69` tras el arreglo— sí), y lo que recibe es
`bruto.trim()` tal como el portal lo pintó (`playwright_base.ts:443`, vía
`AdaptadorCapufe` en `capufe.ts:726,751`) o lo que devuelva el adaptador que
alguien conecte mañana. `repo.ts:20-31` declara desde hace dos rondas que la
normalización es obligatoria en la escritura, y **no hay una sola prueba que
barra «quién escribe `cfdi_uuid`»** — el patrón que sí funciona en este repo
(`formato.test.ts:244`, `bitacora_escritura.test.ts:24`,
`etiquetas_sincronizadas.test.ts:44`) no se aplicó al invariante que ya costó un
CRÍTICO.

**Consecuencia.** Para quien mantiene: el arreglo de la c4 curó el archivo que
el auditor abrió y dejó la clase intacta, con una copia nueva que va al revés
esperando un `import` de una línea. Para el contralor, el día que ese adaptador
se conecte: el agente que emite sus CFDI los emite de verdad y no puede guardar
ni uno.

**Causa raíz probable.** El invariante «una sola ortografía» vive en un
comentario y en un CHECK de Postgres; entre los dos no hay nada que barra `src/`.

---

### [ALTO] `repo.ts` sigue sin ser la frontera de datos, y el hueco creció con el delta: 171 archivos de producción consultan Supabase directo (709 llamadas) contra una allowlist de 16 que no se movió · REINCIDENTE (c4 ALTO 3)

`src/lib/likida/repo.ts` (42 de las 709) ·
`src/lib/likida/acotada_guardiana.test.ts:14-52` ·
`src/lib/likida/contabilidad/catalogo.ts:69` · `src/lib/likida/conectores/sincronizar_gps.ts:108`, `:145`, `:157`, `:176`

**El conteo, hecho hoy y a mano.** Archivos de producción (`.ts`/`.tsx` sin
`.test.`/`.fixture.`/`.pruebas.`) con al menos un `.from(`/`.rpc(`, descontando
líneas de comentario: **171 archivos, 709 llamadas**. `repo.ts` tiene **42**
(5.9%). La c4 midió 128 y 591: **+43 archivos y +118 llamadas en un solo delta**,
que es casi exactamente la superficie nueva (48 archivos).

**El guardia no se movió.** `acotada_guardiana.test.ts:14-52` sigue siendo una
**lista literal de 16 rutas**, la misma de la ronda anterior. Los tres módulos
nuevos escriben y leen la base —`contabilidad/catalogo.ts:69`,
`conectores/sincronizar_gps.ts:108/145/157/176`, `conectores/credenciales.ts`,
`perfil/entrevista-aplicar.ts` vía `repo`/`administracion`/`operacion`— y
**ninguno entró a la lista**. Que hoy usen `acotada()` correctamente es mérito de
quien los escribió, no del guardia: la suite queda igual de verde si mañana
alguien añade una consulta sin techo en cualquiera de ellos.

**Qué se desincroniza, y cómo se ve.** Es el mecanismo exacto de los dos ALTOS
de arriba: `al_vuelo.ts:564` escribe `gasto.cfdi_uuid` sin pasar por
`uuidCfdi()`, y `route.ts:149` lee la póliza por una RPC que reimplementa la
suma del motor — ninguno de los dos está en ninguna lista, y no existe una
prueba que barra `src/` preguntando «quién escribe esta columna» ni «quién suma
este total». El contraste está en el mismo árbol: `etiquetas_sincronizadas.test.ts:44-67`
—escrita **en este delta**— barre `src/` entero y cierra su clase de fallo. El
patrón que funciona existe y está a la vista; el guardia de datos sigue con
allowlist.

**Consecuencia.** El equipo que añade una pantalla no tiene forma de saber qué
invariantes de escritura le aplican: la respuesta vive en comentarios de módulos
que su archivo no importa. Cada frontera que se declara nace cubriendo solo los
archivos que alguien se acordó de listar, y el delta más grande de la historia
del repo la ensanchó un 33% sin tocar la lista.

---

### [MEDIO] `/api/export/poliza` no tiene un solo llamador en `src/`: el módulo con tres correcciones en tres días no está cableado a ninguna pantalla, y dos pantallas ya lo dan por existente

`src/app/api/export/poliza/route.ts` (ruta) ·
`src/lib/likida/ajustes_operativos.ts:60-72` ·
`src/app/dashboard/configuracion/forma.tsx:171-178` ·
`src/app/dashboard/agentes/proveedores/vista.tsx:110`, `:296` (el contraste)

**El conteo.** `rg 'export/poliza' src/` devuelve **la ruta y un comentario**
(`ajustes_operativos.ts:64`). Ni un `href`, ni un `fetch`, ni un formulario. El
único export a CONTPAQi/SAP con botón en el panel es **otro**:
`/api/export/facturas-proveedor`, enlazado desde
`agentes/proveedores/vista.tsx:296` (`linkExport(sufijo, 'sap_b1'|'contpaqi')`),
que produce una hoja de columnas —no una póliza— y cuyo propio módulo lo dice
por escrito (`proveedores.ts:400-406`: *«NO es el TXT de pólizas de CONTPAQi»*).

**Escenario con valores.** El contralor abre `/dashboard/configuracion`. La
pantalla le pide capturar cuatro cuentas de balance con este texto literal
(`forma.tsx:176`): *«Para exportar la póliza a tu ERP hacen falta, además de tus
conceptos de gasto, estas…»*. Las captura. Después busca dónde exportar la
póliza: en Configuración hay un selector de formato cuyo `contpaqi_txt` sigue
marcado `implementado: false` (`ajustes_operativos.ts:60`), en el Agente de
Proveedores hay un botón que baja **otra cosa**, y en las ~31 páginas del panel
no existe ningún control que llame a `/api/export/poliza`. La única forma de
obtener el archivo es escribir la URL a mano con `?desde=&hasta=&formato=`.

**Consecuencia.** Para el contralor: una pantalla le pidió trabajo
(capturar el catálogo de cuentas de su contador) para una salida a la que no
puede llegar. Para quien mantiene: un módulo de 514 líneas con tres correcciones
en tres días (`f1458d7` → `62befa0` → `df6b1be`) y una migración propia (0175,
reemplazada por 0178) que **ninguna prueba de integración ejerce de punta a
punta** — por eso el descuadre del ALTO 1 pudo entrar y salir de tres revisiones
sin que nadie lo viera: no hay nadie que lo llame.

**Causa raíz probable.** El módulo se construyó de la base hacia arriba (RPC →
armador → formatos → ruta) y la última capa —el control en la pantalla— quedó
fuera de las tres pasadas.

---

### [MEDIO] El predicado «los cinco datos fiscales» tiene CUATRO copias y `estanCompletos()` existe exportado sin que nadie lo importe — el delta añadió la cuarta, en el chat de onboarding · REINCIDENTE (c2, c3, c4)

`src/lib/saas/fiscal.ts:60-62` (el canónico, sin consumidores) ·
`src/app/admin/flotas/page.tsx:35-38` · `src/lib/likida/administracion.ts:164-166` ·
`src/lib/likida/perfil/entrevista-aplicar.ts:138-144` (**nueva**) ·
`src/lib/likida/facturacion/flota_fiscal.ts:63-77`

**Los cuatro lados.** `saas/fiscal.ts:60` exporta
`estanCompletos(d)` = `rfc && razonSocial && regimenFiscal && codigoPostal && usoCfdi`,
con un comentario de once líneas (`:48-55`) explicando por qué el correo queda
fuera. `rg estanCompletos src/` devuelve **solo su definición**: las tres
pantallas que hacen esa misma pregunta la reescriben.

1. `admin/flotas/page.tsx:36` — `['rfc','razonSocial','regimenFiscal','codigoPostalFiscal','usoCfdi'].every(...)`, con el comentario «*Es la condición exacta de `getFiscalDeFlota`*», que sigue siendo falso: `flota_fiscal.ts:71-77` devuelve `flota: null` sin `correoDeFacturacion`.
2. `administracion.ts:164-166` — el mismo `&&` de cinco campos.
3. **`perfil/entrevista-aplicar.ts:138` (nueva en este delta)** — `if (rfc && razon && regimen && cp && clavesOk.has(regimen))`, cuatro campos más una validación de régimen, porque `usoCfdi` no se pregunta: se **cablea** a `'G03'` en `:142`.

**Escenario con valores.** Una flota nueva termina el chat de onboarding
declarando RFC, razón social, régimen `601` y CP `37000`, sin correo de
facturación en `app_user`. `entrevista-aplicar.ts:140` guarda y `:144` le
contesta: **«Los cinco datos del receptor CFDI 4.0 ya están en la flota (uso
G03)»** — cinco, cuando escribió cuatro y decidió el quinto por su cuenta.
Semanas después el cron de facturación llama `getFiscalDeFlota`, que devuelve
`falta: ['no hay a dónde mandar el CFDI…']` (`flota_fiscal.ts:71-74`) y responde
200 sin facturar nada: es el hueco que `administracion.ts:128-131` dice haber
cerrado —*«el hueco aparecía semanas después, como un cron que no hacía nada,
sin un error que mirar»*— reabierto por la copia número cuatro.

**Consecuencia.** «¿Está lista esta flota para facturar?» tiene cuatro
respuestas en cuatro archivos, ninguna importa la exportada, y la nueva además
inventa el `usoCfdi` y anuncia cinco datos donde hubo cuatro.

**Causa raíz probable.** Cada pantalla nueva que necesita la pregunta la
reescribe porque el predicado canónico no está en el módulo donde se busca
(`saas/fiscal.ts`, no `facturacion/`), y nada falla cuando se le reescribe al
lado.

---

### [MEDIO] Tres registros distintos le contestan al cliente «¿Likida exporta a CONTPAQi?», y el arreglo de `df6b1be` corrigió dos: `erp.ts` sigue declarando `no_construido` y «siguen sin escribirse»

`src/lib/likida/conectores/erp.ts:38-43`, `:269-279` ·
`src/lib/likida/integraciones.ts:98-105` ·
`src/lib/likida/ajustes_operativos.ts:60-72` ·
`src/lib/likida/contabilidad/formatos.ts:47-92`

**Los tres lados, y lo que dice cada uno hoy.**

| Archivo | Qué afirma | ¿Actualizado por `df6b1be`? |
|---|---|---|
| `ajustes_operativos.ts:62-72` | `implementado: false` para el selector, **más** una nota nueva de 8 líneas: «*la PÓLIZA contable sí sale ya en formato CONTPAQi desde el export de póliza*» | **sí** |
| `integraciones.ts:98-105` | `estado: 'por_piloto'`, «*El export solo genera CONTPAQi con el tipo, separador y encabezado confirmados por tu contador*» | **sí** |
| `conectores/erp.ts:274` | `formaDeConectar: 'no_construido'`, `comoConectaHoy: 'Por ahora, el CSV genérico'`, con el comentario `:272-276` justificándose por «*coherencia con `ajustes_operativos.ts`, donde `contpaqi_txt` está marcado `implementado: false`*» | **no** |

Y el encabezado del módulo, `erp.ts:41-43`, sigue afirmando en presente:
*«los layouts de CONTPAQi y Aspel **siguen sin escribirse**: se harán contra el
archivo de ejemplo de la primera flota que los pida»* — mientras
`contabilidad/formatos.ts:47-92` ya escribe `ENCABEZADO_CONTPAQI` y
`filasContpaqi()`, y `perfiles.ts` + `erp_export_perfil` (0178:180-187) son
precisamente el mecanismo que exige el archivo de ejemplo del cliente. La
decisión que `erp.ts` describe **ya se tomó y se implementó**; el archivo la
sigue narrando como pendiente y se apoya en un archivo que dice lo contrario.

**Escenario con valores.** El agente (o la persona) que mañana tenga que
contestar «¿cuál es el estado de CONTPAQi?» abre `conectores/erp.ts` —el
registro de conectores, el sitio con nombre de fuente de verdad— y lee
`no_construido` y «siguen sin escribirse». Si en cambio abre `integraciones.ts`
lee `por_piloto` y «el export solo genera CONTPAQi con el perfil confirmado».
Las dos frases describen el mismo día del mismo producto.

**Consecuencia.** Hoy el daño está contenido: verifiqué que `Conector.comoConectaHoy`
y `formaDeConectar` **no se pintan en ninguna pantalla** (`rg comoConectaHoy`
solo los renderiza desde `integraciones.ts`, en `dashboard/integraciones/vista.tsx:75`;
`conexiones/seccion-credenciales.tsx:37` filtra por `credenciales.length > 0` y
CONTPAQI tiene `[]`). O sea: es documentación interna que miente, no un rótulo
al cliente — pero es la que un agente va a leer y citar. De regalo, la fecha del
layout de CONTPAQi está implementada dos veces: `proveedores.ts:427`
(`fechaDdMmAaaa`) y `contabilidad/formatos.ts:29` (`fechaContpaqi`), mismo
contrato de archivo, dos funciones.

**Causa raíz probable.** El estado de una integración se declara en tres
registros paralelos y el arreglo del rótulo persiguió los dos que se renderizan.

---

### [MEDIO] `CLAUDE.md` —el archivo que todo agente lee primero— tiene dos trampas que ya no son ciertas, y una de ellas manda escribir un rol que la base rechaza

`CLAUDE.md` (sección «Trampas ya pisadas») ·
`supabase/migrations/0086_retirar_rol_operador.sql:91-101` ·
`supabase/migrations/0105_zona_vendedores.sql:47-52` ·
`src/lib/auth/provisionar.ts:20` ·
`src/lib/likida/conectores/sincronizar_gps.ts:141-150`

**Lo que ya no es cierto, verificado uno por uno.**

1. **`app_user.rol`.** `CLAUDE.md` dice: *«`app_user.rol`: superadmin,
   flota_admin, contador, **operador**, encargado»*. El CHECK vivo, tras
   `0086_retirar_rol_operador.sql` y `0105_zona_vendedores.sql:51-52`, es
   `check (rol in ('superadmin','flota_admin','contador','encargado','vendedor'))`.
   La lista de `CLAUDE.md` está mal **en las dos direcciones**: incluye
   `operador`, que la base retiró a propósito, y omite `vendedor`, que tiene su
   propia zona en `/admin` desde la 0105. El tipo del código sí está bien
   (`provisionar.ts:20` `RolAppUser`), así que la única fuente equivocada es la
   que el agente lee antes de abrir el código.
   **Escenario:** un agente escribe un alta de usuario siguiendo `CLAUDE.md`
   con `rol: 'operador'` → `insert into app_user … 'operador'` → violación de
   `app_user_rol_dominio`, **SQLSTATE 23514**, en runtime, no en `tsc`.
2. **`posicion` sin escritor.** `CLAUDE.md` la lista entre las tablas que
   «siguen SIN escritor». Ya tiene dos: `sincronizar_gps.ts:145` (upsert del
   poller de Samsara) y `processor.ts:132` (el pin de WhatsApp). El propio MAPA
   de esta ronda lo advierte; la advertencia no llegó al archivo.

**Lo que sí verifiqué que sigue siendo cierto** (para que la próxima ronda no lo
repita): `gasto.ocr_raw` sigue muerta (solo `0001_init.sql:63` la declara,
nadie la escribe); `wa_mensaje_procesado` sigue sin `tenant_id`
(`0002_idempotency.sql:5-8`, dos columnas); `geocerca`, `terminal`,
`mantenimiento`, `cotizacion`, `ticket_mensaje`, `portal_credencial`,
`invitacion`, `campania` y `envio_mensaje` siguen **sin un solo escritor** en
`src/` (`mantenimiento` solo se lee, `operacion.ts:158`).

**Consecuencia.** `CLAUDE.md` se escribió con una advertencia explícita sobre
esta misma clase de error —*«el historial de esta línea es la advertencia: hasta
el 4-ago decía "no existen" y le prohibía a cada agente construir sobre tablas ya
aplicadas»*— y volvió a pasar en el mismo documento, en el mismo delta que
estrenó el escritor.

---

### [MEDIO] `procesarTurno`: 2,370 líneas en una función, cuarta ronda seguida sin partirse · REINCIDENTE (c2, c3, c4)

`src/lib/likida/processor.ts:735-3104`

Medida por profundidad de llaves desde `async function procesarTurno` (`:735`)
hasta su cierre (`:3104`): **2,370 líneas**, en un archivo de 3,105 con 50
imports. La serie es 2,153 → 2,157 → 2,369 → **2,370**: cuatro rondas, ninguna a
la baja. Sigue saltándose `repo.ts` en `:128` (`.from('viaje')`), `:132`
(`.from('posicion')`) y `:269` (`.from('operador')`).

**Qué se desincroniza, y cómo se ve.** El caso ya está demostrado y sigue vivo:
`despacho_wa.ts:228-236` documenta `reengancharPendiente` como el desempate del
chofer en ruta, y sus **dos únicos** llamadores de producción viven en `:563` y
`:579` de esta función, a 1,800 líneas de su inicio, pasando tres argumentos. Es
el cuarto informe que lo dice.

**Consecuencia.** Es el archivo más caro de cambiar del repo, está en el camino
del dinero, y cuatro auditorías seguidas lo han medido creciendo.

**Causa raíz probable.** El pipeline entrante nunca se partió por fase; cada
funcionalidad nueva encuentra sitio dentro del `if` que le queda cerca.

---

### [MEDIO] El union `ConceptoGasto` tiene tres espejos escritos a mano sin nada que los case, y el nuevo descarta en silencio lo que el contador declaró

`src/types/likida.ts:20-25` (la verdad) ·
`src/lib/likida/contabilidad/catalogo.ts:27-30`, `:95-113` (**nuevo**) ·
`src/app/dashboard/politicas/page.tsx:20` · `src/lib/likida/intake/ocr.ts:27`

**Los espejos.** `ConceptoGasto` son nueve valores (`types/likida.ts:20-25`).
Se reescriben a mano en: `contabilidad/catalogo.ts:27` (`CONCEPTOS: readonly
ConceptoGasto[]`, con el comentario «*Espeja `ConceptoGasto`*»),
`politicas/page.tsx:20` (`as const`), e `intake/ocr.ts:27` (ocho, sin
`viaticos`, **a propósito** y documentado en `:132`). El tipado no ayuda:
`readonly ConceptoGasto[]` verifica **pertenencia**, no exhaustividad — una
lista de tres valores compila igual. `etiquetas_sincronizadas.test.ts:43` sí
barre `src/`, pero su regex es `const (CONCEPTO(?:_LABEL)?)\s*…=\s*\{` — caza
mapas de **etiquetas** con esos dos nombres exactos, no listas de claves ni
`CONCEPTOS`.

**Escenario con valores.** Alguien añade `'llantas'` a `ConceptoGasto` (el caso
que ya ocurrió una vez: `viaticos` partido en tres, contado en
`dashboard/[id]/page.tsx:23-24`). `npx tsc --noEmit` queda **limpio**:
`catalogo.ts:27` sigue siendo un `ConceptoGasto[]` válido con nueve de diez. El
contador de *Transportes del Bajío* escribe en Configuración la línea
`llantas=5010-005`. `armarCatalogo` (`catalogo.ts:102-105`) itera **su** lista de
nueve, no encuentra `llantas`, y la descarta — con la justificación escrita en
`:93` de que las llaves desconocidas son *notas del contador*. Al exportar,
`polizaDeLiquidacion:95` responde `falta: ['cuenta de gasto para «llantas»']` y
`route.ts:190` devuelve 409 para el periodo entero. El producto le dice al
contador que no declaró una cuenta que sí declaró, y su línea desapareció sin
un aviso.

**Consecuencia.** El «ignorar en silencio» que protege las notas del contador es
también el que traga un concepto real cuando el espejo se queda corto, y la
única señal es un 409 que culpa al usuario.

**Causa raíz probable.** La lista de conceptos no se deriva del tipo (que no
puede iterarse en runtime) y no hay guardia que compare los espejos, como sí lo
hay para las etiquetas.

---

### [BAJO] El contrato del sufijo sigue con cinco implementaciones y una prueba · REINCIDENTE (c3 ALTO 1, c4 BAJO 1)

`src/app/dashboard/sufijo.ts:20-26` (canónica) · `src/app/dashboard/paginar-campos.ts:10-18` ·
`src/app/dashboard/sidebar-nav.tsx:76` · `src/app/dashboard/page.tsx:36-37` ·
`src/lib/auth/tenant-efectivo.ts` · `src/app/dashboard/sufijo.test.ts`

Comprobado hoy, sin cambios respecto a la c4: `sidebar-nav.tsx:76` sigue siendo
`: rol === 'superadmin' ? '?vista=demo' : ''`, y `sufijo.test.ts` sigue probando
solo `sufijoTenant`. No traigo evidencia nueva; lo dejo anotado para que la
cuenta de rondas no se pierda.

---

### [BAJO] Código que la suite prueba y la aplicación no puede alcanzar · REINCIDENTE (c3/c4)

`src/lib/likida/despacho_wa.ts:238`, `:362` · `src/lib/likida/asignar_wa.ts:298`, `:359` ·
`src/lib/likida/facturacion/avisar.ts:70`, `:98` · `src/lib/likida/facturacion/enrutar.ts:78` ·
`src/app/dashboard/viajes/libro.tsx:70` ·
`src/lib/likida/facturacion/adaptadores/computer_use.ts` (**nuevo en la lista**)

Cuatro casos verificados uno por uno hoy, ninguno con cambios:
`reengancharPendiente` sigue ramificando sin que nadie lo pase;
`avisar.ts:70` y `:98` siguen llamando con 2 de 3 argumentos, dejando
`enrutar.ts:78` `cuentaCompartida = false` siempre; `LibroDelViaje` sigue
exportado sin un consumidor. Se suma el quinto:
`AdaptadorComputerUse` (307 líneas más su prueba) **no lo importa nadie** — y es
el que aloja el sexto normalizador del ALTO 2. La suite verde afirma
comportamiento que la aplicación no ejecuta, y eso es precisamente lo que hizo
que la mayúscula sobreviviera a la corrección de la c4.

---

## Lo que revisé y está bien

- **El guardia de etiquetas por fin cierra su clase, y lo verifiqué.**
  `etiquetas_sincronizadas.test.ts:33-67` dejó de anclar por rutas literales y
  barre `src/` entero con `PATRON_MAPA`; su encabezado (`:34-42`) explica que
  `gasto-semanal-chart.tsx` nació el 16-ago por fuera del radar anterior. Hoy los
  tres mapas (`engine.ts:1416`, `dashboard/[id]/page.tsx:25-29`,
  `gasto-semanal-chart.tsx:13-17`) coinciden clave por clave, `otro: 'Otro'`
  incluido. Es el ejemplo canónico del rubro, resuelto con el mecanismo correcto.
- **`contabilidad/catalogo.ts:1-20` es la decisión difícil escrita.** Se niega a
  usar `getConfig()` porque fusionaría `DEMO_CONFIG.catalogoCuentas`
  (`config.ts:112-115`, cuentas `600-00x` marcadas demo) y las asentaría en el
  ERP de la flota. Verifiqué que lee el override crudo (`:70-77`) y que
  `catalogo.test.ts` lo cubre: 68 pruebas de `contabilidad/` + `sincronizar_gps` +
  `etiquetas` + `acotada_guardiana` corren **verdes**.
- **Las dos rutas de webhook de Cal.com NO son dos copias.**
  `api/webhooks/calcom/route.ts` es un `export { POST } from '../../webhook/calcom/route'`
  de 8 líneas, con `runtime`/`dynamic` redeclarados literalmente y el porqué
  escrito (`:5-6`: Next no reconoce la config re-exportada). Toda la lógica —la
  verificación de firma, el mapa `ESTADO_POR_EVENTO`, la clave de idempotencia
  `calcom:${tipo}:${externo}`— vive **una sola vez** en el singular
  (`webhook/calcom/route.ts:11-16`, `:62`). Una entrega duplicada por las dos
  rutas colapsa en `registrarEventoComercial`. Fui a buscar el hallazgo que el
  MAPA sugería y no está: es una redirección, no una duplicación.
- **`conectores/posiciones.ts` y `sincronizar_gps.ts` son el mejor módulo nuevo
  del delta.** El lector es puro y recibe `Http` inyectado (`posiciones.ts:65-68`);
  `LECTORES_POSICION` (`:116-121`) es el registro único y `sincronizarGpsTodas`
  filtra por `Object.keys(LECTORES_POSICION)` en vez de un literal
  (`sincronizar_gps.ts:181`, con el porqué en `:179-180`); el `.eq('tenant_id')`
  del cruce device→unidad está justificado contra `supabaseAdmin` saltándose RLS
  (`:104-106`); y la lectura que define el universo de la corrida **lanza** en vez
  de devolver `[]` (`:184-188`), que es la regla de «fallar cerrado» aplicada
  donde importa.
- **`perfil/entrevista.ts` (998 líneas) es puro.** Su único import de dominio es
  `CONECTORES`; cero `supabase`, `fetch(`, `process.env`. La partición
  `entrevista.ts` (decidir) / `entrevista-aplicar.ts` (escribir) /
  `entrevista-agente.ts` (explicar con LLM) está bien trazada, y el LLM solo
  puede **explicar**: `entrevista-agente.ts:83-89` devuelve
  `guardado: false` en esa rama y nunca toca la base.
- **El motor de dinero sigue puro.** Cero `supabase|createClient|fetch(|process.env`
  en los archivos no-test de `cuadre/` y `liquidacion/`, con la única excepción
  esperada y documentada, `cuadre/desde_db.ts`, que es el adaptador.
- **La 0178 no dejó una estimación disfrazada.** `0178:190-194` explica por qué
  reemplazó el `coalesce(sub_total, monto)` de la 0175 —*«eso mezclaba IVA dentro
  de la cuenta de gasto»*— y ahora emite `subtotal: null` + `baseConocida: false`
  en vez de sustituir la base por el total. Es la regla del producto aplicada en
  SQL. (Lo que no cuadra es el otro lado de la resta: ALTO 1.)
- **`npx tsc --noEmit -p .` limpio. `npm run lint`: 0 errores, 157 warnings**
  (todos `security/detect-non-literal-fs-filename` en pruebas y un
  `no-unused-vars` en `worker/llaves.test.ts:9`).

---

## Lo que NO alcancé a revisar

- **`npm test` completo.** Corrí el typecheck, el linter y 68 pruebas dirigidas
  (`contabilidad/*`, `sincronizar_gps`, `etiquetas_sincronizadas`,
  `acotada_guardiana`). No puedo afirmar el estado de las ~2,900.
- **`conectores/erp.ts` (538 líneas) y `gps.ts` (524) por dentro.** Solo abrí el
  encabezado y el bloque de CONTPAQi/Aspel; no verifiqué los otros diez
  conectores contra sus `fuente.queConfirma`.
- **`perfil/preguntas.ts` (356) y el catálogo de 998 líneas de `entrevista.ts`
  campo por campo.** Confirmé que el módulo es puro y que la frontera con el LLM
  está bien puesta; no comparé el `CATALOGO` de preguntas contra
  `DatosOnboarding` buscando campos huérfanos en cualquiera de los dos sentidos.
- **`wa_outbox.ts` y el cron `wa-outbox`.** Superficie nueva del P0 de #44 (leases
  + reservas + outbox, tres relojes); no la abrí — es el terreno del rubro
  agéntico y del de backend, y no quise opinar sin leerla.
- **Si `guardadas` del cron de GPS dice la verdad.** `sincronizar_gps.ts:150`
  asigna `base.guardadas = filas.length` **después** de un upsert con
  `ignoreDuplicates: true`, así que cuenta lo enviado, no lo insertado; una flota
  parada reportaría el mismo número cada corrida. Lo dejo señalado sin escenario
  completo: es cifra de operación, no de arquitectura, y el rubro de operabilidad
  tiene mejor contexto para pesarlo.
- **Las 43 rutas de API una por una.** Abrí `export/poliza`,
  `export/facturas-proveedor`, `webhook(s)/calcom` y `cron/gps`. No sé cuántas de
  las demás escriben columnas con invariante declarado sin pasar por `repo.ts`.
- **El barrido de columnas que existen en la base y no en el tipo del dominio**
  (el patrón del `cfdi_orden`): sigue sin hacerse, ahora con 184 migraciones.
