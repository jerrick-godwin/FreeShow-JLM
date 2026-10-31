import fs from "fs"
import path from "path"
import { createHash } from "crypto"
import type { Bible } from "../../types/Bible"
import type { Show } from "../../types/Show"
import type { BibleCategories, Category } from "../../types/Tabs"

type NativeSong = [string, Show]
interface LibraryManifest {
    version: string
    library: { songbook: { file: string; sha256: string }; bibles: { file: string; sha256: string; language: string }[] }
}
export interface LibrarySettings {
    scriptures: Record<string, BibleCategories>
    categories: Record<string, Category>
}
function readVerified<T>(root: string, file: { file: string; sha256: string }): T {
    const data = fs.readFileSync(path.join(root, file.file))
    if (createHash("sha256").update(data).digest("hex") !== file.sha256) throw new Error(`Bundled library checksum failed: ${file.file}`)
    return JSON.parse(data.toString("utf8")) as T
}
function readJSON<T>(file: string, fallback: T): T {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8")) as T
    } catch {
        return fallback
    }
}
function writeNew(file: string, content: unknown) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    try {
        fs.writeFileSync(file, JSON.stringify(content), { flag: "wx" })
        return true
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") return false
        throw error
    }
}
export function installLibrary(bundle: string, destination: string, settings: LibrarySettings) {
    const manifest = readJSON<LibraryManifest | null>(path.join(bundle, "manifest.json"), null)
    if (!manifest) return { settings, songs: 0, bibles: 0, changed: false }
    const markerFile = path.join(destination, "Config", "bundled-library.json")
    const marker = readJSON<{ versions: string[] }>(markerFile, { versions: [] })
    if (marker.versions.includes(manifest.version)) return { settings, songs: 0, bibles: 0, changed: false }
    // Validate every source before creating any library files.
    const songs = readVerified<NativeSong[]>(bundle, manifest.library.songbook)
    const bibles = manifest.library.bibles.map((entry) => ({ entry, native: readVerified<[string, Bible]>(bundle, entry) }))
    if (new Set(songs.map(([id]) => id)).size !== songs.length) throw new Error("Bundled songs have duplicate identifiers")
    const next = structuredClone(settings)
    const existingIds = new Set<string>()
    const existingNames = new Set<string>()
    const showFolder = path.join(destination, "Shows")
    if (fs.existsSync(showFolder))
        for (const filename of fs.readdirSync(showFolder)) {
            if (!filename.toLowerCase().endsWith(".show")) continue
            existingNames.add(filename.normalize("NFC").toLocaleLowerCase())
            const native = readJSON<NativeSong | null>(path.join(showFolder, filename), null)
            if (native?.[0]) existingIds.add(native[0])
        }
    let songCount = 0,
        bibleCount = 0
    for (const [id, show] of songs) {
        if (!id || !show.name || !show.slides || !show.layouts || path.basename(show.name) !== show.name || /[\\/:*?"<>|]/.test(show.name)) throw new Error("Invalid bundled song")
        if (existingIds.has(id) || existingNames.has(`${show.name}.show`.normalize("NFC").toLocaleLowerCase())) continue
        if (writeNew(path.join(destination, "Shows", `${show.name}.show`), [id, show])) {
            songCount++
            existingIds.add(id)
            existingNames.add(`${show.name}.show`.normalize("NFC").toLocaleLowerCase())
        }
    }
    const versions: string[] = []
    for (const {
        entry,
        native: [id, bible]
    } of bibles) {
        if (!id || !bible.name || bible.books?.length !== 66 || path.basename(bible.name) !== bible.name) throw new Error("Invalid bundled Bible")
        const file = path.join(destination, "Bibles", `${bible.name}.fsb`)
        if (writeNew(file, [id, bible])) bibleCount++
        const existing = readJSON<[string, Bible] | null>(file, null)
        const actualId = existing?.[0]
        if (!actualId || !existing?.[1]?.books?.length) continue
        // Existing records and filenames always win, including edited translations.
        if (next.scriptures[actualId] && next.scriptures[actualId].name !== bible.name) continue
        if (!next.scriptures[actualId]) next.scriptures[actualId] = { id: actualId, name: bible.name, api: false, favorite: true, metadata: { ...bible.metadata, language: entry.language }, copyright: bible.copyright }
        versions.push(actualId)
    }
    if (!next.categories["jl-songbook"]) next.categories["jl-songbook"] = { name: "Church Songbook", icon: "song" }
    if (versions.length === 3 && !next.scriptures["jl-trilingual"]) next.scriptures["jl-trilingual"] = { name: "Trilingual Bible · English / Sinhala / Tamil", favorite: true, collection: { versions, previewIndex: 0 } }
    // The caller saves settings before committing this marker, so interrupted installs can retry.
    return {
        settings: next,
        songs: songCount,
        bibles: bibleCount,
        changed: true,
        commit: () => {
            fs.mkdirSync(path.dirname(markerFile), { recursive: true })
            const temp = markerFile + ".tmp"
            fs.writeFileSync(temp, JSON.stringify({ versions: [...new Set([...marker.versions, manifest.version])] }))
            fs.renameSync(temp, markerFile)
        }
    }
}
