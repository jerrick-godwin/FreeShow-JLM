<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte"
    import MinistryBrand from "../../../shared/components/MinistryBrand.svelte"
    import { special } from "../../stores"
    import Icon from "../helpers/Icon.svelte"
    import MaterialButton from "../inputs/MaterialButton.svelte"

    const dispatch = createEventDispatcher()
    let step = 0
    let panel: HTMLElement
    onMount(() => panel.focus())
    const steps = [
        { icon: "song", title: "Your ministry library is ready", text: "Your church songbook and English, Sinhala, and Tamil Bibles are included. You can use the library, speech recognition, and document OCR without a first-run download.", hint: "All new feature controls are enabled by default." },
        { icon: "song", title: "Choose a song and make it yours", text: "Open Songs in the bottom drawer to search the imported songbook. Select a song to preview its slides. In Settings → Styles, Song Lyrics and Bible Verses have independent fonts, positions, colours, and backgrounds.", hint: "Changing a song layout keeps your Bible layout separate." },
        { icon: "scripture", title: "Find Bible verses while you type", text: "Open Bible in the bottom drawer. Type a book name, a reference such as Psalms 3:4, a range, or words from a verse. Choose English, Sinhala, or Tamil in the Bible collection.", hint: "Search changes the preview. Select a verse to send it live." },
        { icon: "import", title: "Add songbooks and Bibles", text: "Use Import Songbook or Import Bible to add PDF, Word, CSV, or supported app exports. Scanned pages use local OCR. Review uncertain text before importing; duplicates are skipped by default.", hint: "The import summary offers Undo for newly added records." },
        { icon: "microphone", title: "Listen, suggest, and show subtitles", text: "Open Live assistance and start listening when your microphone or mixer is ready. Speech recognition searches local songs and Bibles. Subtitles are enabled and appear while listening; you can change their appearance and outputs in Live assistance settings.", hint: "Microphone access starts when you choose Start listening." },
        { icon: "play", title: "Confirm once, then follow live", text: "Accept a song or passage suggestion to begin Follow Live. The app follows the lyrics or verses as the speaker continues. A different song or passage needs your confirmation. Uncertain recognition holds the current display.", hint: "Pause, Resume, and Stop stay available. Manual navigation pauses following." },
        { icon: "settings", title: "You are ready to present", text: "Check the preview and choose your presentation output before going live. Output locks and clear controls remain in charge. Change the branch name in Settings → General, and adjust captions, recognition language, or individual features whenever needed.", hint: "You can replay the walkthrough from the Help menu." }
    ]
    function finish() {
        special.update((settings) => ({ ...settings, ministryWalkthroughVersion: 1 }))
        dispatch("complete")
    }
    function next() {
        if (step === steps.length - 1) finish()
        else step++
    }
    function keydown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            event.preventDefault()
            finish()
        }
        if (event.key === "ArrowRight") {
            event.preventDefault()
            next()
        }
        if (event.key === "ArrowLeft") {
            event.preventDefault()
            step = Math.max(0, step - 1)
        }
    }
</script>

<section bind:this={panel} tabindex="-1" on:keydown|stopPropagation={keydown} class="walkthrough" aria-label="Ministry software walkthrough" data-testid="ministry-walkthrough">
    <MinistryBrand branch={$special.branchName || ""} compact />
    <div class="progress" aria-label="Walkthrough progress">
        {#each steps as item, index}
            <button class:current={step === index} class:visited={index < step} aria-label="Step {index + 1}: {item.title}" aria-current={step === index ? "step" : undefined} on:click={() => (step = index)}></button>
        {/each}
    </div>
    <p class="step">Step {step + 1} of {steps.length}</p>
    <div class="feature-icon"><Icon id={steps[step].icon} size={3} white /></div>
    <h2>{steps[step].title}</h2>
    <p class="description">{steps[step].text}</p>
    <p class="hint">{steps[step].hint}</p>
    <nav aria-label="Walkthrough navigation">
        <MaterialButton on:click={finish}>Skip walkthrough</MaterialButton>
        <div class="actions">
            {#if step > 0}<MaterialButton on:click={() => step--}>Back</MaterialButton>{/if}
            <MaterialButton variant="contained" on:click={next}>{step === steps.length - 1 ? "Start presenting" : "Next"}</MaterialButton>
        </div>
    </nav>
</section>

<style>
    .walkthrough {
        width: min(680px, 76vw);
        max-height: 78vh;
        overflow-y: auto;
        padding: 4px 8px;
    }
    .progress {
        display: flex;
        gap: 7px;
        margin: 20px 0 10px;
    }
    .progress button {
        flex: 1;
        height: 5px;
        padding: 0;
        border: 0;
        border-radius: 8px;
        background: var(--primary-lighter);
        cursor: pointer;
    }
    .progress button.current,
    .progress button.visited {
        background: var(--secondary);
    }
    .progress button:focus-visible {
        outline: 2px solid var(--text);
        outline-offset: 4px;
    }
    .step {
        opacity: 0.65;
        font-size: 0.85em;
    }
    .feature-icon {
        display: flex;
        justify-content: center;
        margin: 16px 0;
        color: var(--secondary);
    }
    h2 {
        font-size: 1.6em;
        line-height: 1.3;
        margin: 12px 0;
        white-space: normal;
    }
    p {
        white-space: normal;
        line-height: 1.6;
    }
    .hint {
        padding: 12px 16px;
        margin: 20px 0;
        border-inline-start: 3px solid var(--secondary);
        background: var(--primary-lighter);
        border-radius: 4px;
    }
    nav,
    .actions {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    nav {
        justify-content: space-between;
        flex-wrap: wrap;
        margin-top: 24px;
    }
    @media (max-width: 600px) {
        .walkthrough {
            width: 82vw;
        }
    }
</style>
