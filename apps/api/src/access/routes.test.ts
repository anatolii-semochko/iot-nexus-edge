import { describe, expect, it } from "vitest";

import { ALL_PERMISSIONS } from "./catalog.js";
import { entityOf, permissionFor } from "./routes.js";

describe("permissionFor", () => {
  it("takes an exact rule first", () => {
    expect(permissionFor("PATCH", "/processes/:id/config")).toBe("processes.config");
    expect(permissionFor("POST", "/processes/:id/action")).toBe("processes.control");
    expect(permissionFor("POST", "/system/tick")).toBe("service");
    expect(permissionFor("POST", "/auth/login")).toBe("public");
  });

  it("falls back to the longest prefix, read or write", () => {
    expect(permissionFor("GET", "/processes")).toBe("processes.view");
    expect(permissionFor("DELETE", "/processes/:id")).toBe("processes.manage");
    expect(permissionFor("GET", "/service/commands")).toBe("service.view");
    expect(permissionFor("POST", "/service/commands/:id/run")).toBe("service.system");
    expect(permissionFor("POST", "/service/database/stamps")).toBe("service.database.backup");
    expect(permissionFor("GET", "/node-groups")).toBe("nodes.view");
  });

  it("gives a project package's route the dnp keys, unless it names its own", () => {
    expect(permissionFor("GET", "/aquarium/state")).toBe("dnp.view");
    expect(permissionFor("POST", "/aquarium/maintenance")).toBe("dnp.config");
    expect(permissionFor("POST", "/aquarium/maintenance", "dnp.control")).toBe("dnp.control");
  });

  it("names only catalog keys or the special values", () => {
    const special = new Set(["public", "authenticated", "service"]);
    const routes = [
      ["GET", "/processes"], ["PUT", "/devices/:id"], ["POST", "/ai/proposals/:id/:decision"], ["DELETE", "/service/database/logs"],
      ["GET", "/library/browse"], ["PATCH", "/message-levels/:type/:level"], ["GET", "/users"], ["POST", "/dnp/migrations/apply"],
    ];
    for (const [m, p] of routes) {
      const perm = permissionFor(m, p);
      expect(special.has(perm) || ALL_PERMISSIONS.includes(perm), `${m} ${p} -> ${perm}`).toBe(true);
    }
  });
});

describe("entityOf", () => {
  it("names the entity a route acts on", () => {
    expect(entityOf("/processes/:id/config", { id: "25" })).toEqual({ kind: "process", id: 25 });
    expect(entityOf("/devices/:id", { id: "7" })).toEqual({ kind: "device", id: 7 });
    expect(entityOf("/heartbeat-controls/:type/:id", { type: "node", id: "3" })).toEqual({ kind: "node", id: 3 });
    expect(entityOf("/weather-control/:processId/forecast", { processId: "11" })).toEqual({ kind: "process", id: 11 });
    expect(entityOf("/processes", {})).toBeNull();
  });
});
