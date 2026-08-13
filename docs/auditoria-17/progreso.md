# Progreso — auditoría 17, PASE 6 (13-ago-2026, en la nube)

Una línea por acción, con su sha, escrita **mientras** avanza.

## Arranque

| # | Acción | sha | Resultado |
|---|---|---|---|
| 1 | `git status` al arrancar | — | **limpio** → autofix habilitado |
| 2 | PR de auditoría abierto: **#9** `claude/auditoria-17` | — | → **ronda de CONTINUACIÓN**, sin PR nuevo |
| 3 | `npm install` (la nube clona sin `node_modules`) | — | exit 0 |
| 4 | `git merge origin/master` — 22 commits, 177 archivos | — | **9 conflictos** |
| 5 | Resolución: **gana `master`** en todos los conflictos de UI | `0fa27b0` | tsc 0 · suite **15 rojos a propósito** |
| 6 | `MAPA.md` + sección PASE 6 | `0fa27b0` | 12 rubros a relanzar (primera vez desde el pase 1) |
| 7 | 12 auditores despachados en un solo mensaje | — | contexto fresco, uno por rubro |

### Por qué gana `master` en el conflicto

Sus commits son del 12–13-ago, **posteriores** a los arreglos del pase 5 y
tomados a sabiendas: el `sidebar-nav.tsx` de master lleva escrito que cablear
NEGOCIO y GESTIÓN *"duró una captura: 'esas no estaban'"* — que es literalmente
el CRÍTICO que el pase 4 había cerrado. Reimponer el arreglo dentro de un merge
sería pelearle a una decisión de producto escrita, y además dejaría el PR
imposible de mergear.

### Lo que costó esa decisión, medido

La reescritura v3 reabrió **7 defectos** que los pases 2–5 habían cerrado. No
hubo que buscarlos: **sus propias pruebas se pusieron rojas solas**. Ese es el
arnés funcionando, y es el dato más valioso del pase.

| Ficha | Línea | Regla de `CLAUDE.md` |
|---|---|---|
| R6-1 | `kpi-periodo.tsx:67` `valor={valorActual ?? 0}` | *Nunca inventar una cifra* |
| R6-2 | `inicio-contenido.tsx` / `resumen-visual.tsx`, mismo `?? 0` en "Ahorro generado" | *Nunca inventar una cifra* |
| R6-3 | `panel-periodo.tsx` — `null` (consulta caída) y `[]` (no hay) colapsados | *Fallar cerrado y decirlo* |
| R6-4 | `panel-periodo.tsx` — los cinco títulos sin su ventana de tiempo | *Un rótulo tiene que ser verdad* |
| R6-5 | `sidebar-nav.tsx` — rutas visibles por rol sin link que las pinte | navegación |
| R6-6 | `kpi-periodo.tsx` / `motor-fiscal-periodo.tsx` — objetivo de toque 16px | WCAG 2.5.8 |
| R6-7 | `sidebar-nav.tsx` — sin `aria-current="page"` | a11y |
| R6-8 | `expediente_alcanzable.test.tsx` — el expediente sin puerta desde el Resumen | *es la pantalla del demo* |

### Colateral del borrado, SIN hallazgo detrás

Sus sujetos los borró la v3, así que sus pruebas se van con ellos:
`sidebar_colapsado.test.tsx` (`soloIconos`), `sin_asignar_accionable.test.tsx`
(`TablaSinAsignar`), `contraste_tinta_componente.test.ts`
(`DEGRADADO_MARCA_TINTA_BLANCA`), `rail_pantalla_completa.test.ts` (`rail.tsx`).
`chrome.tsx` conserva su `aria-label` y pierde el modo colapsado.
`src/app/dashboard/rail-marca.ts` queda **huérfano** (solo lo lee su propia
prueba) → ficha para arquitectura.

## Política en conflicto, anotada en vez de silenciada

La skill de la rama (`baa5b59`, `a3e3b5a`) dice **"todo lo reproducible, sin
tope de vueltas"**. El encargo de ESTA corrida dice **"Tope: 3 vueltas"** y que
manda sobre los defaults de la skill. Se sigue el encargo: 3 vueltas.

## Arreglos

(se llena conforme avanzan)
