# 服务器端安装（host 半边）

host 半边跑在服务器的 DSH 里，注册 `desktop_*` 工具并提供面板。

## 1. 装进 profile

```bash
cd /root/.dsh/profiles/web
# 本地开发直接 link，发布后可换成 github: 或 npm 包名
pnpm add link:/root/dsh-desktop-bridge
```

在 `package.json` 的 `dsh.profile.bundles` 里追加 `dsh-desktop-bridge`。

## 2. 配置

`/root/.dsh/profiles/web/cordis.patch.yml` 追加：

```yaml
- id: desktop-bridge
  name: 'dsh-desktop-bridge'
  config:
    host: 127.0.0.1
    port: 19233
    basePath: /desktop-bridge
    dataDir: /root/.dsh/desktop-bridge
    approvalTimeoutMs: 90000
    roots:
      - D:/code
    allow:
      - git
      - bun
      - npm
      - node
```

`roots` / `allow` 是发给桌面端的策略提示，真正的拦截在桌面端本地也做一遍（双保险）。

## 3. 生成设备令牌

```bash
node /root/dsh-desktop-bridge/lib/token.js add owner-win "主人的 Windows" /root/.dsh/desktop-bridge
```

输出里那串 `dbk_...` 只显示一次，填到桌面端配置。

## 4. 反向代理

面板和 WebSocket 都要过 nginx。给 `dsh.mcii.cc` 站点加：

```nginx
location /desktop-bridge/ {
    proxy_pass http://127.0.0.1:19233;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
}
```

然后 `https://dsh.mcii.cc/desktop-bridge/panel` 就是面板地址。

## 5. 生效

重启 DSH（或让它热重载 patch），`desktop_*` 工具会出现在工具列表里。

## 注意

- 面板接口没有登录态，靠 nginx 侧限制（Cloudflare Access / basic auth / 仅内网）保护，别裸奔在公网。
- 插件加载失败会导致 DSH 起不来：改 patch 前先 `dsh --dump-config` 校验一遍。
