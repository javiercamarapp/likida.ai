# Arquitectura y mantenibilidad — auditoría 12

**Nota: 6/10** (antes 6). Razón del movimiento: sin cobertura — en esta ronda no pude ejecutar las herramientas de lectura sobre `src/`; la nota se hereda y se declara como cláusula de límite, no como aval de fronteras. Bajar o subir sin líneas leídas sería la misma farsa que esta ronda denuncia en otros rubros.

Riesgo mayor del rubro, hoy: sin lectura no hay evidencia de que las fronteras se respeten; la deuda histórica de mapas de conceptos duplicados y de acceso a datos fuera de `repo.ts` sigue siendo el candidato más probable a divergencia silenciosa.

## Hallazgos

Ninguno. No se cita `archivo:línea` porque no se abrió ningún archivo en esta sesión.

## Lo que revisé y está bien

Nada. No se abrió ningún archivo.

## Lo que NO alcancé a revisar

Esto hace que la nota sea una herencia, no un juicio:

- **Todo `src/`** — no se listó ni se abrió un solo archivo.
- **Frontera de acceso a datos** — no se verificó si todo acceso a datos pasa por `repo.ts` o si hay consultas/`fetch` dispersos en módulos de aplicación o presentación.
- **Pureza del motor de dinero** — no se verificó si `engine.ts` (o el módulo que liquida) sigue siendo función pura o si empezó a hacer I/O (llamadas a DB, lectura de `Date.now()`, escritura de efectos).
- **Duplicación de mapas de conceptos** — no se contaron los lugares que definen el mismo literal de negocio (`Gasto` vs `Otro`, tipos de pago, estados de liquidación). La ronda anterior marcó la divergencia como advertencia; esta ronda no pudo confirmar si reincide.
- **Dirección de dependencias** — no se verificó si hay dependencias que apuntan al revés (capa de aplicación importando de infraestructura, motor importando de adaptadores).
- **Copias de verdad** — no se verificó cuántas definiciones de “retención”, “base gravable” o “estímulo” existen en paralelo entre el motor de dinero, el generador de PDF y los helpers fiscales.
- **Deuda estructural reincidente** — no se pudo confirmar ni descartar que los puntos ciegos de la ronda 11 (frontera `repo.ts`, pureza del motor, una sola fuente de conceptos) sigan abiertos.

Conclusión para el orquestador: este reporte no aporta hallazgos verificables. La nota 6 se arrastra por contrato de rubro, no por evidencia. Si la ronda siguiente quiere mover esta nota, necesita una sesión con acceso real de lectura a `src/` y verificación física de cada `archivo:línea`.