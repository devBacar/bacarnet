import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  cambiarEstadoInversor,
  crearInversor,
  editarInversor,
  fetchInversor,
  type InversorDatos,
  type TipoPersona,
} from '../../../services/finanzasInversionesApi'
import { FinanzasFormField, finanzasInputClass } from '../FinanzasFormField'
import { formatMoneyCentavos } from '../formatMoney'
import { textoEstado } from './textosInversiones'

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

type Props =
  | { modo: 'nuevo'; onClose: () => void; onGuardado: () => void }
  | { modo: 'editar'; inversorId: string; onClose: () => void; onGuardado: () => void }

export function FichaInversorModal(props: Props) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(VACIO)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [cambiandoEstado, setCambiandoEstado] = useState(false)

  const id = props.modo === 'editar' ? props.inversorId : null
  const { data: ficha, isLoading, isError, error: errorFicha } = useQuery({
    queryKey: ['finanzas', 'inversiones', 'inversor', id],
    queryFn: () => fetchInversor(id!),
    enabled: props.modo === 'editar' && Boolean(id),
  })

  useEffect(() => {
    if (props.modo === 'nuevo') {
      setForm(VACIO)
      setError(null)
      return
    }
    if (ficha) {
      setForm(aForm(ficha))
      setError(null)
    }
  }, [props.modo, ficha])

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
      props.onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude guardar')
    } finally {
      setGuardando(false)
    }
  }

  const cambiarEstado = async () => {
    if (props.modo !== 'editar' || !ficha) return
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
      await cambiarEstadoInversor(props.inversorId, nuevo)
      void queryClient.invalidateQueries({
        queryKey: ['finanzas', 'inversiones', 'inversor', props.inversorId],
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
        <p className="text-body-muted mt-2 text-xs">
          Datos personales (Ley 25.326): usalos solo para gestionar la inversión.
        </p>

        {props.modo === 'editar' && isLoading ? (
          <div className="flex min-h-[20vh] items-center justify-center py-8">
            <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />
          </div>
        ) : props.modo === 'editar' && isError ? (
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

            {props.modo === 'editar' && ficha ? (
              <section className="mt-6">
                <h3 className="text-heading text-sm font-semibold">Inversiones</h3>
                {ficha.inversiones.length === 0 ? (
                  <p className="text-body-muted mt-2 text-sm">Todavía no tiene inversiones.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-zinc-800 dark:border-zinc-800">
                    {ficha.inversiones.map((inv) => (
                      <li key={inv.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm">
                        <Link
                          to={`/finanzas/inversiones/${inv.id}`}
                          className="font-medium text-brand-primary hover:underline"
                          onClick={props.onClose}
                        >
                          {inv.numero}
                        </Link>
                        <span className="text-body-muted">{textoEstado(inv.estado)}</span>
                        <span className="tabular-nums">
                          {formatMoneyCentavos(inv.capitalCentavos, inv.moneda)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}

            {error ? <p className="text-danger mt-4 text-sm">{error}</p> : null}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              {props.modo === 'editar' && ficha ? (
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
                onClick={props.onClose}
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
