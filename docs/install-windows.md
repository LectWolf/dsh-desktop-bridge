# Windows 桌面端安装

目标：让这台 Windows 上的 DSH Desktop 主动连上服务器，把本机工具暴露给服务器上的 Agent，且每次调用都要你确认。


## 1. 装插件

在 Desktop 的控制台里（或者任意能跑 `dsh` 的终端）：

```powershell
dsh plugin --profile desktop add github:LectWolf/dsh-desktop-bridge
```

装完后 `%USERPROFILE%\.dsh\profiles\desktop\package.json` 的依赖里会多这一条，`dsh.profile.bundles` 里也会出现 `dsh-desktop-bridge`，插件会作为一层 bundle 自动挂上。同一个包在服务器和桌面通用，配了 `url` + `token` 就走 agent 半边。

## 2. 填配置（设置卡里改）

左侧竖栏 **Plugins → Built-in plugin settings → Desktop bridge**，表单里填：

- **Server URL**：`wss://dsh.mcii.cc/desktop-bridge/agent`
- **Device token**：服务器生成的设备令牌
- **Device id**：`owner-win`（要和令牌登记的一致）
- **Permission level**：`View` / `Workspace` / `Full`
- **Reconnect interval**：5000
- 服务端那几项（监听地址 / 端口 / 数据目录）桌面端留空即可

保存后插件会按 agent 半边重连。`roots` / `allow` / `builds` 是数组和表，仍然写在 `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` 的**用户层**覆盖里：

```yaml
- id: desktop-bridge
  config:
    roots:
      - D:/code
    allow:
      - git
      - bun
      - node
    builds:
      new-api-web:
        cmd: bun run build
        cwd: D:/code/new-api/web
        timeoutMs: 900000
```

## 3. 重启 Desktop

保存后重启 DSH Desktop（或让它自己热重载）。

## 4. 验证

「设置 → 插件」里会多一张「桌面桥（这台电脑）」，服务器地址、令牌、设备 id、权限档位和超时都在里面改（`roots` / `allow` / `builds` 仍按上面的配置项改）。

连上以后服务器 Agent 能调到 `desktop_info`；调用需要在你这台电脑上弹窗点「允许一次 / 始终允许 / 拒绝」，90 秒不点就自动拒绝。

## 排错

| 现象 | 原因 |
| --- | --- |
| 面板显示离线 | 插件没起：看 Desktop 日志里 `desktop-bridge agent` 有没有报缺少 url/token |
| 连接被 401 拒绝 | 令牌不对或者已被 revoke；重新 `dsh plugin` 那台机器上换新令牌 |
| 一直重连 | 公司/校园网挡了 wss，给系统代理加上 `dsh.mcii.cc` 直连 |
| 调用报 `policy-denied` | 命令不在 `allow` 前缀里，或者路径不在 `roots` 里 |
