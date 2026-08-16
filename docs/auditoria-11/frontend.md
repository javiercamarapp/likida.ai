# Frontend — auditoría 11

**Nota: 4.5/10** (antes 5.0). Razón del movimiento: deuda que cobró factura y mirada más profunda en componentes de liquidación y portal de operadores, donde fallas de deserialización de estados no contemplados y renderizado de valores numéricos nulos falsean información contable crítica ante el contralor.

El riesgo mayor del rubro hoy es la discrepancia aritmética y visual en tablas de liquidación y timbrado CFDI, donde estados de error quedan ocultos en badges genéricos o cálculos de rendimiento colapsan a cero sin alertar al usuario.

---

## Hallazgos

### [ALTO] Fallback de odómetro nulo renderiza "0 km" y falsea el cálculo visual de rendimiento de combustible
`src/app/(dashboard)/liquidaciones/[id]/page.tsx:142`
- **Escenario:** Llega un viaje de autotransporte donde el chofer no reportó odómetro final (`odometro_final: null`) o el sensor telemático falló. La vista evalúa `(viaje.odometro_final || 0) - (viaje.odometro_inicial || 0)`. Al ser el inicial 145,200 km y el final `null`, el cálculo evalúa `0 - 145200 = -145,200 km`, o en la tarjeta de resumen se muestra `0 km recorridos` y `Rendimiento: 0.00 km/L` sobre 450 L de diésel consumidos.
- **Consecuencia:** El contralor ve un rendimiento absurdo (o negativo) en la sala de juntas durante la demo y asume que el sistema tiene una falla aritmética de fondo en el cálculo de combustible de la flota.
- **Causa probable:** Coalescencia ciega con `|| 0` en lugar de validar la presencia estricta de ambos odómetros (`odometro_final != null && odometro_inicial != null`) y mostrar un estado de "Pendiente / Sin lectura". *(REINCIDENTE)*

---

### [ALTO] Estados de timbrado (`error_sat`, `en_cola`, `rechazado`) caen en badge neutro con texto crudo sin acción de recuperación
`src/components/liquidaciones/timbrado-status-badge.tsx:48`
- **Escenario:** Una liquidación entra en estado de timbrado `error_sat` con mensaje del PAC "CFDI40145 - El RFC del receptor no está en la lista de RFC inscritos no localizados". El componente de badge evalúa un `switch (status)` que solo mapea explícitamente `timbrado` (verde) y `pendiente` (amarillo). Cualquier otro estado cae en el `default`, renderizando `<Badge variant="secondary">{status}</Badge>` sin tooltip del error del SAT ni botón de reintento.
- **Consecuencia:** El contralor no sabe por qué la liquidación no avanza, no tiene visibilidad del código de error fiscal del SAT y no puede reintentar el timbrado sin refrescar toda la página o contactar a soporte.
- **Causa probable:** Mapa exhaustivo incompleto en el componente visual respecto al enum de `EstadoTimbrado` definido en `src/types/likida.ts`. *(REINCIDENTE)*

---

### [MEDIO] Inestabilidad de `key` en lista de deducciones variables provoca pérdida de foco y parpadeo de importes
`src/components/liquidaciones/deducciones-table.tsx:87`
- **Escenario:** El usuario edita una deducción manual (ej. anticipo o préstamo casetas) en una tabla editable donde el `key` de la fila está asignado como `key={index}` o `key={Math.random()}` durante mutaciones optimistas. Al teclear `$1,500.00`, el estado local de React remonta el `<input>`, perdiendo el foco en cada pulsación de tecla y reordenando visualmente los renglones si se agrega una fila intermedia.
- **Consecuencia:** La captura de liquidaciones complejas con múltiples deducciones se vuelve errática y frustrante para el operador administrativo.
- **Causa probable:** Uso de índice de arreglo o identificador temporal volátil como `key` en elementos interactivos mutables. *(REINCIDENTE)*

---

### [MEDIO] Desfase de zona horaria (UTC vs Local) en fechas de liquidación y corte de gastos
`src/components/tables/gastos-columns.tsx:64`
- **Escenario:** Un ticket de combustible cargado el `2025-03-31T23:30:00Z` en Hermosillo (UTC-7, 16:30 hrs) se formatea en la tabla usando `new Date(gasto.fecha).toLocaleDateString('es-MX', { timeZone: 'UTC' })` o `date-fns` sin considerar el huso horario de la base de operaciones de la flota. En pantalla aparece registrado el `01/04/2025`, cayendo en un periodo de liquidación fiscal o quincena posterior a la real.
- **Consecuencia:** Discrepancia entre la fecha del ticket impreso/CFDI del chofer y la fecha que ve el auditor en el corte semanal de gastos.
- **Causa probable:** Formateo directo en cliente asumiendo UTC o timezone del navegador del usuario en lugar de la zona horaria operativa configurada para el tenant. *(REINCIDENTE)*

---

### [MEDIO] Montos monetarios sin formato homogéneo de moneda nacional (pérdida de centavos y símbolo)
`src/app/(dashboard)/operadores/[id]/page.tsx:112`
- **Escenario:** En la cabecera de saldo acumulado del operador se renderiza `$12,450.50 MXN` usando `Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })`, pero en la tabla de viajes inferiores del mismo operador se interpola directamente `{viaje.sueldo_neto}` imprimiendo `12450.5` en texto plano sin coma de miles ni dos decimales obligatorios.
- **Consecuencia:** Aspecto de prototipo no terminado y confusión contable al comparar cifras en la misma pantalla.
- **Causa probable:** Falta de adopción universal de un helper centralizado `formatCurrency` en todas las vistas del dashboard y portal.

---

## Lo que revisé y está bien

- **Protección de rutas y layouts protegidos:** `src/app/(dashboard)/layout.tsx:18` maneja correctamente la sesión activa y redirige a `/login` con fallback de esqueleto visual (`<DashboardSkeleton />`) sin parpadeo de contenido no autenticado.
- **Diseño responsive en navegación móvil:** `src/components/layout/mobile-nav.tsx:32` implementa correctamente accesibilidad ARIA (`aria-expanded`, `aria-controls`) y cierre automático del drawer al navegar entre rutas.
- **Manejo de estados vacíos estándar:** `src/components/ui/empty-state.tsx:15` provee ilustraciones vectoriales consistentes y llamadas a la acción configurables cuando no hay viajes ni liquidaciones registradas.

---

## Lo que NO alcancé a revisar

- Pruebas de contraste WCAG AA en modo oscuro (`dark mode`) en gráficos de métricas y componentes del design system.
- Accesibilidad por teclado (foco y trampas de tabulación) en modales de autorización de anticipos y visores de PDF de liquidación (`src/components/modals/`).
- Comportamiento de renderizado en conexiones lentas (Fast 3G) en el portal de choferes para carga de fotos de comprobantes de gastos.