// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import { createPreference } from "../src/foundation/preferences/preference"
import {
  createLocalStorage,
  createSessionStorage,
} from "../src/foundation/storage/storage"

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.restoreAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})

for (const [kind, create] of [
  ["local", createLocalStorage],
  ["session", createSessionStorage],
] as const) {
  test.each([null, "dark", "invalid"])(
    `${kind} preference reads initial storage value %j once before subscribing`,
    (saved) => {
      const storage = create("color-scheme")
      if (saved !== null) {
        storage.set(saved)
      }
      const read = vi.spyOn(Storage.prototype, "getItem")
      const preference = createPreference({
        values: ["system", "light", "dark"],
        defaultValue: "system",
        attribute: "data-color-scheme",
        storage,
      })
      const initial = preference.get()
      expect(initial.value).toBe(saved === "dark" ? "dark" : "system")
      for (let render = 0; render < 100; render++) {
        expect(preference.get()).toBe(initial)
      }
      expect(read).toHaveBeenCalledTimes(1)

      storage.set("light")
      expect(preference.get()).toBe(initial)
      const heard: string[] = []
      cleanups.push(preference.subscribe((state) => heard.push(state.value)))
      expect(preference.get().value).toBe("light")
      expect(read).toHaveBeenCalledTimes(2)
      expect(heard).toEqual(["light"])
      storage.remove()
      expect(preference.get().value).toBe("system")
      expect(heard).toEqual(["light", "system"])
    }
  )
}
