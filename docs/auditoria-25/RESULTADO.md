COMPLETA: los 12 rubros auditados, 1 CRÍTICO y 2 ALTOS arreglados con prueba, 6 críticos pendientes con razón escrita.

- **Tipo:** ronda **COMPLETA**. Decidido antes de gastar un token en auditores:
  `list_pull_requests(open)` → `[]` (sin PR de auditoría vivo) y
  `git log b8a1a3a..HEAD -- src/ supabase/ normas/` → 7 commits. Sin PR abierto
  y con cambios, la regla manda ronda completa con rama nueva.
- **Rama:** `claude/auditoria-25` sobre `master` = `4f94490`. Árbol limpio al
  arrancar → autofix habilitado. El clon no traía `node_modules`: `npm ci`
  (INFRA, resuelta).
- **Global: 5.2** (anterior **6.2**) · **▼ 1.0**. Media de los 12 (62/12).
  **Diez rubros bajan, dos se quedan, ninguno sube.**
- **Y el código no empeoró.** Siete de los doce rubros no recibieron un solo
  commit desde la 24 y sus auditores lo verificaron con `git log` sobre las
  rutas de su rubro. **Nueve de los doce firman «mirada más profunda»**: la 24
  midió 188 commits de un tirón y calificó de más. Que la global baje un punto
  entero es el resultado, no el problema.
- **El caso que lo explica:** la 24 declaró AGEN-1 cerrado y subió un punto por
  ello. El hallazgo nombraba **tres** funciones y el arreglo tocó **una**. Un
  cierre a medias sale más caro que un hallazgo abierto, porque la nota ya cobró
  la subida.
- **Arreglados: 3**, en 3 commits atómicos, cada uno con prueba que lo reproduce
  (rojo→verde comprobado revirtiendo el archivo) y compuerta verde:
  - `24ce4c2` — **AGEN-C1 (CRÍTICO)**: la baja cerraba la ENTRADA de WhatsApp y
    dejaba las TRES SALIDAS abiertas. Al ex-empleado le seguían llegando las
    cifras del cierre, el ejemplar del contralor en PDF y el 🚨 de la escalada
    con la ubicación del chofer. 6 pruebas.
  - `ffc95b2` — **SEG-A1 (ALTO)**: misma raíz, otra puerta. La baja dejaba vivo
    el token MCP, que lee el dinero de la flota por service_role y se renueva 60
    días en cada uso. 3 pruebas.
  - `5660918` — **DATOS-A1 (ALTO)**: el CHECK rechazaba la fase `transcripcion`
    y el costo de cada nota de voz se descartaba en silencio, dejando corta la
    cifra con la que se fija el precio. Migración 0304 + una prueba que cruza el
    tipo de TS contra el CHECK sin base de datos.
- **Tope de 3 vueltas: AGOTADO**, y en lo quirúrgico a propósito. Los críticos
  que quedan no lo son: FIS-C1/C2 y ARQ-C1 son la misma regla de dinero en tres
  archivos; BE-C1/DATOS-C1 exige decidir si «ajustar» regenera o invalida el
  PDF; OP-C1 es la semántica de la compuerta de despliegue; OP-C2 necesita una
  mano humana.
- **Pendientes con razón escrita: 6 críticos.** Los dos fiscales llevan **tres
  rondas** siendo «lo primero de la siguiente», y eso es en sí mismo el hallazgo.
- **Lo que necesita una mano humana, hoy:** producción corre `3cc8ead` con 9
  commits y 2 migraciones encima. El `[deploy]` de `5a14012` se perdió en el
  cuerpo del merge `4f94490` y la compuerta —que lee solo el asunto, a propósito—
  no construyó. **El Redeploy del panel ya NO basta**: redesplegaría `3cc8ead`.
  Hay que aplicar 0302/0303 y publicar el tip. Entre lo no publicado va el fix
  del chat con tenant fantasma, que arregla un fallo vivo hoy en producción.
- **Descartados / refutados / corregidos: 5**, con la razón escrita — incluido
  un falso rojo de la suite que era INFRA (mutaciones vivas del auditor de
  pruebas) y **no se revirtió nada** por ello.
- **Compuerta al cerrar:** `npx vitest run` **820 archivos, 10,962 pruebas, 1
  saltada, 0 fallos** (+12 de esta ronda) · `npx tsc --noEmit -p .` exit 0 ·
  `npm run lint` 0 errores (173 avisos) · `npm run lint:ratchet` 173/173, 0
  nuevos. `npm run build` no corre aquí a propósito.
- **Tablero:** `tablero.html` + `tablero.png`, capturado con Chromium 141
  headless y **mirado**: 12 rubros contados, notas cuadradas contra la síntesis
  (62/12 = 5.2), colores por nota y no por delta.
- **Nota de método:** el auditor de pruebas mutó el árbol durante la ronda (está
  autorizado). Ninguna mutación entró a un commit, la verificación se hizo
  contra `git show HEAD:`, y el árbol quedó limpio. Si esto vuelve a correr con
  los doce en paralelo, ese auditor debería trabajar sobre una copia del árbol.
