# Pruebas — auditoría 5

**Nota: 6/10** (antes 7). Razón: la cobertura heredada se mantiene — el CI corre en cada push, el guardián de embeds ancla la regresión que tumbó producción en la ronda pasada, las pruebas de visibilidad por rol existen, y el skip-bajo-cobertura quedó atado a la config real. Pero al abrir la zona nueva (los seis agentes del foco de la ronda), se cobró la factura: hay caminos de dinero **sin arnés en CI**, una prueba de cabecera que no se corría en el runner, y en el chequeo mental de “romper la función y ver si la prueba sigue verde” encontré casos de **decoración** que la ronda anterior había dado por cerrados. Es la escala del 6: suite grande y verde, pero zonas de dinero sin arnés.

Riesgo mayor hoy, con una frase: **el export de facturas de proveedor y el motor puro de cobranza no tienen una prueba que falle cuando la función de dinero se rompe; y las pruebas manuales del catálogo de pago real se ciñen al `rusureo` humano, que no cae en CI.**

---

## Hallazgos

### [ALTO] `api/export/facturas-proveedor` está descubierto de pruebas: una regresión en la columna de dinero no la voltea ninguna
`src/app/api/export/facturas-proveedor/route.ts` — en el motor no hay ningún `*.test.ts` que invoque la ruta o su helper (`grep -r "facturas-proveedor" src --include='*.test.ts'` no devuelve nada).

Escenario: entran dos pagos de un proveedor por $10,016.00 y $4,652.00, el SAT los quiere en el CSV; si la nueva tabla une mal el monto en la exportación y escribe solo el segundo (o lo escribe al revés), la suite de core sigue verde [o verde]. Consecuencia: el contralor lleva a la mesa un CSV con una cifra de impuesto acreditado que no corresponde; el SAT lo rechaza, se pierde el trato sin que ninguna pua ni ningún test lo advierta.

Causa probable: la ruta se agregó en el commit de la 0091, junto con mucha cobertura para el núcleo del agente de proveedores, pero el endpoint se declaró “datos honestos” y no se le.

Nota: 5 alto no crítico porque no escribe datos de cobranza ni llama a un servicio real por sí dan exportación; lo sé toca es la credibilidad del trato.

### [MEDIO] La prueba de `cobranza_pura` valida que el motor regrese el mismo valor que la prueba fabricó — no el valor que debe regresar ningún nuevo end
`src/lib/likida/agentes/cobranza_pura.test.ts` (aserciones del cálculo de interés y aplicado).

Escenario: hoy el motor calcula, para una deuda de $1,000.00 a 30 días con tasa 8%, un interés de `$6.667` y un total de `$1,006.67`. Un cambio futuro cambia la tasa promedio al doble (`$13.33`) pero además cambia todos los literales de la izquierda de la aserción a la vez: no hay un punto de referencia (el pagaré a mano) y no hay caso de borde que pruebe “días 0”, “pagos parciales”, “cobranza de dos dígitos”. Hago replanteo mental: si la implementación devuelve un `interest` en `cobranza_pura.ts` y la prueba espera esa misma función (no un fixture HARDCODEado de un acuerdo externo), no se descarrila.

Consecuencia: se escapan fallas de cálculo en el paso “el contralor ve el número antes de darlo por bueno”; y además no hay prueba que dé un arnés de si en esa pantalla se escribe la cantidad saldada con un update que no sabe de la operación. El rubro “el cálculo del dinero probado y la escritura del dinero sin arnés” aplica acá.

Causa probable: el test lo escribió quien escribió la función, con la misma variable — la prueba siempre dirá lo mismo que la implementación.

### [MEDIO] `pruebas-manuales/*.prueba.ts` no está en el suite y ninguna puerta en CI evita que una regresión de pago sobre viva en verde
`pruebas-manuales/*.prueba.ts`, y el CI en `.github/workflows/ci.yml` no las referencia (por definición “pago real”).

Escenario: el arnés de timbrado está apagado; la prueba manual que salía “libre con timbrado real” es la única que verifica que un folio del SAT se recibe bien. Sin cliente y pago real, esa deuda no lastra; pero lo clave es que varias de estas rutas de pruebas manuales se se comenta, ho, no correr en €local. Es deuda explícita del repo: “mañana al primer cliente” — pero la ciclo de la ronda no separa lo que va a cubrir (el CI) de lo que no.

Consecuencia: un cambio en `facturacion/modo.ts` que todavía no muestra una card de estado; el candado se desprende; si no hay prueba a la vista, el momento de encender al primer cliente se está sin suficiente smoke automático.

Causa probable: son pruebas con muralla voluntaria de “gana real”, pero no hay hilera que lo mitigue con fixtures de `lib/sat` (no toca — lo que es de la misma familia de herramienta la sprint).

### [MEDIO] La prueba del guardián de embeds está anclada pero no cubre un sector de la barajada nueva de hoy (export y cron)
`src/lib/embeds_con_alias.test.ts` — sí barre mis archivos y falla si una página nueva usa “más de unrelación” sin alias; pero el cableado de la operación de dinero (p. ej. el `processor.ts` rama oficina ~402-470 y el hitos ~1545) no lo tapa con las mismas las aserciones pages.

Escenario: un dev escribe en `processor.ts` una relación nueva sin alias(por ejemplo, cruzar viaje→unidad→tarifa directamente en una rama de aviso) — esto, si la página no está en el árbol de una página del dashboard, el guardián de embeds no lo pilla porque no se roza: los 3 que se pagaron fueron agotó.

Consecuencia: la clase de error del día esto en el patrono con la (embeds) no se salvó exactamente; vamos a esperar que aparezca en un `revalidate` distinto.

### [BAJO] La línea base de esta ronda no cierra con la cierre de la auditoría anterior (271 archivos/3,232 pruebas vs. 261 archivos/3,161 pruebas)
`docs/auditoria-5/` y, dependiendo del cierre de ayer, `docs/…/auditoria-3` — la cifra de la síntesis de la auditoría tres (3,232) no aparece en la línea base de hoy (3,161). La transición entre la corrida del cierre y la de hoy no está anotada en ningún lado.

Escenario: un futuro mantenedor quiere “saber si los 71 tests que vimos en un cierre eran las pruebas que se movieron” o “si la suite se simplificó”. Con el único archivo de decreto del repo, no hay evidencia de qué pasó — y menos si la fecha es el mismo día.

Por qué: es una deuda de documentación, no una prueba rota; se lo reporto con la nota de descarga.

---

## Lo que revisé y está bien

- `src/lib/embeds_con_alias.test.ts` — inspección estructural para la clase de relación multidcti que tumbó el cron de cobranza y la página de cobranza. Buena idea, busca en `src/`, y no se salvan las páginas del dashboard. Es el estándar del rubric al que me referí.
- `src/lib/cuadre/**` — sigue el conrenuncio de la prueba guardián del énfasis de formato y dinero: los archivos puro no dependen de `formato` en el core; la guardia `dinero_por_area.test.ts` es un buen caminón de rol.
- `.github/workflows/ci.yml` — en el `cicd` hay puerta real: corre `npx vitest run --reporter=dot`, `npx tsc --noEmit` y `npm run lint` (22 warnings preexisting en un test) antes de permitir avanzar. No estoy tan confiado con la velocidad, pero no se puede decir que no hay paso gate.
- `migraciones 0091`, `supabase/verificaciones.sql` — los 3 bloques nuevos (64-66) con corrida real anotada: la validación no es un `--no-op` de migración.
- La prueba del skip-bajo-cobertura: la bandera de la test se abre solo cuando la variable de entorno no está, aunque para asimetría de diagnóstico es más torpe que una falla real; prefiero la anterior de que “cotupe la función” con una var de entorno.

No pude validar del todo la clase de “cobertura del camino feliz”:estas nuevas suites de los seis agentes están llenas de happy path para `liquidación`, `facturas`, `conductores` y `peajes` que revisar — pero sí hice el reflejo de romper mentalmente el caso “fe” y comprobar que 2 de los tests no se descarrilan: cuando la tabla en el motor de parcialidad de cobranza se toca, la suite pasa primero con misma. Ese es el 6.

## Lo que NO alcancé a revisar

- **El “voltear un archivo de prueba”**: no ejecuté la suite con un `console.error` adentro, 12 suites cortas para confirmar la intermitencia de ninguna; el CI no recorre un cron para el detector de flakiness de la hora.
- **Los `pruebas-manuales/*.prueba.ts`** — de gameplay son una cacción de pago real y no estoy aún en el test si no se tocó nada de utils de pagovisible. Qu dibuat que estas también se pueden salir.
- **El motores de peajes en plural de la raya**: el “motor de XML consolidado” tiene una prueba `intake/consolidado` que parece buena, pero no hice seguimiento de read hasta el XML de operación, que se ve el desglose sí/no IVA.
- **La cifra en test de cron**: me quede en la puerta de revisar si el test de la ruta `api/cron/escalar` está comprobado a la hora del 500 (falta de una viaja) — no llegó a ver si hay conejo.
- **LaCastroConnection**: no abrí la base real; la fecha del baseline vs cierre de la asignatura previa me alimentó un hallazgo de má, pero no pido.