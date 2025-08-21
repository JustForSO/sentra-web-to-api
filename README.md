# sentra-web-to-api

一个功能强大的多AI提供商聚合服务，支持多种大语言模型和绘图模型的统一API接口。

## 项目简介

sentra-web-to-api 是一个基于 Node.js 开发的AI服务聚合器，提供OpenAI兼容的API接口，支持多个AI提供商的模型调用。项目采用模块化设计，易于扩展和维护。

## 主要特性

- **多提供商支持**: 集成多个AI服务提供商，包括Highlight、Kimi、ChatGLM、Qwen等
- **OpenAI兼容API**: 提供标准的OpenAI格式API接口
- **访问令牌认证**: 安全的Bearer Token认证机制
- **流式响应**: 支持实时流式对话响应
- **工具调用**: 支持AI工具调用（Function Calling）功能
- **绘图功能**: 支持AI图像生成服务
- **推理内容**: 支持提取AI推理过程（reasoning_content）
- **智能重试**: 内置重试机制和错误处理
- **代理支持**: 支持HTTP/HTTPS/SOCKS5代理配置

## 快速开始

### 环境要求

- Node.js >= 16.0.0
- npm 或 yarn

### 安装步骤

1. 克隆项目
```bash
git clone https://github.com/JustForSO/sentra-web-to-api.git
cd sentra-web-to-api
```

2. 安装依赖
```bash
npm install
```

3. 配置环境变量
```bash
cp .env.example .env
```

编辑 `.env` 文件，配置必要的环境变量：
```bash
# 必填：服务器访问令牌
ACCESS_TOKEN=your_secret_access_token_here

# 可选：代理配置
AI_PROXY_URL=http://127.0.0.1:7890

# 可选：服务器端口
PORT=7799
```

4. 启动服务

**方式一：直接启动（推荐用于测试）**
```bash
npm start
```

**方式二：使用PM2管理（推荐用于生产）**
```bash
# 首次安装PM2
npm install -g pm2

# 开发模式启动
npm run dev

# 生产模式启动
npm run prod

# 查看服务状态
pm2 status

# 查看日志
pm2 logs api-server

# 停止服务
npm run stop
```

**方式三：Windows批处理启动**
```bash
# 使用提供的批处理文件
nxapi.bat
```

启动成功后，服务将在 `http://localhost:7799` 运行。

## API 接口

### 认证

所有API请求都需要在请求头中包含访问令牌：
```
Authorization: Bearer your_access_token
```

### 获取模型列表

```http
GET /v1/models
```

响应格式：
```json
{
  "data": [
    {
      "id": "gpt-4o-mini",
      "object": "model",
      "created": 1626777600,
      "owned_by": "xxx",
      "supported_endpoint_types": ["openai"]
    }
  ],
  "success": true
}
```

### 聊天对话

```http
POST /v1/chat/completions
```

**基础对话请求：**
```json
{
  "model": "gpt-4o-mini",
  "messages": [
    {
      "role": "user",
      "content": "你好"
    }
  ],
  "stream": false
}
```

**工具调用请求：**
```json
{
  "model": "gpt-4o-mini",
  "messages": [
    {
      "role": "user",
      "content": "帮我查询北京的天气"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "获取指定城市的天气信息",
        "parameters": {
          "type": "object",
          "properties": {
            "city": {
              "type": "string",
              "description": "城市名称"
            }
          },
          "required": ["city"]
        }
      }
    }
  ],
  "tool_choice": "auto"
}
```

**流式响应请求：**
```json
{
  "model": "gpt-4o-mini",
  "messages": [
    {
      "role": "user",
      "content": "写一首关于春天的诗"
    }
  ],
  "stream": true
}
```

### 图像生成

```http
POST /v1/images/generations
```

请求体：
```json
{
  "prompt": "一只可爱的小猫",
  "model": "jimeng-v3",
  "n": 1,
  "size": "1024x1024"
}
```

## 配置说明

### 环境变量

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `ACCESS_TOKEN` | 是 | - | API访问令牌 |
| `PORT` | 否 | 7799 | 服务器端口 |
| `AI_PROXY_URL` | 否 | - | 代理服务器地址 |
| `AI_RETRY_MAX_RETRIES` | 否 | 2 | 最大重试次数 |
| `AI_DEFAULT_TIMEOUT_MS` | 否 | 30000 | 请求超时时间 |
| `ENABLE_REASONING_CONTENT` | 否 | true | 启用推理内容提取 |

### 代理配置

支持多种代理配置方式，优先级从高到低：
1. `AI_PROXY_URL`
2. `HTTPS_PROXY`
3. `HTTP_PROXY`
4. `ALL_PROXY`

示例：
```bash
# HTTP代理
AI_PROXY_URL=http://127.0.0.1:7890

# SOCKS5代理
ALL_PROXY=socks5://127.0.0.1:1080

# 不走代理的域名
NO_PROXY=localhost,127.0.0.1,.example.com
```

## 项目结构

```
sentra-web-to-api/
├── server/                    # 服务器核心文件
│   ├── g4f.js                # 主服务器文件
│   ├── functionCallHandler.js # 函数调用处理器
│   └── messageProcessor.js   # 消息处理器
├── utils/                     # 工具类和提供商
│   ├── providers/            # AI提供商实现
│   │   ├── ChatModels/       # 聊天模型提供商
│   │   └── DrawingModels/    # 绘图模型提供商
│   └── requests/             # 请求处理工具
├── .env.example              # 环境变量示例
├── package.json              # 项目配置
└── ecosystem.config.cjs      # PM2配置
```

## 功能特性详解

### 工具调用（Function Calling）

项目支持OpenAI标准的工具调用功能，AI可以根据用户需求调用预定义的函数：

**支持的功能：**
- 自动识别用户意图并选择合适的工具
- 解析工具调用参数
- 执行工具函数并返回结果
- 支持多轮工具调用对话

**工具调用流程：**
1. 用户发送包含工具定义的请求
2. AI分析用户需求，决定是否调用工具
3. 如需调用，AI生成工具调用请求
4. 系统执行工具函数并返回结果
5. AI基于工具结果生成最终回复

### 推理内容提取

支持从AI响应中提取推理过程：
- 自动识别 `<think>` 标签中的推理内容
- 将推理内容单独提取到 `reasoning_content` 字段
- 保持主要回复内容的简洁性

## 部署

### 使用PM2部署

```bash
# 安装PM2
npm install -g pm2

# 启动服务
npm run prod

# 查看状态
pm2 status

# 查看日志
pm2 logs api-server
```

## 常见问题

### Q: 如何获取访问令牌？
A: 访问令牌由您自定义设置，在 `.env` 文件中配置 `ACCESS_TOKEN` 即可。建议使用复杂的随机字符串。

### Q: 支持哪些模型？
A: 通过调用 `/v1/models` 接口可以获取当前支持的所有模型列表。主要支持各大厂商的对话模型。

### Q: 如何使用工具调用功能？
A: 在请求中添加 `tools` 参数定义可用工具，AI会自动判断是否需要调用。参考上面的API示例。

### Q: 如何配置代理？
A: 在 `.env` 文件中设置 `AI_PROXY_URL` 或其他代理相关环境变量。支持HTTP/HTTPS/SOCKS5代理。

### Q: 服务启动失败怎么办？
A: 检查以下配置：
- 确保 `ACCESS_TOKEN` 已在 `.env` 文件中设置
- 检查端口 7799 是否被占用
- 确认 Node.js 版本 >= 16.0.0
- 查看控制台错误日志定位问题

### Q: 如何查看服务运行状态？
A: 使用 PM2 管理时可通过 `pm2 status` 和 `pm2 logs api-server` 查看状态和日志。

## 许可证

本项目采用 MIT 许可证，详见 [LICENSE](LICENSE) 文件。

## 贡献

欢迎提交 Issue 和 Pull Request 来改进项目。