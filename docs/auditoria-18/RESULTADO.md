COMPLETA (continuación)

Auditoría 18 · continuación · 21-ago-2026 · en la nube, desatendida
rama `claude/auditoria-18`, PR #34 · `master` @ `d432e89`

Ronda de **continuación**, no ronda nueva: el PR #34 seguía abierto, así que se
trabajó sobre la misma rama. Los 12 rubros se relanzaron porque los 12 tenían
código cambiado en el delta `8d608a4..d432e89` (9 commits, 53 archivos,
+3,691/−297), incluidos los 4 commits que la ronda 18 confesó no haber mirado.

- 12 rubros de 12, contexto fresco, uno por rubro → `docs/auditoria-18/<rubro>-c2.md`.
- 114 hallazgos: 16 CRÍTICO · 41 ALTO · 39 MEDIO · 18 BAJO.
- 3 arreglados, los 3 CRÍTICOS, con prueba que los reproduce y commit atómico
  (`dcc77d3`, `b0b8a87`, `17c6343`). Ninguno revertido. Tope de 3 vueltas gastado.
- Global **4.8** — **−1.3** contra el 6.1 de la ronda 18. Ninguna nota subió.
- **La compuerta arrancó ROJA, y el rojo era de `master`**: 5 corridas de CI en
  rojo desde `0bfb51c` (20-ago 11:18 CST) con 4 commits `[deploy]` encima.
  Arreglado en `dcc77d3`.
- Compuerta final verde: 393 archivos, 5,134 pruebas, 1 saltada; `tsc` limpio;
  `eslint` 0 errores, 5 avisos.
- Tablero renderizado, capturado y mirado (`tablero-c2.png`); se corrigieron dos
  defectos de render antes de darlo por bueno.

Lo que necesita decisión del dueño, no más código:

1. **El piloto de visión** — 8 de los 13 críticos que quedan, convergencia de 7
   de los 12 auditores. Todo detrás de `FACTURACION_PILOTO`, apagada hoy. **El
   doc del demo manda encenderla: no encenderla antes de decidir esto.**
2. **La clave 624 (Coordinados)** no existe en `REGIMENES` ni en el CHECK de la
   0056 — pide migración. Sin ella, tras `17c6343` la facilidad del 15% solo la
   alcanza una persona física 612.
3. **El aviso de privacidad sin pantalla de captura**, y el decisor del prospecto
   sin aviso que lo cubra (reincidente de la ronda 18).
4. Los dos fiscales que la ronda 18 ya había dejado propuestos siguen idénticos:
   el 50% de peaje sobre casetas en efectivo (`engine.ts:1021`) y el pie del PDF
   con «13.8%» (`acreditable.ts:47-49`, y el número correcto es 16%).

CI del PR sobre `9fab6f1`: `verificar` verde (2/2), `Migraciones + aislamiento
(Postgres efímero)` verde (2/2), GitGuardian y Vercel verdes. Siguen rojos
`dependency-review` y CodeQL, los dos por configuración del repo («no está
habilitado en este repositorio»), no por el diff — es un ajuste en Settings →
Code security.
