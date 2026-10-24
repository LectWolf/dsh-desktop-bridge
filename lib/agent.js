/**
 * agent 半边：跑在主人电脑上的插件（也可以直接 `node lib/agent.js` 起）。
 *
 * 出站连接服务器，收到 host 下发且已批准的 call 才在本机执行；
 * 本机再做一次 roots / allow 策略校验，防止 host 侧配置被改坏。
 * @module dsh-desktop-bridge/agent
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { WebSocket } from 'ws'
import z from '@deepseek-ai/schemastery'

import {
  PROTOCOL_VERSION,
  checkCommand,
  checkDestructive,
  checkPath,
  checkSystemPath,
  frame,
  normalizeMode,
  parseFrame,
  toolsForMode,
} from './protocol.js'
import { ask } from './approver.js'
import { runCommand } from './exec.js'

/**
 * 本机路径校验：`full` 档不走 roots，只挡系统目录；其余档位照旧必须在 roots 内。
 * @param {object} settings 已归一化的本机配置
 * @param {string} target 目标路径
 */
function pathCheck(settings, target) {
  if (settings.mode === 'full') {
    const system = checkSystemPath(target)
    return system.ok ? { ok: true, path: path.resolve(String(target)) } : { ok: false, reason: system.reason }
  }
  return checkPath(settings.roots, target)
}

function readFileTool(args, settings) {
  const check = pathCheck(settings, args.path)
  if (!check.ok) return { ok: false, error: 'policy-denied', message: check.reason }
  const maxBytes = Math.min(Number(args.maxBytes) || 256 * 1024, 4 * 1024 * 1024)
  const stat = fs.statSync(check.path)
  if (!stat.isFile()) return { ok: false, error: 'not-a-file' }
  const fd = fs.openSync(check.path, 'r')
  const buffer = Buffer.alloc(Math.min(maxBytes, stat.size))
  fs.readSync(fd, buffer, 0, buffer.length, 0)
  fs.closeSync(fd)
  return {
    ok: true,
    path: check.path,
    size: stat.size,
    truncated: stat.size > buffer.length,
    content: buffer.toString('utf8'),
  }
}

function writeFileTool(args, settings) {
  const check = pathCheck(settings, args.path)
  if (!check.ok) return { ok: false, error: 'policy-denied', message: check.reason }
  fs.mkdirSync(path.dirname(check.path), { recursive: true })
  fs.writeFileSync(check.path, String(args.content ?? ''), 'utf8')
  return { ok: true, path: check.path, bytes: Buffer.byteLength(String(args.content ?? '')) }
}

function listDirTool(args, settings) {
  const check = pathCheck(settings, args.path)
  if (!check.ok) return { ok: false, error: 'policy-denied', message: check.reason }
  const entries = fs.readdirSync(check.path, { withFileTypes: true }).map((entry) => ({
    name: entry.name,
    dir: entry.isDirectory(),
  }))
  return { ok: true, path: check.path, entries: entries.slice(0, 2_000) }
}

async function handleCall(call, settings) {
  const { tool, args = {} } = call
  const mode = settings.mode

  if (!toolsForMode(mode).includes(tool)) {
    return { ok: false, error: 'policy-denied', message: `mode-${mode}-does-not-allow-${tool}` }
  }

  if (tool === 'desktop_info') {
    return {
      ok: true,
      hostname: os.hostname(),
      platform: process.platform,
      release: os.release(),
      dsh: settings.dshVersion ?? 'unknown',
      mode,
      projects: Object.keys(settings.builds ?? {}),
      roots: mode === 'full' ? ['*'] : settings.roots,
      allow: mode === 'full' ? ['*'] : settings.allow,
    }
  }

  if (tool === 'desktop_list_dir') return listDirTool(args, settings)
  if (tool === 'desktop_read_file') return readFileTool(args, settings)
  if (tool === 'desktop_write_file') return writeFileTool(args, settings)

  if (tool === 'desktop_exec') {
    const destructive = checkDestructive(args.cmd)
    if (!destructive.ok) return { ok: false, error: 'policy-denied', message: destructive.reason }
    if (mode !== 'full') {
      const cmdCheck = checkCommand(settings.allow, args.cmd)
      if (!cmdCheck.ok) return { ok: false, error: 'policy-denied', message: cmdCheck.reason }
    }
    if (args.cwd) {
      const cwdCheck = pathCheck(settings, args.cwd)
      if (!cwdCheck.ok) return { ok: false, error: 'policy-denied', message: cwdCheck.reason }
    }
    return runCommand({ cmd: args.cmd, cwd: args.cwd, timeoutMs: args.timeoutMs })
  }

  if (tool === 'desktop_build') {
    const project = settings.builds?.[args.project]
    if (!project) return { ok: false, error: 'unknown-project', message: args.project }
    const cmd = [project.cmd, args.extraArgs].filter(Boolean).join(' ')
    return runCommand({ cmd, cwd: project.cwd, timeoutMs: project.timeoutMs })
  }

  return { ok: false, error: 'unknown-tool', message: tool }
}

/**
 * @param {object} config
 * @param {string} config.url 服务器地址，例如 wss://dsh.mcii.cc/desktop-bridge/agent
 * @param {string} config.token 设备令牌
 * @param {string} config.device 设备 id
 * @param {'view'|'workspace'|'full'} [config.mode] 本机权限档位，默认 workspace
 * @param {string[]} [config.roots] 允许访问的根目录（workspace / view 档必填）
 * @param {string[]} [config.allow] 允许的命令前缀（workspace / view 档生效）
 * @param {number} [config.approvalTimeoutMs] 本机审批弹窗的等待时长，握手时告诉服务端
 * @param {Record<string, { cmd: string, cwd: string, timeoutMs?: number }>} [config.builds]
 */
export function createAgent(config) {
  const settings = {
    device: 'desktop',
    mode: 'workspace',
    roots: [],
    allow: [],
    approvalTimeoutMs: 90_000,
    builds: {},
    reconnectMs: 5_000,
    ...config,
  }
  settings.mode = normalizeMode(settings.mode)

  // 「始终允许」的本地凭据：只存在主人电脑上，服务端拿不到也改不动。
  const grantsFile = settings.grantsFile ?? path.join(os.homedir(), '.dsh', 'desktop-bridge-grants.json')
  const grants = new Map()
  try {
    const stored = JSON.parse(fs.readFileSync(grantsFile, 'utf8'))
    for (const [tool, until] of Object.entries(stored)) {
      if (Number(until) > Date.now()) grants.set(tool, Number(until))
    }
  } catch {
    /* 没有历史凭据 */
  }
  const saveGrants = () => {
    try {
      fs.mkdirSync(path.dirname(grantsFile), { recursive: true })
      fs.writeFileSync(grantsFile, JSON.stringify(Object.fromEntries(grants), null, 2), 'utf8')
    } catch {
      /* 写不进去也不影响本次会话 */
    }
  }

  let socket
  let closed = false
  let retryTimer

  const connect = () => {
    socket = new WebSocket(settings.url, {
      headers: { authorization: `Bearer ${settings.token}` },
    })

    socket.on('open', () => {
      socket.send(
        frame('hello', {
          protocol: PROTOCOL_VERSION,
          device: settings.device,
          hostname: os.hostname(),
          os: process.platform,
          dsh: settings.dshVersion ?? 'unknown',
          tools: toolsForMode(settings.mode),
          policy: {
            mode: settings.mode,
            roots: settings.mode === 'full' ? ['*'] : settings.roots,
            allow: settings.mode === 'full' ? ['*'] : settings.allow,
          },
          approval: { timeoutMs: settings.approvalTimeoutMs, local: true },
        })
      )
    })

    socket.on('message', async (raw) => {
      const value = parseFrame(raw)
      if (!value) return
      if (value.type === 'ping') {
        socket.send(frame('pong', { at: value.at }))
        return
      }
      if (value.type === 'approve') {
        const tool = String(value.tool || '')
        const id = String(value.id || '')
        const cachedUntil = grants.get(tool)
        let decision
        if (cachedUntil && cachedUntil > Date.now()) {
          decision = { approved: true, rememberMin: 0, source: 'grant' }
        } else {
          decision = await ask({
            tool,
            args: value.args ?? {},
            timeoutMs: Number(value.timeoutMs) || settings.approvalTimeoutMs,
          })
        }
        if (decision.approved && decision.rememberMin > 0) {
          grants.set(tool, Date.now() + decision.rememberMin * 60_000)
          saveGrants()
        }
        socket.send(
          frame('approve-result', {
            id,
            approved: Boolean(decision.approved),
            reason: decision.reason,
            rememberMin: decision.rememberMin ?? 0,
            source: decision.source,
          })
        )
        return
      }
      if (value.type === 'call') {
        let result
        try {
          result = await handleCall(value, settings)
        } catch (error) {
          result = {
            ok: false,
            error: 'spawn-failed',
            message: error instanceof Error ? error.message : String(error),
          }
        }
        socket.send(frame('result', { callId: value.callId, ...result }))
      }
    })

    socket.on('close', () => {
      if (closed) return
      retryTimer = setTimeout(connect, settings.reconnectMs)
    })

    socket.on('error', () => {
      try {
        socket.close()
      } catch {
        /* 忽略 */
      }
    })
  }

  connect()

  return {
    stop() {
      closed = true
      clearTimeout(retryTimer)
      try {
        socket?.close(1000, 'bye')
      } catch {
        /* 忽略 */
      }
    },
  }
}

/** cordis 插件入口（装进桌面端 DSH 时用）。 */
export function apply(ctx, config = {}) {
  if (!config.url || !config.token) {
    ctx.logger?.warn?.('desktop-bridge agent: 缺少 url / token，插件不启动')
    return
  }
  const agent = createAgent(config)
  ctx.effect(() => () => agent.stop())
}


/** 桌面端插件配置：这一份是主人电脑上的权限源头，schema 直接生成设置页。 */
export const Config = z.object({
  url: z.string().required().description('服务器地址，例如 wss://dsh.mcii.cc/desktop-bridge/agent'),
  token: z.string().role('secret').required().description('设备令牌，服务端令牌工具里生成'),
  device: z.string().default('desktop').description('设备 id，要和令牌登记的一致'),
  mode: z
    .union([z.const('view'), z.const('workspace'), z.const('full')])
    .default('workspace')
    .description('view 只看 / workspace 工作区内可改 / full 完全权限'),
  roots: z.array(String).role('table').default([]).description('工作区根目录，workspace / view 档必填'),
  allow: z.array(String).role('table').default([]).description('允许的命令前缀'),
  approvalTimeoutMs: z.natural().role('ms').default(90_000).description('本机弹窗等待时长，握手时同步给服务端'),
  reconnectMs: z.natural().role('ms').default(5_000).description('断线重连间隔'),
  builds: z
    .dict(
      z.object({
        cmd: z.string().required(),
        cwd: z.string().required(),
        timeoutMs: z.natural().role('ms').default(600_000),
      })
    )
    .default({})
    .description('desktop_build 的工程表'),
})

export const name = 'desktop-bridge-agent'
export const reusable = false
export { handleCall }

// 直接 `node lib/agent.js` 时的独立启动，便于在 Windows 上先手动验证。
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const configFile = process.argv[2]
  if (!configFile) {
    console.error('用法: node lib/agent.js <config.json>')
    process.exit(1)
  }
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'))
  createAgent(config)
  console.log('desktop-bridge agent 已启动，协议版本', PROTOCOL_VERSION)
}
