import { describe, expect, it } from "bun:test";
import { parseFrontmatter } from "../src/frontmatter.js";

describe("parseFrontmatter", () => {
  it("parses YAML frontmatter and returns the body separately", () => {
    const content = "---\nname: my-skill\ndescription: Does a thing\n---\nBody content here.";
    const { frontmatter, body } = parseFrontmatter<{ name?: string; description?: string }>(content);
    expect(frontmatter.name).toBe("my-skill");
    expect(frontmatter.description).toBe("Does a thing");
    expect(body).toBe("Body content here.");
  });

  it("returns empty frontmatter and full content as body when no frontmatter present", () => {
    const { frontmatter, body } = parseFrontmatter("Just a plain file.");
    expect(frontmatter).toEqual({});
    expect(body).toBe("Just a plain file.");
  });

  it("treats unterminated frontmatter fence as no frontmatter", () => {
    const content = "---\nname: broken\nno closing fence";
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter).toEqual({});
    expect(body).toBe(content);
  });

  it("normalizes CRLF line endings before parsing", () => {
    const content = "---\r\nname: crlf-skill\r\n---\r\nBody.";
    const { frontmatter } = parseFrontmatter<{ name?: string }>(content);
    expect(frontmatter.name).toBe("crlf-skill");
  });
});
