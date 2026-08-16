# Cumplimiento legal — auditoría 8

**Nota: 4.5/10** (antes 5.0). Razón del movimiento: mirada más profunda (la nota previa estaba inflada).

El riesgo mayor del rubro hoy es la transferencia transfronteriza y no consentida de datos personales patrimoniales y bancarios de operadores hacia proveedores de LLM en EE.UU. (OpenRouter/OpenAI/Anthropic) en el pipeline de ingesta inmediata de WhatsApp, violando la LFPDPPP vigente (marzo 2025).

---

## Hallazgos

### [CRÍTICO] Transferencia transfronteriza a LLMs externos antes de consentimiento expreso del operador
`src/lib/likida/intake/processor.ts:84` (y `src/lib/llm/openrouter.ts:74`)
- **Escenario:** Un operador envía por WhatsApp una foto de una liquidación o voucher de combustible donde aparece su nombre, número de tarjeta, placas y saldo. El webhook ejecuta de inmediato la extracción mediante `completarPrompt` enviando el payload completo a OpenRouter (servidores en EE.UU.), antes de verificar si el número remitente tiene un registro de consentimiento firmado o aceptado en la base de datos (`choferes_consentimiento`).
- **Consecuencia:** Likida incurre en transferencia internacional de datos personales y patrimoniales sin base legal de consentimiento previo, exponiéndose a sanciones directas del INAI / autoridad reguladora bajo la LFPDPPP (marzo 2025) y comprometiendo al contralor de la flota que contrata el servicio.
- **Causa probable:** El pipeline de ingesta fue diseñado para priorizar UX sin compuerta de validación de consentimiento previo al envío del payload al LLM. (REINCIDENTE)

---

### [ALTO] Sanitizador ciego a datos patrimoniales y bancarios en prompts de auditoría y extracción
`src/lib/likida/intake/sanitizar.ts:28` (y `src/lib/likida/intake/sanitizar.ts:42`)
- **Escenario:** Llega un ticket de caseta o vale de diésel con texto `CLABE 012180001234567890 Tarjeta 4152313412345678 Saldo $4,500.00`. La función `sanitizarTexto` solo enmascara patrones básicos de RFC y nombres propios genéricos, pero no tiene regex para CLABEs de 18 dígitos, PANs de 16 dígitos ni números de cuenta bancaria. El string crudo se inyecta directamente en el prompt del LLM.
- **Consecuencia:** Fuga de datos patrimoniales y financieros del chofer y de la permisionaria hacia logs de terceros y proveedores de IA sin cifrado ni tokenización previa.
- **Causa probable:** Reglas de sanitización construidas únicamente con lista blanca de entidades fiscales (RFC/UUID) sin filtrado de patrones bancarios/patrimoniales estándar. (REINCIDENTE)

---

### [ALTO] Inexistencia de mecanismo automatizado para trámite de derechos ARCO y revocación vía WhatsApp
`src/lib/likida/privacidad.ts:65`
- **Escenario:** Un operador escribe por WhatsApp `REVOCAR CONSENTIMIENTO` o `BORRAR MIS DATOS`. El bot no cuenta con un interceptor de comandos de derechos ARCO en su router de mensajes y clasifica el texto como intento de consulta de liquidación o gasto no reconocido (`CLASIFICACION_DESCONOCIDA`), dejando la petición archivada en la cola de mensajes sin notificar al oficial de privacidad ni registrar el inicio del plazo de 20 días hábiles que marca la ley.
- **Consecuencia:** Incumplimiento de los plazos y procedimientos legales de atención a derechos ARCO, generando responsabilidad administrativa directa para Likida y el transportista.
- **Causa probable:** El módulo de privacidad contiene definiciones declarativas de texto, pero carece de un handler ejecutable en el enrutador de mensajes de WhatsApp. (REINCIDENTE)

---

### [MEDIO] Falta de leyenda y consentimiento para toma de decisiones automatizadas en el aviso de privacidad
`src/lib/likida/privacidad.ts:32`
- **Escenario:** El sistema clasifica automáticamente deducciones de combustible y determina penalizaciones o retenciones sobre la liquidación del chofer. El aviso de privacidad actual no informa expresamente el uso de perfiles automatizados ni mecanismos de revisión humana explícita conforme a las disposiciones de marzo 2025 de la LFPDPPP relativas a IA y decisiones algorítmicas que afectan derechos patrimoniales.
- **Consecuencia:** Vulnerabilidad legal ante demandas laborales o mercantiles de operadores que aleguen descuentos arbitrarios decididos por software sin notificación previa ni consentimiento informado.
- **Causa probable:** El aviso de privacidad fue redactado con formato tradicional y no contempla las cláusulas específicas de toma de decisiones algorítmicas y perfilamiento financiero.

---

## Lo que revisé y está bien

- `src/lib/likida/privacidad.ts:15` — Contiene la declaración explícita de las finalidades primarias del tratamiento de datos para liquidación de viajes y cálculo de comisiones.
- `src/lib/likida/intake/sanitizar.ts:14` — Enmascaramiento correcto de identificadores fiscales tipo RFC con formato de expresión regular estándar `[A-Z&Ñ]{3,4}\d{6}[A-V1-9][A-Z0-9][0-9A]`.

---

## Lo que NO alcancé a revisar

- La tabla de retención y políticas de borrado físico (`DROP/DELETE`) en migraciones SQL posteriores a `supabase/migrations/0050_*` para verificar si las imágenes de vouchers se eliminan del bucket de Supabase tras el periodo de prescripción fiscal (5 años).
- La validación de acuerdos de procesamiento de datos (DPA / Standard Contractual Clauses) firmados o configurados contractualmente con OpenRouter / Anthropic en la configuración de la cuenta corporativa.