import { Box, Text } from "ink";
import { type Token, type Tokens, marked } from "marked";
import React from "react";

const ACCENT = "#00D9FF";
const DIM = "#555566";
const TEXT = "#DDDDEE";
const CODE = "#7EE787";
const INLINE_CODE = "#FFB86C";

type TextLike = { text?: string; tokens?: Token[] };

interface Props {
  content: string;
}

export function Markdown({ content }: Props) {
  const tokens = marked.lexer(content);
  return (
    <Box flexDirection="column">
      {tokens.map((token, i) => (
        <BlockToken key={i} token={token} />
      ))}
    </Box>
  );
}

function BlockToken({ token }: { token: Token }) {
  switch (token.type) {
    case "heading": {
      const t = token as Tokens.Heading;
      return (
        <Text bold underline={t.depth === 1} color={ACCENT}>
          {renderInline(t.tokens)}
        </Text>
      );
    }

    case "paragraph": {
      const t = token as Tokens.Paragraph;
      return <Text color={TEXT}>{renderInline(t.tokens)}</Text>;
    }

    case "text": {
      const t = token as Tokens.Text;
      return (
        <Text color={TEXT}>
          {renderInline(t.tokens ?? [{ type: "text", raw: t.raw, text: t.text }])}
        </Text>
      );
    }

    case "code": {
      const t = token as Tokens.Code;
      const lines = t.text.split("\n");
      return (
        <Box flexDirection="column" paddingX={1} borderStyle="round" borderColor={DIM}>
          {lines.map((line, i) => (
            <Text key={i} color={CODE}>
              {line.length > 0 ? line : " "}
            </Text>
          ))}
        </Box>
      );
    }

    case "list": {
      const t = token as Tokens.List;
      const start = typeof t.start === "number" ? t.start : 1;
      return (
        <Box flexDirection="column">
          {t.items.map((item, i) => (
            <ListItem key={i} item={item} ordered={t.ordered === true} index={start + i} />
          ))}
        </Box>
      );
    }

    case "table":
      return <MarkdownTable token={token as Tokens.Table} />;

    case "blockquote": {
      const t = token as Tokens.Blockquote;
      return (
        <Box
          paddingLeft={1}
          borderStyle="single"
          borderColor={DIM}
          borderTop={false}
          borderRight={false}
          borderBottom={false}
        >
          <Box flexDirection="column">
            {t.tokens.map((child, i) => (
              <BlockToken key={i} token={child} />
            ))}
          </Box>
        </Box>
      );
    }

    case "hr":
      return <Text color={DIM}>{"─".repeat(40)}</Text>;

    case "space":
      return null;

    default: {
      const t = token as TextLike;
      return t.text ? <Text color={TEXT}>{t.text}</Text> : null;
    }
  }
}

function ListItem({
  item,
  ordered,
  index,
}: { item: Tokens.ListItem; ordered: boolean; index: number }) {
  const marker = ordered ? `${index}. ` : item.task ? `[${item.checked ? "x" : " "}] ` : "- ";

  return (
    <Box>
      <Text color={DIM}>{marker}</Text>
      <Box flexDirection="column">
        {item.tokens.map((child, i) => (
          <BlockToken key={i} token={child} />
        ))}
      </Box>
    </Box>
  );
}

function MarkdownTable({ token }: { token: Tokens.Table }) {
  const cols = token.header.length;
  if (cols === 0) return null;

  const headerText = token.header.map((c) => plainInline(c.tokens));
  const rowsText = token.rows.map((row) => row.map((c) => plainInline(c.tokens)));

  const widths = headerText.map((t, i) => {
    const colValues = rowsText.map((row) => row[i]?.length ?? 0);
    return Math.max(t.length, ...colValues);
  });

  const border = (l: string, m: string, r: string) =>
    l + widths.map((w) => "─".repeat(w + 2)).join(m) + r;

  return (
    <Box flexDirection="column">
      <Text color={DIM}>{border("┌", "┬", "┐")}</Text>
      <TableRow cells={headerText} widths={widths} bold />
      <Text color={DIM}>{border("├", "┼", "┤")}</Text>
      {rowsText.map((row, i) => (
        <TableRow key={i} cells={row} widths={widths} />
      ))}
      <Text color={DIM}>{border("└", "┴", "┘")}</Text>
    </Box>
  );
}

function TableRow({
  cells,
  widths,
  bold = false,
}: { cells: string[]; widths: number[]; bold?: boolean }) {
  return (
    <Box>
      {cells.map((cell, i) => (
        <React.Fragment key={i}>
          <Text color={DIM}>{i === 0 ? "│ " : " │ "}</Text>
          <Text color={TEXT} bold={bold}>
            {cell + " ".repeat(Math.max(0, (widths[i] ?? 0) - cell.length))}
          </Text>
        </React.Fragment>
      ))}
      <Text color={DIM}> │</Text>
    </Box>
  );
}

function plainInline(tokens: Token[] = []): string {
  return tokens
    .map((token) => {
      const t = token as TextLike;
      if (t.tokens) return plainInline(t.tokens);
      return t.text ?? "";
    })
    .join("");
}

function renderInline(tokens: Token[] = []): React.ReactNode[] {
  return tokens.map((token, i) => {
    switch (token.type) {
      case "strong":
        return (
          <Text key={i} bold>
            {renderInline((token as Tokens.Strong).tokens)}
          </Text>
        );
      case "em":
        return (
          <Text key={i} italic>
            {renderInline((token as Tokens.Em).tokens)}
          </Text>
        );
      case "del":
        return (
          <Text key={i} strikethrough>
            {renderInline((token as Tokens.Del).tokens)}
          </Text>
        );
      case "codespan":
        return (
          <Text key={i} color={INLINE_CODE}>
            {(token as Tokens.Codespan).text}
          </Text>
        );
      case "link":
        return (
          <Text key={i} color={ACCENT} underline>
            {renderInline((token as Tokens.Link).tokens)}
          </Text>
        );
      case "br":
        return "\n";
      case "escape":
        return (token as Tokens.Escape).text;
      default:
        return (token as TextLike).text ?? "";
    }
  });
}
