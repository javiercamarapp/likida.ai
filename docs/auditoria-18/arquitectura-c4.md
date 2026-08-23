# Arquitectura y mantenibilidad — auditoría 18 · continuación 4

**Nota: 4/10** (antes 5). Razón del movimiento: **deuda que cobró factura**.

`repo.ts:18-31` declara desde el 22-ago que el UUID del CFDI vive «EN UNA SOLA
ORTOGRAFÍA», y la 0158 lo puso como CHECK en cuatro tablas. La frontera nunca
existió en el código: hoy hay **cinco normalizadores del mismo campo, cuatro a
minúsculas y uno a MAYÚSCULAS**, y el que va a mayúsculas es precisamente el
único escritor manual del panel. La base lo rechaza. La advertencia era prosa
(«repo.ts es la frontera única pretendida»), y ya ocurrió.

Contra eso, el delta trae el mejor trabajo de arquitectura que ha entrado a este
repo —20 RPC nuevos con prueba de equivalencia JS-vs-RPC de verdad, verificados
además contra Postgres real en CI, y una 0151 que se NIEGA por escrito a
duplicar la ley fiscal en SQL—. Eso es lo que impide bajar más. Pero el ancla
del rubro es literal: *«4 o menos si la misma lógica de dinero vive en más de un
archivo»*, y hoy la misma normalización de un folio fiscal vive en cinco.

**El riesgo mayor del rubro hoy:** la única pantalla desde la que una persona
puede pegarle a mano el folio fiscal a un ticket escribe el UUID en mayúsculas
contra un CHECK que exige minúsculas — falla siempre, y el mensaje que ve el
contralor le pide que lo intente otra vez.

---

## Verificación de los abiertos de la c3

| Hallazgo (c3) | Hoy | La evidencia |
|---|---|---|
| **CRÍTICO** — `vista.tsx` reconstruye la cubeta fiscal del motor (ARQ-C3-1) | **CERRADO** | `src/app/dashboard/[id]/vista.tsx:169` es `const TIPOS_MALOS = new Set<string>(NO_DEDUCIBLE_ISR)` — importa la constante del motor, ya no la copia. `:171` añade `TIPOS_POR_CONFIRMAR = new Set(POR_CONFIRMAR)`, y `:177-181` saca `duplicado`/`monto_invalido`/`comprobante_no_fiscal` de la cubeta fiscal a un mapa de «problemas del comprobante» que se nombran por lo que son. Los dos casos de mi escenario quedan bien: `rfc_receptor` → «No deducible» (`estado_renglon.test.ts:50`), `combustible_efectivo` → «Por confirmar» (`:54`). **Y trajo la guardia que faltaba**: `src/app/dashboard/[id]/estado_renglon.test.ts` (11 casos) recorre `NO_DEDUCIBLE_ISR` y `POR_CONFIRMAR` con `it.each` y falla si el panel se separa del motor. Sobrevive al merge: `35ba042` está en el árbol de `6062a9b`. |
| **ALTO** — el contrato del sufijo, cuatro implementaciones; el sidebar inventa `?vista=demo` | **REINCIDENTE, y ahora son CINCO** | `sidebar-nav.tsx:76` sigue palabra por palabra: `: rol === 'superadmin' ? '?vista=demo' : ''`. `sufijo.ts:20-25` (canónico, con `encodeURIComponent`), `page.tsx:36-37` (copia en línea, sin encode), `tenant-efectivo.ts` (`sufijoPrevisualizacion`). La **quinta** la añadió este delta: `src/app/dashboard/paginar-campos.ts:10-18` (`camposDeSufijo`), para los `<input type="hidden">` de los `<form method="get">` de FE-12. Coincide con el canónico, pero es una quinta lectura del mismo contrato sin nada que las case: `sufijo.test.ts` sigue probando **solo** `sufijoTenant`. |
| **ALTO** — el aviso al encargado no sabe de la cuenta compartida | **REINCIDENTE, sin un solo cambio (tercera ronda)** | `avisar.ts:70` sigue siendo `repartir(tickets, sabeOperarlo)` — 2 de 3 argumentos. `avisar.ts:98` sigue siendo `enrutar(t, t.comercio ? sabeOperarlo(t.comercio.clave) : false)` — 2 de 3. `enrutar.ts:78` sigue con `cuentaCompartida = false` por default y `:106` sigue evaluando `requiereCuenta && !cuentaCompartida` antes que todo. |
| **ALTO** — `portalesOperables()` contesta otra pregunta | **REINCIDENTE, sin un solo cambio** | `registro.ts:194-198` sigue devolviendo `[...PORTALES_CONOCIDOS, ...COMERCIOS_PILOTABLES]` con la palanca puesta; `piloto_vision.ts:31` sigue diciendo «EL PILOTO NO EMITE. NUNCA, ni en modo `emitir`». |
| **MEDIO** — el rótulo de `necesidad_pct` dos migraciones atrás | **REINCIDENTE, sin un solo cambio** | `prospectos-mapa.ts:291` sigue diciendo «vacante de liquidación/cuadre/**auxiliar administrativo +50** (cualquier otra vacante +25)», y `:283-284` sigue prometiendo «misma fuente que el cálculo, no una copia que se desincronice». La 0142 condiciona ese +50 y la 0143 lo quita en otro caso. |
| **MEDIO** — `fiscalListo()` copia 5 de las 6 condiciones | **REINCIDENTE, sin un solo cambio** | `admin/flotas/page.tsx:34-38` sigue con los cinco campos y el comentario «Es la condición exacta de `getFiscalDeFlota`». La tercera copia se movió de línea pero está: `administracion.ts:165-166`. La verdad sigue exigiendo seis: `flota_fiscal.ts:63-77` pide además `correoDeFacturacion`. |
| **MEDIO** — `procesarTurno`, 2,157 líneas | **REINCIDENTE, y peor** | `processor.ts:735-3103` = **2,369 líneas** (medidas por profundidad de llaves), **76 `return`**, **32 bloques `try`**, en un archivo de 3,103 líneas con 50 imports. Ayer 2,157; el delta le sumó **212 líneas** sin partirla. Sigue saltándose `repo.ts` en `:128` (`viaje`), `:132` (`posicion`) y `:269` (`operador`). |
| **BAJO** — `reengancharPendiente` sin call site | **REINCIDENTE, sin un solo cambio** | `despacho_wa.ts:238` y `asignar_wa.ts:298` siguen aceptando `opciones: { reengancharPendiente?: boolean } = {}`, y ramificando en `:362` / `:359`. Los dos ÚNICOS llamadores de producción, `processor.ts:563-565` y `:579-581`, pasan **tres** argumentos (`cuenta`, `from`, `texto`) — ni siquiera `ahora`. Las únicas menciones que quedan están en `despacho_wa.test.ts:206,215`. |
| **BAJO** — `LibroDelViaje` sin llamador | **REINCIDENTE, sin un solo cambio** | `viajes/libro.tsx:70` sigue exportado y sin un solo consumidor: `rg LibroDelViaje src/` devuelve la definición y **un comentario** (`libro_viaje.ts:45`). |
| **BAJO** — tres copias del mapa de estatus de viaje | **REINCIDENTE, sin un solo cambio** | `resumen-visual.tsx:103` (la exportada, con su porqué en `:98-102`), `viajes/vista.tsx:31-35` (misma forma, sin importarla) y `viajes/libro.tsx:55-59` (tercera, con `fg`/`bg` a mano). `tablero-operacion.tsx:3` es el único que la importa. |

---

## Hallazgos

### [CRÍTICO] El folio fiscal tiene cinco normalizadores y uno va al revés: la captura manual de facturas escribe el UUID en MAYÚSCULAS contra un CHECK que exige minúsculas — falla siempre, y el panel contesta «Inténtalo de nuevo»

`src/app/dashboard/agentes/facturas/page.tsx:69`, `:78-83`, `:86-90` ·
`src/lib/likida/facturacion/pendientes.ts:175-179` ·
`src/lib/likida/repo.ts:18-35` ·
`supabase/migrations/0158_integridad_fiscal.sql:427-435` ·
`src/lib/likida/facturacion/pendientes.test.ts:105`

**Los cinco lados.** `repo.ts:18-31` es explícito y está escrito para que nadie
lo repita:

> *«EL UUID DEL CFDI, EN UNA SOLA ORTOGRAFÍA (auditoría 18, DAT-26). El SAT
> imprime el folio fiscal en MAYÚSCULAS … y el OCR y los portales lo devuelven
> en minúsculas. `uq_gasto_cfdi_uuid` y `factura_cfdi_unico` son índices sobre
> `text`: con las dos ortografías vivas, el MISMO comprobante entraba dos veces
> y su IVA se acreditaba dos veces. Se normaliza en la ESCRITURA … La migración
> 0158 lo hace cumplir con un CHECK en las cuatro tablas.»*

Pero la normalización no tiene dueño: son **cinco funciones distintas**, y no
todas dicen lo mismo.

| Dónde | Qué hace | ¿Cumple el CHECK? |
|---|---|---|
| `repo.ts:33` `uuidCfdi()` | `trim().toLowerCase()` | sí |
| `intake/cfdi_xml.ts:311` | `uuidRaw.toLowerCase()` | sí |
| `facturacion_escritura.ts:162` | `trim().toLowerCase()` | sí |
| `facturacion_escritura.ts:456` | `trim().toLowerCase()` | sí |
| **`facturacion/pendientes.ts:177` `validarUuidCfdi()`** | **`trim().toUpperCase()`** | **NO** |

La 0158 remata la lista con
`check (cfdi_uuid is null or cfdi_uuid = lower(cfdi_uuid))` sobre `gasto`,
`cfdi_xml`, `factura_emitida` y `factura_proveedor`
(`0158:427-431`, sin condición: el `do $$` lo aplica en las cuatro).

**Escenario con valores.** El contralor abre `/dashboard/agentes/facturas`, la
cola de «por facturar». Un ticket de OXXO Gas de **$1,840** ya lo facturó a mano
en el portal y el portal le dio el folio fiscal. Despliega la Mesa de trabajo
(`cola-jefe.tsx:108`), pega en el campo `uuid` (`cola-jefe.tsx:176`) el UUID que
imprime el PDF del CFDI: `A3BB189E-8BF9-3888-9912-ACE4E6543002`.

1. `page.tsx:69` → `validarUuidCfdi(...)` → `pendientes.ts:177` lo pasa por
   `.toUpperCase()` → `'A3BB189E-8BF9-3888-9912-ACE4E6543002'`.
2. `page.tsx:78-83` → `update gasto set cfdi_uuid = 'A3BB…', cfdi_orden = 1`.
3. Postgres: **violación de `gasto_cfdi_uuid_minuscula`, SQLSTATE `23514`**.
4. `page.tsx:86` solo traduce `23505` (el índice único). El `23514` cae al
   `else` de `:89-90`: `logger.error('facturas.marcar.fallo')` y en pantalla
   **«No se pudo guardar. Inténtalo de nuevo.»**
5. Lo intenta otra vez. Y otra. **No hay entrada que funcione**: el único UUID
   que pasaría es uno sin ninguna letra `a`–`f` en sus 32 hex, que es un caso
   que no se da. La minúscula tampoco salva: `validarUuidCfdi` la sube a
   mayúscula antes de escribir.

Y el efecto no termina en el mensaje: `contarConCfdi` —la cifra «ya facturados»
del encabezado de esa misma pantalla— nunca se mueve, así que el panel muestra
un ticket en la cola de pendientes que el contralor **sí** facturó en el portal,
para siempre.

**Intento de refutación (falló).** ¿Hay otra normalización entre la página y la
base? No: el objeto del `update` (`:79`) es literal, `uuid` entra tal cual.
¿Existe una prueba? Sí, y ancla el lado equivocado:
`pendientes.test.ts:105` afirma
`expect(validarUuidCfdi(' a3bb189e-…')).toBe('A3BB189E-…')` — verde, y
documenta como correcta la mayúscula que la base rechaza. La carpeta
`src/app/dashboard/agentes/facturas/` no tiene un solo `*.test.*`, así que la
server action nunca se ejerce. ¿Lo caza `ci-postgres.yml`? No: ese job aplica
las 163 migraciones y corre `verificaciones.sql`, que ataca la BASE — no ejecuta
código de `src/`, y ningún bloque de la batería escribe un `cfdi_uuid` en
mayúsculas. ¿Y el otro escritor sin normalizar,
`facturacion/al_vuelo.ts:563-569` (`escribirUuid`, que escribe el `cfdiUuid`
crudo que el adaptador raspó del portal en `playwright_base.ts:362`)? Cae en el
mismo CHECK, pero ese camino sí lo detecta: el `else` de `:578` levanta
`bloquear()` y deja el motivo por escrito. Es el camino del panel el que no
tiene esa red — y es el que está encendido hoy.

**Consecuencia.** Es la única forma que tiene una flota real de cerrar un ticket
que facturó a mano, y está muerta. En la sala, el contralor pega el folio que
acaba de sacar del portal y el producto le contesta que lo intente otra vez: el
demo se cae en la pantalla que se llama «el agente de facturas». Para quien
mantiene: `repo.ts:18-31` y la 0158 declaran el invariante y nadie lo hizo
cumplir en el código; la única prueba que existe pinta de verde la violación.

**Causa raíz probable.** `validarUuidCfdi` nació como **validador de forma**
(donde `toUpperCase()` es inocuo para un regex `/i`) y se reusó como
**normalizador de escritura**, sin pasar por el `uuidCfdi()` de `repo.ts` que
existe para eso.

---

### [ALTO] El numerador del 15% de la RFA 2.9 tiene dos definiciones —una en SQL y otra en TS— y las dos están cableadas dentro del MISMO cálculo · REINCIDENTE (MAPA §6, abierto desde la c3)

`supabase/migrations/0112_agregados_rpc.sql:151` (y `0084:19`) ·
`src/lib/likida/repo.ts:1126-1140` (`getAcumuladoCombustible`) ·
`src/lib/likida/cuadre/desde_db.ts:88-96` ·
`src/lib/likida/cuadre/engine.ts:110-140`, `:449`, `:486` ·
`src/lib/likida/fiscal.ts:815`

**Los dos lados, y están enchufados uno al otro.** La regla del cubo del 15% se
corrigió en la c3 (FISC-C3-1) y quedó escrita como lista cerrada por exclusión:
`medioNoAdmitidoCombustible` (`engine.ts:130-140`) es «medio distinto a
{02,03,04,05,28,29}», y `engine.ts:111-113` deja por escrito por qué UN valor no
alcanza:

> *«NO "cualquiera que no sea 01 efectivo" … `'06' Dinero electrónico`,
> `'08' Vales`, `'12' Dación en pago`, `'17' Compensación` y `'23' Novación`
> salían «Deducible para ISR» en verde con su IVA acreditado.»*

El SQL que produce el **acumulado previo del ejercicio** —el otro sumando de la
misma cuenta— nunca se movió: `0112:151` sigue siendo
`sum(monto) filter (where forma_pago = '01')`. Y `desde_db.ts:93` resta los
gastos de ESTE viaje con el mismo criterio viejo (`g.formaPago === '01'`), a
propósito, para que la resta cuadre contra la RPC. Resultado: dentro de
`engine.ts:483-486`, `previoSinEste` está contado con la regla vieja y
`efectivoAcumuladoEjercicio` con la nueva.

**Escenario con valores.** *Transportes del Bajío*, ejercicio 2026,
`facilidad15 = true`. Compras de diésel del año:

- Enero–julio, ya liquidadas: **$50,000** de diésel pagados con la tarjeta de
  una red no autorizada por el SAT, que el CFDI timbra como `'06' Dinero
  electrónico`.
- Este viaje: una carga de diésel de **$10,000** en efectivo (`'01'`).
- Total de combustible del ejercicio: **$60,000** → tope del 15% = **$9,000**.

Lo que pasa:

1. `sumar_combustible_ejercicio` filtra `forma_pago = '01'` → `efectivo =
   $10,000` (los $50,000 de `'06'` son invisibles), `total = $60,000`.
2. `desde_db.ts:93` resta este viaje (también `'01'`) → `efectivoPrevEjercicio
   = max(0, 10,000 − 10,000) = **$0**`.
3. `engine.ts:485-490`: `previoSinEste = 0`, `cupoRestante = $9,000`,
   `dentro = $9,000`, `excedenteDeEste = **$1,000**`.
4. El PDF y el panel imprimen «el excedente de **$1,000** de ESTE comprobante NO
   se deduce» (`engine.ts:503`).

Lo que la **regla del propio motor** dice: el cubo son
$50,000 (`'06'`) + $10,000 (`'01'`) = **$60,000** contra un tope de $9,000 →
**$51,000 no deducibles**. La liquidación le promete al contralor una deducción
de **$50,000 que no tiene**, y ni el panel ni el PDF lo señalan: los $50,000 de
`'06'` no aparecen en ninguna diferencia porque nunca estuvieron en el
denominador ni en el numerador.

**Intento de refutación (falló).** ¿Lo cubre `fiscal.ts`? No: `fiscal.ts:815`
usa `medioNoAdmitidoCombustible` (el lado nuevo) y `tope15DeGastos` recalcula
**solo sobre los gastos ya leídos del periodo**, así que el panel fiscal y el
motor dan cifras distintas del mismo tope. ¿La caza una prueba? `repo_acumulado.test.ts`
compara la suma JS vieja contra la RPC — las dos con `'01'`; prueba que la RPC
reprodujo fielmente el criterio equivocado. ¿Está en verificaciones.sql? El
bloque de la 0084/0112 comprueba la suma, no el catálogo de formas de pago.

**Consecuencia.** Para el contralor y para el SAT, una deducción prometida que
no existe. Para quien mantiene, es el caso de libro que la propia 0151 se negó
a crear —*«reescribirla en SQL la duplicaría en dos lenguajes que habría que
mantener sincronizados»* (`0151_fiscal_agregado.sql:12-15`)— realizado dos
migraciones antes, y el arreglo de FISC-C3-1 tocó el lenguaje que sí podía
tocar y dejó el otro.

**Causa raíz probable.** El cubo del 15% se implementó dos veces —predicado en
TS, `filter` en SQL— y solo el de TS tiene dueño; la corrección de la c3 no
podía alcanzar al de SQL porque aquí no hay base donde aplicar una migración.

---

### [ALTO] `repo.ts` no es la frontera de datos: 128 archivos de producción consultan Supabase directo (591 llamadas), y el único guardia que existe es una lista a mano de 16

`src/lib/likida/repo.ts` (30 de las 591) ·
`src/lib/likida/acotada_guardiana.test.ts:14-52` ·
`src/lib/likida/libro_viaje.ts:562-660` ·
`src/app/dashboard/agentes/facturas/page.tsx:78`

**El conteo, hecho a mano.** Archivos de producción (`.ts`/`.tsx` sin
`.test.`/`.fixture.`/`.pruebas.`) con al menos un `.from('` o `.rpc('`,
descontando líneas de comentario: **128 archivos, 591 llamadas**. `repo.ts`
tiene **30**. Escritores por tabla, contando solo los `.from('X')` seguidos de
`insert|update|upsert|delete`: `viaje` **10**, `tenant` **5**, `gasto` **4**,
`operador` **4**, `wa_conversacion` **4**.

**El guardia no cierra la clase.** `acotada_guardiana.test.ts:14-52` es una
**allowlist literal de 16 rutas**. Todo archivo que no esté ahí puede nacer con
consultas sin techo y la suite sigue verde. Hoy: **73 archivos fuera de la lista
con menos `acotada(` que consultas**, hasta **253 llamadas sin techo**
(`suscripcion.ts` 30/0, `qa-motor.ts` 12/0, `agentes/cobranza.ts` 12/0,
`libro_viaje.ts` 11/0, `saas/transferencia.ts` 9/0). Contrasta con el patrón que
la c3 premió: `bitacora_escritura.test.ts:24` barre `fuentesDeProduccion('src')`
y **falla con la lista de culpables**; `formato.test.ts:244` hace lo mismo con la
zona horaria. Esos cierran una clase de fallo. Éste cierra 16 archivos.

**Qué se desincroniza, y cómo se ve.** El CRÍTICO de arriba es la demostración
exacta: `agentes/facturas/page.tsx` escribe `gasto.cfdi_uuid` sin pasar por
`repo.ts`, y por eso se saltó `uuidCfdi()`. Ningún guardia lo iba a detener —el
archivo no está en la allowlist, y no hay ninguna prueba que barra «quién
escribe `cfdi_uuid`»— aunque `repo.ts:18-31` diga que esa normalización es
obligatoria. La regla existe en un comentario y en un CHECK de Postgres; entre
los dos no hay nada.

**Consecuencia.** El equipo que mantiene esto no tiene forma de saber, al añadir
una pantalla, qué invariantes de escritura le aplican: la respuesta está
repartida en comentarios de módulos que su archivo no importa. Cada frontera
nueva que se declare («el UUID en una ortografía», «toda lectura con techo»)
nace cubriendo solo los archivos que alguien se acordó de listar.

**Causa raíz probable.** Las fronteras de este repo se declaran en prosa y se
hacen cumplir con pruebas estructurales solo cuando alguien las escribe; las tres
que barren `src/` completo funcionan, y las que se hicieron con allowlist no.

---

### [MEDIO] Hay dos `getViajesRegistro` exportados: el vivo (keyset en SQL) y el muerto que quedó en `analytics.ts` con OFFSET — mismo nombre, distinta firma, y una cuarta copia del predicado «escalados» adentro

`src/lib/likida/analytics.ts:1036-1090` (muerto) ·
`src/lib/likida/viajes_registro.ts:129` (vivo) ·
`supabase/migrations/0154_viajes_registro_indices.sql:90-107`, `:258`

**Los dos lados.** El delta movió el Registro de Viajes a keyset SQL: los dos
consumidores de producción —`dashboard/viajes/page.tsx:8` e
`inicio-contenido.tsx:31`— importan `getViajesRegistro` de
`@/lib/likida/viajes_registro`. La versión vieja **sigue exportada** en
`analytics.ts:1038`, con `.range(desde, desde + porPagina)` (OFFSET) y firma
`{ pagina }` en vez de `{ cursor }`. **Cero llamadores de producción, cero
pruebas** (`viajes_registro.test.ts` prueba la nueva). Los comentarios ya la
dan por retirada en pasado —`viajes_registro.ts:9` («paginaba con `.range()`»)
y `viajes_registro.test.ts:5` («vivía en analytics.ts»)— y no es cierto.

**Qué se desincroniza, y cómo se ve.** El predicado «viaje escalado» está ahora
escrito **cuatro veces a mano**:

1. `0154:118` — `viaje_registro_pasa_filtro`: `p_estatus in ('abierto','en_cuadre') and p_escalado_en is not null and p_aceptado_en is null` (la LISTA del registro).
2. `0154:258` — `conteos_viajes_tenant`, el mismo predicado copiado en el `count(*) filter` (la INSIGNIA del encabezado). Su propio `comment on function` dice «Mismos predicados que contarViajes/contarEscalados (analytics.ts)» — o sea, admite ser una copia.
3. `analytics.ts:982-984` — `contarEscalados`, la alerta del Inicio.
4. `analytics.ts:1056` — dentro de la función muerta.

Quien mañana cambie la definición (p. ej. exigir además `avisado_en is not
null`, que es lo que `escalar_viaje.ts:105` ya mira) tiene que encontrar cuatro
sitios en dos lenguajes. Si toca los dos de la 0154 y no `contarEscalados`, el
badge del Registro dice «Escalados 7» y la alerta del Inicio dice «12 viajes
escalados» en la misma sesión, las dos verdes. Y el buscador por nombre no
ayuda: `rg getViajesRegistro` devuelve la versión viva y esconde la muerta
detrás del mismo identificador.

**Consecuencia.** 55 líneas de una ruta de paginación que la 0154 midió y
descartó (108 buffers por página vs **100,924** con OFFSET a 100k) siguen
disponibles bajo el nombre correcto, para que el siguiente `import` las elija
por autocompletado.

**Causa raíz probable.** La migración creó el módulo nuevo y no borró la función
vieja; el `export` compartido de nombre hizo invisible el residuo a la búsqueda
que normalmente lo encontraría.

---

### [MEDIO] Dos formas de paginar un catálogo, y la que usan los tres Registros del panel no llega a SQL — justo lo que la 0160 declaró terminado

`src/app/dashboard/paginar-registro.ts:68-88` ·
`src/lib/likida/operacion.ts:148-162` (`getUnidades`) ·
`src/lib/likida/repo.ts:172-217` (`buscarCatalogo`/`contarCatalogo`) ·
`supabase/migrations/0160_catalogos_busqueda_indices.sql:1-16`

**Los tres mecanismos.** El delta dejó el panel con tres paginaciones distintas:

| Cómo | Dónde | ¿Llega a SQL? |
|---|---|---|
| keyset por cursor | `viajes_registro.ts:129` (mig. 0154) | sí |
| `limit`/`offset` en la RPC | `comercial.ts:322` (`cobranza_tenant`, `p_limite`/`p_desplazamiento`) | sí |
| `slice()` en memoria | `paginar-registro.ts:82` | **no** |

Los consumidores del tercero son los tres Registros del panel del cliente —
`unidades/vista.tsx:109`, `operadores/vista.tsx:78`, `clientes/vista.tsx:168` y
`:384`— más `admin/equipo/page.tsx:60`. Y la lectura que los alimenta sigue
siendo un volcado: `getUnidades` (`operacion.ts:151-161`) usa `traerTodo` sobre
`unidad` **y** sobre `mantenimiento`, sin `q` ni `limit`.

**Qué se desincroniza, y cómo se ve.** Con las cifras que la propia 0160 usa
—5,000 unidades, 7,500 operadores—: al abrir `/dashboard/unidades?p=1`, la
página trae **las 5,000 filas de `unidad` en 5 páginas de PostgREST más las
órdenes de mantenimiento abiertas**, arma 5,000 objetos en memoria, normaliza
5,000 cadenas para el filtro (`paginar-registro.ts:77`) y pinta **25**. Escribir
«hern» en la caja repite exactamente lo mismo. El encabezado del propio archivo
lo declara fuera de su alcance —*«Lo demás —que la consulta traiga menos filas
de la base— es del lado de la lectura y no de este archivo»* (`:10-12`)— y ese
lado nunca se hizo, mientras la 0160 se titula «LOS CATÁLOGOS DEL PANEL SE
BUSCAN, YA NO SE VUELCAN» y creó `operador_catalogo_idx`,
`cliente_catalogo_idx` y `unidad_catalogo_idx` para un `buscarCatalogo` que
estas tres pantallas no llaman.

**Consecuencia.** El índice existe, la búsqueda por trigramas existe, el keyset
existe — y las tres pantallas de catálogo del cliente usan ninguno. Para quien
mantiene, «cómo se pagina en este repo» tiene tres respuestas y la elección
depende de qué archivo copiaste.

**Causa raíz probable.** FE-12 (paginación de pantalla) y FE-2/0160 (búsqueda
en base) entraron el mismo día por dos frentes distintos y nadie unió las
mitades: FE-12 resolvió el HTML y dio por hecho que «la lectura» era de otro.

---

### [MEDIO] `procesarTurno` creció otras 212 líneas: 2,369 en una función · REINCIDENTE (c2 MEDIO 3, c3 MEDIO 3)

`src/lib/likida/processor.ts:735-3103`

Tercera ronda seguida, y cada una más larga: 2,153 → 2,157 → **2,369**. Medida
por profundidad de llaves desde `async function procesarTurno` (`:735`) hasta su
cierre (`:3103`). Dentro: **76 `return`**, **32 bloques `try`**. El archivo tiene
3,103 líneas y **50 imports** en la cabecera, y se salta `repo.ts` en `:128`
(`.from('viaje')`), `:132` (`.from('posicion')`) y `:269` (`.from('operador')`).

**Qué se desincroniza, y cómo se ve.** El delta le enchufó funcionalidad nueva
(el drenado de pendientes, el cuadre real con el LLM caído) *dentro* de la misma
función. La consecuencia concreta ya la vimos en esta misma ronda: el
`reengancharPendiente` que `despacho_wa.ts:228-236` documenta como el desempate
del chofer en ruta está **inalcanzable** porque los dos call sites reales viven
en `:563` y `:579` de esta función y pasan tres argumentos. Nadie lo notó en
tres rondas porque la explicación está en un archivo y la decisión en otro, a
1,800 líneas de su propio inicio.

**Consecuencia.** Es el archivo más caro de cambiar del repo, está en el camino
del dinero, y el delta más grande de su historia lo dejó un 10% más largo.

**Causa raíz probable.** El pipeline entrante nunca se partió por fase
(identificar → autorizar → despachar por tipo → responder); cada funcionalidad
nueva encuentra sitio dentro del `if` que le queda cerca.

---

### [MEDIO] `fiscalListo()` sigue copiando cinco de las seis condiciones y anunciándose como «la condición exacta» · REINCIDENTE (c2 MEDIO 2, c3 MEDIO 2)

`src/app/admin/flotas/page.tsx:34-38` · `src/lib/likida/administracion.ts:165-166` ·
`src/lib/likida/facturacion/flota_fiscal.ts:63-77`

Sin un solo cambio, tercera ronda. La verdad exige **seis**: los cinco del
receptor **y** un correo de facturación (`flota_fiscal.ts:69-73`: sin `correo`,
`getFiscalDeFlota` devuelve `flota: null` con el motivo «no hay a dónde mandar
el CFDI»). `page.tsx:34` reimplementa cinco con el comentario «*Es la condición
exacta de `getFiscalDeFlota`*»; `administracion.ts:165-166` es la tercera copia
del mismo `rfc && razonSocial && regimenFiscal && codigoPostalFiscal && usoCfdi`.

**Escenario con valores.** Javier da de alta *Transportes del Bajío* con los
cinco datos fiscales y deja vacío el correo del administrador. `fiscalListo(fd)`
= `true` → el alta no avisa nada. Semanas después el cron de facturación entra,
`getFiscalDeFlota` devuelve `falta = ['no hay a dónde mandar el CFDI…']`, no
abre navegador y responde 200. Ni un ticket facturado, y el único aviso que
existía se calló.

**Consecuencia.** Es el hueco que `administracion.ts:128-131` dice haber cerrado
—«*el hueco aparecía semanas después, como un cron que no hacía nada, sin un
error que mirar*»— reabierto por la copia de la condición en la misma pantalla
que lo arregla.

**Causa raíz probable.** El alta se arregló escribiendo un tercer predicado en
vez de preguntarle a `getFiscalDeFlota`.

---

### [BAJO] El contrato del sufijo ya tiene cinco implementaciones · REINCIDENTE (c3 ALTO 1), con una copia nueva

`src/app/dashboard/paginar-campos.ts:10-18` (**nueva**) ·
`src/app/dashboard/sufijo.ts:20-26` (canónica) ·
`src/app/dashboard/sidebar-nav.tsx:69-83` ·
`src/app/dashboard/page.tsx:36-37` ·
`src/lib/auth/tenant-efectivo.ts` (`sufijoPrevisualizacion`)

El escenario del `?vista=demo` que abrí en la c3 sigue intacto y sin cambios
(`sidebar-nav.tsx:76`); lo bajo a BAJO **solo** porque no encontré evidencia
nueva y el hallazgo se sostiene tal cual está escrito en `arquitectura-c3.md`.
Lo que sí es nuevo: `camposDeSufijo` (FE-12) es la **quinta** lectura del mismo
contrato. Coincide hoy con `sufijoTenant`, pero llegó por la puerta de siempre —
un caso nuevo (los `<input type="hidden">` de un `<form method="get">`) que
necesitaba la misma regla con otra forma de salida, y se resolvió copiándola.
`sufijo.test.ts` sigue probando una sola de las cinco.

**Consecuencia.** El contrato que existe para que el superadmin no pierda la
flota que eligió se declara en cinco archivos y se prueba en uno.

---

### [BAJO] `reengancharPendiente` sigue en el árbol sin nadie que lo pase · REINCIDENTE (c3 BAJO 1)

`src/lib/likida/despacho_wa.ts:238`, `:362` · `src/lib/likida/asignar_wa.ts:298`, `:359` ·
`src/lib/likida/processor.ts:563-565`, `:579-581`

Comprobado hoy, como se me pidió: los dos módulos siguen aceptando
`opciones: { reengancharPendiente?: boolean } = {}` y ramificando con él. Los
**dos únicos** llamadores de producción son `processor.ts:563` y `:579`, y los
dos llaman con **tres** argumentos (`{ tenantId, rol }`, `from`, `texto`) — ni
`ahora` ni `opciones`. Las únicas menciones restantes en todo `src/` están en
`despacho_wa.test.ts:206,215`.

**Consecuencia.** La suite verde afirma un comportamiento que la aplicación no
puede alcanzar, y `despacho_wa.ts:228-236` explica cuándo se usa una rama que
nadie enciende — mientras el caso real lo maneja `processor.ts:558`
(`opciones.incluirDespacho`) con otro mecanismo, dos archivos más allá.

**Causa raíz probable.** El merge tomó el lado de `master` en `processor.ts`
—decisión correcta, es más amplia— y no barrió el parámetro que el lado de la
rama había añadido río abajo. Tres rondas después sigue sin barrerse.

---

## Lo que revisé y está bien

- **La agregación en SQL se hizo con la disciplina correcta, y lo verifiqué en
  vez de creerlo.** Mapeé los **24 agregados nuevos** (0150 ×11, 0151 ×1,
  0152 ×7, 0153 ×1, 0154 ×3, más los de 0112) contra sus pruebas: **ninguno
  quedó sin espejo**. `analytics_agregados_0150.test.ts:344-433` compara la
  **reducción JS vieja** (copias congeladas, no la nueva) contra la función
  nueva + el reductor de `analytics_rpc_0150.fixture.ts`, sobre el mismo dataset
  y con dos flotas (`:418`, el caso de aislamiento). `comercial_equivalencia.test.ts:136,161,184`
  hace lo mismo con `toEqual` sobre el objeto completo, no sobre campos sueltos.
  Corridas: **106/106 verdes** (`comercial_equivalencia`, `operacion_equivalencia`,
  `analytics_agregados_0150`, `fiscal_agregado`).
- **Y el otro extremo del espejo también está cerrado.** El riesgo real de un
  espejo en JS es que se compare contra sí mismo; aquí no: `verificaciones.sql`
  trae los bloques **122** (`:6094`, los 11 de la 0150), **123** (`:5999`, el
  fiscal de la 0151), **124** (`:6284`, los 7 de la 0152) y **125** (`:5828`,
  `resumen_negocio`) contra Postgres real, y `ci-postgres.yml:126-163` los corre
  **en cada push** tras aplicar las 163 migraciones una por una. El
  `${PIPESTATUS[0]}` de `:160` está puesto a propósito para que un fallo no salga
  en verde. La cadena JS-viejo → espejo → Postgres queda completa.
- **La 0151 es la decisión correcta escrita.** `0151_fiscal_agregado.sql:12-22`
  se niega explícitamente a mover la ley a SQL («*reescribirla en SQL la
  duplicaría en dos lenguajes que habría que mantener sincronizados*») y agrupa
  por las dimensiones exactas que la regla en TS consulta por fila. Verifiqué que
  no cuela juicios: `CeldaFiscal.sobreTopeEfectivo` (`fiscal.ts:115-140`) es una
  **partición** hecha con el tope que manda el llamador, y `fiscal.ts:152-153`
  deja la decisión en TS. No hay lógica de deducibilidad duplicada en la 0151.
- **El merge de `fiscal.ts` conservó los dos lados sin dejar una tercera
  lectura.** `fiscal.ts:44` importa `medioNoAdmitidoCombustible` del motor
  (no lo recopia) y `:152-153` es el único `sobreTopeEfectivo` del archivo. Busqué
  terceras copias del tope de efectivo en todo `src/`: `engine.ts:448` (el motor)
  y `politicas/page.tsx:268` (que solo lo IMPRIME desde `config`). No hay tercera.
- **`serie-diaria.ts` / `serie-diaria-servidor.ts` es una partición correcta, no
  una duplicación.** Dos archivos porque uno lo importan Client Components y el
  otro trae `supabaseAdmin` (→ `sharp`); el porqué está escrito en los dos
  encabezados (`serie-diaria.ts:4-10`, `serie-diaria-servidor.ts:7-12`) y el build
  fue quien lo descubrió. Ninguna cifra vive en los dos.
- **El motor de dinero sigue puro**: cero `supabase|createClient|fetch(|process.env`
  en los archivos no-test de `cuadre/` y `liquidacion/`.
- **`formato.ts`, `env.ts` y `bitacora_escritura.ts` siguen siendo fronteras
  duras con guardia que barre `src/` completo** — el patrón que funciona, y el
  contraste que hace visible que `acotada_guardiana.test.ts` no lo use.
- **`npx tsc --noEmit -p .` limpio.**

---

## Lo que NO alcancé a revisar

- **`npm test` completo y `npm run lint`.** Corrí el typecheck y 106 pruebas
  dirigidas (los cuatro archivos de equivalencia). No puedo afirmar el estado de
  la suite entera ni el del linter.
- **Las 42 rutas de API una por una.** Conté que **14 de 42** consultan la base
  directo y **14** escriben directo (`worker/bus/[accion]` 8 consultas / 6
  escrituras, `api/lead` 4/2, `correo/entrante` 3/2), pero solo abrí
  `agentes/facturas` y `al_vuelo`. No sé cuántas de las otras 12 rutas de
  escritura se saltan una normalización como la del CRÍTICO.
- **Los otros tres CHECK de la 0158** (`cfdi_xml`, `factura_emitida`,
  `factura_proveedor`). Rastreé los escritores de `factura_emitida.cfdi_uuid`
  (`facturacion_escritura.ts:162` y `:456`, los dos con `toLowerCase()`) y el de
  `cfdi_xml` (`repo.ts:45` vía `uuidCfdi`), pero no barrí `factura_proveedor`.
- **`0159_rpcs_atomicas.sql` por dentro.** `registrar_pago_tx`, `reabrir_viaje_tx`
  y `tenant_config_merge` tienen prueba de cableado
  (`facturacion_escritura_cableado.test.ts`, `administracion.test.ts`,
  `tenant_config_merge_cableado.test.ts`); `config_merge_profundo` y
  `config_agentes_valida` no aparecen en ninguna prueba de TS y no verifiqué si
  `verificaciones.sql` los cubre.
- **Si el escritor de `viaje` con 10 dueños tiene invariantes contradictorios.**
  Conté los diez (`qa-motor`, `agentes/cobranza`, `carta_porte_datos`,
  `confirmar_viaje`, `escalar_viaje`, `hitos_viaje`, `importar_viajes`,
  `operacion`, `processor`, `repo`) y no comparé qué columnas toca cada uno.
- **`auth/callback/route.ts` y `motivo_login.ts`** — siguen sin abrirse desde la
  ronda 18.
- **El barrido de columnas que existen en la base y no en el tipo del dominio**
  (el patrón del `cfdi_orden`): sigue sin hacerse, ahora con 163 migraciones.
