import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { fetchFinanzasCuentas } from '../../../services/finanzasApi'
import { fetchCajas } from '../../../services/finanzasCajasApi'
import {
  fetchCarteraHoy,
  type ChequeCarteraHoy,
  type IngresoHoy,
  type MedioPagoHoy,
  type PagoHoy,
  type SugerenciaBanco,
} from '../../../services/finanzasHoyApi'
import { formatMoneyCentavos } from '../formatMoney'
import { finanzasInputClass } from '../FinanzasFormField'
import { TEXTO_CHEQUE_PROPIO, textoDiferenciaCheque, type PagoConCheque } from './pagoConCheque'

function Ventana({
  titulo,
  onClose,
  children,
}: {
  titulo: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hoy-dialogo-titulo"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900 sm:p-6"
      >
        <h2 id="hoy-dialogo-titulo" className="text-heading text-xl font-semibold">
          {titulo}
        </h2>
        <div className="mt-4">{children}</div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 min-h-12 w-full rounded-xl border border-neutral-300 text-sm font-medium dark:border-zinc-600"
        >
          Volver
        </button>
      </div>
    </div>
  )
}

const botonGrande =
  'min-h-14 w-full rounded-xl bg-brand-primary px-4 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50'
const botonSecundario =
  'min-h-14 w-full rounded-xl border border-neutral-300 px-4 text-base font-semibold dark:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-50'

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

export function ComoLoPagasModal({
  pago,
  guardando,
  onClose,
  onBanco,
  onEfectivo,
  onCheque,
}: {
  pago: PagoHoy
  guardando: boolean
  onClose: () => void
  onBanco: () => void
  onEfectivo: () => void
  onCheque: (chequeId: string) => void
}) {
  const [paso, setPaso] = useState<'elegir' | 'cheque'>('elegir')
  const [elegido, setElegido] = useState<PagoConCheque | null>(null)
  const cartera = useQuery({
    queryKey: ['finanzas', 'hoy', 'cartera', pago.montoCentavos],
    queryFn: () => fetchCarteraHoy(pago.montoCentavos),
    enabled: paso === 'cheque',
  })
  const chequeElegido = cartera.data?.find((cheque) => cheque.id === elegido?.chequeId) ?? null
  const diferencia = chequeElegido ? textoDiferenciaCheque(chequeElegido.montoCentavos, pago.montoCentavos) : null

  if (paso === 'cheque') {
    return (
      <Ventana titulo="Pagar con cheque" onClose={() => setPaso('elegir')}>
        <p className="text-body-muted text-sm">
          {pago.aQuien} · {pago.concepto}
        </p>
        <p className="text-heading mt-2 text-2xl font-semibold tabular-nums">
          {formatMoneyCentavos(pago.montoCentavos, 'ARS')}
        </p>

        <h3 className="mt-5 text-lg font-semibold">Con un cheque de la cartera</h3>
        {cartera.isLoading ? <p className="mt-2 text-base">Estoy mirando los cheques de la cartera…</p> : null}
        {cartera.isError ? (
          <p className="mt-2 text-base text-red-700 dark:text-red-300">
            {cartera.error instanceof Error ? cartera.error.message : 'No pude mirar la cartera.'}
          </p>
        ) : null}
        {!cartera.isLoading && cartera.data && cartera.data.length === 0 ? (
          <p className="mt-2 text-base">No hay cheques en la cartera para usar.</p>
        ) : null}
        <div className="mt-2 grid gap-2">
          {(cartera.data ?? []).map((cheque) => (
            <ChequeCartera
              key={cheque.id}
              cheque={cheque}
              activo={elegido?.chequeId === cheque.id}
              onElegir={() =>
                setElegido({
                  modo: 'cartera',
                  chequeId: cheque.id,
                  numero: cheque.numero,
                  banco: cheque.banco,
                  fechaPago: cheque.fechaPago,
                  destinatario: pago.proveedorONombre,
                })
              }
            />
          ))}
        </div>
        {elegido?.modo === 'cartera' && chequeElegido ? (
          <p className="mt-3 text-base">
            Elegiste el cheque N.º {elegido.numero} de {chequeElegido.emisor}.
          </p>
        ) : null}
        {diferencia ? (
          <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-base font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            {diferencia}
          </p>
        ) : null}
        <button
          type="button"
          className={`${botonGrande} mt-3`}
          disabled={guardando || elegido?.modo !== 'cartera' || !elegido.chequeId}
          onClick={() => {
            if (elegido?.modo === 'cartera' && elegido.chequeId) onCheque(elegido.chequeId)
          }}
        >
          {guardando ? 'Endosando…' : diferencia ? 'Confirmar el endoso' : 'Endosar este cheque'}
        </button>

        <h3 className="mt-6 text-lg font-semibold">Con un cheque propio</h3>
        <p className="mt-2 text-base">{TEXTO_CHEQUE_PROPIO}</p>
        <Link to="/finanzas/cheques" className={`${botonGrande} mt-3 inline-flex items-center justify-center`}>
          Cargalo en Cheques
        </Link>
      </Ventana>
    )
  }

  return (
    <Ventana titulo="¿Cómo lo pagás?" onClose={onClose}>
      <p className="text-body-muted text-sm">
        {pago.aQuien} · {pago.concepto}
      </p>
      <p className="text-heading mt-2 text-2xl font-semibold tabular-nums">
        {formatMoneyCentavos(pago.montoCentavos, 'ARS')}
      </p>
      <div className="mt-4 grid gap-3">
        <button type="button" className={botonGrande} onClick={onBanco}>
          Por banco
        </button>
        <button type="button" className={botonGrande} onClick={onEfectivo}>
          En efectivo
        </button>
        <button type="button" className={botonGrande} onClick={() => setPaso('cheque')}>
          Con cheque
        </button>
      </div>
    </Ventana>
  )
}

function ChequeCartera({
  cheque,
  activo,
  onElegir,
}: {
  cheque: ChequeCarteraHoy
  activo: boolean
  onElegir: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onElegir}
      className={`min-h-14 rounded-xl border px-3 py-2 text-left ${
        activo ? 'border-brand-primary bg-brand-primary/10' : 'border-neutral-200 dark:border-zinc-700'
      }`}
    >
      <span className="block text-base font-semibold">
        N.º {cheque.numero} · {formatMoneyCentavos(cheque.montoCentavos, 'ARS')}
      </span>
      <span className="text-body-muted block text-sm">
        {cheque.emisor} · {cheque.banco} · se paga el {fechaCorta(cheque.fechaPago)}
      </span>
    </button>
  )
}

export function EfectivoModal({
  titulo,
  detalle,
  montoCentavos,
  esIngreso,
  guardando,
  onClose,
  onConfirmar,
}: {
  titulo: string
  detalle: string
  montoCentavos: number
  esIngreso: boolean
  guardando: boolean
  onClose: () => void
  onConfirmar: (cajaId: string, comprobante: File | null) => void
}) {
  const { data: cajas = [], isLoading } = useQuery({
    queryKey: ['finanzas', 'cajas'],
    queryFn: fetchCajas,
  })
  const [cajaId, setCajaId] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  // Un cobro en efectivo va a la caja principal: la caja chica solo recibe fondeo desde la principal.
  const enPesos = cajas.filter(
    (caja) => caja.moneda === 'ARS' && caja.estado !== 'inactiva' && (!esIngreso || caja.tipo !== 'chica'),
  )
  const elegida = enPesos.find((caja) => caja.id === cajaId) ?? null
  const noAlcanza = !esIngreso && elegida != null && elegida.saldoActualCentavos < montoCentavos

  return (
    <Ventana titulo={titulo} onClose={onClose}>
      <p className="text-body-muted text-sm">{detalle}</p>
      <p className="text-heading mt-2 text-2xl font-semibold tabular-nums">
        {formatMoneyCentavos(montoCentavos, 'ARS')}
      </p>
      {isLoading ? <p className="mt-4 text-sm">Estoy mirando las cajas…</p> : null}
      {!isLoading && enPesos.length === 0 ? (
        <p className="mt-4 text-sm">No hay cajas en pesos para anotar esto.</p>
      ) : null}
      <div className="mt-4 grid gap-2">
        {enPesos.map((caja) => {
          const corta = !esIngreso && caja.saldoActualCentavos < montoCentavos
          const activa = caja.id === cajaId
          return (
            <button
              key={caja.id}
              type="button"
              disabled={caja.bloqueadaPorCierre === true || corta}
              onClick={() => setCajaId(caja.id)}
              className={`min-h-14 rounded-xl border px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-60 ${
                activa
                  ? 'border-brand-primary bg-brand-primary/10'
                  : 'border-neutral-200 dark:border-zinc-700'
              }`}
            >
              <span className="block font-semibold">{caja.nombre}</span>
              <span className="text-body-muted block text-sm">
                Efectivo disponible {formatMoneyCentavos(caja.saldoActualCentavos, 'ARS')}
                {corta ? ' · No alcanza' : ''}
                {caja.bloqueadaPorCierre ? ' · Cerrada, esperando aprobación' : ''}
              </span>
            </button>
          )
        })}
      </div>
      {noAlcanza ? (
        <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">
          En esa caja no alcanza para este pago.
        </p>
      ) : null}
      <label className="mt-4 block text-sm font-medium">
        Si tenés el ticket, adjuntalo
        <input
          type="file"
          accept="image/*,.pdf"
          className="mt-1 block w-full text-sm"
          onChange={(event) => setArchivo(event.target.files?.[0] ?? null)}
        />
      </label>
      <p className="text-body-muted mt-2 text-sm">
        Si no lo adjuntás, queda sin comprobante, igual que cuando lo cargás en Cajas.
        {esIngreso ? ' El cobro en efectivo se puede anotar en la caja chica o en la principal.' : ''}
      </p>
      <button
        type="button"
        className={`${botonGrande} mt-4`}
        disabled={!elegida || noAlcanza || guardando}
        onClick={() => {
          if (elegida) onConfirmar(elegida.id, archivo)
        }}
      >
        {guardando ? 'Anotando…' : 'Confirmar'}
      </button>
    </Ventana>
  )
}

export function YaLoPagueModal({
  pago,
  guardando,
  onClose,
  onConfirmar,
}: {
  pago: PagoHoy
  guardando: boolean
  onClose: () => void
  onConfirmar: (body: {
    medioPago: MedioPagoHoy
    fechaPago: string
    cuentaId?: string
    movimientoId?: string
  }) => void
}) {
  const [medio, setMedio] = useState<MedioPagoHoy>(pago.medioPago)
  const [fecha, setFecha] = useState(hoyLocal)
  const [movimientoId, setMovimientoId] = useState<string | null>(
    pago.sugerenciasBanco.length === 1 ? pago.sugerenciasBanco[0]!.id : null,
  )
  const [sinMovimiento, setSinMovimiento] = useState(pago.sugerenciasBanco.length === 0)
  const [cuentaId, setCuentaId] = useState('')
  const { data: cuentasData } = useQuery({
    queryKey: ['finanzas', 'cuentas'],
    queryFn: fetchFinanzasCuentas,
    enabled: medio === 'transferencia',
  })
  const bancos = (cuentasData?.cuentas ?? []).filter((cuenta) => cuenta.tipo === 'CC' && cuenta.moneda === 'ARS')
  const sugerencia = pago.sugerenciasBanco.find((item) => item.id === movimientoId) ?? null

  return (
    <Ventana titulo="Ya lo pagué" onClose={onClose}>
      <p className="text-body-muted text-sm">
        {pago.aQuien} · {formatMoneyCentavos(pago.montoCentavos, 'ARS')}
      </p>
      <div className="mt-4 grid gap-2">
        {(
          [
            ['transferencia', 'Por banco'],
            ['efectivo', 'En efectivo'],
            ['cheque', 'Con cheque'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={medio === id}
            className={medio === id ? botonGrande : botonSecundario}
            onClick={() => setMedio(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="mt-4 block text-sm font-medium">
        ¿Qué día lo pagaste?
        <input
          type="date"
          className={`${finanzasInputClass} mt-1`}
          value={fecha}
          onChange={(event) => setFecha(event.target.value)}
        />
      </label>
      {medio === 'transferencia' ? (
        <div className="mt-4">
          <p className="text-sm font-medium">Si salió del banco, ¿es alguno de estos?</p>
          {pago.sugerenciasBanco.length === 0 ? (
            <p className="text-body-muted mt-2 text-sm">
              No encontré un débito del mismo monto en los últimos 5 días.
            </p>
          ) : (
            <div className="mt-2 grid gap-2">
              {pago.sugerenciasBanco.map((item) => (
                <Sugerencia
                  key={item.id}
                  item={item}
                  activa={!sinMovimiento && movimientoId === item.id}
                  onElegir={() => {
                    setSinMovimiento(false)
                    setMovimientoId(item.id)
                  }}
                />
              ))}
              <button
                type="button"
                className={sinMovimiento ? botonGrande : botonSecundario}
                onClick={() => {
                  setMovimientoId(null)
                  setSinMovimiento(true)
                }}
              >
                Ninguno de estos
              </button>
            </div>
          )}
          {sinMovimiento ? (
            <label className="mt-3 block text-sm font-medium">
              ¿De qué banco salió?
              <select
                className={`${finanzasInputClass} mt-1`}
                value={cuentaId}
                onChange={(event) => setCuentaId(event.target.value)}
              >
                <option value="">Elegí el banco</option>
                {bancos.map((cuenta) => (
                  <option key={cuenta.id} value={cuenta.id}>
                    {cuenta.bancoNombre}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        className={`${botonGrande} mt-4`}
        disabled={
          guardando ||
          !fecha ||
          (medio === 'transferencia' && !sugerencia && (!sinMovimiento || !cuentaId))
        }
        onClick={() =>
          onConfirmar({
            medioPago: medio,
            fechaPago: fecha,
            ...(medio === 'transferencia'
              ? {
                  cuentaId: sugerencia?.cuentaId ?? (cuentaId || undefined),
                  movimientoId: sugerencia?.id,
                }
              : {}),
          })
        }
      >
        {guardando ? 'Guardando…' : 'Marcar como pagado'}
      </button>
    </Ventana>
  )
}

function Sugerencia({
  item,
  activa,
  onElegir,
}: {
  item: SugerenciaBanco
  activa: boolean
  onElegir: () => void
}) {
  return (
    <button
      type="button"
      onClick={onElegir}
      className={`min-h-14 rounded-xl border px-3 py-2 text-left ${
        activa ? 'border-brand-primary bg-brand-primary/10' : 'border-neutral-200 dark:border-zinc-700'
      }`}
    >
      <span className="block font-semibold">
        {item.bancoNombre} · {formatMoneyCentavos(item.montoCentavos, 'ARS')}
      </span>
      <span className="text-body-muted block text-sm">
        {item.fecha}
        {item.descripcion ? ` · ${item.descripcion}` : ''}
      </span>
    </button>
  )
}

export function ReprogramarModal({
  titulo,
  detalle,
  guardando,
  onClose,
  onConfirmar,
}: {
  titulo: string
  detalle: string
  guardando: boolean
  onClose: () => void
  onConfirmar: (fecha: string) => void
}) {
  const [fecha, setFecha] = useState(hoyLocal)
  return (
    <Ventana titulo={titulo} onClose={onClose}>
      <p className="text-body-muted text-sm">{detalle}</p>
      <label className="mt-4 block text-sm font-medium">
        ¿Para qué día lo pasamos?
        <input
          type="date"
          className={`${finanzasInputClass} mt-1`}
          value={fecha}
          onChange={(event) => setFecha(event.target.value)}
        />
      </label>
      <button
        type="button"
        className={`${botonGrande} mt-4`}
        disabled={guardando || !fecha}
        onClick={() => onConfirmar(fecha)}
      >
        {guardando ? 'Guardando…' : 'Pasarlo para ese día'}
      </button>
    </Ventana>
  )
}

export function ReclamarModal({
  ingreso,
  onClose,
}: {
  ingreso: Pick<IngresoHoy, 'cliente' | 'textoReclamo' | 'email' | 'concepto'>
  onClose: () => void
}) {
  const [copiado, setCopiado] = useState(false)
  const mailto = ingreso.email
    ? `mailto:${ingreso.email}?subject=${encodeURIComponent(`Pago de ${ingreso.concepto}`)}&body=${encodeURIComponent(ingreso.textoReclamo)}`
    : null

  return (
    <Ventana titulo={`Reclamar a ${ingreso.cliente}`} onClose={onClose}>
      <textarea
        readOnly
        className={`${finanzasInputClass} min-h-40`}
        value={ingreso.textoReclamo}
      />
      <div className="mt-3 grid gap-2">
        <button
          type="button"
          className={botonGrande}
          onClick={() => {
            void navigator.clipboard.writeText(ingreso.textoReclamo).then(
              () => setCopiado(true),
              () => setCopiado(false),
            )
          }}
        >
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
        {mailto ? (
          <a href={mailto} className={`${botonSecundario} inline-flex items-center justify-center`}>
            Abrir el mail
          </a>
        ) : (
          <p className="text-body-muted text-sm">Este cobro no tiene mail cargado. Copiá el texto y mandalo por donde hablen.</p>
        )}
      </div>
    </Ventana>
  )
}
