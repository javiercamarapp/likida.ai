# Arquitectura y mantenibilidad — auditoría 5

**Nota: 6/10** (antes 6). Razón del movimiento: se mantiene, no sube. Las fronteras principales existen y se respetan (formato centralizado, cuadre puro, visibilidad con prueba guardián, motores de los 6 agentes en `lib/likida/` separados de la UI). Pero hoy la deuda estructural cobró factura: la FK compuesta de la 0075 dejó dos relaciones por par en 5 pares de tablas y tres embeds sin alias cayeron en producción (página de cobranza, cron de escalación, aviso de cierre). La mitigación quedó en la aplicación (alias + guardián), no en el esquema. Además, el monolito de `processor.ts` (~2,300 líneas) sigue creciendo con cableado de negocio nuevo. Con dos o tres fugas conocidas y la ambigüedad de la 0075 sin resolver de raíz, el 6 previo sigue siendo el número justo.

Riesgo mayor del rubro, hoy: los 5 pares de tablas con dos relaciones después de la 0075 — el precio de la ambigüedad lo paga cada embed o join nuevo, y hoy lo pagó producción tres veces.

## Hallazgos

### [ALTO] La FK compuesta de la 0075 dejó DOS relaciones en 5 pares de tablas; la verdad de la relación ya no vive en un solo lugar
`Migración 0075` (identificador dado por el MAPA; el snapshot no expone el nombre del archivo ni la línea. Arreglos de hoy en commits `2e59040` y `566a962`).

Escenario: entra una consulta embebida nueva sobre cualquiera de los 5 pares de tablas sin alias → Supabase responde `more than one relationship` → la página o el cron falla. Ya pasó tres veces hoy: página de cobranza, cron de escalación y aviso de cierre. Si la consulta no es un embed sino un join implícito, puede resolver contra la relación equivocada sin error, con datos cruzados entre las dos rutas que dejó la FK compuesta.

Consecuencia: el contralor ve la página de cobranza rota en la sala (pierde el trato), o el cron de escalación no corre y un viaje que necesitaba escalamiento se queda sin aviso. Para el equipo, cualquier cambio que toque esas tablas exige saber de memoria que hay que aliasar; el conocimiento no está en el esquema.

Causa probable: la FK compuesta de la 0075 generó dos rutas de relación en el esquema; el arreglo de hoy se hizo por síntoma (alias en los tres embeds caídos) y el guardián estructural `embeds_con_alias.test` detecta el error después de que ocurre, no elimina la ambigüedad de fondo.

### [MEDIO] `processor.ts` es un monolito de ~2,300 líneas y el cableado de negocio nuevo se sigue incrustando en la capa de WhatsApp
`processor.ts:402-470` (rama oficina) y `processor.ts:1545` (hitos), según el MAPA.

Escenario: un desarrollador modifica el flujo de hitos del chofer (zona ~1545) y rompe sin querer la rama de despacho por oficina (zona ~402-470), o al revés, porque ambas viven en el mismo handler de webhook. Entra un mensaje del chofer → el enrutamiento cae → el aviso al jefe no sale. El error no se ve en build ni en type-check: aparece en producción, en el canal que el contralor está mirando.

Consecuencia: el equipo que mantiene el corazón de WhatsApp paga el costo de entender 2,300 líneas con ramas entremezcladas para tocar una sola; la próxima regresión silenciosa en los 6 agentes nuevos es cuestión de tiempo.

Causa probable: el webhook creció incremental y el orquestador de negocio nunca se extrajo a una capa propia; `lib/likida/hitos_viaje.ts` y `lib/likida/despacho_wa.ts` ya existen como motores, pero el cableado sigue en `processor.ts`.

### [MEDIO] El cron unificado `api/cron/escalar` mezcla dos responsabilidades: escalación y cobranza global
`api/cron/escalar` (ruta del MAPA; el snapshot no expone el archivo interno).

Escenario: `ejecutarCobranzaGlobal` lanza una excepción a las 03:00 → el cron devuelve 500 → la escalación de ese turno no corre, aunque el origen del fallo sea la cobranza. Entra un viaje que requería escalamiento esa madrugada → nadie lo escala → el chofer no recibe seguimiento y el caso se detecta tarde.

Consecuencia: un fallo en una responsabilidad silencia la otra; el operador ve "cron tronando" en el monitor y no sabe cuál de las dos tareas no se ejecutó. El nombre `escalar` ya no describe lo que el cron hace.

Causa probable: se unificaron en un solo cron para compartir horario, pero sin separar la ejecución en funciones que reporten su éxito o fracaso de forma independiente.

## Lo que revisé y está bien

- `lib/formato.ts`: el MAPA lo declara como único lugar para formato de cifras, con prueba guardián. Una sola fuente de verdad para un concepto que suele duplicarse.
- `lib/likida/cuadre/`: motor puro, sin I/O en la lógica de dinero. Frontera respetada.
- `lib/likida/agentes/cobranza_pura.ts`: separación pura/impura en el motor de cobranza (0089). La parte de dinero queda aislada de la parte de efectos.
- `lib/likida/proveedores.ts` (0091) como motor separado de la página `dashboard/agentes/proveedores`. Mismo patrón de isolación que cobranza.
- `lib/auth/visibilidad.ts` + `dinero_por_area.test.ts`: un test que escanea que operación no pinte pesos — la frontera de dinero por rol está vigilada por prueba estructural, no por memoria.
- `lib/auth/permisos.ts`: acciones separadas de visibilidad.
- `normas/*.yaml`: fuente de verdad fiscal, externa al código; el fiscal transcribe y el código lee de ahí.
- `supabase/verificaciones.sql` con 66 bloques y migraciones hasta la 0091: hay un proceso de verificación por migración.
- Patrón page/vista consistente en las páginas del rediseño v3 — reduce el costo de orientarse en `dashboard/`.
- Seis agentes nuevos con motor en `lib/likida/` y UI en `dashboard/agentes/`: aunque no pude abrir cada archivo, la estructura declarada respeta la frontera de capas que el rubro pide.

## Lo que NO alcancé a revisar

- `docs/conocimiento/40-auditoria-codigo.md` (ola 2): no está en el snapshot. Sin él no puedo declarar REINCIDENTE la advertencia de literales duplicados (el caso canónico `engine.ts` con `'Gasto'` vs `pdf.ts` con `'Otro'`). No tengo evidencia de que siga vivo ni de que esté muerto.
- `lib/agents/analista.ts` y `chat-tools.ts`: el MAPA dice tools de "solo lectura", pero no pude confirmar que todo acceso a datos pase por `repo.ts`. Si una tool consulta la base directo, es una fuga de repositorio que este snapshot no me deja ver.
- `lib/admin/negocio.ts`: cruza tenants a propósito; no verifiqué que no duplique reglas de `lib/likida/**`.
- `lib/likida/importar_viajes.ts` (Kit PoC): no pude verificar si comparte el modelo de estados con el flujo de Despacho o si es un mapa de conceptos paralelo.
- `lib/likida/peajes/desglose.ts`: no verifiqué pureza ni I/O.
- `api/cron/facturar`: el MAPA dice "sin cambios grandes", pero no pude abrirlo para confirmar que no comparte el problema de responsabilidades mezcladas del cron `escalar`.
- `recordatorio_comprobacion.ts` y `/dashboard/viajes/nuevo`: el MAPA los declara muertos (supersedidos por 0089 y Despacho, respectivamente), pero no tengo la línea actual para confirmar si el código sigue en el árbol. Si siguen, es deuda BAJO que va a cobrar factura; no lo reporto como hallazgo porque no pude verificar su existencia física.
- Migración 0075: solo tengo el identificador y los commits de arreglo, no el archivo ni la línea de la FK. El hallazgo [ALTO] se sostiene en el hecho reportado por el MAPA (5 pares, dos relaciones, tres caídas hoy), no en una línea que no vi.