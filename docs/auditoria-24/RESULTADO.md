CONTINUACIÓN: los 12 rubros auditados sobre el PR #303, 2 CRÍTICOS arreglados, 4 pendientes con razón escrita.

- **Tipo:** ronda de **CONTINUACIÓN** — había PR de auditoría abierto (#303,
  `aud24/integracion`, 188 commits / 484 archivos, abierto hoy 10:12 UTC desde
  otra sesión). Se continuó sobre esa rama y **no se abrió PR nuevo**. Los 12
  auditores se relanzaron porque `docs/auditoria-24/` no existía en el árbol
  (`.gitignore:34`) y faltaban los doce archivos de rubro.
- **Rama:** `aud24/integracion` sobre `master` = `615496d`. Árbol limpio al
  arrancar → autofix habilitado.
- **Global: 6.2** (anterior **5.4**) · **▲ 0.8**. Media de los 12 (74/12).
  Diez rubros suben, uno baja (frontend 7→6), dos se quedan.
- **Hallazgos: 8 CRÍTICOS anotados, 7 distintos** (backend y datos hallaron el
  mismo por caminos independientes) y **24 ALTOS**.
- **El hallazgo que justifica la ronda: la CI del #303 estaba ROJA** y su cuerpo
  afirmaba «`tsc --noEmit`: limpio». El Typecheck moría en OOM (exit 134) en las
  dos corridas, y con él quedaban `skipped` los seis pasos siguientes —
  `npm run test:coverage` incluido. **La compuerta no reprobaba las pruebas: no
  llegaba a correr una sola de las 819.** Invisible en local porque
  `incremental: true` + `.tsbuildinfo` ignorado hacen que local corra caliente y
  CI siempre en frío. Pico medido en frío: 2,672 MiB contra ~2,048 del runner.
- **Arreglados: 2**, en 2 commits atómicos, cada uno con prueba que lo reproduce
  (rojo→verde comprobado revirtiendo el archivo) y compuerta verde:
  - `22dc127` — OP-1/PRU-C1: el techo de heap del typecheck, en
    `package.json → scripts.typecheck` para que lo hereden los dos workflows.
  - `70dd5c6` — AGEN-1: la baja de un usuario cerraba el panel y dejaba abierto
    WhatsApp; `resolverCuentaOficina` no miraba `app_user.activo`. Por ese camino
    pasan los comandos de administración por WhatsApp.
- **Tope de 3 vueltas: NO agotado, se usaron 2.** La tercera se dejó sin gastar a
  propósito: los tres críticos restantes de código son cambios de dinero o de
  producto que no son quirúrgicos, y empujarlos de madrugada sin nadie mirando es
  exactamente el riesgo que esta rutina existe para bajar.
- **Pendientes con razón escrita: 4** — FIS-C1 y FIS-C2 (el panel del contador y
  el motor acreditan distinto el IVA del combustible; exigen meterle al panel las
  `diferencias` del motor, no es quirúrgico), BE-C1/DATOS-C1 («ajustar» no
  regenera el PDF; regenerarlo o invalidarlo es decisión de producto), y
  **OP-C1, que NO es código: producción lleva 15 commits sobre el último
  `[deploy]` y el arreglo es un Redeploy en el panel de Vercel.** Notificado al
  dueño.
- **Descartados por falsos: 3**, con la razón escrita (el «24:00» de jornada, y
  dos hipótesis sobre migraciones recopiadas que se verificaron línea por línea).
- **Compuerta al cerrar:** `npm test` **10,946 verdes en 819 archivos** (+5 de
  esta ronda) · `npx tsc --noEmit` 0 errores, también en frío · `npm run lint` 0
  errores (173 avisos) · `npm run lint:ratchet` 173/173, 0 nuevos.
  `npm run build` no corre aquí a propósito.
- **El trinquete de lint cazó un aviso de mi propia prueba antes del primer
  commit** — segunda ronda seguida, las dos veces sobre código del orquestador.
- **Tablero:** `tablero.html` + `tablero.png`, capturado con Chromium headless y
  **mirado**: 12 rubros contados, notas cuadradas contra esta síntesis, colores
  por nota y no por delta.
