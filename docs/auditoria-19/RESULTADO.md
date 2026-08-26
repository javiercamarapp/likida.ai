COMPLETA

Auditoría 19 · 24-ago-2026 · en la nube, desatendida
rama `claude/auditoria-19`, **PR #52** · `master` @ `8b43121`

Ronda **COMPLETA**, no continuación: no había PR de auditoría abierto (el #34 de la 18 se
fusionó en `bb6eefc`) y el delta `583fec4..8b43121` mueve **162 archivos, +10,807 / −548**
en `src/`, `supabase/` y `normas/`. Los doce rubros tenían código nuevo → se relanzaron
los doce.

- **12 rubros de 12**, contexto fresco, uno por rubro → `docs/auditoria-19/<rubro>.md`.
- **167 hallazgos: 19 CRÍTICO · 66 ALTO · 60 MEDIO · 22 BAJO** (conteos de cada auditor;
  hay solapamiento deliberado entre rubros).
- **3 arreglados**, con prueba que los reproduce y commit atómico: `dae7f64`
  (BACK-19-1, CRÍTICO), `5669a73` (FE-19-1, CRÍTICO) y `6697f32` (SEG-19-1, ALTO).
  Los tres comprobados corriendo la prueba **antes** del arreglo. Ninguno revertido.
  **Tope de 3 vueltas: se usaron las 3.**
- **Global 4.7** — **−0.6** contra el 5.3 de ayer. **Ningún rubro sube**; seis bajan y
  seis se quedan igual.
- Compuerta final verde: **504 archivos, 6,447 pruebas, 1 saltada**; `tsc` limpio;
  `eslint` 0 errores, 157 avisos (la c4 reportó 24).
- Tablero renderizado, capturado y **mirado** (`tablero.png`): 12 rubros contados, notas
  cotejadas contra la síntesis, suma 56/12 = 4.7. Se recapturó una vez porque el pie
  quedaba cortado.

## El patrón de la ronda

Todo lo que trajo el delta grande llegó **sin la red que el resto del repo ya tenía**:
el outbox sin el kill switch (único de siete crons), la póliza sin el guarda de área
(única de cinco rutas de `export/`), el GPS escribiendo contra un aviso que dice «No hay
GPS», el onboarding persistiendo la política de demo como política de la flota. Cada uno
es un patrón que ya existía a tres archivos de distancia.

## Lo que no se pudo verificar aquí

- **La versión desplegada**: `curl` a `app.likida.ai/api/health` da
  `CONNECT tunnel failed, 403` — egreso bloqueado. El hallazgo de que producción corre
  `df6b1be` se sostiene **por construcción** (el asunto de `8b43121` no lleva `[deploy]`
  y el `ignoreCommand` solo lee el asunto), no por observación directa.
- **`npm run build`**: no se corre en la nube, sin `.env`.
- **De los 167 hallazgos se verificaron a fondo seis**; el resto se toma como lo escribió
  su auditor.
