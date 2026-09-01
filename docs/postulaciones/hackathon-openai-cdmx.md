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

Cuatro campos, todos sobre **la persona**, no sobre el producto. Cada uno viene
medido contra su límite de caracteres.

> ⚠️ **Lo que está sustentado y lo que no.** Likida, la fábrica de hielo,
> Kairotec y Moni AI salen de este entorno y del repo. Lo que **no** tengo, y
> por eso no lo escribí: tu formación, tus años de experiencia y tus
> credenciales. El campo de Habilidades los pide explícitamente — hay una
> versión corta abajo con espacio libre para que los metas tú.

### 6.1 Biography — 800 caracteres

```
Fundador de Likida, la oficina administrativa con IA para el autotransporte mexicano: el chofer manda por WhatsApp la foto de un ticket de diésel o caseta, y un motor determinista devuelve la liquidación del viaje cerrada, con el CFDI validado contra el SAT. Lo construyo solo —producto, motor fiscal y código— y hoy corre en producción contra datos reales de una flota.

En paralelo opero negocios que sí tienen clientes: una fábrica de hielo en México y Kairotec, una agencia de soluciones de IA. Esa mezcla es mi sesgo: no me interesa la IA que impresiona en un demo, me interesa la que un contralor puede firmar. Por eso Likida está construido para no inventar nunca una cifra —lo que no puede verificar, lo marca como pendiente en vez de rellenarlo.
```

**754 / 800.**

### 6.2 Projects — 500 caracteres

```
Likida se lleva casi todo: motor fiscal, cuadre determinista y una compañía de agentes que auditan el propio repo.

En paralelo, Moni AI —finanzas personales para LATAM con progresión tipo Duolingo (FastAPI, Supabase, Qdrant, React Native)—.

Y lo que hago por gusto: agentes que operan portales web que nadie programó, cobranza automatizada por WhatsApp para mis propios negocios, y un radar que lee el internet buscando oportunidades.
```

**436 / 500.** Confirma que sigues activo en Moni AI; si no, sale y sobran 130 caracteres.

### 6.3 Skills — 500 caracteres

La pregunta pide credenciales, logros y **años de experiencia por área**. No los
tengo, así que van dos versiones: la completa, y una corta que te deja ~100
caracteres libres para añadirlos.

**Versión completa (485/500):**

```
Ingeniería de producto con IA de punta a punta: diseño el sistema, escribo el código y lo opero. Likida son 257 migraciones versionadas, más de 9,000 pruebas y aislamiento por inquilino desde la primera migración.

Especialidad: sistemas agénticos que tocan dinero — tool-calling, presupuesto y kill switch por agente, y la disciplina de separar lo que el modelo redacta de lo que el código decide.

Fiscal mexicano aplicado: CFDI 4.0, Carta Porte, deducibilidad con fundamento citado.
```

**Versión corta (402/500) — mete tus años y credenciales al final:**

```
Ingeniería de producto con IA de punta a punta: diseño el sistema, escribo el código y lo opero. Likida son 257 migraciones y más de 9,000 pruebas.

Especialidad: sistemas agénticos que tocan dinero — tool-calling, presupuesto y kill switch por agente, y separar lo que el modelo redacta de lo que el código decide.

Fiscal mexicano aplicado: CFDI 4.0, Carta Porte, deducibilidad con fundamento citado.
```

### 6.4 Building a startup — 500 caracteres

```
Sí: Likida (likida.ai). Liquidación de viajes de carga por WhatsApp para flotas mexicanas.

Cerrar un viaje hoy son tickets en la guantera, captura manual y un contador que descubre semanas después qué era deducible. Leí más de 5,000 vacantes mexicanas vivas: 828 empresas contratan exactamente ese puesto, con sueldo mediano de $11,129 a $14,500 al mes. Eso es lo que sustituye un número de WhatsApp.

Pre-ingresos, en producción contra datos reales de una flota. Un fundador.
```

**477 / 500.** Cierra con «Un fundador» a propósito: en un hackathon, que una
persona sola tenga esto corriendo es el argumento, no la disculpa.
