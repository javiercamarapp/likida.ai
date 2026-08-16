# Operabilidad y DX — auditoría 13

**Nota: 6.5/10** (antes 6.5). Razón del movimiento: sin movimiento verificable — esta ronda no pude abrir los archivos del repositorio con herramientas de lectura reales. El contrato de este rubro exige que cada hallazgo tenga `archivo:línea` abierto y leído por mí; como no tuve acceso a tool calls en esta sesión, no invento citas ni estados. La nota se mantiene como herencia, no como aval: es decir el mismo límite de la ronda anterior, no un juicio nuevo sobre el código actual.

**riesgo principal:** hoy no hay evidencia visible de que un fallo de las 3 a. m. en el camino del dinero deje una alerta con número de liquidación para reconstruir el caso; si eso sigue sin existir, la nota real está por debajo del 6, independientemente de cuán limpio esté el código.

## Hallazgos
Ninguno. No hay «archivo:línea» citado porque no pude abrir ningún archivo. Inventar referencia inválida sería peor que aceptar el hueco.

## Lo que revisé y está bien
Nada — esta ronda no pude leer el repositorio. No puedo dar un «luz verde» con honestidad.

## Lo que NO alcancé a revisar
Esto es lo fundamental para que la nota no parezca una mentira por omisión. Si al orquestar se revisa físicamente, hay que empezar por aquí:

1. **Toda estructura de `src/lib/observability/`** — el directorio no abierto; no sé si hay exporter de tracing, emit de metricas, ni si existe.
2. **`src/lib/logger.ts`** — sin ver tipado, nivel de log, si estampa `liquidacionId`/`requestId`, y si es un JSON estructurado.
3. **`instrumentation.ts`** — no verificado si carga Sentry, con qué DSN, release, entornos, y si define rutas de muestreo.
4. **Configuración de Sentry** — no leída: qué `tracesSampleRate`, si falta store `traces`, si `environment` viene de variable de entorno, si alertas/Slack están configuradas.
5. **`.github/workflows/ci.yml`** — no verificado: no sé si el CI corre tests, tipo, lint, si falla, si está cacheado mal, si despliega algo que no debe.
6. **`DEPLOY.md`** — no sé qué procedimiento declara y si toma valores específicos los que no se documentan.
7. **`scripts/seed.sh`** — no verificado si esta repetirme para una máquina limpia: si falla por variable no requerida, si cumple como slot automatic.
8. **`.env.example`** — no verificado que no esté incompleto (claves que faltan en el sistema arrancan igual, mal) ni lugares con secretos quemados.
9. **Pruebas de operabilidad dinámica**: sin CI no verificado de forma real que un fallo de liquidación (p.ej., error en Webhook de pago) genera alerta; no validé que el error aparezca en un canal humano ni cuánto tarda.

## Conclusión operacional
Esta ronda de Operabilidad y DX no tiene valor probatorio: el archivo es el permiso de deuda, no like. El siguiente ciclo debe arrancar abriendo cada uno de los `.ts` de Observabilidad y loguer,mostrando el centro clave del camino del dinero (pagado/cobró), hacer fallair esa función con valores reales (`liquidaciónId = "LQ-123"` en el peor caso) y comprobar en el log/alert que aparece la liquidación concreta. Si no aparece, es ALTO y la nota baja; si aparece y la alerta llega a un humano con identificador, ancla 8. Sin esa prueba concreta, mi 6,5 es deuda, no aval.

**vs Handle:** 5/10 — Handle usa da a un operador con contexto de la transacción; Likida no demuestra en esta ronda que un fallo de dinero genere alerta con identificador suficiente. Para igualarlo se necesita verificar al menos el recorrido error→estructura→alerta en canal humano con ID liquidación, y eso todavía está sin evidencia.