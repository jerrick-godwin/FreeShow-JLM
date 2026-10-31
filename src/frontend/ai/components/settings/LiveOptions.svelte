<script lang="ts">
    import { ai, outputs, scriptures } from "../../../stores"
    import MaterialToggleSwitch from "../../../components/inputs/MaterialToggleSwitch.svelte"
    import MaterialDropdown from "../../../components/inputs/MaterialDropdown.svelte"
    import MaterialTextInput from "../../../components/inputs/MaterialTextInput.svelte"
    import MaterialNumberInput from "../../../components/inputs/MaterialNumberInput.svelte"
    import Title from "../../../components/input/Title.svelte"
    import type { LiveOptions } from "../../../../types/ai/Live"
    $: options = $ai.live || {}
    function update(key: keyof LiveOptions, value: any) {
        ai.update((settings) => ({ ...settings, live: { ...settings.live, [key]: value } }))
    }
    function toggleOutput(name: string, id: string, checked: boolean) {
        const key = name === "outputIds" ? "outputIds" : "captionOutputIds"
        const selected = options[key] || []
        update(key, checked ? [...new Set([...selected, id])] : selected.filter((value) => value !== id))
    }
</script>

<Title label="Live presentation assistance" icon="microphone" />
<MaterialToggleSwitch label="Suggest songs and Bible passages" checked={options.enabled !== false} on:change={(e) => update("enabled", e.detail)} />
<p>Confirm a suggestion once to follow its lyrics or the verses in that chapter. Manual navigation pauses following. Pause and Stop remain available while listening.</p>
<MaterialToggleSwitch label="Show live speech captions" checked={options.captions || false} on:change={(e) => update("captions", e.detail)} />
<MaterialDropdown
    label="Bible for speech suggestions"
    value={options.bibleId || ""}
    options={[
        { value: "", label: "Selected local Bible" },
        ...Object.entries($scriptures)
            .filter(([, bible]) => !bible.api && !bible.collection)
            .map(([id, bible]) => ({ value: id, label: bible.customName || bible.name }))
    ]}
    on:change={(e) => update("bibleId", e.detail)}
/>
<MaterialTextInput label="Caption font family" value={options.fontFamily || "Noto Sans Tamil, Noto Sans Sinhala, Arial"} on:input={(e) => update("fontFamily", e.detail)} />
<MaterialNumberInput label="Caption font size" value={options.fontSize || 54} min={24} max={100} on:change={(e) => update("fontSize", e.detail)} />
<p>No output selection uses all active presentation outputs. Following keeps the outputs selected when you accept a suggestion.</p>
{#each [["outputIds", "Follow lyrics and verses on"], ["captionOutputIds", "Show captions on"]] as [key, label]}
    <fieldset>
        <legend>{label}</legend>
        {#each Object.entries($outputs).filter(([, output]) => !output.stageOutput) as [id, output]}
            <label><input type="checkbox" checked={(options[key] || []).includes(id)} on:change={(e) => toggleOutput(key, id, e.currentTarget.checked)} /> {output.name}</label>
        {/each}
    </fieldset>
{/each}

<style>
    p {
        white-space: normal;
        margin: 10px 0;
        opacity: 0.85;
    }
    fieldset {
        border: 1px solid var(--secondary);
        padding: 10px;
        margin-top: 10px;
    }
    label {
        display: block;
        margin: 5px;
    }
</style>
