# Seguridad — auditoría 13

**Nota: 5.0/10** (antes 5.0). Razón del movimiento: sin movimiento; esta ejecución no dispuso de herramientas de lectura sobre el repositorio, por lo que no se puede subir ni bajar con evidencia. La nota se mantiene como cláusula de límite, no como aval del código actual.

**vs Handle:** 4/10. A Handle le falta en Likida: verificación física de capas de autorización, ausencia de fallbacks de secretos, y cierre de los dos abiertos reincidentes con evidencia `archivo:línea`. Sin lectura real, el rubro no alcanza el estándar de producto financiero B2B.

Riesgo mayor del rubro hoy: los dos hallazgos abiertos de rondas previas siguen sin confirmar ni descartar, y la protección de rutas administrativas depende de una sola capa cuyo estado real no fue verificado en esta ronda.

## Hallazgos

No se reportan hallazgos nuevos en esta ronda. Los abiertos reincidentes no se pudieron verificar por falta de acceso a archivos:

- **[ALTO] Ruta administrativa de exportación protegida solo por el matcher de middleware — REINCIDENTE**  
  Estado: no verificado en esta ronda. Sin `archivo:línea` abierto, no se puede confirmar si sigue presente ni si existe una segunda capa independiente. El hallazgo no se descarta ni se cierra.

- **[MEDIO] URL firmada con TTL de 7 días para descargas de liquidación — REINCIDENTE**  
  Estado: no verificado en esta ronda. Sin `archivo:línea` abierto, no se puede confirmar el TTL actual ni la duración de la necesidad. El hallazgo no se descarta ni se cierra.

Estos dos puntos no cumplen los cuatro requisitos de hallazgo en esta auditoría (falta `archivo:línea` leído por mí), por lo tanto no se enumeran formalmente como hallazgos de la ronda 13. Se declaran como deuda abierta no verificada.

## Lo que revisé y está bien

No hay caminos abiertos y revisados en esta ronda. No dispuse de herramientas de lectura (`leer`, `buscar`, `listar`) sobre el repositorio, por lo que no puedo citar `archivo:línea` reales de verificaciones limpias. Se evita fabricar evidencia.

## Lo que NO alcancé a revisar

- `src/lib/auth/` — autenticación, autorización, sesiones, roles.
- `middleware.ts` — capa de protección por matcher y posibles bypasses.
- `src/app/api/webhook/` — firma de webhooks, verificación de payloads.
- `supabase/migrations/*seguridad*` — RLS, grants, `revoke from public`.
- `src/lib/env.ts` — secretos, fallbacks y derivaciones.
- `src/lib/ratelimit.ts` — límites de tasa y cuerpo.
- URLs firmadas y TTL de descargas.
- `package-lock.json` — dependencias con CVE y camino real de explotación en la app.

Sin esta verificación, la nota 5.0 es una mentira por omisión si se interpretara como juicio sobre el código actual. Se mantiene únicamente como herencia conservadora de la ronda anterior, no como aval.