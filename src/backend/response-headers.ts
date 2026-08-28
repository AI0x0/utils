// =============================================================================
// 给这次请求的响应挂一个额外的头
// =============================================================================
// 处理器深处发生了「顺带得告诉客户端」的事，而那一层够不着响应 —— 典型是扣费：扣完之后
// 新余额只有那一层知道，界面上却要立刻更新；不给条路的话，客户端只能在每次请求之后再问一遍
// 余额，或者干脆一直显示旧数。
//
// 通道是一张 WeakMap，键是**这次请求解析出来的会话对象**（getSession 每个请求回一个新的，
// 见 sessionLoader）。两个「为什么不是」：
//   · 不是 AsyncLocalStorage —— 那要求运行时开 node 兼容，而这套要能在边缘运行时里跑；
//   · 不是 req —— 业务那一层常常只拿得到会话（扣费函数收的就是它），够不着请求对象。
//
// **取一次就没了**（takeResponseHeaders 会清掉）：一个请求攒的头不该漏进下一个 —— 键虽然
// 每请求一个，但调用方完全可能把会话对象缓存起来复用。
//
// 键认不出、这次没人挂过头，一律当作没有。这是个可选的补丁，任何一步不对劲都不该影响那条
// 响应本身。

const pending = new WeakMap<object, Record<string, string>>();

/**
 * 记一个响应头，等这次请求出结果时一起发出去。
 *
 * @param owner 这次请求的会话对象 —— 处理器收到的那个 session（本库把 getSession 的返回值
 *   原样传给处理器，所以业务那边手上的就是它）。传 undefined 等于不记。
 */
export function setResponseHeader(
  owner: unknown,
  name: string,
  value: string,
): void {
  if (!isKey(owner)) {
    return;
  }
  pending.set(owner, { ...pending.get(owner), [name]: value });
}

// 会话对象长什么样由调用方定（TSession 是个不带约束的泛型），所以这两个口子收 unknown，
// 在这儿把「能不能当 WeakMap 的键」判掉 —— 让每个调用点各写一遍类型断言是把脏活外包出去。
function isKey(owner: unknown): owner is object {
  return typeof owner === "object" && owner !== null;
}

/** 取出并清空这次请求攒下的头。**工厂出口用**，业务不该调它。 */
function takeResponseHeaders(
  owner: unknown,
): Record<string, string> | undefined {
  if (!isKey(owner)) {
    return undefined;
  }
  const headers = pending.get(owner);
  if (headers) {
    pending.delete(owner);
  }
  return headers;
}

/**
 * 把这次请求攒下的头写进已经建好的那条响应。**工厂出口用**。
 *
 * 为什么是「建好之后再写」而不是建的时候一起传：TypedNextResponse.json 的第二个参数只收
 * status（见 next-rest-framework 的类型），而响应对象本身的 headers 是可写的。
 */
export function withResponseHeaders<T extends { headers: Headers }>(
  response: T,
  owner: unknown,
): T {
  const extra = takeResponseHeaders(owner);
  for (const [name, value] of Object.entries(extra ?? {})) {
    response.headers.set(name, value);
  }
  return response;
}
