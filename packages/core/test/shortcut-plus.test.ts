// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import { popover } from "../src/components/popover/popover"
import { attrs, bind } from "../src/foundation/kernel/part"
import {
  ariaKeyshortcuts,
  formatShortcut,
  matchesShortcut,
  setPlatform,
} from "../src/foundation/platform/platform"
import { createShortcuts } from "../src/foundation/shortcuts/create-shortcuts"

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup())
  document.body.replaceChildren()
  setPlatform("other")
})

test.each(["plus", "Plus", "PLUS", "pLuS"])(
  "matches the named %s key case-insensitively",
  (name) => {
    expect(
      matchesShortcut(
        new KeyboardEvent("keydown", { key: "+", code: "NumpadAdd" }),
        name,
        false
      )
    ).toBe(true)
    expect(ariaKeyshortcuts(name, false)).toBe("Plus")
  }
)

test("matches a shifted plus on the main keyboard with its exact modifiers", () => {
  const event = new KeyboardEvent("keydown", {
    key: "+",
    code: "Equal",
    ctrlKey: true,
    shiftKey: true,
  })
  expect(matchesShortcut(event, "ctrl+shift+plus", false)).toBe(true)
})

test("matches a Command-plus shortcut on Apple platforms", () => {
  const event = new KeyboardEvent("keydown", {
    key: "+",
    code: "NumpadAdd",
    metaKey: true,
  })
  expect(matchesShortcut(event, "mod+plus", true)).toBe(true)
})

test.each([false, true])(
  "activates a bound popover trigger with its advertised Plus shortcut (Apple: %s)",
  (apple) => {
    setPlatform(apple ? "apple" : "other")
    const instance = popover({ id: "plus-popover" })
    const trigger = document.createElement("button")
    document.body.append(trigger)
    const part = instance.part("trigger", { shortcut: "mod+plus" })
    cleanups.push(() => instance.destroy())
    cleanups.push(bind(part, trigger))
    expect(attrs(part)["aria-keyshortcuts"]).toBe(
      `${apple ? "Meta" : "Control"}+Plus`
    )
    const event = new KeyboardEvent("keydown", {
      key: "+",
      code: "NumpadAdd",
      ctrlKey: !apple,
      metaKey: apple,
      bubbles: true,
      cancelable: true,
    })
    trigger.dispatchEvent(event)
    expect(instance.get().open).toBe(true)
    expect(event.defaultPrevented).toBe(true)
  }
)

test("still requires the correct character and all modifiers", () => {
  for (const init of [
    { key: "=", code: "Equal", ctrlKey: true },
    { key: "-", code: "NumpadSubtract", ctrlKey: true },
    { key: "+", code: "NumpadAdd" },
    { key: "+", code: "Equal", ctrlKey: true, shiftKey: true },
  ]) {
    expect(
      matchesShortcut(new KeyboardEvent("keydown", init), "ctrl+plus", false)
    ).toBe(false)
  }
})

test("keeps canonical ARIA and shortcut hint text", () => {
  expect(ariaKeyshortcuts("mod+plus", false)).toBe("Control+Plus")
  expect(ariaKeyshortcuts("mod+plus", true)).toBe("Meta+Plus")
  expect(formatShortcut("ctrl+plus", false)).toBe("\u2066Ctrl+Plus\u2069")
})

test("keeps the named Space key working", () => {
  expect(
    matchesShortcut(
      new KeyboardEvent("keydown", { key: " ", code: "Space", ctrlKey: true }),
      "ctrl+space",
      false
    )
  ).toBe(true)
})

test("keeps other registered punctuation shortcuts working", () => {
  const shortcuts = createShortcuts()
  cleanups.push(() => shortcuts.destroy())
  const handler = vi.fn()
  shortcuts.register("ctrl+-", handler)
  const event = new KeyboardEvent("keydown", {
    key: "-",
    code: "NumpadSubtract",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  })
  document.body.dispatchEvent(event)
  expect(handler).toHaveBeenCalledExactlyOnceWith(event)
})
