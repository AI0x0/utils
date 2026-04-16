import { describe, it, expect } from "vitest";
import { transformBody } from "@/backend/actions/transform-body";

describe("transformBody", () => {
  it("将 *At 字段转换为 Date 对象", () => {
    const input = { createdAt: "2024-01-01T00:00:00Z", name: "test" };
    const result = transformBody(input);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.name).toBe("test");
  });

  it("同时处理多个 *At 字段", () => {
    const input = {
      createdAt: "2024-01-01",
      updatedAt: "2024-06-01",
      title: "hello",
    };
    const result = transformBody(input);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
    expect(result.title).toBe("hello");
  });

  it("不影响不以 At 结尾的字段", () => {
    const input = { name: "foo", count: 42, active: true };
    const result = transformBody(input);
    expect(result).toEqual({ name: "foo", count: 42, active: true });
  });

  it("空对象直接返回", () => {
    expect(transformBody({})).toEqual({});
  });

  it("日期值转换正确", () => {
    const dateStr = "2024-03-15T12:00:00Z";
    const result = transformBody({ accessedAt: dateStr });
    expect((result.accessedAt as unknown as Date).toISOString()).toBe(
      new Date(dateStr).toISOString(),
    );
  });
});
