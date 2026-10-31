<script lang="ts">
    import { onDestroy } from "svelte"
    import type { CaptionCue } from "../../../types/ai/Live"
    export let cue: CaptionCue
    let now = Date.now()
    const timer = setInterval(() => (now = Date.now()), 200)
    onDestroy(() => clearInterval(timer))
    $: fontSize = Math.max(24, Math.min(100, cue.fontSize || 54))
</script>

{#if cue.text && cue.expiresAt > now}
    <div class="live-caption" data-testid="live-caption" style:font-family={cue.fontFamily || "Noto Sans Tamil, Noto Sans Sinhala, Tamil MN, Sinhala MN, Arial, sans-serif"} style:font-size="{fontSize}px">
        <span>{cue.text}</span>
    </div>
{/if}

<style>
    .live-caption {
        position: absolute;
        bottom: 4%;
        left: 5%;
        width: 90%;
        z-index: 2147483646;
        pointer-events: none;
        color: white;
        text-align: center;
        line-height: 1.4;
    }
    span {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        background: rgba(0, 0, 0, 0.82);
        padding: 12px 22px;
        border-radius: 8px;
        text-shadow: 0 2px 3px black;
    }
</style>
