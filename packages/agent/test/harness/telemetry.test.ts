import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTypedSpanStarter, NOOP_TELEMETRY_CONTEXT, type TelemetryContext } from "@kushalbanda/telemetry";
import { describe, expect, expectTypeOf, it } from "vitest";
import { renderAgentTelemetrySchemaMarkdown } from "../../scripts/generate-telemetry-docs.ts";
import {
	AGENT_TELEMETRY_SCHEMAS,
	AI_TELEMETRY_SCHEMA,
	type AiSpanEndAttributes,
	type AiSpanStartAttributes,
	HARNESS_TELEMETRY_SCHEMA,
	type HarnessSpanEndAttributes,
	type HarnessSpanStartAttributes,
	startAiSpan,
	startHarnessSpan,
} from "../../src/harness/telemetry.ts";

describe("agent telemetry schemas", () => {
	it("serializes both schemas and generates the checked-in reference", () => {
		expect(() => JSON.stringify(AI_TELEMETRY_SCHEMA)).not.toThrow();
		expect(() => JSON.stringify(HARNESS_TELEMETRY_SCHEMA)).not.toThrow();
		expect(AGENT_TELEMETRY_SCHEMAS).toEqual([AI_TELEMETRY_SCHEMA, HARNESS_TELEMETRY_SCHEMA]);
		expect(Object.keys(HARNESS_TELEMETRY_SCHEMA.spans)).toEqual([
			"athena.harness.run",
			"athena.harness.compaction",
			"athena.harness.navigation",
			"athena.harness.checkpoint",
			"athena.harness.turn",
			"athena.harness.step",
			"athena.harness.tool",
			"athena.harness.hook",
			"athena.harness.sleep",
			"athena.harness.event_handler",
			"athena.session.write",
		]);
		const actual = readFileSync(resolve(import.meta.dirname, "../../docs/telemetry-schema.md"), "utf8");
		expect(actual).toBe(renderAgentTelemetrySchemaMarkdown());
	});

	it("starts AI-request and harness spans through one composed typed starter", async () => {
		const startSpan = createTypedSpanStarter(NOOP_TELEMETRY_CONTEXT, AGENT_TELEMETRY_SCHEMAS);
		await startSpan(
			"athena.harness.step",
			{
				"athena.lane.name": "main",
				"athena.operation.id": "operation",
				"athena.step.kind": "assistant",
				"athena.step.attempt": 1,
			},
			async (stepSpan, startChildSpan) => {
				stepSpan.setAttributes({ "athena.step.outcome": "succeeded" });
				await startChildSpan(
					"athena.ai.request",
					{
						"athena.ai.operation": "stream",
						"athena.ai.provider": "provider",
						"athena.ai.model": "model",
						"athena.ai.api": "api",
						"athena.ai.streaming": true,
					},
					(requestSpan) => {
						requestSpan.setAttributes({ "athena.ai.response.stop_reason": "stop" });
					},
				);
			},
		);
	});

	it("infers exact AI start and optional end attributes", async () => {
		type Start = AiSpanStartAttributes<"athena.ai.request">;
		type End = AiSpanEndAttributes<"athena.ai.request">;
		expectTypeOf<Start>().toMatchTypeOf<{
			"athena.ai.operation": "stream" | "fetch_deferred" | "cancel_deferred" | "generate_images";
			"athena.ai.provider": string;
			"athena.ai.model": string;
			"athena.ai.api": string;
			"athena.ai.streaming": boolean;
			"athena.ai.deferred"?: boolean;
		}>();
		expectTypeOf<End["athena.ai.response.stop_reason"]>().toEqualTypeOf<
			"stop" | "length" | "tool_use" | "error" | "aborted" | "deferred" | undefined
		>();

		const telemetryContext: TelemetryContext = NOOP_TELEMETRY_CONTEXT;
		await startAiSpan(
			telemetryContext,
			"athena.ai.request",
			{
				"athena.ai.operation": "stream",
				"athena.ai.provider": "provider",
				"athena.ai.model": "model",
				"athena.ai.api": "api",
				"athena.ai.streaming": true,
			},
			(span) => {
				span.setAttributes({ "athena.ai.response.stop_reason": "tool_use" });
				// @ts-expect-error athena.ai.request declares no span events
				span.addEvent("chunk");
			},
		);

		const compileTimeFailures = () => {
			const extraAttributes = {
				"athena.ai.operation": "stream",
				"athena.ai.provider": "provider",
				"athena.ai.model": "model",
				"athena.ai.api": "api",
				"athena.ai.streaming": true,
				"athena.ai.unknown": true,
			} as const;
			// @ts-expect-error variables with unknown attributes are rejected
			void startAiSpan(telemetryContext, "athena.ai.request", extraAttributes, () => {});
			// @ts-expect-error missing required start attributes
			void startAiSpan(telemetryContext, "athena.ai.request", { "athena.ai.operation": "stream" }, () => {});
		};
		expectTypeOf(compileTimeFailures).toBeFunction();
	});

	it("infers per-span harness literals and optional completion enrichment", async () => {
		type RunStart = HarnessSpanStartAttributes<"athena.harness.run">;
		type RunEnd = HarnessSpanEndAttributes<"athena.harness.run">;
		expectTypeOf<RunStart["athena.operation.kind"]>().toEqualTypeOf<"run">();
		expectTypeOf<RunEnd["athena.operation.outcome"]>().toEqualTypeOf<
			"completed" | "aborted" | "failed" | "suspended" | undefined
		>();

		const telemetryContext: TelemetryContext = NOOP_TELEMETRY_CONTEXT;
		await startHarnessSpan(
			telemetryContext,
			"athena.harness.run",
			{
				"athena.session.id": "session",
				"athena.lane.name": "main",
				"athena.operation.id": "operation",
				"athena.operation.kind": "run",
				"athena.operation.recovery": false,
			},
			(span) => {
				span.setAttributes({ "athena.operation.outcome": "completed" });
				span.setAttributes({});
				// @ts-expect-error the harness schema declares no span events
				span.addEvent("result");
			},
		);

		const compileTimeFailures = () => {
			const extraRunAttributes = {
				"athena.session.id": "session",
				"athena.lane.name": "main",
				"athena.operation.id": "operation",
				"athena.operation.kind": "run",
				"athena.operation.recovery": false,
				"athena.unknown": true,
			} as const;
			// @ts-expect-error variables with unknown attributes are rejected
			void startHarnessSpan(telemetryContext, "athena.harness.run", extraRunAttributes, () => {});
			void startHarnessSpan(
				telemetryContext,
				"athena.harness.checkpoint",
				{
					"athena.lane.name": "main",
					"athena.operation.id": "operation",
					"athena.checkpoint.kind": "normal",
				},
				(span) => {
					// @ts-expect-error empty end schemas reject every attribute
					span.setAttributes({ "athena.unknown": true });
				},
			);
			void startHarnessSpan(
				telemetryContext,
				"athena.harness.run",
				{
					"athena.session.id": "session",
					"athena.lane.name": "main",
					"athena.operation.id": "operation",
					// @ts-expect-error run spans accept only the run operation kind
					"athena.operation.kind": "navigation",
					"athena.operation.recovery": false,
				},
				() => {},
			);
			// @ts-expect-error missing required run start attributes
			void startHarnessSpan(telemetryContext, "athena.harness.run", {}, () => {});
		};
		expectTypeOf(compileTimeFailures).toBeFunction();
	});
});
