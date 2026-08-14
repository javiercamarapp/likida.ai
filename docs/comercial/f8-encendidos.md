# F8 — Encendidos comerciales: estado real al 14-ago-2026

> La Fase 8 no es código: son tres interruptores de negocio. Todo lo TÉCNICO
> de los tres está preparado y verificado; lo que queda encendido de verdad
> lo enciende Javier, porque los tres comprometen dinero o precio. Este doc
> es el tablero de esos interruptores — qué está listo, qué falta y de quién
> es cada pendiente.

## 1. Timbrado ON al primer cliente — LISTO PARA ENCENDER

- **Decisión ya tomada** (13-ago, bajo riesgo propio, sin abogado): se
  enciende al cerrar el primer cliente que lo necesite.
- **Lo técnico está**: runbook completo en `docs/encender-emision.md`
  (Facturapi, el switch `FACTURACION_MODO=emitir`, el candado legal que hoy
  lo mantiene en ensayo y el porqué). La pantalla de Conexiones (F7) declara
  el modo ensayo como decisión, no como falla.
- **Falta (Javier)**: el primer cliente firmado. Nada más.

## 2. Pricing por resultado (decisión D6) — ANCLAS LISTAS, DECISIÓN ABIERTA

- **El modelo pactado en el plan**: por viaje liquidado, con "liquidado"
  definido por contrato.
- **Las anclas reales para poner el número** (todas medidas, ninguna
  inventada):
  - La nómina que sustituye: Analista de Liquidaciones, mediana **$17,368
    MXN/mes** (censo de vacantes, `~/javiercamarapp/censo-liquidacion`).
  - Costos variables ya modelados: ~$2,880 MXN/mes de facturación para una
    flota de 30 camiones + WhatsApp por mensaje (precios oct-2026).
- **Falta (Javier)**: elegir el número y el piso. Sugerencia del plan: que
  el precio de 30 camiones quede claramente debajo de UNA nómina de
  analista, y que el piloto Innovativos pague precio de piloto con
  compromiso de caso de estudio.

## 3. Piloto Transportes Innovativos — PROPUESTA ESCRITA, PELOTA EN SU CANCHA

- **La propuesta de 1 página existe**:
  `docs/comercial/propuesta-transportes-innovativos.md` (PoC de peajes 7
  días como punta de lanza; conductores como expansión; SAP B1 como fase 2
  diseñada con ellos — sin prometer lectura/escritura hoy).
- **El producto que la respalda existe desde hoy**: los 6 agentes en el
  panel, el mapa como momento wow, importador de viajes y lector de
  desgloses para arrancar el PoC con SUS datos.
- **Falta (Javier)**: mandar la propuesta / agendar el siguiente paso con
  José Alfredo Cárdenas (llamada del 6-ago; el riesgo declarado es
  perderlo contra el consultor competidor por pasividad).

## El pendiente transversal que bloquea TODO lo demás

**Nada de lo construido hoy vive en producción.** Antes del primer demo:

1. **Variables `LIKIDA_*` en Vercel** (Javier — el panel web está fuera por
   2FA, así que va por CLI; NUNCA `vercel logout`).
2. Un commit con **`[deploy]` en el asunto** (o Redeploy en el panel) y
   verificar que el deployment corresponda al último commit — el modo de
   falla es silencioso.
