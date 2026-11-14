import { hydrate, render, type JSX } from "@solidjs/web"
import { flush, isHydrating, OBSERVE } from "solid-js"
import { attribution } from "solid-js/attribution"
import { afterEach, expect, test, vi } from "vitest"
import { useAsyncOptions } from "../src/async-options"

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup())
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

function mount(view: () => JSX.Element) {
  const root = document.body.appendChild(document.createElement("div"))
  cleanups.push(render(view, root))
  flush()
  return root
}

const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
    flush()
  }
}

test("an immediate synchronous failure is visible and a reload recovers", async () => {
  const codes = new Set<string>()
  cleanups.push(
    OBSERVE!.diagnostics.subscribe((event) => codes.add(event.code)),
    attribution.enable({ log: false, hotTime: false, wastedRecompute: false })
  )
  const failure = new Error("load failed")
  let retry = false
  let options!: ReturnType<typeof useAsyncOptions<string>>
  const root = mount(() => {
    options = useAsyncOptions(
      () => {
        if (!retry) {
          throw failure
        }
        return Promise.resolve(["ready"])
      },
      { immediate: true }
    )
    return <p>{options.status}</p>
  })
  expect(root.textContent).toBe("error")
  expect(options.error).toBe(failure)
  retry = true
  options.reload()
  await settle()
  expect(root.textContent).toBe("idle")
  expect(options.items).toEqual(["ready"])
  expect(options.error).toBeUndefined()
  expect([...codes]).toEqual([])
})

test("an immediately resolved load renders loading before its result", async () => {
  let options!: ReturnType<typeof useAsyncOptions<string>>
  const root = mount(() => {
    options = useAsyncOptions(() => Promise.resolve(["ready"]), {
      immediate: true,
    })
    return <p>{options.status}</p>
  })
  expect(root.textContent).toBe("loading")
  await settle()
  expect(root.textContent).toBe("idle")
  expect(options.items).toEqual(["ready"])
})

test("disposing an immediate pending load aborts and ignores its result", async () => {
  let signal!: AbortSignal
  let resolve!: (items: string[]) => void
  let options!: ReturnType<typeof useAsyncOptions<string>>
  const root = mount(() => {
    options = useAsyncOptions(
      (_query, context) => {
        signal = context.signal
        return new Promise<string[]>((done) => {
          resolve = done
        })
      },
      { immediate: true }
    )
    return <p>{options.status}</p>
  })
  expect(root.textContent).toBe("loading")
  expect(signal.aborted).toBe(false)
  cleanups.pop()!()
  expect(signal.aborted).toBe(true)
  resolve(["late"])
  await settle()
  expect(options.items).toEqual([])
})

test("hydration keeps the loading placeholder and delays its first load", async () => {
  vi.stubGlobal("_$HY", { events: [], completed: new WeakSet(), r: {} })
  const phases: string[] = []
  let initial: string | undefined
  let options!: ReturnType<typeof useAsyncOptions<string>>
  const root = document.body.appendChild(document.createElement("div"))
  cleanups.push(
    hydrate(() => {
      expect(isHydrating()).toBe(true)
      options = useAsyncOptions(
        () => {
          phases.push("load")
          return Promise.resolve(["ready"])
        },
        { immediate: true }
      )
      initial = options.status
      expect(phases).toEqual([])
      phases.push("component")
      return null
    }, root)
  )
  expect(initial).toBe("loading")
  await settle()
  expect(phases).toEqual(["component", "load"])
  expect(options.status).toBe("idle")
  expect(options.items).toEqual(["ready"])
})
