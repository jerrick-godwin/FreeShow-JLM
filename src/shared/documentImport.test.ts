import { describe, expect, it } from "vitest"
import { bibleFromLines, detectColumns, documentCandidates, parseCSV } from "./documentImport"
import { resolveBookNumber } from "./bibleBooks"

const document = (text: string, extension = "txt", warnings: string[] = []) => ({ name: "Collection", text, extension, warnings })
describe("document imports", () => {
    it("reads quoted Unicode, multiline lyrics, escaped quotes and empty CSV fields", () => {
        expect(parseCSV('\uFEFFtitle,lyrics,author\r\n"தமிழ்","Line 1\nLine ""2""",\r\n')).toEqual([
            ["title", "lyrics", "author"],
            ["தமிழ்", 'Line 1\nLine "2"', ""]
        ])
        expect(() => parseCSV('title,lyrics\na,"unclosed')).toThrow("unclosed")
    })
    it("maps recognized headers and accepts explicit mappings", () => {
        expect(detectColumns(["Song title", "Words"])).toEqual({ title: 0, lyrics: 1 })
        const result = documentCandidates(document('A,B\nTitle,"First\nSecond"', "csv"), "songs", { title: 0, lyrics: 1 })
        expect(result[0]).toMatchObject({ title: "Title", text: "First\nSecond", warnings: [] })
        expect(documentCandidates(document("A,B\nOne,Two", "csv"), "songs")[0].warnings.length).toBeGreaterThan(0)
    })
    it("splits explicit songbooks and retains unassigned opening text", () => {
        const result = documentCandidates(document("Preface\n# First\nVerse one\n\n[Chorus]\nSing again\n# Second\nSecond lyrics"), "songs")
        expect(result).toHaveLength(3)
        expect(result[0].warnings.length).toBeGreaterThan(0)
        expect(result[1]).toMatchObject({ title: "First", text: "Verse one\n\n[Chorus]\nSing again", warnings: [] })
        expect(result[2].title).toBe("Second")
    })
    it("requires review for ambiguous boundaries and all OCR items", () => {
        expect(documentCandidates(document("Title\nSome lyrics"), "songs")[0].warnings.length).toBeGreaterThan(0)
        expect(documentCandidates(document("# Song\nLyrics", "pdf", ["OCR review"]), "songs")[0].warnings).toContain("OCR review")
        expect(documentCandidates(document("1. Heading\nWords"), "songs")[0].warnings.length).toBeGreaterThan(0)
    })
    it("separates CSV Bible translations and preserves consistent metadata", () => {
        const result = documentCandidates(document('book,chapter,verse,text,translation,language,copyright\nPsalms,3,4,"First\nline",Version A,en,Publisher A\nPsalms,3,4,தமிழ்,Version B,ta,Publisher B', "csv"), "bible")
        expect(result.map((item) => item.title)).toEqual(["Version A", "Version B"])
        expect(result[0].bible?.books[0].chapters[0].verses[0].text).toBe("First line")
        expect(result[1].metadata).toEqual({ language: "ta", copyright: "Publisher B" })
        expect(result[0].warnings).toEqual([])
    })
    it("does not invent references or silently accept duplicate Bible verses", () => {
        const result = bibleFromLines("Bible", "John 3:16 First\nJohn 3:16 Second\nUnknown 3:1 Text\nWrapped line\nJohn 3:0 Wrong")
        expect(result.warnings).toHaveLength(4)
        expect(result.bible.books[0].chapters[0].verses).toEqual([{ number: 16, text: "First" }])
    })
    it("converts Bible CSV and multilingual headings/references", () => {
        const csv = documentCandidates(document('book,chapter,verse,text\nPsalms,3,4,"I cried"\nJohn,3,16,"For God"', "csv"), "bible")[0]
        expect(csv.bible?.books.map((b) => b.number)).toEqual([19, 43])
        expect(csv.warnings).toEqual([])
        const result = bibleFromLines("Bible", "சங்கீதம் 3:4 தமிழ்\nගීතාවලිය 3:5 සිංහල\nJohn\nChapter 3\n16 English")
        expect(result.warnings).toEqual([])
        expect(result.bible.books[0].chapters[0].verses).toHaveLength(2)
        expect(resolveBookNumber("1 John")).toBe(62)
        expect(resolveBookNumber("Jo")).toBeUndefined()
    })
})
