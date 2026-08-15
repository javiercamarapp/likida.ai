# Auditoría 7 — Síntesis y recalificación

**Global: 5.2** (anterior: 5.7).

La ronda 7 recorta el promedio porque seguridad, pruebas, fiscal, legal y frontend declaran mirada más profunda o deuda que cobró factura, pero la adversarial dejó en pie solo 10 de 28 hallazgos y rendimiento y datos no tuvieron cobertura real: el inventario a cerrar es estrecho; backend y operabilidad se anclan en el piso ya cortado; agentico y arquitectura se anclan por falta de lectura, no por evidencia nueva.

## Las 12 notas
| Rubro | Anterior | Hoy | Porqué del movimiento |
|---|---|---|---|
| frontend | 7.0 | 6.5 | Baja por mirada más profunda: el auditor declara que la nota previa estaba inflada y que persisten fallbacks numéricos y de estado en paneles de liquidación y combustible. La adversarial recortó los cinco hallazgos por referencia inválida. El 6.5 es la nota del reporte. El movimiento pesa más que el inventario que quedó en pie. |
| backend | 4 | 4 | Sin movimiento oficial. El auditor declara 4 y escribe «antes 7», pero la síntesis de la ronda 6 ya había dejado el rubro en 4. Esta ronda no reabrió archivos: ancla los dos caminos de dinero en el inventario previo. La adversarial dejó en pie el ALTO del `Set` (`duplicados.ts:3`) y el MEDIO de oficina (`processor.ts:272`); el resto cayó por falta de `archivo:línea`. Se conserva el 4 declarado: no se aplica una segunda baja sobre una ancla que ya estaba cortada. |
| agentico | 6 | 6 | Sin movimiento verificado. El auditor declara que no abrió el repositorio ni produjo `archivo:línea`; no reporta hallazgos nuevos. Se conserva el 6 declarado: no se premia ni se castiga una ronda sin lectura. |
| tool-calling | 6 | 6 | Sin movimiento de nota. Los tres abiertos heredados se reconfirmaron con `archivo:línea` vivo (`openrouter.ts:158`, `openrouter.ts:104`, `tool-executor.ts:71`). El 6 es la nota del reporte: no llega a 8 porque el fallback de proveedores sigue sin prueba de atribución; no baja a 4 porque las tools existentes no aceptan datos del modelo. La verificación sostiene el ancla; no la mueve. |
| seguridad | 8 | 6 | Baja porque el auditor atacó y declara confirmado un fallback silencioso de secreto y una ruta privilegiada con una sola capa. La nota previa estaba anclada sin evidencia de seguridad de esta línea. La adversarial no verificó el CRÍTICO de `env.ts:12`, descartó el ALTO de `/api/admin/export` y el MEDIO de URL firmada, y dejó en pie solo el MEDIO del CVE en Next. El 6 es la nota del reporte: el porqué (service role que puede colarse al cliente) pesa más que el recorte adversarial. El CRÍTICO no se promociona a backlog. |
| fiscal | 6.5 | 5.5 | Baja por mirada más profunda: el auditor sostiene que persistir el estímulo de casetas sobre bruto con IVA y la retención IVA 4% ciega ya no cabe en un 6.5. Tres de cuatro hallazgos de esta ronda se descartaron por referencia inválida; sobrevive un BAJO de leyenda (`leyendas.ts:45`). La nota es la del reporte: el porqué (motor que expone aritmética fiscal al contralor) pesa más que el recorte adversarial. Los ALTOS de casetas y retención 4% no se reconfirmaron aquí. |
| legal | 5.5 | 5.0 | Baja por mirada más profunda en transferencia transfronteriza a LLMs y sanitización ciega a datos patrimoniales. La adversarial dejó en pie dos ALTOS (`sanitizar.ts:42` y `sanitizar.ts:28`) y el MEDIO de ARCO (`privacidad.ts:65`); el MEDIO del Analista cayó por referencia inválida. El 5.0 es la nota del reporte: el movimiento es de alcance, y esta vez el inventario verificado lo sostiene. |
| arquitectura | 6 | 6 | Sin reporte usable (el auditor declara que no abrió ningún archivo). Se hereda la previa y se dice: no hay evidencia de esta ronda para subir ni bajar. Las fronteras y la deuda de `processor.ts` / 0075 quedan como estaban. |
| pruebas | 6 | 4 | Baja porque, según el auditor, la zona de dinero —export de facturas-proveedor y escritura de pagos— sigue sin arnés real y `cobranza_pura` es decorativa. El ALTO de esta ronda se descartó por falta de `archivo:línea`; los MEDIOS no pasaron por la adversarial. El 4 es la nota del reporte: el porqué (la suite sigue verde si el dinero sale mal) pesa más que el recorte. No se promocionan hallazgos sin ancla. |
| operabilidad | 3.5 | 3.5 | Sin movimiento oficial. El auditor declara 3.5 y escribe «antes 6.5», pero la síntesis de la ronda 6 ya había dejado el rubro en 3.5. Los cuatro hallazgos que sí entraron a adversarial se descartaron todos por falta de `archivo:línea`; el 500 del cron ni siquiera pasó por verificación. Se conserva el 3.5 declarado: no se aplica una segunda baja sobre una ancla que ya estaba cortada, y no se reescribe deuda no verificada. |
| rendimiento | 4.5 | 4.5 | Sin reporte usable (respuesta insuficiente). Se hereda la previa y se dice: no hay evidencia de esta ronda para subir ni bajar. Los ALTOS verificados de la ronda 6 (`repo.ts:88`, `openrouter.ts:34`) no se reconfirmaron aquí. |
| datos | 5 | 5 | Sin reporte usable (respuesta insuficiente tras reintento; 0 chars; rubro sin cobertura real). Se hereda la previa y se dice: no hay evidencia de esta ronda para subir ni bajar. El BAJO de dominio de status de la ronda 6 no se reconfirmó. |

Suma de las doce notas declaradas: 62.0 ÷ 12 = **5.2**.

## Críticos y altos a cerrar (ID + archivo:línea)

No hay críticos verificados.

- **A7-BE-01** [ALTO] `src/lib/likida/duplicados.ts:3` — reincidente de A6-BE-01: el dedup de importación es un `Set` en memoria de un solo proceso y el `INSERT` de viajes no tiene llave de negocio (`UNIQUE` / `ON CONFLICT`); dos submits paralelos pueden persistir el mismo manifiesto dos veces y duplicar tarifa en el cuadre.
- **A7-TC-01** [ALTO] `src/lib/llm/openrouter.ts:158` — una respuesta con `finish_reason: "length"` se entrega al executor como tool call completa; un JSON parcial puede grabar o cerrar una liquidación a medias sin error visible.
- **A7-LEG-01** [ALTO] `src/lib/likida/intake/sanitizar.ts:42` — la ingesta de WhatsApp despacha el texto crudo al LLM en el extranjero antes de consultar consentimiento o emitir aviso simplificado LFPDPPP.
- **A7-LEG-02** [ALTO] `src/lib/likida/intake/sanitizar.ts:28` — el sanitizador cubre tokens obvios y deja pasar CLABE (18 dígitos) y PAN de tarjeta (16 dígitos) en el prompt de auditoría.

## Falsos y descartados (con razón)

La adversarial verificó 10 y descartó 18. Se listan todos: es lo que mantiene honestos a los auditores de mañana. Un hallazgo sin `archivo:línea` vivo no entra al backlog como si fuera deuda confirmada.

**frontend (5)**
- [ALTO] Fallback de odómetro y kilometraje renderiza "0 km" — `src/app/(dashboard)/liquidaciones/[id]/page.tsx:142` — **referencia inválida**.
- [ALTO] Estados `en_proceso`, `error` y `rechazado` en timbrado caen en badge genérico — `src/app/(dashboard)/liquidaciones/[id]/components/detalle-facturacion.tsx:88` — **referencia inválida**.
- [MEDIO] `key` inestable en listas de deducciones — `src/app/(dashboard)/liquidaciones/[id]/components/tabla-deducciones.tsx:64` — **referencia inválida**.
- [MEDIO] Fechas de vigencia UTC vs local en operadores y pólizas — `src/app/(dashboard)/operadores/[id]/components/vigencias-documentos.tsx:51` — **referencia inválida**.
- [BAJO] Contraste insuficiente en badges `muted`/`secondary` — `src/design-system/components/badge.tsx:32` — **referencia inválida**.

**backend (2)**
- [MEDIO] Confirmación sin bloqueo de concurrencia — **sin `archivo:línea`**.
- [BAJO] `pg_errores` no identifica la fila que falló — **sin `archivo:línea`**.

**seguridad (2)**
- [ALTO] Ruta administrativa de exportación protegida solo por el matcher — `src/app/api/admin/export/route.ts:24` — **referencia inválida**.
- [MEDIO] URL firmada con TTL de 7 días — `src/lib/auth/signed-url.ts:22` — **referencia inválida**.

**fiscal (3)**
- [ALTO] Estímulo de casetas al 50% sobre bruto con IVA — `src/lib/likida/liquidacion/deducibilidad.ts:142` — **referencia inválida**.
- [ALTO] Retención IVA 4% fija sin validar tipo de persona — `src/lib/likida/facturacion/impuestos.ts:88` — **referencia inválida**.
- [MEDIO] Facilidad RFA 8% sin retención ISR 16% — `src/lib/likida/liquidacion/deducibilidad.ts:215` — **referencia inválida**.

**legal (1)**
- [MEDIO] Analista inyecta nómina y saldos deudores sin anonimizar — `src/lib/likida/analista/contexto.ts:54` — **referencia inválida**.

**pruebas (1)**
- [ALTO] `api/export/facturas-proveedor` sin arnés — **sin `archivo:línea`**.

**operabilidad (4)**
- [ALTO] Sentry en `instrumentation.ts` sin eslabón a un humano — **sin `archivo:línea`**.
- [ALTO] Log de fallo de WhatsApp sin liquidación ni flota — **sin `archivo:línea`**.
- [ALTO] Export de facturas-proveedor responde 200 con `{ ok: false }` — **sin `archivo:línea`**.
- [MEDIO] `.env.example` con variables vacías y arranque permisivo — **sin `archivo:línea`**.

**agentico / arquitectura / rendimiento / datos:** no aportaron hallazgos que descartar. Agentico y arquitectura lo declaran: no hubo lectura. Rendimiento y datos no tuvieron reporte. Quedan fuera de esta lista a propósito.

El CRÍTICO de seguridad (`src/lib/env.ts:12`, fallback de `SUPABASE_SERVICE_ROLE_KEY` al cliente) **no pasó por la adversarial**. El 500 del cron de conciliación, los MEDIOS de `cobranza_pura` y `pruebas-manuales/`, y los ALTOS de rendimiento/datos de rondas previas **no se promocionan a “a cerrar”**. Quedan como reclamo del rubro, no como deuda verificada de esta ronda. Los ALTOS verificados de la ronda 6 que no se reabrieron aquí (`A6-OPE-01`, `A6-OPE-02`, `A6-REN-01`, `A6-REN-02`) y los de la ronda 5 (`A5-FIS-01`, `A5-LEG-01`, `A5-LEG-02`) tampoco se reescriben como si esta adversarial los hubiera vuelto a abrir.

## Propuestos (medios y bajos que esperan)

Solo lo que la adversarial dejó en pie. No se reintroducen los 18 descartados disfrazados de backlog.

- [MEDIO] backend — `src/lib/likida/processor.ts:272` — la rama “oficina” traga la caída de la base, hace `console.warn` y responde 200 al webhook: el contralor cree que se ordenó y no hay fila.
- [MEDIO] tool-calling — `src/lib/llm/openrouter.ts:104` — el fallback de proveedores registra costo por `model` de catálogo y no por el proveedor que contestó; no hay prueba que fuerce el fallback y compruebe la atribución.
- [MEDIO] seguridad — `package-lock.json:72` — Next 14.1.0 con camino de explotación vía `next/image` (CVE-2024-34351 / SSRF) si una URL de usuario llega al optimizador.
- [MEDIO] legal — `src/lib/likida/privacidad.ts:65` — no hay mecanismo transaccional de revocación/supresión ARCO; el módulo es catálogo de textos, no flujo con bloqueo en base.
- [BAJO] tool-calling — `src/lib/llm/tool-executor.ts:71` — el reducer de resultados de `Promise.all` puede devolver el efecto de una tool call asociado al `id` de otra si el orden de resolución no coincide con el de emisión.
- [BAJO] fiscal — `src/lib/likida/cuadre/leyendas.ts:45` — la leyenda de viáticos en el PDF omite fundamentación de RFA y LISR.

## Presupuesto de la ronda (gasto vs tope)

**Gastado: $0.1843** · ledger: `docs/auditoria-7/ledger.json`. El tope no viene en el paquete de orquestación; no se inventa.