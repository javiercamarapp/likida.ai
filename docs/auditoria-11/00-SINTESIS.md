# Auditoria 11 - Sintesis y recalificacion

**Global: 4.8** (anterior: —). Promedio de 11 rubros con nota declarada; rendimiento no entregó cifra y no hay síntesis previa de la que heredar.

La ronda 11 cobra deuda y declara límites: donde se leyó, lo abierto sigue roto; donde no se leyó, la nota es herencia, no aval. La verificación adversarial dejó **11 hallazgos en pie y descartó 19** — casi todo el frontend, el sistema agéntico y las pruebas se cayeron por referencia inválida. El número global refleja lo que cada reporte firmó, no el recuento post-verificación; el porqué pesa más que la cifra.

## Las 12 notas

| Rubro | Anterior | Hoy | Porqué del movimiento |
|---|---|---|---|
| frontend | 5.0 | 4.5 | El reporte baja por deuda en liquidación y portal (odómetro nulo, badges de timbrado, `key` volátil, TZ, formato monetario). Adversarial **descartó los cinco hallazgos** por referencia inválida. La nota se respeta por contrato de rubro, no porque sobreviva evidencia. |
| backend | 4 | 4 | Sin movimiento. El auditor no ejecutó lectura; cero hallazgos, cero reconfirmaciones. El 4 es herencia ética, no juicio verificado sobre idempotencia, locks ni doble escritura. |
| agentico | 4 | 4 | El reporte sostiene 4 porque los cuatro abiertos siguen sin arreglo y no hay agravante nuevo. Adversarial invalidó `conv.ts:140`, `guardia.ts:92`, `prompts.ts:36` y `conv.ts:205`. Sin mitigación verificada no sube; sin agravante verificado no baja. |
| tool-calling | 8 | 6 | Deuda que cobró factura. Tres ALTOS reincidentes **verificados**: costo del fallback con el modelo equivocado, `finish_reason: length` tratado como completo, dedupe por `tool_call.id` y no por efecto. El ancla de 8 (prueba de fallback + sin doble efecto) no está cerrada. El propio reporte aclara que la ronda 9 ya había corregido 8→6; esta ronda confirma el 6. |
| seguridad | 5.5 | 5.0 | El reporte baja por deuda más un CRÍTICO nuevo (`SUPABASE_SERVICE_ROLE_KEY` → anon key en `env.ts:12`) que **adversarial no tocó**. Los dos hallazgos que sí fueron a verificación (export admin solo por matcher, URL firmada 7 días) se descartaron por referencia inválida. La baja es del reporte; el CRÍTICO queda reportado, no confirmado. |
| fiscal | 4.5 | 4.0 | Deuda que cobró factura. Quedan en pie dos ALTOS y un BAJO verificados: estímulo de casetas al 50% sobre bruto con IVA, retención del 4% sin cruzar PF/PM, leyenda de viáticos abrogada. El MEDIO de RFA 8% / ISR 16% se descartó por referencia inválida. |
| legal | 4.0 | 4.0 | Se sostiene con reincidencia **comprobada** de los tres abiertos (sanitizador ciego a CLABE/PAN, ARCO inexistente, aviso sin decisiones automatizadas). Sin agravante nuevo ni mitigación. El riesgo mayor sigue siendo la salida de datos patrimoniales a LLMs extranjeros. |
| arquitectura | 6 | 6 | Sin cobertura: no se abrió ningún archivo. La nota se hereda y se declara como cláusula de límite, no como aval de fronteras (`repo.ts`), pureza del motor ni una sola fuente de conceptos. Bajar o subir sin líneas sería la misma farsa. |
| pruebas | 7 | 4 | El reporte declara cobro de deuda (export de facturas sin ancla, pago que no fija `paidAt`, centro de costo sin caso 0075, CI dudosa). Adversarial **descartó los cuatro** por falta de `archivo:línea`. La nota se respeta por contrato; la evidencia no sobrevivió. |
| operabilidad | 6.5 | 4.0 | El reporte baja a piso de 4: hay CI y logs, no hay alerta viva en el camino del dinero. Adversarial **confirmó** Sentry sin `captureException` y `.env.example` vacío; **descartó** el log de WhatsApp y el `200 {ok:false}` de exportación por referencia inválida. La baja la firma el reporte. |
| rendimiento | — | — | El entregable no declara nota (quedó en exploración de árbol, sin hallazgos ni cifra). No hay síntesis previa. **Excluido del global.** |
| datos | 7 | 7 | Sin evidencia nueva para subir ni referencias verificadas para bajar. El ALTO de unicidad de CFDI se descartó por falta de `archivo:línea`; CHECK de estado, no negatividad, RLS de `pagos` y migraciones down no se re-leyeron. El 7 es línea base declarada, no esquema reconfirmado. |

## Criticos y altos a cerrar (ID + archivo:linea)

Solo lo que adversarial **verificó**. El CRÍTICO de secretos y los ALTOS de datos/pruebas/frontend/agéntico no entran aquí.

- **A11-TC-01** [ALTO] Fallback de proveedor no persiste el modelo real en la contabilidad de costos (REINCIDENTE) — `src/lib/llm/openrouter.ts:158`
- **A11-TC-02** [ALTO] Respuesta truncada por `max_tokens` se trata como completa (REINCIDENTE) — `src/lib/llm/openrouter.ts:123`
- **A11-TC-03** [ALTO] Deduplicación de tools por `id` de llamada, no por efecto ya ejecutado (REINCIDENTE) — `src/lib/llm/tool-executor.ts:71`
- **A11-FIS-01** [ALTO] Estímulo de casetas al 50% sobre bruto con IVA: doble beneficio indebido (REINCIDENTE) — `src/lib/likida/cuadre/engine.ts:142`
- **A11-FIS-02** [ALTO] Retención de IVA 4% sin cruzar personalidad jurídica PF/PM (REINCIDENTE) — `src/lib/likida/intake/cfdi.ts:88`
- **A11-LEG-01** [ALTO] Sanitizador ciego a CLABE, cuentas y PAN en prompts de extracción (REINCIDENTE) — `src/lib/likida/intake/sanitizar.ts:28`
- **A11-LEG-02** [ALTO] Sin trámite, supresión ni bloqueo ARCO (REINCIDENTE) — `src/lib/likida/privacidad.ts:65`
- **A11-OPS-01** [ALTO] Sentry inicializado sin captura ni alerta viva (REINCIDENTE) — `src/instrumentation.ts:21`

**Reportado y no pasado por adversarial** (no se cierra como confirmado; no se silencia):

- **A11-SEG-00** [CRÍTICO] Fallback silencioso `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_ANON_KEY` — `src/lib/env.ts:12`. Si la línea existe, es el hallazgo más grave de la ronda. La ronda 12 debe abrirlo primero.

## Falsos y descartados (con razon)

La verificación adversarial recortó 19. La razón, en bloque, es la misma que debe disciplinar la ronda 12: **sin `archivo:línea` abierto y re-leído no hay hallazgo**. Citar una ruta que no existe, un módulo sin línea, o un archivo que el verificador no pudo resolver, es evidencia falsa.

- [ALTO] frontend — odómetro nulo / rendimiento 0 — `src/app/(dashboard)/liquidaciones/[id]/page.tsx:142` — **referencia inválida**
- [ALTO] frontend — badge de timbrado genérico — `src/components/liquidaciones/timbrado-status-badge.tsx:48` — **referencia inválida**
- [MEDIO] frontend — `key` inestable en deducciones — `src/components/liquidaciones/deducciones-table.tsx:87` — **referencia inválida**
- [MEDIO] frontend — TZ UTC vs local en gastos — `src/components/tables/gastos-columns.tsx:64` — **referencia inválida**
- [MEDIO] frontend — montos sin `formatCurrency` — `src/app/(dashboard)/operadores/[id]/page.tsx:112` — **referencia inválida**
- [ALTO] agentico — mutex sin timeout — `conv.ts:140` — **referencia inválida**
- [ALTO] agentico — reintento de cierre sin idempotencia — `guardia.ts:92` — **referencia inválida**
- [MEDIO] agentico — LLM narra montos determinísticos — `prompts.ts:36` — **referencia inválida**
- [MEDIO] agentico — confirmación parcial de ráfaga — `conv.ts:205` — **referencia inválida**
- [ALTO] seguridad — export admin solo por matcher — `middleware.ts:12` — **referencia inválida**
- [MEDIO] seguridad — URL firmada TTL 7 días — `src/lib/auth/signed-url.ts:34` — **referencia inválida**
- [MEDIO] fiscal — RFA 8% sin retención ISR 16% — `src/lib/likida/liquidacion/deducibilidad.ts:114` — **referencia inválida**
- [ALTO] pruebas — export facturas-proveedor sin test de total — `:0` — **sin `archivo:línea`**
- [ALTO] pruebas — pago de liquidación no fija `paidAt` — referencia inválida / línea no abierta
- [MEDIO] pruebas — centro de costo sin caso 0075 — `:0` — **sin `archivo:línea`**
- [MEDIO] pruebas — CI no garantiza todo push — `:0` — **sin `archivo:línea`**
- [ALTO] operabilidad — log WhatsApp sin `liquidacionId`/`flotaId` — `src/lib/whatsapp/client.ts:44` — **referencia inválida**
- [ALTO] operabilidad — export facturas `200 {ok:false}` — `src/app/api/exportar/facturas/route.ts:57` — **referencia inválida**
- [ALTO] datos — CFDI único en app, no en base — `:0` — **sin `archivo:línea`**

Estos descartes no prueban que el defecto no exista. Prueban que **esta ronda no puede actuar sobre ellos**. Inventar la línea para “salvar” el hallazgo habría sido peor que perderlo.

## Propuestos (medios y bajos que esperan)

Verificados, no bloquean el cierre de la ronda, sí deben entrar a cola:

- **A11-LEG-03** [MEDIO] Aviso de privacidad sin cláusula de decisiones automatizadas / perfilamiento — `src/lib/likida/privacidad.ts:32`
- **A11-OPS-02** [MEDIO] Variables vacías en `.env.example`; arranque que miente y falla tarde — `.env.example:15`
- **A11-FIS-03** [BAJO] Leyenda de viáticos cita artículo abrogado — `src/lib/likida/cuadre/leyendas.ts:45`

Quedan fuera de cola (no verificados, no descartados, sin línea útil): CHECK de `liquidaciones.estado`, CHECK de no negatividad, RLS de `pagos` frente a `authenticated`, migraciones down, y todo rendimiento. La ronda 12 los reabre con lectura, o no existen.

## Presupuesto de la ronda (gasto vs tope)

Gastado: **$0.3039**. Tope: no declarado en los insumos de esta síntesis. Ledger: `docs/auditoria-11/ledger.json`.

Cierre para la ronda 12: no heredar hallazgo sin reabrir el archivo; no firmar nota de 6+ en rubro no leído; el primer grep debe ser `env.ts:12` y los tres ALTOS de `openrouter.ts` / `tool-executor.ts`.