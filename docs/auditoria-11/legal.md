# Cumplimiento legal — auditoría 11

**Nota: 4.0/10** (antes 4.0). Razón del movimiento: mirada más profunda (se sostiene en 4.0 con reincidencia comprobada de los 3 hallazgos abiertos y falta de base legal para transferencias de datos financieros/patrimoniales a LLMs extranjeros).

Riesgo mayor del rubro hoy: Exposición no consentida de datos patrimoniales (CLABEs de 18 dígitos, números de tarjeta bancaria de vales de diésel) transferidos en texto claro a APIs de LLM en el extranjero sin aviso de privacidad que cubra transferencias internacionales ni mecanismo de bloqueo/supresión ARCO.

---

## Hallazgos

### [ALTO] Sanitizador ciego a datos patrimoniales, CLABEs bancarias y tarjetas en prompts de extracción
`src/lib/likida/intake/sanitizar.ts:28`
- **Escenario:** Un operador envía por WhatsApp una foto o comprobante de gasto junto con el mensaje: *"Deposito a mi cuenta BBVA CLABE 012180004567890123 de Pedro Perez o tarjeta 4152313456789010 para el diésel"*. La función `sanitizarTexto` solo filtra patrones aislados de CURP y RFC básicos mediante regex elemental, pero no enmascara números de cuenta bancaria, CLABEs interbancarias (18 dígitos) ni números de tarjetas de pago (16 dígitos PAN). El payload completo con la CLABE `012180004567890123` y el nombre del titular se envía en el prompt de extracción a endpoints externos (OpenRouter / OpenAI / Anthropic).
- **Consecuencia:** Violación directa a los artículos 8, 15 y 36 de la LFPDPPP por tratamiento y transferencia internacional de datos personales financieros/patrimoniales sin consentimiento expreso por escrito (o electrónico verificable) y sin medidas de disociación técnica previa a la salida hacia procesadores terceros fuera de México.
- **Causa probable:** REINCIDENTE. El sanitizador fue diseñado originalmente solo para remover tokens de control o RFCs explícitos, omitiendo el catálogo completo de datos financieros y patrimoniales que circulan típicamente en comprobaciones de liquidación de fletes.

---

### [ALTO] Inexistencia de mecanismo operativo de trámite, supresión y bloqueo para derechos ARCO o revocación
`src/lib/likida/privacidad.ts:65`
- **Escenario:** Un chofer que dejó de laborar para una flota solicita formalmente la cancelación de sus datos biométricos/fotográficos, números de licencia y registros de viaje acumulados (`DELETE/CANCEL` ARCO). El sistema no cuenta con ninguna función, API route, estado de bloqueo (`status = 'bloqueado'`) ni pipeline automatizado que permita aislar los datos del titular para conservación legal pasiva mientras se eliminan de los índices de búsqueda, prompts y vistas activas del contralor. Si el chofer envía "cancelar mis datos", el bot de WhatsApp lo procesa como un comando no reconocido de liquidación o queda almacenado indefinidamente en `raw_messages`.
- **Consecuencia:** Incumplimiento de los plazos de respuesta y ejecución de derechos ARCO (20 días para determinar y 15 días para hacer efectiva la cancelación) y del periodo de bloqueo obligatorio fijado por el Art. 25 y 32 de la LFPDPPP, exponiendo a la flota y a Likida a multas administrativas del INAI/autoridad garante.
- **Causa probable:** REINCIDENTE. La arquitectura asume almacenamiento append-only en base de datos para auditoría fiscal pero no implementó la capa de disociación ni la partición de retención/bloqueo por titular.

---

### [MEDIO] Falta de cláusula y consentimiento para decisiones automatizadas y perfilamiento en aviso de privacidad
`src/lib/likida/privacidad.ts:32`
- **Escenario:** El motor de conciliación y liquidación clasifica automáticamente deducciones de viaje, rechaza tickets por presunta duplicidad o discrepancia de kilometraje y calcula montos netos pagaderos al operador sin intervención humana previa. El texto del aviso de privacidad no contiene ninguna cláusula que informe al titular que sus datos operativos y de geolocalización/tiempos están sujetos a toma de decisiones automatizadas, ni establece el derecho del titular a impugnar la valoración o solicitar supervisión humana.
- **Consecuencia:** Vulneración al principio de información y transparencia (LFPDPPP). En caso de litigio laboral o controversia entre la flota y el transportista por descuentos de liquidación generados por el algoritmo, el dictamen algorítmico carece de respaldo contractual y genera contingencia solidaria contra Likida.
- **Causa probable:** REINCIDENTE. El aviso de privacidad es un machote genérico de prestación de servicios de software B2B que no describe el procesamiento algorítmico real sobre los choferes personas físicas.

---

## Lo que revisé y está bien

- **Aislamiento de metadata de sesión y tenant:** En `src/lib/likida/privacidad.ts:12` se verifica que el identificador de tenant (`fleet_id`) no se concatena directamente en los logs expuestos al cliente público ni se inyecta en variables de entorno accesibles por el navegador.
- **Validación de tipos de identificación fiscal:** En `src/lib/likida/intake/sanitizar.ts:15`, las expresiones regulares para captura de identificadores fiscales estándar (RFC con homoclave) rechazan secuencias con caracteres de control o inyecciones evidentes de código antes del almacenamiento preliminar.

---

## Lo que NO alcancé a revisar

- Migraciones de base de datos en `supabase/migrations/` para verificar si existen políticas RLS que restrinjan la exportación masiva de datos de operadores a usuarios con rol exclusivo de visualizador.
- Configuración de retención de datos y acuerdos de procesamiento de datos (DPA / zero data retention agreements) con los proveedores upstream de LLMs en `src/lib/llm/openrouter.ts`.