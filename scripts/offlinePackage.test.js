const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const crypto = require("node:crypto")
const { runtimeName, verifyBundle, verifyRuntime, resourcesPath } = require("./offlinePackage")
test("selects platform-specific speech packages and Mac/Windows resource paths", () => {
    assert.equal(runtimeName("win32", "x64"), "sherpa-onnx-win-x64")
    assert.equal(runtimeName("darwin", "arm64"), "sherpa-onnx-darwin-arm64")
    const context = { appOutDir: "/build", packager: { appInfo: { productFilename: "Jesus Lives Ministry" } } }
    assert.equal(resourcesPath({ ...context, electronPlatformName: "darwin" }), path.join("/build", "Jesus Lives Ministry.app/Contents/Resources"))
    assert.equal(resourcesPath({ ...context, electronPlatformName: "win32" }), path.join("/build", "resources"))
})
test("rejects a missing native addon or dependent library on both platforms", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jlm-runtime-"))
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))
    fs.mkdirSync(path.join(root, "sherpa-onnx-node"))
    fs.writeFileSync(path.join(root, "sherpa-onnx-node/package.json"), "{}")
    for (const [platform, arch, extension] of [
        ["darwin", "arm64", "dylib"],
        ["win32", "x64", "dll"]
    ]) {
        const dir = path.join(root, runtimeName(platform, arch))
        fs.mkdirSync(dir)
        assert.throws(() => verifyRuntime(root, platform, arch), /Missing native speech addon/)
        fs.writeFileSync(path.join(dir, "sherpa-onnx.node"), "fixture")
        assert.throws(() => verifyRuntime(root, platform, arch), /Missing native speech libraries/)
        fs.writeFileSync(path.join(dir, `runtime.${extension}`), "fixture")
        verifyRuntime(root, platform, arch)
    }
})
test("verifies every bundled file and rejects corruption, absent models and languages", async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jlm-bundle-"))
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))
    const names = ["songbook.json", ...["en", "si", "ta"].map((l) => `bibles/${l}.json`), ...["eng", "sin", "tam"].map((l) => `ocr/${l}.traineddata.gz`), "models/whisper/small-encoder.int8.onnx", "models/whisper/small-decoder.int8.onnx", "models/whisper/small-tokens.txt"]
    const files = names.map((file) => ({ file, size: 7, sha256: crypto.createHash("sha256").update("fixture").digest("hex") }))
    for (const file of names) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
        fs.writeFileSync(path.join(root, file), "fixture")
    }
    const manifest = { files, library: { songbook: { records: 935, file: "songbook.json" }, bibles: ["en", "si", "ta"].map((language) => ({ language, file: `bibles/${language}.json` })) } }
    const save = () => fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest))
    save()
    await verifyBundle(root)
    fs.writeFileSync(path.join(root, names[0]), "corrupt")
    await assert.rejects(verifyBundle(root), /checksum mismatch/)
    fs.writeFileSync(path.join(root, names[0]), "fixture")
    manifest.files = files.filter((spec) => !spec.file.includes("encoder"))
    save()
    await assert.rejects(verifyBundle(root), /Missing offline manifest entry/)
    manifest.files = files
    manifest.library.bibles.pop()
    save()
    await assert.rejects(verifyBundle(root), /English, Sinhala, Tamil/)
})
