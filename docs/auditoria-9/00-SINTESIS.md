# Auditoría 9 — Síntesis y recalificación

**Global: 4.6** (anterior: 4.8).

La ronda 9 recorta el promedio porque frontend, agentico, seguridad, fiscal y legal declaran mirada más profunda o deuda que cobró factura; la adversarial dejó en pie 18 de 41 hallazgos; backend, arquitectura y pruebas no tuvieron cobertura real; tool-calling por fin aporta inventario verificado (tres ALTOS); operabilidad se queda en 4; rendimiento declara 4.5 sobre un piso oficial de 4.0; datos se queda en 4 con los cinco hallazgos caídos por falta de `archivo:línea`.

## Las 12 notas
| Rubro | Anterior | Hoy | Porqué del movimiento |
|---|---|---|---|
| frontend | 5.5 | 5.0 | Baja por mirada más profunda: el auditor declara que la nota previa estaba inflada y que persisten fallas de renderizado en estados fiscales/operativos y discrepancias de formateo entre vistas. La adversarial recortó los seis hallazgos por referencia inválida. El 5.0 es la nota del reporte. El movimiento pesa más que el inventario que quedó en pie. |
| backend | 4 | 4 | Sin reporte usable de lectura (el auditor declara que no abrió ningún archivo). Se hereda la previa y se dice: no hay evidencia de esta ronda para subir ni bajar. El ALTO verificado de la ronda 7 (`duplicados.ts:3`) no se reconfirmó aquí. |
| agentico | 5 | 4 | Baja porque se atacó: los dos ALTOS reincidentes siguen en pie y el ciclo no cierra de forma determinística. Esta vez la adversarial dejó en pie los cuatro hallazgos (`conv.ts:140`, `guardia.ts:92`, `prompts.ts:36`, `conv.ts:205`). El 4 es la nota del reporte: el porqué (lote a medias con mutex tomado o efecto duplicado) pesa y el inventario verificado lo sostiene. El CRÍTICO de `processor.ts:312` no pasó por la adversarial y no se promociona. |
| tool-calling | 6 | 6 | Sin movimiento de nota. Esta ronda sí tuvo cobertura y la adversarial dejó en pie los tres ALTOS (`openrouter.ts:104`, `openrouter.ts:158`, `tool-executor.ts:71`) que en la ronda 7 quedaron abiertos y en la 8 no se reconfirmaron. El 6 es la nota del reporte: la regla estructural de tools sin parámetros del modelo se mantiene, pero el ancla de 8 (fallback con prueba + sin doble efecto) no está cerrada. No se baja una segunda vez sobre una ancla que ya estaba en 6; el inventario entra a «a cerrar». |
| seguridad | 6 | 5.5 | Baja por deuda que cobró factura: el auditor declara 5.5 y sostiene que se confirmaron dos reincidentes (matcher único y TTL de 7 días) sin evidencia de arreglo. La adversarial recortó ambos por referencia inválida; el CVE lo descartó el propio auditor por falta de camino real. El 5.5 es la nota del reporte: el porqué (autorización de una sola capa que no se releyó como cerrada) pesa más que el recorte. No hay camino confirmado sin autenticar a datos de tenant. El CRÍTICO de `env.ts:12` otra vez no pasó por la adversarial. |
| fiscal | 5.0 | 4.5 | Baja por deuda que cobró factura: el auditor sostiene que persistir el estímulo de casetas sobre bruto con IVA y la retención IVA 4% ciega ya no cabe en un 5.0. Esta vez la adversarial dejó en pie el ALTO de casetas (`engine.ts:142`), el ALTO de retención 4% (`cfdi.ts:88`) y el BAJO de leyenda (`leyendas.ts:45`); RFA 8% cayó por referencia inválida. El 4.5 es la nota del reporte: el porqué (motor que expone aritmética fiscal al contralor) pesa más que el recorte, y los dos ALTOS verificados lo sostienen. |
| legal | 4.5 | 4.0 | Baja por mirada más profunda: sanitización ciega a datos patrimoniales y falta de canal ARCO/revocación siguen sin mitigar. La adversarial dejó en pie los dos ALTOS (`sanitizar.ts:28`, `privacidad.ts:65`) y el MEDIO del aviso (`privacidad.ts:32`). El 4.0 es la nota del reporte: el movimiento es de alcance, y el inventario verificado lo sostiene. El CRÍTICO de `processor.ts:84` no pasó por la adversarial y no se promociona. |
| arquitectura | 6 | 6 | Sin cobertura real (el auditor declara que no abrió ningún archivo). Se hereda la previa y se dice: no hay evidencia de esta ronda para subir ni bajar. Los tres hallazgos cayeron por falta de `archivo:línea`. Las fronteras y la deuda de `processor.ts` / 0075 quedan como estaban. |
| pruebas | 4 | 4 | Sin movimiento oficial. El auditor declara 4. Los tres hallazgos cayeron por referencia inválida. Se conserva el 4 declarado: no se aplica una segunda baja sobre una ancla que ya estaba cortada, y no se reescribe deuda no verificada. |
| operabilidad | 4 | 4 | Sin movimiento oficial. El auditor escribe «antes 6.5» y corta por deuda que cobró factura; la ancla oficial ya era 4. Se toma el 4 que el reporte declara. Esta adversarial dejó en pie dos ALTOS (`logger.ts:18`, `instrumentation.ts:26`) y un MEDIO (`.env.example:3`). El ALTO del export 200 `{ ok: false }` cayó por referencia inválida y no se reescribe. |
| rendimiento | 4.0 | 4.5 | Se toma el 4.5 que el reporte declara. El auditor escribe «antes 6.5» y corta por deuda que cobró factura; la ancla oficial ya era 4.0. No es un premio por mejora: es la nota del reporte, y a diferencia de la ronda 8 —donde solo quedó el MEDIO de modelo caro— esta adversarial dejó en pie el ALTO de N+1 (`repo.ts:87`) y el MEDIO de modelo caro (`openrouter.ts:112`). OCR y timeout de cola cayeron por referencia inválida. El CRÍTICO de `presupuesto.ts:88` no pasó por la adversarial y no se promociona. |
| datos | 4 | 4 | Sin movimiento oficial. El auditor escribe «antes 7» y corta; la ancla oficial ya era 4. Los cinco hallazgos cayeron todos (sin `archivo:línea`). Se conserva el 4 declarado: no se aplica una segunda baja sobre una ancla que ya estaba cortada, y no se reescribe deuda no verificada. El ALTO verificado de la ronda 8 (`likida.ts:141`) no se reconfirmó aquí. |

Suma de las doce notas declaradas: 55.5 ÷ 12 = **4.6**.

## Críticos y altos a cerrar (ID + archivo:línea)

No hay críticos verificados.

- **A9-AGE-01** [ALTO] `src/lib/likida/conv.ts:140` — reincidente: el ciclo agéntico adquiere el mutex y llama al modelo sin timeout; un stall deja el mutex tomado y el humano nunca recibe salida.
- **A9-AGE-02** [ALTO] `src/lib/likida/cuadre/guardia.ts:92` — reincidente: el reintento de cierre de lote no consulta estado previo ni usa llave de idempotencia; un segundo intento descuenta dos veces.
- **A9-TC-01** [ALTO] `src/lib/llm/openrouter.ts:104` — reincidente de la ronda 7, no reconfirmado en la 8: el fallback de proveedor conserva el nombre del modelo primario y imputa el `usage` del secundario al primario.
- **A9-TC-02** [ALTO] `src/lib/llm/openrouter.ts:158` — reincidente de la ronda 7, no reconfirmado en la 8: `finish_reason = "length"` se trata como respuesta completa; se ejecuta un subconjunto de `tool_calls` y el loop-guard no entra.
- **A9-TC-03** [ALTO] `src/lib/llm/tool-executor.ts:71` — reincidente de la ronda 7, no reconfirmado en la 8: la deduplicación clavea por `call.id` y no por `(tool_name + args canónicos)`; un retry del proveedor con otro id vuelve a ejecutar el efecto.
- **A9-FIS-01** [ALTO] `src/lib/likida/cuadre/engine.ts:142` — reincidente: el estímulo de casetas aplica `gastoTotal * 0.50` sobre bruto con IVA. En la ronda 8 el mismo reclamo cayó por referencia inválida en `deducibilidad.ts:142`; aquí ancla en `engine.ts:142` y la adversarial lo dejó en pie.
- **A9-FIS-02** [ALTO] `src/lib/likida/intake/cfdi.ts:88` — reincidente de A8-FIS-01: la retención IVA 4% se aplica fija sin validar personalidad jurídica del receptor (art. 1-A LIVA: solo cuando el receptor es persona moral).
- **A9-LEG-01** [ALTO] `src/lib/likida/intake/sanitizar.ts:28` — reincidente de A8-LEG-01: el sanitizador cubre tokens obvios y deja pasar CLABE (18 dígitos) y PAN de tarjeta en el prompt de extracción.
- **A9-LEG-02** [ALTO] `src/lib/likida/privacidad.ts:65` — reincidente de A8-LEG-02: no hay interceptor de derechos ARCO ni revocación vía WhatsApp; el módulo es catálogo de textos.
- **A9-OPE-01** [ALTO] `src/lib/logger.ts:18` — reincidente de A8-OPE-01 (`logger.ts:38`): el log de fallo de WhatsApp registra destino y error, no `liquidacionId` ni `flotaId`.
- **A9-OPE-02** [ALTO] `instrumentation.ts:26` — reincidente de A8-OPE-02 (`instrumentation.ts:14`): Sentry se declara (`init`) sin `captureException` ni alerta viva a un humano; el error de las 3:12 muere con el contenedor.
- **A9-REN-01** [ALTO] `src/lib/likida/repo.ts:87` — reincidente: N+1 al listar movimientos por viaje. En la ronda 8 el mismo reclamo cayó por referencia inválida en `repo.ts:203`; aquí ancla en `repo.ts:87` y la adversarial lo dejó en pie.

## Falsos y descartados (con razón)

La adversarial verificó 18 y descartó 23. Se listan todos: es lo que mantiene honestos a los auditores de mañana. Un hallazgo sin `archivo:línea` vivo no entra al backlog como si fuera deuda confirmada.

**frontend (6)**
- [ALTO] Fallback de odómetro nulo renderiza "0 km" y falsea el cálculo visual de rendimiento de combustible — `src/app/(dashboard)/liquidaciones/[id]/page.tsx:142` — **referencia inválida**.
- [ALTO] Estados de timbrado (`error_sat`, `en_cola`, `rechazado`) caen en badge neutro con texto crudo sin acción de recuperación — `src/app/(dashboard)/liquidaciones/components/timbrado-status-badge.tsx:28` — **referencia inválida**.
- [MEDIO] Inestabilidad de `key` en lista de deducciones variables — `src/app/(dashboard)/liquidaciones/[id]/components/deducciones-table.tsx:64` — **referencia inválida**.
- [MEDIO] Desfase de zona horaria (UTC vs local) en fechas de liquidación y emisión — `src/app/(dashboard)/liquidaciones/page.tsx:88` — **referencia inválida**.
- [MEDIO] Formateador de moneda inconsistente entre vistas de resumen y detalle — `src/app/(dashboard)/liquidaciones/page.tsx:112` — **referencia inválida**.
- [BAJO] Contraste insuficiente en badges de estado "Borrador" — `design-system/src/components/badge.tsx:42` — **referencia inválida**.

**seguridad (2)**
- [ALTO] Ruta administrativa de exportación protegida solo por el matcher de middleware — `src/middleware.ts:18` — **referencia inválida**.
- [MEDIO] URL firmada con TTL de 7 días — `src/lib/storage.ts:88` — **referencia inválida**.

El CVE de Next.js vía `next/image` lo descartó el propio auditor por falta de camino real (`package.json:32` / solo `Avatar.tsx` en rutas autenticadas); no entró a la adversarial como hallazgo vivo.

**fiscal (1)**
- [MEDIO] Facilidad de comprobación del 8% omite retención de ISR provisional del 16% — `src/lib/likida/liquidacion/deducibilidad.ts:115` — **referencia inválida**.

**arquitectura (3)**
- [ALTO] Deuda estructural del "procesador central" sigue sin reconfirmar — **sin `archivo:línea`**.
- [MEDIO] Un literal que dice lo mismo y ya divergió — **sin `archivo:línea`**.
- [BAJO] Sin inventario verificado de las fronteras de acceso a datos — **sin `archivo:línea`**.

**pruebas (3)**
- [ALTO] `export/facturas-proveedor` sigue sin arnés — `api/export/facturas-proveedor.ts:10` — **referencia inválida**.
- [ALTO] Sin oráculo para la escritura del pago de liquidación — `tests/liquidacion.pago.test.ts:23` — **referencia inválida**.
- [MEDIO] La suite no contiene el escenario borde de centro de costo (0075) — `src/liquidaciones/nominales.test.ts:118` — **referencia inválida**.

**operabilidad (1)**
- [ALTO] Exportar facturas de proveedor responde 200 con `{ ok: false }` — `src/app/api/exportar-facturas-proveedor/route.ts:12` — **referencia inválida**.

**rendimiento (2)**
- [ALTO] Imagen de comprobante se envía sin redimensionar a OCR — `src/lib/intake/ocr.ts:32` — **referencia inválida**.
- [MEDIO] Timeout individual de cola no considera la suma de eslabones — `src/lib/queue/worker.ts:45` — **referencia inválida**.

**datos (5)**
- [ALTO] El CFDI se asume único en la app y la base no lo impone — **sin `archivo:línea`**.
- [ALTO] No hay CHECK de dominio en `liquidaciones.estado` — **sin `archivo:línea`**.
- [ALTO] No hay CHECK de no negatividad en columnas monetarias — **sin `archivo:línea`**.
- [MEDIO] RLS de `pagos` no bloquea `authenticated` por fuera de la política — **sin `archivo:línea`**.
- [MEDIO] Las migraciones no tienen una dirección "down" real — **sin `archivo:línea`**.

**backend:** no aportó hallazgos que descartar. El auditor no abrió archivos. Queda fuera de esta lista a propósito.

El CRÍTICO de agentico (`src/lib/likida/processor.ts:312`, enrutador de salida por último emisor), el de seguridad (`src/lib/env.ts:12`, fallback de service role), el de legal (`src/lib/likida/intake/processor.ts:84`, transferencia transfronteriza antes de consentimiento) y el de rendimiento (`src/lib/likida/presupuesto.ts:88`, suma de eslabones vs `maxDuration`) **no pasaron por la adversarial**. El ALTO de `duplicados.ts:3`, el ALTO de escritura de pagos, los MEDIOS de `cobranza_pura` y del CI, y los ALTOS de rondas previas que no se reabrieron aquí **no se promocionan a “a cerrar”**. Quedan como reclamo del rubro, no como deuda verificada de esta ronda. El ALTO verificado de la ronda 8 que no se reabrió (`A8-DAT-01` / `likida.ts:141`) y los de las rondas 5–7 que no se releyeron tampoco se reescriben como si esta adversarial los hubiera vuelto a abrir. `A8-FIS-01` se reconfirmó como `A9-FIS-02`. `A8-LEG-01` y `A8-LEG-02` se reconfirmaron como `A9-LEG-01` y `A9-LEG-02`. `A8-OPE-01` y `A8-OPE-02` se reconfirmaron con nueva línea (`logger.ts:18`, `instrumentation.ts:26`). Los tres ALTOS de tool-calling de la ronda 7 se reconfirmaron aquí como `A9-TC-01`…`03`.

## Propuestos (medios y bajos que esperan)

Solo lo que la adversarial dejó en pie. No se reintroducen los 23 descartados disfrazados de backlog.

- [MEDIO] agentico — `src/lib/agents/prompts.ts:36` — el prompt autoriza al modelo a narrar montos que deberían salir de la herramienta determinística; el contralor puede autorizar una cifra inventada.
- [MEDIO] agentico — `src/lib/likida/conv.ts:205` — la barrera de ráfaga envía confirmación parcial sin informar del mensaje fallido; el chofer cree que el lote completo quedó aplicado.
- [BAJO] fiscal — `src/lib/likida/cuadre/leyendas.ts:45` — la leyenda de viáticos en el PDF cita artículo incompleto / desfasado respecto de la ficha normativa.
- [MEDIO] legal — `src/lib/likida/privacidad.ts:32` — el aviso no informa toma de decisiones automatizadas ni revisión humana (LFPDPPP marzo 2025).
- [MEDIO] operabilidad — `.env.example:3` — `SENTRY_DSN` y `DATABASE_URL` vacíos dejan arrancar la app y degradan a las 2 AM.
- [MEDIO] rendimiento — `src/lib/llm/openrouter.ts:112` — modelo caro fijado para extracción administrativa que un modelo barato resolvería.

## Presupuesto de la ronda (gasto vs tope)

Gastado: **$0.2464**. Ledger: `docs/auditoria-9/ledger.json`. El tope de ronda no llegó a esta síntesis; el gasto queda anclado al ledger y no se redondea.