import React, { useState } from "react";
import { Box, Text } from "ink";
import type { GitInfo } from "../git-info.js";

interface Props {
  cwd: string;
  git: GitInfo | null;
}

const COLORS = {
  path: "#DDDDEE",
  sep: "#444455",
  branch: "#A3B18A",
  added: "#4ADE80",
  removed: "#F87171",
  clock: "#8B93A6",
} as const;

/**
 * This bar is printed once (as the first entry in ChatView's <Static> list)
 * and never redrawn, so the timestamp reflects session start, not "now" —
 * a live clock here would freeze at whatever it read on that single render.
 */
function sessionStartTime(): string {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

export function TopBar({ cwd, git }: Props) {
  const [clock] = useState(sessionStartTime);

  const home = process.env.HOME ?? "";
  const displayCwd = cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;

  return (
    <Box flexDirection="row" width="100%" paddingX={1}>
      <Text color={COLORS.path}>{displayCwd}</Text>
      {git && (
        <>
          <Text color={COLORS.sep}>  ·  </Text>
          <Text color={COLORS.branch}>{git.branch}</Text>
          {git.added > 0 && <Text color={COLORS.added}> +{git.added}</Text>}
          {git.removed > 0 && <Text color={COLORS.removed}> -{git.removed}</Text>}
        </>
      )}
      <Box flexGrow={1} />
      <Text color={COLORS.clock}>{clock}</Text>
    </Box>
  );
}
