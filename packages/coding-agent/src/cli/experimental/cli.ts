import { type ClientCommandContext, clientCommand } from "./commands/client.ts";
import { type AthenaCommandContext, athenaCommand } from "./commands/athena.ts";
import { type ServerCommandContext, serverCommand } from "./commands/server.ts";

export type ExperimentalCliContext = AthenaCommandContext & ServerCommandContext & ClientCommandContext;

export const experimentalCli = athenaCommand.command(serverCommand).command(clientCommand);
