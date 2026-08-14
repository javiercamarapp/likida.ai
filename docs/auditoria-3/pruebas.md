# Pruebas — auditoría 3

**Nota: 5/10** (antes 6). Razón del movimiento: **deuda que cobró factura + mirada
más profunda**. La suite creció y el CI mejoró de verdad (`branches: ['**']`:
ahora corre en cada push de cada rama, que antes no pasaba). Pero los tres ALTOS
heredados del pase 1 siguen los tres vivos —los 8 fixers en paralelo no dejaron
commit— y, sobre todo, esta ronda **cerré a mano el chequeo que define el rubro** y
uno de los seis CRÍTICOS de la ronda está anclado por una prueba que **probé
empíricamente que sigue verde con la función revertida**. Un CRÍTICO marcado
CERRADO sobre una prueba que no prueba nada es peor que un CRÍTICO abierto: el
abierto todavía está en la lista.

**El riesgo mayor, hoy:** `54e0648` (REND-C1) está en `00-ESTADO-RONDA.md` como
"6/6 CERRADOS ✅" y su ancla es decoración demostrada — la concurrencia de
`enLotes` se puede revertir a serial y las tres pruebas del archivo pasan.

---

## Hallazgos

### [CRÍTICO] La prueba de `enLotes` (REND-C1) es decoración: pasa con la función revertida a serial

`src/lib/likida/lotes.test.ts:5` · `it('nunca corren más de N a la vez, y el orden
de salida es el de entrada')` — y las otras dos del archivo.

**Escenario (ejecutado, no supuesto).** Reimplementé `enLotes` como el bucle
serial que REND-C1 vino a eliminar (`for (const item of items) { try {
salida.push({ok: await fn(item)}) } catch ... }`) y corrí las siete aserciones del
archivo tal cual:

```
VERDE expect(pico).toBeLessThanOrEqual(3)  → pico real = 1
VERDE orden de salida
VERDE r[0] === {ok:1}   VERDE r[1].error.message === boom   VERDE r[2] === {ok:3}
VERDE vacío → vacío     VERDE tamaño 0 lanza «≥ 1»
```

Las tres `it(...)` verdes. La causa es la forma de la aserción: `pico` se compara
solo contra un **techo** (`toBeLessThanOrEqual(3)`), nunca contra un **piso**. Un
lote serial da `pico = 1`, que cumple el techo. El orden de salida y el
best-effort por elemento también los cumple la versión serial —son propiedades
que la versión rota ya tenía—. La única propiedad que `enLotes` existe para
garantizar, que corran N a la vez, no tiene una sola aserción.

**Consecuencia.** El commit dice textual «enLotes es helper compartido con prueba
propia (pico de concurrencia acotado…)» y sobre esa frase el orquestador marcó
REND-C1 cerrado. Si alguien simplifica `enLotes` a un `for await` —la
simplificación más natural que existe, y la que un `/simplify` propondría— el
consolidado vuelve a los ~300 s contra `maxDuration=120`, muere a la mitad y deja
gastos sellados sin su fila de línea (el modo de corrupción original), con la
suite verde y el CI verde.

**Causa raíz probable.** Se probó el contrato defensivo del helper (techo, orden,
best-effort) y no la propiedad de rendimiento que motivó escribirlo.

---

### [ALTO] Los tres embeds `viaje↔operador` siguen sin ancla — 15 `select` de producción cuelgan de un alias que ninguna prueba mira (REINCIDENTE)

`src/lib/likida/escalar_viaje.test.ts:143` (`const args = (metodo) => …`) y
`:150` (`it('pide solo los abiertos, sin aceptar, sin escalar y ya avisados')`) ·
sitios: `escalar_viaje.ts:90`, `avisar_cierre.ts:59`, `agentes/cobranza.ts:107` y
`:348`.

**Escenario.** El arnés de `escalar_viaje` registra **todos** los métodos de la
cadena en `filtros` —incluido `select`, en la línea 78— y luego solo consulta
`args('eq')`, `args('is')`, `args('not')`, `args('lte')` y `args('limit')`.
`args('select …')` no se consulta nunca. Cambia
`operador:operador_id(nombre, telefono)` → `operador(nombre, telefono)` en
`escalar_viaje.ts:90` y las seis `it(...)` del `describe('viajesSinAceptar')`
siguen verdes: el mock devuelve `lectura` sin mirar la cadena, y quien rechaza el
embed ambiguo es PostgREST, que en la suite no existe. Verifiqué que **ninguna**
prueba del repo menciona `operador:operador_id` ni `viaje:viaje_id`
(`grep -rn … --include=*.test.ts` → 0 resultados) y que no existe archivo de
embeds. Hay **15** `select` de producción sobre los pares con doble FK de la 0075.

**Consecuencia.** Es literalmente el bug que ya se pagó dos veces el 14-ago:
página de Cobranza con error boundary, cron de escalación cayendo en silencio
~216 corridas, aviso de cierre roto. La tercera vez costará lo mismo y la suite
volverá a decir que todo está bien.

**Causa raíz probable.** El arnés valida los filtros (donde vive el error de
negocio) y no la proyección (donde vive el error de esquema). REINCIDENTE: PR-A1
del pase 1, sin tocar.

---

### [ALTO] Rename a medias `CUADRA_COBERTURA` → `LIKIDA_COBERTURA`: el skip está muerto y su propio centinela no lo detecta (REINCIDENTE)

`vitest.config.ts:35` (`env: { CUADRA_COBERTURA: CON_COBERTURA ? '1' : '' }`) ·
`src/lib/likida/normas/fundamento.test.ts:148` y
`src/lib/likida/duplicados.test.ts:151`
(`it.skipIf(process.env.LIKIDA_COBERTURA === '1')`) ·
`src/lib/likida/pruebas_en_ci.test.ts:43` y `:51` ·
`.github/workflows/ci.yml:60,73`.

**Escenario.** Lo único que exporta la bandera es `vitest.config.ts:35`, y exporta
`CUADRA_COBERTURA`. Nada en el repo asigna `LIKIDA_COBERTURA` (verificado por
grep en todo el árbol). Entonces `process.env.LIKIDA_COBERTURA === '1'` es
**siempre falso** y las dos pruebas de tiempo **corren instrumentadas** en el paso
`npm run test:coverage` de CI — exactamente el modo que su autor declaró inválido
(«el umbral mediría la instrumentación y no el algoritmo»). Para `duplicados` el
cociente instrumentado es ~9 contra un umbral de 20: el margen se reduce a menos
de la mitad, en la prueba que el propio archivo documenta que **ya se cayó dos
veces** por ruido (10.8 y 8.2 el 28-jul). Es una intermitencia latente en el
camino del dinero (el deduplicador de CFDI).

Y lo que lo hace ALTO en vez de MEDIO: `pruebas_en_ci.test.ts:51` existe
precisamente como centinela —«hay pruebas que se saltan (si no, esta red sobra y
hay que borrarla)»— y **no lo detecta**, porque busca la cadena
`skipIf(...LIKIDA_COBERTURA)` en el texto, no que la bandera se salte de verdad.
Encuentra 2 archivos, `expect(saltadas.length).toBeGreaterThan(0)` pasa, y el
centinela escrito para avisar que la red murió certifica que está viva. Los
comentarios de `ci.yml:60` y `:73` siguen citando el nombre muerto.

**Consecuencia.** Dos guardias de ReDoS/crecimiento no lineal corriendo en el
modo en que sus umbrales no significan nada, y el paso «Pruebas de tiempo (sin
cobertura)» de CI es trabajo duplicado que ya no recupera nada.

**Causa raíz probable.** El rename de marca tocó los consumidores y no el
productor, y el centinela vigila el nombre en vez del efecto. REINCIDENTE: PR-A2.

---

### [ALTO] REND-C2: de las tres piezas del arreglo, solo una está anclada — y el `DELETE` sobre la bitácora es la que no

`src/lib/likida/agentes/cobranza.ts:208-212` (el rescate de claims huérfanos) y
`:299-315` (`PLAZO_COBRANZA_GLOBAL_MS` / `ejecutarCobranzaGlobal`) ·
`src/lib/likida/agentes/cobranza_reloj.test.ts` (tres `it`, todas sobre
`ejecutarCobranza`).

**Escenario.** El commit `bb7e228` declara tres piezas. La prueba cubre la (1). La
(3) es un `DELETE` real sobre `cobranza_contacto` acotado por cuatro filtros
(`tenant_id`, `enviado=false`, `detalle is null`, `created_at < ahora−1h`). El
mock de `cobranza_reloj.test.ts:27` declara `delete: chain, is: chain, lt: chain`
—los tres son no-ops encadenables— y ninguna aserción los mira. Quita
`.is('detalle', null)` de la línea 211: el `DELETE` empieza a borrar las filas
legítimas de sin-teléfono y de envío rechazado, que la página enseña como
bitácora, y el tier se reintenta cada hora contra el mismo chofer. Suite verde.
Quita `.lt('created_at', …)` de la 212: se borran claims puestos **segundos**
antes por una corrida solapada y dos crons mandan el mismo mensaje al mismo
chofer. Suite verde. Quita `.eq('tenant_id', tenantId)`: se borra la bitácora de
todas las flotas. Suite verde.

La pieza (2) tampoco tiene arnés: `ejecutarCobranzaGlobal` solo aparece
**mockeada** en `api/cron/escalar/route.test.ts`; el reparto de los 90 s entre
flotas y el corte limpio entre tenants nunca se ejecutan en la suite.

**Consecuencia.** El único `DELETE` del camino del dinero que este repo hace sin
intervención humana, sobre la tabla que es el registro de a quién se le cobró y
cuándo, sin una sola aserción sobre sus filtros.

**Causa raíz probable.** La prueba se escribió contra el síntoma que motivó el
hallazgo (el reloj) y no contra las dos piezas que el mismo commit agregó.

---

### [ALTO] `proveedores.ts` (0091): el candado anti-carrera de la aprobación y el filtro por tenant no tienen una sola prueba

`src/lib/likida/proveedores.ts:71` (`guardarFacturaProveedor`), `:110`
(`listarFacturasProveedor`), `:143` (`decidirFacturaProveedor`) ·
`src/lib/likida/proveedores.test.ts` cubre solo los tres helpers puros
(`leerDescripcionPrimerConcepto`, `compararReceptor`, `aFilaExportProveedor`).

**Escenario.** `decidirFacturaProveedor` acota su `UPDATE` con
`.eq('id')`, `.eq('tenant_id', tenantId)` y `.eq('estado', 'pendiente')`. El
último es, según su propio docstring, «el candado anti-carrera: dos personas
decidiendo la misma factura — el segundo clic se entera, no pisa al primero».
Bórralo: el segundo clic sobrescribe `estado`, `decidido_por` y `decidido_en`,
la pantalla contesta OK, y la factura queda aprobada a nombre de quien la
rechazó. Borra `.eq('tenant_id')`: la flota A aprueba facturas de la flota B con
solo tener el UUID. En los dos casos la suite queda verde y `verificaciones.sql`
bloque 66 tampoco lo ve — ese bloque comprueba dedup, dominio de estado y RLS,
no el candado ni el acotamiento.

`guardarFacturaProveedor` escribe `sub_total`, `iva` y `total` de un CFDI de
proveedor; `listarFacturasProveedor` es lo que alimenta el CSV importable a SAP
B1 / CONTPAQi. Ninguna de las dos tiene prueba.

**Consecuencia.** El único agente de esta ronda cuyo entregable es un archivo que
entra a la contabilidad del cliente, con su decisión humana sin arnés.

**Causa raíz probable.** Se probó lo que era fácil de probar (funciones puras) y
se dejó fuera lo que necesitaba un mock de Supabase — el patrón inverso al que
`repo_escritura.test.ts` sí aplica bien para `addGasto` y `saveLiquidacion`.

---

### [ALTO] `c8bd2ac` (BE-C1) ancla el cinturón pero no el filtro, contra lo que afirma su commit

`src/lib/likida/agentes/cobranza.ts:116` (`.not('avisado_en', 'is', null)`) y
`:142` (`if (!v.avisado_en) continue;`) ·
`src/lib/likida/agentes/cobranza_cola.test.ts:45`.

**Escenario.** El commit dice: «Doble candado: el filtro en la consulta Y el
cinturón en el bucle, con prueba que alimenta la fila con forma de import
saltándose el filtro — **quitar cualquiera de los dos la pone roja**». La segunda
mitad es falsa. El mock de `cobranza_cola.test.ts:29` declara `not: chain` (no-op)
y devuelve las dos filas siempre. Por construcción, la prueba **no puede ver** el
filtro de la consulta: quitar `cobranza.ts:116` no cambia una sola aserción. Solo
el cinturón de la 142 está anclado.

**Consecuencia dos.** El filtro es el que gobierna `vigilados`
(`cobranza.ts:137`, `vigilados: viajes.length`, calculado **antes** del cinturón)
y ese número se pinta como KPI «Viajes vigilados» en
`agentes/cobranza/vista.tsx:63`. Revertido el filtro, el panel cuenta viajes
importados que el agente nunca va a contactar: un rótulo que deja de ser verdad,
en la pantalla de un agente que persigue choferes. La prueba asserta
`paraContactar` y `sinTelefono` y **no** `vigilados`.

**Causa raíz probable.** Un mock que encadena todos los métodos sin registrarlos
no puede distinguir «el filtro está» de «el filtro no está»; el commit asumió que
sí.

---

### [MEDIO] `importarViajes` — la escritura que originó BE-C1 no tiene arnés

`src/lib/likida/importar_viajes.ts:170` · `importar_viajes.test.ts` cubre solo
`leerCifraImportada`, `leerFechaImportada` e `interpretarFilasViajes`.

**Escenario.** La función lee los folios existentes, descarta los repetidos
(`nuevas = filas.filter(f => !existentes.has(f.folio))`), resuelve operadores por
nombre exacto e inserta en lotes de 100 con `anticipo: f.anticipo ?? 0`. Quita el
filtro de dedup: subir el mismo export del TMS dos veces crea 2× viajes con 2×
anticipo, y todo lo que suma anticipo en el panel (KPIs, rentabilidad, cuadre)
duplica. Suite verde. Rompe el corte de lotes (`i += 100` → `i += 1000`): el
timeout a mitad de un lote de 1,000 deja mitad y mitad sin decir cuál mitad, que
es el modo de falla que el comentario dice estar evitando. Suite verde.

**Consecuencia.** El camino por el que entra el histórico de un prospecto —cientos
de viajes con su dinero— sin una aserción sobre lo que escribe.

**Causa raíz probable.** Mismo patrón que proveedores: parsers probados, escritura
no.

---

### [MEDIO] El header de `cobranza.test.ts` cita un arnés manual que no existe (REINCIDENTE)

`src/lib/likida/agentes/cobranza.test.ts:7-9`: «Solo el motor PURO: claims,
envíos y bitácora se prueban con la verificación 64 de la base **y el arnés
manual** — un mock de Supabase probaría el mock.»

**Escenario.** `ls pruebas-manuales/` da 21 archivos y `grep -rln "cobranza"
pruebas-manuales/` da **cero**. Existen `e2e-fase2/3/3b/4/5`; la Fase 1 —que es
Cobranza (commit `3ace888`)— no tiene arnés. La verificación 64 sí existe y es
buena, pero cubre el `unique(viaje,tier)`, el CHECK de ventana, el deny-all y el
cascade: no cubre claims, envíos ni bitácora en el sentido del código TS.

**Consecuencia.** Es el mecanismo por el que una zona sin arnés se rate como
"cubierta por otro camino". Al pase 1 le costó exactamente eso: BE-C1 (CRÍTICO)
vivía en `colaCobranza`, que este header declaraba probada en otro lado.

**Causa raíz probable.** Se escribió la intención («habrá un arnés manual») como
si fuera un hecho. REINCIDENTE: PR-A3.

---

### [MEDIO] Las dos rutas de `/api/export` no tienen prueba de sus dos puertas, y la regresión que previenen está documentada

`src/app/api/export/facturas-proveedor/route.ts:26,31` y
`src/app/api/export/liquidaciones/route.ts` · sin `*.test.ts` en
`src/app/api/export/`.

**Escenario.** El docstring de la ruta nueva dice textual: «la lección
documentada del IDOR: se acota el tenant y se olvida el rol». Hay dos puertas —
`puedeVerArea(rol,'dinero')` y `puedeExportar(rol)`. `permisos.test.ts` prueba
los **predicados** en aislamiento; nada prueba que las **rutas** los llamen. Borra
las líneas 26-33 de `facturas-proveedor/route.ts` y un rol sin área de dinero se
baja el CSV de facturas de proveedor con todos sus importes. Suite verde:
`dinero_por_area.test.ts` es un escaneo de fuente sobre `src/app/dashboard/**`
(`page.tsx` + `vista.tsx`), no alcanza `src/app/api/**`.

**Consecuencia.** La regresión que la ruta cita como lección aprendida puede
volver sin que nada la detecte.

**Causa raíz probable.** El escaneo estructural que sí existe se acotó al panel;
las rutas de API quedaron fuera de su radio.

---

### [BAJO] Los guardianes de `formato.ts` fallan ABIERTO: si el `grep` no encuentra nada, pasan

`src/lib/formato.test.ts:191` y `:216` — ambos terminan en `|| true`.

**Escenario.** `execSync("grep -rl … src/ … || true")` corre en el módulo. Si el
comando falla por cualquier razón (CWD distinto, `grep` de BSD que no soporta
`\|`/`\s` en el patrón de `round2`, `src/` inexistente), el `|| true` traga el
exit code, `archivos` queda `[]`, `fuera` queda `[]` y la aserción
`toEqual([])` pasa **en verde**. No hay control positivo: nada exige que el grep
haya encontrado al menos `src/lib/formato.ts`, que sí contiene el literal.
Comprobé que hoy sí encuentra (8 y 3 archivos respectivamente, todas las
ocurrencias fuera de `formato.ts` en comentarios, correcto), pero el guardián no
puede distinguir «no hay violaciones» de «no pude buscar».

**Consecuencia.** La red que protege la regla más citada de CLAUDE.md —una cifra
fiscal, un solo formateador— se desarma en silencio. Contrasta con
`pruebas_en_ci.test.ts:51`, que sí tiene centinela de población (aunque el suyo
esté engañado, ver el ALTO de arriba).

**Causa raíz probable.** `|| true` puesto para tolerar «cero coincidencias»
también tolera «el comando no corrió».

---

### [BAJO] `8066054` se commiteó con su prueba en rojo y nada lo atrapó

`src/app/api/dashboard/chat/costo_parcial.test.ts` · commits `8066054` → `366b66d`.

**Escenario.** El propio mensaje de `366b66d` lo confiesa: «El commit anterior
entró con la prueba roja (**la cadena de grep tapó el exit code**): `validarMensajes`
exige rol `'usuario'` (no `'user'`) y `acotada()` exige `abortSignal` en el
builder — el arnés caía al 400/tope y el catch nunca corría». O sea: el arreglo
de TC-A1 se dio por cerrado durante un commit entero sobre una prueba que ni
siquiera ejercitaba el `catch` que verificaba. El mismo patrón de `|| true` /
`| grep` que desarma los guardianes de `formato.test.ts`.

**Consecuencia.** Es la mecánica que produce los otros hallazgos de este reporte:
si el exit code se pierde, «prueba escrita» y «prueba que pasa» dejan de ser lo
mismo, y el reporte de cierre no distingue.

**Causa raíz probable.** Verificar la suite con la salida canalizada a `grep` en
vez de con el código de salida.

---

## Los 8 arreglos de esta ronda y su ancla

| commit | hallazgo | prueba que lo cubre | ¿fallaría al revertir el arreglo? |
|---|---|---|---|
| `c8bd2ac` | BE-C1 · cobranza persigue viajes que Likida nunca avisó | `agentes/cobranza_cola.test.ts` · `it('la fila con forma de import (avisado_en null) no entra a NINGUNA cubeta')` | **PARCIAL.** Sí al quitar el cinturón (`cobranza.ts:142`). **No** al quitar el filtro (`cobranza.ts:116`): el mock declara `not: chain` y devuelve las dos filas igual. El commit afirma que ambos la ponen roja; es falso. Y `vigilados` no se assertea. |
| `444492a` | OP-C1 · cron responde 200 con el motor reventado | `api/cron/escalar/route.test.ts` · `it('si la ESCALACIÓN revienta: 500…')` + `it('si la COBRANZA revienta: 500 también')` | **Sí.** Volver `status: huboFallo ? 500 : 200` a `200` pone rojas dos `it`. Además fija que el segundo motor corre aunque truene el primero. Ancla limpia. Único hueco: la rama `sin CRON_SECRET → 500` no se ejercita (el env se pone antes del import). |
| `b31460c` | ARQ-C1 · `diferencias: 0` hardcodeado | `analytics_stats_operador.test.ts` · `it('cada operador trae sus liquidaciones con diferencia real; el redondeo no cuenta')` | **Sí.** Restaurar `diferencias: 0` la pone roja (espera 1 y 1). Cubre el borde de centavos (0.005 no cuenta). Ancla limpia. Hueco menor: el mock ignora `.eq('tenant_id')`, así que una fuga entre flotas en la consulta nueva sería invisible. |
| `54e0648` | REND-C1 · consolidado serial sin presupuesto | `lotes.test.ts` · las tres `it` | **NO — decoración probada.** Reimplementé `enLotes` como bucle serial y las 7 aserciones dan VERDE (`pico = 1` cumple `toBeLessThanOrEqual(3)`). Además nada ancla el **sitio de llamada**: revertir `consolidado.ts:259-276` al `for` original deja `lotes.test.ts` intacta. |
| `bb7e228` | REND-C2 · cobranza sin reloj + claims huérfanos | `agentes/cobranza_reloj.test.ts` · 3 `it` | **PARCIAL (1 de 3 piezas).** Pieza 1 (el reloj corta antes del claim): **sí**, quitar el `break` de `cobranza.ts:243` rompe las dos primeras. Pieza 2 (`PLAZO_COBRANZA_GLOBAL_MS` / corte entre tenants): **no**, `ejecutarCobranzaGlobal` solo existe mockeada. Pieza 3 (el `DELETE` de rescate, `cobranza.ts:208-212`): **no**, `delete/is/lt` son no-ops en el mock y ninguna aserción los mira. |
| `bc3c6c3` | LEG-C1 · visión externa antes del gate de privacidad | `processor_aviso_huerfano.test.ts` · `it('SIN aviso posible (flota sin datos): NI visión NI huérfano — cero tratamiento')` | **Sí.** Bajar el gate por debajo de `if (!viajeId)` hace que la rama huérfana llame `extraerComprobante` y `guardarHuerfano` con `getOpenViaje → null`, y las dos aserciones `not.toHaveBeenCalled()` se ponen rojas. Ejercita `ponerAvisoADisposicion` **real**, no mockeada. La mejor ancla de la ronda. Hueco: solo cubre `type: 'image'`; el XML, el ticket 1:1 y el texto al agente —que el commit dice haber puesto detrás del gate— no se prueban. |
| `8066054` | TC-A1 · el turno del chat que truena no se cobra | `api/dashboard/chat/costo_parcial.test.ts` · 2 `it` | **Sí, pero solo desde `366b66d`.** Entró en rojo (ver hallazgo BAJO). |
| `366b66d` | TC-A1 · corrección del arnés | mismo archivo | **Sí.** Quitar el bloque `if (err instanceof PartialExecutionError && …)` de `chat/route.ts` pone roja la primera; quitar la guardia `tokensIn>0 \|\| tokensOut>0` pone roja la segunda. Los dos lados fijados. |

**Resumen:** 4 anclan de verdad · 2 anclan a medias · 1 no ancla · 1 es la
corrección de otra.

---

## Pruebas que serían decoración

Con la función que dicen proteger rota, éstas siguen verdes:

1. **`lotes.test.ts`** — las tres `it`, con `enLotes` revertido a serial.
   **Demostrado ejecutando**, no razonado.
2. **`escalar_viaje.test.ts`** — las seis `it` de `describe('viajesSinAceptar')`
   con el embed devuelto a `operador(nombre, telefono)`. El arnés registra el
   `select` en `filtros` (línea 78) y nunca lo consulta.
3. **`cobranza_cola.test.ts:45`** — con `cobranza.ts:116`
   (`.not('avisado_en','is',null)`) borrado.
4. **`cobranza_reloj.test.ts`** — las tres, con cualquiera de los cuatro filtros
   del `DELETE` de `cobranza.ts:208-212` borrado, incluido `.eq('tenant_id')`.
5. **`pruebas_en_ci.test.ts:51`** (`it('hay pruebas que se saltan…')`) — el
   centinela pasa hoy mismo, con la bandera que vigila muerta desde el rename.
6. **`formato.test.ts:191,216`** — las dos, si el `grep` no corre.
7. **`proveedores.test.ts`** completo — es correcto para lo que prueba, pero
   `decidirFacturaProveedor` sin `.eq('estado','pendiente')` ni
   `.eq('tenant_id')` no lo ve nadie.

Patrón común en 3, 4 y 2: **el mock encadenable universal**
(`select/eq/in/not/is/lt/limit/order` todos devolviendo `b`). Es cómodo y hace la
prueba legible, pero por construcción no puede distinguir «el filtro está» de «el
filtro no está». Donde el arnés sí registra y assertea los argumentos
(`escalar_viaje.test.ts` con `eq/is/not/lte`, `repo_escritura.test.ts`), las
pruebas anclan bien.

---

## Lo que revisé y está bien

- **El CI es fuerte y mejoró esta ronda.** `.github/workflows/ci.yml` corre en
  `branches: ['**']` + `pull_request`, con `concurrency` que cancela lo viejo:
  typecheck, lint, tests **con umbral de cobertura**, el paso sin instrumentar, y
  build. Cinco puertas, sin secretos, en cada push. El comentario que explica por
  qué dejó de ser `[master, main]` es exacto y el problema que describe (ramas
  `claude/*` sin correr nada) es real.
- **El trinquete de cobertura es una puerta, no un número** (`vitest.config.ts:88`,
  líneas 67 / ramas 84 / funciones 79) y su comentario dice honestamente lo que la
  métrica **no** prueba («100% de líneas con cero `expect` sigue siendo cero
  protección»). El `exclude` de `.claude/**` y el razonamiento del worktree
  duplicado están medidos, no supuestos.
- **El motor puro del dinero está hondo.** `src/lib/likida/cuadre/` son 26 archivos
  de prueba; `engine.test.ts` solo lleva 234 `expect`. Cubre bordes de verdad
  (tolerancia, estímulo de diésel, medio de pago, plazo/jerarquía, RFC no
  verificable, receptor faltante, flete que no ampara, inyección).
- **`repo_escritura.test.ts`** es el modelo de cómo se prueba una escritura de
  dinero: `addGasto` con «un 0 NO se guarda como NULL», «un `false` NO se guarda
  como NULL», «lo ausente sí va como NULL», y `saveLiquidacion` exigiendo que
  cierre **por la RPC transaccional** con los doce parámetros en su lugar y que un
  error de la RPC lance. Si el resto del repo se pareciera a este archivo, el rubro
  estaría en 8.
- **Las redes estructurales son inusualmente buenas**, y varias existen porque un
  hallazgo se repitió tres rondas: `migraciones_verificadas.test.ts` (obliga a que
  cada migración tome una decisión explícita —bloque o exención con razón—; las
  exenciones están argumentadas una por una y las 0089/0090/0091 tienen bloque),
  `dinero_por_area.test.ts` (lee `page.tsx` **y** `vista.tsx` como una superficie,
  precisamente porque mover una columna de un archivo al otro apagaba el
  despertador), `politica_un_origen.test.ts`, `copias_un_origen.test.ts`,
  `marca.test.ts`.
- **`supabase/verificaciones.sql`** (3,190 líneas, 66 bloques). Los tres nuevos
  (64 · cobranza 0089, 65 · hitos 0090, 66 · proveedores 0091) traen **corrida real
  anotada con fecha y valores esperados**, y el patrón `raise exception` para
  revertir los datos de prueba. Es el sitio correcto para lo que un mock no puede
  demostrar y está usado como tal.
- **`pruebas-manuales/` está bien aislado**: `vitest.config.ts` propio, sufijo
  `.prueba.ts` fuera del include de la suite, y el header de `ci.yml` explica por
  qué CI no necesita secretos. No corrí ninguno.
- **`arnes_ticket_real.test.ts`** — el caso que en la auditoría 5 tenía cero
  `expect` hoy tiene verificadores de forma que valen para cualquier ticket
  (monto finito y positivo, concepto en catálogo, las tres cubetas **parten** el
  comprobado sin perder ni inventar pesos) más un caso de oro congelado que corre
  gratis en CI. La parte que gasta dinero se salta por `TICKET_PATH`, no por
  fixtures en disco. Es el «1 skipped» de la línea base.
- **Aserciones flojas: 95 de 5,427** (`toBeDefined/toBeTruthy/not.toThrow/
  toBeGreaterThan(0)`), ~1.8%. No es un problema sistémico.
- **Ningún `it.skip` / `describe.skip` / `it.todo` muerto** en las 268 suites.
- Los tres embeds del pase 1 están **arreglados en el código** y verifiqué que no
  queda ni un `select` sin alias sobre los pares con doble FK
  (`grep -oE "\.select\('[^']*(operador\(|viaje\()[^']*'"` → 0). Lo que falta es la
  prueba, no el arreglo.

---

## Lo que NO alcancé a revisar

- **No corrí la suite** (línea base ya corrida, 11 auditores en paralelo). Todos
  los «seguiría verde» de este reporte son por lectura del mock y de la aserción,
  salvo `lotes.test.ts`, que sí **ejecuté** contra una reimplementación serial.
- Leí en profundidad ~18 de los **268** archivos de prueba. La muestra fue
  dirigida: los 8 commits de la ronda, los tres ALTOS heredados, y los módulos
  nuevos de F1-F6. Zonas grandes sin abrir: `src/app/admin/**`,
  `facturacion/adaptadores/**` (playwright/CAPUFE), `llm/**`, `saas/**`,
  `intake/**`, y los ~90 archivos de `processor_*` / `conv_*` / `aviso_*`.
- **`analista.ts` y `chat-tools.ts` no tienen `*.test.ts` propio.** No alcancé a
  verificar si están cubiertos indirectamente (`tools_cableado.test.ts`,
  `tools_camino_real.test.ts`, `chat/validacion.test.ts`) o si es un hueco real —
  es el agente de solo-lectura que contesta preguntas sobre dinero, así que
  merece una pasada dedicada.
- **No verifiqué el umbral de cobertura contra la realidad.** No corrí
  `npm run test:coverage`, así que no sé cuánto margen hay sobre 67/67/84/79 ni
  qué módulos nuevos de esta ronda entraron sin línea ejecutada.
- **No revisé si `--coverage` tumba alguna de las dos pruebas de tiempo hoy.** El
  razonamiento del ALTO de `LIKIDA_COBERTURA` es por lectura (nada asigna la
  variable) y por los números que el propio repo documenta (~9 contra umbral 20);
  no lo medí.
- **Los 25 ALTOS heredados de otros rubros** no los verifiqué salvo los tres
  míos.
