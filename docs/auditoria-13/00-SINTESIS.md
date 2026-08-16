# Auditoria 13 - Sintesis y recalificacion

**Global: 4.7** (anterior: 4.4). Promedio de 12 rubros: once con nota firmada por su reporte y datos heredado porque el entregable no declaró cifra.

La ronda 13 vuelve a chocar con el mismo límite y, encima, infla el global. Donde se leyó de verdad, adversarial dejó **7 hallazgos en pie y recortó 17**. Casi todo el frontend, el fiscal de dinero, las pruebas y los dos ALTOS de rendimiento se cayeron por referencia inválida o por falta de `archivo:línea`. El número global refleja lo que cada reporte firmó, no el recuento post-verificación; el porqué pesa más que la cifra. El ascenso 4.4→4.7 lo explican cinco movimientos de reporte (frontend 4.0→4.5, tool-calling 6→8, legal 4.0→3.5, pruebas 4→3, operabilidad 4.0→6.5) y no un repo más sano: el +2.5 de operabilidad se firma **sin una sola línea leída**, en contra del cierre de la ronda 12 («no firmar nota de 6+ en rubro no leído»). El 8 de tool-calling lo firma el rubro con lectura extensa; adversarial **no reconfirmó** el cierre de los tres ALTOS que anclaban el 6.

## Las 12 notas

| Rubro | Anterior | Hoy | Porqué del movimiento |
|---|---|---|---|
| frontend | 4.0 | 4.5 | El reporte sube por mirada más profunda a contratos de UI, mapas de estado y formateo. Adversarial **descartó los cinco hallazgos** por referencia inválida (otra vez: rutas que no resuelven, líneas que no existen). La nota se respeta por contrato de rubro, no porque sobreviva evidencia. Subir con cero hallazgos en pie es el mismo gesto que la ronda 12 ya había castigado a la inversa. |
| backend | 4 | 4 | Sin movimiento. El auditor no ejecutó lectura; cero hallazgos, cero reconfirmaciones. El 4 es herencia ética por **segunda ronda consecutiva**, no juicio verificado sobre idempotencia, locks ni doble escritura. |
| agentico | 4 | 4 | El reporte sostiene 4 porque no hubo lectura real que permita subir ni bajar. Los cuatro abiertos se listan otra vez como reincidentes condicionales, sin `archivo:línea`. Sin mitigación verificada no sube; sin agravante verificado no baja. Tres rondas sin abrir el ciclo es cláusula de límite, no aval. |
| tool-calling | 6 | 8 | El reporte sube y declara **cerrados** los tres ALTOS reincidentes (costo del fallback, `finish_reason: length`, dedupe por efecto) con prueba unitaria y `properties: {}` en el camino del dinero. Adversarial **no verificó esas líneas ni esas pruebas**; solo descartó un BAJO nuevo por falta de `archivo:línea`. El 8 se respeta porque el rubro lo firmó con lectura; no es un 8 adversarial. El ancla de 8 queda como tesis del auditor, no como sentencia de esta mesa. |
| seguridad | 5.0 | 5.0 | Sin movimiento. El auditor no dispuso de herramientas de lectura. El CRÍTICO de `env.ts:12` queda **reportado y no confirmado por tercera ronda consecutiva**. Los dos abiertos (export admin, URL firmada) siguen sin línea. El 5.0 es cláusula de límite, no juicio sobre el código de hoy. |
| fiscal | 3.5 | 3.5 | Sin movimiento de cifra. El reporte sostiene 3.5 por deuda que «cobró factura»; adversarial **descartó los tres de dinero** (estímulo, retención 4%, RFA 8%) por referencia inválida y **verificó solo el BAJO** de la leyenda. La nota se respeta por contrato; los ALTOS de esta ronda no sobrevivieron. Las líneas de la ronda 11 que sí existían no se reabrieron. |
| legal | 4.0 | 3.5 | El reporte baja por mirada más profunda frente a LFPDPPP y transferencias a LLMs. Esta vez adversarial **verificó dos ALTOS y un MEDIO** (`sanitizar.ts:24`, `privacidad.ts:52`, `privacidad.ts:18`) y descartó el de storage. La baja tiene evidencia en pie: no es herencia ni teatro de rutas. El riesgo mayor deja de ser tesis y vuelve a ser hallazgo cerrado de esta ronda. |
| arquitectura | 6 | 6 | Sin cobertura: no se abrió ningún archivo. La nota se hereda y se declara como cláusula de límite, no como aval de fronteras (`repo.ts`), pureza del motor ni una sola fuente de conceptos. Bajar o subir sin líneas sería la misma farsa. |
| pruebas | 4 | 3 | El reporte baja por deuda que cobró factura (export sin ancla, pago que no fija escritura, centro 0075, CI sin `npm test`). Adversarial **descartó los cinco** que llevaron línea útil o los marcó sin `archivo:línea`. La nota se respeta por contrato; la evidencia de esta ronda no sobrevivió. El 3 no prueba que la suite esté rota: prueba que el auditor no pudo citar el árbol real. |
| operabilidad | 4.0 | 6.5 | **El reporte declara 6.5 y un «antes 6.5» que no existe en la síntesis oficial** (la ronda 12 dejó 4.0 porque el entregable ni cifra tenía). Hoy otra vez: cero archivos, cero hallazgos, y aun así firma 6+. Eso viola el cierre de la ronda 12. La nota se toma porque el rubro la declaró; el porqué no es mejora — es inflado por herencia fantasma. No es aval de alertas, Sentry ni logs. |
| rendimiento | 4 | 4 | Sin movimiento oficial. El reporte declara 4 y cree bajar de un 6.5 que la síntesis 12 no firmó (allí el rubro estrenó un 4 de piso). Adversarial **verificó dos MEDIOS y un BAJO** y **descartó los dos ALTOS**; el CRÍTICO de `maxDuration` (112s vs 60s) **no entró ni a verificados ni a descartados**. El 4 se confirma como piso; no es juicio medido sobre el peor caso. |
| datos | 4 | 4 | **El entregable no declara nota** (respuesta insuficiente tras reintento; rubro sin cobertura real). Se hereda el 4 de la ronda 12 y se dice aquí: no es aval del esquema, de `repo.ts` ni de `verificaciones.sql`. El ancla («la base acepta un estado que el producto no sabe manejar») sigue sin reabrirse. |

## Criticos y altos a cerrar (ID + archivo:linea)

Solo lo que adversarial **verificó**. El CRÍTICO de secretos, el CRÍTICO de presupuesto/maxDuration, los ALTOS de frontend, fiscal, pruebas, rendimiento y el salto de tool-calling no entran aquí.

- **A13-LEG-01** [ALTO] Sanitizador ciego a datos patrimoniales, PAN y CLABE hacia LLMs externos (REINCIDENTE) — `src/lib/likida/intake/sanitizar.ts:24`
- **A13-LEG-02** [ALTO] Inexistencia de mecanismo operativo de supresión, bloqueo y trámite ARCO (REINCIDENTE) — `src/lib/likida/privacidad.ts:52`

**Reportado y no pasado por adversarial** (no se cierra como confirmado; no se silencia):

- **A11-SEG-00** [CRÍTICO] Fallback silencioso `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_ANON_KEY` — `src/lib/env.ts:12`. La ronda 11 ordenó abrirlo primero. La 12 lo citó y no lo abrió. La 13 **volvió a no abrirlo**. Si la línea existe, sigue siendo el hallazgo más grave del ciclo. La ronda 14 no tiene excusa.
- **A13-REN-01** [CRÍTICO] Presupuesto de cadena 112s contra `maxDuration=60` y falla en silencio — `src/lib/likida/presupuesto.ts:142` (el reporte lo firmó; no está en verificados ni en descartados). No se hereda como sentencia.
- **A12-TC-01 / A12-TC-02 / A12-TC-03** [ALTO] Los tres de `openrouter.ts` / `tool-executor.ts` que la ronda 12 sí había verificado. El rubro los declara **resueltos** con prueba. Adversarial no reabrió esas líneas. Por la regla de no heredar hallazgo —ni cierre— sin reabrir el archivo, no se reescriben aquí como abiertos ni como cerrados. Quedan como tesis del auditor de tool-calling.

Los ALTOS de fiscal y frontend de rondas previas **no se reabrieron** en las líneas que entonces sí existían. Siguen siendo deuda viva, no sentencia de esta ronda.

## Falsos y descartados (con razon)

La verificación adversarial recortó 17. La razón, en bloque, es la misma que debe disciplinar la ronda 14: **sin `archivo:línea` abierto y re-leído no hay hallazgo**. Citar una ruta que no existe, un módulo sin línea, un rango que el verificador no pudo resolver, o un archivo que cambió de sitio respecto de la ronda anterior, es evidencia falsa.

- [ALTO] frontend — odómetro nulo / rendimiento 0 — `src/app/(dashboard)/liquidaciones/[id]/page.tsx:142` — **referencia inválida**
- [ALTO] frontend — badge de timbrado (`error_sat`, `en_cola`, `rechazado`) — `src/app/(dashboard)/liquidaciones/components/timbrado-badge.tsx:48` — **referencia inválida**
- [MEDIO] frontend — `key` inestable en deducciones — `src/app/(dashboard)/liquidaciones/[id]/deducciones-form.tsx:89` — **referencia inválida**
- [MEDIO] frontend — TZ UTC vs local en viajes — `src/app/(portal)/chofer/viajes/page.tsx:74` — **referencia inválida**
- [MEDIO] frontend — formateo monetario inconsistente — `src/app/(dashboard)/metricas/page.tsx:112` — **referencia inválida**
- [BAJO] tool-calling — etiqueta de modelo en fallo de `generateStructured` apunta al primario — `:0` — **sin `archivo:línea`**
- [ALTO] fiscal — estímulo de casetas al 50% sobre bruto con IVA — `src/lib/likida/liquidacion/deducibilidad.ts:182` — **referencia inválida**
- [ALTO] fiscal — retención IVA 4% sin cruzar PF/PM — `src/lib/likida/facturacion/impuestos.ts:94` — **referencia inválida**
- [MEDIO] fiscal — RFA 8% sin retención ISR 16% — `src/lib/likida/liquidacion/deducibilidad.ts:245` — **referencia inválida**
- [MEDIO] legal — retención indefinida de comprobantes en storage — `src/lib/likida/intake/storage.ts:35` — **referencia inválida**
- [ALTO] pruebas — export facturas-proveedor sin test de total — `lib/factura-export.ts:14` — **referencia inválida**
- [ALTO] pruebas — pago de liquidación no valida la escritura — `index.ts:76` — **referencia inválida**
- [ALTO] pruebas — centro de costo sin caso 0075 — `supabase/__tests__/centro-costo.test.ts:9` — **referencia inválida**
- [ALTO] pruebas — CI no corre `npm test` — `:0` — **sin `archivo:línea`**
- [MEDIO] pruebas — `paidAt` sin prueba de escritura — `pagos.ts:135` — **referencia inválida**
- [ALTO] rendimiento — N+1 en `repo.ts` — `src/lib/db/repo.ts:87` — **referencia inválida**
- [ALTO] rendimiento — OCR sin redimensionar — `src/lib/queue/intake/ocr.ts:67` — **referencia inválida**

Estos descartes no prueban que el defecto no exista. Prueban que **esta ronda no puede actuar sobre ellos**. Inventar la línea para «salvar» el hallazgo habría sido peor que perderlo. Varios auditores volvieron a reescribir la ruta de la ronda 11/12 en vez de reabrir el archivo que entonces sí se había leído: eso no es reincidencia verificada, es deriva de referencia. Frontend y fiscal, en particular, repiten el patrón de la ronda 12 casi calco.

## Propuestos (medios y bajos que esperan)

Esta ronda **sí verificó** medios y bajos. Entran a cola solo esos. Lo demás de la ronda 11/12 no se hereda como confirmado si no se reabrió:

- **A13-LEG-03** [MEDIO] Aviso de privacidad omite decisiones automatizadas, perfilamiento y transferencias internacionales a IA — `src/lib/likida/privacidad.ts:18` — verificado (releva a A11-LEG-03, que citaba `:32` y no se re-leyó)
- **A13-REN-04** [MEDIO] `costos.ts` usa modelo caro para aritmética determinística — `src/lib/likida/costos.ts:34`
- **A13-REN-05** [MEDIO] Timeouts por eslabón sin tope agregado de cadena — `src/lib/llm/openrouter.ts:22`
- **A13-FIS-04** [BAJO] Leyenda de diésel cita artículo abrogado — `src/lib/likida/cuadre/leyendas.ts:58` — verificado (releva a A11-FIS-03 / la cita `:84` que la ronda 12 descartó)
- **A13-REN-06** [BAJO] Prompt de presupuesto serializa campos que el modelo no usa — `src/lib/likida/presupuesto.ts:98`

Queda fuera de cola (no verificado, no descartado con línea útil, o entregable incompleto): **A11-OPS-02** (`.env.example:15`, no re-leído), CHECK de `liquidaciones.estado`, CHECK de no negatividad, RLS de `pagos`, migraciones down, Sentry / alerta viva en el camino del dinero, el CRÍTICO de `maxDuration`, y todo lo que operabilidad, backend, agéntico, seguridad, arquitectura y datos no llegaron a firmar. La ronda 14 los reabre con lectura, o no existen.

## Presupuesto de la ronda (gasto vs tope)

Gastado: **$0.4829**. Tope: no declarado en los insumos de esta síntesis. Ledger: `docs/auditoria-13/ledger.json`.

Cierre para la ronda 14: no heredar hallazgo —ni cierre, ni nota de 6+— sin reabrir el archivo; no firmar 6.5 sobre un «antes» que la síntesis oficial no escribió; no entregar exploración de herramientas ni respuestas de 78 caracteres en lugar de reporte (operabilidad, datos); el primer grep sigue siendo `env.ts:12`, después `sanitizar.ts:24` y `privacidad.ts:52`, y después las tres líneas de tool-calling que el rubro dice haber cerrado (`openrouter.ts` / `tool-executor.ts`) para confirmar o desmentir el 8. Un rubro que lleve dos rondas sin una sola línea leída no debería sostenerse por herencia: o se lee, o la nota baja por el solo hecho de no poder defenderla. Operabilidad ya va en la tercera.