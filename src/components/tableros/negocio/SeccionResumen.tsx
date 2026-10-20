import type { ReactNode } from 'react'
import { calcularResumen } from './domain/resumen'
import { M, pct, signo } from './domain/formato'
import type { PropsSeccion, SeccionId } from './tipos'
import { Aviso, Banda } from './ui'

function Tema({
  titulo,
  valor,
  nota,
  frase,
  ir,
  boton,
  tono,
  onIr,
}: {
  titulo: string
  valor: string
  nota: ReactNode
  frase: string
  ir: SeccionId
  boton: string
  tono?: 'rojo' | 'verde' | ''
  onIr: (s: SeccionId) => void
}) {
  return (
    <section className="tema">
      <h3>{titulo}</h3>
      <p className={`valor num ${tono || ''}`}>{valor}</p>
      {nota ? <p className="nota">{nota}</p> : null}
      <p className="frase">{frase}</p>
      <button type="button" className="btn" onClick={() => onIr(ir)}>
        {boton} →
      </button>
    </section>
  )
}

export function SeccionResumen({ modelo, ms, onIr }: PropsSeccion & { onIr: (s: SeccionId) => void }) {
  const r = calcularResumen(modelo, ms)
  const aviso = modelo.textoAvisoCompletos(ms)
  const sufijoCompletos = r.faltanSueldos ? ' · meses completos' : ''
  return (
    <>
      <Banda titulo="Resumen" subtitulo="Todo lo que sigue cambia con el período elegido arriba." />
      {aviso ? <Aviso>{aviso}</Aviso> : null}
      <div className="grid2">
        <Tema
          titulo="Facturado"
          valor={M(r.fN)}
          nota={
            <>
              sin IVA
              {r.fNb ? (
                <>
                  {' '}
                  · {signo(r.fN / r.fNb - 1)} nominal ·{' '}
                  <strong className={r.real != null && r.real < 0 ? 'rojo' : 'verde'}>{signo(r.real)} real</strong>
                </>
              ) : null}
            </>
          }
          frase={`Con IVA: ${M(r.fT)}. ${r.clientesFacturados} clientes facturados.`}
          ir="ventas"
          boton="Ver ventas y cobranzas"
          tono={r.real != null && r.real < 0 ? 'rojo' : ''}
          onIr={onIr}
        />
        <Tema
          titulo="Cobrado"
          valor={M(r.cob)}
          nota={`${pct(r.cob / r.fT)} de lo facturado con IVA`}
          frase={`Recibos de cobranza del período (incluye retenciones). Se cobra en promedio a ${r.diasCobro} días.`}
          ir="ventas"
          boton="Ver cobranzas"
          onIr={onIr}
        />
        <Tema
          titulo="Gastado"
          valor={M(r.gastoTot)}
          nota={`${pct(r.gastoTot / r.ingTotal)} de lo facturado${sufijoCompletos}`}
          frase="Incluye sueldos, gastos, impuestos y bancos. No incluye inversiones ni depreciaciones."
          ir="gastos"
          boton="Ver a dónde va la plata"
          onIr={onIr}
        />
        <Tema
          titulo="Resultado operativo"
          valor={r.hayMesesCompletos ? M(r.res) : '—'}
          nota={`${pct(r.res / r.ingTotal)} de lo facturado${sufijoCompletos}`}
          frase={`Gana más: ${r.mejor.nombre} (${M(r.mejor.res)}). Pierde más: ${r.peor.nombre} (${M(r.peor.res)}).`}
          ir="negocios"
          boton="Ver cada negocio"
          tono={r.res < 0 ? 'rojo' : 'verde'}
          onIr={onIr}
        />
      </div>
      <section className="tarjeta atender">
        <h3>Para atender en el período</h3>
        <ul>
          {r.atender.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </section>
    </>
  )
}
