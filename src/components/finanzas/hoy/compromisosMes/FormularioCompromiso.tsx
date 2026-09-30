import { useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import { FinanzasFormField, finanzasInputClass } from '../../FinanzasFormField'
import { parseMontoEsArACentavos } from '../../montoEsAr'
import {
  GRUPOS_COMPROMISO,
  type CompromisoMesInput,
  type MedioPagoCompromiso,
  type MonedaCompromiso,
} from '../../../../services/finanzasCompromisosMesApi'

const MEDIOS: Array<{ id: MedioPagoCompromiso; label: string }> = [
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'cheque', label: 'Cheque' },
  { id: 'efectivo', label: 'Efectivo' },
]

function centavosATexto(centavos: number | null): string {
  if (centavos == null) return ''
  return (centavos / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function FormularioCompromiso({
  titulo,
  grupos,
  inicial,
  onClose,
  onSave,
}: {
  titulo: string
  grupos: readonly string[]
  inicial: CompromisoMesInput
  onClose: () => void
  onSave: (body: CompromisoMesInput) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [concepto, setConcepto] = useState(inicial.concepto)
  const [proveedor, setProveedor] = useState(inicial.proveedorONombre)
  const [grupo, setGrupo] = useState(inicial.grupo)
  const [moneda, setMoneda] = useState<MonedaCompromiso>(inicial.moneda)
  const [importe, setImporte] = useState(centavosATexto(inicial.montoCentavos || null))
  const [fecha, setFecha] = useState(inicial.fechaVencimiento)
  const [deuda, setDeuda] = useState(centavosATexto(inicial.deudaTotalCentavos))
  const [cuotaNumero, setCuotaNumero] = useState(inicial.cuotaNumero ? String(inicial.cuotaNumero) : '')
  const [cuotaTotal, setCuotaTotal] = useState(inicial.cuotaTotal ? String(inicial.cuotaTotal) : '')
  const [observacion, setObservacion] = useState(inicial.observacion ?? '')
  const [medio, setMedio] = useState<MedioPagoCompromiso>(inicial.medioPago)
  const opciones = grupos.length > 0 ? grupos : [...GRUPOS_COMPROMISO]

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const montoCentavos = parseMontoEsArACentavos(importe)
    if (montoCentavos == null) {
      toast.error('El importe a pagar no es válido')
      return
    }
    const deudaTotalCentavos = deuda.trim() ? parseMontoEsArACentavos(deuda) : null
    if (deuda.trim() && deudaTotalCentavos == null) {
      toast.error('La deuda total no es válida')
      return
    }
    const numero = cuotaNumero.trim() ? Number(cuotaNumero) : null
    const total = cuotaTotal.trim() ? Number(cuotaTotal) : null
    if ((numero == null) !== (total == null) || (numero != null && (!Number.isInteger(numero) || numero <= 0)) || (total != null && (!Number.isInteger(total) || total <= 0))) {
      toast.error('Completá la cuota como N de M')
      return
    }
    if (numero != null && total != null && numero > total) {
      toast.error('El número de cuota no puede pasar el total')
      return
    }
    setSaving(true)
    void onSave({
      concepto: concepto.trim(),
      proveedorONombre: proveedor.trim(),
      grupo,
      moneda,
      montoCentavos,
      fechaVencimiento: fecha,
      deudaTotalCentavos,
      cuotaNumero: numero,
      cuotaTotal: total,
      observacion: observacion.trim() || null,
      medioPago: medio,
    })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
      })
      .finally(() => setSaving(false))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Cerrar" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 dark:bg-zinc-900 sm:p-6"
      >
        <h2 className="text-heading text-base font-semibold">{titulo}</h2>
        <div className="mt-4 grid gap-3">
          <FinanzasFormField label="Concepto" htmlFor="mes-concepto">
            <input id="mes-concepto" required className={finanzasInputClass} value={concepto} onChange={(e) => setConcepto(e.target.value)} />
          </FinanzasFormField>
          <FinanzasFormField label="A quién" htmlFor="mes-quien">
            <input id="mes-quien" required className={finanzasInputClass} value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
          </FinanzasFormField>
          <FinanzasFormField label="Grupo" htmlFor="mes-grupo">
            <select id="mes-grupo" className={finanzasInputClass} value={grupo} onChange={(e) => setGrupo(e.target.value)}>
              {opciones.map((opcion) => (
                <option key={opcion} value={opcion}>
                  {opcion}
                </option>
              ))}
            </select>
          </FinanzasFormField>
          <div className="grid grid-cols-2 gap-3">
            <FinanzasFormField label="Moneda" htmlFor="mes-moneda">
              <select
                id="mes-moneda"
                className={finanzasInputClass}
                value={moneda}
                onChange={(e) => setMoneda(e.target.value as MonedaCompromiso)}
              >
                <option value="ARS">Pesos</option>
                <option value="USD">Dólares</option>
              </select>
            </FinanzasFormField>
            <FinanzasFormField label="A pagar" htmlFor="mes-importe">
              <input
                id="mes-importe"
                required
                inputMode="decimal"
                className={finanzasInputClass}
                placeholder="150000,50"
                value={importe}
                onChange={(e) => setImporte(e.target.value)}
              />
            </FinanzasFormField>
          </div>
          <FinanzasFormField label="Fecha" htmlFor="mes-fecha">
            <input id="mes-fecha" required type="date" className={finanzasInputClass} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </FinanzasFormField>
          <FinanzasFormField label="Deuda total" htmlFor="mes-deuda" optional>
            <input
              id="mes-deuda"
              inputMode="decimal"
              className={finanzasInputClass}
              placeholder="Lo que se debe en total"
              value={deuda}
              onChange={(e) => setDeuda(e.target.value)}
            />
          </FinanzasFormField>
          <div className="grid grid-cols-2 gap-3">
            <FinanzasFormField label="Cuota N" htmlFor="mes-cuota-n" optional>
              <input
                id="mes-cuota-n"
                inputMode="numeric"
                className={finanzasInputClass}
                value={cuotaNumero}
                onChange={(e) => setCuotaNumero(e.target.value)}
              />
            </FinanzasFormField>
            <FinanzasFormField label="de M" htmlFor="mes-cuota-m" optional>
              <input
                id="mes-cuota-m"
                inputMode="numeric"
                className={finanzasInputClass}
                value={cuotaTotal}
                onChange={(e) => setCuotaTotal(e.target.value)}
              />
            </FinanzasFormField>
          </div>
          <FinanzasFormField label="Observación" htmlFor="mes-obs" optional>
            <input
              id="mes-obs"
              className={finanzasInputClass}
              placeholder="Mutuo, pagaré, débito julio"
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
            />
          </FinanzasFormField>
          <FinanzasFormField label="Medio previsto" htmlFor="mes-medio">
            <select
              id="mes-medio"
              className={finanzasInputClass}
              value={medio}
              onChange={(e) => setMedio(e.target.value as MedioPagoCompromiso)}
            >
              {MEDIOS.map((opcion) => (
                <option key={opcion.id} value={opcion.id}>
                  {opcion.label}
                </option>
              ))}
            </select>
          </FinanzasFormField>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="px-3 py-2 text-sm" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="rounded-lg bg-brand-primary px-3 py-2 text-sm text-white disabled:opacity-60">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}
