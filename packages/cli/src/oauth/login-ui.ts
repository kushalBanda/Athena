import { promptForCode } from "./interaction.js";

export interface LoginUI {
  info(message: string): void;

  promptCode(message: string, signal: AbortSignal): Promise<string | null>;
}

export const consoleLoginUI: LoginUI = {
  info: (message) => console.log(message),
  promptCode: (message, signal) => promptForCode(message, signal),
};
