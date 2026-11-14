// @vitest-environment jsdom
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test } from "vitest"
import { createAgent } from "../src/agent"
import { stageChanges } from "../src/history"
import { Tabs, TabsList, TabsPanel, TabsTab } from "../src/tabs"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
Element.prototype.getAnimations ??= () => []
let root: Root | undefined
const agent = createAgent()

afterEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

function Suspends({ until }: { until?: Promise<void> }) {
  if (until) {
    React.use(until)
  }
  return null
}

function App({ until }: { until?: Promise<void> }) {
  const [value, setValue] = React.useState("account")
  return (
    <Tabs
      aria-label="Settings"
      value={value}
      onValueChange={(next) =>
        React.startTransition(() => setValue(next as string))
      }
    >
      <TabsList>
        <TabsTab value="account">Account</TabsTab>
        <TabsTab value="billing">Billing</TabsTab>
      </TabsList>
      <React.Suspense fallback={<p>Loading</p>}>
        <TabsPanel value="account">Account settings</TabsPanel>
        <TabsPanel value="billing">
          <Suspends until={until} />
          Billing settings
        </TabsPanel>
      </React.Suspense>
    </Tabs>
  )
}

async function mount(until?: Promise<void>) {
  const container = document.body.appendChild(document.createElement("div"))
  root = createRoot(container)
  await React.act(async () => root!.render(<App until={until} />))
  const component = agent
    .snapshot()
    .find((entry) => entry.component === "tabs")!
  expect(component).toBeDefined()
  return { container, ref: component.ref }
}

const selected = (container: HTMLElement) =>
  container.querySelector('[role="tab"][aria-selected="true"]')?.textContent

test("staging and reverting a controlled transition without suspension works", async () => {
  const { container, ref } = await mount()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false })
  const staged = await stageChanges(agent, [{ ref, value: "billing" }])
  expect(selected(container)).toBe("Billing")
  expect(staged.applied).toHaveLength(1)
  expect(await staged.revert()).toEqual([])
  expect(selected(container)).toBe("Account")
})

test.each([false, true])(
  "a staged controlled transition remains reversible after a pending rerender %s",
  async (refresh) => {
    let resolve = () => {}
    const until = new Promise<void>((done) => {
      resolve = done
    })
    const { container, ref } = await mount(until)
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false })
    const staged = await stageChanges(agent, [{ ref, value: "billing" }])
    expect(selected(container)).toBe("Account")
    expect(staged.applied).toEqual([])
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    if (refresh) {
      await React.act(async () => root!.render(<App until={until} />))
      expect(selected(container)).toBe("Account")
    }
    await React.act(async () => resolve())
    expect(selected(container)).toBe("Billing")
    expect(staged.applied).toHaveLength(1)
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false })
    const failed = await staged.revert()
    expect(failed).toEqual([])
    expect(selected(container)).toBe("Account")
  }
)
