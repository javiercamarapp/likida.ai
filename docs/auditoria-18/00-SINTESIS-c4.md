# Síntesis — auditoría 18 · continuación 4 (23-ago-2026, en la nube, desatendida)

**Global 5.3/10 — baja 0.5 contra el 5.8 de ayer. Un solo rubro sube.**

Ronda de **continuación** sobre el PR #34, no ronda nueva: el PR seguía abierto,
así que se trabajó sobre `claude/auditoria-18`. Es la **cuarta** pasada. Los doce
rubros se relanzaron porque los doce tenían código cambiado: `master` avanzó de
`21630c0` a `583fec4`, **368 archivos, +32,183 / −5,220**.

**126 hallazgos con ficha: 15 CRÍTICO · 46 ALTO · 45 MEDIO · 20 BAJO.**
**2 arreglados** con prueba que los reproduce y commit atómico.
Árbol limpio al arrancar → autofix habilitado.

---

## Por qué baja, y por qué eso no dice «el código empeoró»

Ocho de los doce movimientos son *mirada más profunda* o *deuda que cobró
factura*. El delta de hoy fue enorme y **atacó de verdad tres rubros** —
rendimiento (el único que sube), esquema y backend. No tocó los otros.

La lectura honesta de la bajada es ésta: **la c3 subió +1.0 de golpe con once
notas al alza**, y esta pasada, con más tiempo por rubro y con métodos nuevos,
encuentra que parte de aquel optimismo no aguanta. Tres ejemplos, y los tres son
del mismo tipo:

- **Legal**: la c3 dio por cerrado el CRÍTICO del decisor citando `361f2dc`.
  Ese commit **no incluye `redactor.ts` en su `--stat`**. 13 abiertos, 13
  reincidentes, cero cerrados.
- **Fiscal**: la c3 celebró dos críticos cerrados «estructuralmente». Cierto —
  y aun así hoy se pueden nombrar **tres cifras impresas equivocadas, con
  pesos**, y una **la creó el arreglo de ayer** (movió el consumidor del 15% y
  no el productor, que sigue en SQL).
- **Pruebas**: la nota anterior midió la suite offline. La mitad SQL de la red
  no estaba medida, y ahí está el agujero grande de la ronda.

Que la global baje después de una campaña de arreglo grande es un resultado
válido, y hoy es el más informativo.

---

## Lo arreglado, con su prueba

| # | Hallazgo | sha | La prueba |
|---|---|---|---|
| 1 | **ARQ-C4-1 (CRÍTICO)** — la captura manual del folio fiscal escribía el UUID en MAYÚSCULAS contra el CHECK de la 0158, que exige minúsculas | `b872b10` | El contralor copia `A3BB189E-…` del portal del SAT, lo pega y guarda: el CHECK rechaza, y como el manejador solo distingue el `23505`, cae en «No se pudo guardar. Inténtalo de nuevo.» **Ningún camino de captura manual de CFDI funcionaba.** La prueba fija el invariante `x = lower(x)`, no el caso. Sin el arreglo: 2 rojas |
| 2 | **BACK-C4-1 (ALTO)** — la guardia de orden de Stripe (RES-11) se aplicó a la suscripción y no a la factura | `a5e413d` | Mensualidad de $11,600: el `payment_failed` de las 10:02, reentregado a las 11:05, devolvía a `'fallida'` la factura cobrada a las 10:20. El contralor ve «Falló el cobro» y el botón de pagar sobre lo que ya transfirió, y `getPorCobrar` la vuelve a listar. Sin el arreglo: **8 rojas de 31** |

Los dos comprobados **revirtiendo el arreglo y conservando las pruebas**.
Ninguno revertido. **Tope de 3 vueltas: se usaron 2.**

Además, **dos rojos que cazó la compuerta antes que los auditores**, los dos de
`master` (detalle en `compuerta-c4.md`):

- **OPER-C4-1** (`8282fa4`): `node_modules` estaba versionado como **enlace
  simbólico a `/Users/javiercamaraportepetit/likida/node_modules`**. Se coló
  porque `.gitignore` decía `node_modules/` con diagonal, forma que solo casa
  directorios. Al clonar, `npx vitest` muere con `Cannot find module
  'vitest/config'`: no fallan unas pruebas, **no arranca ninguna**.
- **FMT-C4-1** (`3af1ea4`): la compuerta base salió **roja**. `mxnCompacto`
  imprimía `"$9,000.0 M"` — diez caracteres en la tarjeta de ocho, o sea el
  desbordamiento que FE-17 vino a cerrar. `maximumFractionDigits` a secas saca a
  ICU de su *compact rounding*.

---

## El descarte de la ronda: «el repo es público» era falso

Seguridad y operabilidad reportaron, cada uno por su lado y como **CRÍTICO**, que
con el repo público cualquiera abre un PR desde un fork con una rama llamada
`mejora/…`, `auto-merge-rutina.yml` lo funde a `master` sin revisión humana, y el
título del PR —que es el asunto del squash— decide si despliega a producción.

El auditor de seguridad marcó su propia dependencia, y eso es exactamente lo que
hay que hacer: *«la severidad depende de un dato que no pude verificar sin red»*.

**El repo es privado, y tiene un solo colaborador: el dueño, admin.**

```
search_repositories  user:javiercamarapp is:public   → 8 repos; cuadra/likida.ai NO está
search_repositories  user:javiercamarapp is:private  → incluye
    {"name":"likida.ai","id":1311463027,"private":true}
list_repository_collaborators  javiercamarapp/cuadra → [{"login":"javiercamarapp","role_name":"admin"}]
```

Se cae el vector; **se mantiene el mecanismo**. Con un solo actor, que además es
admin, un auto-merge por nombre de rama no es un control de acceso roto: es una
bomba de relojería para el día que entre la segunda persona con permiso de
escritura — se abre sola, sin que nadie toque el workflow. **Reclasificado a
MEDIO**, y vuelve a CRÍTICO el día que `list_repository_collaborators` devuelva
más de una línea.

**Y la corrección hacia atrás, que importa más:** las síntesis de la **c2 y la
c3 afirmaron «repo público» como hecho**, y la c3 lo puso entre las cinco cosas
que necesitaban decisión del dueño. Dos rondas cargando una severidad inflada por
un dato que se comprueba con una llamada. El auditor de esta ronda rastreó de
dónde venía: la verificación original se había hecho **contra otro repo**.

Detalle completo en `verificacion-c4.md`.

---

## Las doce notas

| Rubro | Antes | Hoy | Δ | Razón, y qué la sostiene |
|---|---|---|---|---|
| Modelo de datos | 7 | **7** | = | Merecía +1 y lo cancela que su única compuerta lleve 24 h en rojo |
| Backend y API | 7 | **7** | = | *Se atacó y subió* (el pago cerrado en la base, con `for update`) contra *deuda que cobró factura* (la guardia de orden a medias). Del mismo tamaño |
| Frontend | 6 | **6** | = | El render por bloques ancló lo suyo; el «Reintentar» de los 64 boundaries no puede reintentar |
| Seguridad | 7 | **6** | −1 | *Deuda que cobró factura* — 8 reincidentes. Su CRÍTICO se descartó en su premisa y aun así baja: las reincidencias se sostienen solas |
| Operabilidad y DX | 6 | **6** | = | *Se atacó y subió* (el repo pasó de no arrancar al clonarse a suite verde en dos pasos) contra *mirada más profunda* (la puerta de Postgres no califica sus seis bloques nuevos) |
| Sistema agéntico | 6 | **5** | −1 | *Deuda que cobró factura* — 13 reincidentes de 14, cero cerrados. El delta de 368 archivos no tocó el rubro |
| Tool calling | 6 | **5** | −1 | *Mirada más profunda* — tres pasadas auditaron la **definición** de las tools; nadie había mirado lo que la tool le **devuelve** al modelo |
| Pruebas | 6 | **5** | −1 | *Mirada más profunda* — la nota anterior midió solo la suite offline y no la mitad SQL de la red |
| Rendimiento y costo | 4 | **5** | **+1** | *Se atacó y subió* — la agregación bajó a SQL de verdad. **El único rubro que sube hoy** |
| Arquitectura | 5 | **4** | −1 | *Deuda que cobró factura* — el folio fiscal llegó a tener cinco normalizadores, y uno iba al revés |
| Cumplimiento legal | 6 | **4** | −2 | *Mirada más profunda* — 13 abiertos, 13 reincidentes, cero cerrados |
| Cumplimiento fiscal | 4 | **3** | −1 | *Mirada más profunda* — hoy se pueden nombrar tres cifras impresas equivocadas, con pesos |

Suma 63 / 12 = **5.25 → 5.3**.

Serie de la 18: **6.1 · 4.8 · 5.8 · 5.3**.

---

## Lo más caro que se sabe hoy y NO se arregló

Los cuatro piden decisión, no un parche de madrugada. Van con lo que los sostiene.

### 1. La mitad SQL del producto no está verificada por nadie

Tres auditores llegaron a esto por caminos distintos y **coinciden**:

- **19 de los 123 bloques de `verificaciones.sql` corren en CI y no se
  califican** — seis son los de las migraciones de dinero del delta (0150, 0151,
  0154, 0155, 0159, 0163). `correr-verificaciones.mjs:349` solo sale con código 1
  si hay `fallas` o `noLanzaron`; `sinCalificar > 0` imprime un aviso y cae a
  «La batería pasó». Demostrado corriendo el script real contra un `psql` falso
  que reprueba **todas** las aserciones de los seis: `6 sin-calificar · 0
  fallo(s)` → **EXIT=0**.
- **Las pruebas «de equivalencia JS-vs-RPC» no verifican una línea de SQL**:
  comparan TS congelado contra una transcripción a mano escrita en el mismo
  commit. El auditor **quitó `tenant_id = p_tenant` de dos RPC de la 0150** —una
  fuga entre flotas— y la suite quedó en **4,325 verdes**.
- **`ci-postgres` lleva 24 h en rojo en `master`**, verificado por mí contra la
  API: runs **#308 (merge del PR #39) y #311 (`583fec4`) = `failure`**. El commit
  de #311 dice «6,212 pruebas verdes» — se midió con la suite de TS, no con esa
  compuerta.

No lo arreglé porque hacer que `sinCalificar` repruebe deja la puerta cerrada
sobre 19 bloques que **hoy no son calificables**: eso es trabajo de fondo, y
además esa compuerta ya está roja por su cuenta.

### 2. El estímulo de peaje se calcula sobre una base que no es la pagada

`engine.ts:1195` hace `peajeAcreditable += subTotal × 0.5`, y **`@Descuento` del
CFDI no se lee en ningún archivo del repo** (`cfdi_xml.ts:299` solo toma
`@_SubTotal`). Con un CFDI de TAG de SubTotal $120,000 y Descuento $18,000 salen
**$60,000 de estímulo donde la RMF 9.1.8 fr. IV ordena $51,000** — y el pie del
PDF cita la fracción que lo prohíbe. Nadie había abierto de dónde sale `subTotal`
en 18 auditorías.

No lo arreglé porque el arreglo completo pide **columna nueva y migración**, y
aquí no hay Postgres para verificarla. Media corrección —parchear el motor y no
la persistencia— dejaría dos cifras según el camino, que es peor que una mal.

### 3. El contador del 15% mide una población en SQL y la juzga con otra en TS

`0112:151` filtra `forma_pago = '01'`; `engine.ts:449` juzga con la lista cerrada
de la LISR 27-III. **El PDF imprime la razón entre las dos.** Es REINCIDENTE y
**peor que en la c3**: el arreglo de FISC-C3-1 movió el consumidor y dejó el
productor. Pide migración.

### 4. Lo que ya venía, y sigue

- **El piloto de visión**: 8 críticos íntegros, detrás de `FACTURACION_PILOTO`,
  apagada. **El doc del demo manda encenderla.**
- **`/aviso/<tenant>` es 404** para toda flota real — cuarta pasada pidiéndolo.
- **La purga de prospectos borra `contacto_nombre` y nada más**: el correo, el
  teléfono y el nombre repuesto dentro de `prospecto.mensaje_wa` sobreviven,
  mientras `/aviso/prospectos` promete que se eliminan (NUEVO, `0148:73-82`).
- **El tenant del demo** (`demo-5k.sql:45,58`) sigue en régimen 601 con la
  facilidad del 15% concedida a mano. Y **ese script nunca ha podido correr**:
  muere en su primer `insert` por un `--` dentro de un literal JSON.

---

## Lo que esta ronda NO verificó

- **Ninguna migración se ejecutó por el orquestador.** El auditor de datos sí:
  encontró Postgres 16 en la caja, levantó un clúster y aplicó las 163
  migraciones. Sus cifras (FK compuesta **38 de 42**; **22 RPC de agregación,
  cero `SECURITY DEFINER`**, las 22 filtrando por `p_tenant`) salen del catálogo,
  no de una reconstrucción — pero **yo no las repetí**.
- **`npm run build` no se corrió** (sin `.env`). Que el árbol compile en Next lo
  dice el CI del PR, no esta ronda.
- **`pruebas-manuales/*.prueba.ts` no se corrieron**: llamadas reales de pago.
- **De los 126 hallazgos verifiqué a fondo cinco**, los de mayor daño. El resto
  se toma como lo escribió su auditor, con su `archivo:línea`. No es lo mismo
  «reportado» que «verificado», y esta línea existe para no confundirlos.
- La intermitente de `engine_iva_medio_pago.test.ts:35` **no se reprodujo** en
  las cinco corridas completas de hoy; el auditor de pruebas leyó su diseño y
  dice que no admite intermitencia (función pura, sin reloj ni estado
  compartido). Queda abierta como intermitente no reproducida.
