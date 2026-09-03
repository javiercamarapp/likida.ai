# Arquitectura y mantenibilidad — auditoría 25

**Nota: 4/10** (antes 6). Razón del movimiento: **mirada más profunda — la nota
anterior estaba inflada**, con un componente de **deuda que cobró factura**.

El código de este rubro **no cambió**: de los 7 commits desde la 24, ninguno tocó
`engine.ts`, `fiscal.ts`, `processor.ts`, `revision.ts`, `operacion.ts` ni las dos
rutas de liquidaciones. **Los 7 hallazgos abiertos de la 24 siguen los 7 abiertos**
—los verifiqué uno por uno, con `git show HEAD:` para no confundirme con el árbol
de trabajo—. Lo que baja la nota no es que no se atacaran: es que la 24 se puso 6
mientras su propio rubro fiscal documentaba, como CRÍTICO, que **la misma regla de
dinero (la proporción de LIVA 5 fr. I) está implementada en tres archivos y ya no
coincide**. El ancla de este rubro dice «4 o menos si la misma lógica de dinero
vive en más de un archivo». Vive. La nota tiene que decirlo.

Y el patrón que la 24 señaló como el más importante de la ronda —*dos lugares que
calculan lo mismo y ya no coinciden*— **creció de 4 sitios a 9** (el conteo, con
línea, está al final).

**El riesgo mayor del rubro, hoy:** el panel del contador y el motor contestan
distinto a «¿cuánto IVA acredito?» sobre el MISMO comprobante, y el que se teclea
en la declaración es el de la pantalla.

> **Nota de método, importante para quien verifique estas líneas.** Durante esta
> ronda el árbol de trabajo estuvo siendo mutado por otro proceso: vi aparecer y
> desaparecer mutaciones de una línea en `fiscal.ts:811`, `revision.ts:45`,
> `revision.ts` (`firmable`), `contabilidad/poliza.ts`, `agentes/definiciones.ts`
> y `scripts/ci/compuerta-deploy.mjs`. **Todos los hallazgos de abajo están
> verificados contra `HEAD` (`4f94490`), no contra el árbol de trabajo.** El
> único sitio donde uso una de esas mutaciones es el hallazgo ARQ-25-4, y ahí lo
> declaro explícitamente: la usé como MEDICIÓN de un guardarraíl que no existe.

---

## Hallazgos

### [CRÍTICO] La proporción de LIVA 5 fr. I está implementada en tres sitios; el tercero solo conoce la mitad de las reglas y acredita el IVA completo de lo que el motor declara no deducible (REINCIDENTE — patrón ARQ-C3-1)

`src/lib/likida/cuadre/engine.ts:726` (`proporcionDeducible.set(g.id, dentro / g.monto)` — la frontera del 15% de la RFA 2.9) ·
`src/lib/likida/cuadre/engine.ts:1448` (la misma `Map`, ahora con el tope de LISR 28-V) ·
`src/lib/likida/cuadre/engine.ts:1569` y `:1590` (`ivaAcreditable += ivaTraslado * proporcion`) ·
`src/lib/likida/cuadre/engine.ts:493` (`proporcionesDeducibles` — la SEGUNDA implementación, exportada, con **las dos** reglas y un test que la clava al centavo contra el motor) ·
`src/lib/likida/fiscal.ts:806-816` (`const proporciones` — la TERCERA, que solo llena alimentación) ·
`src/lib/likida/fiscal.ts:850-854` (`proporciones.get(g.id) ?? 1` → el `?? 1` es el bug) ·
`src/lib/likida/fiscal.ts:771` (`ivaSostenible` deja pasar el combustible en efectivo cuando `elegible15 === true`) ·
`src/app/dashboard/contador/inicio-contador.tsx:133` y `:546` («IVA acreditable documentado»)

**Escenario.** Flota elegible a la facilidad (`elegible15: true`), ejercicio con
$1,000,000 de combustible y $150,000 ya pagados con medios fuera de la LISR 27-III
(el 15% consumido). Entra un CFDI de diésel de **$116,000** (SubTotal $100,000 +
IVA $16,000), `FormaPago '01'`, vigente y con XML verificado:

- **El motor** (`engine.ts:718-745`): `cupoRestante = 0` → `dentro = 0` →
  `proporcionDeducible.set(g.id, 0)` y `efectivo_sobre_15` con
  `esperado = 116,000`. En `engine.ts:1569` la proporción es **0** →
  **`ivaAcreditable += 16,000 × 0 = $0.00`**. El PDF imprime $0.00.
- **`proporcionesDeducibles`** (`engine.ts:499-505`): `1 − 116,000/116,000 = 0`.
  La póliza (`api/export/poliza/route.ts:159`) parte el renglón bien.
- **El panel del contador** (`fiscal.ts`): `proporciones` **solo se llena si
  `o.viaticosTopeFiscalDiarioMxn != null`** y **solo con
  `proporcionAlimentacionPorGasto`** (`:806-816`). Este gasto es diésel: no entra
  al mapa. En `:850`, `proporciones.get(g.id) ?? 1` → **proporción 1** →
  **`ivaAcreditable += $16,000.00`**.

Entra: **un CFDI de $116,000** → sale **$0.00 en el PDF y $16,000.00 en la
pantalla**, con el mismo rótulo legal. Con la frontera a la mitad (CFDI de
$174,000 dentro del cupo) la brecha es $20,689.66 contra $24,000.00.

Lo comprobé por ausencia además de por lectura: `grep -n efectivo_sobre_15
src/lib/likida/fiscal.ts` → **0 resultados**, y `grep -n proporcionesDeducibles`
sobre el mismo archivo → **0**. El único consumidor de `proporcionesDeducibles`
en todo `src/` es `api/export/poliza/route.ts:33`.

**Consecuencia.** El contralor. Y el papel se lo dio Likida: la propia ficha
`normas/liva-art-5.yaml` declara en `usado_en_codigo` que «*fiscal.ts —
ivaSostenible y resumirFiscal: el panel del contador acredita con la MISMA
proporción de la fr. I, no el traslado completo*». Es verdad para alimentación y
**falsa para la RFA 2.9**. Sobre una flota con $5,000,000 anuales de combustible
con su efectivo al límite, el excedente típico de un ejercicio son decenas de
miles de pesos de IVA acreditado de más, que responde el cliente en una revisión.

**Intento de refutación.** Busqué el guardarraíl y sí hay dos, y por eso el
arreglo se ve más fácil de lo que la 24 supuso: (a) `fiscal.ts:40` **ya importa**
`proporcionAlimentacionPorGasto`/`diasSobreTope` del mismo módulo del motor —o
sea, la mitad LISR 28-V **sí** es reuso real, no copia—, y (b) `fiscal.ts:44` ya
importa tres constantes de `engine.ts` con el comentario «*La constante vive en
el motor a propósito: el panel y el motor tienen que juzgar «no pagado» con el
MISMO valor*». Lo que no se importó es la función que reparte. También comprobé
que `tope15DeGastos` (`fiscal.ts:946`) mide el 15% **en agregado del periodo**,
no por comprobante: no puede tapar el hueco, y de hecho produce el contrasentido
de que la misma pantalla diga `estado: 'excedido'` mientras acredita el 100%.

**Causa raíz probable:** `resumirFiscal` tiene UN productor de proporciones y el
motor tiene DOS reglas que parten un gasto; `proporcionesDeducibles` se exportó
en la 24 para cerrar exactamente esto y solo la adoptó la póliza.

*(REINCIDENTE: la 24 lo levantó en su rubro fiscal como CRÍTICO —FIS-2, a su vez
reincidente de la 23— y su rubro de arquitectura lo dejó fuera de la nota.)*

---

### [ALTO] El renglón sale en verde con palomita mientras la misma hoja dice que ese comprobante no es deducible todavía (REINCIDENTE — tercera reconstrucción de `cubetaDe`, verificada sin cambios)

`src/app/dashboard/[id]/vista.tsx:199-214` (`estadoRenglon`, verificado contra `HEAD`) ·
`src/app/dashboard/[id]/vista.tsx:177` y `:179` (`TIPOS_MALOS` / `TIPOS_POR_CONFIRMAR`: importa las **listas**, no la función) ·
`src/lib/likida/cuadre/engine.ts:388-396` (`cubetaDe`, los cuatro criterios) ·
`src/lib/likida/cuadre/engine.ts:162-164` (`pagoPendiente`) ·
`src/lib/likida/cuadre/engine.ts:812-813` (`medio_pago_no_admitido` exige `formaPagoJuzgable !== undefined`) ·
`src/lib/likida/cuadre/engine.ts:195-198` (`medioNoAdmitidoCombustible('99') === false`, a propósito) ·
`src/app/dashboard/[id]/detalle.tsx:364` (dónde se pinta) ·
`src/lib/likida/liquidacion/deducibilidad.ts:86-94` (lo que dice el bloque de arriba)

**Escenario.** CFDI de refacciones de **$23,200**, timbrado, `estadoSat:
'vigente'`, `formaPago: '99'` (Por definir — la compra a crédito normal en
México), sin REP (`pagadoEn` vacío):

- `cubetaDe` → `'por_confirmar'` por la tercera rama (`engine.ts:393`);
  `totalPorConfirmar += 23,200` y el estatus baja a `revisar`.
- El bloque de deducibilidad de la MISMA pantalla imprime «Por confirmar
  $23,200.00» con la leyenda de `LEYENDA_PAGO_PENDIENTE`.
- `estadoRenglon` solo mira `tipos` (las diferencias). Para este gasto el motor
  **no emite ninguna**: `medioNoAdmitidoCombustible('99')` es `false` por
  decisión escrita (`engine.ts:196`) y `medio_pago_no_admitido` exige
  `formaPagoJuzgable !== undefined`, que con `'99'` sin REP no lo está
  (`engine.ts:812`). Con `tipos = []` la función cae hasta
  `if (g.estadoSat === 'vigente') return { estado: 'ok', etiqueta: 'CFDI vigente', validado: true }`
  → **pastilla verde con palomita**.

Entra: un comprobante a crédito de $23,200 → sale «CFDI vigente ✓» en verde en el
renglón y «Por confirmar $23,200.00» doce centímetros arriba, en la misma hoja.

**Consecuencia.** El contralor arma su papel de trabajo leyendo la tabla renglón
por renglón y se lleva como bueno un comprobante que el motor excluyó del
deducible.

**Intento de refutación.** No es CRÍTICO porque hay guardarraíles parciales y los
verifiqué: la columna «Forma de pago» del mismo renglón imprime «Por definir»
(`vista.tsx:152-157`), el bloque de deducibilidad sí lo dice, y los **otros tres**
consumidores sí llaman a la función (`liquidacion/pdf.ts:442`,
`analytics.ts:1591`, `api/export/poliza/route.ts:174`). El que no la llama es la
pantalla del detalle. Nada cambió desde la 24.

**Causa raíz probable:** el arreglo de la 18-c3 cerró la divergencia **importando
las dos listas** en vez de llamar a `cubetaDe`; una prueba construida sobre
`TipoDiferencia` no puede ver un criterio que no es un `TipoDiferencia`.

---

### [ALTO] Las dos salidas de liquidaciones no coinciden ni en qué acepta `?revision=` ni en qué devuelven sin parámetro (REINCIDENTE, verificada sin cambios)

`src/app/api/export/liquidaciones/periodo.ts:71-73` (7 valores, default `sin_rechazadas`) ·
`src/app/api/export/liquidaciones/route.ts:122-124` (cómo lo aplica) ·
`src/app/api/v1/liquidaciones/route.ts:41-43` (6 valores, default `firmadas`) ·
`src/app/api/v1/liquidaciones/route.ts:112-124` (`leerFiltroRevision`, la segunda función con el MISMO nombre) ·
`src/app/api/v1/liquidaciones/route.ts:136-137` (cómo lo aplica) ·
`src/lib/likida/revision.ts:9` («este archivo es el ÚNICO lector/escritor de `liquidacion.revision`»)

**Escenario.** Un tenant con 100 liquidaciones del mes: 60 `aprobada`, 10
`ajustada`, 25 `pendiente`, 5 `rechazada`.

- Tesorería: `GET /api/export/liquidaciones?desde&hasta` sin `revision` →
  `q.neq('revision','rechazada')` → **95 filas**, con las 25 que nadie firmó.
- El ERP: `GET /api/v1/liquidaciones` sin `revision` → `firmadas` → **70 filas**.
- El integrador que copió el valor del CSV y prueba
  `/v1/liquidaciones?revision=sin_rechazadas` se lleva **400 `parametro_invalido`**:
  el valor existe en una puerta del producto y no en la otra.

**Consecuencia.** El contralor cuadra el CSV contra el ERP y le faltan 25
liquidaciones sin que nada lo explique; o paga sobre 25 que esperan firma —el
caso que la 0299 se escribió para impedir—. Para quien mantenga: el mismo nombre
de función, el mismo nombre de parámetro, dos vocabularios que no se pueden
cambiar juntos.

**Intento de refutación.** Los dos filtros VIAJAN en la respuesta (nombre de
archivo + encabezado en el CSV; `filtro.significado` en el JSON), lo cual evita el
silencio. Y verifiqué que el archivo que se declara único punto de acceso a la
columna **no lo es**: `grep -l "from('liquidacion')"` sobre los archivos que
mencionan `revision` da exactamente tres — `revision.ts`,
`export/liquidaciones/route.ts` y `v1/liquidaciones/route.ts`.

**Causa raíz probable:** dos ramas contestaron por separado «¿qué es seguro
pagar?» y ninguna supo de la otra.

---

### [ALTO] Nada ata `FIRMA` (quién aprueba una liquidación) con `TIMBRA` (quién emite el CFDI): los dos conjuntos pueden separarse y la suite entera se queda verde — medido

`src/lib/likida/revision.ts:45` (`const FIRMA`) ·
`src/lib/likida/revision.ts:36-38` (el comentario que afirma «*Mismo criterio que `puedeTimbrar` … el DUEÑO y el CONTADOR, sí; el ENCARGADO no*») ·
`src/lib/auth/permisos.ts:35` (`const TIMBRA`) ·
`src/lib/auth/permisos.ts:52` y `:65` (los dos únicos asertos del árbol sobre esto: `expect(puedeTimbrar('encargado')).toBe(false)`) ·
`src/lib/likida/revision.ts:47` (`puedeFirmarLiquidacion`, **cero apariciones en cualquier `*.test.ts`** — lo verifiqué con `grep -rn puedeFirmarLiquidacion src/`: 4 resultados, ninguno en una prueba) ·
`src/types/likida.ts:166` y `src/lib/likida/revision.ts:31` (la MISMA unión de cuatro valores declarada dos veces)

**Escenario, y lo medí en vez de razonarlo.** Durante esta ronda el árbol de
trabajo tuvo, transitoriamente, `FIRMA` con un cuarto miembro:
`new Set(['superadmin','flota_admin','contador','encargado'])` — es decir, la
divergencia exacta que la 24 predijo por escrito («*el día que se decida que el
`encargado` sí puede firmar pero no timbrar, hay que tocar dos archivos*»). Con esa
línea puesta corrí `npx vitest run src/lib/likida/revision.test.ts
src/lib/auth/permisos.test.ts src/lib/auth/visibilidad.test.ts` (11:15:10):
**168 pruebas pasaron, 0 fallaron.** Ni una sola prueba del repo compara los dos
conjuntos, y `permisos.test.ts` sigue jurando que el encargado no timbra mientras
el otro archivo dice que sí firma.

Entra: alguien mueve un permiso de dinero en el archivo donde vive el permiso de
dinero → sale: el producto con dos respuestas a «¿quién autoriza el pago al
chofer?», el comentario de `revision.ts:38` afirmando la contraria, y **el CI en
verde**.

**Consecuencia.** Para el equipo que mantenga esto: el permiso que autoriza un
pago a un tercero es el sitio del producto donde menos puede haber dos verdades, y
es de los pocos que ninguna prueba cruza. Para el contralor: el día que las dos se
separen, quién puede firmarle una liquidación depende de cuál de los dos archivos
leyó el que hizo el cambio.

**Intento de refutación — y por qué esto no es CRÍTICO.** Busqué la defensa y la
hay, en profundidad: `app/dashboard/[id]/page.tsx:75` rebota al `encargado` de la
pantalla entera (`if (!puedeVerArea(rol,'dinero')) redirect(...)`) y el server
action re-gatea con **las dos** condiciones (`page.tsx:210`:
`!puedeVerArea(s.rol,'dinero') || !puedeFirmarLiquidacion(s.rol)`). O sea: en
`HEAD` no hay daño hoy, y con la divergencia puesta tampoco lo habría —
`puedeVerArea` la ataja—. Lo que está roto es el mecanismo, no el resultado: el
daño lo contiene un archivo tercero que nadie declaró como la defensa, y
`puedeFirmar` en `page.tsx:198` **sí** cambiaría (se pintarían los botones de
firma a quien la petición va a rechazar).

**Causa raíz probable:** `revision.ts:43-44` lo admite por escrito («*Vive aquí y
no en `permisos.ts` porque es el permiso de ESTA función; el día que se consolide,
se mueve*»). La consolidación no llegó y no hay nada que avise cuando haga falta.

*(REINCIDENTE: la 24 lo reportó como BAJO diciendo «hoy los dos conjuntos son
idénticos… se reporta porque es el patrón exacto que este rubro persigue». Sube a
ALTO porque ahora está medido que separarlos es invisible.)*

---

### [MEDIO] El mismo cálculo de «cuál papel de la unidad vence antes y en cuántos días» vive en 4 sitios, anclado a dos días distintos, y los tres papeles se nombran en 4 vocabularios (REINCIDENTE, y creció)

`src/lib/likida/operacion.ts:159` (`getUnidades(tenantId, hoy = new Date())`) y `:181` (`const base = Date.UTC(hoy.getUTCFullYear(), …)` — ancla **UTC**) ·
`src/lib/likida/operacion.ts:187-191` (los tres nombres **tecleados a mano**, no `PAPELES_UNIDAD`) ·
`src/lib/likida/administracion.ts:1261-1283` (`papelMasProximo`: `diasEntreIso(hoy, iso)` con `hoy` = día de **México**, y `PAPELES_UNIDAD[i]`) ·
`src/lib/likida/briefing_inicio_wa.ts:184-195` (tercer recorrido de la misma terna, día de México) ·
`supabase/migrations/0298_*` (`unidades_registro_tenant`, el cuarto, en SQL) ·
`src/app/dashboard/inicio-operacion.tsx:101` (`getUnidades(tenantId)` — **sin `hoy`**) contra `src/app/dashboard/unidades/page.tsx:78-81` (`getUnidadesRegistro(tenantId, hoyMx(...))`) ·
`src/lib/likida/administracion_aud24.test.ts:59` (el test que dice cruzar las dos implementaciones y nunca llama a `getUnidades` — verificado con `grep`: 3 menciones, todas en comentarios y nombres de `it`)

**Escenario.** Un tracto cuya póliza vence **2026-09-03**, a las **19:00 del
2026-09-02 en CDMX** (= 2026-09-03T01:00Z; México no cambia de horario desde 2022,
así que la ventana es 18:00–24:00 **todos los días**):

- `/dashboard` (Inicio) llama `getUnidades(tenantId)` sin `hoy` →
  `base = Date.UTC(2026, 8, 3)` → `dias = 0` → **«Póliza: vence HOY»**.
- `/dashboard/unidades` llama con `'2026-09-02'` →
  `diasEntreIso('2026-09-02','2026-09-03') = 1` → **«Póliza: vence mañana»**.

Con la póliza del 2026-09-02 el desfase cambia de color: **«vencida ayer»** (rojo,
cuenta en `vencidos`) contra **«vence HOY»** (ámbar, cuenta en `porVencer`). El
mismo desfase sale por `/v1/unidades` (`route.ts:119`) y por la herramienta MCP
(`lib/mcp/herramientas/unidades.ts:15`), que también llaman sin `hoy`.

**Lo que creció desde la 24:** los mismos tres papeles se nombran ahora en cuatro
sitios y **ya divergieron textualmente** —
`vigencias.ts:90` `PAPELES_UNIDAD = ['Póliza','Permiso SICT','Verificación']`;
`operacion.ts:187-191` los mismos tecleados a mano;
`relojes_legales.ts:384-390` `ROTULO_DOC` = `poliza: 'Póliza de la unidad'`,
`verificacion: 'Verificación físico-mecánica'`;
`reglas/catalogo.ts:73-78` `ROTULO_DOCUMENTO` = `poliza: 'póliza'`,
`verificacion: 'verificación físico-mecánica'`, con el comentario de `:70` que
afirma «*Mismo texto que `ROTULO_DOC`*» y no lo es.

**Consecuencia.** El gerente ve «2 unidades vencidas» en el Inicio y abre el
Registro, que le lista una. Cada tarde, sobre el dato que decide si un tracto sale
a carretera.

**Intento de refutación.** El SQL de la 0298 (`least(…)`, `< p_hoy`,
`<= p_hoy + p_dias_aviso`) sí concuerda con `papelMasProximo`; el que va solo es
`getUnidades`. Y el comentario de `administracion.ts:1196-1202` que declara la
equivalencia sigue siendo falso en sus dos mitades.

**Causa raíz probable:** el segundo lector se escribió para paginar en la base y,
en vez de mover el cálculo, lo rehizo.

---

### [MEDIO] Tres respuestas a «¿la base va a la par del código?», dos de ellas copias de la misma aritmética, y la que bloquea el despliegue es la más débil (REINCIDENTE, verificada sin cambios)

`src/app/api/health/migracion.ts:78` (`const atras = Math.max(0, Number(codigo) - Number(base))`) ·
`scripts/ci/compuerta-deploy.mjs:79-85` (la MISMA aritmética, segunda copia, en otro lenguaje, y es la que decide si Vercel construye) ·
`src/lib/likida/agentes/ingenieria.ts:704-724` (G4 «prefijos chocados» y G5 «huecos de numeración» — la única que mira la lista completa, y corre en el parte diario, no en la puerta)

**Escenario, remedido hoy.** `ls supabase/migrations | wc -l` → **281 archivos**, y
el prefijo más alto es **0303**: hay **22 números que nunca existieron**. La
comparación es **máximo contra máximo**, así que:

- Con producción en `0276`, la compuerta imprime «faltan **27** migración(es)
  (0277..0303)» y manda a aplicar un rango cuyo primer archivo no existe.
- Peor, y es el modo de falla de verdad: si una rama cortada abajo aterriza mañana
  con `0295_*.sql` y producción ya está en `0303`, entonces `base = '0303'`,
  `codigo = '0303'`, `atras = 0`, `/api/health` verde y la compuerta responde «base
  0303 a la par del código 0303: se construye» — **con la migración sin aplicar**.

**Consecuencia.** La compuerta se escribió fail-closed («un cotejo que no pudo
hacerse no es un cotejo verde») y en este caso concreto es fail-**open**: publica
código que le pide a la base algo que no está. Y para cambiar la regla hay que
tocar dos archivos, uno `.ts` y uno `.mjs`.

**Intento de refutación.** Sí existe la comprobación buena (G5 sobre la lista
completa) y por eso es MEDIO y no ALTO; pero corre en el parte diario de Javier,
no en la puerta, y su propio texto declara que «este servidor no tiene el repo y NO
puede distinguir» un hueco real de un número que nunca existió — que es
exactamente la información que la compuerta sí tiene, en `supabase/migrations/`, y
no usa.

**Causa raíz probable:** el cotejo se definió como «el número más alto» en vez de
«el conjunto de nombres».

---

### [BAJO] `procesarTurno` sigue en **3,096 líneas** (REINCIDENTE, cuarta ronda seguida; esta vez no creció)

`src/lib/likida/processor.ts:1308-4403`. Lo remedí con un barrido de columna 0:
entre la línea 1308 (`async function procesarTurno(...)`) y la 4403 (el `}` final
del archivo) **no hay ninguna otra declaración de nivel superior**. 4403 − 1308 + 1
= **3,096**. El archivo entero son 4,403 líneas.

**Escenario.** No es un bug de hoy, es el costo de cambiar: cualquier arreglo en el
turno de WhatsApp —el camino por el que entra el 100% del producto— se hace dentro
de una función que no cabe en pantalla y no se puede probar por partes.

**Consecuencia.** El equipo paga la revisión completa por cada línea que toque.

**Lo honesto:** dejó de crecer (2,913 → 3,096 en la 24 → 3,096 hoy). Pero no creció
porque nadie lo tocó en estos 7 commits, no porque se haya extraído nada: ninguna
ronda ha sacado un solo paso del turno.

---

### [BAJO] `repo_paginado.ts` declara un contrato en su encabezado que su propia tercera función rompe (REINCIDENTE, verificada sin cambios)

`src/lib/likida/repo_paginado.ts:10-13` («**NINGUNA** de estas funciones LANZA por
un fallo de lectura … el fallo se atrapa aquí y viaja en `error`») ·
`src/lib/likida/repo_paginado.ts:247` (`if (error) throw new Error(error.message)`) ·
`src/lib/likida/repo_paginado.ts:265` (`if (!errOp && porOperador)` — el segundo
fallo se descarta sin dejar rastro)

**Escenario.** El operario del combo «Adjuntar a…» busca «Ramírez» para pegarle un
comprobante huérfano a su viaje. La primera consulta (por folio) devuelve 0 filas;
la segunda (por nombre de operador, `:252-263`) **falla** —timeout del pooler—.
`errOp` es truthy, el `if` no entra, y la función devuelve la lista vacía de la
primera consulta. La pantalla dice «sin resultados» y el operario concluye que el
viaje no existe.

**Consecuencia.** Para el equipo: el encabezado del módulo es lo que un autor nuevo
va a creer y ya no describe el módulo. Para el usuario: la única ruta de este
archivo que puede quedarse callada es la que decide a qué viaje se adjunta un
comprobante huérfano.

**Causa raíz probable:** el archivo nació con dos funciones que cumplían el
contrato y la tercera se agregó después, con otra forma, sin actualizar el
encabezado.

---

### [BAJO] Cuatro copias de `ROL_LABEL` que ya divergieron —dos siguen nombrando un rol retirado en la 0086— y una copia privada de un `PILL_ESTATUS` que está exportado tres archivos más allá

`src/app/admin/equipo/page.tsx:16-22` (`Record<RolAppUser, string>`, exhaustivo: 5 roles, con `vendedor`, sin `operador`) ·
`src/app/admin/mi-perfil/page.tsx:10-12` (`Record<string,string>`: con `operador: 'Operador / Chofer'`, **sin** `vendedor`) ·
`src/app/dashboard/mi-perfil/page.tsx:18-24` (idéntico al anterior: con `operador`, sin `vendedor`) ·
`src/app/dashboard/sesiones-mcp/vista.tsx:19-23` (3 roles: **sin** `superadmin` ni `vendedor`) y `:102` (`ROL_LABEL[s.rol] ?? s.rol`) ·
`src/app/dashboard/resumen-visual.tsx:103-107` (`export const PILL_ESTATUS`) contra `src/app/dashboard/viajes/vista.tsx:31-35` (la misma tabla `liquidado/en_cuadre/abierto`, privada, sin importar la exportada)

**Escenario.** El superadmin entra en modo soporte a `/dashboard/sesiones-mcp`
(área `administracion`, `visibilidad.ts:246`) para ver qué clientes MCP están
conectados. La sesión creada por su propio usuario se pinta como
«javier@… · **superadmin**» —la clave cruda de la base—, mientras la misma persona
en `/admin/equipo` sale como «Superadmin» y en `/dashboard/mi-perfil` también.
Tres pantallas, tres respuestas al mismo dato. Y el rol `operador`, retirado del
dominio de `app_user.rol` en la migración 0086, sigue teniendo nombre de pantalla
en dos archivos: vocabulario muerto que un autor nuevo va a leer como vigente.

**Consecuencia.** No mueve una cifra, y por eso es BAJO. Es el costo de cambiar: el
día que entre un sexto rol hay que tocar cuatro archivos, y **solo uno de los
cuatro** (`admin/equipo/page.tsx`, que está tipado `Record<RolAppUser, string>`)
hará que TypeScript avise si se olvida. Los otros tres caen a `?? s.rol` en
silencio — que es exactamente lo que hoy ya les pasa con `vendedor`.

**Causa raíz probable:** el patrón de este repo es «mapa literal privado por
pantalla». Funciona mientras el mapa sea de presentación; deja de funcionar cuando
el mapa enumera un dominio de la base, porque el dominio cambia por migración y el
mapa no.

---

## El patrón, contado

La 24 dijo que 4 de sus 7 críticos eran la misma forma —*dos lugares que calculan
lo mismo y ya no coinciden*— y que arquitectura llevaba cinco rondas firmándolo.
Lo conté hoy, con línea, y son **9**:

| # | La verdad duplicada | Sitios | ¿Ya divergió? |
|---|---|---|---|
| 1 | La proporción de LIVA 5-I | `engine.ts:726/1448`, `engine.ts:493`, `fiscal.ts:806` | **Sí** ($16,000 vs $0) |
| 2 | En qué cubeta cae un gasto | `engine.ts:388`, `vista.tsx:199` | **Sí** (verde vs por confirmar) |
| 3 | Qué revisiones son «pagables» | `periodo.ts:71`, `v1/liquidaciones/route.ts:41` | **Sí** (95 vs 70 filas) |
| 4 | Quién firma dinero | `permisos.ts:35`, `revision.ts:45` | No, y nada lo impide |
| 5 | `RevisionLiquidacion` | `types/likida.ts:166`, `revision.ts:31` | No |
| 6 | Qué papel vence antes | `operacion.ts:181`, `administracion.ts:1261`, `briefing_inicio_wa.ts:184`, mig. 0298 | **Sí** (UTC vs México) |
| 7 | Cómo se llaman los 3 papeles | `vigencias.ts:90`, `operacion.ts:187`, `relojes_legales.ts:384`, `reglas/catalogo.ts:73` | **Sí** (texto) |
| 8 | ¿La base va a la par del código? | `migracion.ts:78`, `compuerta-deploy.mjs:79`, `ingenieria.ts:704` | **Sí** (max vs conjunto) |
| 9 | El rótulo de un rol / de un estatus | 4 × `ROL_LABEL`; `resumen-visual.tsx:103` vs `viajes/vista.tsx:31` | **Sí** (`vendedor`, `superadmin`) |

Seis de las nueve **ya divergieron**. Ninguna se cerró en esta ronda.

---

## Lo que revisé y está bien

- **El motor sigue puro, medido transitivamente.** `cuadre/engine.ts:11-22`
  importa 10 módulos; abrí los diez y ninguno tiene `supabase`, `fetch(` ni
  `node:*` (el único acierto del grep, `formato.ts:141`, es un comentario). Nada
  se movió desde la 24.
- **`REVISAR` sigue DERIVADA, no copiada** (`cuadre/engine.ts:371`:
  `[...new Set([...NO_DEDUCIBLE_ISR, ...POR_CONFIRMAR, ...REVISAR_OPERATIVO])]`), y
  `cuadre/contencion_listas.test.ts` sigue exigiendo las contenciones. Corrí el
  archivo: verde. ARQ-1 sigue cerrado — es lo que sostiene la nota en 4 y no menos.
- **La frontera de datos sigue exactamente en su techo.** Reimplementé el barrido
  de `frontera_datos_guardiana.test.ts:74-80` fuera de vitest y da **exactamente
  251** archivos de producción con `.from(`/`.rpc(` fuera de `repo.ts`/`pg.ts` — el
  número congelado. `repo.ts` dejó de ser la frontera hace cuatro rondas, pero está
  escrito, medido y con trinquete, que es lo contrario de estar oculto.
- **`otro: 'Gasto'` / `otro: 'Otro'` —el ejemplo canónico— sigue cerrado por
  mecanismo.** `etiquetas_sincronizadas.test.ts:42-88` barre **todo `src/`**
  buscando el PATRÓN `const CONCEPTO(_LABEL)?` y compara cada mapa contra el motor.
  Corrí el archivo: verde. El PDF sigue sin mapa propio (`liquidacion/pdf.ts:14`
  importa `etiquetaConcepto`). Busqué mapas que escapen al patrón por nombre
  distinto y el único es `reglas/catalogo.ts:87` (`ROTULO_CONCEPTO`), que es
  `Record<ConceptoGasto, string>` —TypeScript exige la cobertura— y es un registro
  deliberadamente distinto (dentro de una frase: «casetas», «otros gastos»). No es
  divergencia.
- **`src/lib/utils.ts`: el código muerto retirado en `aa5304d` estaba muerto de
  verdad.** Comprobé las tres cosas: `grep -rn "\bcn(" src/` no encuentra una sola
  llamada (solo dos comentarios que la mencionan), `package.json` ya no lista
  `clsx` ni `tailwind-merge`, y los 19 consumidores de producción de `@/lib/utils` importan solo
  `usd`/`mxn`/`numero`/`fechaMx`, que el archivo reexporta desde `formato.ts`.
  `utils_fecha.test.ts:56` documenta y protege ese contrato. Salvedad menor, no
  hallazgo: `formato.ts:5` y `dashboard/formato.ts:19-20` siguen explicando la
  arquitectura con «*`utils.ts` importa `clsx` y `tailwind-merge`*», que ya no es
  cierto — el razonamiento (formato sin dependencias) sigue siendo bueno, la
  premisa citada ya no existe.
- **`graduarAgente` es reuso de verdad, no una tercera copia.**
  `agentes/definiciones.ts:174-195` no repite `darDeAltaAgente`
  (`:150-171`): es un `UPDATE … .select('id').maybeSingle()` con su propio candado
  («si no hay fila, `DatoInvalido`: graduar algo que no existe sería una fila
  fantasma en la bitácora»). Lo único compartido es el criterio best-effort de
  `anotarBitacora`, que es una llamada a la misma función, no una copia. El commit
  decía la verdad.
- **El catálogo de agentes no puede prometer un motor que no existe.**
  `agentes/runner.ts:206-217` construye `AGENTES_DESPACHABLES` **de las mismas
  constantes que usa el despacho**, no de una lista paralela, y el agente
  `auditor_codigo` la importa para cruzar el artefacto desplegado contra lo que la
  base declara `vivo`. Sobre eso, `runner.ts:682` (candado 1, kill switch
  declarado en código) y `:698` (candado 2, `experimental`) hacen que un agente
  nacido como fila desde `/admin` no pueda correr por accidente. Fui a buscar aquí
  un hallazgo y no lo hay.
- **`normas/indice.ts` vs `normas/corpus.ts` (el símbolo `NORMAS` duplicado)** está
  declarado deliberado en la migración 0303 y cada representación trae su prueba de
  sincronización. Lo miré por el nombre repetido; no es el patrón.
- **Las dependencias que apuntan al revés (`lib` → `app`) son dos y son inertes.**
  `likida/oficina_wa.ts:7` → `@/app/api/dashboard/chat/tope` y
  `lib/mcp/credencial.ts:20` → `@/app/api/v1/_comun`. Las abrí esperando un
  hallazgo: `chat/tope.ts` es un módulo de helpers extraído de la ruta a propósito
  (su encabezado lo explica: para que el widget del sidebar lea el MISMO tope que
  frena al endpoint) y no importa nada de Next. La dirección es fea; el escenario
  de falla que este rubro exige no lo pude construir, así que no va como hallazgo.
- **`filasDeducibilidad`** (`liquidacion/deducibilidad.ts:35-104`) es el
  contraejemplo bueno del rubro: **no** recalcula nada, importa `pagoPendiente` y
  `LEYENDA_PAGO_PENDIENTE` del motor, y tiene un portón explícito
  (`:63-65`: si las tres cubetas no suman `totalComprobado` ±$0.015, devuelve
  `null` y la pantalla se calla en vez de contradecirse). `analytics.ts:1513-1533`
  aplica el mismo portón a su reconstrucción, por escrito y por la misma razón.
- Corrí, en modo lectura, `frontera_datos_guardiana`, `contencion_listas`,
  `etiquetas_sincronizadas`, `formato`, `administracion_aud24`, `revision`,
  `permisos` y `visibilidad`: **260 pruebas, todas verdes**.

---

## Lo que NO alcancé a revisar

- **`procesarTurno` por dentro.** Medí su tamaño (3,096) y no leí sus 3,096
  líneas. Si adentro hay una tercera copia de una regla de dinero —que es
  exactamente donde el patrón de este rubro se escondería mejor— no la vi.
- **Las 22 migraciones nuevas leídas de punta a punta.** Conté archivos y prefijos
  y abrí la 0301/0303 por la superficie nueva; no crucé qué funciones SQL
  redefinen `create or replace` entre 0272 y 0303, que es donde la 24 encontró el
  accidente 0283/0299. `supabase/verificaciones.sql` (249 bloques) no lo abrí.
- **`src/app/**` completo.** Corrí un detector de nombres duplicados de nivel
  superior sobre los 819 archivos de producción y trabajé los ~10 candidatos con
  semántica de dominio (`PILL_ESTATUS`, `ROL_LABEL`, `FASE_LABEL`, `COLUMNAS`,
  `FILTROS`, `DIA_MS`, `UUID_RE`, `diasEntre`, `sumarDias`, `lunesDe`). Los
  ~60 restantes —casi todos componentes de UI repetidos (`Boton`, `CAMPO`,
  `Kpi`, `Aviso`) — los descarté por inspección de nombre, no de contenido. Y no
  corrí ningún detector de clones por contenido: el de la 24 (ventana de 14 líneas
  normalizadas) marcó 4 formas de `/dashboard/*/forma.tsx` que comparten
  estructura, y sigue sin evaluarse si esa duplicación ya divergió en validación.
- **`sat_descarga/*` contra `facturacion/*`** — dos módulos sobre el mismo dominio
  de comprobantes, sin comparar sus lectores de CFDI entre sí. Sigue pendiente
  desde la 24.
- **`lib/mcp/herramientas/*` contra `/v1/*`** — los dos exponen el mismo dominio a
  sistemas ajenos. Solo verifiqué el caso de `unidades` (los dos llaman
  `getUnidades` sin `hoy`, que es el hallazgo MEDIO de arriba); no crucé
  liquidaciones, viajes ni clientes.
- **No corrí la suite completa** (la compuerta ya salió verde con 10,950 pruebas
  antes de esta ronda y tarda 3 minutos); solo los 8 archivos citados arriba.
