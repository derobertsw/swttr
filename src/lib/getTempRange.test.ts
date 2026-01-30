import { describe, it, expect } from "vitest";
import { getTempRange, getAdjustedTempRange, TEMP_BRACKETS } from "./getTempRange";

describe("getTempRange", () => {
  describe("extreme cold temperatures", () => {
    it("should return -20--15 for temperatures below -15", () => {
      expect(getTempRange(-20)).toBe("-20--15");
      expect(getTempRange(-16)).toBe("-20--15");
      expect(getTempRange(-100)).toBe("-20--15");
    });

    it("should return -15--10 for temperatures from -15 to -11", () => {
      expect(getTempRange(-15)).toBe("-15--10");
      expect(getTempRange(-11)).toBe("-15--10");
    });

    it("should return -10--5 for temperatures from -10 to -6", () => {
      expect(getTempRange(-10)).toBe("-10--5");
      expect(getTempRange(-6)).toBe("-10--5");
    });

    it("should return -5-0 for temperatures from -5 to -1", () => {
      expect(getTempRange(-5)).toBe("-5-0");
      expect(getTempRange(-1)).toBe("-5-0");
    });
  });

  describe("cold temperatures", () => {
    it("should return 0-5 for temperatures from 0 to 4", () => {
      expect(getTempRange(0)).toBe("0-5");
      expect(getTempRange(4)).toBe("0-5");
    });

    it("should return 5-10 for temperatures from 5 to 9", () => {
      expect(getTempRange(5)).toBe("5-10");
      expect(getTempRange(9)).toBe("5-10");
    });

    it("should return 10-15 for temperatures from 10 to 14", () => {
      expect(getTempRange(10)).toBe("10-15");
      expect(getTempRange(14)).toBe("10-15");
    });
  });

  describe("moderate temperatures", () => {
    it("should return 15-20 for temperatures from 15 to 19", () => {
      expect(getTempRange(15)).toBe("15-20");
      expect(getTempRange(19)).toBe("15-20");
    });

    it("should return 20-25 for temperatures from 20 to 24", () => {
      expect(getTempRange(20)).toBe("20-25");
      expect(getTempRange(24)).toBe("20-25");
    });

    it("should return 25-30 for temperatures from 25 to 29", () => {
      expect(getTempRange(25)).toBe("25-30");
      expect(getTempRange(29)).toBe("25-30");
    });
  });

  describe("warm temperatures", () => {
    it("should return 30-35 for temperatures from 30 to 34", () => {
      expect(getTempRange(30)).toBe("30-35");
      expect(getTempRange(34)).toBe("30-35");
    });

    it("should return 35-40 for temperatures from 35 to 39", () => {
      expect(getTempRange(35)).toBe("35-40");
      expect(getTempRange(39)).toBe("35-40");
    });

    it("should return 40+ for temperatures 40 and above", () => {
      expect(getTempRange(40)).toBe("40+");
      expect(getTempRange(50)).toBe("40+");
      expect(getTempRange(100)).toBe("40+");
    });
  });

  describe("boundary conditions", () => {
    it("should handle exact boundary values correctly", () => {
      expect(getTempRange(-15)).toBe("-15--10");
      expect(getTempRange(-10)).toBe("-10--5");
      expect(getTempRange(-5)).toBe("-5-0");
      expect(getTempRange(0)).toBe("0-5");
      expect(getTempRange(5)).toBe("5-10");
      expect(getTempRange(10)).toBe("10-15");
      expect(getTempRange(15)).toBe("15-20");
      expect(getTempRange(20)).toBe("20-25");
      expect(getTempRange(25)).toBe("25-30");
      expect(getTempRange(30)).toBe("30-35");
      expect(getTempRange(35)).toBe("35-40");
      expect(getTempRange(40)).toBe("40+");
    });
  });

  describe("decimal temperatures", () => {
    it("should handle decimal values correctly", () => {
      expect(getTempRange(4.9)).toBe("0-5");
      expect(getTempRange(5.0)).toBe("5-10");
      expect(getTempRange(-0.1)).toBe("-5-0");
      expect(getTempRange(0.0)).toBe("0-5");
    });
  });
});

describe("getAdjustedTempRange", () => {
  describe("neutral sensitivity", () => {
    it("should return the same bracket as getTempRange", () => {
      expect(getAdjustedTempRange(25, "neutral")).toBe("25-30");
      expect(getAdjustedTempRange(10, "neutral")).toBe("10-15");
      expect(getAdjustedTempRange(-5, "neutral")).toBe("-5-0");
    });
  });

  describe("hot sensitivity (shift warmer = lighter gear)", () => {
    it("should shift to a warmer bracket", () => {
      expect(getAdjustedTempRange(25, "hot")).toBe("30-35");
      expect(getAdjustedTempRange(10, "hot")).toBe("15-20");
      expect(getAdjustedTempRange(0, "hot")).toBe("5-10");
    });

    it("should not exceed the maximum bracket", () => {
      expect(getAdjustedTempRange(45, "hot")).toBe("40+");
      expect(getAdjustedTempRange(40, "hot")).toBe("40+");
    });
  });

  describe("cold sensitivity (shift colder = warmer gear)", () => {
    it("should shift to a colder bracket", () => {
      expect(getAdjustedTempRange(25, "cold")).toBe("20-25");
      expect(getAdjustedTempRange(10, "cold")).toBe("5-10");
      expect(getAdjustedTempRange(0, "cold")).toBe("-5-0");
    });

    it("should not go below the minimum bracket", () => {
      expect(getAdjustedTempRange(-20, "cold")).toBe("-20--15");
      expect(getAdjustedTempRange(-50, "cold")).toBe("-20--15");
    });
  });

  describe("edge cases", () => {
    it("should handle boundary temperatures with adjustments", () => {
      expect(getAdjustedTempRange(5, "hot")).toBe("10-15");
      expect(getAdjustedTempRange(5, "cold")).toBe("0-5");
    });
  });
});

describe("TEMP_BRACKETS", () => {
  it("should have 13 brackets", () => {
    expect(TEMP_BRACKETS.length).toBe(13);
  });

  it("should be in ascending order", () => {
    expect(TEMP_BRACKETS[0]).toBe("-20--15");
    expect(TEMP_BRACKETS[TEMP_BRACKETS.length - 1]).toBe("40+");
  });
});
