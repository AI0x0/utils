// HttpError 与 pg 那套是同一个类，没有任何方言相关的东西 —— 从前这里是逐字抄的一份副本，
// 于是「同一个错误」在两棵树里是两个类：`instanceof` 互不认，而 handleOperationError 判的是
// `error.name === "HttpError"`，副本恰好蒙混过关，所以这份重复一直没被发现。
//
// 现在直接转出去。sqlite 的调用方仍然从 `@/backend/sqlite/errors` 引，import 路径不用改。
export { HttpError } from "@/backend/errors";
