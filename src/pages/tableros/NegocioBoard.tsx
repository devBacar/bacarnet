import { useQuery } from '@tanstack/react-query'
import { BriefcaseBusiness, Building2, ChartLine, LayoutDashboard, Landmark, ListChecks, Tag, TrendingUp, Wallet } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import '../../components/tableros/negocio/negocio.css'
import { crearModelo } from '../../components/tableros/negocio/domain/modelo'
import { mesCorto, mesLargo, pct } from '../../components/tableros/negocio/domain/formato'
import { SeccionEvolucion } from '../../components/tableros/negocio/SeccionEvolucion'
import { SeccionFinanciero } from '../../components/tableros/negocio/SeccionFinanciero'
import { SeccionGastos } from '../../components/tableros/negocio/SeccionGastos'
import { SeccionNegocios } from '../../components/tableros/negocio/SeccionNegocios'
import { SeccionPlan } from '../../components/tableros/negocio/SeccionPlan'
import { SeccionProveedores } from '../../components/tableros/negocio/SeccionProveedores'
import { SeccionResumen } from '../../components/tableros/negocio/SeccionResumen'
import { SeccionTarifas } from '../../components/tableros/negocio/SeccionTarifas'
import { SeccionVentas } from '../../components/tableros/negocio/SeccionVentas'
import type { SeccionId } from '../../components/tableros/negocio/tipos'
import { fetchDatosTableroNegocio, type RespuestaTableroNegocio } from '../../services/tableroNegocioApi'

const SECCIONES: Array<[SeccionId, string, string, ReactNode]> = [
  ['resumen', 'Resumen', 'lo más importante', <LayoutDashboard key="i" className="h-6 w-6" aria-hidden />],
  ['ventas', 'Ventas y cobranzas', 'facturado y cobrado', <TrendingUp key="i" className="h-6 w-6" aria-hidden />],
  ['tarifas', 'Tarifas', 'precios por negocio y cliente', <Tag key="i" className="h-6 w-6" aria-hidden />],
  ['negocios', 'Negocios', 'qué línea gana plata', <BriefcaseBusiness key="i" className="h-6 w-6" aria-hidden />],
  ['gastos', 'A dónde va la plata', 'rubros y cuentas', <Wallet key="i" className="h-6 w-6" aria-hidden />],
  ['proveedores', 'Compras y proveedores', 'a quién le pagamos', <Building2 key="i" className="h-6 w-6" aria-hidden />],
  ['financiero', 'Bancos e impuestos', 'intereses, deudas', <Landmark key="i" className="h-6 w-6" aria-hidden />],
  ['plan', 'Plan de acción', 'qué hacer, 3 niveles', <ListChecks key="i" className="h-6 w-6" aria-hidden />],
  ['evolucion', 'Evolución', 'mes a mes', <ChartLine key="i" className="h-6 w-6" aria-hidden />],
]

function seccionInicial(): SeccionId {
  try {
    const h = window.location.hash.slice(1)
    if (SECCIONES.some((s) => s[0] === h)) return h as SeccionId
  } catch {
    /* sin hash */
  }
  return 'resumen'
}

function fechaCorta(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
}

function Tablero({ respuesta }: { respuesta: RespuestaTableroNegocio }) {
  const { datos, actualizado } = respuesta
  const modelo = useMemo(() => crearModelo(datos), [datos])
  const [seccion, setSeccion] = useState<SeccionId>(seccionInicial)
  const [periodo, setPeriodo] = useState('e26')
  const ms = modelo.mesesDe(periodo)
  const mb = modelo.mesesBase(ms)

  const ir = (s: SeccionId): void => {
    setSeccion(s)
    try {
      window.history.replaceState(null, '', `#${s}`)
    } catch {
      /* sin history */
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const txtPeriodo = `${ms.length} ${ms.length === 1 ? 'mes' : 'meses'}${
    mb.length ? ` · se compara con ${mb.length === 1 ? mesLargo(mb[0]) : `${mesCorto(mb[0])} a ${mesCorto(mb[mb.length - 1])}`}` : ''
  }`

  const contenido = (): ReactNode => {
    const props = { modelo, ms }
    switch (seccion) {
      case 'resumen':
        return <SeccionResumen {...props} onIr={ir} />
      case 'ventas':
        return <SeccionVentas {...props} />
      case 'tarifas':
        return <SeccionTarifas {...props} />
      case 'negocios':
        return <SeccionNegocios key={periodo} {...props} />
      case 'gastos':
        return <SeccionGastos key={periodo} {...props} />
      case 'proveedores':
        return <SeccionProveedores {...props} />
      case 'financiero':
        return <SeccionFinanciero {...props} />
      case 'plan':
        return <SeccionPlan {...props} />
      case 'evolucion':
        return <SeccionEvolucion {...props} />
    }
  }

  return (
    <>
      <nav className="secciones" role="tablist" aria-label="Secciones del tablero">
        {SECCIONES.map(([id, t, d, icono]) => (
          <button key={id} type="button" role="tab" aria-selected={id === seccion} onClick={() => ir(id)}>
            {icono}
            <span style={{ minWidth: 0 }}>
              <span className="sec-t">{t}</span>
              <span className="sec-d">{d}</span>
            </span>
          </button>
        ))}
      </nav>
      <div className="barra-periodo">
        <label className="ctrl" htmlFor="periodo-negocio">
          Período:{' '}
          <select
            id="periodo-negocio"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
          >
            {modelo.PERIODOS.map(([id, t]) => (
              <option key={id} value={id}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <span className="txt">{txtPeriodo}</span>
      </div>
      <main style={{ display: 'grid', gap: 20 }}>{contenido()}</main>
      <details className="fuente">
        <summary>De dónde salen los datos, qué se deja afuera y qué falta confirmar</summary>
        <div>
          <p>
            <strong>Facturado:</strong> facturas A, B y de crédito electrónica menos notas de crédito de Vientri (sin IVA y con IVA). Por negocio: cuentas
            contables de ingresos (seguridad privada 4119, tesorería tercerizada 411604, recaudación y traslados 4106/4102/4103/4107/4111/4112, grúas 4115).
          </p>
          <p>
            <strong>Cobrado:</strong> recibos de cobranza (incluye retenciones sufridas), por fecha del recibo.
          </p>
          <p>
            <strong>Gastado:</strong> asientos de las cuentas de egresos, sin depreciaciones, ganancias, previsiones ni ajuste por inflación. Sueldos:
            contabilidad de Vientri hasta mayo 2026
            {modelo.RRHH ? '; desde junio, costo laboral del Tablero de RRHH (Salario)' : '; desde junio faltan'}.
          </p>
          <p>
            <strong>Negocios:</strong> gastos directos por centro de costo (seguridad privada y planta; servicios de tesorería; protección de valores y
            tesorería; grúas). El resto es estructura y se reparte según lo facturado. Falta confirmar con contaduría que el centro "Tesorería" es de caudales.
          </p>
          <p>
            <strong>Inflación de referencia:</strong> {pct(modelo.INF)} interanual (INDEC 2026).
          </p>
          <p>Datos al {fechaCorta(actualizado)}.</p>
        </div>
      </details>
    </>
  )
}

export function NegocioBoard() {
  const consulta = useQuery({
    queryKey: ['tablero-negocio', 'datos'],
    queryFn: fetchDatosTableroNegocio,
    staleTime: 5 * 60_000,
    retry: false,
  })
  const respuesta = consulta.data
  const fecha = respuesta ? fechaCorta(respuesta.actualizado) : ''

  return (
    <div className="tn mx-auto grid w-full min-w-0 max-w-6xl gap-5 px-4 py-6 sm:px-6">
      <header className="min-w-0">
        <Link to="/tableros" className="mb-1 inline-flex items-center gap-1 text-[13px] font-medium text-neutral-600 hover:text-[var(--color-primary)] dark:text-gray-400">
          ← Tableros
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-neutral-900 dark:text-gray-100">
          <Landmark className="h-6 w-6 shrink-0 text-[var(--color-primary)]" aria-hidden />
          Finanzas – Negocio
        </h1>
        <p className="mt-1 text-[13px] text-neutral-600 dark:text-gray-400">
          Facturado, cobrado, gastado y resultado de cada negocio.
          {fecha ? <span className="block">Datos al {fecha}.</span> : null}
        </p>
      </header>
      {consulta.isPending ? <p className="text-body-muted text-[14px]">Cargando el tablero…</p> : null}
      {consulta.isError ? (
        <p role="alert" className="text-[14px] text-red-700 dark:text-red-400">
          {consulta.error instanceof Error ? consulta.error.message : 'No se pudo cargar el tablero.'}
        </p>
      ) : null}
      {respuesta ? <Tablero respuesta={respuesta} /> : null}
    </div>
  )
}
