// Build-time only. Installed apps read these assets locally and never run this downloader.
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const path = require("node:path")
const crypto = require("node:crypto")
const { Readable, Transform } = require("node:stream")
const { pipeline } = require("node:stream/promises")
const root = path.join(__dirname, "..", "resources", "bundled")
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"))
async function valid(file, spec) {
    try {
        if ((await fsp.stat(file)).size !== spec.size) return false
        const hash = crypto.createHash("sha256")
        for await (const bytes of fs.createReadStream(file)) hash.update(bytes)
        return hash.digest("hex") === spec.sha256
    } catch {
        return false
    }
}
async function prepare(spec) {
    const target = path.resolve(root, spec.file)
    if (!target.startsWith(root + path.sep)) throw new Error("Invalid bundled resource path")
    if (await valid(target, spec)) return
    if (!spec.url) throw new Error(`Missing or invalid bundled library asset: ${spec.file}. Restore it from the project sources before building.`)
    if (process.argv.includes("--offline")) throw new Error(`Missing or invalid bundled asset: ${spec.file}. Run npm run prepare:bundled with internet access to restore model files.`)
    if (!spec.url.startsWith("https://")) throw new Error("Bundled asset downloads require HTTPS")
    await fsp.mkdir(path.dirname(target), { recursive: true })
    for (let attempt = 0; attempt < 3; attempt++) {
        const temporary = target + "." + crypto.randomUUID() + ".download"
        try {
            console.log(`Preparing bundled asset: ${spec.file}`)
            const response = await fetch(spec.url, { signal: AbortSignal.timeout(600000) })
            if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)
            let size = 0
            const limit = new Transform({
                transform(bytes, _encoding, done) {
                    size += bytes.length
                    done(size > spec.size ? new Error("Unexpected asset size") : null, bytes)
                }
            })
            await pipeline(Readable.fromWeb(response.body), limit, fs.createWriteStream(temporary, { flags: "wx" }))
            if (!(await valid(temporary, spec))) throw new Error(`Checksum mismatch: ${spec.file}`)
            await fsp.rename(temporary, target)
            return
        } catch (error) {
            await fsp.rm(temporary, { force: true })
            if (attempt === 2) throw error
        }
    }
}
Promise.all(manifest.files.map(prepare))
    .then(() => {
        console.log(`Offline bundle verified: ${manifest.library.songbook.records} records, ${manifest.library.bibles.length} Bibles, speech and eng/sin/tam OCR (${Math.round(manifest.files.reduce((sum, file) => sum + file.size, 0) / 1048576)} MiB).`)
    })
    .catch((error) => {
        console.error(error.message)
        process.exitCode = 1
    })
