import { useQuery } from '@tanstack/react-query'
import { fetchFinanzasCuentas } from '../../../services/finanzasApi'
import { fetchCajas } from '../../../services/finanzasCajasApi'
import type { IngresoInput, MedioIngreso } from '../../../services/finanzasInversionesApi'
import { FinanzasFormField, finanzasInputClass } from '../FinanzasFormField'
import { parseMontoEsArACentavos } from '../montoEsAr'

export type CamposIngresoState = {
  medio: MedioIngreso
  fecha: string
  monto: string
  cuentaId: string
  cajaId: string
  chequeTipo: 'echeq' | 'fisico'
  chequeNumero: string
  chequeBanco: string
  chequeFechaPago: string
  chequeEmisor: string
  chequeCuit: string
}

export function hoyLocalIngreso(): string {
  const f = new Date()
  const m = String(f.getMonth() + 1).padStart(2, '0')
  const d = String(f.getDate()).padStart(2, '0')
  return `${f.getFullYear()}-${m}-${d}`
}

/**
 * Clave única de la carga. crypto.randomUUID solo existe en https o localhost:
 * en staging por http://IP se usa getRandomValues (32 hex, cumple lo que pide el backend).
 */
export function claveIngresoNueva(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function estadoIngresoInicial(montoSugeridoCentavos?: number): CamposIngresoState {
  return {
    medio: 'transferencia',
    fecha: hoyLocalIngreso(),
    monto:
      montoSugeridoCentavos && montoSugeridoCentavos > 0
        ? (montoSugeridoCentavos / 100).toLocaleString('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : '',
    cuentaId: '',
    cajaId: '',
    chequeTipo: 'echeq',
    chequeNumero: '',
    chequeBanco: '',
    chequeFechaPago: hoyLocalIngreso(),
    chequeEmisor: '',
    chequeCuit: '',
  }
}

/** Arma el body de ingreso o un mensaje de error de validación local. */
export function armarIngresoInput(clave: string, s: CamposIngresoState): { ok: true; input: IngresoInput } | { ok: false; error: string } {
  const montoCentavos = parseMontoEsArACentavos(s.monto)
  if (montoCentavos == null) return { ok: false, error: 'Poné el monto que entró.' }

  const input: IngresoInput = {
    clave,
    medio: s.medio,
    fecha: s.fecha,
    montoCentavos,
  }

  if (s.medio === 'transferencia') {
    if (!s.cuentaId) return { ok: false, error: 'Elegí la cuenta donde entró la transferencia.' }
    input.cuentaId = s.cuentaId
  } else if (s.medio === 'efectivo') {
    if (!s.cajaId) return { ok: false, error: 'Elegí la caja donde entra el efectivo.' }
    input.cajaId = s.cajaId
  } else {
    if (!s.chequeNumero.trim() || !s.chequeEmisor.trim() || !s.chequeFechaPago) {
      return { ok: false, error: 'Completá los datos del cheque.' }
    }
    input.cheque = {
      tipo: s.chequeTipo,
      numero: s.chequeNumero.trim(),
      bancoEmisor: s.chequeBanco.trim() || null,
      fechaPago: s.chequeFechaPago,
      emisor: s.chequeEmisor.trim(),
      emisorCuit: s.chequeCuit.trim() || null,
    }
  }

  return { ok: true, input }
}

type Props = {
  moneda: 'ARS' | 'USD'
  value: CamposIngresoState
  onChange: (next: CamposIngresoState) => void
  /** Prefijo de ids de formulario para no chocar si hay dos en pantalla. */
  idPrefix?: string
}

export function CamposIngresoCapital({ moneda, value, onChange, idPrefix = 'ri' }: Props) {
  const p = idPrefix
  const set = <K extends keyof CamposIngresoState>(key: K, v: CamposIngresoState[K]) => {
    onChange({ ...value, [key]: v })
  }

  const cuentasQ = useQuery({
    queryKey: ['finanzas', 'cuentas'],
    queryFn: fetchFinanzasCuentas,
    enabled: value.medio === 'transferencia',
  })
  const cajasQ = useQuery({
    queryKey: ['finanzas', 'cajas'],
    queryFn: fetchCajas,
    enabled: value.medio === 'efectivo',
  })

  const cuentas = (cuentasQ.data?.cuentas ?? []).filter((c) => c.moneda === moneda)
  const cajas = (cajasQ.data ?? []).filter(
    (c) => c.moneda === moneda && c.estado !== 'inactiva' && c.tipo !== 'chica',
  )

  return (
    <div className="space-y-3">
      <FinanzasFormField label="Medio" htmlFor={`${p}-medio`}>
        <select
          id={`${p}-medio`}
          value={value.medio}
          onChange={(e) => set('medio', e.target.value as MedioIngreso)}
          className={finanzasInputClass}
        >
          <option value="transferencia">Transferencia</option>
          <option value="efectivo">Efectivo</option>
          <option value="cheque">Cheque</option>
        </select>
      </FinanzasFormField>

      {value.medio !== 'cheque' ? (
        <FinanzasFormField label="Fecha" htmlFor={`${p}-fecha`}>
          <input
            id={`${p}-fecha`}
            type="date"
            value={value.fecha}
            onChange={(e) => set('fecha', e.target.value)}
            className={finanzasInputClass}
          />
        </FinanzasFormField>
      ) : null}

      <FinanzasFormField
        label={moneda === 'USD' ? 'Monto (dólares)' : 'Monto (pesos)'}
        htmlFor={`${p}-monto`}
      >
        <input
          id={`${p}-monto`}
          type="text"
          inputMode="decimal"
          value={value.monto}
          onChange={(e) => set('monto', e.target.value)}
          placeholder="Ej.: 10.000,00"
          className={finanzasInputClass}
        />
      </FinanzasFormField>

      {value.medio === 'transferencia' ? (
        <FinanzasFormField label="Cuenta" htmlFor={`${p}-cuenta`}>
          <select
            id={`${p}-cuenta`}
            value={value.cuentaId}
            onChange={(e) => set('cuentaId', e.target.value)}
            className={finanzasInputClass}
          >
            <option value="">Elegí la cuenta</option>
            {cuentas.length === 0 ? (
              <option value="" disabled>
                No hay cuentas en esta moneda
              </option>
            ) : (
              cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.bancoNombre} · {c.tipoLabel}
                </option>
              ))
            )}
          </select>
        </FinanzasFormField>
      ) : null}

      {value.medio === 'efectivo' ? (
        <FinanzasFormField label="Caja" htmlFor={`${p}-caja`}>
          <select
            id={`${p}-caja`}
            value={value.cajaId}
            onChange={(e) => set('cajaId', e.target.value)}
            className={finanzasInputClass}
          >
            <option value="">Elegí la caja</option>
            {cajas.length === 0 ? (
              <option value="" disabled>
                No hay cajas principales en esta moneda
              </option>
            ) : (
              cajas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))
            )}
          </select>
        </FinanzasFormField>
      ) : null}

      {value.medio === 'cheque' ? (
        <>
          <FinanzasFormField label="Tipo de cheque" htmlFor={`${p}-ch-tipo`}>
            <select
              id={`${p}-ch-tipo`}
              value={value.chequeTipo}
              onChange={(e) => set('chequeTipo', e.target.value as 'echeq' | 'fisico')}
              className={finanzasInputClass}
            >
              <option value="echeq">Echeq</option>
              <option value="fisico">Físico</option>
            </select>
          </FinanzasFormField>
          <FinanzasFormField label="Número" htmlFor={`${p}-ch-num`}>
            <input
              id={`${p}-ch-num`}
              type="text"
              value={value.chequeNumero}
              onChange={(e) => set('chequeNumero', e.target.value)}
              className={finanzasInputClass}
            />
          </FinanzasFormField>
          <FinanzasFormField label="Emisor" htmlFor={`${p}-ch-emisor`}>
            <input
              id={`${p}-ch-emisor`}
              type="text"
              value={value.chequeEmisor}
              onChange={(e) => set('chequeEmisor', e.target.value)}
              className={finanzasInputClass}
            />
          </FinanzasFormField>
          <FinanzasFormField label="Fecha de pago" htmlFor={`${p}-ch-fecha`}>
            <input
              id={`${p}-ch-fecha`}
              type="date"
              value={value.chequeFechaPago}
              onChange={(e) => set('chequeFechaPago', e.target.value)}
              className={finanzasInputClass}
            />
          </FinanzasFormField>
          <FinanzasFormField label="Banco emisor" htmlFor={`${p}-ch-banco`} optional>
            <input
              id={`${p}-ch-banco`}
              type="text"
              value={value.chequeBanco}
              onChange={(e) => set('chequeBanco', e.target.value)}
              className={finanzasInputClass}
            />
          </FinanzasFormField>
          <FinanzasFormField label="CUIT del emisor" htmlFor={`${p}-ch-cuit`} optional>
            <input
              id={`${p}-ch-cuit`}
              type="text"
              value={value.chequeCuit}
              onChange={(e) => set('chequeCuit', e.target.value)}
              className={finanzasInputClass}
            />
          </FinanzasFormField>
        </>
      ) : null}
    </div>
  )
}
