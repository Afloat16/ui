// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  readEntries,
  type DroppedEntry,
} from "../src/components/file-input/file-drop"
import { fileInput } from "../src/components/file-input/file-input"
import { relativePath } from "../src/foundation/forms/files"
import { attrs, bind } from "../src/foundation/kernel/part"

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  document.body.replaceChildren()
})

function file(path: string): DroppedEntry {
  return {
    isFile: true,
    isDirectory: false,
    fullPath: path,
    file: (resolve) => resolve(new File(["content"], path.split("/").pop()!)),
  }
}

function folder(
  path: string,
  children: DroppedEntry[],
  batch = 100
): DroppedEntry {
  return {
    isFile: false,
    isDirectory: true,
    fullPath: path,
    createReader() {
      let index = 0
      return {
        readEntries(resolve) {
          resolve(children.slice(index, (index += batch)))
        },
      }
    },
  }
}

function unreadable(
  path: string,
  failure: "file" | "reader" | "createReader"
): DroppedEntry {
  if (failure === "file") {
    return {
      ...file(path),
      file: (_, reject) => queueMicrotask(() => reject(new Error("gone"))),
    }
  }
  return {
    ...folder(path, []),
    createReader() {
      if (failure === "createReader") {
        throw new Error("gone")
      }
      return {
        readEntries: (_, reject) =>
          queueMicrotask(() => reject(new Error("gone"))),
      }
    },
  }
}

describe("unreadable children of dropped folders", () => {
  test.each(["file", "reader", "createReader"] as const)(
    "continues with siblings and later batches after a child %s fails",
    async (failure) => {
      const files = await readEntries([
        folder(
          "/docs",
          [
            file("/docs/before.txt"),
            unreadable("/docs/missing", failure),
            file("/docs/same-batch.txt"),
            file("/docs/next-batch.txt"),
          ],
          3
        ),
        file("/outside.txt"),
      ])
      expect(files.map(relativePath)).toEqual([
        "docs/before.txt",
        "docs/same-batch.txt",
        "docs/next-batch.txt",
        "outside.txt",
      ])
    }
  )

  test("keeps a subfolder's completed batch and continues its parent's siblings", async () => {
    const partial = folder("/docs/partial", [])
    partial.createReader = () => {
      let reads = 0
      return {
        readEntries(resolve, reject) {
          if (reads++ === 0) {
            resolve([file("/docs/partial/read.txt")])
          } else {
            reject(new Error("directory changed"))
          }
        },
      }
    }
    const files = await readEntries([
      folder("/docs", [partial, file("/docs/after.txt")]),
    ])
    expect(files.map(relativePath)).toEqual([
      "docs/partial/read.txt",
      "docs/after.txt",
    ])
  })

  test("failed entries and system files do not use the successful file limit", async () => {
    const files = await readEntries(
      [
        folder(
          "/docs",
          [
            unreadable("/docs/missing", "file"),
            file("/docs/.DS_Store"),
            file("/docs/one.txt"),
            file("/docs/two.txt"),
            file("/docs/three.txt"),
          ],
          2
        ),
      ],
      2
    )
    expect(files.map(relativePath)).toEqual(["docs/one.txt", "docs/two.txt"])
  })

  test("retains the depth-first order of fully readable folders", async () => {
    const files = await readEntries([
      folder(
        "/docs",
        [
          file("/docs/one.txt"),
          folder("/docs/sub", [file("/docs/sub/two.txt")]),
          file("/docs/three.txt"),
        ],
        1
      ),
    ])
    expect(files.map(relativePath)).toEqual([
      "docs/one.txt",
      "docs/sub/two.txt",
      "docs/three.txt",
    ])
  })

  test("continues past unreadable top-level entries", async () => {
    const files = await readEntries([
      unreadable("/missing", "reader"),
      file("/readable.txt"),
    ])
    expect(files.map(relativePath)).toEqual(["readable.txt"])
  })

  test("a bound drop zone receives and validates readable files after a nested failure", async () => {
    const onValueChange = vi.fn()
    const onReject = vi.fn()
    const instance = fileInput({
      id: "folder-drop",
      multiple: true,
      accept: ".txt",
      announcement: () => null,
      onValueChange,
      onReject,
    })
    const zone = document.createElement("div")
    document.body.append(zone)
    const part = instance.part("dropzone", { id: "zone" })
    for (const [name, value] of Object.entries(attrs(part))) {
      if (value !== undefined) {
        zone.setAttribute(name, value)
      }
    }
    cleanups.push(bind(part, zone), () => instance.destroy())
    const entry = folder("/docs", [
      file("/docs/before.txt"),
      unreadable("/docs/gone", "file"),
      file("/docs/after.txt"),
      file("/docs/rejected.png"),
    ])
    const event = new Event("drop", { bubbles: true, cancelable: true })
    Object.defineProperty(event, "dataTransfer", {
      value: {
        types: ["Files"],
        items: [{ kind: "file", type: "", webkitGetAsEntry: () => entry }],
        files: [],
      },
    })
    zone.dispatchEvent(event)
    await vi.waitFor(() => expect(onValueChange).toHaveBeenCalledOnce())
    expect(event.defaultPrevented).toBe(true)
    expect(instance.api.getValue().map(relativePath)).toEqual([
      "docs/before.txt",
      "docs/after.txt",
    ])
    expect(onValueChange.mock.calls[0][1]).toMatchObject({
      reason: "drop",
      event,
      removed: [],
    })
    expect(onReject.mock.calls[0][0]).toMatchObject([
      { file: { name: "rejected.png" }, reasons: ["file-type"] },
    ])
  })
})
