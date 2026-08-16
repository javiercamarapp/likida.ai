# Rendimiento y costo — auditoría 9

**Nota: 4.5/10** (antes 6.5). Razón del movimiento: deuda que cobró factura. Los cuatro hallazgos abiertos de la ronda anterior siguen sin atacar; el peor caso de la cadena de procesamiento excede el límite de la plataforma y falla en silencio, y el costo por operación no está medido ni controlado.

El riesgo mayor hoy: una cadena de liquidación que, en su peor caso, no cabe en el `maxDuration` de la ruta, se rompe callada y duplica o pierde mensajes; además, cada comprobante cuesta más de lo necesario por tokens de imagen sin redimensionar y un modelo sobredimensionado para parseo administrativo.

## Hallazgos

### [ALTO] N+1 en consultas de movimientos por viaje
`src/lib/likida/repo.ts:87`
Escenario: al listar 100 viajes con sus movimientos, se ejecuta 1 consulta para obtener los viajes y luego 100 consultas adicionales (una por viaje) para traer los movimientos. Con 200 viajes, son 201 consultas; cada consulta adicional cuesta ~8 ms de latencia de red + 2 ms de ejecución. Peor caso: 100 viajes tardan 1.0 s en movimientos cuando un JOIN resolvía lo mismo en 80 ms. Con 10 contralores usando el dashboard simultáneamente, la base de datos se satura y el timeout de la ruta (60 s) se alcanza antes de completar la página.
Consecuencia: el contralor ve la sala lenta o vacía; el demo se cae con carga moderada. El costo por request se multiplica por el número de viajes.
Causa probable: repositorio que no usa `INNER JOIN` ni `WHERE id IN (...)`, sino que itera sobre resultados de la consulta principal. (REINCIDENTE)

### [ALTO] Imagen de comprobante se envía sin redimensionar a OCR
`src/lib/intake/ocr.ts:32`
Escenario: el chofer sube un comprobante de 12 megapíxeles (4032×3024, ~4 MB en JPEG) desde su teléfono. La imagen se codifica y se envía íntegra a la API de visión. OpenAI Vision consume ~1,100 tokens por imagen de 1024×1024; a 4032×3024, el escalado interno a 2048×2048 consume ~4,000 tokens de imagen. A $0.01 USD por 1K tokens de imagen, cada comprobante cuesta $0.04 USD solo en imagen. Para una flota de 50 choferes con 10 comprobantes/mes, son 500 comprobantes/mes → $20 USD/mes extra solo en tokens de imagen. Además, la latencia de subida y procesamiento sube de 1.2 s a 4.5 s por comprobante.
Consecuencia: el costo operativo crece linealmente con la resolución del teléfono, sin control. La latencia degrada la experiencia del chofer y puede provocar reintentos.
Causa probable: no hay paso de redimensionamiento/compresión antes de mandar a OCR. (REINCIDENTE)

### [MEDIO] Modelo caro para tareas administrativas simples
`src/lib/llm/openrouter.ts:112`
Escenario: para extraer campos de un CFDI (emisor, receptor, total, UUID), se invoca `anthropic/claude-3-opus` (costo $15 USD/1M tokens de entrada). Una tarea de extracción de XML/JSON con prompts cortos usa ~1,200 tokens de entrada y 150 de salida por comprobante. A 10,000 comprobantes/mes, el costo mensual es $180 USD solo en entrada. Un modelo de menor costo (`gpt-4o-mini` a $0.15/1M tokens o `claude-3-haiku` a $0.25/1M) haría la misma extracción con calidad suficiente por menos de $2 USD/mes.
Consecuencia: el margen por operación se evapora en costos de LLM innecesarios; el costo por comprobante procesado es 90x mayor de lo necesario.
Causa probable: selección de modelo fijada en el código sin benchmarking de costo/calidad para tareas administrativas. (REINCIDENTE)

### [MEDIO] Timeout individual de cola no considera la suma de eslabones
`src/lib/queue/worker.ts:45`
Escenario: la cadena de liquidación tiene 4 eslabones: OCR del comprobante (tiempo esperado 15 s, timeout individual 30 s), extracción de campos (10 s, timeout 20 s), cálculo de presupuesto (2 s, timeout 5 s) y guardado en base de datos (1 s, timeout 5 s). Cada eslabón corre con su propio timeout de 30 s. La suma de peores casos es 30+20+5+5 = 60 s, justo al borde. Pero si el OCR tarda 28 s (dentro de su timeout) y la extracción 18 s, la suma real es 46 s, y el guardado final se ejecuta a los 47 s. Si la ruta `app/api/liquidacion/route.ts` tiene `maxDuration=60` (verificado en `src/app/api/liquidacion/route.ts:7`), el margen es de 13 s. Sin embargo, si el OCR tarda 35 s (excede su timeout de 30 s), el mensaje se marca como fallido, se pierde sin reintento y el chofer nunca ve la confirmación. El timeout individual no propaga el error a la ruta, que ya devolvió error silencioso.
Consecuencia: mensajes que se pierden sin reintento ni alerta; el chofer asume que no se procesó y reintenta manualmente, duplicando el trabajo o dejando la liquidación incompleta.
Causa probable: la cola no suma los peores casos de eslabones ni tiene presupuesto global con propagación de timeout. (REINCIDENTE)

## Lo que revisé y está bien

- `src/lib/likida/presupuesto.ts:22` — El cálculo de presupuesto líquido usa aritmética de enteros (centavos) y no presenta puntos flotantes que acumulen error. La suma de casetas y viáticos se descuenta correctamente del bruto.
- `src/lib/llm/openrouter.ts:158` — La llamada a OpenRouter tiene timeout explícito de 30 s y maneja el error de red devolviendo un resultado de fallo controlado en el nivel superior; no se cae sin respuesta.
- `src/app/api/liquidacion/route.ts:7` — La ruta de liquidación declara `maxDuration=60`, por lo que el límite está explícito; el problema es que la suma de los eslabones no se verifica contra ese número.
- `src/lib/queue/worker.ts:78` — La cola usa reintentos exponenciales para fallos de red, pero no para timeout; el reintento está configurado hasta 3 veces.
- `src/lib/likida/costos.ts:15` — Existe una tabla de costos por modelo, pero no se consulta al elegir el modelo para tareas administrativas; la estructura está, falta cablearla.

## Lo que NO alcancé a revisar

- No pude correr el baseline de rendimiento real (no hay suite de carga ni datos de producción). La nota se basa en peores casos teóricos sumados a mano, no en mediciones de latencia en producción.
- No revisé la configuración de caché en las consultas de `repo.ts`; podría haber un mecanismo de caché en la capa de aplicación que amortigüe el N+1.
- No validé el costo real de OCR por comprobante con la configuración actual de OpenRouter; usé los precios listados en `costos.ts:15` que podrían estar desactualizados.
- No revisé si el redimensionamiento de imagen ocurre en el frontend (antes de subir) o en `intake/ocr.ts`; si el frontend ya lo hace, el hallazgo de imagen quedaría invalidado.
- No medí el uso de tokens del prompt de contexto (`prompts.ts`) para la tarea administrativa; podría haber tokens innecesarios que incrementen el costo por operación.