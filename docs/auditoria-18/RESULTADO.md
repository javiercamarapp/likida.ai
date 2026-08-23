COMPLETA (continuación 4)

Auditoría 18 · continuación 4 · 23-ago-2026 · en la nube, desatendida
rama `claude/auditoria-18`, PR #34 · `master` @ `583fec4`

Ronda de **continuación**, no ronda nueva: el PR #34 seguía abierto, así que se trabajó
sobre la misma rama. Es la **cuarta** pasada. Los 12 rubros se relanzaron porque los 12
tenían código cambiado en el delta `21630c0..583fec4` — **368 archivos, +32,183 /
−5,220**, casi entero del **PR #39 («escala a 50k viajes/mes», 117 hallazgos)** y de la
campaña de render por bloques FE-14/FE-16.

- 12 rubros de 12, contexto fresco, uno por rubro → `docs/auditoria-18/<rubro>-c4.md`.
- **126 hallazgos: 15 CRÍTICO · 46 ALTO · 45 MEDIO · 20 BAJO** (conteo ya ajustado por
  la verificación adversarial; ver abajo).
- **2 arreglados**, con prueba que los reproduce y commit atómico: `b872b10`
  (ARQ-C4-1, CRÍTICO) y `a5e413d` (BACK-C4-1, ALTO). Los dos comprobados revirtiendo
  el arreglo y conservando las pruebas. Ninguno revertido. **Tope de 3 vueltas: se
  usaron 2.**
- **Global 5.3** — **−0.5** contra el 5.8 de ayer. **Un solo rubro sube** (rendimiento,
  +1). Ocho de los doce movimientos son *mirada más profunda* o *deuda que cobró
  factura*.
- Compuerta final verde: **486 archivos, 6,255 pruebas, 1 saltada**; `tsc` limpio;
  `eslint` 0 errores, 24 avisos.
- Tablero renderizado, capturado y **mirado** (`tablero-c4.png`). Se recapturó dos
  veces: una para quitar lienzo en blanco al pie, y otra porque al recortar se salió
  el pie de página.

## Dos rojos que cazó la compuerta ANTES de los auditores, los dos de `master`

- **OPER-C4-1** (`8282fa4`): `node_modules` estaba versionado como **enlace simbólico a
  `/Users/javiercamaraportepetit/likida/node_modules`**. `.gitignore` decía
  `node_modules/` con diagonal, forma que solo casa directorios. Al clonar, `npx vitest`
  muere con `Cannot find module 'vitest/config'` — **no arranca ninguna prueba**.
- **FMT-C4-1** (`3af1ea4`): la compuerta base salió **roja**. `mxnCompacto` imprimía
  `"$9,000.0 M"`, diez caracteres en la tarjeta de ocho: el desbordamiento que FE-17
  vino a cerrar.

## Un CRÍTICO descartado en su premisa, y una corrección hacia atrás

Seguridad y operabilidad reportaron, por separado, que el repo es **público** y que por
eso el auto-merge por nombre de rama es explotable desde un fork. **El repo es privado y
tiene un solo colaborador, el dueño, admin** (verificado con `search_repositories` y
`list_repository_collaborators`). El mecanismo es real, el vector no existe hoy →
**reclasificado a MEDIO**, y vuelve a subir solo el día que entre la segunda persona con
permiso de escritura.

**Las síntesis de la c2 y la c3 lo afirmaron como hecho durante dos rondas.** Se
comprobaba con una llamada.

## Lo que necesita decisión del dueño, no más código

1. **La mitad SQL del producto no la verifica nadie.** Tres auditores coinciden por
   caminos distintos: **19 de 123 bloques de `verificaciones.sql` corren en CI y no se
   califican** (seis son los de las migraciones de dinero del delta); las pruebas «de
   equivalencia JS-vs-RPC» comparan TS contra una transcripción a mano, y quitarle
   `tenant_id = p_tenant` a dos RPC de la 0150 —una fuga entre flotas— deja **4,325
   pruebas verdes**; y **`ci-postgres` lleva 24 h en rojo en `master`** (runs #308 y
   #311 = `failure`, verificado contra la API).
2. **El estímulo de peaje se calcula sobre `@SubTotal` ignorando `@Descuento`**, que no
   se lee en ningún archivo del repo. SubTotal $120,000 con Descuento $18,000 → **$60,000
   de estímulo donde la RMF 9.1.8 fr. IV ordena $51,000**. Pide columna y migración.
3. **El contador del 15% mide `forma_pago = '01'` en SQL y se juzga con la lista cerrada
   de la LISR 27-III en TS.** REINCIDENTE y peor que ayer: el arreglo de FISC-C3-1 movió
   el consumidor y dejó el productor.
4. **El piloto de visión**: 8 críticos íntegros, detrás de `FACTURACION_PILOTO`, apagada.
   **El doc del demo manda encenderla.**
5. **`/aviso/<tenant>` es 404** para toda flota real — cuarta pasada pidiéndolo. Y la
   purga de prospectos borra `contacto_nombre` y nada más, mientras el aviso promete que
   también el correo y el teléfono.
6. **`scripts/demo-5k.sql` nunca ha podido correr**: muere en su primer `insert` por un
   `--` dentro de un literal JSON. Es el tenant que se enseña en la sala, y además trae
   régimen 601 con la facilidad del 15% concedida a mano.

## Lo que esta ronda NO verificó

- **Ninguna migración la ejecutó el orquestador.** El auditor de datos sí (levantó un
  Postgres 16 local y aplicó las 163); sus cifras salen del catálogo, pero **yo no las
  repetí**.
- **`npm run build` no se corrió** (sin `.env`).
- **De los 126 hallazgos verifiqué a fondo cinco**, los de mayor daño. El resto se toma
  como lo escribió su auditor.
- La intermitente de `engine_iva_medio_pago.test.ts:35` no se reprodujo en cinco corridas
  completas. Sigue abierta.
