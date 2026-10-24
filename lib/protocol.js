/**
 * 共享协议：帧构造、策略判定、路径白名单。
 * host 与 agent 两个半边都从这里取，保证两边理解一致。
 * @module dsh-desktop-bridge/protocol
 */

import path from 'node:path'

export const PROTOCOL_VERSION = 0

/** 需要主人逐次确认的工具（v0 里写死，面板可放开只读工具）。 */
export const APPROVAL_TOOLS = new Set([
  'desktop_exec',
  'desktop_write_file',
  'desktop_build',
])

export const READONLY_TOOLS = new Set([
  'desktop_info',
  'desktop_list_dir',
  'desktop_read_file',
])

/** 工具清单，host 注册工具与 agent 能力声明共用。 */
export const TOOLS = [
  'desktop_info',
  'desktop_list_dir',
  'desktop_read_file',
  'desktop_write_file',
  'desktop_exec',
  'desktop_build',
]

export function frame(type, payload = {}) {
  return JSON.stringify({ type, v: PROTOCOL_VERSION, ...payload })
}

export function parseFrame(raw) {
  let value
  try {
    value = JSON.parse(String(raw))
  } catch {
    return null
  }
  if (!value || typeof value !== 'object' || typeof value.type !== 'string') {
    return null
  }
  return value
}

/**
 * 判定一个路径是否落在 roots 白名单内。
 * Windows 上大小写不敏感、分隔符混用，所以统一小写 + 归一化后再比较。
 * @param {string[]} roots 允许的根目录
 * @param {string} target 待判定路径
 * @returns {{ ok: true, path: string } | { ok: false, reason: string }}
 */
export function checkPath(roots, target) {
  if (typeof target !== 'string' || target.trim() === '') {
    return { ok: false, reason: 'path-missing' }
  }
  if (!Array.isArray(roots) || roots.length === 0) {
    return { ok: false, reason: 'no-roots-configured' }
  }
  const resolved = path.resolve(target)
  const normalized = resolved.toLowerCase()
  for (const root of roots) {
    const rootPath = path.resolve(root).toLowerCase()
    const prefix = rootPath.endsWith(path.sep) ? rootPath : rootPath + path.sep
    if (normalized === rootPath || normalized.startsWith(prefix)) {
      return { ok: true, path: resolved }
    }
  }
  return { ok: false, reason: 'outside-roots' }
}

/**
 * 命令白名单：匹配命令名的前缀（`git`、`bun`、`npm run` 这种写法都支持）。
 * 不含 shell 元字符的纯前缀比较，避免 `git; rm -rf` 这类拼接混进来。
 * @param {string[]} allow 允许的命令前缀
 * @param {string} cmd 待执行命令
 */
export function checkCommand(allow, cmd) {
  if (typeof cmd !== 'string' || cmd.trim() === '') {
    return { ok: false, reason: 'command-missing' }
  }
  if (/[;&|`$><\n\r]/.test(cmd)) {
    return { ok: false, reason: 'shell-metacharacter' }
  }
  if (!Array.isArray(allow) || allow.length === 0) {
    return { ok: false, reason: 'no-allowlist-configured' }
  }
  const head = cmd.trim()
  for (const rule of allow) {
    const prefix = String(rule).trim()
    if (!prefix) continue
    if (head === prefix || head.startsWith(prefix + ' ')) {
      return { ok: true }
    }
  }
  return { ok: false, reason: 'not-allowlisted' }
}

/** 稳定地把令牌映射成可比较的哈希（host 侧只存这个）。 */
export async function hashToken(token) {
  const { createHash } = await import('node:crypto')
  return createHash('sha256').update(String(token)).digest('hex')
}
