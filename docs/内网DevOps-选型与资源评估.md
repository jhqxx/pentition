# 内网 DevOps 三件套：资源评估 / 工单选型 / Apifox 门禁

> 数据采集时间：2026-11-18 09:05（服务器 10.175.2.11，k3s v1.37.3）
> 结论先行：**单机够用不用加机器**；**工单选 GitLab Issues**；**Apifox 值得接但只做冒烟门禁**。

---

## 一、资源评估：24C / 31G 够不够跑 GitLab + Jenkins + Zadig

### 1.1 实测基线

| 组件 | 实际内存 | 限额 | 备注 |
| --- | --- | --- | --- |
| GitLab CE 19.5.6 | 4.25 GiB | 10 GiB（docker mem_limit） | puma 多进程，空闲态 |
| Jenkins 2.591 | 0.99 GiB | 4 GiB（docker mem_limit） | 空闲；构建时 +1~2 GiB |
| Zadig 5.0.0（17 pods） | ≈1.1 GiB | requests 1.4 Gi / 1.63 Core | dind / mysql / mongo / minio / redis / aslan / plutus |
| 系统 + 其他 | ≈6.8 GiB | — | 含 page cache |
| **合计** | **12 GiB / 31 GiB** | 可用 17 GiB | CPU 1686m = 7%；磁盘 53G/938G（6%） |

> 装上 Codes 之后（2026-11-18 10:05 实测）：Codes 四容器再占 **≈3.7 GiB**，整机已用 **16 GiB**、可用 **13 GiB**。余量仍够 1~2 条并发构建，但已不适合再叠加重服务。

Zadig 各 pod 实测：aslan 105Mi、kr-mysql 390Mi、kr-mongodb 131Mi、kr-minio 131Mi，其余均 <60Mi。

### 1.2 结论

**够用，且余量健康。** 三条红线：

1. **并发构建**：一次 Electron 打包峰值约 2.5~3 GiB（wine + node + NSIS + 7z）。同时 2 条构建 + 1 条 Zadig 工作流 → 峰值约 9 GiB，仍然安全；**4 条以上并行开始吃紧**。
2. **mem_limit 不要调高**：GitLab 10G / Jenkins 4G 是 Docker 层硬上限，作用是在内存失控时保护整机，不是"浪费"。
3. **磁盘**：Electron 缓存（`/srv/build/cache`）+ GitLab 备份会持续增长，938G 可支撑 1~2 年；建议每月清一次 `gitlab-backup` 旧包。

### 1.3 什么情况下才需要第二台机器

- 需要 ≥3 条并行构建，或 Zadig 常驻跑压测 / 安全扫描；
- 需要 CI 与生产部署目标隔离（Zadig 要管另一套集群）。

**拆分方案（若加云机）**：
- A 机：GitLab + Jenkins —— git 仓库与构建机同网，clone 走内网，最快；
- B 机：Zadig —— 与 k8s 部署目标同网。

不建议把 GitLab 单独拆走：webhook 与 clone 都会跨网，反而更慢。

---

## 二、工单 / 需求管理：GitLab Issues vs Codes（icodes.work）

> Codes = 四川无限智达的国产研发管理平台，定位是「平替 Jira」的**开源**产品。
> 关键形态：**云端认证 + 程序与数据本地安装**（不是纯 SaaS，代码和数据都在你自己的机器上）。

### 2.1 对比

| 维度 | GitLab Issues | Codes（icodes.work） |
| --- | --- | --- |
| 费用 | 免费（CE 自建） | 免费 5 席（2026-05-01 前注册租户 15 席），功能无限制；超出 800 元/人/年 |
| 部署形态 | 内网自建，全离线 | 程序与数据本地安装，但**登录认证要走云端**（要能访问 icodes.work） |
| 完全离线 | ✅ 原生 | 需买「小规模完全私有化版」：5 人 2000 元/年（该版本不能升 4.0+） |
| 需求→迭代→缺陷 | 基础（Issue + 里程碑 + 看板 + Label） | 完整（需求池 / 迭代 / 缺陷流程引擎 / 双库测试用例） |
| 工时与报表 | 无 | 工时填报、日报周报自动生成、数字大屏 |
| 接口自动化 | 无（靠 Apifox 等外部） | 内置低代码接口测试 + 压测 |
| CI/CD | 原生（本次已打通） | **基础版不含**，标准版才有（需联系官方） |
| 与 GitLab 联动 | 原生 | 需 webhook 对接 |
| 资源需求 | 已占用 | compose 版 2C/2.5G，独立一套 docker |

### 2.2 结论：**装 Codes，与 GitLab Issues 不冲突，分工使用**

分工建议：

- **GitLab Issues** 继续管「跟代码强相关」的：技术债、重构、CI 失败单、MR 讨论（`fix #12` 自动关单这条链路已经在跑）；
- **Codes** 管「业务侧流程」的：需求池、迭代计划、测试用例、缺陷流转、工时统计 —— 这些 GitLab 做得很弱，而甲方/管理层恰恰要看这类报表。

三条支撑理由：

1. **数据仍在本地**：程序和数据装在我们自己的 10.175.2.11 上，只有"认证"这一步出网，信访数据不出内网；
2. **补的是 GitLab 的短板**：工时、测试用例、缺陷流程引擎、数字大屏，GitLab CE 全都没有；
3. **不与现有 CI 重叠**：Codes 基础版不含 CI/CD，正好把构建（Jenkins）和部署（Zadig）留给我们已经搭好的链路，不产生第二套流水线。

### 2.3 落地评估（已实测）

| 检查项 | 结果 |
| --- | --- |
| 服务器能否访问 icodes.work | ✅ `200 (0.29s)` |
| 能否拉安装包 | ✅ 安装脚本 19957B 可取；`download.icodes.work` 根目录 403（禁列目录，文件正常） |
| 能否拉镜像 | ✅ `registry.cn-zhangjiakou.aliyuncs.com/v2/ → 401`（正常鉴权挑战） |
| 端口 | 8080/8082 已占，**8010（Web）/ 8012（文档预览）空闲** |
| 资源 | compose 版 2C/2.5G，当前余量 17G，可容纳 |
| 磁盘 | `/srv` 可用 838G |

**一个硬前置**：激活需要 **icodes.work 官网账号 ID**（登录官网 → 账户设置里能看到），激活后其余成员靠邀请邮件加入。没有这个 ID 装完只能停在激活页。

### 2.4 安装结果（已在本机落地，2026-11-18 10:02）

**访问地址：http://10.175.2.11:8010/codes/  → 停在「codes 系统激活」页，等租户 ID。**

| 项目 | 结果 |
| --- | --- |
| 版本 | Codes 3.7.0GA（docker compose 版） |
| 数据目录 | `/srv/codes_config`（**不要删**，`docker-compose.yml` 也在里面） |
| 容器 | `codes_web_server` / `codes_mysql_server` / `codes_redis_server` / `codes_preview_server_` 全部 Up |
| 端口 | Web `8010`、文档预览 `8012` |
| 实测内存 | web 2.48G + mysql 0.49G + preview 0.71G + redis 3.5M ≈ **3.7G**（比官方 2.5G 标称高） |
| 装完后整机 | 已用 16G / 31G，可用 **13G**（装前 17G） |

**激活方式**：到 https://icodes.work 注册账号 → 「账户设置」里复制**租户 ID** → 填进激活页 → 用该账号密码登录 Codes；其他成员由管理员在 Codes 内**邀请邮件**加入（不要重复去官网注册）。

**安装过程中踩的两个坑**：

1. 官方脚本用 `wget -q` 下载 37MB 配置包，失败时**静默不报错**，后面 `mv codes_config` 才报错 → 表现为"装完没有 docker-compose.yml"。解法：先 `curl -L` 手动下好 `codes_config-3.7.0GA.tar.gz` 解压到执行目录，再跑脚本。
2. 首次失败后脚本已往 `/etc/profile` 写了 `CODES_HOME`，**第二次执行会被识别成"升级"**，走完全不同的分支（还是失败）。重装前必须先 `sed -i "/^export CODES_HOME=/d;/^export CODES_VERSION=/d" /etc/profile` 并删掉残留的 `/srv/codes_config`。

### 2.5 什么时候反而别装

- 团队就 2~3 人、且不接受"认证出网" —— 那就 GitLab Issues 凑合用，省一套系统；
- 已确定要「不联网也能登录」又不愿付 2000 元/年 —— 免费版做不到完全离线。

备选还有 GitLab 专业版（自带 Epic/需求管理，约 $19/人/月，自建需买 license）。

---

## 三、Apifox 进 CI：OpenAPI 导入 + 质量门禁

### 结论

**值得做，但只把「冒烟套件」放进门禁，全量套件放 nightly。** 否则每次打包都被几十条慢用例拖死，团队会关掉它。

### 3.1 落地四步

1. **OpenAPI 导入**：后端开 springdoc，`curl http://10.175.2.11:<port>/v3/api-docs > openapi.json` → Apifox「导入」→ 目录按业务 tag 分组（校验 `paths` / `operations` / `schemas` 数量，避免导入空壳）。
2. **建套件**：Apifox 里建 `test-suite`（冒烟 10~20 条主链路），环境变量配内网 `base_url`。
3. **令牌**：Apifox「个人访问令牌」→ 存 Jenkins 凭据 `apifox-token`（类型 Secret text）。
4. **Jenkinsfile 加 stage**（失败只红这个 stage，不阻断打包）：

```groovy
stage('API 冒烟门禁') {
  when { expression { params.RUN_API_TEST == true } }
  steps {
    catchError(buildResult: 'UNSTABLE', stageResult: 'FAILURE') {
      withCredentials([string(credentialsId: 'apifox-token', variable: 'APIFOX_TOKEN')]) {
        sh '''
          docker run --rm -e APIFOX_TOKEN "$APIFOX_IMAGE" bash -lc '
            apifox login --with-token "$APIFOX_TOKEN" &&
            apifox test-suite run "$SUITE_ID" --project "$PROJECT_ID" --environment "$ENVIRONMENT_ID" \
              --reporters cli,json,junit --out-dir /reports --upload-report
          '
        '''
      }
    }
  }
  post { always { junit allowEmptyResults: true, testResults: 'test-reports/*.xml' } }
}
```

### 3.2 实测验证（本次已在 Jenkins 落地）

| 项目 | 结果 |
| --- | --- |
| CLI 版本 | `apifox-cli@2.2.12`（`apifox --version` → `2.2.12`） |
| 安装耗时 | **约 4 分钟 / 304 个包** → 不能每次构建现装，必须预烘焙进镜像 |
| 关键坑 | 直接 `npm i -g apifox-cli` 会**卡住十几分钟**：`optionalDependencies` 里的 `ibm_db` / `oracledb` / `kerberos` 是原生模块，要编译/下载。必须加 **`--omit=optional`** |
| 镜像 | `pbuild/apifox-cli:2.2.12`（`node:22-bookworm` + CLI，registry 指向 npmmirror） |
| Jenkinsfile | 已加 `parameters { RUN_API_TEST / APIFOX_SUITE_ID / APIFOX_PROJECT_ID / APIFOX_ENV_ID }` + `stage('API 冒烟门禁')`；`catchError(buildResult:'UNSTABLE')` 保证失败不阻断打包 |
| 语法校验 | `/pipeline-model-converter/validate` → `Jenkinsfile successfully validated.` |
| 默认关闭验证 | 构建 #22（push 触发）`SUCCESS`，阶段列表里 `API 冒烟门禁 → NOT_EXECUTED`，P0 绿线未受影响 |

**最小验证模式**：`APIFOX_SUITE_ID` 留空时，stage 只跑 `docker run --rm pbuild/apifox-cli:2.2.12 apifox --version`，不连 Apifox 云端 —— 用来确认"镜像 + 参数 + 触发条件"这条链路通，等有了套件 ID 再填进去。

### 3.3 注意事项

- **出网**：服务器要能到 apifox 云（走代理 `127.0.0.1:7897`）；不能出网就用自托管 Runner（`apifox runner`）在内网执行。
- **触发条件**：只对「后端接口有改动的 MR」触发，别每次打包都跑。
- **报告归档**：`--upload-report` 才会进 Apifox 云端；本地 `test-reports/` 同时归档到构建产物。
- **凭据**：Jenkins 里要建 `apifox-token`（Secret text），否则打开开关会直接报 `CredentialsNotFoundException`。

---

## 四、下一步

| 优先级 | 事项 | 状态 |
| --- | --- | --- |
| P2 | GitLab + Jenkins + Zadig 三套流水线 | ✅ 完成（webhook 10 秒触发、Zadig 工作流 passed） |
| P3 | 资源评估 / 工单选型 / Apifox 门禁结论 | ✅ 完成（本文档） |
| P4 | Codes 激活 | ⏳ 等租户 ID（http://10.175.2.11:8010/codes/） |
| P4 | Apifox 真套件接入 | ⏳ 等 Apifox 项目/套件/环境 ID + Jenkins 凭据 `apifox-token` |
| P5 | Zadig 加一条项目级工作流 | ✅ 完成（`exe-artifact-check`：构建 Pod 直连 GitLab 校验 exe 包，task 2 passed） |
| P6 | CI 从 Jenkins 迁到 GitLab 原生 Runner | ✅ 完成（tag `v0.2.8` 全链路绿：verify → build → upload → release，产物进包仓库 + Release 双资产链接） |

**Apifox 最小验证已闭环**：镜像 `pbuild/apifox-cli:2.2.12` 已构建，Jenkinsfile 已加门控 stage，构建 #23 以 `RUN_API_TEST=true` 跑通并输出 `2.2.12`，构建 #22（默认关闭）仍是 SUCCESS —— 开关两侧都验证过，不会拖累 P0 绿线。

**Zadig 项目级工作流已跑通**：项目 `demo` 下的 `exe-artifact-check`（stage `verify` / freestyle job `check-package`）在 Zadig 的 k8s 构建 Pod 里直连 GitLab，拉 `/api/v4/projects/1/packages` 并断言包列表非空，两次运行均 `passed`。它证明的不只是"能跑 hello world"，而是**构建 Pod 的集群网络能打通 GitLab 与产物仓库**，后续要把 `pnpm install + electron-builder` 搬进 Zadig 只需换 `runtime.image` 与挂缓存。

创建/运行的 API（基础版必须带 `concurrency_limit: -1`）：

```bash
TOKEN=$(cat /srv/zadig-token.txt)
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d @/srv/zadig-artifact-check.json \
  http://127.0.0.1:30080/api/aslan/workflow/v4                    # 建工作流
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"project":"demo","name":"exe-artifact-check","concurrency_limit":-1}' \
  http://127.0.0.1:30080/api/aslan/workflow/v4/workflowtask       # 运行
curl -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:30080/api/aslan/workflow/v4/workflowtask/workflow/exe-artifact-check/task/2
```


## 五、CI 迁移到 GitLab 原生 Runner（2026-11-18 完成）

Jenkins 已停用（`docker stop jenkins`，保留数据可随时回来），流水线改由 GitLab Runner 原生执行。

### 5.1 Runner 配置

| 项 | 值 |
| --- | --- |
| Runner | `#2 lab-docker-runner`（项目级，`online`） |
| 版本 | 19.5.3，与 GitLab 19.5.6 匹配 |
| Executor | docker，`network_mode = "host"`，`concurrent = 2`，`pull_policy = if-not-present` |
| 镜像 | `pbuild:wine32`（本地镜像，wine 交叉构建 Windows exe） |
| 标签 | `docker,linux,wine,electron`，`run_untagged=true` |
| 缓存挂载 | `/srv/build/cache/{electron,electron-builder,pnpm}` → 容器 `~/.cache/*` |
| Token | `/srv/gitlab-runner/runner-token.txt`（`glrt-` 前缀，权限 600） |

创建流程（官方 glrt token 方式）：GitLab → 项目 → 设置 → CI/CD → Runner → 创建项目 Runner → 拿 `glrt-` token → 容器内 `gitlab-runner register --non-interactive --url http://10.175.2.11:8082/ --token <glrt> --executor docker --docker-image pbuild:wine32 --docker-network-mode host`。

### 5.2 两个真实故障与根因（踩过，务必记住）

**故障一：所有 job `scheduler_failure`，runner 轮询永远 204**

GitLab 19 的 CI job token 改用 JWT 签发，密钥存在 `application_settings.encrypted_ci_job_token_signing_key` 里，本实例为空。取任务时 `lib/ci/job_token/jwt.rb:87` 抛 `RuntimeError: CI job token signing key is not set`，被 `register_job_service.rb` 的 `rescue StandardError` 捕获后 `build.reset` + `drop_build!(build)`（默认 `failure_reason = :scheduler_failure`），于是**任务在派发瞬间被丢弃**，UI 只显示 "The scheduler failed to assign job to the runner"。

> 注意：`ci_jwt_signing_key`（artifact JWT）和 `ci_job_token_signing_key`（job token）是**两个不同的键**，只设前者无效。

修复：

```bash
openssl genrsa -out /srv/gitlab/config/ci_job_token_signing_key.pem 2048
docker exec gitlab chown git:git /etc/gitlab/ci_job_token_signing_key.pem
docker exec gitlab chmod 600 /etc/gitlab/ci_job_token_signing_key.pem
docker exec gitlab gitlab-rails runner \
  "ApplicationSetting.current.update!(ci_job_token_signing_key: File.read('/etc/gitlab/ci_job_token_signing_key.pem'))"
docker exec gitlab gitlab-ctl restart puma   # 必须重启，内存缓存不会自动失效
```

**故障二：helper 镜像拉不下来（`short read` / `TLS handshake timeout`）**

docker daemon 全局挂了 `HTTPS_PROXY=http://127.0.0.1:7897`，把 `registry.gitlab.com` / `gitlab.com` 也塞进 Clash。实测**这两个域名直连反而更快更稳**（`registry.gitlab.com/v2/` 直连 401 耗时 0.75s，走 Clash 10s 超时）。

修复：`/etc/systemd/system/docker.service.d/proxy.conf` 的 `NO_PROXY` 追加 `gitlab.com,.gitlab.com,registry.gitlab.com,registry.npmmirror.com,cdn.npmmirror.com`，然后 `systemctl daemon-reload && systemctl restart docker`，再 `docker pull registry.gitlab.com/gitlab-org/gitlab-runner/gitlab-runner-helper:x86_64-v19.5.3` 一次成功。

### 5.3 代理：服务器 Clash 已容器化（mihomo，127.0.0.1:7897）

服务器原来的桌面版 Clash Verge（dpkg 包 `clash-verge 2.5.10`，含 `/usr/bin/clash-verge`、`/usr/bin/verge-mihomo`、`/usr/bin/clash-verge-service`）**已彻底卸载**（`apt purge` + 删除用户数据目录），改为 Docker 容器运行同一份订阅配置：

| 项 | 值 |
| --- | --- |
| 容器 | `mihomo`，镜像 `metacubex/mihomo:latest`（143MB） |
| 网络 | `--network host`（与宿主共享网络栈，`127.0.0.1:7897` 直接可用） |
| 配置 | `/srv/mihomo/config.yaml`（由 Clash Verge 的 `clash-verge.yaml` 原样复制，含 175 个节点、proxy-groups、rules） |
| 端口 | `mixed-port: 7897`，`allow-lan: false`，仅回环 |
| 重启策略 | `--restart always` |

```bash
mkdir -p /srv/mihomo && cp <clash-verge 配置> /srv/mihomo/config.yaml
docker run -d --name mihomo --restart always --network host \
  -v /srv/mihomo:/root/.config/mihomo \
  metacubex/mihomo:latest -d /root/.config/mihomo
```

实测：`google 200 / 2.2s`、`github 200 / 2.1s`、`registry.npmjs.org 200 / 0.7s`。

**卸载 Clash Verge 的收尾**：

```bash
dpkg -l | grep clash-verge            # 卸载前: ii clash-verge 2.5.10 amd64 Clash Verge Rev
tar czf /srv/mihomo/clash-verge-backup-$(date +%Y%m%d).tar.gz \
  -C /home/lizhi/.local/share io.github.clash-verge-rev.clash-verge-rev   # 先备份 14M
apt-get purge -y clash-verge
rm -rf /home/lizhi/.local/share/io.github.clash-verge-rev.clash-verge-rev \
       /home/lizhi/.config/io.github.clash-verge-rev.clash-verge-rev \
       /home/lizhi/.cache/io.github.clash-verge-rev.clash-verge-rev \
       /home/lizhi/.local/share/applications/clash-verge-handler.desktop
find /usr /opt /etc /home/lizhi -iname "*clash-verge*"   # 复查: 无残留
```

卸载后复验：`mihomo Up`、`google 302`、`github 200`，GitLab 8082 / Codes 8010 / Zadig 30080 全部正常。

**17897 已彻底移除**：原 `proxy-relay.service`（socat 172.17.0.1:17897 → 127.0.0.1:7897）已 `stop` + `disable`，端口释放，全系统无引用。

> 拉 mihomo 镜像时 Docker Hub 直连与 Clash 代理都因 cloudfront 分片 EOF 失败，最终用国内镜像源 `docker.1ms.run/metacubex/mihomo:latest` 拉取后重打 tag。

**流水线内不再配置任何代理**：`.gitlab-ci.yml` 里已删除 `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` / `ELECTRON_GET_USE_PROXY`，依赖与二进制全部走 npmmirror 直连。Runner 用 host 网络，需要出海时由宿主 mihomo 承担。

**内网一律直连**：实测宿主、GitLab 容器、`pbuild:wine32` 访问 `http://10.175.2.11:8082/` 均 302、15~30ms。

### 5.4 `.gitlab-ci.yml` 要点

- 依赖与二进制全走国内镜像直连：`npm_config_registry`、`ELECTRON_MIRROR`、`ELECTRON_BUILDER_BINARIES_MIRROR` 均指向 `registry.npmmirror.com`，并加进 `NO_PROXY`。
- `release` 作业必须限定 `rules: - if: $CI_COMMIT_TAG`，否则 master 流水线会因 `CI_COMMIT_TAG` 为空去建 Release，报 `422 {"message":"Ref is not specified"}`。
- `upload-package` 用 `curl --upload-file` 推 generic 包，需要项目变量 `GITLAB_TOKEN`（`PRIVATE-TOKEN`），且 `max_artifacts_size` 调到 300MB（exe 单包 121MB，默认 100MB 装不下）。

### 5.5 验收结果

| 流水线 | 内容 | 结果 |
| --- | --- | --- |
| pipeline 16 | master，含 build/upload | build、upload 绿；release 因规则缺失 422（已修） |
| pipeline 17 | master（修后） | verify / build / upload 全绿，release 正确跳过 |
| **pipeline 18** | **tag `v0.2.8`** | **verify-version ✅ build-windows ✅ upload-package ✅ release ✅** |

产物：包仓库 `petition-desktop 0.2.8`（`PetitionDesktop-Setup-0.2.8.exe` 121MB、`PetitionDesktop-0.2.8-portable.exe` 109MB），Release `v0.2.8` 两个资产链接均指向 `/api/v4/projects/1/packages/generic/petition-desktop/0.2.8/...`。

发版动作（与 Jenkins 时代一致）：改 `package.json` 版本 → `git tag vX.Y.Z` → `git push origin master vX.Y.Z`。


## 六、容器清单与清理（2026-11-18）

### 6.1 当前在跑的服务（7 个容器，全部 Up）

| 服务 | 容器 | 端口 | 用途 |
| --- | --- | --- | --- |
| GitLab CE 19.5.6 | `gitlab` | 8082→80、2222→22 | 代码托管 + CI 编排 |
| GitLab Runner 19.5.3 | `gitlab-runner` | host 网络 | 执行 CI（docker executor） |
| Codes 3.7.0GA | `codes_web_server` | 8010→8032、8063-8064 | 研发项目管理（待激活） |
| Codes MySQL | `codes_mysql_server` | 3306（内部） | Codes 数据库 |
| Codes Redis | `codes_redis_server` | 6379（内部） | Codes 缓存 |
| Codes 文档预览 | `codes_preview_server_` | 8012 | kkfileview |
| mihomo | `mihomo` | host 网络 7897 | 出网代理（替代桌面 Clash） |

另有 k3s 内的 Zadig 5.0（17 个 pod，宿主 30080），不属于 docker 管理。

### 6.2 本次清理结果

镜像总量 **18.56GB → 16.22GB**，容器 **9 个 → 7 个**（全部在用）。

| 删除项 | 说明 |
| --- | --- |
| `jenkins` 容器（已停）+ `jenkins/jenkins:2.591-jdk21` | CI 已迁 GitLab Runner；**数据卷保留**，需要时可 `docker run` 回来 |
| `pbuild/jenkins:local`（1.03GB） | Jenkins 定制镜像，废弃 |
| `pbuild:wine`（2.88GB） | 旧 wine 镜像，已被 `pbuild:wine32` 取代 |
| `apifox-bake` 容器 + `node:22-bookworm`（1.64GB） | 构建 apifox-cli 时的中间产物，成品镜像 `pbuild/apifox-cli:2.2.12` 已独立存在 |
| `hello-world` / `alpine` / `curlimages/curl` | 调试用测试镜像 |

保留：`pbuild:wine32`（3.85GB，构建必需）、`pbuild/apifox-cli:2.2.12`（4.2GB，api-smoke 用）、Codes 四件套、GitLab、Runner、helper。
