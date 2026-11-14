import { describe, expect, test, vi } from "vitest"
import { numberInput } from "../src/components/number-input/number-input"
import { attrs } from "../src/foundation/kernel/part"
import {
  formatNumber,
  isPartialNumber,
  parseNumber,
} from "../src/foundation/number/number"

const liters = {
  style: "unit",
  unit: "liter",
  unitDisplay: "long",
} as const

const dollars = {
  style: "currency",
  currency: "USD",
  currencyDisplay: "name",
  maximumFractionDigits: 0,
} as const

describe("localized number affixes", () => {
  test.each([
    ["ru-RU", 0],
    ["ru-RU", -5],
    ["pl-PL", 2],
    ["pl-PL", 5],
    ["cs-CZ", 2],
    ["cs-CZ", 5],
    ["cy-GB", 3],
    ["br-FR", 1000000],
    ["ro-RO", 21],
  ])("reads a long unit formatted in %s for %s", (locale, value) => {
    const text = formatNumber(value, locale, liters)
    expect(parseNumber(text, locale, liters)).toBe(value)
    expect(isPartialNumber(text, locale, liters)).toBe(true)
  })

  test.each([
    ["ru-RU", 2],
    ["pl-PL", 2],
    ["cs-CZ", 2],
    ["cy-GB", 2],
    ["br-FR", 1000000],
    ["ro-RO", 21],
  ])("reads a currency name formatted in %s for %s", (locale, value) => {
    const text = formatNumber(value, locale, dollars)
    expect(parseNumber(text, locale, dollars)).toBe(value)
    expect(isPartialNumber(text, locale, dollars)).toBe(true)
  })

  test("keeps signs and the negative-input policy", () => {
    const text = formatNumber(-5, "ru-RU", liters)
    expect(parseNumber(text, "ru-RU", liters)).toBe(-5)
    expect(
      isPartialNumber(text, "ru-RU", liters, { allowNegative: false })
    ).toBe(false)
    expect(parseNumber("(5 литров)", "ru-RU", liters)).toBe(-5)
  })

  test("keeps fraction digits, localized digits and grouping", () => {
    for (const [locale, value] of [
      ["ru-RU", 1234.5],
      ["ar-EG", 5],
    ] as const) {
      const text = formatNumber(value, locale, liters)
      expect(parseNumber(text, locale, liters)).toBe(value)
      expect(isPartialNumber(text, locale, liters)).toBe(true)
    }
  })

  test("looks up the name after reading a different numbering system", () => {
    const format = { ...liters, numberingSystem: "arab" }
    const text = formatNumber(5, "ru-RU", format)
    expect(parseNumber(text, "ru-RU", format)).toBe(5)
    expect(isPartialNumber(text, "ru-RU", format)).toBe(true)
  })

  test("does not infer a number from a unit without digits", () => {
    const text = formatNumber(1, "ar-EG", liters)
    expect(parseNumber(text, "ar-EG", liters)).toBe(null)
  })

  test("does not remove unknown words, different units or extra numbers", () => {
    for (const text of [
      "5 неизвестных литров",
      "5 метров",
      "5 литров 2",
      "5x2 литров",
      "5.2.3 литров",
      "NaN литров",
    ]) {
      expect(parseNumber(text, "ru-RU", liters)).toBe(null)
      expect(isPartialNumber(text, "ru-RU", liters)).toBe(false)
    }
    expect(parseNumber("5 литров", "ru-RU")).toBe(null)
    expect(parseNumber("5 литров", "en-US", liters)).toBe(null)
    expect(parseNumber("2 dolary amerykańskie", "pl-PL", liters)).toBe(null)
  })

  test.each([
    ["ru-RU", 5, liters],
    ["pl-PL", 2, dollars],
  ])(
    "commits a formatted paste in a %s number input",
    (locale, value, format) => {
      const onValueChange = vi.fn()
      const instance = numberInput({
        id: "amount",
        name: "amount",
        defaultValue: 1,
        locale,
        format,
        onValueChange,
      })
      const text = formatNumber(value, locale, format)
      const preventDefault = vi.fn()
      instance.api.internal.beforeinput(
        {
          isComposing: false,
          inputType: "insertFromPaste",
          data: text,
          preventDefault,
        } as unknown as InputEvent,
        { value: "", selectionStart: 0, selectionEnd: 0 } as HTMLInputElement
      )
      expect(preventDefault).not.toHaveBeenCalled()
      instance.api.internal.type(text)
      instance.api.internal.commitText()
      expect(instance.get().value).toBe(value)
      expect(attrs(instance.part("control")).value).toBe(text)
      expect(attrs(instance.part("hidden-input")).value).toBe(String(value))
      expect(onValueChange).toHaveBeenCalledWith(
        value,
        expect.objectContaining({ reason: "input-change" })
      )
    }
  )
})
