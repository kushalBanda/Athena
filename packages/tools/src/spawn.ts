import { spawn } from "node:child_process";

export interface SpawnCollectResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Runs cmd via the OS process directly (argv-array, no shell), not
 * Bun.spawn: the CLI ships with a node shebang and --target=node build
 * (packages/cli/package.json), so tools must work under plain Node too.
 */
export function spawnCollect(cmd: string, args: string[], cwd?: string): Promise<SpawnCollectResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      ...(cwd ? { cwd } : {}),
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr: Buffer.concat(stderrChunks).toString("utf-8"),
        code: code ?? 0,
      });
    });
  });
}
