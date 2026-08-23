# La compuerta — auditoría 18

Salida real, pegada. En la nube la compuerta es `npm test` + `npx tsc --noEmit` +
`npm run lint`. **No** se corre `npm run build`: pide Supabase, OpenRouter, Facturapi y
Upstash, que aquí no existen, y su fallo no dice nada del código.

---

## Continuación 3 — 22-ago-2026

### `npm ci` — limpio, y esto es noticia

Las dos pasadas anteriores tuvieron que hacer un workaround: `npm ci` fallaba con 403
bajando `xlsx` desde `cdn.sheetjs.com`, host fuera de la política de red del entorno.
`5eca3ab` lo vendorizó en `vendor/`. Esta ronda:

```
added 644 packages in 41s
```

Sin workaround, sin tocar `package.json`. **El INFRA de las dos rondas anteriores está
cerrado.**

### Línea base, justo después del merge de `master` (`673496f`)

Dos fallos, y **los dos eran secuela de mi resolución del merge**, no de `master` ni de
la rama por separado:

```
 FAIL  src/lib/likida/processor_oficina_despacho.test.ts > processInbound — la rama de
       oficina despacha > el texto del jefe pasa por despacho_wa y su respuesta es la que sale
 AssertionError: expected "spy" to be called with arguments: [ { tenantId: 't1', …(1) }, …(4) ]
   Recibido: 3 argumentos, sin  Any<Date>  ni  { reengancharPendiente: true }

 Test Files  1 failed | 431 passed (432)
      Tests  1 failed | 5513 passed | 1 skipped (5515)
```

```
src/lib/likida/migraciones_verificadas.test.ts(104,3): error TS1117:
An object literal cannot have multiple properties with the same name.
```

Ambos explicados y corregidos en `38eef84` (ver `MAPA.md` § «El merge, y los tres
conflictos que resolví»).

### Compuerta tras el arreglo del merge — VERDE

```
 Test Files  432 passed (432)
      Tests  5514 passed | 1 skipped (5515)
   Duration  86.48s
```

```
$ npx tsc --noEmit -p .
(sin salida)
```

```
$ npm run lint
> eslint src/

src/app/dashboard/mi-perfil/page.tsx
  248:19  warning  Using `<img>` could result in slower LCP …  @next/next/no-img-element
src/lib/admin/evals.io.test.ts
  9:12  warning  'tabla' is defined but never used …
src/lib/admin/qa-storage.test.ts
  7:20  warning  'BUCKET_QA_EVIDENCIA' is defined but never used …
src/lib/agents/copiloto-tools.test.ts
  99:10  warning  'readdirSync' is defined but never used …
src/lib/worker/llaves.test.ts
  9:12  warning  'tabla' is defined but never used …

✖ 5 problems (0 errors, 5 warnings)
```

Los 5 avisos son los mismos de la línea base de las dos pasadas anteriores.

**Crecimiento de la suite:** 393 archivos / 5,135 pruebas (21-ago) → **432 archivos /
5,515 pruebas** (22-ago). +39 archivos, +380 pruebas, casi todas del PR #38.
Que la suite crezca no es lo mismo que que cubra: eso lo mide el auditor de pruebas
rompiendo funciones a propósito.
