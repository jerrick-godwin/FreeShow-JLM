const path = require("node:path")
const fs = require("node:fs")
const { verifyBundle, verifyRuntime, resourcesPath } = require("./offlinePackage")
module.exports = async function afterPack(context) {
    const resources = resourcesPath(context)
    await verifyBundle(path.join(resources, "bundled"))
    const modules = path.join(resources, fs.existsSync(path.join(resources, "app.asar")) ? "app.asar.unpacked" : "app", "node_modules")
    verifyRuntime(modules, context.electronPlatformName, require("builder-util").Arch[context.arch])
    for (const dependency of ["tesseract.js", "tesseract.js-core"]) {
        if (!fs.existsSync(path.join(modules, dependency))) throw new Error(`Missing packaged OCR engine: ${dependency}`)
    }
    const arch = require("builder-util").Arch[context.arch]
    if (context.electronPlatformName !== process.platform || arch !== process.arch) throw new Error("Verify installers on a native runner for each target platform and architecture")
    const executable = process.platform === "darwin" ? path.join(resources, "..", "MacOS", context.packager.appInfo.productFilename) : path.join(context.appOutDir, context.packager.appInfo.productFilename + (process.platform === "win32" ? ".exe" : ""))
    const smoke = require("node:child_process").spawnSync(executable, ["-e", 'const runtime = require(process.argv[1]); if (typeof runtime.OfflineRecognizer !== "function") process.exit(2)', path.join(modules, "sherpa-onnx-node")], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        encoding: "utf8",
        timeout: 60000
    })
    if (smoke.error || smoke.status !== 0) throw new Error(`Packaged speech runtime could not start: ${smoke.error?.message || smoke.stderr || smoke.status}`)
    console.log("Packaged offline library, speech runtime and OCR engines verified.")
}
