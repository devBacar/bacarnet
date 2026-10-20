import { useState } from 'react'
import { agrupar, LKEYS, VENTAS_DESDE } from './domain/modelo'
import { M, suma, US } from './domain/formato'
import { Lineas } from './graficos'
import type { PropsSeccion } from './tipos'
import { Ayuda, Banda, Pestanas, Tarjeta } from './ui'

type Moneda = 'pesos' | 'dolares'

export function SeccionEvolucion({ modelo, ms }: PropsSeccion) {
  const { D, MESES, costosDe, faltaSueldo } = modelo
  const [moneda, setMoneda] = useState<Moneda>('pesos')
  const conv = (m: string): number => (moneda === 'dolares' ? D.dolar[m] || 1 : 1)
  const fmt = moneda === 'dolares' ? US : M
  const ing = (m: string): number => suma(LKEYS.concat('otr'), (l) => D.lineasIng[l]?.[m] || 0)
  const porCla: Record<string, Record<string, number>> = {}
  for (const m of MESES) porCla[m] = agrupar(costosDe([m]), 'cla')
  const totalCla = (m: string): number => suma(Object.values(porCla[m]), (x) => x)

  return (
    <>
      <Banda titulo="Evolución" subtitulo="Mes a mes desde octubre 2024. El período elegido queda sombreado. En dólares se usa el dólar oficial promedio del mes." />
      <Pestanas
        opciones={[
          ['pesos', 'En pesos'],
          ['dolares', 'En dólares'],
        ]}
        valor={moneda}
        onCambio={setMoneda}
      />
      <Tarjeta titulo="Facturado, cobrado y gastado">
        <Lineas
          xs={MESES}
          series={[
            { n: 'Facturado (contabilidad)', c: 'var(--serie1)', v: (m) => ing(m) / conv(m) },
            { n: 'Cobrado (con IVA)', c: 'var(--verde)', v: (m) => (m >= VENTAS_DESDE ? (D.cobTot[m] || 0) / conv(m) : null) },
            { n: 'Gastado', c: 'var(--rojo)', v: (m) => (faltaSueldo(m) ? null : totalCla(m) / conv(m)) },
          ]}
          formato={fmt}
          marca={ms}
        />
      </Tarjeta>
      <Tarjeta titulo="Gasto por tipo">
        <Lineas
          xs={MESES}
          series={[
            { n: 'Sueldos y cargas', c: 'var(--serie2)', v: (m) => (faltaSueldo(m) ? null : (porCla[m].sue || 0) / conv(m)) },
            { n: 'Otros gastos', c: 'var(--serie1)', v: (m) => (porCla[m].otr || 0) / conv(m) },
            { n: 'Impuestos', c: 'var(--verde)', v: (m) => (porCla[m].imp || 0) / conv(m) },
            { n: 'Bancos e intereses', c: 'var(--rojo)', v: (m) => (porCla[m].ban || 0) / conv(m) },
          ]}
          formato={fmt}
          marca={ms}
        />
        <Ayuda>Las líneas cortadas son meses sin sueldos cargados.</Ayuda>
      </Tarjeta>
      <Tarjeta titulo="Resultado operativo por mes">
        <Lineas
          xs={MESES}
          series={[{ n: 'Facturado − gastado', c: 'var(--serie1)', v: (m) => (faltaSueldo(m) ? null : (ing(m) - totalCla(m)) / conv(m)) }]}
          formato={fmt}
          marca={ms}
        />
      </Tarjeta>
    </>
  )
}
