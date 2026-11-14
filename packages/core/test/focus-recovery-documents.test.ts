// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import {
  createFocusRecovery,
  type LostFocus,
} from "../src/foundation/focus/focus-recovery"

const cleanups: (() => void)[] = []

afterEach(async () => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  await Promise.resolve()
  document.body.replaceChildren()
})

function ownerDocument(embedded: boolean) {
  if (!embedded) {
    return document
  }
  const iframe = document.createElement("iframe")
  document.body.append(iframe)
  return iframe.contentDocument!
}

function fixture(embedded: boolean) {
  const doc = ownerDocument(embedded)
  const lost = doc.createElement("button")
  const fallback = doc.createElement("button")
  const elsewhere = doc.createElement("button")
  doc.body.append(lost, fallback, elsewhere)
  const recover = vi.fn((_lost: LostFocus) => fallback)
  const recovery = createFocusRecovery({ fallback: recover })
  const cleanup = recovery.bind(lost, { key: "lost", props: { id: 1 } })
  cleanups.push(cleanup)
  return { doc, lost, fallback, elsewhere, recover, cleanup }
}

test.each([false, true])(
  "recovers a focused item removed before cleanup (embedded: %s)",
  async (embedded) => {
    const f = fixture(embedded)
    f.lost.focus()
    expect(f.doc.activeElement).toBe(f.lost)
    f.lost.remove()
    f.cleanup()
    await Promise.resolve()
    expect(f.doc.activeElement).toBe(f.fallback)
    expect(f.recover).toHaveBeenCalledWith({
      key: "lost",
      props: { id: 1 },
      el: f.lost,
    })
  }
)

test.each([false, true])(
  "recovers when cleanup precedes removal (embedded: %s)",
  async (embedded) => {
    const f = fixture(embedded)
    f.lost.focus()
    f.cleanup()
    f.lost.remove()
    await Promise.resolve()
    expect(f.doc.activeElement).toBe(f.fallback)
  }
)

test.each([false, true])(
  "keeps focus moved elsewhere before the recovery microtask (embedded: %s)",
  async (embedded) => {
    const f = fixture(embedded)
    f.lost.focus()
    f.cleanup()
    f.lost.remove()
    f.elsewhere.focus()
    await Promise.resolve()
    expect(f.doc.activeElement).toBe(f.elsewhere)
    expect(f.recover).not.toHaveBeenCalled()
  }
)

test("does not pull focus back into a frame after it moved to the containing page", async () => {
  const f = fixture(true)
  const outside = document.createElement("button")
  document.body.append(outside)
  f.lost.focus()
  f.cleanup()
  f.lost.remove()
  outside.focus()
  await Promise.resolve()
  expect(document.activeElement).toBe(outside)
  expect(f.recover).not.toHaveBeenCalled()
})

test("ignores removal of an item that never held focus", async () => {
  const f = fixture(true)
  f.elsewhere.focus()
  f.lost.remove()
  f.cleanup()
  await Promise.resolve()
  expect(f.doc.activeElement).toBe(f.elsewhere)
  expect(f.recover).not.toHaveBeenCalled()
})

test.each([
  { embedded: false, removalFirst: false },
  { embedded: false, removalFirst: true },
  { embedded: true, removalFirst: false },
  { embedded: true, removalFirst: true },
])(
  "retains the innermost bound item (embedded: $embedded, removal first: $removalFirst)",
  async ({ embedded, removalFirst }) => {
    const doc = ownerDocument(embedded)
    const outer = doc.createElement("div")
    const inner = doc.createElement("button")
    const fallback = doc.createElement("button")
    outer.append(inner)
    doc.body.append(outer, fallback)
    const recover = vi.fn((_lost: LostFocus) => fallback)
    const recovery = createFocusRecovery({ fallback: recover })
    const outerCleanup = recovery.bind(outer, { key: "outer", props: {} })
    const innerCleanup = recovery.bind(inner, { key: "inner", props: {} })
    cleanups.push(outerCleanup, innerCleanup)
    inner.focus()
    if (removalFirst) {
      outer.remove()
    }
    outerCleanup()
    innerCleanup()
    if (!removalFirst) {
      outer.remove()
    }
    await Promise.resolve()
    expect(doc.activeElement).toBe(fallback)
    expect(recover.mock.calls.map(([lost]) => lost.key)).toEqual(["inner"])
  }
)
