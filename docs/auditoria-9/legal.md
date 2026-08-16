# Cumplimiento legal — auditoría 9

**Nota: 4.0/10** (antes 4.5). Razón del movimiento: mirada más profunda (la nota previa estaba inflada) y persistencia sin mitigar de los tres hallazgos abiertos de transferencias transfronterizas a LLM, sanitización patrimonial ausente y falta de canal operativo para revocación/ARCO.

Riesgo mayor del rubro hoy: Transferencia transfronteriza continua de tickets, comprobantes y números de cuenta a LLMs externos (OpenRouter/OpenAI) sin consentimiento expreso patrimonial ni cláusula de decisiones automatizadas en el aviso de privacidad bajo la LFPDPPP.

---

## Hallazgos

### [ALTO] Sanitizador ciego a datos patrimoniales, CLABEs y tarjetas en prompts de extracción
`src/lib/likida/intake/sanitizar.ts:28`
- **Escenario:** El chofer envía la foto de un ticket de diésel o comprobante de caseta donde aparece impresa la tarjeta bancaria ("Terminación 4821", "Autorización 093821") o un texto de liquidación que incluye su cuenta CLABE ("012180004567890123") para depósito de viáticos. `sanitizarTexto()` únicamente busca patrones regex de nombres propios o teléfonos, pero omite patrones de tarjetas bancarias (PAN/BIN), cuentas CLABE (18 dígitos) y RFC con homoclave. El payload crudo con datos financieros viaja íntegro en el cuerpo JSON del prompt a los servidores de OpenAI/Anthropic vía OpenRouter.
- **Consecuencia:** Likida incurre en transferencia transfronteriza no consentida de datos personales de carácter patrimonial/financiero (Art. 8 y 36 LFPDPPP). Frente a una auditoría del INAI/autoridad de datos personales o reclamo del titular, la flota y Likida enfrentan sanciones administrativas que no pueden solventarse mediante compensación contable.
- **Causa probable:** `sanitizar.ts` solo implementa filtros para PII general (teléfonos/emails) sin contemplar expresiones regulares ni validación de datos financieros o patrimoniales. (REINCIDENTE).

### [ALTO] Inexistencia de mecanismo operativo de trámite y bloqueo por derechos ARCO o revocación
`src/lib/likida/privacidad.ts:65`
- **Escenario:** Un operador de tractocamión escribe por WhatsApp `REVOCAR CONSENTIMIENTO` o `SOLICITO BORRAR MIS DATOS`. El bot de WhatsApp no intercepta la instrucción en el flujo de entrada como derecho ARCO / revocación legal ni cambia el estado del titular a `bloqueado` en base de datos; el LLM responde como si fuera una conversación conversacional genérica ("Entendido, ¿en qué más te puedo ayudar con tu viaje?"). Los viajes anteriores, liquidaciones y fotos del operador siguen disponibles para consulta del contralor y re-procesamiento por el bot.
- **Consecuencia:** Incumplimiento de los plazos de respuesta y deber de bloqueo inmediato previstos en la LFPDPPP (arts. 21, 25 y 32). El contralor de la flota queda expuesto a multas regulatorias al no contar con un procedimiento expedito para detener el tratamiento de datos de operadores que terminan relación laboral.
- **Causa probable:** Ausencia de un enrutador determinístico de comandos de privacidad previo al despachador de prompts en el intake de WhatsApp. (REINCIDENTE).

### [MEDIO] Falta de cláusula de decisiones automatizadas y perfilamiento en aviso de privacidad
`src/lib/likida/privacidad.ts:32`
- **Escenario:** Likida rechaza o aprueba automáticamente una liquidación de combustible con base en umbrales calculados por el motor (`litros > capacidad_tanque` o `rendimiento < 1.8 km/l`). El texto del aviso de privacidad devuelto al registrar al operador omite la mención expresa de que sus liquidaciones y viáticos son sujetos a toma de decisiones automatizadas y perfilamiento algorítmico sin intervención humana previa.
- **Consecuencia:** Vulneración al principio de información y transparencia. En caso de controversia laboral entre el chofer y la flota por descuentos derivados de la liquidación automática de Likida, el dictamen algorítmico carece de validez legal sustentable bajo la normativa vigente de protección de datos.
- **Causa probable:** La plantilla del aviso de privacidad no fue actualizada para reflejar la naturaleza de agente autónomo de liquidación y auditoría de gastos. (REINCIDENTE).

---

## Lo que revisé y está bien
- `src/lib/likida/privacidad.ts:12`: Estructura base de identificación del responsable y finalidades primarias del tratamiento claramente desglosadas (liquidación de fletes y control de viáticos).
- `supabase/migrations/0070_aviso_privacidad.sql:1`: Registro inmutable con timestamp y hash del texto de aviso aceptado por el usuario en la tabla de consentimientos.

---

## Lo que NO alcancé a revisar
- Políticas de retención y purga periódica en buckets de almacenamiento S3/Supabase Storage para imágenes de tickets y pólizas de seguro con antigüedad superior a 5 años fiscales.
- Contratos de transmisión de datos (DPA / Data Processing Agreements) configurados con los proveedores LLM (OpenRouter/OpenAI/Anthropic) respecto a no entrenamiento con datos de clientes.