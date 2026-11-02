import { HelpCircle, X } from 'lucide-react'
import { useEffect, useState } from 'react'

const CLAVE_GUARDADA = 'bacarnet.hoy.guiaAbierta'

function leerPreferencia(): boolean {
  try {
    const guardado = window.localStorage.getItem(CLAVE_GUARDADA)
    return guardado === null ? true : guardado === '1'
  } catch {
    return true
  }
}

/**
 * Explicación fija de qué es cada parte de la pantalla y de dónde sale la plata.
 * Pensada para alguien que abre Hoy sin saber cómo está armado el sistema por dentro.
 */
export function GuiaHoy() {
  const [abierta, setAbierta] = useState(true)
  useEffect(() => setAbierta(leerPreferencia()), [])

  function cambiar(valor: boolean) {
    setAbierta(valor)
    try {
      window.localStorage.setItem(CLAVE_GUARDADA, valor ? '1' : '0')
    } catch {
      /* si el navegador no deja guardar, no pasa nada: solo no se recuerda la próxima vez */
    }
  }

  if (!abierta) {
    return (
      <button
        type="button"
        onClick={() => cambiar(true)}
        className="text-brand-primary flex w-fit items-center gap-1.5 text-[13px] font-medium hover:underline"
      >
        <HelpCircle className="h-4 w-4" aria-hidden />
        ¿Qué estoy viendo en esta pantalla?
      </button>
    )
  }

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-[14px] leading-relaxed text-neutral-800 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-gray-200">
      <div className="mb-2 flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-neutral-900 dark:text-gray-100">
          <HelpCircle className="h-4 w-4 shrink-0" aria-hidden />
          ¿Qué estoy viendo en esta pantalla?
        </h2>
        <button
          type="button"
          onClick={() => cambiar(false)}
          aria-label="Cerrar esta explicación"
          className="shrink-0 rounded-md p-1 text-neutral-500 hover:bg-blue-100 hover:text-neutral-700 dark:text-gray-400 dark:hover:bg-blue-900/40"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <ul className="grid gap-2.5 md:grid-cols-2">
        <li>
          <strong>"Pagos de hoy" y "Cobros de hoy"</strong>: lo que falta hacer. Todavía no pasó, por eso tienen botones para pagar o cobrar.
        </li>
        <li>
          <strong>"Salió del banco hoy" y "Ingresó al banco hoy"</strong>: lo que YA pasó de verdad, confirmado por el banco. No tiene botones porque ya está resuelto.
        </li>
        <li>
          <strong>"Atrasados"</strong>: lo que debería haberse pagado o cobrado antes de hoy y todavía sigue sin resolver.
        </li>
        <li>
          <strong>¿De dónde sale la información?</strong> De Vientri (el sistema de facturas y cheques), cruzado con lo que informa el banco de verdad. Lo que no viene de ahí, dice "Cargado a mano".
        </li>
      </ul>
    </section>
  )
}
