"""Verify an installable, signed APK before distributing it."""
import hashlib,json,pathlib,subprocess,sys
apk=pathlib.Path(sys.argv[1]);sdk=pathlib.Path(sys.argv[2]);tools=sorted((sdk/'build-tools').iterdir())[-1]
print(subprocess.check_output([str(tools/'apksigner'),'verify','--verbose','--print-certs',str(apk)],text=True))
info=subprocess.check_output([str(tools/'aapt2'),'dump','badging',str(apk)],text=True)
assert "name='com.hasbreo.message'" in info and "versionName='1.0.0'" in info and "sdkVersion:'30'" in info
print(json.dumps({'file':apk.name,'bytes':apk.stat().st_size,'sha256':hashlib.sha256(apk.read_bytes()).hexdigest()},indent=2))
