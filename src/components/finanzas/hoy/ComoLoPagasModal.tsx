import { useQuery } from '@tanstack/react-query'
import { Banknote, FileText, Landmark, Plus, Trash2, Wallet, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { fetchFinanzasCuentas } from '../../../services/finanzasApi'
import { fetchCajas } from '../../../services/finanzasCajasApi'
import { fetchCarteraHoy, type ChequeCarteraHoy, type PagoHoy, type PartePagoCombinado } from '../../../services/finanzasHoyApi'
import { type PrecargaTransferenciaHoy } from '../NuevaTransferenciaModal'
import { formatMoneyCentavos } from '../formatMoney'
import { finanzasInputClass } from '../FinanzasFormField'
import { parseMontoEsArACentavos } from '../montoEsAr'
import { textoDiferenciaCheque } from './pagoConCheque'

const botonPrimario =
  'rounded-xl bg-brand-primary px-4 py-2 text-[15px] font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60'
const botonTexto =
  'rounded-xl px-4 py-2 text-[15px] font-medium text-neutral-700 transition hover:bg-neutral-100 dark:text-gray-200 dark:hover:bg-zinc-800'

type MedioParte = 'efectivo' | 'cheque_cartera' | 'cheque_propio' | 'transferencia'

interface ParteUi {
  clave: string
  medio: MedioParte
  montoTexto: string
  cajaId: string
  comprobante: File | null
  chequeId: string
  tipoCheque: 'echeq' | 'fisico'
  numero: string
  cuentaId: string
  fechaPago: string
}

const MEDIOS: Array<{ id: MedioParte; texto: string }> = [
  { id: 'cheque_cartera', texto: 'Cheque de la cartera' },
  { id: 'cheque_propio', texto: 'Cheque propio' },
  { id: 'transferencia', texto: 'Transferencia' },
  { id: 'efectivo', texto: 'Efectivo' },
]

function centavosATexto(centavos: number): string {
  return (centavos / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function hoyLocal(): string {
  const fecha = new Date()
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  return `${fecha.getFullYear()}-${mes}-${dia}`
}

function fechaCorta(ymd: string): string {
  const [anio, mes, dia] = ymd.split('-')
  if (!anio || !mes || !dia) return ymd
  return `${Number(dia)}/${Number(mes)}/${anio}`
}

function nuevaParte(medio: MedioParte, montoTexto: string): ParteUi {
  return {
    clave: crypto.randomUUID(),
    medio,
    montoTexto,
    cajaId: '',
    comprobante: null,
    chequeId: '',
    tipoCheque: 'echeq',
    numero: '',
    cuentaId: '',
    fechaPago: hoyLocal(),
  }
}

function Opcion({
  icono: Icono,
  titulo,
  explicacion,
  onClick,
}: {
  icono: LucideIcon
  titulo: string
  explicacion: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 px-3 py-2.5 text-left transition hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700 dark:bg-zinc-800 dark:text-gray-200">
        <Icono className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="text-heading block text-[15px] font-medium leading-tight">{titulo}</span>
        <span className="text-body-muted block text-[13px] leading-snug">{explicacion}</span>
      </span>
    </button>
  )
}

export function ComoLoPagasModal({
  pago,
  guardando,
  onClose,
  onConfirmar,
}: {
  pago: PagoHoy
  guardando: boolean
  onClose: () => void
  onConfirmar: (resultado: {
    partes: PartePagoCombinado[]
    comprobantes: Array<{ indice: number; archivo: File }>
    transferencia: PrecargaTransferenciaHoy | null
  }) => void
}) {
  const moneda = pago.moneda ?? 'ARS'
  const falta = pago.montoCentavos
  const [paso, setPaso] = useState<'elegir' | 'armar'>('elegir')
  const [partes, setPartes] = useState<ParteUi[]>([])

  const pideCartera = partes.some((parte) => parte.medio === 'cheque_cartera')
  const pideCajas = partes.some((parte) => parte.medio === 'efectivo')
  const pideCuentas = partes.some((parte) => parte.medio === 'cheque_propio')
  const cartera = useQuery({
    queryKey: ['finanzas', 'hoy', 'cartera', falta],
    queryFn: () => fetchCarteraHoy(falta),
    enabled: pideCartera,
  })
  const cajasQuery = useQuery({
    queryKey: ['finanzas', 'cajas'],
    queryFn: fetchCajas,
    enabled: pideCajas,
  })
  const cuentasQuery = useQuery({
    queryKey: ['finanzas', 'cuentas'],
    queryFn: fetchFinanzasCuentas,
    enabled: pideCuentas,
  })
  const cajas = (cajasQuery.data ?? []).filter((caja) => caja.moneda === 'ARS' && caja.estado !== 'inactiva')
  const cuentas = (cuentasQuery.data?.cuentas ?? []).filter((cuenta) => cuenta.tipo === 'CC' && cuenta.moneda === 'ARS')

  function elegir(medio: MedioParte) {
    setPartes([nuevaParte(medio, centavosATexto(falta))])
    setPaso('armar')
  }

  function actualizar(clave: string, parche: Partial<ParteUi>) {
    setPartes((actual) => actual.map((parte) => (parte.clave === clave ? { ...parte, ...parche } : parte)))
  }

  let queda = falta
  let cuenta = 0
  let excede = false
  const avisos: string[] = []
  for (const parte of partes) {
    if (parte.medio === 'cheque_cartera') {
      const cheque = cartera.data?.find((item) => item.id === parte.chequeId)
      const monto = cheque?.montoCentavos ?? 0
      const libre = Math.max(queda, 0)
      if (cheque && libre <= 0) excede = true
      if (cheque && monto > libre && libre > 0) avisos.push(textoDiferenciaCheque(monto, libre) ?? '')
      const aplica = Math.min(monto, libre)
      cuenta += aplica
      queda -= aplica
      continue
    }
    const monto = parseMontoEsArACentavos(parte.montoTexto) ?? 0
    if (monto > Math.max(queda, 0)) excede = true
    cuenta += Math.min(monto, Math.max(queda, 0))
    queda -= monto
  }
  const faltaAsignar = Math.max(0, falta - cuenta)
  const transferencias = partes.filter((parte) => parte.medio === 'transferencia')

  function parteLista(parte: ParteUi): string | null {
    if (parte.medio === 'cheque_cartera') return parte.chequeId ? null : 'Elegí el cheque'
    if (parte.medio === 'transferencia') {
      const monto = parseMontoEsArACentavos(parte.montoTexto)
      return monto == null ? 'Indicá el monto' : null
    }
    if (parte.medio === 'efectivo') {
      const monto = parseMontoEsArACentavos(parte.montoTexto)
      if (monto == null) return 'Indicá el monto'
      if (!parte.cajaId) return 'Elegí la caja'
      const caja = cajas.find((item) => item.id === parte.cajaId)
      const usado = partes
        .filter((item) => item.medio === 'efectivo' && item.cajaId === parte.cajaId)
        .reduce((suma, item) => suma + (parseMontoEsArACentavos(item.montoTexto) ?? 0), 0)
      if (!caja || caja.bloqueadaPorCierre) return 'Esa caja no se puede usar'
      if (caja.saldoActualCentavos < usado) return 'En esa caja no alcanza'
      return null
    }
    const monto = parseMontoEsArACentavos(parte.montoTexto)
    if (monto == null) return 'Indicá el monto'
    if (!parte.numero.trim()) return 'Falta el número'
    if (!parte.cuentaId) return 'Elegí el banco'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parte.fechaPago)) return 'Elegí la fecha'
    return null
  }

  const errores = partes.map(parteLista)
  const puedeConfirmar =
    partes.length > 0 && errores.every((error) => error == null) && !excede && cuenta > 0 && transferencias.length <= 1 && !guardando

  function confirmar() {
    if (!puedeConfirmar) return
    const partesApi: PartePagoCombinado[] = []
    const comprobantes: Array<{ indice: number; archivo: File }> = []
    let transferencia: PrecargaTransferenciaHoy | null = null
    for (const parte of partes) {
      if (parte.medio === 'transferencia') {
        const montoCentavos = parseMontoEsArACentavos(parte.montoTexto) ?? 0
        transferencia = {
          compromisoPagoId: pago.id,
          montoCentavos,
          concepto: pago.concepto,
          destinatarioNombre: pago.proveedorONombre,
          destinatarioCuit: null,
        }
        continue
      }
      if (parte.medio === 'cheque_cartera') {
        partesApi.push({ medio: 'cheque_cartera', chequeId: parte.chequeId })
        continue
      }
      if (parte.medio === 'efectivo') {
        const indice = partesApi.length
        partesApi.push({
          medio: 'efectivo',
          cajaId: parte.cajaId,
          montoCentavos: parseMontoEsArACentavos(parte.montoTexto) ?? 0,
        })
        if (parte.comprobante) comprobantes.push({ indice, archivo: parte.comprobante })
        continue
      }
      const cuenta = cuentas.find((item) => item.id === parte.cuentaId)
      partesApi.push({
        medio: 'cheque_propio',
        montoCentavos: parseMontoEsArACentavos(parte.montoTexto) ?? 0,
        cheque: {
          tipo: parte.tipoCheque,
          numero: parte.numero.trim(),
          banco: cuenta ? `${cuenta.bancoNombre} ${cuenta.tipoLabel}` : '',
          fechaPago: parte.fechaPago,
        },
      })
    }
    onConfirmar({ partes: partesApi, comprobantes, transferencia })
  }

  const encabezado = (
    <p className="text-[15px]">
      <span className="text-body-muted">
        {pago.aQuien} · {pago.concepto}
      </span>
      <span className="text-heading mt-0.5 block text-[17px] font-semibold tabular-nums">
        Falta pagar {formatMoneyCentavos(falta, moneda)}
      </span>
    </p>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="como-lo-pagas-titulo"
        className="surface-card flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-neutral-200 shadow-xl dark:border-zinc-700"
      >
        <div className="overflow-y-auto p-5 sm:p-6">
          <h2 id="como-lo-pagas-titulo" className="text-heading text-xl font-semibold">
            ¿Cómo lo pagás?
          </h2>
          <div className="mt-3">{encabezado}</div>
          {paso === 'elegir' ? (
            <div className="mt-4 grid gap-2">
              <Opcion icono={Landmark} titulo="Por transferencia" explicacion="Se arma y queda esperando la firma." onClick={() => elegir('transferencia')} />
              <Opcion icono={Banknote} titulo="En efectivo" explicacion="Sale de una caja. Podés adjuntar el ticket." onClick={() => elegir('efectivo')} />
              <Opcion icono={FileText} titulo="Con cheque" explicacion="Endosás uno de la cartera o cargás uno propio." onClick={() => elegir('cheque_cartera')} />
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {partes.map((parte, indice) => (
                <ParteEditor
                  key={parte.clave}
                  parte={parte}
                  numero={indice + 1}
                  error={errores[indice] ?? null}
                  cajas={cajas}
                  cuentas={cuentas}
                  cheques={cartera.data ?? []}
                  cargandoCheques={cartera.isLoading}
                  onChange={(parche) => actualizar(parte.clave, parche)}
                  onQuitar={() => {
                    const siguientes = partes.filter((item) => item.clave !== parte.clave)
                    setPartes(siguientes)
                    if (siguientes.length === 0) setPaso('elegir')
                  }}
                />
              ))}
              {avisos.filter(Boolean).map((aviso) => (
                <p key={aviso} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                  {aviso}
                </p>
              ))}
              <button
                type="button"
                className="inline-flex items-center gap-1 self-start rounded-lg px-1 py-1 text-[13px] font-medium text-brand-primary"
                onClick={() => setPartes((actual) => [...actual, nuevaParte('efectivo', '')])}
              >
                <Plus className="h-4 w-4" aria-hidden />
                Agregar otra forma
              </button>
              {transferencias.length > 1 ? (
                <p className="text-[13px] text-red-700 dark:text-red-300">Armá una transferencia por vez. Dejá una sola.</p>
              ) : null}
              <div className="rounded-xl bg-neutral-50 px-3 py-2 text-[13px] dark:bg-zinc-800/60">
                <p className="flex justify-between gap-2">
                  <span className="text-body-muted">Total asignado</span>
                  <span className="text-heading font-medium tabular-nums">{formatMoneyCentavos(Math.max(cuenta, 0), moneda)}</span>
                </p>
                <p className="mt-1 flex justify-between gap-2">
                  <span className="text-body-muted">Falta asignar</span>
                  <span className={`font-medium tabular-nums ${faltaAsignar === 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-heading'}`}>
                    {formatMoneyCentavos(faltaAsignar, moneda)}
                  </span>
                </p>
                {excede ? <p className="mt-1 text-red-700 dark:text-red-300">No podés asignar más de lo que falta.</p> : null}
                <p className="text-body-muted mt-2">Si asignás menos, queda pagado en parte y el resto sigue en la Agenda.</p>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-neutral-100 px-5 py-3 dark:border-zinc-800 sm:px-6">
          <button type="button" className={botonTexto} onClick={paso === 'armar' ? () => { setPartes([]); setPaso('elegir') } : onClose}>
            {paso === 'armar' ? 'Volver' : 'Cancelar'}
          </button>
          {paso === 'armar' ? (
            <button type="button" className={botonPrimario} disabled={!puedeConfirmar} onClick={confirmar}>
              {guardando ? 'Guardando…' : 'Confirmar pago'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Campo({ children }: { children: ReactNode }) {
  return <label className="mt-2 block text-[13px] font-medium text-neutral-800 dark:text-gray-200">{children}</label>
}

function ParteEditor({
  parte,
  numero,
  error,
  cajas,
  cuentas,
  cheques,
  cargandoCheques,
  onChange,
  onQuitar,
}: {
  parte: ParteUi
  numero: number
  error: string | null
  cajas: Array<{ id: string; nombre: string; saldoActualCentavos: number; bloqueadaPorCierre?: boolean }>
  cuentas: Array<{ id: string; bancoNombre: string; tipoLabel: string }>
  cheques: ChequeCarteraHoy[]
  cargandoCheques: boolean
  onChange: (parche: Partial<ParteUi>) => void
  onQuitar: () => void
}) {
  const montoBloqueado = parte.medio === 'cheque_cartera'
  const cheque = cheques.find((item) => item.id === parte.chequeId)
  return (
    <div className="rounded-xl border border-neutral-200 p-3 dark:border-zinc-700">
      <div className="flex items-center justify-between gap-2">
        <p className="text-heading text-[13px] font-medium">Forma {numero}</p>
        <button type="button" className="text-body-muted inline-flex items-center gap-1 text-[13px]" onClick={onQuitar}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Quitar
        </button>
      </div>
      <Campo>
        Cómo
        <select
          className={`${finanzasInputClass} mt-1`}
          value={parte.medio}
          onChange={(event) => onChange({ medio: event.target.value as MedioParte })}
        >
          {MEDIOS.map((medio) => (
            <option key={medio.id} value={medio.id}>
              {medio.texto}
            </option>
          ))}
        </select>
      </Campo>
      {parte.medio === 'cheque_cartera' ? (
        <Campo>
          Cheque
          {cargandoCheques ? <p className="text-body-muted mt-1 font-normal">Buscando cheques…</p> : null}
          {!cargandoCheques && cheques.length === 0 ? <p className="text-body-muted mt-1 font-normal">No hay cheques en la cartera.</p> : null}
          <select
            className={`${finanzasInputClass} mt-1`}
            value={parte.chequeId}
            onChange={(event) => onChange({ chequeId: event.target.value })}
          >
            <option value="">Elegí uno</option>
            {cheques.map((item) => (
              <option key={item.id} value={item.id}>
                N.º {item.numero} · {formatMoneyCentavos(item.montoCentavos, 'ARS')} · {item.banco} · {fechaCorta(item.fechaPago)}
              </option>
            ))}
          </select>
          {cheque ? <p className="text-body-muted mt-1 font-normal">{cheque.emisor}</p> : null}
        </Campo>
      ) : null}
      {parte.medio === 'cheque_propio' ? (
        <>
          <Campo>
            Tipo
            <select
              className={`${finanzasInputClass} mt-1`}
              value={parte.tipoCheque}
              onChange={(event) => onChange({ tipoCheque: event.target.value === 'fisico' ? 'fisico' : 'echeq' })}
            >
              <option value="echeq">Electrónico</option>
              <option value="fisico">De papel</option>
            </select>
          </Campo>
          <Campo>
            Número
            <input className={`${finanzasInputClass} mt-1`} value={parte.numero} onChange={(event) => onChange({ numero: event.target.value })} />
          </Campo>
          <Campo>
            Banco o cuenta de donde sale
            <select className={`${finanzasInputClass} mt-1`} value={parte.cuentaId} onChange={(event) => onChange({ cuentaId: event.target.value })}>
              <option value="">Elegí una</option>
              {cuentas.map((cuenta) => (
                <option key={cuenta.id} value={cuenta.id}>
                  {cuenta.bancoNombre} {cuenta.tipoLabel}
                </option>
              ))}
            </select>
          </Campo>
          <Campo>
            Fecha de pago
            <input type="date" className={`${finanzasInputClass} mt-1`} value={parte.fechaPago} onChange={(event) => onChange({ fechaPago: event.target.value })} />
          </Campo>
        </>
      ) : null}
      {parte.medio === 'efectivo' ? (
        <>
          <Campo>
            Caja
            <div className="mt-1 grid gap-1">
              {cajas.length === 0 ? <p className="text-body-muted font-normal">No hay cajas en pesos.</p> : null}
              {cajas.map((caja) => {
                const monto = parseMontoEsArACentavos(parte.montoTexto) ?? 0
                const corta = monto > 0 && caja.saldoActualCentavos < monto
                return (
                  <button
                    key={caja.id}
                    type="button"
                    disabled={caja.bloqueadaPorCierre === true || corta}
                    onClick={() => onChange({ cajaId: caja.id })}
                    className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[13px] font-normal disabled:opacity-50 ${
                      parte.cajaId === caja.id ? 'border-brand-primary' : 'border-neutral-200 dark:border-zinc-700'
                    }`}
                  >
                    <Wallet className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="min-w-0">
                      <span className="block">{caja.nombre}</span>
                      <span className="text-body-muted block">
                        Disponible {formatMoneyCentavos(caja.saldoActualCentavos, 'ARS')}
                        {corta ? ' · No alcanza' : ''}
                        {caja.bloqueadaPorCierre ? ' · Cerrada' : ''}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </Campo>
          <Campo>
            Comprobante (opcional)
            <input
              type="file"
              accept="image/*,.pdf"
              className="mt-1 block w-full font-normal"
              onChange={(event) => onChange({ comprobante: event.target.files?.[0] ?? null })}
            />
          </Campo>
        </>
      ) : null}
      <Campo>
        Monto
        <input
          inputMode="decimal"
          disabled={montoBloqueado}
          placeholder="0,00"
          className={`${finanzasInputClass} mt-1`}
          value={montoBloqueado ? (cheque ? centavosATexto(cheque.montoCentavos) : '') : parte.montoTexto}
          onChange={(event) => onChange({ montoTexto: event.target.value })}
        />
      </Campo>
      {error ? <p className="mt-2 text-[13px] text-red-700 dark:text-red-300">{error}</p> : null}
    </div>
  )
}
