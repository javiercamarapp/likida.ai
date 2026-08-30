# Auditoría 22 — Síntesis y recalificación

**Global: 6.0** (anterior: **s/d** — ver abajo por qué no hay delta).

Ronda COMPLETA, desatendida, en la nube. Rama `claude/auditoria-22` sobre
`master` = `86813f4`. Árbol limpio al arrancar → **autofix habilitado**.

La lectura de la ronda: **el motor está mejor construido que su cumplimiento
fiscal y legal, y mucho mejor que su capacidad de darse cuenta de que algo se
rompió.** Seguridad y modelo de datos salieron sin un solo crítico; fiscal salió
con tres y legal con dos. Y el hallazgo que más pesa no es ninguno de ellos: el
único detector automático de cron muerto lleva **≥30 corridas seguidas en rojo**,
así que hoy Likida no puede enterarse de que algo dejó de correr.

## Por qué esta ronda NO tiene delta

`.gitignore` ignora `docs/auditoria-*/`: ninguna ronda deja rastro en `master`,
y la síntesis de la 21 vive en `likida-archivo-privado/`, fuera de este clon.
**No pude leer una sola nota previa.** Las once notas de abajo son una **línea
base nueva**.

Esto es una limitación de la corrida, no un resultado. Publicar un delta contra
un número que no pude leer sería la cifra inventada que la regla mayor del
producto prohíbe — y ya pasó antes: la ronda 18 dejó escrito que la 17 vivía
sobre una historia sin ancestro común y que comparar habría sido «publicar una
mejora que nadie hizo».

**Lo que hay que arreglar para que mañana sí haya delta** (propuesto, no hecho —
la ronda 18 ya dejó dicho que quitar esa línea del `.gitignore` *se propone, no
se hace*): o el `00-SINTESIS.md` se versiona, o la rutina lo publica en un lugar
que la nube pueda leer. Sin eso, cada corrida en la nube va a recalificar en
frío para siempre.

## Las notas

Global = media aritmética de los **11** rubros que entregaron, con un decimal.
**Pruebas no entra en el promedio**: su auditor no cerró dentro de la ronda, y
meterlo con un número supuesto movería la global sin que nadie hubiera mirado el
rubro.

| Rubro | Antes | Hoy | Porqué del movimiento |
|---|---|---|---|
| Modelo de datos | s/d | **8** | Línea base. Sin numeración duplicada, sin `SECURITY DEFINER` sin `search_path`, sin RLS faltante — los tres modos de falla que este repo ya pisó. Lo que queda es higiene (51 `add constraint` sin guardia) y un ALTO de identidad de teléfono. |
| Backend y API | s/d | **7** | Línea base. Los caminos de dinero tienen prueba propia y los errores se propagan con identificador de fila; los tres ALTO son de borde (saneador de PDF, reimpresión, export sobre 100,000 filas), no del camino central. |
| Frontend | s/d | **7** | Línea base. Los cuatro estados están pintados a propósito y los dos mapas más caros ya no pueden desincronizarse en silencio. No es 8 porque tres pantallas de dinero afirman cosas que no midieron. |
| Seguridad | s/d | **7** | Línea base. **Cero críticos y cero altos**: no hay camino sin autenticar a datos de un tenant, ni secreto con fallback silencioso, ni cruce de tenant explotable. Los arreglos de MCP/CSRF de ayer aguantaron una mirada adversarial fresca. |
| Arquitectura | s/d | **6** | Línea base. `procesarTurno` son 2,874 líneas —74% de `processor.ts`, el archivo por el que pasa todo el dinero entrante—, y la consola del superadmin depende del panel del cliente en las dos direcciones. |
| Tool calling | s/d | **6** | Línea base. La frontera está definida, pero una tool entera (`estado_viaje`) es invisible para la guardia de cifras y el veto de emisión del piloto de visión es un regex de cuatro verbos. |
| Rendimiento y costo | s/d | **6** | Línea base. Dos CRÍTICOS son la misma causa raíz: cifras incompletas presentadas como completas por el recorte silencioso de PostgREST. |
| Agéntico | s/d | **5** | Línea base. El camino feliz es sólido; los puntos de muerte no. Un `guardar_liquidacion` abortado a media ejecución commitea y se registra como fallido: la base dice una cosa y el chofer oye la contraria — exactamente el estado que las anclas del rubro puntúan con 3 o menos, y solo no baja más porque los dos CRÍTICOS de la 21 sí quedaron cerrados. |
| Cumplimiento legal | s/d | **5** | Línea base. Dos CRÍTICOS y cuatro ALTOS, todos del mismo tipo: **el aviso de privacidad describe un sistema distinto del que corre**. El caso peor es afirmativo, no omisivo — el aviso *jura* que no se conservan datos de salud y el circuito de asistencia los guarda en columna propia. |
| Operabilidad y DX | s/d | **5** | Línea base. La nota la fija el CRÍTICO: el watchdog está permanentemente rojo por una causa conocida, así que una muerte real de cron es indistinguible del ruido, y arrastra consigo el cotejo del sha desplegado. |
| Cumplimiento fiscal | s/d | **4** | Línea base y **la nota más baja de la ronda**. Tres CRÍTICOS de dinero, todos verificables contra texto normativo. El más grave es una **regresión del arreglo de ayer**: `010a7f5` convirtió un bloqueo (409) en una exportación que asienta como deducible lo que el motor declaró que no lo es. |
| Pruebas | s/d | **—** | **Sin entregar.** El auditor seguía corriendo al cerrar la ronda. Su nota no se mueve porque no hay nota que mover, y el rubro queda **sin cubrir** en esta ronda. |

## Arreglado, con prueba que lo reproduce

Tres vueltas de arreglo, las tres retenidas. Cada una: prueba que falla sin el
arreglo → arreglo → prueba verde → suite completa → commit atómico.

| ID | Sha | Qué era |
|---|---|---|
| ARQ-1 / FIS | `694fd8b` | `renglones_ajenos` estaba en `POR_CONFIRMAR` y en `REVISAR` pero no en `SIN_ACREDITAMIENTO` (`engine.ts:1267`): un CFDI de canasta mixta salía con `totalDeducible 0` y aun así acreditaba $137.93 de IVA. LIVA 5-I acredita «en la proporción en la que dichas erogaciones sean deducibles»; la de un gasto por confirmar es cero. **Tercera vez** que este bloque cae en el mismo hueco (`cfdi_pendiente` en la 12, `gasto_otro_ejercicio` en el ciclo Fable 1). |
| FE-1 | `a6493be` | `facturacion/page.tsx:85` usaba `if (!error && data)` y dejaba `clientes = []` ante cualquier falla. Una flota con 40 clientes activos leía «No tienes clientes dados de alta» y no podía facturar, sin un mensaje de error. Ahora `null` = no se pudo leer, `[]` = no hay. |
| REN-1 | `078cc12` | `oficina_wa.ts:77` sumaba anticipos sin paginar. Con 1,500 viajes abiertos imprimía **$100,000.00** donde la verdad son **$150,000.00**, en un PDF firmado que el dueño reenvía a su contador. |

**Detalle que vale más que los tres arreglos**: el mock del arnés de
`oficina_wa` devolvía el array entero sin importar el rango pedido, así que la
suite **no podía ver** el recorte de PostgREST. Ahora lo emula. Una prueba que no
puede fallar por el bug que cubre no estaba cubriendo nada.

## Verificados contra el código, uno por uno

Abrí el archivo de cada uno antes de anotarlo.

| ID | `archivo:línea` | Veredicto |
|---|---|---|
| FIS-1 | `poliza.ts:66-115`, `export/poliza/route.ts:195` | **CONFIRMADO.** `LiquidacionParaPoliza` no tiene ningún campo de deducibilidad; `porConcepto` es `{concepto, subtotal}` y la ruta lo arma igual desde la RPC. Todo gasto se carga a `catalogo.gastos[concepto]`, la cuenta deducible. |
| LEG-2 | `privacidad.ts:644` vs `0198_asistencia_siniestros.sql:46` | **CONFIRMADO.** El aviso dice en negritas «No se piden ni se conservan datos sensibles. Ni salud…»; la migración crea `incidencia.hay_lesionados boolean` ligada a `operador_id` y `asistencia_wa.ts:524` persiste el texto crudo del accidente. |
| OP-1 | `salud-produccion.yml:34-42`, `api/health/route.ts:90-96` | **CONFIRMADO con la API de GitHub.** 30 de 30 corridas devueltas son `failure`, consecutivas hasta el run 365 (29-ago 19:37Z), incluida la programada de hoy 08:25Z. |
| REN-1 | `oficina_wa.ts:77` | **CONFIRMADO y arreglado.** |
| ARQ-1 | `engine.ts:252` vs `:1267` | **CONFIRMADO y arreglado.** |
| FE-1 | `facturacion/page.tsx:85` | **CONFIRMADO y arreglado.** |
| TC-1 | `cuadre/guardia.ts:87-102` | **CONFIRMADO con matiz.** Con solo `estado_viaje` en el turno, `cuadro=false` y `consultoPolitica=false`, así que el bloque de `cifrasSinRespaldo` nunca corre y el texto se sustituye siempre por `resumenCuadre`. **No imprime una cifra falsa** —sustituye por verdad de base—, pero la narración que `prompts.ts:79-81` promete es inalcanzable por construcción y cada mensaje abierto paga una consulta de más. Baja de ALTO a **MEDIO**. |

## Descartados y matizados

| Hallazgo | Razón |
|---|---|
| ARQ-1 extendido a `ticket_monedero` | **DESCARTADO como bug.** `ticket_monedero` es el otro miembro de `POR_CONFIRMAR` ausente de `SIN_ACREDITAMIENTO`, pero es una foto de bomba: nunca trae CFDI, y el `if (!g.xmlVerificado) continue` de `engine.ts:1284` ya lo ataja estructuralmente. Agregarlo sugeriría que sin esa línea acreditaría, y no es cierto. Queda como **BAJO** de claridad, no de dinero. |
| OP-1, «178 corridas seguidas» | **PARCIALMENTE VERIFICADO.** Confirmé **30** consecutivas con la API; la cifra de 178 del auditor no la verifiqué a esa profundidad. El hallazgo se sostiene con 30. |

## Los críticos que quedan PENDIENTES, con la razón

Ninguno se dejó a medias: cada uno tiene escrito por qué no se tocó.

1. **FIS-1 · La póliza asienta como deducible lo que el motor declaró no
   deducible.** `poliza.ts:101-115`. Cablear la deducibilidad cruza la RPC de la
   migración 0178, la ruta de export y el catálogo contable. **No es
   quirúrgico**, y el módulo tiene una regla propia («ninguna cuenta se
   inventa») que exige decidir con el contador a qué cuenta va lo no deducible.
   *Nota de la ronda: antes de `010a7f5` estos casos descuadraban y se negaban
   con 409. El arreglo de ayer los volvió exportables. Es una regresión de
   detección, no de intención.*
2. **FIS-3 · El tope de LISR 27-III solo mira `'01'`.** `engine.ts:571`,
   `fiscal.ts:458`/`:652`. La lista de la norma **es cerrada** y las formas 06,
   08, 12, 17 y 23 no están en ella. Pero declarar no deducible una *dación en
   pago*, una *compensación* o una *novación* es justo el falso positivo que la
   propia ficha `lisr-27-III.yaml` advierte no cometer. El arreglo correcto las
   manda al tercer estado —«a confirmar», no «perdido»—, y eso son cinco listas,
   el PDF y el panel. **Decisión fiscal, no bug mecánico.**
3. **FIS-2 · Diésel en efectivo dentro del 15%: 100% deducible con $0 de IVA
   acreditable.** `engine.ts:1267`/`:1285`. Misma naturaleza: exige decidir si
   LIVA 5-I sigue al ISR aquí. No se toma a ciegas.
4. **OP-1 · El watchdog lleva ≥30 corridas en rojo.** El arreglo obvio —que un
   hueco de configuración declarado no tumbe el `status`— haría que el health se
   ponga verde con un cron sin configurar. Eso es cambiarle el significado a la
   señal de salud de producción, de madrugada y sin nadie mirando. **Se propone,
   no se hace.** Lo urgente es más simple: configurar `LIKIDA_SAT_PROVEEDOR`, y
   eso no está en el código.
5. **LEG-1 y LEG-2 · Avisos que describen un sistema distinto del que corre.**
   La corrección es de **texto legal**, no de código, y el texto legal no lo
   redacta una rutina desatendida.
6. **AGEN-1 · `guardar_liquidacion` abortada commitea y se registra fallida.**
   `tool-executor.ts:223`. No pude reproducirlo con una prueba dentro del tope
   de vueltas. **No se arregla lo que no se reprodujo.**
7. **REN-2 · El registro de jornada pierde marcas.** `jornada/repo.ts:324`.
   Misma causa raíz que REN-1 y probablemente el mismo arreglo, pero el tope de
   3 vueltas se agotó. Es el candidato número uno de mañana.

## Lo que esta ronda aprendió y conviene no perder

**`traerTodo()` tenía UN SOLO llamador en todo el repo.** Existe en `pg.ts:183`,
está bien escrito, falla cerrado y lanza `LecturaIncompleta`. Y casi nadie lo
usa. Dos de los cuatro críticos de «cifra incompleta con cara de completa» son
esa misma ausencia. **El barrido de las consultas restantes es el trabajo de más
valor por hora que tiene este repo hoy**, y queda propuesto.

**Tres de los hallazgos de esta ronda nacieron de arreglos de ayer** (FIS-1 de
`010a7f5`, y los de seguridad que NO aparecieron porque los de la 21
aguantaron). Auditar el código recién tocado es lo que más rindió.

## Compuerta

| Comando | Al arrancar | Al cerrar |
|---|---|---|
| `npm test` | 697 archivos · 9,918 pruebas · **verde** | 698 archivos · 9,924 pruebas · **verde** |
| `npx tsc --noEmit -p .` | 0 errores | 0 errores |
| `npm run lint` | 0 errores · 166 advertencias | 0 errores · 166 advertencias |
| `npm run build` | no se corre en la nube (pide Supabase, OpenRouter, Facturapi, Upstash) | — |
| `pruebas-manuales/*.prueba.ts` | no se corren: llamadas reales de pago | — |
