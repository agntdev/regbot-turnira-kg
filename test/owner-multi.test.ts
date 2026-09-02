import { describe, expect, it } from "vitest";
import { isOwner } from "../src/toolkit/owner.js";

describe("multi-organizer ownership", () => {
  it("accepts every numeric id configured in ADMIN_CHAT_ID", () => {
    expect(isOwner({ env: { ADMIN_CHAT_ID: "99, 100; 101" }, from: { id: 100 } })).toBe(true);
    expect(isOwner({ env: { ADMIN_CHAT_ID: "99, 100; 101" }, from: { id: 102 } })).toBe(false);
  });
});
