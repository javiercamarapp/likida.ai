# Diario de la ronda 4 (pase 4 del PR #13) — 16-ago-2026

Se escribe MIENTRAS avanza, no al cerrar.

- `INFRA` — clon en `/home/user/cuadra`, remoto `javiercamarapp/cuadra`
  (GitHub redirige a `javiercamarapp/likida.ai`). Árbol **limpio** al arrancar
  ⇒ autofix HABILITADO.
- `PASO 1` — PR de auditoría abierto detectado: **#13** (`claude/auditoria-3`,
  draft, actualizado 15-ago). ⇒ **RONDA DE CONTINUACIÓN**, no PR nuevo.
  También abiertos y viejos: #6, #7, #8, #9, #10 (auditorías) y #14, #15, #16
  (dependabot).
- `PASO 1` — `origin/master` iba **37 commits adelante** de la rama
  (110 archivos en `src/`+`supabase/`+`normas/`, +9,355/−650, migs 0112→0120)
  ⇒ los DOCE rubros se relanzan: los reportes del pase 3 describen otro árbol.
- `INFRA` — `curl` a `cdn.sheetjs.com` → **403 en el CONNECT** (política de red).
  `npm ci` imposible. Instalado `xlsx@0.18.5` del registry;
  `package.json`/`package-lock.json` **restaurados** (`git status` limpio).
- `merge` — `origin/master` mergeado a la rama, sin conflictos.
- `docs/auditoria-4/MAPA.md` escrito.

## Línea base de la compuerta (16-ago-2026, sobre el árbol mergeado)

```
npx vitest run        → 348 archivos, 4,652 pruebas verdes, 1 skipped    exit 0
npx tsc --noEmit -p . → ROJO: 1 error                                    exit 1
   src/lib/likida/migraciones_verificadas.test.ts(61,3): error TS1117:
   An object literal cannot have multiple properties with the same name.
npm run lint          → 0 errores, 0 warnings                            exit 0
npm run build         → NO SE CORRE en la nube (sin credenciales)
```

- `HALLAZGO/INFRA` — **el rojo lo creó el merge de esta ronda, no master ni la
  rama por separado**: hay **colisión de número de migración 0112**.
  `supabase/migrations/0112_agregados_rpc.sql` (de master, `296224d`) y
  `supabase/migrations/0112_config_llave_agentes.sql` (el arreglo DAT-C1 del
  pase 3, `285d5e3`) comparten número, y `migraciones_verificadas.test.ts:61`
  quedó con la llave `'0112'` DOS veces en `EXENTAS`. `vitest` pasa igual — el
  segundo literal pisa al primero en silencio — y solo `tsc` lo caza.
  Se arregla en la fase 4; el diario deja la línea base roja escrita.
- `FIX A4-DAT-C1` — colisión de número 0112 resuelta: la migración del pase 3 se
  renumera a `0121_config_llave_agentes.sql` (siguiente libre) y la llave
  duplicada de `EXENTAS` pasa a `'0121'`. Rojo comprobado ANTES (TS1117 en la
  línea base), verde después: `tsc` exit 0, suite 348/4,652 verdes.
- `FIX A4-FIS-C1` — un CFDI que ampara N casetas ya no se lee como N−1 copias.
  Rojo comprobado ANTES (`expected 1000 to be 8000` en el lote de ocho casetas
  de $1,000), verde después. Suite 349 archivos / 4,657 verdes, `tsc` exit 0,
  lint limpio. Tres archivos: el tipo, el `select` de `getGastos` y la llave del
  dedup.
