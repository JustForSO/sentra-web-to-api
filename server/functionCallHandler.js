/**
 * 函数调用中间层处理器
 * 处理包含 tools 参数的请求，实现函数调用功能
 */

/**
 * 这是注入给模型的系统提示模板，用于引导模型进行函数调用。
 * 它会根据客户端请求中定义的工具动态填充。
 */
const FUNCTION_CALL_PROMPT_TEMPLATE = `你可以使用以下工具来帮助你解决问题：

工具列表：

{TOOLS_LIST}

当你判断需要使用工具时，必须严格遵循以下格式：

1. 回答的第一行必须是：
FC_USE
没有任何前、尾随空格，全大写。

2. 然后，在回答的最后，请使用如下格式输出函数调用（使用 XML 语法）：

<function_call>
  <tool>tool_name</tool>
  <args>
    <key1>value1</key1>
    <key2>value2</key2>
  </args>
</function_call>

注意事项：
- 除非你确定需要调用工具，否则不要输出 FC_USE。
- 你只能调用一个工具。
- 保证输出的 XML 是有效的、严格符合上述格式。
- 不要随便更改格式。
- 你单回合只能调用一次工具。

现在请准备好遵循以上规范。`;

/**
 * 根据客户端请求中的 tools 定义，生成注入的系统提示。
 * @param tools - OpenAI 格式的工具数组
 * @returns 格式化后的系统提示字符串
 */
function generateFunctionPrompt(tools) {
  if (!tools || !Array.isArray(tools) || tools.length === 0) {
    return '';
  }

  const toolsList = tools.map((tool, index) => {
    const func = tool.function;
    const params = Object.entries(func.parameters?.properties || {})
      .map(([name, prop]) => `${name} (${prop.type})`)
      .join(', ');
    return `${index + 1}. <tool name="${func.name}" description="${func.description}">\n   参数：${params || '无'}`;
  }).join('\n\n');

  return FUNCTION_CALL_PROMPT_TEMPLATE.replace('{TOOLS_LIST}', toolsList);
}

/**
 * 解析模型输出的 Function Call XML。
 * @param xmlString - 包含 <function_call> 的 XML 字符串
 * @returns 解析后的工具名和参数对象，或 null
 */
function parseFunctionCallXml(xmlString) {
  if (!xmlString || typeof xmlString !== 'string') {
    return null;
  }

  const toolMatch = /<tool>(.*?)<\/tool>/.exec(xmlString);
  if (!toolMatch) return null;
  const name = toolMatch[1].trim();

  const args = {};
  const argsBlockMatch = /<args>([\s\S]*?)<\/args>/.exec(xmlString);
  if (argsBlockMatch) {
    const argsContent = argsBlockMatch[1];
    const argRegex = /<(\w+)>(.*?)<\/\w+>/g;
    let match;
    while ((match = argRegex.exec(argsContent)) !== null) {
      const key = match[1];
      const value = match[2];
      if (key && value !== undefined) {
        args[key] = value;
      }
    }
  }

  return { name, args };
}

/**
 * 处理包含函数调用的请求
 * @param body - 请求体
 * @returns 处理后的请求体和是否包含函数调用的标志
 */
function processFunctionCallRequest(body) {
  let hasFunctionCall = false;
  let processedBody = { ...body };

  // 检查是否包含 tools 参数
  if (body.tools && Array.isArray(body.tools) && body.tools.length > 0) {
    hasFunctionCall = true;
    
    // 生成函数调用提示
    const functionPrompt = generateFunctionPrompt(body.tools);
    
    if (functionPrompt) {
      const systemMessage = {
        role: "system",
        content: functionPrompt,
      };

      // 复制消息数组并插入系统消息
      processedBody.messages = [systemMessage, ...body.messages];
      
      // 删除上游不兼容的字段
      delete processedBody.tools;
      delete processedBody.tool_choice;
    }
  }

  return {
    processedBody,
    hasFunctionCall,
    originalTools: body.tools
  };
}

/**
 * 构建函数调用的响应格式
 * @param originalResponse - 原始响应
 * @param functionCall - 解析的函数调用信息
 * @returns 符合 OpenAI 格式的响应
 */
function buildFunctionCallResponse(originalResponse, functionCall) {
  if (!functionCall) {
    return originalResponse;
  }

  // 创建符合 OpenAI 格式的函数调用响应
  const functionCallResponse = {
    ...originalResponse,
    choices: [{
      ...originalResponse.choices[0],
      message: {
        role: 'assistant',
        content: null, // 函数调用时content必须为null
        tool_calls: [{
          id: `call_${Date.now()}`,
          type: "function",
          function: {
            name: functionCall.name,
            arguments: JSON.stringify(functionCall.args)
          }
        }]
      },
      finish_reason: "tool_calls"
    }]
  };

  return functionCallResponse;
}

/**
 * 替换响应中的模型名称（从上游模型名称改回用户请求的模型名称）
 * @param responseData - 响应数据对象
 * @param originalUserModel - 用户原始请求的模型名称
 * @returns 修改后的响应数据
 */
function replaceModelInResponse(responseData, originalUserModel) {
  if (responseData && typeof responseData === 'object') {
    // 处理单个响应对象
    if (responseData.model) {
      responseData.model = originalUserModel;
    }
    
    // 处理choices数组中的模型字段
    if (responseData.choices && Array.isArray(responseData.choices)) {
      responseData.choices.forEach((choice) => {
        if (choice.model) {
          choice.model = originalUserModel;
        }
      });
    }
  }
  
  return responseData;
}

export {
  generateFunctionPrompt,
  parseFunctionCallXml,
  processFunctionCallRequest,
  buildFunctionCallResponse,
  replaceModelInResponse
};
