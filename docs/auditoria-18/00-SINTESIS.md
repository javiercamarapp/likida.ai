# Síntesis — auditoría 18 (20-ago-2026, en la nube, desatendida)

**Global 6.1/10 — y el número NO tiene delta.** Doce rubros auditados de doce,
contexto fresco, uno por rubro. **83 hallazgos con ficha: 5 CRÍTICO · 30 ALTO ·
30 MEDIO · 18 BAJO.** **3 arreglados** con prueba que los reproduce y commit
atómico (1 crítico, 2 altos).

## Por qué esta ronda no reporta delta, y por qué eso importa más que el 6.1

La ronda anterior con síntesis completa es la **17** (13-ago, global 4.2). No se
compara contra ella, y la razón es dura:

> `4d4d7f6` (ronda 17) y `8d608a4` (`master` hoy) **no tienen ancestro común**.
> La raíz de una es `a3c9978 "Scaffold inicial de Cuadra"`; la de la otra,
> `36432e4`. Son dos linajes distintos dentro del mismo repositorio.

Restar 4.2 de 6.1 y publicar «+1.9, la mayor subida de la serie» sería comparar
dos códigos diferentes y acreditarle al equipo una mejora que nadie hizo. La
serie histórica **se corta aquí**: el 6.1 es una línea base nueva, no un logro.

Se agrava porque a los doce auditores les entregué el ancla equivocada —las
notas de la *auditoría 2* que viven en `references/rubros.md` (frontend 7,
backend 6, agéntico 5…)—, así que cada archivo de rubro dice «antes X» contra un
número que no le corresponde. **Sus hallazgos siguen siendo válidos**: cada uno
está anclado a `archivo:línea` leído hoy. Lo que no vale es su columna de delta.
Corregirlo cuesta una ronda: al ancla de mañana hay que darle este 6.1.

## Las tres correcciones de anclaje

Están en el `MAPA.md` con detalle. En corto: esta ronda es la **18** y no la 6
(hay ramas `claude/auditoria-{3,4,6,7,8,10,11,17}` en el remoto y 26 referencias
a «AUDITORÍA 6» dentro del código); `.gitignore:34` ignora `docs/auditoria-*/`,
que es **por lo que ninguna ronda deja rastro en `master`** y por lo que no se
podían contar; y de ahí salió el error del número.

## Convergencias entre auditores

Dos o más auditores independientes sobre el mismo `archivo:línea`. Es la
corroboración más fuerte que da este proceso, y de las cuatro salieron dos de
los tres arreglos:

| Hallazgo | Quiénes | Estado |
|---|---|---|
| `startup.ts:65-76` libera el mutex de otro proceso | agéntico + operabilidad | **ARREGLADO** `e1b9474` |
| El CFDI N:1 y su `cfdi_orden` | arquitectura (crítico) + datos (corroboró el índice `(tenant_id, cfdi_uuid, cfdi_orden)`) | **ARREGLADO** `ebefdfa` |
| Un mensaje muerto a media ráfaga queda sellado como procesado por su propio claim | agéntico + backend + **rendimiento** (tres) | pendiente |
| `/api/dashboard/ingesta` gasta visión sin techo y sin registrar costo | backend + seguridad | pendiente |

## Arreglado, con prueba que lo reproduce

| # | Hallazgo | sha | La prueba |
|---|---|---|---|
| 1 | **ARQ-1 (CRÍTICO)** — una factura que AMPARA N casetas (la consolidada de CAPUFE) se contaba como una sola: 8 casetas de $250 → comprobado **$250 de $2,000**, siete diferencias `duplicado`, y el operador acusado de duplicar | `ebefdfa` | 8 gastos con el mismo uuid y `cfdiOrden` 1..8 → $2,000. Sin el arreglo da $250. Contraparte: mismo uuid y **mismo** orden sigue siendo duplicado |
| 2 | **AGEN-1 (ALTO)** — el informe en PDF se acusaba como entregado aunque Meta lo rechazara: `if (!enviado)` sobre un objeto siempre truthy | `4f25078` | Meta responde 131030 → debe LANZAR. Sin el arreglo devuelve «Ahí te va tu informe en PDF 📊» |
| 3 | **AGEN-4 / OPER-1 (ALTO)** — el sondeo de arranque borraba el lease del viaje que otro proceso estaba cerrando | `e1b9474` | `try_lock` devuelve `false` → NO se llama `unlock_viaje`. Sin el arreglo, sí |

Ningún arreglo revertido. Los tres son quirúrgicos: tocan 7 archivos en total y
ninguno cambia una cifra que el contralor vea, salvo el (1), que la corrige.

## Los CRÍTICOS que quedan pendientes, con razón escrita

1. **El nombre del decisor de un prospecto sale hacia un modelo externo sin un
   solo aviso que lo cubra** (legal) — `api/admin/mapa-prospectos/mensaje/route.ts:74`
   interpola `contacto_nombre` y hasta 1,500 caracteres de `notas` en el prompt
   que va a OpenRouter. `/privacidad` se acota a «quien contrata y usa el
   servicio», y `prospecto_persona` (0138) no tiene una sola columna de
   consentimiento, aviso, ARCO ni purga — su propio comentario dice que un agente
   la va a llenar investigando la web, con correos `inferido`.
   **Verificado por mí** contra la ruta y la migración.
   **No se arregla de madrugada**: el arreglo es un aviso y una decisión de
   producto sobre datos de terceros, no un parche de código.

2. **La FK compuesta de la 0028 se quedó en cuatro relaciones; las veinte
   posteriores no la tienen, y la cadena de cobranza es una de ellas** (datos).
   No verificado por mí una por una — es el hallazgo que más trabajo de
   verificación pide y el que menos cabe en lo que queda de ronda.

3 y 4. **El presupuesto es por mensaje y el `maxDuration` es por invocación**
   (rendimiento): con `conPool(…,5,…)` seis fotos suman 124.6 s contra 120, y el
   cron de `LOTE=10` suma 623 s contra 120 sin un solo chequeo de reloj. Y **un
   mensaje matado a media corrida queda envenenado por su propio claim**:
   `claimMessage` reclama antes de cualquier efecto, el reintento sale
   `'duplicado'` y el cron sella `procesado_en`. La bandeja durable afirma por
   escrito que el comprobante se procesó. Es la convergencia de tres auditores.
   Pendientes: el arreglo correcto es un lease con TTL sobre el claim, que es
   diseño, no parche.

5. **`gasto` y `liquidacion` fuera de `ve_finanzas()`** (datos): cualquier rol de
   oficina las lee y escribe por PostgREST; el aislamiento vive en
   `visibilidad.ts`, no en la base.

## Lo que verifiqué y NO era como se reportó

- Nada resultó falso este pase. Lo que sí ajusté: el auditor fiscal calificó
  **ALTO** el 50% de peaje sobre casetas en efectivo; por el ancla del propio
  rubro («3 o menos si el producto imprime una cifra fiscal equivocada») eso es
  un **CRÍTICO de facto**, y lo cuento aparte más abajo. Lo verifiqué contra
  `normas/rmf-2026-9.1.8.yaml` (`verificado_fuente_primaria`), que dice literal:
  «La fr. III mata el efectivo: una caseta pagada en ventanilla con billetes NO
  genera estímulo aunque después se facture». `engine.ts:1008` no lee `formaPago`.
  Una caseta de $928 en ventanilla con CFDI → el papel imprime **$400.00**; la
  norma dice **$0.00**.
  **No lo arreglé, y la razón importa**: gatear el estímulo exige decidir qué
  hacer cuando `formaPago` viene `'99 · Por definir'` (todo PPD). Fallar cerrado
  baja cifras que el contralor ya vio; fallar abierto deja el error. Es una
  decisión de producto con dinero de por medio, y tomarla solo, de madrugada, es
  exactamente el «arreglo en la dirección equivocada» contra el que advierte la
  rutina.
- **El pie del PDF sí contradice la ficha** (`acreditable.ts:47-49`): imprime «si
  su contador toma el total con IVA, la cifra sube alrededor de 13.8%» cuando la
  ficha `lif-2026-20-A` marca H4 **RESUELTO desde el 14-ago** — RMF 9.1.8 fr. IV
  fija la base «sin incluir el IVA». Además el número está invertido: de $5,000 a
  $5,800 la cifra sube **16%**, no 13.8%. Verificado; **no arreglado** por el
  mismo motivo que arriba: es texto fiscal impreso y su redacción es del dueño.

## Las doce notas

Sin delta (ver arriba). La columna «antes» es la que el auditor recibió y **no
es comparable**; se conserva solo para que se vea de dónde salió su razonamiento.

| Rubro | Nota | «antes» (ancla inválida) | Lo que la sostiene |
|---|---|---|---|
| Frontend | **6** | 7 | Un selector rotula cinco ventanas de tiempo distintas y «Histórico» enseña 52 semanas de dinero; `StatCard` escribe «0% · sin movimiento» justo cuando NO pudo comparar |
| Backend y API | **7** | 6 | Los caminos de concurrencia ya tienen prueba propia; tres de sus cuatro ALTOs son pruebas que verifican la *forma* de la llamada y no el *comportamiento* de la base |
| Sistema agéntico | **5** | 5 | El ciclo del chofer vale 7 por su cuenta; lo compensa la mitad nueva (`oficina_wa`, `avisar_cierre`, inbox durable) cableada sin las mismas reglas |
| Tool calling | **7** | 6 | `properties: {}` sigue intacto en TODO el ciclo de WhatsApp y el chat del cliente, con prueba de invariante. Las 14 tools nuevas del copiloto sí aceptan datos del modelo — defendible (superadmin, cross-tenant a propósito) pero sin esa prueba |
| Seguridad | **7** | 7 | Ningún CVE con camino real, descartados uno por uno; ningún `/dashboard` cruza tenants; ninguna tabla sin RLS. Techo: `proxy.ts:155` excluye `/api` del matcher, así que las 40 rutas tienen una sola capa |
| Cumplimiento fiscal | **7** | 6 | El crítico histórico está cerrado y verificado: `engine.ts:978` fija `iepsAcreditable = 0` y el estímulo se entrega en **litros** en los seis caminos. Toda la deuda viva se concentró en el peaje |
| Cumplimiento legal | **6** | 6 | El carril del operador vale 8 solo; lo compensa el Cerebro de prospectos mandando nombres de personas a un modelo externo sin aviso |
| Arquitectura | **5** | 6 | El hallazgo canónico (`otro: 'Gasto'` / `otro: 'Otro'`) está **cerrado**; el motor de dinero es verificablemente puro. Pero 17 escritores a mano de `bitacora_auditoria` y la URL base en 7 sitios con 4 valores |
| Pruebas | **6** | 6 | Mutación real, 6 corridas: **4 rojas / 2 verdes**. Las verdes no son pruebas flojas, es ausencia: `requireVendedor` y las dos guardas de dinero de `facturacion_escritura.ts` no tienen arnés |
| Operabilidad y DX | **7** | 6 | La maquinaria está cableada de verdad (`onRequestError`, `flushObservabilidad`, CI con puerta). Techo: **ninguna alerta empujada en el camino del dinero** — `alertarOperador` solo aparece en los crons |
| Rendimiento y costo | **4** | 6 | La suma a mano del peor caso: un mensaje solo cierra (91.3 s contra 120), pero **nadie había sumado la ráfaga ni el cron**: 124.6 s y 623 s contra el mismo 120 |
| Modelo de datos | **6** | 7 | `viaje_estatus_dominio`, la unicidad del CFDI y `app_user.rol` cuadran letra por letra; los tipos no mienten sobre nulabilidad en el camino del dinero. El hueco es que el aislamiento vive en la aplicación |

**Suma 73 → 6.1.**

## Estado de la compuerta

Verde sobre el árbol final, corrida dos veces:

```
 Test Files  388 passed (388)
      Tests  5050 passed | 1 skipped (5051)
```

`npx tsc --noEmit` limpio. `npx eslint src/` 0 errores, 5 avisos (los mismos de
la línea base).

**Un rojo intermitente observado y no reproducido.** Durante la ronda, una
corrida completa terminó con 1 prueba roja; las dos corridas siguientes salieron
limpias. No pude identificarla con certeza —la salida se truncó— y **no la
cuento como verde ni como roja**. El candidato más probable es
`src/lib/likida/barrera.test.ts`, que usa temporizadores reales con esperas de
500–2,000 ms. Queda como pendiente de la ronda 19, y es materia del rubro de
pruebas: una prueba intermitente es la que enseña a ignorar la suite.
