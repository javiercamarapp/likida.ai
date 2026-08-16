# Auditoria 12 - Sintesis y recalificacion

**Global: 4.4** (anterior: 4.8). Promedio de 12 rubros: once con nota firmada por su reporte y operabilidad heredada porque el entregable no declaró cifra.

La ronda 12 vuelve a cobrar deuda y vuelve a chocar con el mismo límite: donde se leyó de verdad, los tres ALTOS de tool-calling siguen rotos y verificados; donde no se leyó, la nota es herencia o piso conservador, no aval. La verificación adversarial dejó **3 hallazgos en pie y descartó 23**. Casi todo el frontend, el fiscal, el legal, el agéntico, la seguridad, las pruebas y los datos se cayeron por referencia inválida o por falta de `archivo:línea`. El número global refleja lo que cada reporte firmó, no el recuento post-verificación; el porqué pesa más que la cifra. El descenso 4.8→4.4 lo explican tres movimientos de reporte (frontend 4.5→4.0, fiscal 4.0→3.5, datos 7→4) y la entrada de rendimiento al promedio con un 4 de piso no verificado.

## Las 12 notas

| Rubro | Anterior | Hoy | Porqué del movimiento |
|---|---|---|---|
| frontend | 4.5 | 4.0 | El reporte baja por deuda que cobró factura (odómetro nulo, badge de timbrado, `key` volátil, TZ, formato monetario) y por una mirada más profunda a contratos de datos y mutaciones con pérdida de foco. Adversarial **descartó los cinco hallazgos** por referencia inválida. La nota se respeta por contrato de rubro, no porque sobreviva evidencia. |
| backend | 4 | 4 | Sin movimiento. El auditor no ejecutó lectura; cero hallazgos, cero reconfirmaciones. El 4 es herencia ética, no juicio verificado sobre idempotencia, locks ni doble escritura. |
| agentico | 4 | 4 | El reporte sostiene 4 porque no hubo lectura real que permita subir ni bajar. Los cuatro abiertos se listan como deuda no firmada. Adversarial los invalidó a los cuatro por falta de `archivo:línea`. Sin mitigación verificada no sube; sin agravante verificado no baja. |
| tool-calling | 6 | 6 | Sin movimiento y con evidencia. Tres ALTOS reincidentes **verificados**: costo del fallback con el modelo equivocado, `finish_reason: length` tratado como completo, dedupe por `tool_call.id` y no por efecto. El ancla de 8 (prueba de fallback + sin doble efecto) sigue sin cerrarse. El 6 se confirma, no se hereda a ciegas. |
| seguridad | 5.0 | 5.0 | Sin movimiento. El auditor no dispuso de herramientas de lectura. El CRÍTICO de `env.ts:12` queda **reportado y no confirmado** por segunda ronda consecutiva. Los dos hallazgos que sí fueron a verificación (export admin solo por matcher, URL firmada 7 días) se descartaron por falta de `archivo:línea`. El 5.0 es cláusula de límite, no juicio sobre el código de hoy. |
| fiscal | 4.0 | 3.5 | El reporte baja por deuda que cobró factura (estímulo de casetas sobre bruto con IVA, retención del 4% a ciegas, RFA 8% sin ISR 16%, leyenda abrogada). Adversarial **descartó los cuatro** por referencia inválida. La nota se respeta por contrato; la evidencia de esta ronda no sobrevivió. Los ALTOS verificados en la ronda 11 no se reabrieron en las líneas que entonces sí existían. |
| legal | 4.0 | 4.0 | El reporte declara mirada más profunda y reincidencia, pero adversarial **descartó los cuatro** (sanitizador, ARCO, aviso, fotos a LLM) por falta de `archivo:línea` útil. Sin agravante verificado no baja; sin mitigación verificada no sube. El riesgo mayor sigue siendo la salida de datos patrimoniales a LLMs extranjeros, ahora como tesis, no como hallazgo cerrado de esta ronda. |
| arquitectura | 6 | 6 | Sin cobertura: no se abrió ningún archivo. La nota se hereda y se declara como cláusula de límite, no como aval de fronteras (`repo.ts`), pureza del motor ni una sola fuente de conceptos. Bajar o subir sin líneas sería la misma farsa. |
| pruebas | 4 | 4 | Sin movimiento verificado. El auditor no leyó la suite ni el CI. Los tres reincidentes (export sin ancla, pago que no fija `paidAt`, centro de costo 0075) se listaron sin línea y adversarial los **descartó**. El 4 es herencia: la suite puede seguir verde con el dinero roto, y esta ronda no pudo ni confirmarlo ni desmentirlo. |
| operabilidad | 4.0 | 4.0 | **El entregable no declara nota** (quedó en exploración de árbol con llamadas a herramientas, sin hallazgos ni cifra). Se hereda el 4.0 de la ronda 11 y se dice aquí: no es aval de alertas, Sentry ni logs. La ronda 11 sí había verificado Sentry sin `captureException`; esta ronda no lo reabrió. |
| rendimiento | — | 4 | Primera cifra del rubro. El reporte la asigna como piso de deuda no verificada: intentó abrir el rubro y no leyó ningún archivo. Entra al global por primera vez. No es juicio sobre `maxDuration`, N+1 ni costo por operación; es el reconocimiento de que el peor caso no está medido. |
| datos | 7 | 4 | El reporte baja a piso de 4: sin lectura de migraciones, tipos, `repo.ts` ni `verificaciones.sql`, el 7 previo queda sin respaldo y aplica el ancla («la base acepta un estado que el producto no sabe manejar»). Adversarial **descartó** el ALTO de unicidad de CFDI por falta de `archivo:línea`. La baja la firma el reporte; el esquema no se reconfirmó. |

## Criticos y altos a cerrar (ID + archivo:linea)

Solo lo que adversarial **verificó**. El CRÍTICO de secretos y los ALTOS de frontend, fiscal, legal, agéntico, seguridad, pruebas, operabilidad y datos no entran aquí.

- **A12-TC-01** [ALTO] Fallback de proveedor no persiste el modelo real en la contabilidad de costos (REINCIDENTE de A11-TC-01) — `src/lib/llm/openrouter.ts:118`
- **A12-TC-02** [ALTO] Respuesta truncada por `max_tokens` se trata como completa (REINCIDENTE de A11-TC-02) — `src/lib/llm/openrouter.ts:89`
- **A12-TC-03** [ALTO] Deduplicación de tools por `id` de llamada, no por efecto ya ejecutado (REINCIDENTE de A11-TC-03) — `src/lib/llm/tool-executor.ts:47`

**Reportado y no pasado por adversarial** (no se cierra como confirmado; no se silencia):

- **A11-SEG-00** [CRÍTICO] Fallback silencioso `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_ANON_KEY` — `src/lib/env.ts:12`. La ronda 11 ordenó abrirlo primero. La ronda 12 lo volvió a citar y **volvió a no abrirlo**. Si la línea existe, sigue siendo el hallazgo más grave del ciclo. La ronda 13 no tiene excusa.

Los ALTOS que la ronda 11 sí había verificado (`engine.ts:142`, `cfdi.ts:88`, `sanitizar.ts:28`, `privacidad.ts:65`, `instrumentation.ts:21`) **no se reabrieron** en esas líneas. Por la regla de no heredar hallazgo sin reabrir el archivo, no se reescriben aquí como confirmados de la ronda 12. Siguen siendo deuda viva, no sentencia de esta ronda.

## Falsos y descartados (con razon)

La verificación adversarial recortó 23. La razón, en bloque, es la misma que debe disciplinar la ronda 13: **sin `archivo:línea` abierto y re-leído no hay hallazgo**. Citar una ruta que no existe, un módulo sin línea, un rango que el verificador no pudo resolver, o un archivo que cambió de sitio respecto de la ronda anterior, es evidencia falsa.

- [ALTO] frontend — odómetro nulo / rendimiento 0 — `src/app/(dashboard)/liquidaciones/[id]/page.tsx:142` — **referencia inválida**
- [ALTO] frontend — badge de timbrado genérico (`error_sat`, `en_cola`, `rechazado`) — `src/app/(dashboard)/liquidaciones/components/status-badge.tsx:48` — **referencia inválida**
- [MEDIO] frontend — `key` inestable en deducciones — `src/app/(dashboard)/liquidaciones/[id]/components/tabla-deducciones.tsx:86` — **referencia inválida**
- [MEDIO] frontend — TZ UTC vs local en viajes — `src/app/(dashboard)/viajes/components/viajes-table.tsx:64` — **referencia inválida**
- [MEDIO] frontend — montos sin formateo unificado — `src/app/(dashboard)/liquidaciones/[id]/components/resumen-totales.tsx:32` — **referencia inválida**
- [ALTO] agentico — mutex sin timeout — `:0` — **sin `archivo:línea`**
- [ALTO] agentico — reintento de cierre sin idempotencia — `:0` — **sin `archivo:línea`**
- [MEDIO] agentico — LLM narra montos determinísticos — `:0` — **sin `archivo:línea`**
- [MEDIO] agentico — confirmación parcial de ráfaga — `:0` — **sin `archivo:línea`**
- [ALTO] seguridad — export admin solo por matcher — `:0` — **sin `archivo:línea`**
- [MEDIO] seguridad — URL firmada TTL 7 días — `:0` — **sin `archivo:línea`**
- [ALTO] fiscal — estímulo de casetas al 50% sobre bruto con IVA — `src/lib/likida/liquidacion/deducibilidad.ts:142` — **referencia inválida**
- [ALTO] fiscal — retención IVA 4% sin cruzar PF/PM — `src/lib/likida/facturacion/retenciones.ts:58` — **referencia inválida**
- [MEDIO] fiscal — RFA 8% sin retención ISR 16% — `src/lib/likida/liquidacion/deducibilidad.ts:215` — **referencia inválida**
- [BAJO] fiscal — leyenda de viáticos con fundamento abrogado — `src/lib/likida/cuadre/leyendas.ts:84` — **referencia inválida**
- [ALTO] legal — sanitizador ciego a CLABE/PAN — `:0` — **sin `archivo:línea`**
- [ALTO] legal — ARCO inexistente — `:0` — **sin `archivo:línea`**
- [MEDIO] legal — aviso sin decisiones automatizadas / transferencias a IA — `:0` — **sin `archivo:línea`**
- [MEDIO] legal — fotos de comprobantes a LLM sin disociación — `:0` — **sin `archivo:línea`**
- [ALTO] pruebas — export facturas-proveedor sin test de total — `:0` — **sin `archivo:línea`**
- [ALTO] pruebas — pago de liquidación no valida la escritura / `paidAt` — `:0` — **sin `archivo:línea`**
- [MEDIO] pruebas — centro de costo sin caso 0075 — `:0` — **sin `archivo:línea`**
- [ALTO] datos — CFDI único en app, no en base — `:0` — **sin `archivo:línea`**

Estos descartes no prueban que el defecto no exista. Prueban que **esta ronda no puede actuar sobre ellos**. Inventar la línea para «salvar» el hallazgo habría sido peor que perderlo. Varios auditores reescribieron la ruta de la ronda 11 en vez de reabrir el archivo que entonces sí se había leído: eso no es reincidencia verificada, es deriva de referencia.

## Propuestos (medios y bajos que esperan)

Esta ronda **no verificó ningún medio ni bajo**. La cola de la ronda 11 no se reabrió y no se hereda como confirmada:

- **A11-LEG-03** [MEDIO] Aviso de privacidad sin cláusula de decisiones automatizadas / perfilamiento — `src/lib/likida/privacidad.ts:32` — no re-leído
- **A11-OPS-02** [MEDIO] Variables vacías en `.env.example`; arranque que miente y falla tarde — `.env.example:15` — no re-leído
- **A11-FIS-03** [BAJO] Leyenda de viáticos cita artículo abrogado — `src/lib/likida/cuadre/leyendas.ts:45` — no re-leído; la cita nueva (`:84`) se descartó

Quedan fuera de cola (no verificados, no descartados con línea útil, o entregable incompleto): CHECK de `liquidaciones.estado`, CHECK de no negatividad, RLS de `pagos`, migraciones down, Sentry / alerta viva en el camino del dinero, `maxDuration` vs suma de eslabones, y todo lo que operabilidad no llegó a firmar. La ronda 13 los reabre con lectura, o no existen.

## Presupuesto de la ronda (gasto vs tope)

Gastado: **$0.1809**. Tope: no declarado en los insumos de esta síntesis. Ledger: `docs/auditoria-12/ledger.json`.

Cierre para la ronda 13: no heredar hallazgo sin reabrir el archivo; no firmar nota de 6+ en rubro no leído; no entregar exploración de herramientas en lugar de reporte (operabilidad); el primer grep debe ser `env.ts:12` y los tres ALTOS ya verificados de `openrouter.ts` / `tool-executor.ts`. Un rubro que lleve dos rondas sin una sola línea leída no debería sostenerse por herencia: o se lee, o la nota baja por el solo hecho de no poder defenderla.