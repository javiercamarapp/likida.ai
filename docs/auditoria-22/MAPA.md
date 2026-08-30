# MAPA — auditoría 22 (30-ago-2026)

Ronda **COMPLETA**, desatendida, **en la nube** (routine de Claude Code). Rama
`claude/auditoria-22` sobre `master` = `86813f4`.

## Anclaje: lo que NO tengo

**No hay síntesis previa legible desde aquí.** `.gitignore:` ignora
`docs/auditoria-*/`, así que ninguna ronda deja rastro en `master`; los reportes
de la 21 viven en `likida-archivo-privado/`, fuera de este clon. Consecuencia
directa y no negociable:

- **No hay notas previas por rubro ni hallazgos abiertos que heredar.** Cada
  auditor califica en frío. La columna «antes» de la síntesis va a decir
  `s/d` (sin dato), no un número inventado.
- El delta global de esta ronda **no se reporta como mejora ni como caída**: se
  reporta como **línea base nueva**. Publicar un delta contra un número que no
  puedo leer sería exactamente la cifra inventada que la regla mayor del
  producto prohíbe.
- Lo único recuperable del historial son los **títulos de commit** de los
  arreglos de la 20 y la 21 (abajo): sirven para saber qué se atacó, no para
  saber en qué nota quedó.

Los reportes de esta ronda entran con `git add -f` (precedente: la ronda 18
hizo lo mismo y dejó escrito que quitar esa línea del `.gitignore` **se propone,
no se hace**).

## Compuerta base (corrida real, 30-ago-2026, sobre `86813f4`)

| Comando | Resultado |
|---|---|
| `npm test` (vitest run) | **VERDE** — 697 archivos, 9,918 pruebas pasan, 1 saltada, 86.7 s |
| `npx tsc --noEmit -p .` | **VERDE** — 0 errores |
| `npm run lint` (eslint src/) | **VERDE** — 0 errores, 166 advertencias |

`npm run build` **no se corre aquí**: pide Supabase, OpenRouter, Facturapi y
Upstash, que en la nube no existen; su fallo no diría nada del código.
`pruebas-manuales/*.prueba.ts` **no se corren**: hacen llamadas reales de pago.

## Qué cambió desde la ronda anterior

Ventana `2296057..86813f4` (el cierre completo de la auditoría 21):
**85 archivos, +4,180 / −210** en `src/`, `supabase/`, `normas/`.

Lo que se movió, por tema:

- **Agéntico**: `cuadre/engine.ts`, `avisar_cierre.ts`, `processor.ts` — cierre
  parcial que mentía y margen de cierre a ciegas (2 CRÍTICOS de la 21).
- **Fiscal**: `contabilidad/poliza.ts`, `catalogo.ts` — EFOS no concluyente ya
  no se afirma deducible; la póliza absorbe IVA/IEPS no acreditado.
- **Backend**: `api/export/liquidaciones/route.ts`, `repo.ts` — CFDI fail-closed
  y export sin duplicados bajo escritura concurrente.
- **Seguridad / MCP**: `lib/mcp/oauth.ts` + migración `0271` — identidad de
  token MCP atada a `app_user`; rateLimit por archivo, guardia `/api`, CSRF.
- **Legal**: `app/privacidad/page.tsx` — declara qué manda al modelo el piloto
  de facturación.
- **Frontend**: `dashboard/soporte/`, `admin/soporte/`, `configuracion/forma.tsx`
  — estatus de ticket crudo y forma de pago incompleta.
- **Operabilidad**: `api/cron/gps/route.ts` (reloj duro), `admin/salud.ts`,
  `conectores/sincronizar_gps.ts`.
- **Datos**: migraciones `0270` (correo frío único por prospecto) y `0271`.

Consecuencia para el auditor: **el código recién tocado es el más sospechoso.**
Un arreglo de ayer que introdujo un modo de falla nuevo es el hallazgo más
valioso de hoy, y el que ninguna ronda anterior pudo ver.

## Tamaño y forma del repo

- `src/`: **1,468** archivos `.ts`/`.tsx`, **331,890** líneas.
- `src/app/`: **113** `page.tsx`, **69** `route.ts`.
- `supabase/migrations/`: **252** migraciones, última `0271`.
- `normas/`: **34** fichas `.yaml` + `normas/datos/`.
- Suite: **697** archivos de prueba, **9,918** pruebas.

## Dónde está todo

| Área | Rutas |
|---|---|
| Panel del cliente | `src/app/dashboard/` (~31 páginas, todas filtradas al tenant) |
| Consola de Javier | `src/app/admin/` (cruza tenants a propósito; el único permiso así es `lib/admin/negocio.ts`) |
| API | `src/app/api/` (69 rutas), `middleware.ts` |
| Motor | `src/lib/likida/` — `processor.ts`, `repo.ts`, `conv.ts`, `cuadre/`, `contabilidad/`, `intake/`, `conectores/` |
| Agentes / LLM | `src/lib/agents/`, `src/lib/llm/`, `src.lib/likida/tools.ts` |
| Formato de cifras | `src/lib/formato.ts` — **única** fuente; hay prueba que falla si aparece `toLocaleString('es-MX')` en otro archivo |
| Normas fiscales/legales | `normas/*.yaml` (texto normativo con vigencia) |
| Esquema | `supabase/migrations/`, `supabase/verificaciones.sql` |

## Reglas del producto que un hallazgo puede violar

Están en `CLAUDE.md` y son el criterio de severidad, no decoración:

1. **Nunca inventar una cifra.** Si no hay dato real se dice qué falta
   (`dashboard/pendiente.tsx`, `EstadoVacio`). Una estimación se declara con su
   supuesto a la vista.
2. **Un rótulo tiene que ser verdad.** «del periodo» ⇒ la consulta filtra por
   fecha. Un filtro en pantalla mueve TODO lo que hay debajo.
3. **El formato de cifras vive solo en `lib/formato.ts`.**
4. **Fallar cerrado y decirlo.** supabase-js reporta errores POR VALOR: sin
   comprobar `error`, una base caída se lee como «no hay nada». Ver `exigir()` y
   `traerTodo()` (PostgREST recorta a 1,000 filas en silencio).

## Trampas ya pisadas — no volver a reportarlas como hallazgo nuevo

- `gasto.ocr_raw` está MUERTA; la prueba de OCR es `ocr_confianza`.
- La tabla `politica_gasto` está muerta; la política viva es
  `tenant.config.politica` vía `getConfig()`.
- `wa_mensaje_procesado` NO tiene `tenant_id`.
- `viaje.estatus` ∈ {`abierto`,`en_cuadre`,`liquidado`}; `app_user.rol` ∈
  {superadmin, flota_admin, contador, operador, encargado}.
- **SÍ tienen escritor** (no reportar «falta el escritor»): `cliente`, `unidad`,
  `tarifa`, `factura_emitida`, `pago_recibido`, `posicion`, `cotizacion`,
  `mantenimiento`, `ticket_mensaje`.
- **Siguen sin escritor**: `geocerca`, `terminal`, `portal_credencial`,
  `invitacion`; muertas de facto `campania`/`envio_mensaje`.
- La base está en cero porque **no hay clientes todavía**, no por falta de
  código. Tabla vacía ≠ bug.
- `requireSessionTenant(destino)` pierde el query string; por eso existe
  `dashboard/sufijo.ts`.

## Reglas de esta ronda

- **Ningún auditor toca código.** Cada uno escribe **un solo** archivo:
  `docs/auditoria-22/<rubro>.md`.
- Un hallazgo sin `archivo:línea` abierto y leído, y sin escenario con valores
  concretos, se descarta en la verificación.
- El orquestador abre cada hallazgo contra el código antes de anotarlo. Los
  falsos entran al reporte como falsos, con la razón.
