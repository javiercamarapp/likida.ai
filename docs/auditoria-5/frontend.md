# Frontend — auditoría 5

**Nota: 7.5/10** (antes 8). Razón del movimiento: mirada más profunda en las pantallas nuevas de los seis agentes y despacho; la sincronización entre tipos de base de datos y mapas de etiquetas de UI tiene huecos donde estados válidos caen a valores crudos o desalineados con la lógica de negocio.

El riesgo mayor del rubro hoy es la presentación engañosa de estados operativos y fiscales frente al contralor (estados huérfanos que se pintan como cadenas crudas en minúsculas, badges de estatus desalineados con los enums reales y montos con fallback ambiguo que confunden cero pesos con dato no capturado).

---

## Hallazgos

### [ALTO] Estado `en_proceso` de facturación se renderiza como fallback crudo y sin badge semántico en la mesa de facturas
`src/app/(dashboard)/dashboard/agentes/facturas/facturas-contenido.tsx:142`
Escenario: El backend de timbrado o la cola automática marca una factura en estado `en_proceso` (definido en `EstadoFacturacion` dentro de `src/types/likida.ts`). El componente `BadgeEstadoFactura` sólo tiene ramas para `'timbrada'`, `'pendiente'`, `'error'` y `'cancelada'`. Al recibir `en_proceso`, cae al `default` que renderiza el texto `"en_proceso"` plano sin color ni clase semántica de carga/proceso.
Consecuencia: El contralor ve texto crudo de base de datos ("en_proceso") en la tabla principal de facturación, dando la impresión de un error de sistema o interfaz rota durante el timbrado.
Causa probable: El componente visual no sincronizó el mapa exhaustivo con el enum `EstadoFacturacion` actualizado en la migración de agentes.

---

### [ALTO] Fallback de kilometraje y odómetro muestra "0 km" en lugar de "Sin odómetro", falseando el rendimiento de combustible
`src/app/(dashboard)/dashboard/viajes/viaje-detalle-vista.tsx:218`
Escenario: Un viaje creado por despacho rápido o vía importador no tiene odómetro inicial (`odometro_inicio: null`) ni odómetro final (`odometro_fin: null`). La UI evalúa `(viaje.odometro_fin ?? 0) - (viaje.odometro_inicio ?? 0)` y pinta `0 km` y `Rendimiento: 0.0 km/L`.
Consecuencia: El contralor observa viajes concluidos con gasto de diésel pero con rendimiento en `0.0 km/L` y distancia recorrida de `0 km`, lo que dispara alertas falsas de robo de combustible o reporte fiscal inconsistente.
Causa probable: Coalescencia a cero (`?? 0`) en campos de odómetro en lugar de validar si la lectura existe antes de calcular la resta.

---

### [MEDIO] La vigencia de la licencia del operador se renderiza sin año en la ficha rápida
`src/app/(dashboard)/dashboard/operadores/operador-tarjeta.tsx:84`
Escenario: Un operador tiene licencia federal con vigencia `2027-03-15`. La función de formateo de fecha en la tarjeta ejecuta `toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })` omitiendo la propiedad `year`.
Consecuencia: El encargado de tráfico y el contralor ven "15 mar" pero no saben si la licencia venció en marzo de 2024, vence este año o en 2027, impidiendo la detección visual inmediata de licencias vencidas en el panel.
Causa probable: Formato de fecha abreviado configurado sin incluir año (REINCIDENTE).

---

### [MEDIO] Estatus de viaje "asignado" y "confirmado" se rotulan ambos como "En ruta" en el mapa de monitoreo
`src/app/(dashboard)/dashboard/mapa/mapa-contenido.tsx:136`
Escenario: Un viaje en estado `asignado` o `confirmado` (el chofer aún no sale de patio o apenas recibió la asignación por WhatsApp) entra al mapa interactivo. El switch de estados agrupa `['asignado', 'confirmado', 'en_transito']` bajo el rótulo único `"En ruta"` y le asigna el ícono de camión en movimiento.
Consecuencia: El monitorista y el contralor ven unidades marcadas como "En ruta" cuando el tractocamión sigue físicamente detenido en origen esperando carga o confirmación de anticipo.
Causa probable: Simplificación excesiva del mapeo de estados operativos en la vista satelital (REINCIDENTE).

---

### [MEDIO] Key inestable en tabla de partidas de peajes usando índice de arreglo en lista editable
`src/app/(dashboard)/dashboard/agentes/peajes/peajes-consolidado-vista.tsx:174`
Escenario: El usuario sube un archivo XML de peajes con 40 cruces de casetas y elimina la fila 3 usando la acción de descarte manual. La tabla utiliza `key={index}` en el elemento `<tr>`.
Consecuencia: React no destruye el nodo correspondiente sino que reasigna los estados locales (inputs de categoría y edición manual de caseta) a la fila siguiente, desfasando los importes visuales de las casetas respecto a su número de tag.
Causa probable: Ausencia de un identificador único sintético (`folio_evento` o hash de la transacción) en el mapeo del listado consolidado.

---

### [BAJO] Contraste insuficiente en textos de metadatos secundarios en tema claro
`src/app/globals.css:312`
Escenario: En modo tema claro (`[data-theme="claro"]`), las etiquetas de metadatos secundarios (`.texto-atenuado`) utilizan el color `var(--color-neutral-400)` (`#9CA3AF`) sobre fondo `var(--color-bg-superficie)` (`#FFFFFF`), arrojando un ratio de contraste de 2.8:1.
Consecuencia: Falla los lineamientos WCAG 2.1 AA (mínimo 4.5:1 para texto normal), dificultando la lectura de folios fiscales y horas de timbrado en pantallas de oficina con luz natural.
Causa probable: Asignación de token de color neutro pensado para tema oscuro reutilizado directamente en tema claro.

---

## Lo que revisé y está bien

- **Manejo de comprobantes sin monto en oficina:** `src/app/(dashboard)/dashboard/agentes/conductores/revision-contenido.tsx:188` — Ya no permite adjuntar comprobantes con monto `$0.00` ni lectura fallida; la acción muestra banner de alerta explícito y bloquea el botón de conciliación rápida hasta que el usuario digite el monto real.
- **Límites de paginación declarados honestamente:** `src/app/(dashboard)/dashboard/viajes/viajes-tabla.tsx:42` y `src/app/(dashboard)/dashboard/huerfanos/huerfanos-contenido.tsx:88` — La interfaz declara explícitamente en el pie de tabla el mensaje *"Mostrando los últimos 100 registros"* y no oculta la ventana fija de `getViajes`.
- **Formato monetario estandarizado:** `src/lib/formato.ts:18` — Toda la capa de presentación de dashboard y agentes utiliza `formatearDinero` / `formatearMoneda` respetando centavos, separadores de miles y moneda (`MXN`), sin interpolaciones manuales con `$`.
- **Modo de visualización por roles (aislamiento de dinero):** `src/lib/auth/visibilidad.ts:65` y `src/app/(dashboard)/dashboard/inicio/inicio-contenido.tsx:94` — El rol `encargado` (operación) tiene ocultas las tarjetas de balance financiero, utilidad neta y costos totales; no hay fuga de pesos en el DOM para usuarios de tráfico.
- **Estados vacíos y de error en agentes v2:** `src/app/(dashboard)/dashboard/agentes/cobranza/cobranza-vista.tsx:95` y `src/app/(dashboard)/dashboard/agentes/liquidacion/liquidacion-vista.tsx:112` — Manejan estados vacíos explícitos con ilustraciones contextuales y llamadas a la acción claras en lugar de tablas vacías o spinners infinitos.

---

## Lo que NO alcancé a revisar

- Pruebas visuales de regresión en dispositivos móviles reales para el flujo de Despacho rápido (`src/app/(dashboard)/dashboard/despacho/`).
- Consola de Javier (`src/app/(admin)/**`) en flujos de switches multi-tenant bajo conexiones de alta latencia (>1500ms).
- Comportamiento de zoom extremo y renderizado SVG del mapa de geometría horneada (`src/app/(dashboard)/dashboard/mapa/mexico-geo.ts`) en navegadores basados en WebKit antiguo.