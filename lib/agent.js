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

import { PROTOCOL_VERSION, TOOLS, checkCommand, checkPath, frame, parseFrame } from './protocol.js'
import { runCommand } from './exec.js'

function readFileTool(args, settings) {
  const check = checkPath(settings.roots, args.path)
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
  const check = checkPath(settings.roots, args.path)
  if (!check.ok) return { ok: false, error: 'policy-denied', message: check.reason }
  fs.mkdirSync(path.dirname(check.path), { recursive: true })
  fs.writeFileSync(check.path, String(args.content ?? ''), 'utf8')
  return { ok: true, path: check.path, bytes: Buffer.byteLength(String(args.content ?? '')) }
}

function listDirTool(args, settings) {
  const check = checkPath(settings.roots, args.path)
  if (!check.ok) return { ok: false, error: 'policy-denied', message: check.reason }
  const entries = fs.readdirSync(check.path, { withFileTypes: true }).map((entry) => ({
    name: entry.name,
    dir: entry.isDirectory(),
  }))
  return { ok: true, path: check.path, entries: entries.slice(0, 2_000) }
}

async function handleCall(call, settings) {
  const { tool, args = {} } = call

  if (tool === 'desktop_info') {
    return {
      ok: true,
      hostname: os.hostname(),
      platform: process.platform,
      release: os.release(),
      dsh: settings.dshVersion ?? 'unknown',
      projects: Object.keys(settings.builds ?? {}),
      roots: settings.roots,
    }
  }

  if (tool === 'desktop_list_dir') return listDirTool(args, settings)
  if (tool === 'desktop_read_file') return readFileTool(args, settings)
  if (tool === 'desktop_write_file') return writeFileTool(args, settings)

  if (tool === 'desktop_exec') {
    const cmdCheck = checkCommand(settings.allow, args.cmd)
    if (!cmdCheck.ok) return { ok: false, error: 'policy-denied', message: cmdCheck.reason }
    if (args.cwd) {
      const cwdCheck = checkPath(settings.roots, args.cwd)
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
 * @param {string[]} [config.roots] 允许访问的根目录
 * @param {string[]} [config.allow] 允许的命令前缀
 * @param {Record<string, { cmd: string, cwd: string, timeoutMs?: number }>} [config.builds]
 */
export function createAgent(config) {
  const settings = {
    device: 'desktop',
    roots: [],
    allow: [],
    builds: {},
    reconnectMs: 5_000,
    ...config,
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
          device: settings.device,
          hostname: os.hostname(),
          os: process.platform,
          dsh: settings.dshVersion ?? 'unknown',
          tools: TOOLS,
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
