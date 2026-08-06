import { Type } from "@sinclair/typebox";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { BaseTool, err } from "../base.js";
import type { ToolContext, ToolResult } from "../types.js";
import {
  applyEditsToNormalizedContent,
  countDiffChanges,
  detectLineEnding,
  generateUnifiedPatch,
  normalizeToLF,
  restoreLineEndings,
  stripBom,
} from "../lib/edit-diff.js";

const EditSchema = Type.Object({
  oldText: Type.String({ description: "Exact text to replace" }),
  newText: Type.String({ description: "Replacement text" }),
  replaceAll: Type.Optional(Type.Boolean({ description: "Replace every occurrence of oldText (default false)" })),
});

const Schema = Type.Object({
  path: Type.String({ description: "Path to the file to edit" }),
  edits: Type.Array(EditSchema, { minItems: 1, description: "One or more edits to apply to the file" }),
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
    const file = Bun.file(resolved);
    const exists = await file.exists();

    if (!exists) {
      if (input.edits.length === 1 && input.edits[0]!.oldText === "") {
        try {
          await mkdir(path.dirname(resolved), { recursive: true });
          await Bun.write(resolved, input.edits[0]!.newText);
          const { additions } = countDiffChanges("", input.edits[0]!.newText);
          return {
            content: `Created ${resolved} (+${additions} -0)`,
            isError: false,
            metadata: { diff: generateUnifiedPatch(resolved, "", input.edits[0]!.newText), additions, deletions: 0 },
          };
        } catch (e) {
          return err(`Write failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return err(`File not found: ${resolved}`);
    }

    // Bun.file(...).text() silently strips a UTF-8 BOM during decode; decode raw
    // bytes ourselves so an existing BOM can be detected and reattached on write.
    const rawContent = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await file.arrayBuffer());
    const { bom, text } = stripBom(rawContent);
    const lineEnding = detectLineEnding(text);
    const normalizedContent = normalizeToLF(text);

    if (input.edits.length === 1 && input.edits[0]!.oldText === "") {
      return err(`edits[0].oldText must not be empty for an existing file: ${resolved}. Use write_file for a full rewrite.`);
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
      await Bun.write(resolved, finalContent);
    } catch (e) {
      return err(`Write failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    const { additions, deletions } = countDiffChanges(baseContent, newContent);
    const diff = generateUnifiedPatch(resolved, baseContent, newContent);

    return {
      content: `Edited ${resolved} (+${additions} -${deletions})`,
      isError: false,
      metadata: { diff, additions, deletions },
    };
  }
}
