***REMOVED*** Backend (Cloud Functions)

HTTP API de la intranet. Fuente: `backend/`. Runtime: **Firebase Cloud Functions (2nd gen)**, región `southamerica-east1`. Firebase Admin y Google Drive usan **ADC** en producción (sin JSON de clave).

Función exportada: `api` → Express. Rutas con prefijo `/api`.

***REMOVED******REMOVED*** Endpoints (pasos 2–5)

| Método | Ruta | Auth | Qué hace |
|--------|------|------|----------|
| GET | `/api/health` | no | Liveness |
| GET | `/api/drive/files?folderId=` | Bearer + **`role: super_admin`** (temporal) | Lista hijos directos de una carpeta en la Unidad compartida fija (`DRIVE_ID`). Sin `folderId` (o `folderId=root`) lista la raíz de esa unidad. |
| POST | `/api/drive/files` | Bearer + **`role: super_admin`** (temporal) | Crea un Google Doc/Sheet (o metadata `upload` con MIME de whitelist) con `reason` obligatorio, `classification` opcional (default `USO_INTERNO`) y escribe `auditLogs` + `driveFiles/{id}`. |
| POST | `/api/drive/files/:fileId/trash` | Bearer + **`role: super_admin`** (temporal) | Mueve a papelera (`trashed: true`, no `files.delete`) con `reason` obligatorio y escribe `auditLogs`. |
| PATCH | `/api/drive/files/:fileId/classification` | Bearer + **gobernanza** (`super_admin` o jefe con `governingAreaId` en `managedAreaIds`) | Cambia `USO_INTERNO` / `CONFIDENCIAL` / `RESTRINGIDO` con `reason` obligatorio; `auditLogs` `classification_change`. |
| PATCH | `/api/drive/files/:fileId/status` | Bearer + **gobernanza** | Pasa `BORRADOR` → `APROBADO` (informativo, no bloquea visibilidad). `auditLogs` `approval`. |
| GET | `/api/drive/files/:fileId/permissions` | Bearer + **gobernanza** | Lista permisos del archivo/carpeta. Jefes de área no ven cuentas privilegiadas (`datos@`, `super_admin`). |
| POST | `/api/drive/files/:fileId/permissions` | Bearer + **gobernanza** | Otorga `type: user` (@bacarsa) o `type: domain` (link de dominio). `anyone` siempre bloqueado. `domain` bloqueado si `RESTRINGIDO`. |
| POST | `/api/drive/files/:fileId/permissions/area` | Bearer + **gobernanza** | Fan-out de permiso a miembros del área gobernante (`memberAreaIds` ∪ jefes). |
| POST | `/api/drive/files/:fileId/permissions/:permissionId/revoke` | Bearer + **gobernanza** | Revoca un permiso (`reason` en body). |
| POST | `/api/drive/files/:fileId/authorized-copy` | Bearer + **gobernanza** | Copia el archivo (`files.copy`) para un tercero; no toca permisos del original. Opcionalmente comparte la copia con `recipientEmail` externo. |
| GET | `/api/audit/logs` | Bearer + **`super_admin`** | Lista `auditLogs` (Admin SDK). `filterBy=userId\|targetId\|action` + `value`, fechas opcionales, `pageSize`/`pageToken`. |

**Unidad compartida:** `corpora`/`driveId` (listado) y `parents` (create) anclados a `DRIVE_ID`. El query/body no pueden cambiar de unidad. `parentFolderId` se valida con `files.get` (`driveId` del padre === `DRIVE_ID`).

**Unidad compartida:** `corpora: 'drive'` y `driveId` salen solo de `DRIVE_ID` en el servidor. El query/body no pueden cambiar de unidad.

**Importante:** Drive se llama impersonando a `datos@bacarsa.com.ar`. Aprobación, clasificación, permisos y copia autorizada usan **gobernanza por área** (`canGovernDriveFile`: `super_admin` o jefe con el `governingAreaId` del archivo en `managedAreaIds`). Listado/creación/trash de archivos siguen restringidos a `super_admin` por ahora.

***REMOVED******REMOVED*** Auth

1. `Authorization: Bearer <Firebase ID token>`
2. `verifyIdToken`
3. `email_verified === true`
4. El email termina en `@bacarsa.com.ar` (también en backend; no alcanza la config del front)
5. Existe documento `users/{uid}` en Firestore

***REMOVED******REMOVED*** Cuenta de servicio + Domain-Wide Delegation

La SA con DWD puede leer y escribir **todo** lo de `datos@bacarsa.com.ar`. Tratala como clave maestra de Drive: el JSON de clave privada no entra al repo, no se sube a Cloud Functions, y no se loguea.

***REMOVED******REMOVED******REMOVED*** Google Cloud / Workspace (una vez)

1. Proyecto GCP (`bacar-web`) → habilitar **Google Drive API** e **IAM Credentials API** (`iamcredentials.googleapis.com`).
2. Cuenta de servicio **`datos-drive-sa@bacar-web.iam.gserviceaccount.com`** dedicada a Drive+DWD (no reutilizar `firebase-adminsdk` si se puede evitar). Anotá su **Client ID** numérico.
3. Google Workspace Admin → Seguridad → Controles de API → **Delegación a nivel de dominio**: autorizar ese Client ID con el scope `https://www.googleapis.com/auth/drive`.
4. Cloud Functions (2nd gen): **runtime service account** = `datos-drive-sa@bacar-web.iam.gserviceaccount.com` (configurado en `backend/src/index.ts`; no la Compute Engine default).
5. IAM: otorgar a esa identidad de runtime el rol **`roles/iam.serviceAccountTokenCreator`** **sobre el recurso de la SA con DWD** (si runtime y DWD son la misma SA, es un grant **sobre sí misma**).
   - Permiso concreto que usa `signJwt`: `iam.serviceAccounts.signJwt`.
   - El rol Token Creator también incluye `iam.serviceAccounts.signBlob` y `iam.serviceAccounts.getAccessToken`; no hace falta un rol custom si usás Token Creator.
6. Env (no son el JSON): `DRIVE_IMPERSONATE_EMAIL=datos@bacarsa.com.ar`, `DRIVE_ID=<id de la Unidad compartida>`, `ALLOWED_EMAIL_DOMAIN=bacarsa.com.ar`. `DRIVE_ID` no es la clave de la SA, pero es el ancla de qué unidad toca la API: no lo aceptes desde el cliente.

***REMOVED******REMOVED******REMOVED*** Producción (camino principal): ADC, sin JSON

En Cloud Functions **no se descarga, no se monta y no se lee ningún archivo de clave**.

Flujo:

1. El runtime ya tiene identidad ADC (metadata server). No hay `GOOGLE_APPLICATION_CREDENTIALS` en el contenedor.
2. Construir JWT con `iss` = SA runtime, `sub` = usuario impersonado, `scope`, `aud` = token URL.
3. Llamar **IAM Credentials API** `projects/-/serviceAccounts/{SA}:signJwt` con ADC del runtime (`dwdIamAuth.ts`).
4. Intercambiar `signedJwt` en `https://oauth2.googleapis.com/token` (grant `jwt-bearer`).
5. Usar el access token en el cliente Drive (`OAuth2Client` con refresh vía el mismo flujo).

No hay Secret Manager ni volumen con JSON en este camino.

Opcional: `DRIVE_SERVICE_ACCOUNT_EMAIL` si el metadata server no devuelve el email (sigue siendo un identificador, no una clave).

***REMOVED******REMOVED******REMOVED*** Local (dos JSON, dos variables)

En desarrollo hay **dos** cuentas y **dos** archivos en **`backend/.env.local`** (no se despliega). No compartir `GOOGLE_APPLICATION_CREDENTIALS` entre ellas: si esa variable apunta al JSON de `datos-drive-sa`, el Admin SDK pierde acceso a Firebase (`PERMISSION_DENIED` al verificar tokens).

```
***REMOVED*** backend/.env.local (copiar desde .env.local.example)
ADMIN_SDK_KEY_PATH=<ruta absoluta al JSON de firebase-adminsdk-fbsvc@bacar-web>
DRIVE_SERVICE_ACCOUNT_KEY_PATH=<ruta absoluta al JSON de datos-drive-sa>
```

Valores compartidos (`DRIVE_ID`, tableros, etc.) van en `backend/.env`. **Producción** usa solo `backend/.env.bacar-web` + ADC; nunca paths a JSON.

```
DRIVE_IMPERSONATE_EMAIL=datos@bacarsa.com.ar
DRIVE_ID=<id de la Unidad compartida>
DRIVE_SERVICE_ACCOUNT_EMAIL=datos-drive-sa@bacar-web.iam.gserviceaccount.com
```

Copiá `backend/.env.example` → `backend/.env` y `backend/.env.local.example` → `backend/.env.local`. Los JSON viven fuera del repo. `driveClient.ts` **no lee** `GOOGLE_APPLICATION_CREDENTIALS`. El Admin SDK **no lee** `DRIVE_SERVICE_ACCOUNT_KEY_PATH` en Cloud Functions (runtime ignora esas vars aunque queden seteadas).

Si tenés `GOOGLE_APPLICATION_CREDENTIALS` en el sistema (IDE, terminal), dejala apuntando a firebase-adminsdk o borrala: **no la pongas en `backend/.env`** (`GOOGLE_` es prefijo reservado y el emulador rechaza el archivo entero). El emulador no la necesita para Drive.

Prefijos que **no** pueden aparecer como nombres de variable en `backend/.env`: `FIREBASE_`, `GOOGLE_`, `X_GOOGLE_`, `EXT_`.

***REMOVED******REMOVED******REMOVED*** Producción (este cambio no la altera)

Sigue el flujo ADC documentado arriba: **no** setear `ADMIN_SDK_KEY_PATH` ni `DRIVE_SERVICE_ACCOUNT_KEY_PATH` en Cloud Functions.

- Admin: `initializeApp()` sin `cert` → identidad de runtime (permisos Firebase).
- Drive: JWT **sin** `keyFile`, `subject` = `datos@…`, firma IAM `signJwt`.

Las variables nuevas solo aplican cuando hay un path de JSON; en prod esos paths están vacíos y el código toma el mismo branch de antes.

***REMOVED******REMOVED******REMOVED*** Respaldo: Secret Manager (solo si corre fuera de Firebase)

JSON de **Drive** en Secret Manager, montado `0400`, path en `DRIVE_SERVICE_ACCOUNT_KEY_PATH` (no en `GOOGLE_APPLICATION_CREDENTIALS`). El de firebase-adminsdk, si hiciera falta, en `ADMIN_SDK_KEY_PATH`.

***REMOVED******REMOVED******REMOVED*** Rotación

- **Prod (ADC):** no hay clave JSON que rotar. Si se compromete la SA, deshabilitarla / crear otra, reautorizar DWD con el **nuevo** Client ID en Workspace, y apuntar el runtime de Functions a la SA nueva.
- **Local:** rotar cada JSON por separado y actualizar `ADMIN_SDK_KEY_PATH` o `DRIVE_SERVICE_ACCOUNT_KEY_PATH`. Probar `GET /api/drive/files?folderId=root` → borrar la clave vieja. El Client ID de DWD en Workspace no cambia si la SA de Drive es la misma.

***REMOVED******REMOVED******REMOVED*** Logs

`lib/log.ts` (`logError` / `logInfo`):

- No serializa el cliente JWT, `credentials`, `config` de axios/googleapis, ni el error completo.
- Solo `name`, `code`, `status` y `message` pasado por redact: `Bearer …`, PEM `PRIVATE KEY`, access tokens `ya29.…`, JWT compactos `eyJ…`.
- Las rutas de Drive no hacen `console.log` del resultado de `authorize()` ni del access token.
- No hay log en nivel debug del token. No uses `DEBUG=*` / `GOOGLE_SDK_NODE_LOGGING` en prod: esas flags de las libs de Google sí pueden volcar requests.

***REMOVED******REMOVED*** Desarrollo local

```bash
cd backend
npm install
copy .env.example .env
copy .env.local.example .env.local
***REMOVED*** ADMIN_SDK_KEY_PATH y DRIVE_SERVICE_ACCOUNT_KEY_PATH van en .env.local

cd ..
npm run functions:serve
```

Emulador: `http://127.0.0.1:5001/bacar-web/southamerica-east1/api`

ID token de prueba (sin copiarlo del navegador): custom token Admin SDK → Identity Toolkit, usando un `users/{uid}` con `role: 'super_admin'`. Lee `ADMIN_SDK_KEY_PATH` y `VITE_FIREBASE_API_KEY`.

```bash
npm run token:test
npm run test:drive:trash
```

Ejemplo (token de un usuario @bacarsa.com.ar logueado):

```bash
curl "http://127.0.0.1:5001/bacar-web/southamerica-east1/api/api/health"

curl -H "Authorization: Bearer ID_TOKEN" ^
  "http://127.0.0.1:5001/bacar-web/southamerica-east1/api/api/drive/files?folderId=root"
```

(El primer `/api` es el nombre de la función; el segundo es la ruta Express.)

Vite (`npm run dev`) proxea `/api` al emulador, así el front puede llamar `/api/drive/files` en el mismo origin.

***REMOVED******REMOVED*** Deploy

```bash
npx firebase deploy --only functions:api,hosting:bacarnet --project bacar-web
```

Hosting reescribe `/api/**` a la función `api` (antes del SPA fallback).

***REMOVED******REMOVED*** Clasificación (`driveFiles`)

Metadata de intranet (no de Drive), keyed por Drive file id. Ausente en Firestore ≡ `classification: USO_INTERNO` y `status: BORRADOR`. `status` es informativo: **no** bloquea listado, permisos ni copia. `anyone` (link público) siempre bloqueado. `domain` (Bacarsa con el link) bloqueado si `RESTRINGIDO`. Terceros: copia autorizada, no share del original.

***REMOVED******REMOVED*** Permisos de la API vs miembros de la Unidad compartida

La clasificación de sensibilidad (`classification` en `driveFiles`) y los permisos otorgados vía la API de la intranet controlan el acceso de usuarios normales. **NO** protegen contra quien sea miembro directo de la Unidad compartida `bacarsa` en Drive: esos miembros (pensados para ser únicamente cuentas de `super_admin`) tienen acceso total a todo el contenido de la unidad sin importar la clasificación, y ese acceso no pasa por nuestra API ni queda registrado en `auditLogs`.

Por eso es crítico mantener la lista de miembros de la Unidad compartida acotada exclusivamente a cuentas de confianza. Agregar a alguien como miembro de la unidad equivale a darle `super_admin` de facto sobre todos los datos, sin que el sistema lo sepa ni lo trace. Un `permissions.delete` sobre un archivo no puede revocar esa membresía: Drive la trata como permiso heredado de la unidad, no como un grant individual.

***REMOVED******REMOVED*** Próximo paso

UI de Drive (crear / permisos / clasificación) sobre estos endpoints.
