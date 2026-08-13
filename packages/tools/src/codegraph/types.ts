// Real @colbymchenry/codegraph shape — open() takes a project root, not a db path.
export type CodegraphModule = {
  CodeGraph: {
    open(
      projectRoot: string,
      options?: { sync?: boolean; readOnly?: boolean },
    ): Promise<CodeGraphHandle>;
  };
  isInitialized(projectRoot: string): boolean;
  getDatabasePath(projectRoot: string): string;
};

export interface GraphNode {
  id: string;
  name: string;
  qualifiedName: string;
  kind: string;
  filePath: string;
  startLine: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: string;
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  node: GraphNode;
  score: number;
  highlights?: string[];
}

export interface CodeGraphHandle {
  // Synchronous in the real API — do not `await` these.
  searchNodes(query: string): SearchResult[];
  getCallers(nodeId: string, maxDepth?: number): Array<{ node: GraphNode; edge: GraphEdge }>;
  getCallees(nodeId: string, maxDepth?: number): Array<{ node: GraphNode; edge: GraphEdge }>;
  close(): void;
  // format required — real API returns TaskContext (not string) when format is omitted.
  buildContext(
    input: string,
    options: {
      format: "markdown" | "json";
      maxNodes?: number;
      maxCodeBlocks?: number;
      traversalDepth?: number;
      includeCode?: boolean;
      searchLimit?: number;
      minScore?: number;
    },
  ): Promise<string>;
}

export interface SetupResult {
  corePackageResolved: boolean;
  indexPresent: boolean;
  indexJustBuilt: boolean;
  gitignoreUpdated: boolean;
  watcherActive: boolean;
  fallback: "git-hooks" | "none";
  error?: string;
}

export interface IndexStatus {
  fresh: boolean;
  watcherActive: boolean;
  lastSyncedAt?: string;
}

export interface BlastRadius {
  symbol: string;
  callers: Array<{ file: string; line: number; name: string }>;
}
