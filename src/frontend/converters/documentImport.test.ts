import { beforeEach, describe, expect, it, vi } from "vitest"
import { get, writable } from "svelte/store"

vi.mock("../stores", () => ({
    scriptures: writable({}),
    scripturesCache: writable({}),
    shows: writable({}),
    showsCache: writable({}),
    textCache: writable({}),
    drawerTabsData: writable({ shows: { activeSubTab: "all" } })
}))
vi.mock("./txt", () => ({ convertText: ({ name, text }: { name: string; text: string }) => ({ id: `song-${name}`, show: { name, settings: {}, meta: {}, slides: { first: { globalGroup: "verse", group: "verse", color: null, items: [{ lines: [{ text: [{ value: text }] }] }] } } } }) }))
vi.mock("../components/helpers/show", () => ({ formatToFileName: (value: string) => value.replace(/[/\\]/g, "_") }))
vi.mock("../components/helpers/history", () => ({
    history: (event: any) => {
        if (event.newData)
            for (const { id, show } of event.newData.data) {
                stores.shows.update((value) => ({ ...value, [id]: { name: show.name } }))
                stores.showsCache.update((value) => ({ ...value, [id]: show }))
            }
        else
            for (const { id } of event.oldData.data) {
                stores.shows.update((value) => {
                    const next = { ...value }
                    delete next[id]
                    return next
                })
                stores.showsCache.update((value) => {
                    const next = { ...value }
                    delete next[id]
                    return next
                })
            }
    }
}))
import * as stores from "../stores"
import { candidateDuplicate, documentImportBatch, importDocumentCandidate, undoDocumentImport } from "./documentImport"
const candidate = (title = "Song", text = "Lyrics") => ({ id: title, title, text, source: "Book", warnings: [] })
beforeEach(() => {
    stores.scriptures.set({})
    stores.scripturesCache.set({})
    stores.shows.set({})
    stores.showsCache.set({})
    stores.textCache.set({})
    documentImportBatch.set({ songs: [], bibles: [] })
})
describe("document import persistence", () => {
    it("adds native songs, preserves metadata, and skips matching titles or content", () => {
        const item = { ...candidate(), metadata: { author: "Author" } }
        expect(importDocumentCandidate(item, "songs")).toBe("imported")
        expect(get(stores.showsCache)["song-Song"].meta).toMatchObject({ author: "Author", songbook: "Book" })
        expect(importDocumentCandidate(item, "songs")).toBe("duplicate")
        expect(candidateDuplicate(candidate("Another title"), "songs")).toBe(true)
    })
    it("does not mistake global group formatting or render caches for user edits", () => {
        importDocumentCandidate(candidate("Formatted"), "songs")
        stores.showsCache.update((value) => {
            const slide = value["song-Formatted"].slides.first
            slide.group = "Verse"
            slide.color = "#5825f5"
            slide.items[0].autoFontSize = 90
            value["song-Formatted"].timestamps = { created: 0, modified: 5, used: 10 }
            return value
        })
        expect(undoDocumentImport()).toEqual({ removed: 1, kept: 0 })
    })
    it("imports native Bibles and rejects unresolved references before persistence", () => {
        expect(() => importDocumentCandidate(candidate("Bible", "Missing reference"), "bible")).toThrow("Line 1")
        expect(Object.keys(get(stores.scriptures))).toHaveLength(0)
        expect(importDocumentCandidate(candidate("Bible", "John 3:16 Verse words"), "bible")).toBe("imported")
        expect(Object.values(get(stores.scripturesCache))[0].books[0].chapters[0].verses[0].number).toBe(16)
        expect(importDocumentCandidate(candidate("Bible", "John 3:16 Verse words"), "bible")).toBe("duplicate")
    })
    it("stores document verse markup as literal text", () => {
        importDocumentCandidate(candidate("Plain text Bible", "John 3:16 <img src=x onerror=alert(1)> & words"), "bible")
        expect(Object.values(get(stores.scripturesCache))[0].books[0].chapters[0].verses[0].text).toBe("&lt;img src=x onerror=alert(1)&gt; &amp; words")
    })
    it("undo removes only newly imported records and retains edits", () => {
        importDocumentCandidate(candidate("One", "First"), "songs")
        importDocumentCandidate(candidate("Two", "Second"), "songs")
        importDocumentCandidate(candidate("Bible", "Psalms 3:4 Words"), "bible")
        stores.showsCache.update((value) => {
            value["song-Two"].name = "Edited"
            return value
        })
        expect(undoDocumentImport()).toEqual({ removed: 2, kept: 1 })
        expect(Object.keys(get(stores.shows))).toEqual(["song-Two"])
        expect(Object.keys(get(stores.scriptures))).toEqual([])
        expect(Object.keys(get(stores.scripturesCache))).toEqual([])
    })
})
