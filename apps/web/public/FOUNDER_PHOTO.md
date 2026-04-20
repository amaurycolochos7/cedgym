# Foto del fundador

La sección `#fundador` de la landing carga `/founder.jpg`.

**Para activar la foto real:**
1. Guardá el retrato del cliente como `apps/web/public/founder.jpg`.
2. Formato recomendado: JPG/WebP, ~800×1000 px, portrait, peso <300 KB.
3. Mientras no exista ese archivo, el `<img>` cae a un placeholder oscuro (manejado por `onError` en `components/home/founder-section.tsx`).

> El nombre y los logros ya están hardcodeados en el componente.
> Si el cliente quiere actualizar texto, editá `components/home/founder-section.tsx`.
