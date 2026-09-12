import { expect, it } from "vitest";
import { matchesSessionSearch } from "./sessionSearch";
it("matches names and partial Windows/SSH paths using either separator", () => {
 expect(matchesSessionSearch(" k:/ai/multi ", "Session", "K:\\AI\\MultiAgent")).toBe(true);
 expect(matchesSessionSearch("AI\\Multi", "K:/AI/MultiAgent")).toBe(true);
 expect(matchesSessionSearch("game/server", "main", "/home/user/game/server")).toBe(true);
 expect(matchesSessionSearch("weather", "Weather session")).toBe(true);
 expect(matchesSessionSearch("missing", "main", undefined, "K:/AI/MultiAgent")).toBe(false);
});
