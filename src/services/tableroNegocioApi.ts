import type { DatosTableroNegocio } from '../components/tableros/negocio/domain/tipos'
import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

export type { DatosTableroNegocio }

export interface RespuestaTableroNegocio {
  /** modifiedTime de datos.json en Drive (ISO). */
  actualizado: string
  datos: DatosTableroNegocio
}

export async function fetchDatosTableroNegocio(): Promise<RespuestaTableroNegocio> {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  const headers = new Headers()
  headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(resolveApiUrl('/api/tableros/negocio/datos'), { headers })
  if (!res.ok) {
    let mensaje = 'No se pudo cargar el tablero de Negocio'
    try {
      const data = (await res.json()) as { error?: string }
      if (data.error) mensaje = data.error
    } catch {
      /* el cuerpo no era JSON */
    }
    throw new Error(mensaje)
  }
  return (await res.json()) as RespuestaTableroNegocio
}
