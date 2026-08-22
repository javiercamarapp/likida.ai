COMPLETA (continuación 3)

Auditoría 18 · continuación 3 · 22-ago-2026 · en la nube, desatendida
rama `claude/auditoria-18`, PR #34 · `master` @ `21630c0`

Ronda de **continuación**, no ronda nueva: el PR #34 seguía abierto, así que se trabajó
sobre la misma rama. Es la tercera pasada. Los 12 rubros se relanzaron porque los 12
tenían código cambiado en el delta `d432e89..21630c0` — **116 commits, 252 archivos,
+16,055/−1,348**, que es casi entero el **PR #38 (`auditoria-18-fixes`)**, una campaña de
arreglo hecha *fuera* de esta rama contra los 83 hallazgos de la ronda 18.

- 12 rubros de 12, contexto fresco, uno por rubro → `docs/auditoria-18/<rubro>-c3.md`.
- **92 hallazgos: 9 CRÍTICO · 33 ALTO · 33 MEDIO · 17 BAJO.**
- **3 arreglados**, con prueba que los reproduce y commit atómico: `a44efa2` (FISC-C3-2),
  `d0e9844` (FISC-C3-1), `35ba042` (ARQ-C3-1). Los tres comprobados revirtiendo el
  arreglo con `git stash` y viendo las pruebas ponerse rojas. Ninguno revertido.
  **Tope de 3 vueltas gastado.**
- Global **5.8** — **+1.0** contra el 4.8 de ayer. Once de las doce notas subieron;
  **fiscal se quedó en 4** y ésa es la noticia del día.
- **`npm ci` corrió limpio por primera vez en la nube**: `5eca3ab` vendorizó `xlsx` y
  cerró el INFRA que las dos pasadas anteriores rodearon a mano.
- La compuerta arrancó **roja** tras el merge de `master`, y los dos fallos eran **secuela
  de mi propia resolución del merge**, no de `master` ni de la rama por separado.
  Corregidos en `38eef84`, explicados en `compuerta.md` y en la síntesis.
- Compuerta final verde: 435 archivos, 5,544 pruebas, 1 saltada; `tsc` limpio;
  `eslint` 0 errores, 5 avisos.
- Tablero renderizado, capturado y **mirado** (`tablero-c3.png`); se recapturó una vez
  para quitar lienzo en blanco al pie.

Por qué la subida no es una vara más blanda: a los doce auditores se les dijo que un
asunto de commit que cita un ID no es prueba de que el hallazgo esté cerrado. Pruebas
verificó seis puertas **rompiendo la función** (11 rojas de 26 mutaciones); datos contó la
FK compuesta relación por relación (**38 de 43**, antes 5 de 39); arquitectura contó las
copias de `appUrl()`/`anotarBitacora()`/`hoyMx()` y encontró guardia estructural.

Lo que necesita decisión del dueño, no más código:

1. **El piloto de visión** — sus 8 críticos siguen íntegros; `git log` de esos archivos no
   trae un solo commit del PR #38. Todo detrás de `FACTURACION_PILOTO`, apagada.
   **El doc del demo manda encenderla: no la enciendas antes de decidir esto.**
2. **`master` sin protección de rama** y un auto-merge (`auto-merge-rutina.yml:29-43`,
   `contents: write`) cuyo único control de acceso es cómo se llama una rama, en un repo
   público. Es Settings, no un commit.
3. **El tenant del demo** (`scripts/demo-5k.sql:45,58`) trae régimen **601** con la
   facilidad del 15% concedida a mano — justo lo que `99a6b7c` acaba de prohibir. Es lo
   que se enseña en la sala.
4. **La pantalla de captura del aviso de privacidad**, tercera pasada pidiéndola:
   `/aviso/<tenant>` es 404 para toda flota real.
5. **La clave 624 (Coordinados)** sigue sin existir en `REGIMENES` ni en el CHECK de la
   0056: pide migración.

Abierto y dicho, no descartado: el auditor de operabilidad reporta que la suite falló 1 de
2 corridas completas en `engine_iva_medio_pago.test.ts:35` y pasa aislada. En mis cuatro
corridas completas de hoy no se reprodujo. Una intermitente que no se reproduce sigue
siendo una intermitente.

Fuera de alcance del arreglo `d0e9844`, anotado en el commit y en `fiscal-c3.md`: el
numerador del 15% vive también en SQL (`sumar_combustible_ejercicio`, `0112:151`,
`0084:19`) y sigue filtrando `forma_pago = '01'`. Pide una migración y aquí no hay base
para verificarla.
