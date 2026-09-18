# BacarNet (intranet1)

Frontend React + Vite en la raíz; API en `backend/` (Firebase Cloud Functions). Producción: [https://bacarnet.web.app](https://bacarnet.web.app) (proyecto Firebase `bacar-web`).

Documentación del backend: [backend/README.md](backend/README.md).

## Deploy — Hosting (`hosting:bacarnet`)

**Regla obligatoria:** no desplegar el frontend sin verificar que el bundle **no** incluye `VITE_API_BASE_URL` u otras URLs locales (p. ej. `http://127.0.0.1:8799` de scripts E2E). Si esa URL queda baked en el JS, la intranet en producción llama a localhost y fallan widgets, helpdesk y el resto de la API.

### Proceso estándar (usar siempre)

1. **Build** de producción (sin `VITE_API_BASE_URL` en `.env.local` ni en `.env.development.local`; borrá `.env.development.local` si quedó de un E2E).
2. **Verificación local del bundle** (bloqueante):
   ```bash
   npm run verify:hosting-bundle
   ```
   Equivalente manual:
   ```bash
   node backend/scripts/verify-hosting-bundle-local.mjs
   ```
   Revisa `dist/assets/*.js` y falla si encuentra `127.0.0.1` o `localhost:` con puerto.
3. **Deploy** solo si el paso 2 terminó en `OK`:
   ```bash
   npx firebase deploy --only hosting:bacarnet --project bacar-web
   ```

Atajo que encadena build + verificación + deploy:

```bash
npm run deploy:hosting:bacarnet
```

Firebase CLI también ejecuta `predeploy` del target `bacarnet` en `firebase.json` (`npm run build` + `npm run verify:hosting-bundle`) cuando corrés deploy de ese hosting — **no saltees la verificación** desplegando archivos viejos en `dist/` sin rebuild.

### Después del deploy (recomendado)

Comprobar el bundle publicado y una ruta `/api/me` same-origin:

```bash
npm run verify:hosting-bundle:live
```

Requiere credenciales en `backend/.env.local` / `.env.local` (token de prueba vía `get-test-token.mjs`).

### Qué evitar

- No agregar `VITE_API_BASE_URL=http://127.0.0.1:…` a `.env.local` para builds de producción.
- Los scripts E2E de helpdesk pueden crear `.env.development.local` con ese valor; eliminarlo si el script no lo borró al terminar.
- No usar `npx vite build` con la variable de entorno `VITE_API_BASE_URL` apuntando a localhost y después desplegar sin pasar `verify:hosting-bundle`.

## Desarrollo local

```bash
npm install
npm run dev
```

API local / emuladores: ver [backend/README.md](backend/README.md).
