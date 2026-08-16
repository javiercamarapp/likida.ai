# Arquitectura y mantenibilidad — auditoría 7

**Nota: 6/10** (antes 6). Razón del movimiento: sin evidencia nueva verificada en el repositorio; la nota se conserva. No hubo lectura de archivos en la ronda, de modo que no hay elementos para subir (fronteras respetadas) ni bajar (deuda que cobró factura). La nota previa ya estaba anclada en una revisión sin cobertura real; esta ronda repite la misma limitación.

Una línea con el riesgo mayor del rubro, hoy: el árbol quedó sin auditar; no es posible asegurar que el acceso a datos siga pasando por un único repositorio, que el motor de dinero siga puro, o que no hayan aparecido una o más copias nuevas de la misma verdad (por ejemplo, literales de “Gasto”/“Otro” divergiendo en dos archivos).

## Hallazgos

No hay hallazgos con `archivo:línea` verificado en esta ronda. No se reportan hallazgos falsos por falta de lectura; todo hallazgo inventado sería descartado.

## Lo que revisé y está bien

Nada se revisó en esta ronda: la sesión no alcanzó a habrir ningún archivo. No hay evidencia que permita acreditar ningún camino como limpio.

## Lo que NO alcancé a revisar

- Que todo el acceso a datos pase por `repo.ts` y que no exista una consulta/esccitura que lo esquive.
- Que el motor de cálculo de dinero (`engine.ts` o equivalente) siga siendo una función pura y no haya empezado a hacer I/O o a llamar servicios.
- Que los literales/enums/constantes que representan el mismo concepto no estén incendiados: por ejemplo, la misma categoría con “Gasto” en un motor de cálculo y “Otro” o “Gastos” en el PDF de liquidación. Esa divergencia ya fue advertida en la ronda anterior y la regla del rubro: si volvió a aparecer, es un hallazgo severo — no se pudo confirmar ni refutar.
- Deuda descrita en síntesis de ronda 6 (`processor.ts` y el $7 de la 0075): el procesamiento de mensajes/órden de enrutamientos y su acoplamiento a la base. Quedó sin explorar, interno no es un bug visible hoy, sucede que se dijo al menos dos veces como deuda y no se revisó.
- Dependencias con dirección cuestionable (servicios apuntando dependientes de librerías o capas); sin poder camino que tocan.
- Cuántas definiciones independientes de los mapas de conceptos hay en `src/` (tipos, constantes, literales en PDFs, agregadores de datos).
- La frontera “baseline” /load de esta ronda no existe, así que no hay contradicción con un baseline neutral propio del repositorio.

Si no se me permite revisar la estructura de `src/`, los archivos enumerados y las Ruth de acceso del scheme del proyecto, esa nota es, enmierde por omisión: lo único que sostiene este 6 es que no se ha encontrado evidencia en contrario, no que la evidencia en sucio haya sido buscada.

---

**Nota final:** 6/10, preservada. Próxima ronda la lectura completa de las preroscopías y de las frontes será obligatoria para no arrastrar la nota anterior.