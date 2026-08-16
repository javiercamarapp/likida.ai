# Fixes aplicados — auditoría 9

- [FALSO_POSITIVO] agentico-A src/lib/likida/conv.ts: El archivo src/lib/likida/conv.ts no contiene ningún ciclo agéntico ni mutex; el contexto mostrado es resolveOperador y las clases ConsultaFallida/OperadorAmbiguo. No hay código de bloqueo ni timeout que se corresponda con el hallazgo.
- [FALSO_POSITIVO] agentico-A src/lib/likida/cuadre/guardia.ts: El código en guardia.ts:92 no contiene reintento de cierre de lote: es la validación `hablaDeDineroSinCifraVerificable` dentro de la rama de política. La función no ejecuta cierres ni escrituras; `cuadrarDesdeDB` es una lectura para narrar el cuadre y `snapshotCierre` evita recalcular si `guardar_liquidacion` ya cerró. No hay reintento ni duplicación de efecto en este archivo.
- [ERROR] agentico-M src/lib/agents/prompts.ts: tsc roto: src/lib/agents/prompts.ts(40,1): error TS1434: Unexpected keyword or identifier.
src/lib/agents/prompts.ts(40,4): error TS1434: Unexpected keyword or identifier.
src/lib/agents/prompts.ts(40,10): erro
- [FALSO_POSITIVO] agentico-M src/lib/likida/conv.ts: El contexto y el archivo proporcionados corresponden a getTenantContext y al nombre del agente; no contienen la barrera de ráfaga ni lógica de confirmación parcial o mensajes fallidos.
- [ERROR] tool-calling-A src/lib/llm/openrouter.ts: fixer sin JSON válido
- [ERROR] tool-calling-A src/lib/llm/openrouter.ts: fixer sin JSON válido
- [ERROR] tool-calling-A src/lib/llm/tool-executor.ts: fixer sin JSON válido
- [FALSO_POSITIVO] fiscal-A src/lib/likida/cuadre/engine.ts: Conforme a la Ley de Ingresos de la Federación (art. 16, Ap. A, fr. IV / art. 20), el estímulo fiscal por uso de autopistas de cuota se calcula expresamente sobre 'el total de las erogaciones efectivamente realizadas por concepto del pago de los servicios por el uso de la infraestructura carretera de cuota' (monto total pagado de peaje), sin que la disposición ordene descontar el IVA acreditable para la determinación de la base del 50% del acreditamiento.
- [FALSO_POSITIVO] fiscal-A src/lib/likida/intake/cfdi.ts: El archivo src/lib/likida/intake/cfdi.ts únicamente realiza parseo y decodificación de códigos QR/barras de CFDIs (extracción de UUID, RFC emisor/receptor, total y sello); no realiza cálculos ni aplicaciones de retenciones de IVA.
- [FALSO_POSITIVO] fiscal-B src/lib/likida/cuadre/leyendas.ts: El artículo 52 del Código Fiscal de la Federación (dictamen fiscal emitido por contador público registrado) se encuentra plenamente vigente y la mención en la leyenda es un descargo explícito de no emisión de dictamen conforme a CFF 52, 89 y 90.
- [ERROR] legal-A src/lib/likida/intake/sanitizar.ts: fixer sin JSON válido
- [ERROR] legal-A src/lib/likida/privacidad.ts: fixer sin JSON válido
- [FALSO_POSITIVO] legal-M src/lib/likida/privacidad.ts: El aviso ya incluye una cláusula explícita sobre decisiones automatizadas y perfilamiento: indica que la revisión la hace un programa sin intervención humana previa, reconoce el derecho a oponerse y solicitar revisión humana. También establece el mecanismo para ejercerlo mediante PRIVACIDAD.
- [FALSO_POSITIVO] operabilidad-A src/lib/logger.ts: El logger ya conserva trazabilidad de UUID mediante huellaId (id: + 12 hex), por lo que tenant/viaje/liquidación no se pierden; la línea 18 es un comentario que describe el comportamiento anterior ya corregido. No aplica reemplazo en logger.ts.
- [ERROR] operabilidad-A instrumentation.ts: fixer sin JSON válido
- [FALSO_POSITIVO] operabilidad-M .env.example: `.env.example` contiene placeholders vacíos intencionalmente para secretos y valores dependientes del entorno; rellenarlos con valores reales o ficticios cambiaría la configuración documentada y no constituye una implementación duplicada que pueda unificarse.
- [FALSO_POSITIVO] rendimiento-A src/lib/likida/repo.ts: El archivo repo.ts:87 no contiene consultas de movimientos por viaje; la línea corresponde al mapeo del nombre de terminal en getOperador. No se identifica N+1 en el contexto provisto.
- [FALSO_POSITIVO] rendimiento-M src/lib/llm/openrouter.ts: La línea señalada (112) está dentro de `isTransientError` y solo normaliza mensajes de error para detectar fallos transitorios; no hay selección de modelo ni tarea administrativa simple en ese contexto.

Commit: git log -1 --format='%h %s'