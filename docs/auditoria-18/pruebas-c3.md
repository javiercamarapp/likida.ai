# Pruebas — auditoría 18 · continuación 3

**Nota: 6/10** (antes 5). Razón del movimiento: **se atacó y subió**. Los cinco
hallazgos abiertos de la ronda 18 están CERRADOS, y no de palabra: rompí a
propósito la función que cada prueba nueva dice cubrir y las cinco se pusieron
ROJAS. `requireVendedor` (5 rojas), `registrarPago`/`cancelarFactura` (2 y 1),
el IDOR de export (1 y 4), el área de la llave de `/v1` (4), Rentabilidad (4).
No sube más porque **el delta no tocó ni un archivo de los que quedaron verdes
la pasada anterior** —las nueve mutaciones que repetí siguen las nueve verdes—
y porque el propio delta trajo un arreglo CRÍTICO nuevo (`C5`, el lease del
claim de WhatsApp) con las dos guardas que lo hacen seguro **sin arnés**: las
borré las dos y 172 pruebas de WhatsApp siguieron verdes. El ancla del rubro
—«4 o menos si la suite pasa con la función rota»— sigue mordiendo, pero ya no
sobre las zonas que la auditoría había señalado: sobre las que llegaron después.

**El riesgo mayor del rubro, hoy:** el arreglo que impide procesar dos veces el
mismo mensaje de WhatsApp (`conv.ts:389-390`) tiene un doble de base cuyos
`.is()` y `.lt()` no registran nada, así que la suite no puede distinguir el
candado de su ausencia — y sin ese candado el webhook y el cron corren el mismo
comprobante a la vez.

---

## Prueba de mutación de esta ronda

26 mutaciones, cada una revertida con `git checkout --` antes de la siguiente.
**11 ROJAS / 15 VERDES** (9 de las 15 verdes son repeticiones exactas de la
pasada anterior, señaladas con «rep.»).

| # | Mutación aplicada | Archivo mutado:línea | Prueba que debía cacharla | Resultado |
|---|---|---|---|---|
| 1 | Borré `.eq('tenant_id', tenantId)` de la lectura de `liquidacion` | `src/app/api/export/pdf/[id]/route.ts:87` | `rutas_export.test.ts:135` | **ROJA** 1/39 |
| 2 | `if (!puedeExportar(t.rol))` → `if (false)` en **las cuatro** rutas | `export/{pdf/[id]:74, liquidaciones:59, facturas-proveedor:52, bitacora-peaje:40}` | `rutas_export.test.ts:103-121` | **VERDE** 39/39 |
| 3 | `if (!puedeVerArea(t.rol,'dinero'))` → `if (false)` en las cuatro | mismas rutas (`:69, :54, :48, :36`) | `rutas_export.test.ts:111` | **ROJA** 4/39 |
| 4 | `if (s.rol !== 'vendedor' && s.rol !== 'superadmin')` → `if (false)` | `src/lib/auth/guard.ts:95` | `guard.test.ts` (bloque A19) | **ROJA** 5/23 |
| 5 | Borré `if (!puedeVerRuta(s.rol, destino)) redirect(...)` | `src/lib/auth/guard.ts:114` | `guard.test.ts` (bloque `exigirVerRuta`) | **ROJA** 1/23 |
| 6 | Borré `if (abono.rechazo) throw new DatoInvalido(...)` | `src/lib/likida/facturacion_escritura.ts:404` | `facturacion_escritura_cableado.test.ts:55,65` | **ROJA** 2/32 |
| 7 | `if ((count ?? 0) > 0)` → `if (false)` | `facturacion_escritura.ts:455` | `..._cableado.test.ts:118` | **ROJA** 1/11 |
| 8 | `abrir(req, 'dinero')` → `abrir(req, 'operacion')` | `src/app/api/v1/viajes/[id]/contribucion/route.ts` | `area_sincronizada.test.ts:63` | **ROJA** 4/120 |
| 9 | `contribucion: round2(ingreso - costoComprobado)` → invertida, y quité el guardia `ingreso > 0` del margen | `src/lib/likida/comercial.ts:158,159` | `comercial.test.ts:24-67` | **ROJA** 4/9 |
| 10 | `const path = \`${op.tenantId}/${viajeId}-operador.pdf\`` → `.pdf` (el chofer recibe el ejemplar del contralor) | `src/lib/likida/processor.ts:2669` | `ruta_pdf_sincronizada.test.ts:63` + `processor_cierre.test.ts:536` | **ROJA** 2/37 |
| 11 | Borré `.is('completado_en', null)` del retome del claim | `src/lib/likida/conv.ts:389` | `conv_claim_lease.test.ts:66-92` | **VERDE** 29/29 |
| 12 | Borré `.lt('created_at', ahora − LEASE_CLAIM_MS)` | `conv.ts:390` | `conv_claim_lease.test.ts:66-92` | **VERDE** 29/29 |
| 12b | Las dos anteriores **a la vez**, contra 19 archivos de WhatsApp y cron | `conv.ts:389-390` | — | **VERDE** 172/172 |
| 13 | `.update({ completado_en: ... })` → `.update({ })` | `conv.ts:426` | `conv_claim_lease.test.ts:102` | **ROJA** 1/29 |
| 14 | `if ((g.ivaTraslado ?? 0) > 0 && g.formaPago !== '99')` → sin el `'99'` | `src/lib/likida/cuadre/engine.ts:1012` | `engine_iva_medio_pago.test.ts` | **ROJA** 1/411 |
| 15 | `if (l.confianza === null \|\| l.confianza < CONFIANZA_LEGIBLE)` → `if (false)` | `src/lib/likida/acuse_ticket.ts:102` | ninguna | **VERDE** 369/369 |
| 15b | CONTROL: `decidirAcuse` lanza siempre | `acuse_ticket.ts:88` | — | **ROJA** 2/50 (la función **sí** se ejecuta) |
| 16 | `abierto_por: abiertoPor` → `abierto_por: null` | `src/lib/likida/comercial.ts:405` | ninguna | **VERDE** 20/20 |
| 17 | Borré la validación de `categoria` de `abrirTicket` | `comercial.ts:392` | ninguna | **VERDE** 9/9 |
| 18 | rep. Borré los **tres** `.eq('tenant_id', tenantId)` | `facturacion/cuentas.ts:39,73,114` | `cuentas.test.ts` | **VERDE** 9/9 |
| 19 | rep. Quité el veto por TEXTO del botón | `adaptadores/piloto_vision.ts:254` | `piloto_vision.test.ts:109` | **VERDE** 12/12 |
| 20 | rep. `if (accion.hayCaptcha)` → `if (false)` | `piloto_vision.ts:154` | `piloto_vision.test.ts:130` | **VERDE** 12/12 |
| 21 | rep. `>= PASOS_MAXIMOS` → `> PASOS_MAXIMOS` | `piloto_vision.ts:186` | `piloto_vision.test.ts` | **VERDE** 12/12 |
| 22 | rep. `enmascarar()` → identidad | `piloto_vision.ts:308` | `piloto_vision.test.ts:147` | **VERDE** 12/12 |
| 23 | rep. `conCuenta` → `false` (se ignora el cofre) | `facturacion/al_vuelo.ts:232` | `al_vuelo.test.ts` | **VERDE** 55/55 |
| 24 | rep. `enrutar(t, tieneAdaptador, false)` | `al_vuelo.ts:98` | `al_vuelo.test.ts` | **VERDE** 55/55 |
| 25 | rep. `repartir` deja de propagar `cuentaCompartida` | `facturacion/enrutar.ts:205` | `enrutar`+`avisar`+`cron/facturar` | **VERDE** 60/60 |
| 26 | rep. Intercambié `forma` entre `usuario` y `contrasena` | `conectores/portales_facturacion.ts:52,58` | `portales_facturacion.test.ts:44` | **VERDE** 98/98 |

Las once rojas se concentran en lo que el PR #38 vino a anclar. Las quince
verdes, en credenciales de portal, en el cofre, y —lo nuevo— en el claim de
WhatsApp y en el acuse al chofer.

---

## Verificación de los abiertos de la pasada anterior

### Los cinco de la ronda 18 (los que el delta dijo cerrar)

| Hallazgo | Estado | Verificación |
|---|---|---|
| [ALTO] `requireVendedor` sin una sola prueba (A19) | **CERRADO** | `guard.test.ts` bloque A19; mutación #4 en `src/lib/auth/guard.ts:95` → 5 rojas. `exigirVerRuta` también: mutación #5 → 1 roja |
| [ALTO] `facturacion_escritura.ts:404` y `:455` sin arnés (A20) | **CERRADO** | `src/lib/likida/facturacion_escritura_cableado.test.ts:55` y `:118`; mutaciones #6 y #7 → 2 y 1 rojas |
| [ALTO] Las 4 rutas de `export/` a 0 líneas, IDOR documentado (A21) | **CERRADO A DOS TERCIOS** | `src/app/api/export/rutas_export.test.ts` (39 pruebas). El filtro de tenant y la puerta de área sí se ponen rojos (#1, #3). **La tercera puerta, `puedeExportar`, no** (#2) — ver hallazgo MEDIO abajo |
| [MEDIO] El área de la llave de `/v1` no atada al OpenAPI (M19) | **CERRADO** | `src/app/api/v1/viajes/[id]/contribucion/area_sincronizada.test.ts:63`; mutación #8 → 4 rojas en 2 archivos |
| [MEDIO] `comercial.ts` al 1.3% (Rentabilidad/Cartera/Cobranza) (M20) | **CERRADO EN LO QUE PROMETE** | `src/lib/likida/comercial.test.ts` (9 pruebas); mutación #9 → 4 rojas. Cubre 3 de las 7 funciones exportadas; `abrirTicket`, `getTickets`, `getCotizaciones` y `getEstadoRastreo` siguen sin arnés (hallazgo MEDIO abajo) |

Extra del delta que también verifiqué: **M26 CERRADO** —
`src/lib/likida/ruta_pdf_sincronizada.test.ts:63` + `processor_cierre.test.ts:536`;
la mutación #10 (mandarle al chofer el ejemplar del contralor) pone rojas las dos.

### Los míos de la continuación 2

| Hallazgo c2 | Estado | Verificación |
|---|---|---|
| [CRÍTICO] `FACTURACION_PILOTO=si` sin una sola prueba con la palanca puesta | **REINCIDENTE** | `grep -rn FACTURACION_PILOTO src/ .github/ vitest.config.ts` → 3 aciertos: `registro.ts:180` (la lectura) y dos comentarios. Cero pruebas, cero workflows. `cron/facturar/route.test.ts:132` la sigue clavando en `pilotoHabilitado: () => false` |
| [ALTO] El filtro de tenant del cofre de credenciales | **REINCIDENTE** | mutación #18 → 9/9 verdes. `git diff d432e89..HEAD -- src/lib/likida/facturacion/cuentas.ts` → vacío |
| [ALTO] Las «cuatro reglas que no se negocian» del piloto | **REINCIDENTE** | mutaciones #19-#22, las cuatro verdes 12/12. El archivo y su prueba no los tocó el delta |
| [ALTO] La cuenta compartida se desconecta en sus dos consumidores | **REINCIDENTE** | mutaciones #23, #24, #25 → 55, 55 y 60 verdes |
| [ALTO] `scoreCierre` da dos cifras según la pantalla | **REINCIDENTE** | `prospectos-mapa.ts` sí cambió (+60), pero `:475` sigue llamando `scoreCierre` **sin** `personasVerificadas` y el `select` de `:425` sigue sin traer `prospecto_persona`; `:570-573` sí lo pasa |
| [MEDIO] `esSecreto()` sin consumidor y la assertion que cuenta secretos sin decir cuál | **REINCIDENTE** | mutación #26 → 98/98 verdes. `grep -rn esSecreto src/` → 3 aciertos, dos son del archivo de prueba |
| [MEDIO] `armarAviso` ignora la cuenta compartida | **REINCIDENTE** | `avisar.ts:70` sigue llamando `repartir(tickets, sabeOperarlo)` con dos argumentos |
| [MEDIO] Las pruebas de reloj de `pagina_playwright.test.ts` corren instrumentadas en CI | **REINCIDENTE** | `grep -c skipIf pagina_playwright.test.ts` → **0**. Los únicos `skipIf(LIKIDA_COBERTURA)` del repo siguen siendo `duplicados.test.ts:185` y `normas/fundamento.test.ts:148` |
| [BAJO] `repartir` con un tercer parámetro que nada ejecuta | **REINCIDENTE** | `grep -rn "repartir(" src/` → `enrutar.ts:196` (la definición), `avisar.ts:70` y `enrutar.test.ts:155`, las dos con dos argumentos |
| [BAJO] La regla 3 del piloto se afirma con una assertion tautológica | **REINCIDENTE** | mutación #22 |

---

## Hallazgos

### [CRÍTICO] El lease del claim de WhatsApp —el arreglo C5 de este mismo delta— se puede desarmar entero con 172 pruebas en verde

`src/lib/likida/conv.ts:389` y `:390` (`retomarClaimHuerfano`) ·
`src/lib/likida/conv_claim_lease.test.ts:32-38` (el doble de base).

**Escenario (corrido, tres mutaciones).** El UPDATE que decide si un claim es
huérfano lleva dos candados encadenados: `.is('completado_en', null)` («no
retomes uno ya terminado») y `.lt('created_at', ahora − LEASE_CLAIM_MS)` («no
retomes uno que puede seguir vivo»).

- Borré `.is('completado_en', null)` → `conv_claim_lease` + `conv_carrera_insert`
  + `conv_directo` → **29/29 verdes**.
- Borré `.lt('created_at', …)` → **29/29 verdes**.
- Borré **las dos** y corrí 19 archivos (`conv_*`, `wa_pendientes`,
  `api/webhook/whatsapp/`, `api/cron/`) → **172/172 verdes**.

El doble de Supabase de la prueba es
`{ eq: () => …, is: () => nodo, lt: () => nodo, select: () => retomar() }`:
**`is` y `lt` devuelven el mismo nodo y no registran nada**. Quién gana —
`'nuevo'`, `'duplicado'` o `'en_curso'` — lo decide `retomar.mockResolvedValue`
de la propia prueba, nunca los filtros. Las cinco pruebas del bloque afirman el
mapeo de la respuesta a la decisión; ninguna afirma la **consulta**. La
contraprueba está en la misma tabla: `.update({ completado_en })` de
`completarMessageClaim` (`:426`) **sí** se pone rojo al mutarlo (#13), porque
esa sí se observa (`expect(update).toHaveBeenCalledWith(...)`).

**Consecuencia.** Sin `.lt(...)`, cualquier segundo intento sobre un mensaje en
vuelo lo retoma como `'nuevo'`: el webhook (pool de 5) y el cron de la bandeja
durable procesan **el mismo comprobante a la vez**, y el chofer que mandó una
foto de $4,200 la ve dos veces en la liquidación. Sin `.is(...)`, un mensaje ya
completado se reprocesa a la primera vuelta pasado el lease: se vuelve a pagar
la llamada de visión y se vuelve a registrar el gasto. Es exactamente el bug que
`8563eb5` vino a matar (C5), y su arreglo llegó sin nada que impida revertirlo.

**Causa raíz probable.** El doble se escribió para devolver un valor por
escalón de decisión, no para registrar la consulta; el `is`/`lt` se añadieron al
mock solo para que la cadena no reventara.

---

### [ALTO] La regla que impide pedirle al chofer que firme un monto dudoso no tiene arnés, y su función sí se ejecuta

`src/lib/likida/acuse_ticket.ts:102` (`decidirAcuse`) · sin archivo de prueba
propio; `src/lib/likida/rafaga_consolidada.test.ts` es el único que lo nombra, y
solo en un comentario (`:319`).

**Escenario (corrido, con control).** Cambié
`if (l.confianza === null || l.confianza < CONFIANZA_LEGIBLE)` por `if (false)`
→ `src/lib/likida/` (30 archivos: `processor_*`, `rafaga_*`, `intake/`) →
**369/369 verdes**. Para descartar que la función simplemente no se ejecute,
puse un `throw` en la primera línea de `decidirAcuse` → **2 rojas de 50**: la
función **sí** corre en las pruebas, lo que no corre es la rama que protege al
chofer.

Con la mutación, un ticket leído con confianza 0.30 deja de caer en `refoto` y
cae en `confirmar`: se le manda al chofer un botón con la cifra que el OCR creyó
leer. El propio archivo declara eso como su peor modo de falla, con estas
palabras (`:24-31`): «convierte un error de OCR en un dato firmado por el
operador, y el contralor ya no tiene cómo distinguirlo».

**Consecuencia.** El chofer va manejando, ve un número plausible y aprieta «sí».
El contralor abre la liquidación y encuentra $420 confirmados por el operador
donde el papel decía $4,200 — y con la firma encima ya no hay a quién
preguntarle. Es la regla del CLAUDE.md («nunca inventar una cifra») en su
versión más cara, y nada la sostiene.

**Causa raíz probable.** `acuse_ticket.ts` es el único módulo de la ruta del
dinero sin archivo `*.test.ts` propio: se cubrió por rebote desde `processor`, y
el rebote toca la función pero no sus umbrales.

---

### [MEDIO] `abrirTicket` —la puerta de la señal de PMF #3— no tiene una sola prueba, y la prueba que existe mira el otro lado

`src/lib/likida/comercial.ts:387-414` (`abrirTicket`), en particular `:405`
(`abierto_por: abiertoPor`) y `:392` (validación de categoría) ·
`src/lib/likida/pmf.test.ts:107`.

**Escenario (dos mutaciones corridas).**

- `:405` — `abierto_por: abiertoPor` → `abierto_por: null` →
  `comercial.test.ts` + `dashboard/soporte/` + `pmf.test.ts` → **20/20 verdes**.
- `:392` — borré la validación de `categoria` → **9/9 verdes**.

`pmf.test.ts:107` afirma con todas sus letras «tickets: `abierto_por` no nulo es
del cliente; NULL es de Likida (0051)» — o sea, prueba el LECTOR de la señal, y
el ESCRITOR que la produce se puede desconectar sin que nada se entere. Es el
mismo patrón que la ronda 18 nombró sobre `evaluarAbono` y que `c8afcdd` acaba
de cerrar en `registrarPago`: se probó el juez, no el cableado.

**Consecuencia.** Con `abierto_por` siempre nulo, el tablero de PMF le dice a
Javier que **ningún** cliente se ha quejado por su cuenta cuando todos lo han
hecho — la señal que decide si el producto se sigue construyendo. Con la
categoría sin validar, un `categoria` inventado revienta contra el constraint de
la 0051 y el usuario ve un 500 en vez de «esa categoría no existe».

**Causa raíz probable.** `0063c82` (M20) ancló las tres funciones que el
hallazgo original nombraba (Rentabilidad, Cartera, Cobranza) y se detuvo ahí;
`abrirTicket`, `getTickets`, `getCotizaciones` y `getEstadoRastreo` —incluida la
que promete «el token NUNCA sale de aquí», `:338`— quedaron fuera.

---

### [MEDIO] De las «tres puertas del IDOR» que ancla `9b47db7`, una no se puede poner roja: `puedeExportar` es inalcanzable detrás de `puedeVerArea`

`src/app/api/export/pdf/[id]/route.ts:74`, `liquidaciones/route.ts:59`,
`facturas-proveedor/route.ts:52`, `bitacora-peaje/route.ts:40` ·
`src/lib/auth/permisos.ts:17` · `src/lib/auth/visibilidad.ts:37-45` ·
`src/app/api/export/rutas_export.test.ts:103-121`.

**Escenario (corrido).** Cambié `if (!puedeExportar(t.rol))` por `if (false)` en
**las cuatro** rutas a la vez → `npx vitest run src/app/api/export/` →
**39/39 verdes**. Y no es que falte el caso: es que **no puede existir**.
`EXPORTA = {superadmin, flota_admin, encargado, contador}` y los roles con área
`dinero` son `{superadmin, flota_admin, contador}` — un subconjunto estricto.
Como el `puedeVerArea(t.rol, 'dinero')` va **antes** en las cuatro rutas, todo
rol que llega a la segunda puerta ya está en `EXPORTA`: la comprobación es
código muerto por construcción.

`rutas_export.test.ts:103` («OPERADOR: 403 — el IDOR original») pasa por la
puerta de área, no por la de verbo, y lo mismo el caso del rol inventado. El
comentario del archivo de prueba dice «El arreglo son tres cosas encadenadas
(área `dinero`, `puedeExportar`, `.eq('tenant_id')`) y ninguna se ejercía. Aquí
se anclan las tres» — se anclan dos.

**Consecuencia.** Quien lea el commit `test(export): … anclan las tres puertas
del IDOR (A21)` va a creer que las tres están fijadas. El día que alguien añada
un rol nuevo con área `dinero` y sin permiso de exportar —o mueva el orden de
los dos `if`—, la puerta que debía frenarlo no existe y ninguna prueba lo dice.
No es una fuga hoy; es una promesa de arnés que no se cumple.

**Causa raíz probable.** Las dos puertas se escribieron en el mismo commit del
arreglo y nadie comprobó que sus dominios se solapan; el arnés se escribió
después contra el comentario, no contra la tabla de roles.

---

## Lo que revisé y está bien

- **`src/app/api/export/rutas_export.test.ts` (206 líneas, 39 pruebas) es un
  arnés de verdad en lo que sí puede fijar.** Ejercita las cuatro rutas REALES
  (`await import('./pdf/[id]/route')` etc.) con los módulos reales de permisos y
  visibilidad; lo que dobla es la base y la sesión. El `builderLiquidacion`
  (`:26-38`) **registra los filtros** (`filtros.push([c, v])`) y `:135` los
  afirma — es exactamente lo que le falta al doble de `cuentas.test.ts` y al de
  `conv_claim_lease.test.ts`. Mutación #1 → roja con mensaje legible.
- **`src/lib/likida/facturacion_escritura_cableado.test.ts` (153 líneas).**
  Afirma qué escrituras **NO** ocurren cuando la regla dice que no
  (`expect(escribioEn('pago_recibido')).toEqual([])`, `:60-62`), que es la forma
  correcta de anclar un cableado. `:89` fija además que el update va acotado a
  `tenant_id` **y** a `estatus='emitida'`, y `:108-114` separa «base caída» de
  «no existe» (`Error` sí, `DatoInvalido` no) — el fallar-cerrado del CLAUDE.md
  con prueba encima.
- **`src/app/api/v1/viajes/[id]/contribucion/area_sincronizada.test.ts`.** Lee
  los `route.ts` como texto, extrae el `abrir(req, 'área')` de cada método y lo
  compara contra `x-likida-area`, la prosa del OpenAPI y el tag — en las dos
  direcciones (`:87`, que caza un área declarada sin código que la respalde). Y
  trae CONTROL propio (`:52-57`): si el extractor dejara de encontrar rutas, la
  prueba falla en vez de pasar por vacío. Es la técnica correcta para dos
  literales que TypeScript no puede unir.
- **`src/lib/likida/comercial.test.ts`.** No prueba el mock: dobla `traerTodo`
  por etiqueta y afirma el CÁLCULO. Las tres pruebas que valen son las de la
  regla del producto —margen `null` en vez de `Infinity`/`NaN`/`0` (`:39`),
  concentración `null` en vez de `0` (`:93`), y un ingreso de `$0` que sí cuenta
  como medición mientras `null` no (`:51`)—, que es la regla «nunca inventar una
  cifra» escrita como assertion.
- **`src/lib/auth/guard.test.ts` (bloque A19).** `it.each` sobre los cuatro roles
  de flota cliente, y no solo comprueba que rebota: comprueba **a dónde**
  (`redirect).toHaveBeenCalledWith(inicioDe(rol))`) y que ese destino no es
  `/vendedor` — o sea, se protege de que `inicioDe` cambie por debajo.
- **`ruta_pdf_sincronizada.test.ts:63` después de M26.** La prueba antigua
  prohibía cualquier `{}/{}.pdf` en `processor.ts`; la nueva admite exactamente
  una línea, exige que lleve la etiqueta `'createSignedUrl.contralor'` y que
  **no** contenga `sendDocument`. Mutación #10 → roja por los dos lados
  (el conteo de plantillas y el body del documento saliente).
- **El candado fiscal del IVA (`engine.ts:1012`) sí está anclado.** Quitar
  `&& g.formaPago !== '99'` pone roja 1 de 411 en `cuadre/` — la cifra que sale
  en casi toda liquidación tiene arnés.
- **`completarMessageClaim` (`conv.ts:426`) sí está anclado** — es la
  contraprueba que hace verosímil el CRÍTICO de arriba: en el mismo archivo de
  prueba, lo que se observa se caza y lo que no se observa no.

---

## Lo que NO alcancé a revisar

- **La suite completa.** No corrí `npx vitest run` entero (~5,515 pruebas) ni
  `--coverage`: hay once agentes más en esta corrida y la mutación dirigida
  consume la mayor parte del presupuesto. Todo lo de arriba se sostiene por
  mutación sobre archivos concretos y por lectura, no por el reporte de
  cobertura. Corolario honesto: **una mutación que declaro VERDE puede estar
  cazada por un archivo que no corrí**; en los casos de `conv.ts` y
  `acuse_ticket.ts` amplié a 19 y 30 archivos para reducir ese margen, y en
  `abrirTicket` verifiqué por `grep` que ninguna prueba lo importa.
- **`getTickets`, `getCotizaciones` y `getEstadoRastreo`** (`comercial.ts:299`,
  `:254`, `:338`). Las tres siguen sin arnés; solo muté `abrirTicket`. La de
  `getEstadoRastreo` promete «el token NUNCA sale de aquí» y no la probé.
- **Los ~60 commits `fix(...)` restantes del PR #38.** Muté los seis
  `test(...)` que el encargo señalaba, más el candado del IVA, el claim de
  WhatsApp y el acuse. No toqué el arnés de `3232ed7` (cookie de flota),
  `f49da77` (step-up MFA), `a87a69d` (loop-guard), `52ad486` (sonda de visión)
  ni `93dac95` (las 33 FK compuestas — eso además pide base).
- **`supabase/verificaciones.sql`** y los bloques 111-121 nuevos: sigue sin base
  en este entorno. Y la verificación de las columnas GENERADAS de 0140/0142/0143
  que el merge dejó **exentas por escrito** (MAPA §«El merge») no la pude
  sustituir por nada aquí.
- **`piloto_vision.ts` con la palanca puesta.** Repetí las cuatro mutaciones de
  la pasada anterior pero no escribí ni corrí nada con `FACTURACION_PILOTO=si`
  (el encargo prohíbe escribir pruebas nuevas).
- **Los tiempos medidos de `pagina_playwright.test.ts`.** Verifiqué que el
  `skipIf` sigue ausente, pero no volví a medir los márgenes: el archivo cuesta
  ~29 s y no cambió en el delta.

---

## Confirmación de árbol limpio

Las 26 mutaciones se revirtieron una por una con `git checkout -- <archivo>`
inmediatamente después de correr su prueba. Salida real al terminar:

```
$ git status --short
$ git diff --stat -- src/
$
```

Vacío las dos. (Este propio archivo no figura porque `.gitignore:34` ignora
`docs/auditoria-*/`.) El único archivo que apareció modificado en algún momento
de la corrida fue `docs/auditoria-18/compuerta.md`, que **no** toqué yo — lo
escribió el agente de compuerta en paralelo y ya no figura en `git status`.
`HEAD` arrancó en `38eef84` y al terminar está en `ccd48b7`: avanzó por commits
de otros agentes de esta misma corrida, ninguno mío — yo no hice ni un commit.
