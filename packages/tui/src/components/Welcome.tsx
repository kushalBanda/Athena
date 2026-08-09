import { Box, Text } from "ink";

interface Props {
  cwd: string;
}

const COLORS = {
  accent: "#8B5CF6",
  eyes: "#FBBF24",
  text: "#DDDDEE",
  muted: "#8B93A6",
} as const;

const TIPS = [
  "Ask in plain language Athena reads and edits files, runs commands, and searches the repo for you.",
  "/model switches the active model; /provider switches the active provider.",
  "/clear wipes the visible conversation without touching your files.",
  "ctrl+c cancels a running turn without quitting Athena.",
];

function Owl() {
  return (
    <Box flexDirection="column" alignItems="center">
      <Text color={COLORS.accent}>{" /\\_/\\ "}</Text>
      <Text color={COLORS.accent}>
        {"( "}
        <Text color={COLORS.eyes}>o.o</Text>
        {" )"}
      </Text>
      <Text color={COLORS.accent}>{" > ^ < "}</Text>
    </Box>
  );
}

export function Welcome({ cwd }: Props) {
  const home = process.env.HOME ?? "";
  const displayCwd = cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;

  return (
    <Box flexDirection="row" width="100%" paddingX={1}>
      <Box flexDirection="column" width="50%" alignItems="center">
        <Owl />
        <Box flexDirection="column" alignItems="center">
          <Text bold color={COLORS.text}>
            Welcome to Athena
          </Text>
          <Text color={COLORS.muted}>{displayCwd}</Text>
        </Box>
      </Box>
      <Box flexDirection="column" width="50%" paddingLeft={2}>
        <Text bold color={COLORS.accent}>
          Tips for getting started
        </Text>
        {TIPS.map((tip) => (
          <Text key={tip} color={COLORS.muted} wrap="wrap">
            {tip}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
