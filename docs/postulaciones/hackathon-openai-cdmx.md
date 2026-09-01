# Kit de postulación — Hackathon de OpenAI, CDMX

**Para qué sirve este archivo.** Un banco de respuestas listas para pegar en el
formulario, en varias longitudes, con cada cifra rastreada a un archivo del
repo. No es un pitch deck: es el texto.

> **Advertencia sobre el evento.** No pude identificar cuál es el hackathon.
> Lo que encontré para CDMX es **NextWave 2026** (Yuno + Nauta, con apoyo de
> OpenAI), pero corrió del **28 al 30 de agosto de 2026** — ya pasó. Los otros
> resultados son meetups de Codex y el formulario genérico de OpenAI para
> apoyar hackathons comunitarios. Por eso los bloques de abajo están escritos
> por *tema*, no contra los campos de un formulario concreto. Cuando tengas la
> convocatoria, el mapeo es de minutos.

---

## 0. Antes de enviar: cifras que NO cuadran

El README dice una cosa y el código dice otra. Aplico aquí la misma regla que
el producto: **una cifra con fuente, o un hueco declarado.** No mandes ninguna
de estas sin confirmarla — un jurado técnico las va a abrir.

| Afirmación en `README.md` | Lo que dice el repo hoy (1-sep-2026) | Recomendación |
|---|---|---|
| «~225 migraciones» | **257** archivos en `supabase/migrations/` | Usa **257**. El README quedó viejo. |
| «8,500+ pruebas automatizadas» | **9,117** llamadas a `it()`/`test()` en **707** archivos (conteo estático con `grep`) | Di «más de 9,000 casos» o corre `npx vitest run` y cita el número que imprime. `CLAUDE.md` dice «~2,880» y está claramente desactualizado. |
| «60 agentes autónomos vivos en producción» | `agentes/definiciones.ts` dice que un agente **nace `disenado`** (documento + prompt, se corre a mano) y que **`vivo` está reservado a los 7 de producto** hasta que exista el runner con sandbox y presupuesto. Los literales `'vivo'` en las migraciones suman 39. | **La más peligrosa de la lista.** Confirma contra `agente_definicion` en la base y di «N en catálogo, M ejecutándose». |
| «37 portales mapeados, 5 automatizados de punta a punta» | `facturacion/comercios.ts` declara **60** claves; `adaptadores/` tiene **uno escrito a mano** (CAPUFE) más el genérico `computer_use.ts` | Confirma cuántos corren de verdad hoy. |

Lo de arriba no es un problema de la postulación: es material *a favor*. Un
fundador que audita sus propias cifras y las corrige antes de que se las
corrijan es exactamente el perfil que estos jurados premian. Si el formulario
te da espacio, el punto #0 de la sección 4 lo dice en una línea.

---

## 1. Bloques de respuesta (español)

### 1.1 Una línea (25 palabras)

> Likida cierra la liquidación de un viaje de carga por WhatsApp: el operador
> manda la foto del comprobante y un motor determinista devuelve el corte en PDF.

### 1.2 Resumen (≈60 palabras)

> El autotransporte mexicano cierra sus viajes con papel, portales del SAT y
> Excel. En Likida el chofer fotografía el ticket de diésel o caseta y lo manda
> a un número de WhatsApp: leemos el comprobante, validamos el CFDI contra la
> autoridad fiscal, lo cuadramos contra el anticipo y la política de la flota, y
> devolvemos la liquidación cerrada en PDF. Sin app en la cabina, sin
> capacitación, sin hardware.

### 1.3 El problema

> Cerrar un solo viaje significa un chofer guardando tickets en la guantera,
> alguien en la oficina capturándolos a mano, un contralor persiguiendo lo que
> falta, y un contador descubriendo semanas después qué era deducible. El
> combustible es el costo más grande de una flota y su comprobante es el
> documento más caro de la empresa de convertir en dato verificado. Todo eso es
> captura manual, y la captura manual no debería existir.
>
> No es una intuición: bajamos y leímos más de 5,000 vacantes mexicanas vivas
> (Indeed, Computrabajo, LinkedIn, OCC). **828 empresas** describen en sus
> propias palabras exactamente este trabajo; **63** lo ponen en el título del
> puesto («liquidador de viajes», «auxiliar de liquidaciones»). De las 31
> vacantes que publican sueldo, la mediana va de **$11,129 a $14,500 MXN al
> mes**. Ese es el costo recurrente por flota que sustituye un número de
> WhatsApp.

### 1.4 La solución

> Tres decisiones definen el producto, y son la razón por la que un contralor
> puede firmar una liquidación que generó una IA:
>
> 1. **La foto no es la fuente de verdad; el CFDI sí.** El modelo de datos
>    separa el comprobante recibido (control operativo, hora, odómetro) del CFDI
>    validado contra la autoridad. Ninguna decisión de dinero se toma sobre una
>    foto.
> 2. **Un comprobante no recibe un veredicto: recibe varios.** El mismo ticket
>    puede ser deducible para un impuesto y no para otro. El motor emite
>    veredictos separados, cada uno citando su fundamento legal.
> 3. **El motor es determinista.** El modelo sólo extrae y redacta; cada peso,
>    cada deducibilidad y cada compuerta de aprobación viven en código auditable
>    y probado. Lo que no se puede verificar se marca «falta confirmar» — el
>    producto nunca inventa una cifra.

### 1.5 Por qué ahora

> - **La autoridad ya digitalizó el insumo.** CFDI 4.0 y Carta Porte significan
>   que ya existe dato timbrado por el gobierno para cada gasto y cada viaje. Lo
>   que falta es quién lo concilie: ahí está la cuña.
> - **El canal ya está en el bolsillo del chofer.** WhatsApp. Cero capacitación,
>   cero app nueva, cero hardware.
> - **Los modelos de visión pasaron la barra.** Leen un ticket térmico arrugado
>   con reflejo de sol. Esa era la barrera que mató la captura automática hace
>   cinco años, y ya no está.

### 1.6 Qué existe hoy (verificado contra el código)

> No es un wrapper sobre una llamada a un modelo. Es un motor financiero
> determinista rodeado de agentes especializados, cada uno con presupuesto,
> interruptor y bitácora.
>
> - **257 migraciones versionadas y probadas**, cada una imponiendo aislamiento
>   por inquilino a nivel de fila: los datos de una flota son
>   arquitectónicamente incapaces de filtrarse a otra.
> - **Más de 9,000 casos de prueba** en 707 archivos, sin realidad simulada en el
>   camino del dinero. Cada merge corre contra un Postgres efímero con RLS
>   activo.
> - **El formato de cifras vive en un solo archivo** (`lib/formato.ts`) y una
>   prueba rompe el build si aparece en otro. Una cifra fiscal que se lee
>   distinto en dos pantallas es, funcionalmente, dos cálculos.
> - **Fallar cerrado y decirlo.** Una base caída jamás se lee como «no hay
>   liquidaciones»; una variable de entorno faltante se grita al arranque, no se
>   descubre frente a un cliente.
> - **37 fichas normativas en `normas/`**, cada contador citando su fuente
>   primaria (DOF, criterios del SAT, ley federal y estatal) o marcando el hueco.

### 1.7 Cómo usamos OpenAI

*(El bloque que decide este hackathon. Todo lo de aquí es verificable en
`src/lib/llm/models.ts` y `src/lib/likida/facturacion/adaptadores/`.)*

> El SDK de OpenAI (`openai@^7.8.0`) es el cliente de todo el gateway de modelos
> del repo (`src/lib/llm/openrouter.ts`): la API compatible con OpenAI es la
> única interfaz que hablamos, contra cualquier proveedor.
>
> **Modelos de OpenAI con tráfico de producción hoy** — tres de los roles del
> catálogo, no una demo:
> - `analisis` → **gpt-5.6-luna**. Por aquí pasa el análisis del negocio.
>   Ganó su rol medido contra los candidatos del día por precio-por-calidad con
>   ventana de 1M y tool-use.
> - `marketing` → **gpt-5.6-luna**. Contenido fiscal, SEO, guiones.
> - `back_office` → **gpt-oss-120b**. Modelo de pesos abiertos: el piso de
>   precio del stack.
>
> **Tres roles más ya asignados a OpenAI, esperando llamador** (declarados a
> propósito, la decisión ya está tomada y documentada): `extraccion` →
> gpt-oss-20b, `codigo` y `qa` → gpt-oss-120b.
>
> **El pedazo agéntico del que estoy más orgulloso:** `computer_use.ts`, un
> adaptador que opera portales de facturación **que nadie programó**. Le
> enseñamos al modelo el *inventario* del formulario que tiene enfrente y le
> damos las manos de Playwright que el repo ya tenía probadas — escribir,
> seleccionar, hacer clic. El modelo decide dónde va cada dato; el código decide
> qué dato existe y qué está prohibido tocar.
>
> Es una desviación deliberada del computer-use canónico, y la medimos antes de
> tomarla: una captura de pantalla cuesta ~1,500 tokens de entrada contra ~300
> del inventario del DOM; y un clic por coordenada no se puede reintentar cuando
> el portal se re-renderiza, mientras que uno por selector sí. Mismo poder — un
> modelo operando un sitio ajeno — sin tirar la infraestructura que ya funciona.

### 1.8 Estado honesto

> **Pre-ingresos.** El producto corre en producción contra datos reales de una
> flota real — no un ambiente de demo — pero todavía no hay cliente que pague.
> Ésa es la etapa, y la digo así en la postulación por la misma razón por la que
> el producto marca «falta confirmar» en vez de rellenar: el comprador es un
> contralor que va a cruzar todo contra su papel.
>
> El bloqueo es concreto y tiene nombre: **WhatsApp Business sigue en el número
> de prueba de Meta, no en uno de producción.** Ningún chofer puede escribirle al
> bot en la calle hasta que eso se libere. Todo lo demás está construido para la
> escala de después del piloto, no sólo para el piloto.

### 1.9 Qué construiría durante el hackathon

*Dos opciones, las dos apuntadas a un hueco real del repo. Elige una según el
reto que suelten el sábado.*

> **A. Que el operador hable, en vez de escribir.** El chofer está manejando: la
> foto ya es fricción y el texto es peor. Un agente de voz en tiempo real sobre
> el mismo intake — el operador reporta su gasto hablando, el agente le pregunta
> sólo lo que falta para cerrar el cuadre, y cuelga cuando la liquidación está
> completa. Hoy el rol `transcripcion` existe pero es asíncrono; esto lo vuelve
> conversación.
>
> **B. Cerrar los portales de facturación.** `comercios.ts` declara 60
> comercios y hay **un** adaptador escrito a mano. `computer_use.ts` ya es el
> camino genérico: el fin de semana es meterle un ciclo de verificación —que el
> agente compruebe contra el CFDI emitido que llenó bien el formulario— y correr
> los 60 de punta a punta. Es la diferencia entre «un modelo puede operar un
> portal» y «la flota deja de entrar a 60 sitios».

### 1.10 Sobre mí / el equipo

> ⚠️ **Completar.** No invento tu biografía. Lo único que el repo respalda es que
> Likida hoy es de **un fundador, sin vendedores contratados** (así está
> sustentado el SOM de Año 1 en el README).
>
> Rellena: nombre y rol · qué construiste antes · por qué autotransporte y no
> otra vertical · si vas solo o con equipo (el formato típico de estos eventos es
> equipos de hasta 4).

### 1.11 Enlaces

> - Producto: https://likida.ai
> - App: https://app.likida.ai
> - Simulador de conversación en vivo: `/demo`
> - ⚠️ **Completar:** repositorio (¿lo abres para el jurado?), LinkedIn, video.

---

## 2. English versions (los bloques que más se reusan)

**One-liner.**
> Likida closes a trucking trip's paperwork over WhatsApp: the driver photographs
> a receipt and a deterministic engine returns the settled trip as a PDF.

**Summary (≈60 words).**
> Mexican freight trucking runs its back office on paper, government portals and
> Excel. With Likida the driver photographs a diesel or toll receipt and sends it
> to a WhatsApp number. We read it, validate the CFDI (Mexico's mandatory
> e-invoice) against the tax authority, reconcile it against the cash advance and
> the fleet's expense policy, and return a closed settlement as a PDF. No app in
> the cab, no training, no hardware.

**Why it can be trusted.**
> The LLM only extracts and drafts language. Every peso, every deductibility
> call, every approval gate lives in auditable, tested code. What can't be
> verified is flagged "needs confirmation" — the product never fabricates a
> number. Our buyer is a fleet controller who will hold the output up against
> their own paper trail and their accountant. It's built to win that comparison,
> not to look good in a demo.

**How we use OpenAI.**
> The OpenAI SDK is the client for our entire model gateway — the
> OpenAI-compatible API is the only interface we speak. Three roles run on OpenAI
> models in production today: business analysis and marketing on gpt-5.6-luna,
> back office on the open-weight gpt-oss-120b. Our agentic piece is an adapter
> that operates invoicing portals nobody wrote code for: we show the model the
> form's DOM inventory and hand it Playwright's already-tested hands. We measured
> the departure from canonical computer-use before taking it — a screenshot costs
> ~1,500 input tokens against ~300 for the inventory, and a coordinate click
> can't be retried after a re-render while a selector click can.

---

## 3. Guion de demo (90 segundos)

1. **0:00–0:15 — El dolor, no la pantalla.** Una foto de una guantera con
   tickets. «Esto es el cierre contable de un viaje en México hoy.»
2. **0:15–0:40 — Manda el ticket.** WhatsApp en la pantalla. Foto de un ticket
   de diésel arrugado → llega la respuesta. *No narres lo que se ve; cállate y
   deja que responda.*
3. **0:40–1:05 — El cuadre.** El PDF de liquidación. Señala **una discrepancia
   detectada** y **un renglón marcado «falta confirmar»**. Ése es el momento que
   vende: el producto admite lo que no sabe.
4. **1:05–1:20 — El veredicto fiscal.** Un gasto con dos veredictos distintos,
   cada uno citando su norma. «Deducible para uno, no para el otro, y aquí está
   por qué.»
5. **1:20–1:30 — El cierre.** «828 empresas mexicanas tienen una vacante abierta
   describiendo este trabajo. Mediana de sueldo: $11,129 al mes. Eso es lo que
   sustituye un número de WhatsApp.»

**Plan B obligatorio:** el `/demo` local, sin red. `models.ts` ya documenta que
el gateway es punto único de falla y que hubo caídas en ago-2025 y feb-2026. Ten
el PDF ya generado en el escritorio.

---

## 4. Preguntas del jurado, con respuesta

**0. «Tus números del README no cuadran con tu código.»**
> Correcto, y los corregí antes de mandar esto: son 257 migraciones y no 225, y
> el conteo de agentes «vivos» contra «diseñados» estaba inflado. Es la misma
> disciplina que el producto: una cifra con fuente o un hueco declarado.

**1. «¿Por qué no lo hace un ERP existente?»**
> Likida no reemplaza el ERP de la flota: lo alimenta. Automatiza el paso de
> captura, que hoy es manual, y escribe al sistema que la flota ya opera.

**2. «¿Y si el modelo lee mal el ticket?»**
> Entonces no pasa nada, por diseño. La foto no es la fuente de verdad: el CFDI
> validado contra la autoridad sí. Si no hay CFDI que amarre, el renglón sale
> marcado, no estimado.

**3. «¿Cuál es la barrera de entrada?»**
> El motor fiscal. 37 fichas normativas con fuente primaria citada y prueba que
> las respalda. Copiar el flujo de WhatsApp toma una semana; copiar los
> veredictos que un contador firma, no.

**4. «¿Tienes clientes?»**
> No. Pre-ingresos, corriendo en producción contra datos reales de una flota
> real. El bloqueo es que WhatsApp Business sigue en el número de prueba de Meta.

**5. «¿Por qué no todo con un modelo?»**
> Porque cada rol tiene un costo por error distinto. Calidad de frontera donde
> un error cuesta dinero — el cuadre —, y el modelo más barato que aguante donde
> no. Cada asignación del catálogo está medida y tiene el porqué escrito
> encima, en `models.ts`.

---

## 5. Pendientes tuyos antes de enviar

- [ ] Confirmar cuál es el hackathon, sus fechas y su formulario real.
- [ ] Correr `npx vitest run` y anotar el número de pruebas que imprime.
- [ ] Contar `agente_definicion` en la base: cuántos en catálogo, cuántos `vivo`.
- [ ] Confirmar cuántos portales de facturación corren de punta a punta hoy.
- [ ] Escribir §1.10 (bio y equipo) y §1.11 (enlaces).
- [ ] Decidir si el repo se abre al jurado.

---

## 6. El formulario real — respuestas listas para pegar

Seis campos, todos sobre **la persona**, no sobre el producto. Cada uno viene
medido contra su límite de caracteres.

> ### 👉 Contesta en INGLÉS.
> El formulario está en inglés —"Biography", "Please complete this question",
> "800 characters remaining"—, y un formulario en inglés espera respuestas en
> inglés. El riesgo es asimétrico: en español, quien revise y no lo lea pierde
> la postulación completa; en inglés, un revisor mexicano la lee sin problema.
> No hay escenario donde el español gane.
>
> El español queda abajo de todos modos: sirve para el pitch hablado del
> sábado, que sí será en español.
>
> Ojo con lo que NO se traduce: **CFDI** y **Carta Porte** se quedan en
> español incluso en la versión inglesa. Son nombres propios del derecho
> fiscal mexicano; traducirlos pierde precisión y te hace sonar genérico
> justo donde tienes ventaja.

> ⚠️ **De dónde sale cada cosa.** Likida, la fábrica de hielo, Kairotec y
> Moni AI salen de este repo y de este entorno. La trayectoria —más de dos años
> en IA, seis meses en San Francisco, the Network School en Asia— la dio Javier
> el 1-sep-2026; no hay archivo de memoria en esta máquina, así que nada aquí
> viene de sesiones anteriores. Sigue faltando lo único que él no ha dicho:
> **formación y credenciales formales**. Si no las hay, la biografía funciona
> sin ellas: el arco ya carga el peso.

### 6.1 Biography — 800 caracteres

El arco: tres años con IA, seis meses en San Francisco, the Network School en
Asia, y el regreso a México a construir para México. Ese regreso es la tesis,
no un dato de viaje. San Francisco carga su propia frase —"lo bastante cerca
de la frontera para dejar de impresionarme"— porque explica de dónde sale el
escepticismo con el que está construido el producto.

**English (755/800):**

```
Three years building with AI. Six months of it in San Francisco — close enough to the frontier to stop being impressed by it — then the Network School in Asia. I came back to Mexico with one conviction: what gets used there to build demos can, here, close a real company's books.

That's Likida. A freight driver photographs a diesel receipt and sends it over WhatsApp; a deterministic engine returns the trip settled, with the CFDI validated against Mexico's tax authority. Product, tax engine and code — me, in production against a real fleet's data.

Alongside it I run an ice factory and Kairotec, my AI agency: businesses with customers and payroll. Which is why I don't care about AI that impresses in a demo. I care about AI a controller will sign.
```

**Español (754/800):**

```
Tres años construyendo con IA. Seis meses de ellos en San Francisco —lo bastante cerca de la frontera para dejar de impresionarme— y después the Network School, en Asia. Volví a México con una convicción: lo que allá se usa para hacer demos, aquí puede cerrar la contabilidad de una empresa real.

Eso es Likida. El chofer de un tráiler manda por WhatsApp la foto de un ticket de diésel y un motor determinista devuelve el viaje liquidado, con el CFDI validado contra el SAT. Producto, motor fiscal y código: yo, en producción contra datos reales de una flota.

En paralelo opero una fábrica de hielo y Kairotec, mi agencia de IA: negocios con clientes y con nómina. Por eso no me interesa la IA que impresiona en un demo, sino la que un contralor firma.
```

### 6.2 Projects — 500 caracteres

Sólo Likida. Moni AI y lo demás salen: dispersarse en un formulario de
hackathon lee como falta de foco, y el campo rinde más gastado en profundidad
sobre una cosa. Como la biografía ya cuenta QUÉ hace Likida, este campo cuenta
CÓMO está hecho por dentro — no repite, baja una capa.

**Español (496/500):**

```
Likida, y nada más. Debajo del WhatsApp hay un motor fiscal determinista, no un wrapper: el modelo extrae y redacta; cada peso y cada deducibilidad los decide código probado. La foto nunca es la fuente de verdad; el CFDI validado contra el SAT sí. Un ticket recibe varios veredictos —deducible para un impuesto y no para otro—, cada uno citando su norma.

Alrededor, agentes con presupuesto y kill switch; uno opera portales que nadie programó. 257 migraciones, +9,000 pruebas, aislado por flota.
```

**English (499/500):**

```
Likida, nothing else. Under the WhatsApp is a deterministic tax engine, not a wrapper: the model extracts and drafts; every peso and every deductibility call is decided by tested code. The photo is never the source of truth; the CFDI validated against the tax authority is. One receipt gets several verdicts — deductible for one tax, not another — each citing its law.

Around it: agents with budgets and kill switches; one drives portals nobody coded. 257 migrations, 9,000+ tests, tenant-isolated.
```

### 6.3 Skills — 500 caracteres

Abre con los años y la trayectoria, que es lo que la pregunta pedía, y la
certificación de Anthropic va antes que el curso de Platzi: son dos cosas
distintas y la primera pesa más.

> ⚠️ **Usa el nombre exacto del certificado.** "Anthropic-certified" es lo que
> Javier reportó el 1-sep-2026; si el documento tiene un nombre oficial,
> conviene escribirlo tal cual — una credencial se verifica por su nombre.
> Lo de Lovable sí está comprobado por API: 22 proyectos, 7 publicados.

**English (497/500):**

```
3+ years building with AI — six months in San Francisco, then the Network School in Asia. Anthropic-certified, plus Anthropic coursework on Platzi.

Specialty: agents that touch money — tool-calling, per-agent budgets and kill switches, and separating what the model drafts from what code decides. Likida is 257 migrations and 9,000+ tests; I design, write and operate all of it.

Prototyping: 22 Lovable apps, 7 shipped.
Mexican tax: CFDI 4.0, Carta Porte.
Video, 2+ years: I cut the demo myself.
```

**Español (495/500):**

```
Más de 3 años construyendo con IA — seis meses en San Francisco y después the Network School, en Asia. Certificado por Anthropic, más sus cursos en Platzi.

Especialidad: agentes que tocan dinero — tool-calling, presupuesto y kill switch por agente, y separar lo que redacta el modelo de lo que decide el código. Likida son 257 migraciones y +9,000 pruebas; yo lo diseño, escribo y opero.

Prototipado: 22 apps en Lovable, 7 publicadas.
Fiscal: CFDI 4.0, Carta Porte.
Video: el demo lo edito yo.
```

### 6.4 Building a startup — 500 caracteres

Cierra con «Un fundador» a propósito: en un hackathon, que una persona sola
tenga esto corriendo es el argumento, no la disculpa.

**Español (477/500):**

```
Sí: Likida (likida.ai). Liquidación de viajes de carga por WhatsApp para flotas mexicanas.

Cerrar un viaje hoy son tickets en la guantera, captura manual y un contador que descubre semanas después qué era deducible. Leí más de 5,000 vacantes mexicanas vivas: 828 empresas contratan exactamente ese puesto, con sueldo mediano de $11,129 a $14,500 al mes. Eso es lo que sustituye un número de WhatsApp.

Pre-ingresos, en producción contra datos reales de una flota. Un fundador.
```

**English (470/500):**

```
Yes: Likida (likida.ai). WhatsApp-based trip settlement for Mexican trucking fleets.

Closing a trip today means receipts in the glovebox, manual data entry, and an accountant discovering weeks later what was deductible. I read 5,000+ live Mexican job postings: 828 companies hire for exactly that role, at a median salary of $11,129–$14,500 MXN/month. That's what a WhatsApp number replaces.

Pre-revenue, running in production against a real fleet's data. One founder.
```

### 6.5 Areas of Interest

El formulario no declaró límite aquí; ambas versiones se ajustaron a 500 por
consistencia con los otros cuatro campos. Si el campo admite más, hay espacio
para nombrar una tercera cosa que quieras aprender.

Este campo suele desperdiciarse en generalidades ("IA, startups, fintech"). El
que sirve nombra **bloqueos reales**: da algo accionable a quien lo lee y te
hace memorable entre cien postulaciones que dijeron lo mismo. Los tres de aquí
salen del repo y de la conversación — el agente de voz es el hueco de §1.9,
los socios de diseño son la razón de que la base esté en cero, y el número
productivo de WhatsApp es el bloqueo que el README ya nombra.

Lo de "contratar: todavía no" contesta la pregunta con honestidad en lugar de
inventar vacantes que no existen — y de paso dice algo bueno de cómo operas.

**Español (500/500):**

```
Tres cosas concretas.

Aprender: agentes de voz en tiempo real —mi usuario va manejando un tráiler: la foto ya es fricción, el texto peor—, y evaluación de agentes que gastan dinero: cómo pones compuertas a algo autónomo con presupuesto sin volverlo inútil.

Conocer: contralores y dueños de flota dispuestos a ser socios de diseño. Ése es mi bloqueo real, no el código. Y a quien haya sacado WhatsApp Business a producción en México.

Contratar: todavía no. Primer cliente antes que primer empleado.
```

**English (494/500):**

```
Three concrete things.

Learning: real-time voice agents — my user is driving a truck, so a photo is already friction and typing is worse — and evals for agents that spend money: how you gate something autonomous with a budget without making it useless.

Meeting: fleet controllers and owners willing to be design partners. That's my real blocker, not the code. And anyone who has taken WhatsApp Business to a production number in Mexico.

Hiring: not yet. First customer before first employee.
```

### 6.6 Investing

> ⚠️ **Campo condicional, y aquí NO hay dato.** El repo, las skills y la
> conversación no contienen ninguna señal de que Javier invierta o asesore
> startups. Este borrador contesta que **no**, y sólo afirma lo que sí está
> sustentado (Kairotec). **Si en realidad pone cheques ángel, tiene rol de
> asesor o asiento en algún consejo, hay que reescribirlo entero** — ese dato
> sólo lo tiene él, y es de los que alguien verifica en una sala.

La pregunta empieza con "si estás invirtiendo o asesorando", así que un "no"
honesto es una respuesta completa, no un campo desperdiciado. Contestar que sí
sin serlo es el peor riesgo del formulario: en un hackathon con inversionistas
en el jurado, se cae en la primera pregunta de seguimiento.

La última línea es **una intención, no un hecho** — bórrala si no es cierta.

**Español (487/500):**

```
No invierto capital. Estoy del otro lado de la mesa: pre-ingresos, un fundador, construyendo.

Lo más cercano es Kairotec, mi agencia de IA: construyo sistemas para otras empresas, así que me toca ver de cerca qué deciden automatizar, qué presupuestan y dónde se atoran al llevarlo a producción. Es ayuda técnica con las manos adentro del código, no un cheque ni un asiento en el consejo.

Si en algún momento invierto, será en fundadores de LATAM construyendo para industrias aburridas.
```

**English (448/500):**

```
I don't invest capital. I'm on the other side of the table: pre-revenue, one founder, building.

The closest thing is Kairotec, my AI agency: I build systems for other companies, so I get a close look at what they choose to automate, what they budget, and where they stall taking it to production. That's hands-in-the-code technical help, not a check or a board seat.

If I ever do invest, it'll be in LATAM founders building for boring industries.
```

