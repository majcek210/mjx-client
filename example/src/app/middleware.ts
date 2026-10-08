import type { Middleware } from "mjx-client";

const log: Middleware = async (ctx, next) => {
  const started = Date.now();
  await next();
  console.log(`${ctx.interaction.user.tag} ${ctx.kind} ${ctx.name} ${Date.now() - started}ms`);
};

export default [log];
