# 禅道 → GitLab Issue 桥（zentao-bridge）

## 为什么要它

禅道 21.7 的 GitLab 集成是**单向**的：

- GitLab → 禅道：✅ 已配（DevOps → 配置 → lab-gitlab，webhook 回写提交/分支/MR）
- 禅道 → GitLab：❌ 原生没有。`module/gitlab/model.php` 里只有 `apiGetIssues` / `apiDeleteIssue` / `saveImportedIssue` 之类，**没有 `apiCreateIssue`**

而开发同学的日常入口是 GitLab，希望「测试在禅道提的 Bug，GitLab 里也能看到、能挂 MR」。
这个桥补的就是这一环。

## 它做什么

```
测试在禅道新建 Bug
      │  禅道 webhook（同步 POST，JSON）
      ▼
http://10.175.2.11:8099/zentao-bug          ← 本脚本，systemd 常驻
      │  查 zt_bug 取标题/严重程度/优先级/重现步骤
      ▼
POST http://127.0.0.1:8082/api/v4/projects/1/issues
      │
      ▼
GitLab Issue「[禅道#12] <Bug 标题>」，labels = zentao,bug，正文含禅道回链
```

其它事件（bug 关闭、需求、任务）目前**忽略**，只处理 `objectType=bug & action=opened`。

## 谁在管它

**GitLab 管 GitLab 自己**：脚本源码在本仓库，部署走 `.gitlab-ci.yml` 的 `deploy-bridge` 作业。

```
ops/zentao-bridge/bridge.py  ──push dev──▶  CI 作业 deploy-bridge（手动）
                                              │ install 到 /srv/zentao-bridge/bridge.py
                                              ▼
                                    systemd zentao-bridge.path 侦测到文件变化
                                              │ 触发 oneshot
                                              ▼
                            zentao-bridge-reload.service → systemctl restart zentao-bridge.service
                                              ▼
                          CI 轮询 /health，比对 source_sha256 == 刚装的文件哈希
```

两个坑都踩过了，写在这里省得再踩：

1. **path 单元不能直接指向业务服务**。`Unit=zentao-bridge.service` 时，path 触发执行的是「start」，
   而服务本来就在跑 → 空操作，新代码根本没被加载。必须指向一个 oneshot 的 reload 单元。
2. **健康检查会骗人**。老进程还在应答 `/health` 也是 200。所以 bridge 启动时把自身源码的
   sha256 报在 `/health` 的 `source_sha256` 字段，CI 轮询比对，一致才算部署成功。

CI 作业本身**不需要 systemctl 权限**（runner 是 docker executor），重启靠宿主 systemd 完成。
Runner 通过 `volumes = ["/srv:/deploy"]` 把宿主 `/srv` 挂进作业容器。

## 服务器上的一次性安装

```bash
# 1) 目录与文件（之后由 CI 维护 bridge.py）
mkdir -p /srv/zentao-bridge

# 2) systemd 单元（三个文件在本目录）
install -m 0644 ops/zentao-bridge/zentao-bridge.service        /etc/systemd/system/
install -m 0644 ops/zentao-bridge/zentao-bridge-reload.service /etc/systemd/system/
install -m 0644 ops/zentao-bridge/zentao-bridge.path           /etc/systemd/system/

# 3) 启用
systemctl daemon-reload
systemctl enable --now zentao-bridge.service zentao-bridge.path

# 4) 自检
curl -s http://127.0.0.1:8099/health
journalctl -u zentao-bridge -n 20 --no-pager
```

## 禅道侧配置（一次性，直接写库）

UI 的 picker 在 21.7 里懒初始化、点不开，所以直接写 `zt_webhook` + `zt_config`：

```sql
-- webhook 目标
INSERT INTO zt_webhook
  (type, name, url, contentType, sendType, products, params, actions, createdBy, createdDate, deleted)
VALUES
  ('default','GitLab-Issue桥','http://10.175.2.11:8099/zentao-bug','application/json','sync','1',
   'objectType,objectID,actor,action,comment,product','{"bug":["opened"]}','admin',NOW(),'0');

-- 让 message 模块对该事件走 webhook（否则 message/model.php 直接跳过）
INSERT INTO zt_config (vision, owner, module, section, `key`, value)
VALUES ('rnd','system','message','','setting','{"webhook":{"setting":{"bug":["opened"]}}}')
ON DUPLICATE KEY UPDATE value=VALUES(value);
```

## 排障

| 现象 | 检查 |
| --- | --- |
| 提 Bug 后 GitLab 没 Issue | `tail -f /srv/zentao-bridge/bridge.log` 有没有 `RECV` |
| 有 RECV 但 `ERROR` | 多半是 `docker exec zentao mysql` 失败：`docker ps` 看 zentao 是否 Up |
| `ERROR 401` | PAT 失效：`/srv/gitlab/ci-token.txt` |
| 健康检查不通 | `systemctl status zentao-bridge`；端口 8099 被占？ |
| 部署后 `/health` 的 `source_sha256` 没变 | path 单元没触发：`systemctl status zentao-bridge.path`；或 reload 单元没装 |

## 环境变量

见 `bridge.py` 顶部 `DEFAULTS`，均可用 systemd `Environment=` 覆盖：
`PORT` `GITLAB_URL` `GITLAB_PROJECT` `GITLAB_TOKEN_FILE` `GITLAB_LABELS`
`ZENTAO_URL` `ZENTAO_CONTAINER` `ZENTAO_DB` `ZENTAO_DB_USER` `ZENTAO_DB_PASS` `LOG_FILE`
