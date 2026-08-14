import {
  Input,
  ProcessTerminal,
  SelectList,
  type SelectItem,
  TitledOverlay,
  type TUI,
  TuiMainScreen,
} from "@athena/tui";
import { setApiKey, setOtlpHeaders } from "./auth.js";
import { saveObservabilityConfig } from "./config.js";
import { PROVIDER_META } from "./provider-meta.js";

const PROVIDERS = PROVIDER_META;

type ProviderId = (typeof PROVIDERS)[number]["id"];

export interface SetupResult {
  provider: ProviderId;
  cancelled: boolean;
}

export type SetupStep =
  | "provider"
  | "key"
  | "observability"
  | "observability-preset"
  | "observability-new-relic-key"
  | "observability-new-relic-region"
  | "observability-custom-endpoint"
  | "observability-custom-headers"
  | "done";

export function nextStepAfterAuth(_current: "provider" | "key"): SetupStep {
  return "observability";
}

type NewRelicRegion = "us" | "eu";

const NEW_RELIC_ENDPOINTS: Record<NewRelicRegion, string> = {
  us: "https://otlp.nr-data.net:4318/v1/traces",
  eu: "https://otlp.eu01.nr-data.net:4318/v1/traces",
};

export function resolveNewRelicPreset(
  licenseKey: string,
  region: NewRelicRegion,
): { otlpEndpoint: string; otlpHeaders: Record<string, string> } {
  return {
    otlpEndpoint: NEW_RELIC_ENDPOINTS[region],
    otlpHeaders: { "api-key": licenseKey },
  };
}

const HEADING = (subtitle: string) => `athena — ${subtitle}`;
const NEUTRAL_SELECT_THEME = {
  selectedPrefix: (s: string) => s,
  selectedText: (s: string) => s,
  description: (s: string) => s,
  scrollInfo: (s: string) => s,
  noMatch: (s: string) => s,
};

function selectItems(labels: string[]): SelectItem[] {
  return labels.map((label, i) => ({ value: String(i), label }));
}

/** Setup wizard on its own non-alt-screen TUI instance, run before the main app starts. */
// Known gap: key entry uses `Input`, which has no mask — typed characters are visible.
export function runSetup(): Promise<SetupResult> {
  return new Promise((resolve) => {
    const ui: TUI = new TuiMainScreen(new ProcessTerminal());
    let done = false;
    let chosenProvider: ProviderId = "anthropic";

    const finish = (result: SetupResult) => {
      if (done) return;
      done = true;
      ui.stop();
      resolve(result);
    };

    ui.addInputListener((data: string) => {
      if (data === "\x03") finish({ provider: chosenProvider, cancelled: true });
      return undefined;
    });

    function showStep(component: import("@athena/tui").Component): void {
      ui.clear();
      ui.addChild(component);
      ui.setFocus(component);
      ui.requestRender();
    }

    function providerStep(): void {
      const list = new SelectList(
        selectItems(PROVIDERS.map((p) => p.label)),
        PROVIDERS.length,
        NEUTRAL_SELECT_THEME,
      );
      list.onSelect = (item) => {
        const selected = PROVIDERS[Number(item.value)];
        if (!selected) return;
        chosenProvider = selected.id;
        if (!selected.needsKey) {
          if (nextStepAfterAuth("provider") === "observability") observabilityStep();
        } else {
          keyStep(selected.id, selected.label);
        }
      };
      list.onCancel = () => finish({ provider: chosenProvider, cancelled: true });
      showStep(new TitledOverlay(HEADING("choose a provider"), list));
    }

    function keyStep(providerId: ProviderId, label: string): void {
      const input = new Input();
      input.onSubmit = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return;
        setApiKey(providerId, trimmed);
        if (nextStepAfterAuth("key") === "observability") observabilityStep();
      };
      showStep(new TitledOverlay(HEADING(label), input));
    }

    function observabilityStep(): void {
      const list = new SelectList(selectItems(["Enable", "Skip"]), 2, NEUTRAL_SELECT_THEME);
      list.onSelect = (item) => {
        if (item.value === "0") {
          observabilityPresetStep();
        } else {
          saveObservabilityConfig({ enabled: false });
          finish({ provider: chosenProvider, cancelled: false });
        }
      };
      list.onCancel = () => {
        saveObservabilityConfig({ enabled: false });
        finish({ provider: chosenProvider, cancelled: false });
      };
      showStep(new TitledOverlay(HEADING("enable observability?"), list));
    }

    function observabilityPresetStep(): void {
      const list = new SelectList(
        selectItems(["New Relic", "Custom (any OTLP/HTTP backend)"]),
        2,
        NEUTRAL_SELECT_THEME,
      );
      list.onSelect = (item) => {
        if (item.value === "0") newRelicKeyStep();
        else customEndpointStep();
      };
      showStep(new TitledOverlay(HEADING("choose an observability backend"), list));
    }

    function newRelicKeyStep(): void {
      const input = new Input();
      input.onSubmit = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return;
        newRelicRegionStep(trimmed);
      };
      showStep(new TitledOverlay(HEADING("New Relic license key"), input));
    }

    function newRelicRegionStep(licenseKey: string): void {
      const list = new SelectList(selectItems(["US", "EU"]), 2, NEUTRAL_SELECT_THEME);
      list.onSelect = (item) => {
        const region: NewRelicRegion = item.value === "0" ? "us" : "eu";
        const { otlpEndpoint, otlpHeaders } = resolveNewRelicPreset(licenseKey, region);
        saveObservabilityConfig({ enabled: true, otlpEndpoint, backendPreset: "new-relic" });
        setOtlpHeaders(otlpHeaders);
        finish({ provider: chosenProvider, cancelled: false });
      };
      showStep(new TitledOverlay(HEADING("New Relic region"), list));
    }

    function customEndpointStep(): void {
      const input = new Input();
      input.onSubmit = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return;
        customHeadersStep(trimmed, {});
      };
      showStep(new TitledOverlay(HEADING("custom OTLP/HTTP traces endpoint"), input));
    }

    function customHeadersStep(endpoint: string, headers: Record<string, string>): void {
      const input = new Input();
      input.onSubmit = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) {
          saveObservabilityConfig({
            enabled: true,
            otlpEndpoint: endpoint,
            backendPreset: "custom",
          });
          setOtlpHeaders(headers);
          finish({ provider: chosenProvider, cancelled: false });
          return;
        }
        const sep = trimmed.indexOf(":");
        if (sep === -1) return;
        const name = trimmed.slice(0, sep).trim();
        const headerValue = trimmed.slice(sep + 1).trim();
        if (!name) return;
        customHeadersStep(endpoint, { ...headers, [name]: headerValue });
      };
      showStep(
        new TitledOverlay(HEADING("headers (name: value, submit empty when done)"), input),
      );
    }

    providerStep();
    ui.start();
  });
}
