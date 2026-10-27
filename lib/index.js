/**
 * 一个包，两个半边：
 *
 * - 配了 `url` + `token` → 当成 agent，跑在主人电脑上，主动连服务器；
 * - 否则 → 当成 host，跑在服务器上，监听本机端口等电脑连进来。
 *
 * 半边由配置自动判定，同一个包在服务器和桌面上都装这一份；设置卡里填了
 * 服务器地址和令牌，它就切成 agent。
 * @module dsh-desktop-bridge
 */

import z from '@deepseek-ai/schemastery'

import { apply as applyAgent } from './agent.js'
import { applyHost } from './host.js'

/**
 * 两半边的配置合集。schema 派生设置卡，卡片里改的就是这份配置。
 */
export const Config = z.object({
  // —— 这台机器跑哪半边 ——
  side: z
    .union([z.const('auto'), z.const('host'), z.const('agent')])
    .default('auto')
    .volatile()
    .description('这台机器跑哪半边：auto=填了 url+token 就当客户端；host=只当服务端；agent=只当客户端。改动需要重启插件'),

  // —— 共用 ——
  mode: z
    .union([z.const('view'), z.const('workspace'), z.const('full')])
    .default('workspace')
    .volatile()
    .description('agent 侧权限档位：view 只看 / workspace 工作区内可改 / full 走全盘但挡系统目录'),
  approvalTimeoutMs: z.natural().role('ms').default(90_000).volatile().description('等待主人确认的兜底时长，握手时取两边较小值'),
  approveReadOnly: z.boolean().default(true).volatile().description('只读工具也要确认'),
  roots: z.array(String).role('table').default([]).description('工作区根目录（agent）／额外上限（host）'),
  allow: z.array(String).role('table').default([]).description('允许的命令前缀（agent）／额外上限（host）'),
  workspaceDirs: z
    .string()
    .default('')
    .volatile()
    .description('工作区目录，换行或逗号分隔；roots 为空时按它判定'),
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

  // —— agent 半边 ——
  url: z.string().default('').volatile().description('服务器隧道地址；填了就按 agent 跑，例如 wss://dsh.mcii.cc/desktop-bridge/agent'),
  token: z.string().role('secret').default('').volatile().description('设备令牌，服务端令牌工具里生成'),
  device: z.string().default('desktop').volatile().description('设备 id，要和令牌登记的一致'),
  reconnectMs: z.natural().role('ms').default(5_000).volatile().description('断线重连间隔'),

  // —— host 半边 ——
  host: z.string().default('127.0.0.1').volatile().description('host 监听地址，默认只给本机'),
  port: z.natural().default(19233).volatile().description('host 监听端口'),
  basePath: z.string().default('/desktop-bridge').volatile().description('反向代理路径前缀'),
  dataDir: z.string().default('').volatile().description('令牌与审计落盘目录，默认 ~/.dsh/desktop-bridge'),
})

export const name = 'desktop-bridge'
export const inject = ['tools', 'webServer']
export const reusable = false

/** 所有字段名，用来把 volatile 包装摊平成普通值。 */
const KEYS = [
  'side',
  'mode',
  'approvalTimeoutMs',
  'approveReadOnly',
  'workspaceDirs',
  'roots',
  'allow',
  'builds',
  'url',
  'token',
  'device',
  'reconnectMs',
  'host',
  'port',
  'basePath',
  'dataDir'
]

/**
 * 摊平一个字段：标了 `.volatile()` 的字段在运行时是 `{ get }` 包装，读一次取值。
 * @param value - 解析后的配置字段
 * @returns 普通值
 */
function unwrap(value) {
  if (value === null || typeof value !== 'object') return value
  const keys = Object.keys(value)
  if (keys.length === 1 && keys[0] === 'get' && typeof value.get === 'function') return value.get()
  return value
}

/**
 * 按配置决定挂哪半边。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} config
 */
export function apply(ctx, config = {}) {
  const settings = {}
  for (const key of KEYS) settings[key] = unwrap(config?.[key])
  if (!Array.isArray(settings.roots) || settings.roots.length === 0) {
    const dirs = String(settings.workspaceDirs ?? '')
      .split(/[\n,;]/)
      .map((item) => item.trim())
      .filter(Boolean)
    if (dirs.length > 0) settings.roots = dirs
  }
  const side =
    settings.side === 'agent' || settings.side === 'host'
      ? settings.side
      : settings.url && settings.token
        ? 'agent'
        : 'host'

  if (side === 'agent') {
    if (!settings.url || !settings.token) {
      ctx.logger?.warn?.('desktop-bridge: 选了客户端半边，但 url / token 没填全，插件不启动')
      return
    }
    ctx.logger?.info?.('desktop-bridge: agent 模式，连 %s', settings.url)
    applyAgent(ctx, settings)
    return
  }
  ctx.logger?.info?.('desktop-bridge: host 模式，监听 %s:%s', settings.host, settings.port)
  applyHost(ctx, settings)
}
