<script lang="ts">
    import { onMount } from "svelte"
    import type { EngineStatus } from "../../../../types/ai/Ai"
    import { Main } from "../../../../types/IPC/Main"
    import { requestMain } from "../../../IPC/main"
    import { mediaDownloads } from "../../../stores"
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"
    let status: EngineStatus | null = null
    let busy = false
    let error = ""
    $: download = $mediaDownloads.get("whisper")
    async function refresh() {
        const result = await requestMain(Main.AI_GET_STATUS, { engineId: "whisper" })
        status = result?.whisper || null
    }
    onMount(refresh)
    async function install() {
        busy = true
        error = ""
        try {
            const ok = await requestMain(Main.AI_SETUP, { action: "download", engineId: "whisper" }, undefined, 3600000)
            if (!ok) error = "Download did not complete. Check the connection and retry."
            await refresh()
        } catch (failure) {
            error = failure instanceof Error ? failure.message : "Speech model download failed. Please retry."
        } finally {
            busy = false
        }
    }
</script>

<p>Local recognition for English, Sinhala, and Tamil. Included with the desktop installer and works offline. A download is available if model files need to be repaired. Singing accuracy depends on the audio and language; suggestions always need confirmation.</p>
{#if status?.unsupported}<p>{status.error}</p>
{:else if status?.ready}<p>Multilingual speech model is ready.</p>
{:else}<MaterialButton disabled={busy} on:click={install}>Download multilingual speech model{busy && download?.total ? ` ${Math.floor((download.progress / download.total) * 100)}%` : ""}</MaterialButton>{/if}
{#if busy}<MaterialButton on:click={() => requestMain(Main.AI_SETUP, { action: "cancel", engineId: "whisper" })}>Cancel download</MaterialButton>{/if}
{#if error}<p role="status">{error}</p>{/if}

<style>
    p {
        white-space: normal;
        margin: 10px 0;
    }
</style>
