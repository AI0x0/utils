export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

// =============================================================================
// 框架内建报错的文案 —— 默认中文，调用方可以按请求语言换掉
// =============================================================================
// 这几句是从**库内部**抛出去的（准入判定、写动作的兜底），业务自己的报错在业务代码里
// 渲染（do-tv 是 (backend)/utils/i18n 的 serverT，抛出点就地翻成请求的语言）。库不知道
// 也不该知道各项目的 i18n 栈（next-intl、react-i18next、自研…），所以不给库塞字典，
// 只留一个「抛出前问一次」的钩子：谁做国际化，谁在应用启动时注册一个解析器。
//
// 为什么不回错误码让前端翻：这些 message 的读者不只是浏览器 —— CLI 与 agent 也读它，
// 它们没有前端那套翻译层，回个码等于让它们打印一串 `errors.UNAUTHENTICATED`。在服务端
// 渲染成字符串，所有读者拿到的都是人话。
//
// 解析器按**请求**解析（语言藏在 cookie / Accept-Language 里），所以它是每次抛出时现调
// 的函数，而不是启动时钉死的一份字符串。允许 async —— 各抛出点本来就在 async 函数里，
// 而「按当前请求取翻译」在 Next 里就得 await（do-tv 的 requestText() 走 next/headers）。
export interface HttpErrorMessages {
  /** 401：会话不存在。 */
  unauthenticated: string;
  /** 403：access.can 拒绝且没给自定义文案。 */
  forbidden: string;
  /** 400：PUT / DELETE 请求体缺 id。 */
  missingId: string;
  /** 404：PUT 影响 0 行（不存在或不属于调用者）。 */
  editNotFound: string;
  /** 404：DELETE 影响 0 行。 */
  deleteNotFound: string;
  /** 403：作用域值解析不出来 —— 多半是配错了列名，但请求照样要被拒绝。 */
  scopeUnresolved: (column: string) => string;
}

export const defaultHttpErrorMessages: HttpErrorMessages = {
  unauthenticated: "未登录",
  forbidden: "没有权限",
  missingId: "缺少 id",
  editNotFound: "未找到编辑对象，或没有权限",
  deleteNotFound: "未找到删除对象，或没有权限",
  scopeUnresolved: (column) =>
    `无法确定这次请求的归属（${column}）。这不是「不做隔离」——请求被拒绝。`,
};

type HttpErrorMessageResolver = () =>
  | Partial<HttpErrorMessages>
  | Promise<Partial<HttpErrorMessages>>;

let resolver: HttpErrorMessageResolver | undefined;

/**
 * 注册文案解析器，应用启动时调一次（再次调用覆盖；传 undefined 恢复默认）。
 * 不注册就一直是 defaultHttpErrorMessages 那几句中文 —— 没做国际化的项目零感知。
 */
export function setHttpErrorMessageResolver(
  next: HttpErrorMessageResolver | undefined,
) {
  resolver = next;
}

/**
 * 取出当前生效的整份文案。**在抛出点现调**，别在模块顶层缓存 —— 解析器是按请求判
 * 语言的，缓存住就把上一个请求的语言漏给下一个。
 *
 * 解析器自己抛了错（比如语言包没加载到）就回落默认中文：报错文案出不来不该把
 * 原本那个 401/403 也吞掉。
 */
export async function httpErrorMessages(): Promise<HttpErrorMessages> {
  let overrides: Partial<HttpErrorMessages> | undefined;
  try {
    overrides = await resolver?.();
  } catch {
    overrides = undefined;
  }
  return { ...defaultHttpErrorMessages, ...overrides };
}
