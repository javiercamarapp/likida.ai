# Seguridad — auditoría 5

**Nota: 8/10** (antes 8). Razón del movimiento: sin movimiento verificado. La nota anterior ya estaba en 8; esta ronda no me permitió abrir ni una sola línea de los archivos del rubro, así que no tengo base fáctica ni para subirla ni para bajarla. La mantengo anclada, con advertencia explícita de que seguridad quedó **sin verificación de esta ronda**.

Riesgo mayor del rubro, hoy: el webhook de WhatsApp como frontera de confianza no verificada por mí — si no valida `X-Hub-Signature-256` o si su límite de tasa/cuerpo es decorativo, un mensaje falsificado entra directo al corazón del negocio (`processor.ts`) y desde ahí puede mover avisos, estados y dinero de flotas ajenas.

## Hallazgos

Ninguno reportado.

El estándar de esta ronda exige `archivo:línea` abierto y leído. No tengo filesystem ni snapshot de contenido, y el protocolo es claro: un `archivo:línea` que no exista o esté fuera de rango descalifica el rubro. No voy a fabricar hallazgos ni escenarios con valores que no pude contrastar contra el código.

## Lo que revisé y está bien

Nada con respaldo `archivo:línea`. No pude abrir archivos.

Del snapshot indirecto solo puedo registrar dos señales, sin valor probatorio de seguridad de runtime:

- La síntesis previa afirma que los seis agentes nuevos salieron limpios de críticos/altos multi-tenant y que el modo de falla #1 se atacó con el patrón `exigirPermiso`+closure. Eso habla bien del diseño de autorización en las páginas nuevas, pero no reemplaza leer `src/lib/auth/permisos.ts` ni `visibilidad.ts`.
- Las compuertas globales (`3,161` pruebas verdes, `tsc` limpio, `eslint` 0 errores) muestran que el día cerró compilando; no muestran que webhooks, RLS ni secretos estén bien.

## Lo que NO alcancé a revisar

Sin esto la nota es una mentira por omisión:

1. **`middleware.ts`** — no puedo confirmar que `/dashboard`, `/api` y `/admin` tengan doble capa independiente en cada ruta privilegiada. Un matcher de middleware es una sola capa; sin leerlo no sé si hay segunda verificación en server action/route.
2. **`src/app/api/webhook/whatsapp/route.ts`** — no puedo confirmar validación de firma de WhatsApp, límite de tamaño de cuerpo ni de tasa. Es la frontera de confianza más peligrosa del producto.
3. **`src/lib/env.ts`** — no puedo descartar secretos con fallback silencioso derivado de otro secreto (el ancla que pide este rubro). Sin leerlo, no sé si WhatsApp, Supabase, Resend o el agente tienen `fallback` encubierto.
4. **`src/lib/ratelimit.ts`** — no sé si el webhook, el chat con datos (`lib/agents/analista.ts`), y las exportaciones CSV (`api/export/facturas-proveedor`) tienen límite real y aplicado, o solo una utilería no invocada.
5. **Migraciones de seguridad/RLS** — no abrí ninguna. No puedo validar `grant`/`revoke`, RLS por tenant, ni que las tablas nuevas de 0075/0089/0090/0091 hayan nacido con políticas activas. El MAPA menciona el arreglo de FK compuesta, pero no una sola política de seguridad.
6. **`supabase/migrations/*seguridad*`** — ni siquiera consta en el MAPA qué migración de seguridad existe; no puedo verificar si `revoke from public` alcanza los GRANT implícitos de Supabase o deja agujeros en `storage`, `realtime`, `graphql` o esquemas públicos.
7. **`package-lock.json` / `npm audit`** — no pude revisar CVEs. Si no hay CVE con camino real de explotación en esta app, debe descartarse por escrito; hoy no puedo descartarlo.
8. **URLs firmadas** — no sé si hay URLs con TTL más largo que su necesidad en exportaciones o archivos de despacho.
9. **`src/lib/auth/visibilidad.ts`** — no verifiqué que operación, despacho, cobranza y proveedores no pinten pesos en un área sin dinero (`dinero_por_area.test.ts` es guardián de Frontend; aquí necesito leer la regla que ese test protege).

Conclusión de rubro: la nota **8/10 está sostenida por el ancla anterior, no por esta ronda**. Si el orquestador abre físicamente esas rutas y no encuentra hallazgos, el 8 queda. Si encuentra deuda media, baja a 7. Si encuentra acceso sin autenticar a datos de un tenant —webhook sin firma que inyecta mensajes, exportación sin `exigirPermiso`, o RLS abierto en tablas nuevas—, baja a 4 o menos.