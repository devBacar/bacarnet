import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: true,
})

export function markdownToEmailHtml(markdown: string): string {
  const body = marked.parse(markdown.trim(), { async: false }) as string
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.5; color: ***REMOVED***222;">
${body}
</body>
</html>`
}
