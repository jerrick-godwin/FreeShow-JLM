import { get, writable } from "svelte/store"
import type { Bible } from "../../../types/Bible"
import type { BibleContent } from "../../../types/Scripture"
import type { CaptionCue, FollowSession, LiveCandidate, LiveDocument, LivePosition, TimedTranscriptSegment } from "../../../types/ai/Live"
import { ai, aiSttStatus, drawerTabsData, outLocked, outputs, scriptures, scripturesCache, shows, showsCache } from "../../stores"
import { loadShows } from "../../components/helpers/setShow"
import { requestMain } from "../../IPC/main"
import { Main } from "../../../types/IPC/Main"
import type { Show } from "../../../types/Show"
import { getScriptureSlidesNew, loadJsonBible } from "../../components/drawer/bible/scripture"
import { setOutput } from "../../components/helpers/output"
import { FollowController } from "./FollowController"
import { LiveIndex, lyricSlideText, songPositions, spokenReference } from "./matching"
import { onPresentationIntent } from "./presentationIntent"

export const liveCandidates = writable<LiveCandidate[]>([])
export const followSession = writable<FollowSession | null>(null)
export const captionPreview = writable<CaptionCue | null>(null)
export const liveAssistanceMessage = writable("")
export const liveSearchText = writable("")

class Assistance {
    private index = new LiveIndex()
    private libraryRecords = new Map<string, { revision: string; show: Show }>()
    private bible: { id: string; data: Bible } | null = null
    private build: Promise<void> | null = null
    private dirty = true
    private initialized = false
    private transcriptSession = ""
    private epoch = 0
    private acceptedFingerprint = ""
    private contentValid = true
    private lastSlides = new Map<string, string>()
    private cueWords = ""
    private cueAt = 0
    private captionTimer: ReturnType<typeof setTimeout> | undefined
    private seen = new Map<string, number>()
    private controller = new FollowController({
        allowed: () => !!get(ai).enabled && get(ai).live?.enabled !== false && get(aiSttStatus).state === "listening" && !get(outLocked) && this.contentValid && this.targetOutputs().length > 0,
        publish: (document, position, session, isCurrent) => this.publish(document, position, session, isCurrent),
        changed: (session) => followSession.set(session),
        error: (message) => liveAssistanceMessage.set(message)
    })
    install() {
        if (this.initialized) return
        this.initialized = true
        onPresentationIntent((intent) => {
            if (intent.origin !== "manual") return
            if (intent.type === "slide") this.epoch++
            if (intent.type === "clear-all" || (intent.type === "slide" && intent.clearing)) {
                this.epoch++
                if (intent.type === "clear-all") this.stop()
                else this.controller.pause("Text cleared — resume when ready")
                this.disableCaptions()
                return
            }
            const session = this.controller.session
            if (session && intent.type === "slide" && intent.outputIds.some((id) => session.outputIds.includes(id))) this.controller.pause("Manual navigation — resume when ready")
        })
        shows.subscribe(() => {
            this.dirty = true
            this.checkContent()
        })
        showsCache.subscribe(() => {
            this.dirty = true
            this.checkContent()
        })
        scriptures.subscribe(() => {
            this.dirty = true
            this.checkContent()
        })
        scripturesCache.subscribe(() => {
            this.dirty = true
            this.checkContent()
        })
        drawerTabsData.subscribe(() => {
            this.dirty = true
        })
        ai.subscribe((settings) => {
            this.dirty = true
            if (!settings.enabled || settings.live?.enabled === false) {
                this.epoch++
                this.controller.pause("Live assistance is disabled")
                this.clearCaptions()
            } else if (!settings.live?.captions) this.clearCaptions()
        })
        outLocked.subscribe((locked) => {
            if (locked) {
                this.epoch++
                this.controller.pause("Output is locked")
                this.disableCaptions()
            }
        })
        aiSttStatus.subscribe((status) => {
            if (status.state !== "listening") {
                this.controller.pause(status.state === "error" ? "Recognition error — restart listening before resuming" : "Listening is stopped")
                this.clearCaptions()
                this.epoch++
            }
        })
        outputs.subscribe((list) => {
            const session = this.controller.session
            if (!session) return
            for (const id of session.outputIds) {
                const output = list[id]
                if (!output?.enabled || !output.active) {
                    this.controller.pause("A selected output is unavailable")
                    continue
                }
                const key = JSON.stringify(output.out?.slide || null)
                const previous = this.lastSlides.get(id)
                this.lastSlides.set(id, key)
                if (previous !== undefined && previous !== key && output.out?.slide?.followSessionId !== session.id) this.controller.pause("Presentation changed — resume when ready")
            }
        })
    }
    beginTranscript(id: string) {
        this.install()
        if (id === this.transcriptSession) return
        this.transcriptSession = id
        this.epoch++
        this.seen.clear()
        this.cueWords = ""
        liveCandidates.set([])
        this.clearCaptions()
        if (this.controller.session) this.controller.pause("Recognition restarted — resume when ready")
    }
    endTranscript() {
        this.transcriptSession = ""
        this.epoch++
        this.controller.pause("Listening is stopped")
        this.clearCaptions()
    }
    private targetOutputs(captions = false): string[] {
        const list = get(outputs)
        const configured = captions ? get(ai).live?.captionOutputIds : this.controller.session?.outputIds || get(ai).live?.outputIds
        return (configured?.length ? configured : Object.keys(list)).filter((id) => list[id]?.enabled && list[id].active && !list[id].stageOutput)
    }
    private fingerprint(document: LiveDocument): string {
        if (document.kind === "song") {
            const id = document.id.slice(5)
            const show = get(showsCache)[id]
            if (!get(shows)[id] || !show || !show.layouts[document.layoutId || ""]) return "missing"
            return JSON.stringify([show.name, document.layoutId, show.layouts[document.layoutId!].slides, Object.entries(show.slides).map(([key, slide]) => [key, lyricSlideText(slide)])])
        }
        const ref = document.positions[0]?.reference
        const bible = get(scripturesCache)[document.versionId || ""] || this.bible?.data
        if (!get(scriptures)[document.versionId || ""] || !ref) return "missing"
        return JSON.stringify(bible?.books.find((book) => book.number === ref.book)?.chapters.find((chapter) => chapter.number === ref.chapter))
    }
    private checkContent() {
        const session = this.controller.session
        if (!session) return
        const document = this.index.documents.get(session.documentId)
        if (document && this.acceptedFingerprint && this.fingerprint(document) !== this.acceptedFingerprint) {
            this.contentValid = false
            this.controller.pause("Accepted content changed — select it again")
        }
    }
    private async prepare() {
        if (this.build) {
            await this.build
            if (this.dirty) await this.prepare()
            return
        }
        if (!this.dirty) return
        this.dirty = false
        liveAssistanceMessage.set("Preparing local song and Bible search…")
        this.build = (async () => {
            const index = new LiveIndex()
            const ids = Object.keys(get(shows))
            const retained = new Set(ids)
            for (const id of this.libraryRecords.keys()) if (!retained.has(id)) this.libraryRecords.delete(id)
            for (let start = 0; start < ids.length; start += 50) {
                const batch = ids.slice(start, start + 50)
                const records = await Promise.all(
                    batch.map(async (id) => {
                        const cached = get(showsCache)[id]
                        if (cached) return cached
                        const metadata = get(shows)[id]
                        const revision = JSON.stringify([metadata?.name, metadata?.timestamps?.modified])
                        const previous = this.libraryRecords.get(id)
                        if (previous?.revision === revision) return previous.show
                        try {
                            const response = await requestMain(Main.SHOW, { id, name: metadata?.name })
                            let content = response?.content?.[1]
                            if (typeof content === "string") content = JSON.parse(content)?.[1]
                            if (!content) return undefined
                            const show = { ...content, name: metadata?.name || content.name } as Show
                            this.libraryRecords.set(id, { revision, show })
                            return show
                        } catch {
                            return undefined
                        }
                    })
                )
                for (const [offset, id] of batch.entries()) {
                    const show = records[offset]
                    if (!show || show.reference?.type || !show.layouts) continue
                    const layoutId = show.settings?.activeLayout || Object.keys(show.layouts)[0]
                    const positions = songPositions(show, layoutId)
                    if (positions.length)
                        index.add({
                            id: `song:${id}`,
                            kind: "song",
                            label: show.name,
                            layoutId,
                            aliases: String(show.meta?.aliases || "")
                                .split(/[,;\n]/)
                                .map((alias) => alias.trim())
                                .filter(Boolean),
                            positions
                        })
                }
                await new Promise((resolve) => setTimeout(resolve, 0))
            }
            const bibles = get(scriptures)
            const tab = get(drawerTabsData).scripture?.activeSubTab || ""
            const collection = bibles[tab]?.collection
            const active = collection ? collection.versions[collection.previewIndex || 0] : tab
            const id = get(ai).live?.bibleId || (bibles[active] && !bibles[active].api ? active : Object.keys(bibles).find((key) => !bibles[key].api && !bibles[key].collection))
            this.bible = null
            if (id && bibles[id] && !bibles[id].api && !bibles[id].collection) {
                const loaded = await loadJsonBible(id)
                if (loaded) {
                    const data = loaded.data as Bible
                    this.bible = { id, data }
                    let chaptersIndexed = 0
                    for (const book of data.books)
                        for (const chapter of book.chapters) {
                            if (++chaptersIndexed % 40 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
                            index.add({ id: `bible:${id}:${book.number}:${chapter.number}`, kind: "scripture", label: `${book.customName || book.name} ${chapter.number} · ${bibles[id].customName || bibles[id].name}`, versionId: id, positions: chapter.verses.map((verse, index) => ({ id: String(verse.number), index, text: verse.text, reference: { book: book.number, chapter: chapter.number, verse: verse.number } })) })
                        }
                }
            }
            this.index = index
        })().finally(() => {
            this.build = null
            if (get(liveAssistanceMessage) === "Preparing local song and Bible search…") liveAssistanceMessage.set("")
        })
        await this.build
        if (this.dirty) await this.prepare()
    }
    async ingest(segment: TimedTranscriptSegment) {
        this.install()
        if (segment.sessionId !== this.transcriptSession || get(aiSttStatus).state !== "listening" || !get(ai).enabled || get(ai).live?.enabled === false) return
        const revision = this.seen.get(segment.id) ?? -1
        if (segment.revision <= revision) return
        this.seen.set(segment.id, segment.revision)
        if (this.seen.size > 500) this.seen.delete(this.seen.keys().next().value!)
        this.caption(segment)
        if (!segment.final || segment.music || !segment.text.trim()) return
        liveSearchText.set(segment.text)
        const epoch = this.epoch
        await this.prepare()
        if (epoch !== this.epoch || segment.sessionId !== this.transcriptSession || get(aiSttStatus).state !== "listening") return
        const reference = this.bible && spokenReference(segment.text, this.bible.data.books)
        const referenceDocument = reference && this.bible ? `bible:${this.bible.id}:${reference.book}:${reference.chapter}` : ""
        await this.controller.ingest(segment, referenceDocument === this.controller.session?.documentId && reference ? String(reference.verse) : undefined)
        if (epoch !== this.epoch) return
        const candidates: LiveCandidate[] = []
        if (reference && this.bible) {
            const id = `bible:${this.bible.id}:${reference.book}:${reference.chapter}`
            const document = this.index.documents.get(id)
            const position = document?.positions.find((position) => position.id === String(reference.verse))
            if (document && position) candidates.push(this.candidate(document, position, 99, "reference"))
        }
        for (const document of this.index.titles(segment.text)) candidates.push(this.candidate(document, document.positions[0], 98, "title"))
        for (const match of this.index.match(segment.text)) {
            if (match.score < 0.86) continue
            if (!candidates.some((candidate) => candidate.documentId === match.document.id)) candidates.push(this.candidate(match.document, match.position, Math.round(match.score * 100), match.document.kind === "song" ? "lyrics" : "verse"))
        }
        const now = Date.now()
        liveCandidates.update((previous) => [...candidates, ...previous.filter((candidate) => now - candidate.timestamp < 90000 && !candidates.some((next) => next.documentId === candidate.documentId))].slice(0, 8))
    }
    private candidate(document: LiveDocument, position: LivePosition, confidence: number, reason: LiveCandidate["reason"]): LiveCandidate {
        return { id: `${document.id}:${position.id}`, documentId: document.id, positionId: position.id, kind: document.kind, label: position.reference ? `${document.label} :${position.reference.verse}` : document.label, excerpt: position.text.replace(/<[^>]*>/g, " "), confidence, reason, timestamp: Date.now() }
    }
    async accept(candidate: LiveCandidate) {
        this.install()
        if (get(outLocked) || get(aiSttStatus).state !== "listening") {
            liveAssistanceMessage.set("Start listening and unlock the output before following.")
            return
        }
        const epoch = this.epoch
        await this.prepare()
        if (epoch !== this.epoch) return
        const document = this.index.documents.get(candidate.documentId)
        if (!document || !document.positions.some((position) => position.id === candidate.positionId)) {
            liveAssistanceMessage.set("This content is no longer available. Choose a new suggestion.")
            return
        }
        if (document.kind === "song") {
            const id = document.id.slice(5)
            await loadShows([id])
            const loaded = get(showsCache)[id]
            const current = loaded && songPositions(loaded, document.layoutId!).find((position) => position.id === candidate.positionId)
            if (!current || current.text.replace(/<[^>]*>/g, " ") !== candidate.excerpt) {
                liveAssistanceMessage.set("This suggestion changed. Choose a fresh suggestion.")
                return
            }
        }
        if (epoch !== this.epoch) return
        const position = document.positions.find((position) => position.id === candidate.positionId)!
        if (position.text.replace(/<[^>]*>/g, " ") !== candidate.excerpt || Date.now() - candidate.timestamp > 90000) {
            liveAssistanceMessage.set("This suggestion changed or expired. Choose a fresh suggestion.")
            return
        }
        this.controller.stop()
        this.contentValid = true
        this.acceptedFingerprint = this.fingerprint(document)
        this.lastSlides.clear()
        const ids = this.targetOutputs()
        for (const id of ids) this.lastSlides.set(id, JSON.stringify(get(outputs)[id].out?.slide || null))
        if (!ids.length) {
            liveAssistanceMessage.set("Select an enabled presentation output first.")
            return
        }
        liveAssistanceMessage.set("")
        await this.controller.start(document, candidate.positionId, ids)
    }
    async addLyrics(title: string, text: string, source: string) {
        if (!title.trim() || !text.trim()) throw new Error("A title and lyrics are required.")
        const before = new Set(Object.keys(get(shows)))
        const { importDocumentCandidate } = await import("../../converters/documentImport")
        if (importDocumentCandidate({ id: "online", title, text, source, warnings: [] }, "songs") === "duplicate") throw new Error("This song already exists. Select its local suggestion, or use a different title.")
        this.dirty = true
        await this.prepare()
        const id = Object.keys(get(shows)).find((id) => !before.has(id))
        const document = this.index.documents.get(`song:${id}`)
        if (!document) throw new Error("Song was added, but is not ready to follow. Select it from the library.")
        await this.accept(this.candidate(document, document.positions[0], 100, "title"))
    }
    pause() {
        this.epoch++
        this.controller.pause()
    }
    resume() {
        this.controller.resume()
    }
    stop() {
        this.epoch++
        this.controller.stop()
        this.acceptedFingerprint = ""
        this.contentValid = true
        this.lastSlides.clear()
    }
    private async publish(document: LiveDocument, position: LivePosition, session: FollowSession, isCurrent: () => boolean) {
        if (!isCurrent()) return
        let slide: any
        if (document.kind === "song") {
            const id = document.id.slice(5)
            await loadShows([id])
            if (!isCurrent() || this.fingerprint(document) !== this.acceptedFingerprint) return
            slide = { id, layout: document.layoutId, index: position.index }
        } else {
            const id = document.versionId!
            const bible = await loadJsonBible(id)
            const reference = position.reference!
            const book = bible?.data.books.find((book) => book.number === reference.book)
            const chapter = book?.chapters.find((chapter) => chapter.number === reference.chapter)
            if (!bible || !book || !chapter || !isCurrent()) return
            const metadata = get(scriptures)[id]
            const content: BibleContent = {
                id,
                isApi: false,
                version: metadata.customName || metadata.name,
                metadata: { ...bible.data.metadata, ...metadata.metadata },
                book: book.name,
                bookAbbr: book.abbreviation || book.name,
                bookId: String(book.number),
                chapters: [chapter.number],
                activeVerses: [[reference.verse]],
                verses: [Object.fromEntries(chapter.verses.map((verse) => [String(verse.number), verse.text]))],
                attributionString: metadata.attributionString || "",
                attributionRequired: !!metadata.attributionRequired
            }
            const rendered = await getScriptureSlidesNew({ biblesContent: [content], useProvidedContent: true, selectedChapters: [chapter.number], selectedVerses: [[reference.verse]] }, true)
            if (!isCurrent() || !rendered.slides[0]?.length) return
            slide = { id: "temp", tempItems: rendered.slides[0], categoryId: id, translations: 1, attributionString: rendered.attributions.join(" / "), customDynamicValues: rendered.slideDynamicValues[0] }
        }
        if (!isCurrent()) return
        slide.followSessionId = session.id
        for (const id of session.outputIds) {
            if (!isCurrent() || !get(outputs)[id]?.enabled || !get(outputs)[id].active) return
            setOutput("slide", slide, false, id, false, "live-follow")
        }
    }
    private caption(segment: TimedTranscriptSegment) {
        if (!get(ai).live?.captions || get(outLocked) || segment.music || !segment.text.trim()) return
        const now = Date.now()
        if (now - this.cueAt > 2500) this.cueWords = ""
        const text = `${this.cueWords} ${segment.text}`.trim().split(/\s+/).slice(-20).join(" ").slice(-220)
        if (segment.final) {
            this.cueWords = text
            this.cueAt = now
        }
        const cue: CaptionCue = { sessionId: segment.sessionId, segmentId: segment.id, revision: segment.revision, text, final: segment.final, expiresAt: now + 7000, fontFamily: get(ai).live?.fontFamily, fontSize: get(ai).live?.fontSize }
        captionPreview.set(cue)
        for (const id of this.targetOutputs(true)) setOutput("caption", cue, false, id, false, "live-caption")
        clearTimeout(this.captionTimer)
        this.captionTimer = setTimeout(() => this.clearCaptions(), 7000)
    }
    private disableCaptions() {
        if (get(ai).live?.captions) ai.update((settings) => ({ ...settings, live: { ...settings.live, captions: false } }))
        this.clearCaptions()
    }
    clearCaptions() {
        clearTimeout(this.captionTimer)
        this.cueWords = ""
        captionPreview.set(null)
        for (const [id, output] of Object.entries(get(outputs))) if (output.out?.caption) setOutput("caption", null, false, id, false, "live-caption")
    }
}
export const LiveAssistance = new Assistance()
