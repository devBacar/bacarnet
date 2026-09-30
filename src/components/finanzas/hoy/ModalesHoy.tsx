import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { fetchFinanzasCuentas } from '../../../services/finanzasApi'
import { fetchCajas } from '../../../services/finanzasCajasApi'
import type { IngresoHoy, MedioPagoHoy, PagoHoy, SugerenciaBanco } from '../../../services/finanzasHoyApi'
import { formatMoneyCentavos } from '../formatMoney'
import { finanzasInputClass } from '../FinanzasFormField'
import { TEXTO_CHEQUE_PROXIMAMENTE, type PagoConCheque } from './pagoConCheque'

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

export function ComoLoPagasModal({
  pago,
  onClose,
  onBanco,
  onEfectivo,
}: {
  pago: PagoHoy
  onClose: () => void
  onBanco: () => void
  onEfectivo: () => void
}) {
  const preparado: PagoConCheque | null = null
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
        <button type="button" className={botonSecundario} disabled={preparado == null}>
          Con cheque. {TEXTO_CHEQUE_PROXIMAMENTE}
        </button>
      </div>
    </Ventana>
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
