# Fixes aplicados — auditoría 7

- [FALSO_POSITIVO] backend-A src/lib/likida/duplicados.ts: La línea 3 es un comentario del encabezado; el archivo no contiene ningún bloque de importación ni un `Set` de deduplicación sin llave de negocio. Los `Set` existentes operan sobre llaves de negocio (`cfdiUuid`, `concepto|folio|monto`) o sobre longitudes de UUID, por lo que el hallazgo no aplica.
- [ERROR] backend-M src/lib/likida/processor.ts: tsc roto: src/lib/likida/processor.ts(2474,1): error TS1005: '}' expected.


- [FALSO_POSITIVO] tool-calling-A src/lib/llm/openrouter.ts: La línea 158 es un comentario de documentación sobre costos; en las líneas 146-170 no hay ejecución de tool calls ni manejo de finish_reason, por lo que el hallazgo no aplica a la ubicación indicada.
- [ERROR] tool-calling-M src/lib/llm/openrouter.ts: tsc roto: src/lib/llm/openrouter.ts(271,11): error TS7022: 'res' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
src/lib/llm
- [FALSO_POSITIVO] tool-calling-B src/lib/llm/tool-executor.ts: Las líneas 63-83 son un comentario de auditoría y la definición de VOCABULARIO_POSTGRES en código de producción, no un test. No hay assertions ni mecanismo de testing que podar; eliminar esas líneas cambiaría el código activo y la trazabilidad, y el hallazgo no se refiere a ningún test inútil.
- [FALSO_POSITIVO] seguridad-M package-lock.json: El hallazgo cita package-lock.json:72, que es el engines.node de @ampproject/remapping, no Next.js ni next/image. No hay CVE ni superficie explotable en ese tramo.
- [FALSO_POSITIVO] fiscal-B src/lib/likida/cuadre/leyendas.ts: leyendaPdf es el descargo general de responsabilidad legal y no dictamen conforme a CFF 52, 89 y 90. El fundamento específico de LISR/RLISR/RFA aplica a nivel de cada partida/concepto evaluado, no en el footer general de exención de responsabilidad.
- [FALSO_POSITIVO] legal-A src/lib/likida/intake/sanitizar.ts: El hallazgo se refiere a la transferencia internacional de datos personales y patrimoniales antes del consentimiento, pero este archivo únicamente implementa saneamiento local de texto (sanitizarTexto, sanitizarProducto) y no contiene lógica de ingesta de WhatsApp ni extracción LLM. La línea 42 señalada es un comentario que documenta el límite de la protección, no código ejecutable de transferencia. No hay código que corregir en este archivo para abordar el problema.
- [ERROR] legal-A src/lib/likida/intake/sanitizar.ts: fixer sin JSON válido
- [FALSO_POSITIVO] legal-M src/lib/likida/privacidad.ts: No es un hallazgo de implementaciones duplicadas: describe una funcionalidad legal ausente. La línea 65 pertenece únicamente a un comentario, por lo que no hay un reemplazo de duplicación que unificar.

Commit: git log -1 --format='%h %s'