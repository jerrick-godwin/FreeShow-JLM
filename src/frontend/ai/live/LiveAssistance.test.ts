import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { get, writable } from "svelte/store"
const mockStores = () => ({
    ai: writable({ enabled: true, live: { enabled: true, captions: true }, stt: {} }),
    aiSttStatus: writable({ state: "listening" }),
    outLocked: writable(false),
    outputs: writable({ main: { enabled: true, active: true, out: {} }, second: { enabled: true, active: true, out: {} } }),
    shows: writable({ song: { name: "Amazing Grace" } }),
    showsCache: writable({ song: { name: "Amazing Grace", settings: { activeLayout: "layout" }, meta: {}, layouts: { layout: { slides: [{ id: "a" }, { id: "b" }] } }, slides: { a: { items: [{ lines: [{ text: [{ value: "Amazing grace how sweet the sound" }] }] }] }, b: { items: [{ lines: [{ text: [{ value: "That saved a wretch like me" }] }] }] } } } }),
    scriptures: writable({ bible: { name: "Test Bible" } }),
    scripturesCache: writable({}),
    drawerTabsData: writable({ scripture: { activeSubTab: "bible" } })
})
vi.mock("../../IPC/main", () => ({ requestMain: vi.fn(async () => undefined) }))
vi.mock("../../components/helpers/setShow", () => ({ loadShows: vi.fn(async () => {}) }))
vi.mock("../../components/helpers/shows", () => ({ _show: () => ({ layouts: () => ({ ref: () => [[{ id: "a" }, { id: "b" }]] }) }) }))
vi.mock("../../components/drawer/bible/scripture", () => ({
    loadJsonBible: async () => ({
        data: {
            books: [
                {
                    number: 19,
                    name: "Psalms",
                    chapters: [
                        {
                            number: 3,
                            verses: [
                                { number: 4, text: "I cried unto the Lord and he heard me" },
                                { number: 5, text: "I laid me down and slept then awakened" }
                            ]
                        }
                    ]
                }
            ]
        }
    }),
    getScriptureSlidesNew: async () => ({ slides: [[{ id: "rendered" }]], attributions: [], slideDynamicValues: [{}] })
}))
vi.mock("../../components/helpers/output", () => ({ setOutput: vi.fn() }))
beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.doMock("../../stores", mockStores)
})
afterEach(() => vi.useRealTimers())
const event = (id: number, text: string, final = true, sessionId = "audio") => ({ sessionId, id: String(id), revision: 1, text, final, startMs: 0, endMs: 1000 })
describe("live assistance integration", () => {
    it("indexes a large local library without loading every song into the presentation cache", async () => {
        const { requestMain } = await import("../../IPC/main")
        const { loadShows } = await import("../../components/helpers/setShow")
        const { shows, showsCache, ai } = await import("../../stores")
        const original = get(showsCache).song
        shows.update((records: any) => ({ ...records, ...Object.fromEntries(Array.from({ length: 200 }, (_, index) => [`unloaded-${index}`, { name: `Library song ${index}` }])) }))
        vi.mocked(requestMain).mockImplementation(async (_channel: any, data: any) => ({ content: [data.id, { ...original, name: data.name }] }) as any)
        const { LiveAssistance: live, liveCandidates } = await import("./LiveAssistance")
        live.beginTranscript("audio")
        await live.ingest(event(1, "Let us sing Amazing Grace"))
        expect(get(liveCandidates).some((candidate) => candidate.label === "Amazing Grace")).toBe(true)
        expect(requestMain).toHaveBeenCalledTimes(200)
        ai.update((settings: any) => ({ ...settings, live: { ...settings.live, fontSize: 64 } }))
        await live.ingest(event(2, "Let us sing Amazing Grace"))
        expect(requestMain).toHaveBeenCalledTimes(200)
        expect(loadShows).not.toHaveBeenCalled()
        expect(Object.keys(get(showsCache))).toEqual(["song"])
        live.stop()
        live.clearCaptions()
        vi.mocked(requestMain).mockReset()
    })

    it("suggests locally, never projects before acceptance, and pauses on operator actions", async () => {
        const { LiveAssistance: live, liveCandidates, followSession } = await import("./LiveAssistance")
        const { setOutput } = await import("../../components/helpers/output")
        const { presentationIntent } = await import("./presentationIntent")
        live.beginTranscript("audio")
        await live.ingest(event(1, "Let us sing Amazing Grace"))
        expect(get(liveCandidates)[0].kind).toBe("song")
        expect(vi.mocked(setOutput).mock.calls.filter(([type]) => type === "slide")).toHaveLength(0)
        await live.accept(get(liveCandidates)[0])
        expect(get(followSession)?.state).toBe("following")
        expect(vi.mocked(setOutput)).toHaveBeenCalledWith("slide", expect.objectContaining({ id: "song", index: 0 }), false, "main", false, "live-follow")
        presentationIntent({ type: "slide", outputIds: ["main"], origin: "manual" })
        expect(get(followSession)?.state).toBe("paused")
        const calls = vi.mocked(setOutput).mock.calls.length
        await live.ingest(event(2, "That saved a wretch like me"))
        expect(
            vi
                .mocked(setOutput)
                .mock.calls.slice(calls)
                .some(([type]) => type === "slide")
        ).toBe(false)
        live.resume()
        await live.ingest(event(3, "That saved a wretch like me"))
        expect(vi.mocked(setOutput)).toHaveBeenCalledWith("slide", expect.objectContaining({ index: 1 }), false, "main", false, "live-follow")
        live.stop()
        live.clearCaptions()
    })
    it("shows interim captions, rejects stale sessions, and keeps cleared/locked captions off", async () => {
        const { LiveAssistance: live, captionPreview } = await import("./LiveAssistance")
        const { ai, outLocked } = await import("../../stores")
        const { presentationIntent } = await import("./presentationIntent")
        live.beginTranscript("audio")
        await live.ingest(event(1, "தமிழ் வசனம் සිංහල වචනය", false))
        expect(get(captionPreview)?.text).toContain("தமிழ்")
        presentationIntent({ type: "clear-all", outputIds: [], origin: "manual" })
        expect(get(captionPreview)).toBe(null)
        await live.ingest(event(2, "must stay cleared", false))
        expect(get(captionPreview)).toBe(null)
        ai.update((a: any) => ({ ...a, live: { ...a.live, captions: true } }))
        live.beginTranscript("new")
        await live.ingest(event(3, "stale words", false))
        expect(get(captionPreview)).toBe(null)
        await live.ingest(event(4, "new words", false, "new"))
        expect(get(captionPreview)?.text).toBe("new words")
        outLocked.set(true)
        outLocked.set(false)
        await live.ingest(event(5, "still hidden", false, "new"))
        expect(get(captionPreview)).toBe(null)
        live.stop()
        live.clearCaptions()
    })
    it("expires caption text without requiring another transcript", async () => {
        vi.useFakeTimers()
        const { LiveAssistance: live, captionPreview } = await import("./LiveAssistance")
        live.beginTranscript("audio")
        await live.ingest(event(1, "temporary caption", false))
        expect(get(captionPreview)?.text).toBe("temporary caption")
        await vi.advanceTimersByTimeAsync(7001)
        expect(get(captionPreview)).toBe(null)
        live.endTranscript()
    })
    it("requires acceptance for Bible references and renders the pinned passage", async () => {
        const { LiveAssistance: live, liveCandidates, followSession } = await import("./LiveAssistance")
        const { setOutput } = await import("../../components/helpers/output")
        live.beginTranscript("audio")
        await live.ingest(event(1, "Psalms chapter three verse four"))
        const candidate = get(liveCandidates).find((candidate) => candidate.kind === "scripture")!
        expect(candidate.positionId).toBe("4")
        await live.accept(candidate)
        expect(get(followSession)?.kind).toBe("scripture")
        expect(vi.mocked(setOutput)).toHaveBeenCalledWith("slide", expect.objectContaining({ id: "temp", categoryId: "bible" }), false, "main", false, "live-follow")
        await live.ingest(event(2, "Psalms 3:5"))
        expect(get(followSession)?.positionId).toBe("5")
        live.stop()
        live.clearCaptions()
    })
})
