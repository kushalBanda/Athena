import { Text } from "ink";
import { useMemo } from "react";

interface Props {
  label: string;
  indices: number[];
  active: boolean;
}

export function HighlightedLabel({ label, indices, active }: Props) {
  const matchSet = useMemo(() => new Set(indices), [indices]);
  const baseColor = active ? "green" : "#888899";
  const matchColor = active ? "#DDFFEE" : "#00D9FF";
  return (
    <Text>
      {label.split("").map((ch, i) => (
        <Text key={i} color={matchSet.has(i) ? matchColor : baseColor} bold={active || matchSet.has(i)} underline={matchSet.has(i)}>
          {ch}
        </Text>
      ))}
    </Text>
  );
}
