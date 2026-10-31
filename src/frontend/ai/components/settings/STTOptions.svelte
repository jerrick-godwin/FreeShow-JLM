<script lang="ts">
    import { Main } from "../../../../types/IPC/Main"
    import type { EngineStatus } from "../../../../types/ai/Ai"
    import { requestMain } from "../../../IPC/main"
    import { AudioMicrophone } from "../../../audio/audioMicrophone"
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"
    import { activePopup, popupData } from "../../../stores"
    import Title from "../../../components/input/Title.svelte"
    import MaterialDropdown from "../../../components/inputs/MaterialDropdown.svelte"
    import Tip from "../../../components/main/Tip.svelte"
    import { ai, mediaDownloads } from "../../../stores"
    import { resolveSttEngine, SpeechToText } from "../../stt/stt"

    $: options = $ai.stt || {}

    function updateValue(key: string, value: any) {
        ai.update((a) => {
            if (!a.stt) a.stt = {}
            a.stt[key] = value

            return a
        })
    }

    // STATUS

    let status: EngineStatus | null = null
    $: if (selectedEngine) getStatus()
    async function getStatus() {
        const result = await requestMain(Main.AI_GET_STATUS, { engineId: selectedEngine })
        status = result?.[selectedEngine] || null

        getMicrophones()
    }

    // update status every time a download finishes
    let downloadingCount = 0
    $: currentlyDownloading = $mediaDownloads
    $: if (!status?.ready && currentlyDownloading) {
        if (currentlyDownloading.size < downloadingCount) getStatus()
        downloadingCount = currentlyDownloading.size
    }

    // MICS

    let microphones: { value: string; label: string }[] = []
    function getMicrophones() {
        AudioMicrophone.getList().then(async (devices) => {
            microphones = devices.map((device) => ({ value: device.deviceId, label: device.label }))

            // auto select the SYSTEM default input (the first listed device can be e.g. a continuity iPhone)
            if (!options.micDeviceId && devices.length) {
                const deviceId = await SpeechToText.resolveMicDeviceId("")
                if (deviceId) updateValue("micDeviceId", deviceId)
            }
        })
    }

    function engineOption(key: string, value: string) {
        ai.update((settings) => ({ ...settings, stt: { ...settings.stt, engineOptions: { ...settings.stt?.engineOptions, [selectedEngine]: { ...settings.stt?.engineOptions?.[selectedEngine], [key]: value } } } }))
    }
    $: selectedEngine = $ai.stt?.engine || resolveSttEngine()
</script>

<Title label="ai.transcription" icon="microphone" />
<MaterialDropdown
    label="Speech recognition"
    options={[
        { value: "whisper", label: "Multilingual local recognition" },
        { value: "nemotron", label: "Nemotron streaming recognition" }
    ]}
    value={selectedEngine}
    on:change={(e) => updateValue("engine", e.detail)}
/>
<MaterialDropdown
    label="Spoken language"
    value={$ai.stt?.engineOptions?.[selectedEngine]?.language || (selectedEngine === "whisper" ? "auto" : "en")}
    options={selectedEngine === "whisper"
        ? [
              { value: "auto", label: "Detect language automatically" },
              { value: "en", label: "English" },
              { value: "si", label: "Sinhala" },
              { value: "ta", label: "Tamil" }
          ]
        : [{ value: "en", label: "English" }]}
    on:change={(e) => engineOption("language", e.detail)}
/>
<MaterialButton
    on:click={() => {
        popupData.set({ mode: "transcription" })
        activePopup.set("ai_model_manager")
    }}>Set up speech model</MaterialButton
>

{#if status?.ready}
    <MaterialDropdown label="Microphone" options={microphones} value={options.micDeviceId || ""} on:change={(e) => updateValue("micDeviceId", e.detail)} />
{:else}
    <Tip type="warning" value={status?.error || "No model available."} />
{/if}
