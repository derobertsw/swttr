// Fixture generation only (fixtures.mjs): the projections never authenticate.
export function auth() {
  throw new Error('No Clerk session in the #235 fixture generator');
}
