import {
  checkEvent,
  checkPrevented,
  dev,
  emit,
  expectControlled,
  forgetControlled,
  heardControlled,
} from "#dev"
import {
  createDetails,
  resolveSource,
  withSource,
  type ChangeSource,
} from "./details"
import { callbackName } from "./option-names"
import type {
  PrimitiveContext,
  PrimitiveOptions,
  ReasonFor,
} from "./primitive-types"
import { requestedChanges, sameSlotState, sameValue } from "./store"
import { watchers } from "./watchers"

type InputSource = (reason: string, event?: Event) => ChangeSource

type LogContext = { id: string; label: string; options: () => unknown }

function debug(
  context: LogContext,
  key: string,
  value: unknown,
  reason: string,
  source: ChangeSource
) {
  if (dev && (context.options() as PrimitiveOptions).debug) {
    console.debug(
      `[ui-sdk] ${context.label}#${context.id} ${key}: ${String(value)} (${reason}, ${source})`
    )
  }
}

// `createChange` (in `input-source.ts`) with its source given, for a component
// of ours whose changes no input causes, so it doesn't bundle input tracking.
function changeFrom<Options, State extends object>(
  context: PrimitiveContext<Options, State, any>,
  source: InputSource
) {
  const { store, options } = context
  const requested = requestedChanges(store)
  // Changes asked of each key, so one asked from inside `on<Key>Change`, like
  // a clamp, stands over the change that called it.
  const asked = new Map<string, number>()
  // The value each key is changing to while its callback runs. Asking for that
  // same value from inside, like a view that renders it back, is the same
  // change: it does nothing itself, so the outer change commits or cancels it.
  const changing = new Map<string, unknown>()

  // A controlled key's next options report the source of the change that asked for them.
  context.onOptions((next, synced) => {
    if (dev) {
      heardControlled(requested, next as object)
    }
    if (!synced) {
      return
    }
    let source: ChangeSource | undefined
    for (const [key, entry] of requested) {
      if (!(key in synced)) {
        continue
      }
      const value = (synced as Record<string, unknown>)[key]
      if (sameSlotState(value, entry.value)) {
        if (entry.status === "pending") {
          source = entry.source
        }
        entry.status = "committed"
        entry.previous = undefined
      } else if (
        entry.status === "pending" &&
        sameSlotState(value, entry.previous)
      ) {
        continue
      } else {
        entry.status = "discarded"
        requested.delete(key)
      }
    }
    return source
  })
  context.onDestroy(() => {
    for (const entry of requested.values()) {
      entry.status = "discarded"
    }
    requested.clear()
    if (dev) {
      forgetControlled(requested)
    }
  })

  return <Key extends keyof State & string>(
    key: Key,
    value: State[Key],
    details: {
      reason: ReasonFor<Options, Key>
      event?: Event
      source?: ChangeSource
      [extra: string]: unknown
    }
  ) => {
    if (changing.has(key) && sameValue(changing.get(key), value)) {
      return false
    }
    const ask = (asked.get(key) ?? 0) + 1
    asked.set(key, ask)
    const previous = store.get()[key]
    if (sameValue(previous, value)) {
      return false
    }
    const { reason, event } = details
    const callbackDetails = createDetails(
      details,
      details.source ?? source(reason, event)
    )
    if (dev) {
      checkEvent(reason, event, { component: context.label, id: context.id })
    }
    debug(context, key, value, reason, callbackDetails.source)
    const current = options() as Record<string, unknown>
    const isControlled = current[key] !== undefined
    const outer = changing.has(key)
    const outerValue = changing.get(key)
    changing.set(key, value)
    try {
      withSource(callbackDetails.source, () => {
        const name = callbackName(key, "Change")
        const callback = current[name]
        if (typeof callback === "function") {
          const prevented = dev && !!event?.defaultPrevented
          callback(value, callbackDetails)
          if (dev) {
            checkPrevented(name, prevented, callbackDetails, {
              component: context.label,
              id: context.id,
            })
          }
        }
        const askedInside = asked.get(key) !== ask
        if (!callbackDetails.canceled && !isControlled && !askedInside) {
          store.set({ [key]: value } as unknown as Partial<State>)
        }
      })
    } finally {
      if (outer) {
        changing.set(key, outerValue)
      } else {
        changing.delete(key)
      }
    }
    if (dev) {
      emit({
        type: "change",
        component: context.label,
        id: context.id,
        key,
        value,
        reason,
        source: callbackDetails.source,
        canceled: callbackDetails.canceled,
        controlled: isControlled,
      })
    }
    if (callbackDetails.canceled) {
      return false
    }
    watchers.change?.(context.id, key, value, callbackDetails, previous)
    if (isControlled && asked.get(key) === ask) {
      const superseded = requested.get(key)
      if (superseded) {
        superseded.status = "discarded"
      }
      const committed = sameSlotState(store.get()[key], value)
      requested.set(key, {
        value,
        previous: committed ? undefined : previous,
        source: callbackDetails.source,
        status: committed ? "committed" : "pending",
      })
      if (dev) {
        expectControlled(
          requested,
          {
            component: context.label,
            id: context.id,
            key,
            value,
            reason,
            source: callbackDetails.source,
          },
          () => (options() as Record<string, unknown>)[key]
        )
      }
    }
    return true
  }
}

/**
 * Records a state write that isn't a change anyone can refuse, like an action
 * going pending: the devtools see it, and `debug` logs it. Pass `source` when
 * an event explains it.
 */
function log(
  context: LogContext,
  key: string,
  value: unknown,
  details: { reason: string; source?: ChangeSource }
) {
  const source = details.source ?? resolveSource(details.reason)
  if (dev) {
    emit({
      type: "change",
      component: context.label,
      id: context.id,
      key,
      value,
      reason: details.reason,
      source,
      canceled: false,
      controlled: false,
    })
  }
  debug(context, key, value, details.reason, source)
}

export { changeFrom, log }
