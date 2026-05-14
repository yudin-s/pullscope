import {
  ChangedFile,
  PullRequestData,
} from "../github/types";

export const demoPullRequestData: PullRequestData = {
  metadata: {
    owner: "acme-corp",
    repo: "payments-service",
    number: 318,
    title: "Harden API auth, bump dependencies, and update deployment manifests",
    url: "https://api.github.com/repos/acme-corp/payments-service/pulls/318",
    htmlUrl: "https://github.com/acme-corp/payments-service/pull/318",
    state: "open",
    createdAt: "2026-04-27T10:12:00Z",
    updatedAt: "2026-05-13T14:18:00Z",
    author: {
      login: "dev-skyline",
      id: "a1c6f1",
      htmlUrl: "https://github.com/dev-skyline",
      avatarUrl: "https://avatars.githubusercontent.com/u/0000?v=4",
    },
    additions: 742,
    deletions: 311,
    changedFilesCount: 7,
    commits: 3,
    comments: 2,
    isDraft: false,
    baseRef: "main",
    headRef: "feat/edge-auth-hardening",
    baseSha: "c1a2b3c4d5e6f7a8b9c0",
    headSha: "9f8e7d6c5b4a3e2d1f0",
  },
  files: [
    {
      filename: "package.json",
      status: "modified",
      additions: 8,
      deletions: 2,
      changes: 10,
      patch:
        "-  \"axios\": \"^0.26.1\",\n+  \"axios\": \"^1.6.8\",\n-  \"jsonwebtoken\": \"^9.0.0\",\n+  \"jsonwebtoken\": \"^9.0.2\"",
      blobUrl:
        "https://github.com/acme-corp/payments-service/raw/main/package.json",
      rawUrl:
        "https://raw.githubusercontent.com/acme-corp/payments-service/main/package.json",
      contentsUrl:
        "https://api.github.com/repos/acme-corp/payments-service/contents/package.json",
      sha: "pkg-json-sha-1",
    },
    {
      filename: "package-lock.json",
      status: "modified",
      additions: 512,
      deletions: 190,
      changes: 702,
      patch: "Lockfile updated to pin updated transitive dependencies.",
      blobUrl:
        "https://github.com/acme-corp/payments-service/raw/main/package-lock.json",
      rawUrl:
        "https://raw.githubusercontent.com/acme-corp/payments-service/main/package-lock.json",
      contentsUrl:
        "https://api.github.com/repos/acme-corp/payments-service/contents/package-lock.json",
      sha: "lock-json-sha-1",
    },
    {
      filename: "src/security/jwt.ts",
      status: "modified",
      additions: 98,
      deletions: 26,
      changes: 124,
      patch:
        "Added strict algorithm checks and removed fallback to HS256 in non-test flows.",
      blobUrl:
        "https://github.com/acme-corp/payments-service/raw/main/src/security/jwt.ts",
      rawUrl:
        "https://raw.githubusercontent.com/acme-corp/payments-service/main/src/security/jwt.ts",
      contentsUrl:
        "https://api.github.com/repos/acme-corp/payments-service/contents/src/security/jwt.ts",
      sha: "jwt-ts-sha-1",
    },
    {
      filename: "infra/terraform/main.tf",
      status: "added",
      additions: 72,
      deletions: 0,
      changes: 72,
      patch:
        "Added VPC endpoint and stricter SG ingress policy for api gateway.",
      blobUrl:
        "https://github.com/acme-corp/payments-service/raw/main/infra/terraform/main.tf",
      rawUrl:
        "https://raw.githubusercontent.com/acme-corp/payments-service/main/infra/terraform/main.tf",
      contentsUrl:
        "https://api.github.com/repos/acme-corp/payments-service/contents/infra/terraform/main.tf",
      sha: "tf-main-sha-1",
    },
    {
      filename: "infra/nginx/conf.d/app.conf",
      status: "modified",
      additions: 20,
      deletions: 18,
      changes: 38,
      patch:
        "Updated TLS protocol requirements and added HSTS and security headers.",
      blobUrl:
        "https://github.com/acme-corp/payments-service/raw/main/infra/nginx/conf.d/app.conf",
      rawUrl:
        "https://raw.githubusercontent.com/acme-corp/payments-service/main/infra/nginx/conf.d/app.conf",
      contentsUrl:
        "https://api.github.com/repos/acme-corp/payments-service/contents/infra/nginx/conf.d/app.conf",
      sha: "nginx-conf-sha-1",
    },
    {
      filename: "src/api/payment.test.ts",
      status: "removed",
      additions: 0,
      deletions: 120,
      changes: 120,
      patch: "Old integration tests were removed with migration to another suite.",
      blobUrl:
        "https://github.com/acme-corp/payments-service/raw/main/src/api/payment.test.ts",
      rawUrl:
        "https://raw.githubusercontent.com/acme-corp/payments-service/main/src/api/payment.test.ts",
      contentsUrl:
        "https://api.github.com/repos/acme-corp/payments-service/contents/src/api/payment.test.ts",
      sha: "test-ts-sha-1",
    },
    {
      filename: "src/api/payment.spec.ts",
      status: "added",
      additions: 112,
      deletions: 0,
      changes: 112,
      patch:
        "Added replacement auth + edge-case coverage for token rotation.",
      blobUrl:
        "https://github.com/acme-corp/payments-service/raw/main/src/api/payment.spec.ts",
      rawUrl:
        "https://raw.githubusercontent.com/acme-corp/payments-service/main/src/api/payment.spec.ts",
      contentsUrl:
        "https://api.github.com/repos/acme-corp/payments-service/contents/src/api/payment.spec.ts",
      sha: "spec-ts-sha-1",
    },
  ] as ChangedFile[],
};
