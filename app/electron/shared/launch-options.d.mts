export type LaunchOptions = {
  executable: string;
  args: string[];
  env: Array<{ name: string; value: string }>;
};
export type LaunchOptionsProblem = "path" | "limits" | "args" | "managedArgs" | "envName" | "envReserved" | "envValue" | "envDuplicate";
export function normalizeLaunchOptions(raw: unknown): LaunchOptions | undefined;
export function launchOptionsProblem(raw: unknown): LaunchOptionsProblem | null;
export function isProtectedLaunchEnvironment(name: string): boolean;
