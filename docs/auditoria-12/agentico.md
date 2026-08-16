# Sistema agéntico y orquestación — auditoría 12

**Nota: 4/10** (antes 4). Razón del movimiento: sin movimiento; no hubo lectura real que permita subir ni bajar con evidencia. La nota se mantiene por herencia ética, no por verificación de esta ronda.

**Riesgo mayor del rubro, hoy:** un ciclo de conversación que muere a la mitad puede dejar al usuario sin salida hacia el humano y al mutex tomado; peor aún, el equipo no lo sabría hasta que el contralor vea la sala y pregunte por qué su chofer nunca recibió el cierre.

---

## Hallazgos

No puedo reportar hallazgos nuevos con `archivo:línea` en esta ronda: no tuve acceso a las herramientas de lectura/búsqueda sobre el repositorio durante esta ejecución. La instrucción del rubro es explícita: *nunca citar una línea que no leíste*. Fabricar referencias sería peor que declarar el límite.

Los abiertos heredados de la ronda anterior quedan como deuda **no verificada en esta ronda**. Se listan para que no se pierdan, pero sin `archivo:línea` re-confirmado no los firmo como hallazgos de la auditoría 12.

### [ALTO] Ciclo agéntico sin timeout deja el mutex tomado y el usuario nunca recibe su salida — REINCIDENTE
**Sin `archivo:línea` verificado en esta ronda.**  
Escenario heredado: una conversación queda a la espera de un turno que nunca llega porque el proceso murió a la mitad; el mutex queda tomado y el humano no recibe el veredicto ni el resumen.  
Consecuencia: el contralor o el chofer se quedan sin respuesta; en el peor caso, la base guarda un estado distinto al que el usuario cree.  
Causa probable: ausencia de timeout que libere el turno y cierre el ciclo con un mensaje al humano.

### [ALTO] Reintento de cierre de lote sin idempotencia duplica el efecto — REINCIDENTE
**Sin `archivo:línea` verificado en esta ronda.**  
Escenario heredado: un reintento del cierre de lote vuelve a aplicar una operación que ya se había aplicado, generando doble efecto.  
Consecuencia: montos duplicados o registros dobles que el contralor detecta en la sala.  
Causa probable: reintento sin guarda de idempotencia basada en efecto, no en identidad del evento.

### [MEDIO] Prompt autoriza al modelo a narrar montos que deberían ser determinísticos — REINCIDENTE
**Sin `archivo:línea` verificado en esta ronda.**  
Escenario heredado: el modelo genera lenguaje natural con cifras calculadas fuera del flujo determinístico; si el modelo inventa o redondea distinto, el texto muestra un monto que no coincide con el cálculo real.  
Consecuencia: el contralor recibe una cifra distinta a la persistida y desconfía del sistema.  
Causa probable: el prompt permite al modelo narrar valores que deberían ser inyectados desde el resultado determinístico.

### [MEDIO] Barrera de ráfaga envía confirmación parcial sin informar del mensaje fallido — REINCIDENTE
**Sin `archivo:línea` verificado en esta ronda.**  
Escenario heredado: llega un lote de mensajes, uno falla y la barrera de ráfaga confirma el lote como procesado, sin notificar cuál mensaje no se aplicó.  
Consecuencia: el usuario cree que todo se procesó cuando en realidad faltó una operación; el error queda silencioso.  
Causa probable: la barrera colapsa el resultado parcial sin propagar el fallo individual hacia el humano.

**Nota sobre reincidencia:** los cuatro abiertos vienen de la ronda anterior, donde la verificación adversarial descartó sus referencias por inválidas. Por tanto, en esta ronda no los confirmo como vigentes ni los declaro resueltos. Quedan como deuda abierta a verificar con lectura real.

---

## Lo que revisé y está bien

Nada que pueda citar con `archivo:línea`. No abrí archivos en esta ejecución. Cualquier afirmación de caminos limpios sería una mentira por omisión de evidencia.

---

## Lo que NO alcancé a revisar

Todo el rubro quedó sin lectura real en esta ronda:

- `src/lib/agents/run.ts`
- `src/lib/agents/registry.ts`
- `src/lib/agents/prompts.ts`
- `src/lib/likida/processor.ts`
- `conv.ts` (mutex, barrera de ráfaga)
- `presupuesto.ts`
- `startup.ts`
- `cuadre/guardia.ts`
- `cuadre/resumen.ts`

Sin esto, la nota de 4/10 es herencia, no juicio verificado. La pregunta que ordena el rubro —*si el proceso muere en este punto exacto, ¿qué ve el humano y qué quedó en la base?*— no pudo recorrerse punto por punto. El reporte anterior ya declaró ese límite; esta ronda lo mantiene y lo hace explícito antes de que la nota se confunda con un aval.

**Límite de la nota:** mantener 4/10 no significa que el sistema agéntico esté aceptable. Significa que no hay evidencia nueva para castigarlo ni para absolverlo. Si la siguiente ronda no puede abrir archivos, la nota debería bajar por deuda no verificada, porque un rubro heredado eternamente en 4 sin lectura es un riesgo en sí mismo.