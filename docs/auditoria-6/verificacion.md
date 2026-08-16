# Verificación — auditoría 6

**11 VERIFICADOS** · **29 DESCARTADOS**

## Verificados
- [ALTO] backend: REINCIDENTE — El dedup de importación es un `Set` en memoria, y el `INSERT` no tiene llave de negocio que lo respalde — `src/lib/likida/duplicados.ts:3`
- [MEDIO] backend: REINCIDIDO — La rama “oficina” traga la caída de la base y responde 200 al webhook — `src/lib/likida/processor.ts:272`
- [BAJO] backend: `pg_errores` muestra el código de SQL, pero no identifica la fila que falló — `src/lib/likida/pg_errores.ts:27`
- [MEDIO] legal: Inexistencia de endpoint o mecanismo transaccional para ejercer derechos ARCO y revocación de consentimiento — `src/lib/likida/privacidad.ts:65`
- [MEDIO] legal: Sanitizador de ingesta no cubre datos bancarios ni placas vehiculares en comprobantes OCR — `src/lib/likida/intake/sanitizar.ts:42`
- [ALTO] operabilidad: Sentry está instalado, pero no llega a ninguna persona — `instrumentation.ts:6`
- [ALTO] operabilidad: El log de fallo de WhatsApp no dice “cuál liquidación” ni “de qué flota” — `src/lib/logger.ts:15`
- [MEDIO] operabilidad: `.env.example` deja variables sin valor que el sistema arranca con problemas — `.env.example:12`
- [ALTO] rendimiento: N+1 en `repo.ts`: una consulta por cada viaje para obtener el operador — `src/lib/likida/repo.ts:88`
- [ALTO] rendimiento: Modelo caro para clasificación de intención donde uno barato bastaba — `src/lib/llm/openrouter.ts:34`
- [BAJO] datos: Dominio de status en la base no es restringido por constraint — `src/types/likida.ts:82`

## Descartados
- [ALTO] frontend: Estado `en_proceso` y `error` en facturación caen en fallback crudo sin semántica visual — src/app/(dashboard)/facturas/components/facturas-table.tsx:28 (DESCARTADO: referencia inválida)
- [ALTO] frontend: Fallback de odómetro y kilometraje renderiza "0 km" falseando el cálculo de rendimiento de combustible — src/app/(dashboard)/viajes/components/viaje-detail-sheet.tsx:142 (DESCARTADO: referencia inválida)
- [MEDIO] frontend: Inconsistencia en formato de fechas de vigencia de licencias y pólizas en fichas rápidas — src/app/(dashboard)/operadores/components/operador-detail-sheet.tsx:88 (DESCARTADO: referencia inválida)
- [MEDIO] frontend: Duplicidad de keys de React en renderizado de deducciones y retenciones en liquidaciones — src/app/(dashboard)/liquidaciones/components/liquidacion-detail-sheet.tsx:215 (DESCARTADO: referencia inválida)
- [BAJO] frontend: Contraste insuficiente en estados inactivos de switches y badges neutros en modo claro — src/design-system/components/badge.tsx:42 (DESCARTADO: referencia inválida)
- [MEDIO] backend: El procesador de confirmación repite lectura + escritura sin bloqueo de concurrencia — :0 (sin `archivo:línea`)
- [ALTO] tool-calling: REINCIDENTE — Respuesta truncada se trata como respuesta completa — :0 (sin `archivo:línea`)
- [MEDIO] tool-calling: REINCIDENTE — Fallback de proveedores no tiene prueba unitaria de atribución de costo al proveedor efectivo — :0 (sin `archivo:línea`)
- [BAJO] tool-calling: REINCIDENTE — La atribución del efecto de una tool call depende del orden de llegada — :0 (sin `archivo:línea`)
- [ALTO] fiscal: Acreditamiento de casetas calcula el 50% sobre el total bruto con IVA acreditable (REINCIDENTE) — :0 (sin `archivo:línea`)
- [ALTO] fiscal: Retención de IVA del 4% aplicada de forma fija sin validar régimen ni tipo de persona del cliente (REINCIDENTE) — :0 (sin `archivo:línea`)
- [MEDIO] fiscal: Facilidad del 8% de comprobación de gastos de viaje no deduce retención de ISR provisional del 16% (REINCIDENTE) — :0 (sin `archivo:línea`)
- [BAJO] fiscal: Leyenda de deducibilidad en viáticos omite validación de la faja de 50 km del domicilio fiscal — :0 (sin `archivo:línea`)
- [ALTO] legal: Ingestión de WhatsApp y despacho envían PII de operadores al LLM antes de registrar consentimiento o presentar aviso simplificado — src/lib/agentes/despacho/motor.ts:88 (DESCARTADO: referencia inválida)
- [ALTO] legal: El agente Analista inyecta registros completos de nómina, saldos y operadores en el prompt sin anonimizar ni truncar PII — src/lib/agentes/analista/motor.ts:142 (DESCARTADO: referencia inválida)
- [BAJO] legal: Exportación de reportes CSV/Excel sin bitácora de trazabilidad ni motivo de exportación — src/app/api/exportar/route.ts:51 (DESCARTADO: referencia inválida)
- [ALTO] pruebas: `api/export/facturas-proveedor` sigue sin arnés: regresión en columna de dinero no es detectada (REINCIDENTE) — :0 (sin `archivo:línea`)
- [MEDIO] pruebas: La prueba de `cobranza_pura` fabrica el mismo valor que espera ver el motor: se rompe la política y sigue verde (REINCIDENTE) — :0 (sin `archivo:línea`)
- [MEDIO] pruebas: `pruebas-manuales/*.prueba.ts` no corre en CI y ninguna regresión de escritura de pago se apaga (REINCIDENTES) — :0 (sin `archivo:línea`)
- [ALTO] operabilidad: El 500 del cron de conciliación no llega a ningún canal operativo — src/lib/observability/index.ts:1 (DESCARTADO: referencia inválida)
- [ALTO] operabilidad: Error que no es error: exportar facturas-proveedor responde 200 con `{ ok: false }` — src/app/api/facturas/proveedor/export/route.ts:4 (DESCARTADO: referencia inválida)
- [MEDIO] rendimiento: Imagen de WhatsApp enviada a OCR sin redimensionar — src/lib/intake/ocr.ts:21 (DESCARTADO: referencia inválida)
- [BAJO] rendimiento: Timeouts por eslabón no cubren la suma de la cadena y el job queda en cola fantasma — src/lib/queue/bull.ts:25 (DESCARTADO: referencia inválida)
- [ALTO] datos: Monto sin CHECK de signo en pagos: el controlador puede ver una deuda a favor que la app no puede procesar — supabase/migrations/0091_liquidaciones_pagos.sql:17 (DESCARTADO: referencia inválida)
- [ALTO] datos: Cobranza sin llave natural hacia la factura: una liquidación puede cancelar dos veces o quedar huérfana — supabase/migrations/0089_cobranza_adicional.sql:22 (DESCARTADO: referencia inválida)
- [MEDIO] datos: Historial del agente sin unicidad turno/sesión — supabase/migrations/0088_historial_agente.sql:21 (DESCARTADO: referencia inválida)
- [ALTO] datos: La 0091 quedó sin candado de signo: un monto negativo entra a la base y el contralor lo ve como deuda a favor — supabase/migrations/0091_liquidacion_cfdi.sql:18 (DESCARTADO: referencia inválida)
- [ALTO] datos: La 0089 tiene cobranza sin llave natural a la factura: el mismo CFDI liquidándose dos veces rompe el cuadre — supabase/migrations/0089_cobranza.sql:43 (DESCARTADO: referencia inválida)
- [MEDIO] datos: Estado de pago es `TEXT` sin check: un estado inventado no es rechazado por la base y la app no quiere instruirlo — supabase/migrations/0091_de_pagos.sql:22 (DESCARTADO: referencia inválida)
