<script lang="ts">
    import { onMount, onDestroy } from "svelte"
    import { Main } from "../../../../types/IPC/Main"
    import type { LyricSearchResult } from "../../../../types/Main"
    import { requestMain, sendMain } from "../../../IPC/main"
    import { ai, aiSttStatus, outLocked } from "../../../stores"
    import { captionPreview, followSession, LiveAssistance, liveAssistanceMessage, liveCandidates, liveSearchText } from "../../live/LiveAssistance"
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"

    onMount(() => LiveAssistance.install())
    let expanded = true
    let online = false
    let query = ""
    let busy = false
    let results: LyricSearchResult[] = []
    let title = ""
    let lyrics = ""
    let source = ""
    let error = ""
    let requestId = 0
    onDestroy(() => {
        requestId++
    })
    $: listening = $aiSttStatus.state === "listening"
    async function search() {
        const id = ++requestId
        busy = true
        error = ""
        lyrics = ""
        results = []
        try {
            const found = await requestMain(Main.SEARCH_LYRICS, { artist: "", title: query })
            if (id === requestId) results = found || []
        } catch {
            if (id === requestId) error = "Online lyrics search is unavailable. Try Google or import your lyric text."
        } finally {
            if (id === requestId) busy = false
        }
    }
    function review(song: LyricSearchResult) {
        title = song.title
        lyrics = " "
        source = song.source
        sendMain(Main.URL, "https://www.google.com/search?q=" + encodeURIComponent(song.title + " " + (song.artist || "") + " lyrics " + song.source))
    }
    function captions() {
        ai.update((settings) => ({ ...settings, live: { ...settings.live, captions: !settings.live?.captions } }))
    }
    function openOnline() {
        online = !online
        if (online && !query) query = $liveSearchText.slice(-140)
    }
    async function addLyrics() {
        busy = true
        try {
            await LiveAssistance.addLyrics(title, lyrics, source || "User provided lyrics")
            lyrics = ""
            online = false
        } catch (failure) {
            error = failure instanceof Error ? failure.message : String(failure)
        } finally {
            busy = false
        }
    }
</script>

{#if $ai.enabled && $ai.live?.enabled !== false}
    <section class="live-controls" data-testid="live-assistance" aria-label="Live presentation assistance">
        <div class="control-row">
            <strong>{listening ? "Listening" : "Listening stopped"}</strong>
            <MaterialButton on:click={() => (expanded = !expanded)}>{expanded ? "Hide suggestions" : "Suggestions"}</MaterialButton>
            <MaterialButton isActive={$ai.live?.captions || false} on:click={captions}>{$ai.live?.captions ? "Captions on" : "Captions off"}</MaterialButton>
        </div>
        {#if $followSession}
            <div class="control-row" data-testid="follow-session">
                <span>{$followSession.label} — {$followSession.state === "following" ? "Following live" : "Paused"}</span>
                {#if $followSession.state === "following"}
                    <MaterialButton on:click={() => LiveAssistance.pause()}>Pause following</MaterialButton>
                {:else}
                    <MaterialButton disabled={!listening || $outLocked} on:click={() => LiveAssistance.resume()}>Resume following</MaterialButton>
                {/if}
                <MaterialButton on:click={() => LiveAssistance.stop()}>Stop following</MaterialButton>
            </div>
            {#if $followSession.reason}<p role="status">{$followSession.reason}</p>{/if}
        {/if}
        {#if $liveAssistanceMessage}<p role="status">{$liveAssistanceMessage}</p>{/if}
        {#if $captionPreview}<p class="caption-preview" data-testid="caption-preview">{$captionPreview.text}</p>{/if}
        {#if expanded}
            {#each $liveCandidates.slice(0, 3) as candidate (candidate.id)}
                <div class="candidate">
                    <span>{candidate.kind === "song" ? "Song" : "Bible"} · {candidate.label} · {candidate.confidence}% match</span>
                    <p>{candidate.excerpt}</p>
                    <MaterialButton disabled={!listening || $outLocked} on:click={() => LiveAssistance.accept(candidate)} data-testid="follow-candidate">Follow {candidate.label}</MaterialButton>
                </div>
            {/each}
            {#if $liveSearchText}
                <MaterialButton on:click={openOnline}>Find another song online</MaterialButton>
            {/if}
            {#if online}
                <label>Song title or lyric words<input aria-label="Online song query" bind:value={query} /></label>
                <div class="control-row">
                    <MaterialButton disabled={busy || !query.trim()} on:click={search}>Find song titles</MaterialButton>
                    <MaterialButton disabled={!query.trim()} on:click={() => sendMain(Main.URL, "https://www.google.com/search?q=" + encodeURIComponent(query + " lyrics"))}>Search Google</MaterialButton>
                    <MaterialButton
                        on:click={() => {
                            title = query
                            lyrics = " "
                            source = "User provided lyrics"
                        }}>Paste lyrics</MaterialButton
                    >
                </div>
                {#each results as song}<MaterialButton disabled={busy} on:click={() => review(song)}>Review {song.title} — {song.source}</MaterialButton>{/each}
                {#if !busy && !results.length}<p>Search your imported library first. Open a source to verify the song, then paste lyrics you have permission to use.</p>{/if}
                {#if lyrics}
                    <label>Song title<input aria-label="New song title" bind:value={title} /></label>
                    <label>Paste and review lyrics you may use<textarea aria-label="Reviewed lyrics" rows="6" bind:value={lyrics}></textarea></label>
                    <MaterialButton disabled={busy || !title.trim() || !lyrics.trim() || !listening || $outLocked} on:click={addLyrics}>Add to library and follow</MaterialButton>
                {/if}
                {#if busy}<p role="status">Searching…</p>{/if}
                {#if error}<p role="status">{error}</p>{/if}
            {/if}
        {/if}
    </section>
{/if}

<style>
    .live-controls {
        position: fixed;
        bottom: 78px;
        right: 20px;
        z-index: 4997;
        width: min(560px, 45vw);
        max-height: 65vh;
        overflow: auto;
        padding: 12px;
        border: 1px solid var(--secondary);
        border-radius: 12px;
        background: var(--primary-darker);
        color: var(--text);
        box-shadow: 0 3px 15px #0006;
        font-size: 0.85em;
    }
    .control-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
    }
    .control-row > span {
        flex: 1;
    }
    p {
        white-space: normal;
        margin: 6px 0;
    }
    .candidate {
        border-top: 1px solid var(--secondary);
        margin-top: 8px;
        padding-top: 8px;
    }
    .candidate p {
        max-height: 3.5em;
        overflow: hidden;
        opacity: 0.8;
    }
    .caption-preview {
        border-left: 3px solid var(--secondary);
        padding-left: 8px;
    }
    input,
    textarea {
        box-sizing: border-box;
        width: 100%;
        background: var(--primary);
        color: var(--text);
        border: 1px solid var(--secondary);
        border-radius: 4px;
        padding: 6px;
    }
</style>
