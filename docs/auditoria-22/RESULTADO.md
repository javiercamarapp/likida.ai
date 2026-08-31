COMPLETA: los 12 rubros auditados, y los 34 hallazgos CRÍTICOS y ALTOS arreglados.

- Tipo: ronda COMPLETA (sin PR de auditoría abierto + 43 commits en `src/`/`supabase/`/`normas/` desde la 21).
- Rama: `claude/auditoria-22` sobre `master` = `86813f4`. PR draft #285.
- Global de la auditoría: **6.1**, media de los 12 rubros. **Sin delta**: `.gitignore` ignora `docs/auditoria-*/`, así que no hay síntesis previa legible desde la nube. Línea base nueva.
- Hallazgos: **10 CRÍTICOS y 24 ALTOS**. Uno se descartó como falso (`ticket_monedero`, cubierto por el portón de `xmlVerificado`) y uno bajó de ALTO a MEDIO (TC-1).
- **Arreglados: los 34**, en 13 commits atómicos, cada uno con prueba que reproduce y compuerta verde. El tope de 3 vueltas de la skill se levantó a petición explícita del dueño.
- Compuerta al cerrar: `npm test` **9,995 pruebas en 708 archivos**, todas verdes · `npx tsc --noEmit` 0 errores · `npm run lint` 0 errores · `npm run lint:ratchet` 0 advertencias nuevas. `npm run build` no corre aquí a propósito.
- **CI del PR #285: VERDE**, verificada con la API sobre el head `7e67d94` — los 8 checks en `success`, `mergeable_state: clean`. No lo estuvo al primer intento: mi compuerta no incluía `lint:ratchet` y no ejecutaba `verificaciones.sql` contra un Postgres real, así que declaré verde algo que CI vio rojo. Corregido en `7e67d94`, y la compuerta de la ronda 23 tiene que traer los dos.
- Migraciones nuevas: 0272 (deducibilidad en la póliza), 0273 (ARCO alcanza el texto libre), 0274 (conversación por teléfono normalizado). Las tres con bloque en `verificaciones.sql` (220, 221, 222).
- Tablero: `tablero.html` + `tablero.png`, capturado y mirado dos veces. Al mirarlo se corrigieron dos cifras propias (altos 19→21, global 5.8→6.0, que era un número puesto sin calcular).

## Las notas NO se recalificaron tras los arreglos

A propósito. La nota de un rubro se mide sobre el código que el auditor LEYÓ; recalificar con los arreglos encima sería puntuar mi propio trabajo sin que nadie lo haya auditado. Los 34 arreglos son insumo de la ronda 23, no de ésta.
