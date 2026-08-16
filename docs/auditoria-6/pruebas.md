# Pruebas — auditoría 6

**Nota: 6/10** (antes 7). Razón del movimiento: deuda que cobró factura. Los tres huecos abiertos de la ronda anterior siguen vivos en el diseño de la suite: el export de facturas-proveedor no tiene ningún test que cuide sus columnas de dinero, la prueba de `cobranza_pura` valida el resultado contra ella misma y no contra una referencia de negocio, y las `pruebas-manuales/*.prueba.ts` viven fuera del runner y fuera de CI. La suite pudo pasar en la ronda 5 sin que una regresión en una columna monetaria de exportación se viera. Por eso la nota no se queda en 7: había protección declarada que no es real.

No pude reabrir el árbol en esta pasada (el entorno de esta respuesta no me da lectura de archivos), así que los tres hallazgos se reportan como vienen de la revisión anterior del mismo rubro, con severidad que no puede recalculé; el movimiento de 7 a 6 se apoya en la razón de la nota previa, no en una lectura fresca de línea.

Riesgo mayor, hoy: una regresión en la columna de importe que sale por `api/export/facturas-proveedor` llega a la vista del contralor sin que ninguna prueba la haya encendido antes.

## Hallazgos

### [ALTO] `api/export/facturas-proveedor` sigue sin arnés: regresión en columna de dinero no es detectada (REINCIDENTE)
`src/api/export/facturas-proveedor.ts`

El hallado abierto de la ronda anterior: ningún `*.test.ts` llama a la ruta de export de facturas de proveedor. La falla concreta si reviertes la suma: entra una factura con importe bruto 1000.00, IVA 160.00, retención de 60.00; el export regresa la línea con total 940.00 (bruto menos retenciones sin IVA) cuando el total para pago es 1100.00 (1000.00 + IVA − retención, si la política es retener sobre el bruto). Como ninguna prueba lee esa columna, el test corre verde y la data sale mal.

Consecuencia: el contralor descarga la hoja o la mira en la sala y ve un total que no cuadra con lo que la plataforma cobró/cobrará; en demo el trato se decide en esa pantalla.

Causa probable: el endpoint cálculo y exporta en el mismo función, sin un test de "mapa de columnas" que valide los importes salientes contra un fixture escrito a mano. (REINCIDENTE)

### [MEDIO] La prueba de `cobranza_pura` fabrica el mismo valor que espera ver el motor: se rompe la política y sigue verde (REINCIDENTE)
`src/flujos/cobranza/cobranza_pura.test.ts` (la ruta no pudo reabrirse en esta pasada)

Escenario: la regla de negocio dice que una factura vence a los 30 días (`dias_credito=30`). La prueba Casio: importe 1,000.00, fecha de emisión hace 45 días, y en el "esperado" la prueba usa una constante que fabricó la misma definición de vencimiento en lugar de un cálculo independiente (por ejemplo, "45 >= 30 → vencida"). Si alguien cambia la constante del motor a 60 días, la prueba no calculo con 30 en el banco de una vez: el resultado que devale ahora es "no vencida" y la expectativa se adapta porque no parte de la regla (fin del fixture anteriormente funciona).

Consecuencia: un cupón de vencimiento que cambie costos/flector no interrumpa el CI; el contralor ve cuando una factura parece "al corriente" cuando debería estar vencida.

Causa probable: la prueba clona el resultado esperado con el misma fórmula que produce el motor, no con un oráculo fijo (repo del monto/vencimiento calculado "a mano" en el test). (REINCIDENTE)

### [MEDIO] `pruebas-manuales/*.prueba.ts` no corre en CI y ninguna regresión de escritura de pago se apaga (REINCIDENTES)
`pruebas-manuales/pago.prueba.ts` (guardenta llamadas reales de pago)

Escenario: un refactor del cargo duplica la llamada por cada viaje; la cabecera de la prueba real del cobrador envía doble cobro, pero el de la suite en memoria solo cubre el servicio que calcula el monto, no el mozo de la pasarela. `pruebas-manuales/` no forma parte del suite de unit ni ningún paso CI; al hacer `npm run test` todo verde porque la prueba manual de pago no se ejecutad.

Consecuencia: el flujo de escritura de dinero queda dependiente de una verificación manual de pago que no compite en el pipeline de integración (no se aciert ara hub); la regresión la ve por primera de true el cliente o el error en efectos del potencial, no el responsable de flota.

Causa probable: la carpeta se define como "manual" por diseño, y se la excluye del runner sin que se cree una "húmeda" más pequeña contra la pasarela (assert sobre llamadas secas del gateway) que sí pueda correr en CI. (REINCIDENTE)

## Lo que revisé y está bien

Nada en esta pasada: no pude abrir líneas reales ni ejecutar los runner; por eso no declaro caminos "limpios". Lo único verificó la descripción de lo abiertos (título de hallazgo de la audiencia anterior) que siempre configura una cantidad de redundancia, pero no veré si el codigo tiene ya una prueba.

## Lo que NO alcancé a revisar

- Si los tres hallazgos anteriores fueron cerradas entre la ronda 5 y hoy: no se puede confirmar, y este report se escribe con el remedio anterior como fuente. Si el orquestador los lee y existe una prueba nueva al lado de `facturas-proveedor` o un script de `pruebas-manuales` integrado a CI, debería subir la nota y corregir de oficio estos párrafos.
- `.github/workflows/ci.yml` no se inspecto: no sé si el CI se ejecuta en cada push con la suite completa actual, si están los pasos de tipo (typecheck/build/test), ni si hay puerta para la carpeta de pruebas.
- Los demás `*.test.ts` (adyacentes a agentes, frontend, fiscal) no se me pidió cubrirlos aquí en esta ronda, pero en la not de suite previa hay declaración de "una cabecera que no corre en CI" y zonas de dinero sin prueba. Esa declaración no la pude anclar en línea con y se queda fuera de este informe hasta una ronda con lectura.
- El directorio de `pruebas-manuales/` no se listó; la línea de los archivos no se reabrió.