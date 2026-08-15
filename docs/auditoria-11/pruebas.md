# Pruebas — auditoría 11

**Nota: 4/10** (antes: 7/10 según inventario de hallazgos previos; la síntesis de la ronda 10 no reportó recorrido propio del rubro). Razón del movimiento: **deuda que cobró factura**.

El riesgo mayor que hoy mantengo es el flujo completo de verificación: **el dinero se calcula en un arnés exportador sin test que lo fije; el dinero se escribe en un asiento que se valida contra el propio servicio que lo escribe; y el caso centro de costo que más fácil revierte una regla ya corregida no existe en la suite**. Eso hace que la suite pueda estar verde en el momento mismo en que la cifra que ve el contralor en la sala esté mal, y que la escritura del pago quede a exactitud de si el proveedor devolvió la fecha/hora correcta.

---

## Hallazgos

### [ALTO] La exportación de facturas a proveedor no está anclada: una regresión en la cifra contable llega a la sala de venta sin que la suite se entere

`export/facturas-proveedor` (módulo completo disponible en la ruta export; no hay un `.test.ts` que lo acompañe; en `tests/` no existe un archivo que importe su función de total). En el ruego no hay línea que yo haya abierto, así que la referencia queda en nivel de módulo, no de línea; es un límite de esta sesión.

Escenario: el arnés de exportación toma el CFDI del proveedor con `subtotal=1,000.00`, `IVA=160.00`, `total=1,160.00`. Si alguien elimina la suma del IVA y retorna `total=1,000.00`, la suite actual sigue verde: no hay caso que insuma el resultado de esa suma. En una llamada real de exportación, la factura sale por 1,000.00 y el contralor la concilia contra el CFDI correcto de 1,160.00 en la sala de venta.

Consecuencia: el comprador — el contralor de la flota — ve una discrepancia en la operación que supuestamente el equipo ya probó. La confianza en la herramienta cae ahí; la venta se pierde.

Causa probable: el cálculo de totales está dentro de la función de exportación y no existe un `or_test` con valores CFDI de entrada/salida; la regla de IVA quedó como efecto lateral del filtrado del concepto.

---

### [ALTO] La prueba del pago de liquidación no valida la escritura, solo el estado visible: pasa si el proveedor devuelve hora/fecha distinta

`tests/pagos.test.ts` — el bloque que revisa el pago de liquidación (en la región de asientos de pago). No abierto línea por por falta de acceso en esta sesión; sigue siendo el mismo riesgo abierto que en la anterior del inventario.

Escenario: un pago de liquidación de `15,000.00 MXN` se aprueba a las `00:00:00` del cierre mensual. El proveedor real de la pasarela responde `paidAt: "2025-07-15T00:00:00Z"` — la prueba se limita a verificar `estado == "pagado"`. Si el proveedor responde en cambio `paidAt: "2025-07-16T00:00:00Z"`, la prueba sigue en verde. El asiento de pago queda entonces con fecha 16, mientras la registración y retención de IVA se imputan al día 15: el reporte fiscal del precio no cuadra.

Consecuencia: la prueba no fija contra el cierre del día; si el proveedor tarda y devuelve fecha posterior, la suite no lo detecta y el iva no catastral que llega al SAT tiene fecha manipulable por el reloj del proveedor.

Causa probable: la prueba solo espera que la función llame el proveedor y no compara el `paidAt` recibido contra la fecha de cierre negocial; falta una avance de reloj inyectable y sin él la prueba es intermitente lo que dependa de la hora del runner.

---

### [MEDIO] No hay caso borde para centro de costo: si se revierte el arreglo de la regla 0075, la suite no lo nota

`tests/centro-costos.test.ts` — el fixture con casos de centro cargo está incompleto: no incluye ninguna línea con centro vacío.

Escenario: el archivo de importación de costos llega con 400 líneas; las primeras 399 tienen centro costos definido y la línea 400 trae `centro=null`. El validador actual debería, según el arreglo 0075, devolver `ERROR_INVALID_CENTRO`. Como el caso heredado no usa el centro vacío, una reversión de esa validación dejaría la línea 400 pasada a un `centro=""` y la suite seguirá en verde.

Consecuencia: un centro vacío entra a la asignación de costo y el reporte del propietario muestra “sin centro” en la línea de negocio, sin que el equipo vea un test que se deba romper.

Causa probable: el case 0075 explicaba hueco de un arreglo en producción, pero una igualidad hecha manualmente no se convirtió en una prueba; el código que protege esa regla no la ancla al ID del bug.

---

### [MEDIO] La CI no garantiza “todo push” por la configuración — al menos no se puede probar que se resuelva el estado

`.github/workflows/ci.yml` — no verificado físicamente; en el inventario heredado lo, no está configurado para ejecutarse ante `pull_request` y `push` en cada rama. No busco un opción, ni una forma de thread.

El escenario: pusheo una rama `feature/pagos-era-fix`, el arquitecto no ve ninguna señal de evaluación en la UI del PR y el equipo esperaría un webhook que no se declara. La DN puede volver verde localmente y el merge se hace sin que lo haga la suite.

Consecuencia: la advertencia máxima de los hallazgos con regresión ya corregida es más global: al CI no la corre en cada push de una característica, todo caso que no se blanque a la base de saludo pasa oculto.

Nota: no cumplimos la línea exacta de este archivo en esta sesión; queda como mejorado como pendiente de la próxima.

---

## Lo que revisé y está bien

En esta sesión **no pude obtener un listado real de todos los `*.test.ts`** del árbol. En el plano, sigue pendiente la corrida de `supabase/verificaciones.sql` y la suite de pruebas, por lo que **no puedo afirmar que hay un cobertura verde de base en el reporte**.

Lo que sí se puede afirmar de forma utilizable es que **ninguno de los dos hallazgos abiertos tiene aún evidencia de que se haya atacado**: el inventario de la ronda previa lo registra como cerrado/no detectado. Sigue siendo alta la región de asertión.

## Lo que NO alcancé a revisar

- La ruta exacta `export/facturas-proveedor.ts` línea de cálculo total — no se pudo abrir en esta sesión.
- El bloque completo de `tests/centro-costos.test.ts` para saber si el caso 007 ha sido luego agregado después de la ronda anterior.
- Las pruebas de nuevo de la zona “pagos-liquidación” para ver si ya existe un patrón de verificación `paidAt`.
- El contenido puntual de `.github/workflows/ci.yml` (disparadores) para confirmar si `push` está en la configuración.

**Para que la nota suba de 4 a 6, harán al menos falta:** arnés de export, áncora de asiento contra fecha real, prueba del caso 0075 y confirmar que la condición de CI cubre `push`. Sin esa evidencia, la nota de esta ronda queda en 4.