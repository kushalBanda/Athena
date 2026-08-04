import { ReadFileTool } from "../src/impl/read-file.js";
import { WriteFileTool } from "../src/impl/write-file.js";
import { ListDirectoryTool } from "../src/impl/list-directory.js";
import { GrepTool } from "../src/impl/grep.js";
import { FindTool } from "../src/impl/find.js";
import { ShellExecTool } from "../src/impl/shell-exec.js";
import { WebFetchTool } from "../src/impl/web-fetch.js";
import { WebSearchTool } from "../src/impl/web-search.js";
import type { ToolContext } from "../src/types.js";

const pkgRoot = new URL("..", import.meta.url).pathname;
const ctx: ToolContext = { workingDir: pkgRoot };

async function run(label: string, tool: { execute: Function }, input: unknown) {
  const result = await tool.execute(input, ctx);
  const preview = result.content.slice(0, 200).replace(/\n/g, "\\n");
  console.log(`[${result.isError ? "ERR" : "OK"}] ${label}: ${preview}`);
}

// write then read back
await run("write_file", new WriteFileTool(), { path: "/tmp/athena-smoke.txt", content: "hello from athena" });
await run("read_file", new ReadFileTool(), { path: "/tmp/athena-smoke.txt" });

// list package root
await run("list_directory", new ListDirectoryTool(), { path: pkgRoot });

// grep for 'BaseTool' in src
await run("grep", new GrepTool(), { pattern: "BaseTool", path: "src", recursive: true });

// find .ts files
await run("find", new FindTool(), { path: "src", pattern: "*.ts" });

// shell: echo
await run("shell_exec", new ShellExecTool(), { command: "echo 'shell ok' && date" });

// web_fetch: example.com
await run("web_fetch", new WebFetchTool(), { url: "https://example.com", format: "text" });

// web_search: bun runtime
await run("web_search", new WebSearchTool(), { query: "Bun JavaScript runtime", numResults: 3 });
