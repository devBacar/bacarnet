import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AdminLayout, PublicLayout, RagAssistantHost } from '../components'
import {
  AdminAudit,
  AdminContent,
  AdminDashboard,
  AdminDirectory,
  AdminDriveLab,
  AdminResources,
  AdminShifts,
  AdminUsers,
  AppsHub,
  BoardList,
  BoardViewerPage,
  DesarrolloProyectosBoard,
  Directory,
  DriveDocumentViewerPage,
  HelpCenter,
  HelpdeskSolicitud,
  Home,
  IntranetHub,
  MisSolicitudesSistemas,
  AprobacionesPendientes,
  AccountPendingPage,
  AccountRejectedPage,
  OfficeUploadPreviewPage,
  RagAssistantRedirect,
  RagPilotSistemas,
  Resources,
  SistemasMesaAyuda,
  SoporteTi,
  FinanzasHoyPage,
  FinanzasCuentasPage,
  FinanzasAgendaPage,
  FinanzasTransferenciasPage,
  FinanzasMovimientosPage,
  FinanzasExtractosPage,
  FinanzasCajasPage,
  FinanzasChequesPage,
  FinanzasVientriPage,
  InversionesPage,
  InversorCuentaPage,
  FinanzasLayout,
  FinanzasIndexRedirect,
  RrhhHorasExtraPage,
  TableroFinanzasPage,
  NegocioBoard,
  CopsBoard,
} from '../pages'
import { WeatherUtilitiesPreview } from '../pages/WeatherUtilitiesPreview'
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

export function AppRoutes() {
  return (
    <BrowserRouter>
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
      <RagAssistantHost />
    </BrowserRouter>
  )
}
