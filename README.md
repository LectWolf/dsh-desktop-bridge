# dsh-desktop-bridge

把「主人自己的电脑」变成远端 DSH Agent 可以调用的工具宿主：电脑出网连服务器，不开放任何公网端口；每一次调用都要主人点头。

供 DeepSeek Harness 使用，由两个半边组成，装成同一个插件包：

| 半边 | 跑在哪 | 作用 |
| --- | --- | --- |
| host | 服务器 / 远端 DSH Host | 注册 `desktop_*` 工具、维护反向 WebSocket、审批队列、面板 |
| agent | 主人的电脑（Windows / macOS / Linux） | 主动外连 host，在本机执行被批准的命令、回传结果 |

```
   服务器 DSH Host                                    主人电脑
┌──────────────────────────┐      WSS(出网)     ┌──────────────────────────┐
│ dsh-desktop-bridge host  │ ◀──────────────── │ dsh-desktop-bridge agent │
│  · desktop_* tools       │                    │  · 本机执行 shell/build  │
│  · 审批队列 + 面板        │ ───────────────▶  │  · 本地白名单 + 超时     │
└──────────────────────────┘      call/result   └──────────────────────────┘
```

## 为什么是这样

- **电脑没有公网 IP**：所以由电脑发起连接，服务器只接受连接，不主动拨号。
- **不给电脑开端口**：隧道建立在本机 → 服务器的出站 TLS 上，无需 NAT 穿透、无需 frp。
- **默认不可用就是不可用**：电脑关机 / 插件没开 → 工具立刻返回 `desktop-offline`，不做挂起等待、不重试轰炸。
- **没有「静默执行」这回事**：工具描述里写明必须经主人同意，执行前 host 会向主人发审批请求；超时一律按拒绝处理。

## 审批语义

1. 每次 `desktop_exec` / `desktop_write_file` / `desktop_build` 调用都会生成一条审批请求。
2. 审批通道可配置：DSH 面板内联确认、QQ 私聊回「允许 <id>」、或两者同时。
3. 超时（默认 90s）未确认 → 拒绝，工具返回 `approval-timeout`。
4. 主人可以对某条命令选择「30 分钟内免问」，形成有时限的授权；面板里能随时撤销。
5. 只读工具（`desktop_info`、`desktop_list_dir`、`desktop_read_file`）默认仍需审批，可在面板里单独放开。
6. 每次调用的命令、工作目录、决策、耗时、退出码都进审计日志，面板可查。

## 工具（v1）

| 工具 | 需要审批 | 说明 |
| --- | --- | --- |
| `desktop_info` | 可配置（默认要） | 主机名、系统、DSH 版本、已配置的工程目录 |
| `desktop_list_dir` | 可配置 | 列目录，限 `roots` 白名单内 |
| `desktop_read_file` | 可配置 | 读文件，限 `roots` 内，默认截断 256 KiB |
| `desktop_write_file` | 是 | 写文件，限 `roots` 内 |
| `desktop_exec` | 是 | 执行命令，cwd 限 `roots` 内，命令需匹配 `allow` 前缀 |
| `desktop_build` | 是 | 在配置好的工程目录跑指定构建命令，返回产物清单 |

## 配置（host 侧）

```yaml
desktopBridge:
  listenPath: /desktop-bridge
  devices:
    - id: owner-win
      name: 主人的 Windows
      tokenHash: <sha256>
  approval:
    timeoutMs: 90000
    channels: [panel, qq]
    qqUser: 2242299685
  roots:
    - D:/code
  allow:
    - git
    - bun
    - npm
    - node
```

## 安装

服务器（host 半边）：

```bash
dsh plugin --profile web add github:LectWolf/dsh-desktop-bridge
```

主人电脑（agent 半边，Windows 用 PowerShell）：

```powershell
dsh plugin --profile web add github:LectWolf/dsh-desktop-bridge
# 在 profile 的 cordis.patch.yml 里启用 agent 模式并填入服务器地址与设备令牌
```

## 状态

骨架阶段：协议与审批语义已定，host / agent / 面板正在实现。构建产物由主人电脑执行，服务器侧不编译。

## 许可

MIT
