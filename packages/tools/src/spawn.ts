export async function spawnCollect(
  cmd: string,
  args: string[],
  cwd?: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  const proc = Bun.spawn([cmd, ...args], {
    ...(cwd ? { cwd } : {}),
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdoutBuf, stderrBuf, code] = await Promise.all([
    Bun.readableStreamToArrayBuffer(proc.stdout),
    Bun.readableStreamToArrayBuffer(proc.stderr),
    proc.exited,
  ]);

  return {
    stdout: new TextDecoder().decode(stdoutBuf),
    stderr: new TextDecoder().decode(stderrBuf),
    code: code ?? 0,
  };
}
