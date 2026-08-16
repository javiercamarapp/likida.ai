# Tool calling — auditoría 5

**Nota: 7/10** (antes 8). Baja de 8 a 7: la regla estructural del rubro sigue intacta — las tools no aceptan datos del modelo y `tenantId`/`viajeId` se resuelven en servidor —, pero la deuda del bloque `openrouter.ts` anotada en la ronda anterior sigue pendiente y esta ronda no aportó una prueba unitaria fresca del camino con fallback que muestre atribución de costo correcta. Sin esa prueba, el ancla de 8 no se sostiene.

Una línea con el riesgo mayor del rubro, hoy: una respuesta del LLM que se cae por límite de tokens puede Pasar por completa; el resultado que vuelve al del modelo está incompleto pero no se marca como tal, y la cifra que ve el contralor queda a-medio-pintar.

## Hallazgos

### [ALTO] Respuesta truncada por `finish_reason: "length"` se trata como respuesta completa
`src/lib/llm/openrouter.ts` (en `generateWithTools`/`generateStructured`, donde se elige el mensaje final y no se acciona sobre `finish_reason`).

**Escenario:** el agente de cobranza pide un resumen de 3 órdenes para el contralor. El request tiene `max_tokens: 3000`; el modelo responde dentro del monto, pero con `finish_reason: "length"` y un JSON o explicación de 2900 tokens incompletos. El código ve un `200` válido y parsea el `content`. El resultado informa al contralor que "los envíos 8892 y 8893 sí cubren la factura", pero el texto del tercero no apareció. El agente responde como si hubiera visto todo.

**Consecuencia:** El mensaje presentado está parcial (falla silenciosa, no ruido). Si el análisis en curso es el de las tarifas que van a pagar una flota, el contralor cierra una vista muy que en realidad no habla de la última factura. El error no se detecta porque no es un 4xx/5xx ni un error de parseo del JSON: la decodificación cierre con un JSON válido y corto (o una cadena cortada que escapa al errorhandler).

**Causa probable:** la capa de `finish_reason` y un fallback que reintenta con un mayor `max_tokens` o advierte “respuesta incompleta” no está provista.

---

### [MEDIO] El camino de fallback de proveedores no tiene prueba unitaria de atribución de costo al proveedor efectivo
`src/lib/llm/openrouter.ts` (función de conmutación entre proveedores/´ e intentos).

**Escenario:** el provider primario (OpenAI) responde con `429` en el interregno de una operación de despacho por WhatsApp. El fallback de Anthropic produce la respuesta correcta con 400 tokens de entrada y 120 de salida. La contabilidad de tokens/costo se ejecuta sobre el modelo *declarado para el tenant* (por ejemplo,piensa 4-o-mini), no el que realmente respondió (claude-sonnet). Es resultado: el panel de costo de Javier no detecta que hubo respuestas de un precio distinto; y el total histórico real de proveedor no es unurable para el equipo que negocia cuentas.

**Consecuencia:** un reporte monetario de la ronda de six agentes tiene una atribución falsa de proveedor, o le fascinou un costo de IA no detectado. No es una suma que afecte la liquidación del chofer, pero degrada y se nota si se abren los registros de costos.

**Causa probable:** el contador de `usage` se calcula desde el `model` del objeto `request`, no del `model` que viene en la caja de respuesta definitiva (o no se guarda la relación intento/éxito). El parcial ya registrado es un buen paso, pero falta la prueba del camino que cambia de proveedor.

---

### [BAJO] La atribución de un tool call al turno depende de la order de llegada (`dedupe` por llamada completa, no por efecto)
`src/lib/llm/tool-executor.ts` — en la deduplicación de las distintas ejecuciones en un mismo loop.

**Escenario:** por un mismo turno el LLM machine dos veces `enviar_aviso` para el viaje 123 (una vez en el tool_1 y otra en el tool_2, model con temperatura alta). El deduplicador compara `tool_call_id` (es distinta cada vez) y los argumentos; como la entrada es idéntica (`{"viajeId":"123","tipo":"cta"}`) la primera guarda un fingerprint de "*viajeId-123*" y, en cambio, por pares de id, en la segunda la huella es distrsiota, se ve como llamada nueva, y ejecuta lo mismo.

**Consecuencia:** la herramienta que manda aviso por WhatsApp dispara dos veces al chofer. No es un duplicado de dinero, pero, en un turno donde la herramienta mueve el estado final "viajes" (asignación de Operador, cambio de tarifa), el mismo efecto puede llegar otra vez.

**Causa probable:** la identificación de deruncación mira la leall es la llamada, no el *efecto final* (si esa tool, para el arte resuelto, ya escribió un registro; no hay candado de idempotencia en el paso de ejecución).

**Nota:** No Confirmid 100 que este problema esté vivo en la ronda actual: el archivo visto tiene el candadato para no repetir un mismo `tool_call_id`, pero el caso de deduplicación por efecto no se eliminó ni se agregó prueba.

### Sección anti-hallazgo (para que no se inflen falsos)
Los siguientes NO se reportan como hallazgos, porque entiéndase el diseño:
- tools que declara `la propiedad properties: {}` y que no acepten parámetros inferƟbles del modelo.
- `tenantId`/`viajeId` que vengan del contexto resuelto y no del mensaje.
- candado de timbres de facturación / cron de custodia que vayan anotados aparte.

## Lo que “se reconoce”, no “se halla” (verificado sin novedad)
**Las tools siguen libres de datos ingresados por el texto.** En `tools.ts` de los 6 agentes nuevos (liquidacion, facturas, cobranza, conductores, peajes, proveedores) todas las tools nuevas pasaron con `parameters.properties` vacío o sin parámetro que impacte dinero/atribución: su argumento es solo la *selección de la herramienta*; contextos como `tenantId`, `viajeId`, `estado`, `montoDelPendiente` se construyen en el código del servidor. Esto sigue cerrando la inyección de prompt por argumento de una forma estructural.

- `src/lib/likida/tools.ts` — tools de liquidación, cobranza, conductores y proveedores revisadas por el ojo; ninguna trae schema de argumentos que el LLM pueda rellenar con un monto.
- `src/lib/llm/tool-executor.ts` — rama principal: el ejecutador recibe lista de ejecución válida solo para el tenant resuelto. El executor “mira funcionar por nombre”, no por un blob.
- `lib/agents/analista.ts` — `chat-tools` de solo escucha; funciona encima de la misma regla.

## Lo que NO alcancé a revisar
- La numérica exacta del test de costos con fallback en `openrouter.test.ts`; sí se ve que existe el test de fallback, pero no encuentra un test que afirme “el costo se asigna al proveedor B cuando el A devolvió un error”.
- El `models.ts` y su mapeo de costos para los nuevos 6 agentes (800 llaves); no reviso entendidos de tokens por modelo propietario, ni todas las ramas de `usage` en `processor.ts` (~2,300 líneas).
- Nueva ola de participantes — `correo_parcial` del motor de cobranza (¿o más de una tool simultánea?) no se alcanzó a leer con lupa.
- No hay evidencia de que la dedup por efecto tenga o no otra salvaguardia en la capa de negocio; es podría estar cubierto por un candado de estado y los patios, en ese caso el hallazgo de “BAJO” es un no-evento.

**El cambio de nota es por la captura de los nueve gases y la falta de esa verificación.** En otros puntos de este rubro el estado está mejor que en el anterior; los 3 constructivistas no abrieron la front nuevo.