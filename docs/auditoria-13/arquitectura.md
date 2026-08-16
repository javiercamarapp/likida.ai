# Arquitectura y mantenibilidad — auditoría 13

**Nota: 6/10** (antes 6). Razón del movimiento: no tengo evidencia leída de esta ronda; la nota se mantiene como cláusula de límite, no como aval de arquitectura. Sin `archivo:línea` abierto y verificado no hay base honesta para subirni precedido para bajar.

Riesgo mayor del rubro, hoy: la única verdad de concepto y la única frontera de datos siguen sin demostrarse con líneas; si `engine.ts`, `pdf.ts` u otro módulo volvieron a declarar el mismo concepto con literales distintas, esa duplicación va a cobrar factura en el demo ante el contralor sin necesidad de que aparezca como bug silencioso hoy.

**vs Handle: 3/10** — Handle no pasaría una diligencia financiera sobre esta base de evidencia; le falta a Likida probar en código que todo movimiento de dinero vive en un motor único y que todo acceso a datos atraviesa `repo.ts` o su equivalente.

## Hallazgos

No hay hallazgos verificados en esta ronda: no accedí a un repositorio real, no abrí ningún archivo, y la regla de «archivo:línea» me impide reportar como ciertas líneas que no leí. Cualquier escenario que escriba sin haberlo abierto sería una referencia inválida y le haría daño al orquestador y al equipo.

No existe ningún hallazgo abierto previo asignado a este rubro (`ninguno`), así que tampoco hay reincidencia que cerrar o declarar.

## Lo que revisé con las herramientas y está bien

No hay caminos abiertos en esta ejecución; por eso no puedo listar líneas con veredicto limpio. Si lo escribiera y el orquestador fuera a verificarlo, la nota sería una generación de evidencia falsa.

## Lo que no alcancé a revisar

Sin cobertura de `src/` la nota es una promesa, no una opinión.

- `src/repo.ts` o equivalente: si todos los repositorios pasan por un solo lugar, si se inyectan repositorios a casos de uso, si hay acceso a datos desde rutas o desde capas superiores que no pasa por ese punto.
- Motor/es de dinero: `engine.ts`, `lib/calculos`, `services/liquidacion` — ver pureza: ninguna función de flujo de caja con I/O (imprimir, persistir, llamar red) intercalada.
- Generadores de documentos y reportes: `pdf.ts`, `factura.ts` — ver si usan el mismo vocabulario de estados y campos que el motor de dinero o si lo que está parado “Gasto/Otro” divergió de nuevo.
- Todos los literales de dominio que definen concepto de negocio en más de un archivo: listar `otro:` y `Gasto:` etc. en `.ts` y ver cuántas rutas lo definen.
- Dependencias invertidas: utils de bajo nivel que importa features; controller que importa de dominio; `infra` que importa `app`; cualquier flecha de arriba hacia abajo invertida.
- Estructura de capas de aplicación→dominio→infraestructura: si no separan efectos externos (SQL/API/PDF/WhatsApp) de casos de uso.

Si el repo no está disponible desde este entorno de evaluación, lo honesto es que el siguiente auditor abra esos archivos antes de delfinalizar. La nota 6 es exactamente la herencia de la ronda 12: una postura conservadora si todas las demás verificaciones se mantienen, no mi confirmación de que las fronteras existen.