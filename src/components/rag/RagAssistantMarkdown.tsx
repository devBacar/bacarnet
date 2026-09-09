import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-heading">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-brand-primary underline-offset-2 hover:underline"
    >
      {children}
    </a>
  ),
}

type RagAssistantMarkdownProps = {
  content: string
}

export function RagAssistantMarkdown({ content }: RagAssistantMarkdownProps) {
  return (
    <div className="rag-assistant-markdown break-words leading-relaxed [overflow-wrap:anywhere]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
