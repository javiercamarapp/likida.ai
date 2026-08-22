# Frontend — auditoría 18 · continuación 3

**Nota: 6/10** (antes 5). Razón del movimiento: **se atacó y subió**. Los siete
hallazgos abiertos de la ronda 18 se cerraron los siete, verificados uno por uno
abriendo el archivo, y cinco de ellos quedaron anclados con prueba propia
(`ventana-periodo.test.ts`, `rotulo-diferencia.test.ts`, `arco/vencimiento.test.ts`,
`estado.test.ts`, `enviado_con_salida.test.ts`). No sube más porque el mismo PR
que los cerró trajo `c007312` —un detalle de liquidación v2 de 425 líneas— y ese
código nuevo hizo exactamente lo que el rubro tiene como modo de falla dominante:
escribió **una copia a mano del veredicto del motor** y ya diverge en dos claves,
en la pantalla donde el contralor mira su dinero. Los nueve hallazgos de la
continuación 2 siguen abiertos los nueve (no estaban en el alcance del PR #38,
pero abiertos están).

**El riesgo mayor hoy:** en `/dashboard/[id]` conviven dos opiniones sobre el
mismo peso. La caja «De lo comprobado, cuánto es deducible» viene del motor; la
píldora de cada renglón viene de un `Set` literal copiado a diez centímetros de
distancia, y para un diésel en efectivo la caja dice «Por confirmar — se puede
recuperar» mientras el renglón dice «No deducible».

---

## Verificación de los abiertos de la pasada anterior

### Los siete de la ronda 18 — **7/7 CERRADOS**

1. **[ALTO] Un selector rotula cinco ventanas de tiempo distintas (A11)** —
   **CERRADO.** `src/app/dashboard/ventana-periodo.ts:33-40` (`rotuloVentana`) y
   `src/app/dashboard/panel-periodo.tsx:56-58`, `:79`, `:96`, `:106`, `:118`,
   `:141`: cada tarjeta imprime su ventana real junto al título («últimos 7 días»
   para Viajes/Actividad, «últimas 52 semanas» para Liquidado en Histórico). Las
   dos escalas están declaradas por separado (`DIAS_POR_MODO` :26,
   `SEMANAS_POR_MODO_VISTA` :31) y coinciden con `analytics.ts:549`
   (`SEMANAS_POR_MODO = {5,13,52}`). `ventana-periodo.test.ts` lee el fuente de
   `analytics.ts` para que no se desfasen en silencio.
2. **[ALTO] `StatCard` escribe «0% · sin movimiento» cuando no pudo comparar
   (A12)** — **CERRADO.** `src/app/admin/ui/kit.tsx:181-187`: la rama
   `delta === null` ahora imprime **«sin periodo comparable»**; el literal
   `0% · sin movimiento` ya no existe en el archivo. Además `:160-162` separa el
   0 % REAL (comparó y no cambió → gris + «sin cambio vs periodo anterior») del
   no-medible, que sale con «—» en `--faint` (`:148-151`).
3. **[ALTO] Una consulta caída del Resumen se pinta como «aún no hay gastos» (A13)**
   — **CERRADO, por dos lados.** `panel-periodo.tsx:108-114` distingue
   `gastoModo === null` («No se pudo cargar esta gráfica») de la serie en cero
   («Aún no hay gastos capturados»), y lo mismo hacen Viajes (`:83`), Liquidado
   (`:123`) y Top rutas (`:148`). Y `estado.ts:27-35` incorporó las siete
   consultas secundarias (`secundarias`), con el call site pasándolas de verdad
   en `inicio-contenido.tsx:149`.
4. **[ALTO] «Vencen pronto (≤ 5 días)» cuenta las que ya vencieron** —
   **CERRADO.** `src/app/dashboard/arco/vencimiento.ts:18-27` separa `yaVencio`
   (`v < hoy`) de `venceDentroDe` (`v >= hoy && v <= hoy+5`), y
   `arco/page.tsx:72-73` usa cada una en su tarjeta; la tercera tarjeta
   «Vencidas sin responder» (`:90`) cuenta lo vencido aparte.
5. **[MEDIO] `costoPorViaje === null` se imprime como «$0.00»** — **CERRADO.**
   `src/app/dashboard/kpi-periodo.tsx:70` pasa `valor={valorActual}` sin `?? 0`,
   y `kit.tsx:148-151` pinta «—» en gris para `valor === null`.
6. **[MEDIO] El mapa `TIPO_DIFERENCIA` cubre 2 de ~30 tipos y uno no existe** —
   **CERRADO.** `src/app/dashboard/agentes/liquidacion/rotulo-diferencia.ts:18-55`
   es `Record<TipoDiferencia, string>` con los 35 tipos declarados (la clave
   muerta `sin_comprobar` ya no está) y `rotuloDiferencia()` (`:59-64`) degrada a
   texto legible en vez de a vacío. Comparado clave por clave contra
   `src/types/likida.ts:69-110`: **coinciden los 35, sin sobrantes ni faltantes.**
7. **[BAJO] `/login?enviado=1` es un estado terminal sin salida** — **CERRADO.**
   `src/app/login/page.tsx:235-256`: el bloque de «enviado» va **encima** del
   formulario (`{sp?.enviado && (…)}` seguido de un `<>` incondicional con
   Google, el campo y el botón), y el propio aviso dice «¿No llega o te
   equivocaste de correo? Vuelve a escribirlo abajo». Anclado por
   `src/app/login/enviado_con_salida.test.ts`.

### Los nueve de la continuación 2 — **9/9 REINCIDENTES**

Ninguno estaba en el alcance del PR #38 (esa campaña atacó `hallazgos.md`, no
`*-c2.md`), pero abiertos siguen. Verificados uno por uno hoy:

1. **[ALTO] El panel del cliente enruta con dos entradas menos que el motor** —
   **REINCIDENTE.** `src/app/dashboard/agentes/facturas/page.tsx:103`
   (`portalesConAdaptador={PORTALES_CONOCIDOS}`) y `vista.tsx:60-61`
   (`enrutar(t, …includes(t.comercio.clave) : false)`, sin tercer ni cuarto
   argumento → `cuentaCompartida` en `false`).
2. **[MEDIO] El rótulo de «Necesidad» describe la fórmula de la 0140** —
   **REINCIDENTE.** `src/lib/admin/prospectos-mapa.ts:293` sigue con el texto
   «vacante de liquidación/cuadre/auxiliar administrativo +50 (cualquier otra
   vacante +25), flota ≥20 +25».
3. **[MEDIO] El mismo prospecto enseña dos «% Cierre»** — **REINCIDENTE.**
   `prospectos-mapa.ts:475` (mapa) llama `scoreCierre` **sin**
   `personasVerificadas`; `:570-573` (ficha) sí lo pasa
   (`filter((x) => x.confianza !== 'baja')`). El `select` del mapa (`:427`)
   sigue sin traer `prospecto_persona`.
4. **[MEDIO] «Redactar con IA» falla en silencio** — **REINCIDENTE.**
   `src/app/admin/mapa-prospectos/[id]/detalle.tsx:80` (`if (!r.ok) return;`) y
   `cerebro.tsx:406` idénticos.
5. **[MEDIO] Contraste de la ficha nueva** — **REINCIDENTE.** `detalle.tsx:158-159`
   (`CONFIANZA_COLOR` sobre `color-mix(… 14%, var(--surface))` en 10 px),
   `:235-236` (`#6d28d9` sobre `color-mix(#7c3aed 8%…)`), `:256`
   (`#fff` sobre `#16a34a`). Siguen siendo hex a mano, fuera del alcance de
   `contraste.test.ts`.
6. **[MEDIO] Dos definiciones de «duplicado»** — **REINCIDENTE.**
   `prospectos-mapa.ts:445` (`.filter((p) => !/DUPLICADO:/.test(p.notas ?? ''))`)
   contra `:552` (`if (!p || p.duplicado_de) return null;`).
7. **[MEDIO] «Te toca a ti» ya no es lo que su subtítulo dice** — **REINCIDENTE.**
   `src/app/dashboard/agentes/facturas/vista.tsx:116`, texto intacto.
8. **[BAJO] El enlace a LinkedIn no normaliza el esquema** — **REINCIDENTE.**
   `detalle.tsx:167` (`href={per.linkedin}`) contra el vecino `:191` que sí
   resuelve el caso.
9. **[BAJO] El alta de flota dice «los CINCO y ya factura»** — **REINCIDENTE.**
   `src/app/admin/flotas/page.tsx:34-38` sigue diciendo «Es la condición exacta
   de `getFiscalDeFlota`» sobre cinco campos, y
   `facturacion/flota_fiscal.ts:65-78` sigue exigiendo además el correo de
   facturación.

---

## Hallazgos

### [ALTO] La píldora de cada comprobante contradice a la caja de cubetas que tiene diez centímetros arriba: el detalle v2 copió a mano el veredicto del motor y ya diverge en dos claves

`src/app/dashboard/[id]/vista.tsx:153-157` (`TIPOS_MALOS`, código NUEVO de
`c007312`) contra `src/lib/likida/cuadre/engine.ts:183-184`
(`NO_DEDUCIBLE_ISR` / `POR_CONFIRMAR`). Se pintan en la **misma** página:
la caja de cubetas en `src/app/dashboard/[id]/detalle.tsx:253-273` y la píldora
por renglón en `:339` + `:359`.

El comentario de `vista.tsx:152` dice textual «Tipos que el motor marca como NO
deducibles de plano». No es la lista del motor. Comparadas:

| tipo | motor (`engine.ts:183-184`) | panel (`vista.tsx:153-157`) |
|---|---|---|
| `rfc_receptor` | **no_deducible** | ausente → cae a «Por revisar» |
| `combustible_efectivo` | **por_confirmar** | «No deducible» |
| `comprobante_no_fiscal` | por_confirmar / deducible | «No deducible» |
| `duplicado`, `monto_invalido` | ni una ni otra (se excluyen del total) | «No deducible» |

**Escenario 1, con valores — rojo inventado.** Flota recién dada de alta que aún
no declaró dedicación ni régimen, así que `input.facilidad15` es `undefined`.
Entra un ticket de diésel de **$3,400** con `formaPago: '01'`. El motor emite
`combustible_efectivo` con `monto: 0` (`engine.ts:474-478`) y `cubetaDe`
(`:203`) lo manda a **por_confirmar** — el propio motor explica en `:1188-1194`
por qué se niega a condenarlo: «ponerlo en "no deducible" le quita dinero al
cliente». En pantalla, la caja imprime **«Por confirmar $3,400 — Falta timbrar la
factura o acreditar el medio de pago. Se puede recuperar.»**
(`deducibilidad.ts:76-82`), y el renglón del **mismo** ticket, en la tabla de
abajo, imprime la píldora roja **«No deducible»**. Dos veredictos incompatibles
sobre el mismo peso, en la misma pantalla, sin scroll.

**Escenario 2, con valores — rojo que falta.** Un hospedaje de **$11,600**
timbrado al RFC del chofer. El motor emite `rfc_receptor`
(`engine.ts:604`, `gastoId` incluido), `cubetaDe` lo manda a **no_deducible**, y
la caja de arriba dice «No deducible $11,600» en `var(--bad)`. La píldora del
renglón: `rfc_receptor` no está en `TIPOS_MALOS`, no es `sin_cfdi`, no está en
`TIPOS_TOPE` → cae al último `if` y sale **«Por revisar»** en ámbar. El renglón
más caro de la liquidación es el que se ve menos grave de la columna.

Intenté refutarlo: `getLiquidacionDetalle` sí protege la coherencia entre lo
persistido y lo recalculado —`reconstruir` compara los TIPOS con `derivoLaConfig`
y se calla ante deriva (`analytics.ts:1691`)—, pero esa defensa es sobre el
**origen** de los datos; la divergencia de aquí es entre dos clasificaciones del
mismo dato. Y ningún test la vigila: `grep` de `TIPOS_MALOS` en `src/**/*.test.*`
no devuelve nada.

Consecuencia: el contralor —que compra justamente por el reparto en tres
cubetas— ve la pantalla contradecirse a sí misma en el demo. En el escenario 1 se
le dice que $3,400 recuperables están perdidos; en el 2, que $11,600 perdidos
«hay que revisarlos».

Causa raíz probable: `TIPOS_MALOS` es un `Set<string>` literal en el panel en vez
de importar `cubetaDe`/`NO_DEDUCIBLE_ISR`, que ya existen exportados y que el
propio motor documenta como «LA ÚNICA definición de en qué cubeta cae un gasto»
(`engine.ts:187`).

No lo pongo en CRÍTICO porque **ninguna cifra sale mal**: los pesos de las tres
cubetas son los del motor. Lo que miente es la etiqueta categórica del renglón.

---

### [ALTO] «Dinero observado» significa dos cosas distintas en dos pantallas del mismo panel, y la que sale más grande incluye lo que no atrapó nadie

`src/app/dashboard/agentes/liquidacion/vista.tsx:71`, `:189-198` contra
`src/app/dashboard/chat.tsx:106`; las dos fuentes son
`src/lib/likida/analytics.ts:280-303` (`getDineroObservadoPorTipo`) y
`supabase/migrations/0112_agregados_rpc.sql:318-325` (`kpis_liquidacion_tenant`).

El RPC define «dinero observado» con un filtro explícito:

```sql
where d->>'tipo' in ('sobre_politica', 'duplicado')
```

y su propio `comment on function` (`0112:343`) lo repite: «dinero observado por
sobre_politica/duplicado». `getDineroObservadoPorTipo` **no filtra nada**: suma
`Math.abs(monto)` de TODOS los tipos del jsonb (`analytics.ts:292-297`). Su
docstring (`:275-279`) afirma lo contrario de lo que hace: *«`getKpis` suma el
total; esta lo abre para la dona del agente — misma fuente, mismo valor
absoluto.»*

**Escenario con valores.** Flota con 40 liquidaciones cerradas. En el jsonb hay:
40 × `anticipo` (sobrante medio de $1,800 → $72,000 en valor absoluto,
`engine.ts:749-760` lo emite en toda liquidación con |diferencia| ≥ $0.50),
3 × `sobre_politica` ($4,300), 2 × `duplicado` ($15,762),
1 × `viatico_excede_fiscal` ($2,100), y ~60 diferencias con `monto: 0`
(`sin_cfdi`, `cfdi_cancelado`, `ocr_baja_confianza`…).

- `/dashboard/chat` → «Dinero observado **$20,062**» (4,300 + 15,762).
- `/dashboard/agentes/liquidacion` → «Dinero observado **$94,162**», en cifra de
  22 px, bajo el subtítulo «Lo que el agente atrapó fuera de regla o duplicado».

**4.7× de diferencia sobre la misma flota y el mismo histórico, con el mismo
rótulo.** Y el 76 % de la cifra grande es `anticipo`: dinero que sobró del
anticipo y que el operador ya regresó — ni «fuera de regla» ni «duplicado». La
dona (`vista.tsx:199`) pinta «Diferencia contra el anticipo» como la rebanada
dominante bajo ese subtítulo, y la leyenda de abajo (`:201-206`) lista además
~15 tipos con «$0.00» al lado de su conteo («Sin CFDI · 62 — $0.00»), porque el
campo `monto` de una diferencia es el impacto en el saldo del viaje
(`types/likida.ts:117`), no la exposición fiscal.

Consecuencia: es la cifra con la que se vende el agente. El contralor que la
enseñe en su junta va a reportar 4.7× el valor que el producto de verdad atrapó,
y cuando alguien cruce esa pantalla con el chat del mismo panel, la conclusión no
es «hay dos definiciones» sino «el tablero no cuadra consigo mismo».

Causa raíz probable: el filtro `in ('sobre_politica','duplicado')` vive en SQL y
el desglose se escribió en TypeScript sin leerlo; el docstring que afirma «misma
fuente» hizo de guardarraíl aparente.

---

### [MEDIO] El panel ARCO declara vencida una solicitud un día antes: calcula «hoy» en UTC, no en hora de México

`src/app/dashboard/arco/page.tsx:32` (`const hoy = new Date().toISOString().slice(0, 10);`)

`vencimiento.ts` quedó impecable (`yaVencio`, `venceDentroDe`, con prueba), pero
recibe un «hoy» equivocado durante seis horas de cada día. El repo ya tiene el
accesor único `hoyMx()` (`src/lib/formato.ts:46-48`), introducido por `df645b2`
en este mismo delta, y otras trece pantallas lo usan
(`facturacion/page.tsx:162`, `operadores/page.tsx:70`, `inicio-contenido.tsx:261`…).
Ésta no. La prueba que vigila el patrón (`formato.test.ts:248`) solo detecta
quien deletrea `'en-CA'` + zona a mano, no `toISOString().slice(0,10)`.

**Escenario con valores.** Solicitud de acceso recibida el 24-jul-2026, plazo del
art. 31 LFPDPPP (20 días hábiles) vence el **21-ago-2026**. La contadora abre
`/dashboard/arco` el **21-ago a las 19:30 hora de CDMX** = 22-ago 01:30 UTC.
`hoy` = `'2026-08-22'`. Entonces `yaVencio('2026-08-21','2026-08-22')` → `true`:
la tarjeta **«Vencidas sin responder» cuenta 1** y **«Vencen pronto (≤ 5 días)»
cuenta 0**. En México todavía es 21 de agosto y el plazo NO ha vencido: le quedan
cuatro horas y media para contestar y el panel ya la dio por incumplida. El mismo
corrimiento mueve la ventana de «≤ 5 días» un día entero todas las tardes.

Consecuencia: entre las 18:00 y las 23:59 hora de México —el rato en que un
contralor cierra su día— el tablero de cumplimiento de datos personales afirma un
incumplimiento que no ocurrió, y esconde de «vencen pronto» justamente la
solicitud que todavía se podía salvar. Es la pantalla que existe para no fallarle
al INAI.

Causa raíz probable: la página se escribió antes de que `hoyMx()` fuera el
accesor único y la migración de `df645b2` no la alcanzó; la prueba-guardia busca
la firma vieja del bug, no ésta.

---

### [MEDIO] El KPI «Sobre tope» del detalle imprime $0.00 al lado de «excedente en 1 comprobante»

`src/app/dashboard/[id]/detalle.tsx:82-83`, `:205-210`, con
`TIPOS_TOPE` en `src/app/dashboard/[id]/vista.tsx:159`

`excedenteTope` suma `df.monto` de los tipos de `TIPOS_TOPE`, pero uno de los
cuatro —`efectivo_sobre_tope`— lo emite el motor con **`monto: 0`**
(`engine.ts:481`), a propósito: ahí no se pierde un excedente, se pierde el gasto
entero. Los otros tres sí traen monto (`sobre_politica` `:543`,
`viatico_excede_fiscal` `:1048`, `efectivo_sobre_15` `:466`).

**Escenario con valores.** Hospedaje de **$8,500** pagado en efectivo
(`formaPago: '01'`, no combustible, por encima del tope de $2,000 de LISR 27-III).
Única diferencia de tope de la liquidación. En pantalla:

> **SOBRE TOPE** · `$0.00` · *excedente en 1 comprobante* — en ámbar
> (`tono={difsTope.length > 0 ? 'warn' : undefined}`)

y tres centímetros abajo, la caja de cubetas dice «No deducible **$8,500**». Un
cero que se lee como medición («medí lo que se pasa del tope y da cero») junto a
una nota que afirma que sí hay un excedente, sobre $8,500 que están perdidos.

Consecuencia: el contralor que escanea la fila de cinco KPIs —que es para lo que
existe— concluye que nada excede tope en esa liquidación. Rompe la regla escrita
del repo dos veces: un rótulo que no es verdad, y un cero con cara de medición.

Causa raíz probable: `TIPOS_TOPE` se construyó por afinidad del nombre del tipo,
no por si ese tipo lleva un monto que sumar; `efectivo_sobre_tope` está además en
las dos listas (`TIPOS_MALOS` y `TIPOS_TOPE`) para decir cosas distintas.

---

## Lo que revisé y está bien

Vale tanto como los hallazgos, y aquí es la mitad de la razón por la que la nota
sube.

- **La compuerta está verde.** `npx tsc --noEmit -p .` sin salida;
  `npx vitest run`: **432 archivos, 5,514 pruebas pasando** (1 saltada), 147 s.
- **Trabajo obligatorio del rubro — cada mapa literal del panel contra
  `src/types/likida.ts`.** Recorrí los ~35 `Record<…>` de `src/app/`:
  - `ConceptoGasto` (9 valores, `types/likida.ts:20-25`): cubierto **completo** y
    con la misma prosa en `dashboard/[id]/page.tsx:25-29` y
    `dashboard/gasto-semanal-chart.tsx:13-17`; `f6c2fa9` corrigió los tres
    divergentes (`Casetas`→`Caseta`, `Facturas`→`Factura`, `Otros`→`Otro`) y
    amplió `etiquetas_sincronizadas.test.ts` a barrer **todo** `src/` en vez de
    rutas literales, que es lo que dejó entrar la cuarta copia.
  - `TipoDiferencia` (35 valores, `:69-110`): `rotulo-diferencia.ts:18-55` los
    tiene los 35, tipado `Record<TipoDiferencia, …>` (un tipo nuevo no compila
    sin rótulo) y con prueba que compara contra la unión.
  - `EstatusLiquidacion` (3, `:120`): `dashboard/estatus.ts:18-22`, fuente única
    para lista y detalle, con `etiquetaEstatus()` que degrada a la clave cruda.
  - `viaje.estatus` (3, constraint `viaje_estatus_dominio`):
    `resumen-visual.tsx:103-107` y `viajes/vista.tsx:31-35` — **dos copias**,
    pero hoy idénticas y las dos con fallback a la clave cruda.
  - `unidad.estado` (4, `0047:47`): `unidades/vista.tsx:20-25`, completo.
  - `EstadoVigencia`, `EstadoTarifa`, `necesita` de Carta Porte
    (`carta_porte.ts:78`), `CampoCaptura['forma']`, `Conector['estado']`,
    `EnvGroup`, `EstadoPaso`, `EstadoCorrida`, `RolAppUser`: todos tipados contra
    su unión (`Record<Union, …>`), así que un valor nuevo no compila.
  - `app_user.rol`: `chrome.tsx:26-32`, `usuarios/vista.tsx:11-17`,
    `admin/mi-perfil/page.tsx:10-12` conservan `operador` (retirado por 0086) y
    no traen `vendedor` (añadido por 0105), pero **los tres degradan** a la clave
    cruda (`:89`, `:97`, `:124`) y `admin/equipo/page.tsx:14-20` sí está tipado
    `Record<RolAppUser, string>` completo. No lo levanto como hallazgo: no hay
    escenario donde salga vacío.
  - `c_FormaPago` (`dashboard/[id]/vista.tsx:140-143`): 7 claves con
    `?? clave` — una clave desconocida se pinta cruda, no se adivina.
  - `factura_emitida.estatus` (4, `0049:48`): `facturacion/vista.tsx:303-306`
    solo mapea 2, **a propósito** — el render está guardado con `{pill && …}`
    (`:384`), así que `emitida`/`pagada` simplemente no llevan píldora.
- **`getLiquidacionDetalle` no deja que el detalle contradiga al PDF archivado.**
  `analytics.ts:1656` cierra el portón por total, y `:1691` (`derivoLaConfig`)
  compara los **tipos** de diferencia persistidos contra los recalculados y cae
  al camino de gastos crudos si derivaron; la pantalla entonces lo dice
  (`detalle.tsx:379-384`, «esta suma puede no coincidir con el comprobado de
  arriba»). Es la defensa correcta contra el CRÍTICO de la auditoría 6 y sigue
  puesta.
- **El registro de viajes v2 no inventa nada.** `viajes/page.tsx:49-56` no
  envuelve los primarios en `try` (fail-closed) y deja que los conteos degraden a
  `null` solos; `vista.tsx:86` los pinta como «—», nunca 0. El filtro
  «Escalados» de la lista (`analytics.ts:1059-1061`) usa **exactamente** el mismo
  predicado que su KPI (`contarEscalados`, `analytics.ts:991-993`). La
  paginación pide `porPagina + 1` y no promete «página 1 de N» porque no cuenta
  el total (`vista.tsx:253-257`). El cruce viaje→liquidación va por `viaje_id`,
  que tiene índice **único** (`0005_concurrencia.sql:9`), así que el `Map` de
  `page.tsx:62` no puede quedarse con la fila equivocada.
- **Los pesos no salen del servidor cuando el rol no los puede ver.**
  `viajes/page.tsx:73-75` deja `anticipo`/`comprobado`/`diferencia` en `null` y
  la vista ni siquiera pinta las columnas (`vista.tsx:88`, `columnas`), con
  `dinero_por_area.test.ts` vigilando.
- **La foto del ticket sigue sin salir al DOM.** `detalle.tsx:49-56` y `:344-346`:
  la tabla dice «Foto archivada» y no pinta miniatura ni enlace, con la razón
  legal escrita al lado.
- **El botón que no hace nada lo dice.** `dashboard/[id]/vista.tsx:127-131`:
  «Aprobar / Descontar» va `disabled` con el `title` explicando por qué. Y
  `agentes/liquidacion/vista.tsx:229-236` dice «Ver», no «Editar», porque
  Configuración es de solo lectura.
- **La tabla de comprobantes no se baraja entre recargas.**
  `analytics.ts:1705-1707` fija el orden (fecha, `id` de desempate) en el camino
  del motor, igual que el de respaldo.
- **`filasDeducibilidad` se niega a pintar un desglose que no cuadre.**
  `deducibilidad.ts:54-56`: si las tres cubetas no suman el total persistido con
  un centavo de tolerancia, devuelve `null` y la sección no se pinta.

---

## Lo que NO alcancé a revisar

Sin esto la nota es una mentira por omisión.

- **No miré un solo render, tercera ronda seguida.** Corrida en la nube, sin
  `npm run build`, sin base y sin credenciales. Todo lo de arriba es lectura de
  código y aritmética. En particular `dashboard/[id]/detalle.tsx` (425 líneas
  nuevas) y `viajes/vista.tsx` (293) **nadie las ha visto pintadas**: composición,
  jerarquía y el `min-[1100px]:grid-cols-5` de los KPIs (`detalle.tsx:189`), el
  `xl:grid-cols-3` (`:213`) y la tabla de 10 columnas del registro a 390 px
  quedan sin verificar. El `<details>` del importador se posiciona `absolute`
  sobre la tabla (`viajes/vista.tsx:146-149`) y no comprobé qué tapa.
- **El contraste de `detalle.tsx` (mapa-prospectos) sigue medido, no visto**, y
  no medí el contraste del código NUEVO de este delta (`viajes/vista.tsx`,
  `dashboard/[id]/detalle.tsx`): usan tokens, no hex a mano, así que asumí que
  `contraste.test.ts` los cubre — **asumí, no verifiqué**.
- **Accesibilidad con lector de pantalla: no probada.** El detalle v2 mete un
  `<nav aria-label>` de breadcrumb (`:117`) y `scope="col"`/`scope="row"` en la
  tabla (`:329-334`, `:366`), que es más de lo que había; el registro de viajes
  tiene `role="search"` (`viajes/vista.tsx:124`). Nada de eso se probó con un
  lector.
- **Las ~24 páginas de `/dashboard` que la ronda 18 dejó fuera siguen fuera**:
  `rentabilidad/`, `combustible-casetas/`, `conocimiento/`, `politicas/`,
  `integraciones/`, `llaves-api/`, `notificaciones/`, `mapa/`, `soporte/`,
  `contador/`, `despacho/`, `carta-porte/`, `clientes/`, `conexiones/` y
  `agentes/{peajes,conductores,notificaciones}`. De `facturacion/` solo abrí
  `PILL_ESTATUS` y `RenglonFactura`.
- **`/admin` fuera del Cerebro, Flotas y `ui/kit`**: ~35 pantallas sin auditar.
- **No perseguí los dos hallazgos que el MAPA ofrece de regalo** (el
  `reengancharPendiente` sin call site y la verificación perdida de las columnas
  GENERADAS): no son de mi rubro.
- **`getDineroObservadoPorTipo` sin `tenant` de prueba**: el escenario del
  hallazgo 2 está construido con la aritmética del motor y el SQL del RPC, no
  medido contra datos (la base está en cero, 0 viajes).
