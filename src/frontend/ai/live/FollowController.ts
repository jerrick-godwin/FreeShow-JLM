import type { FollowSession, LiveDocument, LivePosition, TimedTranscriptSegment } from "../../../types/ai/Live"
import { LiveIndex } from "./matching"

export interface FollowAdapter {
    allowed(): boolean
    publish(document: LiveDocument, position: LivePosition, session: FollowSession, isCurrent: () => boolean): Promise<void>
    changed(session: FollowSession | null): void
    error(message: string): void
}
export class FollowController {
    session: FollowSession | null = null
    private document: LiveDocument | null = null
    private index = new LiveIndex()
    private generation = 0
    private seen = new Set<string>()
    private pending: { position: string; count: number } | null = null
    private lastPosition = ""
    constructor(private adapter: FollowAdapter) {}
    async start(document: LiveDocument, positionId: string, outputIds: string[]) {
        this.stop()
        if (!outputIds.length || !this.adapter.allowed()) return
        const position = document.positions.find((entry) => entry.id === positionId)
        if (!position) return
        this.document = structuredClone(document)
        this.index = new LiveIndex()
        this.index.add(this.document)
        this.session = { id: `follow-${Date.now()}-${++this.generation}`, state: "following", documentId: document.id, kind: document.kind, label: document.label, positionId, outputIds: [...new Set(outputIds)] }
        this.adapter.changed({ ...this.session })
        await this.commit(position)
    }
    pause(reason = "Paused by operator") {
        if (!this.session || this.session.state === "stopped") return
        this.generation++
        this.pending = null
        this.lastPosition = ""
        this.session = { ...this.session, state: "paused", reason }
        this.adapter.changed({ ...this.session })
    }
    resume() {
        if (!this.session || !this.adapter.allowed()) return
        this.generation++
        this.pending = null
        this.session = { ...this.session, state: "following", reason: undefined }
        this.adapter.changed({ ...this.session })
    }
    stop() {
        this.generation++
        this.session = null
        this.document = null
        this.pending = null
        this.seen.clear()
        this.lastPosition = ""
        this.adapter.changed(null)
    }
    async ingest(segment: TimedTranscriptSegment, referencePositionId?: string) {
        if (!segment.final || segment.music || !segment.text.trim() || !this.document || this.session?.state !== "following") return
        if (!this.adapter.allowed()) {
            this.pause("Listening or output is unavailable")
            return
        }
        const key = `${segment.sessionId}:${segment.id}`
        if (this.seen.has(key)) return
        this.seen.add(key)
        if (this.seen.size > 500) this.seen.delete(this.seen.values().next().value!)
        if (referencePositionId) {
            const position = this.document.positions.find((position) => position.id === referencePositionId)
            if (position) await this.commit(position)
            return
        }
        const matches = this.index.match(segment.text, this.document.id)
        if (!matches.length) {
            this.pending = null
            return
        }
        const current = this.document.positions.find((position) => position.id === this.session!.positionId)!
        const bestScore = matches[0].score
        const tied = matches.filter((match) => bestScore - match.score < 0.035)
        // Identical repeated choruses look the same on screen. Hold rather than guessing a jump.
        if (tied.some((match) => match.position.id === current.id)) {
            this.pending = null
            const match = tied.find((entry) => entry.position.id === current.id)!
            if (this.lastPosition !== current.id && match.score >= 0.9 && match.words >= 4) await this.commit(current)
            return
        }
        const best = tied.sort((a, b) => {
            const distance = (position: LivePosition) => (position.index > current.index ? position.index - current.index : 100 + current.index - position.index)
            return distance(a.position) - distance(b.position)
        })[0]
        const adjacent = best.position.index === current.index + 1
        const repetitions = this.pending?.position === best.position.id ? this.pending.count + 1 : 1
        this.pending = { position: best.position.id, count: repetitions }
        if ((adjacent && best.score >= 0.9 && best.words >= 4) || repetitions >= 2) {
            this.pending = null
            await this.commit(best.position)
        }
    }
    private async commit(position: LivePosition) {
        const session = this.session
        const document = this.document
        if (!session || !document || session.state !== "following" || this.lastPosition === position.id) return
        const generation = ++this.generation
        const isCurrent = () => generation === this.generation && this.session?.id === session.id && this.session.state === "following" && this.adapter.allowed()
        try {
            await this.adapter.publish(document, position, session, isCurrent)
            if (!isCurrent()) return
            this.lastPosition = position.id
            this.session = { ...session, positionId: position.id }
            this.adapter.changed({ ...this.session })
        } catch (error) {
            if (generation !== this.generation) return
            this.pause("Presentation could not be updated")
            this.adapter.error(error instanceof Error ? error.message : String(error))
        }
    }
}
