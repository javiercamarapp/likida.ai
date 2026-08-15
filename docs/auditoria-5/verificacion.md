# Verificación — auditoría 5

**8 VERIFICADOS** · **31 DESCARTADOS**

## Verificados
- [BAJO] frontend: Contraste insuficiente en textos de metadatos secundarios en tema claro — `src/app/globals.css:312`
- [ALTO] fiscal: Acreditamiento de casetas (LIF Art. 16 fracc. V / LIF 2026 20-A) calcula el 50% sobre el total bruto incluyendo IVA acreditable — `src/lib/likida/peajes/desglose.ts:68`
- [MEDIO] fiscal: Facilidad del 8% de comprobación (RFA Regla 2.3) clasifica gastos menores sin retención de ISR provisional del 16% — `src/lib/likida/liquidacion/deducibilidad.ts:89`
- [BAJO] fiscal: Leyenda de deducibilidad de viáticos cita LISR Art. 28 fracc. V sin especificar el radio de 50 km del domicilio fiscal — `src/lib/likida/cuadre/leyendas.ts:47`
- [ALTO] legal: Despacho por WhatsApp transfiere PII a LLMs antes de recabar consentimiento o entregar aviso simplificado — `src/lib/likida/processor.ts:412`
- [ALTO] legal: El chat analista (`analista.ts`) envía bases de datos completas con nombres, saldos y teléfonos de choferes a proveedores LLM externos sin sanitización previa — `src/lib/agents/analista.ts:148`
- [MEDIO] legal: Inexistencia de mecanismo operativo para revocación de consentimiento y supresión de datos (Derechos ARCO) — `src/lib/likida/privacidad.ts:92`
- [BAJO] legal: Exportación de facturas de proveedores (`api/export/facturas-proveedor`) incluye RFCs de personas físicas sin registro de auditoría de descarga — `src/app/api/export/facturas-proveedor/route.ts:64`

## Descartados
- [ALTO] frontend: Estado `en_proceso` de facturación se renderiza como fallback crudo y sin badge semántico en la mesa de facturas — src/app/(dashboard)/dashboard/agentes/facturas/facturas-contenido.tsx:142 (DESCARTADO: referencia inválida)
- [ALTO] frontend: Fallback de kilometraje y odómetro muestra "0 km" en lugar de "Sin odómetro", falseando el rendimiento de combustible — src/app/(dashboard)/dashboard/viajes/viaje-detalle-vista.tsx:218 (DESCARTADO: referencia inválida)
- [MEDIO] frontend: La vigencia de la licencia del operador se renderiza sin año en la ficha rápida — src/app/(dashboard)/dashboard/operadores/operador-tarjeta.tsx:84 (DESCARTADO: referencia inválida)
- [MEDIO] frontend: Estatus de viaje "asignado" y "confirmado" se rotulan ambos como "En ruta" en el mapa de monitoreo — src/app/(dashboard)/dashboard/mapa/mapa-contenido.tsx:136 (DESCARTADO: referencia inválida)
- [MEDIO] frontend: Key inestable en tabla de partidas de peajes usando índice de arreglo en lista editable — src/app/(dashboard)/dashboard/agentes/peajes/peajes-consolidado-vista.tsx:174 (DESCARTADO: referencia inválida)
- [ALTO] backend: REINCIDENTE — El dedup de la importación es memoria viva de un solo proceso; dos submits a la vez siguen duplicando — :0 (sin `archivo:línea`)
- [MEDIO] backend: REINCIDENTE — La rama “oficina” del `processor` traga la caída de la base y el webhook responde 200 sin que nadie lo sepa — processor.ts:1545 (DESCARTADO: referencia inválida)
- [ALTO] agentico: Un error a mitad de la emisión de mensaje duplica el aviso sin persistir el estado de “avisado” — :0 (sin `archivo:línea`)
- [MEDIO] agentico: La secuencia de tools del chat persiste historial, pero si el streaming muere a mitad, el usuario no ve un cierre parcial — :0 (sin `archivo:línea`)
- [BAJO] agentico: El prompt del agente analista autoriza narrar lo que debería ser determinístico — :0 (sin `archivo:línea`)
- [ALTO] tool-calling: Respuesta truncada por `finish_reason: "length"` se trata como respuesta completa — :0 (sin `archivo:línea`)
- [MEDIO] tool-calling: El camino de fallback de proveedores no tiene prueba unitaria de atribución de costo al proveedor efectivo — :0 (sin `archivo:línea`)
- [BAJO] tool-calling: La atribución de un tool call al turno depende de la order de llegada (`dedupe` por llamada completa, no por efecto) — :0 (sin `archivo:línea`)
- [ALTO] fiscal: Retención de IVA del 4% aplicada de forma fija sin validar el tipo de persona del receptor (Art. 1-A fracc. II inc. c LIVA) — src/lib/likida/facturacion/impuestos.ts:42 (DESCARTADO: referencia inválida)
- [MEDIO] legal: Ranking y perfilamiento de operadores en el Agente de Conductores sin notificación de tratamiento automatizado — src/app/dashboard/agentes/conductores/page.tsx:115 (DESCARTADO: referencia inválida)
- [ALTO] arquitectura: La FK compuesta de la 0075 dejó DOS relaciones en 5 pares de tablas; la verdad de la relación ya no vive en un solo lugar — :0 (sin `archivo:línea`)
- [MEDIO] arquitectura: `processor.ts` es un monolito de ~2,300 líneas y el cableado de negocio nuevo se sigue incrustando en la capa de WhatsApp — processor.ts:1545 (DESCARTADO: referencia inválida)
- [MEDIO] arquitectura: El cron unificado `api/cron/escalar` mezcla dos responsabilidades: escalación y cobranza global — :0 (sin `archivo:línea`)
- [ALTO] pruebas: `api/export/facturas-proveedor` está descubierto de pruebas: una regresión en la columna de dinero no la voltea ninguna — :0 (sin `archivo:línea`)
- [MEDIO] pruebas: La prueba de `cobranza_pura` valida que el motor regrese el mismo valor que la prueba fabricó — no el valor que debe regresar ningún nuevo end — :0 (sin `archivo:línea`)
- [MEDIO] pruebas: `pruebas-manuales/*.prueba.ts` no está en el suite y ninguna puerta en CI evita que una regresión de pago sobre viva en verde — :0 (sin `archivo:línea`)
- [MEDIO] pruebas: La prueba del guardián de embeds está anclada pero no cubre un sector de la barajada nueva de hoy (export y cron) — :0 (sin `archivo:línea`)
- [BAJO] pruebas: La línea base de esta ronda no cierra con la cierre de la auditoría anterior (271 archivos/3,232 pruebas vs. 261 archivos/3,161 pruebas) — :0 (sin `archivo:línea`)
- [ALTO] operabilidad: El 500 del cron está, pero nadie lo ve de noche — no hay alerta conectada a un canal operativo — :0 (sin `archivo:línea`)
- [ALTO] operabilidad: Sentry está “instalado” pero no llega a ninguna persona — la lección del incidente de ~9 días no tiene cierre estructural — :0 (sin `archivo:línea`)
- [ALTO] operabilidad: El log de fallo de WhatsApp no dice “cuál liquidación” ni “de qué flota” — src/lib/processor.ts:230 (DESCARTADO: referencia inválida)
- [ALTO] operabilidad: Error que no es error: export de facturas-proveedor responde 200 con `{ ok:false }` — :0 (sin `archivo:línea`)
- [MEDIO] operabilidad: DX: un setup limpio no ejercita “el modo más parecido a producción” y el seed no valida migraciones — :0 (sin `archivo:línea`)
- [ALTO] datos: La 0091 quedó sin candado de signo: un monto negativo entra a la base y el contralor lo ve como deuda a favor — :0 (sin `archivo:línea`)
- [ALTO] datos: La migración 0089 modela cobranza sin llave natural hacia la factura; una fila puede quedar huérfana — :0 (sin `archivo:línea`)
- [MEDIO] datos: El historial del agente (0088) no tiene restricción de unicidad de turno por sesión / tenant — :0 (sin `archivo:línea`)
