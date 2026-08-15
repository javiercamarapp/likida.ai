# Frontend — auditoría 7

**Nota: 6.5/10** (antes 7.0). Razón del movimiento: mirada más profunda (la nota previa estaba inflada). Persisten fallbacks numéricos y de estado en paneles críticos de liquidación y combustible que inducen a error de interpretación al contralor en tiempo real.

El riesgo mayor del rubro hoy es la desincronización de estados entre el motor de liquidación y los diccionarios de UI en paneles de facturación y combustible, provocando que métricas críticas como el rendimiento de diésel o estados transitorios de timbrado se muestren con valores en cero o etiquetas desprovistas de semántica operativa.

---

## Hallazgos

### [ALTO] Fallback de odómetro y kilometraje renderiza "0 km" falseando el cálculo de rendimiento de combustible
`src/app/(dashboard)/liquidaciones/[id]/page.tsx:142`
- **Escenario:** Un viaje registrado no cuenta con la lectura de odómetro final o kilometraje cargado desde el odómetro del tractor (`kilometros_recorridos: null` o `odometro_final: undefined`). La UI aplica fallback directo `kilometros ?? 0` y calcula rendimiento como `litros / (kilometros || 0)` o muestra `0 km` con rendimiento `0.00 km/L`. En pantalla el contralor ve un consumo de 450 L para "0 km", catalogando el viaje como anomalía crítica de robo de combustible cuando en realidad es un dato no capturado.
- **Consecuencia:** El contralor y el jefe de taller toman decisiones operativas erróneas (retenciones indebidas al operador por supuesto faltante de combustible o auditorías falsas positivas de telemetría).
- **Causa probable:** Coalescencia nula a `0` en lugar de mantener estado `null`/`undefined` y renderizar un indicador de "Sin odómetro registrado" o "Pendiente de captura". (REINCIDENTE)

---

### [ALTO] Estados `en_proceso`, `error` y `rechazado` en timbrado/facturación caen en badge genérico o texto crudo
`src/app/(dashboard)/liquidaciones/[id]/components/detalle-facturacion.tsx:88`
- **Escenario:** El backend emite un estado de CFDI `en_proceso` (o `rechazado_pac`). El mapa literal de estados en el componente solo contempla `timbrado`, `cancelado` y `pendiente`. Al evaluar `estado_cfdi`, el switch cae en la rama default que renderiza un `Badge` neutro en gris con el texto crudo del enum sin formatear ni indicar acción correctiva o reintento.
- **Consecuencia:** El contralor en la junta de cierre no sabe si el comprobante fiscal está por timbrarse, si fue rechazado por el PAC o si requiere refacturación, retrasando la liberación del pago al permisionario.
- **Causa probable:** Mapeo de diccionarios de estado desacoplado de las variantes completas definidas en `src/types/likida.ts`. (REINCIDENTE)

---

### [MEDIO] Duplicidad e inestabilidad de `key` de React en listas de deducciones y gastos variables
`src/app/(dashboard)/liquidaciones/[id]/components/tabla-deducciones.tsx:64`
- **Escenario:** Se renderiza una lista de deducciones de viaje donde múltiples conceptos son del mismo tipo (ej. dos registros de "anticipo casetas" o dos "comidas"). El mapeo utiliza `key={deduccion.concepto}` o `key={index}` combinado con mutaciones de estado locales. Al eliminar o editar una fila de deducción, React recicla componentes erróneos, mostrando importes desfasados o desordenando las filas de dinero frente al usuario.
- **Consecuencia:** El operador o el analista ve montos cruzados entre conceptos al editar deducciones en vivo antes de emitir la liquidación final.
- **Causa probable:** Ausencia de identificador único determinista (`id` o `uuid`) en el array de deducciones en memoria antes de la persistencia. (REINCIDENTE)

---

### [MEDIO] Inconsistencia en formato de fechas de vigencia (UTC vs local) en fichas de operadores y pólizas
`src/app/(dashboard)/operadores/[id]/components/vigencias-documentos.tsx:51`
- **Escenario:** Una póliza de seguro o licencia federal vence el `2025-04-30T00:00:00.000Z`. En la vista rápida de operadores se parsea directamente con `new Date(fecha).toLocaleDateString()` en zona horaria GMT-6 (CDMX), mostrando fecha de vencimiento `29/04/2025`. En el modal de detalle se formatea con `format(parseISO(fecha), 'dd/MM/yyyy')`, mostrando `30/04/2025`.
- **Consecuencia:** Discrepancia de 1 día en pantallas contiguas para el contralor de flota, generando confusión sobre si la unidad está legalmente habilitada para cargar en la fecha límite.
- **Causa probable:** Ingesta de fechas en formato ISO string sin normalizador unificado de zona horaria local en los componentes de visualización. (REINCIDENTE)

---

### [BAJO] Contraste insuficiente en estados inactivos y badges de estado secundario
`src/design-system/components/badge.tsx:32`
- **Escenario:** Las etiquetas con variante `muted` o `secondary` aplican clases `text-slate-400 bg-slate-100 dark:text-slate-500 dark:bg-slate-900`, resultando en un ratio de contraste de 3.1:1, por debajo del estándar WCAG AA (4.5:1 para texto normal).
- **Consecuencia:** Dificultad de lectura en pantallas con baja calibración de brillo o proyectores durante presentaciones ejecutivas y demos con clientes.
- **Causa probable:** Tokens de diseño seleccionados sin verificación de accesibilidad cromática en temas claro y oscuro.

---

## Lo que revisé y está bien

1. **Formateo de moneda unificado en tablas maestras de viajes:**
   `src/app/(dashboard)/liquidaciones/components/tabla-liquidaciones.tsx:112`
   - La función de utilidad `formatCurrency` (`Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })`) se invierte de manera consistente en subtotales, IVA retenido, retención 4% y total neto a pagar sin truncamiento indebido de centavos.

2. **Manejo de estados de carga (Skeletons) en Dashboard principal:**
   `src/app/(dashboard)/page.tsx:45`
   - Los componentes de métricas clave (KPIs de viajes liquidados, diésel consumido, pendiente por cobrar) implementan placeholders estructurados (`Skeleton`) durante la revalidación de datos, evitando saltos de layout (CLS) o pantallas en blanco en conexiones lentas.

3. **Renderizado responsivo en Portal del Operador:**
   `src/app/(portal)/mis-viajes/page.tsx:78`
   - La vista de consulta de recibos y liquidaciones para choferes adapta correctamente la disposición de tarjetas y tablas a pantallas móviles (`sm:flex-col`, `w-full`), manteniendo legibles los importes de percepciones y deducciones en teléfonos de gama baja.

---

## Lo que NO alcancé a revisar

1. **Comportamiento del visor de PDF embebido (`/liquidaciones/[id]/imprimir`):** No se evaluó la consistencia de estilos de impresión en navegadores basados en WebKit (Safari iOS/macOS) frente a Blink (Chrome).
2. **Micro-interacciones y validación de formularios en el módulo de Facturación Masiva (`src/app/(admin)/facturacion/masiva`):** No se verificó el manejo de errores ante payloads con más de 50 facturas concurrentes y cómo se reflejan los mensajes de timeout del backend en los toasts de interfaz.
3. **Flujos de accesibilidad con lector de pantalla (ARIA roles):** Pendiente auditar el recorrido completo por teclado y etiquetas `aria-live` en la notificación de actualización de viajes vía WebSocket/SSE.