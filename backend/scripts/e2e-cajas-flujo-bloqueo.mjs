/**
 * Flujo E2E Cajas en emulador (sin HTTP auth):
 * crear → fondear → gastar → cerrar → bloqueo → aprobar → desbloqueo
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
 *   ADMIN_SDK_KEY_PATH=...
 *   node backend/scripts/e2e-cajas-flujo-bloqueo.mjs
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080'
process.env.ADMIN_SDK_KEY_PATH ||= resolve(
  ROOT,
  'backend_clean/.secrets/firebase-admin-sa.json',
)

const {
  createCajaForLider,
  fondearCajaChica,
  registerMovimiento,
  cerrarCaja,
  aprobarCierre,
  changeCajaResponsable,
  listCajasForUser,
  renameCaja,
  softDeleteCaja,
} = await import('../lib/modules/finanzas/cajachica/services/caja.service.js')

const lider = {
  uid: 'e2e-cajas-lider',
  email: 'e2e-cajas-lider@bacarsa.com.ar',
  role: 'super_admin',
  permissions: {
    view_finanzas: true,
    manage_finanzas_caja: true,
    super_admin: true,
  },
}

const resp = {
  uid: 'e2e-cajas-resp',
  email: 'e2e-cajas-resp@bacarsa.com.ar',
  role: 'user',
  permissions: {
    view_finanzas: false,
    manage_finanzas_caja: false,
    super_admin: false,
  },
}

const respPrincipal = {
  uid: 'e2e-cajas-resp-principal',
  email: 'e2e-cajas-resp-principal@bacarsa.com.ar',
  role: 'user',
  permissions: {
    view_finanzas: false,
    manage_finanzas_caja: false,
    super_admin: false,
  },
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function main() {
  console.log('1) Obtener/crear principal + crear chica (saldo 0)')
  const existentes = await listCajasForUser(lider)
  let principal = existentes.find((c) => c.tipo === 'principal' && c.moneda === 'ARS')
  if (!principal) {
    principal = await createCajaForLider(lider, {
      nombre: `E2E Principal ${Date.now()}`,
      tipo: 'principal',
      moneda: 'ARS',
      responsableUid: lider.uid,
    })
  }
  assert(principal.estado !== 'inactiva', 'principal activa')

  const chica = await createCajaForLider(lider, {
    nombre: `E2E Chica ${Date.now()}`,
    tipo: 'chica',
    moneda: 'ARS',
    cajaPadreId: principal.id,
    responsableUid: resp.uid,
  })
  assert(chica.saldoActualCentavos === 0, 'chica debe nacer en 0')
  assert(chica.bloqueadaPorCierre === false, 'chica no bloqueada al crear')

  console.log('2) Visibilidad por responsable, edición de nombre y pago desde principal')
  const responsablePrincipalOriginal = principal.responsableUid
  await changeCajaResponsable(lider, principal.id, {
    responsableUid: respPrincipal.uid,
    motivo: 'Prueba E2E de permisos',
  })
  const visiblesPrincipal = await listCajasForUser(respPrincipal)
  assert(visiblesPrincipal.some((c) => c.id === principal.id), 'responsable principal ve su principal')
  assert(visiblesPrincipal.some((c) => c.id === chica.id), 'responsable principal ve todas las cajas')
  const visiblesChica = await listCajasForUser(resp)
  assert(visiblesChica.length === 1 && visiblesChica[0]?.id === chica.id, 'responsable chica solo ve su caja')

  const nombreOriginal = chica.nombre
  const renamed = await renameCaja(lider, chica.id, { nombre: 'E2E Caja renombrada' })
  assert(renamed.nombre === 'E2E Caja renombrada', 'líder puede editar nombre')
  await renameCaja(lider, chica.id, { nombre: nombreOriginal })

  console.log('3) Asegurar saldo en principal, registrar pago y fondear')
  // Recargar principal por si el saldo cambió
  let principales = await listCajasForUser(lider)
  principal = principales.find((c) => c.id === principal.id)
  if ((principal?.saldoActualCentavos ?? 0) < 200_000) {
    await registerMovimiento({
      user: lider,
      cajaId: principal.id,
      body: {
        tipo: 'ingreso',
        concepto: 'Retiro banco E2E',
        montoCentavos: 500_000,
      },
    })
  }
  await registerMovimiento({
    user: respPrincipal,
    cajaId: principal.id,
    body: { tipo: 'egreso', concepto: 'Pago proveedor E2E', montoCentavos: 1_000 },
  })
  await fondearCajaChica(respPrincipal, principal.id, {
    cajaChicaId: chica.id,
    montoCentavos: 200_000,
    concepto: 'Fondeo E2E',
  })

  let chicas = await listCajasForUser(lider)
  let chicaNow = chicas.find((c) => c.id === chica.id)
  assert(chicaNow?.saldoActualCentavos === 200_000, 'saldo chica tras fondeo')

  console.log('4) Gasto en chica OK; ingreso libre debe fallar')
  await registerMovimiento({
    user: resp,
    cajaId: chica.id,
    body: { tipo: 'egreso', concepto: 'Taxi E2E', montoCentavos: 15_000 },
  })
  let ingresoRechazado = false
  try {
    await registerMovimiento({
      user: resp,
      cajaId: chica.id,
      body: { tipo: 'ingreso', concepto: 'Debería fallar', montoCentavos: 1000 },
    })
  } catch (err) {
    ingresoRechazado = String(err.message).includes('ingresos libres')
  }
  assert(ingresoRechazado, 'ingreso libre en chica debe rechazarse')

  console.log('5) Cerrar caja → bloqueada')
  const desde = new Date()
  desde.setDate(1)
  const cierre = await cerrarCaja(resp, chica.id, {
    periodoDesde: desde.toISOString(),
    periodoHasta: new Date().toISOString(),
    efectivoContado: 185_000,
    cerrar: true,
  })
  assert(cierre.estado === 'cerrada', 'cierre en estado cerrada')

  chicas = await listCajasForUser(lider)
  chicaNow = chicas.find((c) => c.id === chica.id)
  assert(chicaNow?.bloqueadaPorCierre === true, 'chica bloqueada tras cerrar')

  let movBloqueado = false
  try {
    await registerMovimiento({
      user: resp,
      cajaId: chica.id,
      body: { tipo: 'egreso', concepto: 'Tras cierre', montoCentavos: 100 },
    })
  } catch (err) {
    movBloqueado = String(err.message).includes('esperando aprobación')
  }
  assert(movBloqueado, 'movimientos deben rechazarse con cierre pendiente')

  console.log('6) Aprobar → desbloquea')
  await aprobarCierre(lider, chica.id, cierre.id)
  chicas = await listCajasForUser(lider)
  chicaNow = chicas.find((c) => c.id === chica.id)
  assert(chicaNow?.bloqueadaPorCierre === false, 'chica desbloqueada tras aprobar')

  await registerMovimiento({
    user: resp,
    cajaId: chica.id,
    body: { tipo: 'egreso', concepto: 'Tras desbloqueo', montoCentavos: 500 },
  })

  console.log('7) Soft-delete: vaciar y dar de baja')
  chicas = await listCajasForUser(lider)
  chicaNow = chicas.find((c) => c.id === chica.id)
  const resto = chicaNow.saldoActualCentavos
  if (resto > 0) {
    await registerMovimiento({
      user: resp,
      cajaId: chica.id,
      body: { tipo: 'egreso', concepto: 'Vaciar para baja', montoCentavos: resto },
    })
  }
  const deleted = await softDeleteCaja(lider, chica.id)
  assert(deleted.estado === 'inactiva', 'caja inactiva')
  chicas = await listCajasForUser(lider)
  assert(!chicas.some((c) => c.id === chica.id), 'inactiva no aparece en listado')

  let deletePrincipalFail = false
  try {
    await softDeleteCaja(lider, principal.id)
  } catch (err) {
    deletePrincipalFail = String(err.message).includes('principales')
  }
  assert(deletePrincipalFail, 'no se pueden eliminar principales')

  await changeCajaResponsable(lider, principal.id, {
    responsableUid: responsablePrincipalOriginal,
    motivo: 'Restaurar responsable tras E2E',
  })

  console.log('E2E OK')
}

main().catch((err) => {
  console.error('E2E FAIL', err)
  process.exit(1)
})
