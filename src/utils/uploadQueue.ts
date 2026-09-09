export type QueueProgress = {
  completed: number
  total: number
  inFlight: number
}

export type QueueItemResult<TItem, TResult> =
  | { ok: true; item: TItem; result: TResult }
  | { ok: false; item: TItem; error: Error }

/**
 * Ejecuta tareas con concurrencia limitada (útil para subidas masivas).
 */
export async function runWithConcurrency<TItem, TResult>(
  items: TItem[],
  concurrency: number,
  worker: (item: TItem, index: number) => Promise<TResult>,
  onProgress?: (progress: QueueProgress) => void,
): Promise<QueueItemResult<TItem, TResult>[]> {
  if (items.length === 0) return []

  const limit = Math.max(1, Math.min(concurrency, items.length))
  const results: QueueItemResult<TItem, TResult>[] = new Array(items.length)
  let nextIndex = 0
  let completed = 0
  let inFlight = 0

  const report = () => onProgress?.({ completed, total: items.length, inFlight })

  await new Promise<void>((resolve) => {
    const pump = () => {
      if (completed === items.length && inFlight === 0) {
        resolve()
        return
      }

      while (inFlight < limit && nextIndex < items.length) {
        const index = nextIndex
        nextIndex += 1
        inFlight += 1
        report()

        Promise.resolve()
          .then(() => worker(items[index], index))
          .then((result) => {
            results[index] = { ok: true, item: items[index], result }
          })
          .catch((err: unknown) => {
            results[index] = {
              ok: false,
              item: items[index],
              error: err instanceof Error ? err : new Error(String(err)),
            }
          })
          .finally(() => {
            inFlight -= 1
            completed += 1
            report()
            pump()
          })
      }
    }

    pump()
  })

  return results
}
