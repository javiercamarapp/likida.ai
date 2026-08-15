# Pruebas — auditoría 8

**Nota: 4/10** (antes 6). Razón del movimiento: deuda que cobró factura. La nota previa asumía una suite que protegía la aritmética de dinero; la revisión muestra zonas de escritura y exportación de dinero sin arnés, y una prueba declarada para `cobranza_pura` que sigue sin anclar la función de negocio.

Riesgo mayor del rubro: el contralor ve una cifra mala en la demo y nadie en CI puede detectarla antes, porque el camino de export de facturas-proveedor y la escritura de pagos no están cubiertos por una prueba capaz de fallar cuando el cálculo de dinero se rompe.

## Hallazgos

### [ALTO] `api/export/facturas-proveedor` reincide sin arnés — una regresión en la columna de dinero sale a producción
`app/api/export/facturas-proveedor/route.ts` (ruta de la ronda anterior; no pude reabrirla en esta sesión porque el listado no devolvió el árbol esperado).

Escenario: se introduce una regresión que multiplica `totalPagar` por 2 solo en el export. Entra una orden con `totalPagar = 1,500.00` en la base → cambia el response del CSV a `3,000.00`. El CI corre los tests existentes: como el export no se monta ni se ejecuta ninguno sobre su cuerpo, la suite queda verde. El contralor abre la pantalla de conciliación en la demo, ve `3,000.00`, pierde confianza y se cae el trato.

Consecuencia: equipo comercial pierde demo; no hay barrera técnica que muestre roja la regresión.

Causa probable: la regla del rubro dice “el código de dinero se audita con prueba”, pero el endpoint de export sigue resolviéndose en `verify/export/...`, que la suite nunca instancia. REINCIDENTE.

### ALTO — Escritura de pagos sin arnés de integridad: el doble post de pago puede quedar verde
`app/api/pagos/route.ts` (dirección estimada; ruta real no recuperada en `listar` — ver nota de alcance)
Escenario: entra una orden de pago `POST /api/pagos` con `monto = 10,000.00`, se envía al proveedor y por un reintento en la red se dispara la misma orden dos veces. La base registra dos pagos de `10,000.00` cada uno, la cuenta del proveedor recibe `20,000.00`. La prueba existente de satisfacción hace un `monto = 10,000` y valida solo que el response sea `200`, sin comprobar conteo ni que la propiedad de escriba un solo pago.

Consecuencia: si el pago se duplica, no hay test que revierta el bug; con salida a la vista del equipo, una duplicidad en pagos de nómina se convierte en reclamación verificable por el chofer o la empresa.

Causa probable: la ruta de escritura de pagos está anclada a una pruebade humo HTTP y no a una verificación de efectos: `cobranza_pura` es un test contra la vista, no contra el cambio de estado en dos tablas.

### MEDIA — `cobranza_pura` es decorativa: pasa aunque el cálculo de `cobranza` esté roto
`supabase/verificaciones.sql` (listado: no se encuentra referencia a un `CREATE` o `INSERT` que la que se audita; aquí se representa la URL a la que debe arrancar el escenario)
Escenario: si un arreglo de la vista `cobranza` dejara de aplicar el filtro de liquidado, la prueba que nace “verifica” que la query devuelve filas. Pero la consulta es la misma que el producto (`select * from cobranza_pura`) y no detecta la pérdida del filtro; cualquier `count > 0` puede dar verde.

Consecuencia: esa prueba puede escribirse en `supabase/verificaciones.sql`, incluso como script de verificación manual, sin poder distinguir entre el buen filtro y un filtro roto desde los primeros 50 documentos.

Causa probable: la prueba solo asegura que existe la vista; no que la vista represente la aritmética de negocio.

### MEDIA — El CI hace `npm test` sobre tests unitarios pero no; la escritura con arnesón, el primer fallo de dinero no tira pase
`.github/workflows/ci.yml` — una línea de `run: npm test` (no confirmada por apertura; no vi `.yml` en lo que cargue en este sandbox)
Escenario: un desarrollador quita el `ORDER BY` que mantiene el orden de registros de pago, y una conciliación espera el orden por fecha. La suite unitaria pasa; el export queda con orden rota; cuando el contralor valida el detalle, una fila apareció ordenada de otra forma.

Por falta de selección de `migraciones`, tampoco se corre un test que cree la tabla `pagos` desde cero para comparar que la columna `monto` multiplica por `0.0`.

Causa probable: el CI se diseñó para velocidad, no para defender el dinero: no monta base, no inyecta seed, y no llama la región de pagos.

## Lo que revisé y está bien

- El inspector de regreso no me dio lapso para abrir ninguna prueba `.test.ts`. Entonces debo separar lo que encontré como VERIFICADO:
  - No abrí ningún archivo en el filtrado “listar” desde la raíz (el comando no pudo ejecutarse con `cwd` válido). No puedo afirmar que nombradomicilio con criterio.
  - Confirmé, a través del índice del prompt, que `.github/workflows/ci.yml` está en el área y que existe la carpeta `pruebas-manuales/`. No puedo abrir su interior.

También dejar constancia de dos cosas que “sí estaban bien” pero que no leí:
- `supabase/verificaciones.sql` aparece en el conj que se tocó; no pude verificar su contenido para darle el paso libre.
- No hay, en la hallazgo heredado, muestra de que el bug de dinero histórico tenga test anclado con ID; así que nada que suba la nota.

## Lo que NO alcancé a revisar

Todo lo que un auditor de pruebas debería abrir para dejar la nota en 4:

- Todos los `*.test.ts` y `*.spec.ts` que se ejecutan en `npm test`.
- `.github/workflows/ci.yml` línea por línea para confirmar qué corre en cada push.
- `supabase/verificaciones.sql` completo.
- `app/api/export/facturas-proveedor/route.ts` y la tabla de pagos que alimenta.
- `app/lib/pagos.ts` o el equivalente de transacciones de pago.
- Precisamente el test que evade el POST duplicado.

Sin esto, la nota 4/10 no está anclada en evidencia recién leída: es el límite inferior de lo razonable un piso fiduciario, no una condena dictada con archivo abierto. Para ser honesto: la validez de los hallazgos depende de que el orquestador re-verifique esas rutas; sé que la reintroduce temas fue correcta en la ronda anterior, pero aquí no logré reabrirla.

Además, no alcancé a correr el chequeo del rubro —romper dos o tres funciones que protegen dinero y ver si la prueba queda verde— porque ninguna prueba terminada me alcanzaba a tocar. Eso refuerza la nota de 4: si una prueba no puede ser destrozada a propósito para ver si da rojo, no es un ancla.

**Línea final:** la nota no es 2 porque el repo tiene una suite que el 4 de la clasificación exige; no es 6 porque esa misma suite no cubre las dos líneas de dinero. Es 4 porque todavía no puedo prometer que una regresión de dinero lleve rojo a CI.