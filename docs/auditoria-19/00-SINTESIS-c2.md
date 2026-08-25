# Síntesis — auditoría 19, continuación 2 (25-ago-2026, en la nube, desatendida)

**Global 4.5/10 — baja 0.2 contra el 4.7 de ayer. Un rubro sube, tres bajan, ocho se
quedan.**

**RONDA DE CONTINUACIÓN.** `list_pull_requests(state=open)` devolvió el **PR #52**
(`claude/auditoria-19`, abierto desde el 24-ago 11:11Z), así que se continuó sobre esa
rama en vez de abrir una nueva: `git merge origin/master` limpio, los doce rubros
relanzados con contexto fresco sobre el delta, y `push --force` a la misma rama al
cerrar. Un PR vivo vale más que catorce ignorados.

**185 hallazgos con ficha: 23 CRÍTICO · 71 ALTO · 63 MEDIO · 28 BAJO.**
**2 arreglados** con prueba que los reproduce y commit atómico, los dos CRÍTICOS.
Árbol limpio al arrancar → autofix habilitado. Tope de 3 vueltas: se usaron 2, ninguna
revertida.

---

## Por qué baja, y qué significa

El delta de esta continuación (`8b43121` → `69aa71b`, **115 archivos, +4,974 / −1,026**)
es el opuesto exacto del de ayer. Ayer entró producto sin red; hoy entró **red**: un
presupuesto duro de dinero por corrida, idempotencia de mutaciones por efecto, leases con
fencing sobre la bandeja de WhatsApp, cancelación de agente, un panel de QA, y una
compuerta legal.

Y el patrón de la ronda es que **la red nueva llegó con sus propios agujeros, y los
agujeros están donde la red toca al usuario**:

- El **presupuesto** nació midiendo el input en caracteres donde el precio es por token.
  En el camino de visión esos caracteres son la foto: cualquier ticket de más de ~1.44 MB
  se rechazaba **antes de llamar al modelo**, y el chofer leía «fallo técnico».
- La **idempotencia** nació sin alcance de corrida ni vencimiento: un viaje reabierto no
  se vuelve a liquidar nunca, y el executor lo reporta como éxito con el PDF anterior.
- El **sello del fencing** nació dentro del mismo `try` que decide el éxito de la tool, así
  que un fallo de contabilidad convertía un cierre ya committeado en un fallo reportado.
- La **compuerta legal** nació poniéndose en verde sin que el documento gane un solo dato
  de los que la ley obliga a exhibir, y con `exigirLegalEnProduccion()` dentro del
  `RootLayout`: la disponibilidad del aviso de privacidad quedó acoplada a la completitud
  del contrato, al revés de la obligación.
- El **panel de QA** —el mecanismo que certifica al producto— es el único módulo grande
  del delta sin arnés: **6.49 % de líneas, 0.59 % de ramas**.

Dos de esos cinco se arreglaron hoy. Los otros tres son diseño, no parche, y por eso
bajan la nota en vez de cerrarse.

La otra mitad de la bajada es reincidencia que ya no admite lectura amable:

| Rubro | Reincidentes | Cerrados por el delta |
|---|---|---|
| Frontend | 8 de 8 de la c4 | 0 (el crítico propio sí cerró) |
| Legal | 22 verificados uno por uno | **1**, y por colateral |
| Fiscal | el 15% en SQL va por su **5ª** ronda | 0 |
| Rendimiento | sus dos críticos, **5ª** ronda | 0 |
| Agéntico | los 4 abiertos de ayer | 0, **sin una línea de cambio** |

---

## La convergencia de la ronda

**Tres auditores independientes** —backend, seguridad y rendimiento— llegaron al mismo
`openrouter.ts:515` por caminos distintos: backend leyendo el contrato de `calcCost`,
seguridad recorriendo la frontera de la ruta de ingesta, rendimiento sumando el peor caso
del OCR. Cuando tres métodos independientes coinciden, el hallazgo deja de necesitar
defensa. **Es el arreglo #1.**

---

## Lo arreglado, con su prueba

| # | Hallazgo | sha | La prueba |
|---|---|---|---|
| 1 | **BACK-19c2-1 (CRÍTICO)** — la reserva de presupuesto medía el input en **caracteres** y `calcCost` los cobra como **tokens**. `generateStructured` mete el data-URL base64 completo en `body.messages`, y un modelo de visión cobra la imagen a tarifa fija, no por byte | `b4a2cc4` | Una foto de 3 MB —la que `ingesta/limites.ts:24` admite por escrito diciendo «una foto de celular normal cabe»— llega al proveedor. **Sin el arreglo pide $0.756109 contra el techo de $0.500000** y lanza `LlmBudgetExceededError` sin red de por medio. Tercera aserción de control: el texto largo **sigue** sobre-reservándose |
| 2 | **AGEN-19c2-2 (CRÍTICO)** — el sello del fencing vivía dentro del `try` que decide el éxito de la tool: un `complete_agente_mutacion` que se pasara del tope de 8 s de `acotada` hacía que `guardar_liquidacion` respondiera fallo sobre un viaje ya `liquidado` e **irreversible** por los triggers 0036/0037 | `234c364` | El sello se pasa del tope, y el sello pierde el token. **Sin el arreglo las dos salen rojas con `success: false`.** Control: un fallo del **handler** sigue siendo un fallo, con `failMutation` llamado y `completeMutation` sin llamar |

Los dos comprobados **corriendo la prueba antes del arreglo**. El (2) tiene además una
asimetría que lo delata: el camino de error ya protegía `failMutation` con su propio
`try/catch` (`tool-executor.ts:208`); el de éxito era el único que no.

Suite final: **519 archivos, 6,525 pruebas, 1 saltada**; `tsc` limpio; `eslint` 0 errores.

---

## Las doce notas

| Rubro | Antes | Hoy | Δ | Razón, y qué la sostiene |
|---|---|---|---|---|
| Operabilidad y DX | 6 | **6** | = | *Se atacó y subió* (el desfase de despliegue cerró: `69aa71b` **sí** lleva la bandera — verificado por mí con `git log`) contra *deuda que cobró factura*: la comprobación de sha **nunca se ha ejecutado** — 139 corridas, 0 ejecuciones. Del mismo tamaño |
| Backend y API | 7→6 | **5** | −1 | *Deuda que cobró factura* — el presupuesto nuevo nació con el error de unidades, y 7 de 8 altos de ayer siguen abiertos. **Arreglado esta ronda**, y aun así baja: es el tercer delta seguido en que la superficie nueva no hereda los guardas |
| Tool calling | 4 | **5** | **+1** | *Se atacó y subió* — la idempotencia por efecto y el presupuesto duro llegaron de verdad, y la regla estructural (`properties: {}`) se respeta en todas las tools nuevas. **El único rubro que sube.** Lo que la tool **escribe** sigue siendo el hueco |
| Seguridad | 5 | **5** | = | *Deuda que cobró factura + mirada más profunda*. Sin acceso sin autenticar a datos de un tenant; `npm audit --omit=dev` → **0 vulnerabilidades**, verificado por mí. Su único crítico es el mismo `openrouter.ts:515`, ya arreglado |
| Frontend | 5 | **5** | = | Compensación exacta: el CRÍTICO FE-19-1 (la compuerta de onboarding tragada por un `catch` desnudo) **cerró de verdad y como se debía** — eso impide que baje a 4; 8 de 8 reincidentes de la c4 abiertos — eso impide que suba |
| Rendimiento y costo | 5 | **5** | = | *Deuda que cobró factura* — sus dos críticos van por la **quinta** ronda sin que nadie los toque: el agregado fiscal agrupa por el nombre del emisor **tal como lo leyó el modelo de visión**, y `anomalias_gasto_tenant` conserva el anti-join por `position()` |
| Modelo de datos | 6 | **5** | −1 | *Deuda que cobró factura + mirada más profunda* — la llave de `guardar_liquidacion` no tiene alcance de corrida ni vencimiento, y no hay `delete`, ni purga, ni columna de expiración: la fila `succeeded` vive para siempre |
| Pruebas | 5 | **5** | = | *Se atacó y subió* (pgTAP corriendo **de verdad** en CI, el IDOR del `encargado` cerrado con prueba propia, el lease del claim mudado de un UPDATE mockeable a una RPC verificada) contra *deuda que cobró factura*: el panel de QA nació en 6.49 % de líneas. **Neto cero, otra vez** |
| Sistema agéntico | 4 | **4** | = | *Se atacó y subió* (los leases con fencing son el diseño que la ronda 18 pidió) compensado por *deuda que cobró factura*: los 4 abiertos de ayer siguen **sin una línea de cambio**, y la superficie nueva trajo dos críticos propios. Uno **arreglado esta ronda** |
| Arquitectura | 4 | **3** | −1 | *Deuda que cobró factura* — los dos controles nuevos **se apagan solos bajo `vitest`** (`tool-executor.ts:136`, `budget.ts:89`) y sus ramas de fallar-cerrado no las toca ninguna prueba; `repo.ts` pasó de 171 a **173** archivos que lo saltan, con la allowlist congelada en 16. La regla del rubro es explícita: una advertencia que vuelve a ocurrir **es** un hallazgo |
| Cumplimiento fiscal | 3 | **3** | = | *Deuda que cobró factura* — **los dos arreglos fiscales del delta están inertes**: `69aa71b` retiró `plazo_facturacion_horas` y `renglones` del esquema del OCR porque tumbaron la extracción en producción, y el motor sigue leyendo dos llaves de `ocr_extra` que ningún escritor pone. Cerrados: **cero** |
| Cumplimiento legal | 3 | **3** | = | El commit que se llama literalmente *«Compuerta legal»* **no cerró ninguno de los cuatro CRÍTICOS**, no tocó `privacidad.ts` ni `aviso/`. Se cerró **1 de 22**, y por colateral (el `beforeSend` nuevo de Sentry). La nota no se mueve, y decirlo es el hallazgo |

Suma **54 / 12 = 4.5**.

Serie: **6.1 · 4.8 · 5.8 · 5.3 · 4.7 · 4.5**.

---

## Los CRÍTICOS que quedan pendientes, con razón escrita

No se arregla lo que no se pudo reproducir, y no se parchea lo que pide diseño.

1. **La llave de idempotencia no expira: un viaje reabierto no se vuelve a liquidar
   nunca** (datos) — `0186:17` (`unique (tenant_id, effect_key)`) + `0188:69-71` +
   `tool-executor.ts:244-246`. **Verificado por mí**: `mutationEffectKey` devuelve
   `guardar_liquidacion:<tenant>:<viaje>:<operador>` sin run id ni timestamp, y
   `ctx.mutationKey` —el único escape— no lo asigna nadie (`grep` da tres líneas, las tres
   en `tool-executor.ts`). El campo `runId` **existe** y está excluido de la llave **a
   propósito** (`:19`). El arreglo correcto es que `reabrirViaje` invalide la fila, lo que
   toca `administracion.ts`, un método de repositorio y la RLS de la tabla — **y aquí no
   hay base de datos para reproducirlo**. Sacar un viaje del pozo hoy exige un `DELETE` a
   mano en la consola de Supabase.

2. **22 comprobantes son 23 mensajes, y el resumen consolidado no puede dispararse nunca**
   (agéntico, AGEN-19C2-1) — el delta convirtió el peldaño `silencio` en `acusar`, pero
   las dos mitades de `huboRafaga` (`processor.ts:1941`) murieron el 23-ago, cuando el
   webhook pasó a agrupar por chofer y a recorrer cada cadena **en serie**. Con eso se
   pierde `lineaIncidencias`: las fotos ilegibles del fajo ya no se enuncian en ningún
   lado y su monto queda como anticipo en contra del chofer. **No es un parche**: exige
   rediseñar la ventana de ráfaga contra el procesamiento en serie por chofer, y tocarlo a
   ciegas revierte el trabajo del 23-ago.

3. **Ningún monitor carga una sola página de producción** (operabilidad) — las dos únicas
   llamadas a producción en `.github/workflows/` van a `/api/health`, que es una route
   handler y **no renderiza `layout.tsx`**. Y ahí, en `:55`, `exigirLegalEnProduccion()`
   lanza si falta cualquiera de las cuatro variables de entidad. El sitio entero puede
   estar caído con los tres semáforos en verde. Es de CI y de producción: no hay forma de
   reproducirlo desde este contenedor.

4. **El panel de QA se puede clavar en «ok» y ninguna de las 6,525 pruebas se entera**
   (pruebas) — **corrección al reporte**: `qa-motor.ts:544` es
   `estadoFinalDe(corrida.veredicto)`; el `const final = 'ok'` fue la **mutación** del
   auditor, ya revertida. El hallazgo es de **cobertura**, no un bug de código, y su
   arreglo es escribir el arnés del módulo, no un parche de una línea.

5. **Los 19 bloques no-op de `verificaciones.sql`** (pruebas, REINCIDENTE) — el conteo no
   bajó pese a +153 líneas nuevas, y tres siguen contradiciendo hoy su propio
   `(esperado …)`. Probado contra un Postgres real: la batería midió una fuga entre flotas
   y aun así salió `EXIT=0`.

---

## Lo que esta ronda NO alcanzó a mirar

- **No hay base de datos en este contenedor.** Las cuatro migraciones nuevas (0185–0188,
  816 líneas de SQL) se auditaron **leyendo el SQL**, no ejecutándolo. Lo que solo se
  sabe corriéndolo quedó anotado como tal en `datos-c2.md`.
- **No se corrió `npm run build`** a propósito: pide Supabase, OpenRouter, Facturapi y
  Upstash. Su ausencia significa que **no se verificó que el proyecto construya**, solo
  que compila (`tsc`) y que las pruebas pasan.
- **Una prueba salió roja una vez y verde las dos siguientes** sobre el mismo árbol
  (`expect(opts.budget.runId).toMatch(...)`, en las fixtures de tools concurrentes).
  No se persiguió; queda anotada como **intermitente sospechosa**, que es información
  distinta de «pasa».
- Los reportes de arquitectura, rendimiento y seguridad advierten que **el árbol de
  trabajo cambió bajo sus pies** durante la corrida: mis dos arreglos entraron mientras
  ellos leían, y el auditor de pruebas tenía mutaciones en vuelo. Sus `archivo:línea` son
  contra `69aa71b` y pueden no cuadrar con el archivo en disco. Es un defecto del método
  —arreglar mientras se audita— y queda anotado para la ronda siguiente.
- El estado del árbol al cerrar: `git status --porcelain` **vacío**. El auditor de pruebas
  revirtió sus 11 mutaciones y sus 4 controles.

---

## Nota de infraestructura

El contenedor clona el repo **sin `node_modules`**: el primer `npm test` devolvió
`vitest: not found` y el primer `npx tsc` dos errores de módulos ausentes. **INFRA, no
hallazgos** — se corrió `npm ci` y se repitió la compuerta. Anotado porque confundir «la
infra falló» con «la tarea falló» es el fallo más caro documentado en corridas
desatendidas.

El remoto se llama `javiercamarapp/cuadra` y GitHub lo sirve como
`javiercamarapp/likida.ai`: el repositorio se renombró y los enlaces del PR salen con el
nombre viejo. Es el mismo repositorio.
