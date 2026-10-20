import { useState } from 'react'
import { M, nf, nf1, pct, signo, suma, tit } from './domain/formato'
import { LIN, LKEYS } from './domain/modelo'
import { ventasDelPeriodo, type EstadoCliente, type FiltroCliente } from './domain/ventas'
import { Lineas, Spark } from './graficos'
import type { PropsSeccion } from './tipos'
import { Ayuda, Banda, Chip, Kpi, Pestanas, TablaSimple, Tarjeta } from './ui'

const FILTROS: Array<[FiltroCliente, string]> = [
  ['todos', 'Todos'],
  ['atrasado', 'Tarifa atrasada'],
  ['perdido', 'Perdidos'],
  ['nuevo', 'Nuevos'],
  ['publico', 'Públicos'],
  ['privado', 'Privados'],
]

const COLOR_LINEA: Record<string, string> = { cau: 'var(--verde)', seg: 'var(--serie1)', tes: 'var(--serie2)', gru: 'var(--rojo)' }

function ChipEstado({ e }: { e: EstadoCliente }) {
  if (e === 'atrasado') return <Chip tono="rojo">tarifa atrasada</Chip>
  if (e === 'perdido') return <Chip tono="rojo">perdido</Chip>
  if (e === 'nuevo') return <Chip tono="verde">nuevo</Chip>
  return null
}

export function SeccionVentas({ modelo, ms }: PropsSeccion) {
  const { D, INF, MESES } = modelo
  const [filtro, setFiltro] = useState<FiltroCliente>('todos')
  const { hayB, xs, totF, totT, fN, fT, cob, fNb, rem, remb, filas0, top1 } = ventasDelPeriodo(modelo, ms)
  const lista = filas0
    .filter((x) => (filtro === 'todos' ? true : filtro === 'publico' ? x.c.pub : filtro === 'privado' ? !x.c.pub : x.estado === filtro))
    .sort((x, y) => y.a - x.a)
    .slice(0, 80)

  const filas = lista.map((x) => (
    <tr key={x.c.id}>
      <td>
        <b>{tit(x.c.n)}</b> <ChipEstado e={x.estado} /> {x.c.pub ? <Chip tono="gris">público</Chip> : null}
        {x.brecha ? <span className="sub">brecha contra inflación: {M(x.brecha)}</span> : null}
      </td>
      <td className="r num">{M(x.a)}</td>
      <td className="r num">{x.b == null ? '—' : M(x.b)}</td>
      <td className="r num">
        {x.b ? signo(x.a / x.b - 1) : '—'}
        <span className="sub">{x.b ? `real ${signo(x.a / x.b / (1 + INF) - 1)}` : ''}</span>
      </td>
      <td className="r num">
        {x.ra ? nf.format(x.ra) : '—'}
        <span className="sub">{x.rb ? signo(x.ra / x.rb - 1) : ''}</span>
      </td>
      <td className="r num">{x.pServ == null ? '—' : signo(x.pServ)}</td>
      <td className="r num">
        {M(x.ca)}
        <span className="sub">{x.ta ? `${pct(x.ca / x.ta)} de lo facturado` : ''}</span>
      </td>
      <td className="r num">
        {x.c.dias == null ? '—' : `${nf1.format(x.c.dias)} d`}
        <span className={`sub ${x.c.atraso != null && x.c.atraso > 10 ? 'rojo' : ''}`}>
          {x.c.atraso == null ? '' : x.c.atraso > 0 ? `${nf1.format(x.c.atraso)} d tarde` : 'en fecha'}
        </span>
      </td>
      <td className="r num">{x.c.deuda ? M(x.c.deuda) : '—'}</td>
      <td style={{ width: 110 }}>
        <Spark valores={xs.map((m) => x.c.f[m] || 0)} />
      </td>
    </tr>
  ))

  return (
    <>
      <Banda
        titulo="Ventas y cobranzas"
        subtitulo={`Facturado neto (sin IVA, menos notas de crédito), facturado con IVA y cobrado (recibos), por cliente.${
          hayB
            ? ' Comparado con los mismos meses del año anterior.'
            : ' Este período no tiene año anterior completo para comparar (los comprobantes arrancan en enero 2025).'
        }`}
      />
      <div className="kpis">
        <Kpi
          etiqueta="Facturado sin IVA"
          valor={M(fN)}
          nota={fNb ? `${signo(fN / fNb - 1)} nominal · ${signo(fN / fNb / (1 + INF) - 1)} real` : ''}
          tono={fNb && fN / fNb < 1 + INF ? 'rojo' : ''}
        />
        <Kpi etiqueta="Facturado con IVA" valor={M(fT)} nota="lo que hay que cobrar" />
        <Kpi etiqueta="Cobrado" valor={M(cob)} nota={`${pct(cob / fT)} de lo facturado con IVA`} tono={cob < fT * 0.95 ? 'rojo' : 'verde'} />
        <Kpi etiqueta="Servicios (remitos)" valor={nf.format(rem)} nota={remb ? `${signo(rem / remb - 1)} contra el año anterior` : ''} />
        <Kpi etiqueta="Primer cliente" valor={pct(top1.a / fN)} nota={tit(top1.c.n)} />
        <Kpi etiqueta="A cobrar hoy" valor={M(suma(D.cob.deudaClientes, (d) => d.pendiente))} nota="saldo pendiente al 15/10/2026" />
      </div>
      <Tarjeta titulo="Facturado y cobrado, mes a mes">
        <Lineas
          xs={xs}
          series={[
            { n: 'Facturado con IVA', c: 'var(--serie1)', v: totT },
            { n: 'Cobrado', c: 'var(--verde)', v: (m) => D.cobTot[m] || 0 },
            { n: 'Facturado sin IVA', c: 'var(--serie2)', v: totF, dash: true },
          ]}
          marca={ms}
        />
        <Ayuda>Octubre 2026 no se muestra porque la copia es del 15/10.</Ayuda>
      </Tarjeta>
      <Tarjeta titulo="Ventas por negocio, mes a mes (contabilidad)">
        <Lineas xs={MESES} series={LKEYS.map((l) => ({ n: LIN[l], c: COLOR_LINEA[l], v: (m: string) => D.lineasIng[l]?.[m] || 0 }))} marca={ms} />
      </Tarjeta>
      <Tarjeta titulo="Clientes uno por uno">
        <Pestanas opciones={FILTROS} valor={filtro} onCambio={setFiltro} />
        <TablaSimple
          cab={[
            'Cliente',
            { t: 'Facturado', r: true },
            { t: 'Año anterior', r: true },
            { t: 'Variación', r: true },
            { t: 'Servicios', r: true },
            { t: 'Precio por servicio', r: true },
            { t: 'Cobrado', r: true },
            { t: 'Días de cobro', r: true },
            { t: 'Debe hoy', r: true },
            'Mes a mes',
          ]}
          filas={filas}
        />
        <Ayuda>
          Facturado y cobrado son del período elegido. Días de cobro y deuda son de todo 2025–2026 y del 15/10/2026. "Tarifa atrasada": quedó más de 5% por
          debajo del año anterior más inflación, a igual cantidad de servicios.
        </Ayuda>
      </Tarjeta>
    </>
  )
}
