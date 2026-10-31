const path = require("node:path")
const { verifyBundle, verifyRuntime } = require("./offlinePackage")
module.exports = async function beforePack(context) {
    const root = context.packager.projectDir
    const arch = require("builder-util").Arch[context.arch]
    await verifyBundle(path.join(root, "resources/bundled"))
    verifyRuntime(path.join(root, "node_modules"), context.electronPlatformName, arch)
}
