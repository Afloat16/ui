// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import { colorPicker } from "../src/components/color-picker/color-picker"
import { parseColor } from "../src/foundation/color/parse"
import { attrs } from "../src/foundation/kernel/part"

let cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup())
  cleanups = []
})

const invalid = [
  "rgb(100%, 0, 0)",
  "rgb(255, 0%, 0)",
  "rgba(255, 0, 0%, 0.5)",
  "rgba(100%, 0%, 0, 50%)",
  "hsl(120, 50, 25%)",
  "hsl(120, 50%, 25)",
  "hsla(120, 50, 25, 0.5)",
  "hsla(0.5turn, 50%, 25, 50%)",
  "rgb(1. 2 3)",
  "rgb(1.e2 2 3)",
  "hsl(1.deg 50% 50%)",
  "color(display-p3 1. 0 0)",
  "lab(50% 1.% 0)",
  "rgb(1 2 3 / 1.)",
]

test.each(invalid)("rejects invalid CSS color channel syntax %s", (value) => {
  expect(parseColor(value)).toBeNull()
})

test.each([
  ["rgb(\n255\n0\n0\n/\n50%\n)", "rgb(255 0 0 / 50%)"],
  ["rgba(255,\r0,\r0,\r0.5)", "rgba(255, 0, 0, 0.5)"],
  ["hsl(\r\n120\r\n50%\r\n25%)", "hsl(120 50% 25%)"],
  ["hwb(200\n10%\n20%)", "hwb(200 10% 20%)"],
  ["lab(50%\n25\n-25)", "lab(50% 25 -25)"],
  ["lch(50%\n25\n200)", "lch(50% 25 200)"],
  ["oklab(0.7\n0.1\n-0.1)", "oklab(0.7 0.1 -0.1)"],
  ["oklch(0.7\n0.1\n200)", "oklch(0.7 0.1 200)"],
  ["color(\ndisplay-p3\n1\n0\n0\n/\n0.5)", "color(display-p3 1 0 0 / 0.5)"],
  ["rgb(255\t0\f0)", "rgb(255 0 0)"],
])("reads CSS channel whitespace in %j", (value, singleLine) => {
  const expected = parseColor(singleLine)
  expect(expected).not.toBeNull()
  expect(parseColor(value)).toEqual(expected)
})

test.each([
  "rgb(100%, 0%, 0%, 0.5)",
  "rgba(255, 0, 0, 50%)",
  "rgb(+2.55e2, -.0, 0)",
  "hsl(.5turn, 50%, 25%)",
  "hsla(120, 50%, 25%, .5)",
  "rgb(100% 0 0% / .5)",
  "hsl(120 50 25% / 50%)",
  "oklch(.7 1e-1 none / none)",
])("keeps valid legacy and modern numeric forms %s", (value) => {
  expect(parseColor(value)).not.toBeNull()
})

test("a picker refuses invalid CSS values and omits their swatch styles", () => {
  const onValueChange = vi.fn()
  const picker = colorPicker({
    id: "syntax",
    defaultValue: "#0000ff",
    onValueChange,
  })
  cleanups.push(() => picker.destroy())
  for (const value of invalid) {
    expect(picker.api.setValue(value), value).toBe(false)
    expect(picker.api.getValue()).toBe("#0000ff")
    expect(attrs(picker.part("swatch-item", { value })).style).toBe("")
  }
  expect(onValueChange).not.toHaveBeenCalled()
})

test("a picker accepts a multiline color through its value API", () => {
  const onValueChange = vi.fn()
  const picker = colorPicker({
    id: "syntax",
    defaultValue: "#0000ff",
    onValueChange,
  })
  cleanups.push(() => picker.destroy())
  expect(picker.api.setValue("rgb(\n255\n0\n0\n)")).toBe(true)
  expect(picker.api.getValue()).toBe("#ff0000")
  expect(onValueChange).toHaveBeenCalledTimes(1)
})
