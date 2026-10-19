"""Sign in CI without putting passwords or private material in command output."""
import base64,os,pathlib,re,subprocess,sys,tempfile
sdk=pathlib.Path(os.environ.get('ANDROID_HOME',os.environ.get('ANDROID_SDK_ROOT','')))
tools=sorted((sdk/'build-tools').iterdir())[-1]
source=pathlib.Path(sys.argv[1]);output=pathlib.Path(sys.argv[2]);output.parent.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory() as directory:
 p=pathlib.Path(directory);key=p/'signing.p12';password=p/'store-password';keypass=p/'key-password';aligned=p/'aligned.apk'
 key.write_bytes(base64.b64decode(os.environ['MESSAGE_KEYSTORE_BASE64']));password.write_text(os.environ['MESSAGE_KEYSTORE_PASSWORD']);keypass.write_text(os.environ['MESSAGE_KEY_PASSWORD'])
 for file in [key,password,keypass]:file.chmod(0o600)
 subprocess.run([str(tools/'zipalign'),'-P','16','-f','4',str(source),str(aligned)],check=True)
 subprocess.run([str(tools/'apksigner'),'sign','--ks',str(key),'--ks-key-alias','hasbreo-message','--ks-pass','file:'+str(password),'--key-pass','file:'+str(keypass),'--v1-signing-enabled','false','--v2-signing-enabled','true','--v3-signing-enabled','true','--v4-signing-enabled','false','--out',str(output),str(aligned)],check=True)
 subprocess.run([str(tools/'apksigner'),'verify','--verbose','--print-certs',str(output)],check=True)
