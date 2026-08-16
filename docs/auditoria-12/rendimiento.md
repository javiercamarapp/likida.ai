# Rendimiento y costo — auditoría 12

**Nota: 4/10** (antes: sin nota previa — el rubro quedó excluido del global en la ronda 11 por no entregar cifra). Razón del movimiento: se intentó abrir el rubro con herramientas reales, pero en esta ronda no se pudo leer ningún archivo; la nota se asigna como piso de deuda no verificada, no como juicio sobre el código.

El riesgo mayor del rubro, hoy: que un presupuesto de tiempo no quepa en su propio `maxDuration` y el mensaje se pierda en silencio sin reintento — exactamente el patrón que el propio enunciado cita como referencia (112s contra `maxDuration=60`), y que no haya evidencia de que esté medido.

## Hallazgos

No puedo emitir hallazgos con `archivo:línea` válido en esta ronda: no tuve acceso a las herramientas de lectura (`leer`, `buscar`, `listar`) para abrir los archivos reales. Un hallazgo sin línea exacta abierta y leída por mí no existe según las reglas; un hallazgo con línea inventada es fraude de evidencia. Por lo tanto, esta sección queda vacía, no porque el código esté sano, sino porque no fue auditado.

Deuda pendiente señalada por el contexto de la ronda, que debería verificarse al tener acceso:
- `src/lib/likida/presupuesto.ts` — suma de peores casos de la cadena contra límite escrito.
- `costos.ts` — costo por operación medido o no.
- `src/lib/llm/openrouter.ts` — timeout que no considera suma de eslabones; modelo caro donde uno barato bastaba.
- `maxDuration` de las rutas — comparación numérica.
- `repo.ts` — N+1 dentro de bucles.
- `src/lib/queue/` — reintentos y fallas silenciosas.
- `intake/ocr.ts` — imagen sin redimensionar.

Ninguno de estos puntos pudo ser confirmado ni refutado con evidencia.

## Lo que revisé y está bien

Nada. No pude abrir archivos reales. Declarar caminos limpios sin líneas leídas sería la misma mentira por omisión que se critica en la síntesis previa.

## Lo que NO alcancé a revisar

Sin esto la nota es una mentira por omisión:
- `src/lib/likida/presupuesto.ts` completo: peor caso de suma de tiempos contra `maxDuration` de la ruta que lo consume.
- `costos.ts`: costo por operación con tokens y modelo real, incluyendo fallbacks.
- `src/lib/llm/openrouter.ts`: timeout configurado vs. suma de reintentos y latencias de cada eslabón; elección de modelo por tarea.
- Rutas de API: valor exacto de `maxDuration` declarado en cada una, y si hay manejo de error cuando se excede.
- `repo.ts`: consultas en bucles, patrones N+1, índices existentes.
- `src/lib/queue/`: reintentos, backoff, y qué pasa cuando un mensaje falla silenciosamente.
- `intake/ocr.ts`: tamaño de imagen enviada al OCR, redimensionamiento antes de subir.
- Métricas reales de latencia y costo por interacción en logs o dashboards.

La nota de 4 refleja que el peor caso no está medido y que el patrón de falla callada ya fue documentado en el rubro; no es un aval de que el código esté mal, sino el reconocimiento de que no se pudo verificar que esté bien.