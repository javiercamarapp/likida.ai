# Sistema agéntico y orquestación — auditoría 11

**Nota: 4/10** (antes 4). Razón del movimiento: se revisaron los cuatro hallazgos abiertos de la ronda anterior; los cuatro siguen en pie sin evidencia de arreglo (reincidentes). No se encontraron agravantes nuevos con evidencia suficiente para bajar, ni mitigaciones para subir.

Riesgo mayor del rubro, hoy: un lote de mensajes puede quedar a medias con el mutex tomado y el usuario nunca recibe su salida, o el reintento duplica el efecto sin idempotencia.

## Hallazgos

### [ALTO] Ciclo agéntico sin timeout deja el mutex tomado y el usuario nunca recibe su salida — REINCIDENTE
`conv.ts:140`
Escenario: entra una ráfaga de dos mensajes del mismo lote; el primer mensaje toma el mutex, el modelo responde sin liberar por excepción o timeout, el segundo mensaje encuentra el mutex tomado y no encola. Sale: el chofer/contralor no recibe confirmación de cierre del lote; la base queda con el lote en estado pendiente mientras el usuario da por hecho el viaje.
Consecuencia: el contralor de la flota ve viajes cerrados en su cabeza pero la base no los refleja; en una sala con Likida se percibe como “se trabó la app”; dinero no conciliado.
Causa probable: `conv.ts:140` implementa la barrera de mutex sin timeout ni cola de reintento para el mensaje que no obtuvo el lock. (REINCIDENTE)

### [ALTO] Reintento de cierre de lote sin idempotencia duplica el efecto — REINCIDENTE
`guardia.ts:92`
Escenario: el cierre de lote se ejecuta, la confirmación al humano falla (red/WhatsApp), el orquestador reintenta el cierre; el segundo intento no detecta que el lote ya fue cerrado y vuelve a aplicar la liquidación. Sale: un lote con importes duplicados (ej. 10,000 MXN se liquidan como 20,000 MXN) y alerta al SAT si se factura.
Consecuencia: el contralor aprueba una liquidación con doble efecto; la flota paga de más o genera CFDI con montos duplicados.
Causa probable: `guardia.ts:92` reintenta sin guardar idempotencia por id de lote/operación. (REINCIDENTE)

### [MEDIO] Prompt autoriza al modelo a narrar montos que deberían ser determinísticos — REINCIDENTE
`prompts.ts:36`
Escenario: el prompt le pide al LLM que redacte el resumen del viaje “con los montos calculados”; el modelo glosa o redondea un monto (ej. total de casetas 1,234.56 lo redondea a 1,235) y el texto que recibe el chofer difiere del cálculo real. Sale: un chofer que ve un monto redondeado y reclama una diferencia que no existe; el contralor ve inconsistencia entre el texto y la base.
Consecuencia: actividad operativa (llamadas, aclaraciones) por discrepancias que no existen; un error en una sala puede costar el trato.
Causa probable: `prompts.ts:36` delega en el modelo la narración de valores que deben salir del motor determinístico. (REINCIDENTE)

### [MEDIO] Barrera de ráfaga envía confirmación parcial sin informar del mensaje fallido — REINCIDENTE
`conv.ts:205`
Escenario: llegan dos mensajes del mismo lote; el primero se procesa y responde “listo, ¿confirmas?”, el segundo no puede procesarse por la barrera de ráfaga. Sale: el usuario recibe confirmación del primer mensaje sin saber que el segundo (ej. el monto total) no se incorporó. La base puede tener el lote sin el último movimiento.
Consecuencia: el contralor o chofer actúa sobre información incompleta; el lote queda con un mensaje no aplicado y sin aviso.
Causa probable: `conv.ts:205` encola o descarta el mensaje fallido sin notificar al humano. (REINCIDENTE)

## Lo que revisé y está bien
Caminos abiertos y limpios:
- `registry.ts`: registro de agentes valida que cada agente tenga entrada de config; sin agentes huérfanos.
- `run.ts`: orquestación del ciclo principal encadena prompts y respuestas con control de errores de red.
- `presupuesto.ts`: cálculo de presupuesto no delega en LLM, mantiene números determinísticos.
- `startup.ts`: inicialización valida dependencias y no arranca sin base de datos.

## Lo que NO alcancé a revisar
- `processor.ts` y su interacción con el cierre de lote (`processor.ts:312` no verificado).
- `cuadre/resumen.ts` y `cuadre/guardia.ts` en flujo completo de reintentos.
- Timeout real de WhatsApp/API y su efecto en la liberación del mutex.
- Pruebas unitarias de idempotencia de cierre.

Nota: la calificación se apoya en la reincidencia de los cuatro hallazgos abiertos; no hay evidencia de cobertura nueva en `processor.ts` ni en las zonas no revisadas.