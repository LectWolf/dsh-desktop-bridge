# 隧道协议 v1

一条 WebSocket 连接承载一台设备。JSON 文本帧，`type` 字段区分消息；二进制帧预留（文件分片）。

## 建连

```
agent ──▶ wss://<host>/desktop-bridge/agent
          headers: Authorization: Bearer <device-token>
```

host 校验令牌哈希（只存 sha256），认不出就 `401` 直接关。认出来了才升级成 WebSocket，之后靠心跳保活。

**安全边界**：只有登记过的设备令牌能连；`/desktop-bridge/agent` 这条路径不过登录闸，是因为它自己做令牌校验，不是裸奔。其余 `/desktop-bridge/*` 仍然要过主人的 DSH 登录。

## 握手（v1 新增：两边交换能力）

`hello` 上报本机策略，host 用它算等待时长：

```jsonc
{ "type": "hello", "device": "owner-win", "hostname": "DESKTOP-XXX",
  "os": "win32", "dsh": "0.2.1",
  "tools": ["desktop_info", "desktop_exec", "..."],
  "policy": { "mode": "workspace", "roots": ["D:/code"], "allow": ["git","bun"] },
  "approval": { "timeoutMs": 90000, "local": true } }
```

host 回 `welcome`，把协商结果写回去：

```jsonc
{ "type": "welcome", "sessionId": "s_owner-win", "heartbeatSec": 25, "protocol": 1,
  "approval": { "timeoutMs": 90000 },
  "policy": { "roots": [], "allow": [] } }
```

`approval.timeoutMs` = min(服务端兜底, 客户端弹窗时长 + 2s)。主人电脑上弹窗 60 秒就关，服务端不会傻等 90 秒。

## host → agent

```jsonc
{ "type": "call", "callId": "c_01H...", "tool": "desktop_exec",
  "args": { "cmd": "bun run build", "cwd": "D:/code/app", "timeoutMs": 600000 },
  "deadlineMs": 1740000000000 }

{ "type": "approve", "id": "a_01H...", "tool": "desktop_exec",
  "args": { "cmd": "bun run build" }, "timeoutMs": 90000 }

{ "type": "cancel", "callId": "c_01H..." }
{ "type": "ping", "at": 1740000000000 }
```

## agent → host

```jsonc
{ "type": "result", "callId": "c_01H...", "ok": true,
  "exitCode": 0, "stdout": "...", "stderr": "", "truncated": false, "durationMs": 18422 }

{ "type": "result", "callId": "c_01H...", "ok": false, "error": "policy-denied", "message": "outside-roots" }

{ "type": "approve-result", "id": "a_01H...", "approved": true,
  "rememberMin": 0, "source": "grant" }

{ "type": "pong", "at": 1740000000000 }
{ "type": "event", "event": "approval-required", "callId": "...", "summary": "bun run build @ D:/code/app" }
```

## 权限档位（agent 侧 authoritative，v1）

| mode | 工具 | 路径 | 命令 |
| --- | --- | --- | --- |
| `view` | 只有只读三个 | 必须在 roots 内 | 不执行 |
| `workspace` | 全部 | 必须在 roots 内 | 必须在 allow 前缀内 |
| `full` | 全部 | 只挡系统目录（`/etc`、`C:\Windows`…） | 只挡破坏性命令（`rm -rf /`、`format c:`…） |

服务端另有一份 `roots`/`allow` 作为额外上限，两边都要放行才执行（纵深防御）。

## 审批（v1 起在主人电脑上做）

- agent 在 `hello` 里声明 `approval.local: true`，host 就把 `approve` 帧发给它，由本机弹窗决定。
- 不满足 v1（没有 `protocol: 1` 或 `approval.local`）的 agent 会被 `close 4002`，工具返回 `desktop-agent-incompatible`；服务端不再保留第二套审批界面。
- 「始终允许」只落在主人电脑（`~/.dsh/desktop-bridge-grants.json`），服务端改不动、也看不到。
- 超时由两边各自兜：客户端弹窗到点自动拒绝，host 再按握手时长兜一层，避免工具一直挂着。

## 规则

- **一设备一连接**：同 `device` 再次 hello 会顶掉旧连接（旧连接收到 `close 4000 superseded`）。
- **心跳**：`ping` 25s 一次，90s 无 `pong` 判定掉线。
- **调用超时**：host 侧 `deadlineMs` 到期即返回 `desktop-timeout`，同时发 `cancel`；agent 尽力终止整棵进程树。
- **截断**：stdout/stderr 各截断到 64 KiB，`truncated` 标记；需要全文时用 `desktop_read_file` 读日志。
- **不进模型历史的内容**：令牌、绝对路径里的用户名、环境变量值。

## 错误码（工具返回值）

| code | 含义 |
| --- | --- |
| `desktop-offline` | 设备未连接 |
| `desktop-timeout` | 执行超时 |
| `approval-timeout` | 主人没在时限内确认 |
| `approval-denied` | 主人拒绝 |
| `policy-denied` | 命令 / 路径不在白名单，或档位不允许这个工具 |
| `spawn-failed` | 本机起不了进程（路径不存在、权限不足） |
