# Distribution and signing

How BuddyUsage reaches people today, and the exact steps that would remove
the remaining friction. Nothing here is required to use the app; it is the
to-do list for making installation boring.

## Where it ships now

| Channel | Command or link | Prompt on first launch |
| --- | --- | --- |
| Installer script (macOS, Linux) | `curl -fsSL .../install.sh \| bash` | none |
| DMG | [Apple Silicon](https://github.com/SmtTheSE/BuddyUsage/releases/latest/download/BuddyUsage-arm64.dmg) · [Intel](https://github.com/SmtTheSE/BuddyUsage/releases/latest/download/BuddyUsage-x64.dmg) | one "Open Anyway" |
| Homebrew (own tap) | `brew tap SmtTheSE/buddyusage …` | one "Open Anyway" (Homebrew 7 removed `--no-quarantine`) |
| Windows installer | [x64](https://github.com/SmtTheSE/BuddyUsage/releases/latest/download/BuddyUsage-x64.exe) · [ARM64](https://github.com/SmtTheSE/BuddyUsage/releases/latest/download/BuddyUsage-arm64.exe) | one SmartScreen |
| Linux AppImage | [x86_64](https://github.com/SmtTheSE/BuddyUsage/releases/latest/download/BuddyUsage-x86_64.AppImage) · [ARM64](https://github.com/SmtTheSE/BuddyUsage/releases/latest/download/BuddyUsage-arm64.AppImage) | none |

Every release also publishes `SHA256SUMS.txt` and a signed **build
provenance attestation**, so a download can be verified without trusting
the download page:

```bash
gh attestation verify BuddyUsage-arm64.dmg --repo SmtTheSE/BuddyUsage
shasum -a 256 -c SHA256SUMS.txt --ignore-missing
```

## What works today without paying Apple

There is no free path to notarization: a Developer ID certificate requires
Apple Developer Program membership, `.pkg` installers need one too, and
Homebrew 7 removed `--no-quarantine`. The routes that avoid or contain the
prompt are:

1. **The installer script.** `curl` is not a browser, so nothing is
   quarantined and no warning appears. This is the recommended path and
   the one the website leads with.
2. **One approval for the DMG.** After the user allows it once, the app
   clears the quarantine flag on its own bundle at startup
   (`src/main/gatekeeper.ts`), and subsequent versions arrive through the
   in-app updater, which downloads with Node rather than a browser. So the
   prompt is genuinely once per machine, not once per release.
3. **Verifiable builds instead of a vendor stamp.** Checksums and a signed
   provenance attestation are published for every release, which is a
   stronger claim than notarization about *where the binary came from*.

## Removing the macOS prompt (Apple Developer ID)

Cost: 99 USD/year for the Apple Developer Program. The pipeline is already
written; it activates the moment the secrets exist — including if a
sponsor or an organisation lends a Developer ID rather than the maintainer
buying one.

1. Join the Apple Developer Program and create a **Developer ID
   Application** certificate in Xcode or on the developer portal.
2. Export it from Keychain as a `.p12` with a password.
3. `base64 -i cert.p12 | pbcopy`
4. Add repository secrets (Settings → Secrets and variables → Actions):
   `CSC_LINK` (the base64), `CSC_KEY_PASSWORD`, `APPLE_ID`,
   `APPLE_APP_SPECIFIC_PASSWORD` ([create one](https://support.apple.com/102654)),
   `APPLE_TEAM_ID`.
5. Push the next tag. The release is signed and notarized; the DMG and the
   Homebrew cask stop prompting, and the in-app updater keeps working.

## Removing the Windows prompt (free for open source)

[SignPath Foundation](https://signpath.org/foundation) issues free
code-signing certificates to open-source projects. Apply with the repo
link; on approval either sign through their GitHub action or export a
`.pfx` and add `WIN_CSC_LINK` (base64) and `WIN_CSC_KEY_PASSWORD` as
secrets, which the existing workflow picks up with no other change.

## Package managers

- **Homebrew core cask.** Submitting `Casks/buddyusage.rb` to
  `Homebrew/homebrew-cask` removes the `brew tap` step. Note that Homebrew
  now requires casks to pass Gatekeeper, so this needs notarization first;
  until then the tap is the Homebrew route.
- **winget.** Template and the one-line `wingetcreate` command:
  [`packaging/winget/README.md`](../packaging/winget/README.md).
- **Scoop.** Manifest ready at
  [`packaging/scoop/buddyusage.json`](../packaging/scoop/buddyusage.json);
  submit to `ScoopInstaller/Extras` or host a bucket in this repo. Fill the
  `version` and `hash` fields from `SHA256SUMS.txt` of the release.
- **Flathub / AUR** for Linux are the same story: the AppImage works today,
  a native package is a nice-to-have.
