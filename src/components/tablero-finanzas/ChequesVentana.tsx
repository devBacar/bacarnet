import { useState } from 'react'
import type { ChequeVentana, TableroFinanzas } from '../../services/finanzasTableroApi'
import { diaMes, fechaCorta, plata } from './formatoTablero'
import { TarjetaTablero } from './TarjetaTablero'

const FILAS = 25

const CLASE_FILTRO =
  'w-full min-w-0 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-[14px] font-normal text-neutral-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100'

function textoForma(forma: ChequeVentana['forma']): string {
  if (forma === 'echeq') return 'eCheq'
  if (forma === 'fisico') return 'Físico'
  return '—'
}

function textoTipo(tipo: ChequeVentana['tipo']): string {
  return tipo === 'a_debitar' ? 'A debitar' : 'A cobrar'
}

function centavosDePesos(texto: string): number {
  const valor = Number(texto.replace(',', '.'))
  if (!texto.trim() || !Number.isFinite(valor) || valor <= 0) return 0
  return Math.round(valor * 100)
}

function FechaCheque({ cheque }: { cheque: ChequeVentana }) {
  return (
    <span className="block">
      <span className="tabular-nums">{fechaCorta(cheque.fechaEfectiva)}</span>
      {cheque.tipo === 'a_cobrar' ? <span className="block text-[12px] text-neutral-500 dark:text-gray-400">acreditación estimada</span> : null}
    </span>
  )
}

function ResumenNumero({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-neutral-50 px-3 py-2 dark:bg-zinc-800">
      <p className="text-[13px] text-neutral-600 dark:text-gray-400">{titulo}</p>
      <p className="break-words text-[18px] font-semibold tabular-nums text-neutral-900 dark:text-gray-100">{valor}</p>
      {nota ? <p className="text-[12px] text-neutral-500 dark:text-gray-400">{nota}</p> : null}
    </div>
  )
}

export function ChequesVentana({ datos }: { datos: TableroFinanzas }) {
  const { proximos30: p, moneda, resumen } = datos
  const [tipo, setTipo] = useState<'todos' | 'a_debitar' | 'a_cobrar'>('todos')
  const [banco, setBanco] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [busca, setBusca] = useState('')
  const [minimo, setMinimo] = useState('')
  const [cuantos, setCuantos] = useState(FILAS)
  const firma = `${datos.mes}|${moneda}|${tipo}|${banco}|${desde}|${hasta}|${busca}|${minimo}`
  const [firmaVista, setFirmaVista] = useState(firma)
  if (firma !== firmaVista) {
    setFirmaVista(firma)
    setCuantos(FILAS)
  }

  const bancos = [...new Set(p.cheques.map((cheque) => cheque.banco))].sort((a, b) => a.localeCompare(b, 'es'))
  const fechaMin = p.desde
  const fechaMax = p.cheques.reduce((max, cheque) => (cheque.fechaEfectiva > max ? cheque.fechaEfectiva : max), p.hasta)
  const piso = centavosDePesos(minimo)
  const q = busca.trim().toLocaleLowerCase('es-AR')
  const filtrados = p.cheques.filter((cheque) => {
    if (tipo !== 'todos' && cheque.tipo !== tipo) return false
    if (banco && cheque.banco !== banco) return false
    if (desde && cheque.fechaEfectiva < desde) return false
    if (hasta && cheque.fechaEfectiva > hasta) return false
    if (piso > 0 && cheque.montoCentavos < piso) return false
    if (!q) return true
    return cheque.contraparte.toLocaleLowerCase('es-AR').includes(q) || cheque.numero.toLocaleLowerCase('es-AR').includes(q)
  })
  const visibles = filtrados.slice(0, cuantos)
  const debitar = filtrados.reduce((suma, cheque) => suma + (cheque.tipo === 'a_debitar' ? cheque.montoCentavos : 0), 0)
  const cobrar = filtrados.reduce((suma, cheque) => suma + (cheque.tipo === 'a_cobrar' ? cheque.montoCentavos : 0), 0)
  const enPesos = moneda === 'ARS'

  return (
    <TarjetaTablero
      titulo="Próximos 30 días"
      subtitulo={`Del ${fechaCorta(p.desde)} al ${fechaCorta(p.hasta)}. Cheques por debitar o cobrar, más lo cargado en la Agenda.`}
    >
      {enPesos ? null : (
        <p className="mb-4 text-[14px] text-neutral-600 dark:text-gray-400">
          Los cheques están en pesos. Acá se ven los compromisos y cobros en dólares.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        {enPesos ? (
          <ResumenNumero
            titulo="A debitar"
            valor={plata(p.totalADebitarCentavos, 'ARS')}
            nota="Cheques propios"
          />
        ) : null}
        {enPesos ? (
          <ResumenNumero
            titulo="A cobrar"
            valor={plata(p.totalACobrarCentavos, 'ARS')}
            nota="Cheques de terceros en cartera"
          />
        ) : null}
        <ResumenNumero
          titulo="Compromisos"
          valor={plata(p.compromisosCentavos, moneda)}
          nota={p.compromisosCantidad === 1 ? '1 de la Agenda' : `${p.compromisosCantidad} de la Agenda`}
        />
        <ResumenNumero
          titulo="Cobros"
          valor={plata(p.cobrosCentavos, moneda)}
          nota={p.cobrosCantidad === 1 ? '1 de la Agenda' : `${p.cobrosCantidad} de la Agenda`}
        />
        <ResumenNumero titulo="Saldo de hoy" valor={plata(resumen.saldoHoyCentavos, moneda)} />
        <ResumenNumero titulo="Saldo estimado" valor={plata(p.saldoEstimadoCentavos, moneda)} />
      </div>
      <p className="mt-2 text-[13px] leading-snug text-neutral-600 dark:text-gray-400">
        {enPesos
          ? 'Saldo de hoy + cheques a cobrar + cobros de la Agenda − cheques a debitar − compromisos.'
          : 'Saldo de hoy + cobros de la Agenda − compromisos. Los cheques no entran en dólares.'}
      </p>

      {enPesos ? (
        <div className="mt-4 grid gap-2">
          <h3 className="text-[14px] font-semibold text-neutral-800 dark:text-gray-200">Por semana</h3>
          <p className="text-[13px] text-neutral-600 dark:text-gray-400">El neto es lo que se acredita menos lo que se debita.</p>
          <ul className="grid gap-2">
            {p.porSemana.map((semana) => (
              <li
                key={semana.desde}
                className="grid min-w-0 gap-0.5 rounded-lg border border-neutral-100 px-3 py-2 text-[14px] sm:grid-cols-4 sm:items-baseline sm:gap-3 dark:border-zinc-800"
              >
                <span className="font-medium text-neutral-900 dark:text-gray-100">Semana del {diaMes(semana.desde)}</span>
                <span className="text-neutral-700 dark:text-gray-300">Debitan {plata(semana.debitarCentavos, 'ARS')}</span>
                <span className="text-neutral-700 dark:text-gray-300">Se acreditan {plata(semana.acreditarCentavos, 'ARS')}</span>
                <span
                  className={`tabular-nums ${
                    semana.netoCentavos > 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : semana.netoCentavos < 0
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-neutral-700 dark:text-gray-300'
                  }`}
                >
                  Neto {plata(semana.netoCentavos, 'ARS')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {enPesos ? (
        <div className="mt-5 grid gap-3">
          <h3 className="text-[14px] font-semibold text-neutral-800 dark:text-gray-200">Todos los cheques</h3>
          <p className="text-[13px] leading-snug text-neutral-600 dark:text-gray-400">
            La fecha de un cheque a cobrar es una acreditación estimada: el primer día hábil después del pago. La de un cheque propio es el día que se debita.
          </p>
          {p.cheques.length === 0 ? (
            <p className="text-[14px] text-neutral-700 dark:text-gray-300">No hay cheques en estos 30 días.</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="grid min-w-0 gap-1 text-[13px] font-semibold text-neutral-600 dark:text-gray-400">
                  Tipo
                  <select value={tipo} onChange={(e) => setTipo(e.target.value === 'a_debitar' || e.target.value === 'a_cobrar' ? e.target.value : 'todos')} className={CLASE_FILTRO}>
                    <option value="todos">Todos</option>
                    <option value="a_debitar">A debitar</option>
                    <option value="a_cobrar">A cobrar</option>
                  </select>
                </label>
                <label className="grid min-w-0 gap-1 text-[13px] font-semibold text-neutral-600 dark:text-gray-400">
                  Banco
                  <select value={banco} onChange={(e) => setBanco(e.target.value)} className={CLASE_FILTRO}>
                    <option value="">Todos</option>
                    {bancos.map((nombre) => (
                      <option key={nombre} value={nombre}>
                        {nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid min-w-0 gap-1 text-[13px] font-semibold text-neutral-600 dark:text-gray-400">
                  Desde
                  <input type="date" value={desde} min={fechaMin} max={fechaMax} onChange={(e) => setDesde(e.target.value)} className={CLASE_FILTRO} />
                </label>
                <label className="grid min-w-0 gap-1 text-[13px] font-semibold text-neutral-600 dark:text-gray-400">
                  Hasta
                  <input type="date" value={hasta} min={fechaMin} max={fechaMax} onChange={(e) => setHasta(e.target.value)} className={CLASE_FILTRO} />
                </label>
                <label className="grid min-w-0 gap-1 text-[13px] font-semibold text-neutral-600 dark:text-gray-400">
                  Nombre o número
                  <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Beneficiario, librador o número" className={CLASE_FILTRO} />
                </label>
                <label className="grid min-w-0 gap-1 text-[13px] font-semibold text-neutral-600 dark:text-gray-400">
                  Monto mínimo
                  <input value={minimo} onChange={(e) => setMinimo(e.target.value)} inputMode="decimal" placeholder="En pesos" className={CLASE_FILTRO} />
                </label>
              </div>

              {filtrados.length === 0 ? (
                <p className="text-[14px] text-neutral-700 dark:text-gray-300">Ningún cheque coincide con el filtro.</p>
              ) : (
                <>
                  <ul className="grid gap-2 md:hidden">
                    {visibles.map((cheque) => (
                      <li key={cheque.id} className="grid gap-1 rounded-lg border border-neutral-200 p-3 text-[14px] dark:border-zinc-700">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="font-medium text-neutral-900 dark:text-gray-100">{textoTipo(cheque.tipo)}</span>
                          <span className="shrink-0 tabular-nums text-neutral-900 dark:text-gray-100">{plata(cheque.montoCentavos, 'ARS')}</span>
                        </span>
                        <FechaCheque cheque={cheque} />
                        <span className="text-neutral-700 dark:text-gray-300">{cheque.banco}</span>
                        <span className="text-neutral-800 dark:text-gray-200">{cheque.contraparte}</span>
                        <span className="text-[13px] text-neutral-500 dark:text-gray-400">
                          Nº {cheque.numero || '—'} · {textoForma(cheque.forma)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="hidden min-w-0 md:block">
                    <table className="w-full border-collapse text-left text-[14px]">
                      <thead>
                        <tr className="border-b border-neutral-200 text-[12px] text-neutral-600 dark:border-zinc-700 dark:text-gray-400">
                          <th className="py-2 pr-2 font-semibold">Fecha de débito o de acreditación</th>
                          <th className="py-2 pr-2 font-semibold">Tipo</th>
                          <th className="py-2 pr-2 font-semibold">Banco</th>
                          <th className="py-2 pr-2 font-semibold">A quién va / De quién viene</th>
                          <th className="py-2 pr-2 font-semibold">Número de cheque</th>
                          <th className="py-2 pr-2 font-semibold">Físico o eCheq</th>
                          <th className="py-2 text-right font-semibold">Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibles.map((cheque) => (
                          <tr key={cheque.id} className="border-b border-neutral-100 align-top dark:border-zinc-800">
                            <td className="py-2 pr-2">
                              <FechaCheque cheque={cheque} />
                            </td>
                            <td className="py-2 pr-2 text-neutral-800 dark:text-gray-200">{textoTipo(cheque.tipo)}</td>
                            <td className="py-2 pr-2 text-neutral-800 dark:text-gray-200">{cheque.banco}</td>
                            <td className="py-2 pr-2 text-neutral-800 dark:text-gray-200">{cheque.contraparte}</td>
                            <td className="py-2 pr-2 tabular-nums text-neutral-800 dark:text-gray-200">{cheque.numero || '—'}</td>
                            <td className="py-2 pr-2 text-neutral-800 dark:text-gray-200">{textoForma(cheque.forma)}</td>
                            <td className="py-2 text-right tabular-nums text-neutral-900 dark:text-gray-100">{plata(cheque.montoCentavos, 'ARS')}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="text-[14px] font-medium text-neutral-900 dark:text-gray-100">
                          <td className="py-2 pr-2" colSpan={6}>
                            {filtrados.length === 1 ? '1 cheque' : `${filtrados.length} cheques`} · a debitar {plata(debitar, 'ARS')} · a cobrar {plata(cobrar, 'ARS')}
                          </td>
                          <td className="py-2 text-right tabular-nums">Neto {plata(cobrar - debitar, 'ARS')}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <p className="text-[13px] text-neutral-600 md:hidden dark:text-gray-400">
                    {filtrados.length === 1 ? '1 cheque' : `${filtrados.length} cheques`} · a debitar {plata(debitar, 'ARS')} · a cobrar {plata(cobrar, 'ARS')}
                  </p>
                  {cuantos < filtrados.length ? (
                    <button
                      type="button"
                      onClick={() => setCuantos((actual) => actual + FILAS)}
                      className="justify-self-start rounded-md border border-neutral-300 px-3 py-1.5 text-[14px] font-medium text-neutral-800 hover:bg-neutral-50 dark:border-zinc-600 dark:text-gray-200 dark:hover:bg-zinc-800"
                    >
                      Ver más ({filtrados.length - cuantos} restantes)
                    </button>
                  ) : null}
                </>
              )}
            </>
          )}
        </div>
      ) : null}
    </TarjetaTablero>
  )
}
