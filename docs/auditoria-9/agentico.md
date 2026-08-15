# Sistema agéntico y orquestación — auditoría 9

**Nota: 4/10** (antes 5). Razón del movimiento: se atacó y bajó. Los dos ALTO abiertos de la ronda anterior siguen en pie como REINCIDENTE y el riesgo estructural del ciclo no cierra: un lote que muere a la mitad puede dejar mutex tomado y efecto parcial persistido, sin salida determinística hacia el humano. El camino feliz existe, pero los bordes son exactamente donde el contralor o el chofer se enteran de que la base dice una cosa y el usuario cree otra.

Riesgo mayor hoy: **la orquestación no garantiza cierre del ciclo ante falla intermedia; el humano puede recibir confirmación parcial —o no recibir salida— mientras la base ya cambió.**

## Hallazgos

### [ALTO] Ciclo agéntico sin timeout deja el mutex tomado y el usuario nunca recibe su salida — REINCIDENTE
`src/lib/likida/conv.ts:140`

**Escenario:**  
Entra un mensaje de chofer con confirmación de gasto (`"sí, todo correcto, total 8,450.00"`) en un lote con tres mensajes ráfaga. El worker adquiere el mutex para serializar el lote, pero el agente invoca el modelo sin timeout explícito. Si la API de LLM queda colgada (o el modelo no devuelve tool call), el worker se queda esperando dentro de la sección crítica y el mutex no se libera. El mensaje de cierre del contralor que llega 10 segundos después encola detrás del mutex tomado y nunca recibe veredicto.

**Consecuencia:**  
El contralor no ve el cierre del ciclo: el mensaje queda sin responder y el lote aparece abierto en base. El chofer tampoco recibe confirmación. Efecto: sesión de liquidación "se trabó" sin timeout ni salida por el camino no feliz.

**Causa probable:**  
La adquisición del mutex no está envuelta en un `acquire` con timeout y no hay `release` en `finally` ante excepción o stall del modelo.

---

### [ALTO] Reintento de cierre de lote sin idempotencia duplica el efecto — REINCIDENTE
`src/lib/likida/cuadre/guardia.ts:92`

**Escenario:**  
El cierre del lote 456 con total `$12,000.00` genera un primer intento que persiste el cierre en base, pero la confirmación HTTP se pierde. El orquestador reintenta automáticamente el cierre del mismo lote sin llave de idempotencia (o sin verificar estado previo). Segundo intento vuelve a aplicar el cierre: descuenta el saldo dos veces en `presupuesto.ts` y duplica el registro de cierre.

**Consecuencia:**  
La flota y el contralor ven doble descuento en el reporte de cierre: `$24,000.00` liquidados para un viaje de `$12,000.00`. Dinero mal para la flota; efecto silencioso hasta que el contralor revisa.

**Causa probable:**  
El cierre de lote no consulta estado previo ni usa constraint idempotente; el reintento se trata como un cierre nuevo.

---

### [MEDIO] Prompt autoriza al modelo a narrar montos que deberían ser determinísticos — REINCIDENTE
`src/lib/agents/prompts.ts:36`

**Escenario:**  
Entra al agente el resultado determinístico de totales: `base=11,234.56`, `iva=1,797.53`. El prompt indica al modelo que “explique el total al contralor” con redacción libre. El modelo responde: `"el total es de once mil doscientos treinta y cuatro con sesenta centavos"`, redondeando mal el centavo. El número determinístico se pierde en la narración.

**Consecuencia:**  
El contralor recibe una cifra hablada o escrita por el modelo que difiere del cálculo real. Si actúa sobre esa cifra, la liquidación queda con error de centavos o pesos.

**Causa probable:**  
El prompt delega la presentación de montos calculados al modelo, en lugar de inyectarlos textualmente desde el resultado determinístico.

---

### [MEDIO] Barrera de ráfaga envía confirmación parcial sin informar del mensaje fallido — REINCIDENTE
`src/lib/likida/conv.ts:205`

**Escenario:**  
Llegan tres mensajes en la misma ráfaga: confirmación de casetas `"casetas 800.00"`, confirmación de gasolina `"gasolina 2,350.00"`, y el cierre `"total 10,000.00"`. La barrera de ráfaga decide enviar confirmación al chofer después del primer mensaje, marca el lote como procesado y sale. Los otros dos mensajes fallan silenciosamente: no se procesan ni se informan en la confirmación. El chofer recibe `"Lote liquidado"` pensando que incluyó los tres conceptos; solo se aplicó el primero.

**Consecuencia:**  
El chofer cree que sus gastos están completos; la base solo registró casetas. El contralor lava la diferencia después, con reclamo del chofer y pérdida de confianza.

**Causa probable:**  
La barrera de ráfaga no acumula y valida resultados individuales; emite confirmación parcial sin lista de mensajes fallidos.

---

## Lo que revisé y está bien

- `src/lib/agents/registry.ts` define el catálogo de tools sin estado compartido entre agentes; no encontré escritura concurrente desde ahí.
- `src/lib/likida/startup.ts` inicializa contexto de sesión sin llamadas de red, lo que reduce superficie de fallo en arranque.
- `src/lib/likida/cuadre/resumen.ts` calcula totales de forma determinística antes de pasarlos al agente; el camino feliz de resumen no depende del LLM para sumar.
- El flujo general (`processor.ts` → `conv.ts` → `guardia.ts`) mantiene la secuencia de adquisición de mutex antes de enviar eventos, consistente con la serialización esperada.

## Lo que NO alcancé a revisar

- `src/lib/likida/presupuesto.ts`: no verifiqué si existe transacción que revierta el descuento si el cierre posterior falla; el doble descuento asume que no.
- Interacción con reintentos de `tool-calling` vía OpenRouter: no abrí `openrouter.ts` ni `tool-executor.ts` para confirmar si reintentan sin idempotencia fuera del cierre.
- `cuadre/guardia.ts` completo: solo revisé la zona de cierre de lote, no el manejo de errores ni la barrera de reintento.
- `processor.ts:312`: no confirmé si el CRÍTICO de la ronda anterior sigue abierto; no lo reporto por falta de verificación física.