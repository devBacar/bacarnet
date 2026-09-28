import { AlertTriangle } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { IS_STAGING_APP_ENV } from '../lib/appEnv'

export function TestEnvironmentBanner() {
  const bannerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!IS_STAGING_APP_ENV) return

    const el = bannerRef.current
    if (!el) return

    document.documentElement.dataset.stagingEnv = 'true'

    return () => {
      delete document.documentElement.dataset.stagingEnv
    }
  }, [])

  if (!IS_STAGING_APP_ENV) return null

  return (
    <div
      ref={bannerRef}
      role="status"
      aria-live="polite"
      className="relative z-[60] w-full shrink-0 border-b border-amber-700/40 bg-amber-500 px-3 py-2 text-amber-950 shadow-md dark:border-amber-400/30 dark:bg-amber-600 dark:text-amber-950"
    >
      <p className="mx-auto flex max-w-6xl items-start justify-center gap-2 text-center text-xs font-semibold leading-snug sm:text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 sm:h-5 sm:w-5" aria-hidden />
        <span>
          ENTORNO DE PRUEBAS — Los datos que ves acá son ficticios, no reflejan la información
          real de la empresa. Nada de lo que hagas acá impacta en producción.
        </span>
      </p>
    </div>
  )
}
