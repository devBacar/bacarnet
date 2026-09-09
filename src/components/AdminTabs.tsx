interface AdminTab {
  id: string
  label: string
}

interface AdminTabsProps {
  tabs: AdminTab[]
  activeTab: string
  onChange: (id: string) => void
}

export function AdminTabs({ tabs, activeTab, onChange }: AdminTabsProps) {
  return (
    <div className="mb-8 max-w-full overflow-x-auto overscroll-x-contain border-b border-neutral-200 dark:border-zinc-800">
      <div className="inline-flex min-w-full gap-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`-mb-px shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === tab.id
              ? 'border-brand-primary text-brand-primary'
              : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-800 dark:text-gray-400 dark:hover:border-zinc-600 dark:hover:text-gray-200'
          }`}
        >
          {tab.label}
        </button>
      ))}
      </div>
    </div>
  )
}
