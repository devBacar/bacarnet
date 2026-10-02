import { matchPath } from 'react-router-dom'

export function isNavItemActive(pathname: string, to: string, end?: boolean): boolean {
  return matchPath({ path: to, end: end === true }, pathname) != null
}

export function moreTriggerClass(active: boolean, tone: 'nav' | 'tab'): string {
  const activeClass = tone === 'tab' ? 'bg-brand-primary text-white' : 'nav-link-active'
  const idleClass =
    'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-gray-400 dark:hover:bg-zinc-800 dark:hover:text-gray-100'
  return `inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] xl:px-2 ${
    active ? activeClass : idleClass
  }`
}
