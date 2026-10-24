window.__ModuleLoader__.load({
	id: "dsh-desktop-bridge",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		/** 设置命名空间 = profile 里这一行插件的 id。 */
		const NS_CONFIG = "desktop-bridge";
		/** 词典命名空间。 */
		const NS = "desktop-bridge.settings";
		/** agent 半边（这台电脑当客户端）要填的字段。 */
		const AGENT_FIELDS = [
			["url", "url", "urlHint", false],
			["token", "token", "tokenHint", false],
			["device", "device", "deviceHint", false],
			["mode", "mode", "modeHint", false],
			["reconnectMs", "reconnectMs", "reconnectMsHint", true]
		];
		/** host 半边（这台电脑当服务端）要填的字段。 */
		const HOST_FIELDS = [
			["host", "host", "hostHint", false],
			["port", "port", "portHint", true],
			["basePath", "basePath", "basePathHint", false],
			["dataDir", "dataDir", "dataDirHint", false]
		];
		const SHARED_FIELDS = [["approvalTimeoutMs", "approvalTimeoutMs", "approvalTimeoutMsHint", true]];
		const ALL_FIELDS = [
			...AGENT_FIELDS,
			...HOST_FIELDS,
			...SHARED_FIELDS,
			["workspaceDirs", "workspaceDirs", "workspaceDirsHint", false]
		];
		const en = {
			title: "Desktop bridge",
			summary: "Reverse tunnel between this computer and the server; every call needs the owner's approval.",
			side: "This computer is",
			sideHost: "Server",
			sideAgent: "Client",
			url: "Server URL",
			urlHint: "For example wss://dsh.mcii.cc/desktop-bridge/agent",
			token: "Device token",
			tokenHint: "Issued on the server side; shown once.",
			device: "Device id",
			deviceHint: "Must match the id the token was issued for.",
			mode: "Permission level",
			modeHint: "View: read only · Workspace: only inside the folders below · Full: anywhere, system folders always refused.",
			modeView: "View",
			modeWorkspace: "Workspace",
			modeFull: "Full",
			workspaceDirs: "Workspace folders",
			workspaceDirsHint: "One per line. Reading, writing and running commands stay inside them.",
			reconnectMs: "Reconnect interval (ms)",
			reconnectMsHint: "Wait before dialling again after the connection drops.",
			host: "Listen address",
			hostHint: "Keep it on 127.0.0.1 and let the reverse proxy expose the tunnel endpoint.",
			port: "Listen port",
			portHint: "The loopback port this side listens on; the reverse proxy points here.",
			basePath: "Reverse-proxy path",
			basePathHint: "The URL prefix the reverse proxy forwards to this plugin.",
			dataDir: "Data directory",
			dataDirHint: "Hashed device tokens and the audit log live here.",
			approvalTimeoutMs: "Approval timeout (ms)",
			approvalTimeoutMsHint: "How long the server waits for this computer's answer before refusing.",
			devices: "Devices",
			devicesHint: "Tokens are stored hashed; a new one is shown once, here.",
			deviceId: "Device id",
			deviceName: "Name (optional)",
			generate: "Generate token",
			revoke: "Revoke",
			refresh: "Refresh",
			noDevices: "No device registered yet.",
			online: "online",
			offline: "offline",
			never: "never connected",
			tokenOnce: "Token for %s — copy it now, it is not stored:",
			connected: "Connected",
			disconnected: "Not connected",
			disconnectedWith: "Not connected (%s)",
			onlineCount: "%d device(s) online",
			statusUnknown: "Status unknown",
			copy: "Copy",
			overridden: "Overridden",
			reset: "Reset",
			invalid: "Check this value.",
			readOnly: "This deployment stores settings read-only.",
			unavailable: "This plugin is not loaded, so it cannot be configured right now.",
			save: "Save",
			saving: "Saving…",
			saveFailed: "The deployment did not accept these values; they were kept for you to fix."
		};
		const zh = {
			title: "桌面桥",
			summary: "这台电脑和服务器之间的反向隧道，每次调用都要你确认。",
			side: "这台电脑是",
			sideHost: "服务端",
			sideAgent: "客户端",
			url: "服务器地址",
			urlHint: "例如 wss://dsh.mcii.cc/desktop-bridge/agent",
			token: "设备令牌",
			tokenHint: "在服务端那一侧生成，只显示一次。",
			device: "设备 id",
			deviceHint: "必须和令牌签发时登记的 id 一致。",
			mode: "权限档位",
			modeHint: "只看：只能读；工作区：只在下面这些目录里改文件、跑命令；全盘：任何位置都能用，系统目录永远禁止。",
			modeView: "只看",
			modeWorkspace: "工作区",
			modeFull: "全盘",
			workspaceDirs: "工作区目录",
			workspaceDirsHint: "一行一个。读文件、改文件、跑命令都限制在这些目录里。",
			reconnectMs: "重连间隔（毫秒）",
			reconnectMsHint: "断线后隔多久再拨一次。",
			host: "监听地址",
			hostHint: "保持 127.0.0.1，对外交给反向代理。",
			port: "监听端口",
			portHint: "这一侧在回环口上监听的端口，反向代理指到这里。",
			basePath: "反代路径",
			basePathHint: "反向代理转发到本插件的前缀。",
			dataDir: "数据目录",
			dataDirHint: "令牌哈希和审计日志放在这里。",
			approvalTimeoutMs: "审批超时（毫秒）",
			approvalTimeoutMsHint: "服务端等你回话的最长时间，到点按拒绝处理。",
			devices: "设备",
			devicesHint: "令牌只存哈希，新令牌生成后只在这里显示一次。",
			deviceId: "设备 id",
			deviceName: "名称（可空）",
			generate: "生成令牌",
			revoke: "撤销",
			refresh: "刷新",
			noDevices: "还没有登记设备。",
			online: "在线",
			offline: "离线",
			never: "从未连接",
			tokenOnce: "%s 的令牌，现在就复制，之后不再显示：",
			connected: "已连接",
			disconnected: "未连接",
			disconnectedWith: "未连接（%s）",
			onlineCount: "%d 台在线",
			statusUnknown: "状态未知",
			copy: "复制",
			overridden: "已覆盖",
			reset: "恢复默认",
			invalid: "这个值不对。",
			readOnly: "本部署的设置为只读。",
			unavailable: "该插件当前未加载，暂时无法配置。",
			save: "保存",
			saving: "保存中…",
			saveFailed: "本部署没有接受这些值，已保留供你修改。"
		};
		function formLabels(t) {
			return {
				unavailable: t("unavailable"),
				readOnly: t("readOnly"),
				saveFailed: t("saveFailed"),
				save: t("save"),
				saving: t("saving")
			};
		}
		/**
		 * 一个字段：把表单模型里的状态摊进 SettingsValueField，改动回写给 edit。
		 * @param t - 词典
		 * @param state - 表单快照
		 * @param props - 页面动作（edit / resetField）
		 * @param name - 配置字段名
		 * @param labelKey - 标签词条
		 * @param hintKey - 说明词条
		 * @param numeric - 是否数字输入
		 */
		function field(t, state, props, name, labelKey, hintKey, numeric) {
			return (0, react_jsx_runtime.jsx)(
				primitives.SettingsValueField,
				{
					id: `desktop-bridge-${name}`,
					label: t(labelKey),
					hint: t(hintKey),
					overriddenLabel: t("overridden"),
					resetLabel: t("reset"),
					invalidLabel: t("invalid"),
					numeric,
					disabled: !state.writable,
					...state[name],
					onEdit: (text) => {
						props.edit(name, text);
					},
					onReset: () => {
						props.resetField(name);
					}
				},
				name
			);
		}
		/**
		 * 权限档位：三档分段控件，选中即写进表单。
		 * @param t - 词典
		 * @param state - 表单快照
		 * @param props - 页面动作
		 */
		function modeControl(t, state, props) {
			return (0, react_jsx_runtime.jsxs)(
				"div",
				{
					style: { margin: "2px 0 6px" },
					children: [
						(0, react_jsx_runtime.jsx)(primitives.SegmentedControl, {
							id: "desktop-bridge-mode",
							label: t("mode"),
							value: state.mode?.value ?? "workspace",
							disabled: !state.writable,
							options: [
								{ value: "view", label: t("modeView") },
								{ value: "workspace", label: t("modeWorkspace") },
								{ value: "full", label: t("modeFull") }
							],
							onChange: (next) => {
								props.edit("mode", next);
							}
						}),
						(0, react_jsx_runtime.jsx)("p", {
							style: { margin: "4px 0 0", fontSize: 12, opacity: 0.7 },
							children: t("modeHint")
						})
					]
				},
				"mode"
			);
		}
		/**
		 * 半边选择器：服务端 / 客户端，只影响这一页显示哪些字段，不写配置。
		 * @param t - 词典
		 * @param side - 当前选中的半边
		 * @param onSide - 切换回调
		 */
		function sideControl(t, side, onSide) {
			return (0, react_jsx_runtime.jsx)(
				primitives.SegmentedControl,
				{
					id: "desktop-bridge-side",
					label: t("side"),
					value: side,
					options: [
						{ value: "host", label: t("sideHost") },
						{ value: "agent", label: t("sideAgent") }
					],
					onChange: (next) => {
						onSide(next === "agent" ? "agent" : "host");
					}
				},
				"side"
			);
		}
		/**
		 * 读 JSON 回复；空响应或非 JSON 一律当成一次可读的失败，别把解析异常丢给用户。
		 * @param res - fetch 的 Response
		 */
		async function readJson(res) {
			const text = await res.text();
			if (text.trim() === "") throw new Error(`HTTP ${res.status}: empty response`);
			try {
				return JSON.parse(text);
			} catch {
				throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
			}
		}
		/**
		 * 连接状态灯：服务端看有几台在线，客户端看自己有没有连上，五秒刷一次。
		 * @param props - t / basePath / side
		 */
		function StatusDot(props) {
			const { t, basePath, side } = props;
			const [status, setStatus] = react.useState(null);
			react.useEffect(() => {
				let alive = true;
				const load = () =>
					fetch(`${basePath}/api/status`, { headers: { accept: "application/json" } })
						.then(readJson)
						.then((body) => {
							if (alive) setStatus(body);
						})
						.catch(() => {
							if (alive) setStatus(null);
						});
				load();
				const timer = setInterval(load, 5000);
				return () => {
					alive = false;
					clearInterval(timer);
				};
			}, [basePath]);
			let online = false;
			let label = t("statusUnknown");
			if (status !== null && status.side === "host") {
				online = Number(status.online) > 0;
				label = t("onlineCount").replace("%d", String(status.online ?? 0));
			} else if (status !== null && status.side === "agent") {
				online = status.connected === true;
				label = status.connected ? t("connected") : status.lastError ? t("disconnectedWith").replace("%s", String(status.lastError).slice(0, 80)) : t("disconnected");
			}
			return (0, react_jsx_runtime.jsxs)(
				"div",
				{
					style: { display: "flex", alignItems: "center", gap: 8, margin: "0 0 6px", fontSize: 12 },
					children: [
						(0, react_jsx_runtime.jsx)("span", {
							style: {
								width: 8,
								height: 8,
								borderRadius: 999,
								background: online ? "#2ecc71" : "#9aa0a6",
								boxShadow: online ? "0 0 0 3px rgba(46,204,113,0.18)" : "none"
							}
						}),
						(0, react_jsx_runtime.jsx)("span", { style: { opacity: 0.8 }, children: label })
					]
				},
				"status"
			);
		}
		/**
		 * 服务端那一侧的设备与令牌管理（独立组件，钩子不跟父组件混）。
		 * @param props - t 与 basePath
		 */
		function DevicePanel(props) {
			const { t, basePath } = props;
			const [devices, setDevices] = react.useState(null);
			const [id, setId] = react.useState("");
			const [name, setName] = react.useState("");
			const [issued, setIssued] = react.useState(null);
			const [error, setError] = react.useState("");
			const load = () => {
				fetch(`${basePath}/api/devices`, { headers: { accept: "application/json" } })
					.then(readJson)
					.then((body) => setDevices(Array.isArray(body.devices) ? body.devices : []))
					.catch((err) => setError(String(err?.message ?? err)));
			};
			react.useEffect(load, [basePath]);
			const generate = () => {
				setError("");
				fetch(`${basePath}/api/devices`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ id: id.trim(), name: name.trim() })
				})
					.then(readJson)
					.then((body) => {
						if (body.token) {
							setIssued(body);
							setId("");
							setName("");
							load();
							return;
						}
						setError(body.error ?? "failed");
					})
					.catch((err) => setError(String(err?.message ?? err)));
			};
			const revoke = (target) => {
				fetch(`${basePath}/api/devices/revoke`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ id: target })
				})
					.then(() => load())
					.catch((err) => setError(String(err?.message ?? err)));
			};
			const inputStyle = {
				flex: "1 1 0",
				minWidth: 0,
				padding: "6px 8px",
				borderRadius: 6,
				border: "1px solid var(--dsw-alias-border-secondary)",
				background: "transparent",
				color: "inherit",
				font: "inherit"
			};
			const buttonStyle = {
				flex: "none",
				padding: "6px 12px",
				borderRadius: 6,
				border: "1px solid var(--dsw-alias-border-secondary)",
				background: "transparent",
				color: "inherit",
				cursor: "pointer",
				font: "inherit"
			};
			const button = (label, onClick, disabled, key) =>
				(0, react_jsx_runtime.jsx)("button", { type: "button", onClick, disabled, style: buttonStyle, children: label }, key);
			return (0, react_jsx_runtime.jsxs)(
				"div",
				{
					style: { margin: "10px 0 16px" },
					children: [
						(0, react_jsx_runtime.jsx)("div", { style: { fontWeight: 600, marginBottom: 2 }, children: t("devices") }),
						(0, react_jsx_runtime.jsx)("p", {
							style: { margin: "0 0 8px", fontSize: 12, opacity: 0.7 },
							children: t("devicesHint")
						}),
						devices === null
							? null
							: devices.length === 0
								? (0, react_jsx_runtime.jsx)("p", { style: { margin: "0 0 8px", fontSize: 12, opacity: 0.7 }, children: t("noDevices") })
								: (0, react_jsx_runtime.jsx)("div", {
										style: { margin: "0 0 8px" },
										children: devices.map((device) =>
											(0, react_jsx_runtime.jsxs)(
												"div",
												{
													style: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "3px 0" },
													children: [
														(0, react_jsx_runtime.jsx)("code", { children: device.id }),
														(0, react_jsx_runtime.jsx)("span", { style: { opacity: 0.7 }, children: device.name }),
														(0, react_jsx_runtime.jsx)("span", {
															style: { color: device.online ? "#2ecc71" : "inherit", opacity: device.online ? 1 : 0.6 },
															children: device.online ? t("online") : t("offline")
														}),
														(0, react_jsx_runtime.jsx)("span", {
															style: { opacity: 0.5, fontSize: 12 },
															children: device.lastSeen ? new Date(device.lastSeen).toLocaleString() : t("never")
														}),
														button(t("revoke"), () => revoke(device.id), false, `r-${device.id}`)
													]
												},
												device.id
											)
										)
									}),
						(0, react_jsx_runtime.jsxs)("div", {
							style: { display: "flex", gap: 8 },
							children: [
								(0, react_jsx_runtime.jsx)("input", {
									placeholder: t("deviceId"),
									value: id,
									onChange: (event) => setId(event.target.value),
									style: inputStyle
								}),
								(0, react_jsx_runtime.jsx)("input", {
									placeholder: t("deviceName"),
									value: name,
									onChange: (event) => setName(event.target.value),
									style: inputStyle
								}),
								button(t("generate"), generate, id.trim() === "", "gen"),
								button(t("refresh"), load, false, "reload")
							]
						}),
						issued
							? (0, react_jsx_runtime.jsxs)("div", {
									style: {
										marginTop: 10,
										padding: 10,
										borderRadius: 6,
										background: "var(--dsw-alias-bg-secondary, rgba(127,127,127,0.08))"
									},
									children: [
										(0, react_jsx_runtime.jsx)("p", {
											style: { margin: "0 0 6px", fontSize: 12 },
											children: t("tokenOnce").replace("%s", issued.id)
										}),
										(0, react_jsx_runtime.jsxs)("div", {
											style: { display: "flex", gap: 8, alignItems: "center" },
											children: [
												(0, react_jsx_runtime.jsx)("code", {
													style: {
														flex: "1 1 0",
														minWidth: 0,
														wordBreak: "break-all",
														fontSize: 12,
														padding: "6px 8px",
														border: "1px solid var(--dsw-alias-border-secondary)",
														borderRadius: 6
													},
													children: issued.token
												}),
												button(
													t("copy"),
													() => {
														navigator.clipboard?.writeText(issued.token);
													},
													false,
													"copy"
												)
											]
										})
									]
								})
							: null,
						error
							? (0, react_jsx_runtime.jsx)("p", { style: { margin: "6px 0 0", fontSize: 12, color: "#e74c3c" }, children: error })
							: null
					]
				},
				"devices"
			);
		}
		/**
		 * 按选中的半边渲染字段。
		 * @param t - 词典
		 * @param side - host 或 agent
		 * @param state - 表单快照
		 * @param props - 页面动作
		 */
		function sideFields(t, side, state, props) {
			const mode = state.mode?.value ?? "workspace";
			const rows = side === "agent" ? AGENT_FIELDS : HOST_FIELDS;
			const body = rows.map(([name, labelKey, hintKey, numeric]) =>
				name === "mode" ? modeControl(t, state, props) : field(t, state, props, name, labelKey, hintKey, numeric)
			);
			if (side === "agent" && mode !== "view") {
				body.push(field(t, state, props, "workspaceDirs", "workspaceDirs", "workspaceDirsHint", false));
			}
			const basePath = state.basePath?.value || "/desktop-bridge";
			return [
				...(side === "host" ? [(0, react_jsx_runtime.jsx)(DevicePanel, { t, basePath }, "devices")] : []),
				...body,
				...SHARED_FIELDS.map(([name, labelKey, hintKey, numeric]) =>
					field(t, state, props, name, labelKey, hintKey, numeric)
				)
			];
		}
		function BridgeCard(props) {
			const { t } = props;
			const state = props.useBridgeCard((snapshot) => snapshot);
			const [side, setSide] = react.useState(null);
			if (props.view === "summary") return t("summary");
			const current = side ?? (state.url?.value ? "agent" : "host");
			return (0, react_jsx_runtime.jsxs)(primitives.SettingsForm, {
				labels: formLabels(t),
				state,
				onSave: props.save,
				onDiscard: props.discard,
				children: [
					sideControl(t, current, setSide),
					(0, react_jsx_runtime.jsx)(StatusDot, { t, basePath: state.basePath?.value || "/desktop-bridge", side: current }, "status"),
					...sideFields(t, current, state, props)
				]
			});
		}
		/** 设置弹窗左侧导航里的整页版本。 */
		function BridgeSection(props) {
			const { t } = props;
			const state = props.useBridgeCard((snapshot) => snapshot);
			const [side, setSide] = react.useState(null);
			const current = side ?? (state.url?.value ? "agent" : "host");
			return (0, react_jsx_runtime.jsxs)(primitives.SettingsForm, {
				labels: formLabels(t),
				state,
				onSave: props.save,
				onDiscard: props.discard,
				children: [
					sideControl(t, current, setSide),
					(0, react_jsx_runtime.jsx)(StatusDot, { t, basePath: state.basePath?.value || "/desktop-bridge", side: current }, "status"),
					...sideFields(t, current, state, props)
				]
			});
		}
		/** 页面背后的表单模型：领域字段 + 壳状态。 */
		class CardController {
			constructor(scope, descriptors, names) {
				this.names = names;
				this.form = new primitives.SettingsFormModel(scope, descriptors);
				this.store = this.form.bind(() => this.projection());
			}
			projection() {
				const out = { ...this.form.shell() };
				for (const name of this.names) out[name] = this.form.field(name);
				return out;
			}
			inject() {
				return {
					hooks: { bridgeCard: this.store },
					...this.form.actions()
				};
			}
			dispose() {
				this.form.dispose();
			}
		}
		const inject = ["slots", "locale", "configForms"];
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "desktop-bridge: dictionaries");
			let controller;
			ctx.effect(
				() =>
					ctx.configForms.whileServed([NS_CONFIG], () => {
						if (controller === undefined) {
							controller = new CardController(
								ctx.configForms.get(NS_CONFIG),
								ALL_FIELDS.map(([name, , , numeric]) =>
									numeric ? primitives.settingsNumberField(name) : primitives.settingsTextField(name)
								),
								ALL_FIELDS.map(([name]) => name)
							);
						}
						const offCard = ctx.slots.inject("plugins.item", () =>
							ctx.slots.register(
								{
									name: "plugins.item",
									id: "dsh-desktop-bridge",
									order: 40,
									label: () => t("title"),
									locale: NS,
									inject: () => controller.inject()
								},
								BridgeCard
							)
						);
						const offSection = ctx.slots.inject("settings.section", () =>
							ctx.slots.register(
								{
									name: "settings.section",
									id: "dsh-desktop-bridge",
									order: 100,
									label: () => t("title"),
									locale: NS,
									inject: () => controller.inject()
								},
								BridgeSection
							)
						);
						return () => {
							offCard();
							offSection();
						};
					}),
				"desktop-bridge: settings card"
			);
			ctx.effect(
				() => () => {
					controller?.dispose();
				},
				"desktop-bridge: form subscription"
			);
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
