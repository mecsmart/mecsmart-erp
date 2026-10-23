"""Verify every backend dependency has a pre-built Windows wheel for a given Python.
Usage:  python windows\check-wheels.py 3.15      (default: the running interpreter)
Nothing is installed; wheels are downloaded to a temp folder and removed."""
import subprocess, sys, tempfile, shutil, os

ver = sys.argv[1] if len(sys.argv) > 1 else f"{sys.version_info[0]}.{sys.version_info[1]}"
abi = "cp" + ver.replace(".", "")
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
req = os.path.join(root, "backend", "requirements-windows.txt")
tmp = tempfile.mkdtemp(prefix="mecsmart-wheels-")
cmd = [sys.executable, "-m", "pip", "download", "--only-binary=:all:", "--python-version", ver,
       "--platform", "win_amd64", "--implementation", "cp", "--abi", abi, "--abi", "abi3", "--abi", "none",
       "-r", req, "-d", tmp, "-q"]
print(f"Checking Windows wheels for CPython {ver} ...")
rc = subprocess.call(cmd)
if rc == 0:
    names = sorted(f for f in os.listdir(tmp) if f.endswith(".whl"))
    print(f"OK - {len(names)} wheels available:")
    for n in names:
        print("  ", n)
else:
    print("FAILED - at least one package has no pre-built wheel for this Python. See pip output above.")
shutil.rmtree(tmp, ignore_errors=True)
sys.exit(rc)
