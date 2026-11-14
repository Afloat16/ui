// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { createViewport, definePrimitive } from "../src/index"
import { bind } from "../src/foundation/kernel/part"

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup())
  document.body.replaceChildren()
})

const canvas = definePrimitive({
  name: "capture-canvas",
  state: () => ({ viewport: { x: 0, y: 0, zoom: 1 } }),
  live: ["viewport"],
  api: (context) => ({
    viewport: createViewport(context, {
      key: "viewport",
      surface: () => context.element("surface"),
    }),
  }),
  slots: (slot) => ({
    surface: slot({
      on: { pointerdown: (event, { api }) => api.viewport.pointerdown(event) },
    }),
  }),
})

function fixture() {
  const instance = canvas({ id: "capture-canvas" })
  const surface = document.createElement("div")
  surface.getBoundingClientRect = () => new DOMRect(0, 0, 400, 300)
  document.body.append(surface)
  cleanups.push(() => instance.destroy())
  cleanups.push(bind(instance.part("surface", {}), surface))
  return { instance, surface, get: () => instance.api.viewport.get() }
}

function pointer(
  type: string,
  pointerId: number,
  x: number,
  y = 0,
  pointerType = "touch"
) {
  return new PointerEvent(type, {
    pointerId,
    pointerType,
    clientX: x,
    clientY: y,
    bubbles: true,
    cancelable: type !== "lostpointercapture",
  })
}

test.each(["mouse", "touch"])(
  "stops a %s drag after the surface loses capture",
  (type) => {
    const f = fixture()
    f.surface.dispatchEvent(pointer("pointerdown", 1, 0, 0, type))
    f.surface.dispatchEvent(pointer("pointermove", 1, 20, 10, type))
    expect(f.get()).toEqual({ x: 20, y: 10, zoom: 1 })
    const stopped = f.get()
    f.surface.dispatchEvent(pointer("lostpointercapture", 1, 20, 10, type))
    f.surface.dispatchEvent(pointer("pointermove", 1, 100, 100, type))
    expect(f.get()).toBe(stopped)
  }
)

test("starts a fresh drag after capture loss without retaining a phantom finger", () => {
  const f = fixture()
  f.surface.dispatchEvent(pointer("pointerdown", 1, 0))
  f.surface.dispatchEvent(pointer("pointermove", 1, 20, 10))
  f.surface.dispatchEvent(pointer("lostpointercapture", 1, 20, 10))
  f.surface.dispatchEvent(pointer("pointerdown", 2, 50, 50))
  f.surface.dispatchEvent(pointer("pointermove", 2, 60, 55))
  expect(f.get()).toEqual({ x: 30, y: 15, zoom: 1 })
})

test("continues with the remaining finger after one pinch pointer loses capture", () => {
  const f = fixture()
  f.surface.dispatchEvent(pointer("pointerdown", 1, 0))
  f.surface.dispatchEvent(pointer("pointerdown", 2, 100))
  f.surface.dispatchEvent(pointer("pointermove", 2, 200))
  expect(f.get()).toEqual({ x: 0, y: 0, zoom: 2 })
  f.surface.dispatchEvent(pointer("lostpointercapture", 2, 200))
  f.surface.dispatchEvent(pointer("pointermove", 1, 10))
  expect(f.get()).toEqual({ x: 10, y: 0, zoom: 2 })
})

test("handles document-targeted capture loss after the surface is detached", () => {
  const f = fixture()
  f.surface.dispatchEvent(pointer("pointerdown", 1, 0))
  f.surface.dispatchEvent(pointer("pointermove", 1, 20))
  const stopped = f.get()
  f.surface.remove()
  document.dispatchEvent(pointer("lostpointercapture", 1, 20))
  document.body.append(f.surface)
  f.surface.dispatchEvent(pointer("pointermove", 1, 100))
  expect(f.get()).toBe(stopped)
})

test("ignores a lost capture belonging to a different pointer", () => {
  const f = fixture()
  f.surface.dispatchEvent(pointer("pointerdown", 1, 0))
  f.surface.dispatchEvent(pointer("lostpointercapture", 2, 100))
  f.surface.dispatchEvent(pointer("pointermove", 1, 20, 10))
  expect(f.get()).toEqual({ x: 20, y: 10, zoom: 1 })
})

test("ignores capture loss from an earlier owner while the surface takes over", () => {
  const f = fixture()
  const earlier = document.createElement("span")
  f.surface.append(earlier)
  f.surface.dispatchEvent(pointer("pointerdown", 1, 0))
  earlier.dispatchEvent(pointer("lostpointercapture", 1, 0))
  f.surface.dispatchEvent(pointer("pointermove", 1, 20, 10))
  expect(f.get()).toEqual({ x: 20, y: 10, zoom: 1 })
})

test.each(["pointerup", "pointercancel"])(
  "keeps ordinary %s cleanup idempotent when capture loss follows",
  (type) => {
    const f = fixture()
    f.surface.dispatchEvent(pointer("pointerdown", 1, 0))
    f.surface.dispatchEvent(pointer("pointermove", 1, 20))
    f.surface.dispatchEvent(pointer(type, 1, 20))
    f.surface.dispatchEvent(pointer("lostpointercapture", 1, 20))
    const stopped = f.get()
    f.surface.dispatchEvent(pointer("pointermove", 1, 100))
    expect(f.get()).toBe(stopped)
  }
)

test("ignores an unrelated pointer release during a clamped pinch", () => {
  const f = fixture()
  f.surface.dispatchEvent(pointer("pointerdown", 1, 0))
  f.surface.dispatchEvent(pointer("pointerdown", 2, 100))
  f.surface.dispatchEvent(pointer("pointermove", 2, 1000))
  expect(f.get().zoom).toBe(4)
  f.surface.dispatchEvent(pointer("pointerup", 3, 200))
  f.surface.dispatchEvent(pointer("pointermove", 2, 200))
  expect(f.get().zoom).toBe(2)
})

test("destroying the instance stops an active drag", () => {
  const f = fixture()
  f.surface.dispatchEvent(pointer("pointerdown", 1, 0))
  f.surface.dispatchEvent(pointer("pointermove", 1, 20))
  f.instance.destroy()
  const stopped = f.get()
  f.surface.dispatchEvent(pointer("lostpointercapture", 1, 20))
  f.surface.dispatchEvent(pointer("pointermove", 1, 100))
  expect(f.get()).toBe(stopped)
})
