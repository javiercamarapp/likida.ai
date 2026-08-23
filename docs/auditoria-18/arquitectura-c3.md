# Arquitectura y mantenibilidad — auditoría 18 · continuación 3

**Nota: 5/10** (antes 4). Razón del movimiento: *se atacó y subió*.

Los tres commits que el delta apuntó contra mis abiertos **cerraron de verdad**, y no
con un parche sino con la única cosa que este rubro acepta como cierre: una **prueba
estructural que falla si alguien vuelve a escribir la copia**. Conté las copias, no leí
los asuntos: la URL base pasó de **11 sitios / 5 valores de suelo a 1 accesor**
(`env.ts:101`) con dos guardias; `bitacora_auditoria` pasó de **16 escritores a mano a
1** (`bitacora_escritura.ts:109`) con guardia que barre `src/`; el día de México quedó
en **1** (`formato.ts:47`) con guardia; el logo del PDF salió del subsistema de correo;
y el CRÍTICO de `wa_conversacion` que abrí ayer está muerto por construcción —los tres
escritores hacen lee-modifica-escribe y ya no se pisan el `estado`.

Lo que impide subir más: el **delta abrió un CRÍTICO del tipo exacto que este rubro
ancla en 4 o menos** —«la misma lógica de dinero vive en más de un archivo»—, y lo abrió
en archivo NUEVO, contra una prohibición escrita en el motor y a diez metros del PDF que
ya se curó de ese mismo error. Por el ancla literal esto sería 4; le doy el quinto punto
porque los tres guardias nuevos no arreglan instancias, cierran **clases** de fallo, y
eso es exactamente lo que el rubro pide comprar.

**El riesgo mayor del rubro hoy:** la pantalla de detalle de liquidación —la que el
contralor cruza contra su PDF— **reconstruye por su cuenta en qué cubeta fiscal cae cada
gasto**, con una lista que ya difiere del motor en los dos sentidos, en la misma vista
donde el motor imprime sus totales.

---

## Verificación de los abiertos de la pasada anterior

| Abierto (c2) | Hoy | El conteo |
|---|---|---|
| **CRÍTICO** — despacho y chofer se pisan la misma fila de `wa_conversacion` | **CERRADO** | `despacho_wa.ts:115-153`, `asignar_wa.ts:173-200` y `conv.ts:485-510` hacen los tres **lee-modifica-escribe** sobre `estado` y ya no mandan `viaje_id`/`operador_id` en el payload del upsert (`despacho_wa.ts:133-137` lo dice). Además `processor.ts:872` entra con `incluirDespacho: !viajeId`, así que con viaje abierto ni siquiera se llega. Los tres escritores fusionan, cero reemplazos de jsonb entero. |
| **ALTO** — URL base, octavo sitio a mano · REINCIDENTE | **CERRADO** | **1 definición**: `env.ts:101` (`appUrl()`), con suelo en `env.ts:100`. **11 llamadores** (`login/page.tsx:65`, `correo/plantilla.ts:59`, `correo/avisos.ts:29`, `observability/alerta.ts:50`, `api/auth/correo/route.ts:162`, `dashboard/usuarios/page.tsx:99`, `dashboard/suscripcion/page.tsx:210`, `admin/vendedores/consola-vendedores.tsx:159`, `auth/reenvio_enlace.ts:99`, `privacidad.ts:706`, `processor.ts:801`). **0 copias del literal** fuera de `env.ts`. Quedan 4 lecturas directas de la variable, **allowlisted con razón** (`openrouter.ts:31`, `openapi/route.ts:763`, `cron/facturar/route.ts:355`, `arranque.ts:48`). Dos guardias: `env.test.ts:97` (el literal) y `:112` (la variable). Corridas: verdes. |
| **ALTO** — `bitacora_auditoria`, 16 escritores a mano · REINCIDENTE | **CERRADO** | **1 escritor**: `bitacora_escritura.ts:109`. **16 llamadores** de `anotarBitacora()` (`admin/campanas.ts:104`, `copiloto-acciones.ts:192`, `llave-api-escritura.ts:71`, `admin-context.ts:149`, `tenant-efectivo.ts:130`, `interruptores.ts:243`, `facturacion/avisar.ts:181`, `conectores/credenciales.ts:40`, `administracion.ts:50`, `facturacion_escritura.ts:216`, `carta_porte_datos.ts:192`, `clientes.ts:779`, `agentes/estrategia.ts:90`, `agentes/definiciones.ts:160`, `agentes/cola.ts:271`, `correo/buzon_escritura.ts:71`). **0 `.from('bitacora_auditoria').insert(` fuera del escritor.** La «guardia estructural» **es real y la abrí**: `bitacora_escritura.test.ts:24` barre `fuentesDeProduccion('src')` y falla con la lista de culpables; `:35` además prohíbe `upsert/update/delete` sobre la tabla. Y el renglón desalineado que sobrevivió dos rondas quedó bien: `avisar.ts:181-184` ahora dice `entidad: 'tenant'` con el porqué escrito en `:174-180`. |
| **BAJO** — «hoy en México» con dos ortografías, 38 sitios · REINCIDENTE | **CERRADO** | **1 definición**: `formato.ts:47` (`hoyMx()`), zona en `formato.ts:34` (`TZ_MX`). El literal `'America/Mexico_City'` **no aparece en ningún archivo de producción fuera de `formato.ts`** (las 6 coincidencias restantes son comentarios y descripciones de OpenAPI). Los dos que nombré ayer se rindieron: `admin/consumo.ts:49` y `admin/qa-storage.ts:246` usan `hoyMx()`. Guardias en `formato.test.ts:244` (la zona) y `:248` (el `en-CA`). |
| **BAJO** — el PDF de dinero importa `@/lib/correo/logo` | **CERRADO** | `liquidacion/pdf.ts:19` e `informes/pdf.ts:16` importan `@/lib/marca/logo`. El papel del dinero ya no depende del subsistema de correo. |
| **MEDIO** — 4.º mapa de conceptos (`gasto-semanal-chart.tsx`) | **CERRADO** | El mapa sigue existiendo (`gasto-semanal-chart.tsx:13`) pero **ya no puede divergir**: `etiquetas_sincronizadas.test.ts:44-67` barre TODO `src/` buscando el patrón y compara clave por clave contra el motor; `:73` ancla que el barrido lo encuentra. Los valores hoy son idénticos al motor. |
| **ALTO** — el aviso al encargado no sabe de la cuenta compartida | **REINCIDENTE, sin un solo cambio** | `avisar.ts:70` sigue llamando `repartir(tickets, sabeOperarlo)` con **2 de 3** argumentos, y `avisar.ts:98` sigue llamando `enrutar(t, …)` con **2 de 3**. El default `cuentaCompartida = false` (`enrutar.ts:78`) y `= () => false` (`enrutar.ts:199`) siguen ahí. `avisarPorFacturar` tiene `args.tenantId` en la mano (`avisar.ts:128,133`) y no llama `cuentasCompartidas()`. Ver hallazgo. |
| **ALTO** — `portalesOperables()` contesta otra pregunta | **REINCIDENTE, sin un solo cambio** | `registro.ts:194-198` sigue devolviendo `PORTALES_CONOCIDOS + COMERCIOS_PILOTABLES`; `piloto_vision.ts:30-32` sigue con «EL PILOTO NO EMITE. NUNCA»; `al_vuelo.ts:283-288` sigue tratando el `ok:true` sin UUID como ensayo exitoso sin sellar nada. Ver hallazgo. |
| **MEDIO** — el rótulo de `necesidad_pct` dos migraciones atrás | **REINCIDENTE, y ahora también sin verificación de base** | `prospectos-mapa.ts:290` dice palabra por palabra lo mismo que ayer. Y encima: la 0140/0142/0143 quedaron **EXENTAS** en `migraciones_verificadas.test.ts:70,72,73` con razón escrita, así que hoy la fórmula generada no la comprueba ni el rótulo ni `verificaciones.sql`. |
| **MEDIO** — `fiscalListo()` copia 5 de las 6 condiciones | **REINCIDENTE, sin un solo cambio** | `admin/flotas/page.tsx:34-38` sigue con los cinco campos y el comentario «Es la condición exacta de `getFiscalDeFlota`»; `administracion.ts:132-135` sigue con la tercera copia; `flota_fiscal.ts:70-76` sigue exigiendo la sexta (correo de facturación). |
| **MEDIO** — `processInbound`, 2,153 líneas | **REINCIDENTE, un poco peor** | La función se partió en dos por el nombre, no por el tamaño: `processInbound` (`processor.ts:631-683`, 53 líneas) delega en `procesarTurno` (`processor.ts:685-2840`): **2,157 líneas, 60 `return`, 34 bloques `try`**, 50 imports en la cabecera. Ayer eran 2,153. |

---

## Hallazgos

### [CRÍTICO] La pantalla nueva de detalle reconstruye la cubeta fiscal del gasto: el motor dice «no deducible» y el renglón dice «Por revisar», y al revés

`src/app/dashboard/[id]/vista.tsx:152-176` (archivo **nuevo**, nace en `c007312`) ·
`src/lib/likida/cuadre/engine.ts:183-210` (`cubetaDe`) ·
`src/app/dashboard/[id]/detalle.tsx:63` y `:339`

**Los dos lados.** `engine.ts:186-199` es explícito y está escrito para que nadie lo
repita:

> *«LA ÚNICA definición de en qué cubeta cae un gasto. Vive aquí, exportada, para que
> nadie la reconstruya. `pdf.ts` la reconstruía por su cuenta desde `diferencias` con UN
> solo criterio —el tipo de diferencia— y se saltaba el segundo, la ausencia de UUID
> … `diferencias` es una vista PARCIAL de la decisión; esta función es la decisión.»*

`pdf.ts:423` obedece (`cubetaDe(g, …)` con su comentario en `:420-422`). El archivo
nuevo hace **exactamente** lo prohibido: `estadoRenglon(g, tipos)` (`vista.tsx:166-177`)
decide desde `tipos: string[]` —la vista parcial— con dos `Set` escritos a mano:

- `TIPOS_MALOS` (`:153-157`), rotulado *«Tipos que el motor marca como NO deducibles de
  plano»*: `cfdi_cancelado, cfdi_efos, cfdi_no_encontrado, comprobante_no_fiscal,`
  `combustible_efectivo, efectivo_sobre_tope, efectivo_no_elegible,`
  `complemento_hidrocarburos, duplicado, monto_invalido`.
- El motor (`engine.ts:183`, `NO_DEDUCIBLE_ISR`): `rfc_receptor, cfdi_cancelado,`
  `cfdi_efos, cfdi_no_encontrado, complemento_hidrocarburos, efectivo_sobre_tope,`
  `efectivo_no_elegible`.

La lista del panel **no es ninguna de las dos del motor**: le falta `rfc_receptor`, y le
sobran cuatro, entre ellos `combustible_efectivo`, que el motor pone en `POR_CONFIRMAR`
(`engine.ts:184`) y sobre el que `engine.ts:1061-1066` deja escrita la advertencia por su
nombre: *«esta lista NO dice qué gasto es deducible para ISR … Se llamaba NO_DEDUCIBLE y
esa confusión casi cuesta un bug caro: `combustible_efectivo` SÍ es deducible hasta el
15% (RFA 2026 regla 2.9)»*. También se salta el segundo criterio que el motor nombra: sin
`cfdiUuid` no hay deducción todavía (`engine.ts:207-209`).

**Escenario con valores.** Liquidación del viaje `VJ-2026-0311`, tres renglones:

1. Factura de refacciones por **$6,400** timbrada al RFC del operador →
   `rfc_receptor` (`engine.ts:604`). El motor: `cubetaDe` = `no_deducible`, y el bloque
   «De lo comprobado, cuánto es deducible» de la MISMA pantalla
   (`detalle.tsx:253-265`, alimentado por `filasDeducibilidad`, que lee los totales que
   el motor repartió) imprime **«No deducible $6,400»**. La tabla de comprobantes, doce
   centímetros abajo, pinta ese renglón como **«Por revisar»** en ámbar
   (`vista.tsx:173`), porque `rfc_receptor` no está en `TIPOS_MALOS` ni en `TIPOS_TOPE`.
2. Diésel en efectivo por **$1,200** dentro del 15% del ejercicio →
   `combustible_efectivo`. El motor: `por_confirmar` (recuperable: se puede timbrar). La
   tabla lo pinta **«No deducible»** en rojo.
3. El contralor suma los renglones rojos de la tabla y no le da el total «No deducible»
   de arriba. Ninguna de las dos cifras es un bug de suma: son **dos definiciones
   distintas de la misma palabra en la misma pantalla**.

**Intento de refutación (falló).** ¿Hay prueba que ancle `estadoRenglon`? **Ninguna**:
`grep` de `estadoRenglon|TIPOS_MALOS` en `*.test.ts*` no devuelve nada, mientras
`cubetaDe` tiene cinco archivos de prueba. ¿Lo cubre el barrido de etiquetas?
No: `etiquetas_sincronizadas.test.ts:43` solo busca mapas llamados `CONCEPTO`/
`CONCEPTO_LABEL`. ¿Es una etiqueta cosmética y no una afirmación fiscal? El texto que
imprime es literalmente `'No deducible'` y el comentario del `Set` dice *«Tipos que el
motor marca como…»* — afirma hablar por el motor.

**Consecuencia.** El comprador es el contralor y la promesa es que lo del panel y lo del
PDF son la misma cuenta. Aquí el panel contradice al PDF **y a sí mismo**, en el sentido
caro las dos veces: le regala una deducción que perdió (caso 1, $6,400) y le quita una
que conserva (caso 2, $1,200). Para quien mantenga esto, el motor ya dejó escrito que
esto no se hace y el archivo nuevo no lo cita.

**Causa raíz probable.** La vista se construyó desde `diferencias` (lo que trae
`analytics.ts`) en vez de llamar a `cubetaDe`, que es la función exportada para esto y
que el PDF ya consume.

---

### [ALTO] El contrato del sufijo de previsualización tiene cuatro implementaciones, y la del sidebar inventa `?vista=demo`: la flota que el superadmin eligió se cambia sola al primer clic

`src/app/dashboard/sidebar-nav.tsx:69-83` (`useSufijoYRol`) ·
`src/app/dashboard/sufijo.ts:20-26` (`sufijoTenant`, el canónico) ·
`src/app/dashboard/page.tsx:36-37` (tercera copia, en línea) ·
`src/lib/auth/tenant-efectivo.ts:70-81` (`sufijoPrevisualizacion`) ·
`src/lib/auth/guard.ts:49-53`

**Los cuatro lados.** Las cuatro dicen por escrito ser «el MISMO contrato»
(`sufijo.ts:7-10`, `sidebar-nav.tsx:65-68`, `page.tsx:33-35`, `tenant-efectivo.ts:57`).
Tres difieren del canónico:

- `sidebar-nav.tsx:76` añade una rama que ninguna otra tiene:
  `: rol === 'superadmin' ? '?vista=demo' : ''`.
- `sidebar-nav.tsx:74-78` y `page.tsx:36-37` **no** hacen `encodeURIComponent`;
  `sufijo.ts:21-25` sí.
- `sufijoPrevisualizacion` usa `URLSearchParams` y se apaga si la sesión real no es
  superadmin.

**Qué se desincroniza, y cómo se ve.** La rama de `:76` era cierta cuando se escribió:
antes, un superadmin sin parámetros no tenía tenant y `guard.ts` lo rebotaba. Desde que
existe el selector firmado (`admin-context.ts:102`, `leerSeleccionFlota()`) **sí lo
tiene**, y el orden de `guard.ts` lo decide al revés de lo que el sidebar supone:
`:49` atiende `?vista === 'demo'` y devuelve `tenantDemo()` **antes** de llegar a `:51`,
donde leería la selección.

**Escenario con valores.** Javier entra a `/admin/elegir-flota`, elige *Transportes del
Bajío* (cookie httpOnly firmada, y queda en bitácora). `destinoSeguro`
(`admin-context.ts:166-172`) lo manda a **`/dashboard` sin query string**.

1. `/dashboard`: `requireSessionTenant` no ve params → `leerSeleccionFlota()` → tenant =
   Bajío. Correcto. Ve las cifras de Bajío.
2. El sidebar se pinta con `rol='superadmin'` (`layout.tsx:49` pasa `sesion.rol`) y sin
   params → `useSufijoYRol` devuelve `'?vista=demo'`. **Los 20 links del menú quedan
   apuntando a `?vista=demo`.**
3. Javier hace clic en **Viajes** → `/dashboard/viajes?vista=demo` →
   `resolverTenantEfectivo` → `requireSessionTenant(dest, sp)` → `guard.ts:49` →
   `tenantDemo()`. La pantalla enseña los viajes de la **flota demo**.
4. Nada lo dice: `tenantNombre` solo se resuelve para `?tenant=`
   (`tenant-efectivo.ts:179-183`), así que con `?vista=demo` sale `null` y el encabezado
   no cambia de nombre. Y como `?vista=demo` no se firma a propósito
   (`tenant-efectivo.ts:184-186`), tampoco queda en la bitácora que dejó de mirar a
   Bajío.

**Intento de refutación (falló).** ¿Hay prueba del contrato cruzado? `sufijo.test.ts`
prueba **solo** `sufijoTenant`; `guard.test.ts` y `tenant-efectivo.test.ts` no montan el
sidebar. Ninguna prueba compara las cuatro. ¿Los links dentro de la página lo arreglan?
No: esos usan `sufijoTenant`, que devuelve `''` en este estado — o sea que la página y su
menú emiten **sufijos distintos para el mismo estado**, que es la contradicción.

**Consecuencia.** El único usuario del producto hoy es Javier enseñándolo; la ruta que
elige una flota real queda deshecha en silencio por el primer clic del menú, y lo que
queda en pantalla es la flota demo con el mismo marco. Es literalmente el fallo que
`sufijo.ts:2-5` declara existir para impedir («*el siguiente clic te devuelve al tenant
demo sin avisar, viendo cifras de otra empresa bajo el mismo encabezado*»), causado por
la copia que no es esa.

**Causa raíz probable.** El contrato se replicó en vez de exportarse porque el sidebar es
Client Component; cuando el selector de flota cambió la premisa («superadmin sin params
no tiene tenant»), solo se actualizó el lado servidor.

---

### [ALTO] «Quién factura este ticket» sigue con dos opiniones: el aviso al encargado no sabe de la cuenta compartida · REINCIDENTE (c2, ALTO 1)

`src/lib/likida/facturacion/avisar.ts:70` y `:98` ·
`src/lib/likida/facturacion/enrutar.ts:78`, `:106`, `:199` ·
`src/lib/likida/facturacion/al_vuelo.ts:233`, `:411`

Sin un solo cambio en el delta. `enrutar(t, sabeOperarlo, cuentaCompartida = false)` es
la única fuente de verdad de quién factura; `al_vuelo.ts:233` y `:411` sí le pasan el
tercer argumento (vía `cuentasCompartidas(args.tenantId)`), y `avisar.ts:70` y `:98`
siguen llamándola con dos. `enrutar.ts:106` mira `requiereCuenta && !cuentaCompartida`
**antes** que todo, así que con el default el ticket sale por `requiere_cuenta`.

**Escenario con valores.** *Transportes del Bajío* comparte su cuenta de **OXXO Gas** en
`/dashboard/conexiones` (`conector_credencial`, `activo = true`), `FACTURACION_PILOTO=si`.
Ticket de OXXO Gas de **$1,840**, 20 días de plazo:
- el cron (`al_vuelo.ts:233`) → `conCuenta = true` → `via: 'automatico'`, el piloto entra
  con la credencial;
- el aviso (`avisar.ts:98`) → `cuentaCompartida = false` → `via: 'mensaje'`,
  `motivo: 'requiere_cuenta'` → al encargado le llega *«Ese portal pide cuenta, por eso no
  se pudo hacer solo»*.

Son **10 comercios** con `requiereCuenta` y ficha completa: `oxxo_gas`, `g500`,
`petromax`, `red_estatal_autopistas`, `la_gas`, `pinfra`, `gorm_brentec`, `iave`,
`tag_pase`, `televia`.

**Consecuencia.** La flota entrega su contraseña para dejar de recibir estos mensajes y
los sigue recibiendo con el motivo al revés; con `FACTURACION_MODO=emitir` el encargado
puede entrar a facturar a mano el ticket que el robot está trabajando. El encabezado de
`avisar.ts:61-64` promete justo lo contrario. `avisar.test.ts` sigue sin un solo caso con
cuenta compartida.

**Causa raíz probable.** Sin cambio: el parámetro nació con default en vez de obligatorio,
al revés que su hermano `sabeOperarlo`, que se hizo obligatorio a propósito «*y por eso
rompe la compilación de quien no lo pase*» (`enrutar.ts:56`).

---

### [ALTO] `portalesOperables()` responde una pregunta distinta de la que `enrutar` hace · REINCIDENTE (c2, ALTO 2)

`src/lib/likida/facturacion/adaptadores/registro.ts:194-198` ·
`src/lib/likida/facturacion/enrutar.ts:54`, `:138` ·
`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:30-32` ·
`src/lib/likida/facturacion/al_vuelo.ts:283-288`

Sin un solo cambio. `sabeOperarlo` pregunta «¿hay adaptador ESCRITO?» (`enrutar.ts:54`) y
se alimenta de `portalesOperables()`, que con la palanca puesta añade las 20 fichas
pilotables. Pero el piloto **no puede cerrar una factura por diseño**
(`piloto_vision.ts:30-32`), y su `ok: true` sin `cfdiUuid` cae en la rama del ensayo
exitoso (`al_vuelo.ts:283-288`): `facturado: false`, `cfdi_uuid` sin escribir, nada
sellado.

**Escenario con valores.** `FACTURACION_PILOTO=si`, ticket de **Enerser** por **$3,214**
con su referencia leída y 11 días de plazo, portal sin CAPTCHA: `enrutar` →
`via: 'automatico'` → el ticket **sale del aviso al encargado** (`avisar.ts:74`), el
piloto lo llena y se detiene, `getPorFacturar` (`pendientes.ts:126-137`) lo vuelve a
seleccionar la hora siguiente y paga otra tanda de llamadas de visión, hasta que vence.
Son **10 comercios** sin cuenta y con ficha completa los que cambian de camino al
encender la palanca. El caso del CAPTCHA sí se salva (`piloto_vision.ts:143-149` →
`motivoDeBloqueo` → `bloquear()`); los que se pierden son justo los portales que el
piloto **sí** logra llenar.

**Consecuencia.** El `sin_robot` que se escribió para acabar con este silencio
(*«El silencio es el modo de falla que este repo persigue en todos lados menos aquí»*,
`enrutar.ts:68`) queda inalcanzable para esos 10 comercios con una variable de entorno
que `.env.example` describe como opción normal.

**Causa raíz probable.** `portalesOperables()` mezcla «sé abrir este portal» con «puedo
cerrar la factura de este portal», y `enrutar` solo tiene un hueco donde enchufarlos.

---

### [MEDIO] El rótulo de `necesidad_pct` sigue dos migraciones atrás, y ahora la fórmula tampoco la verifica la base · REINCIDENTE (c2, MEDIO 1)

`src/lib/admin/prospectos-mapa.ts:283-291` ·
`supabase/migrations/0142_*.sql`, `0143_*.sql` ·
`src/lib/likida/migraciones_verificadas.test.ts:70,72,73`

El comentario de `CRITERIO_SCORES` (`:283-284`) sigue afirmando que el pie del mapa
enseña *«misma fuente que el cálculo, no una copia que se desincronice»*, y `:290` sigue
diciendo «auxiliar administrativo +50». La base, tras 0142 y 0143, dice otra cosa:
`auxiliar administrativ` vale +50 **solo si además** nombra
`viaje|flota|diesel|combustible|caseta|embarque|operativ|mesa de control`, y
`liquidaci` pierde el +50 si la vacante también nombra `de pagos` o `compensación`.

**Lo que cambió desde ayer, y empeora.** Tras el merge, la 0140/0142/0143 quedaron
**EXENTAS** en `migraciones_verificadas.test.ts:70,72,73` («*es un SCORE de prospección…
un valor mal reordena la lista, no corrompe*»). O sea que la fórmula generada hoy **no la
comprueba ni `verificaciones.sql` ni el rótulo**: las dos redes que podían cazar la
divergencia están abiertas.

**Escenario con valores.** Prospecto *Qualtia Alimentos*, vacante «Auxiliar
Administrativo», `num_unidades = 25`. La base calcula `25 + 25 = 50` y pinta
**Necesid. 50%**; el `title` del encabezado (`cerebro.tsx:705`) promete 75.

**Consecuencia.** «Un rótulo tiene que ser verdad» en la pantalla desde la que se decide
a quién llamar; y para quien mantenga esto, el comentario le dice que no hace falta
revisar la prosa cuando cambia la fórmula.

**Causa raíz probable.** La fórmula vive en SQL y su explicación en TypeScript, sin nada
que las case — ni un test contra el `comment on column` que la migración sí escribe.

---

### [MEDIO] `fiscalListo()` copia cinco de las seis condiciones de `getFiscalDeFlota` y se anuncia como «la condición exacta» · REINCIDENTE (c2, MEDIO 2)

`src/app/admin/flotas/page.tsx:34-38` · `src/lib/likida/administracion.ts:132-135` ·
`src/lib/likida/facturacion/flota_fiscal.ts:63-77`

Sin cambio. La verdad exige **seis** cosas: los cinco del receptor **y** un correo de
facturación —un `app_user` con rol `contador` o `flota_admin` con email
(`flota_fiscal.ts:70-76`, `ROLES_QUE_RECIBEN` en `:45`)—. Sin correo,
`getFiscalDeFlota` devuelve `flota: null` y la flota no se registra para facturar. La
pantalla reimplementa cinco (`page.tsx:35-37`) con el comentario «*Es la condición exacta
de getFiscalDeFlota*», y `administracion.ts:132-135` tiene la tercera copia.

**Escenario con valores.** Javier da de alta *Transportes del Bajío* con los cinco datos
fiscales y deja vacío «Correo del administrador». `fiscalListo(fd)` = `true` → el aviso
omite el `OJO`. Javier lo resuelve dando de alta a un **`encargado`**, rol legítimo que no
está en `ROLES_QUE_RECIBEN`. Semanas después, el cron de facturación entra, calcula
`falta = ['no hay a dónde mandar el CFDI…']`, no abre navegador y responde 200. Ni un
ticket facturado, y el único aviso que existía se calló.

**Consecuencia.** Es el hueco que `administracion.ts:130-134` dice haber cerrado —«*el
hueco aparecía semanas después, como un cron que no hacía nada, sin un error que
mirar*»— reabierto por la copia de la condición en la misma pantalla que lo arregla.

**Causa raíz probable.** El alta se arregló escribiendo un tercer predicado en vez de
preguntarle a `getFiscalDeFlota`.

---

### [MEDIO] El turno de WhatsApp sigue siendo una función de 2,157 líneas: la partida le cambió el nombre, no el tamaño · REINCIDENTE (c2, MEDIO 3)

`src/lib/likida/processor.ts:685-2840` (`procesarTurno`)

El delta partió `processInbound` en dos: `:631-683` (53 líneas: reloj, claim,
liberación) y **`procesarTurno` (`:685-2840`), 2,157 líneas, 60 `return`, 34 bloques
`try`**, en un archivo de 2,840 líneas con 50 imports. Ayer la función grande medía
2,153. El archivo además se salta la frontera de `repo.ts` en `:110` (`.from('viaje')`),
`:114` (`.from('posicion')`) y `:234` (`.from('operador')`).

**Qué se desincroniza, y cómo se ve.** El CRÍTICO que ayer levanté aquí y que hoy está
cerrado es la demostración: el bloque que lo causó entró entre `getOpenViaje` y el gate de
privacidad, y su efecto se manifestaba 1,900 líneas más abajo en `saveConversation`. No
hay lectura razonable que ponga esos dos puntos en la misma pantalla; por eso el arreglo
necesitó tocar tres archivos y por eso la prueba que lo cubre tuvo que mockear cinco
módulos.

**Consecuencia.** Es el archivo más caro de cambiar del repo, está en el camino del
dinero, y este delta lo dejó cuatro líneas más largo.

**Causa raíz probable.** El pipeline entrante nunca se partió por fase
(identificar → autorizar → despachar por tipo → responder); cada funcionalidad nueva
encuentra sitio *dentro* del `if` que le queda cerca.

---

### [BAJO] `reengancharPendiente` quedó en el árbol sin nadie que lo pase

`src/lib/likida/despacho_wa.ts:238` y `:362` · `src/lib/likida/asignar_wa.ts:298` y
`:359` · `src/lib/likida/processor.ts:778`, `:872`

Los dos módulos aceptan `opciones: { reengancharPendiente?: boolean }` y ramifican con él
(`despacho_wa.ts:362`, `asignar_wa.ts:359`). **Ningún llamador de producción lo pasa**:
los dos únicos call sites (`processor.ts:778` y `:872`) usan la forma de `master`
(`incluirDespacho`), y las únicas menciones restantes están en
`despacho_wa.test.ts:206,215`.

**Qué se desincroniza, y cómo se ve.** Es una rama que solo las pruebas ejercitan: la
suite verde afirma un comportamiento que la aplicación no puede alcanzar. Quien mañana
lea `despacho_wa.ts:228-236` va a encontrar la explicación de cuándo se usa
(«*`reengancharPendiente: false` cuando quien escribe trae un VIAJE ABIERTO*») y va a
concluir que ese caso está manejado ahí, cuando lo maneja `processor.ts:872` con otro
mecanismo, dos archivos más allá.

**Consecuencia.** Deuda de la peor clase para quien mantiene: código defensivo con
prueba que lo respalda y sin usuario, que se lee como invariante viva.

**Causa raíz probable.** El merge de `673496f` tomó el lado de `master` en `processor.ts`
—decisión correcta, es más amplia— y no barrió el parámetro que el lado de la rama había
añadido río abajo.

---

### [BAJO] `LibroDelViaje` — 333 líneas de pantalla de dinero sin un solo llamador, y con el agujero de su guardia ya escrito adentro

`src/app/dashboard/viajes/libro.tsx:70` · `src/app/dashboard/dinero_por_area.test.ts:57-80`

`export function LibroDelViaje` no tiene **ningún** consumidor: la única referencia fuera
del archivo es un comentario (`lib/likida/libro_viaje.ts:45`). No tiene prueba propia. El
delta reescribió el registro de viajes entero (`viajes/vista.tsx`, +186/−67) y no lo
integró.

**Qué se desincroniza, y cómo se ve.** Su propio encabezado (`:47-50`) deja escrito el
agujero que hereda quien lo integre: *«`dinero_por_area.test.ts` escanea SOLO `page.tsx` y
`vista.tsx` … este archivo imprime `mxn(` y queda fuera de ese escaneo»*. Hoy eso ya no es
cierto —`dinero_por_area.test.ts:75-77` escanea **todos** los `.tsx` del directorio desde
el 14-ago— así que el archivo muerto está avisando de un peligro que ya se cerró, y quien
lo lea va a hacer trabajo que no hace falta o va a desconfiar del guardia que sí funciona.

**Consecuencia.** 333 líneas que se compilan, se lintean y se leen en cada búsqueda, con
una advertencia caducada adentro y sin nadie que las ejecute.

**Causa raíz probable.** La vista se escribió antes que la página que la iba a montar, y
la página se rehízo por otro camino.

---

### [BAJO] Tres copias del mapa de estatus de viaje, dos de ellas en el mismo directorio, y la exportada al lado sin importar

`src/app/dashboard/viajes/vista.tsx:31-35` (reescrita por `c007312`) ·
`src/app/dashboard/viajes/libro.tsx:55-59` ·
`src/app/dashboard/resumen-visual.tsx:103-107` (la exportada)

`resumen-visual.tsx:98-102` exporta `PILL_ESTATUS` **precisamente para que no haya dos**,
y lo dice: *«Exportado porque `tablero-operacion.tsx` pinta el mismo estatus: dos mapas se
separan al primer estatus nuevo, que es exactamente como se rompió `CONCEPTO` dos veces»*.
`tablero-operacion.tsx:3` lo importa. Las otras dos no: `viajes/vista.tsx:31` la
reescribió **a la misma forma exacta** (`{ etiqueta, estado }`) en este delta y siguió sin
importar, y `viajes/libro.tsx:55` tiene una tercera con `fg`/`bg` a mano.

**Qué se desincroniza, y cómo se ve.** Hoy los tres coinciden en los tres valores. El
día que `viaje_estatus_dominio` gane un cuarto valor —o que alguien renombre «En cuadre»—
el Resumen y el Registro van a decir palabras distintas del mismo viaje, con la suite
verde: `etiquetas_sincronizadas.test.ts:43` solo busca mapas llamados
`CONCEPTO`/`CONCEPTO_LABEL`, y `estatus.test.ts` cubre el otro dominio (el de
`liquidacion`), no éste.

**Consecuencia.** Es la reincidencia que el repo ya pagó dos veces con `CONCEPTO`,
montada en el hueco que el barrido nuevo deliberadamente no cubre.

**Causa raíz probable.** El guardia se escribió para *un* nombre de mapa en vez de para la
clase «mapa de etiquetas de un dominio cerrado», y el archivo nuevo se escribió al lado
del consumidor.

---

## Lo que revisé y está bien

- **El motor de dinero sigue puro.** Cero `supabase|createClient|fetch(|process.env` en
  los archivos no-test de `cuadre/` y `liquidacion/`.
- **`formato.ts` sigue siendo frontera dura**, ahora con dos puertas más: además del
  `toLocaleString('es-MX')`, `formato.test.ts:244` prohíbe el literal de la zona y `:248`
  el cálculo del día con `en-CA` fuera del módulo. Corrido: 31/31 verde.
- **`env.test.ts` (11/11) y `bitacora_escritura.test.ts` (7/7) verdes**, y los tres
  guardias estructurales que sostienen los cierres de arriba son ejecutables, no prosa:
  los tres barren `src/` y fallan con la lista de culpables.
- **`etiquetas_sincronizadas.test.ts` (8/8) verde**, y su barrido nuevo (`:44-67`) es el
  mecanismo correcto: compara clave por clave contra `engine.ts` en vez de anclar rutas.
- **`avisar.ts:174-184` corrigió el renglón de bitácora desalineado** —`entidad: 'tenant'`
  con `actor: 'sistema'` declarado— que sobrevivió dos rondas.
- **La partida de `wa_conversacion` quedó bien resuelta:** los tres escritores
  (`despacho_wa.ts:115`, `asignar_wa.ts:173`, `conv.ts:475`) hacen lee-modifica-escribe,
  dejan escrita la carrera que aceptan y por qué (`conv.ts:467-473`), y el upsert ya no
  manda `viaje_id`/`operador_id` para no nulificarlos.
- **`api/v1/viajes/[id]` y su `/contribucion` consumen `getLibroViaje`**, o sea que el
  criterio del libro mayor sí tiene un dueño único en `lib/likida/libro_viaje.ts`; lo que
  no tiene consumidor es la vista.
- **`getViajesRegistro` y `getLiquidacionesDeViajes`** (`analytics.ts:1042`, `:1102`)
  pasan por `exigir()`: la consulta caída no se lee como «no hay viajes».
- **`npx tsc --noEmit -p .` limpio.**

---

## Lo que NO alcancé a revisar

- **`npm test` completo y `npm run lint`** — corrí 57 pruebas dirigidas (los cuatro
  archivos de guardia) y el typecheck. No puedo afirmar el estado de la suite entera.
- **El `.from(` archivo por archivo.** Hoy: **120 archivos / 553 llamadas** fuera de
  `repo.ts`+`pg.ts` (ayer 122/583 — bajó, pero no verifiqué de dónde). Sigue sin saberse
  cuántas pasan por `acotada()` o `traerTodo()`; el corte silencioso de 1,000 filas de
  PostgREST puede estar sin cubrir donde no abrí.
- **`detalle.tsx` (424 líneas) por dentro.** Lo recorrí por los dos puntos donde consume
  el motor (`:63` `filasDeducibilidad`, `:339` `estadoRenglon`); no revisé si sus 15
  subcomponentes repiten piezas de `admin/ui/kit`.
- **El BAJO de `conector_credencial` (dos módulos dueños, `cuentas.ts` sin `acotada`) y el
  BAJO del piloto que no extiende `AdaptadorPlaywrightBase`** — los dejo anotados de la
  pasada anterior sin re-verificar; no cabían en esta corrida y no cambiaron de commit.
- **`auth/callback/route.ts` y `motivo_login.ts`** — siguen sin abrirse desde la ronda 18.
- **El barrido de columnas que existen en la base y no en el tipo del dominio** (el patrón
  del `cfdi_orden`): sigue sin hacerse, ahora con 146 migraciones.
