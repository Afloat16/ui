// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest"
import { command, type CommandOptions } from "../src/components/command/command"
import { autocomplete } from "../src/components/autocomplete/autocomplete"
import { combobox } from "../src/components/combobox/combobox"
import { attrs, bind, partState } from "../src/foundation/kernel/part"

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  document.body.replaceChildren()
})

function render(filter: CommandOptions["filter"], text = "cap apple") {
  const options = {
    id: "text-filter",
    items: [{ value: "entry", label: text, keywords: ["apple"] }],
    query: "ap",
    filter,
    announcement: () => null,
  }
  const instance = command(options)
  const part = instance.part("item-text", { id: "text", text, write: true })
  const element = document.createElement("span")
  document.body.append(element)
  cleanups.push(bind(part, element), () => instance.destroy())
  return {
    instance,
    part,
    element,
    options,
    filter: (filter: CommandOptions["filter"]) =>
      instance.setOptions({ ...options, filter }),
  }
}

describe("item text follows the filter mode", () => {
  test("contains-to-fuzzy moves the mark to the preferred word start", () => {
    const { part, element, filter } = render("contains")
    expect(element.innerHTML).toBe("c<mark>ap</mark> apple")
    filter("fuzzy")
    expect(element.innerHTML).toBe("cap <mark>ap</mark>ple")
    expect(partState(part).segments).toEqual([
      { text: "cap ", match: false },
      { text: "ap", match: true },
      { text: "ple", match: false },
    ])
  })

  test("fuzzy-to-contains returns to the first occurrence", () => {
    const { part, element, filter } = render("fuzzy")
    expect(element.innerHTML).toBe("cap <mark>ap</mark>ple")
    filter("contains")
    expect(element.innerHTML).toBe("c<mark>ap</mark> apple")
    expect(partState(part).segments).toEqual([
      { text: "c", match: false },
      { text: "ap", match: true },
      { text: " apple", match: false },
    ])
  })

  test("startsWith removes a label's substring mark while its keyword keeps the item", () => {
    const { instance, part, element, filter } = render("contains", "cap")
    expect(element.innerHTML).toBe("c<mark>ap</mark>")
    filter("startsWith")
    expect(
      instance.api.internal.listbox.entries().map((entry) => entry.key)
    ).toEqual(["entry"])
    expect(element.innerHTML).toBe("cap")
    expect(partState(part)).toEqual({
      segments: [{ text: "cap", match: false }],
      matched: false,
    })
    expect(attrs(part)["data-matched"]).toBeUndefined()
  })

  test("contains adds a label mark when startsWith previously matched only its keyword", () => {
    const { part, element, filter } = render("startsWith", "cap")
    expect(element.innerHTML).toBe("cap")
    filter("contains")
    expect(element.innerHTML).toBe("c<mark>ap</mark>")
    expect(partState(part).matched).toBe(true)
    expect(attrs(part)["data-matched"]).toBe("")
  })

  test("repeated mode switches follow the latest mode without changing the query", () => {
    const { instance, element, filter } = render("contains")
    for (const mode of ["fuzzy", "contains", "fuzzy"] as const) {
      filter(mode)
      expect(instance.api.getQuery()).toBe("ap")
      expect(element.innerHTML).toBe(
        mode === "fuzzy" ? "cap <mark>ap</mark>ple" : "c<mark>ap</mark> apple"
      )
    }
  })

  test("an unchanged mode keeps the state and existing DOM nodes", () => {
    const { part, element, filter } = render("contains")
    const before = partState(part)
    const mark = element.querySelector("mark")
    filter("contains")
    expect(partState(part)).toBe(before)
    expect(element.querySelector("mark")).toBe(mark)
  })

  test("disabled and custom filters still leave the label unmarked", () => {
    const { part, element, filter } = render("contains")
    filter(false)
    expect(element.innerHTML).toBe("cap apple")
    expect(partState(part).matched).toBe(false)
    filter(() => true)
    expect(element.innerHTML).toBe("cap apple")
    filter("contains")
    expect(element.innerHTML).toBe("c<mark>ap</mark> apple")
  })

  test("an unrelated query still reuses an unchanged unmatched label state", () => {
    const { instance, part, element, options } = render("contains", "pear")
    const before = partState(part)
    instance.setOptions({ ...options, query: "zzz" })
    expect(partState(part)).toBe(before)
    expect(element.innerHTML).toBe("pear")
  })

  test("autocomplete marks follow repeated filter changes without another input", () => {
    const options = {
      id: "autocomplete-filter",
      items: [{ value: "entry", label: "cap apple" }],
      value: "ap",
      announcement: () => null,
    }
    const instance = autocomplete(options)
    const part = instance.part("item-text", {
      id: "text",
      text: "cap apple",
      write: true,
    })
    const element = document.createElement("span")
    document.body.append(element)
    cleanups.push(bind(part, element), () => instance.destroy())
    expect(element.innerHTML).toBe("c<mark>ap</mark> apple")
    instance.setOptions({ ...options, filter: "fuzzy" })
    expect(element.innerHTML).toBe("cap <mark>ap</mark>ple")
    instance.setOptions({ ...options, filter: "contains" })
    expect(element.innerHTML).toBe("c<mark>ap</mark> apple")
  })

  test("combobox marks follow repeated filter changes for a keyword-matched item", () => {
    const options = {
      id: "combobox-filter",
      items: [{ value: "entry", label: "cap", keywords: ["apple"] }],
      multiple: true,
      query: "ap",
      announcement: () => null,
    }
    const instance = combobox(options)
    const part = instance.part("item-text", {
      id: "text",
      text: "cap",
      write: true,
    })
    const element = document.createElement("span")
    document.body.append(element)
    cleanups.push(bind(part, element), () => instance.destroy())
    expect(element.innerHTML).toBe("c<mark>ap</mark>")
    instance.setOptions({ ...options, filter: "startsWith" })
    expect(element.innerHTML).toBe("cap")
    instance.setOptions({ ...options, filter: "contains" })
    expect(element.innerHTML).toBe("c<mark>ap</mark>")
    expect(instance.api.getQuery()).toBe("ap")
  })

  test("a framework preview reads the arriving mode without changing the held marks", () => {
    const { instance, part, element, options } = render("contains")
    const next = instance.preview({ ...options, filter: "fuzzy" })
    expect(next).toBeDefined()
    expect(instance.view(next!, () => partState(part).segments)).toEqual([
      { text: "cap ", match: false },
      { text: "ap", match: true },
      { text: "ple", match: false },
    ])
    expect(partState(part).segments).toEqual([
      { text: "c", match: false },
      { text: "ap", match: true },
      { text: " apple", match: false },
    ])
    expect(element.innerHTML).toBe("c<mark>ap</mark> apple")
  })

  test("all three components keep their default matching modes", () => {
    const instances = [
      command({ id: "command-default" }),
      autocomplete({ id: "autocomplete-default" }),
      combobox({ id: "combobox-default" }),
    ]
    cleanups.push(...instances.map((instance) => () => instance.destroy()))
    expect(
      instances.map((instance) => instance.api.internal.matchMode())
    ).toEqual(["fuzzy", "contains", "contains"])
  })
})
