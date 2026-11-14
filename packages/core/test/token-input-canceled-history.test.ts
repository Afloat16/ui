import { beforeAll, describe, expect, test } from "vitest"
import { tokenInput } from "../src/components/token-input/token-input"
import { setAnnouncer } from "../src/foundation/platform/announce"

beforeAll(() => setAnnouncer(() => {}))

describe("token input history cancellation", () => {
  test("retries a canceled undo without consuming either history step", () => {
    let cancel = true
    const requested: string[] = []
    const instance = tokenInput({
      id: "undo",
      defaultValue: ["zero"],
      onValueChange(value, details) {
        if (details.reason === "undo") {
          requested.push(value.join(""))
          if (cancel) {
            details.cancel()
          }
        }
      },
    })
    instance.api.setValue(["one"])
    instance.api.setValue(["two"])
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(instance.api.undo()).toBe(false)
      expect(instance.api.getValue()).toEqual(["two"])
      expect(instance.api.canUndo()).toBe(true)
      expect(instance.api.canRedo()).toBe(false)
    }
    expect(requested).toEqual(["one", "one", "one"])
    cancel = false
    expect(instance.api.undo()).toBe(true)
    expect(instance.api.getValue()).toEqual(["one"])
    expect(instance.api.undo()).toBe(true)
    expect(instance.api.getValue()).toEqual(["zero"])
    expect(instance.api.canUndo()).toBe(false)
    expect(instance.api.redo()).toBe(true)
    expect(instance.api.getValue()).toEqual(["one"])
  })

  test("retries a canceled redo without consuming either history step", () => {
    let cancel = true
    const requested: string[] = []
    const instance = tokenInput({
      id: "redo",
      defaultValue: ["zero"],
      onValueChange(value, details) {
        if (details.reason === "redo") {
          requested.push(value.join(""))
          if (cancel) {
            details.cancel()
          }
        }
      },
    })
    instance.api.setValue(["one"])
    instance.api.setValue(["two"])
    instance.api.undo()
    instance.api.undo()
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(instance.api.redo()).toBe(false)
      expect(instance.api.getValue()).toEqual(["zero"])
      expect(instance.api.canUndo()).toBe(false)
      expect(instance.api.canRedo()).toBe(true)
    }
    expect(requested).toEqual(["one", "one", "one"])
    cancel = false
    expect(instance.api.redo()).toBe(true)
    expect(instance.api.getValue()).toEqual(["one"])
    expect(instance.api.redo()).toBe(true)
    expect(instance.api.getValue()).toEqual(["two"])
    expect(instance.api.canRedo()).toBe(false)
  })

  test.each(["undo", "redo"] as const)(
    "records an edit after a canceled %s from the value that stayed visible",
    (direction) => {
      const instance = tokenInput({
        id: direction,
        defaultValue: ["zero"],
        onValueChange(_value, details) {
          if (details.reason === direction) {
            details.cancel()
          }
        },
      })
      instance.api.setValue(["one"])
      instance.api.setValue(["two"])
      if (direction === "redo") {
        instance.api.undo()
        instance.api.undo()
      }
      const before = instance.api.getValue()
      expect(instance.api[direction]()).toBe(false)
      instance.api.setValue(["replacement"])
      instance.setOptions({ id: direction })
      expect(instance.api.undo()).toBe(true)
      expect(instance.api.getValue()).toEqual(before)
    }
  )

  test.each([
    ["undo", false],
    ["undo", true],
    ["redo", false],
    ["redo", true],
  ] as const)(
    "keeps an edit made inside %s's callback when cancellation is %s",
    (direction, cancel) => {
      let replace = true
      const instance = tokenInput({
        id: `${direction}-${cancel}`,
        defaultValue: ["zero"],
        onValueChange(_value, details) {
          if (details.reason !== direction || !replace) {
            return
          }
          replace = false
          instance.api.setValue(["replacement"])
          if (cancel) {
            details.cancel()
          }
        },
      })
      instance.api.setValue(["one"])
      instance.api.setValue(["two"])
      if (direction === "redo") {
        instance.api.undo()
        instance.api.undo()
      }
      expect(instance.api[direction]()).toBe(!cancel)
      expect(instance.api.getValue()).toEqual(["replacement"])
      expect(instance.api.internal.latest()).toEqual(["replacement"])
      expect(instance.api.canRedo()).toBe(false)
      expect(instance.api.undo()).toBe(true)
      expect(instance.api.getValue()).toEqual(["one"])
    }
  )

  test("restores both positions when a callback also attempts a canceled undo", () => {
    let nested = false
    const instance = tokenInput({
      id: "nested-cancel",
      defaultValue: ["zero"],
      onValueChange(_value, details) {
        if (details.reason !== "undo") {
          return
        }
        if (!nested) {
          nested = true
          expect(instance.api.undo()).toBe(false)
          nested = false
        }
        details.cancel()
      },
    })
    instance.api.setValue(["one"])
    instance.api.setValue(["two"])
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(instance.api.undo()).toBe(false)
      expect(instance.api.getValue()).toEqual(["two"])
      expect(instance.api.internal.latest()).toEqual(["two"])
      expect(instance.api.canUndo()).toBe(true)
      expect(instance.api.canRedo()).toBe(false)
    }
  })

  test("keeps an accepted nested undo when its outer request is canceled", () => {
    let nested = true
    const instance = tokenInput({
      id: "nested-accept",
      defaultValue: ["zero"],
      onValueChange(_value, details) {
        if (details.reason === "undo" && nested) {
          nested = false
          expect(instance.api.undo()).toBe(true)
          details.cancel()
        }
      },
    })
    instance.api.setValue(["one"])
    instance.api.setValue(["two"])
    expect(instance.api.undo()).toBe(false)
    expect(instance.api.getValue()).toEqual(["zero"])
    expect(instance.api.internal.latest()).toEqual(["zero"])
    expect(instance.api.canUndo()).toBe(false)
    expect(instance.api.redo()).toBe(true)
    expect(instance.api.getValue()).toEqual(["one"])
    expect(instance.api.redo()).toBe(true)
    expect(instance.api.getValue()).toEqual(["two"])
  })

  test("allows an update that rewrites token metadata during undo", () => {
    const file = { id: "file", type: "file", value: "a.ts", label: "a.ts" }
    let update = true
    const instance = tokenInput({
      id: "metadata",
      defaultValue: ["zero", file],
      onValueChange(_value, details) {
        if (details.reason === "undo" && update) {
          update = false
          instance.api.updateToken("file", { label: "ready.ts" })
        }
      },
    })
    instance.api.setValue(["one", file])
    instance.api.setValue(["two", file])
    expect(instance.api.undo()).toBe(true)
    expect(instance.api.getValue()).toEqual([
      "one",
      { ...file, label: "ready.ts" },
    ])
    expect(instance.api.undo()).toBe(true)
    expect(instance.api.getValue()).toEqual([
      "zero",
      { ...file, label: "ready.ts" },
    ])
    expect(instance.api.canUndo()).toBe(false)
  })

  test("can traverse entries made identical by a token metadata update", () => {
    const file = { id: "file", type: "file", value: "a.ts", label: "a.ts" }
    const instance = tokenInput({ id: "same", defaultValue: [file] })
    instance.api.setValue([{ ...file, label: "b.ts" }])
    instance.api.updateToken("file", { label: "ready.ts" })
    expect(instance.api.undo()).toBe(false)
    expect(instance.api.canUndo()).toBe(false)
    expect(instance.api.canRedo()).toBe(true)
    expect(instance.api.redo()).toBe(false)
    expect(instance.api.canRedo()).toBe(false)
    expect(instance.api.getValue()).toEqual([{ ...file, label: "ready.ts" }])
  })

  test("a same-value nested undo does not consume a canceled outer request", () => {
    const file = { id: "file", type: "file", value: "a.ts", label: "a.ts" }
    const instance = tokenInput({
      id: "same-nested",
      defaultValue: [file],
      onValueChange(_value, details) {
        if (details.reason === "undo") {
          expect(instance.api.undo()).toBe(false)
          details.cancel()
        }
      },
    })
    instance.api.setValue([{ ...file, label: "b.ts" }])
    instance.api.setValue(["two", file])
    instance.api.updateToken("file", { label: "ready.ts" })
    expect(instance.api.undo()).toBe(false)
    expect(instance.api.getValue()).toEqual([
      "two",
      { ...file, label: "ready.ts" },
    ])
    expect(instance.api.canUndo()).toBe(true)
    expect(instance.api.canRedo()).toBe(false)
  })
})
