# Verificación — auditoría 8

**12 VERIFICADOS** · **21 DESCARTADOS**

## Verificados
- [MEDIO] agentico: Prompt autoriza al modelo a narrar montos que deberían ser determinísticos — `src/lib/agents/prompts.ts:36`
- [ALTO] fiscal: Retención de IVA del 4% aplicada de forma fija sin validar personalidad jurídica del receptor (REINCIDENTE) — `src/lib/likida/intake/cfdi.ts:88`
- [BAJO] fiscal: Leyenda de deducibilidad en viáticos omite fundamentación de RMF o LISR — `src/lib/likida/cuadre/leyendas.ts:45`
- [ALTO] legal: Sanitizador ciego a datos patrimoniales y bancarios en prompts de auditoría y extracción — `src/lib/likida/intake/sanitizar.ts:28`
- [ALTO] legal: Inexistencia de mecanismo automatizado para trámite de derechos ARCO y revocación vía WhatsApp — `src/lib/likida/privacidad.ts:65`
- [MEDIO] legal: Falta de leyenda y consentimiento para toma de decisiones automatizadas en el aviso de privacidad — `src/lib/likida/privacidad.ts:32`
- [ALTO] operabilidad: Log de fallo de WhatsApp no identifica la liquidación ni la flota afectada — `src/lib/logger.ts:38`
- [ALTO] operabilidad: Sentry declarado, pero el `fetazo la pieza de instrumentación no está conectado a ninguna alerta viva — `src/instrumentation.ts:14`
- [MEDIO] operabilidad: `.env.example` deja variables vacías que el sistema necesita para arrancar mal — `.env.example:6`
- [MEDIO] rendimiento: Modelo caro para tareas administrativas simples — `src/lib/llm/openrouter.ts:53`
- [ALTO] datos: No hay validación de estados en `liquidaciones.estado` — `src/types/likida.ts:141`
- [MEDIO] datos: RLS de `pagos` no bloquea `authenticated` fuera de la política — `supabase/verificaciones.sql:102`

## Descartados
- [ALTO] frontend: Fallback de odómetro nulo renderiza "0 km" y falsea el cálculo visual de rendimiento de combustible — src/app/(dashboard)/combustible/page.tsx:142 (DESCARTADO: referencia inválida)
- [ALTO] frontend: Estados de timbrado (`error_sat`, `en_cola`, `rechazado`) caen en badge neutro con texto crudo sin acción de recuperación — src/app/(dashboard)/liquidaciones/[id]/page.tsx:88 (DESCARTADO: referencia inválida)
- [MEDIO] frontend: Inestabilidad de `key` en lista de deducciones variables provoca pérdida de foco y parpadeo de importes — src/components/liquidaciones/tabla-deducciones.tsx:64 (DESCARTADO: referencia inválida)
- [MEDIO] frontend: Desfase de zona horaria (UTC vs Local) desplaza la fecha de expedición de Carta Porte al día anterior — src/lib/formatters.ts:45 (DESCARTADO: referencia inválida)
- [MEDIO] frontend: Formateo inconsistente de moneda entre resumen de cabecera y tabla de desglose de viaje — src/components/liquidaciones/resumen-financiero.tsx:32 (DESCARTADO: referencia inválida)
- [ALTO] agentico: Ciclo agéntico sin timeout deja el mutex tomado y el usuario nunca recibe su salida — src/lib/agents/run.ts:143 (DESCARTADO: referencia inválida)
- [ALTO] agentico: Reintento de cierre de lote sin idempotencia duplica el efecto — cuadre/guardia.ts:88 (DESCARTADO: referencia inválida)
- [MEDIO] agentico: Barrera de ráfaga envía confirmación parcial sin informar del mensaje fallido — conv.ts:22 (DESCARTADO: referencia inválida)
- [ALTO] seguridad: Ruta administrativa de exportación protegida solo por el matcher de middleware — middleware.ts:7 (DESCARTADO: referencia inválida)
- [MEDIO] seguridad: URL firmada con TTL de 7 días para descargas de liquidación — src/lib/files.ts:42 (DESCARTADO: referencia inválida)
- [MEDIO] seguridad: CVE en Next.js con camino real de explotación vía `next/image` — :0 (sin `archivo:línea`)
- [ALTO] fiscal: Acreditamiento de casetas aplica el 50% sobre el total bruto sin descontar IVA acreditable (REINCIDENTE) — src/lib/likida/liquidacion/deducibilidad.ts:142 (DESCARTADO: referencia inválida)
- [MEDIO] fiscal: Facilidad de comprobación del 8% omite retención de ISR provisional del 16% (REINCIDENTE) — src/lib/likida/liquidacion/deducibilidad.ts:215 (DESCARTADO: referencia inválida)
- [ALTO] pruebas: `api/export/facturas-proveedor` reincide sin arnés — una regresión en la columna de dinero sale a producción — :0 (sin `archivo:línea`)
- [ALTO] operabilidad: Error que no es error: exportar facturas-proveedor responde 200 `{ ok: false }` — src/app/api/admin/exportar-facturas/route.ts:19 (DESCARTADO: referencia inválida)
- [ALTO] rendimiento: N+1 en consultas de movimientos por viaje — src/lib/repo.ts:203 (DESCARTADO: referencia inválida)
- [ALTO] rendimiento: Imagen de comprobante se envía sin redimensionar a OCR — src/lib/intake/ocr.ts:76 (DESCARTADO: referencia inválida)
- [MEDIO] rendimiento: Timeout individual de cola no considera la suma de eslabones — src/lib/queue/consumer.ts:41 (DESCARTADO: referencia inválida)
- [ALTO] datos: La unicidad de CFDI se asume en la app y la base la permite duplicar — supabase/migrations/20240601_embudo.sql:88 (DESCARTADO: referencia inválida)
- [ALTO] datos: No hay restricción `CHECK` de no negatividad en columnas monetarias — supabase/migrations/20240303_pagos.sql:24 (DESCARTADO: referencia inválida)
- [MEDIO] datos: Migraciones sin “down” real / reversibilidad — supabase/migrations/20240606_renumber_deductible.sql:14 (DESCARTADO: referencia inválida)
