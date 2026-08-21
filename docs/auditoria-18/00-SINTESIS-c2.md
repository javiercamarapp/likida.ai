# Síntesis — auditoría 18 · continuación (21-ago-2026, en la nube, desatendida)

**Global 4.8/10 — bajó 1.3 contra el 6.1 de ayer, y ninguna de las doce notas
subió.** Ronda de **continuación** sobre el PR #34, no ronda nueva: el PR seguía
abierto, así que se trabajó sobre `claude/auditoria-18`. Los doce rubros se
relanzaron porque los doce tenían código cambiado. **114 hallazgos con ficha:
16 CRÍTICO · 41 ALTO · 39 MEDIO · 18 BAJO.** **3 arreglados**, los tres
CRÍTICOS, cada uno con prueba que lo reproduce y commit atómico.

## Lo primero, porque es lo que hay que arreglar hoy

**La compuerta llevaba un día rota en `master` y nadie se enteró.**

`src/lib/likida/migraciones_verificadas.test.ts` falla desde `0bfb51c`
(20-ago 11:18 CST): las migraciones 0140, 0141, 0142 y 0143 entraron sin bloque
en `verificaciones.sql` ni razón en `EXENTAS`. No es una sospecha:

```
Test Files  1 failed | 392 passed (393)
     Tests  1 failed | 5126 passed | 1 skipped (5128)
```

Lo confirmé en un worktree limpio sobre `d432e89` puro, para descartar que lo
causara la rama de auditoría. Y el CI lo dice también: **cinco corridas seguidas
en rojo** sobre `master` (`0bfb51c`, `0617f3e`, `0f6fa31`, `fe30263`, `d432e89`);
el último verde fue `feb0f6b`. Cuatro de esos cinco commits llevan la bandera
`[deploy]`, así que se publicó producción cuatro veces con la suite roja.

La prueba que falló existe exactamente para esto — su encabezado dice que la
escribieron porque *«así se coló la 0030, que existe justamente porque un chequeo
decía verificar algo que no verificaba»*. Funcionó: detectó, avisó, y se pasó de
largo. Ése es el hallazgo de proceso de la ronda, y por eso el rubro de
operabilidad baja dos puntos.

## Por qué la global baja 1.3 y por qué eso es el resultado, no el problema

Entre `553bee7` y `d432e89` entraron **9 commits, 53 archivos, +3,691/−297** en
un solo día: el piloto de visión (381 líneas nuevas de un agente que opera
portales web), la cuenta de portal compartida (credenciales), y la reescritura de
314 líneas de `processor.ts` para que un mismo número sea chofer y oficina.

Doce auditores independientes, con contexto fresco, calificaron peor el mismo
repo. Ninguno subió. Las razones se reparten en dos:

- **Deuda que cobró factura** (8 rubros) — el patrón que la ronda 18 nombró por
  escrito volvió a ocurrir sobre el código nuevo. Agéntico lo dice mejor que yo:
  «la mitad nueva se cableó sin las mismas reglas» pasó **dos veces más** en este
  mismo delta. Arquitectura encontró que la URL base tiene un **octavo** sitio y
  que el escritor desalineado de `bitacora_auditoria` **se editó en este delta y
  salió igual de desalineado**.
- **Mirada más profunda** (4 rubros) — el código no cambió, la nota anterior
  estaba inflada. Fiscal es el caso puro: la ronda 18 dio 7 sin cruzar los
  **códigos** de régimen contra el texto que la propia ficha transcribe.

Un 6.1 que se vuelve 4.8 en un día no dice que el repo se desplomó en un día;
dice que el 6.1 medía menos superficie de la que creía y que la semana entró
código nuevo sin las reglas viejas. Las dos cosas a la vez.

## Arreglado, con prueba que lo reproduce

| # | Hallazgo | sha | La prueba |
|---|---|---|---|
| 1 | **CONT-1 (CRÍTICO)** — las migraciones 0140–0143 sin decisión; la compuerta roja en `master` desde hace un día | `dcc77d3` | La que ya estaba roja: es la que vuelve a verde. **Bloque 111** de `verificaciones.sql` para las tres columnas GENERADAS (que sigan `STORED`, que escribir `necesidad_pct` a mano rebote con 428C9, que se recalculen al mover `num_unidades`, y los tres casos que motivaron la 0142/0143). La 0141 queda **EXENTA** con razón |
| 2 | **AGEN-C2-1 / BACK-C2-2 (CRÍTICO)** — un pendiente de despacho se come el «listo» del chofer durante 30 minutos | `b0b8a87` | Con viaje abierto, «listo» → `null`. Sin el arreglo devuelve «Tengo este viaje esperando tu confirmación…». Dos pruebas más fijan que el pendiente sigue vivo y que sin viaje abierto se sigue re-enseñando |
| 3 | **FISC-C2-1 (CRÍTICO)** — la facilidad del 15% se concedía al régimen 601, que no es el Capítulo VII | `17c6343` | 601 + dedicación exclusiva → `regimenElegible: false`. Sin el arreglo sale `true` |

Ninguno revertido. El (2) es el que más me importa: es el guion del demo. El
dueño despacha un viaje a las 14:00, se sube a la unidad, termina su ruta a las
14:12 y escribe «listo» — y recibe el resumen del viaje de Pedro. Vuelve a
escribir «ya terminé», «cierra»: lo mismo, las tres veces. Durante 30 minutos su
liquidación no se cuadra. Lo habilitó `d432e89`, o sea el commit de ayer, y lo
encontraron dos auditores por su cuenta.

El (3) cambia una cifra fiscal y **quiero que lo mires antes del demo**: el
producto le concedía a una S.A. de C.V. régimen 601 la facilidad del 15% que la
RFA 2026 regla 2.9 reserva al «Título II, Capítulo VII», que son los
**Coordinados** — clave **624** en `c_RegimenFiscal`, no 601. La ficha está
`verificado_fuente_primaria` (SIDOF 5780249) y gana la discusión; el comentario
del código mostraba la confusión en una línea: «601 (General de Ley PM —
coordinados)». Falla cerrado a propósito. **Lo que NO cerré** (FISC-C2-4, ALTO):
la clave 624 no existe en `REGIMENES` ni en el CHECK de la 0056, así que un
coordinado real todavía no puede declararse como tal — eso pide una migración y
es tuya.

## Las doce notas

| Rubro | Antes | Hoy | Δ | Razón, y qué la sostiene |
|---|---|---|---|---|
| Backend y API | 7 | **6** | −1 | *deuda que cobró factura* — los 6 abiertos de la ronda 18 siguen abiertos, cero cerrados; sus dos CRÍTICOS los verificó **ejecutando** el código, no leyéndolo |
| Seguridad | 7 | **6** | −1 | *mirada más profunda* — el 7 se puso sin haber abierto nunca el magic link, que es la única puerta al producto |
| Frontend | 6 | **5** | −1 | *deuda que cobró factura* — los 7 abiertos de la ronda 18 siguen los 7, verificados uno por uno con `archivo:línea` |
| Cumplimiento legal | 6 | **5** | −1 | *deuda + mirada más profunda* — el aviso de privacidad no tiene pantalla de captura y el carril de oficina trata sin pasar por el gate |
| Pruebas | 6 | **5** | −1 | *deuda que cobró factura* — mutación real: **19 mutaciones, 8 rojas / 11 verdes** |
| Operabilidad y DX | 7 | **5** | −2 | *deuda + mirada más profunda* — **la compuerta no cerró**: 5 corridas rojas y 4 deploys encima |
| Modelo de datos | 6 | **5** | −1 | *mirada más profunda* — la FK compuesta, contada tabla por tabla: cubre **5 de 40** relaciones |
| Tool calling | 7 | **5** | −2 | *deuda que cobró factura* — el piloto de visión es una frontera modelo↔mundo nueva sin las reglas viejas |
| Sistema agéntico | 5 | **4** | −1 | *deuda que cobró factura* — «la mitad nueva sin las mismas reglas» volvió a pasar dos veces en el mismo delta |
| Arquitectura | 5 | **4** | −1 | *deuda que cobró factura* — octavo sitio de la URL base; el escritor desalineado se editó y salió igual |
| Cumplimiento fiscal | 7 | **4** | −3 | *mirada más profunda* — la ronda 18 calificó la RFA 2.9 sin cruzar los códigos de régimen contra el Capítulo VII que la ficha transcribe |
| Rendimiento y costo | 4 | **3** | −1 | *deuda que cobró factura* — un vuelo del piloto son 625 s de techos contra un `maxDuration` de 300 |

**Suma 57 → 4.8.**

Las notas describen el árbol que los auditores vieron (`6c18684`). Los tres
arreglos entraron **después**, así que fiscal, agéntico, backend y operabilidad
quedan conservadoras a propósito: no re-audité a nadie para no inflar el número
con mi propio trabajo.

## Convergencias

Dos o más auditores independientes sobre el mismo `archivo:línea`. Es la
corroboración más fuerte que da este proceso:

| Hallazgo | Quiénes | Estado |
|---|---|---|
| El pendiente de despacho se come el «listo» del chofer | agéntico (CRÍT) + backend (CRÍT) | **ARREGLADO** `b0b8a87` |
| La compuerta roja en `master` | la compuerta misma + operabilidad (CRÍT) | **ARREGLADO** `dcc77d3` |
| **El piloto de visión** | **siete de los doce**: seguridad, tool calling, rendimiento, backend, pruebas, operabilidad, fiscal | pendiente — ver abajo |
| El panel enruta con dos entradas menos que el motor | frontend (ALTO) + backend | pendiente |

## Los 13 CRÍTICOS que quedan, con la razón de no haberlos tocado

**Ocho son del piloto de visión** (`piloto_vision.ts`, 381 líneas nuevas en
`feb0f6b`). Es la convergencia más fuerte que ha producido esta rutina: siete de
doce auditores llegaron solos al mismo archivo. En corto — puede timbrar porque
el veto del botón es un regex de cinco verbos y el modo `ensayo` no gatea el
clic; si emite, el ticket vuelve a la cola cada hora porque nunca levanta
`emisionSinConfirmar`; un vuelo son 625 s de techos contra un `maxDuration` de
300; es la única llamada de LLM del repo sin `signal`, así que su techo real son
los 10 minutos del SDK; no registra fila en `llm_costo`; escribe la contraseña
compartida del portal en el campo que el modelo diga, y el modelo lee sus
instrucciones de una página no confiable; y todo su camino de fallo se registra
en `info`.

**Todos viven detrás de `FACTURACION_PILOTO`, que hoy está apagada.** No los
arreglé porque el arreglo no es un parche: es decidir qué puede y qué no puede
hacer un modelo de visión sobre un portal fiscal, y eso es tuyo. **Lo que sí te
pido es concreto: el doc del demo manda encender esa palanca. No la enciendas
antes de decidir esto.**

**Dos son legales.** El aviso de privacidad no tiene pantalla de captura —
`tenant.domicilio_fiscal`, `url_aviso_privacidad` y `contacto_privacidad` solo
las escribe `qa-motor.ts`, así que `getDatosResponsable` devuelve `null` para
toda flota real, el gate queda en `sin_datos` para siempre y `/aviso/<tenant>` es
404 — mientras el carril de oficina, que no pasa por el gate, sigue mandando
WhatsApp a operadores con `aviso_privacidad_en` en NULL. Y el decisor del
prospecto sigue viajando a un modelo externo sin aviso que lo cubra
(REINCIDENTE de la ronda 18, agravado por la ficha nominal nueva). El arreglo es
un aviso y una decisión de producto sobre datos de terceros.

**Uno es de esquema:** la FK compuesta cubre 5 de 40 relaciones, y 7 de las 11
accionables **no se pueden cerrar hoy** porque la tabla destino no tiene el
`unique (id, tenant_id)` al que apuntar. Pide migraciones, no un parche.

**Uno es de arquitectura** (despacho y chofer se pisan la misma fila de
`wa_conversacion`) y **uno de pruebas** (ninguna prueba corre con la palanca del
piloto puesta).

**Tope de la rutina: 3 vueltas de arreglo. Se gastaron las tres.**

## Lo que verifiqué y ajusté

- **CONT-1**: verificado dos veces — local y en un worktree limpio sobre
  `d432e89` puro — y contra el historial de CI por API. No es de la auditoría.
- **FISC-C2-1**: verificado abriendo `administracion.ts:158`, la ficha
  `rfa-2026-2.9.yaml` y el catálogo. El auditor tenía razón, incluyendo que 612
  sí es Título IV Cap. II Secc. I.
- **AGEN-C2-1**: verificado leyendo el orden real de `atenderTextoOficina`
  (`processor.ts:443-501`): despacho y asignación corren **antes** del desempate
  y sin él.
- **Nada resultó falso este pase.** Lo que sí ajusté es de conteo, no de
  contenido: los `grep` de severidad sobre los archivos daban más ALTOs de los
  que los auditores declararon, porque sus tablas de «hallazgos abiertos de la
  ronda 18» repiten la etiqueta. Los 114 se cuentan **solo** sobre los
  encabezados `### [SEVERIDAD]` de la sección de hallazgos.
- **Una corrección al MAPA** que trae el auditor de datos, anotada en su archivo.

## Estado de la compuerta

Al arrancar, **roja** (arriba). Al cerrar, verde sobre el árbol final:

```
 Test Files  393 passed (393)
      Tests  5134 passed | 1 skipped (5135)
```

`npx tsc --noEmit` limpio. `npx eslint src/` 0 errores, 5 avisos (los mismos de
la línea base).

**El rojo intermitente que la ronda 18 dejó pendiente no reapareció**: cuatro
corridas completas de la suite en esta ronda, ninguna con un rojo distinto al de
`migraciones_verificadas`. El auditor de pruebas sí levantó la lista de pruebas
que dependen del reloj, que era el encargo.

## INFRA (no es un hallazgo del código)

`npm ci` limpio **falla con 403** al bajar `xlsx@0.20.3` de `cdn.sheetjs.com`,
host fuera de la política de red de este entorno. Igual que en la ronda 18: se
instaló todo desde el lock sin `xlsx`, luego `xlsx@0.18.5` del registry, y
`package.json`/`package-lock.json` se restauraron con `git checkout` — así que el
árbol auditado es el de `master`, sin manifiestos tocados.

## Los archivos de esta continuación

Los doce reportes están en `docs/auditoria-18/<rubro>-c2.md`; los de la ronda 18
se conservan intactos al lado. Tablero: `tablero-c2.html` + `tablero-c2.png`
(renderizado y mirado: se corrigieron dos defectos — los chips de severidad se
partían en dos líneas y el pie quedaba cortado).
