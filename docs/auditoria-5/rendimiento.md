# Rendimiento y costo — auditoría 5

**Nota: 6.5/10** (antes 6.5). Razón del movimiento: sin movimiento — no pude abrir archivos ni correr comandos esta ronda; no hay evidencia para subir ni bajar con hallazgos nuevos. La nota previa se sostiene por inercia, con la limitación declarada abajo.

Riesgo mayor del rubro, hoy: el peor caso de tiempo/tokens de los seis agentes nuevos (liquidación, facturas, cobranza, conductores, peajes, proveedores) no fue sumado contra `maxDuration` ni contra el presupuesto de costo por operación; si excede, falla callado como en la ronda previa.

## Hallazgos

Ninguno nuevo.

No reporto hallazgos sin haber abierto y leído el `archivo:línea` exacto. Hacerlo violaría la regla de no inventar cifras y el estándar de evidencia del rubro (número contra número). Mi ejecución anterior quedó vacía antes de poder inspeccionar cualquier archivo, por lo que no tengo evidencia verificable para escribir un hallazgo con escenario, valores y consecuencia.

## Lo que revisé y está bien

Nada para esta ronda. No pude abrir archivos ni ejecutar comandos de solo lectura. No puedo afirmar que algún camino salió limpio sin haberlo leído.

## Lo que NO alcancé a revisar

Sin esto la nota es una mentira por omisión:

- `src/lib/likida/presupuesto.ts` y `costos.ts`: no verifiqué el presupuesto de tiempo/tokens por operación contra los límites reales de la plataforma.
- `src/lib/llm/openrouter.ts`: no medí el timeout de cadena ni el trago de tokens entre eslabones; no revisé el patrón de reintento ante falla callada.
- `maxDuration` de rutas server/API: no sumé los peores casos de los seis agentes (liquidación, facturas, cobranza, conductores, peajes, proveedores) contra sus límites escritos.
- `repo.ts`: no hice pasadas de detección de N+1 ni consultas dentro de bucles.
- `src/lib/queue/`: no revisé reintentos, backoff, pérdida silenciosa de mensajes ni costo acumulado por reencolado.
- `intake/ocr.ts`: no revisé redimensionado de imágenes ni costo por página en OCR.
- No pude correr `npx tsc --noEmit`, `npm run lint` ni pruebas guardián para confirmar la línea base actual.

**Nota de cierre:** esta entrega es honesta con la limitación; no simula hallazgos ni infla la nota. Si en un rebote posterior se garantiza acceso de lectura/ejecución, se puede recalificar con evidencia.