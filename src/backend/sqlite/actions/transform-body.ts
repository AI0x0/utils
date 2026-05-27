import dayjs from "dayjs";

export const transformBody = <T extends Record<string, unknown>>(
  body: T,
): T => {
  for (const key in body) {
    if (key.endsWith("At")) {
      (body as Record<string, unknown>)[key] = dayjs(
        body[key] as string | number | Date,
      ).toDate();
    }
  }
  return body;
};
