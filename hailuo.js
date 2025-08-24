// request.mjs
import fs from "fs";
import path from "path";

// 请求函数
async function requestTTS({
  url = "http://localhost:8000/v1/audio/speech",
  model = "hailuo",
  input = "你是谁啊？最近在干嘛呀",
  voice = "Hutao_hailuo",
  outputFile = "output.mp3",
}) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        'Authorization': "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NTk0NzMxMDYsInVzZXIiOnsiaWQiOiIxODk1NTY2Njc0ODkxODk4OTAiLCJuYW1lIjoi5bCP6J665bi9IiwiYXZhdGFyIjoiaHR0cHM6Ly9jZG4uaGFpbHVvYWkuY29tL3Byb2QvdXNlcl9hdmF0YXIvMTcwNjI2NzcxMTI4Mjc3MDg3Mi0xNzMxOTQ1NzA2Njg5NjU4OTZvdmVyc2l6ZS5wbmciLCJkZXZpY2VJRCI6IjQxNTkxMTA5MjY1MTk3NDY1NiIsImlzQW5vbnltb3VzIjpmYWxzZX19.pScSExvBIGAHd3Z0dJTTQL2Ypu7bcvLy7KgD3-JVwr8"
      },
      body: JSON.stringify({
        model,
        input,
        voice,
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP error: ${res.status} ${res.statusText}`);
    }

    // 拿到二进制音频流
    const buffer = Buffer.from(await res.arrayBuffer());

    // 保存为mp3
    const outPath = path.resolve(process.cwd(), outputFile);
    fs.writeFileSync(outPath, buffer);
    console.log(`✅ 音频已保存为 ${outPath}`);
  } catch (err) {
    console.error("请求失败:", err);
  }
}

// 示例调用
requestTTS({
  input: "你好，现在几点了？",
  outputFile: "speech.mp3",
});
