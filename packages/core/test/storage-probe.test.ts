// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest"

beforeEach(() => vi.resetModules())
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})

for (const kind of ["local", "session"] as const) {
  test.each(["", "保留🧭"])(
    `${kind} availability preserves existing probe keys containing %j`,
    async (value) => {
      const { createLocalStorage, createSessionStorage } =
        await import("../src/foundation/storage/storage")
      const create =
        kind === "local" ? createLocalStorage : createSessionStorage
      const area = kind === "local" ? localStorage : sessionStorage
      const probe = "__ui-sdk-storage__"
      const storage = create(probe)
      expect(storage.set(value)).toBe(true)
      area.setItem(`${probe}_`, "another application value")
      area.setItem("density", "compact")

      expect(storage.available()).toBe(true)
      expect(storage.get()).toBe(value)
      expect(area.getItem(`${probe}_`)).toBe("another application value")
      expect(area.getItem("density")).toBe("compact")
      expect(area.length).toBe(3)
      expect(storage.available()).toBe(true)
      expect(storage.get()).toBe(value)
    }
  )

  test(`${kind} availability removes only its temporary key`, async () => {
    const { createLocalStorage, createSessionStorage } =
      await import("../src/foundation/storage/storage")
    const create = kind === "local" ? createLocalStorage : createSessionStorage
    const area = kind === "local" ? localStorage : sessionStorage
    const storage = create("color-scheme")
    expect(storage.set("dark")).toBe(true)

    expect(storage.available()).toBe(true)
    expect(storage.get()).toBe("dark")
    expect(area.length).toBe(1)
    expect(area.getItem("__ui-sdk-storage__")).toBeNull()
  })

  test(`${kind} retries a rejected probe without losing existing data`, async () => {
    const { createLocalStorage, createSessionStorage } =
      await import("../src/foundation/storage/storage")
    const create = kind === "local" ? createLocalStorage : createSessionStorage
    const area = kind === "local" ? localStorage : sessionStorage
    const storage = create("color-scheme")
    expect(storage.set("dark")).toBe(true)
    area.setItem("__ui-sdk-storage__", "retained")
    const write = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Full", "QuotaExceededError")
      })

    expect(storage.available()).toBe(false)
    expect(storage.get()).toBe("dark")
    expect(area.getItem("__ui-sdk-storage__")).toBe("retained")
    expect(area.length).toBe(2)
    write.mockRestore()
    expect(storage.available()).toBe(true)
    expect(area.getItem("__ui-sdk-storage__")).toBe("retained")
    expect(area.length).toBe(2)
  })
}
