/** Errores que ve la persona de Finanzas, con un HTTP claro. */
export class ExtractoConsultaError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'ExtractoConsultaError'
    this.status = status
  }
}

/** El banco rechazó la consulta o mandó un extracto que no se puede leer. */
export class ExtractoBancoError extends Error {
  readonly status: number
  readonly code: string | null
  readonly detalle: string | null

  constructor(message: string, status = 502, code: string | null = null, detalle: string | null = null) {
    super(message)
    this.name = 'ExtractoBancoError'
    this.status = status
    this.code = code
    this.detalle = detalle
  }
}
