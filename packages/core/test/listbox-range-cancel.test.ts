// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { listbox } from "../src/components/listbox/listbox-root"
import { attrs, bind } from "../src/foundation/kernel/part"

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup())
  document.body.replaceChildren()
})

test.each([
  ["ArrowDown", ["c", "d"]],
  [" ", ["c"]],
])(
  "Shift+%s starts fresh after a canceled first range",
  async (key, expected) => {
    let canceled = true
    const values = ["a", "b", "c", "d", "e"]
    const instance = listbox({
      id: "range",
      multiple: true,
      items: values.map((value) => ({ value, label: value })),
      onValueChange: (_value, details) => {
        if (canceled) {
          details.cancel()
        }
      },
    })
    cleanups.push(() => instance.destroy())
    const root = document.createElement("div")
    root.setAttribute("aria-label", "Letters")
    document.body.append(root)
    const rootPart = instance.part("root", {})
    for (const [name, value] of Object.entries(attrs(rootPart))) {
      if (value !== undefined) {
        root.setAttribute(name, value)
      }
    }
    cleanups.push(bind(rootPart, root))
    const elements = values.map((value) => {
      const el = document.createElement("div")
      const part = instance.part("item", { value })
      el.textContent = value
      const write = () => {
        for (const [name, value] of Object.entries(attrs(part))) {
          if (value === undefined) {
            el.removeAttribute(name)
          } else {
            el.setAttribute(name, value)
          }
        }
      }
      write()
      root.append(el)
      cleanups.push(instance.subscribe(write), bind(part, el))
      return el
    })
    await new Promise((resolve) => setTimeout(resolve))
    elements[0].focus()
    const press = (key: string, shiftKey = false) =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          shiftKey,
          bubbles: true,
          cancelable: true,
        })
      )
    press("ArrowDown", true)
    expect(document.activeElement).toBe(elements[1])
    expect(instance.api.getValue()).toEqual([])
    press("ArrowDown")
    expect(document.activeElement).toBe(elements[2])
    canceled = false
    press(key, true)
    expect(instance.api.getValue()).toEqual(expected)
    expect(
      [...root.querySelectorAll('[aria-selected="true"]')].map(
        (el) => el.textContent
      )
    ).toEqual(expected)
  }
)
