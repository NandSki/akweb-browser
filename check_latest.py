#!/usr/bin/env python3
"""Poll the newest akweb-browser workflow run until it completes (no sha needed)."""
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
        return None


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
    started = sys.argv[1] if len(sys.argv) > 1 else None
    deadline = time.time() + 600
    seen = None
    while True:
        runs = call("GET", "/repos/NandSki/akweb-browser/actions/runs?per_page=3")
        latest = runs["workflow_runs"][0] if runs.get("workflow_runs") else None
        if latest:
            if seen != (latest["id"], latest["status"], latest["conclusion"]):
                print(f"run={latest['id']} sha={latest['head_sha'][:8]} status={latest['status']} conclusion={latest['conclusion']} created={latest['created_at']} url={latest['html_url']}", flush=True)
                seen = (latest["id"], latest["status"], latest["conclusion"])
            if latest["status"] == "completed" and (started is None or latest["created_at"] >= started):
                jobs = call("GET", f"/repos/NandSki/akweb-browser/actions/runs/{latest['id']}/jobs?per_page=20")
                for j in jobs.get("jobs", []):
                    print(f"job={j['name']} conclusion={j['conclusion']}", flush=True)
                    for s in j.get("steps", []):
                        print(f"  step={s['name']} conclusion={s['conclusion']}", flush=True)
                print(f"LATEST_RUN_ID={latest['id']}", flush=True)
                print("DONE", flush=True)
                return 0
        if time.time() > deadline:
            print("TIMEOUT_WAITING", flush=True)
            return 0
        time.sleep(30)


if __name__ == "__main__":
    sys.exit(main())
