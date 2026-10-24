/**
 * 本机审批：主人电脑上弹一个窗口，问「允许一次 / 始终允许 / 拒绝」。
 *
 * 现在用的是 Windows 原生窗体（PowerShell + WinForms），因为客户端半边的
 * harness 弹窗还没接上；接口形状先按最终版定型，之后换实现不动调用方：
 *   ask({ tool, args, timeoutMs }) -> { approved, rememberMin }
 *
 * 非 Windows（开发机 / 自测）读不到窗体，用环境变量兜底：
 * - `DESKTOP_BRIDGE_APPROVER=allow` 一律放行；
 * - 其余情况一律拒绝，避免静默放行。
 * @module dsh-desktop-bridge/approver
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const WINDOWS_FORM = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form = New-Object System.Windows.Forms.Form
$form.Text = '桌面桥 · 需要主人确认'
$form.Width = 560; $form.Height = 300
$form.StartPosition = 'CenterScreen'
$form.TopMost = $true
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false; $form.MinimizeBox = $false

$title = New-Object System.Windows.Forms.Label
$title.Text = '__TOOL_LABEL__'
$title.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 12, [System.Drawing.FontStyle]::Bold)
$title.AutoSize = $false; $title.Width = 520; $title.Height = 32
$title.Location = New-Object System.Drawing.Point(16, 14)
$form.Controls.Add($title)

$body = New-Object System.Windows.Forms.TextBox
$body.Multiline = $true
$body.ReadOnly = $true
$body.ScrollBars = 'Vertical'
$body.Font = New-Object System.Drawing.Font('Consolas', 9)
$body.Width = 520; $body.Height = 150
$body.Location = New-Object System.Drawing.Point(16, 50)
$body.Text = '__PAYLOAD__'
$form.Controls.Add($body)

$once = New-Object System.Windows.Forms.Button
$once.Text = '允许一次'; $once.Width = 140; $once.Location = New-Object System.Drawing.Point(16, 214)
$always = New-Object System.Windows.Forms.Button
$always.Text = '始终允许'; $always.Width = 140; $always.Location = New-Object System.Drawing.Point(170, 214)
$deny = New-Object System.Windows.Forms.Button
$deny.Text = '拒绝'; $deny.Width = 140; $deny.Location = New-Object System.Drawing.Point(324, 214)

$script:answer = 'deny'
$once.Add_Click({ $script:answer = 'once'; $form.Close() })
$always.Add_Click({ $script:answer = 'always'; $form.Close() })
$deny.Add_Click({ $script:answer = 'deny'; $form.Close() })
$form.Controls.AddRange(@($once, $always, $deny))
$form.Add_FormClosed({ if ($script:answer -eq 'deny') { Write-Output 'deny' } else { Write-Output $script:answer } })
[void]$form.ShowDialog()
$form.Dispose()
`

/** 把任意字符串塞进 PowerShell 单引号字面量里。 */
function psQuote(text) {
  return String(text).replace(/'/g, "''")
}

/**
 * 让主人在本机确认一次调用。
 * @param {object} request
 * @param {string} request.tool 工具名
 * @param {object} request.args 工具参数
 * @param {number} [request.timeoutMs] 等待时长，超时按拒绝处理
 * @returns {Promise<{ approved: boolean, rememberMin: number, reason?: string }>}
 */
export async function ask({ tool, args, timeoutMs = 90_000 }) {
  const summary = JSON.stringify(args ?? {}, null, 2).slice(0, 4_000)
  if (process.platform !== 'win32') {
    if (process.env.DESKTOP_BRIDGE_APPROVER === 'allow') {
      return { approved: true, rememberMin: 0 }
    }
    return { approved: false, rememberMin: 0, reason: 'no-local-approver' }
  }

  const script = WINDOWS_FORM.replace('__TOOL_LABEL__', psQuote(tool)).replace(
    '__PAYLOAD__',
    psQuote(summary).replace(/\r?\n/g, "`n")
  )
  const file = path.join(os.tmpdir(), `desktop-bridge-approve-${process.pid}-${Date.now()}.ps1`)
  fs.writeFileSync(file, script, 'utf8')
  try {
    const answer = await runPowerShell(file, timeoutMs)
    if (answer === 'once') return { approved: true, rememberMin: 0 }
    if (answer === 'always') return { approved: true, rememberMin: 30 * 24 * 60 }
    return { approved: false, rememberMin: 0, reason: answer ? 'denied' : 'approval-timeout' }
  } finally {
    fs.rm(file, { force: true }, () => {})
  }
}

/** 起 powershell 跑窗体，超时就杀掉并当作拒绝。 */
function runPowerShell(file, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file],
      { windowsHide: false }
    )
    let out = ''
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* 已退出 */
      }
      resolve('')
    }, Math.max(5_000, timeoutMs))
    child.stdout.on('data', (chunk) => {
      out += chunk
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve('')
    })
    child.on('close', () => {
      clearTimeout(timer)
      const value = out.trim().toLowerCase()
      resolve(['once', 'always', 'deny'].includes(value) ? value : '')
    })
  })
}
