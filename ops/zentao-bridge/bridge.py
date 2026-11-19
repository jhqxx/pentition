#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
禅道 → GitLab Issue 单向桥

禅道（ZenTao）原生只能「从 GitLab 拉 Issue」，不支持反向在 GitLab 建 Issue。
本脚本补上这一环：禅道里新建 Bug 时，禅道 webhook 会 POST 到这里，
这里查库取出 Bug 详情，再调 GitLab API 建一个 Issue。

部署：由 GitLab CI 作业 deploy-bridge 把本文件同步到服务器
      /srv/zentao-bridge/bridge.py，systemd 的 path 单元检测到文件变化后
      自动重启 zentao-bridge.service。

配置全部走环境变量（见文件末尾 DEFAULTS），也可用 systemd Environment= 覆盖。
"""

import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

VERSION = "1.1.1"


def source_sha256():
    """本文件自身的 sha256：CI 用它判断「新代码是否真的被加载」。"""
    try:
        with open(os.path.abspath(__file__), "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()
    except OSError:
        return ""

DEFAULTS = {
    "PORT": "8099",
    "GITLAB_URL": "http://127.0.0.1:8082",
    "GITLAB_PROJECT": "1",
    "GITLAB_TOKEN_FILE": "/srv/gitlab/ci-token.txt",
    "GITLAB_LABELS": "zentao,bug",
    "ZENTAO_URL": "http://10.175.2.11:8090",
    "ZENTAO_CONTAINER": "zentao",
    "ZENTAO_DB": "zentao",
    "ZENTAO_DB_USER": "root",
    "ZENTAO_DB_PASS": "123456",
    "LOG_FILE": "/srv/zentao-bridge/bridge.log",
}


def cfg(key):
    return os.environ.get(key) or DEFAULTS[key]


def log(msg):
    line = "%s %s" % (time.strftime("%Y-%m-%d %H:%M:%S"), msg)
    print(line, flush=True)
    path = cfg("LOG_FILE")
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError as exc:  # 日志写不了不能影响主流程
        print("log file unavailable: %r" % (exc,), file=sys.stderr, flush=True)


def mysql(sql):
    """禅道的 MySQL 只在 zentao 容器内监听 127.0.0.1，只能 docker exec 进去查。"""
    cmd = [
        "docker", "exec", "-i", cfg("ZENTAO_CONTAINER"),
        "/opt/zbox/bin/mysql",
        "-u" + cfg("ZENTAO_DB_USER"),
        "-p" + cfg("ZENTAO_DB_PASS"),
        cfg("ZENTAO_DB"), "-N", "-B", "-e", sql,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if proc.returncode != 0:
        raise RuntimeError("mysql failed: %s" % proc.stderr.strip())
    return proc.stdout.strip()


def gitlab_token():
    with open(cfg("GITLAB_TOKEN_FILE"), encoding="utf-8") as f:
        return f.read().strip()


def create_issue(title, description, labels):
    body = json.dumps({"title": title, "description": description, "labels": labels}).encode("utf-8")
    url = "%s/api/v4/projects/%s/issues" % (cfg("GITLAB_URL"), cfg("GITLAB_PROJECT"))
    req = urllib.request.Request(
        url, data=body, method="POST",
        headers={"PRIVATE-TOKEN": gitlab_token(), "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def bug_to_issue(bug_id):
    row = mysql(
        "SELECT id,title,severity,pri,steps,openedBy,openedDate,status "
        "FROM zt_bug WHERE id=%d" % bug_id
    )
    parts = row.split("\t")
    if len(parts) < 2:
        raise RuntimeError("bug %d not found" % bug_id)

    title = parts[1]
    severity = parts[2] if len(parts) > 2 else ""
    pri = parts[3] if len(parts) > 3 else ""
    steps = parts[4] if len(parts) > 4 else ""
    opened_by = parts[5] if len(parts) > 5 else ""
    opened_date = parts[6] if len(parts) > 6 else ""
    status = parts[7] if len(parts) > 7 else ""

    description = (
        "来自禅道 Bug #%d\n\n"
        "| 字段 | 值 |\n| --- | --- |\n"
        "| 严重程度 | %s |\n| 优先级 | %s |\n| 状态 | %s |\n"
        "| 提交人 | %s |\n| 提交时间 | %s |\n\n"
        "**重现步骤**\n\n%s\n\n"
        "[在禅道中查看](%s/index.php?m=bug&f=view&bugID=%d)\n"
        % (bug_id, severity, pri, status, opened_by, opened_date,
           steps, cfg("ZENTAO_URL"), bug_id)
    )
    labels = [x.strip() for x in cfg("GITLAB_LABELS").split(",") if x.strip()]
    return create_issue("[禅道#%d] %s" % (bug_id, title), description, labels)


class Handler(BaseHTTPRequestHandler):
    server_version = "zentao-bridge/" + VERSION

    def _json(self, code, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith("/health"):
            self._json(200, {
                "status": "ok",
                "version": VERSION,
                "source_sha256": source_sha256(),
                "pid": os.getpid(),
            })
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length).decode("utf-8", "replace")
        log("RECV %s %s" % (self.path, raw))

        try:
            data = json.loads(raw) if raw else {}
        except ValueError:
            data = {}

        if data.get("objectType") != "bug" or data.get("action") != "opened":
            self._json(200, {"result": "ignored", "reason": "not a newly opened bug"})
            return

        try:
            issue = bug_to_issue(int(data.get("objectID")))
            log("CREATED issue iid=%s for bug %s" % (issue.get("iid"), data.get("objectID")))
            self._json(200, {"result": "ok", "iid": issue.get("iid"), "url": issue.get("web_url")})
        except Exception as exc:  # 桥失败不能阻塞禅道，返回 200 并记日志
            log("ERROR %r" % (exc,))
            self._json(200, {"result": "error", "error": repr(exc)})

    def log_message(self, *args):
        pass


def main():
    port = int(cfg("PORT"))
    log("zentao-bridge %s listening on 0.0.0.0:%d -> gitlab %s project %s"
        % (VERSION, port, cfg("GITLAB_URL"), cfg("GITLAB_PROJECT")))
    HTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
