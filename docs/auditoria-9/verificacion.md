# Verificación — auditoría 9

**18 VERIFICADOS** · **23 DESCARTADOS**

## Verificados
- [ALTO] agentico: Ciclo agéntico sin timeout deja el mutex tomado y el usuario nunca recibe su salida — REINCIDENTE — `src/lib/likida/conv.ts:140`
- [ALTO] agentico: Reintento de cierre de lote sin idempotencia duplica el efecto — REINCIDENTE — `src/lib/likida/cuadre/guardia.ts:92`
- [MEDIO] agentico: Prompt autoriza al modelo a narrar montos que deberían ser determinísticos — REINCIDENTE — `src/lib/agents/prompts.ts:36`
- [MEDIO] agentico: Barrera de ráfaga envía confirmación parcial sin informar del mensaje fallido — REINCIDENTE — `src/lib/likida/conv.ts:205`
- [ALTO] tool-calling: El fallback de proveedor no persiste el modelo real en la contabilidad de costos — `src/lib/llm/openrouter.ts:104`
- [ALTO] tool-calling: Una respuesta truncada por `max_tokens` se trata como respuesta completa — `src/lib/llm/openrouter.ts:158`
- [ALTO] tool-calling: La deduplicación de herramientas se guía por el `id` de la llamada y no por el efecto ejecutado — `src/lib/llm/tool-executor.ts:71`
- [ALTO] fiscal: Acreditamiento de casetas aplica el 50% sobre el total bruto sin descontar IVA acreditable (REINCIDENTE) — `src/lib/likida/cuadre/engine.ts:142`
- [ALTO] fiscal: Retención de IVA del 4% aplicada de forma fija sin validar personalidad jurídica del emisor y receptor (REINCIDENTE) — `src/lib/likida/intake/cfdi.ts:88`
- [BAJO] fiscal: Leyenda fiscal de viáticos en PDF cita artículo derogado / incompleto — `src/lib/likida/cuadre/leyendas.ts:45`
- [ALTO] legal: Sanitizador ciego a datos patrimoniales, CLABEs y tarjetas en prompts de extracción — `src/lib/likida/intake/sanitizar.ts:28`
- [ALTO] legal: Inexistencia de mecanismo operativo de trámite y bloqueo por derechos ARCO o revocación — `src/lib/likida/privacidad.ts:65`
- [MEDIO] legal: Falta de cláusula de decisiones automatizadas y perfilamiento en aviso de privacidad — `src/lib/likida/privacidad.ts:32`
- [ALTO] operabilidad: Log de fallo de WhatsApp sin identificadores de liquidación ni de flota — `src/lib/logger.ts:18`
- [ALTO] operabilidad: Sentry declarado, pero sin ninguna pieza con cableado a alerta viva — `instrumentation.ts:26`
- [MEDIO] operabilidad: `.env.example`: variables vacías que el sistema arranca y se degrada tarde — `.env.example:3`
- [ALTO] rendimiento: N+1 en consultas de movimientos por viaje — `src/lib/likida/repo.ts:87`
- [MEDIO] rendimiento: Modelo caro para tareas administrativas simples — `src/lib/llm/openrouter.ts:112`

## Descartados
- [ALTO] frontend: Fallback de odómetro nulo renderiza "0 km" y falsea el cálculo visual de rendimiento de combustible — src/app/(dashboard)/liquidaciones/[id]/page.tsx:142 (DESCARTADO: referencia inválida)
- [ALTO] frontend: Estados de timbrado (`error_sat`, `en_cola`, `rechazado`) caen en badge neutro con texto crudo sin acción de recuperación — src/app/(dashboard)/liquidaciones/components/timbrado-status-badge.tsx:28 (DESCARTADO: referencia inválida)
- [MEDIO] frontend: Inestabilidad de `key` en lista de deducciones variables provoca pérdida de foco y parpadeo de importes — src/app/(dashboard)/liquidaciones/[id]/components/deducciones-table.tsx:64 (DESCARTADO: referencia inválida)
- [MEDIO] frontend: Desfase de zona horaria (UTC vs Local) en visualización de fechas de liquidación y emisión — src/app/(dashboard)/liquidaciones/page.tsx:88 (DESCARTADO: referencia inválida)
- [MEDIO] frontend: Formateador de moneda inconsistente entre vistas de resumen y detalle — src/app/(dashboard)/liquidaciones/page.tsx:112 (DESCARTADO: referencia inválida)
- [BAJO] frontend: Contraste insuficiente en badges de estado "Borrador" y textos de ayuda en modo claro — design-system/src/components/badge.tsx:42 (DESCARTADO: referencia inválida)
- [ALTO] seguridad: Ruta administrativa de exportación protegida solo por el matcher de middleware — src/middleware.ts:18 (DESCARTADO: referencia inválida)
- [MEDIO] seguridad: URL firmada con TTL de 7 días para descargas de liquidación — src/lib/storage.ts:88 (DESCARTADO: referencia inválida)
- [MEDIO] fiscal: Facilidad de comprobación del 8% omite retención de ISR provisional del 16% (REINCIDENTE) — src/lib/likida/liquidacion/deducibilidad.ts:115 (DESCARTADO: referencia inválida)
- [ALTO] arquitectura: Deuda estructural del "procesador central" sigue sin reconfirmar — :0 (sin `archivo:línea`)
- [MEDIO] arquitectura: La advertencia previa de «un literal que dice lo mismo y ya divergió» no se pudo confirmar esta ronda — :0 (sin `archivo:línea`)
- [BAJO] arquitectura: Sin inventario verificado de las fronteras de acceso a datos — :0 (sin `archivo:línea`)
- [ALTO] pruebas: `export/facturas-proveedor` sigue sin arnés: una regresión en la cifra contable llega a la sala de venta sin que la suite la atrape — api/export/facturas-proveedor.ts:10 (DESCARTADO: referencia inválida)
- [ALTO] pruebas: Sin oráculo para la escritura: la prueba del pago de liquidación pasa si el proveedor se cargo de la fecha/hora — tests/liquidacion.pago.test.ts:23 (DESCARTADO: referencia inválida)
- [MEDIO] pruebas: La suite de pruebas no contiene un escenario borde de centro de costo; si se revierte el arreglo de 0075 el error vuelve a estar en producción — src/liquidaciones/nominales.test.ts:118 (DESCARTADO: referencia inválida)
- [ALTO] operabilidad: Exportar facturas de proveedor responde 200 con `{ ok:false }` — un error que parece éxito — src/app/api/exportar-facturas-proveedor/route.ts:12 (DESCARTADO: referencia inválida)
- [ALTO] rendimiento: Imagen de comprobante se envía sin redimensionar a OCR — src/lib/intake/ocr.ts:32 (DESCARTADO: referencia inválida)
- [MEDIO] rendimiento: Timeout individual de cola no considera la suma de eslabones — src/lib/queue/worker.ts:45 (DESCARTADO: referencia inválida)
- [ALTO] datos: El CFDI se asume único en la app y la base no lo impone (REINCIDENTE) — :0 (sin `archivo:línea`)
- [ALTO] datos: No hay CHECK de dominio en `liquidaciones.estado` (REINCIDENTE) — :0 (sin `archivo:línea`)
- [ALTO] datos: No hay check `CHECK` de no negatividad en columnas monetarias (REINCIDENTE) — :0 (sin `archivo:línea`)
- [MEDIO] datos: RLS de `pagos` no bloquea `authenticated` por fuera de la política (REINCIDENTE) — :0 (sin `archivo:línea`)
- [MEDIO] datos: Las migraciones no tienen una dirección "down" real (REINCIDENTE) — :0 (sin `archivo:línea`)
