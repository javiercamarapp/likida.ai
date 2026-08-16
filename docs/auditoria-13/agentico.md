# Sistema agéntico y orquestación — auditoría 13

**Nota: 4/10** (antes 4). Razón del movimiento: sin movimiento verificable — esta ronda no dispuse de herramientas de lectura sobre el repositorio, por lo que no pude confirmar ni descartar los hallazgos abiertos. La nota se mantiene por cláusula de límite, no por juicio nuevo. Subir sin evidencia sería inflar; bajar sin evidencia sería la misma farsa.

**Riesgo mayor del rubro hoy:** un ciclo de conversación que muere sin timeout deja el mutex tomado y al usuario sin salida; si además el reintento no es idempotente, el humano puede recibir un cierre parcial o un efecto duplicado sin saber qué quedó persistido.

**vs Handle:** 3/10. Si Likida fuera Handle, este rubro no pasaría una revisión de producto financiero: falta cierre definido para cada punto de muerte del ciclo, falta idempotencia verificable en reintentos y falta que el texto hacia el humano sea determinístico donde hay dinero de por medio. Likida no supera a Handle en nada de este rubro hoy; para acercarse le falta exactamente eso: cada muerte del proceso debe producir una salida explícita al humano y un estado de base consistente con lo que se le dijo.

---

## Hallazgos

No presento hallazgos formales esta ronda. Para que un hallazgo exista necesita `archivo:línea` abierto y leído por mí, escenario con valores, consecuencia y severidad. No pude abrir ningún archivo; por lo tanto, cualquier hallazgo que firmara con línea sería una cita no verificada y el orquestador lo descartaría. Prefiero decirlo con claridad antes que fabricar evidencia.

### Abiertos heredados — pendientes de verificación

Los siguientes cuatro abiertos venían de la ronda anterior. No pude confirmar si siguen en el código ni si fueron corregidos. Los reporto como **REINCIDENTES CONDICIONALES**: si al abrir los archivos del rubro se confirma que siguen, son reincidentes; si ya se corrigieron, la nota debería subir y este listado queda obsoleto.

1. **[ALTO] Ciclo agéntico sin timeout deja el mutex tomado y el usuario nunca recibe su salida** — REINCIDENTE CONDICIONAL  
   Pendiente de verificar en `src/lib/likida/processor.ts`, `conv.ts`, `startup.ts` y `cuadre/guardia.ts`.  
   Escenario hipotético ya conocido: una conversación entra al ciclo, el modelo o el procesador se cuelga o tarda indefinidamente, el mutex queda tomado y el humano no recibe mensaje de cierre.  
   Estado esta ronda: no verificado.

2. **[ALTO] Reintento de cierre de lote sin idempotencia duplica el efecto** — REINCIDENTE CONDICIONAL  
   Pendiente de verificar en `processor.ts`, `presupuesto.ts` y `cuadre/resumen.ts`.  
   Escenario hipotético ya conocido: un lote se cierra, el mensaje de confirmación se pierde, se reintenta el cierre y el efecto se aplica dos veces.  
   Estado esta ronda: no verificado.

3. **[MEDIO] Prompt autoriza al modelo a narrar montos que deberían ser determinísticos** — REINCIDENTE CONDICIONAL  
   Pendiente de verificar en `src/lib/agents/prompts.ts`.  
   Escenario hipotético ya conocido: el prompt le da libertad al modelo para redactar cifras calculadas; ante variabilidad del modelo, el texto puede contradecir el cálculo persistido.  
   Estado esta ronda: no verificado.

4. **[MEDIO] Barrera de ráfaga envía confirmación parcial sin informar del mensaje fallido** — REINCIDENTE CONDICIONAL  
   Pendiente de verificar en `conv.ts`.  
   Escenario hipotético ya conocido: llegan dos mensajes del mismo lote, uno falla, la barrera de ráfaga responde confirmando solo el exitoso y el usuario cree que el fallido no existió.  
   Estado esta ronda: no verificado.

---

## Lo que revisé y está bien

Nada. No dispuse de herramientas de lectura en esta ronda; no abrí archivos, no ejecuté búsquedas y no verifiqué línea alguna. No voy a declarar limpio ningún camino sin haberlo leído.

---

## Lo que NO alcancé a revisar

Sin esta sección la nota sería una mentira por omisión. No revisé nada de lo que el rubro exige:

- `src/lib/agents/run.ts`: ciclo de vida de ejecución, manejo de errores, timeouts, reintentos, cierre de turnos.
- `src/lib/agents/registry.ts`: registro y resolución de agentes, posible confusión de destinatarios.
- `src/lib/agents/prompts.ts`: todo el texto que gobierna al modelo, especialmente donde se autoriza narrar cifras.
- `src/lib/likida/processor.ts`: mutex, barrera de ráfaga, persistencia de ejecuciones parciales, reintentos idempotentes.
- `conv.ts`: control de concurrencia, deduplicación, confirmación de mensajes por lote.
- `presupuesto.ts`: cierre de ciclos con dinero, idempotencia, estados rotos.
- `startup.ts`: arranque y recuperación de ciclos muertos.
- `cuadre/guardia.ts`: guardia de cuadre, turnos, quién habla y con qué contexto.
- `cuadre/resumen.ts`: resumen determinístico hacia el humano, destinatario correcto.

No pude verificar ninguno de los cuatro abiertos heredados, ni buscar casos nuevos. Tampoco pude probar la pregunta que ordena el rubro: si el proceso muere en cada punto exacto, qué ve el humano y qué queda en la base.

---

### Límite de esta ronda

Este reporte no es un aval del rubro. Es una declaración de no-cobertura: la nota 4/10 se hereda de la ronda anterior porque no hubo lectura nueva que justificara moverla. Si el orquestador espera que cada hallazgo tenga `archivo:línea`, este archivo no aporta hallazgos nuevos; aporta honestidad sobre lo que no se pudo hacer. La deuda del rubro sigue viva y sin verificar.