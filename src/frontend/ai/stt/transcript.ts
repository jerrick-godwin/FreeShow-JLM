import { get } from "svelte/store"
import { ai, sttTranscript } from "../../stores"
import { newToast } from "../../utils/common"
import { LiveAssistance } from "../live/LiveAssistance"

type TranscriptPart = {
    sessionId?: string
    id?: string
    revision?: number
    text: string
    interim?: boolean

    startMs?: number
    endMs?: number

    language?: string
    music?: boolean
    utteranceEnd?: boolean
    confidence?: number
    glue?: boolean
}

export class Transcript {
    private static sessionId = ""
    private static revisions = new Map<string, number>()
    static begin(id: string) {
        if (id === this.sessionId) return
        this.sessionId = id
        this.revisions.clear()
        sttTranscript.set({ finalized: "", unprocessed: "" })
        LiveAssistance.beginTranscript(id)
    }
    static stop() {
        this.sessionId = ""
        this.revisions.clear()
        sttTranscript.update((text) => ({ ...text, unprocessed: "" }))
        LiveAssistance.endTranscript()
    }
    private static readonly MAX_TRANSCRIPT_CHARS = 10000

    static push(part: TranscriptPart) {
        if (!get(ai).enabled || !part.sessionId || part.sessionId !== this.sessionId || !part.id) return
        const revision = part.revision || 0
        if (revision <= (this.revisions.get(part.id) ?? -1)) return
        this.revisions.set(part.id, revision)
        if (this.revisions.size > 500) this.revisions.delete(this.revisions.keys().next().value!)
        LiveAssistance.ingest({ sessionId: part.sessionId, id: part.id, revision, text: part.text, final: !part.interim, startMs: part.startMs || 0, endMs: part.endMs || part.startMs || 0, language: part.language, confidence: part.confidence, music: part.music }).catch(console.error)

        const textPart = part.text.trim()

        sttTranscript.update((t) => {
            if (part.interim) return { ...t, unprocessed: textPart }

            const separator = t.finalized && !part.glue ? " " : ""
            const finalized = (t.finalized + separator + textPart).slice(-this.MAX_TRANSCRIPT_CHARS)

            return { finalized, unprocessed: "" }
        })
    }

    static copy() {
        const text = get(sttTranscript).finalized
        if (!text) return

        navigator.clipboard.writeText(text)
        newToast("actions.copied")
    }
}
