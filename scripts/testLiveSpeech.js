// Optional real-model smoke test. Build Electron code first, then provide a model directory and a 16 kHz WAV.
const assert = require("node:assert/strict")
const sherpa = require("sherpa-onnx-node")
const { WhisperDriver } = require("../build/electron/ai/stt/models/whisperWorker")
const [modelDir, recording] = process.argv.slice(2)
if (!modelDir || !recording) throw new Error("Usage: node scripts/testLiveSpeech.js <model directory> <16 kHz WAV>")
async function main() {
    const wave = sherpa.readWave(recording)
    assert.equal(wave.sampleRate, 16000)
    const segments = []
    let failure
    const driver = new WhisperDriver({ modelDir, language: "en", onSegment: (segment) => segments.push(segment), onError: (error) => (failure = error) })
    const started = performance.now()
    await driver.start()
    const loaded = performance.now()
    // Feed one bounded utterance plus endpoint silence through the real capture format.
    const pcm = Buffer.alloc((wave.samples.length + 16000) * 2)
    wave.samples.forEach((value, index) => pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), index * 2))
    driver.pushAudio(pcm)
    const deadline = Date.now() + 120000
    while (!segments.length && !failure && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100))
    await driver.stop()
    assert.equal(failure, undefined)
    assert.ok(segments.length, "Expected an actual recognized final segment")
    assert.ok(segments[0].text.trim().split(/\s+/).length >= 4)
    console.log(JSON.stringify({ loadMs: Math.round(loaded - started), decodeMs: Math.round(performance.now() - loaded), audioSeconds: wave.samples.length / 16000, segments }, null, 2))
}
main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
