# Compuerta — línea base de la auditoría 18

Corrida el 20-ago-2026 sobre `claude/auditoria-18` @ `8d608a4` (= `master`), árbol limpio.
En la nube: **sin `npm run build`** (pide Supabase, OpenRouter, Facturapi y Upstash, que aquí
no existen; su fallo no diría nada del código).

## `npx vitest run` — VERDE

```
 Test Files  388 passed (388)
      Tests  5045 passed | 1 skipped (5046)
   Duration  90.93s
[exited with code 0]
```

Nota: 5,045 pruebas, no las "~2,880" que cita `CLAUDE.md`. La cifra crece; el documento la
declara como no citable de memoria y tiene razón.

## `npx tsc --noEmit -p .` — VERDE

Salida vacía, exit 0.

## `npx eslint src/` — VERDE (0 errores, 5 avisos)

```
src/app/dashboard/mi-perfil/page.tsx
  248:19  warning  Using `<img>` could result in slower LCP ...  @next/next/no-img-element
src/lib/admin/evals.io.test.ts
  9:12  warning  'tabla' is defined but never used  @typescript-eslint/no-unused-vars
src/lib/admin/qa-storage.test.ts
  7:20  warning  'BUCKET_QA_EVIDENCIA' is defined but never used  @typescript-eslint/no-unused-vars
src/lib/agents/copiloto-tools.test.ts
  99:10  warning  'readdirSync' is defined but never used  @typescript-eslint/no-unused-vars
src/lib/worker/llaves.test.ts
  9:12  warning  'tabla' is defined but never used  @typescript-eslint/no-unused-vars

✖ 5 problems (0 errors, 5 warnings)
[exited with code 0]
```

## INFRA — lo que no se pudo correr aquí, y no cuenta como hallazgo de código

- **`npm install` limpio falla.** `package.json:45` fija `xlsx` a
  `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`; ese host está fuera de la política de
  red del entorno y devuelve `403 Forbidden` en el CONNECT. Para levantar la compuerta se
  instaló `xlsx@0.18.5` desde el registry y se restauraron `package.json` y
  `package-lock.json` con `git checkout`, de modo que el árbol auditado es exactamente el de
  `master`. Esto es INFRA para la corrida, pero es también materia legítima del rubro de
  operabilidad: un proyecto que no se instala detrás de una política de red restringida no se
  instala en un CI endurecido ni en la máquina de un cliente enterprise.
- **Sin `.env`, sin Supabase, sin OpenRouter, sin red hacia proveedores.** Todo hallazgo de
  esta ronda se sostiene por lectura de código y por la suite offline.
