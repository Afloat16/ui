// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import {
  matchesShortcut,
  setPlatform,
} from "../src/foundation/platform/platform"
import { createShortcuts } from "../src/foundation/shortcuts/create-shortcuts"

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  document.body.replaceChildren()
  setPlatform("other")
})

test.each([
  {
    keys: "ctrl+alt+q",
    init: { key: "@", code: "KeyQ", ctrlKey: true, altKey: true },
  },
  {
    keys: "ctrl+alt+2",
    init: { key: "@", code: "Digit2", ctrlKey: true, altKey: true },
  },
  {
    keys: "ctrl+alt+shift+e",
    init: {
      key: "€",
      code: "KeyE",
      ctrlKey: true,
      altKey: true,
      shiftKey: true,
    },
  },
  { keys: "alt+e", init: { key: "€", code: "KeyE", altKey: true } },
  { keys: "e", init: { key: "€", code: "KeyE" } },
])("does not treat AltGraph text as $keys", ({ keys, init }) => {
  const event = new KeyboardEvent("keydown", {
    ...init,
    modifierAltGraph: true,
  })
  expect(event.getModifierState("AltGraph")).toBe(true)
  expect(matchesShortcut(event, keys, false)).toBe(false)
})

test.each(["input", "textarea", "button"] as const)(
  "keeps AltGraph input unhandled on a %s with a registered Ctrl+Alt shortcut",
  (tag) => {
    setPlatform("other")
    const field = document.createElement(tag)
    document.body.append(field)
    field.focus()
    const shortcuts = createShortcuts()
    cleanups.push(() => shortcuts.destroy())
    const handler = vi.fn()
    shortcuts.register("ctrl+alt+q", handler)
    const input = new KeyboardEvent("keydown", {
      key: "@",
      code: "KeyQ",
      ctrlKey: true,
      altKey: true,
      modifierAltGraph: true,
      bubbles: true,
      cancelable: true,
    })
    field.dispatchEvent(input)
    expect(handler).not.toHaveBeenCalled()
    expect(input.defaultPrevented).toBe(false)

    const command = new KeyboardEvent("keydown", {
      key: "q",
      code: "KeyQ",
      ctrlKey: true,
      altKey: true,
      bubbles: true,
      cancelable: true,
    })
    field.dispatchEvent(command)
    expect(handler).toHaveBeenCalledExactlyOnceWith(command)
    expect(command.defaultPrevented).toBe(true)
  }
)

test.each([
  { key: "˜", code: "KeyN", keys: "alt+n" },
  { key: "Dead", code: "KeyN", keys: "alt+n" },
  { key: "¡", code: "Digit1", keys: "alt+1" },
])("retains Apple's Option shortcut for $key", ({ key, code, keys }) => {
  const event = new KeyboardEvent("keydown", {
    key,
    code,
    altKey: true,
    modifierAltGraph: true,
  })
  expect(matchesShortcut(event, keys, true)).toBe(true)
})

test("retains ordinary command modifiers and non-Latin physical-key matching", () => {
  for (const init of [
    { key: "n", code: "KeyN", ctrlKey: true },
    { key: "т", code: "KeyN", ctrlKey: true },
    { key: "N", code: "KeyN", ctrlKey: true, modifierCapsLock: true },
  ]) {
    expect(
      matchesShortcut(new KeyboardEvent("keydown", init), "ctrl+n", false)
    ).toBe(true)
  }
})
