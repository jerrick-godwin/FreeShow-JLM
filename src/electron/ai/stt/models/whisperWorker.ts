import path from "path"
import type { DriverCallbacks, TranscriptionDriver } from "../sttHelper"
import { isMusicAnnotation } from "../sttHelper"
import { WHISPER_FILES } from "./whisperFiles"

const SAMPLE_RATE = 16000
interface WhisperOptions extends DriverCallbacks {
    modelDir: string
    language?: string
    sherpa?: any
}
export class WhisperDriver implements TranscriptionDriver {
    private recognizer: any
    private samples = new Float32Array(0)
    private offset = 0
    private silence = 0
    private stopped = false
    private lastDecoded = 0
    private decoding = false
    private timer: ReturnType<typeof setTimeout> | undefined
    constructor(private options: WhisperOptions) {}
    async start() {
        const sherpa = this.options.sherpa || require("sherpa-onnx-node")
        if (!sherpa.OfflineRecognizer) throw new Error("The local speech runtime is unavailable on this computer.")
        this.recognizer = new sherpa.OfflineRecognizer({
            featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
            modelConfig: { whisper: { encoder: path.join(this.options.modelDir, WHISPER_FILES[0].file), decoder: path.join(this.options.modelDir, WHISPER_FILES[1].file), language: this.options.language === "auto" ? "" : this.options.language || "", task: "transcribe" }, tokens: path.join(this.options.modelDir, WHISPER_FILES[2].file), numThreads: 2, provider: "cpu", debug: false },
            decodingMethod: "greedy_search"
        })
    }
    pushAudio(buffer: Uint8Array) {
        if (this.stopped || !this.recognizer) return
        // The capture worklet supplies signed little-endian 16-bit PCM.
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
        const length = Math.floor(buffer.byteLength / 2)
        const incoming = new Float32Array(length)
        let power = 0
        for (let i = 0; i < length; i++) {
            incoming[i] = view.getInt16(i * 2, true) / 32768
            power += incoming[i] * incoming[i]
        }
        const silent = Math.sqrt(power / Math.max(1, length)) < 0.008
        if (!this.samples.length && silent) {
            this.offset += length
            return
        }
        if (this.samples.length + length > SAMPLE_RATE * 18) {
            this.stopped = true
            this.options.onError("Recognition cannot keep up with this input. Stop and restart, or select a faster speech engine.")
            return
        }
        const combined = new Float32Array(this.samples.length + length)
        combined.set(this.samples)
        combined.set(incoming, this.samples.length)
        this.samples = combined
        this.silence = silent ? this.silence + length : 0
        if (!this.timer) this.timer = setTimeout(() => void this.decodeReady(), 25)
    }
    private async decodeReady() {
        this.timer = undefined
        if (this.decoding || this.stopped || !this.samples.length) return
        const final = this.silence >= SAMPLE_RATE * 0.55 || this.samples.length >= SAMPLE_RATE * 6
        if (!final && this.samples.length - this.lastDecoded < SAMPLE_RATE * 2) return
        if (this.samples.length < SAMPLE_RATE * 0.3) return
        const samples = this.samples
        this.lastDecoded = samples.length
        this.decoding = true
        try {
            const stream = this.recognizer.createStream()
            stream.acceptWaveform({ samples, sampleRate: SAMPLE_RATE })
            const result = await this.recognizer.decodeAsync(stream)
            if (this.stopped) return
            const text = (result?.text || this.recognizer.getResult(stream)?.text || "").trim()
            const music = isMusicAnnotation(text)
            if (final) {
                if (text && !music) this.options.onSegment({ text, startMs: this.offset / 16, endMs: (this.offset + samples.length) / 16, language: result?.lang || this.options.language, utteranceEnd: true })
                this.offset += samples.length
                this.samples = this.samples.slice(samples.length)
                this.lastDecoded = 0
                this.silence = 0
                this.options.onInterim?.("")
            } else if (text && !music) this.options.onInterim?.(text)
        } catch (error) {
            this.options.onError(error instanceof Error ? error.message : String(error))
        } finally {
            this.decoding = false
            if (!this.stopped && this.samples.length >= SAMPLE_RATE * 6) this.timer = setTimeout(() => void this.decodeReady(), 0)
        }
    }
    async stop() {
        this.stopped = true
        clearTimeout(this.timer)
        this.samples = new Float32Array(0)
        this.recognizer = null
    }
}

const port = process.parentPort
if (port) {
    let driver: WhisperDriver | null = null
    const post = (message: object) => port.postMessage(message)
    const heartbeat = setInterval(() => post({ type: "alive" }), 1000)
    heartbeat.unref()
    port.on("message", async (event) => {
        const message = event.data
        try {
            if (message.type === "start") {
                driver = new WhisperDriver({ modelDir: message.modelDir, language: message.language, onSegment: (segment) => post({ type: "segment", segment }), onInterim: (text) => post({ type: "interim", text }), onError: (error) => post({ type: "error", message: error }) })
                await driver.start()
                post({ type: "ready" })
            } else if (message.type === "audio") driver?.pushAudio(new Uint8Array(message.data))
            else if (message.type === "stop") {
                await driver?.stop()
                post({ type: "stopped" })
            }
        } catch (error) {
            post({ type: "error", message: error instanceof Error ? error.message : String(error) })
        }
    })
}
