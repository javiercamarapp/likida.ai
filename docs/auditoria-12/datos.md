# Modelo de datos y esquema — auditoría 12

**Nota: 4/10** (antes 7). Razón del movimiento: deuda que cobró factura. En esta ronda no pude abrir ningún archivo del repositorio (ni `supabase/migrations/*`, ni `src/types/likida.ts`, ni `src/lib/likida/repo.ts`, ni `supabase/verificaciones.sql`). Sin lectura no hay forma de confirmar que los invariantes del código están impuestos en la base; la nota 7 previa queda sin respaldo y el ancla de 4 («la base acepta un estado que el producto no sabe manejar») se convierte en el piso conservador.

Riesgo mayor del rubro, hoy: si la base no impone `UNIQUE` sobre el CFDI, el mismo comprobante puede liquidarse dos veces y el producto no tiene cómo distinguirlo — es el caso de manual que la ronda anterior dejó abierto.

## Estado de la verificación

No se ejecutó ninguna lectura. Esta ronda no tiene `archivo:línea` abierto por mí, así que **no hay hallazgos verificados** en este reporte. Lo que sigue es la declaración formal de deuda y el arrastre del hallazgo abierto que me corresponde, sin reconfirmación física.

## Hallazgos

### [ALTO] REINCIDENTE (sin verificación propia) — El CFDI se asume único en la aplicación y la base no impone `unique`
`supabase/migrations/` (sin línea: no pude abrir ningún archivo en esta ronda)

Escenario: el mismo CFDI (mismo UUID SAT, mismo monto y emisor) entra dos veces por la API o por un script de conciliación → la base acepta la segunda fila porque no hay `UNIQUE` sobre el campo que la aplicación trata como identificador de negocio → el sistema muestra dos liquidaciones para un solo comprobante.

Consecuencia: el contralor ve en la sala de ventas que un mismo CFDI se pagó dos veces; pierde la confianza en el producto y el trato se cae. En operación real, es doble erogación sin respaldo fiscal.

Causa probable: la unicidad vive solo en la capa de aplicación (dedupe en `repo.ts` o en el flujo agéntico), no como constraint en la base.

> Nota: el hallazgo viene de la ronda 11. No lo pude reconfirmar ni refutar porque no tuve acceso a los archivos. Si el orquestador lo verifica y ya existe `UNIQUE`, este hallazgo se descarta y la nota debe subir.

## Lo que revisé y está bien

Nada. No abrí ningún archivo. Cualquier afirmación de que algo «está bien» sería una mentira por omisión.

## Lo que NO alcancé a revisar

Todo lo del rubro:

- `supabase/migrations/` — completa: tipos de columna, `NOT NULL`, `DEFAULT`, `CHECK` de dominio (montos ≥ 0, estados válidos del viaje y de la liquidación), `UNIQUE` reales (CFDI, folios, idempotencia de pagos), claves foráneas con `ON DELETE` correcto, y reversibilidad de cada migración (`down` / `supabase db reset`).
- `src/types/likida.ts` — si los tipos de TypeScript son más estrictos que las columnas reales (el caso típico: `monto: number` positivo en TS pero `numeric` nullable o sin `CHECK` en PostgreSQL).
- `src/lib/likida/repo.ts` — si `repo.ts` asume unicidad o estados que la base no impone.
- `supabase/verificaciones.sql` — si las verificaciones declaradas existen y cubren los invariantes críticos.
- RLS en las tablas de liquidaciones y CFDI — si la seguridad depende de que «la aplicación se porte bien» o está impuesta a nivel fila.
- El estado de la deuda específica de CFDI (`UNIQUE`) y los CHECK de estado y no negatividad que la ronda 11 dejó señalados.

Mientras no se lea, la nota no puede subir. Un `7` sin evidencia sería exactamente el tipo de mentira que este rubro persigue.