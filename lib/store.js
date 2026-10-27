/**
 * 落盘的小状态：设备令牌哈希、审计日志、临时免问授权。
 * 全部是 JSON，放在 dataDir 下；写走临时文件 + rename，避免断电写坏。
 * @module dsh-desktop-bridge/store
 */

import fs from 'node:fs'
import path from 'node:path'

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2))
  fs.renameSync(tmp, file)
}

export class Store {
  /**
   * @param {string} dir 数据目录
   */
  constructor(dir) {
    this.dir = dir
    ensureDir(dir)
    this.devicesFile = path.join(dir, 'devices.json')
    this.auditFile = path.join(dir, 'audit.jsonl')
    this.grantsFile = path.join(dir, 'grants.json')
  }

  /** @returns {Array<{ id: string, name: string, tokenHash: string, token?: string, lastSeen?: number }>} */
  devices() {
    const value = readJson(this.devicesFile, { devices: [] })
    return Array.isArray(value.devices) ? value.devices : []
  }

  saveDevices(devices) {
    writeJson(this.devicesFile, { devices })
  }

  /**
   * 设备表。owner 要求令牌随时能复制，所以明文也存一份（文件 600，只有 root 能读）。
   * @returns {Array<object>}
   */
  addDevice(device) {
    const devices = this.devices().filter((item) => item.id !== device.id)
    devices.push(device)
    this.saveDevices(devices)
    return devices
  }

  removeDevice(id) {
    const devices = this.devices().filter((item) => item.id !== id)
    this.saveDevices(devices)
    return devices
  }

  findDeviceByTokenHash(hash) {
    return this.devices().find((item) => item.tokenHash === hash)
  }

  touchDevice(id, at = Date.now()) {
    const devices = this.devices().map((item) =>
      item.id === id ? { ...item, lastSeen: at } : item
    )
    this.saveDevices(devices)
  }

  /** 追加一条审计记录；不阻塞调用方。 */
  audit(entry) {
    const line = JSON.stringify({ at: Date.now(), ...entry })
    fs.appendFile(this.auditFile, line + '\n', () => {})
  }

  /** 最近 N 条审计（倒序）。 */
  recentAudit(limit = 100) {
    let text = ''
    try {
      text = fs.readFileSync(this.auditFile, 'utf8')
    } catch {
      return []
    }
    return text
      .split('\n')
      .filter(Boolean)
      .slice(-limit)
      .reverse()
      .map((line) => {
        try {
          return JSON.parse(line)
        } catch {
          return null
        }
      })
      .filter(Boolean)
  }

  /** 未过期的免问授权。 */
  grants() {
    const now = Date.now()
    const value = readJson(this.grantsFile, { grants: [] })
    const list = Array.isArray(value.grants) ? value.grants : []
    const alive = list.filter((item) => item.until > now)
    if (alive.length !== list.length) writeJson(this.grantsFile, { grants: alive })
    return alive
  }

  addGrant(grant) {
    const grants = this.grants().filter((item) => item.tool !== grant.tool)
    grants.push(grant)
    writeJson(this.grantsFile, { grants })
    return grants
  }

  clearGrants() {
    writeJson(this.grantsFile, { grants: [] })
    return []
  }
}
