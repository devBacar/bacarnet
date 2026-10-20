import { useState } from 'react'
import { agrupar, ordenar, type LineaNegocio, type ResultadoNegocios } from './domain/modelo'
import { M, mesLargo, pct, signo, suma, tit } from './domain/formato'
import { Lineas } from './graficos'
import type { PropsSeccion } from './tipos'
import { Ayuda, Aviso, Banda, Kpi, TablaSimple, type Tono } from './ui'

type Clave = 'ing' | 'cob' | 'sue' | 'otr' | 'est'

function Caja({
  l,
  k,
  titulo,
  valor,
  sub,
  tono = '',
  abierto,
  onToggle,
}: {
  l: LineaNegocio
  k: Clave
  titulo: string
  valor: string
  sub: string
  tono?: Tono
  abierto: boolean
  onToggle: (id: string) => void
}) {
  return (
    <button type="button" className="caja-n" aria-pressed={abierto} onClick={() => onToggle(`${l.l}:${k}`)}>
      <span>{titulo}</span>
      <strong className={`num ${tono}`}>{valor}</strong>
      <span>{sub}</span>
    </button>
  )
}

function Detalle({ l, k, ms, ng, modelo }: { l: LineaNegocio; k: Clave; ms: string[]; ng: ResultadoNegocios; modelo: PropsSeccion['modelo'] }) {
  const { D, CL } = modelo
  if (k === 'ing') {
    const todos = D.cliLin
      ? CL.map((c) => ({ n: c.n, id: c.id, v: suma(ms, (m) => D.cliLin?.[c.id]?.[l.l]?.[m] || 0) }))
          .filter((x) => x.v)
          .sort((a, b) => b.v - a.v)
      : null
    const totCli = todos ? suma(todos, (x) => x.v) : 0
    const porCli = todos ? todos.slice(0, 25) : null
    return (
      <div className="det">
        <h4>Qué factura {l.nombre}</h4>
        {porCli ? (
          <TablaSimple
            cab={['Cliente', { t: 'Facturado', r: true }, { t: '% de la línea', r: true }]}
            filas={porCli.map((x) => (
              <tr key={x.id}>
                <td>{tit(x.n)}</td>
                <td className="r num">{M(x.v)}</td>
                <td className="r num">{pct(x.v / totCli)}</td>
              </tr>
            ))}
          />
        ) : null}
        <Ayuda>Clientes según el detalle de cada factura (servicio por servicio). Puede diferir un poco del total contable de la línea.</Ayuda>
        <TablaSimple
          cab={['Mes', { t: 'Facturado', r: true }]}
          filas={ms.map((m) => (
            <tr key={m}>
              <td>{mesLargo(m)}</td>
              <td className="r num">{M(D.lineasIng[l.l]?.[m] || 0)}</td>
            </tr>
          ))}
        />
      </div>
    )
  }
  if (k === 'cob') {
    const porCli = D.cobCliLin
      ? CL.map((c) => ({ n: c.n, id: c.id, v: suma(ms, (m) => D.cobCliLin?.[c.id]?.[l.l]?.[m] || 0) }))
          .filter((x) => x.v)
          .sort((a, b) => b.v - a.v)
          .slice(0, 25)
      : null
    return (
      <div className="det">
        <h4>Qué se cobró de {l.nombre}</h4>
        {porCli ? (
          <TablaSimple
            cab={['Cliente', { t: 'Cobrado', r: true }]}
            filas={porCli.map((x) => (
              <tr key={x.id}>
                <td>{tit(x.n)}</td>
                <td className="r num">{M(x.v)}</td>
              </tr>
            ))}
          />
        ) : null}
        <Ayuda>
          Estimado: los recibos no dicen qué negocio pagan, así que lo cobrado a cada cliente se reparte según lo que le factura cada negocio (por ejemplo, si
          un cliente es 70% seguridad y 30% caudales, su cobranza se reparte igual).
        </Ayuda>
      </div>
    )
  }
  if (k === 'est') {
    const share = ng.ingTot ? l.ing / ng.ingTot : 0
    const nombresCla: Record<string, string> = {
      sue: 'Sueldos y cargas de estructura',
      otr: 'Otros gastos',
      imp: 'Impuestos y tasas',
      ban: 'Bancos e intereses',
    }
    const porCla = ordenar(agrupar(ng.est, (r) => nombresCla[r.cla]))
    const porCta = ordenar(agrupar(ng.est, 'cuenta')).slice(0, 20)
    return (
      <div className="det">
        <h4>
          La estructura que le toca a {l.nombre}: {pct(share)} del total
        </h4>
        <Ayuda>
          La estructura total del período es {M(ng.estTot)}. A esta línea le toca {pct(share)} porque factura esa parte del total. Eso es {pct(l.asign / l.ing)} de
          lo que factura la línea.
        </Ayuda>
        <div className="grid2">
          <TablaSimple
            cab={['Tipo', { t: 'Total estructura', r: true }, { t: 'Le toca', r: true }]}
            filas={porCla.map(([k2, v]) => (
              <tr key={k2}>
                <td>{k2}</td>
                <td className="r num">{M(v)}</td>
                <td className="r num">{M(v * share)}</td>
              </tr>
            ))}
          />
          <TablaSimple
            cab={['Cuenta', { t: 'Total estructura', r: true }, { t: 'Le toca', r: true }]}
            filas={porCta.map(([k2, v]) => (
              <tr key={k2}>
                <td>{tit(k2)}</td>
                <td className="r num">{M(v)}</td>
                <td className="r num">{M(v * share)}</td>
              </tr>
            ))}
          />
        </div>
      </div>
    )
  }
  const rows = l.rows.filter((r) => (k === 'sue' ? r.cla === 'sue' : r.cla !== 'sue'))
  const porCta = ordenar(agrupar(rows, 'cuenta')).slice(0, 25)
  const porCc = ordenar(agrupar(rows, 'cc'))
  return (
    <div className="det">
      <h4>
        {k === 'sue' ? 'Sueldos y cargas' : 'Otros gastos directos'} de {l.nombre}
      </h4>
      <div className="grid2">
        <TablaSimple
          cab={['Cuenta', { t: 'Importe', r: true }, { t: '% de lo facturado', r: true }]}
          filas={porCta.map(([c, v]) => (
            <tr key={c}>
              <td>{tit(c)}</td>
              <td className="r num">{M(v)}</td>
              <td className="r num">{pct(v / l.ing)}</td>
            </tr>
          ))}
        />
        <TablaSimple
          cab={['Centro de costo', { t: 'Importe', r: true }]}
          filas={porCc.map(([c, v]) => (
            <tr key={c}>
              <td>{tit(c)}</td>
              <td className="r num">{M(v)}</td>
            </tr>
          ))}
        />
      </div>
    </div>
  )
}

export function SeccionNegocios({ modelo, ms: periodo }: PropsSeccion) {
  const { MESES, completos, negocios, mesesBase, faltaSueldo, textoAvisoCompletos } = modelo
  const [det, setDet] = useState<string | null>(null)
  const ms = completos(periodo)
  const mb = mesesBase(ms)
  const aviso = textoAvisoCompletos(periodo)
  if (!ms.length) {
    return (
      <>
        <Banda titulo="Negocios" subtitulo="Qué deja cada línea en el período." />
        {aviso ? <Aviso>{aviso}</Aviso> : null}
      </>
    )
  }
  const ng = negocios(ms)
  const ngb = mb.length ? negocios(mb) : null
  const res = ng.ingTot - suma(ng.lineas, (l) => l.dir) - ng.estTot
  const alternar = (id: string): void => setDet(det === id ? null : id)

  const tarjeta = (l: LineaNegocio) => {
    const b = ngb?.lineas.find((x) => x.l === l.l)
    const share = ng.ingTot ? l.ing / ng.ingTot : 0
    const abierto = (k: Clave): boolean => det === `${l.l}:${k}`
    const claveDet = det && det.startsWith(`${l.l}:`) ? (det.split(':')[1] as Clave) : null
    const caja = (k: Clave, titulo: string, valor: string, sub: string, tono: Tono = '') => (
      <Caja l={l} k={k} titulo={titulo} valor={valor} sub={sub} tono={tono} abierto={abierto(k)} onToggle={alternar} />
    )
    return (
      <section className="linea-neg" key={l.l}>
        <div className="cab">
          <b>{l.nombre}</b>
          <span className={`chip ${l.res < 0 ? 'rojo' : 'verde'}`}>
            {l.res < 0 ? 'pierde' : 'gana'} {M(Math.abs(l.res))}
          </span>
        </div>
        <div className="cascada">
          {caja('ing', 'Factura', M(l.ing), b && b.ing ? `${signo(l.ing / b.ing - 1)} contra año anterior` : 'tocá para ver clientes')}
          {caja('cob', 'Cobrado', l.cob == null ? '—' : M(l.cob), l.cob == null ? '' : `${pct(l.cob / (l.ing * 1.21))} de lo facturado con IVA · estimado`)}
          {caja('sue', 'Sueldos y cargas', M(l.sue), `${pct(l.sue / l.ing)} de lo facturado`)}
          {caja('otr', 'Otros gastos directos', M(l.otr), `${pct(l.otr / l.ing)} de lo facturado`)}
          {/* Igual que el prototipo: "Le queda" abre el detalle de otros gastos directos. */}
          {caja('otr', 'Le queda (contribución)', M(l.contrib), pct(l.contrib / l.ing) + (b && b.ing ? ` · antes ${pct(b.contrib / b.ing)}` : ''), l.contrib < 0 ? 'rojo' : '')}
          {caja('est', 'Estructura que le toca', M(l.asign), `${pct(l.asign / l.ing)} de lo que factura · ${pct(share)} de la estructura`)}
          {caja('est', 'Resultado', M(l.res), pct(l.res / l.ing) + (b ? ` · antes ${M(b.res)}` : ''), l.res < 0 ? 'rojo' : 'verde')}
        </div>
        <div style={{ width: '100%', maxWidth: 520 }}>
          <Lineas
            xs={MESES}
            series={[
              {
                n: 'Resultado mes a mes',
                c: 'var(--serie1)',
                v: (m) => {
                  if (faltaSueldo(m)) return null
                  const n1 = negocios([m]).lineas.find((x) => x.l === l.l)
                  return n1 ? n1.res : null
                },
              },
            ]}
            alto={150}
            cada={4}
            marca={ms}
          />
        </div>
        {claveDet ? <Detalle l={l} k={claveDet} ms={ms} ng={ng} modelo={modelo} /> : null}
      </section>
    )
  }

  return (
    <>
      <Banda
        titulo="Negocios"
        subtitulo="Qué deja cada línea en el período. Tocá cualquier número para ver de qué está hecho. La estructura (administración, gastos indirectos, comercial, bancos sin centro de costo) se reparte según lo que factura cada línea."
      />
      {aviso ? <Aviso>{aviso}</Aviso> : null}
      <div className="kpis">
        <Kpi etiqueta="Facturado (4 negocios)" valor={M(ng.ingTot)} nota={ngb && ngb.ingTot ? `${signo(ng.ingTot / ngb.ingTot - 1)} contra año anterior` : ''} />
        <Kpi etiqueta="Costos directos" valor={M(suma(ng.lineas, (l) => l.dir))} nota={`${pct(suma(ng.lineas, (l) => l.dir) / ng.ingTot)} de lo facturado`} />
        <Kpi etiqueta="Estructura" valor={M(ng.estTot)} nota={`${pct(ng.estTot / ng.ingTot)} de lo facturado`} />
        <Kpi etiqueta="Resultado" valor={M(res)} nota={`${pct(res / ng.ingTot)} de lo facturado`} tono={res < 0 ? 'rojo' : 'verde'} />
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {ng.lineas
          .slice()
          .sort((x, y) => y.res - x.res)
          .map(tarjeta)}
      </div>
    </>
  )
}
