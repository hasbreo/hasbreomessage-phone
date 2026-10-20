import {enableBrowserPush} from './browser-push.js';
import {AdminUsers} from './admin-users.jsx';
import {PreferencesPanel} from './preferences-ui.jsx';
import {preferences,applyPreferences,unlockAudio,playTone} from './preferences.js';
import {EmojiPanel,VoiceRecorder,CameraCapture,Soundboard,CallPanel,NicknameEditor} from "./features-ui.jsx";
import {loadDrafts,saveDrafts} from "./drafts.js";
import {notificationGate} from "./notifications.js";
import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  MessageCircle,
  Search,
  Plus,
  ArrowUp,
  ArrowLeft,
  ArrowRight,
  Settings,
  LogOut,
  Users,
  Lock,
  ShieldCheck,
  Image,
  Paperclip,
  Smile,
  X,
  Check,
  CheckCheck,
  Reply,
  Pencil,
  Trash2,
  MoreHorizontal,
  Info,
  Bell,
  BellOff,
  Download,
  Upload,
  UserPlus,
  ChevronDown,
  Copy,
  ExternalLink,
  Loader2,
  WifiOff,
  Sun,
  Moon,
  KeyRound,
  Heart,
  CheckCircle2,
  AtSign,
  Compass,
  File,
  Flag,
  Mic,
  Camera,
  Star,
  Smartphone,
  Watch,
  Vibrate,
  Share2,Phone,Video,Volume2,Tag,
} from "lucide-react";
import { Messenger, readSession, messageText } from "./matrix.js";
import {
  describeError,
  visibleMessages,
  userId,
  userHandle,
  displayName,
  presenceLabel,
} from "./core.js";
import { createDemo, demoEvent } from "./demo.js";
import {
  shouldNotify,
  showNotification,
  workerRegistration,
} from "./notifications.js";
import { FILE_KEY } from "./files.js";
import {
  isNative,
  nativeRequest,
  nativeAttachment,
  nativeSharedFile,
  installNativeMessenger,
} from "./native.js";
import "./style.css";

const initials = (name) =>
  name
    ?.replace(/^@/, "")
    .split(/[ .:_-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((v) => v[0])
    .join("")
    .toUpperCase() || "?";
const short = (id) => id?.split(":")[0]?.replace(/^@/, "") || "";
const time = (ts) =>
  new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const bytes = (n) =>
  n >= 1e9
    ? `${(n / 1e9).toFixed(2)} GB`
    : n >= 1e6
      ? `${(n / 1e6).toFixed(1)} MB`
      : `${Math.ceil((n || 0) / 1000)} KB`;
const date = (ts) =>
  new Date(ts).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
function Avatar({ name, size = "", group = false, presence }) {
  return (
    <span className={`avatar ${size} tone-${(name?.charCodeAt(0) || 0) % 5}`}>
      {group ? <Users size={size === "large" ? 30 : 21} /> : initials(name)}
      {!group && presence?.known && (
        <i
          className={`presence-dot ${presence.state}`}
          title={presenceLabel(presence)}
          aria-label={presenceLabel(presence)}
        />
      )}
    </span>
  );
}
function Mark({ small = false }) {
  return (
    <div className={`brand ${small ? "small" : ""}`}>
      <img src="/icon.svg" alt="" />
      <span>
        hasbreo<span className="brand-light">chat</span>
      </span>
    </div>
  );
}
function IconButton({ label, children, ...props }) {
  return (
    <button
      type="button"
      className="icon-button"
      title={label}
      aria-label={label}
      {...props}
    >
      {children}
    </button>
  );
}
function Modal({ title, subtitle, children, onClose, wide = false }) {
  const ref = useRef();
  const previous = useRef(document.activeElement);
  useEffect(() => {
    ref.current?.focus();
    const key = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = ref.current?.querySelectorAll(
          'button:not(:disabled), input, textarea, select, a[href], [tabindex="0"]',
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous.current?.focus?.();
    };
  }, []);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <header>
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </header>
        {children}
      </section>
    </div>
  );
}
function ErrorBox({ error }) {
  return error ? (
    <div className="error" role="alert">
      {error}
    </div>
  ) : null;
}
function TextBody({ text }) {
  return (
    <>
      {(text || "").split(/(https?:\/\/[^\s<>]+)/g).map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

function Auth({ config, onLogin, onDemo }) {
  const [mode, setMode] = useState("login"),
    [server, setServer] = useState(
      localStorage.getItem("hasbreo.server") || config.defaultHomeserver,
    ),
    [advanced, setAdvanced] = useState(false),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onLogin({
        server,
        username,
        password,
        register: mode === "register",
        token,
        displayName: name,
      });
      localStorage.setItem("hasbreo.server", server);
      setPassword("");
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-page">
      <section className="auth-left">
        <Mark />
        <div className="auth-form-wrap">
          <span className="eyebrow">A LITTLE CLOSER, EVERY DAY</span>
          <h1>
            Your people.
            <br />
            Your little corner.
          </h1>
          <p className="auth-intro">
            The everyday hellos. The big news. The group chat that never sleeps.
            Bring it all here.
          </p>
          <div className="auth-tabs">
            <button
              className={mode === "login" ? "active" : ""}
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              Welcome back
            </button>
            <button
              className={mode === "register" ? "active" : ""}
              onClick={() => {
                setMode("register");
                setError("");
              }}
            >
              Create an account
            </button>
          </div>
          <form onSubmit={submit}>
            {mode === "register" && (
              <label>
                Your name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="What should we call you?"
                  autoComplete="nickname"
                  maxLength={64}
                  required
                />
              </label>
            )}
            <label>
              Username
              <div className="input-icon">
                <AtSign size={17} />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="your.username"
                  autoComplete="username"
                  required
                  maxLength={160}
                  spellCheck="false"
                  autoCapitalize="none"
                />
              </div>
            </label>
            <label>
              Password
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder={
                  mode === "register"
                    ? "At least 8 characters"
                    : "Your password"
                }
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                minLength={mode === "register" ? 8 : 1}
                required
              />
            </label>
            {mode === "register" && (
              <label>
                Invite code{" "}
                <span className="label-note">From your server owner</span>
                <input
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Your invite code"
                  autoComplete="off"
                  required={config.registrationTokenRequired}
                />
              </label>
            )}
            <button
              className="server-toggle"
              type="button"
              onClick={() => setAdvanced(!advanced)}
            >
              <span className="status-dot" />
              {server.replace(/^https?:\/\//, "")}
              <ChevronDown size={14} />
            </button>
            {advanced && (
              <label>
                Messaging server
                <input
                  type="text"
                  value={server}
                  onChange={(e) => setServer(e.target.value)}
                  required
                  placeholder="https://message.hasbreo.com"
                  autoCapitalize="none"
                />
                <span className="help">
                  Use the address where your Matrix server is installed.
                </span>
              </label>
            )}
            <ErrorBox error={error} />
            <button className="primary full" disabled={busy}>
              {busy ? (
                <Loader2 className="spin" size={18} />
              ) : mode === "register" ? (
                "Make yourself at home"
              ) : (
                "Let’s catch up"
              )}
              {!busy && <ArrowRight size={18} />}
            </button>
          </form>
          <div className="auth-divider">
            <span>JUST LOOKING AROUND?</span>
          </div>
          <button className="demo-button" onClick={onDemo}>
            <Compass size={18} /> Take a look inside <ArrowRight size={16} />
          </button>
          <p className="fine-print">
            Explore a demo, no account needed. Real chats connect to your
            messaging server.
          </p>
        </div>
        <footer>
          <Lock size={13} /> Encrypted conversations. Powered by Matrix.
          <span>BY HASBREO</span>
        </footer>
      </section>
      <aside className="auth-art">
        <div className="art-orbit orbit-one" />
        <div className="art-orbit orbit-two" />
        <div className="art-grain" />
        <span className="art-label">
          <span /> GOOD COMPANY. ANYWHERE.
        </span>
        <div className="floating-chat">
          <div className="floating-chat-head">
            <Avatar name="The good company" group />
            <div>
              <strong>The good company</strong>
              <span>All your favourite people, together</span>
            </div>
            <Heart size={19} />
          </div>
          <div className="art-message received">
            <small>MIRA</small>Same time, same place?<span>10:42</span>
          </div>
          <div className="art-message sent">
            Wouldn’t miss it. ☀️
            <span>
              10:43 <CheckCheck size={13} />
            </span>
          </div>
          <div className="art-photo">
            <div className="sun-shape" />
            <div className="hill hill-back" />
            <div className="hill hill-front" />
            <div className="photo-caption">
              <Image size={15} /> A little moment, shared.
            </div>
          </div>
          <div className="art-message received">
            This deserves a spot in the group chat.<span>10:44</span>
          </div>
          <div className="art-typing">
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="art-bottom">
          <h2>
            Less scrolling.
            <br />
            More connection.
          </h2>
          <p>A space for conversations that feel like you.</p>
          <div className="art-pills">
            <span>
              <MessageCircle size={14} /> Just say hello
            </span>
            <span>
              <Users size={14} /> Find your people
            </span>
          </div>
        </div>
      </aside>
    </main>
  );
}

function Attachment({content,service,onOpen}){
 const [url,setUrl]=useState(content.demoUrl||null),[error,setError]=useState('');const id=content[FILE_KEY]?.id,deleted=id&&service?.fileAvailable(id)===false,isAudio=content.msgtype==='m.audio',isVideo=content.msgtype==='m.video',isImage=['image/png','image/jpeg','image/webp','image/gif'].includes(content.info?.mimetype)&&(content.info?.size||0)<=64*1024*1024;
 useEffect(()=>{let live=true;if(!deleted&&!url&&(isImage||isAudio||isVideo)&&(content.info?.size||0)<=64*1024*1024&&service)service.media(content).then(v=>live&&setUrl(v)).catch(e=>{if(live)setError(e.httpStatus===404?'File removed from storage':e.message||'Attachment unavailable')});return()=>{live=false}},[id,content.url,deleted]);
 const download=async()=>{try{if(content.demoUrl){const a=document.createElement('a');a.href=content.demoUrl;a.download=content.body;a.click()}else{if(id)await service.checkFiles([id],true);if(id&&service.fileAvailable(id)===false)return;await service.download(content)}}catch(e){if(e.name!=='AbortError')setError(e.message)}};
 if(deleted)return <div className="attachment attachment-deleted" role="note"><Trash2 size={23}/><span><strong>{content.body||'Attachment'}</strong><small>File removed from storage · no longer available</small></span></div>;
 return <div className="attachment">{isAudio&&url?<audio controls preload="metadata" src={url} aria-label={content.body||'Voice message'}/>:isVideo&&url?<video controls preload="metadata" src={url} aria-label={content.body||'Shared video'}/>:isImage?<button className="photo-button" onClick={()=>url&&onOpen({url,name:content.body})}>{url?<img src={url} alt={content.body||'Shared photo'} loading="lazy"/>:<span>{error||<Loader2 className="spin" size={22}/>}</span>}</button>:<button className="file-button" onClick={download}>{isAudio?<Mic size={26}/>:<File size={26}/>}<span><strong>{content.body}</strong><small>{bytes(content.info?.size||0)} · Download</small></span><Download size={18}/></button>}{!isImage&&error&&<small>{error}</small>}</div>
}
function QuickReplySettings({service,tell}){const [value,setValue]=useState(service.quickReplies().join('\n')),[error,setError]=useState('');return <details><summary>Edit quick replies</summary><label>One reply per line<textarea aria-label="Quick reply presets" rows={5} value={value} onChange={e=>setValue(e.target.value)}/></label><button className="secondary" onClick={async()=>{try{await service.setQuickReplies(value.split('\n'));tell('Quick replies saved.')}catch(e){setError(e.message)}}}>Save quick replies</button>{error&&<p className="error">{error}</p>}</details>}

function ChatOptions({service,room,onClose=()=>{},onNickname,onDetails,onSounds,tell}){
 const [muted,setMuted]=useState(false),[busy,setBusy]=useState(false);
 useEffect(()=>{service?.muted(room).then(setMuted).catch(()=>{})},[room?.roomId]);if(!service||!room)return null;
 const run=async fn=>{setBusy(true);try{await fn();onClose()}catch(error){tell(describeError(error))}finally{setBusy(false)}};
 return <div className="chat-options" role="group" aria-label="Chat settings">
 <button disabled={busy} onClick={()=>run(()=>service.read(room,true))}>Mark as read</button><button disabled={busy} onClick={()=>run(()=>service.markUnread(room))}>Mark as unread</button>
 <button disabled={busy} onClick={()=>run(()=>service.toggleFavourite(room.roomId))}>{service.isFavourite(room.roomId)?'Unstar chat':'Star chat'}</button>
 {onNickname&&service.isDirect(room)&&<button onClick={()=>{onNickname();onClose()}}>Private nickname</button>}
 <button disabled={busy} onClick={()=>run(async()=>{await service.mute(room,!muted);setMuted(!muted)})}>{muted?'Unmute notifications':'Mute notifications'}</button>
 {onDetails&&<button onClick={()=>{onDetails();onClose()}}>Conversation details</button>}{onSounds&&<button onClick={()=>{onSounds();onClose()}}>Soundboard</button>}
 <button className="danger" disabled={busy} onClick={()=>{if(window.confirm('Remove this conversation from your list and leave it? Other people keep their messages.'))run(async()=>{await service.client.leave(room.roomId);await service.client.forget(room.roomId,true);service.emit()})}}>Delete conversation…</button>
 </div>
}

function App() {
  const [config, setConfig] = useState(null),
    [service, setService] = useState(null),
    [version, render] = useState(0),
    [demo, setDemo] = useState(null),
    [active, setActive] = useState(
      new URLSearchParams(window.location.search).get("chat"),
    ),
    [mobileChat, setMobileChat] = useState(false),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(""),
    [boot, setBoot] = useState(true),
    [bootError, setBootError] = useState(""),
    [drafts, setDrafts] = useState({}),
    [reply, setReply] = useState(null),
    [edit, setEdit] = useState(null),
    [sending, setSending] = useState(false),
    [uploading, setUploading] = useState(false),
    [searchMessages, setSearchMessages] = useState(false),
    [messageQuery, setMessageQuery] = useState(""),
    [theme, setTheme] = useState(
      localStorage.getItem("hasbreo.theme.v2") || "dark",
    ),
    [uploadProgress, setUploadProgress] = useState(null),
    [draftsLoaded, setDraftsLoaded] = useState(false),
    [shareVersion, setShareVersion] = useState(0),
    [nativeVisible, setNativeVisible] = useState(true),
    [dropActive,setDropActive]=useState(false),[quickOpen,setQuickOpen]=useState(false),[people,setPeople]=useState([]),[chatMenu,setChatMenu]=useState(null),[attention,setAttention]=useState({});
  const bottom = useRef(),
    scroll = useRef(),
    input = useRef(),
    fileInput = useRef(),
    typingTimer = useRef(),
    lastTyping = useRef(0),
    notified = useRef(new Set()),
    serviceRef = useRef(null),
    demoUrls = useRef([]),
    nearBottom = useRef(true),
    activeRef = useRef(active),
    uploadAbort = useRef(),dragDepth=useRef(0);
  activeRef.current = active;
  const redraw = () => render((v) => v + 1);
  const tell = (text) => {
    setToast(text);
  };
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("hasbreo.theme", theme);
    localStorage.setItem("hasbreo.theme.v2", theme);
  }, [theme]);
  useEffect(()=>{applyPreferences();const unlock=()=>unlockAudio().catch(()=>{});window.addEventListener('pointerdown',unlock);window.addEventListener('keydown',unlock);return()=>{window.removeEventListener('pointerdown',unlock);window.removeEventListener('keydown',unlock)}},[]);
  useEffect(()=>{if(!service?.ready)return;let live=true;service.people().then(p=>{if(live)setPeople(p)}).catch(()=>{});return()=>{live=false}},[service,service?.ready]);
  useEffect(()=>{if(service?.ready&&!isNative()&&globalThis.Notification?.permission==='granted')enableBrowserPush(service).catch(()=>{})},[service,service?.ready]);
  const notify = async (e, room) => {
    try {
      if (isNative()) {
        const svc = serviceRef.current;
        if (
          !svc ||
          !room ||
          svc.client.getIgnoredUsers().includes(e.getSender()) ||
          (await svc.muted(room))
        )
          return;
        await nativeRequest("notification", {
          owner: svc.session.userId,
          eventId: e.getId(),
          roomId: room.roomId,
          title: svc.title(room),
          sender: userHandle(e.getSender()),
          body: messageText(e).slice(0, 300),
        });
        return;
      }
      const svc=serviceRef.current;
      if(!room||!svc||notified.current.has(e.getId())||!shouldNotify({hidden:document.hidden,focused:document.hasFocus(),activeRoomId:activeRef.current,roomId:room.roomId})||svc.client.getIgnoredUsers().includes(e.getSender())||await svc.muted(room))return;
      notified.current.add(e.getId());if(notified.current.size>500)notified.current.delete(notified.current.values().next().value);
      setAttention(previous=>({...previous,[room.roomId]:e.getId()}));setTimeout(()=>setAttention(previous=>previous[room.roomId]===e.getId()?{...previous,[room.roomId]:null}:previous),4200);
      if(notificationGate.allow(svc.session.userId,room.roomId))await playTone(preferences().messageTone);
    } catch (e) {
      tell(describeError(e));
    }
  };
  useEffect(() => {
    workerRegistration();
    const handler = (e) => {
      if (e.data?.type === "HASBREO_OPEN_CHAT" && e.data.roomId)
        openRoom(e.data.roomId);
    };
    navigator.serviceWorker?.addEventListener("message", handler);
    return () =>
      navigator.serviceWorker?.removeEventListener("message", handler);
  }, []);
  useEffect(() => {
    if (!service?.ready || demo) return;
    let last = 0;
    const publish = () => {
      const state = (
        isNative() ? nativeVisible : !document.hidden && document.hasFocus()
      )
        ? "online"
        : "unavailable";
      if (Date.now() - last < 25000 && service.presenceState === state) return;
      last = Date.now();
      service.publishPresence(state).catch(() => {});
    };
    for (const type of ["focus", "blur", "pointerdown", "keydown"])
      window.addEventListener(type, publish);
    document.addEventListener("visibilitychange", publish);
    publish();
    const timer = setInterval(publish, 30000);
    return () => {
      clearInterval(timer);
      for (const type of ["focus", "blur", "pointerdown", "keydown"])
        window.removeEventListener(type, publish);
      document.removeEventListener("visibilitychange", publish);
    };
  }, [service, service?.ready, demo, nativeVisible]);
  useEffect(() => {
    if (!service?.ready || demo || !active) return;
    const refresh = () => {
      const r = service.rooms().find((r) => r.roomId === active);
      if (r)
        for (const m of service.members(r))
          if (m.userId !== service.session.userId)
            service.refreshPresence(m.userId);
    };
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [service, service?.ready, active, demo]);
  useEffect(() => {
    let disposed = false;
    fetch("/config.json")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .catch(() => ({
        defaultHomeserver: "https://message.hasbreo.com",
        registrationTokenRequired: true,
        accountStorageBytes: 25000000000,
      }))
      .then(async (cfg) => {
        if (disposed) return;
        setConfig(cfg);
        const session = readSession();
        if (session) {
          const s = new Messenger(redraw, notify);
          serviceRef.current = s;
          setService(s);
          try {
            await s.start(session);
          } catch (e) {
            setBootError(describeError(e));
          }
        }
        setBoot(false);
      });
    return () => {
      disposed = true;
      serviceRef.current?.stop();
      for (const url of demoUrls.current) URL.revokeObjectURL(url);
    };
  }, []);
  useEffect(() => {
    if (!service?.ready || demo) return;
    let remove;
    installNativeMessenger(service)
      .then((fn) => (remove = fn))
      .catch((e) => tell(e.message));
    return () => remove?.();
  }, [service, service?.ready, demo]);
  useEffect(() => {
    if (isNative())
      nativeRequest("screen", { roomId: mobileChat ? active : null }).catch(
        () => {},
      );
  }, [active, mobileChat]);
  useEffect(() => {
    const open = (e) => e.detail?.roomId && openRoom(e.detail.roomId);
    window.addEventListener("hasbreo:open", open);
    return () => window.removeEventListener("hasbreo:open", open);
  }, []);
  useEffect(() => {
    if (!isNative() || !service?.ready) return;
    let live = true;
    nativeRequest("draftsLoad")
      .then((value) => {
        if (live) {
          setDrafts(value || {});
          setDraftsLoaded(true);
        }
      })
      .catch(() => setDraftsLoaded(true));
    return () => {
      live = false;
      setDraftsLoaded(false);
    };
  }, [service, service?.ready]);
  useEffect(() => {
    if (!isNative() || !draftsLoaded) return;
    const timer = setTimeout(
      () => nativeRequest("draftsSave", { drafts }).catch(() => {}),
      300,
    );
    return () => clearTimeout(timer);
  }, [drafts, draftsLoaded]);
  useEffect(() => {
    const handler = () => setShareVersion((v) => v + 1);
    window.addEventListener("hasbreo:share", handler);
    return () => window.removeEventListener("hasbreo:share", handler);
  }, []);
  useEffect(() => {
    const handler = (e) => setNativeVisible(!!e.detail?.visible);
    window.addEventListener("hasbreo:visibility", handler);
    return () => window.removeEventListener("hasbreo:visibility", handler);
  }, []);
  useEffect(()=>{if(isNative()||!service?.ready)return;let live=true;setDraftsLoaded(false);loadDrafts(service.session.userId).then(value=>{if(live){setDrafts(value);setDraftsLoaded(true)}}).catch(()=>{if(live)setDraftsLoaded(true)});return()=>{live=false;setDraftsLoaded(false)}},[service,service?.ready]);
  useEffect(()=>{if(isNative()||!draftsLoaded||!service?.session)return;const timer=setTimeout(()=>saveDrafts(service.session.userId,drafts).catch(()=>{}),350);return()=>clearTimeout(timer)},[drafts,draftsLoaded,service]);
  const isDemo = !!demo,
    me = demo?.me || service?.session?.userId;
  const realRooms = service?.rooms() || [];
  const rooms = isDemo ? demo.rooms : realRooms;
  const room = rooms.find((r) => (r.id || r.roomId) === active);
  const roomId = (r) => r.id || r.roomId;
  const roomName = (r) => (isDemo ? r.name : service.title(r));
  const direct = (r) => (isDemo ? r.direct : service.isDirect(r));
  const members = (r) =>
    isDemo
      ? [
          { userId: me, name: "You", membership: "join" },
          ...r.people.map((p) => ({
            userId: p.user_id,
            name: p.display_name,
            membership: "join",
          })),
        ]
      : service.members(r);
  const events = room
    ? isDemo
      ? room.events
      : room.getLiveTimeline().getEvents()
    : [];
  const blocked = isDemo ? [] : service?.client?.getIgnoredUsers() || [];
  const messages = visibleMessages(events).filter(
    (m) =>
      !blocked.includes(m.event.getSender()) &&
      (!messageQuery ||
        messageText(m.event)
          .toLowerCase()
          .includes(messageQuery.toLowerCase())),
  );
  const draft = drafts[active] || "";
  const myName = isDemo
    ? "You"
    : displayName(service?.me?.displayName, me) || short(me) || "You";
  const invites = !isDemo
    ? rooms.filter((r) => r.getMyMembership() === "invite")
    : [];
  const chats = rooms.filter(
    (r) =>
      (isDemo || r.getMyMembership() === "join") &&
      roomName(r).toLowerCase().includes(query.toLowerCase()) &&
      (filter !== "favourites" ||
        (!isDemo && service.isFavourite(roomId(r)))) &&
      (filter !== "groups" || !direct(r)) &&
      (filter !== "unread" || (!isDemo && (r.getUnreadNotificationCount() > 0||r.getAccountData?.('m.marked_unread')?.getContent()?.unread))),
  );
  const openRoom = (id) => {
    setActive(id);
    setMobileChat(true);
    setReply(null);
    setEdit(null);
    setMessageQuery("");
    setSearchMessages(false);
    nearBottom.current = true;setChatMenu(null);setAttention(previous=>({...previous,[id]:null}));
    if(!demo){const target=serviceRef.current?.client.getRoom(id);if(target){serviceRef.current.manualUnread?.delete(id);}if(target)serviceRef.current.ensureRecentHistory(target).catch(e=>tell(describeError(e)));}
  };
  useEffect(() => {
    if (!room || isDemo || document.hidden || (isNative() && !nativeVisible))
      return;
    const read = () => {
      if (nearBottom.current && !messageQuery && (isNative()||document.hasFocus()))
        service.read(room).catch(() => {});
    };
    read();
    const focus = () => {
      if (!document.hidden) read();
    };
    document.addEventListener("visibilitychange", focus);
    window.addEventListener("focus", focus);
    return () => {
      document.removeEventListener("visibilitychange", focus);
      window.removeEventListener("focus", focus);
    };
  }, [active, events.length, version, nativeVisible]);
  useEffect(() => {
    if (nearBottom.current)
      bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [active, events.length, version]);
  const login = async (data) => {
    const s = new Messenger(redraw, notify);
    serviceRef.current = s;
    try {
      await s.authenticate(data);
      setService(s);
      setBootError("");
    } catch (e) {
      s.stop();
      if (readSession()) {
        setService(s);
        setBootError(describeError(e));
      }
      throw e;
    }
  };
  const send = async (e) => {
    e?.preventDefault();
    if (!draft.trim() || sending || !room) return;
    const text = draft;
    const target = active;
    setSending(true);
    try {
      if (isDemo) {
        if (edit) {
          const found = room.events.findIndex(
            (e) => e.getId() === edit.getId(),
          );
          room.events[found] = demoEvent(text, me);
        } else
          room.events.push(
            demoEvent(
              text,
              me,
              Date.now(),
              reply
                ? {
                    "m.relates_to": {
                      "m.in_reply_to": { event_id: reply.getId() },
                    },
                  }
                : {},
            ),
          );
        redraw();
      } else await service.send(target, text, reply, edit);
      setDrafts((v) => ({ ...v, [target]: "" }));
      setReply(null);
      setEdit(null);
      nearBottom.current = true;
      input.current?.focus();
      if (!isDemo) service.typing(target, false).catch(() => {});
    } catch (e) {
      tell(describeError(e));
    } finally {
      setSending(false);
    }
  };
  const capture = async (type) => {
    try {
      if(!isNative()){setModal({type:type==='camera'?'camera':'voice'});return;}
      const file = await nativeAttachment(type);
      if (file) await upload([file]);
    } catch (e) {
      tell(e.message);
    }
  };
  const upload = async (files) => {
    if (!room || !files?.length || uploadAbort.current) return;
    setUploading(true);
    const controller = new AbortController();
    uploadAbort.current = controller;
    const target = active;
    try {
      for (const file of Array.from(files)) {
        controller.signal.throwIfAborted();
        setUploadProgress({ loaded: 0, total: file.size, name: file.name });
        if (isDemo) {
          if (file.size > 64 * 1024 * 1024)
            throw new Error(
              "Try a file under 64 MB in the demo. Connected accounts have 25 GB storage.",
            );
          const url = URL.createObjectURL(file);
          demoUrls.current.push(url);
          room.events.push(
            demoEvent(file.name, me, Date.now(), {
              msgtype: [
                "image/png",
                "image/jpeg",
                "image/gif",
                "image/webp",
              ].includes(file.type)
                ? "m.image"
                : "m.file",
              info: { mimetype: file.type, size: file.size },
              demoUrl: url,
            }),
          );
          redraw();
        } else
          await service.attachment(target, file, {
            signal: controller.signal,
            onProgress: setUploadProgress,
          });
      }
      nearBottom.current = true;
    } catch (e) {
      tell(e.name === "AbortError" ? "Upload cancelled." : describeError(e));
    } finally {
      uploadAbort.current = null;
      setUploading(false);
      setUploadProgress(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  };
  useEffect(() => {
    if (!isNative() || !service?.ready || !active) return;
    nativeRequest("takeShare")
      .then(async (share) => {
        if (share?.text)
          setDrafts((v) => ({
            ...v,
            [active]: [v[active], share.text].filter(Boolean).join("\n"),
          }));
        if (share?.files?.length) {
          const files = [];
          for (const item of share.files) files.push(nativeSharedFile(item));
          await upload(files);
        }
      })
      .catch((e) => tell(e.message));
  }, [active, service?.ready, shareVersion]);
  useEffect(()=>{const prevent=e=>{if([...e.dataTransfer?.types||[]].includes('Files')){e.preventDefault();if(e.type==='drop'&&!room)tell('Choose a conversation before dropping files.')}};window.addEventListener('dragover',prevent);window.addEventListener('drop',prevent);return()=>{window.removeEventListener('dragover',prevent);window.removeEventListener('drop',prevent)}},[active]);
  useEffect(()=>{if(isDemo||!service?.ready||!room)return;const ids=events.map(e=>e.getContent()[FILE_KEY]?.id).filter(Boolean);if(!ids.length)return;const refresh=()=>{if(!document.hidden)service.checkFiles(ids).catch(()=>{})};refresh();const timer=setInterval(refresh,16000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)}},[service,active,events.length]);
  const onDraft = (value) => {
    setDrafts((v) => ({ ...v, [active]: value }));
    if (!isDemo && room && Date.now() - lastTyping.current > 5000) {
      lastTyping.current = Date.now();
      service.typing(active, !!value).catch(() => {});
    }
    clearTimeout(typingTimer.current);
    const id = active;
    typingTimer.current = setTimeout(
      () => service?.typing(id, false).catch(() => {}),
      7000,
    );
  };
  const act = async (fn) => {
    try {
      await fn();
      redraw();
    } catch (e) {
      tell(describeError(e));
    }
  };
  const logout = async () => {
    if (isDemo) {
      for (const url of demoUrls.current) URL.revokeObjectURL(url);
      demoUrls.current = [];
      setDemo(null);
      setActive(null);
      return;
    }
    await service.logout();
    if (isNative()) await nativeRequest("logout");
    setService(null);
    serviceRef.current = null;
    setActive(null);
    setBootError("");
    setModal(null);
  };
  if (boot || !config)
    return (
      <div className="loading-page">
        <Mark />
        <Loader2 className="spin" />
        <p>Making room for good conversation…</p>
      </div>
    );
  if (!service && !isDemo)
    return (
      <Auth
        config={config}
        onLogin={login}
        onDemo={() => {
          const d = createDemo();
          setDemo(d);
          openRoom(d.active);
        }}
      />
    );
  const typing =
    !isDemo && room
      ? members(room)
          .filter((m) => m.userId !== me && m.typing)
          .map((m) => (isDemo?displayName(m.name,m.userId):service.personName(m.userId,m.name)))
      : [];
  const unread = rooms.reduce(
    (sum, r) => sum + (isDemo ? 0 : r.getUnreadNotificationCount()),
    0,
  );
  document.title = unread
    ? `(${unread}) Hasbreo Message`
    : "Hasbreo Message · Your people, closer.";
  return (
    <div className={`messenger ${mobileChat ? "show-chat" : ""}`}>
      <aside className="sidebar">
        <header className="sidebar-title">
          <div>
            <Mark small />
            <h1>
              Your people<span>.</span>
            </h1>
          </div>
          <button
            className="compose-button"
            title="New conversation"
            aria-label="New conversation"
            onClick={() => setModal({ type: "new" })}
          >
            <Pencil size={19} />
          </button>
        </header>
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Search conversations"
            placeholder="Find anyone or a conversation"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button aria-label="Clear search" onClick={() => setQuery("")}>
              <X size={14} />
            </button>
          )}
        </div>
        <div className="filter-tabs">
          {[
            ["all", "All"],
            ["unread", "Unread"],
            ["favourites", "Starred"],
            ["groups", "Groups"], ["people", "People"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "active" : ""}
              onClick={() => setFilter(id)}
            >
              {label}
              {id === "all" && <span>{rooms.length}</span>}
            </button>
          ))}
        </div>
        <div className="conversation-list">
          {invites.map((r) => (
            <button
              key={r.roomId}
              className="invite-row"
              onClick={() => {
                openRoom(r.roomId);
              }}
            >
              <UserPlus size={21} />
              <span>
                <strong>{roomName(r)}</strong>
                <small>Connecting chat…</small>
              </span>
              <span className="tiny-dot" />
            </button>
          ))}
          {filter!=='people'&&chats.map((r) => {
            const latest = isDemo ? r.events.at(-1) : service.latest(r);
            const count = isDemo ? 0 : r.getUnreadNotificationCount();
            return (
              <div key={roomId(r)+(attention[roomId(r)]||'')} className={'conversation-wrap '+(attention[roomId(r)]?'new-message-attention':'')}>
              <button
                className={`conversation ${active === roomId(r) ? "selected" : ""}`}
                onClick={() => openRoom(roomId(r))}
              >
                <Avatar
                  name={roomName(r)}
                  group={!direct(r)}
                  presence={
                    !isDemo && direct(r)
                      ? service.presenceInfo(
                          members(r).find((m) => m.userId !== me)?.userId,
                        )
                      : null
                  }
                />
                <span className="conversation-copy">
                  <span className="conversation-heading">
                    <strong>{roomName(r)}</strong>
                    <small>
                      {latest
                        ? new Date(latest.getTs()).toDateString() ===
                          new Date().toDateString()
                          ? time(latest.getTs())
                          : new Date(latest.getTs()).toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                            })
                        : ""}
                    </small>
                  </span>
                  <span className="conversation-preview">
                    <span>
                      {latest?.getSender() === me ? "You: " : ""}
                      {messageText(latest)}
                    </span>
                    {count > 0 && <b>{count > 99 ? "99+" : count}</b>}
                  </span>
                </span>
              </button>
              {!isDemo&&<button className="conversation-options icon-button" aria-label={'Chat options for '+roomName(r)} onClick={()=>setChatMenu(chatMenu===roomId(r)?null:roomId(r))}><MoreHorizontal size={18}/></button>}
              {chatMenu===roomId(r)&&<ChatOptions service={service} room={r} onClose={()=>setChatMenu(null)} onNickname={()=>setModal({type:'nickname',userId:members(r).find(m=>m.userId!==me)?.userId})} onDetails={()=>{openRoom(roomId(r));setModal({type:'details'})}} tell={tell}/>}
              </div>
            );
          })}
          {!isDemo&&(filter==='people'||query.trim())&&<div className="people-directory">{people.filter(p=>!query.trim()||(service.personName(p.user_id,p.display_name)+' '+p.user_id).toLowerCase().includes(query.trim().toLowerCase())).map(p=><button className="conversation" key={p.user_id} onClick={()=>act(async()=>{const id=await service.createChat([p.user_id]);openRoom(id);setQuery('');setFilter('all')})}><Avatar name={service.personName(p.user_id,p.display_name)}/><span className="conversation-copy"><strong>{service.personName(p.user_id,p.display_name)}</strong><small>{userHandle(p.user_id)}</small></span></button>)}</div>}
          {!chats.length&&filter!=='people'  && (
            <div className="empty-list">
              <MessageCircle size={28} />
              <strong>
                {query
                  ? "No conversations found"
                  : "Good conversations start here."}
              </strong>
              <p>
                {query
                  ? "Try a different name."
                  : "Find a friend by username and say hello."}
              </p>
              <button
                className="text-button"
                onClick={() => setModal({ type: "new" })}
              >
                Start a conversation <ArrowRight size={15} />
              </button>
            </div>
          )}
        </div>
        <footer className="sidebar-footer">
          <button
            className="sidebar-profile"
            onClick={() => setModal({ type: "settings" })}
          >
            <Avatar name={myName} size="tiny" />
            <span>
              <strong>{myName}</strong>
              <small>
                <span
                  className={`status-dot ${!isDemo && service.status !== "Connected" ? "offline" : ""}`}
                />
                {isDemo ? "Exploring the demo" : userHandle(me)}
              </small>
            </span>
          </button>
          <div className="profile-actions">
            <IconButton
              label={theme === "light" ? "Dark mode" : "Light mode"}
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </IconButton>
            {!isDemo && service.isAdmin && (
              <IconButton
                label="Server admin"
                onClick={() => setModal({ type: "admin" })}
              >
                <ShieldCheck size={19} />
              </IconButton>
            )}
            <IconButton
              label="Settings"
              onClick={() => setModal({ type: "settings" })}
            >
              <Settings size={19} />
            </IconButton>
          </div>
        </footer>
      </aside>
      <main className={'chat-pane '+(dropActive?'drop-active':'')} onDragEnter={e=>{if([...e.dataTransfer.types].includes('Files')){e.preventDefault();dragDepth.current++;setDropActive(true)}}} onDragLeave={e=>{if([...e.dataTransfer.types].includes('Files')){dragDepth.current=Math.max(0,dragDepth.current-1);if(!dragDepth.current)setDropActive(false)}}} onDragOver={e=>{if([...e.dataTransfer.types].includes('Files')){e.preventDefault();e.dataTransfer.dropEffect=room?'copy':'none'}}} onDrop={e=>{if(![...e.dataTransfer.types].includes('Files'))return;e.preventDefault();dragDepth.current=0;setDropActive(false);if(!room||!isDemo&&room.getMyMembership()!=='join'){tell('Choose a connected conversation first.');return}if(uploading){tell('Wait for your current upload or cancel it first.');return}upload(e.dataTransfer.files)}}>{dropActive&&<div className="file-drop-overlay"><Upload size={40}/><strong>{room?'Drop files into this conversation':'Choose a conversation first'}</strong><span>Photos, videos, audio and documents · encrypted uploads</span></div>}
        {isDemo && (
          <div className="demo-banner">
            <Compass size={15} />
            <span>
              You’re exploring the demo. Messages stay on this device.
            </span>
            <button onClick={logout}>
              Connect your server <ArrowRight size={14} />
            </button>
          </div>
        )}
        {bootError && (
          <div className="connection-banner">
            <WifiOff size={17} />
            <span>{bootError}</span>
            <button onClick={() => window.location.reload()}>Retry</button>
            <button onClick={logout}>Sign out</button>
          </div>
        )}
        {!isDemo && service.recovery?.state === "needs-password" && (
          <div className="recovery-banner">
            <KeyRound size={17} />
            <span>
              Keep your history with your login. Confirm your password once to
              connect automatic recovery.
            </span>
            <button onClick={() => setModal({ type: "settings" })}>
              Set up recovery <ArrowRight size={14} />
            </button>
          </div>
        )}
        {room ? (
          <>
            <header className="chat-header">
              <IconButton
                label="Back to conversations"
                className="icon-button mobile-back"
                onClick={() => setMobileChat(false)}
              >
                <ArrowLeft size={21} />
              </IconButton>
              <Avatar
                name={roomName(room)}
                group={!direct(room)}
                presence={
                  !isDemo && direct(room)
                    ? service.presenceInfo(
                        members(room).find((m) => m.userId !== me)?.userId,
                      )
                    : null
                }
              />
              <button
                className="chat-title"
                onClick={() => setModal({ type: "details" })}
              >
                <h2>{roomName(room)}</h2>
                <span>
                  {isDemo
                    ? "A little conversation, for the demo"
                    : room.getMyMembership() === "invite"
                      ? "Connecting conversation"
                      : direct(room)
                        ? presenceLabel(
                            service.presenceInfo(
                              members(room).find((m) => m.userId !== me)
                                ?.userId,
                            ),
                          )
                        : `${members(room).length} people · A space for your people`}
                </span>
              </button>
              <div className="chat-header-actions">
                {!isDemo&&direct(room)&&room.getMyMembership()==='join'&&<><IconButton label="Voice call" onClick={()=>act(()=>service.calls.start(room,false))}><Phone size={20}/></IconButton><IconButton label="Video call · up to 1080p" onClick={()=>act(()=>service.calls.start(room,true))}><Video size={20}/></IconButton></>}
                <details className="conversation-header-menu" onClick={e=>{if(e.target.closest('button'))e.currentTarget.removeAttribute('open')}}><summary aria-label="Conversation menu"><MoreHorizontal size={21}/></summary><ChatOptions service={service} room={room} onClose={()=>{}} onNickname={()=>setModal({type:'nickname',userId:members(room).find(m=>m.userId!==me)?.userId})} onDetails={()=>setModal({type:'details'})} onSounds={()=>setModal({type:'soundboard'})} tell={tell}/></details>
                <IconButton
                  label="Search messages"
                  onClick={() => {
                    setSearchMessages(!searchMessages);
                    setMessageQuery("");
                  }}
                >
                  <Search size={20} />
                </IconButton>
                <IconButton
                  label="Conversation details"
                  onClick={() => setModal({ type: "details" })}
                >
                  <Info size={21} />
                </IconButton>
              </div>
            </header>
            {searchMessages && (
              <div className="message-search">
                <Search size={17} />
                <input
                  autoFocus
                  aria-label="Search loaded messages"
                  placeholder="Search messages loaded in this conversation"
                  value={messageQuery}
                  onChange={(e) => setMessageQuery(e.target.value)}
                />
                <small>{messages.length} found</small>
                <IconButton
                  label="Close search"
                  onClick={() => {
                    setSearchMessages(false);
                    setMessageQuery("");
                  }}
                >
                  <X size={16} />
                </IconButton>
              </div>
            )}
            {!isDemo && room.getMyMembership() === "invite" ? (
              <div className="invite-screen"><Loader2 className="spin" size={30}/><h2>Connecting your conversation…</h2><p>No invitation needed. Your chat will open automatically.</p></div>
            ) : (
              <>
                <div
                  className="message-area"
                  ref={scroll}
                  onScroll={() => {
                    const el = scroll.current;
                    nearBottom.current =
                      el.scrollHeight - el.scrollTop - el.clientHeight < 160;
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    upload(e.dataTransfer.files);
                  }}
                >
                  <div className="conversation-start">
                    <span className="start-icon">
                      <MessageCircle size={23} />
                    </span>
                    <h3>
                      {direct(room)
                        ? "A little hello goes a long way."
                        : "Good company starts here."}
                    </h3>
                    <p>
                      {isDemo ? (
                        "These are example conversations. Try sending a message below."
                      ) : (
                        <>
                          <Lock size={11} /> Messages and photos in new chats
                          are end-to-end encrypted.
                          <br />
                          Usernames, group details and reactions are visible to
                          the server.
                        </>
                      )}
                    </p>
                  </div>
                  {!isDemo && (
                    <button
                      className="load-older"
                      onClick={() => act(() => service.older(room))}
                    >
                      Load earlier messages
                    </button>
                  )}
                  {messages.map(({ event: e, content, edited }, i) => {
                    const mine = e.getSender() === me,
                      prev = messages[i - 1]?.event;
                    const showDate =
                      !prev ||
                      new Date(prev.getTs()).toDateString() !==
                        new Date(e.getTs()).toDateString();
                    const member = members(room).find(
                      (m) => m.userId === e.getSender(),
                    );
                    const name = mine
                      ? "You"
                      : (isDemo?displayName(member?.name,e.getSender()):service.personName(e.getSender(),member?.name));
                    const relation = content["m.relates_to"]?.["m.in_reply_to"];
                    const quoted = relation
                      ? events.find((v) => v.getId() === relation.event_id)
                      : null;
                    const reactions = events.filter(
                      (v) =>
                        v.getType() === "m.reaction" &&
                        !v.isRedacted?.() &&
                        v.getContent()["m.relates_to"]?.event_id === e.getId(),
                    );
                    const reactionGroups = reactions.reduce((groups, v) => {
                      const key = v.getContent()["m.relates_to"].key;
                      (groups[key] ??= []).push(v);
                      return groups;
                    }, Object.create(null));
                    const read =
                      !isDemo &&
                      members(room).some(
                        (m) =>
                          m.userId !== me &&
                          !e.getId().startsWith('$hasbreo-call:')&&room.hasUserReadEvent(m.userId, e.getId()),
                      );
                    const status = e.getStatus?.();
                    if(content['com.hasbreo.call'])return <div className={'call-history-entry '+content['com.hasbreo.call'].status} key={e.getId()}><Phone size={16}/><strong>{content.body}</strong><small>{mine?'You':name} · {time(e.getTs())}</small></div>;
                    return (
                      <React.Fragment key={e.getId()}>
                        {showDate && (
                          <div className="date-separator">
                            <span>{date(e.getTs())}</span>
                          </div>
                        )}
                        <div className={`message-row ${mine ? "mine" : ""}`}>
                          {!mine && <Avatar name={name} size="tiny" />}
                          <div className="message-stack">
                            {!mine && !direct(room) && (
                              <small className="sender-name">{name}</small>
                            )}
                            <div
                              className={`message-bubble ${e.isRedacted() ? "redacted" : ""}`}
                            >
                              {quoted && (
                                <button
                                  className="quoted-message"
                                  onClick={() =>
                                    document
                                      .getElementById(quoted.getId())
                                      ?.scrollIntoView({
                                        behavior: "smooth",
                                        block: "center",
                                      })
                                  }
                                >
                                  <Reply size={12} />
                                  <span>
                                    {messageText(quoted).slice(0, 180)}
                                  </span>
                                </button>
                              )}
                              <div id={e.getId()}>
                                {e.isRedacted() ? (
                                  <em>Message removed</em>
                                ) : e.isDecryptionFailure?.() ||
                                  e.getType() === "m.room.encrypted" ? (
                                  <span className="encrypted-placeholder">
                                    <Lock size={15} /> Encrypted message ·
                                    waiting for history recovery
                                  </span>
                                ) : [
                                    "m.image",
                                    "m.file",
                                    "m.audio",
                                    "m.video",
                                  ].includes(content.msgtype) ? (
                                  <Attachment
                                    content={content}
                                    service={service}
                                    onOpen={(image) =>
                                      setModal({ type: "image", ...image })
                                    }
                                  />
                                ) : (
                                  <TextBody
                                    text={
                                      edited ? content.body : messageText(e)
                                    }
                                  />
                                )}
                              </div>
                              <div className="message-time">
                                {edited && <span>edited · </span>}
                                {time(e.getTs())}
                                {mine &&
                                  (status === "not_sent" ? (
                                    <span className="failed-status">
                                      Not sent
                                    </span>
                                  ) : status ? (
                                    <Loader2 size={11} className="spin" />
                                  ) : read ? (
                                    <CheckCheck size={14} />
                                  ) : (
                                    <Check size={13} />
                                  ))}
                              </div>
                            </div>
                            {Object.keys(reactionGroups).length > 0 && (
                              <div className="reactions">
                                {Object.entries(reactionGroups).map(
                                  ([key, list]) => (
                                    <button
                                      key={key}
                                      onClick={() =>
                                        act(async () => {
                                          const own = list.find(
                                            (v) => v.getSender() === me,
                                          );
                                          if (!isDemo) {
                                            if (own)
                                              await service.remove(active, own);
                                            else
                                              await service.reaction(
                                                active,
                                                e,
                                                key,
                                              );
                                          }
                                        })
                                      }
                                    >
                                      {key} <span>{list.length}</span>
                                    </button>
                                  ),
                                )}
                              </div>
                            )}
                            {status === "not_sent" && (
                              <button
                                className="text-button"
                                onClick={() =>
                                  act(() => service.client.resendEvent(e, room))
                                }
                              >
                                Retry sending
                              </button>
                            )}
                          </div>
                          {!e.isRedacted() && (
                            <div className="message-actions">
                              <IconButton
                                label="Reply"
                                onClick={() => {
                                  setReply(e);
                                  setEdit(null);
                                  input.current?.focus();
                                }}
                              >
                                <Reply size={14} />
                              </IconButton>
                              <IconButton
                                label="React"
                                onClick={() =>
                                  setModal({ type: "react", event: e })
                                }
                              >
                                <Smile size={14} />
                              </IconButton>
                              <IconButton
                                label="Message options"
                                className="icon-button message-more"
                                onClick={() =>
                                  setModal({
                                    type: "message-options",
                                    event: e,
                                    content,
                                  })
                                }
                              >
                                <MoreHorizontal size={15} />
                              </IconButton>
                              {mine && (
                                <>
                                  <IconButton
                                    label="Edit message"
                                    onClick={() => {
                                      if (content.msgtype !== "m.text") {
                                        tell(
                                          "Only text messages can be edited.",
                                        );
                                        return;
                                      }
                                      setEdit(e);
                                      setReply(null);
                                      setDrafts((v) => ({
                                        ...v,
                                        [active]: content.body,
                                      }));
                                      input.current?.focus();
                                    }}
                                  >
                                    <Pencil size={14} />
                                  </IconButton>
                                  <IconButton
                                    label="Remove message"
                                    onClick={() =>
                                      setModal({ type: "remove", event: e })
                                    }
                                  >
                                    <Trash2 size={14} />
                                  </IconButton>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </React.Fragment>
                    );
                  })}
                  {!messages.length && messageQuery && (
                    <p className="empty-search">
                      No matching messages. Load earlier messages to search more
                      history.
                    </p>
                  )}
                  <div ref={bottom} />
                </div>
                <div className="typing-line">
                  {typing.length > 0 && (
                    <>
                      <span className="typing-dots">•••</span>{" "}
                      {typing.join(", ")} {typing.length > 1 ? "are" : "is"}{" "}
                      typing
                    </>
                  )}
                </div>
                <div className="composer-wrap"><div className="quick-reply-tools"><button type="button" className="text-button" onClick={()=>setQuickOpen(!quickOpen)}>Quick replies {quickOpen?'−':'+'}</button>{quickOpen&&<div className="quick-reply-strip">{(isDemo?['On my way','Sounds good!','👍']:service.quickReplies()).map((text,i)=><button type="button" key={i} onClick={()=>onDraft([draft,text].filter(Boolean).join(' '))}>{text}</button>)}</div>}</div>
                  {uploadProgress && (
                    <div className="upload-progress" role="status">
                      <div>
                        <strong>{uploadProgress.name}</strong>
                        <span>
                          {bytes(uploadProgress.loaded)} /{" "}
                          {bytes(uploadProgress.total)} ·{" "}
                          {uploadProgress.total
                            ? Math.round(
                                (uploadProgress.loaded / uploadProgress.total) *
                                  100,
                              )
                            : 0}
                          %
                        </span>
                        <progress
                          value={uploadProgress.loaded}
                          max={uploadProgress.total || 1}
                        />
                      </div>
                      <button
                        className="text-button"
                        onClick={() => uploadAbort.current?.abort()}
                      >
                        Cancel upload
                      </button>
                    </div>
                  )}
                  {(reply || edit) && (
                    <div className="reply-bar">
                      <Reply size={17} />
                      <span>
                        <strong>
                          {edit
                            ? "Editing your message"
                            : `Replying to ${userHandle(reply.getSender())}`}
                        </strong>
                        <small>
                          {messageText(edit || reply).slice(0, 120)}
                        </small>
                      </span>
                      <IconButton
                        label="Cancel reply or edit"
                        onClick={() => {
                          if (edit) setDrafts((v) => ({ ...v, [active]: "" }));
                          setReply(null);
                          setEdit(null);
                        }}
                      >
                        <X size={16} />
                      </IconButton>
                    </div>
                  )}
                  <form className="composer" onSubmit={send}>
                    <IconButton
                      label="Attach photos or files"
                      disabled={uploading}
                      onClick={() => fileInput.current?.click()}
                    >
                      {uploading ? (
                        <Loader2 className="spin" size={22} />
                      ) : (
                        <Plus size={23} />
                      )}
                    </IconButton>
                    <input
                      ref={fileInput}
                      type="file"
                      multiple
                      hidden
                      onChange={(e) => upload(e.target.files)}
                    />
                    <textarea
                      ref={input}
                      aria-label="Message"
                      placeholder="A thought, a hello, a little something…"
                      rows={1}
                      maxLength={16000}
                      value={draft}
                      onChange={(e) => onDraft(e.target.value)}
                      onPaste={(e) => {
                        if (e.clipboardData.files.length) {
                          e.preventDefault();
                          upload(e.clipboardData.files);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.nativeEvent.isComposing
                        ) {
                          e.preventDefault();
                          send();
                        }
                        if (e.key === "Escape") {
                          setReply(null);
                          setEdit(null);
                        }
                      }}
                    />
                    {(isNative()||!!navigator.mediaDevices?.getUserMedia) && (
                      <>
                        <IconButton
                          label="Take a photo"
                          disabled={uploading}
                          onClick={() => capture("camera")}
                        >
                          <Camera size={20} />
                        </IconButton>
                        <IconButton
                          label="Record a voice message"
                          disabled={uploading}
                          onClick={() => capture("voice")}
                        >
                          <Mic size={20} />
                        </IconButton>
                      </>
                    )}
                    <IconButton
                      label="Add an emoji"
                      onClick={() => setModal({ type: "emoji" })}
                    >
                      <Smile size={21} />
                    </IconButton>
                    <button
                      className="send-button"
                      aria-label="Send message"
                      disabled={sending || !draft.trim() || uploading}
                    >
                      {sending ? (
                        <Loader2 className="spin" size={20} />
                      ) : (
                        <ArrowUp size={22} />
                      )}
                    </button>
                  </form>
                  <div className="composer-footer">
                    <span>
                      {isDemo ? (
                        <>
                          <Compass size={11} /> Demo messages stay on this
                          device
                        </>
                      ) : (
                        <>
                          <Lock size={11} />{" "}
                          {service.client.isRoomEncrypted(active)
                            ? "End-to-end encrypted"
                            : "This conversation is not encrypted"}
                        </>
                      )}
                    </span>
                    <span>Enter to send · Shift + Enter for a new line</span>
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="welcome-empty">
            <div className="welcome-art">
              <MessageCircle size={58} />
              <span>
                <Heart size={22} />
              </span>
            </div>
            <span className="eyebrow">YOUR PEOPLE, CLOSER</span>
            <h1>
              A space for
              <br />
              good conversation.
            </h1>
            <p>
              Pick a chat, find a friend, or bring everyone together.
              <br />
              The best part starts with a hello.
            </p>
            <button
              className="primary"
              onClick={() => setModal({ type: "new" })}
            >
              Start a conversation <ArrowRight size={18} />
            </button>
            <small>
              <ShieldCheck size={14} /> Your server. Your conversations.
            </small>
          </div>
        )}
      </main>
      {modal?.type === "new" && (
        <NewChat
          group={modal.group}
          isDemo={isDemo}
          demo={demo}
          service={service}
          onClose={() => setModal(null)}
          onCreate={async (ids, name) => {
            let id;
            if (isDemo) {
              id = `demo-${Date.now()}`;
              const p = demo.people.filter((p) => ids.includes(p.user_id));
              demo.rooms.unshift({
                id,
                name: name || p[0]?.display_name || "New chat",
                direct: ids.length === 1 && !name,
                people: p,
                events: [],
              });
              redraw();
            } else id = await service.createChat(ids, name);
            openRoom(id);
            setModal(null);
          }}
        />
      )}
      {modal?.type === "admin" && (
        <AdminPanel
          service={service}
          onClose={() => setModal(null)}
          tell={tell}
        />
      )}
      {modal?.type === "settings" && (
        <SettingsPanel
          service={service}
          isDemo={isDemo}
          name={myName}
          me={me}
          onClose={() => setModal(null)}
          tell={tell}
          onLogout={() => setModal({ type: "logout" })}
          redraw={redraw}
        />
      )}
      {modal?.type === "details" && room && (
        <Details
          room={room}
          name={roomName(room)}
          members={members(room)}
          me={me}
          isDemo={isDemo}
          service={service}
          onClose={() => setModal(null)}
          onLeave={() => {
            setActive(null);
            setModal(null);
            redraw();
          }}
          tell={tell}
          redraw={redraw}
        />
      )}
      {["react","emoji"].includes(modal?.type)&&<Modal title={modal.type==='react'?'A little reaction':'Say it with an emoji'} onClose={()=>setModal(null)} wide><EmojiPanel onSelect={key=>act(async()=>{if(modal.type==='emoji')setDrafts(v=>({...v,[active]:(v[active]||'')+key}));else if(isDemo){room.events.push(demoEvent('',me,Date.now(),{type:'m.reaction','m.relates_to':{rel_type:'m.annotation',event_id:modal.event.getId(),key}}));redraw()}else await service.reaction(active,modal.event,key);setModal(null)})}/></Modal>}
      {modal?.type==='voice'&&<Modal title="Voice note" onClose={()=>setModal(null)}><VoiceRecorder onSend={file=>upload([file])} onClose={()=>setModal(null)}/></Modal>}
      {modal?.type==='camera'&&<Modal title="Share a photo" onClose={()=>setModal(null)}><CameraCapture onSend={file=>upload([file])} onClose={()=>setModal(null)}/></Modal>}
      {modal?.type==='soundboard'&&!isDemo&&<Modal title="Your soundboard" subtitle="A little sound. A lot of personality." onClose={()=>setModal(null)} wide><Soundboard service={service} roomId={active} onClose={()=>setModal(null)} tell={tell}/></Modal>}
      {modal?.type==='nickname'&&!isDemo&&<Modal title="Private nicknames" onClose={()=>setModal(null)}><NicknameEditor initialId={modal.userId} service={service} onClose={()=>setModal(null)} tell={tell}/></Modal>}
      {!isDemo&&service?.calls&&<CallPanel service={service} onSoundboard={()=>setModal({type:'soundboard'})} tell={tell}/>}
      {modal?.type === "message-options" && (
        <Modal title="This little message" onClose={() => setModal(null)}>
          <div className="message-menu">
            <button
              onClick={() => {
                setReply(modal.event);
                setEdit(null);
                setModal(null);
                input.current?.focus();
              }}
            >
              <Reply size={17} />
              Reply
            </button>
            <button
              onClick={() => setModal({ type: "react", event: modal.event })}
            >
              <Smile size={17} />
              React
            </button>
            {modal.content.msgtype === "m.text" && (
              <button
                onClick={() =>
                  act(async () => {
                    await navigator.clipboard.writeText(modal.content.body);
                    setModal(null);
                    tell("Message copied.");
                  })
                }
              >
                <Copy size={17} />
                Copy text
              </button>
            )}
            {modal.event.getSender() === me && (
              <>
                {modal.content.msgtype === "m.text" && (
                  <button
                    onClick={() => {
                      setEdit(modal.event);
                      setReply(null);
                      setDrafts((v) => ({
                        ...v,
                        [active]: modal.content.body,
                      }));
                      setModal(null);
                      input.current?.focus();
                    }}
                  >
                    <Pencil size={17} />
                    Edit message
                  </button>
                )}
                <button
                  className="danger"
                  onClick={() =>
                    setModal({ type: "remove", event: modal.event })
                  }
                >
                  <Trash2 size={17} />
                  Remove message
                </button>
              </>
            )}
          </div>
        </Modal>
      )}
      {modal?.type === "remove" && (
        <Confirm
          title="Remove this message?"
          text="The message will be removed from the conversation. Someone may already have seen or saved it."
          action="Remove message"
          onClose={() => setModal(null)}
          onConfirm={async () => {
            if (isDemo) {
              room.events = room.events.filter(
                (e) => e.getId() !== modal.event.getId(),
              );
              redraw();
            } else await service.remove(active, modal.event);
            setModal(null);
          }}
        />
      )}
      {modal?.type === "logout" && (
        <Confirm
          title={isDemo ? "Leave the demo?" : "Sign out of this browser?"}
          text={
            isDemo
              ? "You can return to the demo from the welcome screen."
              : "Your encrypted history will finish syncing before you sign out. Sign back in with your username and password to restore it."
          }
          action="Sign out"
          onClose={() => setModal(null)}
          onConfirm={logout}
        />
      )}
      {modal?.type === "image" && (
        <Modal
          title={modal.name || "Shared photo"}
          onClose={() => setModal(null)}
          wide
        >
          <img className="lightbox-image" src={modal.url} alt={modal.name} />
          <a
            className="secondary download-link"
            href={modal.url}
            download={modal.name}
          >
            <Download size={16} /> Save photo
          </a>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Info size={18} />
          {toast}
          <button aria-label="Dismiss" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function Confirm({ title, text, action, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title={title} onClose={onClose}>
      <p className="modal-prose">{text}</p>
      <ErrorBox error={error} />
      <div className="button-row right">
        <button className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
            } catch (e) {
              setError(describeError(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 size={16} className="spin" /> : action}
        </button>
      </div>
    </Modal>
  );
}

function NewChat({ group = false, isDemo, demo, service, onClose, onCreate }) {
  const [isGroup, setGroup] = useState(group),
    [query, setQuery] = useState(""),
    [name, setName] = useState(""),
    [results, setResults] = useState(isDemo ? demo.people : []),
    [selected, setSelected] = useState([]),
    [searching, setSearching] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (isDemo) {
        setResults(
          demo.people.filter((p) =>
            (p.display_name + p.user_id)
              .toLowerCase()
              .includes(query.toLowerCase()),
          ),
        );
        return;
      }
      setSearching(true);
      try {
        const people = await service.people().catch(async e=>{if(query.trim())return service.searchPeople(query);throw e});
        if (!cancelled) {
          setResults(people.filter(p=>(service.personName(p.user_id,p.display_name)+" "+p.user_id+" "+(p.display_name||"" )).toLowerCase().includes(query.toLowerCase())));
          setError("");
        }
      } catch (e) {
        if (!cancelled) setError(describeError(e));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);
  const choose = (p) => {
    if (isGroup)
      setSelected((v) =>
        v.some((x) => x.user_id === p.user_id)
          ? v.filter((x) => x.user_id !== p.user_id)
          : [...v, p],
      );
    else setSelected([p]);
  };
  return (
    <Modal
      title={isGroup ? "Bring your people together" : "Start with a hello"}
      subtitle={
        isGroup
          ? "A private group for your kind of company."
          : "Everyone on your private server. Pick someone and say hello."
      }
      onClose={onClose}
    >
      <div className="segmented">
        <button
          className={!isGroup ? "active" : ""}
          onClick={() => {
            setGroup(false);
            setSelected([]);
          }}
        >
          <MessageCircle size={15} /> Direct message
        </button>
        <button
          className={isGroup ? "active" : ""}
          onClick={() => setGroup(true)}
        >
          <Users size={15} /> Group chat
        </button>
      </div>
      {isGroup && (
        <label>
          Group name
          <input
            autoFocus
            placeholder="The good company"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
        </label>
      )}
      <label>
        {isGroup ? "Add people" : "Username"}
        <div className="input-icon">
          <Search size={17} />
          <input
            autoFocus={!isGroup}
            placeholder="Search a name or @username"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoCapitalize="none"
          />
        </div>
      </label>
      {selected.length > 0 && (
        <div className="selected-people">
          {selected.map((p) => (
            <button
              key={p.user_id}
              onClick={() =>
                setSelected((v) => v.filter((x) => x.user_id !== p.user_id))
              }
            >
              {(isDemo?displayName(p.display_name,p.user_id):service.personName(p.user_id,p.display_name))}
              <X size={13} />
            </button>
          ))}
        </div>
      )}
      <div className="people-results">
        {searching ? (
          <div className="searching">
            <Loader2 className="spin" size={18} /> Finding your people…
          </div>
        ) : (
          results.map((p) => (
            <button
              key={p.user_id}
              className="person-row"
              onClick={() => choose(p)}
            >
              <Avatar name={(isDemo?displayName(p.display_name,p.user_id):service.personName(p.user_id,p.display_name))} />
              <span>
                <strong>{(isDemo?displayName(p.display_name,p.user_id):service.personName(p.user_id,p.display_name))}</strong>
                <small>{userHandle(p.user_id)}</small>
              </span>
              <span
                className={`select-check ${selected.some((x) => x.user_id === p.user_id) ? "checked" : ""}`}
              >
                {selected.some((x) => x.user_id === p.user_id) && (
                  <Check size={13} />
                )}
              </span>
            </button>
          ))
        )}
        {!searching && !results.length && (
          <p className="help">
            {query
              ? "No matches. Try a name, nickname or username."
              : "No other accounts found. Ask your server owner to add someone."}
          </p>
        )}
      </div>
      <ErrorBox error={error} />
      <button
        className="primary full"
        disabled={busy || !selected.length || (isGroup && !name.trim())}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await onCreate(
              selected.map((p) => p.user_id),
              isGroup ? name : "",
            );
          } catch (e) {
            setError(describeError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? (
          <Loader2 className="spin" size={18} />
        ) : isGroup ? (
          "Create group"
        ) : (
          "Start conversation"
        )}
        <ArrowRight size={17} />
      </button>
    </Modal>
  );
}

function SettingsPanel({
  service,
  isDemo,
  name,
  me,
  onClose,
  tell,
  onLogout,
  redraw,
}) {
  const [settingsTab,setSettingsTab]=useState('account');
  const [displayName, setName] = useState(name),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmPassword, setConfirmPassword] = useState(""),
    [passphrase, setPassphrase] = useState(""),
    [password, setPassword] = useState(""),
    [newPassword, setNewPassword] = useState(""),
    [backup, setBackup] = useState(null),
    [devices, setDevices] = useState([]);
  const permission = isNative()
      ? "native"
      : "Notification" in window
        ? Notification.permission
        : "unsupported",
    blocked = isDemo ? [] : service.client.getIgnoredUsers(),
    recovery = service?.recovery;
  const run = async (fn, text) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      if (text) tell(text);
      redraw();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!isDemo)
      service.client
        .getDevices()
        .then((r) => setDevices(r.devices))
        .catch(() => {});
  }, []);
  const connected = isDemo || recovery?.state === "ready";
  return (
    <Modal
      title="Make yourself at home"
      subtitle="Your profile, preferences and a little peace of mind."
      onClose={onClose}
      wide
    >
      <nav className="settings-tabs" aria-label="Settings sections">{[['account','Account'],['appearance','Appearance & calls'],['notifications','Notifications'],['chats','Chats & storage'],['security','Security']].map(([id,label])=><button key={id} className={settingsTab===id?'active':''} onClick={()=>setSettingsTab(id)}>{label}</button>)}</nav>
      <div hidden={settingsTab!=='appearance'}><PreferencesPanel service={service}/></div>
      <div hidden={settingsTab!=='account'}><div className="settings-profile">
        <Avatar name={name} size="large" />
        <div>
          <h3>{name}</h3>
          <button
            className="copy-id"
            onClick={() =>
              navigator.clipboard
                .writeText(userHandle(me))
                .then(() => tell("Username copied."))
                .catch(() => tell(userHandle(me)))
            }
          >
            {userHandle(me)}
            <Copy size={12} />
          </button>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isDemo) {
            tell(
              "Profile changes are available when connected to your server.",
            );
            return;
          }
          run(
            () => service.client.setDisplayName(displayName),
            "Profile updated.",
          );
        }}
      >
        <label>
          Display name
          <div className="inline-input">
            <input
              value={displayName}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              required
            />
            <button className="secondary" disabled={busy}>
              Save
            </button>
          </div>
        </label>
      </form>
      </div><div hidden={settingsTab!=='chats'}>{!isDemo && <><StoragePanel service={service} tell={tell}/><section className="settings-section"><h3>Your shortcuts</h3><QuickReplySettings service={service} tell={tell}/><details><summary>Private nicknames</summary><NicknameEditor service={service} onClose={()=>{}} tell={tell}/></details></section></>}
      </div><div hidden={settingsTab!=='notifications'}>{isNative() && <NativeSettings tell={tell} />}
      <section className="settings-section">
        <div className="section-title">
          <Bell size={18} />
          <h3>Notifications</h3>
        </div>
        <p>
          {isNative()
            ? "Get Android notifications and reply without leaving what you’re doing. Enable Connected mode below for continuous background delivery and watch replies."
            : "Open tabs use Hasbreo sounds and gentle visual alerts. Browser notifications are reserved for when no Message tab is open. Background delivery depends on your browser and operating-system settings."}
        </p>
        <button
          className="secondary"
          onClick={() =>
            run(async () => {
              if (isNative()) {
                await nativeRequest("notificationPermission");
                return;
              }
              if (permission === "unsupported")
                throw new Error(
                  "Notifications are not supported in this browser.",
                );
              const p = await Notification.requestPermission();
              tell(
                p === "granted"
                  ? "Browser notifications enabled."
                  : p === "denied"
                    ? "Notifications are blocked. Change this in your browser’s site settings."
                    : "Notification permission was not granted.",
              );
              if(p==='granted'&&!isDemo){await enableBrowserPush(service);tell('Background alerts enabled. Open tabs use Hasbreo sounds instead.');}
              redraw();
            })
          }
        >
          <Bell size={15} />
          {permission === "granted"
            ? "Notifications enabled"
            : permission === "denied"
              ? "Blocked in browser settings"
              : "Enable notifications"}
        </button>
        {isNative() && (
          <button
            className="text-button notification-test"
            onClick={() =>
              run(
                () => nativeRequest("testNotification"),
                "Test notification sent.",
              )
            }
          >
            Send a test notification
          </button>
        )}
        {permission === "granted" && (
          <button
            className="text-button notification-test"
            onClick={() =>
              run(
                () =>
                  showNotification("You’re all set ✨", {
                    body: "Hasbreo notifications are working.",
                    tag: "hasbreo-test",
                  }),
                "Test notification sent.",
              )
            }
          >
            Send a test notification
          </button>
        )}
      </section>
      </div><div hidden={settingsTab!=='security'}><section className="settings-section">
        <div className="section-title">
          <ShieldCheck size={18} />
          <h3>Your history follows your login</h3>
        </div>
        <div className={`recovery-status ${connected ? "ready" : ""}`}>
          {connected ? (
            <CheckCircle2 size={18} />
          ) : ["checking", "setting-up", "restoring"].includes(
              recovery?.state,
            ) ? (
            <Loader2 size={18} className="spin" />
          ) : (
            <KeyRound size={18} />
          )}
          <span>
            {connected
              ? "Automatic encrypted recovery is on"
              : recovery?.state === "restoring"
                ? "Restoring your conversations…"
                : recovery?.state === "setting-up"
                  ? "Connecting automatic recovery…"
                  : "Confirm your password once to finish setup"}
          </span>
        </div>
        <p>
          Your messages stay encrypted. Your account password unlocks their
          backed-up keys automatically when you sign in on another device. No
          backup file or separate recovery phrase is required.
        </p>
        {recovery?.lastBackupAt > 0 && (
          <p className="help">
            Last key sync:{" "}
            {new Date(recovery.lastBackupAt).toLocaleTimeString()}
          </p>
        )}
        {!isDemo && !connected && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await recovery.unlock(confirmPassword);
                setConfirmPassword("");
              }, "Automatic history recovery is ready. Just use your normal login on other devices.");
            }}
          >
            <label>
              Account password
              <input
                type="password"
                autoComplete="current-password"
                placeholder="Your existing login password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </label>
            <button className="primary" disabled={busy || recovery?.busy}>
              Connect automatic recovery <ArrowRight size={16} />
            </button>
          </form>
        )}
        <ErrorBox error={recovery?.error} />
        <p className="help">
          Change your password here to keep recovery connected. If you forget
          it, an administrator can reset account access, but recovering old
          encrypted history still needs a signed-in device or an optional
          backup.
        </p>
      </section>
      {!isDemo && (
        <section className="settings-section">
          <div className="section-title">
            <Lock size={18} />
            <h3>Change password</h3>
          </div>
          <p>
            At least 8 characters. Letters and numbers are fine; no symbols or
            capital letters are required. Your encrypted history stays connected
            when you change it here.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await recovery.changePassword(password, newPassword);
                setPassword("");
                setNewPassword("");
              }, "Password changed. Your chat history will restore with your new password.");
            }}
          >
            <label>
              Current password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </label>
            <button className="secondary" disabled={busy}>
              Update password
            </button>
          </form>
        </section>
      )}
      <details className="settings-section advanced-recovery">
        <summary>
          Advanced recovery tools <ChevronDown size={14} />
        </summary>
        <p>
          Optional manual key backups and imports from the first version. These
          are not needed for normal sign-in once automatic recovery is
          connected.
        </p>
        <label>
          File-backup passphrase
          <input
            type="password"
            autoComplete="new-password"
            placeholder="At least 12 characters for this optional file"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        </label>
        <div className="button-row">
          <button
            className="secondary"
            disabled={busy || isDemo}
            onClick={() =>
              run(async () => {
                const text = await service.exportKeys(passphrase);
                const url = URL.createObjectURL(
                  new Blob([text], { type: "application/json" }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = `hasbreo-keys-${short(me)}-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 5000);
                setPassphrase("");
              }, "Optional encrypted key backup saved.")
            }
          >
            <Download size={16} /> Save optional backup
          </button>
          <label className="secondary file-label">
            <Upload size={16} /> Choose old backup
            <input
              type="file"
              accept="application/json,.json"
              hidden
              disabled={isDemo}
              onChange={(e) => setBackup(e.target.files[0])}
            />
          </label>
        </div>
        {backup && (
          <div className="restore-row">
            <span>{backup.name}</span>
            <button
              className="primary"
              disabled={busy || !passphrase}
              onClick={() =>
                run(async () => {
                  if (backup.size > 21000000)
                    throw new Error("Backup is too large.");
                  await service.importKeys(await backup.text(), passphrase);
                  setBackup(null);
                  setPassphrase("");
                }, "Keys restored. They will also sync to your automatic backup.")
              }
            >
              Import keys
            </button>
          </div>
        )}
      </details>
      {!isDemo && (
        <>
          <section className="settings-section">
            <div className="section-title">
              <ShieldCheck size={18} />
              <h3>Signed-in devices</h3>
            </div>
            {devices.map((d) => (
              <div className="device-row" key={d.device_id}>
                <span>
                  <strong>{d.display_name || "Browser session"}</strong>
                  <small>
                    {d.device_id === service.session.deviceId
                      ? "This device"
                      : d.device_id}{" "}
                    ·{" "}
                    {d.last_seen_ts
                      ? new Date(d.last_seen_ts).toLocaleDateString()
                      : "No activity yet"}
                  </small>
                </span>
                {d.device_id === service.session.deviceId && (
                  <span className="tag">Current</span>
                )}
              </div>
            ))}
            <p className="help">
              Your own devices are linked using encrypted cross-signing keys
              when you sign in. Contact identity verification and advanced
              session controls remain available through a full Matrix client
              such as Element.
            </p>
          </section>
          <section className="settings-section">
            <h3>Blocked accounts</h3>
            {!blocked.length ? (
              <p>No blocked accounts.</p>
            ) : (
              blocked.map((id) => (
                <div className="device-row" key={id}>
                  <span>{userHandle(id)}</span>
                  <button
                    className="text-button"
                    onClick={() =>
                      run(() => service.unignore(id), "Account unblocked.")
                    }
                  >
                    Unblock
                  </button>
                </div>
              ))
            )}
            <p className="help">
              Blocking hides their messages and notifications for you. Group
              membership is managed separately.
            </p>
          </section>
        </>
      )}
      </div><ErrorBox error={error} />
      <footer className="settings-bottom">
        <span>
          Hasbreo Message <b>1.2.0</b> · Powered by Matrix
        </span>
        <button className="text-button danger" onClick={onLogout}>
          <LogOut size={16} /> {isDemo ? "Leave demo" : "Sign out"}
        </button>
      </footer>
    </Modal>
  );
}

function Details({
  room,
  name,
  members,
  me,
  isDemo,
  service,
  onClose,
  onLeave,
  tell,
  redraw,
}) {
  const [newName, setName] = useState(name),
    [invite, setInvite] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [muted, setMuted] = useState(false),
    [confirmLeave, setConfirmLeave] = useState(false),
    [removeMember, setRemoveMember] = useState(null);
  const [nicknameOpen,setNicknameOpen]=useState(false);
  const canAdmin =
    !isDemo && room.currentState.maySendStateEvent("m.room.name", me);
  const run = async (fn, text) => {
    setBusy(true);
    setError("");
    try {
      if (isDemo) {
        tell("This setting is available when connected to your server.");
        return;
      }
      await fn();
      if (text) tell(text);
      redraw();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!isDemo) service.muted(room).then(setMuted);
  }, []);
  return (
    <Modal title="A little about this chat" onClose={onClose}>
      {!isDemo&&<ChatOptions service={service} room={room} onClose={()=>{}} onNickname={()=>setNicknameOpen(!nicknameOpen)} tell={tell}/>}
      {nicknameOpen&&!isDemo&&<NicknameEditor service={service} initialId={members.find(m=>m.userId!==me)?.userId} onClose={()=>setNicknameOpen(false)} tell={tell}/>}
      <div className="details-hero">
        <Avatar name={name} size="large" group={members.length > 2} />
        <h2>{name}</h2>
        <span className="tag">
          <Lock size={12} />
          {isDemo
            ? "Example conversation"
            : service.client.isRoomEncrypted(room.roomId)
              ? "End-to-end encrypted"
              : "Not encrypted"}
        </span>
      </div>
      {canAdmin && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => service.client.setRoomName(room.roomId, newName),
              "Conversation renamed.",
            );
          }}
        >
          <label>
            Conversation name
            <div className="inline-input">
              <input
                value={newName}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                required
              />
              <button className="secondary" disabled={busy}>
                Save
              </button>
            </div>
          </label>
        </form>
      )}
      <div className="section-title">
        <Users size={17} />
        <h3>{members.length} people</h3>
      </div>
      <div className="member-list">
        {members.map((m) => (
          <div className="person-row" key={m.userId}>
            <Avatar
              name={(isDemo?displayName(m.name,m.userId):service.personName(m.userId,m.name))}
              presence={!isDemo ? service.presenceInfo(m.userId) : null}
            />
            <span>
              <strong>
                {(isDemo?displayName(m.name,m.userId):service.personName(m.userId,m.name))}
                {m.userId === me ? " (you)" : ""}
              </strong>
              <small>
                {m.membership === "invite" ? "Invited · " : ""}
                {userHandle(m.userId)}
                {!isDemo && m.membership !== "invite"
                  ? " · " + presenceLabel(service.presenceInfo(m.userId))
                  : ""}
              </small>
            </span>
            {m.userId !== me && !isDemo && (
              <div className="member-controls">
                <button
                  className="text-button danger"
                  onClick={() =>
                    run(
                      () => service.ignore(m.userId),
                      "Account blocked. Messages from this account are now hidden.",
                    )
                  }
                >
                  Block
                </button>
                {canAdmin &&
                  (room.getMember(me)?.powerLevel || 0) >
                    (m.powerLevel || 0) && (
                    <button
                      className="text-button danger"
                      onClick={() => setRemoveMember(m)}
                    >
                      Remove
                    </button>
                  )}
              </div>
            )}
          </div>
        ))}
      </div>
      {!isDemo && !service.isDirect(room) && room.canInvite(me) && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await service.client.invite(
                room.roomId,
                userId(invite, service.domain),
              );
              setInvite("");
            }, "Invitation sent.");
          }}
        >
          <label>
            Add someone
            <div className="inline-input">
              <input
                placeholder="@username"
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
                required
                autoCapitalize="none"
              />
              <button className="secondary" disabled={busy}>
                <UserPlus size={17} />
              </button>
            </div>
          </label>
        </form>
      )}
      <ErrorBox error={error} />
      <div className="details-actions">
        <button
          className="secondary"
          onClick={() =>
            run(
              async () => {
                await service.mute(room, !muted);
                setMuted(!muted);
              },
              muted ? "Conversation unmuted." : "Conversation muted.",
            )
          }
          disabled={busy}
        >
          {muted ? <Bell size={16} /> : <BellOff size={16} />}{" "}
          {muted ? "Unmute conversation" : "Mute conversation"}
        </button>
        {!confirmLeave ? (
          <button
            className="text-button danger"
            onClick={() => setConfirmLeave(true)}
          >
            Leave conversation
          </button>
        ) : (
          <div className="leave-confirm">
            <p>
              Leave this conversation? Someone in the group can add you again.
            </p>
            <div className="button-row">
              <button
                className="secondary"
                onClick={() => setConfirmLeave(false)}
              >
                Stay
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await service.client.leave(room.roomId);
                    onLeave();
                  })
                }
              >
                Leave
              </button>
            </div>
          </div>
        )}
      </div>
      {removeMember && (
        <Confirm
          title={`Remove ${removeMember.name}?`}
          text="They will leave this group and need to be added again to return."
          action="Remove from group"
          onClose={() => setRemoveMember(null)}
          onConfirm={async () => {
            await service.client.kick(
              room.roomId,
              removeMember.userId,
              "Removed by group administrator",
            );
            setRemoveMember(null);
            redraw();
          }}
        />
      )}
    </Modal>
  );
}

function StoragePanel({ service, tell }) {
  const [usage, setUsage] = useState(null),
    [files, setFiles] = useState([]),
    [expanded, setExpanded] = useState(false),
    [confirm, setConfirm] = useState(null),
    [error, setError] = useState(""),[sort,setSort]=useState("date"),[direction,setDirection]=useState("desc");
  const load = async () => {
    try {
      const [info, list] = await Promise.all([
        service.storageUsage(),
        service.storedFiles(sort,direction),
      ]);
      setUsage(info);
      setFiles(list.files);
      setError("");
    } catch (e) {
      setError(describeError(e));
    }
  };
  useEffect(() => {
    load();
  }, [sort,direction]);
  const names = new Map();
  for (const r of service.client.getRooms())
    for (const e of r.getLiveTimeline().getEvents()) {
      const c = e.getContent();
      if (c[FILE_KEY]) names.set(c[FILE_KEY].id, c.body);
    }
  return (
    <section className="settings-section">
      <div className="section-title">
        <Paperclip size={18} />
        <h3>Your storage</h3>
        <button className="text-button" onClick={load}>
          Refresh
        </button>
      </div>
      {usage ? (
        <>
          <div className="storage-number">
            <strong>{bytes(usage.used)}</strong>
            <span>of {bytes(usage.limit)}</span>
          </div>
          <progress
            className="storage-meter"
            value={usage.used + usage.reserved}
            max={usage.limit || 1}
          />
          <p>
            {bytes(usage.remaining)} remaining
            {usage.reserved > 0
              ? ` · ${bytes(usage.reserved)} reserved by uploads`
              : ""}
            . Your next file can be up to {bytes(usage.maxUploadBytes)}.
          </p>
          <p className="help">
            Photos and files count toward your allowance, including uploads from
            the first version. Available server disk space can reduce the upload
            limit.
          </p>
        </>
      ) : (
        <p>Checking your allowance…</p>
      )}
      <button className="text-button" onClick={() => setExpanded(!expanded)}>
        {expanded ? "Hide" : "Manage"} uploaded files
      </button>
      {expanded && (
        <div className="stored-files"><div className="storage-sorting"><label>Sort by<select aria-label="Sort personal storage" value={sort} onChange={e=>setSort(e.target.value)}><option value="date">Date</option><option value="size">Size</option></select></label><button className="secondary" onClick={()=>setDirection(v=>v==='desc'?'asc':'desc')}>{sort==='date'?(direction==='desc'?'Newest first':'Oldest first'):(direction==='desc'?'Largest first':'Smallest first')}</button></div>
          {files.length ? (
            files.map((f) => (
              <div className="device-row" key={f.id}>
                <span>
                  <strong>{names.get(f.id) || "Shared file"}</strong>
                  <small>
                    {bytes(f.size)} ·{" "}
                    {new Date(f.created * 1000).toLocaleDateString()} ·{" "}
                    {f.status === "pending" ? "Unfinished upload" : "Uploaded"}
                  </small>
                </span>
                <button
                  className="text-button danger"
                  onClick={() => setConfirm(f)}
                >
                  Delete
                </button>
              </div>
            ))
          ) : (
            <p>No files uploaded with this version yet.</p>
          )}
          <p className="help">
            Deleting a file frees your allowance and makes its attachment
            unavailable in every chat. Files from the first version are included
            in usage but are managed on the server.
          </p>
        </div>
      )}
      <ErrorBox error={error} />
      {confirm && (
        <Confirm
          title="Delete this uploaded file?"
          text="It will become unavailable to everyone in the chat. This frees your storage; it does not remove copies already downloaded."
          action="Delete file"
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await service.deleteFile(confirm.id);
            setConfirm(null);
            await load();
            tell("File deleted. Your allowance has been updated.");
          }}
        />
      )}
    </section>
  );
}
function QuotaRow({ account, service, reload, tell }) {
  const [quota, setQuota] = useState(String(account.storage.limit / 1e9)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="admin-account">
      <Avatar
        name={displayName(account.displayname, account.name)}
        size="tiny"
      />
      <div className="admin-account-name">
        <strong>{displayName(account.displayname, account.name)}</strong>
        <small>
          {userHandle(account.name)}
          {account.admin ? " · Admin" : ""}
          {account.deactivated ? " · Deactivated" : ""}
        </small>
        <span>
          {bytes(account.storage.used)} used
          {account.storage.reserved
            ? ` · ${bytes(account.storage.reserved)} uploading`
            : ""}
        </span>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const n = Number(quota);
            if (!Number.isFinite(n) || n < 0 || n > 25)
              throw new Error("Choose 0–25 GB.");
            await service.setQuota(account.name, Math.round(n * 1e9));
            await reload();
            tell("Storage allowance updated.");
          } catch (e) {
            setError(describeError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Allowance · GB
          <input
            type="number"
            min="0"
            max="25"
            step="0.1"
            aria-label={`Storage allowance for ${userHandle(account.name)}`}
            value={quota}
            onChange={(e) => setQuota(e.target.value)}
            required
          />
        </label>
        <button className="secondary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
      <ErrorBox error={error} />
    </div>
  );
}
function AdminPanel({ service, onClose, tell }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uses, setUses] = useState(10),
    [days, setDays] = useState(30),
    [invite, setInvite] = useState(null);
  const load = async () => {
    const result = await service.adminOverview();
    setData(result);
  };
  useEffect(() => {
    load().catch((e) => setError(describeError(e)));
  }, []);
  return (
    <Modal
      title="Your server, your rules."
      subtitle="Accounts, access, storage and invitations, in one place."
      onClose={onClose}
      wide
    >
      <div className="admin-heading">
        <ShieldCheck size={20} />
        <span>{service.domain}</span>
        <button
          className="text-button"
          onClick={() => load().catch((e) => setError(describeError(e)))}
        >
          Refresh
        </button>
      </div>
      <ErrorBox error={error} />
      {!data ? (
        <p>Loading server settings…</p>
      ) : (
        <>
          <div className="admin-stats">
            <div>
              <strong>{data.accounts.total}</strong>
              <span>Accounts</span>
            </div>
            <div>
              <strong>25 GB</strong>
              <span>Default allowance</span>
            </div>
            <div>
              <strong>8+</strong>
              <span>Password characters</span>
            </div>
          </div>
          <AdminUsers service={service} accounts={data.accounts.users} reload={load} tell={tell}/>
          <section className="settings-section">
            <h3>Account storage</h3>
            <p>
              Every account starts with 25 GB. You can set a smaller allowance
              here. Lowering it keeps existing files; uploads pause if the
              account is already over its limit.
            </p>
            <div className="admin-accounts">
              {data.accounts.users.map((a) => (
                <QuotaRow
                  key={a.name}
                  account={a}
                  service={service}
                  reload={load}
                  tell={tell}
                />
              ))}
            </div>
            {data.accounts.total > data.accounts.users.length && (
              <p className="help">
                Showing the first {data.accounts.users.length} accounts.
              </p>
            )}
          </section>
          <section className="settings-section">
            <h3>Invite someone in</h3>
            <p>
              An invite’s expiry only affects new registrations. Existing
              accounts and their conversations stay available.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  setInvite(
                    await service.createInvite(Number(uses), Number(days)),
                  );
                } catch (e) {
                  setError(describeError(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="invite-fields">
                <label>
                  Number of accounts
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={uses}
                    onChange={(e) => setUses(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Valid for · days
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                    required
                  />
                </label>
              </div>
              <button className="primary" disabled={busy}>
                {busy ? "Creating…" : "Create invite"}
                <UserPlus size={16} />
              </button>
            </form>
            {invite && (
              <div className="invite-result">
                <code>{invite.token}</code>
                <button
                  className="secondary"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(invite.token)
                      .then(() => tell("Invite code copied."))
                      .catch(() => setError("Copy the code displayed above."))
                  }
                >
                  <Copy size={15} />
                  Copy invite
                </button>
              </div>
            )}
          </section>
          <p className="help">
            Database backups and administrator password resets remain available
            over SSH with the included server scripts.
          </p>
        </>
      )}
    </Modal>
  );
}

function NativeSettings({ tell }) {
  const [settings, setSettings] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    nativeRequest("preferences")
      .then(setSettings)
      .catch((e) => setError(e.message));
  }, []);
  const toggle = async (key, value) => {
    try {
      setSettings(await nativeRequest("setPreference", { key, value }));
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <section className="settings-section native-settings">
      <div className="section-title">
        <Smartphone size={18} />
        <h3>Made for your phone</h3>
      </div>
      {settings && (
        <>
          {[
            [
              "connected",
              "Connected mode",
              "Keeps chats and watch replies connected in the background, with a small ongoing notification. Uses more battery than opening the app only.",
            ],
            [
              "previews",
              "Message previews",
              "Show message text in notifications. Turn off for private alerts.",
            ],
            [
              "haptics",
              "A little feedback",
              "Subtle vibration for sends and reactions.",
            ],
            [
              "appLock",
              "Lock the app",
              "Require fingerprint, face or phone unlock when returning.",
            ],
          ].map(([key, title, detail]) => (
            <label className="native-setting" key={key}>
              <span>
                <strong>{title}</strong>
                <small>{detail}</small>
              </span>
              <input
                type="checkbox"
                checked={!!settings[key]}
                onChange={(e) => toggle(key, e.target.checked)}
              />
            </label>
          ))}
        </>
      )}
      <div className="button-row">
        <button
          className="secondary"
          onClick={() =>
            nativeRequest("pendingReplies").catch((e) => setError(e.message))
          }
        >
          Pending replies
        </button>
        <button
          className="secondary"
          onClick={() =>
            nativeRequest("pairWatch").catch((e) => setError(e.message))
          }
        >
          <Watch size={17} /> Connect your watch
        </button>
        <button
          className="secondary"
          onClick={() =>
            nativeRequest("batterySettings").catch((e) => setError(e.message))
          }
        >
          Background battery settings
        </button><button className="secondary" onClick={()=>nativeRequest('connectionNotificationSettings').catch(e=>setError(e.message))}>Hide Connected mode notification…</button>
        <button
          className="text-button"
          onClick={() =>
            nativeRequest("checkUpdate").catch((e) => setError(e.message))
          }
        >
          Check for updates ↗
        </button>
      </div>
      <p className="help">
        Watch messages and replies travel through this phone. No password or
        message keys are sent to the watch. Android can stop delivery after a
        force-stop or if background activity is restricted.
      </p>
      <ErrorBox error={error} />
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
