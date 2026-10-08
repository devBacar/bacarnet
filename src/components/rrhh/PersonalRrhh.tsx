import { useMemo, useState, type ReactNode } from 'react'
import type { CortePersonalRrhh, DatoPrivadoRrhh, ItemDistribucionRrhh, PersonalAgregadoRrhh, PersonalDetalleRrhh, PersonaPersonalRrhh, RangoPersonalRrhh } from '../../services/rrhhApi'
import { BotonExportarRrhh } from './BotonExportarRrhh'
import { descargarCsv, nombreArchivo } from './exportarRrhh'
import { mesLargo, numero, numero1 } from './formatoRrhh'
import { GraficoBarras } from './GraficoBarrasRrhh'
import { porcentaje } from './indicadoresDatos'
import { BandaRrhh, NumerosGrandes, NotaRrhh, TituloDetalle } from './ResumenSimpleRrhh'
import { TarjetaRrhh } from './TarjetaRrhh'

function celdaPct(v: DatoPrivadoRrhh): string {
  return v === 'menos de 3' ? 'menos de 3' : porcentaje(v)
}

function celdaNum(v: DatoPrivadoRrhh): string {
  return v === 'menos de 3' ? 'menos de 3' : numero(v)
}

function prom(v: number | null): string {
  return v === null ? 'Sin dato' : numero1(v)
}

function Tabla({ children, minimo = 640 }: { children: ReactNode; minimo?: number }) {
  return (
    <div className="max-w-full overflow-x-auto">
      <table className="w-full border-collapse text-[14.5px]" style={{ minWidth: minimo }}>
        {children}
      </table>
    </div>
  )
}

function Th({ children, izq }: { children?: ReactNode; izq?: boolean }) {
  return <th className={`px-2 py-2 text-[12.5px] font-semibold text-neutral-600 dark:text-gray-400 ${izq ? 'text-left' : 'text-right'}`}>{children}</th>
}

function Barras({ titulo, rangos }: { titulo: string; rangos: RangoPersonalRrhh[] }) {
  const visibles = rangos.filter((r) => r.cantidad > 0 || r.id !== 'sinDato')
  return (
    <TarjetaRrhh titulo={titulo}>
      <GraficoBarras
        etiquetas={visibles.map((r) => r.nombre)}
        subetiquetas={visibles.map(() => '')}
        estimados={visibles.map(() => false)}
        series={[{ nombre: 'Personas', color: '#1f3b63', valores: visibles.map((r) => r.cantidad) }]}
        formato={(v) => numero(v)}
        apilado={false}
      />
    </TarjetaRrhh>
  )
}

function ListaDistribucion({ titulo, items, cargado }: { titulo: string; items: ItemDistribucionRrhh[]; cargado: string }) {
  const max = Math.max(1, ...items.map((i) => i.cantidad))
  return (
    <TarjetaRrhh titulo={titulo} subtitulo={cargado}>
      <ul className="grid gap-2">
        {items.map((i) => (
          <li key={i.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-[15px]">
            <span>{i.nombre}</span>
            <strong className="tabular-nums">{numero(i.cantidad)}</strong>
            <span className="col-span-2 block h-2 rounded bg-neutral-100 dark:bg-zinc-800">
              <span className="block h-2 rounded bg-[#1f3b63]" style={{ width: `${(i.cantidad / max) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </TarjetaRrhh>
  )
}

function filasCorte(lista: CortePersonalRrhh[]): (string | number)[][] {
  return lista.map((c) => [
    c.nombre,
    c.personas,
    c.edadPromedio ?? '',
    c.antiguedadPromedio ?? '',
    celdaPct(c.pctMujeres),
    celdaPct(c.pctConHijos),
    celdaNum(c.discapacidad),
  ])
}

const ENCABEZADO_CORTE = ['Grupo', 'Personas', 'Edad promedio', 'Antigüedad promedio', 'Mujeres', 'Con hijos', 'Familiares con discapacidad']

function TablaCortes({ titulo, subtitulo, lista, archivo }: { titulo: string; subtitulo: string; lista: CortePersonalRrhh[]; archivo: string }) {
  return (
    <TarjetaRrhh
      titulo={titulo}
      subtitulo={subtitulo}
      derecha={
        <BotonExportarRrhh
          onClick={() => descargarCsv(nombreArchivo(archivo), ENCABEZADO_CORTE, filasCorte(lista))}
        />
      }
    >
      <Tabla minimo={820}>
        <thead>
          <tr>
            <Th izq>Grupo</Th>
            <Th>Personas</Th>
            <Th>Edad promedio</Th>
            <Th>Antigüedad promedio</Th>
            <Th>Mujeres</Th>
            <Th>Con hijos</Th>
            <Th>Con discapacidad en la familia</Th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {lista.map((c) => (
            <tr key={c.id} className="border-t border-neutral-100 dark:border-zinc-800">
              <td className="py-2 pr-2">{c.nombre}</td>
              <td className="px-2 py-2 text-right">{numero(c.personas)}</td>
              <td className="px-2 py-2 text-right">{prom(c.edadPromedio)}</td>
              <td className="px-2 py-2 text-right">{prom(c.antiguedadPromedio)}</td>
              <td className="px-2 py-2 text-right">{celdaPct(c.pctMujeres)}</td>
              <td className="px-2 py-2 text-right">{celdaPct(c.pctConHijos)}</td>
              <td className="px-2 py-2 text-right">{celdaNum(c.discapacidad)}</td>
            </tr>
          ))}
        </tbody>
      </Tabla>
      <p className="mt-3 text-[13px] text-neutral-600 dark:text-gray-400">
        Si un grupo de mujeres, de varones o de familiares con discapacidad tiene menos de 3 personas, se muestra «menos de 3».
      </p>
    </TarjetaRrhh>
  )
}

type Columna = 'legajo' | 'nombre' | 'area' | 'convenio' | 'edad' | 'antiguedad' | 'sexo' | 'contrato' | 'hijos'

const COLUMNAS: { id: Columna; nombre: string; izq?: boolean }[] = [
  { id: 'legajo', nombre: 'Legajo' },
  { id: 'nombre', nombre: 'Persona', izq: true },
  { id: 'area', nombre: 'Área', izq: true },
  { id: 'convenio', nombre: 'Convenio', izq: true },
  { id: 'edad', nombre: 'Edad' },
  { id: 'antiguedad', nombre: 'Antigüedad' },
  { id: 'sexo', nombre: 'Sexo', izq: true },
  { id: 'contrato', nombre: 'Contrato', izq: true },
  { id: 'hijos', nombre: 'Hijos' },
]

function valorOrden(p: PersonaPersonalRrhh, col: Columna): string | number {
  if (col === 'convenio') return p.convenioNombre
  if (col === 'edad') return p.edad ?? -1
  if (col === 'antiguedad') return p.antiguedad ?? -1
  return p[col]
}

function ListaPersonas({ personas }: { personas: PersonaPersonalRrhh[] }) {
  const [buscar, setBuscar] = useState('')
  const [col, setCol] = useState<Columna>('nombre')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const texto = buscar.trim().toLowerCase()
  const visibles = useMemo(() => {
    const filtradas = texto
      ? personas.filter((p) => p.nombre.toLowerCase().includes(texto) || String(p.legajo).includes(texto) || p.area.toLowerCase().includes(texto))
      : personas
    const copia = [...filtradas]
    copia.sort((a, b) => {
      const va = valorOrden(a, col)
      const vb = valorOrden(b, col)
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es')
      return dir === 'asc' ? cmp : -cmp
    })
    return copia
  }, [personas, texto, col, dir])

  const ordenar = (id: Columna) => {
    if (id === col) setDir(dir === 'asc' ? 'desc' : 'asc')
    else {
      setCol(id)
      setDir(id === 'nombre' || id === 'area' || id === 'convenio' || id === 'sexo' || id === 'contrato' ? 'asc' : 'desc')
    }
  }

  return (
    <TarjetaRrhh
      titulo="Lista por persona"
      subtitulo="Solo la ve el perfil de RRHH."
      derecha={
        <BotonExportarRrhh
          onClick={() =>
            descargarCsv(
              nombreArchivo('personal', 'lista'),
              ['Legajo', 'Persona', 'Área', 'Convenio', 'Edad', 'Antigüedad', 'Sexo', 'Contrato', 'Hijos cargados'],
              visibles.map((p) => [p.legajo, p.nombre, p.area, p.convenioNombre, p.edad ?? '', p.antiguedad ?? '', p.sexo, p.contrato, p.hijos]),
            )
          }
        />
      }
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-neutral-800 dark:text-gray-200">
          <strong>{numero(visibles.length)}</strong> personas
        </p>
        <input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar por nombre, legajo o área"
          className="w-full max-w-sm rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-[14px] dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <Tabla minimo={980}>
        <thead>
          <tr>
            {COLUMNAS.map((c) => (
              <th key={c.id} className={`px-2 py-2 text-[12.5px] font-semibold text-neutral-600 dark:text-gray-400 ${c.izq ? 'text-left' : 'text-right'}`}>
                <button type="button" onClick={() => ordenar(c.id)} className="underline-offset-2 hover:underline">
                  {c.nombre}
                  {col === c.id ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {visibles.map((p) => (
            <tr key={p.legajo} className="border-t border-neutral-100 dark:border-zinc-800">
              <td className="px-2 py-1.5 text-right text-neutral-500">{p.legajo}</td>
              <td className="py-1.5 pr-2">{p.nombre}</td>
              <td className="px-2 py-1.5">{p.area}</td>
              <td className="px-2 py-1.5">{p.convenioNombre}</td>
              <td className="px-2 py-1.5 text-right">{p.edad === null ? 'Sin dato' : numero(p.edad)}</td>
              <td className="px-2 py-1.5 text-right">{p.antiguedad === null ? 'Sin dato' : numero1(p.antiguedad)}</td>
              <td className="px-2 py-1.5">{p.sexo}</td>
              <td className="px-2 py-1.5">{p.contrato}</td>
              <td className="px-2 py-1.5 text-right">{numero(p.hijos)}</td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </TarjetaRrhh>
  )
}

/** Edades, antigüedad, estudios y familia de las personas liquidadas en el último período cerrado. */
export function PersonalRrhh({ personal, detalle }: { personal: PersonalAgregadoRrhh; detalle: PersonalDetalleRrhh | null }) {
  const f = personal.familia
  const c = personal.calidad
  const aniv = personal.aniversarios.porAnios.filter((a) => a.cantidad > 0)

  return (
    <div className="grid gap-5">
      <BandaRrhh
        titulo="Personal"
        subtitulo={
          <>
            {personal.mes ? mesLargo(personal.mes) : 'Último período cerrado'} · {numero(personal.dotacion)} personas
            <span className="block text-[14px] opacity-90">{personal.nota}</span>
          </>
        }
        tono="real"
      />

      <NumerosGrandes
        items={[
          { etiqueta: 'Dotación', valor: numero(personal.dotacion), nota: 'liquidadas en el último período cerrado' },
          { etiqueta: 'Edad promedio', valor: prom(personal.edadPromedio), nota: 'sin contar edades sin dato' },
          {
            etiqueta: 'Antigüedad promedio',
            valor: personal.antiguedadPromedio === null ? 'Sin dato' : `${numero1(personal.antiguedadPromedio)} años`,
            nota: 'desde la fecha de ingreso',
          },
          {
            etiqueta: 'Mujeres',
            valor: porcentaje(personal.pctMujeres),
            nota: `${numero(personal.mujeres)} personas`,
          },
          {
            etiqueta: 'Varones',
            valor: porcentaje(personal.pctVarones),
            nota: personal.sinSexo > 0 ? `${numero(personal.varones)} personas · ${numero(personal.sinSexo)} sin dato de sexo` : `${numero(personal.varones)} personas`,
          },
          {
            etiqueta: 'En edad de jubilarse',
            valor: numero(personal.enEdadDeJubilarse),
            nota: `mujeres de 60 o más y varones de 65 o más · ${numero(personal.jubilacionProximos2Anios)} llegan en los próximos 2 años`,
          },
        ]}
      />

      <NotaRrhh>
        Estudios cargados: {porcentaje(c.estudios)}. Estado civil cargado: {porcentaje(c.estadoCivil)}. Contrato cargado: {porcentaje(c.contrato)}. Edad
        cargada: {porcentaje(c.edad)}. Sexo cargado: {porcentaje(c.sexo)}.
      </NotaRrhh>

      <div className="grid gap-5 xl:grid-cols-2">
        <Barras titulo="Edades" rangos={personal.rangosEdad} />
        <Barras titulo="Antigüedad" rangos={personal.rangosAntiguedad} />
      </div>

      <TarjetaRrhh
        titulo={personal.aniversarios.mes ? `Cumpleaños de antigüedad en ${mesLargo(personal.aniversarios.mes)}` : 'Cumpleaños de antigüedad'}
        subtitulo="Quienes cumplen 5, 10, 15, 20, 25 o 30 años el mes siguiente al último cerrado."
      >
        <p className="text-[18px]">
          <strong className="tabular-nums">{numero(personal.aniversarios.cantidad)}</strong>{' '}
          {personal.aniversarios.cantidad === 1 ? 'persona' : 'personas'}
          {aniv.length > 0 ? `: ${aniv.map((a) => `${numero(a.cantidad)} de ${a.anios} años`).join(', ')}.` : '.'}
        </p>
        {detalle && detalle.aniversarios.length > 0 ? (
          <ul className="mt-3 grid gap-1 text-[15px]">
            {detalle.aniversarios.map((a) => (
              <li key={`${a.legajo}-${a.anios}`}>
                <strong>{a.nombre}</strong> <span className="text-neutral-500">({a.legajo})</span> · {a.area} · {a.anios} años
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[14px] text-neutral-600 dark:text-gray-400">Los nombres solo los ve el perfil de RRHH.</p>
        )}
      </TarjetaRrhh>

      <TituloDetalle>Por área y por convenio</TituloDetalle>
      <TablaCortes
        titulo="Por área"
        subtitulo="Mismo agrupamiento de áreas que el resto del tablero. El porcentaje de hijos es según los familiares cargados."
        lista={personal.porArea}
        archivo="personal por area"
      />
      <TablaCortes
        titulo="Por convenio"
        subtitulo="Cada convenio con su último período cerrado."
        lista={personal.porConvenio}
        archivo="personal por convenio"
      />

      <TituloDetalle>Cómo está cargado</TituloDetalle>
      <div className="grid gap-5 lg:grid-cols-3">
        <ListaDistribucion titulo="Estado civil" items={personal.estadoCivil} cargado={`Cargado: ${porcentaje(c.estadoCivil)}`} />
        <ListaDistribucion titulo="Estudios" items={personal.estudios} cargado={`Cargado: ${porcentaje(c.estudios)}`} />
        <ListaDistribucion titulo="Tipo de contrato" items={personal.contratos} cargado={`Cargado: ${porcentaje(c.contrato)}`} />
      </div>
      <TarjetaRrhh titulo="Jornada" subtitulo={`Jornada cargada: ${porcentaje(c.jornada)}`}>
        <ul className="grid gap-2 text-[16px] sm:grid-cols-3">
          <li className="flex justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2 dark:border-zinc-700">
            <span>Jornada parcial</span>
            <strong className="tabular-nums">{numero(personal.jornadaParcial)}</strong>
          </li>
          <li className="flex justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2 dark:border-zinc-700">
            <span>Jornada completa</span>
            <strong className="tabular-nums">{numero(personal.jornadaCompleta)}</strong>
          </li>
          <li className="flex justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2 dark:border-zinc-700">
            <span>Sin dato</span>
            <strong className="tabular-nums">{numero(personal.jornadaSinDato)}</strong>
          </li>
        </ul>
      </TarjetaRrhh>

      <TituloDetalle>Familia</TituloDetalle>
      <TarjetaRrhh titulo="Familiares cargados en Salario" subtitulo={f.nota}>
        <ul className="grid gap-2 text-[16px] sm:grid-cols-2">
          {[
            ['Personas con hijos cargados', numero(f.personasConHijos)],
            ['Total de hijos', numero(f.totalHijos)],
            ['Hijos de 4 a 17 años', numero(f.hijosEdadEscolar)],
            ['Familiares con discapacidad', numero(f.familiaresConDiscapacidad)],
          ].map(([k, v]) => (
            <li key={k} className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 dark:border-zinc-700">
              <span>{k}</span>
              <strong className="tabular-nums">{v}</strong>
            </li>
          ))}
        </ul>
      </TarjetaRrhh>

      {detalle ? <ListaPersonas personas={detalle.personas} /> : null}
    </div>
  )
}
