# 信访管理系统 · 桌面版（Petition Desktop）

把原 WPF 项目 `petition-2026.10.7` 的功能与数据库迁移到 **Electron**：沿用同一套业务表、同一批字典与用户种子、同一套编号规则，界面重做但字段与流程一一对应。所有数据落在本机 **SQLite**，不依赖任何后端服务，整个程序目录拷到 U 盘或另一台机器即可继续使用。

| | |
| --- | --- |
| 应用名（productName） | `Petition` |
| 包名（package name） | `petition` |
| 应用标识（appId） | `com.lbxq.petitiondesktop` |
| 代码仓库 | <http://10.175.2.11:8082/lbxq/pentition> |
| 包仓库 / Releases | <http://10.175.2.11:8082/lbxq/pentition/-/packages> · <http://10.175.2.11:8082/lbxq/pentition/-/releases> |
| 默认账号 | `admin / admin123` |

> 目录：[界面](#一界面) · [功能](#二功能) · [技术栈](#三技术栈) · [快速开始](#四快速开始) · [打包发布](#五打包与发布) · [数据](#六数据与存储) · [目录](#七目录结构) · [分支与 CI](#八分支模型与持续集成) · [与原项目差异](#九与原-wpf-项目的差异) · [FAQ](#十常见问题)

---

## 一、界面

| 登录 | 首页统计 |
| --- | --- |
| ![登录](docs/screenshots/login.png) | ![首页统计](docs/screenshots/home.png) |

| 线索管理 | 信访管理 |
| --- | --- |
| ![线索管理](docs/screenshots/clues.png) | ![信访管理](docs/screenshots/complaints.png) |

| 新增 / 编辑信访 | 归并到线索 |
| --- | --- |
| ![新增信访](docs/screenshots/form.png) | ![归并](docs/screenshots/assign.png) |

| 基础字典 | 用户管理 | 操作日志 |
| --- | --- | --- |
| ![基础字典](docs/screenshots/dict.png) | ![用户管理](docs/screenshots/users.png) | ![操作日志](docs/screenshots/logs.png) |

| 系统设置 | 回收站 |
| --- | --- |
| ![系统设置](docs/screenshots/settings.png) | ![回收站](docs/screenshots/recycle.png) |

视觉体系见 [DESIGN.md](DESIGN.md)：淡蓝纸底 + 白色面板 + 主色蓝，发丝线结构、等宽数字、无渐变无硬阴影；登录页是粒子汇聚成「审查调查工作平台」。根字号 `clamp()` + 全局 `rem`/`fr`，窗口缩放整体等比自适应；宽度 64rem 以下侧栏收成图标栏。

---

## 二、功能

### 登录与账号
- 默认 `admin / admin123`；密码以 **scrypt 加盐哈希** 存储（`scrypt$<salt>$<hash>`，比对用 `timingSafeEqual`），库中无明文。老库里的明文密码在启动时自动升级为哈希，原密码照旧可登录。
- 登录成功 / 失败、退出均写入操作日志。

### 首页统计
- 八项读数：问题线索 / 信访件 / 实名 / 匿名 / 已办结 / 办理中 / 已超期 / 办结率；近 12 个月趋势；线索来源与处置形态构成。
- 口径与原 `StatisticsViewModel.CalculateOverallStats` 一致：`Clue` 表 = 问题线索、`Complaint` 表 = 信访件、`IsCompleted='是'` 为已办结、`IsOverdue='是'` 为超期。

### 线索管理（主单 · `Clue`）
- 问题线索台账，标签页（全部 / 办理中 / 已办结 / 已超期）带计数，列表带「信访件」数量。
- 点「信访件」数字跳到该线索名下信访件，点编号回到线索详情。

### 信访管理（子单 · `Complaint`）
- 信访件台账，6 个标签页（全部 / 实名 / 匿名 / 办理中 / 已办结 / 已超期）带计数。
- 支持按信访类别、处置形态、举报形式、是否办结过滤；关键词命中原始编号 / 新建编号 / 信访编号 / 被反映人 / 问题摘要 / 主办人。
- 列表按紧急度排序（超期 → 临期 → 办理中 → 已办结）；最左侧为跨页连续序号列（第 2 页从 21 开始）；接收时间只显示日期、悬停看完整时间；双击行或点「查看」打开详情抽屉。
- 支持批量删除。打印台账按「一个被反映人一行」展开：同一记录首行写全、后续行只写被反映人，页脚注明「共 N 条（M 位被反映人）」。

### 新增 / 编辑信访
- 11 个分组：编号信息 / 基本信息 / 被反映人信息 / 信访内容 / 分办信息 / 处置信息（含问题类型、目前处置状态、可多选处置形态、2000 字处置进度情况） / 处置（核实）结果 / 超期信息 / 办案人员 / 签批信息 / 其他信息。
- 附件管理：批量上传、批量下载、批量删除。
- 编号新增时自动生成 `yyyyMMdd + 3 位流水`。
- 被反映人切「单位 / 个人」会切换对应字段；**切到「个人」时「身份证号」必填**（18 位，末位可为 X；兼容 15 位旧号，输入自动去空格并大写 X）。
- 分办 / 承办部室为多选，落库为逗号拼接；所有下拉来自字典表；「处置结果」允许手填（字典里没有的按原文落库，导出与详情原样显示）。

### 线索与信访件的关系
- 双向查询：线索详情顶部列出「关联信访件」，点「查看」直接打开该信访件；信访详情顶部显示「所属线索」，点编号打开线索详情。
- 主子关系：一条线索 = 一个办理事项（分办、处置、办结都在线索上），信访件是登记来源，可把多件信访举报归并到同一条线索下。关系落在两表共有的 `ParentCode` 列：信访件的 `ParentCode` 指向所属线索的原始编号（老库启动时自动补列）。
- 列表行「更多」里可「关联线索」或「取消关联」；是否允许取消关联在系统设置里开关控制。

### 信访件转为线索
- 详情右上角两个按钮：「转为线索」（只带登记信息：线索来源 / 接收时间 / 被反映人及单位信息 / 问题摘要 / 举报形式，办理字段留空）与「转线索（含办理）」（连办理结果一起复制）。
- 转化会**新建**一条线索（取 Clue 自己的流水号），原信访件原样保留并把 `ParentCode` 指向新线索；已关联线索的信访件不能重复转化（如需再转先移出）。

### 编号规则
- 原始编号带类型前缀、各自成流水：信访件 `XFyyyyMMddNNN`、问题线索 `XSyyyyMMddNNN`，两表独立取号互不占号（`nextOriginalCode('clue' | 'letter')`，前缀表 `CODE_PREFIX`）。历史编号保持原样不回改。

### 基础字典（三级）
- 17 个字典分类，结构为「字典分类（一级）→ 字典项（二级）→ 子项（三级）」；二级行可加「子项」，第四级会被拒绝；表单下拉按层级缩进显示。
- **字典字段存显示值**：业务表里所有带字典的字段（类别、线索来源、被反映人类型、性别、职级、政治面貌、举报形式、分办 / 承办部室、承办形式、处置方式、处置形态、处置结果、是否办结、是否超期、领导签批、签批情况）落库存**显示值**（`DictionaryItem.ItemValue`）而非代码（`ItemKey`），避免字典代码在版本间漂移导致旧数据读不出来；旧数据里的代码在启动时自动改写为显示值（幂等）。改字典「显示值」不会回溯修改已办数据，这是有意的。

### Excel 导入 / 导出与打印
- 导入从「导出全部」得到的表格回灌：表头对齐、字典显示值统一规范后落库、多选部室按「、」拆分、编号重复自动跳过，结果写操作日志。
- 导出支持选中或全部（46 列中文表头、字典翻译）；操作日志与首页统计各有一键导出。
- 信访详情与列表台账均可打开 A4 打印预览窗口，直接调用系统打印对话框。

### 用户管理 / 操作日志 / 系统设置
- **用户管理**（仅管理员）：新增、编辑、重置密码、删除（`admin` 不可删），角色分「管理员 / 普通用户」，停用账号无法登录。
- **操作日志**（仅管理员）：按模块、类型、操作人、内容 / 对象筛选，分页倒序，可导出 Excel。
- **系统设置**：可把数据库文件与附件目录指到本机任意位置（可勾选「迁移时复制当前数据库」），「恢复默认」回到数据目录（`data/`）下的相对路径。

### 交互与数据处理
- **状态色**：办理中（蓝）、已办结（绿）、已超期（红）三态用带圆点的 pill 呈现。
- **逻辑删除**：删除只打标记（`IsDeleted=1` + `DeleteTime`），记录进「回收站」，可单条或批量恢复；同编号再次保存会把原记录复活。删除用户 / 字典同样进回收站。

---

## 三、技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 壳 | Electron 45 | 同一套代码出 `.exe` / `.dmg` |
| 构建 | electron-vite 6 + Vite 8 | 主进程 / preload / 渲染进程三段式 |
| UI | Vue 3 + TypeScript + Element Plus 2.14 | 分组卡片表单、表格、树 / 下拉全部来自字典 |
| 路由 | Vue Router 5 | 登录 / 首页 / 线索 / 信访 / 字典 / 用户 / 日志 / 设置 |
| 数据 | `node:sqlite`（默认）/ better-sqlite3（回退） | 驱动层 `src/main/sqlite-driver.ts` 统一接口 |
| 表格 | xlsx-js-style | Excel 导入 / 导出 |
| 打包 | electron-builder 26 | mac → dmg(arm64)；win → nsis + portable(x64) |
| CI | GitLab Runner 19.5（docker executor） | 镜像 `pbuild:wine32`，wine 交叉编译 Windows 包 |

---

## 四、快速开始

**环境要求**：Node.js ≥ 22.5（推荐 24 LTS，`node:sqlite` 需要），pnpm ≥ 9。无原生编译，通常不需要 node-gyp / VS Build Tools / Python。

```bash
pnpm install     # 安装依赖
pnpm dev         # 开发模式（HMR）
pnpm typecheck   # vue-tsc 类型检查
pnpm build       # 构建到 out/
pnpm start       # 预览构建产物（electron-vite preview）
```

> 如在自动化 / 无头 CI 里启动 Electron 报 `Cannot read properties of undefined (reading 'getPath')`，通常是环境变量 `ELECTRON_RUN_AS_NODE=1` 让 Electron 以纯 Node 运行；启动前 `unset ELECTRON_RUN_AS_NODE` 即可。

---

## 五、打包与发布

```bash
pnpm build:mac   # macOS 本机出 dmg（arm64，未签名）
pnpm build:win   # 在 Windows 机器上出 nsis + portable（CI 里由 wine 交叉编译）
```

Windows 安装包由内网 **GitLab Runner** 构建后自动发布到 [GitLab 包仓库](http://10.175.2.11:8082/lbxq/pentition/-/packages) 与 [Releases](http://10.175.2.11:8082/lbxq/pentition/-/releases)；macOS 的 dmg 在 mac 本机构建。

| 产物 | 用途 |
| --- | --- |
| `Petition-Setup-x.y.z.exe` | Windows 安装包：装到本机、建开始菜单 / 桌面快捷方式、可在「应用和功能」里卸载 |
| `Petition-x.y.z-portable.exe` | Windows **免安装**：单个 exe，双击即用，不写注册表，删掉文件就干净 |
| `Petition-x.y.z-arm64.dmg` | macOS（Apple Silicon），拖进 Applications；本机 `pnpm build:mac` 产出，不上传 |

免安装版与安装版跑同一份代码、数据都放在程序同级的 `data/`，区别只在「有没有往系统里装东西」。

> 未签名：macOS 首次打开需右键 →「打开」；Windows 若弹 SmartScreen，点「更多信息」→「仍要运行」。

---

## 六、数据与存储

SQLite 单文件，主进程独占。默认使用 Electron 内置的 **`node:sqlite`（零原生依赖）**，可用 `MALL_SQLITE_DRIVER=better-sqlite3` 回退到 better-sqlite3（N-API 预编译，同样不需要 node-gyp / VS Build Tools / Python）。

**数据跟着程序走（便携模式）**：数据目录固定为「程序所在目录 / `data`」，整个文件夹（程序 + data）复制到 U 盘或另一台机器即可继续使用，不依赖任何绝对路径。

| 运行方式 | 数据目录 |
| --- | --- |
| 开发态 | `<项目根>/data` |
| 打包后 · Windows / Linux | 可执行文件同级的 `data/` |
| 打包后 · macOS | `.app` 同级的 `data/`（`X.app` 与 `data` 并排放） |

`data/` 内含 `petition.db`、`Attachments/`、`settings.json`、`login.json`。首次启动若该目录没有数据库，会自动把系统旧目录（如 `~/Library/Application Support/petition-desktop`）里的数据复制一份过来，旧目录原样保留、可随时回退。`settings.json` 与附件表里的路径都只存相对路径，历史绝对路径（含早期 .NET 版写进来的 `C:\...`）会在启动时自动改写。自动化冒烟测试可用 `MALL_USER_DATA` 临时指定数据目录。

- **示例库**：全新安装（既无旧版本数据、`data/` 里也无库）时，会把随包发布的 `resources/seed/petition.db` 复制过去，打开即有数据（83 条线索 / 26 条信访件 / 141 位被反映人）；只要机器上有旧版本数据，就优先迁移真实数据，示例库不会覆盖。
- **运行日志**：写在 `data/logs/app-YYYY-MM-DD.log`（控制台输出同时落盘）。数据库初始化失败时会弹窗给出数据目录与日志路径。
- **升级兼容**：启动时会修掉旧版本可能留下的「迁移做到一半」状态——失效视图（如 `ComplaintAll` 引用了不存在的 `Clue`）会先删除、残留的 `Complaint_legacy` / `ComplaintAttachment_new` 会被还原，再走正常的拆表迁移，避免一次失败让新旧版本都打不开。
- **附件**：按**原始编号**分目录存放 `Attachments/<原始编号>/<时间戳>_<随机>.<扩展名>`，老数据启动时自动归位；设置页可把附件根目录改到别处。
- **表结构**（与原项目逐字对齐）：`Users` / `Clue`（问题线索，50 列） / `Complaint`（信访件，50 列） / `ComplaintAll`（视图：`Clue ∪ Complaint`，所有读查询的统一入口） / `ComplaintAttachment`（按 `OriginalCode` 关联，因一个编号可能落在两张表，视图 / 表上不再建外键） / `DictionaryClass` / `DictionaryItem` / `OperationLog`。老库是「单表 + `Category` 区分」的结构，启动时自动拆成 `Clue` + `Complaint` 两张表（按列名搬数据，附件表重建为无外键）。
- **种子数据**：首次启动自动灌入原库种子：2 个用户、17 个字典分类、91 个字典项、7 条信访记录、4 条附件记录、387 条操作日志，源数据在 `src/main/seed/petition-seed.json`。

> 原库有 2 条附件的 `OriginalCode='asda'` 指向已不存在的案件（历史脏数据），原样保留；新增附件时会在应用层校验编号是否存在于 `Clue ∪ Complaint`。

---

## 七、目录结构

```
src/main/       主进程：schema.ts（建表+种子）、db.ts（数据访问）、ipc.ts（通道）、
                sqlite-driver.ts（驱动抽象）、auth/password.ts（登录与 scrypt）、
                excel.ts / exportColumns.ts（导入导出）、print.ts（打印）、
                portable.ts / settings.ts（数据目录）、logger.ts、windowSizes.ts
src/main/seed/  原库种子数据 petition-seed.json
src/preload/    contextBridge 暴露 window.api
src/renderer/   Vue 3 界面：views（登录/首页/线索/信访/表单/字典/用户/日志/设置）、
                layout、router、styles
scripts/        afterPack.cjs：按平台裁剪依赖里的预编译产物
build/          应用图标（icon.ico / icon.icns / icon.png，electron-builder 打包用）
resources/seed/ 随包示例数据库 petition.db
docs/           设计文档、选型评估、界面截图
```

---

## 八、分支模型与持续集成

| 分支 / 引用 | 用途 | 流水线行为 |
| --- | --- | --- |
| `dev` | 日常开发集成分支 | 只跑版本自检（`verify-version`），不构建、不发布 |
| `master` | 稳定分支，发布来源 | 同上，只跑版本自检 |
| Merge Request | 合并前校验 | 只跑版本自检 |
| **tag `vX.Y.Z`** | **唯一的发布入口** | verify → build → upload → release 全量执行 |

**发布一个新版本的完整步骤**：

```bash
# 1. 在 dev 上开发、提交、推送（不会触发构建）
git checkout dev
git add -A && git commit -m "feat: ..." && git push origin dev

# 2. 合并到 master
git checkout master && git merge --no-ff dev && git push origin master

# 3. 改版本号（必须与 tag 一致，流水线会校验）
#    package.json 里 "version": "x.y.z"

# 4. 打 tag 并推送 —— 这一步才会真正构建并发布
git tag -a vX.Y.Z -m "Petition X.Y.Z"
git push origin vX.Y.Z
```

tag 推送后，GitLab Runner 会自动：① 校验 tag 与 `package.json` 版本一致（不一致直接失败）；② 用 `pbuild:wine32` 镜像跑 `pnpm build` + `electron-builder --win nsis portable --x64`；③ 上传到 GitLab 通用包仓库；④ 创建 GitLab Release 并把两个 exe 挂成资产链接。

> 日常提交、合并到 master 都**不会**产生新包；只有打 tag 才会。

### 流水线作业（`.gitlab-ci.yml`）

Runner `#2 lab-docker-runner`（docker executor、host 网络、镜像 `pbuild:wine32`），宿主缓存 `/srv/build/cache/{electron,electron-builder,pnpm}` 映射进容器，重复构建命中缓存。

| 作业 | 阶段 | 触发条件 | 做什么 |
| --- | --- | --- | --- |
| `verify-version` | verify | 所有流水线 | 读 `package.json` 版本；tag 流水线额外校验 tag 与版本一致 |
| `build-windows` | build | **仅 tag**（Web 可手动试跑） | `pnpm install --frozen-lockfile` → `pnpm build` → `electron-builder --win nsis portable --x64` |
| `upload-package` | package | **仅 tag** | `curl --upload-file` 上传 exe 到通用包仓库 |
| `release` | release | **仅 tag** | 建 Release，挂 `Setup` 与 `portable` 两个资产链接 |
| `api-smoke` | api-test | master / dev 手动 | Apifox CLI 冒烟；未配 `APIFOX_SUITE_ID` 时只校验 CLI 版本，失败不阻断 |

依赖与二进制（npm、Electron、electron-builder binaries）全部走 `registry.npmmirror.com` 直连，流水线内不配置任何代理。macOS 的 dmg 不在流水线里（Windows 镜像打不了 mac 包），仍在 mac 本机 `pnpm build:mac`。

---

## 九、与原 WPF 项目的差异

- **登录密码改为哈希存储**（scrypt + 随机盐），与原库明文不兼容——用原项目 `petition.db` 直接覆盖本机库时，启动会自动把明文升级成哈希，登录密码不变。
- **Excel 导出 / 导入** 与 **A4 打印预览** 均已复刻。
- **信访与线索拆成两张物理表**：`Complaint`（信访件）+ `Clue`（问题线索），取代原项目「单表 + `Category` 区分」的做法；对外读接口统一走 `ComplaintAll` 视图，新建 / 编辑按类别路由到对应表，类别改了会在两张表之间搬记录。
- 新增 `ParentCode` 列承载「线索 → 信访件」归属；原库无此列，灌库后统一为空（未归并）。
- 附件记录保留原库路径字段；新上传文件复制到 `Attachments/` 并按时间戳重命名，删除记录时同时删除文件。

---

## 十、常见问题

- **macOS 打不开 / 提示已损坏**：应用未签名，右键 →「打开」，或「系统设置 → 隐私与安全性」里允许。
- **Windows 弹 SmartScreen**：点「更多信息」→「仍要运行」。
- **数据备份 / 迁移**：直接复制程序目录下的 `data/` 整个文件夹（库 + 附件 + 设置）。
- **想换数据位置**：系统设置 → 指定数据库文件与附件目录（可勾选「迁移时复制当前数据库」）。
- **自动化环境启动即闪退**：确认没有设置 `ELECTRON_RUN_AS_NODE=1`（否则 Electron 会当纯 Node 跑）。
- **改端口 / 代理相关**：本应用是纯本地桌面程序，不使用网络端口；CI 里走内网镜像直连。

---

## 许可

内部项目，`UNLICENSED`，仅限授权范围内使用。
