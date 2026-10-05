import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../context'
import type { PermisosFinanzasEfectivos } from '../../../services/userService'
import { usePermisosFinanzas } from '../permisosFinanzas'
import { GUIAS } from './guias'
import { OfertaRecorrido } from './OfertaRecorrido'
import { PanelAyuda } from './PanelAyuda'
import { PASEO } from './paseo'
import {
  TEXTO_FINAL_GUIA,
  TEXTO_FINAL_PASEO,
  TEXTO_VENTANA_CERRADA,
  TITULO_FINAL,
  type Guia,
  type PasoRecorrido,
} from './pasosRecorrido'
import { RecorridoGlobo } from './RecorridoGlobo'
import { buscarElemento, existeElemento } from './recorridoDom'
import {
  anteriorPaso,
  avisoSinPermiso,
  ESPERA_TOQUE_MS,
  estaVisto,
  evaluarEspera,
  guiasAccesibles,
  marcarVisto,
  pasoAlCerrarVentana,
  pasosDelRecorrido,
  presentarPaso,
  selectorEsperado,
  siguientePaso,
  ubicacionCoincide,
} from './recorridoLogica'
import { publicarAbrir } from './recorridoPuente'

type Fase = 'cerrado' | 'ayuda' | 'recorrido' | 'final'
type Ancla = 'buscando' | 'señalado' | 'centrado' | 'sin-permiso'
type Recorrido = { tipo: 'paseo' } | { tipo: 'guia'; guia: Guia; aviso: string | null }

const ESPERA_MS = 3000
const PULSO_MS = 150

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
  const [recorrido, setRecorrido] = useState<Recorrido | null>(null)
  const [pasos, setPasos] = useState<PasoRecorrido[]>([])
  const [indice, setIndice] = useState(0)
  const [ancla, setAncla] = useState<Ancla>('buscando')
  /** La guía dejó de señalar (sin permiso, sin datos o "No lo encuentro"): solo explica. */
  const [soloExplicar, setSoloExplicar] = useState(false)
  const [ofrecerSalida, setOfrecerSalida] = useState(false)
  const [textoFinal, setTextoFinal] = useState(TEXTO_FINAL_PASEO)
  const ventanaVista = useRef(false)

  const recordar = useCallback(() => {
    marcarVisto((clave, valor) => localStorage.setItem(clave, valor), uid)
  }, [uid])

  useEffect(() => {
    if (!uid) return
    if (!estaVisto((clave) => localStorage.getItem(clave), uid)) setOferta(true)
  }, [uid])

  const abrirAyuda = useCallback(() => {
    recordar()
    setOferta(false)
    setFase('ayuda')
  }, [recordar])

  useEffect(() => {
    publicarAbrir(abrirAyuda)
    return () => publicarAbrir(null)
  }, [abrirAyuda])

  const arrancar = useCallback((lista: PasoRecorrido[], nuevo: Recorrido) => {
    if (lista.length === 0) {
      setFase('cerrado')
      return
    }
    setRecorrido(nuevo)
    setPasos(lista)
    setIndice(0)
    setAncla('buscando')
    setSoloExplicar(nuevo.tipo === 'guia' && nuevo.aviso !== null)
    setOfrecerSalida(false)
    setTextoFinal(nuevo.tipo === 'paseo' ? TEXTO_FINAL_PASEO : TEXTO_FINAL_GUIA)
    ventanaVista.current = false
    setFase('recorrido')
  }, [])

  const empezarPaseo = useCallback(() => {
    recordar()
    setOferta(false)
    arrancar(pasosDelRecorrido(PASEO, { modo: 'completo', pathname, puedeVerResto: permisos.ver }), { tipo: 'paseo' })
  }, [arrancar, pathname, permisos.ver, recordar])

  const empezarGuia = useCallback(
    (guia: Guia) => {
      recordar()
      arrancar(guia.pasos, { tipo: 'guia', guia, aviso: avisoSinPermiso(guia, permisos) })
    },
    [arrancar, permisos, recordar],
  )

  const salir = useCallback(() => {
    setFase('cerrado')
    setRecorrido(null)
    setPasos([])
    setIndice(0)
    setAncla('buscando')
    setSoloExplicar(false)
    setOfrecerSalida(false)
  }, [])

  const irA = useCallback((nuevoIndice: number) => {
    setAncla('buscando')
    setOfrecerSalida(false)
    ventanaVista.current = false
    setIndice(nuevoIndice)
  }, [])

  const terminar = useCallback((texto: string) => {
    setTextoFinal(texto)
    setOfrecerSalida(false)
    setFase('final')
  }, [])

  const avanzar = useCallback(() => {
    const mov = siguientePaso(indice, pasos.length, fase === 'final')
    if (mov.tipo === 'paso') irA(mov.indice)
    else if (mov.tipo === 'final') terminar(recorrido?.tipo === 'paseo' ? TEXTO_FINAL_PASEO : TEXTO_FINAL_GUIA)
  }, [fase, indice, irA, pasos.length, recorrido, terminar])

  const paso = pasos[indice]
  const esGuia = recorrido?.tipo === 'guia'
  const esperandoToque =
    fase === 'recorrido' && esGuia && paso?.tipo === 'tocar' && !soloExplicar && ancla === 'señalado'

  const siguiente = useCallback(() => {
    if (esperandoToque) return
    avanzar()
  }, [avanzar, esperandoToque])

  const verComoSigue = useCallback(() => {
    setSoloExplicar(true)
    avanzar()
  }, [avanzar])

  const anterior = useCallback(() => {
    const mov = anteriorPaso(indice, fase === 'final', pasos.length)
    if (mov.tipo !== 'paso') return
    setFase('recorrido')
    irA(mov.indice)
  }, [fase, indice, irA, pasos.length])

  // Ubicar el paso: navegar si hace falta y buscar el elemento a señalar.
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

    if (buscarElemento(paso.selector)) {
      setAncla('señalado')
      return
    }

    if (soloExplicar) {
      setAncla('centrado')
      return
    }

    setAncla('buscando')
    let cancelado = false
    let timer = 0
    const inicio = performance.now()
    const buscar = () => {
      if (cancelado) return
      if (buscarElemento(paso.selector)) {
        setAncla('señalado')
        return
      }
      if (performance.now() - inicio >= ESPERA_MS) {
        if (paso.opcional) {
          const mov = siguientePaso(indice, pasos.length, false)
          if (mov.tipo === 'paso') irA(mov.indice)
          else if (mov.tipo === 'final') terminar(esGuia ? TEXTO_FINAL_GUIA : TEXTO_FINAL_PASEO)
          return
        }
        if (esGuia && (paso.sinDatos || paso.tipo === 'tocar' || paso.tipo === 'completar')) setSoloExplicar(true)
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
  }, [fase, indice, paso, pathname, search, permisos, navigate, pasos.length, soloExplicar, esGuia, irA, terminar])

  // Paso "tocar": avanzar solo cuando aparece lo que abre el toque; a los 8 s, ofrecer "No lo encuentro".
  useEffect(() => {
    if (!esperandoToque) return
    const esperado = selectorEsperado(pasos, indice)
    if (!esperado) return
    const inicio = performance.now()
    const timer = window.setInterval(() => {
      const estado = evaluarEspera({
        aparecio: existeElemento(esperado),
        transcurridoMs: performance.now() - inicio,
        limiteMs: ESPERA_TOQUE_MS,
      })
      if (estado === 'avanzar') {
        window.clearInterval(timer)
        avanzar()
      } else if (estado === 'ofrecer-salida') {
        setOfrecerSalida(true)
      }
    }, PULSO_MS)
    return () => window.clearInterval(timer)
  }, [esperandoToque, pasos, indice, avanzar])

  // Si la persona cierra la ventana a mitad de la guía, volvemos un paso o terminamos.
  useEffect(() => {
    if (fase !== 'recorrido' || !esGuia || soloExplicar || !paso?.ventana) return
    const ventana = paso.ventana
    const timer = window.setInterval(() => {
      const abierta = existeElemento(ventana)
      if (abierta) {
        ventanaVista.current = true
        return
      }
      if (!ventanaVista.current) return
      // Si el toque de este paso abrió otra ventana, el avance lo maneja el paso "tocar".
      const esperado = selectorEsperado(pasos, indice)
      if (esperado && existeElemento(esperado)) return
      window.clearInterval(timer)
      const reaccion = pasoAlCerrarVentana(pasos, indice)
      if (reaccion.tipo === 'paso') irA(reaccion.indice)
      else if (reaccion.tipo === 'final') terminar(TEXTO_FINAL_GUIA)
      else terminar(TEXTO_VENTANA_CERRADA)
    }, PULSO_MS)
    return () => window.clearInterval(timer)
  }, [fase, esGuia, soloExplicar, paso, pasos, indice, irA, terminar])

  useEffect(() => {
    if (fase !== 'recorrido' && fase !== 'final' && fase !== 'ayuda') return
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (fase === 'ayuda') {
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
        if (esGuia && esTexto(event.target)) return
        event.preventDefault()
        siguiente()
      } else if (event.key === 'ArrowLeft') {
        if (esGuia && esTexto(event.target)) return
        event.preventDefault()
        anterior()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [fase, siguiente, anterior, salir, esGuia])

  const vista = paso ? presentarPaso(paso, permisos) : null
  const enRecorrido = (fase === 'recorrido' || fase === 'final') && paso && vista && recorrido
  const selector = fase === 'recorrido' && ancla === 'señalado' && paso ? paso.selector : null
  const textoPaso = () => {
    if (!paso || !vista) return ''
    if (!vista.señalar) return vista.texto
    if (soloExplicar && ancla === 'centrado' && paso.sinDatos) return paso.sinDatos
    return paso.texto
  }
  const guias = useMemo(() => guiasAccesibles(GUIAS, permisos.ver), [permisos.ver])

  return (
    <>
      {children}
      {oferta && fase === 'cerrado' ? (
        <OfertaRecorrido onEmpezar={empezarPaseo} onAhoraNo={() => { recordar(); setOferta(false) }} />
      ) : null}
      {fase === 'ayuda' ? (
        <PanelAyuda
          pathname={pathname}
          guias={guias}
          permisos={permisos}
          onPaseo={empezarPaseo}
          onGuia={empezarGuia}
          onCerrar={() => setFase('cerrado')}
        />
      ) : null}
      {enRecorrido ? (
        <RecorridoGlobo
          titulo={fase === 'final' ? TITULO_FINAL : `Paso ${indice + 1} de ${pasos.length} · ${paso.titulo}`}
          texto={fase === 'final' ? textoFinal : textoPaso()}
          indice={fase === 'final' ? pasos.length : indice}
          total={pasos.length}
          selector={selector}
          esFinal={fase === 'final'}
          aviso={recorrido.tipo === 'guia' ? recorrido.aviso : null}
          dejarPasar={esGuia && fase === 'recorrido'}
          esperando={Boolean(esperandoToque)}
          ofrecerSalida={Boolean(esperandoToque) && ofrecerSalida}
          sinFoco={esGuia && paso.tipo === 'completar'}
          puedeAnterior={fase === 'final' || indice > 0}
          puedeSiguiente={fase === 'recorrido'}
          textoSalir={esGuia ? 'Salir de la guía' : 'Salir del paseo'}
          onAnterior={anterior}
          onSiguiente={siguiente}
          onVerComoSigue={verComoSigue}
          onSalir={salir}
        />
      ) : null}
    </>
  )
}

function esTexto(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable
}
