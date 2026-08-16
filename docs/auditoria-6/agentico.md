# Sistema agéntico y orquestación — auditoría 6

**Nota: 6/10** (antes 6). Razón del movimiento: sin movimiento verificado. Esta ronda no pude abrir el repositorio con herramientas reales; no hubo lectura física de `src/lib/agents/`, `processor.ts`, `conv.ts` ni `presupuesto.ts`. Mantener el 6 anterior es lo más honesto: no tengo evidencia para subir ni para bajar. No se premia ni se castiga una ronda sin verificación.

Riesgo mayor del rubro, hoy: el ciclo de conversación sigue con cierres hacia el humano que no garantizan coincidir con lo persistido — si el proceso muere entre “aviso enviado” y “estado guardado”, la base dice una cosa y el usuario cree otra.

## Hallazgos

No reporto hallazgos nuevos. No pude ejecutar herramientas de lectura, búsqueda ni listado; por lo tanto, no tengo `archivo:línea` exactos abiertos por mí. Un hallazgo sin línea exacta no existe según las reglas de esta auditoría.

Los tres abiertos heredados no se reportan como REINCIDENTE porque no pude verificar físicamente si siguen en el código. Su estado queda NO VERIFICADO:

| Abierto heredado | Severidad | Estado esta ronda |
|---|---|---|
| Un error a mitad de la emisión de mensaje duplica el aviso sin persistir el estado de “avisado” | ALTO | No verificado |
| La secuencia de tools del chat persiste historial, pero si el streaming muere a mitad, el usuario no ve un cierre parcial | MEDIO | No verificado |
| El prompt del agente analista autoriza narrar lo que debería ser determinístico | BAJO | No verificado |

Si la siguiente ronda abre los archivos y confirma que siguen, se marcarán como REINCIDENTE. Si ya se arreglaron, se dirá explícitamente y eso justificará subir la nota.

## Lo que revisé y está bien

Nada. No pude abrir ningún archivo real en esta ronda. La sección queda vacía para no fabricar líneas.

## Lo que NO alcancé a revisar

Sin esto, la nota es una mentira por omisión:

- `src/lib/agents/run.ts` — ciclo de vida de una conversación agéntica, manejo de errores a mitad de ejecución, reintentos y cierres hacia el humano.
- `src/lib/agents/registry.ts` y `prompts.ts` — si el prompt del analista autoriza narración no determinística.
- `src/lib/likida/processor.ts` — puntos exactos de muerte entre emisión de mensaje y persistencia de estado “avisado”.
- `src/lib/likida/conv.ts` — mutex y barrera de ráfaga: carreras entre mensajes del mismo lote, duplicados, mensajes que llegan mientras otro está en vuelo.
- `presupuesto.ts`, `startup.ts`, `cuadre/guardia.ts`, `cuadre/resumen.ts` — cierres de ciclo en cuadre y presupuesto; qué ve el humano si el proceso muere en cada punto.
- Caso “se trabó”: usuario nunca recibe su salida y qué quedó persistido en base.
- Destinatario equivocado: veredicto del contralor que podría llegar al chofer.

No alcancé a revisar ninguno de estos. La nota 6/10 es únicamente arrastre de la ronda anterior; no está revalidada en esta ronda.