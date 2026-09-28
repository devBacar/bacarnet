import { capturePosicionCierre } from './services/cuentas.service.js'

const SCHEDULED_ACTOR_UID = 'system:finanzas-cierre-15hs'

export async function runScheduledPosicionCierre(): Promise<void> {
  const cierre = await capturePosicionCierre({
    actorUid: SCHEDULED_ACTOR_UID,
    syncBeforeCapture: true,
  })
  console.info('[finanzas/cuentas] cierre diario guardado', {
    fechaId: cierre.fechaId,
    cerradoAt: cierre.cerradoAt,
    arsCentavos: cierre.totales.arsCentavos,
    usdCentavos: cierre.totales.usdCentavos,
    syncOk: cierre.syncProveedor.ok,
  })
}
