import { describe, expect, it } from 'vitest'
import {
  ESTADOS_INTERBANKING,
  presentarEstadoInterbanking,
} from './estado-interbanking.js'

const AHORA_ANTES = new Date('2026-12-01T21:59:00.000Z') // 18:59 ART
const AHORA_DESPUES = new Date('2026-12-01T22:00:00.000Z') // 19:00 ART

describe('presentarEstadoInterbanking', () => {
  it('traduce cada estado del spec a un rótulo simple', () => {
    const casos: Array<[string, string, string]> = [
      ['Confeccionada', 'Falta firmar', 'pendiente'],
      ['En autorización', 'Firmada en parte: falta otra firma', 'pendiente'],
      ['Autorizada', 'Firmada: falta enviar', 'pendiente'],
      ['Enviada banco débito', 'Enviada al banco', 'enviada'],
      ['Recibida por la red', 'Programada para su fecha', 'pendiente'],
      ['Ejecutada', 'Hecha', 'hecha'],
      ['Rechazada banco débito', 'Rechazada por el banco', 'rechazada'],
      ['Rechazada banco crédito', 'Rechazada por el banco', 'rechazada'],
      ['Rechazada por la red', 'Rechazada por el banco', 'rechazada'],
      ['Anulada', 'Anulada', 'pendiente'],
    ]
    for (const [estado, rotulo, tono] of casos) {
      expect(presentarEstadoInterbanking({ estado, now: AHORA_ANTES })).toMatchObject({ rotulo, tono })
    }
  })

  it('cubre la tabla completa del spec', () => {
    expect(Object.keys(ESTADOS_INTERBANKING)).toEqual([
      'confeccionada',
      'en autorizacion',
      'autorizada',
      'enviada banco debito',
      'enviada banco credito',
      'recibida por la red',
      'ejecutada',
      'rechazada banco debito',
      'rechazada banco credito',
      'rechazada por la red',
      'anulada',
    ])
  })

  it('Enviada banco crédito queda hecha desde las 19 hs del día de solicitud', () => {
    const antes = presentarEstadoInterbanking({
      estado: 'Enviada banco crédito',
      fechaSolicitud: '2026-12-01',
      now: AHORA_ANTES,
    })
    const despues = presentarEstadoInterbanking({
      estado: 'Enviada banco crédito',
      fechaSolicitud: '2026-12-01',
      now: AHORA_DESPUES,
    })
    expect(antes).toMatchObject({ rotulo: 'Enviada al banco', tono: 'enviada', final: false })
    expect(despues).toMatchObject({ rotulo: 'Hecha', tono: 'hecha', final: true })
  })

  it('un estado desconocido no se da por terminado', () => {
    expect(presentarEstadoInterbanking({ estado: 'En proceso raro' })).toMatchObject({
      rotulo: 'En proceso raro',
      tono: 'pendiente',
      final: false,
    })
    expect(presentarEstadoInterbanking({ estado: '  ' })).toBeNull()
  })
})
