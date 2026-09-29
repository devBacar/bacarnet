# BacarNet (intranet1)

**BacarNet** es la intranet corporativa de Bacar. Centraliza en una sola aplicación web (y app Android) las herramientas internas del equipo: comunicación interna, directorio de personas, gestión documental sobre Google Drive con clasificación y auditoría, mesa de ayuda de Sistemas, tableros de proyectos, un asistente con IA (RAG) sobre documentación interna y un módulo de Finanzas (cuentas, cheques, transferencias, movimientos bancarios y cajas).

Producción: [https://bacarnet.web.app](https://bacarnet.web.app) (proyecto Firebase `bacar-web`). Acceso restringido a cuentas Google Workspace del dominio corporativo (`@bacarsa.com.ar`).

> Reglas de trabajo del equipo (git, alcance, seguridad, calidad): **[REGLAS.md](./REGLAS.md)** — lectura obligatoria antes de tocar código.

## Qué hace

| Módulo | Descripción | Rutas principales |
|--------|-------------|-------------------|
| **Home / Intranet** | Portal de inicio: novedades, banners, enlaces útiles, kudos entre compañeros, encuestas y pregunta del día, clima, noticias externas, turnos. | `/`, `/intranet`, `/accesos-directos` |
| **Directorio** | Directorio de personas y contactos de la organización, organizado por áreas. | `/directorio` |
| **Recursos (Drive)** | Explorador de la Unidad compartida de Google Drive desde la intranet. Clasificación de sensibilidad (`USO_INTERNO` / `CONFIDENCIAL` / `RESTRINGIDO`), aprobación de documentos, permisos por área (gobernanza por jefes de área), copia autorizada para terceros, solicitud de acceso y subida de archivos Office con previsualización. Toda acción queda en `auditLogs`. | `/recursos`, `/recursos/documento/:fileId`, `/aprobaciones-pendientes` |
| **Mesa de ayuda (Sistemas)** | Solicitudes de soporte TI, seguimiento de tickets propios, bandeja del equipo de Sistemas y notificaciones. | `/support`, `/soporte-ti`, `/mis-solicitudes-sistemas`, `/sistemas/mesa-ayuda` |
| **Tableros** | Tableros de trabajo tipo kanban con control de acceso; incluye el tablero de Desarrollo · Proyectos vinculado a Drive. | `/tableros`, `/tableros/:boardId`, `/tableros/desarrollo-proyectos` |
| **Asistente IA (RAG)** | Asistente que responde preguntas sobre documentación interna de Sistemas indexada desde Drive (piloto). | `/recursos/asistente-sistemas`, `/admin/rag-pilot` |
| **Finanzas** | Cuentas bancarias, agenda de cheques (recibidos / emitidos), transferencias confeccionadas, movimientos bancarios con categorización por reglas (integración Interbanking) y cajas / caja chica con cierres. Doc del módulo: [src/components/finanzas/FINANZAS_MODULE.md](./src/components/finanzas/FINANZAS_MODULE.md). | `/finanzas/*` |
| **Centro de ayuda** | Ayuda y guías de uso de la intranet. | `/ayuda` |
| **Administración** | Panel para `super_admin` y roles administrativos: usuarios y roles, contenido del home, directorio, turnos, recursos/áreas de Drive, laboratorio de Drive y auditoría. | `/admin/*` |

Los usuarios nuevos pasan por un flujo de alta: cuenta pendiente de aprobación (`/cuenta-pendiente`) o rechazada (`/cuenta-rechazada`) hasta que un administrador los habilita. Los permisos por módulo se resuelven con `ModulePermissionRoute` y la configuración de roles/áreas del usuario.

## Arquitectura

```
Navegador / App Android (Capacitor)
        │
        ▼
Firebase Hosting (SPA React + Vite, carpeta dist/)
        │  rewrites /api/** ─────────────► Cloud Functions 2nd gen (southamerica-east1)
        │                                    ├─ api        → Express (backend/src)
        │                                    └─ widgetsApi → /api/me/** (widgets Google personales)
        ▼
Firestore · Firebase Auth · Storage · Google Drive API (DWD, impersonando datos@)
```

- **Frontend** (`src/`): React 19 + TypeScript + Vite, Tailwind CSS 4, React Router 7, TanStack Query, Firebase JS SDK. Empaquetado también como app Android con Capacitor (`android/`, `capacitor.config.ts`).
- **Backend** (`backend/`): Express sobre Firebase Cloud Functions, organizado en módulos bajo `backend/src/modules/`: `auth`, `users`, `areas`, `drive`, `approvalRequests`, `audit`, `boards`, `helpdesk`, `stTickets`, `notifications`, `rag`, `assistant-actions`, `googlePersonal`, `finanzas`. Documentación detallada (endpoints, autenticación, cuenta de servicio y Domain-Wide Delegation): [backend/README.md](backend/README.md).
- **Datos y seguridad**: Firestore con reglas en `firestore.rules` e índices en `firestore.indexes.json`. Autenticación con Google; el backend verifica el ID token, el dominio del email y la existencia del perfil en `users/{uid}`.
- **Hosting**: dos targets en `firebase.json`: `bacarnet` (la app) e `intranet-bacar` (redirección 301 al dominio actual).

## Estructura del repo

```
src/                 Frontend (pages, components, services, hooks, context, routes, types)
backend/             API Cloud Functions (src, scripts operativos y de prueba)
backend_clean/       Copia limpia usada como source de deploy de functions (ver scripts/sync-backend-src-to-clean.ps1)
android/             Proyecto Android generado por Capacitor
scripts/             Scripts de migración, seeds, emuladores y tests de reglas Firestore
docs/                Roadmap y especificaciones (Finanzas, OpenAPI de Interbanking, previews)
hosting-redirect/    Sitio estático del target intranet-bacar (redirect)
firestore.rules      Reglas de seguridad Firestore
firebase.json        Hosting, functions y emuladores
REGLAS.md            Reglas de trabajo del equipo
```

## Desarrollo local

```bash
git clone https://github.com/devBacar/bacarnet.git
cd bacarnet
npm install
npm --prefix backend install
cp .env.example .env.local                      # credenciales Firebase del front (no commitear)
cp backend/.env.example backend/.env
cp backend/.env.local.example backend/.env.local
npm run dev
```

- `npm run dev` levanta Vite y proxea `/api` al emulador de functions.
- `npm run functions:serve` compila el backend y arranca el emulador de Cloud Functions.
- Emuladores completos con datos de `.emulator-data/`: `node scripts/bacarnet-emulators-runner.mjs`.
- App Android: `npm run android` (build + `cap sync` + abre Android Studio).

Más detalle de API local, tokens de prueba y emuladores: [backend/README.md](backend/README.md).

## Scripts útiles

| Comando | Qué hace |
|---------|----------|
| `npm run build` | Type-check + build de producción en `dist/` |
| `npm run lint` | Lint con oxlint |
| `npm run test:finanzas` | Tests unitarios del backend de Finanzas (vitest) |
| `npm run test:rules:users` / `:helpdesk` / `:cajas` | Tests de reglas Firestore con el emulador |
| `npm run token:test` | Genera un ID token de prueba para llamar a la API local |
| `npm run test:drive:*`, `test:e2e:*`, `test:boards`, `test:rag:*` | Scripts de prueba por módulo contra el emulador |
| `npm run *:seed` / `*:seed:dry-run` | Seeds de datos (áreas, MIME permitidos, finanzas, tableros, RAG) |
| `npm run migrate:roles`, `audit:reset`, `governing-area:*`, `legacy:*` | Migraciones y mantenimiento de datos (todas con variante `--dry-run`) |
| `npm run secrets:scan` | Escaneo de secretos con ggshield |

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

### Functions y reglas

```bash
npx firebase deploy --only functions:api --project bacar-web
npx firebase deploy --only firestore:rules --project bacar-web
```

Despliegue coordinado cuando cambie la API o `firestore.rules`; avisar al equipo. Solo quien tenga el rol acordado ejecuta deploy a producción (ver [REGLAS.md](./REGLAS.md)).
