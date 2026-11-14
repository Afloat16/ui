import { afterEach, expect, test, vi } from "vitest"
import { createAsyncOptions } from "../src/foundation/lists/async-options"

afterEach(() => vi.useRealTimers())

for (const mode of ["throw", "reject"] as const) {
  test.each(["immediate", "reload", "debounce", "loadMore"])(
    `a loader that ${mode}s during %s reports its error and can reload`,
    async (entry) => {
      vi.useFakeTimers()
      const failure = new Error("Invalid search endpoint")
      let failing = entry !== "loadMore"
      const options = createAsyncOptions<string>(
        (query, { page }) => {
          if (failing) {
            if (mode === "throw") {
              throw failure
            }
            return Promise.reject(failure)
          }
          return Promise.resolve({
            items: [`${query}-${page}`],
            hasMore: true,
          })
        },
        {
          query: "search",
          debounce: 10,
          immediate: entry === "immediate" || entry === "loadMore",
        }
      )
      await vi.advanceTimersByTimeAsync(0)
      const previous = options.getState().items
      if (entry === "reload") {
        expect(() => options.reload()).not.toThrow()
      } else if (entry === "debounce") {
        options.setQuery("updated")
      } else if (entry === "loadMore") {
        failing = true
        expect(() => options.loadMore()).not.toThrow()
      }
      await vi.advanceTimersByTimeAsync(10)
      expect(options.getState()).toMatchObject({
        status: "error",
        error: failure,
        items: previous,
      })
      failing = false
      options.reload()
      await vi.advanceTimersByTimeAsync(0)
      expect(options.getState()).toMatchObject({
        status: "idle",
        error: undefined,
        items: [`${options.getState().query}-0`],
        hasMore: true,
      })
      options.cancel()
    }
  )
}
