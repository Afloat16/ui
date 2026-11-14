// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { createApp, h, nextTick, ref, type App } from "vue"
import type { ChangeDetails } from "@ui-sdk/core"
import { Checkbox, type CheckedState } from "../src/checkbox"
import {
  NumberInput,
  type NumberInputValueChangeReason,
} from "../src/number-input"
import { createAgent } from "../src/agent"
import { stageChanges } from "../src/history"
import {
  createImageCropperController,
  ImageCropper,
  ImageCropperImage,
  type ImageCrop,
} from "../src/image-cropper"

const apps: App[] = []
afterEach(() => {
  apps
    .splice(0)
    .reverse()
    .forEach((app) => app.unmount())
  document.body.replaceChildren()
})

test.each([false, true])(
  "a Vue controlled object crop remains reversible with deferred delivery %s",
  async (defer) => {
    const initial = { x: 10, y: 10, width: 100, height: 100 }
    const crop = ref<ImageCrop>(initial)
    const controller = createImageCropperController()
    let delayed = defer
    let waiting: ImageCrop | undefined
    const app = createApp(() =>
      h(
        ImageCropper,
        {
          "aria-label": "Photo",
          src: "photo.png",
          crop: crop.value,
          controller,
          "onUpdate:crop": (next: ImageCrop) => {
            if (delayed) {
              waiting = next
            } else {
              crop.value = next
            }
          },
        },
        () => h(ImageCropperImage, { alt: "Photo" })
      )
    )
    apps.push(app)
    const root = document.body.appendChild(document.createElement("div"))
    app.mount(root)
    const image = root.querySelector("img")!
    Object.defineProperties(image, {
      naturalWidth: { value: 400 },
      naturalHeight: { value: 300 },
    })
    image.dispatchEvent(new Event("load"))
    const staged = await stageChanges(createAgent(), [
      { ref: "Photo", key: "crop", value: { ...initial, x: 20 } },
    ])
    if (defer) {
      expect(staged.applied).toEqual([])
      expect(waiting).toMatchObject({ ...initial, x: 20 })
      crop.value = waiting!
      await nextTick()
    }
    expect(controller.getCrop()).toMatchObject({ ...initial, x: 20 })
    expect.soft(staged.applied).toHaveLength(1)
    delayed = false
    expect(await staged.revert()).toEqual([])
    expect(controller.getCrop()).toMatchObject(initial)
  }
)

test.each([false, true])(
  "an earlier control reverts after the later control with deferred delivery %s",
  async (defer) => {
    const value = ref<number | null>(20)
    const checked = ref<CheckedState>(false)
    let waiting: number | null = null
    const attempts: string[] = []
    const app = createApp(() => [
      h(NumberInput, {
        "aria-label": "Quantity",
        modelValue: value.value,
        onValueChange: (
          next: number | null,
          details: ChangeDetails<NumberInputValueChangeReason>
        ) => {
          attempts.push(`quantity:${next}`)
          if (next === 20 && checked.value) {
            details.cancel()
          }
        },
        "onUpdate:modelValue": (next: number | null) => {
          if (defer && next === 30 && !checked.value) {
            waiting = next
          } else {
            value.value = next
          }
        },
      }),
      h(Checkbox, {
        "aria-label": "Digest",
        modelValue: checked.value,
        "onUpdate:modelValue": (next: CheckedState) => {
          attempts.push(`digest:${next}`)
          checked.value = next
          if (defer && next === true) {
            value.value = waiting
          }
        },
      }),
    ])
    apps.push(app)
    app.mount(document.body.appendChild(document.createElement("div")))
    const staged = await stageChanges(createAgent(), [
      { ref: "Quantity", value: 30 },
      { ref: "Digest", key: "checked", value: true },
    ])
    expect(value.value).toBe(30)
    expect(checked.value).toBe(true)
    expect(staged.applied).toHaveLength(2)
    attempts.length = 0
    const failed = await staged.revert()
    expect.soft(attempts).toEqual(["digest:false", "quantity:20"])
    expect.soft(failed).toEqual([])
    expect.soft(value.value).toBe(20)
    expect(checked.value).toBe(false)
  }
)
