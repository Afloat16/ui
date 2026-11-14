import { expect, test } from "vitest"
import {
  createTreeCollection,
  treeDataNodes,
  visibleTreeRows,
  type TreeItemData,
} from "../src/foundation/lists/tree-collection"

const depth = 20_000
const keys = Array.from({ length: depth }, (_, index) => `node-${index}`)
const nodes = keys.map((key, index) => ({
  key,
  parent: index ? keys[index - 1] : null,
}))

function nestedItems() {
  const items: TreeItemData[] = []
  let children = items
  for (const key of keys) {
    const item: TreeItemData = { value: key, label: key, children: [] }
    children.push(item)
    children = item.children!
  }
  return items
}

test("lists every key in a deep flat collection without exhausting the stack", () => {
  const tree = createTreeCollection(nodes)
  expect(tree.keys()).toEqual(keys)
})

test("lists descendants of a deep collection in parent-before-child order", () => {
  const tree = createTreeCollection(nodes)
  expect(tree.descendants(keys[0])).toEqual(keys.slice(1))
  expect(tree.descendants(keys.at(-1)!)).toEqual([])
})

test("expands deep flat collections and retains visible snapshot caching", () => {
  const tree = createTreeCollection(nodes)
  const visible = tree.visible(keys)
  expect(visible).toEqual(keys)
  expect(tree.visible([...keys])).toBe(visible)
  expect(tree.visible([keys[0]])).toEqual(keys.slice(0, 2))
})

test("flattens deeply nested item data while retaining original item references", () => {
  const items = nestedItems()
  const actual = treeDataNodes(items)
  expect(actual.map(({ key, parent }) => ({ key, parent }))).toEqual(nodes)
  let children = items
  for (const node of actual) {
    expect(node.item).toBe(children[0])
    expect(node.branch).toBe(true)
    children = children[0].children!
  }
})

test("produces flat virtualized rows from deeply nested expanded data", () => {
  const items = nestedItems()
  const rows = visibleTreeRows(items, keys)
  expect(rows.map((row) => row.item.value)).toEqual(keys)
  expect(rows.map((row) => row.parent)).toEqual(
    nodes.map((node) => node.parent)
  )
  expect(rows.map((row) => row.index)).toEqual(keys.map((_, index) => index))
  expect(rows.map((row) => row.level)).toEqual(
    keys.map((_, index) => index + 1)
  )
  expect(rows[0].item).toBe(items[0])
  expect(rows.at(-1)!.item.children).toEqual([])
})

test("keeps sibling order, empty branches, and collapsed descendants unchanged", () => {
  const leaf = { value: "leaf", label: "Leaf" }
  const nested = { value: "nested", label: "Nested", children: [leaf] }
  const empty = { value: "empty", label: "Empty", children: [] }
  const branch = { value: "branch", label: "Branch", children: [nested, empty] }
  const sibling = { value: "sibling", label: "Sibling" }
  const items = [branch, sibling]
  const all = treeDataNodes(items)
  expect(all.map((node) => node.item)).toEqual([
    branch,
    nested,
    leaf,
    empty,
    sibling,
  ])
  expect(all.map((node) => node.branch)).toEqual([
    true,
    true,
    false,
    true,
    false,
  ])
  const tree = createTreeCollection(all)
  expect(tree.keys()).toEqual(["branch", "nested", "leaf", "empty", "sibling"])
  expect(tree.visible(["nested"])).toEqual(["branch", "sibling"])
  expect(
    visibleTreeRows(items, ["branch"]).map(({ item, parent, level, index }) => [
      item.value,
      parent,
      level,
      index,
    ])
  ).toEqual([
    ["branch", null, 1, 0],
    ["nested", "branch", 2, 1],
    ["empty", "branch", 2, 2],
    ["sibling", null, 1, 3],
  ])
  expect(items).toEqual([branch, sibling])
  expect(branch.children).toEqual([nested, empty])
  expect(treeDataNodes([])).toEqual([])
  expect(visibleTreeRows([], ["missing"])).toEqual([])
  expect(createTreeCollection([]).keys()).toEqual([])
})
