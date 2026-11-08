#!/usr/bin/env python3
"""List + download the APK artifact from the successful AKWeb browser run."""
import json
import sys
import urllib.error
import urllib.request
import zipfile
import os

sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
from dynamic_credentials import add_surrogate_to_request

API = "https://api.github.com"
# v2.44: RUN_ID DULU HARDCODE 40743468559 (build kuno, masih ada akweb-extension)
# → download_artifact.py salah ambil artefak lama. Sekarang wajib diisi dari argumen.
RUN_ID = int(sys.argv[1]) if len(sys.argv) > 1 else None
if not RUN_ID:
    print("USAGE: download_artifact.py <run_id>  (lihat Actions runs, JANGAN pakai hardcoded id)")
    sys.exit(2)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def api_get(path):
    req = urllib.request.Request(API + path, method="GET")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    add_surrogate_to_request(req, "custom.github", allowed_hosts=["api.github.com"])
    with urllib.request.build_opener(NoRedirect()).open(req, timeout=60) as resp:
        return resp.status, resp.headers, resp.read()


def main():
    status, _h, raw = api_get(f"/repos/NandSki/akweb-browser/actions/runs/{RUN_ID}/artifacts")
    data = json.loads(raw.decode())
    print("artifacts_status:", status)
    for a in data.get("artifacts", []):
        print(f"id={a['id']} name={a['name']} size={a['size_in_bytes']} expired={a['expired']}")
    if not data.get("artifacts"):
        print("NO_ARTIFACTS")
        return 0
    a = data["artifacts"][0]
    # archive_download_url returns 302 to a signed storage URL; capture it without auth.
    req = urllib.request.Request(a["archive_download_url"], method="GET")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    add_surrogate_to_request(req, "custom.github", allowed_hosts=["api.github.com"])
    try:
        with urllib.request.build_opener(NoRedirect()).open(req, timeout=60) as resp:
            print("download_status:", resp.status)
            loc = resp.headers.get("Location")
            print("location:", (loc or "")[:120])
            body = resp.read()
    except urllib.error.HTTPError as e:
        print("download_http_error:", e.code, e.headers.get("Location", "")[:120])
        loc = e.headers.get("Location")
        body = None
    if body is None and loc:
        with urllib.request.urlopen(loc, timeout=120) as resp:
            body = resp.read()
            print("redirect_download_status:", resp.status, "bytes:", len(body))
    if body is None:
        print("DOWNLOAD_FAILED")
        return 0
    out_zip = "/tmp/akweb-browser-artifact.zip"
    with open(out_zip, "wb") as f:
        f.write(body)
    with zipfile.ZipFile(out_zip) as z:
        print("zip_contents:", z.namelist())
        for name in z.namelist():
            if name.endswith(".apk"):
                dest = os.path.expanduser("~/workspace/your_files/akweb-browser-debug.apk")
                with z.open(name) as src, open(dest, "wb") as dst:
                    dst.write(src.read())
                print("APK_SAVED:", dest, os.path.getsize(dest))
    return 0


if __name__ == "__main__":
    sys.exit(main())
