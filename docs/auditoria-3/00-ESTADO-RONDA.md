# Estado de la ronda — auditoría 3 (documento de trabajo del orquestador)

> Si esta ronda se retoma tras un corte de contexto: TODO lo de abajo sale de
> los 12 reportes en esta carpeta. Fases 0-1 COMPLETAS. Sigue: verificación
> adversarial (Fase 2) → tablero (3) → arreglos (4) → síntesis (5).

## Línea base (corrida 14-ago ~02:00)
vitest 261 archivos / 3,161 verdes / 1 skip · tsc limpio · eslint 0 err 22 warn · build exit 0 · árbol limpio al arrancar.

## Notas de los 12 (antes → hoy) y conteos C/A/M/B
- frontend 7→7 · 0/2/2/1
- backend 6→5 · 1/4/4/3
- agentico 5→6 · 0/4/6/2
- tool-calling 6→7 · 0/1/2/2
- seguridad 7→8 · 0/0/2/1
- fiscal 6→6.5 · 0/2/6/3
- legal 6→4 · 1/1/4/2
- arquitectura 6→4 · 1/2/5/4
- pruebas 6→6 · 0/3/2/2
- operabilidad 6→5 · 1/2/4/1
- rendimiento 6→4 · 2/4/3/2
- datos 7→6 · 0/0/2/5
Global aritmético: 68.5+... ≈ **5.7** (antes 6.2).

## DIRECTIVA DEL FUNDADOR: los 31 (6C+25A) COMPLETOS antes de la siguiente fase.

## PROGRESO FASE 4 — CRÍTICOS: 6/6 CERRADOS ✅
1. BE-C1 import×cobranza → c8bd2ac (filtro avisado_en + cinturón + prueba)
2. OP-C1 cron 200-verde → 444492a (500 con motor caído + 4 pruebas + log renombrado cron.cobranza.*)
3. ARQ-C1 diferencias:0 → b31460c (conteo real por operador + prueba)
4. REND-C1 consolidado serial → 54e0648 (enLotes de 10 + helper probado)
5. REND-C2 cron sin reloj → bb7e228 (venceEn corta ANTES del claim + rescate claims huérfanos >1h + PLAZO 90s global + pruebas deterministas)
6. LEG-C1 foto pre-aviso → bc3c6c3 (gate izado antes de la rama sin-viaje + 2 pruebas)
Suite tras críticos: 3,175 verdes / tsc limpio.

## SIGUEN: LOS 25 ALTOS (leer el detalle en el .md de cada rubro ANTES de arreglar)

## COLA DE ARREGLOS (Fase 4) — críticos en orden, luego altos
Protocolo por ítem: prueba que reproduce → arreglo → prueba verde → suite → commit atómico citando ID.

### CRÍTICOS
1. **BE-C1 import×cobranza bombardeo** — colaCobranza no filtra `avisado_en` (escalar_viaje.ts:94 sí); agente activo por default + import con operadores = spam masivo a choferes del prospecto. Arreglo probable: colaCobranza exige `avisado_en not null` (un viaje que Likida nunca avisó no se cobra) + prueba de interacción import→cola vacía.
2. **OP-C1 cron escalar 200-verde** — escalar/route.ts:67-91 responde 200 con motor reventado (purgar/facturar responden 500/503). Prueba: motor lanza → status ≥500.
3. **ARQ-C1 diferencias:0 hardcodeado** — analytics.ts:324 (getStatsPorOperador) alimenta agentes/liquidacion/vista.tsx:219 con rótulo falso. Arreglo: calcular diferencias reales (join liquidacion.diferencia por operador) o leyenda honesta; REINCIDENTE ola 2.
4. **REND-C1 consolidado serial sin presupuesto** — consolidado.ts:259-270 UPDATE por línea sin reloj; entra por processor.ts:421-436 y página peajes. Arreglo mínimo enterprise: acotar con presupuesto + reanudable (marcar progreso) o batch update.
5. **REND-C2 cron escalar+cobranza sin reloj** — suma envíos seriales >> maxDuration 120s; crash entre claim y send consume tier (colaCobranza cuenta toda fila sin filtrar `enviado`). Arreglo: presupuesto de reloj en la corrida (cortar limpio) + reintento de claims `enviado=false` de más de X h (distinguir sin_telefono por `detalle`).
6. **LEG-C1 foto huérfana → visión antes del aviso** — processor.ts:549-624 trata ANTES del gate :665. Arreglo: mover el gate de aviso antes de la rama sin-viaje (mandar aviso primero, no procesar la foto hasta puesto — o guardar SIN OCR y procesar tras aviso).

### ALTOS confirmables (por rubro)
- TC-A1: /api/dashboard/chat pierde costo en PartialExecutionError (processor sí lo registra) → registrar en catch.
- AG-A1: "ya" ambiguo con comprobantes cierra irreversible (freno solo con cero).
- AG-A2: cobranza sin plantilla fallback (ventana 24h cerrada = población objetivo inalcanzable; escalar tiene recordatorio_cierre). → plantilla fallback como escalar.
- AG-A3: despacho WA choca 0029 (operador con viaje abierto) y contesta "vuelve a responder SÍ" en bucle → mensaje definitivo.
- AG-A4: "el aviso va en camino" cuando avisarAlChofer ya falló + avisado_en NULL invisible a escalación.
- OP-A1/A2: fingerprint Sentry colapsa; fallos de envío del camino del dinero en `info` sin tenant/viaje (wa.sendText:96 sin ids).
- PR-A1: anclar embeds con prueba (los 3 alias).
- PR-A2: rename a medias CUADRA_COBERTURA→LIKIDA_COBERTURA (skip muerto + guardia vigila nombre muerto).
- PR-A3: header de cobranza cita arnés manual inexistente.
- FE-A1: bandeja huérfanos $0.00 adjuntable sin guardia monto>0.
- FE-A2: ventana 100 sin declarar en Conductores/Mapa/select huérfanos.
- BE-A1..A4: ver backend.md.
- FI-A1: card RMF 9.1.8 en peajes/vista.tsx:144-161 afirma sin ficha y pinta verde lo SIN RESOLVER de la ficha LIF → reescribir card honesta.
- FI-A2: fiscal.ts:263-269 "plazo comercio vencido" clasificado pérdida definitiva vs ficha nivel 6 (ejercicio) → reclasificar recuperable-con-fricción.
- LEG-A1: hitos sin cobertura del aviso (texto del aviso a ampliar — REDACCIÓN legal, marcar propuesto para Javier).

### MEDIOS/BAJOS: quedan PROPUESTOS en tablero (no se arreglan esta ronda), incl. xlsx/sharp CVEs (seguridad M), art. 32 abrogado en pantalla (legal M), oráculo crearOperador (legal M).

## Verificación (Fase 2): estado
Pendiente de abrir archivo por archivo. Los 12 entregables están en esta carpeta. Falsos detectados hasta ahora: ninguno declarado (los auditores ya refutaron varios candidatos propios — anotarlo en síntesis como señal de calidad).

## PARALELIZACIÓN DE ALTOS (lanzada ~03:50) — 8 fixers con archivos DISJUNTOS, commit local SIN push
- A: AG-A2/A3/A4 → despacho_wa.{ts,test}, agentes/cobranza.ts, cobranza_reloj.test
- B: AG-A1 → processor.ts (SOLO pareceCierre), prompts.ts, tests de cierre
- C: PR-A1/A2/A3 → embeds_con_alias.test (nuevo), mecanismo LIKIDA_COBERTURA, header cobranza.test
- D: FE-A1/A2 → dashboard/huerfanos/**, conductores/vista, mapa/vista+page
- E: FI-A1/A2 → agentes/peajes/vista, fiscal.ts + tests fiscal
- F: OP-A1/A2 → logger.ts, meta/client.ts, instrumentación
- G: BE-A1..A4 → según backend.md MENOS reservados (reporta BLOQUEADO-POR-DUEÑO)
- H: LEG-A1 → privacidad.ts, aviso/[tenant], tests aviso (migración de versión: PREPARADA, no aplicada)
Cerrados antes en serie por el orquestador: TC-A1 (8066054+366b66d).

## AL TERMINAR LOS FIXERS (orquestador):
1. Verificar commits de cada uno (git log), resolver BLOQUEADOS (los -POR-DUEÑO los arregla el orquestador en persona).
2. Suite COMPLETA + tsc + eslint + build → push de todo.
3. Aplicar migración de aviso si H la dejó preparada (+ bloque verificación).
4. Fase 3+5 de la skill: tablero.html (mirado) + 00-SINTESIS.md con las 12 notas recalificadas y el porqué; commit.
5. DIRECTIVA: continuar el plan — F7 (chasis: pantalla Conexiones con salud MEDIDA, /seguridad verdadera, identidad por agente; intake por correo = solo diseño honesto sin infra) y F8 (lo técnico preparable; timbrado y pricing son decisiones de Javier ya pactadas). Objetivo declarado: las 8 fases hoy.

## RESULTADOS DE LOS FIXERS (cosechados ~04:15, 14-ago)
Los 8 reportaron. 24 de 25 ALTOS cerrados por ellos; 1 rebotó al orquestador:

| Fixer | Hallazgos | Estado | Commits |
|---|---|---|---|
| A | AG-A2/A3/A4 | CERRADOS | d20d1a5, dfcb300, 7690d6a |
| B | AG-A1 | CERRADO | b938aad |
| C | PR-A1/A2/A3 | CERRADOS | 91216dd, eb4ccd8, 3d1bc4a |
| D | FE-A1/A2 | CERRADOS | 676513d, 8f28f61 |
| E | FI-A1/A2 | CERRADOS | b4905b5, 6e8a3dc |
| F | OP-A1/A2 | CERRADOS | 8efcb1b, 3e7296c |
| G | BE-A1/A3/A4 | CERRADOS | b024160, ac5ad33 (mig 0092 APLICADA + verificación 67), 266d117 |
| G | BE-A2 | BLOQUEADO-POR-DUEÑO → fixer BE-A2 dedicado lanzado (claim atómico del pendiente en despacho_wa) | — |
| H | LEG-A1 | CERRADO (sin migración: versionAviso es hash del contenido) | 7a1be66 |

Del orquestador, además: TC-A1 (8066054+366b66d), los 2 comentarios stale de AG-A1
(82bff9a), y F7 completa: núcleo ac93904, cableado 39e0435, rentabilidad c4e80d5.

### Hallazgos laterales NUEVOS (de G; verificar y proponer en síntesis, NO arreglados)
1. `importarViajes` inserta `operador_id: null` para filas sin operador amarrado,
   pero la columna es NOT NULL (0001) → el lote entero truena. Falla RUIDOSA
   (se reporta el error), no corrupción — pero mata el import histórico.
2. Import histórico vs 0029: dos viajes `abiertos` del mismo operador en un
   archivo chocan con `uq_viaje_abierto_por_operador` → lote falla con reporte.
3. Los textos de /seguridad citan "más de 3,000 pruebas" — VERIFICAR contra el
   conteo real de la suite en la integración; si no aguanta, corregir el texto.
