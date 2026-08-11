import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { AgentMessage } from "./types.js";

export interface SessionHeader {
  type: "session";
  version: 1;
  id: string;
  timestamp: string;
  cwd: string;
  parentSession?: string;
}

export interface SessionEntryBase {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
}

export interface SessionMessageEntry extends SessionEntryBase {
  type: "message";
  message: AgentMessage;
}

export interface ModelChangeEntry extends SessionEntryBase {
  type: "model_change";
  provider: string;
  modelId: string;
}

export interface SessionInfoEntry extends SessionEntryBase {
  type: "session_info";
  name?: string;
}

export interface LabelEntry extends SessionEntryBase {
  type: "label";
  targetId: string;
  label: string | undefined;
}

export type SessionEntry = SessionMessageEntry | ModelChangeEntry | SessionInfoEntry | LabelEntry;

export type FileEntry = SessionHeader | SessionEntry;

export interface SessionTreeNode {
  entry: SessionEntry;
  children: SessionTreeNode[];
  label?: string;
}

export interface SessionContext {
  messages: AgentMessage[];
  model: { provider: string; modelId: string } | null;
}

export interface SessionInfo {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  created: Date;
  modified: Date;
  messageCount: number;
  firstMessage: string;
}

export interface NewSessionOptions {
  id?: string;
  parentSession?: string;
}

function createSessionId(): string {
  return randomUUID();
}

/** 8-hex-char id, collision-checked against the current index. */
function generateId(byId: { has(id: string): boolean }): string {
  for (let i = 0; i < 100; i++) {
    const id = randomUUID().slice(0, 8);
    if (!byId.has(id)) return id;
  }
  return randomUUID();
}

function parseSessionEntryLine(line: string): FileEntry | null {
  if (!line.trim()) return null;
  try {
    return JSON.parse(line) as FileEntry;
  } catch {
    return null;
  }
}

export function loadEntriesFromFile(filePath: string): FileEntry[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf8");
  const entries: FileEntry[] = [];
  for (const line of content.split("\n")) {
    const entry = parseSessionEntryLine(line);
    if (entry) entries.push(entry);
  }
  if (entries.length === 0) return entries;
  const header = entries[0];
  if (header === undefined || header.type !== "session" || typeof header.id !== "string") return [];
  return entries;
}

function readSessionHeader(filePath: string): SessionHeader | null {
  const entries = loadEntriesFromFile(filePath);
  const header = entries[0];
  return header !== undefined && header.type === "session" ? header : null;
}

function getAgentDir(): string {
  return join(homedir(), ".config", "athena");
}

export function getSessionsDir(): string {
  return join(getAgentDir(), "sessions");
}

function getDefaultSessionDirPath(cwd: string): string {
  const resolvedCwd = resolve(cwd);
  const safePath = `--${resolvedCwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
  return join(getSessionsDir(), safePath);
}

export function getDefaultSessionDir(cwd: string): string {
  const dir = getDefaultSessionDirPath(cwd);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function sessionCwdMatches(cwd: string | undefined, resolvedCwd: string): boolean {
  return cwd !== undefined && cwd !== "" && resolve(cwd) === resolvedCwd;
}

export function findMostRecentSession(sessionDir: string, cwd?: string): string | null {
  const resolvedCwd = cwd ? resolve(cwd) : undefined;
  try {
    const files = readdirSync(sessionDir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => join(sessionDir, f))
      .map((path) => ({ path, header: readSessionHeader(path) }))
      .filter(
        (f): f is { path: string; header: SessionHeader } =>
          f.header !== null && (!resolvedCwd || sessionCwdMatches(f.header.cwd, resolvedCwd)),
      )
      .map(({ path }) => ({ path, mtime: statSync(path).mtime }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    return files[0]?.path ?? null;
  } catch {
    return null;
  }
}

function extractText(message: AgentMessage): string {
  return typeof message.content === "string"
    ? message.content
    : message.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join(" ");
}

function buildSessionInfo(filePath: string): SessionInfo | null {
  try {
    const stats = statSync(filePath);
    const entries = loadEntriesFromFile(filePath);
    const header = entries[0];
    if (header === undefined || header.type !== "session") return null;

    let messageCount = 0;
    let firstMessage = "";
    let name: string | undefined;

    for (const entry of entries.slice(1)) {
      if (entry.type === "session_info") {
        name = entry.name?.trim() || undefined;
      }
      if (entry.type !== "message") continue;
      messageCount++;
      if (!firstMessage && entry.message.role === "user") {
        firstMessage = extractText(entry.message);
      }
    }

    return {
      path: filePath,
      id: header.id,
      cwd: header.cwd,
      ...(name !== undefined ? { name } : {}),
      created: new Date(header.timestamp),
      modified: stats.mtime,
      messageCount,
      firstMessage: firstMessage || "(no messages)",
    };
  } catch {
    return null;
  }
}

function listSessionsFromDir(dir: string): SessionInfo[] {
  if (!existsSync(dir)) return [];
  try {
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => join(dir, f));
    const sessions: SessionInfo[] = [];
    for (const file of files) {
      const info = buildSessionInfo(file);
      if (info) sessions.push(info);
    }
    sessions.sort((a, b) => b.modified.getTime() - a.modified.getTime());
    return sessions;
  } catch {
    return [];
  }
}

function buildSessionPath(
  entries: SessionEntry[],
  leafId: string | null,
  byId: Map<string, SessionEntry>,
): SessionEntry[] {
  let leaf = leafId ? byId.get(leafId) : entries[entries.length - 1];
  const path: SessionEntry[] = [];
  let current: SessionEntry | undefined = leaf;
  while (current) {
    path.push(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  path.reverse();
  return path;
}

const VALID_ROLES = new Set<AgentMessage["role"]>([
  "user",
  "assistant",
  "tool_result",
  "compaction_summary",
]);

function isWellFormedMessage(message: AgentMessage): boolean {
  return (
    typeof message.id === "string" &&
    VALID_ROLES.has(message.role) &&
    (typeof message.content === "string" || Array.isArray(message.content))
  );
}

function sessionEntryToContextMessage(entry: SessionEntry): AgentMessage | null {
  if (entry.type !== "message") return null;
  return isWellFormedMessage(entry.message) ? entry.message : null;
}

export function diffNewMessages(
  priorHistory: AgentMessage[],
  newHistory: AgentMessage[],
): AgentMessage[] {
  const priorIds = new Set(priorHistory.map((m) => m.id));
  return newHistory.filter((m) => !priorIds.has(m.id));
}

export class SessionManager {
  private sessionId = "";
  private sessionFile: string | undefined;
  private sessionDir: string;
  private cwd: string;
  private persist: boolean;
  private fileEntries: FileEntry[] = [];
  private byId = new Map<string, SessionEntry>();
  private leafId: string | null = null;

  private constructor(
    cwd: string,
    sessionDir: string,
    sessionFile: string | undefined,
    persist: boolean,
    newSessionOptions?: NewSessionOptions,
  ) {
    this.cwd = resolve(cwd);
    this.sessionDir = sessionDir;
    this.persist = persist;
    if (persist && sessionDir && !existsSync(sessionDir))
      mkdirSync(sessionDir, { recursive: true, mode: 0o700 });

    if (sessionFile) {
      this.sessionFile = resolve(sessionFile);
      if (existsSync(this.sessionFile)) {
        this.fileEntries = loadEntriesFromFile(this.sessionFile);
        const header = this.fileEntries[0];
        this.sessionId = header?.type === "session" ? header.id : createSessionId();
        this.buildIndex();
      } else {
        this.newSession(newSessionOptions);
        this.sessionFile = resolve(sessionFile);
      }
    } else {
      this.newSession(newSessionOptions);
    }
  }

  newSession(options?: NewSessionOptions): void {
    this.sessionId = options?.id ?? createSessionId();
    const timestamp = new Date().toISOString();
    const header: SessionHeader = {
      type: "session",
      version: 1,
      id: this.sessionId,
      timestamp,
      cwd: this.cwd,
      ...(options?.parentSession !== undefined ? { parentSession: options.parentSession } : {}),
    };
    this.fileEntries = [header];
    this.byId.clear();
    this.leafId = null;
    if (this.persist) {
      const fileTimestamp = timestamp.replace(/[:.]/g, "-");
      this.sessionFile = join(this.sessionDir, `${fileTimestamp}_${this.sessionId}.jsonl`);
      writeFileSync(this.sessionFile, `${JSON.stringify(header)}\n`, { mode: 0o600 });
      chmodSync(this.sessionFile, 0o600); // belt-and-suspenders: `mode` on writeFileSync doesn't override an existing file's perms or umask on all platforms
    }
  }

  private buildIndex(): void {
    this.byId.clear();
    this.leafId = null;
    for (const entry of this.fileEntries) {
      if (entry.type === "session") continue;
      this.byId.set(entry.id, entry);
      this.leafId = entry.id;
    }
  }

  private appendEntry(entry: SessionEntry): void {
    this.fileEntries.push(entry);
    this.byId.set(entry.id, entry);
    this.leafId = entry.id;
    if (this.persist && this.sessionFile) {
      appendFileSync(this.sessionFile, `${JSON.stringify(entry)}\n`);
    }
  }

  appendMessage(message: AgentMessage): string {
    const entry: SessionMessageEntry = {
      type: "message",
      id: generateId(this.byId),
      parentId: this.leafId,
      timestamp: new Date().toISOString(),
      message,
    };
    this.appendEntry(entry);
    return entry.id;
  }

  appendModelChange(provider: string, modelId: string): string {
    const entry: ModelChangeEntry = {
      type: "model_change",
      id: generateId(this.byId),
      parentId: this.leafId,
      timestamp: new Date().toISOString(),
      provider,
      modelId,
    };
    this.appendEntry(entry);
    return entry.id;
  }

  appendSessionInfo(name: string): string {
    const entry: SessionInfoEntry = {
      type: "session_info",
      id: generateId(this.byId),
      parentId: this.leafId,
      timestamp: new Date().toISOString(),
      name: name.replace(/[\r\n]+/g, " ").trim(),
    };
    this.appendEntry(entry);
    return entry.id;
  }

  appendLabelChange(targetId: string, label: string | undefined): string {
    if (!this.byId.has(targetId)) throw new Error(`Entry ${targetId} not found`);
    const entry: LabelEntry = {
      type: "label",
      id: generateId(this.byId),
      parentId: this.leafId,
      timestamp: new Date().toISOString(),
      targetId,
      label,
    };
    this.appendEntry(entry);
    return entry.id;
  }

  /** Move the leaf to an earlier entry; the next append becomes its child, starting a new branch. */
  branch(branchFromId: string): void {
    if (!this.byId.has(branchFromId)) throw new Error(`Entry ${branchFromId} not found`);
    this.leafId = branchFromId;
  }

  getLeafId(): string | null {
    return this.leafId;
  }

  getEntry(id: string): SessionEntry | undefined {
    return this.byId.get(id);
  }

  getEntries(): SessionEntry[] {
    return this.fileEntries.filter((e): e is SessionEntry => e.type !== "session");
  }

  getHeader(): SessionHeader | null {
    const h = this.fileEntries[0];
    return h?.type === "session" ? h : null;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getSessionFile(): string | undefined {
    return this.sessionFile;
  }

  getCwd(): string {
    return this.cwd;
  }

  getSessionName(): string | undefined {
    const entries = this.getEntries();
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry?.type === "session_info") return entry.name?.trim() || undefined;
    }
    return undefined;
  }

  getBranch(fromId?: string): SessionEntry[] {
    return buildSessionPath(this.getEntries(), fromId ?? this.leafId, this.byId);
  }

  getTree(): SessionTreeNode[] {
    const entries = this.getEntries();
    const nodeMap = new Map<string, SessionTreeNode>();
    const roots: SessionTreeNode[] = [];
    for (const entry of entries) nodeMap.set(entry.id, { entry, children: [] });
    for (const entry of entries) {
      const node = nodeMap.get(entry.id);
      if (!node) continue;
      const parent = entry.parentId ? nodeMap.get(entry.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  /** Resolved message list for the LLM: walks leaf → root, following the active branch. */
  buildSessionContext(): SessionContext {
    const path = buildSessionPath(this.getEntries(), this.leafId, this.byId);
    let model: { provider: string; modelId: string } | null = null;
    for (const entry of path) {
      if (entry.type === "model_change")
        model = { provider: entry.provider, modelId: entry.modelId };
    }
    const messages = path
      .map(sessionEntryToContextMessage)
      .filter((m): m is AgentMessage => m !== null);
    return { messages, model };
  }

  static create(cwd: string, sessionDir?: string, options?: NewSessionOptions): SessionManager {
    const dir = sessionDir ?? getDefaultSessionDir(cwd);
    return new SessionManager(cwd, dir, undefined, true, options);
  }

  static open(path: string, sessionDir?: string): SessionManager {
    const resolvedPath = resolve(path);
    const dir = sessionDir ?? resolve(resolvedPath, "..");
    const header = readSessionHeader(resolvedPath);
    const cwd = header?.cwd ?? process.cwd();
    return new SessionManager(cwd, dir, resolvedPath, true);
  }

  static continueRecent(cwd: string, sessionDir?: string): SessionManager {
    const dir = sessionDir ?? getDefaultSessionDir(cwd);
    const mostRecent = findMostRecentSession(dir, sessionDir ? cwd : undefined);
    return mostRecent
      ? new SessionManager(cwd, dir, mostRecent, true)
      : new SessionManager(cwd, dir, undefined, true);
  }

  static inMemory(cwd: string = process.cwd()): SessionManager {
    return new SessionManager(cwd, "", undefined, false);
  }

  static list(cwd: string, sessionDir?: string): SessionInfo[] {
    const dir = sessionDir ?? getDefaultSessionDir(cwd);
    const resolvedCwd = resolve(cwd);
    return listSessionsFromDir(dir).filter(
      (s) => !sessionDir || sessionCwdMatches(s.cwd, resolvedCwd),
    );
  }

  static findById(cwd: string, id: string, sessionDir?: string): SessionManager | null {
    const match = SessionManager.list(cwd, sessionDir).find(
      (s) => s.id === id || s.id.startsWith(id),
    );
    return match ? SessionManager.open(match.path, sessionDir) : null;
  }

  static listAll(): SessionInfo[] {
    const sessionsDir = getSessionsDir();
    if (!existsSync(sessionsDir)) return [];
    try {
      const dirs = readdirSync(sessionsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => join(sessionsDir, e.name));
      const sessions = dirs.flatMap((dir) => listSessionsFromDir(dir));
      sessions.sort((a, b) => b.modified.getTime() - a.modified.getTime());
      return sessions;
    } catch {
      return [];
    }
  }
}
