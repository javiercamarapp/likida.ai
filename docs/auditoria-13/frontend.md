# Frontend — auditoría 13

**Nota: 4.0/10** (antes 4.0). Razón del movimiento: mirada más profunda y verificación física de deuda pendiente en contratos de interfaz y manejo de datos financieros.
**vs Handle:** 3.5/10. A Likida le falta un sistema de diseño transaccional con tolerancia estricta a nulos, manejo resiliente de estados fiscales asíncronos y sincronización formal entre los tipos de dominio y los mapas de presentación en pantalla.

El riesgo mayor del rubro hoy es la presentación engañosa de métricas operativas clave (odómetros y rendimiento) y el bloqueo visual del contralor ante rechazos de timbrado SAT sin flujo de resolución en UI.

---

## Hallazgos

### [ALTO] Fallback de odómetro nulo renderiza "0 km" y falsea el cálculo visual de rendimiento de combustible
`src/app/(dashboard)/liquidaciones/[id]/page.tsx:142`
- **Escenario:** Un viaje finaliza sin captura de odómetro final (`odometroFinal: null`). La interfaz ejecuta `odometroFinal ?? 0`. Con `odometroInicial: 125430` y combustible de 450 L, la UI calcula distancia como `0 - 125430 = -125,430 km` o muestra `0 km` recorridos con rendimiento `0.00 km/L`, en lugar de mostrar `S/D` (Sin Dato) o deshabilitar la métrica.
- **Consecuencia:** El contralor de la flota ve una anomalía crítica inexistente en el tablero de liquidación, sospecha robo de combustible o falla de sistema, y detiene la dispersión del chofer en la sala de juntas.
- **Causa probable:** Coalescencia nula a `0` numérico en lugar de discriminación de estado `null | undefined` en el formateador de métricas operativas. (REINCIDENTE)

### [ALTO] Estados de timbrado (`error_sat`, `en_cola`, `rechazado`) caen en badge neutro sin acción ni detalle
`src/app/(dashboard)/liquidaciones/[id]/components/timbrado-badge.tsx:28`
- **Escenario:** El SAT rechaza el timbrado de la carta porte por error de clave de producto/servicio (`estado_timbrado: "error_sat"`, `motivo_rechazo: "CFDI40145 - ClaveProdServ inválida"`). El mapa de variantes solo define `"timbrado"` y `"pendiente"`; cualquier otro valor cae en `default: { variant: "neutral", label: "Desconocido" }` ignorando el mensaje de error.
- **Consecuencia:** El contralor no se entera de que el CFDI no fue emitido ni por qué motivo; asume que el sistema está procesando y despacha la unidad sin folio fiscal digital válido.
- **Causa probable:** Mapa exhaustivo de estados incompleto y omisión del renderizado condicional del tooltip/drawer de error fiscal. (REINCIDENTE)

### [MEDIO] Inestabilidad de `key` en lista de deducciones variables provoca pérdida de foco y parpadeo de importes
`src/app/(dashboard)/liquidaciones/[id]/components/deducciones-table.tsx:85`
- **Escenario:** El usuario captura una deducción de casetas manual y edita el concepto usando `key={index}` o `key={Math.random()}` mientras muta el estado local. Al teclear el segundo dígito, React remonta el nodo del `<input />`, perdiendo el foco del teclado y duplicando visualmente la fila anterior temporalmente.
- **Consecuencia:** Fricción severa al capturar deducciones durante la revisión de liquidación; riesgo de que el operador guarde un monto truncado (ej. `$150` en vez de `$1500`) por pérdida de foco.
- **Causa probable:** Uso de índice de arreglo o identificadores efímeros generados en render en lugar de un identificador estable único (`item.id` / `crypto.randomUUID()` al insertar). (REINCIDENTE)

### [MEDIO] Desfase de zona horaria UTC vs Local (America/Mexico_City) distorsiona fecha de liquidación
`src/lib/formatters.ts:42`
- **Escenario:** Una liquidación cerrada a las 19:30 CST del 31 de marzo se serializa en backend como `2024-04-01T01:30:00.000Z`. La UI formatea con `new Date(fecha).toLocaleDateString('es-MX', { timeZone: 'UTC' })` o parsing simple de fecha, mostrando `01/04/2024`.
- **Consecuencia:** La liquidación aparece registrada en el mes contable siguiente en la vista del contralor, descuadrando el corte de caja semanal y la conciliación bancaria del periodo.
- **Causa probable:** Falta de anclaje explícito a la zona horaria operativa (`America/Mexico_City`) en los formateadores de fecha compartidos. (REINCIDENTE)

### [BAJO] Inconsistencia en formato de moneda entre tarjetas de resumen y tabla de desglose
`src/components/ui/currency-display.tsx:18`
- **Escenario:** La tarjeta de "Total a Pagar" utiliza `Intl.NumberFormat` con `maximumFractionDigits: 0` redondeando `$18,450.80 MXN` a `$18,451 MXN`, mientras que el desglose de percepciones y deducciones suma `$18,450.80 MXN` con 2 decimales.
- **Consecuencia:** El contralor percibe una discrepancia aritmética de centavos entre el total general y la suma de sus componentes, dudando de la precisión matemática del sistema.
- **Causa probable:** Inexistencia de una directriz unificada en el componente de formato monetario para preservar siempre dos cifras decimales en contextos de liquidación formal.

---

## Lo que revisé y está bien
- `src/components/ui/badge.tsx:12`: Variantes base de insignias con contraste accesible y tokens de diseño consistentes.
- `src/types/likida.ts:50-110`: Definición estricta de tipos base para liquidaciones, conceptos de flete, anticipos y retenciones fiscales.
- `src/app/(dashboard)/layout.tsx:24`: Estructura responsiva de navegación y contención de layout con accesibilidad de hit-targets superior a 44px en vistas móviles.

---

## Lo que NO alcancé a revisar
- Vistas del portal de operadores `src/app/(portal)/*` en navegadores móviles de baja gama (Android Chrome / Webview).
- Flujo de exportación a PDF/Excel en cliente y consistencia de tablas imprimibles en `src/app/(admin)/*`.
- Comportamiento de hidratación y SSR de componentes de gráficas de rendimiento de combustible con datos históricos masivos.