import { readFileSync } from "node:fs";

export interface AthenaManifest {
	extensions?: string[];
	skills?: string[];
	prompts?: string[];
	themes?: string[];
}

const RESOURCE_FIELDS = ["extensions", "skills", "prompts", "themes"] as const;

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readAthenaManifest(packageJsonPath: string): AthenaManifest | null {
	try {
		const pkg: unknown = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
		if (!isObject(pkg) || !isObject(pkg.athena)) {
			return null;
		}

		const manifest: AthenaManifest = {};
		for (const field of RESOURCE_FIELDS) {
			const entries = pkg.athena[field];
			if (Array.isArray(entries) && entries.every((entry) => typeof entry === "string")) {
				manifest[field] = entries;
			}
		}
		return manifest;
	} catch {
		return null;
	}
}
