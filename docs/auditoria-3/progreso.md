# Progreso — auditoría 3, pase 3 (15-ago-2026, corrida desatendida en la nube)

Una línea por acción, con su sha. Se escribe MIENTRAS avanza, no al cerrar.

## Anclaje

- `—` Árbol LIMPIO al arrancar (`git status` sin cambios). Autofix HABILITADO.
- `—` HEAD llegó detached desde `master` (`36aa0e5`). Clon **shallow** (depth 50);
  hubo que `git fetch --deepen=200` para encontrar la base común.
- `—` **Decisión de tamaño de ronda: CONTINUACIÓN.** `gh` no existe en este
  entorno; se listaron los PR con la herramienta MCP de GitHub. Hay **seis** PR
  de auditoría abiertos; el vivo de esta ronda es **#13 · `claude/auditoria-3`**.
  No se abre PR nuevo.
- `01f270e` Merge de `origin/master` (81 commits, 380 archivos, +54,356 líneas) a
  la rama. Conflictos SOLO en `docs/auditoria-3/*` (add/add: pase 1 en master vs
  pase 2 en la rama); se resolvieron tomando la versión de la rama (pase 2, la
  más profunda). **Cero conflictos en código.**
- `INFRA` `npm ci` **falla** en este contenedor: `package.json:38` pide `xlsx`
  desde `https://cdn.sheetjs.com/...` y la política de red deniega ese host
  (403 en el CONNECT; el proxy solo permite `registry.npmjs.org`). npm revierte
  y deja `node_modules/` vacío — la primera corrida de la compuerta falló por
  esto, **no por el repo**. Workaround: `xlsx@0.18.5` desde el registry de npm.
  Es una desviación del lockfile que **no se commitea**; `package.json` y
  `package-lock.json` se restauran antes de cerrar.
- `c086464` MAPA del pase 3 en disco: qué llegó de master, la línea base y los
  11 críticos heredados con su estado.

### Compuerta al anclaje (salida real, sobre el árbol mergeado)

```
npx vitest run        → 329 archivos, 4,502 pruebas, 1 skipped   exit 0
npx tsc --noEmit -p . → limpio                                    exit 0
npm run lint          → 0 errores, 23 warnings (unused-vars)      exit 0
npm run build         → NO SE CORRE en la nube (sin credenciales)
```

## Auditoría

- `—` Doce auditores lanzados en un solo mensaje, contexto fresco, un rubro cada
  uno, ninguno toca código.

- `—` Los doce entregaron. **134 hallazgos: 13 C · 46 A · 42 M · 33 B.**
- `—` Verificación del orquestador ANTES de anotar: se abrieron los archivos de
  los críticos heredados. **DAT-C1 del pase 2 resultó MUERTO** (`17dd02b` manda
  las filas sin operador a `sinOperador` y nunca las inserta,
  `importar_viajes.ts:327,385`), y **BE-C1 medio muerto** (el pre-chequeo de
  ocupados en `:376-405` mató el robo del viaje vivo; la raíz sigue).
- `12e5f0a` Los doce reportes de rubro en disco.

## Arreglos

Uno por commit, citando el ID. Prueba roja primero, verde después, suite
completa entre uno y otro.

- `285d5e3` **DAT-C1 (CRÍTICO) — CERRADO.** `agentes` entra a la lista blanca de
  `config_tenant_valida` (mig. `0112`, dos líneas de diff contra la 0085) +
  guardián `config_llaves_db.test.ts`. Comprobado ROJO quitando la migración y
  verde devolviéndola, no de memoria. Suite: 330 archivos / 4,504 verdes.
  La 0112 entra a `EXENTAS` de `migraciones_verificadas.test.ts` con el mismo
  criterio que la 0082/0083/0085 (si falta, revienta ruidoso, no en silencio).
- `86fb450` **FI-C1 (CRÍTICO, reincidente 3ª ronda) — CERRADO.** La RFA 2.9 se
  decide con 624 (Coordinados), no con 601. Ancla `rfa29_regimenes.test.ts`
  contra el TEXTO de la ficha: roja antes en tres aserciones, verde después.
  Suite: 331 archivos / 4,509 verdes. tsc limpio, eslint 0 errores.
  Fuera de alcance a propósito: `lib/saas/fiscal.ts:20-26` tampoco ofrece el
  624, pero es el CFDI de la suscripción — otro camino, queda como hallazgo.
- `—` **Se paró en dos, no en tres.** Con 13 críticos sobre la mesa, cerrar dos
  con ancla real vale más que dejar seis a medias — es el error que el pase 1
  de esta ronda ya pagó. Los 11 restantes quedan PENDIENTES con escenario.

## Cierre

- `—` `package.json` y `package-lock.json` RESTAURADOS: la desviación de `xlsx`
  no se commitea. `git status` sin rastro de ella.
- `—` Tablero pintado, capturado **y mirado**: se contaron los 12 rubros, se
  cuadró cada nota contra la síntesis y los totales por severidad (13/46/42/33
  = 134). Se recapturó dos veces por recorte de contenido.
- `—` `00-SINTESIS.md` con las doce notas, el delta y el porqué de cada
  movimiento. `RESULTADO.md` con la línea de estado.
- `—` Push a `claude/auditoria-3` y actualización del cuerpo del PR #13.
