import type { ReactNode } from 'react'
import { nf1, pct, signo } from './domain/formato'

export type Tono = '' | 'rojo' | 'verde'

export function Banda({ titulo, subtitulo }: { titulo: string; subtitulo: ReactNode }) {
  return (
    <div className="banda">
      <h2>{titulo}</h2>
      <p>{subtitulo}</p>
    </div>
  )
}

export function Kpi({ etiqueta, valor, nota, tono = '' }: { etiqueta: string; valor: ReactNode; nota?: ReactNode; tono?: Tono }) {
  return (
    <div className="kpi">
      <span className="l">{etiqueta}</span>
      <span className={`v num ${tono}`}>{valor}</span>
      {nota ? <span className="n">{nota}</span> : null}
    </div>
  )
}

export function Aviso({ children }: { children: ReactNode }) {
  return <div className="aviso">{children}</div>
}

export function Tarjeta({ titulo, children }: { titulo?: ReactNode; children: ReactNode }) {
  return (
    <section className="tarjeta">
      {titulo ? <h3>{titulo}</h3> : null}
      {children}
    </section>
  )
}

export function Ayuda({ children, estilo }: { children: ReactNode; estilo?: 'sinMargen' }) {
  return (
    <p className="ayuda" style={estilo ? { marginTop: 0 } : undefined}>
      {children}
    </p>
  )
}

export type TonoChip = 'rojo' | 'verde' | 'ambar' | 'gris'

export function Chip({ tono, children }: { tono: TonoChip; children: ReactNode }) {
  return <span className={`chip ${tono}`}>{children}</span>
}

/** Variación contra el año anterior: rojo si creció más que la inflación + 10 puntos, verde si bajó más de 10%. */
export function ChipVar({ a, b, inf }: { a: number; b: number; inf: number }) {
  if (!b) return a > 0 ? <Chip tono="ambar">nuevo</Chip> : null
  const r = a / b
  if (r > 1 + inf + 0.1) return <Chip tono="rojo">×{nf1.format(r)}</Chip>
  if (r < 0.9) return <Chip tono="verde">bajó {pct(1 - r)}</Chip>
  return <Chip tono="gris">{signo(r - 1)}</Chip>
}

export interface Columna {
  t?: ReactNode
  r?: boolean
}

/** Tabla simple con desplazamiento horizontal propio (no desborda la página en el celular). */
export function TablaSimple({ cab, filas }: { cab: Array<Columna | string>; filas: ReactNode[] }) {
  return (
    <div className="tabla-w">
      <table>
        <thead>
          <tr>
            {cab.map((c, i) => {
              const col = typeof c === 'string' ? { t: c } : c
              return (
                <th key={i} className={col.r ? 'r' : undefined}>
                  {col.t}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {filas.length ? (
            filas
          ) : (
            <tr>
              <td colSpan={cab.length}>Sin datos en el período.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export function Pestanas<T extends string>({
  opciones,
  valor,
  onCambio,
}: {
  opciones: Array<[T, string]>
  valor: T | null
  onCambio: (v: T) => void
}) {
  return (
    <div className="pests" role="tablist">
      {opciones.map(([id, t]) => (
        <button key={id} type="button" className="pest" role="tab" aria-selected={valor === id} onClick={() => onCambio(id)}>
          {t}
        </button>
      ))}
    </div>
  )
}
