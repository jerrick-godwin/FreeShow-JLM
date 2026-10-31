<script lang="ts">
    import { guideActive } from "../../stores"
    import FirstLaunchWalkthrough from "./FirstLaunchWalkthrough.svelte"
</script>

{#if $guideActive}
    <div class="walkthrough-overlay" role="dialog" aria-modal="true" aria-label="Getting started with Jesus Lives Ministry">
        <div class="walkthrough-panel">
            <FirstLaunchWalkthrough on:complete={() => guideActive.set(false)} />
        </div>
    </div>
{/if}

<style>
    .walkthrough-overlay {
        position: fixed;
        inset: 0;
        z-index: 5999;
        display: grid;
        place-items: center;
        background: rgb(0 0 0 / 65%);
        padding: 20px;
    }
    .walkthrough-panel {
        background: var(--primary);
        color: var(--text);
        border: 1px solid var(--secondary);
        border-radius: 14px;
        padding: 24px;
        box-shadow: 0 24px 80px rgb(0 0 0 / 45%);
    }
</style>
