import { agrupar, ordenar } from './domain/modelo'
import { M, signo, suma, tit } from './domain/formato'
import { Lineas } from './graficos'
import type { PropsSeccion } from './tipos'
import { Ayuda, Banda, Kpi, TablaSimple, Tarjeta, type Tono } from './ui'

export function SeccionFinanciero({ modelo, ms }: PropsSeccion) {
  const { D, MESES, mesesBase, costosDe, provDe } = modelo
  const CU = D.cuentas
  const mb = mesesBase(ms)
  const C = (n: string): number => suma(costosDe(ms, (r) => r.cuenta === n), (r) => r.imp)
  const Cb = (n: string): number => suma(costosDe(mb, (r) => r.cuenta === n), (r) => r.imp)
  const serie = (n: string): ((m: string) => number) => {
    const o: Record<string, number> = {}
    for (const r of D.costos) if (CU[r[4]] === n) o[MESES[r[0]]] = (o[MESES[r[0]]] || 0) + r[6]
    return (m) => o[m] || 0
  }
  const quien = (n: string): Array<[string, number]> => ordenar(agrupar(provDe(ms, (p) => p.cuenta === n), 'prov')).slice(0, 4)
  const k = (t: string, n: string, tono?: Tono) => (
    <Kpi
      etiqueta={t}
      valor={M(C(n))}
      nota={mb.length && Cb(n) ? `año anterior ${M(Cb(n))} (${signo(C(n) / Cb(n) - 1)})` : ''}
      tono={tono}
    />
  )
  const af = D.cob.deudaImpuestos.find((d) => /ADMINISTRACION FEDERAL/.test(d.nombre)) || { pendiente: 0, vencido: 0, masVieja: '' }
  const quienes: Array<[string, string]> = [
    ['Intereses', 'INTERESES'],
    ['Comisiones', 'COMISIONES Y GTOS. BANCARIOS'],
    ['Impuesto al cheque', 'IMP. A LOS DEBITOS Y CREDITOS'],
  ]

  return (
    <>
      <Banda titulo="Bancos e impuestos" subtitulo="Lo que cuesta financiarse y pagar tarde, en el período elegido." />
      <div className="kpis">
        {k('Intereses bancarios', 'INTERESES', 'rojo')}
        {k('Comisiones bancarias', 'COMISIONES Y GTOS. BANCARIOS', 'rojo')}
        {k('Impuesto al cheque', 'IMP. A LOS DEBITOS Y CREDITOS')}
        {k('Intereses fiscales', 'INTERESES FISCALES', 'rojo')}
        <Kpi etiqueta="Deuda con ARCA hoy" valor={M(af.pendiente)} nota={`${M(af.vencido)} vencida · desde ${af.masVieja}`} tono="rojo" />
      </div>
      <Tarjeta titulo="Mes a mes">
        <Lineas
          xs={MESES}
          series={[
            { n: 'Intereses bancarios', c: 'var(--serie1)', v: serie('INTERESES') },
            { n: 'Comisiones', c: 'var(--serie2)', v: serie('COMISIONES Y GTOS. BANCARIOS') },
            { n: 'Impuesto al cheque', c: 'var(--verde)', v: serie('IMP. A LOS DEBITOS Y CREDITOS') },
            { n: 'Intereses fiscales', c: 'var(--rojo)', v: serie('INTERESES FISCALES') },
          ]}
          marca={ms}
        />
      </Tarjeta>
      <div className="grid2">
        <Tarjeta titulo="Quién cobra, en el período">
          <TablaSimple
            cab={['', { t: 'Importe', r: true }]}
            filas={quienes.flatMap(([t, n]) => [
              <tr key={`h-${t}`}>
                <th colSpan={2}>{t}</th>
              </tr>,
              ...quien(n).map(([p, v]) => (
                <tr key={`${t}-${p}`}>
                  <td>{tit(p)}</td>
                  <td className="r num">{M(v)}</td>
                </tr>
              )),
            ])}
          />
          <Ayuda>Becerra Bursátil y Jalin cobran por descontar cheques: la forma más cara de conseguir plata.</Ayuda>
        </Tarjeta>
        <Tarjeta titulo="Impuestos pendientes hoy, por antigüedad">
          <TablaSimple
            cab={['Antigüedad', { t: 'Pendiente', r: true }]}
            filas={Object.entries(D.cob.tramosImpuestos).map(([k2, v]) => (
              <tr key={k2}>
                <td>{k2} días</td>
                <td className="r num">{M(v)}</td>
              </tr>
            ))}
          />
          <Ayuda>Puede incluir cuotas de planes de pago vigentes; confirmar con el contador qué parte está en mora.</Ayuda>
        </Tarjeta>
      </div>
    </>
  )
}
