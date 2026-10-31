import { describe, expect, it } from "vitest"
import { LiveIndex, lyricSlideText, liveTokens, songPositions, spokenReference } from "./matching"
import type { LiveDocument } from "../../../types/ai/Live"
const song: LiveDocument = {
    id: "song:grace",
    kind: "song",
    label: "Amazing Grace",
    aliases: ["Grace Hymn"],
    positions: [
        { id: "first", index: 0, text: "Amazing grace how sweet the sound" },
        { id: "second", index: 1, text: "That saved a wretch like me" }
    ]
}
it("keeps line boundaries while joining styled spans inside a word", () => {
    const text = lyricSlideText({
        items: [
            {
                style: "",
                lines: [
                    {
                        align: "",
                        text: [
                            { value: "Ama", style: "" },
                            { value: "zing grace", style: "" }
                        ]
                    },
                    { align: "", text: [{ value: "how sweet the sound", style: "" }] }
                ]
            }
        ]
    })
    expect(liveTokens(text)).toEqual(["amazing", "grace", "how", "sweet", "the", "sound"])
})
describe("live matching", () => {
    it("finds titles and lyric phrases without treating a short generic word as a title", () => {
        const index = new LiveIndex()
        index.add(song)
        expect(index.titles("Let us sing Amazing Grace")[0].id).toBe(song.id)
        expect(index.match("that saved a wretch like me")[0].position.id).toBe("second")
        expect(index.match("grace")).toEqual([])
        expect(index.match("Please open the door and turn on the lights")).toEqual([])
    })
    it("preserves Tamil and Sinhala combining marks and matches their words", () => {
        const index = new LiveIndex()
        for (const text of ["தேவன் உலகத்தில் மிகவும் அன்பு கூர்ந்தார்", "දෙවියන් වහන්සේ ලෝකයට ප්‍රේම කළ සේක"]) {
            index.add({ ...song, id: text, label: text, positions: [{ id: "verse", index: 0, text }] })
            expect(index.match(text)[0].document.id).toBe(text)
            expect(liveTokens(text).join(" ")).toBe(text.normalize("NFC"))
        }
    })
    it("replaces and removes index entries without leaving stale lyrics", () => {
        const index = new LiveIndex()
        index.add(song)
        index.add({ ...song, positions: [{ id: "new", index: 0, text: "New words for a different song" }] })
        expect(index.match("that saved a wretch like me")).toEqual([])
        index.remove(song.id)
        expect(index.match("New words for a different song")).toEqual([])
    })
    it("parses explicit references in English, Sinhala, and Tamil and never invents a verse from a chapter", () => {
        const books = [
            { number: 19, name: "Psalms" },
            { number: 43, name: "John" }
        ]
        for (const text of ["Psalms 3:4", "Psalm chapter three verse four", "சங்கீதம் 3:4", "ගීතාවලිය 3:4"]) expect(spokenReference(text, books)).toEqual({ book: 19, chapter: 3, verse: 4 })
        expect(spokenReference("John chapter 3", books)).toBeNull()
        expect(spokenReference("Read something about love", books)).toBeNull()
    })
})

it("keeps repeated choruses and disabled slides at their presentation indexes without mutating the song", () => {
    const show: any = {
        layouts: { main: { slides: [{ id: "verse", children: { child: { disabled: true } } }, { id: "chorus" }, { id: "chorus" }] } },
        slides: {
            verse: { children: ["child"], items: [{ lines: [{ text: [{ value: "Verse words" }] }] }] },
            child: { items: [{ lines: [{ text: [{ value: "Hidden words" }] }] }] },
            chorus: { items: [{ lines: [{ text: [{ value: "Chorus words" }] }] }] }
        }
    }
    const before = JSON.stringify(show)
    expect(songPositions(show, "main").map(({ id, index }) => ({ id, index }))).toEqual([
        { id: "verse:0", index: 0 },
        { id: "chorus:2", index: 2 },
        { id: "chorus:3", index: 3 }
    ])
    expect(JSON.stringify(show)).toBe(before)
})
