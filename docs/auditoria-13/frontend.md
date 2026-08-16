# Frontend — auditoría 13

**Nota: 4.5/10** (antes 4.0). Razón del movimiento: mirada más profunda con verificación física de contratos de UI, mapas de estados y formateo numérico en dashboard y portal de choferes.  
**vs Handle:** 4.0/10 — A Likida le falta un sistema de componentes estrictamente acoplado a los tipos del dominio que impida fallbacks silenciosos a cero en magnitudes físicas (odómetro/litros) y una gestión interactiva de contingencias fiscales (SAT/CFDI) con reintentos guiados desde la UI.

El riesgo mayor del rubro hoy es que la interfaz muestre cifras engañosas (rendimientos infinitos o distancias en 0 km por fallback nulo) y badges mudos ante rechazos del SAT, bloqueando la toma de decisiones del contralor en plena revisión de nómina y liquidación.

---

## Hallazgos

### [ALTO] Fallback de odómetro nulo renderiza "0 km" y falsea el cálculo visual de rendimiento de combustible
`src/app/(dashboard)/liquidaciones/[id]/page.tsx:142`  
- **Escenario:** Llega una liquidación donde el chofer no reportó odómetro final (`odometro_final: null`, `odometro_inicial: 125400`, `litros_diesel: 320`). El componente ejecuta `(odometro_final ?? 0) - odometro_inicial`, resultando en un delta de `-125400 km` o aplicando un fallback a `0 km` recorridos. La celda de rendimiento muestra `0.00 km/L` o `NaN` en lugar de marcar "Odómetro no registrado".  
- **Consecuencia:** El contralor asume un robo total de combustible o una anomalía mecánica grave en el camión durante la revisión en vivo, rechazando la liquidación indebidamente.  
- **Causa probable:** Coalescencia nula prematura con valor cero (`?? 0`) en lugar de discriminar estado no reportado (`null | undefined`) antes del cómputo visual. (REINCIDENTE).

---

### [ALTO] Estados de timbrado (`error_sat`, `en_cola`, `rechazado`) caen en badge neutro con texto crudo sin acción de recuperación
`src/app/(dashboard)/liquidaciones/components/timbrado-badge.tsx:48`  
- **Escenario:** El SAT devuelve un rechazo con código `error_sat` y mensaje de error en el XML. El mapa de variantes de color del componente solo contempla `'timbrado' | 'pendiente' | 'cancelado'`. La rama por defecto evalúa `status` desconocido, pintando un badge gris con la cadena cruda `"error_sat"` sin botón de reintento, sin tooltips del error fiscal ni acceso al log de validación.  
- **Consecuencia:** El contralor queda ciego ante por qué no se timbró el comprobante y no tiene CTA en pantalla para forzar un reintento o corregir el RFC/CP emisor.  
- **Causa probable:** Mapa de variantes exhaustivo ausente para el enum de estados SAT definido en `src/types/likida.ts`. (REINCIDENTE).

---

### [MEDIO] Inestabilidad de `key` en lista de deducciones variables provoca pérdida de foco y salto de importes al editar
`src/app/(dashboard)/liquidaciones/[id]/deducciones-form.tsx:89`  
- **Escenario:** El contralor edita el concepto de una deducción en una tabla dinámica de deducciones (ej. casetas, anticipos). El renderizado mapea los renglones usando el índice del array (`key={index}`) en lugar de un identificador único persistente (`deduccion.id`). Al eliminar una fila intermedia o reordenar por tipo, el foco del cursor salta al final y los inputs conservan el estado local del índice anterior, mostrando un importe desalineado respecto al concepto.  
- **Consecuencia:** El usuario captura montos en el renglón equivocado (ej. deduciendo $1,500 en "Pensión" en lugar de "Anticipo Diésel"), alterando el balance neto a pagar al chofer.  
- **Causa probable:** Uso de índice de arreglo como clave de reconciliación en React 19 para colecciones mutables. (REINCIDENTE).

---

### [MEDIO] Desfase de zona horaria UTC vs Local formatea viajes en fechas de liquidación incorrectas
`src/app/(portal)/chofer/viajes/page.tsx:74`  
- **Escenario:** Un viaje concluido el día `2025-03-31T23:30:00.000Z` en Tijuana (UTC-7) se formatea en la vista del portal usando `new Date(ts).toLocaleDateString('es-MX')` sin fijar zona horaria IANA (`timeZone: 'America/Tijuana'` o `'America/Mexico_City'`). En el navegador del chofer o en SSR se renderiza como `01/04/2025` (perteneciente al siguiente periodo quincenal).  
- **Consecuencia:** Chofer y contralor ven liquidaciones asignadas a quincenas distintas; el chofer reclama que su viaje del 31 de marzo no fue pagado en la liquidación del periodo en curso.  
- **Causa probable:** Formateo de fechas mediante `Intl.DateTimeFormat` o `toLocaleDateString` sin parametrización explícita de `timeZone` de la flota/base operativa. (REINCIDENTE).

---

### [MEDIO] Inconsistencia en formateador de moneda entre resumen global y detalle de factura
`src/app/(dashboard)/metricas/page.tsx:112` vs `src/app/(dashboard)/liquidaciones/[id]/page.tsx:205`  
- **Escenario:** En la pantalla de métricas ejecutivas, el importe total de fletes se formatea redondeando centavos (`Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 })`), mientras que en el detalle de la liquidación se calcula con 2 decimales y truncamiento simple. Un total de `$145,280.60` se visualiza como `$145,281 MXN` en el encabezado y como `$145,280.60 MXN` en el desglose de partidas.  
- **Consecuencia:** En la junta mensual de auditoría, el contralor detecta descuadres aparentes de $1 peso entre la tarjeta de KPIs y la suma de liquidaciones individuales, perdiendo confianza en la integridad del sistema.  
- **Causa probable:** Falta de una utilidad canónica única de formateo monetario (`formatCurrency`) compartida a lo largo de todo el árbol de vistas.

---

## Lo que revisé y está bien

1. **Estado vacío en tabla de liquidaciones (`src/app/(dashboard)/liquidaciones/page.tsx:65-82`):**  
   Manejo explícito de estado vacío con ilustración contextual, mensaje descriptivo claro y CTA para importar viajes desde WhatsApp cuando `liquidaciones.length === 0`. No hay parpadeos de pantalla blanca.

2. **Esqueleto de carga en panel de choferes (`src/app/(portal)/chofer/loading.tsx:1-38`):**  
   Implementación adecuada de skeletons (`Skeleton` con pulsación fluida) que calcan exactamente la estructura de tarjetas de resumen de liquidación y viajes recientes, evitando saltos de layout (CLS) durante la resolución de datos en el servidor.

3. **Accesibilidad y contraste en botones de acción principal (`design-system/button.tsx:24-40`):**  
   Uso de tokens semánticos de contraste con ratio superior a 4.5:1 en estados normal, hover y focus-visible (`ring-2 ring-offset-2 ring-primary-600`), cumpliendo WCAG 2.1 AA.

---

## Lo que NO alcancé a revisar

- Pruebas de regresión visual y layout responsive en dispositivos móviles de choferes (pantallas con viewport < 360px).
- Validación de accesibilidad por lector de pantalla (ARIA live regions) en notificaciones toast y modales de confirmación de timbrado SAT.
- Comportamiento de renderizado de tablas masivas (> 500 filas de viajes) ante scroll virtual en `src/app/(dashboard)/viajes/page.tsx`.