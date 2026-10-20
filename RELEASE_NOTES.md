# Hasbreo Message 0.4.0 web/server · Phone 1.2.0 · Watch 1.1.0

- Fixed soundboard microphone binding after SDK camera switches or camera off/on replace tracks inside an existing MediaStream; serialized call updates and rebound microphone input after camera/device changes.
- Remote media elements follow added/removed tracks (including browser/Edge feed changes). Remote screen shares now render in the call window with a local share preview and Stop sharing control.
- Move a call using its header and resize it using its corner. Added browser noise suppression/echo cancellation controls and microphone/camera selection.
- Encrypted call summaries show completed/failed/unanswered calls and connected duration. Historical call signalling is presented as call entries; completed summaries replace derived entries. Ringing time is not counted as connected duration.
- Opening a conversation automatically loads older meaningful messages past call signalling. Read receipts use the latest timeline event, including signalling.
- Added People tab and directory matches in the sidebar search; chat-row three-dot menus with read/unread, star, nickname, mute, details and confirmed conversation removal. Star/nickname moved out of the conversation toolbar.
- Tabbed settings, adjustable 12–22 px message text, original message/ringtone choices, mint/emerald accents and gentle attention pulses outside the focused chat. Emoji picker opens People with recent emojis above it.
- Open browser tabs use Hasbreo sounds instead of system message notifications. Browser push subscriptions provide generic encrypted-activity notices only when no Message window is open in that browser profile. Push availability depends on browser/OS background settings. Message plaintext and Matrix keys are never sent to push providers.
- Normal username/password sign-in automatically initializes or restores encrypted recovery, with retries for transient setup failures. Existing local keys are preserved. Accounts predating backup configuration may still need a one-time migration; an administrator password reset cannot recover inaccessible encryption keys.
- Android: removed the competing raw /sync fallback which could acknowledge encrypted device keys and post a generic notification before the decrypted message arrived. The single crypto engine now owns sync and message/call notifications. Message previews default on; existing explicit privacy preferences remain respected.
- Android: incoming-call notifications have Answer/Decline actions tied to the current account/call; original selectable tones; a separate active-call notification channel; shortcut to hide only the Connected mode channel in Android settings. Reliable connected background service still requires a foreground service; force-stop/OS restrictions can interrupt delivery.
- Admin: edit names/roles, reset another user's password, revoke devices, deactivate/reactivate accounts and revoke invitations, with confirmation and self-lockout protection. Deactivation removes login/profile access, not other people's copies of conversations.

## Installation

Install the full server bundle in your existing ~/hasbreo-chat and run server/update.sh. Keep server/.env, server/data and server/backups. Cloudflare TURN credentials are preserved. Refresh browser tabs, then install Phone 1.2.0 over the existing phone app using the same signing key. Do not uninstall or clear app data. The current companion Watch 1.1.0 remains compatible.

## Verification

48 real Synapse integration checks (including automatic encrypted recovery on new sign-in, push registration authorization, admin permissions), 20 web unit/regression checks, 15 DOM interaction checks, four RFC 8291/VAPID push checks, existing relay/migration checks, Android release compilation/unit tests/lint. Browser visual QA and physical calls/background notifications remain device checks; do not treat these automated checks as proof that Nick's Edge camera or every Android background state is verified.
