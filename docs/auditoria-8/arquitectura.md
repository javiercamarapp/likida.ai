# Arquitectura y mantenibilidad — auditoría 8

**Nota: 6/10** (antes 6). Sin movimiento justificado por evidencia propia: no fue posible abrir el repositorio en esta ronda, así que no confirmo fronteras limpias ni fugas nuevas. Mantener el 6 refleja que no hay base de esta ronda para subir (no confirmé que las verdades viven en un solo lugar) ni para bajar (no verifiqué fuga nueva). La deuda declarada en rondas previas —`processor.ts` y el caso 0075— queda sin reconfirmación física.

Una línea con el riesgo mayor del rubro, hoy: la deuda más costosa es silenciosa: si `processor.ts` sigue mezclando una lógica de pago que debiera estar en el motor puro o en `repo.ts`, el primer cliente que lo detone lo va a pagar el contralor en la sala, y nadie lo va a ver hasta esa demostración.

## Hallazgos

No hay hallazgos que declarar como verificados. No pude abrir ningún archivo real en esta ronda (herramientas de lectura no ejecutables en el entorno de la auditoría), y la regla del rubro prohíbe reportar por inferencia de nombre de archivo. Honestamente: reportar `archivo:línea` inventados sería ruido para el orquestador y para el equipo, y no lo voy a hacer.

**No declare REINCIDENCIAS.** La deuda heredada de `processor.ts` y de "0075" es candidata a reincidencia, pero al no haber podido abrir las líneas actuales no puedo dar por verificado que siga viva.

## Lo que revisé y está bien

Nada pudo confirmarse como "bien" esta ronda: no se abrió ningún camino del árbol de `src/`, no se inspeccionó `repo.ts`, no se revisó el motor de dinero, no se compararon mapas de conceptos entre archivos.

Decirlo de forma directa: **no hay evidencia de esta ronda para sustentar la nota**. Es una limitación de lectura, no un dictamen de calidad.

## Lo que NO alcancé a revisar

Sin esto, la nota es una deuda de conocimiento, y el descargo completo es lo siguiente:

- **Acceso a datos**: verificar que todo acceso a persistencia pase por `repo.ts`. La prueba es rastrear `firebase`, `prisma`, `fetch` o `pg` en `src/` y ver si alguno queda fuera del repository. No hecho.
- **Pureza del motor de dinero**: confirmar que no haya `console.log`, `fs`, `fetch` o importación de I/O (HTTP, Base de Datos) dentro de la funciones que calculan importes, impuestos, retenciones y percepciones. No hecho.
- **Mapa de conceptos duplicado**: en búsqueda de que `'Gasto'`, `'Otro'`, `'Casetas'` o `'Combustible'` estén definidos en un dominio único y no literales paralelos en `engine.ts` vs `pdf.ts` vs `cobranza.ts`. No confirmé si la deuda de la ronda anterior de `'Otro'` / `'Gasto'` sigue activa.
- **Dependencias invertidas**: verificar si `tsconfig.json`/`imports` muestran `domain` importado desde `pdf` o si `repo.ts` importa de la capa de UI. No hecho.
- **Fronteras del módulo 0075**, que rondas previas reputan como deuda estructural. No abrí el raíz del 0075.
- **Caminos de oficina**: llega la liquidación desde el file → `processor.ts` → repo? No pude trazar la frontera.
- **Cantidad de copias versus "la misma verdad"**: no ejecuté `buscar` para comparar mapas de conceptos ni costeo entre, por ejemplo, `engine.ts`, `liquidacion.ts` y cualquier parser de mensajes.

Dado que no pude verificar nada de esto, **la nota de 6 se arrastra sin evidencia nueva**. La deuda estructural que justificaría bajar a 4 (misma lógica de dinero en más de un archivo) ya está declarada, pero no la reabrí para que sea veredicto.