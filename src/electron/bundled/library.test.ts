import { afterEach, describe, expect, it } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"
import { createHash } from "crypto"
import { installLibrary } from "./library"
const temporary: string[] = []
function directory() {
    const value = fs.mkdtempSync(path.join(os.tmpdir(), "freeshow-bundle-test-"))
    temporary.push(value)
    return value
}
afterEach(() => temporary.splice(0).forEach((folder) => fs.rmSync(folder, { recursive: true, force: true })))
const settings = () => ({ scriptures: {}, categories: {} })
function fixture() {
    const bundle = directory(),
        destination = directory()
    const write = (file: string, data: unknown) => {
        const json = JSON.stringify(data)
        fs.writeFileSync(path.join(bundle, file), json)
        return { file, sha256: createHash("sha256").update(json).digest("hex") }
    }
    const songbook = write("songs.json", [["one", { name: "First song", slides: { one: { items: [] } }, layouts: { layout: { slides: [] } } }]])
    const bibles = ["en", "si", "ta"].map((language) => ({ ...write(language + ".json", [language, { name: language, books: Array.from({ length: 66 }, (_, i) => ({ number: i + 1, name: String(i + 1), chapters: [] })) }]), language }))
    fs.writeFileSync(path.join(bundle, "manifest.json"), JSON.stringify({ version: "one", library: { songbook, bibles } }))
    return { bundle, destination }
}
describe("bundled library installation", () => {
    it("installs offline native records and a trilingual collection, then keeps operator deletions", () => {
        const { bundle, destination } = fixture()
        const first = installLibrary(bundle, destination, settings())
        expect(first.songs).toBe(1)
        expect(first.bibles).toBe(3)
        expect(first.settings.scriptures["jl-trilingual"].collection?.versions).toEqual(["en", "si", "ta"])
        first.commit?.()
        fs.unlinkSync(path.join(destination, "Shows", "First song.show"))
        expect(installLibrary(bundle, destination, first.settings).changed).toBe(false)
        expect(fs.existsSync(path.join(destination, "Shows", "First song.show"))).toBe(false)
    })
    it("preserves existing content and IDs, and can retry an interrupted install", () => {
        const { bundle, destination } = fixture()
        fs.mkdirSync(path.join(destination, "Shows"))
        fs.writeFileSync(path.join(destination, "Shows", "Renamed song.show"), JSON.stringify(["one", { name: "Renamed song", text: "operator edit" }]))
        const first = installLibrary(bundle, destination, settings())
        expect(first.songs).toBe(0)
        expect(fs.readdirSync(path.join(destination, "Shows"))).toEqual(["Renamed song.show"])
        expect(installLibrary(bundle, destination, first.settings).bibles).toBe(0)
        expect(fs.readFileSync(path.join(destination, "Shows", "Renamed song.show"), "utf8")).toContain("operator edit")
    })
    it("checks all source checksums before adding content", () => {
        const { bundle, destination } = fixture()
        fs.writeFileSync(path.join(bundle, "ta.json"), "corrupt")
        expect(() => installLibrary(bundle, destination, settings())).toThrow("checksum")
        expect(fs.existsSync(path.join(destination, "Shows"))).toBe(false)
    })
    it("validates the real supplied library, unique IDs, Unicode text and complete Bible books", () => {
        const bundle = path.resolve("resources/bundled")
        const manifest = JSON.parse(fs.readFileSync(path.join(bundle, "manifest.json"), "utf8"))
        const songs = JSON.parse(fs.readFileSync(path.join(bundle, "songbook.json"), "utf8"))
        expect(songs).toHaveLength(935)
        expect(new Set(songs.map(([id]: [string]) => id)).size).toBe(935)
        expect(JSON.stringify(songs)).toMatch(/தமிழ்|கர்த்தர்|இயேசு/)
        expect(JSON.stringify(songs)).toMatch(/ස්වාමි|දෙවි|යේසු/)
        for (const asset of [manifest.library.songbook, ...manifest.library.bibles]) {
            const bytes = fs.readFileSync(path.join(bundle, asset.file))
            expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256)
        }
        for (const language of ["en", "si", "ta"]) {
            const [, bible] = JSON.parse(fs.readFileSync(path.join(bundle, "bibles", language + ".json"), "utf8"))
            expect(bible.books).toHaveLength(66)
            expect(bible.books.reduce((sum: number, book: any) => sum + book.chapters.length, 0)).toBe(1189)
            expect(bible.books.map((book: any) => book.number)).toEqual(Array.from({ length: 66 }, (_, index) => index + 1))
        }
    })
})
