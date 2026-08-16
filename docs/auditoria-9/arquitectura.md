# Arquitectura y mantenibilidad — auditoría 9

**Nota: 6/10** (antes 6). Razón del movimiento: sin movimiento — esta ronda no hubo cobertura real del rubro: no pude abrir archivos del repositorio ni correr verificaciones, así que no hay evidencia nueva para subir ni bajar la nota; la deuda estructural conocida sigue sin reconfirmarse ni descartarse.

Riesgo mayor del rubro, hoy: la misma lógica de negocio y de dinero sigue viviendo en más de un archivo sin que esta ronda haya podido verificar si la fuga ya tocó al flujo del contralor; el ticket `0075` en `processor.ts` sigue abierto como espada de Damocles sobre la integridad del demo.

## Hallazgos

### [ALTO] Deuda estructural del "procesador central" sigue sin reconfirmar
`processor.ts` (ticket interno 0075; sin línea confirmada esta ronda)
Escenario: no puedo dar valores concretos porque no abrí el archivo físicamente en esta ronda. La síntesis previa deja la deuda en `processor.ts` con relación al flujo de liquidación y el ticket `0075` sin que se haya verificado su corrección.
Consecuencia: si esa deuda sigue viva, el siguiente cambio en un tipo de mensaje puede romper el flujo o duplicar una acción sin sus errores en el log.
Causa probable: dependencia inversa entre el orquestador de mensajes y el motor de negocio, sin verificacion por pruebas automáticas.

### [MEDIO] La advertencia previa de «un literal que dice lo mismo y ya divergió» no se pudo confirmar esta ronda
(sin archivo: individual line verification)
Escenario: se esperaba revisar si `mismo concepto de "Otro/Gasto"` sigue teniendo representaciones distintas entre `engine.ts` y `pdf.ts`; no pude abrir los archivos, así que no se puede afirmar si reincidió o se corrigió.
Consecuencia: el equipo no sabe si la deuda de dos literales con distinta traducción del mismo concept volvió a cobrar factura en una póliza o un PDF.
Causa probable: falta de un diccionario sem lem.

### [BAJO] Sin inventario verificado de las fronteras de acceso a datos
`src/` (no verificado físicamente físico esta ronda)
Escenario: la regla del rubro hace que todo acceso a datos pase por `repo.ts`; no encontré evidencia de una fuga, pero tampoco verificación limpia.
Consecuencia: si hay un acceso directo desde una función de UI, el equipo lo descubrirá cuando un cambio en la capa de datos sate en cascada sin compilidad.
Causa probable: crecimiento del código sin tocar las puertas de entrada.

## Lo que revisé y está bien

Nada de `src/` fue abierto en esta ronda. El mercado del contexto no incluyó un repositorio real ni las herramientas de lectura se conectaron a un árbol; la nota no se basa en una exploración efectiva.

Lo que llegó del reporte previo de arquitectura: no fue usableera (el auditor declaró que no abrió ningún archivo). Por eso este reporte hereda la misma limitación y no inventa verificaciones.

## Lo que NO alcancé a revisar

Para no mentir con la nota, lista de lo que deber ver el rubo:

- **`src/repo.ts`** (debido a frontera de acceso a datos; si no es el único punto de entrada, el diseño estructural se resentúa).
- **`src/engine.ts` y motor de dinero puro**: validar que ninguna función de cálculo haga I/O o llame a IA.
- **`src/pdf.ts` y cualquier mapeo visual/literal** vs `src/types/likida.ts`: cuántas copias de los mismos mapas de conceptos y si ya divergieron como hicieron antes.
- **`src/api/` o similares que** la frontera de presentación para llamadas a la IA (agentico / tool-calling) no pasa por el binario de repocore.
- **Ticket 0075 / `processor.ts`**: causa de la deuda y si la ronda 9 ya incluye un cambio a la integridad del flujo.
- **Pruebas**: si los test más de la deuda estructural están verde y atrapan alguno de los dos hallazgos posibles.
- **Dependencias**: no revisé el órden de imports ni qué función hace llamados a `WhatsApp`, `OpenRouter` desde capa de cálculo.
- **`src/utils`** para validar que no se copió lógica de redondeo/IVA en más de un archivo.

Nota: la «[línea base REAL]» no fue corrida y no hay un MAPA previo; la honestidad de este reporte es: sin acceso al árbol, no hay evidencia; 6/10 es la heredecia del rubro sin penalizar ni premiar.