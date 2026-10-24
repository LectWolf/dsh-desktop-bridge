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
		/** 两边共用。 */
		const SHARED_FIELDS = [["approvalTimeoutMs", "approvalTimeoutMs", "approvalTimeoutMsHint", true]];
		const ALL_FIELDS = [...AGENT_FIELDS, ...HOST_FIELDS, ...SHARED_FIELDS];
		const en = {
			title: "Desktop bridge",
			summary: "Reverse tunnel between this computer and the server; every call needs the owner's approval.",
			pageIntro: "One plugin, two sides. Pick a side to see only the settings it uses.",
			side: "This computer is",
			sideHost: "Server",
			sideAgent: "Client",
			sideHostHint: "Server side: listens on a loopback port and exposes the desktop_* tools to the model.",
			sideAgentHint: "Client side: dials the server, executes the calls and asks you first.",
			intro: "Fill the server URL and device token on the client side; leave them empty on the server side.",
			url: "Server URL",
			urlHint: "The tunnel endpoint, for example wss://dsh.mcii.cc/desktop-bridge/agent. Filled in = this computer acts as the client.",
			token: "Device token",
			tokenHint: "Issued on the server; the only credential this computer presents.",
			device: "Device id",
			deviceHint: "Must match the id the token was issued for.",
			mode: "Permission level",
			modeHint: "view = read only · workspace = read and write inside the workspace · full = anywhere but system directories.",
			modeView: "View",
			modeWorkspace: "Workspace",
			modeFull: "Full",
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
			rootsNote: "Workspace folders, command prefixes and build presets are arrays and tables — edit them in the profile's cordis.patch.yml.",
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
			summary: "这台电脑和服务器之间的反向隧道，每次调用都要主人确认。",
			pageIntro: "一个插件两半边，选一边就只显示那一边要填的设置。",
			side: "这台电脑是",
			sideHost: "服务端",
			sideAgent: "客户端",
			sideHostHint: "服务端：在回环口上监听，把 desktop_* 工具交给模型。",
			sideAgentHint: "客户端：连服务器、执行调用，且每次先问你。",
			intro: "桌面端填服务器地址和设备令牌；服务端留空即可。",
			url: "服务器地址",
			urlHint: "隧道入口，例如 wss://dsh.mcii.cc/desktop-bridge/agent。填了这台机器就按客户端跑。",
			token: "设备令牌",
			tokenHint: "在服务端生成，这台电脑唯一出示的凭据。",
			device: "设备 id",
			deviceHint: "必须和令牌签发时登记的 id 一致。",
			mode: "权限档位",
			modeHint: "view 只能看 · workspace 工作区内可改 · full 走全盘但挡系统目录。",
			modeView: "只看",
			modeWorkspace: "工作区",
			modeFull: "全盘",
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
			approvalTimeoutMsHint: "服务端等这台电脑回话的最长时间，到点按拒绝处理。",
			rootsNote: "工作区目录、命令前缀和构建工程是数组与表，写在 profile 的 cordis.patch.yml 里，卡片不碰。",
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
		 * @param t - 本页词典读取器
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
			return (0, react_jsx_runtime.jsxs)(
				"div",
				{
					style: { margin: "0 0 8px" },
					children: [
						(0, react_jsx_runtime.jsx)(primitives.SegmentedControl, {
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
						}),
						(0, react_jsx_runtime.jsx)("p", {
							style: { margin: "4px 0 0", fontSize: 12, opacity: 0.7 },
							children: t(side === "agent" ? "sideAgentHint" : "sideHostHint")
						})
					]
				},
				"side"
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
			const rows = side === "agent" ? AGENT_FIELDS : HOST_FIELDS;
			return [
				...rows.map(([name, labelKey, hintKey, numeric]) =>
					name === "mode"
						? modeControl(t, state, props)
						: field(t, state, props, name, labelKey, hintKey, numeric)
				),
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
				children: [sideControl(t, current, setSide), ...sideFields(t, current, state, props)]
			});
		}
		/** 设置弹窗左侧导航里的整页版本。 */
		function BridgeSection(props) {
			const { t } = props;
			const state = props.useBridgeCard((snapshot) => snapshot);
			const [side, setSide] = react.useState(null);
			const current = side ?? (state.url?.value ? "agent" : "host");
			return (0, react_jsx_runtime.jsxs)("div", {
				children: [
					(0, react_jsx_runtime.jsx)("h2", {
						style: { margin: "0 0 4px", fontSize: 18 },
						children: t("title")
					}),
					(0, react_jsx_runtime.jsx)("p", {
						style: { margin: "0 0 12px", fontSize: 12, opacity: 0.7 },
						children: t("pageIntro")
					}),
					(0, react_jsx_runtime.jsxs)(primitives.SettingsForm, {
						labels: formLabels(t),
						state,
						onSave: props.save,
						onDiscard: props.discard,
						children: [
							sideControl(t, current, setSide),
							...sideFields(t, current, state, props),
							(0, react_jsx_runtime.jsx)(
								"p",
								{ style: { margin: "4px 0 0", fontSize: 12, opacity: 0.7 }, children: t("rootsNote") },
								"rootsNote"
							)
						]
					})
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
