# Sistema agéntico y orquestación — auditoría 5

**Nota: 6/10** (antes 7). Razón del movimiento: los tres abiertos heredados siguen vivos en el código — dos se agravaron y uno se confirmó tal cual. El camino feliz y los cierres nuevos son sólidos, pero en los bordes exactos que ordenan el rubro (“si el ciclo muere aquí, ¿qué ve el humano y qué quedó en la base?”) la respuesta sigue siendo: el humano ve un texto que no refleja la base.

El riesgo mayor hoy: **el mensaje de cierre que sale hacia el chofer o el contralor se emite sin verificar el estado que quedó persistido**, y en dos de los tres casos el estado persistido contradice el texto.

## Revisión de abiertos heredados

### Abierto 1 — “ya” ambiguo con comprobantes registrados: REINCIDENTE, agravado

Localicé el flujo de liquidación en `src/lib/likida/processor.ts`. El freno que existía cubría el caso de cero comprobantes; el caso con comprobantes registrados sigue cerrando sin verificar el total.

`src/lib/likida/processor.ts:1545` — en la rama de hitos/viajes busqué y encontré la lógica de cierre por “ya”:

```
1580: if (texto.toLowerCase().includes("ya")) {
1581:   const comprobantes = await prisma.comprobante.findMany({ where: { viajeId: viaje.id } });
1582:   if (comprobantes.length === 0) {
1583:     return { response: "No tengo comprobantes registrados para este viaje; no puedo cerrarlo." };
1584:   }
1585:   await prisma.viaje.update({ where: { id: viaje.id }, data: { estado: "liquidado" } });
1586:   return { response: `Listo, viaje ${viaje.id} liquidado con ${comprobantes.length} comprobantes.` };
1587: }
```

El freno solo evalúa `length === 0`. Si hay comprobantes por $1,000 y el viaje factura $50,000, el “ya” cierra igual y responde “Listo”. El registro persistido queda `liquidado` sin validación de cobertura ni de monto.

Consecuencia: el contralor no ve el cierre real en su sala; la liquidación queda cerrada con $49,000 sin comprobante. El viaje no vuelve a abrirse solo.

Causa probable: el freno se diseñó para el caso de cero comprobantes, no para el umbral de cobertura. REINCIDENTE.

### Abierto 2 — Agente de cobranza mudo para población objetivo: REINCIDENTE, agravado

El motor `src/lib/likida/agentes/cobranza_pura.ts` y `cobranza.ts` manejan el texto libre contra ventanas cerradas. Revisé la emisión de recordatorios.

`src/lib/likida/agentes/cobranza_pura.ts:98-110`:

```
const texto = `Hola ${cliente.nombre}, te recuerdo que la factura ${factura.folio} venció el ${fechaVencimiento}.`;
await enviarWhatsApp({ to: cliente.telefono, text: texto });
```

El texto es plantilla fija, sin monto, sin detalle de adeudo. La población objetivo de cobranza (contralores de flota) usa WhatsApp; si la factura tiene adeudo de $20,000 y el texto dice “te recuerdo que venció”, el contralor no tiene con qué decidir. El tier se consume igual porque `consumirTier` se llama antes de saber si el mensaje fue útil.

`src/lib/likida/agentes/cobranza_pura.ts:84`:

```
await consumirTier({ tenantId, tier: "cobranza" });
```

Consecuencia: cada ventana de 24h se pierde sin recuperación, y el mensaje no hace cobrable la deuda. El tier queda consumido aunque el destinatario no responda.

Causa probable: el agente se probó en el camino feliz de “responder” y no en el escenario de ventana cerrada. REINCIDENTE.

### Abierto 3 — Choque `uq_viaje_abierto_por_operador` narrado como transitorio: REINCIDENTE, confirmado

`src/lib/likida/despacho_wa.ts:88-102`:

```
catch (e) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    return { response: "Ya tienes un viaje abierto, termínalo antes de abrir otro." };
  }
  return { response: "No pude crear el viaje, intenta de nuevo." };
}
```

El mensaje “Ya tienes un viaje abierto” no distingue si el choque es por `uq_viaje_abierto_por_operador` o por otra constraint. Si el viaje anterior ya está cerrado en base pero el choque persiste por una fila vieja, el chofer recibe una instrucción que no puede cumplir.

`src/lib/likida/despacho_wa.ts:55`:

```
const viajeAbierto = await prisma.viaje.findFirst({ where: { operadorId, estado: "abierto" } });
if (viajeAbierto) {
  return { response: "Ya tienes un viaje abierto, termínalo antes de abrir otro." };
}
```

El mensaje se emite también en el camino determinístico previo al insert. Si la base dice que no hay viaje abierto y el insert falla por la constraint, el texto sale igual. El chofer no sabe si su viaje anterior está cerrado o atorado.

Consecuencia: el chofer queda bloqueado con un mensaje que no describe su estado real; la constraint de unicidad persiste y el humano no recibe la salida que resolvería.

Causa probable: el catch de P2002 se narró con una sola causa posible, sin inspeccionar la fila que disparó la constraint. REINCIDENTE.

## Hallazgos nuevos

### [ALTO] Un error a mitad de la emisión de mensaje duplica el aviso sin persistir el estado de “avisado”

`src/lib/likida/processor.ts:402-470`

Revisé la rama de oficina. El flujo:

```
417: const aviso = await prisma.aviso.create({ data: { viajeId: viaje.id, tipo: "salida" } });
418: await enviarWhatsApp({ to: operador.telefono, text: `Viaje ${viaje.id} asignado...` });
```

No vi un `try/catch` que marque el aviso como fallido. Si `enviarWhatsApp` falla después de crear el aviso en base, la base dice “avisado” y el operador no recibió el mensaje. El ciclo muere ahí: no hay reenvío, no hay estado fallido, no hay cierre hacia el humano.

Escenario concreto: entra un viaje de despacho para el operador con telefono `+52 1 55 0000 0000`; la API de WhatsApp devuelve error 500; el registro `aviso` queda con `estado: "enviado"` o equivalente. El operador nunca ve la asignación. El contralor ve el viaje asignado y avisado.

Consecuencia: el chofer no se presenta, la flota pierde el viaje, y el contralor cree que fue avisado.

Causa probable: el modelo de datos no contempla estado de envío para el aviso, y el código no distingue entre persistir el intento y confirmar la entrega.

### [MEDIO] La secuencia de tools del chat persiste historial, pero si el streaming muere a mitad, el usuario no ve un cierre parcial

`src/lib/agents/run.ts:89-120`

Revisé el loop de tools. Al final de cada herramienta se persiste el historial. Si el stream NDJSON se corta (por timeout del cliente o del server) después de persistir la tool, el usuario no recibe un mensaje de cierre, y al reabrir el chat ve un turno sin respuesta. El registro queda consistente, pero la conversación no cierra.

Escenario: el usuario pregunta “dame el total de adeudos por cliente”; la herramienta `listar_adeudos` se ejecuta y persiste, el stream se corta antes del texto final. El usuario ve que el agente “se trabó” y no sabe si la respuesta llegó.

Consecuencia: la confianza del usuario en el chat con datos se degrada; el historial muestra un turno del modelo sin salida.

Causa probable: el streaming no distingue entre “turno en progreso” y “turno completo”, y no hay un endpoint de reconciliación al reabrir.

### [BAJO] El prompt del agente analista autoriza narrar lo que debería ser determinístico

`src/lib/likida/agents/analista.ts:18-25`

Vi una instrucción como:

```
"puedes redactar la respuesta con los datos obtenidos de las herramientas"
```

El agente tiene herramientas de solo lectura, pero el prompt no le prohíbe generar cifras si la herramienta falla. Si la herramienta devuelve error y el modelo no lo detecta, puede producir una cifra incorrecta en lenguaje natural.

Escenario: el usuario pide “el saldo pendiente de la flota”; la herramienta `obtener_saldo_pendiente` falla con timeout; el modelo responde “el saldo es $45,000” basado en el contexto de la conversación, sin que la herramienta lo confirme.

Consecuencia: el contralor ve una cifra que no está en la base.

Causa probable: el prompt no exige que cada cifra sea citada de la salida de la herramienta, con verificación de error explícita.

## Lo que revisé y está bien

- `src/lib/agents/registry.ts:17-33` — el registro de herramientas valida los nombres y no hay duplicados. Las firmas están cerradas para solo lectura en el agente analista.
- `src/lib/likida/processor.ts:1920-1945` — la rama de hitos de viaje cierra con mensaje al operador cuando el viaje ya estaba cerrado; no hay cierre mudo.
- `src/lib/likida/conv.ts:15-50` — el mutex por conversación y la barrera de ráfaga están implementados con lock de base de datos y timeout; no encontré carreras entre mensajes del mismo lote.
- `src/lib/likida/cuadre/guardia.ts:40-70` — el guardia del cuadre previene cierres parciales y notifica al humano; está bien cerrado.
- `src/lib/likida/cuadre/resumen.ts:25-55` — el resumen del cuadre no emite cifras si no hay datos para cada rubro; el texto es determinístico.

## Lo que NO alcancé a revisar

- `src/lib/agents/prompts.ts` no lo abrí completo; solo revisé el archivo de analista. No descarto instrucciones similares en otros agentes.
- El cron de escalación (`api/cron/escalar`) quedó pendiente en su interacción con el motor de cobranza.
- No revisé `src/lib/likida/startup.ts` ni `src/lib/presupuesto.ts` por falta de tiempo.
- No pude ejecutar las pruebas del rubro; la evaluación es estática. Los hallazgos no están confirmados con prueba-roja-primero.

---

**Resumen de severidades:** 3 reincidentes (2 ALTOS, 1 ALTO) y 3 nuevos (1 ALTO, 1 MEDIO, 1 BAJO). Los tres abiertos que me tocan de la ronda anterior siguen vivos, dos con evidencia de agravamiento por persistencia del texto contradictorio.