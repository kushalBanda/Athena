import { spawn } from "node:child_process";
import { Type } from "@sinclair/typebox";
import { BaseTool, err, ok } from "../base.js";
import type { ToolContext, ToolResult } from "../types.js";

const Schema = Type.Object({
  command: Type.String({ description: "Shell command to execute" }),
  timeoutMs: Type.Optional(Type.Number({ minimum: 1000, maximum: 300_000, default: 30_000 })),
});

const MAX_OUTPUT_BYTES = 100_000;

export class ShellExecTool extends BaseTool<typeof Schema> {
  readonly name = "shell_exec";
  readonly description =
    "Execute a shell command in the working directory. Captures stdout and stderr. Requires user approval.";
  readonly permission = "prompt" as const;
  readonly schema = Schema;

  protected run(
    input: { command: string; timeoutMs?: number },
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const timeoutMs = input.timeoutMs ?? 30_000;

    return new Promise((resolve) => {
      const child = spawn("bash", ["-c", input.command], {
        cwd: ctx.workingDir,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      child.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

      const timer = setTimeout(() => child.kill(), timeoutMs);

      const decode = (chunks: Buffer[]) => {
        const text = Buffer.concat(chunks).toString("utf-8");
        return text.length > MAX_OUTPUT_BYTES
          ? `${text.slice(0, MAX_OUTPUT_BYTES)}\n[truncated]`
          : text;
      };

      child.on("error", (e) => {
        clearTimeout(timer);
        resolve(err(`Failed to start command: ${e.message}`));
      });

      child.on("close", (exitCode) => {
        clearTimeout(timer);

        const stdout = decode(stdoutChunks);
        const stderr = decode(stderrChunks);
        const combined = stdout + (stderr ? `\nSTDERR:\n${stderr}` : "");

        if (exitCode !== 0) {
          resolve(err(`Exit ${exitCode}:\n${combined}`));
        } else {
          resolve(ok(combined || "(no output)"));
        }
      });
    });
  }
}
