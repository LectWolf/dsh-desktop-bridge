/**
 * agent 侧的命令执行：带超时、整棵进程树终止、输出截断。
 * 只在主人的机器上跑，host 传来的 call 已经过多重策略校验。
 * @module dsh-desktop-bridge/exec
 */

import { spawn } from 'node:child_process'

const MAX_BYTES = 64 * 1024

function pushBounded(state, chunk) {
  if (state.truncated) return
  state.buffer.push(chunk)
  state.size += chunk.length
  while (state.size > MAX_BYTES) {
    state.truncated = true
    state.buffer = [Buffer.from('...[truncated]', 'utf8')]
    state.size = 20
    break
  }
}

function killTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    }).on('error', () => {})
    return
  }
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    try {
      child.kill('SIGKILL')
    } catch {
      /* 已经退出了 */
    }
  }
}

/**
 * @param {object} options
 * @param {string} options.cmd
 * @param {string} [options.cwd]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{ ok: boolean, exitCode: number|null, stdout: string, stderr: string,
 *   truncated: boolean, durationMs: number, error?: string }>}
 */
export function runCommand({ cmd, cwd, timeoutMs = 600_000 }) {
  return new Promise((resolve) => {
    const started = Date.now()
    const stdin = { buffer: [], size: 0, truncated: false }
    const stdout = { buffer: [], size: 0, truncated: false }
    const stderr = { buffer: [], size: 0, truncated: false }

    let child
    try {
      child = spawn(cmd, {
        cwd,
        shell: true,
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      resolve({
        ok: false,
        exitCode: null,
        stdout: '',
        stderr: '',
        truncated: false,
        durationMs: Date.now() - started,
        error: `spawn-failed: ${error instanceof Error ? error.message : String(error)}`,
      })
      return
    }

    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    const timer = setTimeout(() => {
      killTree(child)
      finish({
        ok: false,
        exitCode: null,
        stdout: Buffer.concat(stdout.buffer).toString('utf8'),
        stderr: Buffer.concat(stderr.buffer).toString('utf8'),
        truncated: stdout.truncated || stderr.truncated,
        durationMs: Date.now() - started,
        error: 'timeout',
      })
    }, Math.max(1_000, Math.min(timeoutMs, 3_600_000)))

    child.stdout?.on('data', (chunk) => pushBounded(stdout, chunk))
    child.stderr?.on('data', (chunk) => pushBounded(stderr, chunk))
    child.on('error', (error) => {
      finish({
        ok: false,
        exitCode: null,
        stdout: '',
        stderr: '',
        truncated: false,
        durationMs: Date.now() - started,
        error: `spawn-failed: ${error.message}`,
      })
    })
    child.on('close', (code) => {
      finish({
        ok: code === 0,
        exitCode: code,
        stdout: Buffer.concat(stdout.buffer).toString('utf8'),
        stderr: Buffer.concat(stderr.buffer).toString('utf8'),
        truncated: stdout.truncated || stderr.truncated,
        durationMs: Date.now() - started,
      })
    })
    void stdin
  })
}
