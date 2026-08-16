# Cumplimiento legal — auditoría 13

**Nota: 3.5/10** (antes 4.0). Razón del movimiento: mirada más profunda (la nota previa estaba inflada al contrastar con los requisitos estrictos de la LFPDPPP frente a transferencias transfronterizas automatizadas e intangibilidad del consentimiento de choferes).
**vs Handle:** 3/10. Handle cuenta con workflows de retención auditables, contratos de Data Processing Addendum (DPA) automatizados por cliente, gestión de derechos ARCO/GDPR self-service y logs criptográficos de consentimiento; Likida envía fotos de tickets, identificaciones y números de cuenta bancaria a APIs de LLMs en EE.UU. sin sanitización patrimonial ni base de transferencia consentida expresa.

Riesgo mayor: Sanción del INAI por transferencia internacional no consentida de datos personales y financieros de choferes a modelos externos (OpenAI/Anthropic), sumada a la imposibilidad técnica de ejecutar derechos ARCO de supresión/bloqueo en bases de datos operativas y logs conversacionales.

---

## Hallazgos

### [ALTO] REINCIDENTE: Sanitizador ciego a datos patrimoniales, números de tarjeta (PAN) y CLABEs bancarias hacia LLMs externos
`src/lib/likida/intake/sanitizar.ts:24`
Escenario: Un chofer envía por WhatsApp una foto o texto con su comprobante de transferencia o ticket de combustible que incluye: «Depósito a CLABE 012180001234567897 Banco BBVA, tarjeta 4152-3134-5678-9012 a nombre de Juan Pérez». La función `sanitizarTexto()` únicamente busca patrones de RFC o palabras altisonantes, dejando intactos números de 16 y 18 dígitos bancarios, nombres de beneficiarios y montos. El payload completo es enviado directamente a la API de OpenAI/Anthropic (`src/lib/llm/client.ts:48`).
Consecuencia: Incumplimiento flagrante del artículo 8 y 22 de la LFPDPPP (datos financieros/patrimoniales requieren consentimiento expreso por escrito/electrónico para su tratamiento y transferencia). En caso de auditoría del INAI o filtración en el proveedor LLM, la flota y Likida enfrentan multas de hasta 320,000 UMAS (~$35M MXN).
Causa probable: Sanitizador implementado con regex cosmético superficial sin catálogo de PII financiero ni detección de patrones Luhn/CLABE. (REINCIDENTE)

---

### [ALTO] REINCIDENTE: Inexistencia de mecanismo operativo de supresión, bloqueo y trámite de derechos ARCO
`src/lib/likida/privacidad.ts:52`
Escenario: Un chofer o permisionario envía «Deseo que borren todos mis datos personales, historial de viajes y números de cuenta» o escribe al correo de contacto legal. El sistema registra el evento en base de datos como una bandera de texto, pero no existe función, endpoint ni procedimiento de base de datos (`supabase/migrations/`) que aplique el periodo de bloqueo (art. 27 LFPDPPP), anonimice registros en las tablas de `viajes`, `gastos` y `liquidaciones`, ni purgue logs de mensajes en el storage.
Consecuencia: Violación directa al derecho de Cancelación y Oposición (ARCO). El titular puede interponer un procedimiento de protección de derechos ante el INAI, resultando en medidas cautelares y sanciones a la empresa de transporte y a Likida como encargado/responsable solidario.
Causa probable: Falta de diseño de base de datos para soft-delete con seudonimización y ausencia de jobs de purga de PII. (REINCIDENTE)

---

### [MEDIO] REINCIDENTE: Aviso de privacidad omite decisiones automatizadas, perfilamiento de choferes y transferencias internacionales a proveedores de IA
`src/lib/likida/privacidad.ts:18`
Escenario: El texto estático del aviso de privacidad declara finalidades genéricas de «liquidación operativa y facturación», pero no desglosa:
1. La transferencia internacional de datos a proveedores de cómputo cognitivo / LLM ubicados en Estados Unidos.
2. La toma de decisiones automatizadas en el cálculo de descuentos, rendimiento de combustible y comisiones/penalizaciones a choferes.
3. Las finalidades secundarias relativas a analítica agregada o mejora de modelos.
Consecuencia: Consentimiento viciado e ineficaz según la LFPDPPP y sus lineamientos del Aviso de Privacidad. El contralor de la flota queda expuesto ante demandas laborales o quejas de choferes que aleguen descuentos opacos basados en algoritmos no informados.
Causa probable: El aviso de privacidad fue redactado como machote estándar de SaaS web sin contemplar procesamiento mediante IA ni regulación de profiling. (REINCIDENTE)

---

### [MEDIO] Exposición de datos de terceros y retención indefinida de comprobantes en storage sin cifrado a nivel de aplicación
`src/lib/likida/intake/storage.ts:35`
Escenario: Un ticket de báscula o caseta contiene nombres de terceros (operadores de caseta, despachadores) y placas de vehículos. El archivo se sube a un bucket S3/Supabase Storage con retención indefinida y URLs con acceso temporal amplio sin política de ciclo de vida (TTL de purga tras liquidación auditada).
Consecuencia: Vulneración al principio de proporcionalidad y minimización (art. 13 LFPDPPP), acumulando pasivos de datos personales y comerciales indefinidamente.
Causa probable: Ausencia de políticas de retención y purga programada (`retention policy`) en el esquema de almacenamiento de adjuntos.

---

## Lo que revisé y está bien

- `src/lib/likida/privacidad.ts:12`: Se implementa una estructura básica para registrar la aceptación del aviso mediante timestamp y número telefónico al inicio de la sesión de WhatsApp antes de procesar el primer viaje.
- `FISCAL_LEGAL.md:45`: Documentación conceptual clara que distingue las obligaciones del Responsable (Flota) y el Encargado del Tratamiento (Likida) conforme al marco regulatorio mexicano.

---

## Lo que NO alcancé a revisar

- Endpoints y webhooks de exportación masiva (`export/`) para verificar si la descarga de reportes para el contralor incluye controles de acceso basados en roles y mascarado de datos personales.
- Políticas de retención y acuerdos de tratamiento de datos (DPA / Zero Data Retention) contratados formalmente con los proveedores de API LLM en sus tiers enterprise.