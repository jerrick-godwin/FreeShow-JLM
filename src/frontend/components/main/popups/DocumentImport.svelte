<script lang="ts">
    import { onDestroy } from "svelte"
    import type { DocumentImportJob, ExtractedDocument, ImportCandidate, ImportColumns, ImportLanguage, ImportTarget } from "../../../../types/DocumentImport"
    import { Main } from "../../../../types/IPC/Main"
    import { requestMain } from "../../../IPC/main"
    import { activePopup, popupData } from "../../../stores"
    import { detectColumns, documentCandidates, parseCSV } from "../../../../shared/documentImport"
    import { candidateDuplicate, documentImportBatch, importDocumentCandidate, undoDocumentImport } from "../../../converters/documentImport"
    import MaterialButton from "../../inputs/MaterialButton.svelte"

    const target: ImportTarget = $popupData.target === "bible" ? "bible" : "songs"
    let languages: ImportLanguage[] = ["eng", "sin", "tam"]
    let job: DocumentImportJob | null = null
    let busy = false
    let candidates: ImportCandidate[] = []
    let documents: ExtractedDocument[] = []
    let mappings: Record<string, ImportColumns> = {}
    let completed = new Set<string>()
    let skipped = new Set<string>()
    let imported = 0
    let reviewLimit = 20
    let message = ""
    let errors: string[] = []
    let poll: ReturnType<typeof setTimeout> | undefined
    let destroyed = false
    const fields: (keyof ImportColumns)[] = target === "songs" ? ["title", "lyrics"] : ["book", "chapter", "verse", "text"]

    async function start() {
        busy = true
        message = ""
        try {
            job = (await requestMain(Main.DOCUMENT_IMPORT_START, { languages }, undefined, 120000)) || null
            if (destroyed) {
                if (job?.state === "running") await requestMain(Main.DOCUMENT_IMPORT_CANCEL, { id: job.id })
                return
            }
            if (job) {
                errors = []
                candidates = []
                documents = []
                completed = new Set()
                skipped = new Set()
                imported = 0
                reviewLimit = 20
                documentImportBatch.set({ songs: [], bibles: [] })
                await refresh()
            } else busy = false
        } catch (error) {
            message = String(error)
            busy = false
        }
    }
    async function refresh() {
        if (!job || destroyed) return
        const status = await requestMain(Main.DOCUMENT_IMPORT_STATUS, { id: job.id })
        if (destroyed) return
        if (!status) {
            busy = false
            message = "Import status unavailable. Choose the files again."
            return
        }
        job = status
        if (status.state === "running") {
            poll = setTimeout(refresh, 500)
            return
        }
        busy = false
        errors = status.errors
        if (status.state === "cancelled") {
            message = "Import cancelled. No converted items were added."
            return
        }
        documents = status.documents
        for (const document of documents) {
            try {
                if (document.extension === "csv") mappings[document.name] = detectColumns(parseCSV(document.text)[0] || [])
                candidates = [...candidates, ...documentCandidates(document, target)]
            } catch (error) {
                errors = [...errors, `${document.name}: ${String(error)}`]
            }
        }
        for (const candidate of candidates) {
            if (candidateDuplicate(candidate, target)) skipped = new Set([...skipped, candidate.id])
            else if (!candidate.warnings.length) commit(candidate)
        }
    }
    function commit(candidate: ImportCandidate, allowDuplicate = false) {
        try {
            const result = importDocumentCandidate(candidate, target, allowDuplicate)
            if (result === "duplicate") {
                skipped = new Set([...skipped, candidate.id])
                return
            }
            imported++
            completed = new Set([...completed, candidate.id])
            skipped.delete(candidate.id)
            skipped = new Set(skipped)
        } catch (error) {
            message = String(error)
        }
    }
    function remap(document: ExtractedDocument) {
        try {
            const replacements = documentCandidates(document, target, mappings[document.name])
            candidates = [...candidates.filter((c) => c.source !== document.name || completed.has(c.id)), ...replacements.filter((c) => !completed.has(c.id))]
            skipped = new Set([...skipped].filter((id) => !replacements.some((c) => c.id === id)))
        } catch (error) {
            message = String(error)
        }
    }
    function split(candidate: ImportCandidate) {
        const source = documents.find((document) => document.name === candidate.source)
        if (!source) return
        const replacements = documentCandidates({ ...source, text: candidate.text, extension: "txt" }, target)
        candidates = candidates.flatMap((item) => (item === candidate ? replacements.map((replacement, i) => ({ ...replacement, id: `${candidate.id}:split:${i}` })) : [item]))
    }
    async function cancel() {
        if (job) await requestMain(Main.DOCUMENT_IMPORT_CANCEL, { id: job.id })
    }
    onDestroy(() => {
        destroyed = true
        clearTimeout(poll)
        if (job?.state === "running") requestMain(Main.DOCUMENT_IMPORT_CANCEL, { id: job.id })
    })
</script>

<div class="document-import">
    <p>Choose PDF, Word, CSV, or text files. Clear items import automatically; uncertain items appear below for correction.</p>
    <p>Scanned PDFs are read on this computer. Recognition data downloads once, then works offline.</p>
    <div class="languages">
        {#each [{ id: "eng", name: "English" }, { id: "sin", name: "Sinhala" }, { id: "tam", name: "Tamil" }] as language}
            <label><input type="checkbox" disabled={busy} value={language.id} bind:group={languages} /> {language.name}</label>
        {/each}
    </div>
    <MaterialButton disabled={busy || !languages.length} icon="import" on:click={start}>Choose files</MaterialButton>
    <MaterialButton disabled={busy} on:click={() => activePopup.set(target === "songs" ? "import" : "import_scripture")}>Existing app exports</MaterialButton>
    {#if busy}
        <p role="status">{job?.message || "Choose documents to import…"}</p>
        <progress max="1" value={job?.progress || 0}></progress>
        <MaterialButton on:click={cancel}>Cancel import</MaterialButton>
    {/if}
    {#if job && !busy}
        <p role="status">Imported: {imported} · Skipped: {skipped.size} · Needs review: {candidates.filter((c) => !completed.has(c.id) && !skipped.has(c.id)).length} · Failed files: {errors.length}</p>
    {/if}
    {#if message}<p role="status">{message}</p>{/if}
    {#each errors as error}<p class="warning">{error}</p>{/each}
    {#each documents.filter((document) => document.extension === "csv") as document}
        <fieldset>
            <legend>CSV columns — {document.name} (first row contains column names)</legend>
            {#each fields as field}
                <label
                    >{field}
                    <select bind:value={mappings[document.name][field]}>
                        <option value={undefined}>Choose column</option>
                        {#each parseCSV(document.text)[0] || [] as header, i}<option value={i}>{header || `Column ${i + 1}`}</option>{/each}
                    </select>
                </label>
            {/each}
            <MaterialButton on:click={() => remap(document)}>Apply mapping</MaterialButton>
        </fieldset>
    {/each}
    {#each candidates.filter((candidate) => !completed.has(candidate.id)).slice(0, reviewLimit) as candidate (candidate.id)}
        <fieldset>
            <legend>{candidate.source}{skipped.has(candidate.id) ? " — skipped" : " — review"}</legend>
            {#each candidate.warnings as warning}<p class="warning">{warning}</p>{/each}
            {#if candidateDuplicate(candidate, target)}<p class="warning">An item with this title already exists. It will be skipped unless you choose Import as copy.</p>{/if}
            <label>{target === "songs" ? "Song title" : "Bible translation name"}<input bind:value={candidate.title} /></label>
            <label>{target === "songs" ? "Lyrics (use # Song title to separate songs)" : "Verses (one per line: John 3:16 Verse text)"}<textarea rows="9" bind:value={candidate.text}></textarea></label>
            <MaterialButton disabled={!candidate.title.trim() || !candidate.text.trim()} on:click={() => commit(candidate)}>Import corrected item</MaterialButton>
            {#if candidateDuplicate(candidate, target)}<MaterialButton on:click={() => commit(candidate, true)}>Import as copy</MaterialButton>{/if}
            {#if target === "songs"}<MaterialButton on:click={() => split(candidate)}>Re-detect song boundaries</MaterialButton>{/if}
            <MaterialButton on:click={() => (skipped = new Set([...skipped, candidate.id]))}>Skip</MaterialButton>
        </fieldset>
    {/each}
    {#if candidates.filter((candidate) => !completed.has(candidate.id)).length > reviewLimit}
        <MaterialButton on:click={() => (reviewLimit += 20)}>Show more items to review</MaterialButton>
    {/if}
    <MaterialButton disabled={busy} on:click={() => activePopup.set(null)}>Done</MaterialButton>
    {#if $documentImportBatch.songs.length || $documentImportBatch.bibles.length}
        <MaterialButton
            on:click={() => {
                const result = undoDocumentImport()
                message = `Removed ${result.removed} imported item${result.removed === 1 ? "" : "s"}.${result.kept ? ` Kept ${result.kept} changed item${result.kept === 1 ? "" : "s"}.` : ""}`
                completed = new Set()
                imported = 0
            }}>Undo this import</MaterialButton
        >
    {/if}
</div>

<style>
    .document-import {
        width: min(760px, 75vw);
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
    .document-import p {
        white-space: normal;
        overflow: visible;
    }
    .languages {
        display: flex;
        gap: 20px;
    }
    fieldset {
        border: 1px solid var(--secondary);
        padding: 12px;
        border-radius: 8px;
    }
    label {
        display: block;
        margin: 6px 0;
    }
    textarea,
    input:not([type="checkbox"]),
    select {
        width: 100%;
        box-sizing: border-box;
        background: var(--primary-darker);
        color: var(--text);
        padding: 8px;
        border: 1px solid var(--secondary);
        border-radius: 4px;
    }
    .warning {
        color: var(--text);
        opacity: 0.8;
        margin-bottom: 8px;
    }
</style>
