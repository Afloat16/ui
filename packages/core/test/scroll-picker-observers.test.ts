// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { bindScrollPicker } from "../src/foundation/lists/scroll-picker"

const original = Object.getOwnPropertyDescriptor(window, "ResizeObserver")
const observers: ResizeProbe[] = []
const cleanups: (() => void)[] = []

class ResizeProbe {
  targets = new Set<Element>()
  observe = vi.fn((element: Element) => {
    this.targets.add(element)
  })
  unobserve = vi.fn((element: Element) => {
    this.targets.delete(element)
  })
  disconnect = vi.fn(() => this.targets.clear())

  constructor() {
    observers.push(this)
  }
}

beforeEach(() => {
  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    value: ResizeProbe,
  })
})

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  observers.splice(0)
  document.body.replaceChildren()
  if (original) {
    Object.defineProperty(window, "ResizeObserver", original)
  } else {
    Reflect.deleteProperty(window, "ResizeObserver")
  }
})

function picker() {
  const list = document.createElement("div")
  list.setAttribute("role", "listbox")
  list.innerHTML = ["one", "two", "three"]
    .map((text) => `<div role="option">${text}</div>`)
    .join("")
  document.body.append(list)
  const items = [...list.querySelectorAll<HTMLElement>('[role="option"]')]
  cleanups.push(bindScrollPicker(list))
  return { list, items, observer: observers[observers.length - 1] }
}

describe("scroll picker resize targets", () => {
  test("releases a still-connected option moved outside and observes it again on return", async () => {
    const { list, items, observer } = picker()
    const other = document.createElement("div")
    document.body.append(other)
    other.append(items[0])
    await Promise.resolve()
    expect(items[0].isConnected).toBe(true)
    expect(observer.unobserve).toHaveBeenCalledExactlyOnceWith(items[0])
    expect(observer.targets).toEqual(new Set([list, items[1], items[2]]))
    list.append(items[0])
    await Promise.resolve()
    expect(observer.targets).toEqual(new Set([list, ...items]))
    expect(
      observer.observe.mock.calls.filter(([item]) => item === items[0])
    ).toHaveLength(2)
  })

  test("releases an element whose option role is removed and restores it when the role returns", async () => {
    const { list, items, observer } = picker()
    items[1].removeAttribute("role")
    await Promise.resolve()
    expect(list.contains(items[1])).toBe(true)
    expect(observer.unobserve).toHaveBeenCalledExactlyOnceWith(items[1])
    expect(observer.targets).toEqual(new Set([list, items[0], items[2]]))
    items[1].setAttribute("role", "option")
    await Promise.resolve()
    expect(observer.targets).toEqual(new Set([list, ...items]))
  })

  test("an option moved between bound pickers belongs only to its new observer", async () => {
    const first = picker()
    const second = picker()
    const moved = first.items[0]
    second.list.append(moved)
    await Promise.resolve()
    expect(first.observer.targets).toEqual(
      new Set([first.list, ...first.items.slice(1)])
    )
    expect(second.observer.targets).toEqual(
      new Set([second.list, ...second.items, moved])
    )
    expect(first.observer.unobserve).toHaveBeenCalledExactlyOnceWith(moved)
  })

  test("releases every option moved away while keeping the empty list observed", async () => {
    const { list, items, observer } = picker()
    const other = document.createElement("div")
    document.body.append(other)
    other.append(...items)
    await Promise.resolve()
    expect(items.every((item) => item.isConnected)).toBe(true)
    expect(observer.targets).toEqual(new Set([list]))
    expect(observer.unobserve).toHaveBeenCalledTimes(items.length)
  })

  test("reordering current options does not replace their observations", async () => {
    const { list, items, observer } = picker()
    list.prepend(items[2])
    await Promise.resolve()
    expect(observer.targets).toEqual(new Set([list, ...items]))
    expect(observer.observe).toHaveBeenCalledTimes(items.length + 1)
    expect(observer.unobserve).not.toHaveBeenCalled()
  })

  test("continues to release options removed from the document", async () => {
    const { list, items, observer } = picker()
    items[0].remove()
    await Promise.resolve()
    expect(observer.targets).toEqual(new Set([list, items[1], items[2]]))
    expect(observer.unobserve).toHaveBeenCalledExactlyOnceWith(items[0])
  })
})
