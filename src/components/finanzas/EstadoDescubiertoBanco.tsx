import { ArrowRightLeft, PlusCircle } from 'lucide-react'
import {
  estadoDescubierto,
  fraseSaldoDespues,
  frasesDescubierto,
  montoSimple,
  montoSimpleAbs,
  resumenBancos,
  type BancoParaResumen,
  type TonoEstado,
} from './montoSimple'

const CHIP: Record<TonoEstado, string> = {
  verde: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100',
  ambar: 'bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100',
  rojo: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100',
}

const BARRA: Record<TonoEstado, string> = {
  verde: 'bg-emerald-500',
  ambar: 'bg-amber-400',
  rojo: 'bg-red-500',
}

const TEXTO: Record<TonoEstado, string> = {
  verde: 'text-emerald-800 dark:text-emerald-200',
  ambar: 'text-amber-900 dark:text-amber-200',
  rojo: 'text-red-700 dark:text-red-300',
}

const BORDE: Record<TonoEstado, string> = {
  verde: 'border-emerald-200 dark:border-emerald-900/60',
  ambar: 'border-amber-200 dark:border-amber-900/60',
  rojo: 'border-red-200 dark:border-red-900/60',
}

export interface EstadoDescubiertoBancoProps {
  banco: string
  /** Saldo actual de la cuenta corriente en pesos, en centavos. */
  saldoCentavos: number
  /** Descubierto acordado en centavos; null si no está cargado. */
  descubiertoCentavos: number | null
  /** Cómo quedaría el banco si se paga lo de hoy desde acá. Opcional. */
  saldoDespuesCentavos?: number | null
  /** Tocar la tarjeta: abre el detalle de cuentas. */
  onAbrir?: () => void
  onTransferir?: () => void
  /** Solo para quien tiene permiso de cargar el descubierto. */
  onCargarDescubierto?: () => void
}

const botonPrincipal =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 text-base font-semibold text-white'
const botonSecundario =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-neutral-300 px-4 text-base font-semibold dark:border-zinc-600'

/** Una tarjeta por banco: en qué está, cuánto descubierto usa y qué le queda, en frases. */
export function EstadoDescubiertoBanco({
  banco,
  saldoCentavos,
  descubiertoCentavos,
  saldoDespuesCentavos = null,
  onAbrir,
  onTransferir,
  onCargarDescubierto,
}: EstadoDescubiertoBancoProps) {
  const estado = estadoDescubierto(saldoCentavos, descubiertoCentavos)
  const frases = frasesDescubierto(saldoCentavos, descubiertoCentavos)
  const negativo = saldoCentavos < 0
  const mostrarBarra = estado.porcentajeUso != null
  const tonoDespues =
    saldoDespuesCentavos == null ? null : estadoDescubierto(saldoDespuesCentavos, descubiertoCentavos).tono

  const cuerpo = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-heading text-2xl font-bold leading-tight">{banco}</h3>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${CHIP[estado.tono]}`}>
          {estado.etiqueta}
        </span>
      </div>

      <p className="mt-3 text-lg">
        <span className="text-body-muted">Saldo: </span>
        <span
          className={`text-3xl font-bold tabular-nums tracking-tight sm:text-4xl ${
            negativo ? 'text-red-700 dark:text-red-300' : 'text-heading'
          }`}
        >
          {montoSimple(saldoCentavos)}
        </span>
      </p>

      {mostrarBarra ? (
        <div className="mt-4">
          {estado.clave === 'pasado' ? (
            <p className="mb-1 text-base font-semibold text-red-700 dark:text-red-300">
              +{montoSimpleAbs(estado.excesoCentavos)} por encima del descubierto
            </p>
          ) : (
            <p className="text-body-muted mb-1 text-sm">
              Usa el {Math.round(estado.porcentajeUso ?? 0)} % del descubierto
            </p>
          )}
          <div
            role="progressbar"
            aria-label={`Descubierto usado en ${banco}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(estado.porcentajeUso ?? 0)}
            className="h-3 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-zinc-700"
          >
            <div
              className={`h-full rounded-full ${BARRA[estado.tono]}`}
              style={{ width: `${Math.min(100, Math.max(0, estado.porcentajeUso ?? 0))}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-1.5">
        {frases.map((frase) => (
          <p key={frase} className={`text-lg leading-snug ${estado.tono === 'verde' ? '' : TEXTO[estado.tono]}`}>
            {frase}
          </p>
        ))}
        {saldoDespuesCentavos != null && tonoDespues ? (
          <p className={`text-lg font-medium leading-snug ${TEXTO[tonoDespues]}`}>
            {fraseSaldoDespues(saldoDespuesCentavos)}
          </p>
        ) : null}
      </div>
    </>
  )

  const hayAcciones = Boolean(onTransferir) || (estado.clave === 'sin_descubierto' && Boolean(onCargarDescubierto))

  return (
    <article
      className={`surface-card rounded-2xl border-2 p-4 sm:p-6 ${BORDE[estado.tono]}`}
      aria-label={`${banco}: ${estado.etiqueta}`}
    >
      {onAbrir ? (
        <button
          type="button"
          onClick={onAbrir}
          className="-m-2 block w-full rounded-xl p-2 text-left transition hover:bg-neutral-100/70 dark:hover:bg-zinc-800/70"
          aria-label={`Ver las cuentas de ${banco}`}
        >
          {cuerpo}
        </button>
      ) : (
        <div>{cuerpo}</div>
      )}

      {hayAcciones ? (
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {estado.clave === 'sin_descubierto' && onCargarDescubierto ? (
            <button type="button" className={botonPrincipal} onClick={onCargarDescubierto}>
              <PlusCircle className="h-5 w-5 shrink-0" aria-hidden />
              Cargar descubierto
            </button>
          ) : null}
          {onTransferir ? (
            <button
              type="button"
              className={estado.clave === 'sin_descubierto' && onCargarDescubierto ? botonSecundario : botonPrincipal}
              onClick={onTransferir}
            >
              <ArrowRightLeft className="h-5 w-5 shrink-0" aria-hidden />
              Transferir
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

/** Las frases de arriba de las tarjetas: cómo estás entre todos los bancos, sin mezclarlos. */
export function ResumenBancos({ bancos, className = '' }: { bancos: BancoParaResumen[]; className?: string }) {
  const frases = resumenBancos(bancos)
  if (frases.length === 0) return null
  const total = bancos.reduce((suma, banco) => suma + banco.saldoCentavos, 0)
  return (
    <div className={`grid gap-1.5 ${className}`}>
      {frases.map((frase, indice) => {
        const esTotal = indice === 0
        const esProblema = !esTotal && (frase.includes('está pasado') || frase.includes('está en rojo'))
        return (
          <p
            key={frase}
            className={`leading-snug ${
              esTotal
                ? `text-2xl font-semibold ${total < 0 ? 'text-red-700 dark:text-red-300' : 'text-heading'}`
                : esProblema
                  ? `text-lg font-medium ${frase.includes('está pasado') ? TEXTO.rojo : TEXTO.ambar}`
                  : 'text-lg'
            }`}
          >
            {frase}
          </p>
        )
      })}
    </div>
  )
}
