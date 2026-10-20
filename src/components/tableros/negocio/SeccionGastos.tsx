import { useState } from 'react'
import { agrupar, ordenar } from './domain/modelo'
import { M, pct, signo, suma, tit } from './domain/formato'
import type { PropsSeccion } from './tipos'
import { Ayuda, Aviso, Banda, Chip, ChipVar, TablaSimple, Tarjeta } from './ui'

const EXCLUIR_INVERSIONES = /Prestamos|Ganancias|Intereses A Devengar|Resultados Acumulados|Aportes Gremiales|Ret\.|Credito Impuesto/i

export function SeccionGastos({ modelo, ms }: PropsSeccion) {
  const { D, INF, mesesBase, costosDe, provDe, textoAvisoSueldos } = modelo
  const [catAbierta, setCatAbierta] = useState<string | null>(null)
  const mb = mesesBase(ms)
  const rows = costosDe(ms)
  const rowsB = costosDe(mb)
  const total = suma(rows, (r) => r.imp)
  const pc = agrupar(rows, 'cat')
  const pcb = agrupar(rowsB, 'cat')
  const filas = ordenar(pc).filter(([, v]) => v > 0)
  const max = filas[0]?.[1] || 1
  const pv = provDe(ms)
  const avisoSueldos = textoAvisoSueldos(ms)
  const porCc = ordenar(agrupar(rows, 'cc')).slice(0, 14)
  const porCcB = agrupar(rowsB, 'cc')

  const detalleCategoria = (c: string) => {
    const cts = ordenar(agrupar(rows.filter((r) => r.cat === c), 'cuenta'))
    const ctb = agrupar(rowsB.filter((r) => r.cat === c), 'cuenta')
    return (
      <div className="detalle">
        <TablaSimple
          cab={['Cuenta', { t: 'Período', r: true }, { t: 'Año anterior', r: true }, 'Variación', 'Proveedores principales', 'Áreas']}
          filas={cts
            .filter(([, x]) => Math.abs(x) > 0.5e6)
            .map(([cu, x]) => {
              const pr = ordenar(agrupar(pv.filter((p) => p.cuenta === cu), 'prov'))
              const nprov = pr.filter(([, y]) => y > 0).length
              const ar = ordenar(agrupar(rows.filter((r) => r.cuenta === cu), 'cc')).slice(0, 2)
              return (
                <tr key={cu}>
                  <td>
                    {tit(cu)}
                    {cu === 'INSUMOS Y SERVICIOS INFORMATICOS' ? (
                      <>
                        {' '}
                        <Chip tono="ambar">inversión: oficina nueva</Chip>
                      </>
                    ) : null}
                  </td>
                  <td className="r num">{M(x)}</td>
                  <td className="r num">{M(ctb[cu] || 0)}</td>
                  <td>
                    <ChipVar a={x} b={ctb[cu] || 0} inf={INF} />
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {pr.length ? (
                      <>
                        {pr.slice(0, 3).map(([n, y], i) => (
                          <span key={n}>
                            {i > 0 ? <br /> : null}
                            {tit(n)}{' '}
                            <span className="num" style={{ color: 'var(--muted)' }}>
                              {M(y)}
                            </span>
                          </span>
                        ))}
                        <span className="sub">{nprov} proveedores</span>
                      </>
                    ) : (
                      <span className="sub">asientos internos</span>
                    )}
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--muted)' }}>{ar.map(([n]) => tit(n)).join(', ')}</td>
                </tr>
              )
            })}
        />
      </div>
    )
  }

  return (
    <>
      <Banda titulo="A dónde va la plata" subtitulo="Todo el gasto del período por rubro, incluidos los sueldos. Tocá un rubro para ver cada cuenta, sus proveedores y sus áreas." />
      {avisoSueldos ? <Aviso>{avisoSueldos}</Aviso> : null}
      {ms.includes('2026-09') ? <Aviso>Septiembre 2026 todavía se está cargando en Vientri (faltan, por ejemplo, ingresos brutos): sus gastos están incompletos.</Aviso> : null}
      <Tarjeta titulo={`Total del período: ${M(total)}`}>
        <Ayuda>
          {mb.length
            ? `Año anterior, mismos meses: ${M(suma(rowsB, (r) => r.imp))}. En rojo, rubros que crecieron más de 10 puntos por encima de la inflación (${pct(INF)}).`
            : ''}
        </Ayuda>
        <div className="barras">
          {filas.map(([c, v]) => {
            const abierta = catAbierta === c
            const vb = pcb[c] || 0
            return (
              <div key={c}>
                <button type="button" className="fila-cat" aria-expanded={abierta} onClick={() => setCatAbierta(abierta ? null : c)}>
                  <span className="n">
                    {c} {vb && v / vb > 1 + INF + 0.1 ? <Chip tono="rojo">creció más que la inflación</Chip> : null}
                  </span>
                  <span className="barra">
                    <i style={{ width: `${((v / max) * 100).toFixed(1)}%` }} />
                  </span>
                  <span className="imp num">{M(v)}</span>
                  <span className="pct num">{pct(v / total)}</span>
                </button>
                {abierta ? detalleCategoria(c) : null}
              </div>
            )
          })}
        </div>
      </Tarjeta>
      <Tarjeta titulo="Por área (centro de costo)">
        <div className="barras">
          {porCc.map(([c, v]) => (
            <div key={c} className="fila-cat" style={{ cursor: 'default', gridTemplateColumns: 'minmax(0,1fr) 7rem 4.5rem' }}>
              <span className="n">{tit(c)}</span>
              <span className="imp num">{M(v)}</span>
              <span className="pct num">{porCcB[c] ? signo(v / porCcB[c] - 1) : ''}</span>
            </div>
          ))}
        </div>
      </Tarjeta>
      <Tarjeta titulo="Inversiones de los últimos 11 meses (no son gasto)">
        <TablaSimple
          cab={['Cuenta', 'Proveedor', { t: 'Importe', r: true }]}
          filas={D.inversiones
            .filter((i) => !EXCLUIR_INVERSIONES.test(i.cuenta))
            .slice(0, 8)
            .map((i, k) => (
              <tr key={k}>
                <td>{i.cuenta}</td>
                <td>{tit(i.prov)}</td>
                <td className="r num">{M(i.imp)}</td>
              </tr>
            ))}
        />
      </Tarjeta>
    </>
  )
}
