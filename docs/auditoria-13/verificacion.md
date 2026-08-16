# Verificación — auditoría 13

**7 VERIFICADOS** · **17 DESCARTADOS**

## Verificados
- [BAJO] fiscal: Leyenda fiscal en PDF de liquidación cita artículo abrogado para estímulo de diésel — `src/lib/likida/cuadre/leyendas.ts:58`
- [ALTO] legal: REINCIDENTE: Sanitizador ciego a datos patrimoniales, números de tarjeta (PAN) y CLABEs bancarias hacia LLMs externos — `src/lib/likida/intake/sanitizar.ts:24`
- [ALTO] legal: REINCIDENTE: Inexistencia de mecanismo operativo de supresión, bloqueo y trámite de derechos ARCO — `src/lib/likida/privacidad.ts:52`
- [MEDIO] legal: REINCIDENTE: Aviso de privacidad omite decisiones automatizadas, perfilamiento de choferes y transferencias internacionales a proveedores de IA — `src/lib/likida/privacidad.ts:18`
- [MEDIO] rendimiento: `costos.ts` usa modelo caro para tarea que un modelo barato resolvería igual — `src/lib/likida/costos.ts:34`
- [MEDIO] rendimiento: `openrouter.ts` no suma timeouts de los eslabones: un timeout de 45s por eslabón permite 135s de espera real — `src/lib/llm/openrouter.ts:22`
- [BAJO] rendimiento: Tokens de contexto incluyen campos que el modelo no usa en `presupuesto.ts` — `src/lib/likida/presupuesto.ts:98`

## Descartados
- [ALTO] frontend: Fallback de odómetro nulo renderiza "0 km" y falsea el cálculo visual de rendimiento de combustible — src/app/(dashboard)/liquidaciones/[id]/page.tsx:142 (DESCARTADO: referencia inválida)
- [ALTO] frontend: Estados de timbrado (`error_sat`, `en_cola`, `rechazado`) caen en badge neutro con texto crudo sin acción de recuperación — src/app/(dashboard)/liquidaciones/components/timbrado-badge.tsx:48 (DESCARTADO: referencia inválida)
- [MEDIO] frontend: Inestabilidad de `key` en lista de deducciones variables provoca pérdida de foco y salto de importes al editar — src/app/(dashboard)/liquidaciones/[id]/deducciones-form.tsx:89 (DESCARTADO: referencia inválida)
- [MEDIO] frontend: Desfase de zona horaria UTC vs Local formatea viajes en fechas de liquidación incorrectas — src/app/(portal)/chofer/viajes/page.tsx:74 (DESCARTADO: referencia inválida)
- [MEDIO] frontend: Inconsistencia en formateador de moneda entre resumen global y detalle de factura — src/app/(dashboard)/metricas/page.tsx:112 (DESCARTADO: referencia inválida)
- [BAJO] tool-calling: La etiqueta de modelo de un fallo en el camino de fallback de `generateStructured` apunta al primario, no al fallback que de verdad contestó — :0 (sin `archivo:línea`)
- [ALTO] fiscal: Acreditamiento de estímulo de casetas aplica el 50% sobre el total bruto con IVA incluido, generando doble beneficio fiscal indebido — src/lib/likida/liquidacion/deducibilidad.ts:182 (DESCARTADO: referencia inválida)
- [ALTO] fiscal: Retención de IVA del 4% aplicada a ciegas sin verificar la personalidad jurídica del receptor (PF vs. PM) — src/lib/likida/facturacion/impuestos.ts:94 (DESCARTADO: referencia inválida)
- [MEDIO] fiscal: Facilidad de comprobación del 8% (RFA) deduce gasto sin registrar la provisión de retención provisional obligatoria del 16% de ISR — src/lib/likida/liquidacion/deducibilidad.ts:245 (DESCARTADO: referencia inválida)
- [MEDIO] legal: Exposición de datos de terceros y retención indefinida de comprobantes en storage sin cifrado a nivel de aplicación — src/lib/likida/intake/storage.ts:35 (DESCARTADO: referencia inválida)
- [ALTO] pruebas: Exportación de facturas de proveedor sin prueba ancla — REINCIDENTE — lib/factura-export.ts:14 (DESCARTADO: referencia inválida)
- [ALTO] pruebas: La prueba del pago de liquidación valida solo el estado visible, no la escritura — index.ts:76 (DESCARTADO: referencia inválida)
- [ALTO] pruebas: No hay caso borde para la regla de centro de costo 0075 — REINCIDENTE — supabase/__tests__/centro-costo.test.ts:9 (DESCARTADO: referencia inválida)
- [ALTO] pruebas: CI no corre; las pruebas nunca son ejecutadas en el flujo de integración real — :0 (sin `archivo:línea`)
- [MEDIO] pruebas: Prueba de la fecha de pago (`paidAt` que se fija) no existe — el dashboard muestra la fecha mal — pagos.ts:135 (DESCARTADO: referencia inválida)
- [ALTO] rendimiento: Consulta dentro de bucle en `repo.ts` multiplica lecturas por N viajes — src/lib/db/repo.ts:87 (DESCARTADO: referencia inválida)
- [ALTO] rendimiento: Imagen de OCR se envía sin redimensionar: 4 MB de evidencia → 8,200 tokens por imagen — src/lib/queue/intake/ocr.ts:67 (DESCARTADO: referencia inválida)
