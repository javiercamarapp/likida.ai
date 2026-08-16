# Cumplimiento legal — auditoría 7

**Nota: 5.0/10** (antes 5.5). Razón del movimiento: mirada más profunda (la nota previa estaba inflada). La deuda regulatoria de LFPDPPP 2025 y la transferencia transfronteriza descontrolada de datos personales/patrimoniales de operadores a APIs de LLMs en EE.UU. siguen operando sin compuerta previa de consentimiento ni sanitización de datos financieros.

El riesgo mayor del rubro hoy es la **transferencia directa de PII patrimonial (CLABE, tarjetas, nómina y saldos deudores) de operadores a proveedores LLM externos (OpenAI/Anthropic/Gemini) en el primer mensaje de WhatsApp, sin aviso simplificado interactivo ni consentimiento registrado en base de datos**.

---

## Hallazgos

### [ALTO] Ingesta de WhatsApp y extracción LLM transfieren datos personales y patrimoniales al extranjero antes del registro de consentimiento
`src/lib/likida/intake/sanitizar.ts:42` (y orquestador de intake en `src/lib/llm/client.ts:18`)
Escenario: Un operador nuevo con teléfono `+52 1 55 1234 5678` envía un mensaje inicial: `"Soy Juan Pérez, unidad 104, cargué $4,200 de diésel con tarjeta y me deben $1,500 de viáticos"`. El webhook de WhatsApp toma el payload crudo, no consulta la tabla de consentimientos ni emite el aviso de privacidad simplificado exigido por LFPDPPP, y despacha inmediatamente el texto íntegro a la API del modelo LLM (OpenAI / Anthropic en servidores de EE.UU.) para extraer entidades y montos.
Consecuencia: Likida y la flota incurren en transferencia no consentida de datos personales y patrimoniales a terceros internacionales. Ante una inspección del INAI o queja de un titular, la flota y Likida son solidariamente responsables por tratamiento indebido sin base jurídica previa.
Causa probable: El pipeline de ingesta prioriza la tasa de conversión y la baja fricción del chofer sobre la compuerta regulatoria de `consentimiento_aceptado = true` antes de la inferencia. (REINCIDENTE)

---

### [ALTO] Sanitizador ciego a datos patrimoniales y bancarios: expone números de tarjeta y CLABEs en los prompts de auditoría
`src/lib/likida/intake/sanitizar.ts:28`
Escenario: El operador envía comprobante de transferencia o texto: `"Me transfirieron a Banorte CLABE 072180001234567890 tarjeta 4152313388991234 ref 99812"`. La función `sanitizarTexto()` aplica regex únicamente para contraseñas obvias o palabras clave hardcodeadas, pero carece de detectores y enmascaramiento para formatos CLABE (18 dígitos) y PAN de tarjeta bancaria (16 dígitos). El prompt viaja con la información financiera legible al proveedor de IA.
Consecuencia: Almacenamiento y exposición de datos financieros de choferes en logs externos y memoria de modelos de terceros, violando el principio de proporcionalidad y minimización de datos personales sensibles y patrimoniales.
Causa probable: Implementación incompleta de reglas regex de enmascaramiento en `sanitizarTexto()` orientada solo a tokens de API y credenciales de sistema. (REINCIDENTE)

---

### [MEDIO] Inexistencia de mecanismo automatizado para revocación de consentimiento y trámite de derechos ARCO vía WhatsApp
`src/lib/likida/privacidad.ts:65`
Escenario: Un chofer dado de baja de la flota envía al bot de WhatsApp: `"Quiero que borren mi número, mis fotos y mis datos de su sistema"`. El clasificador de intenciones no cuenta con un handler específico para ARCO/Cancelación; el mensaje se rutea como fallback conversacional o mensaje no reconocido (`"No entendí tu solicitud, envía un ticket o gasto"`). En base de datos no se marca la bandera de bloqueo ni se abre ticket de atención a derechos ARCO en el plazo legal de 20 días.
Consecuencia: Incumplimiento de las obligaciones de atención a derechos ARCO establecidas en la LFPDPPP, dejando al titular sin vía efectiva y exponiendo a la empresa a multas administrativas por no dar respuesta formal al ejercicio de derechos.
Causa probable: Las plantillas de privacidad declaran un correo electrónico estático pero la interfaz nativa del producto (WhatsApp) no tiene hook transaccional ni state machine para canalizar la revocación. (REINCIDENTE)

---

### [MEDIO] Agente Analista inyecta registros de nómina y saldos deudores sin anonimización en el prompt del contralor
`src/lib/likida/analista/contexto.ts:54`
Escenario: El contralor consulta al Analista: `"¿Cuál es el saldo pendiente de liquidar de la flota de Monterrey?"`. El contexto inyecta un dump SQL en texto plano que incluye `nombre_operador`, `telefono`, `saldo_deudor`, `retenciones_imss_infonavit` y `descuentos_combustible` sin aplicar hashing unidireccional ni seudonimización antes de construir el system prompt para el LLM.
Consecuencia: Exposición de perfiles laborales y patrimoniales completos a terceros procesadores de cómputo en la nube sin justificación de minimización de datos.
Causa probable: El módulo de contexto del Analista serializa filas completas de la base de datos sin una capa de proyección y ofuscación de PII.

---

## Lo que revisé y está bien

1. **Estructura base del Aviso de Privacidad y finalidades principales**:
   - `src/lib/likida/privacidad.ts:12-45`: Define con claridad las finalidades primarias (gestión de liquidaciones, validación de gastos de viaje y cálculo de nómina de transporte) y secundarias, alineado a la terminología formal de la LFPDPPP.
2. **Definición de políticas de retención temporal**:
   - `src/lib/likida/privacidad.ts:80-110`: Contempla ventanas de retención diferenciadas para evidencias fotográficas de tickets vs. comprobantes fiscales CFDI con trascendencia tributaria (5 años conforme a CFF).
3. **Mapeo de responsabilidades entre flota (Responsable) y Likida (Encargado)**:
   - `docs/conocimiento/FISCAL_LEGAL.md:45-82`: Cláusulas claras de relación jurídica Responsable-Encargado (*Data Processor Agreement*) que delimitan el alcance del procesamiento de datos de los operadores por cuenta de la flota transportista.

---

## Lo que NO alcancé a revisar

1. **Términos de servicio y DPA activos con proveedores LLM**: No se auditó si las cuentas empresariales de OpenAI/Anthropic tienen activado el flag de *Zero Data Retention* (ZDR) y exclusión de entrenamiento con datos de clientes.
2. **Políticas de borrado físico en buckets de almacenamiento**: No se validó el ciclo de vida de expiración automática de imágenes de tickets y licencias de conducir en Supabase Storage / S3.
3. **Mecanismo de firma de contratos y aceptación de términos por la flota**: No se revisó el flujo de onboarding web para la firma electrónica del contrato de prestación de servicios entre el Contralor y Likida.