import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { POST } from "./route";

const state = vi.hoisted(() => ({ client: null as unknown, tables: {} as Record<string, Record<string, unknown>[]> }));

vi.mock("@/lib/supabase", () => ({ getSupabase: () => state.client }));
vi.mock("@/lib/auth", () => ({ getAuthUserId: async () => "user_1" }));

type Row = Record<string, unknown>;

const failedInsert = (code: string) => ({
  select: () => ({ single: async () => ({ data: null, error: { code } }) }),
});

/**
 * The fake client, with user_custom_items' one-per-type unique constraint.
 * `failWardrobeInsert` makes adding the wardrobe entry fail.
 */
function fakeClient(
  tables: Record<string, Row[]>,
  { failWardrobeInsert = false, beforeWardrobeInsert }: { failWardrobeInsert?: boolean; beforeWardrobeInsert?: () => void } = {}
) {
  const client = createFakeSupabase(tables);
  const sameType = (a: Row, b: Row) =>
    ["user_id", "body_part", "layer_type", "generic_option"].every((key) => a[key] === b[key]);
  return {
    from(table: string) {
      const query = client.from(table);
      const insert = query.insert.bind(query);
      if (table === "user_wardrobe" && failWardrobeInsert) {
        return Object.assign(query, { insert: () => failedInsert("08006") });
      }
      if (table === "user_wardrobe" && beforeWardrobeInsert) {
        return Object.assign(query, {
          insert: (values: Row) => {
            beforeWardrobeInsert();
            // user_wardrobe is unique per (user, item_type, item_id).
            const taken = tables.user_wardrobe.some((row) =>
              ["user_id", "item_type", "item_id"].every((key) => row[key] === values[key])
            );
            return taken ? failedInsert("23505") : insert(values);
          },
        });
      }
      if (table !== "user_custom_items") return query;
      return Object.assign(query, {
        insert: (values: Row) =>
          tables.user_custom_items.some((row) => sameType(row, values)) ? failedInsert("23505") : insert(values),
      });
    },
  };
}

beforeEach(() => {
  state.tables = { user_custom_items: [], user_wardrobe: [] };
  state.client = fakeClient(state.tables);
});

const snowShell = { user_id: "user_1", body_part: "torso", layer_type: "outer", generic_option: "Snow Shell" };

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/wardrobe/custom", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/wardrobe/custom", () => {
  it("returns the new wardrobe entry with its estimated details", async () => {
    const res = await post({
      body_part: "torso",
      layer_type: "outer",
      generic_option: "Snow Shell",
      custom_name: "  Old ski jacket ",
    });

    expect(res.status).toBe(201);
    const { item } = await res.json();
    expect(item).toMatchObject({
      item_type: "custom",
      disabled: false,
      details: {
        brand: "Custom",
        model_name: "Old ski jacket",
        body_part: "torso",
        layer_type: "outer",
        generic_option: "Snow Shell",
        rcl_clo: 0.25,
      },
    });
    expect(state.tables.user_wardrobe).toEqual([
      expect.objectContaining({ id: item.id, item_type: "custom", item_id: item.item_id, user_id: "user_1" }),
    ]);
  });

  it("reuses a removed custom item of the same type under the new name", async () => {
    state.tables.user_custom_items.push({ id: "c1", ...snowShell, custom_name: "Old shell", rcl_clo: 0.25 });

    const res = await post({ ...snowShell, custom_name: "New shell" });

    expect(res.status).toBe(201);
    expect((await res.json()).item).toMatchObject({ item_id: "c1", details: { model_name: "New shell" } });
    expect(state.tables.user_custom_items).toEqual([expect.objectContaining({ id: "c1", custom_name: "New shell" })]);
    expect(state.tables.user_wardrobe).toEqual([expect.objectContaining({ item_type: "custom", item_id: "c1" })]);
  });

  it("refuses a second custom item of a type that's still in the wardrobe", async () => {
    state.tables.user_custom_items.push({ id: "c1", ...snowShell, custom_name: "Old shell", rcl_clo: 0.25 });
    state.tables.user_wardrobe.push({ id: "w1", user_id: "user_1", item_type: "custom", item_id: "c1" });

    const res = await post({ ...snowShell, custom_name: "New shell" });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already has a custom snow shell outer layer/);
    expect(state.tables.user_custom_items[0].custom_name).toBe("Old shell");
  });

  it("deletes the item it created when the wardrobe entry can't be added", async () => {
    state.client = fakeClient(state.tables, { failWardrobeInsert: true });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await post({ ...snowShell, custom_name: "New shell" });

    expect(res.status).toBe(500);
    expect(state.tables.user_custom_items).toEqual([]);
  });

  it("keeps a reused item, under its old name, when the wardrobe entry can't be added", async () => {
    state.tables.user_custom_items.push({ id: "c1", ...snowShell, custom_name: "Old shell", rcl_clo: 0.25 });
    state.client = fakeClient(state.tables, { failWardrobeInsert: true });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await post({ ...snowShell, custom_name: "New shell" });

    expect(res.status).toBe(500);
    expect(state.tables.user_custom_items).toEqual([expect.objectContaining({ id: "c1", custom_name: "Old shell" })]);
  });

  it("leaves a reused item alone when a concurrent request re-added it first", async () => {
    state.tables.user_custom_items.push({ id: "c1", ...snowShell, custom_name: "Old shell", rcl_clo: 0.25 });
    // The other request renames the item and adds it while this one is running.
    state.client = fakeClient(state.tables, {
      beforeWardrobeInsert: () => {
        state.tables.user_custom_items[0].custom_name = "Their shell";
        state.tables.user_wardrobe.push({ id: "w9", user_id: "user_1", item_type: "custom", item_id: "c1" });
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await post({ ...snowShell, custom_name: "New shell" });

    expect(res.status).toBe(409);
    expect(state.tables.user_custom_items[0].custom_name).toBe("Their shell");
  });

  it("rejects an option that doesn't exist for the body area", async () => {
    const res = await post({ body_part: "legs", layer_type: "mid", generic_option: "Sweater", custom_name: "Sweater" });

    expect(res.status).toBe(400);
    expect(state.tables.user_custom_items).toEqual([]);
  });
});
