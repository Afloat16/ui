// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import {
  checkbox,
  type CheckedState,
} from "../src/components/checkbox/checkbox"
import { numberInput } from "../src/components/number-input/number-input"
import { input } from "../src/components/input/input"
import { createAgent } from "../src/page/agent/agent"
import { stageChanges } from "../src/page/history/history"
import { bind } from "../src/foundation/kernel/part"

let cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup())
  cleanups = []
  document.body.innerHTML = ""
})

test.each([false, true])(
  "reports a staged revert with callback refusal %s",
  async (refuse) => {
    let refusing = false
    const instance = checkbox({
      id: "digest",
      onCheckedChange: (_checked, details) => {
        if (refusing) {
          details.cancel()
        }
      },
    })
    const el = document.body.appendChild(document.createElement("button"))
    el.setAttribute("aria-label", "Digest")
    cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
    const staged = await stageChanges(createAgent(), [
      { ref: "Digest", key: "checked", value: true },
    ])
    expect(staged.applied).toHaveLength(1)
    expect(instance.get().checked).toBe(true)
    refusing = refuse
    expect(await staged.revert()).toEqual(refuse ? staged.applied : [])
    expect(instance.get().checked).toBe(refuse)
    expect(await staged.revert()).toEqual([])
  }
)

test.each([false, true])(
  "reports a staged revert with controlled-owner refusal %s",
  async (refuse) => {
    let accepting = true
    const options = {
      id: "digest",
      checked: false as CheckedState,
      onCheckedChange(checked: CheckedState) {
        if (accepting) {
          instance.setOptions({ ...options, checked })
        }
      },
    }
    const instance = checkbox(options)
    const el = document.body.appendChild(document.createElement("button"))
    el.setAttribute("aria-label", "Digest")
    cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
    const staged = await stageChanges(createAgent(), [
      { ref: "Digest", key: "checked", value: true },
    ])
    expect(staged.applied).toHaveLength(1)
    expect(instance.get().checked).toBe(true)
    accepting = !refuse
    expect(await staged.revert()).toEqual(refuse ? staged.applied : [])
    expect(instance.get().checked).toBe(refuse)
  }
)

test.each(["callback", "controlled owner"])(
  "does not report a staged change that its %s refuses",
  async (refusal) => {
    const instance = checkbox({
      id: "digest",
      ...(refusal === "controlled owner" ? { checked: false } : {}),
      onCheckedChange: (_checked, details) => {
        if (refusal === "callback") {
          details.cancel()
        }
      },
    })
    const el = document.body.appendChild(document.createElement("button"))
    el.setAttribute("aria-label", "Digest")
    cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
    const staged = await stageChanges(createAgent(), [
      { ref: "Digest", key: "checked", value: true },
    ])
    expect(instance.get().checked).toBe(false)
    expect(staged.applied).toEqual([])
    expect(await staged.revert()).toEqual([])
  }
)

test("keeps precise decimal values through staging and reversion", async () => {
  const instance = numberInput({
    id: "precision",
    defaultValue: 0.121,
    step: 0.001,
  })
  const el = document.body.appendChild(document.createElement("div"))
  el.setAttribute("aria-label", "Precision")
  cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
  const staged = await stageChanges(createAgent(), [
    { ref: "Precision", value: 0.124 },
  ])
  expect(instance.get().value).toBe(0.124)
  expect(staged.applied[0].before).toBe(0.121)
  expect(await staged.revert()).toEqual([])
  expect(instance.get().value).toBe(0.121)
})

test("records each change's immediate prior value when staging one control twice", async () => {
  const instance = numberInput({ id: "quantity", defaultValue: 10 })
  const el = document.body.appendChild(document.createElement("div"))
  el.setAttribute("aria-label", "Quantity")
  cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
  const staged = await stageChanges(createAgent(), [
    { ref: "Quantity", value: 20 },
    { ref: "Quantity", value: 30 },
  ])
  expect(staged.applied.map((change) => change.before)).toEqual([10, 20])
  expect(await staged.revert()).toEqual([])
  expect(instance.get().value).toBe(10)
})

test("keeps an accepted clamped change reversible", async () => {
  const instance = numberInput({
    id: "quantity",
    defaultValue: 20,
    min: 0,
    max: 100,
  })
  const el = document.body.appendChild(document.createElement("div"))
  el.setAttribute("aria-label", "Quantity")
  cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
  const staged = await stageChanges(createAgent(), [
    { ref: "Quantity", value: 150 },
  ])
  expect(staged.applied).toHaveLength(1)
  expect(instance.get().value).toBe(100)
  expect(await staged.revert()).toEqual([])
  expect(instance.get().value).toBe(20)
})

test("clears a password that was empty before staging", async () => {
  const instance = input({ id: "password" })
  const el = document.body.appendChild(document.createElement("input"))
  el.type = "password"
  el.setAttribute("aria-label", "Password")
  cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
  const staged = await stageChanges(createAgent(), [
    { ref: "Password", value: "staged password" },
  ])
  expect(staged.applied[0].before).toBe("")
  expect(await staged.revert()).toEqual([])
  expect(instance.get().value).toBe("")
})
