import { sameValue } from "../../foundation/kernel/store"
import { entries } from "../observe/registry"

const current = ({ ref, key }: { ref: string; key: string }) =>
  (
    entries.get(ref)?.instance.deref()?.get() as
      Record<string, unknown> | undefined
  )?.[key]

const same = (a: unknown, b: unknown) =>
  sameValue(a, b) || JSON.stringify(a) === JSON.stringify(b)

export { current, same }
