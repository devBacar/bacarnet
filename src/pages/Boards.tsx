import { KeyRound, LayoutDashboard, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { BoardAccessModal } from '../components/BoardAccessModal'
import { useAuth } from '../context'
import { useBoardsQuery } from '../hooks/queries/useCatalogQueries'
import {
  boardEntryUrl,
  ensureBoardSession,
  recordBoardOpen,
  startBoardSessionRenewal,
  stopBoardSessionRenewal,
  type BoardDto,
} from '../services/boardsApi'
import { isSuperAdmin } from '../services/userService'
import { boardListHref, isDesarrolloProyectosBoard, isRrhhBoard } from '../constants/boardProyectos'

export function BoardList() {
  const { user, userProfile } = useAuth()
  const superAdmin = isSuperAdmin(userProfile)
  const {
    data,
    isLoading: loading,
    isError,
    error: queryError,
  } = useBoardsQuery(user?.uid)
  const boards = data?.boards ?? []
  const error = isError
    ? queryError instanceof Error
      ? queryError.message
      : 'No se pudieron cargar los tableros'
    : null
  const [accessTarget, setAccessTarget] = useState<BoardDto | null>(null)

  return (
    <div className="min-w-0 space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-zinc-400">
          Consulta
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Tableros</h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-500 dark:text-zinc-400">
          Paneles interactivos de consulta. Cada tablero es una carpeta en Drive con su propio
          HTML y archivos asociados.
        </p>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-neutral-500 dark:text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando tableros…
        </div>
      ) : error ? (
        <div className="rounded-xl alert-error px-4 py-6 text-sm text-danger">
          {error}
        </div>
      ) : boards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 px-6 py-16 text-center dark:border-zinc-700">
          <LayoutDashboard className="mx-auto h-8 w-8 text-neutral-300 dark:text-zinc-600" />
          <p className="mt-3 text-sm font-medium">No hay tableros disponibles</p>
          <p className="mt-1 text-sm text-neutral-500 dark:text-zinc-400">
            {superAdmin
              ? 'Agregá una subcarpeta con index.html dentro de Tableros en Drive.'
              : 'Todavía no tenés tableros asignados. Pedí acceso a Sistemas.'}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((board) => (
            <li key={board.id}>
              <div className="flex h-full flex-col rounded-xl border border-neutral-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-start justify-between gap-2">
                  <LayoutDashboard className="h-5 w-5 text-brand-primary" />
                  {superAdmin && (
                    <button
                      type="button"
                      onClick={() => setAccessTarget(board)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Acceso
                    </button>
                  )}
                </div>
                <Link
                  to={boardListHref(board.id)}
                  className="mt-3 flex flex-1 flex-col transition-colors hover:text-brand-primary"
                >
                  <h2 className="font-semibold">{board.name}</h2>
                  {board.modifiedTime && (
                    <p className="mt-auto pt-3 text-xs text-neutral-400 dark:text-zinc-500">
                      Actualizado{' '}
                      {new Intl.DateTimeFormat('es-AR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      }).format(new Date(board.modifiedTime))}
                    </p>
                  )}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      {accessTarget && (
        <BoardAccessModal
          boardId={accessTarget.id}
          boardName={accessTarget.name}
          onClose={() => setAccessTarget(null)}
        />
      )}
    </div>
  )
}

function BoardViewer({ boardId }: { boardId: string }) {
  const navigate = useNavigate()
  const { userProfile } = useAuth()
  const superAdmin = isSuperAdmin(userProfile)
  const [boardName, setBoardName] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAccess, setShowAccess] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (showAccess) {
        setShowAccess(false)
        return
      }
      navigate('/tableros', { replace: true })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate, showAccess])

  useEffect(() => {
    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      setReady(false)
      setError(null)
      try {
        await ensureBoardSession()
        const opened = await recordBoardOpen(boardId)
        if (cancelled) return
        setBoardName(opened.name)
        setReady(true)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo abrir el tablero')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [boardId])

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white dark:bg-zinc-950">
      <button
        type="button"
        onClick={() => navigate('/tableros')}
        className="absolute left-4 top-4 z-20 inline-flex items-center gap-1.5 rounded-lg border border-neutral-200/80 bg-white/75 px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm backdrop-blur-sm transition-colors hover:bg-white hover:text-neutral-900 dark:border-zinc-700/80 dark:bg-zinc-900/75 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:hover:text-white"
      >
        ← Volver
      </button>

      {superAdmin && boardName && ready && (
        <button
          type="button"
          onClick={() => setShowAccess(true)}
          className="absolute right-4 top-4 z-20 inline-flex items-center gap-1.5 rounded-lg border border-neutral-200/80 bg-white/75 px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm backdrop-blur-sm transition-colors hover:bg-white dark:border-zinc-700/80 dark:bg-zinc-900/75 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          <KeyRound className="h-4 w-4" />
          Acceso
        </button>
      )}

      {error ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-md rounded-xl alert-error px-4 py-6 text-sm text-danger">
            {error}
          </div>
        </div>
      ) : !ready ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-neutral-500 dark:text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Preparando tablero…
        </div>
      ) : (
        <iframe
          title={boardName ?? 'Tablero'}
          src={boardEntryUrl(boardId)}
          sandbox="allow-scripts allow-downloads allow-forms allow-popups"
          referrerPolicy="no-referrer"
          className="h-full w-full flex-1 border-0 bg-white"
        />
      )}

      {showAccess && boardName && (
        <BoardAccessModal
          boardId={boardId}
          boardName={boardName}
          onClose={() => setShowAccess(false)}
        />
      )}
    </div>
  )
}

export function BoardViewerPage() {
  const { boardId } = useParams()

  useEffect(() => {
    startBoardSessionRenewal()
    return () => stopBoardSessionRenewal()
  }, [])

  if (!boardId) return <Navigate to="/tableros" replace />

  if (isDesarrolloProyectosBoard(boardId)) {
    return <Navigate to="/tableros/desarrollo-proyectos" replace />
  }

  if (isRrhhBoard(boardId)) {
    return <Navigate to="/tableros/rrhh" replace />
  }

  return <BoardViewer boardId={boardId} />
}

/** @deprecated Usar BoardList o BoardViewerPage según la ruta */
export function Boards() {
  return <BoardList />
}
