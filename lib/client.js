window.__ModuleLoader__.load({
	id: "dsh-desktop-bridge",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		/** 两个半边各自的设置命名空间（= profile 里那个插件的 id）。 */
		const NS_HOST = "desktop-bridge";
		const NS_AGENT = "desktop-bridge-agent";
		/** 词典命名空间。 */
		const NS = "desktop-bridge.settings";
		const en = {
			hostTitle: "Desktop bridge (server)",
			agentTitle: "Desktop bridge (this computer)",
			hostSummary: "Reverse tunnel from this computer to the server, per-call approval included.",
			agentSummary: "What this computer lets the remote agent read, change and run.",
			description: "Connection, timeout and permission settings of the desktop bridge.",
			host: "Listen address",
			hostHint: "Keep it on 127.0.0.1 and let the reverse proxy expose the tunnel endpoint.",
			port: "Listen port",
			basePath: "Reverse-proxy path",
			dataDir: "Data directory",
			dataDirHint: "Device tokens (hashed) and the audit log live here.",
			approvalTimeoutMs: "Approval timeout (ms)",
			approvalTimeoutMsHint: "How long the server waits for this computer to answer before refusing.",
			url: "Server URL",
			urlHint: "The tunnel endpoint, for example wss://dsh.mcii.cc/desktop-bridge/agent.",
			token: "Device token",
			tokenHint: "Generated on the server; the only credential this computer presents.",
			device: "Device id",
			deviceHint: "Must match the id the token was issued for.",
			mode: "Permission level",
			modeHint: "view = read only · workspace = read and write inside the workspace · full = anywhere but system directories.",
			reconnectMs: "Reconnect interval (ms)",
			reconnectMsHint: "Wait before dialling again after the connection drops.",
			rootsSection: "Workspace folders, command prefixes and build presets are edited in this plugin's config entry (cordis.patch.yml).",
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
			hostTitle: "桌面桥（服务端）",
			agentTitle: "桌面桥（这台电脑）",
			hostSummary: "这台电脑到服务器的反向隧道，每次调用都要主人确认。",
			agentSummary: "这台电脑允许远端 Agent 读什么、改什么、跑什么。",
			description: "桌面桥的连接、超时与权限设置。",
			host: "监听地址",
			hostHint: "保持 127.0.0.1，对外交给反向代理。",
			port: "监听端口",
			basePath: "反代路径",
			dataDir: "数据目录",
			dataDirHint: "设备令牌（只存哈希）和审计日志放在这里。",
			approvalTimeoutMs: "审批超时（毫秒）",
			approvalTimeoutMsHint: "服务端等这台电脑回话的最长时间，到点按拒绝处理。",
			url: "服务器地址",
			urlHint: "隧道入口，例如 wss://dsh.mcii.cc/desktop-bridge/agent。",
			token: "设备令牌",
			tokenHint: "在服务端生成，这台电脑唯一出示的凭据。",
			device: "设备 id",
			deviceHint: "必须和令牌签发时登记的 id 一致。",
			mode: "权限档位",
			modeHint: "view 只能看 · workspace 工作区内可改 · full 走全盘但挡系统目录。",
			reconnectMs: "重连间隔（毫秒）",
			reconnectMsHint: "断线后隔多久再拨一次。",
			rootsSection: "工作区目录、命令前缀和构建工程在插件的配置项里改（cordis.patch.yml）。",
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
		function note(text) {
			return (0, react_jsx_runtime.jsx)("p", { style: { margin: "4px 0 0", fontSize: 12, opacity: 0.7 }, children: text }, text);
		}
		function HostCard(props) {
			const { t } = props;
			const state = props.useBridgeHostCard((snapshot) => snapshot);
			if (props.view === "summary") return t("hostSummary");
			return (0, react_jsx_runtime.jsxs)(primitives.SettingsForm, {
				labels: formLabels(t),
				state,
				onSave: props.save,
				onDiscard: props.discard,
				children: [
					field(t, state, props, "host", "host", "hostHint", false),
					field(t, state, props, "port", "port", "port", true),
					field(t, state, props, "basePath", "basePath", "basePath", false),
					field(t, state, props, "dataDir", "dataDir", "dataDirHint", false),
					field(t, state, props, "approvalTimeoutMs", "approvalTimeoutMs", "approvalTimeoutMsHint", true)
				]
			});
		}
		function AgentCard(props) {
			const { t } = props;
			const state = props.useBridgeAgentCard((snapshot) => snapshot);
			if (props.view === "summary") return t("agentSummary");
			return (0, react_jsx_runtime.jsxs)(primitives.SettingsForm, {
				labels: formLabels(t),
				state,
				onSave: props.save,
				onDiscard: props.discard,
				children: [
					field(t, state, props, "url", "url", "urlHint", false),
					field(t, state, props, "token", "token", "tokenHint", false),
					field(t, state, props, "device", "device", "deviceHint", false),
					field(t, state, props, "mode", "mode", "modeHint", false),
					field(t, state, props, "approvalTimeoutMs", "approvalTimeoutMs", "approvalTimeoutMsHint", true),
					field(t, state, props, "reconnectMs", "reconnectMs", "reconnectMsHint", true),
					note(t("rootsSection"))
				]
			});
		}
		/** 一张卡背后的表单模型：领域字段 + 壳状态。 */
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
			inject(hook) {
				return {
					hooks: { [hook]: this.store },
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
			const cards = [];
			const card = (scope, descriptors, names, hook, id, order, labelKey, Component) => {
				const controller = new CardController(scope, descriptors, names);
				cards.push(controller);
				return () =>
					ctx.slots.inject("plugins.item", () =>
						ctx.slots.register(
							{
								name: "plugins.item",
								id,
								order,
								label: () => t(labelKey),
								locale: NS,
								inject: () => controller.inject(hook)
							},
							Component
						)
					);
			};
			ctx.effect(
				() =>
					ctx.configForms.whileServed([NS_HOST], () =>
						card(
							ctx.configForms.get(NS_HOST),
							[
								primitives.settingsTextField("host"),
								primitives.settingsNumberField("port"),
								primitives.settingsTextField("basePath"),
								primitives.settingsTextField("dataDir"),
								primitives.settingsNumberField("approvalTimeoutMs")
							],
							["host", "port", "basePath", "dataDir", "approvalTimeoutMs"],
							"bridgeHostCard",
							"dsh-desktop-bridge-host",
							40,
							"hostTitle",
							HostCard
						)()
					),
				"desktop-bridge: host card"
			);
			ctx.effect(
				() =>
					ctx.configForms.whileServed([NS_AGENT], () =>
						card(
							ctx.configForms.get(NS_AGENT),
							[
								primitives.settingsTextField("url"),
								primitives.settingsTextField("token"),
								primitives.settingsTextField("device"),
								primitives.settingsTextField("mode"),
								primitives.settingsNumberField("approvalTimeoutMs"),
								primitives.settingsNumberField("reconnectMs")
							],
							["url", "token", "device", "mode", "approvalTimeoutMs", "reconnectMs"],
							"bridgeAgentCard",
							"dsh-desktop-bridge-agent",
							41,
							"agentTitle",
							AgentCard
						)()
					),
				"desktop-bridge: agent card"
			);
			ctx.effect(
				() => () => {
					for (const controller of cards) controller.dispose();
				},
				"desktop-bridge: form subscriptions"
			);
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
