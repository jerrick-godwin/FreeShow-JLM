import type { AiSettings } from "../types/ai/AiSettings"

// Enable the bundled features while retaining every explicit operator preference.
export function applyFeatureDefaults(settings: AiSettings = {}): AiSettings {
    return {
        ...settings,
        enabled: settings.enabled ?? true,
        stt: {
            ...settings.stt,
            engine: settings.stt?.engine || "whisper",
            micDeviceId: settings.stt?.micDeviceId || "default",
            engineOptions: {
                ...settings.stt?.engineOptions,
                whisper: { language: "auto", ...settings.stt?.engineOptions?.whisper }
            }
        },
        live: { enabled: true, captions: true, ...settings.live }
    }
}
