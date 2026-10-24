/**
 * 共享协议：帧构造、策略判定、路径白名单。
 * host 与 agent 两个半边都从这里取，保证两边理解一致。
 * @module dsh-desktop-bridge/protocol
 */

import path from 'node:path'

export const PROTOCOL_VERSION = 1

/**
 * 本机权限档位，由主人电脑上那份配置决定：
 * - `view`：只放只读工具，路径仍走 roots；
 * - `workspace`：读写都放，但路径必须落在选中的工作区内；
 * - `full`：完全权限，不做路径和命令白名单限制（明显破坏性的命令仍拒）。
 */
export const PERMISSION_MODES = ['view', 'workspace', 'full']

/** 归一化档位：认不出来的值一律退回最保守的 view，避免配置写错就全开。 */
export function normalizeMode(value) {
  return PERMISSION_MODES.includes(value) ? value : 'view'
}

/** 这套档位下允许用哪些工具。 */
export function toolsForMode(mode) {
  return mode === 'view' ? TOOLS.filter((tool) => READONLY_TOOLS.has(tool)) : TOOLS
}

/**
 * 系统目录底线：`full` 档也不许往这些地方写。读不拦，只拦写。
 * @param {string} target 目标路径
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function checkSystemPath(target) {
  const normalized = path
    .resolve(String(target))
    .toLowerCase()
    .replace(/[\\/]+$/, '')
  if (normalized === path.parse(normalized).root.replace(/[\\/]+$/, '')) {
    return { ok: false, reason: 'filesystem-root' }
  }
  const protectedDirs = [
    'c:\\windows',
    'c:\\program files\\windowsapps',
    'c:\\windows\\system32',
    '/etc',
    '/boot',
    '/usr',
    '/bin',
    '/sbin',
    '/lib',
    '/sys',
    '/proc',
    '/dev',
  ]
  for (const dir of protectedDirs) {
    if (normalized === dir || normalized.startsWith(dir + path.sep) || normalized.startsWith(dir + '/')) {
      return { ok: false, reason: 'system-directory' }
    }
  }
  return { ok: true }
}

/**
 * 明显破坏性的命令黑名单。即使 `full` 档也拦，作为最后一道底线：
 * 服务端被拿下时，至少不能一条命令把主人的系统盘抹掉。
 * @param {string} cmd 待执行命令
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function checkDestructive(cmd) {
  const text = String(cmd).replace(/\s+/g, ' ').trim().toLowerCase()
  const patterns = [
    /rm\s+(-[a-z]*\s+)*-?[a-z]*[rf][a-z]*\s+\/(\s|$)/,
    /rm\s+-[a-z]*r[a-z]*f?\s+[a-z]:[\\/]?(\s|$)/i,
    /\b(format|mkfs(\.\w+)?|diskpart|fdisk)\b/,
    /del\s+\/[sf]\s+[a-z]:\\/,
    /remove-item\s+-recurse\s+[a-z]:\\/,
    /\bshutdown\b|\breboot\b/,
    /:\(\)\s*\{.*\};?\s*:/,
  ]
  for (const pattern of patterns) {
    if (pattern.test(text)) return { ok: false, reason: 'destructive-command' }
  }
  return { ok: true }
}


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
