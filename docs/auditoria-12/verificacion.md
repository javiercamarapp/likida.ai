# Verificación — auditoría 12

**3 VERIFICADOS** · **23 DESCARTADOS**

## Verificados
- [ALTO] tool-calling: El fallback de proveedor no persiste el modelo real en la contabilidad de costos (REINCIDENTE) — `src/lib/llm/openrouter.ts:118`
- [ALTO] tool-calling: Una respuesta truncada por `max_tokens` se trata como respuesta completa (REINCIDENTE) — `src/lib/llm/openrouter.ts:89`
- [ALTO] tool-calling: La deduplicación de herramientas se guía por el `id` de la llamada, no por el efecto ya ejecutado (REINCIDENTE) — `src/lib/llm/tool-executor.ts:47`

## Descartados
- [ALTO] frontend: Fallback de odómetro nulo renderiza "0 km" y falsea el cálculo visual de rendimiento de combustible — src/app/(dashboard)/liquidaciones/[id]/page.tsx:142 (DESCARTADO: referencia inválida)
- [ALTO] frontend: Estados de timbrado (`error_sat`, `en_cola`, `rechazado`) caen en badge neutro con texto crudo sin acción de recuperación — src/app/(dashboard)/liquidaciones/components/status-badge.tsx:48 (DESCARTADO: referencia inválida)
- [MEDIO] frontend: Inestabilidad de `key` en lista de deducciones variables provoca pérdida de foco y parpadeo de importes — src/app/(dashboard)/liquidaciones/[id]/components/tabla-deducciones.tsx:86 (DESCARTADO: referencia inválida)
- [MEDIO] frontend: Desfase de zona horaria UTC vs Local en tablas de viajes muestra fechas desfasadas en horario nocturno — src/app/(dashboard)/viajes/components/viajes-table.tsx:64 (DESCARTADO: referencia inválida)
- [MEDIO] frontend: Formateo inconsistente de moneda entre resumen de cabecera y desglose de conceptos — src/app/(dashboard)/liquidaciones/[id]/components/resumen-totales.tsx:32 (DESCARTADO: referencia inválida)
- [ALTO] agentico: Ciclo agéntico sin timeout deja el mutex tomado y el usuario nunca recibe su salida — REINCIDENTE — :0 (sin `archivo:línea`)
- [ALTO] agentico: Reintento de cierre de lote sin idempotencia duplica el efecto — REINCIDENTE — :0 (sin `archivo:línea`)
- [MEDIO] agentico: Prompt autoriza al modelo a narrar montos que deberían ser determinísticos — REINCIDENTE — :0 (sin `archivo:línea`)
- [MEDIO] agentico: Barrera de ráfaga envía confirmación parcial sin informar del mensaje fallido — REINCIDENTE — :0 (sin `archivo:línea`)
- [ALTO] seguridad: Ruta administrativa de exportación protegida solo por el matcher de middleware — REINCIDENTE — :0 (sin `archivo:línea`)
- [MEDIO] seguridad: URL firmada con TTL de 7 días para descargas de liquidación — REINCIDENTE — :0 (sin `archivo:línea`)
- [ALTO] fiscal: Acreditamiento de estímulo de casetas aplica el 50% sobre el total bruto con IVA incluido, generando doble beneficio fiscal indebido — src/lib/likida/liquidacion/deducibilidad.ts:142 (DESCARTADO: referencia inválida)
- [ALTO] fiscal: Retención de IVA del 4% aplicada a ciegas sin verificar la personalidad jurídica del receptor (PF vs. PM) — src/lib/likida/facturacion/retenciones.ts:58 (DESCARTADO: referencia inválida)
- [MEDIO] fiscal: Facilidad de comprobación del 8% (RFA) deduce gasto sin registrar la provisión de retención provisional obligatoria del 16% de ISR — src/lib/likida/liquidacion/deducibilidad.ts:215 (DESCARTADO: referencia inválida)
- [BAJO] fiscal: Leyenda fiscal de viáticos y comprobantes en PDF cita fundamento abrogado de RMF — src/lib/likida/cuadre/leyendas.ts:84 (DESCARTADO: referencia inválida)
- [ALTO] legal: REINCIDENTE: Sanitizador ciego a datos patrimoniales, números de tarjeta (PAN) y CLABEs bancarias hacia LLMs — :0 (sin `archivo:línea`)
- [ALTO] legal: REINCIDENTE: Inexistencia de mecanismo operativo de supresión, bloqueo y trámite de derechos ARCO — :0 (sin `archivo:línea`)
- [MEDIO] legal: REINCIDENTE: Aviso de privacidad omite decisiones automatizadas, perfilamiento de choferes y transferencias internacionales a proveedores de IA — :0 (sin `archivo:línea`)
- [MEDIO] legal: Exposición de fotos de comprobantes con datos de terceros en URLs firmadas sin expiración estricta ni disociación — :0 (sin `archivo:línea`)
- [ALTO] pruebas: Exportación de facturas a proveedor sin prueba ancla — REINCIDENTE (no re-verificado) — :0 (sin `archivo:línea`)
- [ALTO] pruebas: La prueba del pago de liquidación no valida la escritura, solo el estado visible — REINCIDENTE (no re-verificado) — :0 (sin `archivo:línea`)
- [MEDIO] pruebas: No hay caso borde para la regla de centro de costo 0075 — REINCIDENTE (no re-verificado) — :0 (sin `archivo:línea`)
- [ALTO] datos: REINCIDENTE (sin verificación propia) — El CFDI se asume único en la aplicación y la base no impone `unique` — :0 (sin `archivo:línea`)
