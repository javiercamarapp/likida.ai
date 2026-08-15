# Auditoría 8 — Síntesis y recalificación

**Global: 4.8** (anterior: 5.2).

La ronda 8 recorta el promedio porque frontend, agentico, fiscal, legal, rendimiento y datos declaran mirada más profunda, pero la adversarial dejó en pie solo 12 de 33 hallazgos y backend y tool-calling no tuvieron cobertura real: el inventario a cerrar son seis ALTOS; pruebas y arquitectura se anclan; operabilidad declara 4 sobre un piso de 3.5 con hallazgos que esta vez sí sobrevivieron; seguridad se queda en 6 sin inventario verificado de esta ronda.

## Las 12 notas
| Rubro | Anterior | Hoy | Porqué del movimiento |
|---|---|---|---|
| frontend | 6.5 | 5.5 | Baja por mirada más profunda: el auditor declara que la nota previa estaba inflada y que persisten desincronizaciones entre `src/types/likida.ts` y los mapeos visuales de liquidación y combustible. La adversarial recortó los cinco hallazgos por referencia inválida. El 5.5 es la nota del reporte. El movimiento pesa más que el inventario que quedó en pie. |
| backend | 4 | 4 | Sin reporte usable (solo invocaciones de listado; no hay nota ni hallazgos). Se hereda la previa y se dice: no hay evidencia de esta ronda para subir ni bajar. El ALTO verificado de la ronda 7 (`duplicados.ts:3`) no se reconfirmó aquí. |
| agentico | 6 | 5 | Baja por mirada más profunda: el auditor declara que la nota previa estaba inflada por falta de lectura del ciclo de vida y que un mensaje a medias puede dejar efecto duplicado o una confirmación que el humano nunca ve. La adversarial dejó en pie solo el MEDIO del prompt (`prompts.ts:36`); tres hallazgos cayeron por referencia inválida. El CRÍTICO de `processor.ts:312` no pasó por la adversarial. El 5 es la nota del reporte: el porqué (ciclo que no cierra de forma determinística) pesa más que el recorte. El CRÍTICO no se promociona a backlog. |
| tool-calling | 6 | 6 | Sin reporte usable (respuesta insuficiente tras reintento; 0 chars; rubro sin cobertura real). Se hereda la previa y se dice: no hay evidencia de esta ronda para subir ni bajar. Los tres abiertos de la ronda 7 (`openrouter.ts:158`, `openrouter.ts:104`, `tool-executor.ts:71`) no se reconfirmaron aquí. |
| seguridad | 6 | 6 | Sin movimiento. El auditor declara 6: no hay evidencia de arreglo, pero tampoco un camino confirmado sin autenticar a datos de tenant. El CRÍTICO de `env.ts:12` otra vez no pasó por la adversarial; los tres hallazgos que sí entraron cayeron (referencia inválida o sin `archivo:línea`). Se conserva el 6 declarado: no se premia un arreglo que nadie leyó ni se aplica una segunda baja sin inventario verificado de esta ronda. |
| fiscal | 5.5 | 5.0 | Baja por mirada más profunda: el auditor sostiene que persistir el estímulo de casetas sobre bruto con IVA y la retención IVA 4% ciega ya no cabe en un 5.5. Esta vez la adversarial dejó en pie el ALTO de retención 4% (`cfdi.ts:88`) y el BAJO de leyenda (`leyendas.ts:45`); casetas y RFA 8% cayeron por referencia inválida. El 5.0 es la nota del reporte: el porqué (motor que expone aritmética fiscal al contralor) pesa más que el recorte, y el ALTO verificado lo sostiene. |
| legal | 5.0 | 4.5 | Baja por mirada más profunda en transferencia transfronteriza a LLMs y sanitización ciega a datos patrimoniales. La adversarial dejó en pie dos ALTOS (`sanitizar.ts:28` y `privacidad.ts:65`) y el MEDIO del aviso (`privacidad.ts:32`). El CRÍTICO de `processor.ts:84` no pasó por la adversarial. El 4.5 es la nota del reporte: el movimiento es de alcance, y esta vez el inventario verificado lo sostiene. El CRÍTICO no se promociona. |
| arquitectura | 6 | 6 | Sin reporte usable (el auditor declara que no abrió ningún archivo). Se hereda la previa y se dice: no hay evidencia de esta ronda para subir ni bajar. Las fronteras y la deuda de `processor.ts` / 0075 quedan como estaban. |
| pruebas | 4 | 4 | Sin movimiento oficial. El auditor declara 4 y escribe «antes 6», pero la síntesis de la ronda 7 ya había dejado el rubro en 4. Esta ronda no reabrió tests: el ALTO del export cayó por falta de `archivo:línea`; los MEDIOS de `cobranza_pura` y del CI ni siquiera pasaron por verificación. Se conserva el 4 declarado: no se aplica una segunda baja sobre una ancla que ya estaba cortada, y no se reescribe deuda no verificada. |
| operabilidad | 3.5 | 4 | Se toma el 4 que el reporte declara. El auditor escribe «antes 6.5» y corta por deuda que cobró factura; la ancla oficial ya era 3.5. No es un premio por mejora: es la nota del reporte, y a diferencia de la ronda 7 —donde los cuatro hallazgos cayeron todos— esta adversarial dejó en pie dos ALTOS (`logger.ts:38`, `instrumentation.ts:14`) y un MEDIO (`.env.example:6`). El ALTO del export 200 `{ ok: false }` cayó por referencia inválida y no se reescribe. |
| rendimiento | 4.5 | 4.0 | Baja por mirada más profunda: el auditor declara que la nota previa estaba inflada y que el peor caso sumado excede el límite de la plataforma y falla callado. La adversarial dejó en pie solo el MEDIO de modelo caro (`openrouter.ts:53`); N+1, OCR y timeout de cola cayeron por referencia inválida. El CRÍTICO de `presupuesto.ts:88` no pasó por la adversarial. El 4.0 es la nota del reporte: el porqué (presupuesto de tiempo que no cabe) pesa más que el recorte. El CRÍTICO no se promociona. |
| datos | 5 | 4 | Baja por mirada más profunda: el auditor declara que la nota previa estaba inflada y que la base no impone las invariantes que la app asume. La adversarial dejó en pie el ALTO de estados (`likida.ts:141`) y el MEDIO de RLS (`verificaciones.sql:102`); unicidad de CFDI, `CHECK` de no negatividad y migraciones sin down cayeron por referencia inválida. El 4 es la nota del reporte: el porqué (integridad que vive en `repo.ts`, no en Supabase) pesa más que el recorte. |

Suma de las doce notas declaradas: 58.0 ÷ 12 = **4.8**.

## Críticos y altos a cerrar (ID + archivo:línea)

No hay críticos verificados.

- **A8-FIS-01** [ALTO] `src/lib/likida/intake/cfdi.ts:88` — reincidente: la retención IVA 4% se aplica fija sin validar personalidad jurídica del receptor (art. 1-A LIVA: solo cuando el receptor es persona moral). En la ronda 7 el mismo reclamo cayó por referencia inválida en `impuestos.ts:88`; aquí ancla en `cfdi.ts:88` y la adversarial lo dejó en pie.
- **A8-LEG-01** [ALTO] `src/lib/likida/intake/sanitizar.ts:28` — reincidente de A7-LEG-02: el sanitizador cubre tokens obvios y deja pasar CLABE (18 dígitos) y PAN de tarjeta (16 dígitos) en el prompt de auditoría y extracción.
- **A8-LEG-02** [ALTO] `src/lib/likida/privacidad.ts:65` — no hay interceptor de derechos ARCO ni revocación vía WhatsApp; el módulo es catálogo de textos. En la ronda 7 quedó como MEDIO propuesto; esta ronda lo eleva y la adversarial lo confirma como ALTO.
- **A8-OPE-01** [ALTO] `src/lib/logger.ts:38` — el log de fallo de WhatsApp registra destino y error, no `liquidacionId` ni `flotaId`: con 250 timeouts no se sabe qué liquidación quedó sin notificar.
- **A8-OPE-02** [ALTO] `src/instrumentation.ts:14` — Sentry se inicializa con `SENTRY_DSN ?? ""`; DSN vacío y sin alerta viva a un humano: el error de las 3:12 muere con el contenedor.
- **A8-DAT-01** [ALTO] `src/types/likida.ts:141` — `EstadoLiquidacion` es un union en TypeScript; la columna es `TEXT NOT NULL` sin `CHECK`. Un `UPDATE` desde la consola siembra un estado que el front no sabe pintar.

## Falsos y descartados (con razón)

La adversarial verificó 12 y descartó 21. Se listan todos: es lo que mantiene honestos a los auditores de mañana. Un hallazgo sin `archivo:línea` vivo no entra al backlog como si fuera deuda confirmada.

**frontend (5)**
- [ALTO] Fallback de odómetro nulo renderiza "0 km" y falsea el cálculo visual de rendimiento de combustible — `src/app/(dashboard)/combustible/page.tsx:142` — **referencia inválida**.
- [ALTO] Estados de timbrado (`error_sat`, `en_cola`, `rechazado`) caen en badge neutro con texto crudo — `src/app/(dashboard)/liquidaciones/[id]/page.tsx:88` — **referencia inválida**.
- [MEDIO] Inestabilidad de `key` en lista de deducciones — `src/components/liquidaciones/tabla-deducciones.tsx:64` — **referencia inválida**.
- [MEDIO] Desfase de zona horaria (UTC vs local) desplaza la fecha de Carta Porte — `src/lib/formatters.ts:45` — **referencia inválida**.
- [MEDIO] Formateo inconsistente de moneda entre cabecera y tabla de desglose — `src/components/liquidaciones/resumen-financiero.tsx:32` — **referencia inválida**.

**agentico (3)**
- [ALTO] Ciclo agéntico sin timeout deja el mutex tomado — `src/lib/agents/run.ts:143` — **referencia inválida**.
- [ALTO] Reintento de cierre de lote sin idempotencia duplica el efecto — `cuadre/guardia.ts:88` — **referencia inválida**.
- [MEDIO] Barrera de ráfaga envía confirmación parcial sin informar del mensaje fallido — `conv.ts:22` — **referencia inválida**.

**seguridad (3)**
- [ALTO] Ruta administrativa de exportación protegida solo por el matcher — `middleware.ts:7` — **referencia inválida**.
- [MEDIO] URL firmada con TTL de 7 días — `src/lib/files.ts:42` — **referencia inválida**.
- [MEDIO] CVE en Next.js vía `next/image` — **sin `archivo:línea`**.

**fiscal (2)**
- [ALTO] Acreditamiento de casetas al 50% sobre bruto con IVA — `src/lib/likida/liquidacion/deducibilidad.ts:142` — **referencia inválida**.
- [MEDIO] Facilidad RFA 8% sin retención ISR 16% — `src/lib/likida/liquidacion/deducibilidad.ts:215` — **referencia inválida**.

**pruebas (1)**
- [ALTO] `api/export/facturas-proveedor` reincide sin arnés — **sin `archivo:línea`**.

**operabilidad (1)**
- [ALTO] Export de facturas-proveedor responde 200 `{ ok: false }` — `src/app/api/admin/exportar-facturas/route.ts:19` — **referencia inválida**.

**rendimiento (3)**
- [ALTO] N+1 en consultas de movimientos por viaje — `src/lib/repo.ts:203` — **referencia inválida**.
- [ALTO] Imagen de comprobante se envía sin redimensionar a OCR — `src/lib/intake/ocr.ts:76` — **referencia inválida**.
- [MEDIO] Timeout individual de cola no considera la suma de eslabones — `src/lib/queue/consumer.ts:41` — **referencia inválida**.

**datos (3)**
- [ALTO] Unicidad de CFDI asumida en la app — `supabase/migrations/20240601_embudo.sql:88` — **referencia inválida**.
- [ALTO] Sin `CHECK` de no negatividad en columnas monetarias — `supabase/migrations/20240303_pagos.sql:24` — **referencia inválida**.
- [MEDIO] Migraciones sin “down” real — `supabase/migrations/20240606_renumber_deductible.sql:14` — **referencia inválida**.

**backend / tool-calling / arquitectura:** no aportaron hallazgos que descartar. Backend y tool-calling no tuvieron reporte. Arquitectura lo declara: no hubo lectura. Quedan fuera de esta lista a propósito.

El CRÍTICO de agentico (`src/lib/likida/processor.ts:312`, enrutador de salida por último emisor), el de seguridad (`src/lib/env.ts:12`, fallback de service role), el de legal (`src/lib/likida/intake/processor.ts:84`, transferencia transfronteriza antes de consentimiento) y el de rendimiento (`src/lib/likida/presupuesto.ts:88`, suma de eslabones vs `maxDuration`) **no pasaron por la adversarial**. El ALTO de escritura de pagos, los MEDIOS de `cobranza_pura` y del CI, y los ALTOS de rondas previas que no se reabrieron aquí **no se promocionan a “a cerrar”**. Quedan como reclamo del rubro, no como deuda verificada de esta ronda. Los ALTOS verificados de la ronda 7 que no se reabrieron (`A7-BE-01`, `A7-TC-01`, `A7-LEG-01`) y los de las rondas 5–6 tampoco se reescriben como si esta adversarial los hubiera vuelto a abrir. `A7-LEG-02` se reconfirmó como `A8-LEG-01`.

## Propuestos (medios y bajos que esperan)

Solo lo que la adversarial dejó en pie. No se reintroducen los 21 descartados disfrazados de backlog.

- [MEDIO] agentico — `src/lib/agents/prompts.ts:36` — el prompt autoriza al modelo a narrar montos que deberían salir de la herramienta determinística; el contralor puede autorizar una cifra inventada.
- [MEDIO] legal — `src/lib/likida/privacidad.ts:32` — el aviso no informa toma de decisiones automatizadas ni revisión humana (LFPDPPP marzo 2025).
- [MEDIO] operabilidad — `.env.example:6` — `DATABASE_URL`, `SENTRY_DSN` y `TELEGRAM_BOT_TOKEN` vacíos: la máquina limpia arranca a medias y Sentry descarta eventos sin ruido.
- [MEDIO] rendimiento — `src/lib/llm/openrouter.ts:53` — tareas administrativas simples (RFC, UUID, cantidad) van a un modelo caro sin benchmark de costo/precisión.
- [MEDIO] datos — `supabase/verificaciones.sql:102` — RLS de `pagos` no queda anclado: un `select * from public.pagos` con token `authenticated` no tiene política de `flota_id` verificada.
- [BAJO] fiscal — `src/lib/likida/cuadre/leyendas.ts:45` — la leyenda de viáticos en el PDF omite fundamentación de RFA y LISR. Reincidente del BAJO propuesto en la ronda 7.

## Presupuesto de la ronda (gasto vs tope)

**Gastado: $0.2157** · ledger: `docs/auditoria-8/ledger.json`. El tope no viene en el paquete de orquestación; no se inventa.