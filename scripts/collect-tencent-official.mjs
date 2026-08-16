process.env.COMPANY_SOURCE_ORDINALS = "70";
process.argv.push("--once");
await import("../dist-worker/index.js");
