import { useQuery } from '@tanstack/react-query'

import { RefreshCw } from 'lucide-react'

import { useMemo } from 'react'

import toast from 'react-hot-toast'

import { AccountCard } from '../../components/finanzas/AccountCard'

import { AccountsSummary } from '../../components/finanzas/AccountsSummary'

import { BankPositionsSection } from '../../components/finanzas/BankPositionsSection'

import {

  computePosicionPorBanco,

  groupCuentasByBanco,

} from '../../components/finanzas/finanzasAggregates'

import { SemaforoLegend } from '../../components/finanzas/SemaforoLegend'

import { useAuth } from '../../context'

import { fetchFinanzasCuentas } from '../../services/finanzasApi'



export function FinanzasCuentasPage() {

  const { user } = useAuth()



  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({

    queryKey: ['finanzas', 'cuentas'],

    queryFn: fetchFinanzasCuentas,

    enabled: Boolean(user),

  })



  const posicionPorBanco = useMemo(

    () => (data ? computePosicionPorBanco(data.cuentas) : []),

    [data],

  )

  const gruposPorBanco = useMemo(

    () => (data ? groupCuentasByBanco(data.cuentas) : []),

    [data],

  )



  const handleRefresh = async () => {

    try {

      await refetch()

      toast.success('Saldos actualizados')

    } catch {

      toast.error('No se pudieron actualizar los saldos')

    }

  }



  return (

    <>

      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">

        <div>

          <h1 className="text-heading text-2xl font-bold tracking-tight sm:text-3xl">

            Saldos bancarios

          </h1>

          <p className="text-body-muted mt-2 max-w-2xl text-sm">

            Posición consolidada por moneda (pesos y dólares por separado), alineada al mail diario

            de finanzas.

          </p>

        </div>

        <button

          type="button"

          onClick={() => void handleRefresh()}

          disabled={isFetching}

          className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100 dark:hover:bg-zinc-800"

        >

          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden />

          Actualizar

        </button>

      </header>



      {isLoading ? (

        <div className="flex min-h-[40vh] items-center justify-center">

          <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />

        </div>

      ) : isError ? (

        <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-8 text-center dark:border-red-900 dark:bg-red-950/40">

          <p className="text-sm font-medium text-red-800 dark:text-red-200">

            {error instanceof Error ? error.message : 'Error al cargar las cuentas'}

          </p>

        </div>

      ) : data ? (

        <div className="space-y-8">

          <AccountsSummary

            arsCentavos={data.totales.arsCentavos}

            usdCentavos={data.totales.usdCentavos}

          />



          <BankPositionsSection rows={posicionPorBanco} />



          <section aria-labelledby="finanzas-cuentas-heading" className="space-y-6">

            <div className="space-y-4">

              <h2

                id="finanzas-cuentas-heading"

                className="text-heading text-lg font-semibold tracking-tight"

              >

                Detalle por cuenta

              </h2>

              <SemaforoLegend />

            </div>



            {data.cuentas.length === 0 ? (

              <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-10 text-center dark:border-zinc-700 dark:bg-zinc-950/50">

                <p className="text-sm font-medium text-neutral-700 dark:text-gray-300">

                  No hay cuentas cargadas

                </p>

                <p className="text-body-muted mx-auto mt-2 max-w-md text-sm">

                  La API respondió sin documentos en Firestore. Ejecutá el seed de Finanzas en

                  producción o esperá la próxima sincronización bancaria.

                </p>

              </div>

            ) : (

              <div className="space-y-10">

                {gruposPorBanco.map((grupo) => (

                  <div key={grupo.bancoNombre} className="space-y-4">

                    <h3 className="text-heading border-b border-neutral-200 pb-2 text-base font-semibold dark:border-zinc-800">

                      {grupo.bancoNombre}

                    </h3>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">

                      {grupo.cuentas.map((cuenta) => (

                        <AccountCard key={cuenta.id} cuenta={cuenta} />

                      ))}

                    </div>

                  </div>

                ))}

              </div>

            )}

          </section>

        </div>

      ) : null}

    </>

  )

}


