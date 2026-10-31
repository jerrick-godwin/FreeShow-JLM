import { get, writable } from "svelte/store"
import { uid } from "uid"
import type { ImportCandidate, ImportTarget } from "../../types/DocumentImport"
import { bibleFromLines } from "../../shared/documentImport"
import { normalizeBibleSearch } from "../../shared/bibleBooks"
import { convertText } from "./txt"
import { formatToFileName } from "../components/helpers/show"
import { history } from "../components/helpers/history"
import { scriptures, scripturesCache, shows, showsCache, textCache, drawerTabsData } from "../stores"

interface ImportedRecord {
    id: string
    snapshot: string
}
function recordSnapshot(value: unknown): string {
    // Global group labels/colors, usage timestamps and rendering caches are derived by the app.
    return JSON.stringify(value, (key, item) => {
        if (key === "timestamps" || key === "autoFontSize") return undefined
        if (!item || typeof item !== "object" || Array.isArray(item)) return item
        const boundSlide = typeof item.globalGroup === "string" && Array.isArray(item.items)
        return Object.fromEntries(
            Object.keys(item)
                .sort()
                .filter((name) => !boundSlide || (name !== "group" && name !== "color"))
                .map((name) => [name, item[name]])
        )
    })
}

export const documentImportBatch = writable<{ songs: ImportedRecord[]; bibles: ImportedRecord[] }>({ songs: [], bibles: [] })

export function candidateDuplicate(candidate: ImportCandidate, target: ImportTarget): boolean {
    const name = normalizeBibleSearch(candidate.title)
    if (target === "songs") {
        if (Object.values(get(shows)).some((show) => normalizeBibleSearch(show.name) === name)) return true
        const text = normalizeBibleSearch(candidate.text.replace(/\[[^\]]+\]/g, ""))
        const cachedText = Object.entries(get(textCache))
            .filter(([id]) => !!get(shows)[id])
            .map(([, value]) => String(value))
        const loadedText = Object.values(get(showsCache))
            .filter((show) => !show.reference?.type)
            .map((show) =>
                Object.values(show.slides)
                    .flatMap((slide) => slide.items || [])
                    .flatMap((item) => item.lines || [])
                    .map((line) => (line.text || []).map((part) => part.value || "").join(""))
                    .join(" ")
            )
        return !!text && [...cachedText, ...loadedText].some((value) => normalizeBibleSearch(value) === text)
    }
    return Object.values(get(scriptures)).some((bible) => normalizeBibleSearch(bible.customName || bible.name) === name)
}

export function importDocumentCandidate(candidate: ImportCandidate, target: ImportTarget, allowDuplicate = false): "imported" | "duplicate" {
    if (!candidate.title.trim() || !candidate.text.trim()) throw new Error("A title and content are required.")
    if (!allowDuplicate && candidateDuplicate(candidate, target)) return "duplicate"
    if (target === "songs") {
        let category = get(drawerTabsData).shows?.activeSubTab || null
        if (category === "all" || category === "unlabeled") category = null
        const result = convertText({ name: candidate.title.trim(), text: candidate.text, category, noFormatting: true, returnData: true })
        result.show.settings.template = "default"
        result.show.origin = candidate.source
        result.show.meta = { ...result.show.meta, ...candidate.metadata, songbook: candidate.source }
        // Import to the library without changing the active show/project or any live output.
        history({ id: "SHOWS", newData: { data: [result], preserveActiveShow: true }, location: { page: "drawer" } })
        documentImportBatch.update((batch) => ({ ...batch, songs: [...batch.songs, { id: result.id, snapshot: recordSnapshot(get(showsCache)[result.id] || result.show) }] }))
    } else {
        const parsed = bibleFromLines(candidate.title.trim(), candidate.text)
        if (parsed.warnings.length) throw new Error(parsed.warnings[0])
        const id = uid()
        // Names are disk filenames in the existing Bible persistence layer.
        const baseName = formatToFileName(candidate.title.trim()) || "Imported Bible"
        let name = baseName,
            suffix = 2
        while (Object.values(get(scriptures)).some((b) => normalizeBibleSearch(b.name) === normalizeBibleSearch(name))) name = `${baseName} ${suffix++}`
        const escapeText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        const metadata: Record<string, string> = { ...candidate.metadata, source: candidate.source }
        if (metadata.copyright) metadata.copyright = escapeText(metadata.copyright)
        const bible = { ...parsed.bible, name, metadata }
        // Document extraction yields plain text, while existing Bible renderers support HTML.
        for (const book of bible.books)
            for (const chapter of book.chapters)
                for (const verse of chapter.verses) {
                    verse.text = escapeText(verse.text)
                }
        scripturesCache.update((cache) => ({ ...cache, [id]: bible }))
        scriptures.update((list) => ({ ...list, [id]: { id, name } }))
        documentImportBatch.update((batch) => ({ ...batch, bibles: [...batch.bibles, { id, snapshot: recordSnapshot(bible) }] }))
    }
    return "imported"
}

export function undoDocumentImport(): { removed: number; kept: number } {
    const batch = get(documentImportBatch)
    let removed = 0,
        kept = 0
    const songs = batch.songs.filter((record) => {
        if (!get(shows)[record.id]) return false
        if (recordSnapshot(get(showsCache)[record.id]) !== record.snapshot) {
            kept++
            return false
        }
        return true
    })
    if (songs.length) {
        history({ id: "SHOWS", oldData: { data: songs.map((record) => ({ id: record.id })) }, location: { page: "drawer" } })
        removed += songs.length
    }
    for (const record of batch.bibles) {
        if (!get(scriptures)[record.id]) continue
        if (recordSnapshot(get(scripturesCache)[record.id]) !== record.snapshot) {
            kept++
            continue
        }
        scriptures.update((list) => {
            const next = { ...list }
            delete next[record.id]
            return next
        })
        scripturesCache.update((cache) => {
            const next = { ...cache }
            delete next[record.id]
            return next
        })
        removed++
    }
    documentImportBatch.set({ songs: [], bibles: [] })
    return { removed, kept }
}
