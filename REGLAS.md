# Reglas de proyecto — BacarNet (`intranet1`)

Documento **obligatorio** y **único de referencia** para el equipo y para asistentes de IA (Cursor, Claude, Copilot, etc.). **Reemplaza cualquier instrucción previa bajo el nombre `CLAUDE.md`:** todo lo que la IA y los devs deben respetar está acá. Objetivo: mismo criterio de arquitectura, git, seguridad y calidad entre todos.

**Repositorio:** [github.com/devBacar/bacarnet](https://github.com/devBacar/bacarnet) (privado).

---

## 0. Instrucción para tu IA (copiar al inicio del chat o reglas del IDE)

> Antes de analizar código, proponer cambios o editar archivos, leé **`REGLAS.md`** en la raíz del repo (es la fuente única de reglas del proyecto). Ante conflicto con una instrucción suelta del chat, **manda `REGLAS.md`**. Respetá ramas `feature/*` y `fix/*`, alcance atómico, sin secretos en código, sin commits directos a `main`. Para módulo Finanzas, leé además `src/components/finanzas/FINANZAS_MODULE.md`.

---

## 1. Qué es este proyecto

| Item | Detalle |
|------|---------|
| Producto | **BacarNet** — intranet corporativa |
| Carpeta local habitual | `intranet1` |
| Frontend | React 19 + Vite + TypeScript (`src/`) |
| Backend | Express en Firebase Cloud Functions (`backend/`) |
| Datos | Firestore, Auth, Storage (proyecto Firebase `bacar-web`) |
| Producción | [https://bacarnet.web.app](https://bacarnet.web.app) |

Más detalle: [README.md](./README.md), [backend/README.md](./backend/README.md).

---

## 2. Jerarquía de documentación

1. **`REGLAS.md`** (este archivo) — **fuente única:** flujo de trabajo, arquitectura general, seguridad, git, calidad y rol humano/IA. No usar ni crear `CLAUDE.md`; quedó unificado acá.
2. **Docs de módulo** — ej. `src/components/finanzas/FINANZAS_MODULE.md` para reglas específicas de Finanzas.
3. **README / backend README** — deploy, emuladores, scripts operativos.

---

## 3. Metodología de trabajo

### 3.1 Alcance

- **Una tarea pequeña y concreta** por vez: un bug, un componente, un endpoint, un ajuste acotado.
- **No** refactorizaciones masivas ni archivos fuera del alcance **salvo que el ticket lo pida explícitamente**.
- Preferir el **diff mínimo** que resuelva el problema.

### 3.2 Git y ramas

- **`main`** es estable y desplegable. **No** commitear ni pushear directo a `main`.
- Todo cambio va en:
  - `feature/<nombre-corto>` — funcionalidad nueva o mejora.
  - `fix/<nombre-corto>` — corrección de bug.
- Flujo recomendado:
  1. `git pull origin main`
  2. Crear rama desde `main` actualizada.
  3. Commits pequeños y mensajes claros (qué y por qué).
  4. **Pull Request** hacia `main` → revisión de otro dev → merge.
- Sincronizá tu rama con `main` seguido (`merge` o `rebase` según acuerdo del equipo) para evitar PRs gigantes.

### 3.3 Rol humano vs IA

- La **IA propone** análisis, diseño y código.
- El **desarrollador humano** aprueba, commitea, abre PR, mergea y **despliega**.
- La IA **no** asume que puede pushear, mergear o desplegar sin instrucción explícita.

---

## 4. Seguridad y secretos

- **Nunca** pegar en chat ni commitear: claves de API, tokens, `serviceAccount*.json`, contraseñas reales, `.env`, `.env.local`, `backend/.env.local`.
- Usar **`*.example`** como plantilla; cada dev copia a archivos locales ignorados por git.
- Scripts E2E: contraseñas efímeras vía `backend/scripts/lib/testSecrets.mjs` (`generateEphemeralPassword`, `requireTestAccountPassword`); **no** literales tipo `MiPassword123` en el repo.
- Pre-commit **ggshield** puede bloquear commits con secretos: corregir el código, no saltear el hook salvo falso positivo acordado.

---

## 5. Integridad de datos y cambios sensibles

### 5.1 Bajas lógicas

- **No** borrado físico (`deleteDoc` / delete en SQL) para **usuarios, clientes u entidades principales** de negocio.
- Usar **baja lógica** (ej. `status: "INACTIVE"`, flags, timestamps de baja) salvo que un diseño documentado diga lo contrario.

### 5.2 Archivos de alto impacto

Antes de modificar, **avisar en el PR / al revisor** y probar en local:

| Área | Riesgo |
|------|--------|
| `firestore.rules` | Acceso indebido o bloqueo de producción |
| `storage.rules` | Idem |
| Hooks/contextos globales (`AuthContext`, permisos, rutas protegidas) | Comportamiento en toda la app |
| Sincronización / jobs / webhooks | Datos inconsistentes o duplicados |
| Cloud Functions (`backend/`, deploy `functions:api`) | API caída o regresiones |

Tras cambiar **rules** o **functions**, validar con emuladores o scripts de reglas cuando aplique (`npm run test:rules:*`, ver backend README).

---

## 6. Estándares técnicos

- **TypeScript estricto:** evitar `any` innecesarios; tipos alineados front/back en módulos compartidos (ej. Finanzas).
- Tras cambios relevantes en front: `npm run build`.
- Tras cambios en backend Finanzas/cheques: `npm run test:finanzas` (desde raíz).
- Mantener convenciones existentes: nombres, estructura de carpetas, estilo de imports del archivo que tocás.
- **Lint:** `npm run lint` cuando toques muchos archivos TS/TSX.

### 6.1 Frontend

- Rutas en `src/routes/AppRoutes.tsx`; permisos vía `ModulePermissionRoute` y servicios de usuario/config.
- API: `resolveApiUrl` / servicios en `src/services/*`; no hardcodear URLs de prod en código versionado.

### 6.2 Backend

- Módulos bajo `backend/src/modules/<nombre>/` (routes, services, domain).
- Finanzas: `/api/finanzas/*` — cuentas, cheques (recibido/emitido), agenda.

---

## 7. Deploy (resumen)

Reglas completas en [README.md](./README.md).

- **Hosting:** siempre `npm run verify:hosting-bundle` antes de desplegar; **no** bakear `VITE_API_BASE_URL` con localhost en builds de producción.
- Atajo seguro: `npm run deploy:hosting:bacarnet`.
- **Functions + rules:** despliegue coordinado cuando cambie API o Firestore rules; comunicar al equipo.

Solo quien tenga rol acordado en el equipo ejecuta deploy a producción.

---

## 8. Módulo Finanzas (puntero)

Rutas bajo `/finanzas/*`; un solo ítem **Finanzas** en la navbar; sub-navegación interna (`FinanzasSubNav`, `finanzasNavConfig.ts`).

Convenciones de formularios, cheques recibidos vs emitidos: **[src/components/finanzas/FINANZAS_MODULE.md](./src/components/finanzas/FINANZAS_MODULE.md)**.

Nuevas secciones (Créditos, Caja chica, etc.) se agregan **dentro** del módulo, no como ítems sueltos en la navbar principal.

---

## 9. Entorno local (mínimo)

```bash
git clone https://github.com/devBacar/bacarnet.git
cd bacarnet   # o intranet1 según carpeta local
npm install
npm --prefix backend install
cp .env.example .env.local          # completar según equipo — no commitear
cp backend/.env.local.example backend/.env.local
npm run dev
```

API / emuladores: [backend/README.md](./backend/README.md).

---

## 10. Checklist antes de abrir PR

- [ ] Rama `feature/*` o `fix/*`, actualizada con `main`.
- [ ] Alcance acotado al ticket; sin secretos ni `.env` en el diff.
- [ ] `npm run build` (y tests de módulo si aplica).
- [ ] Si tocaste `firestore.rules` / functions: probado en local y descrito en la descripción del PR.
- [ ] Capturas o pasos de prueba en el PR para cambios de UI.

---

## 11. Mantenimiento de este documento

- Cualquier cambio de reglas del equipo → **PR que modifique solo `REGLAS.md`** (o incluya el doc junto con el cambio que lo motiva), con revisión de al menos un par.
- No duplicar estas reglas en otros archivos con nombres distintos (`CLAUDE.md`, `AGENTS.md`, etc.): actualizá **`REGLAS.md`** y, si hace falta, el puntero en docs de módulo.

*Última actualización orientativa: septiembre 2026 — BacarNet / equipo devBacar.*
