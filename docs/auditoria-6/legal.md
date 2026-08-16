# Cumplimiento legal — auditoría 6

**Nota: 5.5/10** (antes 6.0). Razón del movimiento: mirada más profunda en flujos de ingestión de agentes (Despacho, Cobranza y Analista) y verificación de las transferencias transfronterizas hacia modelos de OpenAI/Anthropic sin previo consentimiento ni sanitización de datos de identificación de terceros (operadores y clientes).

El riesgo mayor del rubro hoy es la transferencia transfronteriza no consentida de PII (nombres, números telefónicos, placas y geolocalizaciones de operadores) a proveedores de LLM en el extranjero antes de que el titular reciba el aviso de privacidad simplificado en WhatsApp o valide la relación jurídica.

---

## Hallazgos

### [ALTO] Ingestión de WhatsApp y despacho envían PII de operadores al LLM antes de registrar consentimiento o presentar aviso simplificado
`src/lib/agentes/despacho/motor.ts:88`
Escenario: Entra un mensaje de WhatsApp entrante de un operador nuevo (`"Hola, soy Juan Pérez del tracto 402, voy saliendo de Manzanillo con la carta porte 88412 y mi cel es 3312345678"`) → El motor despachador invoca a OpenAI/Anthropic pasando el `rawText` y metadatos íntegros antes de verificar si `consentimiento_privacidad` está registrado o si se ha disparado el flujo de entrega del aviso simplificado.
Consecuencia: Likida y la empresa transportista incurren en responsabilidad directa frente a la LFPDPPP (marzo 2025) por transferencia transfronteriza y tratamiento no consentido de datos de identificación y geolocalización de personas físicas.
Causa probable: Ausencia de un guardián de verificación de consentimiento y aviso previo en el middleware del webhook antes de invocar la capa de inferencia LLM. (REINCIDENTE)

---

### [ALTO] El agente Analista inyecta registros completos de nómina, saldos y operadores en el prompt sin anonimizar ni truncar PII
`src/lib/agentes/analista/motor.ts:142`
Escenario: El contralor consulta en el chat analista: `"Dame el resumen de liquidaciones pendientes de la ruta México-Laredo"` → La herramienta del analista extrae 50 liquidaciones de la base de datos conteniendo `nombre_operador`, `telefono`, `rfc_operador`, `monto_anticipo` y `clabe_bancaria`, e interpola el JSON en crudo en el system prompt enviado al LLM.
Consecuencia: Fuga masiva de datos financieros y personales sensibles a servidores de proveedores LLM sin minimización de datos (principio de proporcionalidad y finalidad de la LFPDPPP).
Causa probable: El agente analista formatea directamente las tuplas de Supabase sin pasar por una capa de tokenización/desidentificación (`sanitizar.ts`) previa al contexto del prompt. (REINCIDENTE)

---

### [MEDIO] Inexistencia de endpoint o mecanismo transaccional para ejercer derechos ARCO y revocación de consentimiento
`src/lib/likida/privacidad.ts:65`
Escenario: Un operador o cliente solicita mediante mensaje `"Deseo que borren mis datos y no me vuelvan a mandar mensajes"` → El sistema responde con texto plano genérico de atención al cliente pero no ejecuta el bloqueo, disociación ni la cancelación física de los registros en `viajes`, `operadores_consentimiento` ni logs de inferencia.
Consecuencia: Incumplimiento del plazo legal de respuesta y ejecución de derechos ARCO, generando riesgo de multas administrativas del INAI / autoridad garante de protección de datos personales.
Causa probable: El módulo de privacidad está implementado como un catálogo estático de textos y no como un flujo transaccional con estados de bloqueo de datos en Supabase. (REINCIDENTE)

---

### [MEDIO] Sanitizador de ingesta no cubre datos bancarios ni placas vehiculares en comprobantes OCR
`src/lib/likida/intake/sanitizar.ts:42`
Escenario: Un chofer envía foto de ticket de diésel o comprobante de caseta con tarjeta bancaria visible (`4152-3133-XXXX-1234`) y placa (`48-AA-3B`) → La función `sanitizarTexto()` regex solo busca patrones de RFC y CURP básicos, dejando pasar los números de tarjeta y placas al prompt del clasificador multimodal.
Consecuencia: Tratamiento indebido y almacenamiento no cifrado de datos patrimoniales y vehiculares en las bitácoras de procesamiento LLM.
Causa probable: Expresiones regulares de sanitización insuficientes en el pipeline previo a la extracción de gastos.

---

### [BAJO] Exportación de reportes CSV/Excel sin bitácora de trazabilidad ni motivo de exportación
`src/app/api/exportar/route.ts:51`
Escenario: Un usuario de la flota descarga el archivo `liquidaciones_completas_2025.csv` con todos los operadores y viajes → La API entrega el stream de bytes sin registrar en la tabla de auditoría `audit_logs` quién descargó los datos, cuántos registros salieron ni para qué finalidad.
Consecuencia: Imposibilidad de acreditar la cadena de custodia y trazabilidad de datos personales en caso de una filtración interna en la flota.
Causa probable: Omisión del decorador de auditoría en las rutas de descarga masiva de datos en formato plano.

---

## Lo que revisé y está bien

- **Texto del Aviso de Privacidad Integral**: `src/lib/likida/privacidad.ts:18` cuenta con la fundamentación legal alineada a la LFPDPPP, detallando las finalidades primarias (liquidación de viajes, timbrado fiscal) y secundarias.
- **Validación de Tenant Isolation en consultas de choferes**: `src/lib/agentes/cobranza/motor.ts:74` previene la fuga cruzada de datos personales entre transportistas distintos mediante el filtro forzado `tenant_id = user_tenant_id`.
- **Almacenamiento de credenciales SAT (CIEC / FIEL)**: `src/lib/sat/credenciales.ts:32` no guarda claves privadas en texto plano en la base; utiliza cifrado simétrico AES-256-GCM con llaves delegadas a variables de entorno de servidor.

---

## Lo que NO alcancé a revisar

- Flujos de retención y purga automática de imágenes y comprobantes en buckets de Supabase Storage (`storage.objects`) tras la liquidación del viaje.
- Mecanismo de notificación y bitácora de transferencias en caso de uso de proveedores secundarios de fallback en OpenRouter.