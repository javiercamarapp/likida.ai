# Conciliación de peajes sin captura manual — PoC funcional en 7 días

**Para:** José Alfredo Cárdenas · Transportes Innovativos
**De:** Javier Cámara · Likida — la capa de agentes sobre su stack actual
**Fecha:** [fecha de envío]

---

## El problema, con sus palabras

Cada corte, el proveedor de peaje manda el desglose de todos los cruces y
alguien lo concilia a mano contra la operación — "un martirio". Mientras el
rediseño de su sistema avanza (12–18 meses), ese ritual se repite cada 10
días, y cada error se paga en pesos.

## Lo que proponemos: una prueba acotada, no una plataforma

Un **PoC funcional en 7 días** con datos reales de UN periodo, medible al
centavo. Sin licencias anuales, sin migraciones, sin tocar su TMS ni SAP.

**Alcance exacto del PoC:**

| Qué | Cómo |
|-----|------|
| **Entra** | El desglose de UN corte de su proveedor de peaje (el formato que ustedes reciben) + los viajes de ese periodo |
| **Cruza** | Cada línea del desglose contra el viaje y sus comprobantes; si nos comparten su reporte GPS/TMS del periodo, se suma como tercera fuente de cruce |
| **Sale** | El reporte de discrepancias: qué cuadró solo, qué no cuadra (con la diferencia en pesos) y qué cruce no tiene viaje que lo explique — línea por línea, listo para reclamar o corregir |
| **Días 1–2** | Adaptamos el lector al formato exacto de su proveedor |
| **Días 3–5** | Corremos el cruce con su periodo real y afinamos las reglas con su equipo |
| **Días 6–7** | Entrega del reporte + sesión de revisión con quien hoy hace esta conciliación |

**Métrica de éxito (se define el día 1, se mide el día 7):**
- % de líneas conciliadas sin intervención humana
- Discrepancias encontradas, en pesos
- Horas de captura del periodo que el reporte sustituye

## Después del PoC — la expansión natural

- **Agente de WhatsApp para conductores** (ya operando en Likida): el chofer
  avisa "ya llegué / descargando / de regreso" y manda sus comprobantes por
  foto; todo queda sellado y cuadrado sin papeleo. Se demuestra en vivo el
  mismo día de la entrega del PoC.
- **Integración con SAP Business One**: en el PoC **diseñamos y validamos el
  flujo** (qué entra, qué sale, con qué mecanismo) junto con su equipo de
  sistemas; la conexión se construye como fase siguiente, ya validada.

## Qué necesitamos de ustedes

1. El desglose de un corte reciente del proveedor de peaje (el archivo tal
   cual llega).
2. La lista de viajes de ese periodo (folio, ruta, operador — export simple).
3. 30 minutos del día 1 con quien hace la conciliación hoy, y 60 del día 7.

## Inversión

PoC de 7 días: **[definir]** — se acredita al contrato si continuamos.

---

*Likida es un complemento a su ERP, no un ERP nuevo: una capa de agentes
sobre los sistemas que ya tienen, con valor en semanas mientras su rediseño
avanza.*
