# Arquitectura y mantenibilidad — auditoría 19 c2

**Nota: 3/10** (antes 4). Razón del movimiento: **deuda que cobró factura**.

Los tres ALTOS que dejé abiertos hace un día siguen **exactamente igual** —ni una
línea cambió en `poliza.ts`, ni en `computer_use.ts:336`, ni en la allowlist de
`acotada_guardiana.test.ts`— y el delta de 141 archivos entró **por encima** de
ellos: dos ciclos de paquete nuevos (`lib/llm ↔ lib/supabase`, `lib/likida ↔
lib/llm`), 31 consultas sin techo en la consola de superadmin —la consola cuyo
propio comentario de allowlist dice, con fecha, que lleva techo—, y dos controles
de seguridad nuevos (presupuesto duro e idempotencia por efecto) cuya rama de
producción **no la ejecuta ni una prueba de las ~2,900**, porque el propio código
la desvía cuando `NODE_ENV === 'test'`. La regla del rubro es literal: una
advertencia que volvió a ocurrir es un hallazgo. Aquí volvieron a ocurrir tres, y
el mecanismo que las produce —«el guardia es una lista que alguien tiene que
acordarse de actualizar»— se reprodujo tres veces más en la superficie nueva.

**El riesgo mayor del rubro hoy:** las dos garantías que este delta existe para
dar —«esta tool no se ejecuta dos veces» y «esta corrida no se puede pasar de
dinero»— **se apagan solas bajo vitest** (`tool-executor.ts:136`,
`budget.ts:89`), así que la suite verde no dice nada sobre el comportamiento que
va a producción; y el camino contrario, el de fallar cerrado, no tiene una sola
prueba que lo toque.

---

## Las cifras, recontadas

Las conté sobre `origin/master` (`69aa71b`) y sobre `8b43121` extraído a un
directorio aparte (`git archive 8b43121 src | tar -x -C …`), con el **mismo
script** para las dos, para que la comparación no sea contra la memoria de nadie.

**Todos los `archivo:línea` de este informe son contra `origin/master` (`69aa71b`)**,
no contra el árbol de trabajo: el orquestador está aplicando autofixes en paralelo
(`openrouter.ts` y `tool-idempotency.ts` ya cambiaron mientras escribía esto) y las
líneas se corren. Para verificar: `git show origin/master:<archivo>`.

| Métrica | Ronda 19 | Hoy | Comando |
|---|---|---|---|
| Archivos de producción con `.from(`/`.rpc(` | 171 | **173** | `os.walk('src')`, `.ts/.tsx` sin `.test.`/`.fixture.`, sin líneas de comentario (reproduce 171/709 exacto sobre `8b43121`) |
| Llamadas `.from(`/`.rpc(` | 709 | **713** | idem |
| Idem, regex estricta `.from('…')` / `.rpc('…')` | 138 arch. / 623 | **140 arch. / 632** | igual, con `["']` obligatorio |
| Tamaño de la allowlist de `acotada` | 16 rutas | **16 rutas** | `acotada_guardiana.test.ts:14-52` |
| Archivos **nuevos** que consultan Supabase directo | — | **2** (`llm/budget.ts`, `llm/tool-idempotency.ts`) | diff de los dos conteos, archivo por archivo |
| Consultas de `lib/admin/qa-*` sin `acotada(` | 25 | **31** (`qa-motor.ts` 17, `qa-storage.ts` 14) | `grep -cE '\.(from\|rpc)\(' src/lib/admin/qa-*.ts` vs `grep -c 'acotada('` |
| Sitios que normalizan la ortografía del folio fiscal | 11 | **11** | `rg -i --glob '!*.test.*' -e "cfdiUuid[^\n]*to(Lower\|Upper)Case" -e "\.to(Lower\|Upper)Case\(\).*uuid" src/` |
| …de esos, los que van a **MAYÚSCULAS** | 1 | **1** (`computer_use.ts:337`) | idem |
| Escritores de `gasto.cfdi_uuid` que se saltan `uuidCfdi()` | 1 | **1** (`al_vuelo.ts:564`) | `rg "cfdi_uuid:" src/ --glob '!*.test.*'` |
| Ciclos de dependencia **entre paquetes** de `src/lib` y `src/app` | 7 | **9** | Tarjan sobre el grafo de `import … from` resuelto (`@/` y relativos), agrupado por `lib/<x>` |
| Ciclos de dependencia **entre archivos** | 0 | **0** | mismo script, SCC > 1 |
| `procesarTurno`, líneas | 2,370 | **2,386** (`processor.ts:760-3145`) | balanceo de llaves desde la declaración |
| Copias del predicado «los cinco datos fiscales» | 4 | **4** | `saas/fiscal.ts:60`, `admin/flotas/page.tsx:35`, `administracion.ts:164`, `entrevista-aplicar.ts:138` |
| Espejos escritos a mano de `ConceptoGasto` | 3 | **3** | `catalogo.ts:27`, `politicas/page.tsx`, `intake/ocr.ts:32` |
| Llamadores de `/api/export/poliza` en `src/` | 0 | **0** | `rg 'export/poliza' src/` → la ruta, un comentario y una prueba |

**Corrección a mi propio informe anterior.** Escribí que
`rg estanCompletos src/` «devuelve solo su definición». **Es falso, y lo era
entonces**: `saas/transferencia.ts:343` y `dashboard/suscripcion/page.tsx:102,143`
la importan, y ya lo hacían en `8b43121` (lo verifiqué sobre el árbol extraído).
La duplicación del predicado sigue en pie —son cuatro copias— pero la frase «sin
consumidores» no. La dejo anotada para que la próxima ronda no la herede.

Los dos ciclos de paquete nuevos, por si alguien quiere el par exacto:
`lib/likida ↔ lib/llm` y `lib/llm ↔ lib/supabase`. Los siete anteriores
(`app/admin ↔ app/dashboard`, `lib/admin ↔ lib/agents`, `lib/agents ↔ lib/likida`,
`lib/auth ↔ lib/likida`, `lib/correo ↔ lib/likida`, `lib/likida ↔ lib/meta`,
`lib/likida ↔ lib/saas`) siguen igual.

---

## Hallazgos

### [ALTO] Los dos controles de seguridad que estrena el delta —presupuesto duro e idempotencia por efecto— se apagan solos bajo `vitest`, y su rama de producción no la toca ninguna prueba

`src/lib/llm/tool-executor.ts:131-148` (en particular `:136-146`) ·
`src/lib/llm/budget.ts:85-94` ·
`src/lib/llm/tool_idempotency.test.ts:7` · `src/lib/llm/budget.test.ts:4` ·
`src/lib/llm/runtime_guards.test.ts:10`

**Las dos compuertas, textuales.** `tool-executor.ts:136`:

```ts
} catch (err) {
  const detalle = err instanceof Error ? err.message : String(err);
  if (process.env.NODE_ENV === 'test') {
    logger.warn('tool.idempotencia_mock', { name, err: detalle });
    durable = null;                       // ← se ejecuta IGUAL, sin protección
  } else {
    logger.error('tool.idempotencia_no_disponible', …);
    return { success: false, …, error: 'la operación no se pudo proteger contra reintentos…' };
  }
}
```

y `budget.ts:88-94`, misma forma: si el cliente de Supabase no expone `rpc`, en
`NODE_ENV === 'test'` devuelve `{ persisted: false }` y **la llamada al modelo
sigue**; fuera de test lanza. `settleLlmBudget:118` remata con
`if (reservation.persisted === false) return;`.

**Escenario concreto.** Alguien renombra `claim_agente_mutacion` en la 0186, o
despliega a un entorno donde la 0186 no se aplicó (que es exactamente lo que pasa
en cada entorno nuevo: la base viva está en cero y las migraciones se aplican a
mano). En producción, **toda tool marcada `isMutation` devuelve**
`«la operación no se pudo proteger contra reintentos; inténtalo de nuevo»`: el
agente deja de poder cerrar una liquidación, guardar un gasto o crear un viaje.
`npx vitest run` sigue en verde con las 2,9xx pruebas, porque bajo vitest esa
misma excepción se degrada a `logger.warn` y el handler corre.

**Y al revés:** verifiqué que **ninguna prueba del repo stubea `NODE_ENV`**
(`rg "stubEnv\('NODE_ENV'" src/` → cero) y que **ninguna** hace fallar a
`claimMutation` (`rg 'idempotencia_no_disponible|no se pudo proteger' src/` →
solo el propio `tool-executor.ts`). Es decir: las líneas `:143-146` de
`tool-executor.ts` y `:93` de `budget.ts` —las dos ramas de «fallar cerrado», que
es la regla de producto escrita en `CLAUDE.md`— **no tienen cobertura de ninguna
clase**, y no pueden tenerla mientras la condición sea el nombre del entorno.

**Intento de refutación.** Miré si el desvío está aislado a un mock viejo:
`budget.test.ts:4` mockea `supabaseAdmin` **con** `rpc`, así que ese archivo sí
ejercita la RPC; `tool_idempotency.test.ts:7` mockea el módulo entero, así que
también ejercita el camino durable. Correcto — pero eso demuestra lo contrario de
lo que parece: si los dos archivos que cubren la funcionalidad ya saben mockear
bien, el desvío `NODE_ENV === 'test'` solo protege a las **otras** pruebas (las de
cadena, con un mock mínimo de Supabase), y esas son precisamente las que un
mantenedor abre para preguntar «¿esta tool se ejecuta dos veces?». La respuesta
que le dan es la del entorno sin idempotencia.

**Consecuencia.** Para quien mantiene: el runtime desplegado y el runtime probado
son dos programas distintos en el punto donde se decide si un efecto de dinero se
repite. Es la misma forma exacta del CRÍTICO del folio de la c4 —una prueba verde
certificando un comportamiento que la aplicación no ejecuta—, ahora aplicada a
dos garantías nuevas en vez de a una constante.

**Causa raíz probable.** Se hizo que el código nuevo pasara la suite existente en
vez de hacer que la suite existente describiera el código nuevo; el interruptor
quedó en el código de producción porque ahí era una línea.

---

### [ALTO] El presupuesto duro es un parámetro opcional cuya ausencia es un no-op silencioso, y ya se filtró el primer día: `/dashboard/agentes/proveedores` manda una foto al modelo de visión sin tope de dinero **ni** de tiempo

`src/lib/likida/proveedores.ts:207` · `src/app/dashboard/agentes/proveedores/page.tsx:155` ·
`src/lib/likida/intake/ocr.ts:317-330`, `:354` ·
`src/lib/llm/openrouter.ts:327`, `:342`, `:445`, `:515`, `:743`, `:835`

**El mecanismo.** Las tres entradas al modelo declaran `budget?: LlmBudget`
(`openrouter.ts:327`, `:445`, `:743`) y las tres, cuando falta, **saltan la
reserva sin decir nada**: `:342` y `:515` son `opts.budget ? await
reserveLlmBudget(…) : null`; `:835` es literalmente `if (!opts.budget) return
null;`. `extraerComprobante` repite el patrón un piso más abajo: `ocr.ts:328`
`budget?: LlmBudget`, reenviado tal cual en `:354`.

**El escenario, con el archivo abierto.** Conté los cuatro llamadores de
`extraerComprobante`: `processor.ts:1046` y `:1333` y `api/dashboard/ingesta/route.ts:80`
pasan `createLlmBudget(tenantId, randomUUID())` **y** una señal; el cuarto es

```ts
// proveedores.ts:206-207
const { extraerComprobante } = await import('./intake/ocr');
const r = await extraerComprobante(imagenes);
```

sin señal y sin presupuesto. Es `ingresarFacturaDesdeFoto`, y su único llamador es
`agentes/proveedores/page.tsx:155`, una server action del panel del cliente: el
contralor sube la foto de una factura de proveedor (`imagenes` puede ser un
**array**, o sea varias imágenes en una sola llamada de visión) y la corrida sale
sin reserva y sin `AbortSignal`. Ni `tsc` ni el linter ni la suite dicen una
palabra: los dos parámetros son opcionales.

**Intento de refutación.** Revisé si el tope vive más arriba: `openrouter.ts` no
tiene un default de presupuesto, y `acotada()` no cubre este camino (es el techo
de las consultas a Postgres, no el de OpenRouter). Revisé también si el
`tenantId` estaba fuera de alcance —sería una excusa—: no lo está, es el primer
parámetro de `ingresarFacturaDesdeFoto`. Y sí verifiqué lo bueno: los doce sitios
que llaman directo a `generateResponse`/`generateStructured`/`generateWithTools`
**sí** pasan `budget`. La fuga no está en la capa que se revisó, está en la de
arriba, que es exactamente donde vuelve a aparecer cuando el control es opcional.

**Consecuencia.** Para quien mantiene: «¿esta llamada al modelo tiene tope?» no
se puede contestar leyendo la firma —siempre compila— sino auditando cada
llamador de cada envoltorio, y hay dos pisos. Es la misma deuda de `acotada` que
lleva cuatro rondas, replicada tal cual sobre el dinero del modelo, en el commit
que la venía a cerrar.

**Causa raíz probable.** El control se añadió como parámetro opcional para no
tocar los llamadores existentes, y no se acompañó de nada que barra `src/`
preguntando quién llama al modelo sin él.

---

### [ALTO] `repo.ts` sigue sin ser la frontera de datos y la allowlist no se movió ni una línea: la superficie nueva —el runtime del modelo y el panel de QA— nació entera fuera de ella, con 31 consultas sin techo en la consola de superadmin · REINCIDENTE (c4 ALTO 3, ronda 19 ALTO 3)

`src/lib/likida/acotada_guardiana.test.ts:14-52` (16 rutas, sin cambios) ·
`src/lib/admin/qa-motor.ts:129`, `:170`, `:189`, `:194`, `:203`, `:226`, `:245`, `:262`, `:269`, `:317`, `:322`, `:326` ·
`src/lib/admin/qa-storage.ts:185`, `:196`, `:270`, `:343`, `:357`, `:368`, `:375`, `:393`, `:425` ·
`src/app/admin/qa/page.tsx:20-34` ·
`src/lib/llm/budget.ts:1-3`, `src/lib/llm/tool-idempotency.ts:1-2`

**El conteo.** 171 → **173** archivos, 709 → **713** llamadas. Los dos archivos
nuevos son `llm/budget.ts` y `llm/tool-idempotency.ts`. La allowlist de
`acotada_guardiana.test.ts:14-52` sigue siendo **la misma lista literal de 16
rutas** de la ronda pasada, byte por byte.

**Lo que hace este hallazgo distinto de la ronda 19 es la consola de superadmin.**
La allowlist trae su propio comentario, con fecha y motivo
(`acotada_guardiana.test.ts:24-31`): *«ESCALA 50k (22-ago-2026, regla 5): lo que
queda en JS de la consola de superadmin también lleva techo. Un `Promise.all` de
dieciséis lecturas sin techo colgado en una es toda la página en blanco»*, y por
eso metió `negocio.ts`, `capacidad.ts` y `corridas-cruzadas.ts`. Tres días
después, `/admin/qa` estrenó **31 consultas** (`qa-motor.ts` 17, `qa-storage.ts`
14) y **cero `acotada(`** — lo verifiqué archivo por archivo. Y su página es
exactamente la forma que el comentario describe:

```ts
// app/admin/qa/page.tsx:23-33
const manifiesto = await leerManifiesto(db)…
fotos = await Promise.all(manifiesto.datos.map(async (f) => ({ …, url: await firmarRuta(…) })));
const historial = await listarCorridas(db)…
const gasto     = await gastoHoyUsd(db)…
```

Cuatro lecturas encadenadas más un `Promise.all` de firmas de Storage, ninguna
con deadline. `listarCorridas` (`qa-storage.ts:391-403`) sí trae `.limit(60)`,
que es un tope de **filas**, no de **tiempo**: `acotada()` existe porque el modo
de falla no es «demasiadas filas», es «el socket no contesta».

**Qué se desincroniza.** Es la misma demostración de la ronda pasada, con un caso
nuevo: `al_vuelo.ts:564` sigue siendo el único escritor de `gasto.cfdi_uuid` que
no pasa por `uuidCfdi()` de `repo.ts:34`, y ahora se le suma que las dos piezas
que gobiernan el dinero del modelo (`budget.ts`, `tool-idempotency.ts`) hablan
con Postgres por su cuenta. Que las dos usen `acotada()` correctamente —lo
comprobé, `budget.ts:95`, `:123`, `tool-idempotency.ts:37`— **es mérito de quien
las escribió, no del guardia**: la suite queda igual de verde el día que alguien
añada la consulta 32 sin envolverla.

**Consecuencia.** Cada frontera que este repo declara nace cubriendo solo los
archivos que alguien se acordó de listar, y el patrón que sí cierra su clase
—barrer `src/` entero— está a la vista en el mismo árbol
(`etiquetas_sincronizadas.test.ts:42-67`, `formato.test.ts:215-228`,
`server_actions_sin_closures.test.ts:38-47`, escrita **en este delta**). Se
siguen escribiendo guardias nuevas con el patrón que ya falló.

---

### [ALTO] La póliza y el motor llevan DOS contabilidades del mismo viaje, sin un solo cambio en el delta · REINCIDENTE (ronda 19 ALTO 1)

`src/lib/likida/contabilidad/poliza.ts:98-105`, `:107-117`, `:119-129`, `:131-149`, `:156-166` ·
`src/lib/likida/cuadre/engine.ts:415-418`, `:846` ·
`supabase/migrations/0178_fiscal_retencion_arco_y_perfiles_erp.sql:215-231` ·
`src/app/api/export/poliza/route.ts:186-202`

Volví a abrir los cinco bloques de `poliza.ts` sobre `origin/master`: `:99`
`cargo: REDONDEO(g.subtotal)` (la **base** del CFDI, `0178:224`
`sum(gg.sub_total)`), `:107` el IVA **solo si es acreditable**, `:119` el abono
del anticipo, `:131` la diferencia —que viene de `engine.ts:846`, expresada en
**totales con impuesto**—, y `:156-166` el cuadre que compara las dos. La
identidad solo cierra si cada peso de IVA de cada comprobante es acreditable.
Un CFDI de diésel `SubTotal 3,000 / IVA 480 / Total 3,480` con `FormaPago '01'`
sobre un anticipo de 5,000 sigue dando cargos 4,520 vs abonos 5,000 → `ok:
false` → `route.ts:190` devuelve **409 para el periodo entero**.

No repito el escenario completo (está en `arquitectura.md`, ALTO 1). Lo anoto
porque **el delta más grande del repo pasó por encima sin tocarlo**, y la regla
del rubro dice que eso, por sí solo, es un hallazgo. `git diff 8b43121
origin/master -- src/lib/likida/contabilidad/` no devuelve nada.

**Consecuencia.** La misma lógica de dinero —qué suma un viaje— sigue escrita dos
veces, una en TypeScript y otra en SQL, y nadie las casa. Es el ancla literal del
rubro: *«4 o menos si la misma lógica de dinero vive en más de un archivo»*.

---

### [ALTO] El folio fiscal sigue con su normalizador a MAYÚSCULAS y su prueba en verde, sin un solo cambio · REINCIDENTE (clase de ARQ-C4-1, tercera ronda)

`src/lib/likida/facturacion/adaptadores/computer_use.ts:336-338` ·
`src/lib/likida/facturacion/adaptadores/computer_use.test.ts:204-208` ·
`src/lib/likida/facturacion/al_vuelo.ts:554-570` (en particular `:564`) ·
`src/lib/likida/repo.ts:20-37`

Verificado hoy, línea por línea:

```ts
// computer_use.ts:336-338
export function extraerUuid(texto: string): string | null {
  const m = texto.match(/[0-9a-f]{8}-…/i);
  return m ? m[0].toUpperCase() : null;
}
```

y su prueba, `computer_use.test.ts:205`, sigue llamándose **«lo encuentra donde
sea y lo normaliza a mayúsculas»**. `repo.ts:34` sigue declarando lo contrario
(`t.toLowerCase()`), la 0158 sigue rechazándolo con un CHECK en cuatro tablas, y
`al_vuelo.ts:564` —`update gasto set cfdi_uuid: uuid`— sigue siendo el único
escritor vivo que escribe lo que le den, sin pasar por `uuidCfdi()`.
`rg 'computer_use|ComputerUse' src/` sigue devolviendo **solo el archivo y su
prueba**: el adaptador no está cableado, así que el 23514 no está ocurriendo hoy;
lo que está ocurriendo es que **no hay nada que impida cablearlo**.

**Lo que cambia respecto a la ronda pasada** es la cuenta: es la tercera ronda con
la misma copia al revés, en un delta que sí escribió tres guardias barredoras
nuevas para **otras** clases de fallo (`etiquetas_sincronizadas`,
`server_actions_sin_closures`, `qa-panel`). El invariante que ya costó un CRÍTICO
sigue viviendo en un comentario y en un CHECK de Postgres, y entre los dos no hay
nada que barra `src/`.

---

### [MEDIO] Dos ciclos de paquete nuevos: el cliente de datos de todo el repo depende ahora del módulo del modelo, y el módulo del modelo depende del de datos

`src/lib/supabase/admin.ts:6` · `src/lib/llm/runtime-signal.ts:1-2`, `:16` ·
`src/lib/llm/budget.ts:1-3` · `src/lib/llm/tool-idempotency.ts:1-2` ·
`src/lib/llm/runtime-signal-shared.ts:1`

**Las aristas exactas.** `lib/supabase/admin.ts:6` importa `combineAbortSignals,
currentToolSignal` de `@/lib/llm/runtime-signal`, cuya **primera línea** es
`import { AsyncLocalStorage } from 'node:async_hooks'`. En sentido contrario,
`lib/llm/budget.ts:1-3` y `lib/llm/tool-idempotency.ts:1-2` importan
`@/lib/supabase/admin` **y** `@/lib/likida/presupuesto`. Resultado, medido con un
Tarjan sobre el grafo de imports (script en el bloque de cifras): los ciclos de
paquete pasan de **7 a 9**, con `lib/llm ↔ lib/supabase` y `lib/likida ↔ lib/llm`
como estrenos. A nivel de **archivo** no hay ciclo (0 SCC > 1) — lo verifiqué
porque el nombre `runtime_guards_imports.ts` sugería justo eso, y no lo es.

**Qué se desincroniza, y cómo se ve.** Toda ruta que instancie
`supabaseAdmin()` —crons de facturación, el webhook, las ~31 páginas del panel,
`export/poliza`, ninguna de las cuales habla con un modelo— arrastra ahora
`lib/llm/runtime-signal` y con él un `AsyncLocalStorage` de Node. Concreto y ya
visible: cualquier prueba que haga `vi.mock('@/lib/supabase/admin', …)` —el mock
más común del repo— **también sustituye el cableado de cancelación del runtime
del modelo**, porque el `fetch` que hereda la señal de la tool
(`admin.ts:32-38`) vive dentro del módulo mockeado. Es exactamente el efecto que
`budget.ts:85-87` describe por escrito como el motivo de su desvío por
`NODE_ENV`: *«Los tests de integración mockean Supabase con el contrato que
necesitaba el flujo anterior»*. El ciclo y la escotilla del ALTO 1 son el mismo
problema visto desde dos lados.

**El detalle que delata que la partición fue mecánica.** `runtime-signal-shared.ts:1`
se anuncia como *«Helpers AbortSignal sin Node ni AsyncLocalStorage; aptos para
cliente»* y **no lo importa nadie directamente**: los cinco consumidores
(`tool-executor.ts:10`, `supabase/admin.ts:6`, `agents/copiloto.ts:23`,
`agents/analista.ts:26`, `agents/run.ts:9`) importan del barril
`./runtime-signal`, que es el que trae `node:async_hooks`. La razón de ser del
segundo archivo la anula el primero. Y `runtime-signal.ts` termina en la línea 16
con un JSDoc huérfano —*«Combina señales sin asumir que el runtime expone
AbortSignal.any.»*— sin declaración debajo: es el comentario de la función que se
movió al otro archivo.

**Consecuencia.** Para quien mantiene: `lib/supabase` ya no se puede extraer,
mockear ni razonar sin `lib/llm`, y la separación cliente/servidor que el archivo
compartido dice implementar no la ejerce ni un solo import.

---

### [MEDIO] El contrato entre el OCR y el motor de dinero es una bolsa `unknown`: se retiraron dos campos del esquema del extractor y los cinco consumidores siguen compilando — hoy `renglones_ajenos` es un `TipoDiferencia` con rótulo al cliente que no puede dispararse nunca

`src/lib/likida/intake/ocr.ts:60-76`, `:525-571` ·
`src/lib/likida/cuadre/engine.ts:623-641`, `:950-955` ·
`src/types/likida.ts:108` · `src/lib/likida/cierre_aviso.ts:143` ·
`src/lib/likida/normas/por_diferencia.ts:91` ·
`src/app/dashboard/agentes/liquidacion/rotulo-diferencia.ts:51` ·
`src/lib/likida/processor.ts:1395`

**Lo que pasó, según el propio código.** `ocr.ts:60-76` documenta que
`plazo_facturacion_horas` y `renglones` se agregaron el 24-ago y **tumbaron el
OCR en producción** (`400 Provider returned error`, `tokens_in/out = 0` en cada
foto), así que se retiraron del esquema. Bien resuelto y bien explicado. Lo
arquitectónico es el resto: **los consumidores no se enteraron y no se pueden
enterar**.

`ocrExtra` se arma en `ocr.ts:525-571` como una lista blanca explícita de 18
claves; ni `renglones` ni `plazoFacturacionHoras` están. Verifiqué que **no hay
ningún otro productor**: `rg 'renglones|plazoFacturacionHoras' src/ --glob
'!*.test.*'` no devuelve un solo `ocrExtra` que las escriba. Y sin embargo
siguen ahí, compilando:

- `engine.ts:623` `const renglones = (g.ocrExtra as Record<string, unknown>)?.renglones;`
  — 20 líneas de filtro, umbral del 15% y redacción de la nota, **inalcanzables**.
- `engine.ts:950` `const horasImpresas = …?.plazoFacturacionHoras;` — el «plazo
  impreso en el papel gana al catálogo» que el commit `6340aac` anuncia como
  funcionalidad, **inalcanzable**.
- `types/likida.ts:108` estrenó el miembro `'renglones_ajenos'` del union
  `TipoDiferencia`, y con él se cablearon tres mapas: `cierre_aviso.ts:143`
  (`'decision'` → ruta de aviso al jefe), `por_diferencia.ts:91` (texto de norma)
  y `rotulo-diferencia.ts:51` (**«Incluye partidas que no son del viaje»**, el
  rótulo que ve el contralor). Los tres correctos, los tres muertos.
- Cero pruebas: `rg 'renglones_ajenos|ajenoAlViaje|plazoFacturacionHoras' src/`
  no toca un solo `.test.`.

**Por qué nada avisa.** El tipo del campo es `ocrExtra?: Record<string, unknown>`
y cada lectura lo re-castea en línea (`as Record<string, unknown>`), así que el
compilador no relaciona productor y consumidor. Hay dos productores más, y con
distinta disciplina: `ocr.ts:567,570` usan constantes exportadas
(`MARCA_TEXTO_SOSPECHOSO`, `MARCA_NO_FISCAL`) precisamente para no deletrear la
clave dos veces, mientras `processor.ts:1395` escribe
`{ …ocrExtra, montoImplausible: true }` con literal suelto, leído en
`engine.ts:586` con otro literal suelto.

**Escenario para quien mantiene.** Mañana alguien reintroduce `renglones` en el
esquema con otra forma (por ejemplo `ajeno: boolean` en vez de `ajenoAlViaje`,
que es el nombre que el filtro de `engine.ts:627` exige). `tsc` limpio, suite
verde, y la observación de canasta mixta sigue sin salir — sin un solo síntoma
salvo la ausencia de una nota que nadie sabe que debería estar.

**Consecuencia.** Para el contralor: el ticket de Walmart de $640 con $557 de
manguera y tapetes que el comentario de `engine.ts:608-613` describe como el caso
que justifica todo el bloque sigue entrando completo y en silencio, después del
commit que anuncia haberlo resuelto.

---

### [MEDIO] El código que se despliega ya no está todo bajo `src/`: la consola de QA importa `scripts/qa-agentes/` con `../../../`, y **todos** los guardias de este repo barren `src/`

`src/lib/admin/qa-motor.ts:35` · `src/lib/admin/qa-oraculos.ts:25-29` ·
`src/lib/admin/qa-panel.test.ts:18` · `scripts/qa-agentes/oraculos/cuadre_balancea.oraculo.ts:10-11` ·
`tsconfig.json` (`include: ["**/*.ts"]`, sin `.vercelignore`)

**La arista.** `qa-motor.ts:35` importa `exigirTenantZZZ, exigirPrefijoQA,
PREFIJO_QA, TOPE_CORRIDA_USD` de `'../../../scripts/qa-agentes/config.qa'`, y
`qa-oraculos.ts:25-29` importa los cuatro oráculos de
`'../../../scripts/qa-agentes/oraculos/*'`. `qa-motor.ts` lo importa
`/api/admin/qa/lanzar/route.ts:20`, que es una ruta desplegada. Los oráculos, a su
vez, importan de vuelta a `@/lib/supabase/admin` y `@/lib/likida/cuadre/desde_db`.
No hay `.vercelignore` y `tsconfig.json` incluye `**/*.ts`, así que esto compila y
se despliega: **`scripts/` es código de producción desde este delta**.

**Qué se desincroniza.** Cada guardia estructural del repo está anclada a `src/`,
literalmente:

| Guardia | Raíz |
|---|---|
| `formato.test.ts:216`, `:234` | `grep -rl … src/` |
| `etiquetas_sincronizadas.test.ts:42` | `new URL('../../', import.meta.url)` → `src/` |
| `server_actions_sin_closures.test.ts:38` | `join(process.cwd(), 'src/app')` |
| `acotada_guardiana.test.ts:14-52` | rutas `src/lib/…` |
| `qa-panel.test.ts:36`, `:57` | `src/app/api/webhook`, `src/lib/likida` |

Verifiqué que **hoy no hay violación viva** (`grep -rn "toLocaleString('es-MX'\|'America/Mexico_City'" scripts/` → nada), y por eso esto es MEDIO y no ALTO. Lo que ya es cierto es que el radio de esos guardias dejó de coincidir con el radio de lo desplegado, y la diferencia no está escrita en ningún lado.

**Consecuencia.** La regla «una cifra fiscal se formatea en un solo archivo» y la
regla «toda consulta del camino caliente lleva techo» ahora tienen una zona
ciega, y la zona ciega es un directorio que se llama `scripts/` — el sitio donde
cualquiera asume que puede escribir sin cuidado. `qa-motor.ts:129-203` inserta
filas en `tenant`, `operador`, `unidad` y `viaje` desde una ruta desplegada, y
`:317-326` borra en lote; el guard `exigirTenantZZZ` que lo protege vive fuera del
árbol que las pruebas del repo vigilan.

---

### [MEDIO] La prueba de `1d327f7` ancla la clase a medias: filtra por `page|layout` y por `function`, y hoy hay cinco archivos con `'use server'` inline fuera de ese filtro

`src/app/dashboard/server_actions_sin_closures.test.ts:38`, `:47`, `:85`

**Lo bueno primero, porque es real.** Esta prueba **sí** barre: `RAIZ =
join(process.cwd(), 'src/app')` y recorre el árbol entero, no una lista de rutas.
Su encabezado documenta dos falsos negativos que ya corrigió (el `lastIndexOf('{')`
que se rompía con template literals, y la ventana de caracteres que marcaba
`volverA` como acción). Corrí las dos pruebas: verdes. Es el patrón correcto y
merece decirse.

**Los dos huecos que quedan.** `:47` filtra `/^(page|layout)\.tsx$/`. Verifiqué
qué queda fuera: **cinco archivos de producción con `'use server';` inline** que
la prueba nunca abre —`dashboard/agentes/seccion-notificaciones.tsx:85,139`,
`dashboard/contador/estimulo-peaje.tsx:48`, `dashboard/inicio-contenido.tsx:227`,
`admin/vendedores/consola-vendedores.tsx:91,96,104,112,130,153,176`,
`vendedor/panel-vendedor.tsx:95,103`— quince acciones en total. Y `:85` solo
reconoce ayudantes declaradas como `^  function` / `^  async function`: un
`const guardia = () => …` a nivel de componente pasa invisible, que es la forma
más común de escribir una ayudante en TSX.

**Intento de refutación, honesto.** Busqué la instancia viva y **no la hay**:
ninguno de los cinco archivos declara una ayudante local en el cuerpo del
componente, y el único candidato de `const`-flecha que encontré
(`dashboard/politicas/page.tsx:74` `const deConcepto = …`) se usa en el JSX
(`:151`), **no** dentro de la acción (`:76-110`). Lo abrí y lo descarté. Por eso
esto es MEDIO: es el guardia, no un bug.

**Consecuencia.** El bug que esta prueba existe para no repetir costó, según su
propio encabezado, **204 errores en Sentry en nueve días sin que nadie los
relacionara con nada**, y el guardia que lo cierra tiene la forma exacta del
guardia anterior que falló: anclado por nombre de archivo. `etiquetas_sincronizadas.test.ts:34-42`
—en este mismo repo, en el delta anterior— explica por qué eso no basta: *«`gasto-semanal-chart.tsx`
nació el 16-ago por fuera del radar anterior»*. La lección está escrita en el
árbol y el guardia nuevo no la aplicó.

---

### [MEDIO] `procesarTurno`: 2,386 líneas en una función, quinta ronda seguida sin partirse · REINCIDENTE (c2, c3, c4, ronda 19)

`src/lib/likida/processor.ts:760-3145`

Medido por balanceo de llaves desde la declaración (`:760`) hasta su cierre
(`:3145`): **2,386 líneas**, en un archivo de 3,145. La serie es
2,153 → 2,157 → 2,369 → 2,370 → **2,386**: cinco rondas, ninguna a la baja. Sigue
saltándose `repo.ts` (`:128` `.from('viaje')`, `:132` `.from('posicion')`,
`:269` `.from('operador')`) y este delta le añadió el gancho de QA en tres sitios
(`:1035`, `:1171`, `:1249`) y el literal `montoImplausible` de `:1395`.

**Consecuencia.** Es el archivo más caro de cambiar del repo, está en el camino
del dinero, y cinco auditorías seguidas lo han medido creciendo.

---

### [MEDIO] Cuatro copias del predicado «los cinco datos fiscales» y tres espejos a mano de `ConceptoGasto`, sin un solo cambio · REINCIDENTE (c2, c3, c4, ronda 19)

`src/lib/saas/fiscal.ts:60` · `src/app/admin/flotas/page.tsx:35-37` ·
`src/lib/likida/administracion.ts:164-167` · `src/lib/likida/perfil/entrevista-aplicar.ts:138-144` ·
`src/lib/likida/contabilidad/catalogo.ts:27` · `src/app/dashboard/politicas/page.tsx:20` ·
`src/lib/likida/intake/ocr.ts:32`

Reabrí los cuatro y ninguno cambió. `entrevista-aplicar.ts:138` sigue preguntando
por **cuatro** campos, cableando `usoCfdi: 'G03'` en `:142` y contestando en
`:144` **«Los cinco datos del receptor CFDI 4.0 ya están en la flota (uso
G03)»**. Los tres espejos de `ConceptoGasto` siguen siendo listas `as const` /
`readonly ConceptoGasto[]`, que verifican pertenencia y no exhaustividad.

**El contraste, que es lo que hace que esto duela.** El delta añadió
`'renglones_ajenos'` a `TipoDiferencia` y **los tres mapas que lo consumen son
`Record<TipoDiferencia, …>` exhaustivos** (`cierre_aviso.ts:104`,
`rotulo-diferencia.ts:18`) o `Partial<Record<…>>` deliberado con función de
resolución (`por_diferencia.ts:27`, `:81`, `:118`): añadir un miembro **rompe
`tsc`** y por eso los tres se actualizaron solos. El mecanismo correcto existe,
está a tres archivos de distancia, y `ConceptoGasto` sigue sin él.

---

### [BAJO] `runtime_guards_imports.ts`: un archivo de producción de dos líneas cuya única razón de existir es un `await import()` de una prueba

`src/lib/llm/runtime_guards_imports.ts:1-2` · `src/lib/llm/runtime_guards.test.ts:13`

El archivo entero es:

```ts
export { executeTool, registerTool } from './tool-executor';
export { generateWithTools } from './openrouter';
```

`rg 'runtime_guards_imports' src/` devuelve **solo su definición y
`runtime_guards.test.ts:13`**. No lleva `.test.` en el nombre, así que cuenta como
producción para el conteo de este informe, para el bundler y para cualquier
detector de código muerto; y quien lo borre por muerto rompe una prueba sin
entender por qué. Dos `await import()` consecutivos en la prueba habrían hecho lo
mismo sin crear un módulo de producción.

---

### [BAJO] Código que la suite prueba y la aplicación no puede alcanzar · REINCIDENTE (c3, c4, ronda 19), ahora con dos entradas más

`src/lib/likida/facturacion/adaptadores/computer_use.ts` (sin importador) ·
`src/lib/likida/despacho_wa.ts:238`, `:362` · `src/lib/likida/asignar_wa.ts:298`, `:359` ·
`src/lib/likida/facturacion/avisar.ts:70`, `:98` · `src/lib/likida/facturacion/enrutar.ts:78` ·
`src/app/dashboard/viajes/libro.tsx:70` · `src/lib/llm/runtime-signal-shared.ts` (sin importador directo) ·
`src/lib/likida/cuadre/engine.ts:623-641` (`renglones_ajenos`, sin productor)

Los cuatro casos de la ronda pasada siguen idénticos —los verifiqué uno por uno—
y se suman dos del delta: el archivo «apto para cliente» que nadie importa
(MEDIO de los ciclos) y la rama de canasta mixta que ningún productor puede
alimentar (MEDIO del contrato `ocrExtra`). La lista crece cada ronda y no
encoge nunca; es el mismo mecanismo que hizo que la mayúscula del folio
sobreviviera a la corrección de la c4.

---

## Lo que revisé y está bien

- **El motor de dinero sigue puro, y lo verifiqué contra el delta.**
  `rg 'supabase|createClient|fetch\(|process\.env' src/lib/likida/cuadre/*.ts
  src/lib/likida/liquidacion/*.ts --glob '!*.test.*'` devuelve **cero** fuera de
  `desde_db.ts` (el adaptador declarado). `engine.ts` creció con el bloque de
  renglones y el del plazo impreso y no metió una sola llamada de I/O: lee de
  `input` y de `g.ocrExtra`, y devuelve `diferencias`. Era la pregunta directa de
  esta ronda y la respuesta es que sí.
- **Los mapas de `TipoDiferencia` son exhaustivos por el tipo, no por la
  disciplina.** `cierre_aviso.ts:104` y `rotulo-diferencia.ts:18` son
  `Record<TipoDiferencia, …>` completos; `rotulo-diferencia.ts:5-11` explica por
  escrito por qué NO es `Partial`. Añadir `'renglones_ajenos'` obligó a tocar los
  tres consumidores y `tsc` fue quien lo obligó. Es el ejemplo canónico del rubro
  resuelto con el mecanismo correcto.
- **No hay un solo ciclo de imports entre archivos.** Corrí Tarjan sobre el grafo
  completo de `src/` (resolviendo `@/` y relativos, ignorando pruebas):
  **0 componentes fuertemente conexos de tamaño > 1**. Fui a buscar el ciclo que
  el nombre `runtime_guards_imports.ts` sugería y no existe.
- **`budget.ts` y `tool-idempotency.ts` respetan `acotada()` en las seis
  consultas que hacen** (`budget.ts:95`, `:123`; `tool-idempotency.ts:37`), y
  `tool-idempotency.ts:13-17` deja escrito por qué la expiración la calcula
  PostgreSQL con `clock_timestamp()` y no la app. La disciplina está; lo que falta
  es el guardia (ALTO 3).
- **`qa-panel.test.ts:33-57` es una buena guardia, y de la clase correcta.**
  Barre `src/app/api/webhook` entero buscando `mediaDataUrlQA` y exige que
  `processor.ts` lo use **solo** como fallback con la forma literal
  `msg.mediaDataUrlQA ?? await downloadMediaAsDataUrl(msg.mediaId)` en exactamente
  tres sitios. Un gancho de pruebas dentro del tipo de producción es discutible,
  pero está acotado por un mecanismo, no por una promesa.
- **`legal/config.ts:44-66` es una decisión difícil bien escrita.** Separa lo que
  bloquea el build (identidad de la entidad) de lo que no (versiones de DPA/SLA),
  y documenta el incidente que lo motivó: un guardarraíl que también bloqueaba las
  **reparaciones** impidió revertir el cambio que había tumbado el OCR. Es
  exactamente el razonamiento de radio de explosión que este rubro pide.
- **`npx tsc --noEmit -p .` limpio.** `npm run lint`: **0 errores, 156
  warnings** (uno menos que la ronda pasada; todos
  `security/detect-non-literal-fs-filename` en pruebas más el `no-unused-vars` de
  `worker/llaves.test.ts:9`).
- **Las pruebas que cito, corridas:** `runtime_guards.test.ts`, `budget.test.ts`,
  `tool_idempotency.test.ts`, `acotada_guardiana.test.ts` (33 pruebas, 4 archivos,
  verdes) y `server_actions_sin_closures.test.ts` (2, verdes).

---

## Lo que NO alcancé a revisar

- **`npm test` completo.** Corrí el typecheck, el linter y 35 pruebas dirigidas.
  No puedo afirmar el estado de las ~2,900.
- **`0187_wa_evento_pendiente_leases_fencing.sql` (381 líneas) y
  `supabase/tests/wa_leases_fencing.sql` (259, pgTAP).** Es la superficie más
  grande del delta y es diseño puro —tres relojes: lease, reserva, outbox— pero
  vive en SQL y su verificación necesita una base. No la abrí; es terreno de datos
  y de agéntico.
- **`wa_pendientes.ts` (+150) por dentro.** Confirmé que sigue en la allowlist de
  `acotada` y que la prueba pasa; no leí la lógica del fencing.
- **`qa-motor.ts` (581 líneas) línea por línea.** Conté sus consultas y leí su
  encabezado, sus identidades sintéticas y su camino de borrado; no verifiqué que
  `exigirTenantZZZ` cubra las diecisiete.
- **Los 43 sitios de `src/` donde se lee `ocrExtra` con un `as Record<string,
  unknown>`.** Verifiqué el productor y los consumidores de las dos claves
  retiradas; no hice el barrido completo de «qué clave lee cada quién contra qué
  clave escribe cada quién», que es lo único que cerraría la clase del MEDIO del
  contrato.
- **El barrido de columnas que existen en la base y no en el tipo del dominio**
  (el patrón del `cfdi_orden`): sigue sin hacerse, ahora con 188 migraciones.
- **`erp.ts` (538 líneas) y `gps.ts` (524) por dentro**, y el `CATALOGO` de
  `perfil/preguntas.ts` contra `DatosOnboarding`. Heredados de la ronda anterior,
  sin cambios en el delta, sin tiempo esta vez.
