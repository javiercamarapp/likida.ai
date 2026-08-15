# Auditoría 5 — Síntesis y recalificación

**Global: 6.6** (anterior: —).

La ronda 5 recorta el promedio por mirada más profunda en agentes, fiscal, legal, pruebas y operabilidad, pero la verificación adversarial dejó en pie solo 8 de ~39 hallazgos y destapó una epidemia de `archivo:línea` inválidos o ausentes: el inventario real a cerrar es estrecho; seguridad y rendimiento se anclan por inercia, no por lectura de esta ronda.

## Las 12 notas
| Rubro | Anterior | Hoy | Porqué del movimiento |
|---|---|---|---|
| frontend | 8 | 7.5 | Baja por mirada más profunda en pantallas de los seis agentes y despacho: el auditor declara huecos entre enums de negocio y mapas de UI (estados huérfanos, badges desalineados, fallbacks que confunden cero con “no capturado”). La nota es la del reporte. La adversarial recortó cinco de seis hallazgos por referencia inválida; sobrevive el contraste en tema claro. El movimiento pesa más que el inventario que quedó en pie. |
| backend | 7 | 7 | Sin movimiento. El reporte ancla el 7 en que los caminos de dinero de despacho y cobranza ya tienen candado en base y prueba, y el riesgo vivo está en el importador CSV (dedup en memoria de un solo proceso). Ambos hallazgos de esta ronda cayeron en adversarial (sin `archivo:línea` / referencia inválida). Se conserva la nota declarada, no se premia ni se castiga el recorte. |
| agentico | 7 | 6 | Baja porque los tres abiertos heredados siguen vivos según el auditor —dos agravados, uno confirmado— y el cierre que ve el humano no coincide con lo persistido. Los hallazgos *nuevos* de la ronda se descartaron todos (sin `archivo:línea`). La baja se sostiene en la razón del movimiento (bordes del ciclo, no el camino feliz), no en el inventario adversarial. |
| tool-calling | 8 | 7 | Baja porque la regla estructural (tools sin datos del modelo; `tenantId`/`viajeId` en servidor) sigue intacta, pero la deuda de `openrouter.ts` no se cerró y no hay prueba fresca de atribución de costo en el fallback. Los tres hallazgos de la ronda se descartaron por falta de `archivo:línea`. El 7 es la nota del reporte: se pierde el ancla de 8 por verificación ausente, no por un PoC de truncado confirmado. |
| seguridad | 8 | 8 | Sin movimiento verificado. El auditor no abrió ni una línea del rubro y lo declara explícito: la nota se ancla en la ronda previa, no en evidencia de hoy. El riesgo mayor que nombra (webhook de WhatsApp como frontera de confianza) quedó sin lectura. No se sube ni se baja. |
| fiscal | 7.5 | 7.0 | Baja por mirada más profunda en retenciones CFDI 4.0 de fletes y estímulo de peajes frente a LIF/RFA: declarar la discrepancia ya no basta si el motor la expone al contralor. De cuatro hallazgos, tres sobrevivieron adversarial (estímulo sobre bruto+IVA, facilidad 8% sin ISR, leyenda de 50 km). El ALTO de retención IVA 4% fija se descartó por referencia inválida; la baja se mantiene por la razón del movimiento y por el ALTO de casetas que sí quedó en pie. |
| legal | 6.5 | 6.0 | Baja porque la ronda anterior no auditó consentimiento previo en Despacho por WhatsApp ni la transferencia transfronteriza a LLMs. Dos ALTOS y un MEDIO/BAJO sobrevivieron adversarial (PII a LLM antes de aviso, analista sin sanitizar, ARCO inoperante, export sin bitácora). El perfilamiento de conductores se descartó por referencia inválida. El movimiento es de alcance, no de recálculo cosmética. |
| arquitectura | 6 | 6 | Se mantiene. Fronteras principales (formato, cuadre puro, visibilidad con guardián, motores de agentes fuera de la UI) siguen en pie; la deuda de la 0075 y el monolito de `processor.ts` impiden subir. Los tres hallazgos de la ronda se descartaron (sin línea / referencia inválida). El 6 no se premia con un alza por mitigaciones en aplicación (alias + guardián) que no resuelven el esquema. |
| pruebas | 7 | 6 | Baja porque al abrir la zona nueva (seis agentes) aparecen caminos de dinero sin arnés, una cabecera que no corre en CI y pruebas que el auditor califica de decoración. Los cinco hallazgos se descartaron todos por falta de `archivo:línea`. La nota es la del reporte: el porqué (suite verde, zonas de dinero sin red) pesa más que el recorte adversarial. |
| operabilidad | 6.5 | 6.0 | Baja por mirada más profunda, no por regresión: el fallo de medianoche no se convierte en conocimiento a las 8 a.m. (Sentry pasivo, 500 del cron sin canal, logs sin `viaje_id`/`wa_id`). Cuatro de cinco hallazgos se descartaron por falta de línea; el de logs WA además por referencia inválida. Se conserva el 6.0 declarado. |
| rendimiento | 6.5 | 6.5 | Sin movimiento. El auditor no abrió archivos ni corrió comandos; no hay evidencia para subir ni bajar. El riesgo que nombra (peor caso de los seis agentes vs `maxDuration` y presupuesto de tokens) quedó sin medición. Nota anclada por inercia, con esa limitación a la vista. |
| datos | 7 | 6 | Baja porque los candados pendientes de 0089/0091 no pasaron a migración y el historial 0088 no tiene unicidad de turno. Los tres hallazgos se descartaron por falta de `archivo:línea`. La nota es la del reporte: la razón (deuda de esquema que un `INSERT` en consola puede pintar como dinero válido) pesa más que la falta de ancla verificada. |

Suma de las doce notas declaradas: 79.0 ÷ 12 = **6.6**.

## Críticos y altos a cerrar (ID + archivo:línea)

No hay críticos verificados.

- **A5-FIS-01** [ALTO] `src/lib/likida/peajes/desglose.ts:68` — el estímulo de casetas (LIF Art. 16 fracc. V / LIF 2026 20-A) calcula el 50% sobre el total bruto con IVA y a la vez marca el IVA 100% acreditable: duplica beneficio y rompe la simetría del Art. 28 fracc. I LISR.
- **A5-LEG-01** [ALTO] `src/lib/likida/processor.ts:412` — Despacho por WhatsApp transfiere PII del operador a LLMs antes de recabar consentimiento o entregar aviso simplificado (LFPDPPP Arts. 15, 16 y 36).
- **A5-LEG-02** [ALTO] `src/lib/agents/analista.ts:148` — el chat analista envía registros con nombres, teléfonos, CLABE y saldos a proveedores LLM externos sin pasar por sanitización.

## Falsos y descartados (con razón)

La adversarial verificó 8 y descartó 31. Se listan todos: es lo que mantiene honestos a los auditores de mañana. Un hallazgo sin `archivo:línea` vivo no entra al backlog como si fuera deuda confirmada.

**frontend (5)**
- [ALTO] Estado `en_proceso` sin badge semántico — `src/app/(dashboard)/dashboard/agentes/facturas/facturas-contenido.tsx:142` — **referencia inválida**.
- [ALTO] Fallback de odómetro pinta `0 km` / `0.0 km/L` — `src/app/(dashboard)/dashboard/viajes/viaje-detalle-vista.tsx:218` — **referencia inválida**.
- [MEDIO] Vigencia de licencia sin año — `src/app/(dashboard)/dashboard/operadores/operador-tarjeta.tsx:84` — **referencia inválida**.
- [MEDIO] `asignado`/`confirmado` rotulados “En ruta” — `src/app/(dashboard)/dashboard/mapa/mapa-contenido.tsx:136` — **referencia inválida**.
- [MEDIO] `key={index}` en partidas de peajes — `src/app/(dashboard)/dashboard/agentes/peajes/peajes-consolidado-vista.tsx:174` — **referencia inválida**.

**backend (2)**
- [ALTO] Dedup de importación en memoria de un solo proceso — **sin `archivo:línea`**.
- [MEDIO] Rama oficina de `processor` traga la caída y el webhook responde 200 — `processor.ts:1545` — **referencia inválida**.

**agentico (3, solo los nuevos)**
- [ALTO] Error a mitad de emisión deja aviso “enviado” sin entrega — **sin `archivo:línea`**.
- [MEDIO] Stream cortado a mitad deja turno sin cierre — **sin `archivo:línea`**.
- [BAJO] Prompt del analista autoriza narrar cifras determinísticas — **sin `archivo:línea`**.

**tool-calling (3)**
- [ALTO] `finish_reason: "length"` tratado como respuesta completa — **sin `archivo:línea`**.
- [MEDIO] Fallback de proveedores sin prueba de atribución de costo al proveedor efectivo — **sin `archivo:línea`**.
- [BAJO] Dedup de tool call por llamada, no por efecto — **sin `archivo:línea`**.

**fiscal (1)**
- [ALTO] Retención IVA 4% fija sin validar tipo de persona del receptor — `src/lib/likida/facturacion/impuestos.ts:42` — **referencia inválida**.

**legal (1)**
- [MEDIO] Ranking/perfilamiento de operadores sin notificación de tratamiento automatizado — `src/app/dashboard/agentes/conductores/page.tsx:115` — **referencia inválida**.

**arquitectura (3)**
- [ALTO] FK compuesta de la 0075 dejó dos relaciones en 5 pares — **sin `archivo:línea`**.
- [MEDIO] `processor.ts` monolito ~2,300 líneas — `processor.ts:1545` — **referencia inválida**.
- [MEDIO] Cron `api/cron/escalar` mezcla escalación y cobranza global — **sin `archivo:línea`**.

**pruebas (5)**
- [ALTO] `api/export/facturas-proveedor` sin arnés — **sin `archivo:línea`**.
- [MEDIO] `cobranza_pura.test.ts` tautológica — **sin `archivo:línea`**.
- [MEDIO] `pruebas-manuales/*.prueba.ts` fuera de CI — **sin `archivo:línea`**.
- [MEDIO] Guardián de embeds no cubre export/cron/`processor` — **sin `archivo:línea`**.
- [BAJO] Línea base 3,232 vs 3,161 pruebas sin bitácora de transición — **sin `archivo:línea`**.

**operabilidad (5)**
- [ALTO] 500 del cron sin alerta a canal operativo — **sin `archivo:línea`**.
- [ALTO] Sentry instalado pero sin eslabón humano — **sin `archivo:línea`**.
- [ALTO] Log de fallo de WhatsApp sin flota/viaje/`wa_id` — `src/lib/processor.ts:230` — **referencia inválida**.
- [ALTO] Export de facturas-proveedor responde 200 con `{ ok:false }` — **sin `archivo:línea`**.
- [MEDIO] Seed/setup limpio no aplica ni verifica migraciones — **sin `archivo:línea`**.

**datos (3)**
- [ALTO] 0091 sin `CHECK` de signo en montos — **sin `archivo:línea`**.
- [ALTO] 0089 cobranza sin llave natural a la factura del tenant — **sin `archivo:línea`**.
- [MEDIO] 0088 historial de chat sin unicidad de turno — **sin `archivo:línea`**.

**seguridad / rendimiento:** no aportaron hallazgos que descartar; tampoco aportaron evidencia nueva. Quedan fuera de esta lista a propósito.

Los tres abiertos heredados de agentico (“ya” con comprobantes incompletos, cobranza muda que consume tier, `P2002` narrado como viaje abierto) **no pasaron por la adversarial**. No se promocionan a “a cerrar”. Quedan como reclamo del rubro, no como deuda verificada de esta ronda.

## Propuestos (medios y bajos que esperan)

Solo lo que la adversarial dejó en pie. No se reintroducen los 31 descartados disfrazados de backlog.

- [MEDIO] fiscal — `src/lib/likida/liquidacion/deducibilidad.ts:89` — facilidad RFA 8% marca el gasto 100% deducible sin calcular ni advertir la retención de ISR del 16% a enterar.
- [MEDIO] legal — `src/lib/likida/privacidad.ts:92` — no hay mecanismo operativo de revocación/supresión ARCO (solo buzón declarativo); no hay segregación técnica entre dato fiscal retenible y PII accesoria.
- [BAJO] frontend — `src/app/globals.css:312` — `.texto-atenuado` en tema claro queda en ~2.8:1 (WCAG AA pide 4.5:1).
- [BAJO] fiscal — `src/lib/likida/cuadre/leyendas.ts:47` — leyenda de viáticos cita LISR Art. 28 fracc. V sin el radio de 50 km del domicilio fiscal.
- [BAJO] legal — `src/app/api/export/facturas-proveedor/route.ts:64` — CSV con RFC de personas físicas sin bitácora de descarga (`usuario_id`, `tenant_id`, volumen, timestamp).

## Presupuesto de la ronda (gasto vs tope)

Gastado: **$0.0566**. Ledger: `docs/auditoria-5/ledger.json`. Tope de ronda: no consta en el paquete entregado al orquestador; no se afirma cumplimiento ni exceso.