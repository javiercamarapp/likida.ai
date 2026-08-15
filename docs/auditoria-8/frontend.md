# Frontend — auditoría 8

**Nota: 5.5/10** (antes 6.5). Razón del movimiento: mirada más profunda (la nota previa estaba inflada) y persistencia de desincronizaciones entre los tipos del dominio (`src/types/likida.ts`) y los mapeos visuales en paneles críticos de liquidación y combustible.

El riesgo mayor del rubro hoy es la exposición en sala de juntas de estados crudos del SAT/timbrado y cálculos de rendimiento con divisores en cero o fallbacks a $0.00 / 0 km que destruyen la confianza del contralor durante una demo en vivo.

---

## Hallazgos

### [ALTO] Fallback de odómetro nulo renderiza "0 km" y falsea el cálculo visual de rendimiento de combustible
`src/app/(dashboard)/combustible/page.tsx:142`
Escenario: Una carga de combustible no registra odómetro previo (`odometro_anterior = null` o no capturado por el operador en WhatsApp). El componente evalúa `carga.odometro_anterior ?? 0` y calcula `distancia = carga.odometro_actual - 0`. Para un odómetro actual de 145,200 km con 350 litros cargados, la UI muestra un recorrido de "145,200 km" y un rendimiento irreal de "414.8 km/l" en la tarjeta de métrica en lugar de renderizar "N/D" o advertencia de odómetro faltante.
Consecuencia: El contralor de la flota ve métricas de rendimiento absurdas en la tabla y asume que el sistema de auditoría de combustible calcula mal el consumo.
Causa probable: Falta de guarda explícita para valores `null`/`undefined` en el cálculo de delta de kilometraje antes del formateo visual. (REINCIDENTE).

### [ALTO] Estados de timbrado (`error_sat`, `en_cola`, `rechazado`) caen en badge neutro con texto crudo sin acción de recuperación
`src/app/(dashboard)/liquidaciones/[id]/page.tsx:88`
Escenario: Un viaje finalizado pasa a timbrado CFDI / Carta Porte y falla por catálogo del SAT (`estado_timbrado: "error_sat"`). El mapa de variantes de badge solo contempla `borrador`, `timbrado` y `cancelado`. Al no encontrar la clave, el componente recurre a `default: { variant: "outline", label: estado }`, mostrando una etiqueta gris en minúsculas `error_sat` sin tooltip de detalle del error ni botón de reintento.
Consecuencia: El contralor no sabe si la factura se emitió, si es un error recuperable o si debe intervenir fiscalmente; en sala de ventas parece un error no manejado del software.
Causa probable: Desincronización entre el enum `EstadoTimbrado` de `src/types/likida.ts` y el diccionario literal de etiquetas del componente de detalle. (REINCIDENTE).

### [MEDIO] Inestabilidad de `key` en lista de deducciones variables provoca pérdida de foco y parpadeo de importes
`src/components/liquidaciones/tabla-deducciones.tsx:64`
Escenario: El contralor edita un anticipo o deducción manual dentro del panel de liquidación. La lista itera sobre `deducciones.map((d, index) => <DeduccionRow key={index} ... />)`. Cuando se agrega una nueva fila o se elimina un concepto de caseta tag no reconocido, React reutiliza las instancias del DOM por índice posicional, desplazando los valores ingresados en los inputs controlados a la fila equivocada.
Consecuencia: El usuario modifica un monto de "Anticipo Diésel" pero el valor se refleja en "Pensión/Estadía", forzando al usuario a recargar la página.
Causa probable: Uso del índice del array como clave en lugar del UUID o identificador único del concepto (`deduccion.id`). (REINCIDENTE).

### [MEDIO] Desfase de zona horaria (UTC vs Local) desplaza la fecha de expedición de Carta Porte al día anterior
`src/lib/formatters.ts:45`
Escenario: El backend devuelve `fecha_salida: "2025-03-30T02:30:00Z"`. El formateador ejecuta `new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC' }).format(new Date(fecha))` en lugar de la zona horaria del centro de México (`America/Mexico_City`) o del emisor. En pantalla de liquidaciones se muestra "30 mar 2025", mientras que en el detalle de bitácora y reporte local se muestra "29 mar 2025 20:30 hrs".
Consecuencia: Inconsistencia entre la fecha mostrada en la tabla resumen y la fecha del documento timbrado ante el SAT, generando dudas de auditoría en el contralor.
Causa probable: Hardcodeo de zona horaria UTC en la utilidad compartida de formateo de fechas. (REINCIDENTE).

### [MEDIO] Formateo inconsistente de moneda entre resumen de cabecera y tabla de desglose de viaje
`src/components/liquidaciones/resumen-financiero.tsx:32`
Escenario: En la tarjeta superior de totales, el neto a pagar se calcula y formatea con `formatCurrency(monto, { decimals: 2 })` arrojando `$45,820.50 MXN`. En la tabla inferior de partidas (`src/components/liquidaciones/partidas-tabla.tsx:91`), los subtotales utilizan `Math.round(val)` renderizando `$45,821`. Al sumar visualmente las columnas de la tabla, la suma da `$45,821.00`, discrepando por $0.50 respecto al total general superior.
Consecuencia: El contralor desconfía de la precisión aritmética del sistema al no cuadrar la suma visual de partidas con el indicador principal.
Causa probable: Coexistencia de dos funciones auxiliares de formateo numérico sin centralización estricta.

---

## Lo que revisé y está bien

- `src/components/ui/badge.tsx:12`: Variantes semánticas base (`default`, `secondary`, `destructive`, `outline`) correctamente tipadas con `cva` y estilos consistentes en Tailwind CSS.
- `src/app/(dashboard)/layout.tsx:28`: Manejo del estado de autenticación y carga de sesión de Supabase; redirige limpiamente al login si el token expira sin provocar loops de redirección ni pantalla en blanco.
- `src/components/liquidaciones/estado-vacio.tsx:15`: El estado sin liquidaciones pendientes renderiza una ilustración adecuada, mensaje claro y CTA para sincronizar viajes sin errores de hidratación SSR.

---

## Lo que NO alcancé a revisar

- Vista responsive y comportamiento táctil del portal del operador (`src/app/(portal)/...`) en dispositivos móviles de gama baja con pantallas estrechas (<360px).
- Modales de confirmación de timbrado masivo y exportación a Excel en `src/app/(admin)/...` bajo condiciones de timeout de red (>15s).
- Compatibilidad de contraste y accesibilidad (WCAG AA) en el modo oscuro para las alertas de discrepancia fiscal.