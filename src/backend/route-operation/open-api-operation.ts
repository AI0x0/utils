import type { routeOperation } from "@ai0x0/next-rest-framework";

export type RouteOpenApiOperation = NonNullable<
  Parameters<typeof routeOperation>[0]["openApiOperation"]
>;

export function createOpenApiOperation({
  defaultTags,
  openApiOperation,
}: {
  defaultTags: string[];
  openApiOperation?: RouteOpenApiOperation;
}): RouteOpenApiOperation {
  return {
    tags: defaultTags,
    ...openApiOperation,
  };
}
