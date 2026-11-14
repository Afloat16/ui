import { render, type JSX } from "@solidjs/web"
import { action, createSignal, flush } from "solid-js"
import { afterEach, expect, test } from "vitest"
import { createAgent } from "../src/agent"
import { stageChanges } from "../src/history"
import { Switch } from "../src/switch"

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup())
  document.body.replaceChildren()
})
const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
    flush()
  }
}
function mount(code: () => JSX.Element) {
  const root = document.body.appendChild(document.createElement("div"))
  cleanups.push(render(code, root))
  flush()
  return root
}

test("a controlled Solid stage remains reversible after its action commits", async () => {
  const [checked, setChecked] = createSignal(false)
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let pendingAction = Promise.resolve()
  const update = action(function* (next: boolean) {
    setChecked(next)
    yield gate
  })
  const root = mount(() => (
    <Switch
      aria-label="Delayed digest"
      checked={checked()}
      onCheckedChange={(next) => {
        if (next) {
          pendingAction = update(next)
        } else {
          setChecked(next)
        }
      }}
    />
  ))
  await settle()
  const staged = await stageChanges(createAgent(), [
    { ref: "Delayed digest", key: "checked", value: true },
  ])
  await settle()
  expect(
    root.querySelector('[role="switch"]')!.getAttribute("aria-checked")
  ).toBe("false")
  release()
  await pendingAction
  await settle()
  expect(
    root.querySelector('[role="switch"]')!.getAttribute("aria-checked")
  ).toBe("true")
  expect(await staged.revert()).toEqual([])
  await settle()
  expect(
    root.querySelector('[role="switch"]')!.getAttribute("aria-checked")
  ).toBe("false")
})
