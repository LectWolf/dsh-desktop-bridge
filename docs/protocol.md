# 隧道协议 v0

一条 WebSocket 连接承载一台设备。JSON 文本帧，`type` 字段区分消息；二进制帧预留（文件分片）。

## 建连

```
agent ──▶ wss://<host>/desktop-bridge/agent?device=owner-win
          headers: Authorization: Bearer <device-token>
```

host 校验令牌哈希后回 `welcome`，之后心跳；令牌错误直接 401 关闭。

## host → agent

```jsonc
{ "type": "welcome", "sessionId": "s_01H...", "heartbeatSec": 25, "policy": { "roots": ["D:/code"], "allow": ["git","bun"] } }

{ "type": "call", "callId": "c_01H...", "tool": "desktop_exec",
  "args": { "cmd": "bun run build", "cwd": "D:/code/app", "timeoutMs": 600000 },
  "deadlineMs": 1740000000000 }

{ "type": "cancel", "callId": "c_01H..." }
{ "type": "ping", "at": 1740000000000 }
```

## agent → host

```jsonc
{ "type": "hello", "device": "owner-win", "hostname": "DESKTOP-XXX", "os": "win32", "dsh": "0.2.1", "tools": ["desktop_exec", "..."] }

{ "type": "result", "callId": "c_01H...", "ok": true,
  "exitCode": 0, "stdout": "...", "stderr": "", "truncated": false, "durationMs": 18422 }

{ "type": "result", "callId": "c_01H...", "ok": false, "error": "denied-by-policy" | "timeout" | "spawn-failed", "message": "..." }

{ "type": "pong", "at": 1740000000000 }
{ "type": "event", "event": "approval-required", "callId": "...", "summary": "bun run build @ D:/code/app" }
```

## 规则

- **一设备一连接**：同 `device` 再次 hello 会顶掉旧连接（旧连接收到 `close 4000 superseded`）。
- **心跳**：`ping` 25s 一次，连续 3 次无 `pong` 判定掉线，host 关闭连接并标记 offline。
- **调用超时**：host 侧 `deadlineMs` 到期即向模型返回 `desktop-timeout`，同时发 `cancel`；agent 尽力终止子进程树。
- **审批在 host 侧完成**：agent 只执行 host 已经批准并下发的 `call`，自己不再二次询问（避免双重弹窗）。
- **截断**：stdout/stderr 各截断到 64 KiB，`truncated` 标记；需要全文时用 `desktop_read_file` 读日志文件。
- **不进模型历史的内容**：令牌、绝对路径中的用户名、环境变量值。

## 错误码（工具返回值）

| code | 含义 |
| --- | --- |
| `desktop-offline` | 设备未连接 |
| `desktop-timeout` | 执行超时 |
| `approval-timeout` | 主人没在时限内确认 |
| `approval-denied` | 主人拒绝 |
| `policy-denied` | 命令 / 路径不在白名单 |
| `spawn-failed` | 本机起不了进程（路径不存在、权限不足） |
