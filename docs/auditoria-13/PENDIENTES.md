
## Cierre por evidencia — los 3 ALTOS de tool-calling (rondas 11-13)
Verificado en el código ACTUAL (los auditors citaban líneas de snapshot viejo; la verificación sintáctica no contrasta contenido):
1. Truncado tratado como completo → **YA CERRADO**: `generateWithTools` lanza `TruncatedError` en `finish_reason:'length'` (+ `generateStructured`). Anclado en `openrouter_truncado_tools.test.ts` (verde).
2. Costo de fallback con modelo original → **YA CERRADO**: `costoPorModelo` acumula por ronda con el modelo REAL que respondió (`generateWithTools`); anclado en `openrouter_fallback_costo.test.ts` (verde).
3. Dedup por id y no por efecto → **FALSO POSITIVO**: la caché cross-round usa `llaveDeCache(tools)` (nombre/efecto) y `makeExecutor` cachea por NOMBRE-efecto deliberadamente (decisión documentada en el proprio código, aud. 8 comentario). Anclado en `tool_executor_concurrente.test.ts` (verde).
Conclusión: tool-calling es el rubro más fuerte del repo (8/10) — los "reincidentes" eran falsas citas de líneas viejas.
