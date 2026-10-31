const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")

function runtimeName(platform, arch) {
    return `sherpa-onnx-${platform === "win32" ? "win" : platform}-${arch}`
}
async function verifyBundle(root) {
    const manifest = JSON.parse(await fs.promises.readFile(path.join(root, "manifest.json"), "utf8"))
    if (manifest.library.songbook.records < 1 || !["en", "si", "ta"].every((language) => manifest.library.bibles.some((bible) => bible.language === language))) throw new Error("Offline library must include the songbook and English, Sinhala, Tamil Bibles")
    const files = new Set(manifest.files.map((spec) => spec.file))
    for (const required of [manifest.library.songbook.file, ...manifest.library.bibles.map((bible) => bible.file), ...["eng", "sin", "tam"].map((lang) => `ocr/${lang}.traineddata.gz`), "models/whisper/small-encoder.int8.onnx", "models/whisper/small-decoder.int8.onnx", "models/whisper/small-tokens.txt"]) {
        if (!files.has(required)) throw new Error(`Missing offline manifest entry: ${required}`)
    }
    await Promise.all(
        manifest.files.map(async (spec) => {
            const file = path.resolve(root, spec.file)
            if (!file.startsWith(path.resolve(root) + path.sep)) throw new Error("Invalid offline asset path")
            if ((await fs.promises.stat(file)).size !== spec.size) throw new Error(`Offline asset size mismatch: ${spec.file}`)
            const hash = crypto.createHash("sha256")
            for await (const bytes of fs.createReadStream(file)) hash.update(bytes)
            if (hash.digest("hex") !== spec.sha256) throw new Error(`Offline asset checksum mismatch: ${spec.file}`)
        })
    )
}
function verifyRuntime(modules, platform, arch) {
    const name = runtimeName(platform, arch)
    const root = path.join(modules, name)
    const entries = fs.readdirSync(root)
    if (!entries.includes("sherpa-onnx.node")) throw new Error(`Missing native speech addon: ${name}`)
    if (["darwin", "win32"].includes(platform) && !entries.some((file) => file.endsWith(platform === "darwin" ? ".dylib" : ".dll"))) throw new Error(`Missing native speech libraries: ${name}`)
    if (!fs.existsSync(path.join(modules, "sherpa-onnx-node", "package.json"))) throw new Error("Missing speech runtime wrapper")
}
function resourcesPath(context) {
    return context.electronPlatformName === "darwin" ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources") : path.join(context.appOutDir, "resources")
}
module.exports = { runtimeName, verifyBundle, verifyRuntime, resourcesPath }
