# Verificación — auditoría 7

**10 VERIFICADOS** · **18 DESCARTADOS**

## Verificados
- [ALTO] backend: REINCIDENTE — El dedup de importación es un `Set` sin llave de negocio que lo respalde — `src/lib/likida/duplicados.ts:3`
- [MEDIO] backend: REINCIDE — La rama “oficina” traga la caída de la base y responde 200 al webhook — `src/lib/likida/processor.ts:272`
- [ALTO] tool-calling: Respuesta truncada por `finish_reason: "length"` se ejecuta como tool call completa — `src/lib/llm/openrouter.ts:158`
- [MEDIO] tool-calling: El fallback de proveedores no lleva prueba de atribución del costo al proveedor efectivamente usado — `src/lib/llm/openrouter.ts:104`
- [BAJO] tool-calling: La atribución del efecto de una tool call depende del orden de llegada — `src/lib/llm/tool-executor.ts:71`
- [MEDIO] seguridad: CVE en Next.js con camino de explotación vía `next/image` — `package-lock.json:72`
- [BAJO] fiscal: Leyenda de deducibilidad en viáticos omite fundamentación de RFA y LISR en PDF (REINCIDENTE) — `src/lib/likida/cuadre/leyendas.ts:45`
- [ALTO] legal: Ingesta de WhatsApp y extracción LLM transfieren datos personales y patrimoniales al extranjero antes del registro de consentimiento — `src/lib/likida/intake/sanitizar.ts:42`
- [ALTO] legal: Sanitizador ciego a datos patrimoniales y bancarios: expone números de tarjeta y CLABEs en los prompts de auditoría — `src/lib/likida/intake/sanitizar.ts:28`
- [MEDIO] legal: Inexistencia de mecanismo automatizado para revocación de consentimiento y trámite de derechos ARCO vía WhatsApp — `src/lib/likida/privacidad.ts:65`

## Descartados
- [ALTO] frontend: Fallback de odómetro y kilometraje renderiza "0 km" falseando el cálculo de rendimiento de combustible — src/app/(dashboard)/liquidaciones/[id]/page.tsx:142 (DESCARTADO: referencia inválida)
- [ALTO] frontend: Estados `en_proceso`, `error` y `rechazado` en timbrado/facturación caen en badge genérico o texto crudo — src/app/(dashboard)/liquidaciones/[id]/components/detalle-facturacion.tsx:88 (DESCARTADO: referencia inválida)
- [MEDIO] frontend: Duplicidad e inestabilidad de `key` de React en listas de deducciones y gastos variables — src/app/(dashboard)/liquidaciones/[id]/components/tabla-deducciones.tsx:64 (DESCARTADO: referencia inválida)
- [MEDIO] frontend: Inconsistencia en formato de fechas de vigencia (UTC vs local) en fichas de operadores y pólizas — src/app/(dashboard)/operadores/[id]/components/vigencias-documentos.tsx:51 (DESCARTADO: referencia inválida)
- [BAJO] frontend: Contraste insuficiente en estados inactivos y badges de estado secundario — src/design-system/components/badge.tsx:32 (DESCARTADO: referencia inválida)
- [MEDIO] backend: El procesador de confirmación repite lectura + escritura sin bloqueo de concurrencia (REINCIDENTE) — :0 (sin `archivo:línea`)
- [BAJO] backend: `pg_errores` muestra el código de SQL pero no identifica la fila que falló REINCIDENTE) — :0 (sin `archivo:línea`)
- [ALTO] seguridad: Ruta administrativa de exportación protegida solo por el matcher de middleware — src/app/api/admin/export/route.ts:24 (DESCARTADO: referencia inválida)
- [MEDIO] seguridad: URL firmada con TTL de 7 días para descargas de liquidación — src/lib/auth/signed-url.ts:22 (DESCARTADO: referencia inválida)
- [ALTO] fiscal: Acreditamiento de casetas aplica el 50% sobre el total bruto sin descontar IVA acreditable (REINCIDENTE) — src/lib/likida/liquidacion/deducibilidad.ts:142 (DESCARTADO: referencia inválida)
- [ALTO] fiscal: Retención de IVA del 4% aplicada de forma fija sin validar personalidad jurídica del receptor (REINCIDENTE) — src/lib/likida/facturacion/impuestos.ts:88 (DESCARTADO: referencia inválida)
- [MEDIO] fiscal: Facilidad de comprobación del 8% omite retención de ISR provisional del 16% (REINCIDENTE) — src/lib/likida/liquidacion/deducibilidad.ts:215 (DESCARTADO: referencia inválida)
- [MEDIO] legal: Agente Analista inyecta registros de nómina y saldos deudores sin anonimización en el prompt del contralor — src/lib/likida/analista/contexto.ts:54 (DESCARTADO: referencia inválida)
- [ALTO] pruebas: `api/export/facturas-proveedor` reincide sin arnés: una regresión en columna de dinero sale a producción sin que CI la detecte — :0 (sin `archivo:línea`)
- [ALTO] operabilidad: Sentry queda en el `instrumentation.ts` pero no llega a ninguna persona — :0 (sin `archivo:línea`)
- [ALTO] operabilidad: El log de fallo de WhatsApp no dice «cuál liquidación» ni «de qué flota» — :0 (sin `archivo:línea`)
- [ALTO] operabilidad: Error que no es error: exportar facturas-proveedor responde 200 `{ ok: false }` — :0 (sin `archivo:línea`)
- [MEDIO] operabilidad: `.env.example` deja variables sin valor que el sistema arranca con problemas — :0 (sin `archivo:línea`)
