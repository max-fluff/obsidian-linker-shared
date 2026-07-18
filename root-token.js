'use strict';

// The root placeholder a deep link stores instead of an absolute path, namespaced per
// plugin so a link says who it belongs to. The bare legacy `{root}` stays readable forever;
// it is claimed only when the caller can show the link is theirs (binding, solo install, or
// path resolving under their root), and left alone otherwise.

const OWNER_TOKENS = { code: 'code-root', reference: 'ref-root' };
const LEGACY_TOKEN = 'root';

// Obsidian hands a destination back either raw or percent-encoded, so both spellings of a
// token have to be recognised. `{root}` can't match inside `{code-root}`: the brace has to
// sit immediately before the name.
const tokenRe = (name) => new RegExp('\\{' + name + '\\}|%7B' + name + '%7D', 'gi');

// Which owner's token `url` carries: an owner id, 'legacy' for the un-namespaced `{root}`,
// or null when there is no token at all.
function rootTokenIn(url) {
  const s = String(url == null ? '' : url);
  for (const owner of Object.keys(OWNER_TOKENS)) {
    if (tokenRe(OWNER_TOKENS[owner]).test(s)) return owner;
  }
  return tokenRe(LEGACY_TOKEN).test(s) ? 'legacy' : null;
}

// Whether `url` carries a token `owner` is allowed to fill. `claimLegacy` is the caller's
// verdict on an un-namespaced token — see the note above on how that is established.
function ownsRootToken(url, owner, claimLegacy) {
  const found = rootTokenIn(url);
  if (found === owner) return true;
  return found === 'legacy' && !!claimLegacy;
}

// Substitute the absolute root for the token this owner is responsible for; another
// plugin's token is left untouched.
function fillRoot(url, { owner, root, claimLegacy = false } = {}) {
  const s = String(url == null ? '' : url);
  if (!owner || !OWNER_TOKENS[owner]) return s;
  let out = s.replace(tokenRe(OWNER_TOKENS[owner]), root);
  if (claimLegacy) out = out.replace(tokenRe(LEGACY_TOKEN), root);
  return out;
}

// Rewrite a legacy `{root}` into this owner's namespaced token — the one-time migration a
// note goes through once its owner is known. Already-namespaced urls are returned as they
// are, so running it twice changes nothing.
function namespaceRoot(url, owner) {
  const s = String(url == null ? '' : url);
  if (!owner || !OWNER_TOKENS[owner]) return s;
  if (rootTokenIn(s) !== 'legacy') return s;
  return s.replace(tokenRe(LEGACY_TOKEN), '{' + OWNER_TOKENS[owner] + '}');
}

module.exports = { OWNER_TOKENS, LEGACY_TOKEN, rootTokenIn, ownsRootToken, fillRoot, namespaceRoot };
