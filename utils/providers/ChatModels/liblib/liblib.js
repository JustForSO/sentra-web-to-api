import crypto from 'crypto';
import fetch from 'node-fetch';
import { loadProviderEnv } from '../../loadEnv.js';

// 加载当前目录的.env文件
loadProviderEnv(import.meta.url);

class ImageGenerator {
  constructor(token, payload, requestTimeout = 10000) {
    this.token = token;
    this.requestTimeout = requestTimeout;
    this.payload = {
      ...payload,
      frontCustomerReq: {
        ...payload.frontCustomerReq,
        frontId: crypto.randomUUID(),
      },
    };
  }

  generateHeaders() {
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    return {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
      'content-type': 'application/json',
      'priority': 'u=1, i',
      'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Microsoft Edge";v="134"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'token': this.token,
      'Referer': 'https://www.liblib.art/',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'User-Agent': userAgent,
    };
  }

  // 发起图像生成请求
  async generateImage() {
    try {
      console.log('发起图像生成请求...');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

      const response = await fetch('https://bridge.liblib.art/gateway/sd-api/generate/image', {
        method: 'POST',
        headers: this.generateHeaders(),
        body: JSON.stringify(this.payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`图像生成请求失败，状态码: ${response.status}`);
      }

      const result = await response.json();
      if (result.code !== 0) {
        throw new Error(`图像生成失败: ${result.msg || '未知错误'}`);
      }

      const generateId = result.data;
      console.log(`图像生成请求成功，生成 ID: ${generateId}`);
      return generateId;
    } catch (error) {
      console.error('图像生成请求出错:', error.message);
      throw error;
    }
  }

  // 查询图像生成进度（带重试）
  async checkProgress(generateId, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`查询生成进度，生成 ID: ${generateId}，第 ${attempt} 次尝试...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

        const response = await fetch(
          `https://bridge.liblib.art/gateway/sd-api/generate/progress/msg/v3/${generateId}`,
          {
            method: 'POST',
            headers: this.generateHeaders(),
            body: JSON.stringify({ flag: 0 }),
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`进度查询失败，状态码: ${response.status}`);
        }

        const result = await response.json();
        if (result.code !== 0) {
          throw new Error(`进度查询失败: ${result.msg || '未知错误'}`);
        }

        //console.log('进度查询响应:', JSON.stringify(result.data, null, 2));
        return result.data;
      } catch (error) {
        console.error(`进度查询出错 (尝试 ${attempt}/${retries}):`, error.message);
        if (attempt === retries) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  async generate(maxAttempts = 60, pollInterval = 5000) {
    try {
      const generateId = await this.generateImage();
      let attempts = 0;
      while (attempts < maxAttempts) {
        attempts++;
        console.log(`第 ${attempts} 次轮询，剩余尝试次数: ${maxAttempts - attempts}`);
        const progressData = await this.checkProgress(generateId);
        const percentCompleted = progressData.percentCompleted || 0;
        const subStatus = progressData.subStatus;
        const currentSteps = progressData.currentSteps || 0;
        const totalStep = progressData.totalStep || 0;
        console.log(
          `当前进度: ${percentCompleted}%，状态: ${subStatus}，步骤: ${currentSteps}/${totalStep}`
        );
        if (subStatus === 2 || (progressData.images && progressData.images.length > 0)) {
          if (!progressData.images || progressData.images.length === 0) {
            throw new Error('图像生成完成，但未找到图片链接');
          }
          
          // 处理多张图片的情况
          const imageUrls = progressData.images.map(img => img.previewPath).filter(url => url);
          if (imageUrls.length === 0) {
            throw new Error('图像生成完成，但所有图片链接都无效');
          }
          
          console.log(`图像生成成功，共生成 ${imageUrls.length} 张图片`);
          imageUrls.forEach((url, index) => {
            console.log(`图片 ${index + 1}: ${url}`);
          });
          
          return imageUrls;
        }
        if (
          (subStatus !== undefined && subStatus < 0) ||
          (progressData.errorMsg && progressData.errorMsg !== '')
        ) {
          throw new Error(
            `图像生成失败: ${progressData.errorMsg || `状态码 ${subStatus}，无详细错误信息`}`
          );
        }
        console.log('任务仍在进行，继续轮询...');
        await new Promise(resolve => setTimeout(resolve, pollInterval + Math.random() * 500));
      }
      throw new Error('图像生成超时，超过最大尝试次数');
    } catch (error) {
      console.error('生成图像流程失败:', error.message);
      throw error;
    }
  }
}

export async function liblib(messages) {
  // 从环境变量读取配置
  const token = process.env.LIBLIB_TOKEN;
  const checkpointId = process.env.LIBLIB_CHECKPOINT_ID;

  // 生成参数
  const width = parseInt(process.env.LIBLIB_WIDTH || '1024');
  const height = parseInt(process.env.LIBLIB_HEIGHT || '1288');
  const imgCount = parseInt(process.env.LIBLIB_IMG_COUNT || '1');
  const cfgScale = parseFloat(process.env.LIBLIB_CFG_SCALE || '7');
  const seed = parseInt(process.env.LIBLIB_SEED || '-1');
  const seedExtra = parseInt(process.env.LIBLIB_SEED_EXTRA || '0');
  const samplingMethod = parseInt(process.env.LIBLIB_SAMPLING_METHOD || '6');
  const samplingStep = parseInt(process.env.LIBLIB_SAMPLING_STEP || '20');
  const clipSkip = parseInt(process.env.LIBLIB_CLIP_SKIP || '2');
  const randnSource = parseInt(process.env.LIBLIB_RANDN_SOURCE || '1');
  const negativePrompt = process.env.LIBLIB_NEGATIVE_PROMPT || 'ng_deepnegative_v1_75t,(badhandv4:1.2),EasyNegative,(worst quality:2),';
  const refiner = parseInt(process.env.LIBLIB_REFINER || '0');
  const restoreFaces = parseInt(process.env.LIBLIB_RESTORE_FACES || '0');
  const hiResFix = parseInt(process.env.LIBLIB_HIRES_FIX || '0');
  const tiling = parseInt(process.env.LIBLIB_TILING || '0');
  const adetailerEnable = parseInt(process.env.LIBLIB_ADETAILER_ENABLE || '0');
  const taskQueuePriority = parseInt('1');
  const promptMagic = parseInt(process.env.LIBLIB_PROMPT_MAGIC || '0');
  const generateType = parseInt(process.env.LIBLIB_GENERATE_TYPE || '1');
  const maxAttempts = parseInt(process.env.LIBLIB_MAX_ATTEMPTS || '60');
  const pollInterval = parseInt(process.env.LIBLIB_POLL_INTERVAL || '5000');
  const requestTimeout = parseInt(process.env.LIBLIB_REQUEST_TIMEOUT || '10000');
  const extraNetwork = process.env.LIBLIB_EXTRA_NETWORK || '';
  const triggerWords = process.env.LIBLIB_TRIGGER_WORDS || '';

  if (!token) {
    throw new Error('生成失败：未配置LibLib Token，请检查 .env 文件。');
  }

  if (!checkpointId) {
    throw new Error('生成失败：未配置LibLib Checkpoint ID，请检查 .env 文件。');
  }

  const prompt = messages[messages.length - 1].content;

  const payload = {
    checkpointId: checkpointId,
    promptMagic: promptMagic,
    generateType: generateType,
    frontCustomerReq: {
      frontId: '',
      windowId: '',
      tabType: 'txt2img',
      conAndSegAndGen: 'gen',
    },
    originalPrompt: prompt,
    triggerWords: triggerWords,
    text2img: {
      prompt: prompt,
      negativePrompt: negativePrompt,
      extraNetwork: extraNetwork,
      samplingMethod: samplingMethod,
      samplingStep: samplingStep,
      width: width,
      height: height,
      imgCount: imgCount,
      cfgScale: cfgScale,
      seed: seed,
      seedExtra: seedExtra,
      clipSkip: clipSkip,
      randnSource: randnSource,
      refiner: refiner,
      restoreFaces: restoreFaces,
      hiResFix: hiResFix,
      tiling: tiling,
      tileDiffusion: null,
      original_prompt: prompt,
    },
    adetailerEnable: adetailerEnable,
    taskQueuePriority: taskQueuePriority,
  };

  console.log('LibLib配置参数:', {
    checkpointId,
    width,
    height,
    samplingMethod,
    samplingStep,
    cfgScale,
    negativePrompt: negativePrompt.substring(0, 50) + '...',
    maxAttempts,
    pollInterval
  });

  try {
    const generator = new ImageGenerator(token, payload, requestTimeout);
    const imageUrls = await generator.generate(maxAttempts, pollInterval);
    console.log('LibLib图像生成成功:', imageUrls);
    
    // 处理单张或多张图片的返回格式
    if (Array.isArray(imageUrls)) {
      if (imageUrls.length === 1) {
        // 单张图片，直接返回Markdown格式
        return `![LibLib Generated Image](${imageUrls[0]})`;
      } else {
        // 多张图片，返回编号的Markdown格式
        return imageUrls.map((url, index) => 
          `![LibLib Generated Image ${index + 1}](${url})`
        ).join('\n\n');
      }
    } else {
      // 兼容旧版本返回单个URL字符串的情况
      return `![LibLib Generated Image](${imageUrls})`;
    }
  } catch (error) {
    console.error('LibLib图像生成失败:', error.message);
    throw new Error(`LibLib图像生成失败: ${error.message}`);
  }
}