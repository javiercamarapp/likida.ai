# Modo desatendido

Corriendo sola de madrugada, la rutina no tiene a nadie que le diga "ya estuvo". Sin condición de terminación dura se queda puliendo hallazgos menores hasta agotar el presupuesto, y sin regla de reversión un arreglo malo se queda commiteado hasta que alguien lo note.

## Condición de terminación

La ronda **N** está terminada cuando **todas** son ciertas. Se verifica con comandos, no de memoria:

1. `docs/auditoria-N/00-SINTESIS.md` existe y tiene las 12 notas con su razón de movimiento.
2. Existen los 12 archivos de rubro. Un rubro sin archivo es un rubro sin auditar, y su nota no se mueve.
3. `docs/auditoria-N/tablero.html` existe **y** `tablero.png` existe — la captura es la prueba de que se renderizó.
4. **Cada hallazgo — CRÍTICO, ALTO, MEDIO y BAJO — está en uno de cuatro estados**, sin quinta opción: commiteado con prueba que lo reproduce · `no reproducible` con lo que se intentó · `decisión del dueño` con **la pregunta concreta** que lo desbloquea · `descartado` por falso con la razón. Un hallazgo que solo dice "propuesto" **no cierra la ronda**.
5. `npm test` y `npx tsc --noEmit` pasan sobre el árbol final. Se corren y se pega la salida.
6. Los commits están pusheados **todos** — `git rev-parse HEAD` y `git rev-parse origin/<rama>` dan el mismo sha. Un arreglo que se quedó local es un arreglo que no existe.
7. El PR está actualizado con la cuenta real: cuántos hallazgos entraron, cuántos se arreglaron, y la lista nominal de los que no, con su estado de (4).

Si (5) falla, la ronda **no** está terminada: se revierte el último arreglo y se vuelve a evaluar. Dejar el árbol rojo y reportar éxito es el peor resultado posible de una corrida nocturna, porque la mañana siguiente empieza con el repo roto y sin saber por qué.

## Presupuesto

**No hay tope de vueltas.** Se arregla **todo** lo reproducible —crítico, alto, medio y bajo, por más que sean muchos— y se sigue hasta que no quede uno. Decisión del dueño, 12-ago-2026, explícita: *"por más que sean muchos se corrija todo"*. Antes había un tope de 3 vueltas; se retiró.

Lo que **sí** sigue acotado, porque acota el daño y no el alcance:

- **Tres intentos por hallazgo, no tres por ronda.** Un hallazgo que resistió tres arreglos distintos —cada uno rechazado por la suite— se detiene y se reporta con lo que se aprendió de cada intento. Un cuarto intento sobre el mismo muro es cómo se rompe algo más.
- **Un arreglo, un commit, y se pushea en cuanto la suite queda verde.** Nunca dos hallazgos en el mismo commit: revertir uno sin arrastrar al otro es todo el punto. Y no se acumulan diez arreglos sin pushear: si la corrida muere, lo que no se pusheó no existe.
- **Cambios quirúrgicos.** Se arregla el hallazgo y nada más. Un patrón feo en código adyacente se anota como hallazgo nuevo, no se toca. Sin el tope de vueltas, esta regla es la que impide que la ronda se convierta en una refactorización que nadie pidió.
- **Máximo un rubro reauditado por ronda.** Si un arreglo tocó código de un rubro ya calificado, se relanza **ese** auditor, no los doce.

**Si el contexto se acaba antes que los hallazgos**, no se cierra la ronda declarando victoria: se pushea lo que haya, se escribe en `progreso.md` exactamente en qué hallazgo se quedó, y `RESULTADO.md` dice `PARCIAL: quedan <n> sin arreglar, el siguiente es <ID>`. La corrida siguiente lo retoma desde ahí en vez de reauditar.

## Lo que NO se arregla, y cómo se escala

Tres salidas, y solo tres. Cada una exige razón escrita con `archivo:línea`:

1. **No se pudo reproducir** — se dice qué se intentó.
2. **Depende de una decisión del dueño**, no de código: un dato que el producto no captura, una pantalla que él decidió rehacer, un texto que necesita abogado. **No se inventa comportamiento.** Se escala **por nombre** —en la notificación y arriba del PR— con *la pregunta concreta* que hay que contestar para desbloquearlo. Un pendiente sin pregunta es un pendiente que nadie va a resolver.
3. **La suite rechazó los tres intentos** — se anota cada uno.

Un hallazgo vivo al cierre que no cae en una de las tres es **trabajo pendiente de la corrida**, no del código, y la síntesis lo dice con esas palabras.

## Retener o revertir

Después de cada arreglo, la suite completa. Ese es el criterio, y no admite matices:

- Verde y la prueba nueva falla sin el arreglo → **se retiene** y se commitea.
- Rojo, o la prueba nueva pasa igual sin el arreglo → **se revierte** (`git revert` o `git reset --hard` sobre ese commit), el hallazgo vuelve a `pendiente`, y se anota qué se intentó. Una prueba que pasa con y sin el arreglo no probó nada; retenerla es peor que no tenerla, porque da falsa seguridad.

No se acumulan arreglos sin verificar entre ellos. Tres cambios y una sola corrida al final es cómo se pierde de vista cuál fue el que rompió.

## Si truena a media ronda

El estado vive en `docs/auditoria-N/`, no en la conversación — por eso cada auditor escribe su archivo en cuanto termina en vez de reportar al final. Al reanudar:

1. Ver qué archivos de rubro ya existen. Esos auditores **no se relanzan**.
2. Leer `progreso.md` (una línea por acción con su sha) para saber qué arreglos ya entraron.
3. Continuar desde ahí.

`progreso.md` se escribe **mientras** avanza, no al cerrar. Un diario que se escribe al final no existe cuando se necesita.

## Árbol sucio

Si `git status` no está limpio al arrancar: la auditoría corre completa, el autofix queda apagado, y la síntesis lo dice en la primera línea. No se hace stash del trabajo de alguien más ni se commitea encima — un cambio a medias tuyo confundido con un arreglo de la ronda es un problema que aparece días después y no se puede desenredar.

## En la nube (routine de Claude)

El agente de la routine clona el repo y no tiene nada más: ni tu `~/.claude/`, ni el `.env`, ni la base. Tres diferencias con la corrida local, y ninguna es opcional:

- **La compuerta es `npm test` + `npx tsc --noEmit` + `npm run lint`, sin `npm run build`.** El build pide Supabase, OpenRouter, Facturapi y Upstash; allá no existen y su fallo no dice nada del código. Los tests sí corren: son offline y reproducibles por diseño.
- **Los arreglos van a rama `claude/auditoria-N` y salen como PR**, nunca a `master`. Dos razones, y la segunda es dura: un arreglo que nadie miró entrando solo a la rama de producción, de madrugada, es exactamente el riesgo que la auditoría existe para bajar; y además **la routine solo puede pushear a ramas con prefijo `claude/`** — cualquier otro nombre rebota el push al final, cuando ya se gastó la ronda entera. El cuerpo del PR lleva la tabla de 12 notas, los críticos con su escenario y lo que quedó pendiente.
- **Pushear no es desplegar, y la síntesis no debe confundirlos.** Con el PR pusheado, los arreglos viven en la rama; **no están en `master` ni en producción hasta que alguien mergee el PR**, y una migración nueva tampoco está aplicada a Supabase por estar commiteada. Cuando un arreglo solo surte efecto tras correr una migración o mergear, se dice **explícitamente en la notificación**: "arreglado en el repo, pendiente de aplicar". Reportar "arreglado" a secas sobre algo que sigue roto en producción es la peor mentira que puede contar esta rutina.
- **La skill viaja en el repo**, en `.claude/skills/auditoria-diaria/`. Si la editas en `~/.claude/skills/`, cópiala también acá o la nube seguirá corriendo la versión vieja sin avisar.

Todo lo demás —condición de terminación, tope de 3 vueltas, retener o revertir, `progreso.md`— aplica igual.

## Programarla en local

```
/loop 0 6 * * * /auditoria-diaria
```

Antes de dejarla suelta la primera vez, córrela una vez contigo presente: lo que se descubre en esa corrida es si algún auditor necesita más contexto, y eso es barato de arreglar de día y caro de noche.
