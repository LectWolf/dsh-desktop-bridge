/**
 * 策略派生：`roots` / `allow` 是数组，表单里填不了；`workspaceDirs` 是它的
 * 换行/逗号快捷版（历史遗留，文档里写过但一直没人读）。
 *
 * 这里统一把「数组优先，快捷字段兜底」这条规则收成一处，两半边都调它，
 * 免得再出现「填了工作区目录但不生效」。
 * @module dsh-desktop-bridge/policy
 */

/**
 * 把 "D:/a\nD:/b, D:/c" 拆成数组。
 * @param {unknown} value
 * @returns {string[]}
 */
export function splitList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).filter(Boolean)
  }
  if (typeof value !== 'string') return []
  return value
    .split(/[\r\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

/**
 * 生效的工作区根目录：数组非空就用数组，否则用 workspaceDirs 快捷字段。
 * @param {object} settings
 * @returns {string[]}
 */
export function effectiveRoots(settings = {}) {
  const roots = splitList(settings.roots)
  if (roots.length) return roots
  return splitList(settings.workspaceDirs)
}

/**
 * 生效的命令前缀白名单（只认数组）。
 * @param {object} settings
 * @returns {string[]}
 */
export function effectiveAllow(settings = {}) {
  return splitList(settings.allow)
}
