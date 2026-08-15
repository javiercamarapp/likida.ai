# Verificación — auditoría 11

**11 VERIFICADOS** · **19 DESCARTADOS**

## Verificados
- [ALTO] tool-calling: El fallback de proveedor no persiste el modelo real en la contabilidad de costos (REINCIDENTE) — `src/lib/llm/openrouter.ts:158`
- [ALTO] tool-calling: Una respuesta truncada por `max_tokens` se trata como respuesta completa (REINCIDE) — `src/lib/llm/openrouter.ts:123`
- [ALTO] tool-calling: La deduplicación de herramientas se guía por el `id` de la llamada, no por el efecto ya ejecutado (REINCIDE) — `src/lib/llm/tool-executor.ts:71`
- [ALTO] fiscal: Acreditamiento de estímulo de casetas aplica el 50% sobre el total bruto con IVA incluido, generando doble beneficio fiscal indebido — `src/lib/likida/cuadre/engine.ts:142`
- [ALTO] fiscal: Retención de IVA del 4% aplicada a ciegas sin verificar la combinación de personalidad jurídica (PF / PM) — `src/lib/likida/intake/cfdi.ts:88`
- [BAJO] fiscal: Leyenda fiscal de viáticos en PDF cita artículo abrogado / referencia jurídica desactualizada — `src/lib/likida/cuadre/leyendas.ts:45`
- [ALTO] legal: Sanitizador ciego a datos patrimoniales, CLABEs bancarias y tarjetas en prompts de extracción — `src/lib/likida/intake/sanitizar.ts:28`
- [ALTO] legal: Inexistencia de mecanismo operativo de trámite, supresión y bloqueo para derechos ARCO o revocación — `src/lib/likida/privacidad.ts:65`
- [MEDIO] legal: Falta de cláusula y consentimiento para decisiones automatizadas y perfilamiento en aviso de privacidad — `src/lib/likida/privacidad.ts:32`
- [ALTO] operabilidad: Sentry instalado pero sin cableado a una alerta viva — REINCIDENTE — `src/instrumentation.ts:21`
- [MEDIO] operabilidad: Variables vacías en `.env.example`: el sistema arranca igual y se degrada tarde — REINCIDENTE — `.env.example:15`

## Descartados
- [ALTO] frontend: Fallback de odómetro nulo renderiza "0 km" y falsea el cálculo visual de rendimiento de combustible — src/app/(dashboard)/liquidaciones/[id]/page.tsx:142 (DESCARTADO: referencia inválida)
- [ALTO] frontend: Estados de timbrado (`error_sat`, `en_cola`, `rechazado`) caen en badge neutro con texto crudo sin acción de recuperación — src/components/liquidaciones/timbrado-status-badge.tsx:48 (DESCARTADO: referencia inválida)
- [MEDIO] frontend: Inestabilidad de `key` en lista de deducciones variables provoca pérdida de foco y parpadeo de importes — src/components/liquidaciones/deducciones-table.tsx:87 (DESCARTADO: referencia inválida)
- [MEDIO] frontend: Desfase de zona horaria (UTC vs Local) en fechas de liquidación y corte de gastos — src/components/tables/gastos-columns.tsx:64 (DESCARTADO: referencia inválida)
- [MEDIO] frontend: Montos monetarios sin formato homogéneo de moneda nacional (pérdida de centavos y símbolo) — src/app/(dashboard)/operadores/[id]/page.tsx:112 (DESCARTADO: referencia inválida)
- [ALTO] agentico: Ciclo agéntico sin timeout deja el mutex tomado y el usuario nunca recibe su salida — REINCIDENTE — conv.ts:140 (DESCARTADO: referencia inválida)
- [ALTO] agentico: Reintento de cierre de lote sin idempotencia duplica el efecto — REINCIDENTE — guardia.ts:92 (DESCARTADO: referencia inválida)
- [MEDIO] agentico: Prompt autoriza al modelo a narrar montos que deberían ser determinísticos — REINCIDENTE — prompts.ts:36 (DESCARTADO: referencia inválida)
- [MEDIO] agentico: Barrera de ráfaga envía confirmación parcial sin informar del mensaje fallido — REINCIDENTE — conv.ts:205 (DESCARTADO: referencia inválida)
- [ALTO] seguridad: Ruta administrativa de exportación protegida solo por el matcher de middleware — middleware.ts:12 (DESCARTADO: referencia inválida)
- [MEDIO] seguridad: URL firmada con TTL de 7 días para descargas de liquidación — src/lib/auth/signed-url.ts:34 (DESCARTADO: referencia inválida)
- [MEDIO] fiscal: Facilidad de comprobación del 8% (RFA) deduce gasto sin registrar la retención provisional obligatoria de ISR del 16% — src/lib/likida/liquidacion/deducibilidad.ts:114 (DESCARTADO: referencia inválida)
- [ALTO] pruebas: La exportación de facturas a proveedor no está anclada: una regresión en la cifra contable llega a la sala de venta sin que la suite se entere — :0 (sin `archivo:línea`)
- [ALTO] pruebas: La prueba del pago de liquidación no valida la escritura, solo el estado visible: pasa si el proveedor devuelve hora/fecha distinta — 00:00:0 (DESCARTADO: referencia inválida)
- [MEDIO] pruebas: No hay caso borde para centro de costo: si se revierte el arreglo de la regla 0075, la suite no lo nota — :0 (sin `archivo:línea`)
- [MEDIO] pruebas: La CI no garantiza “todo push” por la configuración — al menos no se puede probar que se resuelva el estado — :0 (sin `archivo:línea`)
- [ALTO] operabilidad: Log de fallo de WhatsApp sin identificadores de liquidación ni de flota — REINCIDENTE — src/lib/whatsapp/client.ts:44 (DESCARTADO: referencia inválida)
- [ALTO] operabilidad: Exportar facturas de proveedor responde 200 con `{ ok:false }` — REINCIDENTE — src/app/api/exportar/facturas/route.ts:57 (DESCARTADO: referencia inválida)
- [ALTO] datos: REINCIDENTE — El CFDI se asume único en la aplicación y la base no impone unique — :0 (sin `archivo:línea`)
