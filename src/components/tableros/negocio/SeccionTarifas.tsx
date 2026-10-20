import { useState } from 'react'
import { difMeses, M, menos12, mesCorto, nf, pct, precio, signo, suma, tit } from './domain/formato'
import { LIN, VENTAS_DESDE, type SerieTarifa } from './domain/modelo'
import { Lineas, Spark } from './graficos'
import type { PropsSeccion } from './tipos'
import { Ayuda, Aviso, Banda, Chip, Kpi, Pestanas, TablaSimple, Tarjeta } from './ui'

type LineaTarifa = 'seg' | 'gru' | 'tes' | 'cau'
const LINEAS: LineaTarifa[] = ['seg', 'gru', 'tes', 'cau']
const COLOR_LINEA: Record<string, string> = { cau: 'var(--verde)', seg: 'var(--serie1)', tes: 'var(--serie2)', gru: 'var(--rojo)' }

function TarifasSinDetalle({ modelo, ms }: PropsSeccion) {
  const { CL, MESES, sv } = modelo
  const xs = MESES.filter((m) => m >= VENTAS_DESDE)
  const cs = CL.filter((c) => sv(c.r, ms) > 30)
    .sort((a, b) => sv(b.f, ms) - sv(a.f, ms))
    .slice(0, 25)
  const filas = cs.map((c) => {
    const pm = (m: string): number | null => (c.r[m] > 5 ? (c.f[m] || 0) / c.r[m] : null)
    const ini = xs.map(pm).find((v) => v)
    const fin = xs.map(pm).reverse().find((v) => v)
    return (
      <tr key={c.id}>
        <td>
          <b>{tit(c.n)}</b>
          <span className="sub">{nf.format(sv(c.r, ms))} servicios en el período</span>
        </td>
        <td className="r num">{ini ? `$ ${nf.format(ini)}` : '—'}</td>
        <td className="r num">{fin ? `$ ${nf.format(fin)}` : '—'}</td>
        <td className="r num">{ini && fin ? signo(fin / ini - 1) : '—'}</td>
        <td style={{ width: 140 }}>
          <Spark valores={xs.map((m) => pm(m) || 0)} />
        </td>
      </tr>
    )
  })
  return (
    <>
      <Banda titulo="Tarifas" subtitulo="Evolución de precios por negocio y por cliente." />
      <Aviso>
        Falta el detalle de las facturas (servicio, cantidad y precio unitario) para mostrar las tarifas reales por servicio y por negocio. Mientras tanto, esta
        tabla usa lo facturado dividido por la cantidad de remitos de cada cliente, que solo sirve para clientes de transporte de caudales.
      </Aviso>
      <Tarjeta titulo="Precio promedio por servicio (facturado ÷ remitos)">
        <TablaSimple cab={['Cliente', { t: 'Primer mes', r: true }, { t: 'Último mes', r: true }, { t: 'Variación', r: true }, 'Mes a mes']} filas={filas} />
      </Tarjeta>
    </>
  )
}

export function SeccionTarifas({ modelo, ms }: PropsSeccion) {
  const { D, INF, MESES, CL, infN, serieTarifa } = modelo
  const [cliTarifa, setCliTarifa] = useState<LineaTarifa | null>(null)
  const IT = D.items
  if (!IT) return <TarifasSinDetalle modelo={modelo} ms={ms} />

  const IX = IT.idx
  const fin = ms[ms.length - 1]
  const lin: LineaTarifa = cliTarifa ?? 'seg'
  const xs = MESES.filter((m) => m >= VENTAS_DESDE && m <= '2026-09')
  const infl = (m: string): number => 100 * (1 + infN(difMeses(VENTAS_DESDE, m)))
  const ixVar = (l: string): number | null => {
    const a = IX[l]?.[fin]
    const b = IX[l]?.[menos12(fin)]
    return a && b ? a / b - 1 : null
  }
  const NOMCL: Record<string, string> = Object.fromEntries(CL.map((c) => [String(c.id), c.n]))

  const filasSerie: SerieTarifa[] = []
  for (const lista of [IT.s, IT.f]) {
    for (const [c, a, p] of lista) {
      const art = IT.arts[a]
      if (!art || art[1] !== lin) continue
      const s = serieTarifa(c, a, p, ms)
      if (s) filasSerie.push(s)
    }
  }
  filasSerie.sort((x, y) => y.fact - x.fact)
  const atrasadas = filasSerie.filter((f) => f.real < -0.1)

  const red: Record<string, { c: number; a: string; v: number; ms: Set<string> }> = {}
  for (const [c, a, m, v] of IT.red) {
    if (!ms.includes(m)) continue
    const k = `${c}|${a}`
    red[k] ||= { c, a, v: 0, ms: new Set() }
    red[k].v += v
    red[k].ms.add(m)
  }
  const redL = Object.values(red)
    .filter((r) => Math.abs(r.v) > 1e5)
    .sort((a, b) => b.v - a.v)
  const redT = suma(redL, (r) => r.v)

  return (
    <>
      <Banda
        titulo="Tarifas"
        subtitulo={`Precio por hora, por servicio o abono mensual, sacado del detalle de cada factura. Compara el último precio del período contra el de 12 meses antes y contra la inflación (~${pct(INF)} anual).`}
      />
      <div className="kpis">
        {LINEAS.map((l) => {
          const v = ixVar(l)
          return (
            <Kpi
              key={l}
              etiqueta={LIN[l]}
              valor={v == null ? '—' : signo(v)}
              nota={v == null ? 'sin 12 meses para comparar' : `12 meses a ${mesCorto(fin)} · inflación ${pct(INF)} · real ${signo((1 + v) / (1 + INF) - 1)}`}
              tono={v != null && v < INF - 0.05 ? 'rojo' : v != null ? 'verde' : ''}
            />
          )
        })}
      </div>
      <Tarjeta titulo="Cuánto subieron los precios de cada negocio (enero 2025 = 100)">
        <Lineas
          xs={xs}
          series={[
            ...LINEAS.map((l) => ({ n: LIN[l], c: COLOR_LINEA[l], v: (m: string) => IX[l]?.[m] ?? null })),
            { n: 'Inflación', c: 'var(--muted)', v: infl, dash: true },
          ]}
          formato={(v) => nf.format(v)}
          marca={ms}
        />
        <Ayuda>
          Índice de precios: mes a mes se compara el precio de cada cliente y servicio con su precio anterior, ponderado por lo que se le factura. Seguridad y
          grúas: precio por hora. Tesorería: cajeros humanos, equipos y ATM (el contrato grande del Banco Provincia se ajusta por redeterminación, ver abajo).
          Caudales: abonos mensuales fijos. Los saltos de más de 30% (50% en grúas) se toman como cambio de servicio y no entran.
        </Ayuda>
      </Tarjeta>
      <Tarjeta titulo="Precio por cliente y servicio">
        <Pestanas opciones={LINEAS.map((l): [LineaTarifa, string] => [l, LIN[l]])} valor={lin} onCambio={(l) => setCliTarifa(cliTarifa === l ? null : l)} />
        {atrasadas.length ? (
          <Aviso>
            {atrasadas.length} de {filasSerie.length} precios de {LIN[lin].toLowerCase()} quedaron más de 10% abajo de la inflación. Los de más facturación:{' '}
            {atrasadas
              .slice(0, 4)
              .map((f) => tit(NOMCL[String(f.c)] || f.c))
              .join(', ')}
            .
          </Aviso>
        ) : null}
        <TablaSimple
          cab={[
            'Cliente y servicio',
            { t: 'Precio antes', r: true },
            { t: 'Precio ahora', r: true },
            { t: 'Subió', r: true },
            { t: 'Contra inflación', r: true },
            { t: 'Último aumento', r: true },
            'Mes a mes',
          ]}
          filas={filasSerie.slice(0, 60).map((f) => {
            const art = IT.arts[f.a]
            return (
              <tr key={`${f.c}-${f.a}`}>
                <td>
                  <b>{tit(NOMCL[String(f.c)] || `Cliente ${f.c}`)}</b>{' '}
                  {f.real < -0.1 ? <Chip tono="rojo">atrasada</Chip> : f.real > 0.05 ? <Chip tono="verde">le gana a la inflación</Chip> : null}
                  <span className="sub">
                    {tit(art[0])} · por {art[2]}
                  </span>
                </td>
                <td className="r num">
                  {precio(f.pb)}
                  <span className="sub">{mesCorto(f.base)}</span>
                </td>
                <td className="r num">
                  {precio(f.pf)}
                  <span className="sub">{mesCorto(f.fin)}</span>
                </td>
                <td className="r num">
                  {signo(f.varN)}
                  <span className="sub">en {f.n} meses</span>
                </td>
                <td className={`r num ${f.real < -0.1 ? 'rojo' : ''}`}>
                  {signo(f.real)}
                  <span className="sub">inflación {pct(infN(f.n))}</span>
                </td>
                <td className="r num">
                  {f.ult ? mesCorto(f.ult) : 'sin aumentos'}
                  <span className={`sub ${f.sinAum >= 4 ? 'rojo' : ''}`}>
                    {f.sinAum ? `${f.sinAum} ${f.sinAum === 1 ? 'mes' : 'meses'} sin subir` : 'subió este mes'}
                  </span>
                </td>
                <td style={{ width: 120 }}>
                  <Spark valores={f.sp} color={COLOR_LINEA[lin]} />
                </td>
              </tr>
            )
          })}
        />
        <Ayuda>
          "Antes" es el precio de 12 meses atrás (o el primero que hay). Precios sin IVA. Ordenado por lo facturado en el período. Caudales: solo clientes con
          abono mensual fijo; el resto se cobra por cantidad de visitas o recaudación y su "precio" depende de la actividad.
        </Ayuda>
      </Tarjeta>
      <Tarjeta titulo="Redeterminaciones de precio facturadas en el período">
        <Ayuda estilo="sinMargen">
          Ajustes retroactivos de precio facturados aparte. Total del período: <strong>{M(redT)}</strong>. Si llegan tarde, durante esos meses se trabaja a
          precio viejo.
        </Ayuda>
        <TablaSimple
          cab={['Cliente', 'Concepto', { t: 'Importe', r: true }, 'Meses']}
          filas={redL.slice(0, 30).map((r) => (
            <tr key={`${r.c}|${r.a}`}>
              <td>{tit(NOMCL[String(r.c)] || r.c)}</td>
              <td>{tit(IT.red_n[r.a] || r.a)}</td>
              <td className="r num">{M(r.v)}</td>
              <td>{[...r.ms].sort().map(mesCorto).join(', ')}</td>
            </tr>
          ))}
        />
      </Tarjeta>
    </>
  )
}
