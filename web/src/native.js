import {FILE_KEY} from './files.js';
import { visibleMessages, displayName } from "./core.js";
import { sendNativeText } from "./native-send.js";
export const isNative = () => !!globalThis.HasbreoNative;
const waiting = new Map();
let next = 0;
export function nativeRequest(type, data = {}) {
  if (!isNative())
    return Promise.reject(
      new Error("This feature is available in the Android app."),
    );
  return new Promise((resolve, reject) => {
    const id = String(++next),
      timer = setTimeout(
        () => {
          waiting.delete(id);
          reject(new Error("The phone took too long to respond. Try again."));
        },
        type === "voice" || type === "camera" ? 240000 : 120000,
      );
    waiting.set(id, { resolve, reject, timer });
    HasbreoNative.postMessage(JSON.stringify({ id, type, data }));
  });
}
if (isNative()) {
  HasbreoNative.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data),
        pending = waiting.get(message.id);
      if (pending) {
        clearTimeout(pending.timer);
        waiting.delete(message.id);
        message.error
          ? pending.reject(new Error(message.error))
          : pending.resolve(message.data);
      }
    } catch {}
  };
  document.documentElement.classList.add("android-app");
}
export async function installNativeMessenger(service) {
  if (!isNative()) return () => {};
  await nativeRequest("session", service.session);
  const wake=()=>{if(service.client?.getSyncState?.()==='ERROR')service.client.retryImmediately()};window.addEventListener('hasbreo:wake',wake);
  const policy = async () => {
    const titles = {},
      muted = [];
    for (const room of service.rooms()) {
      titles[room.roomId] = service.title(room);
      if (await service.muted(room)) muted.push(room.roomId);
    }
    await nativeRequest("policy", {
      titles,
      muted,
      ignored: service.client.getIgnoredUsers(),
    });
  };
  await policy();
  const onPolicy = () => policy().catch(() => {});
  service.client.on("accountData", onPolicy);
  const policyTimer = setInterval(() => policy().catch(() => {}), 30000);
  const listener = async (event) => {
    const request = event.detail;
    if (!request?.requestId) return;
    try {
      if (
        request.action !== "snapshot" &&
        request.account &&
        request.account !== service.session.userId
      )
        throw new Error("Account changed. Refresh before replying.");
      let result;
      const room = service.rooms().find((r) => r.roomId === request.roomId);
      if (request.action === "snapshot") {
        const ignored = service.client.getIgnoredUsers();
        result = {
          userId: service.session.userId,
          displayName:
            service.me?.displayName || service.session.userId.split(":")[0],
          rooms: service
            .rooms()
            .filter((r) => r.getMyMembership() === "join")
            .slice(0, 30)
            .map((r) => ({
              id: r.roomId,
              name: service.title(r).slice(0, 80),
              unread: r.getUnreadNotificationCount(),
              group: !service.isDirect(r),
              preview: service.latest(r)
                ? watchBody(service.latest(r), ignored).slice(0, 100)
                : "Say hello",
              ts: service.latest(r)?.getTs() || 0,
            })),
          connected: service.status === "Connected",
          quickReplies:service.quickReplies(),
        };
      } else {
        if (!room || room.getMyMembership() !== "join")
          throw new Error("Open this conversation on your phone first.");
        if (request.action === "messages") {
          await service.checkFiles(room.getLiveTimeline().getEvents().map(e=>e.getContent()[FILE_KEY]?.id).filter(Boolean)).catch(()=>{});
          const ignored = service.client.getIgnoredUsers();
          result = {
            roomId: room.roomId,
            name: service.title(room).slice(0, 80),
            messages: visibleMessages(room.getLiveTimeline().getEvents())
              .filter(
                ({ event: e }) =>
                  !e.isRedacted() && !ignored.includes(e.getSender()),
              )
              .slice(-25)
              .map(({ event: e, content }) => ({
                id: e.getId(),
                body: content[FILE_KEY]&&service.fileAvailable(content[FILE_KEY].id)===false?'File removed · '+content.body:watchBody(e, ignored, content),
                  deleted:!!content[FILE_KEY]&&service.fileAvailable(content[FILE_KEY].id)===false,
                mine: e.getSender() === service.session.userId,
                sender: service.personName(e.getSender(),room.getMember(e.getSender())?.name).slice(0, 64),
                ts: e.getTs(),
              })),
          };
        } else if (request.action === "send") {
          const text = String(request.text || "").trim();
          if (!text || text.length > 16000)
            throw new Error("Write a message of 1–16,000 characters.");
          await sendNativeText(service, request);
          result = { sent: true, roomId: room.roomId };
        } else if (request.action === "sounds") {
          result={sounds:(await service.sounds()).slice(0,50).map(s=>({id:s.id,name:s.name})),inCall:service.calls?.call?.state==='connected'&&service.calls.call.roomId===room.roomId};
        } else if (request.action === "sound" || request.action === "soundCall") {
          const sound=(await service.sounds()).find(s=>s.id===request.soundId);if(!sound)throw Error('Refresh your soundboard on the phone.');
          if(request.action==='sound'){await service.sendSound(room.roomId,sound,'watch-sound:'+request.requestId);result={sent:true,roomId:room.roomId};}
          else{const call=service.calls?.call;if(!call||call.state!=='connected'||call.roomId!==room.roomId)throw Error('No active phone call in this chat.');if(call.isMicrophoneMuted())throw Error('Unmute on your phone before playing sounds.');const url=await service.media(sound.content);await service.calls.mixer.play(await(await fetch(url)).blob(),{call});result={played:true};}
        } else if (request.action === "read") {
          await service.read(room);
          result = { read: true };
        } else if (request.action === "mute") {
          await service.mute(room, !!request.muted);
          result = { muted: !!request.muted };
        } else if (request.action === "reaction") {
          const e = room.findEventById(request.eventId);
          if (!e) throw new Error("Open this message on your phone first.");
          await service.reaction(
            room.roomId,
            e,
            String(request.emoji || "👍").slice(0, 16),
          );
          result = { reacted: true };
        } else if (request.action === "open") {
          window.dispatchEvent(
            new CustomEvent("hasbreo:open", {
              detail: { roomId: room.roomId },
            }),
          );
          result = { opened: true };
        } else throw new Error("This action is not supported.");
      }
      await nativeRequest("watchResponse", {
        requestId: request.requestId,
        result,
      });
    } catch (e) {
      await nativeRequest("watchResponse", {
        requestId: request.requestId,
        error: e.message || "Unable to connect. Try again.",
      }).catch(() => {});
    }
  };
  window.addEventListener("hasbreo:request", listener);
  await nativeRequest("engineReady");
  return () => {
    clearInterval(policyTimer);window.removeEventListener('hasbreo:wake',wake);
    service.client.removeListener("accountData", onPolicy);
    window.removeEventListener("hasbreo:request", listener);
  };
}
function watchBody(event, ignored, override) {
  if (ignored.includes(event.getSender())) return "Blocked message";
  if (event.isDecryptionFailure?.() || event.getType() === "m.room.encrypted")
    return "Encrypted message · open on phone";
  const c = override || event.getContent();
  return c.msgtype === "m.image"
    ? "📷 Photo"
    : c.msgtype === "m.audio"
      ? "🎙 Voice message"
      : c.msgtype === "m.video"
        ? "🎬 Video"
        : c.msgtype === "m.file"
          ? "📎 " + c.body
          : String(c.body || "").slice(0, 500);
}
export function nativeSharedFile(item) {
  if (!Number.isSafeInteger(item.size) || item.size < 1)
    throw new Error(
      "This provider did not include a file size. Choose the file with Attach instead.",
    );
  return {
    name: item.name,
    type: item.mime,
    size: item.size,
    slice(start, end) {
      return {
        async arrayBuffer() {
          const response = await fetch(
            item.url + "?start=" + start + "&end=" + end,
          );
          if (!response.ok)
            throw new Error(
              "Could not read this file. Choose it with Attach and try again.",
            );
          const data = await response.arrayBuffer();
          if (data.byteLength !== end - start)
            throw new Error("This file did not finish reading.");
          return data;
        },
      };
    },
  };
}
export async function nativeAttachment(type) {
  const item = await nativeRequest(type);
  return item?.url ? nativeSharedFile(item) : null;
}

export async function saveNativeBlob(blob, name = "attachment") {
  const { downloadId } = await nativeRequest("saveDataStart", {
    name,
    mime: blob.type || "application/octet-stream",
    size: blob.size,
  });
  try {
    for (let at = 0; at < blob.size; at += 32768) {
      const part = new Uint8Array(
        await blob.slice(at, at + 32768).arrayBuffer(),
      );
      await nativeRequest("saveDataChunk", {
        downloadId,
        data: btoa(String.fromCharCode(...part)),
      });
    }
    await nativeRequest("saveDataFinish", { downloadId });
  } catch (error) {
    await nativeRequest("saveDataAbort", { downloadId }).catch(() => {});
    throw error;
  }
}
if (isNative())
  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest?.("a[download]");
      if (!link || !link.href.startsWith("blob:")) return;
      event.preventDefault();
      fetch(link.href)
        .then((r) => r.blob())
        .then((blob) => saveNativeBlob(blob, link.download || "attachment"))
        .catch(() => {});
    },
    true,
  );
