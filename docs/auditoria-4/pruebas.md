# Pruebas — auditoría 4

**Nota: 5/10** (antes 6). Razón del movimiento: **deuda que cobró factura**. La
ronda trajo material nuevo y bueno de verdad —CI contra Postgres real,
`verificaciones.sql` corriendo en cada push, `ratelimit_redis`, `pmf`,
`guardia`, el E2E de canal— pero **el gate está ROJO en la rama desde el merge
que abrió este pase**, la suite verde es estructuralmente ciega a ese rojo, la
cobertura BAJÓ (79.04 → 78.69) y **ninguno** de los seis huecos abiertos del
pase 3 se movió. Rompí 5 funciones a propósito en una copia fuera del repo:
**las 5 sobrevivieron la suite entera** (4,652 pruebas verdes).

**El riesgo mayor del rubro hoy:** desde el 16-ago a las 11:10 UTC el job
`verificar` de CI **aborta en el paso Typecheck** y por lo tanto
`npm run test:coverage`, las pruebas de tiempo y el build **no se ejecutan ni
una vez en esta rama** — el arnés existe y nadie lo está corriendo, y el
síntoma es exactamente el que `pruebas_en_ci.test.ts` fue escrito para impedir.

---

## Contexto de la corrida (compuertas REALES, corridas por mí)

| comando | resultado |
|---|---|
| `npx vitest run` | **348 archivos · 4,652 pruebas · 1 saltada · exit 0** (68.9 s) |
| `npm run test:coverage` | **348 archivos · 4,650 pasadas · 3 saltadas · exit 0** (97.6 s) |
| `npx eslint src/` | **exit 0** (0 errores) |
| `npx tsc --noEmit -p .` | **exit 1 — ROJO** (ver CRÍTICO-1) |

Cobertura medida hoy, contra el umbral de `vitest.config.ts:116-121`:

| | medido | umbral | margen |
|---|---|---|---|
| Statements | **78.69%** (22,940/29,151) | 78 | **+0.69** |
| Branches | **85.10%** (8,088/9,503) | 84 | +1.10 |
| Functions | **84.24%** (1,155/1,371) | 84 | **+0.24** |
| Lines | **78.69%** | 78 | +0.69 |

El pase 3 midió **79.04%**. Con ~2,000 líneas nuevas de agentes encima, el
número **bajó 0.35 puntos**: el código nuevo entró por debajo del promedio del
repo. Functions queda a **0.24 puntos** del rojo (≈3 funciones).

Las mutaciones se corrieron sobre una **copia del árbol fuera del repo**
(`tar` a scratchpad + symlink a `node_modules`), nunca sobre `/home/user/cuadra`.
`git status` al cierre solo muestra los reportes de los otros auditores.

---

## Hallazgos

### [CRÍTICO] El gate lleva rojo desde el merge, y la suite verde no lo puede ver
`src/lib/likida/migraciones_verificadas.test.ts:53` y `:61`

Hay **dos migraciones numeradas 0112** (`0112_agregados_rpc.sql` y
`0112_config_llave_agentes.sql`), y el mapa `EXENTAS` de esta prueba las indexa
por el prefijo de 4 caracteres. El resultado es una **clave `'0112'` duplicada
en un object literal**: la de `:53` llegó de master (`296224d`), la de `:61` de
esta rama (`285d5e3`), y el merge `f72d7ab` las juntó sin conflicto.

```
$ npx tsc --noEmit -p .
src/lib/likida/migraciones_verificadas.test.ts(61,3): error TS1117:
  An object literal cannot have multiple properties with the same name.
EXIT=1
```

Escenario, ya ocurrido en producción de CI (no hipotético). Log real del job
`verificar`, run **31943828035** (`a77751b9`), y el mismo en **31943630227**
(`41680e7b`):

```
##[group]Run npm run typecheck
> tsc --noEmit
##[error]src/lib/likida/migraciones_verificadas.test.ts(61,3): error TS1117: ...
##[error]Process completed with exit code 2.
```

`ci.yml:63` (Typecheck) va **antes** de `ci.yml:81` (`npm run test:coverage`),
`ci.yml:89` (pruebas de tiempo) y `ci.yml:95` (build). Con el step 3 en rojo,
los tres de abajo **no corren**. Verificado contra la API de Actions: los
últimos cuatro runs de `CI` en `claude/auditoria-3` son `failure`; en `master`
son `success`.

Y la parte que lo hace de mi rubro y no del de nadie más: **`npx vitest run`
sale verde igual**, incluida la propia prueba dueña del archivo
(`it('ninguna se queda sin decisión')`), porque JavaScript resuelve la clave
duplicada tomando la última en silencio. La red que existe para que ninguna
migración se quede sin decisión **le dio la exención de `0112_agregados_rpc` a
un texto escrito sobre otra migración distinta**, y su propia assertion no lo
puede notar. `eslint src/` tampoco: `no-dupe-keys` no está activa en el flat
config (`eslint.config.mjs` = next/core-web-vitals + next/typescript, exit 0
con la clave duplicada presente).

Consecuencia: cualquiera que mire GitHub verá el check rojo y asumirá "algo del
código"; cualquiera que corra `npm test` en su máquina verá verde y asumirá
"CI se equivoca". Mientras tanto **nadie ha corrido la puerta de cobertura ni
el build sobre este pase**, que es el pase con 9 migraciones y dos subsistemas
nuevos.

Causa raíz probable: un mapa de exenciones indexado por el número de migración
cuando el número dejó de ser único, más una regla de lint apagada que convierte
el duplicado en un error de `tsc` en vez de en un error de lint que se vería al
escribirlo.

> **Estado al cierre de este reporte (16-ago, 11:35 UTC):** mientras escribía,
> el orquestador renombró `0112_config_llave_agentes.sql` → `0121_…` y ajustó
> el mapa; `npx tsc --noEmit -p .` vuelve a dar **exit 0**. El hallazgo queda
> escrito porque lo que lo permitió sigue en pie: la suite verde no puede ver
> un `tsc` rojo, `no-dupe-keys` sigue apagada, y la red de migraciones sigue
> indexando por un número que dejó de ser único.

---

### [ALTO] `wa_pendientes.ts` al 2.9%: el buffer durable del apagado no tiene una sola prueba que lo ejecute
`src/lib/likida/wa_pendientes.ts:41` (el insert) y `:87-94` (`reclamarPendiente`)

Medido: **70 sentencias, 2.9%**. Es el módulo entero del P1 externo del 16-ago
("apagado ya no descarta: guarda"). Las dos pruebas que *hablan* de él lo
**mockean**: `src/app/api/webhook/whatsapp/apagado.test.ts:41-43` y
`src/app/api/cron/wa-pendientes/route.test.ts:33-39` sustituyen el módulo
completo. Nadie ejerce el original.

Escenario (**corrido**, no razonado). En la copia fuera del repo:

```diff
- const { error } = await supabaseAdmin().from('wa_evento_pendiente').insert({ id, evento: m });
+ const error = null as null | { code?: string; message: string }; // ya no escribe nada
```
```diff
    .update({ intentos: intentosLeidos + 1 })
    .eq('id', id)
-   .eq('intentos', intentosLeidos)
-   .is('procesado_en', null)
```

Salida real (con las otras cuatro mutaciones de abajo en el mismo árbol):

```
 Test Files  348 passed (348)
      Tests  4652 passed | 1 skipped (4653)
```

**El buffer durable no guarda nada y el claim pierde su ancla, y las 4,652
pruebas siguen verdes.** Ni `apagado.test.ts`
(`it('con el sistema APAGADO … TODOS quedan GUARDADOS')`) ni
`route.test.ts` (`it('encendido: reclama, procesa por el motor y sella cada
evento')`) se mueven: los dos afirman contra su propio doble.

Consecuencia: Javier baja la palanca `global` con un incidente en curso. Un
chofer manda sus 12 fotos del viaje. El webhook contesta 200 —que desde la 0119
significa "recibido y guardado"—, `wa.entrante_apagado` loguea
`guardados: 12, fallidos: 0`, y no hay una sola fila. Meta no reintenta lo
acusado. El viaje se cuadra sin esos comprobantes y el contralor liquida contra
un anticipo que nadie comprobó. El segundo pedazo (el ancla del claim) es la
otra mitad: dos corridas del cron solapadas reprocesan el mismo evento y el
único que lo frena es `claimMessage` aguas abajo, que tampoco se ejerce aquí.

Causa raíz probable: la decisión —correcta para probar a los llamadores— de
mockear el módulo en sus dos consumidores dejó al módulo sin ningún llamador
real, y no se escribió su prueba propia.

---

### [ALTO] REINCIDENTE (4ª ronda) · PR-C1 sin cambio: `enLotes` sigue verde contra el bucle serial
`src/lib/likida/lotes.test.ts:13`

La assertion sigue siendo de un solo lado, textual:
`expect(pico).toBeLessThanOrEqual(3)`. Un lote serial tiene `pico = 1`.

Escenario (**corrido**). Reemplacé el cuerpo de `enLotes`
(`src/lib/likida/lotes.ts:21-32`) por el bucle serial que REND-C1 existe para
eliminar, y corrí no solo su archivo sino todo lo que lo consume:

```
$ npx vitest run src/lib/likida/lotes.test.ts
 Tests  3 passed (3)

$ npx vitest run consolidado desglose lotes
 Test Files  8 passed (8)
      Tests  94 passed (94)
```

**94 pruebas verdes contra el bug original**, incluidas las de los tres
consumidores de escritura de dinero (`intake/consolidado.ts:337`,
`intake/desglose_peaje.ts:564` y `:711`).

Consecuencia: la misma del pase 3 y del pase 2 — si alguien revierte a serial,
1,000 líneas de peaje ≈ 300 s contra `maxDuration=120s`, el cron muere con la
conciliación a medio aplicar, y el contralor cruza contra su ERP un desglose
incompleto que nadie declaró incompleto. Sigue siendo *regresión habilitada*,
no dinero mal hoy — por eso ALTO y no CRÍTICO, igual que la ronda pasada.

Causa raíz probable: la assertion mide un techo (`≤ N`) donde el invariante es
un piso (`== min(N, pendientes)`).

---

### [ALTO] El camino de ACCIÓN del copiloto —el único agente que cruza tenants— no tiene una sola prueba
`src/lib/agents/copiloto.ts:73` (el guard del catálogo) y `:275` (la anexión de
la previsualización); `src/lib/agents/copiloto.test.ts:8-11`

El encabezado de `copiloto.test.ts` declara **dos** garantías: la guardia de
cifras y *"la acción propuesta sobrevive con su previsualización DEL CATÁLOGO
(no del modelo) anexada al final de los bloques"*. El archivo solo tiene el
`describe('la guardia de cifras en el camino del copiloto')`. La segunda no
existe. Confirmado por grep en todo `src/`: **ningún test menciona
`proponer_accion` ni `entregar_respuesta_admin`** — `copiloto.test.ts` mockea
`generateWithTools` entero (`:24-36`), así que el `toolExecutor` nunca corre y
los dos handlers registrados en `copiloto.ts:52-141` no se ejecutan jamás.

Escenario (**corrido**, en la misma corrida de 4,652 verdes):

```diff
- const cat = accionDelCatalogo(String(a.accion ?? ''));
- if (!cat) return { ok: false, error: 'esa acción no está en el catálogo' };
+ const cat = accionDelCatalogo(String(a.accion ?? '')) ?? CATALOGO_ACCIONES[0];
```
```diff
- const finales: BloqueCopiloto[] = accion ? [...bloques, accion] : bloques;
+ const finales: BloqueCopiloto[] = bloques;
```

Suite verde. Con la primera, **cualquier string que el modelo invente cae en el
primer elemento del catálogo — que es `apagar_agente`, la única implementada**:
el modelo pide `borrar_todo` y a Javier le sale la previsualización de apagar un
agente con botón de confirmar. Con la segunda, la previsualización desaparece
en silencio y el copiloto queda mudo justo en lo que Javier fue a hacer.

Consecuencia: el único agente cuyo alcance cruza TODOS los tenants tiene su
mitad de escritura (proponer → confirmar → ejecutar) apoyada en
`copiloto-acciones.test.ts` (que sí es buena, 97.2%) y **nada** en la costura
que la conecta con el modelo. `copiloto-tools.ts` cuenta la misma historia al
56.6%: sus **11 tools cross-tenant** están registradas y ningún handler se
ejerce.

Causa raíz probable: mockear `generateWithTools` prueba al orquestador y apaga
el executor; el catálogo y la anexión solo viven ahí.

---

### [ALTO] El escaneo de aislamiento no mira `src/app/**`, donde hay 43 consultas con `supabaseAdmin` — 20 archivos de ellas en el panel del CLIENTE
`supabase/pruebas-aislamiento/consultas_admin_filtran_tenant.test.ts:51` y `:244`

`const DIR_LIB = 'src/lib'` y `fuentesDeProduccion(DIR_LIB)`. La cabecera lo
declara como límite y lo justifica así (`:37-40`): *"Solo mira `src/lib/**`.
Una consulta armada dentro de `src/app/**` (**poco común en este repo** — la
convención es que las páginas llamen a funciones de `lib/`, nunca arman su
propio `.from()`)"*. **Eso no es cierto hoy**: 26 archivos de producción bajo
`src/app/**` importan `supabaseAdmin` y suman **43 llamadas `.from(`**, de las
cuales 20 archivos están bajo `src/app/dashboard/**` — el panel del cliente,
que es exactamente donde un filtro perdido es una fuga entre flotas y no una
consulta de superadmin.

Escenario (**corrido**, misma corrida de 4,652 verdes):

```diff
  supabaseAdmin().from('cliente').select('id, nombre')
-   .eq('tenant_id', tenantId).eq('activo', true).order('nombre')
+   .eq('activo', true).order('nombre')
```
(`src/app/dashboard/despacho/page.tsx:61-62`)

La prueba `it('ninguna consulta se queda sin el filtro ni sin una exención con
razón')` **ni se entera**. Consecuencia: el selector de clientes de la pantalla
de despacho de la Flota A le ofrece al despachador la cartera completa de la
Flota B, con nombre y razón social, y el viaje se crea contra un cliente ajeno.

El precedente está en el mismo repo y en contra: los otros tres escaneos
estructurales (`embeds_con_alias.test.ts:75`, `politica_un_origen.test.ts:32`,
`dominio_propio.test.ts:37`) usan `fuentesDeProduccion('src')` — el árbol
entero. El de aislamiento es el único que se recortó, y es el que más superficie
protege.

Causa raíz probable: el escaneo se dimensionó sobre una convención que el repo
ya no cumple, y la convención se dio por buena sin contarla.

---

### [MEDIO] El ALLOWLIST del mismo escaneo exime por ARCHIVO aunque su propio comentario diga `archivo:tabla`
`supabase/pruebas-aislamiento/consultas_admin_filtran_tenant.test.ts:222-223` y `:270`

El comentario dice, textual: *"Cada entrada es `archivo:tabla` o
`archivo:tabla:snippet` cuando una tabla se toca más de una vez en el mismo
archivo con destinos distintos"*. Las 11 claves reales son rutas de archivo a
secas, y la comprobación es `if (ALLOWLIST[archivo]) continue;` — **exención en
blanco para todas las consultas presentes y futuras de ese archivo**.

Escenario (**corrido**, misma corrida verde). `src/lib/saas/suscripcion.ts` está
exento por una razón escrita **solo** sobre `aplicarSuscripcion` (líneas
322-383). Le quité el filtro a otra función del mismo archivo, `getUso`, que es
la que **mide el consumo para facturar**:

```diff
  admin.from('viaje').select('id', { count: 'exact', head: true })
-   .eq('tenant_id', tenantId).gte('created_at', inicioMes),
+   .gte('created_at', inicioMes),
```
(`src/lib/saas/suscripcion.ts:188-189`)

Verde. Consecuencia: a cada flota se le cobra el volumen de **toda la
plataforma**; el medidor de consumo del SaaS deja de ser del cliente y nadie lo
nota hasta la primera factura disputada. Las otras diez exenciones cargan el
mismo cheque en blanco — `agentes/cola.ts` e `interruptores.ts` incluidas.

Causa raíz probable: la granularidad se documentó y no se implementó; el
`Record<string,string>` quedó indexado por archivo.

---

### [MEDIO] El kill switch de peajes: el helper está probado, los cuatro puntos donde DETIENE no
`src/app/dashboard/agentes/peajes/apagado.test.ts:29-46` × `src/app/dashboard/agentes/peajes/page.tsx:90-91`, `:127-128`, `:174-175`, `:207-208`

`apagado.test.ts` es correcto y prueba lo suyo (incluido el fail-closed real,
con `interruptores` sin mockear). Pero `avisoAgentePeajesApagado()` solo
devuelve un string: quien **detiene** son los cuatro `if (apagado) return
{ error: apagado };` de las server actions, en un `.tsx` sin prueba y fuera del
denominador de cobertura.

Escenario (**corrido**, misma corrida verde): borré los **cuatro** `if`. Las
4,652 pruebas siguen verdes, incluidas las tres de `apagado.test.ts`. Con la
palanca abajo, subir el consolidado, importar el desglose, re-conciliar y el
barrido `por_conciliar` **siguen corriendo**: la conciliación de peaje que
Javier apagó por un incidente sigue escribiendo líneas de dinero.

Es el mismo patrón que el ALTO del pase 3 (`evaluarAbono` probado,
`registrarPago` no), reaparecido en la superficie nueva. De los 13 call sites
del kill switch, estos cuatro son los únicos sin ancla —los otros nueve sí la
tienen (`route_cableado`, `boton_apretado`, `route_pool`, `route_caption`,
`cron/{escalar,facturar,purgar,wa-pendientes}`, `tools_apagado`).

Causa raíz probable: el punto único se extrajo a `apagado.ts` para poder
probarlo, y la extracción movió lo probable fuera de donde vive la decisión.

---

### [MEDIO] Los seis huecos abiertos del pase 3 siguen abiertos, sin una línea de movimiento
Medido hoy con `npm run test:coverage`, archivo por archivo:

| módulo | pase 3 | **hoy** | estado |
|---|---|---|---|
| `src/lib/likida/comercial.ts` (229 sent.) | 0.5% | **1.3%** | ALTO abierto |
| `src/app/api/export/liquidaciones/route.ts` (43) | 0.0% | **0.0%** | ALTO abierto |
| `src/app/api/export/pdf/[id]/route.ts` (150) | 0.0% | **0.0%** | ALTO abierto |
| `src/app/api/export/facturas-proveedor/route.ts` (62) | 0.0% | **0.0%** | ALTO abierto |
| `src/app/api/export/bitacora-peaje/route.ts` (40) | 0.0% | **0.0%** | ALTO abierto |
| `src/lib/saas/stripe.ts` (175) | 22.3% | **22.3%** | ALTO abierto |
| `src/lib/likida/facturacion_escritura.ts` (283) | — | **31.8%** | ALTO abierto |
| `src/app/api/v1/viajes/[id]/contribucion/route.ts` (108) | 0.0% | **0.0%** | MEDIO abierto |
| `src/app/api/v1/viajes/[id]/route.ts` (89) | 0.0% | **0.0%** | MEDIO abierto |
| `src/app/api/v1/clientes/route.ts` (45) | 0.0% | **0.0%** | MEDIO abierto |
| `src/lib/correo/enviar.ts` (63) | 4.8% | **4.8%** | MEDIO abierto |
| `src/app/api/cron/facturar/cola/route.ts` (54) | 0.0% | **0.0%** | MEDIO abierto |
| `src/lib/admin/corridas-cruzadas.ts` (71) | 0.0% | **2.8%** | MEDIO abierto |
| `src/lib/admin/bitacora.ts` (28) | 0.0% | **3.6%** | MEDIO abierto |

Verifiqué que las líneas citadas siguen existiendo y siguen sin arnés:
`comercial.ts:158` (`contribucion: round2(ingreso - costoComprobado)`),
`comercial.ts:233` (`porCobrar`), `stripe.ts:164` (`/ 100`),
`facturacion_escritura.ts:404` (`if (abono.rechazo) throw`),
`export/liquidaciones/route.ts:54` (`puedeVerArea(t.rol, 'dinero')`),
`v1/viajes/[id]/contribucion/route.ts:73` (`abrir(req, 'dinero')`).

Consecuencia: el diagnóstico del pase 3 —"el arnés protege el *cálculo* del
dinero y no protege la puerta ni la salida"— sigue siendo cierto palabra por
palabra un pase después. No es hallazgo nuevo; es que el conteo de pruebas
subió 152 (4,500 → 4,652) y **ninguna** cayó en estas zonas.

Causa raíz probable: las pruebas nuevas siguieron al código nuevo, y el código
nuevo no pasó por aquí.

---

### [MEDIO] El trinquete de cobertura se acercó al rojo mientras entraba el código nuevo
`vitest.config.ts:116-121`

79.04% → **78.69%** de statements contra un umbral de 78: **0.69 puntos** de
margen, la mitad del que dejó el pase 3. Functions queda a **0.24 puntos**
(84.24 vs 84), que es la holgura que el propio comentario del config declaró
apretada a propósito (`:113-115`: *"su margen queda apretado (0.25) a
propósito: la siguiente rama sin cubrir debe doler"*).

Escenario: el trinquete funcionó como se diseñó —dolió— pero nadie lo vio,
porque el paso que lo evalúa **no se ha ejecutado en esta rama** (CRÍTICO-1). La
próxima función sin cubrir tira la puerta, y hoy no hay quien avise.

Consecuencia: deuda con fecha. Y una lectura equivocada esperando: "78.69%" no
habla de `src/app/**/*.tsx`, que sigue excluido del denominador —correctamente
y con su medición escrita— pero cuya cifra real sigue cerca de cero. El BAJO-2
del pase 3 sigue vigente sin cambios.

---

### [BAJO] Un `it` que afirma sobre la función real y solo mira su doble
`src/lib/agents/copiloto-acciones.test.ts:58`

El nombre dice *"el motivo vacío VIAJA a apagar() — **quien lo rebota es la
función real, no una copia de su regla**"*, y la línea siguiente es
`apagar.mockRejectedValueOnce(new DatoInvalido('Apagar exige un motivo.'))`:
la prueba **programa** el rechazo que después afirma. Si `apagar()` real dejara
de exigir motivo, este `it` seguiría verde.

No es decoración en efecto —la garantía sí está anclada en
`src/lib/likida/interruptores.test.ts:138` (`it('sin motivo NO escribe nada…')`)—
pero el nombre reclama una demostración que este archivo no hace, y el lector
que audite mañana la va a dar por hecha aquí.

---

### [BAJO] La red `pruebas_en_ci` solo recorre `src`, y el lint solo mira `src/`
`src/lib/likida/pruebas_en_ci.test.ts:46` (`recorrer('src')`) · `package.json` (`"lint": "eslint src/"`)

Dos huecos pequeños de la misma forma. El detector de `skipIf(LIKIDA_COBERTURA)`
recorre solo `src`: un salto puesto en `supabase/pruebas-aislamiento/*.test.ts`
—296 líneas de TypeScript que **sí** corren en la suite— sería invisible a la
red que existe para que ninguna prueba se pierda. Y `eslint src/` no toca ese
mismo archivo (además de que `eslint.config.mjs:19` ignora `supabase/**`), así
que el único código TS del repo que vive fuera de `src/` entra a la suite sin
pasar por lint. `tsc` sí lo cubre (`tsconfig.json` incluye `**/*.ts`).

---

## Pruebas que resultaron decoración

Rompí **5 funciones** de verdad, en una copia del árbol fuera del repo. Estas
son las corridas, con su salida literal:

| # | Qué rompí | `archivo:línea` | Resultado |
|---|---|---|---|
| 1 | `enLotes` → bucle serial | `lib/likida/lotes.ts:21-32` | `lotes.test.ts` **3 passed**; `consolidado desglose lotes` **94 passed (94)** |
| 2 | `guardarEventosPendientes` no escribe + `reclamarPendiente` sin ancla | `lib/likida/wa_pendientes.ts:41`, `:87-94` | suite entera **4,652 passed** |
| 3 | `proponer_accion` acepta cualquier acción + la previsualización no se anexa | `lib/agents/copiloto.ts:72-73`, `:275` | ídem, verde |
| 4 | los 4 `if (apagado) return` del agente de peajes | `app/dashboard/agentes/peajes/page.tsx:91,128,175,208` | ídem, verde |
| 5 | filtro de tenant fuera en el panel del cliente y en `getUso` (facturación) | `app/dashboard/despacho/page.tsx:62`, `lib/saas/suscripcion.ts:189` | ídem, verde |

Salida real de la corrida con 2–5 aplicadas a la vez:

```
 Test Files  348 passed (348)
      Tests  4652 passed | 1 skipped (4653)
   Duration  64.55s
```

`npx tsc --noEmit -p .` sobre ese mismo árbol mutado da **el mismo y único
error** que da el árbol limpio (el TS1117 del CRÍTICO-1): ninguna de las cinco
mutaciones la toca. `npx eslint src/` da **0 errores**, 5 warnings de variable
sin usar. O sea: las cinco pasan la compuerta completa.

---

## Lo que revisé y está bien

- **CI contra Postgres real, y VERDE en esta rama.** `.github/workflows/ci-postgres.yml`
  (163 líneas) levanta `postgres:16` como service container, aplica el andamio
  (`supabase/pruebas-aislamiento/andamio_ci.sql`, 180 líneas: roles, `auth.uid()`,
  storage mínimo), corre **las 121 migraciones una por una sobre base virgen**
  (`:126-137`, una por una a propósito para que el fallo señale cuál), y después
  las dos capas de ataque. Verificado contra la API de Actions: los runs de
  `CI Postgres` sobre `41680e7b` y `a77751b9` salen **success** mientras el `CI`
  normal sale failure. Es la pieza más fuerte que le ha entrado a este rubro en
  cuatro rondas: `verificaciones.sql` llevaba ~88 bloques que se pegaban a mano
  "cuando alguien se acordaba", y la primera corrida automática encontró 4
  bloques rotos desde hacía semanas (`06583c7` lo confirma en su asunto).
- **La trampa del exit code, cazada antes de publicarse.** `ci-postgres.yml:150-163`
  documenta y evita el `{ echo …; node …; echo … } | tee` que habría dejado el
  step en verde con la batería reprobando, leyendo `${PIPESTATUS[0]}` explícito.
  Es exactamente la clase de detalle que separa una puerta de un adorno.
- **`supabase/verificaciones.sql` creció con la superficie nueva y en el sitio
  correcto**: 4,845 líneas, **85 bloques titulados** hasta el 94, con bloques
  propios para *cada* migración nueva que crea una garantía de base — 89 (los 4
  agregados de la 0112: existen, INVOKER, **aislados**, y cuadran), 90 (la
  descarga del PDF de la 0114 no se pisa), 91 (0116), 92 (la cola de aprobación
  de la 0117 impone el estado desde la BASE), 93 (dedup por PK y deny-all de la
  0119) y 94 (el snapshot del actor de la 0120).
- **`src/lib/likida/pmf.test.ts` (161 líneas) es el mejor archivo nuevo de la
  ronda**, y `pmf.ts` sale al **100%**. Prueba las tres reglas duras por
  separado, incluida la que CLAUDE.md pone primero: `it('una flota sin
  liquidaciones … las TRES señales salen sin medir')` afirma además
  `expect('porCliente' in s.descargas).toBe(false)` — o sea que el llamador
  *no puede* pintar un 0%. Y el fail-closed va en dos sabores: error por valor
  (`:115`) y `count` nulo **sin** error (`:122`).
- **`src/lib/admin/guardia.test.ts`** (91.7%): función pura con el reloj
  inyectado (`AHORA = Date.parse(...)`), la matriz del runbook caso por caso, y
  el límite declarado como assertion (`it('el límite se DECLARA: S1 no se
  deriva de la bandeja')`). Cero dependencia de la hora de la corrida.
- **`src/lib/ratelimit_redis.test.ts`** (237 líneas; `ratelimit.ts` al **100%**).
  El doble de Upstash no interpreta el Lua y **lo dice** (`:32-37`); la prueba
  que importa —`it('20 llamadas concurrentes a la misma llave con límite 5:
  exactamente 5 pasan')`— afirma `=== 5`, no `≤ 5`, que es justo la dirección
  que a `lotes.test.ts` le falta. Y cubre las cinco averías, incluida
  `RATELIMIT_REDIS_FALLA_CERRADO` y el caso `'TRUE'` en mayúsculas.
- **`canal_e2e.test.ts` (237 líneas) es un E2E de verdad**, no un mock
  encadenado: HMAC real de Meta, `estaApagado` **real** contra el builder
  (`:104-109`), el motor de cuadre real, **bytes reales de pdf-lib** en dos
  ejemplares (`:210`), y el sobre saliente al número normalizado. La prueba de
  la puerta (`it('sin firma válida, NADA corre')`) verifica `subidos.size === 0`,
  no solo el status.
- **`agentes/cola.test.ts` (255 líneas)** es sólido donde importa: el UPDATE
  anclado a `estado='pendiente'` (`:95`), el claim del envío anclado a
  (aprobada ∧ no enviada) con el segundo click tocando cero filas (`:165`), la
  **compensación** cuando Resend rechaza (`:201`), y las dos de la guardia de
  cadencia — incluida `it('si el historial NO SE PUEDE leer, no se manda')`,
  que es fallar cerrado probado y no asumido.
- **`tools_apagado.test.ts`** usa el `interruptores` **real** a propósito
  (`:8-12`) y prueba el fail-closed de la LECTURA, no solo el de la fila
  apagada. Lo mismo `peajes/apagado.test.ts:41`. Es la diferencia entre probar
  la palanca y probar el contrato.
- **`api/admin/copiloto/route.test.ts`**: 401 sin cuerpo, 403 para `flota_admin`,
  el rechazo **en el servidor** sin `confirmado: true`, y —la que vale— `it('…
  corre con el userId DE LA SESIÓN')` mandando `userId: 'u-atacante'` en el
  cuerpo y afirmando que llega `'u-javier'`.
- **`consultas_admin_filtran_tenant.test.ts` se autoprotege bien**, aparte de
  los dos huecos que reporto: `it('encontró archivos que importan supabaseAdmin
  (si no, el escaneo no está mirando nada)')` y `it('la lista de tablas con
  tenant_id salió de las migraciones')` impiden que pase por vacía, y la lista
  de tablas se deriva de `supabase/migrations/*.sql` en cada corrida en vez de
  ser una constante que se pudre. Sus límites están escritos con honestidad
  (`:30-48`), incluido que "menciona `tenant_id`" ≠ "filtra bien".
- **`pruebas_en_ci.test.ts` sigue viva y sigue siendo necesaria**: las cinco
  `it` verifican que cada `skipIf(LIKIDA_COBERTURA)` esté cubierto por el paso
  `npx vitest run fundamento duplicados`, que el config exporte **la misma**
  bandera (el bug PR-A2), y que el paso de umbral no se sustituya por un
  `npm test` a secas. Se autoprotege con `expect(saltadas.length).toBeGreaterThan(0)`.
- **`pagina_playwright.test.ts`** (el candidato a flakear que el pase 3 dejó
  pendiente): revisado. Sus assertions de reloj son de **dos lados**
  (`:556-557`: `ms < 4_000` **y** `ms >= 700` sobre un tope de 800 ms), corre
  contra un portal HTTP local —sin red ni gasto— y pasó las dos corridas de hoy.
  No lo declaro intermitente; sí es el archivo más caro en reloj de pared.
- **`pruebas-manuales/`** sigue bien separado: `vitest.manual.config.ts` con su
  propio `include` y `fileParallelism: false`, fuera del include de la suite.
  **No los corrí.** `vitest.audit.config.ts` igual, para `scripts/auditoria/**`.

---

## Lo que NO alcancé a revisar

- **No corrí `ci-postgres.yml` en local** (no hay Docker ni `psql` en este
  contenedor). Verifiqué que pasa leyendo el resultado real de GitHub Actions
  sobre los dos últimos commits de la rama, no ejecutándolo. Tampoco leí los 358
  líneas de `scripts/ci/correr-verificaciones.mjs` a fondo: solo confirmé el
  manejo del exit code que el workflow documenta.
- **`processor.ts` al 83.0% (1,073 sentencias)** e **`intake/desglose_peaje.ts`
  al 46.3% (640)** — los dos módulos grandes que el pase 3 tampoco alcanzó. No
  hice mutación dirigida sobre sus ramas descubiertas. `desglose_peaje` es
  además consumidor de `enLotes`.
- **`copiloto-tools.ts` al 56.6%**: identifiqué que sus 11 handlers no se
  ejercen, pero no muté ninguno para medir la consecuencia tool por tool.
- **`analytics.ts` al 77.9% (919 sentencias)** tras la reescritura por RPC de la
  0112: no verifiqué qué ramas nuevas quedaron fuera ni muté `getSerieComparativa`.
- **Las cuatro rutas de export y las tres de `/v1` de lectura** (0.0%): las
  confirmé por medición y por línea, pero no repetí las mutaciones del pase 3
  sobre ellas — su diagnóstico se sostiene sin repetirlas.
- **`src/app/**/*.tsx`**: la categoría excluida de la medición. `.test.tsx`
  existen (`avance-cierre`, `tablero-operacion`, `dinero_por_area`) y corren,
  pero no conté cuántas vistas quedan sin ninguna.
