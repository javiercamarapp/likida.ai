PARCIAL: 11 de 12 rubros. Falta «pruebas» — su auditor no cerró dentro de la ronda.

- Tipo: ronda COMPLETA (sin PR de auditoría abierto + 43 commits en `src/`/`supabase/`/`normas/` desde la 21).
- Rama: `claude/auditoria-22` sobre `master` = `86813f4`.
- Global: **6.0**, media de los 11 rubros que entregaron. **Sin delta**: `.gitignore` ignora `docs/auditoria-*/`, así que no hay síntesis previa legible desde la nube. Línea base nueva, no una mejora ni una caída.
- Hallazgos: 9 CRÍTICOS y 21 ALTOS reportados. Verifiqué 7 contra el código abriendo el archivo; 1 se descartó como falso (`ticket_monedero`, cubierto por el portón de `xmlVerificado`) y 1 bajó de ALTO a MEDIO (TC-1).
- Arreglado: **3**, cada uno con prueba que lo reproduce y commit atómico — `694fd8b` (fiscal, IVA de un gasto por confirmar), `a6493be` (frontend, «no leí» ≠ «no hay»), `078cc12` (rendimiento, informe PDF con lectura recortada). Tope de 3 vueltas alcanzado.
- Compuerta al cerrar: `npm test` 9,924 verdes · `npx tsc --noEmit` 0 errores · `npm run lint` 0 errores. `npm run build` no corre aquí a propósito.
- Tablero: `tablero.html` + `tablero.png`, capturado y mirado. Se corrigieron dos cifras mías al mirarlo (altos 19→21, global 5.8→6.0, que era un número puesto sin calcular).
