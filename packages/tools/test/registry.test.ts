import { describe, expect, it } from "bun:test";
import { ToolRegistry, createDefaultRegistry } from "../src/registry.js";
import { ReadFileTool } from "../src/impl/read-file.js";
import { WriteFileTool } from "../src/impl/write-file.js";

describe("ToolRegistry", () => {
  it("registers and retrieves tools by name", () => {
    const reg = new ToolRegistry().register(new ReadFileTool()).register(new WriteFileTool());
    expect(reg.get("read_file")).toBeDefined();
    expect(reg.get("write_file")).toBeDefined();
    expect(reg.get("nonexistent")).toBeUndefined();
  });

  it("all() returns all registered tools", () => {
    const reg = new ToolRegistry().register(new ReadFileTool()).register(new WriteFileTool());
    expect(reg.all().length).toBe(2);
  });

  it("createDefaultRegistry includes all 8 tools", () => {
    const reg = createDefaultRegistry();
    const names = reg.all().map((t) => t.name);
    expect(names).toContain("read_file");
    expect(names).toContain("write_file");
    expect(names).toContain("list_directory");
    expect(names).toContain("grep");
    expect(names).toContain("find");
    expect(names).toContain("shell_exec");
    expect(names).toContain("web_search");
    expect(names).toContain("web_fetch");
    expect(names.length).toBe(8);
  });

  it("toToolDef() produces valid ToolDef shape", () => {
    const tool = new ReadFileTool();
    const def = tool.toToolDef();
    expect(def.name).toBe("read_file");
    expect(typeof def.description).toBe("string");
    expect(typeof def.inputSchema).toBe("object");
  });
});
