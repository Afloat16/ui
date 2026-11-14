// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { bindScrollPicker } from "../src/foundation/lists/scroll-picker"

const cleanups: (() => void)[] = []

beforeEach(() => vi.useFakeTimers())

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.useRealTimers()
  document.body.innerHTML = ""
})

async function picker(selected: number, horizontal = false) {
  const list = document.createElement("div")
  list.setAttribute("role", "listbox")
  list.setAttribute("aria-orientation", horizontal ? "horizontal" : "vertical")
  document.body.append(list)
  let offset = 0
  const elements = () => [...list.children] as HTMLElement[]
  const scroll = () =>
    Math.min(offset, Math.max(0, (list.children.length - 1) * 40))
  Object.defineProperties(list, {
    clientHeight: { value: 40 },
    clientWidth: { value: 40 },
    scrollHeight: { get: () => list.children.length * 40 },
    scrollWidth: { get: () => list.children.length * 40 },
    scrollTop: { get: scroll },
    scrollLeft: { get: scroll },
  })
  list.getBoundingClientRect = () => new DOMRect(0, 0, 40, 40)
  const writes: number[] = []
  list.scrollTo = (options: ScrollToOptions | number = {}) => {
    if (typeof options === "number") {
      return
    }
    offset = (horizontal ? options.left : options.top) ?? offset
    writes.push(offset)
    list.dispatchEvent(new Event("scroll"))
  }
  for (let index = 0; index < 4; index++) {
    const item = document.createElement("div")
    item.setAttribute("role", "option")
    item.setAttribute("aria-selected", String(index === selected))
    item.textContent = String(index + 1)
    item.getBoundingClientRect = () => {
      const start = elements().indexOf(item) * 40 - scroll()
      return new DOMRect(horizontal ? start : 0, horizontal ? 0 : start, 40, 40)
    }
    list.append(item)
  }
  const onSelect = vi.fn((index: number) => {
    elements().forEach((item, each) => {
      item.setAttribute("aria-selected", String(each === index))
    })
  })
  cleanups.push(bindScrollPicker(list, { onSelect }))
  await vi.advanceTimersByTimeAsync(121)
  writes.length = 0
  return {
    list,
    items: elements(),
    writes,
    onSelect,
    async scrollTo(to: number) {
      offset = to
      list.dispatchEvent(new Event("wheel"))
      list.dispatchEvent(new Event("scroll"))
      await vi.advanceTimersByTimeAsync(16)
    },
    page(key: "PageUp" | "PageDown") {
      list.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))
    },
  }
}

test.each(["false", "removed"])(
  "scrolling can select the previous option after its selection is %s",
  async (clear) => {
    const wheel = await picker(1)
    if (clear === "false") {
      wheel.items[1].setAttribute("aria-selected", "false")
    } else {
      wheel.items[1].removeAttribute("aria-selected")
    }
    await Promise.resolve()
    await wheel.scrollTo(41)
    expect(wheel.onSelect.mock.calls.map(([index]) => index)).toEqual([1])
    expect(wheel.items[1].getAttribute("aria-selected")).toBe("true")
  }
)

test.each([false, true])(
  "Page Up starts from the visible option after removing the selection (horizontal: %s)",
  async (horizontal) => {
    const wheel = await picker(3, horizontal)
    wheel.items[3].remove()
    await Promise.resolve()
    wheel.page("PageUp")
    expect(wheel.onSelect.mock.calls.map(([index]) => index)).toEqual([1])
    expect(wheel.items[1].getAttribute("aria-selected")).toBe("true")
    expect(wheel.writes.every(Number.isFinite)).toBe(true)
  }
)

test("clearing the value while idle does not select or scroll another option", async () => {
  const wheel = await picker(2)
  wheel.items[2].setAttribute("aria-selected", "false")
  await Promise.resolve()
  await vi.advanceTimersByTimeAsync(200)
  expect(wheel.onSelect).not.toHaveBeenCalled()
  expect(wheel.writes).toEqual([])
  expect(wheel.list.querySelector('[aria-selected="true"]')).toBeNull()
})

test("an external selection still centers without reporting intermediate values", async () => {
  const wheel = await picker(1)
  wheel.items[1].setAttribute("aria-selected", "false")
  wheel.items[3].setAttribute("aria-selected", "true")
  await Promise.resolve()
  await vi.advanceTimersByTimeAsync(200)
  expect(wheel.writes).toEqual([120])
  expect(wheel.onSelect).not.toHaveBeenCalled()
})

test("removing another option retains the actual selection for Page Up", async () => {
  const wheel = await picker(3)
  wheel.items[0].remove()
  await Promise.resolve()
  wheel.page("PageUp")
  expect(wheel.onSelect.mock.calls.map(([index]) => index)).toEqual([1])
  expect(wheel.items[2].getAttribute("aria-selected")).toBe("true")
})

test("scrolling an unchanged selected option does not report it again", async () => {
  const wheel = await picker(1)
  await wheel.scrollTo(41)
  await vi.advanceTimersByTimeAsync(200)
  expect(wheel.onSelect).not.toHaveBeenCalled()
})
