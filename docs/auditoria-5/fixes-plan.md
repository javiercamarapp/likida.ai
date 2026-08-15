# Fixers — auditoría 5

## fiscal-A1 · [ALTO] Acreditamiento de casetas (LIF Art. 16 fracc. V / LIF 2026 20-A) calcula el 50% sobre el total bruto incluyendo IVA acreditable — src/lib/likida/peajes/desglose.ts:68
Fixer: Fiscal facts keeper · Modelo: google/gemini-3.7-flash
REPRODUCE: `npm test -- -t "acreditamiento casetas LIF 50% subtotal"`
ARCHIVO: src/lib/likida/peajes/desglose.ts
CAMBIO:
```diff
@@ -68,1 +68,1 @@
-  const estimulo = peaje.total * 0.50;
+  const estimulo = peaje.subtotal * 0.50;
```
REGRESION: `npm test src/lib/likida/peajes/__tests__/desglose.test.ts` (verifica que para una caseta con subtotal $100.00 e IVA $16.00 [total $116.00], el estímulo acreditable sea $50.00 y no $58.00, evitando doble acreditamiento con IVA trasladado).
FALSO_POSITIVO: no

## legal-A2 · [ALTO] Despacho por WhatsApp transfiere PII a LLMs antes de recabar consentimiento o entregar aviso simplificado — src/lib/likida/processor.ts:412
Fixer: Logic bugfixer · Modelo: deepseek/deepseek-v4-pro-0813
REPRODUCE: npx jest src/lib/likida/processor.test.ts -t "whatsapp no transfiere PII sin consentimiento"
ARCHIVO: src/lib/likida/processor.ts
CAMBIO:
```diff
@@ -408,6 +408,10 @@ export async function despacharWhatsApp(evento) {
   const remitente = extraerRemitente(evento);
   const texto = extraerTexto(evento);
+  if (!legal.consentimientoRecabado(remitente) || !legal.avisoSimplificadoEntregado(remitente)) {
+    await legal.entregarAvisoSimplificado(remitente);
+    return;
+  }
   const respuesta = await llm.procesar(texto);  // línea 412
   await whatsapp.enviar(remitente, respuesta);
 }
```
REGRESION:
```ts
it('no llama a LLM antes de recabar consentimiento y entregar aviso simplificado', async () => {
  const remitente = '5491100000000';
  legal.consentimientoRecabado.mockReturnValue(false);
  const procesar = jest.spyOn(llm, 'procesar');
  await despacharWhatsApp(eventoWhatsApp(remitente, 'datos personales'));
  expect(procesar).not.toHaveBeenCalled();
  expect(legal.entregarAvisoSimplificado).toHaveBeenCalledWith(remitente);
});
```
FALSO_POSITIVO: no

## legal-A3 · [ALTO] El chat analista (`analista.ts`) envía bases de datos completas con nombres, saldos y teléfonos de choferes a proveedores LLM externos sin sanitización previa — src/lib/agents/analista.ts:148
Fixer: Logic bugfixer · Modelo: deepseek/deepseek-v4-pro-0813

