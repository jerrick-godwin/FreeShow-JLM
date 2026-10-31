import type { Bible } from "../types/Bible"
import type { ExtractedDocument, ImportCandidate, ImportColumns, ImportTarget } from "../types/DocumentImport"
import { englishBooks, normalizeBibleSearch, resolveBookNumber } from "./bibleBooks"

// RFC 4180 fields, including empty fields, escaped quotes and embedded newlines.
export function parseCSV(text: string): string[][] {
    const rows: string[][] = []
    let row: string[] = [],
        field = "",
        quoted = false
    text = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")
    for (let i = 0; i < text.length; i++) {
        const char = text[i]
        if (char === '"') {
            if (quoted && text[i + 1] === '"') {
                field += '"'
                i++
            } else if (quoted || !field) quoted = !quoted
            else throw new Error("Unexpected quote in CSV. Quote the entire field.")
        } else if (char === "," && !quoted) {
            row.push(field)
            field = ""
        } else if (char === "\n" && !quoted) {
            row.push(field)
            if (row.some((v) => v.trim())) rows.push(row)
            row = []
            field = ""
        } else field += char
    }
    if (quoted) throw new Error("CSV contains an unclosed quoted field.")
    row.push(field)
    if (row.some((v) => v.trim())) rows.push(row)
    return rows
}

export function detectColumns(header: string[]): ImportColumns {
    const aliases: Record<keyof ImportColumns, string[]> = {
        title: ["title", "song", "song title", "name"],
        lyrics: ["lyrics", "song lyrics", "words"],
        book: ["book", "book name", "book number"],
        chapter: ["chapter"],
        verse: ["verse", "verse number"],
        text: ["text", "verse text"]
    }
    const columns: ImportColumns = {}
    for (const [key, names] of Object.entries(aliases)) {
        const index = header.findIndex((h) => names.includes(normalizeBibleSearch(h)))
        if (index >= 0) columns[key as keyof ImportColumns] = index
    }
    return columns
}

export function bibleFromLines(title: string, text: string): { bible: Bible; warnings: string[] } {
    const bible: Bible = { name: title, books: [] }
    const warnings: string[] = []
    let book: number | undefined, chapter: number | undefined
    const chapterCounts = [50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150, 31, 12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4, 28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1, 1, 1, 22]
    const add = (bookNumber: number, chapterNumber: number, verseNumber: number, value: string, line: number) => {
        if (![bookNumber, chapterNumber, verseNumber].every((n) => Number.isSafeInteger(n) && n > 0) || chapterNumber > (chapterCounts[bookNumber - 1] || 200) || verseNumber > 200 || !value.trim()) {
            warnings.push(`Line ${line}: invalid reference or empty verse.`)
            return
        }
        let b = bible.books.find((item) => item.number === bookNumber)
        if (!b) {
            b = { number: bookNumber, name: englishBooks[bookNumber - 1], chapters: [] }
            bible.books.push(b)
        }
        let c = b.chapters.find((item) => item.number === chapterNumber)
        if (!c) {
            c = { number: chapterNumber, verses: [] }
            b.chapters.push(c)
        }
        if (c.verses.some((item) => item.number === verseNumber)) {
            warnings.push(`Line ${line}: duplicate verse ${b.name} ${chapterNumber}:${verseNumber}.`)
            return
        }
        c.verses.push({ number: verseNumber, text: value.trim() })
    }
    text.replace(/\r\n?/g, "\n")
        .split("\n")
        .forEach((raw, index) => {
            const value = raw.trim().replace(/[௦-௯]/g, (digit) => String(digit.charCodeAt(0) - 0x0be6))
            if (!value) return
            const explicit = value.match(/^(.+?)\s+(\d+)\s*[:.]\s*(\d+)\s+(.+)$/u)
            if (explicit) {
                const number = resolveBookNumber(explicit[1])
                if (!number) {
                    warnings.push(`Line ${index + 1}: unknown book “${explicit[1]}”.`)
                    return
                }
                book = number
                chapter = Number(explicit[2])
                add(book, chapter, Number(explicit[3]), raw.trim().slice(raw.trim().length - explicit[4].length), index + 1)
                return
            }
            const heading = resolveBookNumber(value)
            if (heading) {
                book = heading
                chapter = undefined
                return
            }
            const chapterHeading = value.match(/^(?:chapter|அதிகாரம்|පරිච්ඡේදය)\s+(\d+)$/iu)
            if (chapterHeading && book) {
                chapter = Number(chapterHeading[1])
                return
            }
            const verseLine = value.match(/^(\d+)[.)]?\s+(.+)$/u)
            if (verseLine && book && chapter) {
                add(book, chapter, Number(verseLine[1]), raw.trim().slice(raw.trim().length - verseLine[2].length), index + 1)
                return
            }
            // Wrapped lines and page headings are intentionally reviewed rather than guessed.
            warnings.push(`Line ${index + 1}: add a book/chapter/verse reference or remove this line.`)
        })
    bible.books.sort((a, b) => a.number - b.number).forEach((b) => b.chapters.sort((a, c) => a.number - c.number).forEach((c) => c.verses.sort((a, v) => a.number - v.number)))
    if (!bible.books.length) warnings.push("No verses found. Use one verse per line: John 3:16 Verse text")
    return { bible, warnings }
}

export function bibleToLines(bible: Bible): string {
    return bible.books.flatMap((b) => b.chapters.flatMap((c) => c.verses.map((v) => `${b.name} ${c.number}:${v.number} ${v.text}`))).join("\n")
}

export function documentCandidates(document: ExtractedDocument, target: ImportTarget, mapping?: ImportColumns): ImportCandidate[] {
    const base = { source: document.name, warnings: [...document.warnings] }
    const candidate = (title: string, text: string, i = 0): ImportCandidate => ({ ...base, warnings: [...base.warnings], id: `${document.name}:${i}`, title, text })
    if (document.extension === "csv") {
        const rows = parseCSV(document.text)
        if (!rows.length) return []
        const columns = mapping || detectColumns(rows[0])
        const required: (keyof ImportColumns)[] = target === "songs" ? ["title", "lyrics"] : ["book", "chapter", "verse", "text"]
        if (required.some((key) => columns[key] === undefined)) {
            const item = candidate(document.name, document.text)
            item.warnings.push("Map the CSV columns before importing.")
            return [item]
        }
        if (target === "songs")
            return rows.slice(1).map((row, i) => {
                const item = candidate(row[columns.title!] || "", row[columns.lyrics!] || "", i)
                if (!item.title.trim() || !item.text.trim()) item.warnings.push(`Row ${i + 2}: title and lyrics are required.`)
                item.metadata = Object.fromEntries(rows[0].flatMap((header, index) => (index !== columns.title && index !== columns.lyrics && row[index]?.trim() ? [[header.trim(), row[index].trim()]] : [])))
                return item
            })
        const headers = rows[0].map(normalizeBibleSearch)
        const versionIndex = headers.findIndex((header) => ["translation", "version", "bible", "translation name"].includes(header))
        const versions = new Map<string, string[][]>()
        for (const row of rows.slice(1)) {
            const title = versionIndex >= 0 ? row[versionIndex]?.trim() || document.name : document.name
            const translationRows = versions.get(title) || []
            translationRows.push(row)
            versions.set(title, translationRows)
        }
        return [...versions].map(([title, verses], i) => {
            const lines = verses.map((row) => `${row[columns.book!] || ""} ${row[columns.chapter!] || ""}:${row[columns.verse!] || ""} ${(row[columns.text!] || "").replace(/\s*\r?\n\s*/g, " ")}`).join("\n")
            const parsed = bibleFromLines(title, lines)
            const item = { ...candidate(title, lines, i), bible: parsed.bible, warnings: [...base.warnings, ...parsed.warnings], metadata: {} as Record<string, string> }
            for (const key of ["language", "copyright"]) {
                const index = headers.indexOf(key)
                const values = index >= 0 ? [...new Set(verses.map((row) => row[index]?.trim()).filter(Boolean))] : []
                if (values.length === 1) item.metadata[key] = values[0]!
                else if (values.length > 1) item.warnings.push(`Conflicting ${key} metadata was omitted. Review this translation.`)
            }
            return item
        })
    }
    if (target === "bible") {
        const parsed = bibleFromLines(document.name, document.text)
        return [{ ...candidate(document.name, document.text), bible: parsed.bible, warnings: [...base.warnings, ...parsed.warnings] }]
    }
    // Explicit song headings avoid mistaking verse/chorus headings for a new song.
    const lines = document.text.replace(/\r\n?/g, "\n").split("\n")
    const headings = lines.flatMap((line, i) => (/^(?:#\s+|(?:song|பாடல்|ගීතිකාව)\s+\d+[.):-]?\s*|\d+[.)]\s+\p{L})/iu.test(line.trim()) ? [i] : []))
    if (!headings.length) {
        const item = candidate(document.name, document.text)
        item.warnings.push("Confirm the title and lyrics, or insert # Song title headings to separate this songbook.")
        return [item]
    }
    const candidates = headings.map((start, i) => {
        const title = lines[start].replace(/^(?:#\s+|(?:song|பாடல்|ගීතිකාව)\s+\d+[.):-]?\s*|\d+[.)]\s+)/iu, "").trim()
        const item = candidate(
            title,
            lines
                .slice(start + 1, headings[i + 1] ?? lines.length)
                .join("\n")
                .trim(),
            i
        )
        if (!title || !item.text) item.warnings.push("A title and lyrics are required.")
        // Numbered headings may actually be stanzas; only explicit Markdown headings auto-import.
        if (!lines[start].trim().startsWith("# ")) item.warnings.push("Confirm this detected song boundary.")
        return item
    })
    if (lines.slice(0, headings[0]).some((line) => line.trim())) {
        const preamble = candidate(`${document.name} — opening text`, lines.slice(0, headings[0]).join("\n"), -1)
        preamble.warnings.push("Unassigned opening text: confirm or skip.")
        candidates.unshift(preamble)
    }
    return candidates
}
