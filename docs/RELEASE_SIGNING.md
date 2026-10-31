# Trusted installer setup and release checklist

## Current status

v1.0.0 was published unsigned. Its Mac app does not have a valid distribution signature or notarization ticket. A passing build and matching checksums do not establish OS trust. Do not describe v1.0.0 as a production-ready signed release. Do not overwrite its tag or silently replace its installers; publish a new patch version after signing and acceptance checks pass.

No signing credentials are currently configured. The new signing path cannot be completed until the ministry/account owner obtains them. Do not disable Gatekeeper or ask users to remove quarantine as a release fix.

## Apple setup — account owner

1. Enroll through [Apple Developer Program](https://developer.apple.com/programs/enroll/). For a ministry organization, Apple requires a legally recognized entity and normally a D-U-N-S number. The enrollee must have authority to bind the organization. Choose the account owner deliberately; signing identifies that publisher.
2. Once membership is active, create a **Developer ID Application** certificate using [Apple's certificate instructions](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/). This is for distribution outside the Mac App Store. Use Keychain Access to create the certificate request on the Mac that will keep the private key.
3. Import the issued certificate into that keychain. Export the certificate together with its private key as a password-protected `.p12`. Keep an encrypted backup under the owner's control.
4. Create an app-specific password for the Apple Account used for notarization. Obtain the membership Team ID. This workflow uses Apple Account notarization credentials supported by the pinned electron-builder 26 release.
5. In the repository's **Settings → Secrets and variables → Actions**, add:

| Repository secret | Value |
| --- | --- |
| `MAC_CSC_LINK` | Base64 encoding of the exported Developer ID Application `.p12` |
| `MAC_CSC_KEY_PASSWORD` | Export password |
| `APPLE_ID` | Apple Account email for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password; never the account's normal password |
| `APPLE_TEAM_ID` | Developer membership Team ID |

Add secrets directly to GitHub's secret form or through a secure local input stream. Never put certificate contents, private keys, passwords, or encoded exports in chat, source control, screenshots, or logs. The pipeline uses an ephemeral signing keychain managed by electron-builder. See [Apple's notarization overview](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).

## Windows setup — account owner

Obtain a publicly trusted Windows Authenticode code-signing identity for the intended legal publisher. Modern certificate products may require a hardware token or a managed signing service; confirm that the chosen identity supports unattended GitHub Actions signing **before purchasing**. A self-signed certificate does not establish public trust.

The prepared workflow supports an exportable PFX where the issuer permits one. Set `WIN_CSC_LINK` to its Base64 encoding and `WIN_CSC_KEY_PASSWORD` to its password in GitHub Actions repository secrets. If the issuer requires an HSM, hardware token, or cloud service, integrate its supported signing client instead; do not try to export a non-exportable private key. No Windows signing provider has been provisioned by this change.

A valid signature does not guarantee that a new download has immediate SmartScreen reputation. See [Microsoft's explanation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

## Build and validation

- Run the manual **Ministry installers** workflow from the trusted release branch with **signed = true** (default). PR builds use unsigned development configuration and cannot pass the stable publisher's trust gate.
- Missing credentials stop the build before dependency installation. Production configuration forces code signing, enables notarization and DMG signing. Local configuration explicitly opts out for development only.
- Each Mac job verifies the Developer ID signature, hardened runtime, app version/architecture, stapled ticket and Gatekeeper acceptance. It also extracts the delivered ZIP and checks that app, and verifies/signature-assesses the DMG after stapling it.
- The Windows job requires trusted, timestamped Authenticode signatures for the installer and packaged main executable. electron-builder signs the application and NSIS artifacts.
- All platforms run application tests, offline payload checks, and native speech-runtime checks before artifact upload.
- On a clean Mac for **each architecture**, download the final hosted installer through a browser, install normally, and confirm Gatekeeper accepts it with quarantine retained. Exercise microphone permissions, captions, native modules and offline first launch.
- On a clean supported Windows PC, install and uninstall the downloaded installer; confirm the intended publisher and signatures and test the same presentation flow. Record any SmartScreen warning accurately.
- Test bundled songs, three Bibles, OCR, previews/live output, branch setup and upgrade preservation. Representative singing and trilingual recordings remain real-world validation gaps.

## Publish a new patch release

After credentials and clean-machine acceptance are complete, bump package.json/package-lock.json to the next patch version and update CHANGELOG.md. Merge through dev → main, create a new annotated tag, and run the signed installer workflow against that exact commit. Never reuse the unsigned v1.0.0 build.

Use the approved manual publisher with the new tag and successful installer run ID. It rejects missing/skipped/failed signature checks, unexpected platform jobs, unsigned old runs and source mismatches. It checks all five installer files, creates SHA256SUMS, uploads to a draft and only then publishes. Existing published releases are never overwritten.

Signing/notarization results and downloaded clean-machine acceptance must be recorded in the new release notes. Until these pass, no claim of a completed trusted release is justified.
