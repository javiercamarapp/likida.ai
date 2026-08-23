# Verificación adversarial — auditoría 18 · continuación 4

Lo que el orquestador comprobó **abriendo el archivo o corriendo el comando**, por
encima de lo que dijo el auditor. Los que no sobreviven entran aquí con la razón:
es lo que mantiene honestos a los auditores de mañana y lo que impide que la nota
se mueva por ruido.

---

## DESCARTADO EN SU PREMISA — SEG: «el repo es público»

**Lo que reportó el auditor de seguridad** (CRÍTICO): con el repo público,
cualquiera abre un PR desde un fork con una rama llamada `mejora/…`,
`auto-merge-rutina.yml:29-33` lo funde a `master` sin revisión humana porque no
compara el repo de origen del PR, y `vercel.json:3` lee el asunto del squash —que
es el título del PR— así que el atacante elige si despliega a producción.

El propio auditor marcó la dependencia, y hizo bien: *«la severidad depende de un
dato que no pude verificar sin red: si el repo es público»*. Yo sí tengo red.

**El repo NO es público.** Dos comprobaciones independientes:

```
search_repositories  user:javiercamarapp is:public   → 8 repos, y cuadra/likida.ai
                                                        NO está entre ellos
search_repositories  user:javiercamarapp is:private  → 10 repos, incluido
    {"name":"likida.ai","id":1311463027,"private":true,"default_branch":"master"}
```

(`cuadra` y `likida.ai` son **el mismo repo**: se renombró y GitHub redirige. El
push de hoy lo dice literal: `remote: This repository moved. Please use the new
location: https://github.com/javiercamarapp/likida.ai.git`.)

Y el padrón de acceso:

```
list_repository_collaborators  javiercamarapp/cuadra  affiliation=all
→ [{"login":"javiercamarapp","role_name":"admin"}]
```

**Un solo colaborador, que es el dueño.**

### Qué queda en pie y qué se cae

Se cae el vector: en un repo privado **nadie de fuera puede forkearlo ni abrir un
PR**, porque no puede verlo. El escenario «un desconocido nombra su rama `mejora/`
y se auto-funde a producción» no existe hoy.

Se mantiene el mecanismo: `auto-merge-rutina.yml` **sí** funde por nombre de rama
y `master` **sí** está sin protección. Pero con un único actor —que además es
admin y puede fundir a mano— eso deja de ser un control de acceso roto y pasa a
ser **una bomba de relojería para el día que entre la segunda persona**: el día
que se agregue un colaborador con `write`, el vector se abre solo, sin que nadie
toque el workflow.

**Reclasificado: CRÍTICO → MEDIO**, con la condición escrita. Vuelve a ALTO/CRÍTICO
automáticamente el día que `list_repository_collaborators` devuelva más de una
línea, o el día que el repo se haga público. Eso es verificable con un comando y
debería ser lo primero que mire la ronda siguiente.

### Y una corrección hacia atrás, que es lo que más importa

**Las síntesis de la c2 y la c3 afirmaron «repo público» como hecho, y no lo era.**
La c3 lo puso entre las cinco cosas que «necesitan decisión del dueño»:

> «**`master` sin protección de rama** y un auto-merge (`auto-merge-rutina.yml:29-43`,
> `contents: write`) cuyo único control de acceso es cómo se llama una rama, **en un
> repo público**.»

Dos rondas cargando una severidad inflada por un dato que nadie comprobó, y que se
comprueba con una llamada. El auditor de esta ronda además rastreó de dónde salía:
la verificación original se había hecho **contra otro repo**. Ése es exactamente el
modo de falla que esta auditoría existe para cazar, y esta vez la cazó dentro de sí
misma.

---

## CONFIRMADO — BACK: la guardia de orden de Stripe se aplicó a la suscripción y no a la factura

Reportado ALTO. Verificado abriendo los tres archivos:

- `src/lib/saas/suscripcion.ts:645-654` — `aplicarSuscripcion` **sí** tiene la
  guardia: `if (datos.eventoCreadoUnix !== undefined) { const ultimo = await
  ordenAplicado(...); if (ultimo !== null && datos.eventoCreadoUnix < ultimo) {
  logger.warn('stripe.evento_fuera_de_orden', ...); return; } }`.
- `src/lib/saas/suscripcion.ts:795-813` — la firma de `aplicarFactura` **no
  recibe `eventoCreadoUnix`**. No es que lo ignore: no está.
- `src/lib/saas/suscripcion.ts:827-828` — el upsert fija
  `estado: datos.pagada ? 'pagada' : 'fallida'` y
  `pagada_en: datos.pagada ? (...) : null`, **incondicionalmente**.
- `src/app/api/stripe/webhook/route.ts:209` — `eventoCreadoUnix: typeof
  evt.created === 'number' ? evt.created : undefined` se pasa **solo** en el
  `case` de suscripción. Los `case 'invoice.paid'` / `case
  'invoice.payment_failed'` (`:214-266`) llaman a `aplicarFactura` sin nada
  equivalente.

El comentario de `:205-208` hasta explica la razón de la guardia («Stripe NO
promete orden de entrega (RES-11)») a diez líneas de la rama que no la tiene.

**CONFIRMADO.** El escenario del auditor se sostiene entero.

---

## CONFIRMADO — el árbol traía mutaciones de un auditor, y NO se commitearon

El auditor de agéntico reportó, sin que nadie se lo pidiera, que
`git status` mostraba tres cambios que no eran suyos:

- `processor.ts:2758` — `if (transitorio)` → `if (false)`
- `salud.ts:75` — `if (Math.random() < 2) return;` al inicio de `registrarLatido`
- `salud.ts` — `puertaCron` sin su `alertarOperador` ni su `logger.error`

Son **exactamente** las mutaciones que el prompt del auditor de PRUEBAS le manda
hacer para medir si la suite las caza, y que tiene orden de revertir. Confirmado
leyendo `git diff`: las tres tienen la forma de una mutación deliberada, no de una
edición.

**No se commitearon.** Vale anotarlo porque el modo de falla contrario —commitear
la mutación de un auditor como si fuera trabajo de la ronda— dejaría producción con
los latidos de cron apagados y RES-15 muerto, y el commit diría «auditoría».
Que el auditor de agéntico lo cazara y lo dijera en vez de auditar contra un árbol
sucio es la conducta correcta, y queda escrita.
