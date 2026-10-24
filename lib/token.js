/**
 * 设备令牌生成器（服务器侧用）。
 *
 * 用法：
 *   node lib/token.js add <deviceId> "<显示名>" <数据目录>
 *   node lib/token.js list <数据目录>
 *   node lib/token.js revoke <deviceId> <数据目录>
 *
 * 令牌只在这里打印一次，落盘的是 sha256。
 * @module dsh-desktop-bridge/token
 */

import { randomBytes } from 'node:crypto'
import path from 'node:path'

import { hashToken } from './protocol.js'
import { Store } from './store.js'

const [action, ...rest] = process.argv.slice(2)

async function main() {
  if (action === 'add') {
    const [id, name, dir] = rest
    if (!id || !dir) {
      console.error('用法: node lib/token.js add <deviceId> "<显示名>" <数据目录>')
      process.exit(1)
    }
    const store = new Store(path.resolve(dir))
    const token = `dbk_${randomBytes(24).toString('base64url')}`
    store.addDevice({ id, name: name || id, tokenHash: await hashToken(token), addedAt: Date.now() })
    console.log(`设备 ${id} 已登记。下面这串令牌只显示一次，填到桌面端配置里：\n\n${token}\n`)
    return
  }

  if (action === 'list') {
    const [dir] = rest
    const store = new Store(path.resolve(dir || '.'))
    for (const device of store.devices()) {
      console.log(`${device.id}\t${device.name}\t最近: ${device.lastSeen ? new Date(device.lastSeen).toLocaleString('zh-CN') : '从未连接'}`)
    }
    return
  }

  if (action === 'revoke') {
    const [id, dir] = rest
    const store = new Store(path.resolve(dir || '.'))
    store.removeDevice(id)
    console.log(`设备 ${id} 已移除，对应令牌立即失效。`)
    return
  }

  console.error('用法: node lib/token.js add|list|revoke ...')
  process.exit(1)
}

main()
