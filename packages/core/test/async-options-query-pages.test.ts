import { afterEach, describe, expect, test, vi } from "vitest"
import { createAsyncOptions } from "../src/foundation/lists/async-options"

afterEach(() => vi.useRealTimers())

describe("async option pages belong to their loaded query", () => {
  test.each(["debounce", "request", "failure"] as const)(
    "does not append another query's later page after %s",
    async (stop) => {
      vi.useFakeTimers()
      let resolveFirst = (_value: { items: string[]; hasMore: boolean }) => {}
      let rejectFirst = (_error: Error) => {}
      const first = new Promise<{ items: string[]; hasMore: boolean }>(
        (resolve, reject) => {
          resolveFirst = resolve
          rejectFirst = reject
        }
      )
      const load = vi.fn((query: string, { page }: { page: number }) =>
        query === "new" && page === 0
          ? first
          : Promise.resolve({ items: [`${query}-${page}`], hasMore: true })
      )
      const options = createAsyncOptions(load, { debounce: 20 })
      options.setQuery("old")
      await vi.advanceTimersByTimeAsync(20)
      options.loadMore()
      await vi.advanceTimersByTimeAsync(0)
      expect(options.getState().items).toEqual(["old-0", "old-1"])
      options.setQuery("new")
      if (stop !== "debounce") {
        await vi.advanceTimersByTimeAsync(20)
      }
      if (stop === "failure") {
        rejectFirst(new Error("offline"))
        await vi.advanceTimersByTimeAsync(0)
      } else {
        options.cancel()
      }
      const requested = load.mock.calls.length
      options.loadMore()
      await vi.advanceTimersByTimeAsync(0)
      resolveFirst({ items: ["new-0"], hasMore: false })
      await vi.advanceTimersByTimeAsync(0)
      expect(options.getState().items).toEqual(["old-0", "old-1"])
      expect(load).toHaveBeenCalledTimes(requested)
      expect(options.getState()).toMatchObject({
        query: "new",
        hasMore: false,
        status: stop === "failure" ? "error" : "idle",
      })
    }
  )

  test("a successful first-page retry replaces the old query and starts its pagination", async () => {
    vi.useFakeTimers()
    let fail = true
    const load = vi.fn(async (query: string, { page }: { page: number }) => {
      if (query === "new" && fail) {
        throw new Error("offline")
      }
      return { items: [`${query}-${page}`], hasMore: true }
    })
    const options = createAsyncOptions(load, { debounce: 0 })
    options.setQuery("old")
    await vi.advanceTimersByTimeAsync(0)
    options.setQuery("new")
    await vi.advanceTimersByTimeAsync(0)
    fail = false
    options.reload()
    await vi.advanceTimersByTimeAsync(0)
    expect(options.getState().items).toEqual(["new-0"])
    expect(options.getState().hasMore).toBe(true)
    options.loadMore()
    await vi.advanceTimersByTimeAsync(0)
    expect(options.getState().items).toEqual(["new-0", "new-1"])
    expect(load.mock.calls.map(([query, { page }]) => [query, page])).toEqual([
      ["old", 0],
      ["new", 0],
      ["new", 0],
      ["new", 1],
    ])
  })

  test("an empty first page replaces the old query and disables more pages", async () => {
    vi.useFakeTimers()
    const load = vi.fn(async (query: string) =>
      query === "old" ? { items: ["old"], hasMore: true } : []
    )
    const options = createAsyncOptions(load, { debounce: 0 })
    options.setQuery("old")
    await vi.advanceTimersByTimeAsync(0)
    options.setQuery("new")
    await vi.advanceTimersByTimeAsync(0)
    expect(options.getState()).toMatchObject({ items: [], hasMore: false })
    options.loadMore()
    await vi.advanceTimersByTimeAsync(0)
    expect(load).toHaveBeenCalledTimes(2)
  })

  test.each([false, true])(
    "keeps the loaded query's pages when its refresh is canceled, after leaving it: %s",
    async (leave) => {
      vi.useFakeTimers()
      const load = vi.fn(async (query: string, { page }: { page: number }) => ({
        items: [`${query}-${page}`],
        hasMore: true,
      }))
      const options = createAsyncOptions(load, { debounce: 20 })
      options.setQuery("old")
      await vi.advanceTimersByTimeAsync(20)
      options.loadMore()
      await vi.advanceTimersByTimeAsync(0)
      if (leave) {
        options.setQuery("other")
        options.cancel()
      }
      options.setQuery("old")
      options.cancel()
      expect(options.getState().hasMore).toBe(true)
      options.loadMore()
      await vi.advanceTimersByTimeAsync(0)
      expect(options.getState().items).toEqual(["old-0", "old-1", "old-2"])
      expect(load.mock.calls.map(([query, { page }]) => [query, page])).toEqual(
        [
          ["old", 0],
          ["old", 1],
          ["old", 2],
        ]
      )
    }
  )

  test("records the loaded query before a subscriber switches queries", async () => {
    vi.useFakeTimers()
    const load = vi.fn(async (query: string, { page }: { page: number }) => ({
      items: [`${query}-${page}`],
      hasMore: true,
    }))
    const options = createAsyncOptions(load, { debounce: 20 })
    let switched = false
    options.subscribe(() => {
      const state = options.getState()
      if (switched || state.query !== "old" || state.status !== "idle") {
        return
      }
      switched = true
      options.setQuery("new")
      options.cancel()
    })
    options.setQuery("old")
    await vi.advanceTimersByTimeAsync(20)
    options.loadMore()
    await vi.advanceTimersByTimeAsync(0)
    expect(options.getState()).toMatchObject({
      query: "new",
      status: "idle",
      items: ["old-0"],
      hasMore: false,
    })
    expect(load).toHaveBeenCalledTimes(1)
  })
})
