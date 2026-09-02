# CIERRE — constructor `masivo` (auditoría 24, bloqueante 3/4)

Alta masiva de unidades/operadores para el piloto de 800 tractos.

| ID | Estado | Archivos | Pruebas nuevas | Commit |
|---|---|---|---|---|
| ADM-2 · importación masiva de unidades | CERRADO | `lib/likida/importacion/{archivo,unidades}.ts`, mig. `0298` | `importacion/unidades.test.ts` (12) + bloque 245 | `29de54a9` |
| ADM-2 · importación masiva de operadores | CERRADO | `lib/likida/importacion/operadores.ts` | `importacion/operadores.test.ts` (13) | `29de54a9` |
| FE-4 · teléfono de WhatsApp editable | EN CURSO | `lib/likida/administracion.ts` | — | `29de54a9` |
| Terminales · alta mínima | EN CURSO | `lib/likida/terminales.ts`, mig. `0298` | bloque 245 | `29de54a9` |
| `/v1` alta en lote (Idempotency-Key) | CERRADO | `api/v1/{operadores,unidades}/route.ts`, `api/v1/openapi/route.ts` | `operadores/route.test.ts` (27), `unidades/lote.test.ts` (23) | `8d62afc3`, `14e71bec` |
| `/dashboard/{operadores,unidades}` keyset+count+búsqueda | EN CURSO | — | — | — |

## Notas

- **Migración `0290` de `datos`**: `…/wt/datos/CIERRE.md` NO existe todavía y la
  rama `datos` no tiene una `0290`. Las validaciones TS de `importacion/` se
  quedan alineadas con lo que hoy manda la base (`unidad_economico_unico`,
  0047; teléfono único por flota) y con la `0298` propia. Si `datos` aterriza
  una `0290` que endurezca placa o teléfono, hay que revisarlas contra ella.
- No se tocó `repo.ts`, `operacion.ts` ni `api/v1/viajes/**`.
- `_escritura.ts` (ajeno) NO se modificó: el lote reusa `escribir()` con
  `buscar: () => null`, que es el contrato que ya expone.
