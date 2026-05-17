import { Command } from "commander";

export function createProgram(): Command {
  const program = new Command()
    .name("floweb")
    .description("浏览器自动化 RPA 工具")
    .version("0.1.0")
    .option("-s, --session <name>", "target session name", "default")
    .option("--socket-path <path>", "override daemon socket path")
    .option("--headless", "run browser in headless mode")
    .option("--provider <name>", "LLM provider override")
    .option("--browser-type <type>", "chromium | firefox | webkit")
    .option("--config <json>", "config JSON override");

  // ── session 管理 ──
  const sessionCmd = program
    .command("session")
    .description("session 生命周期管理");

  sessionCmd
    .command("start <name> [url]")
    .description("创建命名 session，可选初始 URL");
  sessionCmd
    .command("stop <name>")
    .description("关闭 session（close + shutdown + 清理 socket）");
  sessionCmd
    .command("list")
    .description("列出所有运行中的 session");
  sessionCmd
    .command("status")
    .description("查看当前 session 状态（JSON）");

  // ── Navigation ──
  program
    .command("navigate <url>")
    .description("打开 URL（自动补全 https://）");
  program.command("back").description("浏览器后退");
  program.command("forward").description("浏览器前进");
  program.command("reload").description("刷新当前页面");

  // ── Page State ──
  program.command("snapshot").description("抓取页面 AX tree 快照");
  program.command("snapshot-diff").description("对比前后快照变化");
  program.command("pages").description("列出所有标签页");

  // ── Interaction ──
  program
    .command("click <selector>")
    .description("点击元素");
  program
    .command("type <selector> <text>")
    .description("向输入框输入文本");
  program
    .command("press <key>")
    .description("按键（Enter、Escape、Tab 等）");
  program
    .command("hover <selector>")
    .description("鼠标悬停在元素上");
  program
    .command("scroll <x> <y>")
    .description("滚动页面（x/y 像素偏移）");
  program
    .command("select <selector> <value>")
    .description("选择下拉框选项");
  program
    .command("wait [arg]")
    .description("等待毫秒数或 CSS 选择器出现")
    .option("--ms <n>", "等待毫秒数", parseInt)
    .option("--selector <css>", "等待此 CSS 选择器出现");

  // ── Visual Feedback ──
  program
    .command("move-cursor <x> <y>")
    .description("移动可视化光标到像素坐标");
  program
    .command("highlight <selector>")
    .description("在元素上显示高亮框");

  // ── Tab Management ──
  program
    .command("switch-tab <pageId>")
    .description("切换到指定标签页");
  program
    .command("close-tab <pageId>")
    .description("关闭指定标签页");
  program
    .command("close-session")
    .description("关闭浏览器会话（保留 daemon）");

  // ── Execution ──
  program
    .command("evaluate <code...>")
    .description("执行 JavaScript 并返回 JSON 结果");
  program
    .command("exec [code...]")
    .description("在浏览器 REPL 中执行 TypeScript/JS（已注入 page/browser/context）")
    .option("--timeout <ms>", "IPC 请求超时毫秒数", parseInt, 120000);

  // ── Network & Auth ──
  program
    .command("intercept [timeout]")
    .description("被动拦截网络请求，等待指定秒数后返回结果");
  program
    .command("load-profile <domain>")
    .description("加载已保存的认证 Profile（cookies + localStorage）");
  program
    .command("save-profile <domain>")
    .description("保存当前登录态供后续复用");

  // ── Utilities ──
  program.command("screenshot").description("截取当前页面 PNG（base64）");
  program.command("compact-html").description("获取压缩 HTML（节省 70-90% token）");
  program.command("audit").description("审计站点反爬策略");
  program
    .command("observe <on|off>")
    .description("进入/退出观察模式");

  // ── 便捷命令 ──
  program
    .command("open <url>")
    .description("打开 URL（同 navigate）");
  program
    .command("close")
    .description("关闭浏览器会话（同 close-session）");
  program
    .command("tui [sessionName]")
    .description("启动 TUI 终端界面");
  program
    .command("mcp")
    .description("启动 MCP 服务器（stdin/stdout JSON-RPC）");
  program
    .command("run <file>")
    .description("通过 FLOWEB_SOCKET 运行脚本");
  program
    .command("setup [target]")
    .description("安装 skills 到 Agent 配置目录（claude/codex/opencode）");
  program
    .command("daemon")
    .description("（内部使用）启动守护进程");

  return program;
}
