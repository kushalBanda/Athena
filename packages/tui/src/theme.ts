import { Chalk } from "chalk";

export interface AthenaTheme {
  status: {
    idle: (s: string) => string;
    working: (s: string) => string;
    retry: (s: string) => string;
    error: (s: string) => string;
    compaction: (s: string) => string;
  };
  text: {
    primary: (s: string) => string;
    muted: (s: string) => string;
    accent: (s: string) => string;
  };
  border: (s: string) => string;
}

const chalk = new Chalk({ level: 3 });

export const defaultTheme: AthenaTheme = {
  status: {
    idle: (s: string) => chalk.dim(s),
    working: (s: string) => chalk.cyan(s),
    retry: (s: string) => chalk.yellow(s),
    error: (s: string) => chalk.red(s),
    compaction: (s: string) => chalk.magenta(s),
  },
  text: {
    primary: (s: string) => s,
    muted: (s: string) => chalk.dim(s),
    accent: (s: string) => chalk.blue(s),
  },
  border: (s: string) => chalk.dim(s),
};
