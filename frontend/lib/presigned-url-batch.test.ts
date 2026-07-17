import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { chunk, createPresignedUrlBatcher, type BatchFetcher } from "./presigned-url-batch"

const urlsFor = (names: string[]) =>
  Object.fromEntries(names.map((n) => [n, `https://r2.test/${n}?signed`]))

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("chunk", () => {
  it("parte en tandas del tamaño pedido", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it("devuelve una sola tanda si entra entero", () => {
    expect(chunk([1, 2], 500)).toEqual([[1, 2]])
  })
})

describe("createPresignedUrlBatcher", () => {
  it("400 pedidos simultáneos viajan en UN solo request", async () => {
    const fetchBatch = vi.fn<BatchFetcher>(async (names) => urlsFor(names))
    const request = createPresignedUrlBatcher(fetchBatch)

    const names = Array.from({ length: 400 }, (_, i) => `photos/thumb_${i}.jpg`)
    const pending = Promise.all(names.map(request))

    await vi.runAllTimersAsync()
    const urls = await pending

    expect(fetchBatch).toHaveBeenCalledTimes(1)
    expect(fetchBatch.mock.calls[0][0]).toHaveLength(400)
    expect(urls[0]).toBe("https://r2.test/photos/thumb_0.jpg?signed")
    expect(urls[399]).toBe("https://r2.test/photos/thumb_399.jpg?signed")
  })

  it("el mismo nombre pedido varias veces viaja una sola vez y resuelve a todos", async () => {
    const fetchBatch = vi.fn<BatchFetcher>(async (names) => urlsFor(names))
    const request = createPresignedUrlBatcher(fetchBatch)

    const pending = Promise.all([
      request("photos/a.jpg"),
      request("photos/a.jpg"),
      request("photos/b.jpg"),
    ])

    await vi.runAllTimersAsync()
    const [first, second, third] = await pending

    expect(fetchBatch.mock.calls[0][0]).toEqual(["photos/a.jpg", "photos/b.jpg"])
    expect(first).toBe(second)
    expect(third).toBe("https://r2.test/photos/b.jpg?signed")
  })

  it("respeta el tope por request partiendo en varias tandas", async () => {
    const fetchBatch = vi.fn<BatchFetcher>(async (names) => urlsFor(names))
    const request = createPresignedUrlBatcher(fetchBatch, { maxBatch: 500 })

    const names = Array.from({ length: 1200 }, (_, i) => `photos/${i}.jpg`)
    const pending = Promise.all(names.map(request))

    await vi.runAllTimersAsync()
    await pending

    expect(fetchBatch).toHaveBeenCalledTimes(3)
    expect(fetchBatch.mock.calls.map((c) => c[0].length)).toEqual([500, 500, 200])
  })

  it("un nombre omitido por el backend rechaza solo a ese, no al resto", async () => {
    const fetchBatch = vi.fn<BatchFetcher>(async (names) =>
      urlsFor(names.filter((n) => n !== "photos/no-existe.jpg")),
    )
    const request = createPresignedUrlBatcher(fetchBatch)

    // Las comprobaciones se enganchan antes de correr los timers: si no, el
    // rechazo queda sin manejar durante el flush.
    const okAssertion = expect(request("photos/a.jpg")).resolves.toBe(
      "https://r2.test/photos/a.jpg?signed",
    )
    const missingAssertion = expect(request("photos/no-existe.jpg")).rejects.toThrow(
      "Sin URL para photos/no-existe.jpg",
    )

    await vi.runAllTimersAsync()

    await okAssertion
    await missingAssertion
  })

  it("si el request falla, un pedido posterior REINTENTA (no queda envenenado)", async () => {
    const fetchBatch = vi
      .fn<BatchFetcher>()
      .mockRejectedValueOnce(new Error("500"))
      .mockImplementation(async (names) => urlsFor(names))
    const request = createPresignedUrlBatcher(fetchBatch)

    const failedAssertion = expect(request("photos/a.jpg")).rejects.toThrow("500")
    await vi.runAllTimersAsync()
    await failedAssertion

    const retried = request("photos/a.jpg")
    await vi.runAllTimersAsync()

    await expect(retried).resolves.toBe("https://r2.test/photos/a.jpg?signed")
    expect(fetchBatch).toHaveBeenCalledTimes(2)
  })

  it("pedidos separados en el tiempo van en requests distintos", async () => {
    const fetchBatch = vi.fn<BatchFetcher>(async (names) => urlsFor(names))
    const request = createPresignedUrlBatcher(fetchBatch, { delayMs: 50 })

    const first = request("photos/a.jpg")
    await vi.runAllTimersAsync()
    await first

    const second = request("photos/b.jpg")
    await vi.runAllTimersAsync()
    await second

    expect(fetchBatch).toHaveBeenCalledTimes(2)
  })
})
