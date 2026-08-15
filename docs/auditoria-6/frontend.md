# Frontend — auditoría 6

**Nota: 7.0/10** (antes 7.5). Razón del movimiento: mirada más profunda en componentes de detalle, tablas de agentes y sheets de liquidación; persisten discrepancias de mapeo entre enums de `src/types/likida.ts` y diccionarios literales de UI, junto con fallbacks numéricos (`0` vs `null`) que falsean métricas de rendimiento y odómetro ante el contralor.

El riesgo mayor del rubro hoy es la desincronización silenciosa entre los enums de servidor/base de datos y los diccionarios literales de badges en tablas y sheets, provocando que estados operativos y fiscales críticos caigan en fallbacks crudos o con estilos neutros en plena demostración de cierre.

---

## Hallazgos

### [ALTO] Estado `en_proceso` y `error` en facturación caen en fallback crudo sin semántica visual
`src/app/(dashboard)/facturas/components/facturas-table.tsx:28`
Escenario: Una factura entra con `estatus: "en_proceso"` (o `"error"` retornado por el PAC). El mapa literal `ESTATUS_BADGES` solo define `borrador`, `timbrada`, `cancelada` y `pagada`. La UI ejecuta el fallback `ESTATUS_BADGES[estatus] ?? { label: estatus, variant: "outline" }`, pintando un badge gris con el texto crudo `"en_proceso"` o `"error"`, sin color de advertencia ni tooltip explicativo.
Consecuencia: El contralor no distingue a simple vista si una factura está en cola de timbrado o si fue rechazada por el PAC con error de validación fiscal, asumiendo que el sistema está congelado.
Causa probable: Extensión de `EstatusFactura` en `src/types/likida.ts` sin actualizar el objeto literal en el componente cliente de la tabla. (REINCIDENTE)

---

### [ALTO] Fallback de odómetro y kilometraje renderiza "0 km" falseando el cálculo de rendimiento de combustible
`src/app/(dashboard)/viajes/components/viaje-detail-sheet.tsx:142`
Escenario: Un viaje nuevo o importado sin lectura de odómetro inicial/final (`odometro_inicio: null`, `km_recorridos: null`) se evalúa con operador ternario débil `viaje.km_recorridos || 0` o `formatKm(viaje.km_recorridos ?? 0)`. La pantalla muestra `0 km` y calcula rendimiento como `0.0 km/L` en lugar de mostrar `"—"` o `"Sin odómetro capturado"`.
Consecuencia: El contralor de la flota ve un rendimiento en ceros y asume una anomalía crítica de robo de combustible o falla de integración telemetría en la unidad.
Causa probable: Uso de coalescencia a cero numérico en lugar de discriminación explícita de valor nulo/no capturado. (REINCIDENTE)

---

### [MEDIO] Inconsistencia en formato de fechas de vigencia de licencias y pólizas en fichas rápidas
`src/app/(dashboard)/operadores/components/operador-detail-sheet.tsx:88`
Escenario: Al consultar la ficha rápida del operador, la vigencia de la licencia federal se formatea con `formatDate(vigencia, "dd MMM")` omitiendo el año, mientras que la póliza de seguro en la misma vista utiliza `formatDate(vigencia, "dd/MM/yyyy")`.
Consecuencia: El contralor o despachador no puede verificar de un vistazo si una licencia vence en el año en curso o si ya venció el año pasado, induciendo a despachar viajes con riesgo de infracción ante la SICT.
Causa probable: Formateador hardcodeado sin estandarizar en el design system de fechas. (REINCIDENTE)

---

### [MEDIO] Duplicidad de keys de React en renderizado de deducciones y retenciones en liquidaciones
`src/app/(dashboard)/liquidaciones/components/liquidacion-detail-sheet.tsx:215`
Escenario: Al renderizar el desglose de deducciones operativas (casetas, anticipos, diésel), la lista utiliza `key={deduccion.tipo}` en lugar de un identificador único compuesto (`deduccion.id` o `${deduccion.tipo}-${index}`). Cuando un operador registra dos cargas de diésel o dos anticipos en el mismo viaje, React genera colisión de keys y desordena visualmente los importes o falla en la reconciliación del DOM durante mutaciones optimistas.
Consecuencia: El desglose de deducciones muestra valores duplicados o salta visualmente al aprobar una deducción en vivo.
Causa probable: Mapeo de listas usando un campo de categorización no unívoco como key.

---

### [BAJO] Contraste insuficiente en estados inactivos de switches y badges neutros en modo claro
`src/design-system/components/badge.tsx:42`
Escenario: En modo claro, los badges con variante `muted` o `outline` para registros inactivos/archivados aplican `text-muted-foreground` (`hsl(240 3.8% 46.1%)`) sobre fondos grises tenues (`hsl(240 4.8% 95.9%)`), arrojando un ratio de contraste de ~3.8:1, por debajo del estándar WCAG AA de 4.5:1 para texto pequeño.
Consecuencia: Dificultad de lectura para usuarios en pantallas con brillo reducido o monitores de oficina con baja calibración de color.
Causa probable: Token de color `muted-foreground` ajustado para interfaces oscuras sin compensación de luminancia en tema claro.

---

## Lo que revisé y está bien

- `src/app/(dashboard)/viajes/components/viajes-table.tsx:45` — El mapeo de `ESTATUS_BADGES` cubre exactamente los 6 estados de viaje (`borrador`, `confirmado`, `en_transito`, `completado`, `liquidado`, `cancelado`) con variantes de badge semánticamente correctas y legibles.
- `src/app/(dashboard)/liquidaciones/components/liquidaciones-table.tsx:34` — Cobertura completa de los estados de liquidación (`borrador`, `calculada`, `aprobada`, `pagada`, `cancelada`, `en_disputa`) con manejo adecuado de moneda y montos negativos para deducciones.
- `src/app/(dashboard)/cartas-porte/components/cartas-porte-table.tsx:52` — Formateo estricto de UUID fiscal con truncado inteligente (`truncateMiddle`), tooltip con copia al portapapeles y validación de estado timbrado/pendiente.
- `src/design-system/components/money-display.tsx:18` — Formato monetario centralizado con `Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })`, evitando desalineaciones entre centavos y separadores de miles en toda la suite.

---

## Lo que NO alcancé a revisar

- `src/app/(portal)/` — Flujos de autoservicio y vistas públicas para permisionarios y choferes externos en dispositivos móviles de gama baja.
- `src/app/(admin)/` — Vistas de administración interna y métricas de soporte multi-tenant.
- Interacción de modales anidados y accesibilidad con lectores de pantalla (ARIA live regions) en las notificaciones en tiempo real vía WebSocket.