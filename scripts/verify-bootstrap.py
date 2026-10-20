"""Unpack the signed first-release artifact and verify its public identity."""
import io,gzip,hashlib,json,os,pathlib,re,subprocess
root=pathlib.Path(__file__).resolve().parents[1];m=json.loads((root/'release/manifest.json').read_text())
assert m['platform'] in ['phone','watch']
assert re.fullmatch(r'\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?',m['version'])
assert re.fullmatch(r'[a-f0-9]{40}',m['sourceCommit'])
assert m['filename']==f"HasbreoMessage-{m['platform'].capitalize()}-v{m['version']}.apk"
parts=sorted((root/'release').glob('bootstrap.apk.gz.part-*'))
assert parts and [p.name for p in parts]==[f'bootstrap.apk.gz.part-{i:03d}' for i in range(len(parts))]
compressed=b''.join(p.read_bytes() for p in parts)
assert len(compressed)<50*1024*1024
with gzip.GzipFile(fileobj=io.BytesIO(compressed),mode='rb') as stream: data=stream.read(50*1024*1024+1)
assert len(data)==m['size'] and len(data)<50*1024*1024
assert hashlib.sha256(data).hexdigest()==m['sha256']
apk=root/m['filename'];apk.write_bytes(data)
sdk=pathlib.Path(os.environ['ANDROID_HOME']);tools=sdk/'build-tools/36.0.0'
if not tools.exists():tools=sorted((sdk/'build-tools').iterdir())[-1]
verified=subprocess.check_output([str(tools/'apksigner'),'verify','--verbose','--print-certs',str(apk)],text=True)
certificate=re.search(r'Signer #1 certificate SHA-256 digest: ([a-fA-F0-9]+)',verified).group(1).lower()
assert certificate==m['certificateSha256']
info=subprocess.check_output([str(tools/'aapt2'),'dump','badging',str(apk)],text=True)
assert "name='com.hasbreo.message'" in info and f"versionName='{m['version']}'" in info and re.search(r"(?m)^(?:minSdkVersion|sdkVersion):'30'$",info)
if m['platform']=='watch':assert "name='android.hardware.type.watch'" in info
(root/'SHA256SUMS.txt').write_text(m['sha256']+'  '+m['filename']+'\n')
print(json.dumps({'filename':m['filename'],'version':m['version'],'sourceCommit':m['sourceCommit'],'certificateSha256':certificate}))
