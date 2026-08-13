import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import { BaseTool, err } from "../base.js";
import { formatBlastRadius, getBlastRadius } from "../codegraph/blast-radius.js";
import {
  applyEditsToNormalizedContent,
  countDiffChanges,
  detectLineEnding,
  generateUnifiedPatch,
  normalizeToLF,
  restoreLineEndings,
  stripBom,
} from "../lib/edit-diff.js";
import type { ToolContext, ToolResult } from "../types.js";

const EditSchema = Type.Object({
  oldText: Type.String({ description: "Exact text to replace" }),
  newText: Type.String({ description: "Replacement text" }),
  replaceAll: Type.Optional(
    Type.Boolean({ description: "Replace every occurrence of oldText (default false)" }),
  ),
});

const Schema = Type.Object({
  path: Type.String({ description: "Path to the file to edit" }),
  edits: Type.Array(EditSchema, {
    minItems: 1,
    description: "One or more edits to apply to the file",
  }),
});

export class EditFileTool extends BaseTool<typeof Schema> {
  readonly name = "edit_file";
  readonly description =
    "Make surgical edits to a file by replacing exact text spans. Supports multiple edits per call. " +
    "Prefer this over write_file for changes to existing files.";
  readonly permission = "auto" as const;
  readonly schema = Schema;

  protected async run(
    input: { path: string; edits: { oldText: string; newText: string; replaceAll?: boolean }[] },
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const resolved = path.resolve(ctx.workingDir, input.path);
    const exists = existsSync(resolved);

    if (!exists) {
      if (input.edits.length === 1 && input.edits[0]!.oldText === "") {
        try {
          await mkdir(path.dirname(resolved), { recursive: true });
          await writeFile(resolved, input.edits[0]!.newText, "utf-8");
          const { additions } = countDiffChanges("", input.edits[0]!.newText);
          return {
            content: `Created ${resolved} (+${additions} -0)`,
            isError: false,
            metadata: {
              diff: generateUnifiedPatch(resolved, "", input.edits[0]!.newText),
              additions,
              deletions: 0,
            },
          };
        } catch (e) {
          return err(`Write failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return err(`File not found: ${resolved}`);
    }

    const rawBuffer = await readFile(resolved);
    const rawContent = new TextDecoder("utf-8", { ignoreBOM: true }).decode(rawBuffer);
    const { bom, text } = stripBom(rawContent);
    const lineEnding = detectLineEnding(text);
    const normalizedContent = normalizeToLF(text);

    if (input.edits.length === 1 && input.edits[0]!.oldText === "") {
      return err(
        `edits[0].oldText must not be empty for an existing file: ${resolved}. Use write_file for a full rewrite.`,
      );
    }

    let baseContent: string;
    let newContent: string;
    try {
      const result = applyEditsToNormalizedContent(normalizedContent, input.edits, resolved);
      baseContent = result.baseContent;
      newContent = result.newContent;
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }

    const finalContent = bom + restoreLineEndings(newContent, lineEnding);

    try {
      await writeFile(resolved, finalContent, "utf-8");
    } catch (e) {
      return err(`Write failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    const { additions, deletions } = countDiffChanges(baseContent, newContent);
    const diff = generateUnifiedPatch(resolved, baseContent, newContent);

    // Scope symbol inference to the edited text only (not the whole file) so
    // blast radius reports the symbol actually touched, not an unrelated one
    // that happens to appear earlier in a large file.
    const editedRegionText = input.edits.map((e) => e.newText).join("\n");
    const blast = await getBlastRadius(ctx.workingDir, resolved, editedRegionText);
    const blastLine = blast !== null ? formatBlastRadius(blast) : "";

    return {
      content: `Edited ${resolved} (+${additions} -${deletions})${blastLine}`,
      isError: false,
      metadata: { diff, additions, deletions },
    };
  }
}
