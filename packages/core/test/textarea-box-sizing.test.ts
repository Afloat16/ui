// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { textarea } from "../src/components/input/input"
import { bind } from "../src/foundation/kernel/part"

const cleanups: (() => void)[] = []
beforeEach(() => {
  vi.stubGlobal("CSS", { supports: () => false })
})
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

function setup(boxSizing = "content-box", autoResize = true) {
  const el = document.createElement("textarea")
  el.rows = 1
  el.value = "One"
  el.style.boxSizing = boxSizing
  el.style.padding = "8px"
  el.style.border = "1px solid black"
  document.body.append(el)
  // jsdom has styles and input events but no layout. These CSSOM dimensions
  // describe one 20px line, 16px padding and a 2px border while height is auto.
  const metrics = { scrollHeight: 36, offsetHeight: 38, clientHeight: 36 }
  for (const name of [
    "scrollHeight",
    "offsetHeight",
    "clientHeight",
  ] as const) {
    Object.defineProperty(el, name, { get: () => metrics[name] })
  }
  const instance = textarea({ id: "box", defaultValue: "One", autoResize })
  const unbind = bind(instance.part("root", {}), el)
  cleanups.push(() => {
    unbind()
    instance.destroy()
  })
  return { el, metrics, instance }
}

test.each([
  ["content-box", 20, 60, 40],
  ["border-box", 38, 78, 58],
])(
  "fits %s after binding, writes, typing and controller changes",
  (sizing, oneLine, threeLines, twoLines) => {
    const { el, metrics, instance } = setup(sizing)
    expect(el.style.height).toBe(`${oneLine}px`)
    metrics.scrollHeight = 76
    el.value = "One\nTwo\nThree"
    expect(el.style.height).toBe(`${threeLines}px`)
    metrics.scrollHeight = 56
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )!.set!.call(el, "One\nTwo")
    el.dispatchEvent(new Event("input", { bubbles: true }))
    expect(el.style.height).toBe(`${twoLines}px`)
    metrics.scrollHeight = 36
    instance.api.setValue("One")
    expect(el.style.height).toBe(`${oneLine}px`)
  }
)

test.each([
  ["content-box", 37],
  ["border-box", 55],
])("retains horizontal scrollbar space with %s", (sizing, expected) => {
  const { el, metrics } = setup(sizing)
  // The 17px scrollbar occupies space outside the 36px client area.
  metrics.offsetHeight = 55
  el.value = "Changed"
  expect(el.style.height).toBe(`${expected}px`)
})

test("uses content sizing when no box-sizing override was supplied", () => {
  const { el } = setup("")
  expect(el.style.height).toBe("20px")
})

test("rereads sizing, asymmetric padding and borders when fitting again", () => {
  const { el, metrics } = setup("border-box")
  expect(el.style.height).toBe("38px")
  el.style.boxSizing = "content-box"
  el.style.paddingTop = "3px"
  el.style.paddingBottom = "13px"
  el.style.borderTopWidth = "2px"
  el.style.borderBottomWidth = "4px"
  metrics.scrollHeight = 56
  metrics.offsetHeight = 42
  el.value = "One\nTwo"
  expect(el.style.height).toBe("40px")
  el.style.padding = "20px"
  el.style.border = "0px"
  metrics.scrollHeight = 100
  metrics.offsetHeight = 60
  metrics.clientHeight = 60
  el.value = "One\nTwo\nThree"
  expect(el.style.height).toBe("60px")
})

test("uses content sizing when autoResize is enabled after binding", () => {
  const { el, instance } = setup("content-box", false)
  expect(el.style.height).toBe("")
  instance.setOptions({ id: "box", autoResize: true })
  expect(el.style.height).toBe("20px")
})

test("leaves a textarea without autoResize alone", () => {
  const { el, metrics, instance } = setup("content-box", false)
  el.style.height = "72px"
  metrics.scrollHeight = 76
  instance.api.setValue("One\nTwo\nThree")
  expect(el.style.height).toBe("72px")
})

test("still lets native field-sizing handle the dimensions", () => {
  vi.stubGlobal("CSS", { supports: () => true })
  const { el, metrics } = setup()
  expect(el.style.getPropertyValue("field-sizing")).toBe("content")
  expect(el.style.height).toBe("")
  metrics.scrollHeight = 76
  el.value = "One\nTwo\nThree"
  expect(el.style.height).toBe("")
})
