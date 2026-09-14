/** The launching console's color suppression must not leak into GUI terminals. */
export function guiTerminalEnvironment(baseEnv) {
  const env = { ...baseEnv };
  for (const key of Object.keys(env)) {
    if (key.toUpperCase() === "NO_COLOR") delete env[key];
  }
  return env;
}

// Keep the development runner's existing import compatible.
export const devElectronEnvironment = guiTerminalEnvironment;
