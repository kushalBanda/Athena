import { Type } from "@sinclair/typebox";
import { BaseTool, err, ok } from "../base.js";
import type { ToolContext } from "../types.js";

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

  protected async run(input: { command: string; timeoutMs?: number }, ctx: ToolContext) {
    const timeoutMs = input.timeoutMs ?? 30_000;

    const proc = Bun.spawn(["bash", "-c", input.command], {
      cwd: ctx.workingDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const timer = setTimeout(() => proc.kill(), timeoutMs);

    try {
      const [stdoutBuf, stderrBuf, exitCode] = await Promise.all([
        Bun.readableStreamToArrayBuffer(proc.stdout),
        Bun.readableStreamToArrayBuffer(proc.stderr),
        proc.exited,
      ]);

      const decode = (buf: ArrayBuffer) => {
        const text = new TextDecoder().decode(buf);
        return text.length > MAX_OUTPUT_BYTES
          ? `${text.slice(0, MAX_OUTPUT_BYTES)}\n[truncated]`
          : text;
      };

      const stdout = decode(stdoutBuf);
      const stderr = decode(stderrBuf);
      const combined = stdout + (stderr ? `\nSTDERR:\n${stderr}` : "");

      if (exitCode !== 0) {
        return err(`Exit ${exitCode}:\n${combined}`);
      }
      return ok(combined || "(no output)");
    } finally {
      clearTimeout(timer);
    }
  }
}
