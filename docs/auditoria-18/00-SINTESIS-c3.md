# Síntesis — auditoría 18 · continuación 3 (22-ago-2026, en la nube, desatendida)

**Global 5.8/10 — sube 1.0 contra el 4.8 de ayer, y once de las doce notas subieron.**
Ronda de **continuación** sobre el PR #34, no ronda nueva: el PR seguía abierto, así que
se trabajó sobre `claude/auditoria-18`. Es la tercera pasada. **92 hallazgos con ficha:
9 CRÍTICO · 33 ALTO · 33 MEDIO · 17 BAJO. 3 arreglados**, los tres con prueba que los
reproduce y commit atómico.

## Lo primero: por qué esta subida no es una vara más blanda

Las dos pasadas anteriores bajaron la nota. Ésta la sube, y la diferencia hay que poder
defenderla, porque un número que sube es exactamente lo que esta rutina existe para
desconfiar.

`master` avanzó de `d432e89` a `21630c0`: **116 commits, 252 archivos, +16,055/−1,348**.
Casi todo es un solo PR, el **#38 (`auditoria-18-fixes`)** — una campaña de arreglo hecha
**fuera de esta rama**, contra los 83 hallazgos de `docs/auditoria-18/hallazgos.md`.

A los doce auditores se les dijo por escrito que un asunto de commit que cita `(A21)` **no
es prueba de que A21 esté cerrado**, y que abrieran el archivo. Lo hicieron, y varios
fueron más lejos:

- **Pruebas** rompió a propósito la función que cada puerta nueva dice cubrir: `requireVendedor`
  (5 rojas), `registrarPago`/`cancelarFactura` (2 y 1), `abrir(req,'dinero')` (4 rojas),
  `comercial.ts:158-159` (4 rojas). Seis puertas verificadas **rompiéndolas**, no leyéndolas.
- **Modelo de datos** contó la FK compuesta relación por relación: **38 de 43** (antes 5 de
  39 — y corrigió el denominador de ayer, que traía una fila fantasma que la 0041 dropeó).
- **Arquitectura** contó las copias de `appUrl()`, `anotarBitacora()` y `hoyMx()`, y
  encontró que los tres quedaron únicos **con guardia estructural** — una prueba que falla
  si alguien vuelve a escribir la copia.
- **Seguridad** verificó los seis abiertos abriendo el archivo y comprobó el sha512 del
  `vendor/xlsx-0.20.3.tgz` contra el lockfile.

Eso es lo que sostiene el +1.0. Y aun así **la global no vuelve al 6.1 de la ronda 18**,
porque quedan seis críticos sin cerrar y porque fiscal no se movió.

## El resultado del día: fiscal se quedó en 4, y esa es la noticia

El PR #38 cerró **6 de los 7 abiertos** que traía fiscal, incluido el CRÍTICO del régimen
601, el ALTO del peaje en efectivo y el «13.8%» del pie del PDF. Eso es trabajo real.

Y una **mirada más profunda** encontró **tres CRÍTICOS nuevos del mismo tamaño**. Se
cancelaron. La nota se queda en 4 y esa quietud dice más que un movimiento:

El auditor no leyó el código, lo **corrió**. Los tres escenarios salieron de ejecutar
`cuadrarViaje` y `resumirFiscal` reales, no de una lectura.

## Arreglado, con prueba que lo reproduce

| # | Hallazgo | sha | La prueba |
|---|---|---|---|
| 1 | **FISC-C3-2 (CRÍTICO)** — el panel del contador acreditaba el IVA de un CFDI no pagado que el motor ya rechazaba | `a44efa2` | Un CFDI PPD de $58,000 (IVA $8,000, `FormaPago '99'`) daba **$8,000 en el panel y $0.00 en el PDF** del mismo UUID. La prueba corre `resumirFiscal` **y** `cuadrarViaje` sobre el mismo comprobante y exige que digan lo mismo. Sin el arreglo: 2 rojas |
| 2 | **FISC-C3-1 (CRÍTICO)** — el combustible pagado con un medio fuera de la lista de la LISR 27-III salía «Deducible para ISR» en verde | `d0e9844` | Diésel de $11,600 con `formaPago '06'`, flota no elegible: **$11,600 deducible + $1,600 de IVA** donde iba $0. Flota elegible con el tope casi consumido: **$50,000 deducible** donde iban $10,000 + $40,000. Sin el arreglo: 8 rojas |
| 3 | **ARQ-C3-1 (CRÍTICO)** — la pantalla nueva de detalle reconstruía la cubeta fiscal del motor | `35ba042` | `rfc_receptor` se pintaba «Por revisar» donde el bloque de arriba de la MISMA pantalla decía «No deducible $6,400»; `combustible_efectivo` se pintaba rojo siendo deducible hasta el 15%. La prueba **lee las listas del motor**, no las repite. Sin el arreglo: 5 rojas |

Los tres se comprobaron revirtiendo el arreglo con `git stash` y viendo las pruebas
ponerse rojas otra vez. Ninguno revertido. **Tope de 3 vueltas gastado.**

El (2) es el que más me importa. Es la **tercera vez** que `engine.ts` comete la misma
familia de error: la auditoría 2 la cerró en los litros de IEPS, la 18 la cerró en el
peaje (A7), y seguía abierta en el combustible. La lista cerrada correcta —
`MEDIOS_LISR_27_III` — ya vivía en el mismo archivo, doce líneas arriba de donde faltaba.
Ahora el panel importa el **mismo predicado**, no una copia.

## Las doce notas

| Rubro | Antes | Hoy | Δ | Razón, y qué la sostiene |
|---|---|---|---|---|
| Modelo de datos | 5 | **7** | +2 | *se atacó y subió* — la FK compuesta **contada**: 38 de 43 relaciones (antes 5 de 39) |
| Backend y API | 6 | **7** | +1 | *se atacó y subió* — 8 de 13 abiertos cerrados **con prueba nombrada**, no con un comentario |
| Seguridad | 6 | **7** | +1 | *se atacó y subió* — los 6 abiertos cerrados, verificados abriendo el archivo |
| Frontend | 5 | **6** | +1 | *se atacó y subió* — los 7 de la ronda 18 cerrados, 5 anclados con prueba propia |
| Sistema agéntico | 4 | **6** | +2 | *se atacó y subió* — el CRÍTICO cerrado y el ciclo de vida reconstruido (claim *reclamado* ≠ *completado*, mig. 0149) |
| Tool calling | 5 | **6** | +1 | *se atacó y subió* — los 7 de la ronda 18 cerrados con código y prueba unitaria propia |
| Cumplimiento legal | 5 | **6** | +1 | *se atacó y subió* + *mirada más profunda* — 8 de 9 abiertos cerrados; el aviso sigue sin pantalla |
| Pruebas | 5 | **6** | +1 | *se atacó y subió* — 6 puertas nuevas verificadas **rompiendo la función**, no leyéndola |
| Operabilidad y DX | 5 | **6** | +1 | *se atacó y subió*, templado por *mirada más profunda* — 8 de 9 cerrados, pero apareció un auto-merge que escribe en `master` |
| Arquitectura | 4 | **5** | +1 | *se atacó y subió* — `appUrl()`, `anotarBitacora()` y `hoyMx()` únicos **con guardia estructural** |
| Cumplimiento fiscal | 4 | **4** | **0** | *se atacó y subió* **y** *mirada más profunda*, del mismo tamaño: 6 abiertos cerrados, 3 CRÍTICOS nuevos. Se cancelaron |
| Rendimiento y costo | 3 | **4** | +1 | *se atacó y subió* — presupuesto por invocación, bandeja en un viaje de red, cola 600→300 |

**Suma 70 → 5.8.**

Las notas describen el árbol que los auditores vieron (`38eef84`). **Los tres arreglos
entraron después**, así que fiscal y arquitectura quedan conservadoras a propósito: no
re-audité a nadie para no inflar el número con mi propio trabajo. Si mañana se relanza
fiscal sobre el árbol de hoy, esa nota debería moverse — y ése es el trabajo de mañana,
no de hoy.

## Los seis CRÍTICOS que quedan, con la razón de no haberlos tocado

**Uno es fiscal y es de siembra, no de código:** el tenant del demo (`scripts/demo-5k.sql:45,58`)
trae régimen **601** con la facilidad del 15% concedida a mano — justo lo que `99a6b7c`
acaba de prohibir. **Es lo que se enseña en la sala.** No lo toqué porque cambia el guion
del demo y eso lo decides tú.

**Dos son legales.** El aviso de privacidad de la flota **sigue sin pantalla de captura**
(tercera pasada seguida): `/aviso/<tenant>` es 404 para toda flota real. Y el Redactor
manda el nombre del decisor a un modelo externo mientras el aviso que se le entrega a esa
persona declara que eso no pasa (`redactor.ts:163` vs `privacidad.ts:758`). El primero es
una pantalla nueva; el segundo, una decisión de producto sobre datos de terceros.

**Dos son de configuración del repo, y ningún commit los arregla:** el repo es público y
el único control de acceso a `master` es cómo se llama una rama
(`auto-merge-rutina.yml:29-43` con `contents: write`), y `master` sigue sin protección de
rama (`"protected": false` por API). Es Settings → Branches y Settings → Actions.

**Uno es de pruebas:** el lease del claim de WhatsApp —el arreglo C5 de este mismo delta—
se puede desarmar entero con **172 pruebas en verde**, porque el doble de
`conv_claim_lease.test.ts:32-38` tiene `is`/`lt` que no registran nada. Se quedó fuera por
el **tope de 3 vueltas**, no por falta de reproducción.

Y los **8 del piloto de visión** siguen íntegros: `git log` de esos archivos no trae un
solo commit del PR #38. Todos detrás de `FACTURACION_PILOTO`, apagada.
**El doc del demo manda encender esa palanca. No la enciendas antes de decidir esto.**

## Lo que verifiqué, y una cosa que causé yo

- **FISC-C3-1**: verificado abriendo `engine.ts:410` y `:113`. La lista cerrada correcta
  estaba en el mismo archivo y se usaba solo para el IEPS. Confirmado.
- **FISC-C3-2**: verificado abriendo `fiscal.ts:559-571` — cinco comprobaciones, cero
  menciones de `'99'`, contra el candado de `engine.ts:1116`. Confirmado.
- **ARQ-C3-1**: verificado comparando `vista.tsx:152-157` contra `NO_DEDUCIBLE_ISR` y
  `POR_CONFIRMAR` de `engine.ts:222-223`. La lista del panel no era ninguna de las dos.
  Confirmado.
- **Nada resultó falso este pase.** El conteo de 92 se hace **solo** sobre los encabezados
  `### [SEVERIDAD]` de la sección de hallazgos, misma regla que la pasada anterior.
- **Un hallazgo que NO cierro y no descarto:** operabilidad reporta que la suite falló
  1 de 2 corridas completas en `engine_iva_medio_pago.test.ts:35` y pasa aislada — la
  compuerta no sería determinista. En mis **cuatro** corridas completas de hoy no se
  reprodujo. Queda abierto con esa nota, no descartado: una intermitente que no se
  reproduce sigue siendo una intermitente.

### El merge, y las dos cosas que rompí yo

`673496f` mergea `master` en la rama. **Tres conflictos, los tres porque la rama y
`master` arreglaron el MISMO hallazgo de formas distintas.** Tomé el lado de `master` en
los tres: es el más amplio y es lo que está publicado.

Eso dejó dos secuelas, y la compuerta arrancó **roja** por ellas — no por `master` ni por
la rama por separado:

1. `processor_oficina_despacho.test.ts` esperaba los dos argumentos del
   `reengancharPendiente` de la rama; `master` resuelve el desempate más arriba, en
   `atenderTextoOficina`, con `incluirDespacho`.
2. `migraciones_verificadas.test.ts` quedó con `'0141'` **dos veces** (TS1117): la entrada
   de la rama citaba un «bloque 111» que tras el merge es la RLS de `liquidacion`.

Las dos corregidas en `38eef84`. Y dos consecuencias que dejo **dichas en voz alta**
porque son hallazgos legítimos para mañana: el `reengancharPendiente` de
`despacho_wa.ts:238` y `asignar_wa.ts:298` **quedó sin call site** (el auditor de backend
lo levantó solo, como BAJO), y la verificación de base de las columnas GENERADAS de las
migraciones 0140/0142/0143 **se perdió** — hoy están EXENTAS con razón escrita, no
verificadas.

### Y algo que dejo abierto a propósito, del arreglo (2)

El numerador del acumulado del ejercicio del 15% vive **también en SQL**
(`sumar_combustible_ejercicio`, `0112:151` y `0084:19`) y sigue filtrando
`forma_pago = '01'`. Eso pide una migración, y aquí no hay base para verificarla — la
pasada anterior aprendió por CI lo que cuesta escribir un bloque SQL a ciegas. Está
anotado en `fiscal-c3.md` y dicho en el commit.

## Estado de la compuerta

Al arrancar tras el merge, **roja** (arriba). Al cerrar, verde sobre el árbol final:

```
 Test Files  435 passed (435)
      Tests  5544 passed | 1 skipped (5545)
```

`npx tsc --noEmit` limpio. `npm run lint` 0 errores, 5 avisos (los mismos de la línea
base). Y **`npm ci` corrió limpio por primera vez en la nube**: `5eca3ab` vendorizó `xlsx`
en `vendor/` y cerró el INFRA que las dos pasadas anteriores tuvieron que rodear a mano.

La suite creció de 5,135 a 5,545 pruebas en dos días (+410). Que crezca no es que cubra:
eso lo midió el auditor de pruebas rompiendo funciones, y su veredicto es 6, no 8.

## Tablero

`docs/auditoria-18/tablero-c3.html`, capturado en `tablero-c3.png` y **mirado**: conté los
doce rubros, verifiqué que las notas del tablero suman 70 y dan el 5.8 de esta síntesis, y
que la serie histórica ordena 6.1 › 5.8 › 4.8 en altura. Se recapturó una vez para quitar
un 10% de lienzo en blanco al pie.
