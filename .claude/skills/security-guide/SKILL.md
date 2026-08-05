---
name: security-guide
description: Security audit guide, agnostic of language and framework, based on the OWASP Top 10. worktree-agent-security MUST apply it when auditing, classifying each finding by severity and citing concrete evidence before declaring it blocking - so that the lack of context of a narrow audit doesn't stall a User Story for no real reason.
---

Mandatory audit guide for `worktree-agent-security` (and for any `[security]` subtask within a mixed story). It complements (never contradicts) `CLAUDE.md`/the base repo's own rules — in case of conflict, the target project's rules win.

This guide **does not assume any particular language or framework**: the OWASP Top 10 categories and this guide's criteria apply to any stack. If the project uses a framework with known security quirks (e.g. mass assignment in some ORMs, `dangerouslySetInnerHTML` in React), add them as `## Project-specific notes` in `.orchestrator/config.md` instead of bloating this file — same criterion `patterns-and-smells` uses with its `references/`.

## Part 1 — Categories to audit (OWASP Top 10, stack-agnostic)

For every file touched or indicated by the story, check against these categories:

1. **Injection** (SQL, OS command, LDAP, XPath, NoSQL, XXE): user input reaching a query/command/parser without sanitization or without using parameters/prepared statements.
2. **Broken authentication and session**: credentials or tokens poorly validated, sessions without expiration, non-constant-time comparison of secrets.
3. **Broken access control / IDOR**: a resource identified by ID that doesn't verify the authenticated user has permission over THAT specific resource (not just that they're authenticated).
4. **Sensitive data exposure**: hardcoded secrets/credentials, sensitive data (PII, tokens, passwords) in logs, error responses that leak internal details.
5. **Cryptography misuse**: weak/obsolete algorithms (MD5/SHA1 for passwords, DES), hardcoded keys, non-cryptographic random number generation for tokens/secrets.
6. **Missing or insufficient input validation**: user data used without validating type, length, format, or range before processing it.
7. **Business logic flaws**: race conditions, TOCTOU (time-of-check-to-time-of-use, e.g. checking a balance and debiting it in separate steps without a lock/transaction).
8. **Insecure configuration**: insecure defaults, overly broad permissions, missing security headers where the project already uses them elsewhere.
9. **Vulnerable dependencies**: libraries with known CVEs added or updated by the story.
10. **Insecure code execution**: `eval`/equivalents on untrusted input, deserialization of untrusted data without validating the expected type.
11. **XSS** (if the project has a frontend/HTML rendering): user input inserted into the DOM/HTML without escaping.

## Part 2 — Severity levels (mandatory to classify every finding)

- **Blocking**: there's concrete evidence of exploitability in the audited code — you can point to the exact file/line and explain step by step how it's exploited with the information available right there. Blocks closing the story until the Orchestrator resolves it.
- **Warning**: a Part 1 pattern is present, but without proven evidence of exploitability (e.g. it's not clear how user input reaches that point, or it may be mitigated by something outside the audited zone). Still reported — doesn't block closure.

**Hard rule**: never declare something blocking just because "it matches a Part 1 pattern". If you can't cite the concrete evidence of exploitability in the code in front of you, it's a warning, not blocking — the lack of context from a narrow audit is not a reason to stall an entire story. When in doubt, warning.

**Always excluded from blocking** (low impact or known noise, unless the project says otherwise in `config.md`): denial of service, rate limiting, memory/CPU exhaustion, "missing validation" with no demonstrated impact, open redirect.

## Part 3 — Application protocol

1. **Before auditing**: check whether `.orchestrator/config.md` has `## Project-specific notes` for security — framework/stack quirks to take into account.
2. **While auditing**: go through Part 1 on the files in the indicated zone. For each finding, classify it with Part 2 and note the evidence (file/line + exploitability, or the reason it stays a warning).
3. **When reporting `FINALIZED`**: list blocking findings and warnings separately (with evidence). If there are blockers, the story **is not ready** — the Orchestrator decides how to resolve it (order a narrow fix, escalate to the implementer if it exceeds your scope, or bring it to the user if there's no way to unblock it in a few rounds). You never decide on your own that the story stays blocked indefinitely — you report, the Orchestrator resolves.

## Use by the Orchestrator

A `blocking` finding is never resolved silently: the Orchestrator reads it, and if the fix is clear, orders it via `SendMessage` (documented in `.orchestrator/decisions/DEC-NNN.md`, same as any routine correction); if after 3 rounds it's still unresolved, or it implies a business decision the Orchestrator can't make on its own (e.g. deliberately accepting a risk), it's escalated to the user — same limit already used with `worktree-reviewer`.
