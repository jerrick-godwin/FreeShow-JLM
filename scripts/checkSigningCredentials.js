const requiredCredentials = (platform) => [
    "CSC_LINK",
    "CSC_KEY_PASSWORD",
    ...(platform === "darwin" ? ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"] : [])
]
function checkCredentials(platform, env) {
    if (!["darwin", "win32"].includes(platform)) throw new Error("Release signing requires a native Mac or Windows runner")
    const missing = requiredCredentials(platform).filter((key) => !env[key]?.trim())
    if (missing.length) throw new Error(`Release signing credentials missing: ${missing.join(", ")}. See docs/RELEASE_SIGNING.md`)
}
if (require.main === module) {
    try { checkCredentials(process.platform, process.env) }
    catch (error) { console.error(error.message); process.exitCode = 1 }
}
module.exports = { checkCredentials }
