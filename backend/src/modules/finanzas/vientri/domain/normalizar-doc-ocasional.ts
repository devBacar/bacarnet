import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'

/**
 * Los docs guardados por versiones viejas de la importación pueden no tener algunos campos. Como ahora
 * la importación no borra lo anterior, esos docs siguen en la base y se leen junto con los nuevos:
 * se completan con valores vacíos para que el resto del código (y Firestore, que no acepta `undefined`) no falle.
 */
export function normalizarDocOcasional(d: ChequeOcasionalDoc): ChequeOcasionalDoc {
  return {
    ...d,
    beneficiarioFormal: d.beneficiarioFormal ?? null,
    beneficiarioCuit: d.beneficiarioCuit ?? null,
    fechaVencimiento: d.fechaVencimiento ?? null,
    fechaEmision: d.fechaEmision ?? null,
    estadoCodigo: d.estadoCodigo ?? null,
    pagado: d.pagado ?? false,
    esProveedorFinanciero: d.esProveedorFinanciero ?? false,
    tipoProveedor: d.tipoProveedor ?? null,
    esRenovacion: d.esRenovacion ?? false,
    renovacionDe: d.renovacionDe ?? [],
    renovadoPor: d.renovadoPor ?? [],
    operacionUsd: d.operacionUsd ?? null,
    tasaExplicita: d.tasaExplicita ?? null,
    rolEnOperacion: d.rolEnOperacion ?? null,
    obsOriginal: d.obsOriginal ?? '',
    revisar: d.revisar ?? [],
    proveedorFinancieroId: d.proveedorFinancieroId ?? null,
    esCompraIva: d.esCompraIva ?? false,
    sugerencia: d.sugerencia ?? null,
    interesSugerido: d.interesSugerido ?? null,
    clasificacionManual: d.clasificacionManual ?? null,
    fechaConciliado: d.fechaConciliado ?? null,
    vientriChqId: d.vientriChqId ?? null,
    baja: d.baja ?? false,
  }
}
