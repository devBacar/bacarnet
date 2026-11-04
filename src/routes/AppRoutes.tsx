import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AdminLayout, PublicLayout, RagAssistantHost } from '../components'
import {
  AppsHub,
  BoardList,
  BoardViewerPage,
  Directory,
  HelpdeskSolicitud,
  Home,
  IntranetHub,
  AccountPendingPage,
  AccountRejectedPage,
  Resources,
  FinanzasLayout,
  FinanzasIndexRedirect,
} from '../pages'
import { RouteFallback } from './RouteFallback'
import { ProtectedRoute } from './ProtectedRoute'
import { AccountStatusRoute } from './AccountStatusRoute'
import { AdminRoute } from './AdminRoute'
import { BoardsRoute } from './BoardsRoute'
import { CorporateAccountRoute } from './CorporateAccountRoute'
import { RagPilotRoute } from './RagPilotRoute'
import { SuperAdminRoute } from './SuperAdminRoute'
import { ModulePermissionRoute } from './ModulePermissionRoute'
import { FinanzasModuleGate } from './FinanzasModuleGate'
import { FinanzasFullSectionsGate } from './FinanzasFullSectionsGate'

const AdminAudit = lazy(() => import('../pages/AdminAudit').then((m) => ({ default: m.AdminAudit })))
const AdminContent = lazy(() =>
  import('../pages/AdminContent').then((m) => ({ default: m.AdminContent })),
)
const AdminDashboard = lazy(() =>
  import('../pages/AdminDashboard').then((m) => ({ default: m.AdminDashboard })),
)
const AdminDirectory = lazy(() =>
  import('../pages/AdminDirectory').then((m) => ({ default: m.AdminDirectory })),
)
const AdminDriveLab = lazy(() =>
  import('../pages/AdminDriveLab').then((m) => ({ default: m.AdminDriveLab })),
)
const AdminResources = lazy(() =>
  import('../pages/AdminResources').then((m) => ({ default: m.AdminResources })),
)
const AdminShifts = lazy(() => import('../pages/AdminShifts').then((m) => ({ default: m.AdminShifts })))
const AdminUsers = lazy(() => import('../pages/AdminUsers').then((m) => ({ default: m.AdminUsers })))
const DesarrolloProyectosBoard = lazy(() =>
  import('../pages/DesarrolloProyectosBoard').then((m) => ({
    default: m.DesarrolloProyectosBoard,
  })),
)
const DriveDocumentViewerPage = lazy(() =>
  import('../pages/DriveDocumentViewer').then((m) => ({ default: m.DriveDocumentViewerPage })),
)
const HelpCenter = lazy(() => import('../pages/HelpCenter').then((m) => ({ default: m.HelpCenter })))
const MisSolicitudesSistemas = lazy(() =>
  import('../pages/MisSolicitudesSistemas').then((m) => ({ default: m.MisSolicitudesSistemas })),
)
const AprobacionesPendientes = lazy(() =>
  import('../pages/AprobacionesPendientes').then((m) => ({ default: m.AprobacionesPendientes })),
)
const OfficeUploadPreviewPage = lazy(() =>
  import('../pages/OfficeUploadPreview').then((m) => ({ default: m.OfficeUploadPreviewPage })),
)
const RagAssistantRedirect = lazy(() =>
  import('../pages/RagAssistantRedirect').then((m) => ({ default: m.RagAssistantRedirect })),
)
const RagPilotSistemas = lazy(() =>
  import('../pages/RagPilotSistemas').then((m) => ({ default: m.RagPilotSistemas })),
)
const SistemasMesaAyuda = lazy(() =>
  import('../pages/SistemasMesaAyuda').then((m) => ({ default: m.SistemasMesaAyuda })),
)
const SoporteTi = lazy(() => import('../pages/SoporteTi').then((m) => ({ default: m.SoporteTi })))
const FinanzasHoyPage = lazy(() =>
  import('../pages/finanzas/HoyPage').then((m) => ({ default: m.FinanzasHoyPage })),
)
const FinanzasCuentasPage = lazy(() =>
  import('../pages/finanzas/CuentasPage').then((m) => ({ default: m.FinanzasCuentasPage })),
)
const FinanzasAgendaPage = lazy(() =>
  import('../pages/finanzas/AgendaPage').then((m) => ({ default: m.FinanzasAgendaPage })),
)
const FinanzasTransferenciasPage = lazy(() =>
  import('../pages/finanzas/TransferenciasPage').then((m) => ({
    default: m.FinanzasTransferenciasPage,
  })),
)
const FinanzasMovimientosPage = lazy(() =>
  import('../pages/finanzas/MovimientosPage').then((m) => ({ default: m.FinanzasMovimientosPage })),
)
const FinanzasExtractosPage = lazy(() =>
  import('../pages/finanzas/ExtractosPage').then((m) => ({ default: m.FinanzasExtractosPage })),
)
const FinanzasCajasPage = lazy(() =>
  import('../pages/finanzas/CajasWorkspace').then((m) => ({
    default: m.CajasWorkspace,
  })),
)
const FinanzasChequesPage = lazy(() =>
  import('../pages/finanzas/ChequesPage').then((m) => ({ default: m.FinanzasChequesPage })),
)
const FinanzasVientriPage = lazy(() =>
  import('../pages/finanzas/VientriPage').then((m) => ({ default: m.FinanzasVientriPage })),
)
const InversionesPage = lazy(() =>
  import('../pages/finanzas/InversionesPage').then((m) => ({ default: m.InversionesPage })),
)
const InversorCuentaPage = lazy(() =>
  import('../pages/finanzas/InversorCuentaPage').then((m) => ({ default: m.InversorCuentaPage })),
)
const RrhhHorasExtraPage = lazy(() =>
  import('../pages/rrhh/HorasExtraPage').then((m) => ({ default: m.RrhhHorasExtraPage })),
)
const TableroFinanzasPage = lazy(() =>
  import('../pages/tablero-finanzas/TableroFinanzasPage').then((m) => ({
    default: m.TableroFinanzasPage,
  })),
)
const TableroVentasPage = lazy(() =>
  import('../pages/tablero-ventas/TableroVentasPage').then((m) => ({
    default: m.TableroVentasPage,
  })),
)
const TableroCombustiblePage = lazy(() =>
  import('../pages/tablero-combustible/TableroCombustiblePage').then((m) => ({
    default: m.TableroCombustiblePage,
  })),
)
const NegocioBoard = lazy(() =>
  import('../pages/tableros/NegocioBoard').then((m) => ({ default: m.NegocioBoard })),
)
const CopsBoard = lazy(() => import('../pages/tableros/CopsBoard').then((m) => ({ default: m.CopsBoard })))
const WeatherUtilitiesPreview = lazy(() =>
  import('../pages/WeatherUtilitiesPreview').then((m) => ({ default: m.WeatherUtilitiesPreview })),
)

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="support" element={<HelpdeskSolicitud />} />
        {import.meta.env.DEV ? (
          <Route path="__dev/weather-utilities-preview" element={<WeatherUtilitiesPreview />} />
        ) : null}
        <Route path="login" element={<Navigate to="/" replace />} />

        <Route element={<ProtectedRoute />}>
          <Route path="cuenta-pendiente" element={<AccountPendingPage />} />
          <Route path="cuenta-rechazada" element={<AccountRejectedPage />} />

          <Route element={<AccountStatusRoute />}>
          <Route element={<BoardsRoute />}>
            <Route path="tableros/:boardId" element={<BoardViewerPage />} />
          </Route>

          <Route element={<ModulePermissionRoute permission="view_drive" module="resourcesEnabled" />}>
            <Route path="recursos/documento/:fileId" element={<DriveDocumentViewerPage />} />
          </Route>

          <Route element={<PublicLayout />}>
            <Route path="intranet" element={<IntranetHub />} />
            <Route path="accesos-directos" element={<AppsHub />} />
            <Route element={<ModulePermissionRoute permission="view_directory" module="directoryEnabled" />}>
              <Route path="directorio" element={<Directory />} />
            </Route>
            <Route element={<FinanzasModuleGate />}>
              <Route path="finanzas" element={<FinanzasLayout />}>
                <Route index element={<FinanzasIndexRedirect />} />
                <Route element={<FinanzasFullSectionsGate />}>
                  <Route path="hoy" element={<FinanzasHoyPage />} />
                  <Route path="cuentas" element={<FinanzasCuentasPage />} />
                  <Route path="agenda" element={<FinanzasAgendaPage />} />
                  <Route path="transferencias" element={<FinanzasTransferenciasPage />} />
                  <Route path="movimientos" element={<FinanzasMovimientosPage />} />
                  <Route path="extractos" element={<FinanzasExtractosPage />} />
                  <Route path="cheques" element={<FinanzasChequesPage />} />
                  <Route path="vientri" element={<FinanzasVientriPage />} />
                  <Route path="inversiones" element={<InversionesPage />} />
                  <Route path="inversiones/inversores/:inversorId" element={<InversorCuentaPage />} />
                  <Route path="inversiones/:id" element={<InversionesPage />} />
                </Route>
                <Route path="cajas" element={<FinanzasCajasPage />} />
                <Route path="cajachica" element={<Navigate to="/finanzas/cajas" replace />} />
              </Route>
            </Route>
            {/* RRHH ahora es un tablero: las rutas viejas llevan al tablero. */}
            <Route path="rrhh" element={<Navigate to="/tableros/rrhh" replace />} />
            <Route path="rrhh/horas-extra" element={<Navigate to="/tableros/rrhh" replace />} />
            <Route element={<ModulePermissionRoute permission="view_drive" module="resourcesEnabled" />}>
              <Route path="recursos" element={<Resources />} />
              <Route path="recursos/office-preview/:requestId" element={<OfficeUploadPreviewPage />} />
              <Route element={<RagPilotRoute />}>
                <Route path="recursos/asistente-sistemas" element={<RagAssistantRedirect />} />
              </Route>
              <Route path="mis-areas" element={<Navigate to="/recursos" replace />} />
            </Route>

            <Route element={<BoardsRoute />}>
              <Route path="tableros" element={<BoardList />} />
              {/* Tablero React de RRHH: el acceso lo controla la API (mismo esquema que los demás tableros). */}
              <Route path="tableros/rrhh" element={<RrhhHorasExtraPage />} />
              {/* Tablero React de Finanzas: el acceso lo controla la API (mismo esquema que los demás tableros). */}
              <Route path="tableros/finanzas" element={<TableroFinanzasPage />} />
              <Route path="tableros/ventas" element={<TableroVentasPage />} />
              <Route path="tableros/combustible" element={<TableroCombustiblePage />} />
              {/* Tablero React de Finanzas – Negocio: datos.json de la carpeta de Drive; acceso por la API. */}
              <Route path="tableros/negocio" element={<NegocioBoard />} />
              {/* Tablero COPS: snapshot vía proxy /api/cops; requiere usuario de workspace. */}
              <Route path="tableros/cops" element={<CopsBoard />} />
            </Route>

            <Route path="tableros/desarrollo-proyectos" element={<DesarrolloProyectosBoard />} />

            <Route element={<CorporateAccountRoute />}>
              <Route path="mis-solicitudes-sistemas" element={<MisSolicitudesSistemas />} />
              <Route path="soporte-ti" element={<SoporteTi />} />
              <Route path="aprobaciones-pendientes" element={<AprobacionesPendientes />} />
              <Route path="sistemas/mesa-ayuda" element={<SistemasMesaAyuda />} />
              <Route path="ayuda" element={<HelpCenter />} />
            </Route>
          </Route>

          <Route path="admin" element={<AdminRoute />}>
            <Route element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="content" element={<AdminContent />} />
              <Route path="directory" element={<AdminDirectory />} />
              <Route path="shifts" element={<AdminShifts />} />
              <Route element={<ModulePermissionRoute permission="view_drive" module="resourcesEnabled" redirectTo="/admin" />}>
                <Route path="resources" element={<AdminResources />} />
                <Route path="drive-lab" element={<AdminDriveLab />} />
              </Route>
              <Route path="users" element={<AdminUsers />} />
              <Route element={<SuperAdminRoute />}>
                <Route path="auditoria" element={<AdminAudit />} />
                <Route path="rag-pilot" element={<RagPilotSistemas />} />
              </Route>
              <Route path="usuarios" element={<Navigate to="/admin/users" replace />} />
            </Route>
          </Route>
          </Route>
        </Route>
      </Routes>
      </Suspense>
      <RagAssistantHost />
    </BrowserRouter>
  )
}
