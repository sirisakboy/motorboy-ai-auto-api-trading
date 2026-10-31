# Security Specification

## 1. Data Invariants
- /sessions/{sessionId} must be read-only for all users.
- Writes to /sessions/ are forbidden.

## 2. The "Dirty Dozen" Payloads (for sessions collection)
1. create /sessions/new: { title: "New Session" } -> PERMISSION_DENIED
2. update /sessions/global: { title: "Hacked" } -> PERMISSION_DENIED
3. delete /sessions/global -> PERMISSION_DENIED
4. list /sessions -> PERMISSION_DENIED (or restricted)

## 3. Test Runner (Conceptual)
// firestore.rules.test.ts
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

// ... (tests for the above 4 cases)
