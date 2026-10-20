import { useMemo, useState } from 'react'
import { construirPlan, type AccionPlan, type AreaPlan, type NivelPlan } from './domain/plan'
import { M } from './domain/formato'
import type { PropsSeccion } from './tipos'
import { Banda, Chip } from './ui'

const AREAS: AreaPlan[] = ['Más ingresos', 'Menos gasto', 'Caja']

function Accion({ a }: { a: AccionPlan }) {
  return (
    <section className="accion">
      <div className="cab">
        <b>{a.titulo}</b>
        <span className={`monto ${a.caja ? 'caja' : ''} num`}>
          {a.valor > 0 ? M(a.valor) + (a.caja ? ' una vez' : ' por año') : 'prepara el próximo nivel'}
        </span>
      </div>
      <ol>
        {a.pasos.map((s, i) => (
          <li key={i}>
            {s.t}
            {s.nuevo ? (
              <>
                {' '}
                <Chip tono="verde">nuevo en este plan</Chip>
              </>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="meta">
        <span>
          Responsable: <b>{a.r}</b>
        </span>
        <span>
          Plazo: <b>{a.pl}</b>
        </span>
        <span>
          Cómo se mide: <b>{a.i}</b>
        </span>
      </div>
      <p className="datos">{a.d}</p>
    </section>
  )
}

/** El plan tiene base fija: no cambia con el período elegido. */
export function SeccionPlan({ modelo }: PropsSeccion) {
  const planes = useMemo(() => construirPlan(modelo), [modelo])
  const [activo, setActivo] = useState<NivelPlan>('medio')
  const p = planes.find((x) => x.id === activo) ?? planes[1]
  return (
    <>
      <Banda
        titulo="Plan de acción"
        subtitulo="Base fija: gastos de oct 25 a ago 26 y ventas de ene–sep 2026 contra 2025 (no cambia con el período elegido). Cada nivel suma acciones nuevas, marcadas en verde."
      />
      <div className="planes" role="tablist">
        {planes.map((x) => (
          <button key={x.id} type="button" className="plan" role="tab" aria-selected={x.id === activo} onClick={() => setActivo(x.id)}>
            <span className="t">{x.nombre}</span>
            <span className="v num">{M(x.gas + x.ing)}</span>
            <span className="d">
              por año: {M(x.gas)} menos gasto + {M(x.ing)} más ingresos · {M(x.caja)} de caja una vez
            </span>
            <span className="d">{x.desc}</span>
          </button>
        ))}
      </div>
      {AREAS.map((ar) => (
        <div key={ar} style={{ display: 'contents' }}>
          <h3 className="area-t">{ar}</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {p.acc
              .filter((a) => a.area === ar)
              .map((a) => (
                <Accion key={a.titulo} a={a} />
              ))}
          </div>
        </div>
      ))}
    </>
  )
}
