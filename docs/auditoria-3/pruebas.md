# Pruebas — auditoría 3

**Nota: 6/10** (antes 6). Se queda. Lo que subió: CI ahora es puerta real en
cada push a toda rama (typecheck, lint, cobertura con umbral, pruebas de tiempo
sin instrumentar, build), y los 9 archivos nuevos del foco son pruebas de
verdad — motores puros con bordes reales y dos suites de cableado que importan
el `processor.ts` real y prueban el ORDEN, no un mock del orden. Lo que lo
detiene en 6: los tres bugs de embed arreglados HOY quedaron sin ancla (la
suite está verde con esa clase de bug puesta), el mecanismo de skip-bajo-
cobertura está muerto por un rename a medias y su guardia estructural vigila el
nombre muerto (verificado en vivo), y el ciclo de dinero del agente de cobranza
delega su arnés a uno manual **que no existe en el repo**.

**Riesgo mayor hoy:** los embeds viaje↔operador. La FK compuesta de la 0075
dejó doble relación en 5 pares de tablas; tres embeds sin alias ya cayeron en
producción (página de cobranza, cron de escalación, aviso de cierre — commits
`2e59040` y `566a962`, y el 566a962 dice "llevaban rotos EN SILENCIO"). Nada en
la suite ni en CI falla si alguien quita un alias o escribe el próximo embed
sin él: la clase de bug que más ha dolido esta semana es exactamente la que el
arnés no puede ver.

## Hallazgos

### A1 — ALTO · Los tres embeds arreglados hoy no tienen prueba que falle si alguien los revierte

- **Leído:** `src/lib/likida/agentes/cobranza.ts:102-107` (alias
  `operador:operador_id` con el comentario "se pagó en producción el
  14-ago-2026"), `src/lib/likida/escalar_viaje.ts:86-90`,
  `src/lib/likida/avisar_cierre.ts:59`. Grep de `operador:operador_id|viaje:viaje_id`
  sobre `**/*.test.ts`: **cero resultados**.
- **Escenario:** si alguien revierte `operador:operador_id(...)` a
  `operador(...)` en cualquiera de los tres sitios —o escribe el embed nuevo
  número cuatro sin alias—, la suite sigue verde porque todos los tests que
  tocan esos módulos mockean `supabaseAdmin` con un builder permisivo
  (`escalar_viaje.test.ts:70-102` registra los args del `.select()` y nunca
  valida su contenido; `cobranza.test.ts` solo prueba el motor puro), y la
  ambigüedad "more than one relationship" la resuelve PostgREST **en runtime
  contra el esquema vivo** — ni `tsc`, ni el build, ni un mock la pueden ver.
- **Consecuencia:** página del agente caída al error boundary (cobranza) o cron
  roto en silencio (escalación y aviso de cierre — ya pasó, y nadie lo vio
  hasta hoy). Es la definición de regresión corregida sin ancla.
- **Refutación intentada:** ¿lo cubre verificaciones.sql? No — los bloques
  64-66 corren SQL directo; la ambigüedad es del resolver de embeds de
  PostgREST, no de Postgres. ¿Es inanclable offline? No: el repo ya tiene
  cuatro redes estructurales que escanean fuente (`formato`, `dinero_por_area`,
  `sin_previews`, `pruebas_en_ci`); un escaneo de `.select(` con embed
  `operador(`/`viaje(` sin alias en las tablas de doble FK es el mismo patrón.
  No propongo el arreglo; anoto que ES anclable y no está anclado.

### A2 — ALTO · El skip-bajo-cobertura está muerto: el config exporta una bandera y los tests leen otra — y la guardia estructural vigila la muerta

- **Leído:** `vitest.config.ts:35` exporta `CUADRA_COBERTURA=1` bajo
  `--coverage`; `src/lib/likida/duplicados.test.ts:151` y
  `src/lib/likida/normas/fundamento.test.ts:148` se saltan con
  `process.env.LIKIDA_COBERTURA === '1'`; la red
  `src/lib/likida/pruebas_en_ci.test.ts:43` detecta "saltadas" buscando
  `skipIf(...LIKIDA_COBERTURA` — el mismo nombre que nadie setea. El rename de
  marca (`b79f8e5`, 12-ago, "purga total del nombre viejo") renombró los tests
  y no tocó el config.
- **Verificado en vivo** (corrida puntual permitida):
  `CUADRA_COBERTURA=1 npx vitest run duplicados fundamento` → **86 passed, 0
  skipped** (la condición exacta del paso de cobertura de CI: nada se salta);
  `LIKIDA_COBERTURA=1` → 84 passed, **2 skipped** (los skipIf viven, cableados
  a un nombre muerto).
- **Escenario:** hoy los dos micro-benchmarks corren INSTRUMENTADOS en el paso
  `test:coverage` de CI, donde sus propios comentarios documentan que la
  medición es inválida: el cociente del dedup pasa de ~4 a ~9 contra umbral 20
  (margen de ~5x a ~2x, y ese mismo test ya se cayó dos veces el 28-jul por
  ruido SIN instrumentar), y el ReDoS de ~7ms a ~107ms contra 500ms. Y
  `pruebas_en_ci.test.ts` — cuyo único trabajo es atar esto — pasa en verde
  porque su detector y los skipIf comparten el nombre equivocado: la red es
  internamente consistente y externamente ciega.
- **Consecuencia:** flake latente en la guardia de crecimiento del dedup de
  CFDI (camino del dinero) en el runner cargado de CI; el día que falle, la
  reacción entrenada es reintentar el CI o aflojar el umbral — perdiendo la
  sensibilidad que el umbral existe para dar. Mientras tanto, el paso "Pruebas
  de tiempo (sin cobertura)" de `ci.yml:75-76` cree estar recuperando dos
  pruebas que en realidad nunca se saltaron.
- **Refutación intentada:** ¿es inofensivo porque "corren de más, no de
  menos"? No: correr un umbral de tiempo bajo instrumentación es exactamente lo
  que el diseño (comentarios de `vitest.config.ts:7-13` y de ambos tests)
  declara como medición mentirosa. Un test que puede fallar por razones ajenas
  al algoritmo es peor que no tenerlo — lo dice el propio archivo
  (`duplicados.test.ts:160-165`).

### A3 — ALTO · El ciclo de dinero de `ejecutarCobranza` delega su arnés a una "verificación 64 + arnés manual" — y el arnés manual no existe

- **Leído:** `src/lib/likida/agentes/cobranza.test.ts:7-9` ("claims, envíos y
  bitácora se prueban con la verificación 64 de la base y el arnés manual");
  `supabase/verificaciones.sql:3098-3138` (bloque 64: unique, CHECK, RLS,
  cascade — solo constraints); `grep -rln "cobranza" pruebas-manuales/` →
  **cero archivos** (las "fases" de pruebas-manuales son del plan viejo:
  sobregiro, siembra, peajes de cuadre — ninguna toca 0089). Ni
  `ejecutarCobranza`, ni `colaCobranza`, ni `ejecutarCobranzaGlobal`, ni
  `bitacoraCobranza` aparecen en ningún `.test.ts`.
- **Escenario:** si alguien invierte el orden claim→envío de
  `cobranza.ts:205-243` (manda ANTES del INSERT que reclama), o rompe el
  cálculo de días de `cobranza.ts:134`, o quita la tolerancia al 23505, la
  suite sigue verde porque no hay una sola prueba que ejecute ese ciclo, y la
  verificación 64 sigue verde porque las constraints no miran el orden en que
  el TS las usa. Lo mismo con el cron: `api/cron/escalar/route.ts:78` llama
  `ejecutarCobranzaGlobal()` y no tiene route.test (facturar SÍ tiene el suyo:
  `api/cron/facturar/route.test.ts`) — borrar esa línea apaga el agente de
  cobranza de TODAS las flotas sin que nada se ponga rojo.
- **Consecuencia:** doble mensaje al chofer en carrera (el candado existe en la
  base pero nadie prueba que el código lo use antes de mandar), o agente
  global muerto en silencio. Y el header del test cita un arnés que no está en
  el repo — un rótulo de prueba que no es verdad, en el repo donde los rótulos
  que mienten pesan doble.
- **Refutación intentada:** la filosofía declarada del repo ("un mock de
  Supabase probaría el mock") es legítima y la comparto para el claim en sí —
  pero el ORDEN claim-antes-de-enviar y el corte por config corrupta son
  lógica TS orquestadora, exactamente lo que `escalar_viaje.test.ts` sí prueba
  para la escalación con su cadena que registra el orden de los filtros. El
  patrón para probarlo sin mockear de más ya existe en el repo, a un archivo de
  distancia.

### M1 — MEDIO · Las escrituras de dinero de F2/F5/F6 y las 8 server actions nuevas no tienen arnés en ninguna capa

- **Leído:** `src/lib/likida/proveedores.ts:71-107` (`guardarFacturaProveedor`)
  y `143-164` (`decidirFacturaProveedor`);
  `src/lib/likida/importar_viajes.ts:170-232` (`importarViajes`);
  `src/lib/likida/repo.ts:449-464` (`resolverHuerfanoDesdeOficina`);
  `src/app/dashboard/huerfanos/page.tsx:64-115`,
  `agentes/proveedores/page.tsx`, `agentes/cobranza/page.tsx:59-102`,
  `viajes/page.tsx:97` (server actions). Ninguna función aparece en ningún
  `.test.ts`; la verificación 66 cubre unique+dominio+RLS, **no** el candado
  anti-carrera `.eq('estado','pendiente')` de `decidirFacturaProveedor:154`.
- **Escenario (tres concretos):** (1) quitar el `.eq('estado','pendiente')` —
  dos contadores decidiendo la misma factura se pisan y el segundo clic
  reescribe la decisión del primero; suite y verificación 66 verdes. (2) el
  mapeo de `guardarFacturaProveedor:92` hace `iva: xml.ivaTraslado || null` —
  un IVA de $0 (tasa 0%) se guarda como null ("no se pudo leer") en vez de 0;
  ninguna prueba ejecuta ese mapeo, así que la semántica nunca se discutió en
  un `expect`. (3) `importar_viajes.test.ts:54` fija que el anticipo vacío
  sobrevive como `null` en la capa pura — y `importarViajes:214` lo colapsa a
  `0` al escribir (`f.anticipo ?? 0`); la costura entre las dos capas no tiene
  test, y la prueba pura da la ilusión de que null llega a la base.
- **Consecuencia:** decisiones de facturas pisadas sin aviso, cifras fiscales
  con semántica no pactada (0 vs null es exactamente la distinción que el
  producto predica), y el gateo de las actions (`exigirPermiso`,
  `permiso.quien`) sin un solo caso — en el repo cuya memoria dice que
  autorización es donde el código de agentes más falla.
- **Refutación intentada:** el patrón dedup/claim sí está cubierto por la base
  (verif. 66) y las actions re-verifican rol adentro (leído en
  huerfanos/page.tsx:17-22 — bien hecho). Lo que queda sin red es la lógica TS
  entre el formulario y la constraint: mapeos, candados de estado y costuras.

### M2 — MEDIO · `despacho_wa.test` afirma "fecha_inicio del día de México" con una fecha que no discrimina México de UTC

- **Leído:** `src/lib/likida/despacho_wa.test.ts:118-125` — `AHORA =
  2026-08-14T17:00:00Z` (11:00 CDMX **y** día 14 en UTC) y el expect fija
  `fechaInicio: '2026-08-14'`.
- **Escenario:** si alguien reescribe `hoyMx` (`despacho_wa.ts:92-94`) a
  `toISOString().slice(0,10)` (UTC pelón), este test sigue verde: a las 17:00Z
  ambas zonas dan el mismo día. La propiedad que el nombre del test promete
  solo se distingue entre las 00:00Z y las 06:00Z (tardes-noches de México).
- **Consecuencia:** un despacho a las 8pm de México crearía el viaje con
  `fecha_inicio` de MAÑANA — y `fecha_inicio` alimenta los días-sin-comprobar
  del agente de cobranza (`cobranza.ts:134`). Contraste: la misma clase de
  aserción en `cobranza.test.ts:51-52` SÍ discrimina (14:00Z = 8am CDMX
  adentro-en-UTC/afuera-en-MX). Decoración parcial, con nombre.
- Menor, mismo archivo: el recheck de rol dentro de la confirmación
  (`despacho_wa.ts:128-131`, contador diciendo "sí" a un pendiente heredado)
  no tiene caso.

### B1 — BAJO · El sello de hitos no tiene arnés en la única capa que es suya

- **Leído:** `src/lib/likida/hitos_viaje.ts:92-111` (`sellarHito`: mapeo
  `COLUMNA` + `.is(col, null)`); `processor_hitos.test.ts:19` lo mockea;
  verificación 65 (`verificaciones.sql:3140-3153`) solo comprueba que las tres
  columnas existan y nadie amanezca sellado.
- **Escenario:** intercambiar `llegada_en`/`descarga_en` en el mapa `COLUMNA`,
  o quitar el `.is(col, null)`, deja suite y verificación verdes; el mensaje
  repetido re-escribiría la hora y el acuse "Ya lo tenía anotado" nunca
  saldría.
- **Consecuencia:** timestamps operativos mentirosos (no dinero directo, pero
  alimentan la ventana del viaje y "lo que hizo solo"). La atomicidad sí es de
  Postgres, como declara el header — el mapeo de columnas y el candado son TS.

### B2 — BAJO · El "1 skipped" de la línea base es un arnés condicional que en CI nunca corre

- **Leído:** `src/lib/likida/arnes_ticket_real.test.ts:365` —
  `describe.skipIf(GRUPOS.length === 0)`: sin las imágenes de tickets en
  disco, se salta en silencio. En CI no hay imágenes, así que esa suite es
  documentación con sintaxis de prueba en el único entorno que corre siempre.
  Declarado y honesto en el archivo; se anota para que el contador de
  "skipped" tenga dueño conocido.

## Lo que revisé y está bien

- **Los 9 archivos del foco** (`cobranza.test`, `hitos_viaje.test`,
  `despacho_wa.test`, `processor_hitos.test`, `processor_oficina_despacho.test`,
  `proveedores.test`, `importar_viajes.test`, `peajes/desglose.test`,
  `geo/ciudades.test`): motores puros con bordes de verdad, no camino feliz.
  Las preguntas no sellan hitos, "llegué a cargar diésel" no es llegada, la
  basura numérica es `'ilegible'` y nunca 0, las columnas del export de
  proveedores están fijadas como contrato, el doble "sí" no crea dos viajes,
  el "sí" vencido no crea nada, y el crash de `crearViaje` conserva el
  pendiente para reintentar. Rompí mentalmente `tierPendiente`,
  `interpretarHito`, `interpretarFilasViajes` y `dentroDeVentana`: las cuatro
  se ponen rojas.
- **Las dos suites de cableado del processor** importan el `processor.ts` REAL
  y prueban orden y precedencia ("ya llegué" antes del freno de cierre,
  "listo" sigue siendo del cierre, el error de despacho_wa no deja al jefe sin
  respuesta) con el I/O saliente capturado por fetch-spy — se afirma el TEXTO
  que sale, no que "se llamó algo". El mock de `despacho_wa.test:14-17` tira
  excepción si el módulo toca cualquier tabla que no sea `wa_conversacion`:
  un mock que acusa en vez de complacer.
- **Ninguna prueba nueva depende del reloj de la máquina ni de red**: fechas
  fijas en las 9, TZ resuelta con `Intl` + `TZ_MX`, y la ventana de cobranza
  SÍ discrimina México de UTC (`cobranza.test.ts:51-52`).
- **CI (`.github/workflows/ci.yml`)**: corre en cada push a TODA rama (arreglo
  documentado del hueco `claude/*`), `npm ci`, typecheck, lint, cobertura con
  umbral como puerta, pruebas de tiempo aparte, build al final con
  placeholders ruidosos; `concurrency` cancela lo obsoleto. Estructura
  correcta — su único agujero es el A2.
- **Verificaciones 64-66**: reales, con corrida anotada del 13/14-ago,
  esperados explícitos, datos de prueba revertidos con RAISE. El bloque 64
  prueba de verdad el doble-claim y el CHECK de ventana contra Postgres vivo.
- **`pruebas_en_ci.test.ts`**: la idea (una prueba que no corre en CI es
  documentación) y la construcción anti-autodetección son de lo mejor del
  repo — por eso duele que vigile el nombre muerto (A2).

## Lo que NO alcancé a revisar

- Mutación dirigida REAL sobre los 9 archivos (solo la mental); los umbrales
  numéricos exactos de cobertura en `vitest.config.ts` (leí hasta la línea 60).
- Las ~250 suites fuera del foco de hoy (solo las toqué por grep de alias y
  skips); los tests del chat/analista y del rediseño v3.
- `pruebas-manuales/vitest.config.ts` y si su include podría colarse al de la
  suite normal.
- La rama de XML consolidado de oficina (`processor.ts:421-436`) — vi que
  existe `rafaga_consolidada.test.ts` pero no verifiqué si cubre el camino
  DESDE la cuenta de oficina o solo desde el chofer.
