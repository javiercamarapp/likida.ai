# MAPA — auditoría 19 (24-ago-2026)

Corrida **desatendida, en la nube** (routine de Claude Code). Rama `claude/auditoria-19`.
Árbol limpio al arrancar (`git status` → *nothing to commit, working tree clean*) →
**autofix habilitado**.

**Ronda COMPLETA**, no continuación: `gh pr list --state open` (vía MCP de GitHub) no
devuelve ningún PR de auditoría abierto — el #34 de la 18 ya se fusionó (`bb6eefc`) — y
`src/`, `supabase/` y `normas/` cambiaron desde entonces. Se relanzan los doce rubros.

## El delta: `583fec4` → `8b43121`

**162 archivos, +10,807 / −548** en `src/`, `supabase/`, `normas/`
(48 archivos nuevos y 94 modificados solo en `src/`).

`master` viene de fusionar los PR #42–#48 más el commit grande de ayer,
`8b43121` *«endurecer Likida de punta a punta para operación enterprise»*
(87 archivos, +3,777 / −2,212), que es el que manda en esta ronda.

### 1 · Contabilidad y póliza — el export deja de ser un CSV (#45, #47, #48)

Módulo **nuevo completo**: `src/lib/likida/contabilidad/` — `poliza.ts`, `catalogo.ts`,
`perfiles.ts`, `formatos.ts`, con sus pruebas. Ruta nueva
`src/app/api/export/poliza/route.ts`. Migración `0175_poliza_datos.sql`.

Historia de tres pasadas, y esa historia es el contexto que necesita el auditor:
`f1458d7` lo convierte en asiento contable, `62befa0` corrige que *«la póliza leía un
catálogo de cuentas que nadie escribe»*, `df6b1be` que *«el rótulo de CONTPAQi prometía
de menos»*. Tres correcciones seguidas sobre el mismo módulo recién nacido.

### 2 · GPS — la primera tabla con escritor real (#46)

`src/lib/likida/conectores/posiciones.ts` y `sincronizar_gps.ts` (**nuevos**), cron
`src/app/api/cron/gps/route.ts`, migraciones `0176_gps_ingesta.sql` y
`0183_indices_duplicados_gps_wa.sql`.

**Ojo con `CLAUDE.md`:** hasta ayer `posicion` figuraba entre las tablas *sin escritor*.
Ya lo tiene. La lista de trampas del `CLAUDE.md` no se actualizó — verificar antes de
citarla.

### 3 · Entregas distribuidas y outbox durable (#44, `8b43121`)

`0177_entregas_distribuidas.sql`, `0180_reservas_agente_y_outbox_wa.sql`,
`src/lib/likida/wa_outbox.ts` (**nuevo**), cron `src/app/api/cron/wa-outbox/route.ts`.
Los dos P0 de #44 eran *«el CFDI que se perdía»* y *«el "listo" que adelantaba»*.
El rubro agéntico y el de backend tienen aquí su superficie nueva: leases, reservas y
un outbox son tres relojes que se pueden desincronizar.

### 4 · Perfil, onboarding por chat y régimen 624

`src/lib/likida/perfil/` (**nuevo**: `entrevista.ts`, `entrevista-agente.ts`,
`entrevista-aplicar.ts`, `onboarding.ts`, `preguntas.ts`, `documentos.ts`),
`src/app/dashboard/onboarding/{page,chat,forma}.tsx`, ruta
`src/app/api/dashboard/onboarding-chat/route.ts`, migraciones `0169_tenant_perfil.sql`
y `0172_regimen_624_coordinados.sql`.

Es superficie **agéntica nueva que le escribe a la configuración fiscal del tenant**:
una entrevista conducida por un modelo que termina aplicando cambios a `tenant.perfil`.

### 5 · Fiscal — monedero, descuento y una ficha nueva

- `0168_consolidado_litros.sql`, `0171_gasto_descuento.sql` (**la columna que la c4 pidió
  para el estímulo de peaje sobre `@Descuento`**), `0174_diferencia_redondeo.sql`,
  `0178_fiscal_retencion_arco_y_perfiles_erp.sql`.
- `src/lib/likida/intake/padron_monederos.{ts,json}`, `evidencia_monedero.ts`
  (**nuevos**), `src/app/dashboard/contador/estimulo-peaje.tsx` (**nuevo**).
- **`normas/rmf-2026-3.3.1.7.yaml` es ficha nueva** — hay que abrirla y compararla contra
  el código que dice implementarla.
- Pruebas nuevas: `engine_combustible_medio_pago.test.ts`, `fiscal_iva_medio_pago.test.ts`.

### 6 · ARCO, privacidad y purga (`e41fcc8`, `0173_ejecutor_arco.sql`)

*«ARCO: una cancelación que de verdad cancela, y el borrado de Storage»* —
`src/lib/likida/storage_borrado.ts` (**nuevo**), `privacidad.ts` y
`src/app/api/cron/purgar/route.ts` modificados. La c4 dejó abierto que la purga de
prospectos borraba `contacto_nombre` **y nada más** mientras el aviso promete correo y
teléfono: verificar si esto lo cerró.

### 7 · CRM Cal.com y funnel comercial

`src/lib/admin/calcom.ts` (**nuevo**) y **dos** rutas de webhook:
`src/app/api/webhook/calcom/route.ts` **y** `src/app/api/webhooks/calcom/route.ts`
(*webhook* y *webhooks*, singular y plural). Migraciones `0181_crm_remediacion.sql`,
`0182_crm_scian_seis_digitos.sql`, `0184_search_path_trigger_prospecto.sql`.

### 8 · Seguridad y CI

`2151b98` *«análisis estático que SÍ corre, y ReDoS medido en vez de adivinado»*
(`src/lib/likida/regex_sin_redos.test.ts`), `0170_cerrar_definer_0167.sql`,
`0184_search_path_trigger_prospecto.sql`, `f5f9313` *«fuera el check que no puede correr,
y por escrito lo que falta habilitar»*, y `src/lib/pruebas/arbol_sin_enlaces_ajenos.test.ts`
— la prueba que ancla OPER-C4-1 (el symlink de `node_modules`).

## Qué NO tocar / cómo se verifica aquí

- **Ningún auditor edita archivos.** Cada uno escribe **un solo** archivo:
  `docs/auditoria-19/<rubro>.md`.
- **NO correr `pruebas-manuales/*.prueba.ts`** — hacen llamadas reales de pago.
- **NO correr `npm run build`**: en la nube no hay `.env` (Supabase, OpenRouter,
  Facturapi, Upstash) y su fallo no dice nada del código.
- La compuerta de esta ronda es `npm test` + `npx tsc --noEmit` + `npm run lint`.
- La base está **en cero** (0 viajes) porque no hay clientes, no porque falte código:
  una tabla vacía no es prueba de que nadie la escriba. Verificar el escritor, no las filas.

## Estructura del repo

- `src/app/(dashboard)/` — el panel del **cliente**, ~31 páginas, todas filtradas al tenant.
- `src/app/admin/` — la consola del dueño; `lib/admin/negocio.ts` es la única función que
  cruza tenants a propósito.
- `src/lib/likida/` — el motor: `cuadre/` (dinero), `intake/` (OCR, CFDI, SAT),
  `liquidacion/` (PDF, deducibilidad), `facturacion/`, `contabilidad/` (nuevo),
  `perfil/` (nuevo), `conectores/` (nuevo), `agentes/`.
- `src/lib/llm/` — OpenRouter, modelos, tool executor.
- `supabase/migrations/` — 184 migraciones; `supabase/verificaciones.sql` es la red SQL.
- `normas/*.yaml` — **fuente de verdad fiscal**. Las marcadas
  `verificado_fuente_primaria` traen texto literal y ganan cualquier discusión.
- `lib/formato.ts` — **único** lugar donde vive el formato de cifras (hay prueba que falla
  si `toLocaleString('es-MX')` aparece en otro archivo).

## Reglas del producto que un hallazgo no puede contradecir

1. **Nunca inventar una cifra.** Sin dato real se dice qué falta; no se rellena con ceros
   ni con ejemplos. Una estimación se puede mostrar **declarada** y con su supuesto.
2. **Un rótulo tiene que ser verdad.** Si dice «del periodo», la consulta filtra por fecha.
3. **Fallar cerrado y decirlo.** supabase-js reporta errores por valor: sin comprobar
   `error`, una base caída se lee como «no hay nada».
4. Las tools declaran `properties: {}` **a propósito**: el modelo decide *cuándo*, nunca
   *con qué datos*. Proponer «validar mejor los argumentos» es no haber leído el código.
