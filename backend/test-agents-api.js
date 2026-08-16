const http = require("http");

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  const login = await request({
    hostname: "127.0.0.1", port: 3001, path: "/api/v1/auth/login", method: "POST",
    headers: { "Content-Type": "application/json" }
  }, { email: "superadmin@vlivechat.com", password: "SuperAdmin@2024!" });

  console.log("Login status:", login.status);
  const token = login.data.token;

  const agents = await request({
    hostname: "127.0.0.1", port: 3001, path: "/api/v1/agents", method: "GET",
    headers: { "Authorization": `Bearer ${token}` }
  });

  console.log("GET /agents status:", agents.status);
  console.log("Agents count:", agents.data.length);
  console.log("Agents list:", agents.data.map(a => `${a.name} (${a.role})`));
}

run().catch(console.error);
