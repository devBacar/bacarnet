import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  cambiarEstadoInversor,
  crearInversor,
  editarInversor,
  fetchInversion,
  fetchInversor,
  type InversionDetalle,
  type InversorDatos,
  type TipoPersona,
} from '../../../services/finanzasInversionesApi'
import { hoyArgentina } from '../hoy/cajaDelDia/fechasCaja'
import { FinanzasFormField, finanzasInputClass } from '../FinanzasFormField'
import { formatMoneyCentavos } from '../formatMoney'
import {
  cuentaInversor,
  type EstadoCuotaCalendario,
  type InversionParaCuenta,
  type KpisMoneda,
  type MesCalendario,
} from './cuentaInversor'
import {
  TEXTOS_FICHA,
  TEXTO_ESTADO_CUOTA_CALENDARIO,
  textoEstado,
  textoTasa,
} from './textosInversiones'

type FormState = {
  nombre: string
  tipoPersona: '' | TipoPersona
  cuit: string
  dni: string
  email: string
  telefono: string
  domicilio: string
  cbuArs: string
  cuentaUsd: string
  /** '' = No sé (null), 'si' | 'no' */
  inscriptoGanancias: '' | 'si' | 'no'
  observaciones: string
}

const VACIO: FormState = {
  nombre: '',
  tipoPersona: '',
  cuit: '',
  dni: '',
  email: '',
  telefono: '',
  domicilio: '',
  cbuArs: '',
  cuentaUsd: '',
  inscriptoGanancias: '',
  observaciones: '',
}

function aForm(datos: InversorDatos): FormState {
  return {
    nombre: datos.nombre ?? '',
    tipoPersona: datos.tipoPersona ?? '',
    cuit: datos.cuit ?? '',
    dni: datos.dni ?? '',
    email: datos.email ?? '',
    telefono: datos.telefono ?? '',
    domicilio: datos.domicilio ?? '',
    cbuArs: datos.cbuArs ?? '',
    cuentaUsd: datos.cuentaUsd ?? '',
    inscriptoGanancias:
      datos.inscriptoGanancias === true ? 'si' : datos.inscriptoGanancias === false ? 'no' : '',
    observaciones: datos.observaciones ?? '',
  }
}

function textoONull(v: string): string | null {
  const t = v.trim()
  return t ? t : null
}

function aDatos(form: FormState): InversorDatos {
  return {
    nombre: form.nombre.trim(),
    tipoPersona: form.tipoPersona === '' ? null : form.tipoPersona,
    cuit: textoONull(form.cuit),
    dni: textoONull(form.dni),
    email: textoONull(form.email),
    telefono: textoONull(form.telefono),
    domicilio: textoONull(form.domicilio),
    cbuArs: textoONull(form.cbuArs),
    cuentaUsd: textoONull(form.cuentaUsd),
    inscriptoGanancias:
      form.inscriptoGanancias === 'si' ? true : form.inscriptoGanancias === 'no' ? false : null,
    observaciones: textoONull(form.observaciones),
  }
}

function formatFecha(ymd: string | null | undefined): string {
  if (!ymd) return '—'
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return `${d}/${m}/${y}`
}

function mesDeHoy(hoy: string): string {
  return hoy.slice(0, 7)
}

function detalleAInversionParaCuenta(d: InversionDetalle): InversionParaCuenta {
  return {
    id: d.id,
    numero: d.numero,
    estado: d.estado,
    moneda: d.condiciones.moneda,
    capitalCentavos: d.condiciones.capitalCentavos,
    fechaFinal: d.alertas.fechaFinal,
    tasaTexto: textoTasa(d.condiciones.tasa),
    cronograma: d.cronograma.map((c) => ({
      numero: c.numero,
      fechaVencimiento: c.fechaVencimiento,
      estado: c.estado,
      aPagarCentavos: c.aPagarCentavos,
      monedaPago: c.monedaPago,
      interesCentavos: c.interesCentavos,
      retencionCentavos: c.retencionCentavos,
      restanteCentavos: c.restanteCentavos,
    })),
  }
}

function claseEstadoCuota(estado: EstadoCuotaCalendario): string {
  switch (estado) {
    case 'pagada':
      return 'font-semibold text-emerald-700 dark:text-emerald-300'
    case 'vencida':
      return 'font-semibold text-red-700 dark:text-red-300'
    case 'pendiente':
      return 'font-semibold text-sky-800 dark:text-sky-300'
  }
}

function PopupGrande({
  children,
  onCerrar,
  ariaLabelledBy,
}: {
  children: ReactNode
  onCerrar: () => void
  ariaLabelledBy: string
}) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && document.querySelectorAll('.fixed.inset-0').length <= 1) onCerrar()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onCerrar])

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCerrar()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        className="relative w-full max-w-5xl rounded-2xl bg-white p-4 shadow-xl sm:p-6 dark:bg-zinc-900"
      >
        <button
          type="button"
          onClick={onCerrar}
          aria-label={TEXTOS_FICHA.cerrar}
          className="text-body-muted absolute right-3 top-3 rounded-lg px-2 py-1 text-lg hover:bg-neutral-100 dark:hover:bg-zinc-800"
        >
          ×
        </button>
        {children}
      </div>
    </div>
  )
}

function KpiCard({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="surface-card rounded-2xl border border-neutral-200 p-4 dark:border-zinc-800">
      <p className="text-body-muted text-base font-medium leading-snug">{titulo}</p>
      <div className="text-heading mt-2 text-xl font-bold tabular-nums sm:text-2xl">{children}</div>
    </div>
  )
}

function FilaKpisMoneda({ kpis, tituloFila }: { kpis: KpisMoneda; tituloFila: string }) {
  const prox = kpis.proximoVencimiento
  return (
    <section aria-label={tituloFila} className="space-y-3">
      <h3 className="text-heading text-base font-semibold sm:text-lg">{tituloFila}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard titulo={TEXTOS_FICHA.capitalVigente}>
          {formatMoneyCentavos(kpis.capitalVigenteCentavos, kpis.moneda)}
        </KpiCard>
        <KpiCard titulo={TEXTOS_FICHA.interesesPagados}>
          {formatMoneyCentavos(kpis.interesesPagadosCentavos, kpis.moneda)}
        </KpiCard>
        <KpiCard titulo={TEXTOS_FICHA.interesesAPagar}>
          {formatMoneyCentavos(kpis.interesesAPagarCentavos, kpis.moneda)}
        </KpiCard>
        <KpiCard titulo={TEXTOS_FICHA.retencionesAnio}>
          {formatMoneyCentavos(kpis.retencionesAnioCentavos, kpis.moneda)}
        </KpiCard>
        <KpiCard titulo={TEXTOS_FICHA.inversionesVigentes}>
          {kpis.inversionesVigentes}
        </KpiCard>
        <KpiCard titulo={TEXTOS_FICHA.proximoVencimiento}>
          {prox ? (
            <span className="block text-lg leading-snug sm:text-xl">
              {formatFecha(prox.fecha)}
              <span className="mt-1 block font-bold">
                {formatMoneyCentavos(prox.montoCentavos, prox.monedaPago)}
              </span>
            </span>
          ) : (
            <span className="text-body-muted text-base font-medium">{TEXTOS_FICHA.sinProximo}</span>
          )}
        </KpiCard>
      </div>
    </section>
  )
}

function CalendarioCuotas({
  meses,
  mesActual,
  onVerInversion,
}: {
  meses: MesCalendario[]
  mesActual: string
  onVerInversion: (id: string) => void
}) {
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const m of meses) {
      // Mes actual abierto; meses pasados plegados; futuros abiertos.
      init[m.mes] = m.mes >= mesActual
    }
    return init
  })

  useEffect(() => {
    setAbiertos((prev) => {
      const next = { ...prev }
      for (const m of meses) {
        if (next[m.mes] === undefined) next[m.mes] = m.mes >= mesActual
      }
      return next
    })
  }, [meses, mesActual])

  if (meses.length === 0) {
    return <p className="text-body-muted text-base">{TEXTOS_FICHA.calendarioVacio}</p>
  }

  return (
    <ul className="space-y-3">
      {meses.map((m) => {
        const abierto = abiertos[m.mes] ?? m.mes >= mesActual
        const esActual = m.mes === mesActual
        return (
          <li
            key={m.mes}
            className={`rounded-2xl border ${
              esActual
                ? 'border-brand-primary/50 bg-brand-primary/5 dark:border-brand-primary/40 dark:bg-brand-primary/10'
                : 'border-neutral-200 dark:border-zinc-800'
            }`}
          >
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              onClick={() => setAbiertos((prev) => ({ ...prev, [m.mes]: !abierto }))}
              aria-expanded={abierto}
            >
              <span className={`text-base font-semibold sm:text-lg ${esActual ? 'text-heading' : 'text-heading'}`}>
                {m.etiqueta}
                {esActual ? (
                  <span className="text-body-muted ml-2 text-base font-medium">(mes actual)</span>
                ) : null}
              </span>
              <span className="text-body-muted text-base">{abierto ? 'Ocultar' : 'Mostrar'}</span>
            </button>
            {abierto ? (
              <div className="overflow-x-auto border-t border-neutral-200 dark:border-zinc-800">
                <table className="min-w-full text-base">
                  <thead className="bg-neutral-50 dark:bg-zinc-950/80">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">{TEXTOS_FICHA.colFecha}</th>
                      <th className="px-4 py-3 text-left font-medium">{TEXTOS_FICHA.colInversion}</th>
                      <th className="px-4 py-3 text-right font-medium">{TEXTOS_FICHA.colMontoNeto}</th>
                      <th className="px-4 py-3 text-left font-medium">{TEXTOS_FICHA.colEstado}</th>
                      <th className="px-4 py-3 text-left font-medium"> </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800">
                    {m.cuotas.map((c) => (
                      <tr key={`${c.inversionId}-c${c.cuotaNumero}`}>
                        <td className="px-4 py-3 tabular-nums">{formatFecha(c.fecha)}</td>
                        <td className="px-4 py-3 font-medium">{c.inversionNumero}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatMoneyCentavos(c.montoNetoCentavos, c.monedaPago)}
                        </td>
                        <td className={`px-4 py-3 ${claseEstadoCuota(c.estado)}`}>
                          {TEXTO_ESTADO_CUOTA_CALENDARIO[c.estado]}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => onVerInversion(c.inversionId)}
                            className="rounded-xl border border-neutral-200 px-3 py-2 text-base font-medium hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                          >
                            {TEXTOS_FICHA.verInversion}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function VistaCuenta({
  inversorId,
  onClose,
  onEditarDatos,
}: {
  inversorId: string
  onClose: () => void
  onEditarDatos: () => void
}) {
  const navigate = useNavigate()
  const hoy = hoyArgentina()
  const mesActual = mesDeHoy(hoy)

  const { data: ficha, isLoading, isError, error } = useQuery({
    queryKey: ['finanzas', 'inversiones', 'inversor', inversorId],
    queryFn: () => fetchInversor(inversorId),
  })

  const vigentesIds = useMemo(
    () => (ficha?.inversiones ?? []).filter((i) => i.estado === 'vigente').map((i) => i.id),
    [ficha],
  )

  const detallesQueries = useQueries({
    queries: vigentesIds.map((id) => ({
      queryKey: ['finanzas', 'inversiones', id],
      queryFn: () => fetchInversion(id),
      enabled: Boolean(ficha),
    })),
  })

  const cargandoDetalles = detallesQueries.some((q) => q.isLoading)
  const errorDetalle = detallesQueries.find((q) => q.isError)?.error
  const detallesListos =
    vigentesIds.length === 0 || detallesQueries.every((q) => q.isSuccess && q.data)

  let cuenta = null
  if (ficha && detallesListos) {
    const detalles = detallesQueries
      .map((q) => q.data)
      .filter((d): d is InversionDetalle => Boolean(d))
    if (detalles.length === vigentesIds.length) {
      cuenta = cuentaInversor(detalles.map(detalleAInversionParaCuenta), hoy)
    }
  }

  const verInversion = (id: string) => {
    onClose()
    navigate(`/finanzas/inversiones/${id}`)
  }

  const contacto: string[] = []
  if (ficha?.email) contacto.push(ficha.email)
  if (ficha?.telefono) contacto.push(ficha.telefono)
  if (ficha?.domicilio) contacto.push(ficha.domicilio)

  return (
    <>
      {isLoading || (ficha && vigentesIds.length > 0 && cargandoDetalles && !cuenta) ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 py-10">
          <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />
          <p className="text-body-muted text-base">{TEXTOS_FICHA.cargando}</p>
        </div>
      ) : isError || !ficha ? (
        <p className="text-danger py-8 text-base">
          {error instanceof Error ? error.message : 'No pude traer la ficha'}
        </p>
      ) : errorDetalle ? (
        <p className="text-danger py-8 text-base">
          {errorDetalle instanceof Error ? errorDetalle.message : 'No pude traer las inversiones'}
        </p>
      ) : (
        <div className="space-y-8 pr-6">
          <header className="space-y-2">
            <p className="text-body-muted text-base font-medium">{TEXTOS_FICHA.tituloCuenta}</p>
            <h2 id="ficha-inversor-cuenta-titulo" className="text-heading text-2xl font-bold sm:text-3xl">
              {ficha.nombre}
            </h2>
            <div className="text-base leading-relaxed sm:text-[17px]">
              {ficha.cuit ? (
                <p>
                  <span className="text-body-muted">CUIT: </span>
                  <span className="tabular-nums">{ficha.cuit}</span>
                </p>
              ) : ficha.dni ? (
                <p>
                  <span className="text-body-muted">DNI: </span>
                  <span className="tabular-nums">{ficha.dni}</span>
                </p>
              ) : null}
              {contacto.length > 0 ? (
                <ul className="text-body mt-1 space-y-0.5">
                  {contacto.map((linea) => (
                    <li key={linea}>{linea}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-body-muted mt-1">{TEXTOS_FICHA.sinContacto}</p>
              )}
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={onEditarDatos}
                className="rounded-xl border border-neutral-200 px-4 py-2.5 text-base font-medium hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {TEXTOS_FICHA.editarDatos}
              </button>
            </div>
          </header>

          {cuenta ? (
            <>
              <div className="space-y-6">
                {cuenta.kpisPorMoneda.map((k) => (
                  <FilaKpisMoneda
                    key={k.moneda}
                    kpis={k}
                    tituloFila={k.moneda === 'ARS' ? TEXTOS_FICHA.kpisEnPesos : TEXTOS_FICHA.kpisEnDolares}
                  />
                ))}
                {cuenta.kpisPorMoneda.length === 0 ? (
                  <p className="text-body-muted text-base">No hay inversiones vigentes para mostrar resumen.</p>
                ) : null}
              </div>

              <section className="space-y-3">
                <h3 className="text-heading text-lg font-semibold sm:text-xl">
                  {TEXTOS_FICHA.calendarioTitulo}
                </h3>
                <CalendarioCuotas
                  meses={cuenta.calendario}
                  mesActual={mesActual}
                  onVerInversion={verInversion}
                />
              </section>

              <section className="space-y-3">
                <h3 className="text-heading text-lg font-semibold sm:text-xl">
                  {TEXTOS_FICHA.inversionesTitulo}
                </h3>
                {cuenta.inversionesVigentes.length === 0 ? (
                  <p className="text-body-muted text-base">{TEXTOS_FICHA.inversionesVacio}</p>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-zinc-800">
                    <table className="min-w-full text-base">
                      <thead className="bg-neutral-50 dark:bg-zinc-950/80">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">Inversión</th>
                          <th className="px-4 py-3 text-left font-medium">{TEXTOS_FICHA.colEstadoInv}</th>
                          <th className="px-4 py-3 text-right font-medium">{TEXTOS_FICHA.colCapital}</th>
                          <th className="px-4 py-3 text-left font-medium">{TEXTOS_FICHA.colTasa}</th>
                          <th className="px-4 py-3 text-left font-medium">{TEXTOS_FICHA.colVencimiento}</th>
                          <th className="px-4 py-3 text-left font-medium"> </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800">
                        {cuenta.inversionesVigentes.map((inv) => (
                          <tr key={inv.id}>
                            <td className="px-4 py-3 font-medium">{inv.numero}</td>
                            <td className="px-4 py-3">{textoEstado('vigente')}</td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {formatMoneyCentavos(inv.capitalCentavos, inv.moneda)}
                            </td>
                            <td className="px-4 py-3">{inv.tasaTexto ?? '—'}</td>
                            <td className="px-4 py-3">{formatFecha(inv.fechaFinal)}</td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => verInversion(inv.id)}
                                className="rounded-xl border border-neutral-200 px-3 py-2 text-base font-medium hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                              >
                                {TEXTOS_FICHA.verInversion}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          ) : null}
        </div>
      )}
    </>
  )
}

type Props =
  | { modo: 'nuevo'; onClose: () => void; onGuardado: () => void }
  | { modo: 'editar'; inversorId: string; onClose: () => void; onGuardado: () => void }
  | { modo: 'cuenta'; inversorId: string; onClose: () => void; onGuardado: () => void }

export function FichaInversorModal(props: Props) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(VACIO)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [cambiandoEstado, setCambiandoEstado] = useState(false)
  const [editandoDesdeCuenta, setEditandoDesdeCuenta] = useState(false)

  const esFormulario =
    props.modo === 'nuevo' || props.modo === 'editar' || (props.modo === 'cuenta' && editandoDesdeCuenta)
  const idEdicion =
    props.modo === 'editar' || props.modo === 'cuenta' ? props.inversorId : null

  const { data: ficha, isLoading, isError, error: errorFicha } = useQuery({
    queryKey: ['finanzas', 'inversiones', 'inversor', idEdicion],
    queryFn: () => fetchInversor(idEdicion!),
    enabled: Boolean(idEdicion) && esFormulario && props.modo !== 'nuevo',
  })

  useEffect(() => {
    if (props.modo === 'nuevo') {
      setForm(VACIO)
      setError(null)
      return
    }
    if (ficha && esFormulario) {
      setForm(aForm(ficha))
      setError(null)
    }
  }, [props.modo, ficha, esFormulario])

  if (props.modo === 'cuenta' && !editandoDesdeCuenta) {
    return (
      <PopupGrande onCerrar={props.onClose} ariaLabelledBy="ficha-inversor-cuenta-titulo">
        <VistaCuenta
          inversorId={props.inversorId}
          onClose={props.onClose}
          onEditarDatos={() => setEditandoDesdeCuenta(true)}
        />
      </PopupGrande>
    )
  }

  const set = <K extends keyof FormState>(clave: K, valor: FormState[K]) => {
    setForm((prev) => ({ ...prev, [clave]: valor }))
  }

  const guardar = async () => {
    setError(null)
    if (!form.nombre.trim()) {
      setError('El nombre es obligatorio.')
      return
    }
    setGuardando(true)
    try {
      const datos = aDatos(form)
      if (props.modo === 'nuevo') {
        await crearInversor(datos)
      } else {
        await editarInversor(props.inversorId, datos)
        void queryClient.invalidateQueries({
          queryKey: ['finanzas', 'inversiones', 'inversor', props.inversorId],
        })
      }
      props.onGuardado()
      if (props.modo === 'cuenta') {
        setEditandoDesdeCuenta(false)
      } else {
        props.onClose()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude guardar')
    } finally {
      setGuardando(false)
    }
  }

  const cambiarEstado = async () => {
    if (!idEdicion || !ficha) return
    const nuevo = ficha.estado === 'activo' ? 'inactivo' : 'activo'
    const ok = window.confirm(
      nuevo === 'inactivo'
        ? `¿Dar de baja a ${ficha.nombre}? No se borra: queda inactivo.`
        : `¿Reactivar a ${ficha.nombre}?`,
    )
    if (!ok) return
    setError(null)
    setCambiandoEstado(true)
    try {
      await cambiarEstadoInversor(idEdicion, nuevo)
      void queryClient.invalidateQueries({
        queryKey: ['finanzas', 'inversiones', 'inversor', idEdicion],
      })
      props.onGuardado()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude cambiar el estado')
    } finally {
      setCambiandoEstado(false)
    }
  }

  const titulo =
    props.modo === 'nuevo' ? 'Nuevo inversor' : ficha ? ficha.nombre : 'Ficha del inversor'

  const cerrarFormulario = () => {
    if (props.modo === 'cuenta') setEditandoDesdeCuenta(false)
    else props.onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ficha-inversor-titulo"
        className="surface-card max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-neutral-200 p-5 shadow-xl dark:border-zinc-700 sm:p-6"
      >
        <h2 id="ficha-inversor-titulo" className="text-heading text-lg font-semibold">
          {titulo}
        </h2>
        <p className="text-body-muted mt-2 text-base">
          Datos personales (Ley 25.326): usalos solo para gestionar la inversión.
        </p>

        {props.modo !== 'nuevo' && isLoading ? (
          <div className="flex min-h-[20vh] items-center justify-center py-8">
            <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />
          </div>
        ) : props.modo !== 'nuevo' && isError ? (
          <p className="text-danger mt-4 text-sm">
            {errorFicha instanceof Error ? errorFicha.message : 'No pude traer la ficha'}
          </p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FinanzasFormField label="Nombre" htmlFor="inv-nombre">
                  <input
                    id="inv-nombre"
                    type="text"
                    value={form.nombre}
                    onChange={(e) => set('nombre', e.target.value)}
                    className={finanzasInputClass}
                    autoComplete="name"
                  />
                </FinanzasFormField>
              </div>
              <FinanzasFormField label="Tipo de persona" htmlFor="inv-tipo" optional>
                <select
                  id="inv-tipo"
                  value={form.tipoPersona}
                  onChange={(e) => set('tipoPersona', e.target.value as FormState['tipoPersona'])}
                  className={finanzasInputClass}
                >
                  <option value="">Sin especificar</option>
                  <option value="humana">Persona humana</option>
                  <option value="juridica">Persona jurídica</option>
                </select>
              </FinanzasFormField>
              <FinanzasFormField label="CUIT" htmlFor="inv-cuit" optional>
                <input
                  id="inv-cuit"
                  type="text"
                  value={form.cuit}
                  onChange={(e) => set('cuit', e.target.value)}
                  placeholder="Ej.: 20-12345678-9"
                  className={finanzasInputClass}
                />
              </FinanzasFormField>
              <FinanzasFormField label="DNI" htmlFor="inv-dni" optional>
                <input
                  id="inv-dni"
                  type="text"
                  value={form.dni}
                  onChange={(e) => set('dni', e.target.value)}
                  placeholder="Ej.: 30123456"
                  className={finanzasInputClass}
                />
              </FinanzasFormField>
              <FinanzasFormField label="Email" htmlFor="inv-email" optional>
                <input
                  id="inv-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="Ej.: nombre@correo.com"
                  className={finanzasInputClass}
                />
              </FinanzasFormField>
              <FinanzasFormField label="Teléfono" htmlFor="inv-tel" optional>
                <input
                  id="inv-tel"
                  type="tel"
                  value={form.telefono}
                  onChange={(e) => set('telefono', e.target.value)}
                  placeholder="Ej.: 11 1234-5678"
                  className={finanzasInputClass}
                />
              </FinanzasFormField>
              <div className="sm:col-span-2">
                <FinanzasFormField label="Domicilio" htmlFor="inv-domicilio" optional>
                  <input
                    id="inv-domicilio"
                    type="text"
                    value={form.domicilio}
                    onChange={(e) => set('domicilio', e.target.value)}
                    className={finanzasInputClass}
                  />
                </FinanzasFormField>
              </div>
              <FinanzasFormField label="CBU en pesos" htmlFor="inv-cbu" optional>
                <input
                  id="inv-cbu"
                  type="text"
                  value={form.cbuArs}
                  onChange={(e) => set('cbuArs', e.target.value)}
                  placeholder="Ej.: 22 dígitos"
                  className={finanzasInputClass}
                />
              </FinanzasFormField>
              <FinanzasFormField label="Cuenta en dólares" htmlFor="inv-usd" optional>
                <input
                  id="inv-usd"
                  type="text"
                  value={form.cuentaUsd}
                  onChange={(e) => set('cuentaUsd', e.target.value)}
                  className={finanzasInputClass}
                />
              </FinanzasFormField>
              <FinanzasFormField label="Inscripto en Ganancias" htmlFor="inv-ganancias" optional>
                <select
                  id="inv-ganancias"
                  value={form.inscriptoGanancias}
                  onChange={(e) =>
                    set('inscriptoGanancias', e.target.value as FormState['inscriptoGanancias'])
                  }
                  className={finanzasInputClass}
                >
                  <option value="">No sé</option>
                  <option value="si">Sí</option>
                  <option value="no">No</option>
                </select>
              </FinanzasFormField>
              <div className="sm:col-span-2">
                <FinanzasFormField label="Observaciones" htmlFor="inv-obs" optional>
                  <textarea
                    id="inv-obs"
                    value={form.observaciones}
                    onChange={(e) => set('observaciones', e.target.value)}
                    rows={2}
                    className={finanzasInputClass}
                  />
                </FinanzasFormField>
              </div>
            </div>

            {error ? <p className="text-danger mt-4 text-sm">{error}</p> : null}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              {idEdicion && ficha ? (
                <button
                  type="button"
                  onClick={() => void cambiarEstado()}
                  disabled={cambiandoEstado || guardando}
                  className="mr-auto rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  {cambiandoEstado
                    ? 'Guardando…'
                    : ficha.estado === 'activo'
                      ? 'Dar de baja'
                      : 'Reactivar'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={cerrarFormulario}
                disabled={guardando}
                className="rounded-xl px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-gray-200 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void guardar()}
                disabled={guardando || cambiandoEstado}
                className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
