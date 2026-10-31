import { afterEach, describe, expect, it, vi } from "vitest"
import { WhisperDriver } from "./whisperWorker"
function harness(decode?: (stream: any) => Promise<any>) {
    let waveform: Float32Array | undefined
    const onSegment = vi.fn(),
        onInterim = vi.fn(),
        onError = vi.fn()
    const driver = new WhisperDriver({
        modelDir: "/unused",
        language: "ta",
        onSegment,
        onInterim,
        onError,
        sherpa: {
            OfflineRecognizer: class {
                createStream() {
                    return {
                        acceptWaveform: ({ samples }: any) => {
                            waveform = samples
                        }
                    }
                }
                async decodeAsync(stream: any) {
                    return decode ? decode(stream) : { text: "கர்த்தர் என் மேய்ப்பராய் இருக்கிறார்", lang: "ta" }
                }
            }
        }
    })
    return { driver, onSegment, onInterim, onError, waveform: () => waveform }
}
function pcm(seconds: number, amplitude = 12000) {
    const result = Buffer.alloc(Math.round(seconds * 16000) * 2)
    for (let i = 0; i < result.length; i += 2) result.writeInt16LE(amplitude, i)
    return result
}
afterEach(() => vi.useRealTimers())
describe("local multilingual recognition driver", () => {
    it("converts PCM and emits interim separately from final endpoint text", async () => {
        vi.useFakeTimers()
        const h = harness()
        await h.driver.start()
        h.driver.pushAudio(pcm(2))
        await vi.advanceTimersByTimeAsync(30)
        expect(h.onInterim).toHaveBeenCalledWith("கர்த்தர் என் மேய்ப்பராய் இருக்கிறார்")
        expect(h.onSegment).not.toHaveBeenCalled()
        expect(h.waveform()![0]).toBeCloseTo(12000 / 32768)
        h.driver.pushAudio(pcm(0.6, 0))
        await vi.advanceTimersByTimeAsync(30)
        expect(h.onSegment).toHaveBeenCalledWith(expect.objectContaining({ language: "ta", startMs: 0, endMs: 2600, utteranceEnd: true }))
        await h.driver.stop()
    })
    it("suppresses silent/music output and late decoding after stop", async () => {
        vi.useFakeTimers()
        let finish: ((result: any) => void) | undefined
        const h = harness(() => new Promise((resolve) => (finish = resolve)))
        await h.driver.start()
        h.driver.pushAudio(pcm(1, 0))
        await vi.advanceTimersByTimeAsync(30)
        expect(h.waveform()).toBeUndefined()
        h.driver.pushAudio(pcm(2))
        await vi.advanceTimersByTimeAsync(30)
        await h.driver.stop()
        finish!({ text: "late words" })
        await vi.advanceTimersByTimeAsync(1)
        expect(h.onSegment).not.toHaveBeenCalled()
        expect(h.onInterim).not.toHaveBeenCalled()
        const music = harness(async () => ({ text: "[music]" }))
        await music.driver.start()
        music.driver.pushAudio(pcm(6))
        await vi.advanceTimersByTimeAsync(30)
        expect(music.onSegment).not.toHaveBeenCalled()
        await music.driver.stop()
    })
    it("reports overload instead of allowing unbounded audio buffering", async () => {
        const h = harness()
        await h.driver.start()
        h.driver.pushAudio(pcm(19))
        expect(h.onError).toHaveBeenCalledWith(expect.stringContaining("cannot keep up"))
        await h.driver.stop()
    })
})
