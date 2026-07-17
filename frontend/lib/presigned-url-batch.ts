/**
 * Agrupa pedidos de URL firmada emitidos en el mismo instante y los manda en un
 * solo request. Una galería de N fotos monta N componentes que piden a la vez;
 * sin agrupar eso son N requests y N conexiones a la base.
 */

export type BatchFetcher = (objectNames: string[]) => Promise<Record<string, string>>

interface Waiter {
  resolve: (url: string) => void
  reject: (error: unknown) => void
}

export interface PresignedUrlBatcherOptions {
  /** Ventana de acumulación antes de emitir el request. */
  delayMs?: number
  /** Tope por request; debe coincidir con MAX_PRESIGNED_BATCH del backend. */
  maxBatch?: number
}

export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items]
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

export function createPresignedUrlBatcher(
  fetchBatch: BatchFetcher,
  options?: PresignedUrlBatcherOptions,
) {
  const delayMs = options?.delayMs ?? 50
  const maxBatch = options?.maxBatch ?? 500

  let queue = new Map<string, Waiter[]>()
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = async () => {
    timer = null
    const batch = queue
    queue = new Map()
    if (batch.size === 0) return

    await Promise.all(
      chunk([...batch.keys()], maxBatch).map(async (names) => {
        try {
          const urls = await fetchBatch(names)
          for (const name of names) {
            const url = urls[name]
            const waiters = batch.get(name) ?? []
            if (url) {
              waiters.forEach((w) => w.resolve(url))
            } else {
              // El backend omite lo que no reconoce; para el que espera es un fallo.
              waiters.forEach((w) => w.reject(new Error(`Sin URL para ${name}`)))
            }
          }
        } catch (error) {
          for (const name of names) {
            ;(batch.get(name) ?? []).forEach((w) => w.reject(error))
          }
        }
      }),
    )
  }

  return function requestPresignedUrl(objectName: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const waiters = queue.get(objectName)
      if (waiters) {
        // Mismo nombre pedido dos veces en la ventana: viaja una sola vez.
        waiters.push({ resolve, reject })
      } else {
        queue.set(objectName, [{ resolve, reject }])
      }
      if (timer === null) {
        timer = setTimeout(() => {
          void flush()
        }, delayMs)
      }
    })
  }
}
