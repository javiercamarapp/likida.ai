# Auditoría 3 — síntesis

**Pase 2, corrida en la nube, 14-ago-2026.** Doce rubros auditados con contexto
fresco, un agente por rubro, ninguno tocó código.

> **La ronda 3 tiene dos pases.** El pase 1 corrió de madrugada en local: cerró
> 6 críticos contra `master` y **murió antes de escribir un solo reporte de
> rubro**. Este pase 2 relanzó los doce porque un rubro sin archivo es un rubro
> sin auditar. Los 8 "fixers en paralelo" que `00-ESTADO-RONDA.md` daba por
> lanzados **nunca dejaron commit**: los 25 altos que anunciaba siguen abiertos,
> y los auditores los encontraron vivos, uno por uno, sin que nadie se los
> soplara.

## Global: 5.7 → **5.3** (−0.4)

Y la bajada es el hallazgo. Ningún rubro empeoró por código nuevo roto: **la
mitad de la caída es una mirada más profunda sobre notas que estaban infladas**
(frontend, fiscal, datos, seguridad lo dicen con esas palabras), y la otra mitad
es deuda que cobró factura — arreglos del pase 1 que cerraron la mitad de su
ruta y se apuntaron enteros.

La lectura corta: **cuatro de los seis críticos que el pase 1 dio por cerrados
siguen teniendo su ruta abierta por el otro extremo**, y eso es peor que no
haberlos tocado, porque el estado en disco decía ✅.

## Las doce notas

| Rubro | Antes | Hoy | Δ | Razón del movimiento | C / A / M / B |
|---|---|---|---|---|---|
| Frontend | 7 | **5** | ▼2 | mirada más profunda | 1 / 3 / 4 / 4 |
| Backend y API | 5 | **5** | = | se atacó y subió, y bajó lo mismo | 1 / 4 / 4 / 2 |
| Agéntico | 6 | **5** | ▼1 | deuda que cobró factura | 1 / 7 / 2 / 0 |
| Tool calling | 7 | **7** | = | se atacó y subió; la fuga reapareció al lado | 0 / 1 / 3 / 2 |
| Seguridad | 8 | **7** | ▼1 | mirada más profunda | 0 / 1 / 3 / 5 |
| Fiscal | 6.5 | **3.5** | ▼3 | mirada más profunda | 1 / 1 / 5 / 1 |
| Legal | 4 | **5.5** | ▲1.5 | se atacó y subió | 0 / 4 / 4 / 1 |
| Arquitectura | 4 | **5** | ▲1 | se atacó y subió | 1 / 4 / 3 / 1 |
| Pruebas | 6 | **5** | ▼1 | deuda que cobró factura | 1 / 5 / 3 / 2 |
| Operabilidad | 5 | **6** | ▲1 | se atacó y subió | 1 / 4 / 4 / 3 |
| Rendimiento | 4 | **4** | = | deuda que cobró factura | 3 / 6 / 6 / 2 |
| Modelo de datos | 6 | **5** | ▼1 | mirada más profunda | 1 / 3 / 5 / 6 |

**125 hallazgos: 11 críticos · 43 altos · 42 medios · 29 bajos.**

## Los once críticos

Verificados por el orquestador abriendo el archivo, salvo donde se dice.

1. **FE-C1 · El chat contesta con un heurístico local cuando el agente falla, y
   no lo dice.** `chat.tsx:521-523`. El endpoint manda `{t:'error'}` dentro de
   un stream con HTTP 200; `resp.ok` era true, `d.bloques` no existía, y caía a
   `responder()`, palabras clave sobre los KPIs de la página. Preguntas "¿cuánto
   le debo a Pedro?", el agente truena, y la pantalla contesta con el comprobado
   histórico de toda la flota con cara de respuesta.
   → **CERRADO** en `649f248`, con prueba que se pone roja si se revierte.
2. **BE-C1 · El import del TMS se roba el viaje vivo del chofer.**
   `importar_viajes.ts:207-217` × `conv.ts:164-181`. El importador inserta
   histórico con `estatus:'abierto'` y el operador amarrado; `getOpenViaje`
   ordena por `created_at desc`, así que el viaje recién importado gana. La foto
   del diésel de Pedro aterriza en `TMS-900` y el cuadre corre contra un
   anticipo de $12,000 que no recibió. **Verificado. PENDIENTE.**
3. **DAT-C1 · `viaje.operador_id` es NOT NULL y tres caminos escriben NULL.**
   `0001_init.sql:49` (verificado: ninguna migración posterior lo altera) contra
   `importar_viajes.ts:215`, `operacion.ts:566` y `:126`. El lote entero muere
   con 23502 en cuanto un renglón no trae operador exacto — y el propio
   comentario del tipo promete "el viaje se crea SIN asignar y esto lo dice".
   **Verificado. PENDIENTE.**
4. **FI-C1 · La elegibilidad de la RFA 2.9 se deriva de la clave SAT equivocada,
   en las dos direcciones.** `administracion.ts:115-116`. El código exige 601 o
   612; la ficha `rfa-2026-2.9.yaml` (**`verificado_fuente_primaria`**,
   verificado por mí en la ficha) exige Título II Capítulo VII = clave **624,
   Coordinados**, que ni siquiera está en el `<select>`. **PENDIENTE.**
5. **AG-C1 · Cierre parcial:** la liquidación queda cerrada, el operador recibe
   "se me trabó", y su reenvío cae en "no tienes viaje abierto". **PENDIENTE.**
6. **ARQ-C1 · "Viajes en curso" se cuenta sobre 100 filas** y se pinta junto a un
   conteo exacto en la misma fila de KPIs (REINCIDENTE de FE-A2). **PENDIENTE.**
7. **OP-C1 · 100% de fallos → HTTP 200 y nivel `info`** (reincidente de forma: el
   arreglo del pase 1 cubre el motor que *lanza*, no el que falla en todas sus
   unidades sin lanzar). **PENDIENTE.**
8. **PR-C1 · La prueba de `enLotes` es decoración**: el auditor la corrió contra
   un bucle serial y las tres `it` siguen verdes. El commit `54e0648` la cita
   como ancla de REND-C1. **PENDIENTE.**
9. **REND-C1 · La escalación corre sin reloj** y se come los 120s del cron antes
   de que la cobranza arranque (REINCIDENTE de REND-C2). **PENDIENTE.**
10. **REND-C2 · "Ejecutar ahora" de Cobranza manda hasta 500 mensajes en serie**,
    sin reloj y sin `maxDuration`. **PENDIENTE.**
11. **REND-C3 · El cruce del consolidado sigue sin reloj** y su ventana de
    corrupción sigue abierta (REINCIDENTE de REND-C1). **PENDIENTE.**

## Lo que este pase cambió en el código

Un solo arreglo, completo y probado. **No se abrieron más**: con 11 críticos
sobre la mesa, la decisión fue cerrar uno de verdad —prueba que reproduce,
arreglo, prueba verde, suite completa, commit atómico— en vez de dejar cinco a
medias. Los diez restantes quedan **pendientes con su escenario escrito**, que
es un estado honesto; darlos por cerrados sin prueba es exactamente lo que hizo
el pase 1 y por eso esta ronda encontró sus rutas abiertas.

- `649f248` — **FE-C1**. Prueba: `src/app/dashboard/chat.test.tsx`, 4 de sus 5
  casos se ponen rojos con el arreglo revertido (comprobado revirtiendo el
  cuerpo y volviendo a correr, no de memoria).

## Falsos y refutados

Señal de calidad de los auditores: varios se refutaron a sí mismos antes de
escribir.

- **FE-A1 heredado (bandeja de huérfanos acepta $0.00) — REFUTADO.** El motor
  levanta `monto_invalido` en `engine.ts:276-279` y la migración `0070`
  documenta el `>= 0` a propósito. Entra a la síntesis como descartado.
- **Billion-laughs en `fast-xml-parser` — DESCARTADO** por escrito: la 5.10.1
  instalada trae límites duros de expansión por default.
- **9 de 10 entradas de `npm audit` — DESCARTADAS** con razón individual
  (vitest/vite/esbuild son dev-only y no entran al bundle; postcss corre en
  build sobre CSS propio; brace-expansion/js-yaml/nanoid/fast-uri no reciben
  entrada del usuario).
- **Embeds ambiguos: barrido limpio.** Las ~190 llamadas a `.select()` de `src/`
  se revisaron una por una: los cinco pares con dos relaciones están todos
  aliasados, y los tres embeds sin alias apuntan a pares de una sola relación.
  No queda ninguno.

## Compuerta

Corrida real sobre el árbol final de esta rama:

```
npm test          → 269 archivos, 3,182 pruebas verdes, 1 skip   (exit 0)
npx tsc --noEmit  → limpio                                        (exit 0)
npm run lint      → 0 errores, 25 warnings (no-unused-vars en tests)
npm run build     → NO SE CORRE en la nube (sin credenciales)
```

**El CI de GitHub sale ROJO, y no por esta rama.** El job `verificar` corre además
`test:coverage` con umbrales globales, y esos umbrales llevan rotos desde antes:

| | `master` (815d8cb) | esta rama | umbral |
|---|---|---|---|
| Statements / Lines | 59.37% | **59.80%** | 67% |
| Branches | 83.30% | **83.33%** | 84% |
| Functions | 77.91% | 77.72% | 79% |

Medido corriendo `npm run test:coverage` en las dos puntas. El diff de esta ronda
sube tres de las cuatro métricas. El hueco de ~7 puntos lo abrieron los seis
agentes, el chat y el mapa que entraron esta semana sin arnés — es el mismo
hallazgo que `pruebas.md` califica con un 5. Anotado en el hilo del PR.

## INFRA (no son hallazgos del código)

- El contenedor llegó con `node_modules/` **vacío**. La primera corrida de la
  compuerta falló por eso, no por el repo; `npm ci` la dejó verde. Se anota como
  INFRA porque confundir esto con un rubro sin hallazgos es el fallo más caro de
  una corrida desatendida.
- **Hay cuatro PRs de auditoría abiertos de rondas viejas** (#6, #7, #8, #9) cuyas
  ramas cuelgan de una línea de historia que `master` ya abandonó: la base común
  es `003c88a` y desde ahí `master` lleva 50 commits por un lado y
  `claude/auditoria-17` 94 por el otro. **No se continuó sobre ellos a
  propósito**: auditar ese árbol sería auditar código que en `master` ya no
  existe (el borrado de las 17 páginas del panel es posterior). Alguien tiene que
  decidir si se cierran; no es decisión de la rutina.
