# 信访管理系统 · 桌面版

把原 WPF 项目 `petition-2026.10.7` 的**功能与数据库搬到 Electron**：同一套 5 张表、同一批字典与用户种子、同一套编号规则，界面重做但字段与流程一一对应。数据全部落本机 SQLite，不依赖任何后端服务。

## 界面

| 登录 | 首页统计 |
| --- | --- |
| ![登录](docs/screenshots/login.png) | ![首页统计](docs/screenshots/home.png) |

| 线索管理 | 信访管理 |
| --- | --- |
| ![线索管理](docs/screenshots/clues.png) | ![信访管理](docs/screenshots/complaints.png) |

| 新增 / 编辑信访 | 归并到线索 |
| --- | --- |
| ![新增信访](docs/screenshots/form.png) | ![归并](docs/screenshots/assign.png) |

| 基础字典（三级） | 用户管理 | 操作日志 |
| --- | --- | --- |
| ![基础字典](docs/screenshots/dict.png) | ![用户管理](docs/screenshots/users.png) | ![操作日志](docs/screenshots/logs.png) |

| 系统设置 | 回收站 |
| --- | --- |
| ![系统设置](docs/screenshots/settings.png) | ![回收站](docs/screenshots/recycle.png) |

视觉体系见 [DESIGN.md](DESIGN.md)：淡蓝纸底 + 白色面板 + 主色蓝，发丝线结构，等宽数字，无渐变无硬阴影；登录页是粒子汇聚成「审查调查工作平台」。根字号 `clamp()` + 全局 `rem`/`fr`，窗口缩放整体等比自适应；64rem 以下侧栏收成图标栏。

## 下载

Windows 安装包由内网 Jenkins 构建后发布到 [GitLab 包仓库](http://10.175.2.11:8082/lbxq/pentition-desktop/-/packages)；macOS 的 dmg 在 macOS 本机构建。

| 文件 | 用途 |
| --- | --- |
| `PetitionDesktop-0.2.8-arm64.dmg` | macOS（Apple Silicon），拖进 Applications，本机 `pnpm build:mac` 产出 |
| `PetitionDesktop.Setup.0.2.8.exe` | Windows 安装包：装到本机、建开始菜单/桌面快捷方式、可在「应用和功能」里卸载 |
| `PetitionDesktop-0.2.8-portable.exe` | Windows **免安装**：单个 exe，双击即用，不写注册表，删掉文件就干净 |

免安装版与安装版跑同一份代码、同样把数据存在 `%APPDATA%\PetitionDesktop\`，区别只在「有没有往系统里装东西」。

## 功能

1. **登录**：默认 `admin / admin123`，密码以 **scrypt 加盐哈希** 存储（`scrypt$<salt>$<hash>`，比对用 `timingSafeEqual`），库里不再有明文；老库里的明文密码在启动时自动升级为哈希，原密码照旧可登录。登录成功/失败、退出都写操作日志。
2. **首页统计**：问题线索 / 信访件 / 实名 / 匿名 / 已办结 / 办理中 / 已超期 / 办结率 八项读数，近 12 个月趋势，线索来源与处置形态构成（口径与原 `StatisticsViewModel.CalculateOverallStats` 一致：`Category='0'` 为问题线索、`IsCompleted='BJ1001'` 为已办结、`IsOverdue='CQ1001'` 为超期）。
3. **线索管理（主单）**：`Category='0'` 的问题线索台账，标签页（全部 / 办理中 / 已办结 / 已超期）带计数，列表带「信访件」计数；点数字跳到该线索名下的信访件，点编号回到线索本身。
4. **信访管理（子单）**：`Category='1'` 的信访件台账，6 个标签页（全部 / 实名 / 匿名 / 办理中 / 已办结 / 已超期）带计数；按信访类别、处置形态、举报形式、是否办结过滤，关键词命中原始编号 / 新建编号 / 信访编号 / 被反映人 / 问题摘要 / 主办人；列表按接收时间倒序；双击行或点「查看」打开详情抽屉；支持批量删除。
5. **新增 / 编辑信访**：11 个分组（编号信息 / 基本信息 / 被反映人信息 / 信访内容 / 分办信息 / 处置信息 / 处置（核实）结果 / 超期信息 / 办案人员 / 签批信息 / 其他信息）+ 附件管理（批量上传、批量下载、批量删除、共 N 个附件）；编号新增时自动生成 `yyyyMMdd + 3 位流水`；被反映人切「单位 / 个人」会切换对应字段；分办 / 承办部室为多选，落库为逗号拼接（与原项目一致）；所有下拉都来自字典表。
6. **线索与信访件双向查询**：线索详情顶部列出「关联信访件」表格（编号、被反映人、摘要、状态），点「查看」直接打开该信访件详情；信访详情顶部显示「所属线索」，点编号打开线索详情。列表里的「信访件」计数与「所属线索」也都能互相跳转。
7. **线索与信访件的主子关系**：一条线索 = 一个办理事项（分办、处置、办结都在线索上），信访件是登记来源，可把多件信访举报归并到同一条线索下。列表里信访件显示「所属线索」，「归并」按钮选一条线索挂上去，也可「移出线索」；关系落在 `Complaint.ParentCode`（老库启动时自动补列），线索那一侧显示名下件数。
8. **Excel 导入 / 导出**：导入从「导出全部」得到的表格回灌（表头对齐、字典显示值自动反查成键值、多选部室按「、」拆分、编号重复自动跳过，导入结果写操作日志）；导出支持选中或全部（46 列中文表头、字典翻译、部室合并为「、」），操作日志与首页统计各有一键导出。
9. **打印预览**：信访详情与列表台账都能打开 A4 打印预览窗口（同一份 HTML，含打印/关闭按钮，直接调用系统打印对话框）。
10. **基础字典（三级）**：17 个字典分类（线索来源 / 职位层级 / 政治面貌 / 举报形式 / 分办部室或片区 / 承办部室或片区 / 承办形式 / 处置方式 / 处置形态 / 处置（核实）结果 / 是否办结 / 是否超期 / 领导签批 / 签批情况 / 信访类别 / 被反映人类型 / 性别）；结构为「字典分类（一级）→ 字典项（二级）→ 子项（三级）」，右栏是树表，父项行可加「子项」，第四级会被拒绝；表单下拉按层级缩进显示子项。
11. **用户管理**（仅管理员）：新增、编辑、重置密码、删除（`admin` 不可删），角色分「管理员 / 普通用户」，停用账号无法登录。
12. **操作日志**（仅管理员）：按模块、类型、操作人、内容/对象筛选，分页倒序，可导出 Excel。
13. **系统设置**：可把数据库文件与附件目录指到本机任意位置（「选择目录」→「保存并应用」，可勾选「迁移时复制当前数据库」，切库后立即重连并写日志；「恢复默认」回到 `userData` 下的默认路径）。
14. **状态色**：办理中（蓝）、已办结（绿）、已超期（红）三态用带圆点的 pill 呈现，列表与用户角色一致。
15. **逻辑删除**：删除只打标记（`IsDeleted=1` + `DeleteTime`），记录进「回收站」，可单条或批量恢复；同编号再次保存会把原记录复活。删除用户同样进回收站（恢复时重新启用），字典分类/字典项也是软删。

## 数据

SQLite 单文件，主进程独占；默认使用 Electron 内置的 **`node:sqlite`（零原生依赖）**，可用 `MALL_SQLITE_DRIVER=better-sqlite3` 回退到 better-sqlite3（N-API 预编译，同样不需要 node-gyp / VS Build Tools / Python）。

| 平台 | 数据库 | 附件目录 |
| --- | --- | --- |
| macOS | `~/Library/Application Support/PetitionDesktop/petition.db` | 同目录 `Attachments/` |
| Windows | `%APPDATA%\PetitionDesktop\petition.db` | 同目录 `Attachments\` |

附件按**原始编号**分目录存放：`Attachments/<原始编号>/<时间戳>_<随机>.<扩展名>`，老数据启动时自动归位（日志里会打印搬运数量）。设置页可把附件根目录改到别处。

表结构与原项目逐字对齐：`Users` / `Complaint`（47 列）/ `ComplaintAttachment`（外键指向 `Complaint.OriginalCode`，级联删除）/ `DictionaryClass` / `DictionaryItem` / `OperationLog`。

首次启动自动灌入原库的种子数据：2 个用户、17 个字典分类、91 个字典项、7 条信访记录、4 条附件记录、387 条操作日志。源数据在 `src/main/seed/petition-seed.json`，由原 `petition.db` 导出。

> 说明：原库有 2 条附件的 `OriginalCode='asda'` 指向已不存在的案件（历史脏数据），灌种子时临时关闭外键原样保留；应用内新增数据仍受外键约束。

## 技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 壳 | Electron 45 | 同一套代码出 `.exe` / `.dmg` |
| 构建 | electron-vite 6 + Vite 8 | 主进程 / preload / 渲染进程三段式 |
| UI | Vue 3 + TypeScript + Element Plus 2.14 | 分组卡片表单、表格、树/下拉全部来自字典 |
| 数据 | `node:sqlite`（默认）/ better-sqlite3（回退） | 驱动层 `src/main/sqlite-driver.ts` 统一接口 |
| 打包 | electron-builder 26 | mac → dmg(arm64)；win → nsis + portable(x64) |

## 开发

```bash
pnpm install      # 无原生编译，不需要 node-gyp / VS Build Tools / Python
pnpm dev          # 开发模式（HMR）
pnpm typecheck    # vue-tsc 类型检查
pnpm build        # 构建到 out/
```

默认账号 `admin / admin123`。

## 打包

```bash
# macOS（本机出 dmg，未签名）
pnpm build:mac

# Windows（在 Windows 机器上执行，产物在 release/）
pnpm build:win
```

推 tag 会触发 Jenkins 构建，产物发布到 GitLab 包仓库：

```bash
git tag v0.2.8 && git push origin v0.2.8
```

## 持续集成

Jenkins 任务 `pentition-desktop`（http://10.175.2.11:8080/job/pentition-desktop/）从本仓库的 `Jenkinsfile` 跑流水线：

| 阶段 | 做什么 |
| --- | --- |
| Checkout | 用凭据 `gitlab-root` 拉取本仓库当前分支 |
| Verify version | 校验 `package.json` 版本与 `vX.Y.Z` tag 一致，避免发错版本 |
| Build in VM | 把源码同步进 KVM 里的 Windows 虚拟机（`/usr/local/bin/build-in-vm.sh`），用 wine 跑 `pnpm build` + `electron-builder --win --x64`，产出 NSIS 安装包与免安装 exe |
| Archive | 把 `source/release/*.exe` 归档为构建产物（Jenkins 页面可直接下载） |
| Upload to GitLab | 用 `gitlab-upload.sh` 传到 GitLab 通用包仓库 |
| Release | 打 tag 的构建额外创建 GitLab Release，并把上面两个 exe 挂成 Release 资产链接 |

触发方式：push 到 `master` 由 Jenkins 轮询发现（`pollSCM`，约 3 分钟内），打 tag 则用 `git push origin vX.Y.Z`。构建日志与产物都在 Jenkins 任务页。

macOS 的 dmg 不在流水线里（Windows VM 里打不了 mac 包），仍在 mac 本机 `pnpm build:mac`。

未签名说明：macOS 首次打开需右键 →「打开」；Windows 若弹 SmartScreen，点「更多信息」→「仍要运行」。

## 与原项目的差异

- 登录密码改为哈希存储（scrypt + 随机盐），与原库明文不兼容——**用原项目 `petition.db` 直接覆盖本机库时，启动会自动把明文升级成哈希**，登录密码不变。
- Excel **导出 / 导入** 与 **A4 打印预览** 均已复刻（导出选中/全部、操作日志导出、统计报表多 sheet；导入从「导出全部」的表格回灌）。
- 新增 `Complaint.ParentCode` 列承载「线索 → 信访件」归属；原库没有这一列，灌库后统一为空（未归并），可随时在界面上归并。
- 附件记录保留原库路径字段；新上传文件复制到 `Attachments/` 并按时间戳重命名，删除记录时同时删除文件。

## 目录

```
src/main/       主进程：schema.ts（建表+种子）、db.ts（数据访问）、ipc.ts（通道）、sqlite-driver.ts
src/preload/    contextBridge 暴露 window.api
src/renderer/   Vue 3 界面：views（登录/首页/信访/表单/字典/用户/日志）、layout、router、styles
scripts/        afterPack：按平台裁剪依赖里的预编译产物
```
