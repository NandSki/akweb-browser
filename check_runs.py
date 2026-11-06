#!/usr/bin/env python3
"""Read-only check of AKWeb browser workflow runs (reuses gh.py credential pattern)."""
import json
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
from dynamic_credentials import add_surrogate_to_request

API = "https://api.github.com"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise RuntimeError("redirect refused")


def call(method, path, body=None):
    url = API + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    if data:
        req.add_header("Content-Type", "application/json")
    add_surrogate_to_request(req, "custom.github", allowed_hosts=["api.github.com"])
    try:
        with urllib.request.build_opener(NoRedirect()).open(req, timeout=60) as resp:
            raw = resp.read()
            return json.loads(raw.decode()) if raw else {}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"GitHub {method} {path} -> HTTP {e.code}: {e.read().decode(errors='replace')[:500]}")


def main():
    target_sha = "4f3897a3d7beeb9d508d1ce1639996a4c5b1ad88"
    deadline = time.time() + 600
    while True:
        runs = call("GET", "/repos/NandSki/akweb-browser/actions/runs?per_page=5")
        for r in runs.get("workflow_runs", []):
            print(f"run={r['id']} sha={r['head_sha'][:8]} status={r['status']} conclusion={r['conclusion']} created={r['created_at']} url={r['html_url']}", flush=True)
        latest = runs["workflow_runs"][0] if runs.get("workflow_runs") else None
        if latest and latest["head_sha"] == target_sha and latest["status"] == "completed":
            jobs = call("GET", f"/repos/NandSki/akweb-browser/actions/runs/{latest['id']}/jobs?per_page=20")
            for j in jobs.get("jobs", []):
                print(f"job={j['name']} conclusion={j['conclusion']}", flush=True)
                for s in j.get("steps", []):
                    print(f"  step={s['name']} conclusion={s['conclusion']}", flush=True)
            print("DONE", flush=True)
            return 0
        if time.time() > deadline:
            print("TIMEOUT_WAITING", flush=True)
            return 0
        time.sleep(30)


if __name__ == "__main__":
    sys.exit(main())
