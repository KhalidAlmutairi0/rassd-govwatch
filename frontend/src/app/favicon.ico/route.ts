export function GET(request: Request) {
  return Response.redirect(new URL("/union.png", request.url), 308);
}
