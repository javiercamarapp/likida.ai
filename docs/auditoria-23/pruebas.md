# Pruebas — auditoría 23

**Nota: 7/10** (antes 7). Razón del movimiento: **se atacó y subió, compensado
por mirada más profunda.** Los dos se midieron, no se opinaron:

- *Se atacó y subió.* Volví a correr las **6 mutaciones que sobrevivieron a la
  auditoría 22** contra la suite completa. **Las 6 mueren hoy.** Los cuatro
  arreglos de `d3ce510` (PRU-C1/A1/A2/A3) no son decoración: aguantan una
  mirada fresca y adversarial.
- *Mirada más profunda.* Corrí por primera vez lo que la 22 declaró fuera de
  alcance —`supabase/verificaciones.sql` contra un Postgres real— y encontré
  una compuerta que **imprime la fuga y contesta «La batería pasó»**. Y las
  mutaciones nuevas muestran que los arreglos de la 22 cerraron **el punto que
  nombraron, no la clase**: la misma ruta de export de póliza sigue con cinco
  decisiones de dinero que se pueden romper con los 9,993 tests en verde.

Neto: el rubro no empeoró ni mejoró lo suficiente para moverse. Sigue en 7.

**El riesgo mayor del rubro hoy:** hay una compuerta de CI que **no puede
reprobar**. `scripts/ci/correr-verificaciones.mjs` corre 203 bloques de ataque
contra Postgres y **19 de ellos —los más complejos, que son justamente los de
RLS por rol, los RPC de cobranza y los agregados— salen «SIN CALIFICAR» y no
cuentan como fallo.** Lo comprobé quitándole a la policy de `pago_recibido` su
guarda `ve_finanzas()`: la batería imprimió `pagos=1` en su propia salida y
terminó con **exit 0 y «La batería pasó»**.

---

## Cómo se midió (para que se pueda repetir)

Copié el árbol a un sandbox fuera del repo (`node_modules` por symlink) sobre
`master = c7c3d1c`, con el árbol limpio, y corrí **la suite COMPLETA** por cada
mutación —nunca el archivo vecino—. Línea base del sandbox: **708 archivos,
9,993 pasan, 1 saltada, 108 s**. Se excluye de cada corrida
`src/lib/pruebas/arbol_sin_enlaces_ajenos.test.ts`, que falla por mi propio
symlink y por no ser un repo git; es la única diferencia contra la corrida real.

Aparte, levanté un **Postgres 16 efímero**, apliqué el andamio de CI y las
**255 migraciones** una por una (todas limpias) y corrí la batería completa
—`capa1_auditoria_estatica.sql` + `verificaciones.sql`— con el mismo runner que
usa `ci-postgres.yml`. Salida real: **203 bloques · 182 ok · 0 fallos · 19 sin
calificar · 2 reportes.**

Las mutaciones son **dirigidas y adversariales**: fui a buscar dónde se acaba el
arnés. El cociente muertas/sobrevivientes NO es «el puntaje de mutación de la
suite», es dónde termina la protección.

---

## Mutaciones corridas hoy

### Grupo A — las 6 que sobrevivieron a la auditoría 22 (¿las mató?)

| # | Mutación | `archivo:línea` | Resultado | Prueba que la mata |
|---|---|---|---|---|
| M7 | `numero: (numeroInicial ?? 1) + i` → `+ 0` (todas las pólizas del periodo con el MISMO número) | `src/lib/likida/contabilidad/formatos.ts:90` | **muerta** | `poliza.test.ts:203` (PRU-A1) |
| M8 | `const jdtNum = i + 1` → `= 1` (todos los asientos SAP con el mismo JdtNum) | `src/lib/likida/contabilidad/formatos.ts:164` | **muerta** | `poliza.test.ts:246` (PRU-A1) |
| M9 | `lote.filter(vigentesIds.has)` → `lote` (la cola re-timbra lo ya facturado) | `src/app/api/cron/facturar/cola/route.ts:92` | **muerta** (2 casos) | `guarda_doble_cfdi.test.ts:83` y `:97` |
| M12 | `sinBase` nunca se llena (exporta con base gravable desconocida) | `src/app/api/export/poliza/route.ts:231` | **muerta** (2 casos) | `salida.test.ts:102` y `:121` |
| M13 | `if (bloqueos.length > 0)` → nunca (exporta el periodo a medias) | `src/app/api/export/poliza/route.ts:254` | **muerta** (3 casos) | `salida.test.ts:102`, `:113`, `:121` |
| M16 | `f.cliente_id === null` → `!== null` (el pacto de un cliente se lee como el de flota) | `src/lib/likida/estadias/lector.ts:70` | **muerta** (4 casos) | `lector_aud22.test.ts:33`… |

**6/6 muertas.** El trabajo de la 22 en este rubro es real.

### Grupo B — mutaciones nuevas

(ver tabla completa abajo, se completa al cerrar las corridas)

### Grupo C — la batería de `verificaciones.sql` contra Postgres real

| # | Mutación | Dónde | Resultado |
|---|---|---|---|
| SQL-1 | `registrar_pago_tx`: se borra el freno de sobrepago (`p_monto > v_saldo` → nunca) | `supabase/migrations/0237…:200` aplicado en la base | **muerta**, pero por accidente: el bloque `RPCS_0159` reventó más adelante con «ERROR INESPERADO (no llegó al RAISE)», no por su bandera `sobrepago-rebota` |
| SQL-2 | `ve_finanzas()` incluye a `encargado` | función de la 0048 | **muerta**, pero **no por `FINANZAS_RLS`** (que salió SIN CALIFICAR mostrando `clientes=1 tarifas=1 facturas=1 pagos=1`): la mató `GASTO_FINANZAS_0146` (`verificaciones.sql:5595`) |
| **SQL-3** | policy `tenant_finanzas` de **`tarifa`** pierde `AND ve_finanzas()` | `supabase/migrations` (0048/0051) | **SOBREVIVIENTE** — salida: `FINANZAS_RLS … tarifas=1 …`, y aun así **`182 ok · 0 fallo(s)` · exit 0 · «La batería pasó»** |
| **SQL-4** | policy `tenant_finanzas` de **`pago_recibido`** pierde `AND ve_finanzas()` | idem | **SOBREVIVIENTE** — salida: `FINANZAS_RLS … pagos=1 …`, **exit 0 · «La batería pasó»** |

---

## Hallazgos

(en construcción)
