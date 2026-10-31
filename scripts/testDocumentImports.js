// Integration check: run after build:electron:dev. Add --ocr to download/cache and test OCR.
const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { fork } = require("node:child_process")
const { ZipFile } = require("yazl")

function pdf(objects) {
    const chunks = [Buffer.from("%PDF-1.4\n")]
    const offsets = [0]
    let size = chunks[0].length
    objects.forEach((object, i) => {
        offsets.push(size)
        const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), Buffer.isBuffer(object) ? object : Buffer.from(object), Buffer.from("\nendobj\n")])
        chunks.push(chunk)
        size += chunk.length
    })
    const xref = size
    chunks.push(
        Buffer.from(
            `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
                .slice(1)
                .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
                .join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
        )
    )
    return Buffer.concat(chunks)
}
function stream(data, dictionary = "") {
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data)
    return Buffer.concat([Buffer.from(`<< /Length ${bytes.length} ${dictionary} >>\nstream\n`), bytes, Buffer.from("\nendstream")])
}
function textPdf() {
    return pdf(["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>", stream("BT /F1 20 Tf 40 740 Td (# First Song) Tj 0 -30 Td (First line of lyrics with enough selectable text for extraction.) Tj ET"), "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"])
}
function scannedPdf() {
    const { createCanvas } = require("@napi-rs/canvas")
    const canvas = createCanvas(1200, 400)
    const ctx = canvas.getContext("2d")
    ctx.fillStyle = "white"
    ctx.fillRect(0, 0, 1200, 400)
    ctx.fillStyle = "black"
    ctx.font = "52px Arial"
    ctx.fillText("# Amazing Grace", 60, 110)
    ctx.fillText("Amazing grace how sweet the sound", 60, 200)
    const image = canvas.toBuffer("image/jpeg")
    return pdf(["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 200] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>", stream("q 600 0 0 200 0 0 cm /Im1 Do Q"), stream(image, "/Type /XObject /Subtype /Image /Width 1200 /Height 400 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode")])
}
async function wordFile(file) {
    const zip = new ZipFile()
    zip.addBuffer(Buffer.from('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'), "[Content_Types].xml")
    zip.addBuffer(Buffer.from('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'), "_rels/.rels")
    zip.addBuffer(Buffer.from('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t># Tamil Song</w:t></w:r></w:p><w:p><w:r><w:t>தமிழ் பாடல் සිංහල ගීතය</w:t></w:r></w:p></w:body></w:document>'), "word/document.xml")
    const chunks = []
    zip.outputStream.on("data", (chunk) => chunks.push(chunk))
    const done = new Promise((resolve, reject) => {
        zip.outputStream.on("end", resolve)
        zip.outputStream.on("error", reject)
    })
    zip.end()
    await done
    await fs.writeFile(file, Buffer.concat(chunks))
}
function extract(files, cachePath, extra = {}, langPath) {
    const worker = fork(path.resolve(__dirname, "../build/electron/data/documents/documentWorker.js"), [], { ...extra })
    worker.send({ files, cachePath, langPath, languages: ["eng", "sin", "tam"] })
    const documents = [],
        errors = []
    let completed = false
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            worker.kill()
            reject(new Error("Document worker timed out"))
        }, 180000)
        worker.on("message", (message) => {
            if (message.type === "document") documents.push(message.document)
            if (message.type === "error" || message.type === "fatal") errors.push(message.error)
            if (message.type === "complete") completed = true
        })
        worker.on("error", (error) => {
            clearTimeout(timer)
            reject(error)
        })
        worker.on("exit", (code) => {
            clearTimeout(timer)
            if (code !== 0 || !completed) reject(new Error(`Worker exited ${code}: ${errors.join("; ")}`))
            else resolve({ documents, errors })
        })
    })
}
async function run() {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "freeshow-import-test-"))
    try {
        const files = ["songs.pdf", "songs.docx", "songs.csv", "broken.pdf"].map((name) => path.join(directory, name))
        await fs.writeFile(files[0], textPdf())
        await wordFile(files[1])
        await fs.writeFile(files[2], 'title,lyrics\n"Song","தமிழ்\nසිංහල"')
        await fs.writeFile(files[3], "Not a PDF")
        const result = await extract(files, path.join(directory, "ocr"))
        assert.equal(result.documents.length, 3)
        assert.equal(new Set(result.documents.map((document) => document.name)).size, 3)
        assert.match(result.documents[0].text, /First line of lyrics/)
        assert.match(result.documents[1].text, /தமிழ் பாடல் සිංහල ගීතය/)
        assert.equal(result.errors.length, 1)
        console.log("PASS: PDF text, DOCX Unicode, multiline CSV, duplicate filenames, and malformed-file isolation")
        if (process.argv.includes("--bundled-ocr")) {
            const file = path.join(directory, "bundled-scan.pdf")
            await fs.writeFile(file, scannedPdf())
            const blocker = path.join(directory, "block-network.cjs")
            await fs.writeFile(blocker, 'global.fetch = async () => { throw new Error("Network disabled by offline bundle test") }; const https = require("node:https"); const http = require("node:http"); https.request = http.request = () => { throw new Error("Network disabled") };')
            const bundled = await extract([file], path.join(directory, "fresh-empty-ocr-cache"), { execArgv: ["--require", blocker] }, path.resolve("resources/bundled/ocr"))
            assert.deepEqual(bundled.errors, [])
            assert.match(bundled.documents[0].text, /Amazing grace how sweet/i)
            console.log("PASS: bundled English/Sinhala/Tamil OCR loads with networking blocked and an empty cache")
        }
        if (process.argv.includes("--ocr")) {
            const file = path.join(directory, "scan.pdf")
            await fs.writeFile(file, scannedPdf())
            const scan = await extract([file], path.join(directory, "ocr"))
            assert.deepEqual(scan.errors, [])
            assert.match(scan.documents[0].text, /Amazing grace how sweet/i)
            assert.match(scan.documents[0].warnings.join(" "), /OCR/)
            // Block network in the document worker and all its nested OCR workers.
            const blocker = path.join(directory, "block-network.cjs")
            await fs.writeFile(blocker, 'global.fetch = async () => { throw new Error("Network disabled by OCR test") }; for (const name of ["node:http", "node:https"]) { const transport = require(name); transport.request = transport.get = () => { throw new Error("Network disabled by OCR test") } }')
            const offline = await extract([file], path.join(directory, "ocr"), { execArgv: ["--require", blocker] })
            assert.deepEqual(offline.errors, [])
            assert.match(offline.documents[0].text, /Amazing grace how sweet/i)
            console.log("PASS: scanned PDF OCR with eng/sin/tam loaded, then cached OCR with network blocked")
            const missing = await extract([file, files[2]], path.join(directory, "empty-ocr-cache"), { execArgv: ["--require", blocker] })
            assert.equal(missing.errors.length, 1)
            assert.match(missing.errors[0], /OCR.*language data/)
            assert.equal(missing.documents.length, 1)
            console.log("PASS: missing offline OCR data reports an actionable error and retains other file imports")
        }
    } finally {
        await fs.rm(directory, { recursive: true, force: true })
    }
}
run().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
