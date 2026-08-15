# Fixes aplicados — auditoría 7

- [FALSO_POSITIVO] backend-A src/lib/likida/duplicados.ts: El hallazgo no aplica: no existe un 'dedup de importación' en el archivo; la línea 3 es un comentario de cabecera y los Set usados son parte de la lógica de detección de duplicados entre viajes, con llaves de negocio definidas en la función entreViajes.
- [ERROR] backend-M src/lib/likida/processor.ts: árbol de git sucio — no commit atómico
- [ERROR] tool-calling-A src/lib/llm/openrouter.ts: árbol de git sucio — no commit atómico
- [ERROR] tool-calling-M src/lib/llm/openrouter.ts: árbol de git sucio — no commit atómico
- [ERROR] tool-calling-B src/lib/llm/tool-executor.ts: árbol de git sucio — no commit atómico
- [ERROR] seguridad-M package-lock.json: árbol de git sucio — no commit atómico
- [ERROR] fiscal-B src/lib/likida/cuadre/leyendas.ts: árbol de git sucio — no commit atómico
- [ERROR] legal-A src/lib/likida/intake/sanitizar.ts: árbol de git sucio — no commit atómico
- [ERROR] legal-A src/lib/likida/intake/sanitizar.ts: árbol de git sucio — no commit atómico
- [ERROR] legal-M src/lib/likida/privacidad.ts: árbol de git sucio — no commit atómico

Commit: git log -1 --format='%h %s'