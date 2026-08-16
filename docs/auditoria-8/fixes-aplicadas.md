# Fixes aplicados — auditoría 8

- [APLICADO] agentico-M src/lib/agents/prompts.ts: tsc+tests verdes; commit [audit8] agentico-M Prompt autoriza al modelo a narrar montos que deberían ser determiníst
- [FALSO_POSITIVO] fiscal-A src/lib/likida/intake/cfdi.ts: El archivo src/lib/likida/intake/cfdi.ts únicamente decodifica y parsea el QR fiscal del SAT (UUID, RFCs, total y sello) y no realiza cálculos de impuestos ni retenciones de IVA.
- [FALSO_POSITIVO] fiscal-B src/lib/likida/cuadre/leyendas.ts: src/lib/likida/cuadre/leyendas.ts contiene los descargos de responsabilidad legales (safe harbor CFF 89/90 y 52) del sistema, no leyendas específicas de deducibilidad de viáticos; el fundamento de cada partida de viáticos (LISR 28-V, RLISR, etc.) se cita individualmente en cada partida de acuerdo con el propio texto de la leyenda.
- [ERROR] legal-A src/lib/likida/intake/sanitizar.ts: fixer sin JSON válido
- [FALSO_POSITIVO] legal-A src/lib/likida/privacidad.ts: La línea 65 es un comentario documental, no un punto de implementación de flujo. El hallazgo no aplica: el aviso simplificado ya incluye el canal ARCO/oposición vía WhatsApp ('Cómo limitarlo, oponerte o ejercer tus derechos ARCO: escribe *PRIVACIDAD* por este chat y te pasamos con la empresa') y el propio módulo documenta que es accesible desde WhatsApp. El mecanismo automatizado pertenece a otra capa, no a privacidad.ts:65.
- [FALSO_POSITIVO] legal-M src/lib/likida/privacidad.ts: El aviso ya incluye una leyenda explícita sobre la toma de decisiones automatizadas, informa que la revisión la hace un programa sin intervención humana previa y reconoce el derecho a oponerse y solicitar revisión humana.
- [ERROR] operabilidad-A src/lib/logger.ts: fixer sin JSON válido
- [ERROR] operabilidad-A src/instrumentation.ts: fixer sin JSON válido
- [FALSO_POSITIVO] operabilidad-M .env.example: No es una implementación duplicada: el hallazgo apunta a una línea de comentario de .env.example y las variables vacías son marcadores intencionales para secretos y valores específicos de cada entorno. No hay un reemplazo seguro ni valores concretos que incorporar.
- [ERROR] rendimiento-M src/lib/llm/openrouter.ts: fixer sin JSON válido
- [FALSO_POSITIVO] datos-A src/types/likida.ts: El campo reportado `liquidaciones.estado` no existe en la interfaz `Liquidacion`; el campo real es `estatus: EstatusLiquidacion`, que ya restringe los estados posibles a 'cuadrada' | 'con_diferencias' | 'revisar'. La línea 141 está en blanco y no hay bug que corregir.
- [FALSO_POSITIVO] datos-M supabase/verificaciones.sql: El hallazgo refiere a la RLS de `pagos`, pero las líneas 102-114 de `supabase/verificaciones.sql` corresponden a la verificación del mutex del viaje y no contienen políticas ni referencias a `pagos`.

Commit: git log -1 --format='%h %s'