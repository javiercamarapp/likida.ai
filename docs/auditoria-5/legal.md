# Cumplimiento legal — auditoría 5

**Nota: 6.0/10** (antes 6.5). Razón del movimiento: mirada más profunda (la nota previa estaba inflada al no auditar la cadena de consentimiento previo en los nuevos flujos de Despacho por WhatsApp ni la transferencia transfronteriza en los agentes de LLM).

El riesgo mayor del rubro hoy es la **transferencia transfronteriza sistemática de datos personales de operadores (nombres, teléfonos, RFCs de personas físicas, fotos de gastos y ubicación) a LLMs en EE.UU. (OpenRouter/Anthropic/OpenAI) sin consentimiento previo del chofer ni cláusula de transferencia expresa en el primer contacto de WhatsApp**.

---

## Hallazgos

### [ALTO] Despacho por WhatsApp transfiere PII a LLMs antes de recabar consentimiento o entregar aviso simplificado
`src/lib/likida/processor.ts:412` y `src/lib/likida/despacho_wa.ts:85`
Escenario: El jefe de tráfico da de alta un operador con teléfono `+525512345678` y le asigna un viaje ("Viaje V-102 a Monterrey, chofer Juan Pérez, placas 88-AA-1B"). El sistema envía mensaje al chofer vía WhatsApp. En cuanto el chofer responde con texto, audio o foto de ticket ("Ya cargué patrón, aquí mi ticket de diésel con tarjeta terminación 4321"), `processor.ts` toma el contenido íntegro y lo despacha de inmediato a `src/lib/llm/` para extracción y clasificación sin haber presentado previamente el Aviso de Privacidad Simplificado ni registrado la aceptación tácita/expresa en la tabla de consentimientos.
Consecuencia: Violación directa a los Arts. 15, 16 y 36 de la LFPDPPP vigente (marzo 2025). Likida y la flota incurren en responsabilidad solidaria ante el INAI/autoridad regulatoria por tratamiento y transferencia internacional indebida de datos personales del titular sin puesta a disposición del aviso en el primer contacto.
Causa probable: El flujo de recepción en `processor.ts` priorizó la experiencia conversacional fluida sin anteponer un middleware de verificación de consentimiento (`validarConsentimientoOperador(telefono)`).

---

### [ALTO] El chat analista (`analista.ts`) envía bases de datos completas con nombres, saldos y teléfonos de choferes a proveedores LLM externos sin sanitización previa
`src/lib/agents/analista.ts:148` y `src/lib/agents/chat-tools.ts:210`
Escenario: Un usuario con rol `encargado` o `contador` pregunta en el panel: "¿Cuáles viajes tienen saldo pendiente de liquidar al chofer?". La herramienta `chat-tools.ts` ejecuta un SELECT que trae `nombre_operador`, `telefono`, `clabe_interbancaria`, `monto_anticipo` y `saldo_pendiente`, y regresa el JSON crudo en el `tool_result` hacia el endpoint de OpenRouter/Anthropic (`src/lib/llm/openrouter.ts`).
Consecuencia: Transferencia internacional de datos financieros y de contacto de personas físicas a servidores en EE.UU. sin pasar por `src/lib/likida/intake/sanitizar.ts`. Si el contrato de la flota con Likida no estipula explícitamente a OpenRouter/Anthropic como encargados de tratamiento (subprocesadores), el contralor queda expuesto a contingencia legal por fuga de datos confidenciales/financieros de sus empleados y permisionarios.
Causa probable: Las herramientas del analista devuelven registros completos de BD directamente a la memoria de contexto del LLM sin aplicar una capa de ofuscación de PII (RFC persona física, CLABE, teléfono).

---

### [MEDIO] Inexistencia de mecanismo operativo para revocación de consentimiento y supresión de datos (Derechos ARCO)
`src/lib/likida/privacidad.ts:92`
Escenario: Un operador que dejó de trabajar para la flota envía "REVOCAR" o un correo solicitando la cancelación/bloqueo de sus datos personales conforme al Art. 25 de la LFPDPPP. El sistema solo cuenta con el texto declarativo del aviso de privacidad que remite a un buzón genérico (`privacidad@likida.mx`), pero no existe un procedimiento o función en BD (`lib/likida/privacidad.ts` o migraciones SQL) que ejecute el bloqueo (marcado de datos para conservación exclusiva por plazo fiscal de 5 años conforme a CFF Art. 30 / LIF y supresión de datos no fiscales como fotos de identificación, audios y geolocalizaciones).
Consecuencia: Incumplimiento de la obligación de atender solicitudes ARCO en un plazo máximo de 20 días hábiles. Al no haber segregación técnica entre datos fiscales (retención obligatoria) y datos personales accesorios (audios de WA, fotos de perfil), el equipo de soporte queda atado de manos sin herramienta de bloqueo/anonimización.
Causa probable: El módulo de privacidad se redactó como texto estático sin conectar un pipeline de ciclo de vida del dato (retención vs. bloqueo vs. purga).

---

### [MEDIO] Ranking y perfilamiento de operadores en el Agente de Conductores sin notificación de tratamiento automatizado
`src/app/dashboard/agentes/conductores/page.tsx:115` y `src/lib/likida/hitos_viaje.ts:88`
Escenario: El agente de conductores calcula métricas de desempeño ("eficiencia de combustible", "tiempo de comprobación de gastos", "puntualidad en hitos") y asigna un semáforo/score al operador que la administración de la flota usa para decidir la asignación de viajes lucrativos.
Consecuencia: El Art. 16 de la LFPDPPP exige que el titular sea informado cuando sus datos personales son objeto de decisiones automatizadas o perfilamiento que impacten su relación contractual. El aviso de privacidad actual en `src/lib/likida/privacidad.ts` omite declarar explícitamente las finalidades secundarias de perfilamiento laboral y evaluación de hábitos operativos por algoritmos.
Causa probable: Se asumió que la métrica operativa de liquidación es un dato meramente mercantil del viaje, ignorando que asociada al nombre/teléfono del chofer constituye perfilamiento de persona física.

---

### [BAJO] Exportación de facturas de proveedores (`api/export/facturas-proveedor`) incluye RFCs de personas físicas sin registro de auditoría de descarga
`src/app/api/export/facturas-proveedor/route.ts:64`
Escenario: Un usuario descarga el archivo CSV de facturas de proveedores con 500 registros. Entre los emisores existen permisionarios hombre-camión cuyo RFC contiene fecha de nacimiento y nombre propio (persona física). La ruta ejecuta la descarga con verificación de rol, pero no genera un log de evento en la bitácora de seguridad/privacidad que registre: `usuario_id`, `tenant_id`, `volumen_registros_pii`, `timestamp`.
Consecuencia: Dificultad para demostrar trazabilidad y debida custodia ante un incidente de fuga de base de datos de proveedores independientes frente al regulador.
Causa probable: El endpoint de exportación implementa control de acceso pero omite el registro de bitácora para auditoría de acceso a datos personales masivos.

---

## Lo que revisé y está bien

- **Aislamiento Multi-tenant por Permisos:** En `src/app/dashboard/agentes/**` y en los server actions asociados, el acceso a datos de transportistas y proveedores valida estrictamente `tenant_id` y permisos de rol mediante `lib/auth/permisos.ts` y `lib/auth/visibilidad.ts`, previniendo exposición cruzada de datos personales entre diferentes flotas.
- **Sanitización de Archivos e Ingesta:** En `src/lib/likida/intake/sanitizar.ts:35`, se limpian caracteres de control y metadatos peligrosos en archivos antes de ser procesados por los parsers de XML y consolidación de peajes.
- **Separación de Vistas por Rol:** `src/lib/auth/visibilidad.ts` y las pruebas en `dinero_por_area.test.ts` aseguran que usuarios del área operativa no tengan acceso indebido a información fiscal/bancaria sensible reservada a contadores y administradores.
- **Texto Base del Aviso de Privacidad:** `src/lib/likida/privacidad.ts` contiene la estructura formal exigida por la normativa (identidad del responsable, finalidades primarias y secundarias, medios para ARCO).

---

## Lo que NO alcancé a revisar

- **Términos de Servicio y Contratos de Subprocesamiento (DPA):** No se verificaron los acuerdos legales de protección de datos firmados con proveedores de infraestructura cloud (Supabase Inc. / AWS / OpenRouter / Anthropic / Meta Cloud API) para garantizar que las cláusulas de transferencia internacional cumplan con los estándares contractuales tipo.
- **Políticas de Retención en Buckets de Supabase Storage:** No se auditó la vigencia ni las políticas de expiración (TTL/LifeCycle) de los archivos de audio, fotos de comprobantes y PDFs subidos al bucket de almacenamiento.
- **Flujo de Notificaciones de Cobranza a Terceros:** En `src/lib/likida/agentes/cobranza.ts`, falta revisar a detalle si los mensajes enviados a contactos de cuentas por pagar de clientes de la flota incluyen leyendas de privacidad y opciones de exclusión (*opt-out*).