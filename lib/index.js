/**
 * host 半边：跑在服务器侧 DSH Host 里的插件。
 *
 * 职责：
 * 1. 起一个本机 HTTP + WebSocket 端点，等主人的电脑主动连进来；
 * 2. 向模型注册 `desktop_*` 工具，调用一律先过审批队列；
 * 3. 提供一块自绘面板（连接状态 / 待审批 / 审计 / 令牌管理）。
 *
 * 安全边界：端点只监听 127.0.0.1，对外由反向代理暴露；没有设备在线时
 * 工具直接返回 `desktop-offline`，不挂起、不重试。
 * @module dsh-desktop-bridge
 */

import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineTool } from '@deepseek-ai/dsh-tools'
import { WebSocketServer } from 'ws'

import {
  APPROVAL_TOOLS,
  READONLY_TOOLS,
  TOOLS,
  checkCommand,
  checkPath,
  frame,
  hashToken,
  parseFrame,
} from './protocol.js'
import { Store } from './store.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const panelFile = path.join(here, 'panel.html')

/** 一个设备连接。 */
class AgentSocket {
  constructor(socket, device) {
    this.socket = socket
    this.device = device
    this.pending = new Map()
    this.alive = true
    this.lastPong = Date.now()
  }

  send(type, payload) {
    if (this.socket.readyState === 1) this.socket.send(frame(type, payload))
  }

  call(callId, tool, args, deadlineMs) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(callId)
        resolve({ ok: false, error: 'desktop-timeout' })
      }, Math.max(1_000, deadlineMs - Date.now()))
      this.pending.set(callId, {
        resolve: (value) => {
          clearTimeout(timer)
          this.pending.delete(callId)
          resolve(value)
        },
      })
      this.send('call', { callId, tool, args, deadlineMs })
    })
  }

  settle(callId, value) {
    const entry = this.pending.get(callId)
    if (entry) entry.resolve(value)
  }

  close(code = 1000, reason = '') {
    try {
      this.socket.close(code, reason)
    } catch {
      /* 已断开 */
    }
  }
}

/** 一次等待主人确认的调用。 */
class ApprovalQueue {
  constructor({ timeoutMs, store, notify }) {
    this.timeoutMs = timeoutMs
    this.store = store
    this.notify = notify
    this.pending = new Map()
  }

  list() {
    return [...this.pending.values()].map((entry) => ({
      id: entry.id,
      tool: entry.tool,
      args: entry.args,
      createdAt: entry.createdAt,
      expiresAt: entry.createdAt + this.timeoutMs,
      device: entry.device,
    }))
  }

  ask({ id, tool, args, device }) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        this.store.audit({ kind: 'approval', id, tool, decision: 'timeout' })
        resolve({ approved: false, reason: 'approval-timeout' })
      }, this.timeoutMs)

      this.pending.set(id, {
        id,
        tool,
        args,
        device,
        createdAt: Date.now(),
        resolve: (decision) => {
          clearTimeout(timer)
          this.pending.delete(id)
          this.store.audit({
            kind: 'approval',
            id,
            tool,
            device,
            decision: decision.approved ? 'approved' : 'denied',
            rememberMin: decision.rememberMin ?? 0,
          })
          resolve(decision)
        },
      })

      this.notify({ id, tool, args, device })
    })
  }

  decide(id, approved, rememberMin = 0) {
    const entry = this.pending.get(id)
    if (!entry) return false
    entry.resolve({ approved, rememberMin })
    return true
  }
}

/**
 * 插件入口。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} config
 */
export function apply(ctx, config = {}) {
  const settings = {
    port: 19233,
    host: '127.0.0.1',
    basePath: '/desktop-bridge',
    dataDir: '',
    approvalTimeoutMs: 90_000,
    roots: [],
    allow: [],
    ...config,
  }

  const store = new Store(settings.dataDir || path.join(process.cwd(), '.dsh-desktop-bridge'))
  /** @type {Map<string, AgentSocket>} */
  const agents = new Map()
  /** @type {Map<string, number>} */
  const onlineSince = new Map()

  const online = () => [...agents.keys()]

  const approval = new ApprovalQueue({
    timeoutMs: settings.approvalTimeoutMs,
    store,
    notify: ({ id, tool, args }) => {
      ctx.logger?.info?.('desktop-bridge: 等待主人确认 %s (%s)', id, tool)
      for (const agent of agents.values()) {
        agent.send('event', {
          event: 'approval-required',
          callId: id,
          summary: `${tool} ${JSON.stringify(args).slice(0, 200)}`,
        })
      }
    },
  })

  const grantFor = (tool) =>
    store.grants().some((grant) => grant.tool === tool || grant.tool === '*')

  async function dispatch({ tool, args }) {
    const deviceId = settings.deviceId || online()[0]
    const agent = deviceId ? agents.get(deviceId) : undefined
    if (!agent) {
      return { ok: false, error: 'desktop-offline', message: '主人的电脑没有连上来' }
    }

    const needsApproval =
      APPROVAL_TOOLS.has(tool) ||
      (READONLY_TOOLS.has(tool) && settings.approveReadOnly !== false)

    if (needsApproval && !grantFor(tool)) {
      const id = `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      const decision = await approval.ask({ id, tool, args, device: deviceId })
      if (!decision.approved) {
        return { ok: false, error: decision.reason || 'approval-denied' }
      }
      if (decision.rememberMin > 0) {
        store.addGrant({
          tool,
          until: Date.now() + decision.rememberMin * 60_000,
        })
      }
    }

    const callId = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    const deadlineMs = Date.now() + (settings.callTimeoutMs ?? 600_000)
    const result = await agent.call(callId, tool, args, deadlineMs)
    store.audit({ kind: 'call', tool, device: deviceId, ok: result.ok !== false, error: result.error })
    // 只把有效载荷交给模型：协议信封（type / v / callId）没有意义。
    const { type: _type, v: _v, callId: _callId, ...payload } = result
    return payload
  }

  function registerTools() {
    const tool = (name, description, parameters) =>
      defineTool({
        name,
        description,
        parameters,
        output: {
          schema: { type: 'json' },
          render: (_args, value) => [
            { type: 'text', text: JSON.stringify(value, null, 2).slice(0, 20_000) },
          ],
        },
        execute: (args) => dispatch({ tool: name, args }),
      })

    const list = [
      tool(
        'desktop_info',
        '读取主人电脑的基本信息（主机名、系统、DSH 版本、已配置的工程目录）。调用前必须经主人同意；电脑没开机会直接返回 desktop-offline。',
        {}
      ),
      tool(
        'desktop_list_dir',
        '列出主人电脑上一个目录的内容，路径必须在配置的白名单 roots 内。调用前必须经主人同意。',
        {
          path: { type: 'string', required: true, description: '绝对路径' },
        }
      ),
      tool(
        'desktop_read_file',
        '读取主人电脑上的文本文件，路径必须在 roots 内，默认截断 256 KiB。调用前必须经主人同意。',
        {
          path: { type: 'string', required: true, description: '绝对路径' },
          maxBytes: { type: 'number', description: '最多读取字节数' },
        }
      ),
      tool(
        'desktop_write_file',
        '在主人电脑上写入文本文件，路径必须在 roots 内。需要主人逐次确认（除非面板里开了限时免问）。',
        {
          path: { type: 'string', required: true, description: '绝对路径' },
          content: { type: 'string', required: true, description: '文件内容' },
        }
      ),
      tool(
        'desktop_exec',
        '在主人电脑上执行一条命令（限白名单前缀、工作目录必须在 roots 内）。需要主人逐次确认；不会静默执行。',
        {
          cmd: { type: 'string', required: true, description: '命令行' },
          cwd: { type: 'string', description: '工作目录，必须在 roots 内' },
          timeoutMs: { type: 'number', description: '超时毫秒，默认 600000' },
        }
      ),
      tool(
        'desktop_build',
        '在主人电脑上按配置好的工程跑构建命令并回传产物清单（用于替代在服务器本地构建）。需要主人逐次确认。',
        {
          project: { type: 'string', required: true, description: '配置里的工程名' },
          extraArgs: { type: 'string', description: '追加参数' },
        }
      ),
    ]

    for (const item of list) ctx.tools.register(item)
  }

  function httpHandler(req, res) {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    if (!url.pathname.startsWith(settings.basePath)) {
      res.writeHead(404).end('not found')
      return
    }
    const sub = url.pathname.slice(settings.basePath.length)

    if (sub === '/panel' || sub === '/panel/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(fs.readFileSync(panelFile))
      return
    }

    if (sub === '/api/state') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(
        JSON.stringify({
          online: online(),
          devices: store.devices().map((device) => ({
            id: device.id,
            name: device.name,
            lastSeen: device.lastSeen ?? null,
            online: agents.has(device.id),
            since: onlineSince.get(device.id) ?? null,
          })),
          pending: approval.list(),
          grants: store.grants(),
          limits: { roots: settings.roots, allow: settings.allow },
          tools: TOOLS,
        })
      )
      return
    }

    if (sub === '/api/audit') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ entries: store.recentAudit(200) }))
      return
    }

    if (sub === '/api/grants/clear' && req.method === 'POST') {
      store.clearGrants()
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    if (sub === '/api/decision' && req.method === 'POST') {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
        if (body.length > 8_192) req.destroy()
      })
      req.on('end', () => {
        let payload = {}
        try {
          payload = JSON.parse(body || '{}')
        } catch {
          res.writeHead(400).end('bad json')
          return
        }
        const ok = approval.decide(
          String(payload.id || ''),
          Boolean(payload.approved),
          Number(payload.rememberMin || 0)
        )
        res.writeHead(ok ? 200 : 404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok }))
      })
      return
    }

    res.writeHead(404).end('not found')
  }

  const server = http.createServer(httpHandler)
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    if (url.pathname !== `${settings.basePath}/agent`) {
      socket.destroy()
      return
    }
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    const hash = await hashToken(token)
    const device = store.findDeviceByTokenHash(hash)
    if (!device) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const previous = agents.get(device.id)
      if (previous) previous.close(4000, 'superseded')
      const agent = new AgentSocket(ws, device)
      agents.set(device.id, agent)
      onlineSince.set(device.id, Date.now())
      store.touchDevice(device.id)

      ws.on('message', (raw) => {
        const value = parseFrame(raw)
        if (!value) return
        if (value.type === 'result') {
          agent.settle(value.callId, value)
          return
        }
        if (value.type === 'pong') {
          agent.lastPong = Date.now()
          return
        }
        if (value.type === 'hello') {
          agent.send('welcome', {
            sessionId: `s_${device.id}`,
            heartbeatSec: 25,
            policy: { roots: settings.roots, allow: settings.allow },
          })
        }
      })

      ws.on('close', () => {
        if (agents.get(device.id) === agent) {
          agents.delete(device.id)
          onlineSince.delete(device.id)
          store.touchDevice(device.id)
        }
      })
    })
  })

  const heartbeat = setInterval(() => {
    const now = Date.now()
    for (const [id, agent] of agents) {
      if (now - agent.lastPong > 90_000) {
        agent.close(4001, 'heartbeat-timeout')
        agents.delete(id)
        onlineSince.delete(id)
        continue
      }
      agent.send('ping', { at: now })
    }
  }, 25_000)

  registerTools()
  server.listen(settings.port, settings.host)

  ctx.effect(() => () => {
    clearInterval(heartbeat)
    for (const agent of agents.values()) agent.close(1001, 'shutdown')
    wss.close()
    server.close()
  })
}

export const name = 'desktop-bridge'
export const inject = ['tools']
export const reusable = false
export { checkCommand, checkPath }
