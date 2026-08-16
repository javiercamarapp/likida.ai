# Cumplimiento legal — auditoría 12

**Nota: 4.0/10** (antes 4.0). Razón del movimiento: mirada más profunda y confirmación de deuda reincidente sin mitigar.

Riesgo mayor hoy: Exfiltración no consentida de datos patrimoniales y financieros (CLABEs, tarjetas, saldos de viáticos) hacia APIs de LLM extranjeros sin sanitización previa ni cláusula de decisiones automatizadas en el aviso de privacidad.

---

## Hallazgos

### [ALTO] REINCIDENTE: Sanitizador ciego a datos patrimoniales, números de tarjeta (PAN) y CLABEs bancarias hacia LLMs
`src/lib/likida/intake/sanitizar.ts:24-42`
- **Escenario:** El operador envía por WhatsApp: `"Oye deposítame mi liquidación de $4,500 a mi Banamex CLABE 002180012345678901 o a mi tarjeta 4152313456789012"`. `sanitizarTexto()` ejecuta únicamente reemplazos de RFC (`\b[A-Z&Ñ]{3,4}\d{6}[A-V1-9][A-Z1-90-9]\b`), emails y teléfonos genéricos (`\+?\d[\d\s-]{8,}\d`), dejando la CLABE de 18 dígitos y el PAN de 16 dígitos intactos en el payload enviado al endpoint de OpenAI / Anthropic (`src/lib/llm/client.ts`).
- **Consecuencia:** Transferencia ilícita de datos personales financieros y patrimoniales a terceros extranjeros sin consentimiento expreso por escrito ni base de tratamiento (Art. 8 y Art. 36 LFPDPPP 2025). Responsabilidad directa y multas del INAI/autoridad regulatoria para Likida y riesgo de fraude para el operador.
- **Causa probable:** Expresiones regulares del sanitizador restringidas a RFC/email/teléfono sin patrones de 18 dígitos (CLABE) ni 16 dígitos (Luhn/PAN bancario).

---

### [ALTO] REINCIDENTE: Inexistencia de mecanismo operativo de supresión, bloqueo y trámite de derechos ARCO
`src/lib/likida/privacidad.ts:54-72`
- **Escenario:** Un chofer revoca su consentimiento vía WhatsApp o el contralor solicita la cancelación de datos de un ex-operador bajo Art. 22-25 LFPDPPP. El sistema cuenta con la función `registrarAceptacionAviso()` pero carece en absoluto de endpoint, función de base de datos o handler para: a) marcar registro en estado "bloqueo", b) anonimizar chats o liquidaciones históricas sin romper integridad referencial fiscal, c) suspender el envío de datos a LLM.
- **Consecuencia:** Incumplimiento de plazos legales de atención ARCO (20 días hábiles) y del periodo de bloqueo obligatorio previo a la supresión. El titular puede denunciar ante el INAI, derivando en sanciones administrativas al responsable y al encargado del tratamiento.
- **Causa probable:** Enfoque unidireccional de captura de aceptación (`privacidad.ts`) sin tabla ni workflow de atención y bloqueo de derechos ARCO en base de datos.

---

### [MEDIO] REINCIDENTE: Aviso de privacidad omite decisiones automatizadas, perfilamiento de choferes y transferencias internacionales a proveedores de IA
`src/lib/likida/privacidad.ts:18-48`
- **Escenario:** El sistema clasifica tickets de viaje, calcula viáticos, aprueba/rechaza conceptos de gastos y evalúa inconsistencias de liquidación de forma 100% automatizada vía modelos de IA extranjeros (OpenAI/Anthropic en EE. UU.). El texto del aviso generado en `TEXTO_AVISO_PRIVACIDAD` únicamente estipula finalidades operativas genéricas de liquidación, sin advertir el uso de IA generativa, decisiones automatizadas de pago ni transferencia transfronteriza de datos de geolocalización y comprobantes.
- **Consecuencia:** Vicio en el consentimiento informado (Arts. 15, 16 y 36 LFPDPPP 2025). El chofer o el sindicato de transportistas pueden impugnar liquidaciones y descuentos salariales alegando perfilamiento automatizado no consentido.
- **Causa probable:** Plantilla estática de aviso de privacidad redactada como SaaS tradicional sin incorporar las cláusulas específicas de IA y transferencias a procesadores externos.

---

### [MEDIO] Exposición de fotos de comprobantes con datos de terceros en URLs firmadas sin expiración estricta ni disociación
`src/lib/likida/intake/storage.ts:38-52`
- **Escenario:** El operador sube una foto de ticket de gasolina o caseta que incluye nombre del despachador, placas de terceros o código QR con UUID fiscal. El bucket de almacenamiento genera URL de lectura temporal pero los metadatos y la imagen en crudo se envían como `image_url` en alta resolución a la API de visión del LLM sin previo recorte de rostros o datos no pertinentes al gasto.
- **Consecuencia:** Tratamiento excesivo de datos personales de terceros no relacionados con la relación contractual (principio de proporcionalidad y minimización Art. 13 LFPDPPP).
- **Causa probable:** El pipeline de ingestión pasa el blob directo al LLM de visión sin fase de disociación o desenfoque de datos no pertinentes.

---

## Lo que revisé y está bien
- `src/lib/likida/privacidad.ts:5-16`: Definición estricta de versiones de aviso de privacidad y sellado de versión (`VERSION_AVISO_ACTUAL = '2025-03-01'`) que impide aceptar versiones obsoletas sin registrar la versión exacta.
- `src/lib/likida/intake/sanitizar.ts:10-22`: Sanitización determinista de RFCs de personas físicas con homoclave en textos libres antes de indexar en logs de auditoría interna.

---

## Lo que NO alcancé a revisar
- Flujo de retención y purga automática de logs de WhatsApp en Webhooks (`src/app/api/whatsapp/webhook/route.ts`).
- Contratos de encargo de tratamiento (Data Processing Agreements / DPA) con OpenAI y Anthropic para garantizar que los datos no se usen en reentrenamiento.
- Procedimiento de exportación masiva de datos en formato interoperable para portabilidad de datos.