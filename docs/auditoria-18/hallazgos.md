# Hallazgos de la auditoría 18 de Likida — 83 con `archivo:línea`

Ronda del **20-ago-2026**, corrida desatendida en la nube. Doce auditores expertos
con contexto fresco, uno por rubro, cada hallazgo verificado por el orquestador
contra el código antes de anotarse. **Global 6.1/10.**

| Severidad | Cuántos |
|---|---|
| CRÍTICO | 5 |
| ALTO | 30 |
| MEDIO | 30 |
| BAJO | 18 |
| **Total** | **83** |

Notas por rubro en esa ronda: Backend 7 · Tool calling 7 · Seguridad 7 · Fiscal 7 ·
Operabilidad 7 · Frontend 6 · Legal 6 · Pruebas 6 · Datos 6 · Agéntico 5 ·
Arquitectura 5 · **Rendimiento 4**.

---

## LÉEME ANTES DE ARREGLAR NADA

**Estos hallazgos son del 20-ago-2026 y `master` ha avanzado desde entonces.**
**Verifica cada hallazgo abriendo el archivo antes de tocarlo**: si ya está
resuelto, márcalo como resuelto y sigue. Un arreglo sobre algo ya arreglado es
cómo se introduce el bug de mañana.

### Los tres arreglos de la ronda NO están en `master`

La ronda 18 arregló tres hallazgos con prueba que los reproduce, pero esos commits
**se quedaron en la rama `claude/auditoria-18` y nunca se mergearon**. Comprobado
con `git merge-base --is-ancestor <sha> origin/master`: los tres dan «no».

| sha | Qué arregla | Hallazgo |
|---|---|---|
| `ebefdfa` | Una factura que AMPARA N casetas deja de contarse como una sola | **C1** |
| `4f25078` | El informe en PDF deja de acusarse como entregado si Meta lo rechaza | (agéntico) |
| `e1b9474` | El sondeo del mutex deja de liberar el lease de otro proceso | **A16** |

Antes de reescribir esos tres desde cero, mira si conviene traerlos:

```bash
git log --oneline origin/claude/auditoria-18 -5
git cherry-pick ebefdfa 4f25078 e1b9474
```

Traen su propia prueba. Reescribirlos a mano es pagar dos veces por el mismo
trabajo — y arriesgarse a un arreglo peor que el que ya existe.

Además, la ronda 18 admite un problema de anclaje: le entregó a sus auditores las
notas de una ronda que no correspondía, así que **la columna «antes» de cada rubro
no es comparable**. Los hallazgos sí valen — cada uno está anclado a `archivo:línea`
leído ese día.

---

## PROMPT PARA CLAUDE CODE

Copia esto tal cual al abrir la sesión:

```
Tengo un documento con 83 hallazgos de auditoría sobre este repo, con archivo:línea
y escenario de falla. Quiero que los arregles siguiendo estas reglas, que son las
del propio repo:

1. VERIFICA PRIMERO. Abre el archivo y confirma que el hallazgo sigue vivo. Muchos
   pueden estar ya arreglados: márcalos como resueltos y sigue, no los toques.
2. NO ARREGLES LO QUE NO PUEDAS REPRODUCIR. Primero la prueba que falla, luego el
   arreglo, luego la prueba verde. Sin reproducción, el hallazgo queda propuesto.
3. UNO A LA VEZ, EN SERIE. Cada uno: prueba que reproduce → arreglo → prueba verde
   → suite completa (`npm test`) → commit atómico citando el ID del hallazgo.
4. SI UN ARREGLO ROMPE ALGO, revierte ese commit y deja el hallazgo pendiente con
   la razón escrita.
5. EMPIEZA POR LOS CRÍTICOS (C1–C5), luego los ALTOS. Los MEDIOS y BAJOS quedan
   propuestos hasta que yo diga.
6. NO CAMBIES UNA CIFRA QUE EL USUARIO VE sin decírmelo explícitamente.

Antes de declarar cualquier cosa terminada: evidencia. Comando y salida real, o se
dice que no se verificó.

Al terminar cada tanda, dime qué arreglaste, qué estaba ya resuelto y qué dejaste
pendiente y por qué.
```

---

## Índice

| ID | Sev | Rubro | Hallazgo | Dónde |
|---|---|---|---|---|
| **C1** | CRÍTICO | Arquitectura | Un CFDI que ampara N gastos: la base lo llama legítimo, el motor lo llama duplicado y le qui… | `supabase/migrations/0065_cfdi_de_varias_casetas.s…` |
| **C2** | CRÍTICO | Cumplimiento legal | El nombre del decisor de un prospecto sale hacia un modelo externo sin que exista un solo av… | `src/app/api/admin/mapa-prospectos/mensaje/route.t…` |
| **C3** | CRÍTICO | Modelo de datos | La FK compuesta de la 0028 se quedó en cuatro relaciones; las veinte que vinieron después no… | `supabase/migrations/0028_fks_con_tenant.sql:91-96` |
| **C4** | CRÍTICO | Rendimiento y costo | El presupuesto es por mensaje; el `maxDuration` es por invocación | `src/lib/likida/processor.ts:444` |
| **C5** | CRÍTICO | Rendimiento y costo | Un mensaje matado a media corrida queda envenenado por su propio claim | `src/lib/likida/processor.ts:420-424` |
| **A1** | ALTO | Arquitectura | `bitacora_auditoria`: 17 escritores a mano, sin función común — uno ya escribe la entidad eq… | `src/lib/likida/administracion.ts:48-56` |
| **A2** | ALTO | Arquitectura | La URL base de la app está escrita a mano en 7 sitios y ya divergió en 4 valores distintos | `src/app/login/page.tsx:61` |
| **A3** | ALTO | Backend y API | Si la invocación muere a media ráfaga, el cron sella como procesado el mensaje que nunca se … | `src/app/api/webhook/whatsapp/route.ts:249-259` |
| **A4** | ALTO | Backend y API | El webhook de entrega de correo nunca escribe nada: `neq` descarta las filas con `entrega_es… | `src/app/api/correo/eventos/route.ts:81-95` |
| **A5** | ALTO | Backend y API | El detector de fraude acusa a la flota de duplicar un CFDI cada vez que concilia un consolidado | `src/lib/likida/duplicados.ts:85-93` |
| **A6** | ALTO | Backend y API | `/api/dashboard/ingesta` gasta visión sin techo y su costo no lo cuenta ningún medidor | `src/app/api/dashboard/ingesta/route.ts:29-77` |
| **A7** | ALTO | Cumplimiento fiscal | El 50% de peaje se acredita sobre casetas pagadas en EFECTIVO | `src/lib/likida/cuadre/engine.ts:1008` |
| **A8** | ALTO | Cumplimiento fiscal | El pie del PDF invita a subir la base del peaje 13.8%, contra el texto literal de la 9.1.8 f… | `src/lib/likida/liquidacion/acreditable.ts:47-49` |
| **A9** | ALTO | Cumplimiento legal | "Diferencias por operador" es un ranking nominal de personas, y el aviso promete lo contrario | `src/lib/likida/analytics.ts:283-334` |
| **A10** | ALTO | Cumplimiento legal | Una solicitud ARCO se pierde sin registro cuando al tenant le falta la razón social | `src/lib/likida/processor.ts:207-252` |
| **A11** | ALTO | Frontend | Un solo selector rotula cinco ventanas de tiempo distintas; "Histórico" enseña 52 semanas de… | `src/app/dashboard/panel-periodo.tsx:44-51` |
| **A12** | ALTO | Frontend | `StatCard` escribe "0% · sin movimiento" justo cuando NO pudo comparar | `src/app/admin/ui/kit.tsx:152-157` |
| **A13** | ALTO | Frontend | Una consulta caída del Resumen se pinta como "aún no hay gastos capturados", y el aviso de "… | `src/app/dashboard/panel-periodo.tsx:97-101` |
| **A14** | ALTO | Frontend | "Vencen pronto (≤ 5 días)" cuenta las que YA vencieron — y el mismo KPI se calcula distinto … | `src/app/dashboard/arco/page.tsx:71` |
| **A15** | ALTO | Modelo de datos | `gasto` y `liquidacion` son las dos únicas tablas de dinero fuera de `ve_finanzas()`: cualqu… | `supabase/migrations/0086_retirar_rol_operador.sql…` |
| **A16** | ALTO | Operabilidad y DX | El sondeo de arranque borra el mutex de un viaje real del camino del dinero | `src/lib/likida/startup.ts:63-70` |
| **A17** | ALTO | Operabilidad y DX | El fail-closed del kill switch deja los cinco crons en verde y sin correo | `src/lib/likida/interruptores.ts:72-78` |
| **A18** | ALTO | Operabilidad y DX | El runbook de las 3 a.m. dice que el canal de alerta no existe, y su prueba de deriva no pue… | `src/lib/observability/arranque.ts:52` |
| **A19** | ALTO | Pruebas | La única puerta de /vendedor no tiene una sola prueba: se rompe y la suite no se entera | `src/lib/auth/guard.ts:92-100` |
| **A20** | ALTO | Pruebas | Las dos reglas que impiden cobrar contra nada no tienen arnés | `src/lib/likida/facturacion_escritura.ts:404` |
| **A21** | ALTO | Pruebas | Las cuatro rutas de export tienen CERO líneas ejecutadas — y una de ellas documenta un IDOR … | `src/app/api/export/pdf/[id]/route.ts` |
| **A22** | ALTO | Rendimiento y costo | El mutex del viaje sigue sin techo — y lo nombra el comentario de su propio arreglo | `src/lib/likida/conv.ts:426` |
| **A23** | ALTO | Rendimiento y costo | Nueve consultas del camino caliente siguen sin techo, y con una basta | `src/lib/likida/wa_pendientes.ts:48,80,98,114,122,133` |
| **A24** | ALTO | Rendimiento y costo | `MARGEN_CIERRE_MS` ya está rebasado, y la prueba que debía atraparlo suma una tabla escrita … | `src/lib/likida/presupuesto.ts:29-32,37-54,72` |
| **A25** | ALTO | Seguridad | `/api/dashboard/ingesta` gasta modelo sin techo y sin dejar fila de costo | `src/app/api/dashboard/ingesta/route.ts:28-33` |
| **A26** | ALTO | Sistema agéntico | El informe en PDF de la oficina se acusa como entregado aunque Meta lo rechace | `src/lib/likida/oficina_wa.ts:117-118` |
| **A27** | ALTO | Sistema agéntico | Un mensaje que muere o se abandona a media ejecución queda sellado como procesado: el inbox … | `src/app/api/webhook/whatsapp/route.ts:249-259` |
| **A28** | ALTO | Sistema agéntico | El cierre de liquidación —cifras y PDF— sale por WhatsApp al *encargado*, el rol que no ve d… | `src/lib/likida/avisar_cierre.ts:95` |
| **A29** | ALTO | Sistema agéntico | El arranque libera el mutex del viaje que otro proceso está cerrando | `src/lib/likida/startup.ts:63-70` |
| **A30** | ALTO | Tool calling | El loop-guard mata la tool terminal, y con ella la respuesta ya pagada | `src/lib/llm/openrouter.ts:792-794` |
| **M1** | MEDIO | Arquitectura | Cuarta copia del mapa de conceptos, esta vez fuera del guardia que existe para eso · REINCID… | `src/lib/likida/etiquetas_sincronizadas.test.ts` |
| **M2** | MEDIO | Backend y API | La cola de facturación pide 600 s de presupuesto y corta el lote a los 150 s | `src/app/api/cron/facturar/cola/route.ts:12` |
| **M3** | MEDIO | Cumplimiento fiscal | Los litros de diésel se declaran elegibles con cualquier forma de pago que no sea efectivo, … | `src/lib/likida/cuadre/engine.ts:1035-1036` |
| **M4** | MEDIO | Cumplimiento fiscal | La rama buena de RLISR 57 es inalcanzable: nada en el producto escribe `operador.rfc` | `src/lib/likida/cuadre/engine.ts:509-514` |
| **M5** | MEDIO | Cumplimiento fiscal | Un consumo en bar se imprime 100% deducible | `src/lib/likida/cuadre/tope_alimentacion.ts:60-62` |
| **M6** | MEDIO | Cumplimiento legal | El panel del cliente cita, en pantalla, el artículo de la ley abrogada | `src/app/dashboard/arco/page.tsx:80` |
| **M7** | MEDIO | Cumplimiento legal | El aviso acota los modelos de lenguaje a "las fotos", y también viaja el texto del chofer | `src/lib/likida/privacidad.ts:592` |
| **M8** | MEDIO | Cumplimiento legal | El correo de acceso metió una credencial de sesión en la cadena de Resend/AWS y el anexo de … | `src/app/api/auth/correo/route.ts:182` |
| **M9** | MEDIO | Frontend | `costoPorViaje === null` se imprime como "$0.00" — el cero que el propio tipo prohíbe | `src/app/dashboard/kpi-periodo.tsx:67` |
| **M10** | MEDIO | Frontend | El mapa de tipos de diferencia del panel cubre 2 de los ~30 valores reales; uno de sus 3 ren… | `src/app/dashboard/agentes/liquidacion/vista.tsx:1…` |
| **M11** | MEDIO | Modelo de datos | Las tres cifras de `liquidacion` aceptan negativos y no están amarradas entre sí | `supabase/migrations/0025_dominios_check.sql:126-130` |
| **M12** | MEDIO | Modelo de datos | `gasto.ocr_confianza` no tiene rango 0–1, aunque su gemela `factura_proveedor.ocr_confianza` sí | `supabase/migrations/0001_init.sql:63` |
| **M13** | MEDIO | Modelo de datos | `prospecto.duplicado_de` admite un ciclo A→B→A, que esconde las dos filas — y el bloque que … | `supabase/migrations/0139_prospecto_calidad.sql:55…` |
| **M14** | MEDIO | Operabilidad y DX | El `codigo` estable de la causa nunca llegó al camino del dinero | `src/lib/observability/sentry.ts:238-276` |
| **M15** | MEDIO | Operabilidad y DX | `cron/runner` es el único cron sin correo y sin código de causa | `src/app/api/cron/runner/route.ts:37-43` |
| **M16** | MEDIO | Operabilidad y DX | `npm install` depende de un host fuera del registry: no se puede instalar ni desplegar un ho… | `package.json:45` |
| **M17** | MEDIO | Operabilidad y DX | El diagnóstico de configuración está apagado justo donde vive el desarrollador | `src/lib/observability/arranque.ts:65-66` |
| **M18** | MEDIO | Operabilidad y DX | `/api/health` no tiene consumidor, y el campo que detecta la deriva de despliegue no se comp… | `src/app/api/health/route.ts:10-32` |
| **M19** | MEDIO | Pruebas | El área de la llave de API está declarada en prosa y no atada al código de la ruta | `src/app/api/v1/viajes/[id]/contribucion/route.ts:73` |
| **M20** | MEDIO | Pruebas | El lado del ingreso entero —Rentabilidad, Cartera, Cobranza— tiene 3 de 229 líneas ejecutadas | `src/lib/likida/comercial.ts` |
| **M21** | MEDIO | Rendimiento y costo | El único camino de LLM sin techo de salida es el del modelo caro | `src/lib/agents/run.ts:49-57` |
| **M22** | MEDIO | Rendimiento y costo | La bandeja durable inserta N veces en serie antes de contestarle a Meta | `src/lib/likida/wa_pendientes.ts:43-65` |
| **M23** | MEDIO | Rendimiento y costo | El copiloto concede 40s al modelo y necesita 21.3s más de los que tiene | `src/app/api/admin/copiloto/route.ts:47,189,201` |
| **M24** | MEDIO | Seguridad | `/login` sigue siendo un oráculo de enumeración: la respuesta idéntica solo cubre una rama d… | `src/app/login/page.tsx:89-95` |
| **M25** | MEDIO | Seguridad | El bucket público `avatares` acepta cualquier archivo, de cualquier `authenticated`, saltánd… | `supabase/migrations/0046_perfil_avatar.sql:17-19` |
| **M26** | MEDIO | Sistema agéntico | El jefe recibe el ejemplar del OPERADOR, no el del contralor | `src/lib/likida/processor.ts:2458` |
| **M27** | MEDIO | Sistema agéntico | Si el PDF del operador no se generó, el jefe no se entera del cierre en absoluto | `src/lib/likida/processor.ts:2455-2540` |
| **M28** | MEDIO | Tool calling | El costo de la primera vuelta desaparece si el reintento correctivo truena | `src/lib/agents/analista.ts:356-381` |
| **M29** | MEDIO | Tool calling | El copiloto de admin no contabiliza NADA cuando el turno truena | `src/app/api/admin/copiloto/route.ts:192-195` |
| **M30** | MEDIO | Tool calling | `correr_runner`: la previsualización enseña un objetivo que el ejecutor tira | `src/lib/agents/copiloto-acciones.ts:129-149` |
| **B1** | BAJO | Arquitectura | El PDF de dinero depende del subsistema de correo | `src/lib/likida/liquidacion/pdf.ts:19` |
| **B2** | BAJO | Arquitectura | "Hoy en México" tiene dos ortografías y el guardia de formato solo cubre las cifras | `src/lib/formato.ts` |
| **B3** | BAJO | Backend y API | `POST /api/lead` dedupe leyendo antes de escribir, sobre una tabla sin unique | `src/app/api/lead/route.ts:173-194` |
| **B4** | BAJO | Cumplimiento fiscal | El 15% de la RFA 2.9 se reparte en proporción, y el papel no dice que ésa es una lectura | `src/lib/likida/cuadre/engine.ts:357-377` |
| **B5** | BAJO | Cumplimiento fiscal | La cuota semanal del diésel: sin consumidor, sin contrato con la rutina que la escribe, y co… | `normas/datos/cuota-ieps-diesel.yaml` |
| **B6** | BAJO | Cumplimiento legal | El aviso integral publicado cita la fracción equivocada para "persona encargada" | `src/lib/likida/privacidad.ts:503` |
| **B7** | BAJO | Cumplimiento legal | El código sigue afirmando que el gateway "fuerza ZDR", claim que el aviso ya dejó de hacer | `src/lib/llm/models.ts:19-23` |
| **B8** | BAJO | Frontend | `/login?enviado=1` es un estado terminal: sin formulario y sin salida en la página | `src/app/login/page.tsx:231-317` |
| **B9** | BAJO | Modelo de datos | `wa_conversacion.tenant_id` es nullable, así que su índice único no cubre el caso NULL y esa… | `supabase/migrations/0001_init.sql:80` |
| **B10** | BAJO | Modelo de datos | `worker_llave.capacidades` no tiene dominio ni "no vacío" | `supabase/migrations/0135_worker_llave.sql:26` |
| **B11** | BAJO | Operabilidad y DX | El arranque bloquea la primera petición con hasta 10 s de red externa | `src/instrumentation.ts:33` |
| **B12** | BAJO | Rendimiento y costo | Un `maxDuration` de 600 contra un techo de plataforma verificado en 300 | `src/app/api/cron/facturar/cola/route.ts:12` |
| **B13** | BAJO | Seguridad | La llave que firma la cookie de flota cae a la service role key cuando falta | `src/lib/auth/admin-context.ts:49` |
| **B14** | BAJO | Seguridad | El step-up de MFA falla ABIERTO, con un comentario que dice lo contrario | `src/lib/auth/mfa.ts:36-45` |
| **B15** | BAJO | Seguridad | `reservar_envio_prospecto` es la única función posterior a la 0054 sin su `revoke ... from p… | `supabase/migrations/0124_cadencia_atomica_y_entre…` |
| **B16** | BAJO | Tool calling | `finish_reason: 'length'` con tool_calls se le reporta al modelo como "argumentos JSON invál… | `src/lib/llm/openrouter.ts:759-774` |
| **B17** | BAJO | Tool calling | La rejilla de caché de lectura no cubre ninguna tool de los dos chats | `src/lib/llm/openrouter.ts:565-572` |
| **B18** | BAJO | Tool calling | `faseDeModelo` puede sacar el gasto del chat del universo que mira su propio tope | `src/lib/likida/costos.ts:102-105` |

---


# CRÍTICO


## C1 · [CRÍTICO] Un CFDI que ampara N gastos: la base lo llama legítimo, el motor lo llama duplicado y le quita el dinero

**Rubro:** Arquitectura  
**Dónde:** `supabase/migrations/0065_cfdi_de_varias_casetas.sql:29-36`


**Los dos lados, abiertos y leídos:**

- **La base (N a 1 es legítimo):** `supabase/migrations/0065_cfdi_de_varias_casetas.sql:29-36`
  separa los dos hechos por escrito —
  `"este gasto NACIÓ de ese CFDI" → 1 a 1` vs
  `"este gasto está AMPARADO por ese CFDI" → N a 1. Es la factura de CAPUFE.` —
  y mueve el índice único a `(tenant_id, cfdi_uuid, cfdi_orden)`
  (`:69`). Su primer párrafo (`:8`) dice literalmente: *"Ocho casetas de **un
  viaje** = ocho filas de `gasto` y UN `cfdi_uuid`"*.
  Los dos escritores lo cumplen: `src/lib/likida/facturacion/al_vuelo.ts:518`
  (`escribirUuid`, con el reparto `1..N` documentado en `:427-428` y el motivo en
  `:302-304`) y `src/lib/likida/intake/consolidado.ts:176` (`ligarLineaAGasto`,
  descrito en `:157-165` como *"el ÚNICO lugar que decide qué significa ligar una
  línea del consolidado a un gasto"*).

- **El motor (N a 1 es duplicado):** `src/lib/likida/cuadre/engine.ts:162-167` —
  `copiasDeComprobante` colapsa **solo por `cfdiUuid`**, sin mirar el orden:
  ```
  if (g.cfdiUuid) { const u = g.cfdiUuid.toLowerCase();
    const previo = vistoUuid.get(u);
    if (previo) originalDe.set(g.id, previo); … }
  ```
  y `engine.ts:275-278` excluye a las "copias" del `totalComprobado`.
  `engine.ts:637-653` además emite una diferencia `tipo: 'duplicado'` por cada
  una, y `engine.ts:1137` fuerza la liquidación a `con_diferencias`.
  La regla está **fijada por test**: `src/lib/likida/cuadre/engine.test.ts:83-93`
  (*"duplicado por UUID NO infla el total"*), con dos gastos de $2,000 que
  comparten UUID y difieren en folio.

- **Por qué el motor no puede distinguir aunque quisiera:** `Gasto`
  (`src/types/likida.ts:40`) tiene `cfdiUuid` y **no tiene `cfdiOrden`**, y
  `repo.ts:663` (`getGastos`, select en `:666`) no trae `cfdi_orden` de la base.
  `cuadre/desde_db.ts:30-34` alimenta al motor exactamente con eso.

**Escenario con valores.** Un viaje cruza 8 casetas de $250 = **$2,000**, anticipo
$2,000. El cron de facturación agrupa por flota y por portal
(`src/app/api/cron/facturar/route.ts:72`, `:473`), CAPUFE emite **una** factura
con los ocho códigos, y `escribirUuid` sella los 8 gastos con `cfdi_uuid = U` y
`cfdi_orden = 1..8`. Nada de eso viola el índice: es exactamente lo que la 0065
vino a permitir. Después se re-cuadra el viaje (`cuadrarDesdeDB`):

- `copiasDeComprobante` ve `U` ocho veces → marca 7 gastos como copia del primero;
- `totalComprobado` = **$250**, no $2,000;
- la diferencia contra el anticipo pasa de $0 a **−$1,750**;
- el PDF imprime siete veces *"Comprobante duplicado: Caseta por $250.00 aparece
  8 veces (7 excluidas del total)"* (`engine.ts:653`);
- `resumenLaboral` —que consume la MISMA función, `liquidacion/pdf.ts:14`—
  reembolsa al operador **$250** de los **$2,000** que puso de su bolsa;
- la liquidación no cierra como `cuadrada` nunca (`engine.ts:1137`).

El mismo camino existe sin cron: `intake/consolidado.ts` concilia el estado de
cuenta mensual de CAPUFE/IAVE contra **todos** los gastos del tenant, así que las
casetas de un mismo viaje comparten UUID por construcción.

**Intento de refutación (falló).** ¿Y si el lote nunca cae dentro de un solo
viaje? El lote se agrupa por flota+portal, no por viaje — pero basta con que
**dos** casetas del mismo viaje caigan en el mismo lote, y el comentario de la
0065 y el del cron (`route.ts:50`) usan "ocho casetas de un viaje" como el caso
motivador. ¿Y si `desde_db.ts` filtra antes? No: pasa `getGastos(viajeId,
tenantId)` crudo. ¿Y si el orden llega al motor por otra vía? No existe: el campo
no está en el tipo ni en el `select`.

**Consecuencia para quien mantenga esto.** Las dos reglas están *documentadas y
defendidas*, cada una en su archivo, cada una con su historia real (la 0019 con
las dos fotos del mismo XML; la 0065 con CAPUFE). Quien toque una va a leer un
comentario que le dice que tiene razón. El test de `engine.test.ts:83` bloquea el
arreglo obvio, y no hay ninguna prueba que ponga las dos reglas en la misma mesa.

**Causa raíz probable.** El esquema aprendió una distinción (5-ago, mig. 0065) que
nunca subió al modelo de dominio: `cfdi_orden` se quedó como columna de base sin
representación en `Gasto`, así que el motor de dinero quedó estructuralmente
incapaz de verla.

---

---

## C2 · [CRÍTICO] El nombre del decisor de un prospecto sale hacia un modelo externo sin que exista un solo aviso que lo cubra

**Rubro:** Cumplimiento legal  
**Dónde:** `src/app/api/admin/mapa-prospectos/mensaje/route.ts:64,74,83`


`src/app/api/admin/mapa-prospectos/mensaje/route.ts:64,74,83` ·
`src/lib/admin/prospectos-mapa.ts:250,278` ·
`supabase/migrations/0138_prospecto_persona.sql`

**Escenario, con el dato nombrado.** Un agente de investigación levanta del
censo/DENUE/LinkedIn a *"Ing. Ramón Treviño, Director de Operaciones"* de una
transportista de Escobedo y lo escribe en `prospecto.contacto_nombre` (o en
`prospecto_persona.nombre/puesto/correo/telefono`, tabla creada esta ronda).
Javier abre el Cerebro y pulsa "generar primer toque". La ruta lee
`contacto_nombre` (:64), lo mete literal en la ficha —`Decisor: ${p.contacto_nombre}`
(:74)— junto con `notas` recortadas a 1,500 caracteres (:76), y manda todo por
`generateStructured` a OpenRouter → `gpt-5.6-luna` (:80-89). Ese mismo nombre,
además, **puntúa a la persona/empresa**: `scoreCierre` suma +20 por
`contacto_nombre` y +10 por cada persona con contacto verificado (:250, :278), y
el resultado ordena a quién se llama primero.

**Consecuencia.** El titular afectado es Ramón Treviño, una persona física que
nunca contrató nada con Likida y no sabe que existe. Aquí Likida **no es persona
encargada**: decide sobre esos datos, o sea es **responsable** (art. 14). El
art. 14 obliga a informarle a la persona titular, por aviso, la existencia y
características principales del tratamiento; el art. 16 fr. II obliga a
proporcionar el aviso simplificado cuando los datos se obtienen por medio
electrónico —y raspar una bolsa de trabajo o un directorio *es* medio
electrónico—. No hay aviso: `/privacidad` se acota expresamente a *"quien
contrata y usa el servicio"* (`src/app/privacidad/page.tsx:50`), `/terminos` es
el contrato con la flota, y el aviso de `/aviso/[tenant]` es el de la flota
frente a sus operadores. En el esquema de prospectos (0105, 0118, 0128-0139) no
existe una sola columna de consentimiento, de aviso puesto a disposición ni de
solicitud ARCO, y `mantenimiento_de_datos` (0104) no purga nada de `prospecto`:
el dato se queda para siempre.

*Intento de refutación, que no prospera:* el art. 9 puede eximir del
**consentimiento** cuando el dato figura en fuentes de acceso público. Eso no
exime del **aviso** (arts. 14 y 16), que es una obligación autónoma, ni del
plazo de conservación, ni de darle un camino ARCO. Y `origen: 'inferido'` de la
0138 es la confesión de que parte de esos correos ni siquiera vienen de una
fuente pública: se dedujeron.

**Causa raíz probable.** El producto tiene dos sombreros y solo escribió el
documento de uno: todo el aparato legal se construyó para "Likida encargada de
la flota", y la maquinaria de adquisición creció después sin que nadie la
reclamara como tratamiento con Likida de responsable.

---

---

## C3 · [CRÍTICO] La FK compuesta de la 0028 se quedó en cuatro relaciones; las veinte que vinieron después no la tienen — y la cadena de cobranza es una de ellas

**Rubro:** Modelo de datos  
**Dónde:** `supabase/migrations/0028_fks_con_tenant.sql:91-96`


`supabase/migrations/0028_fks_con_tenant.sql:91-96` (las cuatro que sí) ·
`supabase/migrations/0049_cobranza_factura_emitida_pago.sql:31,34,84-85,96` (las que no) ·
`src/lib/likida/facturacion_escritura.ts:256-262,267-277,384-390` (dónde lo suple la app) ·
`supabase/verificaciones.sql:2521-2528` (el repo ya clasificó esta clase como CRÍTICA)

**Escenario, con valores.** Existen dos flotas. `pago_recibido` tiene RLS
`tenant_finanzas` cuyo `with check` solo mira `tenant_id`, y su FK
`pago_recibido.factura_id → factura_emitida(id)` no lleva `tenant_id`. Un `contador` de la
flota A, autenticado, contra PostgREST (que la 0048:42-46 reconoce explícitamente como
superficie: *"cualquier usuario autenticado tiene la anon key y puede pegarle a PostgREST
directo"*):

```
POST /rest/v1/pago_recibido
{"tenant_id":"<A>","factura_id":"<factura de B, $250,000>","fecha":"2026-08-20","monto":250000}
```

El `with check` pasa (el `tenant_id` es el suyo). La FK pasa (la factura existe). Queda una
fila con `pago_recibido.tenant_id = A` y `factura_emitida.tenant_id = B`.

**El estado que queda.** La vista `factura_saldo` (0049:112-129) suma
`coalesce(sum(p.monto),0)` uniendo **solo** por `p.factura_id = f.id`, sin mirar tenant. Y
`getCobranza` la lee con la service role (`src/lib/likida/comercial.ts:200-201`), que salta
RLS. La pantalla de cobranza de la flota B pinta, para esa factura: `pagado $250,000.00`,
`saldo $0.00`, `vencida: false` — y su KPI "Por cobrar" baja $250,000. Mientras tanto B no
puede ver ni una fila de pago: `pago_recibido` está filtrada por `tenant_id`, y el pago es
de A. La factura aparece cobrada y no hay ningún abono que lo explique.

La misma clase, sin la vista de por medio:
`insert into factura_viaje (factura_id, viaje_id)` con una factura de A y un `viaje_id` de
B pasa el `with check` (que solo valida el lado de la factura, 0049:155-158) y liga el
viaje de otra flota al ingreso facturado de A. Y `factura_emitida.cliente_id` de otra flota
pasa igual: la comprobación *"Ese cliente no está en tu flota"* vive únicamente en
`facturacion_escritura.ts:262`.

**Consecuencia.** El contralor de la flota B deja de perseguir una cuenta por cobrar de un
cuarto de millón porque su tablero dice que ya se la pagaron. Es el error que el producto
existe para no cometer, y no hay pantalla desde la cual pueda descubrirlo: la evidencia
—la fila de pago— es invisible para él por diseño de la RLS.

**Por qué no lo bajo a ALTO.** Requiere conocer el UUID de una factura ajena, que no se
adivina. Pero el rubro no se define por el atacante: el bloque 48 de `verificaciones.sql`
ya dice, sobre esta misma clase y palabra por palabra, *"la 0028 documentó como CRÍTICA la
clase de defecto… `comprobante_huerfano` nació en la 0040 —DESPUÉS de la 0028— y se saltó
el patrón. Comprobado antes de arreglarlo: la fila cruzada ENTRABA"*. Se arregló esa tabla
(0073) y nunca se barrió el resto. Un script de importación, la consola de Supabase o un
`tenantId` mal pasado en una función futura no necesitan adivinar nada.

**Causa raíz probable.** La 0028 se escribió como una migración puntual sobre las cuatro
tablas que existían en julio, no como una regla del esquema; ninguna prueba ni bloque de
verificación falla cuando una tabla nueva se salta el patrón.

---

---

## C4 · [CRÍTICO] El presupuesto es por mensaje; el `maxDuration` es por invocación

**Rubro:** Rendimiento y costo  
**Dónde:** `src/lib/likida/processor.ts:444`


`src/lib/likida/processor.ts:444` · `src/app/api/webhook/whatsapp/route.ts:43,249`
· `src/app/api/cron/wa-pendientes/route.ts:17,37,78-90`

`crearPresupuesto(PRESUPUESTO_WEBHOOK_MS)` se construye dentro de
`processInbound`, arrancando su reloj en `Date.now()` de **ese** mensaje. Los
dos llamadores procesan N mensajes en UNA invocación —`conPool(…, 5, …)` en el
webhook, un `for` en serie de `LOTE = 10` en el cron— y ninguno le pasa cuánto
lleva gastado la invocación. Cada mensaje se cree dueño de 120s.

**Escenario:** el chofer termina la ruta y manda su fajo de 8 fotos; Meta las
entrega en un POST. Ola 1 (fotos 1-5) consume hasta 62.3s de techos concedidos
(30s de descarga + 25s de visión + 4s de SAT + 3.3s de base). Ola 2 (fotos 6-8)
arranca en t=62.3 con un presupuesto nuevo de 120s y le concede a la foto 6 sus
25s de visión completos. **La cadena suma 124.6s contra un `maxDuration` de
120.** Vercel mata la invocación mientras las fotos 6-8 están en vuelo.

**Consecuencia:** las fotos 6, 7 y 8 no entran a la liquidación. Con el hallazgo
siguiente, no vuelven a entrar nunca. El chofer paga de su bolsa tres tickets
que sí mandó, y su liquidación sale con esa diferencia en su contra.

**Causa raíz probable:** la abstracción del presupuesto se diseñó para el caso
"un webhook = un mensaje" (`presupuesto.ts:6-18`) y sobrevivió intacta a la
llegada del pool y del cron, que son justo los dos que rompen esa premisa.

---

---

## C5 · [CRÍTICO] Un mensaje matado a media corrida queda envenenado por su propio claim

**Rubro:** Rendimiento y costo  
**Dónde:** `src/lib/likida/processor.ts:420-424`


`src/lib/likida/processor.ts:420-424` · `src/lib/likida/conv.ts:343-353` ·
`src/app/api/cron/wa-pendientes/route.ts:80-90`

`processInbound` reclama el `waMessageId` en `wa_mensaje_procesado` en su
**primera línea**, antes de hacer nada. `wa_mensaje_procesado` no tiene lease ni
TTL: se purga a los 30 días (mig. 0072) y se borra solo por
`releaseMessageClaim`, que vive en el `catch` general y en cuatro `return`
tempranos. Una muerte por `maxDuration` no ejecuta ninguno de los dos.

**Escenario, encadenado al anterior:** la foto 7 muere a los 120s con su wamid
ya reclamado y su fila de `wa_evento_pendiente` con `procesado_en` en NULL.
Cinco minutos después el cron la vuelve a reclamar (`reclamarPendiente`, intentos
1→2) y llama `processInbound`. `claimMessage` devuelve `'duplicado'`, la función
hace `logger.info('wa.duplicate')` y **`return` sin lanzar**
(`processor.ts:421-424`). El cron interpreta ese retorno limpio como éxito y
ejecuta `marcarPendienteProcesado(claim.id)` (`cron/wa-pendientes/route.ts:83`): la fila queda
**sellada como procesada**. El OCR nunca corrió, el gasto nunca se insertó.

**Consecuencia:** la pérdida es definitiva y silenciosa. `cartasMuertas` cuenta
`intentos >= 5 AND procesado_en IS NULL` (`wa_pendientes.ts:132-137`), así que
la fila sellada nunca dispara la alerta; en el log solo hay un `wa.duplicate` de
nivel `info`, que es exactamente lo que se escribe cuando todo va bien. Es el
mismo final que el bloque de `presupuesto.ts:6-11` describe como "el peor final
posible", con el agravante de que ahora hay un mecanismo de recuperación
—`wa_evento_pendiente`, mig. 0119— que **afirma por escrito** que el mensaje se
procesó.

**Causa raíz probable:** la idempotencia (mig. 0002) se escribió contra el
reintento de Meta, donde "duplicado" sí significa "ya hecho". La bandeja durable
(0119) reusó el mismo `processInbound` sin distinguir "duplicado porque ya se
completó" de "duplicado porque yo mismo lo reclamé y me morí".

---

---

# ALTO


## A1 · [ALTO] `bitacora_auditoria`: 17 escritores a mano, sin función común — uno ya escribe la entidad equivocada

**Rubro:** Arquitectura  
**Dónde:** `src/lib/likida/administracion.ts:48-56`


**Los dos lados.** El bloque canónico —el que casi todos copiaron— es
`src/lib/likida/administracion.ts:48-56`:
`{ tenant_id, actor_id: actor?.id ?? null, actor_email: actor?.email ?? null, accion, entidad, entidad_id, detalle }`.
La copia que ya se desincronizó es
`src/lib/likida/facturacion/avisar.ts:131-137`:

```
.insert({ tenant_id: args.tenantId, accion: 'facturacion.aviso_enviado',
          entidad: 'gasto', entidad_id: args.tenantId, … })
```

Dice que la entidad es un **gasto** y le pone como id el **uuid del tenant**. Y es
el único de los 17 que no escribe `actor_id` **ni** `actor_email`.

Los 17 (todos con `.from('bitacora_auditoria').insert(` escrito a mano, no
`insert` vía repositorio): `admin/campanas.ts:104`, `agents/copiloto-acciones.ts:170`,
`auth/llave-api-escritura.ts:71`, `auth/admin-context.ts:143`,
`auth/tenant-efectivo.ts:131`, `likida/interruptores.ts:204`,
`likida/facturacion/avisar.ts:131`, `likida/conectores/credenciales.ts:40`,
`likida/administracion.ts:48`, `likida/facturacion_escritura.ts:215`,
`likida/carta_porte_datos.ts:192`, `likida/clientes.ts:779`,
`likida/agentes/estrategia.ts:90`, `likida/agentes/definiciones.ts:159`,
`likida/agentes/cola.ts:270`, `correo/buzon_escritura.ts:70` (nuevo esta ronda),
más el único lector, `admin/bitacora.ts:54`.

Ya hay **tres formas** distintas de firmar el actor: 7 escriben `actor_id` +
`actor_email`; 7 escriben solo `actor_id`; `llave-api-escritura.ts:71` escribe
`actor_email: null` a mano; `avisar.ts:131` no escribe ninguno. El lector ya tiene
una rama para eso — `admin/bitacora.ts:74` cae en cascada
`actorJoin?.nombre ?? actorJoin?.email ?? f.actor_email ?? null` y su comentario
(`:24-25`) dice *"escritores viejos sin firma — se pinta 'sistema', no se
inventa"*. O sea: la divergencia ya está aceptada en el lector.

**Escenario con valores.** El contralor abre `/admin/observabilidad` → Bitácora y
filtra `facturacion`. Ve el renglón `facturacion.aviso_enviado`, entidad
`gasto`, id `8f3c…-a91b` — y copia ese id para buscar el gasto. No existe: es el
id de su propia flota. Y el actor sale como "sistema" en un evento que sí tuvo
destinatario humano (el encargado al que se le mandó el WhatsApp).
El costo estructural es el siguiente cambio: si mañana la bitácora necesita `ip`
o `via` (LFPDPPP obliga a dejar constancia del medio en el trámite ARCO), son 17
ediciones idénticas; la que se olvide deja un hueco que solo se descubre
auditando, que es cuando ya no sirve.

**Consecuencia.** El registro de auditoría es el artefacto cuya única función es
ser confiable, y su forma no la garantiza nada: ni un tipo, ni una función, ni un
test. Cada `insert` nuevo es una tirada de dados sobre 7 campos.

**Causa raíz probable.** El módulo `admin/bitacora.ts` se creó como **lector**
(su cabecera lo dice: *"EL PRIMER LECTOR de `bitacora_auditoria`"*, tras encontrar
"siete escritores y cero lectores"); nunca se creó el escritor recíproco, así que
la asimetría se arregló por el lado barato.

---

---

## A2 · [ALTO] La URL base de la app está escrita a mano en 7 sitios y ya divergió en 4 valores distintos

**Rubro:** Arquitectura  
**Dónde:** `src/app/login/page.tsx:61`


**Los lados** (todos leídos, ninguno importa al otro):

| Sitio | Qué hace si falta `NEXT_PUBLIC_APP_URL` |
|---|---|
| `src/app/login/page.tsx:61` (`siteUrl()`) | `'https://app.likida.ai'` |
| `src/lib/correo/plantilla.ts:58` (`base()`) | `'https://app.likida.ai'` — **nuevo esta ronda** |
| `src/lib/correo/avisos.ts:28` (`const APP`) | `'https://app.likida.ai'` — **nuevo esta ronda** |
| `src/lib/observability/alerta.ts:49` (`const APP`) | `'https://app.likida.ai'` |
| `src/app/api/auth/correo/route.ts:161` | `'https://app.likida.ai'` |
| `src/app/dashboard/usuarios/page.tsx:98` | `'https://app.likida.ai'` |
| `src/app/admin/vendedores/consola-vendedores.tsx:158` | `'https://app.likida.ai'` |
| `src/app/dashboard/suscripcion/page.tsx:192` | **`''`** |
| `src/lib/llm/openrouter.ts:31` | **`'https://likida.ai'`** (deliberado y comentado: es cabecera `HTTP-Referer`) |
| `src/app/api/v1/openapi/route.ts:753` | `new URL(req.url).origin` |
| `src/app/api/cron/facturar/route.ts:341` | `https://${req.headers.get('host')}` |

Que la variable puede faltar no es hipótesis del auditor: el repo ya tiene una
alarma de arranque dedicada a ese estado exacto, `src/lib/observability/arranque.ts:44-46`.

**Escenario con valores.** Se despliega una preview de Vercel sin
`NEXT_PUBLIC_APP_URL` (o alguien la borra del entorno). En el mismo build:
`login/page.tsx:61` arma el magic link contra `https://app.likida.ai` y el login
funciona; pero el dueño de la flota entra a `/dashboard/suscripcion` y pulsa
"Administrar cobro" → `suscripcion/page.tsx:192` manda a Stripe
`return_url = "/dashboard/suscripcion"`, una URL **relativa**, que la API de
Billing Portal rechaza; el `catch` de `:193` pinta el mensaje genérico de
`mensajeParaPantalla`. Misma variable ausente, dos comportamientos, y el que
falla es el de cobrar.

El barrido ya salió mal una vez: el 17-ago-2026 el suelo cambió de `likida.ai` a
`app.likida.ai` (`login/page.tsx:53-58` cuenta el incidente: *"el correo llegaba,
el link abría, y el usuario caía en un sitio que NO TIENE `/auth/callback`"*), lo
que obligó a tocar cada copia una por una.

**Consecuencia.** Cada dominio nuevo, cada subdominio, cada entorno de staging es
un barrido manual de 7+ archivos donde olvidar uno no rompe el build, no rompe
ningún test, y se descubre porque alguien no puede entrar o no puede pagar.

**Causa raíz probable.** `src/lib/env.ts` es un **inventario** de variables
(`faltantes()`, `envHealth()`), no un accesor; nunca se creó el punto único que
resuelva el valor, así que cada consumidor nuevo copia la expresión. El subsistema
`correo/` —nuevo esta ronda— añadió dos copias más en vez de reusar `siteUrl()`.

---

---

## A3 · [ALTO] Si la invocación muere a media ráfaga, el cron sella como procesado el mensaje que nunca se procesó

**Rubro:** Backend y API  
**Dónde:** `src/app/api/webhook/whatsapp/route.ts:249-259`


`src/app/api/webhook/whatsapp/route.ts:249-259` · `src/lib/likida/processor.ts:420-424` ·
`src/lib/likida/processor.ts:2589` · `src/app/api/cron/wa-pendientes/route.ts:79-84`

Escenario, con valores: un chofer manda un fajo de 22 fotos. Meta las entrega en
un POST; las 22 se persisten en `wa_evento_pendiente` (`intentos = 0`) y el
`after()` las procesa con `conPool(..., MAX_EN_PARALELO = 5, ...)`. Cada foto es
OCR de hasta 25 s: 22 fotos ÷ 5 obreros ≈ 5 tandas ≈ 125 s contra
`maxDuration = 120`. Vercel mata la invocación.

En ese instante hay **5 fotos en vuelo**. Para cada una ya corrió
`processInbound` → `claimMessage(wamid)` (processor.ts:420), que insertó su fila
en `wa_mensaje_procesado`. `releaseMessageClaim` vive **solo en el `catch`**
(processor.ts:2589); el `finally` (2599-2601) únicamente suelta el lock del
viaje. Una muerte dura no ejecuta ni uno ni otro, así que el claim queda tomado.

Cinco minutos después corre `cron/wa-pendientes`: `pendientesPorDrenar` trae esas
5 filas (`procesado_en` null, `intentos = 1 < 5`), `reclamarPendiente(id, 1)`
gana, llama `processInbound` → `claimMessage` devuelve `'duplicado'` →
`logger.info('wa.duplicate')` y `return` (processor.ts:421-423) → de vuelta en el
cron, línea 83, `marcarPendienteProcesado(claim.id)` y `procesados++`.

Sale mal: las 5 fotos quedan con `procesado_en` sellado, el cron responde
`{corrio:true, procesados:5, fallidos:0}` y el único rastro es un `info`. La
reentrega de Meta tampoco las salva: en el webhook el claim está **cableado a
cero** (`reclamarPendiente(f.id, 0)`, route.ts:251), y con `intentos = 1` el
UPDATE anclado no empata. `wa_mensaje_procesado` se purga a los 30 días
(mig. 0072), no en minutos.

Consecuencia: hasta 5 comprobantes por invocación muerta desaparecen sin que
nadie lo sepa — con el agravante de que el sistema **reporta éxito**. Si uno de
los cinco era el diésel de $8,000, la liquidación cierra corta y el operador paga
de su bolsa un gasto que sí hizo; el contralor ve un total comprobado que no
cuadra con el fajo que el chofer jura haber mandado. Es exactamente el modo de
falla que la bandeja 0119 se construyó para eliminar.

Sin test: `cron/wa-pendientes/route.test.ts` mockea `processInbound` como éxito o
como throw; ningún caso ejercita "processInbound retorna porque el wamid ya está
reclamado". `apagado.test.ts` y `route_pool.test.ts` tampoco.

Causa raíz probable: dos candados de idempotencia con ciclos de vida distintos
(`wa_mensaje_procesado` sobrevive al proceso, la fila pendiente espera reintento)
y ningún camino que le diga al reclamante de la fila durable que el "duplicado"
que recibió es su propio cadáver.

---

---

## A4 · [ALTO] El webhook de entrega de correo nunca escribe nada: `neq` descarta las filas con `entrega_estado` NULL

**Rubro:** Backend y API  
**Dónde:** `src/app/api/correo/eventos/route.ts:81-95`


`src/app/api/correo/eventos/route.ts:81-95` (la línea es la **85**)

```ts
.eq('provider_message_id', emailId)
.neq('entrega_estado', estado === 'entregado' ? 'rebotado' : '~nunca~')
```

Escenario, con valores: se envía una pieza de la cola; Resend la acepta y se
guarda `provider_message_id = 're_abc123'`. `cola_aprobacion.entrega_estado`
nace **NULL** — la 0124 lo dice con todas sus letras
(`0124_cadencia_atomica_y_entrega.sql:64-69`: «NULL = aceptado sin noticia de
entrega todavía»). Llega `email.delivered`. PostgREST traduce `neq` a
`entrega_estado <> 'rebotado'`, y en SQL `NULL <> 'rebotado'` es **NULL**, no
`true`: la fila no entra al `WHERE`. El UPDATE afecta 0 filas, `data` sale `[]`,
y la ruta contesta `200 {"sinPieza": true}` con un `logger.info` de nivel info
(línea 92-94).

Lo mismo, y peor, con la mala noticia: para `email.bounced` el filtro es
`.neq('entrega_estado', '~nunca~')` — el centinela pensado para "no excluyas
nada" —, y `NULL <> '~nunca~'` también es NULL. **Un rebote sobre una pieza que
nunca recibió un evento previo tampoco se escribe.** Como el primer evento es
justamente el que dejaría la columna no-nula, la columna se queda NULL para
siempre: el circuito de entrega completo de la 0124 es código muerto en
producción.

Consecuencia: la pantalla sigue vendiendo "aceptado" como si fuera "entregado" —
el problema que la migración 0124 existe para resolver—, y una dirección que
rebota o marca queja nunca se marca, así que la cadencia le sigue escribiendo:
reputación del subdominio de envío quemada sin una sola señal en el panel.

Sin test que lo cubra: `route.test.ts:82-85` mockea Supabase entero y solo afirma
que `.neq('entrega_estado','rebotado')` **fue llamado** (`filtros[0].neq`); el
doble devuelve `[{id:'pz-1'}]` pase lo que pase, así que la lógica de tres
valores de SQL nunca se ejerce.

Causa raíz probable: se expresó "no pises un rebote" con un `<>` sobre una
columna anulable, sin la rama `OR entrega_estado IS NULL` que SQL exige.

---

---

## A5 · [ALTO] El detector de fraude acusa a la flota de duplicar un CFDI cada vez que concilia un consolidado

**Rubro:** Backend y API  
**Dónde:** `src/lib/likida/duplicados.ts:85-93`


`src/lib/likida/duplicados.ts:85-93` (agrupa solo por `cfdiUuid`) ·
`src/lib/likida/duplicados.ts:15-21` (`FilaGasto` no tiene `cfdiOrden`) ·
`src/lib/likida/analytics.ts:349-366` (la consulta no trae `cfdi_orden`)

Escenario, con valores: la oficina reenvía el estado de cuenta mensual del TAG de
casetas. `guardarYConciliarConsolidado` busca candidatos con
`.eq('tenant_id', …).is('cfdi_uuid', null).gte('fecha', …).lte('fecha', …)`
(`intake/consolidado.ts:298-307`) — **por tenant y por rango de fechas, no por
viaje** — y sella cada gasto que empata con
`{cfdi_uuid: 'a1b2c3d4-…', cfdi_orden: 1..N}` (`consolidado.ts:174-180`). Un mes
de casetas son, por construcción, gastos de muchos viajes: digamos 40 cruces
repartidos en 12 viajes.

Eso es **legal desde la mig. 0065**, que movió el índice a
`unique (tenant_id, cfdi_uuid, cfdi_orden)` precisamente para permitir "N gastos,
un CFDI" (`0065_cfdi_de_varias_casetas.sql:68-70`). Pero `detectarAnomalias`
selecciona `viaje_id, concepto, monto, folio, cfdi_uuid` y **no** `cfdi_orden`, y
`detectarDuplicadosEntreViajes` agrupa por UUID a secas: el grupo toca 12 viajes
→ `{tipo: 'cfdi_duplicado', detalle: 'CFDI a1b2c3d4… liquidado en 12 viajes'}`.

Sale mal en cuatro pantallas a la vez: `/dashboard` (inicio-contenido.tsx:94),
`/dashboard/combustible-casetas` (:122), `/dashboard/notificaciones` (:40) y la
vista del contador. Y el `monto` que acompaña la alarma es el del **primer** gasto
del grupo (`duplicados.ts:36`: `?? { viajes: new Set(), monto: f.monto }`), o sea
una caseta suelta de $87 presentada como el monto duplicado — una cifra que no es
ninguna de las que el contralor puede cruzar.

Consecuencia: el producto acusa a los choferes de la flota del fraude número uno
del sector — con nombre, con viajes y con un monto inventado — por haber usado
bien la conciliación de consolidados que le vendimos. En la sala, el contralor
abre esa notificación y lo primero que ve es una acusación falsa contra su gente.

El test que debería atraparlo **fija lo contrario**:
`duplicados.test.ts:13-21` («el mismo CFDI en dos viajes es una anomalía») se
escribió cuando el índice era el de la 0019 —«un CFDI, un gasto»— y nadie lo
revisó cuando la 0065 legitimó el N:1.

Causa raíz probable: una regla que era cierta bajo el esquema viejo sobrevivió al
cambio de esquema porque su entrada (`FilaGasto`) no llegó a conocer la columna
que hace la distinción.

---

---

## A6 · [ALTO] `/api/dashboard/ingesta` gasta visión sin techo y su costo no lo cuenta ningún medidor

**Rubro:** Backend y API  
**Dónde:** `src/app/api/dashboard/ingesta/route.ts:29-77`


`src/app/api/dashboard/ingesta/route.ts:29-77` (no importa `rateLimit`, no llama
`registrarCosto`) · contrastar con `src/app/api/dashboard/chat/route.ts:62-77`

Escenario, con valores: un `contador` con sesión válida abre la sonda "Ingest" de
*Preguntar a la IA*. La ruta acepta un data-URL de hasta `MAX_DATAURL = 9_000_000`
bytes (~6 MB de imagen) y llama `extraerComprobante` —una completion de visión—
por petición. No hay `rateLimit` de ninguna clase: ni por IP, ni por usuario, ni
por tenant. Un `for (let i=0;i<500;i++) fetch('/api/dashboard/ingesta',…)` desde
la consola del navegador, o un `useEffect` con dependencia mal puesta en el
cliente, son 500 llamadas de visión seguidas.

Y el costo **no se registra**: `extraerComprobante` devuelve `r.costo.costoUsd` y
la ruta lo mete en un `logger.info` (línea 51-54) y ahí se acaba. Nunca entra a
`llm_costo`. Por comparación, el camino de WhatsApp sí lo registra
(`processor.ts:1060`) y el chat también (`chat/route.ts:94`).

Sale mal en dos sitios a la vez: (1) el tope diario del chat lo lee
`gastoChatHoyUsd(tenantId)` contra `llm_costo`, así que este gasto **no descuenta
del presupuesto que dice cuidarlo**; (2) `/admin` "Costo de IA" y la pantalla de
costo por flota enseñan un total que no incluye ni un centavo de esta ruta. Un
rótulo que dice "lo que llevas gastado en IA" y no lo dice.

Consecuencia: gasto de modelo real, sin freno, que ningún tablero cuenta — y por
tanto sin la señal que haría que alguien lo notara. Para el rubro de "una cifra
tiene que ser verdad", el número de costo del panel es falso por construcción en
cuanto alguien use la sonda.

Sin test: el directorio `src/app/api/dashboard/ingesta/` contiene **solo**
`route.ts`. `chat/` tiene `tope.test.ts`, `validacion.test.ts` y
`costo_parcial.test.ts`.

Causa raíz probable: la ruta se copió de `/api/dashboard/asistente` por su
*autorización* (así lo dice su encabezado) y no por su *contabilidad*; las dos
capas anti-quemadura del hermano se quedaron del otro lado.

---

---

## A7 · [ALTO · REINCIDENTE] El 50% de peaje se acredita sobre casetas pagadas en EFECTIVO

**Rubro:** Cumplimiento fiscal  
**Dónde:** `src/lib/likida/cuadre/engine.ts:1008`


`src/lib/likida/cuadre/engine.ts:1008` · `src/lib/likida/liquidacion/acreditable.ts:110-119`

**Norma** (ficha `normas/rmf-2026-9.1.8.yaml`, `verificado_fuente_primaria`: **sí**),
fracción III, literal:

> «Efectuar los pagos de autopistas mediante la tarjeta de identificación automática
> vehicular o de cualquier otro sistema electrónico de pago con que cuente la
> autopista y conservar los estados de cuenta» de dicha tarjeta o sistema.

Y la propia ficha lo traduce en `consecuencias_operativas`:

> «La fr. III mata el efectivo: una caseta pagada en ventanilla con billetes NO genera
> estímulo aunque después se facture.»

**Código** (`engine.ts:1008`, dentro del bloque de acreditamiento):

```ts
if (g.concepto === 'caseta' && (g.subTotal ?? 0) > 0) peajeAcreditable += (g.subTotal as number) * peajeFactor;
```

No hay una sola lectura de `g.formaPago` en esa rama. La única puerta que podría
atraparlo —`efectivo_sobre_tope`, `engine.ts:391-393`— exige
`!esCombustible && g.monto > topeEfectivo` (**$2,000**), y una caseta casi nunca
llega a $2,000.

**Escenario con pesos.** Entra una caseta de **$928** (SubTotal $800 + IVA $128),
pagada en ventanilla con billetes (`formaPago: '01'`), con CFDI timbrado y XML
verificado — el caso normal de una flota que factura CAPUFE al final del mes.

- El motor imprime: `Estímulo de peaje 50% (LIF 2026 art. 20, ap. A) — sujeto a
  elegibilidad · **$400.00**`.
- La norma dice: **$0.00**. La fr. III no es una condición de fondo que la flota
  declare, es una condición de forma sobre **ese** pago.

Sobre 40 casetas al mes en esa condición son ~$16,000 mensuales de estímulo
inexistente en el papel que se archiva.

**Consecuencia.** El pie del PDF (`CONDICIONES_ESTIMULO_PEAJE`, `acreditable.ts:64-67`)
enumera **exactamente cuatro** condiciones y dice «El estímulo exige las cuatro»: la
frase es exhaustiva y omite las tres de la regla 9.1.8 (aviso de marzo, bitácora
conciliada, pago electrónico). El contralor que verifica las cuatro concluye que el
estímulo procede. Ni el PDF ni `acreditable.ts` nombran la regla 9.1.8 una sola vez, y
`normas/por_diferencia.ts:133` (`caseta: ['lif-2026-art-20-A']`) tampoco la habilita,
así que el agente tiene **prohibido** citarla al explicar el renglón. La única pantalla
donde sí aparece es `src/app/dashboard/agentes/peajes/vista.tsx:305`, que dice
literalmente «Likida no verifica la forma de pago de cada caseta; el efectivo en
ventanilla mata el estímulo» — el papel afirma lo que la pantalla desmiente.

**Estado del hallazgo previo:** REINCIDENTE, mitigado a medias. Lo que se atacó desde
la auditoría anterior fue el color (ya no sale verde) y las cuatro condiciones de la
LIF. Lo que no se atacó es la puerta que el motor sí podía cerrar solo, porque
`formaPago` ya está en la fila.

**Causa raíz probable:** el acreditamiento se ancló a la ficha de la LEY (`lif-2026-20-A`,
jerarquía 1) y la regla de carácter general que la instrumenta (jerarquía 3) se cableó
solo a la pantalla de peajes cuando se escribió la bitácora, sin volver al motor.

---

---

## A8 · [ALTO] El pie del PDF invita a subir la base del peaje 13.8%, contra el texto literal de la 9.1.8 fr. IV — y el porcentaje además está mal

**Rubro:** Cumplimiento fiscal  
**Dónde:** `src/lib/likida/liquidacion/acreditable.ts:47-49`


`src/lib/likida/liquidacion/acreditable.ts:47-49` (impreso por `liquidacion/pdf.ts:399-404`)

**Norma** (ficha `normas/rmf-2026-9.1.8.yaml`, `verificado_fuente_primaria`: **sí**),
fracción IV, literal:

> «Para la determinación del monto del acreditamiento, se aplicará al importe pagado
> por concepto del uso de la infraestructura carretera de cuota, **sin incluir el IVA**,
> el factor de 0.5 para toda la Red Nacional de Autopistas de Cuota.»

La ficha `normas/lif-2026-20-A.yaml` ya cerró la duda con esa fracción, en su propio
hallazgo H4: `estado: RESUELTO (14-ago-2026) … La lectura conservadora del motor es la
que la regla ordena — **no hay que cambiar el código**.`

**Código** (la constante que se imprime al pie del renglón):

```ts
export const BASE_ESTIMULO_PEAJE =
  'Base usada: el subtotal SIN IVA de las casetas con CFDI verificado. La ley dice "50% del gasto total erogado"; ' +
  'si su contador toma el total con IVA, la cifra sube alrededor de 13.8%.';
```

Y el docstring que la encabeza (`acreditable.ts:37-45`) sigue diciendo
«Es el hallazgo H4 de la ficha, `severidad: alta`, `estado: SIN RESOLVER`» — la ficha
dice RESUELTO desde el 14-ago.

**Escenario con pesos.** Casetas del periodo con CFDI: SubTotal **$10,000**, IVA
**$1,600**, total erogado **$11,600**.

- El motor imprime **$5,000.00** — correcto.
- Debajo, el mismo papel imprime: «si su contador toma el total con IVA, la cifra sube
  alrededor de 13.8%». El contador que sigue la invitación acredita
  **$11,600 × 0.5 = $5,800.00**.
- La norma dice **$5,000.00** y cierra la discusión: «sin incluir el IVA».

Sobrancreditamiento invitado: **$800 por cada $10,000 de casetas**.

Y el número del pie tampoco cuadra: de $5,000 a $5,800 la cifra **sube 16%**, no 13.8%.
El 13.8% es la relación inversa ($5,000 es 13.8% *menos* que $5,800), que es como está
escrita —bien— en la ficha, e invertida —mal— en la constante. Un contralor con
calculadora encuentra eso en el primer minuto.

**Consecuencia.** El documento archivado presenta como pregunta abierta para el
contador algo que una regla verificada en fuente primaria resolvió, y empuja la
respuesta hacia el lado que sobre-acredita. Es exactamente el supuesto del criterio
1/LIF/PI del Anexo 3, que alcanza a «quien preste servicios»: la sugerencia sería de
Likida, no del cliente.

**Causa raíz probable:** la constante y su prueba (`acreditable.test.ts:16-22`, que fija
en un comentario «$580, no $500 … estado: SIN RESOLVER») se escribieron antes de que la
ficha 9.1.8 entrara al repo, y la ficha se actualizó sin tocar el texto que se imprime.

---

---

## A9 · [ALTO] "Diferencias por operador" es un ranking nominal de personas, y el aviso promete lo contrario

**Rubro:** Cumplimiento legal  
**Dónde:** `src/lib/likida/analytics.ts:283-334`


`src/lib/likida/analytics.ts:283-334` · `src/app/dashboard/agentes/liquidacion/page.tsx:81-85` ·
`src/app/dashboard/agentes/liquidacion/vista.tsx:217-226` ·
promesa contradicha en `src/lib/likida/privacidad.ts:541`

**Escenario, con el dato nombrado.** *Juan Pérez*, chofer, cierra ocho viajes.
`getStatsPorOperador` cruza `operador.nombre` contra `liquidacion.diferencia` y
devuelve `{ nombre: 'Juan Pérez', viajes: 8, dieselTotal: 41230.50, diferencias: 3 }`
(:327-333). La página filtra a los que tienen `diferencias > 0`, los **ordena de
mayor a menor** y se queda con los seis primeros (`page.tsx:82-85`); la vista los
pinta como barras bajo el título *"Diferencias por operador — Liquidaciones con
diferencia, por operador"* (`vista.tsx:218-226`). Juan Pérez aparece en el
primer lugar de una lista de sospecha, con su nombre, en la pantalla de su
patrón.

**Consecuencia.** El titular es el operador. El aviso integral que él recibió
enumera las finalidades y, entre las no necesarias, escribe literalmente:
*"Medir cómo funciona el servicio para mejorarlo (estadísticas de uso, **sin
identificarte en los reportes**)"* (`privacidad.ts:541`). Este reporte lo
identifica. Ninguna otra finalidad lo cubre: la que sí está enunciada es
*"revisar si un comprobante viene repetido o alterado […] y entregarle ese
resultado a la empresa"* (`privacidad.ts:535`), que es por comprobante — una
diferencia de cuadre no es una duplicidad, y un conteo acumulado por persona no
es "ese resultado". El art. 15 fr. III obliga a enunciar las finalidades, y el
art. 11 vigente perdió las palabras *"compatible o análogo"* (así lo dice el
propio aviso en `privacidad.ts:542`): una finalidad no escrita exige
consentimiento nuevo. El propio `DOCUMENTO-MAESTRO.md:61` ya lo tenía anotado:
*"ranking de operadores/fraude requiere aviso de privacidad + revisión humana"*.
Agravante: la consulta no mira `operador.oposicion_automatizada`, así que el
operador que **ya ejerció** la oposición del art. 26 fr. II —y a quien el motor
sí honra en el cierre— sigue apareciendo en el ranking.

**Causa raíz probable.** La pantalla se diseñó como KPI de operación y nadie
volvió a cruzar la lista de finalidades del aviso contra lo que las pantallas de
verdad enseñan.

---

---

## A10 · [ALTO] Una solicitud ARCO se pierde sin registro cuando al tenant le falta la razón social

**Rubro:** Cumplimiento legal  
**Dónde:** `src/lib/likida/processor.ts:207-252`


`src/lib/likida/processor.ts:207-252` (el `if (datos)` de :210 envuelve el
`registrarSolicitudArco` de :219; la rama sin datos es :250-251)

**Escenario, con el dato nombrado.** *Juan Pérez* escribe por WhatsApp
`"quiero que borren mis datos"` desde el 5219993700779.
`pideAtencionPrivacidad` lo reconoce (`privacidad.ts:372`) y llama a
`atenderPrivacidad`. Si su flota no capturó `razon_social` o `domicilio_fiscal`,
`getDatosResponsable` devuelve `null` (`repo.ts:766`) y el flujo salta al `else`
implícito: escribe una línea de log y le contesta *"Déjame checarlo con la
empresa y te confirmo por aquí. 🙏"* (:250-251). **No se inserta nada en
`solicitud_arco`**, no se calcula `vence_en`, y por tanto la solicitud no aparece
en `/dashboard/arco` ni en la guardia (`src/lib/admin/guardia.ts:73`). Nadie va a
confirmarle nada.

**Consecuencia.** El titular ejerció su derecho de cancelación y el sistema le
devolvió una promesa de seguimiento que ningún registro sostiene. El art. 15 fr.
V exige que el mecanismo ARCO sea real, y el art. 31 le da a la responsable 20
días hábiles para contestar, plazo que aquí nunca empieza a correr porque no hay
constancia. Es exactamente el hallazgo que ya se cerró una vez (`repo.ts:956`:
*"el aviso promete 'queda registrada tu solicitud' y la tabla existía sin un solo
insert"*) y que sobrevive en esta rama. Nótese que `registrarSolicitudArco`
acepta `operadorId: null` y `titularRef` es el teléfono: **no necesita los datos
del responsable para escribir la fila**; el acoplamiento es accidental.

**Causa raíz probable.** Se metió el registro dentro del `if` que existía para
decidir *qué texto contestar*, y se acopló "tener a quién señalar como
responsable" con "dejar constancia de que alguien pidió algo".

---

---

## A11 · [ALTO] Un solo selector rotula cinco ventanas de tiempo distintas; "Histórico" enseña 52 semanas de dinero

**Rubro:** Frontend  
**Dónde:** `src/app/dashboard/panel-periodo.tsx:44-51`


`src/app/dashboard/panel-periodo.tsx:44-51`
(y `src/lib/likida/analytics.ts:513`, `:158-160`, `src/app/dashboard/actividad.tsx:53`)

El pill único Semanal / Mensual / Histórico (`panel-periodo.tsx:57-67`) gobierna
cinco bloques. Las ventanas reales, leídas en el origen de cada serie:

| bloque | fuente | semanal | mensual | histórico |
|---|---|---|---|---|
| Viajes (dona) | `getSeriesKpiCards` (`analytics.ts:158`) | **7 días** | **30 días** | 3 650 días |
| Actividad | `bucketsPorDia` (`actividad.tsx:53`) | **7 días** | **30 días** | todo (`getViajesPorMes`) |
| Gasto por categoría | `SEMANAS_POR_MODO` (`analytics.ts:513`) | **5 semanas = 35 días** | **13 semanas = 91 días** | **52 semanas = 364 días** |
| Liquidado ($) | idem | **35 días** | **91 días** | **364 días** |
| Top rutas | `getTopRutasPorGastoSeries:1200` | 35 días | 91 días | sin cota (todo) |

Escenario: una flota que arrancó en marzo-2025 y lleva $6,900,000 liquidados. El
contralor aprieta **Histórico**. La dona "Viajes" cuenta los 412 viajes de toda
la vida de la cuenta; "Top rutas" también sale sin cota; pero la tarjeta
"Liquidado" imprime en grande `mxn(totalLiquidado)` (`panel-periodo.tsx:107`)
sumando **solo las últimas 52 semanas** → **$4,180,000**. No hay ningún rótulo por
tarjeta que lo acote: el único rótulo en pantalla es el pill que dice "Histórico".
Los ~$2.7M de ago-2025 hacia atrás desaparecen sin una línea que lo diga.

En **Semanal** el desajuste es peor por cercanía: la dona dice "12 viajes" (7 días)
y la tarjeta de al lado dice "$310,000 liquidado" (35 días). Dividir una entre otra
—que es exactamente lo que hace un contralor con dos tarjetas contiguas bajo un
mismo filtro— da $25,833 por viaje contra un costo real de ~$5,000.

Consecuencia: el contralor cruza el "histórico" del panel contra su balanza y no
cuadra; o peor, se lo cree. Rompe la regla escrita del repo: "si un filtro está
en pantalla, mueve TODO lo que hay debajo" y "un rótulo tiene que ser verdad".

Causa raíz probable: `SEMANAS_POR_MODO` (semanas ISO, 5/13/52) y
`getSeriesKpiCards` (días, 7/30/3650) son dos escalas distintas que el selector
único del 8-ago-2026 juntó bajo tres etiquetas sin reconciliarlas.

---

---

## A12 · [ALTO] `StatCard` escribe "0% · sin movimiento" justo cuando NO pudo comparar

**Rubro:** Frontend  
**Dónde:** `src/app/admin/ui/kit.tsx:152-157`


`src/app/admin/ui/kit.tsx:152-157`
(llamadores: `src/app/dashboard/kpi-periodo.tsx:69`, `src/app/dashboard/inicio-contenido.tsx:386`)

El propio contrato del componente lo prohíbe, textual en `kit.tsx:93-98`: *"Sin
dato comparable el llamador OMITE el delta: un '0.0%' inventado afirmaría 'sin
cambio', que no es lo mismo que 'no se pudo comparar'."* Pero la rama
`delta === null` (que es exactamente la señal de "se intentó comparar y no hay
contra qué") pinta el literal **`0% · sin movimiento`**.

Escenario con valores: la flota no liquidó nada la semana pasada y esta semana
gastó $84,300. `pctCambio(84300, 0)` devuelve `null` (`formato.ts:70`, base 0),
`kpi-periodo.tsx:69` manda `delta={null}`, y la tarjeta "Gasto total — últimos 7
días" imprime **$84,300** con el pie **"0% · sin movimiento"**. Segundo escenario,
permanente: en modo **Histórico** `series.historico` trae un solo bucket
(`analytics.ts:140-142`), `anterior` es `null`, y *toda* tarjeta de KPI en vista
histórica lleva ese pie. Tercero: `inicio-contenido.tsx:386` pasa `delta={null}`
a "Diésel elegible para el estímulo" — la métrica que el mismo comentario de
`kit.tsx:154-156` nombra como el caso que debía ir **limpio** (con `delta`
omitido) — así que los litros de diésel del ejercicio salen rotulados
"0% · sin movimiento".

Consecuencia: el contralor lee una afirmación falsa sobre la tendencia de su
propio gasto, en la tarjeta más grande de la pantalla de entrada. Y es la clase de
error que se descubre en la sala, porque él sí sabe que la semana pasada no gastó.

Causa raíz probable: `null` se usa como "no comparable" en el llamador y como
"pinta el pie neutro" en el componente; los dos significados colisionan en la
misma rama.

---

---

## A13 · [ALTO] Una consulta caída del Resumen se pinta como "aún no hay gastos capturados", y el aviso de "pantalla incompleta" no la vigila

**Rubro:** Frontend  
**Dónde:** `src/app/dashboard/panel-periodo.tsx:97-101`


`src/app/dashboard/panel-periodo.tsx:97-101` (gemelo en `:74-81`)
(causa raíz en `src/app/dashboard/estado.ts:30` y `src/app/dashboard/inicio-contenido.tsx:39-41`)

`safe()` (`inicio-contenido.tsx:39`) traga cualquier excepción y devuelve `null`,
sin log. `getGastoPorSemanaSeries` sí lanza: pasa por `traerTodo` → `exigir`
(`src/lib/likida/pg.ts:34`), que hace `throw` ante error de PostgREST. Entonces:

Entra: PostgREST devuelve error en el `select` de `gasto` (RLS, statement timeout,
`max_rows`, la base caída un instante) mientras el resto del Resumen carga bien.
Sale: `gastoSemanalSeries === null` → `gastoModo === null` → la tarjeta imprime
**"Aún no hay gastos capturados."** Igual en la dona de al lado: `seriesKpis === null`
→ **"Aún no hay viajes registrados en este periodo."**

Y el guardarraíl no alcanza: `estadoPanel` (`estado.ts:30`) solo vigila cuatro
secciones — `acreditables`, `kpis`, `liquidaciones`, `anomalias`. `seriesKpis`,
`gastoSemanalSeries`, `liquidadoSemanalSeries`, `topRutasSeries`, `viajesPorMes`,
`cfgFiscal` y `gastosFiscales` **no están en esa lista**, así que el banner
"Faltan datos por cargar — esta pantalla está incompleta"
(`inicio-contenido.tsx:329-338`) no se pinta. La pantalla afirma la ausencia con
cara de certeza.

Prueba de que es incoherencia y no criterio: en la misma fila, la tarjeta
"Liquidado" **sí** distingue (`panel-periodo.tsx:110-113`, "No se pudo cargar esta
gráfica") y "Top rutas" también (`:135`). Dos de cuatro tarjetas contiguas dicen la
verdad y dos mienten. Mismo patrón en `inicio-contenido.tsx:358`: si
`getGastosFiscales` falla, `resumenPerdidas` es `null` y "Ahorro generado —
ejercicio 2026" imprime **$0.00** sin ninguna advertencia.

Consecuencia: es exactamente el fallo que la auditoría 5 marcó CRÍTICO y que
`estado.ts` existe para cerrar — el panel ciego afirmando "no hay nada". Hoy está
cerrado para cuatro consultas y abierto para siete.

Causa raíz probable: `estadoPanel` se escribió cuando el Resumen tenía 4 secciones;
las series del selector se agregaron el 8-ago y nadie las dio de alta en la lista.

---

---

## A14 · [ALTO] "Vencen pronto (≤ 5 días)" cuenta las que YA vencieron — y el mismo KPI se calcula distinto en /admin

**Rubro:** Frontend  
**Dónde:** `src/app/dashboard/arco/page.tsx:71`


`src/app/dashboard/arco/page.tsx:71` (rótulo en `:87`)

```ts
const vencenPronto = solicitudes.filter((s) => (…) && venceEn(s.venceEn) <= hoy);
```

`<= hoy` es "la fecha límite ya pasó o es hoy", no "faltan 5 días o menos". La
consola del superadmin calcula el MISMO indicador bien:
`src/app/admin/compliance/page.tsx:189` usa
`p.venceEn <= new Date(Date.now() + 5*864e5)…`.

Escenario, hoy 2026-08-20: la flota tiene dos solicitudes ARCO abiertas, una que
vence el **2026-08-22** y otra el **2026-08-24** (LFPDPPP art. 32, 20 días
hábiles). En `/dashboard/arco` la tarjeta **"Vencen pronto (≤ 5 días)" marca 0**.
Javier, mirando `/admin/compliance` esa misma mañana, ve **2**. Si una tercera
venció el 2026-08-18 y sigue abierta, el panel de la flota la cuenta como
"vence pronto" cuando ya está fuera de plazo.

Consecuencia: la responsable del tratamiento (la flota) es quien tiene el deber
legal de contestar, y su tablero le dice que no hay nada urgente el día antes del
vencimiento. Un incumplimiento del art. 32 no lo paga Likida, lo paga el cliente —
y el cliente va a preguntar por qué su panel decía cero.

Causa raíz probable: el KPI se copió del panel de superadmin sin la aritmética;
`venceEn()` (`:70`) recorta a `YYYY-MM-DD` pero nunca se le suma la ventana.

---

---

## A15 · [ALTO] `gasto` y `liquidacion` son las dos únicas tablas de dinero fuera de `ve_finanzas()`: cualquier rol de oficina las lee y las escribe por PostgREST

**Rubro:** Modelo de datos  
**Dónde:** `supabase/migrations/0086_retirar_rol_operador.sql:39-52`


`supabase/migrations/0086_retirar_rol_operador.sql:39-52` ·
`supabase/migrations/0048_comercial_cliente_tarifa_ingreso.sql:42-46` (el criterio) ·
`src/lib/auth/visibilidad.ts:36-45` · `supabase/verificaciones.sql:1077-1123` (el bloque 29,
que prueba seis tablas y no estas dos)

**Escenario, con valores.** La política de `gasto` y `liquidacion` es la genérica que la
0086 recreó: `tenant_data … for all using (tenant_id = any(get_user_tenant_ids()) or
is_superadmin()) with check (…)`. No hay `ve_finanzas()` ni ningún filtro por rol. Ninguna
migración revoca los grants por defecto de Supabase sobre esas tablas (el único `revoke`
de tabla en las 136 migraciones es `llm_costo_mensual`, 0072:82). Un `encargado` de la
flota A —jefe de tráfico, a quien `visibilidad.ts:41` le da `['operacion']` y nada más—
con su propia sesión:

```
GET  /rest/v1/liquidacion?select=total_comprobado,total_anticipo,diferencia,estatus
POST /rest/v1/gasto  {"tenant_id":"<A>","viaje_id":"<viaje abierto de A>",
                      "concepto":"diesel","monto":40000,"forma_pago":"01"}
```

La primera devuelve la liquidación de cada viaje de la flota: comprobado, anticipo y
diferencia. La segunda **entra**: pasa `gasto_concepto_dominio`, pasa
`gasto_monto_no_negativo`, pasa `gasto_forma_pago_formato` y pasa el trigger
`trg_gasto_no_tras_liquidar` porque el viaje todavía no tiene liquidación.

**El estado que queda.** $40,000 de diésel que nadie compró, dentro de un viaje abierto.
Al cuadrar, `engine.ts:275-277` los suma a `totalComprobado`, y como `forma_pago = '01'`
entran al denominador del 15% de RFA 2026 regla 2.9. El PDF que recibe el operador y el
contralor sale con esa cifra. `bitacora_auditoria` no tiene una sola fila: la escritura
nunca pasó por `anotar()` porque nunca pasó por la aplicación.

**Consecuencia.** El argumento con el que se vende el producto —"las pantallas de dinero no
son para el encargado"— es cierto en la UI y falso en la base. Un puesto medio ve el margen
completo de la flota con un `fetch`, y puede meter un gasto que acaba en un papel fiscal.
Es exactamente la fuga que la 0048:42-46 describe para justificar `ve_finanzas()` —*"sin
esto, un encargado curioso lee las tarifas de su flota con un fetch"*— aplicada a las dos
tablas que el `ve_finanzas()` nunca alcanzó.

**Causa raíz probable.** `ve_finanzas()` nació en la 0048 junto con las tablas comerciales
y se aplicó a las tablas nuevas de esa tanda. `gasto` y `liquidacion` venían de la 0001 con
`tenant_data`, y la 0086 —que las tocó para quitarles `not is_operador()`— reprodujo la
policy tal cual en lugar de revisarla contra la matriz de roles que ya existía.

---

---

## A16 · [ALTO] El sondeo de arranque borra el mutex de un viaje real del camino del dinero

**Rubro:** Operabilidad y DX  
**Dónde:** `src/lib/likida/startup.ts:63-70`


`src/lib/likida/startup.ts:63-70` · `supabase/migrations/0005_concurrencia.sql:45-51`

`verificarMigracionesCriticas()` sondea la migración 0005 así:

```ts
const { data: viajeReal } = await admin.from('viaje').select('id').limit(1);
if (viajeReal?.[0]?.id) {
  const { error } = await admin.rpc('try_lock_viaje', { p_viaje: viajeReal[0].id, p_ttl_ms: 1 });
  ...
  await admin.rpc('unlock_viaje', { p_viaje: viajeReal[0].id }); // liberar el lock de prueba
}
```

El `unlock_viaje` de la 0005 es `delete from viaje_lock where viaje_id = p_viaje`
— **sin comprobar propiedad**. Y la llamada de :70 corre incondicionalmente: no
mira si `try_lock_viaje` devolvió `true`. El comentario («liberar el lock de
prueba») asume una propiedad que el código nunca verificó.

**Escenario, 3 a.m.** El chofer manda "listo" del viaje `9d1f…`. `conv.ts:426`
toma el lease con `ttlMs = 60_000` y arranca los 13 pasos del cierre. A los 8
segundos entra otro mensaje por WhatsApp en una **instancia fría**: Next corre
`register()`, que llama a `verificarMigracionesCriticas()`; `select id from viaje
limit 1` (sin `order by`) devuelve `9d1f…`; `try_lock_viaje(9d1f…, 1)` devuelve
`false` —no hay `error`, así que **no se emite ni una línea**— y acto seguido
`unlock_viaje(9d1f…)` **borra el lease que la liquidación en vuelo está
usando**. La segunda invocación adquiere el mutex y el "listo" puede cuadrar
sobre gastos parciales: exactamente lo que la 0005 existe para impedir
(«un "listo" puede cerrar el viaje ANTES de que el OCR de la última foto guarde
su gasto», 0005:17-20). En el log no queda **nada**: el probe silencioso no
escribe, y la liquidación corta se emite como una liquidación normal.

**Consecuencia para quien opere esto:** el contralor recibe un PDF que no cuadra
con sus comprobantes, y no hay una sola línea que relacione ese cierre con un
arranque en frío. El único backstop que sobrevive es
`liquidacion_viaje_uidx`, que impide la liquidación DOBLE, no la CORTA.

**Causa raíz probable:** un diagnóstico de solo-lectura se escribió con una RPC
que **muta**, sobre una fila de producción elegida arbitrariamente, y sin usar
el valor de retorno del `try_lock` que le habría dicho que ese lock no era suyo.

---

---

## A17 · [ALTO] El fail-closed del kill switch deja los cinco crons en verde y sin correo

**Rubro:** Operabilidad y DX  
**Dónde:** `src/lib/likida/interruptores.ts:72-78`


`src/lib/likida/interruptores.ts:72-78` · `src/app/api/cron/escalar/route.ts:79-82` ·
`facturar/route.ts:277-283` · `purgar/route.ts:77-80` · `wa-pendientes/route.ts:65-68` ·
`runner` (vía `correrRunner`)

`estaApagado()` falla cerrado a propósito y **lo grita** (`logger.error
('interruptores.lectura_fallo')`). El problema es lo que hacen los llamadores
con ese `true`: los cinco crons responden `NextResponse.json({ corrio: false,
saltado: 'interruptor global' })` — **status 200**.

**Escenario, 3 a.m.** Supabase tiene un bache de conexiones de 40 minutos (o
alguien toca las policies de `interruptor`). A las 03:00 `escalar` pregunta, no
puede leer, se salta. A las 03:30 `facturar` igual. A las 03:05, 03:10, 03:15…
`wa-pendientes` igual — y ése además usa `logger.info`
(`wa-pendientes/route.ts:66`), nivel que **ni siquiera llega a Sentry**
(`logger.ts:157`). A la mañana siguiente:

- panel de Crons de Vercel: **cinco verdes**, 200 en todas las corridas;
- `ALERTA_EMAIL`: **cero correos** — `alertarOperador` no se llama en la rama
  del `saltado`;
- `/admin/observabilidad` y la campana: `corridasFallo = 0`, porque una corrida
  que se salta **no escribe fila en `agente_corrida`**;
- Sentry: **un** issue, `interruptores.lectura_fallo`, con meta
  `{ interruptor: 'global', err: 'fetch failed' }` — sin `codigo` ni `tenant`,
  así que `discriminadores()` (sentry.ts:161-169) devuelve `[]` y el
  fingerprint es `['interruptores.lectura_fallo','error']`: si ese issue ya
  nació alguna vez, **no vuelve a notificar**.

Y mientras tanto la bandeja durable de WhatsApp no se drena: los mensajes que el
webhook persistió esperan a un cron que se está saltando en silencio.

**Consecuencia para quien opere esto:** es el incidente documentado en
`api/health/route.ts:12-14` («el cron del camino del dinero tronó cada hora
durante nueve días») reproducido con la maquinaria nueva puesta, porque el
`saltado` no cuenta como fallo en ninguno de los cuatro tableros.

**Causa raíz probable:** «apagado a propósito no es un fallo» se aplicó también
al caso en que **no se pudo saber** si estaba apagado. Los dos comparten código
de salida y no comparten severidad.

---

---

## A18 · [ALTO] El runbook de las 3 a.m. dice que el canal de alerta no existe, y su prueba de deriva no puede notarlo

**Rubro:** Operabilidad y DX  
**Dónde:** `src/lib/observability/arranque.ts:52`


`docs/conocimiento/DEPLOY.md:97-114` y `:145-149` · `src/lib/observability/arranque.ts:52` ·
`src/lib/observability/runbook.test.ts:104-109`

`arranque.ts:52` declara `ALERTA_EMAIL` como variable silenciosa («los fallos de
cron no le llegan a nadie por correo») y `alerta.ts` la usa como el único canal
push del sistema. **`ALERTA_EMAIL` no aparece en un solo archivo `.md` del
repo** (verificado con `grep -rn ALERTA_EMAIL --include=*.md`). Peor: DEPLOY.md
:145-149 afirma, bajo "Lo que este runbook NO cubre":

> **Quién recibe qué cuando algo falla.** Hoy no hay nadie asignado ni ningún
> canal.

La tabla de "variables que deben estar en Vercel" (:103-106) lista dos
—`SENTRY_DSN`, `DEMO_TENANT_ID`— de las **cuatro** que hoy tiene `SILENCIOSAS`.
Y la guardia que debería impedir esta deriva la cierra en falso:
`runbook.test.ts:106` itera sobre un literal `['SENTRY_DSN', 'DEMO_TENANT_ID']`
en vez de sobre `SILENCIOSAS`, así que las dos que se agregaron después
(`NEXT_PUBLIC_APP_URL`, `ALERTA_EMAIL`) entraron al código sin que la prueba
—cuya cabecera promete que «`.env.example` y `DEPLOY.md` son parte del sistema,
no prosa suelta»— dijera nada. Los 53 tests de `src/lib/observability` pasan.

**Escenario, 3 a.m.** El cron `facturar` falla contra Facturapi. `alertarOperador
('cron.facturar', {error, codigo})` corre, lee `process.env.ALERTA_EMAIL`, no
está (nadie la puso: no está en la tabla del runbook), emite
`logger.info('alerta.sin_configurar')` **una vez por instancia** —nivel `info`,
que no llega a Sentry— y devuelve. A la mañana siguiente Javier abre DEPLOY.md,
lee que no hay canal de alerta, y concluye que el silencio es lo esperado.

**Consecuencia:** el único canal push del producto está construido, probado (10
tests en `alerta.test.ts`) y desconectado, y el documento operativo instruye
activamente a no buscarlo. Es la forma exacta del hallazgo de la auditoría 5
—`SENTRY_DSN` cableado y ausente del entorno— repetida sobre la variable nueva.

**Bonus verificado del mismo archivo:** DEPLOY.md:47 manda buscar
`startup.entorno`, un `msg` que **no existe** — el código emite
`startup.entorno_grupos` (arranque.ts:98,101) —, y no menciona
`startup.config_silenciosa`, que es la línea que dice qué falta. Un `grep` a las
3 a.m. contra el nombre del runbook devuelve cero resultados sobre un sistema que
sí está gritando.

---

---

## A19 · [ALTO] La única puerta de /vendedor no tiene una sola prueba: se rompe y la suite no se entera

**Rubro:** Pruebas  
**Dónde:** `src/lib/auth/guard.ts:92-100`


`src/lib/auth/guard.ts:92-100` (`requireVendedor`) · `src/lib/auth/guard.test.ts`
(cubre `requireSessionTenant` y `requireSuperadmin`; `requireVendedor` y
`exigirVerRuta` no aparecen).

**Escenario (M2, corrido).** Cambié la línea 95 a `if (false && s.rol !== 'vendedor' && s.rol !== 'superadmin')`
y corrí la suite completa: **388 archivos, 5,045 pruebas, todas verdes**. Con esa
línea rota, una sesión de `flota_admin` de una flota cliente entra a `/vendedor`.
Y entra a la versión ancha: `panel-vendedor.tsx:70` calcula
`esVendedor = rol === 'vendedor'`, que para un `flota_admin` es `false`, así que
llama `listarProspectos({})` — sin filtro. `vendedores.ts:303-314` construye esa
consulta con `supabaseAdmin()` y **sin ninguna cláusula de tenant**: devuelve
`empresa, contacto_nombre, telefono, correo, ciudad, vacante, estado` de TODOS
los prospectos. Es el pipeline comercial completo de Likida —incluidas las
flotas competidoras del que está mirando— y datos personales de terceros que
nunca dieron su aviso a ese cliente.

Intenté refutarlo por tres lados y no se cae: `proxy.test.ts:77` exige **sesión**
en las tres secciones, no rol (un `flota_admin` con sesión pasa); el gate está
duplicado en `layout.tsx` y `page.tsx` pero **es la misma función**, así que una
mutación abre las dos; y no existe ninguna prueba estructural que recorra
`src/app/**/route.ts` o los layouts verificando que cada zona tenga su gate
(las que sí recorren archivos —`sin_previews`, `dinero_por_area`,
`pruebas_en_ci`— vigilan otra cosa).

**Consecuencia.** Quien mantenga esto puede refactorizar `requireVendedor` —
extraerlo, invertir una condición, meter el rol nuevo del día — con la suite
entera en verde diciéndole que no rompió nada. `requireSuperadmin`, que es la
puerta hermana y la que sí tiene tres pruebas, es la evidencia de que aquí no se
trata de una decisión sino de un olvido.

**Causa raíz probable.** `/vendedor` (mig. 0105, 14-ago) llegó después de que se
escribiera `guard.test.ts`, y su gate se añadió al archivo sin añadirse al
archivo de pruebas de al lado.

---

---

## A20 · [ALTO] Las dos reglas que impiden cobrar contra nada no tienen arnés

**Rubro:** Pruebas  
**Dónde:** `src/lib/likida/facturacion_escritura.ts:404`


`src/lib/likida/facturacion_escritura.ts:404` (`registrarPago`) y `:455`
(`cancelarFactura`) · `src/lib/likida/facturacion_escritura.test.ts:9-13` declara
explícitamente que las escrituras no se prueban. Cobertura del archivo:
**31.8% de 283 líneas**.

**Escenario (M4, corrido).** Borré las dos guardas a la vez y corrí la suite:
**5,045 pruebas verdes**. Con eso puesto:

- `registrarPago` deja de leer el veredicto que ya calculó una línea antes.
  Una factura emitida de **$11,600 con $10,000 pagados** acepta un abono de
  **$2,000**: quedan **$12,000 cobrados contra $11,600 facturados**, y
  `abono.quedaSaldada` sigue mandando la factura a `pagada`. El sobrepago de
  **$400** no existe en ningún CFDI. Peor: la función pura `evaluarAbono` **sí**
  está probada (`:110-113` afirma que ese caso se rechaza con el saldo exacto en
  el mensaje) — o sea que la prueba verde certifica una decisión que el llamador
  ya no consulta.
- `cancelarFactura` cancela una factura **con pagos encima**. El comentario de
  `:440-443` explica por qué eso no puede pasar ("ese dinero ya contado tiene que
  aclararse primero"); la regla vive solo dentro de la función `async` y nadie la
  ejerce.

**Consecuencia.** La cartera del contralor —lo que se le debe y lo que ya se
cobró— descansa en dos `if` que ninguna prueba toca. Y el patrón engaña: al ver
`facturacion_escritura.test.ts` verde con 149 líneas y casos de centavo y de año
bisiesto, se concluye razonablemente que el módulo está cubierto.

**Causa raíz probable.** La decisión (correcta) de no probar contra un mock de
Supabase se aplicó al bulto: se extrajo `evaluarAbono` a función pura y se probó,
pero no se extrajo el **cableado** (¿se consulta el veredicto? ¿se cuenta antes
de cancelar?), que es lo que aquí se rompe.

---

---

## A21 · [ALTO] Las cuatro rutas de export tienen CERO líneas ejecutadas — y una de ellas documenta un IDOR ya corregido

**Rubro:** Pruebas  
**Dónde:** `src/app/api/export/pdf/[id]/route.ts`


`src/app/api/export/pdf/[id]/route.ts` (0.0% de **150** líneas),
`export/facturas-proveedor/route.ts` (0.0% de 62),
`export/liquidaciones/route.ts` (0.0% de 43),
`export/bitacora-peaje/route.ts` (0.0% de 40).
`grep -rn "export/pdf" --include="*.test.ts" src/` → **nada**.

**Escenario.** `export/pdf/[id]/route.ts:49-56` cuenta por escrito el bug:
"Faltaba esto y era un IDOR: la ruta autorizaba por SESIÓN y por TENANT, y ahí
se detenía. Cualquier usuario de la flota —incluido un OPERADOR— bajaba el PDF
de la liquidación de cualquier compañero con nada más que el id en la URL". El
arreglo son tres cosas encadenadas: `puedeVerArea(t.rol, 'dinero')` (:68),
`puedeExportar(t.rol)` (:74) y el `.eq('tenant_id', tenantId)` explícito (:87).
Ninguna de las tres se ejecuta en ninguna prueba. Borrar la línea 68 —el gate de
área, que es el que excluye al `encargado`, jefe de tráfico— devuelve el PDF con
anticipo, comprobado y diferencia por viaje a un rol al que la pantalla de al
lado le esconde la gráfica de dinero, y la suite queda en verde. El mismo
párrafo del IDOR está copiado como comentario en `facturas-proveedor` y
`bitacora-peaje`: la lección está escrita cuatro veces y anclada cero.

**Consecuencia.** El repo trata este IDOR como resuelto y documentado. Está
resuelto y **no** está protegido: el próximo refactor de las rutas de export no
tiene nada que se lo impida, y el modo de falla es silencioso (un 200 con un CSV
de más, no una excepción).

**Causa raíz probable.** La cobertura de `src/app/**/*.tsx` se excluye a
propósito y con buen argumento (`vitest.config.ts`), pero el argumento dice
expresamente "las RUTAS de API sí cuentan (`route.ts`, no `.tsx`): llevan HMAC,
filtro por tenant y dinero". El denominador las cuenta; nadie las ejerce.

---

---

## A22 · [ALTO] El mutex del viaje sigue sin techo — y lo nombra el comentario de su propio arreglo

**Rubro:** Rendimiento y costo  
**Dónde:** `src/lib/likida/conv.ts:426`


`src/lib/likida/conv.ts:426`

`presupuesto.ts:137-145` documenta el arreglo de la auditoría 8 con estas
palabras: *"`costos.ts`, `conv.ts` y `config.ts` llamaban a `supabaseAdmin()` en
crudo — ONCE de los trece pasos del cierre, **incluido el mutex del viaje** y la
barrera de ráfaga. Un cuelgue ahí no tenía techo y se comía los 120s de la
función entera."* En `conv.ts` hay 14 llamadas a Supabase; **trece pasan por
`acotada` y una no**: `admin.rpc('try_lock_viaje', …)`, la del mutex, la que el
comentario nombra. `releaseViajeLock` (`:615`), `intakeDelta` (`:489`) e
`intakePendientes` (`:525`) sí la tienen.

**Escenario:** el chofer escribe "listo". `processor.ts:2090` llama
`acquireViajeLock(viajeId, { maxWaitMs: reloj.acotar(12_000) })`. La RPC va a un
socket que acepta y calla; `fetch` hereda el default de undici, 300 000ms. El
chequeo `Date.now() - start >= maxWaitMs` (`conv.ts:450`) está **después** del
`await`, así que los 12s del `maxWaitMs` no se evalúan nunca. La cadena 1 sube
de 91.3s a **379s contra un `maxDuration` de 120**. Y como está dentro de un
`for (;;)`, cada vuelta puede volver a colgarse.

**Consecuencia:** el turno muere sin que se haya escrito nada (el mutex va antes
del agente), pero el mensaje queda envenenado por el hallazgo anterior: el
"listo" del chofer se pierde para siempre y él ve dos palomitas azules y ningún
cuadre.

**Causa raíz probable:** el arreglo se aplicó archivo por archivo con búsqueda
de `.from(`, y `.rpc(` en la misma línea que la asignación de `admin` se quedó
fuera de la rejilla.

---

---

## A23 · [ALTO] Nueve consultas del camino caliente siguen sin techo, y con una basta

**Rubro:** Rendimiento y costo  
**Dónde:** `src/lib/likida/wa_pendientes.ts:48,80,98,114,122,133`


`src/lib/likida/wa_pendientes.ts:48,80,98,114,122,133` ·
`src/lib/likida/interruptores.ts:67` · `src/lib/likida/avisar_cierre.ts:53-59` ·
`src/lib/likida/contactos.ts:55` · `src/lib/likida/consulta_chofer.ts`

El razonamiento de `TOPE_CONSULTA_MS` (`presupuesto.ts:91-95`) es explícito:
*"el peor caso sumado de la ruta son ~90.8s contra 120: cada consulta colgada
gasta `TOPE − 0.3`s de esa holgura, y con 8s la invocación sobrevive a TRES
colgadas."* Verifiqué la aritmética y es correcta — **para las consultas que
tienen el techo**. Sobre el camino de un "listo" que cierra hay al menos nueve
que no lo tienen:

| Consulta | Archivo:línea | Cuándo corre |
|---|---|---|
| `insert wa_evento_pendiente` | `wa_pendientes.ts:48` | **antes del 200**, una por mensaje |
| `update … intentos` (claim) | `wa_pendientes.ts:98` | al entrar al `after()` |
| `update … procesado_en` | `wa_pendientes.ts:114` | al salir |
| `select interruptor` | `interruptores.ts:67` | primera línea del `after()` |
| `rpc try_lock_viaje` | `conv.ts:426` | antes del agente (hallazgo anterior) |
| `select tenant` (teléfono del jefe) | `contactos.ts:55` | en el cierre |
| `select liquidacion` + `select viaje` | `avisar_cierre.ts:54,58` | en el cierre |

Cada una cae al default de undici: **300 000ms contra un `maxDuration` de 120.**
No sobrevive a una, mucho menos a tres.

**Escenario:** Supabase acepta la conexión y no contesta —el modo de falla que
`presupuesto.ts:82-84` dice haber medido en esta misma máquina—. La liquidación
YA está cerrada en la base y el PDF del operador ya salió; el proceso se cuelga
en `avisar_cierre.ts:54` mandándole el aviso al jefe. La invocación muere a los
120s. **Consecuencia:** `saveConversation` (`processor.ts:2550`) nunca corre, así
que el turno del asistente no queda en la conversación y el agente, en el
siguiente mensaje, contesta como si no hubiera cerrado nada. Cinco de esas nueve
consultas (`wa_pendientes.ts`, mig. 0119, 16-ago) son **posteriores** al arreglo
que declaró cerrado el hueco.

**Causa raíz probable:** `acotada` se exportó desde `presupuesto.ts` para que
"cualquier archivo lo importe sin volver a copiarlo" (`:143-144`), pero no hay
ninguna prueba ni regla de lint que exija que un `supabaseAdmin()` nuevo lo use
— a diferencia de `toLocaleString('es-MX')`, que sí tiene su prueba guardiana.

---

---

## A24 · [ALTO] `MARGEN_CIERRE_MS` ya está rebasado, y la prueba que debía atraparlo suma una tabla escrita a mano

**Rubro:** Rendimiento y costo  
**Dónde:** `src/lib/likida/presupuesto.ts:29-32,37-54,72`


`src/lib/likida/presupuesto.ts:29-32,37-54,72` ·
`src/lib/likida/presupuesto.test.ts:107-108` · `src/lib/likida/processor.ts:2523`

`PASOS_CIERRE` enumera 13 pasos y suma 8.9s; `MARGEN_CIERRE_MS` reserva 12s, y
el comentario promete el mecanismo: *"Meter un paso más al cierre sin ampliar el
margen deja de ser un descuido silencioso y pasa a ser una prueba en rojo."*
Pasó, y no se puso roja. `processor.ts:2523` llama `avisarCierreAlJefe`, que
añade **cuatro pasos de red** que la tabla no tiene:

| Paso añadido | Fuente | Costo unitario del propio repo |
|---|---|---|
| `telefonoJefeDe` | `avisar_cierre.ts:95` · `contactos.ts:55` | 0.3s |
| `resumenDeCierre` (2 consultas en paralelo) | `avisar_cierre.ts:53-59` | 0.3s |
| `sendText` del aviso | `avisar_cierre.ts:109` | 1.5s |
| `sendDocument` del PDF al jefe | `avisar_cierre.ts:127` | 2.5s |

**Escenario:** el cierre real cuesta **8.9 + 4.6 = 13.5s** contra una reserva de
12s. Sumado a un turno en que el agente use su techo (`acotar(40)`), la
invocación llega al cierre en t=78.7 con 41.3s de reloj y lo gasta en 13.2s
(cadena 1, pasos 12-15) — sobra, pero la reserva que el sistema *cree* tener ya
no existe: el `alcanza(COSTO_AGENTE_MS)` de `processor.ts:2176` lanza el agente
apoyándose en un `restante()` calculado con 12s apartados para un cierre que
cuesta 13.5s. Añádase una sola consulta lenta del cierre (9.5s por `acotada`) y
el PDF no sale.

**Consecuencia:** la liquidación queda cerrada en la base (irreversible por los
triggers 0036/0037) y el operador no recibe el documento. Es exactamente el
`pdf.no_entregado` que `presupuesto.ts:85-88` describe, salvo que el proceso
muere antes del `catch` y la línea de log tampoco se escribe.

`presupuesto.test.ts:107-108` asserta `COSTO_CIERRE_MS === sum(PASOS_CIERRE)` y
`MARGEN_CIERRE_MS >= COSTO_CIERRE_MS`. Las dos son ciertas sobre la tabla y
ninguna lee `processor.ts`. La prueba verifica que la tabla sea consistente
consigo misma, no que describa el cierre.

**Causa raíz probable:** una tabla mantenida a mano se presenta como verificable
porque tiene una prueba, pero la prueba solo cierra el circuito
tabla↔constante, nunca tabla↔código.

---

---

## A25 · [ALTO] `/api/dashboard/ingesta` gasta modelo sin techo y sin dejar fila de costo

**Rubro:** Seguridad  
**Dónde:** `src/app/api/dashboard/ingesta/route.ts:28-33`


`src/app/api/dashboard/ingesta/route.ts:28-33` (la puerta entera de la ruta) ·
`src/app/api/dashboard/ingesta/route.ts:48` (`extraerComprobante`) ·
`src/lib/likida/intake/ocr.ts:225` · contraste en
`src/app/api/dashboard/chat/tope.ts:31-41` y `src/app/api/dashboard/chat/route.ts:62-68`.

**Escenario.** Un `contador` de una flota (o quien tenga su cookie) manda en
bucle:

```
POST /api/dashboard/ingesta
Cookie: sb-<proj>-auth-token=<sesión válida de un rol con área 'dinero'>
Content-Type: application/json

{"imagen":"data:image/png;base64,<~6,000,000 caracteres>"}
```

La ruta comprueba sesión (`:29`) y área (`:31`) y **nada más**: no hay una sola
llamada a `rateLimit` en el archivo — comprobado con `grep -c rateLimit` sobre
la ruta, que da 0 — y no hay lectura de presupuesto. `extraerComprobante` llama
al modelo de visión con `AbortSignal.timeout(45_000)` y ninguna consulta de
gasto. Con `maxDuration = 60` y el tope de cuerpo de ~6 MB como única cortapisa,
100 peticiones por minuto son 6,000 llamadas de visión por hora contra
`OPENROUTER_API_KEY`. La ruta hermana con el MISMO nivel de confianza,
`/api/dashboard/chat`, sí frena: lee `gastoChatHoyUsd(tenantId)` y corta en
`topeDiaUsd()` = $1 USD/día por flota, fallando cerrado si no puede leer.

**Y el gasto es invisible.** `grep registrarCosto` sobre `ingesta/route.ts` y
sobre `intake/ocr.ts` no devuelve nada: esta ruta **nunca escribe en
`llm_costo`**. Solo emite `logger.info('ingesta.sonda', {costoUsd})`
(`:50-53`). Como `src/lib/admin/negocio.ts` agrega `llm_costo` para la consola
de costo de IA, y `gastoChatHoyUsd` filtra `.eq('fase','chat')`, el gasto de
esta ruta no aparece ni en el freno ni en el tablero. El camino equivalente por
WhatsApp sí lo registra (`processor.ts:785` y `:1060`, `fase: 'ocr'`).

**Consecuencia.** Un bucle de UI o una sesión robada agota el saldo de
OpenRouter. Cuando se agota, se cae **todo** el LLM del producto —el OCR de los
comprobantes que llegan por WhatsApp incluido—, o sea el minuto 2 del demo. Y
el tablero de `/admin` que Javier mira para saber cuánto gasta Likida en IA
seguirá enseñando la cifra de siempre, porque esa cifra sale de una tabla en la
que esta ruta no escribe. Es además la contradicción de un rótulo del propio
repo: `src/app/api/admin/copiloto/route.ts:63-64` afirma que el copiloto "era el
ÚNICO camino de LLM sin freno de gasto".

**Nota secundaria del mismo archivo hermano:** `/api/dashboard/archivo/route.ts:25-29`
tampoco llama a `rateLimit`, y ahí se parsean hasta ~12 MB de base64 con `xlsx`
y `pdf-parse` (`MAX_BASE64 = 16_000_000`, `:22`) con `maxDuration = 60`. No
gasta modelo, pero es CPU y memoria sin cuota detrás de la misma sesión.

**Causa raíz probable.** El freno de gasto se pensó por *pantalla* (el chat) y
no por *frontera* (toda ruta de `/api` que llame a un modelo); la ruta de
ingesta nació como "sonda" de OCR y nunca entró al inventario de caminos de LLM.

---

---

## A26 · [ALTO] El informe en PDF de la oficina se acusa como entregado aunque Meta lo rechace

**Rubro:** Sistema agéntico  
**Dónde:** `src/lib/likida/oficina_wa.ts:117-118`

`src/lib/likida/oficina_wa.ts:117-118`

```ts
const enviado = await sendDocument(telefono, firma.data.signedUrl, `informe-operacion.pdf`, 'Tu informe de operación 📊');
if (!enviado) throw new Error('informe.envio: WhatsApp no aceptó el documento');
return 'Ahí te va tu informe en PDF 📊 — cifras del sistema de este momento.';
```

`sendDocument` (`src/lib/meta/client.ts:366-371`) devuelve
`{ ok: true, id } | { ok: false, error, codigo }` — **siempre un objeto**, así que
`!enviado` es siempre `false` y el `throw` es código muerto.

**Escenario:** el dueño escribe «mándame el informe en pdf» desde
`5215512345678`, un número que todavía no está en la lista de destinatarios del
número de prueba de Meta. Meta contesta `131030`; `sendDocument` registra
`wa.sendDocument` y devuelve `{ ok: false, error: 'Recipient phone number not in
allowed list', codigo: 131030 }`. La condición no dispara, el `catch` del
llamador (`processor.ts:605-608`) tampoco, y el dueño recibe **«Ahí te va tu
informe en PDF 📊 — cifras del sistema de este momento.»** y ningún documento.
Se queda esperando un archivo que nunca va a llegar, y `logger.info('oficina.informe_pdf')`
lo registra como éxito.

**Consecuencia:** el comprador pide su informe delante de su equipo y el producto
le dice que ya se lo mandó. Es exactamente el mismo defecto que `processor.ts:2492-2496`
y `avisar_cierre.ts:127-129` ya corrigieron para el PDF de liquidación (auditoría 12,
ALTO); este llamador nació con el contrato viejo tres días después.

**Por qué no lo atrapa la prueba:** `src/lib/likida/oficina_wa.io.test.ts:32` mockea
`sendDocument` devolviendo **el string `'wamid-1'`** — el contrato anterior al cambio.
La prueba pasa con la función rota y pasaría igual si `sendDocument` devolviera
`{ok:false}`.

**Causa raíz probable:** el llamador nuevo se escribió copiando el patrón viejo
(`sendText` → `string | null`) sin releer la firma de `sendDocument`, y el mock de
su prueba se escribió del mismo recuerdo.

---

---

## A27 · [ALTO] Un mensaje que muere o se abandona a media ejecución queda sellado como procesado: el inbox durable no reintenta nada

**Rubro:** Sistema agéntico  
**Dónde:** `src/app/api/webhook/whatsapp/route.ts:249-259`

`src/app/api/webhook/whatsapp/route.ts:249-259` · `src/lib/likida/processor.ts:420-424`

El inbox durable (0119, cableado el 16-ago) declara en `route.ts:170-173`: *«si la
invocación muere después del acuse y antes de terminar el after(), la fila durable
sigue ahí y el cron `wa-pendientes` la recupera por el motor real»*. No la recupera,
por dos motivos independientes:

1. **`claimMessage` se reclama ANTES de cualquier efecto** (`processor.ts:420`). En
   el reintento, el mismo `waMessageId` devuelve `'duplicado'` y `processInbound`
   sale en la línea 423 sin hacer nada — y `route.ts:255` / el cron sellan
   `procesado_en`.
2. **Los caminos de abandono retornan normalmente**, no lanzan. `marcarPendienteProcesado`
   solo se salta cuando `processInbound` **lanza** (`route.ts:256`), y `processInbound`
   atrapa todo en su `catch` general (`processor.ts:2561-2598`).

**Escenario con valores:** el operador manda «listo» a las 14:03. La invocación
toma el mutex, corre `esperarIntake` (20 s) y entra al agente; a los 118 s Vercel
la mata (`maxDuration = 120`). Estado en la base: `wa_mensaje_procesado` tiene
`wamid.HBgM...`; `wa_evento_pendiente` tiene la fila con `intentos = 1`,
`procesado_en = null`. A las 14:08 el cron drena: `reclamarPendiente` gana,
`processInbound(evento)` → `claimMessage` → `23505` → `'duplicado'` →
`logger.info('wa.duplicate')` → `return`. El cron llama `marcarPendienteProcesado`
y cuenta **1 procesado**. El operador nunca recibe cuadre ni PDF; el reporte del
cron dice que todo salió bien.

El caso hermano es el abandono explícito: `processor.ts:2090-2098` (mutex ocupado),
`:947-962` (el `+1` de la barrera falló en una foto), `:1633-1638` (lo mismo con el
XML) y `:707-724` (aviso de privacidad con fallo transitorio) hacen
`releaseMessageClaim(...)` + `return`. Liberar ese claim ya no sirve para nada —el
propio `conv.ts:334-338` documenta que el reintento de Meta *no existe*— y ahora
además el `return` normal hace que la fila durable, que sí podría recuperarlo, se
selle como procesada.

**Consecuencia:** el único mecanismo de recuperación del producto solo cubre el
caso del kill-switch (mensajes que nunca entraron a `processInbound`). Para el modo
de falla que más duele —«se trabó a media liquidación»— la recuperación es inerte y
depende por completo de que el chofer vuelva a escribir.

**Causa raíz probable:** dos capas de idempotencia escritas con meses de diferencia
y ordenadas al revés — la de mensaje (0002) reclama al ENTRAR, la durable (0119)
sella al SALIR, y ninguna sabe de la otra.

---

---

## A28 · [ALTO] El cierre de liquidación —cifras y PDF— sale por WhatsApp al *encargado*, el rol que no ve dinero

**Rubro:** Sistema agéntico  
**Dónde:** `src/lib/likida/avisar_cierre.ts:95`

`src/lib/likida/avisar_cierre.ts:95` · `src/lib/likida/contactos.ts:94` · `src/lib/auth/visibilidad.ts:41`

`avisarCierreAlJefe` resuelve el destinatario con `telefonoJefeDe(tenantId)`, y ese
lookup tiene un orden de preferencia fijo:

```ts
const ORDEN_AVISO: RolOficina[] = ['encargado', 'flota_admin'];   // contactos.ts:94
```

El **encargado va primero**. Y `visibilidad.ts:41` dice `encargado: ['operacion']` —
sin `dinero`, con un archivo entero de comentarios explicando que enseñarle el
margen «no es un detalle de UI, es exponerle a un puesto medio las finanzas
completas de la empresa», y con `dinero_por_area.test.ts` escaneando las páginas
para que no se cuele.

Lo que recibe por WhatsApp cuando un chofer cierra:

- `armarAvisoJefe` (`cierre_aviso.ts:324`): `Anticipo $8,000.00 · Comprobado
  $6,150.00 · Sobró $1,850.00 del anticipo (a favor de la empresa)`, más las
  líneas de `sobre_politica`, `sin_comprobante`, `cfdi_efos`…
- y el **PDF de la liquidación completa** (`avisar_cierre.ts:127`).

**Escenario:** flota con Lupe (`rol: 'encargado'`, teléfono capturado para poder
recibir escalaciones de despacho) y Javier (`flota_admin`). El chofer Juan cierra
su viaje V-1042. Lupe recibe en su teléfono personal el anticipo, el comprobado, la
diferencia y el PDF de la liquidación de Juan. Abre `/dashboard` y no puede ver ni
una de esas cifras.

**Consecuencia:** el canal de WhatsApp es la puerta trasera de la matriz de
visibilidad, exactamente lo que `oficina_wa.ts:29-30` declara que no puede ser
(«el canal no puede ser la puerta trasera») y lo que `informes_wa.ts:115-116`
implementa bien tres archivos más allá (`if (puedeVerArea(rol, 'dinero'))`). Un
contralor que lo note en la sala pregunta qué más se está mandando solo.

**Causa raíz probable:** `telefonoJefeDe` se escribió para la ESCALACIÓN de
despacho —un aviso de operación, donde el encargado es el destinatario correcto— y
se reusó tal cual para el cierre, que es un aviso de dinero. La lista de preferencia
no tiene por dónde saber de qué tipo de aviso se trata.

---

---

## A29 · [ALTO] El arranque libera el mutex del viaje que otro proceso está cerrando

**Rubro:** Sistema agéntico  
**Dónde:** `src/lib/likida/startup.ts:63-70`

`src/lib/likida/startup.ts:63-70`

```ts
const { data: viajeReal } = await admin.from('viaje').select('id').limit(1);
if (viajeReal?.[0]?.id) {
  const { error } = await admin.rpc('try_lock_viaje', { p_viaje: viajeReal[0].id, p_ttl_ms: 1 });
  ...
  await admin.rpc('unlock_viaje', { p_viaje: viajeReal[0].id }); // liberar el lock de prueba
}
```

Dos cosas a la vez. El `data` de `try_lock_viaje` (que devuelve `false` cuando otro
proceso tiene el lease vigente) **se ignora**, y `unlock_viaje` no tiene noción de
dueño: `delete from viaje_lock where viaje_id = p_viaje` (`0005_*.sql`). O sea que
el sondeo borra el lease **exista o no, sea suyo o no**. Y `instrumentation.ts`
llama `verificarMigracionesCriticas()` en `register()`, que corre en **cada arranque
en frío de una instancia de Vercel** — no una vez al día.

**Escenario con valores:** la base del demo tiene 3 viajes; `select id from viaje
limit 1` devuelve `V` (el mismo, corrida tras corrida, sin `order by`). 14:03:00 —
el operador escribe «listo»; la invocación A hace `acquireViajeLock(V, ttl 60_000)`
→ `true`, y entra a `esperarIntake` + agente (~35 s). 14:03:04 — el operador manda
un segundo mensaje; Vercel escala y arranca una instancia nueva, que ejecuta
`register()` **antes** de atender su petición: `try_lock_viaje(V, 1)` → `false`
(sin `error`), y acto seguido `unlock_viaje(V)` **borra el lease de A**. La
invocación B llega a `processor.ts:2090`, toma el lock libre, pasa la re-verificación
de `getOpenViaje` (A todavía no ha cerrado) y corre el ciclo del agente completo:
segundo `cuadrar_viaje`, segundo `guardar_liquidacion`, dos subidas más a Storage
sobre las mismas rutas, y el operador recibe el cierre y el PDF **dos veces**.

**Consecuencia:** se paga el LLM dos veces y, si una foto entró entre los dos
cálculos, los dos cierres narran cifras distintas del mismo viaje — el escenario
AG-3 que `guardiaCifras` cerró con el snapshot, reabierto por otra puerta. El
`unique(viaje_id)` de la 0005 salva la FILA, no el mensaje ni el costo: es
exactamente el modo de falla que `processor.ts:2060-2067` describe («ambas
ejecuciones reportan éxito → el operador recibe el cierre y el PDF DOS veces»).

**Causa raíz probable:** el sondeo se escribió pensando en una base de desarrollo
—«liberar el lock de prueba»— y `unlock_viaje` no distingue dueño, así que el
diagnóstico y el camino del dinero comparten un recurso sin token.

---

---

## A30 · [ALTO] El loop-guard mata la tool terminal, y con ella la respuesta ya pagada

**Rubro:** Tool calling  
**Dónde:** `src/lib/llm/openrouter.ts:792-794`


`src/lib/llm/openrouter.ts:792-794` · `src/lib/agents/analista.ts:316-330, 345-346, 356-372, 388-406, 417` · `src/lib/agents/copiloto.ts:199-220, 251-269`

**Escenario (con valores).** El analista corre con `maxToolRounds: 5`
(`analista.ts:325`). El `for` de `generateWithTools` permite 5 completions, pero
`if (round === maxRounds - 1) throw new LoopGuardError(maxRounds)` corta **antes**
del `Promise.all`, así que solo las rondas 0-3 ejecutan tools (lo fija
`openrouter_loopguard.test.ts:58`: con `maxToolRounds: 3` hay 3 completions y **2**
ejecuciones).

Un contralor pregunta *"compárame el gasto y lo liquidado del mes y dime mis top
rutas"*. `gemini-3.5-flash-lite` (rol `chat`) resuelve en serie:

| ronda | tool |
|---|---|
| 0 | `kpis_flota` |
| 1 | `serie_gasto` |
| 2 | `serie_liquidado` |
| 3 | `top_rutas` |
| 4 | `entregar_respuesta` ← `round === 4 === maxRounds-1` → **LoopGuardError** |

La entrega nunca se ejecuta, `CAPTURAS` (`analista.ts:345`) queda vacío, y como
`generateWithTools` **lanza**, la excepción sale del `try` de `ejecutarAnalista`
—que tiene `finally` pero **no `catch`** (`analista.ts:417`)—. El route pinta
`{t:'error', error:'el analista no pudo responder en este momento'}`. Se pagaron
5 completions (~40,000 tokens de entrada acumulados por el crecimiento de la
conversación) por una respuesta que el modelo ya había redactado.

La justificación escrita del corte ("no hay una ronda siguiente que vaya a leer el
resultado de esas tools", `openrouter.ts:782-791`) es falsa justo para la tool
terminal: su resultado **no lo lee el modelo**, lo lee el orquestador por el mapa
`CAPTURAS`. Peor: el camino de reintento correctivo aprieta el cerco a
`maxToolRounds: 4` (`analista.ts:367`, `copiloto.ts:236`) —solo 2 rondas de
lectura antes de la entrega— y su prompt le pide explícitamente al modelo *"vuelve
a llamarlas si te hace falta"* (`analista.ts:363`).

**Consecuencia.** Para el contralor: una pregunta legítima de cierre de mes
contesta "no pude responder" con la respuesta ya escrita del otro lado. Y las tres
capas de red que el diseño promete —reintento correctivo, guardia de cifras, "red
final determinística" que arma la tabla con lo que las tools sí leyeron
(`analista.ts:388-406`, `copiloto.ts:251-269`)— **son inalcanzables por este
camino**: todas viven después del `await` que lanzó.

**Causa raíz probable.** El loop-guard trata todas las tool_calls como si su valor
para el turno viniera de que el modelo lea su resultado en la ronda siguiente; la
arquitectura de entrega por tool terminal (canal lateral `CAPTURAS`) rompe ese
supuesto y nadie exceptuó a la tool terminal del corte.

---

---

# MEDIO


## M1 · [MEDIO] Cuarta copia del mapa de conceptos, esta vez fuera del guardia que existe para eso · REINCIDENCIA

**Rubro:** Arquitectura  
**Dónde:** `src/lib/likida/etiquetas_sincronizadas.test.ts`


**Los lados.** El guardia vivo es `src/lib/likida/etiquetas_sincronizadas.test.ts`
y vigila exactamente dos mapas (`:36-37`): el del motor
(`src/lib/likida/cuadre/engine.ts:1181`) y el del panel de detalle
(`src/app/dashboard/[id]/page.tsx:28-32`). Además prohíbe que el PDF vuelva a
tener uno propio (`:43`: `not.toMatch(/const CONCEPTO_LABEL/)` sobre `pdf.ts`).

El cuarto mapa —fuera de toda esa vigilancia— es
`src/app/dashboard/gasto-semanal-chart.tsx:9-13`, y se llama **exactamente
`CONCEPTO_LABEL`**, el nombre que el test prohíbe en el otro archivo:

```
const CONCEPTO_LABEL: Record<string, string> = {
  diesel: 'Diésel', caseta: 'Casetas', viaticos: 'Viáticos',
  factura: 'Facturas', … otro: 'Otros',
};
```

Ya diverge en tres valores contra el motor: `'Casetas'` vs `'Caseta'`,
`'Facturas'` vs `'Factura'`, `'Otros'` vs `'Otro'`. Se dio de alta el
**16-ago-2026** (`2943219`), dentro de la ventana de esta ronda — es decir,
*después* de que el test se escribiera para impedir la tercera copia.

**Escenario con valores.** `getGastoPorSemana` (`analytics.ts:497-505`) rellena
`series[].nombre` con la clave cruda de `gasto.concepto`. Mañana entra un concepto
nuevo al tipo — digamos `'lavado'` en `ConceptoGasto`. El test
`etiquetas_sincronizadas.test.ts:57-66` obliga a etiquetarlo en el motor, y de ahí
lo hereda el PDF por import; el panel de detalle lo obliga la comparación de
`:46-48`. La gráfica del Resumen no la obliga nadie: `gasto-semanal-chart.tsx:40`
cae en `CONCEPTO_LABEL[s.nombre] ?? s.nombre` y pinta la leyenda **`lavado`**, en
minúscula y sin acento, junto a "Diésel" y "Casetas". La suite entera pasa en
verde. Es literalmente el fallo que la cabecera del test narra como la PRIMERA
desincronización (*"`viaticos` partido en tres: el dashboard se quedó corto y un
concepto salía en blanco en pantalla"*).

**Consecuencia.** El guardia da una sensación de cobertura que ya no corresponde
al mapa real: quien lea el test creerá que las tres fuentes están cerradas cuando
son cuatro y la nueva es la única que se ve en la pantalla de entrada.

**Causa raíz probable.** El test ancla por **rutas literales** (`'./cuadre/engine.ts'`,
`'../../app/dashboard/[id]/page.tsx'`), no por barrido de `src/`, así que un
archivo nuevo entra al repo por fuera de su radar. El mecanismo que sí escala —el
del `formato.ts`, que busca el patrón en TODO `src/`— existe en este mismo repo y
no se aplicó aquí.

---

---

## M2 · [MEDIO] La cola de facturación pide 600 s de presupuesto y corta el lote a los 150 s

**Rubro:** Backend y API  
**Dónde:** `src/app/api/cron/facturar/cola/route.ts:12`


`src/app/api/cron/facturar/cola/route.ts:12` (`maxDuration = 600`) y `:87-90` ·
`src/app/api/cron/facturar/route.ts:32` (`maxDuration = 300`), `:136`
(`PRESUPUESTO_LOTE_MS = maxDuration * 1000`), `:165`
(`MARGEN_LOTE_MS = 150_000`), `:535`

Escenario, con valores: el cron encola un lote de 8 tickets repartidos en 4
flotas distintas, cada una con su propio portal (peor caso medido de una sesión:
~147 s). El callback de QStash arranca con `inicio = Date.now()` y llama
`procesarLoteEnCola(loteVigente, req, hoy, inicio, …)`. Dentro, el corte es
`Date.now() - inicioLote >= PRESUPUESTO_LOTE_MS - MARGEN_LOTE_MS`, y
`PRESUPUESTO_LOTE_MS` es una constante derivada del `maxDuration` **de la ruta
del cron** (300 s), no del de la cola. O sea: corta a los **150 s**.

Flota 1 termina en ~148 s; flota 2 arranca (148 < 150) y termina en ~295 s;
flotas 3 y 4 caen en `sinTiempo` y quedan para la corrida de dentro de una hora
— con 305 s del presupuesto de la invocación sin usar.

Consecuencia: la cola drena a la mitad de la velocidad para la que se construyó,
y el encabezado de `cola/route.ts:9-12` afirma lo contrario («el techo de 300 s
de una invocación directa es justo lo que esta cola existe para romper»). En
plazos de facturación de 7-15 días en gasolineras no es fatal; en cierre de mes
fiscal de casetas, cada hora perdida cuenta. Quien mantenga esto va a leer el
comentario y creer que el problema es el portal.

Causa raíz probable: `PRESUPUESTO_LOTE_MS` se derivó de un `maxDuration` local en
vez de recibirse como parámetro cuando la función se extrajo para compartirla.

---

---

## M3 · [MEDIO] Los litros de diésel se declaran elegibles con cualquier forma de pago que no sea efectivo, incluida «99 · Por definir»

**Rubro:** Cumplimiento fiscal  
**Dónde:** `src/lib/likida/cuadre/engine.ts:1035-1036`


`src/lib/likida/cuadre/engine.ts:1035-1036`

**Norma** (ficha `normas/lif-2026-20-A.yaml`, `verificado_fuente_primaria`: **sí**).
La ficha transcribe el cuerpo de la fracción IV pero **no transcribe el párrafo del
medio de pago**; quien lo enuncia es el comentario del propio motor
(`engine.ts:1028-1029`): «El medio de pago es requisito del 4º párrafo de la LIF
20-A-IV (monedero, tarjeta, cheque nominativo o transferencia)». O sea: el motor aplica
un requisito cuyo texto no está en ninguna ficha — la regla del repo es que sin ficha no
se afirma.

**Código:**

```ts
const pagoElectronico = !!g.formaPago && g.formaPago !== '01';
if (pagoElectronico && Number.isFinite(litros) && litros > 0) { … litrosDieselAcreditables += litros; }
```

`!== '01'` no es la lista que el propio comentario cita. Entran `'99'` (Por definir,
el valor obligatorio de todo CFDI **PPD**), `'12'` (dación en pago), `'17'`
(compensación), `'23'` (novación) — ninguno es monedero, tarjeta, cheque nominativo ni
transferencia.

**Escenario con pesos.** CFDI de diésel a crédito (PPD, `formaPago: '99'`),
clave `15101505`, **500 litros**, $13,500.

- El motor imprime: «Diésel elegible para el estímulo de IEPS (LIF 2026 art. 20, ap. A)
  · **500 L**», y el pie le dice al contador que multiplique por la cuota fechada.
- Con la cuota disminuida de la semana del 15-21-ago-2026 ($2.2760/L, DOF 14-ago,
  codNota 5796377) eso son **$1,138.00** de estímulo declarados elegibles sobre un CFDI
  cuyo medio de pago todavía no existe: al timbrarse el complemento de pago puede
  resultar efectivo.
- La forma correcta es el mismo tercer estado que el motor ya aplica en todos lados: no
  elegible ni descartado, a revisión.

**Consecuencia.** Los litros son *la* cifra que el producto entrega en este estímulo
(porque los pesos se negaron a propósito). Inflarlos es inflar el único número duro que
sobrevivió a la decisión D2.

**Causa raíz probable:** `!== '01'` se escribió como «no fue efectivo» y nunca se
convirtió en la lista blanca que el comentario de al lado ya describe.

---

---

## M4 · [MEDIO] La rama buena de RLISR 57 es inalcanzable: nada en el producto escribe `operador.rfc`

**Rubro:** Cumplimiento fiscal  
**Dónde:** `src/lib/likida/cuadre/engine.ts:509-514`


`src/lib/likida/cuadre/engine.ts:509-514` · `src/lib/likida/repo.ts:994`

**Norma** (ficha `normas/rlisr-57.yaml`, `verificado_fuente_primaria`: **sí**), literal:

> «Si benefician a personas que le prestan servicios personales subordinados, los
> comprobantes fiscales **podrán ser expedidos a nombre de dichas personas**, en cuyo
> caso y para efectos del artículo 18, fracción VIII de la Ley, se tendrá por cumplido
> el requisito de respaldar dichos gastos con el comprobante fiscal a nombre de aquél
> por cuenta de quién se efectuó el gasto.»

**Código:**

```ts
if (esViatico && rfcOperador && norm(g.rfcReceptor) === rfcOperador) {
  // Es del operador: correcto por RLISR 57, no se reporta nada.
} else if (esViatico && !rfcOperador) {
  diferencias.push({ tipo: 'viatico_rfc_operador', …
    nota: `… Si es el del operador es válido (RLISR 57, trabajador subordinado) — captura su RFC para confirmarlo.` });
```

`rfcOperador` viene de `cuadre/desde_db.ts:52` (`operador?.rfc`). La columna existe
(mig. 0080) y el lector existe. El **escritor** `repo.ts:994 actualizarRfcOperador` se
agregó y **no lo llama nadie**: `grep -rn "actualizarRfcOperador" src/` fuera de
`repo.ts` → 0 resultados, y `src/app/dashboard/operadores/{page,vista}.tsx` no contiene
la cadena `rfc` en ninguna forma. Verificado hoy.

**Escenario con pesos.** Hospedaje de **$2,320** en carretera, timbrado al RFC del
operador (que es trabajador subordinado, es decir el supuesto que el reglamento
autoriza).

- El motor imprime `viatico_rfc_operador`, la liquidación entera baja a **«Por
  revisar»** (el tipo está en `REVISAR`, `engine.ts:1135`) y el papel instruye
  «captura su RFC para confirmarlo» — una acción que **no existe en ninguna pantalla ni
  endpoint del producto**.
- El dinero no se pierde ($2,320 siguen deducibles y su IVA acreditable: el tipo no
  está en `NO_DEDUCIBLE_ISR` ni en `SIN_ACREDITAMIENTO`), pero **toda** liquidación con
  un viático a nombre del operador queda condenada a revisión humana permanente.

**Consecuencia.** Al contralor se le pide una acción imposible en el documento que
archiva, y la promesa de «cero fallas» se convierte en una bandeja que nunca se vacía.
La ficha ya declara este pendiente («lo que SIGUE faltando es la CAPTURA»); lo nuevo de
esta ronda es que ahora hay una función escrita para hacerlo y sigue sin cablearse.

**Causa raíz probable:** la corrección se hizo por capas (esquema → lector → función de
escritura) y se detuvo un paso antes de la UI.

---

---

## M5 · [MEDIO] Un consumo en bar se imprime 100% deducible

**Rubro:** Cumplimiento fiscal  
**Dónde:** `src/lib/likida/cuadre/tope_alimentacion.ts:60-62`


`src/lib/likida/cuadre/tope_alimentacion.ts:60-62` · `src/lib/likida/cuadre/engine.ts:907-948`

**Norma** (ficha `normas/lisr-28-XX.yaml`, `verificado_fuente_primaria`: **NO** —
`evidencia_corroborante`; el PDF de diputados no se pudo leer en la sesión que la
cerró, así que este hallazgo se anota **no verificable en fuente primaria en esta
ronda**), texto transcrito:

> «XX. El 91.5% de los consumos en restaurantes. Para que proceda la deducción de la
> diferencia, el pago deberá hacerse invariablemente mediante tarjeta de crédito, de
> débito o de servicios, o a través de los monederos electrónicos que al efecto
> autorice el Servicio de Administración Tributaria. […] **En ningún caso los consumos
> en bares serán deducibles.**»

**Código:**

```ts
export function llevaTopeAlimentacion(concepto: string): boolean {
  return concepto === 'alimentacion' || concepto === 'viaticos';
}
```

Toda `alimentacion` recibe el mismo trato de viático de la fracción V (deducible hasta
$750/día). No existe el concepto `bar` ni una señal de consumo de alcohol en el intake.

**Escenario con pesos.** Ticket de bar de **$600** con CFDI y tarjeta, dentro de un
viaje con hospedaje.

- El motor imprime: `Deducible para ISR $600.00`, en verde, y acredita **$82.76** de
  IVA citando LIVA art. 5.
- La norma (fr. XX, última oración) dice **$0.00** deducible y, por LIVA 5-I (que
  define «estrictamente indispensable» como «deducible para ISR»), **$0.00** de IVA
  acreditable.

**Consecuencia.** Es el modo de falla que el producto prohíbe por escrito: sobreestimar
la deducción. La ficha lo declara `NO_IMPLEMENTADO` con su plan de cierre, así que no
es un descuido oculto — pero mientras no exista la clasificación, la cifra impresa está
de más y nada en el papel lo advierte.

**Causa raíz probable:** el OCR agrupa «restaurante, fonda, tortas, agua, café» bajo una
sola etiqueta (`intake/ocr.ts`), y sin esa distinción el motor no puede afirmar 8.5%/0%
sin inventar.

---

---

## M6 · [MEDIO] El panel del cliente cita, en pantalla, el artículo de la ley abrogada

**Rubro:** Cumplimiento legal  
**Dónde:** `src/app/dashboard/arco/page.tsx:80`


`src/app/dashboard/arco/page.tsx:80` (texto visible) · también en
`src/lib/admin/escalaciones.ts:244`, `src/lib/admin/guardia.ts:73` (dos veces),
`src/app/admin/compliance/page.tsx:33`, `src/lib/likida/repo.ts:958`,
`src/lib/likida/privacidad.ts:642`

**Escenario, con el dato nombrado.** El contralor entra a
`/dashboard/arco` a atender la solicitud de *Juan Pérez* y lee bajo el título:
*"Solicitudes de tus operadores y cómo responderlas a tiempo (LFPDPPP art. 32:
20 días hábiles)"*. La tabla de equivalencias del propio repo, verificada contra
el texto vigente, dice que los plazos ARCO son el **art. 31** de la ley de 2025
y que el art. 32 es la numeración de la **ley abrogada de 2010**
(`docs/conocimiento/11-datos-personales.md:48` y `:656`).

**Consecuencia.** El afectado inmediato es el cliente responsable, a quien el
producto le entrega un fundamento derogado para sostener su cumplimiento ante la
Secretaría Anticorrupción y Buen Gobierno. El propio repo fijó la regla —
*"si tu abogado o cualquier blog te cita 'el artículo 16 de la LFPDPPP' […] está
citando la ley abrogada"* (`11-datos-personales.md:44`)—. Caso peor dentro del
mismo hallazgo: `privacidad.ts:642-644` no solo cita mal, **razona** con la ley
vieja: *"La LFPDPPP art. 32 fija 15, pero el DOCUMENTO dice 20 […] Si el aviso
cambia a 15, que este número lo siga"*, y le deja a quien venga la instrucción de
bajar el plazo apoyándose en un artículo que ya no existe. El valor ejecutado
(`DIAS_HABILES_ARCO = 20`, :645) sí coincide con el art. 31 vigente; lo que está
mal es el fundamento impreso y el razonamiento que lo acompaña.

**Causa raíz probable.** La renumeración se documentó en `docs/` y se aplicó al
aviso, pero nunca se barrió el resto del código en busca de la numeración vieja.

---

---

## M7 · [MEDIO] El aviso acota los modelos de lenguaje a "las fotos", y también viaja el texto del chofer

**Rubro:** Cumplimiento legal  
**Dónde:** `src/lib/likida/privacidad.ts:592`


`src/lib/likida/privacidad.ts:592` · `src/app/privacidad/page.tsx:79` ·
camino real en `src/lib/likida/processor.ts:2160-2201`

**Escenario, con el dato nombrado.** *Juan Pérez* escribe por WhatsApp
*"jefe, me quedé varado en Sabinas, gasté 600 de la grúa y ando malo del
estómago desde ayer"*. `processor.ts:2160` arma `turns = [...conv.turns, { role:
'user', content: msg.text }]` y `runAgent` (:2189) manda ese historial completo
—verbatim— por `generateWithTools` a OpenRouter → Claude Sonnet. La cláusula de
transferencias del aviso que Juan leyó dice que sus datos pasan por *"el
proveedor de mensajería de WhatsApp, el de alojamiento de la base de datos, y
**los modelos de lenguaje que leen las fotos**"* (`privacidad.ts:592`).

**Consecuencia.** El titular es el operador. La sección "Qué datos se tratan"
sí enumera *"el contenido de tus mensajes en esa conversación"*
(`privacidad.ts:512`), así que el dato no está oculto; lo que está mal enunciado
es **hacia dónde sale**: quien lee la cláusula del art. 35 concluye que lo que
escribe se queda dentro y solo sus fotos salen. Es el mismo defecto que la
auditoría 8 ya corrigió una vez en este mismo párrafo (nota en :584-589) —
describir el flujo real y no una versión más cómoda de él—. El filtro
`sanitizarProducto` no ayuda aquí: solo actúa sobre el campo `producto` del OCR,
nunca sobre el texto libre del chat.

**Causa raíz probable.** El párrafo se escribió cuando el único consumo de modelo
era el OCR de comprobantes, y el agente conversacional creció después sin volver
a tocarlo.

---

---

## M8 · [MEDIO] El correo de acceso metió una credencial de sesión en la cadena de Resend/AWS y el anexo de subencargados no lo dice

**Rubro:** Cumplimiento legal  
**Dónde:** `src/app/api/auth/correo/route.ts:182`


`src/app/api/auth/correo/route.ts:182` · `src/lib/correo/auth.ts:164-170` ·
`src/lib/correo/enviar.ts:97-122` · anexo incompleto en
`docs/conocimiento/52-anexo-subencargados.md:63`

**Escenario, con el dato nombrado.** El contralor teclea su correo en `/login`.
Supabase Auth dispara el Send Email Hook, la ruta arma la liga de verificación
—`/auth/v1/verify?token=<token_hash>&type=magiclink…` (`auth.ts:164-170`)— y la
manda con `enviarCorreo(destino, correo, { remitenteLocal: 'acceso' })`
(:182), es decir por `api.resend.com` y, según el DNS que el propio anexo
documenta, por Amazon SES. Lo que atraviesa esos dos terceros es la **dirección
de correo de una persona identificada más la llave de un solo uso que abre su
sesión**. El renglón 6 del anexo describe la salida como *"el correo de quien
recibe el aviso y el contenido del aviso (folios, número económico, conteos)"* —
la clase de dato que aquí viaja es de otro orden y no aparece.

**Consecuencia.** El titular es el usuario de la flota, de quien Likida sí es
responsable (`/privacidad`). El anexo es el documento con el que Likida acredita
su cadena de subencargados ante un contralor o ante la autoridad
(Regl. arts. 54-55); un anexo que omite la clase de dato más sensible que pasa
por un eslabón describe una cadena distinta de la real. `/privacidad:79` menciona
*"envío de correo para **los avisos del panel**"*, redacción que tampoco alcanza
al correo de acceso.

**Causa raíz probable.** El subsistema de correo se documentó cuando solo mandaba
avisos; el hook de Auth llegó el 18-ago y nadie volvió al anexo.

---

---

## M9 · [MEDIO] `costoPorViaje === null` se imprime como "$0.00" — el cero que el propio tipo prohíbe

**Rubro:** Frontend  
**Dónde:** `src/app/dashboard/kpi-periodo.tsx:67`


`src/app/dashboard/kpi-periodo.tsx:67`

`valor={valorActual ?? 0}`. El tipo dice literalmente por qué eso está mal
(`src/lib/likida/analytics.ts:58-61`): *"`null` sin viajes en el periodo — dividir
entre cero daría Infinity, y '$0/viaje' se leería como que salió gratis, no como
que no hay con qué medir."*

Escenario: semana de puente, la flota no despachó ningún viaje pero sí capturó
$41,200 de gastos de taller y casetas atrasadas. `getSerieComparativa` devuelve
`totalViajes: 0`, `costoPorViaje: null`. La tarjeta imprime **"Costo por viaje —
últimos 7 días · $0.00"** al lado de **"Gasto total — últimos 7 días · $41,200"**.
Dos cifras contiguas que se contradicen.

Consecuencia: el contralor lee "$0 por viaje" como una medición favorable. Es la
misma clase de cero de encuadre que `libro.tsx:309-311` documenta y evita ("el
hueco se escribe, no se rellena con $0.00") — la disciplina existe en el repo y
esta tarjeta no la sigue.

Causa raíz probable: `StatCard.valor` está tipado `number` sin admitir el hueco,
así que el llamador coalesce a 0 para compilar.

---

---

## M10 · [MEDIO] El mapa de tipos de diferencia del panel cubre 2 de los ~30 valores reales; uno de sus 3 renglones no existe

**Rubro:** Frontend  
**Dónde:** `src/app/dashboard/agentes/liquidacion/vista.tsx:13-18`


`src/app/dashboard/agentes/liquidacion/vista.tsx:13-18`

```ts
const TIPO_DIFERENCIA: Record<string, string> = {
  sobre_politica: 'Sobre política',
  duplicado: 'Duplicado',
  sin_comprobar: 'Sin comprobar',   // ← esta clave NO existe
};
```

`sin_comprobar` no aparece en ningún otro archivo de `src/` (el valor real de
`TipoDiferencia` es `sin_comprobante`, `src/types/likida.ts:64`), así que es un
renglón muerto. `getDineroObservadoPorTipo` (`analytics.ts:268-278`) no filtra
nada: **todos** los tipos que el motor escribe en `liquidacion.diferencias` llegan
a la dona.

Escenario: una flota con las diferencias que el motor emite de verdad. La tarjeta
"Dinero observado" de `/dashboard/agentes/liquidacion` pinta la leyenda con
`rotuloTipo` (`:18`, `t.replaceAll('_',' ')`) y el contralor lee, junto a montos
en pesos:

- `alimentacion transporte sin tarjeta credito · 4 — $9,180`
- `viatico excede fiscal · 12 — $14,400`
- `cfdi efos · 1 — $22,000`
- `Sobre política · 7 — $3,900`

Sin acentos, sin mayúscula, mezclado con dos renglones que sí están escritos en
español de oficina. Y `cfdi efos` es el veredicto más severo del motor (emisor en
la lista negra 69-B) apareciendo como jerga cruda.

Consecuencia: la pantalla que vende el diferenciador —"mira lo que el agente
atrapó"— se ve a medio construir en la proyección, y el término más grave no se
entiende. El repo ya tiene el patrón correcto para esto:
`src/lib/likida/normas/por_diferencia.ts:27,77` obliga a declarar **cada**
`TipoDiferencia` (con `Partial<Record<TipoDiferencia, …>>` y una lista `SIN_NORMA`
explícita "para que se vea que es una decisión y no un olvido"). Este mapa está
tipado `Record<string, string>`, así que TypeScript nunca lo va a avisar.

Causa raíz probable: el mapa se escribió con tres ejemplos cuando el motor emitía
tres tipos y quedó tipado contra `string` en vez de contra `TipoDiferencia`.

---

---

## M11 · [MEDIO] Las tres cifras de `liquidacion` aceptan negativos y no están amarradas entre sí

**Rubro:** Modelo de datos  
**Dónde:** `supabase/migrations/0025_dominios_check.sql:126-130`


`supabase/migrations/0025_dominios_check.sql:126-130` ·
`supabase/migrations/0070_montos_no_negativos.sql:40-44` ·
`src/lib/likida/analytics.ts:555-567,1349`

**Escenario, con valores.** La 0070 cerró `gasto.monto >= 0` y `viaje.anticipo >= 0` con el
argumento de que *"un comprobante negativo no suma de menos: RESTA del comprobado, así que
infla la diferencia dos veces su valor"*. Las tres columnas donde ese número aterriza
—`total_comprobado`, `total_anticipo`, `diferencia`— se quedaron con el único CHECK de
`NaN` de la 0025. Un `contador` de la flota A, vía PostgREST (misma policy `for all` del
hallazgo anterior):

```
PATCH /rest/v1/liquidacion?id=eq.<X>
{"total_comprobado":-5000,"diferencia":0}
```

Entra sin error. La fila queda con `total_anticipo = 6000`, `total_comprobado = -5000` y
`diferencia = 0`.

**El estado que queda.** El detalle de la liquidación (`analytics.ts:1321,1349`) imprime las
tres juntas y no restan. El gráfico "Total liquidado por semana"
(`analytics.ts:555-567`) suma `total_comprobado` de todas las liquidaciones y le baja
$5,000 a la semana. El PDF archivado —el que el contralor ya mandó a su contador— dice otra
cosa. Y el portón de reconstrucción de `analytics.ts:1453` compara justamente
`totalComprobado` contra lo persistido, así que se apaga el desglose de las tres cubetas
sin decir por qué.

**Consecuencia.** Dos cifras fiscales que se leen distinto en dos lugares sobre el mismo
viaje, que es la definición de "dos cálculos" que el producto se prohíbe a sí mismo.

**Causa raíz probable.** La 0070 se escribió mirando las entradas del cuadre (`gasto`,
`viaje`) y no las salidas (`liquidacion`), y la 0025 se autolimitó a `NaN` por el argumento
—correcto para `gasto`— de que un dato malo visible vale más que un dato ausente. Ese
argumento no aplica a una fila que produce el motor, no el OCR.

---

---

## M12 · [MEDIO] `gasto.ocr_confianza` no tiene rango 0–1, aunque su gemela `factura_proveedor.ocr_confianza` sí

**Rubro:** Modelo de datos  
**Dónde:** `supabase/migrations/0001_init.sql:63`


`supabase/migrations/0001_init.sql:63` · `supabase/migrations/0108_factura_proveedor_flujo.sql:40,52` ·
`src/lib/likida/intake/ocr.ts:63` · `src/lib/likida/cuadre/engine.ts:447,463`

**Escenario, con valores.** El tipo es `numeric(4,3)`: acepta de −9.999 a 9.999. El zod del
intake lo acota a [0,1] (`ocr.ts:63`), pero un `update gasto set ocr_confianza = 9.999
where id = '<G>'` desde la consola de Supabase o desde un script de reproceso entra sin
error.

**El estado que queda.** `engine.ts:463` evalúa `g.ocrConfianza < umbral` (umbral ~0.7):
con 9.999 la comparación es falsa y **no** se emite la diferencia `ocr_baja_confianza`, ni
la `folio_verificar` de `engine.ts:447` para el ticket de diésel. Un comprobante que el
modelo leyó mal deja de estar marcado como "conviene revisarlo a mano", y como
`ocr_baja_confianza` está en la lista `REVISAR` (`engine.ts:1135`), el viaje sale
`cuadrada` en vez de `revisar`.

**Consecuencia.** El contralor no recibe la única señal que le dice qué comprobante mirar
con lupa antes de facturarlo en el portal de la gasolinera.

**Causa raíz probable.** El rango se validó en el borde de entrada (zod) cuando el único
escritor era el intake; la 0108 sí lo puso en la base para `factura_proveedor` y nadie
volvió sobre la columna original.

---

---

## M13 · [MEDIO] `prospecto.duplicado_de` admite un ciclo A→B→A, que esconde las dos filas — y el bloque que lo verifica lo nombra sin probarlo

**Rubro:** Modelo de datos  
**Dónde:** `supabase/migrations/0139_prospecto_calidad.sql:55,68-72,84`


`supabase/migrations/0139_prospecto_calidad.sql:55,68-72,84` ·
`supabase/verificaciones.sql:5380-5414`

**Escenario, con valores.** La 0139 solo prohíbe la autorreferencia:
`check (duplicado_de is null or duplicado_de <> id)`. El deduplicador que va a escribir esta
columna encuentra «AUTO EXPRESS PERLA» y «AUTOEXPRESS PERLA» y no tiene forma de saber cuál
es la buena:

```sql
update prospecto set duplicado_de = '<B>' where id = '<A>';
update prospecto set duplicado_de = '<A>' where id = '<B>';
```

Las dos pasan el CHECK y las dos pasan la FK.

**El estado que queda.** `idx_prospecto_vivos … where duplicado_de is null` (0139:84) es el
filtro por defecto del tablero, y ninguna de las dos filas lo cumple. La empresa desaparece
del censo completo, con sus toques y sus notas dentro. Lo mismo con una cadena A→B→C: el
puntero de A nombra una fila que a su vez está escondida.

**Consecuencia.** En una empresa pre-revenue cuyo único pipeline es un censo de 33,070
filas, un prospecto marcado dos veces sale del universo de venta sin dejar rastro visible.
El bloque 110 de `verificaciones.sql:5382-5383` escribe la frase *"un ciclo A→B→A escondería
las dos"* y luego solo prueba (a) la autorreferencia y (b) el id inexistente — el ciclo
queda nombrado y sin cubrir.

**Causa raíz probable.** El CHECK se derivó del daño obvio (profundidad 0) en vez de del
invariante real, que es "la fila a la que apunto tiene que ser visible".

---

---

## M14 · [MEDIO] El `codigo` estable de la causa nunca llegó al camino del dinero

**Rubro:** Operabilidad y DX  
**Dónde:** `src/lib/observability/sentry.ts:238-276`


`src/lib/observability/sentry.ts:238-276` · `src/lib/likida/processor.ts:2494` y `:2531` ·
`src/app/api/webhook/whatsapp/route.ts:258` y `:263`

`codigoDeError()` se escribió con esta justificación literal: «Los catch de los
cron emitían solo `{error}`, y el mensaje NO entra al fingerprint: dos causas
distintas caían en el mismo issue viejo de Sentry, que ya no notifica». Se
aplicó en **los cinco archivos de `api/cron/`** y en ninguno más
(`grep -rn codigoDeError src/` → 10 usos, todos en `api/cron/*`).

**Escenario, 3 a.m.** Flota A, viaje cerrado. `sendDocument` es rechazado por
Meta con `codigo: 131047` y `processor.ts:2494` sí emite `codigo` — bien. Un mes
antes, la misma flota tuvo un fallo del **otro** `pdf.no_entregado`, el de
:2531, que emite `{tenant, viaje, pdfGenerado, err}` **sin `codigo`**. Los dos
producen fingerprint `['pdf.no_entregado','error','id:9f2c1a4b77de']` salvo por
ese campo: cualquier segunda causa distinta que caiga en el `catch` de :2531
—`storage no devolvió URL firmada` hoy, un `TypeError` de `pdf-lib` mañana— cae
en el issue viejo y **no genera notificación**. Lo mismo en el webhook:
`logger.error('processInbound', { id: f.id, err })` (route.ts:258) no lleva
`tenant`, `viaje` ni `codigo` → fingerprint `['processInbound','error']`: **un
solo issue para todos los fallos de procesamiento de todas las flotas, para
siempre**.

**Consecuencia:** el mecanismo que convierte "la flota B también falla" y "ahora
falla por otra causa" en una notificación existe y está apagado justo en las
tres líneas que reportan que una liquidación real no llegó.

---

---

## M15 · [MEDIO] `cron/runner` es el único cron sin correo y sin código de causa

**Rubro:** Operabilidad y DX  
**Dónde:** `src/app/api/cron/runner/route.ts:37-43`


`src/app/api/cron/runner/route.ts:37-43`

Corre cada 4 h (`vercel.json`), gasta dinero de modelo y fabrica piezas hacia la
bandeja de aprobaciones. Su `catch` emite
`logger.error('cron.runner.fallo', { err })` — sin `codigoDeError`, sin
`alertarOperador`. Los otros cuatro crons tienen las dos cosas.

**Escenario, 3 a.m.** El runner falla a las 00:00, 04:00, 08:00… Vercel pinta la
corrida roja (el 500 sí está bien puesto) y Sentry crea **un** issue
`['cron.runner.fallo','error']` que notifica la primera vez. Seis fallos al día
durante una semana = 42 eventos, una notificación, cero correos. Nadie mira el
panel de Crons de Vercel a diario.

**Consecuencia:** el orquestador de agentes autónomos puede estar muerto días sin
que el único canal push del sistema diga una palabra.

---

---

## M16 · [MEDIO] `npm install` depende de un host fuera del registry: no se puede instalar ni desplegar un hotfix

**Rubro:** Operabilidad y DX  
**Dónde:** `package.json:45`


`package.json:45` · `package-lock.json:11305-11308`

```json
"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
```

Verificado en esta corrida: `curl -I https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
→ `CONNECT tunnel failed, response 403`. El lockfile fija ese mismo `resolved`,
así que **`npm ci` no tiene camino alterno**: no hay `.npmrc` con mirror ni
registry alternativo en el repo.

**Escenario, 3 a.m.** Hay que publicar un arreglo. `ci.yml:47` (`npm ci`) y el
`npm install` que Vercel corre antes de `next build` pegan los dos a
`cdn.sheetjs.com`. Si ese host está caído, bloqueado por la política de red del
runner, o simplemente retira la versión 0.20.3 (no hay retención garantizada
fuera del registry), **CI se pone rojo y el deploy falla** por una dependencia
que solo usan tres archivos
(`src/app/dashboard/viajes/page.tsx:2`, `intake/desglose_peaje.ts:35`,
`intake/archivo.test.ts:2`), ninguno del camino del dinero. El mensaje de fallo
es un 403 de red, no algo que se pueda arreglar con código.

**Consecuencia:** un tercero ajeno al registry de npm tiene voto sobre si Likida
puede desplegar. Y, del lado DX, `npm run setup` (=
`npm install && npm run seed`) **no deja el proyecto corriendo en una máquina
limpia**: si el `install` sobrevive, `seed.sh:11-15` sale con código 1 sin
`DATABASE_URL`, y no hay paso que genere `.env.local`. (El script `setup` está
en `package.json:15`.)

---

---

## M17 · [MEDIO] El diagnóstico de configuración está apagado justo donde vive el desarrollador

**Rubro:** Operabilidad y DX  
**Dónde:** `src/lib/observability/arranque.ts:65-66`


`src/lib/observability/arranque.ts:65-66` · `src/lib/observability/sentry.ts:70-71` ·
`src/lib/env.ts:49-56`

`avisarConfiguracionSilenciosa()` y `avisarObservabilidad()` arrancan con
`if (!desplegado) return;`. `desplegado` es `VERCEL_ENV || NODE_ENV==='production'`,
así que en `npm run dev` **nada de esto se emite**, incluido
`avisarGruposDeConfiguracion()` — la única impresión de `faltantes()`, o sea el
inventario de las variables cuya ausencia **sí rompe**.

**Escenario, día 1 de alguien nuevo.** Sigue README.md:82-85 (`npm install`,
`cp .env.example .env.local`, `npm run dev`). El `.env.example` copiado tiene
todas las llaves **vacías**. El servidor levanta sin decir una palabra; al abrir
`/dashboard` recibe el error del SDK de Supabase (`supabaseAdmin()` lanza) o un
`createServerClient` reventando dentro de `proxy.ts`. La lista exacta de lo que
falta —`{"supabase":["NEXT_PUBLIC_SUPABASE_URL",…]}`— existe, está probada
(`arranque.test.ts:112`) y se calla precisamente en el entorno donde nadie tiene
un panel de logs que consultar.

**Consecuencia:** el arranque en local no ayuda a arrancar en local. La razón
escrita («en local estas ausencias son normales y el aviso diario acabaría siendo
ruido») aplica al bloque `SILENCIOSAS`, no al de grupos duros, que se arrastró
detrás del mismo `return`.

---

---

## M18 · [MEDIO] `/api/health` no tiene consumidor, y el campo que detecta la deriva de despliegue no se compara contra nada

**Rubro:** Operabilidad y DX  
**Dónde:** `src/app/api/health/route.ts:10-32`


`src/app/api/health/route.ts:10-32` · `vercel.json` · `.github/workflows/` · `docs/conocimiento/DEPLOY.md`

La ruta se creó (auditoría 4) declarando su propósito: «Un UptimeRobot (o el cron
de un tercero) pegándole a esto cada minuto convierte ese modo de falla en una
alerta de minutos». Dos rondas después: `grep -rn "api/health"` sobre todo el
repo devuelve **solo la ruta y su propia prueba**. No aparece en `vercel.json`,
ni en ningún workflow, ni una sola vez en DEPLOY.md — el documento de las 3 a.m.
no sabe que existe.

Devuelve `version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,7)` con una
justificación explícita: «es lo que confirma que el último push con `[deploy]`
de verdad llegó, contra el modo de falla silencioso del `ignoreCommand`». Nadie
lo compara. El único procedimiento contra la deriva es humano y voluntario
(DEPLOY.md:177-180: `git log -1` a ojo contra `vercel inspect`).

**Escenario, víspera del demo.** Se corrigen tres cosas, se pushean sin la
bandera `[deploy]` en el **asunto**. GitHub verde, CI verde, `/api/health`
devolvería `version: "553bee7"` cuando `master` va en otro sha — pero nadie
pregunta. El demo corre sobre el build de hace cuatro días y el síntoma es
"pero si eso ya lo arreglé".

**Consecuencia:** el detector de la única deriva silenciosa que el propio repo
documenta como su modo de falla más caro existe, funciona y no está conectado a
nada.

---

---

## M19 · [MEDIO] El área de la llave de API está declarada en prosa y no atada al código de la ruta

**Rubro:** Pruebas  
**Dónde:** `src/app/api/v1/viajes/[id]/contribucion/route.ts:73`


`src/app/api/v1/viajes/[id]/contribucion/route.ts:73` (0.0% de **108** líneas) ·
`src/app/api/v1/openapi/route.ts:343` y `:584`.

**Escenario (M6, corrido).** Cambié `abrir(req, 'dinero')` por
`abrir(req, 'operacion')` y la suite quedó **verde (388/388)**. Con eso, una
llave `lk_live_…` de área `operacion` —la que se le entrega a un TMS o al
tablero del jefe de tráfico— lee `ingreso`, `comprobado`, `contribucion` y
`margenPct` de cada viaje. El OpenAPI que esa misma integración descarga sigue
prometiendo lo contrario, palabra por palabra: "una llave de operación no puede
leer el margen de la flota" (`openapi/route.ts:343`) y "Área `dinero`"
(`:584`). `openapi/route.test.ts:104` sí verifica que cada método HTTP exportado
esté documentado — la existencia de la ruta— pero nada compara el **área que el
spec declara** contra el argumento real de `abrir()`.

Refutación intentada: `_comun.ts` (el que implementa `abrir`) está al 95.2% y su
lógica de áreas sí se prueba. Eso confirma que el mecanismo funciona; no que
esta ruta le pase el argumento correcto. Ninguna de las cinco rutas de datos de
`/v1` tiene archivo de prueba propio (`clientes` y `viajes/[id]` también están
en 0.0%).

**Consecuencia.** El contrato público es el artefacto que el integrador lee y
sobre el que su abogado y el de la flota deciden qué llave entregar. Hoy puede
divergir del código sin que nada avise, y el que diverge en silencio siempre es
el código.

**Causa raíz probable.** El área se escribe dos veces —en el `abrir()` y en la
`description` del spec— y no hay ninguna prueba que las una, aunque el repo ya
tiene la técnica hecha para exactamente esto (`ruta_pdf_sincronizada.test.ts`,
`etiquetas_sincronizadas.test.ts`).

---

---

## M20 · [MEDIO] El lado del ingreso entero —Rentabilidad, Cartera, Cobranza— tiene 3 de 229 líneas ejecutadas

**Rubro:** Pruebas  
**Dónde:** `src/lib/likida/comercial.ts`


`src/lib/likida/comercial.ts` (**1.3%** de 229 líneas). El único `import` desde
una prueba es de **tipo**: `facturacion_clientes.test.ts:2` importa
`type FacturaRow`. Cero assertions sobre su comportamiento.

**Escenario.** `getRentabilidad` (`:133-163`) alimenta `/dashboard/rentabilidad`,
que es área `dinero` y de las pocas pantallas que le enseñan margen al dueño.
Invertir `contribucion: round2(ingreso - costoComprobado)` a
`round2(costoComprobado - ingreso)` no rompe nada: con **$500,000** de ingreso
capturado y **$380,000** comprobados, la pantalla imprimiría **−$120,000** de
contribución en vez de **+$120,000** —un margen de −24% donde hay uno de +24%—
y las 5,045 pruebas siguen verdes. Lo mismo con el guardia de división entre
cero: `margenPct: ingreso > 0 ? … : null` → `ingreso >= 0` devuelve
`Infinity`/`NaN` para una flota que aún no captura ingresos, que es
**exactamente el estado de toda flota nueva** (`viaje.ingreso_flete` se llena a
mano). El archivo abre declarando la regla del producto —"una cifra o es un
conteo real de la base, o NO SE MUESTRA"— y no hay una sola prueba que la
obligue.

**Consecuencia.** Es un módulo puro salvo por las dos consultas: el reparto
`conIngreso/sinIngreso`, el `round2` y el `null` del margen se prueban sin base
ni mock, igual que se probó `evaluarAbono`. Que esté al 1.3% no es una
limitación técnica, es una ausencia.

**Causa raíz probable.** Nació el 14-ago junto con las pantallas que lo consumen
y se dio por verificado "mirando el render" — que es la regla correcta para la
vista y no sustituye al arnés del cálculo.

---

## M21 · [MEDIO] El único camino de LLM sin techo de salida es el del modelo caro

**Rubro:** Rendimiento y costo  
**Dónde:** `src/lib/agents/run.ts:49-57`


`src/lib/agents/run.ts:49-57` · `src/lib/llm/openrouter.ts:50,646` ·
`src/lib/llm/models.ts:53,144`

`runAgent` no pasa `maxTokens` ni `maxToolRounds`, así que el ciclo del cuadre
cae a `DEFAULT_MAX_TOKENS = 4000` y a `maxRounds = 6`. El rol `cuadre` es
`anthropic/claude-sonnet-5` con `reasoning: 'high'`, o sea $10 por millón de
salida (y $15 desde el 1-sep-2026, cuando venza el intro). **Todos** los demás
agentes del repo sí lo acotan a 900: `analista.ts:326,368`, `copiloto.ts:207,237`,
`redactor.ts:181`.

**Escenario:** un cuadre de 6 rondas con el techo lleno son 6 × 4,000 = 24,000
tokens de salida × $10/M = **$0.24 por liquidación en salida sola**, contra una
banda documentada de **$0.03–0.05 por liquidación completa** (`models.ts:17`,
repetida en `docs/escala-15k.md:227` y usada ahí para proyectar $360-600/mes a
12,000 liquidaciones). Del lado de la entrada, la medición del propio repo
(`openrouter.ts:672-676`) dice que una liquidación de 21 comprobantes reenvía
~72,000 tokens en 8 vueltas: a $2/M son **$0.144 más**, y la caché de prompt solo
cubre el bloque `system` (`openrouter.ts:689-693`) — lo que crece es la
conversación, que no se marca.

**Consecuencia:** el negocio va a cobrar por liquidación y la única cifra que
tiene para fijar precio es una banda de julio que su propio código puede exceder
un orden de magnitud en el caso que más importa (el fajo grande, que es el
cliente que más valor recibe). `docs/escala-15k.md:239` ya lo dice con todas sus
letras — *"los tokens del cuadre no están registrados"*—; lo que este hallazgo
añade es que el techo tampoco existe.

**Causa raíz probable:** `run.ts` se escribió antes que los tres agentes que sí
acotan, y ninguno de ellos volvió a pasar por él.

---

---

## M22 · [MEDIO] La bandeja durable inserta N veces en serie antes de contestarle a Meta

**Rubro:** Rendimiento y costo  
**Dónde:** `src/lib/likida/wa_pendientes.ts:43-65`


`src/lib/likida/wa_pendientes.ts:43-65` · `src/app/api/webhook/whatsapp/route.ts:182-196`

`guardarEventosPendientes` recorre los mensajes con un `for` y hace un
`insert` por vuelta, secuencial, sin `acotada`. Corre en la ruta **síncrona**,
antes del código de salida — es la premisa del diseño ("receive → PERSIST → 2xx
→ worker", `route.ts:166-180`) y por eso no se puede mover al `after()`.

**Escenario:** el fajo de 22 fotos llega en un POST. Son 22 viajes de red en
serie: **6.6s** con el costo unitario del repo (0.3s) antes de que Meta reciba
su 200. Si uno se cuelga, no hay techo: la respuesta se retrasa hasta que Vercel
mate la invocación a los 120s, y Meta reentrega el payload completo — que
vuelve a ejecutar los 22 inserts (dedupeados por PK, `:52`, pero pagados igual
en tiempo).

**Consecuencia:** el acuse a Meta escala linealmente con el tamaño del fajo justo
en el caso que el producto promete atender. No se pierde nada —la reentrega es
el diseño— pero el POST es O(N) sin cota, y ese N lo elige el chofer.

**Causa raíz probable:** un `insert` por fila para poder devolver
`filas[i].guardado` individualmente; un insert por lote con `select` de los
insertados daría lo mismo en un viaje.

---

---

## M23 · [MEDIO] El copiloto concede 40s al modelo y necesita 21.3s más de los que tiene

**Rubro:** Rendimiento y costo  
**Dónde:** `src/app/api/admin/copiloto/route.ts:47,189,201`


`src/app/api/admin/copiloto/route.ts:47,189,201` · `src/lib/agents/copiloto.ts:197`
· `src/lib/agents/copiloto-historial.ts:107,118,128` ·
`src/lib/agents/copiloto-intents.ts:117`

Ver la cadena 4 arriba: 81.3s de techos contra `maxDuration = 60`. El
`AbortController` de 40s (`copiloto.ts:197`) es el único tope de todo el POST y
no cubre nada de lo que va después: las tools de la ronda en vuelo (que no leen
`ctx.signal`, documentado en `tool-executor.ts:28-49`), `crearIntent` (sin
`acotada`) ni las **tres escrituras en serie** del historial.

**Escenario:** Javier pregunta "¿cómo va el negocio?". El modelo tarda 38s (dentro
de su tope). `guardarIntercambioCopiloto` hace tres consultas y una pega su techo
de 9.5s: 0.6 + 2.4 + 38 + 0.3 + 0.3 + 0.3 + 9.5 = 51.4s… con dos lentas, 60.9s.
Vercel corta el stream **antes** de `manda({t:'fin'})` (`route.ts:214`).

**Consecuencia:** la interfaz se queda pintando el último `t:'paso'` para
siempre, sin evento de error, y el turno ya se cobró (el `logger.info
('copiloto.costo')` de `:192` sí alcanzó a escribirse). El comentario de
`:196-197` —*"Si falla, la respuesta IGUAL sale — el historial es una
comodidad"*— es cierto para un `throw` y falso para un cuelgue: el `manda` está
después del `await`.

**Causa raíz probable:** el `try/catch` alrededor del historial protege contra el
error y no contra la latencia, y el único reloj del endpoint vive dentro del
motor en vez de en el borde.

---

---

## M24 · [MEDIO] `/login` sigue siendo un oráculo de enumeración: la respuesta idéntica solo cubre una rama de error

**Rubro:** Seguridad  
**Dónde:** `src/app/login/page.tsx:89-95`


`src/app/login/page.tsx:89-95` (`esCorreoSinCuenta`) y `:148-153` (la rama que
decide qué se pinta) · la prueba que cree cerrarlo:
`src/app/login/no_autoregistro.test.ts:35-40`.

**Escenario.** Dos peticiones al mismo `/login`, con el mismo correo, dentro de
60 segundos:

```
POST /login          (server action `entrarConEmail`)
Content-Type: multipart/form-data
email=contralor@transportesx.com&next=/dashboard
```

- **Correo CON cuenta.** La primera llamada a `signInWithOtp` devuelve 200 y se
  redirige a `?enviado=1` → pantalla "Te mandamos un enlace a tu correo". La
  segunda cae en el mínimo de frecuencia por dirección de GoTrue y vuelve con
  `over_email_send_rate_limit` (429, "you can only request this after N
  seconds"). Ese código **no** cumple `esCorreoSinCuenta` —que solo acepta
  `otp_disabled`, `signup_disabled` o `/signups not allowed/i`— así que
  `:149` ejecuta `redirect('/login?...&error=1')` → pantalla **"Algo falló.
  Intenta otra vez."**
- **Correo SIN cuenta.** Con `shouldCreateUser:false` (`:140`), GoTrue corta
  antes de siquiera intentar el envío y devuelve 422 `otp_disabled` las dos
  veces → `?enviado=1` las dos veces.

Dos peticiones distinguen las dos poblaciones sin ambigüedad. El límite propio
(`dentroDelLimite`, `:74-78`) es de 10 intentos / 5 min **por IP y nada más** —
no por correo—, así que una IP prueba 5 direcciones cada 5 minutos, y cambiar de
IP reinicia el contador porque la llave es `login:email:${ip}`.

**Consecuencia.** Cualquiera con una lista de correos de directivos de flotas
mexicanas averigua cuáles son cuentas de Likida. Eso es la lista de objetivos
para un phishing que imita exactamente la plantilla de `correo/plantilla.ts` —
y el propio `auth.ts:188` declara que la línea "si no fuiste tú" es "la única
defensa real contra el phishing que imita esta misma plantilla". Cuando haya
clientes, además revela quién es cliente de quién.

**Refutación que intenté y no aguantó.** Busqué una segunda capa: no la hay.
El `error=1` es el mismo texto para todo, sí, pero **la existencia misma del
error** es la señal; y `no_autoregistro.test.ts` solo comprueba que las cadenas
`esCorreoSinCuenta` y `otp_disabled` aparezcan en el fuente — pasaría verde con
este hueco intacto.

**Causa raíz probable.** El anti-oráculo se escribió enumerando el caso "no
existe" en vez de invertir la regla: solo un conjunto cerrado de fallos
*nuestros* debería salir como error, y todo lo demás debería verse como
"enviado".

---

---

## M25 · [MEDIO] El bucket público `avatares` acepta cualquier archivo, de cualquier `authenticated`, saltándose los candados de tipo y peso

**Rubro:** Seguridad  
**Dónde:** `supabase/migrations/0046_perfil_avatar.sql:17-19`


`supabase/migrations/0046_perfil_avatar.sql:17-19` (bucket `public = true`, sin
`file_size_limit` ni `allowed_mime_types`) y `:27-30` (la política de insert) ·
los candados que se saltan: `src/app/dashboard/mi-perfil/page.tsx:25-26,103-104`
y `src/app/admin/mi-perfil/page.tsx:23-24,65-67`.

**Escenario.** Un usuario del panel toma su propio access token (la cookie de
`@supabase/ssr` no es httpOnly: el cliente del navegador la necesita) y la
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, que viaja en el bundle, y sube directo al
Storage sin pasar por el server action:

```
POST https://<proyecto>.supabase.co/storage/v1/object/avatares/<su-auth-uid>/x.html
apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>
Authorization: Bearer <su access token>
Content-Type: text/html

<html>… la página que quiera, del tamaño que quiera hasta el default global …</html>
```

La política `avatares_propio_insert` solo exige `bucket_id = 'avatares'` y que
la primera carpeta sea su `auth.uid()`. No mira mime ni tamaño — esos dos
controles viven **solo** en los server actions (`TIPOS`, `TOPE_BYTES`), que esta
petición no toca. El objeto queda legible sin sesión por
`avatares_lectura_publica` (`:42-44`) más `public = true`, servido con el
`Content-Type` que el atacante declaró.

**El amplificador de quién es `authenticated`.** `/login` bloquea el
autorregistro por correo (`shouldCreateUser:false`, `page.tsx:140`) pero el
botón de Google (`entrarConGoogle`, `:105-119`) no tiene equivalente:
`signInWithOAuth` no acepta ese parámetro y no hay lista de dominios permitidos
en el código. Quien complete ese consentimiento obtiene un `auth.users` y un JWT
con rol `authenticated` sin fila en `app_user` — no entra al panel (`session.ts`
lo deja en `SIN_ROL` y `guard.ts:63` lo manda a `/sin-acceso`), pero **sí**
satisface esta política. Cuánto de esto es alcanzable hoy depende de que el
proveedor Google esté encendido en el proyecto de Supabase, y eso no se puede
verificar desde el repo; lo que sí se verifica desde el repo es que del lado de
Likida no hay ninguna puerta en ese camino.

**Consecuencia.** Contenido arbitrario alojado públicamente en el dominio de
Supabase de Likida (una página de phishing cuya URL contiene el proyecto de la
empresa, mandada por WhatsApp a un operador), más almacenamiento sin cuota. El
comentario de `admin/mi-perfil/page.tsx:14-22` documenta que el `.svg` se
prohíbe *porque el bucket es público* — la prohibición se salta en una petición.

**Refutación que intenté.** Miré si la CSP salva algo: `proxy.ts:70-82` deja
`img-src https://*.supabase.co` pero `script-src 'self'`, así que esto **no** es
XSS dentro de `app.likida.ai`. Por eso es MEDIO y no ALTO.

**Causa raíz probable.** La validación de subida se escribió en la capa de
aplicación asumiendo que la aplicación es el único escritor; la política RLS,
que es el único control del camino directo, se pensó solo para el aislamiento
por carpeta.

---

---

## M26 · [MEDIO] El jefe recibe el ejemplar del OPERADOR, no el del contralor

**Rubro:** Sistema agéntico  
**Dónde:** `src/lib/likida/processor.ts:2458`

`src/lib/likida/processor.ts:2458` y `:2523`

La URL firmada se arma sobre `${op.tenantId}/${viajeId}-operador.pdf` —el ejemplar
filtrado, correcto para el chofer— y **esa misma URL** se le pasa a
`avisarCierreAlJefe`. El ejemplar completo existe y está subido en
`${tenantId}/${viajeId}.pdf` (`tools.ts:316`), pero nadie se lo manda.

`pdf.ts:452` filtra por destinatario con la lista `SOLO_CONTRALOR`
(`cuadre/resumen.ts:24-33`).

**Escenario:** el viaje cierra con una diferencia `cfdi_efos` (el proveedor de
diésel apareció en la lista 69-B) y una `rfc_receptor`. El aviso de texto al jefe
SÍ las enumera (`RUTA_DE_DIFERENCIA` las marca `'decision'`). El PDF que le llega
adjunto NO las trae: son `SOLO_CONTRALOR`. El jefe archiva ese PDF y se lo pasa a
su contador —que es literalmente lo que el encabezado de `avisar_cierre.ts:14-19`
dice que va a hacer— y el contador trabaja sobre un documento del que se quitaron
los dos veredictos que le tocan resolver.

**Consecuencia:** dos documentos del mismo cierre con distinto contenido, y el que
se archiva es el incompleto. El del panel (`liquidacion.pdf_path`) sí es el bueno,
así que la contradicción solo aparece cuando alguien cruza los dos — que es
exactamente lo que hace un contador.

**Causa raíz probable:** reuso de la variable `data.signedUrl` que ya estaba en
scope, en un bloque cuyo comentario («El ejemplar del OPERADOR, no el completo»)
se refiere al envío de arriba y se lee como si aplicara a los dos.

---

---

## M27 · [MEDIO] Si el PDF del operador no se generó, el jefe no se entera del cierre en absoluto

**Rubro:** Sistema agéntico  
**Dónde:** `src/lib/likida/processor.ts:2455-2540`

`src/lib/likida/processor.ts:2455-2540`

`avisarCierreAlJefe` vive DENTRO del `try` que empieza con
`if (!pdfGenerado) throw new Error('la tool reportó pdf_generado=false')`
(línea 2456). El aviso de TEXTO al jefe no depende del PDF para nada —
`armarAvisoJefe` solo necesita la fila de `liquidacion`— pero está anidado bajo él.

**Escenario:** `subir()` del ejemplar del operador falla (`tools.ts:300`,
`logger.warn('pdf.upload')`, devuelve `undefined`), así que la tool responde
`pdf_generado: false`. El `throw` de la línea 2456 salta al `catch` de 2528: se
registra `pdf.no_entregado`, al chofer se le dice la verdad («pídeselo a tu
contralor»)… y `avisarCierreAlJefe` nunca corre. Una liquidación con
`sin_comprobante` por $8,000 cierra y el único humano que puede decidir sobre ella
no recibe ni el texto ni el PDF: su única vía es entrar al panel, que es
precisamente lo que el encabezado de `avisar_cierre.ts:14-19` existe para evitar
(«si para tener el PDF hubiera que entrar a una pantalla, la mitad de las veces
nadie entra»).

**Consecuencia:** el fallo del papel del chofer se lleva por delante la
notificación de decisión del jefe. Queda el log, no queda el aviso.

**Causa raíz probable:** anidamiento — el bloque del jefe se agregó dentro del
`try` del PDF porque ahí estaba la URL, no porque compartan condición.

---

---

## M28 · [MEDIO] El costo de la primera vuelta desaparece si el reintento correctivo truena

**Rubro:** Tool calling  
**Dónde:** `src/lib/agents/analista.ts:356-381`


`src/lib/agents/analista.ts:356-381` · `src/lib/agents/copiloto.ts:225-246` · `src/app/api/dashboard/chat/route.ts:120-133` · `src/app/api/dashboard/chat/tope.ts:31-40`

**Escenario (con valores).** Turno del chat del panel: la primera llamada a
`generateWithTools` **resuelve** con `res.cost = 0.014` USD (5 completions de
flash-lite, ~40,000 in / 900 out a $0.30/$2.50 por M). La guardia de cifras la
tumba (`cifrasRespaldadas` falso), se dispara el reintento correctivo
(`analista.ts:353-356`) y ese segundo ciclo pega el loop-guard del hallazgo
anterior → `PartialExecutionError` con `tokensIn/tokensOut/cost` **solo de la
segunda llamada** ($0.011).

El `catch` del route (`chat/route.ts:126-131`) registra una fila `modelo:'parcial'`
con esos $0.011. Los $0.014 de la primera vuelta —que ya salieron de la cuenta de
OpenRouter— no se escriben en `llm_costo` **nunca**: `res.costoPorModelo` solo se
lee en el `return` feliz (`analista.ts:412`), que esa ejecución no alcanza.

**Consecuencia.** `gastoChatHoyUsd` (`tope.ts:31-40`) es el único freno de gasto
del chat del cliente ($1/día por tenant). Subcuenta **más de la mitad** justo en el
modo de falla que más consume, que es exactamente el agujero que la auditoría 3
(TC-A1) cerró para *un* ciclo y que el segundo ciclo reabrió. Un tenant en bucle
gasta el doble de su tope antes de que el freno lo vea.

**Causa raíz probable.** El acumulador de costo del reintento (`res.cost += res2.cost`,
`analista.ts:381`) vive en el camino feliz; la vía de excepción del segundo ciclo
solo transporta lo de ese ciclo.

---

---

## M29 · [MEDIO] El copiloto de admin no contabiliza NADA cuando el turno truena

**Rubro:** Tool calling  
**Dónde:** `src/app/api/admin/copiloto/route.ts:192-195`


`src/app/api/admin/copiloto/route.ts:192-195` (registro) vs. `:215-217` (catch) · comparar con `src/app/api/dashboard/chat/route.ts:120-133`

**Escenario (con valores).** El copiloto **no escribe en `llm_costo` a propósito**
(la tabla exige `tenant_id` y este gasto es de Likida, no de una flota — decisión
anotada en `route.ts:24-28`). Su único medidor es
`logger.info('copiloto.costo', {costoUsd, tokensIn, tokensOut, modelo, tools})`, y
esa línea está **dentro del `try`, después** de `ejecutarCopiloto`. El `catch`
(`:215-217`) solo emite `copiloto.fallo` con el mensaje del error.

Javier pregunta tres veces seguidas *"¿cómo va el negocio, qué espera decisión y
qué han hecho mis agentes?"*; el modelo encadena lecturas en serie y los tres
turnos pegan el loop-guard (o el `AbortController` de 40 s de `copiloto.ts:197`).
Resultado: 3 × (5 + 4) = hasta 27 completions de `gpt-5.6-luna` ($0.10/$0.60 por M)
≈ $0.05, y **cero** líneas `copiloto.costo`. El freno diario tampoco lo ve: cuenta
TURNOS (300/día, `route.ts:72-75`), no dólares, y el rate-limit se consume al
entrar.

**Consecuencia.** El gasto propio de Likida en IA de dirección queda medido solo en
los turnos baratos y ciego en los caros; el promedio que se lea del log está
sesgado hacia abajo por construcción. El patrón correcto ya existe doce archivos
más allá (`chat/route.ts`) y no se copió.

**Causa raíz probable.** La contabilidad se colgó del valor de retorno en lugar de
colgarse del error, que es donde el `PartialExecutionError` la lleva desde la
auditoría 3.

---

---

## M30 · [MEDIO] `correr_runner`: la previsualización enseña un objetivo que el ejecutor tira

**Rubro:** Tool calling  
**Dónde:** `src/lib/agents/copiloto-acciones.ts:129-149`


`src/lib/agents/copiloto-acciones.ts:129-149` (rama), `:135` (`await correrRunner()`) · `src/lib/agents/copiloto.ts:52-93` (`proponer_accion`) · `src/app/admin/copiloto.tsx:270`

**Escenario (con valores).** El modelo aprende que la acción existe leyendo el
resultado de `estado_runner` (`copiloto-tools.ts:393`: *"se puede adelantar con la
accion correr_runner (confirmada)"*). Javier escribe *"corre el redactor ahora"*.
El modelo llama `proponer_accion` con `{accion:'correr_runner', objetivo:'redactor',
motivo:'…'}` — `objetivo` es un `type:'string'` libre que **llena el modelo**
(`copiloto.ts:62`). La tarjeta pinta literalmente:

> Voy a **ejecutar** `redactor`

(`copiloto.tsx:270`). Javier escribe el motivo y confirma. El servidor gasta el
intent y llama `ejecutarAccionCopiloto('correr_runner', {id:'redactor', motivo}, userId)`
→ la rama de `copiloto-acciones.ts:129-149` **jamás mira `params.id`**: llama
`correrRunner()`, que no recibe argumentos y despacha **todos** los agentes con
`estado='vivo' AND runner_habilitado AND disparador='cron'`
(`runner.ts:117-130`), cada uno hasta su `presupuesto_dia_usd`.

**Consecuencia.** Javier autorizó una corrida y obtuvo N. Gasta modelo por cada
agente habilitado y llena Aprobaciones con piezas que no pidió; la corrida que
corrió, corrió (lo dice el propio catálogo: `revertir`). Y rompe la regla número
dos del repo —*un rótulo tiene que ser verdad*— en la única pantalla donde una
acción real se confirma. El texto de `efecto` sí describe el barrido completo, así
que el titular y el cuerpo de la misma tarjeta se contradicen.

**Causa raíz probable.** El catálogo declara un `objetivo` obligatorio para todas
las acciones (contrato uniforme de `proponer_accion`) y `correr_runner` es la
primera acción implementada que no tiene objetivo; nadie cerró el hueco ni en el
schema ni en el ejecutor.

---

---

# BAJO


## B1 · [BAJO] El PDF de dinero depende del subsistema de correo

**Rubro:** Arquitectura  
**Dónde:** `src/lib/likida/liquidacion/pdf.ts:19`


`src/lib/likida/liquidacion/pdf.ts:19` y `src/lib/likida/informes/pdf.ts:16`
importan `LOGO_PNG_BASE64` de `@/lib/correo/logo` (`src/lib/correo/logo.ts:10`).
El import se introdujo el **17-ago-2026** (`f5bdb3a`), dentro de esta ronda; el
módulo `correo/` es de la ronda también (16-ago).

La dependencia apunta al revés: el papel que el contralor le manda a su contador
—el artefacto más viejo y más crítico del producto— cuelga de un módulo cuya razón
de existir es un problema de clientes de correo. La cabecera de `logo.ts:4-9` lo
dice sola: el PNG está en base64 *"porque Gmail bloquea las imágenes externas por
defecto"* y *"son 4.5 KB por correo"*. Un PDF no tiene ninguna de esas dos
restricciones.

**Escenario con valores.** Alguien optimiza la entregabilidad y cambia
`logo.ts:10` por una variante monocroma de 1.2 KB que se vea bien en el modo
oscuro de Gmail. `npx tsc` pasa, los tests de `correo/` pasan, y el pie de **todas
las liquidaciones y todos los informes** cambia de logo sin que nadie lo pida ni
lo note hasta mirar un PDF.

**Consecuencia.** Cualquier refactor del canal de correo (cambio de proveedor,
plantillas hospedadas, borrado del módulo) arrastra al motor de papel de dinero.

**Causa raíz probable.** No hay un lugar para "activos de marca"; el logo se
codificó donde primero se necesitó y el segundo consumidor lo importó de ahí.

---

---

## B2 · [BAJO] "Hoy en México" tiene dos ortografías y el guardia de formato solo cubre las cifras

**Rubro:** Arquitectura  
**Dónde:** `src/lib/formato.ts`


`src/lib/formato.ts` es frontera real para el dinero: `toLocaleString('es-MX')` no
aparece en ningún otro archivo no-test (verificado; `src/lib/formato.test.ts`
pasa). Pero el mismo archivo exporta `TZ_MX` (`:34`) y `fechaMx`/`fechaCorta`/
`fechaHoraMx` y **no** exporta un `hoyMx()`, así que el día local de México se
escribe de dos maneras que el guardia no mira:

- `new Date().toLocaleDateString('en-CA', { timeZone: TZ_MX })` — 13 sitios
  no-test, entre ellos `analytics.ts:105,155,380,473,526,549,583,1190`,
  `admin/negocio.ts:189,195`, `clientes.ts:601`;
- `new Intl.DateTimeFormat('en-CA', { timeZone: TZ_MX }).format(new Date())` —
  25 sitios no-test, entre ellos `dashboard/inicio-contenido.tsx:256`,
  `likida/agentes/runner.ts:63`, `likida/agentes/cola.ts:340`,
  `auth/tenant-efectivo.ts:87`.

Y dos de ellos ni siquiera usan la constante: `src/lib/admin/consumo.ts:49` y
`src/lib/admin/qa-storage.ts:244` escriben el literal
`'America/Mexico_City'` a mano en vez de `TZ_MX`.

**Escenario con valores.** El día que la zona horaria deje de ser una constante
—México reintroduce horario de verano, o el producto pasa a cortar por la zona de
la flota— hay que tocar 40 sitios. Los dos que hardcodean el literal no aparecen
buscando `TZ_MX`, así que `/admin` → "Costo de IA hoy" (`consumo.ts:49`) seguiría
cortando el día por Ciudad de México mientras `/dashboard` → "Gasto de hoy"
(`analytics.ts:473`) ya cortaría por otra: dos pantallas con la palabra "hoy" y
dos ventanas distintas, sin un solo error.

**Consecuencia.** El invariante que el repo cree tener ("el formato vive en un
solo archivo") es cierto para las cifras y falso para las fechas, y la prueba que
lo defiende no distingue.

**Causa raíz probable.** El guardia se escribió contra el síntoma concreto que
dolió (`toLocaleString('es-MX')`, tres representaciones de 1234.56 litros) y no
contra la categoría.

---

---

## B3 · [BAJO] `POST /api/lead` dedupe leyendo antes de escribir, sobre una tabla sin unique

**Rubro:** Backend y API  
**Dónde:** `src/app/api/lead/route.ts:173-194`


`src/app/api/lead/route.ts:173-194`

Escenario, con valores: el visitante de `likida.ai/getdemo` hace doble clic en
"Enviar" (dos POST con ~150 ms de diferencia, dentro del `rateLimit` de 10/min).
Los dos ejecutan `.eq('correo','director@flotax.mx').limit(1)`, los dos reciben
`[]` porque ninguno ha escrito todavía, y los dos caen al `escribir(db,'insert',…)`
de la línea 194. `prospecto` no tiene índice único ni por `correo` ni por
`empresa` — la 0139 lo dice explícitamente
(`0139_prospecto_calidad.sql:46-48`: el unique no se creó porque hay 1,227 grupos
duplicados vivos). Resultado: dos filas.

Consecuencia: dos prospectos para la misma empresa en la cartera comercial, y
—como `/api/admin/mapa-prospectos/mensaje` cobra una llamada de modelo por `id`—
dos primeros toques generados y potencialmente dos mensajes al mismo decisor. Es
la misma clase de duplicado que la 0139 acaba de medir y marcar a mano.

Causa raíz probable: el único endpoint de escritura público del repo es también
el único sin llave natural ni `Idempotency-Key`, mientras `/v1` exige las dos
(`_escritura.ts:393-417`).

---

## B4 · [BAJO] El 15% de la RFA 2.9 se reparte en proporción, y el papel no dice que ésa es una lectura

**Rubro:** Cumplimiento fiscal  
**Dónde:** `src/lib/likida/cuadre/engine.ts:357-377`


`src/lib/likida/cuadre/engine.ts:357-377`

**Norma** (ficha `normas/rfa-2026-2.9.yaml`, `verificado_fuente_primaria`: **sí**),
literal:

> «…considerarán cumplida la obligación establecida en el artículo 27, fracción III,
> segundo párrafo de la Ley del ISR, cuando los pagos por consumo de combustible se
> realicen con medios distintos a cheque nominativo […] **siempre que estos no excedan
> el 15 por ciento del total de los pagos efectuados por consumo de combustible** para
> realizar su actividad.»

**Código:**

```ts
const tope = 0.15 * total;
const cupoRestante = Math.max(0, tope - previoSinEste);
const dentro = Math.min(g.monto, cupoRestante);
const excedenteDeEste = Math.max(0, g.monto - dentro);
```

**Escenario con pesos.** Ejercicio con **$1,000,000** de combustible, de los cuales
**$200,000** en efectivo (20%).

- El motor imprime «el excedente de $50,000 NO se deduce», afirmando implícitamente que
  los **$150,000** restantes sí.
- La lectura literal del «siempre que» es una condición de procedencia, no un
  prorrateo: incumplido el 15%, la facilidad no se tiene por cumplida y los **$200,000**
  caen bajo LISR 27-III sin excepción. Diferencia entre las dos lecturas: **$150,000**
  de deducción.

**Consecuencia.** El motor elige la lectura favorable al cliente —defendible y la más
usada en la práctica— pero no la declara como lectura, cuando el mismo archivo declara
todas las demás. Refutación honesta: la ficha, en `condiciones_de_aplicacion`, tampoco
resuelve la ambigüedad, así que no es un error demostrable; es una interpretación
callada en un producto cuya regla es decir cuál usó (`BASE_ESTIMULO_PEAJE` hace
justamente eso para el peaje).

---

---

## B5 · [BAJO] La cuota semanal del diésel: sin consumidor, sin contrato con la rutina que la escribe, y con el campo que invita a la multiplicación equivocada

**Rubro:** Cumplimiento fiscal  
**Dónde:** `normas/datos/cuota-ieps-diesel.yaml`


`normas/datos/cuota-ieps-diesel.yaml` · `.claude/skills/cuota-diesel/SKILL.md`

**Qué pedí verificar y qué encontré.** Pregunta del encargo: qué pasa si una
liquidación cae **fuera** del rango de vigencia cubierto. Respuesta medida:
**nada, porque nada lee el archivo.** `grep -rn "cuota-ieps-diesel\|cuota_disminuida\|
estimulo_por_litro\|cuotaSemanal" src/` → 0 resultados en `src/`. Lo confirma el propio
archivo («el motor todavía NO consume este archivo») y el latido
(`normas/.latido-cuota-diesel`: «El motor AUN no consume el archivo»). El comportamiento
hoy es el honesto: `engine.ts:978` deja `iepsAcreditable = 0` y el papel entrega litros.
No hay cifra equivocada que reportar — pero tampoco existe el fail-closed que la skill
promete («Sin cuota vigente para la fecha, el motor NO calcula»), porque no hay nada que
pueda negarse a correr.

Tres cosas quedan cargadas para el día que se cablee, y las tres son verificables hoy:

1. **Cobertura.** Cuatro semanas, de `2026-07-25` a `2026-08-21`. Hoy es 20-ago: el
   archivo se queda sin rango **mañana**, y el latido ya dice que la rutina de la nube
   no tiene egress para renovarlo.
2. **Contrato roto con quien lo escribe.** La skill instruye escribir
   `normas/cuota-ieps-diesel.yaml` con las llaves `cuota`, `vigencia_desde`,
   `vigencia_hasta`, `cod_nota`, `fecha_publicacion`, `url`. El archivo real vive en
   `normas/datos/` y usa `semanas[].vigencia` (un string `«A a B»`),
   `cuota_disminuida_por_litro` y `fuente.codNota`. Ni la ruta ni el esquema coinciden,
   así que la verificación de empalme que la skill exige («el `vigencia_desde` de la
   nueva es el día siguiente del `vigencia_hasta` de la anterior») no puede correr sobre
   este archivo.
3. **El campo que invita al error.** Cada semana trae `estimulo_por_litro` (5.0874 la
   del 15-21-ago) **y** `cuota_disminuida_por_litro` (2.2760). El estímulo del
   transportista es la **cuota disminuida** × litros —así lo dice el latido y así lo
   pide el criterio 1/LIF/PI—; `estimulo_por_litro` es la reducción que la SHCP aplica a
   la cuota, no el acreditamiento de la flota. Sobre **500 litros**: la cifra correcta
   es **$1,138.00** y la del campo mal llamado es **$2,543.70**, un **2.2×**. Es
   exactamente la clase de error que ya se pagó una vez con el IEPS trasladado, con el
   arma cargada y guardada esperando a que alguien la conecte.

---

---

## B6 · [BAJO] El aviso integral publicado cita la fracción equivocada para "persona encargada"

**Rubro:** Cumplimiento legal  
**Dónde:** `src/lib/likida/privacidad.ts:503`


`src/lib/likida/privacidad.ts:503`

**Escenario, con el dato nombrado.** *Juan Pérez* abre `/aviso/<tenant>` desde
WhatsApp y lee en la primera sección: *"Likida opera la herramienta […] es
**persona encargada** (art. 2 fr. XX)"*. La fr. XX es la definición de
**Transferencia**; "Persona encargada" es la **fr. XII** — así lo transcribe
literal la ficha verificada `normas/lfpdppp-2-XII-XX.yaml`, y así lo cita
correctamente el encabezado del mismo archivo (`privacidad.ts:5`) y el anexo
(`52-anexo-subencargados.md:38`).

**Consecuencia.** El titular recibe, en el documento del art. 15, un fundamento
mal citado justo en el renglón que define quién responde por sus datos. No cambia
el fondo (la fr. XX sí es la que excluye a la encargada de la definición de
transferencia, y se cita bien en :592), pero el aviso es la constancia que se
presenta ante la autoridad.

**Causa raíz probable.** Las dos fracciones viven en la misma ficha YAML y se
copió la del título del archivo en lugar de la del concepto.

---

---

## B7 · [BAJO] El código sigue afirmando que el gateway "fuerza ZDR", claim que el aviso ya dejó de hacer

**Rubro:** Cumplimiento legal  
**Dónde:** `src/lib/llm/models.ts:19-23`


`src/lib/llm/models.ts:19-23` frente a `src/lib/llm/openrouter.ts:224-231`

**Escenario, con el dato nombrado.** La foto del ticket de diésel de *Juan Pérez*
sale a OpenRouter con `provider: { data_collection: 'deny' }` (`openrouter.ts:226`),
que es una **preferencia de ruteo** que se pide en cada llamada. `models.ts:21`
la describe como *"Todo lo que lleve RFC/CFDI va SOLO a proveedores US/EU **con
Zero Data Retention**. El gateway **fuerza ZDR**"*.

**Consecuencia.** Es exactamente la afirmación que la auditoría 8 sacó del aviso
por falsa —nota en `privacidad.ts:584-589`: *"una garantía contractual que nadie
negoció con OpenRouter […] no un contrato de Zero Data Retention firmado"*— y que
el anexo mantiene como pendiente #3 (*"Confirmar el régimen de retención de
OpenRouter"*, `52-anexo:225`). Vive hoy solo en un comentario, pero es el
fundamento declarado de la decisión de arquitectura y es lo que un ingeniero
repetiría en una due diligence. El propio `11-datos-personales.md:381-395`
explica por qué no es lo mismo: ZDR se contrata por organización, no se activa
con una bandera por llamada.

**Causa raíz probable.** Se corrigió el texto que ve el titular y no la
justificación interna que lo originó.

---

## B8 · [BAJO] `/login?enviado=1` es un estado terminal: sin formulario y sin salida en la página

**Rubro:** Frontend  
**Dónde:** `src/app/login/page.tsx:231-317`


`src/app/login/page.tsx:231-317`

Con `enviado=1` el ternario reemplaza **todo** el bloque de acciones (Google,
separador, campo de correo, botón, y la nota "¿Tu correo no tiene acceso?") por la
tarjeta de confirmación. Lo que queda clicable en la pantalla son `/terminos` y
`/privacidad`; el `Logo` (`src/app/logo.tsx:29`) es un `<span role="img">`, no un
enlace.

Escenario: el contralor teclea `contralroria@flota.com` (dedazo). Como
`esCorreoSinCuenta` (`:89-95`) suprime a propósito la diferencia entre "existe" y
"no existe" —decisión correcta, cierra el oráculo de enumeración—, ve **"Te
mandamos un enlace a tu correo. Ábrelo desde este mismo dispositivo."** Espera. No
llega nada. En la pantalla no hay ningún control para reintentar con otro correo:
tiene que usar el botón Atrás del navegador o editar la URL a mano.

Consecuencia: el correo con dedazo es el modo de falla más común de un magic
link, y la única puerta al producto no ofrece camino de vuelta. Con un comprador
delante, "déjame volver a intentar" es teclear una URL.

Causa raíz probable: el estado `enviado` se modeló como reemplazo del formulario
en vez de como aviso encima de él.

---

---

## B9 · [BAJO] `wa_conversacion.tenant_id` es nullable, así que su índice único no cubre el caso NULL y esas filas son invisibles para toda policy

**Rubro:** Modelo de datos  
**Dónde:** `supabase/migrations/0001_init.sql:80`


`supabase/migrations/0001_init.sql:80` · `supabase/migrations/0005_concurrencia.sql:24` ·
`src/lib/likida/conv.ts:230-237`

**Escenario, con valores.** `wa_conversacion_tenant_tel_uidx` es
`unique (tenant_id, telefono)`; en Postgres los NULL no colisionan entre sí. Dos
`insert into wa_conversacion (telefono, estado) values ('5215500001001', '{"turns":[]}')`
sin `tenant_id` entran los dos. Después, `loadConversation` sí filtra por tenant, así que
no las encuentra nunca; y la policy `tenant_data` evalúa `NULL = any(...)` → NULL, o sea
que ningún usuario autenticado las ve tampoco. La 0028:51-52 documenta que dejó
`wa_conversacion` fuera de las FK compuestas precisamente por esto y no cerró la nulabilidad.

**Consecuencia.** Filas que acumulan historial de conversación —dato personal bajo
LFPDPPP— sin flota a la que atribuirlas y sin pantalla desde la cual verlas o borrarlas.
Hoy no hay escritor que las produzca; la restricción es la que evita que aparezca uno.

**Causa raíz probable.** El `tenant_id` nullable de la 0001 era para el caso "todavía no sé
de quién es este teléfono", y ese caso dejó de existir cuando `resolveOperador` pasó a
resolverse antes de tocar la tabla.

---

---

## B10 · [BAJO] `worker_llave.capacidades` no tiene dominio ni "no vacío"

**Rubro:** Modelo de datos  
**Dónde:** `supabase/migrations/0135_worker_llave.sql:26`


`supabase/migrations/0135_worker_llave.sql:26` · `src/lib/worker/llaves.ts:44`

**Escenario, con valores.** `capacidades text[] not null` acepta `'{}'` y acepta
`'{bus.ordenes_}'`. `crear-worker-llave.py` teclea la lista. Una llave creada con
`{"bus.latido","bus.piezas"}` (plural, en vez de `bus.pieza`) se guarda sin queja;
`llaves.ts:44` hace `.includes(capacidad)` y la rechaza en cada llamada.

**Consecuencia.** Falla cerrado —que es lo correcto— pero el error se manifiesta como un
403 en la Mac del bus a las 3 de la mañana, y la fila de la base dice que la llave tiene
permiso. El diagnóstico es un `select capacidades` y comparar letra por letra contra las
cuatro del comentario de la migración.

**Causa raíz probable.** Las cuatro capacidades viven en un comentario SQL (0135:12-15) y
en un `includes` de TypeScript; no hay un lugar donde estén enumeradas de forma que la base
las pueda comprobar.

---

---

## B11 · [BAJO] El arranque bloquea la primera petición con hasta 10 s de red externa

**Rubro:** Operabilidad y DX  
**Dónde:** `src/instrumentation.ts:33`


`src/instrumentation.ts:33` · `src/lib/likida/privacidad.ts:140-157`

`register()` termina con `await verificarAvisoDePrivacidad()`, que hace
`getDatosResponsable(tenantId)` (consulta a Supabase) y luego
`sondearAvisoIntegral()`: un `fetch` HEAD con `AbortSignal.timeout(5000)` y, si
contesta 405/501, un GET con otros 5 s. La documentación de Next en este repo
(`node_modules/next/dist/docs/01-app/02-guides/instrumentation.md`) es explícita:
`register()` «must complete before the server is ready to handle requests».
Antes corre `verificarMigracionesCriticas()`, que son ~8 viajes redondos
secuenciales a la base.

**Escenario, 3 a.m.** El host donde está publicado el aviso de privacidad del
tenant se cae. Cada instancia fría de la función del webhook paga 5-10 s **antes
de contestar el primer mensaje** de un chofer. Meta no espera indefinidamente el
200 del webhook, y el diseño entero de `route.ts` («responde 200 rápido y procesa
en `after()`») está construido para no gastar ese presupuesto.

**Consecuencia:** un fallo en un tercero irrelevante para la liquidación puede
convertirse en mensajes de WhatsApp reintentados o perdidos. El propio comentario
de :30-33 reconoce el riesgo («hace una petición de red: no puede retrasar el
diagnóstico de lo demás») y lo resuelve con el orden, no con el bloqueo.

---

## B12 · [BAJO] Un `maxDuration` de 600 contra un techo de plataforma verificado en 300

**Rubro:** Rendimiento y costo  
**Dónde:** `src/app/api/cron/facturar/cola/route.ts:12`


`src/app/api/cron/facturar/cola/route.ts:12` · `src/lib/likida/presupuesto.ts:181-183`
· `src/app/api/cron/facturar/route.ts:32,136`

La ruta declara `maxDuration = 600` argumentando que "QStash permite hasta 10 min
de timeout" y que "el techo de 300s de una invocación directa es justo lo que
esta cola existe para romper". QStash no extiende el límite de Vercel: espera
más, no deja correr más. Y el plan está verificado dos veces en el repo como
**pro, tope 300s** (`presupuesto.ts:181-183`, `webhook/whatsapp/route.ts:72-74`).

**Escenario:** el lote se procesa con `procesarLoteEnCola`, cuyo presupuesto es
`PRESUPUESTO_LOTE_MS = maxDuration * 1000` importado de **la otra ruta**
(`facturar/route.ts:136`, donde `maxDuration = 300`), y corta a los 150s
(`MARGEN_LOTE_MS`). O sea que el trabajo real nunca pasa de 150s y el 600 no
llega a doler hoy — pero el número escrito en la ruta no es el que la ruta
respeta, ni el que la plataforma puede conceder.

**Consecuencia:** quien suba `MARGEN_LOTE_MS` leyendo "tengo 600s" va a
dimensionar contra un presupuesto que no existe.

**Causa raíz probable:** el timeout del *cliente* (QStash) se anotó como si fuera
el del *servidor*.

---

---

## B13 · [BAJO] La llave que firma la cookie de flota cae a la service role key cuando falta

**Rubro:** Seguridad  
**Dónde:** `src/lib/auth/admin-context.ts:49`


`src/lib/auth/admin-context.ts:49`:

```ts
return process.env.LIKIDA_FLOTA_COOKIE_LLAVE ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
```

**Escenario.** Producción hoy corre sin `LIKIDA_FLOTA_COOKIE_LLAVE` (no aparece
en `.env.example` ni en `lib/env.ts:29-38`), así que el HMAC de
`likida_flota_activa` se firma con la service role key. Se filtra la service
role key por cualquier vía (un log, un dump, un colaborador que sale) y hay que
rotarla: al rotarla, `validarSeleccion` (`:79-91`) deja de reconocer toda cookie
viva y el superadmin rebota al selector — y, al revés, mientras no se rote, un
mismo material de llave está sirviendo para dos propósitos distintos (acceso
total a la base y firma de una cookie de sesión) sin que nada obligue a
separarlos.

**Consecuencia.** Hoy no hay explotación: HMAC-SHA256 no filtra su llave por la
salida, y la cookie es `httpOnly`, `sameSite: 'lax'`. Es el ítem que el rubro
nombra por su nombre —"un secreto que tiene fallback derivado de otro secreto
cuando falta"— y es una de las dos razones por las que este rubro no puede
llegar a 8.

**Causa raíz probable.** Se prefirió que la firma "nunca se quede sin llave" a
que la ausencia de la llave sea un estado declarado; el propio comentario de
`:41-47` razona el fallback como una virtud.

---

---

## B14 · [BAJO] El step-up de MFA falla ABIERTO, con un comentario que dice lo contrario

**Rubro:** Seguridad  
**Dónde:** `src/lib/auth/mfa.ts:36-45`


`src/lib/auth/mfa.ts:36-45` y `:57-62`.

**Escenario.** El comentario de `:36-37` dice "Fallar cerrado hacia 'sin
inscribir'". El código hace lo contrario: `const totp = factores.data?.totp ?? []`
convierte un `listFactors()` que devolvió error en "no tiene factores", y
`exigirAal2SiHayFactor` (`:59`) devuelve `{ok:true}`. O sea: superadmin CON TOTP
inscrito, `/auth/v1/factors` de Supabase devuelve 500 durante dos segundos, y en
esa ventana un `POST /api/admin/copiloto` con `{"intentId":"…","accion":{"id":"<acción doble>","objetivo":"…"}}`
pasa el `if (defAccion?.gateo === 'doble')` de `route.ts:117-123` sin AAL2.

**Consecuencia HOY: ninguna, y hay que decirlo.** Recorrí `CATALOGO_ACCIONES`
(`src/lib/agents/copiloto-acciones.ts:39-90`): las cinco acciones con
`gateo:'doble'` —`encender_agente`, `aprobar_pendiente`, `rechazar_pendiente`,
`marcar_pago_conciliado`, `reabrir_liquidacion`— están todas con
`implementada: false`, y el route solo crea intent para las implementadas
(`route.ts:187-191`). El hueco es latente: se abre el día que se implemente la
primera, que según su propio catálogo es la que "MUEVE DINERO".

**Causa raíz probable.** `estadoMfa` mezcla dos preguntas —"¿tiene factor?" y
"¿pude preguntarlo?"— en un solo booleano sin estado para "no sé".

---

---

## B15 · [BAJO] `reservar_envio_prospecto` es la única función posterior a la 0054 sin su `revoke ... from public`

**Rubro:** Seguridad  
**Dónde:** `supabase/migrations/0124_cadencia_atomica_y_entrega.sql:26-58`


`supabase/migrations/0124_cadencia_atomica_y_entrega.sql:26-58` (se define en
`:26`, se le fija `search_path` en `:57`, y no hay `revoke` ni `grant` en todo
el archivo — verificado con `grep -n "reservar_envio_prospecto" *.sql | grep -i
"revoke\|grant"`, que no devuelve nada).

**Escenario.** Postgres otorga `EXECUTE` a `PUBLIC` en cada función nueva, que
es exactamente la lección que la `0054_fuga_vista_saldo_y_grants.sql:28-40`
dejó escrita ("`revoke ... from anon` no revocaba nada"). Con la anon key —que
es pública, va en el bundle del navegador— cualquiera puede llamar:

```
POST https://<proyecto>.supabase.co/rest/v1/rpc/reservar_envio_prospecto
apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>
Content-Type: application/json

{"p_prospecto":"<uuid>","p_pieza":"<uuid>","p_actor":null,"p_resumen":"x","p_horas":48}
```

**Consecuencia: contenida, y por eso es BAJO.** La función es `SECURITY INVOKER`
(no lleva `security definer`), y `prospecto_contacto` tiene RLS deny-all
(`0118_prospecto_contacto.sql:41`, sin una sola policy), así que el `select`
interno no ve filas y el `insert` revienta con 42501 antes de escribir nada.
No hay fuga ni escritura, ni siquiera oráculo: el resultado es idéntico para
todo prospecto. Lo que hay es la excepción a un patrón que este repo ya pagó
una vez —las 12 funciones de las 0098/0101/0102/0104/0112/0114 sí traen su
`revoke all ... from public, anon, authenticated`— y una superficie RPC pública
que nadie pidió.

**Causa raíz probable.** La 0124 salió del hilo de "cadencia atómica" y no del
hilo de "funciones nuevas"; el `revoke` no está en ninguna comprobación
automática, solo en la costumbre.

---

---

## B16 · [BAJO] `finish_reason: 'length'` con tool_calls se le reporta al modelo como "argumentos JSON inválidos"

**Rubro:** Tool calling  
**Dónde:** `src/lib/llm/openrouter.ts:759-774`


`src/lib/llm/openrouter.ts:759-774` (guardia de truncamiento) vs. `:804-810` (parseo de args) · comparar con `:456-464`

**Escenario (con valores).** La comprobación de truncamiento vive **dentro** de
`if (!calls || calls.length === 0)`. Cuando el modelo sí emitió tool_calls y se
quedó sin techo a media escritura de `arguments`, no se detecta.

El analista corre con `maxTokens: 900` (`analista.ts:326`). El usuario pide *"dame
la tabla de los 20 viajes del mes"*; el modelo llama `entregar_respuesta` con un
bloque `tabla` de 20 filas ≈ 1,100 tokens de salida → corte en 900 →
`finish_reason: 'length'`, `tool_calls` presente, `arguments` truncado →
`JSON.parse` falla → `executed.push({error:'args_parse'})` y al modelo le vuelve
`{"error":"argumentos JSON inválidos"}`.

**Consecuencia.** El modelo recibe un diagnóstico falso (le dicen que formateó mal
cuando lo que faltó fue presupuesto), reintenta, y quema rondas hacia el
loop-guard. En el log queda `args_parse`, así que nadie puede atribuirlo al techo
de 900 tokens. Es exactamente el bug que `generateStructured` ya arregló y
documentó ("el parseo también falla y confunde el diagnóstico… truncamiento
disfrazado de ilegible", `openrouter.ts:454-464`), vivo en el camino hermano.

**Causa raíz probable.** La guardia se colocó dentro de la rama "el modelo cerró
con texto" en vez de justo después de leer `choice`.

---

---

## B17 · [BAJO] La rejilla de caché de lectura no cubre ninguna tool de los dos chats

**Rubro:** Tool calling  
**Dónde:** `src/lib/llm/openrouter.ts:565-572`


`src/lib/llm/openrouter.ts:565-572` (`READ_PREFIXES` / `isReadOnly`) · `src/lib/likida/tools.ts:90` (`estado_viaje`) · `src/lib/agents/copiloto-tools.ts:36-40` · `src/lib/agents/analista.ts:39-43`

**Escenario (con valores).** `READ_PREFIXES = ['get_','check_','list_','find_','consultar_','validar_','cuadrar_']`.
De las 26 tools registradas, solo dos matchean: `consultar_politica` y
`cuadrar_viaje`. No matchean **ninguna** de las 10 del chat del cliente
(`kpis_flota`, `serie_gasto`, `top_rutas`, …), **ninguna** de las 14 del copiloto
(`metrica_negocio`, `bandeja`, `guardia`, …), ni `estado_viaje` — que es lectura
pura y cae en el mismo hueco que el comentario de `:565-571` dice haberle cerrado
a `cuadrar_viaje`.

Concreto: el reintento correctivo del copiloto le ordena al modelo *"vuelve a
llamarlas si te hace falta"* (`copiloto.ts:232`). El modelo vuelve a pedir
`metrica_negocio` → `isReadOnly('metrica_negocio') === false` → `crossRound` ni
consulta ni guarda → `getResumenNegocio()` se ejecuta otra vez completa
(agregación cruzando todos los tenants) dentro de un turno acotado a 40 s.

**Consecuencia.** Latencia y trabajo de base duplicados en el turno que ya iba
apretado de presupuesto — el mismo turno que después pega el loop-guard. No hay
riesgo de dato incorrecto: `inRound` sigue dedupeando dentro de una ronda y las
mutaciones tienen su propia rejilla.

**Causa raíz probable.** La rejilla se llavea por convención de nombre y las tools
nuevas (12-ago en adelante) se nombraron por sustantivo (`bandeja`, `guardia`,
`kpis_flota`), no por verbo.

---

---

## B18 · [BAJO] `faseDeModelo` puede sacar el gasto del chat del universo que mira su propio tope

**Rubro:** Tool calling  
**Dónde:** `src/lib/likida/costos.ts:102-105`


`src/lib/likida/costos.ts:102-105` · `src/app/api/dashboard/chat/route.ts:95-100` · `src/app/api/dashboard/chat/tope.ts:35`

**Escenario (con valores).** El route registra
`fase: faseDeModelo(modelo, 'chat')`, y `faseDeModelo` devuelve `'escalacion'`
—no `'chat'`— para cualquier slug que contenga `opus`. El freno diario lee
`.eq('fase','chat')` (`tope.ts:35`).

`models.ts:44-47` establece que cambiar de modelo debe costar **una variable de
entorno, no un despliegue**. Con `LIKIDA_MODEL_CHAT=anthropic/claude-opus-5`
($5/$25 por M, ya en `PRICES`), cada turno cuesta ~$0.25 y se archiva como
`fase:'escalacion'`. `gastoChatHoyUsd` suma $0.00 para siempre: el tope de $1/día
por tenant **deja de existir en silencio**, y el widget de uso del sidebar —que
lee el mismo número a propósito— le enseña al cliente $0 gastados.

**Consecuencia.** El único candado contra el bucle y el curioso desaparece
exactamente cuando el modelo elegido es el más caro del catálogo. Modo de falla
silencioso, de la misma familia que la tabla `FALLBACK` indexada por slug que
`openrouter.ts:55-62` ya documenta como trampa pisada.

**Causa raíz probable.** Dos clasificaciones distintas del mismo hecho: quien
escribe la fila deriva la fase del slug del modelo, quien la lee la busca por el
nombre del subsistema.

---

---