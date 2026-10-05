import { useQuery } from '@tanstack/react-query'
import { Banknote, Copy, FileText, Landmark, Mail, Wallet, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { fetchFinanzasCuentas } from '../../../services/finanzasApi'
import { fetchCajas } from '../../../services/finanzasCajasApi'
import {
  type IngresoHoy,
  type MedioPagoHoy,
  type PagoHoy,
  type SugerenciaBanco,
} from '../../../services/finanzasHoyApi'
import { formatMoneyCentavos } from '../formatMoney'
import { finanzasInputClass } from '../FinanzasFormField'
export { ComoLoPagasModal } from './ComoLoPagasModal'

const botonPrimario =
  'rounded-xl bg-brand-primary px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60'
const botonTexto =
  'rounded-xl px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 dark:text-gray-200 dark:hover:bg-zinc-800'
const botonSecundario =
  'inline-flex items-center justify-center rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100 dark:hover:bg-zinc-800'

/** Ventana de tamaño normal: título, contenido y al pie Cancelar más el botón de confirmar (si hay). */
function Ventana({
  titulo,
  textoCerrar = 'Cancelar',
  onClose,
  accion,
  tour,
  children,
}: {
  titulo: string
  textoCerrar?: string
  onClose: () => void
  accion?: ReactNode
  /** Marca para las guías de Ayuda. */
  tour?: string
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hoy-dialogo-titulo"
        data-tour={tour}
        className="surface-card max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-neutral-200 p-5 shadow-xl dark:border-zinc-700 sm:p-6"
      >
        <h2 id="hoy-dialogo-titulo" className="text-heading text-lg font-semibold">
          {titulo}
        </h2>
        <div className="mt-3">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={botonTexto}>
            {textoCerrar}
          </button>
          {accion}
        </div>
      </div>
    </div>
  )
}

/** Una opción para elegir: fila con ícono, título y una línea de explicación. */
function Opcion({
  icono: Icono,
  titulo,
  explicacion,
  activa = false,
  disabled = false,
  onClick,
}: {
  icono: LucideIcon
  titulo: string
  explicacion: string
  activa?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={activa}
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
        activa
          ? 'border-brand-primary bg-brand-primary/10'
          : 'border-neutral-200 hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-800'
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          activa ? 'bg-brand-primary text-white' : 'bg-neutral-100 text-neutral-700 dark:bg-zinc-800 dark:text-gray-200'
        }`}
      >
        <Icono className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="text-heading block text-sm font-medium leading-tight">{titulo}</span>
        <span className="text-body-muted block text-xs leading-snug">{explicacion}</span>
      </span>
    </button>
  )
}

function Encabezado({ detalle, montoCentavos }: { detalle: string; montoCentavos: number }) {
  return (
    <p className="text-sm">
      <span className="text-body-muted">{detalle}</span>
      <span className="text-heading mt-0.5 block text-base font-semibold tabular-nums">
        {formatMoneyCentavos(montoCentavos, 'ARS')}
      </span>
    </p>
  )
}

function Etiqueta({ children, tour }: { children: ReactNode; tour?: string }) {
  return (
    <label data-tour={tour} className="mt-4 block text-sm font-medium text-neutral-800 dark:text-gray-200">
      {children}
    </label>
  )
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
    <Ventana
      titulo={titulo}
      onClose={onClose}
      tour="hoy-efectivo-ventana"
      accion={
        <button
          type="button"
          className={botonPrimario}
          data-tour="hoy-efectivo-confirmar"
          disabled={!elegida || noAlcanza || guardando}
          onClick={() => {
            if (elegida) onConfirmar(elegida.id, archivo)
          }}
        >
          {guardando ? 'Guardando…' : 'Confirmar'}
        </button>
      }
    >
      <Encabezado detalle={detalle} montoCentavos={montoCentavos} />
      <p className="mt-4 text-sm font-medium">{esIngreso ? '¿En qué caja lo anotamos?' : '¿De qué caja sale?'}</p>
      {isLoading ? <p className="text-body-muted mt-2 text-sm">Buscando las cajas…</p> : null}
      {!isLoading && enPesos.length === 0 ? (
        <p className="text-body-muted mt-2 text-sm">No hay cajas en pesos para anotar esto.</p>
      ) : null}
      <div className="mt-2 grid gap-2" data-tour="hoy-efectivo-cajas">
        {enPesos.map((caja) => {
          const corta = !esIngreso && caja.saldoActualCentavos < montoCentavos
          return (
            <Opcion
              key={caja.id}
              icono={Wallet}
              titulo={caja.nombre}
              explicacion={`Disponible ${formatMoneyCentavos(caja.saldoActualCentavos, 'ARS')}${
                corta ? ' · No alcanza' : ''
              }${caja.bloqueadaPorCierre ? ' · Cerrada, esperando aprobación' : ''}`}
              activa={caja.id === cajaId}
              disabled={caja.bloqueadaPorCierre === true || corta}
              onClick={() => setCajaId(caja.id)}
            />
          )
        })}
      </div>
      {noAlcanza ? (
        <p className="mt-3 text-sm text-red-700 dark:text-red-300">En esa caja no alcanza para este pago.</p>
      ) : null}
      <Etiqueta tour="hoy-efectivo-comprobante">
        Comprobante (opcional)
        <input
          type="file"
          accept="image/*,.pdf"
          className="mt-1 block w-full text-sm font-normal"
          onChange={(event) => setArchivo(event.target.files?.[0] ?? null)}
        />
      </Etiqueta>
      <p className="text-body-muted mt-1 text-xs">
        Si no lo adjuntás, queda sin comprobante, igual que cuando lo cargás en Cajas.
      </p>
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
    <Ventana
      titulo="Ya lo pagué"
      onClose={onClose}
      tour="hoy-ya-pague-ventana"
      accion={
        <button
          type="button"
          className={botonPrimario}
          data-tour="hoy-ya-pague-confirmar"
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
      }
    >
      <Encabezado detalle={`${pago.aQuien} · ${pago.concepto}`} montoCentavos={pago.montoCentavos} />
      <p className="mt-4 text-sm font-medium">¿Cómo lo pagaste?</p>
      <div className="mt-2 grid gap-2" data-tour="hoy-ya-pague-medio">
        {(
          [
            ['transferencia', Landmark, 'Por banco', 'Salió por transferencia desde una de nuestras cuentas.'],
            ['efectivo', Banknote, 'En efectivo', 'Se pagó con plata de una caja.'],
            ['cheque', FileText, 'Con cheque', 'Se entregó un cheque.'],
          ] as const
        ).map(([id, icono, titulo, explicacion]) => (
          <Opcion
            key={id}
            icono={icono}
            titulo={titulo}
            explicacion={explicacion}
            activa={medio === id}
            onClick={() => setMedio(id)}
          />
        ))}
      </div>
      <Etiqueta tour="hoy-ya-pague-fecha">
        ¿Qué día lo pagaste?
        <input
          type="date"
          className={`${finanzasInputClass} mt-1`}
          value={fecha}
          onChange={(event) => setFecha(event.target.value)}
        />
      </Etiqueta>
      {medio === 'transferencia' ? (
        <div className="mt-4" data-tour="hoy-ya-pague-banco">
          <p className="text-sm font-medium">Si salió del banco, ¿es alguno de estos débitos?</p>
          {pago.sugerenciasBanco.length === 0 ? (
            <p className="text-body-muted mt-1 text-xs">
              No hay un débito del mismo monto en los últimos 5 días.
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
                aria-pressed={sinMovimiento}
                className={`${botonSecundario} ${sinMovimiento ? 'border-brand-primary bg-brand-primary/10' : ''}`}
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
            <Etiqueta>
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
            </Etiqueta>
          ) : null}
        </div>
      ) : null}
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
    <Opcion
      icono={Landmark}
      titulo={`${item.bancoNombre} · ${formatMoneyCentavos(item.montoCentavos, 'ARS')}`}
      explicacion={`${fechaCorta(item.fecha)}${item.descripcion ? ` · ${item.descripcion}` : ''}`}
      activa={activa}
      onClick={onElegir}
    />
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
    <Ventana
      titulo={titulo}
      onClose={onClose}
      tour="hoy-fecha-ventana"
      accion={
        <button
          type="button"
          className={botonPrimario}
          data-tour="hoy-fecha-confirmar"
          disabled={guardando || !fecha}
          onClick={() => onConfirmar(fecha)}
        >
          {guardando ? 'Guardando…' : 'Cambiar fecha'}
        </button>
      }
    >
      <p className="text-body-muted text-sm">{detalle}</p>
      <Etiqueta tour="hoy-fecha-campo">
        Nueva fecha
        <input
          type="date"
          className={`${finanzasInputClass} mt-1`}
          value={fecha}
          onChange={(event) => setFecha(event.target.value)}
        />
      </Etiqueta>
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
    <Ventana titulo={`Reclamar a ${ingreso.cliente}`} textoCerrar="Cerrar" onClose={onClose}>
      <p className="text-body-muted text-sm">Este es el mensaje armado. Copialo o abrí el mail y mandalo.</p>
      <textarea
        readOnly
        className={`${finanzasInputClass} mt-2 min-h-32 text-sm`}
        value={ingreso.textoReclamo}
      />
      <div className="mt-3 grid gap-2">
        <Opcion
          icono={Copy}
          titulo={copiado ? 'Copiado ✓' : 'Copiar el mensaje'}
          explicacion="Después lo pegás en WhatsApp o donde hablen con el cliente."
          activa={copiado}
          onClick={() => {
            void navigator.clipboard.writeText(ingreso.textoReclamo).then(
              () => setCopiado(true),
              () => setCopiado(false),
            )
          }}
        />
        {mailto ? (
          <a
            href={mailto}
            className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 px-3 py-2.5 text-left transition hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700 dark:bg-zinc-800 dark:text-gray-200">
              <Mail className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="text-heading block text-sm font-medium leading-tight">Abrir el mail</span>
              <span className="text-body-muted block text-xs leading-snug">
                Se abre tu correo con el mensaje ya escrito para {ingreso.email}.
              </span>
            </span>
          </a>
        ) : (
          <p className="text-body-muted text-xs">
            Este cobro no tiene mail cargado. Copiá el texto y mandalo por donde hablen.
          </p>
        )}
      </div>
    </Ventana>
  )
}
