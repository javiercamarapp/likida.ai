# Síntesis — auditoría 19 (24-ago-2026, en la nube, desatendida)

**Global 4.7/10 — baja 0.6 contra el 5.3 de ayer. Ningún rubro sube.**

Ronda **COMPLETA**, no continuación: `list_pull_requests(state=open)` no devolvía ningún
PR de auditoría (el #34 de la 18 ya se fusionó en `bb6eefc`), y `master` avanzó de
`583fec4` a `8b43121` — **162 archivos, +10,807 / −548** en `src/`, `supabase/` y
`normas/`. Los doce rubros tenían código nuevo, así que se relanzaron los doce con
contexto fresco.

**167 hallazgos con ficha: 19 CRÍTICO · 66 ALTO · 60 MEDIO · 22 BAJO.**
**3 arreglados** con prueba que los reproduce y commit atómico.
Árbol limpio al arrancar → autofix habilitado. Rama `claude/auditoria-19`, **PR #52**.

---

## Por qué baja, y qué significa exactamente

El delta de ayer fue el más grande en peso de producto que ha entrado a este repo:
un módulo de contabilidad completo, el GPS con su primer escritor real, un outbox
durable, entrevista de onboarding conducida por modelo, CRM. **Casi todo lo que trajo
llegó sin la red que el resto del repo ya tenía**, y ése es el patrón de la ronda:

- El **outbox** nació sin leer el kill switch, siendo el único de siete crons.
- La **póliza** nació sin el guarda de área «dinero», siendo la única de cinco rutas de
  `export/`.
- El **GPS** nació escribiendo ubicación mientras el aviso de privacidad que el chofer
  lee sigue diciendo, en negritas, que no hay GPS.
- El **onboarding por chat** nació persistiendo la política de demo como política
  declarada de la flota.

No es que el código nuevo esté peor escrito. Es que **la organización aprendió cinco
guardas a lo largo de dieciocho auditorías y el código de ayer no heredó ninguno**. Cada
uno de esos cuatro es un patrón que ya existía a tres archivos de distancia.

La otra mitad de la bajada es reincidencia dura, y aquí no hay lectura amable:

| Rubro | Reincidentes | Cerrados por el delta |
|---|---|---|
| Seguridad | 8 de 8 abiertos | **0** |
| Frontend | 8 de 8 abiertos | 0 (uno de la c2 sí cerró) |
| Legal | 13 verificados uno por uno | 1 a medias |
| Agéntico | 10 de 13 abiertos | 5 |
| Fiscal (el 15% en SQL) | 4ª ronda consecutiva | 0 |

Que la global baje después de la semana de más producto es un resultado válido y hoy es
el más informativo: **el ritmo de construcción va por delante del ritmo de endurecido, y
la distancia creció.**

---

## Lo arreglado, con su prueba

Tres, en serie, cada uno con la suite completa entre medias. **Tope de 3 vueltas: se
usaron las 3. Ninguna revertida.**

| # | Hallazgo | sha | La prueba |
|---|---|---|---|
| 1 | **BACK-19-1 (CRÍTICO)** — el outbox de WhatsApp mandaba con el kill switch apagado | `dae7f64` | Javier apaga el sistema en un incidente. `wa-pendientes` deja de encolar; el outbox sigue vaciando cada minuto a teléfonos reales lo que ya estaba dentro. Era el **único de los siete crons** sin `leerInterruptor`. La compuerta va ANTES de reclamar: un lease tomado con el sistema apagado secuestra la salida hasta que expire. **Sin el arreglo: 2 de 4 rojas** — el `fetch` a `graph.facebook.com` se dispara con la palanca en `apagado` y en `ilegible` |
| 2 | **FE-19-1 (CRÍTICO)** — la compuerta de onboarding no disparó nunca | `5669a73` | `redirect()` de Next **lanza** un `NEXT_REDIRECT`; vivía dentro de un `try/catch` puesto para que un bache de lectura no cerrara la puerta, y el `catch` desnudo no distingue el bache del redirect. El dueño con perfil fiscal incompleto aterrizaba **siempre** en el Resumen, con el umbral de peaje sin declarar y el motor fail-open pintando un 50% que quizá no le toca. Confirmado contra los docs de Next empaquetados en el repo (`redirect.md:53`). **Sin el arreglo: 2 de 5 rojas**, y la página devolvía `<InicioContenido>` |
| 3 | **SEG-19-1 (ALTO)** — la póliza contable no preguntaba por el área «dinero» | `6697f32` | `puedeExportar` incluye al `encargado` (`permisos.ts:17`); sus áreas son `['operacion']` a secas (`visibilidad.ts:41`). Con un solo guarda, el jefe de tráfico se bajaba el asiento contable completo de su flota —anticipo, IVA acreditable y diferencia por liquidación— en el formato que su ERP importa. **Sin el arreglo: 1 de 4 roja** — el `encargado` recibe 503, no 403, porque pasó el guarda y llegó a leer el catálogo |

Los tres comprobados **corriendo la prueba antes del arreglo**. Suite final: **504
archivos, 6,447 pruebas, 1 saltada**; `tsc` limpio; `eslint` 0 errores.

**Dos auditores llegaron al #3 por caminos distintos**: seguridad leyendo las cinco rutas
de `export/`, y pruebas **ejecutando la ruta real** (200 con el asiento completo para el
`encargado`, 403 en las cuatro hermanas). Cuando dos métodos independientes coinciden,
el hallazgo deja de necesitar defensa.

---

## Las doce notas

| Rubro | Antes | Hoy | Δ | Razón, y qué la sostiene |
|---|---|---|---|---|
| Operabilidad y DX | 6 | **6** | = | *Se atacó y subió* (`ci-postgres` volvió a verde, cerrando el crítico de la 18) contra *mirada más profunda*: producción corre `df6b1be` y `master` va en `8b43121`, con los tres semáforos en verde. Del mismo tamaño |
| Backend y API | 7 | **6** | −1 | *Deuda que cobró factura* — el outbox nuevo nació sin la palanca que los otros seis crons ya tenían. **Arreglado esta ronda**, y aun así baja: el patrón es que la superficie nueva no hereda los guardas |
| Modelo de datos | 7 | **6** | −1 | *Deuda que cobró factura* — la 0181 ensanchó `prospecto.estado` de 6 a 14 valores sin tocar las dos máquinas de estado de TS que lo leen; `wa_outbox.dedupe_key` es la única unicidad de la tabla y ningún escritor la llena; `unidad.gps_device_id` no tiene escritor y el poller cuenta el 100% de las lecturas como huérfanas |
| Frontend | 6 | **5** | −1 | *Deuda que cobró factura* — 8 de 8 reincidentes de la c4 siguen abiertos, y la compuerta de onboarding que el delta vino a instalar no disparó nunca. **Arreglada esta ronda** |
| Seguridad | 6 | **5** | −1 | *Deuda que cobró factura* — **de los 8 reincidentes de la c4, los 8 siguen abiertos; el delta cerró cero.** Sin críticos, y eso también es información: `npm audit` limpio en dev y prod, ningún acceso sin autenticar a datos de un tenant, ningún secreto con fallback derivado |
| Pruebas | 5 | **5** | = | *Se atacó y subió* la mitad SQL —179 migraciones aplicadas sobre un **Postgres 16 real**, 0 fallos, primera vez en tres continuaciones que la cifra no sale de un `psql` falso— contra *deuda que cobró factura*: 19 bloques de `verificaciones.sql` son no-ops permanentes y tres contradicen hoy su propio `(esperado …)` |
| Rendimiento y costo | 5 | **5** | = | *Mirada más profunda* — sus dos críticos son reincidentes de la c4 y ninguno se tocó: el agregado fiscal agrupa por el nombre del emisor **tal como lo leyó el modelo de visión**, y `anomalias_gasto_tenant` conserva el anti-join por `position()` que `duplicados.ts` documenta haber quitado |
| Arquitectura | 4 | **4** | = | *Deuda que cobró factura* — el CRÍTICO del folio fiscal de la c4 **cerró y está verificado**, y en su lugar apareció el **sexto** normalizador, también al revés, con una prueba verde certificándolo: se arregló la instancia, no la clase. `repo.ts` pasó de 128 a 171 archivos que lo saltan, con la allowlist congelada en 16 |
| Sistema agéntico | 5 | **4** | −1 | *Deuda que cobró factura* + *mirada más profunda* — 5 de 13 reincidentes cerrados (4 porque `piloto_vision.ts` dejó de existir), pero la superficie agéntica nueva llegó con su propio crítico: el PDF adjunto se queda pegado a la conversación y la razón social del receptor CFDI acaba siendo el extracto de la constancia |
| Tool calling | 5 | **4** | −1 | *Deuda que cobró factura* — el configurador persiste la política **de demo** como política declarada de la flota, y la pregunta que lo dispara promete por escrito lo contrario. La regla estructural (`properties: {}`) se respeta; lo que falla es lo que la herramienta **escribe** |
| Cumplimiento fiscal | 3 | **3** | = | *Se atacó y subió* (llegó `gasto.descuento`, la columna que la c4 pidió) contra *mirada más profunda*: un CFDI con **dos o más conceptos** nunca recibe `xml_verificado` y su IVA, su estímulo de peaje y sus litros salen en cero **sin una línea que lo diga**. El 15% medido en SQL con `forma_pago='01'` va por su **cuarta** ronda |
| Cumplimiento legal | 4 | **3** | −1 | *Deuda que cobró factura* — 13 reincidentes verificados uno por uno contra el código de hoy, y el GPS nuevo asienta la ubicación de un chofer identificable cada 5 minutos mientras los dos avisos que ese chofer recibe afirman **en negritas** que no hay GPS |

Suma **56 / 12 = 4.67 → 4.7**.

Serie: **6.1 · 4.8 · 5.8 · 5.3 · 4.7**.

---

## Lo que necesita decisión del dueño, no más código

1. **Producción no tiene el commit de ayer, y los semáforos no lo dicen.** `8b43121`
   («endurecer Likida… enterprise», 87 archivos) **no lleva `[deploy]` en el asunto**,
   así que el `ignoreCommand` de `vercel.json:3` saltó el build; el último commit con
   bandera es `df6b1be`. Y la comprobación de sha de `salud-produccion.yml:44` está
   gateada en `if: github.event_name == 'push'` **y** en que el asunto lleve la bandera,
   así que la rama `schedule` —la que corre cada media hora y lleva toda la mañana en
   verde— **nunca compara versión**. Nada del GPS, del outbox ni del export contable
   está vivo. Es exactamente el modo de falla que `CLAUDE.md` documenta como silencioso.
2. **El aviso de privacidad dice «No hay GPS» y el GPS lleva un día escribiendo.**
   Cuatro críticos legales. Además `/aviso/<tenant>` sigue 404 para toda flota real —
   **quinta pasada pidiéndolo**, y ahora falta **una sola columna** (`domicilio_fiscal`;
   `razon_social` ya la escribe `saas/fiscal.ts:174`).
3. **La cancelación ARCO no tiene quien la llame.** `ejecutar_arco_cancelacion`
   (migs. 0173/0178, el commit *«una cancelación que de verdad cancela»*) tiene **cero
   llamadores en `src/`**: sus únicos invocadores están en `supabase/verificaciones.sql`.
4. **Un CFDI con dos o más conceptos sale en ceros y no lo dice.** Contra la regla
   fundacional del producto: *nunca inventar una cifra, y si no hay dato decir qué falta*.
   Aquí no se inventa — se imprime cero, que se lee como medición.
5. **19 bloques de `verificaciones.sql` son no-ops permanentes**, y tres contradicen hoy
   su propio `(esperado …)`. Probado metiendo una fuga real (`where true` en
   `anomalias_gasto_tenant`) contra un Postgres real: **la batería la midió y aun así
   salió EXIT=0**.
6. **`.gitignore:34` se traga la carpeta de la auditoría.** `docs/auditoria-*/` entró en
   `f5bdc3f` (21-ago) colado en un commit de operabilidad. `docs/auditoria-18/` sobrevive
   solo porque ya estaba rastreada. Sin `git add -f` **la ronda entera desaparece del PR
   sin avisar**, y `git status` tampoco la muestra.

---

## Lo que esta ronda NO verificó

- **De los 167 hallazgos verifiqué a fondo seis**, los de mayor daño, abriendo el archivo:
  el kill switch del outbox, el `redirect()` en el `try/catch`, la póliza sin guarda de
  área, el GPS contra el aviso, `ejecutar_arco_cancelacion` sin llamadores, y el commit
  sin `[deploy]`. **El resto se toma como lo escribió su auditor.**
- **No pude confirmar la versión desplegada contra producción**: `curl` a
  `app.likida.ai/api/health` muere con `CONNECT tunnel failed, 403` — el egreso está
  bloqueado en esta caja. El hallazgo se sostiene **por construcción** (el asunto de
  `8b43121` no lleva la bandera, y el `ignoreCommand` solo lee el asunto), no por
  observación directa. El auditor de operabilidad sí citó un log de job con
  `"version":"df6b1be"`; **yo no lo repetí**.
- **`npm run build` no se corrió** (sin `.env`), por diseño de la corrida en la nube.
- **Ninguna migración la ejecutó el orquestador.** Dos auditores sí levantaron Postgres 16
  local y aplicaron las 179; sus cifras salen de ahí, pero **yo no las repetí**.
- Los **conteos por severidad son los de cada auditor**, no una clasificación mía. Hay
  solapamiento deliberado: el kill switch del outbox lo reportan backend, seguridad y
  operabilidad; la póliza sin guarda, seguridad y pruebas. **19 críticos no son 19 bugs
  distintos.**
- La intermitente de `engine_iva_medio_pago.test.ts:35` **no volvió a aparecer** en las
  cuatro corridas completas de hoy. Sigue abierta.

## Una nota de infraestructura, que no es un hallazgo

Una corrida completa salió con **1 roja** a media ronda. No era del código: el auditor de
pruebas tenía viva en el árbol una mutación suya (`cuentas.ts`, quitándole
`.eq('tenant_id', tenantId)` a tres consultas) como parte de su experimento. La revirtió,
y la corrida siguiente salió verde. **Los tres commits de arreglo se armaron con rutas
explícitas**, así que no arrastraron nada ajeno — verificado con `git show --stat`.
Doce auditores leyendo y un orquestador escribiendo sobre el mismo árbol funciona, pero
solo porque los auditores tienen prohibido commitear.
