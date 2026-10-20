# Hasbreo Message · Android

Your people, wherever you are. Android client for [message.hasbreo.com](https://message.hasbreo.com), with a [Wear OS companion](https://github.com/hasbreo/hasbreomessage-watch).

**[Downloads and setup](https://hasbreo.com/message)** · **[Releases](https://github.com/hasbreo/hasbreomessage-phone/releases)**

## Included

This hybrid APK bundles the same React/Matrix Rust-crypto client as Hasbreo Chat 0.4.0 in a locally served Android WebView. Kotlin supplies native phone integration; it does not load a remotely hosted website for its interface.

- Existing username/password accounts, registration-code signup and automatic password-unlocked encrypted history recovery.
- Encrypted direct messages and groups, automatic local joining, replies, reactions, edits, deletion, search, typing and read receipts.
- Short handles, online/away/last-seen status, muting, blocking and administrator storage/invite controls.
- Default 25 GB file allowance; server-enforced reservations, encrypted 8 MiB uploads, progress and cancellation. New features require server 0.4.0 or later.
- Android sharing, file/photo picker, camera capture and voice notes up to three minutes. Audio/video playback in the chat.
- Native downloads decrypt incrementally into Downloads. Share-sheet files are read in bounded slices; multi-GB files are not buffered whole. Some non-seekable cloud providers require using Attach instead.
- Notifications with optional previews, reply and mark-read actions. Notification replies have an encrypted, account-bound outbox and stable transaction IDs.
- Connected mode (on by default, optional to disable): an ongoing foreground remote-messaging service retains the Matrix/watch engine, with a native sync loop for private fallback alerts.
- Fingerprint/device-credential lock, haptics, starred chats and encrypted persistent drafts.
- Explicit watch approval and revocation. The watch never receives the password, access token or Matrix message keys.

One-to-one voice/video calls are included; reliable cross-network calling needs TURN relay setup on the server. Standalone watch login, group calls and FCM are not included. Connected mode shows an ongoing notification and uses battery. Doze, manufacturer restrictions, force-stop and lost connectivity can delay delivery. Reopen after a force-stop. This is a foreground connection, not guaranteed push delivery.

## Install

Android 11+, with a current Android System WebView. Download the signed APK from Releases and allow installation from your browser/file manager if Android asks. Sign in, allow notifications, and choose Connected mode / unrestricted battery use in Settings. Connected mode starts enabled so background chats and watch replies work without extra setup. Pair the watch from Settings → Connect your watch.

Existing browser users must back up the original device's keys through automatic recovery before a new phone can restore them. Administrator password resets cannot decrypt old history without a signed-in device or optional backup. Change passwords inside Hasbreo to keep recovery linked.

## Build and validate

JDK 17, Android SDK platform 36 / build tools 36.0.0, Node 22+ and the Gradle wrapper:

```bash
cd web
npm ci
npm test
npm run test:ui
cd ..
./gradlew :app:assembleRelease :app:testReleaseUnitTest :app:lintRelease
```

The Android build builds and packages the web client automatically. Private signing material, local configuration, dependency caches and generated builds are ignored. `web/tests/fixtures/files.py` is a disposable integration-test gateway, not a production installer.

Automated tests cover a real disposable Synapse, crypto, DOM interaction, native routing and Android checks. Real-device camera/notifications/biometrics, paired-watch transport, battery use and full-size 25 GB transfers require hardware verification. Initial releases are previews until that verification is complete.

## Security

One packaged WebView owns the Matrix device and IndexedDB crypto store. `WebViewAssetLoader` provides a fixed HTTPS app-assets origin. Native messages are accepted only from that main frame, and remote links open outside the WebView. File access, mixed content and cleartext traffic are disabled; SSL errors are never bypassed.

Tokens, drafts, watch approvals and queued notification replies use Android Keystore-backed authenticated encryption. Cloud backups and device-transfer extraction are excluded. Native file decryption matches Web Crypto AES-256-GCM IV/AAD and is tested against an independent fixture.

Google's paired-device Data Layer requires identical application IDs and signing certificates across phone and watch. Both APKs intentionally use `com.hasbreo.message` on their respective devices. The phone checks approval, account scope, allowed actions and stable request IDs. The watch's decrypted recent cache is encrypted at rest; it is an authorized endpoint for displayed messages.

E2EE covers chat/file content. Account IDs, group details, membership, reactions and routing metadata remain server-visible. Notification previews are optional.

## Releases and signing

A compressed, signed bootstrap APK in `release/` enables the initial GitHub release. Its checksum and public certificate fingerprint are pinned and verified before publication. No signing private key is committed.

Future CI builds unsigned unless secrets `MESSAGE_KEYSTORE_BASE64`, `MESSAGE_KEYSTORE_PASSWORD` and `MESSAGE_KEY_PASSWORD` are configured. Use alias `hasbreo-message` and the **same private key for both phone and watch**. Its backup is retained privately. Changing that key breaks in-place updates and companion trust.

The download page reads GitHub releases automatically, including older versions and notes. Updating these repositories does not update the Docker web server.

## Licences

Project: MIT. Matrix SDK/Rust crypto and AndroidX: Apache-2.0; React/Vite: MIT; Lucide: ISC. Google Play services uses Google's SDK terms. Preserve `THIRD_PARTY_NOTICES.txt` and dependency notices.

## Version 1.2.0


- Drag-and-drop encrypted uploads; browser camera capture and reviewable voice notes.
- Full local-server user catalogue, automatic chat joining and private nicknames synced across your devices.
- Searchable emoji library, skin tones, recent/favourite emojis and editable quick replies.
- An encrypted, account-owned soundboard: upload, preview, send in chat or mix into one-to-one voice/video calls.
- One-to-one WebRTC voice/video calls targeting up to 1920 × 1080 at 30 fps, measured stream dimensions, mic/camera controls, camera switching and desktop screen sharing.
- Date/size storage sorting across all pages and red/dim deleted attachments, including cached previews.
- One notification per chat, 30-second chat alert cooldown and five-second global alert gap.
- More expressive sage/lavender/warm accent styling, starred chats and encrypted browser drafts.

Install the 0.4.0 server update for the user catalogue, auto-joining, file availability and sorting. Reliable calls across mobile/restrictive networks need an independently reachable TURN relay; Cloudflare Tunnel alone does not provide UDP/TURN. Calls are one-to-one, not group calls. Resolution adapts to cameras and connection quality.

Automated unit, DOM and real Synapse tests are included. Physical camera/mic, background Android calling, phone/watch transport, visual browser checks and real-network call quality remain hardware verification items.
