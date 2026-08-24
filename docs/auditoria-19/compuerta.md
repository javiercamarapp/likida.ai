# La compuerta — auditoría 19 (24-ago-2026)

Línea base sobre `claude/auditoria-19` @ `8b43121` (= `origin/master`), árbol limpio.
Corrida en la nube: **sin `npm run build`** (no hay `.env`: Supabase, OpenRouter,
Facturapi, Upstash) y **sin `pruebas-manuales/*.prueba.ts`** (llamadas reales de pago).

## Antes de nada: el repo no traía `node_modules`

`npm ci` corrió limpio (exit 0). No se repitió el problema del symlink de la c4
(`OPER-C4-1`) — la prueba `src/lib/pruebas/arbol_sin_enlaces_ajenos.test.ts` que lo ancla
está en el árbol y pasa.

## 1 · `npx vitest run` — **VERDE**

```
 Test Files  501 passed (501)
      Tests  6434 passed | 1 skipped (6435)
   Start at  11:03:35
   Duration  80.77s (transform 18.15s, setup 0ms, import 73.74s, tests 86.82s)
[exited with code 0]
```

Contra la c4 (486 archivos, 6,255 pruebas, 1 saltada): **+15 archivos de prueba,
+179 pruebas**. La saltada sigue siendo una.

## 2 · `npx tsc --noEmit -p .` — **VERDE**

Salida vacía, `exit 0`.

## 3 · `npm run lint` — **0 errores, 157 avisos**

```
✖ 157 problems (0 errors, 157 warnings)
```

**Contra la c4, que reportó 24 avisos: los avisos se multiplicaron por 6.5 en un día.**
No es un rojo y no bloquea, pero es exactamente la forma en que un lint deja de leerse:
cuando la lista ya no cabe en una pantalla, nadie distingue el aviso nuevo del viejo.
Queda anotado para el rubro de operabilidad. El grueso son
`security/detect-non-literal-fs-filename` en archivos de prueba y
`@typescript-eslint/no-unused-vars`.

## Veredicto

**La compuerta arranca verde**, a diferencia de la c4 (que arrancó roja en dos frentes,
los dos de `master`). Autofix **habilitado**: árbol limpio + compuerta verde.
