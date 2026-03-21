import { describe, it, expect } from "vitest";
import {
  validateEmail,
  validatePassword,
  validateUsername,
} from "../validator";

describe("validateEmail", () => {
  it("accepts a valid email", () => {
    expect(validateEmail("user@example.com")).toBe(true);
  });

  it("rejects an email without @", () => {
    expect(validateEmail("userexample.com")).toBe(false);
  });

  it("rejects an email without domain", () => {
    expect(validateEmail("user@")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(validateEmail("")).toBe(false);
  });
});

describe("validatePassword", () => {
  it("accepts a password with 8+ chars, uppercase, lowercase, and digit", () => {
    expect(validatePassword("Secret99")).toBe(true);
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(validatePassword("Ab1")).toBe(false);
  });

  it("rejects a password without uppercase", () => {
    expect(validatePassword("lowercase1")).toBe(false);
  });

  it("rejects a password without lowercase", () => {
    expect(validatePassword("UPPERCASE1")).toBe(false);
  });

  it("rejects a password without a digit", () => {
    expect(validatePassword("NoDigits")).toBe(false);
  });
});

describe("validateUsername", () => {
  it("accepts a valid username", () => {
    expect(validateUsername("john_doe")).toBe(true);
  });

  it("rejects a username shorter than 3 characters", () => {
    expect(validateUsername("ab")).toBe(false);
  });

  it("rejects a username longer than 20 characters", () => {
    expect(validateUsername("a".repeat(21))).toBe(false);
  });

  it("rejects a username with special characters", () => {
    expect(validateUsername("user@name")).toBe(false);
  });

  it("accepts a username with numbers", () => {
    expect(validateUsername("user123")).toBe(true);
  });
});
