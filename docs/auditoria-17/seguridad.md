# Seguridad — auditoría 17 · pase 4 (11-ago-2026)

**Nota: 6/10** (antes 6). Razón del movimiento: **ninguna de las tres — se
sostiene**, y eso se explica, no se asume. Dos fuerzas se cancelaron. A favor:
35 páginas borradas retiran 23 pantallas de `dinero`/`operacion` de la
superficie, y la reescritura de `visibilidad.ts` —el disparador de este
relanzamiento— resultó **estrictamente restrictiva**, verificada entrada por
entrada. En contra: nada estructural se movió (las policies de la 0086 son
byte-idénticas, `sharp` sigue en 0.34.5, `/admin` sigue con una sola puerta), y
el borrado dejó **un guardarraíl escrito que no es cierto** y **un server action
sin la segunda comprobación** que su archivo hermano documenta como obligatoria.
Nada de esto llega a "camino sin autenticar a datos de un tenant" (eso sería ≤4),
y nada llega a "dos capas en toda ruta privilegiada" (eso sería 8+).

**El riesgo mayor del rubro, hoy — sin cambio desde el pase 2:** el jefe de
tráfico (`encargado`) y el contador tienen, por RLS, lectura **y escritura**
completas sobre las 19 tablas de negocio de su flota —incluidas `gasto`,
`liquidacion`, `operador` y `wa_conversacion`—, y la separación que el producto
vende ("el encargado despacha, no factura"; "el contador es de solo lectura")
vive únicamente en TypeScript. Borrar 35 páginas achicó la ventana de la casa;
no tocó la puerta de atrás.

---

## `visibilidad.ts` reescrita: el veredicto

**No ensanchó nada. Ningún rol llega hoy a una ruta a la que no llegara antes.**
Lo verifiqué contra `git show 20ecbb1:src/lib/auth/visibilidad.ts`, pieza por
pieza. El diff son 61 líneas tocadas, pero son **dos** cambios semánticos y
**tres** invariantes que no se movieron un carácter:

| Pieza | Antes (`20ecbb1`) | Hoy (`0f6ebce`) | ¿Ensancha? |
|---|---|---|---|
| `AREAS_POR_ROL` | `superadmin`/`flota_admin` = 3 áreas, `encargado` = `['operacion']`, `contador` = `['dinero']` | **idéntico** (`visibilidad.ts:36-45`) | No — no se tocó |
| `PREVISUALIZABLES` | `{flota_admin, encargado, contador}` | **idéntico** (`:128`) | No |
| `rolEfectivo` | solo-quita, solo si `rolReal === 'superadmin'` | **idéntico** (`:146-150`) | No |
| `PANEL_PROPIO` | `{}` | **idéntico** (`:118`) | No |
| `AREA_POR_RUTA` | **30 entradas** | **8 entradas** (`:75-92`) | **No: solo se BORRARON entradas.** Ninguna clave cambió de área, ninguna clave nueva. `puedeVerRuta` (`:98-101`) niega por default (`area !== undefined`), así que quitar una entrada solo puede **quitar** acceso |
| `inicioDe(contador)` | `/dashboard/contador` | `/dashboard/suscripcion` (`:169`) | **No.** `/dashboard/suscripcion` ya estaba mapeada a `dinero` **en la versión vieja** (línea 106 del archivo de `20ecbb1`), y `contador` ya tenía `dinero`. El aterrizaje se movió a una pantalla que ese rol **ya podía abrir tecleando la URL** |

Las 22 entradas que salieron son exactamente las 17 de "dueño de flota" + las 6
del panel del contador − `/dashboard/chat` contado dos veces en la lista del
commit; ninguna de esas 22 rutas tiene ya un `page.tsx`. Comprobé el
complemento, que es donde estaría el agujero: **las 9 páginas que hoy existen
bajo `/dashboard` están todas clasificadas o gateadas a mano.**

```
existentes:  /dashboard  /dashboard/[id]  arco  combustible-casetas
             configuracion  politicas  soporte  suscripcion  usuarios
en el mapa:  /dashboard  arco  soporte  combustible-casetas  suscripcion
             usuarios  politicas  configuracion            (8/8 estáticas)
[id]:        gateada a mano con puedeVerArea(rol,'dinero')  ([id]/page.tsx:53)
```

Y las 8 pasan por `resolverTenantEfectivo` (o `exigirVerRuta` en `soporte`), que
es quien aplica `puedeVerRuta` (`tenant-efectivo.ts:105-107`). **Cero rutas
huérfanas de matcher.** `RUTAS_CON_SESION` (`proxy.ts:108`) sigue siendo
`['/dashboard','/admin']`, que por `startsWith` cubre todo lo anterior.

**¿La prueba nueva bendice un ensanchamiento?** No, pero **encogió su poder de
detección** y hay que decirlo. `visibilidad.test.ts` pasó de 12 rutas prohibidas
al encargado a 4, y de 9 rutas "suyas" a 1 (`['/dashboard']`); el bloque del
contador pasó de "sus 6 páginas" a `expect(FISCAL).toEqual([])`. Lo que sí
conserva —y es lo que importa— son las tres invariantes: (a) `inicioDe(contador)
!== '/dashboard'`, (b) `puedeVerRuta(contador, inicioDe(contador)) === true` (el
no-bucle), y (c) `puedeVerRuta('encargado', <ruta de dinero>) === false` sobre
las rutas de dinero que sobreviven. `tenant-efectivo.test.ts` sigue barriendo
**todas** las rutas existentes contra un rol sin áreas. Ninguna aserción nueva
afirma que un rol puede algo que antes no podía.

**Lo que la reescritura sí introdujo, y es un hallazgo (abajo, MEDIO 1):** el
comentario de `visibilidad.ts:68-71` afirma que una URL vieja "simplemente deja
de abrir para todos, dueño incluido". Es falso para las 18 rutas borradas de un
solo segmento, porque `/dashboard/[id]` las captura.

---

## Hallazgos abiertos de pases anteriores: qué pasó con cada uno

| # | Hallazgo | Estado hoy | Evidencia (leída hoy) |
|---|---|---|---|
| **A1** | **[ALTO]** Las tablas del dinero no tienen capa de rol en la base (`encargado` lee `liquidacion`/`gasto`/`wa_conversacion` por PostgREST) | **ABIERTO, byte-idéntico** | `0086_retirar_rol_operador.sql:38-52` sigue creando `tenant_data … using (tenant_id = any(get_user_tenant_ids()) or is_superadmin())` sobre las 19 tablas. `ls supabase/migrations \| tail` → la última es `0088` (la de esta rama, régimen 624), que no toca RLS. `ve_finanzas()` sigue aplicada solo a las 6 tablas vacías |
| **A2** | **[ALTO]** El contador "de solo lectura" puede ESCRIBIR las 19 tablas, incluida `bitacora_auditoria` | **ABIERTO, byte-idéntico** | `0086:47-49`: `for all` con `with check` igual al `using`. `0086:75-77`: `bitacora_insercion` sigue siendo `for insert with check (tenant_id = any(…))` sin validar `actor_email` |
| **A3** | **[MEDIO]** El recordatorio automático manda el backlog entero en la primera corrida | **ABIERTO, sin cambio** | `recordatorio_comprobacion.ts` no se tocó en los 9 commits (`git diff --stat 20ecbb1..HEAD` no lo lista); 0087 sigue sin backfill |
| **A4** | **[BAJO]** `resolverTenantEfectivo` ignora el `error` al resolver `?tenant=` | **ABIERTO** | `tenant-efectivo.ts:120-126` sigue con `const { data: t } = await …` — sin `error`. El bloque de abajo (`:137-140`) sí lo comprueba |
| **P1-1** | **[ALTO]** `sharp` 0.34.5 decodifica bytes que elige el chofer | **REINCIDENTE, 4º pase** | `node -e require('sharp/package.json').version` → **0.34.5**; `package.json:35` sigue `"sharp": "^0.34.0"`; `intake/cfdi.ts:249` intacto. `package-lock.json` **no cambió** en los 9 commits |
| **P1-3** | **[MEDIO]** `/admin` es una sola capa | **REINCIDENTE, sin cambio** | Barrido de hoy: **20** `page.tsx` bajo `/admin` sin ninguna guardia propia; la única es `admin/layout.tsx:36`. `proxy.ts:117` sigue preguntando solo "¿hay sesión?" |
| **P1-4** | **[MEDIO]** QStash: el productor arranca con menos config que el consumidor | **REINCIDENTE, y agravado** | `facturar/route.ts:308-316` sigue disparando con `UPSTASH_QSTASH_TOKEN` solo; `cola/route.ts:22-28` sigue exigiendo tres. Ver además BAJO 2 abajo |
| **P1-5** | **[BAJO]** `search_path` borrado de `config_tenant_valida` por 0082/0083/0085 | **REINCIDENTE** | Ninguna migración posterior la restaura |
| **P1-6** | **[BAJO]** `/cuenta` fuera del matcher del proxy | **REINCIDENTE** | `src/app/cuenta/page.tsx:9` sigue con su único `requireSessionTenant`; `proxy.ts:108` sigue sin `/cuenta` |
| **P1-7** | **[BAJO]** El callback de QStash no comprueba el destino de la firma | **REINCIDENTE** | `cola/route.ts:36-39`: `receiver.verify({ signature, body })`, sin campo `url` |

**Cerrado por supresión en este pase: ninguno.** Lo digo con nombre y línea
porque el brief lo pide explícitamente. Los 10 abiertos viven en `supabase/`,
`package-lock.json`, `proxy.ts`, `src/app/admin/`, `src/app/api/cron/` y
`src/lib/auth/tenant-efectivo.ts` — **ni uno solo de esos archivos está entre
los 35 borrados**, y ninguno tiene un diff en `20ecbb1..HEAD`. El borrado del
panel cerró hallazgos de frontend y arquitectura; de seguridad, cero. Lo que sí
cerró es la *superficie* de A1/A2 vista desde el navegador: `/dashboard/cuadre`
y `/dashboard/contador/liquidaciones` ya no pintan esas cifras. Pero A1 y A2
nunca fueron sobre el navegador — son sobre `curl` contra PostgREST, y las filas
siguen ahí.

---

## Hallazgos

### [MEDIO] Las 18 rutas borradas de un segmento NO dejan de abrir: caen en `/dashboard/[id]` y revientan en la cara del rol que sí ve dinero
`src/lib/auth/visibilidad.ts:68-71` (la afirmación) · `src/app/dashboard/[id]/page.tsx:53,86-87` ·
`src/lib/likida/analytics.ts:1152-1165` · `src/lib/likida/pg.ts:33-36`

El comentario que la reescritura estrenó dice, textual:

> `puedeVerRuta` niega por default (`area !== undefined`), así que una URL vieja
> simplemente deja de abrir para todos, dueño incluido — el efecto correcto
> mientras no exista nada que gatear.

Eso sería cierto si `/dashboard/<algo>` no tuviera dónde caer. Lo tiene:
`src/app/dashboard/[id]/page.tsx` existe y es el único segmento dinámico del
panel. Confirmé además que **no hay `not-found.tsx` bajo `/dashboard`** (`find
src/app -name not-found.tsx` → solo `src/app/not-found.tsx`). Las 18 rutas
borradas de **un** segmento (`despacho`, `viajes`, `pod`, `incidencias`,
`unidades`, `operadores`, `mapa`, `documentos`, `analitica`, `chat`,
`valor-ahorro`, `rentabilidad`, `clientes`, `cotizador`, `cuadre`,
`facturacion`, `cobranza`, **`contador`**) las captura `[id]`. Solo las 5
subrutas del contador (`contador/cfdi`, etc.) 404ean de verdad, porque son dos
segmentos.

**Escenario, con valores.** Ana es `flota_admin` de Transportes Innovativos y
tiene `/dashboard/cuadre` en marcadores desde el ensayo del demo. Abre el
marcador:

1. Next enruta a `[id]` con `id = "cuadre"`.
2. `[id]/page.tsx:53` — `puedeVerArea('flota_admin','dinero')` → **true**, pasa.
3. `[id]/page.tsx:86` — `getLiquidacionDetalle('cuadre', '1111…1111')`.
4. `analytics.ts:1157` — `.eq('id', 'cuadre')` contra una columna `uuid`.
   PostgREST devuelve `22P02 invalid input syntax for type uuid: "cuadre"`.
5. `pg.ts:34` — `exigir()` **lanza**. Nadie lo atrapa en la página.
6. Sale el error boundary: **"No se pudo cargar el panel · Esto NO significa que
   no haya liquidaciones"** con un código de incidente.

Un `encargado` con la misma URL sí obtiene el comportamiento prometido
(`puedeVerArea('encargado','dinero')` → false → `redirect('/dashboard')`). O sea:
**la ruta borrada se comporta distinto según el rol**, y el rol que se lleva el
error es justamente el dueño y el contador.

**Consecuencia.** En la sala, el contralor teclea o abre un link viejo de
"Cuadre" y ve la pantalla de fallo del sistema, con la frase que el repo escribió
para el caso opuesto —una base caída— afirmando que el problema es de lectura de
datos. No hay fuga: el error boundary no imprime el mensaje del servidor
(`error.tsx:66-70` solo pinta `digest`), y ningún dato de otro tenant se toca
porque la consulta lleva `.eq('tenant_id', …)`. Pero el guardarraíl documentado
no existe, y en auditoría eso importa: la próxima persona que lea
`visibilidad.ts:68-71` va a creer que borrar una entrada del mapa es suficiente.

**Causa raíz probable.** El borrado razonó sobre `AREA_POR_RUTA` (que es exacto,
no por prefijo) sin considerar que `[id]` es el comodín que se come todo lo que
no matchea una carpeta estática — un mapa exacto y un segmento dinámico hermano
no se pueden razonar por separado.

---

### [MEDIO] `accionResponder` de ARCO es el único server action del panel sin la re-comprobación de rol, y su archivo hermano documenta por qué hace falta
`src/app/dashboard/arco/page.tsx:33-49` · contra
`src/app/dashboard/combustible-casetas/page.tsx:48-56`

Barrí los 9 `'use server'` que quedan bajo `src/app/dashboard/`. Ocho
re-comprueban el rol **dentro** del action, con la sesión REAL:

| Action | Re-chequeo |
|---|---|
| `combustible-casetas.accionResolverLinea` | `puedeVerRuta(s.rol, ruta)` (`:56`) |
| `politicas` | `puedeAdministrar(s.rol)` (`:79`) |
| `suscripcion` ×3 | `puedeAdministrar(r)` (`:125`, `:167`, `:186`) |
| `[id].reabrir` / `.reasignar` | `puedeAdministrar(s.rol)` (`:104`) / `puedeAsignar(r)` (`:131`) |
| `layout.cerrarSesion` | no aplica (cierra la sesión propia) |
| **`arco.accionResponder`** | **ninguno** — `requireSessionTenant(RUTA)` en `:37` y ya |

Y el que falta es el único cuyo hermano escribió la doctrina, palabra por
palabra (`combustible-casetas/page.tsx:50-52`):

> se revalida `puedeVerRuta` aquí porque una Server Action es un endpoint POST
> alcanzable por su cuenta — el gateo de la página (arriba) no la protege.

**Escenario, con valores.** `/dashboard/arco` es área `operacion`
(`visibilidad.ts:77`). El **contador** tiene `['dinero']`, así que
`puedeVerRuta('contador','/dashboard/arco')` es `false` y la página lo rebota a
`/dashboard/suscripcion`. Pero si Mario (`rol='contador'`, tenant `1111…1111`)
consigue el `Next-Action` de `accionResponder` y sus argumentos ligados, el POST
corre completo: `requireSessionTenant` le da su sesión válida, `s.tenantId` es su
propia flota, y `resolverSolicitudArco(tenantEfectivo, solicitudId, resolucion)`
(`repo.ts:976-1006`) marca la solicitud `estado='resuelta'` con el texto que él
mande y **dispara un WhatsApp al titular**: "Tu solicitud de derechos ARCO fue
atendida por TRANSPORTES INNOVATIVOS SA DE CV: <su texto>". El chofer que ejerció
su derecho de cancelación recibe una resolución que nadie autorizado firmó, y el
plazo del art. 32 LFPDPPP queda cerrado en la base.

**Refutación intentada, y hasta dónde llega.** La intenté y me deja en MEDIO, no
en ALTO. `accionResponder` es un closure declarado dentro del componente (cierra
sobre `searchParams`), así que Next lo invoca con un ID de acción de build **más
los argumentos ligados cifrados**, que solo viajan en el HTML/RSC de alguien que
sí pudo renderizar la página. Un contador no puede renderizarla. Así que la ruta
de explotación no es "un `curl` y ya": necesita el `$ACTION_` de una sesión
`flota_admin`/`encargado`/`superadmin` del mismo build — un pantallazo, un HAR
compartido, un colega. **No es teoría pura** (ese blob no rota por usuario ni por
tenant, solo por deploy), pero tampoco es de un teclazo. Lo que sí es un hecho
sin condiciones: es el único punto del panel donde la autorización descansa en
**una sola capa**, y la capa que falta es la que el repo mismo declaró
obligatoria en el archivo de al lado. Lo que sí está bien: `resolverSolicitudArco`
filtra por `tenant_id` en la lectura y en el UPDATE (`repo.ts:980`, `:989`), así
que no hay salto de tenant — el daño se queda dentro de la flota.

**Causa raíz probable.** El re-chequeo se agregó archivo por archivo cuando
alguien lo notó (los comentarios de `combustible-casetas` y `[id]` lo cuentan
como hallazgo de una auditoría previa), en vez de vivir en un helper que
`requireSessionTenant` no puede saltarse.

---

### [BAJO] La URL de callback de QStash cae al header `Host` cuando falta `NEXT_PUBLIC_APP_URL`
`src/app/api/cron/facturar/route.ts:316` · contra `CLAUDE.md` ("`NEXT_PUBLIC_APP_URL`
debe ser `https://app.likida.ai`") · `src/lib/env.ts:29-38`

```js
const base = process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get('host')}`;
const publicacion = await q.publishJSON({
  url: `${base}/api/cron/facturar/cola`,
  body: { lote, quedaron },   // ← 8 filas de `gasto`
  …
});
```

`lote` son filas completas de `gasto`: `tenant_id`, `monto`, `fecha`, `folio`,
`rfc_emisor`, `cfdi_uuid`, `ocr_extra`. Es dato fiscal de un tenant, y el destino
al que QStash lo va a reentregar sale de una **cabecera de la petición** cuando
la variable falta. `env.ts:29-38` no vigila `NEXT_PUBLIC_APP_URL` en ningún grupo
(ni ninguna `QSTASH_*`), así que su ausencia no aparece en
`avisarConfiguracionSilenciosa()`.

**Escenario.** Un Preview de Vercel sin `NEXT_PUBLIC_APP_URL` (el caso que el
CLAUDE.md ya documenta como modo de falla real, con la cookie de login) que sí
tenga `UPSTASH_QSTASH_TOKEN` y `CRON_SECRET`: la corrida encola con
`https://<host-de-la-petición>/api/cron/facturar/cola`, y ese host es el que
mandó quien disparó el cron.

**Consecuencia.** BAJO, y es honesto que lo sea: para llegar aquí hay que traer
`Authorization: Bearer <CRON_SECRET>` (`:254`), y en Vercel el ruteo por `Host`
exige que el dominio apunte al deployment. No es un camino abierto. Lo que lo
mantiene como hallazgo es la forma: un destino de datos fiscales derivado de
entrada de la petición, en un archivo donde la alternativa (fallar y decirlo) ya
es el patrón de la casa dos funciones más arriba.

**Causa raíz probable.** El fallback se escribió para que el camino de QStash
funcionara en local sin configurar nada; el mismo `??` viajó a producción.

---

## CVEs: cuáles tienen camino real y cuáles descarto por escrito

`npm audit` corrido hoy sobre este árbol: **13 — 2 critical, 8 high, 3
moderate.** Idéntico al pase 2 y al pase 1: `git diff --stat 20ecbb1..HEAD --
package.json package-lock.json` → **vacío**. Ni un paquete cambió de versión.
Repito el veredicto entero por escrito, no por referencia, porque el brief lo
exige y porque un "ver pase anterior" no es descartar.

| Paquete | Sev. | Camino real en ESTA app | Veredicto |
|---|---|---|---|
| **`sharp` <0.35.0** — GHSA-f88m-g3jw-g9cj (CVE-2026-33327/-33328/-35590/-35591: corrupción de memoria en los cargadores TIFF/WebP/HEIF de libvips) | HIGH | **Sí.** Dependencia de producción, instalada **0.34.5**. `intake/cfdi.ts:249` hace `sharp(image).rotate().resize(…).jpeg().toBuffer()` sobre bytes que un chofer elige y manda por WhatsApp, descargados sin tope de tamaño ni validación de formato, dentro del proceso que tiene `SUPABASE_SERVICE_ROLE_KEY` en memoria. `sharp` enruta por *magic bytes*, no por el mime declarado, así que "es una foto de ticket" no acota nada. **Único call site** (`grep -rn sharp src/` → `cfdi.ts:11` y `:249`) | **ABIERTO — es el ALTO reincidente P1-1** |
| `vitest` ≤3.2.5 — GHSA-5xrq-8626-4rwp (CVSS 9.8) | CRITICAL | No. Exige el **servidor de Vitest UI** escuchando. La suite corre `npx vitest run`; no hay `--ui` ni `@vitest/ui` en `package.json`. `devDependency`: no viaja al bundle de Vercel | **DESCARTADO** |
| `@vitest/coverage-v8` ≤3.2.5 | CRITICAL | No. Su `via` es literalmente `["vitest"]`, sin advisory propio. Mismo alcance dev-only | **DESCARTADO** |
| `vite` ≤6.4.2 | HIGH | No. Los advisories son del **dev server** de Vite, que este repo nunca levanta (Next trae el suyo), y dos son específicos de Windows; el entorno es Linux. Entra solo como dependencia de `vitest` | **DESCARTADO** |
| `vite-node` ≤2.2.0-beta.2, `@vitest/mocker` ≤3.0.0-beta.4 | MOD/HIGH | No. Cuelgan de `vite`/`vitest`, sin advisory propio. Dev-only | **DESCARTADO** |
| `esbuild` ≤0.24.2 — GHSA-67mh-4wv8-2f99 | MOD | No. Exige su dev server escuchando **y** que la víctima visite una web hostil con él encendido. Dev-only, y el arreglo es `vitest@4` (semver-major) | **DESCARTADO** |
| `brace-expansion` — GHSA-mh99-v99m-4gvg + dos bypasses de la mitigación de CVE-2026-14257 (DoS por expansión sin cota) | HIGH | No. `npm audit` lo coloca bajo `eslint`, `@eslint/config-array`, `@eslint/eslintrc`, `eslint-plugin-import`, `eslint-plugin-jsx-a11y`, `eslint-plugin-react` y `test-exclude`. **Todas dev.** Lo que expande son los globs de configuración que escribimos nosotros; un DoS del linter no es un DoS del producto | **DESCARTADO** |
| `js-yaml` 4.0.0–4.3.0 — GHSA-5p4m-2wfm-xmqj (CPU cuadrática en `!!omap`) | HIGH | No. Camino único: `@eslint/eslintrc → js-yaml`. **La trampa aquí es tentadora y la desarmo:** las 24 fichas de `normas/` son YAML, pero no pasan por `js-yaml` (no está en el árbol de producción) y son archivos del repo, no entrada de un tercero | **DESCARTADO** |
| `fast-uri` 3.0.0–3.1.4 — GHSA-7p8r-x3mc-p8w7 (confusión de host por `\`) | HIGH | No. Camino único `@sentry/nextjs → @sentry/webpack-plugin → webpack → schema-utils → ajv → fast-uri`. Ese `ajv` valida esquemas de **configuración de webpack** en build. Ninguna URL de petición pasa por ahí; la app valida entrada con `zod` | **DESCARTADO** |
| `nanoid` <3.3.17 — GHSA-2v37-7h3g-55p8 (bucle infinito con `size = 0` y generador propio) | HIGH | No. Camino único `postcss → nanoid`, con tamaño fijo para ids de source-map. Nada llama a `nanoid` con generador propio ni con `size` de un tercero. Build-time | **DESCARTADO** |
| `postcss` ≤8.5.22 — 4 advisories (lectura de `.map` arbitrarios por `sourceMappingURL` ×2, path traversal, XSS por `</style>` sin escapar) | HIGH | No. El CSS que procesa es el nuestro (`@tailwindcss/postcss` sobre `src/**/*.css`), en build. No hay ruta que meta CSS de un usuario en postcss en runtime: el repo pinta con `style={{}}` (1,178 ocurrencias), no genera hojas de estilo a partir de datos | **DESCARTADO** |
| `next` (agregado) | HIGH | Su `via` son exactamente `postcss` y `sharp`, sin advisory propio de Next | **Cubierto por `sharp`** |

**Resumen honesto:** de las 10 críticas/altas, **una sola** tiene camino real de
explotación en esta app (`sharp`), y es la misma que lleva cuatro pases abierta.
Las otras nueve quedan descartadas por escrito arriba: dev-only o build-time.
Subir `vitest` a 4.x cerraría 6 renglones del reporte y **cero** riesgo de
producción; `npm audit fix --force` sobre `sharp` es breaking (0.35.3) y es la
única que valdría la pena pelear.

---

## Lo que revisé y está bien

- **La reescritura de `visibilidad.ts` es estrictamente restrictiva** — ver la
  sección de arriba. Ni `AREAS_POR_ROL`, ni `PREVISUALIZABLES`, ni `rolEfectivo`,
  ni `PANEL_PROPIO` cambiaron un carácter, y `AREA_POR_RUTA` solo perdió
  entradas. El único cambio de comportamiento (`inicioDe(contador)`) apunta a una
  ruta que ese rol ya tenía.
- **El aterrizaje nuevo del contador NO le regala escrituras.**
  `/dashboard/suscripcion` sí tiene tres server actions (contratar plan, guardar
  datos fiscales, abrir el portal de Stripe) donde el panel del contador viejo
  era de pura lectura — lo miré por eso. Las tres re-comprueban con el rol REAL
  vía `tenantDelAction` (`suscripcion/page.tsx:40-48`), y `puedeAdministrar` es
  `{superadmin, flota_admin}` (`permisos.ts:19`). El render también se apaga
  (`:86`, `:339`, `:385`). Dos capas, las dos presentes.
- **Ninguna ruta se quedó sin matcher al borrarse las 35 páginas.** Barrí las 9
  `page.tsx` de `/dashboard` + las 20 de `/admin` + las 10 `route.ts` de `/api`.
  `RUTAS_CON_SESION` (`proxy.ts:108`) cubre `/dashboard` y `/admin` por
  `startsWith`. Las únicas sin sesión son públicas por diseño y verificadas una a
  una: `/`, `/login`, `/sin-acceso`, `/terminos`, `/privacidad`, `/demo`,
  `/aviso/[tenant]`, `/auth/callback`, `/api/demo`, `/api/webhook/whatsapp`
  (HMAC), `/api/stripe/webhook` (HMAC), `/api/cron/*` (`CRON_SECRET` o firma
  QStash). `/cuenta` sigue fuera del matcher (P1-6, reincidente, ya reportado).
- **Ningún permiso quedó huérfano.** `grep` de las 18 rutas borradas sobre `src/`
  → **18 aciertos, todos dentro de comentarios** (`analytics.ts:447`,
  `repo.ts:117`, `operacion.ts:499/538`, `resumen-visual.tsx:148`,
  `sidebar-nav.tsx:76`, `export/*/route.ts`…). Cero `href`, cero `redirect()`,
  cero entrada de `rutas.ts` apuntando al vacío. Los dos links de `/admin` que
  sí apuntaban a `/dashboard/despacho?...&rol=encargado` se corrigieron a
  `/dashboard?...` en el mismo commit (`admin/page.tsx:258`,
  `admin/flotas/page.tsx:167`), y `selector-vista.tsx:50` movió la
  previsualización del contador a `/dashboard/suscripcion`.
- **`/api/dashboard/asistente` sobrevivió al borrado de `/dashboard/chat` con su
  puerta puesta.** Es el endpoint que devuelve IVA/IEPS acreditables, litros y
  diferencias de TODAS las liquidaciones, leído con `supabaseAdmin()` (salta
  RLS). Sigue con `401` sin sesión (`:29`) y **`403` si el rol no ve `dinero`**
  (`:43-45`), y `?tenant=` solo lo honra un superadmin contra la tabla (`:56-58`).
  El rail se pinta para los tres roles desde `chrome.tsx`, así que la puerta se
  ejerce de verdad en cada carga del encargado.
- **`/dashboard/[id]` se gatea a mano y está bien gateada.** `puedeVerArea(rol,
  'dinero')` (`:53`) con el rol EFECTIVO para el render, y las dos escrituras
  (`reabrir`, `reasignar`) revalidan con el rol REAL dentro del action
  (`:104`, `:131`). `dinero_por_area.test.ts` excluye `[` a propósito y lo
  documenta.
- **`getLiquidaciones` movida a `analytics.ts:1550` no abrió nada:** filtra
  `.eq('tenant_id', tenantId)`, `.limit(50)` y **lanza** si `error` — hoy sin
  llamadores (código muerto tras borrar `/dashboard/cuadre`), no superficie viva.
- **Ningún secreto con fallback derivado de otro secreto.** Rebarrí todos los
  `process.env.X ?? …` / `|| …` del árbol: los 16 que existen son URL pública
  (`NEXT_PUBLIC_APP_URL`), tenant de demo, entorno de observabilidad, ruta de
  chromium, y los datos bancarios de Likida (que degradan a `null` y la pantalla
  lo dice, `suscripcion/page.tsx:236-242`). `supabaseAdmin()` **lanza** si falta
  la service-role key. El único `??` que sí toca una frontera es el de la URL de
  callback de QStash — reportado arriba como BAJO.
- **Nada de secretos en el repo.** `.gitignore` cubre `.env*`; el único rastreado
  es `.env.example`, en blanco. Barrido de `eyJ…`/`sk-…`/`sk_live`/`whsec_…`/
  `EAA…`/`qstash_…` sobre los 54 archivos tocados en los 9 commits: cero.
- **URLs firmadas: el inventario volvió a encoger y sigue en 60 s.** Quedan
  cuatro puntos vivos, todos `60`: `api/export/pdf/[id]/route.ts:95` (con
  `download:` nombrado), `processor.ts:2123` (PDF al operador) y `:2178` (PDF al
  contralor). `ligaComprobante` (`intake/almacen.ts:94`, default 3600 s) sigue
  **sin un solo llamador** (`grep -rn ligaComprobante src/` → solo su
  definición) — código muerto, no TTL vivo. Buckets `liquidaciones` y
  `comprobantes` siguen privados.
- **La ruta del PDF conserva sus cuatro puertas:** rate limit por IP (30/min,
  `:30`), tenant de la SESIÓN (no de la URL), área `dinero` (`:63`) **y**
  `puedeExportar` (`:68`), `.eq('tenant_id')` explícito porque el service-role
  salta RLS, y 404 indistinguible entre "no existe" y "existe sin PDF". Igual
  `api/export/liquidaciones` (`:47`, `:52`).
- **Firma del webhook de WhatsApp.** HMAC-SHA256 con `crypto.timingSafeEqual` y
  guardia de longitud previa; tope de cuerpo ANTES de leer y otra vez con
  `raw.length`, que cierra el hueco de `Transfer-Encoding: chunked` que
  `ratelimit.ts:99-107` documenta con todas sus letras (y admite que
  `api/demo/route.ts:30` no lo cierra — ahí el tope es el de la plataforma).
- **Firma de Stripe.** Tolerancia de tiempo antes del HMAC, firma sobre el cuerpo
  crudo, `timingSafeEqual`, y **503 —no 200—** si falta `STRIPE_WEBHOOK_SECRET`;
  idempotencia por `evento_stripe` antes de aplicar.
- **QStash: el consumidor falla cerrado.** `cola/route.ts:22-28` exige las tres
  variables y devuelve **503** si falta una; `verify()` corre **antes** de
  `JSON.parse` y sobre el `raw` exacto; firma inválida → 401 con log. Lo único
  que le falta es el campo `url` (P1-7).
- **`/api/cron/escalar`, `/facturar`, `/purgar`** comparan
  `Authorization: Bearer <CRON_SECRET>` y devuelven **500** si la variable no
  está (no 200: un cron verde mintiendo es peor) y **401 sin cuerpo** si la
  cabecera no cuadra. La comparación es `!==`, no `timingSafeEqual`: lo miré y lo
  descarto — un oráculo de temporización de nanosegundos sobre TLS + el ruteo de
  Vercel no es explotable.
- **`/auth/callback` no es un open redirect.** `next` solo se honra si
  `startsWith('/dashboard')` (`:12`), y el destino se construye con
  `new URL(dest, req.url)`, que ancla el origen. `//evil.com` y `https://evil`
  no pasan el `startsWith`.
- **`?tenant=` en las rutas de API sigue sin creerse.** `tenant-api.ts:56-73` y
  `:86-100` solo lo honran para superadmin y distinguen "no existe" (400) de "no
  pude preguntar" (503).
- **CSP y cabeceras.** `proxy.ts:66-68` mete `'unsafe-eval'` SOLO bajo
  `NODE_ENV === 'development'` (ternario evaluado en módulo, no por petición);
  producción sigue en `'self' 'unsafe-inline'`. `withSecurityHeaders` se aplica
  también al redirect a `/login`, y las cookies de refresh viajan en él
  (`:143-145`) — el bucle de refresh fallido sigue cerrado.
- **`sidebar-nav.tsx` filtra por rol** vía `puedeVerRuta` y no pinta una sección
  vacía (`:34`); con `SIDEBAR_PRINCIPAL`, `FISCAL`, `OPERACION` e `INICIO` en
  `[]`, al encargado le quedan Resumen + ARCO + Soporte, que es exactamente su
  área. Uso el REAL, no el efectivo — correcto: el sidebar es navegación, y el
  gateo real vive en la página.
- **Compuerta verde a mi paso:** `npx vitest run` → **258 archivos, 3,105
  pruebas verdes, 1 saltada**, exactamente la línea base del MAPA del pase 4.

---

## Lo que NO alcancé a revisar

- **El estado REAL del catálogo de Postgres.** Todo lo de RLS, grants y
  `search_path` sale de leer las 88 migraciones y componerlas mentalmente. Sin
  conexión a Supabase no pude correr `supabase/verificaciones.sql` ni consultar
  `pg_policies` / `pg_proc.proconfig`. En particular **no pude confirmar que la
  0086 se haya aplicado a producción**; si revirtió (por una fila
  `rol='operador'` viva), el estado vigente es el anterior, con las policies del
  chofer todavía puestas.
- **La explotabilidad real del MEDIO de ARCO.** Verificar si el `$ACTION_` de
  `accionResponder` es alcanzable por un rol que no puede renderizar la página
  exige levantar la app (prohibido `npm run build`, sin entorno) y armar el POST.
  Lo verificado es estático: la ausencia del re-chequeo y la presencia de la
  misma comprobación en los otros ocho actions.
- **Confirmar en ejecución el hallazgo del layout de `/admin`** (P1-3): haría
  falta la petición RSC con `Next-Router-State-Tree` forjado. Lo verificado es
  estático: 20 páginas sin puerta propia, un proxy que no mira el rol.
- **Si la anon key está expuesta por otra vía** (variable en un Preview de
  Vercel, screenshot, consola de Supabase compartida). Verifiqué que no está en
  el bundle de cliente de HOY; los canales de fuera del repo no los puedo ver.
  De eso depende cuán fácil es A1/A2 en la práctica —**no si son ciertos**: la
  anon key es pública por diseño y el propio repo lo asume en `0048:43-44`.
- **Políticas de `storage.objects` creadas a mano** en la consola de Supabase:
  solo la 0046 crea políticas de storage desde el repo.
- **Contar el backlog del recordatorio** (A3): depende de cuántos viajes
  `abierto` con `fecha_inicio ≤ hoy−3` hay hoy en producción. Verifiqué la
  ausencia del gate, no el tamaño del disparo.
- **`src/lib/agents/` y `src/lib/llm/`** desde el ángulo de inyección de prompt
  con efectos. El MAPA declara cero cambios en los 9 commits y la superficie
  cerrada por diseño (`properties: {}`); confirmé que ninguna tool nueva la
  rompe, no audité prompts ni `registry`.
- **Superficie de `pruebas-manuales/*.prueba.ts`** (prohibido correrlas) y del
  adaptador de Playwright contra portales reales: solo lectura de código.
