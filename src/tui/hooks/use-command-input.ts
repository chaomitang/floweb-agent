import { useCallback } from "react";
import type { DaemonClient } from "@/daemon/ipc/client.js";
import type { ChatMessage } from "./use-browser-state.js";
import type { AgentHook } from "./use-agent.js";

/**
 * Returns a command executor function.
 *
 * Return values:
 *   - `null`  → fully handled by the executor (caller does nothing)
 *   - `string` → the content that should be sent to the agent
 *                (caller adds the user message and streams to agent)
 */
export function createCommandExecutor(
  clientRef: React.RefObject<DaemonClient | null>,
  setMessage: (m: string) => void,
  addMessage: (msg: Omit<ChatMessage, "timestamp">) => void,
  agentRef?: React.RefObject<AgentHook | null>,
  onClear?: () => void,
  onModeChange?: (observing: boolean) => void,
) {
  return useCallback(
    (input: string): string | null => {
      if (input === "") return null;

      const say = (content: string) => {
        setMessage(content.slice(0, 80));
        addMessage({ role: "system", content });
      };

      // Not a slash command → route to agent
      if (!input.startsWith("/")) {
        return input;
      }

      const spaceIdx = input.indexOf(" ");
      const cmd = spaceIdx >= 0 ? input.slice(0, spaceIdx) : input;
      const args = spaceIdx >= 0 ? input.slice(spaceIdx + 1) : "";

      const client = clientRef.current;

      switch (cmd) {
        // ── Browser ──
        case "/open": {
          if (!args) { say("Usage: /open <url>"); return null; }
          if (!client) { say("Not connected to daemon"); return null; }
          const normalized = args.includes("://") ? args : `https://${args}`;
          say(`Opening ${normalized}...`);
          client.remote.createSession(normalized).catch((err: unknown) => {
            say(`Error opening page: ${String(err)}`);
          });
          return null;
        }

        case "/pages": {
          if (!client) { say("Not connected to daemon"); return null; }
          client.remote.getPages().then((pages) => {
            if (pages.length === 0) { say("No pages open"); }
            else {
              say(pages.map((p) =>
                `${p.id}: ${p.url}${p.active ? " (active)" : ""}`).join(" | "));
            }
          }).catch((err: unknown) => { say(`Error: ${String(err)}`); });
          return null;
        }

        case "/snapshot": {
          if (!client) { say("Not connected to daemon"); return null; }
          client.remote.getPages().then((pages) => {
            if (pages.length === 0) { say("No pages open"); }
            else { say(JSON.stringify(pages, null, 2)); }
          }).catch((err: unknown) => { say(`Error: ${String(err)}`); });
          return null;
        }

        case "/close": {
          if (!client) { say("Not connected to daemon"); return null; }
          client.remote.closeSession().catch((err: unknown) => {
            say(`Error: ${String(err)}`);
          });
          return null;
        }

        // ── Session ──
        case "/session": {
          if (!client) { say("Not connected to daemon"); return null; }
          const subSpace = args.indexOf(" ");
          const sub = subSpace >= 0 ? args.slice(0, subSpace) : args;
          const subArgs = subSpace >= 0 ? args.slice(subSpace + 1) : "";

          switch (sub) {
            case "": case "current":
              client.remote.getSessionName().then((n) => say(`Current session: ${n}`))
                .catch((e: unknown) => say(`Error: ${String(e)}`));
              return null;
            case "list": case "ls":
              client.remote.listSessions().then((names) =>
                say(names.length ? `Sessions: ${names.join(", ")}` : "No sessions"))
                .catch((e: unknown) => say(`Error: ${String(e)}`));
              return null;
            case "new": case "create":
              if (!subArgs) { say("Usage: /session new <name>"); return null; }
              say(`To start: floweb tui ${subArgs}`);
              return null;
            case "delete": case "rm":
              if (!subArgs) { say("Usage: /session delete <name>"); return null; }
              client.remote.deleteSession(subArgs).then(() => say(`Session "${subArgs}" deleted`))
                .catch((e: unknown) => say(`Error: ${String(e)}`));
              return null;
            default:
              say("/session [current|list|new <name>|delete <name>]");
              return null;
          }
        }

        // ── Agent ──
        case "/mode": {
          if (args === "observation" || args === "observe") {
            onModeChange?.(true);
            return "请开始观察我操作浏览器，看到变化就给我反馈";
          }
          onModeChange?.(false);
          return "请停止观察模式，回到正常对话";
        }

        case "/skills": {
          const skills = agentRef?.current?.state.loadedSkills;
          if (!skills?.length) { say("No skills loaded."); return null; }
          const lines: string[] = ["| 技能 | 描述 |", "|------|------|"];
          for (const s of skills) {
            lines.push(`| ${s.name} | ${s.description} |`);
          }
          addMessage({ role: "system", content: `\n${lines.join("\n")}\n` });
          setMessage(`${skills.length} skills loaded`);
          return null;
        }

        case "/tools": {
          const tools = agentRef?.current?.state.availableTools;
          if (!tools?.length) { say("No tools available."); return null; }

          const browserTools = tools.filter((t) => t.name.startsWith("browser_"));
          const specTools = tools.filter((t) => t.name.startsWith("spec_"));
          const skillTools = tools.filter((t) => t.name.startsWith("skill_"));

          // Logical groupings within browser tools
          const browserSections: Array<{ title: string; tools: string[] }> = [
            { title: "Navigation", tools: ["browser_navigate", "browser_back", "browser_forward", "browser_reload"] },
            { title: "Page State", tools: ["browser_snapshot", "browser_snapshot_diff", "browser_list_pages"] },
            { title: "Interaction", tools: ["browser_click", "browser_type", "browser_press", "browser_hover", "browser_scroll", "browser_select", "browser_wait"] },
            { title: "Tab Management", tools: ["browser_switch_tab", "browser_close_tab", "browser_close_session"] },
            { title: "Execution", tools: ["browser_evaluate", "browser_exec"] },
            { title: "Network & Auth", tools: ["browser_intercept", "browser_load_profile", "browser_save_profile"] },
            { title: "Utilities", tools: ["browser_audit", "browser_screenshot", "browser_set_observing"] },
          ];

          const short: Record<string, string> = {
            // ── Navigation ──
            browser_navigate: "导航到 URL，自动补全 https://，支持 about:blank",
            browser_back: "浏览器后退",
            browser_forward: "浏览器前进",
            browser_reload: "刷新当前页面",
            // ── Page State ──
            browser_snapshot: "捕获无障碍树快照，展示可交互元素及 [ref] 标记",
            browser_snapshot_diff: "对比前后快照，显示 +新增/-删除/~修改",
            browser_list_pages: "列出所有标签页及其标题和 URL",
            // ── Interaction ──
            browser_click: "点击元素，需 CSS 选择器",
            browser_type: "在输入框中输入文本，需 CSS 选择器",
            browser_press: "按下键盘按键（Enter、Esc、Tab 等）",
            browser_hover: "鼠标悬停在元素上",
            browser_scroll: "滚动页面（x/y 像素）",
            browser_select: "选择下拉框选项",
            browser_wait: "等待毫秒数或元素出现",
            // ── Tab Management ──
            browser_switch_tab: "通过页面 ID 切换到指定标签页",
            browser_close_tab: "通过页面 ID 关闭指定标签页",
            browser_close_session: "关闭整个浏览器会话",
            // ── Execution ──
            browser_evaluate: "在页面执行 JS 并返回 JSON 结果",
            browser_exec: "在共享浏览器 REPL 中执行代码，已注入 page/browser/context",
            // ── Network & Auth ──
            browser_intercept: "被动拦截网络请求，捕获 HTTP 响应数据",
            browser_load_profile: "加载已保存的认证 Profile（cookies + localStorage）",
            browser_save_profile: "保存当前登录态（cookies + localStorage）",
            // ── Utilities ──
            browser_audit: "审计站点反爬策略（反爬服务/fetch 拦截/webdriver 指纹/验证码）",
            browser_screenshot: "截取当前页面 PNG 截图",
            browser_set_observing: "切换观察模式",
            // ── Spec ──
            spec_create: "在 specs 目录创建新的 spec 文档",
            spec_read: "读取 spec 文档完整内容",
            spec_update: "更新已有 spec 文档",
            spec_list: "列出所有 spec 文档",
            spec_mark_phase_complete: "标记 spec 阶段的任务为已完成",
            // ── Skill ──
            skill_list: "列出所有已加载的技能",
            skill_describe: "按名称获取技能的完整内容",
          };

          const makeTable = (title: string, items: typeof tools) => {
            const rows: string[] = [
              `## ${title} (${items.length})`,
              "",
              "| 工具 | 描述 |",
              "|------|------|",
            ];
            for (const t of items) {
              rows.push(`| ${t.name} | ${short[t.name] ?? t.description} |`);
            }
            return rows.join("\n");
          };

          const sections: string[] = [];
          for (const sec of browserSections) {
            const items = browserTools.filter((t) => sec.tools.includes(t.name));
            if (items.length) sections.push(makeTable(sec.title, items));
          }
          if (specTools.length) sections.push(makeTable("Spec", specTools));
          if (skillTools.length) sections.push(makeTable("Skill", skillTools));

          addMessage({ role: "system", content: `\n${sections.join("\n\n")}\n` });
          setMessage(`${tools.length} tools available`);
          return null;
        }

        case "/spec":
          return args
            ? `为以下任务生成 Spec：${args}`
            : "请描述你想生成 Spec 的任务";
        case "/implement":
          return args
            ? `按 Spec 实现：${args}`
            : "请指定要实现的 Spec 名称";
        case "/review":
          return args
            ? `审查这个 Spec：${args}`
            : "请指定要审查的 Spec 名称";

        // ── Clear & Reset ──
        case "/clear":
        case "/reset": {
          if (client) {
            client.remote.resetSessionData()
              .then(() => client.remote.closeSession())
              .then(() => {
                onClear?.();
                setMessage("Session reset.");
              }).catch(() => {
                onClear?.();
                setMessage("Session reset (daemon not connected).");
              });
          } else {
            onClear?.();
            setMessage("Session reset.");
          }
          return null;
        }

        // ── Help & Quit ──
        case "/help": {
          say(
            "/open <url> | /pages | /snapshot | /close | /clear | /exec <code>\n" +
            "/session [current|list|new|delete]\n" +
            "/mode <dialogue|observation> | /skills | /tools\n" +
            "/spec <task> | /implement <spec> | /review <spec>\n" +
            "/help | /quit",
          );
          return null;
        }

        case "/quit": case "/exit": case "/q":
          process.exit(0);
          /* eslint-disable-next-line no-fallthrough */
          break;

        default: {
          // Unknown slash command → send to agent as-is
          return input;
        }
      }
    },
    [clientRef, setMessage, addMessage, agentRef, onClear, onModeChange],
  );
}
