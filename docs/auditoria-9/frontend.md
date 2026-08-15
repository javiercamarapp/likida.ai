# Frontend — auditoría 9

**Nota: 5.0/10** (antes 5.5). Razón del movimiento: mirada más profunda (la nota previa estaba inflada). Persisten fallas de renderizado en estados fiscales/operativos críticos, discrepancias de formateo en montos entre vistas del dashboard y portal, y estados de timbrado que degradan en badges mudos sin acciones de recuperación ni manejo de fallos para el contralor.

El riesgo mayor del rubro hoy es que el contralor vea discrepancias de importes entre la vista de detalle y la tabla resumen por formateos divergentes, junto a estados de timbrado fiscal con errores crudos no recuperables en pantalla durante el cierre de liquidación.

---

## Hallazgos

### [ALTO] Fallback de odómetro nulo renderiza "0 km" y falsea el cálculo visual de rendimiento de combustible
`src/app/(dashboard)/liquidaciones/[id]/page.tsx:142`
Escenario: Una liquidación creada sin captura previa de odómetro final o con odómetro inicial en `null`/`undefined` entra al detalle del viaje. En lugar de mostrar un estado de "Pendiente" o `—`, la UI evalúa `viaje.odometro_final || 0` y calcula `distancia = (viaje.odometro_final || 0) - (viaje.odometro_inicial || 0)`. Con odómetro inicial de `145,200 km` y final nulo, la pantalla muestra distancia `-145,200 km` y rendimiento `0.00 km/L`.
Consecuencia: El contralor de la flota ve métricas absurdas y consumos negativos de combustible en la pantalla principal de aprobación, deteniendo la liquidación por desconfianza en el sistema.
Causa probable: Falta de validación estricta de nulidad antes de computar métricas de odometría en los componentes de visualización del dashboard. (REINCIDENTE)

---

### [ALTO] Estados de timbrado (`error_sat`, `en_cola`, `rechazado`) caen en badge neutro con texto crudo sin acción de recuperación
`src/app/(dashboard)/liquidaciones/components/timbrado-status-badge.tsx:28`
Escenario: Un CFDI de traslado/ingreso con complemento Carta Porte es rechazado por el SAT con código `error_sat` y mensaje técnico `CFDI40145 - El campo RfcReceptor no es válido`. El componente mapea solo `['timbrado', 'pendiente', 'cancelado']`. Cualquier otro estado cae en la rama `default`, renderizando un badge gris con el texto crudo `error_sat` sin tooltip de detalle, sin resaltar en rojo de alerta y sin botón de reintento o descarga de acuse de error.
Consecuencia: El contralor no se entera de que el viaje no cuenta con folio fiscal timbrado ante el SAT hasta que el chofer es detenido en carretera o durante la auditoría mensual, sin vía visual para forzar el retimbrado desde el panel.
Causa probable: Switch/mapa de estados de timbrado no exhaustivo frente al enum definido en el backend y tipos de base de datos. (REINCIDENTE)

---

### [MEDIO] Inestabilidad de `key` en lista de deducciones variables provoca pérdida de foco y parpadeo de importes
`src/app/(dashboard)/liquidaciones/[id]/components/deducciones-table.tsx:64`
Escenario: El usuario edita una deducción manual (e.g. anticipo de diésel de `$2,500.00`) en la tabla dinámica. La fila usa como key `key={index}` o `key={`${item.concepto}-${index}`}`. Al modificar el concepto o agregar una deducción intermedia, React reordena o destruye los nodos del DOM, perdiendo el foco del input y recalculando visualmente los subtotales con parpadeo de estados locales no sincronizados.
Consecuencia: Frustración del operador administrativo al capturar deducciones durante la revisión de liquidaciones en lote, con riesgo de sobreescritura accidental de cifras en el renglón equivocado.
Causa probable: Uso de índices de arreglo o cadenas mutables en lugar del UUID persistente (`deduccion.id` o `crypto.randomUUID()` en borradores) en la propiedad `key`. (REINCIDENTE)

---

### [MEDIO] Desfase de zona horaria (UTC vs Local) en visualización de fechas de liquidación y emisión
`src/app/(dashboard)/liquidaciones/page.tsx:88`
Escenario: Un viaje liquidado a las 23:30 hrs del día 15 de marzo en Ciudad de México (UTC-6) se guarda como ISO UTC (`2025-03-16T05:30:00Z`). El componente renderiza la fecha utilizando `new Date(fecha).toLocaleDateString('es-MX', { timeZone: 'UTC' })` o `format(parseISO(fecha), 'dd/MM/yyyy')` sin forzar la zona horaria del tenant (`America/Mexico_City`). En el listado la liquidación aparece con fecha del "16/03/2025", mientras que en el reporte impreso y la Carta Porte aparece como "15/03/2025".
Consecuencia: Discrepancia contable visible para el contralor entre la fecha del corte operativo en pantalla y los libros de facturación y nómina de choferes.
Causa probable: Formateo de fechas sin contexto explícito de la zona horaria operativa de la flota mexicana. (REINCIDENTE)

---

### [MEDIO] Formateador de moneda inconsistente entre vistas de resumen y detalle
`src/app/(dashboard)/liquidaciones/page.tsx:112` y `src/app/(portal)/viajes/[id]/page.tsx:76`
Escenario: En la tabla general de liquidaciones se utiliza una función ad-hoc `Math.round(val).toLocaleString()` que oculta centavos (`$18,450 MXN`), mientras que en la vista de detalle y en el portal del chofer se formatea con `Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 })` mostrando `$18,450.48`. Al comparar el gran total de la lista contra el detalle individual, hay una diferencia visible de centavos que no cuadra en las sumatorias de columna.
Consecuencia: El contralor percibe errores de redondeo o "pérdida de dinero" entre la vista agregada y la vista detallada de liquidación.
Causa probable: Duplicación de helpers de formateo financiero en lugar de consumir una utilidad centralizada y canónica (`formatMoney` / `formatCurrency`).

---

### [BAJO] Contraste insuficiente en badges de estado "Borrador" y textos de ayuda en modo claro
`design-system/src/components/badge.tsx:42`
Escenario: Badges con variante `variant="muted"` o `variant="draft"` utilizan clases de Tailwind `text-zinc-400 bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-500`. En pantallas estándar de oficina o proyectores de sala de juntas, el ratio de contraste medido cae por debajo de 3.2:1 (incumpliendo WCAG 2.1 AA que exige 4.5:1 para texto normal).
Consecuencia: El estatus de liquidaciones preliminares resulta ilegible para contralores y auditores en condiciones de luz ambiental alta o presentaciones ejecutivas.
Causa probable: Selección de paleta de colores de diseño sin verificación de accesibilidad de contraste en estados inactivos/deshabilitados.

---

## Lo que revisé y está bien

- `src/app/(dashboard)/layout.tsx:18` — Estructura de navegación principal y contención de layout responsivo bien estructurada con `Sidebar` y `Header`.
- `src/app/(portal)/layout.tsx:12` — Manejo limpio del viewport móvil y restricciones de escala para la interfaz del operador/chofer.
- `src/app/(demo)/liquidaciones/demo-data.ts:22` — Mock data de demostración correctamente tipada y aislada del entorno de producción.
- `src/app/globals.css:1` — Definición de variables CSS para temas claro/oscuro consistente con los tokens de Tailwind.

---

## Lo que NO alcancé a revisar

- Flujo de interacción modal de cancelación fiscal ante el SAT (`src/app/(dashboard)/liquidaciones/components/cancelar-modal.tsx`).
- Componentes de captura de tickets de gastos y carga de archivos XML/PDF en el portal de choferes (`src/app/(portal)/gastos/upload/`).
- Pruebas de accesibilidad con lector de pantalla (ARIA attributes) en las tablas de auditoría de diesel y casetas.