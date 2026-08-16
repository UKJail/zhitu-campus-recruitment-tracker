const names = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
console.log(JSON.stringify(Object.fromEntries(names.map((name) => [name, { present: Object.hasOwn(process.env, name), populated: Boolean(process.env[name]), length: process.env[name]?.length || 0 }])), null, 2));
