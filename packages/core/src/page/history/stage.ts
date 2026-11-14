// Trying changes on the page and taking them back: an agent's suggestion
// shown on the real control while a person looks at it, a preview of a
// preset, a "what would this look like". The values go on through the bridge,
// like any agent step, and `revert` puts back what each control had.
import type { AgentComponent, createAgent } from "../agent/agent"
import { entries as registered, setterOf } from "../observe/registry"
import {
  requestedChanges,
  sameValue,
  type ChangeRequest,
} from "../../foundation/kernel/store"
import { current, same } from "./values"

/**
 * One value to put on a control: its ref or label, the key, and the value.
 * @experimental
 */
type StagedChange = { ref: string; key?: string; value: unknown }

/**
 * Puts values on the page's controls through the agent bridge, and returns
 * how to take them back. `key` defaults to `"value"`, set with the
 * component's `set<Key>` action. Changes that can't run are skipped, and
 * `revert` restores only the ones that did, in reverse order, and resolves
 * with the ones it couldn't put back, like a password field's, whose value
 * before reads `"[redacted]"`.
 *
 * ```ts
 * const staged = await stageChanges(agent, [{ ref: "Volume", value: 80 }, { ref: "Theme", value: "dark" }])
 * // later
 * await staged.revert()
 * ```
 * @experimental
 */
async function stageChanges(
  agent: ReturnType<typeof createAgent>,
  changes: readonly StagedChange[]
) {
  const onPage = (list: AgentComponent[] | { error: string }) =>
    Array.isArray(list)
      ? list.filter((c) => !c.offPage && c.component !== "more")
      : []
  const components = onPage(agent.snapshot())
  // A long page's snapshot stops at its limit, so a control past it is looked up by name.
  const find = async (ref: string) => {
    const match = (list: AgentComponent[]) =>
      list.find((c) => c.ref === ref) ?? list.find((c) => c.label === ref)
    return match(components) ?? match(onPage(await agent.query({ text: ref })))
  }
  const applied: {
    ref: string
    key: string
    before: unknown
    value: unknown
  }[] = []
  const landed = new Map<
    (typeof applied)[number],
    { value: unknown; request?: ChangeRequest; index: number }
  >()
  let pending: {
    change: (typeof applied)[number]
    request: ChangeRequest
    index: number
  }[] = []
  const settled = () => {
    pending = pending.filter(({ change, request, index }) => {
      const value = current(change)
      if (request.status === "pending" && same(value, request.previous)) {
        return true
      }
      if (request.status !== "discarded" && same(value, request.value)) {
        const at = applied.findIndex(
          (entry) => landed.get(entry)!.index > index
        )
        applied.splice(at < 0 ? applied.length : at, 0, change)
        landed.set(change, { value, request, index })
      }
      return false
    })
    return applied
  }
  for (const [index, change] of changes.entries()) {
    const component = await find(change.ref)
    settled()
    const key = change.key ?? "value"
    if (!component || !component.actions.includes(setterOf(key))) {
      continue
    }
    const target = { ref: component.ref, key }
    const instance = registered.get(component.ref)?.instance.deref()
    if (!instance) {
      continue
    }
    const requests = requestedChanges(instance)
    const previousRequest = requests.get(key)
    const before = current(target)
    const redacted =
      registered.get(component.ref)?.secret && before !== "" && before != null
    const result = await agent.act({
      steps: [
        { ref: component.ref, action: setterOf(key), args: [change.value] },
      ],
    })
    if (!result.ok) {
      continue
    }
    const receipt = {
      ...target,
      before: redacted ? "[redacted]" : before,
      value: change.value,
    }
    const latest = requests.get(key)
    const request =
      latest !== previousRequest && latest?.source === "agent"
        ? latest
        : undefined
    const value = current(target)
    if (!sameValue(value, before)) {
      applied.push(receipt)
      landed.set(receipt, { value, request, index })
    } else if (request) {
      pending.push({ change: receipt, request, index })
    }
  }
  let reverted = false
  return {
    /** The changes that went on, including controlled values delivered since the last read. */
    get applied() {
      return settled() as readonly (typeof applied)[number][]
    },
    /** Puts back what each control had, and resolves with the changes it couldn't. Runs once. */
    async revert() {
      if (reverted) {
        return []
      }
      reverted = true
      const failed: typeof applied = []
      const checked = new Set<string>()
      const blocked = new Set<string>()
      for (const change of [...settled()].reverse()) {
        const { ref, key, before } = change
        const target = `${ref}:${key}`
        const receipt = landed.get(change)!
        const value = current(change)
        // A secret field's value before is hidden, and "[redacted]" would land in it.
        const hidden = before === "[redacted]" && !!registered.get(ref)?.secret
        if (!hidden && same(value, before)) {
          continue
        }
        if (!checked.has(target)) {
          checked.add(target)
          if (receipt.request?.status === "discarded") {
            blocked.add(target)
          }
        }
        const done =
          !hidden &&
          !blocked.has(target) &&
          same(value, receipt.value) &&
          (
            await agent.act({
              steps: [{ ref, action: setterOf(key), args: [before] }],
            })
          ).ok &&
          same(current(change), before)
        if (!done) {
          blocked.add(target)
          failed.push(change)
        }
      }
      pending = []
      return failed
    },
  }
}

export { stageChanges, type StagedChange }
