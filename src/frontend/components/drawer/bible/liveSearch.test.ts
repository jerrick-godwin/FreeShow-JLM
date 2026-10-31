import { describe, expect, it } from "vitest"
import type { Bible } from "../../../../types/Bible"
import { searchLocalBible } from "./liveSearch"

const bible: Bible = {
    name: "Test",
    books: [
        {
            number: 19,
            name: "Psalms",
            abbreviation: "Ps",
            chapters: [
                {
                    number: 3,
                    verses: [
                        { number: 4, text: "I cried unto the Lord" },
                        { number: 5, text: "I slept" }
                    ]
                }
            ]
        },
        { number: 43, name: "John", chapters: [{ number: 3, verses: [{ number: 16, text: "தமிழ் வசனம் සිංහල වචනය" }] }] }
    ]
}
describe("live Bible lookup", () => {
    it("looks up aliases, local names, ranges, chapters and Tamil digits", () => {
        for (const name of ["Psalms", "Psalm", "Ps", "சங்கீதம்", "ගීතාවලිය"]) expect(searchLocalBible(bible, `${name} 3:4`).verses[0].verse.number).toBe(4)
        expect(searchLocalBible(bible, "Ps. 3.4").verses[0].verse.number).toBe(4)
        expect(searchLocalBible(bible, "Psalms 3:4-5").verses).toHaveLength(2)
        expect(searchLocalBible(bible, "Psalms 3").verses).toHaveLength(2)
        expect(searchLocalBible(bible, "சங்கீதம் ௩:௪").verses).toHaveLength(1)
        expect(searchLocalBible(bible, "Custom 3:4", ["Custom"]).verses).toHaveLength(1)
    })
    it("retains multi-chapter selections and chapter ranges", () => {
        const extended = structuredClone(bible)
        extended.books[0].chapters.push({ number: 4, verses: [{ number: 1, text: "Next chapter" }] })
        expect(searchLocalBible(extended, "Psalms 3:4;4:1").verses.map((result) => result.chapter)).toEqual([3, 4])
        expect(searchLocalBible(extended, "Psalms 3-4").verses).toHaveLength(3)
        expect(searchLocalBible(extended, "Psalms 3:4;4:1;4:1").verses).toHaveLength(2)
        expect(searchLocalBible(extended, "Psalms 4-3").kind).toBe("invalid")
    })
    it("suggests books, finds literal text in all three languages, and never changes source data", () => {
        const before = JSON.stringify(bible)
        expect(searchLocalBible(bible, "Psa").books[0].number).toBe(19)
        for (const query of ["cried unto", "தமிழ்", "සිංහල"]) expect(searchLocalBible(bible, query).verses).toHaveLength(1)
        expect(JSON.stringify(bible)).toBe(before)
    })
    it("rejects invalid references and bounds text result counts", () => {
        for (const query of ["Psalms 999:4", "Psalms 3:0", "Psalms 3:5-4", "Psalms 3:4-999"]) expect(searchLocalBible(bible, query).kind).toBe("invalid")
        expect(searchLocalBible(bible, "missing phrase").verses).toEqual([])
        expect(searchLocalBible(bible, "I ", [], 1).verses).toHaveLength(0)
        expect(searchLocalBible(bible, "I cried", [], 1).verses).toHaveLength(1)
    })
})
