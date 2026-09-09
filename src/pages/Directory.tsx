import { Copy, Mail, Search, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useUrlSearchParam } from '../hooks/useUrlSearchState'
import { getContacts, type EmployeeContact } from '../services/contactService'

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

function ContactsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-xl border border-gray-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="mb-4 flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-gray-200 dark:bg-zinc-800" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-zinc-800" />
              <div className="h-3 w-1/2 rounded bg-gray-100 dark:bg-zinc-800" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-3 w-full rounded bg-gray-100 dark:bg-zinc-800" />
            <div className="h-3 w-2/3 rounded bg-gray-100 dark:bg-zinc-800" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function Directory() {
  const [contacts, setContacts] = useState<EmployeeContact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useUrlSearchParam('q')

  useEffect(() => {
    getContacts()
      .then((data) => {
        setContacts(data)
        setError(null)
      })
      .catch((err) => {
        console.error('Error al cargar el directorio:', err)
        setContacts([])
        setError('No se pudo cargar el directorio. Intentá nuevamente.')
      })
      .finally(() => setLoading(false))
  }, [])

  const filteredContacts = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return contacts

    return contacts.filter(
      (contact) =>
        contact.name.toLowerCase().includes(query) ||
        contact.position.toLowerCase().includes(query) ||
        contact.department.toLowerCase().includes(query),
    )
  }, [contacts, search])

  const handleCopyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email)
      toast.success('Email copiado al portapapeles')
    } catch (err) {
      console.error('Error al copiar el email:', err)
      toast.error('No se pudo copiar el email')
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-gray-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-primary text-white">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Contactos</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Encontrá contactos por nombre, puesto o departamento
            </p>
          </div>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, puesto o departamento..."
            className="w-full rounded-xl border border-zinc-200 bg-zinc-100 py-4 pr-4 pl-12 text-base text-zinc-900 outline-none transition-all placeholder:text-zinc-400 focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-500 dark:focus:border-brand-primary dark:focus:ring-brand-primary/20"
          />
        </div>
      </section>

      {!loading && !error && contacts.length > 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {filteredContacts.length}{' '}
          {filteredContacts.length === 1 ? 'resultado' : 'resultados'}
          {search.trim() ? ` para "${search.trim()}"` : ''}
        </p>
      )}

      {loading ? (
        <ContactsSkeleton />
      ) : error ? (
        <div className="rounded-2xl alert-error px-6 py-12 text-center ">
          <p className="text-sm font-medium text-danger">{error}</p>
        </div>
      ) : contacts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Aún no hay contactos en el directorio.
          </p>
        </div>
      ) : filteredContacts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            No se encontraron contactos con ese criterio.
          </p>
          <button
            type="button"
            onClick={() => setSearch('')}
            className="mt-3 text-sm font-medium text-brand-primary hover:underline"
          >
            Limpiar búsqueda
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredContacts.map((contact) => (
            <article
              key={contact.id}
              className="flex flex-col rounded-xl border border-gray-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="mb-5 flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-primary text-lg font-bold text-white">
                  {getInitials(contact.name)}
                </div>
                <div className="min-w-0">
                  <h2 className="font-bold text-zinc-900 dark:text-white">{contact.name}</h2>
                  <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{contact.position}</p>
                  <span className="mt-2 inline-flex rounded-full bg-brand-tint px-2.5 py-0.5 text-xs font-medium text-brand-primary">
                    {contact.department}
                  </span>
                </div>
              </div>

              <div className="mb-5 space-y-2 rounded-xl bg-zinc-50 px-4 py-3 text-sm dark:bg-zinc-800/60">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    Email
                  </p>
                  <p className="truncate text-zinc-700 dark:text-zinc-300">{contact.email}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    Interno
                  </p>
                  <p className="text-zinc-700 dark:text-zinc-300">{contact.internalPhone}</p>
                </div>
              </div>

              <div className="mt-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyEmail(contact.email)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <Copy className="h-4 w-4" />
                  Copiar email
                </button>
                <a
                  href={`mailto:${contact.email}`}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-primary px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-primary-hover"
                >
                  <Mail className="h-4 w-4" />
                  Enviar mail
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
