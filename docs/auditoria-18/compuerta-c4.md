# La compuerta — auditoría 18 · continuación 4 (23-ago-2026)

En la nube, desatendida. Rama `claude/auditoria-18`, PR #34.
Sin `.env`, sin base, sin red a proveedores → **no se corre `npm run build`**.
La compuerta es `npm test` + `npx tsc --noEmit` + `npm run lint`.

## Árbol al arrancar

```
$ git status --porcelain
(vacío)
$ git log -1 --format='%H %s'
583fec4b7ff3c4bb00f8f6af23212ae9e7f8a872 [deploy] series de factura, streaming por bloque y el Cerebro sin 33 MB al navegador
```

**Limpio → autofix habilitado.**

## Dos rojos ANTES de los auditores, los dos de `master`

### 1 · `node_modules` era un enlace a la laptop del autor (OPER-C4-1)

`master` versionaba, en modo `120000`, un enlace simbólico:

```
$ git ls-tree origin/master node_modules
120000 blob 9ae56bbe5af3a0235b6f9b454b5389b584baed1e	node_modules
$ readlink node_modules
/Users/javiercamaraportepetit/likida/node_modules
```

Se coló porque `.gitignore:1` decía `node_modules/` **con diagonal**, forma que en git
solo casa directorios; un enlace con ese nombre no es un directorio y pasó de largo.

Lo que le pasa a quien clona, medido y no supuesto:

```
$ ls node_modules/
ls: cannot access 'node_modules/': No such file or directory
$ npx vitest run src/lib/pruebas/arbol_sin_enlaces_ajenos.test.ts
Error: Cannot find module 'vitest/config'
Require stack: - /home/user/cuadra/vitest.config.ts
```

No fallan unas pruebas: **no arranca ninguna**. `npm ci` lo sobrevive porque borra y
recrea, pero al hacerlo deja el árbol sucio (` D node_modules`) — que es exactamente lo
que apaga el autofix de esta auditoría.

Arreglado en `8282fa4`, con prueba que lo reproduce
(`src/lib/pruebas/arbol_sin_enlaces_ajenos.test.ts`): ninguna ruta versionada puede ser
un enlace a ruta **absoluta**. Verificado revirtiendo: con el enlace restaurado la
prueba **no llega ni a correr**, que es el fallo mismo.

### 2 · La compuerta base salió roja: `$9,000.0 M` (FMT-C4-1)

```
$ npm test
 FAIL  src/lib/formato.test.ts > mxnCompacto — la cifra que no cabe en la tarjeta
       > nueve mil millones caben en ocho caracteres
AssertionError: expected '$9,000.0 M' to be '$9,000 M' // Object.is equality

Expected: "$9,000 M"
Received: "$9,000.0 M"

 ❯ src/lib/formato.test.ts:353:40

 Test Files  1 failed | 484 passed (485)
      Tests  1 failed | 6246 passed | 1 skipped (6248)
```

**No es del merge ni del entorno.** `git diff origin/master -- src/lib/formato.ts
src/lib/formato.test.ts` sale vacío, y el CI corre el mismo Node 22
(`ci.yml:42`, `ci-postgres.yml:95`).

Causa, medida:

```
maxFD:1              "$9,000.0 M"
sin opciones         "$9,000 M"
min0 + max1          "$9,000 M"
1.5e6 con min0/max1  "$1.5 M"
```

Declarar `maximumFractionDigits` a secas saca a ICU de su *compact rounding* —el modo
que suelta los ceros de cola— y lo pasa a dígitos fijos, que los conserva. El daño no es
cosmético: `"$9,000.0 M"` son diez caracteres donde la prueba exige ocho, o sea el
desbordamiento de la tarjeta de KPI que FE-17 vino a cerrar.

Arreglado en `3af1ea4` con `minimumFractionDigits: 0` explícito. La prueba ya existía y
ya reproducía el fallo — por eso la compuerta lo cazó.

## Línea base final (sobre `3af1ea4`)

```
$ npm test
 Test Files  485 passed (485)
      Tests  6247 passed | 1 skipped (6248)
   Duration  83.54s

$ npx tsc --noEmit -p .
(sin salida)

$ npm run lint
✖ 24 problems (0 errors, 24 warnings)
```

Los 24 avisos son todos `no-unused-vars` en pruebas y un `<img>` en
`dashboard/mi-perfil/page.tsx:248`. Cero errores.

**Verde. Es contra esto que se mide el resto de la ronda.**

## Lo que NO se verificó aquí

- **Ninguna migración se ejecutó.** No hay Postgres en esta caja: todo lo que se diga de
  `supabase/migrations/*.sql` y de `verificaciones.sql` sale de **leer el archivo**.
  Las 18 migraciones nuevas (0150–0167) entran a la ronda sin haber corrido.
- **`npm run build` no se corrió** y por lo tanto no hay garantía de que el árbol compile
  en Next: el CI del PR es quien lo dice.
- **`pruebas-manuales/*.prueba.ts` no se corrieron**: hacen llamadas reales de pago.
- La intermitente que la c3 dejó anotada (`engine_iva_medio_pago.test.ts:35`) **no se
  reprodujo** en las tres corridas completas de hoy. Sigue abierta como intermitente.
