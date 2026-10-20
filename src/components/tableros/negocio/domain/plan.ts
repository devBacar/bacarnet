import { menos12, mesCorto, M, nf1, pct, suma, tit } from './formato'
import { agrupar, ordenar, ULT_GASTO, ULT_SUE_VIENTRI, type ModeloNegocio } from './modelo'

export type NivelPlan = 'suave' | 'medio' | 'brusco'
export type AreaPlan = 'Más ingresos' | 'Menos gasto' | 'Caja'

interface AccionBase {
  area: AreaPlan
  caja?: boolean
  titulo: string
  m: Record<NivelPlan, number>
  p: Record<NivelPlan, string[]>
  r: string
  i: string
  pl: string
  d: string
}

export interface AccionPlan extends AccionBase {
  valor: number
  pasos: Array<{ t: string; nuevo: boolean }>
}

export interface PlanAccion {
  id: NivelPlan
  nombre: string
  desc: string
  acc: AccionPlan[]
  ing: number
  gas: number
  caja: number
}

/** Plan de acción de 3 niveles. Base fija: gastos de oct 25 a ago 26 y ventas de ene–sep 2026 contra 2025. */
export function construirPlan(modelo: ModeloNegocio): PlanAccion[] {
  const { D, MESES, INF, CL, costosDe, provDe, sv, negocios, faltaSueldo } = modelo
  const GA = MESES.filter((m) => m >= '2025-10' && m <= ULT_GASTO)
  const GB = GA.map(menos12)
  const V26 = MESES.filter((m) => m >= '2026-01' && m <= '2026-09')
  const V25 = V26.map(menos12)
  const anual = (t: number, n: number): number => (t / n) * 12
  const cta = (n: string, ms: string[]): number => suma(costosDe(ms, (r) => r.cuenta === n), (r) => r.imp)
  const NIV: NivelPlan[] = ['suave', 'medio', 'brusco']
  const intF = cta('INTERESES FISCALES', GA), intB = cta('INTERESES', GA), com = cta('COMISIONES Y GTOS. BANCARIOS', GA), dc = cta('IMP. A LOS DEBITOS Y CREDITOS', GA)
  const af = D.cob.deudaImpuestos.find(d => /ADMINISTRACION FEDERAL/.test(d.nombre)) || { pendiente: 0, vencido: 0, masVieja: '' }
  const CONC = ['FLETES Y AUX. MECÁNICOS', 'GASTOS TALLER', 'COMUNICACIONES', 'SERVICIOS P/ RECONTADORAS  SUMADORAS E IMPRESORAS', 'SERVICIOS DE SEGURIDAD PRIVADA CONTRATADA', 'ALQUILER DE PLANTA']
  const FRAG = ['REPUESTOS Y REPARACIONES', 'COMBUSTIBLES Y LUBRICANTES', 'UNIFORME DEL PERSONAL', 'MANTENIMIENTO DE PLANTA', 'VIATICOS BPC', 'LIMPIEZA', 'LIBRERIA IMPRESIONES Y PAPELERIA', 'FERRETERIA Y HERRAMIENTAS VARIAS', 'CUBIERTAS', 'ATENCION AL PERSONAL']
  const ra = costosDe(GA, r => r.cla === 'otr'), rb = costosDe(GB, r => r.cla === 'otr')
  const ca = agrupar(ra, 'cuenta'), cb = agrupar(rb, 'cuenta')
  const disp = Object.keys(ca).filter(c => !CONC.includes(c) && c !== 'INSUMOS Y SERVICIOS INFORMATICOS' && ((cb[c] > 20e6 && ca[c] > cb[c] * (1 + INF + 0.10)) || ((cb[c] || 0) <= 20e6 && ca[c] > 100e6)))
    .map(c => ({ c, a: ca[c], b: cb[c] || 0, ex: ca[c] - (cb[c] || 0) * (1 + INF) })).sort((x, y) => y.ex - x.ex)
  const pv = provDe(GA)
  const top = (c: string) => ordenar(agrupar(pv.filter(p => p.cuenta === c), 'prov'))
  const fragT = suma(FRAG, c => ca[c] || 0), concT = suma(CONC, c => ca[c] || 0)
  const cli = CL.map(c => { const a = sv(c.f, V26), b = sv(c.f, V25), ra_ = sv(c.r, V26), rb_ = sv(c.r, V25); const br = b > 10e6 && a > 0 ? Math.max(0, b * (1 + INF) * (ra_ > 30 && rb_ > 30 ? ra_ / rb_ : 1) - a) : 0; return { c, a, br: br / 9 * 12 } }).filter(x => x.br > 0.05 * x.a / 9 * 12 && x.br > 0)
  cli.sort((a, b) => b.br - a.br)
  const priv = cli.filter(x => !x.c.pub), pub = cli.filter(x => x.c.pub)
  const NM_ = MESES.filter(m => m >= '2025-10' && m <= ULT_SUE_VIENTRI || (m > ULT_SUE_VIENTRI && m <= ULT_GASTO && !faltaSueldo(m)))
  const ng = negocios(NM_), seg = ng.lineas.find(l => l.l === 'seg')!, gru = ng.lineas.find(l => l.l === 'gru')!
  const atr = D.cob.cobroCliente.filter(c => c.atraso > 10 && c.cobrado > 200e6)
  const caja = suma(atr, c => c.cobrado / 21 / 30 * (c.atraso - 5))
  const A: AccionBase[] = [
    { area: 'Más ingresos', titulo: 'Actualizar tarifas de clientes que quedaron atrás de la inflación', m: { suave: 0.5 * suma(priv.slice(0, 5), x => x.br), medio: 0.8 * suma(priv, x => x.br) + 0.5 * suma(pub, x => x.br), brusco: suma(cli, x => x.br) },
      p: { suave: [`Enviar actualización por inflación a los 5 clientes privados más atrasados: ${priv.slice(0, 5).map(x => tit(x.c.n)).join(', ')}.`, 'Agregar a cada contrato privado que se renueve una cláusula de ajuste trimestral por IPC o paritaria.'],
        medio: [`Extender a todos los privados atrasados (${priv.length}).`, `Pedir redeterminación de precios a los públicos atrasados: ${pub.slice(0, 3).map(x => tit(x.c.n)).join(', ')}.`, 'Revisar cada trimestre la pestaña Tarifas.'],
        brusco: ['Llevar a todos al nivel del año anterior más inflación con fecha límite.', 'Al que no acepte, avisar la baja en el próximo vencimiento de contrato.'] },
      r: 'Gerencia comercial', i: 'Tarifa por servicio contra inflación', pl: '60 a 90 días', d: `${cli.length} clientes atrasados; brecha anual ${M(suma(cli, x => x.br))}.` },
    { area: 'Más ingresos', titulo: 'Seguridad privada: cobrar lo que cuesta el servicio', m: { suave: 0, medio: 0.5 * Math.max(0, seg.dir / 0.85 - seg.ing) / NM_.length * 12, brusco: Math.max(0, seg.dir / 0.85 - seg.ing) / NM_.length * 12 },
      p: { suave: ['Calcular el costo por hora de vigilador de cada contrato (sueldo, cargas, horas extra, uniforme).', 'Listar los contratos cuya tarifa no cubre ese costo.'],
        medio: ['En cada renovación, llevar el contrato a 15% de margen sobre costo directo.', 'Trasladar a tarifa cada paritaria del CCT 422/05 dentro del mes.', 'Bajar horas extra con el plan del Tablero de RRHH.'],
        brusco: ['Renegociar ya los contratos con margen negativo; si no aceptan, no renovar.', 'No tomar contratos nuevos por debajo de 15%.'] },
      r: 'Comercial y RRHH', i: 'Margen de seguridad sobre costo directo (meta 15%)', pl: 'Próximas renovaciones', d: `Seguridad factura ${M(seg.ing)} y cuesta ${M(seg.dir)} directo (${pct(seg.sue / seg.ing)} sueldos) entre ${mesCorto(NM_[0])} y ${mesCorto(NM_[NM_.length - 1])}; con su estructura, ${M(seg.res)}.` },
    { area: 'Menos gasto', titulo: 'Pagar los impuestos en fecha', m: { suave: 0.5 * anual(intF, GA.length), medio: 0.8 * anual(intF, GA.length), brusco: anual(intF, GA.length) },
      p: { suave: ['Calendario de vencimientos de ARCA, Rentas y Municipalidad a 6 meses.', 'Pagar impuestos antes que proveedores no críticos.', 'Revisión semanal de vencimientos.'],
        medio: [`Pasar lo vencido con ARCA (${M(af.vencido)} de ${M(af.pendiente)}) a un plan de pagos con tasa menor que la de mora.`],
        brusco: ['Cuenta separada para impuestos con un porcentaje fijo de cada cobranza.', 'Meta: cero intereses fiscales.'] },
      r: 'Administración y contador', i: 'Intereses fiscales del mes = $ 0', pl: '30 días', d: `${M(intF)} de intereses fiscales en ${GA.length} meses.` },
    { area: 'Menos gasto', titulo: 'Bajar el costo de bancos y financieras', m: { suave: 0.10 * anual(intB + com, GA.length), medio: 0.20 * anual(intB + com, GA.length) + 0.05 * anual(dc, GA.length), brusco: 0.35 * anual(intB + com, GA.length) + 0.10 * anual(dc, GA.length) },
      p: { suave: ['Pedir a Banco Provincia, Julio y Patagonia el detalle de comisiones del año.', 'Dar de baja paquetes, chequeras y cuentas sin uso.'],
        medio: ['Pedir cotización de tasa a los tres bancos y llevarle la mejor a Banco Provincia.', `Descontar cheques en el banco y no en financieras (${tit(top('COMISIONES Y GTOS. BANCARIOS')[0]?.[0] || '')}: ${M(top('COMISIONES Y GTOS. BANCARIOS')[0]?.[1] || 0)}).`, 'Pagar desde una sola cuenta para no mover plata entre cuentas propias.'],
        brusco: ['Cancelar primero los préstamos más caros con la caja que liberen las otras medidas.', 'Mover la operatoria si el banco no mejora.'] },
      r: 'Administración', i: 'Intereses + comisiones del mes', pl: '60 días', d: `En ${GA.length} meses: intereses ${M(intB)}, comisiones ${M(com)}, impuesto al cheque ${M(dc)}.` },
    { area: 'Menos gasto', titulo: 'Volver a niveles razonables los gastos que se dispararon', m: { suave: 0.25 * anual(suma(disp, x => x.ex), GA.length), medio: 0.5 * anual(suma(disp, x => x.ex), GA.length), brusco: 0.75 * anual(suma(disp, x => x.ex), GA.length) },
      p: { suave: [`Pedir el detalle de sponsoreos y publicidad (${top('PUBLICIDAD').slice(0, 3).map(([n]) => tit(n)).join(', ')}) y qué contratos trajo cada uno.`, `Dos cotizaciones más para refrigerios (hoy ${tit(top('COMESTIBLES Y REFRIGERIOS')[0]?.[0] || '')}: ${M(top('COMESTIBLES Y REFRIGERIOS')[0]?.[1] || 0)}).`, 'Revisar quién contrata honorarios y con qué contrato.'],
        medio: ['Presupuesto anual de publicidad: 1% de lo facturado.', 'Licitar refrigerios con consumo fijo por puesto.', 'Honorarios en contratos anuales con tope.'],
        brusco: ['Volver al nivel del año anterior más inflación.', 'No renovar sponsoreos sin cliente asociado.'] },
      r: 'Dirección y responsables', i: 'Cada cuenta contra año anterior + inflación', pl: '90 días', d: disp.slice(0, 6).map(x => `${tit(x.c)}: ${M(x.b)} → ${M(x.a)}`).join(' · ') + '. Sistemas no está (inversión oficina nueva).' },
    { area: 'Menos gasto', titulo: 'Comprar a menos proveedores y con convenio', m: { suave: 0.03 * anual(fragT, GA.length), medio: 0.06 * anual(fragT, GA.length), brusco: 0.10 * anual(fragT, GA.length) },
      p: { suave: ['Lista de proveedores aprobados para repuestos y combustible.', 'Orden de compra aprobada para gastos de más de $ 1 millón.'],
        medio: ['Convenio anual con 2 o 3 proveedores por rubro a cambio de descuento.', 'Tarjeta de flota para combustible.', 'Caja chica o tarjeta corporativa para compras chicas.'],
        brusco: ['Licitación anual de repuestos, uniformes, limpieza y mantenimiento.', 'Compras centralizadas en una persona.'] },
      r: 'Compras', i: 'Proveedores por rubro y precio promedio', pl: '90 días', d: FRAG.filter(c => ca[c]).slice(0, 5).map(c => `${tit(c)}: ${M(ca[c])} con ${top(c).length} proveedores`).join(' · ') },
    { area: 'Menos gasto', titulo: 'Revisar precios de servicios con un solo proveedor', m: { suave: 0, medio: 0.05 * anual(concT, GA.length), brusco: 0.10 * anual(concT, GA.length) },
      p: { suave: ['Pedir una cotización de comparación para cada servicio.'], medio: ['Renegociar 5% con el proveedor actual.', 'Confirmar precio de mercado de Filmec (taller y alquiler).'], brusco: ['Licitar donde la comparación sea más de 10% menor.'] },
      r: 'Administración', i: 'Precio contra cotización de mercado', pl: '90 días', d: CONC.filter(c => ca[c]).map(c => `${tit(c)}: ${M(ca[c])} (${top(c).slice(0, 1).map(([n]) => tit(n)).join('')})`).join(' · ') },
    { area: 'Menos gasto', titulo: 'Grúas: decidir si sigue como está', m: { suave: 0, medio: Math.max(0, -gru.contrib) / NM_.length * 12, brusco: Math.max(0, -gru.contrib) / NM_.length * 12 + 0.1 * gru.dir / NM_.length * 12 },
      p: { suave: ['Revisar por qué bajó la facturación y qué gastos tiene.'], medio: ['Subir tarifas o bajar costos hasta cubrir el costo directo.'], brusco: ['Tercerizar o cerrar si en 6 meses no cubre su costo.'] },
      r: 'Dirección', i: 'Contribución mensual de grúas positiva', pl: '6 meses', d: `Grúas facturó ${M(gru.ing)} y gastó ${M(gru.dir)} directo.` },
    { area: 'Caja', caja: true, titulo: 'Cobrar en fecha a los que pagan tarde', m: { suave: 0.5 * caja, medio: 0.8 * caja, brusco: caja },
      p: { suave: ['Llamar a cada cliente con facturas vencidas la semana del vencimiento.'], medio: [`Fecha fija de pago con ${atr.slice(0, 3).map(c => tit(c.cliente)).join(', ')}.`, 'Resumen de cuenta junto con cada factura.'], brusco: ['Interés por mora según contrato o suspensión de servicios no críticos a los 30 días.'] },
      r: 'Cobranzas', i: `Días de cobro (hoy ${nf1.format(D.cob.diasCobro)})`, pl: '30 días', d: atr.slice(0, 5).map(c => `${tit(c.cliente)} (${nf1.format(c.atraso)} días tarde)`).join(', ') + '. Es plata que entra antes una sola vez.' },
  ]
  return NIV.map((id, n): PlanAccion => {
    const acc: AccionPlan[] = A.map(a => ({ ...a, valor: a.m[id] || 0, pasos: NIV.slice(0, n + 1).flatMap((lv, i) => (a.p[lv] || []).map(t => ({ t, nuevo: lv === id && i > 0 }))) }))
    const t = (ar: AreaPlan): number => suma(acc.filter(a => a.area === ar), a => a.valor)
    return { id, nombre: ({ suave: 'Plan suave', medio: 'Plan medio', brusco: 'Plan brusco' } as Record<NivelPlan, string>)[id], desc: ({ suave: 'Lo que se hace desde administración sin negociar con nadie.', medio: 'Lo del plan suave más negociar tarifas, tasas, convenios y presupuesto de publicidad.', brusco: 'Todas las palancas al máximo razonable.' } as Record<NivelPlan, string>)[id], acc, ing: t('Más ingresos'), gas: t('Menos gasto'), caja: t('Caja') }
  })
}
