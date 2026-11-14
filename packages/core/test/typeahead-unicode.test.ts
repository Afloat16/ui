// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import {
  createTypeahead,
  isTypeaheadKey,
} from "../src/foundation/text/typeahead"

afterEach(() => vi.useRealTimers())

test.each(["𠮷", "😀", "ḍ\u0307", "क\u093f"])(
  "accepts the Unicode character key %s without shortcut modifiers",
  (key) => {
    expect(isTypeaheadKey(new KeyboardEvent("keydown", { key }))).toBe(true)
    expect(
      isTypeaheadKey(new KeyboardEvent("keydown", { key, shiftKey: true }))
    ).toBe(true)
    for (const modifier of ["altKey", "ctrlKey", "metaKey"]) {
      expect(
        isTypeaheadKey(new KeyboardEvent("keydown", { key, [modifier]: true }))
      ).toBe(false)
    }
  }
)

test("rejects named keys, controls, and multiple base characters", () => {
  for (const key of ["", "Enter", "Dead", "Unidentified", "ab", "😀😀", "\n"]) {
    expect(isTypeaheadKey(new KeyboardEvent("keydown", { key }))).toBe(false)
    const search = createTypeahead()
    expect(search(key, [key], -1)).toBe(-1)
    expect(search.active()).toBe(false)
  }
})

test.each(["𠮷", "😀", "ḍ\u0307", "क\u093f"])(
  "cycles from the current item with the Unicode key %s",
  (key) => {
    vi.useFakeTimers()
    const search = createTypeahead()
    const labels = [`${key} first`, `${key} second`, `${key} third`, "Other"]
    expect(search(key, labels, 0)).toBe(1)
    expect(search(key, labels, 1)).toBe(2)
    expect(search(key, labels, 2)).toBe(0)
    vi.advanceTimersByTime(500)
    expect(search.active()).toBe(false)
    expect(search(key, labels, 0)).toBe(1)
    search.reset()
  }
)

test.each(["𠮷", "ḍ\u0307"])(
  "keeps longer and repeated Unicode prefixes searchable for %s",
  (key) => {
    const search = createTypeahead()
    const labels = [`${key} alpha`, `${key}${key} beta`, `${key} gamma`]
    expect(search(key, labels, -1)).toBe(0)
    expect(search(" ", labels, 0)).toBe(0)
    expect(search("a", labels, 0)).toBe(0)
    search.reset()
    expect(search(key, labels, -1)).toBe(0)
    expect(search(key, labels, 0)).toBe(1)
    search.reset()
  }
)
