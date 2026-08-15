# MAPA — auditoría 3 (15-ago-2026)

## PASE 3 — continuación en la nube sobre la MISMA rama y el MISMO PR

Esta ronda **no abre PR nuevo**. Continúa sobre `claude/auditoria-3` (PR #13),
que seguía abierto. Ya hay seis PRs de auditoría encimados sin merge; abrir un
séptimo es exactamente el modo de falla que la regla de continuación existe para
evitar.

**Lo que cambió y por qué se relanzan los doce rubros:** la rama traía los
reportes del pase 2 escritos contra el commit `815d8cb`. Desde ahí `master`
avanzó **81 commits / 380 archivos / +54,356 líneas**, y este pase empezó
mergeando `master` a la rama (commit `01f270e`). Los reportes del pase 2
describen un árbol que ya no existe: **cada rubro tiene código nuevo**, así que
los doce se relanzan. No es repetición, es que el objeto auditado cambió.

### Lo que llegó de master desde el pase 2 (el foco de esta ronda)

Ordenado por lo que más superficie nueva abre:

- **Carta Porte** (`e7b1b1f`): clasificador, los 37 campos por responsable y el
  validador → `src/app/dashboard/carta-porte/`. Superficie fiscal NUEVA.
- **El lado del ingreso** (`a0350ae`, `fbab061`, `17f0242`, `fd5c7cb`):
  `factura_emitida` y `pago_recibido` **ya tienen escritor**; `unidad` e
  `ingreso_flete` entran por las TRES puertas de creación de viajes; clientes,
  tarifas, libro del viaje. **Ojo con CLAUDE.md**: la línea de "nadie las
  escribe" quedó obsoleta y ya se corrigió (`62f2d66`).
- **API pública consumible** (`5f1da5b`, `82f55a0`, `d6d7823`, `b0decdb`,
  `44e624c`): llaves de API por flota (`dashboard/llaves-api/`), idempotencia
  **durable** (mig. 0098), folio ocupado con otro contenido → 409, OpenAPI ya no
  miente sobre solo-lectura. `src/app/api/v1/`.
- **Correo transaccional** (`e674817`, `0b3ffde`, `a2268d6`, `74adcb6`,
  `606e12d`): Resend, `src/lib/correo/` (12 archivos), webhook de correo con
  tope de adjuntos, Resend en el anexo de subencargados. Superficie LEGAL nueva
  (transferencia a tercero).
- **Buzón, cofre y purga** (`9155398`, `73bbbb8`): intake por correo, secretos,
  purga — y una purga de la 0098 que **era llamable por `anon` desde internet**
  (arreglada; verificar que no quede otra).
- **Alertas y observabilidad** (`f7d6981`, `836bea5`, `d098310`):
  `src/lib/observability/` (7 archivos), notificaciones en los seis agentes,
  cierre de corrida. El rubro de operabilidad tiene material nuevo real.
- **Legal E1–E5** (`67f785d`, `1eb65c5`, `8269012`): derecho de oposición
  honrable, fichas que ya no mienten sobre el código, **retención** que corre
  (mig. 0104).
- **Agentes B1–B8** (`fcf490a`, `934149a`, `28eec66`, `585b099`, `3010eba`):
  Peajes ya es agente, escalado se emite, corridas con historial, estrategia
  editable, "mándate una prueba", `cola_atorada`, el piso de una hora.
- **/admin rediseñado** (`71b5f76`, `c2911d0`, `d25b93e`, `36aa0e5`): la consola
  que opera, zona de vendedores, sidebar abierto, **el asistente de IA de /admin
  ya no existe** (borrado), y el cierre de escala 15k (mig. 0111 índices).
- **D6** (`fbfbeec`): el dueño invita a su propio contralor — alta de usuarios
  sin pasar por Javier. Superficie de SEGURIDAD nueva.
- **Ensayo 14-ago** (`441eb86`): el demo corría con la **validación de receptor
  APAGADA**. Leer ese commit antes de calificar fiscal.
- **Migraciones**: del 0092 al **0111**. Las nuevas incluyen 0098 (idempotencia),
  0104 (retención), 0105 (vendedores), 0106–0109 (peajes/talacha/proveedor/firma),
  0110 (interruptores), 0111 (índices de escala).
- **`normas/`**: 23 fichas (eran 21).

## Línea base REAL de este pase (corrida hoy sobre el árbol mergeado)

```
npx tsc --noEmit -p .   → LIMPIO (exit 0)
npx vitest run          → ver 00-SINTESIS.md (corrida al cierre)
npm run lint            → ver 00-SINTESIS.md
npm run build           → NO SE CORRE en la nube (sin credenciales)
```

**INFRA — leer antes de culpar al código:** `npm ci` **falla** en este entorno.
`package.json:38` pide `xlsx` desde `https://cdn.sheetjs.com/...`, y la política
de red del contenedor deniega ese host (403 en el CONNECT; solo
`registry.npmjs.org` está permitido). npm revierte y deja `node_modules/`
**vacío**. Para poder correr la compuerta se instaló `xlsx@0.18.5` desde el
registry de npm — **es una desviación del lockfile, no del repo**, y no se
commitea. Confundir esto con un rubro sin hallazgos es el fallo más caro de una
corrida desatendida.

**NO corras `npm test` ni `npm run build` tú: la línea base ya corrió y 12
suites en paralelo tumban la máquina. Lee, busca (grep), y cita.**

## Hallazgos abiertos que hereda este pase

El pase 2 cerró **PARCIAL**: 12 rubros calificados, tablero mirado, **1 de 11
críticos cerrado** (FE-C1, `649f248`) y **10 pendientes con su escenario
escrito**. Están en `00-SINTESIS.md`. Cada auditor los verifica PRIMERO contra el
árbol de hoy — muchos pudieron morir con los 81 commits de master, y decir cuáles
murieron es lo que justifica subir una nota:

| ID | Qué es | Dónde lo dejó el pase 2 |
|---|---|---|
| FE-C1 | El chat contesta con heurístico local cuando el agente falla | **CERRADO** `649f248` |
| BE-C1 | El import del TMS se roba el viaje vivo del chofer | `importar_viajes.ts:207-217` × `conv.ts:164-181` |
| DAT-C1 | `viaje.operador_id` NOT NULL y tres caminos escriben NULL | `0001_init.sql:49` × `importar_viajes.ts:215`, `operacion.ts:566`, `:126` |
| FI-C1 | Elegibilidad RFA 2.9 desde la clave SAT equivocada | `administracion.ts:115-116` vs `normas/rfa-2026-2.9.yaml` |
| AG-C1 | Cierre parcial: la liquidación cierra, el operador oye "se me trabó" | processor / conv |
| ARQ-C1 | "Viajes en curso" contado sobre 100 filas junto a un conteo exacto | KPIs del dashboard |
| OP-C1 | 100% de fallos → HTTP 200 y nivel `info` | cron |
| PR-C1 | La prueba de `enLotes` es decoración (verde contra un bucle serial) | `lotes.test.ts` |
| REND-C1 | La escalación corre sin reloj y se come los 120s del cron | cron escalar |
| REND-C2 | "Ejecutar ahora" de Cobranza: hasta 500 mensajes en serie | agentes/cobranza |
| REND-C3 | El cruce del consolidado sigue sin reloj | intake/consolidado |

Además quedaron **43 altos, 42 medios y 29 bajos** propuestos en los archivos de
rubro del pase 2 (están en git; el pase 3 los sobrescribe, la historia los
conserva).

## Dónde está todo

- Panel del CLIENTE: `src/app/dashboard/**` (todo filtrado a tenant; roles:
  superadmin, flota_admin, contador, encargado; el chofer NO tiene login — solo
  WhatsApp).
- Consola de Javier: `src/app/admin/**` (cruza tenants a propósito vía
  `lib/admin/negocio.ts`).
- Motores: `src/lib/likida/**` (cuadre/ es PURO; formato de cifras SOLO en
  `lib/formato.ts` — hay prueba guardián).
- WhatsApp: `api/webhook/whatsapp/route.ts` → `processor.ts` (el corazón).
- Visibilidad por rol: `lib/auth/visibilidad.ts`; permisos de acción:
  `lib/auth/permisos.ts`.
- Correo: `src/lib/correo/**` (Resend). Observabilidad: `src/lib/observability/**`.
- Normas fiscales: `normas/*.yaml` (fuente de verdad; el fiscal las abre y
  transcribe).

## Qué NO tocar / reglas duras del repo

- **NADIE edita código en fase de auditoría** — encuentras y calificas; el
  orquestador arregla.
- `pruebas-manuales/*.prueba.ts` NO se corren (pago real).
- Nunca inventar cifras; rótulos verdaderos; fallar cerrado y decirlo — los
  hallazgos que violen esto pesan doble.
- El candado del timbrado (`facturacion/modo.ts`) está APAGADO a propósito
  (decisión de negocio: se enciende al primer cliente). No es hallazgo.
- La base entera está en CERO (0 viajes) porque **no hay clientes todavía**, no
  porque falte código. Pantallas que declaren el vacío honestamente ≠ hallazgo;
  pantallas que finjan datos SÍ.
- `factura_emitida`, `pago_recibido`, `posicion` y `geocerca`: las dos primeras
  YA tienen escritor desde esta semana; las dos últimas no. Ver CLAUDE.md.
