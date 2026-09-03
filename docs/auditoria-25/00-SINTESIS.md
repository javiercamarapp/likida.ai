# Auditoría 25 — Síntesis y recalificación

**Global: 5.2** (anterior: **6.2**) · **▼ 1.0**

Ronda **COMPLETA**, desatendida, en la nube. Rama `claude/auditoria-25` sobre
`master` = `4f94490`. Árbol limpio al arrancar → **autofix habilitado**.

## Por qué esta ronda fue completa

La decisión se tomó **antes** de gastar un token en auditores, que es el punto
de la regla:

- `list_pull_requests(state=open)` sobre `javiercamarapp/cuadra` → **`[]`**. Sin
  PR de auditoría vivo, no aplica la regla de continuación.
- `git log b8a1a3a..HEAD -- src/ supabase/ normas/` → **7 commits**, 13
  archivos, +358/−111. Con cambios, no aplica la ronda ligera.

Rama nueva con el prefijo obligatorio `claude/`. El clon de la nube no traía
`node_modules`: se corrió `npm ci` antes de la compuerta (INFRA, resuelta).

## La lectura de la ronda, y es incómoda

**Diez rubros bajan, dos se quedan, ninguno sube.** La global cae un punto
entero, de 6.2 a 5.2 — el mayor movimiento de la serie.

Y **el código no empeoró**. Siete de los doce rubros no recibieron un solo
commit desde la 24; sus auditores lo verificaron con `git log` sobre las rutas
de su rubro y lo dejaron escrito. Lo que pasó es lo otro: **nueve de los doce
firman «mirada más profunda» con esas palabras** — la 24 midió un cambio de 188
commits y 484 archivos de un tirón, y calificó de más.

Esto es exactamente lo que la rutina existe para producir. La 24 subió 0.8
puntos cerrando trece cosas reales; la 25 devuelve 1.0 al mirar más despacio. La
serie —6.1 · 5.4 · 6.2 · **5.2**— no es ruido: es una nota que se mueve cuando
la mirada cambia de profundidad, que es lo que se le pidió.

**El caso que mejor lo explica es agéntico.** La 24 declaró AGEN-1 cerrado y le
subió un punto. Su hallazgo nombraba **tres** funciones; el arreglo tocó **una**.
Al ex-empleado se le seguía mandando por WhatsApp el PDF del contralor y el 🚨
con la ubicación del chofer. Un cierre a medias vale más caro que un hallazgo
abierto, porque la nota ya cobró la subida.

## Las notas

Global = media aritmética de los 12 rubros, con un decimal (62 / 12 = 5.2).

| Rubro | Antes | Hoy | Δ | Porqué del movimiento |
|---|---|---|---|---|
| Pruebas | 7 | **7** | = | **Se atacó y subió, y la mirada más profunda se lo comió.** El techo de heap de la 24 (`22dc127`) sigue en pie **y está anclado**: lo bajó a 2048 y la prueba muere. A cambio bajó un piso por debajo del parseo estático con que la 24 certificó `verificaciones.sql`, levantó un Postgres 16 real, y **un bloque sale `✓ ok` con sus cuatro valores medidos mal** (`:2760-2792`). Misma clase que PRU-1, en el mismo archivo. |
| Backend y API | 7 | **6** | ▼1 | **Mirada más profunda.** Ni un commit tocó el rubro. Abrió el seam de la firma humana por el lado **contable** —el que la 24 no abrió— y encontró un segundo camino por el que un ajuste del contralor inventa una cifra fiscal o tira el export del mes. |
| Tool calling | 7 | **6** | ▼1 | **Mirada más profunda.** El 7 descansaba en TC-1, y TC-1 está **cerrado a medias**: el predicado de copias es el mismo, el **orden** no (`tools.ts:106` ordena por un uuid aleatorio, `repo.ts:955` no ordena) y de él depende cuál copia se cuenta. TC-3 va por su **cuarta ronda** sin tocarse. |
| Seguridad | 7 | **6** | ▼1 | **Mirada más profunda.** La comprobación que la 24 hizo sigue siendo cierta (ninguna ruta sin autenticar a datos de un tenant; escaneadas las 151 funciones de las 281 migraciones, cero `security definer` sin `search_path`). Las que no hizo: el límite de **rol** frente a PostgREST y el ciclo de vida de una credencial cuando se retira el acceso. En las dos hay una sola capa. |
| Modelo de datos | 6 | **5** | ▼1 | **Mirada más profunda.** Las dos migraciones nuevas están bien hechas —el `DROP FUNCTION` de la 0302 va firmado con los tipos correctos—, así que la baja no viene de ellas: viene de aplicar el chequeo del rubro sobre superficie que las rondas 23-24 no recorrieron. |
| Rendimiento y costo | 6 | **5** | ▼1 | **Deuda que cobró factura.** El ALTO de `PASOS_CIERRE` se reportó cuando vivía en una rama; hoy está en `master` sin arreglar. Y el costo por liquidación **declarado en $0.05** contra los ~$0.144 de entrada sola que mide el propio repo — de ese número sale el techo diario de IA de cada flota. |
| Frontend | 6 | **5** | ▼1 | **Mirada más profunda.** Tercera ronda seguida sin cerrar **ninguno** de sus 13 abiertos. Y la 24 no midió dos defectos que estaban ahí: el contraste de la columna «Región» es **hex en línea**, invisible para `contraste.test.ts` (que solo lee `globals.css`) y para el barrido de clases (que solo mira `className`). |
| Cumplimiento fiscal | 5 | **4** | ▼1 | **Mirada más profunda.** Sus dos críticos —los que la síntesis de la 24 llamó «lo primero de la ronda 25»— siguen **con los mismos números de línea**, y aparecieron dos superficies más que imprimen dinero mal. El ancla del rubro dice «3 o menos si el producto imprime una cifra fiscal equivocada»; hoy lo hace por **cuatro** puertas. Lo único que sostiene el 4 es que la disciplina de fichas sigue intacta y las abstenciones declaradas siguen siendo correctas. |
| Cumplimiento legal | 7 | **5** | ▼2 | **Mirada más profunda.** El código no cambió una línea (`git log` sobre las siete rutas del rubro → vacío), así que no hay deterioro: los tres ALTO siguen byte por byte. Lo que cambió es la lectura — la 24 se puso 7 con un flujo de dato personal hacia un modelo externo que ningún aviso enumera **ya escrito en su propia primera página**, y su rúbrica dice 3 o menos si hay transferencia sin cobertura. Además abrió la máquina de prospección, donde Likida es **responsable**, no encargada. |
| Arquitectura | 6 | **4** | ▼2 | **Mirada más profunda, con deuda que cobró factura.** Cita su propia ancla: «4 o menos si la misma lógica de dinero vive en más de un archivo». La proporción de LIVA 5 fr. I vive en **tres**, y el tercero solo conoce la mitad de las reglas. El patrón que la 24 llamó el más importante de su ronda —*dos lugares que calculan lo mismo*— **creció de 4 sitios a 9**, seis ya divergidos. |
| Operabilidad y DX | 5 | **5** | = | **Deuda que cobró factura.** Los dos críticos de la 24 se cerraron de verdad y se verificaron uno por uno — eso es lo único que impide que baje. Pero el ALTO que la 24 dejó abierto **cobró la factura exacta que se le anunció**, y de la peor forma posible: el detector automático de la deriva quedó anclado en un commit que Vercel nunca pudo construir. |
| Sistema agéntico | 5 | **4** | ▼1 | **Mirada más profunda.** El arreglo estrella de la 24 estaba cerrado a la mitad —tapó la entrada de WhatsApp y dejó las tres salidas abiertas—, y tres de sus cinco hallazgos siguen abiertos verbatim. **Su crítico se arregló en esta ronda**; la nota se recalificó con el arreglo ya en el árbol. |

## Lo arreglado, con prueba que lo reproduce

Tres vueltas de tres, las tres retenidas. Cada una: prueba que falla sin el
arreglo → arreglo → prueba verde → suite completa → commit atómico.

| ID | Sha | Qué era |
|---|---|---|
| **AGEN-C1** (CRÍTICO) | `24ce4c2` | El hallazgo de la 24 nombraba **tres** resolutores de «a qué número se le escribe»; el arreglo tocó **uno**. `desactivarUsuario` escribe `activo=false` pero **no borra el teléfono**, así que las otras tres seguían encontrándolo: al ex-empleado le salían las cifras del cierre, el `sendDocument` del **ejemplar del contralor** (RFC, folios, veredictos `SOLO_CONTRALOR`) y el 🚨 de la escalada **con la ubicación del chofer**. Filtro en la base y otra vez en TS, porque `.limit(1)` y `.find()` cuentan filas del servidor. 6 pruebas, rojo→verde comprobado revirtiendo cada archivo por separado. |
| **SEG-A1** (ALTO) | `ffc95b2` | Misma raíz, otra puerta: la baja cerraba panel, RLS y Auth, y dejaba **vivo el token MCP**. La baja no mueve `tenant_id` ni `rol`, así que la revalidación de identidad de la 21 la daba por buena; y las herramientas leen con service_role, que no pasa por RLS. El refresco **rota y se renueva 60 días en cada uso**: no expira solo. `activo` entra al embed que ese camino caliente ya hacía. 3 pruebas. |
| **DATOS-A1** (ALTO) | `5660918` | `llm_costo_fase_dominio` (0025) enumera **seis** fases; `FaseCosto` tiene **siete** desde el 29-ago. El INSERT de cada nota de voz rebotaba con 23514 y `registrarCosto` —best-effort a propósito— se lo tragaba: el costo de la voz no entraba a la medición **con la que se fija el precio del producto**. Migración 0304 + `costos_dominio.test.ts`, que cruza el tipo de TS contra el CHECK leyendo el SQL, **sin base de datos**, en las dos direcciones. La ironía: el comentario de la propia 0025 advierte de este error y volvió a pasar porque nada cruzaba las dos listas. |

**Tope de 3 vueltas AGOTADO.** Y agotado a propósito en lo quirúrgico: los tres
arreglos son la misma clase de cambio —un filtro que faltaba en un resolutor, un
valor que faltaba en un dominio—, verificables sin base de datos y sin decidir
nada de producto.

## Los críticos que quedan PENDIENTES, con la razón

Ninguno se dejó a medias: cada uno tiene escrito por qué no se tocó.

1. **FIS-C1 / ARQ-C1 · El panel del contador acredita el IVA COMPLETO del
   combustible en efectivo; el motor solo la proporción del 15%.**
   REINCIDENTE de la 23 y la 24, reconfirmado con los mismos números de línea:
   `fiscal.ts:806-818` y `:850` no importan `proporcionesDeducibles` de
   `engine.ts:493`. **$16,000.00 en pantalla contra $0.00 en el PDF**, mismo
   UUID. Contra `normas/liva-5.yaml` (`verificado_fuente_primaria`). Nuevo dato
   de esta ronda: la misma cifra equivocada sale también por la herramienta MCP
   `resumen_fiscal` (`dinero.ts:172`) — ya no solo se lee, un agente la dicta.
   **Por qué no se arregló:** exige meterle al panel las `diferencias` del motor
   y decidir qué pasa con un gasto cuya liquidación no está. No es quirúrgico y
   toca dinero. Es la misma decisión que la 23 y la 24 tomaron, por la misma
   razón — y el hecho de que lleve **tres rondas** siendo «lo primero de la
   siguiente» es, en sí mismo, el hallazgo.

2. **FIS-C2 · El contador del 15% del ejercicio es ciego al complemento de
   pago.** REINCIDENTE. `0190:36-40` y `desde_db.ts:121-125` filtran por la
   forma cruda; `engine.ts:682` juzga la del REP. Dos liquidaciones de $174,000
   conceden $300,000 de deducción contra un tope real de $150,000. **Misma
   familia que FIS-C1: se arreglan juntos o se contradicen.**

3. **BE-C1a · «Ajustar» mueve el total y no el desglose: la póliza contable
   carga un «IVA/IEPS no acreditable» inventado, o el export del periodo entero
   se cae con 409.** NUEVO. Verificado abriendo el código: `grep` de
   `sub_total|iva_traslado|ieps_traslado|iva_acreditable` sobre la 0299 → **0
   ocurrencias**, mientras `poliza.ts:205` deriva `comprobado = anticipo −
   diferencia` (que **sí** se mueve) y `:230` lo resta contra `subtotalDeclarado`
   e `ivaAcreditable` (que **no**). La identidad se rompe por el monto exacto del
   ajuste. **Por qué no se arregló:** es el mismo nudo que el siguiente, y toca
   el archivo que el contador importa a su ERP.

4. **BE-C1b / DATOS-C1 · «Ajustar» cambia el total y NO regenera el PDF.**
   REINCIDENTE, segunda ronda seguida, hallado otra vez por dos auditores por
   caminos independientes. La 0299 declara por escrito que ajusta por delta y no
   re-cuadra, y el argumento está bien hecho; lo que falta es su consecuencia —
   regenerar el papel o invalidarlo. **Eso es decisión de producto, no de una
   rutina desatendida**, y toca el único documento que sale de Likida hacia un
   tercero.

5. **OP-C1 · El `[deploy]` se pierde en el merge commit.** NUEVO, y el modo de
   falla es peor que olvidar la bandera: **el humano la puso y el sistema se la
   comió.** `5a14012` («[deploy] promueve el fix del chat… a producción», en una
   rama llamada `deploy/trigger-chat-fix`) entró por el merge `4f94490`, cuyo
   asunto es `Merge pull request #318 from javiercamarapp/deploy/trigger-chat-fix`
   — sin la bandera. La compuerta lee **solo el asunto**, a propósito y por una
   buena razón. Las tres alarmas dijeron que todo iba bien. **Por qué no se
   arregló:** cambiar la semántica de la compuerta de despliegue de madrugada,
   sin nadie mirando, es exactamente el riesgo que esta rutina existe para bajar.

6. **OP-C2 · Producción lleva 9 commits y 2 migraciones sobre el último
   `[deploy]` efectivo.** REINCIDENTE de la 23, la 24 y la 25. **No es código**,
   y **el Redeploy del panel ya NO basta**: redesplegaría `3cc8ead`. Entre lo no
   publicado está el fix del chat con tenant fantasma (`66339d5`), que arregla un
   fallo **vivo hoy en producción** —su propio comentario lo fecha: 12 fallos en
   5 minutos—, y las migraciones **0302 y 0303**. Es el único punto que necesita
   una mano humana, y por eso va en la notificación.

## Descartados, refutados y corregidos — la prueba de que la verificación ocurrió

| Hallazgo | Qué pasó al verificarlo |
|---|---|
| «El seam de la firma humana (0299) no tiene una sola prueba» (backend, 24) | **REFUTADO** por el auditor de pruebas: sí las tiene — 14 casos en TS más los bloques SQL 246/247 de la batería. |
| «La flota da de baja a su único `flota_admin`» (escenario de AGEN-C1) | **CORREGIDO, no descartado.** `usuarios_escritura.ts:186` impide dar de baja al único dueño activo, así que ese escenario no ocurre. El hallazgo aguanta por el **contador**, que no tiene esa guarda, y por el `.find()` con dos dueños. El arreglo no cambia; el escenario sí. |
| «El runner despacha agentes graduados con `prompt_ref` NULL» (hipótesis mía al despachar) | **FALSO.** El runner nunca lee `prompt_ref`: los nueve graduados pasan los cinco candados y aterrizan en su rama de despacho. Lo que sí se rompió es el parte semanal del agente de documentación, que nace con nueve alarmas impagables. |
| «La 0302 dejó callers resolviendo a la firma retirada» | **FALSO.** Verificado por dos auditores: el único call-site pasa los 8 argumentos nombrados y el redondeo de la reserva no cambia. |
| Dos archivos de prueba en rojo a media ronda | **INFRA, no regresión.** Eran las mutaciones vivas del auditor de pruebas durante mi corrida de la suite. Al terminar él y restaurar, la misma suite dio 820/820. **No se revirtió nada** — confundir «la infra falló» con «la tarea falló» es el error más caro documentado en estas corridas. |

## Nota de método: el árbol mutado

Durante buena parte de la ronda hubo **mutaciones vivas** en el árbol de
trabajo: son las del auditor de pruebas, que es el único al que se le autoriza
romper código a propósito. Seis archivos aparecían y desaparecían modificados.

Tres cosas quedaron bien y vale dejarlas escritas:

- **Ninguna mutación entró a un commit.** Los commits de documentos usaron
  `git add -f` sobre rutas explícitas de `docs/`, nunca `git add -A`.
- **La verificación se hizo contra `git show HEAD:<archivo>`** mientras
  duraron. El auditor de arquitectura llegó a la misma precaución por su cuenta
  y lo declaró en su reporte.
- **El árbol quedó limpio.** El auditor restauró sus 8 rutas byte a byte y
  detuvo el Postgres 16 que había levantado.

El costo real fue una corrida de suite desperdiciada y un susto. Si esta rutina
vuelve a correr los doce en paralelo, el auditor de pruebas debería trabajar
sobre una copia del árbol, no sobre el árbol.

## Compuerta al cerrar

Sobre el árbol final:

- `npx vitest run` → **820 archivos, 10,962 pruebas, 1 saltada, 0 fallos**
  (+12 pruebas nuevas de esta ronda).
- `npx tsc --noEmit -p .` → **exit 0**.
- `npm run lint` → **0 errores**, 173 avisos.
- `npm run lint:ratchet` → **173/173 heredados, 0 nuevos**.
- `npm run build` → **no corre aquí a propósito**: pide Supabase, OpenRouter,
  Facturapi y Upstash, y su fallo no diría nada del código.

**Tablero:** `tablero.html` + `tablero.png`, capturado con Chromium 141 headless
(`--force-prefers-reduced-motion`) y **mirado**: 12 rubros contados, las notas
cuadradas contra esta síntesis (62/12 = 5.2), colores por nota y no por delta.
