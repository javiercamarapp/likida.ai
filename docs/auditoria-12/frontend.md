# Frontend — auditoría 12

**Nota: 4.0/10** (antes 4.5). Razón del movimiento: deuda que cobró factura y mirada más profunda sobre desincronización de contratos de datos, renderizado de estados fiscales no mapeados y mutaciones de estado con pérdida de foco en liquidación.

Riesgo mayor del rubro, hoy: que el contralor apruebe o rechace una liquidación viendo un rendimiento de combustible falso (0 km/L por odómetro nulo) o pierda datos de deducciones capturadas debido a un `key` inestable en la tabla editable.

---

## Hallazgos

### [ALTO] Fallback de odómetro nulo renderiza "0 km" y falsea el cálculo visual de rendimiento de combustible
`src/app/(dashboard)/liquidaciones/[id]/page.tsx:142`
- **Escenario:** Entra una liquidación con viaje sin captura de odómetro final (`odometro_inicial = 124500`, `odometro_final = null`, `combustible_litros = 320`). El renderizador aplica fallback `odometro_final ?? 0`, calculando distancia recorrida como `0 - 124500 = -124,500 km` o truncando a `0 km`, mostrando en pantalla `Distancia: 0 km | Rendimiento: 0.00 km/L` en lugar de marcar el dato como «Pendiente de lectura».
- **Consecuencia:** El contralor asume que hubo desvío total de combustible o anomalía operativa y frena el pago del operador, cuando en realidad el odómetro simplemente no fue capturado por el chofer en el cierre de viaje.
- **Causa probable:** Coalescencia nula prematura (`?? 0`) en variables de odometría en vez de validación explícita de nulidad previa al cálculo de rendimiento. (REINCIDENTE).

---

### [ALTO] Estados de timbrado (`error_sat`, `en_cola`, `rechazado`) caen en badge neutro con texto crudo sin acción de recuperación
`src/app/(dashboard)/liquidaciones/components/status-badge.tsx:48`
- **Escenario:** El backend devuelve una liquidación con `estado_timbrado: "error_sat"` y mensaje de error en metadata. El mapa de variantes solo define explícitamente `borrador`, `aprobada`, `timbrada` y `cancelada`. Al entrar `error_sat`, la rama `default` renderiza un badge gris plano `<Badge variant="secondary">{estado}</Badge>` mostrando el string crudo `"error_sat"`, omitiendo el botón de «Reintentar Timbrado» o el detalle del error del PAC.
- **Consecuencia:** En una demostración en vivo o en operación real, el contralor ve un código técnico crudo, no sabe si la factura existe ante el SAT ni tiene un mecanismo en pantalla para reintentar la emisión del CFDI de egreso/traslado.
- **Causa probable:** Tipado laxo en el componente (`estado: string`) sin exhaustividad sobre el union type `EstadoTimbrado` exportado en `src/types/likida.ts`. (REINCIDENTE).

---

### [MEDIO] Inestabilidad de `key` en lista de deducciones variables provoca pérdida de foco y parpadeo de importes
`src/app/(dashboard)/liquidaciones/[id]/components/tabla-deducciones.tsx:86`
- **Escenario:** El contralor edita una deducción por «Anticipo Diésel» de `$2,500.00 MXN` y agrega una nueva fila de «Comedor» (`$350.00 MXN`). La lista se mapea usando `key={`${index}-${item.concepto}`}`. Al cambiar el texto del concepto o reordenar por fecha, React destruye y recrea el nodo DOM del input, perdiendo el foco activo del cursor y desincronizando el estado local del input con el estado global de la liquidación.
- **Consecuencia:** El usuario pierde el foco al teclear cifras, duplica capturas por error de digitación o envía una deducción incompleta (ej. `$250` en vez de `$2,500`), alterando el monto neto a pagar al operador.
- **Causa probable:** Uso de índice y propiedad mutable (`concepto`) como clave de reconciliación en lugar de un identificador único persistente (`deduccion.id` o `crypto.randomUUID()`). (REINCIDENTE).

---

### [MEDIO] Desfase de zona horaria UTC vs Local en tablas de viajes muestra fechas desfasadas en horario nocturno
`src/app/(dashboard)/viajes/components/viajes-table.tsx:64`
- **Escenario:** Un viaje inicia el 14 de mayo a las 20:30 CST (CDMX, UTC-6), persistido en base de datos como `2025-05-15T02:30:00.000Z`. La tabla ejecuta `new Date(viaje.fecha_inicio).toLocaleDateString('es-MX', { timeZone: 'UTC' })` o formatea directo sin especificar timezone local, mostrando en pantalla `15/05/2025`.
- **Consecuencia:** La bitácora del contralor muestra viajes comenzados en un día en el que la unidad aún estaba en patio, provocando discrepancias con las cartas porte timbradas y las bitácoras de los operadores.
- **Causa probable:** Parseo directo de timestamps ISO sin forzar explícitamente la zona horaria operativa de la flota (`America/Mexico_City`). (REINCIDENTE).

---

### [MEDIO] Formateo inconsistente de moneda entre resumen de cabecera y desglose de conceptos
`src/app/(dashboard)/liquidaciones/[id]/components/resumen-totales.tsx:32`
- **Escenario:** La cabecera muestra el total neto con `Intl.NumberFormat` estándar (`$18,450.50 MXN`), mientras que la tabla de percepciones formatea montos mediante truncado manual `.toFixed(2)` sin separador de miles (`18450.50`). En números grandes (`$1,250,400.00` vs `1250400.00`), la lectura visual rápida se dificulta y en valores negativos se renderiza `$-450.00` en lugar de `-$450.00`.
- **Consecuencia:** Desconfianza inmediata del contralor en la precisión contable de la plataforma durante una presentación de venta.
- **Causa probable:** Falta de un helper unificado `formatCurrency()` reutilizado obligatoriamente en todo el Design System.

---

## Lo que revisé y está bien

- `src/app/(dashboard)/layout.tsx:18` — Estructura de navegación principal y verificación de sesión con redirección consistente al login.
- `src/app/(admin)/flotas/page.tsx:42` — Paginación controlada con estados de carga (`Skeleton`) correctamente acoplados al suspense boundary.
- `src/app/(portal)/operadores/[id]/page.tsx:55` — Vista responsiva en móvil del operador con contraste de texto adecuado (WCAG AA) y áreas de toque superiores a 44x44px.
- `src/design-system/components/button.tsx:12` — Manejo correcto del estado `disabled` y `aria-busy` cuando `isLoading={true}`, previniendo dobles envíos en clicks rápidos.

---

## Lo que NO alcancé a revisar

- `src/app/(demo)/...` — Vistas de demostración interactiva guiada para prospectos y su sincronización con datos ficticios.
- `src/app/(portal)/documentos/...` — Carga y previsualización de PDFs de CFDI/XML en dispositivos móviles de choferes.
- Manejo de accesibilidad por teclado en modales complejos de asignación de anticipos (`src/app/(dashboard)/anticipos/components/modal-asignacion.tsx`).