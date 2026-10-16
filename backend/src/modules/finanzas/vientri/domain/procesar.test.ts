import { describe, expect, it } from 'vitest'
import { CarpetaInvalidaError, procesarCarpeta } from './procesar.js'

// Carpeta mínima inventada.
function carpeta(overrides: Record<string, string> = {}): Map<string, string> {
  const archivos: Record<string, string> = {
    'personas.csv': 'vientri_id;nombre;cuit;es_cliente;es_proveedor;baja\n1;EMPRESA PROPIA;;0;0;0\n50;Cliente Uno;;1;0;0\n60;Proveedor Dos;;0;1;0\n',
    'comprobantes.csv':
      'vientri_id;id_tipo;nom_tipo;letra;punto_venta;numero;id_persona;fecha;fecha_vto;total;importe_pendiente;abierto;id_divisa;baja\n' +
      '10;1;FAC;A;1;123;60;2026-10-01;2026-10-31;1000.00;400.00;1;1;0\n' +
      '11;2;FAV;A;2;55;50;2026-10-02;2026-11-02;2000.00;2000.00;1;1;0\n' +
      '12;1;FAC;A;1;124;60;2026-10-01;2026-10-31;300.00;0.00;0;1;0\n',
    'aplicaciones.csv': 'vientri_id;id_cmp;id_cmp_cancelado;importe;baja\n',
    'medios_pago.csv': 'vientri_id;id_cmp;id_medio;importe\n',
    'cheques.csv':
      'vientri_id;numero;id_banco;echeq;librador_es_bacar;id_persona_librador;importe;id_estado;rechazado;fecha_vto;baja\n' +
      '1;E-CHEQ 00000001;20;1;0;50;1000.00;1;0;2026-11-01;0\n',
    'cheques_propios.csv': 'vientri_id;numero;numero_completo;id_banco;importe;pagado;fecha_vto;id_cheque;baja\n',
    'bancos.csv': 'vientri_id;nombre;abreviatura\n20;BANCO A S.A.;Banco A\n',
    'cuentas.csv': 'tipo;vientri_id;descripcion\n',
    'cotizaciones.csv': 'fecha;id_divisa;simbolo;cotizacion\n2026-10-15;1;$;1.000000\n',
    ...overrides,
  }
  const control = [
    'archivo;filas;suma_importe;max_fecsys;fecha_datos;modo;desde_fecsys;version_contrato',
    'personas.csv;3;0;;2026-10-15T10:04:00;completo;;0.2',
    'comprobantes.csv;3;3300.00;;2026-10-15T10:04:00;completo;;0.2',
    'aplicaciones.csv;0;0;;2026-10-15T10:04:00;completo;;0.2',
    'medios_pago.csv;0;0;;2026-10-15T10:04:00;completo;;0.2',
    'cheques.csv;1;1000.00;;2026-10-15T10:04:00;completo;;0.2',
    'cheques_propios.csv;0;0;;2026-10-15T10:04:00;completo;;0.2',
    'bancos.csv;1;0;;2026-10-15T10:04:00;completo;;0.2',
    'cuentas.csv;0;0;;2026-10-15T10:04:00;completo;;0.2',
    'cotizaciones.csv;1;1.00;;2026-10-15T10:04:00;completo;;0.2',
  ].join('\n')
  return new Map(Object.entries({ '_control.csv': control, ...archivos }))
}

describe('procesarCarpeta', () => {
  it('arma cheques y pendientes de pago y de cobro', () => {
    const r = procesarCarpeta(carpeta())
    expect(r.control.fechaDatos).toBe('2026-10-15T10:04:00')
    expect(r.cheques).toHaveLength(1)
    expect(r.cheques[0].bancoNombre).toBe('Banco A')
    expect(r.pendientes.map((p) => [p.clave, p.lado, p.pendienteCentavos])).toEqual([
      ['cmp-10', 'pagar', 40000],
      ['cmp-11', 'cobrar', 200000],
    ])
    expect(r.pendientes[0].comprobante).toBe('FAC A 0001-00000123')
  })

  it('frena si falta _control.csv (exportación incompleta)', () => {
    const c = carpeta()
    c.delete('_control.csv')
    expect(() => procesarCarpeta(c)).toThrow(CarpetaInvalidaError)
  })

  it('frena si las filas no coinciden con el control', () => {
    const c = carpeta({ 'cheques.csv': 'vientri_id;numero;id_banco;echeq;librador_es_bacar;importe;id_estado;fecha_vto;baja\n' })
    expect(() => procesarCarpeta(c)).toThrow(/cheques\.csv/)
  })
})
