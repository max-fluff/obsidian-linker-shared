'use strict';

// The root placeholder a deep link stores instead of an absolute path, so a note stays
// portable and the machine-specific root is filled in on render and on click.
//
// Both sigil plugins used to spell it `{root}` and both filled it with their own root, so
// with the pair installed whichever post-processor ran first won and the other plugin's
// links resolved against the wrong tree. The token is namespaced per plugin to make a link
// say who it belongs to.
//
// The bare `{root}` stays readable forever: notes already carry it, and rewriting someone's
// vault is not a migration anyone asked for. A legacy token is claimed only when the caller
// can show the link is theirs — from its binding, from being the only linker installed, or
// from the path resolving under their root. When nobody can show it, the link is left as it
// is rather than guessed at.

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

// Substitute the absolute root for the token this owner is responsible for. Another
// plugin's token is left untouched, which is the whole point.
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
