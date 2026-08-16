const payload = JSON.stringify({email:"superadmin@vlivechat.com",password:"SuperAdmin@2024!"});
const http = require("http");
const req = http.request({hostname:"127.0.0.1",port:3001,path:"/api/v1/auth/login",method:"POST",headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(payload)}},(res)=>{let d="";res.on("data",c=>d+=c);res.on("end",()=>{const j=JSON.parse(d);console.log("Status:",res.statusCode);console.log("Token:",j.token?"OK ("+j.token.slice(0,20)+"...)":"MISSING");console.log("Role:",j.agent?.role);console.log("Agent:",j.agent?.name);})});
req.on("error",e=>console.error("ERROR:",e.message));
req.write(payload);req.end();
