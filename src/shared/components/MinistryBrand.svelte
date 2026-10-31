<script lang="ts">
    import { MINISTRY_NAME } from "../branding"
    export let branch = ""
    export let compact = false
    const logo = new URL("../../../public/branding/ministry-logo.png", import.meta.url).href
</script>

<div class="ministry-brand" class:compact>
    <img src={logo} alt="Jesus Lives ministry logo" draggable={false} />
    <h1>{MINISTRY_NAME}</h1>
    {#if branch.trim()}<p>{branch.trim()} Branch</p>{/if}
</div>

<style>
    .ministry-brand {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        padding: 12px;
        max-width: 100%;
        text-align: center;
    }
    img {
        width: 80px;
        height: 80px;
        object-fit: contain;
    }
    h1 {
        color: var(--text);
        font-size: 1.5em;
        line-height: 1.25;
        font-weight: 650;
        max-width: 32rem;
        white-space: normal;
        margin: 0;
    }
    p {
        color: var(--secondary);
        margin: 0;
        white-space: normal;
    }
    .compact img {
        width: 32px;
        height: 32px;
    }
    .compact h1 {
        font-size: 0.9em;
    }
</style>
