import { useCallback } from "react";
import type { DaemonClient } from "../../daemon/ipc/client.js";
import type { ChatMessage } from "./use-browser-state.js";
import type { AgentHook } from "./use-agent.js";

export function createCommandExecutor(
  clientRef: React.RefObject<DaemonClient | null>,
  setMessage: (m: string) => void,
  addMessage: (msg: Omit<ChatMessage, "timestamp">) => void,
  agentRef?: React.RefObject<AgentHook | null>,
) {
  return useCallback(
    (trimmed: string) => {
      if (trimmed === "") return;

      // Slash commands route to agent
      if (trimmed.startsWith("/")) {
        const spaceIndex = trimmed.indexOf(" ");
        const slashCmd = spaceIndex >= 0 ? trimmed.slice(0, spaceIndex) : trimmed;
        const slashArgs = spaceIndex >= 0 ? trimmed.slice(spaceIndex + 1) : "";

        switch (slashCmd) {
          case "/mode":
            if (slashArgs === "observation" || slashArgs === "dialogue") {
              agentRef?.current?.setMode(slashArgs);
              setMessage(`Mode: ${slashArgs}`);
            } else {
              setMessage("Usage: /mode [dialogue|observation]");
            }
            return;

          case "/skills":
            if (agentRef?.current) {
              const names = agentRef.current.state.loadedSkills;
              setMessage(names.length > 0 ? `Skills: ${names.join(", ")}` : "No skills loaded.");
            } else {
              setMessage("Agent not ready.");
            }
            return;

          case "/tools":
            if (agentRef?.current) {
              const names = agentRef.current.state.availableTools;
              setMessage(names.length > 0 ? `Tools: ${names.join(", ")}` : "No tools available.");
            } else {
              setMessage("Agent not ready.");
            }
            return;

          case "/spec":
          case "/implement":
          case "/review": {
            const agent = agentRef?.current;
            if (!agent) {
              setMessage("Agent not ready. Wait for agent to initialize.");
              return;
            }
            if (slashArgs) {
              addMessage({
                role: "user",
                content: `Load skill "${slashCmd.slice(1)}" and ${
                  slashCmd === "/spec"
                    ? "generate a spec"
                    : slashCmd === "/implement"
                      ? "implement the spec"
                      : "review the spec"
                }: ${slashArgs}`,
              });
            } else {
              addMessage({
                role: "user",
                content: `Load and describe the "${slashCmd.slice(1)}" skill`,
              });
            }
            return;
          }

          case "/help":
            setMessage(
              "/spec <task> | /implement <spec> | /review <spec> | /skills | /tools | /mode <dialogue|observation> | /help",
            );
            return;

          default:
            setMessage(`Unknown slash command: ${slashCmd}. Use /help for list.`);
            return;
        }
      }

      const client = clientRef.current;
      if (!client) {
        setMessage("Not connected to daemon");
        return;
      }

      // parse first word as command, rest as args
      const spaceIndex = trimmed.indexOf(" ");
      const cmd = spaceIndex >= 0 ? trimmed.slice(0, spaceIndex) : trimmed;
      const args = spaceIndex >= 0 ? trimmed.slice(spaceIndex + 1) : "";

      switch (cmd) {
        case "open":
          if (!args) {
            setMessage("Usage: open <url>");
            return;
          }
          setMessage(`Opening ${args}...`);
          client.remote.createSession(args).catch((err: unknown) => {
            setMessage(`Error opening page: ${String(err)}`);
          });
          break;

        case "pages":
        case "ls": {
          client.remote
            .getPages()
            .then((pages) => {
              if (pages.length === 0) {
                setMessage("No pages open");
              } else {
                const list = pages
                  .map((p) => `${p.id}: ${p.url}${p.active ? " (active)" : ""}`)
                  .join(" | ");
                setMessage(`Pages (${pages.length}): ${list}`);
              }
            })
            .catch((err: unknown) => {
              setMessage(`Error listing pages: ${String(err)}`);
            });
          break;
        }

        case "snapshot": {
          client.remote
            .getPages()
            .then((snapPages) => {
              if (snapPages.length === 0) {
                setMessage("No pages open");
              } else {
                setMessage(JSON.stringify(snapPages, null, 2));
              }
            })
            .catch((err: unknown) => {
              setMessage(`Error getting snapshot: ${String(err)}`);
            });
          break;
        }

        case "close":
          client.remote.closeSession().catch((err: unknown) => {
            setMessage(`Error closing session: ${String(err)}`);
          });
          break;

        case "session":
        case "s": {
          const sessionSubCmd =
            args.indexOf(" ") >= 0 ? args.slice(0, args.indexOf(" ")) : args;
          const sessionSubArgs =
            args.indexOf(" ") >= 0 ? args.slice(args.indexOf(" ") + 1) : "";

          switch (sessionSubCmd) {
            case "current":
            case "": {
              client.remote
                .getSessionName()
                .then((name) => {
                  setMessage(`Current session: ${name}`);
                })
                .catch((err: unknown) => {
                  setMessage(`Error getting session name: ${String(err)}`);
                });
              break;
            }

            case "list":
            case "ls": {
              client.remote
                .listSessions()
                .then((names) => {
                  if (names.length === 0) {
                    setMessage("No sessions found");
                  } else {
                    setMessage(`Sessions: ${names.join(", ")}`);
                  }
                })
                .catch((err: unknown) => {
                  setMessage(`Error listing sessions: ${String(err)}`);
                });
              break;
            }

            case "new":
            case "create": {
              if (!sessionSubArgs) {
                setMessage("Usage: session new <name>");
                return;
              }
              setMessage(
                `To start session "${sessionSubArgs}", run: flowweb tui ${sessionSubArgs}`,
              );
              break;
            }

            case "delete":
            case "rm":
            case "remove": {
              if (!sessionSubArgs) {
                setMessage("Usage: session delete <name>");
                return;
              }
              client.remote
                .deleteSession(sessionSubArgs)
                .then(() => {
                  setMessage(`Session "${sessionSubArgs}" deleted`);
                })
                .catch((err: unknown) => {
                  setMessage(`Error deleting session: ${String(err)}`);
                });
              break;
            }

            default:
              setMessage(
                `Unknown session command: ${sessionSubCmd}. Use: current | list | new <name> | delete <name>`,
              );
          }
          break;
        }

        case "help":
        case "?":
          setMessage(
            "Built-in: open <url> | pages/ls | snapshot | close | session <list|current|new|delete>\n" +
              "Agent: /spec <task> | /implement <spec> | /review <spec> | /skills | /tools | /mode <dialogue|observation>\n" +
              "Other: help/? | quit/exit/q | Ctrl+T (toggle mode)",
          );
          break;

        case "quit":
        case "exit":
        case "q":
          process.exit(0);
          break;

        default: {
          // In dialogue mode, route to agent
          const agent = agentRef?.current;
          if (agent && agent.isReady()) {
            addMessage({ role: "user", content: trimmed });
            setMessage("Agent thinking...");
            addMessage({ role: "agent", content: "..." });
            agent
              .send(trimmed)
              .then((response) => {
                setMessage(response.slice(0, 80));
                addMessage({ role: "agent", content: response });
              })
              .catch((err: unknown) => {
                setMessage(`Agent error: ${String(err)}`);
                addMessage({ role: "system", content: `Agent error: ${String(err)}` });
              });
            return;
          }
          setMessage(`Unknown command: ${cmd}`);
        }
      }
    },
    [clientRef, setMessage, addMessage, agentRef],
  );
}
