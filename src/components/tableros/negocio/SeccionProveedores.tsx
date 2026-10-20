import { agrupar, ordenar } from './domain/modelo'
import { M, nf, nf1, pct, suma, tit } from './domain/formato'
import { Spark } from './graficos'
import type { PropsSeccion } from './tipos'
import { Ayuda, Banda, Chip, ChipVar, Kpi, TablaSimple, Tarjeta } from './ui'

const BANC = /INTERESES|DEBITOS Y CREDITOS|COMISIONES Y GTOS/

export function SeccionProveedores({ modelo, ms }: PropsSeccion) {
  const { D, INF, MESES, mesesBase, provDe, provMes } = modelo
  const mb = mesesBase(ms)
  const pv = provDe(ms)
  const pvb = provDe(mb)
  const porP = ordenar(agrupar(pv, 'prov'))
  const porPb = agrupar(pvb, 'prov')
  const pm = provMes()
  const top = porP.slice(0, 30).map(([n, v], i) => {
    const cts = ordenar(agrupar(pv.filter((p) => p.prov === n), 'cuenta'))
      .slice(0, 2)
      .map(([c]) => tit(c))
    return (
      <tr key={n}>
        <td className="num">{i + 1}</td>
        <td>
          <b>{tit(n)}</b>
          <span className="sub">{cts.join(' · ')}</span>
        </td>
        <td className="r num">{M(v)}</td>
        <td className="r num">{M(porPb[n] || 0)}</td>
        <td>
          <ChipVar a={v} b={porPb[n] || 0} inf={INF} />
        </td>
        <td style={{ width: 120 }}>
          <Spark valores={MESES.map((m) => pm[n]?.[m] || 0)} />
        </td>
      </tr>
    )
  })
  const porCta: Record<string, Record<string, number>> = {}
  pv.filter((p) => !BANC.test(p.cuenta)).forEach((p) => {
    porCta[p.cuenta] ||= {}
    porCta[p.cuenta][p.prov] = (porCta[p.cuenta][p.prov] || 0) + p.imp
  })
  const frag = Object.entries(porCta)
    .map(([c, o]) => {
      const l = ordenar(o).filter(([, v]) => v > 0)
      const t = suma(l, (x) => x[1])
      return { c, t, n: l.length, top3: t ? suma(l.slice(0, 3), (x) => x[1]) / t : 0, l }
    })
    .filter((f) => f.t > 5e6)
    .sort((a, b) => b.t - a.t)
    .slice(0, 25)
  const comp = ms.map((m) => D.compras[m]).filter(Boolean)
  const fac = suma(comp, (c) => c.facturas)
  const chi = suma(comp, (c) => c.chicas)
  const tp = D.cob.tramosProveedores

  return (
    <>
      <Banda titulo="Compras y proveedores" subtitulo="Gasto por proveedor del período según los asientos contables. Sin bancos como financiación ni organismos." />
      <div className="kpis">
        <Kpi etiqueta="Facturas de compra" valor={nf.format(fac)} nota={`en el período · ${nf.format(Math.round(fac / ms.length))} por mes`} />
        <Kpi
          etiqueta="Facturas chicas"
          valor={pct(chi / fac)}
          nota={`${nf.format(chi)} de menos de $ 200.000 · ${M(suma(comp, (c) => c.chicasMonto))}`}
          tono="rojo"
        />
        <Kpi etiqueta="Proveedores con gasto" valor={nf.format(porP.filter(([, v]) => v > 0).length)} nota="en el período" />
        <Kpi etiqueta="Días de pago" valor={nf1.format(D.cob.diasPago)} nota="promedio 2025–2026" />
        <Kpi
          etiqueta="Deuda con proveedores hoy"
          valor={M(suma(D.cob.deudaProveedores, (d) => d.pendiente))}
          nota={`${M(tp['91-180'] + tp['+180'])} con más de 90 días`}
          tono="rojo"
        />
      </div>
      <Tarjeta titulo="Cuántos proveedores tiene cada rubro">
        <Ayuda>
          Muchos proveedores en un rubro: compras sueltas, sin poder de negociación. Uno solo en un servicio grande: hay que comparar precio.
        </Ayuda>
        <TablaSimple
          cab={['Cuenta', { t: 'Período', r: true }, { t: 'Proveedores', r: true }, { t: '3 primeros', r: true }, 'Principales', '']}
          filas={frag.map((f) => (
            <tr key={f.c}>
              <td>
                <b>{tit(f.c)}</b>
              </td>
              <td className="r num">{M(f.t)}</td>
              <td className="r num">{f.n}</td>
              <td className="r num">{pct(f.top3)}</td>
              <td style={{ fontSize: 13 }}>
                {f.l.slice(0, 3).map(([n, v], i) => (
                  <span key={n}>
                    {i > 0 ? <br /> : null}
                    {tit(n)}{' '}
                    <span className="num" style={{ color: 'var(--muted)' }}>
                      {M(v)}
                    </span>
                  </span>
                ))}
              </td>
              <td>
                {f.n >= 12 && f.top3 < 0.6 ? <Chip tono="ambar">consolidar</Chip> : f.n <= 2 && f.t > 50e6 ? <Chip tono="gris">comparar precio</Chip> : null}
              </td>
            </tr>
          ))}
        />
      </Tarjeta>
      <Tarjeta titulo="Los 30 proveedores con más gasto">
        <TablaSimple cab={['#', 'Proveedor y cuentas', { t: 'Período', r: true }, { t: 'Año anterior', r: true }, 'Variación', 'Mes a mes']} filas={top} />
        <Ayuda>Filmec S.A. es empresa del grupo (taller y alquiler): conviene confirmar que cobra a precio de mercado.</Ayuda>
      </Tarjeta>
      <Tarjeta titulo="A quién le debemos hoy">
        <TablaSimple
          cab={['Proveedor', { t: 'Pendiente', r: true }, { t: 'Más de 90 días', r: true }, 'Desde']}
          filas={D.cob.deudaProveedores.slice(0, 12).map((d) => (
            <tr key={d.id}>
              <td>{tit(d.nombre)}</td>
              <td className="r num">{M(d.pendiente)}</td>
              <td className="r num">{M((d.tramos['91-180'] || 0) + (d.tramos['+180'] || 0))}</td>
              <td className="num">{d.masVieja}</td>
            </tr>
          ))}
        />
        <Ayuda>Saldos muy viejos (por ejemplo, de 2023) probablemente estén mal cancelados en Vientri.</Ayuda>
      </Tarjeta>
    </>
  )
}
