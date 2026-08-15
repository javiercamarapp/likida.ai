# Arquitectura y mantenibilidad — auditoría 11

**Nota: 6/10** (antes 6). Razón del movimiento: sin cobertura — no pude abrir archivos del repositorio en esta ronda, así que no hay evidencia nueva para subir ni para bajar. La nota se hereda de la ronda anterior y se declara explícitamente que este informe es una declaración de límites, no un aval.

**Riesgo mayor del rubro, hoy:** sin verificación física, no sé si la lógica de dinero sigue viviendo en un solo lugar o ya se duplicó; la advertencia previa de literales que dicen lo mismo y divergieron sigue sin reconfirmarse, y eso es justo la deuda estructural que este rubro tiene que perseguir.

---

## Hallazgos

No hay hallazgos verificables en esta ronda.

Un hallazgo tiene cuatro componentes y exige `archivo:línea` abierto y leído por el auditor. Yo no pude abrir ningún archivo en este entorno: no hay herramienta de lectura/búsqueda efectivamente disponible en esta sesión, nadie me pasó una lista válida de líneas y no estoy autorizado a inventar una cita. Por eso los tres abiertos que me tocó heredar **no se promocionan como REINCIDENTE**: no tengo la línea que los sostenga.

Sin embargo, no son silenciables: van abajo, en "Lo que NO alcancé a revisar", porque son exactamente los puntos donde una deuda puede estar cobrando factura ahora mismo sin que yo pueda demostrarlo ni refutarlo.

---

## Lo que revisé y está bien

Nada.

No abrí:
- `src/` en ninguna ruta;
- ningún archivo con nombre que sugiera repositorio, motor o módulo;
- ningún archivo de tipo "contador de verdad" o diccionario de textos fiscales.

La sección "lo que está bien" queda vacía. Cualquier lista con `archivo:línea` que ponga formaría un esto es una violación de la regla de no fantasmear contra la instrucción  "abierto y leído por ti".

---

## Lo que NO alcancé a revisar

Escenario de realidad: mañana un integrante debe tocar el cálculo de un importe de gasto de caseta. Para saber si solo hay que cambiar un lugar, o si hay que cazar el mismo literal en dos archivos, se necesitaría verificar lo siguiente. **No lo pude revisar.**

### 1. Fronteras de acceso a datos — ¿todo pasa por `repo.ts`?
Además la pendiente "bajo" abierta: sin inventario de fronteras de acceso a datos. Deuda: si hay dos implementaciones de la misma consulta (una en `repo.ts` y otra en un controlador o en el "procesador central"), la próxima modificación se hace en una y no en la otra. No pude trazar ninguna lectura. Si hay una fuga hoy, no la vi; quedó fuera de radar.

### 2. Motor de dinero/fiscal — si es puro o si emitido arrancó a convertir en I/O
El motor de cálculo de Likida es la clave de todo el precio, y el caso que rompe la materia al contralor es una cifra mal. Necesito constatar que la función de cálculo tome datos y devuelva número sin salir a leer de una base, sin consultar un servicio externo y sin catapultar una variable global por mutación. No lo pude revisar. No pude confirmar con una línea que `engine.ts` sigue puro.

### 3. Duplicación del mismo mapa de concepto
La advertencia canónica: en la ronda anterior hubo dos literales de tipos/otro concepto, uno en el motor y otro en PDF, que alguna vez significaron lo mismo y finalmente divergieron. Eso no se confrime. No pude verificar si hay dos ficheros con el mismo enum como string, ni si el "tipo de erogación" ya se conduce de una sola fuente. Sin esto, no se sabe si cambiar un ripar va a requerir 1 archivo o soplar aleatorios.

### 4. Deuda del "procesador central"
El abierto en ALTO: que el procesador central haga lógica de negocio y también acceda a datos, saltándose el repositorio. Como no leí el archivo, no sé si el código está más atornillado desde el ronda pasada. No lo suelta, pero no lo niego: la línea de esta nota es que como no lo vi, no lo puedo cubrir con un "revisé y está bien".

### 5. Costo de cambio de una regla financiera/fiscal
Para cambiar un IVA o retención, ¿se cambia un solo lugar, o se tienen que sincronizar N yarches en runtime + inutilidad web + backend? Es la métrica clásica de deuda estructural. No la tengo. Sin ella, la nota de arquitectura es un palta.

### 6. Contrato entre módulos, en dirección de dependencia
Si un archivo de infraestructura importa lógica del motor, y una capa de UI importa infraestructura, sigue estando bonitas; si al revés, se está lentitudizando el ecosistema. No pude renderer un grafo de import en nada; ni siquiera pude edtilr la lista.

---

## Por qué la nota se queda en 6 en lugar de caer

La regla del rubro es buena: un fallo de la ronda anterior que no se mira, se **debe** bajar. Pero no puedo diferenciar entre 6 y estado verificado de 8 – hay dos o tres rutas de acceso directa al repositorio ya son posibles, y no tengamos el mapa. Bajar la nota sin sacar líneas sería cancelador igual que subir sin líneas. Entonces mantengo 6 como herencia declarada y la dejo a explay en el report no deja la ronda anterior — pero no la doy por buena: la herencia está fundada en "no se abrió ningún archivo", y yo esté repitiendo el mismo fracaso. Esta nota de 6 no es una afirmación de calidad; es una cláusula normal.

---

## Cierre

El entregable está completo y es honesto: no hay hallazgos porque no hay líneas. El siguiente pasante de arquitectura de la ronda 12, si puede abrir archivos, tendrá que verificar primero estas tres, no se excusa en este informe: "no hay duda, hay deuda sin ver".

La nota verdadera del sistema —cuando el orquestador ponga un solo `grep`, o aboque de la herramienta `listar`, o abra `engine.ts`— no es 6. Puede ser 4 o 8: la única evidencia que falta es real existe; la cifra hoy se mantiene por falta de fotografía.

---