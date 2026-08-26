CONTINUACIÓN COMPLETA: 12 rubros relanzados sobre el PR #52, global 4.5 (−0.2), 2 críticos arreglados con prueba

---

**Ronda:** 19, continuación 2 · 25-ago-2026 · desatendida, en la nube
**Rama:** `claude/auditoria-19` · **PR #52** (continuado, no se abrió uno nuevo)
**Delta auditado:** `8b43121` → `69aa71b` — 115 archivos, +4,974 / −1,026

## Condición de terminación

| # | Requisito | Estado |
|---|---|---|
| 1 | `00-SINTESIS-c2.md` con las 12 notas y su razón de movimiento | ✅ |
| 2 | Los 12 archivos de rubro existen | ✅ `{frontend,backend,agentico,tool-calling,seguridad,fiscal,legal,arquitectura,pruebas,operabilidad,rendimiento,datos}-c2.md` |
| 3 | `tablero-c2.html` **y** `tablero-c2.png` | ✅ renderizado con Chromium headless y **mirado**: 12 rubros contados, notas cuadradas contra la síntesis |
| 4 | Cada CRÍTICO en uno de tres estados | ✅ 2 commiteados con prueba · el resto **pendientes con razón escrita** · 1 corregido como falso parcial (el `'ok'` de `qa-motor.ts` era la mutación del auditor, no el código) |
| 5 | `npm test` y `npx tsc --noEmit` pasan sobre el árbol final | ✅ 519 archivos, 6,525 pruebas, 1 saltada · tsc sin salida · eslint 0 errores |
| 6 | Commits pusheados | ✅ |

## Cifras

- **185 hallazgos con ficha:** 23 CRÍTICO · 71 ALTO · 63 MEDIO · 28 BAJO
- **Global 4.5/10** (antes 4.7). Serie: 6.1 · 4.8 · 5.8 · 5.3 · 4.7 · **4.5**
- **1 rubro sube** (tool calling +1) · **3 bajan** (backend, datos, arquitectura) · **8 se quedan**
- **Tope de arreglo:** 3 vueltas, se usaron **2**. Ninguna revertida.

## Arreglado

- `b4a2cc4` — **BACK-19c2-1 (CRÍTICO)**: la foto de un ticket ya no se cobra por byte antes de llamar al modelo. Convergencia de 3 auditores independientes.
- `234c364` — **AGEN-19c2-2 (CRÍTICO)**: un fallo de contabilidad deja de tener la misma voz que un fallo del efecto.

## No verificado en esta corrida

- **No hay base de datos:** las 4 migraciones nuevas (816 líneas de SQL) se auditaron leyendo, no ejecutando.
- **No se corrió `npm run build`** (pide credenciales que aquí no existen): no se verificó que el proyecto construya, solo que compila y que las pruebas pasan.
- Una prueba salió roja una vez y verde dos veces sobre el mismo árbol: **intermitente sospechosa**, no perseguida.
