import dayjs from "dayjs";

export const transformBody = (body: Record<string, any>): any => {
  // 遍历 body 中的每个字段
  for (const key in body) {
    if (key.endsWith("At")) {
      // 使用 dayjs 将值转换为 Date 对象
      body[key] = dayjs(body[key]).toDate();
    }
  }
  return body;
};
