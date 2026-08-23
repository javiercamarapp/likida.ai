# Frontend — auditoría 18 · continuación 4

**Nota: 6/10** (antes 6). **Sin movimiento**, y la razón está escrita porque las
dos fuerzas se cancelan punto por punto:

- A favor, *se atacó y subió*: dos de los cuatro hallazgos de la c3 quedaron
  cerrados con el arreglo estructural correcto —`TIPOS_MALOS` ya no es un `Set`
  a mano sino `new Set(NO_DEDUCIBLE_ISR)` importado del motor
  (`dashboard/[id]/vista.tsx:169`), y `/dashboard/arco` cambió su `hoy` UTC por
  `hoyMx()` (`arco/page.tsx:38`)—, y el delta de FE-14/FE-16 es el mejor trabajo
  de frontend que ha entrado a este repo: esqueletos con la MISMA rejilla del
  contenido, `null ≠ 0` respetado tarjeta por tarjeta, `vigilar()` contra el
  `unhandledRejection` del hueco entre lanzar y esperar, y pruebas sobre el
  stream REAL (`renderToPipeableStream`), no sobre un mock.
- En contra, *deuda que cobró factura*: el mismo FE-14 puso en pantalla ~64
  botones «Reintentar» que **no pueden reintentar** —`LimiteError` no tiene
  camino de reseteo— y su propia prueba certifica el TEXTO del botón, no su
  efecto. Los nueve hallazgos de la c2 siguen abiertos los nueve, y dos de los
  cuatro de la c3 son REINCIDENTES.

**El riesgo mayor del rubro, hoy:** el streaming partió la pantalla en 64
tarjetas independientes y le puso a cada una un botón «Reintentar» que no puede
reintentar. Un parpadeo de la base deja la tarjeta muerta hasta un recargado
duro, y la única prueba que la cubre certifica el texto del botón.

---

## Verificación de los abiertos de la c3

### Los cuatro hallazgos de la c3 — 2 CERRADOS · 2 REINCIDENTES

| Hallazgo | Estado | Evidencia |
|---|---|---|
| [ALTO] La píldora del renglón contradice la caja de cubetas (`TIPOS_MALOS` copiado a mano) | **CERRADO** | `src/app/dashboard/[id]/vista.tsx:169` es `new Set<string>(NO_DEDUCIBLE_ISR)` y `:171` `new Set<string>(POR_CONFIRMAR)`, los dos importados de `cuadre/engine.ts:222`. Además `:177-181` saca `duplicado`/`monto_invalido`/`comprobante_no_fiscal` a un mapa aparte (`ETIQUETA_CAPTURA`) que los nombra por lo que son en vez de afirmar «No deducible», y `estadoRenglon` (`:190-206`) ordena por gravedad con esas tres listas. Los dos escenarios de la c3 (diésel en efectivo → «Por confirmar»; `rfc_receptor` → «No deducible») ahora salen correctos. |
| [ALTO] «Dinero observado» significa dos cosas en dos pantallas | **REINCIDENTE** | `src/app/dashboard/agentes/liquidacion/vista.tsx:325` sigue sumando **todos** los tipos (`porTipo.reduce((s,t)=>s+t.monto,0)`) bajo el subtítulo «Lo que el agente atrapó fuera de regla o duplicado» (`:330`). La fuente cambió de JS a SQL pero conserva la definición ancha: `supabase/migrations/0150_agregados_analytics.sql:482-492` desanida `diferencias` **sin filtrar por tipo**. Enfrente, `src/app/dashboard/chat.tsx:106` imprime `kpis.diferenciaDetectada`, que sale de `0112_agregados_rpc.sql:322-324` con `where d->>'tipo' in ('sobre_politica','duplicado')`. Ver el hallazgo con valores más abajo. |
| [MEDIO] `/dashboard/arco` calcula «hoy» en UTC | **CERRADO** | `src/app/dashboard/arco/page.tsx:38` es `const hoy = hoyMx();`, con la razón escrita en `:30-37`. (Sujeto al CRÍTICO de abajo: hoy `hoyMx()` está revertido en el árbol.) |
| [MEDIO] «Sobre tope» imprime $0.00 junto a «excedente en 1 comprobante» | **REINCIDENTE** | `src/app/dashboard/[id]/detalle.tsx:91` añadió `df.monto > 0 ? df.monto : 0`, que solo protege de montos negativos. `TIPOS_TOPE` (`[id]/vista.tsx:183`) sigue incluyendo `efectivo_sobre_tope`, y el motor lo emite con `monto: 0` a propósito (`cuadre/engine.ts:522`). El KPI (`detalle.tsx:215-221`) sigue pintando `mxn(0)` en ámbar con la nota `excedente en ${comprobantes(difsTope.length)}`. |

### Los nueve de la c2 — **9/9 REINCIDENTES**

Verificados uno por uno, abriendo el archivo:

1. **[ALTO] El panel enruta con dos entradas menos que el motor** — `agentes/facturas/page.tsx:102` (`portalesConAdaptador={PORTALES_CONOCIDOS}`) y `agentes/facturas/vista.tsx:61` (`enrutar(t, …includes(t.comercio.clave) : false)`, sin tercer ni cuarto argumento).
2. **[MEDIO] El rótulo de «Necesidad» describe la fórmula de la 0140** — `lib/admin/prospectos-mapa.ts:290`, texto intacto.
3. **[MEDIO] Dos «% Cierre» para el mismo prospecto** — `prospectos-mapa.ts:555` (mapa) llama `scoreCierre` sin `personasVerificadas`; `:775-780` (ficha) sí lo pasa (`.filter((x) => x.confianza !== 'baja').length`).
4. **[MEDIO] «Redactar con IA» falla en silencio** — `admin/mapa-prospectos/[id]/detalle.tsx:80` (`if (!r.ok) return;`) y `cerebro.tsx:510`, idénticos.
5. **[MEDIO] Contraste de la ficha nueva** — `[id]/detalle.tsx:158-159`, `:235-236`, `:256`: siguen siendo hex a mano fuera del alcance de `contraste.test.ts`.
6. **[MEDIO] Dos definiciones de «duplicado»** — `prospectos-mapa.ts:527` (`/DUPLICADO:/.test(notas)`) contra `:757` (`if (!p || p.duplicado_de) return null;`). Y ahora hay una **tercera** ortografía: `:585` cuenta con `ilike '%DUPLICADO:%'` (insensible a mayúsculas) mientras `:527` es sensible — ver la nota en «Lo que revisé».
7. **[MEDIO] «Te toca a ti» ya no es lo que su subtítulo dice** — `agentes/facturas/vista.tsx:114-117`, texto intacto.
8. **[BAJO] El enlace a LinkedIn no normaliza el esquema** — `[id]/detalle.tsx:169` (`href={per.linkedin}`).
9. **[BAJO] El alta de flota dice «los CINCO y ya factura»** — `admin/flotas/page.tsx:34-38` sigue diciendo «Es la condición exacta de `getFiscalDeFlota`» sobre cinco campos.

---

## Hallazgos

### [CRÍTICO] `hoyMx()` devuelve el día de UTC, no el de México: la campaña entera del «día de México» está anulada en el árbol de trabajo, y la compuerta está roja

`src/lib/formato.ts:47` y `src/lib/formato.ts:58`

```ts
// :47
return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', … }).format(fecha);
// :58
const OFFSET_MX = 'Z';
```

Las dos líneas contradicen la constante que está tres renglones arriba
(`TZ_MX = 'America/Mexico_City'`, `:34`) y su propio comentario, que dice
textual «México dejó el horario de verano en 2022 (por eso `TZ_MX` puede
tratarse como UTC−6 sin ramas)» (`:52-56`).

**Procedencia, dicha con precisión porque cambia qué significa:** es una
modificación **no commiteada** del árbol de trabajo. `git status` da
` M src/lib/formato.ts` y `git show HEAD:src/lib/formato.ts` trae `timeZone:
TZ_MX` y `const OFFSET_MX = '-06:00'`. El árbol estaba limpio al arrancar esta
sesión y `npx vitest run` corrió **verde** (485 archivos, 6,247 pruebas) antes de
que apareciera. No la commiteó nadie: está viva en el disco desde el que se
construye.

**Escenario 1, con valores — el ejercicio fiscal equivocado.** Es 31 de
diciembre de 2026, 18:30 hora de CDMX (= 1-ene-2027 00:30 UTC). El contralor
abre `/dashboard`. `inicio-contenido.tsx:108` hace `const hoy = hoyMx(new
Date(ahoraMs()))` → `'2027-01-01'`. `resolverPeriodo(undefined, hoy)` (`:109`)
abre el ejercicio **2027**, que tiene cero gastos. La tarjeta «Ahorro generado —
Ejercicio 2027» (`:611-619`) imprime `$0.00`, «Tu motor fiscal — Ejercicio 2027»
(`:659`) sale en ceros, y el botón «Exportar CSV del mes» del contador
(`contador/inicio-contador.tsx:187`) apunta a
`?desde=2027-01-01&hasta=2027-01-01`. Es exactamente el fallo que el comentario
de `:104-107` dice haber arreglado, con la explicación escrita al lado.

**Escenario 2, con valores — el corte de seis horas.** `inicioDiaMx('2026-08-23')`
devuelve `'2026-08-23T00:00:00Z'` en vez de `'2026-08-23T00:00:00-06:00'`. Todo
lo capturado entre las 18:00 del 22 y la medianoche del 22 en México cae **dentro**
de la ventana del 23, y lo del 23 después de las 18:00 cae fuera. Lo usan
`analytics.ts`, `fiscal.ts`, `api/dashboard/chat/tope.ts` y
`api/dashboard/ingesta/tope.ts` — es decir, el tope de mensajes del chat y el de
ingesta se reinician seis horas antes de tiempo.

**Radio:** `rg -l 'hoyMx\('` da **39 archivos** fuera de pruebas, entre ellos
`dashboard/inicio-contenido.tsx`, `inicio-operacion.tsx`,
`contador/inicio-contador.tsx`, `arco/page.tsx`, `operadores/page.tsx`,
`facturacion/page.tsx`, `admin/consola.tsx`, `admin/compliance/page.tsx`,
`api/cron/facturar/route.ts` y `api/stripe/webhook/route.ts`.

**Lo que sí funciona, y hay que decirlo:** la prueba ancla existe y **falla**.
`npx vitest run src/lib/formato.test.ts` → 3 fallas:
`formato.test.ts:366` (`expected '2026-08-22' to be '2026-08-21'`),
`:312` (`inicioDiaMx('2026-12-31')` ya no trae `-06:00`) y `:320`. Ninguna de las
otras 6,244 pruebas se entera, lo cual dice algo aparte sobre la cobertura, pero
la guardia del rubro está puesta y grita.

Consecuencia: si esto llega al deploy, el contralor ve su motor fiscal en ceros
todas las tardes a partir de las 18:00, y el 31 de diciembre ve el ejercicio
equivocado. Es la regla número uno del producto («nunca inventar una cifra»)
rota por una constante.

Causa raíz probable: una edición manual del árbol de trabajo que sustituyó dos
valores por su equivalente UTC; el commit `df645b2` que introdujo `hoyMx()` como
accesor único hizo que un solo punto gobierne el «hoy» de todo el panel — lo que
es la defensa correcta y también el radio de esta falla.

---

### [ALTO] El botón «Reintentar» de cada bloque de streaming no puede reintentar: `LimiteError` no tiene camino de reseteo (código NUEVO de FE-14)

`src/app/dashboard/limite-error.tsx:25-39`, con
`src/app/admin/ui/kit.tsx:355-357`

```ts
export class LimiteError extends Component<…, { rompio: boolean }> {
  state = { rompio: false };
  static getDerivedStateFromError() { return { rompio: true }; }   // :31-33
  render() {
    if (this.state.rompio) return <EstadoError mensaje={this.props.mensaje} />;
    return this.props.children;
  }
}
```

No hay `componentDidUpdate`, no hay `getDerivedStateFromProps`, no hay `key` que
cambie en ningún call site, y `EstadoError` se monta **sin** `onReintentar`, así
que su botón cae al default `() => router.refresh()` (`kit.tsx:357`).
`router.refresh()` es —por diseño documentado de Next— una revalidación que
**conserva el estado de React del cliente**. `state.rompio` sobrevive, `render()`
vuelve a devolver `EstadoError` sin ni siquiera intentar los hijos, y la tarjeta
queda muerta hasta un recargado duro (F5).

**Escenario con valores.** Demo del 6-ago. Se abre
`/dashboard/agentes/liquidacion`. `page.tsx:65` lanza `pKpis =
vigilar(getKpis(tenantId))` **sin `safe`** a propósito (fallar cerrado). Postgres
devuelve un `statement timeout` de 200 ms en ese instante. El bloque de KPIs
(`vista.tsx:90-…`) y el de la cola (`vista.tsx:180-183`, que también espera
`pKpis`) revientan; `LimiteError` pinta «No se pudieron leer los indicadores del
agente.» con su botón. La base se recupera dos segundos después. Javier aprieta
**Reintentar**: se dispara la petición RSC —se ve en la pestaña Red—, el
servidor devuelve los KPIs correctos, y **la tarjeta sigue diciendo lo mismo**.
Aprieta otra vez. Y otra. La única salida es recargar la página entera, que es
justo lo que el bloque venía a evitar.

**Cuántos:** 64 boundaries en las cinco pantallas migradas —
`inicio-contenido.tsx` (17), `agentes/liquidacion/vista.tsx` (18),
`inicio-operacion.tsx` (14), `contador/inicio-contador.tsx` (9),
`agentes/conductores/vista.tsx` (6).

**Es una regresión, no una carencia de siempre.** Antes de FE-14 un fallo subía
al `error.tsx` de la ruta, y ése recibe de Next un `reset()` que **sí** limpia el
boundary. `agentes/liquidacion/page.tsx:44-47` describe el cambio y afirma que
«el manejo de error por bloque se conserva entero… con su `EstadoError` y su
botón de reintento». El botón se conserva; el reintento no.

**Intenté refutarlo por el lado de la prueba, y la prueba es parte del
hallazgo.** `bloque.test.tsx:153-173` existe justo para esto, y lo que asegura
es `expect(html).toContain('Reintentar')` — el TEXTO del botón, sobre una
instancia construida a mano con `limite.state = { rompio: true }`. Ninguna
aserción toca el reseteo. Es el modo de falla que el rubro de Pruebas llama
decoración: la prueba seguiría verde con la función rota, porque la función rota
es lo que prueba.

Consecuencia: un botón rotulado con una acción que estructuralmente no puede
ocurrir, en la pantalla del agente que se vende, y multiplicado por 64. Rompe
«un rótulo tiene que ser verdad» de la forma más literal.

Causa raíz probable: un límite de error de React necesita que algo le cambie el
estado o la identidad para volver a intentar; aquí el reintento se delegó a
`router.refresh()`, que por contrato no toca el estado del cliente.

---

### [ALTO] «Dinero observado» sigue significando dos cosas en dos pantallas del mismo panel — REINCIDENTE de la c3

`src/app/dashboard/agentes/liquidacion/vista.tsx:324-330` contra
`src/app/dashboard/chat.tsx:106`. Las fuentes se movieron a SQL en este delta y
la divergencia se movió con ellas:

- `supabase/migrations/0150_agregados_analytics.sql:482-492`
  (`dinero_observado_por_tipo_tenant`) desanida `l.diferencias` y suma
  `abs(monto)` **de todos los tipos**, sin un solo `where` sobre `tipo`.
- `supabase/migrations/0112_agregados_rpc.sql:322-324`
  (`kpis_liquidacion_tenant`, de donde sale `diferenciaDetectada`) filtra
  `where d->>'tipo' in ('sobre_politica', 'duplicado')`, y su `comment on
  function` (`:343`) lo repite: «dinero observado por sobre_politica/duplicado».

**Escenario con valores.** Flota con 40 liquidaciones cerradas. En el jsonb hay
40 × `anticipo` (sobrante medio $1,800 → $72,000 en valor absoluto; `engine.ts`
lo emite en toda liquidación con |diferencia| ≥ $0.50), 3 × `sobre_politica`
($4,300), 2 × `duplicado` ($15,762), 1 × `viatico_excede_fiscal` ($2,100) y ~60
diferencias con `monto: 0`.

- `/dashboard/chat` → «Dinero observado **$20,062**».
- `/dashboard/agentes/liquidacion` → «Dinero observado **$94,162**», en cifra de
  22 px (`vista.tsx:338`), bajo el subtítulo «Lo que el agente atrapó fuera de
  regla o duplicado» (`:330`).

**4.7× sobre la misma flota, el mismo histórico y el mismo rótulo.** El 76 % de
la cifra grande es `anticipo`: dinero que sobró y que el operador ya regresó — ni
fuera de regla, ni duplicado. Y la leyenda de abajo (`vista.tsx:341-347`) lista
además ~15 tipos con «$0.00» al lado de su conteo («Sin CFDI · 62 — $0.00»),
porque el `monto` de una diferencia es el impacto en el saldo del viaje, no la
exposición fiscal.

Consecuencia: es la cifra con la que se vende el agente. El contralor que la
lleve a su junta reporta 4.7× lo que el producto de verdad atrapó, y al cruzarla
con el chat del mismo panel la conclusión no es «hay dos definiciones» sino «el
tablero no cuadra consigo mismo».

Causa raíz probable: el filtro vive en el SQL de la 0112 y el desglose se
escribió mirando el jsonb, no la función hermana; bajar la agregación a SQL
(0150) copió la reducción de JS tal cual, divergencia incluida.

(REINCIDENTE — venía de la continuación 3.)

---

### [MEDIO] Las vigencias de las unidades se calculan contra el día UTC: a partir de las 18:00 de CDMX una póliza que vence HOY sale «vencida ayer», en rojo

`src/lib/likida/operacion.ts:170` y `:187`, con
`src/lib/likida/vigencias.ts:63-69`

```ts
// operacion.ts:148 — la firma acepta `hoy`, pero ningún call site lo pasa
export async function getUnidades(tenantId: string, hoy = new Date()) { …
// :170
const base = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
// :187
const dias = Math.round((t - base) / DIA_MS);
```

**Es independiente del CRÍTICO de arriba**: aquí no se llama a `hoyMx()`, se
arma el día con `Date.UTC` a mano. Arreglar `formato.ts` no arregla esto.

**Escenario con valores.** Unidad `ECO-14`, `poliza_vence = '2026-08-23'`. El
jefe de tráfico abre `/dashboard/unidades` el **23-ago-2026 a las 18:30 hora de
CDMX** = 24-ago 00:30 UTC. `base` = `Date.UTC(2026,7,24)`, `t` =
`Date.parse('2026-08-23T00:00:00Z')`, `dias = Math.round((t-base)/86_400_000)` =
**−1** (verificado ejecutando la aritmética). `clasificarVigencia(-1,'Póliza')`
(`vigencias.ts:63-69`) devuelve `estado: 'vencido'`, `rotulo: 'Póliza: vencida
ayer'`. En pantalla (`unidades/vista.tsx:185`, `PILL.vencido` → `var(--bad)`) la
unidad sale con píldora **roja**, se ordena primero (`:97-104`), el contador
«Vencidos» de arriba (`:161`) marca **1**, y `avisoVigencias`
(`vigencias.ts:123-125`) escribe «1 unidad con un papel vencido». En México
todavía es 23 de agosto y la póliza está vigente todo el día.

El mismo dato alimenta el banner de `/dashboard` de operación
(`inicio-operacion.tsx:101` → `:286-287`) y `GET /api/v1/unidades`
(`api/v1/unidades/route.ts:73, :108`).

**La prueba de que es un olvido y no una decisión está en el archivo de al
lado.** `inicio-operacion.tsx:88` calcula `const diaMx = hoyMx(new Date(ahora))`
y se lo pasa a `getViajesPorDia` (`:110`) y a las licencias de los choferes
(`:296`, `diasParaVencer(o.licenciaVence!, diaMx)`) — pero a `getUnidades`
(`:101`) no. Y `operadores/page.tsx:86-88` trae el comentario textual: «El día
del CHOFER (México), no el UTC del servidor — a las 6pm de CDMX una licencia que
vence "hoy" ya se marcaba vencida con el día UTC». La página gemela se arregló;
ésta no. En el **mismo banner** de la mañana conviven las dos aritméticas.

Consecuencia: entre las 18:00 y las 23:59 hora de México, la pantalla que existe
para que no te pare un inspector afirma un incumplimiento que no ocurrió, y saca
de «vence pronto» justo la unidad a la que todavía le quedaban horas. Para el
jefe de tráfico eso es una unidad que deja de salir a ruta sin motivo.

Causa raíz probable: `getUnidades` calcula el vencimiento del lado de la lectura
con `Date.UTC` y la campaña DAT-08 barrió los `toISOString().slice(0,10)` de las
páginas, no los `Date.UTC(...getUTC*())` de los helpers.

---

### [MEDIO] «Actividad — Histórico»: una consulta caída se pinta como «Aún no hay viajes registrados». A13 quedó cerrado en cuatro de las cinco tarjetas

`src/app/dashboard/inicio-contenido.tsx:711` y
`src/app/dashboard/actividad.tsx:39-63`

El servidor sí distingue: `pViajesPorMes = safe(() => getViajesPorMes(tenantId))`
(`inicio-contenido.tsx:141`) devuelve `null` ante fallo. Pero al bajar a la vista
el `null` se aplasta:

```tsx
// inicio-contenido.tsx:710-711
porDia={viajesPorDia}          // Promise<DiaViajes[] | null> — se conserva
porMes={viajesPorMes ?? []}    // el null se convierte en "no hay nada"
```

Y `actividad.tsx` solo defiende la rama de días:

```tsx
if (modo !== 'historico' && porDia === null) { …"No se pudo cargar esta gráfica." }  // :39-47
const sinDatos = modo === 'historico' ? porMes.every((d) => d.valor === 0) : …       // :53
```

`[].every(...)` es **true por vacuidad**, así que la rama histórico cae en
`:55-63` y escribe «**Aún no hay viajes registrados.**»

**Escenario con valores.** Flota con 4,200 viajes en 11 meses.
`viajes_por_mes_tenant` (mig. 0150) devuelve `statement timeout` en esa carga
—las otras diez consultas contestan bien—. `getViajesPorMes` lanza,
`leerRpc0150` la propaga (`analytics.ts:649-652`), `safe` la vuelve `null`, y el
`?? []` la vuelve «vacío». El contralor aprieta **Histórico** en el selector
(`panel-periodo.tsx:69`) y la tarjeta más grande de la pantalla afirma que su
flota no ha registrado un solo viaje.

**Intenté refutarlo y encontré media defensa, no una entera.** `viajesPorMes` sí
entra en `secundarias` de `estadoPanel` (`estado.ts:32`, call site en
`inicio-contenido.tsx:563`), así que el banner «Faltan datos por cargar — esta
pantalla está incompleta» sale. Pero (a) ese banner vive arriba de todo mientras
la afirmación falsa está a ~1,400 px de scroll, y (b) el bloque que lo pinta
espera las **once** promesas (`AvisoEstado`, `:551-554`), o sea que es por
construcción el último en aterrizar del stream: hay una ventana en la que la
gráfica ya dice «no hay viajes» y el aviso todavía no existe. Las otras cuatro
tarjetas del mismo selector sí distinguen `null` en su propio sitio
(`panel-periodo.tsx:85-86` Viajes, `:110-111` Gasto, `:125-128` Liquidado,
`:145-151` Top rutas), que es exactamente lo que la c3 dio por cerrado.

Consecuencia: la afirmación «aún no hay viajes» es la que el CLAUDE.md nombra
como el modo de falla que define al producto — «el panel afirma "aún no hay
liquidaciones" estando ciego».

Causa raíz probable: la firma de `PanelPeriodo` declara `porMes:
Array<…>` no-nulable (`panel-periodo.tsx:41`) mientras `porDia` sí admite
`null` (`:39`); el `??` se puso en el call site para satisfacer el tipo.

---

### [MEDIO] `ComboCatalogo` no vuelve a resolver el id cuando llegan las sugerencias: el nombre exacto pegado desde el TMS se manda con id vacío

`src/app/dashboard/combo-catalogo.tsx:93-101`, con `:107` y `:117`

```tsx
const alEscribir = (v: string) => {
  setTexto(v);
  const coincide = opciones.find((o) => o.etiqueta.toLowerCase() === v.trim().toLowerCase()); // :97
  setId(coincide ? coincide.id : null);                                                       // :98
  …
  temporizador.current = setTimeout(() => pedir(v), FRENO_MS);                                 // :100
};
```

`id` se deriva de `texto × opciones` pero **solo se recalcula cuando cambia
`texto`**. `pedir()` (`:82-89`) llega 200 ms después y hace `setOpciones(r)` sin
que nada vuelva a intentar el emparejamiento. El `required` (`:117`) está en el
input **visible**, no en el hidden que lleva el `name` (`:107`), así que el
navegador deja enviar.

**Escenario con valores.** `/dashboard/despacho`, tarjeta «Asignar y avisar»
(`despacho/acciones.tsx:48`). Flota con 7,500 operadores. El jefe de tráfico
enfoca el campo → `onFocus` (`:120`) dispara `pedir('')` → llegan las 20 primeras
opciones. Pega desde su TMS `MARTÍNEZ LÓPEZ, JOSÉ ANTONIO`. `alEscribir` corre
con esas 20 opciones, que no lo incluyen → `setId(null)`. 200 ms después el
servidor devuelve exactamente `[{ id:'op-3391', etiqueta:'MARTÍNEZ LÓPEZ, JOSÉ
ANTONIO' }]`, el `<datalist>` lo enseña, el input ya contiene ese texto
carácter por carácter… y el hidden `operadorId` sigue en `''`. La pista ámbar
dice «Elige uno de la lista: se guarda el registro, no el texto» (`:133-135`)
sobre un texto que **sí** está en la lista. Aprieta «Asignar y avisar» →
`despacho/page.tsx:175-176` devuelve **«Falta el viaje o el operador.»** La única
salida es borrar un carácter y volver a escribirlo (entonces sí corre
`alEscribir` con las opciones buenas).

El mismo componente monta en `forma-viaje.tsx:100/116/143`,
`[id]/detalle.tsx:171` y `clientes/forma.tsx:207`. En ese último el campo vacío
**no** es un error sino un significado distinto: `etiquetaVacia` es «Tarifa de
lista — aplica a cualquier cliente» y `page.tsx:150` lo lee como
`clienteId: ''`. Es decir, en Tarifas el mismo tropiezo no da un mensaje de
error: convierte silenciosamente una tarifa negociada en tarifa de lista.

Consecuencia: el flujo por el que se despacha un viaje se atora en el paso que
más se usa (pegar el nombre), y en Tarifas la misma causa cambia a quién aplica
un precio.

Causa raíz probable: el emparejamiento vive en el manejador de teclado en vez de
derivarse de `[texto, opciones]`.

---

### [MEDIO] El Cerebro por delta deja la tarjeta abierta mostrando dos momentos a la vez, y el CSV exporta el viejo

`src/app/admin/mapa-prospectos/cerebro.tsx:357-359`, `:532-555` y `:476`

El refresco por delta (FE-16) actualiza la fila ligera:

```ts
const aplicar = useCallback((d: DatosMapa): number => {   // :532
  …
  const cambios = new Map(llegaron.map((p) => [p.id, p]));
  siguiente = [...altas, ...antes.map((p) => cambios.get(p.id) ?? p)];   // :547
```

…pero los textos largos viven en una caché aparte que **nunca se invalida**:

```ts
const pedirTextos = useCallback(async (ids: string[]) => {           // :357
  const faltan = [...new Set(ids)].filter((id) => !pedidos.current.has(id));
  if (faltan.length === 0) return;                                    // :359
```

`aplicar` no toca `pedidos.current` ni `textosRef.current`, así que un prospecto
ya pedido jamás vuelve a pedirse mientras la pestaña viva.

**Escenario con valores.** 09:10. Javier abre la tarjeta de `TRANSPORTES ÁGUILA
SA`; `pedirTextos` trae `notas: "Sin teléfono verificado. 12 unidades."` y marca
el id en `pedidos`. 09:40, el enriquecedor actualiza esa fila:
`num_unidades` 12→40, `telefono` capturado, `necesidad_pct` recalculado y `notas`
reescritas a `"Tel. verificado 81-8888-0000. 40 unidades, 3 patios."`. 09:45,
latido: `?desde=` trae la fila; `aplicar` la reemplaza en su lugar; el pin cambia
de color, el KPI «con teléfono» sube y la cabecera de **esa misma tarjeta**
enseña 40 unidades — mientras el bloque de notas debajo, en el mismo recuadro,
sigue diciendo «Sin teléfono verificado. 12 unidades.» Dos momentos en una
tarjeta, sin nada que lo señale.

Y el CSV lo hereda: `:476` arma el archivo con `csvDe(lista, textosRef.current)`
— la lista es del último delta y la columna `notas` (`:128`) es de cuando cada
tarjeta se abrió por primera vez.

**Intenté refutarlo por el lado del conteo.** El guardarraíl que sí existe
(`:581-585`) compara `d.total` contra el conteo del cliente para cazar una BAJA y
pedir la carga completa; eso rehace todo, `textosRef` incluido. Pero solo se
dispara cuando los conteos **no cuadran**, y aquí una actualización no cambia
ningún conteo: la ruta del hallazgo pasa por debajo de esa defensa.

Consecuencia: es la consola con la que se prospecta. Javier llama con la
información vieja, o exporta un CSV donde la columna de notas es de horas atrás
sin que el archivo lo diga.

Causa raíz probable: la caché de textos se indexa por id y no por versión; el
delta trae `updated_at` pero nada lo usa para invalidar.

---

### [BAJO] Los dos registros de `/dashboard/clientes` se borran el filtro entre sí, justo lo que el comentario dice haber evitado

`src/app/dashboard/clientes/vista.tsx:168-172` y `:384-389`, con
`src/app/dashboard/registro-filtro.tsx:42-43` y `src/app/dashboard/paginar-registro.ts:95-108`

El comentario de `vista.tsx:385-387` afirma: «las tarifas tienen sus PROPIOS
parámetros (`qt`/`pt`/`editarT`) para que buscar una tarifa no mueva la tabla de
clientes de la misma pantalla». Los nombres sí están separados, pero el
transporte no: `FiltroRegistro` es un `<form method="get" action={ruta}>` que
solo lleva `camposOcultos` (`registro-filtro.tsx:43`), y un GET **reemplaza el
query string entero**. `urlRegistro` (`paginar-registro.ts:101`) arranca de
`new URLSearchParams(sufijo)`, que trae únicamente `?tenant=`/`?vista=`/`?rol=`.

**Escenario con valores.** El contralor está en
`/dashboard/clientes?q=cemex&p=2`, viendo el cliente 26 de sus 40 coincidencias.
Escribe «Monterrey» en la caja de Tarifas y aprieta Buscar. La URL resultante es
`/dashboard/clientes?qt=Monterrey` — sin `q` ni `p`. La tabla de Clientes vuelve
a los 1,200 sin filtrar, página 1. Lo mismo al revés, y lo mismo al abrir
cualquier «Editar» (`vista.tsx:214-217` conserva `q`/`p` pero tira `qt`/`pt`;
`:433-436` al contrario).

Consecuencia: el usuario pierde su lugar en la tabla larga cada vez que toca la
corta. Se degrada y se nota, pero no miente ninguna cifra.

Causa raíz probable: la separación se hizo en los NOMBRES de los parámetros y no
en el transporte; los campos ocultos del `<form>` y el arranque de `urlRegistro`
solo conocen el sufijo del superadmin.

---

### [BAJO] El esqueleto del bloque más alto del Resumen mide un tercio de lo que va a caer — la regla que el propio módulo escribe

`src/app/dashboard/inicio-contenido.tsx:382` contra
`src/app/dashboard/panel-periodo.tsx:62-157`, con la regla en
`src/app/dashboard/bloque.tsx:31-34`

`bloque.tsx:31-34` la escribe en mayúsculas: «LA REGLA DEL ESQUELETO: misma
altura aproximada que el contenido real. Un esqueleto de 40px donde luego caen
300 produce el salto de layout que el streaming venía a evitar». El bloque de
Estadísticas reserva `<EsqGrafica alto={260} />` — una tarjeta con dos barritas
de título y una mancha de 260 px, ≈320 px con su padding. Lo que aterriza es
`PanelPeriodo` entero: la barra del selector (`:66-76`), la fila Viajes +
Actividad (dos tarjetas con `min-h-[110px]` y la gráfica de barras a `alto={192}`,
`actividad.tsx:66`), la fila Gasto + Liquidado y la tarjeta de Top rutas a todo
lo ancho. Son cuatro filas de tarjetas, del orden de 800–900 px.

**Escenario:** el usuario está leyendo la tabla «Viajes recientes» cuando
aterriza el bloque de abajo; la altura del documento crece ~550 px de golpe y la
barra de scroll salta bajo el cursor. No mueve contenido hacia arriba (el bloque
es el último), por eso va en BAJO y no arriba.

La prueba que vigila esto (`bloque.test.tsx:223-238`) mide `EsqCifras`
(`min-height:100px`) y que la rejilla sea la misma cadena; no compara ningún
esqueleto contra el alto de su contenido, que es lo que la regla pide.

Consecuencia: deuda que va a cobrar factura en cuanto alguien mida CLS.

Causa raíz probable: `EsqGrafica` se escribió para UNA gráfica y se reusó para un
panel de cinco.

---

## Lo que revisé y está bien

Vale tanto como los hallazgos, y aquí sostiene la mitad de la nota.

- **La compuerta, medida por mí.** `npx tsc --noEmit -p .` sin salida.
  `npx vitest run`: **485 archivos, 6,247 pruebas pasando** (1 saltada), 97.6 s
  — ejecutado ANTES de que apareciera la modificación de `formato.ts`. Con ella,
  `src/lib/formato.test.ts` falla 3 de 40.
- **FE-14, el patrón: bien hecho y bien probado.** `bloque.tsx:42-54` pone el
  límite de error POR FUERA del `Suspense` (que no atrapa errores, solo espera) —
  el orden correcto, y está razonado en `limite-error.tsx:6-24`. `vigilar()`
  (`bloque.tsx:70-73`) adjunta un observador sin tragarse el rechazo, con dos
  pruebas que lo fijan (`bloque.test.tsx:200-220`, una de ellas escuchando
  `process.on('unhandledRejection')` de verdad). Las pruebas de streaming corren
  sobre `renderToPipeableStream` con `onShellReady` y verifican tanto el primer
  flush como la contraprueba de que el mismo árbol SIN boundary no manda nada
  (`:114-125`). Y `:249-265` es una red real contra el revertido: lee el fuente
  de las cinco pantallas y exige un mínimo de `<Bloque>` en cada una.
- **Las promesas se lanzan sin `await` en el padre, verificado archivo por
  archivo.** `inicio-contenido.tsx:119-152` (16 lanzamientos, ningún `await`
  antes del `return`), `inicio-operacion.tsx:92-112`,
  `contador/inicio-contador.tsx:87-104`, `agentes/liquidacion/page.tsx:65-79`.
  Las derivadas van por `.then` sobre promesas ya lanzadas
  (`inicio-contenido.tsx:159-170`, `:188-207`), que no re-serializa nada. La
  trampa que el encabezado documenta no se pisó en ninguna de las cinco.
- **`null ≠ 0` se respeta tarjeta por tarjeta en el resto del selector.**
  `panel-periodo.tsx:85-86` («No se pudo cargar esta gráfica») contra `:92-94`
  («Aún no hay viajes registrados en este periodo»); igual en `:110-116`,
  `:125-135` y `:145-152`. `BloqueViajes` (`inicio-contenido.tsx:686-692`) dice
  «no significa que no haya viajes». `BloqueArranque` (`:440`) se niega a
  palomear de cortesía si la consulta falló.
- **Los rótulos de ventana siguen puestos** (cierre de A11 de la ronda 18):
  `panel-periodo.tsx:58-60` imprime `rotuloVentana(bloque, modo)` junto a cada
  título, y `ventana-periodo.test.ts` lee el fuente de `analytics.ts` para que
  las escalas no se desfasen en silencio. Los cinco bloques del selector se
  mueven juntos desde un solo `modoIdx` (`:47-48`): no hay forma de que una
  tarjeta quede en otra ventana que su vecina.
- **Un solo «hoy» por render, compartido por todos los bloques.**
  `inicio-contenido.tsx:108`, `inicio-operacion.tsx:88`,
  `contador/inicio-contador.tsx:72`. El streaming no puede partir la pantalla en
  dos días distintos porque el día se resuelve antes de lanzar la primera
  consulta. (Que ese «hoy» sea el correcto es el CRÍTICO de arriba; que sea
  **uno solo** está bien resuelto.)
- **Los esqueletos usan LA MISMA cadena de rejilla que el contenido.**
  `inicio-contenido.tsx:356` (`grid grid-cols-1 sm:grid-cols-3 gap-2`) contra el
  contenido real en `:605` — idénticas. Y los condicionales de verdad
  (`BloqueArranque`, `BloqueInsight`, `BloqueAlertas`) van con `esqueleto={null}`
  a propósito y con la razón escrita (`:310-314`, `:324`): reservar hueco para
  algo que casi siempre resuelve en «nada» sería el salto garantizado.
- **Accesibilidad del estado de carga.** `bloque.tsx:85-89` envuelve cada
  esqueleto en `role="status" aria-label="Cargando"` — la misma etiqueta que
  `cargando.tsx`, y el shimmer va `aria-hidden` (`:79`). El lector oye
  «Cargando», no el ruido de los recuadros.
- **FE-16, la parte del transporte, está bien pensada.** `latido.ts:35-63` no
  late con la pestaña oculta, deja UN latido a deber y al volver dispara uno
  solo (no la ráfaga), y `enVuelo` impide encimar dos lecturas del universo;
  todo el módulo es puro y probable (`latido.test.ts`). El servidor ignora una
  marca que no es fecha en vez de mandarla a Postgres
  (`api/admin/mapa-prospectos/route.ts:28`), y `getDatosMapa` usa
  `traerTodoEnParalelo` en lugar de `.limit()` para no comerse el recorte mudo
  de 1,000 filas de PostgREST (`prospectos-mapa.ts:614-629`). El delta detecta
  bajas comparando `total` del servidor contra el conteo del cliente
  (`cerebro.tsx:581-585`).
- **`ComboCatalogo` cierra bien la carrera del autocompletado.**
  `combo-catalogo.tsx:79`, `:83-88`: un número de vuelo por petición, y una
  respuesta vieja que llega tarde no pisa a una nueva. El fallo de red pinta «No
  se pudo buscar en el catálogo» (`:128-131`) en vez de dejar un combo mudo que
  se lea como «no hay ninguno», y `total` solo se afirma cuando el host lo contó
  (`:58-61`).
- **`paginarRegistro` sanea todo y no promete lo que no cuenta.**
  `paginar-registro.ts:79-85`: una `p` que no es número, una `q` de 10 KB o un
  `editar` inventado se leen como «primera página, sin filtro, nada abierto»; el
  `?editar=` que no está en la página visible se apaga (`:85`), así que no viaja
  al DOM el formulario de una fila que nadie mira. `FiltroRegistro` declara «25
  de 7,500» (`registro-filtro.tsx:66-70`) — un tope que no se lee como total. Y
  `camposDeSufijo` (`paginar-campos.ts:10-18`) evita que un GET saque al
  superadmin de la flota que estaba viendo.
- **`getUnidades` y `getOperadoresDetalle` fallan cerrado donde deben.**
  `unidades/page.tsx:35-37` no atrapa a propósito y lo dice; `operadores/page.tsx:66-71`
  sí atrapa, también a propósito, y explica por qué («una lista vacía sería
  mentira, y la peor»).
- **Trabajo obligatorio del rubro — los mapas literales contra `src/types/`.**
  Revisados los nuevos y los tocados por el delta: `EstadoVigencia`
  (`unidades/vista.tsx:15-20`, `Record<EstadoVigencia, …>` completo, un valor
  nuevo no compila); `unidad.estado` (`:23-28`, los 4 de la 0047 con fallback);
  `TipoDiferencia` (`agentes/liquidacion/rotulo-diferencia.ts:18-55`,
  `Record<TipoDiferencia, string>` con los 35 de `types/likida.ts:69-110`);
  `c_FormaPago` (`[id]/vista.tsx:142-150`, con `?? clave` — una clave
  desconocida se pinta cruda, no se adivina); `ETIQUETA_CAPTURA`
  (`[id]/vista.tsx:177-181`, los tres tipos que el motor NO mete en ninguna
  cubeta). Ninguno divergido.
- **Una tercera ortografía de «duplicado», que NO levanto como hallazgo
  aparte.** `prospectos-mapa.ts:527` filtra con `/DUPLICADO:/` (sensible a
  mayúsculas) y `:585` cuenta con `ilike '%DUPLICADO:%'` (insensible). Un `notas`
  con «duplicado:» en minúsculas haría que los dos conteos no cuadraran y el
  Cerebro pediría la carga completa (33 MB) en **cada** latido — justo lo que
  FE-16 vino a quitar. No lo reporto como hallazgo porque no pude construir el
  escenario con un valor real: la marca la escribe el deduplicador de la 0139
  siempre en mayúsculas, y no encontré otro escritor. Queda anotado.

---

## Lo que NO alcancé a revisar

Sin esto la nota es una mentira por omisión.

- **No miré un solo render. Cuarta ronda seguida.** Corrida en la nube, sin
  `npm run build`, sin base y sin credenciales. Todo lo de arriba es lectura de
  código y aritmética verificada a mano. En particular: **el streaming nunca se
  vio ocurrir**. No sé cómo se ve el aterrizaje de 17 bloques en el Resumen, si
  los esqueletos parpadean, ni si el orden de llegada produce un baile de layout.
  Los altos de esqueleto que declaro en el hallazgo BAJO están calculados por
  composición de clases, no medidos en píxeles.
- **El caso «el stream se corta a la mitad» quedó sin verificar, y es de mi
  foco.** Ninguna página de `/dashboard` declara `maxDuration`
  (`rg -n maxDuration src/app` solo devuelve rutas de `/api`). Con streaming, una
  invocación que la plataforma mata **después** del primer flush no puede
  devolver un 504: el navegador ya recibió un 200 y HTML válido, así que el
  usuario se queda con esqueletos que no aterrizan nunca y sin ningún error. No
  pude confirmar el comportamiento —depende del plan de Vercel y de qué hace
  React con un stream RSC truncado— y por eso NO lo reporto como hallazgo. Es la
  primera cosa que probaría con un entorno real.
- **La recuperación del `LimiteError` la deduje del contrato de React y de
  `router.refresh()`, no la ejecuté en un navegador.** El código no tiene camino
  de reseteo, eso es verificable leyendo; que `router.refresh()` conserve el
  estado del cliente es contrato documentado de Next, no una medición mía.
- **`/dashboard/facturacion` y `/dashboard/clientes` usan un `Bloque` LOCAL**, no
  el de FE-14 (verificado: no importan `../bloque`). No los audité como parte del
  streaming y no comprobé si su manejo de error es equivalente.
- **Contraste: nada medido en este delta.** El código nuevo
  (`combo-catalogo.tsx`, `registro-filtro.tsx`, `bloque.tsx`) usa tokens y no hex
  a mano, así que **asumí** que `contraste.test.ts` lo cubre. Asumí, no
  verifiqué. Los hex de `admin/mapa-prospectos/[id]/detalle.tsx` siguen fuera de
  su alcance (reincidente c2 #5) y siguen sin verse.
- **Lector de pantalla: no probado.** `role="status"`/`aria-label="Cargando"` en
  los esqueletos y `role="combobox"`/`aria-controls`/`aria-expanded` en
  `ComboCatalogo` son más de lo que había, pero nadie los oyó. En particular no
  sé qué anuncia un lector cuando 17 regiones `status` aterrizan en cascada.
- **Responsive: sin verificar.** La tabla de 10 columnas del registro de viajes a
  390 px, el `min-[1100px]:grid-cols-5` de los KPIs del detalle
  (`[id]/detalle.tsx:200`) y el `<details>` del importador posicionado
  `absolute` sobre la tabla (`viajes/vista.tsx:146-149`) siguen sin mirarse.
- **Las ~24 páginas de `/dashboard` que la ronda 18 dejó fuera siguen fuera**:
  `rentabilidad/`, `combustible-casetas/`, `conocimiento/`, `politicas/`,
  `integraciones/`, `llaves-api/`, `notificaciones/`, `mapa/`, `soporte/`,
  `despacho/` (solo abrí `acciones.tsx`), `carta-porte/`, `conexiones/` y
  `agentes/{peajes,notificaciones}`. De `/admin`, ~35 pantallas fuera del
  Cerebro, Flotas y `ui/kit`.
- **Los dos escenarios de dinero están construidos con aritmética, no medidos.**
  El de «Dinero observado» ($20,062 vs $94,162) sale del SQL de las dos
  funciones y de la mecánica del motor; la base está en cero (0 viajes), así que
  no hay tenant contra el cual correrlo.
