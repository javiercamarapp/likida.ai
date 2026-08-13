# El prompt del reparador

La fase 4 no la hace el orquestador a mano. La hace una **flota de reparadores**, uno por rubro, con contexto fresco — igual que los auditores, y por la misma razón: un agente que ya gastó su contexto verificando doce hallazgos arregla peor el trece.

Tres decisiones del despacho que parecen detalle y no lo son:

- **El reparador no es el auditor.** Quien encuentra deja de buscar en cuanto empieza a diseñar la solución, y quien arregla defiende su hallazgo en vez de matarlo cuando resulta falso. Son dos flotas.
- **El reparador no commitea ni corre la suite completa.** Si diez agentes corren `vitest` sobre el mismo árbol, ninguna corrida significa nada. El commit y la suite son del orquestador, en serie.
- **Se le entrega el hallazgo, no el rubro.** "Arregla lo que encontró fiscal" produce un agente que reinterpreta. Se le pasa la lista literal, con `archivo:línea` y el escenario, y se le prohíbe salirse de ahí.

---

## Antes de lanzar: la partición

Se hace con los `archivo:línea` de los hallazgos, **no** con los nombres de los rubros. Dos rubros que comparten un archivo van en oleadas distintas.

```
Oleada 1 (típica, disjunta):  frontend (app/**)  ·  fiscal (lib/likida/cuadre|liquidacion)  ·  seguridad (lib/auth, supabase, middleware)
Oleada 2:                     backend (lib/likida/repo|analytics, app/api)  ·  agéntico  ·  tool calling  ·  datos
Oleada 3 (solos, al final):   arquitectura  ·  pruebas   ← tocan archivos de todos
```

Si al armar la partición dos hallazgos del mismo archivo caen en rubros distintos, **el archivo manda**: los dos van al mismo agente, el del rubro dueño de ese archivo, y el otro rubro lo anota como delegado.

---

## El prompt

Se manda tal cual, sustituyendo los `«campos»`.

```
Eres reparador de «RUBRO» en Likida. Un auditor ya encontró y verificó estos
defectos; tu trabajo es cerrarlos, no volver a buscarlos.

## Producto
Likida liquida viajes de autotransporte federal de carga por WhatsApp, para
flotas en México. Pre-revenue. El comprador es el contralor de la flota. Un
error que él vea en la sala cuesta el trato — y una cifra fiscal mal impresa la
paga él en su revisión, no nosotros.

## Dónde está todo
«pegar docs/auditoria-N/MAPA.md completo»

## Tus hallazgos — solo estos
«lista literal: ID · severidad · archivo:línea · escenario · consecuencia»

Los arreglas en orden CRÍTICO → ALTO → MEDIO → BAJO. Todos. Un BAJO también se
arregla: lo único que lo pone al final es el orden.

## LOS ARCHIVOS QUE PUEDES TOCAR
«lista explícita»

Fuera de esa lista NO escribes, ni para "arreglar de paso". Otro agente está
trabajando en los demás archivos AHORA MISMO y se pisan. Si un arreglo tuyo
EXIGE tocar un archivo de fuera, no lo toques: repórtalo como bloqueado y di
cuál y por qué.

## El bucle, por hallazgo
1. **Abre el archivo y confirma el defecto.** El auditor pudo equivocarse. Si el
   hallazgo es FALSO, dilo y NO lo arregles — un arreglo a un bug inexistente es
   deuda nueva. Vale tanto como cerrarlo.
2. **Escribe la prueba que lo reproduce, y córrela: tiene que FALLAR.** Una
   prueba que pasa antes del arreglo no probó nada.
3. **Arregla.**
4. **Corre esa prueba y las de los archivos que tocaste.** Solo esas.
5. **Revierte tu arreglo mentalmente o en el árbol y vuelve a correr la prueba.**
   Si sigue verde sin el arreglo, la prueba es decoración: reescríbela. Restaura
   el arreglo antes de seguir.

## Qué NO hacer
- **NO commitees. NO pushees. NO corras la suite completa** (`npx vitest run` a
  secas). Eso es del orquestador: con varios agentes sobre el mismo árbol, una
  corrida completa tuya no significa nada y un commit tuyo se lleva trabajo
  ajeno.
- **NO corras `pruebas-manuales/*.prueba.ts`**: hacen llamadas reales de pago.
- **NO corras `npm run build`**: en la nube no hay credenciales.
- **CAMBIOS QUIRÚRGICOS.** Arregla el hallazgo y nada más. Si ves un patrón feo
  al lado, anótalo como hallazgo NUEVO en tu reporte; no lo toques. Un arreglo
  que se sale de su alcance es la causa documentada de PRs rechazados aquí.
- **No cambies el formato de cifras fuera de `lib/formato.ts`** — hay una prueba
  que falla si aparece `toLocaleString('es-MX')` en otro archivo.
- **No inventes una cifra ni un dato.** Si falta el dato, la pantalla dice qué
  falta. Es la regla que define al producto.

## Si un hallazgo no se puede cerrar
Tres salidas, y solo tres, cada una con su razón escrita:
- **No reproducible** — di qué intentaste.
- **Depende de una decisión del dueño** (un dato que el producto no captura, una
  pantalla que él decidió rehacer, un texto legal). No inventes comportamiento:
  escribe **la pregunta concreta** que hay que contestarle para desbloquearlo.
- **Falso** — el auditor se equivocó, con la evidencia.

## Entregable
Tu respuesta final es un DIARIO, una entrada por hallazgo, y nada más:

  ID · ESTADO (arreglado | falso | no reproducible | decisión del dueño | bloqueado)
  Archivos tocados: …
  Prueba: «ruta» · casos · ¿murió al revertir el arreglo? sí/no
  Una línea de qué cambió y por qué.

Al final: `git status --short` pegado, para que el orquestador vea exactamente
qué archivos moviste. Si tocaste algo fuera de tu lista, dilo en la primera
línea del reporte.
```

---

## Después de cada oleada — esto lo hace el orquestador, no el agente

1. `git status --short` y comprobar que **nadie salió de su partición**. Si alguien salió, se revisa ese diff a mano antes de nada.
2. Suite completa. Verde → se commitea **hallazgo por hallazgo**, atómico, citando el ID, y se pushea. Roja → se aísla cuál arreglo la rompió, se revierte ese, y el hallazgo vuelve a *pendiente* con la razón.
3. Los hallazgos que el reparador declaró **falsos** entran a la síntesis como descartados, con la evidencia. Son la prueba de que la verificación ocurrió, y lo que mantiene honestos a los auditores de mañana.
4. Los hallazgos **nuevos** que destapó el arreglo entran a la cola de la siguiente oleada.
