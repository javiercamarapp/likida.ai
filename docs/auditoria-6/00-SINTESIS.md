# Auditoría 6 — Síntesis y recalificación

**Global: 5.7** (anterior: 6.6).

La ronda 6 recorta el promedio porque backend, operabilidad, rendimiento y datos declaran que la deuda cobró factura (o que la nota previa estaba inflada), pero la verificación adversarial dejó en pie solo 11 de 40 hallazgos y arquitectura no tuvo cobertura real: el inventario a cerrar es estrecho; agentico, seguridad y arquitectura se anclan por inercia o por falta de lectura, no por evidencia nueva.

## Las 12 notas
| Rubro | Anterior | Hoy | Porqué del movimiento |
|---|---|---|---|
| frontend | 7.5 | 7.0 | Baja por mirada más profunda en detalle, tablas de agentes y sheets de liquidación: el auditor declara desincronización entre enums de `src/types/likida.ts` y diccionarios literales de UI, más fallbacks `0` vs `null` que falsean odómetro y rendimiento. La nota es la del reporte. La adversarial recortó los cinco hallazgos por referencia inválida. El movimiento pesa más que el inventario que quedó en pie. |
| backend | 7 | 4 | Baja porque la deuda cobró factura: el dedup de importación sigue siendo un `Set` de un solo proceso y la rama “oficina” traga la caída de la base y responde 200. La adversarial dejó en pie el ALTO del `Set` (`duplicados.ts:3`), el MEDIO de oficina (`processor.ts:272`) y el BAJO de `pg_errores`. El 4 es la nota del reporte: hay un camino real donde el dinero se escribe dos veces o no se escribe y nadie se entera. No se suaviza el recorte. |
| agentico | 6 | 6 | Sin movimiento verificado. El auditor declara que no abrió el repositorio ni produjo `archivo:línea`; no reporta hallazgos nuevos y deja los tres abiertos heredados como NO VERIFICADOS. Se conserva el 6 declarado: no se premia ni se castiga una ronda sin lectura. |
| tool-calling | 7 | 6 | Baja porque los tres abiertos heredados siguen sin refutación y el ancla de 8 (prueba de atribución de costo en el fallback) sigue ausente. Los tres hallazgos de la ronda se descartaron por falta de `archivo:línea`. El 6 es la nota del reporte: se pierde el 7 por verificación ausente, no por un PoC de `finish_reason: "length"` confirmado. |
| seguridad | 8 | 8 | Sin movimiento. El auditor no abrió ni una línea del rubro y lo declara explícito: la nota se ancla en la ronda previa, no en evidencia de hoy. El riesgo mayor que nombra (webhook de WhatsApp como frontera de confianza) quedó sin lectura. No se sube ni se baja. |
| fiscal | 7.0 | 6.5 | Baja por mirada más profunda: el auditor sostiene que persistir discrepancias de estímulo de casetas y retención IVA 4% en el PDF de liquidación ya no cabe en un 7.0. Los cuatro hallazgos de esta ronda se descartaron todos por falta de `archivo:línea`. La nota es la del reporte: el porqué (motor que expone aritmética fiscal al contralor) pesa más que el recorte adversarial. El ALTO verificado de la ronda 5 (`A5-FIS-01`) no se reconfirmó aquí. |
| legal | 6.0 | 5.5 | Baja por mirada más profunda en ingestión de Despacho/Analista y transferencia transfronteriza a LLMs. Los dos ALTOS de esta ronda cayeron por referencia inválida; sobrevivieron dos MEDIOS (ARCO en `privacidad.ts:65` y sanitizador ciego a tarjetas/placas en `sanitizar.ts:42`). El 5.5 es la nota del reporte: el movimiento es de alcance, no de recálculo cosmética. |
| arquitectura | 6 | 6 | Sin reporte usable (respuesta insuficiente tras reintento; rubro sin cobertura real). Se hereda la previa y se dice: no hay evidencia de esta ronda para subir ni bajar. Las fronteras y la deuda de la 0075 / `processor.ts` quedan como estaban. |
| pruebas | 6 | 6 | Sin movimiento oficial. El auditor declara 6 y escribe “antes 7”, pero la síntesis de la ronda 5 ya había dejado el rubro en 6. Los tres hallazgos se descartaron por falta de `archivo:línea` y el propio auditor admite que no reabrió el árbol. Se conserva el 6 declarado: no se aplica una segunda baja sobre una ancla que ya estaba cortada. |
| operabilidad | 6.0 | 3.5 | Baja porque, según el auditor, la pregunta del rubro —si revienta a las 3 a.m., ¿qué hay a la mañana?— se responde con stdout que nadie lee y un 200 que es error disfrazado. De cinco hallazgos, tres sobrevivieron adversarial (Sentry pasivo en `instrumentation.ts:6`, log WA sin flota/`wa_id` en `logger.ts:15`, `.env.example` flojo). El 500 del cron y el export `200 + {ok:false}` se descartaron por referencia inválida. Se conserva el 3.5 declarado: el porqué pesa más que el recorte. |
| rendimiento | 6.5 | 4.5 | Baja porque el auditor sostiene que el promedio previo estaba inflado por inercia y que el peor caso de la cadena supera `maxDuration`. Ese CRÍTICO no consta en la adversarial. Quedaron en pie dos ALTOS (N+1 en `repo.ts:88`, modelo caro en `openrouter.ts:34`); OCR y timeouts de cola se descartaron por referencia inválida. El 4.5 es la nota del reporte: la razón del movimiento y los dos ALTOS verificados sostienen la baja; el CRÍTICO no se promociona a backlog. |
| datos | 6 | 5 | Baja porque los candados de 0091/0089/0088 siguen, según el auditor, solo en aplicación. Los tres reincidentes (y tres anclas alternativas de las mismas deudas) se descartaron todos por referencia inválida; sobrevive un BAJO de dominio de status en `src/types/likida.ts:82`. La nota es la del reporte: la razón (un `INSERT` en consola puede pintar dinero inválido) pesa más que la falta de ancla de esquema verificada. |

Suma de las doce notas declaradas: 68.0 ÷ 12 = **5.7**.

## Críticos y altos a cerrar (ID + archivo:línea)

No hay críticos verificados.

- **A6-BE-01** [ALTO] `src/lib/likida/duplicados.ts:3` — el dedup de importación es un `Set` en memoria de un solo proceso y el `INSERT` de viajes no tiene llave de negocio (`UNIQUE` / `ON CONFLICT`); dos submits paralelos pueden persistir el mismo manifiesto dos veces y duplicar tarifa en el cuadre.
- **A6-OPE-01** [ALTO] `instrumentation.ts:6` — Sentry se inicializa con DSN y no hay eslabón a un humano (regla de alerta, canal, turno): el incidente queda en consola pasiva.
- **A6-OPE-02** [ALTO] `src/lib/logger.ts:15` — el log de fallo de WhatsApp no lleva flota, liquidación ni `wa_id`; a la mañana hay N errores idénticos y cero alcance.
- **A6-REN-01** [ALTO] `src/lib/likida/repo.ts:88` — N+1: una consulta de operador por cada viaje de la liquidación; con 50 viajes el presupuesto de esa fase se va y empuja el timeout global.
- **A6-REN-02** [ALTO] `src/lib/llm/openrouter.ts:34` — el clasificador de intención usa un modelo caro (`claude-3-opus`) donde uno barato resolvería la misma tarea; quema margen pre-revenue por operación.

## Falsos y descartados (con razón)

La adversarial verificó 11 y descartó 29. Se listan todos: es lo que mantiene honestos a los auditores de mañana. Un hallazgo sin `archivo:línea` vivo no entra al backlog como si fuera deuda confirmada.

**frontend (5)**
- [ALTO] Estado `en_proceso` / `error` en facturación cae en fallback crudo — `src/app/(dashboard)/facturas/components/facturas-table.tsx:28` — **referencia inválida**.
- [ALTO] Fallback de odómetro pinta `0 km` / `0.0 km/L` — `src/app/(dashboard)/viajes/components/viaje-detail-sheet.tsx:142` — **referencia inválida**.
- [MEDIO] Vigencia de licencia sin año frente a póliza con año — `src/app/(dashboard)/operadores/components/operador-detail-sheet.tsx:88` — **referencia inválida**.
- [MEDIO] `key={deduccion.tipo}` en deducciones de liquidación — `src/app/(dashboard)/liquidaciones/components/liquidacion-detail-sheet.tsx:215` — **referencia inválida**.
- [BAJO] Contraste de badges `muted`/`outline` en tema claro — `src/design-system/components/badge.tsx:42` — **referencia inválida**.

**backend (1)**
- [MEDIO] Confirmación “llegué” sin `SELECT … FOR UPDATE` — **sin `archivo:línea`**.

**tool-calling (3)**
- [ALTO] `finish_reason: "length"` tratado como respuesta completa — **sin `archivo:línea`**.
- [MEDIO] Fallback de proveedores sin prueba de atribución de costo al proveedor efectivo — **sin `archivo:línea`**.
- [BAJO] Dedup de tool call por orden/contenido, no por efecto — **sin `archivo:línea`**.

**fiscal (4)**
- [ALTO] Estímulo de casetas al 50% sobre bruto con IVA — **sin `archivo:línea`**.
- [ALTO] Retención IVA 4% fija sin validar tipo de persona del receptor — **sin `archivo:línea`**.
- [MEDIO] Facilidad RFA 8% sin retención ISR 16% — **sin `archivo:línea`**.
- [BAJO] Leyenda de viáticos sin faja de 50 km — **sin `archivo:línea`**.

**legal (3)**
- [ALTO] Despacho por WhatsApp envía PII al LLM antes de consentimiento/aviso — `src/lib/agentes/despacho/motor.ts:88` — **referencia inválida**.
- [ALTO] Analista inyecta nómina, CLABE y teléfonos en el prompt — `src/lib/agentes/analista/motor.ts:142` — **referencia inválida**.
- [BAJO] Export CSV/Excel sin bitácora de descarga — `src/app/api/exportar/route.ts:51` — **referencia inválida**.

**pruebas (3)**
- [ALTO] `api/export/facturas-proveedor` sin arnés — **sin `archivo:línea`**.
- [MEDIO] `cobranza_pura.test.ts` tautológica — **sin `archivo:línea`**.
- [MEDIO] `pruebas-manuales/*.prueba.ts` fuera de CI — **sin `archivo:línea`**.

**operabilidad (2)**
- [ALTO] 500 del cron de conciliación sin canal operativo — `src/lib/observability/index.ts:1` — **referencia inválida**.
- [ALTO] Export de facturas-proveedor responde 200 con `{ ok: false }` — `src/app/api/facturas/proveedor/export/route.ts:4` — **referencia inválida**.

**rendimiento (2)**
- [MEDIO] Imagen de WhatsApp a OCR sin redimensionar — `src/lib/intake/ocr.ts:21` — **referencia inválida**.
- [BAJO] Timeouts por eslabón vs `maxDuration` y cola fantasma — `src/lib/queue/bull.ts:25` — **referencia inválida**.

**datos (6)**
- [ALTO] 0091 sin `CHECK` de signo en montos — `supabase/migrations/0091_liquidaciones_pagos.sql:17` — **referencia inválida**.
- [ALTO] 0089 cobranza sin llave natural a la factura — `supabase/migrations/0089_cobranza_adicional.sql:22` — **referencia inválida**.
- [MEDIO] 0088 historial de agente sin unicidad de turno/sesión — `supabase/migrations/0088_historial_agente.sql:21` — **referencia inválida**.
- [ALTO] 0091 sin candado de signo (ancla alternativa) — `supabase/migrations/0091_liquidacion_cfdi.sql:18` — **referencia inválida**.
- [ALTO] 0089 sin llave natural (ancla alternativa) — `supabase/migrations/0089_cobranza.sql:43` — **referencia inválida**.
- [MEDIO] Estado de pago `TEXT` sin `CHECK` — `supabase/migrations/0091_de_pagos.sql:22` — **referencia inválida**.

**agentico / seguridad / arquitectura:** no aportaron hallazgos que descartar. Agentico y seguridad lo declaran: no hubo lectura. Arquitectura no tuvo reporte. Quedan fuera de esta lista a propósito.

El CRÍTICO de rendimiento (`maxDuration` 60 s vs peor caso ~112 s) **no pasó por la adversarial**. Los tres abiertos heredados de agentico y los de tool-calling/pruebas/fiscal sin línea **no se promocionan a “a cerrar”**. Quedan como reclamo del rubro, no como deuda verificada de esta ronda. Los ALTOS verificados de la ronda 5 (`A5-FIS-01`, `A5-LEG-01`, `A5-LEG-02`) tampoco se reconfirmaron aquí: no se reescriben como si esta adversarial los hubiera vuelto a abrir.

## Propuestos (medios y bajos que esperan)

Solo lo que la adversarial dejó en pie. No se reintroducen los 29 descartados disfrazados de backlog.

- [MEDIO] backend — `src/lib/likida/processor.ts:272` — la rama “oficina” traga `ECONNREFUSED` (u otro fallo de `inserta_instruccion`), hace `console.warn` y responde 200 al webhook: el contralor cree que se ordenó y no hay fila.
- [MEDIO] legal — `src/lib/likida/privacidad.ts:65` — no hay mecanismo transaccional de revocación/supresión ARCO; el módulo es catálogo de textos, no flujo con bloqueo en base.
- [MEDIO] legal — `src/lib/likida/intake/sanitizar.ts:42` — el sanitizador de ingesta cubre RFC/CURP y deja pasar tarjetas y placas de comprobantes OCR al clasificador.
- [MEDIO] operabilidad — `.env.example:12` — `SENTRY_DSN` / `CRON_SECRET` vacíos y el arranque no falla: una máquina “lista” sale a producción sin canal ni secreto de cron.
- [BAJO] backend — `src/lib/likida/pg_errores.ts:27` — se loguea el `code` de Postgres y no el índice de fila del CSV ni el identificador del viaje que rompió el lote.
- [BAJO] datos — `src/types/likida.ts:82` — `EstadoPago` está cerrado en TypeScript y la columna en base es texto libre: un `UPDATE` por consola deja un estado que la app no sabe renderizar.

## Presupuesto de la ronda (gasto vs tope)

Gastado: **$0.1901**. Ledger: `docs/auditoria-6/ledger.json`. Tope de ronda: no consta en el paquete entregado al orquestador; no se afirma cumplimiento ni exceso.