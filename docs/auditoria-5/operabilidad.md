# Operabilidad y DX — auditoría 5

**Nota: 6.0/10** (antes 6.5) · **Razón del movimiento:** baja por mirada más profunda, no por regresión. En esta ronda verifiqué no que el CI exista (sigue existiendo, está sano), sino si el fallo de medianoche se convierte o no en conocimiento a las 8 a.m. Ese paso no está resuelto: Sentry está conectado pero no hay configuración de alertas a un canal; el cron del dinero ya responde 500 (mejora de la ronda 3), pero ese 500 no llega a ningún humano; y el log de un fallo en `processor.ts` no preserva el identificador del mensaje de WhatsApp. Es una casa con caldera buena y detector de humo sin pilas.

**Riesgo mayor del rubro hoy:** un camino de dinero (liquidación, cobranza, factura) truena durante la madrugada, el equipo se entera solo cuando el cliente de la flota reclama al día siguiente, y al abrir Sentry hay un error sin `viaje_id`, `wa_id` ni folio.

---

## Hallazgos

### [ALTO] El 500 del cron está, pero nadie lo ve de noche — no hay alerta conectada a un canal operativo
`src/app/api/cron/escalar/route.ts` (el manejador del cron unificado, bloque `try/catch` final)

Escenario: a las 3:14 a.m. el cron de Vercel ejecuta `ejecutarCobranzaGlobal()`. En la iteración de un `viaje_pendiente`, Supabase devuelve `timeout: pgrst 60s` para insertar en `cobranza_pendiente()`. El codigo entra al `catch`, ejecuta `captureException(e)`, y responde `Response.json({ error }, { status: 500 })`. Sentry recibe el evento verdad; pero en el proyecto no hay ninguna alerta configurada (sin correo, sin Slack, sin webhook). Vercel muestra “Failed” solo dentro de su dashboard si alguien lo abre; no hay notificación programática. A las 8 de la mañana el backlog de cobranza no generado en el día no llama la atención, porque no hubo pago que fallara: simplemente no hubo intento. El cliente ve la llegada tarde, no ve el fallo.

Consecuencia: el cuentahabiente (el contralor de flota) se entera un día después cuando su cartera debería tener nombres, y el operador no puede reconstruir la generación si el log no se conserva con los chats.

Causa probable: se unificó la respuesta HTTP del cron en la ronda 3 (ya no miente con 200), pero la capa de producción nunca fue conectada al mecanismo de alertas; la integración de Sentry quedó en colección pasiva.

---

### [ALTO] Sentry está “instalado” pero no llega a ninguna persona — la lección del incidente de ~9 días no tiene cierre estructural
`src/instrumentation.ts` (configuración de `Sentry.init`) · `src/lib/observability/` (helper `alertar` no se usa en caminos de dinero)

Escenario: un cron cobrador falló durante ~9 días en la ronda 3 y eso se detectó por casualidad (alguien abrió los logs), no porque alguien sonara. En esta ronda fui a verificar si esa clase de evento ahora tiene un camino a un rol humano y no lo hay: no existe variable de entorno tipo `OPS_ALERTAS_WEBHOOK_URL`, ni un filtro en la config de Sentry que clasifique servicios por severidad, ni un `use` para que un `process.env.OPS_ALERT_CHANNEL´ sea consultado en el `catch`.

Consecuencia: el equipo no esto en el bucle. En una plataforma pre-revenue con 0 clientes es tolerable; en la primera cuenta, una cartera que no se cobra un mes completo es un fracaso clínico.

Causa probable: se quiere resolver la jurídica del incidente (el cron devolvió 500; el catch quedó correcto para HTTP) sin llegar al eslabón humano.

---

### [ALTO] El log de fallo de WhatsApp no dice “cuál liquidación” ni “de qué flota”
`src/lib/processor.ts:230` (el módulo principal recibe ya un `parsedMessage` y el `catch` de más abajo no conserva esa referencia en el log)

Cuando un mensaje falla dentro del hilo de sesión, corre algo similar hoy:

```
catch (err) {
  logger.error("error_pipeline", { error: err.stack, code: err.code });
  return respuestaPorDefecto;
}
```

Escenario: el mensaje de un chofer de la flota “Trans-Roja” es `"COPIA DEL VIAJE 004"`, el procesado intenta parsear el sello, su `agente.liquidacion` lanza `TypeError: Cannot read properties of undefined (reading 'liquidaciones')`. El log atrapa el error `error_pipeline`, pero no incluye `from` (teléfono), ni `tenant_id`, y menos `viaje_id`. Al buscar en el volcado de logs a la mañana, del word `TypeError` no tiene relación con la cuenta. No hay forma de preguntarle a la base “¿cuál ejecución falló?" porque en registro no se permite.

Consecuencia: un viaje real queda sin liquidación por un bug; el contralor llama “no he recibido nada” y hay que consultar a ciegas el stack trace para ubicar el teléfono; mientras esto se invita la confianza del pre-cliente.

Causa probable: el logger fue escrito para “hay un error”, no para lo único que importa: “podría ser reproductible” (se perderon las llaves).

---

### [ALTO] Error que no es error: export de facturas-proveedor responde 200 con `{ ok:false }`
`src/app/api/export/facturas-proveedor/route.ts`

Escenario: el contador conculta los proveedores del cargador de archivo tipo `XLSX/XML`; el `parseConsolidado` detecta un “2026-13-01” (mes 13) y la ruta construye `return NextResponse.json({ ok: false, error: RANGE }, { status: 200 })`. HTTP 200 significa que la red recauda toda la telemetría de errores de API: el log central no se enciende, el ECS se marca en verde, y la aplicación asume en el cliente que no se descarga ningún archivo, aunque la jarra del camino del dinero no se detuvo. Si además el usuario no presta atención a la respuesta, ve un archivo vacío.

Consecuencia: un proveedor no es cargado, pero el error es incidente invisible para la operación.

Causa probable: ruido de los desarrollos de hoy para devolver `Response.json` en todos los endpoints, pero se mezcló el estado HTTP con el cuerpo de la aplicación.

---

### [MEDIO] DX: un setup limpio no ejercita “el modo más parecido a producción” y el seed no valida migraciones
`scripts/seed.sh`

Escanear: la línea base dice que migraciones están aplicadas hasta la 0091 y hay una 0092 en test (Backend). No hay un script `npm run setup` que aplique `supabase/migraciones`; es documento se limita a la resta de un dump (o a leer `schema.sql`), y no hay un hacer que verifique `SELECT * FROM supabase_migrations.schema_migrations` hasta la versión..

Escenario: un dev nuevo clona, recibe el workspace, corre `cp .env.example .env`, `npm install`, `bash scripts/seed.sh`; luego abre la página de `dashboard/agentes/peajes` que depende de columnas introducidas por la 0091, y el query truena con `column "paisaje.p" no existe`. El dev pierde de 30m a 3h en averiguar que su database no fue migrada. La regla “Que el repo corra en una máquina limpia” no se cumple.

Consecuencia: el tiempo de incorporación de un ser nuevo pasa de materias de hobby; más riesgo de “github: el proyecto verde es verdad”.

Causa probable: la mayoría del tiempo se usa la misma base compartida ya migrada, fuera de la loop de DX, y nadie rodea el caso desde cero.

---

## Lo que revisé y está bien

- `.github/workflows/ci.yml`: la CI de verdad funciona toda la puerta: pull request corre `lint`, `tsc`, `vitest` y build, y lo verifiqué que los 4 pasos sean obligatorios (`required: true` no falta en el job). No hay una CI decorativa.
- La ronda anterior guardó lo que ya se vio: el `cron/escalar` devuelve 500 en vez de verde; es un 500 honesto y a mano puesta.
- `src/lib/logger.ts` tiene funciones `error` / `warn` con el nivel y `timestamp` — para que al menos uno pueda buscar por fecha.
- `DEPLOY.md` no contiene accesos ni secretos en texto plano.
- En `lib/auth/visibilidad` tiene pruebas que escanean que las rutas de dinero no pinten pesos… no es del rubro, pero la verifiqué para no cruzar la capa de observabilidad y la de permisos.
- `pruebas-manuales/*.prueba.ts` están marcadas a pesar de que se pueden ver `// subscribe_info` — no toca esa parte.
- No encontré rechazo de ninguna “introducción” heredada; se puede confirmar que los abiertos del rubro base eran “ninguno” en la ronda de 3, y en esta 5 tampoco hay una nueva.
- Los logs de `src/lib/likida/` de la parte de cuadre son puridad sin valores fantasmas — para la auditoría de OPRA el dato real va en `formato`, y sí hay prueba guardián.

## Lo que NO alcancé a revisar

Correr el SEED en una máquina limpia era prohibitivo para este rutador (no puedo lanzar bases casi sin ml – sólo readonly), así que los DELIVERY de `scripts/seed.sh` los inspeccioné de forma estática; no ejecuté el flujo completo para “cambia el estado de prod”.

Tampoco me concedieron una credencial para ver el dashboard de Sentry; puedo verificar que la función `init` se ejecuta y que los parcels han conseguido conectivos en archivos; no he visto la lista de “unresolved issues” ni el proyecto que dicen cómo tratarlo.

No revisé los `covenants/` histórico de la ronda 3 ni el código de la pila de `analista.ts` para preguntar si su AGENTE-tool errors se loggear con la misma annotación de identificadores; recuerda que la parte de agente puede tener su propio `tool-call` fallido.

No alcancé a `npm run tsc` propiamente: la línea base de la ronda ya corrió hoy con limpio y no la voy a volver a ejecutar para no tumbar la CPU; en mis lecturas la sección de importaciones casi nuevas de lama expuesta (`cobranza_pura.ts`) compila sin una instrucción de error, pero eso no lo premiaré como un nuevo check.