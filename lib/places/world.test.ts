import { describe, expect, it } from "vitest";
import { COUNTRY_CURRENCY, currencyForCountry, parseCountryHeader, parseTimezone, timezoneFromPoint } from "./world";

describe("worldwide shop fields", () => {
  it("covers at least 40 countries and does not guess a currency", () => {
    expect(Object.keys(COUNTRY_CURRENCY).length).toBeGreaterThanOrEqual(40);
    expect(currencyForCountry("US")).toBe("USD");
    expect(currencyForCountry("TH")).toBe("THB");
    expect(currencyForCountry("DE")).toBe("EUR");
    expect(currencyForCountry(null)).toBeNull();
    expect(currencyForCountry("ZZ")).toBeNull();
    expect(currencyForCountry("")).toBeNull();
  });

  it("reads a country from the edge header and rejects unknown codes", () => {
    expect(parseCountryHeader("us")).toBe("US");
    expect(parseCountryHeader(" TH ")).toBe("TH");
    expect(parseCountryHeader(null)).toBeNull();
    expect(parseCountryHeader("")).toBeNull();
    expect(parseCountryHeader("USA")).toBeNull();
    expect(parseCountryHeader("XX")).toBeNull();
    expect(parseCountryHeader("T1")).toBeNull();
  });

  it("accepts only IANA timezones from the runtime", () => {
    expect(parseTimezone("America/New_York")).toBe("America/New_York");
    expect(parseTimezone("Asia/Bangkok")).toBe("Asia/Bangkok");
    expect(parseTimezone("Not/AZone")).toBeNull();
    expect(parseTimezone("")).toBeNull();
    expect(parseTimezone(12)).toBeNull();
    expect(parseTimezone(null)).toBeNull();
  });

  it("reads an IANA zone from a point and drops ocean or bad numbers", () => {
    expect(timezoneFromPoint(12.5684, 99.9577)).toBe("Asia/Bangkok");
    expect(timezoneFromPoint(-8.65, 115.22)).toBe("Asia/Makassar");
    expect(timezoneFromPoint(40.7128, -74.006)).toBe("America/New_York");
    expect(timezoneFromPoint(0, -40)).toBeNull();
    expect(timezoneFromPoint(Number.NaN, 10)).toBeNull();
    expect(timezoneFromPoint(12, Number.POSITIVE_INFINITY)).toBeNull();
  });
});
