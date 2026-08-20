COMPLETA

Auditoría 18 · 20-ago-2026 · en la nube, desatendida · `master` @ `8d608a4`
rama `claude/auditoria-18`

- 12 rubros de 12, contexto fresco, uno por rubro.
- 83 hallazgos: 5 CRÍTICO · 30 ALTO · 30 MEDIO · 18 BAJO.
- 3 arreglados (1 crítico, 2 altos), cada uno con prueba que lo reproduce y
  commit atómico. Ninguno revertido.
- Global 6.1 — **sin delta**: la ronda 17 vive sobre una historia sin ancestro
  común con `master`. Es línea base nueva, no una subida.
- Compuerta final verde, dos corridas: 388 archivos, 5,050 pruebas, 1 saltada;
  `tsc` limpio; `eslint` 0 errores.
- Tablero renderizado y mirado (`tablero.png`).
- **Salvedad:** se auditó `8d608a4`, cuatro commits detrás de `master`. Los dos
  arreglos de login, el README y «un fajo es un mensaje» NO fueron auditados.
  La rama se mergeó con `master` y la compuerta quedó verde (5,085 pruebas).

Pendientes que necesitan decisión del dueño, no más código: el 50% de peaje
sobre casetas en efectivo, el aviso que cubra los datos de prospectos, y el
presupuesto por invocación (lease con TTL).
