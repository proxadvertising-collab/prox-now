import { describe, expect, it } from "vitest";
import { COUNTRY_CURRENCY, currencyForCountry, parseCountryHeader, parseTimezone } from "./world";

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
});
