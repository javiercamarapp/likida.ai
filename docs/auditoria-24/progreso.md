# Progreso — auditoría 24 (continuación), 2-sep-2026

Una línea por acción, con su sha. Se escribe MIENTRAS avanza.

## Anclaje

- `11:00` Ronda decidida: **CONTINUACIÓN**. Hay PR de auditoría abierto (#303,
  `aud24/integracion`, 188 commits / 484 archivos). No se abre PR nuevo.
- `11:00` Árbol limpio al arrancar (`git status --porcelain` vacío) → **autofix habilitado**.
- `11:00` `docs/auditoria-24/` NO existe en el árbol → faltan los 12 archivos de
  rubro → se relanzan los 12 auditores sobre el árbol integrado.
- `11:05` **CI del #303 en ROJO**, verificado por API: el job `verificar` falla en
  las dos corridas (100209095215, 100208996649). Los otros 6 checks en verde.
- `11:07` Compuerta base sobre `49ecf93`:
  - `npm test` → **819 archivos, 10,941 pruebas, 1 saltada, exit 0** ✅
  - `npm run lint` → **0 errores, 173 avisos, exit 0** ✅
  - `npm run lint:ratchet` → **173/173 heredados, 0 nuevos** ✅
  - `npx tsc --noEmit` → 0 errores **con heap suficiente**; **exit 134 (OOM) con el
    techo del runner** ❌ — es el único bloqueador de la CI.
- `11:10` 12 auditores lanzados en paralelo, contexto fresco, uno por rubro.

## Hallazgo propio del orquestador · OP-1 (CRÍTICO, reproducido)

El paso Typecheck de CI muere con `FATAL ERROR: Ineffective mark-compacts near
heap limit — JavaScript heap out of memory`, exit 134, mientras el cuerpo del
#303 afirma «`tsc --noEmit`: limpio».

Por qué era invisible: `tsconfig.json` tiene `incremental: true` y
`tsconfig.tsbuildinfo` está en `.gitignore:10`. En local el typecheck corre
**caliente**; en CI corre siempre en **frío**, sobre un clon nuevo. Medido:

| Corrida | Techo | Resultado |
|---|---|---|
| caliente | 2048 MiB | exit 0 |
| **fría** | 2048 MiB | **exit 134** |
| fría | 4096 MiB | exit 0 |
| fría | 8192 MiB | exit 0 · **pico real de RSS: 2,672 MiB** |

La primera medición de pico (958 MiB) salió CALIENTE y era engañosa; se
descartó y se volvió a medir en frío. Queda anotado porque es exactamente el
error que produjo el hallazgo.

- `11:18` Ancla escrita en `pruebas_en_ci.test.ts` → **ROJA** por la razón
  correcta (`expected 0 to be greater than or equal to 4096`).
- `11:19` Arreglo: el techo va en `package.json → scripts.typecheck`, no en el
  workflow, para que lo hereden los **dos** workflows que llaman
  `npm run typecheck` y cualquiera que se agregue después. Ancla **VERDE**;
  typecheck **en frío** exit 0.
- `11:20` Suite completa → **1 fallo**. Descartado como propio: el auditor de
  Pruebas tiene permiso de mutar `src/` temporalmente y estaba corriendo.
  Se revalida con el árbol quieto antes de commitear.
- `11:20` `lint:ratchet` → **174 vs 173**: mi propia prueba metió un
  `readFileSync` con argumento no literal. **El trinquete lo cazó antes del
  primer commit**, igual que en la ronda 23.
- `11:23` Reescrito con lecturas literales → ratchet **173/173, 0 nuevos** ✅

## Arreglos

- `11:26` **AGEN-1** verificado abriendo el código: `session.ts:99` respeta
  `activo`; `contactos.ts` no lo pedía siquiera en el `select`. Confirmado.
- `11:26` 4 pruebas nuevas en `contactos.test.ts` → **2 rojas** por la razón
  correcta. Arreglo → **9 verdes**. Comprobado que siguen rojas SIN el arreglo
  revirtiendo el archivo con el doble ya actualizado.
- `11:27` Suite completa **819/819, 10,946 verdes** · ratchet 173/173.
- `11:28` `22dc127` OP-1 y `70dd5c6` AGEN-1, commits atómicos.
- `11:29` **Push a `aud24/integracion` OK** (`49ecf93..70dd5c6`). PR #303
  actualizado, sin abrir PR nuevo. CI relanzada.

## Verificación de los críticos ajenos

- **FIS-C1 CONFIRMADO**: `fiscal.ts:814` llena `proporciones` solo con
  alimentación; `:850` cae a `?? 1`. `engine.ts:493` exporta
  `proporcionesDeducibles` con las dos reglas y `fiscal.ts` **no la importa**.
  → PENDIENTE: exige las `diferencias` del motor dentro del panel. No quirúrgico.
- **BE-C1 / DATOS-C1 CONFIRMADO**: `grep -n "pdf" revision.ts` → vacío. La 0299
  declara por escrito que ajusta por delta y no re-cuadra.
  → PENDIENTE: regenerar o invalidar el papel es decisión de producto.
- **OP-C1 CONFIRMADO** con `git log`: último `[deploy]` = `86813f4`.
  → PENDIENTE: no es código.
- **3 DESCARTADOS por falsos**, con la razón, en `00-SINTESIS.md`.

## Cierre

- `11:34` Tablero renderizado con Chromium headless y **mirado**: 12 rubros,
  global 6.2 = 74/12, colores por nota.
- Tope de 3 vueltas: **2 usadas**. La tercera se deja sin gastar a propósito.

## CI verificada en verde (cierre real de la ronda)

- `11:50` Job `verificar` sobre `7991354`: **success**, 12 min 53 s. El paso
  Typecheck pasa en **53 s** y el job sigue de largo — Lint, resiliencia,
  `test:coverage`, pruebas de tiempo, **Build** y el smoke de Playwright.
  Esos seis pasos **nunca se habían ejecutado en esta rama**: morían `skipped`
  detrás del OOM. `npm run build` corriendo en CI es, además, la única
  verificación del build que esta ronda podía obtener — aquí no corre.
- `11:50` **Los 8 checks del PR #303 en `success`** y `mergeable_state: clean`.
