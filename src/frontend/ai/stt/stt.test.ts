import { beforeEach, describe, expect, it, vi } from "vitest"
import { writable } from "svelte/store"
vi.mock("../../stores", () => ({ ai: writable({ stt: { engine: "whisper" } }) }))
vi.mock("../../IPC/main", () => ({ sendMain: vi.fn(), requestMain: vi.fn() }))
vi.mock("./transcript", () => ({ Transcript: { begin: vi.fn(), stop: vi.fn() } }))
beforeEach(() => vi.resetModules())
describe("microphone session lifecycle", () => {
    it("does not tear down the newer capture when an older start finishes late", async () => {
        const { SpeechToText: stt } = await import("./stt")
        let finish: ((value: any) => void) | undefined
        vi.spyOn(stt, "restartCapture")
            .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
            .mockResolvedValue({ ok: true })
        vi.spyOn(stt, "restartEngine").mockResolvedValue({ ok: true })
        const cleanup = vi.spyOn(stt, "stopCapture").mockImplementation(() => {})
        const older = stt.enable()
        expect(await stt.enable()).toEqual({ ok: true })
        finish!({ ok: true })
        expect(await older).toEqual({ ok: false, aborted: true })
        expect(cleanup).not.toHaveBeenCalled()
    })
    it("rejects a late engine response after stopping", async () => {
        const { SpeechToText: stt } = await import("./stt")
        const { requestMain } = await import("../../IPC/main")
        const { Transcript } = await import("./transcript")
        let finish: ((value: any) => void) | undefined
        vi.mocked(requestMain).mockImplementation(() => new Promise((resolve) => (finish = resolve)))
        vi.spyOn(stt, "stopCapture").mockImplementation(() => {})
        const starting = stt.restartEngine()
        stt.disable()
        finish!({ started: true, sessionId: "stale" })
        expect(await starting).toEqual({ ok: false, aborted: true })
        expect(Transcript.begin).not.toHaveBeenCalled()
    })
})
