// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { bindHold } from "../src/foundation/direct-manipulation/hold"
import { bindRepeat } from "../src/foundation/direct-manipulation/repeat"

const cleanups: (() => void)[] = []

beforeEach(() => vi.useFakeTimers())

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.body.replaceChildren()
})

function button() {
  const el = document.createElement("button")
  document.body.append(el)
  return el
}

function down(input: "pointer" | "key", id = 1) {
  return input === "pointer"
    ? new PointerEvent("pointerdown", {
        pointerId: id,
        pointerType: "touch",
        isPrimary: true,
        button: 0,
        bubbles: true,
        cancelable: true,
      })
    : new KeyboardEvent("keydown", {
        key: " ",
        bubbles: true,
        cancelable: true,
      })
}

function release(el: HTMLElement, input: "pointer" | "key", id = 1) {
  el.dispatchEvent(
    input === "pointer"
      ? new PointerEvent("pointerup", { pointerId: id, bubbles: true })
      : new KeyboardEvent("keyup", { key: " ", bubbles: true })
  )
}

test.each(["pointer", "key"] as const)(
  "unbinding in onPress leaves no active %s hold or cancellation listener",
  (input) => {
    const el = button()
    const onHold = vi.fn()
    const onEnd = vi.fn()
    const cleanup = bindHold(el, {
      delay: 10,
      repeat: 10,
      onPress: () => cleanup(),
      onHold,
      onEnd,
    })
    cleanups.push(cleanup)
    el.dispatchEvent(down(input))
    vi.advanceTimersByTime(50)
    expect(onHold).not.toHaveBeenCalled()
    expect(el.hasAttribute("data-holding")).toBe(false)
    expect(el.hasAttribute("data-held")).toBe(false)
    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    })
    document.body.dispatchEvent(escape)
    release(el, input)
    expect(escape.defaultPrevented).toBe(false)
    expect(onEnd).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  }
)

test.each(["pointer", "key"] as const)(
  "rebinding from onPress gives only the new binding the next %s press",
  (input) => {
    const el = button()
    const oldHold = vi.fn()
    const newHold = vi.fn()
    const cleanup = bindHold(el, {
      delay: 10,
      onPress: () => {
        cleanup()
        cleanups.push(bindHold(el, { delay: 10, onHold: newHold }))
      },
      onHold: oldHold,
    })
    cleanups.push(cleanup)
    el.dispatchEvent(down(input))
    vi.advanceTimersByTime(10)
    release(el, input)
    el.dispatchEvent(down(input))
    vi.advanceTimersByTime(10)
    release(el, input)
    expect(oldHold).not.toHaveBeenCalled()
    expect(newHold).toHaveBeenCalledOnce()
  }
)

test("a nested accepted press is not overwritten when onPress returns", () => {
  const el = button()
  const onHold = vi.fn()
  const onEnd = vi.fn()
  let nested = false
  cleanups.push(
    bindHold(el, {
      delay: 10,
      onPress: () => {
        if (!nested) {
          nested = true
          el.dispatchEvent(down("pointer", 2))
        }
      },
      onHold,
      onEnd,
    })
  )
  el.dispatchEvent(down("pointer", 1))
  vi.advanceTimersByTime(10)
  expect(onHold).toHaveBeenCalledOnce()
  expect(onHold.mock.calls[0][0].event.pointerId).toBe(2)
  release(el, "pointer", 1)
  expect(onEnd).not.toHaveBeenCalled()
  release(el, "pointer", 2)
  expect(onEnd).toHaveBeenCalledOnce()
  expect(onEnd.mock.calls[0][0].event.pointerId).toBe(2)
})

test("refusing one press does not disable a later accepted press", () => {
  const el = button()
  const onHold = vi.fn()
  let accept = false
  cleanups.push(bindHold(el, { delay: 10, onPress: () => accept, onHold }))
  el.dispatchEvent(down("pointer"))
  vi.advanceTimersByTime(10)
  expect(onHold).not.toHaveBeenCalled()
  accept = true
  el.dispatchEvent(down("pointer"))
  vi.advanceTimersByTime(10)
  expect(onHold).toHaveBeenCalledOnce()
})

test("unbinding from onHold still cancels repeating without reporting an end", () => {
  const el = button()
  const onEnd = vi.fn()
  const onHold = vi.fn(() => cleanup())
  const cleanup = bindHold(el, { delay: 10, repeat: 10, onHold, onEnd })
  cleanups.push(cleanup)
  el.dispatchEvent(down("pointer"))
  vi.advanceTimersByTime(50)
  expect(onHold).toHaveBeenCalledOnce()
  expect(onEnd).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

test.each(["mouse", "touch", "keyboard"] as const)(
  "unbinding from a repeat's onPress starts no %s step or document listener",
  (input) => {
    const el = button()
    const onStep = vi.fn()
    const onEnd = vi.fn()
    const added = vi.spyOn(document, "addEventListener")
    const cleanup = bindRepeat(el, {
      delay: 10,
      repeat: 10,
      onPress: () => cleanup(),
      onStep,
      onEnd,
    })
    cleanups.push(cleanup)
    el.dispatchEvent(
      input === "keyboard"
        ? down("key")
        : new PointerEvent("pointerdown", {
            pointerId: 1,
            pointerType: input,
            isPrimary: true,
            button: 0,
            bubbles: true,
          })
    )
    vi.advanceTimersByTime(50)
    expect(onStep).not.toHaveBeenCalled()
    expect(onEnd).not.toHaveBeenCalled()
    expect(el.hasAttribute("data-holding")).toBe(false)
    expect(
      added.mock.calls.filter(([type]) =>
        ["pointermove", "pointerup", "pointercancel", "keydown"].includes(type)
      )
    ).toEqual([])
  }
)
