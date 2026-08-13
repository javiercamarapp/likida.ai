-- ═══════════════════════════════════════════════════════════════════════════
-- 0093 — El bucket público `avatares` deja de aceptar el content-type que
--         elija quien sube. En particular, deja de aceptar SVG.
--
-- AUDITORÍA 17 pase 5, BAJO. `admin/mi-perfil/page.tsx:47-52` arma la ruta con
-- la extensión del archivo del usuario (`archivo.name.split('.').pop()`) y
-- sube con `contentType: archivo.type || undefined`, hacia `avatares`, que la
-- 0046 creó `public: true` con `avatares_lectura_publica for select to public`.
-- Subir `x.svg` declarado `image/svg+xml` deja un SVG SERVIDO CON ESE
-- content-type en una URL pública del proyecto.
--
-- Por qué es BAJO y no más: solo `requireSuperadmin()` alcanza ese action, o
-- sea Javier; el archivo se sirve desde el origen de Supabase y no desde
-- `app.likida.ai`, así que no toca las cookies de la app; y el CSP
-- (`proxy.ts:74`) admite `*.supabase.co` en `img-src` pero no en `script-src`.
-- Lo que queda es la forma —extensión y content-type de un tercero hacia el
-- ÚNICO bucket público del proyecto— y eso sí se puede cerrar aquí.
--
-- SE CIERRA EN LA BASE Y NO EN EL TYPESCRIPT, a propósito: `allowed_mime_types`
-- lo aplica Supabase Storage en el momento del PUT, así que cubre también
-- cualquier subida futura a este bucket que no pase por esa pantalla. La
-- validación en el cliente sigue faltando y no la agrega esta migración —
-- `mi-perfil/page.tsx` es de otro agente en este pase—, pero ya no es la única
-- puerta.
--
-- Lista deliberadamente RASTER. Sin `image/svg+xml` (es un documento con
-- script, no una imagen) y sin comodines. Un `.jpg` renombrado a `.svg` sigue
-- pudiendo subirse si se declara `image/jpeg`, y está bien: se sirve como JPEG
-- y el navegador no ejecuta nada.
--
-- MODO DE FALLA, dicho antes de que pase: si alguien sube un archivo cuyo
-- navegador no declara tipo, Supabase Storage contesta 400 `invalid_mime_type`
-- y la pantalla enseña el error. Ruidoso y en la cara de quien sube — no un
-- avatar que se guarda mal en silencio.
-- ═══════════════════════════════════════════════════════════════════════════

update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
 where id = 'avatares';

-- Y por si el bucket no existiera todavía en este proyecto (la 0046 lo inserta
-- con `on conflict do nothing`, así que pudo crearse antes a mano y con otra
-- forma): se deja escrito el estado esperado, no solo el UPDATE.
insert into storage.buckets (id, name, public, allowed_mime_types)
values ('avatares', 'avatares', true,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
on conflict (id) do update
  set allowed_mime_types = excluded.allowed_mime_types;
