import { describe, it, expect } from "vitest";
import {
  isObject,
  get,
  set,
  unset,
  has,
  pick,
  omit,
  deepClone,
  deepMerge,
  capitalize,
  camelCase,
  kebabCase,
  snakeCase,
  formatBytes,
  parseQuery,
  stringifyQuery,
} from "./helpers";

describe("Utils Helpers", () => {
  describe("Object Utils", () => {
    it("isObject", () => {
      expect(isObject({})).toBe(true);
      expect(isObject([])).toBe(false);
      expect(isObject(null)).toBe(false);
      expect(isObject("string")).toBe(false);
    });

    it("get", () => {
      const obj = { a: { b: { c: 1 } } };
      expect(get(obj, "a.b.c")).toBe(1);
      expect(get(obj, "a.b.x")).toBe(undefined);
      expect(get(obj, "a.b.x", "default")).toBe("default");
    });

    it("set", () => {
      const obj = {};
      set(obj, "a.b.c", 1);
      expect(obj.a.b.c).toBe(1);
    });

    it("unset", () => {
      const obj = { a: { b: 1 } };
      unset(obj, "a.b");
      expect(obj.a.b).toBe(undefined);
      expect(obj.a).toEqual({});
    });

    it("has", () => {
      const obj = { a: { b: 1 } };
      expect(has(obj, "a.b")).toBe(true);
      expect(has(obj, "a.c")).toBe(false);
    });

    it("pick", () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(pick(obj, ["a", "c"])).toEqual({ a: 1, c: 3 });
    });

    it("omit", () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(omit(obj, ["b"])).toEqual({ a: 1, c: 3 });
    });

    it("deepClone", () => {
      const obj = { a: 1, b: { c: 2 } };
      const clone = deepClone(obj);
      expect(clone).toEqual(obj);
      expect(clone).not.toBe(obj);
      expect(clone.b).not.toBe(obj.b);
    });

    it("deepMerge", () => {
      const target = { a: 1, b: { x: 1 } };
      const source = { b: { y: 2 }, c: 3 };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: 1, b: { x: 1, y: 2 }, c: 3 });
    });
  });

  describe("String Utils", () => {
    it("capitalize", () => {
      expect(capitalize("hello")).toBe("Hello");
    });

    it("camelCase", () => {
      expect(camelCase("hello-world")).toBe("helloWorld");
      expect(camelCase("hello_world")).toBe("helloWorld");
    });

    it("kebabCase", () => {
      expect(kebabCase("helloWorld")).toBe("hello-world");
      expect(kebabCase("Hello World")).toBe("hello-world");
    });

    it("snakeCase", () => {
      expect(snakeCase("helloWorld")).toBe("hello_world");
      expect(snakeCase("hello-world")).toBe("hello_world");
    });
  });

  describe("Formatting Utils", () => {
    it("formatBytes", () => {
      expect(formatBytes(1024)).toBe("1 KB");
      expect(formatBytes(1234)).toBe("1.21 KB");
      expect(formatBytes(0)).toBe("0 Bytes");
    });
  });

  describe("Query Utils", () => {
    it("parseQuery", () => {
      expect(parseQuery("a=1&b=2")).toEqual({ a: "1", b: "2" });
    });

    it("stringifyQuery", () => {
      expect(stringifyQuery({ a: 1, b: 2 })).toBe("a=1&b=2");
    });
  });
});
