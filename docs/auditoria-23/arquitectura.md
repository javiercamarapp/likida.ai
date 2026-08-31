# Arquitectura y mantenibilidad — auditoría 23

**Nota: 5/10** (antes 6). Razón del movimiento: **deuda que cobró factura**. Los
tres pendientes que la 22 dejó por escrito siguen los tres vivos y **dos de ellos
ya produjeron un defecto medible hoy**: (a) ARQ-1 se cerró agregando el miembro
que faltaba a una lista y no derivando la regla, así que la **quinta** ocurrencia
del mismo hueco está viva y la reproduje corriendo el motor; (b) ARQ-2 se cerró
sólo del lado del PRODUCTOR (`faq.ts` ya anota `null`) y no del CONSUMIDOR
(`runner.ts` sigue sin preguntar), así que el techo de gasto de `atencion_faq`
sigue sin cortar nunca — el mismo resultado que el hallazgo describía. Y
`procesarTurno` **creció** de 2,874 a 2,913 líneas.

**El riesgo mayor del rubro, hoy:** el destino fiscal y el ESTATUS de una
liquidación los deciden **cinco listas de `TipoDiferencia` escritas a mano**
sobre una unión de 43 valores (8 · 8 · 17 · 19 · 35); TypeScript verifica
pertenencia y nunca cobertura, y la 22 pasó de cuatro listas a cinco al partir
`SIN_ACREDITAMIENTO` en dos. El hueco número cinco está abierto y medido abajo.

---

## Hallazgos

### [ALTO] Una liquidación con **$0 deducible y el 100% «por confirmar»** sale rotulada «Cuadrada» en verde: `rfc_receptor_no_verificable` está en POR_CONFIRMAR y falta en REVISAR (REINCIDENTE — es la 5ª vez que se cae por el mismo hueco)

`src/lib/likida/cuadre/engine.ts:252` (`POR_CONFIRMAR`, lo incluye) ·
`src/lib/likida/cuadre/engine.ts:1568` (`REVISAR`, NO lo incluye) ·
`src/lib/likida/cuadre/engine.ts:1569-1571` (`hayRevisar` → `estatus`) ·
`src/lib/likida/config.ts:92` (`DEMO_CONFIG.empresa.rfc = 'XAXX010101000'`) ·
`src/app/dashboard/estatus.ts:18` (`cuadrada: { label: 'Cuadrada', color: 'var(--color-ok)' }`)

**Escenario (CORRIDO, no inferido).** Cargué `cuadrarViaje` con jiti y el fixture
de la propia prueba del repo (`cuadre/rfc_no_verificable.test.ts:21-26`), con el
anticipo igualado al comprobante para que la diferencia no dispare `hayDif`:

```
entra: anticipo 11,600 · 1 CFDI timbrado de $11,600 (IVA 1,600, xmlVerificado)
       receptor ODM950324V2A (Office Depot, NO es la flota)
       empresaRfc 'XAXX010101000'  ← el genérico: la flota aún no capturó el suyo

sale:  estatus        : "cuadrada"      ← entra esto → sale esto mal
       totalComprobado: 11600
       totalDeducible : 0
       totalPorConfirmar: 11600
       ivaAcreditable : 0
       difs           : ["rfc_receptor_no_verificable"]
```

Idéntico con `'TIN010101AAA'` (el RFC mal formado). La misma hoja dice
«**Cuadrada**» en `--color-ok` arriba y «Deducible para ISR: —, Por confirmar:
$11,600.00» abajo (`liquidacion/deducibilidad.ts:74-81`).

La causa es exactamente la que la 22 documentó y no cerró. Medido hoy sobre la
unión de 43 valores:

```
NO_DEDUCIBLE_ISR ∪ POR_CONFIRMAR  →  falta en REVISAR:           ['rfc_receptor_no_verificable']
NO_DEDUCIBLE_ISR ∪ POR_CONFIRMAR  →  falta en SIN_IVA_ACREDITABLE:['ticket_monedero']  ← declarado y justificado (engine.ts:1304-1307)
```

Es decir: de los dos huecos que quedan entre las cinco listas, uno está
explicado por escrito y el otro no. `REVISAR` sí documenta sus DOS exclusiones
deliberadas (`ieps_no_desglosado` y `permiso_cre_no_verificable`,
`engine.ts:1553-1567`); `rfc_receptor_no_verificable` no aparece en ese
comentario ni en ningún otro. El encabezado de la propia prueba que lo cubre
dice literalmente «El estado correcto es el tercero — no se puede confirmar NI
descartar → **a revisión**» (`rfc_no_verificable.test.ts:18-19`) y ninguno de sus
9 `it` afirma `estatus`.

**Intento de refutación.** Sí hay un guardarraíl parcial: `cierre_aviso.ts:132`
rutea este tipo como `'decision'`, así que el encargado recibe un aviso por
WhatsApp. Y `dashboard/[id]/vista.tsx:179,208` pinta el RENGLÓN como «Por
confirmar» porque importa `POR_CONFIRMAR` del motor. Lo que queda mal es el
ESTATUS de la liquidación —el badge y el filtro por el que el contralor separa
«cuadradas» de «por revisar»—, que es la afirmación más resumida que el producto
hace sobre una liquidación.

**Consecuencia.** El contralor filtra por «Cuadrada» y se lleva a su papel de
trabajo una liquidación con deducción cero. Y no es un caso raro: `XAXX010101000`
es el valor que `getConfig()` fusiona desde `DEMO_CONFIG` para toda flota que
todavía no capturó su RFC — el día uno de un cliente, justo después de la demo.

**Causa raíz probable:** ARQ-1 se cerró añadiendo `renglones_ajenos` a una lista
(más 20 líneas de prosa) en vez de derivar «tercer estado ⇒ ni deducible, ni
acreditable, ni cuadrada» de una sola definición; no existe ninguna prueba de
contención entre las cinco listas, ni exportadas ni locales.
**(REINCIDENTE — cuarta reaparición del patrón: `cfdi_pendiente`,
`gasto_otro_ejercicio`, `cfdi_efos_indeterminado`/`renglones_ajenos`, y ésta.)**

---

### [ALTO] ARQ-2 se cerró a la mitad: `faq.ts` ya anota `null`, pero el runner de `atencion_faq` sigue mirando **sólo** la suma medida, así que el techo de $1.00/día sigue sin cortar nunca (REINCIDENTE)

`src/lib/likida/agentes/faq.ts:434-439` (el arreglo: `if (r.noMedido) costoUsd = null`) ·
`src/lib/likida/agentes/exito.ts:62-72` (el tipo ya es `number | null`) ·
`src/lib/likida/agentes/runner.ts:707-717` (**el consumidor: sólo `gastoDelDiaUsd`**) ·
`src/lib/likida/agentes/runner.ts:758` (la compuerta `corridasSinCostoMedidoHoy`, usada **sólo** por `contenido_fiscal`) ·
`src/lib/likida/agentes/runner.ts:318-330` (`gastoDelDiaUsd` filtra `.not('costo_usd','is',null)`)

**Escenario.** OpenRouter contesta sin bloque `usage` (rama real y prevista,
`openrouter.ts:401-406`). Con `atencion_faq`:

1. `faq.ts:434` pone `costoUsd = null` — pegajoso, correcto.
2. `exito.ts` lo propaga y `agente_corrida.costo_usd` queda **NULL**.
3. `runner.ts:708` llama `gastoDelDiaUsd('atencion_faq')`, que **excluye los
   NULL por diseño** (`.not('costo_usd','is',null)`, `runner.ts:325`).
4. `gastado` = **$0.00** < `presupuesto_dia_usd` = **$1.00**
   (`0218_agentes_exito_cliente.sql:117`) → despacha otra vuelta.

Con valores: el cron corre `0 */4 * * *` (`vercel.json:14-15`) = **6 vueltas**;
cada vuelta redacta hasta `TOPE_BORRADORES_FAQ = 5` borradores (`faq.ts:63,330`)
con `maxTokens: 600` sobre un prompt con corpus de normas. **30 llamadas al
modelo en un día con el techo leyendo $0.00.** Antes del arreglo la suma valía
$0.00 porque se le sumaban ceros; después del arreglo vale $0.00 porque los NULL
no se suman. **El síntoma es idéntico.**

Lo que faltó son las 4 líneas que `contenido_fiscal` sí tiene
(`runner.ts:758-762`: `const sinMedir = await corridasSinCostoMedidoHoy(a.id);
if (sinMedir > 0) { … continue; }`). El propio docstring de la función lo delata
sin haber sido actualizado: «hoy, el único que la consulta es `contenido_fiscal`
(el único de los diez de crecimiento que anota NULL)» (`runner.ts:346-347`) —
desde `ccb683c` ya NO es el único que anota NULL.

**Intento de refutación.** Busqué si el bloque de `AGENTES_EXITO_CLIENTE`
heredaba la compuerta por otro camino: `grep corridasSinCostoMedidoHoy` devuelve
**una sola llamada de producción en todo `src/`** (`runner.ts:758`), dentro del
`if (a.id === 'contenido_fiscal')`. No la hereda.

**Consecuencia.** Javier paga estas corridas y el único freno de dinero del
agente no existe cuando el proveedor omite `usage`. Además `sdr.ts:171`
(`return r.cost;`), `investigador.ts:366` y `redactor.ts:381` siguen ignorando
`noMedido` por completo, y los tres cuelgan del mismo `gastoDelDiaUsd`
(`runner.ts:889-895`): la regla «un costo no medido no es cero» está hoy en
**2 de 5** agentes que gastan modelo, y su compuerta en **1 de 5**.

**Causa raíz probable:** la regla vive repartida entre productor y consumidor sin
que nada los ate; arreglar el productor compila, pasa la suite y **se ve
terminado**.
**(REINCIDENTE — ARQ-2 de la auditoría 22.)**

---

### [MEDIO] `procesarTurno` **creció** a 2,913 líneas (74% de `processor.ts`) y el turno que se contesta y no se guarda sigue exactamente donde estaba (REINCIDENTE)

`src/lib/likida/processor.ts:1025-3937` · el punto vivo: `src/lib/likida/processor.ts:3352-3363`

**Medido hoy, contra la 22:**

| | aud. 22 | aud. 23 | Δ |
|---|---|---|---|
| `procesarTurno` | 2,874 | **2,913** | +39 |
| `processor.ts` | 3,862 | **3,937** | +75 |
| `return;` pelones dentro de la función | 73 | **80** | +7 |
| `if (` / `await` | 159 / 224 | **161 / 225** | +2 / +1 |
| llamadas a `saveConversation` dentro | 2 | **3** | +1 |

**Escenario (el mismo que la 22 marcó, verificado línea por línea hoy).**
`processor.ts:3287` carga `conv`; `processor.ts:3353-3362` es la rama «no alcanza
el presupuesto para el agente»: manda el cuadre determinístico con
`say(resumenCuadre(liq, false, 'operador'))` y hace `return;` **sin
`saveConversation`**. El operador escribe «listo» y recibe su cuadre; escribe
«ok, ¿y mi PDF?» y el agente arranca ese turno con un historial donde ni el
«listo» ni el cuadre existen. Es el bug ya pagado y documentado con nombre y
apellido en `processor.ts:2995-3010`. Se cerró en **3** de los 80 puntos donde
hoy se contesta y se sale.

**Consecuencia.** Quien añada la rama número 21 —y se añade cada semana— tiene
que acordarse a mano del contrato de salida (`soltarClaim`, `lockedViaje`,
`saveConversation`). Nada en el tipo ni en la suite se lo recuerda; el costo lo
paga el chofer con un bot que repregunta.

Dato de contexto: `cuadrarViaje` también creció, de 1,165 a **1,239** líneas
(`engine.ts:351-1589`). Las dos funciones más largas del repo siguen siendo las
dos por donde pasa el dinero, y las dos crecieron esta ronda. Archivos de
producción >800 líneas: **43**; >1,000: **26** (sin cambio).

**Causa raíz probable:** el `try/catch/finally` general vive en la misma función
que las ~20 ramas de despacho, así que extraer una rama obliga a reproducir el
contrato de salida en vez de heredarlo.
**(REINCIDENTE — declarado pendiente por la 22.)**

---

### [MEDIO] La dependencia bidireccional `/admin` ↔ `/dashboard` no se movió un archivo (REINCIDENTE)

`src/app/dashboard/resumen-visual.tsx` · `src/app/admin/ui/kit.tsx`

**Medido hoy** (imports por alias `@/app/...` y relativos, archivos distintos):

| dirección | archivos | qué importan |
|---|---|---|
| `/dashboard` → `/admin` | **64** | `ui/kit` (46), `ui/forma` (20), `charts` (7), `ui/graficas` (2), `ui/formato-preset` (2), `ui/hilo-soporte` (1), `mi-perfil/avatar-uploader` (1) |
| `/admin` → `/dashboard` | **53** | `resumen-visual` (51), `soporte/estatus`, `registro-filtro`, `pixeles`, `paginar-registro`, `mapa/mexico-geo` |

Las dos cifras son **idénticas** a las de la auditoría 22 (64 y 53). CLAUDE.md
sigue describiendo una sola dirección («/dashboard reusa los componentes de
/admin»); el árbol dice las dos, y la que el documento no menciona mueve 53
pantallas de Javier.

**Escenario.** `lib/auth/visibilidad.ts:62-71` deja constancia de que el
10-ago-2026 se borraron 17 páginas de «dueño de flota» y 6 del panel del contador
en un día. El siguiente rediseño de `/dashboard` toca `resumen-visual.tsx`
creyendo que edita el panel del cliente; en la variante barata rompe el build (se
ve), en la cara cambia un rótulo «para el cliente» y se lo cambia también al
superadmin, que es la clase de cambio que ninguna prueba pinta.

**Consecuencia.** «Quién es dueño de qué» dejó de poderse leer del árbol de
directorios, que es lo único que un agente nuevo lee antes de tocar.

**Causa raíz probable:** no existe `app/ui/`; el kit nació en `/admin` y el
lenguaje visual nuevo en `/dashboard`, y ninguno se promovió a un módulo neutro.
**(REINCIDENTE — MEDIO de la auditoría 22, cero movimiento.)**

---

### [BAJO] Los rótulos de rol pasaron de 7 mapas a **8**, y el archivo que fijó el umbral («el día que aparezca un cuarto sitio, el mapa se muda a un módulo compartido») es uno de ellos (REINCIDENTE)

`src/app/dashboard/agentes/notificaciones-forma.tsx:42-49` (el umbral declarado) ·
`src/app/admin/equipo/page.tsx:16-22` (el ÚNICO cerrado por tipo) ·
`src/app/admin/mi-perfil/page.tsx:10` · `src/app/dashboard/mi-perfil/page.tsx:18` ·
`src/app/dashboard/chrome.tsx:26` · `src/app/dashboard/usuarios/vista.tsx:11` ·
`src/app/dashboard/aviso-rol.tsx:7` · `src/app/dashboard/sesiones-mcp/vista.tsx:19`

**Escenario.** `notificaciones-forma.tsx:42-44` dice textualmente: «*son tres
cadenas; el día que aparezca un cuarto sitio, el mapa se muda a un módulo
compartido y los tres lo importan*». Hoy son **ocho**, y siguen divergiendo:
`encargado` es «Encargado» en cinco pantallas y «Jefe de tráfico» en dos
(`aviso-rol.tsx:9`, `notificaciones-forma.tsx:47`) — la misma persona, dos
nombres, en el mismo panel. `flota_admin` es «Dueño / Admin de flota» en cuatro
y «Dueño de la flota» en dos. Cuatro siguen listando `operador`, retirado del
dominio en la 0086.

El único que **no** puede divergir es `admin/equipo/page.tsx:16`, y es el único
escrito como `Record<RolAppUser, string>` — y también el único de los ocho que
conoce `vendedor`. La forma cerrada existe, funciona y está a la vista; siete
pantallas eligieron la abierta.

**Consecuencia.** Cosmético hoy (los `??` evitan `undefined`), pero es el
mismo patrón que ya obligó a construir `etiquetas_sincronizadas.test.ts` y
`conceptos_gasto_espejos.test.ts` para los conceptos de gasto: cuando la lista
de espejos crece más rápido que el guardarraíl, el guardarraíl se escribe
después de la divergencia, no antes.

**Causa raíz probable:** `rol` viaja como `string` desde la sesión hasta la
pantalla, así que anotar el mapa con el tipo cerrado obligaría a estrechar en el
borde. **(REINCIDENTE — BAJO de la 22; creció de 7 a 8.)**

*Del mismo tipo y con la misma dirección:* `lunesDe`/`lunesDeSemana` pasó de 8 a
**9** definiciones independientes en producción.

---

### [BAJO] «Qué teléfono es el mismo teléfono» tiene tres implementaciones, y la de la BASE ya divergió de la de TypeScript — el índice único no impone lo que su comentario afirma

`supabase/migrations/0024_telefono_normalizado_unico.sql:60-72` (`telefono_normalizado`, SQL) ·
`src/lib/likida/conv.ts:88-108` (`variantesTelefono`, TS) ·
`supabase/migrations/0024_telefono_normalizado_unico.sql:51-55` (el comentario que afirma que son «la MISMA regla»)

**Escenario.** `telefono_normalizado` hace dos cosas: quitar no-dígitos y
colapsar `521`+10 → `52`+10. `variantesTelefono` hace **eso y una tercera**: desde
«AUDITORÍA FABLE CICLO 4 (c4-4)» trata la forma nacional de 10 dígitos como el
mismo número (`conv.ts:99-104`). Con valores:

```
telefono_normalizado('5512345678')    = '5512345678'
telefono_normalizado('525512345678')  = '525512345678'      ← distintos ⇒ el índice los admite
variantesTelefono('525512345678')  ∋  '5512345678'          ← el código dice que son el mismo
```

Si dos fichas activas del mismo chofer llegan a coexistir así, el índice
`uq_operador_tenant_telefono_norm` **no las bloquea** y `resolveOperador`
(`conv.ts:114-125,136-152`) encuentra dos filas y lanza `OperadorAmbiguo`: el
chofer queda fuera de WhatsApp con «*Tu número aparece dado de alta más de una
vez y no puedo saber a qué viaje pertenece*» (`processor.ts:3928`), sin camino de
autoservicio.

**Intento de refutación (y es fuerte).** Hoy el ÚNICO escritor de
`operador.telefono` en producción es `crearOperador`
(`administracion.ts:273-286`), que normaliza al escribir (10 dígitos → `52`+10 y
`destinatarioWhatsApp`) y además comprueba duplicados con `variantesTelefono`
antes del insert; el teléfono **no se puede editar** por diseño
(`administracion.ts:356-359`). Así que hoy no es alcanzable. Lo reporto porque
el comentario de la migración afirma explícitamente que las tres reglas son la
misma —y no lo son—, y porque la 0274 acaba de extender esa función a un índice
nuevo sobre `wa_conversacion` apoyándose en esa afirmación: la garantía queda en
la aplicación, no en la base, que es justo lo que el índice existía para evitar.

**Causa raíz probable:** la regla se copió a SQL para poder indexarla y desde
entonces sólo evolucionó la copia de TypeScript; nada compara las dos.

---

### [BAJO] `dashboard/viajes/libro.tsx` sigue huérfano — 333 líneas de UI que ninguna página renderiza (REINCIDENTE)

`src/app/dashboard/viajes/libro.tsx:1-333` · `src/lib/likida/libro_viaje.ts`

Sin cambios desde la 22 (mismo archivo, mismo tamaño, cero importadores fuera de
un comentario en `dashboard/dinero_por_area.test.ts:72`). Su lógica sí está viva
(`/api/v1/viajes/[id]`, `lib/mcp/herramientas/dinero.ts`), así que quien cambie
`rotuloFacturacion`/`rotuloCobro` y siga CLAUDE.md §«Mirar el render» abrirá
`/dashboard/viajes`, no verá cambio, y concluirá que su cambio no llegó.

---

## Cifras medidas hoy

| Métrica | aud. 22 | **hoy** |
|---|---|---|
| `procesarTurno` (`processor.ts:1025-3937`) | 2,874 | **2,913** (74% del archivo) |
| `processor.ts` | 3,862 | **3,937** |
| `return;` pelones en `procesarTurno` | 73 | **80** |
| `saveConversation` dentro de `procesarTurno` | 2 | **3** |
| `cuadrarViaje` (`engine.ts:351-1589`) | 1,165 | **1,239** |
| archivos de producción >800 / >1,000 líneas | 43 / 26 | **43 / 26** |
| `/dashboard` → `/admin` (archivos) | 64 | **64** |
| `/admin` → `/dashboard` (archivos) | 53 | **53** |

**Copias de cada mapa de conceptos:**

| Concepto | Copias | ¿Guardado? |
|---|---|---|
| `TipoDiferencia` → cubeta/estatus | **5** listas a mano en `engine.ts` (8 · 8 · 17 · 19 · 35) sobre 43 valores | **NO** — ninguna prueba de contención; 1 hueco vivo, 1 declarado |
| `TipoDiferencia` → rótulo / norma / ruta de aviso | 3 (`rotulo-diferencia.ts:18`, `por_diferencia.ts:27,85`, `cierre_aviso.ts:104`) | Sí para 2 (`Record<TipoDiferencia,…>` no-Partial = exhaustivo por compilador); `por_diferencia.ts` es `Partial` |
| `ConceptoGasto` | 4 espejos + el tipo | **Sí** — `conceptos_gasto_espejos.test.ts` cruza los 4 contra el tipo y entre sí |
| `ConceptoGasto` → etiqueta impresa | 4 (`engine.ts:1614`, `pdf.ts`, panel, `reglas/catalogo.ts:96`) | **Sí** — `etiquetas_sincronizadas.test.ts` barre `src/`; el caso canónico `otro: 'Otro'` sigue cerrado con su comentario |
| `RolAppUser` → rótulo | **8** mapas de pantalla | **NO** — 7 de 8 son `Record<string,string>`; 2 divergencias vivas |
| «qué teléfono es el mismo» | 3 (`telefono_normalizado` SQL, `variantesTelefono` TS, `destinatarioWhatsApp`) | **NO** — ya divergieron |
| `lunesDe` / `lunesDeSemana` | **9** | NO (verificadas iguales por lectura en la 22; no volví a cruzarlas hoy) |
| «qué gasto es copia» | 1 (`copiasDeComprobante`) | **Sí** — `copias_un_origen.test.ts:88-106`, con la salvedad de abajo |
| «en qué cubeta cae» | 1 (`cubetaDe`) | Consumida por import en los 3 sitios (PDF, panel, export de póliza) |
| Acceso a datos fuera de `repo.ts`/`pg.ts` | 241 archivos | **Sí** — trinquete `frontera_datos_guardiana.test.ts:30`, saturado en 241 y verde hoy |

---

## Lo que revisé y está bien

- **La migración 0272 NO duplicó la deducibilidad — la hipótesis de «cuatro
  copias» es falsa y hay que decirlo.** Abrí las cuatro:
  `0272_poliza_deducibilidad.sql:11-30` entrega insumos (`gastos`,
  `diferencias`, `retenciones`) y declara por escrito por qué no clasifica;
  `api/export/poliza/route.ts:33,90-93` importa `cubetaDe` y clasifica con la
  MISMA función del motor; `contabilidad/poliza.ts:144-173` sólo recibe tres
  subtotales ya clasificados y elige cuenta; `contabilidad/catalogo.ts` no
  clasifica nada. Es el arreglo mejor construido de la ronda 22 en este rubro:
  cero listas de `TipoDiferencia` en SQL.
- **`contabilidad/catalogo.ts:27-30` (`CONCEPTOS`) sí está vigilado.** Es uno de
  los cuatro espejos que `conceptos_gasto_espejos.test.ts:50-77` cruza contra
  `ConceptoGasto` y entre sí, con la única excepción declarada (`viaticos` en
  OCR). Un concepto nuevo pone la suite en rojo.
- **El export de póliza NO puede descuadrar por comprobantes duplicados**, aunque
  a primera vista lo parezca: `repartirPorCubeta`
  (`api/export/poliza/route.ts:72-99`) recorre TODOS los gastos del viaje sin
  consultar `copiasDeComprobante`, mientras `comprobado = anticipo − diferencia`
  (`poliza.ts:205`) sí las excluye. Lo perseguí y es inalcanzable por dos
  guardas independientes: `uq_gasto_cfdi_uuid` sobre
  `(tenant_id, cfdi_uuid, cfdi_orden)` (`0065:69`) impide dos filas del mismo
  CFDI, y una copia sin UUID no tiene `sub_total`, con lo que
  `bool_and(sub_total is not null)` (`0272:74`) bloquea el periodo antes con el
  mensaje de «base gravable desconocida». Queda como vigilancia: el guardarraíl
  de `copias_un_origen.test.ts:102-106` enumera **dos archivos a mano**, y el
  cuarto consumidor de esa verdad ya nació sin que la prueba se enterara.
- **El motor de dinero sigue siendo puro.** `engine.ts:11-22`: sólo `util`,
  `tope_alimentacion`, `fecha_dudosa`, `sanitizar`, `cfdi`, `caducidad`,
  `identificar`, `normas/indice`, `evidencia_monedero` y `formato`, con el
  comentario `// 'formato.ts' no importa NADA` en pie. Cero I/O, cero
  `supabaseAdmin`, cero `fetch`. Un solo ensamblador (`cuadre/desde_db.ts`).
- **El trinquete de la frontera del dato sigue vivo y verde.**
  `frontera_datos_guardiana.test.ts:30` congela 241 y corre en 317 ms (lo corrí);
  cualquier archivo nuevo con `.from(`/`.rpc(` fuera de `repo.ts`/`pg.ts` la pone
  en rojo.
- **`cubetaDe` sigue siendo la única definición y se importa, no se copia.** Sus
  tres consumidores la importan del motor: `dashboard/[id]/vista.tsx:6,177-179`,
  `api/export/poliza/route.ts:33`, y el propio `engine.ts:1527`. El panel deriva
  sus dos `Set` de `NO_DEDUCIBLE_ISR`/`POR_CONFIRMAR` en vez de reescribirlas, y
  `estado_renglon.test.ts:25,33,41` itera las listas del motor para probarlo.
- **`crearOperador` normaliza y falla cerrado.** `administracion.ts:273-290`:
  10 dígitos → `52`+10, comprobación de duplicado por variantes ANTES del
  insert, y `if (errBusca) throw` — sin poder comprobar, no da de alta.
- **La partición `SIN_IVA_ACREDITABLE` / `SIN_ESTIMULO` está bien construida.**
  `engine.ts:1332` deriva la segunda de la primera (`[...SIN_IVA_ACREDITABLE,
  …]`) en vez de copiarla, que es exactamente lo contrario del defecto del
  hallazgo 1. Es la prueba de que la forma correcta ya se conoce en el archivo.
- **`RUTA_DE_DIFERENCIA` es exhaustiva por tipo.** `cierre_aviso.ts:104` es
  `Record<TipoDiferencia, RutaDeAviso>` no-`Partial`: un tipo nuevo no compila
  hasta que alguien decide su ruta. Lo mismo `rotulo-diferencia.ts:18`. Son las
  dos únicas de las cinco familias de listas que el compilador sostiene.

---

## Lo que NO alcancé a revisar

- **`facturacion/` completo** (`comercios.ts` 2,642 · `adaptadores/pagina_playwright.ts`
  1,339 · `capufe.ts` 1,282 · `portales.ts` 1,114). Sigue siendo el subsistema
  más grande que no abrí y, por su forma —un adaptador por portal—, el sitio más
  probable para la misma regla escrita N veces. La 22 tampoco lo abrió: van dos
  rondas.
- **Las ~69 rutas de `src/app/api/`**: sólo abrí `export/poliza` a fondo. No
  comparé los ~10 `route.ts` de `cron/` entre sí, donde el patrón
  reloj/presupuesto/`after()` se repite literal.
- **Ciclos de importación reales.** No construí el grafo esta ronda; el único
  que vi de paso sigue siendo `lib/mcp/credencial.ts` → `app/api/v1/_comun.ts`
  (dependencia que apunta al revés, sin bug hoy).
- **Código muerto.** No repetí el grafo de huérfanos de la 22 (773 archivos);
  sólo verifiqué que los dos que reportó siguen huérfanos.
- **Las 9 copias de `lunesDe`.** Las conté, no las crucé una por una como hizo
  la 22.
- **`sat_descarga/` y `peajes/`**: los cuatro archivos con `.from('gasto')`
  propio siguen sin cruzarse contra el mapeo de 26 columnas de `repo.ts:944-976`.
- **`supabase/migrations/` (274 archivos)**: no verifiqué correspondencia entre
  `CHECK` de dominio y uniones de TypeScript más allá de `telefono_normalizado`
  y lo que tocó la 0272.
