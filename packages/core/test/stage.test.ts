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

test("includes a controlled change once its owner delivers it", async () => {
  let deferred = true
  const options = {
    id: "quantity",
    value: 20,
    onValueChange(value: number | null) {
      if (!deferred) {
        instance.setOptions({ ...options, value })
      }
    },
  }
  const instance = numberInput(options)
  const el = document.body.appendChild(document.createElement("div"))
  el.setAttribute("aria-label", "Quantity")
  cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
  const staged = await stageChanges(createAgent(), [
    { ref: "Quantity", value: 30 },
  ])
  expect(staged.applied).toEqual([])
  instance.setOptions(options)
  expect(staged.applied).toEqual([])
  instance.setOptions({ ...options, value: 30 })
  expect(staged.applied).toHaveLength(1)
  expect(staged.applied).toHaveLength(1)
  expect(staged.applied[0].before).toBe(20)
  deferred = false
  expect(await staged.revert()).toEqual([])
  expect(instance.get().value).toBe(20)
})

test.each(["cancel", "different options"])(
  "does not revive a deferred receipt after %s",
  async (refusal) => {
    const options = {
      id: "quantity",
      value: 20,
      onValueChange(_value: number | null, details: { cancel: () => void }) {
        if (refusal === "cancel") {
          details.cancel()
        }
      },
    }
    const instance = numberInput(options)
    const el = document.body.appendChild(document.createElement("div"))
    el.setAttribute("aria-label", "Quantity")
    cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
    const staged = await stageChanges(createAgent(), [
      { ref: "Quantity", value: 30 },
    ])
    expect(staged.applied).toEqual([])
    if (refusal !== "cancel") {
      instance.setOptions({ ...options, value: 40 })
    }
    instance.setOptions({ ...options, value: 30 })
    expect(staged.applied).toEqual([])
    expect(await staged.revert()).toEqual([])
    expect(instance.get().value).toBe(30)
  }
)

test("a new request supersedes an earlier deferred receipt", async () => {
  let deferred = true
  const options = {
    id: "quantity",
    value: 20,
    onValueChange(value: number | null) {
      if (!deferred) {
        instance.setOptions({ ...options, value })
      }
    },
  }
  const instance = numberInput(options)
  const el = document.body.appendChild(document.createElement("div"))
  el.setAttribute("aria-label", "Quantity")
  cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
  const agent = createAgent()
  const first = await stageChanges(agent, [{ ref: "Quantity", value: 30 }])
  const retry = await stageChanges(agent, [{ ref: "Quantity", value: 30 }])
  instance.setOptions({ ...options, value: 30 })
  expect(first.applied).toEqual([])
  expect(retry.applied).toHaveLength(1)
  expect(await first.revert()).toEqual([])
  expect(instance.get().value).toBe(30)
  deferred = false
  expect(await retry.revert()).toEqual([])
  expect(instance.get().value).toBe(20)
})

test.each([false, true])(
  "retains a deferred replacement inside a clamped request canceled %s",
  async (cancel) => {
    let deferred = true
    let delivered: number | null = null
    const options = {
      id: "quantity",
      value: 20,
      min: 0,
      max: 100,
      onValueChange(value: number | null, details: { cancel: () => void }) {
        if (value !== null && value > 80) {
          instance.api.setValue(80)
          if (cancel) {
            details.cancel()
          }
        } else if (deferred) {
          delivered = value
        } else {
          instance.setOptions({ ...options, value })
        }
      },
    }
    const instance = numberInput(options)
    const el = document.body.appendChild(document.createElement("div"))
    el.setAttribute("aria-label", "Quantity")
    cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
    const staged = await stageChanges(createAgent(), [
      { ref: "Quantity", value: 150 },
    ])
    expect(staged.applied).toEqual([])
    expect(delivered).toBe(80)
    instance.setOptions({ ...options, value: delivered })
    expect(staged.applied).toHaveLength(1)
    expect(staged.applied[0].before).toBe(20)
    expect(staged.applied[0].value).toBe(150)
    deferred = false
    expect(await staged.revert()).toEqual([])
    expect(instance.get().value).toBe(20)
  }
)

test("destroying a control discards its deferred receipt", async () => {
  const instance = checkbox({
    id: "digest",
    checked: false,
    onCheckedChange() {},
  })
  const el = document.body.appendChild(document.createElement("button"))
  el.setAttribute("aria-label", "Digest")
  cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
  const staged = await stageChanges(createAgent(), [
    { ref: "Digest", key: "checked", value: true },
  ])
  expect(staged.applied).toEqual([])
  instance.destroy()
  expect(staged.applied).toEqual([])
  expect(await staged.revert()).toEqual([])
})

test.each([
  { read: false, returning: false },
  { read: true, returning: false },
  { read: false, returning: true },
  { read: true, returning: true },
])(
  "keeps external changes after a deferred receipt with %j",
  async ({ read, returning }) => {
    const options = {
      id: "quantity",
      value: 20,
      onValueChange() {},
    }
    const instance = numberInput(options)
    const el = document.body.appendChild(document.createElement("div"))
    el.setAttribute("aria-label", "Quantity")
    cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
    const staged = await stageChanges(createAgent(), [
      { ref: "Quantity", value: 30 },
    ])
    instance.setOptions({ ...options, value: 30 })
    if (read) {
      expect(staged.applied).toHaveLength(1)
    }
    instance.setOptions({ ...options, value: 40 })
    if (returning) {
      instance.setOptions({ ...options, value: 30 })
    }
    const failed = await staged.revert()
    expect(failed).toEqual(read ? staged.applied : [])
    expect(instance.get().value).toBe(returning ? 30 : 40)
  }
)

test.each(["", "original secret"])(
  "a deferred secret receipt preserves redaction when its previous value is %j",
  async (value) => {
    let deferred = true
    const options = {
      id: "password",
      value,
      onValueChange(value: string) {
        if (!deferred) {
          instance.setOptions({ ...options, value })
        }
      },
    }
    const instance = input(options)
    const el = document.body.appendChild(document.createElement("input"))
    el.type = "password"
    el.setAttribute("aria-label", "Password")
    cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
    const staged = await stageChanges(createAgent(), [
      { ref: "Password", value: "replacement secret" },
    ])
    expect(staged.applied).toEqual([])
    instance.setOptions({ ...options, value: "replacement secret" })
    expect(staged.applied[0].before).toBe(value ? "[redacted]" : "")
    expect(JSON.stringify(staged.applied)).not.toContain("original secret")
    deferred = false
    expect(await staged.revert()).toEqual(value ? staged.applied : [])
    expect(instance.get().value).toBe(value ? "replacement secret" : "")
  }
)

test("a followed value can be reverted before its options are handed over", async () => {
  let deferred = true
  const options = {
    id: "digest",
    checked: false,
    onCheckedChange(checked: CheckedState) {
      if (!deferred) {
        current = { ...options, checked }
        instance.setOptions(current)
      }
    },
  }
  let current = { ...options, checked: false as CheckedState }
  const instance = checkbox(options)
  instance.follow(() => current)
  const el = document.body.appendChild(document.createElement("button"))
  el.setAttribute("aria-label", "Digest")
  cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
  const staged = await stageChanges(createAgent(), [
    { ref: "Digest", key: "checked", value: true },
  ])
  expect(staged.applied).toEqual([])
  current = { ...options, checked: true }
  expect(instance.get().checked).toBe(true)
  expect(staged.applied).toHaveLength(1)
  deferred = false
  expect(await staged.revert()).toEqual([])
  expect(instance.get().checked).toBe(false)
})

test.each([30, 100])(
  "reverses mixed deliveries of one control when value %s waits",
  async (waiting) => {
    let deferred = true
    const options = {
      id: "quantity",
      value: 20,
      max: 100,
      onValueChange(value: number | null) {
        if (!deferred || value !== waiting) {
          instance.setOptions({ ...options, value })
        }
      },
    }
    const instance = numberInput(options)
    const el = document.body.appendChild(document.createElement("div"))
    el.setAttribute("aria-label", "Quantity")
    cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
    const staged = await stageChanges(createAgent(), [
      { ref: "Quantity", value: 30 },
      { ref: "Quantity", value: 150 },
    ])
    if (waiting === 100) {
      expect(staged.applied.map((change) => change.before)).toEqual([20])
      instance.setOptions({ ...options, value: 100 })
    }
    expect(staged.applied.map((change) => change.before)).toEqual(
      waiting === 100 ? [20, 30] : [20]
    )
    expect(instance.get().value).toBe(100)
    deferred = false
    expect(await staged.revert()).toEqual([])
    expect(instance.get().value).toBe(20)
  }
)

test("reverses a deferred delivery that lands between staged steps", async () => {
  let deferred = true
  const options = {
    id: "quantity",
    value: 20,
    max: 100,
    onValueChange(value: number | null) {
      if (!deferred) {
        quantity.setOptions({ ...options, value })
      }
    },
  }
  const quantity = numberInput(options)
  const quantityEl = document.body.appendChild(document.createElement("div"))
  quantityEl.setAttribute("aria-label", "Quantity")
  const digest = checkbox({
    id: "digest",
    onCheckedChange(checked) {
      if (checked) {
        quantity.setOptions({ ...options, value: 30 })
        deferred = false
      }
    },
  })
  const digestEl = document.body.appendChild(document.createElement("button"))
  digestEl.setAttribute("aria-label", "Digest")
  cleanups.push(
    bind(quantity.part("root"), quantityEl),
    () => quantity.destroy(),
    bind(digest.part("root"), digestEl),
    () => digest.destroy()
  )
  const staged = await stageChanges(createAgent(), [
    { ref: "Quantity", value: 30 },
    { ref: "Digest", key: "checked", value: true },
    { ref: "Quantity", value: 150 },
  ])
  expect(staged.applied).toHaveLength(3)
  expect(staged.applied.map((change) => change.value)).toEqual([30, true, 150])
  expect(quantity.get().value).toBe(100)
  expect(await staged.revert()).toEqual([])
  expect(quantity.get().value).toBe(20)
  expect(digest.get().checked).toBe(false)
})

test("does not undo earlier receipts after external changes invalidate the latest", async () => {
  const options = {
    id: "quantity",
    value: 20,
    onValueChange(value: number | null) {
      instance.setOptions({ ...options, value })
    },
  }
  const instance = numberInput(options)
  const el = document.body.appendChild(document.createElement("div"))
  el.setAttribute("aria-label", "Quantity")
  cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
  const staged = await stageChanges(createAgent(), [
    { ref: "Quantity", value: 30 },
    { ref: "Quantity", value: 40 },
    { ref: "Quantity", value: 30 },
  ])
  expect(staged.applied).toHaveLength(3)
  instance.setOptions({ ...options, value: 50 })
  instance.setOptions({ ...options, value: 30 })
  expect(await staged.revert()).toHaveLength(2)
  expect(instance.get().value).toBe(30)
})
