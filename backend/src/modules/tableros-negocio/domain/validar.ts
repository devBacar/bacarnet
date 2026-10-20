/**
 * Validación mínima de forma del `datos.json` del tablero de Negocio. No interpreta los números: solo se asegura de
 * que lleguen las claves que el tablero necesita, para devolver un error claro en vez de romper la pantalla.
 */

const ARREGLOS = ['meses', 'cuentas', 'ccs', 'cats', 'provs', 'costos', 'prov', 'clientes', 'inversiones'] as const
const OBJETOS = ['lineasIng', 'compras', 'cobTot', 'dolar', 'cob'] as const

export type ResultadoValidacion = { ok: true } | { ok: false; error: string }

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function validarDatosNegocio(datos: unknown): ResultadoValidacion {
  if (!esObjeto(datos)) return { ok: false, error: 'datos.json no es un objeto' }
  for (const clave of ARREGLOS) {
    if (!Array.isArray(datos[clave])) return { ok: false, error: `datos.json: falta la lista "${clave}"` }
  }
  for (const clave of OBJETOS) {
    if (!esObjeto(datos[clave])) return { ok: false, error: `datos.json: falta el bloque "${clave}"` }
  }
  if ((datos.meses as unknown[]).length === 0) return { ok: false, error: 'datos.json: "meses" está vacío' }
  if (!(datos.meses as unknown[]).every((m) => typeof m === 'string' && /^\d{4}-\d{2}$/.test(m))) {
    return { ok: false, error: 'datos.json: "meses" tiene que ser una lista de AAAA-MM' }
  }
  if (typeof datos.inflacion !== 'number' || !Number.isFinite(datos.inflacion)) {
    return { ok: false, error: 'datos.json: falta "inflacion" (número)' }
  }
  const cob = datos.cob as Record<string, unknown>
  for (const clave of ['deudaClientes', 'deudaProveedores', 'deudaImpuestos'] as const) {
    if (!Array.isArray(cob[clave])) return { ok: false, error: `datos.json: falta "cob.${clave}"` }
  }
  if (datos.rrhh !== undefined && datos.rrhh !== null) {
    if (!esObjeto(datos.rrhh) || !esObjeto(datos.rrhh.meses)) return { ok: false, error: 'datos.json: "rrhh" tiene que traer "meses"' }
  }
  return { ok: true }
}
