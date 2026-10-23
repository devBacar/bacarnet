import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate, useParams } from 'react-router-dom'
import { CuentaPanel } from '../../components/finanzas/inversiones/CuentaPanel'
import { DetalleInversion } from '../../components/finanzas/inversiones/DetalleInversion'
import { FichaInversorModal } from '../../components/finanzas/inversiones/FichaInversorModal'
import { FormInversion } from '../../components/finanzas/inversiones/FormInversion'
import { Popup } from '../../components/finanzas/inversiones/PopupInversiones'
import { formatMoneyCentavos } from '../../components/finanzas/formatMoney'
import {
  enlaceDocumentoInversion,
  fetchCuentaInversor,
  fetchInversor,
  type DocumentoInversion,
} from '../../services/finanzasInversionesApi'

function LoadingBlock() {
  return (
    <div className="flex min-h-[30vh] items-center justify-center">
      <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />
    </div>
  )
}

function formatFecha(ymd: string | null | undefined): string {
  if (!ymd) return '—'
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return `${d}/${m}/${y}`
}

export function InversorCuentaPage() {
  const { inversorId } = useParams<{ inversorId?: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [editandoInversor, setEditandoInversor] = useState(false)
  const [nuevaInversionAbierta, setNuevaInversionAbierta] = useState(false)
  const [inversionAbierta, setInversionAbierta] = useState<string | null>(null)

  const {
    data: ficha,
    isLoading: isLoadingFicha,
    isError: isErrorFicha,
    error: errorFicha,
    refetch: refetchFicha,
  } = useQuery({
    queryKey: ['finanzas', 'inversiones', 'inversor', inversorId],
    queryFn: () => fetchInversor(inversorId!),
    enabled: Boolean(inversorId),
  })

  const {
    data: cuenta,
    isLoading: isLoadingCuenta,
    isError: isErrorCuenta,
    error: errorCuenta,
    refetch: refetchCuenta,
  } = useQuery({
    queryKey: ['finanzas', 'inversiones', 'cuenta', inversorId],
    queryFn: () => fetchCuentaInversor(inversorId!),
    enabled: Boolean(inversorId),
  })

  const invalidateQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ['finanzas', 'inversiones', 'inversor', inversorId] })
    void queryClient.invalidateQueries({ queryKey: ['finanzas', 'inversiones', 'cuenta', inversorId] })
    void queryClient.invalidateQueries({ queryKey: ['finanzas', 'inversiones'] }) // Para actualizar la lista de inversiones si se crea una nueva
  }

  const abrirDoc = async (inversionId: string, docId: string) => {
    try {
      // La pestaña se abre antes del await: si se abre después, el navegador la bloquea como popup.
      const pestana = window.open('', '_blank')
      try {
        const { url } = await enlaceDocumentoInversion(inversionId, docId)
        if (pestana) {
          pestana.opener = null
          pestana.location.href = url
        } else {
          window.open(url, '_blank', 'noopener,noreferrer')
        }
      } catch (e) {
        pestana?.close()
        throw e
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No pude abrir el documento')
    }
  }

  if (!inversorId) {
    return (
      <div>
        <button
          type="button"
          onClick={() => navigate('/finanzas/inversiones?tab=inversores')}
          className="text-sm font-medium text-brand-primary hover:underline"
        >
          ← Volver a Inversores
        </button>
        <p className="text-danger mt-4 text-sm">Inversor no encontrado.</p>
      </div>
    )
  }

  if (isLoadingFicha || isLoadingCuenta) {
    return <LoadingBlock />
  }

  if (isErrorFicha || !ficha || isErrorCuenta || !cuenta) {
    return (
      <div>
        <button
          type="button"
          onClick={() => navigate('/finanzas/inversiones?tab=inversores')}
          className="text-sm font-medium text-brand-primary hover:underline"
        >
          ← Volver a Inversores
        </button>
        <p className="text-danger mt-4 text-sm">
          {errorFicha instanceof Error ? errorFicha.message : 'No pude traer la ficha del inversor'}
          <br />
          {errorCuenta instanceof Error ? errorCuenta.message : 'No pude traer la cuenta del inversor'}
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-6">
        <div>
          <button
            type="button"
            onClick={() => navigate('/finanzas/inversiones?tab=inversores')}
            className="text-sm font-medium text-brand-primary hover:underline"
          >
            ← Volver a Inversores
          </button>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-heading mt-2 text-2xl font-bold tracking-tight">{ficha.nombre}</h1>
              <p className="text-body-muted mt-1 text-sm">
                {[ficha.cuit, ficha.dni, ficha.email, ficha.telefono]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {ficha.cbuArs ? (
                <p className="text-body-muted mt-1 text-sm">CBU ARS: {ficha.cbuArs}</p>
              ) : null}
              {ficha.cuentaUsd ? (
                <p className="text-body-muted mt-1 text-sm">Cuenta USD: {ficha.cuentaUsd}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEditandoInversor(true)}
                className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Editar datos
              </button>
              <button
                type="button"
                onClick={() => setNuevaInversionAbierta(true)}
                className="rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
              >
                Nueva inversión
              </button>
            </div>
          </div>
        </div>

        <CuentaPanel
          cuenta={cuenta}
          general={false}
          onVerInversion={(id) => setInversionAbierta(id)}
          onAbrirDocumento={abrirDoc}
        />

        {ficha.inversiones.length > 0 ? (
          <section aria-label="Inversiones del inversor" className="space-y-3">
            <h2 className="text-heading text-lg font-semibold sm:text-xl">Inversiones</h2>
            <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-zinc-800">
              <table className="min-w-full text-base">
                <thead className="bg-neutral-50 dark:bg-zinc-950/80">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Número</th>
                    <th className="px-4 py-3 text-left font-medium">Estado</th>
                    <th className="px-4 py-3 text-left font-medium">Moneda</th>
                    <th className="px-4 py-3 text-right font-medium">Capital</th>
                    <th className="px-4 py-3 text-left font-medium"> </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800">
                  {ficha.inversiones.map((inv) => (
                    <tr key={inv.id}>
                      <td className="px-4 py-3 font-medium">{inv.numero}</td>
                      <td className="px-4 py-3">{inv.estado}</td>
                      <td className="px-4 py-3">{inv.moneda}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMoneyCentavos(inv.capitalCentavos, inv.moneda)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setInversionAbierta(inv.id)}
                          className="rounded-xl border border-neutral-200 px-3 py-2 text-base font-medium hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>

      {editandoInversor ? (
        <FichaInversorModal
          modo="editar"
          inversorId={inversorId}
          onClose={() => setEditandoInversor(false)}
          onGuardado={() => {
            void invalidateQueries()
            void refetchFicha()
            void refetchCuenta()
          }}
        />
      ) : null}

      {nuevaInversionAbierta ? (
        <Popup onCerrar={() => setNuevaInversionAbierta(false)} cerrarSoloConBoton>
          <FormInversion
            modo="nuevo"
            inversorIdInicial={inversorId}
            onCerrar={() => setNuevaInversionAbierta(false)}
            onGuardado={(d) => {
              setNuevaInversionAbierta(false)
              void invalidateQueries()
              void refetchFicha()
              void refetchCuenta()
              setInversionAbierta(d.id)
            }}
          />
        </Popup>
      ) : null}

      {inversionAbierta ? (
        <Popup onCerrar={() => {
            setInversionAbierta(null)
            void invalidateQueries()
            void refetchFicha()
            void refetchCuenta()
          }}>
          <DetalleInversion id={inversionAbierta} />
        </Popup>
      ) : null}
    </>
  )
}
