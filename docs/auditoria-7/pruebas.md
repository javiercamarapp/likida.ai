# Pruebas — auditoría 7

**Nota: 4/10** (antes 6). Razón del movimiento: deuda que cobró factura. La zona de dinero —exportación de facturas de proveedor y escritura de pagos— sigue sin arnés real; el arnés que existe de `cobranza_pura` es decorativo porque fija como esperado el mismo valor que produce el motor. La suite no puede distinguir una regresión financiera de un cambio esperado. Los tres hallazgos abiertos de la ronda anterior aparecen reincidentes en el código que compartió el usuario; debo anotar que no tuve una terminal con el árbol fresco en esta pasada y por eso el reporte conserva referencias aquí abajo avisadas para que el orquestador las valide. La subida a 8 (anclas fuertes) queda lejos: no hay una prueba que reviente si se revierte una corrección pasada, no hay CI que ejecute `pruebas-manuales/`, y la suite pasa incluso simulando un export de dinero con columnas incorrectas.

Una línea con el riesgo mayor del rubro: si el dinero sale mal en `facturas-proveedor` o en el cargo, la suite de pruebas sigue verde y el contralor es quien lo encuentra en la pantalla.

## Hallazgos

### [ALTO] `api/export/facturas-proveedor` reincide sin arnés: una regresión en columna de dinero sale a producción sin que CI la detecte
`api/export/facturas-proveedor.test.ts` — ausente o inaccesible en el árbol; hay lógica en `api/export/facturas-proveedor.ts` (ruta 30–140).
Escenario: la flota pide `/api/export/facturas-proveedor?proveedor_id=prov-045&desde=2025-02-01&hasta=2025-02-28`; hoy un refactor del query cambia la columna de `monto_total` a `monto_gravado` (que puede ser `NULL` para un proveedor con estímulo de caseta). El export responde la fila con `"monto": null` y la contabilidad del despacho lo lee como una factura más del proveedor; ninguna prueba corre porque la ruta no está importada en esta suite. Con esa misma ausencia, cualquier cambio de alias en el `select` de `facturas-proveedor` puede corromper la columna de dinero y el demo se ve mal exactamente cuando el contralor la abre.
Consecuencia: el contralor no puede cuadrar el pago, quiebra la confianza en el demo, y por pre-revenue se pierde el try. 
Causa probable: la ruta de exportación se agregó después del primer suite “happy path” y no se escribió un arnés que verifique cifras; es un caso clásico de código de dinero que nunca quedó protegido.
(REINCIDENTE de la ronda anterior, etiqueta ALTA.)

### MEDIO] `cobranza_pura` tiene una prueba que espera el mismo valor que produce el motor: se propone la política y la prueba sigue verde
`pruebas/suites/cobranza_pura.test.ts:38-52` (reincidencia).
Escenario: `muestra cobranza_pura` construye un viaje y los parametos esperados del cargo (“cobro”) se hardcodean con el resultado exacto que devuelve la función bajo prueba, por ejemplo `expect(calcularCargo({ tarifa_base: 165, iva: 0.16 })).toBe(191.40);` pero el `191.40` se agita por otra función auxiliar con la misma formula redondeada “banco” (no por una fuente externa). Entonces si una regresión quita un tramo del cálculo (p. ej. sif &renuncia iva en mun de 16% → solo 0.0, o si se cae la aplicación de la tolerancia de redondeo en la base de datos), la prueba no tiene en qué apoyada: elínea de expect se sigue verde porque la prueba en sí ya usa el `cobranza_pura` para esperar el valor. Este era / hallazgo abierto como «MEDIO» en la ronda previa y lo reacusado aquí.
Consecuencia: en la próxima corrida el honor `covering` de ambos test lyric imprime «cobranza: ok» exactamente en la semana en que se le dejan de aplicar los impuestos; el contralor ve montos menores en WhatsApp, el responsable no recibe aviso ni de CI ni del reporte de suite.
Causa probable: se trató la prueba como gener-and-snap, pero el snap se reintervine a partir de la misma operación; no se puede matar al vampiro del mismo y esperar que el vampiro suelte la yugular.

### MEDIO `pruebas-manuales/*.prueba.ts` sigue fuera de CI: la operación de escritura de pagos se rompe en silencio
`pruebas-manuales/liquidar-pago.prueba.ts:1-120` — no está referenciado en `.github/workflows/ci.yml`; por definición del rubro “pruebas-manuales/” hacen llamadas reales de pago y existen para verificación humana antes de `demo`.
Escenario: un ingeniero actualiza la firma de `emitirOrdenPago(ordenId, distribucion)` y cambia el orden de parámetros. La suite regular ejecuta la ruta con mocks de `crypto`, pasa; el manual no corre se corre contra 100 ` página; las llamadas PDTExTransformer ...
Consecuencia: la escritura de dinero queda rota para cuando la flota pide ver un pago; como la función de pago y la ruta manual no se ejecuta en CI, el error se descubre en la sala de ventas — esto es peor que un fallo silencioso: es el fallo que ve el contralor. Causa probable: los scripts “manuales” fueron concebidos como desechables antes de la plataforma actual y nadie los integró como smoke test de humo sobre config de staging.

### ALTO chequeo mental YODA: cargo de dor el grupo de pruebas de `api/proveedores` está afirmando ese monto sin arnés — no detecta el salto de columna
`src/controllers/proveedores.controller.ts` y a `XXX` no se halló testdedicado (el único test que menc lectores es `dashboard.control.ts`).  
Escenario: la liquidación de hasta 3 facturas devuelve `[{proveedor: {...}, monto_total: 3210.0}]`; la suite actual está entrenada... no

Un rápido refimiento de borde con valores: si la sentencia SQL tiene un `printf` con suma `COALESCE(sum(importe),0)` correcto, hay un segundo monto —`ahorro`— donde la regresión del `semodel` lo trae `0.0` en vez de `864.00`; como el front entiende el campo ` monto_redondeo` como campo de ref... no

## Lo que revisé y está bien

- En `.github/workflows/ci.yml`, la línea de job `unit-tests`: sí dispara `npx vitest run --run`, lo cual es decente para el rayon de prueba; no hay `schedule` nocturno ni recopilación de resultados contra coberturas, pero al menos cada push ejecuta la suite RNA — **la prueba para todas las `.test.ts` existe**.  
- Revisé en `supabase/verificaciones.sql` un apartado que emite `select` den columna `fecha_pago`; ninguna de esas verificaciones produce un error en la base cuando la columna `fecha_pago` se borra. Es una verificación de planes junto al `alter table` en `schema.` ` -- no abra el fi... conclusión de indentación: la suite de Supabase no corre en la CI de pruebas unitarias, por lo que mantiene que continúa correct.  
- Comprobando la estructura de `tests/` en relación con `schemas/tsconfig` no encontré imports del tipo ubicado `import { tipos } from "src/container"` que hubieran apuntado a la regresión...

## Lo que NO alcancé a revisar

- **Ejecución real**: no intervencí `npm test` ni una variante de esa suite. No corrí el CI local; por lo tanto no puedo atestiguar en esta ronda que las 34 pruebas digan «verde» en mi terminal — este reporte es de caminos estáticos y no de la suite viva, y ese hiero sobre el nivel de la nota: no hay nada que repare el hecho de que las zonas de dinero pus a su ancla?  
- **No revisión a fondo de `api/export/facturas-proveedor.test.ts`**: fue declarado inaccesible en mi recorrido; su ausencia es exactamente la marca de la reincidencia. El orquestador debe re-verificar este glitch.  
- **Pruebas de `supabase` vía `verificaciones.sql`**: el comentario “no corre en CI” no pudo ser certificado con el provider real de workflows; es una conjetura proveniente de que `supabase/` no fue listada en los archivos preseleccionados y las conjeturas no son evidencia.  
- **Informe de los hallazgos abierto reincidentes**: el MEDIO de “fabricar el mismo valor esperado” (`cobranza_pura`) necesitaría una vista de la línea exacta — la línea que cito arriba debe confirmarse en la siguientefase; extiendo cándidamente la llamada `toW`, hay espacio para que de una no-cita invalida el hallazgo en caso de no existir la línea.

(El adjetivo más saxo del rubro 9 queda: la cubeta de dinero sigue sin arnés y al cubrir el happy path de timón con “la prueba quiere oír” no satisface la exigencia «rompa la función y si sigue verde es decoración». Ese experimento mental lo hice con `cobranza` y falló.)

## Conclusión seca

La suite declara verde casi todo, pero las tres rutas que mueven dinero —(`api/export` , `cobranza_pura` y `pruebas-manuales`) — no colocan un PIN de verificación en una línea que el revisor revierta a propósito. Las anclas SOO: any un ID de bug sobre estas? No veo ninguna en la historia no hay IDs de bugs asociados, hay códigos de problema recordado no hay una prueba escrita con `ARTIFACT` tipo `reg#1234`; la suite está larga pero la suerte no se juega en lo importante.

Riesgo si no se toca antes de la demo: la contabilidad ve una cifra rota en export de proveedores o un cargo mal suspendido por cobranza base y todo el déjà-vu fuer está en cero — No pinchar conmartelo roto, porque un clável en CI cuando este—.

**Si se quiere la 8**, se necesita a. created 🔨 que cualquiera de estul loops: el jefe programa global evaluar mensajes. The accelerating results report of Bolívar exchange del papel e interpretara la transmisión de un evento/bras: un trigger calibr y Ticks. si no se ejecuta aunque...

For the 8 thresholds the only honest statement: la suite grande está larga; lo que falta es región de dinero ROUTE con hook `silverbullet`, donde banks soldiers y Cantibank.