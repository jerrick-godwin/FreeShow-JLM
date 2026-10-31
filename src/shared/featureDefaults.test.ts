import { describe, expect, it } from "vitest"
import { applyFeatureDefaults } from "./featureDefaults"

describe("bundled feature defaults", () => {
    it("enables local multilingual recognition, suggestions and captions", () => {
        expect(applyFeatureDefaults()).toMatchObject({ enabled: true, stt: { engine: "whisper", engineOptions: { whisper: { language: "auto" } } }, live: { enabled: true, captions: true } })
    })
    it("preserves disabled features, chosen microphones and explicit model settings", () => {
        const settings = { enabled: false, stt: { engine: "nemotron", micDeviceId: "church-mixer", engineOptions: { whisper: { language: "ta" } } }, live: { enabled: false, captions: false, outputIds: ["main"] } }
        expect(applyFeatureDefaults(settings)).toEqual(settings)
    })
    it("creates independent settings for each installation", () => {
        const first = applyFeatureDefaults()
        first.stt!.engineOptions!.whisper.language = "en"
        expect(applyFeatureDefaults().stt?.engineOptions?.whisper.language).toBe("auto")
    })
})
