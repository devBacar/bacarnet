import type { Guia } from '../pasosRecorrido'

const RUTA = '/finanzas/extractos'

export const GUIAS_EXTRACTOS: Guia[] = [
  {
    id: 'extractos-bajar',
    pantalla: 'extractos',
    titulo: 'Bajar el extracto de un banco',
    pasos: [
      {
        id: 'cuenta',
        ruta: RUTA,
        selector: 'extractos-cuenta',
        tipo: 'completar',
        titulo: 'El banco',
        texto: 'Elegí de qué banco querés el extracto. Son las cuentas corrientes en pesos.',
      },
      {
        id: 'periodo',
        ruta: RUTA,
        selector: 'extractos-periodo',
        tipo: 'completar',
        titulo: 'El período',
        texto: '«Mes pasado» o «Este mes» ya vienen armados. Con «Elegir fechas» ponés el rango que quieras.',
      },
      {
        id: 'bajar',
        ruta: RUTA,
        selector: 'extractos-bajar',
        titulo: 'Bajar Excel',
        texto: 'Con «Bajar Excel» se descarga el extracto oficial del banco, con la categoría de BacarNet en cada fila. Tocalo cuando quieras: solo descarga, no cambia nada.',
      },
      {
        id: 'ver',
        ruta: RUTA,
        selector: 'extractos-ver',
        titulo: 'O verlo acá',
        texto: '«Ver en pantalla» lo muestra sin descargar, y abajo te dice si BacarNet tiene los mismos movimientos que el banco.',
      },
    ],
  },
]
