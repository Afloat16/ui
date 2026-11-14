import { describe, expect, test } from "vitest"
import {
  toggleTreeChecked,
  treeCheckedStates,
} from "../src/foundation/lists/tree-checked"
import {
  createTreeCollection,
  type TreeCollectionNode,
} from "../src/foundation/lists/tree-collection"

function nested(depth: number) {
  const nodes: TreeCollectionNode[] = []
  for (let index = 0; index < depth; index++) {
    nodes.push(
      { key: `branch-${index}`, parent: index ? `branch-${index - 1}` : null },
      { key: `leaf-${index}`, parent: `branch-${index}` }
    )
  }
  const tree = createTreeCollection(nodes)
  let reads = 0
  return {
    tree: {
      ...tree,
      children(key: string | null) {
        reads++
        return tree.children(key)
      },
    },
    reads: () => reads,
  }
}

test("reading a branch-strategy value visits overlapping checked subtrees once", () => {
  const { tree, reads } = nested(600)
  const value = tree.keys()
  const checked = treeCheckedStates(tree, value, "branch")
  expect(value.every((key) => checked(key) === true)).toBe(true)
  expect(checked("missing")).toBe(false)
  expect(reads()).toBeLessThan(tree.size * 6)
})

test("toggling a leaf does not expand every checked ancestor again", () => {
  const { tree, reads } = nested(600)
  const value = tree.keys()
  const result = toggleTreeChecked(tree, value, "leaf-599", {
    strategy: "branch",
  })
  expect(result).toEqual(
    Array.from({ length: 599 }, (_, index) => `leaf-${index}`)
  )
  expect(value).toEqual(tree.keys())
  expect(reads()).toBeLessThan(tree.size * 8)
})

const tree = createTreeCollection([
  { key: "root", parent: null },
  { key: "group", parent: "root" },
  { key: "first", parent: "group" },
  { key: "second", parent: "group" },
  { key: "third", parent: "root" },
  { key: "lazy", parent: null, branch: true },
])

describe("overlapping selection compatibility", () => {
  test.each([
    ["group", "first", "group", "lazy", "unknown"],
    ["unknown", "lazy", "first", "group", "group"],
  ])("keeps mixed and unloaded states for value order %j", (...value) => {
    const checked = treeCheckedStates(tree, value)
    expect(tree.keys().map((key) => checked(key))).toEqual([
      "indeterminate",
      true,
      true,
      true,
      false,
      true,
    ])
    expect(checked("unknown")).toBe(false)
  })

  test.each([
    { strategy: "leaf" as const, expected: ["first", "third", "lazy"] },
    { strategy: "branch" as const, expected: ["first", "third", "lazy"] },
    { strategy: "trunk" as const, expected: ["first", "third", "lazy"] },
  ])(
    "preserves refused leaves and tree order with $strategy",
    ({ strategy, expected }) => {
      expect(
        toggleTreeChecked(tree, ["lazy", "group", "root", "first"], "group", {
          strategy,
          checkable: (key) => key !== "first",
        })
      ).toEqual(expected)
    }
  )

  test("independent values do not expand branches or discard unknown keys", () => {
    const checked = treeCheckedStates(tree, ["root", "unknown"], "independent")
    expect(checked("root")).toBe(true)
    expect(checked("first")).toBe(false)
    expect(checked("unknown")).toBe(true)
    expect(
      toggleTreeChecked(tree, ["root", "unknown"], "first", {
        strategy: "independent",
      })
    ).toEqual(["root", "unknown", "first"])
  })

  test("no checked value leaves every node unchecked", () => {
    const checked = treeCheckedStates(tree, [])
    expect(tree.keys().map((key) => checked(key))).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ])
  })
})
