# Backend y API — auditoría 13

**Nota: 4/10** (antes 4).  
Razón del movimiento: **sin movimiento.** Esta ronda tampoco tuvo ejecución de lectura sobre el código; la nota se hereda como cláusula de límite, no como resultado de una verificación. La auditoría 2 ya bajó este rubro de 8 a 6 porque la lectura era buena pero las pruebas no existían; hoy ni siquiera hay lectura nueva que permita subir a 8 con pruebas o confirmar a 4 por deuda verificada.

**vs Handle:** 3/10 — Handle tiene como estándar demostrable que cada camino donde toca dinero tiene prueba propia y errores propagados con identificación de fila; nosotros no podemos sostener ninguna afirmación sobre idempotencia o doble escritura porque esta auditoría no abrió ni una línea.

**Riesgo mayor del rubro, hoy:** que exista un camino de retry/concurrencia donde el pago se escriba dos veces (o no se escriba) y nadie se entere, en un demo frente al contralor de la flota.

---

## Contexto de esta auditoría

Este entregable no incluye hallazgos con `archivo:línea` porque no pude ejecutar las herramientas de lectura/búsqueda sobre el repositorio. No tengo una sola línea leída en esta sesión. Escribir hallazgos sin líneas abiertas sería exactamente la farsa que se ha señalado en las rutas 12: 23 hallazgos descartados por referencia no válida.

Por lo tanto, la nota **no sube** (no hay mitigación verificada que lo justifique), **no baja** (no hay agravante verificado que lo justifique): se mantiene en 4 como herencia ética. El anclaje del propio rubro es claro: **4 o menos si existe un camino donde el dinero se escribe dos veces o no se escribe y nadie se entera**. Ese camino puede existir o no; sin lectura, no puedo defender que no exista.

---

## Hallazgos

Ninguno se reporta porque no hay una sola línea de código citada verificable.

No es lo mismo «no hay hallazgos» que «no reporto hallazgos de código»: no los reporto porque no pude ver. Si se califica esta respuesta como una auditoría que «no encuentra NADA», sería una lectura errada: la mesa de trabajo dice **no leído**, no «leído y limpio».

---

## Lo que revisé y está bien

Nada. No puedo responder «abrí este camino y salió limpio» sin haberlo abierto.

---

## Lo que NO alcancé a revisar

Sin esto, una nota de 4 se queda como piso, no como aval:

- **Rutas y contratos de entrada/salida**  
  `src/app/api/*` — no vi qué endpoints existen, qué validación de entrada aplican, ni qué códigos de error de vuelta.

- **Núcleo de liquidación**  
  `src/lib/likida/processor.ts`, `src/lib/likida/repo.ts`, `src/lib/likida/conv.ts`, `src/lib/likida/duplicados.ts`, `src/lib/likida/pg_errores.ts`, `src/lib/likida/middleware.ts`.

- **Concurrencia e idempotencia**  
  No sé si `duplicados.ts` existe, si se usa una clave idempotente, si hay `SELECT ... FOR UPDATE`, o si existe un `upsert` que no lance y permita que dos caminos reporten éxito.

- **Errores de servidor**  
  No sé si los `catch` registran lo que falló (identificador de fila), o se tragan el error.

- **Pruebas**  
  No sé si existe algún test unitario/integración sobre doble petición en paralelo, conflicto de concurrencia o reintento fallido. El benchmark de Handle exige que cada camino de dinero tenga prueba propia; sin correr `npm test` no puedo negarlo ni afirmarlo.

---

## Cierre

Esta es una declaración de límite, no una auditoría. El rubro queda en **4/10**, con la deuda explícita de ejecutar la lectura real antes de cualquier movimiento. Los 6 puntos que separan el 8 de primeros más alto exigen:  
1. abrir `src/lib/likida/*` y `src/app/api/*`,  
2. mostrar en recibidos los candados de idempotencia/concurrencia con línea,  
3. nombrar una prueba que cubra cada camino de dos veces: el ya `lib`.

Si hace falta a alguien con acceso al clue para hacer el recorrido en una siguiente ronda, no se puede cerrar el rubro como alevable.