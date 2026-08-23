# Pruebas — auditoría 18 · continuación 21-ago

**Nota: 5/10** (antes 6). Razón del movimiento: **deuda que cobró factura**. La
ronda 18 nombró el patrón con estas palabras: «se extrajo `evaluarAbono` a
función pura y se probó, pero no se extrajo el **cableado**». El delta lo
repitió literal en código nuevo: `enrutar()` tiene arnés y sus dos consumidores
(`decidirAutofactura`, `facturarAlVuelo`) se pueden desconectar de la cuenta
compartida con 55 pruebas en verde. Y añadió uno peor: sobre `piloto_vision.ts`
—381 líneas que abren portales fiscales reales con la contraseña de la flota—
rompí las **cuatro reglas que el propio archivo declara innegociables** y su
prueba de 204 líneas siguió verde en las cinco mutaciones. El ancla del rubro
no deja margen: «4 o menos si la suite pasa con la función rota». No baja a 4
porque el corazón del delta —`processor.ts`, 402 líneas reescritas— sí está
anclado de verdad (3 de 3 mutaciones rojas) y `identificar.ts` también (2 de 2).

**El riesgo mayor del rubro, hoy:** hay una palanca de entorno,
`FACTURACION_PILOTO=si`, que pasa de 1 a 21 los portales que la máquina intenta
sola, y **no existe una sola prueba en el repo con esa palanca puesta** — se
enciende en Vercel sin deploy, así que ni siquiera pasa por CI.

Corridas de esta ronda: solo archivos concretos (`cuentas`, `piloto_vision`,
`processor_dueno_maneja`, `enrutar`, `avisar`, `al_vuelo`, `identificar`,
`administracion`, `portales_facturacion`, `barrera`, `pagina_playwright`).
**19 mutaciones: 8 rojas, 11 verdes.** Árbol verificado limpio al terminar
(`git diff --stat -- src/` vacío).

## Hallazgos

### [CRÍTICO] `FACTURACION_PILOTO=si` reenruta 20 comercios a un modelo de visión, y ninguna prueba corre con la palanca puesta

`src/lib/likida/facturacion/adaptadores/registro.ts:179` (`pilotoHabilitado`),
`:184` (`COMERCIOS_PILOTABLES`), `:194` (`portalesOperables`), `:236-268` (la
rama nueva de `registrarPortales`), `:323` (`olvidarPortales`) ·
`src/app/api/cron/facturar/route.ts:425` y `:554` ·
`src/app/api/cron/facturar/route.test.ts:126-127`.

**Escenario (medido).** `grep -rn FACTURACION_PILOTO src/ .github/` devuelve
**cero** apariciones fuera del propio `registro.ts` y de un comentario en
`llm/models.ts`: ninguna prueba, ningún workflow, ningún `.env` de CI la pone.
Y `route.test.ts:127` la clava apagada a mano — `pilotoHabilitado: () => false`.
Ejecuté el catálogo real desde un archivo temporal:

| | palanca apagada | palanca puesta |
|---|---|---|
| `portalesOperables().length` | **1** (capufe) | **21** |
| comercios pilotables | — | **20**, de los cuales **10 exigen cuenta** |

O sea: el día que alguien escriba `FACTURACION_PILOTO=si` en el panel de Vercel
—una variable de entorno, sin commit, sin build, sin CI—, veinte comercios
dejan de salir por `enrutar → mensaje → el encargado con la liga` y entran a un
camino de ~130 líneas de producción que **nunca se han ejecutado una sola vez**:
la rama de `registrarPortales` (`:236-268`), `credencialesDePortales()` (que
descifra el cofre, `route.ts:554`), y `crearPilotoVision` con la contraseña de
la flota adentro. Los 10 con cuenta reciben además la credencial descifrada.

**Consecuencia.** El modo de falla es el que este repo persigue en todos lados:
el silencio. Si la rama revienta, `enrutar` ya dejó de mandar esos tickets al
encargado (`portalesOperables()` los declara operables) y el plazo del mes
natural corre sin que nadie sepa. Y no hay forma de que CI lo avise, porque el
cambio que lo dispara no es código.

**Causa raíz probable.** La palanca se leyó de `process.env` en vez de pasarse
como argumento, así que ninguna prueba puede encenderla sin ensuciar el proceso,
y nadie escribió la que lo hiciera.

---

### [ALTO] Se puede borrar el filtro de tenant del lector de credenciales cifradas y las 9 pruebas siguen verdes

`src/lib/likida/facturacion/cuentas.ts:39` y `:40` (`cuentasCompartidas`),
`:73`/`:74` (`credencialesDePortales`), `:114`/`:116` (`credencialDePortal`) ·
`src/lib/likida/facturacion/cuentas.test.ts:11-19` (el mock).

**Escenario (corrido, dos mutaciones).** El doble de Supabase de la prueba es
`{ select: () => q, eq: () => q, like: …, maybeSingle: … }`: **`eq` devuelve la
misma cadena pase lo que pase**, así que ningún argumento de filtro se observa.

- Borré `.eq('tenant_id', tenantId)` de las **tres** funciones →
  `npx vitest run cuentas.test.ts` → **9/9 verdes**.
- Borré además `.eq('activo', true)` de las tres → **9/9 verdes**.

Con el primero puesto, `credencialesDePortales('t-flota-A')` devuelve el `Map`
con las credenciales **descifradas de TODAS las flotas** — y `route.ts:554` se
lo pasa tal cual a `registrarPortales`, que registra al piloto con la
contraseña del portal de otro cliente. Con el segundo, una credencial que la
flota **revocó** (`activo=false`) se sigue usando para entrar.

Refutación intentada: `.like('conector_id', 'portal_facturacion:%')` **sí** se
cae al borrarlo (la cadena deja de ser un `await`able y el `data` sale vacío),
o sea que el mock caza por accidente el único filtro que no protege a nadie, y
no caza los dos que sí.

**Consecuencia.** El aislamiento entre flotas del cofre —lo más sensible que
guarda el producto después del RFC— descansa en tres pares de `.eq()` que la
suite no puede distinguir de su ausencia. Es el hallazgo M2 de la ronda 18
(`requireVendedor`) otra vez, pero sobre datos cifrados en vez de una pantalla.

**Causa raíz probable.** El mock se escribió para devolver un valor, no para
registrar la consulta; ninguna assertion mira `eq.mock.calls`.

---

### [ALTO] Las «cuatro reglas que no se negocian» del piloto de visión: cinco mutaciones, cinco verdes

`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:155` (regla 2),
`:187` (techo de pasos), `:254` (regla 1, la doble guarda), `:301` y `:308`
(regla 3) · `piloto_vision.test.ts` (204 líneas, 12 pruebas).

Cinco mutaciones, cada una corrida sola contra
`npx vitest run …/piloto_vision.test.ts`. **Las cinco: 12/12 verdes.**

1. **`:254`, veto por texto del botón.** Quité
   `HUELE_A_EMITIR.test(boton?.texto ?? '')` → verde. Quité en su lugar
   `HUELE_A_EMITIR.test(a.selector)` → verde también. La prueba que dice cazarlo
   (`:109-118`, «el veto por texto del botón lo caza») usa el selector
   `#emitir` sobre un botón rotulado «Generar factura»: **las dos guardas casan
   a la vez**, así que la prueba pasa mientras quede cualquiera de las dos, y
   ninguna de las dos está fijada. La regla 1 dice literalmente «cualquiera de
   las dos detiene»; el arnés no distingue cuál.
2. **`:155`, captcha declarado por el MODELO.** Cambié `if (accion.hayCaptcha)`
   por `if (false)` → verde. `:130-136` solo cubre el captcha **del DOM**
   (`inv.captcha`), y el comentario de `:141-142` dice para qué existe la otra
   mitad: «también si lo declara el modelo y el DOM no lo enseña (un checkbox de
   reCAPTCHA en iframe)» — el caso de MEGA SUR que `comercios.ts:388-397`
   documenta como pre-vuelo del 20-ago. Con la mutación, el piloto ve el
   reCAPTCHA, lo declara, y sigue tecleando en un formulario fiscal en vez de
   devolver `requiereCaptcha` y mandarlo con la persona.
3. **`:187`, agotar los 14 pasos.** Cambié `historial.length >= PASOS_MAXIMOS`
   por `> PASOS_MAXIMOS` → verde. Con eso, un vuelo que da 14 vueltas sin
   terminar cae a `:195-203` y devuelve **`ok: true`** con la captura de un
   formulario a medias: el ensayo se reporta como bueno. Ninguna prueba llega a
   agotar los pasos (la de `:170` corta antes, por repetición).
4. **`:308`, `enmascarar()`.** La reduje a `return valor` → verde. La assertion
   de `:148-149` (`segundaLlamada).not.toContain('s3creta')`) es **tautológica**:
   el historial se arma con `accion.valor`, que es lo que el modelo escribió, y
   el modelo nunca tuvo el secreto. Esa assertion no puede fallar jamás.
5. **`:301`, `registro: MARCA_CONTRASENA`.** Cambiarlo a `registro: valor` es
   indistinguible para `:145` porque el `valor` de la prueba **es** el marcador.

Lo que sí está anclado, y hay que decirlo: `capturado[a.selector] = registro`
→ `= real` **sí** pone roja `:145-146`. El núcleo de la regla 3 tiene arnés; su
periferia no.

**Consecuencia.** El archivo abre con «LAS CUATRO REGLAS QUE NO SE NEGOCIAN» y
la prueba abre con «las cuatro reglas duras, cada una con su prueba». Quien
refactorice esto va a leer eso y a confiar. De las cuatro, una (regla 4,
selector del inventario) está anclada de verdad, una a medias (regla 3), y dos
—la que impide emitir un CFDI irreversible y la que manda el captcha a una
persona— tienen prueba que no distingue el arreglo de su ausencia.

**Causa raíz probable.** El montaje de prueba eligió un caso que satisface las
dos ramas del `||` a la vez, y nunca se escribió el caso que separa una de otra.

---

### [ALTO] La cuenta compartida (PR #35) se desconecta en sus dos consumidores sin poner roja una prueba — REINCIDENTE

`src/lib/likida/facturacion/al_vuelo.ts:90` y `:98` (`decidirAutofactura`),
`:232-234` (`facturarAlVuelo`) · `src/lib/likida/facturacion/enrutar.ts:196-206`
(`repartir`) · `al_vuelo.test.ts` (55 pruebas).

**Escenario (dos mutaciones corridas).**

- `al_vuelo.ts:232` — sustituí el cálculo real
  `const conCuenta = t.comercio?.requiereCuenta ? (await cuentasCompartidas(...)).has(...) : false`
  por `const conCuenta = false` → **55/55 verdes**.
- `al_vuelo.ts:98` — `enrutar(t, tieneAdaptador, cuentaCompartida)` →
  `enrutar(t, tieneAdaptador, false)` → **55/55 verdes**.
- `enrutar.ts:203-205` — `repartir` deja de propagar `cuentaCompartida` →
  `enrutar.test.ts` + `avisar.test.ts` + `cron/facturar/route.test.ts`:
  **56/56 verdes**.

`grep -n "decidirAutofactura(" al_vuelo.test.ts` confirma el hueco: las 16
llamadas pasan tres argumentos, **ninguna pasa el cuarto**. El único sitio del
repo donde `cuentaCompartida` vale `true` es `enrutar.test.ts:40` y `:48`, con
un literal. O sea: se probó el juez y no el cableado, exactamente el diagnóstico
que la ronda 18 escribió sobre `evaluarAbono` / `registrarPago`.

**Consecuencia.** La flota comparte su acceso a OXXO Gas en
`/dashboard/conexiones`, ve el conector en verde, y el ticket sigue saliendo con
el encargado con «Ese portal pide cuenta» — la funcionalidad entera puede estar
muerta y la suite lo certifica en verde. Y es dinero-adyacente: es la diferencia
entre facturar un ticket dentro del mes natural y perder su IVA acreditable.

**Causa raíz probable.** El parámetro se añadió con valor por defecto
(`cuentaCompartida = false`), así que ninguna llamada existente rompió la
compilación y ninguna prueba tuvo que actualizarse. `sabeOperarlo`, que se
declaró **obligatorio** en la misma función y a propósito («por eso rompe la
compilación de quien no lo pase»), sí quedó anclado: mutarlo pone 4 pruebas
rojas.

---

### [ALTO] El mismo prospecto enseña dos «cierre» distintos según la pantalla, y no hay prueba que los una

`src/lib/admin/prospectos-mapa.ts:278` (`scoreCierre`, el sumando
`personasVerificadas`), `:420-424` (la llamada de `getDatosMapa`), `:513-519`
(la llamada de `getDetalleProspecto`, nueva en el delta) ·
`prospectos-mapa.test.ts:167-168`.

**Escenario.** `scoreCierre` suma `Math.min(20, (p.personasVerificadas ?? 0) * 10)`.
`getDetalleProspecto` (código nuevo, `:518`) le pasa
`personasVerificadas: (p.prospecto_persona ?? []).filter(x => x.confianza !== 'baja').length`.
`getDatosMapa` (`:420-424`) **no le pasa nada** — y no podría: su `select`
(`:370`) ni siquiera trae `prospecto_persona`. Un prospecto con dos decisores
verificados sale **cierre 72** en el pin del mapa y **cierre 92** en su propia
ficha. Y la propia suite prueba que la diferencia existe
(`prospectos-mapa.test.ts:167-168` afirma que `personasVerificadas: 2` da
estrictamente más que `0`) — lo que no hay es una prueba que compare los dos
llamadores. Ninguna de las dos funciones (`getDatosMapa`, `getDetalleProspecto`)
tiene una sola línea ejecutada por la suite: son `async` contra Supabase sin
mock.

**Consecuencia.** Es la regla del CLAUDE.md al pie de la letra: «una cifra que se
lee distinto en dos pantallas se lee como dos cálculos». Javier ordena su cola
de llamadas por el número del mapa y decide a quién llamar por el de la ficha.

**Causa raíz probable.** `scoreCierre` recibe un objeto ancho con todos los
campos opcionales, así que omitir uno es sintácticamente válido y silencioso;
no hay prueba que fije «los dos llamadores arman la misma entrada».

---

### [MEDIO] El aviso al encargado ignora la cuenta compartida y le pide una contraseña que él mismo entregó

`src/lib/likida/facturacion/avisar.ts:70` y `:98` ·
`src/lib/likida/facturacion/enrutar.ts:196-206` (el tercer parámetro de
`repartir`, sin ningún llamador en producción).

**Escenario.** `armarAviso` llama `repartir(tickets, sabeOperarlo)` con **dos**
argumentos, así que `cuentaCompartida` cae a su default `() => false`; `:98`
hace lo mismo con `enrutar(t, …)` de dos argumentos. Un ticket de OXXO Gas
(`requiereCuenta: true`) de una flota que **ya compartió su cuenta** sale por
`al_vuelo.ts:98` como `automatico` —el piloto lo va a intentar— y por
`avisar.ts:98` como `mensaje / requiere_cuenta`, que imprime «Ese portal pide
cuenta, por eso no se pudo hacer solo». `enrutar.test.ts:49-51` escribió con
todas sus letras por qué eso no puede pasar: «"requiere_cuenta" mandaría al
encargado a buscar una contraseña que él mismo ya entregó». Y el propio
encabezado de `armarAviso` (`avisar.ts:58-65`) dice que NO hay que avisar de lo
que el piloto va a intentar, «avisar de algo que ya se está haciendo entrena a
ignorar el aviso». Ninguna prueba compara las dos decisiones.

**Consecuencia.** El encargado recibe por WhatsApp un aviso incorrecto sobre un
ticket que la máquina ya tiene, con la instrucción equivocada. Dos veces al mes
de eso y deja de leer el canal.

**Causa raíz probable.** El parámetro se añadió a `repartir` y a `enrutar` en el
mismo commit y solo se cableó en `al_vuelo`; nadie escribió la prueba que exige
que las dos rutas del mismo ticket coincidan.

---

### [MEDIO] «La contraseña es SECRETO en todos» no dice CUÁL campo, y `esSecreto()` no tiene consumidor en producción

`src/lib/likida/conectores/portales_facturacion.test.ts:42-47` ·
`src/lib/likida/conectores/tipos.ts:266` (`esSecreto`) ·
`src/app/dashboard/conexiones/credenciales-controles.tsx:56-58` y `:135`.

**Escenario (corrido).** En `portales_facturacion.ts:50-64` intercambié las
formas: `usuario` pasó a `forma: 'secreto'` y `contrasena` a `forma: 'texto'` →
`npx vitest run portales_facturacion.test.ts` → **7/7 verdes**. La assertion es
`expect(secretos.length).toBeGreaterThanOrEqual(1)`: cuenta cuántos campos son
secretos, nunca cuál. Con la mutación, la pantalla de conexiones renderiza
`TIPO_INPUT['texto'] = 'text'` para la contraseña del portal —visible en
pantalla, capturable por autocompletado, legible en una captura de la sesión de
soporte— y `type="password"` para el nombre de usuario. La prueba se titula
«no vuelve al panel ni entra a un log».

Agrava: `grep -rn esSecreto src/` da **tres** apariciones —la definición y las
dos del archivo de prueba—. La pantalla no usa `esSecreto`, usa
`TIPO_INPUT[campo.forma]` directo. O sea que la «única definición de qué es un
secreto» tiene exactamente un consumidor y es su propia prueba.

**Consecuencia.** El único control que decide si una contraseña de portal se ve
en pantalla es un literal `'secreto'` en una lista, sin nada que lo fije.

**Causa raíz probable.** La assertion se escribió sobre la forma del conector
(«hay al menos un secreto») en vez de sobre el campo concreto
(`credenciales.find(c => c.clave === 'contrasena')?.forma`), que es como sí lo
hace la prueba de al lado para La Gas (`:69-73`).

---

### [MEDIO] El rojo intermitente NO es `barrera.test.ts`: el candidato con menos margen medido es el archivo del Chromium real

`src/lib/likida/facturacion/adaptadores/pagina_playwright.test.ts:582`
(principal), `:347`, `:433`, `:557-558`, `:590` · fuera de esos:
`repo_tope.test.ts:75` y `:87`, `config_tope.test.ts:61`,
`almacen_tope.test.ts:51`, `escalar_viaje.test.ts:229`.

**Escenario (medido, 21-ago).** Corrí `pagina_playwright.test.ts` completo:
**28 pruebas, 29.0 s** — un tercio de los 80 s de la suite entera, con un
Chromium de verdad y un servidor HTTP local. Su prueba `:573-583` («la red de
seguridad corta aunque Playwright no devuelva nunca») midió **1 802 ms** contra
`expect(…).toBeLessThan(3_000)`: **1 198 ms de margen**, el más apretado de la
suite, y es tiempo de pared puro (300 ms de tope + 1 500 ms de gracia de
`acotada`). `:557-558` afirma además una cota **inferior**
(`toBeGreaterThanOrEqual(700)`) sobre un tope de 800 ms.

Y el detalle que lo convierte en hallazgo: **`pruebas_en_ci.test.ts` no lo ve.**
Esa red recorre `src/` buscando `skipIf(…LIKIDA_COBERTURA…)`
(`pruebas_en_ci.test.ts:43`) y exige que cada archivo así aparezca en el paso
sin instrumentar de `ci.yml`. Solo dos archivos llevan ese `skipIf`
(`duplicados.test.ts:151`, `normas/fundamento.test.ts:148`). Los **cinco**
archivos de arriba afirman tiempo real y **no lo llevan**, así que corren
INSTRUMENTADOS en el paso de cobertura de CI — que es la corrida que
`vitest.config.ts:7-12` documenta como la que multiplica los tiempos por ~3.8.

**Descarto `barrera.test.ts`.** Lo leí línea a línea y lo corrí: 5 pruebas,
3.57 s, y **no depende del reloj**. Su `probe` es una secuencia indexada
(`barrera.test.ts:9-12`), no un temporizador; el único uso del reloj es
`Date.now() - start >= tope` en `conv.ts:606`, y en la única prueba que lo
ejerce (`:47-51`) el tope es 80 ms contra un `sleep(500)`, o sea 6× de margen.
Es LENTO —`:27-32` duerme 2 003 ms de gracia real— pero determinista. La
hipótesis de la ronda 18 estaba mal dirigida.

**Consecuencia.** Un rojo que aparece una de cada tres corridas, en el archivo
más lento de la suite, enseña a re-correr en vez de a mirar.

**Causa raíz probable.** El `skipIf(LIKIDA_COBERTURA)` se aplicó a las tres
pruebas de tiempo que existían en agosto y no se volvió a aplicar; la red que
lo vigila detecta el `skipIf` presente, nunca el ausente.

---

### [BAJO] `repartir` tiene un tercer parámetro que nada ejecuta

`src/lib/likida/facturacion/enrutar.ts:198` (`cuentaCompartida: (clave: string) => boolean = () => false`).

**Escenario.** `grep -rn "repartir(" src/ | grep -v vendedores` → dos llamadas:
`avisar.ts:70` (dos argumentos) y `enrutar.test.ts:155` (dos argumentos). El
parámetro nunca recibe un valor distinto del default en ningún camino, de
producción o de prueba. Anularlo deja 56 pruebas verdes (M5).

**Consecuencia.** Un parámetro documentado con nueve líneas de comentario que
describe un comportamiento que no ocurre nunca. La próxima persona lo lee y
supone que está cableado — que es justo lo que pasó en el hallazgo ALTO de
arriba.

**Causa raíz probable.** Se añadió por simetría con `enrutar()`, sin llamador.

---

### [BAJO] La regla 3 del piloto se afirma dos veces y una de las dos afirmaciones no puede fallar

`piloto_vision.test.ts:147-149` · `piloto_vision.ts:184` y `:308`.

**Escenario.** Ya detallado en el ALTO del piloto (mutación 4). El secreto no
tiene **ningún camino de código** hacia el modelo: `historial` se arma desde
`accion.valor`, que es la salida del modelo, y `capturado` no se le pasa a
`decidir()`. La assertion «lo que el modelo recibe en el paso 2 tampoco lleva el
secreto» es verdadera por construcción del programa, no por el arreglo.

**Consecuencia.** Menor, pero infla la percepción de cobertura de la regla que
protege la contraseña del cliente.

**Causa raíz probable.** Se afirmó sobre el efecto observable más cómodo en vez
de sobre la línea que hace el trabajo (`enmascarar`).

## Mutaciones que probé (qué rompí, qué prueba lo cachó o no)

19 mutaciones, cada una revertida con `git checkout --` antes de la siguiente.

| # | Archivo:línea mutado | Qué rompí | Archivo corrido | Resultado |
|---|---|---|---|---|
| M1 | `facturacion/cuentas.ts:39,73,114` | Borré `.eq('tenant_id', tenantId)` de las tres funciones | `cuentas.test.ts` | **VERDE** 9/9 |
| M1b | `cuentas.ts:40,74,116` | Y además `.eq('activo', true)` | `cuentas.test.ts` | **VERDE** 9/9 |
| M2a | `piloto_vision.ts:254` | Quité el veto por TEXTO del botón | `piloto_vision.test.ts` | **VERDE** 12/12 |
| M2b | `piloto_vision.ts:254` | Quité el veto por SELECTOR (dejando el de texto) | `piloto_vision.test.ts` | **VERDE** 12/12 |
| M2c | `piloto_vision.ts:187` | `>= PASOS_MAXIMOS` → `>` (agotar 14 pasos pasa a `ok:true`) | `piloto_vision.test.ts` | **VERDE** 12/12 |
| M2d | `piloto_vision.ts:308` | `enmascarar()` → identidad | `piloto_vision.test.ts` | **VERDE** 12/12 |
| M2e | `piloto_vision.ts:155` | `if (accion.hayCaptcha)` → `if (false)` | `piloto_vision.test.ts` | **VERDE** 12/12 |
| M3a | `processor.ts` (`incluirPreguntaLibre: !viajeId`) | `→ true`: el analista se pone delante del chofer | `processor_dueno_maneja.test.ts` | **ROJA** 1/7 |
| M3b | `processor.ts` (`cuentaPropia.tenantId !== op.tenantId`) | `→ false`: se deja de ver el choque de tenants | `processor_dueno_maneja.test.ts` | **ROJA** 1/7 |
| M3c | `processor.ts` (bloque de oficina en el camino del chofer) | Lo apagué entero | `processor_dueno_maneja.test.ts` | **ROJA** 5/7 |
| M4 | `enrutar.ts:139` (`if (!sabeOperarlo)`) | `→ if (false)`: vuelve el silencio de los 25 comercios | `enrutar` + `avisar` | **ROJA** 4/24 |
| M5 | `enrutar.ts:204` (`repartir`) | Deja de propagar `cuentaCompartida` | `enrutar` + `avisar` + `cron/facturar/route` | **VERDE** 56/56 |
| M6 | `al_vuelo.ts:232` | `conCuenta` → `false` (se ignora el cofre) | `al_vuelo.test.ts` | **VERDE** 55/55 |
| M7 | `al_vuelo.ts:98` | `decidirAutofactura` ignora su 4º parámetro | `al_vuelo.test.ts` | **VERDE** 55/55 |
| M8 | `identificar.ts:48` | El dominio vuelve a ganar por ORDEN de lista | `identificar.test.ts` | **ROJA** 1/28 |
| M9 | `identificar.ts:93` | El texto anidado (G500 / G500 MEGASUR) vuelve a `null` | `identificar.test.ts` | **ROJA** 1/28 |
| M10 | `administracion.ts:141` (`fiscalCompleto`) | `→ false`: el alta deja de escribir los CINCO | `administracion.test.ts` | **ROJA** 3/31 |
| M11 | `avisar.ts:158` (`sendText`) | El texto bueno vuelve a tirarse, solo sale plantilla | `avisar.test.ts` | **ROJA** 1/10 |
| M12 | `portales_facturacion.ts:50-64` | Intercambié `forma` entre `usuario` y `contrasena` | `portales_facturacion.test.ts` | **VERDE** 7/7 |

**8 rojas / 11 verdes.** Las rojas se concentran en el foco «dueño que maneja»
(`processor.ts`, la pieza más grande del delta) y en `identificar.ts`; las
verdes, en todo lo que toca credenciales de portal.

## Pruebas que dependen del reloj o de la red (candidatas a intermitentes)

Nombradas con `archivo:línea`, ordenadas por margen medido.

| Prueba | Cota | Medido | Margen | ¿Cubierta por la red de CI? |
|---|---|---|---|---|
| `pagina_playwright.test.ts:582` | `< 3 000 ms` | **1 802 ms** | 1 198 ms | **NO** |
| `pagina_playwright.test.ts:558` | `>= 700 ms` (cota inferior) | 867 ms | 167 ms | **NO** |
| `pagina_playwright.test.ts:590` | `< 2 500 ms` | 484 ms | 2 016 ms | **NO** |
| `pagina_playwright.test.ts:557` | `< 4 000 ms` | 867 ms | 3 133 ms | **NO** |
| `pagina_playwright.test.ts:347` | `< 1 000 ms` | <100 ms | ~900 ms | **NO** |
| `pagina_playwright.test.ts:433` | `>= RETRASO_CATALOGO_MS − 200` | — | — | **NO** |
| `repo_tope.test.ts:75`, `:87` | `< TOPE(1 500) + 4 000` | — (socket TCP real) | ~2.5 s teóricos | **NO** |
| `config_tope.test.ts:61` | `< TOPE(1 500) + 4 000` | — (socket TCP real) | ~2.5 s teóricos | **NO** |
| `almacen_tope.test.ts:51` | `< 5 000 ms` | — (tope 50 + gracia 1 500) | ~3.4 s | **NO** |
| `escalar_viaje.test.ts:229` | `< 5 h + 5 000 ms` | — | 5 s | **NO** |
| `duplicados.test.ts:151` | mejor-de-nueve, umbral 20 | — | documentado | **SÍ** (`skipIf`) |
| `normas/fundamento.test.ts:148` | fracción de ms | — | — | **SÍ** (`skipIf`) |

Además, **sensibles al entorno más que al reloj**:
`pagina_playwright.test.ts:270-275` — el `beforeAll` lanza un Chromium real
**sin ningún guard**: si el binario de `playwright-core` no está en la caché de
la máquina, el archivo entero (28 pruebas) revienta en `beforeAll` con 30 s de
`HOLGURA` consumidos. En este entorno arrancó, pero `~/.cache/ms-playwright`
no existe: el binario se resuelve por otra ruta que nadie declara.

**Descartada como candidata:** `barrera.test.ts` (las cinco pruebas). Ver el
MEDIO de arriba — es lenta (3.57 s, con un `sleep` real de 2 003 ms en `:27`)
pero determinista: el `probe` es una secuencia indexada, no un reloj.

## Estado de los hallazgos abiertos de la ronda 18

`git diff --stat 8d608a4..HEAD` sobre los archivos implicados: **vacío**. Los
cinco siguen abiertos, ninguno tocado por el delta.

| Hallazgo ronda 18 | Estado hoy | Verificación |
|---|---|---|
| [ALTO] `requireVendedor` sin una sola prueba | **ABIERTO** | `grep -c requireVendedor src/lib/auth/guard.test.ts` → **0** |
| [ALTO] `facturacion_escritura.ts:404` y `:455` sin arnés | **ABIERTO** | `facturacion_escritura.test.ts` sin cambios en el delta |
| [ALTO] Las 4 rutas de `export/` a 0 líneas (IDOR documentado, cero anclado) | **ABIERTO** | `src/app/api/export/` sin cambios; sin archivo de prueba |
| [MEDIO] El área de la llave de `/v1` no atada al OpenAPI | **ABIERTO** | `src/app/api/v1/` sin cambios |
| [MEDIO] `comercial.ts` al 1.3% (Rentabilidad/Cartera/Cobranza) | **ABIERTO** | único import desde prueba sigue siendo de tipo |

## Lo que revisé y está bien

- **`processor_dueno_maneja.test.ts` es un arnés de verdad**, y es la pieza más
  grande del delta. Las tres mutaciones que se me ocurrieron sobre las tres
  decisiones nuevas de `processor.ts` —el interruptor del analista, la
  comprobación de choque de tenants, y el bloque entero— pusieron rojas 1, 1 y
  5 pruebas respectivamente, con mensajes que dicen QUÉ se rompió. Ejercita la
  función real (`await import('./processor')`), no una copia, y los mocks
  sustituyen colaboradores, no la lógica bajo prueba.
- **`identificar.test.ts` ancla las dos ramas nuevas.** Volver a `find` por orden
  de lista (M8) y desactivar la regla de anidamiento G500/G500 MEGASUR (M9)
  ponen rojo. El comentario de `identificar.ts:84-88` confiesa que la prueba
  ANTERIOR no lo cazaba y explica por qué («compara tokens IDÉNTICOS entre
  comercios, así que nunca vio que uno case DENTRO de otro»); el arreglo llegó
  con la prueba que faltaba.
- **`administracion.test.ts` prueba lo que importa del alta.** M10 pone rojas 3.
  Y la de `:112-119` verifica algo poco común y correcto: que el CP malo se
  rechace **antes** de tocar la base (`expect(from).not.toHaveBeenCalled()`),
  que es la diferencia entre un error y un tenant a medio crear.
- **`avisar.test.ts` cerró el hueco que nombraba.** M11 pone rojo el caso
  «sale el texto con la liga y NO se gasta plantilla». Los tres caminos
  (texto / plantilla / los dos caídos) están cubiertos y el tercero afirma que
  `r.texto` sigue disponible para reenviar a mano.
- **`enrutar.test.ts` ancla `sin_robot`**, que es el silencio que el delta vino a
  matar: M4 pone rojas 4 pruebas en 2 archivos. Y `:65-76` verifica el texto por
  lo que NO dice («pide cuenta», «se intentó solo»), que es la forma correcta de
  fijar un mensaje al usuario.
- **`portales_facturacion.test.ts:21-24` sí protege lo derivado.** La assertion
  de igualdad exacta entre `CONECTORES_PORTALES_FACTURACION` y los comercios con
  `requiereCuenta` sí caza una lista escrita a mano en paralelo, que es lo que
  el archivo promete.
- **`fiscal.ts`** (+63 del delta) queda cubierto por rebote: `validarDatosFiscales`
  se extrajo de `guardarDatosFiscales` y `fiscal.test.ts:51-91` ya ejercita las
  cinco validaciones (RFC con dígito verificador, razón social, CP de 5, régimen
  y uso fuera de catálogo) a través del llamador. No hay regresión ahí.
- **`cuentas.ts` falla cerrado y eso sí está probado.** Las tres pruebas de
  `cuentasCompartidas` cubren las tres formas de no saber (base caída, cofre sin
  configurar, sin credencial) y todas devuelven vacío en vez de lanzar. Lo que
  falta es el filtro, no el fallo cerrado.

## Lo que NO alcancé a revisar

- **`src/app/admin/mapa-prospectos/[id]/detalle.tsx` (280 líneas nuevas).** Es
  `.tsx`, o sea excluido de la medición de cobertura a propósito
  (`vitest.config.ts`), y no tiene prueba. No lo leí completo: solo verifiqué
  que consume `getDetalleProspecto`, que es de donde sale el ALTO del score.
  Tampoco `cerebro.tsx` (+80) ni `admin/flotas/page.tsx` (+66).
- **`playwright_base.ts` (+55) y `pagina_playwright.ts` (+60).** El `Inventario`
  del DOM que alimenta al piloto —`inventario()`, la detección de `captcha[]`—
  es lo que decide si la regla 2 puede siquiera dispararse, y no muté nada ahí.
  `playwright_base.test.ts` existe pero no lo audité.
- **El camino de OFICINA de `atenderTextoOficina`** (`processor.ts`, la rama
  `if (!op)`, con `incluirPreguntaLibre: true`). Muté las tres decisiones del
  camino del CHOFER; la extracción se llama desde dos sitios y solo verifiqué
  uno. No sé si mutar el lado de oficina pone rojo algo.
- **`al_vuelo.ts` más allá de `decidirAutofactura`.** 55 pruebas y no miré cuáles
  ejercitan `facturarAlVuelo` de verdad contra sus escrituras.
- **La cobertura numérica del delta.** No corrí `--coverage` (la suite completa
  está prohibida en esta corrida y hay 11 agentes más), así que no tengo el
  porcentaje de `piloto_vision.ts`, `cuentas.ts` ni `prospectos-mapa.ts`. Todo
  lo de arriba se sostiene por mutación dirigida y lectura, no por el reporte.
- **`supabase/verificaciones.sql`** y los bloques de las migraciones 0140-0143.
  Sigue sin base en este entorno; mismo pendiente que la ronda 18.
- **`motivo_login.test.ts` (+70) y `reenvio_enlace.test.ts` (+50)**, los dos
  commits del magic link que la ronda 18 confesó no haber mirado. Entraron al
  delta y no los muté: se me fue el presupuesto en el piloto y el cofre.
