# Auditoría 3 — Síntesis y recalificación (14-ago-2026)

**Global: 7.1** (recolección: 5.7 · auditoría 2: 6.2 · auditoría 1: 6.4).

La ronda tiene DOS números y los dos son verdad. **5.7** es lo que la mirada
encontró al recolectar: la más profunda hasta ahora (12 auditores sobre los 6
agentes estrenados hoy), y la deuda del día se cobró completa — tres embeds
sin alias tumbaron producción, un cron del dinero llevaba ~9 días tronando
con Sentry instalado, y lo legal recayó en el mismo gate que ya había pagado.
**7.1** es después de cerrar, HOY MISMO y con prueba-roja-primero cada uno,
los **6 críticos y los 25 altos** (31/31; cero falsos entre ellos: los 31 se
verificaron contra el código antes de arreglar).

**Desviación declarada del orden de la skill:** los arreglos (Fase 4)
corrieron ANTES del tablero (Fase 3) por directiva de Javier («soluciona los
31 hallazgos completos para poder continuar»). El tablero se pintó al final,
con los dos números.

**Compuertas al cierre (exit codes reales):** vitest **3,232 passed | 1
skipped** (271 archivos) · `tsc --noEmit` limpio · eslint 0 errores · `next
build` completo. La afirmación de /seguridad («más de 3,000 pruebas») quedó
**medida hoy**, no supuesta.

## Las 12 notas

| Rubro | Aud. 2 | Recolección | Cierre | Porqué del movimiento |
|---|---|---|---|---|
| Seguridad | 7 | 8 | **8** | Sube en recolección: lo nuevo de hoy (6 páginas, server actions, export CSV) salió LIMPIO de críticos/altos multi-tenant — el modo de falla #1 del código de agentes, atacado con el patrón exigirPermiso+closure. Nada que cerrar: se queda. |
| Frontend | 7 | 7 | **8** | Sus dos ALTOs propios cerrados con prueba: el comprobante sin monto ya no se adjunta como $0.00 (server action rebota ADENTRO) y la ventana-100 de getViajes se declara en Conductores, Mapa y Huérfanos. Queda mitigado, no eliminado, el re-check de destinoOk (propuesto). |
| Tool calling | 6 | 7 | **8** | TC-A1 cerrado: el turno del chat que truena a media corrida ya registra su costo parcial (PartialExecutionError → registrarCosto probado); el candado anti-quemadura dejó de ser ciego a su peor modo de falla. El trago de `eT` en openrouter.ts sigue propuesto (medio). |
| Fiscal | 6 | 6.5 | **7.5** | La card de peajes ya no afirma lo que ninguna ficha sostiene (cita LIF 2026 20-A verificada, las 4 condiciones completas, la base sin-IVA declarada como pregunta abierta) y el plazo del comercio vencido dejó de contarse como dinero perdido (es en_riesgo: el derecho vive todo el ejercicio). La base exacta del estímulo sigue abierta y DECLARADA. |
| Backend | 6 | 5 | **7** | Los caminos de dinero nuevos ya tienen candado EN LA BASE y prueba de concurrencia: unique(tenant,folio) aplicado y verificado (mig. 0092, verificación 67), claim atómico del pendiente de despacho, tierPendiente que escala y nunca repite, consolidado que propaga la falla y repara el reenvío. Nuevos laterales del importador (abajo) impiden más. |
| Agéntico | 5 | 6 | **7** | Los cuatro caminos de afirmación falsa, cerrados y FIJADOS con prueba: el «ya» pelón no cierra, la ventana de 24h cae a plantilla en vez de mudez, el choque 0029 se narra como permanente, y «el aviso va en camino» solo si avisado_en lo prueba. Quedan 6 medios (contacto-por-tier ilegible, «ok» cruzado…). |
| Datos | 7 | 6 | **7** | La factura de los embeds se pagó hoy — y ahora hay guardián ESTRUCTURAL (embeds_con_alias.test barre src/ entero y ancla los 3 sitios pagados): la clase de bug no puede volver callada. 0092 aplicada+verificada. La 0089 sin FK compuesta y la 0091 sin candado de signo siguen propuestas. |
| Pruebas | 6 | 6 | **7** | CI es puerta real y el skip-bajo-cobertura revivió (la bandera muerta CUADRA_→LIKIDA_ con aserción que ata config y skipIf); el guardián de embeds es de este rubro también; ~80 pruebas nuevas hoy, todas rojas-primero. El arnés manual fantasma citado en headers, corregido. |
| Operabilidad | 6 | 5 | **6.5** | El cron del dinero ya devuelve 500 cuando falla (el verde mentiroso murió), el fingerprint de Sentry discrimina tenant+causa (el silencio de 9 días tiene arreglo estructural: falla nueva = issue nuevo = notificación) y los envíos loguean destinatario+código. No sube más: la prueba de fuego se FALLÓ en vivo y no hay aún verificación de que las alertas lleguen a un humano. |
| Rendimiento | 6 | 4 | **6.5** | Los caminos que morían callados a media corrida: enLotes acota la concurrencia del consolidado, la cobranza global corta por reloj ANTES del claim (cortadosPorReloj declarado + rescate de filas fantasma + plazo global 90s), y las ventanas se rotulan donde se usan como universo. Los límites 100/500/1000 sin medir siguen propuestos. |
| Legal | 6 | 4 | **6.5** | La familia entera cerrada: el gate del aviso IZADO antes de la rama sin-viaje (LEG-C1, reincidente — por eso no sube más) y los hitos 0090 enunciados en ambos textos como finalidad no-necesaria, con re-entrega automática por versión-hash a quien tenía constancia vieja. Una ronda sin recaída y esto vuelve a 7+. |
| Arquitectura | 6 | 4 | **6** | ARQ-C1 cerrado (las stats por operador cuentan liquidaciones con diferencia real, no una constante); el módulo nuevo lotes.ts con contrato probado. Los dos divergencias de componentes copiados y los medios de acoplamiento siguen propuestos — recupera el nivel de la aud. 2, no más. |
| **Global** | **6.2** | **5.7** | **7.1** | 31/31 críticos+altos cerrados el mismo día con TDD; quedan **43 medios y 29 bajos propuestos** + 2 laterales nuevos. |

## Los 31 cerrados (commits en 00-ESTADO-RONDA.md)

Críticos: BE-C1 `c8bd2ac` · OP-C1 `444492a` · ARQ-C1 `b31460c` · REND-C1
`54e0648` · REND-C2 `bb7e228` · LEG-C1 `bc3c6c3`. Altos: los 25 en la tabla
de fixers del estado de ronda (TC-A1 del orquestador; BE-A2 rebotó de su
fixer al orquestador y cerró en `306047d`). Cada uno: prueba que reproduce
en rojo → arreglo → verde → commit atómico citando el ID.

## Falsos y descartados

Ninguno de los 31 resultó falso al verificarse contra el código (los
auditores refutaron varios candidatos propios antes de entregar — señal de
calidad de la ronda). El único texto de pantalla en duda («más de 3,000
pruebas» en /seguridad) se midió hoy: 3,232. Verdad.

## Hallazgos laterales NUEVOS de la ronda de arreglos (propuestos, sin arreglar)

1. **Importador vs NOT NULL**: `importarViajes` inserta `operador_id: null`
   para filas sin operador amarrado y la columna es NOT NULL (0001) — el
   lote truena RUIDOSO (se reporta), pero mata el import histórico completo.
2. **Import histórico vs 0029**: dos viajes abiertos del mismo operador en
   un mismo archivo chocan con `uq_viaje_abierto_por_operador` — mismo
   efecto: lote reportado como fallido.
3. Dos comentarios que quedaron mintiendo tras AG-A1 — cerrado en `82bff9a`.

## Qué más pasó hoy encima de la auditoría (contexto del delta)

Fases F6→F7 del plan construidas y verificadas mirando (claro/oscuro):
Conexiones con salud medida, /seguridad solo-verdades, Rentabilidad y
cobranza a clientes con su vacío honesto, y el diseño escrito de intake por
correo + API por agente (bloqueados por infraestructura externa, no
fingidos). Nada de hoy está desplegado: producción espera las env vars
LIKIDA_* (pendiente de Javier) y la bandera `[deploy]`.
