# Auditoría 24 — Síntesis y recalificación

**Global: 6.2** (anterior: **5.4**) · **▲ 0.8**

Ronda de **CONTINUACIÓN**, desatendida, en la nube. Rama `aud24/integracion`
(PR **#303**) sobre `master` = `615496d`. Árbol limpio al arrancar → **autofix
habilitado**.

## Por qué esta ronda fue de continuación y no completa

Había un PR de auditoría abierto: **#303, «Auditoría 24: cierre punta a punta —
15 constructores»**, 188 commits, 484 archivos, +34,919/−3,799, abierto hoy a las
10:12 UTC desde otra sesión. La regla es explícita: con un PR de auditoría vivo
se continúa sobre él y **no se abre uno nuevo**. Un PR vivo vale más que catorce
ignorados.

Lo que ese PR no traía era **ningún archivo de rubro**: `docs/auditoria-24/` no
existía en el árbol (`.gitignore:34` ignora `docs/auditoria-*/`; las rondas 22 y
23 entraron con `git add -f`). Los hallazgos de la 24 vivían solo en los asuntos
de 188 commits. Con los doce archivos faltando, la regla de continuación manda
relanzar los doce auditores — y eso se hizo, sobre el árbol ya integrado.

## Lo que esta ronda encontró primero, y es lo que la justifica

**La CI del #303 estaba en rojo, y su cuerpo afirmaba lo contrario.** El PR
declara «`tsc --noEmit`: limpio» y en la máquina donde se escribió lo estaba. En
GitHub Actions el paso Typecheck murió en las **dos** corridas con
`FATAL ERROR: Ineffective mark-compacts near heap limit — JavaScript heap out of
memory`, exit 134. Era el único bloqueador: los otros siete checks estaban en
verde.

El modo de falla es de manual y merece quedar escrito, porque **ninguna
verificación local podía atraparlo nunca**: `tsconfig.json` trae
`incremental: true` y `tsconfig.tsbuildinfo` está en `.gitignore:10`. En local el
typecheck corre **caliente**, con el `.tsbuildinfo` de la corrida anterior; en CI
corre siempre en **frío**, sobre un clon nuevo. Medido:

| Corrida | Techo | Resultado |
|---|---|---|
| caliente | 2048 MiB | exit 0 ← lo que ve quien lo corre en su máquina |
| **fría** | 2048 MiB | **exit 134** ← lo que ve CI, siempre |
| fría | 4096 MiB | exit 0 |
| fría | 8192 MiB | exit 0 · **pico real de RSS: 2,672 MiB** |

La primera medición de pico dio 958 MiB y era engañosa: salió caliente. Queda
anotada porque es exactamente el error que produce el hallazgo, y descartarla
costó dos corridas.

**Y el costo real era mayor que un check rojo.** El auditor de Pruebas lo
encontró por su cuenta y midió lo que yo no había mirado: al morir el Typecheck,
los **seis pasos siguientes del job quedan `skipped`** — entre ellos
`npm run test:coverage`. O sea que la compuerta de CI de este PR no reprobó las
pruebas: **no llegó a correr una sola de las 819**.

Tres caminos independientes dieron con él: el auditor de operabilidad, el de
pruebas, y la compuerta de esta ronda.

## Las notas

Global = media aritmética de los 12 rubros, con un decimal (74 / 12 = 6.2).

| Rubro | Antes | Hoy | Δ | Porqué del movimiento |
|---|---|---|---|---|
| Cumplimiento legal | 5 | **7** | ▲2 | **Se atacó y subió.** LEG-C2 cerrado y verificado: la compuerta `unidadesSinAvisoPrevio` sí llegó al poller de GPS (`sincronizar_gps.ts:208-219`) y al de cámara (`sincronizar_eventos.ts:146-156`), falla cerrada y se cuenta. Purga de geolocalización a 90 días (0289) y `docs/legal/RETENCION.md`. Quedan 3 ALTO, ninguno crítico. |
| Tool calling | 5 | **7** | ▲2 | **Se atacó y subió.** TC-1 cerrado de verdad —predicado exportado del motor y cinco pruebas sobre el dataset real—, igual que TC-2/4/5, TC-6, TC-N3 y TC-N6. Ninguna tool nueva rompe la regla `properties: {}`. Frena la subida que TC-3 lleva **tres rondas** sin tocarse. |
| Sistema agéntico | 4 | **5** | ▲1 | **Se atacó y subió.** AGEN-1 cerrado por el camino que la 23 señaló tras corregirse el diagnóstico (el techo de `acotada`, no `ctx.signal`): la relectura de la base ya vive en el camino feliz, no solo en el `catch`. Su crítico nuevo —la baja que no cerraba WhatsApp— **se arregló en esta ronda**. |
| Seguridad | 6 | **7** | ▲1 | **Se atacó y subió.** Cero críticos: recorridas las 67 rutas de `src/app/api`, ningún camino sin autenticar a datos de un tenant. Y la clase de crítico de la 23 —una migración que redefine una función SQL desde un cuerpo viejo y le come el `search_path`— **no reincidió** en las 24 migraciones nuevas. |
| Arquitectura | 5 | **6** | ▲1 | **Se atacó y subió**, con freno. ARQ-1 cerrado de verdad: `REVISAR` se deriva (`engine.ts:371`) y `contencion_listas.test.ts` exige la contención. Pero `procesarTurno` creció otra vez, de 2,913 a **3,096** líneas, y `cubetaDe` va por su tercera reconstrucción. |
| Modelo de datos | 5 | **6** | ▲1 | **Se atacó y subió.** DATOS-C2 cerrado de verdad: la 0286 empata por teléfono normalizado *y* por `operador_id`, y no perdió una sola guarda de la 0273 ni la cabecera de la 0275. La 0300 sí es la unión real de 0283+0299. El patrón no se repitió en 0288/0289. |
| Cumplimiento fiscal | 4 | **5** | ▲1 | **Se atacó y subió**, un punto y con reserva. **FIS-2 y FIS-3 de la 23 están cerrados de verdad** —verificado corriendo la ruta real de export, 76 pruebas verdes con los casos fijados al centavo—, pero aparecen **dos críticos nuevos de pesos**, los dos del mismo tipo que el producto ya sabe que le duele: dos motores que no coinciden. |
| Operabilidad y DX | 4 | **5** | ▲1 | **Se atacó y subió.** OP-C2 quedó cerrado (`health/route.ts:104-118`: `sinLatido` se juzga antes que `config_ausente`) y entró una compuerta de despliegue que sí puede reprobar. No sube más porque el crítico de la ronda —la compuerta que no podía correr— **era suyo**, y porque OP-C1 es reincidente. |
| Frontend | 7 | **6** | ▼1 | **Deuda que cobró factura**, y el único rubro que baja. En el tema por omisión con el SO en oscuro, el chip de estado del Cotizador mide **1.24:1** y «Crear viaje» **2.76:1** al hover: la pantalla del precio, ilegible. Y lo **agravó esta misma rama** — el arreglo FE-13b (`5906783`) añadió las dos clases `dark:` nuevas. |
| Backend y API | 7 | **7** | = | **Se atacó y subió, y una deuda nueva se comió la subida.** BE-1, BE-2 y BE-3 cerrados de verdad y con prueba en dos capas. Pero la funcionalidad más nueva del rubro (la firma humana, 0299) escribe cifras que nunca llegan al PDF, y ese seam no tiene una sola prueba. |
| Pruebas | 7 | **7** | = | **Se atacó y subió, frenada por la compuerta.** **24 mutaciones dirigidas, 18 muertas**: 0 de 14 sobreviven en el motor del dinero. PRU-1 **cerrado de verdad, no inerte** — la lista de exentos desapareció, `sinCalificar > 0` sale con exit 1, y el parseo de los 226 bloques da 0 `sin_calificar`. No sube porque la compuerta que protege todo eso no llegaba a correr. |
| Rendimiento y costo | 6 | **6** | = | **Mirada más profunda.** El barrido de desempates de la 23 aguanta. A cambio: la nota de voz reserva presupuesto **por byte de audio** (`cotaEntradaEnTokens` solo elide `image_url.url`), así que 1.24 MB agotan el tope de $0.50 y el chofer en emergencia recibe «no pude escucharte» por una llamada de $0.0008. |

## La lectura de la ronda, y su advertencia

**Diez rubros suben, uno baja, ninguno se queda por pereza.** La subida es real y
está verificada uno por uno: los auditores no encontraron arreglos inertes salvo
donde se dice. De los hallazgos abiertos que traían de la 23, **se cerraron de
verdad** AGEN-1, TC-1, LEG-C2, DATOS-C2, PRU-1, FIS-2, FIS-3, BE-1, BE-2 y BE-3.
Esa es la diferencia entre esta ronda y la 23, donde cinco de los 34 arreglos de
la 22 resultaron inertes o abrieron algo nuevo.

**Y aun así conviene leer el 6.2 con cuidado.** Mide un cambio de 188 commits y
484 archivos, no un día tranquilo; la lección que la 23 escribió —«un arreglo
nocturno sin revisar produce, en promedio, medio hallazgo nuevo»— aplica aquí a
escala 188×, y lo que salió es consistente con ella: **7 críticos distintos**,
tres de ellos nacidos dentro de esta misma rama (el Cotizador ilegible, el
«ajustar» que no regenera el PDF, y la compuerta que no podía correr). La nota
sube porque el saldo es favorable, no porque la rama esté limpia.

**El patrón que se repite y que vale más que cualquier nota:** de los siete
críticos, **cuatro son la misma forma** — dos lugares que calculan lo mismo y ya
no coinciden. El panel del contador contra el motor (dos veces, en fiscal), el
total en la base contra el PDF («ajustar»), y `cubetaDe` contra su tercera
reconstrucción. Es la advertencia que arquitectura lleva cinco rondas firmando.

## Arreglado, con prueba que lo reproduce

Dos vueltas de tres, las dos retenidas. Cada una: prueba que falla sin el arreglo
→ arreglo → prueba verde → suite completa → commit atómico.

| ID | Sha | Qué era |
|---|---|---|
| OP-1 / PRU-C1 | `22dc127` | El paso Typecheck de CI moría en OOM (exit 134) en las dos corridas, y con él quedaban `skipped` los seis pasos siguientes: **la compuerta no reprobaba las pruebas, no llegaba a correrlas**. Invisible en local porque `incremental: true` + `.tsbuildinfo` ignorado hacen que local corra caliente y CI siempre en frío. Pico medido en frío: **2,672 MiB** contra los ~2,048 del runner. El techo va en `scripts.typecheck` de `package.json`, no en el workflow, para que lo hereden los **dos** workflows que llaman `npm run typecheck` y cualquiera que se agregue después. |
| AGEN-1 | `70dd5c6` | La 0294 le enseñó a la base a dar de baja y `session.ts:99` lo respeta, pero **WhatsApp no pasa por Auth ni por `session.ts`**: pasa por `resolverCuentaOficina`, cuyo `select` no pedía `activo`. Al contador al que la flota le quitó el acceso el viernes le seguía contestando el bot el lunes — y por ahí pasan los comandos de administración por WhatsApp (`admin_comandos_wa.ts:45` declara que delega su autenticación en esta función). Filtro en la base **y** en TS: el `.limit(2)` cuenta filas del servidor, así que sin el de allá dos cuentas de baja podrían esconder a la viva. |

## Los críticos que quedan PENDIENTES, con la razón

Ninguno se dejó a medias: cada uno tiene escrito por qué no se tocó.

1. **FIS-C1 · El panel del contador acredita el IVA COMPLETO del combustible en
   efectivo; el motor solo la proporción del 15%.** Verificado abriendo el
   código: `fiscal.ts:814` llena `proporciones` **solo** con
   `proporcionAlimentacionPorGasto`, y `fiscal.ts:850` cae a `?? 1` para todo lo
   demás; `engine.ts:493` ya exporta `proporcionesDeducibles`, que tiene **las
   dos** reglas, y `fiscal.ts` no la importa. Medido: mismo UUID, **$16,000.00 en
   pantalla contra $0.00 en el PDF**. Contra `normas/liva-5.yaml`
   (`verificado_fuente_primaria`), que exige acreditar «en la proporción en la
   que dichas erogaciones sean deducibles».
   **Por qué no se arregló:** `proporcionesDeducibles` necesita las
   `diferencias` del motor, y el panel trabaja sobre un periodo de muchos viajes
   sin ellas. Meterlas exige cambiar la forma de los insumos de `resumirFiscal` y
   decidir qué pasa con un gasto cuya liquidación no está. **No es quirúrgico y
   toca dinero.** Es la misma decisión que la 23 tomó con FIS-2, y por la misma
   razón. Es lo primero de la ronda 25.

2. **FIS-C2 · El contador del 15% del ejercicio es ciego al complemento de pago.**
   `0190_15pct…sql:36-40` y `desde_db.ts:121-125` filtran por la forma **cruda**;
   `engine.ts:682` juzga la forma del **REP** desde FIS-5. Un diésel PPD liquidado
   en efectivo nunca entra al numerador y la facilidad se concede dos veces.
   **Misma familia que FIS-C1: se arreglan juntos o se contradicen.**

3. **BE-C1 / DATOS-C1 · `revisar_liquidacion(… 'ajustar')` cambia el total y no
   regenera el PDF ni el desglose fiscal.** Lo encontraron **dos auditores por
   caminos independientes**. Verificado: `revision.ts` no menciona el PDF por
   ningún lado, y la 0299 declara por escrito que ajusta por delta y **no
   re-cuadra** («un segundo motor en SQL sería *dos cálculos*»). La decisión de
   diseño está bien argumentada; lo que falta es su consecuencia — regenerar el
   papel o invalidarlo. **Eso es decisión de producto, no de una rutina
   desatendida**, y toca el único documento que sale de Likida hacia un tercero.

4. **OP-C1 · Producción lleva 15 commits sobre el último `[deploy]`.**
   REINCIDENTE de la 23. Verificado con `git log`: el último asunto con la
   bandera es `86813f4` (29-ago). **No es código** — el arreglo es un *Redeploy*
   en el panel de Vercel. Es el único punto de esta ronda que necesita una mano
   humana, y por eso va en la notificación.

## Descartados por falsos — la prueba de que la verificación ocurrió

| Hallazgo | Razón |
|---|---|
| El «24:00» de jornada por `hour12: false` | **FALSO** en Node 22 / ICU actual. El auditor lo **ejecutó** y resuelve a `h23`. Venía heredado como reincidente y se retiró. |
| «La 0300 recopió mal el cuerpo de la 0283» | **FALSO.** Verificado línea por línea: es la unión real de ambas mitades, y hasta agrega el `set search_path` que la 0283 no tenía. |
| «El patrón 0283/0299 se repitió en 0288/0289» | **FALSO.** La 0289 partió de la definición correcta. |
| El diagnóstico de AGEN-1 de la 22 (`ctx.signal`) | Ya venía corregido por la 23; esta ronda confirma el cierre por el camino bueno (el techo de `acotada`). |

## Compuerta al cerrar

Sobre el árbol final (`70dd5c6`):

- `npm test` → **819 archivos, 10,946 pruebas, 1 saltada, 0 fallos** (+5 pruebas
  nuevas de esta ronda).
- `npx tsc --noEmit` → **0 errores**, y ahora también **en frío**.
- `npm run lint` → **0 errores**, 173 avisos.
- `npm run lint:ratchet` → **173/173 heredados, 0 nuevos**.
- `npm run build` → **no corre aquí a propósito**: pide Supabase, OpenRouter,
  Facturapi y Upstash, y su fallo no diría nada del código.

**El trinquete de lint volvió a ganarse su lugar:** cazó un aviso nuevo que metió
mi propia prueba —un `readFileSync` con argumento no literal— **antes del primer
commit**. Es la segunda ronda seguida que lo hace, y las dos veces sobre código
del propio orquestador.
