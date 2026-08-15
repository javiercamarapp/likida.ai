# Pendientes y resoluciones — auditoría 11 (cierre del ciclo)

Estado de cada hallazgo VERIFICADO de la pasada experta, tras el aplicador con gate (tsc+tests+commit) y lectura física del código.

## Corregido (ésta ronda, commit propio)
- **legal · CLABE/tarjetas en logs** — `src/lib/logger.ts`: el redactor de PII ahora borra CLABE (18 dígitos → `[CLABE]`) y PAN (16 → `[TARJETA]`), respetando el no-toque de epochs de 13 dígitos. 2 tests nuevos; logger.test.ts 13/13.

## Refutado con contexto (falsos positivos del auditor — el fixer + lectura física los tiró)
- **fiscal · estímulo casetas engine.ts:142** — la línea citada es un comentario; la base del estímulo es decisión de dominio documentada en `normas/lif-2026-20-A.yaml` (H4, SIN RESOLVER, deliberadamente con subtotal).
- **fiscal · retención IVA cfdi.ts:88** — el archivo solo decodifica QR/barras; no aplica retenciones.
- **fiscal · leyenda CFF 52** — artículo vigente; la leyenda aclara que NO es dictamen.
- **legal · ARCO en privacidad.ts:65** — la línea es comentario; el canal PRIVACIDAD ya existe (gestión operativa vive en otro módulo).
- **legal · perfilamiento privacidad.ts:32** — la cláusula de decisiones automatizadas YA existe.
- **operabilidad · .env.example:12** — variables secretas deliberadamente vacías.
- **tool-calling · dedup por id y no por efecto** — falso: `makeExecutor` cachea por NOMBRE (efecto), decisión documentada en el propio código; cambiarlo a args debilitaría la defensa.

## Pendiente de decisión humana (no se auto-arregla: es dominio/infra)
- **tool-calling · finish_reason 'length' se trata como completo** (`openrouter.ts` chat/generateWithTools) — requiere tocar flujo de chat con riesgo de regresión; necesita prueba que reproduzca el escenario exacto con tools.
- **tool-calling · costo del fallback con el modelo original** — requiere reescribir registro de proveedor real en generateWithTools.
- **operabilidad · Sentry sin alerta viva** (`instrumentation.ts:21`) — cableado de cuenta/infra (channels, webhooks), no es un cambio de código local.
- **backend · dedup de importación en memoria** (`duplicados.ts`) — debate real: el fixer con contexto lo refutó (hay llaves de negocio), el auditor mantiene el riesgo multr-proceso; requiere decisión de esquema (unique constraint).
- **rendimiento · N+1 repo.ts** — fix batched con prise en un camino de pagos; requiere test de integración.

## Cómo correrlo de nuevo
- Auditoría completa: `npm run auditoria` (ronda nueva con AUDIT_RONDA=N)
- Aplicar fixes con gate: `AUDIT_AUTOFIX=1 npm run auditoria`

## Fallo PRE-EXISTENTE en suite (ajeno a este trabajo)
- `src/lib/agents/analista_prompt.test.ts > cifras solo de tools…` — el test exige la frase "promedios propios, extrapolaciones" que ya no está en el prompt del analista; falla igual con y sin mis cambios (verificado con git stash). Reparación: sincronizar test con el prompt actual o reincorporar la frase.
