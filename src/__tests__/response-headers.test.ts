import { describe, it, expect } from "vitest";

import {
  setResponseHeader,
  withResponseHeaders,
} from "@/backend/response-headers";

// 一条最小的「响应」：withResponseHeaders 只碰 headers 这一格。
const makeResponse = () => ({ headers: new Headers() });

describe("response headers side channel", () => {
  it("把攒下的头写进这条响应", () => {
    const session = { userId: "u1" };
    setResponseHeader(session, "x-credits-wallet", "{}");
    const response = withResponseHeaders(makeResponse(), session);
    expect(response.headers.get("x-credits-wallet")).toBe("{}");
  });

  it("取过一次就没了 —— 同一个会话对象被复用时不会漏进下一条响应", () => {
    const session = { userId: "u1" };
    setResponseHeader(session, "x-a", "1");
    withResponseHeaders(makeResponse(), session);
    expect(
      withResponseHeaders(makeResponse(), session).headers.get("x-a"),
    ).toBe(null);
  });

  it("按会话对象分家：别人挂的头不会跑到我的响应上", () => {
    const mine = { userId: "u1" };
    const theirs = { userId: "u2" };
    setResponseHeader(theirs, "x-a", "1");
    expect(withResponseHeaders(makeResponse(), mine).headers.get("x-a")).toBe(
      null,
    );
  });

  it("同一个会话挂多个头，一起发出去", () => {
    const session = { userId: "u1" };
    setResponseHeader(session, "x-a", "1");
    setResponseHeader(session, "x-b", "2");
    const response = withResponseHeaders(makeResponse(), session);
    expect(response.headers.get("x-a")).toBe("1");
    expect(response.headers.get("x-b")).toBe("2");
  });

  it("当不了键的会话（没登录那种）当作没有，不抛", () => {
    expect(() => setResponseHeader(undefined, "x-a", "1")).not.toThrow();
    expect(
      withResponseHeaders(makeResponse(), undefined).headers.get("x-a"),
    ).toBe(null);
  });
});
