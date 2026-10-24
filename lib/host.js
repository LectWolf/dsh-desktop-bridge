/**
 * host 半边：跑在服务器侧 DSH Host 里的插件。
 *
 * 职责：
 * 1. 起一个本机 HTTP + WebSocket 端点，等主人的电脑主动连进来；
 * 2. 向模型注册 `desktop_*` 工具（延迟加载），每次调用都请主人电脑本机确认；
 * 3. 维护设备令牌（只存哈希）与审计日志。
 *
 * 安全边界：端点只监听 127.0.0.1，对外由反向代理暴露，只认登记过的设备令牌；
 * 没有设备在线时工具直接返回 `desktop-offline`，不挂起、不重试。
 * @module dsh-desktop-bridge/host
 */

import { randomBytes } from 'node:crypto'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

import { defineTool } from '@deepseek-ai/dsh-tools'
import { WebSocketServer } from 'ws'

import {
  APPROVAL_TOOLS,
  PROTOCOL_VERSION,
  READONLY_TOOLS,
  TOOLS,
  checkCommand,
  checkPath,
  frame,
  hashToken,
  parseFrame,
} from './protocol.js'
import { Store } from './store.js'


/** 一个设备连接。 */
class AgentSocket {
  constructor(socket, device) {
    this.socket = socket
    this.device = device
    this.pending = new Map()
    this.approvals = new Map()
    this.alive = true
    this.lastPong = Date.now()
    /** 对端握手时上报的能力与策略（v1 起有值）。 */
    this.caps = null
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

  /**
   * 请主人电脑自己弹窗确认（客户端半边做审批）。
   * 服务端只等握手时约好的时长，超时就按拒绝处理，不无限挂着。
   */
  askApproval({ id, tool, args, timeoutMs }) {
    return new Promise((resolve) => {
      const waitMs = Math.max(5_000, Number(timeoutMs) || 90_000)
      const timer = setTimeout(() => {
        this.approvals.delete(id)
        resolve({ approved: false, reason: 'approval-timeout' })
      }, waitMs)
      this.approvals.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          this.approvals.delete(id)
          resolve(value)
        },
      })
      this.send('approve', { id, tool, args, timeoutMs: waitMs })
    })
  }

  settleApproval(id, value) {
    const entry = this.approvals.get(id)
    if (!entry) return
    entry.resolve({
      approved: Boolean(value.approved),
      reason: value.reason,
      rememberMin: Number(value.rememberMin) || 0,
      source: value.source,
    })
  }

  close(code = 1000, reason = '') {
    try {
      this.socket.close(code, reason)
    } catch {
      /* 已断开 */
    }
  }
}

/**
 * 插件入口。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} config
 */
export function applyHost(ctx, config = {}) {
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

  const store = new Store(settings.dataDir || path.join(os.homedir(), '.dsh', 'desktop-bridge'))
  /** @type {Map<string, AgentSocket>} */
  const agents = new Map()
  /** @type {Map<string, number>} */
  const onlineSince = new Map()

  const online = () => [...agents.keys()]

  async function dispatch({ tool, args }) {
    const deviceId = settings.deviceId || online()[0]
    const agent = deviceId ? agents.get(deviceId) : undefined
    if (!agent) {
      return { ok: false, error: 'desktop-offline', message: '主人的电脑没有连上来' }
    }
    if (agent.caps?.approval?.local !== true) {
      return { ok: false, error: 'desktop-agent-incompatible', message: '这台电脑的 agent 太旧，升级到协议 v1 再用' }
    }

    const needsApproval =
      APPROVAL_TOOLS.has(tool) ||
      (READONLY_TOOLS.has(tool) && settings.approveReadOnly !== false)

    if (needsApproval) {
      const id = `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      // 审批一律在主人电脑上做；等待时长用握手时约好的值，服务端不空等。
      const approvalTimeoutMs = agent.caps?.approval?.timeoutMs ?? settings.approvalTimeoutMs
      const decision = await agent.askApproval({ id, tool, args, timeoutMs: approvalTimeoutMs })
      store.audit({
        kind: 'approval',
        id,
        tool,
        device: deviceId,
        decision: decision.approved ? 'approved' : 'denied',
        waitMs: approvalTimeoutMs,
        reason: decision.reason,
      })
      if (!decision.approved) {
        return { ok: false, error: decision.reason || 'approval-denied' }
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
        // 延迟加载：工具定义平常不占上下文，模型要用时再展开。
        deferLoading: true,
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
        '列出主人电脑上一个目录的内容，路径按本机档位判定，调用前必须经主人同意。',
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
        '在主人电脑上写入文本文件，路径必须在 roots 内。需要主人在本机弹窗逐次确认。',
        {
          path: { type: 'string', required: true, description: '绝对路径' },
          content: { type: 'string', required: true, description: '文件内容' },
        }
      ),
      tool(
        'desktop_exec',
        '在主人电脑上执行一条命令（命令前缀与工作目录按本机档位判定）。需要主人逐次确认；不会静默执行。',
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
            caps: agents.get(device.id)?.caps ?? null,
          })),
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

    res.writeHead(404).end('not found')
  }

  /**
   * 设置卡用的设备管理接口。挂在 DSH 自己的 webServer 上，和页面同源，
   * 顺手用 Origin/Referer 做一层同源校验（令牌只在这条路径上生成）。
   */
  function panelHandler(req, res) {
    const url = new URL(req.url || '/', 'http://panel.invalid')
    const sub = url.pathname.slice(settings.basePath.length)
    const origin = req.headers.origin ?? req.headers.referer ?? ''
    const sameOrigin = origin === '' || origin.includes(req.headers.host ?? '\u0000')
    const reply = (code, value) => {
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(value))
    }
    const readBody = () =>
      new Promise((resolve) => {
        const chunks = []
        req.on('data', (chunk) => chunks.push(chunk))
        req.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
          } catch {
            resolve({})
          }
        })
      })

    if (!sameOrigin) {
      reply(403, { error: 'cross-origin' })
      return
    }

    if (req.method === 'GET' && sub === '/api/devices') {
      reply(200, {
        devices: store.devices().map((device) => ({
          id: device.id,
          name: device.name,
          addedAt: device.addedAt ?? null,
          lastSeen: device.lastSeen ?? null,
          online: agents.has(device.id),
          since: onlineSince.get(device.id) ?? null,
        })),
        basePath: settings.basePath,
      })
      return
    }

    if (req.method === 'POST' && sub === '/api/devices') {
      readBody().then(async (body) => {
        const id = String(body.id ?? '').trim()
        const name = String(body.name ?? '').trim() || id
        if (!/^[A-Za-z0-9._-]{1,64}$/.test(id)) {
          reply(400, { error: 'bad-device-id' })
          return
        }
        const token = `dbk_${randomBytes(24).toString('base64url')}`
        store.addDevice({ id, name, tokenHash: await hashToken(token), addedAt: Date.now() })
        store.audit({ kind: 'device-added', device: id, name })
        reply(200, { id, token })
      })
      return
    }

    if (req.method === 'POST' && sub === '/api/devices/revoke') {
      readBody().then((body) => {
        const id = String(body.id ?? '').trim()
        if (!id) {
          reply(400, { error: 'missing-id' })
          return
        }
        const agent = agents.get(id)
        if (agent) agent.close(4001, 'revoked')
        agents.delete(id)
        onlineSince.delete(id)
        store.removeDevice(id)
        store.audit({ kind: 'device-revoked', device: id })
        reply(200, { ok: true })
      })
      return
    }

    reply(404, { error: 'not-found' })
  }

  // 设备管理接口挂在 DSH 自己的 webServer 上：和页面同源、一起过登录闸。
  if (ctx.webServer) {
    ctx.effect(
      () => ctx.webServer.register({ kind: 'prefix', path: `${settings.basePath}/api`, handler: panelHandler }),
      'desktop-bridge: panel api'
    )
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
      ws.on('close', (code, reason) => {
        // 谁关的、为什么关，都留一条审计，客户端掉线才有据可查。
        store.audit({ kind: 'agent-disconnect', device: device.id, code, reason: String(reason).slice(0, 120) })
      })
      const previous = agents.get(device.id)
      if (previous) previous.close(4000, 'superseded')
      const agent = new AgentSocket(ws, device)
      agents.set(device.id, agent)
      onlineSince.set(device.id, Date.now())
      store.touchDevice(device.id)

      ws.on('message', (raw) => {
        try {
          handleFrame(raw)
        } catch (error) {
          // 单帧出错只断这一条连接，绝不能把整个 DSH 进程带下去。
          ctx.logger?.warn?.('desktop-bridge: bad frame from %s: %s', device.id, error?.message ?? error)
          agent.close(1011, 'bad-frame')
          agents.delete(device.id)
        }
      })

      const handleFrame = (raw) => {
        const value = parseFrame(raw)
        if (!value) return
        if (value.type === 'result') {
          agent.settle(value.callId, value)
          return
        }
        if (value.type === 'approve-result') {
          agent.settleApproval(String(value.id || ''), value)
          return
        }
        if (value.type === 'pong') {
          agent.lastPong = Date.now()
          return
        }
        if (value.type === 'hello') {
          if (Number(value.protocol) !== PROTOCOL_VERSION || value.approval?.local !== true) {
            store.audit({ kind: 'agent-rejected', device: device.id, protocol: value.protocol ?? 0 })
            agent.close(4002, 'incompatible-agent')
            agents.delete(device.id)
            return
          }
          const clientApproval = Number(value.approval?.timeoutMs)
          // 审批等待取两边的小值：服务端不愿空等，客户端也不愿弹窗挂太久。
          const approvalTimeoutMs = Math.min(
            settings.approvalTimeoutMs,
            Number.isFinite(clientApproval) && clientApproval > 0 ? clientApproval + 2_000 : settings.approvalTimeoutMs
          )
          agent.caps = {
            mode: value.policy?.mode ?? 'unknown',
            approval: {
              timeoutMs: approvalTimeoutMs,
              local: Boolean(value.approval?.local),
            },
            roots: Array.isArray(value.policy?.roots) ? value.policy.roots : [],
            allow: Array.isArray(value.policy?.allow) ? value.policy.allow : [],
            approvalTimeoutMs,
            tools: Array.isArray(value.tools) ? value.tools : [],
            hostname: value.hostname ?? '',
            os: value.os ?? '',
          }
          agent.send('welcome', {
            sessionId: `s_${device.id}`,
            heartbeatSec: 25,
            protocol: PROTOCOL_VERSION,
            approval: { timeoutMs: approvalTimeoutMs },
            policy: { roots: settings.roots, allow: settings.allow },
          })
        }
      }

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
