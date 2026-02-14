import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, PUT } from "./route";

// Mock Supabase
vi.mock("@/lib/supabase", () => ({
  getSupabase: vi.fn(),
}));

// Mock Clerk auth
vi.mock("@/lib/auth", () => ({
  getAuthUserId: vi.fn(),
}));

import { getSupabase } from "@/lib/supabase";
import { getAuthUserId } from "@/lib/auth";
const mockGetSupabase = vi.mocked(getSupabase);
const mockGetAuthUserId = vi.mocked(getAuthUserId);

describe("Preferences API Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authenticated user
    mockGetAuthUserId.mockResolvedValue("test-user");
  });

  describe("GET", () => {
    describe("when database is not configured", () => {
      it("should return default preferences", async () => {
        mockGetSupabase.mockReturnValue(null);

        const request = new NextRequest("http://localhost:3000/api/preferences");

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.temperatureSensitivity).toBe("neutral");
        expect(data.defaultActivity).toBe("alpine_skiing");
        expect(data.heightInches).toBeUndefined();
        expect(data.weightLbs).toBeUndefined();
      });
    });

    describe("when user ID is missing", () => {
      it("should return default preferences", async () => {
        mockGetSupabase.mockReturnValue(null);
        mockGetAuthUserId.mockResolvedValue(null);

        const request = new NextRequest("http://localhost:3000/api/preferences");

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.temperatureSensitivity).toBe("neutral");
        expect(data.defaultActivity).toBe("alpine_skiing");
        expect(data.heightInches).toBeUndefined();
        expect(data.weightLbs).toBeUndefined();
      });
    });

    describe("when database is configured", () => {
      it("should return user preferences from database", async () => {
        const mockSupabase = {
          from: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              temperature_sensitivity: "cold",
              default_activity: "xc_skiing",
              height_inches: 72,
              weight_lbs: 185,
            },
            error: null,
          }),
        };
        mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

        const request = new NextRequest("http://localhost:3000/api/preferences");

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.temperatureSensitivity).toBe("cold");
        expect(data.defaultActivity).toBe("xc_skiing");
        expect(data.heightInches).toBe(72);
        expect(data.weightLbs).toBe(185);
      });

      it("should return defaults when no user preferences exist (PGRST116)", async () => {
        const mockSupabase = {
          from: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: "PGRST116" },
          }),
        };
        mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

        const request = new NextRequest("http://localhost:3000/api/preferences");

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.temperatureSensitivity).toBe("neutral");
        expect(data.defaultActivity).toBe("alpine_skiing");
        expect(data.heightInches).toBeUndefined();
        expect(data.weightLbs).toBeUndefined();
      });

      it("should return defaults on database error", async () => {
        const mockSupabase = {
          from: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: "OTHER_ERROR", message: "Database error" },
          }),
        };
        mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

        const request = new NextRequest("http://localhost:3000/api/preferences");

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.temperatureSensitivity).toBe("neutral");
        expect(data.defaultActivity).toBe("alpine_skiing");
        expect(data.heightInches).toBeUndefined();
        expect(data.weightLbs).toBeUndefined();
      });

      it("should return defaults on exception", async () => {
        const mockSupabase = {
          from: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockRejectedValue(new Error("Connection failed")),
        };
        mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

        const request = new NextRequest("http://localhost:3000/api/preferences");

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.temperatureSensitivity).toBe("neutral");
        expect(data.defaultActivity).toBe("alpine_skiing");
        expect(data.heightInches).toBeUndefined();
        expect(data.weightLbs).toBeUndefined();
      });
    });
  });

  describe("PUT", () => {
    describe("when database is not configured", () => {
      it("should acknowledge the request with sent values", async () => {
        mockGetSupabase.mockReturnValue(null);

        const request = new NextRequest("http://localhost:3000/api/preferences", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            temperatureSensitivity: "hot",
            defaultActivity: "running",
          }),
        });

        const response = await PUT(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.temperatureSensitivity).toBe("hot");
        expect(data.defaultActivity).toBe("running");
        expect(data.heightInches).toBeUndefined();
        expect(data.weightLbs).toBeUndefined();
      });
    });

    describe("when user ID is missing", () => {
      it("should acknowledge the request with sent values", async () => {
        mockGetSupabase.mockReturnValue(null);
        mockGetAuthUserId.mockResolvedValue(null);

        const request = new NextRequest("http://localhost:3000/api/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ temperatureSensitivity: "cold" }),
        });

        const response = await PUT(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.temperatureSensitivity).toBe("cold");
        expect(data.heightInches).toBeUndefined();
        expect(data.weightLbs).toBeUndefined();
      });

      it("should acknowledge and sanitize a single body metric", async () => {
        mockGetSupabase.mockReturnValue(null);
        mockGetAuthUserId.mockResolvedValue(null);

        const request = new NextRequest("http://localhost:3000/api/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ heightInches: 71 }),
        });

        const response = await PUT(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.heightInches).toBe(71);
        expect(data.weightLbs).toBeUndefined();
      });
    });

    describe("validation", () => {
      it("should return 400 for invalid JSON", async () => {
        mockGetSupabase.mockReturnValue(null);
        mockGetAuthUserId.mockResolvedValue(null);

        const request = new NextRequest("http://localhost:3000/api/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: "invalid json",
        });

        const response = await PUT(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("Invalid JSON");
      });

      it("should return 400 for invalid temperature sensitivity", async () => {
        const mockSupabase = {
          from: vi.fn().mockReturnThis(),
          upsert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: {}, error: null }),
        };
        mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

        const request = new NextRequest("http://localhost:3000/api/preferences", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ temperatureSensitivity: "invalid" }),
        });

        const response = await PUT(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("Invalid temperature sensitivity value");
      });
    });

    describe("when database is configured", () => {
      it("should save preferences to database", async () => {
        const mockUpsert = vi.fn().mockReturnThis();
        const mockSupabase = {
          from: vi.fn().mockReturnThis(),
          upsert: mockUpsert,
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              temperature_sensitivity: "hot",
              default_activity: "biking",
            },
            error: null,
          }),
        };
        mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

        const request = new NextRequest("http://localhost:3000/api/preferences", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            temperatureSensitivity: "hot",
            defaultActivity: "biking",
          }),
        });

        const response = await PUT(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.temperatureSensitivity).toBe("hot");
        expect(data.defaultActivity).toBe("biking");
      });

      it("should return sent values on database error", async () => {
        const mockSupabase = {
          from: vi.fn().mockReturnThis(),
          upsert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "Database error" },
          }),
        };
        mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

        const request = new NextRequest("http://localhost:3000/api/preferences", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ temperatureSensitivity: "cold" }),
        });

        const response = await PUT(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.temperatureSensitivity).toBe("cold");
      });
    });
  });
});
