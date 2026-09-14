import { useEffect, useRef, useState } from 'react'

const CLAMP_CLASS = 'line-clamp-5'

export function HelpdeskProblematicaText({
  text,
  className = '',
}: {
  text: string
  className?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const paragraphRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const element = paragraphRef.current
    if (!element || expanded) return
    setOverflows(element.scrollHeight > element.clientHeight + 1)
  }, [text, expanded])

  const showToggle = overflows || expanded

  return (
    <div className={className}>
      <p
        ref={paragraphRef}
        className={`whitespace-pre-wrap text-sm leading-relaxed text-heading ${expanded ? '' : CLAMP_CLASS}`}
      >
        {text}
      </p>
      {showToggle ? (
        <button
          type="button"
          className="mt-1 text-sm font-semibold text-brand-primary hover:underline"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Leer menos' : 'Leer más'}
        </button>
      ) : null}
    </div>
  )
}
