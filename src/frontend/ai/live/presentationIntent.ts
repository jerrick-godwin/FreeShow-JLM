export interface PresentationIntent {
    type: string
    clearing?: boolean
    outputIds: string[]
    origin: "manual" | "live-follow" | "live-caption"
}
const listeners = new Set<(intent: PresentationIntent) => void>()
export function onPresentationIntent(listener: (intent: PresentationIntent) => void) {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}
export function presentationIntent(intent: PresentationIntent) {
    listeners.forEach((listener) => listener(intent))
}
