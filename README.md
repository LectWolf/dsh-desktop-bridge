# dsh-desktop-bridge

把「主人自己的电脑」变成远端 DSH Agent 可以调用的工具宿主：电脑出网连服务器，不开放任何公网端口；每一次调用都要主人点头。

供 DeepSeek Harness 使用，由两个半边组成，装在同一个包里：

| 半边 | 跑在哪 | 作用 |
| --- | --- | --- |
| host | 服务器 / 远端 DSH Host | 注册 `desktop_*` 工具、维护反向 WebSocket、兜底审批、审计 |
| agent | 主人的电脑（Windows / macOS / Linux） | 主动外连 host，在本机执行被批准的命令、本地审批弹窗 |

```
   服务器 DSH Host                                    主人电脑
┌──────────────────────────┐      WSS(出网)     ┌──────────────────────────┐
│ dsh-desktop-bridge host  │ ◀──────────────── │ dsh-desktop-bridge agent │
│  · desktop_* tools       │                    │  · 本机执行 shell/build  │
│  · 兜底超时 + 审计        │ ───────────────▶  │  · 本机档位 + 审批弹窗   │
└──────────────────────────┘   call/approve     └──────────────────────────┘
```

## 为什么是这样

- **电脑没有公网 IP**：由电脑发起连接，服务器只接受连接，不主动拨号。
- **不给电脑开端口**：隧道走本机 → 服务器的出站 TLS，无需 NAT 穿透、无需 frp。
- **默认不可用就是不可用**：电脑关机 / 插件没开 → 工具立刻返回 `desktop-offline`，不挂起、不重试轰炸。
- **没有「静默执行」这回事**：执行前由主人电脑自己弹窗确认；超时一律按拒绝处理。

## 握手交换（v1）

连上后两边先换一次能力：agent 上报权限档位、`roots` / `allow`、弹窗等待时长；host 回协商后的 `approvalTimeoutMs`（取两边较小值 + 2s 余量）。之后 host 等审批不会超过这个时长，工具不会无限挂住。

## 权限档位（agent 侧说了算）

| mode | 工具 | 路径 | 命令 |
| --- | --- | --- | --- |
| `view` | 只有只读三个 | 必须在 roots 内 | 不执行 |
| `workspace` | 全部 | 必须在 roots 内 | 必须在 allow 前缀内 |
| `full` | 全部 | 只挡系统目录（`/etc`、`C:\Windows`…） | 只挡破坏性命令（`rm -rf /`、`format c:`…） |

host 侧另有一份 `roots` / `allow` 作为额外上限，两边都放行才执行。

## 审批语义

1. `desktop_exec` / `desktop_write_file` / `desktop_build` 每次都要确认；只读工具按 `approveReadOnly` 决定（默认也要）。
2. 弹窗在主人电脑上：「允许一次 / 始终允许 / 拒绝」。
3. 「始终允许」只写在本机（`~/.dsh/desktop-bridge-grants.json`），服务端改不动也看不到。
4. 超时（默认 90s）→ 拒绝，工具返回 `approval-timeout`；服务端再按协商时长兜一层。
5. 每次调用都进审计日志（`audit.jsonl`）：工具、参数摘要、决策、耗时、退出码。

## 工具

| 工具 | 默认要审批 | 说明 |
| --- | --- | --- |
| `desktop_info` | 是（可关） | 主机名、系统、DSH 版本、档位、工程目录 |
| `desktop_list_dir` | 是（可关） | 列目录 |
| `desktop_read_file` | 是（可关） | 读文件，默认截断 256 KiB |
| `desktop_write_file` | 是 | 写文件 |
| `desktop_exec` | 是 | 执行命令 |
| `desktop_build` | 是 | 按配置好的工程跑构建，回传产物清单 |

## 配置

两边都有 `Config` schema，装好后直接进对应 Harness 的「设置 → 插件」页改，改完即生效。

host 侧（`cordis.patch.yml`）：

```yaml
- insert:
    - id: desktop-bridge
      name: 'dsh-desktop-bridge'
      config:
        host: 127.0.0.1
        port: 19233
        basePath: /desktop-bridge
        dataDir: /root/.dsh/desktop-bridge
        approvalTimeoutMs: 90000
        approveReadOnly: true
        roots: []      # 额外上限，留空表示交给客户端判定
        allow: []
```

agent 侧（主人电脑）：

```yaml
- insert:
    - id: desktop-bridge-agent
      name: 'dsh-desktop-bridge/agent'
      config:
        url: wss://dsh.mcii.cc/desktop-bridge/agent
        token: dbk_xxx
        device: owner-win
        mode: workspace
        roots: ['D:/code']
        allow: ['git', 'bun', 'npm', 'node']
        approvalTimeoutMs: 90000
        builds:
          web: { cmd: 'bun run build', cwd: 'D:/code/app' }
```

## 安装

服务器（host 半边）：

```bash
dsh plugin --profile web add github:LectWolf/dsh-desktop-bridge
```

主人电脑（agent 半边）：

```powershell
dsh plugin --profile desktop add github:LectWolf/dsh-desktop-bridge
# 在 profile 的 cordis.patch.yml 里启用 agent 半边，填服务器地址与设备令牌
```

令牌用服务端命令生成：

```bash
node lib/token.js add owner-win "主人的 Windows" /root/.dsh/desktop-bridge
```

## 状态

协议 v1 已定并实现：握手交换、三档权限、本机审批弹窗、服务端兜底超时、schema 设置页。
客户端半边的 harness 内嵌审批（替代原生窗体）还没做，见 `docs/protocol.md` 末尾的待办。

## 许可

MIT
