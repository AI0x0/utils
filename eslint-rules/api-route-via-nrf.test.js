import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "./api-route-via-nrf.js";
const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
});
const ERROR = {
  message:
    "API 路由不许裸导 HTTP 方法，改用 next-rest-framework 的 route()/routeOperation" +
    "（export const { POST } = route({...})）。裸导的端点进不了 openapi.json，" +
    "前端与 CLI 都拿不到它的 client。",
};
describe("api-route-via-nrf", () => {
  it("reports raw HTTP method exports, allows route() destructuring", () => {
    ruleTester.run("api-route-via-nrf", rule, {
      valid: [
        { code: "export const { POST } = route({});" },
        { code: "export const { GET, POST } = route({});" },
        { code: "export function getSession() {}" },
        { code: "const POST = 1; export default POST;" },
        { code: "export const postOperation = createPostOperation({});" },
      ],
      invalid: [
        {
          code: "export async function POST(req) { return Response.json({}); }",
          errors: [ERROR],
        },
        {
          code: "export function GET() {}",
          errors: [ERROR],
        },
        {
          code: "export const GET = authHandler;",
          errors: [ERROR],
        },
        {
          code: "export const POST = async (req) => new Response();",
          errors: [ERROR],
        },
        {
          code: "export const GET = a, POST = b;",
          errors: [ERROR, ERROR],
        },
      ],
    });
  });
});
