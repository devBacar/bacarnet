import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../context'
import type { PermisosFinanzasEfectivos } from '../../../services/userService'
import { usePermisosFinanzas } from '../permisosFinanzas'
import { OfertaRecorrido, PreguntaRecorrido } from './OfertaRecorrido'
import { RecorridoGlobo } from './RecorridoGlobo'
import { PASOS_RECORRIDO, TEXTO_FINAL, TITULO_FINAL, type PasoRecorrido } from './pasosRecorrido'
import {
  anteriorPaso,
  estaVisto,
  marcarVisto,
  pasosDelRecorrido,
  presentarPaso,
  rectUtil,
  siguientePaso,
  ubicacionCoincide,
  type ModoRecorrido,
} from './recorridoLogica'
import { publicarAbrir } from './recorridoPuente'

type Fase = 'cerrado' | 'pregunta' | 'recorrido' | 'final'
type Ancla = 'buscando' | 'señalado' | 'centrado' | 'sin-permiso'

const ESPERA_MS = 3000

export function RecorridoProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const uid = user?.uid ?? ''
  const puede = usePermisosFinanzas()
  const permisos = useMemo<PermisosFinanzasEfectivos>(
    () => ({
      ver: puede.ver,
      agenda: puede.agenda,
      cheques: puede.cheques,
      categorias: puede.categorias,
      transferencias: puede.transferencias,
      destinatarios: puede.destinatarios,
      saldos: puede.saldos,
      liderCajas: puede.liderCajas,
    }),
    [
      puede.ver,
      puede.agenda,
      puede.cheques,
      puede.categorias,
      puede.transferencias,
      puede.destinatarios,
      puede.saldos,
      puede.liderCajas,
    ],
  )
  const { pathname, search } = useLocation()
  const navigate = useNavigate()

  const [fase, setFase] = useState<Fase>('cerrado')
  const [oferta, setOferta] = useState(false)
  const [pasos, setPasos] = useState<PasoRecorrido[]>([])
  const [indice, setIndice] = useState(0)
  const [ancla, setAncla] = useState<Ancla>('buscando')

  const recordar = useCallback(() => {
    marcarVisto((clave, valor) => localStorage.setItem(clave, valor), uid)
  }, [uid])

  useEffect(() => {
    if (!uid) return
    if (!estaVisto((clave) => localStorage.getItem(clave), uid)) setOferta(true)
  }, [uid])

  const abrirPregunta = useCallback(() => {
    recordar()
    setOferta(false)
    setFase('pregunta')
  }, [recordar])

  useEffect(() => {
    publicarAbrir(abrirPregunta)
    return () => publicarAbrir(null)
  }, [abrirPregunta])

  const empezar = useCallback(
    (modo: ModoRecorrido) => {
      recordar()
      setOferta(false)
      const lista = pasosDelRecorrido(PASOS_RECORRIDO, {
        modo,
        pathname,
        puedeVerResto: permisos.ver,
      })
      if (lista.length === 0) {
        setFase('cerrado')
        return
      }
      setPasos(lista)
      setIndice(0)
      setAncla('buscando')
      setFase('recorrido')
    },
    [pathname, permisos.ver, recordar],
  )

  const salir = useCallback(() => {
    setFase('cerrado')
    setPasos([])
    setIndice(0)
    setAncla('buscando')
  }, [])

  const siguiente = useCallback(() => {
    const mov = siguientePaso(indice, pasos.length, fase === 'final')
    if (mov.tipo === 'paso') {
      setAncla('buscando')
      setIndice(mov.indice)
    } else if (mov.tipo === 'final') {
      setFase('final')
    }
  }, [fase, indice, pasos.length])

  const anterior = useCallback(() => {
    const mov = anteriorPaso(indice, fase === 'final', pasos.length)
    if (mov.tipo !== 'paso') return
    setFase('recorrido')
    setAncla('buscando')
    setIndice(mov.indice)
  }, [fase, indice, pasos.length])

  const paso = pasos[indice]

  useLayoutEffect(() => {
    if (fase !== 'recorrido' || !paso) return

    if (!ubicacionCoincide(paso.ruta, pathname, search)) {
      setAncla('buscando')
      navigate(paso.ruta, { replace: true })
      return
    }

    const vista = presentarPaso(paso, permisos)
    if (!vista.señalar) {
      setAncla('sin-permiso')
      return
    }

    const hallar = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${paso.selector}"]`)
      if (!el) return null
      return rectUtil(el.getBoundingClientRect()) ? el : null
    }

    if (hallar()) {
      setAncla('señalado')
      return
    }

    setAncla('buscando')
    let cancelado = false
    let timer = 0
    const inicio = performance.now()
    const buscar = () => {
      if (cancelado) return
      if (hallar()) {
        setAncla('señalado')
        return
      }
      if (performance.now() - inicio >= ESPERA_MS) {
        if (paso.opcional) {
          const mov = siguientePaso(indice, pasos.length, false)
          if (mov.tipo === 'paso') {
            setAncla('buscando')
            setIndice(mov.indice)
          } else if (mov.tipo === 'final') {
            setFase('final')
          }
          return
        }
        setAncla('centrado')
        return
      }
      timer = window.setTimeout(buscar, 80)
    }
    timer = window.setTimeout(buscar, 80)
    return () => {
      cancelado = true
      window.clearTimeout(timer)
    }
  }, [fase, indice, paso, pathname, search, permisos, navigate, pasos.length])

  useEffect(() => {
    if (fase !== 'recorrido' && fase !== 'final' && fase !== 'pregunta') return
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (fase === 'pregunta') {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          setFase('cerrado')
        }
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        salir()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        siguiente()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        anterior()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [fase, siguiente, anterior, salir])

  const vista = paso ? presentarPaso(paso, permisos) : null
  const enRecorrido = (fase === 'recorrido' || fase === 'final') && paso && vista
  const selector = fase === 'recorrido' && ancla === 'señalado' && paso ? paso.selector : null

  return (
    <>
      {children}
      {oferta && fase === 'cerrado' ? (
        <OfertaRecorrido onEmpezar={() => empezar('completo')} onAhoraNo={() => { recordar(); setOferta(false) }} />
      ) : null}
      {fase === 'pregunta' ? (
        <PreguntaRecorrido
          onCompleto={() => empezar('completo')}
          onPantalla={() => empezar('pantalla')}
          onCerrar={() => setFase('cerrado')}
        />
      ) : null}
      {enRecorrido ? (
        <RecorridoGlobo
          titulo={fase === 'final' ? TITULO_FINAL : `Paso ${indice + 1} de ${pasos.length} · ${paso.titulo}`}
          texto={fase === 'final' ? TEXTO_FINAL : vista.texto}
          indice={fase === 'final' ? pasos.length : indice}
          total={pasos.length}
          selector={selector}
          esFinal={fase === 'final'}
          puedeAnterior={fase === 'final' || indice > 0}
          puedeSiguiente={fase === 'recorrido'}
          onAnterior={anterior}
          onSiguiente={siguiente}
          onSalir={salir}
        />
      ) : null}
    </>
  )
}
