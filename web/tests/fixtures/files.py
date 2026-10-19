"""Authenticated chunked ciphertext storage and scoped administration for Hasbreo.

File names and encryption keys stay inside encrypted Matrix messages. Account
quotas include legacy Matrix media. Reservations are enforced transactionally;
unfinished uploads expire, and no upload can exceed available account/disk space.
"""
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import sqlite3
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import Request, urlopen

ROOT = Path(os.getenv('CHAT_STORAGE_ROOT', '/data'))
SY = os.getenv('CHAT_SYNAPSE_URL', 'http://synapse:8008').rstrip('/')
DOMAIN = os.getenv('CHAT_DOMAIN', 'message.hasbreo.com')
QUOTA = 25_000_000_000  # 25 decimal GB, as displayed in the app.
CHUNK = 8 * 1024 * 1024
HEADROOM = int(os.getenv('CHAT_DISK_HEADROOM_BYTES', str(256 * 1024 * 1024)))
LOCK = threading.RLock()
TRANSFER_LOCKS = [threading.RLock() for _ in range(256)]
AUTH_CACHE = {}
ROOT.mkdir(parents=True, exist_ok=True)
DB = sqlite3.connect(ROOT / 'files.sqlite3', check_same_thread=False)
DB.row_factory = sqlite3.Row
DB.execute('PRAGMA journal_mode=WAL')
DB.executescript('''CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY, owner TEXT NOT NULL, size INTEGER NOT NULL, chunks INTEGER NOT NULL, status TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS chunks(upload_id TEXT NOT NULL, idx INTEGER NOT NULL, size INTEGER NOT NULL, PRIMARY KEY(upload_id,idx));
CREATE TABLE IF NOT EXISTS quotas(owner TEXT PRIMARY KEY, bytes INTEGER NOT NULL);''')
DB.commit()

class Rejected(Exception):
    def __init__(self, status, message): self.status, self.message = status, message

def synapse(path, token, method='GET', body=None):
    headers = {'Authorization': 'Bearer ' + token}
    if body is not None: headers['Content-Type'] = 'application/json'
    request = Request(SY + path, data=json.dumps(body).encode() if body is not None else None, headers=headers, method=method)
    try:
        with urlopen(request, timeout=12) as response: return json.load(response)
    except HTTPError as error:
        try: message=json.load(error).get('error', 'Request rejected')
        except Exception: message='Request rejected'
        raise Rejected(error.code, message) from None

def identity(token):
    if not token: raise Rejected(401, 'Sign in to use file storage.')
    digest = hashlib.sha256(token.encode()).digest()
    cached = AUTH_CACHE.get(digest)
    if cached and cached[0] > time.time(): return cached[1]
    result = synapse('/_matrix/client/v3/account/whoami', token)
    user = result['user_id']
    if user.split(':', 1)[1] != DOMAIN: raise Rejected(403, 'Choose an account on this server.')
    if len(AUTH_CACHE) > 1000: AUTH_CACHE.clear()
    AUTH_CACHE[digest] = (time.time() + 10, user)
    return user

def administrator(token, user):
    try: return bool(synapse('/_synapse/admin/v1/users/' + quote(user, safe='') + '/admin', token).get('admin'))
    except Rejected as error:
        if error.status in (401, 403): return False
        raise

def legacy_bytes(user):
    fixture = os.getenv('LEGACY_SQLITE_PATH')
    if fixture:
        with sqlite3.connect(fixture) as connection:
            return int(connection.execute('SELECT COALESCE(SUM(media_length),0) FROM local_media_repository WHERE user_id=?', (user,)).fetchone()[0])
    import psycopg2
    with psycopg2.connect(host='database', dbname='synapse', user='synapse', password=os.environ['POSTGRES_PASSWORD'], connect_timeout=8) as connection:
        with connection.cursor() as cursor:
            cursor.execute('SELECT COALESCE(SUM(media_length),0) FROM local_media_repository WHERE user_id=%s', (user,))
            return int(cursor.fetchone()[0])

def expire():
    old = DB.execute("SELECT id FROM uploads WHERE status='pending' AND updated<?", (int(time.time()) - 86400,)).fetchall()
    for row in old:
        shutil.rmtree(ROOT / row['id'], ignore_errors=True)
        DB.execute('DELETE FROM chunks WHERE upload_id=?', (row['id'],))
        DB.execute('DELETE FROM uploads WHERE id=?', (row['id'],))
    DB.commit()

def usage(user):
    override = DB.execute('SELECT bytes FROM quotas WHERE owner=?', (user,)).fetchone()
    limit = min(QUOTA, override['bytes']) if override else QUOTA
    used = int(DB.execute("SELECT COALESCE(SUM(size),0) FROM uploads WHERE owner=? AND status='ready'", (user,)).fetchone()[0]) + legacy_bytes(user)
    reserved = int(DB.execute("SELECT COALESCE(SUM(size),0) FROM uploads WHERE owner=? AND status='pending'", (user,)).fetchone()[0])
    pending = DB.execute("SELECT id,size,chunks FROM uploads WHERE status='pending'").fetchall()
    disk_reserved = sum(max(0, row['size'] + row['chunks'] * 16 - DB.execute('SELECT COALESCE(SUM(size),0) FROM chunks WHERE upload_id=?', (row['id'],)).fetchone()[0]) for row in pending)
    free = max(0, shutil.disk_usage(ROOT).free - disk_reserved - HEADROOM)
    available = max(0, limit - used - reserved)
    return {'limit':limit, 'used':used, 'reserved':reserved, 'remaining':available, 'maxUploadBytes':min(available,max(0,free-((free+CHUNK-1)//CHUNK)*16)), 'serverFreeBytes':free, 'chunkSize':CHUNK}

def get_upload(upload_id):
    if not re.fullmatch('[a-f0-9]{32}', upload_id): raise Rejected(404, 'File not found.')
    row = DB.execute('SELECT * FROM uploads WHERE id=?', (upload_id,)).fetchone()
    if not row: raise Rejected(404, 'File not found.')
    return row

class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def log_message(self, *args): pass  # Do not log bearer tokens, IDs or private requests.
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()
    def respond(self, status, value):
        data=json.dumps(value).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
    def body(self, max_size=16384):
        size=int(self.headers.get('Content-Length','0'))
        if size<0 or size>max_size: raise Rejected(413,'Request is too large.')
        try: return json.loads(self.rfile.read(size) or b'{}')
        except (ValueError, UnicodeError): raise Rejected(400,'Invalid JSON request.') from None
    def do_OPTIONS(self): self.respond(200,{})
    def do_GET(self): self.handle_request()
    def do_POST(self): self.handle_request()
    def do_PUT(self): self.handle_request()
    def do_DELETE(self): self.handle_request()
    def handle_request(self):
        self.connection.settimeout(120)
        try:
            parsed=urlparse(self.path);path=parsed.path
            if path=='/health': self.respond(200,{'ok':True});return
            authorization=self.headers.get('Authorization','')
            token=authorization[7:].strip() if authorization.startswith('Bearer ') else '';user=identity(token)
            if path.startswith('/hasbreo/files/admin/'):
                self.admin(path,token,user);return
            with LOCK:
                if self.command=='GET' and path=='/hasbreo/files/list':
                    expire();rows=DB.execute('SELECT id,size,status,created FROM uploads WHERE owner=? ORDER BY created DESC LIMIT 200',(user,)).fetchall();self.respond(200,{'files':[dict(row) for row in rows]});return
                if self.command=='GET' and path=='/hasbreo/files/usage':
                    expire();self.respond(200,usage(user));return
                if self.command=='POST' and path=='/hasbreo/files/init':
                    data=self.body();size=data.get('size')
                    if type(size) is not int or not 0<size<=QUOTA: raise Rejected(400,'Choose a non-empty file within your storage allowance.')
                    expire()
                    if DB.execute("SELECT COUNT(*) FROM uploads WHERE owner=? AND status='pending'",(user,)).fetchone()[0]>=8: raise Rejected(429,'Too many unfinished uploads. Cancel an upload or try again later.')
                    info=usage(user)
                    if size>info['remaining']: raise Rejected(413,'This file exceeds your remaining account storage.')
                    chunks=(size+CHUNK-1)//CHUNK
                    if size+chunks*16>info['serverFreeBytes']: raise Rejected(507,'The server does not have enough free disk space for this file.')
                    upload_id=secrets.token_hex(16);now=int(time.time());(ROOT/upload_id).mkdir(mode=0o700)
                    DB.execute("INSERT INTO uploads VALUES(?,?,?,?,?,?,?)",(upload_id,user,size,chunks,'pending',now,now));DB.commit()
                    self.respond(201,{'id':upload_id,'chunkSize':CHUNK,'chunks':chunks});return
            match=re.fullmatch(r'/hasbreo/files/([a-f0-9]{32})(?:/(complete|chunks)/(\d+)?)?',path)
            if not match:
                # Complete has no trailing slash/index.
                complete=re.fullmatch(r'/hasbreo/files/([a-f0-9]{32})/complete',path)
                if complete: match=complete;kind='complete';index=None
                else: raise Rejected(404,'Endpoint not found.')
            else: kind=match.group(2);index=match.group(3)
            upload_id=match.group(1)
            self.transfer(upload_id,kind,index,user)
        except Rejected as error:
            self.close_connection=True;self.respond(error.status,{'error':error.message})
        except (BrokenPipeError,ConnectionResetError): pass
        except Exception:
            self.close_connection=True
            with contextlib.suppress(Exception): self.respond(503,{'error':'Storage service is temporarily unavailable. Please try again.'})
    def transfer(self,upload_id,kind,index,user):
        # Serialize writes/deletion of one file; different files can transfer
        # concurrently. Global quota reservations hold only a brief DB lock.
        with TRANSFER_LOCKS[int(upload_id[:2],16)]:
            with LOCK:
                row=get_upload(upload_id)
                if self.command!='GET' and row['owner']!=user: raise Rejected(403,'This file belongs to another account.')
                if self.command=='DELETE' and kind is None:
                    shutil.rmtree(ROOT/upload_id,ignore_errors=True);DB.execute('DELETE FROM chunks WHERE upload_id=?',(upload_id,));DB.execute('DELETE FROM uploads WHERE id=?',(upload_id,));DB.commit();self.respond(200,{});return
                if self.command=='POST' and kind=='complete':
                    self.body();count=DB.execute('SELECT COUNT(*) FROM chunks WHERE upload_id=?',(upload_id,)).fetchone()[0]
                    if count!=row['chunks']: raise Rejected(409,'The upload has not finished yet.')
                    DB.execute("UPDATE uploads SET status='ready',updated=? WHERE id=?",(int(time.time()),upload_id));DB.commit();self.respond(200,{'id':upload_id});return
                if kind!='chunks' or index is None: raise Rejected(405,'Method not allowed.')
                index=int(index)
                if not 0<=index<row['chunks']: raise Rejected(404,'Chunk not found.')
                expected=min(CHUNK,row['size']-index*CHUNK)+16;chunk_path=ROOT/upload_id/str(index)
                if self.command=='GET':
                    if row['status']!='ready' or not chunk_path.is_file(): raise Rejected(404,'File is unavailable.')
                else:
                    if self.command!='PUT' or row['status']!='pending': raise Rejected(409,'This upload is no longer open.')
                    size=int(self.headers.get('Content-Length','-1'))
                    if size!=expected: raise Rejected(400,'Unexpected encrypted chunk size.')
                    # Keep expiry from racing a live, slow chunk transfer.
                    DB.execute('UPDATE uploads SET updated=? WHERE id=?',(int(time.time()),upload_id));DB.commit()
            if self.command=='GET':
                self.send_response(200);self.send_header('Content-Type','application/octet-stream');self.send_header('Content-Length',str(expected));self.end_headers()
                with chunk_path.open('rb') as source: shutil.copyfileobj(source,self.wfile,65536)
                return
            if chunk_path.exists():
                if chunk_path.stat().st_size!=size: raise Rejected(409,'Stored chunk is incomplete. Cancel and retry this file.')
                self.rfile.read(size)
                with LOCK:
                    DB.execute('INSERT OR IGNORE INTO chunks VALUES(?,?,?)',(upload_id,index,size));DB.commit()
                self.respond(200,{});return
            temporary=chunk_path.with_suffix('.part')
            try:
                with temporary.open('wb') as destination:
                    remaining=size
                    while remaining:
                        part=self.rfile.read(min(65536,remaining))
                        if not part: raise Rejected(400,'Upload connection ended early.')
                        destination.write(part);remaining-=len(part)
                    destination.flush();os.fsync(destination.fileno())
                with LOCK:
                    os.replace(temporary,chunk_path)
                    DB.execute('INSERT INTO chunks VALUES(?,?,?)',(upload_id,index,size));DB.execute('UPDATE uploads SET updated=? WHERE id=?',(int(time.time()),upload_id));DB.commit()
            finally:
                with contextlib.suppress(FileNotFoundError): temporary.unlink()
            self.respond(200,{})
    def admin(self,path,token,user):
        allowed=administrator(token,user)
        if path=='/hasbreo/files/admin/status' and self.command=='GET': self.respond(200,{'admin':allowed});return
        if not allowed: raise Rejected(403,'A server administrator account is required.')
        if path=='/hasbreo/files/admin/overview' and self.command=='GET':
            accounts=synapse('/_synapse/admin/v2/users?limit=200&guests=false',token)
            policy=synapse('/_matrix/client/v3/password_policy',token)
            with LOCK:
                expire()
                for account in accounts['users']: account['storage']=usage(account['name'])
            self.respond(200,{'accounts':accounts,'policy':policy,'defaultQuotaBytes':QUOTA});return
        if path=='/hasbreo/files/admin/quota' and self.command=='POST':
            data=self.body();account=data.get('userId','');limit=data.get('bytes')
            if type(limit) is not int or not 0<=limit<=QUOTA: raise Rejected(400,'Choose a quota from 0 to 25 GB.')
            if not isinstance(account,str) or ':' not in account or account.split(':',1)[1]!=DOMAIN: raise Rejected(400,'Choose an account on this server.')
            synapse('/_synapse/admin/v2/users/'+quote(account,safe=''),token)
            with LOCK:
                DB.execute('INSERT INTO quotas VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET bytes=excluded.bytes',(account,limit));DB.commit()
                self.respond(200,usage(account));return
        if path=='/hasbreo/files/admin/invite' and self.command=='POST':
            data=self.body();uses=data.get('uses');days=data.get('days')
            if type(uses) is not int or not 1<=uses<=1000 or type(days) is not int or not 1<=days<=365: raise Rejected(400,'Choose 1–1000 accounts and 1–365 days.')
            result=synapse('/_synapse/admin/v1/registration_tokens/new',token,'POST',{'token':secrets.token_urlsafe(18),'uses_allowed':uses,'expiry_time':int((time.time()+days*86400)*1000)})
            self.respond(201,result);return
        raise Rejected(404,'Admin action not found.')

class Server(ThreadingHTTPServer):
    daemon_threads=True
    slots=threading.BoundedSemaphore(32)
    def process_request(self,request,address):
        if not self.slots.acquire(blocking=False): self.shutdown_request(request);return
        try: super().process_request(request,address)
        except Exception: self.slots.release();raise
    def process_request_thread(self,*args):
        try: super().process_request_thread(*args)
        finally: self.slots.release()

if __name__=='__main__':
    print('Hasbreo encrypted storage ready. Account limit: 25 GB.',flush=True)
    Server((os.getenv('CHAT_BIND','0.0.0.0'),int(os.getenv('CHAT_PORT','8096'))),Handler).serve_forever()
